package main

// 会话级未读持久化契约测试（后端）：hasUnread 由服务端游标判定，POST read 推进游标，
// 写成功广播 session_read；刷新/重启后仍正确，多会话互不影响，错误会话 404。

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"simo/internal/platform/config"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

type p1UnreadNode struct {
	ID        string         `json:"id"`
	HasUnread *bool          `json:"hasUnread"`
	Children  []p1UnreadNode `json:"children"`
}

func p1FindUnreadNode(nodes []p1UnreadNode, id string) *p1UnreadNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
		if found := p1FindUnreadNode(nodes[i].Children, id); found != nil {
			return found
		}
	}
	return nil
}

// p1UnreadFromTree 读 /api/sessions/tree 里的 hasUnread；字段缺失直接失败（契约要求输出）。
func p1UnreadFromTree(t *testing.T, baseURL, id string) bool {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions/tree")
	if status != http.StatusOK {
		t.Fatalf("tree = %d %s", status, body)
	}
	var payload struct {
		Tree     []p1UnreadNode `json:"tree"`
		Sessions []p1UnreadNode `json:"sessions"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("tree JSON: %v (%s)", err, body)
	}
	node := p1FindUnreadNode(payload.Tree, id)
	if node == nil {
		node = p1FindUnreadNode(payload.Sessions, id)
	}
	if node == nil {
		t.Fatalf("树里缺少会话 %s: %s", id, body)
	}
	if node.HasUnread == nil {
		t.Fatalf("会话 %s 缺少 hasUnread 字段: %s", id, body)
	}
	return *node.HasUnread
}

// p1UnreadFromList 读 GET /api/sessions（含 q/pinned 过滤的列表路径）里的 hasUnread。
func p1UnreadFromList(t *testing.T, baseURL, id string) bool {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions")
	if status != http.StatusOK {
		t.Fatalf("list = %d %s", status, body)
	}
	var payload struct {
		Sessions []p1UnreadNode `json:"sessions"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("list JSON: %v (%s)", err, body)
	}
	node := p1FindUnreadNode(payload.Sessions, id)
	if node == nil || node.HasUnread == nil {
		t.Fatalf("列表缺少会话 %s 或 hasUnread: %s", id, body)
	}
	return *node.HasUnread
}

func p1MarkRead(t *testing.T, baseURL, sessionID string) map[string]any {
	t.Helper()
	status, body := p1RequestJSON(t, http.MethodPost, baseURL+"/api/sessions/"+sessionID+"/read", nil)
	if status != http.StatusOK {
		t.Fatalf("POST read %s = %d %s", sessionID, status, body)
	}
	return p1DecodeJSON(t, "read", body)
}

