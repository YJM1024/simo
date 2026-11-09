package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"simo/internal/platform/httpserver"
)

const (
	scheduleOnce     = "once"
	scheduleInterval = "interval"
	scheduleDaily    = "daily"
	scheduleWeekly   = "weekly"
	scheduleCron     = "cron"

	scheduleTick = 5 * time.Second
)

// Schedule 是 M13 定时任务投影。
type Schedule struct {
	ID          string          `json:"id"`
	SessionID   string          `json:"sessionId"`
	Title       string          `json:"title"`
	Trigger     ScheduleTrigger `json:"trigger"`
	TriggerType string          `json:"triggerType,omitempty"`
	TriggerExpr string          `json:"triggerExpr,omitempty"`
	Prompt      string          `json:"prompt"`
	Enabled     bool            `json:"enabled"`
	NextRunAt   int64           `json:"nextRunAt"`
	LastRunAt   int64           `json:"lastRunAt"`
	LastStatus  string          `json:"lastStatus"`
	RunCount    int             `json:"runCount"`
	CreatedAt   int64           `json:"createdAt"`
	UpdatedAt   int64           `json:"updatedAt"`
}

// ScheduleTrigger 是触发配置。
type ScheduleTrigger struct {
	Type     string `json:"type"`
	Expr     string `json:"expr"`
	Timezone string `json:"timezone,omitempty"`
}

// UnmarshalJSON 兼容 expr 为字符串或数字（interval 秒）。
func (t *ScheduleTrigger) UnmarshalJSON(data []byte) error {
	var aux struct {
		Type     string          `json:"type"`
		Expr     json.RawMessage `json:"expr"`
		Timezone string          `json:"timezone"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}
	t.Type = aux.Type
	t.Timezone = aux.Timezone
	raw := strings.TrimSpace(string(aux.Expr))
	if raw == "" || raw == "null" {
		t.Expr = ""
		return nil
	}
	if strings.HasPrefix(raw, `"`) {
		var value string
		if err := json.Unmarshal(aux.Expr, &value); err != nil {
			return err
		}
		t.Expr = value
		return nil
	}
	t.Expr = raw
	return nil
}

type scheduleInput struct {
	SessionID   string           `json:"sessionId"`
	Title       string           `json:"title"`
	Trigger     *ScheduleTrigger `json:"trigger"`
	TriggerType string           `json:"triggerType"`
	TriggerExpr string           `json:"triggerExpr"`
	Timezone    string           `json:"timezone"`
	Prompt      string           `json:"prompt"`
	Enabled     *bool            `json:"enabled"`
}

func (m *Module) registerScheduleHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/schedules", m.handleScheduleList)
	mux.HandleFunc("POST /api/schedules", m.handleScheduleCreate)
	mux.HandleFunc("GET /api/schedules/{id}", m.handleScheduleGet)
	mux.HandleFunc("PATCH /api/schedules/{id}", m.handleSchedulePatch)
	mux.HandleFunc("DELETE /api/schedules/{id}", m.handleScheduleDelete)
	mux.HandleFunc("POST /api/schedules/{id}/run-now", m.handleScheduleRunNow)
}

func (m *Module) startScheduler(parent context.Context) {
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	m.schedCancel = cancel
	m.schedWG.Add(1)
	go func() {
		defer m.schedWG.Done()
		m.schedulerLoop(ctx)
	}()
	m.schedWG.Add(1)
	go func() {
		defer m.schedWG.Done()
		// 等其余模块 Start 完成后再补投，避免恢复任务早于 tasks 模块就绪。
		select {
		case <-ctx.Done():
			return
		case <-time.After(750 * time.Millisecond):
		}
		m.recoverSchedules(ctx)
	}()
}

func (m *Module) stopScheduler() {
	if m.schedCancel != nil {
		m.schedCancel()
	}
	m.schedWG.Wait()
}

func (m *Module) schedulerLoop(ctx context.Context) {
	ticker := time.NewTicker(scheduleTick)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.runDueSchedules(ctx)
		}
	}
}

