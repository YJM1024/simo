package tasks

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"simo/internal/platform/sqlite"
)

func TestMigrationClassifiesLegacyArtifacts(t *testing.T) {
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	// 先套用 v1..v5 模拟旧库，再插入历史产物，最后升级到 v6。
	if err := db.Migrate(ctx, "tasks", migrations()[:5]); err != nil {
		t.Fatal(err)
	}
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`INSERT INTO task_artifacts(id,task_id,name,rel_path,mime,size,created_at)
			 VALUES ('old-user','session:main','交付.pdf','main/交付.pdf','application/pdf',1,1)`,
			`INSERT INTO task_artifacts(id,task_id,name,rel_path,mime,size,created_at)
			 VALUES ('old-report','task-1','report-attempt-1.md','task-1/report-attempt-1.md','text/markdown',1,1)`,
		} {
			if _, err := tx.ExecContext(ctx, stmt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", migrations()); err != nil {
		t.Fatal(err)
	}
	rows, err := db.Query(ctx, `SELECT id, delivery_kind FROM task_artifacts ORDER BY id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]string{}
	for rows.Next() {
		var id, kind string
		if err := rows.Scan(&id, &kind); err != nil {
			t.Fatal(err)
		}
		got[id] = kind
	}
	if got["old-user"] != "user_delivery" || got["old-report"] != "internal" {
		t.Fatalf("历史产物分类 = %+v", got)
	}
}
