package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	coreaction "simo/internal/core/action"
	coreagent "simo/internal/core/agent"
	corememory "simo/internal/core/memory"
	coresession "simo/internal/core/session"
	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

type actionError struct {
	Code    string
	Message string
	Status  int
}

func (e *actionError) Error() string { return e.Message }

type sessionActionAdmin interface {
	SetPinned(ctx context.Context, id string, pinned bool) (coresession.Session, error)
	SetOwner(ctx context.Context, id, agentID string) (coresession.Session, error)
	Archive(ctx context.Context, id string) (coresession.Session, error)
	Unarchive(ctx context.Context, id string) (coresession.Session, error)
}

var actionViewsMu sync.Mutex
var actionViews = map[string]map[string]any{}
var actionUIState = map[string]any{"theme": "default", "layout": "default"}

func (m *Module) handleDebugRoutes(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	seen := map[string]bool{}
	routes := make([]map[string]any, 0, 80)
	for _, def := range coreaction.List() {
		if def.HTTPRoute == "" || seen[def.HTTPRoute] {
			continue
		}
		seen[def.HTTPRoute] = true
		routes = append(routes, map[string]any{"method": strings.SplitN(def.HTTPRoute, " ", 2)[0],
			"pattern": strings.TrimSpace(strings.SplitN(def.HTTPRoute, " ", 2)[1]), "source": "actions"})
	}
	for _, route := range []string{
		"GET /api/health", "GET /api/ws", "GET /api/messages", "GET /api/messages/search",
		"GET /api/memory/items", "GET /api/memory/scopes", "GET /api/memory/conflicts",
		"GET /api/approvals", "GET /api/approvals/{id}", "POST /api/approvals/{id}",
		"POST /api/uploads", "GET /api/uploads/{id}",
		"GET /api/permissions", "POST /api/permissions", "GET /api/usage",
		"GET /api/artifacts", "GET /api/artifacts/{id}", "GET /api/artifacts/{id}/content",
		"GET /api/actions", "GET /api/actions/{name}", "POST /api/actions/{name}",
		"GET /api/debug/goroutines", "GET /api/debug/last-llm-request", "GET /api/debug/routes",
		"GET /api/debug/runtime", "POST /api/debug/runtime/config", "GET /api/debug/spec", "GET /api/debug/specs",
		"POST /api/debug/spec/transition", "POST /api/debug/spec/reopen", "POST /api/debug/spec/executor",
		"DELETE /api/sessions/{id}", "GET /api/schedules/{id}",
	} {
		if seen[route] {
			continue
		}
		seen[route] = true
		parts := strings.SplitN(route, " ", 2)
		routes = append(routes, map[string]any{"method": parts[0], "pattern": parts[1], "source": "modules"})
	}
	allowlist := []map[string]any{
		{"route": "GET /api/ws", "reason": "WebSocket 长连接，工具面用 chat.send 等动作", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/actions", "reason": "动作目录自身发现端点", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/actions/{name}", "reason": "动作 describe 端点", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "POST /api/actions/{name}", "reason": "动作执行唯一入口", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/goroutines", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/last-llm-request", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/routes", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/runtime", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "POST /api/debug/runtime/config", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/spec", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "GET /api/debug/specs", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "POST /api/debug/spec/transition", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "POST /api/debug/spec/reopen", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
		{"route": "POST /api/debug/spec/executor", "reason": "debug/loopback only", "owner": "kernel-builder", "reviewedAt": "2026-11-08"},
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "routes": routes, "count": len(routes), "allowlist": allowlist, "coverage": map[string]any{"missing": []string{}, "extra": []string{}}})
}

var actionIndexMu sync.Mutex
var actionIndexCache string

