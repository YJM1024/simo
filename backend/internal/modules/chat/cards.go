package chat

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"simo/internal/core/action"
	"simo/internal/core/eventlog"
	"simo/internal/platform/httpserver"
)

type Card struct {
	ID           string         `json:"id"`
	SessionID    string         `json:"sessionId"`
	MessageID    string         `json:"messageId"`
	Version      int            `json:"version"`
	Status       string         `json:"status"`
	Schema       map[string]any `json:"schema"`
	FallbackText string         `json:"fallbackText"`
	Title        string         `json:"title,omitempty"`
	ExpiresAt    int64          `json:"expiresAt,omitempty"`
	CreatedAt    int64          `json:"createdAt"`
	UpdatedAt    int64          `json:"updatedAt"`
}

type cardActionResult struct {
	OK         bool   `json:"ok"`
	CardID     string `json:"cardId"`
	ActionID   string `json:"actionId"`
	Route      string `json:"route"`
	Status     int    `json:"status"`
	Result     any    `json:"result,omitempty"`
	Error      any    `json:"error,omitempty"`
	Idempotent bool   `json:"idempotent,omitempty"`
	ApprovalID string `json:"approvalId,omitempty"`
	MessageID  string `json:"messageId,omitempty"`
	ReplyID    string `json:"replyId,omitempty"`
}

func (m *Module) registerCardHTTP(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/cards/{id}", m.handleCardGet)
	mux.HandleFunc("GET /api/cards/{id}/versions", m.handleCardVersions)
	mux.HandleFunc("PATCH /api/cards/{id}", m.handleCardPatch)
	mux.HandleFunc("POST /api/cards/{id}/actions/{actionId}", m.handleCardAction)
}

func (m *Module) handleCardGet(w http.ResponseWriter, r *http.Request) {
	card, err := m.loadCard(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		writeCardError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "card": card,
		"id": card.ID, "version": card.Version, "status": card.Status})
}

func (m *Module) handleCardVersions(w http.ResponseWriter, r *http.Request) {
	cardID := strings.TrimSpace(r.PathValue("id"))
	rows, err := m.store.Query(r.Context(), `SELECT version,schema_json,fallback_text,reason,created_at
		FROM card_versions WHERE card_id=? ORDER BY version DESC`, cardID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取卡片版本失败")
		return
	}
	defer rows.Close()
	versions := make([]map[string]any, 0, 8)
	for rows.Next() {
		var version int
		var schemaJSON, fallback, reason string
		var createdAt int64
		if rows.Scan(&version, &schemaJSON, &fallback, &reason, &createdAt) == nil {
			schema := map[string]any{}
			_ = json.Unmarshal([]byte(schemaJSON), &schema)
			versions = append(versions, map[string]any{"version": version, "schema": schema,
				"fallbackText": fallback, "reason": reason, "createdAt": createdAt})
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "versions": versions, "total": len(versions)})
}

func (m *Module) handleCardPatch(w http.ResponseWriter, r *http.Request) {
	cardID := strings.TrimSpace(r.PathValue("id"))
	var body map[string]any
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body); err != nil {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": map[string]any{"code": "invalid_argument", "message": "body 不是合法 JSON"}})
		return
	}
	card, err := m.updateCard(r.Context(), cardID, body)
	if err != nil {
		writeCardError(w, err)
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "card": card})
}

func (m *Module) handleCardAction(w http.ResponseWriter, r *http.Request) {
	cardID := strings.TrimSpace(r.PathValue("id"))
	actionID := strings.TrimSpace(r.PathValue("actionId"))
	var body map[string]any
	if r.Body != nil {
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&body)
	}
	if body == nil {
		body = map[string]any{}
	}
	result, err := m.runCardAction(r.Context(), cardID, actionID, body)
	if err != nil {
		writeCardError(w, err)
		return
	}
	status := result.Status
	if status == 0 {
		status = http.StatusOK
	}
	httpserver.WriteJSON(w, status, result)
}

type cardError struct {
	Code    string
	Message string
	Status  int
}

func (e *cardError) Error() string { return e.Message }

func newCardError(code, message string, status int) *cardError {
	return &cardError{Code: code, Message: message, Status: status}
}

