package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

func TestM22RecallR1(t *testing.T) {
	t.Setenv("AGENTD_DEBUG", "1")
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	seed := map[string]any{
		"entities": []map[string]any{
			{"id": "ent-item-souvenir", "entity_class": "semantic", "kind": "item", "canonical_name": "纪念品", "name": "纪念品", "aliases": []string{"伴手礼"}},
			{"id": "ent-org-seisui", "entity_class": "semantic", "kind": "org", "canonical_name": "清水寺纪念品店", "name": "清水寺纪念品店", "aliases": []string{"那家店"}},
			{"id": "ent-place-kyoto", "entity_class": "semantic", "kind": "place", "canonical_name": "京都", "name": "京都"},
		},
		"relations": []map[string]any{
			{"id": "rel-1", "from_entity": "ent-org-seisui", "to_entity": "ent-place-kyoto", "rel_type": "located_in", "source": "canonical", "confidence": 0.9, "source_item": "mem-042", "source_version": 2},
			{"id": "rel-2", "from_entity": "ent-item-souvenir", "to_entity": "ent-org-seisui", "rel_type": "purchased_at", "source": "canonical", "confidence": 0.9, "source_item": "mem-042", "source_version": 2},
		},
		"memoryItems": []map[string]any{
			{"id": "mem-042", "version": 2, "type": "scene", "sub_type": "purchase", "content": "2026-10 在京都清水寺的纪念品店买了御守。", "status": "active", "entityRefs": []string{"ent-item-souvenir", "ent-org-seisui", "ent-place-kyoto"}, "layer": 1},
		},
	}
	status, body := postJSON(t, ts.URL+"/api/debug/recall/seed", seed)
	if status != http.StatusOK {
		t.Fatalf("seed = %d %s", status, body)
	}
	var memoryCount, bindingCount int
	_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM memories`).Scan(&memoryCount)
	_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM memory_entities`).Scan(&bindingCount)
	t.Logf("seed response=%s memories=%d bindings=%d", body, memoryCount, bindingCount)
	status, body = postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"recallId": "rc-test", "sessionId": "main", "agentId": "agent:simo",
		"query": "我在京都买的那家店的纪念品是什么", "trace": "full",
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	var result struct {
		OK       bool `json:"ok"`
		Entities []struct {
			EntityID string `json:"entityId"`
		} `json:"entities"`
		Items []struct {
			ItemID string   `json:"itemId"`
			Cite   string   `json:"cite"`
			Entity []string `json:"entityRefs"`
		} `json:"items"`
		Paths []struct {
			Edges []struct {
				RelType string `json:"relType"`
			} `json:"edges"`
		} `json:"paths"`
		Budget any      `json:"budgetReport"`
		Warn   []string `json:"warnings"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("recall JSON: %s", body)
	}
	if !result.OK || len(result.Entities) == 0 || len(result.Items) == 0 || len(result.Paths) == 0 {
		t.Fatalf("recall 结果不足: %s", body)
	}
	if !strings.HasPrefix(result.Items[0].Cite, "[mem:") || result.Budget == nil {
		t.Fatalf("recall cite/budget = %s", body)
	}
}
