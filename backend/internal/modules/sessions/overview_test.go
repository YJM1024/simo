package sessions

import (
	"strings"
	"testing"

	corespec "simo/internal/core/spec"
	coretask "simo/internal/core/task"
)

func TestOverviewListAndTimelineBounds(t *testing.T) {
	session := Session{ID: "sess-test", Title: "测试会话", CreatedAt: 1}
	statuses := []string{coretask.StatusDone, coretask.StatusRunning, coretask.StatusPending, coretask.StatusPending}
	tasks := make([]coretask.Task, 0, len(statuses))
	for i, status := range statuses {
		tasks = append(tasks, coretask.Task{
			ID: "task-" + string(rune('a'+i)), Title: "完成项A。\n待办项A；" + string(rune('A'+i)) +
				strings.Repeat("额外说明", 20), Status: status, CreatedAt: int64(i + 1), UpdatedAt: int64(i + 10),
		})
	}
	overview := composeOverview(session, corespec.Spec{Status: corespec.StatusExecuting}, tasks, nil)
	if len(overview.Completed) == 0 || len(overview.Pending) == 0 || len(overview.Timeline) == 0 {
		t.Fatalf("概览列表为空: %+v", overview)
	}
	for _, item := range overview.Completed {
		if len([]rune(item)) > 40 {
			t.Fatalf("completed 超 40 字: %q", item)
		}
	}
	for _, item := range overview.Pending {
		if len([]rune(item)) > 40 {
			t.Fatalf("pending 超 40 字: %q", item)
		}
	}
	for _, item := range overview.Timeline {
		if len([]rune(item.Text)) > 50 {
			t.Fatalf("timeline 超 50 字: %q", item.Text)
		}
	}
	// 一条任务一个事项；标题里的“；/。/换行”不能拆碎。
	if len(overview.Completed) != 1 || len(overview.Pending) != 3 {
		t.Fatalf("任务标题被拆分: completed=%v pending=%v", overview.Completed, overview.Pending)
	}
	for _, item := range overview.Completed {
		if strings.HasPrefix(item, "」") {
			t.Fatalf("出现碎片: %q", item)
		}
	}
}

func TestOverviewCapsAndSummary(t *testing.T) {
	session := Session{ID: "sess-caps", Title: "容量测试", CreatedAt: 1}
	tasks := make([]coretask.Task, 0, 12)
	for i := 0; i < 12; i++ {
		status := coretask.StatusDone
		if i >= 8 {
			status = coretask.StatusPending
		}
		tasks = append(tasks, coretask.Task{ID: "cap-" + string(rune('a'+i)), Title: "任务" + string(rune('A'+i)),
			Status: status, CreatedAt: int64(i + 1), UpdatedAt: int64(i + 2)})
	}
	overview := normalizeOverview(composeOverview(session, corespec.Spec{}, tasks, nil))
	if len(overview.Completed) > overviewMaxListItems || len(overview.Pending) > overviewMaxListItems {
		t.Fatalf("列表未限制 6 条: completed=%d pending=%d", len(overview.Completed), len(overview.Pending))
	}
	if !strings.Contains(strings.Join(overview.Completed, ""), "另有") {
		t.Fatalf("超出未追加汇总: %v", overview.Completed)
	}
	if len(overview.Timeline) > overviewMaxTimeline {
		t.Fatalf("timeline 未限制 6 条: %d", len(overview.Timeline))
	}
	for _, item := range overview.Completed {
		if len([]rune(item)) > overviewMaxItemRunes {
			t.Fatalf("completed 超长: %q", item)
		}
	}
	for _, item := range overview.Timeline {
		if len([]rune(item.Text)) > overviewMaxTimeRunes {
			t.Fatalf("timeline 超长: %q", item.Text)
		}
	}
}

func TestOverviewLegacyFragmentsNeedRebuild(t *testing.T) {
	fragmented := Overview{Completed: []string{
		"已经完成的是「你生成一个 markdown 消息。",
		"」、请严格用 Markdown 回复…",
	}}
	if !overviewNeedsRebuild(fragmented) {
		t.Fatalf("碎片旧缓存未被识别")
	}
	clean := Overview{Completed: []string{"完成：「你生成一个 markdown 消息。」"}}
	if overviewNeedsRebuild(clean) {
		t.Fatalf("新格式被误判为旧碎片")
	}
	mojibake := Overview{Completed: []string{"完成：\uFFFD用无序列表…"}}
	if !overviewNeedsRebuild(mojibake) {
		t.Fatalf("U+FFFD 旧缓存未被识别")
	}
}

func TestOverviewTruncationRuneSafe(t *testing.T) {
	session := Session{ID: "sess-utf8", Title: "UTF8", CreatedAt: 1}
	tasks := []coretask.Task{
		{ID: "t1", Title: "说明：用无序列表整理 3 条 🚀 重点（中英 mixed content）", Status: coretask.StatusDone,
			CreatedAt: 1, UpdatedAt: 2},
		{ID: "t2", Title: "待办：检查 emoji 🚀🚀 与中文混排的截断是否安全", Status: coretask.StatusPending,
			CreatedAt: 1, UpdatedAt: 2},
	}
	overview := normalizeOverview(composeOverview(session, corespec.Spec{}, tasks, nil))
	for _, item := range append(append([]string{}, overview.Completed...), overview.Pending...) {
		if strings.Contains(item, "\uFFFD") {
			t.Fatalf("completed/pending 出现 UTF-8 替换字符: %q", item)
		}
		if len([]rune(item)) > overviewMaxItemRunes {
			t.Fatalf("completed/pending 超长: %q", item)
		}
	}
	for _, item := range overview.Timeline {
		if strings.Contains(item.Text, "\uFFFD") {
			t.Fatalf("timeline 出现 UTF-8 替换字符: %q", item.Text)
		}
		if len([]rune(item.Text)) > overviewMaxTimeRunes {
			t.Fatalf("timeline 超长: %q", item.Text)
		}
	}
}

func TestOverviewLegacyCacheNormalized(t *testing.T) {
	overview := normalizeOverview(Overview{
		Completed: []string{strings.Repeat("已经完成的任务", 30) + "。另一个任务。"},
		Pending:   []string{"还需要完成一项很长很长的任务" + strings.Repeat("补充", 60)},
		Timeline:  []TimelineItem{{At: 2, Text: strings.Repeat("事件描述", 40)}, {At: 1, Text: "开始。"}},
	})
	for _, item := range overview.Completed {
		if len([]rune(item)) > 40 {
			t.Fatalf("旧缓存 completed 未压缩: %q", item)
		}
	}
	for _, item := range overview.Pending {
		if len([]rune(item)) > 40 {
			t.Fatalf("旧缓存 pending 未压缩: %q", item)
		}
	}
	for _, item := range overview.Timeline {
		if len([]rune(item.Text)) > 50 {
			t.Fatalf("旧缓存 timeline 未压缩: %q", item.Text)
		}
	}
	if overview.Timeline[0].At != 1 {
		t.Fatalf("timeline 未按时间排序: %+v", overview.Timeline)
	}
}
