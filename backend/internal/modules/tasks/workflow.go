package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	coretask "simo/internal/core/task"
)

const (
	workflowDraft     = "draft"
	workflowRunning   = "running"
	workflowPaused    = "paused"
	workflowDone      = "done"
	workflowFailed    = "failed"
	workflowCancelled = "cancelled"

	maxWorkflowTasks       = 12
	maxWorkflowConcurrency = 3
)

var _ coretask.WorkflowService = (*Module)(nil)

func (m *Module) CreateWorkflow(ctx context.Context, input coretask.NewWorkflow) (coretask.Workflow, error) {
	sessionID := strings.TrimSpace(input.SessionID)
	if sessionID == "" {
		return coretask.Workflow{}, fmt.Errorf("工作流缺少 sessionId")
	}
	if len(input.Tasks) == 0 {
		return coretask.Workflow{}, fmt.Errorf("工作流至少需要一个任务")
	}
	if len(input.Tasks) > maxWorkflowTasks {
		return coretask.Workflow{}, fmt.Errorf("单个工作流任务数不能超过 %d", maxWorkflowTasks)
	}
	now := time.Now().UnixMilli()
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "工作流"
	}
	workflow := coretask.Workflow{
		ID:        "wf-" + randomHex(8),
		SessionID: sessionID,
		Title:     title,
		Status:    workflowRunning,
		PlanJSON:  input.PlanJSON,
		CreatedAt: now,
		UpdatedAt: now,
	}
	keys := make(map[string]string, len(input.Tasks))
	for _, spec := range input.Tasks {
		key := strings.TrimSpace(spec.Key)
		if key == "" {
			return coretask.Workflow{}, fmt.Errorf("工作流任务 key 不能为空")
		}
		if _, exists := keys[key]; exists {
			return coretask.Workflow{}, fmt.Errorf("工作流任务 key 重复: %s", key)
		}
		keys[key] = ""
	}
	tasks := make([]coretask.Task, 0, len(input.Tasks))
	for i, spec := range input.Tasks {
		task := coretask.Task{
			ID:         "task-" + randomHex(8),
			SessionID:  sessionID,
			Title:      strings.TrimSpace(spec.Title),
			Kind:       "mock",
			Status:     coretask.StatusPending,
			Payload:    spec.Payload,
			Phases:     defaultPhases(),
			Steps:      defaultSteps(),
			Attempt:    1,
			WorkflowID: workflow.ID,
			OrderIndex: i,
			CreatedAt:  now,
			UpdatedAt:  now,
		}
		if task.Title == "" {
			task.Title = "任务 " + spec.Key
		}
		for _, depKey := range spec.DependsOn {
			depKey = strings.TrimSpace(depKey)
			depID := keys[depKey]
			if depKey == "" || depID == "" {
				return coretask.Workflow{}, fmt.Errorf("任务 %s 依赖不存在: %s", spec.Key, depKey)
			}
			task.DependsOn = append(task.DependsOn, depID)
		}
		keys[spec.Key] = task.ID
		tasks = append(tasks, task)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO workflows(
			id, session_id, title, status, plan_json, summary, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
			workflow.ID, workflow.SessionID, workflow.Title, workflow.Status, workflow.PlanJSON,
			workflow.CreatedAt, workflow.UpdatedAt); err != nil {
			return err
		}
		for _, task := range tasks {
			if err := saveTaskTx(ctx, tx, task); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return coretask.Workflow{}, err
	}
	workflow.Tasks = tasks
	m.emitWorkflow(workflow, eventlog.TypeWorkflowCreated)
	for _, task := range tasks {
		m.emit(ctx, eventlog.TypeTaskCreated, taskEvent(task, "", ""))
		m.emit(ctx, eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
	}
	m.startReadyTasks(workflow.ID)
	return workflow, nil
}

func (m *Module) ListWorkflows(ctx context.Context, sessionID string) ([]coretask.Workflow, error) {
	query := `SELECT id, session_id, title, status, plan_json, summary, created_at, updated_at FROM workflows`
	args := []any{}
	if strings.TrimSpace(sessionID) != "" {
		query += ` WHERE session_id = ?`
		args = append(args, sessionID)
	}
	query += ` ORDER BY created_at DESC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]coretask.Workflow, 0, 4)
	for rows.Next() {
		var wf coretask.Workflow
		if err := rows.Scan(&wf.ID, &wf.SessionID, &wf.Title, &wf.Status, &wf.PlanJSON,
			&wf.Summary, &wf.CreatedAt, &wf.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, wf)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	_ = rows.Close()
	for i := range out {
		tasks, _ := m.workflowTasks(ctx, out[i].ID)
		out[i].Tasks = tasks
		out[i].Progress = workflowProgress(tasks)
	}
	return out, nil
}

func (m *Module) GetWorkflow(ctx context.Context, id string) (coretask.Workflow, error) {
	var wf coretask.Workflow
	err := m.store.QueryRow(ctx, `SELECT id, session_id, title, status, plan_json, summary, created_at, updated_at
		FROM workflows WHERE id = ?`, strings.TrimSpace(id)).
		Scan(&wf.ID, &wf.SessionID, &wf.Title, &wf.Status, &wf.PlanJSON, &wf.Summary, &wf.CreatedAt, &wf.UpdatedAt)
	if err == sql.ErrNoRows {
		return coretask.Workflow{}, ErrNotFound
	}
	if err != nil {
		return coretask.Workflow{}, err
	}
	wf.Tasks, _ = m.workflowTasks(ctx, wf.ID)
	wf.Progress = workflowProgress(wf.Tasks)
	return wf, nil
}

func workflowProgress(tasks []coretask.Task) int {
	if len(tasks) == 0 {
		return 0
	}
	done := 0
	for _, task := range tasks {
		if task.Status == coretask.StatusDone {
			done++
		}
	}
	return done * 100 / len(tasks)
}

func (m *Module) workflowTasks(ctx context.Context, workflowID string) ([]coretask.Task, error) {
	rows, err := m.store.Query(ctx, taskSelect+` WHERE workflow_id = ? ORDER BY order_index ASC, created_at ASC`, workflowID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]coretask.Task, 0, 4)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, task)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	_ = rows.Close()
	for i := range out {
		artifacts, _ := m.ListArtifacts(ctx, out[i].ID)
		out[i].Artifacts = artifacts
	}
	return out, nil
}

func (m *Module) PauseWorkflow(ctx context.Context, id string) (coretask.Workflow, error) {
	wf, err := m.GetWorkflow(ctx, id)
	if err != nil {
		return coretask.Workflow{}, err
	}
	if wf.Status == workflowDone || wf.Status == workflowCancelled || wf.Status == workflowFailed {
		return wf, nil
	}
	if err := m.updateWorkflow(ctx, wf.ID, workflowPaused, ""); err != nil {
		return coretask.Workflow{}, err
	}
	m.reportWorkflowNotice(wf.ID, "工作流已暂停：运行中的任务会跑完，不再启动新任务。")
	return m.GetWorkflow(ctx, wf.ID)
}

func (m *Module) ResumeWorkflow(ctx context.Context, id string) (coretask.Workflow, error) {
	wf, err := m.GetWorkflow(ctx, id)
	if err != nil {
		return coretask.Workflow{}, err
	}
	if wf.Status == workflowCancelled || wf.Status == workflowDone || wf.Status == workflowFailed {
		return wf, nil
	}
	if err := m.updateWorkflow(ctx, wf.ID, workflowRunning, ""); err != nil {
		return coretask.Workflow{}, err
	}
	m.reportWorkflowNotice(wf.ID, "工作流已恢复，继续推进待开始任务。")
	m.startReadyTasks(wf.ID)
	return m.GetWorkflow(ctx, wf.ID)
}

func (m *Module) CancelWorkflow(ctx context.Context, id string) (coretask.Workflow, error) {
	wf, err := m.GetWorkflow(ctx, id)
	if err != nil {
		return coretask.Workflow{}, err
	}
	if err := m.updateWorkflow(ctx, wf.ID, workflowCancelled, "工作流已取消"); err != nil {
		return coretask.Workflow{}, err
	}
	m.reportWorkflowNotice(wf.ID, "工作流已取消，未完成任务不再启动。")
	tasks, _ := m.workflowTasks(ctx, wf.ID)
	for _, task := range tasks {
		switch task.Status {
		case coretask.StatusPending, coretask.StatusBlocked, coretask.StatusQueued:
			task.Status = coretask.StatusCancelled
			task.Outcome = "cancelled"
			task.Summary = "工作流已取消"
			task.UpdatedAt = time.Now().UnixMilli()
			m.saveAndEmit(ctx, task, "", "")
		case coretask.StatusRunning:
			go func(taskID string) { _, _ = m.Cancel(context.Background(), taskID) }(task.ID)
		}
	}
	return m.GetWorkflow(ctx, wf.ID)
}

func (m *Module) MarkWorkflowPartial(ctx context.Context, id, summary string) (coretask.Workflow, error) {
	wf, err := m.GetWorkflow(ctx, id)
	if err != nil {
		return coretask.Workflow{}, err
	}
	if summary == "" {
		summary = "部分完成：预算或执行条件不足，未开始的任务已停止。"
	}
	if err := m.updateWorkflow(ctx, wf.ID, "partial", summary); err != nil {
		return coretask.Workflow{}, err
	}
	tasks, _ := m.workflowTasks(ctx, wf.ID)
	for _, task := range tasks {
		if task.Status == coretask.StatusPending || task.Status == coretask.StatusQueued {
			task.Status = coretask.StatusCancelled
			task.Outcome = "dropped"
			task.Summary = summary
			task.UpdatedAt = time.Now().UnixMilli()
			m.saveAndEmit(ctx, task, "", "")
		}
	}
	return m.GetWorkflow(ctx, wf.ID)
}

func (m *Module) updateWorkflow(ctx context.Context, id, status, summary string) error {
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE workflows SET status = ?, summary = ?, updated_at = ? WHERE id = ?`,
			status, summary, now, id)
		return err
	}); err != nil {
		return err
	}
	wf, err := m.GetWorkflow(ctx, id)
	if err == nil {
		m.emitWorkflow(wf, eventlog.TypeWorkflowUpdated)
	}
	return nil
}

