package sessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"time"

	corememory "simo/internal/core/memory"
	corespec "simo/internal/core/spec"
	coretask "simo/internal/core/task"
	"simo/internal/platform/httpserver"
)

const (
	overviewMaxListItems = 6
	overviewMaxItemRunes = 40
	overviewMaxTimeline  = 6
	overviewMaxTimeRunes = 50
)

// overviewGenerationPrompt 是概览生成（若接入模型）的硬约束；当前 composeOverview
// 为确定性生成，normalizeOverview 对模型/旧缓存结果执行同样的后处理。
const overviewGenerationPrompt = `生成会话概览：
- completed/pending 必须是列表，每项只写一个任务核心短名/结果，≤40 字；禁止把多个任务合并成一句；最多 6 条，超出用“另有 N 项…”汇总。
- timeline 每项只写一个事件+结果，≤50 字；按时间取最近，最多 6 条；禁止重复长串。
- goal/constraints/current 保持自然段，不套用列表限制。
- 不输出 HTML/Markdown 表格/原始 JSON 以外的格式。`

// TimelineItem 是概览时间线的一项（M14-D）。
type TimelineItem struct {
	At   int64  `json:"at"`
	Text string `json:"text"`
}

// Overview 是会话概览缓存；completed/pending/timeline 列表化（M14-D）。
type Overview struct {
	Goal        string         `json:"goal"`
	Constraints []string       `json:"constraints"`
	Current     string         `json:"current"`
	Completed   []string       `json:"completed"`
	Pending     []string       `json:"pending"`
	Notes       string         `json:"notes"`
	Timeline    []TimelineItem `json:"timeline"`
	Version     int            `json:"version"`
	UpdatedAt   int64          `json:"updatedAt"`
}

func (m *Module) getOverview(ctx context.Context, sessionID string) (Overview, error) {
	var overview Overview
	var constraintsRaw, completedRaw, pendingRaw, timelineRaw string
	err := m.store.QueryRow(ctx, `SELECT goal, constraints, current, completed, pending, notes, timeline, version, updated_at
		FROM session_overviews WHERE session_id = ?`, sessionID).
		Scan(&overview.Goal, &constraintsRaw, &overview.Current, &completedRaw,
			&pendingRaw, &overview.Notes, &timelineRaw, &overview.Version, &overview.UpdatedAt)
	if err == sql.ErrNoRows {
		return emptyOverview(), nil
	}
	if err != nil {
		return Overview{}, err
	}
	overview.Constraints = decodeList(constraintsRaw, overview.UpdatedAt)
	overview.Completed = decodeList(completedRaw, overview.UpdatedAt)
	overview.Pending = decodeList(pendingRaw, overview.UpdatedAt)
	overview.Timeline = decodeTimeline(timelineRaw, overview.UpdatedAt)
	// 旧缓存是 prose 反解出来的碎片时，不再归一化输出；直接用任务/事件重建。
	if overviewNeedsRebuild(overview) {
		if refreshed, err := m.refreshOverview(ctx, sessionID); err == nil {
			return refreshed, nil
		}
	}
	return normalizeOverview(overview), nil
}

func emptyOverview() Overview {
	return Overview{Constraints: []string{}, Completed: []string{}, Pending: []string{}, Timeline: []TimelineItem{}}
}

func decodeList(raw string, fallbackAt int64) []string {
	_ = fallbackAt
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	if strings.HasPrefix(raw, "[") {
		var list []string
		if json.Unmarshal([]byte(raw), &list) == nil {
			if list == nil {
				return []string{}
			}
			return list
		}
	}
	return splitLegacyText(raw)
}

func decodeTimeline(raw string, fallbackAt int64) []TimelineItem {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []TimelineItem{}
	}
	if strings.HasPrefix(raw, "[") {
		var list []TimelineItem
		if json.Unmarshal([]byte(raw), &list) == nil {
			if list == nil {
				return []TimelineItem{}
			}
			return list
		}
	}
	parts := splitLegacyText(raw)
	out := make([]TimelineItem, 0, len(parts))
	for _, part := range parts {
		out = append(out, TimelineItem{At: fallbackAt, Text: part})
	}
	return out
}

