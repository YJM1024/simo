package chat

import (
	"encoding/json"
	"net"
	"net/http"
	"runtime"
	"strings"
	"time"

	"agentd/internal/platform/httpserver"
	"agentd/internal/platform/llm"
)

type decisionView struct {
	ID        string `json:"id"`
	TurnID    string `json:"turnId"`
	Kind      string `json:"kind"`
	Payload   any    `json:"payload"`
	CreatedAt int64  `json:"createdAt"`
}

// handleDecisions 暴露最近 DecisionEnvelope（只读，供 eval/排障确认 CLARIFY/DELEGATE 等决策）。
func (m *Module) handleDecisions(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	if sessionID == "" {
		sessionID = defaultSessionID
	}
	rows, err := m.store.Query(r.Context(), `
		SELECT d.id, d.turn_id, d.kind, d.payload, d.created_at
		  FROM decisions d
		  JOIN turns t ON t.id = d.turn_id
		 WHERE t.session_id = ?
		 ORDER BY d.created_at DESC, d.id DESC
		 LIMIT 20`, sessionID)
	if err != nil {
		m.log.Error("查询 decisions 失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取决策失败")
		return
	}
	defer rows.Close()
	out := make([]decisionView, 0, 8)
	for rows.Next() {
		var view decisionView
		var payload string
		if err := rows.Scan(&view.ID, &view.TurnID, &view.Kind, &payload, &view.CreatedAt); err != nil {
			m.log.Error("扫描 decisions 失败", "err", err)
			httpserver.WriteError(w, http.StatusInternalServerError, "读取决策失败")
			return
		}
		if json.Valid([]byte(payload)) {
			view.Payload = json.RawMessage(payload)
		} else {
			view.Payload = payload
		}
		out = append(out, view)
	}
	if err := rows.Err(); err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取决策失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"decisions": out})
}

// handleLastLLMRequest 只在 -debug / AGENTD_DEBUG=1 时注册；仅本机可读，不返回 API key。
func (m *Module) handleLastLLMRequest(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	m.debugMu.Lock()
	snapshot := m.lastRequest
	m.debugMu.Unlock()
	if snapshot == nil {
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{"request": nil})
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"request": snapshot})
}

// handleGoroutines 是仅 debug 的临时排障入口（本机）。
func (m *Module) handleGoroutines(w http.ResponseWriter, r *http.Request) {
	if !isLoopbackRequest(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	buf := make([]byte, 1<<20)
	n := runtime.Stack(buf, true)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(buf[:n])
}

func (m *Module) recordLLMRequest(req llm.ChatRequest) {
	messages := make([]llm.Message, len(req.Messages))
	copy(messages, req.Messages)
	for i := range messages {
		messages[i].ToolCalls = append([]llm.ToolCall(nil), req.Messages[i].ToolCalls...)
	}
	tools := append([]llm.Tool(nil), req.Tools...)
	m.debugMu.Lock()
	defer m.debugMu.Unlock()
	m.lastRequest = &debugLLMRequest{
		At:              time.Now().UnixMilli(),
		Model:           req.Model,
		ReasoningEffort: req.ReasoningEffort,
		Messages:        messages,
		Tools:           tools,
	}
}

func isLoopbackRequest(r *http.Request) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(r.RemoteAddr)
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}
