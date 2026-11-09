// platform/types.ts —— 前后端共享的线格式类型 + 运行时类型守卫
//
// 契约：docs/m1-contract.md §3、docs/m2-contract.md §5。
// 所有来自网络的 JSON 都先按 unknown 处理，再用这里的守卫收窄，
// 避免把服务端字段直接断言成业务类型。

export type MessageRole = 'user' | 'agent' | 'system'

/** 消息状态：M2 增加 retracted（流式回复被撤回时只显示标记，不展示内容）。 */
export type MessageStatus = 'streaming' | 'done' | 'sent' | 'error' | 'retracted'

/** M8：上传附件元数据（消息气泡/附件 chips/上传接口共用）。 */
export interface ChatAttachment {
  id: string
  name: string
  mime: string
  size: number | null
  createdAt: number | null
}

/** M14：会话路径节点（从根到当前）。 */
export interface SessionPathItem {
  id: string
  title: string
}

/** M15：被回复消息的快照（text 为摘要，≤200 字）。 */
export interface ReplyToSnapshot {
  id: string
  role: string
  text: string
  sessionId?: string
  sessionTitle?: string
  sessionPath?: SessionPathItem[]
}

export interface ChatMessage {
  id: string
  sessionId?: string
  /** M4：后端消息响应带归属会话标题，供主窗口标签跳转 */
  sessionTitle?: string
  role: MessageRole | string
  text: string
  at: number
  status?: MessageStatus | string
  /** M8：消息附件（GET /api/messages 返回，无则空数组） */
  attachments?: ChatAttachment[]
  /** M10：任务汇报消息关联的任务/工作流（role=agent 的汇报卡片） */
  taskId?: string
  workflowId?: string
  /** M14：agent 消息分类（requirement/clarification/progress/consultation；空=未分类） */
  category?: string
  /** M14：会话多级路径（根 → 当前），缺省时由 sessionMeta 推导 */
  sessionPath?: SessionPathItem[]
  /** M15：回复引用快照 */
  replyTo?: ReplyToSnapshot
  /** M17：处理者智能体 id（消息头像显示处理者） */
  agentId?: string
  /** M41：消息内联交互卡片（原始卡片数组；chat/cards.ts 归一化） */
  cards?: unknown[]
}

/** M2：后台任务（右栏列表；M5 增加阶段/产物/审批等可选字段）。 */
export type TaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface TaskInfo {
  id: string
  title: string
  status: TaskStatus | string
  summary?: string
  createdAt?: number
  updatedAt?: number
  /** M5：0–1 或 0–100（归一化在 tasks/model）；null 表示未知 */
  progress?: number | null
  sessionId?: string
  kind?: string
  phases?: unknown
  steps?: unknown
  artifacts?: unknown
  approvals?: unknown
  payload?: unknown
}

/** 中和标记：子代理输出被 harness 中和时附带的标记（M5 展示「已中和」小标记）。 */
export const NEUTRALIZED_MARKER = '[harness: neutralized]'

const NEUTRALIZED_RE = /\[\s*harness\s*:\s*neutralized\s*\]/i

export function hasNeutralized(text: string | null | undefined): boolean {
  return typeof text === 'string' && NEUTRALIZED_RE.test(text)
}

/** 去掉中和标记后的展示文本（标记本身不作为正文展示）。 */
export function stripNeutralized(text: string): string {
  return text.replace(NEUTRALIZED_RE, '').replace(/[ \t]{2,}/g, ' ').trim()
}

/** M7：消息时间统一显示为本地 HH:mm（跨天/跨年由调用方补充日期）。 */
export function formatClockTime(at: number): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface SessionSummary {
  id: string
  title: string
  createdAt?: number
  archived?: number | boolean
  /** M4 会话树：父会话 id（根为 null/缺省） */
  parentId?: string
  /** M4 会话树：一行摘要 / 状态（后端可选提供） */
  summary?: string
  status?: string
  messageCount?: number
  updatedAt?: number
  fallback?: boolean
}

export interface SessionMetaEntry {
  id: string
  title: string
  depth: number
  /** M6：父会话 id（根为 null/缺省）；tasks 用它聚合子会话产物 */
  parentId?: string
}

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed'

export type AgentState = 'thinking' | 'idle'

export interface Notice {
  kind: 'error' | 'info'
  text: string
}

