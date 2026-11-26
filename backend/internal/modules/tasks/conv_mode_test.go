package tasks

import (
	"errors"
	"strings"
	"testing"
)

// TestConvCreateBatchAcceptsContractModes 覆盖契约三种模式（plan/react/explore）都能创建任务，
// 并验证每张任务卡片消息落库（role=agent、category=task、task_id 指向首个任务）。
func TestConvCreateBatchAcceptsContractModes(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	for _, mode := range []string{"plan", "react", "explore"} {
		t.Run(mode, func(t *testing.T) {
			res, err := mod.CreateBatch(ctx, "s-mode", BatchCreateInput{
				Mode:  mode,
				Goal:  "验证 " + mode + " 模式可以创建",
				Tasks: []BatchTaskInput{{Key: "t1", Title: "任务-" + mode, Mode: mode}},
			})
			if err != nil {
				t.Fatalf("mode=%s 创建失败: %v", mode, err)
			}
			if len(res.Tasks) != 1 {
				t.Fatalf("期望 1 个任务，实际 %d", len(res.Tasks))
			}
			if res.Tasks[0].Mode != mode {
				t.Fatalf("任务 mode 期望 %q，实际 %q", mode, res.Tasks[0].Mode)
			}
			if res.MessageID == "" {
				t.Fatal("任务创建后没有卡片消息 ID")
			}
			var role, category, taskID string
			if err := mod.store.QueryRow(ctx,
				`SELECT role, category, task_id FROM messages WHERE id = ?`, res.MessageID).
				Scan(&role, &category, &taskID); err != nil {
				t.Fatalf("读取任务卡片消息失败: %v", err)
			}
			if role != "agent" {
				t.Fatalf("卡片 role 期望 agent，实际 %q", role)
			}
			if category != "task" {
				t.Fatalf("卡片 category 期望 task，实际 %q", category)
			}
			if taskID == "" || taskID != res.Tasks[0].ID {
				t.Fatalf("卡片 task_id 期望 %q，实际 %q", res.Tasks[0].ID, taskID)
			}
		})
	}
}

// TestConvCreateBatchRejectsUnknownMode 覆盖未知模式的 400 与错误信息中的允许值列表。
func TestConvCreateBatchRejectsUnknownMode(t *testing.T) {
	mod, _, ctx := newConvTestModule(t)
	_, err := mod.CreateBatch(ctx, "s-mode", BatchCreateInput{
		Mode:  "execute",
		Tasks: []BatchTaskInput{{Key: "t1", Title: "未知模式任务"}},
	})
	var convErr *ConvError
	if !errors.As(err, &convErr) {
		t.Fatalf("期望 *ConvError，实际 %T: %v", err, err)
	}
	if convErr.Status != 400 {
		t.Fatalf("HTTP 状态期望 400，实际 %d", convErr.Status)
	}
	if convErr.Code != "invalid_task_mode" {
		t.Fatalf("错误码期望 invalid_task_mode，实际 %q", convErr.Code)
	}
	for _, want := range []string{"plan", "react", "explore"} {
		if !strings.Contains(convErr.Message, want) {
			t.Fatalf("错误信息应列出允许值 %q，实际 %q", want, convErr.Message)
		}
	}
}