func (m *Module) runDueSchedules(ctx context.Context) {
	now := time.Now().UnixMilli()
	rows, err := m.store.Query(ctx, `SELECT id FROM schedules
		WHERE enabled = 1 AND next_run_at > 0 AND next_run_at <= ?`, now)
	if err != nil {
		return
	}
	ids := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	for _, id := range ids {
		schedule, err := m.getSchedule(context.Background(), id)
		if err != nil || schedule.NextRunAt <= 0 || schedule.NextRunAt > time.Now().UnixMilli() {
			continue
		}
		due := schedule.NextRunAt
		m.fireSchedule(schedule, due, false)
	}
}

func (m *Module) recoverSchedules(ctx context.Context) {
	rows, err := m.store.Query(ctx, `SELECT id FROM schedules WHERE enabled = 1`)
	if err != nil {
		return
	}
	ids := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	now := time.Now().UnixMilli()
	for _, id := range ids {
		schedule, err := m.getSchedule(ctx, id)
		if err != nil {
			continue
		}
		if schedule.NextRunAt <= 0 {
			if next := m.computeNext(schedule, now); next > 0 {
				_ = m.setScheduleNext(schedule.ID, next)
			}
			continue
		}
		if schedule.NextRunAt <= now {
			due := schedule.NextRunAt
			// 停机错过：只补最近一次；后续 next 从当前时间重算。
			m.fireSchedule(schedule, due, false)
		}
	}
}

func (m *Module) getSchedule(ctx context.Context, id string) (Schedule, error) {
	var s Schedule
	var enabled int
	err := m.store.QueryRow(ctx, `SELECT id, session_id, title, trigger_type, trigger_expr, timezone,
		prompt, enabled, next_run_at, last_run_at, last_status, run_count, created_at, updated_at
		FROM schedules WHERE id = ?`, strings.TrimSpace(id)).
		Scan(&s.ID, &s.SessionID, &s.Title, &s.Trigger.Type, &s.Trigger.Expr, &s.Trigger.Timezone,
			&s.Prompt, &enabled, &s.NextRunAt, &s.LastRunAt, &s.LastStatus, &s.RunCount, &s.CreatedAt, &s.UpdatedAt)
	if err == sql.ErrNoRows {
		return Schedule{}, errScheduleNotFound
	}
	if err != nil {
		return Schedule{}, err
	}
	s.Enabled = enabled != 0
	s.TriggerType = s.Trigger.Type
	s.TriggerExpr = s.Trigger.Expr
	return s, nil
}

func normalizeScheduleView(s *Schedule) {
	s.TriggerType = s.Trigger.Type
	s.TriggerExpr = s.Trigger.Expr
}

var errScheduleNotFound = fmt.Errorf("定时任务不存在")
var errScheduleInvalid = fmt.Errorf("定时任务参数非法")

