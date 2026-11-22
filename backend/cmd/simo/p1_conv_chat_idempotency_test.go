package main

// P1-CONV 发送幂等（clientMutationId）契约测试。
// 覆盖 AC-CONV-005-02 的服务端去重部分：同一 id 重复提交只落一条消息，
// 不同 id / 缺省 id 保持旧行为，结果跨重启保留。

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"simo/internal/platform/config"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

func postChatMutation(t *testing.T, baseURL, sessionID, text, mutationID string) (int, map[string]any) {
	t.Helper()
	body := map[string]any{"sessionId": sessionID, "text": text}
	if mutationID != "" {
		body["clientMutationId"] = mutationID
	}
	status, raw := postJSON(t, baseURL+"/api/chat", body)
	var payload map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &payload)
	}
	return status, payload
}

func chatMessageID(t *testing.T, label string, payload map[string]any) string {
	t.Helper()
	id, _ := payload["messageId"].(string)
	if strings.TrimSpace(id) == "" {
		t.Fatalf("%s: 缺少 messageId: %v", label, payload)
	}
	return id
}

func countUserMessagesWithText(t *testing.T, baseURL, sessionID, text string) int {
	t.Helper()
	count := 0
	for _, message := range listMessages(t, baseURL, sessionID) {
		if message["role"] == "user" && message["text"] == text {
			count++
		}
	}
	return count
}

// 同一 clientMutationId 重试：第二次返回首条的 messageId，不追加消息。
func TestP1ConvChatClientMutationIdDedupesRetry(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	const mutationID = "tab-dedupe:1700000000000"
	const text = "断线重试只落一次"

	status, first := postChatMutation(t, ts.URL, "main", text, mutationID)
	if status != http.StatusAccepted {
		t.Fatalf("first send: status = %d, body=%v", status, first)
	}
	firstID := chatMessageID(t, "first send", first)
	if _, ok := first["idempotent"]; ok {
		t.Fatalf("首次提交不应标记 idempotent: %v", first)
	}

	status, second := postChatMutation(t, ts.URL, "main", text, mutationID)
	if status != http.StatusAccepted {
		t.Fatalf("retry send: status = %d, body=%v", status, second)
	}
	if got := chatMessageID(t, "retry send", second); got != firstID {
		t.Fatalf("重试应返回首条 messageId %q，得到 %q", firstID, got)
	}
	if flag, ok := second["idempotent"].(bool); !ok || !flag {
		t.Fatalf("重试响应应带 idempotent:true: %v", second)
	}

	waitForReplyDone(t, ts.URL, "main")
	if n := countUserMessagesWithText(t, ts.URL, "main", text); n != 1 {
		t.Fatalf("同一 clientMutationId 应只落一条用户消息，得到 %d", n)
	}
	if n := len(listMessages(t, ts.URL, "main")); n != 2 {
		t.Fatalf("应只有 user+agent 两条消息，得到 %d", n)
	}
}

// 不同 clientMutationId 是两次独立提交。
func TestP1ConvChatClientMutationIdDistinctCreatesTwo(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	const text = "两次不同请求"

	status, first := postChatMutation(t, ts.URL, "main", text, "tab-distinct:a")
	if status != http.StatusAccepted {
		t.Fatalf("first send: status = %d, body=%v", status, first)
	}
	status, second := postChatMutation(t, ts.URL, "main", text, "tab-distinct:b")
	if status != http.StatusAccepted {
		t.Fatalf("second send: status = %d, body=%v", status, second)
	}
	if firstID, secondID := chatMessageID(t, "first", first), chatMessageID(t, "second", second); firstID == secondID {
		t.Fatalf("不同 clientMutationId 不应复用 messageId: %q", firstID)
	}
	if n := countUserMessagesWithText(t, ts.URL, "main", text); n != 2 {
		t.Fatalf("不同 clientMutationId 应产生两条消息，得到 %d", n)
	}
}

// 缺省 clientMutationId：完全保持旧行为（每次提交都落库，不做去重标记）。
func TestP1ConvChatClientMutationIdOptionalLegacyBehavior(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	const text = "缺省幂等键旧行为"

	status, first := postChatMutation(t, ts.URL, "main", text, "")
	if status != http.StatusAccepted {
		t.Fatalf("first send: status = %d, body=%v", status, first)
	}
	status, second := postChatMutation(t, ts.URL, "main", text, "")
	if status != http.StatusAccepted {
		t.Fatalf("second send: status = %d, body=%v", status, second)
	}
	if firstID, secondID := chatMessageID(t, "first", first), chatMessageID(t, "second", second); firstID == secondID {
		t.Fatalf("缺省 clientMutationId 不应去重，得到同一 messageId %q", firstID)
	}
	for _, payload := range []map[string]any{first, second} {
		if _, ok := payload["idempotent"]; ok {
			t.Fatalf("缺省 clientMutationId 的响应不应带 idempotent: %v", payload)
		}
	}
	if n := countUserMessagesWithText(t, ts.URL, "main", text); n != 2 {
		t.Fatalf("缺省 clientMutationId 应保持旧行为（两条消息），得到 %d", n)
	}
}