func splitLegacyText(raw string) []string {
	replacer := strings.NewReplacer("\r\n", "\n", "；", "\n", ";", "\n")
	raw = replacer.Replace(raw)
	parts := strings.Split(raw, "\n")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func encodeList(list []string) string {
	if list == nil {
		list = []string{}
	}
	raw, _ := json.Marshal(list)
	return string(raw)
}

func encodeTimeline(list []TimelineItem) string {
	if list == nil {
		list = []TimelineItem{}
	}
	raw, _ := json.Marshal(list)
	return string(raw)
}

// normalizeOverview 对旧缓存与生成结果做统一后处理：
// completed/pending 每项 ≤60 字、timeline 每项 ≤80 字，且按时间排序。
func normalizeOverview(overview Overview) Overview {
	overview.Completed = capOverviewList(normalizeOverviewList(overview.Completed, overviewMaxItemRunes),
		overviewMaxListItems, "已完成")
	overview.Pending = capOverviewList(normalizeOverviewList(overview.Pending, overviewMaxItemRunes),
		overviewMaxListItems, "待办")
	if overview.Timeline == nil {
		overview.Timeline = []TimelineItem{}
	}
	timeline := make([]TimelineItem, 0, len(overview.Timeline))
	for _, item := range overview.Timeline {
		text := compactOverviewItem(item.Text, overviewMaxTimeRunes)
		if text == "" {
			continue
		}
		timeline = append(timeline, TimelineItem{At: item.At, Text: text})
	}
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i].At < timeline[j].At })
	// 取最近 6 条；保持升序以兼容现有前端/评测的时间线顺序。
	if len(timeline) > overviewMaxTimeline {
		timeline = timeline[len(timeline)-overviewMaxTimeline:]
	}
	overview.Timeline = timeline
	if overview.Completed == nil {
		overview.Completed = []string{}
	}
	if overview.Pending == nil {
		overview.Pending = []string{}
	}
	if overview.Constraints == nil {
		overview.Constraints = []string{}
	}
	return overview
}

func capOverviewList(items []string, limit int, noun string) []string {
	if len(items) <= limit {
		return items
	}
	keep := limit - 1
	if keep < 0 {
		keep = 0
	}
	extra := len(items) - keep
	out := make([]string, 0, limit)
	out = append(out, items[:keep]...)
	out = append(out, compactOverviewItem(fmt.Sprintf("另有 %d 项%s。", extra, noun), overviewMaxItemRunes))
	return out
}

func normalizeOverviewList(items []string, maxRunes int) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		item = compactOverviewItem(item, maxRunes)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
}

func overviewTaskTitle(title string) string {
	title = strings.ReplaceAll(title, "\r\n", " ")
	title = strings.ReplaceAll(title, "\n", " ")
	title = strings.ReplaceAll(title, "\r", " ")
	return strings.Join(strings.Fields(strings.TrimSpace(title)), " ")
}

func overviewTaskShortTitle(title string) string {
	title = overviewTaskTitle(title)
	for _, prefix := range []string{"请帮我", "请你", "帮我", "麻烦你", "麻烦", "请", "完成", "需要"} {
		if strings.HasPrefix(title, prefix) {
			title = strings.TrimSpace(strings.TrimPrefix(title, prefix))
			break
		}
	}
	title = strings.TrimRight(title, "。．.！!？?；;，,")
	// 标题里常见的“说明：”只保留核心任务名；用 rune 索引，避免切在多字节 UTF-8 字符中间。
	runes := []rune(title)
	for i, r := range runes {
		if (r == '：' || r == ':') && i > 0 && i < len(runes)-1 {
			candidate := strings.TrimSpace(string(runes[i+1:]))
			if candidate != "" {
				title = candidate
			}
			break
		}
	}
	return title
}

func overviewTimelineText(at int64, action, title string) string {
	short := overviewTaskShortTitle(title)
	clock := ""
	if at > 0 {
		clock = time.UnixMilli(at).Format("15:04")
	}
	if clock != "" {
		return compactOverviewItem(clock+" "+action+"："+short, overviewMaxTimeRunes)
	}
	return compactOverviewItem(action+"："+short, overviewMaxTimeRunes)
}

