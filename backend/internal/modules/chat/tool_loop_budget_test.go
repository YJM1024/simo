package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/platform/llm"
)

// toolBudgetFake 连续若干步只回工具调用（复刻真机上“创建任务”回合先描述意图、
// 再查询任务与日程、最后发卡的多步工具链），之后回正文；同时保留严格校验：
// 任何 assistant 历史缺非空 reasoning_content 就 400。
type toolBudgetFake struct {
	t          *testing.T
	mu         sync.Mutex
	reqs       []capturedChatRequest
	toolRounds int
	bad        []string
	server     *httptest.Server
}

func newToolBudgetFake(t *testing.T, toolRounds int) *toolBudgetFake {
	t.Helper()
	f := &toolBudgetFake{t: t, toolRounds: toolRounds}
	f.server = httptest.NewServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *toolBudgetFake) handle(w http.ResponseWriter, r *http.Request) {
	var got capturedChatRequest
	if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
		http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
		return
	}
	f.mu.Lock()
	f.reqs = append(f.reqs, got)
	round := len(f.reqs)
	f.mu.Unlock()

	for _, msg := range got.Messages {
		if msg.Role != "assistant" {
			continue
		}
		if msg.ReasoningContent == nil || strings.TrimSpace(*msg.ReasoningContent) == "" {
			f.mu.Lock()
			f.bad = append(f.bad, "assistant 消息缺少非空 reasoning_content")
			f.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, `{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API.","type":"invalid_request_error"}}`)
			return
		}
	}

	if round > f.toolRounds {
		writeStrictSSE(f.t, w, "想清楚了，直接回答", "@@CATEGORY: consultation\n\n两个计划任务已经创建。")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
		return
	}
	writeSSEHeaders(f.t, w)
	reasoning, _ := json.Marshal(map[string]any{
		"model":   "fake-upstream",
		"choices": []any{map[string]any{"delta": map[string]any{"reasoning_content": fmt.Sprintf("第 %d 轮想先查资料", round)}}},
	})
	fmt.Fprintf(w, "data: %s\n\n", reasoning)
	flusher.Flush()
	call, _ := json.Marshal(map[string]any{
		"model": "fake-upstream",
		"choices": []any{map[string]any{"delta": map[string]any{"tool_calls": []any{map[string]any{
			"index": 0,
			"id":    fmt.Sprintf("call_budget_%d", round),
			"type":  "function",
			"function": map[string]any{
				"name":      "no_such_tool",
				"arguments": "{}",
			},
		}}}}},
	})
	fmt.Fprintf(w, "data: %s\n\n", call)
	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}

func (f *toolBudgetFake) request(i int) capturedChatRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	if i >= len(f.reqs) {
		f.t.Fatalf("期望至少 %d 次上游请求，实际 %d 次", i+1, len(f.reqs))
	}
	return f.reqs[i]
}

func (f *toolBudgetFake) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.reqs)
}

func (f *toolBudgetFake) violations() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.bad...)
}

// TestToolLoopBudgetCoversTaskCreationTurn 覆盖真机复测暴露的空回复：一个
// “创建任务”回合依次要描述意图、查询任务与日程、发卡、总结，共 5 次模型请求；
// 旧上限 3 步会在发卡前截断，回复正文为空。断言第 4 次请求仍带工具定义、回合
// 最终以非空正文收尾，且历史 reasoning_content 全程不破。
func TestToolLoopBudgetCoversTaskCreationTurn(t *testing.T) {
	const toolRounds = 4
	fake := newToolBudgetFake(t, toolRounds)
	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: fake.server.URL,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("构造 provider 失败: %v", err)
	}
	mod, db, events := openReasoningTestModule(t, filepath.Join(t.TempDir(), "simo.db"), provider)
	t.Cleanup(func() { _ = db.Close() })
	ctx := context.Background()

	if _, err := mod.startTurn(ctx, "sess-replay", "帮我创建两个计划任务", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动回合失败: %v", err)
	}
	replyID := waitForReplyCreated(t, events, "sess-replay", 3*time.Second)
	doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 5*time.Second)
	waitForIdleAfter(t, events, doneID, 3*time.Second)

	if got := fake.count(); got != toolRounds+1 {
		t.Fatalf("期望 %d 次上游请求，实际 %d 次", toolRounds+1, got)
	}
	if got := len(fake.request(toolRounds - 1).Tools); got == 0 {
		t.Fatal("第 4 次请求就丢了工具定义：旧上限 3 步会在发卡前截断回合")
	}
	if maxModelSteps <= toolRounds {
		t.Fatalf("maxModelSteps=%d 不足以让 %d 轮工具调用后还有一次总结", maxModelSteps, toolRounds)
	}
	if bad := fake.violations(); len(bad) > 0 {
		t.Fatalf("严格上游拒绝了请求: %v", bad)
	}
	var text, status string
	if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, replyID).Scan(&text, &status); err != nil {
		t.Fatalf("读取回复失败: %v", err)
	}
	if status != StatusDone {
		t.Fatalf("回复状态期望 %q，实际 %q", StatusDone, status)
	}
	if text != "两个计划任务已经创建。" {
		t.Fatalf("回复正文期望 %q，实际 %q", "两个计划任务已经创建。", text)
	}
}
