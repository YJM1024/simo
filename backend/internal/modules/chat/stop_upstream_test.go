package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"simo/internal/core/eventlog"
	"simo/internal/platform/llm"
	"simo/internal/platform/sqlite"
)

// 本文件补 AC-CONV-005-01/02 的可复现证据：用本机 httptest SSE 假上游
// （每 50ms 一帧、共 100 帧）走 simo 真实的 chat 流式链路，验证
//  1. 带 messageId 的 correct 帧会让上游 HTTP 请求的 context 取消；
//  2. reply.retracted 之后 WS 上不再出现 reply.delta / message.delta；
//  3. 会话落回 idle（status 事件 + active 清空 + 消息 status）。
//
// 负路径：不存在的 messageId 不得取消任何流，原流继续到 reply.done。
const (
	stopUpstreamDeltaCount = 100
	stopUpstreamDeltaEvery = 50 * time.Millisecond
)

// fakeStopUpstream 是按固定节奏吐 delta 的本机 SSE 上游。
type fakeStopUpstream struct {
	url                  string
	srv                  *httptest.Server
	sseRequests          atomic.Int32
	contentSent          atomic.Int32
	canceledAt           atomic.Int32
	canceledDuringStream atomic.Bool
	canceled             chan struct{}
	cancelOnce           sync.Once
}

func newFakeStopUpstream(t *testing.T) *fakeStopUpstream {
	t.Helper()
	f := &fakeStopUpstream{canceled: make(chan struct{})}
	f.canceledAt.Store(-1)
	f.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		f.sseRequests.Add(1)
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
				"model": "fake-stop-upstream",
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

		// 首帧是分类标记行，让 streamModel 结束首行缓冲；不计入 100 个正文 delta。
		if !writeDelta("@@CATEGORY: consultation\n\n") {
			return
		}
		ticker := time.NewTicker(stopUpstreamDeltaEvery)
		defer ticker.Stop()
		for i := 1; i <= stopUpstreamDeltaCount; i++ {
			select {
			case <-r.Context().Done():
				// 真实 HTTP 请求的 context 关闭：停止传到上游的直接证据。
				f.canceledDuringStream.Store(true)
				f.canceledAt.Store(f.contentSent.Load())
				f.cancelOnce.Do(func() { close(f.canceled) })
				return
			case <-ticker.C:
				if !writeDelta(fmt.Sprintf("块%03d；", i)) {
					return
				}
				f.contentSent.Add(1)
			}
		}
		if _, err := fmt.Fprint(w, "data: [DONE]\n\n"); err != nil {
			return
		}
		flusher.Flush()
	}))
	f.url = f.srv.URL
	t.Cleanup(f.srv.Close)
	return f
}

type stopUpstreamFrame struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
	ID   int64           `json:"id"`
}

type stopUpstreamRecorder struct {
	mu     sync.Mutex
	frames []stopUpstreamFrame
}

func (r *stopUpstreamRecorder) append(f stopUpstreamFrame) {
	r.mu.Lock()
	r.frames = append(r.frames, f)
	r.mu.Unlock()
}

func (r *stopUpstreamRecorder) snapshot() []stopUpstreamFrame {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]stopUpstreamFrame, len(r.frames))
	copy(out, r.frames)
	return out
}

func (r *stopUpstreamRecorder) waitFor(t *testing.T, timeout time.Duration, match func(stopUpstreamFrame) bool) (stopUpstreamFrame, int) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		r.mu.Lock()
		for i, f := range r.frames {
			if match(f) {
				r.mu.Unlock()
				return f, i
			}
		}
		r.mu.Unlock()
		if time.Now().After(deadline) {
			t.Fatalf("等待 WS 帧超时（%.1fs）", timeout.Seconds())
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func (r *stopUpstreamRecorder) has(match func(stopUpstreamFrame) bool) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, f := range r.frames {
		if match(f) {
			return true
		}
	}
	return false
}

// replyDeltaCount 只统计 reply.delta 帧（message.delta 是 M1 兼容事件）。
func (r *stopUpstreamRecorder) replyDeltaCount(replyID string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, f := range r.frames {
		if f.Type == eventlog.TypeReplyDelta && stopUpstreamFrameID(f) == replyID {
			n++
		}
	}
	return n
}

