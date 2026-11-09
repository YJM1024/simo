package tasks

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"agentd/internal/core/eventlog"
	"agentd/internal/core/module"
	coresession "agentd/internal/core/session"
	"agentd/internal/core/store"
	coretask "agentd/internal/core/task"
	"agentd/internal/platform/workspace"
)

const (
	// Mock 执行器时序：先 queued 3s，再分阶段推进 5s；保持 M2 no-interrupt 语义。
	mockExecutorStartDelay = 3 * time.Second
	mockExecutorDelay      = 5 * time.Second
)

var (
	ErrNotFound         = errors.New("任务不存在")
	ErrArtifactNotFound = errors.New("产物不存在")
	ErrInvalid          = errors.New("参数非法")
)

var _ coretask.Service = (*Module)(nil)
var _ module.Module = (*Module)(nil)

type attemptHandle struct {
	cancel context.CancelFunc
	done   chan struct{}
}

// Module 同时实现 core/module.Module 与 core/task.Service。
type Module struct {
	store   *store.Store
	events  *eventlog.Logger
	log     *slog.Logger
	sandbox *workspace.Policy

	StartDelay time.Duration
	RunDelay   time.Duration

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	sessions coresession.Service

	mu     sync.Mutex
	active map[string]*attemptHandle

	wfMu sync.Mutex

	executor coretask.Executor
}

// SetExecutor 注入真实任务执行器（chat 模块）；nil 时使用 Mock 执行器。
func (m *Module) SetExecutor(executor coretask.Executor) { m.executor = executor }

// New 创建 tasks 模块。
func New(st *store.Store, events *eventlog.Logger, logger *slog.Logger, sandbox *workspace.Policy) *Module {
	return &Module{
		store:      st,
		events:     events,
		log:        logger,
		sandbox:    sandbox,
		StartDelay: mockExecutorStartDelay,
		RunDelay:   mockExecutorDelay,
		active:     make(map[string]*attemptHandle),
	}
}

// SetSessions 注入会话树端口（M6 跨会话 artifact 聚合）。
func (m *Module) SetSessions(sessions coresession.Service) { m.sessions = sessions }

// ID 实现 module.Module。
func (m *Module) ID() string { return "tasks" }

// DependsOn 实现 module.Module。
func (m *Module) DependsOn() []string { return nil }

// Migrations 实现 module.Module。
func (m *Module) Migrations() []module.Migration { return migrations() }

// Register 实现 module.Module。
func (m *Module) Register(mux *http.ServeMux) { m.registerHTTP(mux) }

// Start 实现 module.Module。
func (m *Module) Start(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	m.ctx, m.cancel = context.WithCancel(ctx)
	m.recoverInterrupted()
	m.recoverWorkflows()
	m.log.Debug("module started", "module", m.ID())
	return nil
}

