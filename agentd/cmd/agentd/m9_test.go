package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"agentd/internal/platform/llm"
)

func TestM9PermissionsDefaultAndFullConfirmation(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	status, body := httpGet(t, ts.URL+"/api/permissions")
	if status != http.StatusOK {
		t.Fatalf("permissions = %d %s", status, body)
	}
	var payload struct {
		Sandbox  string `json:"sandbox"`
		Approval string `json:"approval"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.Sandbox != "workspace-write" || payload.Approval != "auto" {
		t.Fatalf("default permissions = %s", body)
	}
	if status, _ := postJSON(t, ts.URL+"/api/permissions", map[string]any{"sandbox": "danger-full-access"}); status != http.StatusBadRequest {
		t.Fatalf("full without confirm = %d", status)
	}
	status, body = postJSON(t, ts.URL+"/api/permissions", map[string]any{"sandbox": "danger-full-access", "confirm": true})
	if status != http.StatusOK || !strings.Contains(string(body), "danger-full-access") {
		t.Fatalf("full with confirm = %d %s", status, body)
	}
	if status, _ := postJSON(t, ts.URL+"/api/permissions", map[string]any{"sandbox": "read-only", "approval": "never"}); status != http.StatusOK {
		t.Fatalf("read-only = %d", status)
	}
}

func TestM9PwshApprovalAndExitCode(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-pwsh", Type: "function",
			Function: llm.FunctionCall{Name: "pwsh", Arguments: `{"command":"Write-Output hi; exit 3"}`},
		}}},
		llm.MockScript{Deltas: []string{"done"}},
	)
	_, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "执行命令"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/approvals")
	if status != http.StatusOK || !strings.Contains(string(body), `"tool":"pwsh"`) || !strings.Contains(string(body), `"risk":"R2"`) {
		t.Fatalf("pwsh approval = %d %s", status, body)
	}
	var payload struct {
		Approvals []struct {
			ID string `json:"id"`
		} `json:"approvals"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Approvals) == 0 {
		t.Fatalf("approval JSON: %v %s", err, body)
	}
	status, body = postJSON(t, ts.URL+"/api/approvals/"+payload.Approvals[0].ID, map[string]any{"decision": "allow"})
	if status != http.StatusOK || !strings.Contains(string(body), "[exit code: 3]") {
		t.Fatalf("pwsh allow = %d %s", status, body)
	}
}

func TestM9EscalationWritesOutsideAndNeverRejects(t *testing.T) {
	outside := filepath.Join(t.TempDir(), "outside.txt")
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-write", Type: "function",
			Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":` + jsonQuote(outside) +
				`,"content":"outside","sandbox_permissions":"danger-full-access","justification":"用户要求写到外部"}`},
		}}},
		llm.MockScript{Deltas: []string{"done"}},
	)
	_, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "写外部文件"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	_, body := httpGet(t, ts.URL+"/api/approvals")
	var payload struct {
		Approvals []struct {
			ID      string `json:"id"`
			Sandbox string `json:"sandbox"`
		} `json:"approvals"`
	}
	if json.Unmarshal(body, &payload) != nil || len(payload.Approvals) != 1 ||
		payload.Approvals[0].Sandbox != "danger-full-access" {
		t.Fatalf("escalation approval = %s", body)
	}
	if status, body := postJSON(t, ts.URL+"/api/approvals/"+payload.Approvals[0].ID, map[string]any{"decision": "allow"}); status != http.StatusOK {
		t.Fatalf("escalation allow = %d %s", status, body)
	}
	if data, err := os.ReadFile(outside); err != nil || string(data) != "outside" {
		t.Fatalf("escalation write = %q %v", data, err)
	}

	// never 模式：需审批动作直接拒绝，不产生 pending。
	_, tsNever := newM2App(t, llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-locked", Type: "function",
			Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":"never.txt","content":"x"}`},
		}}},
		llm.MockScript{Deltas: []string{"done"}},
	), nil)
	if status, _ := postJSON(t, tsNever.URL+"/api/permissions", map[string]any{"approval": "never"}); status != http.StatusOK {
		t.Fatalf("set never = %d", status)
	}
	if status, _ := postChat(t, tsNever.URL, "写文件"); status != http.StatusAccepted {
		t.Fatalf("never chat = %d", status)
	}
	waitForAgentDone(t, tsNever.URL, "main")
	_, approvals := httpGet(t, tsNever.URL+"/api/approvals")
	if strings.Contains(string(approvals), `"tool":"write"`) {
		t.Fatalf("never 模式不应产生 pending: %s", approvals)
	}
}

