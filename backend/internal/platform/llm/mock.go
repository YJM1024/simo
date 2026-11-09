package llm

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"
)

// MockScript 是一轮脚本化模型行为（按调用顺序消费，最后一条重复）。
type MockScript struct {
	Deltas          []string
	ReasoningDeltas []string
	ToolCalls       []ToolCall
	Usage           *Usage
	Err             error
	Delay           time.Duration
	// ChunkDelay 是每个 delta 之间的间隔（默认 mock 用它模拟流式，方便撤回测试）。
	ChunkDelay time.Duration
}

// Mock 是确定性 Provider，供测试与默认 mock 模式使用。
// 它会记录每次请求，便于断言 reasoning_content 回传等纪律。
type Mock struct {
	mu       sync.Mutex
	model    string
	scripts  []MockScript
	call     int
	requests []ChatRequest
}

// NewMock 创建默认 mock：把最后一条用户消息回显为固定格式文本。
func NewMock() *Mock { return &Mock{model: "mock-provider"} }

// NewMockWithScripts 创建脚本化 mock。
func NewMockWithScripts(scripts ...MockScript) *Mock {
	return &Mock{model: "mock-provider", scripts: scripts}
}

// ModelName 实现 Provider。
func (m *Mock) ModelName() string {
	if m.model == "" {
		return "mock-provider"
	}
	return m.model
}

// SetScripts 替换脚本（测试中按用例重置）。
func (m *Mock) SetScripts(scripts ...MockScript) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.scripts = scripts
	m.call = 0
}

// Requests 返回已接收请求的深拷贝。
func (m *Mock) Requests() []ChatRequest {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]ChatRequest, len(m.requests))
	copy(out, m.requests)
	return out
}

// Stream 实现 Provider。
func (m *Mock) Stream(ctx context.Context, req ChatRequest) (<-chan Event, error) {
	m.mu.Lock()
	m.requests = append(m.requests, cloneRequest(req))
	script := m.nextScriptLocked(req)
	m.mu.Unlock()

	ch := make(chan Event, 16)
	go func() {
		defer close(ch)
		if script.Err != nil {
			sendEvent(ctx, ch, Event{Kind: KindError, Err: script.Err})
			return
		}
		if script.Delay > 0 {
			select {
			case <-time.After(script.Delay):
			case <-ctx.Done():
				sendEvent(ctx, ch, Event{Kind: KindError, Err: ctx.Err()})
				return
			}
		}
		for _, delta := range script.ReasoningDeltas {
			if !sendEvent(ctx, ch, Event{Kind: KindReasoning, ReasoningDelta: delta}) {
				return
			}
		}
		for _, delta := range script.Deltas {
			if !sendEvent(ctx, ch, Event{Kind: KindDelta, Delta: delta}) {
				return
			}
			if script.ChunkDelay > 0 {
				select {
				case <-time.After(script.ChunkDelay):
				case <-ctx.Done():
					sendEvent(ctx, ch, Event{Kind: KindError, Err: ctx.Err()})
					return
				}
			}
		}
		for i := range script.ToolCalls {
			call := script.ToolCalls[i]
			if !sendEvent(ctx, ch, Event{Kind: KindToolCall, ToolCall: &call}) {
				return
			}
		}
		if script.Usage != nil {
			usage := *script.Usage
			if usage.Model == "" {
				usage.Model = m.ModelName()
			}
			if usage.TotalTokens == 0 {
				usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
			}
			if !sendEvent(ctx, ch, Event{Kind: KindUsage, Usage: &usage}) {
				return
			}
		}
		sendEvent(ctx, ch, Event{Kind: KindDone, Done: true})
	}()
	return ch, nil
}

func (m *Mock) nextScriptLocked(req ChatRequest) MockScript {
	if len(m.scripts) > 0 {
		index := m.call
		if index >= len(m.scripts) {
			index = len(m.scripts) - 1
		}
		m.call++
		return m.scripts[index]
	}
	m.call++
	return defaultMockScript(req)
}

