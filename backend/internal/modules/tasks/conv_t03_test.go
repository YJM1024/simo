package tasks

import (
	"context"
	"strings"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	coretask "simo/internal/core/task"
)

// t03Mutate 直接改任务行，用来造“进行中/已完成”等夹具状态。
func t03Mutate(t *testing.T, mod *Module, ctx context.Context, taskID string, mutate func(*coretask.Task)) coretask.Task {
	t.Helper()
	task, err := mod.getTask(ctx, taskID)
	if err != nil {
		t.Fatal(err)
	}
	mutate(&task)
	task.UpdatedAt = time.Now().UnixMilli()
	if err := mod.saveTask(ctx, task); err != nil {
		t.Fatal(err)
	}
	return task
}

// t03Active 判断任务是否已有执行器在跑（启动次数的最直接证据）。
func t03Active(mod *Module, taskID string) bool {
	mod.mu.Lock()
	defer mod.mu.Unlock()
	return mod.active[taskID] != nil
}

// TestConvT03DependencyWaiting 覆盖等待依赖：未开始、启动 0 次、前置取消不级联标失败。
func TestConvT03DependencyWaiting(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "a", Title: "前置", Mode: "plan", Steps: []string{"一步"}},
		{Key: "b", Title: "等待方", Mode: "plan", DependsOn: []string{"a"}, JoinMode: "all", Steps: []string{"甲", "乙"}},
	})
	aID, bID := result.Tasks[0].ID, result.Tasks[1].ID

	checkWaiting := func(stage string) {
		t.Helper()
		waiting := t02Task(t, mod, ctx, bID)
		if waiting.Status != coretask.StatusPending || waiting.WaitingReason != WaitingDependency {
			t.Fatalf("%s：下游应 pending+dependency，got %s/%q", stage, waiting.Status, waiting.WaitingReason)
		}
		if waiting.TriggerCount != 0 || waiting.Attempt != 1 {
			t.Fatalf("%s：等待期间 triggerCount/attempt 不应变化，got %d/%d", stage, waiting.TriggerCount, waiting.Attempt)
		}
		if t03Active(mod, bID) {
			t.Fatalf("%s：下游不应启动执行器", stage)
		}
		for _, step := range waiting.Steps {
			if step.Status != "pending" {
				t.Fatalf("%s：下游步骤不应启动，got %+v", stage, step)
			}
		}
	}
	checkWaiting("创建后")

	// 取消前置（self）：下游保持 pending 等待，不写 failed/blocked，不启动。
	if _, _, changed, err := mod.CancelScope(ctx, aID, "self"); err != nil || !changed {
		t.Fatalf("取消前置应成功: %v/%v", changed, err)
	}
	checkWaiting("前置取消后")
}

