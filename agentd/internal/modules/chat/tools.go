package chat

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	coreaction "agentd/internal/core/action"
	"agentd/internal/core/eventlog"
	"agentd/internal/platform/llm"
	"agentd/internal/platform/neutralize"
)

const (
	maxToolOutputBytes  = 64 * 1024
	maxGlobResults      = 100
	maxGrepMatches      = 250
	defaultShellTimeout = 120 * time.Second
)

type readStamp struct {
	Size    int64
	ModTime int64
}

type readGuard struct {
	mu   sync.Mutex
	seen map[string]readStamp
}

func newReadGuard() *readGuard { return &readGuard{seen: make(map[string]readStamp)} }

func (g *readGuard) key(sessionID, absPath string) string {
	return sessionID + "|" + filepath.Clean(absPath)
}

func (g *readGuard) record(sessionID, absPath string) {
	if g == nil {
		return
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return
	}
	g.mu.Lock()
	g.seen[g.key(sessionID, absPath)] = readStamp{Size: info.Size(), ModTime: info.ModTime().UnixNano()}
	g.mu.Unlock()
}

func (g *readGuard) check(sessionID, absPath string) (stale bool, observed bool) {
	if g == nil {
		return false, false
	}
	g.mu.Lock()
	stamp, ok := g.seen[g.key(sessionID, absPath)]
	g.mu.Unlock()
	if !ok {
		return false, false
	}
	info, err := os.Stat(absPath)
	if err != nil {
		return true, true
	}
	return stamp.Size != info.Size() || stamp.ModTime != info.ModTime().UnixNano(), true
}

// toolDefinitions 是 M9 工具面；旧名由执行器内部映射，不再暴露两套 schema。
func toolDefinitions() []llm.Tool {
	escalation := `"sandbox_permissions":{"type":"string","description":"单次提权：read-only|workspace-write|danger-full-access（仅宽一档）"},"justification":{"type":"string","description":"提权理由（必填）"}`
	tools := []llm.Tool{
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "read",
				Description: "读取文件（只读）。file_path 相对 workspace 或允许根；返回内容/分页。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"file_path":{"type":"string"},"offset":{"type":"integer","description":"起始行，1-based"},"limit":{"type":"integer","description":"最多行数"}},"required":["file_path"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "glob",
				Description: "按 glob 模式找文件（只读）；pattern 如 **/*.go；默认 workspace。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string","description":"相对 workspace 的目录，默认 ."}},"required":["pattern"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "grep",
				Description: "在 workspace 内按正则搜索文本（只读）；返回文件:行:内容。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"pattern":{"type":"string"},"path":{"type":"string"},"include":{"type":"string","description":"文件名 glob，如 *.go"}},"required":["pattern"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "write",
				Description: "写文件（默认进入审批；workspace 外需单次提权）。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"file_path":{"type":"string"},"content":{"type":"string"},` + escalation + `},"required":["file_path","content"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "edit",
				Description: "对文件做字面替换（默认唯一匹配；需先 read）。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"file_path":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"},"replace_all":{"type":"boolean"},` + escalation + `},"required":["file_path","old_string","new_string"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "pwsh",
				Description: "执行一次性 PowerShell 命令（cwd=workspace；非零退出是正常结果，返回 [exit code: N]）。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"command":{"type":"string"},"timeout_ms":{"type":"integer","description":"1-120000ms，默认 120000"},` + escalation + `},"required":["command"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "run_python",
				Description: "执行 Python 代码或 workspace 内脚本（cwd=workspace；返回 [exit code: N]）。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"code":{"type":"string"},"path":{"type":"string"},"args":{"type":"array","items":{"type":"string"}},"timeout_ms":{"type":"integer","description":"1-120000ms，默认 120000"},` + escalation + `}}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "make_pdf",
				Description: "把 Markdown/HTML 导出为 PDF（Chrome headless），写入 artifacts；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"markdown":{"type":"string"},"html":{"type":"string"},"title":{"type":"string"},"filename":{"type":"string"}}}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "make_docx",
				Description: "把 Markdown 生成 DOCX（python-docx），写入 artifacts；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"markdown":{"type":"string"},"filename":{"type":"string"}},"required":["markdown"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "make_xlsx",
				Description: "生成 XLSX（openpyxl），sheets:[{name,rows:[[...]]}]；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"sheets":{"type":"array"},"filename":{"type":"string"}},"required":["sheets"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "make_pptx",
				Description: "生成 PPTX（python-pptx），slides:[{title,bullets:[]}]；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"slides":{"type":"array"},"filename":{"type":"string"}},"required":["slides"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "make_image",
				Description: "生成图片（Pillow 文本占位或处理 png_base64），写入 artifacts；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"prompt":{"type":"string"},"filename":{"type":"string"},"png_base64":{"type":"string"}}}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "web_search",
				Description: "网页搜索（DuckDuckGo HTML，失败回退 Bing），返回标题/URL/摘要；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"query":{"type":"string"},"count":{"type":"integer","description":"1-10，默认 5"}},"required":["query"]}`),
			},
		},
		{
			Type: "function",
			Function: llm.FunctionDef{
				Name:        "web_fetch",
				Description: "抓取公开网页正文（http/https，SSRF 防护，≤2MB/15s）；需要审批。",
				Parameters:  json.RawMessage(`{"type":"object","properties":{"url":{"type":"string"},"max_bytes":{"type":"integer"},"format":{"type":"string"}},"required":["url"]}`),
			},
		},
	}
	for _, definition := range []struct {
		name, description string
		params            string
	}{
		{"actions_describe", "按需查看动作目录/完整 JSON Schema；传 name 看单个，传 namespace 看一组。", `{"type":"object","properties":{"name":{"type":"string"},"namespace":{"type":"string"}}}`},
		{"actions_invoke", "执行动作目录中的动作；name 为动作名，args 为参数对象。", `{"type":"object","properties":{"name":{"type":"string"},"args":{"type":"object"}},"required":["name"]}`},
	} {
		tools = append(tools, llm.Tool{
			Type: "function",
			Function: llm.FunctionDef{
				Name: definition.name, Description: definition.description,
				Parameters: json.RawMessage(definition.params),
			},
		})
	}
	return tools
}