func defaultMockScript(req ChatRequest) MockScript {
	script := defaultMockScriptRaw(req)
	lastUser := ""
	lastRole := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			lastUser = req.Messages[i].Content
			break
		}
	}
	if len(req.Messages) > 0 {
		lastRole = req.Messages[len(req.Messages)-1].Role
	}
	if lastRole == "tool" {
		// 工具结果后的续写不再是回复第一行，不能再注入分类标记。
		return script
	}
	category := "consultation"
	lower := strings.ToLower(lastUser)
	if idx := strings.Index(lower, "mock:category="); idx >= 0 {
		value := lower[idx+len("mock:category="):]
		if end := strings.IndexAny(value, " \t\r\n，。；;"); end >= 0 {
			value = value[:end]
		}
		switch strings.TrimSpace(value) {
		case "requirement", "clarification", "progress", "consultation":
			category = strings.TrimSpace(value)
		}
	} else {
		switch {
		case strings.Contains(lower, "mock:clarification"), strings.Contains(lower, "mock:clarify"):
			category = "clarification"
		case strings.Contains(lower, "mock:requirement"):
			category = "requirement"
		case strings.Contains(lower, "mock:progress"):
			category = "progress"
		case strings.Contains(lower, "mock:workflow"), strings.Contains(lower, "mock:write"),
			strings.Contains(lower, "mock:pwsh"), strings.Contains(lower, "mock:escalate"),
			strings.Contains(lower, "mock:make-"), strings.Contains(lower, "mock:web-"),
			strings.Contains(lower, "mock:read"), strings.Contains(lower, "mock:glob"),
			strings.Contains(lower, "mock:grep"), strings.Contains(lower, "mock:delete"):
			category = "progress"
		}
	}
	body := strings.Join(script.Deltas, "")
	script.Deltas = splitMockText("@@CATEGORY: " + category + "\n\n" + body)
	return script
}

