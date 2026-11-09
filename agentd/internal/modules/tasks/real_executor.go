package tasks

import (
	"context"
	"fmt"
	"strings"
	"time"

	coretask "agentd/internal/core/task"
)

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
	task.UpdatedAt = time.Now().UnixMilli()
	m.saveAndEmit(context.Background(), task, "", "")
	m.insertTaskCheckpoint(task, "dispatch")

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

	result, execErr := m.executor.ExecuteTask(context.Background(), request)
	if execErr != nil {
		task.Status = coretask.StatusFailed
		task.Outcome = "failed"
		task.Summary = "任务执行失败：" + execErr.Error()
		task.Progress = 0
		task.UpdatedAt = time.Now().UnixMilli()
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
	if result.Budget {
		task.Status = coretask.StatusBlocked
		task.Outcome = "budget_exceeded"
		task.Summary = result.Summary
		if strings.TrimSpace(task.Summary) == "" {
			task.Summary = "任务超出 token/步数预算，已暂停"
		}
		task.UpdatedAt = time.Now().UnixMilli()
		m.saveAndEmit(context.Background(), task, "", "")
		if task.WorkflowID != "" {
			m.reportWorkflowTaskText(task, coretask.StatusBlocked, task.Summary, result.Report)
			_, _ = m.PauseWorkflow(context.Background(), task.WorkflowID)
		}
		return
	}
	if result.Paused {
		task.Status = coretask.StatusBlocked
		task.Outcome = "paused"
		task.Summary = result.Summary
		if strings.TrimSpace(task.Summary) == "" {
			task.Summary = "任务等待审批/用户输入，已暂停"
		}
		task.UpdatedAt = time.Now().UnixMilli()
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
	task.UpdatedAt = time.Now().UnixMilli()
	m.writeArtifactReport(task, result.Report)
	m.saveAndEmit(context.Background(), task, "", "")
	if task.WorkflowID != "" {
		m.reportWorkflowTaskText(task, coretask.StatusDone, task.Summary, result.Report)
		m.onWorkflowTaskFinished(task)
	}
}
