package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM21MemoryV3Pipeline(t *testing.T) {
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "记住：项目代号是猎户座"); status != http.StatusAccepted {
		t.Fatalf("memory chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/memory/items?status=all")
	if status != http.StatusOK {
		t.Fatalf("memory items = %d %s", status, body)
	}
	var items struct {
		Items []struct {
			ID      string   `json:"id"`
			Type    string   `json:"type"`
			Content string   `json:"content"`
			FactKey string   `json:"factKey"`
			Entity  []string `json:"entityRefs"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &items); err != nil || len(items.Items) == 0 {
		t.Fatalf("memory items JSON = %v %s", err, body)
	}
	if items.Items[0].ID == "" || items.Items[0].Type == "" {
		t.Fatalf("v0.3 字段缺失: %+v", items.Items[0])
	}
	entityID := "ent-agent-simo"
	if len(items.Items[0].Entity) > 0 {
		entityID = items.Items[0].Entity[0]
	}
	status, body = httpGet(t, ts.URL+"/api/memory/items/"+items.Items[0].ID)
	if status != http.StatusOK || !strings.Contains(string(body), `"canonicalRefs"`) {
		t.Fatalf("memory item get = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/memory/pyramid?entityId="+entityID+"&view=what_happened")
	var pyramid struct {
		Nodes []any `json:"nodes"`
	}
	if status != http.StatusOK || json.Unmarshal(body, &pyramid) != nil || len(pyramid.Nodes) == 0 {
		var nodeCount int
		_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM pyramid_nodes`).Scan(&nodeCount)
		t.Fatalf("memory pyramid nodes = %d %s entity=%s itemEntity=%v nodeCount=%d", status, body, entityID, items.Items[0].Entity, nodeCount)
	}
	status, body = httpGet(t, ts.URL+"/api/memory/entities")
	if status != http.StatusOK || !strings.Contains(string(body), `"entities"`) {
		t.Fatalf("memory entities = %d %s", status, body)
	}
	for _, path := range []string{"/api/memory/graph?entityId=ent-agent-simo", "/api/memory/pyramid?entityId=ent-agent-simo", "/api/memory/agents", "/api/memory/agents/agent-simo/memory", "/api/memory/entities/ent-agent-simo/timeline"} {
		if status, body := httpGet(t, ts.URL+path); status != http.StatusOK || !strings.Contains(string(body), `"ok":true`) {
			t.Fatalf("%s = %d %s", path, status, body)
		}
	}
	// 写接口仍不存在。
	if status, _ := postJSON(t, ts.URL+"/api/memory/candidates", map[string]any{}); status != http.StatusNotFound {
		t.Fatalf("memory write endpoint = %d", status)
	}
}
