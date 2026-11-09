package memory

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	corememory "simo/internal/core/memory"
	"simo/internal/platform/httpserver"
)

type consolidationSourceMessage struct {
	id, role, text string
	at             int64
}

type consolidationJob struct {
	ID             string   `json:"id"`
	SessionID      string   `json:"sessionId"`
	AgentID        string   `json:"agentId"`
	Trigger        string   `json:"trigger"`
	Status         string   `json:"status"`
	SourceIDs      []string `json:"sourceMessageIds"`
	CandidateCount int      `json:"candidateCount"`
	CreatedCount   int      `json:"createdCount"`
	MergedCount    int      `json:"mergedCount"`
	ConflictCount  int      `json:"conflictCount"`
	SkippedCount   int      `json:"skippedCount"`
	Reason         string   `json:"reason,omitempty"`
	IdempotencyKey string   `json:"idempotencyKey"`
	CreatedAt      int64    `json:"createdAt"`
	UpdatedAt      int64    `json:"updatedAt"`
}

type consolidationResult struct {
	OK         bool             `json:"ok"`
	Job        consolidationJob `json:"job"`
	Warnings   []string         `json:"warnings"`
	Idempotent bool             `json:"idempotent"`
}

func (m *Module) registerConsolidation(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/debug/memory/consolidate", m.handleDebugConsolidate)
	mux.HandleFunc("GET /api/debug/memory/consolidation", m.handleDebugConsolidationStatus)
}

func consolidationEnabled() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("SIMO_MEMORY_CONSOLIDATE"))) {
	case "0", "false", "off", "no":
		return false
	}
	return true
}

func consolidationThreshold() int {
	if raw := strings.TrimSpace(os.Getenv("SIMO_MEMORY_CONSOLIDATE_THRESHOLD")); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value > 0 {
			return value
		}
	}
	return 8
}

func (m *Module) consolidationLoop() {
	defer m.wg.Done()
	interval := 300 * time.Second
	if raw := strings.TrimSpace(os.Getenv("SIMO_MEMORY_CONSOLIDATE_INTERVAL_SEC")); raw != "" {
		if value, err := strconv.Atoi(raw); err == nil && value >= 1 {
			interval = time.Duration(value) * time.Second
		}
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			rows, err := m.store.Query(m.ctx, `SELECT DISTINCT session_id FROM raw_messages`)
			if err != nil {
				continue
			}
			sessions := make([]string, 0, 8)
			for rows.Next() {
				var sessionID string
				if rows.Scan(&sessionID) == nil && sessionID != "" {
					sessions = append(sessions, sessionID)
				}
			}
			_ = rows.Close()
			for _, sessionID := range sessions {
				_, _, _ = m.consolidate(m.ctx, sessionID, "", "schedule", 30, false)
			}
		}
	}
}

