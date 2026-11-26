package chat

import (
	"context"
	"database/sql"
	"encoding/json"

	"simo/internal/platform/clock"
)

// ReleaseTaskApprovals 放行会话里等待中的工具审批：补会话授权，并把审批行标记为已放行。
// 任务确认后由 tasks 模块调用；工具本身交给重启的执行器执行，避免这里执行一次、
// 执行器再执行一次。返回本次放行的审批条数。
func (m *Module) ReleaseTaskApprovals(ctx context.Context, sessionID string) (int, error) {
	if m == nil || m.store == nil {
		return 0, nil
	}
	now := clock.NowUnixMilli()
	rows, err := m.store.Query(ctx, `SELECT id, tool, args, expires_at FROM approvals
		WHERE session_id = ? AND status = 'pending' ORDER BY created_at`, sessionID)
	if err != nil {
		return 0, err
	}
	type pendingApproval struct {
		id        string
		tool      string
		args      string
		expiresAt int64
	}
	var pending []pendingApproval
	for rows.Next() {
		var item pendingApproval
		if err := rows.Scan(&item.id, &item.tool, &item.args, &item.expiresAt); err != nil {
			rows.Close()
			return 0, err
		}
		pending = append(pending, item)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	released := 0
	for _, item := range pending {
		// 已过期的审批不补授权；执行器续跑时会重新发起审批。
		if item.expiresAt > 0 && item.expiresAt <= now {
			continue
		}
		args := map[string]any{}
		if json.Unmarshal([]byte(item.args), &args) != nil {
			args = map[string]any{}
		}
		if err := m.addSessionGrant(ctx, sessionID, canonicalToolName(item.tool), args); err != nil {
			return released, err
		}
		if err := m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE approvals
				SET status = 'approved', decision = 'allow_session', result = 'released by task confirmation',
					decided_at = ?, decided_by = 'task_confirmation'
				WHERE id = ? AND status = 'pending'`, now, item.id)
			return err
		}); err != nil {
			return released, err
		}
		released++
	}
	return released, nil
}
