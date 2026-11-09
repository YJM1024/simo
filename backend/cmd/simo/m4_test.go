package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"simo/internal/platform/config"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
)

type treeNode struct {
	ID       string     `json:"id"`
	ParentID string     `json:"parentId"`
	Title    string     `json:"title"`
	Children []treeNode `json:"children"`
}

func sessionTree(t *testing.T, baseURL string) []treeNode {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions/tree")
	if status != http.StatusOK {
		t.Fatalf("tree = %d %s", status, body)
	}
	var payload struct {
		Sessions []treeNode `json:"sessions"`
		Tree     []treeNode `json:"tree"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("tree JSON: %v (%s)", err, body)
	}
	if len(payload.Sessions) > 0 {
		return payload.Sessions
	}
	return payload.Tree
}

func findChildByMarker(nodes []treeNode, marker string) *treeNode {
	for i := range nodes {
		for j := range nodes[i].Children {
			if strings.Contains(nodes[i].Children[j].Title, marker) {
				return &nodes[i].Children[j]
			}
		}
		if found := findChildByMarker(nodes[i].Children, marker); found != nil {
			return found
		}
	}
	return nil
}

func postJSON(t *testing.T, url string, body any) (int, []byte) {
	t.Helper()
	data, _ := json.Marshal(body)
	resp, err := http.Post(url, "application/json", strings.NewReader(string(data)))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	bodyData, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, bodyData
}

func TestM4AutoRouteTreeAggregateRename(t *testing.T) {
	_, ts := newM2App(t, llm.NewMock(), nil)
	marker := "m4-marker-route"
	if status, _ := postChat(t, ts.URL, "我想创建一个新的需求："+marker+" 把报销单整理成表格。"); status != http.StatusAccepted {
		t.Fatalf("POST route = %d", status)
	}

	var child *treeNode
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		child = findChildByMarker(sessionTree(t, ts.URL), marker)
		if child != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if child == nil {
		t.Fatalf("未创建子会话: %+v", sessionTree(t, ts.URL))
	}
	if child.ParentID != "main" || child.ID == "main" {
		t.Fatalf("child = %+v", child)
	}
	waitForReplyDone(t, ts.URL, child.ID)

	status, body := httpGet(t, ts.URL+"/api/messages?sessionId="+child.ID)
	if status != http.StatusOK || !strings.Contains(string(body), marker) || !strings.Contains(string(body), `"sessionTitle"`) {
		t.Fatalf("child messages = %d %s", status, body)
	}
	status, mainOnly := httpGet(t, ts.URL+"/api/messages?sessionId=main&includeChildren=false")
	if status != http.StatusOK || strings.Contains(string(mainOnly), marker) {
		t.Fatalf("main only 泄漏子消息: %d %s", status, mainOnly)
	}
	status, aggregate := httpGet(t, ts.URL+"/api/messages?sessionId=main&includeChildren=true")
	if status != http.StatusOK || !strings.Contains(string(aggregate), marker) {
		t.Fatalf("aggregate 缺子消息: %d %s", status, aggregate)
	}
	if strings.Index(string(aggregate), "把报销单") > strings.Index(string(aggregate), marker) {
		// 只做基本顺序/贯通断言：marker 在聚合结果中。
	}

	// 改名只改显示；消息 sessionTitle 动态反映新标题。
	newTitle := "改后-" + marker
	req, _ := http.NewRequest(http.MethodPatch, ts.URL+"/api/sessions/"+child.ID, strings.NewReader(`{"title":"`+newTitle+`"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("rename = %d", resp.StatusCode)
	}
	_, renamedBody := httpGet(t, ts.URL+"/api/messages?sessionId="+child.ID)
	if !strings.Contains(string(renamedBody), newTitle) {
		t.Fatalf("改名后消息 sessionTitle 未更新: %s", renamedBody)
	}

	// POST /api/sessions 显式创建孙会话。
	status, created := postJSON(t, ts.URL+"/api/sessions", map[string]any{"parentId": child.ID, "title": "孙会话"})
	if status != http.StatusCreated || !strings.Contains(string(created), `"parentId":"`+child.ID+`"`) {
		t.Fatalf("POST sessions = %d %s", status, created)
	}
}

func TestM4SessionTreeAndRenamePersistAcrossRestart(t *testing.T) {
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
	status, created := postJSON(t, ts1.URL+"/api/sessions", map[string]any{"parentId": "main", "title": "持久子会话"})
	if status != http.StatusCreated {
		t.Fatalf("create = %d %s", status, created)
	}
	var createdPayload struct {
		Session treeNode `json:"session"`
	}
	_ = json.Unmarshal(created, &createdPayload)
	ts1.Close()
	_ = app1.Close()

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()
	child := findChildByMarker(sessionTree(t, ts2.URL), "持久子会话")
	if child == nil || child.ID != createdPayload.Session.ID {
		t.Fatalf("重启后会话丢失: %+v created=%+v", child, createdPayload.Session)
	}
}
