package workspace

import (
	"errors"
	"fmt"
	"path/filepath"
	"strings"
)

const (
	MaxLayoutPathBytes = 240
	MaxSessionDepth    = 32
)

var (
	ErrInvalidSessionPath = errors.New("非法会话路径")
	ErrInvalidTaskPath    = errors.New("非法任务路径")
	ErrPathTooLong        = errors.New("路径超过长度上限")
)

var sessionAreas = map[string]bool{
	"code": true, "data": true, "output": true, "tasks": true, "conversations": true,
}

var taskAreas = map[string]bool{
	"code": true, "data": true, "output": true, "_internal": true,
}

// SessionArea 返回 workspace/main[/conversations/<child>...]/<area>。
func (p *Policy) SessionArea(sessionPath []string, area string) (string, error) {
	base, err := p.sessionBase(sessionPath)
	if err != nil {
		return "", err
	}
	area = strings.TrimSpace(area)
	if !sessionAreas[area] {
		return "", fmt.Errorf("%w: area %q", ErrInvalidSessionPath, area)
	}
	return checkedPath(filepath.Join(base, area))
}

// TaskArea 返回 session/tasks/<taskId>/<area>，area 仅 code/data/output/_internal。
func (p *Policy) TaskArea(sessionPath []string, taskID, area string) (string, error) {
	base, err := p.sessionBase(sessionPath)
	if err != nil {
		return "", err
	}
	if !safeSegment(taskID) {
		return "", fmt.Errorf("%w: taskId %q", ErrInvalidTaskPath, taskID)
	}
	area = strings.TrimSpace(area)
	if !taskAreas[area] {
		return "", fmt.Errorf("%w: area %q", ErrInvalidTaskPath, area)
	}
	return checkedPath(filepath.Join(base, "tasks", taskID, area))
}

func (p *Policy) SpecFile(sessionPath []string) (string, error) {
	base, err := p.sessionBase(sessionPath)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(p.Main, base)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", fmt.Errorf("%w: %v", ErrInvalidSessionPath, err)
	}
	target := filepath.Join(p.Specs, "main", rel, "spec.md")
	if rel == "." {
		target = filepath.Join(p.Specs, "main", "spec.md")
	}
	return checkedPath(target)
}

// WorkPath 返回 workspace/work 下与 session 树同构的临时路径。
func (p *Policy) WorkPath(sessionPath []string, rel string) (string, error) {
	base, err := p.sessionBase(sessionPath)
	if err != nil {
		return "", err
	}
	treeRel, err := filepath.Rel(p.Main, base)
	if err != nil || strings.HasPrefix(treeRel, "..") {
		return "", fmt.Errorf("%w: %v", ErrInvalidSessionPath, err)
	}
	root := filepath.Join(p.Work, treeRel)
	if strings.TrimSpace(rel) == "" {
		return checkedPath(root)
	}
	resolved, err := resolveInside(root, rel)
	if err != nil {
		return "", err
	}
	return checkedPath(resolved)
}

// ResolveOutput 在会话 output 目录内解析相对文件路径。
func (p *Policy) ResolveOutput(sessionPath []string, rel string) (string, error) {
	root, err := p.SessionArea(sessionPath, "output")
	if err != nil {
		return "", err
	}
	resolved, err := resolveInside(root, rel)
	if err != nil {
		return "", err
	}
	return checkedPath(resolved)
}

func (p *Policy) sessionBase(sessionPath []string) (string, error) {
	if len(sessionPath) == 0 {
		sessionPath = []string{"main"}
	}
	if len(sessionPath) > MaxSessionDepth {
		return "", fmt.Errorf("%w: 深度超过 %d", ErrInvalidSessionPath, MaxSessionDepth)
	}
	if sessionPath[0] != "main" {
		return "", fmt.Errorf("%w: 根必须为 main", ErrInvalidSessionPath)
	}
	base := p.Main
	for i, segment := range sessionPath {
		if i == 0 {
			continue
		}
		if !safeSegment(segment) {
			return "", fmt.Errorf("%w: segment %q", ErrInvalidSessionPath, segment)
		}
		base = filepath.Join(base, "conversations", segment)
	}
	return checkedPath(base)
}

func safeSegment(segment string) bool {
	segment = strings.TrimSpace(segment)
	if segment == "" || segment == "." || segment == ".." {
		return false
	}
	if filepath.IsAbs(segment) || filepath.VolumeName(segment) != "" {
		return false
	}
	if strings.ContainsAny(segment, `/\`) {
		return false
	}
	for _, r := range segment {
		if r < 32 {
			return false
		}
	}
	return true
}

func checkedPath(path string) (string, error) {
	if len([]byte(path)) > MaxLayoutPathBytes {
		return "", fmt.Errorf("%w: %d > %d", ErrPathTooLong, len([]byte(path)), MaxLayoutPathBytes)
	}
	return path, nil
}

// IsInsideRoot 供调用方校验迁移/读取路径仍在指定根内。
func IsInsideRoot(root, candidate string) bool {
	return isInside(filepath.Clean(root), filepath.Clean(candidate))
}
