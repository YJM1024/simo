package chat

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"simo/internal/core/action"
	"simo/internal/core/eventlog"
	"simo/internal/platform/httpserver"
)

const (
	viewSchemaVersion = 1
	viewMaxBytes      = 256 * 1024
	viewMaxBlocks     = 200
	viewMaxVersions   = 20
)

var viewIDPattern = regexp.MustCompile(`^view-[a-z0-9-]{1,80}$`)

var viewBlockTypes = map[string]bool{
	"chat": true, "form": true, "ask": true, "action": true, "deliverable": true,
	"text": true, "markdown": true, "table": true, "image": true, "progress": true,
	"timeline": true, "dag": true, "kanban": true,
}

var viewBlockAllowedActions = map[string]map[string]bool{
	"chat":        {"chat.send": true, "chat.reply": true, "chat.correct": true, "chat.retract": true},
	"form":        {"chat.send": true, "session.create": true, "schedule.create": true},
	"ask":         {"chat.send": true},
	"action":      {"*": true},
	"deliverable": {"file.preview": true, "file.download": true, "file.delete": true},
	"table":       {"task.get": true, "task.cancel": true, "task.retry": true, "workflow.pause": true, "workflow.resume": true},
	"image":       {},
	"progress":    {"task.cancel": true, "task.retry": true, "workflow.pause": true, "workflow.resume": true},
	"timeline":    {},
	"dag":         {"task.get": true, "task.retry": true, "task.cancel": true},
	"kanban":      {"task.get": true, "task.cancel": true, "task.retry": true, "workflow.resume": true},
}

type viewValidationError struct {
	Code    string
	Message string
	Status  int
}

func (e *viewValidationError) Error() string { return e.Message }

func newViewError(code, message string, status int) *viewValidationError {
	return &viewValidationError{Code: code, Message: message, Status: status}
}

func viewActionError(err error) error {
	var viewErr *viewValidationError
	if ok := errorAs(err, &viewErr); ok {
		return &actionError{Code: viewErr.Code, Message: viewErr.Message, Status: viewErr.Status}
	}
	return err
}

func (m *Module) registerViewHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/views", m.handleViewList)
	mux.HandleFunc("GET /api/views/{id}", m.handleViewGet)
	mux.HandleFunc("GET /api/views/{id}/versions", m.handleViewVersions)
	mux.HandleFunc("GET /api/views/{id}/versions/{v}", m.handleViewVersionGet)
	mux.HandleFunc("GET /api/views/{id}/render-state", m.handleViewRenderState)
}

func (m *Module) handleViewList(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": map[string]any{"code": "bad_request", "message": "sessionId 不能为空"}})
		return
	}
	rows, err := m.store.Query(r.Context(), `SELECT id,title,current_version,status,created_at,updated_at FROM view_pages
		WHERE session_id=? AND status='active' ORDER BY updated_at DESC`, sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取视图失败")
		return
	}
	defer rows.Close()
	pages := make([]map[string]any, 0, 8)
	for rows.Next() {
		var id, title, statusValue string
		var version int
		var createdAt, updatedAt int64
		if rows.Scan(&id, &title, &version, &statusValue, &createdAt, &updatedAt) == nil {
			pages = append(pages, map[string]any{"id": id, "title": title, "version": version,
				"status": statusValue, "createdAt": createdAt, "updatedAt": updatedAt})
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "views": pages, "pages": pages, "items": pages, "total": len(pages)})
}

func (m *Module) loadViewPage(ctx context.Context, id string) (map[string]any, string, int, string, error) {
	var schemaJSON, sessionID, statusValue, title string
	var version int
	var updatedAt int64
	err := m.store.QueryRow(ctx, `SELECT schema_json,session_id,status,title,current_version,updated_at
		FROM view_pages WHERE id=?`, id).Scan(&schemaJSON, &sessionID, &statusValue, &title, &version, &updatedAt)
	if err == sql.ErrNoRows {
		return nil, "", 0, "", newViewError("VIEW_NOT_FOUND", "视图不存在", http.StatusNotFound)
	}
	if err != nil {
		return nil, "", 0, "", err
	}
	if statusValue == "deleted" {
		return nil, sessionID, version, statusValue, newViewError("VIEW_DELETED", "视图已删除", http.StatusGone)
	}
	schema := map[string]any{}
	if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
		return nil, sessionID, version, statusValue, err
	}
	return schema, sessionID, version, statusValue, nil
}

