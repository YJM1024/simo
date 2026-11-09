package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"

	"simo/internal/platform/config"
	platformlog "simo/internal/platform/log"
)

type wsFrame struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
	ID   int64           `json:"id"`
}

func newTestApp(t *testing.T, mutate func(*config.Config)) (*app, *httptest.Server) {
	t.Helper()
	t.Setenv("SIMO_HOME", t.TempDir())
	t.Setenv("SIMO_LLM", "mock")
	t.Setenv("SIMO_ADDR", "")
	t.Setenv("SIMO_MODEL", "")
	t.Setenv("SIMO_MODULES", "")
	t.Setenv("SIMO_DISABLE_MODULES", "")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatalf("config.Parse: %v", err)
	}
	if mutate != nil {
		mutate(&cfg)
	}
	a, err := buildApp(context.Background(), cfg, platformlog.Discard())
	if err != nil {
		t.Fatalf("buildApp: %v", err)
	}
	if err := a.registry.Start(context.Background()); err != nil {
		t.Fatalf("registry.Start: %v", err)
	}
	ts := httptest.NewServer(a.handler)
	t.Cleanup(func() {
		ts.Close()
		_ = a.Stop(context.Background())
		_ = a.Close()
	})
	return a, ts
}

func httpGet(t *testing.T, url string) (int, []byte) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("读取响应失败: %v", err)
	}
	return resp.StatusCode, body
}

func postChat(t *testing.T, url, text string) (int, map[string]any) {
	t.Helper()
	resp, err := http.Post(url+"/api/chat", "application/json", strings.NewReader(`{"text":`+mustJSON(t, text)+`}`))
	if err != nil {
		t.Fatalf("POST /api/chat: %v", err)
	}
	defer resp.Body.Close()
	var body map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&body)
	return resp.StatusCode, body
}

func mustJSON(t *testing.T, value any) string {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	return string(data)
}

func listMessages(t *testing.T, baseURL, sessionID string) []map[string]any {
	t.Helper()
	url := baseURL + "/api/messages"
	if sessionID != "" {
		url += "?sessionId=" + sessionID
	}
	status, body := httpGet(t, url)
	if status != http.StatusOK {
		t.Fatalf("GET %s = %d, body=%s", url, status, body)
	}
	var payload struct {
		Messages []map[string]any `json:"messages"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode messages: %v body=%s", err, body)
	}
	return payload.Messages
}

func waitForReplyDone(t *testing.T, baseURL, sessionID string) []map[string]any {
	t.Helper()
	deadline := time.Now().Add(8 * time.Second)
	var last []map[string]any
	for time.Now().Before(deadline) {
		last = listMessages(t, baseURL, sessionID)
		for _, msg := range last {
			if msg["role"] == "agent" && msg["status"] == "done" {
				return last
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("等待 agent 完成超时；最后消息=%v", last)
	return nil
}

func TestHealthAndSessions(t *testing.T) {
	_, ts := newTestApp(t, nil)

	status, body := httpGet(t, ts.URL+"/api/health")
	if status != http.StatusOK {
		t.Fatalf("health status = %d", status)
	}
	var health struct {
		OK   bool  `json:"ok"`
		Time int64 `json:"time"`
	}
	if err := json.Unmarshal(body, &health); err != nil || !health.OK || health.Time == 0 {
		t.Fatalf("health 响应不符: %s", body)
	}

	status, body = httpGet(t, ts.URL+"/api/sessions")
	if status != http.StatusOK {
		t.Fatalf("sessions status = %d", status)
	}
	var payload struct {
		Sessions []map[string]any `json:"sessions"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("decode sessions: %v", err)
	}
	if len(payload.Sessions) < 1 || payload.Sessions[0]["id"] != "main" {
		t.Fatalf("sessions 应有默认 main: %s", body)
	}
}

