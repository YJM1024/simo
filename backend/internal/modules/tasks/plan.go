package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	coretask "simo/internal/core/task"
	"simo/internal/core/eventlog"
)

// 复杂度分级与方案确认（PRD-TASK-004，DEC-39）。
// 口径：C0/C1 不落任务与方案（docs/task-complexity.md:21-25）；
// C2/C3/C4 先落 pending 方案与一张 category=confirmation 卡片，确认时才在同一个事务里派生任务与子会话。

const planSelect = `SELECT id, session_id, complexity, status, plan_message_id, plan_steps_json,
	child_session_ids, task_ids_json, request_text, task_count, child_session_count,
	attempt, created_at, decided_at, expires_at, rejected_reason FROM task_plans`

type planScanner interface {
	Scan(dest ...any) error
}

func scanTaskPlan(row planScanner) (coretask.TaskPlan, error) {
	var plan coretask.TaskPlan
	var stepsJSON, childJSON, taskJSON string
	if err := row.Scan(&plan.ID, &plan.SessionID, &plan.Complexity, &plan.Status, &plan.PlanMessageID,
		&stepsJSON, &childJSON, &taskJSON, &plan.RequestText, &plan.TaskCount, &plan.ChildSessionCount,
		&plan.Attempt, &plan.CreatedAt, &plan.DecidedAt, &plan.ExpiresAt, &plan.RejectedReason); err != nil {
		return coretask.TaskPlan{}, err
	}
	_ = json.Unmarshal([]byte(stepsJSON), &plan.PlanSteps)
	_ = json.Unmarshal([]byte(childJSON), &plan.ChildSessionIDs)
	_ = json.Unmarshal([]byte(taskJSON), &plan.TaskIDs)
	if plan.PlanSteps == nil {
		plan.PlanSteps = []string{}
	}
	if plan.ChildSessionIDs == nil {
		plan.ChildSessionIDs = []string{}
	}
	if plan.TaskIDs == nil {
		plan.TaskIDs = []string{}
	}
	return plan, nil
}

// PlanCreateResult 是 POST /api/sessions/{id}/task-plans 的响应。
type PlanCreateResult struct {
	Complexity  coretask.Classification `json:"classification"`
	Plan        *coretask.TaskPlan      `json:"plan"`
	PlanMessage *messageRow             `json:"-"`
}

type messageRow struct {
	ID        string
	SessionID string
	Text      string
	At        int64
}

func planStepsFromInput(input coretask.TaskPlanInput) []string {
	steps := make([]string, 0, len(input.Steps))
	for _, step := range input.Steps {
		if strings.TrimSpace(step) != "" {
			steps = append(steps, step)
		}
	}
	if len(steps) > 0 {
		return steps
	}
	for _, item := range input.Tasks {
		for _, step := range item.Steps {
			if strings.TrimSpace(step) != "" {
				steps = append(steps, step)
			}
		}
	}
	if len(steps) == 0 {
		for _, step := range defaultSteps() {
			steps = append(steps, step.Title)
		}
	}
	return steps
}

func planBaseText(input coretask.TaskPlanInput) string {
	base := strings.TrimSpace(input.Title)
	if base == "" {
		base = strings.TrimSpace(input.RequestText)
	}
	if base == "" {
		base = "任务"
	}
	return base
}

func planMessageText(plan coretask.TaskPlan, stepCount int, reason string) string {
	scope := "当前会话"
	if plan.ChildSessionCount == 1 {
		scope = "1 个子会话"
	} else if plan.ChildSessionCount > 1 {
		scope = fmt.Sprintf("%d 个子会话", plan.ChildSessionCount)
	}
	lines := []string{
		fmt.Sprintf("任务方案 · %s", plan.Complexity),
		fmt.Sprintf("计划步骤 %d 步，将创建 %d 个任务、%s。", stepCount, plan.TaskCount, scope),
	}
	if text := strings.TrimSpace(reason); text != "" {
		lines = append(lines, "判定依据："+text)
	}
	if text := strings.TrimSpace(plan.RequestText); text != "" {
		lines = append(lines, text)
	}
	return strings.Join(lines, "\n")
}

