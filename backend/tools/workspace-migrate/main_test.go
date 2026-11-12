package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"simo/internal/platform/sqlite"
)

func setupMigrationHome(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Write(context.Background(), func(tx *sql.Tx) error {
		for _, stmt := range []string{
			`CREATE TABLE sessions(id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, created_at INTEGER, archived INTEGER)`,
			`CREATE TABLE tasks(id TEXT PRIMARY KEY, session_id TEXT, title TEXT)`,
			`CREATE TABLE task_artifacts(id TEXT PRIMARY KEY, task_id TEXT, name TEXT, rel_path TEXT, mime TEXT,
				size INTEGER, created_at INTEGER, delivery_kind TEXT, storage_scope TEXT DEFAULT 'legacy_artifacts',
				workspace_rel_path TEXT DEFAULT '')`,
			`INSERT INTO sessions(id,parent_id,title,created_at,archived) VALUES ('main','','主会话',1,0)`,
			`INSERT INTO tasks(id,session_id,title) VALUES ('task-1','main','任务')`,
			`INSERT INTO task_artifacts(id,task_id,name,rel_path,mime,size,created_at,delivery_kind)
			 VALUES ('art-user','session:main','交付.md','session-main/交付.md','text/markdown',4,1,'user_delivery')`,
			`INSERT INTO task_artifacts(id,task_id,name,rel_path,mime,size,created_at,delivery_kind)
			 VALUES ('art-int','task-1','report-attempt-1.md','task-1/report-attempt-1.md','text/markdown',4,2,'internal')`,
		} {
			if _, err := tx.ExecContext(context.Background(), stmt); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{
		filepath.Join(home, "artifacts", "session-main", "交付.md"):         "user",
		filepath.Join(home, "artifacts", "task-1", "report-attempt-1.md"): "internal",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return home, filepath.Join(home, "backup")
}

func TestMigrationToolPlanApplyVerifyRollback(t *testing.T) {
	home, backup := setupMigrationHome(t)
	plan, err := buildPlan(home)
	if err != nil {
		t.Fatal(err)
	}
	if plan.Counts["total"] != 2 || len(plan.Entries) != 2 {
		t.Fatalf("plan = %+v", plan)
	}
	for _, entry := range plan.Entries {
		if entry.Status != "ready" {
			t.Fatalf("entry not ready: %+v", entry)
		}
	}
	if err := applyPlan(home, plan, backup); err != nil {
		t.Fatal(err)
	}
	manifestRaw, err := os.ReadFile(filepath.Join(backup, "manifest.json"))
	if err != nil {
		t.Fatalf("manifest missing: %v", err)
	}
	var manifest planReport
	if err := json.Unmarshal(manifestRaw, &manifest); err != nil || len(manifest.Entries) != 2 {
		t.Fatalf("manifest = %s err=%v", manifestRaw, err)
	}
	for _, entry := range manifest.Entries {
		if entry.SourceSHA256 == "" || entry.TargetSHA256 != entry.SourceSHA256 {
			t.Fatalf("manifest hash mismatch: %+v", entry)
		}
	}
	for _, rel := range []string{"workspace/main/output/交付.md", "workspace/main/tasks/task-1/_internal/report-attempt-1.md"} {
		if _, err := os.Stat(filepath.Join(home, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("target %s missing: %v", rel, err)
		}
	}
	if _, err := os.Stat(filepath.Join(home, "artifacts", "session-main", "交付.md")); err != nil {
		t.Fatalf("old source must remain: %v", err)
	}
	if err := verifyHome(home); err != nil {
		t.Fatal(err)
	}
	if err := rollbackHome(home, backup); err != nil {
		t.Fatal(err)
	}
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var scope string
	if err := db.QueryRow(context.Background(), `SELECT storage_scope FROM task_artifacts WHERE id='art-user'`).Scan(&scope); err != nil {
		t.Fatal(err)
	}
	if scope != "legacy_artifacts" {
		t.Fatalf("rollback scope = %q", scope)
	}
}

func TestMigrationVerifyDetectsHashMismatch(t *testing.T) {
	home, backup := setupMigrationHome(t)
	plan, err := buildPlan(home)
	if err != nil {
		t.Fatal(err)
	}
	if err := applyPlan(home, plan, backup); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(home, "workspace", "main", "output", "交付.md")
	if err := os.WriteFile(target, []byte("tampered"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := verifyHome(home); err == nil {
		t.Fatalf("verify 应发现 hash mismatch")
	}
}

func TestMigrationRejectsUnsafePath(t *testing.T) {
	home, _ := setupMigrationHome(t)
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE task_artifacts SET task_id='session:../evil' WHERE id='art-user'`)
		return err
	}); err != nil {
		db.Close()
		t.Fatal(err)
	}
	db.Close()
	plan, err := buildPlan(home)
	if err != nil {
		t.Fatal(err)
	}
	unsafe := false
	for _, entry := range plan.Entries {
		if entry.Status == "unsafe-target" || entry.Status == "unsafe-source" || entry.Status == "unsafe-task" {
			unsafe = true
		}
	}
	if !unsafe {
		t.Fatalf("traversal 未被拒绝: %+v", plan.Entries)
	}
}
