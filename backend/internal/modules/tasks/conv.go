package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	coretask "simo/internal/core/task"
	"simo/internal/platform/clock"
)

// P1-CONV-009：任务会话化（创建/列表/详情/取消/重试/确认/恢复/图/交付物）。
// 存储态 8 个，展示态 4 个；等待三类，无系统执行超时。

const (
	WaitingDependency   = "dependency"
	WaitingConfirmation = "confirmation"
	WaitingResource     = "resource"

	maxBatchTasks     = 12
	maxListLimit      = 100
	defaultListLimit  = 50
	maxTraceLimit     = 500
	defaultTraceLimit = 200
	maxTitleLen       = 120
	maxGoalLen        = 2000
	maxListItems      = 20
	maxListItemLen    = 500
	maxPlanSteps      = 50
	maxStepTitleLen   = 200
)

// ConvError 是带 HTTP 状态与错误码的领域错误。
type ConvError struct {
	Status  int
	Code    string
	Message string
	Extra   map[string]any
}

func (e *ConvError) Error() string { return e.Message }

func newConvError(status int, code, message string) *ConvError {
	return &ConvError{Status: status, Code: code, Message: message}
}

func errTaskNotFound() *ConvError {
	return newConvError(404, "task_not_found", "任务不存在")
}

func errStateConflict(status string) *ConvError {
	e := newConvError(409, "task_state_conflict", "任务当前状态不允许该操作")
	e.Extra = map[string]any{"currentStatus": status, "displayStatus": displayStatus(status)}
	return e
}

// ConvStep 是 task_steps 的一行。
type ConvStep struct {
	ID         string `json:"id"`
	TaskID     string `json:"taskId"`
	Seq        int    `json:"seq"`
	Title      string `json:"title"`
	Status     string `json:"status"`
	Summary    string `json:"summary,omitempty"`
	FailReason string `json:"failReason,omitempty"`
	StartedAt  int64  `json:"startedAt,omitempty"`
	FinishedAt int64  `json:"finishedAt,omitempty"`
	TraceCount int    `json:"traceCount"`
}

// ConvTrace 是 task_traces 的一行。
type ConvTrace struct {
	ID       string `json:"id"`
	TaskID   string `json:"taskId"`
	StepID   string `json:"stepId,omitempty"`
	Seq      int    `json:"seq"`
	Category string `json:"category"`
	Tool     string `json:"tool,omitempty"`
	Text     string `json:"text"`
	At       int64  `json:"at"`
}

// BatchTaskInput / BatchCreateInput / BatchCreateResult 与 coretask 共用同一套字段，
// 这样 chat 模块的 DELEGATE 可以直接走 coretask.BatchCreator 而不 import 本模块。
type BatchTaskInput = coretask.BatchTaskInput

type BatchCreateInput = coretask.BatchCreateInput

type BatchCreateResult = coretask.BatchCreateResult

// BatchCreator 由 tasks 模块实现，chat 的 DELEGATE 通过端口调用。
var _ coretask.BatchCreator = (*Module)(nil)

func displayStatus(status string) string {
	switch status {
	case coretask.StatusRunning:
		return "running"
	case coretask.StatusDone:
		return "done"
	case coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted:
		return "failed"
	default:
		return "pending"
	}
}

func isTerminalStatus(status string) bool {
	switch status {
	case coretask.StatusDone, coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted:
		return true
	}
	return false
}

// allowedTransitions 是 11 条合法迁移。
var allowedTransitions = map[string]map[string]bool{
	coretask.StatusPending: {
		coretask.StatusQueued:    true,
		coretask.StatusCancelled: true,
	},
	coretask.StatusQueued: {
		coretask.StatusRunning:   true,
		coretask.StatusCancelled: true,
	},
	coretask.StatusRunning: {
		coretask.StatusRunning:   true, // 仅允许改 waiting_reason
		coretask.StatusDone:      true,
		coretask.StatusFailed:    true,
		coretask.StatusCancelled: true,
	},
	coretask.StatusFailed:      {coretask.StatusQueued: true},
	coretask.StatusCancelled:   {coretask.StatusQueued: true},
	coretask.StatusInterrupted: {coretask.StatusQueued: true},
}

func canTransition(from, to string) bool {
	if from == to {
		return from == coretask.StatusRunning
	}
	targets, ok := allowedTransitions[from]
	if !ok {
		return false
	}
	return targets[to]
}

// ---- 步骤与轨迹存储 ----

func (m *Module) loadSteps(ctx context.Context, taskID string) ([]ConvStep, error) {
	rows, err := m.store.Query(ctx, `SELECT id, task_id, seq, title, status, summary, fail_reason, started_at, finished_at
		FROM task_steps WHERE task_id = ? ORDER BY seq ASC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ConvStep, 0, 8)
	for rows.Next() {
		var s ConvStep
		if err := rows.Scan(&s.ID, &s.TaskID, &s.Seq, &s.Title, &s.Status, &s.Summary,
			&s.FailReason, &s.StartedAt, &s.FinishedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// N3：每步补 traceCount（该步骤下已记录的轨迹条数）。
	countRows, err := m.store.Query(ctx, `SELECT step_id, COUNT(*) FROM task_traces
		WHERE task_id = ? AND step_id <> '' GROUP BY step_id`, taskID)
	if err != nil {
		return nil, err
	}
	defer countRows.Close()
	counts := map[string]int{}
	for countRows.Next() {
		var stepID string
		var n int
		if err := countRows.Scan(&stepID, &n); err != nil {
			return nil, err
		}
		counts[stepID] = n
	}
	if err := countRows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		out[i].TraceCount = counts[out[i].ID]
	}
	return out, nil
}

func replaceSteps(ctx context.Context, tx *sql.Tx, taskID string, steps []ConvStep) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM task_steps WHERE task_id = ?`, taskID); err != nil {
		return err
	}
	for i, step := range steps {
		if _, err := tx.ExecContext(ctx, `INSERT INTO task_steps
			(id, task_id, seq, title, status, summary, fail_reason, started_at, finished_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			step.ID, taskID, i+1, step.Title, step.Status, step.Summary, step.FailReason,
			step.StartedAt, step.FinishedAt); err != nil {
			return err
		}
	}
	return nil
}

func (m *Module) saveSteps(ctx context.Context, taskID string, steps []ConvStep) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		return replaceSteps(ctx, tx, taskID, steps)
	})
}

func normalizeStepStatus(status string) string {
	switch status {
	case "pending", "running", "done", "failed", "skipped":
		return status
	default:
		return "pending"
	}
}

// mirrorSteps 把 task_steps 投影回 tasks.steps JSON（旧客户端兼容）。
func (m *Module) mirrorSteps(ctx context.Context, taskID string) error {
	steps, err := m.loadSteps(ctx, taskID)
	if err != nil {
		return err
	}
	legacy := make([]coretask.Step, 0, len(steps))
	for _, s := range steps {
		legacy = append(legacy, coretask.Step{ID: s.ID, Title: s.Title, Status: s.Status})
	}
	payload, _ := json.Marshal(legacy)
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE tasks SET steps = ? WHERE id = ?`, string(payload), taskID)
		return err
	})
}

// syncStepsFromTask 把内存里的步骤状态回写 task_steps（按 seq 顺序逐项对齐）。
// mock 执行器只改 tasks.steps 这份兼容 JSON，不写规范化步骤表；这里补上同步，
// 保证详情接口能观察到步骤推进。任务没有规范化步骤行时不做任何事，旧任务不受影响。
func (m *Module) syncStepsFromTask(ctx context.Context, task coretask.Task) error {
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil || len(steps) == 0 || len(task.Steps) == 0 {
		return err
	}
	n := len(steps)
	if len(task.Steps) < n {
		n = len(task.Steps)
	}
	now := time.Now().UnixMilli()
	changed := false
	for i := 0; i < n; i++ {
		status := normalizeStepStatus(task.Steps[i].Status)
		if steps[i].Status == status {
			continue
		}
		steps[i].Status = status
		switch status {
		case "running":
			if steps[i].StartedAt == 0 {
				steps[i].StartedAt = now
			}
		case "done", "failed", "skipped":
			if steps[i].FinishedAt == 0 {
				steps[i].FinishedAt = now
			}
		}
		changed = true
	}
	if !changed {
		return nil
	}
	return m.saveSteps(ctx, task.ID, steps)
}

func (m *Module) nextTraceSeq(ctx context.Context, taskID string) (int, error) {
	var seq int
	err := m.store.QueryRow(ctx, `SELECT COALESCE(MAX(seq), 0) FROM task_traces WHERE task_id = ?`, taskID).Scan(&seq)
	if err != nil {
		return 0, err
	}
	return seq + 1, nil
}

// appendTrace 写一条轨迹并落 task.trace 事件；text 超出 200 字被截断的事件版本。
func (m *Module) appendTrace(ctx context.Context, task coretask.Task, stepID, category, tool, text string) (ConvTrace, error) {
	seq, err := m.nextTraceSeq(ctx, task.ID)
	if err != nil {
		return ConvTrace{}, err
	}
	trace := ConvTrace{
		ID:       "tr-" + randomHex(8),
		TaskID:   task.ID,
		StepID:   stepID,
		Seq:      seq,
		Category: category,
		Tool:     tool,
		Text:     text,
		At:       time.Now().UnixMilli(),
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO task_traces(id, task_id, step_id, seq, category, tool, text, at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			trace.ID, trace.TaskID, trace.StepID, trace.Seq, trace.Category, trace.Tool, trace.Text, trace.At)
		return err
	}); err != nil {
		return ConvTrace{}, err
	}
	eventText := trace.Text
	if len([]rune(eventText)) > 200 {
		eventText = string([]rune(eventText)[:200])
	}
	m.emit(ctx, eventlog.TypeTaskTrace, map[string]any{
		"taskId": task.ID, "sessionId": task.SessionID, "traceId": trace.ID,
		"stepId": trace.StepID, "seq": trace.Seq, "category": trace.Category,
		"tool": trace.Tool, "text": eventText, "at": trace.At,
		"displayStatus": displayStatus(task.Status),
	})
	return trace, nil
}