func canonicalToolName(name string) string {
	switch strings.TrimSpace(name) {
	case "read_file":
		return "read"
	case "list_dir":
		return "glob"
	case "search_text":
		return "grep"
	case "write_file":
		return "write"
	case "delete_file", "delete":
		return "delete"
	default:
		return strings.TrimSpace(name)
	}
}

func normalizeToolArgs(tool string, args map[string]any) {
	_, hasFile := args["file_path"]
	if !hasFile {
		if value, ok := args["path"]; ok {
			args["file_path"] = value
		}
	}
	if tool == "glob" {
		if _, ok := args["pattern"]; !ok {
			if value, ok := args["path"]; ok {
				args["pattern"] = value
			}
		}
	}
	if tool == "grep" {
		if _, ok := args["pattern"]; !ok {
			if value, ok := args["query"]; ok {
				args["pattern"] = value
			}
		}
	}
}

type toolAuthorization struct {
	allowed       bool
	needsApproval bool
	sandbox       string
	risk          string
	reason        string
	code          string
	escalated     bool
}

func (m *Module) authorizeTool(sessionID, tool string, args map[string]any) toolAuthorization {
	settings := m.currentPermissions(sessionID)
	auth := toolAuthorization{allowed: true, sandbox: settings.Sandbox, risk: "R0"}
	if tool == "actions_describe" {
		return toolAuthorization{allowed: true, sandbox: settings.Sandbox, risk: "R0"}
	}
	if tool == "actions_invoke" {
		actionName := stringArg(args, "name")
		definition, ok := coreaction.ResolveName(actionName)
		if !ok {
			return toolAuthorization{allowed: false, sandbox: settings.Sandbox, risk: "R0",
				reason: "未知动作: " + actionName, code: "unknown_action"}
		}
		switch definition.Risk {
		case "R3":
			return toolAuthorization{allowed: true, sandbox: settings.Sandbox, risk: "R3", needsApproval: true}
		case "R4", "R5":
			return toolAuthorization{allowed: false, sandbox: settings.Sandbox, risk: definition.Risk,
				reason: "破坏性动作必须人工确认", code: "denied_r4"}
		}
		return toolAuthorization{allowed: true, sandbox: settings.Sandbox, risk: definition.Risk}
	}
	if definition, ok := coreaction.FindByTool(tool); ok {
		auth.risk = definition.Risk
		switch definition.Risk {
		case "R3":
			auth.needsApproval = true
			if settings.Approval == approvalNever {
				return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: auth.risk,
					reason: "never 策略拒绝动作", code: "denied"}
			}
		case "R4", "R5":
			return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: auth.risk,
				reason: "破坏性动作必须人工确认", code: "denied_r4"}
		}
		return auth
	}
	requested := strings.TrimSpace(stringArg(args, "sandbox_permissions"))
	justification := strings.TrimSpace(stringArg(args, "justification"))
	if requested != "" {
		if !validSandboxMode(requested) {
			return toolAuthorization{allowed: false, sandbox: settings.Sandbox, risk: "R4",
				reason: "sandbox_permissions 非法", code: "invalid_escalation"}
		}
		if !isOneStepWider(settings.Sandbox, requested) {
			return toolAuthorization{allowed: false, sandbox: settings.Sandbox, risk: "R4",
				reason: "提权只允许严格更宽一档", code: "invalid_escalation"}
		}
		if justification == "" {
			return toolAuthorization{allowed: false, sandbox: settings.Sandbox, risk: "R4",
				reason: "提权必须提供 justification", code: "justification_required"}
		}
		auth.sandbox = requested
		auth.escalated = true
		auth.needsApproval = true
		auth.risk = "R4"
	}

	switch tool {
	case "read", "glob", "grep":
		return auth
	case "write", "edit":
		if auth.sandbox == sandboxReadOnly {
			return m.sandboxDenied(auth, tool, "read-only 模式禁止写")
		}
		raw := stringArg(args, "file_path")
		if _, err := m.resolveToolPath(raw, auth.sandbox); err != nil {
			return m.sandboxDenied(auth, tool, err.Error())
		}
		auth.needsApproval = true
		if auth.risk == "R0" {
			auth.risk = "R1"
		}
	case "pwsh":
		if auth.sandbox == sandboxReadOnly {
			return m.sandboxDenied(auth, tool, "read-only 模式禁止执行")
		}
		auth.needsApproval = true
		auth.risk = "R2"
		if dangerousCommand(stringArg(args, "command")) {
			auth.risk = "R4"
		}
	case "run_python":
		if auth.sandbox == sandboxReadOnly {
			return m.sandboxDenied(auth, tool, "read-only 模式禁止执行 Python")
		}
		auth.needsApproval = true
		auth.risk = "R2"
	case "delete":
		return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: "R2",
			reason: "delete 工具被 deny（删除请经 pwsh 审批）", code: "denied_tool"}
	case "make_pdf", "make_docx", "make_xlsx", "make_pptx", "make_image":
		if auth.sandbox == sandboxReadOnly {
			return m.sandboxDenied(auth, tool, "read-only 模式禁止生成文件")
		}
		auth.needsApproval = true
		if auth.risk == "R0" {
			auth.risk = "R1"
		}
	case "web_search", "web_fetch":
		auth.needsApproval = true
		auth.risk = "R2"
	default:
		return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: "R0",
			reason: "未知工具", code: "unknown_tool"}
	}

	if auth.needsApproval {
		switch settings.Approval {
		case approvalNever:
			return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: auth.risk,
				reason: "never 模式下需审批动作直接拒绝（fail-closed）", code: "approval_required"}
		}
	}
	return auth
}

