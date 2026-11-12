package chat

import (
	"testing"

	coretask "simo/internal/core/task"
)

func TestBuildTaskRuntimeContractNoCheckpoint(t *testing.T) {
	now := int64(1000)
	task := coretask.Task{
		ID: "task-runtime", SessionID: "main", Title: "契约任务",
		Status: coretask.StatusRunning, Progress: 42, Attempt: 2,
		CreatedAt: now - 500, UpdatedAt: now,
		Steps: []coretask.Step{
			{ID: "collect", PhaseID: "plan", Title: "收集信息", Status: "done"},
			{ID: "draft", PhaseID: "execute", Title: "产出草稿", Status: "running"},
			{ID: "finalize", PhaseID: "verify", Title: "整理结果", Status: "pending"},
		},
	}
	runtime := buildTaskRuntime(task, map[string]any{"id": "", "at": int64(0), "reason": ""}, now)
	if runtime["status"] != coretask.StatusRunning || runtime["progress"] != 42 || runtime["attempt"] != 2 {
		t.Fatalf("基础字段错误: %+v", runtime)
	}
	if runtime["stepIndex"] != 2 || runtime["totalSteps"] != 3 {
		t.Fatalf("stepIndex/totalSteps = %v/%v", runtime["stepIndex"], runtime["totalSteps"])
	}
	step, ok := runtime["step"].(map[string]any)
	if !ok || step["id"] != "draft" || step["status"] != "running" {
		t.Fatalf("当前 step 错误: %+v", runtime["step"])
	}
	summary, ok := runtime["stepsSummary"].([]map[string]any)
	if !ok || len(summary) != 3 || summary[2]["id"] != "finalize" {
		t.Fatalf("stepsSummary 错误: %+v", runtime["stepsSummary"])
	}
	if runtime["startedAt"] != task.CreatedAt || runtime["lastProgressAt"] != task.UpdatedAt {
		t.Fatalf("时间字段错误: %+v", runtime)
	}
	if runtime["lastHeartbeatAt"] != task.UpdatedAt {
		t.Fatalf("无 checkpoint 时 lastHeartbeatAt 应回退到 UpdatedAt: %+v", runtime)
	}
	if runtime["nextAction"] == "继续执行当前任务" {
		t.Fatalf("nextAction 应能从当前 step 推导: %+v", runtime["nextAction"])
	}
}

func TestBuildTaskRuntimeContractDone(t *testing.T) {
	task := coretask.Task{
		ID: "task-done", SessionID: "main", Title: "完成任务",
		Status: coretask.StatusDone, Progress: 100, Attempt: 1,
		CreatedAt: 100, UpdatedAt: 200,
		Steps: []coretask.Step{
			{ID: "collect", PhaseID: "plan", Title: "收集信息", Status: "done"},
			{ID: "draft", PhaseID: "execute", Title: "产出草稿", Status: "done"},
		},
	}
	runtime := buildTaskRuntime(task, map[string]any{"id": "", "at": int64(0), "reason": ""}, 300)
	if runtime["status"] != coretask.StatusDone || runtime["nextAction"] != "已完成" {
		t.Fatalf("done runtime = %+v", runtime)
	}
	if runtime["stepIndex"] != 2 || runtime["totalSteps"] != 2 {
		t.Fatalf("done stepIndex = %v/%v", runtime["stepIndex"], runtime["totalSteps"])
	}
	step, ok := runtime["step"].(map[string]any)
	if !ok || step["id"] != "draft" || step["status"] != "done" {
		t.Fatalf("done step = %+v", runtime["step"])
	}
}
