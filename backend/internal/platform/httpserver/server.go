// Package httpserver 是平台层 HTTP 基础设施：路由兜底、JSON、WebSocket 封装、静态资源。
//
// 它不知道业务；模块通过 core/module 的 Register(mux) 自挂路由。
// 关键契约（docs/m1-contract.md §3）：
//   - /api/* 未命中必须返回 404 JSON，绝不能落到 SPA fallback；
//   - GET /api/health 是平台级探针，不依赖任何业务模块；
//   - WebSocket 帧名严格按契约，事件 id 使用事件日志的单调序号。
package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

// HealthReport 是 readiness 探针结果；业务 app 注入 DB/模块状态。
type HealthReport struct {
	Ready   bool     `json:"ready"`
	DB      string   `json:"db,omitempty"`
	Modules []string `json:"modules,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// MaxRequestBodyBytes 是所有 HTTP 请求体的兜底上限（模块可设更小值）。
const MaxRequestBodyBytes int64 = 1 << 20

// RequestTimeout 是普通 HTTP 请求的兜底处理超时；WS 不受此限制。
const RequestTimeout = 30 * time.Second

// HealthFunc 由 composition root 注入；nil 时使用静态 healthy。
type HealthFunc func(context.Context) HealthReport

// NewHandler 把模块路由、健康检查、/api/* 兜底和 SPA 静态资源装成一个 Handler。
//
// 调用方应先把所有模块的 Register(mux) 执行完，再调用本函数。
func NewHandler(mux *http.ServeMux, dist fs.FS, health ...HealthFunc) http.Handler {
	if mux == nil {
		mux = http.NewServeMux()
	}
	var healthFn HealthFunc
	if len(health) > 0 {
		healthFn = health[0]
	}
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		handleHealth(w, r, healthFn)
	})
	// 注意：ServeMux 中更具体的 pattern 优先；这里兜住所有未注册的 /api/*，
	// 避免被 "/" 的 SPA fallback 返回 index.html（evals 发现的契约偏差）。
	mux.HandleFunc("/api/", handleAPINotFound)
	mux.Handle("/", newSPAHandler(dist))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				WriteErrorCode(w, http.StatusInternalServerError, "internal", "服务内部错误")
			}
		}()
		if r.URL.Path != "/api/ws" {
			isUpload := strings.HasPrefix(r.URL.Path, "/api/uploads")
			if !isUpload && r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
				r.Body = http.MaxBytesReader(w, r.Body, MaxRequestBodyBytes)
			}
			timeout := RequestTimeout
			if isUpload {
				// 上传端点由 handler 自己限制单文件/总请求体；给 20MiB 留足时间。
				timeout = 120 * time.Second
			}
			ctx, cancel := context.WithTimeout(r.Context(), timeout)
			defer cancel()
			r = r.WithContext(ctx)
		}
		mux.ServeHTTP(w, r)
	})
}

type healthPayload struct {
	OK     bool          `json:"ok"`
	Ready  bool          `json:"ready"`
	Time   int64         `json:"time"`
	Checks *healthChecks `json:"checks,omitempty"`
	Error  string        `json:"error,omitempty"`
}

type healthChecks struct {
	DB      string   `json:"db"`
	Modules []string `json:"modules"`
}

func handleHealth(w http.ResponseWriter, r *http.Request, healthFn HealthFunc) {
	report := HealthReport{Ready: true, DB: "ok"}
	if healthFn != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		report = healthFn(ctx)
	}
	payload := healthPayload{
		OK: report.Ready, Ready: report.Ready, Time: time.Now().UnixMilli(),
		Checks: &healthChecks{DB: report.DB, Modules: report.Modules},
		Error:  report.Error,
	}
	status := http.StatusOK
	if !report.Ready {
		status = http.StatusServiceUnavailable
	}
	WriteJSON(w, status, payload)
}

func handleAPINotFound(w http.ResponseWriter, r *http.Request) {
	WriteError(w, http.StatusNotFound, fmt.Sprintf("接口不存在: %s", r.URL.Path))
}

// WriteJSON 输出 JSON 响应。
func WriteJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// WriteError 输出统一的错误 JSON：{"ok":false,"error":"...","code":"..."}。
func WriteError(w http.ResponseWriter, status int, message string) {
	WriteErrorCode(w, status, codeForStatus(status), message)
}

// WriteErrorCode 输出带业务 code 的统一错误信封。
func WriteErrorCode(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
		Code  string `json:"code,omitempty"`
	}{OK: false, Error: message, Code: code})
}

func codeForStatus(status int) string {
	switch status {
	case http.StatusBadRequest:
		return "bad_request"
	case http.StatusForbidden:
		return "forbidden"
	case http.StatusNotFound:
		return "not_found"
	case http.StatusConflict:
		return "conflict"
	case http.StatusRequestEntityTooLarge:
		return "body_too_large"
	case http.StatusUnsupportedMediaType:
		return "unsupported_media_type"
	case http.StatusServiceUnavailable:
		return "unavailable"
	default:
		return "internal"
	}
}

// IsBodyTooLarge 让模块在处理 JSON decode 错误时区分请求体超限。
func IsBodyTooLarge(err error) bool {
	var maxErr *http.MaxBytesError
	return errors.As(err, &maxErr)
}

// ---- SPA fallback ----

type spaHandler struct {
	fsys  fs.FS
	files http.Handler
}

func newSPAHandler(dist fs.FS) http.Handler {
	if dist == nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			WriteError(w, http.StatusServiceUnavailable, "前端资源未构建")
		})
	}
	return spaHandler{fsys: dist, files: http.FileServer(http.FS(dist))}
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.NotFound(w, r)
		return
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" || name == "." {
		name = "index.html"
	}
	if _, err := fs.Stat(h.fsys, name); err == nil {
		h.files.ServeHTTP(w, r)
		return
	}
	data, err := fs.ReadFile(h.fsys, "index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(data)
}
