package tasks

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	coretask "simo/internal/core/task"
	"simo/internal/platform/clock"
)

// taskApprovalReleaser 是 chat 执行器的可选能力：任务确认后放行会话内等待中的审批。
type taskApprovalReleaser interface {
	ReleaseTaskApprovals(ctx context.Context, sessionID string) (int, error)
}

// tracedTaskExecutor 是 chat 执行器的可选能力：把成功的工具调用回传为 action 轨迹。
type tracedTaskExecutor interface {
	ExecuteTaskWithTrace(ctx context.Context, request coretask.ExecutionRequest, onAction func(tool, text string)) (coretask.ExecutionResult, error)
}

// runRealAttempt 是 M10.1 真实执行分支；Mock 模式不设置 executor，仍走 runAttempt 的 Mock 逻辑。
func (m *Module) runRealAttempt(ctx context.Context, id string, attempt int) {
	select {
	case <-time.After(m.StartDelay):
	case <-ctx.Done():
		m.markCancelled(context.Background(), id, "服务关闭，任务取消")
		return
	}
	task, err := m.getTask(context.Background(), id)
	if err != nil || task.Attempt != attempt {
		return
	}
	task.Status = coretask.StatusRunning
	task.Progress = 5
	task.UpdatedAt = clock.NowUnixMilli()
	m.saveAndEmit(context.Background(), task, "", "")
	m.insertTaskCheckpoint(task, "dispatch")
	// 真实执行分支同时维护 task_steps：执行期间有且只有当前步是 running，
	// 确认后续跑时复用原来的 running 步，不再新建。
	m.startRunningStep(context.Background(), task)

	request := coretask.ExecutionRequest{
		Task:        task,
		Description: task.Payload,
		MaxSteps:    8,
		MaxTokens:   12000,
	}
	if task.WorkflowID != "" {
		tasks, _ := m.workflowTasks(context.Background(), task.WorkflowID)
		taskByID := make(map[string]coretask.Task, len(tasks))
		for _, candidate := range tasks {
			taskByID[candidate.ID] = candidate
		}
		for _, depID := range task.DependsOn {
			if dep, ok := taskByID[depID]; ok {
				request.Dependencies = append(request.Dependencies, dep)
			}
		}
	}
	if artifacts, err := m.ListArtifacts(context.Background(), task.ID); err == nil {
		request.Artifacts = artifacts
	}

	onAction := func(tool, text string) {
		m.recordToolAction(context.Background(), task, tool, text)
	}
	var result coretask.ExecutionResult
	var execErr error
	if traced, ok := m.executor.(tracedTaskExecutor); ok {
		result, execErr = traced.ExecuteTaskWithTrace(context.Background(), request, onAction)
	} else {
		result, execErr = m.executor.ExecuteTask(context.Background(), request)
	}
	if execErr != nil {
		task.Status = coretask.StatusFailed
		task.Outcome = "failed"
		reason := failureReason(result, execErr)
		task.FailReason = reason
		task.Summary = "任务执行失败：" + execErr.Error()
		task.Progress = 0
		task.UpdatedAt = clock.NowUnixMilli()
		m.failRunningStep(context.Background(), task, reason)
		m.saveAndEmit(context.Background(), task, "", "")
		if task.WorkflowID != "" {
			if task.Attempt <= 2 {
				m.reportWorkflowTaskText(task, coretask.StatusFailed, task.Summary, "")
				m.retryWorkflowTask(task)
			} else {
				m.reportWorkflowTaskText(task, coretask.StatusFailed, task.Summary, "")
				m.onWorkflowTaskFinished(task)
			}
		}
		return
	}
	// 权限拒绝不终止任务，只记 403 observe 轨迹（CT-CONV-511/512/513）。
	for _, denied := range result.Permissions {
		_, _ = m.recordPermissionDenied(context.Background(), task, "", denied.Tool, denied.Path, denied.Reason)
	}
	if result.Budget {
		// P1-CONV-009：预算耗尽转 resource 等待，不落 blocked，也不结束执行。
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingResource
		task.WaitingSince = clock.NowUnixMilli()
		task.Outcome = "budget_exceeded"
		task.Summary = result.Summary
		if strings.TrimSpace(task.Summary) == "" {
			task.Summary = "任务超出 token/步数预算，已暂停"
		}
		task.UpdatedAt = clock.NowUnixMilli()
		m.saveAndEmit(context.Background(), task, "", "")
		if task.WorkflowID != "" {
			m.reportWorkflowTaskText(task, coretask.StatusBlocked, task.Summary, result.Report)
			_, _ = m.PauseWorkflow(context.Background(), task.WorkflowID)
		}
		return
	}
	if result.Paused {
		// P1-CONV-009：需审批工具挂起转 confirmation 等待。
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingConfirmation
		task.WaitingSince = clock.NowUnixMilli()
		task.Outcome = "paused"
		task.Summary = result.Summary
		if strings.TrimSpace(task.Summary) == "" {
			task.Summary = "任务等待审批/用户输入，已暂停"
		}
		task.UpdatedAt = clock.NowUnixMilli()
		m.saveAndEmit(context.Background(), task, "", "")
		if task.WorkflowID != "" {
			m.reportWorkflowTaskText(task, coretask.StatusBlocked, task.Summary, result.Report)
			_, _ = m.PauseWorkflow(context.Background(), task.WorkflowID)
		}
		return
	}

	task.Status = coretask.StatusDone
	task.Progress = 100
	task.Outcome = "success"
	task.FailReason = ""
	task.Summary = strings.TrimSpace(result.Summary)
	if task.Summary == "" {
		task.Summary = strings.TrimSpace(result.Report)
	}
	if task.Summary == "" {
		task.Summary = fmt.Sprintf("任务完成：%s", task.Title)
	}
	for i := range task.Phases {
		task.Phases[i].Status = "done"
	}
	for i := range task.Steps {
		task.Steps[i].Status = "done"
	}
	task.UpdatedAt = clock.NowUnixMilli()
	m.writeArtifactReport(task, result.Report)
	m.completeConvSteps(context.Background(), task)
	m.saveAndEmit(context.Background(), task, "", "")
	if task.WorkflowID != "" {
		m.reportWorkflowTaskText(task, coretask.StatusDone, task.Summary, result.Report)
		m.onWorkflowTaskFinished(task)
	}
}

