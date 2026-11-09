package tasks

import (
	"os"
	"strconv"
	"strings"

	coretask "agentd/internal/core/task"
)

func envPositiveInt(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	if value > 32 {
		value = 32
	}
	return value
}

func configuredExecutorAgentID() string {
	value := strings.TrimSpace(os.Getenv("AGENTD_TASK_EXECUTOR"))
	if value == "" {
		return "agent:task-npc"
	}
	if strings.HasPrefix(value, "agent:") {
		return value
	}
	return "agent:" + value
}

func decorateWorkflow(workflow *coretask.Workflow) {
	if workflow == nil {
		return
	}
	if workflow.StateReason != "" {
		return
	}
	queued := 0
	for i := range workflow.Tasks {
		decorateTask(&workflow.Tasks[i])
		if workflow.Tasks[i].Status == coretask.StatusPending || workflow.Tasks[i].Status == coretask.StatusQueued {
			queued++
		}
	}
	switch workflow.Status {
	case "paused":
		workflow.StateReason = firstNonEmptyWorkflow(workflow.Summary, "工作流已暂停")
	case "running":
		if queued > 0 {
			workflow.StateReason = "运行中：存在排队/待调度任务，受并发上限约束"
		}
	}
}

func firstNonEmptyWorkflow(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func decorateTask(task *coretask.Task) {
	if task == nil {
		return
	}
	if task.ExecutorAgentID == "" {
		task.ExecutorAgentID = configuredExecutorAgentID()
	}
	if task.StateReason != "" {
		return
	}
	switch task.Status {
	case "queued":
		task.StateReason = "排队中：达到并发上限，等待执行槽位"
	case "pending":
		task.StateReason = "等待调度：并发槽位或前置依赖未满足"
	case "paused":
		task.StateReason = "已暂停"
	case "blocked":
		task.StateReason = "被阻塞：需要人工处理"
	}
}
