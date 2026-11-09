package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

func TestM27RecallR2TwoHopAndAgentic(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	seed := map[string]any{
		"entities": []map[string]any{
			{"id": "ent-a", "kind": "place", "canonical_name": "Alpha城", "aliases": []string{"Alpha"}},
			{"id": "ent-b", "kind": "org", "canonical_name": "Beta店"},
			{"id": "ent-c", "kind": "item", "canonical_name": "Gamma物"},
		},
		"relations": []map[string]any{
			{"id": "rel-ab", "from_entity": "ent-a", "to_entity": "ent-b", "rel_type": "located_in",
				"source_item": "mem-a", "source_version": 1, "confidence": 0.9},
			{"id": "rel-bc", "from_entity": "ent-b", "to_entity": "ent-c", "rel_type": "purchased_at",
				"source_item": "mem-b", "source_version": 1, "confidence": 0.9},
		},
	}
	status, body := postJSON(t, ts.URL+"/api/debug/recall/seed", seed)
	if status != http.StatusOK {
		t.Fatalf("seed = %d %s", status, body)
	}
	status, body = postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "Alpha城", "sessionId": "main", "agentId": "agent:simo", "trace": "full",
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	var result struct {
		Paths []struct {
			Entities []string `json:"entities"`
			Edges    []struct {
				RelType string `json:"relType"`
			} `json:"edges"`
		} `json:"paths"`
		Trace struct {
			QueryPlan struct {
				HopLimit int `json:"hopLimit"`
			} `json:"queryPlan"`
			Hops  []map[string]any `json:"hops"`
			Steps []map[string]any `json:"steps"`
			Cost  map[string]any   `json:"cost"`
		} `json:"trace"`
		Budget map[string]any `json:"budgetReport"`
		Ask    map[string]any `json:"ask"`
		Warn   []string       `json:"warnings"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("JSON = %s", body)
	}
	twoHop := false
	for _, path := range result.Paths {
		if len(path.Entities) == 3 && len(path.Edges) == 2 {
			twoHop = true
		}
	}
	if !twoHop {
		t.Fatalf("缺少 2 跳路径: %s", body)
	}
	if len(result.Trace.Steps) == 0 || len(result.Trace.Steps) > 3 {
		t.Fatalf("agentic steps 不合法: %s", body)
	}
	if result.Budget["edgeVisits"] == nil {
		t.Fatalf("budgetReport 缺 edgeVisits: %s", body)
	}
	// 空查询走 Ask（一次一问）。
	status, body = postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "完全不存在的东西XYZ", "sessionId": "main", "agentId": "agent:simo", "trace": "full",
	})
	if status != http.StatusOK {
		t.Fatalf("empty recall = %d %s", status, body)
	}
	var empty struct {
		Ask  map[string]any `json:"ask"`
		Warn []string       `json:"warnings"`
	}
	_ = json.Unmarshal(body, &empty)
	if empty.Ask == nil && !strings.Contains(string(body), "no_hit") {
		t.Fatalf("空结果既无 ask 也无 no_hit: %s", body)
	}
}

func TestM27RecallR2DefaultOn(t *testing.T) {
	t.Setenv("AGENTD_RECALL_R2", "")
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "不存在", "sessionId": "main", "trace": "full",
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	var result struct {
		Trace struct {
			QueryPlan struct {
				HopLimit int `json:"hopLimit"`
			} `json:"queryPlan"`
			Steps []map[string]any `json:"steps"`
		} `json:"trace"`
		Warn []string `json:"warnings"`
	}
	_ = json.Unmarshal(body, &result)
	if result.Trace.QueryPlan.HopLimit != 2 || len(result.Trace.Steps) == 0 {
		t.Fatalf("R2 未设置时应默认开启 2 跳/agentic: %s", body)
	}
	vectorWarning := false
	for _, warning := range result.Warn {
		if warning == "vector_unavailable" || warning == "vector_used" {
			vectorWarning = true
		}
	}
	if vectorWarning {
		t.Fatalf("向量默认应关闭: %s", body)
	}
}

func TestM27RecallR2SwitchAndVectorDegrade(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	t.Setenv("AGENTD_RECALL_R2", "0")
	t.Setenv("AGENTD_RECALL_VECTOR", "1")
	status, body := postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "不存在", "sessionId": "main", "budget": map[string]any{"maxHop": 2}, "trace": "full",
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	var result struct {
		Trace struct {
			QueryPlan struct {
				HopLimit int `json:"hopLimit"`
			} `json:"queryPlan"`
			Steps []map[string]any `json:"steps"`
		} `json:"trace"`
		Warn []string `json:"warnings"`
	}
	_ = json.Unmarshal(body, &result)
	if result.Trace.QueryPlan.HopLimit != 1 {
		t.Fatalf("R2=0 应夹取 1 跳: %s", body)
	}
	if len(result.Trace.Steps) != 0 {
		t.Fatalf("R2=0 不应有 agentic steps: %s", body)
	}
	found := false
	for _, warning := range result.Warn {
		if warning == "vector_unavailable" {
			found = true
		}
	}
	if !found {
		t.Fatalf("向量开启但未实现应降级 vector_unavailable: %s", body)
	}
}
