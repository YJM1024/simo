package tasks

import (
	"context"
	"errors"
	"strings"
	"testing"

	coretask "simo/internal/core/task"
)

// TestFailureReasonClassifies 校验失败原因能按三类区分，并带出工具名与错误码。
func TestFailureReasonClassifies(t *testing.T) {
	denied := failureReason(coretask.ExecutionResult{
		Permissions: []coretask.PermissionDenied{
			{Tool: "read", Path: `C:\Windows\win.ini`, Reason: "路径越出工作区"},
		},
	}, errors.New("模型请求失败"))
	if !strings.HasPrefix(denied, "工具拒绝: permission_denied") {
		t.Fatalf("工具拒绝前缀不对: %q", denied)
	}
	if !strings.Contains(denied, "tool=read") || !strings.Contains(denied, `path=C:\Windows\win.ini`) || !strings.Contains(denied, "路径越出工作区") {
		t.Fatalf("工具拒绝缺少工具名/路径/原因: %q", denied)
	}

	timedOut := failureReason(coretask.ExecutionResult{}, context.DeadlineExceeded)
	if !strings.HasPrefix(timedOut, "步骤超时:") {
		t.Fatalf("步骤超时前缀不对: %q", timedOut)
	}

	broken := failureReason(coretask.ExecutionResult{}, errors.New("模型上游 500"))
	if !strings.HasPrefix(broken, "执行器异常:") || !strings.Contains(broken, "模型上游 500") {
		t.Fatalf("执行器异常内容不对: %q", broken)
	}
}

// TestTruncateFailReason 校验失败原因按字符截到 500 字。
func TestTruncateFailReason(t *testing.T) {
	long := "执行器异常: " + strings.Repeat("错", 800)
	got := truncateFailReason(long)
	if len([]rune(got)) != 500 {
		t.Fatalf("截断后长度 = %d，期望 500", len([]rune(got)))
	}
}
