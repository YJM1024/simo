package sessions

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	corespec "agentd/internal/core/spec"
)

var ErrInvalidSpecTransition = errors.New("非法的 spec 状态迁移")

var specTransitions = map[string]map[string]bool{
	corespec.StatusDraft:     {corespec.StatusConfirmed: true},
	corespec.StatusConfirmed: {corespec.StatusPlanning: true, corespec.StatusArchived: true},
	corespec.StatusPlanning:  {corespec.StatusExecuting: true, corespec.StatusArchived: true},
	corespec.StatusExecuting: {corespec.StatusVerifying: true, corespec.StatusPlanning: true, corespec.StatusArchived: true},
	corespec.StatusVerifying: {corespec.StatusVerified: true, corespec.StatusPlanning: true, corespec.StatusArchived: true},
	corespec.StatusVerified:  {corespec.StatusArchived: true},
	corespec.StatusArchived:  {},
}

// Ensure 保证会话 1:1 Spec 存在（M18）。
func (m *Module) Ensure(ctx context.Context, sessionID string) (corespec.Spec, error) {
	spec, err := m.getSpecBySession(ctx, sessionID)
	if err == nil {
		return spec, nil
	}
	if !errors.Is(err, ErrSpecNotFound) {
		return corespec.Spec{}, err
	}
	session, err := getSession(ctx, m.store, sessionID)
	if err != nil {
		return corespec.Spec{}, err
	}
	if err := m.ensureSpecForSession(ctx, sessionID, session.CreatedAt); err != nil {
		return corespec.Spec{}, err
	}
	return m.getSpecBySession(ctx, sessionID)
}

// Transition 执行状态机迁移；非法迁移返回错误且状态不变。
func (m *Module) Transition(ctx context.Context, sessionID, to, reason, actor string) (corespec.Spec, error) {
	sessionID = strings.TrimSpace(sessionID)
	to = strings.TrimSpace(to)
	spec, err := m.Ensure(ctx, sessionID)
	if err != nil {
		return corespec.Spec{}, err
	}
	if !specTransitions[spec.Status][to] {
		m.emitSpecEvent(ctx, "spec.transition_rejected", map[string]any{
			"specId": spec.ID, "sessionId": sessionID, "from": spec.Status, "to": to, "reason": reason,
		})
		return corespec.Spec{}, fmt.Errorf("%w: %s -> %s", ErrInvalidSpecTransition, spec.Status, to)
	}
	if actor == "" {
		actor = "system"
	}
	nextVersion := spec.Version + 1
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE specs SET status = ?, version = ?, state_reason = ?, updated_at = ?
			WHERE session_id = ?`, to, nextVersion, reason, now, sessionID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO spec_transitions(
			id, spec_id, session_id, from_status, to_status, version, reason, actor, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newID("st"), spec.ID, sessionID, spec.Status, to, nextVersion, reason, actor, now)
		return err
	}); err != nil {
		return corespec.Spec{}, err
	}
	m.emitSpecEvent(ctx, "spec.state_changed", map[string]any{
		"specId": spec.ID, "sessionId": sessionID, "from": spec.Status, "to": to,
		"reason": reason, "version": nextVersion, "actor": actor,
	})
	return m.getSpecBySession(ctx, sessionID)
}

// Reopen 从任意非 draft 状态重新进入 executing（M18）。
func (m *Module) Reopen(ctx context.Context, sessionID, reason, actor string) (corespec.Spec, error) {
	spec, err := m.Ensure(ctx, sessionID)
	if err != nil {
		return corespec.Spec{}, err
	}
	if spec.Status == corespec.StatusDraft {
		return corespec.Spec{}, fmt.Errorf("%w: draft 尚未开始", ErrInvalidSpecTransition)
	}
	if actor == "" {
		actor = "user"
	}
	nextVersion := spec.Version + 1
	now := time.Now().UnixMilli()
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE specs SET status = ?, version = ?, state_reason = ?,
			reopened_count = reopened_count + 1, updated_at = ? WHERE session_id = ?`,
			corespec.StatusExecuting, nextVersion, reason, now, sessionID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO spec_transitions(
			id, spec_id, session_id, from_status, to_status, version, reason, actor, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newID("st"), spec.ID, sessionID, spec.Status, corespec.StatusExecuting, nextVersion, reason, actor, now)
		return err
	}); err != nil {
		return corespec.Spec{}, err
	}
	m.emitSpecEvent(ctx, "spec.reopened", map[string]any{
		"specId": spec.ID, "sessionId": sessionID, "reason": reason,
		"oldVersion": spec.Version, "newVersion": nextVersion,
	})
	return m.getSpecBySession(ctx, sessionID)
}

// SetExecutorAgent 配置子任务执行者。
func (m *Module) SetExecutorAgent(ctx context.Context, sessionID, agentID string) (corespec.Spec, error) {
	agentID = strings.TrimSpace(agentID)
	switch agentID {
	case "simo", corespec.ExecutorSimo:
		agentID = corespec.ExecutorSimo
	case "task-npc", corespec.ExecutorTaskNPC:
		agentID = corespec.ExecutorTaskNPC
	default:
		return corespec.Spec{}, fmt.Errorf("%w: 未知执行者 %s", ErrInvalid, agentID)
	}
	spec, err := m.Ensure(ctx, sessionID)
	if err != nil {
		return corespec.Spec{}, err
	}
	if err := m.store.Write(ctx, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE specs SET executor_agent_id = ?, version = version + 1, updated_at = ?
			WHERE session_id = ?`, agentID, time.Now().UnixMilli(), sessionID)
		return err
	}); err != nil {
		return corespec.Spec{}, err
	}
	m.emitSpecEvent(ctx, "spec.updated", map[string]any{
		"specId": spec.ID, "sessionId": sessionID, "changed": []string{"executorAgentId"},
	})
	return m.getSpecBySession(ctx, sessionID)
}

// ContextForTurn 返回内部注入块（只在模型上下文中使用，不进入用户消息）。
func (m *Module) ContextForTurn(ctx context.Context, sessionID string) (string, error) {
	spec, err := m.Ensure(ctx, sessionID)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("[spec:internal]\n")
	b.WriteString("sessionId=" + spec.SessionID + "  version=" + fmt.Sprint(spec.Version) + "  status=" + spec.Status + "\n")
	b.WriteString("goal: " + spec.Goal + "\n")
	b.WriteString("current: " + spec.Current + "\n")
	if len(spec.Constraints) > 0 {
		b.WriteString("constraints:\n")
		for _, item := range spec.Constraints {
			b.WriteString("- " + item + "\n")
		}
	}
	if len(spec.AcceptanceKeys) > 0 {
		b.WriteString("acceptance: [")
		for i, key := range spec.AcceptanceKeys {
			if i > 0 {
				b.WriteString(", ")
			}
			state := "pending"
			if contains(spec.Evidence, key) {
				state = "evidenced"
			}
			b.WriteString(key + ":" + state)
		}
		b.WriteString("]\n")
	}
	b.WriteString("[/spec:internal]")
	return b.String(), nil
}

func (m *Module) emitSpecEvent(ctx context.Context, typ string, payload map[string]any) {
	if m.events == nil {
		return
	}
	if _, err := m.events.Append(ctx, typ, payload); err != nil {
		m.log.Debug("写 spec 事件失败", "err", err, "type", typ)
	}
}

func newID(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}