func overviewNeedsRebuild(overview Overview) bool {
	for _, text := range []string{overview.Goal, overview.Current, overview.Notes} {
		if strings.Contains(text, "\uFFFD") {
			return true
		}
	}
	for _, constraint := range overview.Constraints {
		if strings.Contains(constraint, "\uFFFD") {
			return true
		}
	}
	for _, list := range [][]string{overview.Completed, overview.Pending} {
		for _, raw := range list {
			item := strings.TrimSpace(raw)
			if item == "" {
				continue
			}
			// 编码损坏优先判定；旧版可能已带“完成：”前缀，不能先按新格式跳过。
			if strings.Contains(item, "\uFFFD") {
				return true
			}
			// 新生成项有固定前缀；即使任务标题含「」或分号也不能误判为碎片。
			if strings.HasPrefix(item, "完成：") || strings.HasPrefix(item, "待办：") ||
				strings.HasPrefix(item, "进行中：") || strings.HasPrefix(item, "待确认：") {
				continue
			}
			if len([]rune(item)) > overviewMaxItemRunes ||
				strings.Contains(item, "\n") ||
				strings.Contains(item, "」、") ||
				strings.HasPrefix(item, "」") ||
				strings.HasPrefix(item, "已经完成的是") ||
				strings.HasPrefix(item, "已经完成「") ||
				strings.HasPrefix(item, "还需要启动") ||
				strings.HasPrefix(item, "正在推进「") {
				return true
			}
		}
	}
	for _, item := range overview.Timeline {
		text := strings.TrimSpace(item.Text)
		if strings.Contains(text, "\uFFFD") ||
			len([]rune(text)) > overviewMaxTimeRunes ||
			strings.Contains(text, "」、") || strings.HasPrefix(text, "」") {
			return true
		}
	}
	return false
}

func splitOverviewParts(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.NewReplacer("\n", "\n", "；", "\n", ";", "\n", "。", "\n。").Replace(text)
	// 上面的 。 规则只用于把“旧缓存的长段落”切开；普通生成项本身没有内部句号。
	parts := strings.Split(text, "\n")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		part = strings.TrimPrefix(part, "。")
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	if len(out) == 0 {
		return []string{}
	}
	return out
}

func compactOverviewItem(text string, maxRunes int) string {
	text = strings.TrimSpace(text)
	if maxRunes <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) == 0 {
		return ""
	}
	if len(runes) <= maxRunes {
		if endsOverviewSentence(text) {
			return text
		}
		if len(runes)+1 <= maxRunes {
			return text + "。"
		}
		return string(runes[:maxRunes-1]) + "。"
	}
	// 保留至多 maxRunes-1 字，截断处尽量落在标点后；最后用中文句号收尾。
	cut := runes[:maxRunes-1]
	for i := len(cut) - 1; i >= 0; i-- {
		switch cut[i] {
		case '。', '！', '？', '；', ';', '，', ',':
			cut = cut[:i]
			i = -1
		}
	}
	trimmed := strings.TrimSpace(string(cut))
	if trimmed == "" {
		trimmed = string(runes[:maxRunes-1])
	}
	return trimmed + "。"
}

func endsOverviewSentence(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	runes := []rune(trimmed)
	switch runes[len(runes)-1] {
	case '。', '！', '？', '…':
		return true
	}
	return false
}