// emitComplexityClassified 把等级与判定理由写进事件，C0/C1 同样留痕（DEC-43）。
func (m *Module) emitComplexityClassified(ctx context.Context, sessionID, planID string, classification coretask.Classification) {
	payload := map[string]any{
		"session_id": sessionID, "complexity": classification.Complexity,
		"step_count": classification.StepCount, "task_count": classification.TaskCount,
		"child_session_count": classification.ChildSessionCount,
		"reason":              classification.Reason, "step_source": classification.StepReason.Source,
	}
	if planID != "" {
		payload["plan_id"] = planID
	}
	if len(classification.StepReason.Markers) > 0 {
		payload["step_markers"] = classification.StepReason.Markers
	}
	m.emit(ctx, eventlog.TypeComplexityClassified, payload)
}

// PlanTask 是对话入口使用的方案端口：复用 CreateTaskPlan 的判定与事务落库，
// 只把结果映射成 core/task 的 PlanDecision，避免 chat 依赖 tasks 包。
// C0/C1 不写库，RequiresConfirmation 为 false，调用方直接回答、不建任务（DEC-43）。
func (m *Module) PlanTask(ctx context.Context, sessionID string, input coretask.PlanRequest) (coretask.PlanDecision, error) {
	result, err := m.CreateTaskPlan(ctx, sessionID, coretask.TaskPlanInput{
		RequestText: input.RequestText,
		Title:       input.Title,
		Goal:        input.Goal,
		Steps:       input.Steps,
		StepReason:  input.StepReason,
		MultiRound:  input.MultiRound,
		CrossDomain: input.CrossDomain,
	})
	if err != nil {
		return coretask.PlanDecision{}, err
	}
	decision := coretask.PlanDecision{
		Complexity:        result.Complexity.Complexity,
		Reason:            result.Complexity.Reason,
		TaskCount:         result.Complexity.TaskCount,
		ChildSessionCount: result.Complexity.ChildSessionCount,
	}
	if result.Plan != nil {
		decision.RequiresConfirmation = true
		decision.PlanID = result.Plan.ID
		decision.PlanMessageID = result.Plan.PlanMessageID
	}
	return decision, nil
}

