package chat

import (
	"context"
	"fmt"
	"strings"

	corememory "simo/internal/core/memory"
	coretask "simo/internal/core/task"
	"simo/internal/platform/llm"
	"simo/internal/platform/tokenmeter"
)

var _ coretask.Executor = (*Module)(nil)

// ExecuteTask 是 M10.1 真实任务执行：LLM + M9 工具 + 预算。
func (m *Module) ExecuteTask(ctx context.Context, request coretask.ExecutionRequest) (coretask.ExecutionResult, error) {
	if m.provider == nil {
		return coretask.ExecutionResult{}, fmt.Errorf("LLM provider 未配置")
	}
	maxSteps := request.MaxSteps
	if maxSteps <= 0 {
		maxSteps = 8
	}
	maxTokens := request.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 12000
	}
	system := `你是 simo 的任务执行器。执行用户会话中的一个具体任务，完成后给用户一段自然语言汇报。
要求：
1) 汇报包含结论、产物/文件、下一任务/后续建议；不要用关键词电报体。
2) 需要读资料时用 read/glob/grep；需要写文件用 write/edit；只有确实需要系统命令时才用 pwsh。
3) 工具调用受 M9 权限沙盒约束；需要审批时会返回 PENDING_APPROVAL，此时不要编造成功。
4) 简单分析/整理任务优先直接完成，不要为了探索而启动 pwsh；不要过度使用工具；失败如实说明。
5) 任务产物由系统自动保存；除非任务明确要求修改/写出文件或执行系统命令，否则不要调用 write/edit/pwsh；只读资料整理直接用 read/glob/grep。`
	if !taskNeedsTools(request) {
		system += "\n6) 本任务无需调用任何工具，请直接给出自然语言汇报。"
	}
	messages := []llm.Message{{Role: "system", Content: system}}
	messages = append(messages, llm.Message{Role: "system", Content: m.taskExecutionContext(ctx, request)})
	messages = append(messages, llm.Message{Role: "user", Content: taskExecutionPrompt(request)})
	tools := m.tools
	if !taskNeedsTools(request) {
		tools = nil
	}

	result := coretask.ExecutionResult{}
	finalText := ""
	for step := 0; step < maxSteps; step++ {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		var text, reasoning strings.Builder
		var calls []llm.ToolCall
		var usage llm.Usage
		stream, err := m.provider.Stream(ctx, llm.ChatRequest{
			Model:           m.provider.ModelName(),
			Messages:        messages,
			Tools:           tools,
			ReasoningEffort: m.reasoningDefault,
			MaxTokens:       m.maxOutputTokens,
		})
		if err != nil {
			return result, fmt.Errorf("模型请求失败: %w", err)
		}
		for event := range stream {
			switch event.Kind {
			case llm.KindDelta:
				text.WriteString(event.Delta)
			case llm.KindReasoning:
				reasoning.WriteString(event.ReasoningDelta)
			case llm.KindToolCall:
				if event.ToolCall != nil {
					calls = append(calls, *event.ToolCall)
				}
			case llm.KindUsage:
				if event.Usage != nil {
					usage = *event.Usage
				}
				m.recordTaskUsage(ctx, request, usage)
			case llm.KindError:
				if event.Err != nil {
					return result, event.Err
				}
			}
		}
		result.Steps++
		result.Tokens += int(usage.TotalTokens)
		if strings.TrimSpace(text.String()) != "" {
			finalText = strings.TrimSpace(text.String())
		}
		if result.Tokens > maxTokens {
			result.Budget = true
			result.Summary = fmt.Sprintf("任务超出 token 预算（%d > %d）", result.Tokens, maxTokens)
			result.Report = result.Summary
			return result, nil
		}
		if len(calls) == 0 {
			break
		}
		messages = append(messages, llm.Message{
			Role: "assistant", Content: text.String(), ReasoningContent: reasoning.String(), ToolCalls: calls,
		})
		for _, call := range calls {
			toolResult := m.executeTool(ctx, request.Task.SessionID, call)
			if strings.Contains(toolResult, "PENDING_APPROVAL") {
				result.Paused = true
				result.Summary = "任务需要审批：" + firstLine(toolResult)
				result.Report = "任务执行到需要审批的工具调用，已暂停等待用户确认：" + firstLine(toolResult)
				return result, nil
			}
			messages = append(messages, llm.Message{
				Role: "tool", Content: toolResult, ToolCallID: call.ID,
			})
		}
		if step == maxSteps-1 {
			result.Budget = true
			result.Summary = fmt.Sprintf("任务超出步数预算（%d 步）", maxSteps)
			result.Report = result.Summary
			return result, nil
		}
	}
	if finalText == "" {
		finalText = "任务执行完成，但没有生成文字汇报。"
	}
	result.Report = finalText
	result.Summary = firstLine(finalText)
	return result, nil
}

