// Package chat 是对话模块：REST/WS + Turn/Step Loop + 工具 + 撤回。
//
// 模块边界（docs/m1-contract.md §9、docs/m2-contract.md §10）：
//   - 只 import core / platform，不 import 其他模块；
//   - messages/turns/decisions 表由本模块 migrations 创建；
//   - 与 sessions 只声明 DependsOn；与 tasks 只通过 core/task.Service 通信。
package chat

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"simo/internal/core/eventlog"
	corememory "simo/internal/core/memory"
	"simo/internal/core/module"
	coresession "simo/internal/core/session"
	corespec "simo/internal/core/spec"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
	"simo/internal/platform/llm"
	"simo/internal/platform/permission"
	"simo/internal/platform/tokenmeter"
	"simo/internal/platform/workspace"
)

// Options 是 chat 模块的可选依赖（composition root 注入）。
type Options struct {
	ReasoningByRole  map[string]string
	ReasoningDefault string
	MaxOutputTokens  int
	ChromePath       string
	PythonPath       string
	ScriptsDir       string
	MockMode         bool
	Permission       *permission.Policy
	// Memory 是 M3 记忆端口；nil 表示 memory 模块未启用。
	Memory corememory.Service
	// Sessions 是 M4 会话端口；nil 表示会话模块未启用（降级为单会话）。
	Sessions coresession.Service
	Spec     corespec.Service
	// Debug 为 true 时才注册 /api/debug/*（只读、仅本机；默认关闭）。
	Debug bool
}

// debugLLMRequest 是最近一次模型请求快照（只读排障，不含 key）。
type debugLLMRequest struct {
	At              int64         `json:"at"`
	Model           string        `json:"model"`
	ReasoningEffort string        `json:"reasoningEffort"`
	Messages        []llm.Message `json:"messages"`
	Tools           []llm.Tool    `json:"tools"`
}

// Module 是 chat 模块。
type Module struct {
	store    *store.Store
	events   *eventlog.Logger
	provider llm.Provider
	taskSvc  coretask.Service
	meter    *tokenmeter.Meter
	sandbox  *workspace.Policy
	memory   corememory.Service
	sessions coresession.Service
	specSvc  corespec.Service

	log              *slog.Logger
	perm             *permission.Policy
	tools            []llm.Tool
	reasoningByRole  map[string]string
	reasoningDefault string
	maxOutputTokens  int
	chromePath       string
	pythonPath       string
	scriptsDir       string
	mockMode         bool
	debug            bool

	debugMu     sync.Mutex
	lastRequest *debugLLMRequest

	mu     sync.Mutex
	active map[string]*activeTurn
	wg     sync.WaitGroup

	perms *permissionState
	reads *readGuard

	eventCancel context.CancelFunc
	eventUnsub  func()
	eventWG     sync.WaitGroup

	schedCancel context.CancelFunc
	schedWG     sync.WaitGroup

	runtimeStarted time.Time
	runtimeMu      sync.RWMutex
	runtimeCfg     runtimeConfig
	runtimeCancel  context.CancelFunc
	runtimeWG      sync.WaitGroup
}

var _ module.Module = (*Module)(nil)

// New 创建 chat 模块。
func New(
	st *store.Store,
	events *eventlog.Logger,
	provider llm.Provider,
	taskSvc coretask.Service,
	meter *tokenmeter.Meter,
	sandbox *workspace.Policy,
	logger *slog.Logger,
	opts Options,
) *Module {
	if provider == nil {
		provider = llm.NewMock()
	}
	if logger == nil {
		logger = slog.Default()
	}
	perm := opts.Permission
	if perm == nil {
		perm = permission.NewDefault()
	}
	maxTokens := opts.MaxOutputTokens
	if maxTokens <= 0 {
		maxTokens = 1024
	}
	return &Module{
		store:            st,
		events:           events,
		provider:         provider,
		taskSvc:          taskSvc,
		meter:            meter,
		sandbox:          sandbox,
		memory:           opts.Memory,
		sessions:         opts.Sessions,
		specSvc:          opts.Spec,
		log:              logger,
		perm:             perm,
		tools:            toolDefinitions(),
		chromePath:       opts.ChromePath,
		pythonPath:       opts.PythonPath,
		scriptsDir:       opts.ScriptsDir,
		mockMode:         opts.MockMode,
		reasoningByRole:  opts.ReasoningByRole,
		reasoningDefault: opts.ReasoningDefault,
		maxOutputTokens:  maxTokens,
		debug:            opts.Debug,
		active:           make(map[string]*activeTurn),
		runtimeStarted:   time.Now(),
		runtimeCfg:       defaultRuntimeConfig,
		perms:            newPermissionState(),
		reads:            newReadGuard(),
	}
}

// ID 实现 module.Module。
func (m *Module) ID() string { return "chat" }

// DependsOn 实现 module.Module；tasks 是可选的（未启用时 DELEGATE 降级为普通回复）。
func (m *Module) DependsOn() []string { return []string{"sessions"} }