// emitStepEvent 发一条 task.step，step 只带展示需要的字段。
func (m *Module) emitStepEvent(ctx context.Context, task coretask.Task, step ConvStep) {
	m.emit(ctx, eventlog.TypeTaskStep, map[string]any{
		"taskId": task.ID, "sessionId": task.SessionID, "stepId": step.ID,
		"seq": step.Seq, "title": step.Title, "status": step.Status,
		"summary": step.Summary, "failReason": step.FailReason,
		"startedAt": step.StartedAt, "finishedAt": step.FinishedAt,
		"traceCount":    step.TraceCount,
		"displayStatus": displayStatus(task.Status),
	})
}

// recordPermissionDenied 记一条 403 轨迹（路径越界/工具白名单/禁网/禁子进程）。
func (m *Module) recordPermissionDenied(ctx context.Context, task coretask.Task, stepID, tool, path, reason string) (ConvTrace, error) {
	detail := strings.TrimSpace(reason)
	text := fmt.Sprintf("403 permission_denied: %s", detail)
	if tool != "" {
		text += " tool=" + tool
	}
	if path != "" {
		text += " path=" + path
	}
	return m.appendTrace(ctx, task, stepID, "observe", tool, text)
}

func (m *Module) loadTraces(ctx context.Context, taskID string, limit int, before int) ([]ConvTrace, bool, error) {
	if limit <= 0 || limit > maxTraceLimit {
		limit = defaultTraceLimit
	}
	query := `SELECT id, task_id, step_id, seq, category, tool, text, at FROM task_traces WHERE task_id = ?`
	args := []any{taskID}
	if before > 0 {
		query += ` AND seq < ?`
		args = append(args, before)
	}
	query += ` ORDER BY seq DESC LIMIT ?`
	args = append(args, limit+1)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := make([]ConvTrace, 0, limit)
	for rows.Next() {
		var t ConvTrace
		if err := rows.Scan(&t.ID, &t.TaskID, &t.StepID, &t.Seq, &t.Category, &t.Tool, &t.Text, &t.At); err != nil {
			return nil, false, err
		}
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}
	// 返回 seq 升序，前端直接追加。
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, hasMore, nil
}

// ---- 校验 ----

func validateMode(mode string) (string, error) {
	mode = strings.TrimSpace(mode)
	if mode == "" {
		return "plan", nil
	}
	switch mode {
	case "plan", "react", "explore":
		return mode, nil
	}
	return "", newConvError(400, "invalid_task_mode", "mode 只能是 plan、react 或 explore")
}

func normalizeStringList(values []string, field string) ([]string, error) {
	if len(values) > maxListItems {
		return nil, newConvError(413, "task_context_too_large", field+" 最多 20 条")
	}
	out := make([]string, 0, len(values))
	total := 0
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if len([]rune(value)) > maxListItemLen {
			return nil, newConvError(413, "task_context_too_large", field+" 单条不能超过 500 字")
		}
		total += len([]rune(value))
		out = append(out, value)
	}
	if total > maxGoalLen*10 {
		return nil, newConvError(413, "task_context_too_large", field+" 总量过大")
	}
	return out, nil
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

// validateBatchInput 校验整批输入，返回规范化后的任务输入。
func validateBatchInput(input BatchCreateInput) (string, BatchCreateInput, error) {
	mode, err := validateMode(input.Mode)
	if err != nil {
		return "", input, err
	}
	input.Mode = mode
	input.Goal = strings.TrimSpace(input.Goal)
	if len([]rune(input.Goal)) > maxGoalLen {
		return "", input, newConvError(413, "task_context_too_large", "goal 不能超过 2000 字")
	}
	if input.Inputs, err = normalizeStringList(input.Inputs, "inputs"); err != nil {
		return "", input, err
	}
	if input.Constraints, err = normalizeStringList(input.Constraints, "constraints"); err != nil {
		return "", input, err
	}
	if strings.TrimSpace(input.ClientMutationID) != "" && len(input.ClientMutationID) > 64 {
		return "", input, newConvError(413, "task_context_too_large", "clientMutationId 不能超过 64 字符")
	}
	if len(input.Tasks) == 0 && strings.TrimSpace(input.Title) != "" {
		// 兼容旧式单任务请求体。
		input.Tasks = []BatchTaskInput{{
			Key: "t1", Title: input.Title, Payload: input.Payload,
			Mode: input.Mode, Goal: input.Goal, Inputs: input.Inputs, Constraints: input.Constraints,
		}}
	}
	if len(input.Tasks) == 0 {
		return "", input, newConvError(400, "invalid_task_mode", "至少需要一个任务")
	}
	if len(input.Tasks) > maxBatchTasks {
		return "", input, newConvError(400, "task_batch_too_large", "一次最多创建 12 个任务")
	}
	seen := make(map[string]bool, len(input.Tasks))
	for i := range input.Tasks {
		task := &input.Tasks[i]
		task.Title = strings.TrimSpace(task.Title)
		if task.Title == "" {
			return "", input, newConvError(400, "invalid_task_mode", "任务标题不能为空")
		}
		if len([]rune(task.Title)) > maxTitleLen {
			task.Title = truncateRunes(task.Title, maxTitleLen)
		}
		taskMode, err := validateMode(firstNonEmptyWorkflow(task.Mode, input.Mode))
		if err != nil {
			return "", input, err
		}
		task.Mode = taskMode
		task.Goal = strings.TrimSpace(firstNonEmptyWorkflow(task.Goal, input.Goal))
		if len([]rune(task.Goal)) > maxGoalLen {
			return "", input, newConvError(413, "task_context_too_large", "goal 不能超过 2000 字")
		}
		if task.Inputs, err = normalizeStringList(task.Inputs, "inputs"); err != nil {
			return "", input, err
		}
		if len(task.Inputs) == 0 {
			task.Inputs = append([]string(nil), input.Inputs...)
		}
		if task.Constraints, err = normalizeStringList(task.Constraints, "constraints"); err != nil {
			return "", input, err
		}
		if len(task.Constraints) == 0 {
			task.Constraints = append([]string(nil), input.Constraints...)
		}
		if len(task.Steps) > maxPlanSteps {
			return "", input, newConvError(400, "invalid_task_mode", "plan 模式最多 50 步")
		}
		cleaned := make([]string, 0, len(task.Steps))
		for _, step := range task.Steps {
			step = strings.TrimSpace(step)
			if step == "" {
				continue
			}
			cleaned = append(cleaned, truncateRunes(step, maxStepTitleLen))
		}
		task.Steps = cleaned
		if task.JoinMode == "" {
			task.JoinMode = "all"
		}
		switch task.JoinMode {
		case "all", "any", "each", "first":
		default:
			return "", input, newConvError(400, "invalid_task_dependency", "joinMode 只能是 all/any/each/first")
		}
		key := task.Key
		if key == "" {
			key = "t" + strconv.Itoa(i+1)
		}
		if seen[key] {
			return "", input, newConvError(400, "invalid_task_dependency", "任务 key 重复")
		}
		seen[key] = true
		task.Key = key
	}
	// 依赖必须指向本批内已声明的 key。
	for i := range input.Tasks {
		task := &input.Tasks[i]
		for j := range task.DependsOn {
			dep := strings.TrimSpace(task.DependsOn[j])
			task.DependsOn[j] = dep
			if !seen[dep] {
				return "", input, newConvError(400, "invalid_task_dependency", "依赖的任务不在本批次内")
			}
			if dep == task.Key {
				return "", input, newConvError(400, "invalid_task_dependency", "任务不能依赖自身")
			}
		}
	}
	// 依赖环检测：Kahn 拓扑排序，剩余节点即环。
	indegree := make(map[string]int, len(input.Tasks))
	adj := make(map[string][]string, len(input.Tasks))
	for _, task := range input.Tasks {
		indegree[task.Key] = len(task.DependsOn)
		for _, dep := range task.DependsOn {
			adj[dep] = append(adj[dep], task.Key)
		}
	}
	queue := make([]string, 0, len(input.Tasks))
	for key, n := range indegree {
		if n == 0 {
			queue = append(queue, key)
		}
	}
	visited := 0
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		visited++
		for _, next := range adj[current] {
			indegree[next]--
			if indegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}
	if visited != len(input.Tasks) {
		return "", input, newConvError(400, "invalid_task_dependency", "任务依赖存在环")
	}
	return input.Mode, input, nil
}

// ---- 创建 ----

