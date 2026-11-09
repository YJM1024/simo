package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

func TestM30ConsolidationCandidatesMergeAndIdempotency(t *testing.T) {
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	seedRaw := []struct {
		id, role, text string
	}{
		{"raw-1", "user", "记住：项目代号是 Orion，主要负责数据整理。"},
		{"raw-2", "user", "项目代号是 Vega，这个说法也要保留。"},
		{"raw-3", "user", "我们约定每周五提交一次交付物。"},
		{"raw-4", "user", "今天天气不错，随便聊聊。"},
	}
	for _, message := range seedRaw {
		if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
			_, err := tx.ExecContext(context.Background(), `INSERT OR IGNORE INTO raw_messages(id,session_id,role,text,canonical_state,created_at)
				VALUES (?, 'main', ?, ?, 'pending', 1)`, message.id, message.role, message.text)
			return err
		}); err != nil {
			t.Fatalf("seed raw: %v", err)
		}
	}
	status, body := postJSON(t, ts.URL+"/api/debug/memory/consolidate", map[string]any{
		"sessionId": "main", "agentId": "agent:simo", "maxMessages": 20,
	})
	if status != http.StatusOK {
		t.Fatalf("consolidate = %d %s", status, body)
	}
	var result struct {
		DataIdempotent bool `json:"-"`
		Data           struct {
			Idempotent bool `json:"idempotent"`
			Job        struct {
				ID             string `json:"id"`
				CandidateCount int    `json:"candidateCount"`
				CreatedCount   int    `json:"createdCount"`
				ConflictCount  int    `json:"conflictCount"`
				Status         string `json:"status"`
			} `json:"job"`
			Warnings []string `json:"warnings"`
		} `json:"data"`
		Job struct {
			ID string `json:"id"`
		} `json:"job"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatalf("JSON = %v %s", err, body)
	}
	if result.Data.Job.ID == "" || result.Data.Job.CandidateCount < 2 || result.Data.Job.ConflictCount < 1 {
		t.Fatalf("巩固结果不足: %s", body)
	}
	// 重复调用同源消息集合必须幂等。
	status, body2 := postJSON(t, ts.URL+"/api/debug/memory/consolidate", map[string]any{
		"sessionId": "main", "agentId": "agent:simo", "maxMessages": 20,
	})
	if status != http.StatusOK || !strings.Contains(string(body2), `"idempotent":true`) {
		t.Fatalf("幂等失败: %d %s", status, body2)
	}
	status, conflicts := httpGet(t, ts.URL+"/api/memory/conflicts")
	if status == http.StatusOK && (!strings.Contains(string(conflicts), "Orion") || !strings.Contains(string(conflicts), "Vega")) {
		t.Fatalf("巩固冲突未保留: %s", conflicts)
	}
	status, agentMemory := httpGet(t, ts.URL+"/api/memory/agents/simo/memory")
	if status == http.StatusOK && !strings.Contains(string(agentMemory), `"ownerAgent":"agent:simo"`) {
		t.Fatalf("智能体通用记忆缺失: %s", agentMemory)
	}
	var auditCount int
	_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM memory_writeback_audit`).Scan(&auditCount)
	if auditCount == 0 {
		t.Fatalf("写回审计缺失")
	}
	var eventCount int
	_ = a.db.QueryRow(context.Background(), `SELECT COUNT(*) FROM events WHERE type='memory.consolidated'`).Scan(&eventCount)
	if eventCount == 0 {
		t.Fatalf("巩固事件未写审计")
	}
}
