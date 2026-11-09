package memory

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"simo/internal/platform/httpserver"
)

func (m *Module) registerV3(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/memory/items/{id}", m.handleItemGetV3)
	mux.HandleFunc("GET /api/memory/entities", m.handleEntitiesV3)
	mux.HandleFunc("GET /api/memory/entities/{id}", m.handleEntityGetV3)
	mux.HandleFunc("GET /api/memory/entities/{id}/timeline", m.handleEntityTimelineV3)
	mux.HandleFunc("GET /api/memory/graph", m.handleGraphV3)
	mux.HandleFunc("GET /api/memory/pyramid", m.handlePyramidV3)
	mux.HandleFunc("GET /api/memory/canonical/{id}", m.handleCanonicalV3)
	mux.HandleFunc("GET /api/memory/agents", m.handleAgentsV3)
	mux.HandleFunc("GET /api/memory/agents/{id}/memory", m.handleAgentMemoryV3)
}

func (m *Module) listV3(ctx context.Context, r *http.Request) ([]map[string]any, int, error) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	itemType := strings.TrimSpace(r.URL.Query().Get("type"))
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status == "" {
		status = "active"
	}
	includeDisputed := r.URL.Query().Get("includeDisputed") == "true" || r.URL.Query().Get("includeDisputed") == "1"
	entityID := strings.TrimSpace(r.URL.Query().Get("entityId"))
	layer := strings.TrimSpace(r.URL.Query().Get("layer"))
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	if limit > 100 {
		limit = 100
	}
	offset := atoiDefault(r.URL.Query().Get("offset"), 0)
	where := []string{"1=1"}
	args := []any{}
	if q != "" {
		where = append(where, "m.content LIKE ?")
		args = append(args, "%"+q+"%")
	}
	if itemType != "" {
		where = append(where, "m.type = ?")
		args = append(args, itemType)
	}
	if status != "all" {
		if status == "active" && includeDisputed {
			where = append(where, "m.status IN ('active','disputed')")
		} else {
			where = append(where, "m.status = ?")
			args = append(args, status)
		}
	}
	if layer != "" {
		where = append(where, "m.layer = ?")
		args = append(args, atoiDefault(layer, 0))
	}
	if entityID != "" {
		where = append(where, "m.id IN (SELECT memory_id FROM memory_entities WHERE entity_id = ?)")
		args = append(args, entityID)
	}
	countQuery := `SELECT COUNT(*) FROM memories m WHERE ` + strings.Join(where, " AND ")
	var total int
	_ = m.store.QueryRow(ctx, countQuery, args...).Scan(&total)
	rows, err := m.store.Query(ctx, `SELECT m.id,m.type,m.sub_type,m.owner_agent,m.assertion,
		m.attributed_to,m.fact_key,m.content,m.canonical_refs_json,m.source,m.authority,m.confidence,
		m.status,m.version,m.layer,m.importance,m.strength,m.valid_from,m.valid_until,m.legacy_kind,
		m.legacy_scope,m.conflict_with_json,m.created_at,m.updated_at
		FROM memories m WHERE `+strings.Join(where, " AND ")+` ORDER BY m.updated_at DESC, m.id ASC LIMIT ? OFFSET ?`,
		append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]map[string]any, 0, limit)
	ids := make([]string, 0, limit)
	for rows.Next() {
		var id, typ, subType, owner, assertion, attributedTo, factKey, content, canonicalRefs, source, authority, statusValue, legacyKind, legacyScope, conflictJSON string
		var confidence, strength float64
		var version, layer, importance, validFrom, validUntil int
		var createdAt, updatedAt int64
		if rows.Scan(&id, &typ, &subType, &owner, &assertion, &attributedTo, &factKey, &content,
			&canonicalRefs, &source, &authority, &confidence, &statusValue, &version, &layer,
			&importance, &strength, &validFrom, &validUntil, &legacyKind, &legacyScope,
			&conflictJSON, &createdAt, &updatedAt) != nil {
			continue
		}
		item := map[string]any{
			"id": id, "type": typ, "subType": subType, "ownerAgent": owner,
			"assertion": assertion, "attributedTo": attributedTo, "factKey": factKey,
			"content": content, "source": source, "authority": authority, "confidence": confidence,
			"status": statusValue, "version": version, "layer": layer, "importance": importance,
			"strength": int(strength), "validFrom": validFrom, "validUntil": validUntil,
			"kind": legacyKind, "scope": legacyScope, "createdAt": createdAt, "updatedAt": updatedAt,
			"canonicalRefs": decodeStringArray(canonicalRefs), "conflictsWith": decodeStringArray(conflictJSON),
		}
		out = append(out, item)
		ids = append(ids, id)
	}
	_ = rows.Close()
	if len(ids) > 0 {
		placeholders := make([]string, len(ids))
		argsRefs := make([]any, len(ids))
		for i, id := range ids {
			placeholders[i] = "?"
			argsRefs[i] = id
		}
		refMap := map[string][]string{}
		if refRows, err := m.store.Query(ctx, `SELECT memory_id,entity_id FROM memory_entities
			WHERE memory_id IN (`+strings.Join(placeholders, ",")+`)`, argsRefs...); err == nil {
			for refRows.Next() {
				var memoryID, entityID string
				if refRows.Scan(&memoryID, &entityID) == nil {
					refMap[memoryID] = append(refMap[memoryID], entityID)
				}
			}
			_ = refRows.Close()
		}
		for _, item := range out {
			if id, ok := item["id"].(string); ok {
				refs := refMap[id]
				if refs == nil {
					refs = []string{}
				}
				item["entityRefs"] = refs
			}
		}
	}
	return out, total, nil
}

