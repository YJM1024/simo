package tasks

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"agentd/internal/core/eventlog"
	"agentd/internal/core/store"
	coretask "agentd/internal/core/task"
	platformlog "agentd/internal/platform/log"
	"agentd/internal/platform/sqlite"
	"agentd/internal/platform/workspace"
)

func TestPhasesCancelRetryArtifacts(t *testing.T) {
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "agentd.db"))
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
	mod.RunDelay = 40 * time.Millisecond
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = mod.Stop(context.Background()) }()

	task, err := mod.Create(ctx, coretask.NewTask{SessionID: "main", Title: "长任务", Kind: "mock"})
	if err != nil {
		t.Fatal(err)
	}
	if len(task.Phases) == 0 || len(task.Steps) == 0 {
		t.Fatalf("缺少 phases/steps: %+v", task)
	}
	// 等到进入 running 再取消，验证保留阶段信息。
	deadline := time.Now().Add(2 * time.Second)
	for {
		current, err := mod.Get(ctx, task.ID)
		if err != nil {
			t.Fatal(err)
		}
		if current.Status == coretask.StatusRunning || current.Status == coretask.StatusDone {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("任务未进入 running: %+v", current)
		}
		time.Sleep(5 * time.Millisecond)
	}
	cancelled, err := mod.Cancel(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cancelled.Status != coretask.StatusCancelled {
		t.Fatalf("cancel status = %q task=%+v", cancelled.Status, cancelled)
	}
	retried, err := mod.Retry(ctx, task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if retried.Attempt < 2 {
		t.Fatalf("retry attempt = %d", retried.Attempt)
	}
	deadline = time.Now().Add(3 * time.Second)
	for {
		current, err := mod.Get(ctx, task.ID)
		if err != nil {
			t.Fatal(err)
		}
		if current.Status == coretask.StatusDone {
			if current.Progress != 100 || len(current.Artifacts) == 0 {
				t.Fatalf("done task = %+v", current)
			}
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("retry 未完成: %+v", current)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestRecoverInterruptedOnStart(t *testing.T) {
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "agentd.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	events := eventlog.New(store.New(db))
	mod := New(store.New(db), events, platformlog.Discard(), nil)
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	stale := coretask.Task{
		ID: "task-stale", SessionID: "main", Title: "中断任务", Kind: "mock",
		Status: coretask.StatusRunning, Phases: defaultPhases(), Steps: defaultSteps(),
		Progress: 2, Attempt: 1, CreatedAt: now, UpdatedAt: now,
	}
	// 模拟上次进程崩溃时留下的 running 行。
	if err := mod.saveTask(ctx, stale); err != nil {
		t.Fatal(err)
	}
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = mod.Stop(context.Background()) }()
	current, err := mod.Get(ctx, stale.ID)
	if err != nil {
		t.Fatal(err)
	}
	if current.Status != coretask.StatusInterrupted {
		t.Fatalf("重启后 running 任务未标记 interrupted: %+v", current)
	}
}

func TestCreateAndMockExecutorCompletes(t *testing.T) {
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "agentd.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	st := store.New(db)
	events := eventlog.New(st)
	mod := New(st, events, platformlog.Discard(), nil)
	mod.StartDelay = 5 * time.Millisecond
	mod.RunDelay = 5 * time.Millisecond
	if err := db.Migrate(ctx, "tasks", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = mod.Stop(context.Background()) }()

	for i := 0; i < 3; i++ {
		if _, err := mod.Create(ctx, coretask.NewTask{SessionID: "main", Title: "任务", Kind: "mock"}); err != nil {
			t.Fatalf("Create: %v", err)
		}
	}

	deadline := time.Now().Add(3 * time.Second)
	for {
		list, err := mod.List(ctx, "main")
		if err != nil {
			t.Fatal(err)
		}
		done := 0
		for _, task := range list {
			if task.Status == coretask.StatusDone {
				done++
			}
		}
		if done == 3 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("任务未完成: %+v", list)
		}
		time.Sleep(10 * time.Millisecond)
	}

	replay, err := events.Replay(ctx, 0)
	if err != nil {
		t.Fatal(err)
	}
	created, updated := 0, 0
	for _, ev := range replay {
		switch ev.Type {
		case eventlog.TypeTaskCreated:
			created++
		case eventlog.TypeTaskUpdated:
			updated += 2 // running + done
		}
	}
	if created != 3 {
		t.Fatalf("task.created = %d, want 3", created)
	}
	if updated < 6 {
		t.Fatalf("task.updated = %d, want >=6", updated)
	}
}
