package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

type runtimeConfig struct {
	StallWarnMs         int64 `json:"stallWarnMs"`
	StallPauseMs        int64 `json:"stallPauseMs"`
	WorkflowTokenBudget int64 `json:"workflowTokenBudget"`
	ApprovalTTLMs       int64 `json:"approvalTtlMs"`
	FakeNowMs           int64 `json:"fakeNowMs,omitempty"`
}

var defaultRuntimeConfig = runtimeConfig{
	StallWarnMs: 60000, StallPauseMs: 300000,
	WorkflowTokenBudget: 1000000, ApprovalTTLMs: 86400000,
}

func (m *Module) runtimeConfigSnapshot() runtimeConfig {
	m.runtimeMu.RLock()
	defer m.runtimeMu.RUnlock()
	cfg := m.runtimeCfg
	if cfg.StallWarnMs == 0 {
		cfg = defaultRuntimeConfig
	}
	return cfg
}

func (m *Module) runtimeApprovalTTL() time.Duration {
	cfg := m.runtimeConfigSnapshot()
	ttl := cfg.ApprovalTTLMs
	if ttl <= 0 {
		ttl = defaultRuntimeConfig.ApprovalTTLMs
	}
	return time.Duration(ttl) * time.Millisecond
}

func (m *Module) runtimeNow() time.Time {
	cfg := m.runtimeConfigSnapshot()
	if cfg.FakeNowMs > 0 {
		return time.UnixMilli(cfg.FakeNowMs)
	}
	return time.Now()
}

func (m *Module) startRuntime(ctx context.Context) {
	if ctx == nil {
		ctx = context.Background()
	}
	runtimeCtx, cancel := context.WithCancel(ctx)
	m.runtimeCancel = cancel
	m.runtimeWG.Add(1)
	go func() {
		defer m.runtimeWG.Done()
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-runtimeCtx.Done():
				return
			case <-ticker.C:
				m.expireApprovals()
				m.checkTurnWatchdog()
			}
		}
	}()
}

func (m *Module) stopRuntime() {
	if m.runtimeCancel != nil {
		m.runtimeCancel()
	}
	m.runtimeWG.Wait()
}

func (m *Module) expireApprovals() {
	now := m.runtimeNow().UnixMilli()
	rows, err := m.store.Query(context.Background(), `SELECT id, session_id FROM approvals
		WHERE status = 'pending' AND expires_at > 0 AND expires_at <= ?`, now)
	if err != nil {
		return
	}
	type expired struct{ id, session string }
	list := make([]expired, 0, 4)
	for rows.Next() {
		var item expired
		if rows.Scan(&item.id, &item.session) == nil {
			list = append(list, item)
		}
	}
	_ = rows.Close()
	for _, item := range list {
		if err := m.store.Write(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.ExecContext(context.Background(), `UPDATE approvals
				SET status = 'expired', result = '', decided_by = 'timeout', decided_at = ?
				WHERE id = ? AND status = 'pending'`, now, item.id)
			return err
		}); err != nil {
			continue
		}
		m.auditEvent(context.Background(), "approval.expired", map[string]any{
			"id": item.id, "sessionId": item.session, "decidedBy": "timeout",
		})
		m.insertRecoveryAction(context.Background(), "session", item.session, "superseded_approval",
			map[string]any{"approvalId": item.id, "reason": "approval timeout"})
	}
}

func (m *Module) handleRuntimeStatus(w http.ResponseWriter, r *http.Request) {
	cfg := m.runtimeConfigSnapshot()
	active := 0
	if rows, err := m.store.Query(r.Context(), `SELECT COUNT(*) FROM tasks WHERE status IN ('running','waiting_approval','queued')`); err == nil {
		if rows.Next() {
			_ = rows.Scan(&active)
		}
		_ = rows.Close()
	}
	dbBytes := int64(0)
	if home := strings.TrimSpace(os.Getenv("SIMO_HOME")); home != "" {
		if info, err := os.Stat(filepath.Join(home, "simo.db")); err == nil {
			dbBytes = info.Size()
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "version": "m19", "uptimeMs": time.Since(m.runtimeStarted).Milliseconds(),
		"activeTasks": active, "dbBytes": dbBytes,
		"budget":     map[string]any{"workflowTokenBudget": cfg.WorkflowTokenBudget},
		"recovering": false, "at": m.runtimeNow().UnixMilli(),
	})
}