// CreateTaskPlan 计算等级；C0/C1 只返回分级（发一条分级事件后即返回），C2+ 落 pending 方案与方案卡，都不建任务/子会话。
func (m *Module) CreateTaskPlan(ctx context.Context, sessionID string, input coretask.TaskPlanInput) (PlanCreateResult, error) {
	if strings.TrimSpace(sessionID) == "" {
		return PlanCreateResult{}, newConvError(http.StatusNotFound, "task_not_found", "会话不存在")
	}
	classification := coretask.Classify(coretask.ComplexityInput{
		Steps: input.Steps, StepReason: input.StepReason, Tasks: input.Tasks,
		MultiRound: input.MultiRound, CrossDomain: input.CrossDomain,
	})
	result := PlanCreateResult{Complexity: classification}
	if classification.Complexity == coretask.ComplexityC0 || classification.Complexity == coretask.ComplexityC1 {
		m.emitComplexityClassified(ctx, sessionID, "", classification)
		return result, nil
	}

	now := time.Now().UnixMilli()
	steps := planStepsFromInput(input)
	plan := coretask.TaskPlan{
		ID:                "plan-" + randomHex(8),
		SessionID:         sessionID,
		Complexity:        classification.Complexity,
		Status:            coretask.PlanStatusPending,
		PlanMessageID:     "msg-" + randomHex(8),
		ChildSessionIDs:   []string{},
		TaskIDs:           []string{},
		PlanSteps:         steps,
		RequestText:       strings.TrimSpace(input.RequestText),
		TaskCount:         classification.TaskCount,
		ChildSessionCount: classification.ChildSessionCount,
		Attempt:           0,
		CreatedAt:         now,
		// 12 小时只是概览提示的标记时间，不触发自动执行（DEC-39）。
		ExpiresAt: now + 12*60*60*1000,
	}
	childJSON, _ := json.Marshal(plan.ChildSessionIDs)
	taskJSON, _ := json.Marshal(plan.TaskIDs)
	stepsJSON, _ := json.Marshal(plan.PlanSteps)
	text := planMessageText(plan, classification.StepCount, classification.Reason)
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO task_plans(
			id, session_id, complexity, status, plan_message_id, plan_steps_json,
			child_session_ids, task_ids_json, request_text, task_count, child_session_count,
			attempt, created_at, decided_at, expires_at, rejected_reason)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '')`,
			plan.ID, plan.SessionID, plan.Complexity, plan.Status, plan.PlanMessageID, string(stepsJSON),
			string(childJSON), string(taskJSON), plan.RequestText, plan.TaskCount, plan.ChildSessionCount,
			plan.Attempt, plan.CreatedAt, plan.ExpiresAt); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO messages(
			id, session_id, role, text, at, status, category, finished_at)
			VALUES (?, ?, 'agent', ?, ?, 'done', 'confirmation', 0)`,
			plan.PlanMessageID, sessionID, text, now)
		return err
	}); err != nil {
		return PlanCreateResult{}, fmt.Errorf("写任务方案失败: %w", err)
	}
	result.Plan = &plan
	result.PlanMessage = &messageRow{ID: plan.PlanMessageID, SessionID: sessionID, Text: text, At: now}
	m.emitComplexityClassified(ctx, sessionID, plan.ID, classification)
	m.emit(ctx, eventlog.TypeMessageCreated, map[string]any{
		"id": plan.PlanMessageID, "sessionId": sessionID, "category": "confirmation", "at": now,
	})
	return result, nil
}

// ConfirmTaskPlan 确认方案并在一个事务里派生任务与子会话；重复确认返回同一结果（幂等）。
func (m *Module) ConfirmTaskPlan(ctx context.Context, sessionID, planID string) (coretask.TaskPlan, []coretask.Task, error) {
	now := time.Now().UnixMilli()
	var plan coretask.TaskPlan
	var tasks []coretask.Task
	changed := false
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		current, err := getTaskPlanTx(ctx, tx, sessionID, planID)
		if err != nil {
			return err
		}
		if current.Status == coretask.PlanStatusRejected {
			return newConvError(http.StatusConflict, "task_plan_rejected", "方案已拒绝，不能确认")
		}
		if current.Status == coretask.PlanStatusConfirmed {
			plan = current
			return nil
		}
		children, err := createChildSessionsTx(ctx, tx, current, now)
		if err != nil {
			return err
		}
		built, taskIDs, err := m.materializePlanTx(ctx, tx, current, children, now)
		if err != nil {
			return err
		}
		childJSON, _ := json.Marshal(children)
		taskJSON, _ := json.Marshal(taskIDs)
		if _, err := tx.ExecContext(ctx, `UPDATE task_plans SET status = ?, attempt = 1,
			decided_at = ?, child_session_ids = ?, task_ids_json = ? WHERE id = ?`,
			coretask.PlanStatusConfirmed, now, string(childJSON), string(taskJSON), current.ID); err != nil {
			return err
		}
		current.Status = coretask.PlanStatusConfirmed
		current.Attempt = 1
		current.DecidedAt = now
		current.ChildSessionIDs = children
		current.TaskIDs = taskIDs
		plan = current
		tasks = built
		changed = true
		return nil
	})
	if err != nil {
		return coretask.TaskPlan{}, nil, err
	}
	if len(tasks) == 0 && len(plan.TaskIDs) > 0 {
		// 重复确认：从库中取回首次派生结果，保持响应稳定。
		for _, id := range plan.TaskIDs {
			task, err := m.Get(ctx, id)
			if err == nil {
				tasks = append(tasks, task)
			}
		}
	}
	if changed {
		m.emit(ctx, eventlog.TypeTaskConfirmed, map[string]any{
			"session_id": sessionID, "plan_id": plan.ID, "complexity": plan.Complexity,
			"child_session_ids": plan.ChildSessionIDs, "task_ids": plan.TaskIDs,
			"task_count": len(plan.TaskIDs), "child_session_count": len(plan.ChildSessionIDs),
		})
		for _, task := range tasks {
			m.emit(ctx, eventlog.TypeTaskCreated, taskEvent(task, "", ""))
		}
		// 确认即执行：派生任务走与批量创建相同的入队路径，否则 queued 只在启动恢复时被消费，任务会一直停在 pending（DEC-43）。
		for _, task := range tasks {
			m.afterCreate(ctx, task, nil, nil)
		}
	}
	return plan, tasks, nil
}

