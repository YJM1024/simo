package sessions

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"simo/internal/core/eventlog"
	corespec "simo/internal/core/spec"
	coretask "simo/internal/core/task"
)

var _ corespec.Service = (*Module)(nil)

var ErrSpecNotFound = errors.New("spec 不存在")

func specID(sessionID string) string { return "spec-" + sessionID }

func (m *Module) ensureAllSpecs(ctx context.Context) {
	rows, err := m.store.Query(ctx, `SELECT s.id, s.created_at FROM sessions s
		LEFT JOIN specs p ON p.session_id = s.id WHERE p.id IS NULL`)
	if err != nil {
		m.log.Warn("补建 spec 查询失败", "err", err)
		return
	}
	type missing struct {
		id        string
		createdAt int64
	}
	list := make([]missing, 0, 4)
	for rows.Next() {
		var item missing
		if err := rows.Scan(&item.id, &item.createdAt); err != nil {
			_ = rows.Close()
			m.log.Warn("补建 spec 扫描失败", "err", err)
			return
		}
		list = append(list, item)
	}
	_ = rows.Close()
	for _, item := range list {
		_ = m.store.Write(ctx, func(tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO specs(
				id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at)
				VALUES (?, ?, ?, 1, '[]', '[]', ?, ?)`,
				specID(item.id), item.id, corespec.StatusDraft, item.createdAt, item.createdAt)
			return err
		})
	}
}

func (m *Module) getSpecBySession(ctx context.Context, sessionID string) (corespec.Spec, error) {
	var spec corespec.Spec
	var keysJSON, evidenceJSON, constraintsJSON string
	err := m.store.QueryRow(ctx, `SELECT id, session_id, status, version, acceptance_keys, evidence,
		goal, constraints, current, plan, executor_agent_id, state_reason, reopened_count, last_injected_version,
		created_at, updated_at
		FROM specs WHERE session_id = ?`, sessionID).
		Scan(&spec.ID, &spec.SessionID, &spec.Status, &spec.Version, &keysJSON, &evidenceJSON,
			&spec.Goal, &constraintsJSON, &spec.Current, &spec.Plan, &spec.ExecutorAgentID,
			&spec.StateReason, &spec.ReopenedCount, &spec.LastInjectedVersion,
			&spec.CreatedAt, &spec.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return corespec.Spec{}, ErrSpecNotFound
	}
	if err != nil {
		return corespec.Spec{}, fmt.Errorf("查询 spec 失败: %w", err)
	}
	_ = json.Unmarshal([]byte(keysJSON), &spec.AcceptanceKeys)
	_ = json.Unmarshal([]byte(evidenceJSON), &spec.Evidence)
	_ = json.Unmarshal([]byte(constraintsJSON), &spec.Constraints)
	if spec.AcceptanceKeys == nil {
		spec.AcceptanceKeys = []string{}
	}
	if spec.Evidence == nil {
		spec.Evidence = []string{}
	}
	if spec.Constraints == nil {
		spec.Constraints = []string{}
	}
	if spec.ExecutorAgentID == "" {
		spec.ExecutorAgentID = corespec.ExecutorTaskNPC
	}
	return spec, nil
}

// GetBySession 实现 core/spec.Service。
func (m *Module) GetBySession(ctx context.Context, sessionID string) (corespec.Spec, error) {
	return m.getSpecBySession(ctx, sessionID)
}

// CanArchive 实现 core/spec.Service：有运行中任务或验收键缺证据 → 拒绝。
func (m *Module) CanArchive(ctx context.Context, specID string) (corespec.ArchiveCheck, error) {
	var spec corespec.Spec
	var keysJSON, evidenceJSON string
	err := m.store.QueryRow(ctx, `SELECT id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at
		FROM specs WHERE id = ?`, specID).
		Scan(&spec.ID, &spec.SessionID, &spec.Status, &spec.Version, &keysJSON, &evidenceJSON,
			&spec.CreatedAt, &spec.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return corespec.ArchiveCheck{}, ErrSpecNotFound
	}
	if err != nil {
		return corespec.ArchiveCheck{}, err
	}
	_ = json.Unmarshal([]byte(keysJSON), &spec.AcceptanceKeys)
	_ = json.Unmarshal([]byte(evidenceJSON), &spec.Evidence)
	blockers := make([]string, 0, 4)
	taskStatus := make(map[string]string)
	if m.tasks != nil {
		if list, err := m.tasks.List(ctx, spec.SessionID); err == nil {
			for _, task := range list {
				taskStatus[task.ID] = task.Status
				if task.Status == coretask.StatusQueued || task.Status == coretask.StatusRunning {
					blockers = append(blockers, "task:"+task.ID+" is "+task.Status)
				}
			}
		} else {
			blockers = append(blockers, "任务列表不可用: "+err.Error())
		}
	}
	evidenceSet := make(map[string]bool, len(spec.Evidence))
	for _, key := range spec.Evidence {
		evidenceSet[key] = true
	}
	for _, key := range spec.AcceptanceKeys {
		if evidenceSet[key] {
			continue
		}
		// 事件消费者可能晚于任务状态落库；done 任务视为已满足，避免归档竞态。
		if strings.HasPrefix(key, "task:") && taskStatus[strings.TrimPrefix(key, "task:")] == coretask.StatusDone {
			continue
		}
		blockers = append(blockers, "missing evidence: "+key)
	}
	return corespec.ArchiveCheck{Allowed: len(blockers) == 0, Blockers: blockers}, nil
}

func (m *Module) updateSpec(ctx context.Context, sessionID string, mutate func(*corespec.Spec)) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		var spec corespec.Spec
		var keysJSON, evidenceJSON string
		err := tx.QueryRowContext(ctx, `SELECT id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at
			FROM specs WHERE session_id = ?`, sessionID).
			Scan(&spec.ID, &spec.SessionID, &spec.Status, &spec.Version, &keysJSON, &evidenceJSON,
				&spec.CreatedAt, &spec.UpdatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			now := time.Now().UnixMilli()
			spec = corespec.Spec{ID: specID(sessionID), SessionID: sessionID, Status: corespec.StatusDraft,
				Version: 1, AcceptanceKeys: []string{}, Evidence: []string{}, CreatedAt: now, UpdatedAt: now}
			if err := insertSpecTx(ctx, tx, spec); err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			_ = json.Unmarshal([]byte(keysJSON), &spec.AcceptanceKeys)
			_ = json.Unmarshal([]byte(evidenceJSON), &spec.Evidence)
		}
		if spec.AcceptanceKeys == nil {
			spec.AcceptanceKeys = []string{}
		}
		if spec.Evidence == nil {
			spec.Evidence = []string{}
		}
		mutate(&spec)
		spec.Version++
		spec.UpdatedAt = time.Now().UnixMilli()
		keys, _ := json.Marshal(spec.AcceptanceKeys)
		evidence, _ := json.Marshal(spec.Evidence)
		_, err = tx.ExecContext(ctx, `INSERT INTO specs(id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET status=excluded.status, version=excluded.version,
				acceptance_keys=excluded.acceptance_keys, evidence=excluded.evidence, updated_at=excluded.updated_at`,
			spec.ID, spec.SessionID, spec.Status, spec.Version, string(keys), string(evidence), spec.CreatedAt, spec.UpdatedAt)
		return err
	})
}

func insertSpecTx(ctx context.Context, tx *sql.Tx, spec corespec.Spec) error {
	keys, _ := json.Marshal(spec.AcceptanceKeys)
	evidence, _ := json.Marshal(spec.Evidence)
	_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO specs(
		id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		spec.ID, spec.SessionID, spec.Status, spec.Version, string(keys), string(evidence), spec.CreatedAt, spec.UpdatedAt)
	return err
}

func (m *Module) consumeEvents(ch <-chan eventlog.Event) {
	defer m.wg.Done()
	for ev := range ch {
		switch ev.Type {
		case eventlog.TypeTaskCreated:
			var payload struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil || payload.ID == "" || payload.SessionID == "" {
				continue
			}
			if err := m.updateSpec(context.Background(), payload.SessionID, func(spec *corespec.Spec) {
				spec.Status = corespec.StatusPlanning
				key := "task:" + payload.ID
				if !contains(spec.AcceptanceKeys, key) {
					spec.AcceptanceKeys = append(spec.AcceptanceKeys, key)
				}
			}); err != nil {
				m.log.Warn("推进 spec(planning) 失败", "err", err, "taskId", payload.ID)
			}
		case eventlog.TypeTaskUpdated:
			var payload struct {
				ID        string `json:"id"`
				SessionID string `json:"sessionId"`
				Status    string `json:"status"`
			}
			if err := json.Unmarshal(ev.Payload, &payload); err != nil || payload.ID == "" || payload.SessionID == "" {
				continue
			}
			if err := m.updateSpec(context.Background(), payload.SessionID, func(spec *corespec.Spec) {
				key := "task:" + payload.ID
				switch payload.Status {
				case coretask.StatusRunning:
					spec.Status = corespec.StatusExecuting
				case coretask.StatusDone:
					if !contains(spec.Evidence, key) {
						spec.Evidence = append(spec.Evidence, key)
					}
					spec.Status = corespec.StatusVerifying
					if allKeysEvidenced(spec.AcceptanceKeys, spec.Evidence) {
						spec.Status = corespec.StatusVerified
					}
				case coretask.StatusCancelled, coretask.StatusFailed, coretask.StatusInterrupted:
					spec.Status = corespec.StatusConfirmed
				}
			}); err != nil {
				m.log.Warn("推进 spec 失败", "err", err, "taskId", payload.ID)
			}
		}
	}
}

func allKeysEvidenced(keys, evidence []string) bool {
	set := make(map[string]bool, len(evidence))
	for _, item := range evidence {
		set[item] = true
	}
	for _, key := range keys {
		if !set[key] {
			return false
		}
	}
	return true
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// ArchiveBlockersError 携带 canArchive 的 blockers。
type ArchiveBlockersError struct {
	Blockers []string
}

func (e *ArchiveBlockersError) Error() string {
	return "归档被 blockers 拒绝"
}

func (e *ArchiveBlockersError) Unwrap() error { return ErrArchiveBlocked }

func specFromSession(session Session) corespec.Spec {
	return corespec.Spec{
		ID: specID(session.ID), SessionID: session.ID, Status: corespec.StatusDraft, Version: 1,
		AcceptanceKeys: []string{}, Evidence: []string{}, CreatedAt: session.CreatedAt, UpdatedAt: session.CreatedAt,
	}
}

// Archive 先 canArchive，再设置只读；不删除/不复制 messages、artifacts。
func (m *Module) Archive(ctx context.Context, id string) (Session, error) {
	session, err := getSession(ctx, m.store, id)
	if err != nil {
		return Session{}, err
	}
	if session.Archived != 0 {
		return session, nil
	}
	if _, err := m.getSpecBySession(ctx, id); err != nil {
		if !errors.Is(err, ErrSpecNotFound) {
			return Session{}, err
		}
		if err := m.ensureSpecForSession(ctx, id, session.CreatedAt); err != nil {
			return Session{}, err
		}
	}
	check, err := m.CanArchive(ctx, specID(id))
	if err != nil {
		return Session{}, err
	}
	if !check.Allowed {
		return Session{}, &ArchiveBlockersError{Blockers: check.Blockers}
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET archived = 1 WHERE id = ?`, id)
		return err
	}); err != nil {
		return Session{}, err
	}
	if err := m.updateSpec(ctx, id, func(spec *corespec.Spec) {
		spec.Status = corespec.StatusArchived
	}); err != nil {
		return Session{}, err
	}
	return getSession(ctx, m.store, id)
}

// Unarchive 恢复可写；spec 回到 confirmed。
func (m *Module) Unarchive(ctx context.Context, id string) (Session, error) {
	session, err := getSession(ctx, m.store, id)
	if err != nil {
		return Session{}, err
	}
	if session.Archived == 0 {
		return session, nil
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE sessions SET archived = 0 WHERE id = ?`, id)
		return err
	}); err != nil {
		return Session{}, err
	}
	_ = m.updateSpec(ctx, id, func(spec *corespec.Spec) {
		spec.Status = corespec.StatusConfirmed
	})
	return getSession(ctx, m.store, id)
}

// CanArchiveSession 是内部便利方法（debug/测试用）。
func (m *Module) CanArchiveSession(ctx context.Context, sessionID string) (corespec.ArchiveCheck, error) {
	if _, err := m.getSpecBySession(ctx, sessionID); errors.Is(err, ErrSpecNotFound) {
		session, getErr := getSession(ctx, m.store, sessionID)
		if getErr != nil {
			return corespec.ArchiveCheck{}, getErr
		}
		if err := m.ensureSpecForSession(ctx, sessionID, session.CreatedAt); err != nil {
			return corespec.ArchiveCheck{}, err
		}
	}
	return m.CanArchive(ctx, specID(sessionID))
}

// ensureSpecForSession 在创建会话时同步建 spec。
func (m *Module) ensureSpecForSession(ctx context.Context, sessionID string, createdAt int64) error {
	return m.store.Write(ctx, func(tx *sql.Tx) error {
		return insertSpecTx(ctx, tx, corespec.Spec{
			ID: specID(sessionID), SessionID: sessionID, Status: corespec.StatusDraft, Version: 1,
			AcceptanceKeys: []string{}, Evidence: []string{}, CreatedAt: createdAt, UpdatedAt: createdAt,
		})
	})
}
