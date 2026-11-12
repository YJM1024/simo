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

func TestM82WorkspaceOutputDeliverables(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	outputPath := filepath.Join(a.sandbox.Workspace, "main", "output", "out.md")
	internalPath := filepath.Join(a.sandbox.Workspace, "main", "tasks", "t1", "_internal", "report.md")
	workPath := filepath.Join(a.sandbox.Workspace, "work", "main", "scratch.md")
	for path, content := range map[string]string{outputPath: "deliverable", internalPath: "internal", workPath: "work"} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		items := []struct {
			id, taskID, name, rel, scope, workspaceRel, kind string
		}{
			{"out-1", "session:main", "out.md", "", "workspace", "main/output/out.md", "user_delivery"},
			{"internal-1", "task-1", "report.md", "", "workspace", "main/tasks/t1/_internal/report.md", "internal"},
			{"work-1", "session:main", "scratch.md", "", "workspace", "work/main/scratch.md", "user_delivery"},
		}
		for _, item := range items {
			if _, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
				id,task_id,name,rel_path,mime,size,created_at,delivery_kind,storage_scope,workspace_rel_path)
				VALUES (?,?,?,?, 'text/markdown', 10, ?, ?, ?, ?)`,
				item.id, item.taskID, item.name, item.rel, now, item.kind, item.scope, item.workspaceRel); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	status, body := httpGet(t, ts.URL+"/api/sessions/main/artifacts")
	if status != http.StatusOK {
		t.Fatalf("session artifacts = %d %s", status, body)
	}
	var payload struct {
		Artifacts []map[string]any `json:"artifacts"`
	}
	_ = json.Unmarshal(body, &payload)
	if len(payload.Artifacts) != 1 || payload.Artifacts[0]["id"] != "out-1" {
		t.Fatalf("session deliverables 混入内部/work 文件: %+v", payload.Artifacts)
	}
	if !strings.Contains(string(body), "/api/artifacts/out-1/content") {
		t.Fatalf("previewUrl 缺失: %s", body)
	}
	if status, _ := httpGet(t, ts.URL+"/api/artifacts/internal-1/content"); status != http.StatusNotFound {
		t.Fatalf("internal content = %d, want 404", status)
	}
	if status, _ := httpGet(t, ts.URL+"/api/artifacts/work-1/content"); status != http.StatusNotFound {
		t.Fatalf("work content = %d, want 404", status)
	}
	if status, content := httpGet(t, ts.URL+"/api/artifacts/out-1/content"); status != http.StatusOK || string(content) != "deliverable" {
		t.Fatalf("output content = %d %s", status, content)
	}
	status, body = httpGet(t, ts.URL+"/api/deliverables")
	if status != http.StatusOK || !strings.Contains(string(body), `"id":"out-1"`) ||
		strings.Contains(string(body), "internal-1") || strings.Contains(string(body), "work-1") {
		t.Fatalf("user deliverables 过滤错误: %d %s", status, body)
	}
}
