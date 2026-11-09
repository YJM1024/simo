package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestDeepSeekStreamParsesSSE(t *testing.T) {
	var sawAuth, sawStream bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Errorf("path = %s", r.URL.Path)
		}
		sawAuth = strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ")
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		sawStream, _ = body["stream"].(bool)
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		write := func(line string) {
			_, _ = w.Write([]byte(line + "\n\n"))
			if flusher != nil {
				flusher.Flush()
			}
		}
		write(`data: {"model":"deepseek-flash","choices":[{"delta":{"reasoning_content":"思考"}}]}`)
		write(`data: {"choices":[{"delta":{"content":"你"}}]}`)
		write(`data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}`)
		write(`data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5,"completion_tokens_details":{"reasoning_tokens":1}}}`)
		write(`data: [DONE]`)
	}))
	defer srv.Close()

	provider, err := NewDeepSeek(DeepSeekConfig{BaseURL: srv.URL, APIKey: "test-key", Model: "deepseek-flash"})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	ch, err := provider.Stream(ctx, ChatRequest{
		Messages:        []Message{{Role: "user", Content: "hi"}},
		ReasoningEffort: "low",
		MaxTokens:       64,
	})
	if err != nil {
		t.Fatalf("Stream: %v", err)
	}
	var content, reasoning strings.Builder
	var usage *Usage
	for event := range ch {
		switch event.Kind {
		case KindDelta:
			content.WriteString(event.Delta)
		case KindReasoning:
			reasoning.WriteString(event.ReasoningDelta)
		case KindUsage:
			usage = event.Usage
		case KindError:
			t.Fatalf("stream error: %v", event.Err)
		}
	}
	if !sawAuth || !sawStream {
		t.Fatalf("auth=%v stream=%v", sawAuth, sawStream)
	}
	if content.String() != "你好" || reasoning.String() != "思考" {
		t.Fatalf("content=%q reasoning=%q", content.String(), reasoning.String())
	}
	if usage == nil || usage.PromptTokens != 3 || usage.CompletionTokens != 2 || usage.ReasoningTokens != 1 || usage.TotalTokens != 5 {
		t.Fatalf("usage=%+v", usage)
	}
}

func TestDeepSeekToolCallAssembly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\"}}]}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"README.md\\\"}\"}}]}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer srv.Close()
	provider, err := NewDeepSeek(DeepSeekConfig{BaseURL: srv.URL, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	ch, err := provider.Stream(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "read"}}})
	if err != nil {
		t.Fatal(err)
	}
	var call *ToolCall
	for event := range ch {
		if event.Kind == KindToolCall {
			call = event.ToolCall
		}
	}
	if call == nil || call.ID != "call_1" || call.Function.Name != "read_file" || call.Function.Arguments != `{"path":"README.md"}` {
		t.Fatalf("tool call = %+v", call)
	}
}

func TestDeepSeekHTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusBadGateway)
	}))
	defer srv.Close()
	provider, err := NewDeepSeek(DeepSeekConfig{BaseURL: srv.URL, APIKey: "test-key"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.Stream(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}}); err == nil {
		t.Fatal("HTTP 502 应返回错误")
	}
}

func TestMockRecordsRequestsAndToolCalls(t *testing.T) {
	mock := NewMockWithScripts(
		MockScript{ReasoningDeltas: []string{"r1"}, ToolCalls: []ToolCall{{ID: "call_1", Function: FunctionCall{Name: "read_file", Arguments: `{"path":"a.txt"}`}}}},
		MockScript{Deltas: []string{"done"}, Usage: &Usage{PromptTokens: 2, CompletionTokens: 1, TotalTokens: 3}},
	)
	ch, err := mock.Stream(context.Background(), ChatRequest{Messages: []Message{{Role: "user", Content: "hi"}}})
	if err != nil {
		t.Fatal(err)
	}
	var kinds []string
	for event := range ch {
		kinds = append(kinds, event.Kind)
	}
	if len(kinds) == 0 || kinds[len(kinds)-1] != KindDone {
		t.Fatalf("kinds=%v", kinds)
	}
	requests := mock.Requests()
	if len(requests) != 1 || requests[0].Messages[0].Content != "hi" {
		t.Fatalf("requests=%+v", requests)
	}
}

func TestDefaultMockScriptTriggersWriteAndDelete(t *testing.T) {
	write := defaultMockScript(ChatRequest{Messages: []Message{{Role: "user", Content: "请 mock:write 一个文件"}}})
	if len(write.ToolCalls) != 1 || write.ToolCalls[0].Function.Name != "write_file" {
		t.Fatalf("write script = %+v", write.ToolCalls)
	}
	del := defaultMockScript(ChatRequest{Messages: []Message{{Role: "user", Content: "请 mock:delete 删除文件"}}})
	if len(del.ToolCalls) != 1 || del.ToolCalls[0].Function.Name != "delete_file" {
		t.Fatalf("delete script = %+v", del.ToolCalls)
	}
}