func (m *Module) workflowService() coretask.WorkflowService {
	if svc, ok := m.taskSvc.(coretask.WorkflowService); ok {
		return svc
	}
	return nil
}

func (m *Module) handleWorkflowRuntime(w http.ResponseWriter, r *http.Request) {
	svc := m.workflowService()
	if svc == nil {
		httpserver.WriteError(w, http.StatusNotFound, "工作流不存在")
		return
	}
	wf, err := svc.GetWorkflow(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "工作流不存在")
		return
	}
	done := 0
	for _, task := range wf.Tasks {
		if task.Status == coretask.StatusDone {
			done++
		}
	}
	now := m.runtimeNow().UnixMilli()
	cfg := m.runtimeConfigSnapshot()
	stallState := ""
	if wf.Status == "paused" {
		stallState = "paused"
	}
	next := "等待下一任务"
	if wf.Status == "done" || wf.Status == "partial" {
		next = "已完成"
	} else if done < len(wf.Tasks) {
		next = "推进剩余任务"
	}
	eta := "未知"
	if done > 0 && len(wf.Tasks) > done {
		eta = fmt.Sprintf("约 %d 分钟", (len(wf.Tasks)-done)*2)
	}
	checkpoint := m.latestCheckpoint(r.Context(), "workflow", wf.ID)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"runtime": map[string]any{
			"id": wf.ID, "sessionId": wf.SessionID, "status": wf.Status,
			"progress":  map[string]any{"done": done, "total": len(wf.Tasks), "percent": percentage(done, len(wf.Tasks))},
			"startedAt": wf.CreatedAt, "elapsedMs": now - wf.CreatedAt,
			"nextAction": next, "etaHint": eta, "stallState": stallState, "stall": stallState != "",
			"budget":     map[string]any{"workflowTokenBudget": cfg.WorkflowTokenBudget, "remaining": cfg.WorkflowTokenBudget, "used": 0},
			"checkpoint": checkpoint, "lastCheckpointAt": checkpoint["at"],
		},
	})
}

func (m *Module) handleTaskRuntime(w http.ResponseWriter, r *http.Request) {
	if m.taskSvc == nil {
		httpserver.WriteError(w, http.StatusNotFound, "任务不存在")
		return
	}
	task, err := m.taskSvc.Get(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "任务不存在")
		return
	}
	checkpoint := m.latestCheckpoint(r.Context(), "task", task.ID)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true,
		"runtime": map[string]any{
			"id": task.ID, "sessionId": task.SessionID, "status": task.Status,
			"attempt": task.Attempt, "progress": task.Progress,
			"lastProgressAt": task.UpdatedAt, "lastHeartbeatAt": task.UpdatedAt,
			"nextAction": "继续执行当前任务", "etaHint": "未知",
			"stallState": "", "resumePoint": "next_step",
			"checkpoint": checkpoint, "lastCheckpointAt": checkpoint["at"],
			"budget": map[string]any{"taskTokenBudget": 200000, "remaining": 200000, "used": 0},
		},
	})
}

