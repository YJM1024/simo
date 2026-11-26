package tasks

// PRD-TASK-005：子会话与任务归属投影。
// 任务的归属键只有 session_id：父会话看不到子会话里的任务，父层的计数也不含它们。
// 父会话与直接子会话的关系取 sessions.parent_id（idx_sessions_parent 已存在），
// 每次读取实时聚合，不新增冗余计数列，也不要求归档父会话时级联改子任务状态。

import (
	"context"

	coretask "simo/internal/core/task"
)

// childSessionIDsByParent 批量读「父会话 → 直接子会话 id」，一次查询覆盖一批任务。
// 只返回直接子会话，不递归；升序按创建时间，保证同一父会话下的顺序稳定。
func (m *Module) childSessionIDsByParent(ctx context.Context, parentIDs []string) map[string][]string {
	out := make(map[string][]string, len(parentIDs))
	if len(parentIDs) == 0 {
		return out
	}
	args := make([]any, len(parentIDs))
	for i, id := range parentIDs {
		args[i] = id
	}
	rows, err := m.store.Query(ctx, `SELECT parent_id, id FROM sessions
		WHERE parent_id IN (`+placeholders(len(parentIDs))+`) ORDER BY created_at ASC, id ASC`, args...)
	if err != nil {
		// 投影失败不影响任务本身的读取：子会话入口只是附加信息。
		m.log.Warn("读取子会话失败", "err", err)
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var parentID, childID string
		if err := rows.Scan(&parentID, &childID); err != nil {
			m.log.Warn("读取子会话行失败", "err", err)
			continue
		}
		out[parentID] = append(out[parentID], childID)
	}
	return out
}

// decorateChildSessions 给一批任务补 childSessionIds/childSessionCount。
// 同一批里同一会话只查一次；空列表写成空数组，前端不必区分 null。
func (m *Module) decorateChildSessions(ctx context.Context, tasks []coretask.Task) {
	if len(tasks) == 0 {
		return
	}
	parents := make([]string, 0, len(tasks))
	seen := make(map[string]struct{}, len(tasks))
	for _, task := range tasks {
		if task.SessionID == "" {
			continue
		}
		if _, ok := seen[task.SessionID]; ok {
			continue
		}
		seen[task.SessionID] = struct{}{}
		parents = append(parents, task.SessionID)
	}
	children := m.childSessionIDsByParent(ctx, parents)
	for i := range tasks {
		ids := children[tasks[i].SessionID]
		if ids == nil {
			ids = []string{}
		}
		tasks[i].ChildSessionIDs = ids
		tasks[i].ChildSessionCount = len(ids)
	}
}

// decorateChildSessionsOne 是单任务版本的便捷入口（详情接口）。
func (m *Module) decorateChildSessionsOne(ctx context.Context, task *coretask.Task) {
	if task == nil {
		return
	}
	items := []coretask.Task{*task}
	m.decorateChildSessions(ctx, items)
	*task = items[0]
}
