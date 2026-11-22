package sessions

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"simo/internal/core/store"
)

type countNode struct {
	ID           string      `json:"id"`
	MessageCount *int        `json:"messageCount"`
	Children     []countNode `json:"children"`
}

func findCountNode(nodes []countNode, id string) *countNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
		if found := findCountNode(nodes[i].Children, id); found != nil {
			return found
		}
	}
	return nil
}

func countOf(t *testing.T, nodes []countNode, id string) int {
	t.Helper()
	node := findCountNode(nodes, id)
	if node == nil {
		t.Fatalf("响应缺少会话 %s: %+v", id, nodes)
	}
	if node.MessageCount == nil {
		t.Fatalf("会话 %s 缺少 messageCount 字段: %+v", id, node)
	}
	return *node.MessageCount
}

func createMessagesTable(t *testing.T, st *store.Store) {
	t.Helper()
	ctx := context.Background()
	err := st.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			role TEXT NOT NULL,
			text TEXT NOT NULL,
			at INTEGER NOT NULL,
			status TEXT NOT NULL,
			internal INTEGER NOT NULL DEFAULT 0
		)`)
		return err
	})
	if err != nil {
		t.Fatalf("建 messages 表失败: %v", err)
	}
}

func insertMessage(t *testing.T, st *store.Store, id, sessionID string, internal int) {
	t.Helper()
	ctx := context.Background()
	err := st.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO messages(id, session_id, role, text, at, status, internal) VALUES (?, ?, 'user', 'x', 1, 'done', ?)`,
			id, sessionID, internal)
		return err
	})
	if err != nil {
		t.Fatalf("插入消息失败: %v", err)
	}
}

func doPOST(t *testing.T, url, body string) httpResult {
	t.Helper()
	resp, err := http.Post(url, "application/json", bytes.NewReader([]byte(body)))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	return httpResult{status: resp.StatusCode, header: resp.Header, body: payload}
}

