package tasks

// 会话内任务接口（N1–N9）的 HTTP 层测试：真 httptest + 临时 sqlite，只经 HTTP 驱动业务。
// 断言口径以 specs/backend/P1-CONV/spec.md §17.4 与 §17.10 为准。

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	coretask "simo/internal/core/task"
)

type convHTTPEnv struct {
	mod    *Module
	srv    *httptest.Server
	logger *eventlog.Logger
	ctx    context.Context
}

func newConvHTTPEnv(t *testing.T) *convHTTPEnv {
	t.Helper()
	mod, logger, ctx := newConvTestModule(t)
	mux := http.NewServeMux()
	mod.Register(mux)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &convHTTPEnv{mod: mod, srv: srv, logger: logger, ctx: ctx}
}

func (e *convHTTPEnv) request(t *testing.T, method, path string, body any) (int, []byte) {
	t.Helper()
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("序列化请求体失败: %v", err)
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequest(method, e.srv.URL+path, reader)
	if err != nil {
		t.Fatalf("构造请求失败: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := e.srv.Client().Do(req)
	if err != nil {
		t.Fatalf("%s %s 请求失败: %v", method, path, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("读取响应失败: %v", err)
	}
	return resp.StatusCode, data
}

func (e *convHTTPEnv) json(t *testing.T, method, path string, body any) (int, map[string]any) {
	t.Helper()
	status, data := e.request(t, method, path, body)
	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		t.Fatalf("%s %s 响应不是 JSON 对象: %v body=%s", method, path, err, data)
	}
	return status, payload
}

func (e *convHTTPEnv) create(t *testing.T, sessionID string, tasks []map[string]any) map[string]any {
	t.Helper()
	status, payload := e.json(t, http.MethodPost, "/api/sessions/"+sessionID+"/tasks",
		map[string]any{"tasks": tasks})
	if status != http.StatusCreated {
		t.Fatalf("创建任务应 201，got %d body=%v", status, payload)
	}
	if ok, _ := payload["ok"].(bool); !ok {
		t.Fatalf("创建响应 ok 应为 true: %v", payload)
	}
	return payload
}

// updateTask / updateStep 直接把库里的状态摆到用例需要的形态，再走 HTTP 验证接口。
func (e *convHTTPEnv) updateTask(t *testing.T, taskID string, mutate func(*coretask.Task)) {
	t.Helper()
	task, err := e.mod.getTask(e.ctx, taskID)
	if err != nil {
		t.Fatalf("读任务 %s 失败: %v", taskID, err)
	}
	mutate(&task)
	if err := e.mod.saveTask(e.ctx, task); err != nil {
		t.Fatalf("写任务 %s 失败: %v", taskID, err)
	}
}

func (e *convHTTPEnv) updateStep(t *testing.T, taskID string, seq int, mutate func(*ConvStep)) {
	t.Helper()
	steps, err := e.mod.loadSteps(e.ctx, taskID)
	if err != nil {
		t.Fatalf("读步骤失败: %v", err)
	}
	if seq < 1 || seq > len(steps) {
		t.Fatalf("步骤序号越界: %d/%d", seq, len(steps))
	}
	mutate(&steps[seq-1])
	if err := e.mod.saveSteps(e.ctx, taskID, steps); err != nil {
		t.Fatalf("写步骤失败: %v", err)
	}
}

// ---- JSON 断言辅助 ----

func objValue(t *testing.T, value any, what string) map[string]any {
	t.Helper()
	object, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("%s 不是对象: %v", what, value)
	}
	return object
}

func arrValue(t *testing.T, value any, what string) []any {
	t.Helper()
	items, ok := value.([]any)
	if !ok {
		t.Fatalf("%s 不是数组: %v", what, value)
	}
	return items
}

func numValue(t *testing.T, value any, what string) float64 {
	t.Helper()
	number, ok := value.(float64)
	if !ok {
		t.Fatalf("%s 不是数字: %v", what, value)
	}
	return number
}

func strValue(t *testing.T, value any, what string) string {
	t.Helper()
	text, ok := value.(string)
	if !ok {
		t.Fatalf("%s 不是字符串: %v", what, value)
	}
	return text
}

func boolValue(t *testing.T, value any, what string) bool {
	t.Helper()
	boolean, ok := value.(bool)
	if !ok {
		t.Fatalf("%s 不是布尔值: %v", what, value)
	}
	return boolean
}

func taskList(t *testing.T, payload map[string]any) []map[string]any {
	t.Helper()
	raw, ok := payload["tasks"].([]any)
	if !ok {
		t.Fatalf("响应缺 tasks 数组: %v", payload)
	}
	out := make([]map[string]any, 0, len(raw))
	for _, item := range raw {
		out = append(out, objValue(t, item, "tasks[]"))
	}
	return out
}

func taskIDOf(t *testing.T, task map[string]any) string {
	t.Helper()
	return strValue(t, task["id"], "task.id")
}

// ---- N1 创建 ----

func TestConvHTTPCreateSingleBatchAndCard(t *testing.T) {
	env := newConvHTTPEnv(t)

	single := env.create(t, "s1", []map[string]any{{"title": "单任务"}})
	batchID := strValue(t, single["batchId"], "batchId")
	if !regexp.MustCompile(`^batch-[0-9a-f]{16}$`).MatchString(batchID) {
		t.Fatalf("batchId 格式不对: %q", batchID)
	}
	if got := len(taskList(t, single)); got != 1 {
		t.Fatalf("单任务创建应返回 1 条，got %d", got)
	}
	if strValue(t, single["messageId"], "messageId") == "" {
		t.Fatal("单任务创建应返回 messageId")
	}
	if boolValue(t, single["idempotent"], "idempotent") {
		t.Fatal("首次创建 idempotent 应为 false")
	}
	if all := numValue(t, objValue(t, single["counts"], "counts")["all"], "counts.all"); all != 1 {
		t.Fatalf("单任务后 counts.all 应为 1，got %v", all)
	}

	items := make([]map[string]any, 0, 10)
	for i := 0; i < 10; i++ {
		items = append(items, map[string]any{
			"key": fmt.Sprintf("t%d", i+1), "title": fmt.Sprintf("批量任务 %d", i+1),
		})
	}
	batch := env.create(t, "s1", items)
	batchTasks := taskList(t, batch)
	if len(batchTasks) != 10 {
		t.Fatalf("批量 10 条应返回 10 条，got %d", len(batchTasks))
	}
	batchID2 := strValue(t, batch["batchId"], "batchId")
	if batchID2 == batchID {
		t.Fatal("两次创建应生成不同 batchId")
	}
	if got := strValue(t, batchTasks[0]["batchId"], "tasks[0].batchId"); got != batchID2 {
		t.Fatalf("任务 batchId 应等于响应 batchId，got %q", got)
	}
	firstID := taskIDOf(t, batchTasks[0])

	// 批量只落 1 条汇总卡：role=agent、category=task、task_id=首任务、batch_id=本批。
	var cardCount int
	if err := env.mod.store.QueryRow(env.ctx, `SELECT COUNT(*) FROM messages WHERE batch_id = ?`, batchID2).Scan(&cardCount); err != nil {
		t.Fatalf("查汇总卡数量失败: %v", err)
	}
	if cardCount != 1 {
		t.Fatalf("批量创建应只落 1 条汇总卡，got %d", cardCount)
	}
	var role, category, cardTaskID, cardBatchID string
	if err := env.mod.store.QueryRow(env.ctx,
		`SELECT role, category, task_id, batch_id FROM messages WHERE batch_id = ?`, batchID2).
		Scan(&role, &category, &cardTaskID, &cardBatchID); err != nil {
		t.Fatalf("读汇总卡失败: %v", err)
	}
	if role != "agent" || category != "task" || cardTaskID != firstID || cardBatchID != batchID2 {
		t.Fatalf("汇总卡字段不对: role=%q category=%q taskId=%q batchId=%q",
			role, category, cardTaskID, cardBatchID)
	}

	// 13 条越界：400 task_batch_too_large，且失败批次不落 batch 行。
	tooMany := make([]map[string]any, 13)
	for i := range tooMany {
		tooMany[i] = map[string]any{"title": fmt.Sprintf("超限 %d", i)}
	}
	status, payload := env.json(t, http.MethodPost, "/api/sessions/s1/tasks", map[string]any{"tasks": tooMany})
	if status != http.StatusBadRequest {
		t.Fatalf("13 条应 400，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_batch_too_large" {
		t.Fatalf("错误码应为 task_batch_too_large，got %q", code)
	}
	var batchRows int
	if err := env.mod.store.QueryRow(env.ctx,
		`SELECT COUNT(*) FROM task_batches WHERE session_id = ?`, "s1").Scan(&batchRows); err != nil {
		t.Fatalf("查批次数量失败: %v", err)
	}
	if batchRows != 2 {
		t.Fatalf("越界批次不应落库，task_batches 应为 2，got %d", batchRows)
	}
}

// ---- N2 列表 ----

func TestConvHTTPListFiltersAndCounts(t *testing.T) {
	env := newConvHTTPEnv(t)
	first := env.create(t, "s1", []map[string]any{
		{"key": "a1", "title": "A1"},
		{"key": "a2", "title": "A2"},
		{"key": "a3", "title": "A3"},
	})
	batchA := strValue(t, first["batchId"], "batchId")
	env.create(t, "s1", []map[string]any{
		{"key": "b1", "title": "B1"},
		{"key": "b2", "title": "B2"},
	})
	env.create(t, "s2", []map[string]any{{"title": "别的会话"}})

	status, payload := env.json(t, http.MethodGet, "/api/sessions/s1/tasks", nil)
	if status != http.StatusOK {
		t.Fatalf("列表应 200，got %d body=%v", status, payload)
	}
	tasks := taskList(t, payload)
	if len(tasks) != 5 {
		t.Fatalf("s1 应只有本会话 5 条任务，got %d", len(tasks))
	}
	for _, task := range tasks {
		if got := strValue(t, task["sessionId"], "sessionId"); got != "s1" {
			t.Fatalf("列表混入其它会话任务: %q", got)
		}
	}
	counts := objValue(t, payload["counts"], "counts")
	all := numValue(t, counts["all"], "counts.all")
	if all != 5 {
		t.Fatalf("counts.all 应为 5，got %v", all)
	}
	sum := 0.0
	for _, key := range []string{"pending", "running", "failed", "done"} {
		sum += numValue(t, counts[key], "counts."+key)
	}
	if sum != all {
		t.Fatalf("counts 分项之和应等于 all: %v vs %v", sum, all)
	}
	if numValue(t, payload["total"], "total") != 5 {
		t.Fatalf("total 应为 5，got %v", payload["total"])
	}
	if boolValue(t, payload["hasMore"], "hasMore") {
		t.Fatal("全部返回时 hasMore 应为 false")
	}

	status, filtered := env.json(t, http.MethodGet, "/api/sessions/s1/tasks?batchId="+batchA, nil)
	if status != http.StatusOK {
		t.Fatalf("批次筛选应 200，got %d", status)
	}
	batchTasks := taskList(t, filtered)
	if len(batchTasks) != 3 {
		t.Fatalf("batchId 过滤应返回 3 条，got %d", len(batchTasks))
	}
	for _, task := range batchTasks {
		if got := strValue(t, task["batchId"], "batchId"); got != batchA {
			t.Fatalf("过滤结果混入其它批次: %q", got)
		}
	}
	if got := numValue(t, objValue(t, filtered["counts"], "counts")["all"], "counts.all"); got != 5 {
		t.Fatalf("counts 应按整个会话统计，got all=%v", got)
	}

	status, page := env.json(t, http.MethodGet, "/api/sessions/s1/tasks?limit=2", nil)
	if status != http.StatusOK {
		t.Fatalf("分页应 200，got %d", status)
	}
	if got := len(taskList(t, page)); got != 2 {
		t.Fatalf("limit=2 应返回 2 条，got %d", got)
	}
	if !boolValue(t, page["hasMore"], "hasMore") {
		t.Fatal("5 条任务 limit=2 时 hasMore 应为 true")
	}
	if strValue(t, page["nextBefore"], "nextBefore") == "" {
		t.Fatal("hasMore 时应返回 nextBefore 游标")
	}

	for _, limit := range []string{"0", "101", "abc"} {
		status, payload := env.json(t, http.MethodGet, "/api/sessions/s1/tasks?limit="+limit, nil)
		if status != http.StatusBadRequest {
			t.Fatalf("limit=%s 应 400，got %d", limit, status)
		}
		if code := strValue(t, payload["code"], "code"); code != "invalid_task_limit" {
			t.Fatalf("limit=%s 错误码应为 invalid_task_limit，got %q", limit, code)
		}
	}
}

// ---- N3 详情 ----

func TestConvHTTPDetailAndCrossSession404(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "s1", []map[string]any{{
		"title": "机密任务-XYZ", "goal": "机密目标-XYZ",
		"inputs": []string{"输入甲"}, "constraints": []string{"约束甲"},
		"steps": []string{"第一步", "第二步"},
	}})
	taskID := taskIDOf(t, taskList(t, created)[0])

	status, payload := env.json(t, http.MethodGet, "/api/sessions/s1/tasks/"+taskID, nil)
	if status != http.StatusOK {
		t.Fatalf("详情应 200，got %d body=%v", status, payload)
	}
	task := objValue(t, payload["task"], "task")
	if got := taskIDOf(t, task); got != taskID {
		t.Fatalf("详情任务 id 不对: %q", got)
	}
	steps := arrValue(t, payload["steps"], "steps")
	if len(steps) != 2 {
		t.Fatalf("详情应带 2 个步骤，got %d", len(steps))
	}
	currentStepID := strValue(t, payload["currentStepId"], "currentStepId")
	if currentStepID == "" || currentStepID != strValue(t, objValue(t, steps[0], "steps[0]")["id"], "steps[0].id") {
		t.Fatalf("currentStepId 应取第一个 pending 步骤，got %q", currentStepID)
	}
	if traces := arrValue(t, payload["traces"], "traces"); len(traces) != 0 {
		t.Fatalf("新任务不应有轨迹，got %d", len(traces))
	}
	if boolValue(t, payload["tracesHasMore"], "tracesHasMore") {
		t.Fatal("新任务 tracesHasMore 应为 false")
	}
	if files := arrValue(t, payload["deliverables"], "deliverables"); len(files) != 0 {
		t.Fatalf("新任务不应有交付物，got %d", len(files))
	}
	contextPayload := objValue(t, payload["context"], "context")
	if got := numValue(t, contextPayload["historyCount"], "context.historyCount"); got != 0 {
		t.Fatalf("context.historyCount 恒为 0，got %v", got)
	}
	if got := strValue(t, contextPayload["goal"], "context.goal"); got != "机密目标-XYZ" {
		t.Fatalf("context.goal 不对: %q", got)
	}
	budget := objValue(t, payload["budget"], "budget")
	if numValue(t, budget["maxSteps"], "budget.maxSteps") != 8 ||
		numValue(t, budget["maxTokens"], "budget.maxTokens") != 12000 ||
		numValue(t, budget["usedSteps"], "budget.usedSteps") != 0 ||
		numValue(t, budget["usedTokens"], "budget.usedTokens") != 0 {
		t.Fatalf("budget 缺省值不对: %v", budget)
	}

	status, payload = env.json(t, http.MethodGet, "/api/sessions/s1/tasks/task-missing", nil)
	if status != http.StatusNotFound {
		t.Fatalf("不存在任务应 404，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_not_found" {
		t.Fatalf("错误码应为 task_not_found，got %q", code)
	}

	// 跨会话：404，且响应体不得含标题、目标、步骤等正文。
	status, raw := env.request(t, http.MethodGet, "/api/sessions/s2/tasks/"+taskID, nil)
	if status != http.StatusNotFound {
		t.Fatalf("跨会话应 404，got %d body=%s", status, raw)
	}
	body := string(raw)
	for _, secret := range []string{"机密任务-XYZ", "机密目标-XYZ", "第一步", "第二步"} {
		if strings.Contains(body, secret) {
			t.Fatalf("跨会话 404 泄露任务正文 %q: %s", secret, body)
		}
	}
	if strings.Contains(body, "无权限") {
		t.Fatalf("跨会话不得提示无权限: %s", body)
	}
	var cross map[string]any
	if err := json.Unmarshal(raw, &cross); err != nil {
		t.Fatalf("跨会话响应不是 JSON: %v", err)
	}
	if code := strValue(t, cross["code"], "code"); code != "task_not_found" {
		t.Fatalf("跨会话错误码应为 task_not_found，got %q", code)
	}
	if _, hasTask := cross["task"]; hasTask {
		t.Fatalf("跨会话 404 不应带 task 正文: %s", body)
	}
}

// ---- N4 取消 ----

func TestConvHTTPCancelSelfKeepsDownstreamPending(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "s1", []map[string]any{
		{"key": "a", "title": "链首"},
		{"key": "b", "title": "链中", "dependsOn": []string{"a"}},
		{"key": "c", "title": "链尾", "dependsOn": []string{"b"}},
	})
	tasks := taskList(t, created)
	aID, bID, cID := taskIDOf(t, tasks[0]), taskIDOf(t, tasks[1]), taskIDOf(t, tasks[2])

	// 缺省 scope=self（AC-CONV-009-15 的判定通道）：只取消目标任务，下游保持依赖等待。
	status, payload := env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+aID+"/cancel", nil)
	if status != http.StatusOK {
		t.Fatalf("取消应 200，got %d body=%v", status, payload)
	}
	if !boolValue(t, payload["changed"], "changed") {
		t.Fatal("取消未开始任务应 changed=true")
	}
	cancelled := arrValue(t, payload["cancelled"], "cancelled")
	if len(cancelled) != 1 || strValue(t, cancelled[0], "cancelled[0]") != aID {
		t.Fatalf("cancelled 应只含目标任务，got %v", cancelled)
	}
	if got := strValue(t, objValue(t, payload["task"], "task")["status"], "task.status"); got != "cancelled" {
		t.Fatalf("目标任务应为 cancelled，got %q", got)
	}

	// 下游任务保持 pending 并继续等待依赖，不写 blocked、不启动。
	for _, id := range []string{bID, cID} {
		status, detail := env.json(t, http.MethodGet, "/api/sessions/s1/tasks/"+id, nil)
		if status != http.StatusOK {
			t.Fatalf("读下游任务应 200，got %d", status)
		}
		downstream := objValue(t, detail["task"], "task")
		if got := strValue(t, downstream["status"], "status"); got != "pending" {
			t.Fatalf("取消上游后下游应保持 pending，got %q（任务 %s）", got, id)
		}
		if got := strValue(t, downstream["waitingReason"], "waitingReason"); got != "dependency" {
			t.Fatalf("下游应继续等待依赖，got %q（任务 %s）", got, id)
		}
	}

	// 终态再取消：spec §17.4 明确返回 200、changed=false，任务字段不变。
	status, again := env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+aID+"/cancel", nil)
	if status != http.StatusOK {
		t.Fatalf("终态再取消应 200，got %d body=%v", status, again)
	}
	if boolValue(t, again["changed"], "changed") {
		t.Fatal("终态再取消 changed 应为 false")
	}
	if got := len(arrValue(t, again["cancelled"], "cancelled")); got != 0 {
		t.Fatalf("终态再取消 cancelled 应为空，got %d", got)
	}
	if got := strValue(t, objValue(t, again["task"], "task")["status"], "task.status"); got != "cancelled" {
		t.Fatalf("终态再取消不应改变状态，got %q", got)
	}

	// 已完成任务同样是终态：200 changed=false。
	env.updateTask(t, cID, func(task *coretask.Task) { task.Status = coretask.StatusDone })
	status, doneCancel := env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+cID+"/cancel", nil)
	if status != http.StatusOK {
		t.Fatalf("已完成任务取消应 200，got %d body=%v", status, doneCancel)
	}
	if boolValue(t, doneCancel["changed"], "changed") {
		t.Fatal("已完成任务取消 changed 应为 false")
	}
	if got := strValue(t, objValue(t, doneCancel["task"], "task")["status"], "task.status"); got != "done" {
		t.Fatalf("已完成任务取消不应改状态，got %q", got)
	}
}

