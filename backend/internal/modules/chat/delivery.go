package chat

import (
	"context"
	"database/sql"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"

	coretask "simo/internal/core/task"
)

type userDeliveryContextKey struct{}

func withUserDelivery(ctx context.Context) context.Context {
	return context.WithValue(ctx, userDeliveryContextKey{}, true)
}

func isUserDeliveryContext(ctx context.Context) bool {
	value, _ := ctx.Value(userDeliveryContextKey{}).(bool)
	return value
}

// registerUserDeliveryFile 只在“用户审批后明确执行写文件”的上下文中调用。
// 文件会复制到会话 output/ 并登记为 user_delivery，内容原文件不移动。
func (m *Module) registerUserDeliveryFile(ctx context.Context, sessionID, absPath string) {
	if m.sandbox == nil || strings.TrimSpace(sessionID) == "" {
		return
	}
	info, err := os.Stat(absPath)
	if err != nil || info.IsDir() {
		return
	}
	if info.Size() > maxGeneratedBytes {
		m.log.Warn("用户交付文件过大，未登记", "path", absPath, "size", info.Size())
		return
	}
	name := sanitizeGeneratedName(filepath.Base(absPath), "delivery.txt")
	target, err := m.generatedPath(sessionID, name)
	if err != nil {
		m.log.Warn("创建用户交付文件目录失败", "err", err)
		return
	}
	if filepath.Clean(absPath) != filepath.Clean(target) {
		data, readErr := os.ReadFile(absPath)
		if readErr != nil {
			m.log.Warn("读取用户交付文件失败", "err", readErr)
			return
		}
		if writeErr := os.WriteFile(target, data, 0o644); writeErr != nil {
			m.log.Warn("复制用户交付文件失败", "err", writeErr)
			return
		}
	}
	rel, err := filepath.Rel(m.sandbox.Workspace, target)
	if err != nil || strings.HasPrefix(rel, "..") {
		m.log.Warn("用户交付文件路径越界", "err", err)
		return
	}
	rel = filepath.ToSlash(rel)
	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(name)))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	id := newID("artifact")
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at, delivery_kind, storage_scope, workspace_rel_path)
			VALUES (?, ?, ?, '', ?, ?, ?, ?, 'workspace', ?)`,
			id, "session:"+sessionID, name, mimeType, info.Size(), time.Now().UnixMilli(),
			coretask.ArtifactDeliveryKindUser, rel)
		return err
	}); err != nil {
		m.log.Warn("登记用户交付文件失败", "err", err)
	}
}

func (m *Module) workspaceSessionSegments(ctx context.Context, sessionID string) []string {
	segments := []string{"main"}
	for _, item := range m.sessionPath(ctx, sessionID) {
		if item.ID == "" || item.ID == "main" {
			continue
		}
		segments = append(segments, item.ID)
	}
	return segments
}

func (m *Module) userOutputPath(ctx context.Context, sessionID, name string) (string, error) {
	if m.sandbox == nil {
		return "", fmt.Errorf("workspace 未配置")
	}
	segments := m.workspaceSessionSegments(ctx, sessionID)
	dir, err := m.sandbox.SessionArea(segments, "output")
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dir, sanitizeGeneratedName(name, "delivery.txt")), nil
}
