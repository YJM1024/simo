package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	coretask "simo/internal/core/task"
)

func (m *Module) insertTaskCheckpoint(task coretask.Task, reason string) {
	state, _ := json.Marshal(map[string]any{
		"taskId": task.ID, "status": task.Status, "attempt": task.Attempt,
		"resumePoint": "next_step", "progress": task.Progress,
	})
	now := time.Now().UnixMilli()
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO runtime_checkpoints(
			id, scope, ref_id, attempt, at, event_seq, state_json, reason, created_at)
			VALUES (?, 'task', ?, ?, ?, 0, ?, ?, ?)`,
			"ckpt-"+task.ID+"-"+time.Now().Format("150405.000000000"), task.ID, task.Attempt, now, string(state), reason, now)
		return err
	})
}

func (m *Module) hasTaskCheckpoint(task coretask.Task) bool {
	var count int
	err := m.store.QueryRow(context.Background(), `SELECT COUNT(*) FROM runtime_checkpoints
		WHERE scope = 'task' AND ref_id = ?`, task.ID).Scan(&count)
	return err == nil && count > 0
}

func (m *Module) hasUnknownTaskEffect(task coretask.Task) bool {
	var count int
	err := m.store.QueryRow(context.Background(), `SELECT COUNT(*) FROM tool_effects
		WHERE task_id = ? AND status IN ('attempted','unknown')`, task.ID).Scan(&count)
	return err == nil && count > 0
}

func (m *Module) insertRecoveryAction(scope, refID, action, detail string) {
	now := time.Now().UnixMilli()
	_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO recovery_actions(
			id, at, scope, ref_id, action, detail_json, event_seq)
			VALUES (?, ?, ?, ?, ?, ?, 0)`, "rec-"+refID+"-"+time.Now().Format("150405.000000000"),
			now, scope, refID, action, detail)
		return err
	})
}
