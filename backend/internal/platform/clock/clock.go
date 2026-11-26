// Package clock 是后端进程内唯一的时间源。
//
// 所有“是否到期、是否超时”的判断都从 clock.Now() 取时间；生产构建由
// systemClock 直接返回 time.Now()，测试构建（-tags testclock）可以把时间
// 按比例加速，用来在几秒内覆盖半小时窗口。业务代码不感知构建标签。
package clock

import "time"

// Clock 是时间源接口，测试构建可以替换实现。
type Clock interface {
	Now() time.Time
}

// source 在进程启动时由构建标签决定；生产二进制只会是 systemClock。
var source Clock = systemClock{}

// Now 返回当前时间。
func Now() time.Time {
	return source.Now()
}

// NowUnixMilli 返回当前时间的毫秒时间戳。
func NowUnixMilli() int64 {
	return source.Now().UnixMilli()
}

// systemClock 是生产路径的时间源，直接读系统时钟；测试构建会把 source 换掉。
type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now()
}