// recoverInterrupted 处理上次进程遗留的 running/queued：不能永久卡 running。
// 统一标记 interrupted，保留已完成阶段；用户可用 retry 新建 attempt。
func (m *Module) recoverInterrupted() {
	rows, err := m.store.Query(context.Background(), taskSelect+` WHERE status IN ('running','queued')`)
	if err != nil {
		m.log.Warn("恢复中断任务查询失败", "err", err)
		return
	}
	tasks := make([]coretask.Task, 0, 4)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			_ = rows.Close()
			m.log.Warn("扫描中断任务失败", "err", err)
			return
		}
		tasks = append(tasks, task)
	}
	_ = rows.Close()
	for _, task := range tasks {
		if task.Status == coretask.StatusQueued {
			continue
		}
		if m.hasTaskCheckpoint(task) && !m.hasUnknownTaskEffect(task) {
			task.Status = coretask.StatusQueued
			task.Outcome = ""
			task.Summary = "服务重启，已从中断点继续"
			task.UpdatedAt = time.Now().UnixMilli()
			m.saveAndEmit(context.Background(), task, "", "")
			m.insertTaskCheckpoint(task, "recovery")
			m.insertRecoveryAction("task", task.ID, "recovered", `{"reason":"checkpoint resume"}`)
			continue
		}
		if m.hasUnknownTaskEffect(task) {
			task.Status = coretask.StatusBlocked
			task.Outcome = "waiting_person"
			task.Summary = "上次工具副作用结果未知，需要人工确认后再重试"
			task.UpdatedAt = time.Now().UnixMilli()
			m.saveAndEmit(context.Background(), task, "", "")
			m.insertRecoveryAction("task", task.ID, "marked_blocked", `{"reason":"unknown tool effect"}`)
			if task.WorkflowID != "" {
				m.reportWorkflowTask(task, coretask.StatusBlocked, "上次执行结果未知，已暂停等待人工确认")
			}
			continue
		}
		task.Status = coretask.StatusInterrupted
		task.Outcome = "interrupted"
		task.Summary = "服务重启，任务中断；可用 retry 新 attempt"
		for i := range task.Phases {
			if task.Phases[i].Status == "running" {
				task.Phases[i].Status = "pending"
			}
		}
		for i := range task.Steps {
			if task.Steps[i].Status == "running" {
				task.Steps[i].Status = "pending"
			}
		}
		task.UpdatedAt = time.Now().UnixMilli()
		m.saveAndEmit(context.Background(), task, "", "")
		m.insertRecoveryAction("task", task.ID, "marked_interrupted", `{"reason":"no checkpoint"}`)
		if task.WorkflowID != "" {
			m.reportWorkflowTask(task, coretask.StatusInterrupted, "服务重启，任务已中断")
		}
	}
	if len(tasks) > 0 {
		m.log.Info("已恢复中断任务", "count", len(tasks))
	}
}

func (m *Module) recoverWorkflows() {
	rows, err := m.store.Query(context.Background(), `SELECT id FROM workflows WHERE status = 'running'`)
	if err != nil {
		return
	}
	ids := make([]string, 0, 4)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	resume := make([]string, 0, 4)
	resumeTasks := make([]coretask.Task, 0, 4)
	for _, id := range ids {
		tasks, taskErr := m.workflowTasks(context.Background(), id)
		if taskErr != nil {
			continue
		}
		hasQueued := false
		hasBlocked := false
		for _, task := range tasks {
			switch task.Status {
			case coretask.StatusQueued:
				hasQueued = true
				resumeTasks = append(resumeTasks, task)
			case coretask.StatusBlocked:
				hasBlocked = true
			}
		}
		if hasQueued {
			m.insertRecoveryAction("workflow", id, "resumed", `{"reason":"checkpoint resume"}`)
			m.reportWorkflowNotice(id, "服务重启，已从中断点继续；已完成任务不会重跑。")
			resume = append(resume, id)
			continue
		}
		if hasBlocked {
			_ = m.updateWorkflow(context.Background(), id, workflowPaused, "存在结果未知的副作用，已暂停等待人工确认")
			m.reportWorkflowNotice(id, "服务重启后发现结果未知的工具副作用，工作流已暂停，请确认后重试。")
			m.insertRecoveryAction("workflow", id, "marked_blocked", `{"reason":"unknown tool effect"}`)
			continue
		}
		_ = m.updateWorkflow(context.Background(), id, workflowPaused, "服务重启，工作流已暂停")
		m.reportWorkflowNotice(id, "服务重启，工作流已暂停；已完成任务保留，可恢复继续。")
		m.insertRecoveryAction("workflow", id, "marked_interrupted", `{"reason":"no resumable task"}`)
	}
	if len(resume) > 0 || len(resumeTasks) > 0 {
		go func(ids []string, tasks []coretask.Task) {
			time.Sleep(600 * time.Millisecond)
			for _, task := range tasks {
				m.startAttempt(task.ID, task.Attempt)
			}
			for _, id := range ids {
				m.startReadyTasks(id)
			}
		}(resume, resumeTasks)
	}
}

