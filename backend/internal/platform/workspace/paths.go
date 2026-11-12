// Package workspace 是 SIMO_HOME 下的路径策略（M1 先把边界建好，M2 工具直接复用）。
//
// 规则（docs/tech-stack.md §2.5）：
//   - 工具读写限定在 <SIMO_HOME>/workspace 与 <SIMO_HOME>/artifacts；
//   - 拒绝绝对路径、盘符、`..` 逃逸；只接受相对路径，Clean 后必须仍在根内；
//   - 业务代码禁止硬编码宿主绝对路径，一律经本包从 SIMO_HOME 推导。
package workspace

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// ErrEscape 表示路径逃出允许的根目录。
var ErrEscape = errors.New("路径越出允许的沙盒根")

// Policy 是 workspace/artifacts 的路径边界。
type Policy struct {
	Home      string
	Workspace string
	Artifacts string
	Main      string
	Specs     string
	Work      string
}

// New 创建路径策略并确保目录存在。
func New(home, workspace, artifacts string) (*Policy, error) {
	if strings.TrimSpace(home) == "" {
		return nil, errors.New("SIMO_HOME 不能为空")
	}
	p := &Policy{Home: filepath.Clean(home), Workspace: filepath.Clean(workspace), Artifacts: filepath.Clean(artifacts)}
	p.Main = filepath.Join(p.Workspace, "main")
	p.Specs = filepath.Join(p.Workspace, "specs")
	p.Work = filepath.Join(p.Workspace, "work")
	for _, dir := range []string{p.Home, p.Workspace, p.Artifacts} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("创建目录 %s 失败: %w", dir, err)
		}
	}
	return p, nil
}

// ResolveWorkspace 把相对路径解析到 workspace 根内；不存在也允许（工具后续创建）。
func (p *Policy) ResolveWorkspace(rel string) (string, error) {
	return resolveInside(p.Workspace, rel)
}

// ResolveArtifact 把相对路径解析到 artifacts 根内。
func (p *Policy) ResolveArtifact(rel string) (string, error) {
	return resolveInside(p.Artifacts, rel)
}

func resolveInside(root, rel string) (string, error) {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return "", fmt.Errorf("%w: 相对路径不能为空", ErrEscape)
	}
	if filepath.IsAbs(rel) || filepath.VolumeName(rel) != "" ||
		strings.HasPrefix(rel, "/") || strings.HasPrefix(rel, `\`) {
		return "", fmt.Errorf("%w: 不允许绝对路径 %q", ErrEscape, rel)
	}
	candidate := filepath.Clean(filepath.Join(root, rel))
	if !isInside(root, candidate) {
		return "", fmt.Errorf("%w: %q", ErrEscape, rel)
	}
	return candidate, nil
}

func isInside(root, candidate string) bool {
	rel, err := filepath.Rel(filepath.Clean(root), candidate)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	return !filepath.IsAbs(rel)
}
