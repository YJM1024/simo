package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM32LocalVectorRecallAndFusion(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	seed := map[string]any{
		"entities": []map[string]any{
			{"id": "ent-kyoto", "kind": "place", "canonical_name": "京都"},
		},
		"memoryItems": []map[string]any{
			{"id": "mem-tea", "version": 1, "type": "semantic", "status": "active", "layer": 1,
				"content": "在京都买了抹茶纪念品，味道很好。"},
			{"id": "mem-other", "version": 1, "type": "semantic", "status": "active", "layer": 1,
				"content": "明天记得给团队发周报。"},
		},
	}
	status, body := postJSON(t, ts.URL+"/api/debug/recall/seed", seed)
	if status != http.StatusOK {
		t.Fatalf("seed = %d %s", status, body)
	}
	t.Setenv("SIMO_RECALL_VECTOR", "1")
	status, body = postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "抹茶点心", "sessionId": "main", "agentId": "agent:simo",
		"trace": "full", "allowAgentic": false,
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	var result struct {
		Items []struct {
			ItemID  string `json:"itemId"`
			Content string `json:"content"`
		} `json:"items"`
		Trace struct {
			Paths []struct {
				Name string `json:"name"`
			} `json:"paths"`
		} `json:"trace"`
		Warn []string `json:"warnings"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("JSON = %s", body)
	}
	vectorPath := false
	for _, path := range result.Trace.Paths {
		if path.Name == "vector" {
			vectorPath = true
		}
	}
	if !vectorPath || len(result.Items) == 0 {
		t.Fatalf("向量召回未命中/无 vector trace: %s", body)
	}
	for _, warning := range result.Warn {
		if warning == "vector_unavailable" {
			t.Fatalf("向量已开启却降级: %s", body)
		}
	}
	// rebuild 幂等：连续两次重建计数一致。
	status, body = postJSON(t, ts.URL+"/api/debug/recall/rebuild", map[string]any{})
	if status != http.StatusOK || !strings.Contains(string(body), `"rebuilt":true`) {
		t.Fatalf("rebuild = %d %s", status, body)
	}
	_, body2 := postJSON(t, ts.URL+"/api/debug/recall/rebuild", map[string]any{})
	if strings.Count(string(body), `"documents"`) != strings.Count(string(body2), `"documents"`) {
		t.Fatalf("重建不幂等: %s / %s", body, body2)
	}
}

func TestM32VectorDefaultOff(t *testing.T) {
	t.Setenv("SIMO_RECALL_VECTOR", "")
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	status, body := postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "抹茶", "sessionId": "main", "trace": "summary", "allowAgentic": false,
	})
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	if strings.Contains(string(body), `"name":"vector"`) {
		t.Fatalf("向量默认关闭却出现 vector 路径: %s", body)
	}
}
