package tasks

import (
	"encoding/json"
	"strconv"
	"testing"

	"simo/internal/core/eventlog"
)

// message.created 是实时渲染汇总卡的数据来源：payload 必须带 batchId 与 taskCount，
// 与 chat 消息列表 DTO 的字段口径一致（§17.5.2、CT-CONV-051/052）。
func TestConvMessageCreatedCarriesTaskCount(t *testing.T) {
	cases := []struct {
		name  string
		count int
	}{{name: "批量12条", count: 12}, {name: "单任务", count: 1}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mod, logger, ctx := newConvTestModule(t)
			before, _ := logger.LatestID(ctx)
			inputs := make([]BatchTaskInput, 0, tc.count)
			for i := 0; i < tc.count; i++ {
				inputs = append(inputs, BatchTaskInput{Key: "t" + strconv.Itoa(i+1), Title: "任务" + strconv.Itoa(i+1)})
			}
			result := t02CreateBatch(t, mod, ctx, inputs)

			// 数据来源：task_batches.task_count，chat 列表按 batch_id 批量取这一列。
			var stored int
			if err := mod.store.QueryRow(ctx, `SELECT task_count FROM task_batches WHERE id = ?`, result.BatchID).Scan(&stored); err != nil {
				t.Fatal(err)
			}
			if stored != tc.count {
				t.Fatalf("task_batches.task_count 期望 %d，got %d", tc.count, stored)
			}

			events, err := logger.Replay(ctx, before)
			if err != nil {
				t.Fatal(err)
			}
			var payload struct {
				TaskCount int    `json:"taskCount"`
				BatchID   string `json:"batchId"`
				TaskID    string `json:"taskId"`
				Category  string `json:"category"`
			}
			found := false
			for _, ev := range events {
				if ev.Type != eventlog.TypeMessageCreated {
					continue
				}
				if err := json.Unmarshal(ev.Payload, &payload); err != nil {
					t.Fatalf("message.created payload 解析失败: %v", err)
				}
				found = true
			}
			if !found {
				t.Fatal("未收到 message.created 事件")
			}
			if payload.TaskCount != tc.count {
				t.Fatalf("message.created taskCount 期望 %d，got %d（payload 缺字段时前端永远走单卡分支）",
					tc.count, payload.TaskCount)
			}
			if payload.BatchID != result.BatchID || payload.TaskID != result.Tasks[0].ID || payload.Category != "task" {
				t.Fatalf("message.created 批次字段不对: batchId=%q taskId=%q category=%q",
					payload.BatchID, payload.TaskID, payload.Category)
			}
		})
	}
}
