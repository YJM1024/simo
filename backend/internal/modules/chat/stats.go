package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"simo/internal/platform/httpserver"
)

type statsBucket struct {
	Start            int64  `json:"start"`
	End              int64  `json:"end"`
	Label            string `json:"label"`
	Value            int64  `json:"value"`
	Messages         int64  `json:"messages"`
	Tokens           int64  `json:"tokens"`
	Tasks            int64  `json:"tasks"`
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	ReasoningTokens  int64  `json:"reasoningTokens"`
}

type statsSession struct {
	SessionID        string `json:"sessionId"`
	SessionTitle     string `json:"sessionTitle,omitempty"`
	Messages         int64  `json:"messages"`
	Tokens           int64  `json:"tokens"`
	Tasks            int64  `json:"tasks"`
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	ReasoningTokens  int64  `json:"reasoningTokens"`
}

func (m *Module) handleStats(w http.ResponseWriter, r *http.Request) {
	metric := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("metric")))
	if metric == "" {
		metric = "messages"
	}
	if metric != "messages" && metric != "tokens" && metric != "tasks" {
		httpserver.WriteError(w, http.StatusBadRequest, "metric 只支持 messages|tokens|tasks")
		return
	}
	granularity := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("granularity")))
	if granularity == "" {
		granularity = "day"
	}
	if granularity != "day" && granularity != "week" && granularity != "month" {
		httpserver.WriteError(w, http.StatusBadRequest, "granularity 只支持 day|week|month")
		return
	}
	now := time.Now()
	to := now
	if raw := strings.TrimSpace(r.URL.Query().Get("to")); raw != "" {
		parsed, err := parseStatsTime(raw, true)
		if err != nil {
			httpserver.WriteError(w, http.StatusBadRequest, "to 时间非法")
			return
		}
		to = parsed
	}
	from := to.AddDate(0, 0, -30)
	if raw := strings.TrimSpace(r.URL.Query().Get("from")); raw != "" {
		parsed, err := parseStatsTime(raw, false)
		if err != nil {
			httpserver.WriteError(w, http.StatusBadRequest, "from 时间非法")
			return
		}
		if parsed.After(to) {
			httpserver.WriteError(w, http.StatusBadRequest, "from 不能晚于 to")
			return
		}
		from = parsed
	}
	sessionFilter := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if from.After(to) {
		httpserver.WriteError(w, http.StatusBadRequest, "from 不能晚于 to")
		return
	}

	buckets := buildStatsBuckets(from, to, granularity)
	bucketIndex := make(map[int64]int, len(buckets))
	for i := range buckets {
		bucketIndex[buckets[i].Start] = i
	}
	sessions := make(map[string]*statsSession)
	ensureSession := func(id string) *statsSession {
		if item, ok := sessions[id]; ok {
			return item
		}
		item := &statsSession{SessionID: id, SessionTitle: m.sessionTitle(context.Background(), id)}
		sessions[id] = item
		return item
	}
	addMessage := func(sessionID string, at int64) {
		ensureSession(sessionID).Messages++
		if idx, ok := bucketIndex[bucketStart(time.UnixMilli(at), granularity).UnixMilli()]; ok {
			buckets[idx].Messages++
		}
	}
	addTask := func(sessionID string, at int64) {
		ensureSession(sessionID).Tasks++
		if idx, ok := bucketIndex[bucketStart(time.UnixMilli(at), granularity).UnixMilli()]; ok {
			buckets[idx].Tasks++
		}
	}
	addTokens := func(sessionID string, at int64, prompt, completion, reasoning int64) {
		total := prompt + completion + reasoning
		item := ensureSession(sessionID)
		item.PromptTokens += prompt
		item.CompletionTokens += completion
		item.ReasoningTokens += reasoning
		item.Tokens += total
		if idx, ok := bucketIndex[bucketStart(time.UnixMilli(at), granularity).UnixMilli()]; ok {
			buckets[idx].PromptTokens += prompt
			buckets[idx].CompletionTokens += completion
			buckets[idx].ReasoningTokens += reasoning
			buckets[idx].Tokens += total
		}
	}

	fromMS := from.UnixMilli()
	toMS := to.UnixMilli()
	rows, err := m.store.Query(r.Context(), `SELECT session_id, at FROM messages
		WHERE at >= ? AND at <= ? AND internal = 0`, fromMS, toMS)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取消息统计失败")
		return
	}
	type statRow struct {
		SessionID string
		At        int64
	}
	messageRows := make([]statRow, 0, 32)
	for rows.Next() {
		var item statRow
		if rows.Scan(&item.SessionID, &item.At) == nil && (sessionFilter == "" || item.SessionID == sessionFilter) {
			messageRows = append(messageRows, item)
		}
	}
	_ = rows.Close()
	for _, item := range messageRows {
		addMessage(item.SessionID, item.At)
	}

	rows, err = m.store.Query(r.Context(), `SELECT session_id, created_at FROM tasks
		WHERE created_at >= ? AND created_at <= ?`, fromMS, toMS)
	if err == nil {
		taskRows := make([]statRow, 0, 16)
		for rows.Next() {
			var item statRow
			if rows.Scan(&item.SessionID, &item.At) == nil && (sessionFilter == "" || item.SessionID == sessionFilter) {
				taskRows = append(taskRows, item)
			}
		}
		_ = rows.Close()
		for _, item := range taskRows {
			addTask(item.SessionID, item.At)
		}
	}

	rows, err = m.store.Query(r.Context(), `SELECT at, payload FROM events
		WHERE type = ? AND at >= ? AND at <= ?`, "usage.recorded", fromMS, toMS)
	if err == nil {
		type usageEvent struct {
			At      int64
			Payload []byte
		}
		events := make([]usageEvent, 0, 16)
		for rows.Next() {
			var at int64
			var raw string
			if rows.Scan(&at, &raw) == nil {
				events = append(events, usageEvent{At: at, Payload: []byte(raw)})
			}
		}
		_ = rows.Close()
		type usagePayload struct {
			ReplyID   string `json:"replyId"`
			TaskID    string `json:"taskId"`
			SessionID string `json:"sessionId"`
			Usage     struct {
				PromptTokens     int64 `json:"promptTokens"`
				CompletionTokens int64 `json:"completionTokens"`
				ReasoningTokens  int64 `json:"reasoningTokens"`
				TotalTokens      int64 `json:"totalTokens"`
			} `json:"usage"`
		}
		sessionCache := make(map[string]string)
		for _, event := range events {
			var payload usagePayload
			if json.Unmarshal(event.Payload, &payload) != nil {
				continue
			}
			sessionID := strings.TrimSpace(payload.SessionID)
			if sessionID == "" && strings.TrimSpace(payload.ReplyID) != "" {
				if cached, ok := sessionCache[payload.ReplyID]; ok {
					sessionID = cached
				} else {
					_ = m.store.QueryRow(r.Context(), `SELECT session_id FROM messages WHERE id = ?`, payload.ReplyID).Scan(&sessionID)
					sessionCache[payload.ReplyID] = sessionID
				}
			}
			if sessionID == "" || (sessionFilter != "" && sessionID != sessionFilter) {
				continue
			}
			reasoning := payload.Usage.ReasoningTokens
			prompt := payload.Usage.PromptTokens
			completion := payload.Usage.CompletionTokens
			if prompt+completion+reasoning == 0 && payload.Usage.TotalTokens > 0 {
				completion = payload.Usage.TotalTokens
			}
			addTokens(sessionID, event.At, prompt, completion, reasoning)
		}
	}

	bySession := make([]statsSession, 0, len(sessions))
	for _, item := range sessions {
		bySession = append(bySession, *item)
	}
	totals := statsSession{}
	for i := range buckets {
		switch metric {
		case "messages":
			buckets[i].Value = buckets[i].Messages
		case "tasks":
			buckets[i].Value = buckets[i].Tasks
		case "tokens":
			buckets[i].Value = buckets[i].Tokens
		}
	}
	for _, item := range bySession {
		totals.Messages += item.Messages
		totals.Tokens += item.Tokens
		totals.Tasks += item.Tasks
		totals.PromptTokens += item.PromptTokens
		totals.CompletionTokens += item.CompletionTokens
		totals.ReasoningTokens += item.ReasoningTokens
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "metric": metric, "granularity": granularity,
		"from": from.UnixMilli(), "to": to.UnixMilli(),
		"buckets": buckets, "bySession": bySession, "totals": totals,
	})
}

