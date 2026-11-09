// Package config 负责 agentd 的启动配置、AGENTD_HOME 数据根与模型配置。
//
// 优先级（docs/tech-stack.md §2.5）：命令行 flag > 环境变量 > config.local.json > 默认值。
// 所有持久化路径都从 AGENTD_HOME 推导，代码里不出现宿主绝对路径：
//
//	AGENTD_HOME/
//	├── agentd.db          （可用 -db 显式覆盖，主要给测试/评测）
//	├── artifacts/         （产物）
//	├── workspace/         （工具执行沙盒）
//	├── logs/
//	└── config.local.json  （可选；项目目录下的 config.local.json 也会被读取）
package config

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	DefaultAddr = "127.0.0.1:8787"

	ModelMock = "mock"
	ModelReal = "real"

	DefaultProvider      = "deepseek"
	DefaultBaseURL       = "https://api.deepseek.com"
	DefaultLLMModel      = "deepseek-flash"
	DefaultMaxOutput     = 1024
	DefaultReasoningHigh = "high"
)

var DefaultModules = []string{"sessions", "chat", "tasks", "memory"}

// LLMConfig 是 provider 配置；APIKey 只从配置/环境变量读取，绝不写日志。
type LLMConfig struct {
	Provider         string            `json:"provider"`
	BaseURL          string            `json:"baseURL"`
	APIKey           string            `json:"apiKey,omitempty"`
	Model            string            `json:"model"`
	ReasoningDefault string            `json:"reasoningDefault"`
	ReasoningByRole  map[string]string `json:"reasoningByRole"`
	MaxOutputTokens  int               `json:"maxOutputTokens"`
}

// ToolsConfig 是可选外部工具路径（M12）；空值由运行时探测。
type ToolsConfig struct {
	Chrome  string `json:"chrome,omitempty"`
	Python  string `json:"python,omitempty"`
	Scripts string `json:"scripts,omitempty"`
}

// Config 是 serve 的完整配置。
type Config struct {
	Home         string
	DBPath       string
	ArtifactsDir string
	WorkspaceDir string
	LogsDir      string
	ConfigPath   string // AGENTD_HOME/config.local.json

	Addr      string
	ModelMode string
	Modules   map[string]bool
	LLM       LLMConfig
	Tools     ToolsConfig
	// Debug 默认关闭；仅打开只读 debug 端点（本机排障用）。
	Debug bool
}

// HomeDir 返回 AGENTD_HOME（环境变量优先，默认 %USERPROFILE%\.agentd）。
func HomeDir() (string, error) {
	if raw := strings.TrimSpace(os.Getenv("AGENTD_HOME")); raw != "" {
		abs, err := filepath.Abs(raw)
		if err != nil {
			return "", fmt.Errorf("解析 AGENTD_HOME 失败: %w", err)
		}
		return abs, nil
	}
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "", fmt.Errorf("无法定位用户目录（可设置 AGENTD_HOME 覆盖）: %w", err)
	}
	return filepath.Join(home, ".agentd"), nil
}

func defaultLLM() LLMConfig {
	return LLMConfig{
		Provider:         DefaultProvider,
		BaseURL:          DefaultBaseURL,
		Model:            DefaultLLMModel,
		ReasoningDefault: DefaultReasoningHigh,
		ReasoningByRole: map[string]string{
			"secretary":  "low",
			"expert":     "high",
			"reviewer":   "high",
			"summarizer": "low",
		},
		MaxOutputTokens: DefaultMaxOutput,
	}
}

func defaultForHome(home string) Config {
	modules := make(map[string]bool, len(DefaultModules))
	for _, id := range DefaultModules {
		modules[id] = true
	}
	return Config{
		Home:         home,
		DBPath:       filepath.Join(home, "agentd.db"),
		ArtifactsDir: filepath.Join(home, "artifacts"),
		WorkspaceDir: filepath.Join(home, "workspace"),
		LogsDir:      filepath.Join(home, "logs"),
		ConfigPath:   filepath.Join(home, "config.local.json"),
		Addr:         DefaultAddr,
		ModelMode:    ModelReal,
		Modules:      modules,
		LLM:          defaultLLM(),
	}
}

