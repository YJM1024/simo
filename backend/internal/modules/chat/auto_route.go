package chat

import (
	"context"
	"database/sql"
	"os"
	"sort"
	"strings"
	"time"
	"unicode"

	"simo/internal/core/eventlog"
)

type autoRouteCandidate struct {
	ID       string
	Title    string
	Context  string
	Score    float64
	Explicit bool
}

func autoRouteEnabled() bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("SIMO_AUTO_ROUTE")))
	switch raw {
	case "0", "false", "off", "no":
		return false
	}
	return true
}

func explicitMainSessionIntent(text string) bool {
	lower := strings.ToLower(text)
	for _, marker := range []string{"就在主会话回答", "留在主会话", "主会话回答", "别路由", "不要路由", "不用路由", "不用切换会话"} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func normalizeRouteText(text string) string {
	text = strings.ToLower(strings.TrimSpace(text))
	var b strings.Builder
	for _, r := range text {
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}

func routeBigrams(text string) map[string]bool {
	runes := []rune(text)
	out := map[string]bool{}
	for i := 0; i+1 < len(runes); i++ {
		gram := string(runes[i : i+2])
		if routeStopGrams[gram] {
			continue
		}
		out[gram] = true
	}
	if len(runes) == 1 && !routeStopGrams[string(runes)] {
		out[string(runes)] = true
	}
	return out
}

var routeStopGrams = map[string]bool{
	"今天": true, "明天": true, "昨天": true, "天气": true, "随便": true,
	"聊聊": true, "你好": true, "谢谢": true, "什么": true, "怎么": true,
	"一个": true, "这个": true, "那个": true, "问题": true, "看看": true,
	"帮我": true, "可以": true, "还是": true, "就是": true, "没有": true,
}

// parseCreateSessionRequest 识别“建/创建/新建一个 <标题> 子会话/会话”并解析标题。
func parseCreateSessionRequest(text string) (string, bool) {
	text = strings.TrimSpace(text)
	if text == "" {
		return "", false
	}
	suffixes := []string{"子会话", "会话"}
	suffixIndex, suffix := -1, ""
	for _, candidate := range suffixes {
		if index := strings.Index(text, candidate); index >= 0 {
			suffixIndex, suffix = index, candidate
			break
		}
	}
	if suffixIndex < 0 {
		return "", false
	}
	verbs := []string{"创建", "新建", "建立", "开设", "建一个", "建", "开一个", "开"}
	verbIndex, verb := -1, ""
	for _, candidate := range verbs {
		if index := strings.Index(text, candidate); index >= 0 && index < suffixIndex {
			verbIndex, verb = index, candidate
			break
		}
	}
	if verbIndex < 0 {
		return "", false
	}
	title := strings.TrimSpace(text[verbIndex+len(verb) : suffixIndex])
	if title == "" && suffixIndex+len(suffix) < len(text) {
		title = strings.TrimSpace(text[suffixIndex+len(suffix):])
	}
	title = cleanCreateSessionTitle(title)
	if title == "" {
		title = "新会话"
	}
	runes := []rune(title)
	if len(runes) > 60 {
		title = string(runes[:60])
	}
	return title, true
}

func cleanCreateSessionTitle(raw string) string {
	title := strings.TrimSpace(raw)
	title = strings.Trim(title, "：:，,。.「」『』\"'“”‘’[]【】（）() ")
	for _, prefix := range []string{"一个", "一间", "个", "间", "叫", "名为", "名称为", "名称是", "叫做"} {
		if strings.HasPrefix(title, prefix) {
			title = strings.TrimSpace(strings.TrimPrefix(title, prefix))
		}
	}
	for _, suffix := range []string{"的子会话", "的会话", "这个子会话", "这个会话", "子会话", "会话"} {
		title = strings.TrimSpace(strings.TrimSuffix(title, suffix))
	}
	title = strings.Trim(title, "：:，,。.「」『』\"'“”‘’[]【】（）() ")
	title = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(title), "的"))
	return title
}