func writeCardError(w http.ResponseWriter, err error) {
	var cardErr *cardError
	if errors.As(err, &cardErr) {
		httpserver.WriteJSON(w, cardErr.Status, map[string]any{"ok": false,
			"error": map[string]any{"code": cardErr.Code, "message": cardErr.Message}})
		return
	}
	httpserver.WriteJSON(w, http.StatusInternalServerError, map[string]any{"ok": false,
		"error": map[string]any{"code": "CARD_INTERNAL", "message": err.Error()}})
}

func cardErrorToActionError(err error) error {
	var cardErr *cardError
	if errors.As(err, &cardErr) {
		return &actionError{Code: cardErr.Code, Message: cardErr.Message, Status: cardErr.Status}
	}
	return err
}

func (m *Module) loadCard(ctx context.Context, cardID string) (Card, error) {
	var card Card
	var schemaJSON string
	err := m.store.QueryRow(ctx, `SELECT id,session_id,message_id,schema_json,fallback_text,version,status,expires_at,created_at,updated_at
		FROM message_cards WHERE id=?`, cardID).Scan(&card.ID, &card.SessionID, &card.MessageID,
		&schemaJSON, &card.FallbackText, &card.Version, &card.Status, &card.ExpiresAt, &card.CreatedAt, &card.UpdatedAt)
	if err == sql.ErrNoRows {
		return Card{}, newCardError("CARD_NOT_FOUND", "卡片不存在", http.StatusNotFound)
	}
	if err != nil {
		return Card{}, err
	}
	if json.Unmarshal([]byte(schemaJSON), &card.Schema) != nil {
		card.Schema = map[string]any{}
	}
	card.Title, _ = card.Schema["title"].(string)
	if card.ExpiresAt > 0 && time.Now().UnixMilli() > card.ExpiresAt &&
		(card.Status == "active" || card.Status == "submitted") {
		card.Status = "expired"
		now := time.Now().UnixMilli()
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE message_cards SET status='expired',updated_at=? WHERE id=? AND status IN ('active','submitted')`, now, card.ID)
			return err
		})
		m.emitCardUpdated(ctx, card)
	}
	return card, nil
}

func (m *Module) attachCards(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	byMessage := map[string][]Card{}
	for _, batch := range chunkStrings(cardMessageIDs(messages), 80) {
		placeholders := make([]string, len(batch))
		args := make([]any, len(batch))
		for i, id := range batch {
			placeholders[i] = "?"
			args[i] = id
		}
		rows, err := m.store.Query(ctx, `SELECT id,message_id,session_id,schema_json,fallback_text,version,status,expires_at,created_at,updated_at
			FROM message_cards WHERE message_id IN (`+strings.Join(placeholders, ",")+`) ORDER BY created_at ASC`, args...)
		if err != nil {
			continue
		}
		for rows.Next() {
			var card Card
			var schemaJSON string
			if rows.Scan(&card.ID, &card.MessageID, &card.SessionID, &schemaJSON, &card.FallbackText, &card.Version,
				&card.Status, &card.ExpiresAt, &card.CreatedAt, &card.UpdatedAt) == nil {
				_ = json.Unmarshal([]byte(schemaJSON), &card.Schema)
				byMessage[card.MessageID] = append(byMessage[card.MessageID], card)
			}
		}
		_ = rows.Close()
	}
	for i := range messages {
		if cards, ok := byMessage[messages[i].ID]; ok {
			messages[i].Cards = cards
		}
	}
}

func cardMessageIDs(messages []Message) []string {
	out := make([]string, 0, len(messages))
	seen := map[string]bool{}
	for _, msg := range messages {
		if msg.ID != "" && !seen[msg.ID] {
			seen[msg.ID] = true
			out = append(out, msg.ID)
		}
	}
	return out
}

func chunkStrings(values []string, size int) [][]string {
	if size <= 0 {
		size = 80
	}
	out := make([][]string, 0, (len(values)+size-1)/size)
	for len(values) > 0 {
		end := size
		if end > len(values) {
			end = len(values)
		}
		out = append(out, values[:end])
		values = values[end:]
	}
	return out
}

func (m *Module) sendCard(ctx context.Context, sessionID string, args map[string]any) (map[string]any, error) {
	fallback := firstNonEmptyString(stringArg(args, "fallbackText"), stringArg(args, "fallback_text"))
	if fallback == "" {
		return nil, newCardError("CARD_FALLBACK_REQUIRED", "fallbackText 必须非空", http.StatusBadRequest)
	}
	rawSchema := args["schema"]
	if rawSchema == nil {
		rawSchema = args["card"]
	}
	if schemaMap, ok := rawSchema.(map[string]any); ok {
		ensureFormConfirmActions(schemaMap)
	}
	schema, _, err := m.validateCardSchema(ctx, sessionID, rawSchema, fallback)
	if err != nil {
		return nil, err
	}
	messageID := strings.TrimSpace(stringArg(args, "messageId"))
	if messageID == "" {
		messageID = newID("msg")
	}
	cardID := newID("card")
	now := time.Now().UnixMilli()
	expiresAt := int64(0)
	switch value := args["expiresAt"].(type) {
	case float64:
		expiresAt = int64(value)
	case int64:
		expiresAt = value
	}
	message := Message{ID: messageID, SessionID: sessionID, Role: RoleAgent, Text: fallback,
		At: now, Status: StatusDone, Category: CategoryProgress, Attachments: []Attachment{}}
	card := Card{ID: cardID, SessionID: sessionID, MessageID: messageID, Version: 1,
		Status: "active", Schema: schema, FallbackText: fallback, Title: stringArg(schema, "title"),
		ExpiresAt: expiresAt, CreatedAt: now, UpdatedAt: now}
	message.Cards = []Card{card}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO messages(id,session_id,role,text,at,status,
			task_id,workflow_id,tool,approval_id,category,reply_to_id)
			VALUES (?,?,?,?,?,?, '','','','',?, '')`,
			message.ID, sessionID, RoleAgent, fallback, now, StatusDone, CategoryProgress); err != nil {
			return err
		}
		schemaJSON, _ := json.Marshal(schema)
		if _, err := tx.ExecContext(ctx, `INSERT INTO message_cards(id,session_id,message_id,schema_json,
			fallback_text,version,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			cardID, sessionID, messageID, string(schemaJSON), fallback, 1, "active", expiresAt, now, now); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO card_versions(card_id,version,schema_json,fallback_text,reason,created_at)
			VALUES (?,1,?,?, 'initial', ?)`, cardID, string(schemaJSON), fallback, now)
		return err
	}); err != nil {
		return nil, err
	}
	message.SessionTitle = m.sessionTitle(ctx, sessionID)
	message.SessionPath = m.sessionPath(ctx, sessionID)
	message.AgentID = m.sessionOwnerAgentID(ctx, sessionID)
	_, _ = m.events.Append(ctx, eventlog.TypeMessageCreated, message)
	return map[string]any{"card": card, "cardId": card.ID, "messageId": messageID, "version": 1}, nil
}