// Stop 取消执行器并等待退出。
func (m *Module) Stop(ctx context.Context) error {
	if m.cancel != nil {
		m.cancel()
	}
	m.mu.Lock()
	for _, handle := range m.active {
		handle.cancel()
	}
	m.mu.Unlock()
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		m.log.Debug("module stopped", "module", m.ID())
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Create 实现 core/task.Service：落库 + 发 task.created + 异步分阶段执行。
func (m *Module) Create(ctx context.Context, input coretask.NewTask) (coretask.Task, error) {
	if strings.TrimSpace(input.SessionID) == "" {
		return coretask.Task{}, fmt.Errorf("任务缺少 sessionId")
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "未命名任务"
	}
	kind := strings.TrimSpace(input.Kind)
	if kind == "" {
		kind = "mock"
	}
	now := time.Now().UnixMilli()
	task := coretask.Task{
		ID:        "task-" + randomHex(8),
		SessionID: input.SessionID,
		Title:     title,
		Kind:      kind,
		Status:    coretask.StatusQueued,
		Payload:   input.Payload,
		Phases:    defaultPhases(),
		Steps:     defaultSteps(),
		Progress:  0,
		Attempt:   1,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, fmt.Errorf("创建任务失败: %w", err)
	}
	m.emit(ctx, eventlog.TypeTaskCreated, taskEvent(task, "", ""))
	// 立即补一条 queued 的 task.updated，保证前端/WSE 在 task.created 后能拿到 phases/progress。
	m.emit(ctx, eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
	m.startAttempt(task.ID, task.Attempt)
	return task, nil
}

// List 实现 core/task.Service。
func (m *Module) List(ctx context.Context, sessionID string) ([]coretask.Task, error) {
	query := taskSelect
	args := []any{}
	if strings.TrimSpace(sessionID) != "" {
		query += ` WHERE session_id = ?`
		args = append(args, sessionID)
	}
	query += ` ORDER BY created_at ASC, id ASC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询任务失败: %w", err)
	}
	defer rows.Close()
	out := make([]coretask.Task, 0, 8)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, task)
	}
	return out, rows.Err()
}

// Get 返回任务详情（含 artifacts）。
func (m *Module) Get(ctx context.Context, id string) (coretask.Task, error) {
	task, err := m.getTask(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	artifacts, err := m.ListArtifacts(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	task.Artifacts = artifacts
	return task, nil
}

func (m *Module) getTask(ctx context.Context, id string) (coretask.Task, error) {
	row := m.store.QueryRow(ctx, taskSelect+` WHERE id = ?`, id)
	task, err := scanTask(row)
	if err == sql.ErrNoRows {
		return coretask.Task{}, ErrNotFound
	}
	if err != nil {
		return coretask.Task{}, fmt.Errorf("查询任务失败: %w", err)
	}
	return task, nil
}

// Cancel 停止推进并保留已完成阶段/步骤。
func (m *Module) Cancel(ctx context.Context, id string) (coretask.Task, error) {
	task, err := m.getTask(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	if task.Status == coretask.StatusDone || task.Status == coretask.StatusFailed ||
		task.Status == coretask.StatusCancelled || task.Status == coretask.StatusInterrupted {
		return task, nil
	}
	m.mu.Lock()
	handle := m.active[id]
	m.mu.Unlock()
	if handle != nil {
		handle.cancel()
		select {
		case <-handle.done:
		case <-time.After(5 * time.Second):
		}
	} else {
		m.markCancelled(context.Background(), id, "已取消（无活跃执行器）")
	}
	return m.getTask(ctx, id)
}

// Retry 新建 attempt：重置 phases/steps/progress，task id 不变，artifacts 保留。
func (m *Module) Retry(ctx context.Context, id string) (coretask.Task, error) {
	task, err := m.getTask(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	m.mu.Lock()
	handle := m.active[id]
	m.mu.Unlock()
	if handle != nil {
		handle.cancel()
		select {
		case <-handle.done:
		case <-time.After(5 * time.Second):
		}
	}
	task.Attempt++
	task.Status = coretask.StatusQueued
	task.Progress = 0
	task.Summary = ""
	task.Outcome = ""
	task.Phases = resetPhases(task.Phases)
	task.Steps = resetSteps(task.Steps)
	task.UpdatedAt = time.Now().UnixMilli()
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, err
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, taskEvent(task, "", ""))
	m.startAttempt(task.ID, task.Attempt)
	return m.getTask(ctx, id)
}

func (m *Module) startAttempt(id string, attempt int) {
	ctx := m.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	attemptCtx, cancel := context.WithCancel(ctx)
	handle := &attemptHandle{cancel: cancel, done: make(chan struct{})}
	m.mu.Lock()
	m.active[id] = handle
	m.mu.Unlock()
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		defer close(handle.done)
		defer func() {
			m.mu.Lock()
			if m.active[id] == handle {
				delete(m.active, id)
			}
			m.mu.Unlock()
		}()
		m.runAttempt(attemptCtx, id, attempt)
	}()
}

func (m *Module) runAttempt(ctx context.Context, id string, attempt int) {
	if m.executor != nil {
		m.runRealAttempt(ctx, id, attempt)
		return
	}
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
	task.Progress = 2
	task.UpdatedAt = time.Now().UnixMilli()
	m.saveAndEmit(context.Background(), task, "", "")
	m.insertTaskCheckpoint(task, "dispatch")

	steps := len(task.Steps)
	stepDelay := time.Duration(0)
	if steps > 0 {
		stepDelay = m.RunDelay / time.Duration(steps)
	}
	for i := range task.Steps {
		if ctx.Err() != nil {
			m.markCancelled(context.Background(), id, "已取消，保留已完成阶段")
			return
		}
		step := &task.Steps[i]
		step.Status = "running"
		markPhase(task.Phases, step.PhaseID, "running")
		task.UpdatedAt = time.Now().UnixMilli()
		m.saveAndEmit(context.Background(), task, step.PhaseID, step.ID)
		select {
		case <-time.After(stepDelay):
		case <-ctx.Done():
			m.markCancelled(context.Background(), id, "已取消，保留已完成阶段")
			return
		}
		step.Status = "done"
		if phaseStepsDone(task.Steps, step.PhaseID) {
			markPhase(task.Phases, step.PhaseID, "done")
		}
		task.Progress = 2 + int(float64(i+1)/float64(maxInt(steps, 1))*95)
		if task.Progress > 99 {
			task.Progress = 99
		}
		task.UpdatedAt = time.Now().UnixMilli()
		m.saveAndEmit(context.Background(), task, step.PhaseID, step.ID)
	}

	if strings.Contains(strings.ToLower(task.Title), "mock:fail") {
		task.Status = coretask.StatusFailed
		task.Outcome = "failed"
		task.UpdatedAt = time.Now().UnixMilli()
		if task.Attempt <= 2 {
			task.Summary = "Mock 执行器模拟失败（将自动重试）"
			m.saveAndEmit(context.Background(), task, "", "")
			if task.WorkflowID != "" {
				m.reportWorkflowTask(task, coretask.StatusFailed, task.Summary)
				m.retryWorkflowTask(task)
			}
			return
		}
		task.Summary = "Mock 执行器模拟失败（重试已用尽）"
		m.saveAndEmit(context.Background(), task, "", "")
		if task.WorkflowID != "" {
			m.reportWorkflowTask(task, coretask.StatusFailed, task.Summary)
			m.onWorkflowTaskFinished(task)
		}
		return
	}
	task.Status = coretask.StatusDone
	task.Progress = 100
	task.Outcome = "success"
	task.Summary = "Mock 执行器完成：" + task.Title
	for i := range task.Phases {
		task.Phases[i].Status = "done"
	}
	task.UpdatedAt = time.Now().UnixMilli()
	m.writeArtifact(task)
	m.saveAndEmit(context.Background(), task, "", "")
	if task.WorkflowID != "" {
		m.reportWorkflowTask(task, coretask.StatusDone, task.Summary)
		m.onWorkflowTaskFinished(task)
	}
}

func (m *Module) markCancelled(ctx context.Context, id, summary string) {
	task, err := m.getTask(ctx, id)
	if err != nil || task.Status == coretask.StatusDone || task.Status == coretask.StatusFailed || task.Status == coretask.StatusCancelled {
		return
	}
	task.Status = coretask.StatusCancelled
	task.Outcome = "cancelled"
	task.Summary = summary
	for i := range task.Phases {
		if task.Phases[i].Status == "running" || task.Phases[i].Status == "pending" {
			task.Phases[i].Status = "pending"
		}
	}
	for i := range task.Steps {
		if task.Steps[i].Status == "running" {
			task.Steps[i].Status = "pending"
		}
	}
	task.UpdatedAt = time.Now().UnixMilli()
	m.saveAndEmit(ctx, task, "", "")
	if task.WorkflowID != "" {
		m.reportWorkflowTask(task, coretask.StatusCancelled, summary)
		m.onWorkflowTaskFinished(task)
	}
}

func (m *Module) saveAndEmit(ctx context.Context, task coretask.Task, phaseID, stepID string) {
	if err := m.saveTask(ctx, task); err != nil {
		m.log.Error("保存任务失败", "err", err, "taskId", task.ID)
		return
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, taskEvent(task, phaseID, stepID))
}

func (m *Module) saveTask(ctx context.Context, task coretask.Task) error {
	phases, _ := json.Marshal(task.Phases)
	steps, _ := json.Marshal(task.Steps)
	depends, _ := json.Marshal(task.DependsOn)
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO tasks(
			id, session_id, title, kind, status, payload, phases, steps, progress,
			summary, outcome, attempt, workflow_id, depends_on_json, order_index, report_message_id,
			budget_json, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				title=excluded.title, status=excluded.status, phases=excluded.phases,
				steps=excluded.steps, progress=excluded.progress, summary=excluded.summary,
				outcome=excluded.outcome, attempt=excluded.attempt,
				workflow_id=excluded.workflow_id, depends_on_json=excluded.depends_on_json,
				order_index=excluded.order_index, report_message_id=excluded.report_message_id,
				budget_json=excluded.budget_json, updated_at=excluded.updated_at`,
			task.ID, task.SessionID, task.Title, task.Kind, task.Status, task.Payload,
			string(phases), string(steps), task.Progress, task.Summary, task.Outcome,
			task.Attempt, task.WorkflowID, string(depends), task.OrderIndex, task.ReportMessageID,
			task.BudgetJSON, task.CreatedAt, task.UpdatedAt)
		return err
	})
}