func (m *Module) listSchedules(ctx context.Context) ([]Schedule, error) {
	rows, err := m.store.Query(ctx, `SELECT id, session_id, title, trigger_type, trigger_expr, timezone,
		prompt, enabled, next_run_at, last_run_at, last_status, run_count, created_at, updated_at
		FROM schedules ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	out := make([]Schedule, 0, 8)
	for rows.Next() {
		var s Schedule
		var enabled int
		if err := rows.Scan(&s.ID, &s.SessionID, &s.Title, &s.Trigger.Type, &s.Trigger.Expr, &s.Trigger.Timezone,
			&s.Prompt, &enabled, &s.NextRunAt, &s.LastRunAt, &s.LastStatus, &s.RunCount, &s.CreatedAt, &s.UpdatedAt); err != nil {
			_ = rows.Close()
			return nil, err
		}
		s.Enabled = enabled != 0
		normalizeScheduleView(&s)
		out = append(out, s)
	}
	_ = rows.Close()
	return out, rows.Err()
}

func (m *Module) createSchedule(ctx context.Context, input scheduleInput) (Schedule, error) {
	trigger, err := scheduleTriggerFromInput(input)
	if err != nil {
		return Schedule{}, err
	}
	prompt := strings.TrimSpace(input.Prompt)
	if prompt == "" {
		return Schedule{}, fmt.Errorf("%w: prompt 不能为空", errScheduleInvalid)
	}
	sessionID := strings.TrimSpace(input.SessionID)
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	if m.sessions != nil {
		if _, err := m.sessions.Get(ctx, sessionID); err != nil {
			if created, createErr := m.sessions.Create(ctx, "", firstNonEmpty(input.Title, "定时任务")); createErr == nil {
				sessionID = created.ID
			}
		}
	}
	if _, err := nextScheduleTime(trigger, time.Now(), 0); err != nil {
		return Schedule{}, err
	}
	now := time.Now().UnixMilli()
	s := Schedule{
		ID: newID("sch"), SessionID: sessionID, Title: strings.TrimSpace(input.Title),
		Trigger: trigger, Prompt: prompt, Enabled: true, LastStatus: "pending",
		CreatedAt: now, UpdatedAt: now,
	}
	if input.Enabled != nil {
		s.Enabled = *input.Enabled
	}
	if s.Title == "" {
		s.Title = "定时任务"
	}
	if s.Enabled {
		s.NextRunAt = m.computeNext(s, now)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO schedules(
			id, session_id, title, trigger_type, trigger_expr, timezone, prompt, enabled,
			next_run_at, last_run_at, last_status, run_count, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)`,
			s.ID, s.SessionID, s.Title, s.Trigger.Type, s.Trigger.Expr, s.Trigger.Timezone,
			s.Prompt, boolInt(s.Enabled), s.NextRunAt, s.LastStatus, s.CreatedAt, s.UpdatedAt)
		return err
	}); err != nil {
		return Schedule{}, err
	}
	normalizeScheduleView(&s)
	return s, nil
}

func (m *Module) updateSchedule(ctx context.Context, id string, input scheduleInput) (Schedule, error) {
	s, err := m.getSchedule(ctx, id)
	if err != nil {
		return Schedule{}, err
	}
	if strings.TrimSpace(input.Title) != "" {
		s.Title = strings.TrimSpace(input.Title)
	}
	if strings.TrimSpace(input.Prompt) != "" {
		s.Prompt = strings.TrimSpace(input.Prompt)
	}
	if input.Trigger != nil || strings.TrimSpace(input.TriggerType) != "" {
		trigger, err := scheduleTriggerFromInput(input)
		if err != nil {
			return Schedule{}, err
		}
		s.Trigger = trigger
	}
	if input.Enabled != nil {
		s.Enabled = *input.Enabled
	}
	if s.Enabled {
		s.NextRunAt = m.computeNext(s, time.Now().UnixMilli())
	} else {
		s.NextRunAt = 0
	}
	s.UpdatedAt = time.Now().UnixMilli()
	if err := m.saveSchedule(ctx, s); err != nil {
		return Schedule{}, err
	}
	normalizeScheduleView(&s)
	return s, nil
}

func (m *Module) saveSchedule(ctx context.Context, s Schedule) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE schedules SET title = ?, trigger_type = ?, trigger_expr = ?,
			timezone = ?, prompt = ?, enabled = ?, next_run_at = ?, last_run_at = ?, last_status = ?,
			run_count = ?, updated_at = ? WHERE id = ?`,
			s.Title, s.Trigger.Type, s.Trigger.Expr, s.Trigger.Timezone, s.Prompt, boolInt(s.Enabled),
			s.NextRunAt, s.LastRunAt, s.LastStatus, s.RunCount, s.UpdatedAt, s.ID)
		return err
	})
}

func (m *Module) setScheduleNext(id string, next int64) error {
	return m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE schedules SET next_run_at = ?, updated_at = ? WHERE id = ?`,
			next, time.Now().UnixMilli(), id)
		return err
	})
}

