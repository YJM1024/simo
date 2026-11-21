package main

// P1-CONV WebSocket 契约测试。
// 覆盖 AC-CONV-005/SYNC-001：单轮 reply 生命周期事件顺序、delta 与落库正文一致、
// 多客户端同会话一致、subscribe/since 回放语义、帧级错误与连接保活。

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func p1ReadFrame(t *testing.T, ctx context.Context, conn *websocket.Conn, what string) wsFrame {
	t.Helper()
	readCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	_, data, err := conn.Read(readCtx)
	if err != nil {
		t.Fatalf("%s: WS 读失败: %v", what, err)
	}
	var frame wsFrame
	if err := json.Unmarshal(data, &frame); err != nil {
		t.Fatalf("%s: WS 帧不是 JSON: %v (%s)", what, err, data)
	}
	return frame
}

func p1FrameData(t *testing.T, what string, frame wsFrame) map[string]any {
	t.Helper()
	if len(frame.Data) == 0 {
		return map[string]any{}
	}
	var data map[string]any
	if err := json.Unmarshal(frame.Data, &data); err != nil {
		t.Fatalf("%s: 帧 %s 的 data 不是对象: %v (%s)", what, frame.Type, err, frame.Data)
	}
	return data
}

func p1FrameString(t *testing.T, what string, frame wsFrame, key string) string {
	t.Helper()
	value, _ := p1FrameData(t, what, frame)[key].(string)
	return value
}

func p1FrameState(t *testing.T, what string, frame wsFrame) string {
	t.Helper()
	return p1FrameString(t, what, frame, "state")
}

// p1CollectUntilIdle 读到 status:idle（turn 全部结束）为止；上限防止事件风暴挂死用例。
func p1CollectUntilIdle(t *testing.T, ctx context.Context, conn *websocket.Conn, what string, maxFrames int) []wsFrame {
	t.Helper()
	frames := make([]wsFrame, 0, 32)
	for i := 0; i < maxFrames; i++ {
		frame := p1ReadFrame(t, ctx, conn, what)
		frames = append(frames, frame)
		if frame.Type == "status" && p1FrameState(t, what, frame) == "idle" {
			return frames
		}
	}
	t.Fatalf("%s: %d 帧内未看到 status idle", what, maxFrames)
	return frames
}

// p1CollectTurnFrames 等待本轮用户消息的 message.created 出现后再收集到 status idle，
// 用来滤掉订阅建立瞬间可能残留的上一轮 status(idle) 帧。
func p1CollectTurnFrames(t *testing.T, ctx context.Context, conn *websocket.Conn, what, userText string, maxFrames int) []wsFrame {
	t.Helper()
	frames := make([]wsFrame, 0, 32)
	started := false
	for i := 0; i < maxFrames; i++ {
		frame := p1ReadFrame(t, ctx, conn, what)
		if !started {
			if frame.Type != "message.created" || p1FrameString(t, what, frame, "text") != userText {
				continue
			}
			started = true
		}
		frames = append(frames, frame)
		if frame.Type == "status" && p1FrameState(t, what, frame) == "idle" {
			return frames
		}
	}
	t.Fatalf("%s: %d 帧内未等到本轮 message.created 或 status idle", what, maxFrames)
	return frames
}

