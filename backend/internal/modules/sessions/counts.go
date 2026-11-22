package sessions

import (
	"context"
	"fmt"

	"simo/internal/core/store"
)

// messageCounts 一次聚合出全部会话**自身**的消息数，键为会话 id（AC-CONV-001-05）。
//
// 计数口径与 `/api/messages` 一致：只计 `internal = 0` 的可见消息，因此行内数字
// 与用户在该会话里能看到的条数相符；`session_id = 会话 id` 决定不含子会话。
// `messages` 表由 chat 模块创建，单模块测试或尚未迁移的旧库可能没有该表，此时
// 返回空映射，调用方按 0 输出（草稿也走这条路径）。
func messageCounts(ctx context.Context, st *store.Store) (map[string]int, error) {
	if !tableExists(ctx, st, "messages") {
		return map[string]int{}, nil
	}
	rows, err := st.Query(ctx, `SELECT session_id, COUNT(*) FROM messages WHERE internal = 0 GROUP BY session_id`)
	if err != nil {
		return nil, fmt.Errorf("统计会话消息数失败: %w", err)
	}
	defer func() { _ = rows.Close() }()
	out := make(map[string]int, 8)
	for rows.Next() {
		var (
			sessionID string
			count     int
		)
		if err := rows.Scan(&sessionID, &count); err != nil {
			return nil, fmt.Errorf("扫描会话消息数失败: %w", err)
		}
		out[sessionID] = count
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("遍历会话消息数失败: %w", err)
	}
	return out, nil
}

// messageCountFor 返回单个会话自身的可见消息数，供单会话响应（创建/改名/置顶等）使用。
func messageCountFor(ctx context.Context, st *store.Store, sessionID string) (int, error) {
	if !tableExists(ctx, st, "messages") {
		return 0, nil
	}
	var count int
	if err := st.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ? AND internal = 0`, sessionID).Scan(&count); err != nil {
		return 0, fmt.Errorf("统计会话消息数失败: %w", err)
	}
	return count, nil
}

func tableExists(ctx context.Context, st *store.Store, table string) bool {
	var one int
	return st.QueryRow(ctx, `SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`, table).Scan(&one) == nil
}