// Default 返回基于当前 AGENTD_HOME 的默认配置（不读文件/env 覆盖；测试/工具用）。
func Default() Config {
	home, err := HomeDir()
	if err != nil {
		home = filepath.Join(".agentd")
	}
	return defaultForHome(home)
}

// fileConfig 同时兼容 M1 的 addr/model/modules 与 M2 的 provider/LLM 配置。
type fileConfig struct {
	Addr      string          `json:"addr"`
	Model     string          `json:"model"`
	ModelMode string          `json:"modelMode,omitempty"`
	Modules   map[string]bool `json:"modules"`

	Provider        string      `json:"provider"`
	BaseURL         string      `json:"baseURL"`
	APIKey          string      `json:"apiKey"`
	MaxOutputTokens int         `json:"maxOutputTokens"`
	LLM             string      `json:"llm"` // mock | deepseek（确定性测试/真模型切换）
	Tools           ToolsConfig `json:"tools"`
	Debug           bool        `json:"debug"`
	Reasoning       struct {
		Default string            `json:"default"`
		ByRole  map[string]string `json:"byRole"`
	} `json:"reasoning"`
}

// Parse 加载配置：默认值 → config.local.json（多个候选）→ 环境变量 → flag；并创建数据目录。
func Parse(args []string) (Config, error) {
	home, err := HomeDir()
	if err != nil {
		return Config{}, err
	}
	cfg := defaultForHome(home)

	// 1) 本地配置文件（AGENTD_HOME、当前目录、可执行文件目录、AGENTD_CONFIG 显式指定）。
	for _, path := range configCandidates(cfg.ConfigPath) {
		data, err := os.ReadFile(path)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				continue
			}
			return Config{}, fmt.Errorf("读取 %s 失败: %w", path, err)
		}
		var fc fileConfig
		if err := json.Unmarshal(data, &fc); err != nil {
			return Config{}, fmt.Errorf("解析 %s 失败: %w", path, err)
		}
		applyFileConfig(&cfg, fc)
	}

	// 2) 环境变量覆盖
	applyEnv(&cfg)

	// 3) 命令行 flag（最高优先级）
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	dbFlag := cfg.DBPath
	llmModelFlag := cfg.LLM.Model
	var enableFlag, disableFlag string
	fs.StringVar(&cfg.Addr, "addr", cfg.Addr, "监听地址")
	fs.StringVar(&dbFlag, "db", cfg.DBPath, "SQLite 路径（默认 <AGENTD_HOME>/agentd.db）")
	fs.StringVar(&cfg.ModelMode, "model", cfg.ModelMode, "模型模式：mock | real")
	fs.StringVar(&llmModelFlag, "llm-model", cfg.LLM.Model, "LLM 模型名（默认 deepseek-flash）")
	fs.BoolVar(&cfg.Debug, "debug", cfg.Debug, "打开只读 debug 端点（仅本机，默认关闭）")
	fs.StringVar(&enableFlag, "enable-modules", "", "启用的模块（逗号分隔；覆盖其他来源）")
	fs.StringVar(&disableFlag, "disable-modules", "", "禁用的模块（逗号分隔）")
	if err := fs.Parse(args); err != nil {
		return Config{}, fmt.Errorf("参数错误: %w", err)
	}
	cfg.LLM.Model = strings.TrimSpace(llmModelFlag)

	if strings.TrimSpace(cfg.Addr) == "" {
		return Config{}, errors.New("addr 不能为空（示例 127.0.0.1:8787）")
	}
	_, addrPort, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return Config{}, fmt.Errorf("addr 格式非法 %q（应为 host:port，例如 127.0.0.1:8787）: %w", cfg.Addr, err)
	}
	if port, err := strconv.Atoi(addrPort); err != nil || port < 0 || port > 65535 {
		return Config{}, fmt.Errorf("addr 端口非法 %q（应为 0-65535）", addrPort)
	}
	if strings.TrimSpace(dbFlag) == "" {
		dbFlag = filepath.Join(home, "agentd.db")
	} else if !filepath.IsAbs(dbFlag) {
		dbFlag = filepath.Join(home, dbFlag)
	}
	cfg.DBPath = filepath.Clean(dbFlag)

	if enableFlag != "" {
		cfg.Modules = enabledSet(splitList(enableFlag))
	}
	for _, id := range splitList(disableFlag) {
		cfg.Modules[id] = false
	}

	cfg.ModelMode = strings.ToLower(strings.TrimSpace(cfg.ModelMode))
	if cfg.ModelMode != ModelMock && cfg.ModelMode != ModelReal {
		return Config{}, fmt.Errorf("model 只支持 %q 或 %q", ModelMock, ModelReal)
	}
	if cfg.ModelMode == ModelReal && strings.TrimSpace(cfg.LLM.APIKey) == "" {
		return Config{}, errors.New("real 模式需要 API key（config.local.json 的 apiKey 或 DEEPSEEK_API_KEY）")
	}

	// 4) 目录在启动前就绪，并做可写 preflight（AGENTD_HOME 只读时清晰失败）。
	for _, dir := range []string{cfg.Home, cfg.ArtifactsDir, cfg.WorkspaceDir, cfg.LogsDir, filepath.Join(cfg.Home, "tmp"), filepath.Dir(cfg.DBPath)} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Config{}, fmt.Errorf("创建目录 %s 失败: %w", dir, err)
		}
		if err := ensureWritable(dir); err != nil {
			return Config{}, fmt.Errorf("AGENTD_HOME 不可写（%s）: %w", dir, err)
		}
	}
	return cfg, nil
}

