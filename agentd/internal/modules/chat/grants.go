package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

// approvalGrantKey 是本会话允许的"工具 + 参数前缀"匹配键。
func approvalGrantKey(tool string, args map[string]any) string {
	switch tool {
	case "write", "edit":
		return "path:" + normalizeWorkspaceToolPath(stringArg(args, "file_path"))
	case "pwsh":
		return "command:" + strings.TrimSpace(stringArg(args, "command"))
	case "web_fetch":
		return "host:" + urlHostKey(stringArg(args, "url"))
	case "web_search":
		return "query:" + strings.TrimSpace(stringArg(args, "query"))
	default:
		raw, _ := json.Marshal(args)
		return "args:" + string(raw)
	}
}

func (m *Module) addSessionGrant(ctx context.Context, sessionID, tool string, args map[string]any) error {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" || m.reads == nil {
		return nil
	}
	key := approvalGrantKey(tool, args)
	if key == "" {
		return nil
	}
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO approval_grants(
			id, session_id, tool, grant_key, created_at) VALUES (?, ?, ?, ?, ?)`,
			newID("grant"), sessionID, tool, key, time.Now().UnixMilli())
		return err
	})
}

func (m *Module) hasSessionGrant(ctx context.Context, sessionID, tool string, args map[string]any) bool {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return false
	}
	key := approvalGrantKey(tool, args)
	if key == "" {
		return false
	}
	var one int
	err := m.store.QueryRow(ctx, `SELECT 1 FROM approval_grants
		WHERE session_id = ? AND tool = ? AND (grant_key = ? OR ? LIKE grant_key || '%') LIMIT 1`,
		sessionID, tool, key, key).Scan(&one)
	return err == nil && one == 1
}
