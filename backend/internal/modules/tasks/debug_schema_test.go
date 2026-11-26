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

func TestDebugSchemaAndProgress(t *testing.T) {
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
	version, _ := db.CurrentVersion(ctx, "tasks")
	t.Logf("tasks migration version=%d", version)
	rows, err := db.Query(ctx, `SELECT name FROM pragma_table_info('tasks') ORDER BY cid`)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for rows.Next() {
		var name string
		_ = rows.Scan(&name)
		names = append(names, name)
	}
	_ = rows.Close()
	t.Logf("columns=%v", names)

	now := time.Now().UnixMilli()
	stale := coretask.Task{ID: "task-stale", SessionID: "main", Title: "stale", Kind: "mock",
		Status: coretask.StatusRunning, Phases: defaultPhases(), Steps: defaultSteps(),
		Progress: 2, Attempt: 1, CreatedAt: now, UpdatedAt: now}
	if err := mod.saveTask(ctx, stale); err != nil {
		t.Fatal(err)
	}
	task, err := mod.Create(ctx, coretask.NewTask{SessionID: "main", Title: "t", Kind: "mock"})
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("created status=%s", task.Status)
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Logf("stale after start=%v", func() string { s, _ := mod.getTask(ctx, "task-stale"); return s.Status }())
	time.Sleep(200 * time.Millisecond)
	got, err := mod.Get(ctx, task.ID)
	t.Logf("after 200ms status=%s progress=%d err=%v", got.Status, got.Progress, err)
	t.Logf("direct save err=%v", mod.saveTask(ctx, got))
	_ = mod.Stop(context.Background())
}
