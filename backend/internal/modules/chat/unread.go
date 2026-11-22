package chat

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/platform/httpserver"
)

// sessionReadEvent 是 session_read 广播载荷；前端只按 sessionId 刷新会话列表。
type sessionReadEvent struct {
	SessionID string `json:"sessionId"`
}

// MarkSessionRead 把会话游标推进到该会话当前最新消息。
//
// 语义（与判定口径一致）：游标取"最新一条消息的 at"，未读判定是"存在 at 更晚的
// agent 消息"。无消息时没有可推进的断点，不写游标；只有游标真正前进才广播
// session_read，所以重复调用既不改状态也不制造事件风暴。
func (m *Module) MarkSessionRead(ctx context.Context, sessionID string) error {
	var messageID string
	var at int64
	err := m.store.QueryRow(ctx,
		`SELECT id, at FROM messages WHERE session_id = ? ORDER BY at DESC, rowid DESC LIMIT 1`,
		sessionID).Scan(&messageID, &at)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("读取会话最新消息失败: %w", err)
	}
	changed, err := m.markReadAt(ctx, sessionID, at, messageID)
	if err != nil {
		return err
	}
	if !changed || m.events == nil {
		return nil
	}
	_, _ = m.events.Append(ctx, eventlog.TypeSessionRead, sessionReadEvent{SessionID: sessionID})
	return nil
}

// markReadAt 是游标推进原语：只接受比现有游标更新的消息时间（乱序/回退请求不生效，
// 相等也不重写，保证重复调用幂等），返回游标是否真的前进。
// 比较与写入放在同一条 UPSERT 里，避免"先读后写"的 TOCTOU。
func (m *Module) markReadAt(ctx context.Context, sessionID string, at int64, messageID string) (bool, error) {
	changed := false
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT INTO session_read_cursors(
				session_id, last_read_at, last_read_message_id, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(session_id) DO UPDATE SET
				last_read_at = excluded.last_read_at,
				last_read_message_id = excluded.last_read_message_id,
				updated_at = excluded.updated_at
			WHERE excluded.last_read_at > session_read_cursors.last_read_at`,
			sessionID, at, messageID, time.Now().UTC().Format(time.RFC3339Nano))
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		changed = n > 0
		return nil
	})
	if err != nil {
		return false, err
	}
	return changed, nil
}

// UnreadSessionIDs 返回有未读的会话 id 集合（供会话列表/树投影 hasUnread）。
//
// 判定：存在一条可见的 agent 消息晚于该会话游标即未读；没有游标时任意 agent 消息
// 即未读。只看 agent 侧（role=agent）且 internal=0，用户自己发的消息永不产生未读。
func (m *Module) UnreadSessionIDs(ctx context.Context) (map[string]bool, error) {
	rows, err := m.store.Query(ctx, `SELECT s.id FROM sessions s
		WHERE EXISTS (
			SELECT 1 FROM messages m
			WHERE m.session_id = s.id AND m.role = ? AND m.internal = 0
			  AND NOT EXISTS (
				SELECT 1 FROM session_read_cursors c
				WHERE c.session_id = s.id AND c.last_read_at >= m.at
			  )
		)`, RoleAgent)
	if err != nil {
		return nil, fmt.Errorf("查询未读会话失败: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := make(map[string]bool, 8)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// handleSessionRead 实现 POST /api/sessions/{id}/read：把游标推进到该会话当前最新消息。
// 主会话同样适用（主会话只是不可归档，未读照常）；幂等，重复调用返回同样的信封。
func (m *Module) handleSessionRead(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" || !validPathSegment(sessionID) {
		httpserver.WriteError(w, http.StatusBadRequest, "sessionId 非法")
		return
	}
	if m.sessions != nil {
		if _, err := m.sessions.Get(r.Context(), sessionID); err != nil {
			httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
			return
		}
	}
	if err := m.MarkSessionRead(r.Context(), sessionID); err != nil {
		m.log.Error("标记会话已读失败", "err", err, "sessionId", sessionID)
		httpserver.WriteError(w, http.StatusInternalServerError, "标记已读失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":        true,
		"sessionId": sessionID,
		"hasUnread": false,
	})
}
