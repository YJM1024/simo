package sessions

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"

	coreagent "simo/internal/core/agent"
	"simo/internal/platform/httpserver"
)

func (m *Module) registerHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sessions", m.handleList)
	mux.HandleFunc("GET /api/sessions/tree", m.handleTree)
	mux.HandleFunc("POST /api/sessions", m.handleCreate)
	mux.HandleFunc("GET /api/sessions/{id}/overview", m.handleOverviewGet)
	mux.HandleFunc("GET /api/sessions/{id}/children", m.handleChildren)
	mux.HandleFunc("GET /api/sessions/{id}/spec-projection", m.handleSpecProjection)
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
	applyUnread(list, m.unreadFlags(r.Context()))
	counts, err := messageCounts(r.Context(), m.store)
	if err != nil {
		m.log.Error("统计会话消息数失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话失败")
		return
	}
	views := toSessionViews(list, counts)
	// ETag 在 hasUnread 与 messageCount 现算之后生成，304 与 200 共用同一次计算结果：
	// 未读状态或消息数一变摘要就变，不会用旧摘要把新内容判成 304。
	etag := listETag(views)
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "no-cache")
	if etagMatches(r.Header.Get("If-None-Match"), etag) {
		// 304 不带 body，但必须保留 ETag，客户端据此继续复用本地副本。
		w.WriteHeader(http.StatusNotModified)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"sessions": views})
}

func (m *Module) handleDelete(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": map[string]any{"code": "R4_CONFIRM_REQUIRED", "message": "删除会话需人工确认"}})
}

func (m *Module) handlePin(w http.ResponseWriter, r *http.Request) {
	m.handleSetPinned(w, r, true)
}

func (m *Module) handleUnpin(w http.ResponseWriter, r *http.Request) {
	m.handleSetPinned(w, r, false)
}

func (m *Module) handleSetPinned(w http.ResponseWriter, r *http.Request, pinned bool) {
	session, err := m.SetPinned(r.Context(), r.PathValue("id"), pinned)
	if err != nil {
		if errors.Is(err, ErrArchived) {
			// 归档会话的拒绝沿用 chat 模块已有的 code；blockers 给可读原因（AC-CONV-001-04）。
			httpserver.WriteJSON(w, http.StatusConflict, map[string]any{
				"ok": false, "error": "会话已归档（只读）", "code": "session_archived",
				"blockers": []string{"归档会话不能置顶或取消置顶"},
			})
			return
		}
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": m.viewOf(r.Context(), session)})
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
	applyUnread(tree, m.unreadFlags(r.Context()))
	counts, err := messageCounts(r.Context(), m.store)
	if err != nil {
		m.log.Error("统计会话消息数失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话树失败")
		return
	}
	views := toSessionViewTree(tree, counts)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"sessions": flattenSessionViews(views), "tree": views})
}

func (m *Module) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ParentID string `json:"parentId"`
		Title    string `json:"title"`
		Draft    *bool  `json:"draft"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	var session Session
	var err error
	if req.Draft != nil && !*req.Draft {
		// 显式 draft:false 是内部/测试兼容的立即创建路径；默认仍是懒创建。
		session, err = m.Create(r.Context(), req.ParentID, req.Title)
	} else {
		session, err = m.CreateDraft(r.Context(), req.ParentID, req.Title)
	}
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusCreated, map[string]any{
		"ok": true, "session": m.viewOf(r.Context(), session), "draft": req.Draft == nil || *req.Draft,
	})
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
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": m.viewOf(r.Context(), session)})
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
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": m.viewOf(r.Context(), session)})
}

func (m *Module) handleUnarchive(w http.ResponseWriter, r *http.Request) {
	session, err := m.Unarchive(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		m.writeSessionError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "session": m.viewOf(r.Context(), session)})
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
	case errors.Is(err, ErrSessionProtected):
		// code 保持不变（既有调用方按它分支）；blockers 是 AC-CONV-001-03 要求的
		// 结构化拒绝原因，取值按产品 spec 定义（人类可读原因），与 archive_blocked 信封同形。
		httpserver.WriteJSON(w, http.StatusConflict, map[string]any{
			"ok": false, "error": "主会话不可归档", "code": "main_session_protected",
			"blockers": []string{"主会话不可归档"},
		})
	default:
		m.log.Error("会话操作失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "会话操作失败")
	}
}