// RejectTaskPlan 只把 pending 方案标为 rejected，不派生任何任务/子会话。
func (m *Module) RejectTaskPlan(ctx context.Context, sessionID, planID, reason string) (coretask.TaskPlan, error) {
	now := time.Now().UnixMilli()
	var plan coretask.TaskPlan
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		current, err := getTaskPlanTx(ctx, tx, sessionID, planID)
		if err != nil {
			return err
		}
		if current.Status == coretask.PlanStatusConfirmed {
			return newConvError(http.StatusConflict, "task_plan_confirmed", "方案已确认，不能拒绝")
		}
		if current.Status == coretask.PlanStatusRejected {
			plan = current
			return nil
		}
		reason = strings.TrimSpace(reason)
		if _, err := tx.ExecContext(ctx, `UPDATE task_plans SET status = ?, decided_at = ?, rejected_reason = ? WHERE id = ?`,
			coretask.PlanStatusRejected, now, reason, current.ID); err != nil {
			return err
		}
		current.Status = coretask.PlanStatusRejected
		current.DecidedAt = now
		current.RejectedReason = reason
		plan = current
		return nil
	})
	if err != nil {
		return coretask.TaskPlan{}, err
	}
	return plan, nil
}

func (m *Module) GetTaskPlan(ctx context.Context, sessionID, planID string) (coretask.TaskPlan, error) {
	row := m.store.QueryRow(ctx, planSelect+` WHERE session_id = ? AND id = ?`, sessionID, planID)
	plan, err := scanTaskPlan(row)
	if err == sql.ErrNoRows {
		return coretask.TaskPlan{}, newConvError(http.StatusNotFound, "task_plan_not_found", "方案不存在")
	}
	return plan, err
}