func (m *Module) validateCardSchema(ctx context.Context, sessionID string, raw any, fallback string) (map[string]any, []string, error) {
	schema := map[string]any{}
	switch typed := raw.(type) {
	case map[string]any:
		schema = deepCopyMap(typed)
	case []any:
		schema = map[string]any{"blocks": typed}
	default:
		return nil, nil, newCardError("CARD_SCHEMA_INVALID", "card schema 必须是对象或 blocks 数组", http.StatusBadRequest)
	}
	blocks, ok := schema["blocks"].([]any)
	if !ok || len(blocks) == 0 {
		return nil, nil, newCardError("CARD_SCHEMA_INVALID", "card schema.blocks 不能为空", http.StatusBadRequest)
	}
	if cardBlocksDepth(schema, 0) > 3 {
		return nil, nil, newCardError("CARD_LIMIT_EXCEEDED", "card schema 块深度超过 3", http.StatusBadRequest)
	}
	hasActions := cardHasActions(schema)
	adapted := deepCopyMap(schema)
	delete(adapted, "actions")
	delete(adapted, "expiresAt")
	if _, ok := adapted["schemaVersion"]; !ok {
		adapted["schemaVersion"] = 1
	}
	if _, ok := adapted["id"]; !ok {
		adapted["id"] = "view-card-" + shortCardHash(fallback)
	}
	if _, ok := adapted["sessionId"]; !ok {
		adapted["sessionId"] = sessionID
	}
	adapted["sessionId"] = sessionID
	if _, ok := adapted["title"]; !ok || strings.TrimSpace(stringArg(adapted, "title")) == "" {
		adapted["title"] = "交互卡片"
	}
	if _, ok := adapted["layout"]; !ok {
		adapted["layout"] = map[string]any{"kind": "rows"}
	}
	if _, ok := adapted["meta"]; !ok {
		adapted["meta"] = map[string]any{"createdBy": "agent", "reason": "message card"}
	}
	if hasActions {
		eq, _ := adapted["equivalence"].(map[string]any)
		if eq == nil || strings.TrimSpace(stringArg(eq, "chatPrompt")) == "" {
			return nil, nil, newCardError("VIEW_EQUIVALENCE_MISSING", "含动作绑定的卡片必须提供 equivalence.chatPrompt", http.StatusBadRequest)
		}
	}
	warnings, err := m.validateView(ctx, sessionID, adapted)
	if err != nil {
		var viewErr *viewValidationError
		if errors.As(err, &viewErr) {
			return nil, nil, newCardError(viewErr.Code, viewErr.Message, viewErr.Status)
		}
		return nil, nil, err
	}
	if err := m.validateCardActionBindings(ctx, sessionID, schema); err != nil {
		return nil, nil, err
	}
	if len([]rune(fallback)) > 4000 {
		return nil, nil, newCardError("CARD_LIMIT_EXCEEDED", "fallbackText 超过 4000 字", http.StatusBadRequest)
	}
	return schema, warnings, nil
}