func (m *Module) sessionIsActiveChild(ctx context.Context, parentID, childID string) bool {
	var count int
	_ = m.store.QueryRow(ctx, `SELECT COUNT(*) FROM sessions WHERE id=? AND parent_id=? AND archived=0`, childID, parentID).Scan(&count)
	return count > 0
}

func (m *Module) autoRouteChildren(ctx context.Context, parentID string) []autoRouteCandidate {
	rows, err := m.store.Query(ctx, `SELECT id,title FROM sessions WHERE parent_id=? AND archived=0 ORDER BY created_at ASC`, parentID)
	if err != nil {
		return nil
	}
	base := make([]autoRouteCandidate, 0, 8)
	for rows.Next() {
		var candidate autoRouteCandidate
		if rows.Scan(&candidate.ID, &candidate.Title) == nil {
			base = append(base, candidate)
		}
	}
	_ = rows.Close()
	// 必须先关闭 sessions 游标，再查每个子会话的 overview/messages；单连接 SQLite 不能嵌套。
	for i := range base {
		base[i].Context = m.autoRouteChildContext(ctx, base[i].ID)
	}
	sort.SliceStable(base, func(i, j int) bool { return base[i].ID < base[j].ID })
	return base
}

func (m *Module) autoRouteChildContext(ctx context.Context, childID string) string {
	parts := make([]string, 0, 8)
	var goal, current, notes string
	if m.store.QueryRow(ctx, `SELECT goal,current,notes FROM session_overviews WHERE session_id=?`, childID).
		Scan(&goal, &current, &notes) == nil {
		parts = append(parts, goal, current, notes)
	}
	rows, err := m.store.Query(ctx, `SELECT text FROM messages WHERE session_id=? AND role='user' AND internal = 0
		ORDER BY rowid DESC LIMIT 8`, childID)
	if err == nil {
		for rows.Next() {
			var text string
			if rows.Scan(&text) == nil {
				parts = append(parts, text)
			}
		}
		_ = rows.Close()
	}
	return strings.Join(parts, " ")
}

func (m *Module) emitRouteAudit(ctx context.Context, fromSessionID, toSessionID, userMessageID, reason string) {
	if m.events == nil {
		return
	}
	_, _ = m.events.Append(ctx, eventlog.TypeMessageRouted, map[string]any{
		"fromSessionId": fromSessionID, "toSessionId": toSessionID,
		"userMessageId": userMessageID, "reason": reason,
		"routedFrom": fromSessionID, "routedTo": toSessionID,
	})
}

func (m *Module) recordMessageRoute(ctx context.Context, messageID, fromSessionID, toSessionID, reason string) {
	if messageID == "" || fromSessionID == "" || toSessionID == "" {
		return
	}
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO message_routes(
			message_id,from_session_id,to_session_id,reason,created_at) VALUES (?,?,?,?,?)`,
			messageID, fromSessionID, toSessionID, reason, time.Now().UnixMilli())
		return err
	})
}

func (m *Module) attachRouteFields(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	ids := cardMessageIDs(messages)
	if len(ids) == 0 {
		return
	}
	placeholders := make([]string, len(ids))
	args := make([]any, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}
	rows, err := m.store.Query(ctx, `SELECT message_id,from_session_id,to_session_id FROM message_routes
		WHERE message_id IN (`+strings.Join(placeholders, ",")+`)`, args...)
	if err != nil {
		return
	}
	defer rows.Close()
	type route struct{ from, to string }
	routes := map[string]route{}
	for rows.Next() {
		var id, from, to string
		if rows.Scan(&id, &from, &to) == nil {
			routes[id] = route{from: from, to: to}
		}
	}
	for i := range messages {
		if route, ok := routes[messages[i].ID]; ok {
			messages[i].RoutedFrom = route.from
			messages[i].RoutedTo = route.to
		}
	}
}