func defaultMockScriptRaw(req ChatRequest) MockScript {
	lastUser := ""
	lastRole := ""
	for i := len(req.Messages) - 1; i >= 0; i-- {
		if req.Messages[i].Role == "user" {
			lastUser = req.Messages[i].Content
			break
		}
	}
	if len(req.Messages) > 0 {
		lastRole = req.Messages[len(req.Messages)-1].Role
	}

	usage := &Usage{PromptTokens: 12, CompletionTokens: 8, ReasoningTokens: 3}
	script := MockScript{
		ReasoningDeltas: []string{"先判断用户意图。"},
		Usage:           usage,
		ChunkDelay:      25 * time.Millisecond,
	}
	if lastRole == "tool" {
		script.Deltas = splitMockText("已根据工具结果整理完毕。这是 M2 Mock 模型的确定性回复。")
		return script
	}

	lower := strings.ToLower(lastUser)
	if strings.Contains(lower, "mock:pwsh-big") {
		script.Deltas = splitMockText("生成大输出并触发 spill。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-pwsh-big", Type: "function", Function: FunctionCall{
			Name: "pwsh", Arguments: `{"command":"1..20000 | ForEach-Object { 'xxxxxxxxxxxxxxxxxxxx' }"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:pwsh-sleep") {
		script.Deltas = splitMockText("执行会超时的命令。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-pwsh-sleep", Type: "function", Function: FunctionCall{
			Name: "pwsh", Arguments: `{"command":"Start-Sleep -Seconds 5","timeout_ms":1000}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:pwsh-env") {
		script.Deltas = splitMockText("检查环境变量是否泄漏。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-pwsh-env", Type: "function", Function: FunctionCall{
			Name: "pwsh", Arguments: `{"command":"Write-Output ('DEEPSEEK_API_KEY=' + $env:DEEPSEEK_API_KEY); Write-Output ('OPENAI_API_KEY=' + $env:OPENAI_API_KEY); if (-not $env:DEEPSEEK_API_KEY) { Write-Output 'empty' }"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:write-outside") {
		script.Deltas = splitMockText("写 workspace 外会被沙盒拒绝。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-write-outside", Type: "function", Function: FunctionCall{
			Name: "write", Arguments: `{"file_path":"../outside-m9.txt","content":"outside"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:escalate-jump") {
		script.Deltas = splitMockText("跨档提权会被拒绝。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-escalate-jump", Type: "function", Function: FunctionCall{
			Name: "write", Arguments: `{"file_path":"jump.txt","content":"jump","sandbox_permissions":"read-only","justification":"跨档测试"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:escalate") {
		runID := mockRunID(lastUser)
		filePath := "escalated-" + runID + ".txt"
		if runID == "" {
			filePath = "escalated.txt"
		}
		script.Deltas = splitMockText("提权写入需要审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-escalate", Type: "function", Function: FunctionCall{
			Name: "write", Arguments: `{"file_path":` + mockJSON(filePath) +
				`,"content":"escalated","sandbox_permissions":"danger-full-access","justification":"用户明确要求提权写入"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:pwsh") {
		command := strings.TrimSpace(lastUser[strings.Index(lower, "mock:pwsh")+len("mock:pwsh"):])
		command = strings.TrimLeft(command, "：:，, ")
		if command == "" {
			command = "echo hi"
		}
		script.Deltas = splitMockText("执行命令需要审批，我先发起 pending approval。")
		script.ToolCalls = []ToolCall{{
			ID:   "call-mock-pwsh",
			Type: "function",
			Function: FunctionCall{
				Name:      "pwsh",
				Arguments: `{"command":` + mockJSON(command) + `}`,
			},
		}}
		return script
	}
	if strings.Contains(lower, "mock:glob") {
		pattern := strings.TrimSpace(lastUser[strings.Index(lower, "mock:glob")+len("mock:glob"):])
		pattern = strings.TrimLeft(pattern, "：:，, ")
		if pattern == "" {
			pattern = "**/*.go"
		}
		script.Deltas = splitMockText("先列出匹配文件。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-glob", Type: "function", Function: FunctionCall{
			Name: "glob", Arguments: `{"pattern":` + mockJSON(pattern) + `}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:grep") {
		pattern := strings.TrimSpace(lastUser[strings.Index(lower, "mock:grep")+len("mock:grep"):])
		pattern = strings.TrimLeft(pattern, "：:，, ")
		if pattern == "" {
			pattern = "package"
		}
		script.Deltas = splitMockText("搜索匹配内容。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-grep", Type: "function", Function: FunctionCall{
			Name: "grep", Arguments: `{"pattern":` + mockJSON(pattern) + `}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:make-pdf") {
		script.Deltas = splitMockText("生成 PDF 需要写盘审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-make-pdf", Type: "function", Function: FunctionCall{
			Name: "make_pdf", Arguments: `{"title":"M12 测试文档","markdown":"# M12 测试文档\n\n这是一个 **PDF** 生成测试。\n\n- 第一项\n- 第二项","filename":"m12-test.pdf"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:make-docx") {
		script.Deltas = splitMockText("生成 DOCX 需要写盘审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-make-docx", Type: "function", Function: FunctionCall{
			Name: "make_docx", Arguments: `{"markdown":"# M12 DOCX\n\n正文内容。","filename":"m12-test.docx"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:make-xlsx") {
		script.Deltas = splitMockText("生成 XLSX 需要写盘审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-make-xlsx", Type: "function", Function: FunctionCall{
			Name: "make_xlsx", Arguments: `{"sheets":[{"name":"数据","rows":[["名称","数量"],["苹果",3],["香蕉",5]]}],"filename":"m12-test.xlsx"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:make-pptx") {
		script.Deltas = splitMockText("生成 PPTX 需要写盘审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-make-pptx", Type: "function", Function: FunctionCall{
			Name: "make_pptx", Arguments: `{"slides":[{"title":"M12","bullets":["文件生成","联网抓取"]}],"filename":"m12-test.pptx"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:make-image") {
		script.Deltas = splitMockText("生成图片需要写盘审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-make-image", Type: "function", Function: FunctionCall{
			Name: "make_image", Arguments: `{"prompt":"M12 图片测试","filename":"m12-test.png"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:web-fetch") {
		target := strings.TrimSpace(lastUser[strings.Index(lower, "mock:web-fetch")+len("mock:web-fetch"):])
		target = strings.TrimLeft(target, "：:，, ")
		if target == "" {
			target = "https://example.com"
		}
		script.Deltas = splitMockText("抓取网页需要网络审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-web-fetch", Type: "function", Function: FunctionCall{
			Name: "web_fetch", Arguments: `{"url":` + mockJSON(target) + `}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:web-search") {
		query := strings.TrimSpace(lastUser[strings.Index(lower, "mock:web-search")+len("mock:web-search"):])
		query = strings.TrimLeft(query, "：:，, ")
		if query == "" {
			query = "simo"
		}
		script.Deltas = splitMockText("搜索需要网络审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-web-search", Type: "function", Function: FunctionCall{
			Name: "web_search", Arguments: `{"query":` + mockJSON(query) + `,"count":3}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:action=") || strings.Contains(lower, "mock:tool=") {
		marker := "mock:action="
		if !strings.Contains(lower, marker) {
			marker = "mock:tool="
		}
		rest := strings.TrimSpace(lastUser[strings.Index(lower, marker)+len(marker):])
		fields := strings.Fields(rest)
		if len(fields) > 0 {
			toolName := fields[0]
			argsJSON := "{}"
			if len(fields) > 1 {
				args := map[string]string{}
				for _, field := range fields[1:] {
					parts := strings.SplitN(field, "=", 2)
					if len(parts) == 2 {
						args[parts[0]] = parts[1]
					}
				}
				if raw, err := json.Marshal(args); err == nil {
					argsJSON = string(raw)
				}
			}
			script.Deltas = splitMockText("调用动作工具。")
			script.ToolCalls = []ToolCall{{ID: "call-mock-action", Type: "function", Function: FunctionCall{
				Name: toolName, Arguments: argsJSON,
			}}}
			return script
		}
	}
	if strings.Contains(lower, "mock:python:") {
		idx := strings.Index(lower, "mock:python:")
		pyCode := strings.TrimSpace(lastUser[idx+len("mock:python:"):])
		script.Deltas = splitMockText("执行 Python 需要审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-run-python-inline", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"code":` + mockJSON(pyCode) + `}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:run-python") {
		rest := strings.TrimSpace(lastUser[strings.Index(lower, "mock:run-python")+len("mock:run-python"):])
		rest = strings.TrimLeft(rest, "：:，, ")
		pyCode := "print('hello from python')"
		pyPath := ""
		if rest != "" {
			if strings.HasPrefix(rest, "code=") {
				pyCode = strings.TrimPrefix(rest, "code=")
			} else if strings.HasPrefix(rest, "path=") {
				pyPath = strings.TrimPrefix(rest, "path=")
			} else {
				pyCode = rest
			}
		}
		script.Deltas = splitMockText("执行 Python 需要审批。")
		argsJSON := `{"code":` + mockJSON(pyCode) + `}`
		if pyPath != "" {
			argsJSON = `{"path":` + mockJSON(pyPath) + `}`
		}
		script.ToolCalls = []ToolCall{{ID: "call-mock-run-python", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: argsJSON,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:python-sleep") {
		script.Deltas = splitMockText("执行会超时的 Python。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-python-sleep", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"code":"import time; time.sleep(5)","timeout_ms":1000}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:python-big") {
		script.Deltas = splitMockText("生成大输出。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-python-big", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"code":"print('x' * 100000)"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:python-env") {
		script.Deltas = splitMockText("检查 Python 环境变量。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-python-env", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"code":"import os; print('ENV_START'); print('SIMO_HOME=' + os.environ.get('SIMO_HOME','')); print('PATH_SET=' + str(bool(os.environ.get('PATH')))); print('ENV_END')"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:python-file") {
		script.Deltas = splitMockText("Python 读写文件需要审批。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-python-file", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"code":"from pathlib import Path; Path('python-written.txt').write_text('hello', encoding='utf-8'); print('written')"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:python-outside") {
		script.Deltas = splitMockText("Python 脚本路径越界应被拒绝。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-python-outside", Type: "function", Function: FunctionCall{
			Name: "run_python", Arguments: `{"path":"../outside.py"}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:read") {
		path := strings.TrimSpace(lastUser[strings.Index(lower, "mock:read")+len("mock:read"):])
		path = strings.TrimLeft(path, "：:，, ")
		if path == "" {
			path = "README.md"
		}
		script.Deltas = splitMockText("先读取文件。")
		script.ToolCalls = []ToolCall{{ID: "call-mock-read-explicit", Type: "function", Function: FunctionCall{
			Name: "read", Arguments: `{"file_path":` + mockJSON(path) + `}`,
		}}}
		return script
	}
	if strings.Contains(lower, "mock:delete") {
		script.Deltas = splitMockText("删除操作会被权限层拒绝，我先尝试调用工具。")
		script.ToolCalls = []ToolCall{{
			ID:   "call-mock-delete",
			Type: "function",
			Function: FunctionCall{
				Name:      "delete_file",
				Arguments: `{"path":"secret.txt"}`,
			},
		}}
		return script
	}
	if strings.Contains(lower, "mock:write") {
		script.Deltas = splitMockText("写文件需要审批，我先发起 pending approval。")
		script.ToolCalls = []ToolCall{{
			ID:   "call-mock-write-explicit",
			Type: "function",
			Function: FunctionCall{
				Name:      "write_file",
				Arguments: `{"path":"mock-write.txt","content":"TODO\n"}`,
			},
		}}
		return script
	}
	if strings.Contains(lower, "notes.md") || strings.Contains(lastUser, "写进") ||
		strings.Contains(lastUser, "写入") || strings.Contains(lastUser, "写到") ||
		strings.Contains(lastUser, "写文件") {
		script.Deltas = splitMockText("这个操作需要写文件，我先发起审批。")
		script.ToolCalls = []ToolCall{{
			ID:   "call-mock-write",
			Type: "function",
			Function: FunctionCall{
				Name:      "write_file",
				Arguments: `{"path":"notes.md","content":"TODO\n"}`,
			},
		}}
		return script
	}
	if strings.Contains(lower, "readme") || strings.Contains(lastUser, "读取") || strings.Contains(lastUser, "搜索") {
		script.Deltas = splitMockText("我先读取 workspace 里的资料，再给你总结。")
		script.ToolCalls = []ToolCall{{
			ID:   "call-mock-read",
			Type: "function",
			Function: FunctionCall{
				Name:      "read_file",
				Arguments: `{"path":"README.md"}`,
			},
		}}
		return script
	}

	script.Deltas = splitMockText("（M2 Mock 模型）收到你的消息：" + lastUser + "。真实模型在 -model real / SIMO_LLM=deepseek 时启用。")
	return script
}

func mockRunID(text string) string {
	const prefix = "evals-esc-"
	lower := strings.ToLower(text)
	idx := strings.Index(lower, prefix)
	if idx < 0 {
		return ""
	}
	rest := text[idx+len(prefix):]
	if end := strings.IndexAny(rest, " \t\r\n，,。"); end >= 0 {
		rest = rest[:end]
	}
	return strings.TrimSpace(rest)
}

func mockJSON(value string) string {
	raw, _ := json.Marshal(value)
	return string(raw)
}

func splitMockText(text string) []string {
	runes := []rune(text)
	if len(runes) == 0 {
		return []string{""}
	}
	out := make([]string, 0, len(runes)/6+1)
	for len(runes) > 0 {
		n := 6
		if len(runes) < n {
			n = len(runes)
		}
		out = append(out, string(runes[:n]))
		runes = runes[n:]
	}
	return out
}

func sendEvent(ctx context.Context, ch chan<- Event, event Event) bool {
	select {
	case ch <- event:
		return true
	case <-ctx.Done():
		return false
	}
}

func cloneRequest(req ChatRequest) ChatRequest {
	clone := req
	clone.Messages = append([]Message(nil), req.Messages...)
	for i := range clone.Messages {
		clone.Messages[i].ToolCalls = append([]ToolCall(nil), req.Messages[i].ToolCalls...)
	}
	clone.Tools = append([]Tool(nil), req.Tools...)
	return clone
}
