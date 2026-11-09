package chat

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// resolveReplySnapshot 读取被引用消息并生成快照；跨会话允许（M15）。
func (m *Module) resolveReplySnapshot(ctx context.Context, messageID string) (*ReplySnapshot, error) {
	messageID = strings.TrimSpace(messageID)
	if messageID == "" {
		return nil, nil
	}
	var role, text, sessionID string
	err := m.store.QueryRow(ctx, `SELECT role, text, session_id FROM messages WHERE id = ?`, messageID).
		Scan(&role, &text, &sessionID)
	if err == sql.ErrNoRows {
		return nil, newRequestError(codeBadRequest, "被回复的消息不存在")
	}
	if err != nil {
		return nil, fmt.Errorf("读取被回复消息失败: %w", err)
	}
	return &ReplySnapshot{
		ID:           messageID,
		Role:         role,
		Text:         truncateRunes(strings.TrimSpace(text), 200),
		SessionID:    sessionID,
		SessionTitle: m.sessionTitle(ctx, sessionID),
	}, nil
}

func (m *Module) attachReplySnapshots(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	cache := make(map[string]*ReplySnapshot)
	for i := range messages {
		id := strings.TrimSpace(messages[i].ReplyToID)
		if id == "" {
			continue
		}
		if snapshot, ok := cache[id]; ok {
			messages[i].ReplyTo = snapshot
			continue
		}
		snapshot, err := m.resolveReplySnapshot(ctx, id)
		if err != nil {
			continue
		}
		cache[id] = snapshot
		messages[i].ReplyTo = snapshot
	}
}

func replyQuoteContext(snapshot *ReplySnapshot) string {
	if snapshot == nil {
		return ""
	}
	return "[引用回复] " + snapshot.Role + "：" + snapshot.Text
}
