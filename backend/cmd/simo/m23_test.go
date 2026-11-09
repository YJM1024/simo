package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/config"
)

func TestM23TeamV0View(t *testing.T) {
	t.Setenv("SIMO_MAX_CONCURRENCY", "1")
	t.Setenv("SIMO_WORKFLOW_CONCURRENCY", "1")
	t.Setenv("SIMO_TASK_EXECUTOR", "agent:simo")
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "mock:workflow 拆成多个任务并推进"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	status, body := httpGet(t, ts.URL+"/api/team")
	if status != http.StatusOK || !strings.Contains(string(body), `"members"`) {
		t.Fatalf("team = %d %s", status, body)
	}
	var team struct {
		Members []struct {
			AgentID     string `json:"agentId"`
			Name        string `json:"name"`
			Status      string `json:"status"`
			StateReason string `json:"stateReason"`
			Progress    int    `json:"progress"`
		} `json:"members"`
		GlobalConcurrency   int `json:"globalConcurrency"`
		WorkflowConcurrency int `json:"workflowConcurrency"`
	}
	if err := json.Unmarshal(body, &team); err != nil || len(team.Members) == 0 {
		t.Fatalf("team JSON = %v %s", err, body)
	}
	if team.GlobalConcurrency != 1 || team.WorkflowConcurrency != 1 {
		t.Fatalf("并发配置未生效: %+v", team)
	}
	for _, member := range team.Members {
		if member.AgentID != "agent:simo" || member.Name == "" {
			t.Fatalf("成员字段 = %+v", member)
		}
		if member.Status == "pending" && member.StateReason == "" {
			t.Fatalf("排队成员缺 stateReason: %+v", member)
		}
	}
	status, body = httpGet(t, ts.URL+"/api/memory/entities")
	if status != http.StatusOK || !strings.Contains(string(body), `"ent-agent-simo"`) || !strings.Contains(string(body), `"canonicalName":"司墨"`) {
		t.Fatalf("agent 品牌未统一: %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/tasks")
	var tasks struct {
		Tasks []struct {
			Status          string `json:"status"`
			StateReason     string `json:"stateReason"`
			ExecutorAgentID string `json:"executorAgentId"`
		} `json:"tasks"`
	}
	if status != http.StatusOK || json.Unmarshal(body, &tasks) != nil || len(tasks.Tasks) == 0 {
		t.Fatalf("tasks = %d %s", status, body)
	}
	running := 0
	for _, task := range tasks.Tasks {
		if task.ExecutorAgentID != "agent:simo" {
			t.Fatalf("executorAgentId = %q", task.ExecutorAgentID)
		}
		if task.Status == "running" || task.Status == "queued" {
			running++
		}
		if (task.Status == "pending" || task.Status == "queued") && task.StateReason == "" {
			t.Fatalf("排队任务缺 stateReason: %+v", task)
		}
	}
	if running > 1 {
		t.Fatalf("并发上限未生效 running=%d", running)
	}
}
