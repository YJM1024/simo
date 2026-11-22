package chat

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"simo/internal/platform/sqlite"
)

func TestMigrationBackfillsUsageTurnMetrics(t *testing.T) {
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	all := migrations()
	if err := db.Migrate(ctx, "chat", all[:20]); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`CREATE TABLE events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL)`,
			`INSERT INTO messages(id,session_id,role,text,at,status) VALUES ('reply-legacy','main','agent','历史回复',1000,'done')`,
			`INSERT INTO events(at,type,payload) VALUES (1001,'usage.recorded',
				'{"replyId":"reply-legacy","sessionId":"main","usage":{"promptTokens":10,"completionTokens":20,"reasoningTokens":5,"totalTokens":35,"model":"deepseek-flash"}}')`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "chat", all); err != nil {
		t.Fatal(err)
	}
	var source, model string
	var prompt, completion, reasoning, total int64
	if err := db.QueryRow(ctx, `SELECT source, model, prompt_tokens, completion_tokens, reasoning_tokens, total_tokens
		FROM turn_metrics WHERE reply_id='reply-legacy'`).
		Scan(&source, &model, &prompt, &completion, &reasoning, &total); err != nil {
		t.Fatal(err)
	}
	if source != "backfill" || model != "deepseek-flash" || prompt != 10 || completion != 20 || reasoning != 5 || total != 35 {
		t.Fatalf("backfill = source=%s model=%s tokens=%d/%d/%d/%d", source, model, prompt, completion, reasoning, total)
	}
}

// 迁移升级：v22 → v23 只新增 session_read_cursors 与索引，不破坏既有消息数据。
func TestMigrationSessionReadCursorsUpgradeFromV22(t *testing.T) {
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	all := migrations()
	if len(all) < 23 {
		t.Fatalf("migrations = %d, want >= 23", len(all))
	}
	if err := db.Migrate(ctx, "chat", all[:22]); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`CREATE TABLE sessions(id TEXT PRIMARY KEY)`,
			`INSERT INTO sessions(id) VALUES ('main')`,
			`INSERT INTO messages(id,session_id,role,text,at,status) VALUES ('legacy-user','main','user','旧用户消息',1000,'done')`,
			`INSERT INTO messages(id,session_id,role,text,at,status) VALUES ('legacy-agent','main','agent','旧回复',2000,'done')`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "chat", all); err != nil {
		t.Fatal(err)
	}

	// 既有数据原样保留。
	var text string
	if err := db.QueryRow(ctx, `SELECT text FROM messages WHERE id = 'legacy-agent'`).Scan(&text); err != nil || text != "旧回复" {
		t.Fatalf("迁移后 agent 消息 = %q err=%v", text, err)
	}
	// 新表与新索引都存在。
	var count int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='session_read_cursors'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("session_read_cursors 表 count=%d err=%v", count, err)
	}
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_session_read_cursors_updated'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("idx_session_read_cursors_updated count=%d err=%v", count, err)
	}
	// 外键指向 sessions：能写入合法会话，写入不存在的会话被拒。
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO session_read_cursors(session_id, last_read_at, last_read_message_id, updated_at)
			VALUES ('main', 2000, 'legacy-agent', '2026-01-01T00:00:00Z')`)
		return err
	}); err != nil {
		t.Fatalf("写入游标失败: %v", err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO session_read_cursors(session_id, last_read_at, updated_at)
			VALUES ('missing', 1, '2026-01-01T00:00:00Z')`)
		return err
	}); err == nil {
		t.Fatalf("外键应拒绝不存在的会话")
	}
}

func TestMigrationHidesLegacyInternalControlMessages(t *testing.T) {
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	all := migrations()
	if len(all) < 19 {
		t.Fatalf("migrations = %d", len(all))
	}
	if err := db.Migrate(ctx, "chat", all[:18]); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`INSERT INTO messages(id,session_id,role,text,at,status)
			 VALUES ('legacy-card','main','user','[卡片操作] cardId=x actionId=submit','1','done')`,
			`INSERT INTO messages(id,session_id,role,text,at,status)
			 VALUES ('legacy-system','main','user','[系统] 帮我整理报告','2','done')`,
			`INSERT INTO messages(id,session_id,role,text,at,status)
			 VALUES ('normal-user','main','user','正常用户消息','3','done')`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "chat", all); err != nil {
		t.Fatal(err)
	}
	rows, err := db.Query(ctx, `SELECT id, internal FROM messages ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]int{}
	for rows.Next() {
		var id string
		var internal int
		if err := rows.Scan(&id, &internal); err != nil {
			t.Fatal(err)
		}
		got[id] = internal
	}
	if got["legacy-card"] != 1 || got["legacy-system"] != 1 || got["normal-user"] != 0 {
		t.Fatalf("legacy internal flags = %+v", got)
	}
}