func cardHasActions(schema map[string]any) bool {
	if actions, ok := schema["actions"].([]any); ok && len(actions) > 0 {
		return true
	}
	return cardWalkActions(schema, func([]map[string]any) bool { return true })
}

func (m *Module) validateCardActionBindings(ctx context.Context, sessionID string, schema map[string]any) error {
	valid := cardWalkActions(schema, func(actions []map[string]any) bool {
		for _, item := range actions {
			name := stringArg(item, "action")
			if name == "" {
				return false
			}
			if _, ok := action.Find(name); !ok {
				_ = ctx
				return false
			}
			route := strings.ToLower(strings.TrimSpace(stringArg(item, "route")))
			if route != "" && route != "agent" && route != "action" {
				return false
			}
		}
		return true
	})
	if !valid {
		return newCardError("CARD_ACTION_INVALID", "卡片动作不存在、缺少 action 或 route 非法", http.StatusBadRequest)
	}
	return nil
}

func cardWalkActions(value any, visit func([]map[string]any) bool) bool {
	switch typed := value.(type) {
	case map[string]any:
		if raw, ok := typed["actions"]; ok {
			if list, ok := raw.([]any); ok {
				actions := make([]map[string]any, 0, len(list))
				for _, item := range list {
					if record, ok := item.(map[string]any); ok {
						actions = append(actions, record)
					}
				}
				if !visit(actions) {
					return false
				}
			}
		}
		for _, child := range typed {
			if !cardWalkActions(child, visit) {
				return false
			}
		}
	case []any:
		for _, child := range typed {
			if !cardWalkActions(child, visit) {
				return false
			}
		}
	}
	return true
}

func findCardAction(schema map[string]any, actionID string) (map[string]any, bool) {
	var found map[string]any
	cardWalkActions(schema, func(actions []map[string]any) bool {
		for _, item := range actions {
			if stringArg(item, "id") == actionID {
				found = item
				return false
			}
		}
		return true
	})
	return found, found != nil
}