func (m *Module) sandboxDenied(auth toolAuthorization, tool, reason string) toolAuthorization {
	hint := "；如需越界，可用 sandbox_permissions=danger-full-access + justification 申请单次提权"
	return toolAuthorization{allowed: false, sandbox: auth.sandbox, risk: auth.risk,
		reason: "[sandbox: file access denied under " + auth.sandbox + " mode] " + reason + hint,
		code:   "sandbox_denied"}
}

func isOneStepWider(current, requested string) bool {
	order := map[string]int{sandboxReadOnly: 0, sandboxWorkspaceWrite: 1, sandboxFullAccess: 2}
	cur, okCur := order[current]
	req, okReq := order[requested]
	return okCur && okReq && req == cur+1
}

func dangerousCommand(command string) bool {
	lower := strings.ToLower(command)
	patterns := []string{
		"rm -rf", "rm -r", "del /", "rd /s", "rmdir /s", "format ", "format-volume", "clear-disk",
		"shutdown", "stop-computer", "restart-computer", "reg add", "reg delete", "set-itemproperty",
		"mkfs", "diskpart", "remove-item -recurse", "remove-item -force", "drop database",
	}
	for _, pattern := range patterns {
		if strings.Contains(lower, pattern) {
			return true
		}
	}
	return false
}

// executeTool 执行一个模型工具调用；任何失败都变成工具结果文本，不结束 turn。
func (m *Module) executeTool(ctx context.Context, sessionID string, call llm.ToolCall) string {
	started := time.Now()
	name := canonicalToolName(call.Function.Name)
	args := map[string]any{}
	if strings.TrimSpace(call.Function.Arguments) != "" {
		if err := json.Unmarshal([]byte(call.Function.Arguments), &args); err != nil {
			return "Error: 参数不是合法 JSON (code=bad_arguments)：请检查 JSON 后重试"
		}
	}
	normalizeToolArgs(name, args)
	auth := m.authorizeTool(sessionID, name, args)
	if !auth.allowed {
		result := fmt.Sprintf("Error: %s (code=%s)", auth.reason, auth.code)
		m.auditToolCall(ctx, sessionID, name, args, auth, result, started)
		return neutralize.Text(result)
	}
	if auth.needsApproval && !auth.escalated && m.currentPermissions(sessionID).Approval != approvalNever &&
		m.hasSessionGrant(ctx, sessionID, name, args) {
		auth.needsApproval = false
	}
	if auth.needsApproval {
		// 审批记录保留模型请求的原始工具名（M5 write_file 兼容）；执行时再 canonicalize。
		approval, err := m.createApproval(ctx, sessionID, strings.TrimSpace(call.Function.Name), args, auth.risk, auth.sandbox)
		if err != nil {
			result := fmt.Sprintf("Error: 创建审批失败: %v (code=approval_failed)", err)
			m.auditToolCall(ctx, sessionID, name, args, auth, result, started)
			return neutralize.Text(result)
		}
		m.auditEvent(ctx, eventlog.TypeToolCall, map[string]any{
			"tool": name, "sessionId": sessionID, "risk": auth.risk, "sandbox": auth.sandbox,
			"decision": "ask", "escalated": auth.escalated, "args": summarizeArgs(args),
		})
		return neutralize.Text(fmt.Sprintf("PENDING_APPROVAL approvalId=%s tool=%s；等待用户审批，尚未执行。",
			approval.ID, strings.TrimSpace(call.Function.Name)))
	}
	result := m.runTool(ctx, sessionID, name, args, auth.sandbox)
	result = m.limitToolOutput(result)
	m.auditToolCall(ctx, sessionID, name, args, auth, result, started)
	return neutralize.Text(result)
}

