// simo: 本地 agent 单体服务（Go）。
//
// 形态：单二进制，内嵌 React 前端 + REST API + WebSocket 流式通道；
// 一个常驻实例服务所有会话，持久数据根为 SIMO_HOME（默认 %USERPROFILE%\.simo）。
//
// 用法：
//
//	simo serve                     # 默认 127.0.0.1:8787
//	simo serve -addr :9000         # 换端口
//	simo serve -disable-modules tasks
//	SIMO_HOME=D:\simo-data simo serve
package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"simo/internal/core/eventlog"
	"simo/internal/core/module"
	"simo/internal/core/store"
	coretask "simo/internal/core/task"
	"simo/internal/modules/chat"
	"simo/internal/modules/memory"
	"simo/internal/modules/sessions"
	"simo/internal/modules/tasks"
	"simo/internal/platform/config"
	"simo/internal/platform/httpserver"
	"simo/internal/platform/llm"
	platformlog "simo/internal/platform/log"
	"simo/internal/platform/sqlite"
	"simo/internal/platform/tokenmeter"
	"simo/internal/platform/workspace"
	"simo/internal/webui"
)

func main() {
	logger := platformlog.New("info")
	if len(os.Args) < 2 {
		serve(nil, logger)
		return
	}
	args := os.Args[1:]
	if args[0] == "serve" {
		serve(args[1:], logger)
		return
	}
	if strings.HasPrefix(args[0], "-") {
		serve(args, logger)
		return
	}
	if cliNamespaces[args[0]] {
		os.Exit(runCLI(args))
	}
	switch args[0] {
	case "version":
		fmt.Println("simo m1")
	case "help", "-h", "--help":
		printUsage()
	default:
		if cliHasJSON(args) {
			os.Exit(cliError(2, "ACTION_INVALID_ARGS", "未知子命令: "+args[0]))
		}
		fmt.Fprintf(os.Stderr, "未知子命令 %q\n", args[0])
		printUsage()
		os.Exit(2)
	}
}

func printUsage() {
	_, _ = os.Stderr.WriteString(`用法:
  simo serve [flag...]      # 启动常驻实例
  simo version

serve flags（优先级：flag > env > config.local.json > 默认值）:
  -addr string               监听地址（默认 127.0.0.1:8787；env SIMO_ADDR）
  -db string                 SQLite 路径（默认 <SIMO_HOME>/simo.db；相对路径相对 SIMO_HOME）
  -model string              模型模式 mock|real（默认 real；env SIMO_MODEL/SIMO_LLM）
  -llm-model string          LLM 模型名（默认 deepseek-flash）
  -debug                     打开只读 debug 端点（仅本机，默认关闭）
  -enable-modules string     启用模块（逗号分隔；覆盖其他来源）
  -disable-modules string    禁用模块（逗号分隔；env SIMO_DISABLE_MODULES）

数据根: SIMO_HOME 环境变量（默认 %USERPROFILE%\.simo）
`)
}

type app struct {
	cfg      config.Config
	db       *sqlite.DB
	registry *module.Registry
	handler  http.Handler
	logger   *slog.Logger
	sandbox  *workspace.Policy
}

// buildApp 是启动装配点：打开 DB、迁移、注册模块、挂路由。
// 测试也复用它（cmd/simo 是唯一的 composition root）。
func buildApp(ctx context.Context, cfg config.Config, logger *slog.Logger) (*app, error) {
	provider, err := providerForConfig(cfg)
	if err != nil {
		return nil, err
	}
	return buildAppWithProvider(ctx, cfg, logger, provider)
}

func providerForConfig(cfg config.Config) (llm.Provider, error) {
	switch cfg.ModelMode {
	case config.ModelReal:
		realProvider, err := llm.NewDeepSeek(llm.DeepSeekConfig{
			BaseURL:         cfg.LLM.BaseURL,
			APIKey:          cfg.LLM.APIKey,
			Model:           cfg.LLM.Model,
			MaxOutputTokens: cfg.LLM.MaxOutputTokens,
		})
		if err != nil {
			return nil, fmt.Errorf("初始化 DeepSeek provider 失败: %w", err)
		}
		return realProvider, nil
	default:
		return llm.NewMock(), nil
	}
}

