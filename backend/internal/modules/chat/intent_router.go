package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"simo/internal/platform/llm"
)

type routeIntentResult struct {
	Route      string  `json:"route"`
	Title      string  `json:"title"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

func routeConfidenceThreshold() float64 {
	raw := strings.TrimSpace(os.Getenv("SIMO_AUTO_ROUTE_CONFIDENCE"))
	if raw == "" {
		return 0.6
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value <= 0 || value > 1 {
		return 0.6
	}
	return value
}

// classifyRouteIntent 在写入前用同一模型做低 token 意图判定；mock provider 使用确定性回退。
func (m *Module) classifyRouteIntent(ctx context.Context, currentSessionID, text, replySessionID string, explicitSession bool) (routeIntentResult, bool, bool) {
	if !autoRouteEnabled() || currentSessionID != defaultSessionID || explicitSession ||
		explicitMainSessionIntent(text) {
		return routeIntentResult{Route: "main", Confidence: 1}, true, false
	}
	if replySessionID != "" && m.sessionIsActiveChild(ctx, currentSessionID, replySessionID) {
		return routeIntentResult{Route: "existing:" + replySessionID, Confidence: 1, Reason: "reply"}, true, false
	}
	if _, isMock := m.provider.(*llm.Mock); isMock {
		return m.mockRouteIntent(ctx, currentSessionID, text), true, false
	}
	result, err := m.modelRouteIntent(ctx, currentSessionID, text)
	if err != nil {
		m.log.Warn("意图路由判定失败，降级主会话", "err", err)
		return routeIntentResult{Route: "main", Confidence: 1}, false, true
	}
	return result, true, true
}

func (m *Module) modelRouteIntent(ctx context.Context, currentSessionID, text string) (routeIntentResult, error) {
	children := m.autoRouteChildren(ctx, currentSessionID)
	var contextBuilder strings.Builder
	contextBuilder.WriteString("当前会话：主会话（main）\n已有子会话：\n")
	if len(children) == 0 {
		contextBuilder.WriteString("（无）\n")
	}
	for _, child := range children {
		contextBuilder.WriteString("- id=" + child.ID + " 标题=" + truncate(child.Title, 40))
		contextText := truncate(strings.TrimSpace(child.Context), 240)
		if contextText != "" {
			contextBuilder.WriteString(" 近期/目标=" + contextText)
		}
		contextBuilder.WriteString("\n")
	}
	system := `你是消息路由器。判断用户这条消息应归属哪里，只输出 JSON，不要解释：
{"route":"existing:<子会话id>"|"new:<标题>"|"main","confidence":0到1,"reason":"简短"}
规则：
- existing：消息明确属于某个已有子会话（标题/目标/近期内容强相关）。
- new：用户开启了新的需求、项目或独立工作流，需要独立的上下文/交付物；标题不超过20字。
- main：闲聊、追问、补充、对主会话的指令、无法判断或置信度低。
- 一个话题内的追问/补充不要拆 new；没有强关联不要 existing。`
	user := contextBuilder.String() + "\n用户消息：\n" + truncate(text, 2000)
	callCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	stream, err := m.provider.Stream(callCtx, llm.ChatRequest{
		Model: m.provider.ModelName(), MaxTokens: 200, Temperature: 0.1,
		Messages: []llm.Message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
	})
	if err != nil {
		return routeIntentResult{}, err
	}
	var raw strings.Builder
	for event := range stream {
		switch event.Kind {
		case llm.KindDelta:
			raw.WriteString(event.Delta)
		case llm.KindError:
			if event.Err != nil {
				return routeIntentResult{}, event.Err
			}
		case llm.KindDone:
			// 继续读完关闭。
		}
	}
	return parseRouteIntentJSON(raw.String())
}

func parseRouteIntentJSON(raw string) (routeIntentResult, error) {
	raw = strings.TrimSpace(raw)
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end <= start {
		return routeIntentResult{}, fmt.Errorf("意图输出不是 JSON")
	}
	var result routeIntentResult
	if err := json.Unmarshal([]byte(raw[start:end+1]), &result); err != nil {
		return routeIntentResult{}, err
	}
	result.Route = strings.TrimSpace(result.Route)
	result.Title = sanitizeRouteTitle(result.Title)
	if result.Confidence <= 0 {
		result.Confidence = 0.5
	}
	return result, nil
}

func sanitizeRouteTitle(title string) string {
	title = strings.TrimSpace(title)
	title = strings.Trim(title, "：:，,。.「」『』\"'“”‘’[]【】（）() ")
	runes := []rune(title)
	if len(runes) > 20 {
		title = string(runes[:20])
	}
	return strings.TrimSpace(title)
}

// mockRouteIntent 仅用于 mock provider / 单元测试，不影响真实模型路径。
func (m *Module) mockRouteIntent(ctx context.Context, currentSessionID, text string) routeIntentResult {
	children := m.autoRouteChildren(ctx, currentSessionID)
	normalized := normalizeRouteText(text)
	if len(children) > 0 {
		queryGrams := routeBigrams(normalized)
		bestID, bestScore := "", 0.0
		for _, child := range children {
			titleNorm := normalizeRouteText(child.Title)
			if len([]rune(titleNorm)) >= 2 && strings.Contains(normalized, titleNorm) {
				if score := 100 + float64(len([]rune(titleNorm))); score > bestScore {
					bestID, bestScore = child.ID, score
				}
				continue
			}
			score := 0.0
			for gram := range routeBigrams(titleNorm) {
				if queryGrams[gram] {
					score += 3
				}
			}
			contextGrams := routeBigrams(normalizeRouteText(child.Context))
			for gram := range queryGrams {
				if contextGrams[gram] {
					score++
				}
			}
			if score > bestScore {
				bestID, bestScore = child.ID, score
			}
		}
		if bestID != "" && bestScore >= 1 {
			return routeIntentResult{Route: "existing:" + bestID, Confidence: 0.9, Reason: "mock relevance"}
		}
	}
	title, isCreate := parseCreateSessionRequest(text)
	if isCreate {
		return routeIntentResult{Route: "new:" + title, Confidence: 0.9, Reason: "mock explicit create"}
	}
	if isNewSessionIntent(text) {
		// M4 兼容：旧“创建新需求”语义交给 startTurn 的 legacy 分支，避免生成主会话提示。
		return routeIntentResult{Route: "main", Confidence: 0.9, Reason: "mock legacy new session"}
	}
	if mockNewGoalIntent(text) {
		return routeIntentResult{Route: "new:" + mockGeneratedTitle(text), Confidence: 0.8, Reason: "mock new goal"}
	}
	return routeIntentResult{Route: "main", Confidence: 0.9, Reason: "mock main"}
}

func mockNewGoalIntent(text string) bool {
	lower := strings.ToLower(text)
	for _, marker := range []string{
		"我现在有个需求", "我有个需求", "我有一个需求", "帮我做一件事", "帮我做一件",
		"帮我调研", "帮我实现", "帮我做一个", "帮我搭", "这块你来负责", "你来负责",
		"新项目", "新需求", "独立工作流", "从零开始", "帮我完成",
	} {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func mockGeneratedTitle(text string) string {
	title := sessionTitleFromText(text)
	for _, prefix := range []string{"我现在有个需求", "我有个需求", "我有一个需求", "帮我"} {
		title = strings.TrimSpace(strings.TrimPrefix(title, prefix))
	}
	title = cleanCreateSessionTitle(title)
	if title == "" || title == "新需求" {
		title = "新需求"
	}
	return sanitizeRouteTitle(title)
}