func (m *Module) handleDebugConsolidate(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	var req struct {
		SessionID   string `json:"sessionId"`
		AgentID     string `json:"agentId"`
		Trigger     string `json:"trigger"`
		MaxMessages int    `json:"maxMessages"`
		Force       bool   `json:"force"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": map[string]any{"code": "invalid_argument", "message": err.Error()}})
		return
	}
	if strings.TrimSpace(req.SessionID) == "" {
		req.SessionID = "main"
	}
	if req.Trigger == "" {
		req.Trigger = "manual"
	}
	if req.MaxMessages <= 0 {
		req.MaxMessages = 50
	}
	result, job, err := m.consolidate(r.Context(), req.SessionID, req.AgentID, req.Trigger, req.MaxMessages, req.Force)
	if err != nil {
		httpserver.WriteJSON(w, http.StatusBadRequest, map[string]any{"ok": false,
			"error": map[string]any{"code": "consolidation_failed", "message": err.Error()}})
		return
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "data": result, "job": job})
}

func (m *Module) handleDebugConsolidationStatus(w http.ResponseWriter, r *http.Request) {
	if !isLoopback(r) {
		httpserver.WriteError(w, http.StatusForbidden, "debug 端点仅允许本机访问")
		return
	}
	sessionID := strings.TrimSpace(r.URL.Query().Get("sessionId"))
	jobs := make([]consolidationJob, 0, 8)
	rows, err := m.store.Query(r.Context(), `SELECT id,session_id,agent_id,trigger,status,source_json,
		candidate_count,created_count,merged_count,conflict_count,skipped_count,reason,idempotency_key,created_at,updated_at
		FROM memory_consolidation_jobs WHERE (?='' OR session_id=?) ORDER BY created_at DESC LIMIT 50`,
		sessionID, sessionID)
	if err == nil {
		for rows.Next() {
			var job consolidationJob
			var sources string
			if rows.Scan(&job.ID, &job.SessionID, &job.AgentID, &job.Trigger, &job.Status, &sources,
				&job.CandidateCount, &job.CreatedCount, &job.MergedCount, &job.ConflictCount,
				&job.SkippedCount, &job.Reason, &job.IdempotencyKey, &job.CreatedAt, &job.UpdatedAt) == nil {
				job.SourceIDs = decodeStringArray(sources)
				jobs = append(jobs, job)
			}
		}
		_ = rows.Close()
	}
	httpserver.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "jobs": jobs, "total": len(jobs),
		"enabled": consolidationEnabled(), "threshold": consolidationThreshold()})
}

func (m *Module) maybeConsolidateTrigger(sessionID string) {
	if !consolidationEnabled() || sessionID == "" {
		return
	}
	stateID, count := m.consolidationPendingCount(sessionID)
	_ = stateID
	if count < consolidationThreshold() {
		return
	}
	go func() {
		_, _, _ = m.consolidate(context.Background(), sessionID, "", "threshold", 50, false)
	}()
}

func (m *Module) consolidationPendingCount(sessionID string) (string, int) {
	var lastID string
	_ = m.store.QueryRow(context.Background(), `SELECT last_message_id FROM memory_consolidation_state WHERE session_id=?`, sessionID).Scan(&lastID)
	var count int
	_ = m.store.QueryRow(context.Background(), `SELECT COUNT(*) FROM raw_messages WHERE session_id=? AND id>?`, sessionID, lastID).Scan(&count)
	return lastID, count
}

func (m *Module) consolidate(ctx context.Context, sessionID, agentID, trigger string, maxMessages int, force bool) (consolidationResult, consolidationJob, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		sessionID = "main"
	}
	if agentID == "" {
		agentID = "agent:simo"
	}
	if maxMessages <= 0 || maxMessages > 200 {
		maxMessages = 50
	}
	var lastMessageID string
	_ = m.store.QueryRow(ctx, `SELECT last_message_id FROM memory_consolidation_state WHERE session_id=?`, sessionID).Scan(&lastMessageID)
	rows, err := m.store.Query(ctx, `SELECT id,role,text,created_at FROM raw_messages
		WHERE session_id=? AND id>? ORDER BY id ASC LIMIT ?`, sessionID, lastMessageID, maxMessages)
	if err != nil {
		return consolidationResult{}, consolidationJob{}, err
	}
	type sourceMessage = consolidationSourceMessage
	sources := make([]sourceMessage, 0, maxMessages)
	for rows.Next() {
		var message sourceMessage
		if rows.Scan(&message.id, &message.role, &message.text, &message.at) == nil {
			sources = append(sources, message)
		}
	}
	_ = rows.Close()
	if len(sources) == 0 {
		var latestJobID string
		_ = m.store.QueryRow(ctx, `SELECT id FROM memory_consolidation_jobs WHERE session_id=?
			ORDER BY created_at DESC LIMIT 1`, sessionID).Scan(&latestJobID)
		if latestJobID != "" {
			job := m.loadConsolidationJob(ctx, latestJobID)
			return consolidationResult{OK: true, Job: job, Idempotent: true, Warnings: []string{}}, job, nil
		}
		return consolidationResult{OK: true, Warnings: []string{"no_new_messages"}}, consolidationJob{}, nil
	}
	sourceIDs := make([]string, 0, len(sources))
	for _, message := range sources {
		sourceIDs = append(sourceIDs, message.id)
	}
	idempotencyKey := consolidationIdempotency(sessionID, sourceIDs)
	if force {
		idempotencyKey += ":force:" + strconv.FormatInt(time.Now().UnixNano(), 10)
	}
	var existingJobID string
	_ = m.store.QueryRow(ctx, `SELECT id FROM memory_consolidation_jobs WHERE idempotency_key=?`, idempotencyKey).Scan(&existingJobID)
	if existingJobID != "" && !force {
		job := m.loadConsolidationJob(ctx, existingJobID)
		return consolidationResult{OK: true, Job: job, Idempotent: true, Warnings: []string{}}, job, nil
	}
	now := time.Now().UnixMilli()
	jobID := newMemoryID("mjob")
	candidates := buildConsolidationCandidates(sessionID, agentID, sources)
	// 先写 job（用唯一键拦住并发重复），失败不产生半写。
	inserted := false
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		result, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_consolidation_jobs(
			id,session_id,agent_id,trigger,status,source_json,candidate_count,created_count,merged_count,
			conflict_count,skipped_count,reason,idempotency_key,created_at,updated_at)
			VALUES (?,?,?,?, 'running', ?,?,0,0,0,0,'',?,?,?)`,
			jobID, sessionID, agentID, trigger, mustJSON(sourceIDs), len(candidates), idempotencyKey, now, now)
		if err != nil {
			return err
		}
		affected, _ := result.RowsAffected()
		inserted = affected > 0
		return nil
	}); err != nil {
		return consolidationResult{}, consolidationJob{}, err
	}
	if !inserted {
		_ = m.store.QueryRow(ctx, `SELECT id FROM memory_consolidation_jobs WHERE idempotency_key=?`, idempotencyKey).Scan(&existingJobID)
		job := m.loadConsolidationJob(ctx, existingJobID)
		return consolidationResult{OK: true, Job: job, Idempotent: true}, job, nil
	}
	created, merged, conflicts, skipped := 0, 0, 0, 0
	warnings := make([]string, 0, 4)
	for _, candidate := range candidates {
		submitResult, err := m.Submit(ctx, candidate)
		if err != nil {
			skipped++
			warnings = append(warnings, "candidate_failed:"+err.Error())
			continue
		}
		switch submitResult.Outcome {
		case "accepted":
			created++
		case "disputed":
			conflicts++
		case "ignored", "retracted":
			skipped++
		default:
			merged++
		}
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_writeback_audit(
				id,job_id,session_id,agent_id,target,memory_id,content_hash,outcome,source_json,created_at)
				VALUES (?,?,?,?, 'session', ?,?,?,?,?)`,
				newMemoryID("waudit"), jobID, sessionID, agentID, submitResult.Item.ID,
				hashMemoryText(candidate.Content), submitResult.Outcome, mustJSON(candidate.Refs), now)
			return err
		})
		if strings.TrimSpace(submitResult.Item.ID) != "" && isAgentGenericCandidate(candidate) {
			agentCandidate := candidate
			agentCandidate.Scope = "domain:agent-" + strings.TrimPrefix(agentID, "agent:")
			agentCandidate.Refs = append(append([]string{}, candidate.Refs...), "session:"+sessionID)
			agentCandidate.Source = "conversation"
			agentResult, agentErr := m.Submit(ctx, agentCandidate)
			if agentErr == nil && agentResult.Item.ID != "" {
				_ = m.store.Write(ctx, func(tx *sql.Tx) error {
					_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO agent_memory(id,agent_id,memory_id,
						source_conversation_ids_json,source_canonical_ids_json,job_key,created_at)
						VALUES (?,?,?,?,?,?,?)`, newMemoryID("amem"), agentID, agentResult.Item.ID,
						mustJSON([]string{sessionID}), mustJSON([]string{}), idempotencyKey, now)
					if err != nil {
						return err
					}
					_, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_entities(memory_id,entity_id,role,source)
						VALUES (?,?, 'about','canonical')`, agentResult.Item.ID, "ent-agent-simo")
					return err
				})
				_ = m.store.Write(ctx, func(tx *sql.Tx) error {
					_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO memory_writeback_audit(
						id,job_id,session_id,agent_id,target,memory_id,content_hash,outcome,source_json,created_at)
						VALUES (?,?,?,?, 'agent', ?,?,?,?,?)`,
						newMemoryID("waudit"), jobID, sessionID, agentID, agentResult.Item.ID,
						hashMemoryText(candidate.Content), agentResult.Outcome, mustJSON(agentCandidate.Refs), now)
					return err
				})
			}
		}
	}
	status := "done"
	if skipped == len(candidates) && len(candidates) > 0 {
		status = "partial"
	}
	_ = m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE memory_consolidation_jobs SET status=?,created_count=?,merged_count=?,
			conflict_count=?,skipped_count=?,updated_at=? WHERE id=?`,
			status, created, merged, conflicts, skipped, time.Now().UnixMilli(), jobID)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO memory_consolidation_state(session_id,agent_id,last_message_id,last_run_at,processed_messages)
			VALUES (?,?,?,?,?)
			ON CONFLICT(session_id) DO UPDATE SET agent_id=excluded.agent_id,
			last_message_id=excluded.last_message_id,last_run_at=excluded.last_run_at,
			processed_messages=memory_consolidation_state.processed_messages+excluded.processed_messages`,
			sessionID, agentID, sourceIDs[len(sourceIDs)-1], now, len(sources))
		return err
	})
	job := m.loadConsolidationJob(ctx, jobID)
	_, _ = m.events.Append(ctx, eventlog.TypeMemoryConsolidated, map[string]any{
		"jobId": jobID, "sessionId": sessionID, "agentId": agentID, "trigger": trigger,
		"sourceMessageIds": sourceIDs, "candidates": len(candidates), "created": created,
		"merged": merged, "conflicts": conflicts, "skipped": skipped, "idempotencyKey": idempotencyKey,
	})
	if len(candidates) == 0 {
		warnings = append(warnings, "no_candidates")
	}
	return consolidationResult{OK: true, Job: job, Warnings: warnings}, job, nil
}