// p1WaitReplyDoneWithin 是本文件的慢环境等待版。
// CI（Windows runner）上单轮落库是"每条 delta 一次消息更新 + 两次事件追加 + 会话 spec 落盘"，
// 磁盘/Defender 争用下同一轮可以远超 waitForReplyDone 固定的 8s 预算；此时回复通常已完整落库、
// 只是状态未及时转为 done（实测失败日志里 agent 正文已完整但 status 仍是 streaming）。
// 这里不改变等待语义，只是给这个用例更长的上限并输出诊断，避免把慢环境误判成功能失败。
func p1WaitReplyDoneWithin(t *testing.T, baseURL, sessionID string, timeout time.Duration) []map[string]any {
	t.Helper()
	deadline := time.Now().Add(timeout)
	var last []map[string]any
	for time.Now().Before(deadline) {
		last = listMessages(t, baseURL, sessionID)
		for _, message := range last {
			if message["role"] == "agent" && message["status"] == "done" {
				return last
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("等待 agent 完成超时（上限 %s，会话 %s）；最后消息=%v", timeout, sessionID, last)
	return nil
}

// p1IndexOfType 返回首个指定类型的帧下标，没有则为 -1。
func p1IndexOfType(frames []wsFrame, frameType string) int {
	for index, frame := range frames {
		if frame.Type == frameType {
			return index
		}
	}
	return -1
}

// p1ReplyLifecycle 从一帧序列里提炼出本轮 reply 的关键锚点，便于断言相对顺序。
type p1ReplyLifecycle struct {
	UserCreated   int
	ReplyCreated  int
	AgentCreated  int
	Thinking      int
	FirstDelta    int
	LastDelta     int
	ReplyDone     int
	MessageDone   int
	Idle          int
	ReplyID       string
	DeltaText     string
	DeltaFrameIDs []int64
}

func p1AnalyzeReplyLifecycle(t *testing.T, what string, frames []wsFrame, userText string) p1ReplyLifecycle {
	t.Helper()
	lifecycle := p1ReplyLifecycle{
		UserCreated: -1, ReplyCreated: -1, AgentCreated: -1, Thinking: -1,
		FirstDelta: -1, LastDelta: -1, ReplyDone: -1, MessageDone: -1, Idle: -1,
	}
	var deltaBuilder strings.Builder
	for index, frame := range frames {
		switch frame.Type {
		case "message.created":
			data := p1FrameData(t, what, frame)
			role, _ := data["role"].(string)
			if role == "user" && lifecycle.UserCreated == -1 {
				if text, _ := data["text"].(string); text == userText {
					lifecycle.UserCreated = index
				}
			}
			if role == "agent" && lifecycle.AgentCreated == -1 && lifecycle.ReplyCreated >= 0 {
				lifecycle.AgentCreated = index
				id, _ := data["id"].(string)
				lifecycle.ReplyID = id
			}
		case "reply.created":
			if lifecycle.ReplyCreated == -1 {
				lifecycle.ReplyCreated = index
				id, _ := p1FrameData(t, what, frame)["id"].(string)
				lifecycle.ReplyID = id
			}
		case "status":
			if p1FrameState(t, what, frame) == "thinking" && lifecycle.Thinking == -1 {
				lifecycle.Thinking = index
			}
			if p1FrameState(t, what, frame) == "idle" {
				lifecycle.Idle = index
			}
		case "reply.delta":
			data := p1FrameData(t, what, frame)
			id, _ := data["id"].(string)
			delta, _ := data["delta"].(string)
			if delta == "" {
				t.Fatalf("%s: reply.delta 的 delta 为空: %s", what, frame.Data)
			}
			if lifecycle.ReplyID != "" && id != lifecycle.ReplyID {
				t.Fatalf("%s: reply.delta id = %q, want %q", what, id, lifecycle.ReplyID)
			}
			if lifecycle.FirstDelta == -1 {
				lifecycle.FirstDelta = index
			}
			lifecycle.LastDelta = index
			deltaBuilder.WriteString(delta)
			lifecycle.DeltaFrameIDs = append(lifecycle.DeltaFrameIDs, frame.ID)
		case "reply.done":
			if lifecycle.ReplyDone == -1 {
				lifecycle.ReplyDone = index
			}
			if status, _ := p1FrameData(t, what, frame)["status"].(string); status != "done" {
				t.Fatalf("%s: reply.done status = %q, want done", what, status)
			}
		case "message.done":
			if lifecycle.MessageDone == -1 {
				if status, _ := p1FrameData(t, what, frame)["status"].(string); status != "done" {
					t.Fatalf("%s: message.done status = %q, want done", what, status)
				}
				lifecycle.MessageDone = index
			}
		}
	}
	lifecycle.DeltaText = deltaBuilder.String()
	return lifecycle
}

func p1AssertFrameIDsMonotonic(t *testing.T, what string, frames []wsFrame) {
	t.Helper()
	seen := make(map[int64]bool, len(frames))
	last := int64(0)
	for _, frame := range frames {
		if frame.ID == 0 {
			continue
		}
		if seen[frame.ID] {
			t.Fatalf("%s: 事件 ID %d 重复出现", what, frame.ID)
		}
		seen[frame.ID] = true
		if frame.ID <= last {
			t.Fatalf("%s: 事件 ID 未严格递增: %d 之后出现 %d", what, last, frame.ID)
		}
		last = frame.ID
	}
}

// TestP1ConvWSReplyLifecycleOrderAndDeltas 覆盖 AC-CONV-005-01 / AC-SYNC-001-01：
// 用户消息→reply 占位→thinking→delta 流→done→idle 的事件顺序，且 delta 拼接等于落库正文。
func TestP1ConvWSReplyLifecycleOrderAndDeltas(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	hello := p1ReadFrame(t, ctx, conn, "hello")
	if hello.Type != "hello" {
		t.Fatalf("首帧应为 hello，得到 %q", hello.Type)
	}
	if _, ok := p1FrameData(t, "hello", hello)["at"]; !ok {
		t.Fatalf("hello 帧缺少 at: %s", hello.Data)
	}

	const userText = "WS 生命周期顺序消息"
	sendWS(t, ctx, conn, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": userText},
	})
	frames := p1CollectUntilIdle(t, ctx, conn, "lifecycle", 500)
	p1AssertFrameIDsMonotonic(t, "lifecycle", frames)

	lifecycle := p1AnalyzeReplyLifecycle(t, "lifecycle", frames, userText)
	if lifecycle.UserCreated < 0 || lifecycle.ReplyCreated < 0 || lifecycle.AgentCreated < 0 {
		t.Fatalf("缺少 message.created/reply.created 锚点: %+v", lifecycle)
	}
	if lifecycle.Thinking < 0 || lifecycle.FirstDelta < 0 || lifecycle.ReplyDone < 0 || lifecycle.MessageDone < 0 || lifecycle.Idle < 0 {
		t.Fatalf("缺少 thinking/delta/done/idle 锚点: %+v", lifecycle)
	}
	if !(lifecycle.UserCreated < lifecycle.ReplyCreated) {
		t.Fatalf("用户 message.created 应先于 reply.created: %+v", lifecycle)
	}
	if !(lifecycle.ReplyCreated < lifecycle.AgentCreated && lifecycle.AgentCreated < lifecycle.Thinking) {
		t.Fatalf("reply.created < agent message.created < status(thinking) 顺序错误: %+v", lifecycle)
	}
	if !(lifecycle.Thinking < lifecycle.FirstDelta && lifecycle.FirstDelta <= lifecycle.LastDelta) {
		t.Fatalf("delta 必须在 thinking 之后、至少一帧: %+v", lifecycle)
	}
	if !(lifecycle.LastDelta < lifecycle.ReplyDone && lifecycle.ReplyDone < lifecycle.MessageDone && lifecycle.MessageDone < lifecycle.Idle) {
		t.Fatalf("delta < reply.done < message.done < status(idle) 顺序错误: %+v", lifecycle)
	}
	if len(lifecycle.DeltaFrameIDs) == 0 {
		t.Fatalf("没有收到 reply.delta 帧")
	}

	// reply.created 的结构契约：前端据此建立流式占位。
	for index, frame := range frames {
		if frame.Type != "reply.created" {
			continue
		}
		data := p1FrameData(t, "reply.created", frame)
		if id, _ := data["id"].(string); id != lifecycle.ReplyID {
			t.Fatalf("reply.created id = %q, want %q", id, lifecycle.ReplyID)
		}
		if sessionID, _ := data["sessionId"].(string); sessionID != "main" {
			t.Fatalf("reply.created sessionId = %q, want main", sessionID)
		}
		if role, _ := data["role"].(string); role != "agent" {
			t.Fatalf("reply.created role = %q, want agent", role)
		}
		if status, _ := data["status"].(string); status != "streaming" {
			t.Fatalf("reply.created status = %q, want streaming", status)
		}
		if _, ok := data["sessionPath"].([]any); !ok {
			t.Fatalf("reply.created 缺少 sessionPath 数组: %s", frame.Data)
		}
		if _, ok := data["agentId"]; !ok {
			t.Fatalf("reply.created 缺少 agentId: %s", frame.Data)
		}
		if index <= lifecycle.UserCreated {
			t.Fatalf("reply.created 出现在用户消息之前")
		}
	}

	// 落库正文必须等于所有 reply.delta 的拼接（前端流式内容与最终消息一致）。
	persisted := p1MessageByID(listMessages(t, ts.URL, "main"), lifecycle.ReplyID)
	if persisted == nil {
		t.Fatalf("落库缺少 reply 消息 %s", lifecycle.ReplyID)
	}
	persistedText, _ := persisted["text"].(string)
	if persistedText != lifecycle.DeltaText {
		t.Fatalf("reply.delta 拼接与落库正文不一致:\n delta=%q\n db   =%q", lifecycle.DeltaText, persistedText)
	}
	if strings.Contains(persistedText, "@@CATEGORY") {
		t.Fatalf("落库正文包含分类标记: %q", persistedText)
	}
	if status, _ := persisted["status"].(string); status != "done" {
		t.Fatalf("落库 reply status = %q, want done", status)
	}
}

// TestP1ConvWSMultiClientSameSessionConsistency 覆盖 AC-SYNC-001-02 / AC-SYNC-002-01：
// 同一会话两个客户端收到的本 turn 事件序列一致、无重复、ID 递增，且任一客户端都能从
// 事件 data 判断归属会话（多标签本地过滤的依据）。
func TestP1ConvWSMultiClientSameSessionConsistency(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	connA := dialWS(t, ctx, ts.URL, "?sessionId=main")
	connB := dialWS(t, ctx, ts.URL, "?sessionId=main")
	for name, conn := range map[string]*websocket.Conn{"A": connA, "B": connB} {
		if hello := p1ReadFrame(t, ctx, conn, "hello "+name); hello.Type != "hello" {
			t.Fatalf("%s 首帧应为 hello，得到 %q", name, hello.Type)
		}
		sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	}

	runTurn := func(sender *websocket.Conn, text string) {
		sendWS(t, ctx, sender, map[string]any{
			"type": "chat",
			"data": map[string]any{"sessionId": "main", "text": text},
		})
		framesA := p1CollectUntilIdle(t, ctx, connA, "A turn "+text, 800)
		framesB := p1CollectUntilIdle(t, ctx, connB, "B turn "+text, 800)

		p1AssertFrameIDsMonotonic(t, "A turn", framesA)
		p1AssertFrameIDsMonotonic(t, "B turn", framesB)

		// 两个客户端必须是同一事件序列（type+id 一一对应）。
		if len(framesA) != len(framesB) {
			t.Fatalf("同会话两客户端帧数不同: A=%d B=%d", len(framesA), len(framesB))
		}
		for index := range framesA {
			if framesA[index].Type != framesB[index].Type || framesA[index].ID != framesB[index].ID {
				t.Fatalf("帧 %d 不一致: A=(%s,%d) B=(%s,%d)",
					index, framesA[index].Type, framesA[index].ID, framesB[index].Type, framesB[index].ID)
			}
		}
		lifecycle := p1AnalyzeReplyLifecycle(t, "A turn", framesA, text)
		if lifecycle.ReplyCreated < 0 || lifecycle.ReplyDone < 0 || lifecycle.MessageDone < 0 || lifecycle.Idle < 0 {
			t.Fatalf("turn %q 生命周期不完整: %+v", text, lifecycle)
		}
		// 事件 data 内必须带 sessionId，前端才能在全局事件流里做会话归属判断。
		// 说明：delta/done 帧的 payload 只有 id/status（增量事件靠 reply.created 的
		// sessionId 归属），因此只对 created 类事件断言 sessionId。
		for _, frame := range framesA {
			switch frame.Type {
			case "message.created", "reply.created":
				if sessionID := p1FrameString(t, "A turn", frame, "sessionId"); sessionID != "main" {
					t.Fatalf("帧 %s 的 sessionId = %q, want main: %s", frame.Type, sessionID, frame.Data)
				}
			}
		}
	}

	runTurn(connA, "多客户端 A 发的消息")
	runTurn(connB, "多客户端 B 发的消息")
}

// TestP1ConvWSSubscribeReplayAndSinceContinuation 覆盖 AC-SYNC-001-02：无 since 订阅不重放历史、
// since=0 回放历史、断线后用 since=lastID 续接不重发旧事件。
func TestP1ConvWSSubscribeReplayAndSinceContinuation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	// 历史轮 + 两轮实时/replay 的落库在慢 CI 上会放大，给整个用例更宽的墙钟预算。
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	// 先用 HTTP 制造一轮历史。
	const historyText = "历史轮次消息"
	if status, _ := postChat(t, ts.URL, historyText); status != http.StatusAccepted {
		t.Fatalf("history chat: status = %d", status)
	}
	historyStarted := time.Now()
	historyMessages := p1WaitReplyDoneWithin(t, ts.URL, "main", 60*time.Second)
	t.Logf("历史轮次完成耗时 %s", time.Since(historyStarted))
	historyUser := p1UserMessage(historyMessages, historyText)
	if historyUser == nil {
		t.Fatalf("缺少历史用户消息: %v", historyMessages)
	}
	historyUserID := p1StringField(t, "history user", historyUser, "id")
	var historyReplyID string
	for _, message := range historyMessages {
		if role, _ := message["role"].(string); role == "agent" {
			historyReplyID = p1StringField(t, "history reply", message, "id")
		}
	}
	if historyReplyID == "" {
		t.Fatalf("缺少历史 agent 消息")
	}

	// 无 since 的新连接 + subscribe：不得回放历史，只收到订阅之后的实时事件。
	live := dialWS(t, ctx, ts.URL, "?sessionId=main")
	if hello := p1ReadFrame(t, ctx, live, "live hello"); hello.Type != "hello" {
		t.Fatalf("live 首帧应为 hello，得到 %q", hello.Type)
	}
	sendWS(t, ctx, live, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})

	const newText = "订阅后新消息"
	sendWS(t, ctx, live, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": newText},
	})
	liveFrames := p1CollectTurnFrames(t, ctx, live, "live turn", newText, 600)
	for _, frame := range liveFrames {
		switch frame.Type {
		case "message.created", "reply.created":
			id := p1FrameString(t, "live turn", frame, "id")
			if id == historyUserID || id == historyReplyID {
				t.Fatalf("无 since 订阅回放了历史事件 %s: %s", id, frame.Data)
			}
		}
	}
	lifecycle := p1AnalyzeReplyLifecycle(t, "live turn", liveFrames, newText)
	if lifecycle.Idle < 0 {
		t.Fatalf("实时 turn 未收敛到 idle")
	}

	// since=0 重连：回放历史事件。
	replayConn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if hello := p1ReadFrame(t, ctx, replayConn, "replay hello"); hello.Type != "hello" {
		t.Fatalf("replay 首帧应为 hello，得到 %q", hello.Type)
	}
	replayFrames := p1CollectUntilIdle(t, ctx, replayConn, "replay", 600)
	var sawHistoryUser, sawHistoryReply bool
	var replayMax int64
	for _, frame := range replayFrames {
		replayMax = frame.ID
		switch frame.Type {
		case "message.created":
			if id := p1FrameString(t, "replay", frame, "id"); id == historyUserID {
				sawHistoryUser = true
			}
		case "reply.created":
			if id := p1FrameString(t, "replay", frame, "id"); id == historyReplyID {
				sawHistoryReply = true
			}
		}
	}
	if !sawHistoryUser || !sawHistoryReply {
		t.Fatalf("since=0 未回放历史事件: user=%v reply=%v", sawHistoryUser, sawHistoryReply)
	}
	if replayMax <= 0 {
		t.Fatalf("回放事件 ID 应为正数")
	}

	// 断线续接：新连接 since=replayMax，只收到之后的新事件。
	resumed := dialWS(t, ctx, ts.URL, "?sessionId=main&since="+itoa(int(replayMax)))
	if hello := p1ReadFrame(t, ctx, resumed, "resumed hello"); hello.Type != "hello" {
		t.Fatalf("resumed 首帧应为 hello，得到 %q", hello.Type)
	}
	const resumedText = "续接后的消息"
	sendWS(t, ctx, resumed, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": resumedText},
	})
	resumedFrames := p1CollectUntilIdle(t, ctx, resumed, "resumed turn", 600)
	p1AssertFrameIDsMonotonic(t, "resumed turn", resumedFrames)
	for _, frame := range resumedFrames {
		if frame.ID != 0 && frame.ID <= replayMax {
			t.Fatalf("since 续接重发了旧事件 id=%d (lastID=%d, type=%s)", frame.ID, replayMax, frame.Type)
		}
	}
	resumedLifecycle := p1AnalyzeReplyLifecycle(t, "resumed turn", resumedFrames, resumedText)
	if resumedLifecycle.Idle < 0 {
		t.Fatalf("续接 turn 未收敛到 idle")
	}
}

