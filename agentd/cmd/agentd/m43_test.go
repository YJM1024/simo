package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
)

func findM43Message(messages []map[string]any, role, contains string) map[string]any {
	for _, message := range messages {
		if role != "" && message["role"] != role {
			continue
		}
		if text, _ := message["text"].(string); contains == "" || strings.Contains(text, contains) {
			return message
		}
	}
	return nil
}

func TestM43AutoRouteExplicitChildTitle(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	childID := createSession(t, ts.URL, "main", "前端排查")
	status, _ := postChat(t, ts.URL, "请继续处理「前端排查」里的布局问题。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	deadline := time.Now().Add(3 * time.Second)
	var childMessages, mainMessages []map[string]any
	for time.Now().Before(deadline) {
		childMessages = listMessages(t, ts.URL, childID)
		mainMessages = listMessages(t, ts.URL, "main")
		if findM43Message(childMessages, "user", "布局问题") != nil && findM43Message(childMessages, "agent", "") != nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if findM43Message(childMessages, "user", "布局问题") == nil {
		t.Fatalf("用户消息未路由到子会话: %v", childMessages)
	}
	if findM43Message(childMessages, "agent", "") == nil {
		t.Fatalf("agent 回复未落在子会话: %v", childMessages)
	}
	hint := findM43Message(mainMessages, "system", "前端排查")
	if hint == nil {
		t.Fatalf("主会话缺路由提示: %v", mainMessages)
	}
	if strings.Contains(string(mustJSONBytes(mainMessages)), "布局问题") {
		t.Fatalf("主会话不应包含被路由用户消息: %v", mainMessages)
	}
	if to, _ := hint["routedTo"].(string); to != childID {
		t.Fatalf("路由提示 routedTo = %q, want %s", to, childID)
	}
}

func TestM43AutoRouteRelevanceAndExplicitOverride(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	childID := createSession(t, ts.URL, "main", "前端排查")
	// 标题 2-gram 相关性（“前端”）。
	status, _ := postChat(t, ts.URL, "今天前端样式有个小问题，帮我看看。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, childID), "user", "样式") == nil {
		t.Fatalf("相关性路由失败")
	}
	// 显式“就在主会话回答”覆盖标题匹配。
	status, _ = postChat(t, ts.URL, "就在主会话回答：前端排查先记一下。")
	if status != http.StatusAccepted {
		t.Fatalf("override chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	mainMessages := listMessages(t, ts.URL, "main")
	if findM43Message(mainMessages, "user", "先记一下") == nil {
		t.Fatalf("显式覆盖失败，主会话无消息: %v", mainMessages)
	}
	// 无匹配留主会话。
	status, _ = postChat(t, ts.URL, "今天天气不错，随便聊聊。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, childID), "user", "天气") != nil {
		t.Fatalf("无匹配却路由到子会话")
	}
}

func TestM43ReplyInheritanceAndExplicitSession(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	childID := createSession(t, ts.URL, "main", "后端优化")
	status, _ := postJSON(t, ts.URL+"/api/chat", map[string]any{"sessionId": childID, "text": "子会话里的原始问题"})
	if status != http.StatusAccepted {
		t.Fatalf("child chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	childMessages := listMessages(t, ts.URL, childID)
	original := findM43Message(childMessages, "user", "原始问题")
	if original == nil {
		t.Fatalf("子会话用户消息缺失: %v", childMessages)
	}
	originalID, _ := original["id"].(string)
	// 主会话发起回复，但 reply 目标属于子会话 → 回复落子会话。
	status, _ = postJSON(t, ts.URL+"/api/chat", map[string]any{"text": "继续这条", "replyToMessageId": originalID})
	if status != http.StatusAccepted {
		t.Fatalf("reply chat = %d", status)
	}
	time.Sleep(250 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, childID), "user", "继续这条") == nil {
		t.Fatalf("回复未继承子会话")
	}
	// 显式 sessionId=main 优先于自动判断。
	status, _ = postJSON(t, ts.URL+"/api/chat", map[string]any{"sessionId": "main", "text": "后端优化就在主会话说"})
	if status != http.StatusAccepted {
		t.Fatalf("explicit chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, "main"), "user", "就在主会话说") == nil {
		t.Fatalf("显式 sessionId 未覆盖自动路由")
	}
}

func TestM43AutoRouteDisabled(t *testing.T) {
	t.Setenv("AGENTD_AUTO_ROUTE", "0")
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	childID := createSession(t, ts.URL, "main", "关闭路由")
	status, _ := postChat(t, ts.URL, "继续处理「关闭路由」的内容。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(200 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, "main"), "user", "关闭路由") == nil {
		t.Fatalf("关闭开关后消息未留主会话")
	}
	if findM43Message(listMessages(t, ts.URL, childID), "user", "关闭路由") != nil {
		t.Fatalf("关闭开关后仍路由到子会话")
	}
}

func mustJSONBytes(value any) []byte {
	data, _ := json.Marshal(value)
	return data
}