// fireSchedule 执行一次投递；scheduleId+dueAt 幂等，重复调用直接跳过。
func (m *Module) fireSchedule(s Schedule, due int64, manual bool) {
	claimed := false
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		res, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO schedule_fires(
			schedule_id, due_at, created_at) VALUES (?, ?, ?)`, s.ID, due, time.Now().UnixMilli())
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		claimed = n > 0
		return nil
	})
	if !claimed {
		return
	}
	next := s.NextRunAt
	enabledExpr := "CASE WHEN trigger_type = 'once' THEN 0 ELSE enabled END"
	if !manual {
		next = 0
		if s.Enabled && s.Trigger.Type != scheduleOnce {
			next = m.computeNext(s, time.Now().UnixMilli())
		}
	}
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE schedules SET last_run_at = ?,
			last_status = 'running', run_count = run_count + 1, next_run_at = ?,
			enabled = `+enabledExpr+`, updated_at = ? WHERE id = ?`,
			time.Now().UnixMilli(), next, time.Now().UnixMilli(), s.ID)
		return err
	})
	go m.deliverSchedule(s, due, manual)
}

func (m *Module) deliverSchedule(s Schedule, due int64, manual bool) {
	startedAt := time.Now().UnixMilli()
	var err error
	for attempt := 0; attempt <= 2; attempt++ {
		_, err = m.startTurn(context.Background(), s.SessionID, s.Prompt, "", nil, "")
		if err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err != nil {
		m.finishSchedule(s.ID, "failed", "定时任务投递失败（已重试 2 次）："+err.Error())
		return
	}
	deadline := time.Now().Add(45 * time.Second)
	graceUntil := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		// 无人应答的审批：暂停 schedule 并汇报（fail-closed）。
		if id := m.pendingApprovalForSession(s.SessionID, startedAt); id != "" {
			m.finishSchedule(s.ID, "failed", "需要审批但无人应答，已暂停该定时任务。")
			m.pauseScheduleAfterApproval(s, id)
			return
		}
		if !m.sessionTurnActive(s.SessionID) && time.Now().After(graceUntil) {
			m.finishSchedule(s.ID, "done", "")
			return
		}
		time.Sleep(250 * time.Millisecond)
	}
	m.finishSchedule(s.ID, "failed", "")
}

func (m *Module) finishSchedule(id, status, report string) {
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE schedules SET last_status = ?, updated_at = ? WHERE id = ?`,
			status, time.Now().UnixMilli(), id)
		return err
	})
	if report != "" {
		s, err := m.getSchedule(context.Background(), id)
		if err == nil {
			m.appendScheduleMessage(s.SessionID, report)
		}
	}
}

func (m *Module) pauseScheduleAfterApproval(s Schedule, approvalID string) {
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE schedules SET enabled = 0, next_run_at = 0,
			last_status = 'failed', updated_at = ? WHERE id = ?`, time.Now().UnixMilli(), s.ID)
		return err
	})
	m.appendScheduleMessage(s.SessionID, fmt.Sprintf("定时任务「%s」需要审批（approvalId=%s），当前无人应答，已自动暂停；处理后可在定时任务中重新启用或立即运行。", s.Title, approvalID))
}

func (m *Module) appendScheduleMessage(sessionID, text string) {
	msg := Message{ID: newID("msg"), SessionID: sessionID, Role: RoleAgent, Text: text,
		At: time.Now().UnixMilli(), Status: StatusDone, Attachments: []Attachment{},
		Category: CategoryProgress, SessionPath: m.sessionPath(context.Background(), sessionID),
		AgentID: m.sessionOwnerAgentID(context.Background(), sessionID)}
	_ = m.createMessage(context.Background(), msg)
	if m.events != nil {
		_, _ = m.events.Append(context.Background(), "message.created", msg)
	}
}

func (m *Module) pendingApprovalForSession(sessionID string, since int64) string {
	var id string
	err := m.store.QueryRow(context.Background(), `SELECT id FROM approvals
		WHERE session_id = ? AND status = 'pending' AND created_at >= ? LIMIT 1`, sessionID, since).Scan(&id)
	if err != nil {
		return ""
	}
	return id
}