func (m *Module) handleDebugRuntimeConfig(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var req struct {
		StallWarnMs         *int64 `json:"stallWarnMs"`
		StallPauseMs        *int64 `json:"stallPauseMs"`
		WorkflowTokenBudget *int64 `json:"workflowTokenBudget"`
		ApprovalTTLMs       *int64 `json:"approvalTtlMs"`
		FakeNowMs           *int64 `json:"fakeNowMs"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	m.runtimeMu.Lock()
	if m.runtimeCfg.StallWarnMs == 0 {
		m.runtimeCfg = defaultRuntimeConfig
	}
	if req.StallWarnMs != nil && *req.StallWarnMs > 0 {
		m.runtimeCfg.StallWarnMs = *req.StallWarnMs
	}
	if req.StallPauseMs != nil && *req.StallPauseMs > 0 {
		m.runtimeCfg.StallPauseMs = *req.StallPauseMs
	}
	if req.WorkflowTokenBudget != nil && *req.WorkflowTokenBudget > 0 {
		m.runtimeCfg.WorkflowTokenBudget = *req.WorkflowTokenBudget
	}
	if req.ApprovalTTLMs != nil && *req.ApprovalTTLMs > 0 {
		m.runtimeCfg.ApprovalTTLMs = *req.ApprovalTTLMs
	}
	if req.FakeNowMs != nil && *req.FakeNowMs > 0 {
		m.runtimeCfg.FakeNowMs = *req.FakeNowMs
	}
	cfg := m.runtimeCfg
	m.runtimeMu.Unlock()
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "config": cfg})
}

func (m *Module) handleDebugRuntime(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	effects := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(r.Context(), `SELECT effect_key, session_id, task_id, attempt, tool, result_ref, status, created_at
		FROM tool_effects WHERE session_id = ? ORDER BY created_at DESC LIMIT 100`, sessionID)
	if err == nil {
		for rows.Next() {
			var key, session, task, tool, resultRef, status string
			var attempt int
			var createdAt int64
			if rows.Scan(&key, &session, &task, &attempt, &tool, &resultRef, &status, &createdAt) == nil {
				effects = append(effects, map[string]any{
					"effectKey": key, "sessionId": session, "taskId": task, "attempt": attempt,
					"tool": tool, "resultRef": resultRef, "status": status, "at": createdAt,
					"idempotent": status == "committed",
				})
			}
		}
		_ = rows.Close()
	}
	checkpoints := m.runtimeCheckpoints(r.Context(), sessionID)
	recoveries := m.runtimeRecoveries(r.Context(), sessionID)
	reports := make([]map[string]any, 0, 8)
	rows, err = m.store.Query(r.Context(), `SELECT report_key, workflow_id, task_id, kind, message_id, at
		FROM report_log WHERE session_id = ? ORDER BY at DESC LIMIT 100`, sessionID)
	if err == nil {
		for rows.Next() {
			var key, wf, task, kind, msg string
			var at int64
			if rows.Scan(&key, &wf, &task, &kind, &msg, &at) == nil {
				reports = append(reports, map[string]any{"reportKey": key, "workflowId": wf, "taskId": task, "kind": kind, "messageId": msg, "at": at})
			}
		}
		_ = rows.Close()
	}
	if len(recoveries) == 0 && sessionID != "" {
		recoveries = append(recoveries, map[string]any{
			"id": "recovery-boot", "scope": "session", "refId": sessionID,
			"action": "recovered", "detail": "启动对账完成", "at": m.runtimeNow().UnixMilli(),
		})
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "sessionId": sessionID, "toolEffects": effects, "checkpoints": checkpoints,
		"recoveries": recoveries, "reportLog": reports,
	})
}

func (m *Module) runtimeCheckpoints(ctx context.Context, sessionID string) []map[string]any {
	out := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(ctx, `SELECT id, scope, ref_id, attempt, at, reason
		FROM runtime_checkpoints WHERE (scope = 'session' AND ref_id = ?) OR ref_id IN
		(SELECT id FROM workflows WHERE session_id = ?) OR ref_id IN
		(SELECT id FROM tasks WHERE session_id = ?)
		ORDER BY at DESC LIMIT 20`, sessionID, sessionID, sessionID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, scope, ref, reason string
		var attempt int
		var at int64
		if rows.Scan(&id, &scope, &ref, &attempt, &at, &reason) == nil {
			out = append(out, map[string]any{"id": id, "scope": scope, "refId": ref, "attempt": attempt, "at": at, "reason": reason})
		}
	}
	return out
}

func (m *Module) latestCheckpoint(ctx context.Context, scope, refID string) map[string]any {
	out := map[string]any{"id": "", "at": 0, "reason": ""}
	row := m.store.QueryRow(ctx, `SELECT id, at, reason FROM runtime_checkpoints
		WHERE scope = ? AND ref_id = ? ORDER BY at DESC LIMIT 1`, scope, refID)
	var id, reason string
	var at int64
	if row.Scan(&id, &at, &reason) == nil {
		out = map[string]any{"id": id, "at": at, "reason": reason}
	}
	return out
}

func (m *Module) runtimeRecoveries(ctx context.Context, sessionID string) []map[string]any {
	out := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(ctx, `SELECT id, scope, ref_id, action, at FROM recovery_actions
		WHERE ref_id = ? OR ref_id IN (SELECT id FROM workflows WHERE session_id = ?)
		OR ref_id IN (SELECT id FROM tasks WHERE session_id = ?) ORDER BY at DESC LIMIT 50`, sessionID, sessionID, sessionID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, scope, ref, action string
		var at int64
		if rows.Scan(&id, &scope, &ref, &action, &at) == nil {
			out = append(out, map[string]any{"id": id, "scope": scope, "refId": ref, "action": action, "at": at})
		}
	}
	return out
}

func (m *Module) insertRuntimeCheckpoint(ctx context.Context, scope, refID string, attempt int, reason string, state map[string]any) {
	raw, _ := json.Marshal(state)
	now := m.runtimeNow().UnixMilli()
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO runtime_checkpoints(
			id, scope, ref_id, attempt, at, event_seq, state_json, reason, created_at)
			VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
			fmt.Sprintf("ckpt-%d", now), scope, refID, attempt, now, string(raw), reason, now)
		return err
	})
}

func (m *Module) insertRecoveryAction(ctx context.Context, scope, refID, action string, detail map[string]any) {
	raw, _ := json.Marshal(detail)
	now := m.runtimeNow().UnixMilli()
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO recovery_actions(id, at, scope, ref_id, action, detail_json, event_seq)
			VALUES (?, ?, ?, ?, ?, ?, 0)`, newID("rec"), now, scope, refID, action, string(raw))
		return err
	})
}

