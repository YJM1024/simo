package chat

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"simo/internal/platform/httpserver"
)

type metricsPercentiles struct {
	TTFTP50 *int64 `json:"ttftP50Ms"`
	TTFTP90 *int64 `json:"ttftP90Ms"`
	DurP50  *int64 `json:"durationP50Ms"`
	DurP90  *int64 `json:"durationP90Ms"`
}

type metricsTotals struct {
	metricsPercentiles
	Turns            int64 `json:"turns"`
	Messages         int64 `json:"messages"`
	Tasks            int64 `json:"tasks"`
	Failures         int64 `json:"failures"`
	PromptTokens     int64 `json:"promptTokens"`
	CompletionTokens int64 `json:"completionTokens"`
	ReasoningTokens  int64 `json:"reasoningTokens"`
	TotalTokens      int64 `json:"totalTokens"`
}

type metricsDay struct {
	Date  string `json:"date"`
	Start int64  `json:"start"`
	End   int64  `json:"end"`
	metricsPercentiles
	Turns            int64 `json:"turns"`
	Messages         int64 `json:"messages"`
	Tasks            int64 `json:"tasks"`
	Failures         int64 `json:"failures"`
	PromptTokens     int64 `json:"promptTokens"`
	CompletionTokens int64 `json:"completionTokens"`
	ReasoningTokens  int64 `json:"reasoningTokens"`
	TotalTokens      int64 `json:"totalTokens"`
	NewSessions      int64 `json:"newSessions"`
	ActiveSessions   int64 `json:"activeSessions"`
}

type metricsWindow struct {
	Kind         string `json:"kind"`
	From         string `json:"from"`
	To           string `json:"to"`
	Timezone     string `json:"timezone"`
	PartialToday bool   `json:"partialToday"`
}

type metricsTopics struct {
	NewSessions    int64 `json:"newSessions"`
	ActiveSessions int64 `json:"activeSessions"`
}

type metricsSessions struct {
	Total    int64 `json:"total"`
	Active   int64 `json:"active"`
	Archived int64 `json:"archived"`
}

type metricsRatio struct {
	Value       *float64 `json:"value"`
	Numerator   int64    `json:"numerator"`
	Denominator int64    `json:"denominator"`
}

type metricsLatency struct {
	P50    *int64 `json:"p50"`
	P90    *int64 `json:"p90"`
	Sample int    `json:"sample"`
}

type metricsTaskQuality struct {
	CompletionRate metricsRatio   `json:"completionRate"`
	FirstPassRate  metricsRatio   `json:"firstPassRate"`
	ReworkRate     metricsRatio   `json:"reworkRate"`
	Response       metricsLatency `json:"response"`
}

type metricsTokenTableRow struct {
	Model      string `json:"model"`
	SessionID  string `json:"sessionId,omitempty"`
	Title      string `json:"title,omitempty"`
	Total      int64  `json:"total"`
	Prompt     int64  `json:"prompt"`
	Completion int64  `json:"completion"`
	Reasoning  int64  `json:"reasoning"`
}

type metricsMessageRow struct {
	SessionID string `json:"sessionId,omitempty"`
	Title     string `json:"title,omitempty"`
	Role      string `json:"role,omitempty"`
	Count     int64  `json:"count"`
	User      int64  `json:"user"`
	Agent     int64  `json:"agent"`
	Total     int64  `json:"total"`
}

type metricsSessionRow struct {
	SessionID string `json:"sessionId"`
	Title     string `json:"title"`
	Active    bool   `json:"active"`
	Archived  bool   `json:"archived"`
	New       bool   `json:"new"`
}

type metricsTaskTableRow struct {
	SessionID      string   `json:"sessionId"`
	Title          string   `json:"title"`
	Project        any      `json:"project"`
	Done           int64    `json:"done"`
	Failed         int64    `json:"failed"`
	Cancelled      int64    `json:"cancelled"`
	Total          int64    `json:"total"`
	CompletionRate *float64 `json:"completionRate"`
	FirstPassRate  *float64 `json:"firstPassRate"`
	ReworkRate     *float64 `json:"reworkRate"`
	terminal       int64
	firstPass      int64
	reworked       int64
}