func (m *Module) sessionTurnActive(sessionID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.active[sessionID]
	return ok
}

func (m *Module) handleScheduleList(w http.ResponseWriter, r *http.Request) {
	list, err := m.listSchedules(r.Context())
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取定时任务失败")
		return
	}
	if list == nil {
		list = []Schedule{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "schedules": list})
}

func (m *Module) handleScheduleCreate(w http.ResponseWriter, r *http.Request) {
	var input scheduleInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "JSON 非法")
		return
	}
	s, err := m.createSchedule(r.Context(), input)
	if err != nil {
		writeScheduleError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusCreated, map[string]any{"ok": true, "schedule": s})
}

func (m *Module) handleScheduleGet(w http.ResponseWriter, r *http.Request) {
	s, err := m.getSchedule(r.Context(), r.PathValue("id"))
	if err != nil {
		writeScheduleError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "schedule": s})
}

func (m *Module) handleSchedulePatch(w http.ResponseWriter, r *http.Request) {
	var input scheduleInput
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "JSON 非法")
		return
	}
	s, err := m.updateSchedule(r.Context(), r.PathValue("id"), input)
	if err != nil {
		writeScheduleError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "schedule": s})
}

func (m *Module) handleScheduleDelete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	if _, err := m.getSchedule(r.Context(), id); err != nil {
		writeScheduleError(w, err)
		return
	}
	if err := m.store.Write(r.Context(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(r.Context(), `DELETE FROM schedules WHERE id = ?`, id)
		return err
	}); err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "删除定时任务失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (m *Module) handleScheduleRunNow(w http.ResponseWriter, r *http.Request) {
	s, err := m.getSchedule(r.Context(), r.PathValue("id"))
	if err != nil {
		writeScheduleError(w, err)
		return
	}
	m.fireSchedule(s, time.Now().UnixMilli(), true)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "scheduleId": s.ID})
}

func writeScheduleError(w http.ResponseWriter, err error) {
	switch {
	case err == errScheduleNotFound:
		httpserver.WriteError(w, http.StatusNotFound, "定时任务不存在")
	case errors.Is(err, errScheduleInvalid) || strings.Contains(err.Error(), "cron") ||
		strings.Contains(err.Error(), "时间") || strings.Contains(err.Error(), "trigger"):
		httpserver.WriteError(w, http.StatusBadRequest, err.Error())
	default:
		httpserver.WriteError(w, http.StatusBadRequest, err.Error())
	}
}

func scheduleTriggerFromInput(input scheduleInput) (ScheduleTrigger, error) {
	trigger := ScheduleTrigger{}
	if input.Trigger != nil {
		trigger = *input.Trigger
	}
	if strings.TrimSpace(trigger.Type) == "" {
		trigger.Type = strings.TrimSpace(input.TriggerType)
	}
	if strings.TrimSpace(trigger.Expr) == "" {
		trigger.Expr = strings.TrimSpace(input.TriggerExpr)
	}
	if strings.TrimSpace(trigger.Timezone) == "" {
		trigger.Timezone = strings.TrimSpace(input.Timezone)
	}
	trigger.Type = strings.ToLower(strings.TrimSpace(trigger.Type))
	trigger.Expr = strings.TrimSpace(trigger.Expr)
	trigger.Timezone = strings.TrimSpace(trigger.Timezone)
	if trigger.Type == "" {
		return ScheduleTrigger{}, fmt.Errorf("%w: trigger.type 不能为空", errScheduleInvalid)
	}
	switch trigger.Type {
	case scheduleOnce, scheduleInterval, scheduleDaily, scheduleWeekly, scheduleCron:
	default:
		return ScheduleTrigger{}, fmt.Errorf("%w: trigger.type 只支持 once/interval/daily/weekly/cron", errScheduleInvalid)
	}
	if trigger.Expr == "" {
		return ScheduleTrigger{}, fmt.Errorf("%w: trigger.expr 不能为空", errScheduleInvalid)
	}
	if _, err := loadScheduleLocation(trigger.Timezone); err != nil {
		return ScheduleTrigger{}, fmt.Errorf("%w: 时区非法", errScheduleInvalid)
	}
	if _, err := nextScheduleTime(trigger, time.Now(), 1); err != nil {
		return ScheduleTrigger{}, fmt.Errorf("%w: %v", errScheduleInvalid, err)
	}
	return trigger, nil
}

