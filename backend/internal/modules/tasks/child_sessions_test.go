package tasks

// PRD-TASK-005：子会话与任务归属。
// AC-TASK-005-01..04 的接口口径都在这一个文件里核对：
// 任务带出 childSessionIds/childSessionCount；父层列表不含子任务；
// 跨会话读写一律 404 task_not_found；归档父会话不改子任务。

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	coretask "simo/internal/core/task"
)

func seedSession(t *testing.T, env *convHTTPEnv, id, parentID, title string) {
	t.Helper()
	err := env.mod.store.Write(env.ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(env.ctx,
			`INSERT INTO sessions (id, parent_id, title, created_at, archived) VALUES (?, ?, ?, ?, 0)`,
			id, parentID, title, 1700000000000)
		return err
	})
	if err != nil {
		t.Fatalf("写入会话 %s 失败: %v", id, err)
	}
}

func taskOf(t *testing.T, env *convHTTPEnv, sessionID, taskID string) map[string]any {
	t.Helper()
	status, payload := env.json(t, http.MethodGet, "/api/tasks/"+taskID+"?sessionId="+sessionID, nil)
	if status != http.StatusOK {
		t.Fatalf("读任务 %s 应 200，got %d body=%v", taskID, status, payload)
	}
	return objValue(t, payload["task"], "task")
}

func childIDsOf(t *testing.T, task map[string]any) []string {
	t.Helper()
	raw, ok := task["childSessionIds"].([]any)
	if !ok {
		t.Fatalf("task.childSessionIds 应为数组: %v", task["childSessionIds"])
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		text, ok := item.(string)
		if !ok {
			t.Fatalf("childSessionIds 元素不是字符串: %v", item)
		}
		out = append(out, text)
	}
	return out
}

// AC-TASK-005-01/02：任务归它自己的会话，父层投影只带直接子会话的 id 与数量。
func TestTaskChildSessionProjection(t *testing.T) {
	env := newConvHTTPEnv(t)
	seedSession(t, env, "par", "", "父会话")
	seedSession(t, env, "kid", "par", "子会话")
	seedSession(t, env, "grand", "kid", "孙会话")

	parentCreated := env.create(t, "par", []map[string]any{{"title": "父任务"}})
	parentTaskID := taskIDOf(t, taskList(t, parentCreated)[0])
	childCreated := env.create(t, "kid", []map[string]any{{"title": "子任务"}})
	childTaskID := taskIDOf(t, taskList(t, childCreated)[0])

	parentTask := taskOf(t, env, "par", parentTaskID)
	if got := strValue(t, parentTask["sessionId"], "task.sessionId"); got != "par" {
		t.Fatalf("父任务 sessionId 应为 par，got %q", got)
	}
	if ids := childIDsOf(t, parentTask); len(ids) != 1 || ids[0] != "kid" {
		t.Fatalf("父任务 childSessionIds 应为 [kid]，got %v", ids)
	}
	if got := numValue(t, parentTask["childSessionCount"], "childSessionCount"); got != 1 {
		t.Fatalf("父任务 childSessionCount 应为 1，got %v", got)
	}

	// AC-TASK-005-01：子会话里的任务归属字段仍是子会话本身，且只带自己的下级（孙会话）。
	childTask := taskOf(t, env, "kid", childTaskID)
	if got := strValue(t, childTask["sessionId"], "task.sessionId"); got != "kid" {
		t.Fatalf("子任务 sessionId 应为 kid，got %q", got)
	}
	if ids := childIDsOf(t, childTask); len(ids) != 1 || ids[0] != "grand" {
		t.Fatalf("子任务 childSessionIds 应为 [grand]，got %v", ids)
	}

	// 会话内详情同口径。
	status, payload := env.json(t, http.MethodGet, "/api/sessions/par/tasks/"+parentTaskID, nil)
	if status != http.StatusOK {
		t.Fatalf("会话内详情应 200，got %d body=%v", status, payload)
	}
	if ids := childIDsOf(t, objValue(t, payload["task"], "task")); len(ids) != 1 || ids[0] != "kid" {
		t.Fatalf("会话内详情的 childSessionIds 应为 [kid]，got %v", ids)
	}
}

// AC-TASK-005-02/03：父层任务列表不混入子任务，响应正文里没有子任务的 id 与标题。
func TestTaskListKeepsChildTasksOutOfParent(t *testing.T) {
	env := newConvHTTPEnv(t)
	seedSession(t, env, "par", "", "父会话")
	seedSession(t, env, "kid", "par", "子会话")

	parentCreated := env.create(t, "par", []map[string]any{{"title": "父任务标题"}})
	parentTaskID := taskIDOf(t, taskList(t, parentCreated)[0])
	childCreated := env.create(t, "kid", []map[string]any{{"title": "子任务标题"}})
	childTaskID := taskIDOf(t, taskList(t, childCreated)[0])

	status, body := env.request(t, http.MethodGet, "/api/tasks?sessionId=par", nil)
	if status != http.StatusOK {
		t.Fatalf("父层列表应 200，got %d body=%s", status, body)
	}
	text := string(body)
	if strings.Contains(text, childTaskID) || strings.Contains(text, "子任务标题") {
		t.Fatalf("父层列表混入了子任务: %s", text)
	}
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("父层列表不是 JSON: %v", err)
	}
	items := taskList(t, payload)
	if len(items) != 1 || taskIDOf(t, items[0]) != parentTaskID {
		t.Fatalf("父层列表应只有父任务，got %v", items)
	}
	if got := numValue(t, objValue(t, payload["counts"], "counts")["all"], "counts.all"); got != 1 {
		t.Fatalf("父层 counts.all 应为 1（不含子任务），got %v", got)
	}

	// 子会话自己的列表照常只有它自己的任务。
	status, payload = env.json(t, http.MethodGet, "/api/tasks?sessionId=kid", nil)
	if status != http.StatusOK {
		t.Fatalf("子会话列表应 200，got %d", status)
	}
	if items := taskList(t, payload); len(items) != 1 || taskIDOf(t, items[0]) != childTaskID {
		t.Fatalf("子会话列表应只有子任务，got %v", items)
	}

	// 父会话的另一个聚合入口（交付物）也不应出现子任务痕迹。
	status, body = env.request(t, http.MethodGet, "/api/sessions/par/artifacts", nil)
	if status != http.StatusOK {
		t.Fatalf("父会话交付物应 200，got %d body=%s", status, body)
	}
	if strings.Contains(string(body), childTaskID) {
		t.Fatalf("父会话交付物混入子任务 id: %s", string(body))
	}
}

