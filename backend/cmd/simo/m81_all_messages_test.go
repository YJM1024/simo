package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

type allMessagesPayload struct {
	OK         bool             `json:"ok"`
	SessionID  string           `json:"sessionId"`
	Scope      string           `json:"scope"`
	Archived   bool             `json:"archived"`
	Messages   []map[string]any `json:"messages"`
	Total      int              `json:"total"`
	Pagination bool             `json:"pagination"`
}

func getAllMessages(t *testing.T, baseURL, path, sessionID string) (int, allMessagesPayload) {
	t.Helper()
	status, body := httpGet(t, baseURL+path+sessionID+"/messages/all")
	var payload allMessagesPayload
	if len(body) > 0 {
		_ = json.Unmarshal(body, &payload)
	}
	return status, payload
}

func TestM81AllSessionMessages(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, payload := getAllMessages(t, ts.URL, "/api/sessions/", "main")
	if status != http.StatusOK || payload.Total != 0 || payload.Messages == nil || len(payload.Messages) != 0 || payload.Pagination {
		t.Fatalf("empty all messages = %d %+v", status, payload)
	}
	if status, _ := getAllMessages(t, ts.URL, "/api/sessions/", "not-exist"); status != http.StatusNotFound {
		t.Fatalf("unknown session all messages = %d, want 404", status)
	}
	if status, _ := httpGet(t, ts.URL+"/api/sessions/main/messages?scope=bad"); status != http.StatusBadRequest {
		t.Fatalf("invalid scope = %d, want 400", status)
	}
}

func TestM81AllSessionMessagesOrderAndShape(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	for _, text := range []string{"全量消息一", "全量消息二", "全量消息三"} {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
			t.Fatalf("chat %q = %d", text, status)
		}
		waitForReplyDone(t, ts.URL, "main")
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/messages?scope=all")
	if status != http.StatusOK {
		t.Fatalf("scope=all = %d %s", status, body)
	}
	var payload allMessagesPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("JSON: %v %s", err, body)
	}
	if payload.Total != len(payload.Messages) || payload.Total < 6 || payload.Pagination {
		t.Fatalf("all payload = %+v", payload)
	}
	if strings.Contains(string(body), `"hasMore"`) || strings.Contains(string(body), `"nextBefore"`) {
		t.Fatalf("全量接口不应伪造分页: %s", body)
	}
	var users []string
	var lastAt int64
	for _, message := range payload.Messages {
		at, _ := message["at"].(float64)
		if int64(at) < lastAt {
			t.Fatalf("消息未按时间正序: last=%d current=%v", lastAt, message["at"])
		}
		lastAt = int64(at)
		if message["role"] == "user" {
			users = append(users, message["text"].(string))
		}
		if _, ok := message["category"]; !ok {
			t.Fatalf("消息缺 category: %+v", message)
		}
	}
	if len(users) != 3 || users[0] != "全量消息一" || users[2] != "全量消息三" {
		t.Fatalf("用户消息顺序错误: %+v", users)
	}
	// 归档只读：仍允许读取全量历史。
	if status, body := postJSON(t, ts.URL+"/api/sessions/main/archive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("archive = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions/main/messages/all")
	_ = json.Unmarshal(body, &payload)
	if status != http.StatusOK || !payload.Archived || payload.Total < 6 {
		t.Fatalf("archived all messages = %d %+v", status, payload)
	}
}
