package main

import (
	"context"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func collectWSUntilDone(t *testing.T, ctx context.Context, conn *websocket.Conn) []wsFrame {
	t.Helper()
	frames := make([]wsFrame, 0, 16)
	for {
		frame := readWS(t, ctx, conn)
		frames = append(frames, frame)
		if frame.Type == "message.done" {
			return frames
		}
	}
}

func TestM88WebSocketFanoutTwoClients(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	connA := dialWS(t, ctx, ts.URL, "?sessionId=main")
	connB := dialWS(t, ctx, ts.URL, "?sessionId=main")
	for name, conn := range map[string]*websocket.Conn{"A": connA, "B": connB} {
		hello := readWS(t, ctx, conn)
		if hello.Type != "hello" {
			t.Fatalf("%s first frame = %s", name, hello.Type)
		}
		sendWS(t, ctx, conn, map[string]any{"type": "subscribe", "data": map[string]any{"sessionId": "main"}})
	}
	time.Sleep(80 * time.Millisecond)
	sendWS(t, ctx, connA, map[string]any{
		"type": "chat", "data": map[string]any{"sessionId": "main", "text": "双客户端 fan-out"},
	})
	framesA := collectWSUntilDone(t, ctx, connA)
	framesB := collectWSUntilDone(t, ctx, connB)
	if len(framesA) == 0 || len(framesB) == 0 {
		t.Fatalf("empty fanout")
	}
	if len(framesA) != len(framesB) {
		t.Fatalf("frame count A=%d B=%d", len(framesA), len(framesB))
	}
	seen := map[int64]bool{}
	hasCreated, hasReplyDelta, hasReplyDone := false, false, false
	for i := range framesA {
		if framesA[i].Type != framesB[i].Type || framesA[i].ID != framesB[i].ID {
			t.Fatalf("fanout mismatch at %d: A=%s/%d B=%s/%d",
				i, framesA[i].Type, framesA[i].ID, framesB[i].Type, framesB[i].ID)
		}
		if seen[framesA[i].ID] {
			t.Fatalf("duplicate event id %d", framesA[i].ID)
		}
		seen[framesA[i].ID] = true
		switch framesA[i].Type {
		case "message.created":
			hasCreated = true
		case "reply.delta":
			hasReplyDelta = true
		case "reply.done":
			hasReplyDone = true
		}
	}
	if !hasCreated || !hasReplyDelta || !hasReplyDone {
		t.Fatalf("missing event types: created=%v reply.delta=%v reply.done=%v types=%v",
			hasCreated, hasReplyDelta, hasReplyDone, typesOf(framesA))
	}
	// 断开重连补拉：since=0 回放同一批事件（新连接不会丢状态）。
	connC := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if hello := readWS(t, ctx, connC); hello.Type != "hello" {
		t.Fatalf("reconnect first frame = %s", hello.Type)
	}
	framesC := collectWSUntilDone(t, ctx, connC)
	if len(framesC) < len(framesA) {
		t.Fatalf("replay count = %d, live count = %d", len(framesC), len(framesA))
	}
	for i := range framesA {
		if framesA[i].ID != framesC[i].ID || framesA[i].Type != framesC[i].Type {
			t.Fatalf("replay mismatch at %d: live=%s/%d replay=%s/%d",
				i, framesA[i].Type, framesA[i].ID, framesC[i].Type, framesC[i].ID)
		}
	}
}

func typesOf(frames []wsFrame) []string {
	out := make([]string, len(frames))
	for i, frame := range frames {
		out[i] = frame.Type
	}
	return out
}