// buildAppWithProvider 允许测试注入脚本化 mock provider（生产走 buildApp）。
func buildAppWithProvider(ctx context.Context, cfg config.Config, logger *slog.Logger, provider llm.Provider) (*app, error) {
	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			_ = db.Close()
		}
	}()

	st := store.New(db)
	events := eventlog.New(st)
	if err := db.Migrate(ctx, "core/eventlog", eventlog.Migrations()); err != nil {
		return nil, fmt.Errorf("核心迁移失败: %w", err)
	}

	sandbox, err := workspace.New(cfg.Home, cfg.WorkspaceDir, cfg.ArtifactsDir)
	if err != nil {
		return nil, err
	}
	meter := tokenmeter.New()

	var tasksMod *tasks.Module
	var taskSvc coretask.Service
	if cfg.Modules["tasks"] {
		tasksMod = tasks.New(st, events, logger, sandbox)
		taskSvc = tasksMod
	}
	var memoryMod *memory.Module
	if cfg.Modules["memory"] {
		memoryMod = memory.New(st, events, logger)
	}

	sessionOpts := sessions.Options{
		Events:    events,
		Tasks:     taskSvc,
		Debug:     cfg.Debug,
		Workspace: sandbox,
	}
	if memoryMod != nil {
		sessionOpts.Memory = memoryMod
	}
	sessionsMod := sessions.New(st, logger, sessionOpts)
	if tasksMod != nil {
		tasksMod.SetSessions(sessionsMod)
	}
	candidates := []module.Module{sessionsMod}
	// chat 在 tasks 之前启动：任务恢复/逐任务汇报需要 chat 的 event consumer 已就绪。
	chatMod := chat.New(
		st, events, provider, taskSvc, meter, sandbox, logger,
		chat.Options{
			ReasoningByRole:  cfg.LLM.ReasoningByRole,
			ReasoningDefault: cfg.LLM.ReasoningDefault,
			MaxOutputTokens:  cfg.LLM.MaxOutputTokens,
			ChromePath:       cfg.Tools.Chrome,
			PythonPath:       cfg.Tools.Python,
			ScriptsDir:       cfg.Tools.Scripts,
			MockMode:         cfg.ModelMode == config.ModelMock,
			Memory:           memoryMod,
			Sessions:         sessionsMod,
			Spec:             sessionsMod,
			Debug:            cfg.Debug,
		},
	)
	candidates = append(candidates, chatMod)
	if tasksMod != nil {
		candidates = append(candidates, tasksMod)
	}
	if memoryMod != nil {
		candidates = append(candidates, memoryMod)
	}
	// M10.1：只有真实模型模式用 LLM 执行器；mock 评测继续走确定性 Mock 执行器。
	if cfg.ModelMode == config.ModelReal && tasksMod != nil {
		tasksMod.SetExecutor(chatMod)
	}
	known := map[string]bool{"sessions": true, "chat": true, "tasks": true, "memory": true}
	ids := []string{"sessions", "chat", "tasks", "memory"}
	for _, m := range candidates {
		known[m.ID()] = true
	}
	for id := range cfg.Modules {
		if !known[id] {
			return nil, fmt.Errorf("未知模块 %q（可用：%s）", id, strings.Join(ids, ", "))
		}
	}

	registry := module.NewRegistry()
	for _, m := range candidates {
		if cfg.Modules[m.ID()] {
			if err := registry.Register(m); err != nil {
				return nil, err
			}
		}
	}
	if err := registry.Validate(); err != nil {
		return nil, fmt.Errorf("模块依赖校验失败: %w", err)
	}
	// 迁移前 schema preflight：打印升级提示；降级由 sqlite.Migrate fail-closed。
	for _, registered := range registry.Modules() {
		migrations := registered.Migrations()
		if len(migrations) == 0 {
			continue
		}
		maxVersion := 0
		for _, migration := range migrations {
			if migration.Version > maxVersion {
				maxVersion = migration.Version
			}
		}
		current, err := db.CurrentVersion(ctx, registered.ID())
		if err != nil {
			return nil, fmt.Errorf("读取 %s schema 版本失败: %w", registered.ID(), err)
		}
		if current > 0 && current < maxVersion {
			logger.Info("schema 将升级（请先备份 SIMO_HOME，拷贝数据根即迁移）",
				"module", registered.ID(), "from", current, "to", maxVersion, "home", cfg.Home)
		}
	}
	if err := registry.Migrate(ctx, db); err != nil {
		return nil, fmt.Errorf("模块迁移失败: %w", err)
	}

	mux := http.NewServeMux()
	registry.RegisterRoutes(mux)

	dist, err := fs.Sub(webui.Dist, "dist")
	if err != nil {
		return nil, fmt.Errorf("内嵌前端资源缺失: %w", err)
	}
	healthFn := func(ctx context.Context) httpserver.HealthReport {
		report := httpserver.HealthReport{Ready: true, DB: "ok", Modules: registry.StartedIDs()}
		if err := db.Ping(ctx); err != nil {
			report.Ready = false
			report.DB = "error"
			report.Error = "数据库不可用: " + err.Error()
			return report
		}
		if !registry.Ready() {
			report.Ready = false
			report.Error = "模块未全部启动"
		}
		return report
	}
	handler := httpserver.NewHandler(mux, dist, healthFn)

	ok = true
	return &app{cfg: cfg, db: db, registry: registry, handler: handler, logger: logger, sandbox: sandbox}, nil
}

