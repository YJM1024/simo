package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"simo/internal/platform/config"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

func postChatReply(t *testing.T, baseURL, sessionID, text, replyTo string) int {
	t.Helper()
	status, body := postJSON(t, baseURL+"/api/chat", map[string]any{
		"sessionId": sessionID, "text": text, "replyToMessageId": replyTo,
	})
	if status != http.StatusAccepted {
		t.Fatalf("chat reply = %d %s", status, body)
	}
	return status
}

func findMessage(messages []map[string]any, role, text string) map[string]any {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i]["role"] == role && strings.Contains(messages[i]["text"].(string), text) {
			return messages[i]
		}
	}
	return nil
}

func TestM15ReplyToAgentAndSelf(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "第一条消息"); status != http.StatusAccepted {
		t.Fatalf("first chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	messages := listMessages(t, ts.URL, "main")
	var agentMsg, userMsg map[string]any
	for _, message := range messages {
		if message["role"] == "agent" {
			agentMsg = message
		}
		if message["role"] == "user" {
			userMsg = message
		}
	}
	if agentMsg == nil || userMsg == nil {
		t.Fatalf("缺少基础消息: %+v", messages)
	}
	postChatReply(t, ts.URL, "main", "回复 agent", agentMsg["id"].(string))
	waitForReplyDone(t, ts.URL, "main")
	messages = listMessages(t, ts.URL, "main")
	replied := findMessage(messages, "user", "回复 agent")
	if replied == nil {
		t.Fatalf("未找到回复消息: %+v", messages)
	}
	snapshot, _ := replied["replyTo"].(map[string]any)
	if snapshot == nil || snapshot["id"] != agentMsg["id"] || snapshot["role"] != "agent" {
		t.Fatalf("replyTo agent 快照 = %+v", replied["replyTo"])
	}
	text, _ := snapshot["text"].(string)
	if len([]rune(text)) > 200 || snapshot["sessionId"] == "" || snapshot["sessionTitle"] == "" {
		t.Fatalf("replyTo 快照字段非法: %+v", snapshot)
	}

	postChatReply(t, ts.URL, "main", "回复自己", userMsg["id"].(string))
	waitForReplyDone(t, ts.URL, "main")
	messages = listMessages(t, ts.URL, "main")
	replied = findMessage(messages, "user", "回复自己")
	snapshot, _ = replied["replyTo"].(map[string]any)
	if snapshot == nil || snapshot["id"] != userMsg["id"] || snapshot["role"] != "user" {
		t.Fatalf("replyTo self 快照 = %+v", replied)
	}
}

func TestM15CrossSessionReplySnapshot(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "主会话原文"); status != http.StatusAccepted {
		t.Fatalf("main chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	target := findMessage(listMessages(t, ts.URL, "main"), "agent", "")
	if target == nil {
		t.Fatal("缺主会话 agent 消息")
	}
	child := createSession(t, ts.URL, "main", "跨会话子")
	postChatReply(t, ts.URL, child, "跨会话引用", target["id"].(string))
	waitForReplyDone(t, ts.URL, child)
	replied := findMessage(listMessages(t, ts.URL, child), "user", "跨会话引用")
	if replied == nil {
		t.Fatal("缺跨会话回复")
	}
	snapshot, _ := replied["replyTo"].(map[string]any)
	if snapshot == nil || snapshot["sessionId"] != "main" || snapshot["sessionTitle"] == "" {
		t.Fatalf("跨会话快照 = %+v", replied["replyTo"])
	}
}

func TestM15QuoteContextInjected(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "被引用的原文"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	target := findMessage(listMessages(t, ts.URL, "main"), "agent", "")
	if target == nil {
		t.Fatal("缺 agent 消息")
	}
	postChatReply(t, ts.URL, "main", "引用后的问题", target["id"].(string))
	waitForReplyDone(t, ts.URL, "main")
	// The debug snapshot may still point at the previous turn until the quoted turn's
	// request is built. Poll briefly instead of asserting on a single read (full-suite
	// timing made this flaky).
	deadline := time.Now().Add(5 * time.Second)
	var status int
	var body []byte
	for {
		status, body = httpGet(t, ts.URL+"/api/debug/last-llm-request")
		if status == http.StatusOK && strings.Contains(string(body), "[引用回复]") {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("模型上下文未注入引用: %d %s", status, body)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestM15ReplyPersistsAcrossRestart(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "持久化原文"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	target := findMessage(listMessages(t, ts.URL, "main"), "agent", "")
	if target == nil {
		t.Fatal("缺 agent 消息")
	}
	postChatReply(t, ts.URL, "main", "持久化回复", target["id"].(string))
	waitForReplyDone(t, ts.URL, "main")
	ts.Close()
	_ = a.Stop(context.Background())
	_ = a.Close()
	app2, err := buildAppWithProvider(context.Background(), a.cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("restart: %v", err)
	}
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatalf("restart start: %v", err)
	}
	ts2 := httptest.NewServer(app2.handler)
	t.Cleanup(func() {
		ts2.Close()
		_ = app2.Stop(context.Background())
		_ = app2.Close()
	})
	messages := listMessages(t, ts2.URL, "main")
	replied := findMessage(messages, "user", "持久化回复")
	if replied == nil {
		t.Fatal("重启后缺回复消息")
	}
	snapshot, _ := replied["replyTo"].(map[string]any)
	if snapshot == nil || snapshot["id"] != target["id"] {
		t.Fatalf("重启后 replyTo 丢失: %+v", replied)
	}
}