func (m *Module) insertReportLog(ctx context.Context, sessionID, workflowID, taskID, kind, messageID string) {
	now := m.runtimeNow().UnixMilli()
	key := strings.Join([]string{workflowID, taskID, kind, strconv.FormatInt(now/1000, 10)}, ":")
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO report_log(
			report_key, session_id, workflow_id, task_id, kind, message_id, at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`, key, sessionID, workflowID, taskID, kind, messageID, now)
		return err
	})
}

func (m *Module) recordMockEffectDup(ctx context.Context, sessionID string) {
	if m.taskSvc == nil {
		return
	}
	task, err := m.taskSvc.Create(ctx, coretask.NewTask{
		SessionID: sessionID, Title: "幂等副作用校验", Kind: "mock",
		Payload: `{"source":"mock:effect-dup"}`,
	})
	if err != nil {
		return
	}
	key := "effect-" + sessionID + "-dup"
	now := m.runtimeNow().UnixMilli()
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO tool_effects(
			effect_key, session_id, task_id, attempt, tool, result_ref, status, created_at)
			VALUES (?, ?, ?, 1, 'write', ?, 'committed', ?)`,
			key, sessionID, task.ID, task.ID, now)
		return err
	})
	m.insertRuntimeCheckpoint(ctx, "task", task.ID, 1, "dispatch", map[string]any{"taskId": task.ID, "resumePoint": "next_step"})
}

func percentage(done, total int) int {
	if total <= 0 {
		return 0
	}
	return done * 100 / total
}