// TestConvT03CancelCascade 覆盖链式取消：未开始直接取消、进行中中断并落轨迹、已完成保留、重复取消幂等。
func TestConvT03CancelCascade(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "a", Title: "上游"},
		{Key: "b", Title: "下游一", DependsOn: []string{"a"}},
		{Key: "c", Title: "下游二", DependsOn: []string{"b"}},
		{Key: "d", Title: "进行中", DependsOn: []string{"a"}, Mode: "plan", Steps: []string{"甲", "乙"}},
		{Key: "e", Title: "已完成", DependsOn: []string{"b"}},
	})
	aID, bID, cID, dID, eID := result.Tasks[0].ID, result.Tasks[1].ID, result.Tasks[2].ID, result.Tasks[3].ID, result.Tasks[4].ID

	// 造夹具：d 进行中（第一步 running），e 已完成。
	t03Mutate(t, mod, ctx, dID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.Progress = 40
	})
	dSteps, _ := mod.loadSteps(ctx, dID)
	dSteps[0].Status = "running"
	dSteps[0].StartedAt = time.Now().UnixMilli()
	if err := mod.saveSteps(ctx, dID, dSteps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, eID, func(task *coretask.Task) {
		task.Status = coretask.StatusDone
		task.Progress = 100
		task.Summary = "已有结果"
	})

	task, cancelled, changed, err := mod.CancelScope(ctx, aID, "chain")
	if err != nil {
		t.Fatal(err)
	}
	if !changed || task.Status != coretask.StatusCancelled {
		t.Fatalf("链式取消应改变状态: %v/%s", changed, task.Status)
	}
	// ct-conv-535：取消不级联改状态，cancelled[] 只含目标自身。
	if len(cancelled) != 1 || cancelled[0] != aID {
		t.Fatalf("cancelled[] 只应含目标自身，got %v", cancelled)
	}
	for _, id := range []string{bID, cID} {
		waiting := t02Task(t, mod, ctx, id)
		if waiting.Status != coretask.StatusPending || waiting.WaitingReason != WaitingDependency {
			t.Fatalf("%s 应保持 pending 等依赖，got %s/%s", id, waiting.Status, waiting.WaitingReason)
		}
		if waiting.StartedAt != 0 || waiting.TriggerCount != 0 {
			t.Fatalf("%s 不应启动: startedAt=%d trigger=%d", id, waiting.StartedAt, waiting.TriggerCount)
		}
		if t03Active(mod, id) {
			t.Fatalf("%s 不应有执行句柄", id)
		}
		steps, err := mod.loadSteps(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		for _, step := range steps {
			if step.Status != "pending" || step.StartedAt != 0 {
				t.Fatalf("%s 步骤不应启动，got %+v", id, step)
			}
		}
	}

	interrupted := t02Task(t, mod, ctx, dID)
	if interrupted.Status != coretask.StatusInterrupted {
		t.Fatalf("进行中的下游应中断，got %s", interrupted.Status)
	}
	if interrupted.Attempt != 1 {
		t.Fatalf("中断不应增加 attempt，got %d", interrupted.Attempt)
	}
	dSteps, _ = mod.loadSteps(ctx, dID)
	if dSteps[0].Status != "pending" || dSteps[0].StartedAt != 0 {
		t.Fatalf("中断后运行中步骤应回 pending，got %+v", dSteps[0])
	}
	var interruptTraces int
	if err := mod.store.QueryRow(ctx,
		`SELECT COUNT(*) FROM task_traces WHERE task_id = ? AND category = 'interrupt'`, dID).Scan(&interruptTraces); err != nil {
		t.Fatal(err)
	}
	if interruptTraces != 1 {
		t.Fatalf("中断应落 1 条轨迹，got %d", interruptTraces)
	}

	done := t02Task(t, mod, ctx, eID)
	if done.Status != coretask.StatusDone || done.Progress != 100 || done.Summary != "已有结果" {
		t.Fatalf("已完成的下游应保留结果，got %+v", done)
	}

	// 重复取消：终态返回 changed=false、cancelled 为空。
	_, again, changedAgain, err := mod.CancelScope(ctx, aID, "chain")
	if err != nil || changedAgain || len(again) != 0 {
		t.Fatalf("重复取消应幂等: %v/%v/%d", err, changedAgain, len(again))
	}

	// 级联空集：对叶子任务做 chain，只取消它自己。
	leaf := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "x", Title: "独立"},
		{Key: "y", Title: "依赖方", DependsOn: []string{"x"}},
	})
	_, onlyLeaf, changedLeaf, err := mod.CancelScope(ctx, leaf.Tasks[1].ID, "chain")
	if err != nil || !changedLeaf || len(onlyLeaf) != 1 || onlyLeaf[0] != leaf.Tasks[1].ID {
		t.Fatalf("叶子 chain 应只取消自身: %v/%v/%v", err, changedLeaf, onlyLeaf)
	}
	if upstream := t02Task(t, mod, ctx, leaf.Tasks[0].ID); upstream.Status == coretask.StatusCancelled {
		t.Fatal("chain 不应向上游传播")
	}
}

