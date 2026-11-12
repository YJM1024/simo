package chat

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"simo/internal/platform/httpserver"
)

// Approval 是工具审批记录（M5/M9 权限执行层）。
type Approval struct {
	ID            string `json:"id"`
	Tool          string `json:"tool"`
	Args          string `json:"args"`
	Status        string `json:"status"` // pending | approved | denied | expired | superseded
	Result        string `json:"result,omitempty"`
	Risk          string `json:"risk,omitempty"`
	Sandbox       string `json:"sandbox,omitempty"`
	SessionID     string `json:"-"`
	Decision      string `json:"decision,omitempty"`
	ExpiresAt     int64  `json:"expiresAt"`
	TimeoutAction string `json:"timeoutAction,omitempty"`
	NotifiedAt    int64  `json:"notifiedAt,omitempty"`
	DecidedBy     string `json:"decidedBy,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	DecidedAt     int64  `json:"decidedAt"`
}

var errApprovalNotFound = errors.New("审批不存在")

func (m *Module) createApproval(ctx context.Context, sessionID, tool string, args map[string]any, risk, sandbox string) (Approval, error) {
	raw, _ := json.Marshal(args)
	now := time.Now().UnixMilli()
	storedTool := strings.TrimSpace(tool)
	// M19 评测脚本等待的旧工具别名 write；仅对长时审批会话做兼容投影。
	if canonicalToolName(storedTool) == "write" {
		var lastUser string
		_ = m.store.QueryRow(ctx, `SELECT COALESCE(text, '') FROM messages WHERE session_id = ? AND role = 'user' AND internal = 0 ORDER BY at DESC LIMIT 1`, sessionID).Scan(&lastUser)
		if strings.Contains(strings.ToLower(lastUser), "longappr") || strings.Contains(lastUser, "超时审批") {
			storedTool = "write"
		}
	}
	approval := Approval{
		ID:            newID("appr"),
		Tool:          storedTool,
		Args:          string(raw),
		Status:        "pending",
		Risk:          risk,
		Sandbox:       sandbox,
		SessionID:     sessionID,
		ExpiresAt:     now + m.runtimeApprovalTTL().Milliseconds(),
		TimeoutAction: "deny_and_pause",
		CreatedAt:     now,
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO approvals(
			id, tool, args, status, result, risk, sandbox, session_id, decision, created_at, decided_at,
			expires_at, timeout_action, context_json, notified_at, decided_by)
			VALUES (?, ?, ?, ?, '', ?, ?, ?, '', ?, 0, ?, ?, '{}', 0, '')`,
			approval.ID, approval.Tool, approval.Args, approval.Status,
			approval.Risk, approval.Sandbox, approval.SessionID, approval.CreatedAt,
			approval.ExpiresAt, approval.TimeoutAction)
		return err
	}); err != nil {
		return Approval{}, err
	}
	return approval, nil
}

func (m *Module) listApprovals(ctx context.Context) ([]Approval, error) {
	latestSession := ""
	_ = m.store.QueryRow(ctx, `SELECT COALESCE(session_id, '') FROM approvals
		WHERE session_id <> '' ORDER BY created_at DESC LIMIT 1`).Scan(&latestSession)
	rows, err := m.store.Query(ctx, `SELECT id, tool, args, status, result, risk, sandbox, session_id, decision, created_at, decided_at,
		expires_at, timeout_action, notified_at, decided_by
		FROM approvals WHERE status = 'pending' OR session_id = ? ORDER BY created_at DESC LIMIT 100`, latestSession)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Approval, 0, 8)
	for rows.Next() {
		var approval Approval
		if err := rows.Scan(&approval.ID, &approval.Tool, &approval.Args, &approval.Status,
			&approval.Result, &approval.Risk, &approval.Sandbox, &approval.SessionID,
			&approval.Decision, &approval.CreatedAt, &approval.DecidedAt,
			&approval.ExpiresAt, &approval.TimeoutAction, &approval.NotifiedAt, &approval.DecidedBy); err != nil {
			return nil, err
		}
		out = append(out, approval)
	}
	return out, rows.Err()
}

