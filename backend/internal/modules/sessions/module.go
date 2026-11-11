// Package sessions 是会话模块：会话树、归档只读、SpecCore 最小。
//
// 模块边界（docs/m1-contract.md §9）：
//   - 只 import core / platform，不 import 其他模块；
//   - 表结构由本模块的 migrations 创建；
//   - 路由 /api/sessions 由本模块自挂；spec 仅内部使用，不暴露公开 API。
package sessions

import (
	"context"
	"log/slog"
	"net/http"
	"sync"

	"simo/internal/core/eventlog"
	corememory "simo/internal/core/memory"
	"simo/internal/core/module"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
)

// Options 是 sessions 的可选依赖（composition root 注入）。
type Options struct {
	Events *eventlog.Logger
	Tasks  coretask.Service
	Memory corememory.Service
	Debug  bool
}

// Module 实现 core/module.Module。
type Module struct {
	store  *store.Store
	log    *slog.Logger
	events *eventlog.Logger
	tasks  coretask.Service
	memory corememory.Service
	debug  bool

	ctx    context.Context
	cancel context.CancelFunc
	unsub  func()
	wg     sync.WaitGroup

	draftMu sync.Mutex
	drafts  map[string]draftSession
}

// New 创建会话模块；Options 可选（不传时退化为 M1 单会话）。
func New(st *store.Store, logger *slog.Logger, options ...Options) *Module {
	m := &Module{store: st, log: logger, drafts: make(map[string]draftSession)}
	if len(options) > 0 {
		opt := options[0]
		m.events = opt.Events
		m.tasks = opt.Tasks
		m.memory = opt.Memory
		m.debug = opt.Debug
	}
	return m
}

// ID 实现 module.Module。
func (m *Module) ID() string { return "sessions" }

// DependsOn 实现 module.Module。
func (m *Module) DependsOn() []string { return nil }

// Migrations 实现 module.Module。
func (m *Module) Migrations() []module.Migration { return migrations() }

// Register 实现 module.Module。
func (m *Module) Register(mux *http.ServeMux) { m.registerHTTP(mux) }

// Start 实现 module.Module：订阅任务事件推进 spec。
func (m *Module) Start(ctx context.Context) error {
	if ctx == nil {
		ctx = context.Background()
	}
	m.ctx, m.cancel = context.WithCancel(ctx)
	m.cleanupEmptySessions(context.Background())
	m.ensureAllSpecs(context.Background())
	if m.events != nil {
		sub, unsub := m.events.Subscribe(m.ctx)
		m.unsub = unsub
		m.wg.Add(1)
		go m.consumeEvents(sub)
	}
	m.log.Debug("module started", "module", m.ID())
	return nil
}

// Stop 实现 module.Module。
func (m *Module) Stop(ctx context.Context) error {
	if m.cancel != nil {
		m.cancel()
	}
	if m.unsub != nil {
		m.unsub()
	}
	done := make(chan struct{})
	go func() {
		m.wg.Wait()
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
