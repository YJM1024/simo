package sessions

import (
	"context"
	"database/sql"
	"testing"

	"simo/internal/core/store"
)

// createWithCreatedAt 建会话并把 created_at 固定为给定毫秒。
// 排序用例不能依赖 Create 时的 time.Now()，否则同毫秒创建会退化成按随机 id 排。
func createWithCreatedAt(t *testing.T, mod *Module, st *store.Store, parent, title string, createdAt int64) Session {
	t.Helper()
	ctx := context.Background()
	s, err := mod.Create(ctx, parent, title)
	if err != nil {
		t.Fatalf("创建会话 %s: %v", title, err)
	}
	if err := st.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET created_at = ? WHERE id = ?`, createdAt, s.ID)
		return err
	}); err != nil {
		t.Fatalf("固定 %s 的 created_at: %v", title, err)
	}
	s.CreatedAt = createdAt
	return s
}

func childIDs(nodes []Session) []string {
	out := make([]string, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, n.ID)
	}
	return out
}

func assertIDs(t *testing.T, label string, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v，期望 %v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %v，期望 %v", label, got, want)
		}
	}
}

func treeRoot(t *testing.T, mod *Module) Session {
	t.Helper()
	tree, err := mod.Tree(context.Background())
	if err != nil {
		t.Fatalf("Tree: %v", err)
	}
	for _, r := range tree {
		if r.ID == DefaultSessionID {
			return r
		}
	}
	t.Fatalf("树里没有 main 根: %+v", tree)
	return Session{}
}

func findChild(t *testing.T, nodes []Session, id string) Session {
	t.Helper()
	for _, n := range nodes {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("未找到子会话 %s，现有 %v", id, childIDs(nodes))
	return Session{}
}

func TestTreeSiblingPinnedFirst(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	old := createWithCreatedAt(t, mod, st, DefaultSessionID, "旧", 1_000)
	mid := createWithCreatedAt(t, mod, st, DefaultSessionID, "中", 2_000)
	newer := createWithCreatedAt(t, mod, st, DefaultSessionID, "新", 3_000)

	assertIDs(t, "默认兄弟顺序（created_at DESC）", childIDs(treeRoot(t, mod).Children), newer.ID, mid.ID, old.ID)

	if _, err := mod.SetPinned(ctx, mid.ID, true); err != nil {
		t.Fatalf("置顶: %v", err)
	}
	children := treeRoot(t, mod).Children
	assertIDs(t, "置顶后兄弟顺序", childIDs(children), mid.ID, newer.ID, old.ID)
	if children[0].ParentID != DefaultSessionID {
		t.Fatalf("置顶改变了父子归属: parent=%q", children[0].ParentID)
	}
}

func TestTreeSiblingUnpinRestoresOrder(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	old := createWithCreatedAt(t, mod, st, DefaultSessionID, "旧", 1_000)
	mid := createWithCreatedAt(t, mod, st, DefaultSessionID, "中", 2_000)
	newer := createWithCreatedAt(t, mod, st, DefaultSessionID, "新", 3_000)

	if _, err := mod.SetPinned(ctx, mid.ID, true); err != nil {
		t.Fatalf("置顶: %v", err)
	}
	assertIDs(t, "置顶后兄弟顺序", childIDs(treeRoot(t, mod).Children), mid.ID, newer.ID, old.ID)

	if _, err := mod.SetPinned(ctx, mid.ID, false); err != nil {
		t.Fatalf("取消置顶: %v", err)
	}
	assertIDs(t, "取消置顶后兄弟顺序", childIDs(treeRoot(t, mod).Children), newer.ID, mid.ID, old.ID)
}

func TestTreePinOnlyReordersSiblings(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	a := createWithCreatedAt(t, mod, st, DefaultSessionID, "A", 1_000)
	b := createWithCreatedAt(t, mod, st, DefaultSessionID, "B", 2_000)
	c1 := createWithCreatedAt(t, mod, st, a.ID, "A-1", 3_000)
	c2 := createWithCreatedAt(t, mod, st, a.ID, "A-2", 4_000)

	root := treeRoot(t, mod)
	assertIDs(t, "根层兄弟顺序", childIDs(root.Children), b.ID, a.ID)
	assertIDs(t, "A 的子顺序", childIDs(findChild(t, root.Children, a.ID).Children), c2.ID, c1.ID)

	if _, err := mod.SetPinned(ctx, c1.ID, true); err != nil {
		t.Fatalf("置顶孙会话: %v", err)
	}
	root = treeRoot(t, mod)
	assertIDs(t, "置顶孙会话后根层顺序", childIDs(root.Children), b.ID, a.ID)
	aNode := findChild(t, root.Children, a.ID)
	assertIDs(t, "置顶孙会话后 A 的子顺序", childIDs(aNode.Children), c1.ID, c2.ID)
	if aNode.Children[0].ParentID != a.ID {
		t.Fatalf("孙会话脱离了父级: parent=%q", aNode.Children[0].ParentID)
	}
	for _, n := range root.Children {
		if n.ID == c1.ID {
			t.Fatalf("置顶把孙会话提升到了根层: %v", childIDs(root.Children))
		}
	}
}

func TestTreePinIdempotent(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	old := createWithCreatedAt(t, mod, st, DefaultSessionID, "旧", 1_000)
	mid := createWithCreatedAt(t, mod, st, DefaultSessionID, "中", 2_000)
	newer := createWithCreatedAt(t, mod, st, DefaultSessionID, "新", 3_000)

	for i := 0; i < 3; i++ {
		if _, err := mod.SetPinned(ctx, mid.ID, true); err != nil {
			t.Fatalf("第 %d 次置顶: %v", i+1, err)
		}
		assertIDs(t, "重复置顶后兄弟顺序", childIDs(treeRoot(t, mod).Children), mid.ID, newer.ID, old.ID)
	}
	for i := 0; i < 3; i++ {
		if _, err := mod.SetPinned(ctx, mid.ID, false); err != nil {
			t.Fatalf("第 %d 次取消置顶: %v", i+1, err)
		}
		assertIDs(t, "重复取消置顶后兄弟顺序", childIDs(treeRoot(t, mod).Children), newer.ID, mid.ID, old.ID)
	}
}

// 树里同级顺序必须与扁平列表同键，否则同一批会话在两个接口上顺序不一致。
func TestTreeSiblingOrderMatchesFlatList(t *testing.T) {
	mod, st, db := newTestSessions(t)
	defer db.Close()
	ctx := context.Background()

	one := createWithCreatedAt(t, mod, st, DefaultSessionID, "一", 1_000)
	createWithCreatedAt(t, mod, st, DefaultSessionID, "二", 2_000)
	createWithCreatedAt(t, mod, st, DefaultSessionID, "三", 3_000)
	if _, err := mod.SetPinned(ctx, one.ID, true); err != nil {
		t.Fatalf("置顶: %v", err)
	}

	flat, err := mod.List(ctx)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	want := make([]string, 0, 3)
	for _, s := range flat {
		if s.ParentID == DefaultSessionID {
			want = append(want, s.ID)
		}
	}
	assertIDs(t, "树 vs 扁平列表", childIDs(treeRoot(t, mod).Children), want...)
}
