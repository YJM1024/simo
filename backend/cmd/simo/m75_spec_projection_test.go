package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func specProjection(t *testing.T, baseURL, sessionID, query string) (int, map[string]any) {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/sessions/"+sessionID+"/spec-projection"+query)
	var payload map[string]any
	if len(body) > 0 {
		_ = json.Unmarshal(body, &payload)
	}
	return status, payload
}

func TestM75SpecProjectionEmptyDraft(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, projection := specProjection(t, ts.URL, "main", "")
	if status != http.StatusOK {
		t.Fatalf("spec projection = %d", status)
	}
	if projection["sessionId"] != "main" || projection["status"] != "draft" {
		t.Fatalf("empty projection = %+v", projection)
	}
	if _, ok := projection["revision"].(float64); !ok {
		t.Fatalf("revision 缺失: %+v", projection)
	}
	if projection["goal"] != nil {
		t.Fatalf("空 spec goal 应为 null: %+v", projection["goal"])
	}
	for _, key := range []string{"constraints", "inputs"} {
		if list, ok := projection[key].([]any); !ok || len(list) != 0 {
			t.Fatalf("%s 应为空数组: %+v", key, projection[key])
		}
	}
	tasks := projection["tasks"].(map[string]any)
	for _, group := range []string{"done", "running", "pending"} {
		value := tasks[group].(map[string]any)
		if value["total"].(float64) != 0 {
			t.Fatalf("空 spec tasks.%s.total != 0", group)
		}
	}
	if projection["deliverables"].(map[string]any)["total"].(float64) != 0 {
		t.Fatalf("空 spec deliverables != 0")
	}
	if projection["pendingConfirmations"].(map[string]any)["total"].(float64) != 0 {
		t.Fatalf("空 spec pendingConfirmations != 0")
	}
	links := projection["links"].(map[string]any)
	if links["fullSpec"] != "/sessions/main/spec" || !strings.Contains(links["self"].(string), "taskLimit=") {
		t.Fatalf("links = %+v", links)
	}
	if status, _ := specProjection(t, ts.URL, "not-exist", ""); status != http.StatusNotFound {
		t.Fatalf("unknown session = %d, want 404", status)
	}
	if status, _ := specProjection(t, ts.URL, "main", "?taskLimit=0"); status != http.StatusBadRequest {
		t.Fatalf("taskLimit=0 = %d, want 400", status)
	}
	if status, _ := specProjection(t, ts.URL, "main", "?taskLimit=51"); status != http.StatusBadRequest {
		t.Fatalf("taskLimit=51 = %d, want 400", status)
	}
}

func TestM75SpecProjectionWithData(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	now := time.Now().UnixMilli()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(context.Background(), `UPDATE specs SET status='verified', version=7,
			goal='完成右栏投影', constraints='["只改后端","不改前端"]', current='实现投影', plan='{}', updated_at=?
			WHERE session_id='main'`, now); err != nil {
			return err
		}
		tasks := []struct{ id, status string }{
			{"t-done-1", "done"}, {"t-done-2", "done"}, {"t-running", "running"}, {"t-queued", "queued"}, {"t-failed", "failed"},
		}
		for _, task := range tasks {
			if _, err := tx.ExecContext(context.Background(), `INSERT INTO tasks(
				id,session_id,title,kind,status,payload,created_at,updated_at)
				VALUES (?, 'main', ?, 'mock', ?, '{}', ?, ?)`, task.id, task.id, task.status, now, now); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id,task_id,name,rel_path,mime,size,created_at,delivery_kind)
			VALUES ('d1','session:main','用户报告.pdf','main/用户报告.pdf','application/pdf',100,?,'user_delivery')`, now); err != nil {
			return err
		}
		if _, err := tx.ExecContext(context.Background(), `INSERT INTO task_artifacts(
			id,task_id,name,rel_path,mime,size,created_at,delivery_kind)
			VALUES ('int1','t-done-1','report-attempt-1.md','t-done-1/report-attempt-1.md','text/markdown',100,?,'internal')`, now); err != nil {
			return err
		}
		_, err := tx.ExecContext(context.Background(), `INSERT INTO approvals(
			id,tool,args,status,created_at,session_id) VALUES ('appr1','make_pdf','{}','pending',?,'main')`, now)
		return err
	}); err != nil {
		t.Fatalf("seed projection data: %v", err)
	}
	status, projection := specProjection(t, ts.URL, "main", "?taskLimit=1")
	if status != http.StatusOK {
		t.Fatalf("projection = %d", status)
	}
	if projection["status"] != "completed" || projection["revision"].(float64) != 7 {
		t.Fatalf("status/revision = %+v", projection)
	}
	goal := projection["goal"].(map[string]any)
	if goal["text"] != "完成右栏投影" || goal["achieved"] != true {
		t.Fatalf("goal = %+v", goal)
	}
	if constraints := projection["constraints"].([]any); len(constraints) != 2 {
		t.Fatalf("constraints = %+v", constraints)
	}
	tasks := projection["tasks"].(map[string]any)
	done := tasks["done"].(map[string]any)
	if done["total"].(float64) != 2 || len(done["items"].([]any)) != 1 || done["hasMore"] != true {
		t.Fatalf("done group taskLimit=1 错误: %+v", done)
	}
	running := tasks["running"].(map[string]any)
	if running["total"].(float64) != 1 || len(running["items"].([]any)) != 1 {
		t.Fatalf("running group: %+v", running)
	}
	pending := tasks["pending"].(map[string]any)
	if pending["total"].(float64) != 2 {
		t.Fatalf("pending group: %+v", pending)
	}
	deliverables := projection["deliverables"].(map[string]any)
	items := deliverables["items"].([]any)
	if deliverables["total"].(float64) != 1 || len(items) != 1 {
		t.Fatalf("deliverables: %+v", deliverables)
	}
	item := items[0].(map[string]any)
	if item["name"] != "用户报告.pdf" || item["downloadRef"] != "artifact:d1" {
		t.Fatalf("deliverable item: %+v", item)
	}
	if strings.Contains(string(mustJSONBytes(projection)), "report-attempt-1.md") {
		t.Fatalf("内部产物泄漏: %s", mustJSONBytes(projection))
	}
	pendingConf := projection["pendingConfirmations"].(map[string]any)
	if pendingConf["total"].(float64) != 1 {
		t.Fatalf("pendingConfirmations: %+v", pendingConf)
	}
	// taskLimit 提高后仍返回同一 revision。
	status, projection3 := specProjection(t, ts.URL, "main", "?taskLimit=3")
	if status != http.StatusOK || projection3["revision"].(float64) != 7 {
		t.Fatalf("taskLimit=3 projection = %d %+v", status, projection3)
	}
	if len(projection3["tasks"].(map[string]any)["done"].(map[string]any)["items"].([]any)) != 2 {
		t.Fatalf("taskLimit=3 未返回更多 done 项")
	}
	// 归档会话只读状态。
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `UPDATE sessions SET archived=1 WHERE id='main'`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	_, archived := specProjection(t, ts.URL, "main", "")
	if archived["status"] != "archived" {
		t.Fatalf("archived projection status = %v", archived["status"])
	}
}
