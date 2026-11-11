package sessions

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"database/sql"
	corespec "simo/internal/core/spec"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
)

type fakeTasks struct{ tasks []coretask.Task }

func (f *fakeTasks) Create(context.Context, coretask.NewTask) (coretask.Task, error) {
	return coretask.Task{}, nil
}
func (f *fakeTasks) List(context.Context, string) ([]coretask.Task, error) {
	return f.tasks, nil
}

func (f *fakeTasks) Get(_ context.Context, id string) (coretask.Task, error) {
	for _, task := range f.tasks {
		if task.ID == id {
			return task, nil
		}
	}
	return coretask.Task{}, errors.New("task not found")
}

func newTestSessions(t *testing.T) (*Module, *store.Store, *sqlite.DB) {
	t.Helper()
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	mod := New(store.New(db), platformlog.Discard())
	if err := db.Migrate(ctx, "sessions", mod.Migrations()); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	return mod, store.New(db), db
}

func TestTreeCreateRenameAndDescendants(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	a, err := mod.Create(ctx, DefaultSessionID, "子需求 A")
	if err != nil {
		t.Fatal(err)
	}
	if a.ParentID != DefaultSessionID {
		t.Fatalf("parent = %q", a.ParentID)
	}
	b, err := mod.Create(ctx, a.ID, "孙需求 B")
	if err != nil {
		t.Fatal(err)
	}
	tree, err := mod.Tree(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 1 || tree[0].ID != DefaultSessionID || len(tree[0].Children) != 1 {
		t.Fatalf("tree = %+v", tree)
	}
	if len(tree[0].Children[0].Children) != 1 || tree[0].Children[0].Children[0].ID != b.ID {
		t.Fatalf("grandchild missing: %+v", tree)
	}

	ids, err := mod.DescendantIDs(ctx, DefaultSessionID, 0)
	if err != nil || len(ids) != 3 {
		t.Fatalf("descendants = %v err=%v", ids, err)
	}
	depth1, err := mod.DescendantIDs(ctx, DefaultSessionID, 1)
	if err != nil || len(depth1) != 2 {
		t.Fatalf("depth=1 descendants = %v err=%v", depth1, err)
	}

	renamed, err := mod.Rename(ctx, b.ID, "改名后 B")
	if err != nil || renamed.Title != "改名后 B" {
		t.Fatalf("rename = %+v err=%v", renamed, err)
	}
	if _, err := mod.Get(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Get(ctx, "sess-no-such"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown Get err = %v", err)
	}

	// 人为制造环：A.parent=B, B.parent=A；tree/descendants 不得死循环。
	if err := st.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE sessions SET parent_id = ? WHERE id = ?`, b.ID, a.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET parent_id = ? WHERE id = ?`, a.ID, b.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Tree(ctx); err != nil {
		t.Fatalf("cycle tree err=%v", err)
	}
	cycleIDs, err := mod.DescendantIDs(ctx, a.ID, 16)
	if err != nil || len(cycleIDs) != 2 {
		t.Fatalf("cycle descendants = %v err=%v", cycleIDs, err)
	}
}

func TestArchiveAndSpecPersistAcrossRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "simo.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	mod := New(store.New(db), platformlog.Discard())
	if err := db.Migrate(ctx, "sessions", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	session, err := mod.Create(ctx, DefaultSessionID, "持久归档")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Archive(ctx, session.ID); err != nil {
		t.Fatal(err)
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
	got, err := mod2.Get(ctx, session.ID)
	if err != nil || got.Archived != 1 {
		t.Fatalf("重启后 archived = %+v err=%v", got, err)
	}
	spec, err := mod2.GetBySession(ctx, session.ID)
	if err != nil || spec.Status != corespec.StatusArchived {
		t.Fatalf("重启后 spec = %+v err=%v", spec, err)
	}
}

func TestArchiveReadonlyAndCanArchiveGate(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	session, err := mod.Create(ctx, DefaultSessionID, "归档测试")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := mod.GetBySession(ctx, session.ID); err != nil {
		t.Fatalf("创建会话应自动建 spec: %v", err)
	}
	// 无任务、无验收键 → 允许归档。
	archived, err := mod.Archive(ctx, session.ID)
	if err != nil || archived.Archived != 1 {
		t.Fatalf("archive = %+v err=%v", archived, err)
	}
	if _, err := mod.Rename(ctx, session.ID, "不能改"); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档后 rename err = %v", err)
	}
	if _, err := mod.Create(ctx, session.ID, "子会话"); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档会话下建子会话 err = %v", err)
	}
	unarchived, err := mod.Unarchive(ctx, session.ID)
	if err != nil || unarchived.Archived != 0 {
		t.Fatalf("unarchive = %+v err=%v", unarchived, err)
	}
	if _, err := mod.Rename(ctx, session.ID, "可以改"); err != nil {
		t.Fatalf("unarchive 后 rename err=%v", err)
	}

	// 有运行中任务 + 缺证据 → 409 blockers。
	mod.tasks = &fakeTasks{tasks: []coretask.Task{{ID: "task-1", Status: coretask.StatusRunning}}}
	if err := mod.updateSpec(ctx, session.ID, func(spec *corespec.Spec) {
		spec.AcceptanceKeys = []string{"task:task-1"}
		spec.Evidence = []string{}
	}); err != nil {
		t.Fatal(err)
	}
	_, err = mod.Archive(ctx, session.ID)
	var blockers *ArchiveBlockersError
	if !errors.As(err, &blockers) || len(blockers.Blockers) < 2 {
		t.Fatalf("archive gate err=%v blockers=%+v", err, blockers)
	}
	// 任务完成 + 证据 → 允许归档。
	mod.tasks = &fakeTasks{tasks: []coretask.Task{{ID: "task-1", Status: coretask.StatusDone}}}
	if err := mod.updateSpec(ctx, session.ID, func(spec *corespec.Spec) {
		spec.Evidence = []string{"task:task-1"}
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Archive(ctx, session.ID); err != nil {
		t.Fatalf("完成任务后 archive err=%v", err)
	}
}
