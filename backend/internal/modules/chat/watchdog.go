package chat

import (
	"context"
	"database/sql"
	"os"
	"strconv"
	"strings"
	"time"

	"simo/internal/core/eventlog"
)

const (
	defaultStreamIdleTimeout = 120 * time.Second
	defaultTurnTotalTimeout  = 10 * time.Minute
)

func envDurationMs(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 {
		return fallback
	}
	return time.Duration(value) * time.Millisecond
}

func streamIdleTimeout() time.Duration {
	return envDurationMs("SIMO_STREAM_IDLE_TIMEOUT_MS", defaultStreamIdleTimeout)
}

func turnTotalTimeout() time.Duration {
	return envDurationMs("SIMO_TURN_TIMEOUT_MS", defaultTurnTotalTimeout)
}

// recoverStaleStreaming 修复历史遗留的 streaming 消息（服务启动时没有活跃 turn）。
func (m *Module) recoverStaleStreaming(ctx context.Context) {
	rows, err := m.store.Query(ctx, `SELECT id FROM messages WHERE status='streaming' ORDER BY rowid ASC`)
	if err != nil {
		return
	}
	ids := make([]string, 0, 8)
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	_ = rows.Close()
	if len(ids) == 0 {
		return
	}
	m.mu.Lock()
	active := make(map[string]bool, len(m.active))
	for id := range m.active {
		active[id] = true
	}
	m.mu.Unlock()
	now := time.Now().UnixMilli()
	recovered := 0
	for _, id := range ids {
		if active[id] {
			continue
		}
		reason := "服务重启时检测到未完成的回复，已自动标记为失败。"
		if err := m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE messages SET status='failed', finished_at=?,
				text=CASE WHEN trim(text)='' THEN ? ELSE text || ? END
				WHERE id=? AND status='streaming'`,
				now, reason, "\n\n["+reason+"]", id)
			return err
		}); err != nil {
			continue
		}
		recovered++
		_, _ = m.events.Append(ctx, eventlog.TypeReplyDone, donePayload{
			ID: id, Status: StatusFailed, Reason: "instance_restarted_streaming_recovered"})
		_, _ = m.events.Append(ctx, eventlog.TypeMessageDone, donePayload{
			ID: id, Status: StatusFailed, Reason: "instance_restarted_streaming_recovered"})
		m.insertRecoveryAction(ctx, "message", id, "streaming_recovered", map[string]any{
			"reason": "instance restarted while streaming",
		})
	}
	if recovered > 0 {
		if _, err := m.events.Append(ctx, eventlog.TypeStatus, statusPayload{State: "idle"}); err != nil {
			m.log.Warn("写 status(idle) 失败", "err", err)
		}
		m.log.Warn("已恢复遗留 streaming 消息", "count", recovered)
	}
}

// checkTurnWatchdog 由 runtime ticker 每秒调用；超时后先取消再落 failed。
func (m *Module) checkTurnWatchdog() {
	idleLimit := streamIdleTimeout()
	totalLimit := turnTotalTimeout()
	now := time.Now().UnixMilli()
	m.mu.Lock()
	active := make([]*activeTurn, 0, len(m.active))
	for _, turn := range m.active {
		active = append(active, turn)
	}
	m.mu.Unlock()
	for _, turn := range active {
		if turn == nil || turn.timeout() != "" {
			continue
		}
		last := turn.lastActivity.Load()
		started := turn.StartedAt
		reason := ""
		if started > 0 && now-started > totalLimit.Milliseconds() {
			reason = "reply_total_timeout"
		} else if last > 0 && now-last > idleLimit.Milliseconds() {
			reason = "reply_idle_timeout"
		}
		if reason == "" {
			continue
		}
		if !turn.setTimeoutReason(reason) {
			continue
		}
		turn.cancel()
		go m.failTimedOut(turn, reason)
	}
}

func (m *Module) failTimedOut(active *activeTurn, reason string) {
	if active == nil || reason == "" {
		return
	}
	active.timeoutOnce.Do(func() {
		bg := context.Background()
		label := "回复超时：长时间没有新内容，已自动中止。"
		if reason == "reply_total_timeout" {
			label = "回复超时：本轮总时长超过上限，已自动中止。"
		} else if reason == "instance_restarted_streaming_recovered" {
			label = "服务重启时检测到未完成的回复，已自动标记为失败。"
		}
		var text string
		_ = m.store.QueryRow(bg, `SELECT text FROM messages WHERE id=?`, active.ReplyID).Scan(&text)
		if strings.TrimSpace(text) == "" {
			text = label + " 你可以重新发送消息。"
		} else {
			text = strings.TrimRight(text, " \n") + "\n\n[" + label + "]"
		}
		now := time.Now().UnixMilli()
		_ = m.store.Write(bg, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(bg, `UPDATE messages SET status='failed',text=?,finished_at=?
				WHERE id=? AND status='streaming'`, text, now, active.ReplyID)
			return err
		})
		payload := donePayload{ID: active.ReplyID, Status: StatusFailed, Reason: reason}
		_, _ = m.events.Append(bg, eventlog.TypeReplyDone, payload)
		_, _ = m.events.Append(bg, eventlog.TypeMessageDone, payload)
		_ = m.endTurn(bg, active.ID, "timeout", now)
		m.recordTurnMetrics(active, "timeout")
		m.insertRecoveryAction(bg, "message", active.ReplyID, "streaming_timeout", map[string]any{
			"reason": reason, "text": label,
		})
		m.log.Warn("回复超时已中止", "replyId", active.ReplyID, "reason", reason)
	})
}

func (m *Module) attachFinishedAt(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	ids := cardMessageIDs(messages)
	if len(ids) == 0 {
		return
	}
	byID := map[string]int64{}
	for _, chunk := range chunkStrings(ids, 80) {
		placeholders := make([]string, len(chunk))
		args := make([]any, len(chunk))
		for i, id := range chunk {
			placeholders[i] = "?"
			args[i] = id
		}
		rows, err := m.store.Query(ctx, `SELECT id,finished_at FROM messages
			WHERE id IN (`+strings.Join(placeholders, ",")+`)`, args...)
		if err != nil {
			continue
		}
		for rows.Next() {
			var id string
			var finishedAt int64
			if rows.Scan(&id, &finishedAt) == nil {
				byID[id] = finishedAt
			}
		}
		_ = rows.Close()
	}
	for i := range messages {
		messages[i].FinishedAt = byID[messages[i].ID]
	}
}
