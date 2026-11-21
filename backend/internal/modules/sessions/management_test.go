package sessions

// P1-CONV 会话管理（搜索/置顶/负责人/改名/后代遍历）单元契约测试。
// 覆盖 AC-CONV-002（会话生命周期）、AC-CONV-003（搜索与置顶）的后端断言，
// 补齐 service_test.go 未覆盖的管理 API 与深度限幅边界。

import (
	"context"
	"errors"
	"testing"

	coreagent "simo/internal/core/agent"
)

func p1BoolPtr(value bool) *bool { return &value }

func p1SessionIDsOf(list []Session) []string {
	out := make([]string, 0, len(list))
	for _, session := range list {
		out = append(out, session.ID)
	}
	return out
}

func p1ContainsSession(list []Session, id string) bool {
	for _, session := range list {
		if session.ID == id {
			return true
		}
	}
	return false
}

func p1MustSession(t *testing.T, mod *Module, id string) Session {
	t.Helper()
	session, err := mod.Get(context.Background(), id)
	if err != nil {
		t.Fatalf("Get(%q) 失败: %v", id, err)
	}
	return session
}

// TestSearchSessionsQueryAndPinnedOrder 覆盖 AC-CONV-003-01：标题模糊搜索、置顶过滤、
// 置顶优先排序（ORDER BY pinned DESC, created_at DESC, id DESC）。
func TestSearchSessionsQueryAndPinnedOrder(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	alpha, err := mod.Create(ctx, DefaultSessionID, "Alpha 需求会话")
	if err != nil {
		t.Fatalf("create alpha: %v", err)
	}
	beta, err := mod.Create(ctx, DefaultSessionID, "Beta 需求会话")
	if err != nil {
		t.Fatalf("create beta: %v", err)
	}
	gamma, err := mod.Create(ctx, DefaultSessionID, "Gamma 需求会话")
	if err != nil {
		t.Fatalf("create gamma: %v", err)
	}

	all, err := mod.SearchSessions(ctx, "", nil)
	if err != nil {
		t.Fatalf("search all: %v", err)
	}
	for _, id := range []string{DefaultSessionID, alpha.ID, beta.ID, gamma.ID} {
		if !p1ContainsSession(all, id) {
			t.Fatalf("无条件搜索缺少会话 %s: %v", id, p1SessionIDsOf(all))
		}
	}

	filtered, err := mod.SearchSessions(ctx, "需求", nil)
	if err != nil {
		t.Fatalf("search 需求: %v", err)
	}
	if len(filtered) != 3 {
		t.Fatalf("标题含“需求”的会话应 3 个，实际 %v", p1SessionIDsOf(filtered))
	}
	if p1ContainsSession(filtered, DefaultSessionID) {
		t.Fatalf("主会话标题不含“需求”，不应命中: %v", p1SessionIDsOf(filtered))
	}

	byAlpha, err := mod.SearchSessions(ctx, "Alpha", nil)
	if err != nil {
		t.Fatalf("search Alpha: %v", err)
	}
	if len(byAlpha) != 1 || byAlpha[0].ID != alpha.ID {
		t.Fatalf("搜索 Alpha = %v, want [%s]", p1SessionIDsOf(byAlpha), alpha.ID)
	}

	none, err := mod.SearchSessions(ctx, "不存在的标题片段", nil)
	if err != nil {
		t.Fatalf("search miss: %v", err)
	}
	if len(none) != 0 {
		t.Fatalf("未命中应返回空列表，实际 %v", p1SessionIDsOf(none))
	}

	// 搜索词首尾空白应被裁剪（与 HTTP q 参数行为一致）。
	padded, err := mod.SearchSessions(ctx, "  Beta  ", nil)
	if err != nil {
		t.Fatalf("search padded: %v", err)
	}
	if len(padded) != 1 || padded[0].ID != beta.ID {
		t.Fatalf("裁剪空白后搜索 Beta = %v", p1SessionIDsOf(padded))
	}

	if _, err := mod.SetPinned(ctx, beta.ID, true); err != nil {
		t.Fatalf("pin beta: %v", err)
	}
	pinnedOnly, err := mod.SearchSessions(ctx, "", p1BoolPtr(true))
	if err != nil {
		t.Fatalf("search pinned: %v", err)
	}
	if len(pinnedOnly) != 1 || pinnedOnly[0].ID != beta.ID {
		t.Fatalf("pinned=true 应只返回 beta，实际 %v", p1SessionIDsOf(pinnedOnly))
	}
	if !pinnedOnly[0].Pinned {
		t.Fatalf("pinned 过滤结果应带 pinned=true: %+v", pinnedOnly[0])
	}
	unpinned, err := mod.SearchSessions(ctx, "", p1BoolPtr(false))
	if err != nil {
		t.Fatalf("search unpinned: %v", err)
	}
	if p1ContainsSession(unpinned, beta.ID) {
		t.Fatalf("pinned=false 不应包含已置顶会话: %v", p1SessionIDsOf(unpinned))
	}

	ordered, err := mod.SearchSessions(ctx, "", nil)
	if err != nil {
		t.Fatalf("search ordered: %v", err)
	}
	if len(ordered) == 0 || ordered[0].ID != beta.ID {
		t.Fatalf("置顶会话应排在最前，实际首位 %v", p1SessionIDsOf(ordered)[:1])
	}
}

