// Package task 是内核的任务边界接口：chat 模块通过它创建后台任务，
// tasks 模块实现它；两个业务模块互不 import（契约 §9）。
package task

import "context"

// 任务状态。
const (
	StatusPending     = "pending"
	StatusBlocked     = "blocked"
	StatusQueued      = "queued"
	StatusRunning     = "running"
	StatusDone        = "done"
	StatusFailed      = "failed"
	StatusCancelled   = "cancelled"
	StatusInterrupted = "interrupted"
)

// Workflow 是一个会话内的任务编排（M10）。
type Workflow struct {
	ID          string `json:"id"`
	SessionID   string `json:"sessionId"`
	Title       string `json:"title"`
	Status      string `json:"status"` // draft|running|paused|done|failed|cancelled
	PlanJSON    string `json:"planJson,omitempty"`
	Tasks       []Task `json:"tasks,omitempty"`
	Progress    int    `json:"progress"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
	Summary     string `json:"summary,omitempty"`
	StateReason string `json:"stateReason,omitempty"`
}

// NewWorkflowTask 是工作流内任务输入。
type NewWorkflowTask struct {
	Key        string
	Title      string
	Payload    string
	DependsOn  []string
	WriteScope []string
	Estimate   int
}

// NewWorkflow 是工作流创建输入。
type NewWorkflow struct {
	SessionID string
	Title     string
	PlanJSON  string
	Tasks     []NewWorkflowTask
}

// WorkflowService 是 M10 编排端口；tasks 模块实现。
type WorkflowService interface {
	CreateWorkflow(ctx context.Context, input NewWorkflow) (Workflow, error)
	ListWorkflows(ctx context.Context, sessionID string) ([]Workflow, error)
	GetWorkflow(ctx context.Context, id string) (Workflow, error)
	PauseWorkflow(ctx context.Context, id string) (Workflow, error)
	ResumeWorkflow(ctx context.Context, id string) (Workflow, error)
	CancelWorkflow(ctx context.Context, id string) (Workflow, error)
	MarkWorkflowPartial(ctx context.Context, id, summary string) (Workflow, error)
}

// Phase 是任务阶段（M5）。
type Phase struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"` // pending | running | done | failed
}

// Step 是阶段内的一个步骤（M5；独立投影便于前端逐步展示）。
type Step struct {
	ID      string `json:"id"`
	PhaseID string `json:"phaseId,omitempty"`
	Title   string `json:"title"`
	Status  string `json:"status"`
}

const (
	ArtifactDeliveryKindUser     = "user_delivery"
	ArtifactDeliveryKindInternal = "internal"

	ArtifactStorageLegacy    = "legacy_artifacts"
	ArtifactStorageWorkspace = "workspace"
)

// Artifact 是任务产物元数据（M5）。
type Artifact struct {
	ID            string `json:"id"`
	TaskID        string `json:"taskId"`
	Name          string `json:"name"`
	Mime          string `json:"mime"`
	Size          int64  `json:"size"`
	CreatedAt     int64  `json:"createdAt"`
	UserDelivery  bool   `json:"userDelivery"`
	DeliveryKind  string `json:"deliveryKind"`
	StorageScope  string `json:"storageScope,omitempty"`
	WorkspacePath string `json:"-"`
	PreviewURL    string `json:"previewUrl,omitempty"`
	DownloadURL   string `json:"downloadUrl,omitempty"`
}

