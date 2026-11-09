package memory

import (
	"net/http"
	"strconv"
	"strings"

	corememory "agentd/internal/core/memory"
	"agentd/internal/platform/httpserver"
)

// handleSearch 兼容 M3 早期的 GET /api/memory?q=；契约主入口是 /api/memory/items。
func (m *Module) handleSearch(w http.ResponseWriter, r *http.Request) {
	m.searchAndWrite(w, r)
}

func (m *Module) handleItems(w http.ResponseWriter, r *http.Request) {
	if m.handleItemsV3IfNeeded(w, r) {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q != "" {
		m.searchAndWrite(w, r)
		return
	}
	scope := strings.TrimSpace(r.URL.Query().Get("scope"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	limit := parseLimit(r.URL.Query().Get("limit"))
	items, err := m.Items(r.Context(), corememory.ItemFilter{Scope: scope, Status: status, Limit: limit})
	if err != nil {
		m.log.Error("列记忆条目失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取记忆条目失败")
		return
	}
	if items == nil {
		items = []corememory.Item{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": items,
		"total": len(items),
		"query": map[string]any{"scope": scope, "q": "", "status": status, "limit": limit},
	})
}

func (m *Module) searchAndWrite(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	scopeRaw := strings.TrimSpace(r.URL.Query().Get("scope"))
	scopes := splitScopes(scopeRaw)
	limit := parseLimit(r.URL.Query().Get("limit"))
	maxChars := 0
	if raw := strings.TrimSpace(r.URL.Query().Get("maxChars")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 20000 {
			maxChars = n
		}
	}
	result, err := m.Search(r.Context(), corememory.SearchRequest{
		Query: query, Scopes: scopes, Limit: limit, MaxChars: maxChars,
	})
	if err != nil {
		m.log.Error("记忆检索失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "记忆检索失败")
		return
	}
	if result.Items == nil {
		result.Items = []corememory.Item{}
	}
	queryShape := map[string]any{"scope": scopeRaw, "limit": limit}
	if len(result.Items) > 0 {
		queryShape["q"] = query
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok":    true,
		"items": result.Items,
		"total": len(result.Items),
		"query": queryShape,
	})
}

func (m *Module) handleScopes(w http.ResponseWriter, r *http.Request) {
	scopes, err := m.Scopes(r.Context())
	if err != nil {
		m.log.Error("列记忆作用域失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取记忆作用域失败")
		return
	}
	if scopes == nil {
		scopes = []corememory.ScopeInfo{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "scopes": scopes})
}

func (m *Module) handleConflicts(w http.ResponseWriter, r *http.Request) {
	conflicts, err := m.Conflicts(r.Context())
	if err != nil {
		m.log.Error("列冲突失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取冲突失败")
		return
	}
	if conflicts == nil {
		conflicts = []corememory.Conflict{}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "conflicts": conflicts})
}

func splitScopes(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if scope := strings.TrimSpace(part); scope != "" {
			out = append(out, scope)
		}
	}
	return out
}

func parseLimit(raw string) int {
	if raw == "" {
		return 0
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n < 0 {
		return 0
	}
	return n
}