func (m *Module) loadConsolidationJob(ctx context.Context, jobID string) consolidationJob {
	var job consolidationJob
	var sources string
	if m.store.QueryRow(ctx, `SELECT id,session_id,agent_id,trigger,status,source_json,candidate_count,
		created_count,merged_count,conflict_count,skipped_count,reason,idempotency_key,created_at,updated_at
		FROM memory_consolidation_jobs WHERE id=?`, jobID).Scan(&job.ID, &job.SessionID, &job.AgentID,
		&job.Trigger, &job.Status, &sources, &job.CandidateCount, &job.CreatedCount, &job.MergedCount,
		&job.ConflictCount, &job.SkippedCount, &job.Reason, &job.IdempotencyKey,
		&job.CreatedAt, &job.UpdatedAt) == nil {
		job.SourceIDs = decodeStringArray(sources)
	}
	return job
}

func buildConsolidationCandidates(sessionID, agentID string, sources []consolidationSourceMessage) []corememory.Candidate {
	candidates := make([]corememory.Candidate, 0, len(sources))
	seen := map[string]bool{}
	for _, message := range sources {
		text := strings.TrimSpace(message.text)
		if len([]rune(text)) < 8 || len([]rune(text)) > 1000 {
			continue
		}
		if strings.HasPrefix(strings.ToLower(text), "mock:") || seen[hashMemoryText(text)] {
			continue
		}
		if !isStableMemoryText(text, message.role) {
			continue
		}
		seen[hashMemoryText(text)] = true
		memoryType, subType := classifyConsolidationText(text)
		refs := []string{"raw:" + message.id, "session:" + sessionID}
		candidate := corememory.Candidate{
			Kind: "fact", Scope: "domain:session-" + sessionID, Key: "consolidated:" + shortHash(text),
			Content: text, Source: "conversation", Authority: "inferred", Confidence: 0.62,
			Importance: 5, Refs: refs, Mode: "assert", Type: memoryType, SubType: subType,
			OwnerAgent: agentID, Assertion: "fact", AttributedTo: "",
		}
		if message.role == "agent" {
			candidate.Source = "conversation"
			candidate.Authority = "inferred"
			candidate.Confidence = 0.5
		}
		if strings.Contains(text, "我认为") || strings.Contains(text, "我觉得") || strings.Contains(text, "我的看法") {
			candidate.Assertion = "opinion"
			candidate.AttributedTo = "user"
		}
		if key := consolidationFactKey(text); key != "" && candidate.Assertion == "fact" {
			candidate.FactKey = key
			candidate.Key = key
		}
		candidates = append(candidates, candidate)
	}
	sort.SliceStable(candidates, func(i, j int) bool { return candidates[i].Key < candidates[j].Key })
	return candidates
}

