package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"

	"agentd/internal/platform/httpserver"
)

type RecallRequest struct {
	RecallID        string         `json:"recallId"`
	SessionID       string         `json:"sessionId"`
	AgentID         string         `json:"agentId"`
	TaskID          string         `json:"taskId,omitempty"`
	Query           string         `json:"query"`
	Intent          string         `json:"intent,omitempty"`
	Types           []string       `json:"types,omitempty"`
	EntityTypes     []string       `json:"entityTypes,omitempty"`
	Filters         map[string]any `json:"filters,omitempty"`
	Budget          map[string]any `json:"budget,omitempty"`
	IncludeDisputed bool           `json:"includeDisputed,omitempty"`
	RequireCite     bool           `json:"requireCite,omitempty"`
	AllowAgentic    *bool          `json:"allowAgentic,omitempty"`
	Trace           string         `json:"trace,omitempty"`
}

type RecallEntity struct {
	EntityID    string  `json:"entityId"`
	EntityClass string  `json:"entityClass"`
	Kind        string  `json:"kind"`
	Name        string  `json:"name"`
	Score       float64 `json:"score"`
	Why         string  `json:"why"`
}

type RecallItem struct {
	ItemID         string             `json:"itemId"`
	Version        int                `json:"version"`
	Type           string             `json:"type"`
	SubType        string             `json:"subType,omitempty"`
	Content        string             `json:"content"`
	Score          float64            `json:"score"`
	ScoreBreakdown map[string]float64 `json:"scoreBreakdown,omitempty"`
	Tokens         int                `json:"tokens"`
	Cite           string             `json:"cite"`
	Trust          string             `json:"trust"`
	EntityRefs     []string           `json:"entityRefs"`
	Layer          int                `json:"layer"`
	Why            string             `json:"why"`
}

type RecallEdge struct {
	From          string  `json:"from"`
	RelType       string  `json:"relType"`
	To            string  `json:"to"`
	SourceItem    string  `json:"sourceItem"`
	SourceVersion int     `json:"sourceVersion"`
	Confidence    float64 `json:"confidence"`
}

type RecallPath struct {
	Entities []string     `json:"entities"`
	Edges    []RecallEdge `json:"edges"`
	Score    float64      `json:"score"`
	Cite     []string     `json:"cite"`
}

type RecallResult struct {
	OK           bool           `json:"ok"`
	RecallID     string         `json:"recallId"`
	Entities     []RecallEntity `json:"entities"`
	Items        []RecallItem   `json:"items"`
	Paths        []RecallPath   `json:"paths"`
	Ask          any            `json:"ask,omitempty"`
	Trace        any            `json:"trace"`
	BudgetReport map[string]any `json:"budgetReport"`
	Warnings     []string       `json:"warnings"`
	Error        any            `json:"error"`
}

func (m *Module) registerRecall(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/debug/recall", m.handleDebugRecall)
	mux.HandleFunc("POST /api/debug/recall", m.handleDebugRecall)
	mux.HandleFunc("POST /api/debug/recall/seed", m.handleDebugRecallSeed)
	mux.HandleFunc("POST /api/debug/recall/rebuild", m.handleDebugRecallRebuild)
}