func (m *Module) handleViewGet(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	schema, sessionID, version, _, err := m.loadViewPage(r.Context(), id)
	if err != nil {
		m.writeViewError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "sessionId": sessionID,
		"version": version, "title": stringArg(schema, "title"), "schema": schema,
		"view": map[string]any{"id": id, "sessionId": sessionID, "version": version, "schema": schema}})
	if m.events != nil {
		_, _ = m.events.Append(r.Context(), eventlog.TypeViewRender, map[string]any{
			"pageId": id, "sessionId": sessionID, "version": version,
		})
	}
}

func (m *Module) handleViewVersions(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	rows, err := m.store.Query(r.Context(), `SELECT version,created_by,created_at,base_version,reason,schema_hash
		FROM view_versions WHERE page_id=? ORDER BY version DESC`, id)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取版本失败")
		return
	}
	defer rows.Close()
	versions := make([]map[string]any, 0, 8)
	for rows.Next() {
		var version, baseVersion int
		var createdBy, reason, hash string
		var createdAt int64
		if rows.Scan(&version, &createdBy, &createdAt, &baseVersion, &reason, &hash) == nil {
			versions = append(versions, map[string]any{"version": version, "createdBy": createdBy,
				"createdAt": createdAt, "baseVersion": baseVersion, "reason": reason, "hash": hash})
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "versions": versions, "total": len(versions)})
}

func (m *Module) handleViewVersionGet(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	version := atoiDefaultView(r.PathValue("v"))
	var schemaJSON string
	var createdAt int64
	var createdBy, reason string
	var baseVersion int
	if err := m.store.QueryRow(r.Context(), `SELECT schema_json,created_at,created_by,reason,base_version
		FROM view_versions WHERE page_id=? AND version=?`, id, version).Scan(&schemaJSON, &createdAt, &createdBy, &reason, &baseVersion); err != nil {
		m.writeViewError(w, newViewError("VIEW_NOT_FOUND", "版本不存在", http.StatusNotFound))
		return
	}
	schema := map[string]any{}
	_ = json.Unmarshal([]byte(schemaJSON), &schema)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id, "version": version,
		"createdBy": createdBy, "createdAt": createdAt, "reason": reason, "baseVersion": baseVersion, "schema": schema})
}

func (m *Module) handleViewRenderState(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	schema, sessionID, version, _, err := m.loadViewPage(r.Context(), id)
	if err != nil {
		m.writeViewError(w, err)
		return
	}
	var asOfSeq int64
	_ = m.store.QueryRow(r.Context(), `SELECT COALESCE(MAX(id),0) FROM events`).Scan(&asOfSeq)
	blocks, _ := schema["blocks"].([]any)
	bindings := make([]map[string]any, 0, len(blocks))
	for _, raw := range blocks {
		block, _ := raw.(map[string]any)
		binding := map[string]any{"blockId": stringArg(block, "id"), "type": stringArg(block, "type"), "status": "not_bound"}
		if data, ok := block["data"].(map[string]any); ok {
			binding["action"] = stringArg(data, "action")
			binding["status"] = "ready"
		}
		bindings = append(bindings, binding)
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "pageId": id, "sessionId": sessionID,
		"version": version, "asOfSeq": asOfSeq, "bindings": bindings,
		"warnings": []string{}})
}