// 并发重试同一 id：唯一键 claim 保证只执行一次，所有请求返回同一 messageId。
func TestP1ConvChatClientMutationIdConcurrentRetries(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	const mutationID = "tab-race:1700000000001"
	const text = "并发重试只落一次"
	const attempts = 5
	body := mustJSON(t, map[string]any{"sessionId": "main", "text": text, "clientMutationId": mutationID})

	var wg sync.WaitGroup
	statuses := make([]int, attempts)
	ids := make([]string, attempts)
	errs := make([]error, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			resp, err := http.Post(ts.URL+"/api/chat", "application/json", strings.NewReader(body))
			if err != nil {
				errs[i] = err
				return
			}
			defer resp.Body.Close()
			statuses[i] = resp.StatusCode
			var payload map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
				errs[i] = err
				return
			}
			ids[i], _ = payload["messageId"].(string)
		}(i)
	}
	wg.Wait()

	for i := 0; i < attempts; i++ {
		if errs[i] != nil {
			t.Fatalf("attempt %d: %v", i, errs[i])
		}
		if statuses[i] != http.StatusAccepted {
			t.Fatalf("attempt %d: status = %d, want 202", i, statuses[i])
		}
		if ids[i] == "" || ids[i] != ids[0] {
			t.Fatalf("attempt %d: messageId = %q, want %q", i, ids[i], ids[0])
		}
	}
	waitForReplyDone(t, ts.URL, "main")
	if n := countUserMessagesWithText(t, ts.URL, "main", text); n != 1 {
		t.Fatalf("并发同一 clientMutationId 应只落一条用户消息，得到 %d", n)
	}
}

// WS chat 帧同样走幂等路径：重复帧不产生第二条消息。
func TestP1ConvChatClientMutationIdWebSocket(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main")
	if hello := readWS(t, ctx, conn); hello.Type != "hello" {
		t.Fatalf("首帧 = %q", hello.Type)
	}
	const mutationID = "tab-ws:1700000000002"
	const text = "WS 重试只落一次"
	frame := map[string]any{"type": "chat", "data": map[string]any{
		"sessionId": "main", "text": text, "clientMutationId": mutationID,
	}}
	sendWS(t, ctx, conn, frame)
	sendWS(t, ctx, conn, frame)
	// 非法帧作为顺序屏障：收到它的错误帧时，前面的 chat 帧都已处理完。
	sendWS(t, ctx, conn, map[string]any{"type": "not-a-frame", "data": map[string]any{}})
	for {
		got := readWS(t, ctx, conn)
		if got.Type != "error" {
			continue
		}
		var payload struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		_ = json.Unmarshal(got.Data, &payload)
		if strings.Contains(payload.Message, "未知帧类型") {
			break
		}
	}
	if n := countUserMessagesWithText(t, ts.URL, "main", text); n != 1 {
		t.Fatalf("WS 同一 clientMutationId 应只落一条用户消息，得到 %d", n)
	}
	waitForReplyDone(t, ts.URL, "main")
	if n := len(listMessages(t, ts.URL, "main")); n != 2 {
		t.Fatalf("WS 重试后应只有 user+agent 两条消息，得到 %d", n)
	}
}

// 首次提交仍在处理（占位行没有 messageId）时，重试不能并发再执行一遍：
// 等待上限后返回 409 mutation_in_progress，而不是产生第二条消息。
func TestP1ConvChatClientMutationIdInProgressConflict(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	const mutationID = "tab-inflight:1700000000004"
	now := time.Now().UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(),
			`INSERT INTO client_mutations(id, session_id, message_id, created_at, updated_at) VALUES (?, 'main', '', ?, ?)`,
			mutationID, now, now)
		return err
	}); err != nil {
		t.Fatal(err)
	}

	status, body := postJSON(t, ts.URL+"/api/chat", map[string]any{
		"sessionId": "main", "text": "占位进行中的重试", "clientMutationId": mutationID,
	})
	if status != http.StatusConflict {
		t.Fatalf("in-progress retry: status = %d, body=%s", status, body)
	}
	var envelope struct {
		OK   bool   `json:"ok"`
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("in-progress retry JSON: %v %s", err, body)
	}
	if envelope.OK || envelope.Code != "mutation_in_progress" {
		t.Fatalf("in-progress retry envelope = %+v (body=%s)", envelope, body)
	}
	if n := len(listMessages(t, ts.URL, "main")); n != 0 {
		t.Fatalf("进行中的重试不应落库任何消息，得到 %d 条", n)
	}
}

// 幂等记录落库：重启后同一 clientMutationId 仍只返回首条消息，不重复落库。
func TestP1ConvChatClientMutationIdPersistsAcrossRestart(t *testing.T) {
	home := t.TempDir()
	t.Setenv("SIMO_HOME", home)
	t.Setenv("SIMO_ADDR", "")
	t.Setenv("SIMO_MODEL", "")
	t.Setenv("SIMO_LLM", "mock")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatal(err)
	}

	app1, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	if err := app1.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts1 := httptest.NewServer(app1.handler)
	const mutationID = "tab-restart:1700000000003"
	const text = "重启后同一 mutation 不重复"
	status, first := postChatMutation(t, ts1.URL, "main", text, mutationID)
	if status != http.StatusAccepted {
		t.Fatalf("first send: status = %d, body=%v", status, first)
	}
	firstID := chatMessageID(t, "first send", first)
	waitForReplyDone(t, ts1.URL, "main")
	ts1.Close()
	_ = app1.Stop(context.Background())
	_ = app1.Close()

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()

	status, second := postChatMutation(t, ts2.URL, "main", text, mutationID)
	if status != http.StatusAccepted {
		t.Fatalf("retry after restart: status = %d, body=%v", status, second)
	}
	if got := chatMessageID(t, "retry after restart", second); got != firstID {
		t.Fatalf("重启后重试应返回首条 messageId %q，得到 %q", firstID, got)
	}
	if flag, ok := second["idempotent"].(bool); !ok || !flag {
		t.Fatalf("重启后重试响应应带 idempotent:true: %v", second)
	}
	waitForReplyDone(t, ts2.URL, "main")
	if n := countUserMessagesWithText(t, ts2.URL, "main", text); n != 1 {
		t.Fatalf("重启后同一 clientMutationId 应只落一条用户消息，得到 %d", n)
	}
}