func (m *Module) auditToolCall(ctx context.Context, sessionID, tool string, args map[string]any, auth toolAuthorization, result string, started time.Time) {
	payload := map[string]any{
		"tool": tool, "sessionId": sessionID, "risk": auth.risk, "sandbox": auth.sandbox,
		"escalated": auth.escalated, "decision": toolDecision(auth), "durationMs": time.Since(started).Milliseconds(),
		"args": summarizeArgs(args), "result": truncateRunes(result, 500),
	}
	switch tool {
	case "web_fetch":
		payload["url"] = stringArg(args, "url")
		payload["domain"] = urlHostKey(stringArg(args, "url"))
	case "web_search":
		payload["query"] = stringArg(args, "query")
	}
	if tool == "make_pdf" || tool == "make_docx" || tool == "make_xlsx" || tool == "make_pptx" || tool == "make_image" {
		payload["filename"] = stringArg(args, "filename")
	}
	m.auditEvent(ctx, eventlog.TypeToolCall, payload)
}

func toolDecision(auth toolAuthorization) string {
	if !auth.allowed {
		return "deny"
	}
	if auth.needsApproval {
		return "ask"
	}
	return "allow"
}

func summarizeArgs(args map[string]any) string {
	redacted := make(map[string]any, len(args))
	for key, value := range args {
		switch key {
		case "content", "new_string", "old_string":
			redacted[key] = truncateRunes(fmt.Sprint(value), 200)
		case "command":
			redacted[key] = truncateRunes(fmt.Sprint(value), 500)
		case "code":
			redacted[key] = truncateRunes(fmt.Sprint(value), 500)
		default:
			redacted[key] = value
		}
	}
	raw, _ := json.Marshal(redacted)
	return string(raw)
}

// runTool 是已授权/已审批后的实际执行入口。
func (m *Module) runTool(ctx context.Context, sessionID, tool string, args map[string]any, sandbox string) string {
	if tool == "actions_describe" {
		name := stringArg(args, "name")
		if name != "" {
			if definition, ok := coreaction.Find(name); ok {
				raw, _ := json.Marshal(actionPayload(definition))
				return string(raw)
			}
			return "Error: 未知动作 (code=unknown_action)"
		}
		namespace := stringArg(args, "namespace")
		list := make([]map[string]any, 0, 16)
		for _, definition := range coreaction.List() {
			if namespace != "" && definition.Namespace != namespace {
				continue
			}
			list = append(list, map[string]any{"name": definition.Name, "description": definition.Description,
				"risk": definition.Risk, "params": json.RawMessage(definition.Params)})
		}
		raw, _ := json.Marshal(map[string]any{"actions": list, "count": len(list)})
		return string(raw)
	}
	if tool == "actions_invoke" {
		name := stringArg(args, "name")
		definition, ok := coreaction.ResolveName(name)
		if !ok {
			return "Error: 未知动作 (code=unknown_action)"
		}
		name = definition.Name
		invokeArgs := map[string]any{}
		if rawArgs, ok := args["args"].(map[string]any); ok {
			invokeArgs = rawArgs
		} else {
			for key, value := range args {
				if key != "name" {
					invokeArgs[key] = value
				}
			}
		}
		data, err := m.executeAction(ctx, sessionID, name, invokeArgs)
		if err != nil {
			return fmt.Sprintf("Error: %v", err)
		}
		raw, _ := json.Marshal(data)
		return string(raw)
	}
	if definition, ok := coreaction.FindByTool(tool); ok {
		data, err := m.executeAction(ctx, sessionID, definition.Name, args)
		if err != nil {
			return fmt.Sprintf("Error: %v", err)
		}
		raw, _ := json.Marshal(data)
		return string(raw)
	}
	switch tool {
	case "read":
		return m.toolRead(ctx, sessionID, args, sandbox)
	case "glob":
		return m.toolGlob(args, sandbox)
	case "grep":
		return m.toolGrep(args, sandbox)
	case "write":
		return m.toolWrite(ctx, sessionID, args, sandbox)
	case "edit":
		return m.toolEdit(ctx, sessionID, args, sandbox)
	case "pwsh":
		return m.toolPwsh(ctx, args)
	case "run_python":
		return m.toolRunPython(ctx, sessionID, args, sandbox)
	case "make_pdf":
		return m.toolMakePDF(ctx, sessionID, args)
	case "make_docx", "make_xlsx", "make_pptx", "make_image":
		return m.toolMakeOffice(ctx, sessionID, tool, args)
	case "web_search":
		return m.toolWebSearch(ctx, args)
	case "web_fetch":
		return m.toolWebFetch(ctx, args)
	default:
		return fmt.Sprintf("Error: 未知工具 %s (code=unknown_tool)", tool)
	}
}