// ---- N5 重试 ----

func TestConvHTTPRetryConflictsAndNewAttempt(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "s1", []map[string]any{{"title": "重试任务", "steps": []string{"第一步", "第二步"}}})
	taskID := taskIDOf(t, taskList(t, created)[0])

	env.updateTask(t, taskID, func(task *coretask.Task) { task.Status = coretask.StatusRunning })
	status, payload := env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/retry", nil)
	if status != http.StatusConflict {
		t.Fatalf("运行中重试应 409，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_state_conflict" {
		t.Fatalf("错误码应为 task_state_conflict，got %q", code)
	}
	if got := strValue(t, payload["currentStatus"], "currentStatus"); got != "running" {
		t.Fatalf("409 应带 currentStatus=running，got %q", got)
	}

	env.updateTask(t, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusFailed
		task.Attempt = 1
		task.FailReason = "执行失败"
	})
	env.updateStep(t, taskID, 1, func(step *ConvStep) {
		step.Status = "failed"
		step.FailReason = "执行失败"
	})

	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/retry", nil)
	if status != http.StatusOK {
		t.Fatalf("失败任务重试应 200，got %d body=%v", status, payload)
	}
	if got := numValue(t, payload["attempt"], "attempt"); got != 2 {
		t.Fatalf("重试后 attempt 应为 2，got %v", got)
	}
	retried := objValue(t, payload["task"], "task")
	if got := numValue(t, retried["attempt"], "task.attempt"); got != 2 {
		t.Fatalf("重试后 task.attempt 应为 2，got %v", got)
	}
	if got := strValue(t, retried["status"], "task.status"); got != "queued" {
		t.Fatalf("重试后任务应为 queued，got %q", got)
	}
	if got := numValue(t, payload["resetStepCount"], "resetStepCount"); got < 1 {
		t.Fatalf("resetStepCount 应至少 1，got %v", got)
	}
	steps, err := env.mod.loadSteps(env.ctx, taskID)
	if err != nil {
		t.Fatalf("读步骤失败: %v", err)
	}
	for _, step := range steps {
		if step.Status != "pending" {
			t.Fatalf("重试后步骤应全部 pending，got %q", step.Status)
		}
	}
}

