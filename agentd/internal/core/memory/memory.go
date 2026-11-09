// Package memory 是内核的记忆端口：chat 通过它检索/提交候选，
// memory 模块实现单写者合并与 FTS5 检索；两个业务模块互不 import。
package memory

import "context"

// Kind 是记忆条目类型。
const (
	KindFact        = "fact"
	KindDecision    = "decision"
	KindRequirement = "requirement"
	KindProgress    = "progress"
	KindExperience  = "experience"
	KindPreference  = "preference"
)

// Scope 是作用域 id：global / domain:<name> / task:<id>。
const (
	ScopeGlobal = "global"
)

// Status 是条目状态。
const (
	StatusActive    = "active"
	StatusDisputed  = "disputed"
	StatusRetracted = "retracted"
	StatusArchived  = "archived"
)

// Authority 是权威轴。
const (
	AuthorityUserConfirmed  = "user_confirmed"
	AuthoritySystemVerified = "system_verified"
	AuthorityInferred       = "inferred"
)

// Source 是来源。
const (
	SourceConversation = "conversation"
	SourceTool         = "tool"
	SourceInferred     = "inferred"
	SourceUser         = "user"
)

// Item 是记忆条目投影。
type Item struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	Scope        string   `json:"scope"`
	Key          string   `json:"key,omitempty"`
	Content      string   `json:"content"`
	Source       string   `json:"source"`
	Authority    string   `json:"authority"`
	Confidence   float64  `json:"confidence"`
	Status       string   `json:"status"`
	Version      int      `json:"version"`
	Importance   int      `json:"importance"`
	Strength     int      `json:"strength"`
	Refs         []string `json:"refs"`
	ConflictWith []string `json:"conflictsWith,omitempty"`
	CreatedAt    int64    `json:"createdAt"`
	UpdatedAt    int64    `json:"updatedAt"`
	Score        *Score   `json:"score,omitempty"`

	Type          string        `json:"type,omitempty"`
	SubType       string        `json:"subType,omitempty"`
	OwnerAgent    string        `json:"ownerAgent,omitempty"`
	Assertion     string        `json:"assertion,omitempty"`
	AttributedTo  string        `json:"attributedTo,omitempty"`
	FactKey       string        `json:"factKey,omitempty"`
	Layer         int           `json:"layer,omitempty"`
	ValidFrom     int64         `json:"validFrom,omitempty"`
	ValidUntil    int64         `json:"validUntil,omitempty"`
	EntityRefs    []string      `json:"entityRefs,omitempty"`
	Attribution   []Attribution `json:"attribution,omitempty"`
	CanonicalRefs []string      `json:"canonicalRefs,omitempty"`
	Cite          []string      `json:"cite,omitempty"`
}

type Attribution struct {
	AttributedTo string  `json:"attributedTo"`
	Stance       string  `json:"stance"`
	Confidence   float64 `json:"confidence,omitempty"`
	Source       string  `json:"source,omitempty"`
}

// Score 是检索分数（可解释）。
type Score struct {
	Relevance  float64 `json:"relevance"`
	Importance float64 `json:"importance"`
	Recency    float64 `json:"recency"`
	Strength   float64 `json:"strength"`
	Total      float64 `json:"total"`
}

// Candidate 是唯一写入口：调用方只能提交候选，由 memory 模块单写者合并。
type Candidate struct {
	Kind       string
	Scope      string
	Key        string
	Content    string
	Source     string
	Authority  string
	Confidence float64
	Importance int
	Refs       []string
	// Mode: assert（断言/新增）| replace（显式改成）| retract（忘掉）
	Mode string
	// TargetID 可选；为空时由合并器按 scope/kind/key 找最近 active。
	TargetID string

	Type          string
	SubType       string
	OwnerAgent    string
	Assertion     string
	AttributedTo  string
	FactKey       string
	EntityRefs    []string
	CanonicalRefs []string
	Sensitivity   string
}

// SubmitResult 是候选合并回执。
type SubmitResult struct {
	Item       Item   `json:"item"`
	Outcome    string `json:"outcome"` // accepted / merged / replaced / disputed / retracted / ignored
	ConflictID string `json:"conflictId,omitempty"`
}

// SearchRequest 是检索请求（scope 链 + 查询 + 配额）。
type SearchRequest struct {
	Query    string
	Scopes   []string
	Limit    int
	MaxChars int
}

// SearchResult 是检索结果。
type SearchResult struct {
	Items  []Item   `json:"items"`
	Query  string   `json:"query"`
	Scopes []string `json:"scopes,omitempty"`
	Budget int      `json:"maxChars"`
}

// ItemFilter 是只读列表过滤。
type ItemFilter struct {
	Scope  string
	Status string
	Limit  int
}

// ScopeInfo 是作用域统计。
type ScopeInfo struct {
	Scope string `json:"scope"`
	Count int    `json:"count"`
}

// Conflict 是 disputed 成对冲突视图（m3-contract §4 API 形状）。
type Conflict struct {
	ID        string `json:"id"`
	Scope     string `json:"scope"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	Items     []Item `json:"items"`
	Reason    string `json:"reason"`
	AskCount  int    `json:"askCount"`
	AskPolicy string `json:"askPolicy"`
	Deferred  bool   `json:"deferred"`
	CreatedAt int64  `json:"createdAt"`
}

// Service 是 chat 可见的记忆端口。
type Service interface {
	Submit(ctx context.Context, candidate Candidate) (SubmitResult, error)
	Search(ctx context.Context, req SearchRequest) (SearchResult, error)
	Items(ctx context.Context, filter ItemFilter) ([]Item, error)
	Scopes(ctx context.Context) ([]ScopeInfo, error)
	Conflicts(ctx context.Context) ([]Conflict, error)
	MemoryEntities(ctx context.Context, kind, query string, limit int) ([]map[string]any, error)
	MemoryGraph(ctx context.Context, entityID string, depth int) (map[string]any, error)
	MemoryPyramid(ctx context.Context, entityID string, level int, view string) (map[string]any, error)
	AgentMemory(ctx context.Context, agentID string, limit int) ([]map[string]any, error)
}