func TestAPINotFoundIsJSON(t *testing.T) {
	_, ts := newTestApp(t, nil)
	status, body := httpGet(t, ts.URL+"/api/definitely-not-exists")
	if status != http.StatusNotFound {
		t.Fatalf("未命中 /api/* status = %d, want 404; body=%s", status, body)
	}
	if strings.Contains(strings.ToLower(string(body)), "<html") {
		t.Fatalf("/api/* 不应落入 SPA fallback: %s", body)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil || payload["ok"] != false {
		t.Fatalf("错误响应应为 JSON {ok:false}: %s", body)
	}
}

func TestChatPersistsAndFiltersBySession(t *testing.T) {
	_, ts := newTestApp(t, nil)
	status, body := postChat(t, ts.URL, "hello persistence")
	if status != http.StatusAccepted {
		t.Fatalf("POST /api/chat status = %d, body=%v", status, body)
	}
	if body["messageId"] == nil || body["messageId"] == "" {
		t.Fatalf("POST /api/chat 必须返回 messageId: %v", body)
	}

	messages := waitForReplyDone(t, ts.URL, "main")
	foundUser := false
	foundAgent := false
	for _, msg := range messages {
		if msg["role"] == "user" && msg["text"] == "hello persistence" {
			foundUser = true
		}
		if msg["role"] == "agent" && msg["status"] == "done" {
			foundAgent = true
		}
	}
	if !foundUser || !foundAgent {
		t.Fatalf("消息未持久化: %v", messages)
	}

	// 缺省 sessionId 应等价 main。
	if got := listMessages(t, ts.URL, ""); len(got) != len(messages) {
		t.Fatalf("缺省 sessionId 返回 %d 条，main 有 %d 条", len(got), len(messages))
	}
	// 不存在的 sessionId 必须返回空列表，不能返回全量。
	if got := listMessages(t, ts.URL, "evals-no-such-session"); len(got) != 0 {
		t.Fatalf("不存在的 sessionId 返回了 %d 条消息（未过滤）", len(got))
	}
}

func dialWS(t *testing.T, ctx context.Context, baseURL, query string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(baseURL, "http") + "/api/ws" + query
	conn, resp, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("WebSocket 连接失败: %v (http=%d)", err, status)
	}
	t.Cleanup(func() { _ = conn.Close(websocket.StatusNormalClosure, "test done") })
	return conn
}

func sendWS(t *testing.T, ctx context.Context, conn *websocket.Conn, value any) {
	t.Helper()
	if err := conn.Write(ctx, websocket.MessageText, []byte(mustJSON(t, value))); err != nil {
		t.Fatalf("WS 写失败: %v", err)
	}
}

func readWS(t *testing.T, ctx context.Context, conn *websocket.Conn) wsFrame {
	t.Helper()
	_, data, err := conn.Read(ctx)
	if err != nil {
		t.Fatalf("WS 读失败: %v", err)
	}
	var frame wsFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		t.Fatalf("WS 帧不是 JSON: %v (%s)", err, data)
	}
	return frame
}

func TestWebSocketEventOrder(t *testing.T) {
	_, ts := newTestApp(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	hello := readWS(t, ctx, conn)
	if hello.Type != "hello" {
		t.Fatalf("首帧应为 hello，得到 %q", hello.Type)
	}

	sendWS(t, ctx, conn, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": "ws order"},
	})

	var types []string
	var sawDelta bool
	for {
		frame := readWS(t, ctx, conn)
		types = append(types, frame.Type)
		if frame.Type == "message.delta" {
			var delta struct {
				ID    string `json:"id"`
				Delta string `json:"delta"`
			}
			if err := json.Unmarshal(frame.Data, &delta); err == nil && delta.Delta != "" {
				sawDelta = true
			}
		}
		if frame.Type == "message.done" {
			break
		}
	}
	order := strings.Join(types, ">")
	if !strings.Contains(order, "message.created>") {
		t.Fatalf("事件顺序缺少 message.created: %s", order)
	}
	index := func(name string) int {
		for i, typ := range types {
			if typ == name {
				return i
			}
		}
		return -1
	}
	created, status, delta, done := index("message.created"), index("status"), index("message.delta"), index("message.done")
	if created < 0 || status < 0 || delta < 0 || done < 0 {
		t.Fatalf("事件不全: %s", order)
	}
	if !(created < status && status < delta && delta < done) {
		t.Fatalf("事件顺序应为 created<status<delta<done，实际 %s", order)
	}
	if !sawDelta {
		t.Fatalf("message.delta 的 delta 为空: %s", order)
	}
}

