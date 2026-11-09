package chat

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"agentd/internal/platform/httpserver"
)

const (
	sandboxReadOnly       = "read-only"
	sandboxWorkspaceWrite = "workspace-write"
	sandboxFullAccess     = "danger-full-access"

	approvalAsk   = "ask"
	approvalAuto  = "auto"
	approvalNever = "never"
)

type permissionSettings struct {
	Sandbox  string `json:"sandbox"`
	Approval string `json:"approval"`
}

type permissionState struct {
	mu       sync.RWMutex
	defaults permissionSettings
	sessions map[string]permissionSettings
}

func newPermissionState() *permissionState {
	return &permissionState{
		defaults: permissionSettings{Sandbox: sandboxWorkspaceWrite, Approval: approvalAuto},
		sessions: make(map[string]permissionSettings),
	}
}

func validSandboxMode(mode string) bool {
	switch mode {
	case sandboxReadOnly, sandboxWorkspaceWrite, sandboxFullAccess:
		return true
	default:
		return false
	}
}

func validApprovalMode(mode string) bool {
	switch mode {
	case approvalAsk, approvalAuto, approvalNever:
		return true
	default:
		return false
	}
}

func (p *permissionState) get(sessionID string) permissionSettings {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if sessionID != "" {
		if settings, ok := p.sessions[sessionID]; ok {
			return settings
		}
	}
	return p.defaults
}

func (p *permissionState) set(sessionID string, settings permissionSettings) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if sessionID == "" {
		p.defaults = settings
		return
	}
	p.sessions[sessionID] = settings
}

func (m *Module) handlePermissionsGet(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	settings := m.currentPermissions(sessionID)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":     true,
		"mode":   settings.Sandbox,
		"policy": settings.Approval,
		// 兼容字段/前端旧字段
		"sandbox":  settings.Sandbox,
		"approval": settings.Approval,
		"permissions": map[string]any{
			"mode": settings.Sandbox, "policy": settings.Approval,
			"sandbox": settings.Sandbox, "approval": settings.Approval,
		},
		"modes": map[string]any{
			"sandbox":  []string{sandboxReadOnly, sandboxWorkspaceWrite, sandboxFullAccess},
			"approval": []string{approvalAsk, approvalAuto, approvalNever},
		},
		"sessionId": sessionID,
	})
}

func (m *Module) handlePermissionsPost(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string          `json:"sessionId"`
		Sandbox   string          `json:"sandbox"`
		Approval  string          `json:"approval"`
		Mode      string          `json:"mode"`
		Policy    string          `json:"policy"`
		Confirm   json.RawMessage `json:"confirm"`
		Ack       json.RawMessage `json:"ack"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&req); err != nil {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "bad_request", "请求体不是合法 JSON")
		return
	}
	if req.Sandbox == "" {
		req.Sandbox = req.Mode
	}
	if req.Approval == "" {
		req.Approval = req.Policy
	}
	req.Sandbox = strings.ToLower(strings.TrimSpace(req.Sandbox))
	req.Approval = strings.ToLower(strings.TrimSpace(req.Approval))
	if req.Sandbox == "" && req.Approval == "" {
		httpserver.WriteErrorCode(w, http.StatusBadRequest, "bad_request", "sandbox 或 approval 至少一项")
		return
	}
	current := m.currentPermissions(strings.TrimSpace(req.SessionID))
	next := current
	if req.Sandbox != "" {
		if !validSandboxMode(req.Sandbox) {
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_sandbox", "sandbox 只能是 read-only/workspace-write/danger-full-access")
			return
		}
		next.Sandbox = req.Sandbox
	}
	if req.Approval != "" {
		if !validApprovalMode(req.Approval) {
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "invalid_approval", "approval 只能是 ask/auto/never")
			return
		}
		next.Approval = req.Approval
	}
	if next.Sandbox == sandboxFullAccess && current.Sandbox != sandboxFullAccess {
		if !confirmTrue(req.Confirm) && !confirmTrue(req.Ack) {
			httpserver.WriteErrorCode(w, http.StatusBadRequest, "confirmation_required", "切换到 danger-full-access 需要 confirm/ack 确认")
			return
		}
	}
	m.perms.set(strings.TrimSpace(req.SessionID), next)
	m.auditEvent(r.Context(), "permission.changed", map[string]any{
		"sandbox": next.Sandbox, "approval": next.Approval, "sessionId": req.SessionID,
	})
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "mode": next.Sandbox, "policy": next.Approval,
		"sandbox": next.Sandbox, "approval": next.Approval, "sessionId": req.SessionID,
		"permissions": map[string]any{
			"mode": next.Sandbox, "policy": next.Approval,
			"sandbox": next.Sandbox, "approval": next.Approval,
		},
	})
}

func confirmTrue(raw json.RawMessage) bool {
	raw = json.RawMessage(strings.TrimSpace(string(raw)))
	if len(raw) == 0 {
		return false
	}
	var b bool
	if json.Unmarshal(raw, &b) == nil {
		return b
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "true", "yes", "confirm", "danger-full-access":
			return true
		}
	}
	return false
}

func (m *Module) currentPermissions(sessionID string) permissionSettings {
	if m.perms == nil {
		return permissionSettings{Sandbox: sandboxWorkspaceWrite, Approval: approvalAuto}
	}
	return m.perms.get(strings.TrimSpace(sessionID))
}

func (m *Module) auditEvent(ctx context.Context, eventType string, payload map[string]any) {
	if m.events == nil {
		return
	}
	_, _ = m.events.Append(ctx, eventType, payload)
}
