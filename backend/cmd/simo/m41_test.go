package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"simo/internal/platform/config"
)

func cardTestSchema(actionID, actionName, route string) map[string]any {
	return map[string]any{
		"schemaVersion": 1,
		"id":            "view-card-test",
		"title":         "操作卡片",
		"layout":        map[string]any{"kind": "rows"},
		"blocks": []map[string]any{
			{"id": "body", "type": "text", "props": map[string]any{"text": "请选择操作"}},
		},
		"actions": []map[string]any{
			{"id": actionID, "action": actionName, "route": route, "args": map[string]any{}},
		},
		"equivalence": map[string]any{"chatPrompt": "请按卡片里的操作继续处理。"},
		"meta":        map[string]any{"createdBy": "agent", "reason": "card test"},
	}
}

func TestM41CardsSendGetPatchAndActions(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "请查看操作卡片。",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK {
		t.Fatalf("send card = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID        string `json:"id"`
				MessageID string `json:"messageId"`
				Version   int    `json:"version"`
			} `json:"card"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Data.Card.ID == "" {
		t.Fatalf("send card JSON = %v %s", err, body)
	}
	cardID := created.Data.Card.ID
	messageID := created.Data.Card.MessageID
	status, body = httpGet(t, ts.URL+"/api/cards/"+cardID)
	if status != http.StatusOK || !strings.Contains(string(body), `"fallbackText":"请查看操作卡片。"`) {
		t.Fatalf("get card = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/messages?sessionId=main")
	if status != http.StatusOK || !strings.Contains(string(body), `"cards"`) || !strings.Contains(string(body), cardID) {
		t.Fatalf("messages cards = %d %s", status, body)
	}
	// PATCH 版本 +1；旧 baseVersion 冲突 409。
	status, body = postJSONMethod(t, ts.URL+"/api/cards/"+cardID, http.MethodPatch, map[string]any{
		"baseVersion": 1, "fallbackText": "卡片更新后的回退文本。",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK || !strings.Contains(string(body), `"version":2`) {
		t.Fatalf("patch card = %d %s", status, body)
	}
	status, body = postJSONMethod(t, ts.URL+"/api/cards/"+cardID, http.MethodPatch, map[string]any{
		"baseVersion": 1, "fallbackText": "stale",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusConflict {
		t.Fatalf("stale patch = %d %s", status, body)
	}
	// route=action：执行会话动作 + 幂等。
	status, body = postJSON(t, ts.URL+"/api/cards/"+cardID+"/actions/go", map[string]any{"payload": map[string]any{"limit": 1}})
	if status != http.StatusOK || !strings.Contains(string(body), `"route":"action"`) {
		t.Fatalf("card action = %d %s", status, body)
	}
	status, body2 := postJSON(t, ts.URL+"/api/cards/"+cardID+"/actions/go", map[string]any{"payload": map[string]any{"limit": 1}})
	if status != http.StatusOK || !strings.Contains(string(body2), `"idempotent":true`) {
		t.Fatalf("card action idempotent = %d %s", status, body2)
	}
	_ = messageID
	// fallbackText 必需。
	status, _ = postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusBadRequest {
		t.Fatalf("missing fallback = %d", status)
	}
}

func TestM41CardValidationRejects(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	base := cardTestSchema("go", "session.list", "action")
	cases := []map[string]any{
		// 缺 fallback
		{"sessionId": "main", "schema": base},
		// 未知块
		func() map[string]any {
			schema := cardTestSchema("go", "session.list", "action")
			schema["blocks"] = []map[string]any{{"id": "x", "type": "script", "props": map[string]any{}}}
			return map[string]any{"sessionId": "main", "fallbackText": "x", "schema": schema}
		}(),
		// 动作不存在
		map[string]any{"sessionId": "main", "fallbackText": "x",
			"schema": cardTestSchema("bad", "no.such.action", "action")},
		// 含动作但缺 chatPrompt
		func() map[string]any {
			schema := cardTestSchema("go", "session.list", "action")
			delete(schema, "equivalence")
			return map[string]any{"sessionId": "main", "fallbackText": "x", "schema": schema}
		}(),
		// 数据绑定写动作
		func() map[string]any {
			schema := cardTestSchema("go", "session.list", "action")
			schema["blocks"] = []map[string]any{{"id": "x", "type": "text", "props": map[string]any{"text": "x"},
				"data": map[string]any{"action": "task.retry", "args": map[string]any{}}}}
			return map[string]any{"sessionId": "main", "fallbackText": "x", "schema": schema}
		}(),
	}
	for i, body := range cases {
		status, response := postJSON(t, ts.URL+"/api/actions/chat.send_card", body)
		if status != http.StatusBadRequest {
			t.Fatalf("invalid card[%d] = %d %s", i, status, response)
		}
	}
}

func TestM41UpdateCardAction(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "原卡片",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK {
		t.Fatalf("send = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID string `json:"id"`
			} `json:"card"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &created)
	status, body = postJSON(t, ts.URL+"/api/actions/ui.update_card", map[string]any{
		"cardId": created.Data.Card.ID, "baseVersion": 1, "fallbackText": "动作更新",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK || !strings.Contains(string(body), `"version":2`) {
		t.Fatalf("ui.update_card = %d %s", status, body)
	}
}

func TestM41CardUpdatedBroadcast(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main")
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("hello = %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "WS 卡片",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK {
		t.Fatalf("send = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID string `json:"id"`
			} `json:"card"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &created)
	status, body = postJSONMethod(t, ts.URL+"/api/cards/"+created.Data.Card.ID, http.MethodPatch, map[string]any{
		"baseVersion": 1, "fallbackText": "WS 更新",
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK {
		t.Fatalf("patch = %d %s", status, body)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		frame := readWS(t, ctx, conn)
		if frame.Type == "card.updated" && strings.Contains(string(frame.Data), created.Data.Card.ID) {
			return
		}
	}
	t.Fatalf("未收到 card.updated")
}

func TestM41CardExpiredState(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "过期卡片", "expiresAt": time.Now().Add(-time.Second).UnixMilli(),
		"schema": cardTestSchema("go", "session.list", "action"),
	})
	if status != http.StatusOK {
		t.Fatalf("send = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID string `json:"id"`
			} `json:"card"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &created)
	_, body = httpGet(t, ts.URL+"/api/cards/"+created.Data.Card.ID)
	if !strings.Contains(string(body), `"status":"expired"`) {
		t.Fatalf("expired status = %s", body)
	}
	status, body = postJSON(t, ts.URL+"/api/cards/"+created.Data.Card.ID+"/actions/go", map[string]any{"payload": map[string]any{}})
	if status != http.StatusConflict {
		t.Fatalf("expired action = %d %s", status, body)
	}
}

func TestM41CardAgentRouteAndDisabled(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "请回复卡片。",
		"schema": cardTestSchema("reply", "session.get", "agent"),
	})
	if status != http.StatusOK {
		t.Fatalf("send = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID string `json:"id"`
			} `json:"card"`
		} `json:"data"`
	}
	_ = json.Unmarshal(body, &created)
	cardID := created.Data.Card.ID
	status, body = postJSON(t, ts.URL+"/api/cards/"+cardID+"/actions/reply", map[string]any{
		"payload": map[string]any{"choice": "yes"},
	})
	if status != http.StatusAccepted {
		t.Fatalf("agent route = %d %s", status, body)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		_, messages := httpGet(t, ts.URL+"/api/messages?sessionId=main")
		if strings.Contains(string(messages), `"role":"agent"`) && strings.Contains(string(messages), "卡片操作") {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	// 状态 submitted 后不可再次操作；同 payload 应幂等。
	status, body = postJSON(t, ts.URL+"/api/cards/"+cardID+"/actions/reply", map[string]any{
		"payload": map[string]any{"choice": "yes"},
	})
	if status != http.StatusAccepted || !strings.Contains(string(body), `"idempotent":true`) {
		t.Fatalf("agent idempotent = %d %s", status, body)
	}
	// PATCH disabled 后动作 409。
	status, body = postJSONMethod(t, ts.URL+"/api/cards/"+cardID, http.MethodPatch, map[string]any{
		"baseVersion": 1, "status": "disabled", "fallbackText": "已停用",
	})
	if status != http.StatusOK {
		t.Fatalf("disable = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/cards/"+cardID+"/actions/reply", map[string]any{"payload": map[string]any{"choice": "no"}})
	if status != http.StatusConflict {
		t.Fatalf("disabled action = %d %s", status, body)
	}
}
