//go:build !windows

package chat

import "os/exec"

// hideWindow 在非 Windows 平台无操作，保持调用方写法统一。
func hideWindow(cmd *exec.Cmd) {}