func isStableMemoryText(text, role string) bool {
	lower := strings.ToLower(text)
	if strings.Contains(lower, "?") || strings.Contains(text, "？") {
		if !strings.Contains(text, "记住") && !strings.Contains(text, "代号") {
			return false
		}
	}
	if strings.Contains(lower, "mock:") || strings.Contains(lower, "evals-") {
		return false
	}
	signals := []string{"记住", "项目", "代号", "目标", "计划", "偏好", "习惯", "规则", "约定",
		"决定", "负责", "完成", "交付", "地址", "生日", "公司", "喜欢", "不要", "必须",
		"每周", "每天", "交付物", "验收"}
	for _, signal := range signals {
		if strings.Contains(text, signal) {
			return true
		}
	}
	return role == "agent" && len([]rune(text)) >= 20
}

func classifyConsolidationText(text string) (string, string) {
	switch {
	case strings.Contains(text, "必须") || strings.Contains(text, "不要") || strings.Contains(text, "规则") || strings.Contains(text, "约定"):
		return "norm", "rule"
	case strings.Contains(text, "喜欢") || strings.Contains(text, "偏好") || strings.Contains(text, "习惯"):
		return "semantic", "preference"
	case strings.Contains(text, "完成") || strings.Contains(text, "交付") || strings.Contains(text, "进展"):
		return "working", "progress"
	default:
		return "semantic", "fact"
	}
}