func (m *Module) executeApprovedTool(tool string, args map[string]any, sandbox, sessionID string) string {
	name := canonicalToolName(tool)
	normalizeToolArgs(name, args)
	if sandbox == "" {
		sandbox = m.currentPermissions(sessionID).Sandbox
	}
	if err := m.revalidateApproved(name, args, sandbox); err != nil {
		return neutralize.Text(err.Error())
	}
	result := m.runTool(context.Background(), sessionID, name, args, sandbox)
	result = m.limitToolOutput(result)
	return neutralize.Text(result)
}

func (m *Module) revalidateApproved(tool string, args map[string]any, sandbox string) error {
	if tool == "write" || tool == "edit" {
		if sandbox == sandboxReadOnly {
			return errors.New("Error: approved write denied under read-only (code=sandbox_denied)")
		}
		if _, err := m.resolveToolPath(stringArg(args, "file_path"), sandbox); err != nil {
			return fmt.Errorf("Error: %v (code=sandbox_denied)", err)
		}
	}
	if tool == "pwsh" && sandbox == sandboxReadOnly {
		return errors.New("Error: approved pwsh denied under read-only (code=sandbox_denied)")
	}
	if tool == "run_python" && sandbox == sandboxReadOnly {
		return errors.New("Error: approved run_python denied under read-only (code=sandbox_denied)")
	}
	if (tool == "make_pdf" || tool == "make_docx" || tool == "make_xlsx" || tool == "make_pptx" || tool == "make_image") &&
		sandbox == sandboxReadOnly {
		return errors.New("Error: approved file generation denied under read-only (code=sandbox_denied)")
	}
	return nil
}

func (m *Module) toolRead(ctx context.Context, sessionID string, args map[string]any, sandbox string) string {
	abs, err := m.resolveToolPath(stringArg(args, "file_path"), sandbox)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return fmt.Sprintf("Error: 读取失败: %v (code=read_failed)", err)
	}
	m.reads.record(sessionID, abs)
	text := string(data)
	offset := intArg(args, "offset", 0)
	limit := intArg(args, "limit", 0)
	if offset > 0 || limit > 0 {
		lines := strings.Split(text, "\n")
		start := offset - 1
		if start < 0 {
			start = 0
		}
		if start > len(lines) {
			start = len(lines)
		}
		end := len(lines)
		if limit > 0 && start+limit < end {
			end = start + limit
		}
		text = strings.Join(lines[start:end], "\n")
	}
	return text
}

func (m *Module) toolGlob(args map[string]any, sandbox string) string {
	pattern := strings.TrimSpace(stringArg(args, "pattern"))
	if pattern == "" {
		return "Error: glob 需要 pattern (code=bad_arguments)"
	}
	base := stringArg(args, "path")
	if strings.TrimSpace(base) == "" {
		base = "."
	}
	root, err := m.resolveToolPath(base, sandbox)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return fmt.Sprintf("Error: 目录不存在: %s (code=not_found)", base)
	}
	matches := make([]string, 0, 16)
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if entry.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		rel, err := filepath.Rel(m.sandbox.Workspace, path)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)
		if ok, _ := filepath.Match(pattern, filepath.Base(rel)); ok || globMatch(pattern, rel) {
			matches = append(matches, rel)
		}
		if len(matches) >= maxGlobResults {
			return filepath.SkipAll
		}
		return nil
	})
	if len(matches) == 0 {
		return "（无匹配）"
	}
	sort.Strings(matches)
	return strings.Join(matches, "\n")
}

func (m *Module) toolGrep(args map[string]any, sandbox string) string {
	pattern := stringArg(args, "pattern")
	if strings.TrimSpace(pattern) == "" {
		return "Error: grep 需要 pattern (code=bad_arguments)"
	}
	re, err := regexp.Compile(pattern)
	if err != nil {
		return fmt.Sprintf("Error: 正则非法: %v (code=bad_pattern)", err)
	}
	base := stringArg(args, "path")
	if strings.TrimSpace(base) == "" {
		base = "."
	}
	include := strings.TrimSpace(stringArg(args, "include"))
	root, err := m.resolveToolPath(base, sandbox)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	var out strings.Builder
	matches := 0
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			if entry != nil && entry.IsDir() && entry.Name() == ".git" {
				return filepath.SkipDir
			}
			return nil
		}
		if include != "" {
			if ok, _ := filepath.Match(include, filepath.Base(path)); !ok {
				return nil
			}
		}
		data, err := os.ReadFile(path)
		if err != nil || len(data) > 2<<20 {
			return nil
		}
		rel, _ := filepath.Rel(m.sandbox.Workspace, path)
		rel = filepath.ToSlash(rel)
		for i, line := range strings.Split(string(data), "\n") {
			if !re.MatchString(line) {
				continue
			}
			out.WriteString(fmt.Sprintf("%s:%d: %s\n", rel, i+1, truncateRunes(line, 2000)))
			matches++
			if matches >= maxGrepMatches {
				return filepath.SkipAll
			}
		}
		return nil
	})
	if matches == 0 {
		return "（无匹配）"
	}
	return out.String()
}

