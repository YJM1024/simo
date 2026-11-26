package tasks

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	coretask "simo/internal/core/task"
)

// PRD-TASK-003：任务开始/结束各写一条 category=progress 的 agent 消息。
// 开始消息与 queued→running 的状态迁移同事务，CAS 保证同一 attempt 只写一条；
// 结束消息以 tasks.end_message_id 为空作为 CAS 条件，保证一次终态只写一条。
// 两条消息都不写 batch_id：批量汇总卡的位置不变，任务卡与它们并存。

func (m *Module) beginTaskNotice(ctx context.Context, task *coretask.Task, progress int) bool {
	if task.Status == coretask.StatusRunning {
		// 预算/确认恢复走的是 running→running，不是新 attempt，不重复写开始消息。
		return true
	}
	if task.Status != coretask.StatusQueued && task.Status != coretask.StatusPending {
		return false
	}
	now := time.Now().UnixMilli()
	messageID := "msg-" + randomHex(8)
	text := "任务开始：" + task.Title
	written := false
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE tasks SET status=?, progress=?, report_message_id=?,
			started_at=CASE WHEN started_at=0 THEN ? ELSE started_at END, updated_at=?
			WHERE id=? AND attempt=? AND status IN ('queued', 'pending')`,
			string(coretask.StatusRunning), progress, messageID, now, now, task.ID, task.Attempt)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return nil
		}
		if err := insertTaskNoticeTx(ctx, tx, messageID, *task, text, now); err != nil {
			return err
		}
		written = true
		return nil
	})
	if err != nil {
		m.log.Warn("写任务开始消息失败", "err", err, "taskId", task.ID)
		return false
	}
	if !written {
		// 状态已被取消或另一次 attempt 推进，调用方不应继续执行。
		return false
	}
	task.Status = coretask.StatusRunning
	task.Progress = progress
	task.ReportMessageID = messageID
	if task.StartedAt == 0 {
		task.StartedAt = now
	}
	task.UpdatedAt = now
	m.emit(ctx, eventlog.TypeMessageCreated, map[string]any{
		"id": messageID, "messageId": messageID, "sessionId": task.SessionID,
		"role": "agent", "text": text, "category": "progress",
		"taskId": task.ID, "workflowId": task.WorkflowID, "at": now, "status": "done",
	})
	return true
}

// finalizeTask 在任务进入终态后写结束消息；重复调用与并发调用只落一条。
func (m *Module) finalizeTask(ctx context.Context, task *coretask.Task) {
	if task == nil || !isTerminalStatus(task.Status) || task.EndMessageID != "" {
		return
	}
	artifacts, _ := m.ListArtifacts(ctx, task.ID)
	text := endTaskNoticeText(*task, artifacts)
	now := time.Now().UnixMilli()
	messageID := "msg-" + randomHex(8)
	written := false
	err := m.store.Write(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `UPDATE tasks SET end_message_id=?, updated_at=?
			WHERE id=? AND end_message_id='' AND status=?`,
			messageID, now, task.ID, task.Status)
		if err != nil {
			return err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if affected == 0 {
			return nil
		}
		if err := insertTaskNoticeTx(ctx, tx, messageID, *task, text, now); err != nil {
			return err
		}
		written = true
		return nil
	})
	if err != nil {
		m.log.Warn("写任务结束消息失败", "err", err, "taskId", task.ID, "status", task.Status)
		return
	}
	if !written {
		return
	}
	task.EndMessageID = messageID
	task.UpdatedAt = now
	m.emit(ctx, eventlog.TypeMessageCreated, map[string]any{
		"id": messageID, "messageId": messageID, "sessionId": task.SessionID,
		"role": "agent", "text": text, "category": "progress",
		"taskId": task.ID, "workflowId": task.WorkflowID, "at": now, "status": "done",
	})
	m.emit(ctx, eventlog.TypeTaskUpdated, m.taskEventV2(*task, []string{"endMessageId"}))
}

func insertTaskNoticeTx(ctx context.Context, tx *sql.Tx, messageID string, task coretask.Task, text string, at int64) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO messages
		(id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category, reply_to_id, finished_at, internal, batch_id)
		VALUES (?, ?, 'agent', ?, ?, 'done', ?, ?, '', '', 'progress', '', ?, 0, '')`,
		messageID, task.SessionID, text, at, task.ID, task.WorkflowID, at)
	return err
}

func endTaskNoticeText(task coretask.Task, artifacts []coretask.Artifact) string {
	conclusion := strings.TrimSpace(task.Summary)
	if conclusion == "" {
		conclusion = "任务已" + terminalStatusLabel(task.Status)
	}
	names := make([]string, 0, len(artifacts))
	for _, artifact := range artifacts {
		if strings.TrimSpace(artifact.Name) != "" {
			names = append(names, artifact.Name)
		}
	}
	var b strings.Builder
	b.WriteString("任务结束：")
	b.WriteString(task.Title)
	b.WriteString("\n状态：")
	b.WriteString(terminalStatusLabel(task.Status))
	b.WriteString("\n结论：")
	b.WriteString(conclusion)
	b.WriteString("\n产物：")
	if len(names) == 0 {
		b.WriteString("无")
	} else {
		b.WriteString(strings.Join(names, "、"))
	}
	return b.String()
}

func terminalStatusLabel(status string) string {
	switch status {
	case coretask.StatusDone:
		return "已完成"
	case coretask.StatusFailed:
		return "失败"
	case coretask.StatusCancelled:
		return "已取消"
	case coretask.StatusInterrupted:
		return "已中断"
	default:
		return status
	}
}