func (m *Module) emit(ctx context.Context, typ string, payload any) {
	if _, err := m.events.Append(ctx, typ, payload); err != nil {
		m.log.Error("写任务事件失败", "err", err, "type", typ)
	}
}

func taskEvent(task coretask.Task, phaseID, stepID string) map[string]any {
	payload := map[string]any{
		"id": task.ID, "sessionId": task.SessionID, "title": task.Title, "status": task.Status,
		"attempt": task.Attempt, "progress": task.Progress,
		"phases": task.Phases, "steps": task.Steps,
		"summary": task.Summary, "outcome": task.Outcome,
		"workflowId": task.WorkflowID, "dependsOn": task.DependsOn,
		"orderIndex": task.OrderIndex, "reportMessageId": task.ReportMessageID,
		"executorAgentId": firstNonEmptyWorkflow(task.ExecutorAgentID, configuredExecutorAgentID()),
		"stateReason":     task.StateReason,
	}
	if phaseID != "" {
		payload["phase"] = phaseID
	}
	if stepID != "" {
		payload["step"] = stepID
	}
	return payload
}

// ---- 默认阶段 ----

func defaultPhases() []coretask.Phase {
	return []coretask.Phase{
		{ID: "plan", Title: "规划", Status: "pending"},
		{ID: "execute", Title: "执行", Status: "pending"},
		{ID: "verify", Title: "验收", Status: "pending"},
	}
}

