// Package log 提供进程级结构化日志。
//
// M1 只依赖标准库 log/slog：默认输出到 stderr，级别 info。
// 测试用 Discard() 避免噪音；将来接 OpenTelemetry 时只改这里。
package log

import (
	"io"
	"log/slog"
	"os"
	"strings"
)

// New 创建文本日志器；level 支持 debug/info/warn/error（大小写不敏感）。
func New(level string) *slog.Logger {
	var lv slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		lv = slog.LevelDebug
	case "warn", "warning":
		lv = slog.LevelWarn
	case "error":
		lv = slog.LevelError
	default:
		lv = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lv}))
}

// Discard 返回不输出任何内容的日志器（测试/评测用）。
func Discard() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}
