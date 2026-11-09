package chat

import (
	"net/http"

	coreagent "simo/internal/core/agent"
	"simo/internal/platform/httpserver"
)

func (m *Module) handleAgents(w http.ResponseWriter, r *http.Request) {
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "agents": coreagent.List()})
}
