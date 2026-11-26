package tasks

import (
	"context"
	"database/sql"
	"strconv"
	"strings"
	"testing"
	"time"

	coretask "simo/internal/core/task"
)

func t02CreateBatch(t *testing.T, mod *Module, ctx context.Context, tasks []BatchTaskInput) BatchCreateResult {
	t.Helper()
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Mode: "plan", Goal: "整理成一份调研报告", Tasks: tasks})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func t02MarkDone(t *testing.T, mod *Module, ctx context.Context, taskID string) {
	t.Helper()
	if err := mod.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE tasks SET status = ?, progress = 100, updated_at = ? WHERE id = ?`,
			coretask.StatusDone, time.Now().UnixMilli(), taskID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	mod.notifyDependents(ctx, taskID)
}

func t02Task(t *testing.T, mod *Module, ctx context.Context, taskID string) coretask.Task {
	t.Helper()
	task, err := mod.getTask(ctx, taskID)
	if err != nil {
		t.Fatal(err)
	}
	return task
}

// TestConvT02ProjectionAndGraph 覆盖六处投影：displayStatus、total、traceCount、
// 图节点 mode/progress/failReason/dependsOn，以及批次归属下的 404。
func TestConvT02ProjectionAndGraph(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
		{Key: "t1", Title: "调研", Mode: "plan", Steps: []string{"收集", "汇总"}},
		{Key: "t2", Title: "成稿", Mode: "plan", DependsOn: []string{"t1"}, JoinMode: "all"},
	})
	if len(result.Tasks) != 2 || result.Total != 2 {
		t.Fatalf("批量创建应返回 2 条，got %d/%d", len(result.Tasks), result.Total)
	}
	for _, task := range result.Tasks {
		if task.DisplayStatus != "pending" || task.Mode != "plan" {
			t.Fatalf("创建响应投影字段不对: %+v", task)
		}
	}

	total, err := mod.CountConvTasks(ctx, "s1", ListFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("total 应为筛选下真实总数 2，got %d", total)
	}
	page, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(page) != 1 || page[0].DisplayStatus == "" {
		t.Fatalf("列表首条应带 displayStatus，got %+v", page)
	}

	detail, err := mod.ConvTaskDetail(ctx, "s1", result.Tasks[0].ID, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Steps) != 2 || detail.Steps[0].TraceCount != 0 {
		t.Fatalf("步骤投影应含 traceCount，got %+v", detail.Steps)
	}
	stepID := detail.Steps[0].ID
	if _, err := mod.appendTrace(ctx, detail.Task, stepID, "observe", "fs.write", "403 permission_denied: 路径越界"); err != nil {
		t.Fatal(err)
	}
	detail, err = mod.ConvTaskDetail(ctx, "s1", result.Tasks[0].ID, 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Steps[0].TraceCount != 1 {
		t.Fatalf("traceCount 应统计该步骤轨迹，got %d", detail.Steps[0].TraceCount)
	}
	if detail.Task.DisplayStatus != "pending" {
		t.Fatalf("详情 task 应带 displayStatus，got %q", detail.Task.DisplayStatus)
	}

	graph, err := mod.TaskGraph(ctx, "s1", "")
	if err != nil {
		t.Fatal(err)
	}
	var downstream *GraphNode
	for i := range graph.Nodes {
		if graph.Nodes[i].ID == result.Tasks[1].ID {
			downstream = &graph.Nodes[i]
		}
	}
	if downstream == nil {
		t.Fatal("图中缺下游节点")
	}
	if downstream.Mode != "plan" || downstream.Progress != 0 || downstream.FailReason != "" ||
		len(downstream.DependsOn) != 1 || downstream.DependsOn[0] != result.Tasks[0].ID {
		t.Fatalf("图节点投影字段不对: %+v", *downstream)
	}
	if graph.Total != len(graph.Nodes) {
		t.Fatalf("图 total 应等于节点数，got %d/%d", graph.Total, len(graph.Nodes))
	}

	if _, err := mod.ConvTaskDetail(ctx, "s2", result.Tasks[0].ID, 10, 0); err == nil {
		t.Fatal("跨会话详情必须 404")
	} else if convErr, ok := err.(*ConvError); !ok || convErr.Status != 404 || convErr.Code != "task_not_found" {
		t.Fatalf("跨会话应为 task_not_found 404，got %v", err)
	}
}

// TestConvT02JoinModes 覆盖 all / any / each 三种依赖判定与 each 的触发计数。
func TestConvT02JoinModes(t *testing.T) {
	cases := []struct {
		name      string
		joinMode  string
		firstDone string // t1 完成后期望的 TriggerCount
		allDone   string
	}{
		{name: "all 需全部完成", joinMode: "all", firstDone: "0", allDone: "1"},
		{name: "any 首个完成即启动", joinMode: "any", firstDone: "1", allDone: "1"},
		{name: "each 逐个计数", joinMode: "each", firstDone: "1", allDone: "2"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mod, _, ctx := newConvTestModule(t)
			result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{
				{Key: "t1", Title: "前置甲", Mode: "plan", Steps: []string{"一步"}},
				{Key: "t3", Title: "前置乙", Mode: "plan", Steps: []string{"一步"}},
				{Key: "t2", Title: "等待方", Mode: "plan", DependsOn: []string{"t1", "t3"}, JoinMode: tc.joinMode,
					Steps: []string{"第一轮", "第二轮"}},
			})
			waitingID := result.Tasks[2].ID
			waiting := t02Task(t, mod, ctx, waitingID)
			if waiting.WaitingReason != WaitingDependency {
				t.Fatalf("依赖未完成时应等待，got %q", waiting.WaitingReason)
			}

			t02MarkDone(t, mod, ctx, result.Tasks[0].ID)
			afterFirst := t02Task(t, mod, ctx, waitingID)
			if got := strconv.Itoa(afterFirst.TriggerCount); got != tc.firstDone {
				t.Fatalf("首个前置完成后 triggerCount 期望 %s，got %s", tc.firstDone, got)
			}
			if tc.joinMode != "all" {
				if afterFirst.WaitingReason == WaitingDependency {
					t.Fatalf("%s 首个前置完成后不应再等依赖", tc.joinMode)
				}
			}
			t02MarkDone(t, mod, ctx, result.Tasks[1].ID)
			if tc.joinMode == "each" {
				// each 串行：第二个前置完成时上一轮还在跑，由完成钩子补下一轮。
				mod.retriggerEach(ctx, t02Task(t, mod, ctx, waitingID))
			}
			afterAll := t02Task(t, mod, ctx, waitingID)
			if got := strconv.Itoa(afterAll.TriggerCount); got != tc.allDone {
				t.Fatalf("全部前置完成后 triggerCount 期望 %s，got %s", tc.allDone, got)
			}
			if afterAll.WaitingReason == WaitingDependency {
				t.Fatal("全部前置完成后不应再等依赖")
			}
			if tc.joinMode == "each" {
				if afterAll.Attempt != 3 {
					t.Fatalf("each 每次触发 attempt 应加一，首次后 2、二次后 3，got %d", afterAll.Attempt)
				}
				for _, step := range afterAll.Steps {
					if step.Status != "pending" {
						t.Fatalf("each 每轮应重置步骤为 pending，got %+v", step)
					}
				}
			}
		})
	}
}

// TestConvT02SummaryCardBatch 覆盖批量汇总卡：只写 1 条消息、task_id=首任务、batch_id 关联。
func TestConvT02SummaryCardBatch(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	tasks := make([]BatchTaskInput, 0, 12)
	for i := 0; i < 12; i++ {
		tasks = append(tasks, BatchTaskInput{Key: "t" + strconv.Itoa(i+1), Title: "任务" + strconv.Itoa(i+1)})
	}
	result := t02CreateBatch(t, mod, ctx, tasks)
	if result.Total != 12 || len(result.Tasks) != 12 {
		t.Fatalf("应创建 12 条任务，got %d/%d", result.Total, len(result.Tasks))
	}
	var count int
	if err := mod.store.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE batch_id = ?`, result.BatchID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("批量应只写 1 条汇总卡，got %d", count)
	}
	var category, taskID, batchID, text string
	if err := mod.store.QueryRow(ctx, `SELECT category, task_id, batch_id, text FROM messages WHERE batch_id = ?`, result.BatchID).
		Scan(&category, &taskID, &batchID, &text); err != nil {
		t.Fatal(err)
	}
	if category != "task" || taskID != result.Tasks[0].ID || batchID != result.BatchID || text != "已创建 12 个任务" {
		t.Fatalf("汇总卡字段不对: category=%q taskId=%q batchId=%q text=%q", category, taskID, batchID, text)
	}
	firstPage, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{BatchID: result.BatchID, Limit: 10})
	if err != nil || len(firstPage) != 10 {
		t.Fatalf("前端首屏应取 10 条，got %d/%v", len(firstPage), err)
	}
	total, err := mod.CountConvTasks(ctx, "s1", ListFilter{BatchID: result.BatchID})
	if err != nil || total != 12 {
		t.Fatalf("批次总数应为 12，got %d/%v", total, err)
	}
}