// refreshOverview 从会话、任务、验收状态、记忆生成自然汇报体的概览并缓存。
func (m *Module) refreshOverview(ctx context.Context, sessionID string) (Overview, error) {
	session, err := m.Get(ctx, sessionID)
	if err != nil {
		return Overview{}, err
	}
	tasks := []coretask.Task{}
	if m.tasks != nil {
		if list, err := m.tasks.List(ctx, sessionID); err == nil {
			tasks = list
		}
	}
	spec, _ := m.getSpecBySession(ctx, sessionID)
	memories := []string{}
	if m.memory != nil {
		if result, err := m.memory.Search(ctx, corememory.SearchRequest{
			Query: session.Title, Scopes: []string{"global"}, Limit: 3, MaxChars: 600,
		}); err == nil {
			for _, item := range result.Items {
				if strings.TrimSpace(item.Content) != "" {
					memories = append(memories, item.Content)
				}
			}
		}
	}
	overview := composeOverview(session, spec, tasks, memories)
	if events, err := m.workflowTimeline(ctx, sessionID); err == nil && len(events) > 0 {
		overview.Timeline = append(overview.Timeline, events...)
		sort.SliceStable(overview.Timeline, func(i, j int) bool {
			return overview.Timeline[i].At < overview.Timeline[j].At
		})
	}
	overview.Version = 1
	now := time.Now().UnixMilli()
	overview.UpdatedAt = now
	overview = normalizeOverview(overview)
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO session_overviews(
			session_id, goal, constraints, current, completed, pending, notes, timeline, version, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
			ON CONFLICT(session_id) DO UPDATE SET
				goal=excluded.goal, constraints=excluded.constraints, current=excluded.current,
				completed=excluded.completed, pending=excluded.pending, notes=excluded.notes,
				timeline=excluded.timeline, version=session_overviews.version+1, updated_at=excluded.updated_at`,
			sessionID, overview.Goal, encodeList(overview.Constraints), overview.Current, encodeList(overview.Completed),
			encodeList(overview.Pending), overview.Notes, encodeTimeline(overview.Timeline), now)
		return err
	}); err != nil {
		return Overview{}, err
	}
	stored, err := m.getOverview(ctx, sessionID)
	if err != nil {
		return overview, nil
	}
	return stored, nil
}

func (m *Module) workflowTimeline(ctx context.Context, sessionID string) ([]TimelineItem, error) {
	rows, err := m.store.Query(ctx, `SELECT w.title, we.type, we.created_at
		FROM workflow_events we JOIN workflows w ON w.id = we.workflow_id
		WHERE w.session_id = ? AND we.type IN ('workflow.created', 'workflow.done')
		ORDER BY we.created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]TimelineItem, 0, 4)
	for rows.Next() {
		var title, eventType string
		var at int64
		if err := rows.Scan(&title, &eventType, &at); err != nil {
			return nil, err
		}
		text := overviewTimelineText(at, "工作流推进", title)
		if eventType == "workflow.done" {
			text = overviewTimelineText(at, "工作流结束", title)
		}
		out = append(out, TimelineItem{At: at, Text: text})
	}
	return out, rows.Err()
}