func (m *Module) handleItemsV3IfNeeded(w http.ResponseWriter, r *http.Request) bool {
	keys := []string{"type", "subType", "entityId", "layer", "asOf", "includeDisputed", "sort", "offset"}
	needed := false
	for _, key := range keys {
		if r.URL.Query().Get(key) != "" {
			needed = true
			break
		}
	}
	if !needed {
		return false
	}
	items, total, err := m.listV3(r.Context(), r)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取记忆条目失败")
		return true
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "items": items, "total": total,
		"query": map[string]any{"q": r.URL.Query().Get("q")}})
	return true
}

func (m *Module) handleItemGetV3(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	items, _, err := m.listV3(r.Context(), r)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取记忆失败")
		return
	}
	var item map[string]any
	for _, candidate := range items {
		if candidate["id"] == id {
			item = candidate
			break
		}
	}
	if item == nil {
		item = m.itemV3ByID(r.Context(), id)
	}
	if item == nil {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "not_found", "记忆不存在")
		return
	}
	history := make([]map[string]any, 0, 8)
	if rows, err := m.store.Query(r.Context(), `SELECT version,content,status,created_at FROM memory_item_history
		WHERE item_id=? ORDER BY version ASC`, id); err == nil {
		for rows.Next() {
			var version int
			var content, statusValue string
			var createdAt int64
			if rows.Scan(&version, &content, &statusValue, &createdAt) == nil {
				history = append(history, map[string]any{"version": version, "content": content, "status": statusValue, "createdAt": createdAt})
			}
		}
		_ = rows.Close()
	}
	canonicalRefs := item["canonicalRefs"]
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{
		"ok": true, "item": item, "history": history,
		"canonicalRefs": canonicalRefs, "attribution": m.attributionFor(r.Context(), id),
		"conflicts": m.conflictsFor(r.Context(), id),
	})
}

func (m *Module) itemV3ByID(ctx context.Context, id string) map[string]any {
	row := m.store.QueryRow(ctx, `SELECT id,type,sub_type,owner_agent,assertion,attributed_to,fact_key,content,
		source,authority,confidence,status,version,layer,importance,valid_from,valid_until,
		legacy_kind,legacy_scope,canonical_refs_json,raw_refs_json,created_at,updated_at FROM memories WHERE id=?`, id)
	var itemID, typ, subType, owner, assertion, attributedTo, factKey, content, source, authority, statusValue, legacyKind, legacyScope string
	var confidence float64
	var version, layer, importance, validFrom, validUntil int
	var canonicalRefs, rawRefs string
	var createdAt, updatedAt int64
	if row.Scan(&itemID, &typ, &subType, &owner, &assertion, &attributedTo, &factKey, &content,
		&source, &authority, &confidence, &statusValue, &version, &layer, &importance,
		&validFrom, &validUntil, &legacyKind, &legacyScope, &canonicalRefs, &rawRefs, &createdAt, &updatedAt) != nil {
		return nil
	}
	return map[string]any{"id": itemID, "type": typ, "subType": subType, "ownerAgent": owner,
		"assertion": assertion, "attributedTo": attributedTo, "factKey": factKey, "content": content,
		"source": source, "authority": authority, "confidence": confidence, "status": statusValue,
		"version": version, "layer": layer, "importance": importance, "validFrom": validFrom,
		"validUntil": validUntil, "kind": legacyKind, "scope": legacyScope,
		"canonicalRefs": decodeStringArray(canonicalRefs), "rawRefs": decodeStringArray(rawRefs),
		"createdAt": createdAt, "updatedAt": updatedAt}
}