func (m *Module) toolWrite(ctx context.Context, sessionID string, args map[string]any, sandbox string) string {
	abs, err := m.resolveToolPath(stringArg(args, "file_path"), sandbox)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	if info, statErr := os.Stat(abs); statErr == nil && !info.IsDir() {
		if stale, observed := m.reads.check(sessionID, abs); !observed {
			return "Error: 写前未 read 该文件，请先 read (code=FS_NOT_OBSERVED)"
		} else if stale {
			return "Error: 文件在 read 后已变化，请重新 read (code=FS_STALE_VERSION)"
		}
	}
	if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
		return fmt.Sprintf("Error: 创建目录失败: %v (code=write_failed)", err)
	}
	content := stringArg(args, "content")
	if err := os.WriteFile(abs, []byte(content), 0o644); err != nil {
		return fmt.Sprintf("Error: 写入失败: %v (code=write_failed)", err)
	}
	m.reads.record(sessionID, abs)
	return fmt.Sprintf("OK: 已写入 %s（%d 字节）", stringArg(args, "file_path"), len(content))
}

func (m *Module) toolEdit(ctx context.Context, sessionID string, args map[string]any, sandbox string) string {
	abs, err := m.resolveToolPath(stringArg(args, "file_path"), sandbox)
	if err != nil {
		return fmt.Sprintf("Error: %v (code=path_denied)", err)
	}
	stale, observed := m.reads.check(sessionID, abs)
	if !observed {
		return "Error: edit 前未 read 该文件，请先 read (code=FS_NOT_OBSERVED)"
	}
	if stale {
		return "Error: 文件在 read 后已变化，请重新 read (code=FS_STALE_VERSION)"
	}
	data, err := os.ReadFile(abs)
	if err != nil {
		return fmt.Sprintf("Error: 读取失败: %v (code=read_failed)", err)
	}
	oldText := stringArg(args, "old_string")
	newText := stringArg(args, "new_string")
	if oldText == "" {
		return "Error: old_string 不能为空 (code=bad_arguments)"
	}
	count := strings.Count(string(data), oldText)
	if count == 0 {
		return "Error: old_string 未找到 (code=edit_no_match)"
	}
	replaceAll := boolArg(args, "replace_all")
	if count > 1 && !replaceAll {
		return "Error: old_string 匹配多处，请提供更多上下文或 replace_all=true (code=edit_ambiguous)"
	}
	updated := strings.ReplaceAll(string(data), oldText, newText)
	if !replaceAll {
		updated = strings.Replace(string(data), oldText, newText, 1)
	}
	if err := os.WriteFile(abs, []byte(updated), 0o644); err != nil {
		return fmt.Sprintf("Error: 写入失败: %v (code=write_failed)", err)
	}
	m.reads.record(sessionID, abs)
	return fmt.Sprintf("OK: 已编辑 %s（%d 处替换）", stringArg(args, "file_path"), count)
}

func (m *Module) limitToolOutput(text string) string {
	if len([]byte(text)) <= maxToolOutputBytes {
		return text
	}
	full := []byte(text)
	inline := full[:maxToolOutputBytes]
	if !isValidUTF8Boundary(inline) {
		inline = inline[:len(inline)-1]
	}
	tail := string(full)
	if len(tail) > 512 {
		tail = tail[len(tail)-512:]
	}
	exitMarker := ""
	if idx := strings.LastIndex(tail, "[exit code:"); idx >= 0 {
		exitMarker = strings.TrimSpace(tail[idx:])
	}
	spillID := newID("spill")
	rel := filepath.ToSlash(filepath.Join("spill", spillID+".txt"))
	if m.sandbox != nil {
		if abs, err := m.sandbox.ResolveArtifact(rel); err == nil {
			_ = os.MkdirAll(filepath.Dir(abs), 0o755)
			if err := os.WriteFile(abs, full, 0o600); err == nil {
				result := string(inline) + fmt.Sprintf("\nOmitted %d bytes; full result at %s", len(full)-len(inline), abs)
				if exitMarker != "" {
					result += "\n" + exitMarker
				}
				return result
			}
		}
	}
	result := string(inline) + fmt.Sprintf("\nOmitted %d bytes (code=output_truncated)", len(full)-len(inline))
	if exitMarker != "" {
		result += "\n" + exitMarker
	}
	return result
}

func isValidUTF8Boundary(data []byte) bool {
	return len(data) == 0 || strings.ToValidUTF8(string(data), "") == string(data)
}

func (m *Module) resolveToolPath(raw, sandbox string) (string, error) {
	raw = normalizeWorkspaceToolPath(raw)
	if raw == "" {
		return "", errors.New("路径不能为空")
	}
	var abs string
	if filepath.IsAbs(raw) || filepath.VolumeName(raw) != "" {
		abs = raw
	} else {
		if m.sandbox == nil || m.sandbox.Workspace == "" {
			return "", errors.New("workspace 未配置")
		}
		abs = filepath.Join(m.sandbox.Workspace, raw)
	}
	canonical, err := canonicalizePath(abs)
	if err != nil {
		return "", err
	}
	if sandbox == sandboxFullAccess {
		return canonical, nil
	}
	if m.sandbox == nil {
		return "", errors.New("workspace 未配置")
	}
	if !isInsideAny(canonical, []string{m.sandbox.Workspace, m.sandbox.Artifacts}) {
		return "", fmt.Errorf("[sandbox: file access denied under %s mode] %s 不在允许根内", sandbox, raw)
	}
	return canonical, nil
}