/** WS 帧统一信封：{ type, data, id? }（服务端在事件帧顶层带自增事件 id）。 */
export interface WireFrame {
  type: string
  data?: unknown
  /** 事件 id：since 续接与重连去重用 */
  id?: number
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(source: unknown, key: string): string | undefined {
  if (!isRecord(source)) return undefined
  const value = source[key]
  return typeof value === 'string' ? value : undefined
}

export function readNumber(source: unknown, key: string): number | undefined {
  if (!isRecord(source)) return undefined
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** 把 {items:[...]} / 裸数组 / null 统一成数组（兼容后端字段包装的变化）。 */
export function asArray<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  if (isRecord(value)) {
    const items = value[key]
    if (Array.isArray(items)) return items as T[]
  }
  return []
}

/** M8：把消息里的 attachments 收窄成 ChatAttachment[]（缺 id 的丢弃）。 */
export function toChatAttachments(value: unknown): ChatAttachment[] {
  if (!Array.isArray(value)) return []
  const out: ChatAttachment[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const id = readString(entry, 'id')
    if (!id) continue
    out.push({
      id,
      name: readString(entry, 'name') ?? id,
      mime: readString(entry, 'mime') ?? '',
      size: readNumber(entry, 'size') ?? null,
      createdAt: readNumber(entry, 'createdAt') ?? null,
    })
  }
  return out
}

/** M14：归一化 sessionPath（[{id,title}] / ["标题"] / snake_case），根→当前，限深 16。 */
export function toSessionPath(value: unknown): SessionPathItem[] {
  if (!Array.isArray(value)) return []
  const path: SessionPathItem[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (path.length >= 16) break
    if (typeof entry === 'string') {
      if (!entry) continue
      if (seen.has(entry)) continue
      seen.add(entry)
      path.push({ id: entry, title: entry })
      continue
    }
    if (!isRecord(entry)) continue
    const id = readString(entry, 'id') ?? readString(entry, 'sessionId')
    if (!id || seen.has(id)) continue
    seen.add(id)
    path.push({ id, title: readString(entry, 'title') ?? id })
  }
  return path
}

/** M15：归一化 replyTo 快照（对象；text 上限 200 字）。 */
export function toReplyTo(value: unknown): ReplyToSnapshot | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const text = (readString(value, 'text') ?? '').slice(0, 200)
  const sessionPath = toSessionPath(value['sessionPath'] ?? value['session_path'])
  return {
    id,
    role: readString(value, 'role') ?? 'user',
    text,
    ...(readString(value, 'sessionId') ?? readString(value, 'session_id')
      ? { sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id') }
      : {}),
    ...(readString(value, 'sessionTitle') ?? readString(value, 'session_title')
      ? { sessionTitle: readString(value, 'sessionTitle') ?? readString(value, 'session_title') }
      : {}),
    ...(sessionPath.length > 0 ? { sessionPath } : {}),
  }
}

/**
 * 尽力把任意帧解析成 ChatMessage；字段不足时返回 null。
 * `fallbackRole` 供 reply.created（可能不带 role/text）兜底。
 */
export function toChatMessage(value: unknown, fallbackRole: string = 'agent'): ChatMessage | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const category = readString(value, 'category')
  const replyTo = toReplyTo(value['replyTo'] ?? value['reply_to'])
  const cards = Array.isArray(value['cards']) ? value['cards'] : Array.isArray(value['cardsJson']) ? value['cardsJson'] : []
  return {
    id,
    text: readString(value, 'text') ?? '',
    role: readString(value, 'role') ?? fallbackRole,
    at: readNumber(value, 'at') ?? Date.now(),
    sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id'),
    status: readString(value, 'status'),
    attachments: toChatAttachments(value['attachments']),
    taskId: readString(value, 'taskId') ?? readString(value, 'task_id'),
    workflowId: readString(value, 'workflowId') ?? readString(value, 'workflow_id'),
    ...(category ? { category } : {}),
    ...(toSessionPath(value['sessionPath'] ?? value['session_path']).length > 0
      ? { sessionPath: toSessionPath(value['sessionPath'] ?? value['session_path']) }
      : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(readString(value, 'agentId') ?? readString(value, 'agent_id') ?? readString(value, 'ownerAgentId')
      ? { agentId: readString(value, 'agentId') ?? readString(value, 'agent_id') ?? readString(value, 'ownerAgentId') }
      : {}),
    ...(cards.length > 0 ? { cards } : {}),
  }
}
