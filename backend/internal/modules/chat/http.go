package chat

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/platform/httpserver"
)

const (
	maxBodyBytes    = 64 << 10
	heartbeatPeriod = 30 * time.Second
	wsSendBuffer    = 512

	codeBadRequest      = "bad_request"
	codeInternal        = "internal"
	codeSessionArchived = "session_archived"
)

type wsEnvelope struct {
	Type string `json:"type"`
	Data any    `json:"data"`
	// ID 是事件日志 id（仅持久化事件有）；客户端用 since 续接时按它去重。
	ID int64 `json:"id,omitempty"`
}

type inboundFrame struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type helloPayload struct {
	At int64 `json:"at"`
}

type errorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	// Text 仅用于 chat 错误帧携带尝试发送的原文，便于按 collectAfterText
	// 定位本次请求；不代表消息已落库。
	Text string `json:"text,omitempty"`
}

type subscribePayload struct {
	SessionID string `json:"sessionId"`
	Since     *int64 `json:"since,omitempty"`
}

type chatPayload struct {
	SessionID        string   `json:"sessionId"`
	Text             string   `json:"text"`
	Attachments      []string `json:"attachments"`
	ReplyToMessageID string   `json:"replyToMessageId"`
}

type correctPayload struct {
	SessionID       string `json:"sessionId"`
	TargetMessageID string `json:"targetMessageId"`
	Text            string `json:"text"`
}

// requestError 是可直接映射为 error 帧/HTTP 400 的错误。
type requestError struct {
	code    string
	message string
}

func (e *requestError) Error() string { return e.message }

func newRequestError(code, message string) *requestError {
	return &requestError{code: code, message: message}
}

func (m *Module) handleMessages(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	ids := []string{sessionID}
	includeChildren := parseIncludeChildren(r.URL.Query().Get("includeChildren"))
	if includeChildren && m.sessions != nil {
		descendants, err := m.sessions.DescendantIDs(r.Context(), sessionID, 16)
		if err != nil {
			m.log.Error("读取会话后代失败", "err", err, "sessionId", sessionID)
			httpserver.WriteError(w, http.StatusInternalServerError, "读取会话树失败")
			return
		}
		ids = descendants
	}
	limit, _ := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("limit")))
	before := strings.TrimSpace(r.URL.Query().Get("before"))
	paged := limit > 0 || before != ""
	var list []Message
	var err error
	if paged {
		list, err = m.listMessagesPage(r.Context(), ids, before, limit)
	} else {
		list, err = m.listMessagesForSessions(r.Context(), ids)
	}
	if err != nil {
		m.log.Error("列消息失败", "err", err, "sessionId", sessionID)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取消息失败")
		return
	}
	titles := m.sessionTitles(r.Context(), ids)
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
	if paged {
		pageLimit := limit
		if pageLimit <= 0 {
			pageLimit = 30
		}
		if pageLimit > 200 {
			pageLimit = 200
		}
		nextBefore := ""
		if len(list) > 0 {
			nextBefore = list[0].ID
		}
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{
			"messages": list, "hasMore": len(list) >= pageLimit, "nextBefore": nextBefore,
		})
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"messages": list})
}

func (m *Module) handleEditDisabled(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false,
		"error": map[string]any{"code": "edit_disabled", "message": "消息编辑/修改已禁用，历史消息不会被修改"}})
}