func canonicalizePath(abs string) (string, error) {
	abs = filepath.Clean(abs)
	existing := abs
	for {
		if _, err := os.Lstat(existing); err == nil {
			break
		}
		parent := filepath.Dir(existing)
		if parent == existing {
			break
		}
		existing = parent
	}
	realExisting, err := filepath.EvalSymlinks(existing)
	if err != nil {
		return "", fmt.Errorf("规范化路径失败: %w", err)
	}
	rel, err := filepath.Rel(existing, abs)
	if err != nil {
		return "", err
	}
	return filepath.Clean(filepath.Join(realExisting, rel)), nil
}

func isInsideAny(candidate string, roots []string) bool {
	for _, root := range roots {
		if root == "" {
			continue
		}
		rel, err := filepath.Rel(filepath.Clean(root), candidate)
		if err != nil {
			continue
		}
		if rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)) {
			return true
		}
	}
	return false
}

func globMatch(pattern, rel string) bool {
	pattern = filepath.ToSlash(pattern)
	rel = filepath.ToSlash(rel)
	if idx := strings.Index(pattern, "**/"); idx >= 0 {
		prefix := pattern[:idx]
		suffix := pattern[idx+3:]
		if prefix != "" && !strings.HasPrefix(rel, prefix) {
			return false
		}
		trimmed := strings.TrimPrefix(rel, prefix)
		if ok, _ := filepath.Match(suffix, trimmed); ok {
			return true
		}
		if ok, _ := filepath.Match(suffix, filepath.Base(trimmed)); ok {
			return true
		}
		return false
	}
	if ok, _ := filepath.Match(pattern, rel); ok {
		return true
	}
	return false
}

func (m *Module) toolPwsh(ctx context.Context, args map[string]any) string {
	command := stringArg(args, "command")
	if strings.TrimSpace(command) == "" {
		return "Error: pwsh 需要 command (code=bad_arguments)"
	}
	timeout := defaultShellTimeout
	if ms := intArg(args, "timeout_ms", 0); ms > 0 {
		if ms < 1000 {
			ms = 1000
		}
		if ms > 120000 {
			ms = 120000
		}
		timeout = time.Duration(ms) * time.Millisecond
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	cmd := exec.CommandContext(runCtx, "powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command)
	if m.sandbox != nil {
		cmd.Dir = m.sandbox.Workspace
	}
	cmd.Env = sandboxEnvironment(m.sandboxHome())
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return fmt.Sprintf("Error: 启动 pwsh 失败: %v (code=spawn_failed)", err)
	}
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()
	timedOut := false
	select {
	case <-waitCh:
	case <-runCtx.Done():
		timedOut = true
		killProcessTree(cmd.Process.Pid)
		<-waitCh
	}
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	if timedOut {
		exitCode = -1
	}
	var combined strings.Builder
	combined.WriteString(stdout.String())
	if stderr.Len() > 0 {
		if combined.Len() > 0 && !strings.HasSuffix(combined.String(), "\n") {
			combined.WriteString("\n")
		}
		combined.WriteString("[stderr]\n")
		combined.WriteString(stderr.String())
	}
	if combined.Len() > 0 && !strings.HasSuffix(combined.String(), "\n") {
		combined.WriteString("\n")
	}
	if timedOut {
		combined.WriteString(fmt.Sprintf("Error: command timed out after %s (code=TIMEOUT)\n", timeout))
	}
	combined.WriteString(fmt.Sprintf("[exit code: %d]", exitCode))
	return combined.String()
}

func (m *Module) toolRunPython(ctx context.Context, sessionID string, args map[string]any, sandbox string) string {
	_ = sessionID
	python := m.pythonExecutable()
	if strings.TrimSpace(python) == "" {
		return "Error: 未找到 Python；请配置 AGENTD_PYTHON 或 tools.python (code=python_missing)"
	}
	code := stringArg(args, "code")
	scriptPath := ""
	cleanup := func() {}
	if strings.TrimSpace(code) != "" {
		root, err := m.generatedTempRoot()
		if err != nil {
			return fmt.Sprintf("Error: 创建临时目录失败: %v (code=io_error)", err)
		}
		file, err := os.CreateTemp(root, "run-python-*.py")
		if err != nil {
			return fmt.Sprintf("Error: 创建临时脚本失败: %v (code=io_error)", err)
		}
		path := file.Name()
		if _, err := file.WriteString(code); err != nil {
			_ = file.Close()
			_ = os.Remove(path)
			return fmt.Sprintf("Error: 写入临时脚本失败: %v (code=io_error)", err)
		}
		if err := file.Close(); err != nil {
			_ = os.Remove(path)
			return fmt.Sprintf("Error: 写入临时脚本失败: %v (code=io_error)", err)
		}
		scriptPath = path
		cleanup = func() { _ = os.Remove(path) }
	} else {
		rawPath := stringArg(args, "path")
		if strings.TrimSpace(rawPath) == "" {
			return "Error: run_python 需要 code 或 path (code=bad_arguments)"
		}
		resolved, err := m.resolveToolPath(rawPath, sandbox)
		if err != nil {
			return fmt.Sprintf("Error: %v (code=path_denied)", err)
		}
		info, err := os.Stat(resolved)
		if err != nil || info.IsDir() {
			return "Error: Python 脚本不存在 (code=path_not_found)"
		}
		scriptPath = resolved
	}
	defer cleanup()

	timeout := defaultShellTimeout
	if ms := intArg(args, "timeout_ms", 0); ms > 0 {
		if ms < 1000 {
			ms = 1000
		}
		if ms > 120000 {
			ms = 120000
		}
		timeout = time.Duration(ms) * time.Millisecond
	}
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	argv := []string{scriptPath}
	for _, arg := range stringArgs(args["args"]) {
		argv = append(argv, arg)
	}
	cmd := exec.CommandContext(runCtx, python, argv...)
	if m.sandbox != nil {
		cmd.Dir = m.sandbox.Workspace
	}
	cmd.Env = append(sandboxEnvironment(m.sandboxHome()), "PYTHONUTF8=1", "PYTHONIOENCODING=utf-8")
	var stdout, stderr strings.Builder
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Start(); err != nil {
		return fmt.Sprintf("Error: 启动 Python 失败: %v (code=spawn_failed)", err)
	}
	waitCh := make(chan error, 1)
	go func() { waitCh <- cmd.Wait() }()
	timedOut := false
	select {
	case <-waitCh:
	case <-runCtx.Done():
		timedOut = true
		killProcessTree(cmd.Process.Pid)
		<-waitCh
	}
	exitCode := 0
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}
	if timedOut {
		exitCode = -1
	}
	var combined strings.Builder
	combined.WriteString(stdout.String())
	if stderr.Len() > 0 {
		if combined.Len() > 0 && !strings.HasSuffix(combined.String(), "\n") {
			combined.WriteString("\n")
		}
		combined.WriteString("[stderr]\n")
		combined.WriteString(stderr.String())
	}
	if combined.Len() > 0 && !strings.HasSuffix(combined.String(), "\n") {
		combined.WriteString("\n")
	}
	if timedOut {
		combined.WriteString(fmt.Sprintf("Error: python timed out after %s (code=TIMEOUT)\n", timeout))
	}
	combined.WriteString(fmt.Sprintf("[exit code: %d]", exitCode))
	return combined.String()
}