// ---- N6 / N7 确认与恢复 ----

func TestConvHTTPConfirmationAndResumeStateGuard(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "s1", []map[string]any{{"title": "待确认", "steps": []string{"第一步"}}})
	taskID := taskIDOf(t, taskList(t, created)[0])

	status, payload := env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/confirmation",
		map[string]any{"decision": "confirm"})
	if status != http.StatusConflict {
		t.Fatalf("非等待状态确认应 409，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_state_conflict" {
		t.Fatalf("错误码应为 task_state_conflict，got %q", code)
	}

	now := time.Now().UnixMilli()
	env.updateTask(t, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingConfirmation
		task.WaitingSince = now
	})
	env.updateStep(t, taskID, 1, func(step *ConvStep) {
		step.Status = "running"
		step.StartedAt = now
	})
	steps, err := env.mod.loadSteps(env.ctx, taskID)
	if err != nil {
		t.Fatalf("读步骤失败: %v", err)
	}
	stepID := steps[0].ID

	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/confirmation",
		map[string]any{"decision": "confirm"})
	if status != http.StatusOK {
		t.Fatalf("等待确认时确认应 200，got %d body=%v", status, payload)
	}
	if got := strValue(t, payload["decision"], "decision"); got != "confirm" {
		t.Fatalf("decision 应回显 confirm，got %q", got)
	}
	if got := strValue(t, payload["stepId"], "stepId"); got != stepID {
		t.Fatalf("stepId 应为当前步骤 %q，got %q", stepID, got)
	}
	confirmed := objValue(t, payload["task"], "task")
	if got := strValue(t, confirmed["status"], "task.status"); got != "running" {
		t.Fatalf("确认后任务应为 running，got %q", got)
	}
	if reason, _ := confirmed["waitingReason"].(string); reason != "" {
		t.Fatalf("确认后应清空 waitingReason，got %q", reason)
	}

	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/resume", nil)
	if status != http.StatusConflict {
		t.Fatalf("非 resource 等待恢复应 409，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_state_conflict" {
		t.Fatalf("错误码应为 task_state_conflict，got %q", code)
	}

	env.updateTask(t, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingResource
		task.WaitingSince = now
	})
	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/resume",
		map[string]any{"reason": "额度已恢复"})
	if status != http.StatusOK {
		t.Fatalf("resource 等待恢复应 200，got %d body=%v", status, payload)
	}
	if strValue(t, payload["resumedStepId"], "resumedStepId") == "" {
		t.Fatal("恢复应返回 resumedStepId")
	}
	resumed := objValue(t, payload["task"], "task")
	if reason, _ := resumed["waitingReason"].(string); reason != "" {
		t.Fatalf("恢复后应清空 waitingReason，got %q", reason)
	}
	if got := strValue(t, resumed["status"], "status"); got != "running" {
		t.Fatalf("恢复后任务应为 running，got %q", got)
	}

	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/confirmation",
		map[string]any{"decision": "maybe"})
	if status != http.StatusBadRequest {
		t.Fatalf("非法 decision 应 400，got %d body=%v", status, payload)
	}
}

