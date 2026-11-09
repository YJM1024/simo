package llm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// DeepSeekConfig 是 DeepSeek（OpenAI 兼容）适配器配置。
type DeepSeekConfig struct {
	BaseURL         string
	APIKey          string
	Model           string
	MaxOutputTokens int
	HTTPClient      *http.Client
}

// DeepSeek 用 HTTP SSE 读 OpenAI 兼容的 chat completions 流。
type DeepSeek struct {
	baseURL string
	apiKey  string
	model   string
	maxOut  int
	client  *http.Client
}

// NewDeepSeek 创建 DeepSeek provider。
func NewDeepSeek(cfg DeepSeekConfig) (*DeepSeek, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, errors.New("DeepSeek API key 为空（配置 apiKey 或 DEEPSEEK_API_KEY）")
	}
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if base == "" {
		base = "https://api.deepseek.com"
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "deepseek-flash"
	}
	maxOut := cfg.MaxOutputTokens
	if maxOut <= 0 {
		maxOut = 2048
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{}
	}
	return &DeepSeek{baseURL: base, apiKey: cfg.APIKey, model: model, maxOut: maxOut, client: client}, nil
}

// ModelName 实现 Provider。
func (d *DeepSeek) ModelName() string { return d.model }

type apiMessage struct {
	Role             string     `json:"role"`
	Content          string     `json:"content,omitempty"`
	ReasoningContent string     `json:"reasoning_content,omitempty"`
	ToolCalls        []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID       string     `json:"tool_call_id,omitempty"`
}

type apiRequest struct {
	Model           string       `json:"model"`
	Messages        []apiMessage `json:"messages"`
	Stream          bool         `json:"stream"`
	StreamOptions   streamOption `json:"stream_options"`
	Tools           []Tool       `json:"tools,omitempty"`
	ReasoningEffort string       `json:"reasoning_effort,omitempty"`
	Thinking        *Thinking    `json:"thinking,omitempty"`
	MaxTokens       int          `json:"max_tokens,omitempty"`
	Temperature     float64      `json:"temperature,omitempty"`
}

type streamOption struct {
	IncludeUsage bool `json:"include_usage"`
}

// Stream 实现 Provider；返回的 channel 在 done/error 后关闭。
func (d *DeepSeek) Stream(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = d.model
	}
	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = d.maxOut
	}
	body := apiRequest{
		Model:           model,
		Messages:        make([]apiMessage, 0, len(req.Messages)),
		Stream:          true,
		StreamOptions:   streamOption{IncludeUsage: true},
		Tools:           req.Tools,
		ReasoningEffort: req.ReasoningEffort,
		Thinking:        req.Thinking,
		MaxTokens:       maxTokens,
		Temperature:     req.Temperature,
	}
	for _, msg := range req.Messages {
		body.Messages = append(body.Messages, apiMessage{
			Role:             msg.Role,
			Content:          msg.Content,
			ReasoningContent: msg.ReasoningContent,
			ToolCalls:        msg.ToolCalls,
			ToolCallID:       msg.ToolCallID,
		})
	}
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("序列化模型请求失败: %w", err)
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, d.baseURL+"/chat/completions", bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("创建模型请求失败: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("Authorization", "Bearer "+d.apiKey)

	resp, err := d.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("请求模型失败: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		_ = resp.Body.Close()
		return nil, fmt.Errorf("模型返回 HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(snippet)))
	}

	out := make(chan Event, 16)
	go parseOpenAISSE(ctx, resp.Body, out, model)
	return out, nil
}

type streamChunk struct {
	Model   string `json:"model"`
	Choices []struct {
		Delta struct {
			Content          string            `json:"content"`
			ReasoningContent string            `json:"reasoning_content"`
			ToolCalls        []streamToolDelta `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *streamUsage `json:"usage"`
}

type streamToolDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type streamUsage struct {
	PromptTokens            int `json:"prompt_tokens"`
	CompletionTokens        int `json:"completion_tokens"`
	TotalTokens             int `json:"total_tokens"`
	CompletionTokensDetails struct {
		ReasoningTokens int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
}

func parseOpenAISSE(ctx context.Context, body io.ReadCloser, out chan<- Event, fallbackModel string) {
	defer close(out)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 64*1024), 4<<20)

	tools := make(map[int]*ToolCall)
	order := make([]int, 0, 2)
	var usage *Usage
	model := fallbackModel

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "[DONE]" {
			break
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(payload), &chunk); err != nil {
			sendEvent(ctx, out, Event{Kind: KindError, Err: fmt.Errorf("解析模型流失败: %w", err)})
			return
		}
		if chunk.Model != "" {
			model = chunk.Model
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.ReasoningContent != "" {
				if !sendEvent(ctx, out, Event{Kind: KindReasoning, ReasoningDelta: choice.Delta.ReasoningContent}) {
					return
				}
			}
			if choice.Delta.Content != "" {
				if !sendEvent(ctx, out, Event{Kind: KindDelta, Delta: choice.Delta.Content}) {
					return
				}
			}
			for _, tc := range choice.Delta.ToolCalls {
				index := tc.Index
				call, ok := tools[index]
				if !ok {
					call = &ToolCall{Type: "function"}
					tools[index] = call
					order = append(order, index)
				}
				if tc.ID != "" {
					call.ID = tc.ID
				}
				if tc.Type != "" {
					call.Type = tc.Type
				}
				if tc.Function.Name != "" {
					call.Function.Name = tc.Function.Name
				}
				call.Function.Arguments += tc.Function.Arguments
			}
		}
		if chunk.Usage != nil {
			usage = &Usage{
				PromptTokens:     int64(chunk.Usage.PromptTokens),
				CompletionTokens: int64(chunk.Usage.CompletionTokens),
				ReasoningTokens:  int64(chunk.Usage.CompletionTokensDetails.ReasoningTokens),
				TotalTokens:      int64(chunk.Usage.TotalTokens),
				Model:            model,
			}
			if usage.TotalTokens == 0 {
				usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
			}
		}
	}
	if err := scanner.Err(); err != nil {
		if ctx.Err() != nil {
			sendEvent(ctx, out, Event{Kind: KindError, Err: ctx.Err()})
		} else {
			sendEvent(ctx, out, Event{Kind: KindError, Err: fmt.Errorf("读取模型流失败: %w", err)})
		}
		return
	}

	for _, index := range order {
		call := tools[index]
		if call == nil {
			continue
		}
		if !sendEvent(ctx, out, Event{Kind: KindToolCall, ToolCall: call}) {
			return
		}
	}
	if usage != nil {
		if !sendEvent(ctx, out, Event{Kind: KindUsage, Usage: usage}) {
			return
		}
	}
	sendEvent(ctx, out, Event{Kind: KindDone, Done: true})
}
