// Package tokenmeter 是 token 计量的单一入口（M1 最小版）。
//
// M1 只做估算：provider usage 优先，缺失时用确定性启发式兜底。
// 真实模型接进来（M2）后，ProviderUsageSource 返回 provider 上报的 usage，
// 预算/压缩/UI/评测都读同一个 Meter，避免各算各的（design/19 INV-10）。
package tokenmeter

import "sync"

// Usage 是一次结算的用量。
type Usage struct {
	PromptTokens     int64  `json:"promptTokens"`
	CompletionTokens int64  `json:"completionTokens"`
	ReasoningTokens  int64  `json:"reasoningTokens,omitempty"`
	TotalTokens      int64  `json:"totalTokens"`
	Estimated        bool   `json:"estimated"`
	Model            string `json:"model,omitempty"`
}

// ProviderUsage 是 provider 上报的原始 usage（M2 使用）。
type ProviderUsage struct {
	InputTokens       int64  `json:"inputTokens"`
	OutputTokens      int64  `json:"outputTokens"`
	CachedInputTokens int64  `json:"cachedInputTokens"`
	ReasoningTokens   int64  `json:"reasoningTokens"`
	Model             string `json:"model,omitempty"`
}

// AsUsage 把 provider usage 转成统一 Usage；Total 不重复计算 cached（cached 已含在 input）。
func (p ProviderUsage) AsUsage() Usage {
	return Usage{
		PromptTokens:     p.InputTokens,
		CompletionTokens: p.OutputTokens,
		ReasoningTokens:  p.ReasoningTokens,
		TotalTokens:      p.InputTokens + p.OutputTokens,
		Estimated:        false,
		Model:            p.Model,
	}
}

// ProviderUsageSource 是 provider usage 的预留来源接口（M2 由真实模型适配器实现）。
type ProviderUsageSource interface {
	LastUsage() (ProviderUsage, bool)
}

// Meter 累计本进程的估算/真实用量；并发安全。
type Meter struct {
	mu            sync.Mutex
	prompt        int64
	completion    int64
	reasoning     int64
	calls         int64
	providerCalls int64
	roles         map[string]Usage
}

// Report 是给接口/日志的用量快照。
type Report struct {
	Total  Usage            `json:"total"`
	ByRole map[string]Usage `json:"byRole"`
	Calls  int64            `json:"calls"`
}

// New 创建计量器。
func New() *Meter { return &Meter{roles: make(map[string]Usage)} }

// RecordProvider 记录一次 provider 上报的 usage（M2：真实/ mock 模型都走这里）。
// 真实 usage 优先于估算；按角色累计，便于 /api/usage 与日志归因。
func (m *Meter) RecordProvider(role string, usage Usage) {
	if role == "" {
		role = "unknown"
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.prompt += usage.PromptTokens
	m.completion += usage.CompletionTokens
	m.reasoning += usage.ReasoningTokens
	m.calls++
	m.providerCalls++
	perRole := m.roles[role]
	perRole.PromptTokens += usage.PromptTokens
	perRole.CompletionTokens += usage.CompletionTokens
	perRole.ReasoningTokens += usage.ReasoningTokens
	perRole.TotalTokens += usage.TotalTokens
	perRole.Estimated = false
	if usage.Model != "" {
		perRole.Model = usage.Model
	}
	m.roles[role] = perRole
}

// Estimate 用确定性启发式估算 token 数：
//   - CJK/非 ASCII：约 1 token/字；
//   - ASCII：约 4 字符/token；
//   - 空串为 0，非空至少 1。
//
// 这只是 M1 占位，中文/JSON 误差大；M2 接 provider usage 后不再用估算做账。
func Estimate(text string) int64 {
	var ascii, wide int64
	for _, r := range text {
		if r < 0x80 {
			ascii++
		} else {
			wide++
		}
	}
	tokens := wide + (ascii+3)/4
	if tokens == 0 && text != "" {
		tokens = 1
	}
	return tokens
}

// Resolve 优先采用 provider 上报的 usage；否则估算并累计。
// 返回值可直接写入事件/指标；Estimated 字段标明是否估算。
func (m *Meter) Resolve(source ProviderUsageSource, promptText, completionText string) Usage {
	if source != nil {
		if usage, ok := source.LastUsage(); ok {
			return usage.AsUsage()
		}
	}
	prompt := Estimate(promptText)
	completion := Estimate(completionText)
	m.mu.Lock()
	m.prompt += prompt
	m.completion += completion
	m.calls++
	m.mu.Unlock()
	return Usage{
		PromptTokens:     prompt,
		CompletionTokens: completion,
		TotalTokens:      prompt + completion,
		Estimated:        true,
	}
}

// Snapshot 返回本进程累计用量。
func (m *Meter) Snapshot() Usage {
	m.mu.Lock()
	defer m.mu.Unlock()
	return Usage{
		PromptTokens:     m.prompt,
		CompletionTokens: m.completion,
		ReasoningTokens:  m.reasoning,
		TotalTokens:      m.prompt + m.completion,
		Estimated:        m.providerCalls == 0,
	}
}

// Report 返回总量 + 按角色拆分（/api/usage 使用）。
func (m *Meter) Report() Report {
	m.mu.Lock()
	defer m.mu.Unlock()
	byRole := make(map[string]Usage, len(m.roles))
	for role, usage := range m.roles {
		byRole[role] = usage
	}
	return Report{
		Total: Usage{
			PromptTokens:     m.prompt,
			CompletionTokens: m.completion,
			ReasoningTokens:  m.reasoning,
			TotalTokens:      m.prompt + m.completion,
			Estimated:        m.providerCalls == 0,
		},
		ByRole: byRole,
		Calls:  m.calls,
	}
}

// Calls 返回已结算次数。
func (m *Meter) Calls() int64 {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls
}
