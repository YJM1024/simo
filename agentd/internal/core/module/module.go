// Package module 定义内核的模块接口与注册表。
//
// 强制规则（docs/m1-contract.md §9）：
//   - 模块之间禁止直接 import，只能声明 DependsOn，并通过 core 的 store/eventlog 通信；
//   - 迁移按模块命名空间（migration_version(module, version)）；
//   - 启动由 Registry 按依赖拓扑排序，Stop 反向；
//   - 用 internal/core/module/archtest_test.go 扫描 import 图强制上述规则。
package module

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"agentd/internal/platform/sqlite"
)

// Migration 是模块迁移；等价于 platform/sqlite.Migration。
type Migration = sqlite.Migration

// Module 是业务模块契约。模块在构造时注入依赖（store/eventlog 等），
// Register 只拿 mux，自己挂载 /api/<module>/... 路由。
type Module interface {
	ID() string
	DependsOn() []string
	Migrations() []Migration
	Register(mux *http.ServeMux)
	Start(ctx context.Context) error
	Stop(ctx context.Context) error
}

// Registry 是模块注册表：校验依赖、迁移、挂路由、启停。
type Registry struct {
	modules []Module
	byID    map[string]Module
	started []Module
}

// NewRegistry 创建空注册表。
func NewRegistry() *Registry {
	return &Registry{byID: make(map[string]Module)}
}

// Register 注册一个模块；ID 重复/为空会失败。
func (r *Registry) Register(m Module) error {
	if m == nil {
		return errors.New("不能注册 nil 模块")
	}
	id := strings.TrimSpace(m.ID())
	if id == "" {
		return errors.New("模块 ID 不能为空")
	}
	if _, ok := r.byID[id]; ok {
		return fmt.Errorf("模块 %q 重复注册", id)
	}
	r.byID[id] = m
	r.modules = append(r.modules, m)
	return nil
}

// Modules 返回注册的模块（注册顺序）。
func (r *Registry) Modules() []Module {
	out := make([]Module, len(r.modules))
	copy(out, r.modules)
	return out
}

// IDs 返回注册的模块 ID（注册顺序）。
func (r *Registry) IDs() []string {
	out := make([]string, 0, len(r.modules))
	for _, m := range r.modules {
		out = append(out, m.ID())
	}
	return out
}

// StartedIDs 返回已成功启动的模块 ID（readiness 用）。
func (r *Registry) StartedIDs() []string {
	out := make([]string, 0, len(r.started))
	for _, m := range r.started {
		out = append(out, m.ID())
	}
	return out
}

// Ready 表示全部注册模块已启动。
func (r *Registry) Ready() bool {
	return len(r.modules) > 0 && len(r.started) == len(r.modules)
}

// Validate 校验依赖存在且无环。
func (r *Registry) Validate() error {
	_, err := r.ordered()
	return err
}

// Migrate 按依赖顺序执行各模块迁移（各自命名空间）。
func (r *Registry) Migrate(ctx context.Context, db *sqlite.DB) error {
	if db == nil {
		return errors.New("Migrate 需要数据库")
	}
	ordered, err := r.ordered()
	if err != nil {
		return err
	}
	for _, m := range ordered {
		if err := db.Migrate(ctx, strings.TrimSpace(m.ID()), m.Migrations()); err != nil {
			return err
		}
	}
	return nil
}

// RegisterRoutes 按依赖顺序调用各模块的 Register。
func (r *Registry) RegisterRoutes(mux *http.ServeMux) {
	if mux == nil {
		return
	}
	ordered, err := r.ordered()
	if err != nil {
		// 路由阶段依赖错误属于启动配置错误；调用方应在之前 Validate。
		panic(fmt.Sprintf("模块注册表非法: %v", err))
	}
	for _, m := range ordered {
		m.Register(mux)
	}
}

// Start 按依赖顺序启动模块；失败时回滚已启动的模块。
func (r *Registry) Start(ctx context.Context) error {
	ordered, err := r.ordered()
	if err != nil {
		return err
	}
	r.started = r.started[:0]
	for _, m := range ordered {
		if err := m.Start(ctx); err != nil {
			r.stopStarted(context.WithoutCancel(ctx))
			return fmt.Errorf("启动模块 %s 失败: %w", m.ID(), err)
		}
		r.started = append(r.started, m)
	}
	return nil
}

// Stop 反向停止已启动模块；可重复调用。
func (r *Registry) Stop(ctx context.Context) error {
	return r.stopStarted(ctx)
}

func (r *Registry) stopStarted(ctx context.Context) error {
	var errs []error
	for i := len(r.started) - 1; i >= 0; i-- {
		if err := r.started[i].Stop(ctx); err != nil {
			errs = append(errs, fmt.Errorf("停止模块 %s 失败: %w", r.started[i].ID(), err))
		}
	}
	r.started = nil
	return errors.Join(errs...)
}

// ordered 返回依赖拓扑序（稳定：按注册顺序做 DFS）。
func (r *Registry) ordered() ([]Module, error) {
	const (
		white = iota
		gray
		black
	)
	state := make(map[string]int, len(r.byID))
	out := make([]Module, 0, len(r.byID))

	var visit func(id string) error
	visit = func(id string) error {
		id = strings.TrimSpace(id)
		if id == "" {
			return errors.New("依赖模块 ID 不能为空")
		}
		switch state[id] {
		case black:
			return nil
		case gray:
			return fmt.Errorf("模块依赖存在环：%s", id)
		}
		m, ok := r.byID[id]
		if !ok {
			return fmt.Errorf("模块 %q 未注册（被依赖）", id)
		}
		state[id] = gray
		for _, dep := range m.DependsOn() {
			dep = strings.TrimSpace(dep)
			if dep == "" {
				continue
			}
			if dep == id {
				return fmt.Errorf("模块 %s 不能依赖自己", id)
			}
			if err := visit(dep); err != nil {
				return err
			}
		}
		state[id] = black
		out = append(out, m)
		return nil
	}

	for _, m := range r.modules {
		if err := visit(m.ID()); err != nil {
			return nil, err
		}
	}
	return out, nil
}