// ---- N8 任务图 ----

func TestConvHTTPGraphEmptyAndLayers(t *testing.T) {
	env := newConvHTTPEnv(t)

	status, payload := env.json(t, http.MethodGet, "/api/sessions/s-empty/tasks/graph", nil)
	if status != http.StatusOK {
		t.Fatalf("空图应 200，got %d body=%v", status, payload)
	}
	if got := len(arrValue(t, payload["nodes"], "nodes")); got != 0 {
		t.Fatalf("空图 nodes 应为空，got %d", got)
	}
	if got := len(arrValue(t, payload["edges"], "edges")); got != 0 {
		t.Fatalf("空图 edges 应为空，got %d", got)
	}
	if got := len(arrValue(t, payload["layers"], "layers")); got != 0 {
		t.Fatalf("空图 layers 应为空数组，got %d", got)
	}
	if got := numValue(t, payload["total"], "total"); got != 0 {
		t.Fatalf("空图 total 应为 0，got %v", got)
	}
	// 空图 layers 必须序列化为 []，不能是 null 或数字。
	if _, raw := env.request(t, http.MethodGet, "/api/sessions/s-empty/tasks/graph", nil); !strings.Contains(string(raw), `"layers":[]`) {
		t.Fatalf("空图 layers 应为 []，body=%s", raw)
	}

	// 8 节点夹具：t1→{t2,t3}，{t2,t3}→t4，t4→{t5,t6}，{t5,t6}→t7，t7→t8。
	deps := map[string][]string{
		"t2": {"t1"}, "t3": {"t1"}, "t4": {"t2", "t3"},
		"t5": {"t4"}, "t6": {"t4"}, "t7": {"t5", "t6"}, "t8": {"t7"},
	}
	items := make([]map[string]any, 0, 8)
	for i := 1; i <= 8; i++ {
		key := fmt.Sprintf("t%d", i)
		item := map[string]any{"key": key, "title": "节点 " + key}
		if on := deps[key]; len(on) > 0 {
			item["dependsOn"] = on
		}
		items = append(items, item)
	}
	created := env.create(t, "s1", items)
	batchID := strValue(t, created["batchId"], "batchId")

	status, payload = env.json(t, http.MethodGet, "/api/sessions/s1/tasks/graph?batchId="+batchID, nil)
	if status != http.StatusOK {
		t.Fatalf("任务图应 200，got %d body=%v", status, payload)
	}
	nodes := arrValue(t, payload["nodes"], "nodes")
	if len(nodes) != 8 {
		t.Fatalf("节点数应为 8，got %d", len(nodes))
	}
	if got := numValue(t, payload["total"], "total"); got != 8 {
		t.Fatalf("total 应为 8，got %v", got)
	}
	edges := arrValue(t, payload["edges"], "edges")
	if len(edges) != 9 {
		t.Fatalf("边数应为 9，got %d", len(edges))
	}
	for _, raw := range edges {
		edge := objValue(t, raw, "edges[]")
		if strValue(t, edge["from"], "edge.from") == "" || strValue(t, edge["to"], "edge.to") == "" {
			t.Fatalf("边缺端点: %v", edge)
		}
		mode := strValue(t, edge["joinMode"], "edge.joinMode")
		if mode != "all" && mode != "any" && mode != "each" {
			t.Fatalf("joinMode 非法: %q", mode)
		}
		style := strValue(t, edge["style"], "edge.style")
		if style != "solid" && style != "dashed" {
			t.Fatalf("style 非法: %q", style)
		}
	}

	layers := arrValue(t, payload["layers"], "layers")
	wantSizes := []int{1, 2, 1, 2, 1, 1}
	if len(layers) != len(wantSizes) {
		t.Fatalf("层数应为 %d，got %d", len(wantSizes), len(layers))
	}
	layerOf := map[string]int{}
	for index, raw := range layers {
		layer := objValue(t, raw, "layers[]")
		if got := numValue(t, layer["index"], "layer.index"); int(got) != index {
			t.Fatalf("层 index 应为 %d，got %v", index, got)
		}
		ids := arrValue(t, layer["nodeIds"], "layer.nodeIds")
		if len(ids) != wantSizes[index] {
			t.Fatalf("第 %d 层应有 %d 个节点，got %d", index, wantSizes[index], len(ids))
		}
		for _, id := range ids {
			layerOf[strValue(t, id, "nodeIds[]")] = index
		}
	}
	if len(layerOf) != 8 {
		t.Fatalf("layers.nodeIds 应覆盖 8 个节点，got %d", len(layerOf))
	}
	for _, raw := range nodes {
		node := objValue(t, raw, "nodes[]")
		id := strValue(t, node["id"], "node.id")
		if got := int(numValue(t, node["layer"], "node.layer")); got != layerOf[id] {
			t.Fatalf("节点 %s 的 layer=%d 与分层 %d 不一致", id, got, layerOf[id])
		}
	}
}