// TestConvT03RetryDownstream 覆盖重试只重跑失败/取消的下游，不动已完成的下游。
func TestConvT03RetryDownstream(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "a", Title: "上游", Mode: "plan", Steps: []string{"甲"}},
		{Key: "b", Title: "取消的下游", DependsOn: []string{"a"}},
		{Key: "c", Title: "已完成的下游", DependsOn: []string{"a"}, Mode: "plan", Steps: []string{"甲"}},
	})
	aID, bID, cID := result.Tasks[0].ID, result.Tasks[1].ID, result.Tasks[2].ID

	t03Mutate(t, mod, ctx, aID, func(task *coretask.Task) {
		task.Status = coretask.StatusFailed
		task.FailReason = "上游失败"
	})
	aSteps, _ := mod.loadSteps(ctx, aID)
	aSteps[0].Status = "failed"
	if err := mod.saveSteps(ctx, aID, aSteps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, bID, func(task *coretask.Task) { task.Status = coretask.StatusCancelled })
	t03Mutate(t, mod, ctx, cID, func(task *coretask.Task) {
		task.Status = coretask.StatusDone
		task.Progress = 100
		task.Summary = "结果保留"
	})
	cSteps, _ := mod.loadSteps(ctx, cID)
	cSteps[0].Status = "done"
	cSteps[0].StartedAt = 111
	cSteps[0].FinishedAt = 222
	if err := mod.saveSteps(ctx, cID, cSteps); err != nil {
		t.Fatal(err)
	}

	task, attempt, reset, err := mod.RetryConv(ctx, aID)
	if err != nil {
		t.Fatal(err)
	}
	if attempt != 2 || task.Attempt != 2 || reset != 1 {
		t.Fatalf("上游重试应为第 2 次、重置 1 步，got %d/%d/%d", attempt, task.Attempt, reset)
	}
	downstream := t02Task(t, mod, ctx, bID)
	if downstream.Attempt != 2 || downstream.WaitingReason != "" {
		t.Fatalf("取消的下游应被重新排队，got attempt=%d waiting=%q", downstream.Attempt, downstream.WaitingReason)
	}
	if downstream.Status != coretask.StatusQueued && downstream.Status != coretask.StatusRunning {
		t.Fatalf("取消的下游应 queued/running，got %s", downstream.Status)
	}
	kept := t02Task(t, mod, ctx, cID)
	if kept.Status != coretask.StatusDone || kept.Attempt != 1 || kept.Summary != "结果保留" {
		t.Fatalf("已完成的下游不应被重跑，got %+v", kept)
	}
	keptSteps, _ := mod.loadSteps(ctx, cID)
	if keptSteps[0].Status != "done" || keptSteps[0].StartedAt != 111 || keptSteps[0].FinishedAt != 222 {
		t.Fatalf("已完成步骤的时间戳应原样保留，got %+v", keptSteps[0])
	}
}