func ensureWritable(dir string) error {
	file, err := os.CreateTemp(dir, ".agentd-write-probe-*")
	if err != nil {
		return err
	}
	name := file.Name()
	if _, err := file.WriteString("ok"); err != nil {
		_ = file.Close()
		_ = os.Remove(name)
		return err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	return os.Remove(name)
}

func configCandidates(homeConfig string) []string {
	seen := make(map[string]bool)
	out := make([]string, 0, 4)
	add := func(path string) {
		path = strings.TrimSpace(path)
		if path == "" {
			return
		}
		abs, err := filepath.Abs(path)
		if err != nil {
			return
		}
		if !seen[abs] {
			seen[abs] = true
			out = append(out, abs)
		}
	}
	add(homeConfig)
	if wd, err := os.Getwd(); err == nil {
		add(filepath.Join(wd, "config.local.json"))
	}
	if exe, err := os.Executable(); err == nil {
		add(filepath.Join(filepath.Dir(exe), "config.local.json"))
	}
	if explicit := os.Getenv("AGENTD_CONFIG"); explicit != "" {
		add(explicit)
	}
	return out
}

func applyFileConfig(cfg *Config, fc fileConfig) {
	if strings.TrimSpace(fc.Addr) != "" {
		cfg.Addr = strings.TrimSpace(fc.Addr)
	}
	if strings.TrimSpace(fc.ModelMode) != "" {
		cfg.ModelMode = strings.TrimSpace(fc.ModelMode)
	}
	if model := strings.TrimSpace(fc.Model); model != "" {
		switch strings.ToLower(model) {
		case ModelMock, ModelReal:
			cfg.ModelMode = strings.ToLower(model)
		default:
			cfg.LLM.Model = model
		}
	}
	for id, enabled := range fc.Modules {
		cfg.Modules[strings.TrimSpace(id)] = enabled
	}
	if strings.TrimSpace(fc.Provider) != "" {
		cfg.LLM.Provider = strings.TrimSpace(fc.Provider)
	}
	if fc.Debug {
		cfg.Debug = true
	}
	if llm := strings.ToLower(strings.TrimSpace(fc.LLM)); llm != "" {
		switch llm {
		case "mock":
			cfg.ModelMode = ModelMock
		case "real", "deepseek":
			cfg.ModelMode = ModelReal
		}
	}
	if strings.TrimSpace(fc.BaseURL) != "" {
		cfg.LLM.BaseURL = strings.TrimSpace(fc.BaseURL)
	}
	if strings.TrimSpace(fc.APIKey) != "" {
		cfg.LLM.APIKey = strings.TrimSpace(fc.APIKey)
	}
	if strings.TrimSpace(fc.Reasoning.Default) != "" {
		cfg.LLM.ReasoningDefault = strings.TrimSpace(fc.Reasoning.Default)
	}
	for role, effort := range fc.Reasoning.ByRole {
		cfg.LLM.ReasoningByRole[strings.TrimSpace(role)] = strings.TrimSpace(effort)
	}
	if fc.MaxOutputTokens > 0 {
		cfg.LLM.MaxOutputTokens = fc.MaxOutputTokens
	}
	if strings.TrimSpace(fc.Tools.Chrome) != "" {
		cfg.Tools.Chrome = strings.TrimSpace(fc.Tools.Chrome)
	}
	if strings.TrimSpace(fc.Tools.Python) != "" {
		cfg.Tools.Python = strings.TrimSpace(fc.Tools.Python)
	}
	if strings.TrimSpace(fc.Tools.Scripts) != "" {
		cfg.Tools.Scripts = strings.TrimSpace(fc.Tools.Scripts)
	}
}

func applyEnv(cfg *Config) {
	if v := strings.TrimSpace(os.Getenv("AGENTD_ADDR")); v != "" {
		cfg.Addr = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_MODEL")); v != "" {
		cfg.ModelMode = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_LLM_MODEL")); v != "" {
		cfg.LLM.Model = v
	}
	// AGENTD_LLM=mock 强制确定性 mock（评测/离线）；deepseek/real 走真模型。
	switch strings.ToLower(strings.TrimSpace(os.Getenv("AGENTD_LLM"))) {
	case "mock":
		cfg.ModelMode = ModelMock
	case "real", "deepseek":
		cfg.ModelMode = ModelReal
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_DEBUG")); v != "" {
		cfg.Debug = v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_PROVIDER")); v != "" {
		cfg.LLM.Provider = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_BASE_URL")); v != "" {
		cfg.LLM.BaseURL = v
	} else if v := strings.TrimSpace(os.Getenv("DEEPSEEK_BASE_URL")); v != "" {
		cfg.LLM.BaseURL = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_API_KEY")); v != "" {
		cfg.LLM.APIKey = v
	} else if v := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")); v != "" {
		cfg.LLM.APIKey = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_MAX_OUTPUT_TOKENS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			cfg.LLM.MaxOutputTokens = n
		}
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_CHROME")); v != "" {
		cfg.Tools.Chrome = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_PYTHON")); v != "" {
		cfg.Tools.Python = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_SCRIPTS")); v != "" {
		cfg.Tools.Scripts = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_REASONING_DEFAULT")); v != "" {
		cfg.LLM.ReasoningDefault = v
	}
	if v := strings.TrimSpace(os.Getenv("AGENTD_MODULES")); v != "" {
		cfg.Modules = enabledSet(splitList(v))
	}
	for _, id := range splitList(os.Getenv("AGENTD_DISABLE_MODULES")) {
		cfg.Modules[id] = false
	}
}

func enabledSet(ids []string) map[string]bool {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out
}

func splitList(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		id := strings.TrimSpace(part)
		if id != "" {
			out = append(out, id)
		}
	}
	return out
}
