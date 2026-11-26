package chat

import (
	"context"
	"io"
	"log/slog"
	"testing"

	coretask "simo/internal/core/task"
	"simo/internal/platform/llm"
)

func TestTaskPermissionDeniedFromToolResult(t *testing.T) {
	call := llm.ToolCall{Function: llm.FunctionCall{
		Name: "write_file", Arguments: `{"file_path":"../etc/passwd"}`,
	}}
	cases := []struct {
		name   string
		result string
		ok     bool
		tool   string
		path   string
		reason string
	}{
		{name: "路径越界", result: "Error: 路径越出工作区 (code=path_denied)", ok: true,
			tool: "write", path: "../etc/passwd", reason: "路径越出工作区"},
		{name: "沙盒拒绝", result: "Error: denied (code=sandbox_denied)", ok: true,
			tool: "write", path: "../etc/passwd", reason: "沙盒拒绝访问"},
		{name: "工具白名单", result: "Error: 未知工具 (code=denied_tool)", ok: true,
			tool: "write", path: "", reason: "工具不在白名单"},
		{name: "网络未授权", result: "Error: 拒绝内网地址 (code=ssrf_denied)", ok: true,
			tool: "write", path: "", reason: "网络访问未授权"},
		{name: "普通拒绝", result: "Error: never 策略拒绝动作 (code=denied)", ok: true,
			tool: "write", path: "", reason: "未授权操作"},
		{name: "正常结果", result: "ok", ok: false},
		{name: "需审批不算拒绝", result: "PENDING_APPROVAL approvalId=a1", ok: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			denied, ok := permissionDeniedFromToolResult(call, tc.result)
			if ok != tc.ok {
				t.Fatalf("ok 期望 %v，got %v (%+v)", tc.ok, ok, denied)
			}
			if !ok {
				return
			}
			if denied.Tool != tc.tool || denied.Path != tc.path || denied.Reason != tc.reason {
				t.Fatalf("拒绝素材不对: %+v", denied)
			}
		})
	}
}

type fakeBatchTaskService struct {
	legacyCreated bool
	batchSession  string
	batch         coretask.BatchCreateInput
}

func (f *fakeBatchTaskService) Create(context.Context, coretask.NewTask) (coretask.Task, error) {
	f.legacyCreated = true
	return coretask.Task{ID: "legacy"}, nil
}

func (f *fakeBatchTaskService) List(context.Context, string) ([]coretask.Task, error) {
	return nil, nil
}

func (f *fakeBatchTaskService) Get(context.Context, string) (coretask.Task, error) {
	return coretask.Task{}, nil
}

func (f *fakeBatchTaskService) CreateBatch(_ context.Context, sessionID string, input coretask.BatchCreateInput) (coretask.BatchCreateResult, error) {
	f.batchSession = sessionID
	f.batch = input
	return coretask.BatchCreateResult{
		BatchID: "batch-0123456789abcdef",
		Tasks:   []coretask.Task{{ID: "task-1", DisplayStatus: "pending"}},
		Total:   len(input.Tasks),
	}, nil
}

func TestDelegateUsesBatchCreate(t *testing.T) {
	fake := &fakeBatchTaskService{}
	module := &Module{
		taskSvc: fake,
		log:     slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	module.delegate(context.Background(), &activeTurn{SessionID: "s1"},
		DecisionEnvelope{Kind: DecisionDelegate, TaskIntent: true, TaskTitle: "整理调研报告"},
		"帮我整理一份调研报告")

	if fake.legacyCreated {
		t.Fatal("DELEGATE 不应再走旧 Create")
	}
	if fake.batchSession != "s1" || len(fake.batch.Tasks) != 1 {
		t.Fatalf("批量创建参数不对: session=%q input=%+v", fake.batchSession, fake.batch)
	}
	if fake.batch.Mode != "plan" || fake.batch.Tasks[0].Mode != "plan" {
		t.Fatalf("DELEGATE 应建 plan 模式任务，got %+v", fake.batch)
	}
	if fake.batch.Tasks[0].Title != "整理调研报告" {
		t.Fatalf("标题应取决策标题，got %q", fake.batch.Tasks[0].Title)
	}
}

func TestCategoryTaskNotModelWritable(t *testing.T) {
	category, found, _ := parseCategoryMarker("@@CATEGORY: task\n正文")
	if !found || category == CategoryTask {
		t.Fatalf("模型不得自行声明 task 分类，got %q found=%v", category, found)
	}
	if CategoryTask != "task" {
		t.Fatalf("任务卡片分类常量应为 task，got %q", CategoryTask)
	}
}
