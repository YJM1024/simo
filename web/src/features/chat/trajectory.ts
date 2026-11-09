// features/chat/trajectory.ts —— UI-2 轨迹视图纯逻辑（事件投影 + 降级）
//
// 数据来源优先级：GET /api/sessions/{id}/trajectory → 实时 WS 帧 → 消息/工具调用降级。
// 轨迹不持有第二份真相；这里只做事件归一化、筛选、合并与压缩摘要。

import type { ChatMessage, WireFrame } from '../../platform/types.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'
import type { ToolCallInfo } from './toolcalls.ts'

export type TrajectoryKind = 'message' | 'tool' | 'approval' | 'task' | 'plan' | 'compaction' | 'retry' | 'error'
export type TrajectoryFilter = 'all' | 'tool' | 'approval' | 'task' | 'compaction' | 'error'

export interface TrajectorySource {
  sessionId?: string
  taskId?: string
  messageId?: string
}

export interface TrajectoryEvent {
  id: string
  at: number
  kind: TrajectoryKind
  title: string
  status?: string
  summary: string
  source: TrajectorySource
  /** 工具卡片数据/审批/压缩等详情（脱敏后渲染） */
  detail: unknown
  /** 服务端 seq（分页游标；降级事件为 null） */
  seq: number | null
}

const FILTER_KIND: Record<Exclude<TrajectoryFilter, 'all'>, TrajectoryKind[]> = {
  tool: ['tool'],
  approval: ['approval'],
  task: ['task', 'plan', 'retry'],
  compaction: ['compaction'],
  error: ['error'],
}

function pickSource(value: Record<string, unknown>): TrajectorySource {
  return {
    sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id'),
    taskId: readString(value, 'taskId') ?? readString(value, 'task_id'),
    messageId: readString(value, 'messageId') ?? readString(value, 'message_id'),
  }
}

function clampText(value: string, max = 160): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** 压缩摘要（只使用事件真实数字；无事件则不显示）。 */
export function compactionSummary(data: unknown): string | null {
  if (!isRecord(data)) return null
  const removedMessages = readNumber(data, 'removedMessages') ?? readNumber(data, 'removed_messages') ?? 0
  const removedToolOutputs = readNumber(data, 'removedToolOutputs') ?? readNumber(data, 'removed_tool_outputs') ?? 0
  const before = readNumber(data, 'beforeTokens') ?? readNumber(data, 'before_tokens') ?? 0
  const after = readNumber(data, 'afterTokens') ?? readNumber(data, 'after_tokens') ?? 0
  if (removedMessages === 0 && removedToolOutputs === 0 && before === 0) return null
  const saved = before > after && after > 0 ? before - after : 0
  const parts: string[] = []
  if (removedMessages > 0) parts.push(`${removedMessages} 条消息`)
  if (removedToolOutputs > 0) parts.push(`${removedToolOutputs} 条工具结果`)
  const tail = saved > 0 ? `，约节省 ${saved >= 1000 ? `${Math.round(saved / 1000)}k` : saved} tokens` : ''
  return `已压缩 ${parts.join('、')}${tail}`
}

function baseEvent(
  id: string,
  at: number,
  kind: TrajectoryKind,
  title: string,
  summary: string,
  detail: unknown = null,
  source: TrajectorySource = {},
  status?: string,
  seq: number | null = null,
): TrajectoryEvent {
  return { id, at, kind, title, summary, detail, source, ...(status ? { status } : {}), seq }
}

/** WS 帧 → 轨迹事件（未知帧返回 []，不崩）。 */
export function normalizeTrajectoryFrame(frame: WireFrame, now = Date.now()): TrajectoryEvent[] {
  const data = isRecord(frame.data) ? frame.data : {}
  const at = readNumber(data, 'at') ?? now
  const id = readString(data, 'id') ?? readString(data, 'toolCallId') ?? `${frame.type}:${at}`
  const source = pickSource(data)
  const type = frame.type

  if (type === 'message.created' || type === 'reply.created') {
    const text = readString(data, 'text') ?? ''
    return [baseEvent(id, at, 'message', readString(data, 'role') === 'user' ? '用户消息' : '司墨消息', clampText(text), null, source, readString(data, 'status'))]
  }
  if (type === 'tool.call' || type === 'tool.called' || type === 'tool_call' || type === 'tool.result' || type === 'tool_call_result' || type === 'tool_call.started' || type === 'tool_call.finished') {
    const tool = readString(data, 'tool') ?? readString(data, 'name') ?? '工具调用'
    const summary = readString(data, 'summary') ?? readString(data, 'argsSummary') ?? readString(data, 'error') ?? tool
    return [baseEvent(id, at, 'tool', tool, clampText(summary), data, source, readString(data, 'status') ?? readString(data, 'phase'))]
  }
  if (type === 'approval.requested' || type === 'approval.resolved') {
    const title = readString(data, 'title') ?? readString(data, 'tool') ?? '审批'
    const summary = readString(data, 'summary') ?? readString(data, 'reason') ?? readString(data, 'decision') ?? ''
    return [baseEvent(id, at, 'approval', `审批：${title}`, clampText(summary), data, source, readString(data, 'status') ?? readString(data, 'decision'))]
  }
  if (type.startsWith('task.') || type.startsWith('workflow.')) {
    const title = readString(data, 'title') ?? readString(data, 'name') ?? type
    return [baseEvent(id, at, 'task', title, clampText(readString(data, 'summary') ?? readString(data, 'status') ?? type), data, source, readString(data, 'status'))]
  }
  if (type.startsWith('plan.') || type === 'todo.toggled') {
    return [baseEvent(id, at, 'plan', type === 'todo.toggled' ? '待办更新' : '计划事件', clampText(readString(data, 'title') ?? type), data, source, readString(data, 'status'))]
  }
  if (type === 'context.compacted' || type === 'compaction') {
    const summary = compactionSummary(data)
    if (!summary) return []
    return [baseEvent(id, at, 'compaction', '上下文压缩', summary, data, source, 'ok')]
  }
  if (type === 'retry' || type.startsWith('model.retry') || type.startsWith('tool.retry')) {
    const attempt = readNumber(data, 'attempt') ?? 0
    return [baseEvent(id, at, 'retry', '重试', clampText(readString(data, 'reason') ?? `第 ${attempt} 次`), data, source)]
  }
  if (type === 'error' || type.endsWith('.error') || type === 'reply.error') {
    const message = readString(data, 'message') ?? readString(data, 'error') ?? '发生错误'
    return [baseEvent(id, at, 'error', '错误', clampText(message), data, source, 'error')]
  }
  return []
}

