package chat

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"simo/internal/platform/sqlite"
)

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
