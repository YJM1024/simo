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

// finalizeFake 复刻真机空回复场景：前 toolRounds 次请求只回一个工具调用，直到
// maxModelSteps 用尽；之后只接受不带工具定义的收尾请求，按模式回正文、回空正文
// 或回 HTTP 500。任何 assistant 历史缺非空 reasoning_content 一律 400。
type finalizeFake struct {
	t          *testing.T
	mu         sync.Mutex
	reqs       []capturedChatRequest
	toolRounds int
	failFinal  bool
	emptyFinal bool
	bad        []string
	server     *httptest.Server
}

func newFinalizeFake(t *testing.T, toolRounds int) *finalizeFake {
	t.Helper()
	f := &finalizeFake{t: t, toolRounds: toolRounds}
	f.server = httptest.NewServer(http.HandlerFunc(f.handle))
	t.Cleanup(f.server.Close)
	return f
}

func (f *finalizeFake) recordBad(reason string) {
	f.mu.Lock()
	f.bad = append(f.bad, reason)
	f.mu.Unlock()
}

func (f *finalizeFake) handle(w http.ResponseWriter, r *http.Request) {
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
			f.recordBad(fmt.Sprintf("第 %d 次请求的 assistant 消息缺少非空 reasoning_content", round))
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, `{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API.","type":"invalid_request_error"}}`)
			return
		}
	}

	if round > f.toolRounds {
		// 收尾请求必须禁用工具：带了工具定义就按契约破坏处理。
		if len(got.Tools) != 0 {
			f.recordBad(fmt.Sprintf("收尾请求仍带 %d 个工具定义", len(got.Tools)))
			http.Error(w, "收尾请求不允许带工具", http.StatusBadRequest)
			return
		}
		if f.failFinal {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, `{"error":{"message":"fake 收尾请求失败","type":"server_error"}}`)
			return
		}
		if f.emptyFinal {
			// 只回分类标记行、不写正文：正文为空，必须走失败兜底而不是落 done。
			writeStrictSSE(f.t, w, "收尾时只想好了，但没有写正文", "@@CATEGORY: progress\n")
			return
		}
		writeStrictSSE(f.t, w, "收尾总结", "@@CATEGORY: progress\n\n两个计划任务已经创建，接下来会继续执行并汇报进度。")
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
		"choices": []any{map[string]any{"delta": map[string]any{"reasoning_content": fmt.Sprintf("第 %d 轮继续调用工具", round)}}},
	})
	fmt.Fprintf(w, "data: %s\n\n", reasoning)
	flusher.Flush()
	call, _ := json.Marshal(map[string]any{
		"model": "fake-upstream",
		"choices": []any{map[string]any{"delta": map[string]any{"tool_calls": []any{map[string]any{
			"index": 0,
			"id":    fmt.Sprintf("call_finalize_%d", round),
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

func (f *finalizeFake) request(i int) capturedChatRequest {
	f.mu.Lock()
	defer f.mu.Unlock()
	if i >= len(f.reqs) {
		f.t.Fatalf("期望至少 %d 次上游请求，实际 %d 次", i+1, len(f.reqs))
	}
	return f.reqs[i]
}

func (f *finalizeFake) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.reqs)
}

func (f *finalizeFake) violations() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.bad...)
}

// runFinalizeTurn 跑一个完整回合，返回最终回复的正文与状态。
func runFinalizeTurn(t *testing.T, f *finalizeFake) (text, status string) {
	t.Helper()
	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: f.server.URL,
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
	doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 10*time.Second)
	waitForIdleAfter(t, events, doneID, 3*time.Second)

	if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, replyID).Scan(&text, &status); err != nil {
		t.Fatalf("读取回复失败: %v", err)
	}
	return text, status
}

// TestToolBudgetExhaustedSendsFinalRequest 覆盖真机缺陷：连续工具调用一直到步数
// 上限后，必须再发一次禁用工具的收尾请求，让模型用纯文本总结，最终回复非空且 done。
func TestToolBudgetExhaustedSendsFinalRequest(t *testing.T) {
	if maxModelSteps != 8 {
		t.Fatalf("工具步数上限期望 8（单点定义），实际 %d", maxModelSteps)
	}
	fake := newFinalizeFake(t, maxModelSteps)
	text, status := runFinalizeTurn(t, fake)

	if got := fake.count(); got != maxModelSteps+1 {
		t.Fatalf("期望 %d 次上游请求（%d 步工具 + 1 次收尾），实际 %d 次", maxModelSteps+1, maxModelSteps, got)
	}
	final := fake.request(maxModelSteps)
	if len(final.Tools) != 0 {
		t.Fatalf("收尾请求必须禁用工具，实际带 %d 个工具定义", len(final.Tools))
	}
	if len(final.Messages) == 0 {
		t.Fatal("收尾请求消息为空")
	}
	if last := final.Messages[len(final.Messages)-1]; last.Role != "system" || !strings.Contains(last.Content, "工具调用步数已用尽") {
		t.Fatalf("收尾请求缺少收尾指令，最后一条消息是 %q", last.Role)
	}
	// 前 maxModelSteps 次请求都是工具调用，历史 assistant 全部带思考原文。
	if got := len(final.Messages); got == 0 {
		t.Fatal("收尾请求没有携带历史消息")
	}
	assistants := 0
	for _, msg := range final.Messages {
		if msg.Role == "assistant" {
			assistants++
		}
	}
	if assistants != maxModelSteps {
		t.Fatalf("收尾请求应带回 %d 条 assistant 历史，实际 %d 条", maxModelSteps, assistants)
	}
	if bad := fake.violations(); len(bad) > 0 {
		t.Fatalf("严格上游拒绝了请求: %v", bad)
	}
	if status != StatusDone {
		t.Fatalf("回复状态期望 %q，实际 %q", StatusDone, status)
	}
	if strings.TrimSpace(text) == "" {
		t.Fatal("最终回复正文为空：收尾请求没有落到消息上")
	}
	if text != "两个计划任务已经创建，接下来会继续执行并汇报进度。" {
		t.Fatalf("最终回复正文期望收尾总结，实际 %q", text)
	}
}

// TestToolBudgetExhaustedFinalRequestFailureKeepsMessage 覆盖收尾请求也失败的情况：
// 落一条带失败原因的非空消息，状态为 error，不出现空正文。
func TestToolBudgetExhaustedFinalRequestFailureKeepsMessage(t *testing.T) {
	fake := newFinalizeFake(t, maxModelSteps)
	fake.failFinal = true
	text, status := runFinalizeTurn(t, fake)

	if got := fake.count(); got != maxModelSteps+1 {
		t.Fatalf("期望 %d 次上游请求，实际 %d 次", maxModelSteps+1, got)
	}
	if got := len(fake.request(maxModelSteps).Tools); got != 0 {
		t.Fatalf("收尾请求必须禁用工具，实际带 %d 个工具定义", got)
	}
	if status != StatusError {
		t.Fatalf("回复状态期望 %q，实际 %q", StatusError, status)
	}
	if strings.TrimSpace(text) == "" {
		t.Fatal("收尾失败后回复正文为空")
	}
	if !strings.Contains(text, "工具步数用尽且收尾失败") {
		t.Fatalf("失败消息缺少原因说明，实际 %q", text)
	}
	if !strings.Contains(text, "收尾请求失败") {
		t.Fatalf("失败消息没有带上收尾请求的失败原因，实际 %q", text)
	}
}

// TestToolBudgetExhaustedFinalRequestEmptyBody 覆盖收尾请求只回分类标记、不写正文：
// 仍按空回复处理，落非空失败消息并置 error，而不是 done + 空白气泡。
func TestToolBudgetExhaustedFinalRequestEmptyBody(t *testing.T) {
	fake := newFinalizeFake(t, maxModelSteps)
	fake.emptyFinal = true
	text, status := runFinalizeTurn(t, fake)

	if status != StatusError {
		t.Fatalf("回复状态期望 %q，实际 %q", StatusError, status)
	}
	if strings.TrimSpace(text) == "" {
		t.Fatal("收尾只回分类标记时回复正文为空")
	}
	if !strings.Contains(text, "收尾请求没有返回任何正文") {
		t.Fatalf("失败消息缺少空正文原因，实际 %q", text)
	}
}
