package chat

import (
	"encoding/json"
	"strings"

	coretask "simo/internal/core/task"
	"simo/internal/platform/llm"
)

// permissionDeniedFromToolResult 把工具结果里的拒绝码翻译成 403 轨迹素材。
// 拒绝不终止任务（任务继续），只由 tasks 模块记一条 observe 轨迹。
func permissionDeniedFromToolResult(call llm.ToolCall, result string) (coretask.PermissionDenied, bool) {
	lower := strings.ToLower(result)
	tool := canonicalToolName(call.Function.Name)
	path := toolPathArgument(call)
	switch {
	case strings.Contains(lower, "code=path_denied"):
		return coretask.PermissionDenied{Tool: tool, Path: path, Reason: "路径越出工作区"}, true
	case strings.Contains(lower, "code=sandbox_denied"), strings.Contains(lower, "file access denied"):
		return coretask.PermissionDenied{Tool: tool, Path: path, Reason: "沙盒拒绝访问"}, true
	case strings.Contains(lower, "code=denied_tool"):
		return coretask.PermissionDenied{Tool: tool, Reason: "工具不在白名单"}, true
	case strings.Contains(lower, "code=ssrf_denied"):
		return coretask.PermissionDenied{Tool: tool, Reason: "网络访问未授权"}, true
	case strings.Contains(lower, "code=denied"):
		return coretask.PermissionDenied{Tool: tool, Reason: "未授权操作"}, true
	}
	return coretask.PermissionDenied{}, false
}

// toolPathArgument 取工具参数里的工作区路径（不同工具用 file_path / path / filename）。
func toolPathArgument(call llm.ToolCall) string {
	if strings.TrimSpace(call.Function.Arguments) == "" {
		return ""
	}
	args := map[string]any{}
	if err := json.Unmarshal([]byte(call.Function.Arguments), &args); err != nil {
		return ""
	}
	for _, key := range []string{"file_path", "path", "filename"} {
		if value := stringArg(args, key); value != "" {
			return value
		}
	}
	return ""
}