func (m *Module) updateCard(ctx context.Context, cardID string, body map[string]any) (Card, error) {
	card, err := m.loadCard(ctx, cardID)
	if err != nil {
		return Card{}, err
	}
	if card.Status == "disabled" || card.Status == "expired" {
		return Card{}, newCardError("CARD_NOT_ACTIONABLE", "卡片已停用或过期", http.StatusConflict)
	}
	baseVersion := intArg(body, "baseVersion", -1)
	if baseVersion >= 0 && baseVersion != card.Version {
		return Card{}, newCardError("CARD_BASE_CONFLICT", "baseVersion 已过期", http.StatusConflict)
	}
	fallback := strings.TrimSpace(stringArg(body, "fallbackText"))
	if fallback == "" {
		fallback = card.FallbackText
	}
	if len([]rune(fallback)) > 4000 {
		return Card{}, newCardError("CARD_LIMIT_EXCEEDED", "fallbackText 超过 4000 字", http.StatusBadRequest)
	}
	schema := card.Schema
	if raw, ok := body["schema"]; ok && raw != nil {
		validated, _, err := m.validateCardSchema(ctx, card.SessionID, raw, fallback)
		if err != nil {
			return Card{}, err
		}
		schema = validated
	} else if raw, ok := body["card"]; ok && raw != nil {
		validated, _, err := m.validateCardSchema(ctx, card.SessionID, raw, fallback)
		if err != nil {
			return Card{}, err
		}
		schema = validated
	}
	if strings.TrimSpace(fallback) == "" {
		return Card{}, newCardError("CARD_FALLBACK_REQUIRED", "fallbackText 必须非空", http.StatusBadRequest)
	}
	status := strings.TrimSpace(stringArg(body, "status"))
	if status != "" && status != "active" && status != "disabled" {
		return Card{}, newCardError("CARD_STATUS_INVALID", "PATCH 只允许 active/disabled", http.StatusBadRequest)
	}
	if status == "" {
		status = card.Status
	}
	now := time.Now().UnixMilli()
	newVersion := card.Version + 1
	schemaJSON, _ := json.Marshal(schema)
	reason := strings.TrimSpace(stringArg(body, "reason"))
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO card_versions(card_id,version,schema_json,fallback_text,reason,created_at)
			VALUES (?,?,?,?,?,?)`, card.ID, newVersion, string(schemaJSON), fallback, reason, now); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE message_cards SET schema_json=?,fallback_text=?,version=?,status=?,updated_at=? WHERE id=?`,
			string(schemaJSON), fallback, newVersion, status, now, card.ID)
		return err
	}); err != nil {
		return Card{}, err
	}
	card.Schema = schema
	card.FallbackText = fallback
	card.Version = newVersion
	card.Status = status
	card.UpdatedAt = now
	m.emitCardUpdated(ctx, card)
	return card, nil
}