func (m *Module) recordTaskUsage(ctx context.Context, request coretask.ExecutionRequest, usage llm.Usage) {
	if m.meter == nil || usage.TotalTokens == 0 {
		return
	}
	m.meter.RecordProvider("task", tokenmeter.Usage{
		PromptTokens: usage.PromptTokens, CompletionTokens: usage.CompletionTokens,
		ReasoningTokens: usage.ReasoningTokens, TotalTokens: usage.TotalTokens, Model: usage.Model,
	})
	m.emitInternal(ctx, "usage.recorded", map[string]any{
		"taskId": request.Task.ID, "sessionId": request.Task.SessionID,
		"usage": tokenmeter.Usage{
			PromptTokens: usage.PromptTokens, CompletionTokens: usage.CompletionTokens,
			ReasoningTokens: usage.ReasoningTokens, TotalTokens: usage.TotalTokens, Model: usage.Model,
		},
	})
}

func taskNeedsTools(request coretask.ExecutionRequest) bool {
	text := request.Task.Title + " " + request.Description
	for _, marker := range []string{"不要执行系统命令", "不要写文件", "不要写文件"} {
		if idx := strings.Index(text, marker); idx >= 0 {
			text = text[:idx]
		}
	}
	lower := strings.ToLower(text)
	for _, keyword := range []string{
		"文件", "目录", "代码", "命令", "运行", "执行", "读取", "搜索", "查找", "修改", "写入",
		"file", "dir", "code", "command", "run", "read", "grep", "glob", "write", "edit", "shell", "pwsh",
	} {
		if strings.Contains(lower, keyword) {
			return true
		}
	}
	return false
}

func taskExecutionPrompt(request coretask.ExecutionRequest) string {
	var b strings.Builder
	b.WriteString("当前任务：")
	b.WriteString(request.Task.Title)
	b.WriteString("\n")
	if strings.TrimSpace(request.Description) != "" {
		b.WriteString("任务描述：")
		b.WriteString(request.Description)
		b.WriteString("\n")
	}
	if len(request.Dependencies) > 0 {
		b.WriteString("前置任务结果：\n")
		for _, dep := range request.Dependencies {
			b.WriteString("- ")
			b.WriteString(dep.Title)
			b.WriteString("：")
			b.WriteString(truncateRunes(dep.Summary, 300))
			b.WriteString("\n")
		}
	}
	if len(request.Artifacts) > 0 {
		b.WriteString("已有产物：\n")
		for _, artifact := range request.Artifacts {
			b.WriteString("- ")
			b.WriteString(artifact.Name)
			b.WriteString("\n")
		}
	}
	b.WriteString("请执行并输出面向用户的自然语言汇报（结论/产物/下一任务）。")
	return b.String()
}

func (m *Module) taskExecutionContext(ctx context.Context, request coretask.ExecutionRequest) string {
	var b strings.Builder
	b.WriteString("会话上下文：\n")
	if messages, err := m.listMessages(ctx, request.Task.SessionID); err == nil {
		start := len(messages) - 6
		if start < 0 {
			start = 0
		}
		for _, msg := range messages[start:] {
			if strings.TrimSpace(msg.Text) == "" {
				continue
			}
			b.WriteString(msg.Role)
			b.WriteString("：")
			b.WriteString(truncateRunes(msg.Text, 300))
			b.WriteString("\n")
		}
	}
	if m.memory != nil {
		if found, err := m.memory.Search(ctx, corememory.SearchRequest{
			Query: request.Task.Title, Scopes: []string{"global"}, Limit: 4, MaxChars: 800,
		}); err == nil && len(found.Items) > 0 {
			b.WriteString("相关记忆：\n")
			for _, item := range found.Items {
				b.WriteString("- ")
				b.WriteString(item.Content)
				b.WriteString("\n")
			}
		}
	}
	return b.String()
}

func firstLine(text string) string {
	text = strings.TrimSpace(text)
	if idx := strings.IndexByte(text, '\n'); idx >= 0 {
		text = text[:idx]
	}
	return truncateRunes(text, 500)
}