// ---- N9 交付物 ----

func TestConvHTTPDeliverablesGrouping(t *testing.T) {
	env := newConvHTTPEnv(t)

	status, payload := env.json(t, http.MethodGet, "/api/sessions/s-empty/deliverables", nil)
	if status != http.StatusOK {
		t.Fatalf("空会话交付物应 200，got %d body=%v", status, payload)
	}
	if got := len(arrValue(t, payload["groups"], "groups")); got != 0 {
		t.Fatalf("空会话 groups 应为空数组，got %d", got)
	}
	if numValue(t, payload["total"], "total") != 0 || numValue(t, payload["fileCount"], "fileCount") != 0 {
		t.Fatalf("空会话 total/fileCount 应为 0: %v", payload)
	}
	if boolValue(t, payload["hasMore"], "hasMore") {
		t.Fatal("空会话 hasMore 应为 false")
	}
	if _, raw := env.request(t, http.MethodGet, "/api/sessions/s-empty/deliverables", nil); !strings.Contains(string(raw), `"groups":[]`) {
		t.Fatalf("空会话 groups 应序列化为 []，body=%s", raw)
	}

	created := env.create(t, "s1", []map[string]any{
		{"key": "a", "title": "交付任务 A"},
		{"key": "b", "title": "交付任务 B"},
	})
	tasks := taskList(t, created)
	aID, bID := taskIDOf(t, tasks[0]), taskIDOf(t, tasks[1])
	now := time.Now().UnixMilli()
	fixtures := []struct {
		id, taskID, name, mime, kind string
	}{
		{"art-1", aID, "report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", coretask.ArtifactDeliveryKindUser},
		{"art-2", aID, "chart.png", "image/png", coretask.ArtifactDeliveryKindUser},
		{"art-3", bID, "data.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", coretask.ArtifactDeliveryKindUser},
		{"art-4", aID, "internal.md", "text/markdown", coretask.ArtifactDeliveryKindInternal},
	}
	for _, item := range fixtures {
		fixture := item
		if err := env.mod.store.Write(env.ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(env.ctx, `INSERT INTO task_artifacts(
				id, task_id, name, rel_path, mime, size, created_at, delivery_kind, storage_scope, workspace_rel_path)
				VALUES (?, ?, ?, '', ?, 10, ?, ?, 'workspace', '')`,
				fixture.id, fixture.taskID, fixture.name, fixture.mime, now, fixture.kind)
			return err
		}); err != nil {
			t.Fatalf("插入交付物失败: %v", err)
		}
	}

	status, payload = env.json(t, http.MethodGet, "/api/sessions/s1/deliverables", nil)
	if status != http.StatusOK {
		t.Fatalf("交付物列表应 200，got %d body=%v", status, payload)
	}
	groups := arrValue(t, payload["groups"], "groups")
	if len(groups) != 2 || numValue(t, payload["total"], "total") != 2 || numValue(t, payload["fileCount"], "fileCount") != 3 {
		t.Fatalf("应按任务分成 2 组 3 个用户交付物: %v", payload)
	}
	if boolValue(t, payload["hasMore"], "hasMore") {
		t.Fatal("未截断时 hasMore 应为 false")
	}
	groupA := objValue(t, groups[0], "groups[0]")
	if got := strValue(t, groupA["taskId"], "groups[0].taskId"); got != aID {
		t.Fatalf("第一组应是任务 A，got %q", got)
	}
	if got := strValue(t, groupA["taskTitle"], "taskTitle"); got != "交付任务 A" {
		t.Fatalf("组标题应为任务标题，got %q", got)
	}
	if got := strValue(t, groupA["taskStatus"], "taskStatus"); got != "pending" {
		t.Fatalf("组状态应取任务状态，got %q", got)
	}
	badges := map[string]bool{}
	filesA := arrValue(t, groupA["files"], "groups[0].files")
	if len(filesA) != 2 {
		t.Fatalf("任务 A 应有 2 个文件（内部产物不出现），got %d", len(filesA))
	}
	for _, raw := range filesA {
		file := objValue(t, raw, "files[]")
		badges[strValue(t, file["typeBadge"], "typeBadge")] = true
		id := strValue(t, file["id"], "file.id")
		if got, want := strValue(t, file["downloadUrl"], "downloadUrl"), "/api/artifacts/"+id+"/content?download=1"; got != want {
			t.Fatalf("downloadUrl 不对: %q want %q", got, want)
		}
		if got, want := strValue(t, file["previewUrl"], "previewUrl"), "/api/artifacts/"+id+"/content"; got != want {
			t.Fatalf("previewUrl 不对: %q want %q", got, want)
		}
	}
	if !badges["doc"] || !badges["image"] {
		t.Fatalf("typeBadge 应覆盖 doc 与 image，got %v", badges)
	}
	groupB := objValue(t, groups[1], "groups[1]")
	filesB := arrValue(t, groupB["files"], "groups[1].files")
	if len(filesB) != 1 {
		t.Fatalf("任务 B 应有 1 个文件，got %d", len(filesB))
	}
	if got := strValue(t, objValue(t, filesB[0], "files[]")["typeBadge"], "typeBadge"); got != "sheet" {
		t.Fatalf("xlsx 的 typeBadge 应为 sheet，got %q", got)
	}

	status, filtered := env.json(t, http.MethodGet, "/api/sessions/s1/deliverables?taskId="+bID, nil)
	if status != http.StatusOK {
		t.Fatalf("按任务过滤应 200，got %d", status)
	}
	filteredGroups := arrValue(t, filtered["groups"], "groups")
	if len(filteredGroups) != 1 || numValue(t, filtered["fileCount"], "fileCount") != 1 {
		t.Fatalf("taskId 过滤应只剩 1 组 1 个文件: %v", filtered)
	}
}