func (m *Module) handleMessageSearch(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "messages": []Message{}, "total": 0})
		return
	}
	ids := []string{sessionID}
	if parseIncludeChildren(r.URL.Query().Get("includeChildren")) && m.sessions != nil {
		if descendants, err := m.sessions.DescendantIDs(r.Context(), sessionID, 16); err == nil {
			ids = descendants
		}
	}
	placeholders := make([]string, len(ids))
	args := make([]any, 0, len(ids)+2)
	for i, id := range ids {
		placeholders[i] = "?"
		args = append(args, id)
	}
	args = append(args, "%"+query+"%")
	rows, err := m.store.Query(r.Context(), `SELECT id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id
		FROM messages WHERE session_id IN (`+strings.Join(placeholders, ",")+`) AND text LIKE ?
		ORDER BY rowid ASC LIMIT 50`, args...)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "搜索消息失败")
		return
	}
	list := make([]Message, 0, 8)
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.SessionID, &msg.Role, &msg.Text, &msg.At, &msg.Status,
			&msg.TaskID, &msg.WorkflowID, &msg.Tool, &msg.ApprovalID, &msg.Category, &msg.ReplyToID); err != nil {
			_ = rows.Close()
			httpserver.WriteError(w, http.StatusInternalServerError, "搜索消息失败")
			return
		}
		msg.Attachments = []Attachment{}
		list = append(list, msg)
	}
	_ = rows.Close()
	m.attachSessionPaths(r.Context(), list)
	m.attachReplySnapshots(r.Context(), list)
	m.attachAgentIDs(r.Context(), list)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "messages": list, "total": len(list)})
}

func parseIncludeChildren(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

func (m *Module) handleChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID        string   `json:"sessionId"`
		Text             string   `json:"text"`
		Attachments      []string `json:"attachments"`
		ReplyToMessageID string   `json:"replyToMessageId"`
	}
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := dec.Decode(&req); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	user, err := m.startTurnExplicit(r.Context(), req.SessionID, req.Text, ClassRefine, req.Attachments, req.ReplyToMessageID,
		strings.TrimSpace(req.SessionID) != "")
	if err != nil {
		m.writeRequestError(w, err)
		return
	}
	// 契约字段是 messageId；同时保留 id 兼容旧前端/旧评测。
	httpserver.WriteJSON(w, http.StatusAccepted, map[string]any{
		"ok":        true,
		"messageId": user.ID,
		"id":        user.ID,
	})
}

func (m *Module) writeRequestError(w http.ResponseWriter, err error) {
	var reqErr *requestError
	if errors.As(err, &reqErr) {
		switch reqErr.code {
		case codeBadRequest:
			httpserver.WriteError(w, http.StatusBadRequest, reqErr.message)
			return
		case codeSessionArchived:
			httpserver.WriteErrorCode(w, http.StatusConflict, codeSessionArchived, reqErr.message)
			return
		case "session_not_found":
			httpserver.WriteErrorCode(w, http.StatusNotFound, "session_not_found", reqErr.message)
			return
		case "invalid_attachment", "too_many_attachments":
			httpserver.WriteErrorCode(w, http.StatusBadRequest, reqErr.code, reqErr.message)
			return
		case "file_too_large":
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "file_too_large", reqErr.message)
			return
		case "invalid_path":
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_path", reqErr.message)
			return
		}
	}
	httpserver.WriteError(w, http.StatusInternalServerError, "发送消息失败")
}

