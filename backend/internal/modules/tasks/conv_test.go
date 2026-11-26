package tasks

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
	"simo/internal/platform/workspace"
)

func newConvTestModule(t *testing.T) (*Module, *eventlog.Logger, context.Context) {
	t.Helper()
	home := t.TempDir()
	db, err := sqlite.Open(filepath.Join(home, "simo.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()
	logger := eventlog.New(store.New(db))
	policy, err := workspace.New(home, filepath.Join(home, "workspace"), filepath.Join(home, "artifacts"))
	if err != nil {
		t.Fatal(err)
	}
	mod := New(store.New(db), logger, platformlog.Discard(), policy)
	mod.StartDelay = 30 * time.Minute // 测试里不让 mock 执行器推进，只验证接口语义
	mod.RunDelay = 30 * time.Minute
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, "tasks", mod.Migrations()); err != nil {
		t.Fatal(err)
	}
	// 卡片消息落在 chat 域的 messages 表；单测只建这张表，不引入整个 chat 模块。
	if err := db.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL,
		role TEXT NOT NULL,
		text TEXT NOT NULL,
		at INTEGER NOT NULL,
		status TEXT NOT NULL,
		task_id TEXT NOT NULL DEFAULT '',
		workflow_id TEXT NOT NULL DEFAULT '',
		tool TEXT NOT NULL DEFAULT '',
		approval_id TEXT NOT NULL DEFAULT '',
		category TEXT NOT NULL DEFAULT '',
		reply_to_id TEXT NOT NULL DEFAULT '',
		finished_at INTEGER NOT NULL DEFAULT 0,
		internal INTEGER NOT NULL DEFAULT 0,
		batch_id TEXT NOT NULL DEFAULT ''
	)`); err != nil {
			return err
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := mod.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = mod.Stop(context.Background()) })
	return mod, logger, ctx
}

func TestConvStateMachineTransitions(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{coretask.StatusPending, coretask.StatusQueued, true},
		{coretask.StatusPending, coretask.StatusCancelled, true},
		{coretask.StatusQueued, coretask.StatusRunning, true},
		{coretask.StatusQueued, coretask.StatusCancelled, true},
		{coretask.StatusRunning, coretask.StatusRunning, true},
		{coretask.StatusRunning, coretask.StatusDone, true},
		{coretask.StatusRunning, coretask.StatusFailed, true},
		{coretask.StatusRunning, coretask.StatusCancelled, true},
		{coretask.StatusFailed, coretask.StatusQueued, true},
		{coretask.StatusCancelled, coretask.StatusQueued, true},
		{coretask.StatusInterrupted, coretask.StatusQueued, true},
		{coretask.StatusDone, coretask.StatusQueued, false},
		{coretask.StatusFailed, coretask.StatusDone, false},
		{coretask.StatusPending, coretask.StatusRunning, false},
	}
	for _, tc := range cases {
		if got := canTransition(tc.from, tc.to); got != tc.ok {
			t.Fatalf("canTransition(%s,%s)=%v want %v", tc.from, tc.to, got, tc.ok)
		}
	}
	if displayStatus(coretask.StatusQueued) != "pending" || displayStatus(coretask.StatusBlocked) != "pending" {
		t.Fatal("queued/blocked 应映射为 pending")
	}
	if displayStatus(coretask.StatusCancelled) != "failed" || displayStatus(coretask.StatusInterrupted) != "failed" {
		t.Fatal("cancelled/interrupted 应映射为 failed")
	}
}

func TestConvValidation(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	_, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Mode: "unknown", Tasks: []BatchTaskInput{{Title: "a"}}})
	if convErr, ok := err.(*ConvError); !ok || convErr.Code != "invalid_task_mode" {
		t.Fatalf("非法 mode 应返回 invalid_task_mode，got %v", err)
	}
	tooMany := make([]BatchTaskInput, 13)
	for i := range tooMany {
		tooMany[i] = BatchTaskInput{Title: "t"}
	}
	_, err = mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: tooMany})
	if convErr, ok := err.(*ConvError); !ok || convErr.Code != "task_batch_too_large" {
		t.Fatalf("超批量应返回 task_batch_too_large，got %v", err)
	}
	_, err = mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{
		{Key: "a", Title: "a", DependsOn: []string{"missing"}},
	}})
	if convErr, ok := err.(*ConvError); !ok || convErr.Code != "invalid_task_dependency" {
		t.Fatalf("依赖越界应返回 invalid_task_dependency，got %v", err)
	}
	long := make([]string, 21)
	for i := range long {
		long[i] = "x"
	}
	_, err = mod.CreateBatch(ctx, "s1", BatchCreateInput{Inputs: long, Tasks: []BatchTaskInput{{Title: "a"}}})
	if convErr, ok := err.(*ConvError); !ok || convErr.Code != "task_context_too_large" {
		t.Fatalf("上下文过大应返回 task_context_too_large，got %v", err)
	}
}

func TestConvCreateBatchCardAndEvents(t *testing.T) {
	mod, logger, ctx := newConvTestModule(t)
	before, _ := logger.LatestID(ctx)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Mode: "plan", Goal: "写季度总结",
		Tasks: []BatchTaskInput{
			{Key: "a", Title: "收集数据", Steps: []string{"读表", "汇总"}},
			{Key: "b", Title: "成稿", DependsOn: []string{"a"}, JoinMode: "all"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !isBatchID(result.BatchID) {
		t.Fatalf("batchId 格式非法: %s", result.BatchID)
	}
	if result.Total != 2 || len(result.Tasks) != 2 {
		t.Fatalf("应创建 2 个任务，got %d", result.Total)
	}
	if result.Tasks[0].Status != coretask.StatusPending {
		t.Fatalf("任务初始应为 pending，got %s", result.Tasks[0].Status)
	}
	if result.Tasks[0].BatchID != result.BatchID || result.Tasks[0].Mode != "plan" {
		t.Fatal("批量字段未落库")
	}
	// 批量只写 1 条汇总卡。
	var count int
	var role, category, taskID, batchID, text string
	if err := mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE session_id='s1'`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("批量应只写 1 条卡片，got %d", count)
	}
	if err := mod.store.QueryRow(ctx, `SELECT role, category, task_id, batch_id, text FROM messages WHERE session_id='s1'`).
		Scan(&role, &category, &taskID, &batchID, &text); err != nil {
		t.Fatal(err)
	}
	if role != "agent" || category != "task" || taskID != result.Tasks[0].ID || batchID != result.BatchID {
		t.Fatalf("卡片字段不对: role=%s category=%s task=%s batch=%s", role, category, taskID, batchID)
	}
	if text != "已创建 2 个任务" {
		t.Fatalf("汇总卡文案不对: %s", text)
	}
	// 事件：先 2 条 task.created，再 message.created。
	events, err := logger.Replay(ctx, before)
	if err != nil {
		t.Fatal(err)
	}
	created, messageCreated, stepEvents := 0, 0, 0
	seenMessage := false
	for _, ev := range events {
		switch ev.Type {
		case eventlog.TypeTaskCreated:
			if seenMessage {
				t.Fatal("task.created 必须在 message.created 之前")
			}
			created++
		case eventlog.TypeTaskStep:
			stepEvents++
		case eventlog.TypeMessageCreated:
			messageCreated++
			seenMessage = true
		}
	}
	if created != 2 || messageCreated != 1 {
		t.Fatalf("事件数量不对: task.created=%d message.created=%d", created, messageCreated)
	}
	if stepEvents != 5 {
		t.Fatalf("2 步 + 默认 3 步应各发一条 task.step，got %d", stepEvents)
	}
	// 步骤落 task_steps。
	steps, err := mod.loadSteps(ctx, result.Tasks[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(steps) != 2 || steps[0].Title != "读表" || steps[1].Seq != 2 {
		t.Fatalf("步骤未按 plan 落库: %+v", steps)
	}
	// 依赖未满足的任务进入 dependency 等待。
	dependent, err := mod.getTask(ctx, result.Tasks[1].ID)
	if err != nil {
		t.Fatal(err)
	}
	if dependent.WaitingReason != WaitingDependency || dependent.WaitingSince == 0 {
		t.Fatalf("下游应进入 dependency 等待: %+v", dependent)
	}
}

func TestConvCreateIdempotent(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	input := BatchCreateInput{ClientMutationID: "m-1", Tasks: []BatchTaskInput{{Title: "单任务"}}}
	first, err := mod.CreateBatch(ctx, "s1", input)
	if err != nil {
		t.Fatal(err)
	}
	second, err := mod.CreateBatch(ctx, "s1", input)
	if err != nil {
		t.Fatal(err)
	}
	if !second.Idempotent || second.BatchID != first.BatchID {
		t.Fatalf("同一 clientMutationId 应幂等，got %+v", second)
	}
	var count int
	_ = mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM tasks WHERE session_id='s1'`).Scan(&count)
	if count != 1 {
		t.Fatalf("幂等重放不应重复建任务，got %d", count)
	}
}

func TestConvListFilterAndCursor(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	for i := 0; i < 3; i++ {
		if _, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
			Tasks: []BatchTaskInput{{Title: "任务" + string(rune('A'+i))}},
		}); err != nil {
			t.Fatal(err)
		}
	}
	tasks, hasMore, nextBefore, err := mod.ListConvTasks(ctx, "s1", ListFilter{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if len(tasks) != 2 || !hasMore || nextBefore == "" {
		t.Fatalf("首页应有 2 条且 hasMore，got %d/%v/%s", len(tasks), hasMore, nextBefore)
	}
	page2, hasMore2, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{Limit: 2, Before: nextBefore})
	if err != nil {
		t.Fatal(err)
	}
	if len(page2) != 1 || hasMore2 {
		t.Fatalf("第二页应有 1 条且无更多，got %d/%v", len(page2), hasMore2)
	}
	if _, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{Limit: 101}); err == nil {
		t.Fatal("limit 超界应报错")
	}
	if _, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{Status: []string{"bogus"}}); err == nil {
		t.Fatal("非法 status 应报错")
	}
	if _, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{BatchID: "batch-zz"}); err == nil {
		t.Fatal("非法 batchId 应报错")
	}
}

func TestConvDetailCrossSessionAndContext(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Goal: "目标", Tasks: []BatchTaskInput{{Title: "任务", Inputs: []string{"输入"}, Constraints: []string{"约束"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	taskID := result.Tasks[0].ID
	detail, err := mod.ConvTaskDetail(ctx, "s1", taskID, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Context["historyCount"].(int) != 0 {
		t.Fatal("context.historyCount 必须恒为 0")
	}
	if detail.Budget["maxSteps"] == nil {
		t.Fatal("budget 缺省值缺失")
	}
	if _, err := mod.ConvTaskDetail(ctx, "s2", taskID, 10, 0); err == nil {
		t.Fatal("跨会话必须 404")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 404 || convErr.Code != "task_not_found" {
		t.Fatalf("跨会话错误应为 task_not_found 404，got %v", err)
	}
	trace, err := mod.recordPermissionDenied(ctx, detail.Task, "", "fs.write", "/etc/passwd", "路径越界")
	if err != nil {
		t.Fatal(err)
	}
	if trace.Category != "observe" || len(trace.Text) < 4 || trace.Text[:4] != "403 " {
		t.Fatalf("403 轨迹格式不对: %+v", trace)
	}
	detail2, err := mod.ConvTaskDetail(ctx, "s1", taskID, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail2.Traces) != 1 || detail2.Traces[0].ID != trace.ID {
		t.Fatalf("轨迹未返回: %+v", detail2.Traces)
	}
}

func TestConvCancelScopeAndTerminal(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{
			{Key: "a", Title: "上游"},
			{Key: "b", Title: "下游", DependsOn: []string{"a"}},
			{Key: "c", Title: "链尾", DependsOn: []string{"b"}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	upstream, downstream, tail := result.Tasks[0].ID, result.Tasks[1].ID, result.Tasks[2].ID
	// ct-conv-535：chain 只取消目标自身，未启动的下游保持 pending 等依赖。
	task, cancelled, changed, err := mod.CancelScope(ctx, upstream, "chain")
	if err != nil {
		t.Fatal(err)
	}
	if !changed || len(cancelled) != 1 || cancelled[0] != upstream || task.Status != coretask.StatusCancelled {
		t.Fatalf("chain 应只取消目标自身，got %v/%v/%s", changed, cancelled, task.Status)
	}
	for _, id := range []string{downstream, tail} {
		got, _ := mod.getTask(ctx, id)
		if got.Status != coretask.StatusPending || got.WaitingReason != WaitingDependency {
			t.Fatalf("%s 应保持 pending 等依赖，got %s/%s", id, got.Status, got.WaitingReason)
		}
	}
	// 幂等：对已 cancelled 的目标再次取消返回 changed=false，任务字段不变。
	again, againCancelled, changed2, err := mod.CancelScope(ctx, upstream, "self")
	if err != nil || changed2 || len(againCancelled) != 0 || again.Status != coretask.StatusCancelled {
		t.Fatalf("终态取消应返回 changed=false: %v/%v/%v/%s", err, changed2, againCancelled, again.Status)
	}
	// 上游取消后可经重试转 queued，下游继续等待。
	if retried, _, _, err := mod.RetryConv(ctx, upstream); err != nil || retried.Status != coretask.StatusQueued {
		t.Fatalf("取消的上游应可重试: %v/%s", err, retried.Status)
	}
}

func TestConvRetryRules(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{{Title: "任务"}}})
	if err != nil {
		t.Fatal(err)
	}
	taskID := result.Tasks[0].ID
	if _, _, _, err := mod.RetryConv(ctx, taskID); err == nil {
		t.Fatal("pending/queued 任务重试应 409")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Code != "task_state_conflict" {
		t.Fatalf("重试冲突码不对: %v", err)
	}
	// 取消后允许重试，attempt+1，步骤重置 pending。
	stepsBefore, _ := mod.loadSteps(ctx, taskID)
	for i := range stepsBefore {
		stepsBefore[i].Status = "done"
	}
	_ = mod.saveSteps(ctx, taskID, stepsBefore)
	if _, _, _, err := mod.CancelScope(ctx, taskID, "self"); err != nil {
		t.Fatal(err)
	}
	task, attempt, reset, err := mod.RetryConv(ctx, taskID)
	if err != nil {
		t.Fatal(err)
	}
	if attempt != 2 || task.Attempt != 2 {
		t.Fatalf("attempt 应 +1，got %d/%d", attempt, task.Attempt)
	}
	if reset != len(stepsBefore) {
		t.Fatalf("resetStepCount 应为 %d，got %d", len(stepsBefore), reset)
	}
	steps, _ := mod.loadSteps(ctx, taskID)
	for _, step := range steps {
		if step.Status != "pending" {
			t.Fatalf("重试后步骤应重置 pending，got %s", step.Status)
		}
	}
	if task.Status != coretask.StatusQueued {
		t.Fatalf("重试后应为 queued，got %s", task.Status)
	}
}

func TestConvConfirmationAndResume(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{{Title: "任务", Steps: []string{"第一步"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	taskID := result.Tasks[0].ID
	// 造一个 confirmation 等待：running + 第一步 running。
	task, err := mod.getTask(ctx, taskID)
	if err != nil {
		t.Fatal(err)
	}
	task.Status = coretask.StatusRunning
	task.WaitingReason = WaitingConfirmation
	task.WaitingSince = time.Now().UnixMilli()
	_ = mod.saveTask(ctx, task)
	steps, _ := mod.loadSteps(ctx, taskID)
	steps[0].Status = "running"
	_ = mod.saveSteps(ctx, taskID, steps)

	// 非 confirmation 任务调用确认 → 409。
	other, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{{Title: "另一个"}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := mod.ConfirmConv(ctx, other.Tasks[0].ID, ConfirmationInput{Decision: "confirm"}); err == nil {
		t.Fatal("非 confirmation 等待应 409")
	}
	// confirm 清等待。
	updated, stepID, err := mod.ConfirmConv(ctx, taskID, ConfirmationInput{Decision: "confirm"})
	if err != nil {
		t.Fatal(err)
	}
	if updated.WaitingReason != "" || updated.WaitingSince != 0 || stepID != steps[0].ID {
		t.Fatalf("confirm 未解除等待: %+v", updated)
	}
	// resume 只接受 resource。
	if _, _, err := mod.ResumeConv(ctx, taskID, "重试"); err == nil {
		t.Fatal("非 resource 等待应 409")
	}
	resourceTask, _ := mod.getTask(ctx, taskID)
	resourceTask.WaitingReason = WaitingResource
	resourceTask.WaitingSince = time.Now().UnixMilli()
	_ = mod.saveTask(ctx, resourceTask)
	resumed, resumedStep, err := mod.ResumeConv(ctx, taskID, "预算已确认")
	if err != nil {
		t.Fatal(err)
	}
	if resumed.WaitingReason != "" || resumed.Status != coretask.StatusRunning || resumedStep == "" {
		t.Fatalf("resume 未解除等待: %+v step=%s", resumed, resumedStep)
	}

	// decision=cancel：当前步 failed、任务 failed、failReason 用户取消。
	cancelResult, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{{Title: "待取消"}}})
	if err != nil {
		t.Fatal(err)
	}
	cancelID := cancelResult.Tasks[0].ID
	ct, _ := mod.getTask(ctx, cancelID)
	ct.Status = coretask.StatusRunning
	ct.WaitingReason = WaitingConfirmation
	ct.WaitingSince = time.Now().UnixMilli()
	_ = mod.saveTask(ctx, ct)
	csteps, _ := mod.loadSteps(ctx, cancelID)
	csteps[0].Status = "running"
	_ = mod.saveSteps(ctx, cancelID, csteps)
	failed, failedStep, err := mod.ConfirmConv(ctx, cancelID, ConfirmationInput{Decision: "cancel", Note: "不要了"})
	if err != nil {
		t.Fatal(err)
	}
	if failed.Status != coretask.StatusFailed || failed.FailReason != "用户取消" || failedStep != csteps[0].ID {
		t.Fatalf("cancel 收口不对: %+v", failed)
	}
	afterSteps, _ := mod.loadSteps(ctx, cancelID)
	if afterSteps[0].Status != "failed" || afterSteps[0].FailReason != "用户取消" {
		t.Fatalf("当前步应 failed: %+v", afterSteps[0])
	}
}

func TestConvGraph(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{
			{Key: "a", Title: "A"},
			{Key: "b", Title: "B", DependsOn: []string{"a"}},
			{Key: "c", Title: "C", DependsOn: []string{"b"}, JoinMode: "any"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	graph, err := mod.TaskGraph(ctx, "s1", result.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	if graph.Total != 3 || len(graph.Edges) != 2 || len(graph.Layers) != 3 {
		t.Fatalf("图不对: total=%d edges=%d layers=%d", graph.Total, len(graph.Edges), len(graph.Layers))
	}
	for i, layer := range graph.Layers {
		if layer.Index != i || len(layer.NodeIDs) == 0 {
			t.Fatalf("层不对: %+v", graph.Layers)
		}
	}
	foundAny := false
	for _, edge := range graph.Edges {
		if edge.JoinMode == "any" || edge.JoinMode == "all" || edge.Style == "solid" {
			foundAny = true
		}
	}
	if !foundAny {
		t.Fatal("边缺失 joinMode/style")
	}
	// 上游失败后边应为 dashed。
	upstream, _ := mod.getTask(ctx, result.Tasks[0].ID)
	upstream.Status = coretask.StatusFailed
	_ = mod.saveTask(ctx, upstream)
	graph2, err := mod.TaskGraph(ctx, "s1", result.BatchID)
	if err != nil {
		t.Fatal(err)
	}
	dashed := 0
	for _, edge := range graph2.Edges {
		if edge.Style == "dashed" {
			dashed++
		}
	}
	if dashed != 1 {
		t.Fatalf("上游失败的边应为 dashed，got %d", dashed)
	}
}

func TestConvDeliverablesGrouping(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{{Key: "a", Title: "任务 A"}, {Key: "b", Title: "任务 B"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UnixMilli()
	for i, item := range []struct {
		name string
		mime string
		kind string
	}{
		{"report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", coretask.ArtifactDeliveryKindUser},
		{"chart.png", "image/png", coretask.ArtifactDeliveryKindUser},
		{"internal.md", "text/markdown", coretask.ArtifactDeliveryKindInternal},
	} {
		taskID := result.Tasks[0].ID
		if i == 2 {
			taskID = result.Tasks[1].ID
		}
		artifactID := "art-x" + string(rune('a'+i))
		if err := mod.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `INSERT INTO task_artifacts(
				id, task_id, name, rel_path, mime, size, created_at, delivery_kind, storage_scope, workspace_rel_path)
				VALUES (?, ?, ?, '', ?, 10, ?, ?, 'workspace', '')`,
				artifactID, taskID, item.name, item.mime, now, item.kind)
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	deliverables, err := mod.SessionDeliverables(ctx, "s1", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if deliverables.Total != 2 || deliverables.FileCount != 2 {
		t.Fatalf("两个任务都应成组，共 2 个文件，got %d/%d", deliverables.Total, deliverables.FileCount)
	}
	var aGroup, bGroup *DeliverableGroup
	for i := range deliverables.Groups {
		switch deliverables.Groups[i].TaskID {
		case result.Tasks[0].ID:
			aGroup = &deliverables.Groups[i]
		case result.Tasks[1].ID:
			bGroup = &deliverables.Groups[i]
		}
	}
	if aGroup == nil || len(aGroup.Files) != 2 || aGroup.Count != 2 {
		t.Fatalf("任务 A 分组不对: %+v", aGroup)
	}
	if bGroup == nil || len(bGroup.Files) != 0 || bGroup.Count != 0 || bGroup.Files == nil {
		t.Fatalf("任务 B 只有 internal 产物，应为空组: %+v", bGroup)
	}
	badges := map[string]bool{}
	for _, file := range aGroup.Files {
		badges[file.TypeBadge] = true
		if file.DownloadURL == "" || file.PreviewURL == "" {
			t.Fatal("交付物缺下载/预览 URL")
		}
	}
	if !badges["doc"] || !badges["image"] {
		t.Fatalf("typeBadge 不对: %v", badges)
	}
}

// 失败任务没有 user_delivery 产物，也必须出现在分组里，给出 files=[]、count=0 的空组。
func TestConvDeliverablesIncludesFailedTask(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{{Key: "ok", Title: "成功任务"}, {Key: "bad", Title: "失败任务"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	var okTask, failedTask coretask.Task
	for _, task := range result.Tasks {
		if task.Title == "成功任务" {
			okTask = task
		} else {
			failedTask = task
		}
	}
	if err := mod.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE tasks SET status='failed', fail_reason='执行器异常: mock' WHERE id = ?`, failedTask.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO task_artifacts(
			id, task_id, name, rel_path, mime, size, created_at, delivery_kind, storage_scope, workspace_rel_path)
			VALUES ('art-ok', ?, 'result.md', '', 'text/markdown', 42, ?, 'user_delivery', 'workspace', '')`,
			okTask.ID, time.Now().UnixMilli())
		return err
	}); err != nil {
		t.Fatal(err)
	}
	deliverables, err := mod.SessionDeliverables(ctx, "s1", "", 10)
	if err != nil {
		t.Fatal(err)
	}
	if deliverables.Total != 2 {
		t.Fatalf("成功与失败任务都应成组，got %d", deliverables.Total)
	}
	var okGroup, failedGroup *DeliverableGroup
	for i := range deliverables.Groups {
		switch deliverables.Groups[i].TaskID {
		case okTask.ID:
			okGroup = &deliverables.Groups[i]
		case failedTask.ID:
			failedGroup = &deliverables.Groups[i]
		}
	}
	if okGroup == nil || okGroup.Count != 1 || len(okGroup.Files) != 1 || okGroup.TaskStatus != "pending" {
		t.Fatalf("成功组不对: %+v", okGroup)
	}
	if failedGroup == nil {
		t.Fatal("失败任务未出现在交付物分组")
	}
	if failedGroup.Files == nil || len(failedGroup.Files) != 0 || failedGroup.Count != 0 {
		t.Fatalf("失败任务应为空组 files=[] count=0, got %+v", failedGroup)
	}
	if failedGroup.TaskStatus != coretask.StatusFailed {
		t.Fatalf("失败组 taskStatus 应为 failed, got %q", failedGroup.TaskStatus)
	}
}

func TestConvReminderOnce(t *testing.T) {
	mod, logger, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{
		Tasks: []BatchTaskInput{{Title: "带时限", DeadlineAt: time.Now().Add(-time.Minute).UnixMilli()}},
	})
	if err != nil {
		t.Fatal(err)
	}
	before, _ := logger.LatestID(ctx)
	if emitted := mod.scanDeadlines(ctx); emitted != 1 {
		t.Fatalf("首次应发 1 条提醒，got %d", emitted)
	}
	if emitted := mod.scanDeadlines(ctx); emitted != 0 {
		t.Fatalf("同一任务最多 1 条提醒，got %d", emitted)
	}
	events, err := logger.Replay(ctx, before)
	if err != nil {
		t.Fatal(err)
	}
	reminders := 0
	for _, ev := range events {
		if ev.Type == eventlog.TypeTaskReminder {
			reminders++
		}
	}
	if reminders != 1 {
		t.Fatalf("task.reminder 应只有 1 条，got %d", reminders)
	}
	task, _ := mod.getTask(ctx, result.Tasks[0].ID)
	if task.DeadlineRemindedAt == 0 {
		t.Fatal("应写 deadline_reminded_at")
	}
}

func TestConvTransitionConflict(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{{Title: "任务"}}})
	if err != nil {
		t.Fatal(err)
	}
	taskID := result.Tasks[0].ID
	task, _ := mod.getTask(ctx, taskID)
	task.Status = coretask.StatusDone
	_ = mod.saveTask(ctx, task)
	if _, err := mod.Transition(ctx, taskID, coretask.StatusQueued, nil); err == nil {
		t.Fatal("done 不能迁移回 queued")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Code != "task_state_conflict" {
		t.Fatalf("非法迁移错误码不对: %v", err)
	}
	if _, err := mod.Transition(ctx, "task-missing", coretask.StatusQueued, nil); err == nil {
		t.Fatal("不存在的任务应 404")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 404 {
		t.Fatalf("不存在任务应 404: %v", err)
	}
}
