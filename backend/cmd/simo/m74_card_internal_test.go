package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM74CardActionDoesNotCreateTask(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "请操作卡片",
		"schema": cardTestSchema("submit", "session.get", "agent"),
	})
	if status != http.StatusOK {
		t.Fatalf("send card = %d %s", status, body)
	}
	var created struct {
		Data struct {
			Card struct {
				ID string `json:"id"`
			} `json:"card"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Data.Card.ID == "" {
		t.Fatalf("send card JSON: %v %s", err, body)
	}
	status, body = postJSON(t, ts.URL+"/api/cards/"+created.Data.Card.ID+"/actions/submit", map[string]any{
		"payload": map[string]any{"value": "submit"},
	})
	if status != http.StatusAccepted {
		t.Fatalf("card action = %d %s", status, body)
	}
	waitForReplyDone(t, ts.URL, "main")
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("卡片操作不应创建任务: %v", tasks)
	}
	_, decisions := httpGet(t, ts.URL+"/api/decisions?sessionId=main")
	if strings.Contains(string(decisions), `"kind":"DELEGATE"`) {
		t.Fatalf("卡片操作出现 DELEGATE 决策: %s", decisions)
	}
}

func TestM74InternalSystemTextDoesNotCreateTask(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, text := range []string{
		"[系统] 帮我整理一份本周周报并输出成文档。",
		"[内部] 帮我实现一个任务并交付代码。",
	} {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusBadRequest {
			t.Fatalf("chat %q = %d, want 400", text, status)
		}
	}
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("内部前缀消息不应创建任务: %v", tasks)
	}
	// 用户明确任务仍可创建。
	if status, _ := postChat(t, ts.URL, "帮我整理一份本周周报，输出成文档。"); status != http.StatusAccepted {
		t.Fatalf("explicit task chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	if tasks := waitForTaskCount(t, ts.URL, 1); len(tasks) == 0 {
		t.Fatalf("明确用户任务未创建")
	}
}
