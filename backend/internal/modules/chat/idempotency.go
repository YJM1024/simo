package chat

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"
)

// clientMutationId 幂等（AC-CONV-005-02 的发送去重部分）。
//
// 选型：与卡片动作一致，用 SQLite 唯一键占位（client_mutations 表），而不是进程内
// map。理由：
//  1. 现有架构已经有 card_action_receipts 的成熟范式（唯一键 claim → processing → done）；
//  2. 重启后去重记录仍在，重连重试不会因为进程重启而重复落库；
//  3. 不引入新依赖，也没有额外生命周期管理。
//
// 语义：
//   - clientMutationId 缺省/空白 → 完全走旧路径，不做任何读写；
//   - 首次提交 → 占位（message_id=”）→ 执行 → 回填 message_id；
//   - 重复提交且已完成 → 返回首次的 messageId，不产生新消息、不发事件；
//   - 重复提交时首次仍在执行 → 最多等待 clientMutationWaitTimeout，超时返回
//     mutation_in_progress 409；
//   - 首次执行失败（校验/归档等可重试错误）→ 删除占位，同一 id 重试会重新执行，
//     保持“失败不记忆”的旧行为；
//   - 占位行超过 clientMutationTTL 由下一次 claim 顺带清理（服务崩溃留下的
//     message_id=” 占位不会永久阻塞，因为 id 由前端按 tab+时间戳生成，不会复用）。
const (
	codeMutationInProgress = "mutation_in_progress"

	clientMutationTTL         = 7 * 24 * time.Hour
	clientMutationWaitTimeout = 5 * time.Second
	clientMutationPoll        = 20 * time.Millisecond
	clientMutationWriteLimit  = 2 * time.Second
)

// startTurnIdempotent 是 startTurnExplicit 的幂等包装：clientMutationID 非空时，
// 同一 id 只执行一次。返回的 messageID 在重复提交时是首次落库的消息 id。
func (m *Module) startTurnIdempotent(ctx context.Context, clientMutationID, sessionID, text string, class messageClass, attachmentIDs []string, replyToMessageID string, explicitSession bool) (string, bool, error) {
	clientMutationID = strings.TrimSpace(clientMutationID)
	if clientMutationID == "" {
		msg, err := m.startTurnExplicit(ctx, sessionID, text, class, attachmentIDs, replyToMessageID, explicitSession)
		if err != nil {
			return "", false, err
		}
		return msg.ID, false, nil
	}

	existingID, duplicated, err := m.beginClientMutation(ctx, clientMutationID, sessionID)
	if err != nil {
		return "", false, err
	}
	if duplicated {
		return existingID, true, nil
	}

	msg, err := m.startTurnExplicit(ctx, sessionID, text, class, attachmentIDs, replyToMessageID, explicitSession)
	if err != nil {
		// 失败不记忆：释放占位，客户端用同一 id 重试仍会重新执行并拿到同样的错误。
		m.releaseClientMutation(clientMutationID)
		return "", false, err
	}
	m.finishClientMutation(clientMutationID, msg.ID)
	return msg.ID, false, nil
}

// beginClientMutation 尝试领取 mutationId；duplicated=true 表示命中已完成的提交，
// 此时 messageID 是首次落库的消息 id。
func (m *Module) beginClientMutation(ctx context.Context, clientMutationID, sessionID string) (string, bool, error) {
	now := time.Now()
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		err := m.store.Write(ctx, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, `DELETE FROM client_mutations WHERE created_at < ?`,
				now.Add(-clientMutationTTL).UnixMilli()); err != nil {
				return err
			}
			_, err := tx.ExecContext(ctx, `INSERT INTO client_mutations(id, session_id, message_id, created_at, updated_at)
				VALUES (?, ?, '', ?, ?)`, clientMutationID, sessionID, now.UnixMilli(), now.UnixMilli())
			return err
		})
		if err == nil {
			return "", false, nil
		}
		lastErr = err

		messageID, exists, readErr := m.readClientMutation(ctx, clientMutationID)
		if readErr != nil {
			return "", false, readErr
		}
		if !exists {
			// 不是唯一键冲突，或首请求失败后已释放占位：重新领取。
			continue
		}
		if messageID != "" {
			return messageID, true, nil
		}

		deadline := time.Now().Add(clientMutationWaitTimeout)
		for time.Now().Before(deadline) {
			select {
			case <-ctx.Done():
				return "", false, ctx.Err()
			case <-time.After(clientMutationPoll):
			}
			messageID, exists, readErr = m.readClientMutation(ctx, clientMutationID)
			if readErr != nil {
				return "", false, readErr
			}
			if !exists {
				break
			}
			if messageID != "" {
				return messageID, true, nil
			}
		}
		if !exists {
			continue
		}
		return "", false, newRequestError(codeMutationInProgress, "同一请求正在处理，请稍后重试")
	}
	if lastErr != nil {
		return "", false, lastErr
	}
	return "", false, newRequestError(codeMutationInProgress, "同一请求正在处理，请稍后重试")
}

func (m *Module) readClientMutation(ctx context.Context, clientMutationID string) (string, bool, error) {
	var messageID string
	err := m.store.QueryRow(ctx, `SELECT message_id FROM client_mutations WHERE id = ?`, clientMutationID).Scan(&messageID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return messageID, true, nil
}

// finishClientMutation 回填结果。消息已经落库，回填失败只记录告警，不影响响应；
// 使用脱离请求上下文的短超时，避免客户端断线导致结果没写进去。
func (m *Module) finishClientMutation(clientMutationID, messageID string) {
	ctx, cancel := context.WithTimeout(context.Background(), clientMutationWriteLimit)
	defer cancel()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE client_mutations SET message_id = ?, updated_at = ? WHERE id = ?`,
			messageID, time.Now().UnixMilli(), clientMutationID)
		return err
	}); err != nil {
		m.log.Warn("回填 clientMutationId 结果失败", "err", err, "clientMutationId", clientMutationID, "messageId", messageID)
	}
}

func (m *Module) releaseClientMutation(clientMutationID string) {
	ctx, cancel := context.WithTimeout(context.Background(), clientMutationWriteLimit)
	defer cancel()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM client_mutations WHERE id = ? AND message_id = ''`, clientMutationID)
		return err
	}); err != nil {
		m.log.Warn("释放 clientMutationId 占位失败", "err", err, "clientMutationId", clientMutationID)
	}
}