func TestM9AllowSessionGrant(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{ID: "write-1", Type: "function", Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":"session-grant.txt","content":"one"}`}}}},
		llm.MockScript{Deltas: []string{"done1"}},
		llm.MockScript{ToolCalls: []llm.ToolCall{{ID: "write-2", Type: "function", Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":"session-grant.txt","content":"two"}`}}}},
		llm.MockScript{Deltas: []string{"done2"}},
	)
	_, ts := newM2App(t, provider, nil)
	for i := 0; i < 2; i++ {
		if status, _ := postChat(t, ts.URL, "写文件"); status != http.StatusAccepted {
			t.Fatalf("chat %d = %d", i, status)
		}
		waitForAgentDone(t, ts.URL, "main")
		if i == 0 {
			_, body := httpGet(t, ts.URL+"/api/approvals")
			var list struct {
				Approvals []struct {
					ID string `json:"id"`
				} `json:"approvals"`
			}
			if json.Unmarshal(body, &list) != nil || len(list.Approvals) == 0 {
				t.Fatalf("approvals = %s", body)
			}
			if status, body := postJSON(t, ts.URL+"/api/approvals/"+list.Approvals[0].ID, map[string]any{"decision": "allow_session", "scope": "session"}); status != http.StatusOK {
				t.Fatalf("allow_session = %d %s", status, body)
			}
			continue
		}
		_, body := httpGet(t, ts.URL+"/api/approvals")
		if strings.Contains(string(body), `"status":"pending"`) {
			t.Fatalf("allow_session 后不应再 pending: %s", body)
		}
	}
}

func TestM9ApprovalResultReportMessage(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{ID: "write", Type: "function", Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":"approval-report.txt","content":"ok"}`}}}},
		llm.MockScript{Deltas: []string{"done"}},
	)
	_, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "写文件"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	_, body := httpGet(t, ts.URL+"/api/approvals")
	var list struct {
		Approvals []struct {
			ID string `json:"id"`
		} `json:"approvals"`
	}
	if json.Unmarshal(body, &list) != nil || len(list.Approvals) == 0 {
		t.Fatalf("approvals = %s", body)
	}
	if status, body := postJSON(t, ts.URL+"/api/approvals/"+list.Approvals[0].ID, map[string]any{"decision": "allow_once"}); status != http.StatusOK {
		t.Fatalf("allow_once = %d %s", status, body)
	}
	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, message := range messages {
		if message["role"] == "agent" && message["approvalId"] == list.Approvals[0].ID {
			if !strings.Contains(message["text"].(string), "审批已通过") || !strings.Contains(message["text"].(string), "OK") {
				t.Fatalf("审批汇报内容 = %+v", message)
			}
			found = true
		}
	}
	if !found {
		t.Fatalf("缺少审批结果 agent 汇报: %+v", messages)
	}
}

func jsonQuote(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func runApprovedPwsh(t *testing.T, command string, timeoutMS int) (*app, string) {
	t.Helper()
	args := `{"command":` + jsonQuote(command) + `}`
	if timeoutMS > 0 {
		args = `{"command":` + jsonQuote(command) + `,"timeout_ms":` + jsonInt(timeoutMS) + `}`
	}
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-pwsh", Type: "function",
			Function: llm.FunctionCall{Name: "pwsh", Arguments: args},
		}}},
		llm.MockScript{Deltas: []string{"done"}},
	)
	a, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "执行命令"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	_, body := httpGet(t, ts.URL+"/api/approvals")
	var list struct {
		Approvals []struct {
			ID string `json:"id"`
		} `json:"approvals"`
	}
	if json.Unmarshal(body, &list) != nil || len(list.Approvals) == 0 {
		t.Fatalf("approvals = %s", body)
	}
	status, body := postJSON(t, ts.URL+"/api/approvals/"+list.Approvals[0].ID, map[string]any{"decision": "allow"})
	if status != http.StatusOK {
		t.Fatalf("approve = %d %s", status, body)
	}
	var payload struct {
		Result string `json:"result"`
	}
	_ = json.Unmarshal(body, &payload)
	if payload.Result == "" {
		t.Logf("approval response body=%s", body)
	}
	return a, payload.Result
}

func TestM9PwshEnvTimeoutAndSpill(t *testing.T) {
	_, clean := runApprovedPwsh(t, "if ($env:DEEPSEEK_API_KEY -or $env:OPENAI_API_KEY) { 'LEAK' } else { 'CLEAN' }", 0)
	if !strings.Contains(clean, "CLEAN") || strings.Contains(clean, "LEAK") {
		t.Fatalf("env cleanup = %q", clean)
	}
	_, timeoutResult := runApprovedPwsh(t, "Start-Sleep -Seconds 5", 1000)
	if !strings.Contains(timeoutResult, "TIMEOUT") && !strings.Contains(timeoutResult, "timed out") {
		t.Fatalf("timeout result = %q", timeoutResult)
	}
	a, spillResult := runApprovedPwsh(t, "('x' * 70000)", 0)
	if !strings.Contains(spillResult, "Omitted") || !strings.Contains(spillResult, "full result at") {
		t.Fatalf("spill result = %q", spillResult)
	}
	entries, err := os.ReadDir(filepath.Join(a.sandbox.Artifacts, "spill"))
	if err != nil || len(entries) == 0 {
		t.Fatalf("spill 文件未落盘: %v", err)
	}
}

func jsonInt(value int) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}
