package memory

import (
	"context"
	"strings"
)

func (m *Module) MemoryEntities(ctx context.Context, kind, query string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	where := []string{"1=1"}
	args := []any{}
	if kind != "" {
		where = append(where, "kind=?")
		args = append(args, kind)
	}
	if query != "" {
		where = append(where, "(name LIKE ? OR canonical_name LIKE ?)")
		args = append(args, "%"+query+"%", "%"+query+"%")
	}
	rows, err := m.store.Query(ctx, `SELECT id,kind,name,canonical_name,owner_agent,status FROM entities
		WHERE `+strings.Join(where, " AND ")+` ORDER BY updated_at DESC LIMIT ?`, append(args, limit)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]any, 0, limit)
	for rows.Next() {
		var id, entityKind, name, canonical, owner, statusValue string
		if rows.Scan(&id, &entityKind, &name, &canonical, &owner, &statusValue) == nil {
			out = append(out, map[string]any{"id": id, "kind": entityKind, "name": name,
				"canonicalName": canonical, "ownerAgent": owner, "status": statusValue})
		}
	}
	return out, nil
}

func (m *Module) MemoryGraph(ctx context.Context, entityID string, depth int) (map[string]any, error) {
	nodes := []map[string]any{}
	edges := []map[string]any{}
	if entityID != "" {
		nodes = append(nodes, map[string]any{"id": entityID})
	}
	rows, err := m.store.Query(ctx, `SELECT from_entity,to_entity,rel_type,source,confidence FROM entity_relations
		WHERE from_entity=? OR to_entity=? LIMIT 100`, entityID, entityID)
	if err == nil {
		for rows.Next() {
			var from, to, relType, source string
			var confidence float64
			if rows.Scan(&from, &to, &relType, &source, &confidence) == nil {
				edges = append(edges, map[string]any{"from": from, "to": to, "relType": relType, "source": source, "confidence": confidence})
			}
		}
		_ = rows.Close()
	}
	return map[string]any{"nodes": nodes, "edges": edges}, nil
}

func (m *Module) MemoryPyramid(ctx context.Context, entityID string, level int, view string) (map[string]any, error) {
	if view == "" {
		view = "what_happened"
	}
	nodes := []map[string]any{}
	rows, err := m.store.Query(ctx, `SELECT id,level,view,text,coverage,status FROM pyramid_nodes
		WHERE entity_id=? AND level=? AND view=? AND status='active' ORDER BY created_at DESC`, entityID, level, view)
	if err == nil {
		for rows.Next() {
			var id, viewValue, text, statusValue string
			var nodeLevel int
			var coverage float64
			if rows.Scan(&id, &nodeLevel, &viewValue, &text, &coverage, &statusValue) == nil {
				nodes = append(nodes, map[string]any{"id": id, "level": nodeLevel, "view": viewValue,
					"text": text, "coverage": coverage, "status": statusValue})
			}
		}
		_ = rows.Close()
	}
	return map[string]any{"view": view, "level": level, "nodes": nodes}, nil
}

func (m *Module) AgentMemory(ctx context.Context, agentID string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := m.store.Query(ctx, `SELECT id,type,content,status,importance FROM memories
		WHERE owner_agent=? AND status<>'retracted' ORDER BY updated_at DESC LIMIT ?`,
		"agent:"+strings.TrimPrefix(agentID, "agent:"), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]map[string]any, 0, limit)
	for rows.Next() {
		var id, typ, content, statusValue string
		var importance int
		if rows.Scan(&id, &typ, &content, &statusValue, &importance) == nil {
			out = append(out, map[string]any{"id": id, "type": typ, "content": content,
				"status": statusValue, "importance": importance})
		}
	}
	return out, nil
}
