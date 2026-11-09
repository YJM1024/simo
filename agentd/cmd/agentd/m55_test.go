package main

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"agentd/internal/platform/config"
	"agentd/internal/platform/llm"
	platformlog "agentd/internal/platform/log"
)

func TestM55StartupRecoversStaleStreaming(t *testing.T) {
	t.Setenv("AGENTD_HOME", t.TempDir())
	t.Setenv("AGENTD_ADDR", "")
	t.Setenv("AGENTD_MODEL", "")
	t.Setenv("AGENTD_LLM", "mock")
	t.Setenv("AGENTD_DEBUG", "")
	cfg, err := config.Parse(nil)
	if err != nil {
		t.Fatalf("config: %v", err)
	}
	a, err := buildAppWithProvider(context.Background(), cfg, platformlog.Discard(), llm.NewMock())
	if err != nil {
		t.Fatalf("build: %v", err)
	}
	defer func() { _ = a.Stop(context.Background()); _ = a.Close() }()
	if err := a.db.Write(context.Background(), func(tx *sql.Tx) error {
		_, err := tx.ExecContext(context.Background(), `INSERT INTO messages(id,session_id,role,text,at,status,
			task_id,workflow_id,tool,approval_id,category,reply_to_id)
			VALUES ('msg-stale-m55','main','agent','',1,'streaming','','','','','','')`)
		return err
	}); err != nil {
		t.Fatalf("insert stale: %v", err)
	}
	if err := a.registry.Start(context.Background()); err != nil {
		t.Fatalf("start: %v", err)
	}
	ts := httptest.NewServer(a.handler)
	defer ts.Close()
	status, body := httpGet(t, ts.URL+"/api/messages?sessionId=main")
	if status != http.StatusOK {
		t.Fatalf("messages = %d", status)
	}
	if !strings.Contains(string(body), `"status":"failed"`) || !strings.Contains(string(body), "服务重启") {
		t.Fatalf("旧 streaming 未修复: %s", body)
	}
	if !strings.Contains(string(body), `"finishedAt":`) {
		t.Fatalf("完成时间缺失: %s", body)
	}
}

func TestM55StreamingWatchdogTimeout(t *testing.T) {
	t.Setenv("AGENTD_STREAM_IDLE_TIMEOUT_MS", "100")
	provider := llm.NewMockWithScripts(llm.MockScript{
		Deltas: []string{"迟到的回复"}, ChunkDelay: 2 * time.Second,
	})
	_, ts := newM2App(t, provider, func(cfg *config.Config) { cfg.Debug = true })
	if status, _ := postChat(t, ts.URL, "请回复"); status != http.StatusAccepted {
		t.Fatalf("chat = %d", status)
	}
	deadline := time.Now().Add(4 * time.Second)
	for time.Now().Before(deadline) {
		_, body := httpGet(t, ts.URL+"/api/messages?sessionId=main")
		if strings.Contains(string(body), `"status":"failed"`) {
			if !strings.Contains(string(body), "回复超时") {
				t.Fatalf("缺少超时说明: %s", body)
			}
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	_, body := httpGet(t, ts.URL+"/api/messages?sessionId=main")
	t.Fatalf("watchdog 未将 streaming 置为 failed: %s", body)
}