// CreateBatch 事务内写 batch/tasks/deps/steps，随后发事件与卡片消息。
func (m *Module) CreateBatch(ctx context.Context, sessionID string, input BatchCreateInput) (BatchCreateResult, error) {
	if strings.TrimSpace(sessionID) == "" {
		return BatchCreateResult{}, newConvError(404, "task_not_found", "会话不存在")
	}
	_, normalized, err := validateBatchInput(input)
	if err != nil {
		return BatchCreateResult{}, err
	}
	input = normalized

	if input.ClientMutationID != "" {
		var batchID string
		err := m.store.QueryRow(ctx, `SELECT id FROM task_batches WHERE session_id = ? AND client_mutation_id = ?`,
			sessionID, input.ClientMutationID).Scan(&batchID)
		if err == nil {
			tasks, listErr := m.tasksByBatch(ctx, batchID)
			if listErr != nil {
				return BatchCreateResult{}, listErr
			}
			counts, _ := m.sessionTaskCounts(ctx, sessionID)
			var messageID string
			_ = m.store.QueryRow(ctx, `SELECT message_id FROM task_batches WHERE id = ?`, batchID).Scan(&messageID)
			return BatchCreateResult{BatchID: batchID, Tasks: tasks, MessageID: messageID,
				Counts: counts, Idempotent: true, Total: len(tasks)}, nil
		}
		if err != sql.ErrNoRows {
			return BatchCreateResult{}, fmt.Errorf("查询幂等记录失败: %w", err)
		}
	}

	now := time.Now().UnixMilli()
	batchID := "batch-" + randomHex(8)
	kind := strings.TrimSpace(input.Kind)
	if kind == "" {
		kind = "mock"
	}
	keyToID := make(map[string]string, len(input.Tasks))
	for _, task := range input.Tasks {
		keyToID[task.Key] = "task-" + randomHex(8)
	}
	built := make([]coretask.Task, 0, len(input.Tasks))
	for _, raw := range input.Tasks {
		task := coretask.Task{
			ID:          keyToID[raw.Key],
			SessionID:   sessionID,
			Title:       raw.Title,
			Kind:        kind,
			Status:      coretask.StatusPending,
			Payload:     firstNonEmptyWorkflow(raw.Payload, raw.Goal, raw.Title),
			Phases:      defaultPhases(),
			Progress:    0,
			Attempt:     1,
			OrderIndex:  len(built),
			Mode:        raw.Mode,
			BatchID:     batchID,
			Goal:        raw.Goal,
			Inputs:      raw.Inputs,
			Constraints: raw.Constraints,
			DeadlineAt:  raw.DeadlineAt,
			BudgetJSON:  m.newBudgetJSON(),
			CreatedAt:   now,
			UpdatedAt:   now,
			Complexity:  input.Complexity,
		}
		if task.Mode == "plan" {
			template := defaultSteps()
			steps := make([]ConvStep, 0, len(template))
			titles := raw.Steps
			if len(titles) == 0 {
				for _, step := range template {
					titles = append(titles, step.Title)
				}
			}
			for i, title := range titles {
				steps = append(steps, ConvStep{
					ID:     "step-" + randomHex(8),
					TaskID: task.ID,
					Seq:    i + 1,
					Title:  title,
					Status: "pending",
				})
			}
			task.Steps = make([]coretask.Step, 0, len(steps))
			for _, step := range steps {
				task.Steps = append(task.Steps, coretask.Step{ID: step.ID, Title: step.Title, Status: step.Status})
			}
		} else {
			task.Steps = defaultSteps()
		}
		built = append(built, task)
	}

	var messageID string
	messageText := "已创建 " + strconv.Itoa(len(built)) + " 个任务"
	if len(built) == 1 {
		messageText = built[0].Title
	}
	messageID = "msg-" + randomHex(8)

	err = m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO task_batches
			(id, session_id, client_mutation_id, task_count, message_id, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
			batchID, sessionID, input.ClientMutationID, len(built), messageID, now); err != nil {
			return err
		}
		for i := range built {
			task := built[i]
			if err := saveTaskConvTx(ctx, tx, task); err != nil {
				return err
			}
			steps := make([]ConvStep, 0, len(task.Steps))
			for j, step := range task.Steps {
				steps = append(steps, ConvStep{ID: step.ID, TaskID: task.ID, Seq: j + 1, Title: step.Title, Status: step.Status})
			}
			if err := replaceSteps(ctx, tx, task.ID, steps); err != nil {
				return err
			}
			for _, dep := range input.Tasks[i].DependsOn {
				depID := keyToID[strings.TrimSpace(dep)]
				if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO task_deps(task_id, dep_id, join_mode, created_at)
					VALUES (?, ?, ?, ?)`, task.ID, depID, input.Tasks[i].JoinMode, now); err != nil {
					return err
				}
			}
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO messages
			(id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id, finished_at, internal, batch_id)
			VALUES (?, ?, 'agent', ?, ?, 'done', ?, '', '', '', 'task', '', ?, 0, ?)`,
			messageID, sessionID, messageText, now, built[0].ID, now, batchID)
		return err
	})
	if err != nil {
		return BatchCreateResult{}, fmt.Errorf("创建任务失败: %w", err)
	}

	// 任务目录随任务行落库后立即建好：批量创建是 chat DELEGATE 的唯一入口，
	// 执行器与内部报告都按 code/data/output/_internal 四个区域写盘。
	for i := range built {
		m.ensureTaskDirs(ctx, sessionID, built[i].ID)
	}

	// 事件顺序：全部 task.created 按 orderIndex，再逐步 task.step，最后 message.created。
	for i := range built {
		m.emit(ctx, eventlog.TypeTaskCreated, m.taskEventV2(built[i], nil))
	}
	for i := range built {
		steps, _ := m.loadSteps(ctx, built[i].ID)
		for _, step := range steps {
			m.emitStepEvent(ctx, built[i], step)
		}
	}
	m.emit(ctx, eventlog.TypeMessageCreated, map[string]any{
		"id": messageID, "messageId": messageID, "sessionId": sessionID,
		"role": "agent", "text": messageText, "category": "task",
		"taskId": built[0].ID, "batchId": batchID, "taskCount": len(built), "at": now, "status": "done",
	})

	// 依赖不满足的任务进入 dependency 等待；其余入队执行。
	for i := range built {
		m.afterCreate(ctx, built[i], input.Tasks[i].DependsOn, keyToID)
	}
	tasks, err := m.tasksByBatch(ctx, batchID)
	if err != nil {
		return BatchCreateResult{}, err
	}
	counts, _ := m.sessionTaskCounts(ctx, sessionID)
	return BatchCreateResult{BatchID: batchID, Tasks: tasks, MessageID: messageID,
		Counts: counts, Total: len(tasks)}, nil
}

func (m *Module) afterCreate(ctx context.Context, task coretask.Task, deps []string, keyToID map[string]string) {
	if len(deps) > 0 {
		for _, dep := range deps {
			depID := keyToID[strings.TrimSpace(dep)]
			depTask, err := m.getTask(ctx, depID)
			if err != nil {
				continue
			}
			if depTask.Status != coretask.StatusDone {
				m.enterWaiting(ctx, task.ID, WaitingDependency)
				return
			}
		}
	}
	m.startAttempt(task.ID, task.Attempt)
}

// enterWaiting 写 waiting_reason/waiting_since 并按 displayStatus 发 task.updated。
func (m *Module) enterWaiting(ctx context.Context, taskID, reason string) {
	task, err := m.getTask(ctx, taskID)
	if err != nil {
		return
	}
	if task.WaitingReason == reason {
		return
	}
	task.WaitingReason = reason
	task.WaitingSince = time.Now().UnixMilli()
	task.UpdatedAt = task.WaitingSince
	if err := m.saveTask(ctx, task); err != nil {
		m.log.Error("保存等待状态失败", "err", err, "taskId", taskID)
		return
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status", "waitingReason"}))
}

func (m *Module) leaveWaiting(ctx context.Context, taskID string) (coretask.Task, error) {
	task, err := m.getTask(ctx, taskID)
	if err != nil {
		return coretask.Task{}, err
	}
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.UpdatedAt = time.Now().UnixMilli()
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, err
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"waitingReason"}))
	return task, nil
}

func (m *Module) tasksByBatch(ctx context.Context, batchID string) ([]coretask.Task, error) {
	rows, err := m.store.Query(ctx, taskSelect+` WHERE batch_id = ? ORDER BY order_index ASC, id ASC`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]coretask.Task, 0, 8)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		decorateTask(&task)
		out = append(out, task)
	}
	return out, rows.Err()
}

// sessionTaskCounts 统计会话内全部任务（按展示态）。
func (m *Module) sessionTaskCounts(ctx context.Context, sessionID string) (map[string]int, error) {
	rows, err := m.store.Query(ctx, `SELECT status, COUNT(*) FROM tasks WHERE session_id = ? GROUP BY status`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	counts := map[string]int{"all": 0, "pending": 0, "running": 0, "failed": 0, "done": 0}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			return nil, err
		}
		counts["all"] += n
		counts[displayStatus(status)] += n
	}
	return counts, rows.Err()
}

func (m *Module) taskEventV2(task coretask.Task, changed []string) map[string]any {
	payload := taskEvent(task, "", "")
	payload["displayStatus"] = displayStatus(task.Status)
	payload["mode"] = task.Mode
	payload["batchId"] = task.BatchID
	payload["goal"] = task.Goal
	payload["inputs"] = task.Inputs
	payload["constraints"] = task.Constraints
	payload["waitingReason"] = task.WaitingReason
	payload["waitingSince"] = task.WaitingSince
	payload["failReason"] = task.FailReason
	payload["deadlineAt"] = task.DeadlineAt
	payload["startedAt"] = task.StartedAt
	payload["finishedAt"] = task.FinishedAt
	payload["triggerCount"] = task.TriggerCount
	if changed != nil {
		payload["changed"] = changed
	}
	return payload
}

// ---- 列表 ----

// ListFilter 是列表筛选参数。
type ListFilter struct {
	Status  []string
	Mode    string
	BatchID string
	Limit   int
	Before  string
}