// deltasAfter 统计索引 after 之后的 reply.delta 与 message.delta 帧。
func (r *stopUpstreamRecorder) deltasAfter(after int, replyID string) (replyDeltas, messageDeltas int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, f := range r.frames {
		if i <= after || stopUpstreamFrameID(f) != replyID {
			continue
		}
		switch f.Type {
		case eventlog.TypeReplyDelta:
			replyDeltas++
		case eventlog.TypeMessageDelta:
			messageDeltas++
		}
	}
	return replyDeltas, messageDeltas
}

func stopUpstreamFrameID(f stopUpstreamFrame) string {
	var payload struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(f.Data, &payload); err != nil {
		return ""
	}
	return payload.ID
}

func stopUpstreamStatusState(f stopUpstreamFrame) string {
	var payload struct {
		State string `json:"state"`
	}
	if err := json.Unmarshal(f.Data, &payload); err != nil {
		return ""
	}
	return payload.State
}

func stopUpstreamReadFrames(conn *websocket.Conn, ctx context.Context, rec *stopUpstreamRecorder) {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var f stopUpstreamFrame
		if err := json.Unmarshal(data, &f); err != nil {
			continue
		}
		rec.append(f)
	}
}

type stopUpstreamHarness struct {
	upstream *fakeStopUpstream
	mod      *Module
	db       *sqlite.DB
	events   *eventlog.Logger
	conn     *websocket.Conn
	wsCtx    context.Context
	rec      *stopUpstreamRecorder
}

// newStopUpstreamHarness 复用 stop_interrupt_test.go 的 newStopTestModule，
// 连一条带 since=0 的真实 WS（会回放连接前后的全部事件），便于按帧序断言。
func newStopUpstreamHarness(t *testing.T) *stopUpstreamHarness {
	t.Helper()
	upstream := newFakeStopUpstream(t)
	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: upstream.url,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("创建假上游 provider 失败: %v", err)
	}
	mod, db, events := newStopTestModule(t, upstream.url, provider)
	mux := http.NewServeMux()
	mod.Register(mux)
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)

	wsCtx, wsCancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(wsCancel)
	conn, resp, err := websocket.Dial(wsCtx, "ws"+strings.TrimPrefix(ts.URL, "http")+"/api/ws?sessionId=sess-stop&since=0", nil)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		t.Fatalf("WebSocket 连接失败: %v (http=%d)", err, status)
	}
	t.Cleanup(func() { _ = conn.Close(websocket.StatusNormalClosure, "test done") })

	if _, data, err := conn.Read(wsCtx); err != nil {
		t.Fatalf("读 hello 失败: %v", err)
	} else if !strings.Contains(string(data), `"hello"`) {
		t.Fatalf("首帧应为 hello，得到 %s", data)
	}
	rec := &stopUpstreamRecorder{}
	go stopUpstreamReadFrames(conn, wsCtx, rec)

	t.Cleanup(func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer stopCancel()
		_ = mod.Stop(stopCtx)
	})
	return &stopUpstreamHarness{
		upstream: upstream,
		mod:      mod,
		db:       db,
		events:   events,
		conn:     conn,
		wsCtx:    wsCtx,
		rec:      rec,
	}
}

func (h *stopUpstreamHarness) sendCorrect(t *testing.T, messageID string) {
	t.Helper()
	frame, err := json.Marshal(map[string]any{
		"type": "correct",
		"data": map[string]any{"sessionId": "sess-stop", "messageId": messageID},
	})
	if err != nil {
		t.Fatalf("构造 correct 帧失败: %v", err)
	}
	if err := h.conn.Write(h.wsCtx, websocket.MessageText, frame); err != nil {
		t.Fatalf("发送 correct 帧失败: %v", err)
	}
}

