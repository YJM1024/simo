package chat

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"agentd/internal/core/eventlog"
)

// appendApprovalReport 把审批结果接回会话；幂等（同一 approval 只一条消息）。
func (m *Module) appendApprovalReport(ctx context.Context, approval Approval, status, result string) {
	sessionID := strings.TrimSpace(approval.SessionID)
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	reportID := "msg-report-" + approval.ID
	text := approvalReportText(approval, status, result)
	msg := Message{
		ID:          reportID,
		SessionID:   sessionID,
		Role:        RoleAgent,
		Text:        text,
		At:          time.Now().UnixMilli(),
		Status:      StatusDone,
		Attachments: []Attachment{},
		Tool:        approval.Tool,
		ApprovalID:  approval.ID,
		Category:    CategoryProgress,
		SessionPath: m.sessionPath(ctx, sessionID),
		AgentID:     m.sessionOwnerAgentID(ctx, sessionID),
	}
	inserted := false
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO messages(
			id, session_id, role, text, at, status, task_id, workflow_id, tool, approval_id, category)
			VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?)`,
			msg.ID, msg.SessionID, msg.Role, msg.Text, msg.At, msg.Status, msg.Tool, msg.ApprovalID, msg.Category)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		inserted = n > 0
		return nil
	})
	if !inserted {
		return
	}
	if m.events != nil {
		_, _ = m.events.Append(ctx, eventlog.TypeMessageCreated, msg)
	}
}

func approvalReportText(approval Approval, status, result string) string {
	result = strings.TrimSpace(result)
	if status == "denied" {
		return "已拒绝该工具调用，未执行：" + approval.Tool
	}
	lower := strings.ToLower(result)
	if strings.HasPrefix(lower, "error:") {
		return "审批已通过，但工具执行失败：\n" + result
	}
	var b strings.Builder
	b.WriteString("审批已通过，工具已执行（" + approval.Tool + "）。")
	if result != "" {
		b.WriteString("\n结果：")
		b.WriteString(result)
	}
	return b.String()
}
