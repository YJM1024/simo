package chat

import (
	"strings"
	"testing"
)

func TestSystemPromptBudget(t *testing.T) {
	module := &Module{}
	index := module.actionIndexText()
	if len([]rune(index)) > 512 {
		t.Fatalf("action index 超预算: %d", len([]rune(index)))
	}
	total := len([]rune(assistantSystemPrompt)) + len([]rune(index))
	t.Logf("systemPromptChars=%d actionIndexChars=%d totalSystemChars=%d",
		len([]rune(assistantSystemPrompt)), len([]rune(index)), total)
	if total > 2200 {
		t.Fatalf("system 提示超预算: %d", total)
	}
}

func TestSystemPromptMentionsInteractiveCards(t *testing.T) {
	module := &Module{}
	index := module.actionIndexText()
	for _, needle := range []string{"chat.send_card", "fallbackText", "选择", "确认", "填表"} {
		if !strings.Contains(index, needle) {
			t.Fatalf("动作索引缺少卡片引导 %q:\n%s", needle, index)
		}
	}
}

func TestAssistantSystemPromptIncludesMarkdownGuidance(t *testing.T) {
	required := []string{
		"Markdown",
		"回复使用 Markdown 排版",
		"列举用 - 或 1. 列表",
		"``` 代码块",
		"**粗体**",
		"简单表格",
		"标题最多 ###",
		"不要输出原始 HTML",
		"简单问答不要强行套格式",
		"客户端支持 Markdown 渲染",
		"均会正确显示",
		`不要声称"只能纯文本输出"`,
		"不要用 ASCII 字符画模拟排版",
		"除非用户明确要求纯文本",
	}
	for _, needle := range required {
		if !strings.Contains(assistantSystemPrompt, needle) {
			t.Fatalf("system prompt 缺少 Markdown 指令 %q:\n%s", needle, assistantSystemPrompt)
		}
	}
}