// ---- 错误信封（§17.10） ----

func TestConvHTTPErrorEnvelopes(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "s1", []map[string]any{{"title": "信封任务"}})
	taskID := taskIDOf(t, taskList(t, created)[0])
	env.updateTask(t, taskID, func(task *coretask.Task) { task.Status = coretask.StatusRunning })

	tooMany := make([]map[string]any, 13)
	for i := range tooMany {
		tooMany[i] = map[string]any{"title": fmt.Sprintf("超限 %d", i)}
	}
	cases := []struct {
		name      string
		method    string
		path      string
		body      any
		wantHTTP  int
		wantCode  string
		wantState string
	}{
		{"批量超限", http.MethodPost, "/api/sessions/s1/tasks", map[string]any{"tasks": tooMany}, http.StatusBadRequest, "task_batch_too_large", ""},
		{"limit 越界", http.MethodGet, "/api/sessions/s1/tasks?limit=0", nil, http.StatusBadRequest, "invalid_task_limit", ""},
		{"任务不存在", http.MethodGet, "/api/sessions/s1/tasks/task-nope", nil, http.StatusNotFound, "task_not_found", ""},
		{"跨会话", http.MethodGet, "/api/sessions/s2/tasks/" + taskID, nil, http.StatusNotFound, "task_not_found", ""},
		{"运行中重试", http.MethodPost, "/api/sessions/s1/tasks/" + taskID + "/retry", nil, http.StatusConflict, "task_state_conflict", "running"},
		{"非法 scope", http.MethodPost, "/api/sessions/s1/tasks/" + taskID + "/cancel?scope=all", nil, http.StatusBadRequest, "invalid_argument", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, payload := env.json(t, tc.method, tc.path, tc.body)
			if status != tc.wantHTTP {
				t.Fatalf("HTTP 状态应为 %d，got %d body=%v", tc.wantHTTP, status, payload)
			}
			if ok, present := payload["ok"]; !present || ok != false {
				t.Fatalf("错误信封必须带 ok=false: %v", payload)
			}
			message, present := payload["error"]
			if !present {
				t.Fatalf("错误信封必须带 error 文案: %v", payload)
			}
			if text, isString := message.(string); !isString || strings.TrimSpace(text) == "" {
				t.Fatalf("error 必须是非空字符串: %v", message)
			}
			if code := strValue(t, payload["code"], "code"); code != tc.wantCode {
				t.Fatalf("错误码应为 %q，got %q", tc.wantCode, code)
			}
			if tc.wantState != "" {
				if got := strValue(t, payload["currentStatus"], "currentStatus"); got != tc.wantState {
					t.Fatalf("task_state_conflict 应带 currentStatus=%q，got %q", tc.wantState, got)
				}
			}
			if _, hasTask := payload["task"]; hasTask {
				t.Fatalf("错误信封不应带 task 正文: %v", payload)
			}
			if _, hasTasks := payload["tasks"]; hasTasks {
				t.Fatalf("错误信封不应带 tasks 正文: %v", payload)
			}
		})
	}
}

