package sessions

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	coreagent "simo/internal/core/agent"
)

// M70：懒创建草稿。默认 POST /api/sessions 只创建内存草稿；首条消息写入前物化。
type draftSession struct {
	Session
	treeRoot string
}

func (m *Module) CreateDraft(ctx context.Context, parentID, title string) (Session, error) {
	parentID = strings.TrimSpace(parentID)
	if parentID == "" {
		parentID = DefaultSessionID
	}
	title = strings.TrimSpace(title)
	if title == "" {
		title = "子会话"
	}
	parent, err := getSession(ctx, m.store, parentID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Session{}, fmt.Errorf("%w: parent %s", ErrNotFound, parentID)
		}
		return Session{}, err
	}
	if parent.Archived != 0 {
		return Session{}, fmt.Errorf("%w: 父会话已归档", ErrArchived)
	}
	root := m.treeRoot(ctx, parentID)
	now := time.Now().UnixMilli()
	m.draftMu.Lock()
	defer m.draftMu.Unlock()
	for id, draft := range m.drafts {
		if draft.treeRoot != root {
			continue
		}
		// 同一会话树最多一个空草稿：复用并更新标题，避免堆积。
		draft.Title = title
		draft.ParentID = parentID
		m.drafts[id] = draft
		return draft.Session, nil
	}
	draft := draftSession{
		Session: Session{
			ID:           newSessionID(),
			ParentID:     parentID,
			Title:        title,
			CreatedAt:    now,
			OwnerAgentID: coreagent.DefaultID,
		},
		treeRoot: root,
	}
	m.drafts[draft.ID] = draft
	return draft.Session, nil
}

func (m *Module) MaterializeDraft(ctx context.Context, id string) (Session, bool, error) {
	id = strings.TrimSpace(id)
	m.draftMu.Lock()
	defer m.draftMu.Unlock()
	draft, ok := m.drafts[id]
	if !ok {
		return Session{}, false, nil
	}
	if existing, err := getSession(ctx, m.store, id); err == nil {
		delete(m.drafts, id)
		return existing, true, nil
	}
	if _, err := getSession(ctx, m.store, draft.ParentID); err != nil {
		return Session{}, false, fmt.Errorf("草稿父会话不存在: %w", err)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO sessions(id, parent_id, title, created_at, archived, pinned, owner_agent_id)
			VALUES (?, ?, ?, ?, 0, 0, ?)`, draft.ID, draft.ParentID, draft.Title, draft.CreatedAt, draft.OwnerAgentID); err != nil {
			return err
		}
		return insertSpecTx(ctx, tx, specFromSession(draft.Session))
	}); err != nil {
		// 并发下可能已被另一路径物化；只要数据库已有该 id 就视为成功。
		if existing, getErr := getSession(ctx, m.store, id); getErr == nil {
			delete(m.drafts, id)
			return existing, true, nil
		}
		return Session{}, false, fmt.Errorf("物化草稿失败: %w", err)
	}
	delete(m.drafts, id)
	return draft.Session, true, nil
}

func (m *Module) IsDraft(_ context.Context, id string) bool {
	m.draftMu.Lock()
	defer m.draftMu.Unlock()
	_, ok := m.drafts[strings.TrimSpace(id)]
	return ok
}

func (m *Module) treeRoot(ctx context.Context, parentID string) string {
	current := parentID
	for depth := 0; depth < maxTreeDepth; depth++ {
		session, err := getSession(ctx, m.store, current)
		if err != nil || strings.TrimSpace(session.ParentID) == "" {
			return current
		}
		current = session.ParentID
	}
	return current
}

// cleanupEmptySessions 清理启动时没有任何消息、没有子会话/任务引用的空会话（保留 main）。
func (m *Module) cleanupEmptySessions(ctx context.Context) {
	rows, err := m.store.Query(ctx, `SELECT id, parent_id FROM sessions`)
	if err != nil {
		m.log.Warn("清理空会话：读取 sessions 失败", "err", err)
		return
	}
	type row struct{ id, parent string }
	all := make([]row, 0, 16)
	children := map[string]bool{}
	for rows.Next() {
		var item row
		if rows.Scan(&item.id, &item.parent) == nil {
			all = append(all, item)
			children[item.parent] = true
		}
	}
	_ = rows.Close()

	refs := make(map[string]bool)
	if m.hasTable(ctx, "messages") {
		if refRows, err := m.store.Query(ctx, `SELECT DISTINCT session_id FROM messages`); err == nil {
			for refRows.Next() {
				var id string
				if refRows.Scan(&id) == nil {
					refs[id] = true
				}
			}
			_ = refRows.Close()
		}
	}
	for _, table := range []string{"tasks", "workflows", "schedules"} {
		if !m.hasTable(ctx, table) {
			continue
		}
		if refRows, err := m.store.Query(ctx, `SELECT DISTINCT session_id FROM `+table); err == nil {
			for refRows.Next() {
				var id string
				if refRows.Scan(&id) == nil {
					refs[id] = true
				}
			}
			_ = refRows.Close()
		}
	}
	for _, table := range []string{"teams", "team_members"} {
		if !m.hasTable(ctx, table) {
			continue
		}
		column := "lead_session_id"
		if table == "team_members" {
			column = "session_id"
		}
		if refRows, err := m.store.Query(ctx, `SELECT DISTINCT `+column+` FROM `+table); err == nil {
			for refRows.Next() {
				var id string
				if refRows.Scan(&id) == nil {
					refs[id] = true
				}
			}
			_ = refRows.Close()
		}
	}
	remove := make([]string, 0, 8)
	for _, item := range all {
		if item.id == DefaultSessionID || item.id == "" {
			continue
		}
		if refs[item.id] || children[item.id] {
			continue
		}
		remove = append(remove, item.id)
	}
	if len(remove) == 0 {
		m.log.Info("空会话清理完成", "count", 0)
		return
	}
	placeholders := make([]string, len(remove))
	args := make([]any, len(remove))
	for i, id := range remove {
		placeholders[i] = "?"
		args[i] = id
	}
	in := strings.Join(placeholders, ",")
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		for _, table := range []string{"spec_transitions", "spec_evidence", "specs", "session_overviews"} {
			if !m.hasTableTx(ctx, tx, table) {
				continue
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM `+table+` WHERE session_id IN (`+in+`)`, args...); err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM sessions WHERE id IN (`+in+`)`, args...)
		return err
	}); err != nil {
		m.log.Warn("清理空会话失败", "err", err, "count", len(remove))
		return
	}
	m.log.Info("已清理空会话", "count", len(remove), "ids", strings.Join(remove, ","))
}

func (m *Module) hasTable(ctx context.Context, table string) bool {
	var one int
	return m.store.QueryRow(ctx, `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&one) == nil
}

func (m *Module) hasTableTx(ctx context.Context, tx *sql.Tx, table string) bool {
	var one int
	return tx.QueryRowContext(ctx, `SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&one) == nil
}
