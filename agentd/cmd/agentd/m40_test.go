package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
)

func TestOverviewCorruptLegacyCacheRebuiltFromTasks(t *testing.T) {
	a, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "mock:workflow-2 请拆解执行概览任务"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitWorkflowDone(t, ts.URL)
	now := time.Now().UnixMilli()
	completedRaw := "[\"完成：\uFFFD用无序列表…\",\"」、请严格用 Markdown 回复…\"]"
	timelineRaw := "[{\"at\":1,\"text\":\"12:46 推进：\uFFFD3 条无序列表\"}]"
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO session_overviews(
			session_id, goal, constraints, current, completed, pending, notes, timeline, version, updated_at)
			VALUES ('main', '目标。', '约束。', '现状。', ?, '待办。', '备注。', ?, 4, ?)`,
			completedRaw, timelineRaw, now)
		return err
	}); err != nil {
		t.Fatalf("写旧缓存: %v", err)
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/overview")
	if status != http.StatusOK {
		t.Fatalf("overview = %d %s", status, body)
	}
	text := string(body)
	if strings.Contains(text, "\uFFFD") || strings.Contains(text, "」、") || strings.Contains(text, "已经完成的是") {
		t.Fatalf("旧碎片/乱码未重建: %s", body)
	}
	var payload struct {
		Overview struct {
			Completed []string `json:"completed"`
			Timeline  []struct {
				Text string `json:"text"`
			} `json:"timeline"`
		} `json:"overview"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("overview JSON: %s", body)
	}
	for _, item := range payload.Overview.Completed {
		if !strings.HasPrefix(item, "完成：") || len([]rune(item)) > 60 {
			t.Fatalf("completed 未按任务重建: %q", item)
		}
	}
	for _, item := range payload.Overview.Timeline {
		if len([]rune(item.Text)) > 80 {
			t.Fatalf("timeline 超长: %q", item.Text)
		}
	}
}
