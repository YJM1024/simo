package chat

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"simo/internal/platform/workspace"
)

// TestResolveToolPathCanonicalizesWorkspaceRoot 验证允许根与候选路径按同一规则规范化。
// Windows 短路径（8.3）或 symlink 会让 root 与 EvalSymlinks(candidate) 形式不一致；
// 不做 root 规范化时，合法相对路径会被误判为“不在允许根内”。
func TestResolveToolPathCanonicalizesWorkspaceRoot(t *testing.T) {
	base := t.TempDir()
	realRoot := filepath.Join(base, "real-workspace")
	if err := os.MkdirAll(realRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	linkRoot := filepath.Join(base, "linked-workspace")
	if err := os.Symlink(realRoot, linkRoot); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	m := &Module{sandbox: &workspace.Policy{
		Workspace: linkRoot,
		Artifacts: filepath.Join(base, "artifacts"),
	}}

	got, err := m.resolveToolPath("notes.md", sandboxWorkspaceWrite)
	if err != nil {
		t.Fatalf("合法相对路径被拒: %v", err)
	}
	canonicalRealRoot, err := filepath.EvalSymlinks(realRoot)
	if err != nil {
		canonicalRealRoot = realRoot
	}
	// Windows 上 t.TempDir() 可能是 8.3 短路径，而解析结果使用长路径；
	// 期望值必须同样规范化，否则测试会误报（产品路径逻辑本身已统一 canonical）。
	wantNotes := filepath.Join(canonicalRealRoot, "notes.md")
	if filepath.Clean(got) != filepath.Clean(wantNotes) {
		t.Fatalf("resolved = %s, want %s", got, wantNotes)
	}

	if _, err := m.resolveToolPath("../escape.txt", sandboxWorkspaceWrite); err == nil {
		t.Fatal("越界路径应被拒")
	}
	if !strings.Contains(filepath.ToSlash(got), "/real-workspace/") {
		t.Fatalf("未解析到真实根: %s", got)
	}
}
