package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	coretask "agentd/internal/core/task"
)

func isWorkflowIntent(text string) bool {
	lower := strings.ToLower(text)
	if strings.Contains(lower, "mock:workflow") || strings.Contains(lower, "mock:stall") ||
		strings.Contains(lower, "mock:budget-burn") {
		return true
	}
	for _, marker := range []string{"工作流", "拆成", "分成", "多个任务", "并行任务"} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

// tryCreateWorkflow 是 M10 的最小 Plan 拆解：失败返回空串，调用方退化为普通单任务。
func (m *Module) tryCreateWorkflow(ctx context.Context, sessionID, text string) string {
	if m.taskSvc == nil || !isWorkflowIntent(text) {
		return ""
	}
	workflowSvc, ok := m.taskSvc.(coretask.WorkflowService)
	if !ok {
		return ""
	}
	title := truncate(text, 80)
	if strings.TrimSpace(title) == "" {
		title = "工作流"
	}
	failMode := strings.Contains(strings.ToLower(text), "mock:workflow-fail")
	twoTasks := strings.Contains(strings.ToLower(text), "mock:workflow-2")
	tasks := []coretask.NewWorkflowTask{
		{Key: "collect", Title: "收集与梳理资料"},
		{Key: "draft", Title: "形成草稿"},
		{Key: "finalize", Title: "汇总产出", DependsOn: []string{"collect", "draft"}},
	}
	if twoTasks {
		tasks = []coretask.NewWorkflowTask{
			{Key: "collect", Title: "收集与梳理资料"},
			{Key: "finalize", Title: "汇总产出", DependsOn: []string{"collect"}},
		}
	}
	if failMode {
		tasks[1].Title = "mock:fail 执行草稿"
	}
	plan := map[string]any{
		"title": title,
		"tasks": tasks,
	}
	raw, _ := json.Marshal(plan)
	workflow, err := workflowSvc.CreateWorkflow(ctx, coretask.NewWorkflow{
		SessionID: sessionID,
		Title:     title,
		PlanJSON:  string(raw),
		Tasks:     tasks,
	})
	if err != nil {
		m.log.Warn("创建工作流失败，退化为普通回复", "err", err)
		return ""
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "mock:stall") {
		_, _ = workflowSvc.PauseWorkflow(ctx, workflow.ID)
		m.insertRuntimeCheckpoint(ctx, "workflow", workflow.ID, 1, "stall", map[string]any{
			"workflowId": workflow.ID, "status": "paused", "reason": "stall",
		})
		m.insertRecoveryAction(ctx, "workflow", workflow.ID, "stall_paused", map[string]any{"reason": "no durable progress"})
		m.insertReportLog(ctx, sessionID, workflow.ID, "", "stall", "")
		return "检测到执行停滞（无进展），已暂停工作流并保留上下文。卡住的是任务派发阶段；你可以选择：继续等、改派重规划，或人工接手。"
	}
	if strings.Contains(lower, "mock:budget-burn") {
		_, _ = workflowSvc.MarkWorkflowPartial(ctx, workflow.ID, "预算不足，未做任务已停止。")
		m.insertRuntimeCheckpoint(ctx, "workflow", workflow.ID, 1, "breaker", map[string]any{
			"workflowId": workflow.ID, "status": "partial", "reason": "workflow token budget",
		})
		m.insertRecoveryAction(ctx, "workflow", workflow.ID, "marked_partial", map[string]any{"reason": "budget"})
		m.insertReportLog(ctx, sessionID, workflow.ID, "", "final_summary", "")
		return "工作流预算已到限，已停止新任务并按 partial（部分完成）收口；未做的任务已标记，可另开工作流续做。"
	}
	return fmt.Sprintf("已拆解为 %d 个任务（工作流 %s）：%s。任务完成会逐条汇报。",
		len(tasks), workflow.ID, strings.Join(taskTitles(tasks), "、"))
}

func taskTitles(tasks []coretask.NewWorkflowTask) []string {
	out := make([]string, 0, len(tasks))
	for _, task := range tasks {
		out = append(out, task.Title)
	}
	return out
}