// Migrations 实现 module.Module。
func (m *Module) Migrations() []module.Migration { return migrations() }

// Register 实现 module.Module。
func (m *Module) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/messages", m.handleMessages)
	mux.HandleFunc("GET /api/sessions/{id}/messages", m.handleSessionMessagesAll)
	mux.HandleFunc("GET /api/sessions/{id}/messages/all", m.handleSessionMessagesAll)
	mux.HandleFunc("GET /api/messages/search", m.handleMessageSearch)
	mux.HandleFunc("POST /api/messages/{id}/edit", m.handleEditDisabled)
	mux.HandleFunc("POST /api/messages/{id}/correct", m.handleEditDisabled)
	mux.HandleFunc("PATCH /api/messages/{id}", m.handleEditDisabled)
	mux.HandleFunc("GET /api/sessions/{id}/files", m.handleSessionFiles)
	mux.HandleFunc("GET /api/agents", m.handleAgents)
	mux.HandleFunc("GET /api/stats", m.handleStats)
	mux.HandleFunc("GET /api/metrics", m.handleMetrics)
	mux.HandleFunc("GET /api/metrics/dashboard", m.handleMetrics)
	mux.HandleFunc("GET /api/runtime/status", m.handleRuntimeStatus)
	mux.HandleFunc("GET /api/workflows/{id}/runtime", m.handleWorkflowRuntime)
	mux.HandleFunc("GET /api/tasks/{id}/runtime", m.handleTaskRuntime)
	mux.HandleFunc("GET /api/actions", m.handleActionList)
	mux.HandleFunc("GET /api/actions/{name}", m.handleActionDescribe)
	mux.HandleFunc("POST /api/actions/{name}", m.handleActionExecute)
	m.registerTeamHTTP(mux)
	m.registerViewHTTP(mux)
	m.registerCardHTTP(mux)
	m.registerScheduleHTTP(mux)
	mux.HandleFunc("POST /api/chat", m.handleChat)
	mux.HandleFunc("POST /api/uploads", m.handleUpload)
	mux.HandleFunc("GET /api/uploads/{id}/meta", m.handleUploadMeta)
	mux.HandleFunc("GET /api/uploads/{id}", m.handleUploadContent)
	mux.HandleFunc("DELETE /api/uploads/{id}", m.handleUploadDelete)
	mux.HandleFunc("GET /api/permissions", m.handlePermissionsGet)
	mux.HandleFunc("POST /api/permissions", m.handlePermissionsPost)
	mux.HandleFunc("GET /api/ws", m.handleWS)
	mux.HandleFunc("GET /api/usage", m.handleUsage)
	mux.HandleFunc("GET /api/decisions", m.handleDecisions)
	mux.HandleFunc("GET /api/approvals", m.handleApprovals)
	mux.HandleFunc("GET /api/approvals/{id}", m.handleApprovalGet)
	mux.HandleFunc("POST /api/approvals/{id}", m.handleApprovalDecision)
	if m.debug {
		mux.HandleFunc("GET /api/debug/last-llm-request", m.handleLastLLMRequest)
		mux.HandleFunc("GET /api/debug/goroutines", m.handleGoroutines)
		mux.HandleFunc("POST /api/debug/runtime/config", m.handleDebugRuntimeConfig)
		mux.HandleFunc("GET /api/debug/runtime", m.handleDebugRuntime)
		mux.HandleFunc("GET /api/debug/routes", m.handleDebugRoutes)
	}
}

// Start 实现 module.Module。
func (m *Module) Start(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	if m.events != nil {
		eventCtx, cancel := context.WithCancel(ctx)
		ch, unsub := m.events.Subscribe(eventCtx)
		m.eventCancel = cancel
		m.eventUnsub = unsub
		m.eventWG.Add(1)
		go m.consumeTaskReports(ch)
	}
	m.startScheduler(ctx)
	m.recoverStaleStreaming(ctx)
	m.startRuntime(ctx)
	m.log.Debug("module started", "module", m.ID())
	return nil
}

// Stop 实现 module.Module：取消进行中的 Turn，等待 goroutine 退出。
func (m *Module) Stop(ctx context.Context) error {
	m.stopRuntime()
	m.stopScheduler()
	if m.eventCancel != nil {
		m.eventCancel()
	}
	if m.eventUnsub != nil {
		m.eventUnsub()
	}
	m.mu.Lock()
	for _, active := range m.active {
		active.cancel()
	}
	m.mu.Unlock()

	done := make(chan struct{})
	go func() {
		m.wg.Wait()
		m.eventWG.Wait()
		close(done)
	}()
	select {
	case <-done:
		m.log.Debug("module stopped", "module", m.ID())
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (m *Module) handleUsage(w http.ResponseWriter, r *http.Request) {
	if m.meter == nil {
		httpserver.WriteJSON(w, http.StatusOK, tokenmeter.Report{})
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, m.meter.Report())
}