func isAgentGenericCandidate(candidate corememory.Candidate) bool {
	return candidate.Type == "semantic" || candidate.Type == "norm" || candidate.Type == "procedural"
}

func consolidationFactKey(text string) string {
	patterns := []struct {
		re  *regexp.Regexp
		key string
	}{
		{regexp.MustCompile(`项目代号(?:是|为)[:：]?\s*([^\s，。；;]+)`), "project|code|{}"},
		{regexp.MustCompile(`项目名称(?:是|为)[:：]?\s*([^\s，。；;]+)`), "project|name|{}"},
		{regexp.MustCompile(`(?:地址|住址)(?:是|为)[:：]?\s*([^\s，。；;]+)`), "profile|address|{}"},
		{regexp.MustCompile(`生日(?:是|为)[:：]?\s*([^\s，。；;]+)`), "profile|birthday|{}"},
		{regexp.MustCompile(`(?:公司|单位)(?:是|为)[:：]?\s*([^\s，。；;]+)`), "profile|company|{}"},
	}
	for _, pattern := range patterns {
		if pattern.re.MatchString(text) {
			return pattern.key
		}
	}
	return ""
}

func consolidationIdempotency(sessionID string, sourceIDs []string) string {
	return "consolidate:" + sessionID + ":" + shortHash(strings.Join(sourceIDs, ","))
}

func hashMemoryText(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func shortHash(text string) string {
	return hashMemoryText(text)[:16]
}

func newMemoryID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

var _ = sql.ErrNoRows
