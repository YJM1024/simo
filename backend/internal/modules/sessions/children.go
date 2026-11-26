package sessions

// PRD-TASK-005：子会话视图与父层计数。
// 父子关系只有 sessions.parent_id 一处事实来源（idx_sessions_parent 已存在），
// 每次读取实时聚合，不新增计数列；归档父会话只改父会话自身的 archived 标志，
// 子会话与其任务保持可读，子任务状态不因归档变化。

import (
	"context"
	"net/http"

	"simo/internal/platform/httpserver"
)

// ChildSessionView 是直接子会话的只读视图。
// taskCount 只统计该子会话自己的任务（tasks.session_id 精确匹配），不递归到孙会话。
type ChildSessionView struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt int64  `json:"createdAt"`
	Archived  int    `json:"archived"`
	TaskCount int    `json:"taskCount"`
}

// Children 返回某会话的直接子会话（按创建时间升序），供父层「含 N 个子会话」入口展开。
// 会话不存在时返回 ErrNotFound，由 HTTP 层转 404；子会话为空返回空切片而不是 nil。
func (m *Module) Children(ctx context.Context, sessionID string) ([]ChildSessionView, error) {
	if _, err := m.Get(ctx, sessionID); err != nil {
		return nil, err
	}
	rows, err := m.store.Query(ctx, `SELECT s.id, s.title, s.created_at, s.archived,
		(SELECT COUNT(*) FROM tasks t WHERE t.session_id = s.id) AS task_count
		FROM sessions s WHERE s.parent_id = ? ORDER BY s.created_at ASC, s.id ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]ChildSessionView, 0, 4)
	for rows.Next() {
		var item ChildSessionView
		if err := rows.Scan(&item.ID, &item.Title, &item.CreatedAt, &item.Archived, &item.TaskCount); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// ChildSessionIDs 只取直接子会话 id，用于任务与投影里的 childSessionIds 字段。
// 查询失败时返回空切片：该字段是附加投影，缺它不影响任务与投影本身的可读性。
func (m *Module) ChildSessionIDs(ctx context.Context, sessionID string) []string {
	rows, err := m.store.Query(ctx, `SELECT id FROM sessions WHERE parent_id = ? ORDER BY created_at ASC, id ASC`, sessionID)
	if err != nil {
		m.log.Warn("读取子会话 id 失败", "err", err, "sessionId", sessionID)
		return []string{}
	}
	defer rows.Close()
	out := make([]string, 0, 4)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		out = append(out, id)
	}
	return out
}

// handleChildren 是 GET /api/sessions/{id}/children。
// 响应带 count，与 projection.childSessionCount 同源（都数 sessions.parent_id），
// 前端「含 N 个子会话」的 N 与展开后的条数因此不会不一致。
func (m *Module) handleChildren(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")
	children, err := m.Children(r.Context(), sessionID)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "sessionId": sessionID, "children": children, "count": len(children),
	})
}
