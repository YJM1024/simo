package tasks

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
	"simo/internal/platform/workspace"
)

// TestMigrationAndMockExecutorProgress 校验 tasks 迁移到 v9，且 mock 执行器仍能推进任务。
func TestMigrationAndMockExecutorProgress(t *testing.T) {
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	events := eventlog.New(store.New(db))
	policy, err := workspace.New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatal(err)
	}
	mod := New(store.New(db), events, platformlog.Discard(), policy)
	mod.StartDelay = 10 * time.Millisecond
	mod.RunDelay = 20 * time.Millisecond
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	version, err := db.CurrentVersion(ctx, "tasks")
	if err != nil {
		t.Fatal(err)
	}
	if version != 9 {
		t.Fatalf("tasks 迁移版本应为 9，got %d", version)
	}
	// v8 的 14 列必须都在。
	rows, err := db.Query(ctx, `SELECT name FROM pragma_table_info('tasks')`)
	if err != nil {
		t.Fatal(err)
	}
	columns := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		columns[name] = true
	}
	_ = rows.Close()
	for _, name := range []string{"mode", "batch_id", "goal", "inputs_json", "constraints_json",
		"context_json", "waiting_reason", "waiting_since", "started_at", "finished_at",
		"fail_reason", "deadline_at", "deadline_reminded_at", "trigger_count"} {
		if !columns[name] {
			t.Fatalf("tasks 缺列 %s", name)
		}
	}
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = mod.Stop(context.Background()) }()
	task, err := mod.Create(ctx, coretask.NewTask{SessionID: "main", Title: "迁移后执行", Kind: "mock"})
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		current, err := mod.Get(ctx, task.ID)
		if err != nil {
			t.Fatal(err)
		}
		if current.Status == coretask.StatusDone {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("mock 执行器未完成，status=%s", current.Status)
		}
		time.Sleep(20 * time.Millisecond)
	}
}
