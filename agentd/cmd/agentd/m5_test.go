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

func TestM5MockWriteDeletePermissionFlow(t *testing.T) {
	a, ts := newM2App(t, llm.NewMock(), nil)
	// mock:write → write_file → pending approval，不直接写。
	if status, _ := postChat(t, ts.URL, "请执行 mock:write"); status != http.StatusAccepted {
		t.Fatalf("POST mock:write = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/approvals")
	if status != http.StatusOK {
		t.Fatalf("approvals = %d", status)
	}
	var payload struct {
		Approvals []struct {
			ID     string `json:"id"`
			Tool   string `json:"tool"`
			Status string `json:"status"`
		} `json:"approvals"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Approvals) != 1 {
		t.Fatalf("mock:write approvals = %v (%s)", err, body)
	}
	approval := payload.Approvals[0]
	if approval.Tool != "write_file" || approval.Status != "pending" {
		t.Fatalf("approval = %+v", approval)
	}
	if _, err := os.Stat(filepath.Join(a.sandbox.Workspace, "mock-write.txt")); err == nil {
		t.Fatal("pending 时不应执行 write_file")
	}
	if status, _ := postJSON(t, ts.URL+"/api/approvals/"+approval.ID, map[string]any{"decision": "allow"}); status != http.StatusOK {
		t.Fatalf("allow status = %d", status)
	}
	if _, err := os.Stat(filepath.Join(a.sandbox.Workspace, "mock-write.txt")); err != nil {
		t.Fatalf("allow 后未执行 write_file: %v", err)
	}

	// mock:delete → delete_file 直接 deny，不产生 approval。
	if status, _ := postChat(t, ts.URL, "请执行 mock:delete"); status != http.StatusAccepted {
		t.Fatalf("POST mock:delete = %d", status)
	}
	waitForAgentCount(t, ts.URL, "main", 2)
	_, body = httpGet(t, ts.URL+"/api/approvals")
	if strings.Contains(string(body), `"tool":"delete_file"`) {
		t.Fatalf("delete 不应进入审批: %s", body)
	}
}

func TestM5WriteAskApprovalExecutes(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-write", Type: "function",
			Function: llm.FunctionCall{Name: "write_file", Arguments: `{"path":"notes.md","content":"TODO\n"}`},
		}}},
		llm.MockScript{Deltas: []string{"已处理"}},
	)
	a, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "请把 TODO 写进 notes.md 文件。"); status != http.StatusAccepted {
		t.Fatalf("POST chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")

	status, body := httpGet(t, ts.URL+"/api/approvals")
	if status != http.StatusOK {
		t.Fatalf("approvals = %d %s", status, body)
	}
	var payload struct {
		Approvals []struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"approvals"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Approvals) == 0 {
		t.Fatalf("approvals JSON: %v (%s)", err, body)
	}
	approval := payload.Approvals[0]
	if approval.Status != "pending" {
		t.Fatalf("approval status = %q", approval.Status)
	}
	if _, err := os.Stat(filepath.Join(a.sandbox.Workspace, "notes.md")); err == nil {
		t.Fatal("审批前 write_file 不应执行")
	}
	status, decideBody := postJSON(t, ts.URL+"/api/approvals/"+approval.ID, map[string]any{"decision": "allow"})
	if status != http.StatusOK {
		t.Fatalf("allow = %d %s", status, decideBody)
	}
	data, err := os.ReadFile(filepath.Join(a.sandbox.Workspace, "notes.md"))
	if err != nil || string(data) != "TODO\n" {
		t.Fatalf("审批后写入失败: %v %q", err, data)
	}
}
