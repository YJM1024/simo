// platform/http.ts —— REST 客户端（契约 §3.1）
//
// 只负责传输与错误分类；数据结构收窄交给 platform/types.ts 的守卫。
// 错误统一抛 HttpError：status 区分 400/500，offline 表示「后端没起来」。

import type { ChatMessage, SessionSummary, TaskInfo } from './types.ts'
import { asArray } from './types.ts'

export class HttpError extends Error {
  readonly status: number
  readonly offline: boolean
  readonly body: unknown

  constructor(message: string, options: { status?: number; offline?: boolean; body?: unknown } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = options.status ?? 0
    this.offline = options.offline ?? false
    this.body = options.body
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { cache: 'no-store', ...init })
  } catch (cause) {
    // 调用方主动取消（AbortController）不算网络错误，原样抛出便于上层忽略
    if ((cause as { name?: string } | null)?.name === 'AbortError') throw cause
    throw new HttpError('无法连接后端，请确认司墨服务正在运行', { offline: true, body: cause })
  }

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = { raw: text }
    }
  }

  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : undefined) ?? `HTTP ${res.status}`
    throw new HttpError(message, { status: res.status, body })
  }
  return body as T
}

export function getHealth(): Promise<{ ok: boolean; time: number }> {
  return request('/api/health')
}

/** 通用只读 GET（feature 可自建领域端点，不必把业务语义塞进 platform）。 */
export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init ?? {})
}

/** 通用 POST（feature 自建领域端点用；body 为 JSON）。 */
export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 通用 PATCH（同上）。 */
export function apiPatch<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** 通用 DELETE（feature 自建领域端点用）。 */
export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

/** 读取二进制/文本资源（如产物内容）；失败抛 HttpError，成功返回原始 Response。 */
export async function fetchBinary(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, { cache: 'no-store', ...init })
  } catch (cause) {
    if ((cause as { name?: string } | null)?.name === 'AbortError') throw cause
    throw new HttpError('无法连接后端，请确认司墨服务正在运行', { offline: true, body: cause })
  }
  if (!res.ok) throw new HttpError(`HTTP ${res.status}`, { status: res.status })
  return res
}

export function getSessions(): Promise<unknown> {
  return request('/api/sessions')
}

/** UI-2：当前会话计划（后端未就绪时由 PlanPanel 用任务列表降级）。 */
export function getPlan(sessionId: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/plan`)
}

/** M4：嵌套会话树（GET /api/sessions/tree）。 */
export function getSessionTree(): Promise<unknown> {
  return request('/api/sessions/tree')
}

/** M4：新建会话（POST /api/sessions {parentId?, title?}）。 */
export function createSession(parentId: string | null, title?: string): Promise<unknown> {
  const body: { parentId?: string; title?: string } = {}
  if (parentId) body.parentId = parentId
  if (title) body.title = title
  return request('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** M4：会话改名（PATCH /api/sessions/{id} {title}，纯显示、无语义影响）。 */
export function renameSession(sessionId: string, title: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

/** M6：归档会话（POST /api/sessions/{id}/archive；归档后只读，可恢复）。 */
export function archiveSession(sessionId: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, { method: 'POST' })
}

/** M6：取消归档（POST /api/sessions/{id}/unarchive；恢复后还原可写）。 */
export function unarchiveSession(sessionId: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/unarchive`, { method: 'POST' })
}

export function getMessages(
  sessionId: string,
  options: { includeChildren?: boolean; before?: string; limit?: number } = {},
): Promise<unknown> {
  const params = new URLSearchParams({ sessionId })
  if (options.includeChildren !== undefined) params.set('includeChildren', String(options.includeChildren))
  if (options.before) params.set('before', options.before)
  if (options.limit) params.set('limit', String(options.limit))
  return request(`/api/messages?${params.toString()}`)
}

export function postChat(
  sessionId: string | null,
  text: string,
  attachments: readonly string[] = [],
  replyToMessageId?: string,
): Promise<{ ok?: boolean; messageId?: string }> {
  const body: Record<string, unknown> = sessionId ? { sessionId, text } : { text }
  if (attachments.length > 0) body['attachments'] = attachments
  if (replyToMessageId) body['replyToMessageId'] = replyToMessageId
  return request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** M9：读取权限模式（沙盒 × 审批策略）。 */
export function getPermissions(): Promise<unknown> {
  return request('/api/permissions')
}

/** M9：切换权限模式；full 需携带确认标记（见 permissionUpdateBody）。 */
export function updatePermissions(body: Record<string, unknown>): Promise<unknown> {
  return request('/api/permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/**
 * 任务列表（M2 用于刷新后恢复右栏）。
 * 契约 §5 只定义了 task.* 增量帧，未定义 REST；后端未提供时调用方应静默降级为空列表。
 */
export function getTasks(sessionId: string): Promise<unknown> {
  return request(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`)
}

/** 把 GET /api/tasks 的返回收窄成任务数组（端点不存在时由调用方 catch）。 */
export function toTasks(payload: unknown): TaskInfo[] {
  return asArray<TaskInfo>(payload, 'tasks').filter(
    (item): item is TaskInfo => typeof item?.id === 'string' && typeof item.status === 'string',
  )
}

/** 把 GET /api/sessions 的返回收窄成数组。 */
export function toSessions(payload: unknown): SessionSummary[] {
  return asArray<SessionSummary>(payload, 'sessions').filter(
    (item): item is SessionSummary => typeof item?.id === 'string' && item.id.length > 0,
  )
}

/** 把 GET /api/messages 的返回收窄成消息数组。 */
export function toMessages(payload: unknown): ChatMessage[] {
  return asArray<ChatMessage>(payload, 'messages').filter(
    (item): item is ChatMessage => typeof item?.id === 'string' && typeof item.text === 'string',
  )
}