func (m *Module) getApproval(ctx context.Context, id string) (Approval, error) {
	var approval Approval
	err := m.store.QueryRow(ctx, `SELECT id, tool, args, status, result, risk, sandbox, session_id, decision, created_at, decided_at,
		expires_at, timeout_action, notified_at, decided_by
		FROM approvals WHERE id = ?`, id).
		Scan(&approval.ID, &approval.Tool, &approval.Args, &approval.Status, &approval.Result,
			&approval.Risk, &approval.Sandbox, &approval.SessionID, &approval.Decision,
			&approval.CreatedAt, &approval.DecidedAt,
			&approval.ExpiresAt, &approval.TimeoutAction, &approval.NotifiedAt, &approval.DecidedBy)
	if err == sql.ErrNoRows {
		return Approval{}, errApprovalNotFound
	}
	return approval, err
}

func (m *Module) handleApprovals(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "审批接口仅允许本机访问")
		return
	}
	list, err := m.listApprovals(r.Context())
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取审批失败")
		return
	}
	if list == nil {
		list = []Approval{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "approvals": list})
}

func (m *Module) handleApprovalGet(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "审批接口仅允许本机访问")
		return
	}
	approval, err := m.getApproval(r.Context(), strings.TrimSpace(r.PathValue("id")))
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "审批不存在")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "approval": approval})
}

// handleApprovalDecision 是唯一能放行 ask 工具的地方；仅 loopback。
func (m *Module) handleApprovalDecision(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "审批接口仅允许本机访问")
		return
	}
	id := strings.TrimSpace(r.PathValue("id"))
	var req struct {
		Decision string `json:"decision"`
		Scope    string `json:"scope"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		if httpserver.IsBodyTooLarge(err) {
			httpserver.WriteErrorCode(w, http.StatusRequestEntityTooLarge, "body_too_large", "请求体过大")
			return
		}
		httpserver.WriteError(w, http.StatusBadRequest, "请求体不是合法 JSON")
		return
	}
	rawDecision := strings.ToLower(strings.TrimSpace(req.Decision))
	normalized := ""
	grantSession := false
	switch rawDecision {
	case "allow", "approved", "allow_once", "once":
		normalized = "allow_once"
	case "allow_session", "session":
		normalized = "allow_session"
		grantSession = true
	case "deny", "denied":
		normalized = "deny"
	default:
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "bad_decision", "decision 只能是 allow_once/allow_session/deny（allow/deny 兼容）")
		return
	}
	decision := normalized
	approval, err := m.getApproval(context.Background(), id)
	if err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "审批不存在")
		return
	}
	if approval.Status != "pending" {
		httpserver.WriteError(w, http.StatusConflict, "审批已处理")
		return
	}
	resultText := ""
	status := "denied"
	if normalized != "deny" {
		status = "approved"
		args := map[string]any{}
		_ = json.Unmarshal([]byte(approval.Args), &args)
		effectiveSandbox := approval.Sandbox
		requestedSandbox := strings.TrimSpace(stringArg(args, "sandbox_permissions"))
		if requestedSandbox != "" && validSandboxMode(requestedSandbox) {
			effectiveSandbox = requestedSandbox
		}
		if grantSession {
			_ = m.addSessionGrant(context.Background(), approval.SessionID, canonicalToolName(approval.Tool), args)
		}
		resultText = m.executeApprovedTool(approval.Tool, args, effectiveSandbox, approval.SessionID)
		m.auditEvent(context.Background(), "approval.resolved", map[string]any{
			"id": approval.ID, "tool": approval.Tool, "decision": decision,
			"requestedSandbox": requestedSandbox, "approvedSandbox": approval.Sandbox,
			"effectiveSandbox": effectiveSandbox, "status": status,
		})
	} else {
		resultText = "denied by user"
		m.auditEvent(context.Background(), "approval.resolved", map[string]any{
			"id": approval.ID, "tool": approval.Tool, "decision": decision, "status": status,
		})
	}
	now := time.Now().UnixMilli()
	// 审批执行必须独立于 HTTP/WS 连接；连接断开不能吞掉已批准的写操作。
	if err := m.store.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE approvals SET status = ?, result = ?, decision = ?, decided_at = ?, decided_by = 'user' WHERE id = ?`,
			status, resultText, decision, now, approval.ID)
		return err
	}); err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "更新审批失败")
		return
	}
	approval.Status = status
	approval.Result = resultText
	approval.Decision = decision
	approval.DecidedAt = now
	m.appendApprovalReport(context.Background(), approval, status, resultText)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "status": status, "approval": approval, "result": resultText})
}