// TestLegacyGetRequiresSession 验证旧详情路由 GET /api/tasks/{id} 的会话边界：
// 缺 sessionId 返回 400 task_session_required，跨会话返回 404 task_not_found，同会话返回 200。
func TestLegacyGetRequiresSession(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "sess-owner", []map[string]any{
		{"key": "t1", "title": "补会话校验", "mode": "plan"},
	})
	tasks := arrValue(t, created["tasks"], "tasks")
	taskID, _ := objValue(t, tasks[0], "task")["id"].(string)
	if taskID == "" {
		t.Fatalf("创建任务后应返回任务 id: %v", created)
	}

	status, body := env.json(t, http.MethodGet, "/api/tasks/"+taskID, nil)
	if status != http.StatusBadRequest {
		t.Fatalf("缺 sessionId 应返回 400，got %d body=%v", status, body)
	}
	if body["code"] != "task_session_required" {
		t.Fatalf("缺 sessionId 错误码应为 task_session_required: %v", body)
	}

	status, body = env.json(t, http.MethodGet, "/api/tasks/"+taskID+"?sessionId=sess-other", nil)
	if status != http.StatusNotFound {
		t.Fatalf("跨会话应返回 404，got %d body=%v", status, body)
	}
	if body["code"] != "task_not_found" || body["error"] != "任务不存在" {
		t.Fatalf("跨会话应返回 task_not_found/任务不存在: %v", body)
	}

	status, body = env.json(t, http.MethodGet, "/api/tasks/"+taskID+"?sessionId=sess-owner", nil)
	if status != http.StatusOK {
		t.Fatalf("同会话应返回 200，got %d body=%v", status, body)
	}
	task := objValue(t, body["task"], "task")
	if task["id"] != taskID {
		t.Fatalf("同会话返回的任务 id 不一致: %v", task["id"])
	}
}

