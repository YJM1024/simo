package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/platform/llm"
	"simo/internal/platform/sqlite"
)

// capturedMessage 保留 reasoning_content 的原始形态：空指针 = 请求体里没有该字段。
// 真实上游在思考模式下只要历史里有 assistant 消息就要求该字段存在，字段缺失会以
// HTTP 400 拒绝整轮请求（真机证据见 .tmp/chg-007-reasoning-2/）；“空串是否被接受”
// 尚未验证，因此客户端一律回传非空内容，缺少原文时用 llm.ReasoningPlaceholder。
type capturedMessage struct {
	Role             string         `json:"role"`
	Content          string         `json:"content"`
	ReasoningContent *string        `json:"reasoning_content"`
	ToolCalls        []llm.ToolCall `json:"tool_calls"`
	ToolCallID       string         `json:"tool_call_id"`
}

type capturedChatRequest struct {
	Messages []capturedMessage `json:"messages"`
	Tools    []llm.Tool        `json:"tools"`
}

// TestReasoningContentEchoedOnToolLoop 用假上游复刻 DeepSeek 思考模式的约束：
// 第二轮请求里带工具调用的 assistant 消息必须出现 reasoning_content 字段，
// 缺失就返回 HTTP 400。两个子用例分别覆盖“有思考内容”与“模型给出空思考”两种情况。
func TestReasoningContentEchoedOnToolLoop(t *testing.T) {
	cases := []struct {
		name      string
		reasoning string
	}{
		{name: "非空思考内容", reasoning: "先读取资料"},
		{name: "空思考内容", reasoning: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var (
				mu       sync.Mutex
				requests int
				second   capturedChatRequest
			)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
					http.NotFound(w, r)
					return
				}
				var got capturedChatRequest
				if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
					http.Error(w, "bad request: "+err.Error(), http.StatusBadRequest)
					return
				}
				mu.Lock()
				requests++
				step := requests
				mu.Unlock()
				if step == 1 {
					writeSSEHeaders(t, w)
					flusher, ok := w.(http.Flusher)
					if !ok {
						http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
						return
					}
					if tc.reasoning != "" {
						frame, _ := json.Marshal(map[string]any{
							"model":   "fake-upstream",
							"choices": []any{map[string]any{"delta": map[string]any{"reasoning_content": tc.reasoning}}},
						})
						fmt.Fprintf(w, "data: %s\n\n", frame)
						flusher.Flush()
					}
					frame, _ := json.Marshal(map[string]any{
						"model": "fake-upstream",
						"choices": []any{map[string]any{"delta": map[string]any{"tool_calls": []any{map[string]any{
							"index": 0,
							"id":    "call_echo_1",
							"type":  "function",
							"function": map[string]any{
								"name":      "no_such_tool",
								"arguments": "{}",
							},
						}}}}},
					})
					fmt.Fprintf(w, "data: %s\n\n", frame)
					flusher.Flush()
					fmt.Fprint(w, "data: [DONE]\n\n")
					flusher.Flush()
					return
				}

				// 第二轮：模拟 DeepSeek 的严格校验。
				idx := -1
				for i, msg := range got.Messages {
					if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
						idx = i
					}
				}
				if len(got.Tools) == 0 || idx < 0 {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusBadRequest)
					fmt.Fprint(w, `{"error":{"message":"第二轮请求缺少工具定义或带工具调用的 assistant 消息","type":"invalid_request_error"}}`)
					return
				}
				assistant := got.Messages[idx]
				if assistant.ReasoningContent == nil || strings.TrimSpace(*assistant.ReasoningContent) == "" {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusBadRequest)
					fmt.Fprint(w, `{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API.","type":"invalid_request_error"}}`)
					return
				}
				if idx+1 >= len(got.Messages) {
					http.Error(w, "工具结果缺失", http.StatusBadRequest)
					return
				}
				toolMsg := got.Messages[idx+1]
				if toolMsg.Role != "tool" || toolMsg.ToolCallID != assistant.ToolCalls[0].ID {
					http.Error(w, "工具结果没有紧跟 assistant 消息或 tool_call_id 不匹配", http.StatusBadRequest)
					return
				}
				mu.Lock()
				second = got
				mu.Unlock()
				writeSSEHeaders(t, w)
				flusher, ok := w.(http.Flusher)
				if !ok {
					http.Error(w, "response writer 不支持 Flush", http.StatusInternalServerError)
					return
				}
				frame, _ := json.Marshal(map[string]any{
					"model":   "fake-upstream",
					"choices": []any{map[string]any{"delta": map[string]any{"content": "完成"}}},
				})
				fmt.Fprintf(w, "data: %s\n\n", frame)
				fmt.Fprint(w, "data: [DONE]\n\n")
				flusher.Flush()
			}))
			defer upstream.Close()

			provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
				BaseURL: upstream.URL,
				APIKey:  "test-key-not-a-real-token",
				Model:   "fake-model",
			})
			if err != nil {
				t.Fatalf("构造 provider 失败: %v", err)
			}
			mod, db, events := newStopTestModule(t, upstream.URL, provider)
			ctx := context.Background()
			if _, err := mod.startTurn(ctx, "sess-stop", "请用一句话介绍流式输出", ClassRefine, nil, ""); err != nil {
				t.Fatalf("启动回合失败: %v", err)
			}
			replyID := waitForReplyCreated(t, events, "sess-stop", 3*time.Second)
			doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 5*time.Second)
			waitForIdleAfter(t, events, doneID, 3*time.Second)

			mu.Lock()
			gotSecond := second
			total := requests
			mu.Unlock()
			if total < 2 {
				t.Fatalf("期望至少两次上游请求，实际 %d 次", total)
			}
			if len(gotSecond.Messages) == 0 {
				t.Fatal("第二轮请求没有被记录（上游可能返回了 400）")
			}
			idx := -1
			for i, msg := range gotSecond.Messages {
				if msg.Role == "assistant" && len(msg.ToolCalls) > 0 {
					idx = i
				}
			}
			if idx < 0 {
				t.Fatalf("第二轮请求里没有带工具调用的 assistant 消息: %+v", gotSecond.Messages)
			}
			echo := gotSecond.Messages[idx]
			if echo.ReasoningContent == nil {
				t.Fatalf("回填的 assistant 消息缺少 reasoning_content 字段: %+v", echo)
			}
			want := tc.reasoning
			if strings.TrimSpace(want) == "" {
				want = llm.ReasoningPlaceholder
			}
			if *echo.ReasoningContent != want {
				t.Fatalf("reasoning_content 期望 %q，实际 %q", want, *echo.ReasoningContent)
			}
			if len(echo.ToolCalls) != 1 {
				t.Fatalf("期望 1 个工具调用，实际 %d", len(echo.ToolCalls))
			}
			if idx+1 >= len(gotSecond.Messages) || gotSecond.Messages[idx+1].Role != "tool" ||
				gotSecond.Messages[idx+1].ToolCallID != echo.ToolCalls[0].ID {
				t.Fatalf("assistant 之后应紧跟对应工具结果，实际消息序列: %+v", gotSecond.Messages)
			}

			var text, status string
			if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, replyID).Scan(&text, &status); err != nil {
				t.Fatalf("读取回复消息失败: %v", err)
			}
			if status != StatusDone || !strings.Contains(text, "完成") {
				t.Fatalf("回复未正常落库: status=%q text=%q", status, text)
			}
			if count := countAgentDoneMessages(t, db, ctx, "sess-stop"); count != 1 {
				t.Fatalf("期望恰好 1 条完成的 agent 消息，实际 %d", count)
			}
		})
	}
}

