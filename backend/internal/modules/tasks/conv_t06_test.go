package tasks

import (
	"net/http"
	"testing"

	coretask "simo/internal/core/task"
)

// t06Int 直接取预算字段的整数值（0 是合法用量，不能用 budgetInt 的“非正回落”语义）。
func t06Int(budget map[string]any, key string) int {
	value, ok := budget[key]
	if !ok {
		return -1
	}
	switch n := value.(type) {
	case float64:
		return int(n)
	case int:
		return n
	}
	return -1
}

// TestConvT06BudgetConfigurable 覆盖预算可配置：新任务按模块上限写两维预算，用量逐次累加。
func TestConvT06BudgetConfigurable(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	mod.MaxSteps, mod.MaxTokens = 3, 500
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "t", Title: "预算可配", Mode: "plan", Steps: []string{"一", "二", "三"}},
	})
	task := t02Task(t, mod, ctx, result.Tasks[0].ID)
	budget := mod.budgetFor(task)
	if got := budgetInt(budget, "maxSteps", 0); got != 3 {
		t.Fatalf("预算上限应取模块配置 3，got %d budget=%v", got, budget)
	}
	if got := budgetInt(budget, "maxTokens", 0); got != 500 {
		t.Fatalf("token 上限应取模块配置 500，got %d budget=%v", got, budget)
	}
	if got := t06Int(budget, "usedSteps"); got != 0 {
		t.Fatalf("新任务 usedSteps 应为 0，got %d", got)
	}
	if got := t06Int(budget, "usedTokens"); got != 0 {
		t.Fatalf("新任务 usedTokens 应为 0，got %d", got)
	}

	// 两维用量逐次累加，上限不变。
	mod.recordBudgetUsage(&task, 2, 46)
	mod.recordBudgetUsage(&task, 1, 23)
	budget = mod.budgetFor(task)
	if got := budgetInt(budget, "usedSteps", 0); got != 3 {
		t.Fatalf("用量应累加为 3 步，got %d", got)
	}
	if got := budgetInt(budget, "usedTokens", 0); got != 69 {
		t.Fatalf("用量应累加为 69 token，got %d", got)
	}
	if budgetInt(budget, "maxSteps", 0) != 3 || budgetInt(budget, "maxTokens", 0) != 500 {
		t.Fatalf("累加用量不应改动上限，got %v", budget)
	}

	// 没有配置上限时回落到缺省窗口。
	plain, _, _ := newConvTestModule(t)
	fallback := plain.budgetFor(coretask.Task{BudgetJSON: `{"usedSteps":1,"usedTokens":23}`})
	if budgetInt(fallback, "maxSteps", 0) != defaultBudgetSteps || budgetInt(fallback, "maxTokens", 0) != defaultBudgetTokens {
		t.Fatalf("缺省预算应为 %d/%d，got %v", defaultBudgetSteps, defaultBudgetTokens, fallback)
	}
	if budgetInt(fallback, "usedSteps", 0) != 1 || budgetInt(fallback, "usedTokens", 0) != 23 {
		t.Fatalf("历史行用量应保留，got %v", fallback)
	}
}

