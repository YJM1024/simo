// Package permission 是 M2 的工具权限求值骨架（六步顺序）。
//
// 顺序（docs/m2-contract.md §6）：
// hooks → deny 规则 → ask 规则 → 权限模式 → allow 规则 → canUseTool。
// 纪律：
//   - hook 返回 allow 不能跳过 deny；deny 在 bypass 模式下仍生效；
//   - 自动批准（allow 命中）永远不调用 canUseTool，并记录 warning；
//   - 未命中任何规则且没有 canUseTool → 拒绝（fail-closed）。
package permission

import (
	"context"
	"path"
	"strings"
)

// Verdict 是权限结果。
type Verdict string

const (
	Allow Verdict = "allow"
	Deny  Verdict = "deny"
	Ask   Verdict = "ask"
)

// Request 是一次工具权限请求。
type Request struct {
	Tool string
	Args map[string]any
	Role string
	Mode string // default | auto | ask | plan | bypass
}

// Result 是求值结果。
type Result struct {
	Verdict           Verdict `json:"verdict"`
	Rule              string  `json:"rule"`
	Reason            string  `json:"reason,omitempty"`
	AutoApproved      bool    `json:"autoApproved"`
	ReachedCanUseTool bool    `json:"reachedCanUseTool"`
}

// Hook 是权限 hook（M2 骨架：可返回 deny/ask/allow；allow 不跳过后续 deny）。
type Hook func(ctx context.Context, req Request) (Verdict, string, bool)

// CanUseTool 是最后一道回调（只有未被自动批准/拒绝的工具会到这里）。
type CanUseTool func(ctx context.Context, req Request) (Verdict, string)

// Policy 是六步求值器。
type Policy struct {
	Hooks      []Hook
	DenyRules  []string
	AskRules   []string
	AllowRules []string
	Mode       string
	CanUseTool CanUseTool
}

// NewDefault 是 M5 默认策略：只读 allow；write 类进入 ask（待审批）；delete 等 deny。
func NewDefault() *Policy {
	return &Policy{
		DenyRules:  []string{"delete_*", "delete", "rm_*", "rm", "shell*", "exec*", "drop_*"},
		AskRules:   []string{"write_file", "write_*", "edit_*", "patch_*"},
		AllowRules: []string{"read_file", "list_dir", "search_text"},
		Mode:       "default",
	}
}

// Evaluate 按六步顺序求值。
func (p *Policy) Evaluate(ctx context.Context, req Request) Result {
	if p == nil {
		return Result{Verdict: Deny, Rule: "no-policy", Reason: "权限策略未配置"}
	}
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = p.Mode
	}

	// 1) hooks
	for i, hook := range p.Hooks {
		if hook == nil {
			continue
		}
		verdict, reason, decided := hook(ctx, req)
		if !decided {
			continue
		}
		if verdict == Deny {
			return Result{Verdict: Deny, Rule: "hook", Reason: reason}
		}
		if verdict == Ask {
			// hook 的 ask 不跳过 deny/allow，只记录；继续后续步骤。
			_ = reason
		}
		_ = i
	}

	// 2) deny 规则
	if rule := matchAny(p.DenyRules, req.Tool); rule != "" {
		return Result{Verdict: Deny, Rule: "deny:" + rule, Reason: "工具被 deny 规则拒绝"}
	}

	// 3) ask 规则
	if rule := matchAny(p.AskRules, req.Tool); rule != "" {
		return Result{Verdict: Ask, Rule: "ask:" + rule, Reason: "工具需要人工确认"}
	}

	// 4) 权限模式（deny 已生效，不会被 bypass 绕过）
	switch strings.ToLower(mode) {
	case "bypass":
		return Result{Verdict: Allow, Rule: "mode:bypass", AutoApproved: true, Reason: "bypass 模式（deny 仍已生效）"}
	case "plan":
		// plan 模式只允许只读工具；此时 allow 规则尚未求值，先只放行明确只读。
		if rule := matchAny(p.AllowRules, req.Tool); rule == "" {
			return Result{Verdict: Deny, Rule: "mode:plan", Reason: "plan 模式只允许只读工具"}
		}
	case "ask":
		// 继续走 allow；未命中由 canUseTool/兜底处理。
	}

	// 5) allow 规则（自动批准不再走 canUseTool）
	if rule := matchAny(p.AllowRules, req.Tool); rule != "" {
		return Result{Verdict: Allow, Rule: "allow:" + rule, AutoApproved: true}
	}

	// 6) canUseTool
	if p.CanUseTool != nil {
		verdict, reason := p.CanUseTool(ctx, req)
		if verdict == "" {
			verdict = Deny
		}
		return Result{Verdict: verdict, Rule: "canUseTool", Reason: reason, ReachedCanUseTool: true}
	}
	return Result{Verdict: Deny, Rule: "fallback", Reason: "未命中任何规则且没有 canUseTool（fail-closed）"}
}

func matchAny(patterns []string, tool string) string {
	tool = strings.TrimSpace(tool)
	for _, pattern := range patterns {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if pattern == "*" || pattern == tool {
			return pattern
		}
		if strings.ContainsAny(pattern, "*?[") {
			if ok, err := path.Match(strings.ToLower(pattern), strings.ToLower(tool)); err == nil && ok {
				return pattern
			}
		}
	}
	return ""
}