// TestSetPinnedAndSetOwnerValidation 覆盖 AC-CONV-002/003 的异常边界：未知会话、未知
// agentId、归档只读，以及负责人默认值回退。
func TestSetPinnedAndSetOwnerValidation(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	if _, err := mod.SetPinned(ctx, "sess-p1-missing", true); !errors.Is(err, ErrNotFound) {
		t.Fatalf("未知会话 setPinned 应 ErrNotFound，得到 %v", err)
	}
	if _, err := mod.SetOwner(ctx, "sess-p1-missing", ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("未知会话 setOwner 应 ErrNotFound，得到 %v", err)
	}

	session, err := mod.Create(ctx, DefaultSessionID, "负责人测试会话")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	pinned, err := mod.SetPinned(ctx, session.ID, true)
	if err != nil || !pinned.Pinned {
		t.Fatalf("setPinned(true) = %+v err=%v", pinned, err)
	}
	if got := p1MustSession(t, mod, session.ID); !got.Pinned {
		t.Fatalf("置顶未持久化: %+v", got)
	}
	unpinned, err := mod.SetPinned(ctx, session.ID, false)
	if err != nil || unpinned.Pinned {
		t.Fatalf("setPinned(false) = %+v err=%v", unpinned, err)
	}

	owned, err := mod.SetOwner(ctx, session.ID, "")
	if err != nil {
		t.Fatalf("setOwner 空值: %v", err)
	}
	if owned.OwnerAgentID != coreagent.DefaultID {
		t.Fatalf("空 agentId 应回退默认 %q，得到 %q", coreagent.DefaultID, owned.OwnerAgentID)
	}
	if _, err := mod.SetOwner(ctx, session.ID, "not-a-real-agent"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("未知 agentId 应 ErrInvalid，得到 %v", err)
	}
	custom, err := mod.SetOwner(ctx, session.ID, "agent:custom-p1")
	if err != nil {
		t.Fatalf("agent: 前缀应被接受: %v", err)
	}
	if custom.OwnerAgentID != "agent:custom-p1" {
		t.Fatalf("owner = %q, want agent:custom-p1", custom.OwnerAgentID)
	}
	if got := mod.OwnerAgentID(ctx, session.ID); got != "agent:custom-p1" {
		t.Fatalf("OwnerAgentID = %q, want agent:custom-p1", got)
	}
	if got := mod.OwnerAgentID(ctx, "sess-p1-missing"); got != coreagent.DefaultID {
		t.Fatalf("未知会话 OwnerAgentID 应回退默认，得到 %q", got)
	}

	// 归档后只读：改名/改负责人必须 ErrArchived，且原值不变。
	if _, err := mod.Archive(ctx, session.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}
	if _, err := mod.SetOwner(ctx, session.ID, ""); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档会话 setOwner 应 ErrArchived，得到 %v", err)
	}
	if _, err := mod.Rename(ctx, session.ID, "归档改名"); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档会话 rename 应 ErrArchived，得到 %v", err)
	}
	if got := p1MustSession(t, mod, session.ID); got.Title != session.Title || got.OwnerAgentID != "agent:custom-p1" {
		t.Fatalf("归档只读被破坏: %+v", got)
	}
	if _, err := mod.Unarchive(ctx, session.ID); err != nil {
		t.Fatalf("unarchive: %v", err)
	}
	if renamed, err := mod.Rename(ctx, session.ID, "解档后改名"); err != nil || renamed.Title != "解档后改名" {
		t.Fatalf("unarchive 后 rename = %+v err=%v", renamed, err)
	}
}