func (m *Module) startReadyTasks(workflowID string) {
	m.wfMu.Lock()
	defer m.wfMu.Unlock()
	wf, err := m.GetWorkflow(context.Background(), workflowID)
	if err != nil || wf.Status != workflowRunning {
		return
	}
	tasks, err := m.workflowTasks(context.Background(), workflowID)
	if err != nil {
		return
	}
	byID := make(map[string]coretask.Task, len(tasks))
	running := 0
	for _, task := range tasks {
		byID[task.ID] = task
		if task.Status == coretask.StatusRunning || task.Status == coretask.StatusQueued {
			running++
		}
	}
	globalRunning := 0
	if rows, err := m.store.Query(context.Background(), `SELECT COUNT(*) FROM tasks WHERE status IN ('running','queued')`); err == nil {
		if rows.Next() {
			_ = rows.Scan(&globalRunning)
		}
		_ = rows.Close()
	}
	workflowLimit := envPositiveInt("SIMO_WORKFLOW_CONCURRENCY", maxWorkflowConcurrency)
	globalLimit := envPositiveInt("SIMO_MAX_CONCURRENCY", maxWorkflowConcurrency)
	slots := workflowLimit - running
	if globalLimit-globalRunning < slots {
		slots = globalLimit - globalRunning
	}
	if slots < 0 {
		slots = 0
	}
	started := 0
	for _, task := range tasks {
		if slots <= 0 || started >= slots {
			break
		}
		if task.Status != coretask.StatusPending {
			continue
		}
		ready := true
		for _, depID := range task.DependsOn {
			dep, ok := byID[depID]
			if !ok || dep.Status != coretask.StatusDone {
				ready = false
				break
			}
		}
		if !ready {
			continue
		}
		task.Status = coretask.StatusQueued
		task.UpdatedAt = time.Now().UnixMilli()
		if err := m.saveTask(context.Background(), task); err != nil {
			continue
		}
		m.emit(context.Background(), eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
		m.startAttempt(task.ID, task.Attempt)
		started++
	}
	m.maybeFinishWorkflow(workflowID, tasks)
}

func (m *Module) maybeFinishWorkflow(workflowID string, previous []coretask.Task) {
	wf, err := m.GetWorkflow(context.Background(), workflowID)
	if err != nil || wf.Status != workflowRunning {
		return
	}
	tasks := wf.Tasks
	if len(tasks) == 0 {
		return
	}
	allTerminal := true
	failed := false
	done := 0
	for _, task := range tasks {
		switch task.Status {
		case coretask.StatusDone:
			done++
		case coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted, coretask.StatusBlocked:
			failed = failed || task.Status == coretask.StatusFailed || task.Status == coretask.StatusBlocked
		default:
			allTerminal = false
		}
	}
	if allTerminal {
		status := workflowDone
		summary := fmt.Sprintf("工作流完成：%d/%d 个任务成功", done, len(tasks))
		if failed {
			status = workflowFailed
			summary = fmt.Sprintf("工作流结束：%d/%d 个任务成功，存在失败", done, len(tasks))
		}
		_ = m.updateWorkflow(context.Background(), workflowID, status, summary)
		if updated, err := m.GetWorkflow(context.Background(), workflowID); err == nil {
			m.emitWorkflow(updated, eventlog.TypeWorkflowDone)
			if status == workflowDone {
				m.reportWorkflowNotice(workflowID, "工作流已完成："+summary)
			} else {
				m.reportWorkflowNotice(workflowID, "工作流结束："+summary)
			}
		}
	}
}

func (m *Module) onWorkflowTaskFinished(task coretask.Task) {
	if task.WorkflowID == "" {
		return
	}
	// 失败/取消的前置任务会把依赖标为 blocked，避免工作流永久停在 running。
	if task.Status == coretask.StatusFailed || task.Status == coretask.StatusCancelled || task.Status == coretask.StatusInterrupted {
		tasks, _ := m.workflowTasks(context.Background(), task.WorkflowID)
		blockedDeps := map[string]bool{task.ID: true}
		for _, candidate := range tasks {
			if candidate.Status != coretask.StatusPending {
				continue
			}
			for _, depID := range candidate.DependsOn {
				if blockedDeps[depID] {
					candidate.Status = coretask.StatusBlocked
					candidate.Outcome = "blocked"
					candidate.Summary = "前置任务失败/取消，任务被阻塞"
					candidate.UpdatedAt = time.Now().UnixMilli()
					_ = m.saveTask(context.Background(), candidate)
					m.emit(context.Background(), eventlog.TypeTaskUpdated, taskEvent(candidate, "", ""))
					blockedDeps[candidate.ID] = true
					break
				}
			}
		}
	}
	m.startReadyTasks(task.WorkflowID)
}

func (m *Module) reportWorkflowTask(task coretask.Task, status, summary string) {
	m.reportWorkflowTaskText(task, status, summary, "")
}

func (m *Module) reportWorkflowTaskText(task coretask.Task, status, summary, natural string) {
	if task.WorkflowID == "" {
		return
	}
	wf, err := m.GetWorkflow(context.Background(), task.WorkflowID)
	if err != nil {
		return
	}
	artifacts, _ := m.ListArtifacts(context.Background(), task.ID)
	var b strings.Builder
	if strings.TrimSpace(natural) != "" {
		b.WriteString(strings.TrimSpace(natural))
	} else {
		b.WriteString("【任务汇报】")
		b.WriteString(task.Title)
		b.WriteString("\n结论：")
		if strings.TrimSpace(summary) == "" {
			b.WriteString("任务已" + status)
		} else {
			b.WriteString(summary)
		}
	}
	if len(artifacts) > 0 {
		hasArtifact := false
		for _, artifact := range artifacts {
			if strings.Contains(b.String(), artifact.Name) {
				hasArtifact = true
				break
			}
		}
		if !hasArtifact {
			b.WriteString("\n系统产物：")
			for i, artifact := range artifacts {
				if i > 0 {
					b.WriteString("、")
				}
				b.WriteString(artifact.Name)
			}
		}
	}
	next := "工作流已完成"
	for _, candidate := range wf.Tasks {
		if candidate.ID == task.ID || candidate.Status == coretask.StatusDone {
			continue
		}
		if candidate.Status == coretask.StatusPending || candidate.Status == coretask.StatusQueued || candidate.Status == coretask.StatusRunning {
			next = candidate.Title
			break
		}
	}
	if !strings.Contains(b.String(), "下一任务") {
		b.WriteString("\n下一任务：")
		b.WriteString(next)
	}
	reportID := "msg-" + randomHex(8)
	task.ReportMessageID = reportID
	task.UpdatedAt = time.Now().UnixMilli()
	_ = m.saveTask(context.Background(), task)
	m.emit(context.Background(), eventlog.TypeTaskReport, map[string]any{
		"reportId": reportID, "taskId": task.ID, "workflowId": task.WorkflowID,
		"sessionId": task.SessionID, "title": task.Title, "status": status,
		"text": b.String(), "artifacts": artifacts,
	})
	m.emit(context.Background(), eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
}

func (m *Module) retryWorkflowTask(task coretask.Task) {
	if task.WorkflowID == "" || task.Attempt >= 3 {
		return
	}
	task.Attempt++
	task.Status = coretask.StatusPending
	task.Progress = 0
	task.Summary = "失败后自动重试"
	task.Phases = resetPhases(task.Phases)
	task.Steps = resetSteps(task.Steps)
	task.UpdatedAt = time.Now().UnixMilli()
	_ = m.saveTask(context.Background(), task)
	m.emit(context.Background(), eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
	m.startReadyTasks(task.WorkflowID)
}

func (m *Module) reportWorkflowNotice(workflowID, text string) {
	wf, err := m.GetWorkflow(context.Background(), workflowID)
	if err != nil {
		return
	}
	reportID := "msg-wf-" + randomHex(8)
	m.emit(context.Background(), eventlog.TypeTaskReport, map[string]any{
		"reportId": reportID, "taskId": "", "workflowId": wf.ID,
		"sessionId": wf.SessionID, "title": wf.Title, "status": wf.Status, "text": text,
	})
}

func (m *Module) emitWorkflow(wf coretask.Workflow, typ string) {
	payload := map[string]any{
		"id": wf.ID, "workflowId": wf.ID, "sessionId": wf.SessionID, "title": wf.Title,
		"status": wf.Status, "summary": wf.Summary, "tasks": wf.Tasks,
	}
	if raw, err := json.Marshal(payload); err == nil {
		_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.ExecContext(context.Background(), `INSERT INTO workflow_events(
				workflow_id, type, payload, created_at) VALUES (?, ?, ?, ?)`,
				wf.ID, typ, string(raw), time.Now().UnixMilli())
			return err
		})
	}
	m.emit(context.Background(), typ, payload)
}

func saveTaskTx(ctx context.Context, tx *sql.Tx, task coretask.Task) error {
	phases, _ := json.Marshal(task.Phases)
	steps, _ := json.Marshal(task.Steps)
	depends, _ := json.Marshal(task.DependsOn)
	_, err := tx.ExecContext(ctx, `INSERT INTO tasks(
		id, session_id, title, kind, status, payload, phases, steps, progress,
		summary, outcome, attempt, workflow_id, depends_on_json, order_index, report_message_id,
		budget_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		task.ID, task.SessionID, task.Title, task.Kind, task.Status, task.Payload,
		string(phases), string(steps), task.Progress, task.Summary, task.Outcome,
		task.Attempt, task.WorkflowID, string(depends), task.OrderIndex, task.ReportMessageID,
		task.BudgetJSON, task.CreatedAt, task.UpdatedAt)
	return err
}
