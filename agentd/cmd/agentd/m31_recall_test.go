package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
)

func TestM31RecallEntityBindingNoSelfLock(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	seed := map[string]any{
		"entities": []map[string]any{
			{"id": "ent-deadlock", "kind": "item", "canonical_name": "绑定测试物", "aliases": []string{"绑定测试"}},
		},
		"memoryItems": []map[string]any{
			{"id": "mem-deadlock", "version": 1, "type": "semantic", "content": "这是一条带实体绑定的记忆正文。",
				"status": "active", "entityRefs": []string{"ent-deadlock"}, "layer": 1},
		},
	}
	if status, body := postJSON(t, ts.URL+"/api/debug/recall/seed", seed); status != http.StatusOK {
		t.Fatalf("seed = %d %s", status, body)
	}
	started := time.Now()
	status, body := postJSON(t, ts.URL+"/api/debug/recall", map[string]any{
		"query": "绑定测试", "sessionId": "main", "agentId": "agent:simo", "trace": "summary",
	})
	elapsed := time.Since(started)
	if status != http.StatusOK {
		t.Fatalf("recall = %d %s", status, body)
	}
	if elapsed > time.Second {
		t.Fatalf("recall 超时/自锁: %v", elapsed)
	}
	var result struct {
		Items []struct {
			ItemID string `json:"itemId"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &result); err != nil || len(result.Items) == 0 {
		t.Fatalf("绑定记忆未命中: %v %s", err, body)
	}
	if !strings.Contains(string(body), `"itemId":"mem-deadlock"`) {
		t.Fatalf("绑定记忆内容缺失: %s", body)
	}
}