type metricsLatencyRow struct {
	Kind   string `json:"kind"`
	P50    *int64 `json:"p50"`
	P90    *int64 `json:"p90"`
	Sample int    `json:"sample"`
}

type metricsTables struct {
	TokensByModel     []metricsTokenTableRow `json:"tokensByModel"`
	TokensBySession   []metricsTokenTableRow `json:"tokensBySession"`
	MessagesByRole    []metricsMessageRow    `json:"messagesByRole"`
	MessagesBySession []metricsMessageRow    `json:"messagesBySession"`
	Sessions          []metricsSessionRow    `json:"sessions"`
	TasksBySession    []metricsTaskTableRow  `json:"tasksBySession"`
	LatencySamples    []metricsLatencyRow    `json:"latencySamples"`
}

type metricsKpis struct {
	Tokens   metricsTokenTableRow `json:"tokens"`
	Topics   metricsTopics        `json:"topics"`
	Messages metricsMessageRow    `json:"messages"`
	Sessions metricsSessions      `json:"sessions"`
	Reply    metricsLatency       `json:"reply"`
	TTFT     metricsLatency       `json:"ttft"`
}

type metricsPayload struct {
	Range        string             `json:"range"`
	Timezone     string             `json:"timezone"`
	From         int64              `json:"from"`
	To           int64              `json:"to"`
	GeneratedAt  int64              `json:"generatedAt"`
	PartialToday bool               `json:"partialToday"`
	Window       metricsWindow      `json:"window"`
	Availability map[string]string  `json:"availability"`
	Kpis         metricsKpis        `json:"kpis"`
	Topics       metricsTopics      `json:"topics"`
	Sessions     metricsSessions    `json:"sessions"`
	TaskQuality  metricsTaskQuality `json:"taskQuality"`
	Tables       metricsTables      `json:"tables"`
	Totals       metricsTotals      `json:"totals"`
	Series       []metricsDay       `json:"series"`
}

type metricTurnRow struct {
	status     string
	started    int64
	ttft       int64
	duration   int64
	prompt     int64
	completion int64
	reasoning  int64
	total      int64
	model      string
	source     string
	sessionID  string
	replyKey   string
}

type metricTaskRow struct {
	id        string
	sessionID string
	status    string
	attempt   int64
	createdAt int64
	updatedAt int64
}

type tokenSample struct {
	at         int64
	sessionID  string
	model      string
	prompt     int64
	completion int64
	reasoning  int64
	total      int64
}