func (a *app) Stop(ctx context.Context) error {
	if a == nil || a.registry == nil {
		return nil
	}
	return a.registry.Stop(ctx)
}

func (a *app) Close() error {
	if a == nil {
		return nil
	}
	var errs []error
	if a.registry != nil {
		if err := a.registry.Stop(context.Background()); err != nil {
			errs = append(errs, err)
		}
	}
	if a.db != nil {
		if err := a.db.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func serve(args []string, logger *slog.Logger) {
	cfg, err := config.Parse(args)
	if err != nil {
		logger.Error("配置错误", "err", err)
		printUsage()
		os.Exit(2)
	}

	buildCtx, cancelBuild := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelBuild()
	app, err := buildApp(buildCtx, cfg, logger)
	if err != nil {
		logger.Error("启动失败", "err", err)
		os.Exit(1)
	}
	defer func() { _ = app.Close() }()

	runCtx, cancelRun := context.WithCancel(context.Background())
	defer cancelRun()
	if err := app.registry.Start(runCtx); err != nil {
		logger.Error("模块启动失败", "err", err)
		_ = app.Close()
		os.Exit(1)
	}

	logger.Info("simo starting",
		"addr", cfg.Addr,
		"home", cfg.Home,
		"db", cfg.DBPath,
		"workspace", app.sandbox.Workspace,
		"artifacts", app.sandbox.Artifacts,
		"modules", app.registry.IDs(),
		"modelMode", cfg.ModelMode,
		"llm", cfg.LLM.Model,
		"debug", cfg.Debug,
	)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.handler,
		ReadHeaderTimeout: 5 * time.Second,
		// 不设 Read/WriteTimeout：/api/ws 是长连接；普通 HTTP 由 handler 的
		// RequestTimeout + 请求体上限约束，避免误杀 WebSocket。
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}
	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "url", "http://"+cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	stopCh := make(chan os.Signal, 1)
	signal.Notify(stopCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(stopCh)

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP 服务异常", "err", err)
			_ = app.Stop(context.Background())
			_ = app.Close()
			os.Exit(1)
		}
	case sig := <-stopCh:
		logger.Info("收到退出信号，开始优雅关闭", "signal", sig.String())
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Warn("HTTP 关闭时出错", "err", err)
	}
	if err := app.Stop(shutdownCtx); err != nil {
		logger.Warn("模块关闭时出错", "err", err)
	}
	if err := app.Close(); err != nil {
		logger.Warn("资源关闭时出错", "err", err)
	}
	logger.Info("已退出", "lockReleased", true)
}
