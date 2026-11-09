package memory

import (
	"context"
	"errors"
	"math"
	"os"
	"sort"
	"strings"
	"time"
)

// VectorHit / VectorRetriever 是 R2 的向量检索 seam；默认无实现，调用方降级。
type VectorHit struct {
	ItemID   string  `json:"itemId"`
	EntityID string  `json:"entityId,omitempty"`
	Score    float64 `json:"score"`
}

type VectorRetriever interface {
	SearchVector(ctx context.Context, query string, topK int) ([]VectorHit, error)
}

var ErrVectorUnavailable = errors.New("vector retriever unavailable")

func r2RecallEnabled() bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("SIMO_RECALL_R2")))
	if raw == "" {
		return true
	}
	switch raw {
	case "0", "false", "off", "no", "v1", "r1":
		return false
	}
	return true
}

func vectorRecallEnabled() bool {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("SIMO_RECALL_VECTOR")))
	return raw == "1" || raw == "true" || raw == "on" || raw == "yes"
}

func budgetInt(budget map[string]any, key string, fallback int) int {
	if budget == nil {
		return fallback
	}
	switch value := budget[key].(type) {
	case float64:
		if value > 0 {
			return int(value)
		}
	case int:
		if value > 0 {
			return value
		}
	}
	return fallback
}

func (m *Module) SearchVector(ctx context.Context, query string, topK int) ([]VectorHit, error) {
	if !vectorRecallEnabled() {
		return nil, ErrVectorUnavailable
	}
	if m.vectorRetriever != nil {
		return m.vectorRetriever.SearchVector(ctx, query, topK)
	}
	return m.localVectorSearch(ctx, query, topK)
}

type recallGraphResult struct {
	edges      map[string]RecallEdge
	paths      []RecallPath
	hops       []map[string]any
	tracePaths []map[string]any
	edgeVisits int
	maxHop     int
	warnings   []string
}

func (m *Module) expandRecallGraph(ctx context.Context, seeds []string, scores map[string]float64,
	why map[string]string, budget map[string]any) recallGraphResult {
	out := recallGraphResult{edges: map[string]RecallEdge{}, hops: []map[string]any{}, warnings: []string{}}
	limit := 1
	if r2RecallEnabled() {
		limit = 2
	}
	requested := budgetInt(budget, "maxHop", limit)
	if requested > limit {
		out.warnings = append(out.warnings, "hop_capped")
		requested = limit
	}
	if requested < 1 {
		requested = 1
	}
	if requested > limit {
		requested = limit
	}
	out.maxHop = requested
	maxEdges := budgetInt(budget, "maxEdges", 500)
	maxPerLayer := budgetInt(budget, "maxPerLayer", 50)
	if maxEdges <= 0 {
		maxEdges = 500
	}
	if maxPerLayer <= 0 {
		maxPerLayer = 50
	}
	type parentChain struct {
		entities []string
		edges    []RecallEdge
	}
	chains := map[string]parentChain{}
	visited := map[string]bool{}
	frontier := make([]string, 0, len(seeds))
	for _, seed := range seeds {
		if seed == "" || visited[seed] {
			continue
		}
		visited[seed] = true
		frontier = append(frontier, seed)
		chains[seed] = parentChain{entities: []string{seed}}
	}
	candidatesByPath := make([]map[string]any, 0, 16)
	edgeLimitHit := false
	for hop := 1; hop <= requested && len(frontier) > 0; hop++ {
		type candidate struct {
			from  string
			edge  RecallEdge
			score float64
			chain parentChain
		}
		candidates := make([]candidate, 0, 32)
		for _, src := range frontier {
			if edgeLimitHit {
				break
			}
			rows, err := m.store.Query(ctx, `SELECT src_entity,rel_type,dst_entity,source_item,source_version,confidence,edge_id
				FROM recall_edges WHERE src_entity=? AND direction='forward'
				ORDER BY confidence DESC, edge_id ASC LIMIT ?`, src, maxPerLayer)
			if err != nil {
				continue
			}
			for rows.Next() {
				var from, relType, to, sourceItem, edgeID string
				var sourceVersion int
				var confidence float64
				if rows.Scan(&from, &relType, &to, &sourceItem, &sourceVersion, &confidence, &edgeID) != nil {
					continue
				}
				if to == "" || sourceItem == "" || confidence < 0.2 {
					continue
				}
				out.edgeVisits++
				if out.edgeVisits > maxEdges {
					edgeLimitHit = true
					out.warnings = append(out.warnings, "edge_budget")
					break
				}
				edge := RecallEdge{From: from, RelType: relType, To: to, SourceItem: sourceItem,
					SourceVersion: sourceVersion, Confidence: confidence}
				srcScore := scores[src]
				if srcScore <= 0 {
					srcScore = 0.4
				}
				score := srcScore * math.Pow(0.6, float64(hop)) * confidence
				chain := chains[src]
				nextEntities := append(append([]string{}, chain.entities...), to)
				nextEdges := append(append([]RecallEdge{}, chain.edges...), edge)
				candidates = append(candidates, candidate{from: src, edge: edge, score: score,
					chain: parentChain{entities: nextEntities, edges: nextEdges}})
			}
			_ = rows.Close()
		}
		sort.Slice(candidates, func(i, j int) bool {
			if candidates[i].score != candidates[j].score {
				return candidates[i].score > candidates[j].score
			}
			return candidates[i].edge.To < candidates[j].edge.To
		})
		if len(candidates) > maxPerLayer {
			candidates = candidates[:maxPerLayer]
		}
		nextFrontier := make([]string, 0, len(candidates))
		for _, candidate := range candidates {
			dst := candidate.edge.To
			if visited[dst] {
				// 目标已是种子/已访问实体：仍返回这条 1 跳路径，但不重复扩展。
				if hop == 1 {
					path := RecallPath{Entities: candidate.chain.entities, Edges: candidate.chain.edges,
						Score: candidate.score, Cite: []string{}}
					for _, edge := range candidate.chain.edges {
						path.Cite = append(path.Cite, "[mem:"+edge.SourceItem+"@"+itoa(edge.SourceVersion)+"]")
					}
					out.paths = append(out.paths, path)
					out.hops = append(out.hops, map[string]any{
						"hop": hop, "from": candidate.edge.From, "relType": candidate.edge.RelType,
						"to": dst, "edgeId": candidate.edge.From + "|" + candidate.edge.RelType + "|" + dst,
						"sourceItem": candidate.edge.SourceItem, "sourceVersion": candidate.edge.SourceVersion,
						"confidence": candidate.edge.Confidence, "score": candidate.score,
					})
				}
				continue
			}
			visited[dst] = true
			chains[dst] = candidate.chain
			out.edges[candidate.edge.From+"|"+candidate.edge.RelType+"|"+dst] = candidate.edge
			if _, exists := scores[dst]; !exists {
				scores[dst] = candidate.score
				why[dst] = "graph"
			}
			path := RecallPath{Entities: candidate.chain.entities, Edges: candidate.chain.edges,
				Score: candidate.score, Cite: []string{}}
			for _, edge := range candidate.chain.edges {
				path.Cite = append(path.Cite, "[mem:"+edge.SourceItem+"@"+itoa(edge.SourceVersion)+"]")
			}
			out.paths = append(out.paths, path)
			out.hops = append(out.hops, map[string]any{
				"hop": hop, "from": candidate.edge.From, "relType": candidate.edge.RelType,
				"to": dst, "edgeId": candidate.edge.From + "|" + candidate.edge.RelType + "|" + dst,
				"sourceItem": candidate.edge.SourceItem, "sourceVersion": candidate.edge.SourceVersion,
				"confidence": candidate.edge.Confidence, "score": candidate.score,
			})
			candidatesByPath = append(candidatesByPath, map[string]any{
				"hop": hop, "from": candidate.edge.From, "to": dst, "score": candidate.score,
				"relType": candidate.edge.RelType, "sourceItem": candidate.edge.SourceItem,
			})
			nextFrontier = append(nextFrontier, dst)
		}
		frontier = nextFrontier
		if edgeLimitHit {
			break
		}
	}
	out.tracePaths = []map[string]any{{"name": "graph", "candidates": candidatesByPath,
		"ranks": len(candidatesByPath), "dropped": []any{}}}
	return out
}