func (m *Module) attributionFor(ctx context.Context, memoryID string) []map[string]any {
	out := make([]map[string]any, 0, 4)
	rows, err := m.store.Query(ctx, `SELECT attributed_to,stance,confidence,source FROM attribution WHERE memory_id=?`, memoryID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var attributedTo, stance, source string
		var confidence float64
		if rows.Scan(&attributedTo, &stance, &confidence, &source) == nil {
			out = append(out, map[string]any{"attributedTo": attributedTo, "stance": stance, "confidence": confidence, "source": source})
		}
	}
	return out
}

func (m *Module) conflictsFor(ctx context.Context, memoryID string) []map[string]any {
	out := make([]map[string]any, 0, 4)
	rows, err := m.store.Query(ctx, `SELECT id,type,memory_a,memory_b,status,reason,created_at FROM conflicts
		WHERE memory_a=? OR memory_b=?`, memoryID, memoryID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var id, typ, a, b, statusValue, reason string
		var createdAt int64
		if rows.Scan(&id, &typ, &a, &b, &statusValue, &reason, &createdAt) == nil {
			out = append(out, map[string]any{"id": id, "type": typ, "memoryA": a, "memoryB": b, "status": statusValue, "reason": reason, "createdAt": createdAt})
		}
	}
	return out
}

func (m *Module) handleEntitiesV3(w http.ResponseWriter, r *http.Request) {
	where := []string{"1=1"}
	args := []any{}
	if kind := strings.TrimSpace(r.URL.Query().Get("kind")); kind != "" {
		where = append(where, "kind=?")
		args = append(args, kind)
	}
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		where = append(where, "(name LIKE ? OR canonical_name LIKE ?)")
		args = append(args, "%"+q+"%", "%"+q+"%")
	}
	if owner := strings.TrimSpace(r.URL.Query().Get("ownerAgent")); owner != "" {
		where = append(where, "owner_agent=?")
		args = append(args, owner)
	}
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	out := make([]map[string]any, 0, limit)
	rows, err := m.store.Query(r.Context(), `SELECT id,kind,name,canonical_name,owner_agent,status,created_at,updated_at
		FROM entities WHERE `+strings.Join(where, " AND ")+` ORDER BY updated_at DESC LIMIT ?`, append(args, limit)...)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取实体失败")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, kind, name, canonical, owner, statusValue string
		var createdAt, updatedAt int64
		if rows.Scan(&id, &kind, &name, &canonical, &owner, &statusValue, &createdAt, &updatedAt) == nil {
			out = append(out, map[string]any{"id": id, "kind": kind, "name": name, "canonicalName": canonical,
				"ownerAgent": owner, "status": statusValue, "createdAt": createdAt, "updatedAt": updatedAt})
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "entities": out, "total": len(out)})
}

func (m *Module) handleEntityGetV3(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	var kind, name, canonical, owner, statusValue string
	var createdAt, updatedAt int64
	if err := m.store.QueryRow(r.Context(), `SELECT kind,name,canonical_name,owner_agent,status,created_at,updated_at
		FROM entities WHERE id=?`, id).Scan(&kind, &name, &canonical, &owner, &statusValue, &createdAt, &updatedAt); err != nil {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "not_found", "实体不存在")
		return
	}
	counts := map[string]int{}
	if rows, err := m.store.Query(r.Context(), `SELECT m.type,COUNT(*) FROM memories m JOIN memory_entities me ON me.memory_id=m.id
		WHERE me.entity_id=? GROUP BY m.type`, id); err == nil {
		for rows.Next() {
			var typ string
			var count int
			if rows.Scan(&typ, &count) == nil {
				counts[typ] = count
			}
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "entity": map[string]any{
		"id": id, "kind": kind, "name": name, "canonicalName": canonical, "ownerAgent": owner,
		"status": statusValue, "createdAt": createdAt, "updatedAt": updatedAt},
		"relations": m.relationsFor(r.Context(), id), "memoryCounts": counts, "recent": []any{}})
}

