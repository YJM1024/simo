import type { TaskDetailPayload, TaskDisplayStatus, TaskGraphNode, TaskGraphPayload, TaskStep, TaskView, TraceItem } from './types'

/**
 * 任务数据入口的唯一归一化点（CHG-CONV-007 T04）。
 * N2/N3/N8 的必返字段在旧兼容响应或 WS 合并结果里可能缺失，组件只读归一化后的对象，
 * 因此缺 `deliverables`、`currentStepId`、`traces` 时不会再抛 TypeError。
 */

const DISPLAY_STATUS: TaskDisplayStatus[] = ['pending', 'running', 'failed', 'done']
const TRACE_CATEGORIES: TraceItem['category'][] = ['think', 'action', 'observe', 'tool', 'text']

export function displayStatusOf(status: string | undefined): TaskDisplayStatus {
  if (status === 'failed' || status === 'cancelled' || status === 'interrupted') return 'failed'
  if (status === 'done' || status === 'completed') return 'done'
  if (status === 'running') return 'running'
  return 'pending'
}

function isDisplayStatus(value: unknown): value is TaskDisplayStatus {
  return typeof value === 'string' && (DISPLAY_STATUS as string[]).includes(value)
}

function isTraceCategory(value: unknown): value is TraceItem['category'] {
  return typeof value === 'string' && (TRACE_CATEGORIES as string[]).includes(value)
}

function normalizeMode(value: unknown): TaskView['mode'] {
  // 旧数据里的 loop 是 explore 的前身；后端契约只接受 plan 与 explore。
  return value === 'explore' || value === 'loop' ? 'explore' : 'plan'
}

export function normalizeTaskView(raw: (Partial<TaskView> & { mode?: unknown }) | null | undefined, fallbackSessionId = ''): TaskView {
  const source = raw ?? {}
  const createdAt = typeof source.createdAt === 'number' ? source.createdAt : 0
  return {
    ...source,
    id: typeof source.id === 'string' ? source.id : '',
    sessionId: typeof source.sessionId === 'string' ? source.sessionId : fallbackSessionId,
    title: typeof source.title === 'string' && source.title ? source.title : '任务',
    mode: normalizeMode(source.mode),
    status: typeof source.status === 'string' ? source.status : 'queued',
    displayStatus: isDisplayStatus(source.displayStatus) ? source.displayStatus : displayStatusOf(source.status),
    createdAt,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : createdAt,
  }
}

type RawTrace = Omit<Partial<TraceItem>, 'category' | 'seq'> & { seq?: number; traceSeq?: number; category?: string }

const LEGACY_CATEGORY: Record<string, TraceItem['category']> = { thought: 'think', observation: 'observe' }

export function normalizeTrace(raw: RawTrace | null | undefined): TraceItem {
  const source = raw ?? {}
  const seq = typeof source.seq === 'number' ? source.seq : (typeof source.traceSeq === 'number' ? source.traceSeq : 0)
  const category = typeof source.category === 'string' && LEGACY_CATEGORY[source.category] ? LEGACY_CATEGORY[source.category] : source.category
  return {
    ...source,
    id: typeof source.id === 'string' ? source.id : undefined,
    taskId: typeof source.taskId === 'string' ? source.taskId : undefined,
    stepId: typeof source.stepId === 'string' ? source.stepId : undefined,
    seq,
    category: isTraceCategory(category) ? category : 'action',
    tool: typeof source.tool === 'string' ? source.tool : undefined,
    text: typeof source.text === 'string' ? source.text : '',
    at: typeof source.at === 'number' ? source.at : 0,
  }
}

function normalizeStep(raw: Partial<TaskStep> | null | undefined): TaskStep {
  const source = raw ?? {}
  return {
    ...source,
    id: typeof source.id === 'string' ? source.id : '',
    seq: typeof source.seq === 'number' ? source.seq : 0,
    title: typeof source.title === 'string' ? source.title : '',
    status: typeof source.status === 'string' ? source.status : 'pending',
    traceCount: typeof source.traceCount === 'number' ? source.traceCount : 0,
  }
}

export function normalizeTaskDetail(raw: Partial<TaskDetailPayload> | null | undefined, fallbackSessionId = ''): TaskDetailPayload {
  const source = raw ?? {}
  return {
    ...source,
    task: normalizeTaskView(source.task, fallbackSessionId),
    steps: Array.isArray(source.steps) ? source.steps.map(normalizeStep) : [],
    currentStepId: typeof source.currentStepId === 'string' ? source.currentStepId : null,
    traces: Array.isArray(source.traces) ? source.traces.map(normalizeTrace) : [],
    tracesHasMore: source.tracesHasMore === true,
    deliverables: Array.isArray(source.deliverables) ? source.deliverables : [],
  }
}

function normalizeGraphNode(raw: Partial<TaskGraphNode> | null | undefined): TaskGraphNode {
  const source = raw ?? {}
  return {
    ...source,
    id: typeof source.id === 'string' ? source.id : '',
    title: typeof source.title === 'string' ? source.title : '',
    mode: normalizeMode(source.mode),
    status: typeof source.status === 'string' ? source.status : 'queued',
    displayStatus: isDisplayStatus(source.displayStatus) ? source.displayStatus : displayStatusOf(source.status),
    progress: typeof source.progress === 'number' ? source.progress : undefined,
    failReason: typeof source.failReason === 'string' ? source.failReason : undefined,
    dependsOn: Array.isArray(source.dependsOn) ? source.dependsOn : undefined,
  }
}

export function normalizeTaskGraph(raw: Partial<TaskGraphPayload> | null | undefined): TaskGraphPayload {
  const source = raw ?? {}
  return {
    nodes: Array.isArray(source.nodes) ? source.nodes.map(normalizeGraphNode) : [],
    edges: Array.isArray(source.edges) ? source.edges : [],
    layers: Array.isArray(source.layers) ? source.layers : [],
    total: typeof source.total === 'number' ? source.total : (source.nodes?.length ?? 0),
  }
}
