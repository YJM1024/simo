package tasks

import (
	"testing"
	"time"

	coretask "simo/internal/core/task"
)

// TestConvMockExecutorSyncsSteps 验证 mock 执行器推进步骤时，规范化 task_steps
// 会跟着更新：任务完成后详情里的每一步都是 done 且带起止时间，而不是永远 pending。
func TestConvMockExecutorSyncsSteps(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	mod.StartDelay = 5 * time.Millisecond
	mod.RunDelay = 30 * time.Millisecond
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{
		{Key: "a", Title: "同步步骤", Steps: []string{"读表", "汇总", "成稿"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	id := result.Tasks[0].ID
	deadline := time.Now().Add(3 * time.Second)
	for {
		task, err := mod.getTask(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if task.Status == coretask.StatusDone {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("mock 任务未在期限内完成，status=%s", task.Status)
		}
		time.Sleep(10 * time.Millisecond)
	}
	steps, err := mod.loadSteps(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if len(steps) != 3 {
		t.Fatalf("应保留 3 步，got %d", len(steps))
	}
	for i, step := range steps {
		if step.Status != "done" {
			t.Fatalf("第 %d 步应为 done，got %s", i+1, step.Status)
		}
		if step.StartedAt == 0 || step.FinishedAt == 0 {
			t.Fatalf("第 %d 步缺少起止时间: started=%d finished=%d", i+1, step.StartedAt, step.FinishedAt)
		}
	}
	detail, err := mod.ConvTaskDetail(ctx, "s1", id, 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(detail.Steps) != 3 || detail.Steps[2].Status != "done" {
		t.Fatalf("详情步骤应与 task_steps 一致: %+v", detail.Steps)
	}
}

// TestConvCancelKeepsDoneSteps 验证整链取消时已完成步骤保留、运行中步骤回 pending，
// 不出现 running 残留或半完成状态（mock 执行器写 task_steps 后该判据才可观测）。
func TestConvCancelKeepsDoneSteps(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	mod.StartDelay = 5 * time.Millisecond
	mod.RunDelay = 400 * time.Millisecond
	result, err := mod.CreateBatch(ctx, "s1", BatchCreateInput{Tasks: []BatchTaskInput{
		{Key: "a", Title: "取消保留步骤", Steps: []string{"一", "二", "三", "四"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	id := result.Tasks[0].ID
	deadline := time.Now().Add(3 * time.Second)
	for {
		steps, err := mod.loadSteps(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if len(steps) > 0 && steps[0].Status == "done" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("第 1 步未在期限内完成: %+v", steps)
		}
		time.Sleep(5 * time.Millisecond)
	}
	task, _, changed, err := mod.CancelScope(ctx, id, "chain")
	if err != nil {
		t.Fatal(err)
	}
	if !changed || task.Status != coretask.StatusCancelled {
		t.Fatalf("取消应生效: changed=%v status=%s", changed, task.Status)
	}
	steps, err := mod.loadSteps(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if steps[0].Status != "done" {
		t.Fatalf("已完成步骤应保留 done，got %+v", steps)
	}
	for i, step := range steps[1:] {
		if step.Status != "pending" {
			t.Fatalf("未完成步骤 %d 应回 pending，got %s", i+2, step.Status)
		}
		if step.StartedAt != 0 {
			t.Fatalf("未完成步骤 %d 的 started_at 应清零，got %d", i+2, step.StartedAt)
		}
	}
}