// TestTaskProgressEvent 验证进度变化只发一条 task.progress，字段与去重规则符合约定。
func TestTaskProgressEvent(t *testing.T) {
	env := newConvHTTPEnv(t)
	created := env.create(t, "sess-progress", []map[string]any{
		{"key": "t1", "title": "进度事件", "mode": "plan"},
	})
	taskID, _ := objValue(t, arrValue(t, created["tasks"], "tasks")[0], "task")["id"].(string)
	before, err := env.logger.LatestID(env.ctx)
	if err != nil {
		t.Fatal(err)
	}
	task, err := env.mod.getTask(env.ctx, taskID)
	if err != nil {
		t.Fatal(err)
	}
	task.Progress = 40
	task.UpdatedAt = time.Now().UnixMilli()
	env.mod.saveAndEmit(env.ctx, task, "", "")
	// 同一进度重复保存不应再发一条 task.progress。
	env.mod.saveAndEmit(env.ctx, task, "", "")

	events, err := env.logger.Replay(env.ctx, before)
	if err != nil {
		t.Fatal(err)
	}
	progressEvents := 0
	for _, ev := range events {
		if ev.Type != eventlog.TypeTaskProgress {
			continue
		}
		progressEvents++
		var payload map[string]any
		if err := json.Unmarshal(ev.Payload, &payload); err != nil {
			t.Fatalf("task.progress 载荷不是 JSON: %v", err)
		}
		if payload["id"] != taskID || payload["taskId"] != taskID {
			t.Fatalf("task.progress 的 id/taskId 应等于任务 id: %v", payload)
		}
		if payload["progress"] != float64(40) {
			t.Fatalf("task.progress.progress 应为 40: %v", payload)
		}
		if _, ok := payload["updatedAtMs"].(float64); !ok {
			t.Fatalf("task.progress 应带 updatedAtMs: %v", payload)
		}
	}
	if progressEvents != 1 {
		t.Fatalf("同一进度应只发 1 条 task.progress，got %d", progressEvents)
	}
}
