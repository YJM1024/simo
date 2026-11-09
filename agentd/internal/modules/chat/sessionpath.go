package chat

import (
	"context"
	"strings"

	coreagent "agentd/internal/core/agent"
)

// sessionPath 计算根→当前会话路径；防环 + 限深 16（M14）。
func (m *Module) sessionOwnerAgentID(ctx context.Context, sessionID string) string {
	if m.sessions == nil {
		return coreagent.DefaultID
	}
	session, err := m.sessions.Get(ctx, sessionID)
	if err != nil || strings.TrimSpace(session.OwnerAgentID) == "" {
		return coreagent.DefaultID
	}
	return session.OwnerAgentID
}

func (m *Module) attachAgentIDs(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	cache := make(map[string]string)
	for i := range messages {
		if messages[i].Role != RoleAgent {
			continue
		}
		owner, ok := cache[messages[i].SessionID]
		if !ok {
			owner = m.sessionOwnerAgentID(ctx, messages[i].SessionID)
			cache[messages[i].SessionID] = owner
		}
		if strings.TrimSpace(messages[i].AgentID) == "" {
			messages[i].AgentID = owner
		}
	}
}

func (m *Module) sessionPath(ctx context.Context, sessionID string) []SessionPathItem {
	sessionID = trimSpace(sessionID)
	if sessionID == "" {
		return []SessionPathItem{}
	}
	if m.sessions == nil {
		title := m.sessionTitle(ctx, sessionID)
		return []SessionPathItem{{ID: sessionID, Title: title}}
	}
	reversed := make([]SessionPathItem, 0, 4)
	seen := make(map[string]bool, 4)
	current := sessionID
	for depth := 0; depth < 16 && current != ""; depth++ {
		if seen[current] {
			break
		}
		seen[current] = true
		session, err := m.sessions.Get(ctx, current)
		if err != nil {
			if len(reversed) == 0 {
				reversed = append(reversed, SessionPathItem{ID: current})
			}
			break
		}
		reversed = append(reversed, SessionPathItem{ID: session.ID, Title: session.Title})
		if session.ParentID == "" || session.ParentID == current {
			break
		}
		current = session.ParentID
	}
	path := make([]SessionPathItem, 0, len(reversed))
	for i := len(reversed) - 1; i >= 0; i-- {
		path = append(path, reversed[i])
	}
	return path
}

func (m *Module) attachSessionPaths(ctx context.Context, messages []Message) {
	if len(messages) == 0 {
		return
	}
	cache := make(map[string][]SessionPathItem)
	for i := range messages {
		path, ok := cache[messages[i].SessionID]
		if !ok {
			path = m.sessionPath(ctx, messages[i].SessionID)
			cache[messages[i].SessionID] = path
		}
		if path == nil {
			path = []SessionPathItem{}
		}
		messages[i].SessionPath = path
	}
}

func trimSpace(value string) string {
	start, end := 0, len(value)
	for start < end && (value[start] == ' ' || value[start] == '\t' || value[start] == '\n' || value[start] == '\r') {
		start++
	}
	for end > start && (value[end-1] == ' ' || value[end-1] == '\t' || value[end-1] == '\n' || value[end-1] == '\r') {
		end--
	}
	return value[start:end]
}