// handleWS 实现契约 §3.2/§5：JSON 信封 {type,data}，支持 subscribe/chat/correct/ping。
func (m *Module) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := httpserver.AcceptWS(w, r)
	if err != nil {
		m.log.Warn("WebSocket 升级失败", "err", err)
		return
	}
	defer func() { _ = conn.Close(httpserver.CloseNormal, "bye") }()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	out := make(chan wsEnvelope, wsSendBuffer)
	go m.wsWriter(ctx, cancel, conn, out)

	if !m.wsSend(ctx, out, wsEnvelope{Type: "hello", Data: helloPayload{At: time.Now().UnixMilli()}}) {
		return
	}

	query := r.URL.Query()
	sessionID := strings.TrimSpace(query.Get("sessionId"))
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	querySince, hasQuerySince := parseSince(query.Get("since"))

	subscribed := false
	startSubscription := func(since int64, replay bool) {
		if subscribed {
			return
		}
		subscribed = true
		go m.wsPump(ctx, since, replay, out)
	}
	if hasQuerySince {
		startSubscription(querySince, true)
	}

	for {
		data, err := conn.Read(ctx)
		if err != nil {
			m.log.Debug("WebSocket 读结束", "err", err)
			return
		}
		var frame inboundFrame
		if err := json.Unmarshal(data, &frame); err != nil {
			m.wsError(ctx, out, codeBadRequest, "帧不是合法 JSON")
			continue
		}
		switch frame.Type {
		case "subscribe":
			var payload subscribePayload
			if err := json.Unmarshal(frame.Data, &payload); err != nil {
				m.wsError(ctx, out, codeBadRequest, "subscribe.data 非法")
				continue
			}
			if strings.TrimSpace(payload.SessionID) == "" {
				payload.SessionID = sessionID
			}
			if payload.Since != nil {
				since := *payload.Since
				if since < 0 {
					since = 0
				}
				startSubscription(since, true)
			} else {
				// 未带 since：只订阅"连接之后"的事件，避免把历史 delta 重放给 onDelta 型客户端。
				// 需要历史回放请显式传 since=0 或查询参数 ?since=。
				startSubscription(0, false)
			}
		case "chat":
			var payload chatPayload
			if err := json.Unmarshal(frame.Data, &payload); err != nil {
				m.wsError(ctx, out, codeBadRequest, "chat.data 非法")
				continue
			}
			explicitSession := strings.TrimSpace(payload.SessionID) != ""
			if strings.TrimSpace(payload.SessionID) == "" {
				payload.SessionID = sessionID
			}
			// 兼容：客户端先 chat 后 subscribe 时，先起流，避免丢自己的事件。
			startSubscription(0, false)
			if _, err := m.startTurnExplicit(ctx, payload.SessionID, payload.Text, ClassRefine, payload.Attachments, payload.ReplyToMessageID, explicitSession); err != nil {
				code, message := codeInternal, "发送失败"
				var reqErr *requestError
				if errors.As(err, &reqErr) {
					code, message = reqErr.code, reqErr.message
				}
				m.wsErrorWithText(ctx, out, code, message, payload.Text)
			}
		case "correct":
			var payload correctPayload
			if err := json.Unmarshal(frame.Data, &payload); err != nil {
				m.wsError(ctx, out, codeBadRequest, "correct.data 非法")
				continue
			}
			// M50：对指定消息的编辑/修改一律拒绝；保留无 target 的“停止当前流式回复”语义。
			if strings.TrimSpace(payload.TargetMessageID) != "" {
				m.wsErrorWithText(ctx, out, "edit_disabled", "消息编辑/修改已禁用", payload.Text)
				continue
			}
			if strings.TrimSpace(payload.SessionID) == "" {
				payload.SessionID = sessionID
			}
			startSubscription(0, false)
			if err := m.correct(ctx, payload.SessionID, payload.TargetMessageID, payload.Text); err != nil {
				m.wsError(ctx, out, codeInternal, "修正失败")
			}
		case "ping":
			// 服务端 30s 的 control ping 已足够。
		default:
			m.wsError(ctx, out, codeBadRequest, "未知帧类型: "+frame.Type)
		}
	}
}

