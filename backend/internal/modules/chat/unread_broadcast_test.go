package chat

import (
	"encoding/json"
	"testing"
	"time"

	"simo/internal/core/eventlog"
)

// 连续 3 条消息落在同一个 200ms 窗口内只产生 1 帧；窗口滑过后同一会话可以再提示。
func TestUnreadHubDebouncesPerSession(t *testing.T) {
	hub := newUnreadHub()
	out := make(chan wsEnvelope, 8)
	id := hub.register(out)
	defer hub.unregister(id)

	now := time.UnixMilli(1_700_000_000_000)
	hub.now = func() time.Time { return now }

	for i := 0; i < 3; i++ {
		if !hub.broadcast("s1") && i == 0 {
			t.Fatalf("窗口内首帧应放行")
		}
	}
	if got := len(out); got != 1 {
		t.Fatalf("3 条消息在 200ms 内应只产生 1 帧，得到 %d", got)
	}
	frame := <-out
	if frame.Type != wsFrameSessionUnread {
		t.Fatalf("帧类型 = %q, want %q", frame.Type, wsFrameSessionUnread)
	}
	if sessionID := frameSessionID(t, frame); sessionID != "s1" {
		t.Fatalf("帧 sessionId = %q, want s1", sessionID)
	}

	// 不同会话各自独立去抖：s2 不受 s1 窗口影响。
	if !hub.broadcast("s2") {
		t.Fatalf("不同会话不应被 s1 去抖吞掉")
	}
	if got := len(out); got != 1 {
		t.Fatalf("s2 应额外产生 1 帧，得到 %d", got)
	}

	// 窗口到期（>= 200ms）后同一会话可以再次提示。
	now = now.Add(unreadBroadcastWindow)
	if !hub.broadcast("s1") {
		t.Fatalf("窗口到期后应再次广播")
	}
	if got := len(out); got != 2 {
		t.Fatalf("窗口到期后应新增 1 帧，得到 %d", got)
	}
}

// 广播覆盖所有连接，且慢连接（缓冲满）不能阻塞其它连接。
func TestUnreadHubBroadcastsToEveryConnection(t *testing.T) {
	hub := newUnreadHub()
	fastA := make(chan wsEnvelope, 1)
	fastB := make(chan wsEnvelope, 1)
	slow := make(chan wsEnvelope) // 无缓冲且无人读：模拟卡住的客户端
	hub.register(fastA)
	hub.register(fastB)
	hub.register(slow)

	if !hub.broadcast("s1") {
		t.Fatalf("首帧应放行")
	}
	for name, ch := range map[string]chan wsEnvelope{"A": fastA, "B": fastB} {
		select {
		case frame := <-ch:
			if frame.Type != wsFrameSessionUnread || frameSessionID(t, frame) != "s1" {
				t.Fatalf("连接 %s 收到错误帧: %+v", name, frame)
			}
		default:
			t.Fatalf("连接 %s 未收到 session_unread", name)
		}
	}
}

// 注销后不再收到广播（连接断开不应泄漏发送通道）。
func TestUnreadHubUnregisterStopsDelivery(t *testing.T) {
	hub := newUnreadHub()
	out := make(chan wsEnvelope, 4)
	id := hub.register(out)
	hub.unregister(id)
	hub.broadcast("s1")
	if got := len(out); got != 0 {
		t.Fatalf("注销后仍收到 %d 帧", got)
	}
}

// 消息落库事件 → 只有"可见 agent 消息使其未读"才广播；用户/隐藏消息不广播。
func TestConsumeUnreadEventsOnlyBroadcastsVisibleAgent(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	insertTestSession(t, db, ctx, "s1")
	insertTestSession(t, db, ctx, "s2")
	insertTestMessage(t, db, ctx, "a1", "s1", RoleAgent, 2000, 0)
	insertTestMessage(t, db, ctx, "u1", "s1", RoleUser, 3000, 0)
	insertTestMessage(t, db, ctx, "h1", "s2", RoleAgent, 4000, 1)

	out := make(chan wsEnvelope, 8)
	mod.unread.register(out)

	ch := make(chan eventlog.Event, 8)
	mod.eventWG.Add(1)
	go mod.consumeUnreadEvents(ch)
	ch <- messageCreatedEvent(t, "s1", RoleAgent, 2000, false) // 应广播
	ch <- messageCreatedEvent(t, "s1", RoleUser, 3000, false)  // 用户消息不广播
	ch <- messageCreatedEvent(t, "s2", RoleAgent, 4000, true)  // 隐藏消息不广播
	close(ch)
	mod.eventWG.Wait()

	if got := len(out); got != 1 {
		t.Fatalf("应只有 1 帧（s1 可见 agent 消息），得到 %d", got)
	}
	if sessionID := frameSessionID(t, <-out); sessionID != "s1" {
		t.Fatalf("帧 sessionId = %q, want s1", sessionID)
	}

	// 已读游标覆盖到该消息后，同样的消息不再广播。
	if _, err := mod.markReadAt(ctx, "s1", 2500, "a1"); err != nil {
		t.Fatal(err)
	}
	unread, err := mod.sessionUnreadAt(ctx, "s1", 2000)
	if err != nil || unread {
		t.Fatalf("游标之后的旧消息应判已读: unread=%v err=%v", unread, err)
	}
	if unread, err := mod.sessionUnreadAt(ctx, "s1", 2600); err != nil || !unread {
		t.Fatalf("晚于游标的消息应判未读: unread=%v err=%v", unread, err)
	}
}

func messageCreatedEvent(t *testing.T, sessionID, role string, at int64, internal bool) eventlog.Event {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"sessionId": sessionID, "role": role, "at": at, "internal": internal,
	})
	if err != nil {
		t.Fatal(err)
	}
	return eventlog.Event{Type: eventlog.TypeMessageCreated, Payload: payload}
}

func frameSessionID(t *testing.T, frame wsEnvelope) string {
	t.Helper()
	data, ok := frame.Data.(sessionUnreadEvent)
	if !ok {
		t.Fatalf("帧 data 类型 = %T, want sessionUnreadEvent", frame.Data)
	}
	return data.SessionID
}
