package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func deliveryArtifacts(t *testing.T, baseURL, sessionID string) []map[string]any {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions/"+sessionID+"/artifacts")
	if status != http.StatusOK {
		t.Fatalf("delivery artifacts = %d %s", status, body)
	}
	var payload struct {
		Artifacts []map[string]any `json:"artifacts"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("delivery artifacts JSON: %v %s", err, body)
	}
	return payload.Artifacts
}

func TestM73DeliveryArtifactsOnlyUserDeliverables(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at, delivery_kind)
			VALUES ('art-user-1','session:main','交付报告.pdf','main/交付报告.pdf','application/pdf',10,?, 'user_delivery')`, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO tasks(
			id, session_id, title, kind, status, payload, created_at, updated_at)
			VALUES ('task-internal-1','main','内部任务','mock','done','',?,?)`, now, now); err != nil {
			return err
		}
		_, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at, delivery_kind)
			VALUES ('art-internal-1','task-internal-1','report-attempt-1.md','task-internal-1/report-attempt-1.md','text/markdown',20,?, 'internal')`, now)
		return err
	}); err != nil {
		t.Fatalf("seed artifacts: %v", err)
	}

	artifacts := deliveryArtifacts(t, ts.URL, "main")
	if len(artifacts) != 1 {
		t.Fatalf("delivery list 应只含用户交付物: %+v", artifacts)
	}
	if artifacts[0]["name"] != "交付报告.pdf" || artifacts[0]["userDelivery"] != true ||
		artifacts[0]["deliveryKind"] != "user_delivery" {
		t.Fatalf("用户交付物字段错误: %+v", artifacts[0])
	}
	if artifacts[0]["previewUrl"] != "/api/artifacts/art-user-1/content" ||
		artifacts[0]["downloadUrl"] != "/api/artifacts/art-user-1/content?download=1" {
		t.Fatalf("交付物打开引用缺失/错误: %+v", artifacts[0])
	}
	if err := os.MkdirAll(filepath.Join(a.sandbox.Artifacts, "main"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(a.sandbox.Artifacts, "main", "交付报告.pdf"), []byte("delivery"), 0o644); err != nil {
		t.Fatal(err)
	}
	if status, _ := httpGet(t, ts.URL+artifacts[0]["previewUrl"].(string)); status != http.StatusOK {
		t.Fatalf("交付物 previewUrl 不可用: %d", status)
	}
	if strings.Contains(string(mustJSONBytes(artifacts)), "report-attempt-1.md") {
		t.Fatalf("内部 report 不应出现在交付物列表: %+v", artifacts)
	}

	// 兼容旧接口：?sessionId 也只返回用户交付物。
	status, body := httpGet(t, ts.URL+"/api/artifacts?sessionId=main")
	if status != http.StatusOK || strings.Contains(string(body), "report-attempt-1.md") || !strings.Contains(string(body), "交付报告.pdf") {
		t.Fatalf("session artifacts = %d %s", status, body)
	}
	// 交付物别名接口。
	status, body = httpGet(t, ts.URL+"/api/sessions/main/deliverables")
	if status != http.StatusOK || strings.Contains(string(body), "report-attempt-1.md") || !strings.Contains(string(body), "交付报告.pdf") {
		t.Fatalf("deliverables alias = %d %s", status, body)
	}
	// 详情仍可查询，但带分类标记。
	status, body = httpGet(t, ts.URL+"/api/artifacts/art-internal-1")
	if status != http.StatusOK {
		t.Fatalf("internal artifact detail = %d %s", status, body)
	}
	var detail struct {
		Artifact map[string]any `json:"artifact"`
	}
	_ = json.Unmarshal(body, &detail)
	if detail.Artifact["userDelivery"] != false || detail.Artifact["deliveryKind"] != "internal" {
		t.Fatalf("internal artifact classification = %s", body)
	}
}

func TestM73DeliveryEmptyAndNotFound(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	artifacts := deliveryArtifacts(t, ts.URL, "main")
	if len(artifacts) != 0 {
		t.Fatalf("空会话交付物应为空: %+v", artifacts)
	}
	if status, _ := httpGet(t, ts.URL+"/api/sessions/not-exist/artifacts"); status != http.StatusNotFound {
		t.Fatalf("unknown session artifacts = %d, want 404", status)
	}
	if status, _ := httpGet(t, ts.URL+"/api/artifacts/nope"); status != http.StatusNotFound {
		t.Fatalf("unknown artifact = %d, want 404", status)
	}
}