// convTaskFilter 构造列表/计数的 WHERE 子句，保证 total 与列表用同一套筛选。
func convTaskFilter(sessionID string, filter ListFilter) (string, []any, error) {
	statuses := make([]string, 0, len(filter.Status))
	for _, raw := range filter.Status {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		switch raw {
		case coretask.StatusPending, coretask.StatusQueued, coretask.StatusRunning,
			coretask.StatusDone, coretask.StatusFailed, coretask.StatusCancelled,
			coretask.StatusInterrupted, coretask.StatusBlocked:
			statuses = append(statuses, raw)
		default:
			return "", nil, newConvError(400, "invalid_task_status", "status 取值非法")
		}
	}
	if filter.Mode != "" {
		if _, err := validateMode(filter.Mode); err != nil {
			return "", nil, err
		}
	}
	if filter.BatchID != "" && !isBatchID(filter.BatchID) {
		return "", nil, newConvError(400, "invalid_argument", "batchId 格式非法")
	}
	query := ` WHERE session_id = ?`
	args := []any{sessionID}
	if len(statuses) > 0 {
		// 展示态展开成存储态。
		expanded := make([]string, 0, len(statuses))
		for _, status := range statuses {
			switch status {
			case "pending":
				expanded = append(expanded, coretask.StatusPending, coretask.StatusQueued, coretask.StatusBlocked)
			case "failed":
				expanded = append(expanded, coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted)
			case "done":
				expanded = append(expanded, coretask.StatusDone)
			case "running":
				expanded = append(expanded, coretask.StatusRunning)
			default:
				expanded = append(expanded, status)
			}
		}
		query += ` AND status IN (` + placeholders(len(expanded)) + `)`
		for _, status := range expanded {
			args = append(args, status)
		}
	}
	if filter.Mode != "" {
		query += ` AND mode = ?`
		args = append(args, filter.Mode)
	}
	if filter.BatchID != "" {
		query += ` AND batch_id = ?`
		args = append(args, filter.BatchID)
	}
	return query, args, nil
}

// CountConvTasks 返回当前筛选下的任务总数（N2 的 total；游标不参与计数）。
func (m *Module) CountConvTasks(ctx context.Context, sessionID string, filter ListFilter) (int, error) {
	where, args, err := convTaskFilter(sessionID, filter)
	if err != nil {
		return 0, err
	}
	var total int
	if err := m.store.QueryRow(ctx, `SELECT COUNT(*) FROM tasks`+where, args...).Scan(&total); err != nil {
		return 0, err
	}
	return total, nil
}

func (m *Module) ListConvTasks(ctx context.Context, sessionID string, filter ListFilter) ([]coretask.Task, bool, string, error) {
	if filter.Limit <= 0 {
		filter.Limit = defaultListLimit
	}
	if filter.Limit < 1 || filter.Limit > maxListLimit {
		return nil, false, "", newConvError(400, "invalid_task_limit", "limit 必须在 1..100")
	}
	where, args, err := convTaskFilter(sessionID, filter)
	if err != nil {
		return nil, false, "", err
	}
	query := taskSelect + where
	if filter.Before != "" {
		updatedAt, id, ok := parseBeforeCursor(filter.Before)
		if !ok {
			// 游标失效返回空页，不报错（CT-CONV-520）。
			return []coretask.Task{}, false, "", nil
		}
		query += ` AND (updated_at < ? OR (updated_at = ? AND id < ?))`
		args = append(args, updatedAt, updatedAt, id)
	}
	query += ` ORDER BY updated_at DESC, id DESC LIMIT ?`
	args = append(args, filter.Limit+1)

	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, false, "", err
	}
	defer rows.Close()
	out := make([]coretask.Task, 0, filter.Limit)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return nil, false, "", err
		}
		decorateTask(&task)
		out = append(out, task)
	}
	if err := rows.Err(); err != nil {
		return nil, false, "", err
	}
	hasMore := len(out) > filter.Limit
	if hasMore {
		out = out[:filter.Limit]
	}
	// PRD-TASK-005：列表里的每条任务带上所在会话的直接子会话，父层据此显示「含 N 个子会话」。
	m.decorateChildSessions(ctx, out)
	nextBefore := ""
	if len(out) > 0 {
		last := out[len(out)-1]
		nextBefore = strconv.FormatInt(last.UpdatedAt, 10) + ":" + last.ID
	}
	return out, hasMore, nextBefore, nil
}

func placeholders(n int) string {
	if n <= 0 {
		return "''"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

func isBatchID(value string) bool {
	if !strings.HasPrefix(value, "batch-") || len(value) != len("batch-")+16 {
		return false
	}
	for _, r := range value[len("batch-"):] {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f')) {
			return false
		}
	}
	return true
}

func parseBeforeCursor(value string) (int64, string, bool) {
	parts := strings.SplitN(value, ":", 2)
	if len(parts) != 2 {
		return 0, "", false
	}
	updatedAt, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || strings.TrimSpace(parts[1]) == "" {
		return 0, "", false
	}
	return updatedAt, parts[1], true
}

// ---- 详情 ----

// ConvDetail 是详情响应。
type ConvDetail struct {
	Task          coretask.Task     `json:"task"`
	Steps         []ConvStep        `json:"steps"`
	CurrentStepID string            `json:"currentStepId"`
	Traces        []ConvTrace       `json:"traces"`
	TracesHasMore bool              `json:"tracesHasMore"`
	Deliverables  []DeliverableFile `json:"deliverables"`
	Context       map[string]any    `json:"context"`
	Budget        map[string]any    `json:"budget"`
}

// DeliverableFile 是交付物文件的展示投影。
type DeliverableFile struct {
	ID          string `json:"id"`
	TaskID      string `json:"taskId"`
	Name        string `json:"name"`
	Mime        string `json:"mime"`
	Size        int64  `json:"size"`
	TypeBadge   string `json:"typeBadge"`
	CreatedAt   int64  `json:"createdAt"`
	DownloadURL string `json:"downloadUrl"`
	PreviewURL  string `json:"previewUrl"`
}

func typeBadgeFor(name, mime string) string {
	mime = strings.ToLower(strings.TrimSpace(mime))
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".csv", ".xlsx", ".xls":
		return "sheet"
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
		return "image"
	}
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.Contains(mime, "spreadsheet"), strings.Contains(mime, "excel"), mime == "text/csv":
		return "sheet"
	default:
		return "doc"
	}
}

// ConvTaskDetail 读出详情；sessionID 非空时做跨会话 404 判定。
func (m *Module) ConvTaskDetail(ctx context.Context, sessionID, taskID string, traceLimit int, traceBefore int) (ConvDetail, error) {
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return ConvDetail{}, errTaskNotFound()
	}
	if err != nil {
		return ConvDetail{}, err
	}
	if sessionID != "" && task.SessionID != sessionID {
		// 跨会话一律 404，且不返回任何正文。
		return ConvDetail{}, errTaskNotFound()
	}
	decorateTask(&task)
	// PRD-TASK-005：详情同样带直接子会话，父层「含 N 个子会话」与列表口径一致。
	m.decorateChildSessionsOne(ctx, &task)
	steps, err := m.loadSteps(ctx, task.ID)
	if err != nil {
		return ConvDetail{}, err
	}
	currentStepID := ""
	for _, step := range steps {
		if step.Status == "running" {
			currentStepID = step.ID
			break
		}
	}
	if currentStepID == "" {
		for _, step := range steps {
			if step.Status == "pending" {
				currentStepID = step.ID
				break
			}
		}
	}
	if traceLimit <= 0 {
		traceLimit = defaultTraceLimit
	}
	if traceLimit > maxTraceLimit {
		traceLimit = maxTraceLimit
	}
	traces, hasMore, err := m.loadTraces(ctx, task.ID, traceLimit, traceBefore)
	if err != nil {
		return ConvDetail{}, err
	}
	files, err := m.taskDeliverables(ctx, task.ID)
	if err != nil {
		return ConvDetail{}, err
	}
	detail := ConvDetail{
		Task:          task,
		Steps:         steps,
		CurrentStepID: currentStepID,
		Traces:        traces,
		TracesHasMore: hasMore,
		Deliverables:  files,
		Context: map[string]any{
			"goal":         task.Goal,
			"inputs":       task.Inputs,
			"constraints":  task.Constraints,
			"historyCount": 0, // 预算内只注入目标/输入/约束，不注入历史。
		},
		Budget: m.budgetFor(task),
	}
	return detail, nil
}

// 预算缺省窗口：仅在调用方没有配置上限时兜底，属于可配置值，不再是唯一取值。
const (
	defaultBudgetSteps  = 8
	defaultBudgetTokens = 12000
)

// parseBudget 返回 N3 契约的 budget 四字段：maxTokens/maxSteps/usedTokens/usedSteps。
// 历史行可能写成 stepsUsed/tokensUsed，读时统一改成 used 前缀，避免同一响应出现两套键名。
func parseBudget(raw string) map[string]any {
	return parseBudgetWith(raw, defaultBudgetSteps, defaultBudgetTokens)
}

// parseBudgetWith 用调用方给的上限补齐缺失的 max 字段；任务行里的上限优先于兜底值。
func parseBudgetWith(raw string, fallbackSteps, fallbackTokens int) map[string]any {
	if fallbackSteps <= 0 {
		fallbackSteps = defaultBudgetSteps
	}
	if fallbackTokens <= 0 {
		fallbackTokens = defaultBudgetTokens
	}
	budget := map[string]any{"maxSteps": fallbackSteps, "maxTokens": fallbackTokens, "usedSteps": 0, "usedTokens": 0}
	if strings.TrimSpace(raw) == "" {
		return budget
	}
	parsed := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return budget
	}
	for key, value := range parsed {
		budget[normalizeBudgetKey(key)] = value
	}
	return budget
}

