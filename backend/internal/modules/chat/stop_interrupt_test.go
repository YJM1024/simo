package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"simo/internal/core/eventlog"
	"simo/internal/core/store"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
)

// TestStopFrameCancelsUpstreamAndStopsDeltas 覆盖 AC-CONV-005-02 的“停止”异常路径：
// 通过真实 WS correct 帧（targetMessageId、text 均为空）停止流式回复，断言
//  1. 假上游（httptest SSE）观测到请求 context 被取消；
//  2. 停止完成后不再追加 reply.delta，且 reply.retracted 之后没有新的 delta；
//  3. turn 落回 idle，消息按后端 spec §5.2 撤回（status=retracted），停止前已产出的
//     delta 仍保留在事件日志里（正文清空是撤回语义，不是丢失证据）。
func TestStopFrameCancelsUpstreamAndStopsDeltas(t *testing.T) {
	ctx := context.Background()

	upstreamCanceled := make(chan struct{})
	var canceledOnce sync.Once
	var sseRequests atomic.Int32

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		sseRequests.Add(1)
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		writeDelta := func(content string) bool {
			data, err := json.Marshal(map[string]any{
				"model": "fake-upstream",
				"choices": []any{map[string]any{
					"delta": map[string]any{"content": content},
				}},
			})
			if err != nil {
				return false
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", data); err != nil {
				return false
			}
			flusher.Flush()
			return true
		}

		// 首帧带分类标记并换行，让 streamModel 立刻结束首行缓冲，后续 delta 直接下发。
		if !writeDelta("@@CATEGORY: consultation\n\n") {
			return
		}
		ticker := time.NewTicker(15 * time.Millisecond)
		defer ticker.Stop()
		for i := 1; ; i++ {
			select {
			case <-r.Context().Done():
				canceledOnce.Do(func() { close(upstreamCanceled) })
				return
			case <-ticker.C:
				if !writeDelta(fmt.Sprintf("第%03d段流式内容；", i)) {
					return
				}
			}
		}
	}))
	defer upstream.Close() // 注册最早，最后执行：此时假上游的 handler 已随 ctx 取消退出。

	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: upstream.URL,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("创建假上游 provider 失败: %v", err)
	}

	mod, db, events := newStopTestModule(t, upstream.URL, provider)
	// 先停模块（取消残留 turn），再关 WS 与模块服务器，最后关假上游。
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		_ = mod.Stop(stopCtx)
	}()

	mux := http.NewServeMux()
	mod.Register(mux)
	ts := httptest.NewServer(mux)
	wsCtx, wsCancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer wsCancel()

	conn, resp, err := websocket.Dial(wsCtx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/ws?sessionId=sess-stop", nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		ts.Close()
		t.Fatalf("WebSocket 连接失败: %v (http=%d)", err, status)
	}
	defer func() {
		_ = conn.Close(websocket.StatusNormalClosure, "test done")
		ts.Close()
	}()

	// hello 必须先到，保证 WS 读循环已就绪，后续 correct 帧不会被丢弃。
	if _, data, err := conn.Read(wsCtx); err != nil {
		t.Fatalf("读 hello 失败: %v", err)
	} else if !strings.Contains(string(data), `"hello"`) {
		t.Fatalf("首帧应为 hello，得到 %s", data)
	}

	if _, err := mod.startTurn(ctx, "sess-stop", "介绍一下流式输出的原理", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动 turn 失败: %v", err)
	}
	replyID := waitForReplyCreated(t, events, "sess-stop", 5*time.Second)
	waitForReplyDeltas(t, events, replyID, 2, 5*time.Second)

	var textBeforeStop string
	if err := db.QueryRow(ctx, `SELECT text FROM messages WHERE id = ?`, replyID).Scan(&textBeforeStop); err != nil {
		t.Fatalf("读取停止前回复失败: %v", err)
	}
	if strings.TrimSpace(textBeforeStop) == "" {
		t.Fatal("停止前应已产出部分内容")
	}
	deltasBeforeStop := replyDeltaText(t, events, replyID)
	if strings.TrimSpace(deltasBeforeStop) == "" {
		t.Fatal("停止前事件日志里应已记录 reply.delta")
	}
	select {
	case <-upstreamCanceled:
		t.Fatal("停止帧尚未发出，假上游 context 已取消")
	default:
	}

	stopFrame, err := json.Marshal(map[string]any{
		"type": "correct",
		"data": map[string]any{"sessionId": "sess-stop"},
	})
	if err != nil {
		t.Fatalf("构造 correct 帧失败: %v", err)
	}
	if err := conn.Write(wsCtx, websocket.MessageText, stopFrame); err != nil {
		t.Fatalf("发送 correct 帧失败: %v", err)
	}

	select {
	case <-upstreamCanceled:
		// 真实 HTTP 请求的 context 在停止后关闭：这是“停止传到上游”的直接证据。
	case <-time.After(5 * time.Second):
		t.Fatal("correct 帧发出后 5s 内假上游未观测到请求 context 取消")
	}

	retractedID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyRetracted, 5*time.Second)
	waitForIdleAfter(t, events, retractedID, 3*time.Second)

	all, err := events.Replay(ctx, 0)
	if err != nil {
		t.Fatalf("回放事件失败: %v", err)
	}
	var rebuilt strings.Builder
	var deltasAfterRetract int
	for _, ev := range all {
		if ev.ID > retractedID {
			switch ev.Type {
			case eventlog.TypeReplyDelta, eventlog.TypeMessageDelta:
				deltasAfterRetract++
			}
		}
		if ev.Type != eventlog.TypeReplyDelta {
			continue
		}
		var payload deltaPayload
		if err := json.Unmarshal(ev.Payload, &payload); err != nil || payload.ID != replyID {
			continue
		}
		rebuilt.WriteString(payload.Delta)
	}
	if deltasAfterRetract != 0 {
		t.Fatalf("停止完成后仍追加了 %d 个 delta 事件", deltasAfterRetract)
	}
	if !strings.HasPrefix(rebuilt.String(), deltasBeforeStop) {
		t.Fatalf("停止前已产出的内容未保留在事件日志：停止前 %q，停止后拼回 %q", deltasBeforeStop, rebuilt.String())
	}

	var status, textAfterStop string
	if err := db.QueryRow(ctx, `SELECT status, text FROM messages WHERE id = ?`, replyID).Scan(&status, &textAfterStop); err != nil {
		t.Fatalf("读取停止后回复失败: %v", err)
	}
	if status != StatusRetracted {
		t.Fatalf("停止后消息状态 = %q，期望 %q（后端 spec §5.2 撤回语义）", status, StatusRetracted)
	}
	if textAfterStop != "" {
		t.Fatalf("按撤回语义正文应清空，实际 %q", textAfterStop)
	}

	mod.mu.Lock()
	activeLeft := len(mod.active)
	mod.mu.Unlock()
	if activeLeft != 0 {
		t.Fatalf("停止后仍有 %d 个 active turn", activeLeft)
	}
	if got := sseRequests.Load(); got != 1 {
		t.Fatalf("假上游收到 %d 次流式请求，期望 1 次", got)
	}
}

