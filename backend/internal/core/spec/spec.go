// Package spec 是 SpecCore 最小端口：spec 与会话 1:1，仅在内部使用，不对用户暴露。
package spec

import "context"

// 状态机（M6 最小）。
const (
	StatusDraft     = "draft"
	StatusConfirmed = "confirmed"
	StatusPlanning  = "planning"
	StatusExecuting = "executing"
	StatusVerifying = "verifying"
	StatusVerified  = "verified"
	StatusArchived  = "archived"
)

const (
	ExecutorTaskNPC = "agent:task-npc"
	ExecutorSimo    = "agent:simo"
)

// Spec 是会话的验收核心投影。
type Spec struct {
	ID                  string   `json:"id"`
	SessionID           string   `json:"sessionId"`
	Status              string   `json:"status"`
	Version             int      `json:"version"`
	Goal                string   `json:"goal,omitempty"`
	Constraints         []string `json:"constraints,omitempty"`
	Current             string   `json:"current,omitempty"`
	Plan                string   `json:"plan,omitempty"`
	AcceptanceKeys      []string `json:"acceptanceKeys"`
	Evidence            []string `json:"evidence"`
	ExecutorAgentID     string   `json:"executorAgentId"`
	StateReason         string   `json:"stateReason,omitempty"`
	ReopenedCount       int      `json:"reopenedCount"`
	LastInjectedVersion int      `json:"lastInjectedVersion,omitempty"`
	CreatedAt           int64    `json:"createdAt"`
	UpdatedAt           int64    `json:"updatedAt"`
}

// ArchiveCheck 是 canArchive 只读判定结果。
type ArchiveCheck struct {
	Allowed  bool     `json:"allowed"`
	Blockers []string `json:"blockers"`
}

// Service 是内部 SpecCore 端口；sessions 模块实现。
type Service interface {
	GetBySession(ctx context.Context, sessionID string) (Spec, error)
	Ensure(ctx context.Context, sessionID string) (Spec, error)
	CanArchive(ctx context.Context, specID string) (ArchiveCheck, error)
	Transition(ctx context.Context, sessionID, to, reason, actor string) (Spec, error)
	Reopen(ctx context.Context, sessionID, reason, actor string) (Spec, error)
	SetExecutorAgent(ctx context.Context, sessionID, agentID string) (Spec, error)
	ContextForTurn(ctx context.Context, sessionID string) (string, error)
}
