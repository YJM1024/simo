package task

import (
	"context"
	"regexp"
	"strings"
)

// 对话入口的方案端口（PRD-TASK-004，DEC-39）。
// chat 模块只依赖这里的接口，不 import tasks 包；判定与落库仍在 tasks 模块里复用同一份逻辑。

// StepReason 记录步骤从原文里怎么拆出来的，供判定理由透出到方案卡与事件（DEC-43）。
type StepReason struct {
	Source  string   `json:"source"`
	Count   int      `json:"count"`
	Markers []string `json:"markers,omitempty"`
}

// 步骤来源闭集。
const (
	StepSourceLineNumbers   = "line_numbers"
	StepSourceInlineNumbers = "inline_numbers"
	StepSourceSequence      = "sequence_words"
	StepSourceNone          = "none"
)

// Label 把来源写成中文，直接进判定理由。
func (r StepReason) Label() string {
	switch r.Source {
	case StepSourceLineNumbers:
		return "行首编号"
	case StepSourceInlineNumbers:
		return "行内编号"
	case StepSourceSequence:
		return "顺序词或分号"
	default:
		return "无编号或顺序词"
	}
}

// PlanRequest 是对话回合交给方案端口的输入。复杂度不从模型拿，只由原文派生的步骤与显式标记决定。
type PlanRequest struct {
	RequestText string     `json:"requestText"`
	Title       string     `json:"title"`
	Goal        string     `json:"goal"`
	Steps       []string   `json:"steps"`
	StepReason  StepReason `json:"stepReason"`
	MultiRound  bool       `json:"multiRound"`
	CrossDomain bool       `json:"crossDomain"`
}

// PlanDecision 是方案端口的结果。RequiresConfirmation 为 false 表示 C0/C1，调用方直接回答、不建任务。
type PlanDecision struct {
	Complexity           string `json:"complexity"`
	Reason               string `json:"reason"`
	RequiresConfirmation bool   `json:"requiresConfirmation"`
	PlanID               string `json:"planId,omitempty"`
	PlanMessageID        string `json:"planMessageId,omitempty"`
	TaskCount            int    `json:"taskCount"`
	ChildSessionCount    int    `json:"childSessionCount"`
}

// PlanCreator 由 tasks 模块实现，供对话入口在确认前落一张方案卡。
type PlanCreator interface {
	PlanTask(ctx context.Context, sessionID string, input PlanRequest) (PlanDecision, error)
}

// 显式列表标记：- * • ·、1. 1) 1、、（1）、一、等。只认行首标记，避免把日期与版本号当成步骤。
var planStepMarker = regexp.MustCompile(`^(?:[-*•·]\s+|[（(]\d{1,2}[）)]\s*|\d{1,2}[.)、）]\s*|[一二三四五六七八九十]{1,3}[、.]\s*)`)

var planSequenceWords = []string{"先", "再", "然后", "接着", "之后", "随后", "最后", "其次"}

// DerivePlanSteps 从用户原文派生计划步骤，供对话入口走同一套复杂度判定。
// 只做确定性拆分：优先认行首编号/项目符号；没有列表时，只有在出现顺序词或分号时才按句切分。
// 普通叙述不留步骤，避免把一次问答误判成需要确认的方案。第二个返回值是拆分依据（DEC-43）。
func DerivePlanSteps(text string) ([]string, StepReason) {
	normalized := strings.TrimSpace(strings.ReplaceAll(text, "\r\n", "\n"))
	if normalized == "" {
		return nil, StepReason{Source: StepSourceNone}
	}

	listed := make([]string, 0, 8)
	lineMarkers := make([]string, 0, 8)
	for _, line := range strings.Split(normalized, "\n") {
		trimmed := strings.TrimSpace(line)
		if !planStepMarker.MatchString(trimmed) {
			continue
		}
		marker := strings.TrimSpace(planStepMarker.FindString(trimmed))
		step := strings.TrimSpace(planStepMarker.ReplaceAllString(trimmed, ""))
		if len([]rune(step)) >= 2 {
			listed = append(listed, step)
			lineMarkers = append(lineMarkers, marker)
		}
	}
	if len(listed) >= 2 {
		return listed, StepReason{Source: StepSourceLineNumbers, Count: len(listed), Markers: capMarkers(lineMarkers)}
	}
	// 单行编号列表（“1. … 2. … 3. …”）在中文里很常见，行首标记识别不到，按标点后的编号再切一次。
	if inline, markers := splitInlineNumbered(normalized); len(inline) >= 2 {
		return inline, StepReason{Source: StepSourceInlineNumbers, Count: len(inline), Markers: capMarkers(markers)}
	}

	if !hasPlanSequence(normalized) {
		// 无编号、无序词：不派生步骤，理由如实说明是原文没有可拆标记。
		return listed, StepReason{Source: StepSourceNone, Count: len(listed)}
	}
	reason := StepReason{Source: StepSourceSequence, Count: len(listed), Markers: capMarkers(sequenceMarkers(normalized))}
	clauses := splitPlanClauses(normalized)
	if len(clauses) >= len(listed) {
		reason.Count = len(clauses)
		return clauses, reason
	}
	return listed, reason
}