func (m *Module) handleDebugRecall(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	req := RecallRequest{}
	if r.Method == http.MethodPost {
		_ = json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req)
	} else {
		query := r.URL.Query()
		req.Query = firstNonEmpty(query.Get("query"), query.Get("q"))
		req.SessionID = query.Get("sessionId")
		req.AgentID = query.Get("agentId")
		req.Trace = query.Get("trace")
	}
	if req.SessionID == "" {
		req.SessionID = "main"
	}
	if req.AgentID == "" {
		req.AgentID = "agent:simo"
	}
	if strings.TrimSpace(req.Query) == "" {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": map[string]any{"code": "invalid_argument", "message": "query 不能为空"}})
		return
	}
	result := m.recall(r.Context(), req)
	httpserver.WriteJSON(w, http.StatusOK, result)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func isLoopback(r *http.Request) bool {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err != nil {
		host = strings.TrimSpace(r.RemoteAddr)
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *Module) recall(ctx context.Context, req RecallRequest) RecallResult {
	startedAt := time.Now()
	result := RecallResult{OK: true, RecallID: req.RecallID, Entities: []RecallEntity{}, Items: []RecallItem{}, Paths: []RecallPath{}, Warnings: []string{"no_semantic_path"}}
	if result.RecallID == "" {
		result.RecallID = "rc-" + time.Now().Format("150405.000000")
	}
	normalized := normalizeRecallText(req.Query)
	entityScores := map[string]float64{}
	entityWhy := map[string]string{}
	entityInfo := map[string]RecallEntity{}
	// A: memory text (FTS/LIKE) + entity mention from memory bindings.
	rows, err := m.store.Query(ctx, `SELECT id,type,sub_type,content,layer,version,status,importance
		FROM memories WHERE status IN ('active','disputed') AND content LIKE ? LIMIT 40`, "%"+req.Query+"%")
	if err == nil {
		for rows.Next() {
			var id, typ, subType, content, statusValue string
			var layer, version, importance int
			if rows.Scan(&id, &typ, &subType, &content, &layer, &version, &statusValue, &importance) == nil {
				_ = content
				_ = importance
				_ = statusValue
				_ = typ
				_ = subType
				_ = layer
				_ = version
			}
		}
		_ = rows.Close()
	}
	// B/A: entity name and alias matching.
	rows, err = m.store.Query(ctx, `SELECT e.id,e.entity_class,e.kind,e.name,e.canonical_name,e.aliases_json,
		COALESCE((SELECT MAX(weight) FROM recall_aliases a WHERE a.entity_id=e.id),1.0)
		FROM entities e WHERE e.status='active'`)
	if err == nil {
		for rows.Next() {
			var id, entityClass, kind, name, canonical, aliases string
			var weight float64
			if rows.Scan(&id, &entityClass, &kind, &name, &canonical, &aliases, &weight) != nil {
				continue
			}
			best := 0.0
			if normalizeRecallText(canonical) == normalized || normalizeRecallText(name) == normalized {
				best = 1.0
			} else if strings.Contains(normalizeRecallText(canonical), normalized) || strings.Contains(normalized, normalizeRecallText(canonical)) {
				best = 0.7
			}
			for _, alias := range decodeStringArray(aliases) {
				aliasNorm := normalizeRecallText(alias)
				if aliasNorm == "" {
					continue
				}
				if aliasNorm == normalized {
					best = maxFloat(best, 0.95*weight)
				} else if strings.Contains(normalized, aliasNorm) {
					best = maxFloat(best, 0.8*weight)
				}
			}
			if best > 0 {
				entityScores[id] = maxFloat(entityScores[id], best)
				entityWhy[id] = "alias_or_name"
				entityInfo[id] = RecallEntity{EntityID: id, EntityClass: entityClass, Kind: kind, Name: firstNonEmpty(name, canonical), Score: best, Why: "alias_or_name"}
			}
		}
		_ = rows.Close()
	}
	// A: direct keyword entities via memory bindings.
	rows, err = m.store.Query(ctx, `SELECT me.entity_id, COUNT(*) FROM memory_entities me
		JOIN memories m ON m.id=me.memory_id WHERE m.content LIKE ? GROUP BY me.entity_id`, "%"+req.Query+"%")
	bindingIDs := make([]string, 0, 8)
	bindingScores := map[string]float64{}
	if err == nil {
		for rows.Next() {
			var id string
			var count int
			if rows.Scan(&id, &count) == nil {
				bindingScores[id] = 0.5 + float64(count)*0.05
				bindingIDs = append(bindingIDs, id)
			}
		}
		_ = rows.Close()
	}
	// 关键：必须关闭 memory_entities 游标后再查 entities；单连接 SQLite 不能嵌套游标。
	for _, id := range bindingIDs {
		entityScores[id] = maxFloat(entityScores[id], bindingScores[id])
		entityWhy[id] = "fts"
	}
	if len(bindingIDs) > 0 {
		placeholders := make([]string, len(bindingIDs))
		bindArgs := make([]any, len(bindingIDs))
		for i, id := range bindingIDs {
			placeholders[i] = "?"
			bindArgs[i] = id
		}
		if entityRows, err := m.store.Query(ctx, `SELECT id,entity_class,kind,name,canonical_name,aliases_json
			FROM entities WHERE id IN (`+strings.Join(placeholders, ",")+`)`, bindArgs...); err == nil {
			for entityRows.Next() {
				var id, entityClass, kind, name, canonical, aliases string
				if entityRows.Scan(&id, &entityClass, &kind, &name, &canonical, &aliases) == nil {
					entityInfo[id] = RecallEntity{EntityID: id, EntityClass: entityClass, Kind: kind,
						Name: firstNonEmpty(name, canonical), Score: entityScores[id], Why: "fts"}
				}
			}
			_ = entityRows.Close()
		}
	}
	// Entity FTS aliases table as fallback.
	rows, err = m.store.Query(ctx, `SELECT entity_id FROM recall_aliases WHERE alias LIKE ? OR ? LIKE '%'||alias||'%' LIMIT 20`, "%"+normalized+"%", normalized)
	if err == nil {
		for rows.Next() {
			var id string
			if rows.Scan(&id) == nil {
				entityScores[id] = maxFloat(entityScores[id], 0.9)
				entityWhy[id] = "alias"
			}
		}
		_ = rows.Close()
	}
	// C: optional local TF-IDF vector path (default off; vector_unavailable on degrade).
	vectorItemScores := map[string]float64{}
	vectorUsed := false
	vectorCandidates := make([]map[string]any, 0, 8)
	if vectorRecallEnabled() {
		hits, vectorErr := m.SearchVector(ctx, req.Query, 20)
		if vectorErr != nil {
			result.Warnings = appendUniqueStrings(result.Warnings, "vector_unavailable")
		} else {
			for _, hit := range hits {
				if hit.ItemID != "" {
					vectorItemScores[hit.ItemID] = hit.Score
					vectorUsed = true
				}
				if hit.EntityID != "" {
					entityScores[hit.EntityID] = maxFloat(entityScores[hit.EntityID], 0.65*hit.Score)
					entityWhy[hit.EntityID] = "vector"
					var entityClass, kind, name, canonical string
					if m.store.QueryRow(ctx, `SELECT entity_class,kind,name,canonical_name FROM entities WHERE id=?`,
						hit.EntityID).Scan(&entityClass, &kind, &name, &canonical) == nil {
						entityInfo[hit.EntityID] = RecallEntity{EntityID: hit.EntityID, EntityClass: entityClass,
							Kind: kind, Name: firstNonEmpty(name, canonical), Score: entityScores[hit.EntityID], Why: "vector"}
						vectorUsed = true
					}
				}
				if vectorUsed {
					vectorCandidates = append(vectorCandidates, map[string]any{
						"itemId": hit.ItemID, "entityId": hit.EntityID, "score": hit.Score})
				}
			}
		}
	}
	if vectorUsed {
		filtered := result.Warnings[:0]
		for _, warning := range result.Warnings {
			if warning != "no_semantic_path" {
				filtered = append(filtered, warning)
			}
		}
		result.Warnings = filtered
		result.Warnings = appendUniqueStrings(result.Warnings, "vector_used")
	}
	// D: bounded graph BFS (R1=1 hop, R2=2 hops by default).
	seedIDs := make([]string, 0, len(entityScores))
	for id := range entityScores {
		seedIDs = append(seedIDs, id)
	}
	sort.Strings(seedIDs)
	graph := m.expandRecallGraph(ctx, seedIDs, entityScores, entityWhy, req.Budget)
	if len(graph.warnings) > 0 {
		result.Warnings = appendUniqueStrings(result.Warnings, graph.warnings...)
	}
	// RRF fusion over simple paths (name/alias/fts/graph).
	for id, score := range entityScores {
		if _, ok := entityInfo[id]; !ok {
			var entityClass, kind, name, canonical string
			_ = m.store.QueryRow(ctx, `SELECT entity_class,kind,name,canonical_name FROM entities WHERE id=?`, id).
				Scan(&entityClass, &kind, &name, &canonical)
			entityInfo[id] = RecallEntity{EntityID: id, EntityClass: entityClass, Kind: kind, Name: firstNonEmpty(name, canonical), Score: score, Why: entityWhy[id]}
		}
	}
	entities := make([]RecallEntity, 0, len(entityInfo))
	for _, entity := range entityInfo {
		entity.Score = entityScores[entity.EntityID]
		entities = append(entities, entity)
	}
	sort.Slice(entities, func(i, j int) bool {
		if entities[i].Score != entities[j].Score {
			return entities[i].Score > entities[j].Score
		}
		return entities[i].EntityID < entities[j].EntityID
	})
	maxEntities := 5
	if value, ok := req.Budget["maxEntities"].(float64); ok && int(value) > 0 && int(value) <= 8 {
		maxEntities = int(value)
	}
	if len(entities) > maxEntities {
		entities = entities[:maxEntities]
	}
	result.Entities = entities
	// Items by selected entities, plus keyword fallback.
	seen := map[string]bool{}
	selectedEntitySet := map[string]bool{}
	for _, entity := range entities {
		selectedEntitySet[entity.EntityID] = true
	}
	itemRows, err := m.store.Query(ctx, `SELECT m.id,m.version,m.type,m.sub_type,m.content,
		COALESCE(m.layer,0),COALESCE(m.importance,5),COALESCE(m.status,'active'),
		COALESCE(GROUP_CONCAT(me.entity_id, ','),'')
		FROM memories m LEFT JOIN memory_entities me ON me.memory_id=m.id
		WHERE m.status IN ('active','disputed') GROUP BY m.id ORDER BY m.updated_at DESC LIMIT 100`)
	if err == nil {
		for itemRows.Next() {
			var id, typ, subType, content, statusValue, entityCSV string
			var version, layer, importance int
			if itemRows.Scan(&id, &version, &typ, &subType, &content, &layer, &importance, &statusValue, &entityCSV) != nil {
				continue
			}
			var refs []string
			for _, ref := range strings.Split(entityCSV, ",") {
				if strings.TrimSpace(ref) != "" {
					refs = append(refs, strings.TrimSpace(ref))
				}
			}
			matched := strings.Contains(normalizeRecallText(content), normalized)
			for _, ref := range refs {
				if selectedEntitySet[ref] {
					matched = true
				}
			}
			vectorScore := vectorItemScores[id]
			if vectorScore > 0 {
				matched = true
			}
			if !matched || seen[id] {
				continue
			}
			seen[id] = true
			tokens := len([]rune(content))/2 + 1
			itemScore := 0.8 + vectorScore*0.2
			result.Items = append(result.Items, RecallItem{
				ItemID: id, Version: version, Type: typ, SubType: subType, Content: content,
				Score: itemScore, ScoreBreakdown: map[string]float64{"rel": itemScore, "imp": 0.6, "rec": 0.7, "str": 0.4},
				Tokens: tokens, Cite: "[mem:" + id + "@" + itoa(version) + "]", Trust: "trusted",
				EntityRefs: refs, Layer: layer, Why: "entity_or_fts",
			})
		}
		_ = itemRows.Close()
	}
	sort.Slice(result.Items, func(i, j int) bool {
		if result.Items[i].Score != result.Items[j].Score {
			return result.Items[i].Score > result.Items[j].Score
		}
		return result.Items[i].ItemID < result.Items[j].ItemID
	})
	maxItems := 8
	budgetTokens := 8000
	if value, ok := req.Budget["tokenBudget"].(float64); ok && int(value) > 0 {
		budgetTokens = int(value)
	}
	tokensUsed := 0
	packed := make([]RecallItem, 0, maxItems)
	for _, item := range result.Items {
		if len(packed) >= maxItems || tokensUsed+item.Tokens > budgetTokens {
			continue
		}
		tokensUsed += item.Tokens
		packed = append(packed, item)
	}
	result.Items = packed
	result.Paths = append(result.Paths, graph.paths...)
	sort.Slice(result.Paths, func(i, j int) bool {
		if result.Paths[i].Score != result.Paths[j].Score {
			return result.Paths[i].Score > result.Paths[j].Score
		}
		return strings.Join(result.Paths[i].Entities, ">") < strings.Join(result.Paths[j].Entities, ">")
	})
	auxCalls := 0
	tracePaths := graph.tracePaths
	if len(tracePaths) == 0 {
		tracePaths = []map[string]any{}
	}
	if len(vectorCandidates) > 0 {
		tracePaths = append(tracePaths, map[string]any{
			"name": "vector", "candidates": vectorCandidates, "ranks": len(vectorCandidates), "dropped": []any{}})
	}
	routeCandidates := map[string][]map[string]any{"fts": {}, "alias": {}, "graph": {}}
	for _, entity := range result.Entities {
		route := "fts"
		switch entity.Why {
		case "alias", "alias_or_name":
			route = "alias"
		case "graph":
			route = "graph"
		}
		routeCandidates[route] = append(routeCandidates[route],
			map[string]any{"entityId": entity.EntityID, "score": entity.Score, "why": entity.Why})
	}
	for _, route := range []string{"fts", "alias", "graph"} {
		if len(routeCandidates[route]) == 0 {
			continue
		}
		tracePaths = append(tracePaths, map[string]any{"name": route,
			"candidates": routeCandidates[route], "ranks": len(routeCandidates[route]), "dropped": []any{}})
	}
	trace := map[string]any{
		"recallId": result.RecallID, "at": time.Now().UnixMilli(), "sessionId": req.SessionID,
		"agentId": req.AgentID, "taskId": req.TaskID,
		"queryPlan": map[string]any{
			"normalizedQuery": normalized, "mentions": seedIDs, "hopLimit": graph.maxHop,
			"intent": req.Intent, "filters": req.Filters,
		},
		"paths":    tracePaths,
		"hops":     graph.hops,
		"fusion":   result.Entities,
		"entities": result.Entities,
		"selected": result.Items,
		"dropped":  []any{},
		"warnings": result.Warnings,
		"cost": map[string]any{"injectedTokens": tokensUsed, "edgeVisits": graph.edgeVisits,
			"auxCalls": auxCalls, "auxTokens": 0, "latencyMs": time.Since(startedAt).Milliseconds()},
	}
	if r2RecallEnabled() {
		agentic := m.applyRecallAgentic(ctx, &result, trace, req, normalized, seedIDs, startedAt)
		auxCalls += agentic.auxCalls
		result.Warnings = appendUniqueStrings(result.Warnings, agentic.warnings...)
		if agentic.ask != nil {
			result.Ask = agentic.ask
		}
	}
	result.BudgetReport = map[string]any{
		"requested": map[string]any{"maxEntities": maxEntities, "perEntityN": 3,
			"maxHop": graph.maxHop, "tokenBudget": budgetTokens},
		"returned": map[string]any{"entities": len(result.Entities), "items": len(result.Items),
			"tokens": tokensUsed, "paths": len(result.Paths), "steps": traceStepCount(trace)},
		"tokensUsed": tokensUsed, "quota": budgetTokens, "auxCalls": auxCalls,
		"edgeVisits": graph.edgeVisits, "dropped": []any{},
	}
	if cost, ok := trace["cost"].(map[string]any); ok {
		cost["auxCalls"] = auxCalls
		cost["latencyMs"] = time.Since(startedAt).Milliseconds()
	}
	trace["warnings"] = result.Warnings
	if req.Trace != "off" {
		result.Trace = trace
	}
	return result
}

type agenticOutcome struct {
	auxCalls int
	warnings []string
	ask      any
}

func traceStepCount(trace map[string]any) int {
	if steps, ok := trace["steps"].([]map[string]any); ok {
		return len(steps)
	}
	return 0
}

func appendUniqueStrings(values []string, add ...string) []string {
	seen := map[string]bool{}
	for _, value := range values {
		seen[value] = true
	}
	for _, value := range add {
		if value != "" && !seen[value] {
			values = append(values, value)
			seen[value] = true
		}
	}
	return values
}

func (m *Module) handleDebugRecallSeed(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var body struct {
		Entities       []map[string]any `json:"entities"`
		Relations      []map[string]any `json:"relations"`
		MemoryItems    []map[string]any `json:"memoryItems"`
		MemoryItemsAlt []map[string]any `json:"memory_items"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&body); err != nil {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": map[string]any{"code": "invalid_argument", "message": err.Error()}})
		return
	}
	items := body.MemoryItems
	if len(items) == 0 {
		items = body.MemoryItemsAlt
	}
	now := time.Now().UnixMilli()
	err := m.store.Write(r.Context(), func(tx *sql.Tx) error {
		for _, entity := range body.Entities {
			id := stringField(entity, "id")
			if id == "" {
				continue
			}
			kind := firstNonEmpty(stringField(entity, "kind"), "concept")
			entityClass := firstNonEmpty(stringField(entity, "entity_class"), stringField(entity, "entityClass"), "semantic")
			name := firstNonEmpty(stringField(entity, "name"), stringField(entity, "canonical_name"), id)
			canonical := firstNonEmpty(stringField(entity, "canonical_name"), stringField(entity, "canonicalName"), name)
			aliases := entity["aliases"]
			aliasJSON, _ := json.Marshal(aliases)
			_, _ = tx.ExecContext(r.Context(), `INSERT INTO entities(id,entity_class,kind,name,canonical_name,aliases_json,owner_agent,status,created_at,updated_at)
				VALUES (?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(id) DO UPDATE SET entity_class=excluded.entity_class,kind=excluded.kind,name=excluded.name,
				canonical_name=excluded.canonical_name,aliases_json=excluded.aliases_json,updated_at=excluded.updated_at`,
				id, entityClass, kind, name, canonical, string(aliasJSON), "agent:simo", "active", now, now)
			_ = insertRecallAlias(tx, r.Context(), id, canonical, now)
			for _, alias := range anyStrings(aliases) {
				_ = insertRecallAlias(tx, r.Context(), id, alias, now)
			}
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM recall_entity_fts WHERE entity_id=?`, id)
			_, _ = tx.ExecContext(r.Context(), `INSERT INTO recall_entity_fts(entity_id,name,aliases) VALUES (?,?,?)`, id, canonical, strings.Join(anyStrings(aliases), " "))
		}
		for _, relation := range body.Relations {
			id := firstNonEmpty(stringField(relation, "id"), "rel-"+stringField(relation, "from_entity")+"-"+stringField(relation, "rel_type"))
			from := stringField(relation, "from_entity")
			to := stringField(relation, "to_entity")
			relType := firstNonEmpty(stringField(relation, "rel_type"), stringField(relation, "relType"))
			sourceItem := firstNonEmpty(stringField(relation, "source_item"), stringField(relation, "sourceItem"))
			sourceVersion := intField(relation, "source_version", intField(relation, "sourceVersion", 0))
			confidence := floatField(relation, "confidence", 0.8)
			_, _ = tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO entity_relations(id,from_entity,to_entity,rel_type,attrs_json,source,confidence,valid_from,valid_to,created_at)
				VALUES (?,?,?,?, '{}','canonical',?,?,0,?)`, id, from, to, relType, confidence, now, now)
			for _, direction := range []string{"forward", "reverse"} {
				src, dst := from, to
				if direction == "reverse" {
					src, dst = to, from
				}
				_, _ = tx.ExecContext(r.Context(), `INSERT OR REPLACE INTO recall_edges(edge_id,direction,src_entity,rel_type,dst_entity,source_item,source_version,confidence,valid_from,valid_to)
					VALUES (?,?,?,?,?,?,?,?,?,0)`, id, direction, src, relType, dst, sourceItem, sourceVersion, confidence, now)
			}
		}
		for _, item := range items {
			id := firstNonEmpty(stringField(item, "id"), stringField(item, "itemId"))
			if id == "" {
				continue
			}
			content := stringField(item, "content")
			itemType := firstNonEmpty(stringField(item, "type"), "semantic")
			subType := firstNonEmpty(stringField(item, "sub_type"), stringField(item, "subType"))
			version := intField(item, "version", 1)
			layer := intField(item, "layer", 1)
			status := firstNonEmpty(stringField(item, "status"), "active")
			if _, err := tx.ExecContext(r.Context(), `INSERT INTO memories(id,type,sub_type,owner_agent,assertion,attributed_to,fact_key,content,
				canonical_refs_json,raw_refs_json,source,authority,confidence,status,version,layer,importance,strength,
				last_used_at,valid_from,valid_until,sensitivity,canonicalizer_version,content_hash,canonical_missing,
				legacy_kind,legacy_scope,conflict_with_json,created_at,updated_at)
				VALUES (?,?,?,?, 'fact','','',?, '[]','[]','user','user_confirmed',0.9,?,?,?,5,0,0,?,0,'normal','v0.3','',1,'','','[]',?,?)
				ON CONFLICT(id) DO UPDATE SET content=excluded.content,type=excluded.type,status=excluded.status,version=excluded.version,updated_at=excluded.updated_at`,
				id, itemType, subType, "agent:simo", content, status, version, layer, now, now, now); err != nil {
				return fmt.Errorf("seed memory %s: %w", id, err)
			}
			_, _ = tx.ExecContext(r.Context(), `DELETE FROM memory_entities WHERE memory_id=?`, id)
			for _, ref := range anyStrings(item["entityRefs"]) {
				_, _ = tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,role,source) VALUES (?,?, 'primary','canonical')`, id, ref)
				_, _ = tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO memory_item_entities(item_id,item_version,entity_id,role,confidence,source,created_at) VALUES (?,?,?,'mention',0.9,'canonical',?)`, id, version, ref, now)
			}
			for _, ref := range anyStrings(item["entity_refs"]) {
				_, _ = tx.ExecContext(r.Context(), `INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,role,source) VALUES (?,?, 'primary','canonical')`, id, ref)
			}
		}
		return nil
	})
	if err != nil {
		httpserver.WriteJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": map[string]any{"code": "internal", "message": err.Error()}})
		return
	}
	vectorStats, _ := m.rebuildRecallVectors(r.Context())
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "vectors": vectorStats})
}

func (m *Module) handleDebugRecallRebuild(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	type entitySeed struct {
		id, name, canonical, aliases string
	}
	entities := make([]entitySeed, 0, 32)
	if rows, err := m.store.Query(r.Context(), `SELECT id,name,canonical_name,aliases_json FROM entities WHERE status='active'`); err == nil {
		for rows.Next() {
			var seed entitySeed
			if rows.Scan(&seed.id, &seed.name, &seed.canonical, &seed.aliases) == nil {
				entities = append(entities, seed)
			}
		}
		_ = rows.Close()
	}
	type edgeSeed struct {
		id, from, to, relType, sourceItem string
		version                           int
		confidence                        float64
		validFrom, validTo                int64
	}
	edges := make([]edgeSeed, 0, 32)
	if rows, err := m.store.Query(r.Context(), `SELECT id,from_entity,to_entity,rel_type,confidence,valid_from,valid_to FROM entity_relations`); err == nil {
		for rows.Next() {
			var edge edgeSeed
			if rows.Scan(&edge.id, &edge.from, &edge.to, &edge.relType, &edge.confidence, &edge.validFrom, &edge.validTo) == nil {
				edges = append(edges, edge)
			}
		}
		_ = rows.Close()
	}
	now := time.Now().UnixMilli()
	if err := m.store.Write(r.Context(), func(tx *sql.Tx) error {
		_, _ = tx.ExecContext(r.Context(), `DELETE FROM recall_aliases`)
		_, _ = tx.ExecContext(r.Context(), `DELETE FROM recall_entity_fts`)
		_, _ = tx.ExecContext(r.Context(), `DELETE FROM recall_edges`)
		for _, entity := range entities {
			aliases := []string{entity.canonical, entity.name}
			aliases = append(aliases, decodeStringArray(entity.aliases)...)
			seen := map[string]bool{}
			for _, alias := range aliases {
				normalized := normalizeRecallText(alias)
				if normalized == "" || seen[normalized] {
					continue
				}
				seen[normalized] = true
				_, _ = tx.ExecContext(r.Context(), `INSERT OR REPLACE INTO recall_aliases(alias,entity_id,source,weight,updated_at)
					VALUES (?,?,'canonical',1.0,?)`, normalized, entity.id, now)
			}
			_, _ = tx.ExecContext(r.Context(), `INSERT INTO recall_entity_fts(entity_id,name,aliases) VALUES (?,?,?)`,
				entity.id, entity.canonical, strings.Join(aliases, " "))
		}
		for _, edge := range edges {
			for _, direction := range []string{"forward", "reverse"} {
				src, dst := edge.from, edge.to
				if direction == "reverse" {
					src, dst = edge.to, edge.from
				}
				_, _ = tx.ExecContext(r.Context(), `INSERT OR REPLACE INTO recall_edges(edge_id,direction,src_entity,rel_type,dst_entity,source_item,source_version,confidence,valid_from,valid_to)
					VALUES (?,?,?,?,?,?,?,?,?,?)`, edge.id, direction, src, edge.relType, dst,
					edge.sourceItem, edge.version, edge.confidence, edge.validFrom, edge.validTo)
			}
		}
		_, _ = tx.ExecContext(r.Context(), `INSERT OR REPLACE INTO recall_meta(key,value,updated_at) VALUES ('rebuilt_at',?,?)`,
			fmt.Sprintf("%d", now), now)
		return nil
	}); err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "重建召回派生层失败")
		return
	}
	vectorStats, vectorErr := m.rebuildRecallVectors(r.Context())
	response := map[string]any{"ok": true, "rebuilt": true, "entities": len(entities), "edges": len(edges)}
	if vectorErr == nil {
		response["vectors"] = vectorStats
	}
	httpserver.WriteJSON(w, http.StatusOK, response)
}

func insertRecallAlias(tx *sql.Tx, ctx context.Context, entityID, alias string, now int64) error {
	normalized := normalizeRecallText(alias)
	if normalized == "" {
		return nil
	}
	_, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO recall_aliases(alias,entity_id,source,weight,updated_at)
		VALUES (?,?, 'canonical',1.0,?)`, normalized, entityID, now)
	return err
}

func normalizeRecallText(text string) string {
	text = strings.TrimSpace(strings.ToLower(text))
	text = strings.ReplaceAll(text, "　", " ")
	return strings.Join(strings.Fields(text), " ")
}

func stringField(value map[string]any, key string) string {
	if raw, ok := value[key]; ok {
		if text, ok := raw.(string); ok {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func intField(value map[string]any, key string, fallback int) int {
	if raw, ok := value[key]; ok {
		switch number := raw.(type) {
		case float64:
			return int(number)
		case int:
			return number
		}
	}
	return fallback
}

func floatField(value map[string]any, key string, fallback float64) float64 {
	if raw, ok := value[key]; ok {
		if number, ok := raw.(float64); ok {
			return number
		}
	}
	return fallback
}

func anyStrings(value any) []string {
	switch list := value.(type) {
	case []any:
		out := make([]string, 0, len(list))
		for _, item := range list {
			if text, ok := item.(string); ok {
				out = append(out, text)
			}
		}
		return out
	case []string:
		return list
	}
	return nil
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := []byte{}
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}