// TestConvT06RetryGuardShared 覆盖新旧 retry 共用守卫、409 带 currentStatus、重试清 endMessageId。
func TestConvT06RetryGuardShared(t *testing.T) {
	env := newConvHTTPEnv(t)
	env.mod.MaxSteps, env.mod.MaxTokens = 4, 800
	created := env.create(t, "s1", []map[string]any{{"title": "守卫共用", "steps": []string{"第一步", "第二步"}}})
	taskID := taskIDOf(t, taskList(t, created)[0])

	env.updateTask(t, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.Attempt = 2
		task.EndMessageID = "msg-end"
		task.ReportMessageID = "msg-report"
		task.BudgetJSON = `{"maxSteps":4,"maxTokens":800,"usedSteps":3,"usedTokens":700}`
	})

	// 进行中任务：旧入口 409，错误体带 currentStatus，attempt 与预算都不动。
	status, payload := env.json(t, http.MethodPost, "/api/tasks/"+taskID+"/retry?sessionId=s1", nil)
	if status != http.StatusConflict {
		t.Fatalf("旧接口对运行中任务应 409，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_state_conflict" {
		t.Fatalf("旧接口错误码应为 task_state_conflict，got %q", code)
	}
	if got := strValue(t, payload["currentStatus"], "currentStatus"); got != coretask.StatusRunning {
		t.Fatalf("旧接口 409 应带 currentStatus=running，got %q", got)
	}

	// 进行中任务：新入口同样 409，两个入口共用同一状态守卫。
	status, payload = env.json(t, http.MethodPost, "/api/sessions/s1/tasks/"+taskID+"/retry", nil)
	if status != http.StatusConflict {
		t.Fatalf("新接口对运行中任务应 409，got %d body=%v", status, payload)
	}
	if code := strValue(t, payload["code"], "code"); code != "task_state_conflict" {
		t.Fatalf("新接口错误码应为 task_state_conflict，got %q", code)
	}

	// 直接调模块方法也要 409，避免绕过 HTTP 层就没有守卫。
	if _, err := env.mod.Retry(env.ctx, taskID); err == nil {
		t.Fatal("进行中任务直接重试应 409")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != http.StatusConflict || convErr.Code != "task_state_conflict" {
		t.Fatalf("模块层重试应为 409 task_state_conflict，got %v", err)
	}
	unchanged := t02Task(t, env.mod, env.ctx, taskID)
	if unchanged.Attempt != 2 {
		t.Fatalf("409 不应改 attempt，got %d", unchanged.Attempt)
	}
	if budgetInt(env.mod.budgetFor(unchanged), "usedSteps", 0) != 3 {
		t.Fatalf("409 不应清预算用量，got %s", unchanged.BudgetJSON)
	}

	// 已完成任务也不可重试。
	env.updateTask(t, taskID, func(task *coretask.Task) { task.Status = coretask.StatusDone })
	if status, _ := env.json(t, http.MethodPost, "/api/tasks/"+taskID+"/retry?sessionId=s1", nil); status != http.StatusConflict {
		t.Fatalf("已完成任务重试应 409，got %d", status)
	}

	// 可重试终态：attempt+1、queued、清 endMessageId、保留 reportMessageId、清两维用量。
	env.updateTask(t, taskID, func(task *coretask.Task) { task.Status = coretask.StatusFailed })
	status, payload = env.json(t, http.MethodPost, "/api/tasks/"+taskID+"/retry?sessionId=s1", nil)
	if status != http.StatusOK {
		t.Fatalf("失败任务重试应 200，got %d body=%v", status, payload)
	}
	retried := t02Task(t, env.mod, env.ctx, taskID)
	if retried.Status != coretask.StatusQueued || retried.Attempt != 3 {
		t.Fatalf("重试后应为 queued 且 attempt=3，got %s/%d", retried.Status, retried.Attempt)
	}
	if retried.EndMessageID != "" {
		t.Fatalf("重试应清空 endMessageId，got %q", retried.EndMessageID)
	}
	if retried.ReportMessageID != "msg-report" {
		t.Fatalf("重试应保留 reportMessageId，got %q", retried.ReportMessageID)
	}
	budget := env.mod.budgetFor(retried)
	if t06Int(budget, "usedSteps") != 0 || t06Int(budget, "usedTokens") != 0 {
		t.Fatalf("重试应清空两维用量，got %v", budget)
	}
	if budgetInt(budget, "maxSteps", 0) != 4 || budgetInt(budget, "maxTokens", 0) != 800 {
		t.Fatalf("重试应保留原有上限，got %v", budget)
	}
}

// TestConvT06ResumeClearsOutcomeAndResetsUsage 覆盖恢复：清 outcome、清用量、保留上限、从暂停步继续。
func TestConvT06ResumeClearsOutcomeAndResetsUsage(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	mod.MaxSteps, mod.MaxTokens = 5, 900
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "t", Title: "预算暂停", Mode: "plan", Steps: []string{"已完成", "暂停步", "后续"}},
	})
	taskID := result.Tasks[0].ID
	steps, _ := mod.loadSteps(ctx, taskID)
	steps[0].Status = "done"
	steps[1].Status = "running"
	if err := mod.saveSteps(ctx, taskID, steps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingResource
		task.WaitingSince = 123
		task.Outcome = "budget_exceeded"
		task.Attempt = 1
		task.BudgetJSON = `{"maxSteps":5,"maxTokens":900,"usedSteps":5,"usedTokens":900}`
	})

	resumed, resumedStep, err := mod.ResumeConv(ctx, taskID, "用户追加预算")
	if err != nil {
		t.Fatal(err)
	}
	if resumed.WaitingReason != "" || resumed.WaitingSince != 0 {
		t.Fatalf("恢复应清等待原因，got %q/%d", resumed.WaitingReason, resumed.WaitingSince)
	}
	if resumed.Outcome != "" {
		t.Fatalf("恢复应清 outcome，got %q", resumed.Outcome)
	}
	if resumedStep != steps[1].ID {
		t.Fatalf("恢复应从暂停步继续，got %s want %s", resumedStep, steps[1].ID)
	}
	if resumed.Attempt != 1 {
		t.Fatalf("恢复不应改 attempt，got %d", resumed.Attempt)
	}
	budget := mod.budgetFor(resumed)
	if t06Int(budget, "usedSteps") != 0 || t06Int(budget, "usedTokens") != 0 {
		t.Fatalf("恢复应重置两维用量，got %v", budget)
	}
	if budgetInt(budget, "maxSteps", 0) != 5+defaultBudgetSteps || budgetInt(budget, "maxTokens", 0) != 900+defaultBudgetTokens {
		t.Fatalf("恢复应追加一档默认窗口（上限 %d/%d），got %v", 5+defaultBudgetSteps, 900+defaultBudgetTokens, budget)
	}
	after, _ := mod.loadSteps(ctx, taskID)
	if after[0].Status != "done" {
		t.Fatalf("已完成步骤不应重跑，got %q", after[0].Status)
	}
}