func TestConvT02ErrorCodes(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	result := t02CreateBatch(t, mod, ctx, []BatchTaskInput{{Key: "t1", Title: "任务", Mode: "plan"}})
	taskID := result.Tasks[0].ID
	cases := []struct {
		name string
		run  func() error
		code string
		want int
	}{
		{name: "非法 batchId", want: 400, code: "invalid_argument", run: func() error {
			_, _, _, err := mod.ListConvTasks(ctx, "s1", ListFilter{BatchID: "batch-zz"})
			return err
		}},
		{name: "非法 scope", want: 400, code: "invalid_argument", run: func() error {
			_, _, _, err := mod.CancelScope(ctx, taskID, "bogus")
			return err
		}},
		{name: "非法 decision", want: 400, code: "invalid_argument", run: func() error {
			_, _, err := mod.ConfirmConv(ctx, taskID, ConfirmationInput{Decision: "bogus"})
			return err
		}},
		{name: "note 超长", want: 400, code: "invalid_argument", run: func() error {
			_, _, err := mod.ConfirmConv(ctx, taskID, ConfirmationInput{Decision: "confirm", Note: strings.Repeat("n", 501)})
			return err
		}},
		{name: "reason 超长", want: 400, code: "invalid_argument", run: func() error {
			_, _, err := mod.ResumeConv(ctx, taskID, strings.Repeat("r", 201))
			return err
		}},
		{name: "依赖环", want: 400, code: "invalid_task_dependency", run: func() error {
			_, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{
				{Key: "a", Title: "甲", DependsOn: []string{"b"}},
				{Key: "b", Title: "乙", DependsOn: []string{"a"}},
			}})
			return err
		}},
		{name: "重试非终态冲突", want: 409, code: "task_state_conflict", run: func() error {
			_, _, _, err := mod.RetryConv(ctx, taskID)
			return err
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.run()
			convErr, ok := err.(*ConvError)
			if !ok {
				t.Fatalf("应返回 ConvError，got %v", err)
			}
			if convErr.Status != tc.want || convErr.Code != tc.code {
				t.Fatalf("期望 %d %s，got %d %s", tc.want, tc.code, convErr.Status, convErr.Code)
			}
		})
	}
	// 游标失效返回空页而不是 404/400。
	empty, hasMore, next, err := mod.ListConvTasks(ctx, "s1", ListFilter{Limit: 10, Before: "garbage"})
	if err != nil || len(empty) != 0 || hasMore || next != "" {
		t.Fatalf("失效游标应返回空页，got %d/%v/%q/%v", len(empty), hasMore, next, err)
	}
}
