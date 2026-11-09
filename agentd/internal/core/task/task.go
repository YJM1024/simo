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

// Artifact 是任务产物元数据（M5）。
type Artifact struct {
	ID        string `json:"id"`
	TaskID    string `json:"taskId"`
	Name      string `json:"name"`
	Mime      string `json:"mime"`
	Size      int64  `json:"size"`
	CreatedAt int64  `json:"createdAt"`
}

// Task 是后台任务投影。
type Task struct {
	ID              string     `json:"id"`
	SessionID       string     `json:"sessionId"`
	Title           string     `json:"title"`
	Kind            string     `json:"kind"`
	Status          string     `json:"status"`
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
}

// Executor 由 chat 模块实现（LLM + 工具 + M9 审批），tasks 模块调用。
type Executor interface {
	ExecuteTask(ctx context.Context, request ExecutionRequest) (ExecutionResult, error)
}