func parseStatsTime(raw string, endOfDay bool) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	if value, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return time.UnixMilli(value), nil
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02 15:04:05"} {
		if parsed, err := time.ParseInLocation(layout, raw, time.Local); err == nil {
			return parsed, nil
		}
	}
	if parsed, err := time.ParseInLocation("2006-01-02", raw, time.Local); err == nil {
		if endOfDay {
			return parsed.Add(24*time.Hour - time.Millisecond), nil
		}
		return parsed, nil
	}
	return time.Time{}, fmt.Errorf("非法时间")
}

func bucketStart(t time.Time, granularity string) time.Time {
	t = t.In(time.Local)
	switch granularity {
	case "week":
		offset := (int(t.Weekday()) + 6) % 7
		return time.Date(t.Year(), t.Month(), t.Day()-offset, 0, 0, 0, 0, time.Local)
	case "month":
		return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.Local)
	default:
		return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.Local)
	}
}

func nextBucket(t time.Time, granularity string) time.Time {
	switch granularity {
	case "week":
		return t.AddDate(0, 0, 7)
	case "month":
		return t.AddDate(0, 1, 0)
	default:
		return t.AddDate(0, 0, 1)
	}
}

func buildStatsBuckets(from, to time.Time, granularity string) []statsBucket {
	start := bucketStart(from, granularity)
	end := to.In(time.Local)
	out := make([]statsBucket, 0, 16)
	for i := 0; i < 1000; i++ {
		next := nextBucket(start, granularity)
		if start.After(end) {
			break
		}
		out = append(out, statsBucket{
			Start: start.UnixMilli(), End: next.Add(-time.Millisecond).UnixMilli(),
			Label: statsLabel(start, granularity),
		})
		start = next
	}
	return out
}

func statsLabel(t time.Time, granularity string) string {
	switch granularity {
	case "month":
		return t.Format("2006-01")
	case "week":
		return t.Format("2006-01-02") + " 周"
	default:
		return t.Format("2006-01-02")
	}
}