func defaultSteps() []coretask.Step {
	return []coretask.Step{
		{ID: "collect", PhaseID: "plan", Title: "收集信息", Status: "pending"},
		{ID: "draft", PhaseID: "execute", Title: "产出草稿", Status: "pending"},
		{ID: "finalize", PhaseID: "verify", Title: "整理结果", Status: "pending"},
	}
}

func resetPhases(phases []coretask.Phase) []coretask.Phase {
	if len(phases) == 0 {
		return defaultPhases()
	}
	out := append([]coretask.Phase(nil), phases...)
	for i := range out {
		out[i].Status = "pending"
	}
	return out
}

func resetSteps(steps []coretask.Step) []coretask.Step {
	if len(steps) == 0 {
		return defaultSteps()
	}
	out := append([]coretask.Step(nil), steps...)
	for i := range out {
		out[i].Status = "pending"
	}
	return out
}

func markPhase(phases []coretask.Phase, id, status string) {
	for i := range phases {
		if phases[i].ID == id {
			phases[i].Status = status
			return
		}
	}
}

func phaseStepsDone(steps []coretask.Step, phaseID string) bool {
	found := false
	for _, step := range steps {
		if step.PhaseID != phaseID {
			continue
		}
		found = true
		if step.Status != "done" {
			return false
		}
	}
	return found
}