func (m *Module) applyRecallAgentic(ctx context.Context, result *RecallResult, trace map[string]any,
	req RecallRequest, normalized string, seedIDs []string, started time.Time) agenticOutcome {
	out := agenticOutcome{warnings: []string{}}
	if req.AllowAgentic != nil && !*req.AllowAgentic {
		return out
	}
	if !r2RecallEnabled() {
		return out
	}
	steps := make([]map[string]any, 0, 3)
	steps = append(steps, map[string]any{"step": 1, "action": "plan",
		"input": map[string]any{"query": normalized, "mentions": len(seedIDs)}, "costMs": 0})
	steps = append(steps, map[string]any{"step": 2, "action": "recall",
		"newEntities": len(result.Entities), "newItems": len(result.Items),
		"costMs": time.Since(started).Milliseconds()})
	if len(result.Entities) > 0 && len(result.Items) > 0 {
		steps = append(steps, map[string]any{"step": 3, "action": "assess", "sufficient": true})
		trace["steps"] = steps
		return out
	}
	action := "rewrite_keywords"
	if len(result.Entities) > 0 {
		action = "lower_threshold"
	}
	step3 := map[string]any{"step": 3, "action": "refine", "op": action,
		"sufficient": false, "costMs": time.Since(started).Milliseconds()}
	steps = append(steps, step3)
	if len(result.Items) == 0 {
		kind := "missing_entity_or_relation"
		question := "你指的是哪个人、地点或物品？给我一个名字或更具体的说法。"
		if len(seedIDs) > 1 || len(result.Entities) > 1 {
			kind = "ambiguous"
			question = "你说的是哪一个？请从候选里选一个。"
		}
		ask := map[string]any{"type": kind, "kind": kind, "category": kind, "question": question,
			"options": []string{}, "once": true}
		out.ask = ask
		out.warnings = append(out.warnings, "no_hit")
		trace["ask"] = ask
	}
	trace["steps"] = steps
	return out
}