func stringArgs(value any) []string {
	switch list := value.(type) {
	case []any:
		out := make([]string, 0, len(list))
		for _, item := range list {
			out = append(out, fmt.Sprint(item))
		}
		return out
	case []string:
		return list
	case string:
		if strings.TrimSpace(list) != "" {
			return strings.Fields(list)
		}
	}
	return nil
}

func (m *Module) sandboxHome() string {
	if m.sandbox == nil {
		return ""
	}
	return m.sandbox.Home
}

func sandboxEnvironment(home string) []string {
	keys := []string{
		"PATH", "PATHEXT", "SystemRoot", "SystemDrive", "WINDIR", "COMSPEC",
		"TEMP", "TMP", "HOME", "USERPROFILE", "USERNAME", "APPDATA", "LOCALAPPDATA",
		"ProgramFiles", "ProgramFiles(x86)", "ProgramData", "PSModulePath",
		"PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
	}
	env := make([]string, 0, len(keys)+2)
	for _, key := range keys {
		if value, ok := os.LookupEnv(key); ok && value != "" {
			env = append(env, key+"="+value)
		}
	}
	if home != "" {
		env = append(env, "AGENTD_HOME="+home)
	}
	env = append(env, "AGENTD_SHELL=1")
	return env
}

func killProcessTree(pid int) {
	if pid <= 0 {
		return
	}
	if runtime.GOOS == "windows" {
		_ = exec.Command("taskkill", "/PID", strconv.Itoa(pid), "/T", "/F").Run()
		return
	}
	_ = exec.Command("kill", "-TERM", "-"+strconv.Itoa(pid)).Run()
}

func normalizeWorkspaceToolPath(rel string) string {
	rel = strings.TrimSpace(rel)
	if strings.HasPrefix(rel, "workspace/") || strings.HasPrefix(rel, `workspace\`) {
		rel = rel[len("workspace/"):]
	}
	return rel
}

func stringArg(args map[string]any, key string) string {
	if value, ok := args[key].(string); ok {
		return value
	}
	return ""
}

func intArg(args map[string]any, key string, fallback int) int {
	switch value := args[key].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case int64:
		return int(value)
	}
	return fallback
}

func boolArg(args map[string]any, key string) bool {
	if value, ok := args[key].(bool); ok {
		return value
	}
	return false
}

func truncateRunes(text string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "..."
}
