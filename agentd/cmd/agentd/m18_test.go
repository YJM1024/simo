package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

type debugSpecView struct {
	Status          string   `json:"status"`
	Version         int      `json:"version"`
	AcceptanceKeys  []string `json:"acceptanceKeys"`
	Evidence        []string `json:"evidence"`
	ExecutorAgentID string   `json:"executorAgentId"`
	ReopenedCount   int      `json:"reopenedCount"`
}

func getDebugSpec(t *testing.T, baseURL, sessionID string) debugSpecView {
	t.Helper()
	status, body := httpGet(t, baseURL+"/api/debug/spec?sessionId="+sessionID)
	if status != http.StatusOK {
		t.Fatalf("debug spec = %d %s", status, body)
	}
	var payload struct {
		Spec debugSpecView `json:"spec"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("debug spec JSON: %s", body)
	}
	return payload.Spec
}

func TestM18SpecStateMachineAndExecutor(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	sessionID := createSession(t, ts.URL, "main", "M18 state")
	spec := getDebugSpec(t, ts.URL, sessionID)
	if spec.Status != "draft" || spec.Version < 1 || spec.ExecutorAgentID != "agent:task-npc" {
		t.Fatalf("初始 spec = %+v", spec)
	}
	for _, target := range []string{"confirmed", "planning", "executing"} {
		status, body := postJSON(t, ts.URL+"/api/debug/spec/transition", map[string]any{
			"sessionId": sessionID, "to": target, "reason": "test " + target,
		})
		if status != http.StatusOK {
			t.Fatalf("transition %s = %d %s", target, status, body)
		}
	}
	if status, body := postJSON(t, ts.URL+"/api/debug/spec/transition", map[string]any{
		"sessionId": sessionID, "to": "verified", "reason": "illegal",
	}); status != http.StatusConflict {
		t.Fatalf("illegal transition = %d %s", status, body)
	}
	if after := getDebugSpec(t, ts.URL, sessionID); after.Status != "executing" {
		t.Fatalf("非法迁移改变了状态: %+v", after)
	}
	status, body := postJSON(t, ts.URL+"/api/debug/spec/reopen", map[string]any{"sessionId": sessionID, "reason": "reopen"})
	if status != http.StatusOK {
		t.Fatalf("reopen = %d %s", status, body)
	}
	if after := getDebugSpec(t, ts.URL, sessionID); after.ReopenedCount < 1 || after.Status != "executing" {
		t.Fatalf("reopen 后 spec = %+v", after)
	}
	status, body = postJSON(t, ts.URL+"/api/debug/spec/executor", map[string]any{"sessionId": sessionID, "agentId": "agent:simo"})
	if status != http.StatusOK {
		t.Fatalf("executor = %d %s", status, body)
	}
	if after := getDebugSpec(t, ts.URL, sessionID); after.ExecutorAgentID != "agent:simo" {
		t.Fatalf("executor 后 spec = %+v", after)
	}
	// 公开 API 不暴露 Spec。
	for _, path := range []string{"/api/specs", "/api/specs/spec-" + sessionID, "/api/sessions/" + sessionID + "/spec"} {
		if status, _ := httpGet(t, ts.URL+path); status != http.StatusNotFound {
			t.Fatalf("公开 spec 路径 %s = %d", path, status)
		}
	}
}

func TestM18SpecContextInjected(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) { cfg.Debug = true })
	sessionID := createSession(t, ts.URL, "main", "M18 context")
	if status := postChatSession(t, ts.URL, sessionID, "你好"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, sessionID)
	status, body := httpGet(t, ts.URL+"/api/debug/last-llm-request")
	if status != http.StatusOK || !strings.Contains(string(body), "[spec:internal]") {
		t.Fatalf("模型上下文未注入 spec: %d %s", status, body)
	}
	// 用户可见消息不包含内部块。
	messages := listMessages(t, ts.URL, sessionID)
	for _, message := range messages {
		if text, _ := message["text"].(string); strings.Contains(text, "[spec:internal]") {
			t.Fatalf("spec 注入泄漏到用户消息: %+v", message)
		}
	}
}
