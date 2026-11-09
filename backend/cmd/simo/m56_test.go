package main

import (
	"net/http"
	"testing"
	"time"

	"simo/internal/platform/config"
)

func childrenOf(nodes []treeNode, parentID string) []*treeNode {
	out := make([]*treeNode, 0, 4)
	seen := map[string]bool{}
	var walk func([]treeNode)
	walk = func(list []treeNode) {
		for i := range list {
			node := &list[i]
			if node.ParentID == parentID && !seen[node.ID] {
				seen[node.ID] = true
				out = append(out, node)
			}
			if len(node.Children) > 0 {
				walk(node.Children)
			}
		}
	}
	walk(nodes)
	return out
}

func waitForChildCount(t *testing.T, baseURL string, count int) []*treeNode {
	t.Helper()
	deadline := time.Now().Add(4 * time.Second)
	var children []*treeNode
	for time.Now().Before(deadline) {
		children = childrenOf(sessionTree(t, baseURL), "main")
		if len(children) >= count {
			return children
		}
		time.Sleep(50 * time.Millisecond)
	}
	return children
}

func TestM56IntentNewWithoutCreateWords(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, _ := postChat(t, ts.URL, "我现在有个需求：做一份数据分析报表，后面都归到这个事情。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	children := waitForChildCount(t, ts.URL, 1)
	if len(children) == 0 {
		t.Fatalf("意图 new 未创建子会话: %+v", sessionTree(t, ts.URL))
	}
	childID := children[0].ID
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if findM43Message(listMessages(t, ts.URL, childID), "user", "数据分析报表") != nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if findM43Message(listMessages(t, ts.URL, childID), "user", "数据分析报表") == nil {
		t.Fatalf("user 消息未进入新子会话")
	}
	if findM43Message(listMessages(t, ts.URL, childID), "agent", "") == nil {
		t.Fatalf("agent 回复未进入新子会话")
	}
	mainMessages := listMessages(t, ts.URL, "main")
	if len(mainMessages) != 0 {
		t.Fatalf("M58 路由后主会话不应新增任何消息: %v", mainMessages)
	}
}

func TestM56FollowUpStaysMain(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	for _, text := range []string{"这个继续", "刚才那个再补充一下", "那第二点呢"} {
		if status, _ := postChat(t, ts.URL, text); status != http.StatusAccepted {
			t.Fatalf("chat %q = %d", text, status)
		}
	}
	time.Sleep(300 * time.Millisecond)
	if children := childrenOf(sessionTree(t, ts.URL), "main"); len(children) != 0 {
		t.Fatalf("追问被过度拆分为子会话: %+v", children)
	}
	if findM43Message(listMessages(t, ts.URL, "main"), "user", "这个继续") == nil {
		t.Fatalf("追问未留主会话")
	}
}

func TestM56ExistingSessionRoutes(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	childID := createSession(t, ts.URL, "main", "数据分析")
	status, _ := postChat(t, ts.URL, "数据分析报表里再加一列环比。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(250 * time.Millisecond)
	if findM43Message(listMessages(t, ts.URL, childID), "user", "环比") == nil {
		t.Fatalf("已有子会话未直接路由")
	}
	if len(childrenOf(sessionTree(t, ts.URL), "main")) != 1 {
		t.Fatalf("已有子会话时不应重复创建")
	}
}

func TestM56ExplicitOverrideAndDisabled(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, _ := postChat(t, ts.URL, "就在主会话回答：我现在有个需求，帮我调研一个方案。")
	if status != http.StatusAccepted {
		t.Fatalf("override = %d", status)
	}
	time.Sleep(250 * time.Millisecond)
	if len(childrenOf(sessionTree(t, ts.URL), "main")) != 0 {
		t.Fatalf("显式覆盖仍创建了子会话")
	}
	if findM43Message(listMessages(t, ts.URL, "main"), "user", "调研一个方案") == nil {
		t.Fatalf("显式覆盖消息未留主会话")
	}
}

func TestM56DisabledNoCreation(t *testing.T) {
	t.Setenv("SIMO_AUTO_ROUTE", "0")
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, _ := postChat(t, ts.URL, "我现在有个需求：帮我做一份数据分析。")
	if status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	time.Sleep(250 * time.Millisecond)
	if len(childrenOf(sessionTree(t, ts.URL), "main")) != 0 {
		t.Fatalf("AUTO_ROUTE=0 仍创建子会话")
	}
	if findM43Message(listMessages(t, ts.URL, "main"), "user", "数据分析") == nil {
		t.Fatalf("关闭开关后消息未留主会话")
	}
}