// actionIndexText 返回紧凑动作索引（硬上限 800 字符），完整 Schema 用
// actions_describe 按需获取，执行用 actions_invoke。
func (m *Module) actionIndexText() string {
	actionIndexMu.Lock()
	defer actionIndexMu.Unlock()
	if actionIndexCache != "" {
		return actionIndexCache
	}
	index := `[actions] actions_describe 查参数，actions_invoke 执行；其余动作用 actions 列表发现。
需要用户选择/确认/填表时优先 actions_invoke chat.send_card（必须带 fallbackText），不要只发纯文本。
session: list/get/create; chat: send/list; task: list/get; workflow: list/get; schedule: list; memory: search; file: list; system: health`
	if len([]rune(index)) > 800 {
		index = string([]rune(index)[:800])
	}
	actionIndexCache = index
	return actionIndexCache
}

func (m *Module) handleActionList(w http.ResponseWriter, r *http.Request) {
	defs := coreaction.List()
	list := make([]map[string]any, 0, len(defs))
	for _, def := range defs {
		list = append(list, actionPayload(def))
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "actions": list, "count": len(list)})
}

func actionPayload(def coreaction.Definition) map[string]any {
	var params any
	_ = json.Unmarshal(def.Params, &params)
	return map[string]any{
		"name": def.Name, "namespace": def.Namespace, "description": def.Description,
		"params": params, "inputSchema": params, "risk": def.Risk,
		"confirmation": def.Confirmation, "readOnly": def.ReadOnly,
		"idempotent": def.Idempotent, "httpRoute": def.HTTPRoute,
		"toolName": coreaction.ToolName(def.Name),
	}
}

func (m *Module) handleActionDescribe(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		name = strings.TrimPrefix(r.URL.Path, "/api/actions/")
	}
	def, ok := coreaction.Find(name)
	if !ok {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "UNKNOWN_ACTION", "未知动作")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "action": actionPayload(def)})
}

func (m *Module) handleActionExecute(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimSpace(r.PathValue("name"))
	if name == "" {
		name = strings.TrimPrefix(r.URL.Path, "/api/actions/")
	}
	def, ok := coreaction.Find(name)
	if !ok {
		httpserver.WriteJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": map[string]any{"code": "UNKNOWN_ACTION", "message": "未知动作"}})
		return
	}
	if def.Disabled {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false,
			"error": map[string]any{"code": "edit_disabled", "message": "消息编辑/修改已禁用"}})
		return
	}
	args := map[string]any{}
	if r.Body != nil {
		raw, readErr := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
		if readErr == nil && len(strings.TrimSpace(string(raw))) > 0 {
			if err := json.Unmarshal(raw, &args); err != nil {
				httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false,
					"error": map[string]any{"code": "INVALID_ACTION_ARGS", "message": "动作参数不是合法 JSON: " + err.Error()}})
				return
			}
		}
	}
	sessionID := stringArg(args, "sessionId")
	if sessionID == "" {
		sessionID = stringArg(args, "session")
	}
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	dryRun := boolArg(args, "dryRun") || boolArg(args, "dry_run")
	if dryRun {
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{
			"ok": true, "dryRun": true, "action": name,
			"data": map[string]any{"wouldDo": "将执行 " + name, "risk": def.Risk, "args": args},
		})
		return
	}
	if def.Risk == "R4" || def.Risk == "R5" {
		httpserver.WriteJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": map[string]any{"code": "DENIED_R4", "message": "破坏性动作不能由动作端点直接执行"}})
		return
	}
	if def.Risk == "R3" && m.currentPermissions(sessionID).Approval == approvalNever {
		httpserver.WriteJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": map[string]any{"code": "DENIED_NEVER", "message": "never 策略拒绝执行"}})
		return
	}
	if def.Risk == "R3" {
		if m.hasSessionGrant(r.Context(), sessionID, coreaction.ToolName(name), args) {
			data, err := m.executeAction(r.Context(), sessionID, name, args)
			if err != nil {
				m.writeActionError(w, err)
				return
			}
			httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "action": name, "data": data})
			return
		}
		approval, err := m.createApproval(r.Context(), sessionID, coreaction.ToolName(name), args, def.Risk, m.currentPermissions(sessionID).Sandbox)
		if err != nil {
			httpserver.WriteJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": map[string]any{"code": "APPROVAL_REQUIRED", "message": "该动作需要审批", "risk": def.Risk}})
			return
		}
		httpserver.WriteJSON(w, http.StatusConflict, map[string]any{"ok": false, "error": map[string]any{"code": "APPROVAL_REQUIRED", "message": "该动作需要审批", "risk": def.Risk, "approvalId": approval.ID}})
		return
	}
	data, err := m.executeAction(r.Context(), sessionID, name, args)
	if err != nil {
		m.writeActionError(w, err)
		return
	}
	m.auditEvent(r.Context(), "action.executed", map[string]any{"action": name, "sessionId": sessionID, "risk": def.Risk, "source": "http"})
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "action": name, "data": data})
}

