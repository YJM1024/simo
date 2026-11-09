package sessions

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"

	coreagent "agentd/internal/core/agent"
	"agentd/internal/platform/httpserver"
)

func (m *Module) registerHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sessions", m.handleList)
	mux.HandleFunc("GET /api/sessions/tree", m.handleTree)
	mux.HandleFunc("POST /api/sessions", m.handleCreate)
	mux.HandleFunc("GET /api/sessions/{id}/overview", m.handleOverviewGet)
	mux.HandleFunc("POST /api/sessions/{id}/overview/refresh", m.handleOverviewRefresh)
	mux.HandleFunc("POST /api/sessions/{id}/archive", m.handleArchive)
	mux.HandleFunc("POST /api/sessions/{id}/unarchive", m.handleUnarchive)
	mux.HandleFunc("PATCH /api/sessions/{id}", m.handleRename)
	mux.HandleFunc("DELETE /api/sessions/{id}", m.handleDelete)
	mux.HandleFunc("POST /api/sessions/{id}/pin", m.handlePin)
	mux.HandleFunc("POST /api/sessions/{id}/unpin", m.handleUnpin)
	mux.HandleFunc("GET /api/sessions/{id}/owner", m.handleOwnerGet)
	mux.HandleFunc("PUT /api/sessions/{id}/owner", m.handleOwnerPut)
	if m.debug {
		mux.HandleFunc("GET /api/debug/spec", m.handleDebugSpec)
		mux.HandleFunc("GET /api/debug/specs", m.handleDebugSpec)
		mux.HandleFunc("POST /api/debug/spec/transition", m.handleDebugSpecTransition)
		mux.HandleFunc("POST /api/debug/spec/reopen", m.handleDebugSpecReopen)
		mux.HandleFunc("POST /api/debug/spec/executor", m.handleDebugSpecExecutor)
	}
}

func (m *Module) handleList(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	var pinned *bool
	if raw := strings.TrimSpace(r.URL.Query().Get("pinned")); raw != "" {
		value, err := strconv.ParseBool(strings.ToLower(raw))
		if err != nil {
			httpserver.WriteError(w, http.StatusBadRequest, "pinned 需为 true/false")
			return
		}
		pinned = &value
	}
	var list []Session
	var err error
	if query != "" || pinned != nil {
		list, err = m.SearchSessions(r.Context(), query, pinned)
	} else {
		list, err = listSessions(r.Context(), m.store)
	}
	if err != nil {
		m.log.Error("列会话失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话失败")
		return
	}
	if list == nil {
		list = []Session{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"sessions": list})
}

func (m *Module) handleDelete(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": map[string]any{"code": "R4_CONFIRM_REQUIRED", "message": "删除会话需人工确认"}})
}

func (m *Module) handlePin(w http.ResponseWriter, r *http.Request) {
	session, err := m.SetPinned(r.Context(), r.PathValue("id"), true)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleUnpin(w http.ResponseWriter, r *http.Request) {
	session, err := m.SetPinned(r.Context(), r.PathValue("id"), false)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleOwnerGet(w http.ResponseWriter, r *http.Request) {
	session, err := m.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	m.writeOwner(w, session)
}

func (m *Module) handleOwnerPut(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AgentID string `json:"agentId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	session, err := m.SetOwner(r.Context(), r.PathValue("id"), req.AgentID)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	m.writeOwner(w, session)
}

func (m *Module) writeOwner(w http.ResponseWriter, session Session) {
	agentID := session.OwnerAgentID
	if agentID == "" {
		agentID = coreagent.DefaultID
	}
	payload := map[string]any{"ok": true, "sessionId": session.ID, "ownerAgentId": agentID}
	if agent, ok := coreagent.Find(agentID); ok {
		payload["agent"] = agent
	}
	httpserver.WriteJSON(w, http.StatusOK, payload)
}

func (m *Module) handleTree(w http.ResponseWriter, r *http.Request) {
	tree, err := m.Tree(r.Context())
	if err != nil {
		m.log.Error("读会话树失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话树失败")
		return
	}
	if tree == nil {
		tree = []Session{}
	}
	flat := flattenSessions(tree)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"sessions": flat, "tree": tree})
}

func flattenSessions(nodes []Session) []Session {
	out := make([]Session, 0, len(nodes))
	var walk func([]Session)
	walk = func(items []Session) {
		for _, item := range items {
			out = append(out, item)
			if len(item.Children) > 0 {
				walk(item.Children)
			}
		}
	}
	walk(nodes)
	return out
}

func (m *Module) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ParentID string `json:"parentId"`
		Title    string `json:"title"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	session, err := m.Create(r.Context(), req.ParentID, req.Title)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusCreated, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleRename(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	var req struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	session, err := m.Rename(r.Context(), id, req.Title)
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleArchive(w http.ResponseWriter, r *http.Request) {
	session, err := m.Archive(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		var blockers *ArchiveBlockersError
		if errors.As(err, &blockers) {
			httpserver.WriteJSON(w, http.StatusConflict, map[string]any{
				"ok": false, "error": "无法归档", "code": "archive_blocked", "blockers": blockers.Blockers,
			})
			return
		}
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleUnarchive(w http.ResponseWriter, r *http.Request) {
	session, err := m.Unarchive(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": session})
}

func (m *Module) handleDebugSpec(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		sessionID = DefaultSessionID
	}
	spec, err := m.GetBySession(r.Context(), sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "spec 不存在")
		return
	}
	check, err := m.CanArchiveSession(r.Context(), sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "canArchive 失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "spec": spec, "canArchive": check})
}

func (m *Module) handleDebugSpecTransition(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
		To        string `json:"to"`
		Reason    string `json:"reason"`
		Actor     string `json:"actor"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	spec, err := m.Transition(r.Context(), req.SessionID, req.To, req.Reason, req.Actor)
	if err != nil {
		if errors.Is(err, ErrInvalidSpecTransition) {
			httpserver.WriteJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": err.Error(), "code": "invalid_transition"})
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "spec": spec})
}

func (m *Module) handleDebugSpecReopen(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
		Reason    string `json:"reason"`
		Actor     string `json:"actor"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	spec, err := m.Reopen(r.Context(), req.SessionID, req.Reason, req.Actor)
	if err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "spec": spec})
}

func (m *Module) handleDebugSpecExecutor(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var req struct {
		SessionID string `json:"sessionId"`
		AgentID   string `json:"agentId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	spec, err := m.SetExecutorAgent(r.Context(), req.SessionID, req.AgentID)
	if err != nil {
		httpserver.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "spec": spec})
}

func isLoopbackRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(r.RemoteAddr)
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *Module) writeSessionError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNotFound):
		httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
	case errors.Is(err, ErrInvalid):
		httpserver.WriteError(w, http.StatusBadRequest, "标题不能为空")
	case errors.Is(err, ErrArchived):
		httpserver.WriteError(w, http.StatusConflict, "会话已归档（只读）")
	case errors.Is(err, ErrArchiveBlocked):
		httpserver.WriteError(w, http.StatusConflict, "归档被拒绝")
	default:
		m.log.Error("会话操作失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "会话操作失败")
	}
}
