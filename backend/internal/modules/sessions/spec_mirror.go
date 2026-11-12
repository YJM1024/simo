package sessions

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// materializeSpecFiles 在启动时把 DB 规格镜像为 workspace/specs/main[/conversations/...]/spec.md。
// DB 仍是权威源；该文件只读镜像，不从文件回写 DB。
func (m *Module) materializeSpecFiles(ctx context.Context) {
	if m.workspace == nil {
		return
	}
	rows, err := m.store.Query(ctx, `SELECT id FROM sessions ORDER BY created_at, id`)
	if err != nil {
		m.log.Warn("读取会话列表用于 spec 镜像失败", "err", err)
		return
	}
	ids := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	for _, id := range ids {
		m.writeSpecMirror(ctx, id)
	}
}

func (m *Module) writeSpecMirror(ctx context.Context, sessionID string) {
	if m.workspace == nil || strings.TrimSpace(sessionID) == "" {
		return
	}
	var status string
	var version int64
	var goal, constraints, evidence string
	err := m.store.QueryRow(ctx, `SELECT status, version, COALESCE(goal,''), COALESCE(constraints,''), COALESCE(evidence,'')
		FROM specs WHERE session_id = ?`, sessionID).Scan(&status, &version, &goal, &constraints, &evidence)
	if err != nil {
		return
	}
	segments := m.sessionWorkspaceSegments(ctx, sessionID)
	path, err := m.workspace.SpecFile(segments)
	if err != nil {
		m.log.Warn("spec 镜像路径非法", "err", err, "sessionId", sessionID)
		return
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		m.log.Warn("创建 spec 镜像目录失败", "err", err)
		return
	}
	var b strings.Builder
	b.WriteString("# 会话规格（镜像）\n\n")
	b.WriteString("- 会话：`" + sessionID + "`\n")
	b.WriteString("- 状态：" + status + "\n")
	b.WriteString(fmt.Sprintf("- 版本：%d\n", version))
	if strings.TrimSpace(goal) != "" {
		b.WriteString("\n## 目标\n\n" + goal + "\n")
	}
	if strings.TrimSpace(constraints) != "" {
		b.WriteString("\n## 约束\n\n" + constraints + "\n")
	}
	if strings.TrimSpace(evidence) != "" {
		b.WriteString("\n## 证据索引\n\n```json\n" + evidence + "\n```\n")
	}
	b.WriteString("\n> 此文件由 DB 规格自动镜像，修改不会回写；DB 是权威源。\n")
	if err := os.WriteFile(path, []byte(b.String()), 0o644); err != nil {
		m.log.Warn("写 spec 镜像失败", "err", err, "path", path)
	}
}

func (m *Module) sessionWorkspaceSegments(ctx context.Context, sessionID string) []string {
	segments := []string{"main"}
	current := strings.TrimSpace(sessionID)
	reversed := make([]string, 0, 4)
	seen := map[string]bool{}
	for depth := 0; depth < 32 && current != "" && current != "main" && !seen[current]; depth++ {
		seen[current] = true
		reversed = append(reversed, current)
		var parent string
		if err := m.store.QueryRow(ctx, `SELECT COALESCE(parent_id,'') FROM sessions WHERE id = ?`, current).Scan(&parent); err != nil {
			break
		}
		current = parent
	}
	for i := len(reversed) - 1; i >= 0; i-- {
		segments = append(segments, reversed[i])
	}
	return segments
}