func (m *Module) relationsFor(ctx context.Context, id string) []map[string]any {
	out := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(ctx, `SELECT from_entity,to_entity,rel_type,source,confidence,valid_from,valid_to
		FROM entity_relations WHERE from_entity=? OR to_entity=?`, id, id)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var from, to, relType, source string
		var confidence float64
		var validFrom, validTo int64
		if rows.Scan(&from, &to, &relType, &source, &confidence, &validFrom, &validTo) == nil {
			out = append(out, map[string]any{"from": from, "to": to, "relType": relType,
				"source": source, "confidence": confidence, "validFrom": validFrom, "validTo": validTo})
		}
	}
	return out
}

func (m *Module) handleGraphV3(w http.ResponseWriter, r *http.Request) {
	entityID := strings.TrimSpace(r.URL.Query().Get("entityId"))
	nodes := make([]map[string]any, 0, 8)
	edges := make([]map[string]any, 0, 8)
	if entityID == "" {
		httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "nodes": nodes, "edges": edges})
		return
	}
	nodes = append(nodes, map[string]any{"id": entityID})
	edges = m.relationsFor(r.Context(), entityID)
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "nodes": nodes, "edges": edges})
}

func (m *Module) handleEntityTimelineV3(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	facts := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(r.Context(), `SELECT fact_key,predicate,qualifier_json,active_memory_id,active_since,
		disputed_memory_ids_json FROM entity_facts WHERE subject_entity=? ORDER BY active_since ASC`, id)
	if err == nil {
		for rows.Next() {
			var factKey, predicate, qualifier, activeMemory, disputed string
			var activeSince int64
			if rows.Scan(&factKey, &predicate, &qualifier, &activeMemory, &activeSince, &disputed) == nil {
				facts = append(facts, map[string]any{"factKey": factKey, "predicate": predicate,
					"qualifier": qualifier, "activeMemoryId": activeMemory, "activeSince": activeSince,
					"disputedMemoryIds": decodeStringArray(disputed)})
			}
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "facts": facts, "events": []any{}})
}

func (m *Module) handlePyramidV3(w http.ResponseWriter, r *http.Request) {
	entityID := strings.TrimSpace(r.URL.Query().Get("entityId"))
	view := strings.TrimSpace(r.URL.Query().Get("view"))
	if view == "" {
		view = "what_happened"
	}
	level := atoiDefault(r.URL.Query().Get("level"), 0)
	nodes := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(r.Context(), `SELECT id,entity_id,level,view,text,coverage,status,created_at
		FROM pyramid_nodes WHERE entity_id=? AND level=? AND view=? AND status='active' ORDER BY created_at DESC`,
		entityID, level, view)
	if err == nil {
		for rows.Next() {
			var id, entity, viewValue, text, statusValue string
			var nodeLevel int
			var coverage float64
			var createdAt int64
			if rows.Scan(&id, &entity, &nodeLevel, &viewValue, &text, &coverage, &statusValue, &createdAt) == nil {
				nodes = append(nodes, map[string]any{"id": id, "entityId": entity, "level": nodeLevel,
					"view": viewValue, "text": text, "coverage": coverage, "status": statusValue, "createdAt": createdAt})
			}
		}
		_ = rows.Close()
	}
	if len(nodes) == 0 {
		rows, err = m.store.Query(r.Context(), `SELECT id,entity_id,level,view,text,coverage,status,created_at
			FROM pyramid_nodes WHERE level=? AND view=? AND status='active' ORDER BY created_at DESC LIMIT 20`, level, view)
		if err == nil {
			for rows.Next() {
				var id, entity, viewValue, text, statusValue string
				var nodeLevel int
				var coverage float64
				var createdAt int64
				if rows.Scan(&id, &entity, &nodeLevel, &viewValue, &text, &coverage, &statusValue, &createdAt) == nil {
					nodes = append(nodes, map[string]any{"id": id, "entityId": entity, "level": nodeLevel,
						"view": viewValue, "text": text, "coverage": coverage, "status": statusValue, "createdAt": createdAt})
				}
			}
			_ = rows.Close()
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "view": view, "level": level, "nodes": nodes})
}

