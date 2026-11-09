package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"agentd/internal/platform/config"
)

func runPythonApproved(t *testing.T, tsURL, prompt string) string {
	t.Helper()
	if status, body := postChat(t, tsURL, prompt); status != 202 {
		t.Fatalf("chat = %d %s", status, body)
	}
	approvalID := waitPendingApproval(t, tsURL)
	return string(allowApproval(t, tsURL, approvalID))
}

func TestM17RunPythonEchoAndFile(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	result := runPythonApproved(t, ts.URL, "mock:run-python code=print('python-ok')")
	if !strings.Contains(result, "python-ok") || !strings.Contains(result, "[exit code: 0]") {
		t.Fatalf("echo 结果 = %s", result)
	}
	result = runPythonApproved(t, ts.URL, "mock:python-file")
	if !strings.Contains(result, "written") {
		t.Fatalf("文件读写结果 = %s", result)
	}
	if data, err := os.ReadFile(filepath.Join(a.sandbox.Workspace, "python-written.txt")); err != nil || strings.TrimSpace(string(data)) != "hello" {
		t.Fatalf("python 写入文件 = %q err=%v", data, err)
	}
}

func TestM17RunPythonPathAndOutside(t *testing.T) {
	a, ts := newM2App(t, nil, nil)
	script := filepath.Join(a.sandbox.Workspace, "args-script.py")
	if err := os.WriteFile(script, []byte("import sys\nprint('args:' + ','.join(sys.argv[1:]))\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if status, _ := postChat(t, ts.URL, "mock:run-python path=args-script.py"); status != 202 {
		t.Fatalf("path chat = %d", status)
	}
	approvalID := waitPendingApproval(t, ts.URL)
	result := string(allowApproval(t, ts.URL, approvalID))
	if !strings.Contains(result, "[exit code: 0]") {
		t.Fatalf("path 结果 = %s", result)
	}
	result = runPythonApproved(t, ts.URL, "mock:python-outside")
	if !strings.Contains(result, "path_denied") && !strings.Contains(result, "sandbox_denied") {
		t.Fatalf("越界未被拒绝: %s", result)
	}
}

func TestM17RunPythonTimeoutSpillEnv(t *testing.T) {
	_, ts := newM2App(t, nil, nil)
	result := runPythonApproved(t, ts.URL, "mock:python-sleep")
	if !strings.Contains(result, "TIMEOUT") && !strings.Contains(result, "timed out") {
		t.Fatalf("超时结果 = %s", result)
	}
	result = runPythonApproved(t, ts.URL, "mock:python-big")
	if !strings.Contains(result, "Omitted") && !strings.Contains(result, "spill") {
		t.Fatalf("spill 结果 = %s", result)
	}
	result = runPythonApproved(t, ts.URL, "mock:python-env")
	if strings.Contains(result, "sk-") || strings.Contains(result, "DEEPSEEK_API_KEY") {
		t.Fatalf("env 泄漏 key: %s", result)
	}
	if !strings.Contains(result, "ENV_START") || !strings.Contains(result, "AGENTD_HOME") {
		t.Fatalf("env 结果 = %s", result)
	}
}

func TestM17RunPythonMissing(t *testing.T) {
	_, ts := newM2App(t, nil, func(cfg *config.Config) {
		cfg.Tools.Python = filepath.Join(t.TempDir(), "no-python.exe")
	})
	result := runPythonApproved(t, ts.URL, "mock:run-python code=print(1)")
	if !strings.Contains(result, "python_missing") {
		t.Fatalf("缺 Python 结果 = %s", result)
	}
}