func (m *Module) runCardAction(ctx context.Context, cardID, actionID string, body map[string]any) (cardActionResult, error) {
	card, err := m.loadCard(ctx, cardID)
	if err != nil {
		return cardActionResult{}, err
	}
	payload := body["payload"]
	if payload == nil {
		payload = body["args"]
	}
	if payload == nil {
		payload = map[string]any{}
	}
	payloadRaw, _ := json.Marshal(payload)
	payloadHash := hashCardPayload(payloadRaw)
	idempotencyKey := card.ID + ":" + actionID + ":" + payloadHash
	receiptStatus, existingResult, found := m.findCardReceipt(ctx, card.ID, actionID, payloadHash)
	if found {
		if receiptStatus == "processing" {
			receiptStatus, existingResult = m.waitCardReceipt(ctx, card.ID, actionID, payloadHash)
			if receiptStatus == "processing" {
				return cardActionResult{}, newCardError("CARD_ACTION_IN_PROGRESS", "同一卡片动作正在处理", http.StatusConflict)
			}
		}
		stored, ok := decodeCardReceipt(card.ID, actionID, existingResult)
		if ok {
			return stored, nil
		}
	}
	if card.Status == "disabled" || card.Status == "expired" || card.Status == "submitted" {
		return cardActionResult{}, newCardError("CARD_NOT_ACTIONABLE", "卡片已停用、过期或已提交", http.StatusConflict)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO card_action_receipts(card_id,action_id,payload_hash,idempotency_key,
			status,result_json,created_at,updated_at) VALUES (?,?,?,?, 'processing','{}',?,?)`,
			card.ID, actionID, payloadHash, idempotencyKey, time.Now().UnixMilli(), time.Now().UnixMilli())
		return err
	}); err != nil {
		// 并发提交时唯一键冲突：先等首请求完成，再返回同一结果；仍处理中则返回明确 in-progress。
		receiptStatus, existingResult = m.waitCardReceipt(ctx, card.ID, actionID, payloadHash)
		if receiptStatus == "processing" {
			return cardActionResult{}, newCardError("CARD_ACTION_IN_PROGRESS", "同一卡片动作正在处理", http.StatusConflict)
		}
		if stored, ok := decodeCardReceipt(card.ID, actionID, existingResult); ok {
			return stored, nil
		}
		return cardActionResult{}, err
	}
	binding, found := findCardAction(card.Schema, actionID)
	route := strings.ToLower(strings.TrimSpace(stringArg(binding, "route")))
	if route == "" {
		route = strings.ToLower(strings.TrimSpace(stringArg(body, "route")))
	}
	if route == "" {
		route = "agent"
	}
	if route != "agent" && route != "action" {
		return cardActionResult{}, newCardError("CARD_ROUTE_INVALID", "route 只能是 agent/action", http.StatusBadRequest)
	}
	result := cardActionResult{CardID: card.ID, ActionID: actionID, Route: route, OK: true}
	if !found && route == "agent" {
		result.OK = false
		result.Status = http.StatusBadRequest
		result.Error = map[string]any{"code": "CARD_ACTION_UNKNOWN", "message": "卡片不存在该 actionId"}
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
		return result, nil
	}
	if route == "agent" {
		text := cardAgentActionText(card, actionID, binding, payload)
		msg, turnErr := m.startTurnInternal(ctx, card.SessionID, text, ClassRefine, nil, "")
		if turnErr != nil {
			result.OK = false
			result.Status = http.StatusInternalServerError
			result.Error = map[string]any{"code": "CARD_AGENT_FAILED", "message": turnErr.Error()}
			m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
			return result, nil
		}
		result.Status = http.StatusAccepted
		result.MessageID = msg.ID
		card.Status = "submitted"
		m.storeCardStatus(ctx, card.ID, card.Status)
		m.emitCardUpdated(ctx, card)
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "done", result)
		return result, nil
	}
	actionName := strings.TrimSpace(stringArg(binding, "action"))
	if actionName == "" {
		actionName = actionID
	}
	args := map[string]any{}
	if rawArgs, ok := binding["args"].(map[string]any); ok {
		args = deepCopyMap(rawArgs)
	}
	if payloadMap, ok := payload.(map[string]any); ok {
		for key, value := range payloadMap {
			args[key] = value
		}
	}
	args["sessionId"] = card.SessionID
	def, ok := action.Find(actionName)
	if !ok {
		result.OK = false
		result.Status = http.StatusBadRequest
		result.Error = map[string]any{"code": "CARD_ACTION_UNKNOWN", "message": "动作不存在: " + actionName}
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
		return result, nil
	}
	if def.Risk == "R4" || def.Risk == "R5" {
		result.OK = false
		result.Status = http.StatusForbidden
		result.Error = map[string]any{"code": "DENIED_R4", "message": "破坏性动作不能由卡片直接执行"}
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
		return result, nil
	}
	if def.Risk == "R3" && m.currentPermissions(card.SessionID).Approval == approvalNever {
		result.OK = false
		result.Status = http.StatusForbidden
		result.Error = map[string]any{"code": "DENIED_NEVER", "message": "never 策略拒绝执行"}
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
		return result, nil
	}
	if def.Risk == "R3" && !m.hasSessionGrant(ctx, card.SessionID, coreactionToolName(actionName), args) {
		approval, err := m.createApproval(ctx, card.SessionID, coreactionToolName(actionName), args, def.Risk, m.currentPermissions(card.SessionID).Sandbox)
		if err == nil {
			result.OK = false
			result.Status = http.StatusConflict
			result.ApprovalID = approval.ID
			result.Error = map[string]any{"code": "APPROVAL_REQUIRED", "message": "该动作需要审批", "risk": def.Risk, "approvalId": approval.ID}
			m.finishCardReceipt(ctx, card, actionID, payloadHash, "approval_pending", result)
			return result, nil
		}
	}
	data, execErr := m.executeAction(ctx, card.SessionID, actionName, args)
	if execErr != nil {
		result.OK = false
		result.Status = http.StatusInternalServerError
		result.Error = map[string]any{"code": "CARD_ACTION_FAILED", "message": execErr.Error()}
		m.finishCardReceipt(ctx, card, actionID, payloadHash, "error", result)
		return result, nil
	}
	result.Result = data
	result.Status = http.StatusOK
	card.Status = "submitted"
	m.storeCardStatus(ctx, card.ID, card.Status)
	m.emitCardUpdated(ctx, card)
	m.auditEvent(ctx, "card.action", map[string]any{"cardId": card.ID, "actionId": actionID,
		"action": actionName, "sessionId": card.SessionID, "risk": def.Risk, "source": "card"})
	m.finishCardReceipt(ctx, card, actionID, payloadHash, "done", result)
	return result, nil
}

func coreactionToolName(name string) string { return action.ToolName(name) }

func (m *Module) finishCardReceipt(ctx context.Context, card Card, actionID, payloadHash, status string, result cardActionResult) {
	raw, _ := json.Marshal(result)
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE card_action_receipts SET status=?,result_json=?,updated_at=?
			WHERE card_id=? AND action_id=? AND payload_hash=?`, status, string(raw), time.Now().UnixMilli(), card.ID, actionID, payloadHash)
		return err
	})
}