func (m *Module) handleCanonicalV3(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.PathValue("id"))
	var canonicalID, key, text, rawRefs, frame, statusValue, version string
	var createdAt int64
	if err := m.store.QueryRow(r.Context(), `SELECT id,canonical_key,canonical_text,raw_refs_json,frame_json,status,canonicalizer_version,created_at
		FROM canonical_units WHERE id=?`, id).Scan(&canonicalID, &key, &text, &rawRefs, &frame, &statusValue, &version, &createdAt); err != nil {
		httpserver.WriteErrorCode(w, http.StatusNotFound, "not_found", "canonical 不存在")
		return
	}
	mentions := make([]map[string]any, 0, 4)
	if rows, err := m.store.Query(r.Context(), `SELECT id,entity_id,mention_text,role,resolved,confidence FROM mentions WHERE canonical_id=?`, id); err == nil {
		for rows.Next() {
			var mentionID, entityID, mentionText, role string
			var resolved int
			var confidence float64
			if rows.Scan(&mentionID, &entityID, &mentionText, &role, &resolved, &confidence) == nil {
				mentions = append(mentions, map[string]any{"id": mentionID, "entityId": entityID,
					"mentionText": mentionText, "role": role, "resolved": resolved != 0, "confidence": confidence})
			}
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "canonical": map[string]any{
		"id": canonicalID, "canonicalKey": key, "text": text, "rawRefs": decodeStringArray(rawRefs),
		"frame": frame, "status": statusValue, "canonicalizerVersion": version, "createdAt": createdAt},
		"rawRefs": decodeStringArray(rawRefs), "mentions": mentions})
}

func (m *Module) handleAgentsV3(w http.ResponseWriter, r *http.Request) {
	agents := make([]map[string]any, 0, 8)
	rows, err := m.store.Query(r.Context(), `SELECT id,name,owner_agent,status FROM entities WHERE kind='agent'`)
	if err == nil {
		for rows.Next() {
			var id, name, owner, statusValue string
			if rows.Scan(&id, &name, &owner, &statusValue) == nil {
				agents = append(agents, map[string]any{"id": strings.TrimPrefix(owner, "agent:"),
					"entityId": id, "name": name, "ownerAgent": owner, "status": statusValue})
			}
		}
		_ = rows.Close()
	}
	counts := map[string]int{}
	if countRows, err := m.store.Query(r.Context(), `SELECT owner_agent,COUNT(*) FROM memories
		WHERE status<>'retracted' GROUP BY owner_agent`); err == nil {
		for countRows.Next() {
			var owner string
			var count int
			if countRows.Scan(&owner, &count) == nil {
				counts[owner] = count
			}
		}
		_ = countRows.Close()
	}
	for _, agent := range agents {
		if owner, ok := agent["ownerAgent"].(string); ok {
			agent["memoryCount"] = counts[owner]
		}
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "agents": agents})
}

func (m *Module) handleAgentMemoryV3(w http.ResponseWriter, r *http.Request) {
	agentID := strings.TrimSpace(r.PathValue("id"))
	limit := atoiDefault(r.URL.Query().Get("limit"), 20)
	items := make([]map[string]any, 0, limit)
	rows, err := m.store.Query(r.Context(), `SELECT id,type,sub_type,owner_agent,assertion,fact_key,content,
		status,layer,importance,valid_from,valid_until,source,authority,created_at,updated_at FROM memories
		WHERE owner_agent=? AND status<>'retracted' ORDER BY updated_at DESC LIMIT ?`,
		"agent:"+strings.TrimPrefix(agentID, "agent:"), limit)
	if err == nil {
		for rows.Next() {
			var id, typ, subType, owner, assertion, factKey, content, statusValue, source, authority string
			var layer, importance int
			var validFrom, validUntil, createdAt, updatedAt int64
			if rows.Scan(&id, &typ, &subType, &owner, &assertion, &factKey, &content, &statusValue,
				&layer, &importance, &validFrom, &validUntil, &source, &authority, &createdAt, &updatedAt) == nil {
				items = append(items, map[string]any{"id": id, "type": typ, "subType": subType,
					"ownerAgent": owner, "assertion": assertion, "factKey": factKey, "content": content,
					"status": statusValue, "layer": layer, "importance": importance,
					"validFrom": validFrom, "validUntil": validUntil, "source": source, "authority": authority,
					"createdAt": createdAt, "updatedAt": updatedAt})
			}
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "items": items})
}

func decodeStringArray(raw string) []string {
	out := []string{}
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func atoiDefault(raw string, fallback int) int {
	if value, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil {
		return value
	}
	return fallback
}