func loadScheduleLocation(name string) (*time.Location, error) {
	if strings.TrimSpace(name) == "" || strings.EqualFold(name, "local") {
		return time.Local, nil
	}
	return time.LoadLocation(name)
}

func nextScheduleTime(trigger ScheduleTrigger, now time.Time, afterCount int) (int64, error) {
	loc, err := loadScheduleLocation(trigger.Timezone)
	if err != nil {
		return 0, err
	}
	switch trigger.Type {
	case scheduleOnce:
		parsed, err := parseOnceTime(trigger.Expr, loc)
		if err != nil {
			return 0, err
		}
		return parsed.UnixMilli(), nil
	case scheduleInterval:
		seconds, err := strconv.Atoi(trigger.Expr)
		if err != nil || seconds <= 0 {
			return 0, fmt.Errorf("interval 需要正整数秒")
		}
		return now.Add(time.Duration(seconds) * time.Second).UnixMilli(), nil
	case scheduleDaily:
		hour, minute, err := parseClock(trigger.Expr)
		if err != nil {
			return 0, err
		}
		next := time.Date(now.In(loc).Year(), now.In(loc).Month(), now.In(loc).Day(), hour, minute, 0, 0, loc)
		if !next.After(now.In(loc)) {
			next = next.AddDate(0, 0, 1)
		}
		return next.UnixMilli(), nil
	case scheduleWeekly:
		weekday, hour, minute, err := parseWeekly(trigger.Expr)
		if err != nil {
			return 0, err
		}
		local := now.In(loc)
		delta := (weekday - int(local.Weekday()) + 7) % 7
		next := time.Date(local.Year(), local.Month(), local.Day(), hour, minute, 0, 0, loc).AddDate(0, 0, delta)
		if !next.After(local) {
			next = next.AddDate(0, 0, 7)
		}
		return next.UnixMilli(), nil
	case scheduleCron:
		return nextCronTime(trigger.Expr, now, loc)
	}
	return 0, fmt.Errorf("未知 trigger.type")
}

func (m *Module) computeNext(s Schedule, nowMillis int64) int64 {
	next, err := nextScheduleTime(s.Trigger, time.UnixMilli(nowMillis), 0)
	if err != nil {
		return 0
	}
	return next
}

func parseOnceTime(expr string, loc *time.Location) (time.Time, error) {
	expr = strings.TrimSpace(expr)
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02T15:04"} {
		if parsed, err := time.ParseInLocation(layout, expr, loc); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("once 需要 ISO 时间")
}

func parseClock(expr string) (int, int, error) {
	parts := strings.Split(strings.TrimSpace(expr), ":")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("时间需要 HH:MM")
	}
	hour, errH := strconv.Atoi(parts[0])
	minute, errM := strconv.Atoi(parts[1])
	if errH != nil || errM != nil || hour < 0 || hour > 23 || minute < 0 || minute > 59 {
		return 0, 0, fmt.Errorf("时间需要 HH:MM")
	}
	return hour, minute, nil
}

