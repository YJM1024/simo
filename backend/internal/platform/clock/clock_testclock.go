//go:build testclock

package clock

import (
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// acceleratedClock 把真实经过的时间乘以 rate 再加固定 offset，得到模拟时间。
// startReal 用 time.Now() 捕获，之后用 time.Since 的单调时钟计算，系统改时间不影响。
type acceleratedClock struct {
	mu        sync.Mutex
	startReal time.Time
	rate      float64
	offset    time.Duration
}

func (c *acceleratedClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	elapsed := time.Since(c.startReal)
	return c.startReal.Add(c.offset).Add(time.Duration(float64(elapsed) * c.rate))
}

// init 只在 -tags testclock 构建里存在；生产二进制没有这段代码。
// SIMO_TEST_CLOCK 形如 "rate=200" 或 "rate=200,offset=1800"：
// rate 是加速倍数（只写 rate 不给值时默认 60），offset 是启动时先拨快的秒数。
func init() {
	raw := strings.TrimSpace(os.Getenv("SIMO_TEST_CLOCK"))
	if raw == "" {
		return
	}
	rate := 60.0
	var offset time.Duration
	for _, part := range strings.Split(raw, ",") {
		key, value, ok := strings.Cut(strings.TrimSpace(part), "=")
		if !ok {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "rate":
			if f, err := strconv.ParseFloat(strings.TrimSpace(value), 64); err == nil && f > 0 {
				rate = f
			}
		case "offset":
			if secs, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64); err == nil {
				offset = time.Duration(secs) * time.Second
			}
		}
	}
	source = &acceleratedClock{startReal: time.Now(), rate: rate, offset: offset}
}