/** 服务端 trajectory 响应归一化（含 asOfSeq/hasMore/nextBefore 透传由组件处理）。 */
export function normalizeTrajectoryResponse(payload: unknown): { items: TrajectoryEvent[]; hasMore: boolean; nextBefore: number | null } {
  if (!isRecord(payload)) return { items: [], hasMore: false, nextBefore: null }
  const raw = Array.isArray(payload['items']) ? payload['items'] : []
  const items: TrajectoryEvent[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const kind = readString(entry, 'kind') ?? 'task'
    const normalizedKind: TrajectoryKind = kind === 'tool.call' ? 'tool' : kind === 'approval.requested' ? 'approval' : kind === 'context.compacted' ? 'compaction' : (kind as TrajectoryKind)
    const id = readString(entry, 'id') ?? `${kind}:${readNumber(entry, 'seq') ?? items.length}`
    items.push(
      baseEvent(
        id,
        readNumber(entry, 'at') ?? Date.now(),
        normalizedKind,
        readString(entry, 'title') ?? kind,
        clampText(readString(entry, 'summary') ?? ''),
        entry,
        pickSource(entry),
        readString(entry, 'status'),
        readNumber(entry, 'seq') ?? null,
      ),
    )
  }
  return {
    items,
    hasMore: payload['hasMore'] === true,
    nextBefore: readNumber(payload, 'nextBefore') ?? readNumber(payload, 'next_before') ?? null,
  }
}

/** 降级：用消息 + 工具调用拼轨迹（后端事件缺失时）。 */
export function eventsFromMessages(messages: readonly ChatMessage[], toolCalls: readonly ToolCallInfo[]): TrajectoryEvent[] {
  const events: TrajectoryEvent[] = []
  for (const message of messages) {
    if (message.status === 'retracted') continue
    events.push(
      baseEvent(
        `msg:${message.id}`,
        message.at,
        'message',
        message.role === 'user' ? '用户消息' : '司墨消息',
        clampText(message.text),
        null,
        { sessionId: message.sessionId, messageId: message.id },
        message.status,
        null,
      ),
    )
  }
  for (const call of toolCalls) {
    events.push(
      baseEvent(
        `tool:${call.id}`,
        call.at ?? Date.now(),
        'tool',
        call.tool,
        clampText(call.argsSummary ?? call.status),
        call,
        {},
        call.status,
        null,
      ),
    )
  }
  return sortEvents(events)
}

export function sortEvents(events: readonly TrajectoryEvent[]): TrajectoryEvent[] {
  return [...events].sort((a, b) => a.at - b.at)
}

/** 合并事件：按 id 去重、时间升序，保留最近 max 条。 */
export function mergeTrajectoryEvents(
  existing: readonly TrajectoryEvent[],
  incoming: readonly TrajectoryEvent[],
  max = 400,
): TrajectoryEvent[] {
  const map = new Map(existing.map((event) => [event.id, event]))
  for (const event of incoming) map.set(event.id, event)
  return sortEvents([...map.values()]).slice(-max)
}

export function filterTrajectoryEvents(events: readonly TrajectoryEvent[], filter: TrajectoryFilter): TrajectoryEvent[] {
  if (filter === 'all') return [...events]
  const kinds = FILTER_KIND[filter]
  return events.filter((event) => kinds.includes(event.kind))
}

export function trajectoryKindLabel(kind: TrajectoryKind): string {
  if (kind === 'message') return '消息'
  if (kind === 'tool') return '工具'
  if (kind === 'approval') return '审批'
  if (kind === 'task') return '任务'
  if (kind === 'plan') return '计划'
  if (kind === 'compaction') return '压缩'
  if (kind === 'retry') return '重试'
  return '错误'
}

export function formatTrajectoryTime(at: number): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
