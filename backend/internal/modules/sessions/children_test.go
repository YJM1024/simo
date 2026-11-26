package sessions

// PRD-TASK-005：父层子会话视图。
// 覆盖直接子会话列表（含各自的 taskCount）、投影里的 childSessionCount/childSessionIds、
// 以及归档父会话不级联到子会话。

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"simo/internal/core/store"
)

func seedTaskRow(t *testing.T, st *store.Store, id, sessionID string) {
	t.Helper()
	ctx := context.Background()
	if err := st.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending')`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO tasks (id, session_id, status) VALUES (?, ?, 'pending')`, id, sessionID)
		return err
	}); err != nil {
		t.Fatalf("写入任务行 %s 失败: %v", id, err)
	}
}

func TestChildrenListsDirectChildSessionsWithTaskCount(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	parent, err := mod.Create(ctx, DefaultSessionID, "父会话")
	if err != nil {
		t.Fatal(err)
	}
	child, err := mod.Create(ctx, parent.ID, "子会话")
	if err != nil {
		t.Fatal(err)
	}
	grand, err := mod.Create(ctx, child.ID, "孙会话")
	if err != nil {
		t.Fatal(err)
	}
	seedTaskRow(t, st, "t-child", child.ID)
	seedTaskRow(t, st, "t-grand", grand.ID)

	children, err := mod.Children(ctx, parent.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(children) != 1 {
		t.Fatalf("父会话只有一个直接子会话，got %d", len(children))
	}
	if children[0].ID != child.ID || children[0].Title != "子会话" {
		t.Fatalf("子会话视图不对: %+v", children[0])
	}
	// 孙会话不算父层的子会话，子任务数只数该会话自己的任务。
	if children[0].TaskCount != 1 {
		t.Fatalf("子会话 taskCount 应为 1，got %d", children[0].TaskCount)
	}
	if children[0].Archived != 0 {
		t.Fatalf("子会话不应带归档标记: %+v", children[0])
	}

	grandChildren, err := mod.Children(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(grandChildren) != 1 || grandChildren[0].ID != grand.ID || grandChildren[0].TaskCount != 1 {
		t.Fatalf("子会话的直接子会话应为孙会话且带 1 条任务，got %+v", grandChildren)
	}

	leaf, err := mod.Children(ctx, grand.ID)
	if err != nil {
		t.Fatal(err)
	}
	if leaf == nil || len(leaf) != 0 {
		t.Fatalf("叶子会话应返回空切片而不是 nil，got %v", leaf)
	}

	if _, err := mod.Children(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("不存在的会话应返回 ErrNotFound，got %v", err)
	}
}

func TestSpecProjectionCountsOnlyDirectChildren(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	parent, err := mod.Create(ctx, DefaultSessionID, "父会话")
	if err != nil {
		t.Fatal(err)
	}
	child, err := mod.Create(ctx, parent.ID, "子会话")
	if err != nil {
		t.Fatal(err)
	}
	grand, err := mod.Create(ctx, child.ID, "孙会话")
	if err != nil {
		t.Fatal(err)
	}
	seedTaskRow(t, st, "t-child", child.ID)
	seedTaskRow(t, st, "t-grand", grand.ID)

	parentProjection, err := mod.buildSpecProjection(ctx, parent, defaultSpecTaskLimit)
	if err != nil {
		t.Fatal(err)
	}
	if parentProjection.ChildSessionCount != 1 || len(parentProjection.ChildSessionIDs) != 1 || parentProjection.ChildSessionIDs[0] != child.ID {
		t.Fatalf("父投影子会话字段不对: count=%d ids=%v", parentProjection.ChildSessionCount, parentProjection.ChildSessionIDs)
	}
	// 子会话与孙会话里的任务都不进父层任何任务分组。
	parentTasks := parentProjection.Tasks.Done.Total + parentProjection.Tasks.Running.Total + parentProjection.Tasks.Pending.Total
	if parentTasks != 0 {
		t.Fatalf("父层任务分组不应含子任务，got %d", parentTasks)
	}

	childProjection, err := mod.buildSpecProjection(ctx, child, defaultSpecTaskLimit)
	if err != nil {
		t.Fatal(err)
	}
	if childProjection.ChildSessionCount != 1 || len(childProjection.ChildSessionIDs) != 1 || childProjection.ChildSessionIDs[0] != grand.ID {
		t.Fatalf("子投影只应含直接子会话（孙会话）: count=%d ids=%v", childProjection.ChildSessionCount, childProjection.ChildSessionIDs)
	}
	if grandProjection, err := mod.buildSpecProjection(ctx, grand, defaultSpecTaskLimit); err != nil {
		t.Fatal(err)
	} else if grandProjection.ChildSessionCount != 0 || grandProjection.ChildSessionIDs == nil || len(grandProjection.ChildSessionIDs) != 0 {
		t.Fatalf("叶子会话应为 0 个非 nil 子会话 id: count=%d ids=%v", grandProjection.ChildSessionCount, grandProjection.ChildSessionIDs)
	}
}

func TestArchiveParentKeepsChildrenReadable(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	parent, err := mod.Create(ctx, DefaultSessionID, "父会话")
	if err != nil {
		t.Fatal(err)
	}
	child, err := mod.Create(ctx, parent.ID, "子会话")
	if err != nil {
		t.Fatal(err)
	}
	seedTaskRow(t, st, "t-child", child.ID)

	if _, err := mod.Archive(ctx, parent.ID); err != nil {
		t.Fatalf("归档父会话失败: %v", err)
	}

	children, err := mod.Children(ctx, parent.ID)
	if err != nil {
		t.Fatalf("归档后仍应能读子会话: %v", err)
	}
	if len(children) != 1 || children[0].ID != child.ID || children[0].Archived != 0 {
		t.Fatalf("归档父会话不应改子会话: %+v", children)
	}
	if children[0].TaskCount != 1 {
		t.Fatalf("子任务数不应因归档变化，got %d", children[0].TaskCount)
	}

	parentProjection, err := mod.buildSpecProjection(ctx, parent, defaultSpecTaskLimit)
	if err != nil {
		t.Fatal(err)
	}
	if parentProjection.Status != "archived" {
		t.Fatalf("归档后父投影状态应为 archived，got %q", parentProjection.Status)
	}
	if parentProjection.ChildSessionCount != 1 {
		t.Fatalf("归档后父投影的子会话数量应保留，got %d", parentProjection.ChildSessionCount)
	}

	childSession, err := mod.Get(ctx, child.ID)
	if err != nil {
		t.Fatalf("归档父会话后子会话应仍可读: %v", err)
	}
	if childSession.Archived != 0 {
		t.Fatal("归档父会话不应把子会话置为归档")
	}
	childProjection, err := mod.buildSpecProjection(ctx, child, defaultSpecTaskLimit)
	if err != nil {
		t.Fatal(err)
	}
	if childProjection.Status == "archived" {
		t.Fatal("子会话投影不应变成 archived")
	}
}

func TestChildrenHTTP(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	parent, err := mod.Create(ctx, DefaultSessionID, "父会话")
	if err != nil {
		t.Fatal(err)
	}
	child, err := mod.Create(ctx, parent.ID, "子会话")
	if err != nil {
		t.Fatal(err)
	}
	seedTaskRow(t, st, "t-child", child.ID)

	mux := http.NewServeMux()
	mod.Register(mux)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	get := func(path string) (int, map[string]any) {
		t.Helper()
		resp, err := srv.Client().Get(srv.URL + path)
		if err != nil {
			t.Fatalf("GET %s 失败: %v", path, err)
		}
		defer resp.Body.Close()
		var payload map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&payload)
		return resp.StatusCode, payload
	}

	status, payload := get("/api/sessions/" + parent.ID + "/children")
	if status != http.StatusOK {
		t.Fatalf("children 应 200，got %d body=%v", status, payload)
	}
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("children 响应 ok 应为 true: %v", payload)
	}
	if count, _ := payload["count"].(float64); count != 1 {
		t.Fatalf("children count 应为 1，got %v", payload["count"])
	}
	items, _ := payload["children"].([]any)
	if len(items) != 1 {
		t.Fatalf("children 应 1 条，got %v", payload["children"])
	}
	first, _ := items[0].(map[string]any)
	if first["id"] != child.ID || first["title"] != "子会话" {
		t.Fatalf("children 元素不对: %v", first)
	}
	if taskCount, _ := first["taskCount"].(float64); taskCount != 1 {
		t.Fatalf("children taskCount 应为 1，got %v", first["taskCount"])
	}

	status, payload = get("/api/sessions/missing/children")
	if status != http.StatusNotFound {
		t.Fatalf("不存在的会话应 404，got %d body=%v", status, payload)
	}
}
