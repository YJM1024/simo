export interface Session {
  id: string
  parentId: string
  title: string
  createdAt: number
  archived: number | boolean
  pinned: boolean
  ownerAgentId?: string
  /** 服务端持久化的未读标记：true 表示有未读（侧栏显示未读点，不显示数字）。 */
  hasUnread?: boolean
  /**
   * 该会话自身的消息数（不含子会话与内部消息，草稿为 0），由 GET /api/sessions、`?q=` 搜索、
   * /api/sessions/tree 与写接口的 session 对象返回。侧栏行数字以它为准，不再按消息列表条数推算，
   * 因此不受单次消息接口 100 条上限影响。旧服务端或本地草稿没有该字段时不显示行数字。
   */
  messageCount?: number
  /**
   * 仅前端乐观插入的草稿会话（POST /api/sessions 返回 draft=true）。
   * 服务端把草稿放在内存里，首条消息才落库，因此它不能归档、也不进列表接口。
   */
  draft?: boolean
  children?: Session[]
}

export interface SessionPath {
  id: string
  title: string
}

export interface Message {
  id: string
  sessionId: string
  sessionTitle?: string
  role: 'user' | 'agent'
  text: string
  at: number
  status: string
  agentId?: string
  taskId?: string
  batchId?: string
  taskCount?: number
  category?: string
  cards?: Card[]
  attachments?: Array<{ id: string; name?: string; mime?: string }>
  sessionPath?: SessionPath[]
}

export interface Card {
  id: string
  sessionId: string
  messageId: string
  version: number
  status: string
  title?: string
  schema: CardSchema
}

export interface CardSchema {
  title?: string
  blocks?: CardBlock[]
  equivalence?: { chatPrompt?: string }
}

export interface CardBlock {
  id: string
  type: string
  props?: Record<string, unknown>
  actions?: CardAction[]
}

export interface CardAction {
  id: string
  label: string
  action?: string
  route?: string
}

export interface SessionOverview {
  goal?: string
  constraints?: string[]
  current?: string
  completed?: string[]
  pending?: string[]
  notes?: string
  timeline?: Array<{ at: number; text: string }>
  version?: number
  updatedAt?: number
}

export interface Task {
  id: string
  sessionId: string
  title: string
  status: string
  summary?: string
  progress?: number
  createdAt: number
  updatedAt: number
  messageId?: string
}

export interface Artifact {
  id: string
  taskId?: string
  name: string
  mime: string
  size: number
  createdAt: number
}

export interface PermissionState {
  approval: string
  mode: string
  sandbox: string
  policy: string
}

export interface Usage {
  total: { promptTokens?: number; completionTokens?: number; totalTokens: number; estimated?: boolean }
  calls?: number
  byRole?: Record<string, { totalTokens?: number }>
}

export interface StatsTotals {
  tokens: number
  messages: number
  tasks: number
  promptTokens?: number
  completionTokens?: number
  reasoningTokens?: number
}

export interface StatsBucket {
  label: string
  messages: number
  tokens: number
  tasks: number
  start: number
}

export interface SpecTaskItem { id: string; title: string; state: string; updatedAt: number; messageId?: string }
export interface SpecTaskGroup { total: number; items: SpecTaskItem[]; hasMore: boolean }
export interface SpecDeliverable { id: string; name: string; createdAt?: number; kind?: string; previewUrl?: string; downloadUrl?: string }
export interface SessionSpecProjection {
  sessionId: string
  status: string
  revision: number
  updatedAt: number
  goal: string | null
  constraints: string[]
  inputs: string[]
  tasks: { done: SpecTaskGroup; running: SpecTaskGroup; pending: SpecTaskGroup }
  deliverables: { total: number; items: SpecDeliverable[]; hasMore: boolean }
  pendingConfirmations: { total: number }
}

// ---- P1-CONV §17 任务域（F-CONV-009） ----
export type TaskDisplayStatus = 'pending' | 'running' | 'failed' | 'done'
export interface TaskView {
  id: string
  sessionId: string
  batchId?: string
  title: string
  mode: 'plan' | 'loop'
  status: string
  displayStatus: TaskDisplayStatus
  waitingReason?: string
  progress?: number
  attempt?: number
  failReason?: string
  dependsOn?: string[]
  orderIndex?: number
  createdAt: number
  updatedAt: number
  messageId?: string
  stepCount?: number
  doneStepCount?: number
  currentStepSeq?: number
  outputCount?: number
  overdueMinutes?: number
  lastTrace?: TraceItem
}
export interface TraceItem {
  id?: string
  taskId?: string
  stepId?: string
  traceSeq: number
  category: 'thought' | 'action' | 'observation' | string
  tool?: string
  text: string
  at: number
}
export interface TaskStep {
  id: string
  seq: number
  title: string
  status: string
  summary?: string
  failReason?: string
  startedAt?: number
  finishedAt?: number
  traceCount: number
  traces?: TraceItem[]
}
export interface TaskCounts { all: number; pending: number; running: number; failed: number; done: number }
export interface TaskListPayload { ok?: boolean; tasks: TaskView[]; counts: TaskCounts; total: number; hasMore: boolean; nextBefore?: string | null }
export interface TaskDetailPayload {
  task: TaskView
  steps: TaskStep[]
  currentStepId?: string | null
  traces: TraceItem[]
  tracesHasMore: boolean
  deliverables: TaskFile[]
  context?: { goal?: string; inputs?: string[]; constraints?: string[]; historyCount?: number }
  budget?: { maxTokens?: number; maxSteps?: number; usedTokens?: number; usedSteps?: number }
  taskTotal?: number
}
export interface TaskFile { id: string; name: string; mime: string; size: number; typeBadge?: 'doc' | 'sheet' | 'image' | string; createdAt: number; downloadUrl?: string; previewUrl?: string }
export interface DeliverableGroup { taskId: string; taskTitle: string; taskStatus: string; files: TaskFile[] }
export interface DeliverablesPayload { groups: DeliverableGroup[]; total: number; fileCount: number; hasMore: boolean }
export interface TaskGraphNode { id: string; title: string; mode: 'plan' | 'loop'; status: string; displayStatus: TaskDisplayStatus; waitingReason?: string; progress?: number; failReason?: string; dependsOn?: string[] }
export interface TaskGraphEdge { from: string; to: string; joinMode?: string; style?: string }
export interface TaskGraphPayload { nodes: TaskGraphNode[]; edges: TaskGraphEdge[]; layers: Array<{ index: number; nodeIds: string[] }>; total: number }
export type TaskEventType = 'task.created' | 'task.updated' | 'task.step' | 'task.trace' | 'task.report' | 'task.reminder'
export interface TaskEvent {
  type: TaskEventType | 'message.created'
  id: string
  sessionId?: string
  batchId?: string
  stepId?: string
  stepSeq?: number
  traceSeq?: number
  category?: string
  tool?: string
  text?: string
  at?: number
  eventId?: number
  displayStatus?: TaskDisplayStatus
  [key: string]: unknown
}