// startRunningStep 保证执行期间有且只有当前步是 running：已有 running 步（确认后续跑）
// 保持不动，否则把第一个 pending 步置为 running。
func (m *Module) startRunningStep(ctx context.Context, task coretask.Task) {
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil || len(steps) == 0 {
		return
	}
	for _, step := range steps {
		if step.Status == "running" {
			return
		}
	}
	for i := range steps {
		if steps[i].Status != "pending" {
			continue
		}
		steps[i].Status = "running"
		steps[i].StartedAt = clock.NowUnixMilli()
		if err := m.saveSteps(ctx, task.ID, steps); err != nil {
			return
		}
		_ = m.mirrorSteps(ctx, task.ID)
		m.emitStepEvent(ctx, task, steps[i])
		return
	}
}

// completeConvSteps 在任务成功时把全部步骤置 done，补上真实执行漏写的 task_steps。
func (m *Module) completeConvSteps(ctx context.Context, task coretask.Task) {
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil || len(steps) == 0 {
		return
	}
	now := clock.NowUnixMilli()
	changed := false
	for i := range steps {
		if steps[i].Status == "done" {
			continue
		}
		steps[i].Status = "done"
		steps[i].FailReason = ""
		steps[i].FinishedAt = now
		changed = true
	}
	if !changed {
		return
	}
	if err := m.saveSteps(ctx, task.ID, steps); err != nil {
		return
	}
	_ = m.mirrorSteps(ctx, task.ID)
	for _, step := range steps {
		m.emitStepEvent(ctx, task, step)
	}
}

// failRunningStep 在任务失败时把当前 running 步置 failed，避免步骤永远停在执行中。
func (m *Module) failRunningStep(ctx context.Context, task coretask.Task, reason string) {
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil {
		return
	}
	now := clock.NowUnixMilli()
	for i := range steps {
		if steps[i].Status != "running" {
			continue
		}
		steps[i].Status = "failed"
		steps[i].FailReason = reason
		steps[i].FinishedAt = now
		if err := m.saveSteps(ctx, task.ID, steps); err != nil {
			return
		}
		_ = m.mirrorSteps(ctx, task.ID)
		m.emitStepEvent(ctx, task, steps[i])
		return
	}
}

// recordToolAction 把成功的工具调用写进当前 running 步的 action 轨迹。
func (m *Module) recordToolAction(ctx context.Context, task coretask.Task, tool, text string) {
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil {
		return
	}
	stepID := ""
	for _, step := range steps {
		if step.Status == "running" {
			stepID = step.ID
			break
		}
	}
	_, _ = m.appendTrace(ctx, task, stepID, "action", tool, text)
}

// releaseTaskApprovals 让 chat 执行器把确认前挂起的审批标记为已放行并补会话授权；
// 执行器不支持该能力时静默跳过。
func (m *Module) releaseTaskApprovals(ctx context.Context, task coretask.Task) error {
	releaser, ok := m.executor.(taskApprovalReleaser)
	if !ok {
		return nil
	}
	_, err := releaser.ReleaseTaskApprovals(ctx, task.SessionID)
	return err
}

// failureReason 把任务失败归成三类可区分的原因：工具拒绝带错误码与工具名，
// 超时单独标出，其余归为执行器异常。结果截到 500 字，符合 fail_reason 字段上限。
func failureReason(result coretask.ExecutionResult, err error) string {
	if len(result.Permissions) > 0 {
		denied := result.Permissions[0]
		var b strings.Builder
		b.WriteString("工具拒绝: permission_denied tool=")
		b.WriteString(strings.TrimSpace(denied.Tool))
		if path := strings.TrimSpace(denied.Path); path != "" {
			b.WriteString(" path=")
			b.WriteString(path)
		}
		if reason := strings.TrimSpace(denied.Reason); reason != "" {
			b.WriteString("；")
			b.WriteString(reason)
		}
		if len(result.Permissions) > 1 {
			b.WriteString(fmt.Sprintf("（另有 %d 个工具调用被拒绝）", len(result.Permissions)-1))
		}
		return truncateFailReason(b.String())
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return truncateFailReason("步骤超时: " + err.Error())
	}
	if err == nil {
		return truncateFailReason("执行器异常: 未知错误")
	}
	return truncateFailReason("执行器异常: " + err.Error())
}

// truncateFailReason 按字符数截断失败原因，避免超出 fail_reason 的 500 字上限。
func truncateFailReason(reason string) string {
	reason = strings.TrimSpace(reason)
	runes := []rune(reason)
	if len(runes) > 500 {
		reason = string(runes[:500])
	}
	return reason
}
