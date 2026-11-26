package task

import (
	"strconv"
	"strings"
)

// 复杂度分级（PRD-TASK-004，DEC-39）。唯一口径见 docs/task-complexity.md：
// C0 即时、C1 轻任务、C2 当前会话任务、C3 一个子会话任务、C4 多子会话协作。
const (
	ComplexityC0 = "C0"
	ComplexityC1 = "C1"
	ComplexityC2 = "C2"
	ComplexityC3 = "C3"
	ComplexityC4 = "C4"

	PlanStatusPending   = "pending"
	PlanStatusConfirmed = "confirmed"
	PlanStatusRejected  = "rejected"
)

// ComplexityInput 是判定用的请求特征；全部来自创建请求本身，不引入额外模型。
type ComplexityInput struct {
	Steps       []string         `json:"steps"`
	StepReason  StepReason       `json:"stepReason"`
	Tasks       []BatchTaskInput `json:"tasks"`
	MultiRound  bool             `json:"multiRound"`
	CrossDomain bool             `json:"crossDomain"`
}

// Classification 是一次分级的结果，同时给出方案卡要展示的数量与可解释的判定依据（DEC-43）。
type Classification struct {
	Complexity        string     `json:"complexity"`
	StepCount         int        `json:"stepCount"`
	TaskCount         int        `json:"taskCount"`
	ChildSessionCount int        `json:"childSessionCount"`
	Reason            string     `json:"reason"`
	StepReason        StepReason `json:"stepReason"`
	MultiRound        bool       `json:"multiRound"`
	CrossDomain       bool       `json:"crossDomain"`
}

// Classify 按步数、是否需要多轮、是否跨域判定 C0–C4。
// 规则保持闭集：步数 >= 8 或 3 个以上任务视为跨域协作；crossDomain 显式置位同样升到 C4；
// multiRound（或 2 个任务）升到 C3；其余按步数落到 C2/C1/C0。
// Reason 同时写出命中的信号，避免“单行多步被判 C0”这类结果无法解释。
func Classify(input ComplexityInput) Classification {
	stepCount := len(input.Steps)
	if stepCount == 0 {
		for _, item := range input.Tasks {
			if n := len(item.Steps); n > 0 {
				stepCount += n
			} else {
				stepCount++
			}
		}
	}
	if stepCount == 0 {
		stepCount = 1
	}
	crossDomain := input.CrossDomain || len(input.Tasks) >= 3 || stepCount >= 8
	multiRound := input.MultiRound || len(input.Tasks) == 2

	level := ComplexityC0
	taskCount := 0
	childSessionCount := 0
	switch {
	case crossDomain:
		level = ComplexityC4
		childSessionCount = 3
		if len(input.Tasks) >= 4 || stepCount >= 8 {
			childSessionCount = 4
		}
		taskCount = childSessionCount
	case multiRound:
		level = ComplexityC3
		taskCount = 1
		childSessionCount = 1
	case stepCount >= 3:
		level = ComplexityC2
		taskCount = 1
	case stepCount == 2:
		level = ComplexityC1
	}

	return Classification{
		Complexity:        level,
		StepCount:         stepCount,
		TaskCount:         taskCount,
		ChildSessionCount: childSessionCount,
		Reason:            classifyReason(input, stepCount, crossDomain, multiRound, level),
		StepReason:        input.StepReason,
		MultiRound:        multiRound,
		CrossDomain:       crossDomain,
	}
}

// classifyReason 把判定用到的信号写成一句可读依据：步骤来源、命中片段、跨域与多轮线索、最终等级。
func classifyReason(input ComplexityInput, stepCount int, crossDomain, multiRound bool, level string) string {
	reason := input.StepReason
	if reason.Source == "" {
		reason.Source = StepSourceNone
	}
	parts := []string{"步骤来源 " + reason.Label() + "（" + strconv.Itoa(stepCount) + " 步）"}
	if len(reason.Markers) > 0 {
		parts = append(parts, "命中 "+strings.Join(reason.Markers, "、"))
	}
	if input.CrossDomain {
		parts = append(parts, "请求标注跨域")
	}
	if len(input.Tasks) >= 3 {
		parts = append(parts, "任务数 "+strconv.Itoa(len(input.Tasks))+"≥3 视为跨域")
	}
	if stepCount >= 8 {
		parts = append(parts, "步数 "+strconv.Itoa(stepCount)+"≥8 视为跨域")
	}
	if input.MultiRound {
		parts = append(parts, "请求标注多轮")
	}
	if len(input.Tasks) == 2 {
		parts = append(parts, "2 个任务视为多轮")
	}
	if crossDomain || multiRound {
		parts = append(parts, "判定 "+level+"（跨域 "+strconv.FormatBool(crossDomain)+"、多轮 "+strconv.FormatBool(multiRound)+"）")
	} else {
		parts = append(parts, "判定 "+level)
	}
	return strings.Join(parts, "；")
}

// TaskPlan 是待确认方案（tasks v11 的 task_plans 表投影）。
// 确认前不建任务、不建子会话，Attempt 固定为 0。
type TaskPlan struct {
	ID                string   `json:"id"`
	SessionID         string   `json:"sessionId"`
	Complexity        string   `json:"complexity"`
	Status            string   `json:"status"`
	PlanMessageID     string   `json:"planMessageId,omitempty"`
	ChildSessionIDs   []string `json:"childSessionIds"`
	TaskIDs           []string `json:"taskIds"`
	PlanSteps         []string `json:"planSteps"`
	RequestText       string   `json:"requestText,omitempty"`
	TaskCount         int      `json:"taskCount"`
	ChildSessionCount int      `json:"childSessionCount"`
	Attempt           int      `json:"attempt"`
	CreatedAt         int64    `json:"createdAt"`
	DecidedAt         int64    `json:"decidedAt,omitempty"`
	ExpiresAt         int64    `json:"expiresAt,omitempty"`
	RejectedReason    string   `json:"rejectedReason,omitempty"`
}

// TaskPlanInput 是 POST /api/sessions/{id}/task-plans 的请求体。
type TaskPlanInput struct {
	RequestText string           `json:"requestText"`
	Title       string           `json:"title"`
	Goal        string           `json:"goal"`
	Steps       []string         `json:"steps"`
	StepReason  StepReason       `json:"stepReason"`
	Tasks       []BatchTaskInput `json:"tasks"`
	MultiRound  bool             `json:"multiRound"`
	CrossDomain bool             `json:"crossDomain"`
}
