package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"simo/internal/platform/config"
)

func jsonDataMap(body []byte) map[string]any {
	var root map[string]any
	_ = json.Unmarshal(body, &root)
	data, _ := root["data"].(map[string]any)
	if data == nil {
		data, _ = root["job"].(map[string]any)
	}
	return data
}

func jsonDataString(body []byte, key string) string {
	data := jsonDataMap(body)
	value, _ := data[key].(string)
	return value
}

func jsonDataNestedString(body []byte, outer, key string) string {
	data := jsonDataMap(body)
	nested, _ := data[outer].(map[string]any)
	value, _ := nested[key].(string)
	return value
}

func jsonDataObjects(body []byte, key string) []map[string]any {
	data := jsonDataMap(body)
	raw, _ := data[key].([]any)
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		if record, ok := item.(map[string]any); ok {
			out = append(out, record)
		}
	}
	return out
}

func TestM31TeamEventsBroadcastOnWS(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main")
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("hello = %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})

	status, body := postJSON(t, ts.URL+"/api/actions/team.template.upsert", map[string]any{
		"name": "WS 团队", "roles": []map[string]any{
			{"roleKey": "researcher", "title": "研究员", "roleType": "generic", "agentId": "researcher"},
			{"roleKey": "reviewer", "title": "审校", "roleType": "template"},
		},
	})
	if status != http.StatusOK {
		t.Fatalf("template = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/actions/team.create", map[string]any{"sessionId": "main", "templateId": jsonDataString(body, "id")})
	if status != http.StatusOK {
		t.Fatalf("team = %d %s", status, body)
	}
	teamID := jsonDataNestedString(body, "team", "id")
	fromMember := ""
	toSession := ""
	for _, member := range jsonDataObjects(body, "members") {
		if member["roleType"] == "generic" {
			fromMember, _ = member["id"].(string)
		}
		if member["roleType"] == "template" {
			toSession, _ = member["sessionId"].(string)
		}
	}
	status, body = postJSON(t, ts.URL+"/api/actions/team.trigger.create", map[string]any{
		"teamId": teamID, "fromMemberId": fromMember, "toSessionId": toSession,
		"content": "审校", "idempotencyKey": "ws-trigger-" + teamID,
	})
	if status != http.StatusOK {
		t.Fatalf("trigger = %d %s", status, body)
	}
	triggerID := jsonDataString(body, "id")
	status, body = postJSON(t, ts.URL+"/api/actions/team.trigger.fire", map[string]any{"id": triggerID})
	if status != http.StatusOK {
		t.Fatalf("fire = %d %s", status, body)
	}
	sawCreated, sawMember, sawTrigger := false, false, false
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) && (!sawCreated || !sawMember || !sawTrigger) {
		readCtx, readCancel := context.WithTimeout(ctx, 500*time.Millisecond)
		_, data, err := conn.Read(readCtx)
		readCancel()
		if err != nil {
			break
		}
		text := string(data)
		switch {
		case strings.Contains(text, `"type":"team.created"`):
			sawCreated = true
			if !strings.Contains(text, `"teamId"`) || !strings.Contains(text, `"sessionId"`) {
				t.Fatalf("team.created 缺字段: %s", text)
			}
		case strings.Contains(text, `"type":"team.member.added"`):
			sawMember = true
		case strings.Contains(text, `"type":"team.trigger.fired"`):
			sawTrigger = true
			if !strings.Contains(text, `"teamId"`) || !strings.Contains(text, `"sessionId"`) || !strings.Contains(text, `"toSessionId"`) {
				t.Fatalf("team.trigger.fired 缺字段: %s", text)
			}
		}
	}
	if !sawCreated || !sawMember || !sawTrigger {
		t.Fatalf("团队事件未完整广播: created=%v member=%v trigger=%v", sawCreated, sawMember, sawTrigger)
	}
	// 幂等 fire 不应再次广播 team.trigger.fired。
	status, body = postJSON(t, ts.URL+"/api/actions/team.trigger.fire", map[string]any{"id": triggerID})
	if status != http.StatusOK || !strings.Contains(string(body), `"idempotent":true`) {
		t.Fatalf("重复 fire = %d %s", status, body)
	}
	quietCtx, quietCancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer quietCancel()
	for {
		_, data, err := conn.Read(quietCtx)
		if err != nil {
			break
		}
		if strings.Contains(string(data), `"type":"team.trigger.fired"`) {
			t.Fatalf("幂等触发重复广播: %s", data)
		}
	}
	_ = conn.Close(websocket.StatusNormalClosure, "done")
}
