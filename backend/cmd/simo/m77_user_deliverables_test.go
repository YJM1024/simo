package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

type userDeliverablesPayload struct {
	OK           bool             `json:"ok"`
	Deliverables []map[string]any `json:"deliverables"`
	Total        int              `json:"total"`
	Limit        int              `json:"limit"`
	Offset       int              `json:"offset"`
	HasMore      bool             `json:"hasMore"`
}

func getUserDeliverables(t *testing.T, baseURL, query string) (int, userDeliverablesPayload) {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/deliverables"+query)
	var payload userDeliverablesPayload
	if len(body) > 0 {
		_ = json.Unmarshal(body, &payload)
	}
	return status, payload
}

func TestM77UserDeliverablesAcrossSessions(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	second := createSession(t, ts.URL, "main", "第二会话")
	now := time.Now().UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		items := []struct {
			id, taskID, name, kind string
			created                int64
		}{
			{"old-main", "session:main", "旧交付.txt", "user_delivery", now - 1000},
			{"mid-main", "session:main", "中间交付.md", "user_delivery", now - 500},
			{"new-second", "session:" + second, "最新交付.pdf", "user_delivery", now},
			{"internal", "task-internal", "report-attempt-1.md", "internal", now + 10},
		}
		for _, item := range items {
			if _, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
				id, task_id, name, rel_path, mime, size, created_at, delivery_kind)
				VALUES (?, ?, ?, ?, 'text/plain', 5, ?, ?)`,
				item.id, item.taskID, item.name, item.taskID+"/"+item.name, item.created, item.kind); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	status, payload := getUserDeliverables(t, ts.URL, "?limit=2")
	if status != http.StatusOK || payload.Total != 3 || len(payload.Deliverables) != 2 || !payload.HasMore {
		t.Fatalf("deliverables limit=2 = %d %+v", status, payload)
	}
	if payload.Deliverables[0]["id"] != "new-second" || payload.Deliverables[1]["id"] != "mid-main" {
		t.Fatalf("最新优先排序错误: %+v", payload.Deliverables)
	}
	if payload.Deliverables[0]["sessionId"] != second || payload.Deliverables[0]["sessionTitle"] != "第二会话" {
		t.Fatalf("sessionId/sessionTitle 错误: %+v", payload.Deliverables[0])
	}
	if payload.Deliverables[0]["previewUrl"] != "/api/artifacts/new-second/content" ||
		payload.Deliverables[0]["downloadUrl"] != "/api/artifacts/new-second/content?download=1" {
		t.Fatalf("打开引用错误: %+v", payload.Deliverables[0])
	}
	if payload.Deliverables[0]["sessionTitle"] == "" {
		t.Fatalf("sessionTitle 为空")
	}
	// offset 分页。
	status, payload = getUserDeliverables(t, ts.URL, "?limit=1&offset=1")
	if status != http.StatusOK || len(payload.Deliverables) != 1 || payload.Deliverables[0]["id"] != "mid-main" {
		t.Fatalf("offset=1 分页错误: %d %+v", status, payload)
	}
	// 默认最多 20，内部 report 不出现。
	status, payload = getUserDeliverables(t, ts.URL, "")
	if status != http.StatusOK || payload.Total != 3 || len(payload.Deliverables) != 3 {
		t.Fatalf("默认列表 = %d %+v", status, payload)
	}
	for _, item := range payload.Deliverables {
		if item["name"] == "report-attempt-1.md" || item["deliveryKind"] != "user_delivery" {
			t.Fatalf("内部文件泄漏: %+v", item)
		}
	}
	// 非法参数。
	for _, query := range []string{"?limit=0", "?limit=101", "?offset=-1", "?foo=1"} {
		if status, _ := getUserDeliverables(t, ts.URL, query); status != http.StatusBadRequest {
			t.Fatalf("%s = %d, want 400", query, status)
		}
	}
}

func TestM77UserDeliverablesEmpty(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, payload := getUserDeliverables(t, ts.URL, "")
	if status != http.StatusOK || payload.Total != 0 || payload.Deliverables == nil || len(payload.Deliverables) != 0 {
		t.Fatalf("空交付物 = %d %+v", status, payload)
	}
}