func composeOverview(session Session, spec corespec.Spec, tasks []coretask.Task, memories []string) Overview {
	title := strings.TrimSpace(session.Title)
	if title == "" {
		title = "当前会话"
	}
	done := make([]string, 0, len(tasks))
	running := make([]string, 0, len(tasks))
	pending := make([]string, 0, len(tasks))
	failed := make([]string, 0, len(tasks))
	for _, task := range tasks {
		switch task.Status {
		case coretask.StatusDone:
			done = append(done, task.Title)
		case coretask.StatusRunning, coretask.StatusQueued:
			running = append(running, task.Title)
		case coretask.StatusFailed, coretask.StatusInterrupted, coretask.StatusBlocked:
			failed = append(failed, task.Title)
		default:
			pending = append(pending, task.Title)
		}
	}
	goal := fmt.Sprintf("这个会话围绕「%s」展开，目标是把当前这件事推进到可以交付的状态。", title)
	if spec.Status == corespec.StatusArchived || session.Archived != 0 {
		goal = fmt.Sprintf("这个会话围绕「%s」展开；它现在已经归档，保留内容用于回看，不再继续推进。", title)
	}
	constraints := []string{"目前没有额外的硬性限制，工作按会话里确认的任务顺序推进。"}
	if spec.Status == corespec.StatusArchived || session.Archived != 0 {
		constraints = []string{"会话已经归档，所以现在只能查看已有内容和产物，不能继续修改。"}
	} else if spec.Status == corespec.StatusExecuting || spec.Status == corespec.StatusVerifying {
		constraints = []string{"当前工作已经进入验收阶段，需要以任务结果和实际产物为准，完成一项再确认下一项。"}
	}
	current := "目前还没有拆出明确的任务，工作主要在对话里逐步推进。"
	if len(tasks) > 0 {
		current = fmt.Sprintf("目前会话里共有 %d 个任务，其中 %d 个已经完成，%d 个正在进行，%d 个还在等待。",
			len(tasks), len(done), len(running), len(pending)+len(failed))
		if len(running) > 0 {
			current += fmt.Sprintf("正在推进的是%s。", quoteList(running))
		}
	}
	completed := make([]string, 0, len(done))
	for _, title := range done {
		completed = append(completed, compactOverviewItem("完成："+overviewTaskShortTitle(title), overviewMaxItemRunes))
	}
	pendingItems := make([]string, 0, len(pending)+len(running)+len(failed))
	for _, title := range running {
		pendingItems = append(pendingItems, compactOverviewItem("进行中："+overviewTaskShortTitle(title), overviewMaxItemRunes))
	}
	for _, title := range pending {
		pendingItems = append(pendingItems, compactOverviewItem("待办："+overviewTaskShortTitle(title), overviewMaxItemRunes))
	}
	for _, title := range failed {
		pendingItems = append(pendingItems, compactOverviewItem("待确认："+overviewTaskShortTitle(title), overviewMaxItemRunes))
	}
	notes := "目前没有特别需要提醒的风险。"
	if len(failed) > 0 {
		notes = fmt.Sprintf("需要注意的是，%s没有顺利完成，建议先确认原因再继续后续工作。", quoteList(failed))
	}
	if len(memories) > 0 {
		if notes == "目前没有特别需要提醒的风险。" {
			notes = "有几条之前的经验仍然适用：" + trimSentence(memories[0])
		} else {
			notes += "另外，之前记录的经验是：" + trimSentence(memories[0])
		}
	}
	timeline := make([]TimelineItem, 0, len(tasks)*2+1)
	for _, task := range tasks {
		if task.CreatedAt > 0 {
			timeline = append(timeline, TimelineItem{At: task.CreatedAt,
				Text: overviewTimelineText(task.CreatedAt, "推进", task.Title)})
		}
		switch task.Status {
		case coretask.StatusDone:
			at := task.UpdatedAt
			if at == 0 {
				at = task.CreatedAt
			}
			timeline = append(timeline, TimelineItem{At: at,
				Text: overviewTimelineText(at, "完成", task.Title)})
		case coretask.StatusFailed, coretask.StatusBlocked, coretask.StatusInterrupted:
			at := task.UpdatedAt
			if at == 0 {
				at = task.CreatedAt
			}
			timeline = append(timeline, TimelineItem{At: at,
				Text: overviewTimelineText(at, "未完成", task.Title)})
		}
	}
	sort.SliceStable(timeline, func(i, j int) bool { return timeline[i].At < timeline[j].At })
	if len(timeline) == 0 {
		timeline = append(timeline, TimelineItem{At: session.CreatedAt,
			Text: "这个会话建立了，工作从这里开始。"})
	}
	return Overview{Goal: goal, Constraints: constraints, Current: current,
		Completed: completed, Pending: pendingItems, Notes: notes, Timeline: timeline}
}

func quoteList(items []string) string {
	clean := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			clean = append(clean, "「"+item+"」")
		}
	}
	return strings.Join(clean, "、")
}

func trimSentence(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	if !strings.HasSuffix(text, "。") && !strings.HasSuffix(text, "！") && !strings.HasSuffix(text, "？") {
		text += "。"
	}
	return text
}

func (m *Module) handleOverviewGet(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if _, err := m.Get(r.Context(), sessionID); err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
		return
	}
	overview, err := m.getOverview(r.Context(), sessionID)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取概览失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "overview": overview})
}

func (m *Module) handleOverviewRefresh(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimSpace(r.PathValue("id"))
	if _, err := m.Get(r.Context(), sessionID); err != nil {
		httpserver.WriteError(w, http.StatusNotFound, "会话不存在")
		return
	}
	overview, err := m.refreshOverview(r.Context(), sessionID)
	if err != nil {
		m.log.Error("刷新概览失败", "err", err, "sessionId", sessionID)
		httpserver.WriteError(w, http.StatusInternalServerError, "刷新概览失败")
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "overview": overview})
}