// budgetLimits 是模块级预算上限：New 时从环境变量读取，未配置时用缺省窗口。
func (m *Module) budgetLimits() (int, int) {
	steps, tokens := defaultBudgetSteps, defaultBudgetTokens
	if m != nil && m.MaxSteps > 0 {
		steps = m.MaxSteps
	}
	if m != nil && m.MaxTokens > 0 {
		tokens = m.MaxTokens
	}
	return steps, tokens
}

// newBudgetJSON 生成一条新任务的初始预算：两维用量从 0 起，上限取模块配置。
func (m *Module) newBudgetJSON() string {
	steps, tokens := m.budgetLimits()
	raw, err := json.Marshal(map[string]int{
		"maxSteps": steps, "maxTokens": tokens, "usedSteps": 0, "usedTokens": 0,
	})
	if err != nil {
		return ""
	}
	return string(raw)
}

// budgetFor 读任务自身的预算行；历史行没有 max 字段时用模块上限补齐。
func (m *Module) budgetFor(task coretask.Task) map[string]any {
	steps, tokens := m.budgetLimits()
	return parseBudgetWith(task.BudgetJSON, steps, tokens)
}

// budgetInt 从 budget map 取整数值，兼容 JSON 解出来的 float64 与历史字符串。
func budgetInt(budget map[string]any, key string, fallback int) int {
	if budget == nil {
		return fallback
	}
	switch value := budget[key].(type) {
	case float64:
		if value > 0 {
			return int(value)
		}
	case int:
		if value > 0 {
			return value
		}
	case string:
		if parsed, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && parsed > 0 {
			return parsed
		}
	}
	return fallback
}

// recordBudgetUsage 把本次 attempt 的两维用量累加进任务预算并写回 BudgetJSON。
func (m *Module) recordBudgetUsage(task *coretask.Task, steps, tokens int) {
	if task == nil {
		return
	}
	budget := m.budgetFor(*task)
	budget["usedSteps"] = budgetInt(budget, "usedSteps", 0) + steps
	budget["usedTokens"] = budgetInt(budget, "usedTokens", 0) + tokens
	raw, err := json.Marshal(budget)
	if err != nil {
		return
	}
	task.BudgetJSON = string(raw)
}

// resetBudgetUsage 清空两维用量。extend 为真时追加一档默认窗口（恢复 = 用户追加预算），
// 否则保留任务原有上限（重试：重跑整条任务，预算口径不变）。
func (m *Module) resetBudgetUsage(task *coretask.Task, extend bool) {
	if task == nil {
		return
	}
	budget := m.budgetFor(*task)
	budget["usedSteps"] = 0
	budget["usedTokens"] = 0
	if extend {
		// 恢复要能真的往下走：在既有上限上追加一个默认窗口，避免恢复一步又立刻触顶。
		steps, tokens := m.budgetLimits()
		if steps < defaultBudgetSteps {
			steps = defaultBudgetSteps
		}
		if tokens < defaultBudgetTokens {
			tokens = defaultBudgetTokens
		}
		budget["maxSteps"] = budgetInt(budget, "maxSteps", steps) + steps
		budget["maxTokens"] = budgetInt(budget, "maxTokens", tokens) + tokens
	}
	raw, err := json.Marshal(budget)
	if err != nil {
		return
	}
	task.BudgetJSON = string(raw)
}

// retryableStatus 是重试的唯一状态白名单：新旧两个 retry 入口共用这一处判断。
func retryableStatus(status string) bool {
	switch status {
	case coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted:
		return true
	}
	return false
}

func normalizeBudgetKey(key string) string {
	switch key {
	case "stepsUsed":
		return "usedSteps"
	case "tokensUsed":
		return "usedTokens"
	}
	return key
}

// ---- 取消 / 重试 / 确认 / 恢复 ----

// Transition 校验并落一条迁移；非法迁移返回 409。
func (m *Module) Transition(ctx context.Context, taskID, to string, touch func(*coretask.Task)) (coretask.Task, error) {
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return coretask.Task{}, errTaskNotFound()
	}
	if err != nil {
		return coretask.Task{}, err
	}
	if canTransition(task.Status, to) {
		task.Status = to
		if touch != nil {
			touch(&task)
		}
		task.UpdatedAt = time.Now().UnixMilli()
		if err := m.saveTask(ctx, task); err != nil {
			return coretask.Task{}, err
		}
		m.finalizeTask(ctx, &task)
		return task, nil
	}
	// running→running 只允许改 waiting_reason。
	if task.Status == coretask.StatusRunning {
		if touch != nil {
			touch(&task)
		}
		task.UpdatedAt = time.Now().UnixMilli()
		if err := m.saveTask(ctx, task); err != nil {
			return coretask.Task{}, err
		}
		return task, nil
	}
	return coretask.Task{}, errStateConflict(task.Status)
}

// CancelScope 取消任务。scope=self 只取消本任务；scope=chain 按依赖关系向下游传播：
// 已完成的下游保留结果不动，未开始的下游直接取消，进行中的下游中断并落一条中断轨迹。
// 取消不会级联到上游，也不会把等待中的下游标成失败。
func (m *Module) CancelScope(ctx context.Context, taskID, scope string) (coretask.Task, []string, bool, error) {
	if scope == "" {
		scope = "self"
	}
	if scope != "self" && scope != "chain" {
		return coretask.Task{}, nil, false, newConvError(400, "invalid_argument", "scope 只能是 self 或 chain")
	}
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return coretask.Task{}, nil, false, errTaskNotFound()
	}
	if err != nil {
		return coretask.Task{}, nil, false, err
	}
	if isTerminalStatus(task.Status) {
		return task, nil, false, nil
	}
	targets := []string{task.ID}
	if scope == "chain" {
		downstream, err := m.transitiveDependents(ctx, task.ID)
		if err != nil {
			return coretask.Task{}, nil, false, err
		}
		targets = append(targets, downstream...)
	}
	ordered, err := m.orderTaskIDs(ctx, targets)
	if err != nil {
		return coretask.Task{}, nil, false, err
	}
	cancelled := make([]string, 0, len(ordered))
	interrupted := 0
	deadline := time.Now().Add(5 * time.Second)
	for _, id := range ordered {
		current, err := m.getTask(ctx, id)
		if err != nil {
			continue
		}
		if id != task.ID {
			// 下游不级联改状态：只中断已启动（running）的，未启动的保持 pending 继续等依赖，
			// 已完成的保留结果。ct-conv-535 裁定：cancelled[] 只含目标自身。
			if current.Status != coretask.StatusRunning {
				continue
			}
			m.stopAttemptWithin(id, deadline)
			if _, err := m.markInterruptedConv(ctx, id, "上游任务取消，执行中断"); err != nil {
				return coretask.Task{}, nil, false, err
			}
			interrupted++
			continue
		}
		m.stopAttemptWithin(id, deadline)
		if _, err := m.markCancelledConv(ctx, id, "已取消"); err != nil {
			return coretask.Task{}, nil, false, err
		}
		cancelled = append(cancelled, id)
	}
	updated, err := m.getTask(ctx, taskID)
	if err != nil {
		return coretask.Task{}, nil, false, err
	}
	decorateTask(&updated)
	return updated, cancelled, len(cancelled) > 0 || interrupted > 0, nil
}

// stopAttempt 取消在跑的执行器并最多等 5 秒，避免取消接口被不响应的执行器拖住。
func (m *Module) stopAttempt(id string) {
	m.stopAttemptWithin(id, time.Now().Add(5*time.Second))
}

// stopAttemptWithin 把等待上限压到同一个截止时间：整链取消时多个执行器共享 5 秒预算，
// 不会按目标数线性放大接口耗时。
func (m *Module) stopAttemptWithin(id string, deadline time.Time) {
	m.mu.Lock()
	handle := m.active[id]
	m.mu.Unlock()
	if handle == nil {
		return
	}
	handle.cancel()
	wait := time.Until(deadline)
	if wait <= 0 {
		return
	}
	select {
	case <-handle.done:
	case <-time.After(wait):
	}
}

