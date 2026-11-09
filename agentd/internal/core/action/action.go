// Package action 是 M20 动作目录的只读元数据；执行器在 chat 模块。
package action

import (
	"encoding/json"
	"strings"
)

type Definition struct {
	Name         string          `json:"name"`
	Namespace    string          `json:"namespace"`
	Description  string          `json:"description"`
	Params       json.RawMessage `json:"params"`
	Risk         string          `json:"risk"`
	Confirmation string          `json:"confirmation"`
	ReadOnly     bool            `json:"readOnly"`
	Idempotent   bool            `json:"idempotent"`
	HTTPRoute    string          `json:"httpRoute"`
	Disabled     bool            `json:"disabled,omitempty"`
}

var definitions = build()

func build() []Definition {
	obj := func(required string) json.RawMessage {
		if required == "" {
			return json.RawMessage(`{"type":"object","properties":{}}`)
		}
		return json.RawMessage(`{"type":"object","properties":{"` + required + `":{"type":"string"}},"required":["` + required + `"]}`)
	}
	def := func(name, route, risk, desc string, readOnly bool, required string) Definition {
		namespace := strings.SplitN(name, ".", 2)[0]
		confirm := "none"
		switch risk {
		case "R3":
			confirm = "approval"
		case "R4", "R5":
			confirm = "destructive"
		}
		return Definition{
			Name: name, Namespace: namespace, Description: desc, Params: obj(required),
			Risk: risk, Confirmation: confirm, ReadOnly: readOnly,
			Idempotent: readOnly || (!strings.Contains(name, "send") && !strings.Contains(name, "create") && !strings.Contains(name, "delete")),
			HTTPRoute:  route,
		}
	}
	out := []Definition{
		def("session.list", "GET /api/sessions", "R0", "列出会话（支持 q/pinned 搜索）", true, ""),
		def("session.get", "GET /api/sessions/{id}/owner", "R0", "读取会话基本信息与负责人", true, "id"),
		def("session.tree", "GET /api/sessions/tree", "R0", "读取会话树", true, ""),
		def("session.create", "POST /api/sessions", "R2", "创建子会话", false, "title"),
		def("session.rename", "PATCH /api/sessions/{id}", "R2", "重命名会话", false, "id"),
		def("session.archive", "POST /api/sessions/{id}/archive", "R2", "归档会话", false, "id"),
		def("session.unarchive", "POST /api/sessions/{id}/unarchive", "R2", "恢复归档会话", false, "id"),
		def("session.move", "PATCH /api/sessions/{id}", "R2", "移动会话到新父会话", false, "id"),
		def("session.pin", "POST /api/sessions/{id}/pin", "R2", "置顶会话", false, "id"),
		def("session.unpin", "POST /api/sessions/{id}/unpin", "R2", "取消置顶会话", false, "id"),
		def("session.owner.get", "GET /api/sessions/{id}/owner", "R0", "读取会话负责人", true, "id"),
		def("session.owner.set", "PUT /api/sessions/{id}/owner", "R2", "设置会话负责人", false, "agentId"),
		def("session.delete", "DELETE /api/sessions/{id}", "R4", "删除会话及子会话（破坏性）", false, "id"),
		def("session.overview.get", "GET /api/sessions/{id}/overview", "R0", "读取会话概览", true, "id"),
		def("session.overview.refresh", "POST /api/sessions/{id}/overview/refresh", "R2", "刷新会话概览", false, "id"),
		def("agent.list", "GET /api/agents", "R0", "列出内置智能体", true, ""),
		def("agent.get", "GET /api/agents", "R0", "读取智能体详情", true, "id"),
		def("agent.set-owner", "PUT /api/sessions/{id}/owner", "R2", "设置会话负责人", false, "agentId"),
		def("agent.persona", "PUT /api/sessions/{id}/owner", "R2", "调整会话负责人人格", false, "agentId"),
		def("chat.send", "POST /api/chat", "R2", "发送消息并启动一轮回复", false, "text"),
		def("chat.send_card", "POST /api/actions/{name}", "R2", "发送交互卡片消息；用户选择/确认/填表时优先使用，必须带 fallbackText", false, "sessionId"),
		def("chat.list", "GET /api/messages", "R0", "读取会话消息", true, ""),
		def("chat.search", "GET /api/messages/search", "R0", "搜索会话消息", true, "q"),
		def("chat.reply", "POST /api/chat", "R2", "引用回复一条消息", false, "text"),
		def("chat.correct", "POST /api/chat", "R2", "纠正上一条消息", false, "text"),
		def("chat.retract", "POST /api/chat", "R2", "撤回消息", false, "id"),
		def("task.list", "GET /api/tasks", "R0", "列出任务", true, ""),
		def("task.get", "GET /api/tasks/{id}", "R0", "读取任务", true, "id"),
		def("task.cancel", "POST /api/tasks/{id}/cancel", "R2", "取消任务", false, "id"),
		def("task.retry", "POST /api/tasks/{id}/retry", "R2", "重试任务", false, "id"),
		def("task.runtime", "GET /api/tasks/{id}/runtime", "R0", "读取任务运行时状态", true, "id"),
		def("workflow.list", "GET /api/workflows", "R0", "列出工作流", true, ""),
		def("workflow.get", "GET /api/workflows/{id}", "R0", "读取工作流", true, "id"),
		def("workflow.pause", "POST /api/workflows/{id}/pause", "R2", "暂停工作流", false, "id"),
		def("workflow.resume", "POST /api/workflows/{id}/resume", "R2", "恢复工作流", false, "id"),
		def("workflow.cancel", "POST /api/workflows/{id}/cancel", "R2", "取消工作流", false, "id"),
		def("workflow.start", "POST /api/actions/{name}", "R3", "启动一个新工作流", false, "plan"),
		def("workflow.runtime", "GET /api/workflows/{id}/runtime", "R0", "读取工作流运行时状态", true, "id"),
		def("schedule.list", "GET /api/schedules", "R0", "列出定时任务", true, ""),
		def("schedule.get", "GET /api/schedules/{id}", "R0", "读取定时任务", true, "id"),
		def("schedule.create", "POST /api/schedules", "R2", "创建定时任务", false, "prompt"),
		def("schedule.update", "PATCH /api/schedules/{id}", "R2", "更新定时任务", false, "id"),
		def("schedule.delete", "DELETE /api/schedules/{id}", "R2", "删除定时任务", false, "id"),
		def("schedule.run-now", "POST /api/schedules/{id}/run-now", "R2", "立即运行定时任务", false, "id"),
		def("memory.search", "GET /api/memory", "R0", "搜索会话记忆", true, "q"),
		def("memory.get", "GET /api/memory/items/{id}", "R0", "读取记忆条目与溯源", true, "id"),
		def("memory.entities", "GET /api/memory/entities", "R0", "列出记忆实体", true, ""),
		def("memory.graph", "GET /api/memory/graph", "R0", "读取实体邻域图", true, "entityId"),
		def("memory.pyramid", "GET /api/memory/pyramid", "R0", "读取记忆金字塔", true, "entityId"),
		def("memory.agents", "GET /api/memory/agents", "R0", "列出智能体记忆", true, ""),
		def("memory.timeline", "GET /api/memory/entities/{id}/timeline", "R0", "读取实体事实时间线", true, "id"),
		def("memory.canonical", "GET /api/memory/canonical/{id}", "R0", "读取 canonical 溯源", true, "id"),
		def("memory.traverse", "GET /api/memory/scopes", "R0", "遍历记忆作用域", true, ""),
		def("memory.conflicts", "GET /api/memory/conflicts", "R0", "列出记忆冲突", true, ""),
		def("file.list", "GET /api/artifacts", "R0", "列出产物/文件", true, ""),
		def("file.get", "GET /api/artifacts/{id}", "R0", "读取产物元数据", true, "id"),
		def("file.session-list", "GET /api/sessions/{id}/artifacts", "R0", "列出会话产物", true, "id"),
		def("session.files", "GET /api/sessions/{id}/files", "R0", "列出会话文件", true, "id"),
		def("file.upload-get", "GET /api/uploads/{id}", "R0", "读取上传文件", true, "id"),
		def("file.upload-meta", "GET /api/uploads/{id}/meta", "R0", "读取上传文件元数据", true, "id"),
		def("file.preview", "GET /api/artifacts/{id}/content", "R0", "预览文件内容", true, "id"),
		def("file.download", "GET /api/artifacts/{id}/content", "R0", "下载文件", true, "id"),
		def("file.upload", "POST /api/uploads", "R2", "上传文件", false, "path"),
		def("file.delete", "DELETE /api/uploads/{id}", "R4", "删除文件（破坏性）", false, "id"),
		def("permission.get", "GET /api/permissions", "R0", "读取会话权限", true, ""),
		def("permission.approvals", "GET /api/approvals", "R0", "列出审批", true, ""),
		def("permission.approval.get", "GET /api/approvals/{id}", "R0", "读取审批", true, "id"),
		def("permission.set", "POST /api/permissions", "R2", "设置会话权限", false, ""),
		def("permission.approve", "POST /api/approvals/{id}", "R2", "批准待审批动作", false, "id"),
		def("permission.deny", "POST /api/approvals/{id}", "R2", "拒绝待审批动作", false, "id"),
		def("ui.theme.set", "POST /api/actions/{name}", "R2", "设置界面主题", false, "theme"),
		def("ui.layout.set", "POST /api/actions/{name}", "R2", "设置界面布局", false, "layout"),
		def("ui.panel.toggle", "POST /api/actions/{name}", "R2", "显示/隐藏面板", false, "panel"),
		def("ui.open", "POST /api/actions/{name}", "R2", "打开界面页面", false, "page"),
		def("ui.set_view", "POST /api/actions/{name}", "R2", "创建/修改声明式视图", false, "sessionId"),
		def("ui.view.rollback", "POST /api/actions/{name}", "R2", "回滚声明式视图到指定版本", false, "sessionId"),
		def("ui.get_view", "POST /api/actions/{name}", "R0", "读取声明式视图", true, "sessionId"),
		def("ui.delete_view", "POST /api/actions/{name}", "R2", "软删除声明式视图", false, "sessionId"),
		def("ui.update_card", "PATCH /api/cards/{id}", "R2", "更新交互卡片（版本+1）", false, "cardId"),
		def("config.get", "GET /api/actions/{name}", "R0", "读取非敏感配置", true, ""),
		def("config.set", "POST /api/actions/{name}", "R2", "设置运行时配置", false, "key"),
		def("system.health", "GET /api/health", "R0", "健康检查", true, ""),
		def("system.version", "GET /api/actions/{name}", "R0", "读取服务版本", true, ""),
		def("system.stats", "GET /api/stats", "R0", "读取用量统计", true, ""),
		def("system.usage", "GET /api/usage", "R0", "读取 token 用量", true, ""),
		def("system.runtime", "GET /api/runtime/status", "R0", "读取运行时总览", true, ""),
		def("team.get", "GET /api/sessions/{id}/team", "R0", "读取当前会话的团队与成员", true, "id"),
		def("team.create", "POST /api/actions/{name}", "R2", "创建团队与成员子会话", false, "name"),
		def("team.message.send", "POST /api/actions/{name}", "R2", "发送团队内部消息（不进用户主窗口）", false, "toSessionId"),
		def("team.messages", "GET /api/teams/{id}/messages", "R0", "读取团队内部消息（只读）", true, "id"),
		def("team.template.upsert", "POST /api/actions/{name}", "R2", "创建/覆盖团队模板（支持继承）", false, "name"),
		def("team.template.get", "GET /api/actions/{name}", "R0", "读取团队模板", true, "id"),
		def("team.owner.set", "POST /api/actions/{name}", "R2", "切换成员负责人并审计", false, "sessionId"),
		def("team.trigger.create", "POST /api/actions/{name}", "R2", "创建跨会话触发", false, "toSessionId"),
		def("team.trigger.fire", "POST /api/actions/{name}", "R2", "触发下游成员会话动作（幂等/重试）", false, "id"),
		def("team.deliverables", "GET /api/teams/{id}/deliverables", "R0", "读取团队交付物", true, "id"),
		def("team.triggers", "GET /api/teams/{id}/triggers", "R0", "读取团队触发器", true, "id"),
		def("session.decisions", "GET /api/decisions", "R0", "读取决策记录", true, ""),
	}
	for i := range out {
		if out[i].Name == "chat.correct" {
			out[i].Disabled = true
			out[i].Description = "已禁用：消息编辑/修改不再提供"
		}
	}
	return out
}

func List() []Definition {
	out := make([]Definition, 0, len(definitions))
	for _, definition := range definitions {
		if definition.Disabled {
			continue
		}
		out = append(out, definition)
	}
	return out
}

func Find(name string) (Definition, bool) {
	for _, item := range definitions {
		if item.Name == name {
			return item, true
		}
	}
	return Definition{}, false
}

func ToolName(name string) string {
	normalized := strings.ReplaceAll(name, ".", "_")
	normalized = strings.ReplaceAll(normalized, "-", "_")
	return "simo_" + normalized
}

func FindByTool(tool string) (Definition, bool) {
	for _, item := range definitions {
		if ToolName(item.Name) == tool {
			return item, true
		}
	}
	return Definition{}, false
}

func ResolveName(name string) (Definition, bool) {
	if definition, ok := Find(name); ok {
		return definition, true
	}
	return FindByTool(name)
}
