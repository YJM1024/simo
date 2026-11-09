package sessions

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	coreagent "agentd/internal/core/agent"
)

// SearchSessions 支持标题搜索和置顶过滤（UI-1）。
func (m *Module) SearchSessions(ctx context.Context, query string, pinned *bool) ([]Session, error) {
	query = strings.TrimSpace(query)
	sqlText := `SELECT id, parent_id, title, created_at, archived, pinned, owner_agent_id FROM sessions WHERE 1=1`
	args := make([]any, 0, 4)
	if query != "" {
		sqlText += ` AND title LIKE ?`
		args = append(args, "%"+query+"%")
	}
	if pinned != nil {
		sqlText += ` AND pinned = ?`
		if *pinned {
			args = append(args, 1)
		} else {
			args = append(args, 0)
		}
	}
	sqlText += ` ORDER BY pinned DESC, created_at DESC, id DESC`
	rows, err := m.store.Query(ctx, sqlText, args...)
	if err != nil {
		return nil, fmt.Errorf("查询会话失败: %w", err)
	}
	out := make([]Session, 0, 8)
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.ParentID, &s.Title, &s.CreatedAt, &s.Archived, &s.Pinned, &s.OwnerAgentID); err != nil {
			_ = rows.Close()
			return nil, err
		}
		out = append(out, s)
	}
	_ = rows.Close()
	return out, rows.Err()
}

// SetPinned 设置会话置顶。
func (m *Module) SetPinned(ctx context.Context, id string, pinned bool) (Session, error) {
	if _, err := m.Get(ctx, id); err != nil {
		return Session{}, err
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET pinned = ? WHERE id = ?`, boolInt(pinned), strings.TrimSpace(id))
		return err
	}); err != nil {
		return Session{}, err
	}
	return m.Get(ctx, id)
}

// SetOwner 设置会话负责人；agentId 必须在内置目录中。
func (m *Module) SetOwner(ctx context.Context, id, agentID string) (Session, error) {
	agentID = strings.TrimSpace(agentID)
	if agentID == "" {
		agentID = coreagent.DefaultID
	}
	if !coreagent.Exists(agentID) && !strings.HasPrefix(agentID, "agent:") {
		return Session{}, fmt.Errorf("%w: 未知 agentId %s", ErrInvalid, agentID)
	}
	current, err := m.Get(ctx, id)
	if err != nil {
		return Session{}, err
	}
	if current.Archived != 0 {
		return Session{}, fmt.Errorf("%w: 归档会话不能改负责人", ErrArchived)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET owner_agent_id = ? WHERE id = ?`, agentID, strings.TrimSpace(id))
		return err
	}); err != nil {
		return Session{}, err
	}
	return m.Get(ctx, id)
}

// OwnerAgentID 返回会话负责人；未知会话回退默认。
func (m *Module) OwnerAgentID(ctx context.Context, id string) string {
	session, err := m.Get(ctx, id)
	if err != nil || strings.TrimSpace(session.OwnerAgentID) == "" {
		return coreagent.DefaultID
	}
	return session.OwnerAgentID
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
