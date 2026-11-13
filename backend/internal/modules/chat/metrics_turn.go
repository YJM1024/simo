package chat

import (
	"context"
	"database/sql"
	"time"
)

// recordTurnMetrics 每个 Turn 只成功落一条；失败只记日志，不影响消息落定。
func (m *Module) recordTurnMetrics(active *activeTurn, status string) {
	if active == nil || active.ID == "" || active.ReplyID == "" {
		return
	}
	active.metricsOnce.Do(func() {
		finished := time.Now().UnixMilli()
		first := active.firstTokenAt.Load()
		ttft := int64(0)
		if first > 0 && first >= active.StartedAt {
			ttft = first - active.StartedAt
		}
		duration := finished - active.StartedAt
		if duration < 0 {
			duration = 0
		}
		prompt := active.promptTokens.Load()
		completion := active.completionTokens.Load()
		reasoning := active.reasoningTokens.Load()
		total := active.totalTokens.Load()
		if prompt+completion+reasoning > total {
			total = prompt + completion + reasoning
		}
		ctx := context.Background()
		if err := m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO turn_metrics(
				turn_id, session_id, reply_id, status, started_at, first_token_at, finished_at,
				ttft_ms, duration_ms, prompt_tokens, completion_tokens, reasoning_tokens, total_tokens,
				model, source)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'live')`,
				active.ID, active.SessionID, active.ReplyID, status, active.StartedAt, first, finished,
				ttft, duration, prompt, completion, reasoning, total, active.model)
			return err
		}); err != nil {
			m.log.Warn("记录指标失败", "err", err, "turnId", active.ID, "replyId", active.ReplyID)
		}
	})
}
