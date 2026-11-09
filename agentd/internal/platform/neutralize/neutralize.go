// Package neutralize 对子代理/工具返回文本做提示注入中和。
//
// 规则（M5）：
//   - 控制标签（<system-reminder>、<assistant>、<system> 等）替换为 [harness: neutralized]；
//   - 行首轮次标记（Human:/Assistant:/System:/User:/Developer:）同样中和；
//   - 只要发生替换，文本中一定带 [harness: neutralized] 标记，便于审计。
package neutralize

import (
	"regexp"
	"strings"
)

var controlTag = regexp.MustCompile(`(?i)</?(system-reminder|system|assistant|user|developer|tool|functions)\s*>`)
var rolePrefix = regexp.MustCompile(`(?im)^[ \t]*(human|assistant|system|user|developer)[ \t]*:`)

// Text 返回中和后的文本；无变化时原样返回。
func Text(input string) string {
	if input == "" {
		return input
	}
	out := controlTag.ReplaceAllString(input, "[harness: neutralized]")
	out = rolePrefix.ReplaceAllString(out, "[harness: neutralized] $1:")
	return out
}

// Neutralized 判断文本是否含控制结构（用于测试/日志）。
func Neutralized(input string) bool {
	return strings.Contains(Text(input), "[harness: neutralized]")
}
