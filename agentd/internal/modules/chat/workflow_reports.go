package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"agentd/internal/core/eventlog"
)

// consumeTaskReports 把任务编排的逐任务汇报写成普通 agent 消息（M10）。
func (m *Module) consumeTaskReports(ch <-chan eventlog.Event) {
	defer m.eventWG.Done()
	for ev := range ch {
		if ev.Type != eventlog.TypeTaskReport {
			continue
		}
		var payload struct {
			ReportID   string `json:"reportId"`
			TaskID     string `json:"taskId"`
			WorkflowID string `json:"workflowId"`
			SessionID  string `json:"sessionId"`
			Title      string `json:"title"`
			Text       string `json:"text"`
			Status     string `json:"status"`
		}
		if err := json.Unmarshal(ev.Payload, &payload); err != nil {
			continue
		}
		if strings.TrimSpace(payload.ReportID) == "" || strings.TrimSpace(payload.SessionID) == "" ||
			strings.TrimSpace(payload.Text) == "" {
			continue
		}
		msg := Message{
			ID:           payload.ReportID,
			SessionID:    payload.SessionID,
			SessionTitle: m.sessionTitle(context.Background(), payload.SessionID),
			Role:         RoleAgent,
			Text:         payload.Text,
			At:           time.Now().UnixMilli(),
			Status:       StatusDone,
			Attachments:  []Attachment{},
			TaskID:       payload.TaskID,
			WorkflowID:   payload.WorkflowID,
			Category:     CategoryProgress,
			SessionPath:  m.sessionPath(context.Background(), payload.SessionID),
			AgentID:      m.sessionOwnerAgentID(context.Background(), payload.SessionID),
		}
		inserted := false
		_ = m.store.Write(context.Background(), func(tx *sql.Tx) error {
			res, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO messages(
				id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?)`,
				msg.ID, msg.SessionID, msg.Role, msg.Text, msg.At, msg.Status, msg.TaskID, msg.WorkflowID, msg.Category)
			if err != nil {
				return err
			}
			n, _ := res.RowsAffected()
			inserted = n > 0
			return nil
		})
		if !inserted {
			continue
		}
		if m.events != nil {
			_, _ = m.events.Append(context.Background(), eventlog.TypeMessageCreated, msg)
		}
	}
}
