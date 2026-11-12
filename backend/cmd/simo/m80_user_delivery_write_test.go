package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"simo/internal/platform/llm"
)

func TestM80ApprovedWriteBecomesUserDeliverable(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{ToolCalls: []llm.ToolCall{{
			ID: "call-write-delivery", Type: "function",
			Function: llm.FunctionCall{Name: "write", Arguments: `{"file_path":"user-delivery-test.md","content":"# 用户交付\n\nhello"}`},
		}}},
		llm.MockScript{Deltas: []string{"已写入用户交付文件"}},
	)
	_, ts := newM2App(t, provider, nil)
	if status, _ := postChat(t, ts.URL, "请把结果写入 user-delivery-test.md"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	waitForReplyDone(t, ts.URL, "main")
	status, body := httpGet(t, ts.URL+"/api/approvals")
	if status != http.StatusOK || !strings.Contains(string(body), `"tool":"write"`) {
		t.Fatalf("write approval = %d %s", status, body)
	}
	var approvals struct {
		Approvals []struct {
			ID string `json:"id"`
		} `json:"approvals"`
	}
	if err := json.Unmarshal(body, &approvals); err != nil || len(approvals.Approvals) == 0 {
		t.Fatalf("approval JSON: %v %s", err, body)
	}
	status, body = postJSON(t, ts.URL+"/api/approvals/"+approvals.Approvals[0].ID, map[string]any{"decision": "allow"})
	if status != http.StatusOK {
		t.Fatalf("allow write = %d %s", status, body)
	}
	status, body = httpGet(t, ts.URL+"/api/deliverables")
	if status != http.StatusOK {
		t.Fatalf("deliverables = %d %s", status, body)
	}
	var payload struct {
		Deliverables []map[string]any `json:"deliverables"`
		Total        int              `json:"total"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatalf("deliverables JSON: %v %s", err, body)
	}
	if payload.Total < 1 || len(payload.Deliverables) < 1 {
		t.Fatalf("审批写入未生成用户交付物: %s", body)
	}
	var item map[string]any
	for _, candidate := range payload.Deliverables {
		if candidate["name"] == "user-delivery-test.md" {
			item = candidate
			break
		}
	}
	if item == nil {
		t.Fatalf("交付物列表没有 user-delivery-test.md: %s", body)
	}
	if item["userDelivery"] != true || item["sessionId"] != "main" || item["sessionTitle"] != "主会话" {
		t.Fatalf("交付物字段错误: %+v", item)
	}
	preview, _ := item["previewUrl"].(string)
	if preview == "" {
		t.Fatalf("previewUrl 缺失: %+v", item)
	}
	if status, content := httpGet(t, ts.URL+preview); status != http.StatusOK || !strings.Contains(string(content), "用户交付") {
		t.Fatalf("preview = %d %s", status, content)
	}
}