func (m *Module) handleMetrics(w http.ResponseWriter, r *http.Request) {
	rangeKey := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("range")))
	if rangeKey == "" {
		rangeKey = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("window")))
	}
	if rangeKey == "" {
		rangeKey = "7d"
	}
	days := 0
	switch rangeKey {
	case "7d":
		days = 7
	case "30d":
		days = 30
	default:
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"ok": false, "error": map[string]any{"code": "invalid_range", "message": "range 只支持 7d|30d"},
		})
		return
	}
	tzRaw := r.URL.Query().Get("tz")
	if strings.TrimSpace(tzRaw) == "" {
		tzRaw = r.URL.Query().Get("timezone")
	}
	loc, err := parseMetricsLocation(tzRaw)
	if err != nil {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{
			"ok": false, "error": map[string]any{"code": "invalid_timezone", "message": err.Error()},
		})
		return
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	from := today.AddDate(0, 0, -(days - 1))
	fromMS := from.UnixMilli()
	toMS := now.UnixMilli()
	partialToday := now.Before(today.AddDate(0, 0, 1))
	payload := metricsPayload{
		Range: rangeKey, Timezone: loc.String(), From: fromMS, To: toMS,
		GeneratedAt: time.Now().UnixMilli(), PartialToday: partialToday,
		Window: metricsWindow{
			Kind: rangeKey, From: from.Format(time.RFC3339), To: now.Format(time.RFC3339),
			Timezone: loc.String(), PartialToday: partialToday,
		},
		Availability: map[string]string{},
		Series:       make([]metricsDay, 0, days),
	}
	seriesIndex := make(map[string]int, days)
	for i := 0; i < days; i++ {
		start := from.AddDate(0, 0, i)
		end := start.AddDate(0, 0, 1).Add(-time.Millisecond)
		if end.UnixMilli() > toMS {
			end = now
		}
		date := start.Format("2006-01-02")
		seriesIndex[date] = len(payload.Series)
		payload.Series = append(payload.Series, metricsDay{Date: date, Start: start.UnixMilli(), End: end.UnixMilli()})
	}
	bucket := func(at int64) *metricsDay {
		if at < fromMS || at > toMS {
			return nil
		}
		idx, ok := seriesIndex[time.UnixMilli(at).In(loc).Format("2006-01-02")]
		if !ok {
			return nil
		}
		return &payload.Series[idx]
	}

	// 1) turn metrics：延迟/失败/Turn 数；token 作为 usage 缺失时的回填来源。
	metricRows, err := m.queryMetricTurns(r, fromMS, toMS)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取指标失败")
		return
	}
	var ttftSamples, replySamples []int64
	usageReplies := map[string]bool{}
	tokenSamples, err := m.queryUsageSamples(r, fromMS, toMS, usageReplies)
	if err != nil {
		m.log.Error("读取 token 指标失败", "err", err)
		httpserver.WriteError(w, http.StatusInternalServerError, "读取 token 指标失败")
		return
	}
	for _, row := range metricRows {
		payload.Totals.Turns++
		if row.status != "done" {
			payload.Totals.Failures++
		}
		if day := bucket(row.started); day != nil {
			day.Turns++
			if row.status != "done" {
				day.Failures++
			}
		}
		liveLatency := row.source != "backfill"
		if liveLatency && row.ttft > 0 {
			ttftSamples = append(ttftSamples, row.ttft)
		}
		if liveLatency {
			replySamples = append(replySamples, row.duration)
		}
		if usageReplies[row.replyID()] {
			continue
		}
		if row.prompt+row.completion+row.reasoning > 0 || row.total > 0 {
			total := row.prompt + row.completion + row.reasoning
			if total == 0 {
				total = row.total
			}
			tokenSamples = append(tokenSamples, tokenSample{
				at: row.started, sessionID: row.sessionID, model: row.model,
				prompt: row.prompt, completion: row.completion, reasoning: row.reasoning, total: total,
			})
		}
	}

	// 2) token 明细分桶：usage.recorded 为权威，turn_metrics 只补没有 usage 的历史/测试数据。
	for _, sample := range tokenSamples {
		payload.Totals.PromptTokens += sample.prompt
		payload.Totals.CompletionTokens += sample.completion
		payload.Totals.ReasoningTokens += sample.reasoning
		payload.Totals.TotalTokens += sample.total
		if day := bucket(sample.at); day != nil {
			day.PromptTokens += sample.prompt
			day.CompletionTokens += sample.completion
			day.ReasoningTokens += sample.reasoning
			day.TotalTokens += sample.total
		}
	}
	payload.Totals.TTFTP50, payload.Totals.TTFTP90 = percentiles(ttftSamples)
	payload.Totals.DurP50, payload.Totals.DurP90 = percentiles(replySamples)

	// 3) messages：总/角色/按天/活跃会话。
	messageRows, err := m.queryMessageMetrics(r, fromMS, toMS)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取消息指标失败")
		return
	}
	activeSessions := map[string]bool{}
	dayActive := map[string]map[string]bool{}
	messagesBySession := map[string]*metricsMessageRow{}
	for _, message := range messageRows {
		payload.Totals.Messages++
		activeSessions[message.sessionID] = true
		if day := bucket(message.at); day != nil {
			day.Messages++
			if dayActive[day.Date] == nil {
				dayActive[day.Date] = map[string]bool{}
			}
			dayActive[day.Date][message.sessionID] = true
		}
		row := messagesBySession[message.sessionID]
		if row == nil {
			row = &metricsMessageRow{SessionID: message.sessionID, Title: m.sessionTitle(r.Context(), message.sessionID)}
			messagesBySession[message.sessionID] = row
		}
		row.Count++
		row.Total++
		if message.role == RoleUser {
			row.User++
			payload.Kpis.Messages.User++
		} else if message.role == RoleAgent {
			row.Agent++
			payload.Kpis.Messages.Agent++
		}
	}
	payload.Kpis.Messages.Total = payload.Totals.Messages
	payload.Kpis.Messages.Count = payload.Totals.Messages

	// 4) tasks：数量/质量/按会话。
	taskRows, err := m.queryTaskMetrics(r, fromMS, toMS)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取任务指标失败")
		return
	}
	payload.Totals.Tasks = int64(len(taskRows))
	taskQuality := buildTaskQuality(taskRows)
	payload.TaskQuality = taskQuality
	for _, task := range taskRows {
		if day := bucket(task.createdAt); day != nil {
			day.Tasks++
		}
	}

	// 5) sessions/topics：快照 + 窗口内新建/活跃。
	sessionRows, err := m.querySessionMetrics(r, fromMS)
	if err != nil {
		httpserver.WriteError(w, http.StatusInternalServerError, "读取会话指标失败")
		return
	}
	newSessions := map[string]bool{}
	for _, session := range sessionRows {
		payload.Sessions.Total++
		if session.archived != 0 {
			payload.Sessions.Archived++
		} else {
			payload.Sessions.Active++
		}
		if session.createdAt >= fromMS {
			newSessions[session.id] = true
			if day := bucket(session.createdAt); day != nil {
				day.NewSessions++
			}
		}
	}
	for i := range payload.Series {
		payload.Series[i].ActiveSessions = int64(len(dayActive[payload.Series[i].Date]))
	}
	payload.Topics.NewSessions = int64(len(newSessions))
	payload.Topics.ActiveSessions = int64(len(activeSessions))
	payload.Kpis.Topics = payload.Topics
	payload.Kpis.Sessions = payload.Sessions
	payload.Kpis.Reply = metricsLatency{P50: payload.Totals.DurP50, P90: payload.Totals.DurP90, Sample: len(replySamples)}
	payload.Kpis.TTFT = metricsLatency{P50: payload.Totals.TTFTP50, P90: payload.Totals.TTFTP90, Sample: len(ttftSamples)}
	payload.Kpis.Tokens = metricsTokenTableRow{
		Total: payload.Totals.TotalTokens, Prompt: payload.Totals.PromptTokens,
		Completion: payload.Totals.CompletionTokens, Reasoning: payload.Totals.ReasoningTokens,
	}

	// 6) tables。
	payload.Tables = buildMetricsTables(r, m, tokenSamples, messagesBySession, sessionRows, taskRows, fromMS)
	payload.Tables.LatencySamples = []metricsLatencyRow{
		{Kind: "reply", P50: payload.Totals.DurP50, P90: payload.Totals.DurP90, Sample: len(replySamples)},
		{Kind: "ttft", P50: payload.Totals.TTFTP50, P90: payload.Totals.TTFTP90, Sample: len(ttftSamples)},
		{Kind: "task", P50: taskQuality.Response.P50, P90: taskQuality.Response.P90, Sample: taskQuality.Response.Sample},
	}

	// 7) availability：不伪造 missing。
	payload.Availability = map[string]string{
		"tokens":         readyIf(len(tokenSamples) > 0),
		"topics":         "ready",
		"messages":       "ready",
		"sessions":       "partial",
		"replySpeed":     readyIf(len(replySamples) > 0),
		"ttft":           readyIf(len(ttftSamples) > 0),
		"taskCompletion": "partial",
		"taskAttempts":   "partial",
		"taskReopen":     "missing",
	}
	if len(taskRows) == 0 {
		payload.Availability["taskCompletion"] = "missing"
		payload.Availability["taskAttempts"] = "missing"
	}

	fillMetricDayPercentiles(r, m, payload.Series)
	httpserver.WriteJSON(w, http.StatusOK, payload)
}

