package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"

	"simo/internal/platform/config"
)

func sendCardForIdempotency(t *testing.T, baseURL string, actionID, actionName, route string) string {
	t.Helper()
	schema := cardTestSchema(actionID, actionName, route)
	if actions, ok := schema["actions"].([]map[string]any); ok && len(actions) > 0 {
		actions[0]["args"] = map[string]any{"text": "卡片幂等消息"}
	}
	status, body := postJSON(t, baseURL+"/api/actions/chat.send_card", map[string]any{
		"sessionId": "main", "fallbackText": "幂等测试卡片", "schema": schema,
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
	return created.Data.Card.ID
}

func rawCardAction(baseURL, cardID, actionID string, payload map[string]any) (int, []byte, error) {
	body, _ := json.Marshal(map[string]any{"payload": payload})
	resp, err := http.Post(baseURL+"/api/cards/"+cardID+"/actions/"+actionID, "application/json", bytes.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	var out bytes.Buffer
	_, _ = out.ReadFrom(resp.Body)
	return resp.StatusCode, out.Bytes(), nil
}

func TestM76CardActionIdempotentSequential(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	cardID := sendCardForIdempotency(t, ts.URL, "submit", "chat.send", "action")
	payload := map[string]any{"choice": "yes"}
	status, first, err := rawCardAction(ts.URL, cardID, "submit", payload)
	if err != nil || status != http.StatusOK {
		t.Fatalf("first action = %d err=%v body=%s", status, err, first)
	}
	status, second, err := rawCardAction(ts.URL, cardID, "submit", payload)
	if err != nil || status != http.StatusOK {
		t.Fatalf("second action = %d err=%v body=%s", status, err, second)
	}
	if !strings.Contains(string(second), `"idempotent":true`) {
		t.Fatalf("第二次应返回已应用结果: %s", second)
	}
	var firstResult, secondResult map[string]any
	_ = json.Unmarshal(first, &firstResult)
	_ = json.Unmarshal(second, &secondResult)
	firstInner, _ := firstResult["result"].(map[string]any)
	secondInner, _ := secondResult["result"].(map[string]any)
	if firstInner == nil || secondInner == nil || firstInner["messageId"] != secondInner["messageId"] {
		t.Fatalf("幂等结果不一致: first=%v second=%v", firstInner, secondInner)
	}
	messages := listMessages(t, ts.URL, "main")
	count := 0
	for _, message := range messages {
		if message["role"] == "user" && strings.Contains(message["text"].(string), "卡片幂等消息") {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("重复提交产生 %d 条用户消息，期望 1", count)
	}
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("卡片动作不应创建任务: %v", tasks)
	}
	status, body := httpGet(t, ts.URL+"/api/cards/"+cardID)
	if status != http.StatusOK || !strings.Contains(string(body), `"status":"submitted"`) || !strings.Contains(string(body), `"version":1`) {
		t.Fatalf("卡片状态/版本错误: %d %s", status, body)
	}
}

func TestM76CardActionIdempotentConcurrent(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	cardID := sendCardForIdempotency(t, ts.URL, "submit", "chat.send", "action")
	payload := map[string]any{"choice": "yes"}
	type outcome struct {
		status int
		body   []byte
		err    error
	}
	results := make([]outcome, 2)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			status, body, err := rawCardAction(ts.URL, cardID, "submit", payload)
			results[index] = outcome{status: status, body: body, err: err}
		}(i)
	}
	wg.Wait()
	okCount := 0
	for _, result := range results {
		if result.err != nil {
			t.Fatalf("concurrent action error: %v", result.err)
		}
		if result.status == http.StatusOK {
			okCount++
		}
	}
	if okCount != 2 {
		t.Fatalf("并发重复提交应都返回一致结果，实际=%+v", results)
	}
	messages := listMessages(t, ts.URL, "main")
	count := 0
	for _, message := range messages {
		if message["role"] == "user" && strings.Contains(message["text"].(string), "卡片幂等消息") {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("并发重复提交产生 %d 条用户消息，期望 1", count)
	}
	if tasks := listTasks(t, ts.URL); len(tasks) != 0 {
		t.Fatalf("并发卡片动作不应创建任务: %v", tasks)
	}
}

func TestM76DifferentActionsAreIndependent(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	card1 := sendCardForIdempotency(t, ts.URL, "submit", "chat.send", "action")
	card2 := sendCardForIdempotency(t, ts.URL, "refresh", "session.list", "action")
	status, body, err := rawCardAction(ts.URL, card1, "submit", map[string]any{"choice": "a"})
	if err != nil || status != http.StatusOK {
		t.Fatalf("action1 = %d err=%v %s", status, err, body)
	}
	status, body, err = rawCardAction(ts.URL, card2, "refresh", map[string]any{"choice": "b"})
	if err != nil || status != http.StatusOK {
		t.Fatalf("action2 = %d err=%v %s", status, err, body)
	}
	if strings.Contains(string(body), `"idempotent":true`) {
		t.Fatalf("不同 action/卡片不应命中共用回执: %s", body)
	}
}