// TestConvT03ResumeResourceOnly 覆盖恢复：只对 resource 有效、从暂停步续跑、trigger_count 加一、恢复后再取消。
func TestConvT03ResumeResourceOnly(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "t", Title: "暂停的任务", Mode: "plan", Steps: []string{"已完成", "暂停步", "后续"}},
	})
	taskID := result.Tasks[0].ID
	steps, _ := mod.loadSteps(ctx, taskID)
	steps[0].Status = "done"
	steps[0].StartedAt = 11
	steps[0].FinishedAt = 22
	steps[1].Status = "running"
	steps[1].StartedAt = 33
	if err := mod.saveSteps(ctx, taskID, steps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, taskID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingResource
		task.WaitingSince = time.Now().UnixMilli()
		task.TriggerCount = 1
	})

	resumed, resumedStep, err := mod.ResumeConv(ctx, taskID, "预算已追加")
	if err != nil {
		t.Fatal(err)
	}
	if resumed.WaitingReason != "" || resumed.WaitingSince != 0 || resumed.Status != coretask.StatusRunning {
		t.Fatalf("恢复应清等待并继续运行，got %+v", resumed)
	}
	if resumedStep != steps[1].ID {
		t.Fatalf("恢复应从暂停步续跑，got %s want %s", resumedStep, steps[1].ID)
	}
	if resumed.TriggerCount != 2 {
		t.Fatalf("恢复应把 trigger_count 加一，got %d", resumed.TriggerCount)
	}
	after, _ := mod.loadSteps(ctx, taskID)
	if after[0].Status != "done" || after[0].StartedAt != 11 || after[0].FinishedAt != 22 {
		t.Fatalf("已完成步骤不应重跑，got %+v", after[0])
	}

	// 恢复后重复调用 → 409。
	if _, _, err := mod.ResumeConv(ctx, taskID, "再来一次"); err == nil {
		t.Fatal("重复恢复应 409")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 409 || convErr.Code != "task_state_conflict" {
		t.Fatalf("重复恢复应 409 task_state_conflict，got %v", err)
	}

	// 恢复后再取消：可以取消，取消后恢复入口 409。
	if _, _, changed, err := mod.CancelScope(ctx, taskID, "self"); err != nil || !changed {
		t.Fatalf("恢复后应可取消: %v/%v", changed, err)
	}
	if _, _, err := mod.ResumeConv(ctx, taskID, "取消后恢复"); err == nil {
		t.Fatal("已取消任务恢复应 409")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 409 {
		t.Fatalf("已取消任务恢复应 409，got %v", err)
	}

	// 其它状态（pending）恢复 → 409。
	plain := t02CreateBatch(t, mod, ctx, []BatchTaskInput{{Key: "p", Title: "未暂停", Mode: "plan", Steps: []string{"一步"}}})
	if _, _, err := mod.ResumeConv(ctx, plain.Tasks[0].ID, "无理由恢复"); err == nil {
		t.Fatal("非 resource 状态恢复应 409")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 409 || convErr.Code != "task_state_conflict" {
		t.Fatalf("非 resource 状态应为 409 task_state_conflict，got %v", err)
	}
}

// TestConvT03Confirmation 覆盖等待确认：confirm 放行且不动 trigger_count，cancel 即失败且下游不启动。
func TestConvT03Confirmation(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "a", Title: "待确认", Mode: "plan", Steps: []string{"一步"}},
		{Key: "b", Title: "下游", DependsOn: []string{"a"}},
	})
	aID, bID := result.Tasks[0].ID, result.Tasks[1].ID
	steps, _ := mod.loadSteps(ctx, aID)
	steps[0].Status = "running"
	if err := mod.saveSteps(ctx, aID, steps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, aID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingConfirmation
		task.WaitingSince = time.Now().UnixMilli()
		task.TriggerCount = 5
	})

	confirmed, stepID, err := mod.ConfirmConv(ctx, aID, ConfirmationInput{Decision: "confirm"})
	if err != nil {
		t.Fatal(err)
	}
	if stepID != steps[0].ID || confirmed.WaitingReason != "" || confirmed.WaitingSince != 0 {
		t.Fatalf("confirm 应放行当前步，got %+v/%s", confirmed, stepID)
	}
	if confirmed.TriggerCount != 5 {
		t.Fatalf("确认放行不应改 trigger_count（只记依赖放行与资源恢复），got %d", confirmed.TriggerCount)
	}
	if confirmed.Status != coretask.StatusRunning {
		t.Fatalf("confirm 后应继续运行，got %s", confirmed.Status)
	}

	// decision=cancel：当前步失败、任务失败，下游保持依赖等待且启动 0 次。
	pending := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "p", Title: "待取消", Mode: "plan", Steps: []string{"一步"}},
		{Key: "q", Title: "下游", DependsOn: []string{"p"}},
	})
	pID, qID := pending.Tasks[0].ID, pending.Tasks[1].ID
	pSteps, _ := mod.loadSteps(ctx, pID)
	pSteps[0].Status = "running"
	if err := mod.saveSteps(ctx, pID, pSteps); err != nil {
		t.Fatal(err)
	}
	t03Mutate(t, mod, ctx, pID, func(task *coretask.Task) {
		task.Status = coretask.StatusRunning
		task.WaitingReason = WaitingConfirmation
		task.WaitingSince = time.Now().UnixMilli()
	})
	failed, failedStep, err := mod.ConfirmConv(ctx, pID, ConfirmationInput{Decision: "cancel", Note: "不做了"})
	if err != nil {
		t.Fatal(err)
	}
	if failed.Status != coretask.StatusFailed || failed.FailReason != "用户取消" || failedStep != pSteps[0].ID {
		t.Fatalf("取消确认应让任务失败，got %+v/%s", failed, failedStep)
	}
	pSteps, _ = mod.loadSteps(ctx, pID)
	if pSteps[0].Status != "failed" || pSteps[0].FailReason != "用户取消" {
		t.Fatalf("当前步应 failed，got %+v", pSteps[0])
	}
	downstream := t02Task(t, mod, ctx, qID)
	if downstream.Status != coretask.StatusPending || downstream.WaitingReason != WaitingDependency {
		t.Fatalf("下游应继续等待依赖，got %s/%q", downstream.Status, downstream.WaitingReason)
	}
	if t03Active(mod, qID) || downstream.Attempt != 1 {
		t.Fatalf("下游不应启动，got active=%v attempt=%d", t03Active(mod, qID), downstream.Attempt)
	}

	if downstream := t02Task(t, mod, ctx, bID); downstream.WaitingReason != WaitingDependency {
		t.Fatalf("确认放行只影响当前任务，下游仍应等待依赖，got %q", downstream.WaitingReason)
	}
}