// transitiveDependents 按依赖边向下游 BFS（dep_id -> task_id），结果不含任务自身。
func (m *Module) transitiveDependents(ctx context.Context, taskID string) ([]string, error) {
	seen := map[string]bool{taskID: true}
	out := make([]string, 0, 4)
	frontier := []string{taskID}
	for len(frontier) > 0 {
		current := frontier[0]
		frontier = frontier[1:]
		rows, err := m.store.Query(ctx, `SELECT task_id FROM task_deps WHERE dep_id = ?`, current)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var child string
			if err := rows.Scan(&child); err != nil {
				rows.Close()
				return nil, err
			}
			if !seen[child] {
				seen[child] = true
				out = append(out, child)
				frontier = append(frontier, child)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

// orderTaskIDs 按 orderIndex 升序、同序按 id 返回任务 id，查不到的 id 略过。
func (m *Module) orderTaskIDs(ctx context.Context, ids []string) ([]string, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	args := make([]any, 0, len(ids))
	for _, id := range ids {
		args = append(args, id)
	}
	rows, err := m.store.Query(ctx, `SELECT id FROM tasks WHERE id IN (`+placeholders(len(ids))+`)
		ORDER BY order_index ASC, id ASC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, len(ids))
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// markInterruptedConv 让运行中的任务走中断流程：状态置 interrupted，运行中步骤回 pending，
// 已完成步骤与产出保留，attempt 不增，并落一条中断轨迹。
func (m *Module) markInterruptedConv(ctx context.Context, id, reason string) (coretask.Task, error) {
	task, err := m.getTask(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	if isTerminalStatus(task.Status) {
		return task, nil
	}
	now := time.Now().UnixMilli()
	runningStep := ""
	steps, _ := m.loadSteps(ctx, id)
	for i := range steps {
		if steps[i].Status == "running" {
			runningStep = steps[i].ID
			steps[i].Status = "pending"
			steps[i].StartedAt = 0
		}
	}
	if len(steps) > 0 {
		if err := m.saveSteps(ctx, id, steps); err != nil {
			return coretask.Task{}, err
		}
		_ = m.mirrorSteps(ctx, id)
	}
	task.Status = coretask.StatusInterrupted
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.Outcome = "interrupted"
	task.Summary = reason
	task.FinishedAt = now
	task.UpdatedAt = now
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, err
	}
	_, _ = m.appendTrace(ctx, task, runningStep, "interrupt", "", reason)
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status"}))
	m.emit(ctx, eventlog.TypeTaskReport, m.taskEventV2(task, nil))
	m.finalizeTask(ctx, &task)
	return task, nil
}

func (m *Module) markCancelledConv(ctx context.Context, id, summary string) (coretask.Task, error) {
	task, err := m.getTask(ctx, id)
	if err != nil {
		return coretask.Task{}, err
	}
	task.Status = coretask.StatusCancelled
	task.Summary = summary
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.FinishedAt = time.Now().UnixMilli()
	task.UpdatedAt = task.FinishedAt
	task.Progress = 0
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, err
	}
	steps, _ := m.loadSteps(ctx, id)
	now := task.UpdatedAt
	for i := range steps {
		if steps[i].Status == "running" {
			// 回 pending 的步骤不再算已启动，与整链中断路径保持一致。
			steps[i].StartedAt = 0
		}
		if steps[i].Status == "running" || steps[i].Status == "pending" {
			steps[i].Status = "pending"
		}
		steps[i].FinishedAt = now
	}
	if len(steps) > 0 {
		_ = m.saveSteps(ctx, id, steps)
		_ = m.mirrorSteps(ctx, id)
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status"}))
	m.emit(ctx, eventlog.TypeTaskReport, m.taskEventV2(task, nil))
	m.finalizeTask(ctx, &task)
	return task, nil
}

func (m *Module) transitiveDeps(ctx context.Context, taskID string) ([]string, error) {
	seen := map[string]bool{}
	out := make([]string, 0, 4)
	frontier := []string{taskID}
	for len(frontier) > 0 {
		current := frontier[0]
		frontier = frontier[1:]
		rows, err := m.store.Query(ctx, `SELECT dep_id FROM task_deps WHERE task_id = ?`, current)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var dep string
			if err := rows.Scan(&dep); err != nil {
				rows.Close()
				return nil, err
			}
			if !seen[dep] {
				seen[dep] = true
				out = append(out, dep)
				frontier = append(frontier, dep)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}
	return out, nil
}

// RetryConv 只允许 failed/cancelled/interrupted；其余 409。
// 重试会连带重跑下游里失败/取消/中断的任务，已完成的下游保持原结果。
func (m *Module) RetryConv(ctx context.Context, taskID string) (coretask.Task, int, int, error) {
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return coretask.Task{}, 0, 0, errTaskNotFound()
	}
	if err != nil {
		return coretask.Task{}, 0, 0, err
	}
	if !retryableStatus(task.Status) {
		return coretask.Task{}, 0, 0, errStateConflict(task.Status)
	}
	m.stopAttempt(task.ID)
	task, reset, err := m.requeueConv(ctx, task.ID)
	if err != nil {
		return coretask.Task{}, 0, 0, err
	}
	m.startAttempt(task.ID, task.Attempt)
	m.retryDownstreamConv(ctx, task.ID)
	return task, task.Attempt, reset, nil
}

// requeueConv 把一条终态任务重置为 queued：attempt 加一、步骤全回 pending、清等待与失败信息。
func (m *Module) requeueConv(ctx context.Context, taskID string) (coretask.Task, int, error) {
	task, err := m.getTask(ctx, taskID)
	if err != nil {
		return coretask.Task{}, 0, err
	}
	steps, err := m.loadSteps(ctx, taskID)
	if err != nil {
		return coretask.Task{}, 0, err
	}
	now := time.Now().UnixMilli()
	reset := 0
	for i := range steps {
		if steps[i].Status != "pending" {
			reset++
		}
		steps[i].Status = "pending"
		steps[i].Summary = ""
		steps[i].FailReason = ""
		steps[i].StartedAt = 0
		steps[i].FinishedAt = 0
	}
	if len(steps) > 0 {
		if err := m.saveSteps(ctx, taskID, steps); err != nil {
			return coretask.Task{}, 0, err
		}
	}
	task.Attempt++
	task.Status = coretask.StatusQueued
	// 新 attempt 结束时再写一条结束消息，旧的 end_message_id 不能挡住 CAS。
	task.EndMessageID = ""
	task.Progress = 0
	task.Summary = ""
	task.Outcome = ""
	task.FailReason = ""
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.StartedAt = 0
	task.FinishedAt = 0
	task.Phases = resetPhases(task.Phases)
	task.Steps = resetSteps(task.Steps)
	// 新 attempt 从第一步重跑，两维用量归零；上限沿用任务原有配置。
	m.resetBudgetUsage(&task, false)
	task.UpdatedAt = now
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, 0, err
	}
	_ = m.mirrorSteps(ctx, taskID)
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status", "attempt", "progress"}))
	m.emitProgress(ctx, task)
	return task, reset, nil
}

// retryDownstreamConv 只重跑下游里失败/取消/中断的任务，已完成的下游不动。
func (m *Module) retryDownstreamConv(ctx context.Context, taskID string) {
	downstream, err := m.transitiveDependents(ctx, taskID)
	if err != nil || len(downstream) == 0 {
		return
	}
	ordered, err := m.orderTaskIDs(ctx, downstream)
	if err != nil {
		return
	}
	for _, id := range ordered {
		current, err := m.getTask(ctx, id)
		if err != nil {
			continue
		}
		switch current.Status {
		case coretask.StatusFailed, coretask.StatusCancelled, coretask.StatusInterrupted:
		default:
			continue
		}
		m.stopAttempt(id)
		retried, _, err := m.requeueConv(ctx, id)
		if err != nil {
			continue
		}
		m.startAttempt(retried.ID, retried.Attempt)
	}
}

// ConfirmationInput 是确认接口请求体。
type ConfirmationInput struct {
	Decision string `json:"decision"`
	Note     string `json:"note"`
}

// ConfirmConv 处理 confirmation 等待：confirm 继续，cancel 失败收口。
func (m *Module) ConfirmConv(ctx context.Context, taskID string, input ConfirmationInput) (coretask.Task, string, error) {
	if input.Decision != "confirm" && input.Decision != "cancel" {
		return coretask.Task{}, "", newConvError(400, "invalid_argument", "decision 只能是 confirm 或 cancel")
	}
	if len([]rune(input.Note)) > 500 {
		return coretask.Task{}, "", newConvError(400, "invalid_argument", "note 不能超过 500 字")
	}
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return coretask.Task{}, "", errTaskNotFound()
	}
	if err != nil {
		return coretask.Task{}, "", err
	}
	if task.WaitingReason != WaitingConfirmation {
		return coretask.Task{}, "", errStateConflict(task.Status)
	}
	steps, _ := m.loadSteps(ctx, task.ID)
	currentStepID := ""
	for _, step := range steps {
		if step.Status == "running" {
			currentStepID = step.ID
			break
		}
	}
	now := time.Now().UnixMilli()
	if input.Decision == "cancel" {
		for i := range steps {
			if steps[i].ID == currentStepID || (currentStepID == "" && steps[i].Status == "pending") {
				steps[i].Status = "failed"
				steps[i].FailReason = "用户取消"
				steps[i].FinishedAt = now
				currentStepID = steps[i].ID
				break
			}
		}
		if len(steps) > 0 {
			_ = m.saveSteps(ctx, task.ID, steps)
		}
		task.Status = coretask.StatusFailed
		task.FailReason = "用户取消"
		task.Outcome = "cancelled_by_user"
		task.Summary = "用户取消了等待中的确认"
		task.WaitingReason = ""
		task.WaitingSince = 0
		task.FinishedAt = now
		task.UpdatedAt = now
		if err := m.saveTask(ctx, task); err != nil {
			return coretask.Task{}, "", err
		}
		_ = m.mirrorSteps(ctx, task.ID)
		m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status", "waitingReason"}))
		m.emit(ctx, eventlog.TypeTaskReport, m.taskEventV2(task, nil))
		m.finalizeTask(ctx, &task)
		return task, currentStepID, nil
	}
	// confirm：清等待，继续执行。trigger_count 只记依赖放行与资源恢复，
	// 确认放行不计入，否则 each 的“已完成前置数”会被确认次数挤占。
	// 确认前挂起的工具审批在这里真正放行（补会话授权），执行器续跑时直接通过；
	// 放行失败则保持等待，避免出现“已确认但工具仍被拦”的半状态。
	if err := m.releaseTaskApprovals(ctx, task); err != nil {
		return coretask.Task{}, "", newConvError(500, "internal", "放行待审批工具失败")
	}
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.UpdatedAt = now
	if task.Status != coretask.StatusRunning {
		task.Status = coretask.StatusRunning
	}
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, "", err
	}
	if currentStepID != "" {
		for i := range steps {
			if steps[i].ID == currentStepID && steps[i].Status == "pending" {
				steps[i].Status = "running"
				steps[i].StartedAt = now
			}
		}
		if err := m.saveSteps(ctx, task.ID, steps); err != nil {
			return coretask.Task{}, "", err
		}
	}
	for _, step := range steps {
		if step.ID == currentStepID {
			m.emitStepEvent(ctx, task, step)
		}
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status", "waitingReason"}))
	m.mu.Lock()
	active := m.active[task.ID]
	m.mu.Unlock()
	if active == nil {
		m.startAttempt(task.ID, task.Attempt)
	}
	return task, currentStepID, nil
}

// ResumeConv 解除 resource 等待。
func (m *Module) ResumeConv(ctx context.Context, taskID, reason string) (coretask.Task, string, error) {
	if len([]rune(reason)) > 200 {
		return coretask.Task{}, "", newConvError(400, "invalid_argument", "reason 不能超过 200 字")
	}
	task, err := m.getTask(ctx, taskID)
	if err == ErrNotFound {
		return coretask.Task{}, "", errTaskNotFound()
	}
	if err != nil {
		return coretask.Task{}, "", err
	}
	if task.WaitingReason != WaitingResource {
		return coretask.Task{}, "", errStateConflict(task.Status)
	}
	steps, _ := m.loadSteps(ctx, task.ID)
	resumed := ""
	now := time.Now().UnixMilli()
	for i := range steps {
		if steps[i].Status == "running" {
			resumed = steps[i].ID
			break
		}
	}
	if resumed == "" {
		for i := range steps {
			if steps[i].Status == "pending" || steps[i].Status == "failed" {
				steps[i].Status = "running"
				steps[i].StartedAt = now
				steps[i].FailReason = ""
				resumed = steps[i].ID
				break
			}
		}
	}
	if len(steps) > 0 {
		if err := m.saveSteps(ctx, task.ID, steps); err != nil {
			return coretask.Task{}, "", err
		}
	}
	task.Status = coretask.StatusRunning
	task.WaitingReason = ""
	task.WaitingSince = 0
	// 恢复计入 trigger_count（T03 卡口径）：已完成步骤原样保留，只从暂停步继续。
	// 预算用量清零并追加一档默认窗口，否则暂停时已耗尽的预算会立刻再次触顶。
	task.Outcome = ""
	m.resetBudgetUsage(&task, true)
	task.TriggerCount++
	task.UpdatedAt = now
	if err := m.saveTask(ctx, task); err != nil {
		return coretask.Task{}, "", err
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, []string{"status", "waitingReason"}))
	m.mu.Lock()
	active := m.active[task.ID]
	m.mu.Unlock()
	if active == nil {
		m.startAttempt(task.ID, task.Attempt)
	}
	return task, resumed, nil
}

// ---- 任务图 ----

// GraphNode / GraphEdge 是任务图元素。
type GraphNode struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Mode          string   `json:"mode"`
	Status        string   `json:"status"`
	DisplayStatus string   `json:"displayStatus"`
	WaitingReason string   `json:"waitingReason,omitempty"`
	Progress      int      `json:"progress"`
	FailReason    string   `json:"failReason,omitempty"`
	DependsOn     []string `json:"dependsOn"`
	Layer         int      `json:"layer"`
}

type GraphEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	JoinMode string `json:"joinMode"`
	Style    string `json:"style"`
}

// GraphLayer 是任务图的一层；index 从 0 起，nodeIds 按 orderIndex 升序。
type GraphLayer struct {
	Index   int      `json:"index"`
	NodeIDs []string `json:"nodeIds"`
}

// ConvGraph 是任务图响应。
type ConvGraph struct {
	Nodes  []GraphNode  `json:"nodes"`
	Edges  []GraphEdge  `json:"edges"`
	Layers []GraphLayer `json:"layers"`
	Total  int          `json:"total"`
}

// TaskGraph 构造会话或批次的任务图，layers 为最长路径层数。
func (m *Module) TaskGraph(ctx context.Context, sessionID, batchID string) (ConvGraph, error) {
	query := taskSelect + ` WHERE session_id = ?`
	args := []any{sessionID}
	if batchID != "" {
		if !isBatchID(batchID) {
			return ConvGraph{}, newConvError(400, "invalid_argument", "batchId 格式非法")
		}
		query += ` AND batch_id = ?`
		args = append(args, batchID)
	}
	query += ` ORDER BY order_index ASC, id ASC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return ConvGraph{}, err
	}
	defer rows.Close()
	tasks := make([]coretask.Task, 0, 8)
	byID := map[string]coretask.Task{}
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			return ConvGraph{}, err
		}
		tasks = append(tasks, task)
		byID[task.ID] = task
	}
	if err := rows.Err(); err != nil {
		return ConvGraph{}, err
	}
	edges := make([]GraphEdge, 0, len(tasks))
	indegree := map[string]int{}
	adj := map[string][]string{}
	depsByTask := map[string][]string{}
	for _, task := range tasks {
		rows, err := m.store.Query(ctx, `SELECT dep_id, join_mode FROM task_deps WHERE task_id = ?`, task.ID)
		if err != nil {
			return ConvGraph{}, err
		}
		for rows.Next() {
			var depID, joinMode string
			if err := rows.Scan(&depID, &joinMode); err != nil {
				rows.Close()
				return ConvGraph{}, err
			}
			if _, ok := byID[depID]; !ok {
				continue // 批次外依赖不进图
			}
			style := "solid"
			if dep := byID[depID]; dep.Status == coretask.StatusFailed ||
				dep.Status == coretask.StatusCancelled || dep.Status == coretask.StatusInterrupted {
				style = "dashed"
			}
			edges = append(edges, GraphEdge{From: depID, To: task.ID, JoinMode: joinMode, Style: style})
			depsByTask[task.ID] = append(depsByTask[task.ID], depID)
			adj[depID] = append(adj[depID], task.ID)
			indegree[task.ID]++
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return ConvGraph{}, err
		}
		rows.Close()
	}
	layer := map[string]int{}
	queue := make([]string, 0, len(tasks))
	for _, task := range tasks {
		if indegree[task.ID] == 0 {
			queue = append(queue, task.ID)
		}
	}
	maxLayer := 0
	processed := 0
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		processed++
		for _, next := range adj[current] {
			if layer[current]+1 > layer[next] {
				layer[next] = layer[current] + 1
			}
			indegree[next]--
			if indegree[next] == 0 {
				queue = append(queue, next)
			}
		}
		if layer[current] > maxLayer {
			maxLayer = layer[current]
		}
	}
	if processed < len(tasks) {
		return ConvGraph{}, newConvError(400, "invalid_task_dependency", "任务依赖存在环")
	}
	nodes := make([]GraphNode, 0, len(tasks))
	for _, task := range tasks {
		dependsOn := depsByTask[task.ID]
		if dependsOn == nil {
			dependsOn = []string{}
		}
		nodes = append(nodes, GraphNode{
			ID: task.ID, Title: task.Title,
			Mode:   firstNonEmptyValue(task.Mode, "plan"),
			Status: task.Status, DisplayStatus: displayStatus(task.Status),
			WaitingReason: task.WaitingReason, Progress: task.Progress,
			FailReason: task.FailReason, DependsOn: dependsOn,
			Layer: layer[task.ID],
		})
	}
	layers := make([]GraphLayer, 0, maxLayer+1)
	if len(nodes) > 0 {
		for index := 0; index <= maxLayer; index++ {
			layerIDs := make([]string, 0, 4)
			for _, task := range tasks {
				if layer[task.ID] == index {
					layerIDs = append(layerIDs, task.ID)
				}
			}
			if len(layerIDs) > 0 {
				layers = append(layers, GraphLayer{Index: index, NodeIDs: layerIDs})
			}
		}
	}
	return ConvGraph{Nodes: nodes, Edges: edges, Layers: layers, Total: len(nodes)}, nil
}

