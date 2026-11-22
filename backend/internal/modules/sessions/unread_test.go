package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

type fakeUnreadSource struct {
	flags map[string]bool
	err   error
}

func (f fakeUnreadSource) UnreadSessionIDs(context.Context) (map[string]bool, error) {
	return f.flags, f.err
}

type unreadNode struct {
	ID        string       `json:"id"`
	HasUnread *bool        `json:"hasUnread"`
	Children  []unreadNode `json:"children"`
}

func findUnreadNode(nodes []unreadNode, id string) *unreadNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
		if found := findUnreadNode(nodes[i].Children, id); found != nil {
			return found
		}
	}
	return nil
}

func getJSON(t *testing.T, url string, target any) int {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		t.Fatalf("%s 响应不是 JSON: %v", url, err)
	}
	return resp.StatusCode
}

// 会话列表（含 q/pinned 路径）与树都投影 hasUnread；来源缺失/失败时降级为全已读而不是 500。
func TestSessionListAndTreeProjectHasUnread(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()
	child, err := mod.Create(ctx, DefaultSessionID, "未读子会话")
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mod.registerHTTP(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	var list struct {
		Sessions []unreadNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions", &list); status != http.StatusOK {
		t.Fatalf("list status = %d", status)
	}
	mainNode := findUnreadNode(list.Sessions, DefaultSessionID)
	childNode := findUnreadNode(list.Sessions, child.ID)
	if mainNode == nil || childNode == nil {
		t.Fatalf("列表缺少会话: %+v", list.Sessions)
	}
	if mainNode.HasUnread == nil || *mainNode.HasUnread {
		t.Fatalf("main hasUnread = %v, want false（字段必须输出）", mainNode.HasUnread)
	}
	if childNode.HasUnread == nil || *childNode.HasUnread {
		t.Fatalf("来源未注入时 child hasUnread = %v, want false", childNode.HasUnread)
	}

	mod.SetUnreadSource(fakeUnreadSource{flags: map[string]bool{child.ID: true}})

	if status := getJSON(t, ts.URL+"/api/sessions", &list); status != http.StatusOK {
		t.Fatalf("list status = %d", status)
	}
	if node := findUnreadNode(list.Sessions, child.ID); node == nil || node.HasUnread == nil || !*node.HasUnread {
		t.Fatalf("列表未投影 child 未读: %+v", node)
	}
	if node := findUnreadNode(list.Sessions, DefaultSessionID); node == nil || node.HasUnread == nil || *node.HasUnread {
		t.Fatalf("列表误标 main 未读: %+v", node)
	}

	// 搜索路径（GET /api/sessions?q=）同样投影。
	var search struct {
		Sessions []unreadNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions?q=未读", &search); status != http.StatusOK {
		t.Fatalf("search status = %d", status)
	}
	if node := findUnreadNode(search.Sessions, child.ID); node == nil || node.HasUnread == nil || !*node.HasUnread {
		t.Fatalf("搜索结果未投影未读: %+v", node)
	}

	// 树：嵌套子会话也带 hasUnread，扁平列表同值。
	var tree struct {
		Tree     []unreadNode `json:"tree"`
		Sessions []unreadNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions/tree", &tree); status != http.StatusOK {
		t.Fatalf("tree status = %d", status)
	}
	if node := findUnreadNode(tree.Tree, child.ID); node == nil || node.HasUnread == nil || !*node.HasUnread {
		t.Fatalf("树未投影 child 未读: %+v", node)
	}
	if node := findUnreadNode(tree.Sessions, child.ID); node == nil || node.HasUnread == nil || !*node.HasUnread {
		t.Fatalf("树响应里的扁平列表未投影 child 未读: %+v", node)
	}

	// 来源报错：降级为全已读，列表仍 200。
	mod.SetUnreadSource(fakeUnreadSource{err: errors.New("boom")})
	var degraded struct {
		Sessions []unreadNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions", &degraded); status != http.StatusOK {
		t.Fatalf("来源失败时 list status = %d, want 200", status)
	}
	if node := findUnreadNode(degraded.Sessions, child.ID); node == nil || node.HasUnread == nil || *node.HasUnread {
		t.Fatalf("来源失败应降级为已读: %+v", node)
	}
}
