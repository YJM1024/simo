// Package session 是会话端口：chat 通过它读写会话树，不 import sessions 模块。
package session

import "context"

// Session 是会话投影；Children 只在 tree 响应中填充。
type Session struct {
	ID           string    `json:"id"`
	ParentID     string    `json:"parentId"`
	Title        string    `json:"title"`
	CreatedAt    int64     `json:"createdAt"`
	Archived     int64     `json:"archived"`
	Pinned       bool      `json:"pinned"`
	OwnerAgentID string    `json:"ownerAgentId,omitempty"`
	Children     []Session `json:"children,omitempty"`
}

// Service 是 chat 可见的会话端口。
type Service interface {
	Get(ctx context.Context, id string) (Session, error)
	List(ctx context.Context) ([]Session, error)
	Tree(ctx context.Context) ([]Session, error)
	Create(ctx context.Context, parentID, title string) (Session, error)
	Rename(ctx context.Context, id, title string) (Session, error)
	// DescendantIDs 返回 id 及全部后代的 id；必须防环并限制深度。
	DescendantIDs(ctx context.Context, id string, maxDepth int) ([]string, error)
}

// DraftService 是可选的懒创建能力；sessions 实现，chat 在首条写入前物化。
type DraftService interface {
	CreateDraft(ctx context.Context, parentID, title string) (Session, error)
	MaterializeDraft(ctx context.Context, id string) (Session, bool, error)
	IsDraft(ctx context.Context, id string) bool
}