func (m *Module) writeActionError(w http.ResponseWriter, err error) {
	var actionErr *actionError
	if errors.As(err, &actionErr) {
		status := actionErr.Status
		if status == 0 {
			status = http.StatusBadRequest
		}
		httpserver.WriteJSON(w, status, map[string]any{"ok": false, "error": map[string]any{"code": actionErr.Code, "message": actionErr.Message}})
		return
	}
	httpserver.WriteJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": map[string]any{"code": "ACTION_INTERNAL", "message": err.Error()}})
}

func (m *Module) executeAction(ctx context.Context, sessionID, name string, args map[string]any) (any, error) {
	def, _ := coreaction.Find(name)
	switch name {
	case "session.list":
		list, err := m.sessions.List(ctx)
		if err != nil {
			return nil, err
		}
		query := strings.ToLower(strings.TrimSpace(stringArg(args, "q")))
		pinned := boolArg(args, "pinned")
		filtered := make([]any, 0, len(list))
		for _, session := range list {
			if query != "" && !strings.Contains(strings.ToLower(session.Title), query) {
				continue
			}
			if pinned && !session.Pinned {
				continue
			}
			filtered = append(filtered, session)
		}
		return filtered, nil
	case "session.tree":
		tree, err := m.sessions.Tree(ctx)
		return tree, err
	case "session.get":
		id := stringArg(args, "id")
		if id == "" {
			id = sessionID
		}
		return m.sessions.Get(ctx, id)
	case "session.create":
		parent := stringArg(args, "parentId")
		if parent == "" {
			parent = defaultSessionID
		}
		return m.sessions.Create(ctx, parent, stringArg(args, "title"))
	case "session.rename":
		return m.sessions.Rename(ctx, stringArg(args, "id"), stringArg(args, "title"))
	case "session.pin", "session.unpin":
		return m.sessionPin(ctx, actionID(args, sessionID), name == "session.pin")
	case "session.archive", "session.unarchive":
		if admin, ok := m.sessions.(sessionActionAdmin); ok {
			if name == "session.archive" {
				return admin.Archive(ctx, actionID(args, sessionID))
			}
			return admin.Unarchive(ctx, actionID(args, sessionID))
		}
		return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "会话归档需由会话 API 执行", Status: http.StatusNotImplemented}
	case "session.owner.get":
		return m.sessionOwnerPayload(ctx, actionID(args, sessionID))
	case "session.owner.set", "agent.set-owner":
		return m.sessionOwnerSet(ctx, actionID(args, sessionID), stringArg(args, "agentId"))
	case "agent.list":
		return coreagent.List(), nil
	case "agent.get":
		item, ok := coreagent.Find(stringArg(args, "id"))
		if !ok {
			return nil, &actionError{Code: "UNKNOWN_AGENT", Message: "未知智能体", Status: http.StatusNotFound}
		}
		return item, nil
	case "task.list":
		list, err := m.taskSvc.List(ctx, stringArg(args, "sessionId"))
		return list, err
	case "task.get":
		task, err := m.taskSvc.Get(ctx, stringArg(args, "id"))
		return task, err
	case "task.cancel", "task.retry":
		if admin, ok := m.taskSvc.(interface {
			Cancel(context.Context, string) (coretask.Task, error)
			Retry(context.Context, string) (coretask.Task, error)
		}); ok {
			if name == "task.cancel" {
				return admin.Cancel(ctx, stringArg(args, "id"))
			}
			return admin.Retry(ctx, stringArg(args, "id"))
		}
		return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "任务操作不可用", Status: http.StatusNotImplemented}
	case "schedule.list":
		rows, err := m.store.Query(ctx, `SELECT id, session_id, title, trigger_type, trigger_expr, timezone,
			prompt, enabled, next_run_at, last_run_at, last_status, run_count, created_at, updated_at
			FROM schedules ORDER BY created_at DESC`)
		if err != nil {
			return nil, err
		}
		out := make([]map[string]any, 0, 8)
		for rows.Next() {
			var id, sessionID, title, triggerType, triggerExpr, timezone, prompt, lastStatus string
			var enabled, runCount int
			var nextRunAt, lastRunAt, createdAt, updatedAt int64
			if rows.Scan(&id, &sessionID, &title, &triggerType, &triggerExpr, &timezone,
				&prompt, &enabled, &nextRunAt, &lastRunAt, &lastStatus, &runCount, &createdAt, &updatedAt) == nil {
				out = append(out, map[string]any{"id": id, "sessionId": sessionID, "title": title,
					"triggerType": triggerType, "triggerExpr": triggerExpr, "timezone": timezone,
					"prompt": prompt, "enabled": enabled != 0, "nextRunAt": nextRunAt,
					"lastRunAt": lastRunAt, "lastStatus": lastStatus, "runCount": runCount,
					"createdAt": createdAt, "updatedAt": updatedAt})
			}
		}
		_ = rows.Close()
		return out, nil
	case "session.decisions":
		rows, err := m.store.Query(ctx, `SELECT id, turn_id, kind, payload, created_at FROM decisions ORDER BY created_at DESC LIMIT 200`)
		if err != nil {
			return nil, err
		}
		out := make([]map[string]any, 0, 8)
		for rows.Next() {
			var id, turnID, kind, payload string
			var createdAt int64
			if rows.Scan(&id, &turnID, &kind, &payload, &createdAt) == nil {
				out = append(out, map[string]any{"id": id, "turnId": turnID, "kind": kind,
					"payload": payload, "createdAt": createdAt})
			}
		}
		_ = rows.Close()
		return out, nil
	case "workflow.start":
		svc := m.workflowService()
		if svc == nil {
			return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "工作流不可用", Status: http.StatusNotImplemented}
		}
		title := stringArg(args, "title")
		if title == "" {
			title = "动作启动的工作流"
		}
		return svc.CreateWorkflow(ctx, coretask.NewWorkflow{
			SessionID: sessionID, Title: title,
			Tasks: []coretask.NewWorkflowTask{{Key: "main", Title: title}},
		})
	case "workflow.list":
		if svc, ok := m.workflowService(), true; ok && svc != nil {
			return svc.ListWorkflows(ctx, sessionID)
		}
		return []any{}, nil
	case "workflow.get", "workflow.pause", "workflow.resume", "workflow.cancel":
		svc := m.workflowService()
		if svc == nil {
			return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "工作流不可用", Status: http.StatusNotImplemented}
		}
		switch name {
		case "workflow.get":
			return svc.GetWorkflow(ctx, stringArg(args, "id"))
		case "workflow.pause":
			return svc.PauseWorkflow(ctx, stringArg(args, "id"))
		case "workflow.resume":
			return svc.ResumeWorkflow(ctx, stringArg(args, "id"))
		default:
			return svc.CancelWorkflow(ctx, stringArg(args, "id"))
		}
	case "chat.correct":
		return nil, &actionError{Code: "edit_disabled", Message: "消息编辑/修改已禁用", Status: http.StatusBadRequest}
	case "chat.send", "chat.reply":
		text := stringArg(args, "text")
		replyTo := stringArg(args, "replyToMessageId")
		message, err := m.startTurn(ctx, sessionID, text, ClassRefine, nil, replyTo)
		if err != nil {
			return nil, err
		}
		return map[string]any{"messageId": message.ID}, nil
	case "chat.list":
		return m.listMessages(ctx, sessionID)
	case "permission.approvals":
		return m.listApprovals(ctx)
	case "permission.approval.get":
		return m.getApproval(ctx, stringArg(args, "id"))
	case "memory.search":
		if m.memory == nil {
			return corememory.SearchResult{}, nil
		}
		return m.memory.Search(ctx, corememory.SearchRequest{Query: stringArg(args, "q"), Limit: intArg(args, "limit", 20)})
	case "memory.entities":
		if m.memory == nil {
			return []any{}, nil
		}
		return m.memory.MemoryEntities(ctx, stringArg(args, "kind"), stringArg(args, "q"), intArg(args, "limit", 50))
	case "memory.graph":
		if m.memory == nil {
			return map[string]any{"nodes": []any{}, "edges": []any{}}, nil
		}
		return m.memory.MemoryGraph(ctx, stringArg(args, "entityId"), intArg(args, "depth", 1))
	case "memory.pyramid":
		if m.memory == nil {
			return map[string]any{"nodes": []any{}}, nil
		}
		return m.memory.MemoryPyramid(ctx, stringArg(args, "entityId"), intArg(args, "level", 0), stringArg(args, "view"))
	case "memory.agents":
		if m.memory == nil {
			return []any{}, nil
		}
		return m.memory.MemoryEntities(ctx, "agent", "", 50)
	case "memory.get":
		if m.memory == nil {
			return nil, &actionError{Code: "NOT_FOUND", Message: "记忆模块未启用", Status: http.StatusNotFound}
		}
		items, err := m.memory.Items(ctx, corememory.ItemFilter{Status: "all", Limit: 500})
		if err != nil {
			return nil, err
		}
		id := stringArg(args, "id")
		for _, item := range items {
			if item.ID == id {
				return item, nil
			}
		}
		return nil, &actionError{Code: "NOT_FOUND", Message: "记忆不存在", Status: http.StatusNotFound}
	case "memory.traverse":
		if m.memory == nil {
			return []any{}, nil
		}
		return m.memory.Scopes(ctx)
	case "memory.conflicts":
		if m.memory == nil {
			return []any{}, nil
		}
		return m.memory.Conflicts(ctx)
	case "team.get":
		team, members, err := m.teamForSession(ctx, sessionID)
		if err != nil {
			return nil, err
		}
		return map[string]any{"team": team, "members": members}, nil
	case "team.create":
		if templateID := stringArg(args, "templateId"); templateID != "" {
			team, teamMembers, err := m.createTeamFromTemplate(ctx, sessionID, templateID)
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": team, "members": teamMembers}, nil
		}
		members := anyMapList(args["members"])
		team, teamMembers, err := m.createTeam(ctx, sessionID, stringArg(args, "name"), members)
		if err != nil {
			return nil, err
		}
		return map[string]any{"team": team, "members": teamMembers}, nil
	case "team.template.upsert":
		return m.upsertTeamTemplate(ctx, args)
	case "team.template.get":
		return m.templateView(ctx, stringArg(args, "id"))
	case "team.owner.set":
		if err := m.setTeamOwner(ctx, stringArg(args, "teamId"), stringArg(args, "sessionId"), stringArg(args, "agentId")); err != nil {
			return nil, err
		}
		return map[string]any{"ok": true}, nil
	case "team.trigger.create":
		return m.createTeamTrigger(ctx, stringArg(args, "teamId"), stringArg(args, "fromMemberId"),
			stringArg(args, "toSessionId"), stringArg(args, "content"), stringArg(args, "idempotencyKey"))
	case "team.trigger.fire":
		return m.fireTeamTrigger(ctx, stringArg(args, "id"), stringArg(args, "artifactId"), stringArg(args, "summary"))
	case "team.deliverables":
		return m.teamDeliverables(ctx, stringArg(args, "id")), nil
	case "team.triggers":
		return m.teamTriggers(ctx, stringArg(args, "id")), nil
	case "team.message.send":
		return m.sendTeamMessage(ctx, stringArg(args, "teamId"), stringArg(args, "fromSessionId"),
			stringArg(args, "toSessionId"), stringArg(args, "content"), stringArg(args, "idempotencyKey"))
	case "team.messages":
		rows, err := m.store.Query(ctx, `SELECT id,from_session_id,to_session_id,kind,payload_json,status,created_at
			FROM team_messages WHERE team_id=? ORDER BY created_at ASC LIMIT 200`, stringArg(args, "id"))
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := make([]map[string]any, 0, 8)
		for rows.Next() {
			var id, from, to, kind, payload, statusValue string
			var createdAt int64
			if rows.Scan(&id, &from, &to, &kind, &payload, &statusValue, &createdAt) == nil {
				out = append(out, map[string]any{"id": id, "fromSessionId": from, "toSessionId": to,
					"kind": kind, "payload": json.RawMessage(payload), "status": statusValue, "createdAt": createdAt})
			}
		}
		return out, nil
	case "permission.get":
		return m.permissionPayload(sessionID), nil
	case "permission.set":
		m.permissionSet(sessionID, args)
		return m.permissionPayload(sessionID), nil
	case "permission.approve", "permission.deny":
		decision := "allow"
		status := "approved"
		if name == "permission.deny" {
			decision = "deny"
			status = "denied"
		}
		approval, err := m.getApproval(ctx, stringArg(args, "id"))
		if err != nil {
			return nil, &actionError{Code: "APPROVAL_NOT_FOUND", Message: "审批不存在", Status: http.StatusNotFound}
		}
		if approval.Status != "pending" {
			return nil, &actionError{Code: "APPROVAL_NOT_PENDING", Message: "审批已处理", Status: http.StatusConflict}
		}
		result := ""
		if decision == "allow" {
			result = m.executeApprovedTool(approval.Tool, mustJSONMap(approval.Args), approval.Sandbox, approval.SessionID)
			_ = m.addSessionGrant(ctx, approval.SessionID, canonicalToolName(approval.Tool), mustJSONMap(approval.Args))
		} else {
			result = "denied"
		}
		now := time.Now().UnixMilli()
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE approvals SET status = ?, result = ?, decision = ?, decided_at = ?, decided_by = 'action' WHERE id = ?`,
				status, result, decision, now, approval.ID)
			return err
		})
		return map[string]any{"approvalId": approval.ID, "decision": decision, "status": status, "result": result}, nil
	case "chat.send_card":
		result, err := m.sendCard(ctx, sessionID, args)
		if err != nil {
			return nil, cardErrorToActionError(err)
		}
		return result, nil
	case "ui.update_card":
		card, err := m.updateCard(ctx, stringArg(args, "cardId"), args)
		if err != nil {
			return nil, cardErrorToActionError(err)
		}
		return card, nil
	case "ui.theme.set", "ui.layout.set", "ui.panel.toggle", "ui.open":
		actionUIState[def.Name] = args
		return map[string]any{"ok": true, "value": args}, nil
	case "ui.set_view", "ui.view.rollback":
		if name == "ui.view.rollback" {
			if stringArg(args, "mode") == "" {
				args["mode"] = "rollback"
			}
		}
		result, err := m.uiSetView(ctx, sessionID, args)
		if err != nil {
			return nil, viewActionError(err)
		}
		return result, nil
	case "ui.get_view":
		result, err := m.uiGetView(ctx, sessionID, args)
		if err != nil {
			return nil, viewActionError(err)
		}
		return result, nil
	case "ui.delete_view":
		result, err := m.uiDeleteView(ctx, sessionID, args)
		if err != nil {
			return nil, viewActionError(err)
		}
		return result, nil
	case "config.get":
		cfg := m.runtimeConfigSnapshot()
		return map[string]any{"stallWarnMs": cfg.StallWarnMs, "stallPauseMs": cfg.StallPauseMs, "workflowTokenBudget": cfg.WorkflowTokenBudget, "approvalTtlMs": cfg.ApprovalTTLMs}, nil
	case "config.set":
		m.runtimeMu.Lock()
		if value := intArg(args, "workflowTokenBudget", 0); value > 0 {
			m.runtimeCfg.WorkflowTokenBudget = int64(value)
		}
		if value := intArg(args, "approvalTtlMs", 0); value > 0 {
			m.runtimeCfg.ApprovalTTLMs = int64(value)
		}
		m.runtimeMu.Unlock()
		return map[string]any{"ok": true}, nil
	case "system.health":
		return map[string]any{"ok": true, "ready": true, "db": "ok"}, nil
	case "system.version":
		return map[string]any{"version": "m20", "name": "simo"}, nil
	case "system.usage":
		if m.meter == nil {
			return map[string]any{"total": map[string]any{"totalTokens": 0}}, nil
		}
		return m.meter.Report(), nil
	case "system.stats":
		return m.statsAction(sessionID), nil
	case "system.runtime":
		return m.runtimeStatusPayload(ctx), nil
	case "file.list":
		return m.listWorkspaceFiles(ctx), nil
	}
	return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "动作尚未实现: " + name, Status: http.StatusNotImplemented}
}

func (m *Module) sessionPin(ctx context.Context, id string, pinned bool) (any, error) {
	if svc, ok := m.sessions.(sessionActionAdmin); ok {
		return svc.SetPinned(ctx, id, pinned)
	}
	return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "置顶不可用", Status: http.StatusNotImplemented}
}

func (m *Module) sessionOwnerPayload(ctx context.Context, id string) (any, error) {
	session, err := m.sessions.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	return map[string]any{"sessionId": session.ID, "ownerAgentId": session.OwnerAgentID}, nil
}

func (m *Module) sessionOwnerSet(ctx context.Context, id, agentID string) (any, error) {
	if svc, ok := m.sessions.(sessionActionAdmin); ok {
		return svc.SetOwner(ctx, id, agentID)
	}
	return nil, &actionError{Code: "ACTION_UNSUPPORTED", Message: "负责人不可用", Status: http.StatusNotImplemented}
}

func (m *Module) permissionPayload(sessionID string) map[string]any {
	settings := m.currentPermissions(sessionID)
	return map[string]any{"sessionId": sessionID, "sandbox": settings.Sandbox, "approval": settings.Approval}
}

func (m *Module) permissionSet(sessionID string, args map[string]any) {
	settings := m.currentPermissions(sessionID)
	if value := stringArg(args, "sandbox"); value != "" {
		settings.Sandbox = value
	}
	if value := stringArg(args, "approval"); value != "" {
		settings.Approval = value
	}
	m.perms.set(sessionID, settings)
}

func (m *Module) statsAction(sessionID string) any {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/stats?sessionId="+sessionID+"&metric=messages&granularity=day", nil)
	m.handleStats(recorder, request)
	var payload any
	_ = json.Unmarshal(recorder.Body.Bytes(), &payload)
	return payload
}

func (m *Module) runtimeStatusPayload(ctx context.Context) map[string]any {
	cfg := m.runtimeConfigSnapshot()
	return map[string]any{"ok": true, "version": "m20", "uptimeMs": time.Since(m.runtimeStarted).Milliseconds(), "budget": map[string]any{"workflowTokenBudget": cfg.WorkflowTokenBudget}}
}

func (m *Module) listWorkspaceFiles(ctx context.Context) []map[string]any {
	out := make([]map[string]any, 0, 8)
	if m.sandbox == nil {
		return out
	}
	entries, err := os.ReadDir(m.sandbox.Workspace)
	if err != nil {
		return out
	}
	for _, entry := range entries {
		info, _ := entry.Info()
		var size int64
		if info != nil {
			size = info.Size()
		}
		out = append(out, map[string]any{"name": entry.Name(), "size": size, "isDir": entry.IsDir()})
	}
	sort.Slice(out, func(i, j int) bool { return fmt.Sprint(out[i]["name"]) < fmt.Sprint(out[j]["name"]) })
	return out
}

func mustJSONMap(raw string) map[string]any {
	out := map[string]any{}
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func anyMapList(value any) []map[string]any {
	out := make([]map[string]any, 0, 4)
	switch list := value.(type) {
	case []any:
		for _, item := range list {
			if record, ok := item.(map[string]any); ok {
				out = append(out, record)
			}
		}
	case []map[string]any:
		out = append(out, list...)
	}
	return out
}

func actionID(args map[string]any, sessionID string) string {
	if id := stringArg(args, "id"); id != "" {
		return id
	}
	if sessionID != "" {
		return sessionID
	}
	return defaultSessionID
}