func (m *Module) writeViewError(w http.ResponseWriter, err error) {
	var viewErr *viewValidationError
	if errorAs(err, &viewErr) {
		httpserver.WriteJSON(w, viewErr.Status, map[string]any{"ok": false,
			"error": map[string]any{"code": viewErr.Code, "message": viewErr.Message}})
		return
	}
	httpserver.WriteError(w, http.StatusInternalServerError, "视图操作失败")
}

// ---- actions ----

func (m *Module) uiSetView(ctx context.Context, sessionID string, args map[string]any) (map[string]any, error) {
	reason := strings.TrimSpace(stringArg(args, "reason"))
	if reason == "" {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "reason 不能为空", http.StatusBadRequest)
	}
	if requested := strings.TrimSpace(stringArg(args, "sessionId")); requested != "" && requested != sessionID {
		return nil, newViewError("VIEW_CROSS_SESSION_DENIED", "sessionId 必须是当前会话", http.StatusForbidden)
	}
	mode := strings.TrimSpace(stringArg(args, "mode"))
	if mode == "" {
		mode = "create"
	}
	pageID := strings.TrimSpace(stringArg(args, "pageId"))
	baseVersion := intArg(args, "baseVersion", -1)
	dryRun := boolArg(args, "dryRun")
	createdBy := strings.TrimSpace(stringArg(args, "createdBy"))
	if createdBy == "" {
		createdBy = "agent"
	}
	var schema map[string]any
	switch mode {
	case "rollback":
		if pageID == "" {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "pageId 不能为空", http.StatusBadRequest)
		}
		targetVersion := intArg(args, "targetVersion", 0)
		if targetVersion <= 0 {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "targetVersion 不合法", http.StatusBadRequest)
		}
		var schemaJSON string
		if err := m.store.QueryRow(ctx, `SELECT schema_json FROM view_versions WHERE page_id=? AND version=?`, pageID, targetVersion).Scan(&schemaJSON); err != nil {
			return nil, newViewError("VIEW_NOT_FOUND", "目标版本不存在", http.StatusNotFound)
		}
		if err := json.Unmarshal([]byte(schemaJSON), &schema); err != nil {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "目标版本 schema 损坏", http.StatusBadRequest)
		}
		if reason == "" {
			reason = fmt.Sprintf("rollback to v%d", targetVersion)
		}
	case "patch":
		if pageID == "" {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "pageId 不能为空", http.StatusBadRequest)
		}
		current, currentSession, _, _, err := m.loadViewPage(ctx, pageID)
		if err != nil {
			return nil, err
		}
		if currentSession != sessionID {
			return nil, newViewError("VIEW_CROSS_SESSION_DENIED", "不能修改其他会话的视图", http.StatusForbidden)
		}
		patched, err := applyViewPatch(current, args["patch"])
		if err != nil {
			return nil, err
		}
		schema = patched
	default:
		raw := args["schema"]
		if raw == nil {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "schema 不能为空", http.StatusBadRequest)
		}
		if err := remarshalJSON(raw, &schema); err != nil {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "schema 不是合法 JSON 对象", http.StatusBadRequest)
		}
	}
	if pageID == "" {
		pageID = strings.TrimSpace(stringArg(schema, "id"))
	}
	if pageID == "" {
		pageID = "view-" + sessionID + "-" + fmt.Sprintf("%d", time.Now().UnixNano()%1e9)
	}
	if !viewIDPattern.MatchString(pageID) {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "pageId 不符合 view-[a-z0-9-]", http.StatusBadRequest)
	}
	if title := stringArg(schema, "title"); strings.TrimSpace(title) == "" {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "title 不能为空", http.StatusBadRequest)
	}
	schema["id"] = pageID
	schema["sessionId"] = sessionID
	warnings, err := m.validateView(ctx, sessionID, schema)
	if err != nil {
		return nil, err
	}
	if dryRun {
		return map[string]any{"pageId": pageID, "version": 0, "dryRun": true, "warnings": warnings}, nil
	}
	// 当前版本与并发控制。
	var currentVersion int
	var currentStatus string
	var existingCount int
	_ = m.store.QueryRow(ctx, `SELECT COUNT(*) FROM view_pages WHERE id=? AND session_id=?`, pageID, sessionID).Scan(&existingCount)
	if existingCount > 0 {
		schemaJSONExists := ""
		_ = m.store.QueryRow(ctx, `SELECT current_version,status,schema_json FROM view_pages WHERE id=? AND session_id=?`, pageID, sessionID).Scan(&currentVersion, &currentStatus, &schemaJSONExists)
		if currentStatus == "deleted" {
			return nil, newViewError("VIEW_DELETED", "视图已删除，不能修改", http.StatusGone)
		}
		if mode == "create" {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "视图已存在，请使用 replace 或 patch", http.StatusBadRequest)
		}
		if baseVersion >= 0 && baseVersion != currentVersion {
			return nil, newViewError("VIEW_BASE_CONFLICT", "baseVersion 已过期", http.StatusConflict)
		}
		currentSchema := map[string]any{}
		_ = json.Unmarshal([]byte(schemaJSONExists), &currentSchema)
		if viewSchemaHash(currentSchema) == viewSchemaHash(schema) && mode != "rollback" {
			return map[string]any{"pageId": pageID, "version": currentVersion, "warnings": warnings, "idempotent": true}, nil
		}
	} else {
		if mode == "replace" || mode == "patch" || mode == "rollback" {
			return nil, newViewError("VIEW_NOT_FOUND", "视图不存在", http.StatusNotFound)
		}
		currentVersion = 0
	}
	newVersion := currentVersion + 1
	schemaJSON, _ := json.Marshal(schema)
	hash := viewSchemaHash(schema)
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO view_versions(page_id,version,schema_json,created_by,created_at,base_version,reason,schema_hash)
			VALUES (?,?,?,?,?,?,?,?)`, pageID, newVersion, string(schemaJSON), createdBy, now, currentVersion, reason, hash); err != nil {
			return err
		}
		if existingCount == 0 {
			_, err := tx.ExecContext(ctx, `INSERT INTO view_pages(id,session_id,title,schema_json,current_version,status,created_by,created_at,updated_at)
				VALUES (?,?,?,?,?, 'active',?,?,?)`, pageID, sessionID, stringArg(schema, "title"), string(schemaJSON), newVersion, createdBy, now, now)
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE view_pages SET schema_json=?,current_version=?,title=?,status='active',updated_at=? WHERE id=? AND session_id=?`,
			string(schemaJSON), newVersion, stringArg(schema, "title"), now, pageID, sessionID)
		return err
	}); err != nil {
		return nil, err
	}
	_, _ = m.events.Append(ctx, eventlog.TypeViewUpdated, map[string]any{
		"pageId": pageID, "sessionId": sessionID, "version": newVersion, "baseVersion": currentVersion,
		"mode": mode, "reason": reason, "hash": hash,
	})
	return map[string]any{"pageId": pageID, "version": newVersion, "warnings": warnings, "schemaHash": hash}, nil
}

