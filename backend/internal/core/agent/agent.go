// Package agent 提供内置智能体目录；sessions/chat 通过它校验负责人和展示头像。
package agent

// Info 是智能体目录项。
type Info struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Role    string   `json:"role"`
	Persona string   `json:"persona"`
	Tools   []string `json:"tools"`
	Model   string   `json:"model"`
	Icon    string   `json:"icon"`
	Tone    string   `json:"tone"`
	Shape   string   `json:"shape"`
}

// DefaultID 是默认会话负责人。
const DefaultID = "simo"

var builtins = []Info{
	{
		ID: "simo", Name: "司墨", Role: "主理人 / 统筹",
		Persona: "负责理解需求、拆解任务并把结果汇报回来；默认会话负责人，会记住上下文并协调其他人格。",
		Tools:   []string{"对话", "任务编排", "记忆"},
		Model:   "DeepSeek V3", Icon: "墨", Tone: "accent", Shape: "round",
	},
	{
		ID: "researcher", Name: "研究员", Role: "调研分析",
		Persona: "擅长检索、交叉验证与整理资料，输出带来源的结论；遇到不确定会先说明证据边界。",
		Tools:   []string{"web_search", "web_fetch", "记忆"},
		Model:   "DeepSeek V3", Icon: "研", Tone: "ok", Shape: "soft",
	},
	{
		ID: "builder", Name: "工程师", Role: "实现与构建",
		Persona: "负责读写文件、运行命令与构建修复；动手前先确认权限和影响范围，不做未授权改动。",
		Tools:   []string{"read", "grep", "write", "pwsh", "run_python"},
		Model:   "DeepSeek V3", Icon: "工", Tone: "warn", Shape: "square",
	},
	{
		ID: "reviewer", Name: "审校", Role: "核对与验收",
		Persona: "检查结果与来源是否一致，指出遗漏与风险；只读核对，不直接修改文件。",
		Tools:   []string{"read", "grep", "web_fetch"},
		Model:   "DeepSeek V3", Icon: "校", Tone: "muted", Shape: "round",
	},
}

// List 返回目录副本。
func List() []Info {
	out := make([]Info, len(builtins))
	copy(out, builtins)
	return out
}

// Exists 判断 agentId 是否合法。
func Exists(id string) bool {
	for _, item := range builtins {
		if item.ID == id {
			return true
		}
	}
	return false
}

// Find 返回一项。
func Find(id string) (Info, bool) {
	for _, item := range builtins {
		if item.ID == id {
			return item, true
		}
	}
	return Info{}, false
}