// capMarkers 限制进事件与方案卡的命中片段数量，避免长列表撑大载荷。
func capMarkers(markers []string) []string {
	limit := 6
	if len(markers) == 0 {
		return nil
	}
	if len(markers) > limit {
		markers = markers[:limit]
	}
	return markers
}

// sequenceMarkers 给出命中的顺序词；只有分号命中时回退成分号本身。
func sequenceMarkers(text string) []string {
	markers := make([]string, 0, len(planSequenceWords))
	for _, word := range planSequenceWords {
		if strings.Contains(text, word) {
			markers = append(markers, word)
		}
	}
	if len(markers) == 0 && strings.ContainsAny(text, "；;") {
		markers = append(markers, "；")
	}
	return markers
}

// 多轮与跨域是 C3/C4 的触发词。对话入口不读模型判定，只按原文里的显式线索置位，
// 线索必须足够具体，避免把一次普通问答抬成需要确认的方案。
var planMultiRoundWords = []string{"多轮", "迭代", "分阶段", "逐步推进", "反复打磨", "来回修改"}

var planCrossDomainWords = []string{"跨模块", "前后端", "端到端", "多系统", "多个模块", "全栈"}

// PlanFlags 返回对话原文派生的复杂度标记。
func PlanFlags(text string) (multiRound, crossDomain bool) {
	lowered := strings.ToLower(text)
	for _, word := range planMultiRoundWords {
		if strings.Contains(lowered, word) {
			multiRound = true
			break
		}
	}
	for _, word := range planCrossDomainWords {
		if strings.Contains(lowered, word) {
			crossDomain = true
			break
		}
	}
	return multiRound, crossDomain
}

// 单行编号列表：编号前必须是分隔标点或空白，避免命中版本号与小数。
var planInlineMarker = regexp.MustCompile(`[：:，,。；;、\s](?:\d{1,2}[.)、）]|[（(]\d{1,2}[）)])`)

// splitInlineNumbered 把“说明：1. 甲 2. 乙 3. 丙”切成甲/乙/丙；少于两段返回 nil。
// 第二个返回值是命中的编号片段，用于判定理由。
func splitInlineNumbered(text string) ([]string, []string) {
	indexes := planInlineMarker.FindAllStringIndex(text, -1)
	if len(indexes) < 2 {
		return nil, nil
	}
	steps := make([]string, 0, len(indexes))
	markers := make([]string, 0, len(indexes))
	for i, at := range indexes {
		end := len(text)
		if i+1 < len(indexes) {
			end = indexes[i+1][0]
		}
		start := at[1]
		// “1.5 倍”这类小数不是编号：编号后紧跟数字就跳过。
		if start < len(text) && text[start] >= '0' && text[start] <= '9' {
			continue
		}
		step := strings.TrimSpace(text[start:end])
		step = strings.Trim(step, "：:，,。；;、 ")
		if len([]rune(step)) >= 2 {
			steps = append(steps, step)
			marker := strings.Trim(strings.TrimSpace(text[at[0]:at[1]]), "：:，,。；;、 ")
			if marker != "" {
				markers = append(markers, marker)
			}
		}
	}
	if len(steps) < 2 {
		return nil, nil
	}
	return steps, markers
}

func hasPlanSequence(text string) bool {
	if strings.ContainsAny(text, "；;") {
		return true
	}
	for _, word := range planSequenceWords {
		if strings.Contains(text, word) {
			return true
		}
	}
	return false
}

// splitPlanClauses 按句末标点和逗号切分，去掉空段与结尾标点。
func splitPlanClauses(text string) []string {
	parts := strings.FieldsFunc(text, func(r rune) bool {
		switch r {
		case '。', '！', '？', '；', ';', '!', '?', '\n', '，', ',':
			return true
		}
		return false
	})
	steps := make([]string, 0, len(parts))
	for _, part := range parts {
		step := strings.TrimSpace(part)
		if len([]rune(step)) >= 2 {
			steps = append(steps, step)
		}
	}
	return steps
}
