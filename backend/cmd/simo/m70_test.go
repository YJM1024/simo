package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"simo/internal/platform/config"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

func treeHasID(nodes []treeNode, id string) bool {
	for i := range nodes {
		if nodes[i].ID == id || treeHasID(nodes[i].Children, id) {
			return true
		}
	}
	return false
}

func TestM70DraftNotPersistedThenMaterialized(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	status, body := postJSON(t, ts.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "草稿会话"})
	if status != http.StatusCreated {
		t.Fatalf("create draft = %d %s", status, body)
	}
	var created struct {
		Session treeNode `json:"session"`
		Draft   bool     `json:"draft"`
	}
	if err := json.Unmarshal(body, &created); err != nil || created.Session.ID == "" || !created.Draft {
		t.Fatalf("draft payload = %s err=%v", body, err)
	}
	if treeHasID(sessionTree(t, ts.URL), created.Session.ID) {
		t.Fatalf("空草稿不应进入会话树")
	}
	var count int
	if err := a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM sessions WHERE id=?`, created.Session.ID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("空草稿不应落库: count=%d err=%v", count, err)
	}
	// 同一会话树最多一个空草稿。
	status, secondBody := postJSON(t, ts.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "草稿二"})
	var second struct {
		Session treeNode `json:"session"`
	}
	_ = json.Unmarshal(secondBody, &second)
	if status != http.StatusCreated || second.Session.ID != created.Session.ID {
		t.Fatalf("同一树出现多个草稿: first=%s second=%s status=%d", created.Session.ID, second.Session.ID, status)
	}
	// 首条消息：物化并写入该会话。
	status, _ = postJSON(t, ts.URL+"/api/chat", map[string]any{"sessionId": created.Session.ID, "text": "草稿里的第一条消息"})
	if status != http.StatusAccepted {
		t.Fatalf("chat draft = %d", status)
	}
	waitForReplyDone(t, ts.URL, created.Session.ID)
	if !treeHasID(sessionTree(t, ts.URL), created.Session.ID) {
		t.Fatalf("首条消息后草稿未物化")
	}
	if findM43Message(listMessages(t, ts.URL, created.Session.ID), "user", "第一条消息") == nil {
		t.Fatalf("首条消息未写入物化后的会话")
	}
}

func TestM70RestartCleansEmptySessions(t *testing.T) {
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
	status, body := postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "空会话", "draft": false})
	if status != http.StatusCreated {
		t.Fatalf("create empty = %d %s", status, body)
	}
	var empty struct {
		Session treeNode `json:"session"`
	}
	_ = json.Unmarshal(body, &empty)
	// 有子会话的空父会话应保留。
	status, body = postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "有子会话", "draft": false})
	var parent struct {
		Session treeNode `json:"session"`
	}
	_ = json.Unmarshal(body, &parent)
	postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": parent.Session.ID, "title": "子会话", "draft": false})
	ts1.Close()
	_ = app1.Close()

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = app2.Stop(context.Background()); _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()
	nodes := sessionTree(t, ts2.URL)
	if treeHasID(nodes, empty.Session.ID) {
		t.Fatalf("重启后空会话未清理")
	}
	if !treeHasID(nodes, "main") {
		t.Fatalf("main 会话被误删")
	}
	if !treeHasID(nodes, parent.Session.ID) {
		t.Fatalf("有子会话的父会话被误删")
	}
}

func TestM70RestartDraftDisappears(t *testing.T) {
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
	_, body := postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "重启前草稿"})
	var created struct {
		Session treeNode `json:"session"`
	}
	_ = json.Unmarshal(body, &created)
	ts1.Close()
	_ = app1.Close()

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = app2.Stop(context.Background()); _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()
	if treeHasID(sessionTree(t, ts2.URL), created.Session.ID) {
		t.Fatalf("重启后空草稿不应存在")
	}
}