// ---- 交付物 ----

// DeliverableGroup 是按任务分组的交付物。
type DeliverableGroup struct {
	TaskID     string            `json:"taskId"`
	TaskTitle  string            `json:"taskTitle"`
	TaskStatus string            `json:"taskStatus"`
	Files      []DeliverableFile `json:"files"`
	Count      int               `json:"count"`
}

// DeliverablesResult 是交付物分组响应。
type DeliverablesResult struct {
	Groups    []DeliverableGroup `json:"groups"`
	Total     int                `json:"total"`
	FileCount int                `json:"fileCount"`
	HasMore   bool               `json:"hasMore"`
}

func (m *Module) taskDeliverables(ctx context.Context, taskID string) ([]DeliverableFile, error) {
	rows, err := m.store.Query(ctx, `SELECT id, task_id, name, mime, size, created_at FROM task_artifacts
		WHERE task_id = ? AND delivery_kind = 'user_delivery' ORDER BY created_at ASC, id ASC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]DeliverableFile, 0, 4)
	for rows.Next() {
		var file DeliverableFile
		if err := rows.Scan(&file.ID, &file.TaskID, &file.Name, &file.Mime, &file.Size, &file.CreatedAt); err != nil {
			return nil, err
		}
		file.TypeBadge = typeBadgeFor(file.Name, file.Mime)
		file.DownloadURL = "/api/artifacts/" + file.ID + "/content?download=1"
		file.PreviewURL = "/api/artifacts/" + file.ID + "/content"
		out = append(out, file)
	}
	return out, rows.Err()
}

// SessionDeliverables 按任务分组返回会话内的用户交付物。
func (m *Module) SessionDeliverables(ctx context.Context, sessionID, taskID string, limit int) (DeliverablesResult, error) {
	if limit <= 0 {
		limit = defaultListLimit
	}
	if limit > maxListLimit {
		limit = maxListLimit
	}
	query := `SELECT a.id, a.name, a.mime, a.size, a.created_at, t.id, t.title, t.status
		FROM tasks t LEFT JOIN task_artifacts a
			ON a.task_id = t.id AND a.delivery_kind = 'user_delivery'
		WHERE t.session_id = ?`
	args := []any{sessionID}
	if taskID != "" {
		query += ` AND t.id = ?`
		args = append(args, taskID)
	}
	query += ` ORDER BY CASE WHEN a.id IS NULL THEN 1 ELSE 0 END, a.created_at ASC, t.created_at ASC, t.rowid ASC, a.rowid ASC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return DeliverablesResult{}, err
	}
	defer rows.Close()
	groups := make([]DeliverableGroup, 0, 4)
	index := map[string]int{}
	fileCount := 0
	for rows.Next() {
		var artifactID, name, mime, rowTaskID, taskTitle, taskStatus sql.NullString
		var size, createdAt sql.NullInt64
		if err := rows.Scan(&artifactID, &name, &mime, &size, &createdAt,
			&rowTaskID, &taskTitle, &taskStatus); err != nil {
			return DeliverablesResult{}, err
		}
		groupID := rowTaskID.String
		pos, ok := index[groupID]
		if !ok {
			index[groupID] = len(groups)
			groups = append(groups, DeliverableGroup{
				TaskID: groupID, TaskTitle: taskTitle.String, TaskStatus: taskStatus.String,
				Files: []DeliverableFile{},
			})
			pos = len(groups) - 1
		}
		// LEFT JOIN 下没有产物的任务只有一行且 a.id 为 NULL：仍然建组，files 留空。
		if !artifactID.Valid {
			continue
		}
		file := DeliverableFile{
			ID: artifactID.String, TaskID: groupID, Name: name.String, Mime: mime.String,
			Size: size.Int64, CreatedAt: createdAt.Int64,
		}
		file.TypeBadge = typeBadgeFor(file.Name, file.Mime)
		file.DownloadURL = "/api/artifacts/" + file.ID + "/content?download=1"
		file.PreviewURL = "/api/artifacts/" + file.ID + "/content"
		groups[pos].Files = append(groups[pos].Files, file)
		fileCount++
	}
	if err := rows.Err(); err != nil {
		return DeliverablesResult{}, err
	}
	for i := range groups {
		groups[i].Count = len(groups[i].Files)
	}
	hasMore := len(groups) > limit
	if hasMore {
		groups = groups[:limit]
	}
	return DeliverablesResult{Groups: groups, Total: len(groups), FileCount: fileCount, HasMore: hasMore}, nil
}