// TestConvT03NoAutoTimeoutAndReminder 覆盖无自动超时与时限提醒只发 1 条（可控时钟：直接调 scanDeadlines）。
func TestConvT03NoAutoTimeoutAndReminder(t *testing.T) {
	mod, logger, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "noDeadline", Title: "无时限", Mode: "plan", Steps: []string{"一步"}},
		{Key: "due", Title: "已到点", Mode: "plan", Steps: []string{"一步"}, DeadlineAt: time.Now().Add(-time.Minute).UnixMilli()},
		{Key: "future", Title: "未到点", Mode: "plan", Steps: []string{"一步"}, DeadlineAt: time.Now().Add(time.Hour).UnixMilli()},
	})
	noDeadline, due, future := result.Tasks[0].ID, result.Tasks[1].ID, result.Tasks[2].ID

	before, _ := logger.LatestID(ctx)
	total := 0
	for i := 0; i < 3; i++ {
		total += mod.scanDeadlines(ctx)
	}
	if total != 1 {
		t.Fatalf("同一到点任务只应提醒 1 次，got %d", total)
	}

	events, err := logger.Replay(ctx, before)
	if err != nil {
		t.Fatal(err)
	}
	reminders := 0
	for _, ev := range events {
		if ev.Type != eventlog.TypeTaskReminder {
			continue
		}
		reminders++
		payload := string(ev.Payload)
		if !strings.Contains(payload, due) || strings.Contains(payload, noDeadline) || strings.Contains(payload, future) {
			t.Fatalf("提醒应只针对已到点任务，got %s", payload)
		}
	}
	if reminders != 1 {
		t.Fatalf("task.reminder 应只有 1 条，got %d", reminders)
	}

	// 无自动超时：三轮扫描后状态不变，无时限任务不写缺省 deadline。
	for _, id := range []string{noDeadline, due, future} {
		task := t02Task(t, mod, ctx, id)
		if isTerminalStatus(task.Status) {
			t.Fatalf("扫描不应自动取消/失败任务 %s，got %s", id, task.Status)
		}
	}
	if task := t02Task(t, mod, ctx, noDeadline); task.DeadlineAt != 0 || task.DeadlineRemindedAt != 0 {
		t.Fatalf("无时限任务不应被写时限或提醒，got %d/%d", task.DeadlineAt, task.DeadlineRemindedAt)
	}
	if task := t02Task(t, mod, ctx, due); task.DeadlineRemindedAt == 0 {
		t.Fatal("到点任务应写 deadline_reminded_at")
	}
	if task := t02Task(t, mod, ctx, future); task.DeadlineRemindedAt != 0 {
		t.Fatal("未到点任务不应提醒")
	}
}

// TestConvT03ParseBudgetContractKeys 覆盖 budget 键按 N3 契约使用 used* 前缀，并兼容历史键。
func TestConvT03ParseBudgetContractKeys(t *testing.T) {
	budget := parseBudget("")
	if numberOf(t, budget["maxSteps"]) != 8 || numberOf(t, budget["maxTokens"]) != 12000 {
		t.Fatalf("budget 缺省上限不对: %v", budget)
	}
	if numberOf(t, budget["usedSteps"]) != 0 || numberOf(t, budget["usedTokens"]) != 0 {
		t.Fatalf("budget 应用 usedSteps/usedTokens: %v", budget)
	}
	if _, ok := budget["stepsUsed"]; ok {
		t.Fatalf("不应再输出历史键 stepsUsed: %v", budget)
	}
	if _, ok := budget["tokensUsed"]; ok {
		t.Fatalf("不应再输出历史键 tokensUsed: %v", budget)
	}

	legacy := parseBudget(`{"stepsUsed":3,"tokensUsed":9}`)
	if numberOf(t, legacy["usedSteps"]) != 3 || numberOf(t, legacy["usedTokens"]) != 9 {
		t.Fatalf("历史键应归一到 used* 前缀: %v", legacy)
	}
}

func numberOf(t *testing.T, value any) float64 {
	t.Helper()
	switch typed := value.(type) {
	case int:
		return float64(typed)
	case int64:
		return float64(typed)
	case float64:
		return typed
	default:
		t.Fatalf("不是数字: %T %v", value, value)
		return 0
	}
}
