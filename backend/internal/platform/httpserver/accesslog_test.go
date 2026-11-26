package httpserver

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func newTestLogger(buf *bytes.Buffer) *slog.Logger {
	return slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelInfo}))
}

func TestAccessLogRecordsRequestLine(t *testing.T) {
	var buf bytes.Buffer
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/sessions/{id}/tasks", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	h := NewHandlerWithOptions(mux, nil, Options{AccessLog: true, Logger: newTestLogger(&buf)})
	req := httptest.NewRequest(http.MethodGet, "/api/sessions/sess-42/tasks?limit=20&status=failed&token=secret", nil)
	h.ServeHTTP(httptest.NewRecorder(), req)

	line := buf.String()
	for _, want := range []string{
		"msg=http_access",
		"method=GET",
		"path=/api/sessions/sess-42/tasks",
		"query=\"status=failed&limit=20\"",
		"status=503",
		"session_id=sess-42",
		"duration_ms=",
	} {
		if !strings.Contains(line, want) {
			t.Fatalf("访问日志缺少 %q，实际：%s", want, line)
		}
	}
	if strings.Contains(line, "token=secret") || strings.Contains(line, "secret") {
		t.Fatalf("访问日志泄露了查询串：%s", line)
	}
	if strings.Contains(line, "X-Session-Id") {
		t.Fatalf("访问日志记录了大量请求头：%s", line)
	}
}

func TestAccessLogDefaultsStatusOKAndReadsHeaderSession(t *testing.T) {
	var buf bytes.Buffer
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/chat", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	h := NewHandlerWithOptions(mux, nil, Options{AccessLog: true, Logger: newTestLogger(&buf)})
	req := httptest.NewRequest(http.MethodPost, "/api/chat", strings.NewReader("{}"))
	req.Header.Set("X-Session-Id", "hdr-7")
	h.ServeHTTP(httptest.NewRecorder(), req)

	line := buf.String()
	for _, want := range []string{"msg=http_access", "method=POST", "status=200", "session_id=hdr-7"} {
		if !strings.Contains(line, want) {
			t.Fatalf("访问日志缺少 %q，实际：%s", want, line)
		}
	}
}

func TestAccessLogDisabledEmitsNothing(t *testing.T) {
	var buf bytes.Buffer
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/ping", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	h := NewHandlerWithOptions(mux, nil, Options{AccessLog: false, Logger: newTestLogger(&buf)})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/ping", nil))

	if buf.Len() != 0 {
		t.Fatalf("关闭访问日志后仍写了日志：%s", buf.String())
	}
	if rec.Code != http.StatusNoContent {
		t.Fatalf("关闭访问日志不影响业务响应，期望 204，实际 %d", rec.Code)
	}
}

func TestAccessLogSkipsWebSocketUpgrade(t *testing.T) {
	var buf bytes.Buffer
	var got http.ResponseWriter
	mux := http.NewServeMux()
	mux.HandleFunc("/api/ws", func(w http.ResponseWriter, r *http.Request) {
		got = w
		w.WriteHeader(http.StatusSwitchingProtocols)
	})
	h := NewHandlerWithOptions(mux, nil, Options{AccessLog: true, Logger: newTestLogger(&buf)})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/ws", nil))

	if got != http.ResponseWriter(rec) {
		t.Fatalf("WebSocket 路径不应被访问日志包装")
	}
	if buf.Len() != 0 {
		t.Fatalf("WebSocket 升级不应写访问日志：%s", buf.String())
	}
	if rec.Code != http.StatusSwitchingProtocols {
		t.Fatalf("WebSocket 响应应透传，期望 101，实际 %d", rec.Code)
	}
}