// TestP1ConvWSFrameErrorsAndKeepalive 覆盖 AC-SYNC-001-02 的异常边界：非法 JSON、未知帧类型、
// 非法 chat 都返回 error 帧且不关闭连接；ping 不打断后续正常 turn。
func TestP1ConvWSFrameErrorsAndKeepalive(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if hello := p1ReadFrame(t, ctx, conn, "hello"); hello.Type != "hello" {
		t.Fatalf("首帧应为 hello，得到 %q", hello.Type)
	}

	assertError := func(what string, wantSubstring string) {
		t.Helper()
		frame := p1ReadFrame(t, ctx, conn, what)
		if frame.Type != "error" {
			t.Fatalf("%s: 应收到 error 帧，得到 %q: %s", what, frame.Type, frame.Data)
		}
		data := p1FrameData(t, what, frame)
		code, _ := data["code"].(string)
		message, _ := data["message"].(string)
		if code == "" {
			t.Fatalf("%s: error 帧缺少 code: %s", what, frame.Data)
		}
		if message == "" {
			t.Fatalf("%s: error 帧缺少 message: %s", what, frame.Data)
		}
		if wantSubstring != "" && !strings.Contains(message, wantSubstring) {
			t.Fatalf("%s: error message = %q, 应包含 %q", what, message, wantSubstring)
		}
	}

	// 非法 JSON 帧。
	if err := conn.Write(ctx, websocket.MessageText, []byte("this-is-not-json")); err != nil {
		t.Fatalf("写入非法 JSON 失败: %v", err)
	}
	assertError("非法 JSON", "帧不是合法 JSON")

	// 未知帧类型。
	sendWS(t, ctx, conn, map[string]any{"type": "bogus", "data": map[string]any{}})
	assertError("未知帧类型", "未知帧类型")

	// 空文本 chat：4xx 语义错误，不产生 turn。
	sendWS(t, ctx, conn, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": "   "},
	})
	assertError("空文本 chat", "")

	// ping 不返回帧，但连接必须继续可用。
	sendWS(t, ctx, conn, map[string]any{"type": "ping", "data": map[string]any{}})
	const text = "错误之后仍可发送"
	sendWS(t, ctx, conn, map[string]any{
		"type": "chat",
		"data": map[string]any{"sessionId": "main", "text": text},
	})
	frames := p1CollectUntilIdle(t, ctx, conn, "post-error turn", 600)
	lifecycle := p1AnalyzeReplyLifecycle(t, "post-error turn", frames, text)
	if lifecycle.Idle < 0 || lifecycle.ReplyDone < 0 {
		t.Fatalf("error 帧后连接应保持可用: %+v", lifecycle)
	}
	if messages := listMessages(t, ts.URL, "main"); len(messages) != 2 {
		t.Fatalf("错误帧不应落库脏消息，实际 %d 条: %v", len(messages), messages)
	}
}
