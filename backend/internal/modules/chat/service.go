package chat

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// TurnRecord 是 turns 表投影（M2 最小）。
type TurnRecord struct {
	ID        string
	SessionID string
	Status    string
	StartedAt int64
	EndedAt   int64
}

// DecisionRecord 是 decisions 表投影。
type DecisionRecord struct {
	ID        string
	TurnID    string
	Kind      string
	Payload   string
	CreatedAt int64
}

// listMessages 按 sessionId 过滤消息；未知 sessionId 返回空列表（不返回全量）。
func (m *Module) listMessages(ctx context.Context, sessionID string) ([]Message, error) {
	rows, err := m.store.Query(ctx,
		`SELECT id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id
		   FROM messages WHERE session_id = ? AND internal = 0 ORDER BY rowid ASC`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("查询消息失败: %w", err)
	}
	defer rows.Close()

	out := make([]Message, 0, 16)
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Text, &msg.At, &msg.Status, &msg.TaskID, &msg.WorkflowID, &msg.Tool, &msg.ApprovalID, &msg.Category, &msg.ReplyToID); err != nil {
			return nil, fmt.Errorf("扫描消息失败: %w", err)
		}
		out = append(out, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历消息失败: %w", err)
	}
	_ = rows.Close()
	if err := m.attachUploads(ctx, out); err != nil {
		return nil, err
	}
	return out, nil
}

// listMessagesPage 按 before 消息 id 向前分页；limit 缺省 30（M11）。
func (m *Module) listMessagesPage(ctx context.Context, sessionIDs []string, before string, limit int) ([]Message, error) {
	if len(sessionIDs) == 0 {
		return []Message{}, nil
	}
	if limit <= 0 {
		limit = 30
	}
	if limit > 200 {
		limit = 200
	}
	placeholders := make([]string, len(sessionIDs))
	args := make([]any, 0, len(sessionIDs)+2)
	for i, id := range sessionIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `SELECT id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id,
		rowid FROM messages WHERE session_id IN (` + strings.Join(placeholders, ",") + `) AND internal = 0`
	if before != "" {
		var beforeRow int64
		if err := m.store.QueryRow(ctx, `SELECT rowid FROM messages WHERE id = ?`, before).Scan(&beforeRow); err != nil {
			if err == sql.ErrNoRows {
				return []Message{}, nil
			}
			return nil, err
		}
		query += ` AND rowid < ?`
		args = append(args, beforeRow)
	}
	query += ` ORDER BY rowid DESC LIMIT ?`
	args = append(args, limit)
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("分页查询消息失败: %w", err)
	}
	out := make([]Message, 0, limit)
	for rows.Next() {
		var msg Message
		var rowID int64
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Text, &msg.At, &msg.Status,
			&msg.TaskID, &msg.WorkflowID, &msg.Tool, &msg.ApprovalID, &msg.Category, &msg.ReplyToID, &rowID); err != nil {
			_ = rows.Close()
			return nil, fmt.Errorf("扫描分页消息失败: %w", err)
		}
		out = append(out, msg)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fmt.Errorf("遍历分页消息失败: %w", err)
	}
	_ = rows.Close()
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	if err := m.attachUploads(ctx, out); err != nil {
		return nil, err
	}
	return out, nil
}

// listMessagesForSessions 按多个会话取消息并按时间排序（M4 主窗口聚合）。
func (m *Module) listMessagesForSessions(ctx context.Context, sessionIDs []string) ([]Message, error) {
	if len(sessionIDs) == 0 {
		return []Message{}, nil
	}
	placeholders := make([]string, len(sessionIDs))
	args := make([]any, 0, len(sessionIDs))
	for i, id := range sessionIDs {
		placeholders[i] = "?"
		args = append(args, id)
	}
	query := `SELECT id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id FROM messages
		WHERE session_id IN (` + strings.Join(placeholders, ",") + `) AND internal = 0
		ORDER BY at ASC, rowid ASC`
	rows, err := m.store.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("聚合查询消息失败: %w", err)
	}
	defer rows.Close()
	out := make([]Message, 0, 16)
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Text, &msg.At, &msg.Status, &msg.TaskID, &msg.WorkflowID, &msg.Tool, &msg.ApprovalID, &msg.Category, &msg.ReplyToID); err != nil {
			return nil, fmt.Errorf("扫描聚合消息失败: %w", err)
		}
		out = append(out, msg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历聚合消息失败: %w", err)
	}
	_ = rows.Close()
	if err := m.attachUploads(ctx, out); err != nil {
		return nil, err
	}
	return out, nil
}

