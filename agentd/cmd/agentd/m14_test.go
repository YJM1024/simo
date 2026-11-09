package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func waitAgentCategory(t *testing.T, baseURL, sessionID, category string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		messages := listMessages(t, baseURL, sessionID)
		for i := len(messages) - 1; i >= 0; i-- {
			if messages[i]["role"] != "agent" {
				continue
			}
			value, _ := messages[i]["category"].(string)
			if value == category {
				return messages[i]
			}
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("等待 agent category=%s 超时: %+v", category, listMessages(t, baseURL, sessionID))
	return nil
}

func TestM14CategoryFromMockMarker(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, category := range []string{"requirement", "clarification", "progress", "consultation"} {
		if status, body := postChat(t, ts.URL, "mock:category="+category+" 请回复"); status != http.StatusAccepted {
			t.Fatalf("chat %s = %d %s", category, status, body)
		}
		message := waitAgentCategory(t, ts.URL, "main", category)
		text, _ := message["text"].(string)
		if strings.Contains(text, "@@CATEGORY") {
			t.Fatalf("分类标记未剥离: %s", text)
		}
	}
	messages := listMessages(t, ts.URL, "main")
	for _, message := range messages {
		if message["role"] == "user" {
			if category, _ := message["category"].(string); category != "" {
				t.Fatalf("user 消息不应有分类: %+v", message)
			}
		}
	}
}

func createSession(t *testing.T, baseURL, parentID, title string) string {
	t.Helper()
	status, body := postJSON(t, baseURL+"/api/sessions", map[string]any{"parentId": parentID, "title": title})
	if status != http.StatusCreated {
		t.Fatalf("create session = %d %s", status, body)
	}
	var payload struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.Session.ID == "" {
		t.Fatalf("session JSON: %s", body)
	}
	return payload.Session.ID
}

func TestM14SessionPathMultiLevel(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	root := createSession(t, ts.URL, "", "根会话")
	child := createSession(t, ts.URL, root, "子会话")
	grand := createSession(t, ts.URL, child, "孙会话")
	if status := postChatSession(t, ts.URL, grand, "你好"); status != http.StatusAccepted {
		t.Fatalf("chat grand = %d", status)
	}
	waitForAgentDone(t, ts.URL, grand)
	messages := listMessages(t, ts.URL, grand)
	if len(messages) == 0 {
		t.Fatal("孙会话无消息")
	}
	for _, message := range messages {
		path, ok := message["sessionPath"].([]any)
		if !ok || len(path) < 3 {
			t.Fatalf("sessionPath 层级错误: %+v", message)
		}
		ids := make([]string, 0, len(path))
		titles := make([]string, 0, len(path))
		for _, item := range path {
			entry, _ := item.(map[string]any)
			ids = append(ids, entry["id"].(string))
			titles = append(titles, entry["title"].(string))
		}
		if ids[len(ids)-3] != root || ids[len(ids)-2] != child || ids[len(ids)-1] != grand {
			t.Fatalf("sessionPath 顺序错误: %v", ids)
		}
		if titles[len(titles)-3] != "根会话" || titles[len(titles)-2] != "子会话" || titles[len(titles)-1] != "孙会话" {
			t.Fatalf("sessionPath 标题错误: %v", titles)
		}
	}
}

func TestM14LegacyOverviewStringsBecomeArrays(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO session_overviews(
			session_id, goal, constraints, current, completed, pending, notes, timeline, version, updated_at)
			VALUES ('main', '旧目标。', '旧约束。', '旧现状。', '完成A；完成B', '待办C；待办D',
			'备注。', '先做A；再做B；现在做C', 1, ?)`, now)
		return err
	}); err != nil {
		t.Fatalf("写旧缓存: %v", err)
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/overview")
	if status != http.StatusOK {
		t.Fatalf("overview = %d %s", status, body)
	}
	var payload struct {
		Overview struct {
			Completed []string `json:"completed"`
			Pending   []string `json:"pending"`
			Timeline  []struct {
				At   int64  `json:"at"`
				Text string `json:"text"`
			} `json:"timeline"`
		} `json:"overview"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("overview JSON: %s", body)
	}
	if len(payload.Overview.Completed) != 2 || len(payload.Overview.Pending) != 2 ||
		len(payload.Overview.Timeline) != 3 {
		t.Fatalf("旧字符串未切分为数组: %+v", payload.Overview)
	}
	for _, item := range payload.Overview.Timeline {
		if item.At != now || strings.TrimSpace(item.Text) == "" {
			t.Fatalf("旧 timeline 缺 at/text: %+v", item)
		}
	}
}

func TestM14SessionPathCycleGuard(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	root := createSession(t, ts.URL, "", "环形根")
	child := createSession(t, ts.URL, root, "环形子")
	// 直接制造 parent 环；sessionPath 必须防环且限深。
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE sessions SET parent_id = ? WHERE id = ?`, child, root)
		return err
	}); err != nil {
		t.Skipf("无法制造环: %v", err)
	}
	if status := postChatSession(t, ts.URL, child, "你好"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, child)
	messages := listMessages(t, ts.URL, child)
	if len(messages) == 0 {
		t.Fatal("无消息")
	}
	path, _ := messages[0]["sessionPath"].([]any)
	if len(path) > 16 || len(path) == 0 {
		t.Fatalf("防环 sessionPath 长度 = %d", len(path))
	}
}