func TestP1ConvUnreadPersistsAndMarksRead(t *testing.T) {
	home := t.TempDir()
	t.Setenv("SIMO_HOME", home)
	t.Setenv("SIMO_ADDR", "")
	t.Setenv("SIMO_MODEL", "")
	t.Setenv("SIMO_LLM", "mock")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatal(err)
	}
	build := func() (*app, *httptest.Server) {
		a, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
		if err != nil {
			t.Fatalf("buildAppWithProvider: %v", err)
		}
		if err := a.registry.Start(context.Background()); err != nil {
			t.Fatalf("registry.Start: %v", err)
		}
		return a, httptest.NewServer(a.handler)
	}
	app1, ts1 := build()
	defer func() { ts1.Close(); _ = app1.Close() }()

	// 初始：主会话已读（无 agent 消息）。
	if p1UnreadFromTree(t, ts1.URL, "main") {
		t.Fatalf("初始 main 不应未读")
	}

	// ① 产生一条 agent 回复后未读；⑥ 主会话可读可标记（下一步）。
	if status, _ := postChat(t, ts1.URL, "未读持久化第一轮"); status != http.StatusAccepted {
		t.Fatalf("POST chat = %d", status)
	}
	waitForReplyDone(t, ts1.URL, "main")
	if !p1UnreadFromTree(t, ts1.URL, "main") {
		t.Fatalf("agent 回复后 main 应未读（tree）")
	}
	if !p1UnreadFromList(t, ts1.URL, "main") {
		t.Fatalf("agent 回复后 main 应未读（list）")
	}

	// ② POST read 后 false；重复调用仍 false 且信封字段齐全。
	payload := p1MarkRead(t, ts1.URL, "main")
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("read 响应 ok=%v", payload["ok"])
	}
	if sessionID, _ := payload["sessionId"].(string); sessionID != "main" {
		t.Fatalf("read 响应 sessionId=%v", payload["sessionId"])
	}
	if hasUnread, ok := payload["hasUnread"].(bool); !ok || hasUnread {
		t.Fatalf("read 响应 hasUnread=%v", payload["hasUnread"])
	}
	if p1UnreadFromTree(t, ts1.URL, "main") {
		t.Fatalf("标记已读后 main 仍未读（tree）")
	}
	if p1UnreadFromList(t, ts1.URL, "main") {
		t.Fatalf("标记已读后 main 仍未读（list）")
	}
	p1MarkRead(t, ts1.URL, "main")
	if p1UnreadFromTree(t, ts1.URL, "main") {
		t.Fatalf("重复标记已读改变了状态")
	}

	// ④ 另一个会话不受影响：读 main 之后新会话自己有未读，main 保持已读。
	status, created := postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "未读另一个会话", "draft": false})
	if status != http.StatusCreated {
		t.Fatalf("create session = %d %s", status, created)
	}
	var createdPayload struct {
		Session treeNode `json:"session"`
	}
	if err := json.Unmarshal(created, &createdPayload); err != nil {
		t.Fatalf("create JSON: %v (%s)", err, created)
	}
	childID := createdPayload.Session.ID
	if status := postChatSession(t, ts1.URL, childID, "子会话的消息"); status != http.StatusAccepted {
		t.Fatalf("POST chat child = %d", status)
	}
	waitForReplyDone(t, ts1.URL, childID)
	if !p1UnreadFromTree(t, ts1.URL, childID) {
		t.Fatalf("子会话 agent 回复后应未读")
	}
	if p1UnreadFromTree(t, ts1.URL, "main") {
		t.Fatalf("其它会话的未读不应波及已读的 main")
	}

	// ⑤ 广播：任一标签页标记已读后，其它 WS 连接收到 session_read（载荷带 sessionId）。
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts1.URL, "?sessionId=main")
	defer conn.CloseNow()
	if hello := p1ReadFrame(t, ctx, conn, "hello"); hello.Type != "hello" {
		t.Fatalf("首帧应为 hello，得到 %q", hello.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	time.Sleep(50 * time.Millisecond) // 等订阅 goroutine 起流，避免读到订阅前的空档
	p1MarkRead(t, ts1.URL, childID)
	sawBroadcast := false
	for i := 0; i < 20 && !sawBroadcast; i++ {
		frame := p1ReadFrame(t, ctx, conn, "session_read")
		if frame.Type != "session_read" {
			continue
		}
		data := p1FrameData(t, "session_read", frame)
		if sessionID, _ := data["sessionId"].(string); sessionID == childID {
			sawBroadcast = true
		}
	}
	if !sawBroadcast {
		t.Fatalf("未收到 session_read 广播（sessionId=%s）", childID)
	}
	if p1UnreadFromTree(t, ts1.URL, childID) {
		t.Fatalf("标记已读后子会话仍未读")
	}

	// ③ 重启进程（同 DB）：已读状态仍在。
	ts1.Close()
	_ = app1.Close()
	app2, ts2 := build()
	defer func() { ts2.Close(); _ = app2.Close() }()
	if p1UnreadFromTree(t, ts2.URL, "main") {
		t.Fatalf("重启后 main 应仍已读")
	}
	if p1UnreadFromTree(t, ts2.URL, childID) {
		t.Fatalf("重启后子会话应仍已读")
	}

	// ⑦ 不存在的会话 404。
	status, body := p1RequestJSON(t, http.MethodPost, ts2.URL+"/api/sessions/does-not-exist/read", nil)
	p1AssertErrorEnvelope(t, "read missing", status, body, http.StatusNotFound, "not_found")
}
