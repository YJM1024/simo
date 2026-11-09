//go:build !windows

package sqlite

import (
	"errors"
	"syscall"
)

// processAlive 在 Unix 上通过 signal 0 判断 pid 是否仍存活。
// 仅用于回收崩溃进程留下的 stale lock；不是安全边界。
func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}
