package main

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestM83TaskWorkspaceDirsAndInternalReport(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "帮我整理一份本周周报，输出成文档。"); status != http.StatusAccepted {
		t.Fatalf("task chat = %d", status)
	}
	waitTaskDone(t, ts.URL, "main")
	tasks := listTasks(t, ts.URL)
	if len(tasks) == 0 {
		t.Fatalf("未创建任务")
	}
	taskID, _ := tasks[0]["id"].(string)
	base := filepath.Join(a.sandbox.Workspace, "main", "tasks", taskID)
	for _, area := range []string{"code", "data", "output", "_internal"} {
		if info, err := os.Stat(filepath.Join(base, area)); err != nil || !info.IsDir() {
			t.Fatalf("任务目录 %s 缺失: %v", area, err)
		}
	}
	reportPath := filepath.Join(base, "_internal", "report-attempt-1.md")
	if _, err := os.Stat(reportPath); err != nil {
		t.Fatalf("内部 report 未落在 _internal: %v", err)
	}
	var scope, kind, workspaceRel string
	if err := a.db.QueryRow(context.Background(), `SELECT storage_scope, delivery_kind, workspace_rel_path
		FROM task_artifacts WHERE task_id=? AND name='report-attempt-1.md'`, taskID).
		Scan(&scope, &kind, &workspaceRel); err != nil {
		t.Fatal(err)
	}
	if scope != "workspace" || kind != "internal" || !strings.Contains(workspaceRel, "/_internal/") {
		t.Fatalf("内部 report 分类错误: scope=%s kind=%s rel=%s", scope, kind, workspaceRel)
	}
	status, body := httpGet(t, ts.URL+"/api/deliverables")
	if status != http.StatusOK || strings.Contains(string(body), "report-attempt-1.md") {
		t.Fatalf("内部 report 进入用户交付物: %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/sessions/main/artifacts")
	if status != http.StatusOK || strings.Contains(string(body), "report-attempt-1.md") {
		t.Fatalf("内部 report 进入会话交付物: %d %s", status, body)
	}
	// 旧文件页仍可打开内部 report（source=files），但交付物接口不返回。
	var artifactID string
	if err := a.db.QueryRow(context.Background(), `SELECT id FROM task_artifacts WHERE task_id=? AND name='report-attempt-1.md'`, taskID).Scan(&artifactID); err != nil {
		t.Fatal(err)
	}
	if status, _ := httpGet(t, ts.URL+"/api/artifacts/"+artifactID+"/content?source=files"); status != http.StatusOK {
		t.Fatalf("file tab 内部 report preview = %d", status)
	}
}
