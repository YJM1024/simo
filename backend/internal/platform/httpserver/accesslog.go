package httpserver

import (
	"bufio"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"
)

// Options 控制平台层 HTTP 基础设施的可选行为。
type Options struct {
	// AccessLog 为 true 且 Logger 非空时，每个非 WebSocket 请求输出一条
	// info 级访问日志：方法、路径、状态码、耗时、会话 id。
	// 正文、请求头与查询串不原样记录：查询串只提取分页与筛选相关的白名单键。
	AccessLog bool
	Logger    *slog.Logger
}

// withAccessLog 把访问日志套在 Handler 最外层，记录 handler 最终写出的状态码。
// WebSocket 不包装：升级依赖 Hijacker，日志也只关心普通 HTTP 请求。
func withAccessLog(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/ws" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		rec := &accessLogWriter{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		status := rec.status
		if status == 0 {
			status = http.StatusOK
		}
		attrs := []any{
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
			"session_id", requestSessionID(r),
		}
		if query := requestQuerySummary(r); query != "" {
			attrs = append(attrs, "query", query)
		}
		logger.Info("http_access", attrs...)
	})
}

// accessLogWriter 记录首次写出的状态码；Unwrap 与 Hijack 保持底层 ResponseWriter 能力。
type accessLogWriter struct {
	http.ResponseWriter
	status int
}

func (w *accessLogWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *accessLogWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.ResponseWriter.Write(p)
}

func (w *accessLogWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *accessLogWriter) Flush() {
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (w *accessLogWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return hijacker.Hijack()
}

// requestQuerySummary 只摘出分页与筛选相关的查询键，值按会话 id 的字符集脱敏并截断。
// 其它查询键（可能是令牌或自由文本）不写进日志。
func requestQuerySummary(r *http.Request) string {
	query := r.URL.Query()
	keys := []string{"status", "mode", "limit", "before", "traceLimit", "batchId"}
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		if value := sanitizeSessionID(query.Get(key)); value != "" {
			parts = append(parts, key+"="+value)
		}
	}
	return strings.Join(parts, "&")
}

// requestSessionID 依次取 X-Session-Id 头、/api/sessions/{id} 路径段、sessionId 查询参数。
// 会话 id 只用于排障定位，脱敏后截断，避免把任意头内容原样写进日志。
func requestSessionID(r *http.Request) string {
	if id := sanitizeSessionID(r.Header.Get("X-Session-Id")); id != "" {
		return id
	}
	const prefix = "/api/sessions/"
	if strings.HasPrefix(r.URL.Path, prefix) {
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		if i := strings.IndexByte(rest, '/'); i >= 0 {
			rest = rest[:i]
		}
		if id := sanitizeSessionID(rest); id != "" {
			return id
		}
	}
	if id := sanitizeSessionID(r.URL.Query().Get("sessionId")); id != "" {
		return id
	}
	return "-"
}

func sanitizeSessionID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var b strings.Builder
	for _, ch := range raw {
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9',
			ch == '-', ch == '_', ch == '.', ch == ':':
			b.WriteRune(ch)
		default:
			b.WriteByte('_')
		}
		if b.Len() >= 64 {
			break
		}
	}
	return b.String()
}