func (m *Module) ListTaskPlans(ctx context.Context, sessionID string) ([]coretask.TaskPlan, error) {
	rows, err := m.store.Query(ctx, planSelect+` WHERE session_id = ? ORDER BY created_at DESC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	plans := make([]coretask.TaskPlan, 0)
	for rows.Next() {
		plan, err := scanTaskPlan(rows)
		if err != nil {
			return nil, err
		}
		plans = append(plans, plan)
	}
	return plans, rows.Err()
}

func getTaskPlanTx(ctx context.Context, tx *sql.Tx, sessionID, planID string) (coretask.TaskPlan, error) {
	row := tx.QueryRowContext(ctx, planSelect+` WHERE session_id = ? AND id = ?`, sessionID, planID)
	plan, err := scanTaskPlan(row)
	if err == sql.ErrNoRows {
		return coretask.TaskPlan{}, newConvError(http.StatusNotFound, "task_plan_not_found", "方案不存在")
	}
	return plan, err
}

// createChildSessionsTx 直接写 sessions/specs，保证与任务派生同事务提交。
func createChildSessionsTx(ctx context.Context, tx *sql.Tx, plan coretask.TaskPlan, now int64) ([]string, error) {
	count := plan.ChildSessionCount
	if count <= 0 {
		return []string{}, nil
	}
	base := strings.TrimSpace(plan.RequestText)
	if base == "" {
		base = "任务"
	}
	ids := make([]string, 0, count)
	for i := 0; i < count; i++ {
		id := "sess-" + randomHex(8)
		title := base
		if count > 1 {
			title = fmt.Sprintf("%s · 子会话 %d", base, i+1)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO sessions(
			id, parent_id, title, created_at, archived, pinned, owner_agent_id)
			VALUES (?, ?, ?, ?, 0, 0, 'simo')`, id, plan.SessionID, title, now); err != nil {
			return nil, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO specs(
			id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at)
			VALUES (?, ?, 'draft', 1, '[]', '[]', ?, ?)`, "spec-"+id, id, now, now); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// materializePlanTx 按等级派生：C2 当前会话 1 个任务；C3 1 个子会话内 1 个；C4 3–4 个子会话各 1 个。
// 父会话在 C3/C4 不建任务。
func (m *Module) materializePlanTx(ctx context.Context, tx *sql.Tx, plan coretask.TaskPlan,
	children []string, now int64) ([]coretask.Task, []string, error) {
	count := plan.TaskCount
	if count < 1 {
		count = 1
	}
	base := strings.TrimSpace(plan.RequestText)
	if base == "" {
		base = "任务"
	}
	steps := plan.PlanSteps
	if len(steps) == 0 {
		for _, step := range defaultSteps() {
			steps = append(steps, step.Title)
		}
	}
	built := make([]coretask.Task, 0, count)
	taskIDs := make([]string, 0, count)
	for i := 0; i < count; i++ {
		target := plan.SessionID
		title := base
		if plan.Complexity != coretask.ComplexityC2 {
			if i >= len(children) {
				break
			}
			target = children[i]
			if count > 1 {
				title = fmt.Sprintf("%s · 子任务 %d", base, i+1)
			}
		}
		task := coretask.Task{
			ID:         "task-" + randomHex(8),
			SessionID:  target,
			Title:      title,
			Kind:       "mock",
			Status:     coretask.StatusQueued,
			Payload:    title,
			Phases:     defaultPhases(),
			Progress:   0,
			Attempt:    1,
			OrderIndex: i,
			Mode:       "plan",
			Goal:       title,
			BudgetJSON: m.newBudgetJSON(),
			CreatedAt:  now,
			UpdatedAt:  now,
			Complexity: plan.Complexity,
		}
		task.Steps = make([]coretask.Step, 0, len(steps))
		convSteps := make([]ConvStep, 0, len(steps))
		for j, stepTitle := range steps {
			stepID := "step-" + randomHex(8)
			task.Steps = append(task.Steps, coretask.Step{ID: stepID, Title: stepTitle, Status: "pending"})
			convSteps = append(convSteps, ConvStep{ID: stepID, TaskID: task.ID, Seq: j + 1, Title: stepTitle, Status: "pending"})
		}
		if err := saveTaskConvTx(ctx, tx, task); err != nil {
			return nil, nil, err
		}
		if err := replaceSteps(ctx, tx, task.ID, convSteps); err != nil {
			return nil, nil, err
		}
		messageID := "msg-" + randomHex(8)
		if _, err := tx.ExecContext(ctx, `INSERT INTO messages(
			id, session_id, role, text, at, status, task_id, category, finished_at)
			VALUES (?, ?, 'agent', ?, ?, 'done', ?, 'task', 0)`,
			messageID, target, title, now, task.ID); err != nil {
			return nil, nil, err
		}
		built = append(built, task)
		taskIDs = append(taskIDs, task.ID)
	}
	return built, taskIDs, nil
}
