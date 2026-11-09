package chat

import (
	"net/http"

	coreagent "agentd/internal/core/agent"
	"agentd/internal/platform/httpserver"
)

func (m *Module) handleAgents(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "agents": coreagent.List()})
}