// AC-TASK-005-03：跨会话读写在所有入口一律 404 task_not_found，且任务状态不被改动。
func TestTaskCrossSessionAccessIsNotFound(t *testing.T) {
	env := newConvHTTPEnv(t)
	seedSession(t, env, "par", "", "父会话")
	seedSession(t, env, "kid", "par", "子会话")
	created := env.create(t, "kid", []map[string]any{{"title": "子任务"}})
	taskID := taskIDOf(t, taskList(t, created)[0])

	cases := []struct{ method, path string }{
		{http.MethodGet, "/api/tasks/" + taskID + "?sessionId=par"},
		{http.MethodGet, "/api/sessions/par/tasks/" + taskID},
		{http.MethodPost, "/api/tasks/" + taskID + "/cancel?sessionId=par"},
		{http.MethodPost, "/api/tasks/" + taskID + "/retry?sessionId=par"},
		{http.MethodPost, "/api/sessions/par/tasks/" + taskID + "/cancel"},
		{http.MethodPost, "/api/sessions/par/tasks/" + taskID + "/retry"},
		{http.MethodPost, "/api/sessions/par/tasks/" + taskID + "/resume"},
	}
	for _, item := range cases {
		status, body := env.request(t, item.method, item.path, nil)
		if status != http.StatusNotFound {
			t.Fatalf("%s %s 应 404，got %d body=%s", item.method, item.path, status, body)
		}
		if !strings.Contains(string(body), "task_not_found") {
			t.Fatalf("%s %s 错误码应为 task_not_found，body=%s", item.method, item.path, body)
		}
	}

	// 负用例不改数据：任务仍属子会话、状态仍是 pending、标题原样。
	childTask := taskOf(t, env, "kid", taskID)
	if got := strValue(t, childTask["sessionId"], "sessionId"); got != "kid" {
		t.Fatalf("跨会话请求后 sessionId 变为 %q", got)
	}
	if got := strValue(t, childTask["status"], "status"); got != "pending" {
		t.Fatalf("跨会话请求后状态变为 %q", got)
	}
	if got := strValue(t, childTask["title"], "title"); got != "子任务" {
		t.Fatalf("跨会话请求后标题变为 %q", got)
	}

	// 同会话入口仍然可用：取消成功后状态才变。
	status, payload := env.json(t, http.MethodPost, "/api/tasks/"+taskID+"/cancel?sessionId=kid", nil)
	if status != http.StatusOK {
		t.Fatalf("同会话取消应 200，got %d body=%v", status, payload)
	}
	if got := strValue(t, taskOf(t, env, "kid", taskID)["status"], "status"); got != "cancelled" {
		t.Fatalf("取消后状态应为 cancelled，got %q", got)
	}
}

// AC-TASK-005-04：归档父会话不改子任务状态，子任务保留可查。
func TestTaskChildSurvivesParentArchive(t *testing.T) {
	env := newConvHTTPEnv(t)
	seedSession(t, env, "par", "", "父会话")
	seedSession(t, env, "kid", "par", "子会话")
	created := env.create(t, "kid", []map[string]any{{"title": "归档前子任务", "steps": []string{"第一步", "第二步"}}})
	taskID := taskIDOf(t, taskList(t, created)[0])
	// 让任务处于有区分度的状态：第一步 done、第二步 running，任务本身 running。
	env.updateStep(t, taskID, 1, func(step *ConvStep) { step.Status = "done" })
	env.updateStep(t, taskID, 2, func(step *ConvStep) { step.Status = "running" })
	env.updateTask(t, taskID, func(task *coretask.Task) { task.Status = coretask.StatusRunning })
	before := taskOf(t, env, "kid", taskID)

	if err := env.mod.store.Write(env.ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(env.ctx, `UPDATE sessions SET archived = 1 WHERE id = ?`, "par")
		return err
	}); err != nil {
		t.Fatalf("归档父会话失败: %v", err)
	}

	after := taskOf(t, env, "kid", taskID)
	for _, key := range []string{"id", "sessionId", "status", "title"} {
		if strValue(t, before[key], key) != strValue(t, after[key], key) {
			t.Fatalf("归档父会话后 %s 变了: %v -> %v", key, before[key], after[key])
		}
	}
	if after["progress"] != before["progress"] {
		t.Fatalf("归档父会话后进度变了: %v -> %v", before["progress"], after["progress"])
	}
	// 子任务在子会话列表里仍然出现，归档只影响父会话本身。
	_, payload := env.json(t, http.MethodGet, "/api/tasks?sessionId=kid", nil)
	if items := taskList(t, payload); len(items) != 1 || taskIDOf(t, items[0]) != taskID {
		t.Fatalf("归档父会话后子任务列表应仍有 1 条，got %v", items)
	}
}
