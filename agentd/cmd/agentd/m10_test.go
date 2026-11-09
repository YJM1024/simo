package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
)

type workflowView struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Tasks  []struct {
		ID        string   `json:"id"`
		Status    string   `json:"status"`
		DependsOn []string `json:"dependsOn"`
		Order     int      `json:"orderIndex"`
	} `json:"tasks"`
}

func listWorkflows(t *testing.T, baseURL string) []workflowView {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/workflows?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("workflows = %d %s", status, body)
	}
	var payload struct {
		Workflows []workflowView `json:"workflows"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("workflows JSON: %v %s", err, body)
	}
	return payload.Workflows
}

func waitWorkflowDone(t *testing.T, baseURL string) workflowView {
	t.Helper()
	deadline := time.Now().Add(45 * time.Second)
	for time.Now().Before(deadline) {
		for _, wf := range listWorkflows(t, baseURL) {
			if wf.Status == "done" || wf.Status == "failed" || wf.Status == "cancelled" {
				return wf
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("等待工作流结束超时")
	return workflowView{}
}

func TestM10RealExecutorPathWithMockProvider(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) {
		cfg.ModelMode = config.ModelReal
		cfg.LLM.APIKey = "test-key"
	})
	if status, _ := postChat(t, ts.URL, "mock:workflow 请拆解并执行这个需求"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	wf := waitWorkflowDone(t, ts.URL)
	if wf.Status != "done" {
		t.Fatalf("真实执行器路径工作流 = %+v", wf)
	}
	status, body := httpGet(t, ts.URL+"/api/tasks?sessionId=main&status=done")
	if status != http.StatusOK || strings.Contains(string(body), "Mock 执行器完成") {
		t.Fatalf("真实执行器仍在使用 Mock 模板: %d %s", status, body)
	}
	for _, task := range wf.Tasks {
		if task.Status != "done" {
			t.Fatalf("任务未完成: %+v", wf.Tasks)
		}
	}
}

func TestM10FailureRetryAndBlocked(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:workflow-fail 请拆解执行"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	wf := waitWorkflowDone(t, ts.URL)
	if wf.Status != "failed" {
		t.Fatalf("失败工作流状态 = %+v", wf)
	}
	failed, blocked := 0, 0
	for _, task := range wf.Tasks {
		switch task.Status {
		case "failed":
			failed++
		case "blocked":
			blocked++
		}
	}
	if failed == 0 || blocked == 0 {
		t.Fatalf("失败/阻塞任务 = %+v", wf.Tasks)
	}
	messages := listMessages(t, ts.URL, "main")
	reports := 0
	for _, msg := range messages {
		if msg["role"] == "agent" && msg["workflowId"] == wf.ID &&
			strings.Contains(msg["text"].(string), "任务汇报") {
			reports++
		}
	}
	if reports < 2 {
		t.Fatalf("失败重试汇报不足: %d %+v", reports, messages)
	}
}

func TestM10PauseResumeWorkflow(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:workflow 请拆解并执行这个需求"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	wfs := listWorkflows(t, ts.URL)
	if len(wfs) == 0 {
		t.Fatal("工作流未创建")
	}
	wfID := wfs[0].ID
	if status, body := postJSON(t, ts.URL+"/api/workflows/"+wfID+"/pause", map[string]any{}); status != http.StatusOK {
		t.Fatalf("pause = %d %s", status, body)
	}
	time.Sleep(500 * time.Millisecond)
	wf, err := getWorkflow(t, ts.URL, wfID)
	if err != nil || wf.Status != "paused" {
		t.Fatalf("pause status = %+v err=%v", wf, err)
	}
	if status, body := postJSON(t, ts.URL+"/api/workflows/"+wfID+"/resume", map[string]any{}); status != http.StatusOK {
		t.Fatalf("resume = %d %s", status, body)
	}
	wf = waitWorkflowDone(t, ts.URL)
	if wf.Status != "done" {
		t.Fatalf("resume 后工作流 = %+v", wf)
	}
}

func getWorkflow(t *testing.T, baseURL, id string) (workflowView, error) {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/workflows/"+id)
	if status != http.StatusOK {
		t.Fatalf("workflow = %d %s", status, body)
	}
	var payload struct {
		Workflow workflowView `json:"workflow"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return workflowView{}, err
	}
	return payload.Workflow, nil
}

func TestM10WorkflowPlanDependenciesAndReports(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	if status, _ := postChat(t, ts.URL, "mock:workflow 请拆解并执行这个需求"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	wf := waitWorkflowDone(t, ts.URL)
	if len(wf.Tasks) < 3 {
		t.Fatalf("工作流任务不足: %+v", wf)
	}
	// 汇总任务依赖前两个任务。
	depCount := 0
	for _, task := range wf.Tasks {
		if len(task.DependsOn) > 0 {
			depCount++
		}
	}
	if depCount == 0 {
		t.Fatalf("工作流缺少依赖: %+v", wf.Tasks)
	}
	status, body := httpGet(t, ts.URL+"/api/workflows/"+wf.ID)
	if status != http.StatusOK || !strings.Contains(string(body), wf.ID) {
		t.Fatalf("workflow detail = %d %s", status, body)
	}
	// 每个任务完成都应有带 taskId/workflowId 的 agent 汇报消息。
	messages := listMessages(t, ts.URL, "main")
	reportTasks := map[string]bool{}
	for _, msg := range messages {
		if msg["role"] != "agent" {
			continue
		}
		taskID, _ := msg["taskId"].(string)
		workflowID, _ := msg["workflowId"].(string)
		if taskID != "" && workflowID == wf.ID && strings.Contains(msg["text"].(string), "任务汇报") {
			reportTasks[taskID] = true
		}
	}
	if len(reportTasks) < len(wf.Tasks) {
		t.Fatalf("逐任务汇报不足: reports=%v tasks=%+v messages=%+v", reportTasks, wf.Tasks, messages)
	}
	// 任务面板按状态过滤。
	status, body = httpGet(t, ts.URL+"/api/tasks?sessionId=main&status=done")
	if status != http.StatusOK || !strings.Contains(string(body), `"status":"done"`) {
		t.Fatalf("task filter = %d %s", status, body)
	}
}
