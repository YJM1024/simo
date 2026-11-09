// Package llm 是模型适配层（端口）：业务模块只依赖 Provider 接口，不直接发 HTTP。
//
// M2：DeepSeek（OpenAI 兼容，内部 HTTP SSE 读流）+ MockProvider（确定性测试）。
// 纪律（docs/m2-contract.md §3）：
//   - reasoning_content 只进执行轨迹（trace.reasoning），不进用户正文；
//   - 带 tools 的请求，后续 assistant 消息必须回传上一轮 reasoning_content；
//   - API key 只从配置/环境变量读，不写日志。
package llm

import (
	"context"
	"encoding/json"
)

// Message 是发给模型的一条消息；ToolCalls/ToolCallID/ReasoningContent 用于工具回合与 reasoning 回传。
type Message struct {
	Role             string     `json:"role"`
	Content          string     `json:"content,omitempty"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string     `json:"tool_call_id,omitempty"`
}

// ToolCall 是模型请求的一次工具调用。
type ToolCall struct {
	ID       string       `json:"id,omitempty"`
	Type     string       `json:"type,omitempty"` // function
	Function FunctionCall `json:"function"`
}

// FunctionCall 是工具名 + JSON 字符串参数。
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// FunctionDef 是工具 schema。
type FunctionDef struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Parameters  json.RawMessage `json:"parameters,omitempty"`
}

// Tool 是 OpenAI 兼容的工具定义。
type Tool struct {
	Type     string      `json:"type"` // function
	Function FunctionDef `json:"function"`
}

// Thinking 是思考模式配置（预留；DeepSeek 当前以 reasoning_effort 为主）。
type Thinking struct {
	Type string `json:"type,omitempty"` // enabled | disabled
}

// ChatRequest 是一次模型请求。
type ChatRequest struct {
	Model           string
	Messages        []Message
	Tools           []Tool
	ReasoningEffort string
	Thinking        *Thinking
	MaxTokens       int
}

// Usage 是模型 provider 上报的 token 用量。
type Usage struct {
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	ReasoningTokens  int64  `json:"reasoningTokens,omitempty"`
	TotalTokens      int64  `json:"totalTokens"`
	Model            string `json:"model,omitempty"`
}

// EventKind 是流事件类型。
const (
	KindDelta     = "delta"
	KindReasoning = "reasoning"
	KindToolCall  = "tool_call"
	KindUsage     = "usage"
	KindDone      = "done"
	KindError     = "error"
)

// Event 是流式事件；每个流最终以 Done 或 Error 结束。
type Event struct {
	Kind           string
	Delta          string
	ReasoningDelta string
	Usage          *Usage
	ToolCall       *ToolCall
	Done           bool
	Err            error
}

// Provider 是模型端口。
type Provider interface {
	Stream(ctx context.Context, req ChatRequest) (<-chan Event, error)
	ModelName() string
}