func (m *Module) uiGetView(ctx context.Context, sessionID string, args map[string]any) (map[string]any, error) {
	pageID := strings.TrimSpace(stringArg(args, "pageId"))
	if pageID == "" {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "pageId 不能为空", http.StatusBadRequest)
	}
	schema, actualSession, version, _, err := m.loadViewPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	if actualSession != sessionID {
		return nil, newViewError("VIEW_CROSS_SESSION_DENIED", "不能读取其他会话的视图", http.StatusForbidden)
	}
	return map[string]any{"pageId": pageID, "sessionId": actualSession, "version": version, "schema": schema}, nil
}

func (m *Module) uiDeleteView(ctx context.Context, sessionID string, args map[string]any) (map[string]any, error) {
	pageID := strings.TrimSpace(stringArg(args, "pageId"))
	if pageID == "" {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "pageId 不能为空", http.StatusBadRequest)
	}
	_, actualSession, currentVersion, _, err := m.loadViewPage(ctx, pageID)
	if err != nil {
		return nil, err
	}
	if actualSession != sessionID {
		return nil, newViewError("VIEW_CROSS_SESSION_DENIED", "不能删除其他会话的视图", http.StatusForbidden)
	}
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE view_pages SET status='deleted',updated_at=? WHERE id=? AND session_id=?`, now, pageID, sessionID)
		return err
	}); err != nil {
		return nil, err
	}
	_, _ = m.events.Append(ctx, eventlog.TypeViewUpdated, map[string]any{
		"pageId": pageID, "sessionId": sessionID, "version": currentVersion, "deleted": true,
		"reason": stringArg(args, "reason"),
	})
	return map[string]any{"deleted": true, "pageId": pageID}, nil
}

// ---- validation ----

func (m *Module) validateView(ctx context.Context, sessionID string, schema map[string]any) ([]string, error) {
	warnings := make([]string, 0, 4)
	encoded, err := json.Marshal(schema)
	if err != nil {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "schema 不能序列化", http.StatusBadRequest)
	}
	if len(encoded) > viewMaxBytes {
		return nil, newViewError("VIEW_LIMIT_EXCEEDED", "视图超过 256KB", http.StatusBadRequest)
	}
	if err := validateViewSafe(schema, ""); err != nil {
		return nil, err
	}
	for key := range schema {
		switch key {
		case "schemaVersion", "id", "sessionId", "title", "layout", "blocks", "equivalence", "meta":
		default:
			return nil, newViewError("VIEW_UNKNOWN_FIELD", "未知顶层字段: "+key, http.StatusBadRequest)
		}
	}
	version := intArg(schema, "schemaVersion", 0)
	if version != viewSchemaVersion {
		return nil, newViewError("VIEW_SCHEMA_VERSION_UNSUPPORTED", "仅支持 schemaVersion=1", http.StatusBadRequest)
	}
	if actual := stringArg(schema, "sessionId"); actual != "" && actual != sessionID {
		return nil, newViewError("VIEW_CROSS_SESSION_DENIED", "schema.sessionId 与当前会话不一致", http.StatusForbidden)
	}
	title := stringArg(schema, "title")
	if len([]rune(title)) < 1 || len([]rune(title)) > 80 {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "title 长度必须为 1–80", http.StatusBadRequest)
	}
	if meta, ok := schema["meta"].(map[string]any); ok {
		if createdBy := stringArg(meta, "createdBy"); createdBy != "" && createdBy != "agent" && createdBy != "user" {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "meta.createdBy 只能是 agent|user", http.StatusBadRequest)
		}
	} else {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "meta 必须是对象", http.StatusBadRequest)
	}
	blocks, ok := schema["blocks"].([]any)
	if !ok || len(blocks) == 0 {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "blocks 必须是非空数组", http.StatusBadRequest)
	}
	if len(blocks) > viewMaxBlocks {
		return nil, newViewError("VIEW_LIMIT_EXCEEDED", "块数超过 200", http.StatusBadRequest)
	}
	layout, ok := schema["layout"].(map[string]any)
	if !ok {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "layout 必须是对象", http.StatusBadRequest)
	}
	if kind := stringArg(layout, "kind"); kind != "rows" && kind != "grid" {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "layout.kind 只能是 rows|grid", http.StatusBadRequest)
	}
	if cols := intArg(layout, "columns", 0); cols > 12 {
		return nil, newViewError("VIEW_LIMIT_EXCEEDED", "grid.columns 不能超过 12", http.StatusBadRequest)
	}
	blockIDs := map[string]bool{}
	hasActionBinding := false
	boundActionNames := map[string]bool{}
	for _, raw := range blocks {
		block, ok := raw.(map[string]any)
		if !ok {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "block 必须是对象", http.StatusBadRequest)
		}
		for key := range block {
			switch key {
			case "id", "type", "props", "data", "actions":
			default:
				return nil, newViewError("VIEW_UNKNOWN_FIELD", "块未知字段: "+key, http.StatusBadRequest)
			}
		}
		blockID := stringArg(block, "id")
		if blockID == "" || len(blockID) > 80 || blockIDs[blockID] {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "block.id 缺失或重复", http.StatusBadRequest)
		}
		blockIDs[blockID] = true
		blockType := stringArg(block, "type")
		if !viewBlockTypes[blockType] {
			return nil, newViewError("VIEW_UNKNOWN_BLOCK", "未知块类型: "+blockType, http.StatusBadRequest)
		}
		props, _ := block["props"].(map[string]any)
		if err := validateViewSafe(props, blockType); err != nil {
			return nil, err
		}
		if data, ok := block["data"].(map[string]any); ok {
			if err := m.validateViewBinding(ctx, sessionID, data); err != nil {
				return nil, err
			}
		}
		if actions, ok := block["actions"].([]any); ok && len(actions) > 0 {
			hasActionBinding = true
			if err := m.validateViewActions(blockType, actions); err != nil {
				return nil, err
			}
			for _, rawAction := range actions {
				if actionMap, ok := rawAction.(map[string]any); ok {
					boundActionNames[stringArg(actionMap, "action")] = true
				}
			}
		}
		if data, ok := block["data"].(map[string]any); ok {
			boundActionNames[stringArg(data, "action")] = true
		}
	}
	if areas, ok := layout["areas"].([]any); ok {
		if len(areas) > 200 {
			return nil, newViewError("VIEW_LIMIT_EXCEEDED", "layout.areas 超过 200", http.StatusBadRequest)
		}
		seen := map[string]bool{}
		for _, raw := range areas {
			area, _ := raw.(map[string]any)
			blockID := stringArg(area, "block")
			if blockID == "" || !blockIDs[blockID] || seen[blockID] {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "layout.areas 必须恰好覆盖每个 block 一次", http.StatusBadRequest)
			}
			seen[blockID] = true
		}
		if len(seen) != len(blockIDs) {
			return nil, newViewError("VIEW_SCHEMA_INVALID", "layout.areas 必须恰好覆盖每个 block 一次", http.StatusBadRequest)
		}
	}
	equivalence, _ := schema["equivalence"].(map[string]any)
	chatPrompt := strings.TrimSpace(stringArg(equivalence, "chatPrompt"))
	if hasActionBinding && chatPrompt == "" {
		return nil, newViewError("VIEW_EQUIVALENCE_MISSING", "含动作绑定的页面必须提供 equivalence.chatPrompt", http.StatusBadRequest)
	}
	if chatPrompt != "" {
		if len([]rune(chatPrompt)) > 500 {
			return nil, newViewError("VIEW_LIMIT_EXCEEDED", "chatPrompt 超过 500 字", http.StatusBadRequest)
		}
		for _, word := range []string{"点击", "拖拽", "按钮", "下拉框"} {
			if strings.Contains(chatPrompt, word) {
				return nil, newViewError("VIEW_EQUIVALENCE_MISSING", "chatPrompt 不能只描述 UI 操作", http.StatusBadRequest)
			}
		}
	}
	if seq, ok := equivalence["actionSequence"].([]any); ok {
		seqNames := map[string]bool{}
		for _, raw := range seq {
			item, _ := raw.(map[string]any)
			name := stringArg(item, "action")
			if _, exists := action.Find(name); !exists {
				return nil, newViewError("VIEW_ACTION_UNKNOWN", "等价动作不存在: "+name, http.StatusBadRequest)
			}
			if !boundActionNames[name] {
				return nil, newViewError("VIEW_EQUIVALENCE_MISMATCH", "actionSequence 包含未绑定动作: "+name, http.StatusBadRequest)
			}
			seqNames[name] = true
		}
		for name := range boundActionNames {
			if !seqNames[name] {
				return nil, newViewError("VIEW_EQUIVALENCE_MISMATCH", "actionSequence 缺少绑定动作: "+name, http.StatusBadRequest)
			}
		}
	}
	if len(warnings) == 0 && len(blocks) > 50 {
		warnings = append(warnings, "块数较多，建议拆分页面")
	}
	return warnings, nil
}

func (m *Module) validateViewBinding(ctx context.Context, sessionID string, data map[string]any) error {
	name := stringArg(data, "action")
	definition, ok := action.Find(name)
	if !ok {
		return newViewError("VIEW_ACTION_UNKNOWN", "数据绑定动作不存在: "+name, http.StatusBadRequest)
	}
	if !definition.ReadOnly {
		return newViewError("VIEW_BINDING_INVALID", "数据绑定只能引用只读动作: "+name, http.StatusBadRequest)
	}
	if args, ok := data["args"].(map[string]any); ok {
		for key, raw := range args {
			value, _ := raw.(string)
			if key == "sessionId" && value != "" && value != "$session" && value != sessionID {
				return newViewError("VIEW_CROSS_SESSION_DENIED", "禁止绑定其他会话数据", http.StatusForbidden)
			}
		}
	}
	return nil
}

func (m *Module) validateViewActions(blockType string, actions []any) error {
	allowed := viewBlockAllowedActions[blockType]
	seen := map[string]bool{}
	for _, raw := range actions {
		item, ok := raw.(map[string]any)
		if !ok {
			return newViewError("VIEW_SCHEMA_INVALID", "action 绑定必须是对象", http.StatusBadRequest)
		}
		id := stringArg(item, "id")
		if id == "" || seen[id] {
			return newViewError("VIEW_SCHEMA_INVALID", "action.id 缺失或重复", http.StatusBadRequest)
		}
		seen[id] = true
		name := stringArg(item, "action")
		if _, exists := action.Find(name); !exists {
			return newViewError("VIEW_ACTION_UNKNOWN", "动作不存在: "+name, http.StatusBadRequest)
		}
		if allowed != nil && !allowed["*"] && !allowed[name] {
			return newViewError("VIEW_ACTION_NOT_ALLOWED", "块不允许该动作: "+name, http.StatusBadRequest)
		}
		confirm := stringArg(item, "confirm")
		if confirm != "" && confirm != "none" && confirm != "risk" && confirm != "always" {
			return newViewError("VIEW_SCHEMA_INVALID", "confirm 只能是 none|risk|always", http.StatusBadRequest)
		}
	}
	return nil
}

func validateViewSafe(value any, blockType string) error {
	switch item := value.(type) {
	case map[string]any:
		for key, child := range item {
			lower := strings.ToLower(strings.TrimSpace(key))
			switch lower {
			case "html", "script", "jsx", "component", "eval", "style", "classname", "iframe", "onclick", "onload", "onerror":
				return newViewError("VIEW_UNSAFE_CONTENT", "禁止可执行/样式字段: "+key, http.StatusBadRequest)
			}
			if strings.HasPrefix(lower, "on") {
				return newViewError("VIEW_UNSAFE_CONTENT", "禁止事件属性: "+key, http.StatusBadRequest)
			}
			if strings.EqualFold(blockType, "image") && lower == "src" {
				src, _ := child.(string)
				if !strings.HasPrefix(src, "artifact:") && !strings.HasPrefix(src, "attachment:") {
					return newViewError("VIEW_UNSAFE_CONTENT", "图片只允许 artifact/attachment 引用", http.StatusBadRequest)
				}
			}
			if err := validateViewSafe(child, blockType); err != nil {
				return err
			}
		}
	case []any:
		for _, child := range item {
			if err := validateViewSafe(child, blockType); err != nil {
				return err
			}
		}
	case string:
		lower := strings.ToLower(item)
		for _, forbidden := range []string{"<script", "<iframe", "<style", "javascript:", "data:text/html", "{{", "}}"} {
			if strings.Contains(lower, forbidden) {
				return newViewError("VIEW_UNSAFE_CONTENT", "禁止可执行内容", http.StatusBadRequest)
			}
		}
	}
	return nil
}

func applyViewPatch(schema map[string]any, raw any) (map[string]any, error) {
	patch, ok := raw.(map[string]any)
	if !ok {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "patch 必须是对象", http.StatusBadRequest)
	}
	ops, ok := patch["ops"].([]any)
	if !ok || len(ops) == 0 {
		return nil, newViewError("VIEW_SCHEMA_INVALID", "patch.ops 不能为空", http.StatusBadRequest)
	}
	out := deepCopyMap(schema)
	blocks, _ := out["blocks"].([]any)
	for _, rawOp := range ops {
		op, _ := rawOp.(map[string]any)
		switch stringArg(op, "op") {
		case "set_page_props":
			if title := stringArg(op, "title"); title != "" {
				out["title"] = title
			}
		case "replace_blocks":
			next, ok := op["blocks"].([]any)
			if !ok {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "replace_blocks.blocks 非法", http.StatusBadRequest)
			}
			blocks = next
			out["blocks"] = blocks
		case "set_block_props":
			block := findViewBlock(blocks, stringArg(op, "blockId"))
			if block == nil {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "patch 目标块不存在", http.StatusBadRequest)
			}
			block["props"] = op["props"]
		case "set_block_actions":
			block := findViewBlock(blocks, stringArg(op, "blockId"))
			if block == nil {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "patch 目标块不存在", http.StatusBadRequest)
			}
			block["actions"] = op["actions"]
		case "add_block":
			block, ok := op["block"].(map[string]any)
			if !ok {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "add_block.block 非法", http.StatusBadRequest)
			}
			after := stringArg(op, "after")
			position := len(blocks)
			if after != "" {
				for index, raw := range blocks {
					existing, _ := raw.(map[string]any)
					if stringArg(existing, "id") == after {
						position = index + 1
						break
					}
				}
			}
			blocks = append(blocks[:position], append([]any{block}, blocks[position:]...)...)
			out["blocks"] = blocks
		case "remove_block":
			target := stringArg(op, "blockId")
			filtered := make([]any, 0, len(blocks))
			found := false
			for _, raw := range blocks {
				block, _ := raw.(map[string]any)
				if stringArg(block, "id") == target {
					found = true
					continue
				}
				filtered = append(filtered, raw)
			}
			if !found {
				return nil, newViewError("VIEW_SCHEMA_INVALID", "patch 目标块不存在", http.StatusBadRequest)
			}
			blocks = filtered
			out["blocks"] = blocks
		default:
			return nil, newViewError("VIEW_SCHEMA_INVALID", "不支持的 patch op", http.StatusBadRequest)
		}
	}
	return out, nil
}

func findViewBlock(blocks []any, id string) map[string]any {
	for _, raw := range blocks {
		block, _ := raw.(map[string]any)
		if stringArg(block, "id") == id {
			return block
		}
	}
	return nil
}

func deepCopyMap(value map[string]any) map[string]any {
	encoded, _ := json.Marshal(value)
	out := map[string]any{}
	_ = json.Unmarshal(encoded, &out)
	return out
}

func remarshalJSON(raw any, out *map[string]any) error {
	encoded, err := json.Marshal(raw)
	if err != nil {
		return err
	}
	return json.Unmarshal(encoded, out)
}

func viewSchemaHash(schema map[string]any) string {
	encoded, _ := json.Marshal(schema)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}

func boolArgView(args map[string]any, key string, fallback bool) bool {
	if raw, ok := args[key]; ok {
		switch value := raw.(type) {
		case bool:
			return value
		case string:
			return value == "true" || value == "1"
		}
	}
	return fallback
}

func atoiDefaultView(raw string) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0
	}
	return value
}

func errorAs(err error, target any) bool {
	if err == nil {
		return false
	}
	switch typed := target.(type) {
	case **viewValidationError:
		if matched, ok := err.(*viewValidationError); ok {
			*typed = matched
			return true
		}
	case **actionError:
		if matched, ok := err.(*actionError); ok {
			*typed = matched
			return true
		}
	}
	return false
}