// ---- 提醒 ----

func (m *Module) startReminderLoop(ctx context.Context) {
	if ctx == nil {
		return
	}
	ticker := time.NewTicker(30 * time.Second)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.scanDeadlines(context.Background())
			}
		}
	}()
}

// scanDeadlines 对到期待提醒任务各发一条 task.reminder，并写 deadline_reminded_at。
func (m *Module) scanDeadlines(ctx context.Context) int {
	now := clock.NowUnixMilli()
	rows, err := m.store.Query(ctx, taskSelect+` WHERE deadline_at > 0 AND deadline_reminded_at = 0
		AND deadline_at <= ? AND status NOT IN ('done','failed','cancelled','interrupted')`, now)
	if err != nil {
		return 0
	}
	tasks := make([]coretask.Task, 0, 4)
	for rows.Next() {
		task, err := scanTask(rows)
		if err != nil {
			rows.Close()
			return 0
		}
		tasks = append(tasks, task)
	}
	rows.Close()
	emitted := 0
	for _, task := range tasks {
		if err := m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE tasks SET deadline_reminded_at = ? WHERE id = ? AND deadline_reminded_at = 0`,
				now, task.ID)
			return err
		}); err != nil {
			continue
		}
		m.emit(ctx, eventlog.TypeTaskReminder, map[string]any{
			"taskId": task.ID, "sessionId": task.SessionID, "title": task.Title,
			"status": task.Status, "displayStatus": displayStatus(task.Status),
			"deadlineAt": task.DeadlineAt, "at": now,
		})
		// 同一任务最多一条提醒。
		emitted++
	}
	return emitted
}

// ---- 执行器接入 ----
//
// T03 裁决：原 applyExecutionResult 无任何调用点，real_executor.go 已内联等价的状态映射
// （失败/预算 resource/审批 confirmation/完成），且 T03 的禁止项不改执行器。保留这份死代码
// 会让两处映射继续分叉，因此删除；映射口径以 real_executor.go 与 spec §17.3 为准。
// 统一执行器接入时由后续卡重新接线，不在本卡范围内。

// notifyDependents 在任务完成后唤醒依赖它的等待任务。
func (m *Module) notifyDependents(ctx context.Context, taskID string) {
	rows, err := m.store.Query(ctx, `SELECT task_id FROM task_deps WHERE dep_id = ?`, taskID)
	if err != nil {
		return
	}
	dependents := make([]string, 0, 4)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err == nil {
			dependents = append(dependents, id)
		}
	}
	rows.Close()
	for _, id := range dependents {
		m.markDependencyReady(ctx, id)
	}
}

type convDepState struct {
	ID       string
	JoinMode string
	Status   string
}

func (m *Module) loadConvDepStates(ctx context.Context, taskID string) ([]convDepState, error) {
	rows, err := m.store.Query(ctx, `SELECT d.dep_id, d.join_mode, t.status
		FROM task_deps d JOIN tasks t ON t.id = d.dep_id WHERE d.task_id = ? ORDER BY d.dep_id`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	deps := make([]convDepState, 0, 4)
	for rows.Next() {
		var dep convDepState
		if err := rows.Scan(&dep.ID, &dep.JoinMode, &dep.Status); err != nil {
			return nil, err
		}
		deps = append(deps, dep)
	}
	return deps, rows.Err()
}

func joinModeOf(deps []convDepState) string {
	if len(deps) == 0 {
		return ""
	}
	if strings.TrimSpace(deps[0].JoinMode) == "" {
		return "all"
	}
	return deps[0].JoinMode
}

func countDoneDeps(deps []convDepState) int {
	done := 0
	for _, dep := range deps {
		if dep.Status == coretask.StatusDone {
			done++
		}
	}
	return done
}

// markDependencyReady 是依赖等待的退出路径：只对正在等待依赖的任务放行，
// 已放行过（等待已清空）或正在等确认/资源的任务不因前置完成被重复启动。
func (m *Module) markDependencyReady(ctx context.Context, taskID string) {
	task, err := m.getTask(ctx, taskID)
	if err != nil || isTerminalStatus(task.Status) {
		return
	}
	if task.WaitingReason != WaitingDependency {
		return // 没在等依赖：已放行、等确认或等资源，都不该被前置完成再次启动
	}
	deps, err := m.loadConvDepStates(ctx, taskID)
	if err != nil || len(deps) == 0 {
		return
	}
	done := countDoneDeps(deps)
	switch joinModeOf(deps) {
	case "each":
		// each：每个前置完成各触发一次，串行；触发次数由 trigger_count 记账。
		if done <= task.TriggerCount {
			return
		}
		m.triggerConvAttempt(ctx, task, true, 1, []string{"status", "attempt", "triggerCount"})
	case "any", "first":
		if done == 0 {
			return
		}
		m.triggerConvAttempt(ctx, task, false, 1, []string{"waitingReason", "triggerCount"})
	default: // all
		if done != len(deps) {
			return
		}
		m.triggerConvAttempt(ctx, task, false, 1, []string{"waitingReason", "triggerCount"})
	}
}

// triggerConvAttempt 清等待后启动一次执行；reset=true 表示 each 的下一轮（attempt 加一、步骤重置）。
func (m *Module) triggerConvAttempt(ctx context.Context, task coretask.Task, reset bool, triggerDelta int, changed []string) {
	task.WaitingReason = ""
	task.WaitingSince = 0
	task.TriggerCount += triggerDelta
	if reset {
		task.Attempt++
		task.Status = coretask.StatusQueued
		task.Progress = 0
		task.Summary = ""
		task.Outcome = ""
		task.FailReason = ""
		task.StartedAt = 0
		task.FinishedAt = 0
		task.Steps = resetSteps(task.Steps)
		m.resetConvSteps(ctx, task.ID)
	}
	task.UpdatedAt = time.Now().UnixMilli()
	if err := m.saveTask(ctx, task); err != nil {
		m.log.Error("保存依赖唤醒状态失败", "err", err, "taskId", task.ID)
		return
	}
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(task, changed))
	m.startAttempt(task.ID, task.Attempt)
}

// resetConvSteps 把 task_steps 的状态重置为 pending，已完成步骤的轨迹保留在 task_traces。
func (m *Module) resetConvSteps(ctx context.Context, taskID string) {
	steps, err := m.loadSteps(ctx, taskID)
	if err != nil {
		return
	}
	for i := range steps {
		steps[i].Status = "pending"
		steps[i].Summary = ""
		steps[i].FailReason = ""
		steps[i].StartedAt = 0
		steps[i].FinishedAt = 0
	}
	if err := m.saveSteps(ctx, taskID, steps); err != nil {
		m.log.Error("重置任务步骤失败", "err", err, "taskId", taskID)
	}
}

// retriggerEach 在 each 任务完成后再看是否还有未消费的前置完成事件。
func (m *Module) retriggerEach(ctx context.Context, task coretask.Task) {
	deps, err := m.loadConvDepStates(ctx, task.ID)
	if err != nil || joinModeOf(deps) != "each" {
		return
	}
	if countDoneDeps(deps) <= task.TriggerCount {
		return
	}
	m.triggerConvAttempt(ctx, task, true, 1, []string{"status", "attempt", "triggerCount"})
}