func waitForWireDeltas(t *testing.T, rec *stopUpstreamRecorder, replyID string, want int, timeout time.Duration) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		if got := rec.replyDeltaCount(replyID); got >= want {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("等待 WS 上 %d 个 reply.delta 超时（已收到 %d 个）", want, rec.replyDeltaCount(replyID))
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func waitForWireIdleAfter(t *testing.T, rec *stopUpstreamRecorder, after int, timeout time.Duration) int {
	t.Helper()
	_, idx := rec.waitFor(t, timeout, func(f stopUpstreamFrame) bool {
		return f.Type == eventlog.TypeStatus && stopUpstreamStatusState(f) == "idle"
	})
	if idx <= after {
		t.Fatalf("status(idle) 帧位置 %d 不在触发帧 %d 之后", idx, after)
	}
	return idx
}

func activeTurnCount(mod *Module) int {
	mod.mu.Lock()
	defer mod.mu.Unlock()
	return len(mod.active)
}

// TestStopUpstreamCanceledByMessageID 覆盖 AC-CONV-005-02 正向路径：
// 50ms×100 帧假上游，正文流出 2 帧后用该消息 messageId 发 correct，断言
//  1. 上游 r.Context().Done() 在停止后 5s 内关闭；
//  2. reply.retracted 之后 WS 不再出现 reply.delta / message.delta；
//  3. status(idle) 出现在 retracted 之后、active 清空、DB status=retracted。
func TestStopUpstreamCanceledByMessageID(t *testing.T) {
	ctx := context.Background()
	h := newStopUpstreamHarness(t)

	if _, err := h.mod.startTurn(ctx, "sess-stop", "验证停止会中断上游", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动 turn 失败: %v", err)
	}
	replyID := waitForReplyCreated(t, h.events, "sess-stop", 5*time.Second)
	waitForWireDeltas(t, h.rec, replyID, 2, 5*time.Second)
	wireBeforeStop := h.rec.replyDeltaCount(replyID)

	if h.upstream.canceledDuringStream.Load() {
		t.Fatal("停止帧尚未发出，上游 context 已取消")
	}

	stopSentAt := time.Now()
	h.sendCorrect(t, replyID)

	_, retractedIdx := h.rec.waitFor(t, 5*time.Second, func(f stopUpstreamFrame) bool {
		return f.Type == eventlog.TypeReplyRetracted && stopUpstreamFrameID(f) == replyID
	})

	var cancelAfter time.Duration
	select {
	case <-h.upstream.canceled:
		cancelAfter = time.Since(stopSentAt)
	case <-time.After(5 * time.Second):
		t.Fatal("correct 帧发出后 5s 内假上游未观测到请求 context 取消")
	}
	sentAtCancel := h.upstream.canceledAt.Load()
	if sentAtCancel < 0 || sentAtCancel >= stopUpstreamDeltaCount {
		t.Fatalf("上游取消时已吐 %d/%d 帧，无法证明提前中断", sentAtCancel, stopUpstreamDeltaCount)
	}
	t.Logf("断言1 PASS：上游 context 在停止帧后 %s 关闭，取消时已吐 %d/%d 帧",
		cancelAfter.Round(10*time.Millisecond), sentAtCancel, stopUpstreamDeltaCount)

	idleIdx := waitForWireIdleAfter(t, h.rec, retractedIdx, 5*time.Second)

	// 留出收尾窗口：停止后若还有 delta 落库，这段时间足以送达 WS。
	time.Sleep(300 * time.Millisecond)
	replyAfter, messageAfter := h.rec.deltasAfter(retractedIdx, replyID)
	if replyAfter != 0 || messageAfter != 0 {
		t.Fatalf("停止后仍收到 reply.delta=%d、message.delta=%d 帧", replyAfter, messageAfter)
	}
	t.Logf("断言2 PASS：reply.retracted（帧序 %d）之后 reply.delta=0、message.delta=0；停止前 WS 已有 %d 个 reply.delta",
		retractedIdx, wireBeforeStop)

	var status string
	if err := h.db.QueryRow(ctx, `SELECT status FROM messages WHERE id = ?`, replyID).Scan(&status); err != nil {
		t.Fatalf("读取停止后消息状态失败: %v", err)
	}
	if status != StatusRetracted {
		t.Fatalf("停止后消息 status=%q，期望 %q", status, StatusRetracted)
	}
	activeLeft := activeTurnCount(h.mod)
	if activeLeft != 0 {
		t.Fatalf("停止后仍有 %d 个 active turn", activeLeft)
	}
	if got := h.upstream.sseRequests.Load(); got != 1 {
		t.Fatalf("假上游收到 %d 次流式请求，期望 1 次", got)
	}
	t.Logf("断言3 PASS：status(idle) 帧序 %d（在 retracted 之后）、active=0、消息 status=%s",
		idleIdx, status)
}

// TestStopUpstreamUnknownMessageIDKeepsStream 覆盖负路径：
// 不存在的 messageId 不得取消任何流；原流继续产出并跑到 reply.done。
func TestStopUpstreamUnknownMessageIDKeepsStream(t *testing.T) {
	ctx := context.Background()
	h := newStopUpstreamHarness(t)

	if _, err := h.mod.startTurn(ctx, "sess-stop", "验证未知 messageId 不影响原流", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动 turn 失败: %v", err)
	}
	replyID := waitForReplyCreated(t, h.events, "sess-stop", 5*time.Second)
	waitForWireDeltas(t, h.rec, replyID, 2, 5*time.Second)
	deltaAtUnknownStop := h.rec.replyDeltaCount(replyID)
	sentAtUnknownStop := h.upstream.contentSent.Load()

	h.sendCorrect(t, "msg-not-streaming")

	// 300ms 收款窗口：按 50ms/帧应至少再产出数帧，且不得撤回/完成/取消上游。
	time.Sleep(300 * time.Millisecond)
	select {
	case <-h.upstream.canceled:
		t.Fatal("不存在的 messageId 不应取消上游请求 context")
	default:
	}
	if h.upstream.canceledDuringStream.Load() {
		t.Fatal("不存在的 messageId 不应让上游进入取消路径")
	}
	if h.rec.has(func(f stopUpstreamFrame) bool {
		return f.Type == eventlog.TypeReplyRetracted && stopUpstreamFrameID(f) == replyID
	}) {
		t.Fatal("不存在的 messageId 不应撤回目标流")
	}
	if h.rec.has(func(f stopUpstreamFrame) bool {
		return f.Type == eventlog.TypeReplyDone && stopUpstreamFrameID(f) == replyID
	}) {
		t.Fatal("发送停止帧后 300ms 内原流已结束，与 100 帧节奏不符")
	}
	deltaAfterUnknown := h.rec.replyDeltaCount(replyID)
	if deltaAfterUnknown <= deltaAtUnknownStop {
		t.Fatalf("不存在的 messageId 之后 delta 未继续：停止帧时 %d 个，300ms 后仍 %d 个",
			deltaAtUnknownStop, deltaAfterUnknown)
	}

	_, doneIdx := h.rec.waitFor(t, 20*time.Second, func(f stopUpstreamFrame) bool {
		return f.Type == eventlog.TypeReplyDone && stopUpstreamFrameID(f) == replyID
	})
	idleIdx := waitForWireIdleAfter(t, h.rec, doneIdx, 5*time.Second)

	gotDeltas := h.rec.replyDeltaCount(replyID)
	if gotDeltas != stopUpstreamDeltaCount {
		t.Fatalf("原流应完整下发 %d 个 reply.delta，实际 %d 个", stopUpstreamDeltaCount, gotDeltas)
	}
	if h.upstream.canceledDuringStream.Load() {
		t.Fatal("原流完成前上游 context 被取消，负路径失败")
	}
	if got := h.upstream.contentSent.Load(); got != stopUpstreamDeltaCount {
		t.Fatalf("上游共吐出 %d/%d 帧", got, stopUpstreamDeltaCount)
	}
	var status, text string
	if err := h.db.QueryRow(ctx, `SELECT status, text FROM messages WHERE id = ?`, replyID).Scan(&status, &text); err != nil {
		t.Fatalf("读取最终消息失败: %v", err)
	}
	if status != StatusDone {
		t.Fatalf("原流最终 status=%q，期望 %q", status, StatusDone)
	}
	if strings.TrimSpace(text) == "" {
		t.Fatal("原流最终正文为空")
	}
	if activeLeft := activeTurnCount(h.mod); activeLeft != 0 {
		t.Fatalf("原流完成后仍有 %d 个 active turn", activeLeft)
	}
	t.Logf("负路径 PASS：未知 messageId 未取消上游（发未知停止帧时上游已吐 %d 帧，全流未取消）；停止帧后 300ms 内 delta 从 %d 增至 %d；最终 reply.delta=%d、status=%s、idle 帧序 %d",
		sentAtUnknownStop, deltaAtUnknownStop, deltaAfterUnknown, gotDeltas, status, idleIdx)
}