// ---- 查询辅助 ----

const taskSelect = `SELECT id, session_id, title, kind, status, payload, phases, steps,
	progress, summary, outcome, attempt, workflow_id, depends_on_json, order_index, report_message_id,
	budget_json, created_at, updated_at FROM tasks`

type rowScanner interface {
	Scan(dest ...any) error
}

func scanTask(row rowScanner) (coretask.Task, error) {
	var task coretask.Task
	var phasesJSON, stepsJSON, dependsJSON string
	if err := row.Scan(&task.ID, &task.SessionID, &task.Title, &task.Kind, &task.Status,
		&task.Payload, &phasesJSON, &stepsJSON, &task.Progress, &task.Summary,
		&task.Outcome, &task.Attempt, &task.WorkflowID, &dependsJSON, &task.OrderIndex,
		&task.ReportMessageID, &task.BudgetJSON, &task.CreatedAt, &task.UpdatedAt); err != nil {
		return coretask.Task{}, err
	}
	_ = json.Unmarshal([]byte(phasesJSON), &task.Phases)
	_ = json.Unmarshal([]byte(stepsJSON), &task.Steps)
	_ = json.Unmarshal([]byte(dependsJSON), &task.DependsOn)
	if task.Phases == nil {
		task.Phases = []coretask.Phase{}
	}
	if task.Steps == nil {
		task.Steps = []coretask.Step{}
	}
	if task.DependsOn == nil {
		task.DependsOn = []string{}
	}
	return task, nil
}

// ---- 产物 ----

func (m *Module) writeArtifact(task coretask.Task) {
	m.writeArtifactReport(task, task.Summary)
}

func (m *Module) writeArtifactReport(task coretask.Task, report string) {
	if m.sandbox == nil || strings.TrimSpace(m.sandbox.Artifacts) == "" {
		return
	}
	name := "report-attempt-" + strconv.Itoa(task.Attempt) + ".md"
	rel := filepath.ToSlash(filepath.Join(task.ID, name))
	path, err := m.sandbox.ResolveArtifact(rel)
	if err != nil {
		m.log.Warn("产物路径非法", "err", err, "taskId", task.ID)
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		m.log.Warn("创建产物目录失败", "err", err)
		return
	}
	if strings.TrimSpace(report) == "" {
		report = task.Summary
	}
	content := fmt.Sprintf("# %s\n\n- 状态：%s\n- 进度：%d%%\n- 尝试：%d\n\n%s\n",
		task.Title, task.Status, task.Progress, task.Attempt, report)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		m.log.Warn("写产物失败", "err", err, "taskId", task.ID)
		return
	}
	artifact := coretask.Artifact{
		ID:        "art-" + randomHex(8),
		TaskID:    task.ID,
		Name:      name,
		Mime:      "text/markdown",
		Size:      int64(len(content)),
		CreatedAt: time.Now().UnixMilli(),
	}
	if err := m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			artifact.ID, artifact.TaskID, artifact.Name, rel, artifact.Mime, artifact.Size, artifact.CreatedAt)
		return err
	}); err != nil {
		m.log.Warn("登记产物失败", "err", err)
	}
}