// TestRenameInvalidAndDescendantDepthClamp 覆盖 AC-CONV-001/002 的入参与深度边界：
// 空 id/空标题/未知会话、DescendantIDs 的默认深度与限幅、未知根返回空切片。
func TestRenameInvalidAndDescendantDepthClamp(t *testing.T) {
	mod, _, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	if _, err := mod.Rename(ctx, "", "标题"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("空 id rename 应 ErrInvalid，得到 %v", err)
	}
	if _, err := mod.Rename(ctx, DefaultSessionID, "   "); !errors.Is(err, ErrInvalid) {
		t.Fatalf("空白标题 rename 应 ErrInvalid，得到 %v", err)
	}
	if _, err := mod.Rename(ctx, "sess-p1-missing", "标题"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("未知会话 rename 应 ErrNotFound，得到 %v", err)
	}

	child, err := mod.Create(ctx, DefaultSessionID, "深度一")
	if err != nil {
		t.Fatalf("create child: %v", err)
	}
	grand, err := mod.Create(ctx, child.ID, "深度二")
	if err != nil {
		t.Fatalf("create grand: %v", err)
	}
	great, err := mod.Create(ctx, grand.ID, "深度三")
	if err != nil {
		t.Fatalf("create great: %v", err)
	}

	depth1, err := mod.DescendantIDs(ctx, DefaultSessionID, 1)
	if err != nil {
		t.Fatalf("descendants depth=1: %v", err)
	}
	if len(depth1) != 2 || !p1HasID(depth1, DefaultSessionID) || !p1HasID(depth1, child.ID) {
		t.Fatalf("depth=1 应为 root+直接子，得到 %v", depth1)
	}
	depth2, err := mod.DescendantIDs(ctx, DefaultSessionID, 2)
	if err != nil {
		t.Fatalf("descendants depth=2: %v", err)
	}
	if len(depth2) != 3 || !p1HasID(depth2, grand.ID) || p1HasID(depth2, great.ID) {
		t.Fatalf("depth=2 应为 root+child+grand，得到 %v", depth2)
	}
	defaultDepth, err := mod.DescendantIDs(ctx, DefaultSessionID, 0)
	if err != nil {
		t.Fatalf("descendants depth=0: %v", err)
	}
	if len(defaultDepth) != 4 || !p1HasID(defaultDepth, great.ID) {
		t.Fatalf("depth=0 应按默认 16 层返回全部 4 个，得到 %v", defaultDepth)
	}
	negativeDepth, err := mod.DescendantIDs(ctx, DefaultSessionID, -7)
	if err != nil {
		t.Fatalf("descendants depth=-7: %v", err)
	}
	if len(negativeDepth) != 4 {
		t.Fatalf("负深度应按默认 16 层处理，得到 %v", negativeDepth)
	}
	overCap, err := mod.DescendantIDs(ctx, DefaultSessionID, 999)
	if err != nil {
		t.Fatalf("descendants depth=999: %v", err)
	}
	if len(overCap) != 4 {
		t.Fatalf("超过上限的深度应按默认 16 层处理，得到 %v", overCap)
	}

	if unknown, err := mod.DescendantIDs(ctx, "sess-p1-missing", 0); err != nil || len(unknown) != 0 {
		t.Fatalf("未知会话 descendants 应返回空切片，得到 %v err=%v", unknown, err)
	}
	if empty, err := mod.DescendantIDs(ctx, "   ", 0); err != nil || len(empty) != 0 {
		t.Fatalf("空 id descendants 应返回空切片，得到 %v err=%v", empty, err)
	}

	if _, err := mod.Archive(ctx, great.ID); err != nil {
		t.Fatalf("archive leaf: %v", err)
	}
	if _, err := mod.Rename(ctx, great.ID, "归档叶改名"); !errors.Is(err, ErrArchived) {
		t.Fatalf("归档叶 rename 应 ErrArchived，得到 %v", err)
	}
}

func p1HasID(ids []string, want string) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}
