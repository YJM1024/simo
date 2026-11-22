package chat

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"simo/internal/core/store"
	"simo/internal/platform/sqlite"
)

// newUnreadTestModule 建一个只含 chat 迁移的库，并补上 sessions 表（生产里由 sessions
// 模块迁移创建；chat 迁移把 session_read_cursors 建在它上面）。
func newUnreadTestModule(t *testing.T) (*Module, *sqlite.DB, context.Context) {
	t.Helper()
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	if err := db.Migrate(ctx, "chat", migrations()); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE sessions (
			id TEXT PRIMARY KEY,
			parent_id TEXT NOT NULL DEFAULT '',
			title TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL DEFAULT 0,
			archived INTEGER NOT NULL DEFAULT 0,
			pinned INTEGER NOT NULL DEFAULT 0,
			owner_agent_id TEXT NOT NULL DEFAULT ''
		)`)
		return err
	}); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	return New(store.New(db), nil, nil, nil, nil, nil, nil, Options{}), db, ctx
}

func insertTestSession(t *testing.T, db *sqlite.DB, ctx context.Context, id string) {
	t.Helper()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO sessions(id, parent_id, title, created_at)
			VALUES (?, ?, ?, ?)`, id, "main", "会话-"+id, 1)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func insertTestMessage(t *testing.T, db *sqlite.DB, ctx context.Context, id, sessionID, role string, at int64, internal int) {
	t.Helper()
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO messages(id, session_id, role, text, at, status, internal)
			VALUES (?, ?, ?, ?, ?, 'done', ?)`, id, sessionID, role, "正文-"+id, at, internal)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func readTestCursor(t *testing.T, db *sqlite.DB, ctx context.Context, sessionID string) (int64, string, bool) {
	t.Helper()
	var at int64
	var messageID sql.NullString
	err := db.QueryRow(ctx, `SELECT last_read_at, last_read_message_id
		FROM session_read_cursors WHERE session_id = ?`, sessionID).Scan(&at, &messageID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, "", false
	}
	if err != nil {
		t.Fatal(err)
	}
	return at, messageID.String, true
}

func unreadIDs(t *testing.T, mod *Module, ctx context.Context) map[string]bool {
	t.Helper()
	flags, err := mod.UnreadSessionIDs(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return flags
}

// ①agent 消息后未读；②标记已读后清除且重复调用幂等；③重启同库后仍未读=false；④读 main 不影响 other。
func TestUnreadMarkReadIdempotentAndPersistsAcrossRestart(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	insertTestSession(t, db, ctx, "main")
	insertTestSession(t, db, ctx, "other")

	if flags := unreadIDs(t, mod, ctx); len(flags) != 0 {
		t.Fatalf("新库不应有未读: %v", flags)
	}
	// 无消息的会话没有可推进的断点：不写游标、不报错。
	if err := mod.MarkSessionRead(ctx, "main"); err != nil {
		t.Fatalf("空会话标记已读 err=%v", err)
	}
	if _, _, ok := readTestCursor(t, db, ctx, "main"); ok {
		t.Fatalf("空会话不应写游标")
	}

	insertTestMessage(t, db, ctx, "u-main", "main", RoleUser, 1000, 0)
	insertTestMessage(t, db, ctx, "a-main", "main", RoleAgent, 2000, 0)
	insertTestMessage(t, db, ctx, "a-other", "other", RoleAgent, 2000, 0)
	if flags := unreadIDs(t, mod, ctx); !flags["main"] || !flags["other"] {
		t.Fatalf("agent 消息后应未读: %v", flags)
	}

	// 读 main → 只有 main 清除；other 保持未读（④）。
	if err := mod.MarkSessionRead(ctx, "main"); err != nil {
		t.Fatal(err)
	}
	if flags := unreadIDs(t, mod, ctx); flags["main"] || !flags["other"] {
		t.Fatalf("读 main 后未读集合 = %v（want other）", flags)
	}
	at, messageID, ok := readTestCursor(t, db, ctx, "main")
	if !ok || at != 2000 || messageID != "a-main" {
		t.Fatalf("游标 = (%d, %q, ok=%v)", at, messageID, ok)
	}

	// ②重复调用幂等：游标不变、事件不重复、未读状态不变。
	if err := mod.MarkSessionRead(ctx, "main"); err != nil {
		t.Fatal(err)
	}
	if at2, messageID2, _ := readTestCursor(t, db, ctx, "main"); at2 != at || messageID2 != messageID {
		t.Fatalf("重复标记已读改了游标: (%d,%q) -> (%d,%q)", at, messageID, at2, messageID2)
	}
	if flags := unreadIDs(t, mod, ctx); flags["main"] || !flags["other"] {
		t.Fatalf("重复标记后未读集合 = %v", flags)
	}

	// ③重启进程（同库文件）后已读状态仍在。
	dbPath := db.Path()
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close() }()
	if err := reopened.Migrate(ctx, "chat", migrations()); err != nil {
		t.Fatal(err)
	}
	restarted := New(store.New(reopened), nil, nil, nil, nil, nil, nil, Options{})
	if flags := unreadIDs(t, restarted, ctx); flags["main"] || !flags["other"] {
		t.Fatalf("重启后未读集合 = %v（want other）", flags)
	}

	// other 也读掉后全部已读；再加入新 agent 消息才重新未读。
	if err := restarted.MarkSessionRead(ctx, "other"); err != nil {
		t.Fatal(err)
	}
	if flags := unreadIDs(t, restarted, ctx); len(flags) != 0 {
		t.Fatalf("全部已读后仍有未读: %v", flags)
	}
	insertTestMessage(t, reopened, ctx, "a-other-2", "other", RoleAgent, 3000, 0)
	if flags := unreadIDs(t, restarted, ctx); !flags["other"] || flags["main"] {
		t.Fatalf("新 agent 消息只应让 other 未读: %v", flags)
	}
}

// ⑤乱序/回退请求不回退游标；相等也不重写（幂等）。
func TestMarkReadAtNeverRegresses(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	insertTestSession(t, db, ctx, "main")

	if changed, err := mod.markReadAt(ctx, "main", 5000, "m5"); err != nil || !changed {
		t.Fatalf("首次推进 changed=%v err=%v", changed, err)
	}
	if changed, err := mod.markReadAt(ctx, "main", 3000, "m3"); err != nil || changed {
		t.Fatalf("回退请求应无效: changed=%v err=%v", changed, err)
	}
	if at, id, _ := readTestCursor(t, db, ctx, "main"); at != 5000 || id != "m5" {
		t.Fatalf("回退后游标 = (%d,%q)", at, id)
	}
	if changed, err := mod.markReadAt(ctx, "main", 5000, "m5-dup"); err != nil || changed {
		t.Fatalf("相等游标不应重写: changed=%v err=%v", changed, err)
	}
	if at, id, _ := readTestCursor(t, db, ctx, "main"); at != 5000 || id != "m5" {
		t.Fatalf("相等请求后游标 = (%d,%q)", at, id)
	}
	if changed, err := mod.markReadAt(ctx, "main", 6000, "m6"); err != nil || !changed {
		t.Fatalf("前进 changed=%v err=%v", changed, err)
	}
	if at, id, _ := readTestCursor(t, db, ctx, "main"); at != 6000 || id != "m6" {
		t.Fatalf("前进后游标 = (%d,%q)", at, id)
	}
}

// 用户自己发的消息、以及隐藏（internal=1）的 agent 消息都不产生未读。
func TestUnreadIgnoresUserAndHiddenMessages(t *testing.T) {
	mod, db, ctx := newUnreadTestModule(t)
	insertTestSession(t, db, ctx, "user-only")
	insertTestSession(t, db, ctx, "hidden-agent")

	insertTestMessage(t, db, ctx, "u1", "user-only", RoleUser, 1000, 0)
	insertTestMessage(t, db, ctx, "u2", "user-only", RoleUser, 2000, 0)
	insertTestMessage(t, db, ctx, "h1", "hidden-agent", RoleAgent, 2000, 1)

	if flags := unreadIDs(t, mod, ctx); len(flags) != 0 {
		t.Fatalf("用户消息/隐藏消息不应未读: %v", flags)
	}
}
