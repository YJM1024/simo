package memory

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"agentd/internal/core/eventlog"
	corememory "agentd/internal/core/memory"
	"agentd/internal/core/store"
	platformlog "agentd/internal/platform/log"
	"agentd/internal/platform/sqlite"
)

func newTestMemory(t *testing.T) (*Module, *sqlite.DB) {
	t.Helper()
	db, err := sqlite.Open(filepath.Join(t.TempDir(), "agentd.db"))
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	st := store.New(db)
	events := eventlog.New(st)
	mod := New(st, events, platformlog.Discard())
	if err := db.Migrate(ctx, "memory", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	return mod, db
}

func TestMemoryV3FactConflictAndCanonical(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()
	candidate := func(content string) corememory.Candidate {
		return corememory.Candidate{
			Kind: corememory.KindFact, Scope: "global", Key: "project:codename",
			Content: content, Source: corememory.SourceUser,
			Authority: corememory.AuthorityUserConfirmed, Confidence: 0.9,
			Type: "semantic", SubType: "fact", FactKey: "project|status_of|{}",
		}
	}
	first, err := mod.Submit(ctx, candidate("项目代号是猎户座"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := mod.Submit(ctx, candidate("项目代号是天狼星"))
	if err != nil {
		t.Fatal(err)
	}
	if second.Outcome != "disputed" {
		t.Fatalf("同 factKey 不同值应 disputed: %+v", second)
	}
	var activeCount, conflictCount int
	_ = mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM memories WHERE fact_key='project|status_of|{}' AND status='active'`).Scan(&activeCount)
	_ = mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM conflicts`).Scan(&conflictCount)
	if activeCount != 1 || conflictCount < 1 {
		t.Fatalf("v0.3 冲突证据 active=%d conflict=%d", activeCount, conflictCount)
	}
	var canonicalRefs string
	_ = mod.store.QueryRow(ctx, `SELECT canonical_refs_json FROM memories WHERE id=?`, first.Item.ID).Scan(&canonicalRefs)
	if canonicalRefs == "" || canonicalRefs == "[]" {
		t.Fatalf("canonical refs 缺失: %s", canonicalRefs)
	}
	var canonicalCount int
	_ = mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM canonical_units WHERE status='ok'`).Scan(&canonicalCount)
	if canonicalCount < 2 {
		t.Fatalf("canonical 单元数 = %d", canonicalCount)
	}
}

func TestPreferenceUpdatesActiveAndOnlyContradictionDisputes(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()
	pref := func(content string) corememory.Candidate {
		return corememory.Candidate{
			Kind: corememory.KindPreference, Scope: "global", Key: "user:preference",
			Content: content, Source: corememory.SourceUser,
			Authority: corememory.AuthorityUserConfirmed, Confidence: 0.95, Importance: 8,
		}
	}
	first, err := mod.Submit(ctx, pref("喜欢咖啡"))
	if err != nil || first.Outcome != "accepted" {
		t.Fatalf("first = %+v err=%v", first, err)
	}
	updated, err := mod.Submit(ctx, pref("喜欢茶"))
	if err != nil || updated.Outcome != "merged" || updated.Item.ID != first.Item.ID {
		t.Fatalf("偏好更新应合并同一 active: %+v err=%v", updated, err)
	}
	if updated.Item.Version != 2 || updated.Item.Status != corememory.StatusActive {
		t.Fatalf("偏好版本/状态 = %+v", updated.Item)
	}
	if conflicts, _ := mod.Conflicts(ctx); len(conflicts) != 0 {
		t.Fatalf("偏好更新不应产生 disputed: %+v", conflicts)
	}
	contra, err := mod.Submit(ctx, pref("不喜欢茶"))
	if err != nil || contra.Outcome != "disputed" || contra.ConflictID == "" {
		t.Fatalf("真矛盾应 disputed: %+v err=%v", contra, err)
	}
}

func TestSubmitMergeConflictRetract(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()

	first, err := mod.Submit(ctx, corememory.Candidate{
		Kind: corememory.KindFact, Scope: "global", Key: "project.code",
		Content: "我的项目代号是 Atlas", Source: corememory.SourceUser,
		Authority: corememory.AuthorityUserConfirmed, Confidence: 0.95, Importance: 8,
		Refs: []string{"session:main"},
	})
	if err != nil || first.Outcome != "accepted" || first.Item.ID == "" {
		t.Fatalf("first submit = %+v err=%v", first, err)
	}
	if first.Item.Source != corememory.SourceUser || first.Item.Authority != corememory.AuthorityUserConfirmed {
		t.Fatalf("source/authority = %+v", first.Item)
	}
	if first.Item.Version != 1 || first.Item.Status != corememory.StatusActive {
		t.Fatalf("version/status = %+v", first.Item)
	}

	// 同 key 同内容 → 合并去重。
	dup, err := mod.Submit(ctx, corememory.Candidate{
		Kind: corememory.KindFact, Scope: "global", Key: "project.code",
		Content: "我的项目代号是 Atlas", Source: corememory.SourceUser,
		Authority: corememory.AuthorityUserConfirmed,
	})
	if err != nil || dup.Outcome != "merged" || dup.Item.ID != first.Item.ID {
		t.Fatalf("duplicate = %+v err=%v", dup, err)
	}

	// 同 key 不同内容 → 语义冲突，两条 disputed 并存。
	conflict, err := mod.Submit(ctx, corememory.Candidate{
		Kind: corememory.KindFact, Scope: "global", Key: "project.code",
		Content: "我的项目代号是 Orion", Source: corememory.SourceUser,
		Authority: corememory.AuthorityUserConfirmed,
	})
	if err != nil || conflict.Outcome != "disputed" || conflict.ConflictID == "" {
		t.Fatalf("conflict = %+v err=%v", conflict, err)
	}
	conflicts, err := mod.Conflicts(ctx)
	if err != nil || len(conflicts) != 1 || len(conflicts[0].Items) != 2 {
		t.Fatalf("conflicts = %+v err=%v", conflicts, err)
	}
	if conflicts[0].Status != corememory.StatusDisputed {
		t.Fatalf("conflict status = %q", conflicts[0].Status)
	}

	// 忘掉 → retracted，不物理删除。
	retract, err := mod.Submit(ctx, corememory.Candidate{Mode: "retract", Scope: "global", Kind: corememory.KindFact, Content: "", TargetID: first.Item.ID})
	if err != nil || retract.Outcome != "retracted" {
		t.Fatalf("retract = %+v err=%v", retract, err)
	}
	all, err := mod.Items(ctx, corememory.ItemFilter{Status: "all", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	foundRetracted := false
	for _, item := range all {
		if item.ID == first.Item.ID && item.Status == corememory.StatusRetracted {
			foundRetracted = true
		}
	}
	if !foundRetracted {
		t.Fatalf("retracted item 不在了: %+v", all)
	}
}

func TestSearchChineseTrigramAndShortLike(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()
	for _, content := range []string{
		"项目代号是蓝色记忆 Atlas",
		"另一条完全不同的内容 Zephyr",
	} {
		if _, err := mod.Submit(ctx, corememory.Candidate{
			Kind: corememory.KindFact, Scope: "global", Content: content,
			Source: corememory.SourceUser, Authority: corememory.AuthorityUserConfirmed,
		}); err != nil {
			t.Fatal(err)
		}
	}

	long, err := mod.Search(ctx, corememory.SearchRequest{Query: "蓝色记忆", Limit: 8})
	if err != nil || len(long.Items) != 1 || long.Items[0].Content == "" {
		t.Fatalf("长词检索 = %+v err=%v", long, err)
	}
	short, err := mod.Search(ctx, corememory.SearchRequest{Query: "蓝色", Limit: 8})
	if err != nil || len(short.Items) != 1 {
		t.Fatalf("2 字 LIKE 检索 = %+v err=%v", short, err)
	}
	miss, err := mod.Search(ctx, corememory.SearchRequest{Query: "Zephyr", Limit: 8})
	if err != nil || len(miss.Items) != 1 {
		t.Fatalf("英文检索 = %+v err=%v", miss, err)
	}
	other, err := mod.Search(ctx, corememory.SearchRequest{Query: "完全不同", Limit: 8})
	if err != nil || len(other.Items) != 1 {
		t.Fatalf("目标串检索 = %+v err=%v", other, err)
	}
}

func TestScopeIsolationAndTaskDoneCandidate(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()
	if _, err := mod.Submit(ctx, corememory.Candidate{
		Kind: corememory.KindProgress, Scope: "task:task-abc", Key: "task:task-abc",
		Content: "任务完成：整理报告", Source: corememory.SourceConversation,
		Authority: corememory.AuthorityInferred,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := mod.Submit(ctx, corememory.Candidate{
		Kind: corememory.KindFact, Scope: "global", Content: "全局事实",
		Source: corememory.SourceUser, Authority: corememory.AuthorityUserConfirmed,
	}); err != nil {
		t.Fatal(err)
	}
	globalOnly, err := mod.Search(ctx, corememory.SearchRequest{Query: "事实", Scopes: []string{"global"}})
	if err != nil || len(globalOnly.Items) != 1 {
		t.Fatalf("global scope = %+v err=%v", globalOnly, err)
	}
	taskOnly, err := mod.Search(ctx, corememory.SearchRequest{Query: "报告", Scopes: []string{"task:task-abc"}})
	if err != nil || len(taskOnly.Items) != 1 {
		t.Fatalf("task scope = %+v err=%v", taskOnly, err)
	}
	missing, err := mod.Search(ctx, corememory.SearchRequest{Query: "", Scopes: []string{"task:nope"}})
	if err != nil || len(missing.Items) != 0 {
		t.Fatalf("不存在的 task scope 应空: %+v err=%v", missing, err)
	}
}

func TestTaskDoneEventWritesProgress(t *testing.T) {
	mod, db := newTestMemory(t)
	defer db.Close()
	ctx := context.Background()
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = mod.Stop(context.Background()) }()
	events := mod.events
	if _, err := events.Append(ctx, eventlog.TypeTaskCreated, map[string]any{"id": "task-1", "title": "整理报告", "status": "queued"}); err != nil {
		t.Fatal(err)
	}
	if _, err := events.Append(ctx, eventlog.TypeTaskUpdated, map[string]any{"id": "task-1", "status": "done", "summary": "Mock 执行器完成：整理报告"}); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		items, err := mod.Items(ctx, corememory.ItemFilter{Scope: "task:task-1", Status: "all"})
		if err != nil {
			t.Fatal(err)
		}
		if len(items) == 1 && items[0].Kind == corememory.KindProgress {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("Task done 未生成 progress 记忆")
}