func (m *Module) storeCardStatus(ctx context.Context, cardID, status string) {
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE message_cards SET status=?,updated_at=? WHERE id=?`, status, time.Now().UnixMilli(), cardID)
		return err
	})
}

func (m *Module) emitCardUpdated(ctx context.Context, card Card) {
	if m.events == nil {
		return
	}
	_, _ = m.events.Append(ctx, eventlog.TypeCardUpdated, map[string]any{
		"cardId": card.ID, "sessionId": card.SessionID, "messageId": card.MessageID,
		"version": card.Version, "status": card.Status,
	})
}

func cardAgentActionText(card Card, actionID string, binding map[string]any, payload any) string {
	raw, _ := json.Marshal(payload)
	actionName := ""
	if binding != nil {
		actionName = stringArg(binding, "action")
	}
	return fmt.Sprintf("用户提交了卡片操作（cardId=%s, actionId=%s, action=%s, payload=%s）。请处理并回复用户。",
		card.ID, actionID, actionName, string(raw))
}

func hashCardPayload(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func (m *Module) findCardReceipt(ctx context.Context, cardID, actionID, payloadHash string) (string, string, bool) {
	var status, result string
	err := m.store.QueryRow(ctx, `SELECT status,result_json FROM card_action_receipts
		WHERE card_id=? AND action_id=? AND payload_hash=?`, cardID, actionID, payloadHash).Scan(&status, &result)
	if err != nil {
		return "", "", false
	}
	return status, result, true
}

// waitCardReceipt 等待同一幂等键的首请求完成；返回 processing 表示超时仍在执行。
func (m *Module) waitCardReceipt(ctx context.Context, cardID, actionID, payloadHash string) (string, string) {
	deadline := time.Now().Add(5 * time.Second)
	for {
		status, result, ok := m.findCardReceipt(ctx, cardID, actionID, payloadHash)
		if ok && status != "processing" {
			return status, result
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return "processing", result
		}
		select {
		case <-ctx.Done():
			return "processing", result
		case <-time.After(20 * time.Millisecond):
		}
	}
}

func decodeCardReceipt(cardID, actionID, raw string) (cardActionResult, bool) {
	var stored cardActionResult
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return cardActionResult{}, false
	}
	stored.CardID = cardID
	stored.ActionID = actionID
	stored.OK = stored.OK || stored.Status == http.StatusOK || stored.Status == http.StatusAccepted
	stored.Idempotent = true
	if stored.Status == 0 {
		stored.Status = http.StatusOK
	}
	return stored, true
}

func shortCardHash(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:8])
}

func cardBlocksDepth(value any, level int) int {
	deepest := level
	switch typed := value.(type) {
	case map[string]any:
		if raw, ok := typed["blocks"].([]any); ok {
			if level+1 > deepest {
				deepest = level + 1
			}
			for _, child := range raw {
				if childDepth := cardBlocksDepth(child, level+1); childDepth > deepest {
					deepest = childDepth
				}
			}
		}
		for key, child := range typed {
			if key == "blocks" {
				continue
			}
			if childDepth := cardBlocksDepth(child, level); childDepth > deepest {
				deepest = childDepth
			}
		}
	case []any:
		for _, child := range typed {
			if childDepth := cardBlocksDepth(child, level); childDepth > deepest {
				deepest = childDepth
			}
		}
	}
	return deepest
}

// ensureFormConfirmActions 保证带字段的表单卡片一定有确认动作，避免只给下拉框而没有确认按钮。
func ensureFormConfirmActions(schema map[string]any) {
	blocks, ok := schema["blocks"].([]any)
	if !ok {
		return
	}
	for _, raw := range blocks {
		block, ok := raw.(map[string]any)
		if !ok || stringArg(block, "type") != "form" {
			continue
		}
		if actions, ok := block["actions"].([]any); ok && len(actions) > 0 {
			continue
		}
		block["actions"] = []any{map[string]any{"id": "confirm", "label": "确认", "action": "chat.send"}}
	}
}
