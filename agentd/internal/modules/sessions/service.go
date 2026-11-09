package sessions

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	coreagent "agentd/internal/core/agent"
	coresession "agentd/internal/core/session"
	"agentd/internal/core/store"
)

const (
	DefaultSessionID    = "main"
	DefaultSessionTitle = "主会话"
	maxTreeDepth        = 32
	DefaultMaxDepth     = 16
)

var (
	ErrNotFound       = errors.New("会话不存在")
	ErrInvalid        = errors.New("会话参数非法")
	ErrArchived       = errors.New("会话已归档（只读）")
	ErrArchiveBlocked = errors.New("归档被 blockers 拒绝")
)

var _ coresession.Service = (*Module)(nil)

// Session 是会话投影（兼容 M1 字段并增加 parentId/children）。
type Session = coresession.Session

// Get 实现 core/session.Service。
func (m *Module) Get(ctx context.Context, id string) (Session, error) {
	return getSession(ctx, m.store, id)
}

// List 实现 core/session.Service。
func (m *Module) List(ctx context.Context) ([]Session, error) {
	return listSessions(ctx, m.store)
}

// Tree 实现 core/session.Service：返回嵌套树，防环并限深。
func (m *Module) Tree(ctx context.Context) ([]Session, error) {
	flat, err := listSessions(ctx, m.store)
	if err != nil {
		return nil, err
	}
	known := make(map[string]bool, len(flat))
	byParent := make(map[string][]Session)
	for _, s := range flat {
		known[s.ID] = true
		byParent[s.ParentID] = append(byParent[s.ParentID], s)
	}
	visited := make(map[string]bool)
	var build func(node Session, depth int) Session
	build = func(node Session, depth int) Session {
		if depth >= maxTreeDepth {
			return node
		}
		children := byParent[node.ID]
		if len(children) == 0 {
			return node
		}
		node.Children = make([]Session, 0, len(children))
		for _, child := range children {
			if visited[child.ID] {
				continue
			}
			visited[child.ID] = true
			node.Children = append(node.Children, build(child, depth+1))
		}
		return node
	}
	roots := make([]Session, 0, 4)
	for _, s := range flat {
		parentMissing := s.ParentID != "" && !known[s.ParentID]
		if s.ParentID == "" || parentMissing {
			if !visited[s.ID] {
				visited[s.ID] = true
				roots = append(roots, build(s, 0))
			}
		}
	}
	// 兜底：如果所有节点都在环里（无根），按 main 兜底并避免死循环。
	if len(roots) == 0 {
		for _, s := range flat {
			if s.ID == DefaultSessionID && !visited[s.ID] {
				visited[s.ID] = true
				roots = append(roots, build(s, 0))
				break
			}
		}
	}
	sortSessions(roots)
	return roots, nil
}

// Create 实现 core/session.Service：在 parentID 下创建子会话。
func (m *Module) Create(ctx context.Context, parentID, title string) (Session, error) {
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
	now := time.Now().UnixMilli()
	session := Session{ID: newSessionID(), ParentID: parentID, Title: title, CreatedAt: now,
		OwnerAgentID: coreagent.DefaultID}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO sessions(id, parent_id, title, created_at, archived, pinned, owner_agent_id)
			VALUES (?, ?, ?, ?, 0, 0, ?)`, session.ID, session.ParentID, session.Title, session.CreatedAt, session.OwnerAgentID); err != nil {
			return err
		}
		return insertSpecTx(ctx, tx, specFromSession(session))
	}); err != nil {
		return Session{}, fmt.Errorf("创建会话失败: %w", err)
	}
	return session, nil
}

// Rename 实现 core/session.Service：纯显示改名，不影响消息归属/上下文。
func (m *Module) Rename(ctx context.Context, id, title string) (Session, error) {
	id = strings.TrimSpace(id)
	title = strings.TrimSpace(title)
	if id == "" || title == "" {
		return Session{}, ErrInvalid
	}
	session, err := getSession(ctx, m.store, id)
	if err != nil {
		return Session{}, err
	}
	if session.Archived != 0 {
		return Session{}, fmt.Errorf("%w: 归档会话不能改名", ErrArchived)
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET title = ? WHERE id = ?`, title, id)
		return err
	}); err != nil {
		return Session{}, fmt.Errorf("改名失败: %w", err)
	}
	return getSession(ctx, m.store, id)
}

// DescendantIDs 实现 core/session.Service：返回 id + 全部后代；防环、限深。
func (m *Module) DescendantIDs(ctx context.Context, id string, maxDepth int) ([]string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return []string{}, nil
	}
	if maxDepth <= 0 || maxDepth > maxTreeDepth {
		maxDepth = DefaultMaxDepth
	}
	flat, err := listSessions(ctx, m.store)
	if err != nil {
		return nil, err
	}
	known := make(map[string]bool, len(flat))
	children := make(map[string][]string)
	for _, s := range flat {
		known[s.ID] = true
		children[s.ParentID] = append(children[s.ParentID], s.ID)
	}
	if !known[id] {
		return []string{}, nil
	}
	out := make([]string, 0, 8)
	visited := make(map[string]bool)
	type node struct {
		id    string
		depth int
	}
	queue := []node{{id: id, depth: 0}}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		if visited[current.id] {
			continue
		}
		visited[current.id] = true
		out = append(out, current.id)
		if current.depth >= maxDepth {
			continue
		}
		for _, child := range children[current.id] {
			if !visited[child] {
				queue = append(queue, node{id: child, depth: current.depth + 1})
			}
		}
	}
	return out, nil
}

func getSession(ctx context.Context, st *store.Store, id string) (Session, error) {
	var s Session
	err := st.QueryRow(ctx, `SELECT id, parent_id, title, created_at, archived, pinned, owner_agent_id FROM sessions WHERE id = ?`, id).
		Scan(&s.ID, &s.ParentID, &s.Title, &s.CreatedAt, &s.Archived, &s.Pinned, &s.OwnerAgentID)
	if errors.Is(err, sql.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	if err != nil {
		return Session{}, fmt.Errorf("查询会话失败: %w", err)
	}
	return s, nil
}

func listSessions(ctx context.Context, st *store.Store) ([]Session, error) {
	rows, err := st.Query(ctx, `SELECT id, parent_id, title, created_at, archived, pinned, owner_agent_id FROM sessions ORDER BY pinned DESC, created_at DESC, id DESC`)
	if err != nil {
		return nil, fmt.Errorf("查询会话失败: %w", err)
	}
	defer rows.Close()
	out := make([]Session, 0, 4)
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.ParentID, &s.Title, &s.CreatedAt, &s.Archived, &s.Pinned, &s.OwnerAgentID); err != nil {
			return nil, fmt.Errorf("扫描会话失败: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历会话失败: %w", err)
	}
	return out, nil
}

func sortSessions(sessions []Session) {
	sort.SliceStable(sessions, func(i, j int) bool {
		if sessions[i].CreatedAt != sessions[j].CreatedAt {
			return sessions[i].CreatedAt < sessions[j].CreatedAt
		}
		return sessions[i].ID < sessions[j].ID
	})
	for i := range sessions {
		sortSessions(sessions[i].Children)
	}
}

func newSessionID() string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("sess-%d", time.Now().UnixNano())
	}
	return "sess-" + hex.EncodeToString(buf)
}
