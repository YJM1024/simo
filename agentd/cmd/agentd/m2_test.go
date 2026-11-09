package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
	"agentd/internal/platform/llm"
	platformlog "agentd/internal/platform/log"
)

func newM2App(t *testing.T, provider llm.Provider, mutate func(*config.Config)) (*app, *httptest.Server) {
	t.Helper()
	t.Setenv("AGENTD_HOME", t.TempDir())
	t.Setenv("AGENTD_ADDR", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_LLM", "mock")
	t.Setenv("AGENTD_DEBUG", "")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatalf("config.Parse: %v", err)
	}
	if mutate != nil {
		mutate(&cfg)
	}
	a, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), provider)
	if err != nil {
		t.Fatalf("buildAppWithProvider: %v", err)
	}
	if err := a.registry.Start(context.Background()); err != nil {
		t.Fatalf("registry.Start: %v", err)
	}
	ts := httptest.NewServer(a.handler)
	t.Cleanup(func() {
		ts.Close()
		_ = a.Stop(context.Background())
		_ = a.Close()
	})
	return a, ts
}

func TestM2MockStreamRecordsUsageAndDecision(t *testing.T) {
	provider := llm.NewMockWithScripts(llm.MockScript{
		ReasoningDeltas: []string{"思考"},
		Deltas:          []string{"你好", "，我是 mock。"},
		Usage:           &llm.Usage{PromptTokens: 5, CompletionTokens: 3, ReasoningTokens: 2, TotalTokens: 8, Model: "mock"},
	})
	_, ts := newM2App(t, provider, nil)

	status, _ := postChat(t, ts.URL, "你好")
	if status != http.StatusAccepted {
		t.Fatalf("POST chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")

	status, body := httpGet(t, ts.URL+"/api/usage")
	if status != http.StatusOK {
		t.Fatalf("/api/usage = %d", status)
	}
	var report struct {
		Total struct {
			PromptTokens     int64 `json:"promptTokens"`
			ReasoningTokens  int64 `json:"reasoningTokens"`
			CompletionTokens int64 `json:"completionTokens"`
		} `json:"total"`
	}
	if err := json.Unmarshal(body, &report); err != nil {
		t.Fatalf("usage JSON: %v (%s)", err, body)
	}
	if report.Total.ReasoningTokens != 2 || report.Total.PromptTokens != 5 {
		t.Fatalf("usage = %+v", report.Total)
	}

	status, body = httpGet(t, ts.URL+"/api/decisions?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("/api/decisions = %d", status)
	}
	var decisions struct {
		Decisions []struct {
			Kind string `json:"kind"`
		} `json:"decisions"`
	}
	if err := json.Unmarshal(body, &decisions); err != nil || len(decisions.Decisions) == 0 {
		t.Fatalf("decisions: %v (%s)", err, body)
	}
	if decisions.Decisions[0].Kind != "ANSWER" {
		t.Fatalf("decision kind = %q", decisions.Decisions[0].Kind)
	}

	// debug 默认关闭 → 404 JSON。
	if status, _ := httpGet(t, ts.URL+"/api/debug/last-llm-request"); status != http.StatusNotFound {
		t.Fatalf("debug 端点默认应 404，得到 %d", status)
	}
}

func TestM2ToolReasoningEchoAndDebugEndpoint(t *testing.T) {
	provider := llm.NewMockWithScripts(
		llm.MockScript{
			ReasoningDeltas: []string{"先读取资料"},
			ToolCalls: []llm.ToolCall{{
				ID:   "call-1",
				Type: "function",
				Function: llm.FunctionCall{
					Name:      "read_file",
					Arguments: `{"path":"README.md"}`,
				},
			}},
		},
		llm.MockScript{Deltas: []string{"总结完成"}, Usage: &llm.Usage{PromptTokens: 4, CompletionTokens: 2, TotalTokens: 6}},
	)
	a, ts := newM2App(t, provider, func(cfg *config.Config) { cfg.Debug = true })
	workspace := a.sandbox.Workspace
	if err := os.MkdirAll(workspace, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(workspace, "README.md"), []byte("# demo\n\nhello"), 0o600); err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if first := readWS(t, ctx, conn); first.Type != "hello" {
		t.Fatalf("首帧 = %q", first.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "chat", "data": map[string]any{"text": "帮我读取 README 并总结"}})

	var sawReasoning, sawDone bool
	for !sawDone {
		frame := readWS(t, ctx, conn)
		if frame.Type == "trace.reasoning" {
			sawReasoning = true
		}
		if frame.Type == "reply.done" {
			sawDone = true
		}
	}
	if !sawReasoning {
		t.Fatal("缺少 trace.reasoning")
	}

	requests := provider.Requests()
	if len(requests) < 2 {
		t.Fatalf("应有 2 轮请求，实际 %d", len(requests))
	}
	second := requests[1]
	foundAssistantReasoning := false
	for _, msg := range second.Messages {
		if msg.Role == "assistant" && msg.ReasoningContent == "先读取资料" && len(msg.ToolCalls) == 1 {
			foundAssistantReasoning = true
		}
	}
	if !foundAssistantReasoning {
		t.Fatalf("第二轮请求未回传第一轮 reasoning_content: %+v", second.Messages)
	}

	status, body := httpGet(t, ts.URL+"/api/debug/last-llm-request")
	if status != http.StatusOK {
		t.Fatalf("debug status = %d", status)
	}
	if !strings.Contains(string(body), "先读取资料") || !strings.Contains(string(body), "reasoning_content") {
		t.Fatalf("debug 请求快照缺少 reasoning_content: %s", body)
	}

	messages := waitForAgentDone(t, ts.URL, "main")
	for _, msg := range messages {
		if msg["role"] == "agent" && msg["text"] == "总结完成" {
			return
		}
	}
	t.Fatalf("agent 正文未落定: %v", messages)
}

func TestM2Retraction(t *testing.T) {
	slow := make([]string, 40)
	for i := range slow {
		slow[i] = "片段"
	}
	provider := llm.NewMockWithScripts(
		llm.MockScript{Deltas: slow, ChunkDelay: 25 * time.Millisecond},
		llm.MockScript{Deltas: []string{"新回复"}},
	)
	_, ts := newM2App(t, provider, nil)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if first := readWS(t, ctx, conn); first.Type != "hello" {
		t.Fatalf("首帧 = %q", first.Type)
	}
	sendWS(t, ctx, conn, map[string]any{"type": "chat", "data": map[string]any{"text": "请慢慢写一段介绍"}})

	// 等到第一帧 reply.delta，模拟用户流式中打断。
	for {
		frame := readWS(t, ctx, conn)
		if frame.Type == "reply.delta" {
			break
		}
	}
	sendWS(t, ctx, conn, map[string]any{"type": "correct", "data": map[string]any{
		"sessionId": "main",
		"text":      "停，先别写了",
	}})

	var retractedID string
	for {
		frame := readWS(t, ctx, conn)
		if frame.Type == "reply.retracted" {
			var data struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(frame.Data, &data); err != nil {
				t.Fatal(err)
			}
			retractedID = data.ID
			break
		}
		if frame.Type == "reply.done" {
			t.Fatal("收到 reply.done 但未收到 reply.retracted")
		}
	}
	if retractedID == "" {
		t.Fatal("reply.retracted 缺少 id")
	}

	messages := listMessages(t, ts.URL, "main")
	found := false
	for _, msg := range messages {
		if msg["id"] == retractedID {
			found = true
			if msg["status"] != "retracted" {
				t.Fatalf("撤回消息 status = %v", msg["status"])
			}
			if msg["text"] != "" {
				t.Fatalf("撤回消息正文应清空，得到 %q", msg["text"])
			}
		}
	}
	if !found {
		t.Fatalf("历史中找不到撤回消息 %s: %v", retractedID, messages)
	}
}

func TestM2ParallelTasks(t *testing.T) {
	_, ts := newM2App(t, llm.NewMock(), nil)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn := dialWS(t, ctx, ts.URL, "?sessionId=main&since=0")
	if first := readWS(t, ctx, conn); first.Type != "hello" {
		t.Fatalf("首帧 = %q", first.Type)
	}
	texts := []string{
		"任务一：把本月待办按优先级排序。",
		"任务二：整理上周会议纪要的三个要点。",
		"任务三：列一个本周学习计划。",
	}
	for _, text := range texts {
		sendWS(t, ctx, conn, map[string]any{"type": "chat", "data": map[string]any{"sessionId": "main", "text": text}})
	}

	createdReplies, createdTasks := 0, 0
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if createdReplies >= 3 && createdTasks >= 3 {
			break
		}
		frame := readWS(t, ctx, conn)
		switch frame.Type {
		case "reply.created":
			createdReplies++
		case "task.created":
			createdTasks++
		}
	}
	if createdReplies < 3 || createdTasks < 3 {
		t.Fatalf("并行结果不足：reply.created=%d task.created=%d", createdReplies, createdTasks)
	}

	status, body := httpGet(t, ts.URL+"/api/tasks?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("/api/tasks = %d", status)
	}
	var payload struct {
		Tasks []map[string]any `json:"tasks"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || len(payload.Tasks) < 3 {
		t.Fatalf("tasks = %v (%s)", err, body)
	}
}

func TestM2AmbiguityClarifiesWithoutTask(t *testing.T) {
	_, ts := newM2App(t, llm.NewMock(), nil)
	status, _ := postChat(t, ts.URL, "把上个月的所有待办都删掉。")
	if status != http.StatusAccepted {
		t.Fatalf("POST chat = %d", status)
	}
	waitForAgentDone(t, ts.URL, "main")

	_, body := httpGet(t, ts.URL+"/api/decisions?sessionId=main")
	var decisions struct {
		Decisions []struct {
			Kind string `json:"kind"`
		} `json:"decisions"`
	}
	if err := json.Unmarshal(body, &decisions); err != nil || len(decisions.Decisions) == 0 {
		t.Fatalf("decisions: %v (%s)", err, body)
	}
	if decisions.Decisions[0].Kind != "CLARIFY" {
		t.Fatalf("高风险请求 decision = %q, want CLARIFY", decisions.Decisions[0].Kind)
	}

	_, tasksBody := httpGet(t, ts.URL+"/api/tasks?sessionId=main")
	var tasks struct {
		Tasks []any `json:"tasks"`
	}
	if err := json.Unmarshal(tasksBody, &tasks); err != nil {
		t.Fatal(err)
	}
	if len(tasks.Tasks) != 0 {
		t.Fatalf("CLARIFY 不应创建任务: %s", tasksBody)
	}
}

func TestM2RestartPersistenceForTasksAndDecisions(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	t.Setenv("AGENTD_ADDR", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_LLM", "mock")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatalf("config.Parse: %v", err)
	}

	app1, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("buildApp 1: %v", err)
	}
	if err := app1.registry.Start(context.Background()); err != nil {
		t.Fatalf("start 1: %v", err)
	}
	ts1 := httptest.NewServer(app1.handler)
	if status, _ := postChat(t, ts1.URL, "帮我整理待办并排序。"); status != http.StatusAccepted {
		ts1.Close()
		_ = app1.Close()
		t.Fatalf("POST chat = %d", status)
	}
	waitForAgentDone(t, ts1.URL, "main")
	ts1.Close()
	if err := app1.Stop(context.Background()); err != nil {
		t.Fatalf("stop 1: %v", err)
	}
	if err := app1.Close(); err != nil {
		t.Fatalf("close 1: %v", err)
	}

	app2, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("buildApp 2: %v", err)
	}
	defer func() { _ = app2.Close() }()
	if err := app2.registry.Start(context.Background()); err != nil {
		t.Fatalf("start 2: %v", err)
	}
	ts2 := httptest.NewServer(app2.handler)
	defer ts2.Close()

	status, body := httpGet(t, ts2.URL+"/api/tasks?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("/api/tasks after restart = %d", status)
	}
	var tasks struct {
		Tasks []map[string]any `json:"tasks"`
	}
	if err := json.Unmarshal(body, &tasks); err != nil || len(tasks.Tasks) == 0 {
		t.Fatalf("重启后任务丢失: %v (%s)", err, body)
	}
	status, body = httpGet(t, ts2.URL+"/api/decisions?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("/api/decisions after restart = %d", status)
	}
	var decisions struct {
		Decisions []map[string]any `json:"decisions"`
	}
	if err := json.Unmarshal(body, &decisions); err != nil || len(decisions.Decisions) == 0 {
		t.Fatalf("重启后 decisions 丢失: %v (%s)", err, body)
	}
	if messages := listMessages(t, ts2.URL, "main"); len(messages) == 0 {
		t.Fatal("重启后消息丢失")
	}
}
