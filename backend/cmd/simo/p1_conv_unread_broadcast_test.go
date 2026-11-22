package main

// 未读提示（session_unread）广播契约测试：agent 在"非当前打开会话"产生新消息时，
// 侧栏不需要刷新列表就能点亮红点——帧必须到达所有 WS 连接，而不是只到订阅该会话的连接。
// 同时回归 session_read 帧与"读后再来新消息重新未读"的幂等语义。

import (
	"context"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// p1WaitFrameType 顺序跳过其它帧，直到出现目标类型；上限防止事件风暴挂死用例。
func p1WaitFrameType(t *testing.T, ctx context.Context, conn *websocket.Conn, what, frameType string, maxFrames int) wsFrame {
	t.Helper()
	for i := 0; i < maxFrames; i++ {
		frame := p1ReadFrame(t, ctx, conn, what)
		if frame.Type == frameType {
			return frame
		}
	}
	t.Fatalf("%s: %d 帧内未看到 %s", what, maxFrames, frameType)
	return wsFrame{}
}

func TestP1ConvUnreadBroadcastReachesAllConnections(t *testing.T) {
	_, ts := newM2App(t, nil, nil)

	child := p1CreateSession(t, ts.URL, "main", "未读广播目标")
	childID := p1StringField(t, "child", child, "id")

	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Second)
	defer cancel()

	// 连接 A 只订阅 main（模拟用户当前打开的会话），连接 B 订阅目标会话。
	connA := dialWS(t, ctx, ts.URL, "?sessionId=main")
	defer connA.CloseNow()
	if hello := p1ReadFrame(t, ctx, connA, "hello A"); hello.Type != "hello" {
		t.Fatalf("连接 A 首帧应为 hello，得到 %q", hello.Type)
	}
	connB := dialWS(t, ctx, ts.URL, "?sessionId="+url.QueryEscape(childID))
	defer connB.CloseNow()
	if hello := p1ReadFrame(t, ctx, connB, "hello B"); hello.Type != "hello" {
		t.Fatalf("连接 B 首帧应为 hello，得到 %q", hello.Type)
	}
	sendWS(t, ctx, connA, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	sendWS(t, ctx, connB, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": childID}})
	time.Sleep(100 * time.Millisecond) // 等订阅 goroutine 起流

	// 往 B 会话写消息（agent 回复落库 → 该会话变为未读）。
	if status := postChatSession(t, ts.URL, childID, "在别的会话触发未读"); status != http.StatusAccepted {
		t.Fatalf("POST chat child = %d", status)
	}

	// D1 回归点：未订阅该会话的连接 A 也必须收到 session_unread。
	frameA := p1WaitFrameType(t, ctx, connA, "connA", "session_unread", 120)
	if sessionID := p1FrameString(t, "connA", frameA, "sessionId"); sessionID != childID {
		t.Fatalf("connA session_unread.sessionId = %q, want %q", sessionID, childID)
	}
	frameB := p1WaitFrameType(t, ctx, connB, "connB", "session_unread", 120)
	if sessionID := p1FrameString(t, "connB", frameB, "sessionId"); sessionID != childID {
		t.Fatalf("connB session_unread.sessionId = %q, want %q", sessionID, childID)
	}
	if !p1UnreadFromTree(t, ts.URL, childID) {
		t.Fatalf("收到 session_unread 后列表投影仍应为未读")
	}

	// 回归：标记已读仍广播 session_read（形状/compat 不变）。
	p1MarkRead(t, ts.URL, childID)
	readFrame := p1WaitFrameType(t, ctx, connA, "connA session_read", "session_read", 120)
	if sessionID := p1FrameString(t, "connA", readFrame, "sessionId"); sessionID != childID {
		t.Fatalf("session_read.sessionId = %q, want %q", sessionID, childID)
	}
	if p1UnreadFromTree(t, ts.URL, childID) {
		t.Fatalf("标记已读后不应再未读")
	}

	// 已读之后再来新 agent 消息：未读重新成立并再次广播（去抖窗口已滑过）。
	time.Sleep(250 * time.Millisecond)
	if status := postChatSession(t, ts.URL, childID, "已读后的新消息"); status != http.StatusAccepted {
		t.Fatalf("POST chat child again = %d", status)
	}
	again := p1WaitFrameType(t, ctx, connA, "connA session_unread again", "session_unread", 120)
	if sessionID := p1FrameString(t, "connA", again, "sessionId"); sessionID != childID {
		t.Fatalf("second session_unread.sessionId = %q, want %q", sessionID, childID)
	}
	if !p1UnreadFromTree(t, ts.URL, childID) {
		t.Fatalf("已读后的新消息应重新未读")
	}
}