func (m *Module) ListArtifacts(ctx context.Context, taskID string) ([]coretask.Artifact, error) {
	query := `SELECT id, task_id, name, mime, size, created_at FROM task_artifacts`
	args := []any{}
	if strings.TrimSpace(taskID) != "" {
		query += ` WHERE task_id = ?`
		args = append(args, taskID)
	}
	query += ` ORDER BY created_at ASC, id ASC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("查询产物失败: %w", err)
	}
	defer rows.Close()
	out := make([]coretask.Artifact, 0, 4)
	for rows.Next() {
		var artifact coretask.Artifact
		if err := rows.Scan(&artifact.ID, &artifact.TaskID, &artifact.Name, &artifact.Mime, &artifact.Size, &artifact.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, artifact)
	}
	return out, rows.Err()
}

func (m *Module) ListArtifactsBySession(ctx context.Context, sessionID string) ([]coretask.Artifact, error) {
	rows, err := m.store.Query(ctx, `SELECT a.id, a.task_id, a.name, a.mime, a.size, a.created_at
		FROM task_artifacts a LEFT JOIN tasks t ON t.id = a.task_id
		WHERE t.session_id = ? OR a.task_id = ? ORDER BY a.created_at ASC, a.id ASC`,
		sessionID, "session:"+sessionID)
	if err != nil {
		return nil, fmt.Errorf("查询会话产物失败: %w", err)
	}
	defer rows.Close()
	out := make([]coretask.Artifact, 0, 4)
	for rows.Next() {
		var artifact coretask.Artifact
		if err := rows.Scan(&artifact.ID, &artifact.TaskID, &artifact.Name, &artifact.Mime, &artifact.Size, &artifact.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, artifact)
	}
	return out, rows.Err()
}

func (m *Module) ListArtifactsForSession(ctx context.Context, sessionID string, includeChildren bool) ([]coretask.Artifact, error) {
	ids := []string{sessionID}
	if includeChildren && m.sessions != nil {
		descendants, err := m.sessions.DescendantIDs(ctx, sessionID, 16)
		if err != nil {
			return nil, err
		}
		if len(descendants) > 0 {
			ids = descendants
		}
	}
	placeholders := make([]string, len(ids))
	args := make([]any, 0, len(ids)*2)
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}
	synth := make([]string, len(ids))
	for i, id := range ids {
		synth[i] = "?"
		args = append(args, "session:"+id)
	}
	rows, err := m.store.Query(ctx, `SELECT a.id, a.task_id, a.name, a.mime, a.size, a.created_at
		FROM task_artifacts a LEFT JOIN tasks t ON t.id = a.task_id
		WHERE t.session_id IN (`+strings.Join(placeholders, ",")+`)
		   OR a.task_id IN (`+strings.Join(synth, ",")+`)
		ORDER BY a.created_at ASC, a.id ASC`, args...)
	if err != nil {
		return nil, fmt.Errorf("查询会话产物失败: %w", err)
	}
	defer rows.Close()
	out := make([]coretask.Artifact, 0, 4)
	for rows.Next() {
		var artifact coretask.Artifact
		if err := rows.Scan(&artifact.ID, &artifact.TaskID, &artifact.Name, &artifact.Mime, &artifact.Size, &artifact.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, artifact)
	}
	return out, rows.Err()
}

func (m *Module) getArtifact(ctx context.Context, id string) (coretask.Artifact, string, error) {
	var artifact coretask.Artifact
	var relPath string
	err := m.store.QueryRow(ctx, `SELECT id, task_id, name, mime, size, created_at, rel_path FROM task_artifacts WHERE id = ?`, id).
		Scan(&artifact.ID, &artifact.TaskID, &artifact.Name, &artifact.Mime, &artifact.Size, &artifact.CreatedAt, &relPath)
	if err == sql.ErrNoRows {
		return coretask.Artifact{}, "", ErrArtifactNotFound
	}
	if err != nil {
		return coretask.Artifact{}, "", err
	}
	return artifact, relPath, nil
}

func (m *Module) artifactPath(relPath string) (string, error) {
	if m.sandbox == nil {
		return "", workspace.ErrEscape
	}
	return m.sandbox.ResolveArtifact(relPath)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%x", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}
