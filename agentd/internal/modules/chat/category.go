package chat

import (
	"context"
	"database/sql"
	"strings"
)

// 消息分类（M14，仅 agent 消息）。
const (
	CategoryRequirement   = "requirement"
	CategoryClarification = "clarification"
	CategoryProgress      = "progress"
	CategoryConsultation  = "consultation"
)

// parseCategoryMarker 解析模型首行 `@@CATEGORY: ...`。
// 返回分类、是否找到合法标记、剥离标记后的正文。
func parseCategoryMarker(text string) (string, bool, string) {
	lineEnd := strings.IndexByte(text, '\n')
	first := text
	rest := ""
	if lineEnd >= 0 {
		first = text[:lineEnd]
		rest = text[lineEnd+1:]
		rest = strings.TrimPrefix(rest, "\r")
	}
	first = strings.TrimSpace(first)
	if !strings.HasPrefix(first, "@@CATEGORY:") {
		return "", false, text
	}
	value := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(first, "@@CATEGORY:")))
	switch value {
	case CategoryRequirement, CategoryClarification, CategoryProgress, CategoryConsultation:
		return value, true, rest
	default:
		return CategoryConsultation, true, rest
	}
}

func categoryFromFirstLine(text string) (string, string, bool) {
	category, found, rest := parseCategoryMarker(text)
	if found {
		return category, strings.TrimPrefix(rest, "\n"), true
	}
	return "", text, false
}

func (m *Module) setReplyCategory(ctx context.Context, replyID, category string) {
	if strings.TrimSpace(replyID) == "" || strings.TrimSpace(category) == "" {
		return
	}
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE messages SET category = ? WHERE id = ?`, category, replyID)
		return err
	})
}