func TestWebSocketSinceContinuation(t *testing.T) {
	_, ts := newTestApp(t, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	conn1 := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if first := readWS(t, ctx, conn1); first.Type != "hello" {
		t.Fatalf("首帧应为 hello，得到 %q", first.Type)
	}
	sendWS(t, ctx, conn1, map[string]any{"type": "chat", "data": map[string]any{"text": "first"}})
	var lastID int64
	for {
		frame := readWS(t, ctx, conn1)
		if frame.ID > lastID {
			lastID = frame.ID
		}
		if frame.Type == "message.done" {
			break
		}
	}
	_ = conn1.Close(websocket.StatusNormalClosure, "bye")

	conn2 := dialWS(t, ctx, ts.URL, "?sessionId=main&since="+strconv.FormatInt(lastID, 10))
	if first := readWS(t, ctx, conn2); first.Type != "hello" {
		t.Fatalf("重连首帧应为 hello，得到 %q", first.Type)
	}
	sendWS(t, ctx, conn2, map[string]any{"type": "chat", "data": map[string]any{"text": "second"}})
	sawCreated := false
	for {
		frame := readWS(t, ctx, conn2)
		if frame.ID <= lastID {
			t.Fatalf("since 续接不应重发旧事件 id=%d（last=%d）", frame.ID, lastID)
		}
		if frame.Type == "message.created" {
			sawCreated = true
		}
		if frame.Type == "message.done" {
			break
		}
	}
	if !sawCreated {
		t.Fatal("续接后未收到新消息的 message.created")
	}
}

func TestRestartPersistence(t *testing.T) {
	home := t.TempDir()
	t.Setenv("SIMO_HOME", home)
	t.Setenv("SIMO_LLM", "mock")
	t.Setenv("SIMO_ADDR", "")
	t.Setenv("SIMO_MODEL", "")
	t.Setenv("SIMO_MODULES", "")
	t.Setenv("SIMO_DISABLE_MODULES", "")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatalf("config.Parse: %v", err)
	}

	app1, err := buildApp(context.Background(), cfg, platformlog.Discard())
	if err != nil {
		t.Fatalf("buildApp 1: %v", err)
	}
	if err := app1.registry.Start(context.Background()); err != nil {
		t.Fatalf("start 1: %v", err)
	}
	ts1 := httptest.NewServer(app1.handler)
	if status, _ := postChat(t, ts1.URL, "persist me"); status != http.StatusAccepted {
		ts1.Close()
		_ = app1.Close()
		t.Fatalf("POST chat status = %d", status)
	}
	waitForReplyDone(t, ts1.URL, "main")
	ts1.Close()
	if err := app1.Stop(context.Background()); err != nil {
		t.Fatalf("stop 1: %v", err)
	}
	if err := app1.Close(); err != nil {
		t.Fatalf("close 1: %v", err)
	}

	app2, err := buildApp(context.Background(), cfg, platformlog.Discard())
	if err != nil {
		t.Fatalf("buildApp 2: %v", err)
	}
	defer func() { _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatalf("start 2: %v", err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()

	messages := listMessages(t, ts2.URL, "main")
	foundUser, foundAgent := false, false
	for _, msg := range messages {
		if msg["text"] == "persist me" && msg["role"] == "user" {
			foundUser = true
		}
		if msg["role"] == "agent" && msg["status"] == "done" {
			foundAgent = true
		}
	}
	if !foundUser || !foundAgent {
		t.Fatalf("重启后消息丢失: %v", messages)
	}
}

func TestTasksModuleCanBeDisabled(t *testing.T) {
	_, enabled := newTestApp(t, nil)
	if status, _ := httpGet(t, enabled.URL+"/api/tasks"); status != http.StatusOK {
		t.Fatalf("tasks 启用时 /api/tasks = %d", status)
	}
	_, disabled := newTestApp(t, func(cfg *config.Config) { cfg.Modules["tasks"] = false })
	status, body := httpGet(t, disabled.URL+"/api/tasks")
	if status != http.StatusNotFound {
		t.Fatalf("tasks 禁用时 /api/tasks = %d, body=%s", status, body)
	}
}
