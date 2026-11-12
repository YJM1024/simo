package chat

import (
	"net/http"
	"strings"

	"simo/internal/platform/httpserver"
)

const maxAllSessionMessages = 50000

// handleSessionMessagesAll 返回会话全部消息（时间正序、不分页）；scope=all 的另一种路径是 /messages/all。
func (m *Module) handleSessionMessagesAll(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if sessionID == "" {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"ok": false, "error": map[string]any{"code": "invalid_session", "message": "sessionId 不能为空"},
		})
		return
	}
	scope := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("scope")))
	if scope != "" && scope != "all" {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"ok": false, "error": map[string]any{"code": "invalid_scope", "message": "scope 只支持 all"},
		})
		return
	}
	archived := false
	if m.sessions != nil {
		session, err := m.sessions.Get(r.Context(), sessionID)
		if err != nil {
			httpserver.WriteJSON(w, http.StatusNotFound, map[string]any{
				"ok": false, "error": map[string]any{"code": "session_not_found", "message": "会话不存在"},
			})
			return
		}
		// 归档会话只读：允许读取全量历史，不允许写。
		archived = session.Archived != 0
	}
	var total int
	if err := m.store.QueryRow(r.Context(), `SELECT COUNT(*) FROM messages WHERE session_id=? AND internal=0`, sessionID).Scan(&total); err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取消息失败")
		return
	}
	if total > maxAllSessionMessages {
		httpserver.WriteJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"ok": false, "error": map[string]any{
				"code": "messages_too_many", "message": "消息量超过单次全量上限 50000 条，请按会话拆分或使用分页接口",
			},
		})
		return
	}
	list, err := m.listMessagesForSessions(r.Context(), []string{sessionID})
	if err != nil {
		m.log.Error("读取会话全量消息失败", "err", err, "sessionId", sessionID)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取消息失败")
		return
	}
	titles := m.sessionTitles(r.Context(), []string{sessionID})
	m.attachSessionPaths(r.Context(), list)
	m.attachReplySnapshots(r.Context(), list)
	m.attachAgentIDs(r.Context(), list)
	m.attachCards(r.Context(), list)
	m.attachRouteFields(r.Context(), list)
	m.attachFinishedAt(r.Context(), list)
	for i := range list {
		list[i].SessionTitle = titles[list[i].SessionID]
	}
	if list == nil {
		list = []Message{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "sessionId": sessionID, "scope": "all", "archived": archived,
		"messages": list, "total": len(list), "pagination": false,
	})
}