// Task 是后台任务投影。
type Task struct {
	ID        string `json:"id"`
	SessionID string `json:"sessionId"`
	Title     string `json:"title"`
	Kind      string `json:"kind"`
	Status    string `json:"status"`
	// DisplayStatus 是 8 个存储态映射出的 4 个展示态（pending/running/done/failed），只读投影。
	DisplayStatus   string     `json:"displayStatus"`
	Payload         string     `json:"payload,omitempty"`
	Phases          []Phase    `json:"phases"`
	Steps           []Step     `json:"steps"`
	Progress        int        `json:"progress"`
	Summary         string     `json:"summary,omitempty"`
	Outcome         string     `json:"outcome,omitempty"`
	Attempt         int        `json:"attempt"`
	Artifacts       []Artifact `json:"artifacts,omitempty"`
	WorkflowID      string     `json:"workflowId,omitempty"`
	DependsOn       []string   `json:"dependsOn,omitempty"`
	OrderIndex      int        `json:"orderIndex,omitempty"`
	ReportMessageID string     `json:"reportMessageId,omitempty"`
	BudgetJSON      string     `json:"-"`
	StateReason     string     `json:"stateReason,omitempty"`
	ExecutorAgentID string     `json:"executorAgentId,omitempty"`
	CreatedAt       int64      `json:"createdAt"`
	UpdatedAt       int64      `json:"updatedAt"`

	// P1-CONV-009（tasks v8 列）
	Mode               string   `json:"mode,omitempty"`
	BatchID            string   `json:"batchId,omitempty"`
	Goal               string   `json:"goal,omitempty"`
	Inputs             []string `json:"inputs,omitempty"`
	Constraints        []string `json:"constraints,omitempty"`
	ContextJSON        string   `json:"-"`
	WaitingReason      string   `json:"waitingReason,omitempty"`
	WaitingSince       int64    `json:"waitingSince,omitempty"`
	StartedAt          int64    `json:"startedAt,omitempty"`
	FinishedAt         int64    `json:"finishedAt,omitempty"`
	FailReason         string   `json:"failReason,omitempty"`
	DeadlineAt         int64    `json:"deadlineAt,omitempty"`
	DeadlineRemindedAt int64    `json:"deadlineRemindedAt,omitempty"`
	TriggerCount       int      `json:"triggerCount,omitempty"`
}

// NewTask 是创建输入。
type NewTask struct {
	SessionID string
	Title     string
	Kind      string
	Payload   string
}

// Service 是 chat 可见的任务端口；由 tasks 模块实现。
type Service interface {
	Create(ctx context.Context, input NewTask) (Task, error)
	List(ctx context.Context, sessionID string) ([]Task, error)
	Get(ctx context.Context, id string) (Task, error)
}

// ExecutionRequest 是真实任务执行器输入（M10.1）。
type ExecutionRequest struct {
	Task         Task
	Description  string
	Dependencies []Task
	Artifacts    []Artifact
	MaxSteps     int
	MaxTokens    int
}

// ExecutionResult 是真实任务执行器输出。
type ExecutionResult struct {
	Report  string
	Summary string
	Steps   int
	Tokens  int
	Paused  bool
	Budget  bool
	// Permissions 是执行中遇到的权限拒绝（路径越界/工具白名单/禁网/禁子进程）。
	Permissions []PermissionDenied
}

// PermissionDenied 是一次权限拒绝，由 tasks 模块写成 observe 轨迹（403 permission_denied）。
type PermissionDenied struct {
	Tool   string
	Path   string
	Reason string
}

// BatchTaskInput 是批量创建里的单个任务；字段与 POST /api/sessions/{id}/tasks 请求体一致。
type BatchTaskInput struct {
	Key         string   `json:"key"`
	Title       string   `json:"title"`
	Mode        string   `json:"mode"`
	Goal        string   `json:"goal"`
	Inputs      []string `json:"inputs"`
	Constraints []string `json:"constraints"`
	Steps       []string `json:"steps"`
	DependsOn   []string `json:"dependsOn"`
	JoinMode    string   `json:"joinMode"`
	DeadlineAt  int64    `json:"deadlineAt"`
	Payload     string   `json:"payload"`
}

// BatchCreateInput 是批量创建请求体。
type BatchCreateInput struct {
	Mode             string           `json:"mode"`
	Goal             string           `json:"goal"`
	Inputs           []string         `json:"inputs"`
	Constraints      []string         `json:"constraints"`
	Kind             string           `json:"kind"`
	ClientMutationID string           `json:"clientMutationId"`
	Tasks            []BatchTaskInput `json:"tasks"`
	Title            string           `json:"title"`
	Payload          string           `json:"payload"`
}

// BatchCreateResult 是批量创建响应。
type BatchCreateResult struct {
	BatchID    string         `json:"batchId"`
	Tasks      []Task         `json:"tasks"`
	MessageID  string         `json:"messageId"`
	Counts     map[string]int `json:"counts"`
	Idempotent bool           `json:"idempotent"`
	Total      int            `json:"total"`
}

// BatchCreator 是任务批量创建端口；chat 的 DELEGATE 通过它建批次，不依赖 tasks 模块类型。
type BatchCreator interface {
	CreateBatch(ctx context.Context, sessionID string, input BatchCreateInput) (BatchCreateResult, error)
}

// Executor 由 chat 模块实现（LLM + 工具 + M9 审批），tasks 模块调用。
type Executor interface {
	ExecuteTask(ctx context.Context, request ExecutionRequest) (ExecutionResult, error)
}