// newStopTestModule 建一个只含 chat/eventlog 迁移的库（测试内自建 sessions 表），
// 返回接好真实 provider 的模块、库和事件日志。
func newStopTestModule(t *testing.T, upstreamURL string, provider llm.Provider) (*Module, *sqlite.DB, *eventlog.Logger) {
	t.Helper()
	if upstreamURL == "" {
		t.Fatal("upstreamURL 不能为空")
	}
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatalf("打开测试库失败: %v", err)
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		_ = db.Close()
		t.Fatalf("建 events 表失败: %v", err)
	}
	if err := db.Migrate(ctx, "chat", migrations()); err != nil {
		_ = db.Close()
		t.Fatalf("建 chat 表失败: %v", err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			parent_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL DEFAULT 0,
			archived INTEGER NOT NULL DEFAULT 0,
			pinned INTEGER NOT NULL DEFAULT 0,
			owner_agent_id TEXT NOT NULL DEFAULT ''
		)`)
		return err
	}); err != nil {
		_ = db.Close()
		t.Fatalf("建 sessions 表失败: %v", err)
	}
	insertTestSession(t, db, ctx, "sess-stop")
	events := eventlog.New(store.New(db))
	mod := New(store.New(db), events, provider, nil, nil, nil, platformlog.Discard(), Options{})
	t.Cleanup(func() { _ = db.Close() })
	return mod, db, events
}

func waitForReplyCreated(t *testing.T, events *eventlog.Logger, sessionID string, timeout time.Duration) string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		all, err := events.Replay(context.Background(), 0)
		if err != nil {
			t.Fatalf("回放事件失败: %v", err)
		}
		for _, ev := range all {
			if ev.Type != eventlog.TypeReplyCreated {
				continue
			}
			var payload struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil {
				continue
			}
			if payload.SessionID == sessionID && payload.ID != "" {
				return payload.ID
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待 %s 的 reply.created 超时", sessionID)
	return ""
}

func waitForReplyDeltas(t *testing.T, events *eventlog.Logger, replyID string, want int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		all, err := events.Replay(context.Background(), 0)
		if err != nil {
			t.Fatalf("回放事件失败: %v", err)
		}
		got := 0
		for _, ev := range all {
			if ev.Type != eventlog.TypeReplyDelta {
				continue
			}
			var payload deltaPayload
			if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID == replyID {
				got++
			}
		}
		if got >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待 %d 个 reply.delta 超时", want)
}

func waitForReplyEvent(t *testing.T, events *eventlog.Logger, replyID, typ string, timeout time.Duration) int64 {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		all, err := events.Replay(context.Background(), 0)
		if err != nil {
			t.Fatalf("回放事件失败: %v", err)
		}
		for _, ev := range all {
			if ev.Type != typ {
				continue
			}
			var payload struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID == replyID {
				return ev.ID
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待 %s 的 %s 事件超时", replyID, typ)
	return 0
}

func waitForIdleAfter(t *testing.T, events *eventlog.Logger, afterID int64, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		all, err := events.Replay(context.Background(), afterID)
		if err != nil {
			t.Fatalf("回放事件失败: %v", err)
		}
		for _, ev := range all {
			if ev.Type != eventlog.TypeStatus {
				continue
			}
			var payload statusPayload
			if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.State == "idle" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待 status(idle) 超时")
}

// replyDeltaText 把事件日志里该回复的 reply.delta 按顺序拼回，用于比对停止前后的已产出内容。
func replyDeltaText(t *testing.T, events *eventlog.Logger, replyID string) string {
	t.Helper()
	all, err := events.Replay(context.Background(), 0)
	if err != nil {
		t.Fatalf("回放事件失败: %v", err)
	}
	var sb strings.Builder
	for _, ev := range all {
		if ev.Type != eventlog.TypeReplyDelta {
			continue
		}
		var payload deltaPayload
		if err := json.Unmarshal(ev.Payload, &payload); err != nil || payload.ID != replyID {
			continue
		}
		sb.WriteString(payload.Delta)
	}
	return sb.String()
}

// TestStopFrameByMessageIDStopsOnlyTargetStream 覆盖多流并发时的按消息停止（AC-CONV-005 的并发口径）：
// 同一会话同时起两条流，先用不存在的 messageId 发 correct（不得扩大到任何一条），
// 再用第一条的 messageId 停止；断言
//  1. 第一条被 reply.retracted、撤回后零 delta，第二条继续产出 delta；
//  2. 第二条自然跑到 reply.done（status=done），两条流的上游请求互不干扰；
//  3. 停止后 active 清空、假上游共收到 2 次流式请求。
func TestStopFrameByMessageIDStopsOnlyTargetStream(t *testing.T) {
	ctx := context.Background()

	var sseRequests atomic.Int32
	firstCanceled := make(chan struct{})
	var cancelOnce sync.Once

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		// 第一条流由启动顺序保证先到达；第二条流固定条数后正常收尾，用于断言最终 done。
		index := sseRequests.Add(1)
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		flusher.Flush()

		writeDelta := func(content string) bool {
			data, err := json.Marshal(map[string]any{
				"model": "fake-upstream",
				"choices": []any{map[string]any{
					"delta": map[string]any{"content": content},
				}},
			})
			if err != nil {
				return false
			}
			if _, err := fmt.Fprintf(w, "data: %s\n\n", data); err != nil {
				return false
			}
			flusher.Flush()
			return true
		}

		if !writeDelta("@@CATEGORY: consultation\n\n") {
			return
		}
		if index == 1 {
			ticker := time.NewTicker(15 * time.Millisecond)
			defer ticker.Stop()
			for i := 1; ; i++ {
				select {
				case <-r.Context().Done():
					cancelOnce.Do(func() { close(firstCanceled) })
					return
				case <-ticker.C:
					if !writeDelta(fmt.Sprintf("第一条%03d；", i)) {
						return
					}
				}
			}
		}
		for i := 1; i <= 60; i++ {
			select {
			case <-r.Context().Done():
				return
			case <-time.After(30 * time.Millisecond):
				if !writeDelta(fmt.Sprintf("第二条%03d；", i)) {
					return
				}
			}
		}
		if _, err := fmt.Fprint(w, "data: [DONE]\n\n"); err != nil {
			return
		}
		flusher.Flush()
	}))
	defer upstream.Close()

	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: upstream.URL,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("创建假上游 provider 失败: %v", err)
	}

	mod, db, events := newStopTestModule(t, upstream.URL, provider)
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		_ = mod.Stop(stopCtx)
	}()

	mux := http.NewServeMux()
	mod.Register(mux)
	ts := httptest.NewServer(mux)
	wsCtx, wsCancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer wsCancel()

	conn, resp, err := websocket.Dial(wsCtx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/ws?sessionId=sess-stop", nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		ts.Close()
		t.Fatalf("WebSocket 连接失败: %v (http=%d)", err, status)
	}
	defer func() {
		_ = conn.Close(websocket.StatusNormalClosure, "test done")
		ts.Close()
	}()
	if _, data, err := conn.Read(wsCtx); err != nil {
		t.Fatalf("读 hello 失败: %v", err)
	} else if !strings.Contains(string(data), `"hello"`) {
		t.Fatalf("首帧应为 hello，得到 %s", data)
	}

	writeCorrect := func(data map[string]any) {
		t.Helper()
		frame, err := json.Marshal(map[string]any{"type": "correct", "data": data})
		if err != nil {
			t.Fatalf("构造 correct 帧失败: %v", err)
		}
		if err := conn.Write(wsCtx, websocket.MessageText, frame); err != nil {
			t.Fatalf("发送 correct 帧失败: %v", err)
		}
	}

	if _, err := mod.startTurn(ctx, "sess-stop", "介绍一下第一条并发流的原理", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动第一条 turn 失败: %v", err)
	}
	ids := waitForReplyIDs(t, events, "sess-stop", 1, 5*time.Second)
	reply1 := ids[0]
	waitForReplyDeltas(t, events, reply1, 2, 5*time.Second)

	if _, err := mod.startTurn(ctx, "sess-stop", "介绍一下第二条并发流的原理", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动第二条 turn 失败: %v", err)
	}
	ids = waitForReplyIDs(t, events, "sess-stop", 2, 5*time.Second)
	reply2 := ids[1]
	if reply2 == reply1 {
		t.Fatalf("两条流的 replyID 相同（%s），无法验证并发", reply1)
	}
	waitForReplyDeltas(t, events, reply2, 2, 5*time.Second)

	// 不存在的 messageId：不得把停止范围扩大到同会话里仍在流式的两条回复。
	writeCorrect(map[string]any{"sessionId": "sess-stop", "messageId": "msg-not-streaming"})
	time.Sleep(200 * time.Millisecond)
	for _, id := range []string{reply1, reply2} {
		if hasReplyEvent(t, events, id, eventlog.TypeReplyRetracted) {
			t.Fatalf("不存在的 messageId 不应停止 %s", id)
		}
	}

	// 只停第一条。
	deltas2BeforeStop := replyDeltaCount(t, events, reply2)
	writeCorrect(map[string]any{"sessionId": "sess-stop", "messageId": reply1})

	select {
	case <-firstCanceled:
	case <-time.After(5 * time.Second):
		t.Fatal("按 messageId 停止后 5s 内第一条流的上游 context 未取消")
	}

	retractedID := waitForReplyEvent(t, events, reply1, eventlog.TypeReplyRetracted, 5*time.Second)

	// 第一条：撤回之后零 delta，DB 状态为 retracted。
	all, err := events.Replay(ctx, 0)
	if err != nil {
		t.Fatalf("回放事件失败: %v", err)
	}
	deltasAfterRetract := 0
	for _, ev := range all {
		if ev.ID <= retractedID {
			continue
		}
		if ev.Type != eventlog.TypeReplyDelta && ev.Type != eventlog.TypeMessageDelta {
			continue
		}
		var payload deltaPayload
		if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID == reply1 {
			deltasAfterRetract++
		}
	}
	if deltasAfterRetract != 0 {
		t.Fatalf("第一条撤回后仍追加了 %d 个 delta 事件", deltasAfterRetract)
	}
	var status1 string
	if err := db.QueryRow(ctx, `SELECT status FROM messages WHERE id = ?`, reply1).Scan(&status1); err != nil {
		t.Fatalf("读取第一条状态失败: %v", err)
	}
	if status1 != StatusRetracted {
		t.Fatalf("第一条状态 = %q，期望 %q", status1, StatusRetracted)
	}

	// 第二条：停止第一条之后至少再产出 1 帧 delta，并且没有被打断。
	deadline := time.Now().Add(5 * time.Second)
	for replyDeltaCount(t, events, reply2) <= deltas2BeforeStop {
		if time.Now().After(deadline) {
			t.Fatalf("停止第一条后 5s 内第二条没有新增 delta（停止前 %d 帧）", deltas2BeforeStop)
		}
		time.Sleep(10 * time.Millisecond)
	}
	waitForReplyEvent(t, events, reply2, eventlog.TypeReplyDone, 10*time.Second)
	var status2, text2 string
	if err := db.QueryRow(ctx, `SELECT status, text FROM messages WHERE id = ?`, reply2).Scan(&status2, &text2); err != nil {
		t.Fatalf("读取第二条状态失败: %v", err)
	}
	if status2 != StatusDone {
		t.Fatalf("第二条最终状态 = %q，期望 %q", status2, StatusDone)
	}
	if strings.TrimSpace(text2) == "" {
		t.Fatal("第二条最终正文不应为空")
	}

	activeEmpty := func() bool {
		mod.mu.Lock()
		defer mod.mu.Unlock()
		return len(mod.active) == 0
	}
	activeDeadline := time.Now().Add(5 * time.Second)
	for !activeEmpty() {
		if time.Now().After(activeDeadline) {
			t.Fatal("第二条完成后仍有 active turn 未清理")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if got := sseRequests.Load(); got != 2 {
		t.Fatalf("假上游收到 %d 次流式请求，期望 2 次", got)
	}
}

// waitForReplyIDs 返回该会话按创建顺序出现的 reply.created ID，至少 want 个。
func waitForReplyIDs(t *testing.T, events *eventlog.Logger, sessionID string, want int, timeout time.Duration) []string {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		all, err := events.Replay(context.Background(), 0)
		if err != nil {
			t.Fatalf("回放事件失败: %v", err)
		}
		ids := make([]string, 0, want)
		for _, ev := range all {
			if ev.Type != eventlog.TypeReplyCreated {
				continue
			}
			var payload struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil {
				continue
			}
			if payload.SessionID == sessionID && payload.ID != "" {
				ids = append(ids, payload.ID)
			}
		}
		if len(ids) >= want {
			return ids
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("等待 %s 的 %d 个 reply.created 超时", sessionID, want)
	return nil
}

func hasReplyEvent(t *testing.T, events *eventlog.Logger, replyID, typ string) bool {
	t.Helper()
	all, err := events.Replay(context.Background(), 0)
	if err != nil {
		t.Fatalf("回放事件失败: %v", err)
	}
	for _, ev := range all {
		if ev.Type != typ {
			continue
		}
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID == replyID {
			return true
		}
	}
	return false
}

func replyDeltaCount(t *testing.T, events *eventlog.Logger, replyID string) int {
	t.Helper()
	all, err := events.Replay(context.Background(), 0)
	if err != nil {
		t.Fatalf("回放事件失败: %v", err)
	}
	count := 0
	for _, ev := range all {
		if ev.Type != eventlog.TypeReplyDelta {
			continue
		}
		var payload deltaPayload
		if err := json.Unmarshal(ev.Payload, &payload); err == nil && payload.ID == replyID {
			count++
		}
	}
	return count
}