func (m *Module) wsWriter(ctx context.Context, cancel context.CancelFunc, conn *httpserver.WSConn, out <-chan wsEnvelope) {
	ticker := time.NewTicker(heartbeatPeriod)
	defer ticker.Stop()
	for {
		select {
		case env, ok := <-out:
			if !ok {
				return
			}
			if err := conn.WriteJSON(ctx, env); err != nil {
				m.log.Debug("WebSocket 写失败", "err", err)
				_ = conn.Close(httpserver.CloseGoingAway, "write failed")
				cancel()
				return
			}
		case <-ticker.C:
			if err := conn.Ping(ctx); err != nil {
				m.log.Debug("WebSocket ping 失败", "err", err)
				cancel()
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// wsPump 先订阅再回放，保证 subscribe 与实时事件之间没有窗口。
// replay=false 时只订阅连接之后的事件（用 LatestID 跳过历史；需要历史请显式给 since）。
func (m *Module) wsPump(ctx context.Context, since int64, replay bool, out chan<- wsEnvelope) {
	sub, unsubscribe := m.events.Subscribe(ctx)
	defer unsubscribe()

	last := since
	if !replay {
		if latest, err := m.events.LatestID(ctx); err == nil && latest > last {
			last = latest
		}
	} else {
		events, err := m.events.Replay(ctx, since)
		if err != nil {
			m.log.Error("WebSocket 回放事件失败", "err", err)
			m.wsError(ctx, out, codeInternal, "回放事件失败")
			return
		}
		for _, ev := range events {
			if ev.ID <= last || !isWSEventType(ev.Type) {
				continue
			}
			if !m.wsSend(ctx, out, eventEnvelope(ev)) {
				return
			}
			last = ev.ID
		}
	}

	for {
		select {
		case ev, ok := <-sub:
			if !ok {
				return
			}
			if ev.ID <= last || !isWSEventType(ev.Type) {
				continue
			}
			if !m.wsSend(ctx, out, eventEnvelope(ev)) {
				return
			}
			last = ev.ID
		case <-ctx.Done():
			return
		}
	}
}

// isWSEventType 只暴露契约 §5 的增量事件；Loop 内部事件落库但不进 WS。
func isWSEventType(typ string) bool {
	switch typ {
	case eventlog.TypeMessageCreated, eventlog.TypeMessageDelta, eventlog.TypeMessageDone, eventlog.TypeStatus,
		eventlog.TypeReplyCreated, eventlog.TypeReplyDelta, eventlog.TypeReplyDone, eventlog.TypeReplyRetracted,
		eventlog.TypeTaskCreated, eventlog.TypeTaskUpdated, eventlog.TypeTaskReport, eventlog.TypeTraceReasoning,
		eventlog.TypeWorkflowCreated, eventlog.TypeWorkflowUpdated, eventlog.TypeWorkflowDone,
		eventlog.TypeViewUpdated, eventlog.TypeViewRender, eventlog.TypeViewBindingFailed, eventlog.TypeViewRendererError,
		eventlog.TypeTeamCreated, eventlog.TypeTeamArchived, eventlog.TypeTeamTemplateApplied,
		eventlog.TypeTeamMemberAdded, eventlog.TypeTeamMemberStatus, eventlog.TypeTeamOwnerChanged,
		eventlog.TypeTeamMessageQueued, eventlog.TypeTeamMessageDelivered, eventlog.TypeTeamMessageFailed,
		eventlog.TypeTeamTriggerFired, eventlog.TypeTeamTriggerFailed, eventlog.TypeTeamDeliverableReady,
		eventlog.TypeCardUpdated, eventlog.TypeCardAction:
		return true
	}
	return false
}

func eventEnvelope(ev eventlog.Event) wsEnvelope {
	return wsEnvelope{Type: ev.Type, Data: json.RawMessage(ev.Payload), ID: ev.ID}
}

func (m *Module) wsSend(ctx context.Context, out chan<- wsEnvelope, env wsEnvelope) bool {
	select {
	case out <- env:
		return true
	case <-ctx.Done():
		return false
	}
}

func (m *Module) wsError(ctx context.Context, out chan<- wsEnvelope, code, message string) {
	m.wsErrorWithText(ctx, out, code, message, "")
}

func (m *Module) wsErrorWithText(ctx context.Context, out chan<- wsEnvelope, code, message, text string) {
	_ = m.wsSend(ctx, out, wsEnvelope{Type: "error", Data: errorPayload{Code: code, Message: message, Text: text}})
}

func parseSince(raw string) (int64, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, false
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id < 0 {
		return 0, false
	}
	return id, true
}
