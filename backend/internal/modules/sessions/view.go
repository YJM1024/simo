package sessions

import "context"

// sessionView 是会话的 HTTP 投影。`core/session.Session` 属于跨模块只读契约，
// messageCount 由本模块在响应里补充，避免改动 core 包。
//
// 外层 Children 遮蔽内嵌 Session.Children（JSON 编码按字段深度取外层），
// 因此树响应仍然只有一个 children 键，且子节点同样带 messageCount。
type sessionView struct {
	Session
	MessageCount int           `json:"messageCount"`
	Children     []sessionView `json:"children,omitempty"`
}

// toSessionViews 把扁平列表转成带计数的投影；缺失会话按 0 计（含无消息表的旧库）。
func toSessionViews(list []Session, counts map[string]int) []sessionView {
	out := make([]sessionView, 0, len(list))
	for _, item := range list {
		out = append(out, sessionView{Session: item, MessageCount: counts[item.ID]})
	}
	return out
}

// toSessionViewTree 递归转换树；子节点的计数来自同一份聚合结果，与列表一致。
func toSessionViewTree(nodes []Session, counts map[string]int) []sessionView {
	out := make([]sessionView, 0, len(nodes))
	for _, node := range nodes {
		children := node.Children
		node.Children = nil
		view := sessionView{Session: node, MessageCount: counts[node.ID]}
		if len(children) > 0 {
			view.Children = toSessionViewTree(children, counts)
		}
		out = append(out, view)
	}
	return out
}

func flattenSessionViews(nodes []sessionView) []sessionView {
	out := make([]sessionView, 0, len(nodes))
	var walk func([]sessionView)
	walk = func(items []sessionView) {
		for _, item := range items {
			out = append(out, item)
			if len(item.Children) > 0 {
				walk(item.Children)
			}
		}
	}
	walk(nodes)
	return out
}

// viewOf 给单会话响应补计数。计数查询失败只记日志并按 0 返回：写操作的落库已经完成，
// 此时改回 500 会让调用方误以为写入失败并重试。
func (m *Module) viewOf(ctx context.Context, session Session) sessionView {
	count, err := messageCountFor(ctx, m.store, session.ID)
	if err != nil {
		m.log.Error("统计会话消息数失败", "session", session.ID, "err", err)
	}
	return sessionView{Session: session, MessageCount: count}
}