func (m *Module) sessionTitle(ctx context.Context, id string) string {
	if m.sessions == nil || strings.TrimSpace(id) == "" {
		return ""
	}
	session, err := m.sessions.Get(ctx, id)
	if err != nil {
		return ""
	}
	return session.Title
}

func (m *Module) sessionTitles(ctx context.Context, ids []string) map[string]string {
	out := make(map[string]string, len(ids))
	if m.sessions == nil {
		return out
	}
	for _, id := range ids {
		if _, ok := out[id]; ok {
			continue
		}
		if session, err := m.sessions.Get(ctx, id); err == nil {
			out[id] = session.Title
		}
	}
	return out
}

func (m *Module) createMessage(ctx context.Context, msg Message) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO messages(id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			msg.ID, msg.SessionID, msg.Role, msg.Text, msg.At, msg.Status, msg.TaskID, msg.WorkflowID, msg.Tool, msg.ApprovalID, msg.Category, msg.ReplyToID)
		return err
	})
}

// createMessageWithAttachments 在同一事务里写 user message + message_attachments。
func (m *Module) createMessageWithAttachments(ctx context.Context, msg Message) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO messages(id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			msg.ID, msg.SessionID, msg.Role, msg.Text, msg.At, msg.Status, msg.TaskID, msg.WorkflowID, msg.Tool, msg.ApprovalID, msg.Category, msg.ReplyToID); err != nil {
			return err
		}
		stmt, err := tx.PrepareContext(ctx, `INSERT INTO message_attachments(
			id, message_id, upload_id, name, rel_path, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		for _, att := range msg.Attachments {
			if _, err := stmt.ExecContext(ctx, newID("matt"), msg.ID, att.ID, att.Name, att.RelPath, att.Mime, att.Size, att.CreatedAt); err != nil {
				return err
			}
		}
		return nil
	})
}

func (m *Module) appendMessageText(ctx context.Context, id, delta string) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE messages SET text = text || ? WHERE id = ?`, delta, id)
		return err
	})
}

func (m *Module) setMessageStatus(ctx context.Context, id, status string) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE messages SET status = ? WHERE id = ?`, status, id)
		return err
	})
}

// history 返回会话消息（给模型端口；不含当前占位回复）。
func (m *Module) history(ctx context.Context, sessionID string) ([]Message, error) {
	return m.listMessages(ctx, sessionID)
}

// retractMessage 撤回未完成回复：状态 retracted，正文清空（原文在事件日志/审计里）。
func (m *Module) retractMessage(ctx context.Context, id string) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE messages SET text = '', status = ? WHERE id = ?`, StatusRetracted, id)
		return err
	})
}

func (m *Module) createTurn(ctx context.Context, turn TurnRecord) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO turns(id, session_id, status, started_at, ended_at)
			VALUES (?, ?, ?, ?, ?)`, turn.ID, turn.SessionID, turn.Status, turn.StartedAt, turn.EndedAt)
		return err
	})
}

func (m *Module) endTurn(ctx context.Context, id, status string, endedAt int64) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE turns SET status = ?, ended_at = ? WHERE id = ?`, status, endedAt, id)
		return err
	})
}

func (m *Module) createDecision(ctx context.Context, decision DecisionRecord) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO decisions(id, turn_id, kind, payload, created_at)
			VALUES (?, ?, ?, ?, ?)`, decision.ID, decision.TurnID, decision.Kind, decision.Payload, decision.CreatedAt)
		return err
	})
}
