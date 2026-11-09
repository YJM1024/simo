//go:build windows

package sqlite

import "golang.org/x/sys/windows"

// processAlive 在 Windows 上通过 OpenProcess 判断 pid 是否仍存活。
// 仅用于回收崩溃进程留下的 stale lock；不是安全边界。
func processAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	_ = windows.CloseHandle(handle)
	return true
}