// TestTurnFailureOnUpstream400KeepsNoHalfMessage 覆盖上游 400 的异常路径：
// 不落半条消息（回复为空且标记 error，不落任务卡片），回合结束回到 idle。
func TestTurnFailureOnUpstream400KeepsNoHalfMessage(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/chat/completions") {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, `{"error":{"message":"The reasoning_content in the thinking mode must be passed back to the API.","type":"invalid_request_error"}}`)
	}))
	defer upstream.Close()

	provider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
		BaseURL: upstream.URL,
		APIKey:  "test-key-not-a-real-token",
		Model:   "fake-model",
	})
	if err != nil {
		t.Fatalf("构造 provider 失败: %v", err)
	}
	mod, db, events := newStopTestModule(t, upstream.URL, provider)
	ctx := context.Background()
	if _, err := mod.startTurn(ctx, "sess-stop", "请创建任务并整理资料", ClassRefine, nil, ""); err != nil {
		t.Fatalf("启动回合失败: %v", err)
	}
	replyID := waitForReplyCreated(t, events, "sess-stop", 3*time.Second)
	doneID := waitForReplyEvent(t, events, replyID, eventlog.TypeReplyDone, 5*time.Second)
	waitForIdleAfter(t, events, doneID, 3*time.Second)

	var text, status string
	if err := db.QueryRow(ctx, `SELECT text, status FROM messages WHERE id = ?`, replyID).Scan(&text, &status); err != nil {
		t.Fatalf("读取回复消息失败: %v", err)
	}
	if status != StatusError {
		t.Fatalf("上游 400 后回复状态应为 %q，实际 %q", StatusError, status)
	}
	if text != "" {
		t.Fatalf("上游 400 后不应留下半条消息，实际文本 %q", text)
	}
	if count := countAgentDoneMessages(t, db, ctx, "sess-stop"); count != 0 {
		t.Fatalf("不应有标记完成的 agent 消息，实际 %d 条", count)
	}
	var taskCards int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ? AND category = 'task'`, "sess-stop").Scan(&taskCards); err != nil {
		t.Fatalf("统计任务卡片失败: %v", err)
	}
	if taskCards != 0 {
		t.Fatalf("上游 400 不该落任务卡片，实际 %d 条", taskCards)
	}
}

func countAgentDoneMessages(t *testing.T, db *sqlite.DB, ctx context.Context, sessionID string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM messages WHERE session_id = ? AND role = 'agent' AND status = ?`, sessionID, StatusDone).Scan(&n); err != nil {
		t.Fatalf("统计 agent 消息失败: %v", err)
	}
	return n
}

func writeSSEHeaders(t *testing.T, w http.ResponseWriter) {
	t.Helper()
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
}