func readyIf(ok bool) string {
	if ok {
		return "ready"
	}
	return "missing"
}

func (r metricTurnRow) replyID() string {
	// replyId 不进入结构体 JSON；此方法只用于 token 去重标识。
	return r.replyKey
}

func (m *Module) queryMetricTurns(r *http.Request, from, to int64) ([]metricTurnRow, error) {
	rows, err := m.store.Query(r.Context(), `SELECT status, started_at, ttft_ms, duration_ms,
		prompt_tokens, completion_tokens, reasoning_tokens, total_tokens, model, source, session_id, reply_id
		FROM turn_metrics WHERE started_at >= ? AND started_at <= ? ORDER BY started_at ASC`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]metricTurnRow, 0, 16)
	for rows.Next() {
		var row metricTurnRow
		if err := rows.Scan(&row.status, &row.started, &row.ttft, &row.duration,
			&row.prompt, &row.completion, &row.reasoning, &row.total,
			&row.model, &row.source, &row.sessionID, &row.replyKey); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (m *Module) queryUsageSamples(r *http.Request, from, to int64, seen map[string]bool) ([]tokenSample, error) {
	rows, err := m.store.Query(r.Context(), `SELECT at, payload FROM events
		WHERE type = 'usage.recorded' AND at >= ? AND at <= ? ORDER BY id ASC`, from, to)
	if err != nil {
		return nil, err
	}
	type rawEvent struct {
		at      int64
		payload []byte
	}
	rawEvents := make([]rawEvent, 0, 8)
	for rows.Next() {
		var at int64
		var raw string
		if err := rows.Scan(&at, &raw); err != nil {
			_ = rows.Close()
			return nil, err
		}
		rawEvents = append(rawEvents, rawEvent{at: at, payload: []byte(raw)})
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, err
	}
	_ = rows.Close()
	type payload struct {
		ReplyID   string `json:"replyId"`
		SessionID string `json:"sessionId"`
		Usage     struct {
			PromptTokens     int64  `json:"promptTokens"`
			CompletionTokens int64  `json:"completionTokens"`
			ReasoningTokens  int64  `json:"reasoningTokens"`
			TotalTokens      int64  `json:"totalTokens"`
			Model            string `json:"model"`
		} `json:"usage"`
	}
	out := make([]tokenSample, 0, 8)
	cache := map[string]string{}
	for _, event := range rawEvents {
		var item payload
		if json.Unmarshal(event.payload, &item) != nil {
			continue
		}
		sessionID := strings.TrimSpace(item.SessionID)
		if sessionID == "" && item.ReplyID != "" {
			if value, ok := cache[item.ReplyID]; ok {
				sessionID = value
			} else {
				_ = m.store.QueryRow(r.Context(), `SELECT session_id FROM messages WHERE id = ?`, item.ReplyID).Scan(&sessionID)
				cache[item.ReplyID] = sessionID
			}
		}
		if sessionID == "" {
			continue
		}
		prompt := item.Usage.PromptTokens
		completion := item.Usage.CompletionTokens
		reasoning := item.Usage.ReasoningTokens
		if prompt+completion+reasoning == 0 && item.Usage.TotalTokens > 0 {
			completion = item.Usage.TotalTokens
		}
		total := prompt + completion + reasoning
		out = append(out, tokenSample{at: event.at, sessionID: sessionID, model: item.Usage.Model,
			prompt: prompt, completion: completion, reasoning: reasoning, total: total})
		if item.ReplyID != "" {
			seen[item.ReplyID] = true
		}
	}
	return out, nil
}

type metricMessageVal struct {
	sessionID string
	role      string
	at        int64
}

func (m *Module) queryMessageMetrics(r *http.Request, from, to int64) ([]metricMessageVal, error) {
	rows, err := m.store.Query(r.Context(), `SELECT session_id, role, at FROM messages
		WHERE at >= ? AND at <= ? AND internal = 0 ORDER BY at ASC`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]metricMessageVal, 0, 32)
	for rows.Next() {
		var item metricMessageVal
		if err := rows.Scan(&item.sessionID, &item.role, &item.at); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

type metricSessionVal struct {
	id        string
	title     string
	archived  int64
	createdAt int64
}

func (m *Module) querySessionMetrics(r *http.Request, from int64) ([]metricSessionVal, error) {
	rows, err := m.store.Query(r.Context(), `SELECT id, title, archived, created_at FROM sessions
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]metricSessionVal, 0, 16)
	for rows.Next() {
		var item metricSessionVal
		if err := rows.Scan(&item.id, &item.title, &item.archived, &item.createdAt); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (m *Module) queryTaskMetrics(r *http.Request, from, to int64) ([]metricTaskRow, error) {
	rows, err := m.store.Query(r.Context(), `SELECT id, session_id, status, attempt, created_at, updated_at
		FROM tasks WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]metricTaskRow, 0, 8)
	for rows.Next() {
		var task metricTaskRow
		if err := rows.Scan(&task.id, &task.sessionID, &task.status, &task.attempt, &task.createdAt, &task.updatedAt); err != nil {
			return nil, err
		}
		out = append(out, task)
	}
	return out, rows.Err()
}

func buildTaskQuality(tasks []metricTaskRow) metricsTaskQuality {
	quality := metricsTaskQuality{}
	var done, terminal, firstPass, reworked int64
	var response []int64
	for _, task := range tasks {
		switch task.status {
		case "done":
			done++
			terminal++
			if task.attempt <= 1 {
				firstPass++
			}
			if task.updatedAt >= task.createdAt {
				response = append(response, task.updatedAt-task.createdAt)
			}
		case "failed", "cancelled", "interrupted":
			terminal++
		}
		if task.attempt > 1 {
			reworked++
		}
	}
	quality.CompletionRate = metricsRatio{Numerator: done, Denominator: terminal}
	quality.CompletionRate.Value = ratioValue(done, terminal)
	quality.FirstPassRate = metricsRatio{Numerator: firstPass, Denominator: done}
	quality.FirstPassRate.Value = ratioValue(firstPass, done)
	quality.ReworkRate = metricsRatio{Numerator: reworked, Denominator: terminal}
	quality.ReworkRate.Value = ratioValue(reworked, terminal)
	quality.Response.P50, quality.Response.P90 = percentiles(response)
	quality.Response.Sample = len(response)
	return quality
}

func ratioValue(numerator, denominator int64) *float64 {
	if denominator == 0 {
		return nil
	}
	value := float64(numerator) / float64(denominator)
	return &value
}

func buildMetricsTables(r *http.Request, m *Module, tokens []tokenSample, messages map[string]*metricsMessageRow,
	sessions []metricSessionVal, tasks []metricTaskRow, fromMS int64) metricsTables {
	tables := metricsTables{
		TokensByModel: []metricsTokenTableRow{}, TokensBySession: []metricsTokenTableRow{},
		MessagesByRole: []metricsMessageRow{}, MessagesBySession: []metricsMessageRow{},
		Sessions: []metricsSessionRow{}, TasksBySession: []metricsTaskTableRow{}, LatencySamples: []metricsLatencyRow{},
	}
	byModel := map[string]*metricsTokenTableRow{}
	bySession := map[string]*metricsTokenTableRow{}
	for _, token := range tokens {
		modelKey := token.model
		if strings.TrimSpace(modelKey) == "" {
			modelKey = "unknown"
		}
		if row := byModel[modelKey]; row != nil {
			row.Total += token.total
			row.Prompt += token.prompt
			row.Completion += token.completion
			row.Reasoning += token.reasoning
		} else {
			byModel[modelKey] = &metricsTokenTableRow{Model: modelKey, Total: token.total,
				Prompt: token.prompt, Completion: token.completion, Reasoning: token.reasoning}
		}
		if row := bySession[token.sessionID]; row != nil {
			row.Total += token.total
			row.Prompt += token.prompt
			row.Completion += token.completion
			row.Reasoning += token.reasoning
		} else {
			bySession[token.sessionID] = &metricsTokenTableRow{SessionID: token.sessionID,
				Title: m.sessionTitle(r.Context(), token.sessionID), Total: token.total,
				Prompt: token.prompt, Completion: token.completion, Reasoning: token.reasoning}
		}
	}
	for _, row := range byModel {
		tables.TokensByModel = append(tables.TokensByModel, *row)
	}
	for _, row := range bySession {
		tables.TokensBySession = append(tables.TokensBySession, *row)
	}
	sort.Slice(tables.TokensByModel, func(i, j int) bool { return tables.TokensByModel[i].Total > tables.TokensByModel[j].Total })
	sort.Slice(tables.TokensBySession, func(i, j int) bool { return tables.TokensBySession[i].Total > tables.TokensBySession[j].Total })

	var userCount, agentCount int64
	for _, row := range messages {
		userCount += row.User
		agentCount += row.Agent
		tables.MessagesBySession = append(tables.MessagesBySession, *row)
	}
	tables.MessagesByRole = append(tables.MessagesByRole,
		metricsMessageRow{Role: RoleUser, Count: userCount, User: userCount, Total: userCount},
		metricsMessageRow{Role: RoleAgent, Count: agentCount, Agent: agentCount, Total: agentCount})
	sort.Slice(tables.MessagesBySession, func(i, j int) bool { return tables.MessagesBySession[i].Total > tables.MessagesBySession[j].Total })

	for i, session := range sessions {
		if i >= 100 {
			break
		}
		tables.Sessions = append(tables.Sessions, metricsSessionRow{SessionID: session.id, Title: session.title,
			Active: session.archived == 0, Archived: session.archived != 0, New: session.createdAt >= fromMS})
	}
	taskBySession := map[string]*metricsTaskTableRow{}
	for _, task := range tasks {
		row := taskBySession[task.sessionID]
		if row == nil {
			row = &metricsTaskTableRow{SessionID: task.sessionID, Title: m.sessionTitle(r.Context(), task.sessionID)}
			taskBySession[task.sessionID] = row
		}
		row.Total++
		if task.attempt > 1 {
			row.reworked++
		}
		switch task.status {
		case "done":
			row.Done++
			row.terminal++
			if task.attempt <= 1 {
				row.firstPass++
			}
		case "failed":
			row.Failed++
			row.terminal++
		case "cancelled", "interrupted":
			row.Cancelled++
			row.terminal++
		}
	}
	for _, row := range taskBySession {
		row.CompletionRate = ratioValue(row.Done, row.terminal)
		row.FirstPassRate = ratioValue(row.firstPass, row.Done)
		row.ReworkRate = ratioValue(row.reworked, row.terminal)
		tables.TasksBySession = append(tables.TasksBySession, *row)
	}
	sort.Slice(tables.TasksBySession, func(i, j int) bool { return tables.TasksBySession[i].Total > tables.TasksBySession[j].Total })
	return tables
}

func fillMetricDayPercentiles(r *http.Request, m *Module, days []metricsDay) {
	for i := range days {
		rows, err := m.store.Query(r.Context(), `SELECT ttft_ms, duration_ms FROM turn_metrics
			WHERE started_at >= ? AND started_at <= ? AND source <> 'backfill'`, days[i].Start, days[i].End)
		if err != nil {
			continue
		}
		var ttfts, durations []int64
		for rows.Next() {
			var ttft, duration int64
			if rows.Scan(&ttft, &duration) == nil {
				if ttft > 0 {
					ttfts = append(ttfts, ttft)
				}
				durations = append(durations, duration)
			}
		}
		_ = rows.Close()
		days[i].TTFTP50, days[i].TTFTP90 = percentiles(ttfts)
		days[i].DurP50, days[i].DurP90 = percentiles(durations)
	}
}

func percentiles(values []int64) (*int64, *int64) {
	if len(values) == 0 {
		return nil, nil
	}
	sorted := append([]int64(nil), values...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	at := func(p int) *int64 {
		rank := (p*len(sorted) + 99) / 100
		if rank < 1 {
			rank = 1
		}
		value := sorted[rank-1]
		return &value
	}
	return at(50), at(90)
}

func parseMetricsLocation(raw string) (*time.Location, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Local, nil
	}
	if strings.EqualFold(raw, "UTC") || raw == "Z" {
		return time.UTC, nil
	}
	if len(raw) == 6 && (raw[0] == '+' || raw[0] == '-') && raw[3] == ':' {
		hours, err1 := strconv.Atoi(raw[1:3])
		minutes, err2 := strconv.Atoi(raw[4:6])
		if err1 == nil && err2 == nil && hours <= 23 && minutes <= 59 {
			offset := (hours*60 + minutes) * 60
			if raw[0] == '-' {
				offset = -offset
			}
			return time.FixedZone(raw, offset), nil
		}
	}
	if loc, err := time.LoadLocation(raw); err == nil {
		return loc, nil
	}
	return nil, &metricsLocationError{raw: raw}
}

type metricsLocationError struct{ raw string }

func (e *metricsLocationError) Error() string { return "时区非法: " + e.raw }