// 列表、?q= 搜索与树三处都给出「该会话自身」的可见消息数：不含子会话、
// 不含 internal=1 的内部消息；归档后仍是真实条数；树与列表数值一致。
func TestSessionMessageCountOwnOnlyAcrossListSearchAndTree(t *testing.T) {
	mod, ts := newETagServer(t)
	ctx := context.Background()
	createMessagesTable(t, mod.store)

	child, err := mod.Create(ctx, DefaultSessionID, "计数子会话")
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 3; i++ {
		insertMessage(t, mod.store, fmt.Sprintf("child-%d", i), child.ID, 0)
	}
	insertMessage(t, mod.store, "child-internal", child.ID, 1)
	insertMessage(t, mod.store, "main-1", DefaultSessionID, 0)
	insertMessage(t, mod.store, "main-2", DefaultSessionID, 0)

	var list struct {
		Sessions []countNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions", &list); status != http.StatusOK {
		t.Fatalf("list status = %d", status)
	}
	if got := countOf(t, list.Sessions, child.ID); got != 3 {
		t.Fatalf("子会话自身计数 = %d, want 3（不含父会话与 internal 消息）", got)
	}
	if got := countOf(t, list.Sessions, DefaultSessionID); got != 2 {
		t.Fatalf("主会话自身计数 = %d, want 2（不含子会话消息）", got)
	}

	var search struct {
		Sessions []countNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions?q=计数", &search); status != http.StatusOK {
		t.Fatalf("search status = %d", status)
	}
	if got := countOf(t, search.Sessions, child.ID); got != 3 {
		t.Fatalf("搜索结果计数 = %d, want 3", got)
	}

	var tree struct {
		Tree     []countNode `json:"tree"`
		Sessions []countNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions/tree", &tree); status != http.StatusOK {
		t.Fatalf("tree status = %d", status)
	}
	if got := countOf(t, tree.Tree, child.ID); got != 3 {
		t.Fatalf("树中子会话计数 = %d, want 3", got)
	}
	if got := countOf(t, tree.Sessions, child.ID); got != 3 {
		t.Fatalf("树响应扁平列表计数 = %d, want 3（须与列表路径一致）", got)
	}

	// 归档只改读路径可见性，不隐藏已有消息：计数仍为真实条数。
	if err := mod.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET archived = 1 WHERE id = ?`, child.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	var archived struct {
		Sessions []countNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions", &archived); status != http.StatusOK {
		t.Fatalf("archived list status = %d", status)
	}
	if got := countOf(t, archived.Sessions, child.ID); got != 3 {
		t.Fatalf("归档会话计数 = %d, want 3", got)
	}
}

// 草稿还没有落库消息，创建响应必须显式给 messageCount=0，而不是缺字段。
func TestSessionMessageCountDraftIsZero(t *testing.T) {
	_, ts := newETagServer(t)
	result := doPOST(t, ts.URL+"/api/sessions", `{"title":"草稿计数"}`)
	if result.status != http.StatusCreated {
		t.Fatalf("status = %d, want 201: %s", result.status, string(result.body))
	}
	var payload struct {
		Draft   bool `json:"draft"`
		Session struct {
			ID           string `json:"id"`
			MessageCount *int   `json:"messageCount"`
		} `json:"session"`
	}
	if err := json.Unmarshal(result.body, &payload); err != nil {
		t.Fatalf("响应不是 JSON: %v", err)
	}
	if !payload.Draft {
		t.Fatalf("draft = false, want true")
	}
	if payload.Session.MessageCount == nil {
		t.Fatalf("草稿响应缺少 messageCount 字段: %s", string(result.body))
	}
	if *payload.Session.MessageCount != 0 {
		t.Fatalf("草稿 messageCount = %d, want 0", *payload.Session.MessageCount)
	}
}

// messages 表由 chat 模块创建；表缺失时列表仍 200，计数按 0 输出（单模块测试与旧库）。
func TestSessionMessageCountWithoutMessagesTable(t *testing.T) {
	_, ts := newETagServer(t)
	var list struct {
		Sessions []countNode `json:"sessions"`
	}
	if status := getJSON(t, ts.URL+"/api/sessions", &list); status != http.StatusOK {
		t.Fatalf("list status = %d", status)
	}
	if got := countOf(t, list.Sessions, DefaultSessionID); got != 0 {
		t.Fatalf("无 messages 表时计数 = %d, want 0", got)
	}
}

// messageCount 进入响应体后必须参与 ETag：新增消息要让旧 If-None-Match 失效回 200，
// 否则前端会继续拿到 304 与旧计数。
func TestSessionListETagTracksMessageCount(t *testing.T) {
	mod, ts := newETagServer(t)
	ctx := context.Background()
	createMessagesTable(t, mod.store)
	child, err := mod.Create(ctx, DefaultSessionID, "ETag 计数")
	if err != nil {
		t.Fatal(err)
	}

	first := doGET(t, ts.URL+"/api/sessions", nil)
	if first.status != http.StatusOK {
		t.Fatalf("first status = %d", first.status)
	}
	etag := first.header.Get("ETag")
	if etag == "" {
		t.Fatal("首请求缺少 ETag")
	}

	insertMessage(t, mod.store, "etag-count-1", child.ID, 0)
	second := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": etag})
	if second.status != http.StatusOK {
		t.Fatalf("新增消息后 status = %d, want 200（不得沿用旧 ETag 回 304）", second.status)
	}
	if got := second.header.Get("ETag"); got == etag {
		t.Fatalf("新增消息后 ETag 未变: %q", got)
	}
	var list struct {
		Sessions []countNode `json:"sessions"`
	}
	if err := json.Unmarshal(second.body, &list); err != nil {
		t.Fatal(err)
	}
	if got := countOf(t, list.Sessions, child.ID); got != 1 {
		t.Fatalf("新增消息后计数 = %d, want 1", got)
	}

	third := doGET(t, ts.URL+"/api/sessions", map[string]string{"If-None-Match": second.header.Get("ETag")})
	if third.status != http.StatusNotModified {
		t.Fatalf("计数稳定后条件请求 status = %d, want 304", third.status)
	}
}
