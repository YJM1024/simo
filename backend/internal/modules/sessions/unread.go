package sessions

import (
	"context"

	coresession "simo/internal/core/session"
)

// SetUnreadSource 注入未读投影来源（chat 模块），由 composition root 在启动期调用一次，
// 之后只读。来源为 nil 时所有会话 hasUnread=false（chat 未启用时的降级）。
func (m *Module) SetUnreadSource(source coresession.UnreadSource) {
	m.unread = source
}

// unreadFlags 读取未读集合；来源缺失或查询失败都降级为"全已读"，不阻断列表本身。
func (m *Module) unreadFlags(ctx context.Context) map[string]bool {
	if m.unread == nil {
		return nil
	}
	flags, err := m.unread.UnreadSessionIDs(ctx)
	if err != nil {
		m.log.Warn("读取未读状态失败", "err", err)
		return nil
	}
	return flags
}

// applyUnread 把未读集合套到列表/树投影上（递归覆盖 children）。
func applyUnread(nodes []Session, flags map[string]bool) {
	for i := range nodes {
		nodes[i].HasUnread = flags[nodes[i].ID]
		if len(nodes[i].Children) > 0 {
			applyUnread(nodes[i].Children, flags)
		}
	}
}
