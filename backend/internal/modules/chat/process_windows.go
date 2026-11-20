//go:build windows

package chat

import (
	"os/exec"
	"syscall"
)

// hideWindow 让子进程不弹命令行黑框，并避免 conhost 继承 stdout 管道导致 Wait 阻塞。
// 仅影响本机桌面体验；服务端/CI 同样适用。
func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= 0x08000000 // CREATE_NO_WINDOW
}
