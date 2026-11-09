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

func postChatSession(t *testing.T, baseURL, sessionID, text string) int {
	t.Helper()
	body, _ := json.Marshal(map[string]any{"sessionId": sessionID, "text": text})
	resp, err := http.Post(baseURL+"/api/chat", "application/json", strings.NewReader(string(body)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}

func postSession(t *testing.T, baseURL, title, parentID string) string {
	t.Helper()
	status, body := postJSON(t, baseURL+"/api/sessions", map[string]any{"title": title, "parentId": parentID})
	if status != http.StatusCreated {
		t.Fatalf("create session = %d %s", status, body)
	}
	var payload struct {
		Session struct {
			ID string `json:"id"`
		} `json:"session"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	return payload.Session.ID
}

func waitTaskDone(t *testing.T, baseURL, sessionID string) {
	t.Helper()
	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		status, body := httpGet(t, baseURL+"/api/tasks?sessionId="+sessionID)
		if status == http.StatusOK {
			var payload struct {
				Tasks []struct {
					Status string `json:"status"`
				} `json:"tasks"`
			}
			if json.Unmarshal(body, &payload) == nil {
				for _, task := range payload.Tasks {
					if task.Status == "done" {
						return
					}
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatal("等待任务 done 超时")
}

func TestM6ArchiveReadonlyAndUnarchive(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	sessionID := postSession(t, ts.URL, "m6-archive", "")
	if status := postChatSession(t, ts.URL, sessionID, "归档前消息"); status != http.StatusAccepted {
		t.Fatalf("chat before archive = %d", status)
	}
	waitForAgentDone(t, ts.URL, sessionID)

	if status, body := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/archive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("archive = %d %s", status, body)
	}
	if status := postChatSession(t, ts.URL, sessionID, "归档后消息"); status != http.StatusConflict {
		t.Fatalf("chat archived = %d, want 409", status)
	}
	req, _ := http.NewRequest(http.MethodPatch, ts.URL+"/api/sessions/"+sessionID, strings.NewReader(`{"title":"x"}`))
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("rename archived = %d, want 409", resp.StatusCode)
	}
	if status, body := httpGet(t, ts.URL+"/api/messages?sessionId="+sessionID); status != http.StatusOK || !strings.Contains(string(body), "归档前消息") {
		t.Fatalf("read archived messages = %d %s", status, body)
	}
	if status, _ := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/unarchive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("unarchive = %d", status)
	}
	if status := postChatSession(t, ts.URL, sessionID, "恢复后消息"); status != http.StatusAccepted {
		t.Fatalf("chat after unarchive = %d", status)
	}
}

func TestM6ArchivedChatWSReturnsErrorNotReply(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	sessionID := postSession(t, ts.URL, "m6-archive-ws", "")
	if status, _ := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/archive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("archive = %d", status)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId="+sessionID)
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("首帧 = %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "chat", "data": map[string]any{"text": "归档后不该回复"}})
	seenError := false
	for i := 0; i < 20; i++ {
		frame := readWS(t, ctx, conn)
		if frame.Type == "reply.done" || frame.Type == "message.done" {
			t.Fatalf("归档会话不应回复: %+v", frame)
		}
		if frame.Type == "error" {
			seenError = true
			var payload struct {
				Code    string `json:"code"`
				Message string `json:"message"`
				Text    string `json:"text"`
			}
			_ = json.Unmarshal(frame.Data, &payload)
			if payload.Code != "session_archived" || !strings.Contains(payload.Message, "归档") ||
				payload.Text != "归档后不该回复" {
				t.Fatalf("归档 error 帧 = %+v", payload)
			}
			break
		}
	}
	if !seenError {
		t.Fatal("归档会话 WS 应返回 error 帧")
	}
}

func TestM6CanArchiveGateBlocksRunningTask(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	sessionID := postSession(t, ts.URL, "m6-gate", "")
	if status := postChatSession(t, ts.URL, sessionID, "帮我整理季度报告，多阶段慢慢做。"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(3500 * time.Millisecond)
	status, body := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/archive", map[string]any{})
	if status != http.StatusConflict || !strings.Contains(string(body), "blockers") {
		t.Fatalf("archive running = %d %s", status, body)
	}
	waitTaskDone(t, ts.URL, sessionID)
	status, body = postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/archive", map[string]any{})
	if status != http.StatusOK {
		t.Fatalf("archive after done = %d %s", status, body)
	}
}

func TestM6ArchiveReadonlyMemory(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	sessionID := postSession(t, ts.URL, "m6-amem", "")
	memo := "m6-amem-" + sessionID
	if status, _ := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/archive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("archive = %d", status)
	}
	if status := postChatSession(t, ts.URL, sessionID, "记住："+memo+" 归档中不该记住"); status != http.StatusConflict {
		t.Fatalf("archived memory chat = %d", status)
	}
	if status, body := httpGet(t, ts.URL+"/api/memory?q="+memo); status != http.StatusOK || strings.Contains(string(body), memo) {
		t.Fatalf("归档中写入记忆: %d %s", status, body)
	}
	if status, _ := postJSON(t, ts.URL+"/api/sessions/"+sessionID+"/unarchive", map[string]any{}); status != http.StatusOK {
		t.Fatalf("unarchive = %d", status)
	}
	if status := postChatSession(t, ts.URL, sessionID, "记住："+memo+" 恢复后可以记住"); status != http.StatusAccepted {
		t.Fatalf("active memory chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, sessionID)
	if status, body := httpGet(t, ts.URL+"/api/memory?q="+memo); status != http.StatusOK || !strings.Contains(string(body), memo) {
		t.Fatalf("恢复后未记住: %d %s", status, body)
	}
}

func TestM6SpecInvisibleAndDebug(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := httpGet(t, ts.URL+"/api/specs"); status != http.StatusNotFound {
		t.Fatalf("/api/specs = %d", status)
	}
	if status, _ := httpGet(t, ts.URL+"/api/specs/main"); status != http.StatusNotFound {
		t.Fatalf("/api/specs/main = %d", status)
	}
	// debug 默认关闭
	if status, _ := httpGet(t, ts.URL+"/api/debug/spec?sessionId=main"); status != http.StatusNotFound {
		t.Fatalf("debug spec default = %d", status)
	}
	_, debugTS := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := httpGet(t, debugTS.URL+"/api/debug/spec?sessionId=main")
	if status != http.StatusOK || !strings.Contains(string(body), `"spec"`) {
		t.Fatalf("debug spec = %d %s", status, body)
	}
	if strings.Contains(string(body), `"specId"`) {
		t.Fatalf("公开接口语义不应泄露 specId 字段: %s", body)
	}
}
