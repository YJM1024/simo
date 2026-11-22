package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"simo/internal/core/store"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
)

type pinErrorBody struct {
	OK       bool     `json:"ok"`
	Error    string   `json:"error"`
	Code     string   `json:"code"`
	Blockers []string `json:"blockers"`
}

func postPin(t *testing.T, url string) (int, pinErrorBody) {
	t.Helper()
	resp, err := http.Post(url, "application/json", strings.NewReader(""))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = resp.Body.Close() }()
	var body pinErrorBody
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("%s 响应不是 JSON: %v", url, err)
	}
	return resp.StatusCode, body
}

// 归档会话只读：置顶与取消置顶都返回 ErrArchived，pinned 值保持不变；解归档后恢复可用。
func TestSetPinnedRejectsArchivedSession(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	pinnedFirst, err := mod.Create(ctx, DefaultSessionID, "先置顶再归档")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mod.SetPinned(ctx, pinnedFirst.ID, true); err != nil {
		t.Fatalf("置顶: %v", err)
	}
	if _, err := mod.Archive(ctx, pinnedFirst.ID); err != nil {
		t.Fatalf("归档: %v", err)
	}
	if _, err := mod.SetPinned(ctx, pinnedFirst.ID, false); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档会话取消置顶 err = %v, want ErrArchived", err)
	}
	got, err := mod.Get(ctx, pinnedFirst.ID)
	if err != nil || !got.Pinned || got.Archived != 1 {
		t.Fatalf("归档会话取消置顶后 = %+v err=%v, want pinned=true archived=1", got, err)
	}

	neverPinned, err := mod.Create(ctx, DefaultSessionID, "归档后再置顶")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Archive(ctx, neverPinned.ID); err != nil {
		t.Fatalf("归档: %v", err)
	}
	if _, err := mod.SetPinned(ctx, neverPinned.ID, true); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档会话置顶 err = %v, want ErrArchived", err)
	}
	if got, err := mod.Get(ctx, neverPinned.ID); err != nil || got.Pinned {
		t.Fatalf("归档会话置顶后 = %+v err=%v, want pinned=false", got, err)
	}

	if _, err := mod.Unarchive(ctx, neverPinned.ID); err != nil {
		t.Fatalf("解归档: %v", err)
	}
	if pinned, err := mod.SetPinned(ctx, neverPinned.ID, true); err != nil || !pinned.Pinned {
		t.Fatalf("解归档后置顶 = %+v err=%v, want pinned=true", pinned, err)
	}
}

// 归档拒绝走既有错误信封：409 + code=session_archived + blockers 可读原因，不是 500。
func TestPinArchivedSessionHTTPConflict(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	session, err := mod.Create(ctx, DefaultSessionID, "归档置顶冲突")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Archive(ctx, session.ID); err != nil {
		t.Fatalf("归档: %v", err)
	}

	mux := http.NewServeMux()
	mod.registerHTTP(mux)
	ts := httptest.NewServer(mux)
	defer ts.Close()

	for _, path := range []string{"/pin", "/unpin"} {
		status, body := postPin(t, ts.URL+"/api/sessions/"+session.ID+path)
		if status != http.StatusConflict {
			t.Fatalf("%s status = %d, want 409", path, status)
		}
		if body.OK || body.Code != "session_archived" || body.Error == "" {
			t.Fatalf("%s body = %+v, want ok=false code=session_archived 且有 error", path, body)
		}
		if len(body.Blockers) == 0 || strings.TrimSpace(body.Blockers[0]) == "" {
			t.Fatalf("%s blockers = %v, want 非空可读原因", path, body.Blockers)
		}
	}

	if _, err := mod.Unarchive(ctx, session.ID); err != nil {
		t.Fatalf("解归档: %v", err)
	}
	if status, body := postPin(t, ts.URL+"/api/sessions/"+session.ID+"/pin"); status != http.StatusOK || !body.OK {
		t.Fatalf("解归档后置顶 status=%d body=%+v, want 200 ok=true", status, body)
	}
	if got, err := mod.Get(ctx, session.ID); err != nil || !got.Pinned {
		t.Fatalf("解归档后置顶 = %+v err=%v, want pinned=true", got, err)
	}
}

// G15：置顶状态与同级顺序在进程重启后保持（重新打开同一个 sqlite 文件）。
func TestPinnedPersistsAcrossRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "simo.db")
	ctx := context.Background()

	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	mod := New(store.New(db), platformlog.Discard())
	if err := db.Migrate(ctx, "sessions", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	st := store.New(db)
	old := createWithCreatedAt(t, mod, st, DefaultSessionID, "旧", 1_000)
	mid := createWithCreatedAt(t, mod, st, DefaultSessionID, "中", 2_000)
	newer := createWithCreatedAt(t, mod, st, DefaultSessionID, "新", 3_000)
	if _, err := mod.SetPinned(ctx, mid.ID, true); err != nil {
		t.Fatalf("置顶: %v", err)
	}
	_ = db.Close()

	db2, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer db2.Close()
	mod2 := New(store.New(db2), platformlog.Discard())
	if err := db2.Migrate(ctx, "sessions", mod2.Migrations()); err != nil {
		t.Fatal(err)
	}

	got, err := mod2.Get(ctx, mid.ID)
	if err != nil || !got.Pinned {
		t.Fatalf("重启后 = %+v err=%v, want pinned=true", got, err)
	}
	tree, err := mod2.Tree(ctx)
	if err != nil {
		t.Fatalf("重启后 Tree: %v", err)
	}
	var children []Session
	for _, root := range tree {
		if root.ID == DefaultSessionID {
			children = root.Children
		}
	}
	assertIDs(t, "重启后兄弟顺序", childIDs(children), mid.ID, newer.ID, old.ID)

	var pinnedCount int
	if err := store.New(db2).QueryRow(ctx, `SELECT COUNT(*) FROM sessions WHERE pinned = 1`).Scan(&pinnedCount); err != nil {
		t.Fatal(err)
	}
	if pinnedCount != 1 {
		t.Fatalf("重启后 pinned=1 行数 = %d, want 1", pinnedCount)
	}
}
