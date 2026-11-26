//go:build testclock

package clock

import (
	"testing"
	"time"
)

// 加速时钟按 rate 放大真实经过时间，offset 直接前移起点。
func TestAcceleratedClockRateAndOffset(t *testing.T) {
	start := time.Now()
	c := &acceleratedClock{startReal: start, rate: 100, offset: 30 * time.Minute}
	first := c.Now()
	if got, want := first.Sub(start), 30*time.Minute; got < want || got > want+time.Minute {
		t.Fatalf("启动时间偏移不对：got %v want %v", got, want)
	}
	// 真实睡眠 20ms，模拟时间约前进 2s。
	realStart := time.Now()
	time.Sleep(20 * time.Millisecond)
	second := c.Now()
	advanced := second.Sub(first)
	if advanced < 1500*time.Millisecond {
		t.Fatalf("模拟时间前进过慢：%v（真实 %v）", advanced, time.Since(realStart))
	}
}
