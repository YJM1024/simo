package tasks

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"simo/internal/platform/workspace"
)

// sessionWorkspaceSegments 返回 main[/conversations/<child>...] 的物理路径段。
func (m *Module) sessionWorkspaceSegments(ctx context.Context, sessionID string) []string {
	segments := []string{"main"}
	current := strings.TrimSpace(sessionID)
	reversed := make([]string, 0, 4)
	seen := map[string]bool{}
	for depth := 0; depth < 32 && current != "" && current != "main" && !seen[current]; depth++ {
		seen[current] = true
		reversed = append(reversed, current)
		var parent string
		if err := m.store.QueryRow(ctx, `SELECT parent_id FROM sessions WHERE id = ?`, current).Scan(&parent); err != nil {
			break
		}
		current = parent
	}
	for i := len(reversed) - 1; i >= 0; i-- {
		segments = append(segments, reversed[i])
	}
	return segments
}

func (m *Module) ensureTaskDirs(ctx context.Context, sessionID, taskID string) {
	if m.sandbox == nil {
		return
	}
	segments := m.sessionWorkspaceSegments(ctx, sessionID)
	for _, area := range []string{"code", "data", "output", "_internal"} {
		path, err := m.sandbox.TaskArea(segments, taskID, area)
		if err != nil {
			m.log.Warn("任务目录路径非法", "err", err, "taskId", taskID, "area", area)
			continue
		}
		if err := os.MkdirAll(path, 0o755); err != nil {
			m.log.Warn("创建任务目录失败", "err", err, "path", path)
		}
	}
}

func (m *Module) workspaceRelPath(ctx context.Context, absPath string) (string, error) {
	if m.sandbox == nil {
		return "", workspace.ErrEscape
	}
	rel, err := filepath.Rel(m.sandbox.Workspace, absPath)
	if err != nil {
		return "", err
	}
	return filepath.ToSlash(rel), nil
}
