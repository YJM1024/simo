package chat

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// Message 是消息投影（契约 §3 字段；role/status 与前端 v0.1 兼容）。
type Message struct {
	ID           string            `json:"id"`
	SessionID    string            `json:"sessionId"`
	SessionTitle string            `json:"sessionTitle,omitempty"`
	Role         string            `json:"role"`
	Text         string            `json:"text"`
	At           int64             `json:"at"`
	Status       string            `json:"status"`
	Attachments  []Attachment      `json:"attachments"`
	TaskID       string            `json:"taskId,omitempty"`
	WorkflowID   string            `json:"workflowId,omitempty"`
	Tool         string            `json:"tool,omitempty"`
	ApprovalID   string            `json:"approvalId,omitempty"`
	Category     string            `json:"category"`
	SessionPath  []SessionPathItem `json:"sessionPath"`
	ReplyToID    string            `json:"replyToId,omitempty"`
	ReplyTo      *ReplySnapshot    `json:"replyTo,omitempty"`
	AgentID      string            `json:"agentId,omitempty"`
	Cards        []Card            `json:"cards,omitempty"`
}

// ReplySnapshot 是被引用消息的只读快照（M15，跨会话允许）。
type ReplySnapshot struct {
	ID           string `json:"id"`
	Role         string `json:"role"`
	Text         string `json:"text"`
	SessionID    string `json:"sessionId"`
	SessionTitle string `json:"sessionTitle,omitempty"`
}

// SessionPathItem 是会话路径中的一级（根→当前）。
type SessionPathItem struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// Attachment 是 uploads/message_attachments 的公开投影；rel_path/session_id 仅内部用。
type Attachment struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"createdAt"`
	SessionID string `json:"-"`
	RelPath   string `json:"-"`
}

const (
	RoleUser  = "user"
	RoleAgent = "agent"

	StatusStreaming = "streaming"
	StatusDone      = "done"
	StatusError     = "error"
	StatusRetracted = "retracted"

	// defaultSessionID 与 sessions 模块的默认会话一致（字符串重复是刻意的：
	// 模块间禁止 import，不能从 sessions 包取常量）。
	defaultSessionID = "main"
)

type statusPayload struct {
	State string `json:"state"` // thinking | idle
}

type deltaPayload struct {
	ID    string `json:"id"`
	Delta string `json:"delta"`
}

type donePayload struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

func newID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return prefix + "-" + time.Now().Format("150405.000000")
	}
	return prefix + "-" + hex.EncodeToString(buf)
}
