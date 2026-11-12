package main

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"simo/internal/platform/config"
)

type taskRuntimePayload struct {
	OK      bool           `json:"ok"`
	Runtime map[string]any `json:"runtime"`
}

func getTaskRuntime(t *testing.T, baseURL, taskID string) (int, taskRuntimePayload) {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/tasks/"+taskID+"/runtime")
	var payload taskRuntimePayload
	_ = json.Unmarshal(body, &payload)
	return status, payload
}

func TestM72TaskRuntimeContract(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "帮我整理一份本周周报，输出成文档。"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	tasks := waitForTaskCount(t, ts.URL, 1)
	if len(tasks) == 0 {
		t.Fatalf("未创建任务")
	}
	taskID, _ := tasks[0]["id"].(string)
	deadline := time.Now().Add(8 * time.Second)
	sawRunning := false
	for time.Now().Before(deadline) {
		status, payload := getTaskRuntime(t, ts.URL, taskID)
		if status != http.StatusOK {
			t.Fatalf("runtime = %d", status)
		}
		rt := payload.Runtime
		for _, key := range []string{
			"id", "sessionId", "status", "attempt", "progress", "startedAt",
			"lastProgressAt", "lastHeartbeatAt", "nextAction", "step", "stepIndex",
			"totalSteps", "stepsSummary", "checkpoint", "resumePoint",
		} {
			if _, ok := rt[key]; !ok {
				t.Fatalf("runtime 缺少字段 %s: %+v", key, rt)
			}
		}
		summary, ok := rt["stepsSummary"].([]any)
		if !ok || len(summary) == 0 {
			t.Fatalf("stepsSummary 非法: %+v", rt["stepsSummary"])
		}
		if rt["status"] == "running" {
			sawRunning = true
			if rt["step"] == nil {
				t.Fatalf("running runtime 缺当前 step: %+v", rt)
			}
			break
		}
		if rt["status"] == "done" {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !sawRunning {
		t.Log("任务执行较快，未捕获 running 快照；继续验证 done")
	}
	waitTaskDone(t, ts.URL, "main")
	status, payload := getTaskRuntime(t, ts.URL, taskID)
	if status != http.StatusOK || payload.Runtime["status"] != "done" {
		t.Fatalf("done runtime = %d %+v", status, payload.Runtime)
	}
	if payload.Runtime["progress"] != float64(100) && payload.Runtime["progress"] != 100 {
		t.Fatalf("done progress = %v", payload.Runtime["progress"])
	}
	if payload.Runtime["nextAction"] != "已完成" {
		t.Fatalf("done nextAction = %v", payload.Runtime["nextAction"])
	}
	if status, _ := getTaskRuntime(t, ts.URL, "task-does-not-exist"); status != http.StatusNotFound {
		t.Fatalf("missing task runtime = %d, want 404", status)
	}
}
