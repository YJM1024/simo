package chat

import (
	"context"
	"strings"
)

type internalTurnKey struct{}

func withInternalTurn(ctx context.Context) context.Context {
	return context.WithValue(ctx, internalTurnKey{}, true)
}

func isInternalTurn(ctx context.Context) bool {
	value, _ := ctx.Value(internalTurnKey{}).(bool)
	return value
}

func isInternalControlText(text string) bool {
	trimmed := strings.TrimSpace(text)
	for _, prefix := range []string{"[卡片操作]", "[系统]", "[内部]", "[tool]", "[工具]"} {
		if strings.HasPrefix(trimmed, prefix) {
			return true
		}
	}
	return false
}

// M71：只有“明确动作 + 交付物/多步工作”才进入后台任务。
// 简单问答、解释、追问都留在对话循环，不产生 task.created。
func classifyTaskIntent(text string) (bool, string) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false, "empty"
	}
	if isInternalControlText(trimmed) {
		return false, "internal_control"
	}
	lower := strings.ToLower(trimmed)
	question := isSimpleQuestion(trimmed)
	strongAction := hasAny(lower, []string{
		"整理", "生成", "实现", "修复", "调研", "规划", "设计", "搭建", "开发", "导出",
		"排序", "列一个", "列出", "写一份", "写个", "写一个", "做一个", "做一份", "做一件",
		"创建", "新建", "迁移", "拆分", "部署", "上线", "处理", "完成", "制作", "输出",
		"产出", "落地", "画", "汇总", "清洗", "抓取", "爬取", "对接", "联调", "测试", "验证",
		"build ", "create ", "generate ", "implement ", "fix ", "refactor ",
	})
	deliverable := hasAny(lower, []string{
		"报告", "文档", "表格", "清单", "计划", "方案", "代码", "纪要", "周报", "日报",
		"ppt", "excel", "word", "pdf", "产出", "交付", "成品", "文件", "脚本", "页面",
		"功能", "系统", "流程", "调研", "数据分析", "学习计划", "实施", "测试用例",
	})
	weakAction := hasAny(lower, []string{
		"分析", "总结", "翻译", "查一下", "查查", "搜一下", "读取", "看看", "解释", "介绍", "讲讲",
	})
	if strings.Contains(lower, "任务") && !question {
		return true, "explicit_task_marker"
	}
	if strongAction && deliverable {
		return true, "action_and_deliverable"
	}
	if strongAction && !question {
		return true, "explicit_action"
	}
	if question {
		return false, "simple_question"
	}
	if deliverable && weakAction {
		return true, "deliverable_request"
	}
	return false, "no_actionable_deliverable"
}

func isSimpleQuestion(text string) bool {
	trimmed := strings.TrimSpace(text)
	if strings.HasSuffix(trimmed, "?") || strings.HasSuffix(trimmed, "？") {
		return true
	}
	lower := strings.ToLower(trimmed)
	return hasAny(lower, []string{
		"是什么", "为什么", "怎么", "如何", "哪一", "哪些", "吗", "是不是", "能不能",
		"可以吗", "什么意思", "解释一下", "区别", "原理", "作用", "介绍一下", "讲讲",
	})
}

func hasAny(text string, needles []string) bool {
	for _, needle := range needles {
		if strings.Contains(text, needle) {
			return true
		}
	}
	return false
}
