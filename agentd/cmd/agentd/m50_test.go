package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
)

func TestM50MessageEditingDisabled(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, _ := postChat(t, ts.URL, "这是一条不可编辑的历史消息")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	messages := listMessages(t, ts.URL, "main")
	var targetID string
	var beforeText string
	for _, message := range messages {
		if message["role"] == "user" {
			targetID, _ = message["id"].(string)
			beforeText, _ = message["text"].(string)
		}
	}
	if targetID == "" {
		t.Fatalf("未找到历史消息: %v", messages)
	}

	// HTTP 编辑路由全部拒绝。
	for _, test := range []struct {
		method string
		path   string
	}{
		{http.MethodPatch, "/api/messages/" + targetID},
		{http.MethodPost, "/api/messages/" + targetID + "/edit"},
		{http.MethodPost, "/api/messages/" + targetID + "/correct"},
	} {
		status, body := postJSONMethod(t, ts.URL+test.path, test.method, map[string]any{"text": "被改写的内容"})
		if status != http.StatusBadRequest || !strings.Contains(string(body), "edit_disabled") {
			t.Fatalf("edit route %s %s = %d %s", test.method, test.path, status, body)
		}
	}

	// 动作层拒绝。
	status, body := postJSON(t, ts.URL+"/api/actions/chat.correct", map[string]any{"text": "编辑"})
	if status != http.StatusBadRequest || !strings.Contains(string(body), "edit_disabled") {
		t.Fatalf("chat.correct = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/actions")
	if status != http.StatusOK || strings.Contains(string(body), `"chat.correct"`) {
		t.Fatalf("动作目录仍暴露 chat.correct: %s", body)
	}

	// 历史消息不变。
	after := listMessages(t, ts.URL, "main")
	found := false
	for _, message := range after {
		if message["id"] == targetID {
			found = true
			if message["text"] != beforeText || message["status"] == "retracted" {
				t.Fatalf("历史消息被修改: %+v", message)
			}
		}
	}
	if !found {
		t.Fatalf("历史消息丢失")
	}
}

func TestM50WebSocketEditRejected(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("hello = %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "correct", "data": map[string]any{
		"sessionId": "main", "targetMessageId": "msg-any", "text": "编辑历史",
	}})
	for {
		frame := readWS(t, ctx, conn)
		if frame.Type == "error" {
			var payload struct {
				Code string `json:"code"`
			}
			_ = json.Unmarshal(frame.Data, &payload)
			if payload.Code != "edit_disabled" {
				t.Fatalf("error code = %q", payload.Code)
			}
			return
		}
	}
}