func parseWeekly(expr string) (int, int, int, error) {
	text := strings.TrimSpace(expr)
	text = strings.ReplaceAll(text, "|", " ")
	text = strings.ReplaceAll(text, ",", " ")
	if idx := strings.IndexAny(text, "Tt"); idx > 0 {
		text = text[:idx] + " " + text[idx+1:]
	}
	fields := strings.Fields(text)
	if len(fields) != 2 {
		return 0, 0, 0, fmt.Errorf("weekly 需要 ISO 周几 + HH:MM")
	}
	weekdayNames := map[string]int{"mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6, "sun": 7}
	weekday, err := strconv.Atoi(fields[0])
	if err != nil {
		value, ok := weekdayNames[strings.ToLower(fields[0])]
		if !ok {
			return 0, 0, 0, fmt.Errorf("weekly 周几需为 1-7")
		}
		weekday = value
	}
	if weekday < 1 || weekday > 7 {
		return 0, 0, 0, fmt.Errorf("weekly 周几需为 1-7")
	}
	hour, minute, err := parseClock(fields[1])
	if err != nil {
		return 0, 0, 0, err
	}
	// Go: Sunday=0；ISO: Monday=1..Sunday=7。
	goWeekday := weekday % 7
	return goWeekday, hour, minute, nil
}

type cronSpec struct {
	minutes, hours, doms, months, dows []int
	domRestricted, dowRestricted       bool
}

func parseCron(expr string) (cronSpec, error) {
	fields := strings.Fields(strings.TrimSpace(expr))
	if len(fields) != 5 {
		return cronSpec{}, fmt.Errorf("cron 需要五段表达式")
	}
	var spec cronSpec
	var err error
	if spec.minutes, err = parseCronField(fields[0], 0, 59); err != nil {
		return spec, err
	}
	if spec.hours, err = parseCronField(fields[1], 0, 23); err != nil {
		return spec, err
	}
	if spec.doms, err = parseCronField(fields[2], 1, 31); err != nil {
		return spec, err
	}
	if spec.months, err = parseCronField(fields[3], 1, 12); err != nil {
		return spec, err
	}
	if spec.dows, err = parseCronField(fields[4], 0, 6); err != nil {
		return spec, err
	}
	spec.domRestricted = fields[2] != "*"
	spec.dowRestricted = fields[4] != "*"
	return spec, nil
}

func parseCronField(field string, min, max int) ([]int, error) {
	out := []int{}
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			return nil, fmt.Errorf("cron 字段非法")
		}
		step := 1
		if idx := strings.Index(part, "/"); idx >= 0 {
			value, err := strconv.Atoi(part[idx+1:])
			if err != nil || value <= 0 {
				return nil, fmt.Errorf("cron step 非法")
			}
			step = value
			part = part[:idx]
		}
		start, end := min, max
		if part != "*" {
			if idx := strings.Index(part, "-"); idx >= 0 {
				a, errA := strconv.Atoi(part[:idx])
				b, errB := strconv.Atoi(part[idx+1:])
				if errA != nil || errB != nil {
					return nil, fmt.Errorf("cron 范围非法")
				}
				start, end = a, b
			} else {
				value, err := strconv.Atoi(part)
				if err != nil {
					return nil, fmt.Errorf("cron 值非法")
				}
				start, end = value, value
			}
		}
		if start < min || end > max || start > end {
			return nil, fmt.Errorf("cron 值越界")
		}
		for value := start; value <= end; value += step {
			out = append(out, value)
		}
	}
	return out, nil
}

func nextCronTime(expr string, now time.Time, loc *time.Location) (int64, error) {
	spec, err := parseCron(expr)
	if err != nil {
		return 0, err
	}
	local := now.In(loc)
	candidate := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), 0, 0, loc).Add(time.Minute)
	for i := 0; i < 366*24*60; i++ {
		if containsInt(spec.minutes, candidate.Minute()) && containsInt(spec.hours, candidate.Hour()) &&
			containsInt(spec.months, int(candidate.Month())) {
			domMatch := containsInt(spec.doms, candidate.Day())
			dowMatch := containsInt(spec.dows, int(candidate.Weekday()))
			dayMatch := false
			if spec.domRestricted && spec.dowRestricted {
				dayMatch = domMatch || dowMatch
			} else {
				dayMatch = domMatch && dowMatch
			}
			if dayMatch {
				return candidate.UnixMilli(), nil
			}
		}
		candidate = candidate.Add(time.Minute)
	}
	return 0, fmt.Errorf("cron 未来一年无匹配")
}

func containsInt(list []int, value int) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
