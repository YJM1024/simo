package chat

import "testing"

// active 以 reply.ID 为 key，sessionTurnActive 必须按 SessionID 找得到正在执行的 Turn。
// 回归：CI 慢机器上 M13 定时任务在审批写入前误判空闲，把 failed 写成 done。
func TestSessionTurnActiveMatchesBySessionID(t *testing.T) {
	m := &Module{active: map[string]*activeTurn{
		"reply-1": {SessionID: "sess-a"},
		"reply-2": {SessionID: "sess-b"},
	}}
	if !m.sessionTurnActive("sess-a") {
		t.Fatal("sess-a 正在执行，应返回 true")
	}
	if !m.sessionTurnActive("sess-b") {
		t.Fatal("sess-b 正在执行，应返回 true")
	}
	if m.sessionTurnActive("sess-c") {
		t.Fatal("sess-c 没有执行中的 Turn，应返回 false")
	}
}
