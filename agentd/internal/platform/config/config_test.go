package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseFromAgentdHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	t.Setenv("AGENTD_LLM", "mock")
	t.Setenv("AGENTD_ADDR", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_MODULES", "")
	t.Setenv("AGENTD_DISABLE_MODULES", "")

	cfg, err := Parse(nil)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Home != filepath.Clean(home) {
		t.Fatalf("Home = %q, want %q", cfg.Home, home)
	}
	if cfg.DBPath != filepath.Join(home, "agentd.db") {
		t.Fatalf("DBPath = %q", cfg.DBPath)
	}
	for _, dir := range []string{cfg.Home, cfg.ArtifactsDir, cfg.WorkspaceDir, cfg.LogsDir} {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			t.Fatalf("目录 %s 未创建", dir)
		}
	}
	if !cfg.Modules["sessions"] || !cfg.Modules["chat"] || !cfg.Modules["tasks"] {
		t.Fatalf("默认模块未全部启用: %#v", cfg.Modules)
	}
}

func TestRealIsDefaultAndMissingKeyFailsClearly(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	t.Setenv("AGENTD_LLM", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	cfg, err := Parse(nil)
	if err == nil || !strings.Contains(err.Error(), "API key") {
		t.Fatalf("默认 real 缺 key 应清晰失败: cfg=%+v err=%v", cfg, err)
	}
}

func TestExplicitMockStillWorks(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	t.Setenv("AGENTD_LLM", "mock")
	t.Setenv("AGENTD_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	cfg, err := Parse(nil)
	if err != nil || cfg.ModelMode != ModelMock {
		t.Fatalf("AGENTD_LLM=mock 应可显式启用: cfg=%+v err=%v", cfg, err)
	}
	if cfg.LLM.MaxOutputTokens != DefaultMaxOutput || DefaultMaxOutput > 1024 {
		t.Fatalf("默认 maxOutputTokens 应低 token: %d", cfg.LLM.MaxOutputTokens)
	}
}

func TestConfigFileEnvFlagPrecedence(t *testing.T) {
	home := t.TempDir()
	t.Setenv("AGENTD_HOME", home)
	if err := os.WriteFile(filepath.Join(home, "config.local.json"), []byte(`{
		"addr": "127.0.0.1:9100",
		"model": "mock",
		"modules": {"tasks": false}
	}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AGENTD_ADDR", "127.0.0.1:9200")
	t.Setenv("AGENTD_MODULES", "sessions,chat")

	cfg, err := Parse([]string{"-addr", "127.0.0.1:9300", "-enable-modules", "sessions,chat,tasks"})
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.Addr != "127.0.0.1:9300" {
		t.Fatalf("flag 应覆盖 env/config，Addr = %q", cfg.Addr)
	}
	if !cfg.Modules["tasks"] {
		t.Fatal("flag enable-modules 应覆盖 env/config")
	}
}

func TestInvalidModelRejected(t *testing.T) {
	t.Setenv("AGENTD_HOME", t.TempDir())
	if _, err := Parse([]string{"-model", "nope"}); err == nil {
		t.Fatal("非法 model 应报错")
	}
}

func TestLLMEnvForcesMockAndDebug(t *testing.T) {
	t.Setenv("AGENTD_HOME", t.TempDir())
	t.Setenv("AGENTD_LLM", "mock")
	t.Setenv("AGENTD_DEBUG", "1")
	cfg, err := Parse(nil)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if cfg.ModelMode != ModelMock || !cfg.Debug {
		t.Fatalf("AGENTD_LLM=mock / AGENTD_DEBUG=1 未生效: mode=%q debug=%v", cfg.ModelMode, cfg.Debug)
	}
}

func TestRealModeRequiresAPIKey(t *testing.T) {
	t.Setenv("AGENTD_HOME", t.TempDir())
	t.Setenv("AGENTD_LLM", "deepseek")
	t.Setenv("AGENTD_API_KEY", "")
	t.Setenv("DEEPSEEK_API_KEY", "")
	if _, err := Parse(nil); err == nil {
		t.Fatal("real 模式缺 API key 应报错")
	}
}

func TestInvalidAddrRejectedWithClearMessage(t *testing.T) {
	t.Setenv("AGENTD_HOME", t.TempDir())
	t.Setenv("AGENTD_ADDR", "")
	if _, err := Parse([]string{"-addr", "not-a-host-port"}); err == nil ||
		!strings.Contains(err.Error(), "addr") {
		t.Fatalf("非法 addr 应清晰报错，得到 %v", err)
	}
}

func TestAgentdHomeMustBeWritableDirectory(t *testing.T) {
	parent := t.TempDir()
	filePath := filepath.Join(parent, "home-is-a-file")
	if err := os.WriteFile(filePath, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AGENTD_HOME", filePath)
	t.Setenv("AGENTD_ADDR", "")
	if _, err := Parse(nil); err == nil {
		t.Fatal("AGENTD_HOME 是文件时 preflight 应失败")
	}
}
