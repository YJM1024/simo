import type { SessionSpecProjection, Artifact, Message, PermissionState, Session, SessionOverview, StatsBucket, StatsTotals, Task, Usage } from './types'

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status = 0, code = '') { super(message); this.status = status; this.code = code }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  try {
    return await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError('网络请求失败，请检查连接后重试')
  }
}

async function readBody<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let code = ''
    try { code = (JSON.parse(text) as { code?: string }).code ?? '' } catch { /* not json */ }
    if (response.status === 409 && code === 'CARD_ACTION_IN_PROGRESS') throw new ApiError('处理中，请稍后重试', 409, code)
    throw new ApiError(`请求失败（${response.status}），请稍后重试`, response.status, code)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return readBody<T>(await send(path, init))
}

export interface SessionListPayload {
  sessions?: Session[]
  tree?: Session[]
  /** 304：服务端列表与上次一致。调用方必须保留当前列表数组与选中态，不要拿响应体覆盖。 */
  notModified?: boolean
}

/** 会话列表条件请求缓存：URL → 最近一次成功响应的 ETag 与列表体。 */
const sessionListCache = new Map<string, { etag: string; payload: SessionListPayload }>()
/** 上限只防搜索词无限累积；同一时刻真正会复用的路径通常不超过几条。 */
const SESSION_LIST_CACHE_LIMIT = 8

/**
 * 清空会话列表的 ETag 缓存。
 * 会改变列表的服务端写操作（置顶、归档、重命名、发消息）成功后必须调用；否则下一次请求仍带旧标签，
 * 服务端回 304，前端就会错过刚发生的变更。
 */
export function invalidateSessionListCache(): void {
  sessionListCache.clear()
}

function rememberSessionList(url: string, etag: string, payload: SessionListPayload): void {
  sessionListCache.delete(url)
  sessionListCache.set(url, { etag, payload })
  if (sessionListCache.size > SESSION_LIST_CACHE_LIMIT) {
    const oldest = sessionListCache.keys().next().value
    if (oldest !== undefined) sessionListCache.delete(oldest)
  }
}

/** 写操作成功后失效缓存；失败时保持缓存（列表本来就没变）。 */
function afterSessionMutation<T>(pending: Promise<T>): Promise<T> {
  return pending.then((value) => {
    invalidateSessionListCache()
    return value
  })
}

/**
 * 会话列表的条件请求：带上一次同 URL 的 If-None-Match。
 * 304 必须先于 response.ok 判断（304 的 ok 为 false，按失败处理会把“没变化”显示成错误）；
 * 304 返回缓存中的列表体（数组仍是上次的同一个引用）并标记 notModified，调用方据此保留当前状态。
 */
async function conditionalSessionList(url: string): Promise<SessionListPayload> {
  const cached = sessionListCache.get(url)
  const response = await send(url, cached ? { headers: { 'If-None-Match': cached.etag } } : undefined)
  if (response.status === 304) {
    const etag = response.headers.get('ETag') ?? cached?.etag
    if (cached && etag) sessionListCache.set(url, { etag, payload: cached.payload })
    return { ...(cached?.payload ?? {}), notModified: true }
  }
  const payload = await readBody<SessionListPayload>(response)
  const etag = response.headers.get('ETag')
  if (etag) rememberSessionList(url, etag, payload)
  else sessionListCache.delete(url)
  return payload
}

/**
 * 会话列表 / 标题搜索。
 * 有查询词时走 `GET /api/sessions?q=`（服务端按标题检索，含子会话，支持 ETag）；
 * 空查询取完整会话树 `GET /api/sessions/tree`（后端当前不发 ETag，这里就不带条件头，按普通 200 处理）。
 * 消息正文搜索不在默认路径（P2，见 searchMessages）。
 */
export function listSessions(q?: string): Promise<SessionListPayload> {
  const term = q?.trim() ?? ''
  return conditionalSessionList(term ? `/api/sessions?q=${encodeURIComponent(term)}` : '/api/sessions/tree')
}

/** 进入会话时标记已读（POST /api/sessions/{id}/read，无 body）；未读状态以服务端返回的 hasUnread 为准。 */
export function markSessionRead(id: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(id)}/read`, { method: 'POST' })
}

export function listMessages(sessionId: string, limit = 100): Promise<{ messages?: Message[]; hasMore?: boolean }> {
  return request(`/api/messages?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`)
}

export function sendChat(sessionId: string, text: string, clientMutationId?: string): Promise<{ messageId?: string }> {
  // 发消息会改变会话的最近活动/未读等列表字段，成功后让列表 ETag 失效。
  return afterSessionMutation(request('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text, clientMutationId }) }))
}

export function createSessionDraft(parentId: string, title: string): Promise<unknown> {
  return request('/api/sessions', { method: 'POST', body: JSON.stringify({ parentId, title }) })
}

export function renameSession(id: string, title: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) }))
}

export function getOverview(sessionId: string): Promise<{ overview?: SessionOverview }> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/overview`)
}

export function getTasks(sessionId: string): Promise<{ tasks?: Task[] }> {
  return request(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`)
}

export function getArtifacts(sessionId: string): Promise<{ artifacts?: Artifact[] }> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/artifacts`)
}

export function getPermissions(sessionId: string): Promise<{ permissions?: PermissionState }> {
  return request(`/api/permissions?sessionId=${encodeURIComponent(sessionId)}`)
}

export function getUsage(): Promise<Usage> {
  return request('/api/usage')
}

export function getStats(metric: 'messages' | 'tokens' = 'messages'): Promise<{ buckets?: StatsBucket[]; totals?: StatsTotals }> {
  return request(`/api/stats?metric=${metric}&granularity=day`)
}

export function submitCardAction(cardId: string, actionId: string, payload: Record<string, unknown>): Promise<unknown> {
  return request(`/api/cards/${encodeURIComponent(cardId)}/actions/${encodeURIComponent(actionId)}`, {
    method: 'POST',
    body: JSON.stringify({ payload }),
  })
}

export interface WsDelta {
  id: string
  delta: string
  seq?: number
}

export interface ChatEvents {
  close: () => void
  /** 停止流式回复；带 messageId 时只停被指定的那一条，缺省时保留旧协议（后端停该会话最新一条）。 */
  stop: (messageId?: string) => void
}

export function connectEvents(sessionId: string, handlers: {
  onDelta: (delta: WsDelta) => void
  onStatus: (status: string) => void
  onEvent?: (event: { type: string; id: string; seq?: number; eventId?: number; data?: Record<string, unknown> }) => void
  /**
   * 事件日志游标（since）：只认 WS 信封顶层的数字 id（eventlog.Event.ID）。
   * 消息 id（msg-…）与会话 id 都不是事件序号，不能拿来续接。
   */
  onCursor?: (eventId: number) => void
  /** 订阅被后端拒绝（例如 since 非法）时上报，避免界面继续显示「已连接」。 */
  onError?: (message: string) => void
  since?: () => number | null
}): ChatEvents {
  let stopped = false
  let socket: WebSocket | null = null
  let retry: number | null = null
  let stable: number | null = null
  let retryDelay = 800
  let failures = 0
  const maxRetries = 5
  const stableMs = 15_000

  const open = (): void => {
    if (stopped) return
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${protocol}://${location.host}/api/ws?sessionId=${encodeURIComponent(sessionId)}`)
    socket.addEventListener('open', () => {
      // 只有连接稳定存活一段时间才清零重试预算；反复 open 后立刻 close 仍算连续失败。
      stable = window.setTimeout(() => {
        failures = 0
        retryDelay = 800
      }, stableMs)
      handlers.onStatus('open')
      const cursor = handlers.since?.()
      socket?.send(JSON.stringify({ type: 'subscribe', data: { sessionId, since: typeof cursor === 'number' && Number.isFinite(cursor) ? cursor : undefined } }))
    })
    socket.addEventListener('message', (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as { type?: string; data?: unknown; id?: unknown }
        // 事件游标取信封顶层的数字 id；缺失（hello/status/错误帧等非持久化事件）时不推进游标。
        const eventId = typeof frame.id === 'number' && Number.isInteger(frame.id) && frame.id >= 0 ? frame.id : undefined
        if (eventId !== undefined) handlers.onCursor?.(eventId)
        const data = frame.data as (WsDelta & { seq?: number; message?: unknown }) | null
        if (frame.type === 'reply.delta') { if (data && typeof data.id === 'string' && typeof data.delta === 'string') handlers.onDelta(data); return }
        // 已读/未读广播载荷是 { sessionId } 而不是 { id }：用 sessionId 透传，供上层刷新列表。
        // session_unread 不区分会话（含当前会话以外的会话），由上层合并刷新。
        if (frame.type === 'session_read' || frame.type === 'session_unread') {
          const sessionId = (data as { sessionId?: unknown } | null)?.sessionId
          if (typeof sessionId === 'string') handlers.onEvent?.({ type: frame.type, id: sessionId })
          return
        }
        if (frame.type === 'error') {
          handlers.onError?.(typeof data?.message === 'string' ? data.message : '实时订阅失败')
          handlers.onStatus('error')
          return
        }
        // §17.5.3：任务事件按任务 id 透传，payload 原样交给上层做增量与去重。
        if (data && typeof data.id === 'string' && (frame.type === 'task.created' || frame.type === 'task.updated' || frame.type === 'task.step' || frame.type === 'task.trace' || frame.type === 'task.report' || frame.type === 'task.reminder')) {
          handlers.onEvent?.({ type: frame.type, id: data.id, eventId, data: data as unknown as Record<string, unknown> })
          return
        }
        if (data && typeof data.id === 'string' && (frame.type === 'message.created' || frame.type === 'reply.done' || frame.type === 'message.done')) handlers.onEvent?.({ type: frame.type, id: data.id, seq: data.seq, eventId })
      } catch {
        // 非 JSON 帧忽略
      }
    })
    socket.addEventListener('close', () => {
      if (stopped) return
      if (stable !== null) { window.clearTimeout(stable); stable = null }
      failures += 1
      // 彻底关闭：连续失败超过上限后停止重连，进入终态 closed（C-07）
      if (failures > maxRetries) {
        handlers.onStatus('closed')
        return
      }
      handlers.onStatus('reconnecting')
      retry = window.setTimeout(open, retryDelay)
      retryDelay = Math.min(retryDelay * 1.8, 5000)
    })
  }
  open()
  return {
    close: () => {
      stopped = true
      if (retry !== null) window.clearTimeout(retry)
      if (stable !== null) window.clearTimeout(stable)
      socket?.close()
    },
    stop: (messageId?: string) => {
      if (socket?.readyState === WebSocket.OPEN) {
        const data: { sessionId: string; messageId?: string } = { sessionId }
        const target = typeof messageId === 'string' ? messageId.trim() : ''
        if (target !== '') data.messageId = target
        socket.send(JSON.stringify({ type: 'correct', data }))
      }
    },
  }
}

/**
 * 消息正文搜索（P2）：接口能力保留，但 UI 不再默认触发——左栏搜索已改为标题搜索。
 * 未来若接入会话内搜索，从这里调用即可（当前没有入口，属未接线能力）。
 */
export function searchMessages(q: string): Promise<{ messages?: Array<{ sessionId: string }> }> {
  return request(`/api/messages/search?q=${encodeURIComponent(q)}`)
}

export function archiveSession(id: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' }))
}

export function unarchiveSession(id: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/sessions/${encodeURIComponent(id)}/unarchive`, { method: 'POST' }))
}

/** 置顶/取消置顶（POST /api/sessions/{id}/pin|unpin，无 body）；排序由后端返回，前端不再排。 */
export function pinSession(id: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/sessions/${encodeURIComponent(id)}/pin`, { method: 'POST' }))
}

export function unpinSession(id: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/sessions/${encodeURIComponent(id)}/unpin`, { method: 'POST' }))
}

export async function getArtifactContent(id: string): Promise<string> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}/content`)
  if (!response.ok) throw new Error(`交付物读取失败（${response.status}）`)
  return response.text()
}

export interface SpecProjectionResult {
  /** 200 为服务端最新投影；304 为缓存中的上一份（没有缓存时为 null，调用方保留当前数据）。 */
  projection: SessionSpecProjection | null
  /** true 表示服务端回 304：右栏数据没有变化，调用方不得清空、不得进错误态。 */
  notModified: boolean
}

/**
 * 投影条件请求缓存：`会话 id + taskLimit` → ETag 与上一份投影。
 * taskLimit=3（默认）与 50（展开任务组）的服务端 ETag 不同，必须分键存放，不能互相覆盖。
 */
const specProjectionCache = new Map<string, { etag: string; projection: SessionSpecProjection }>()
/** 与列表缓存同一上限：防止长时间切换会话把内存撑大。 */
const SPEC_PROJECTION_CACHE_LIMIT = 8

function specProjectionKey(sessionId: string, taskLimit: number): string {
  return `${sessionId}?taskLimit=${taskLimit}`
}

/** 清空投影 ETag 缓存（测试隔离用）。 */
export function invalidateSpecProjectionCache(): void {
  specProjectionCache.clear()
}

/**
 * 只读缓存：切会话时先用上一份投影占位，这样同键请求即使回 304，右栏也不会空白。
 * 不做任何状态写入，缓存未命中时返回 null。
 */
export function peekSpecProjection(sessionId: string, taskLimit = 3): SessionSpecProjection | null {
  return specProjectionCache.get(specProjectionKey(sessionId, taskLimit))?.projection ?? null
}

function rememberSpecProjection(key: string, etag: string, projection: SessionSpecProjection): void {
  specProjectionCache.delete(key)
  specProjectionCache.set(key, { etag, projection })
  if (specProjectionCache.size > SPEC_PROJECTION_CACHE_LIMIT) {
    const oldest = specProjectionCache.keys().next().value
    if (oldest !== undefined) specProjectionCache.delete(oldest)
  }
}

/**
 * 会话投影的条件请求：带同键上一次的 If-None-Match。
 * 304 必须先于 response.ok 判断（304 的 ok 为 false，按失败处理会把“没变化”显示成「请求失败（304）」）；
 * 命中时返回缓存数据并标记 notModified，调用方据此保留当前右栏，不亮加载骨架、不进错误态。
 * 带 ?taskLimit= 的 URL 各自一份 ETag，默认 3 与展开后的 50 互不影响。
 * cache=false 供活动时间探测这类一次性请求使用：既不读也不写缓存，避免把右栏的 ETag 挤出 8 条上限。
 */
export async function getSpecProjection(sessionId: string, taskLimit = 3, cache = true): Promise<SpecProjectionResult> {
  const key = specProjectionKey(sessionId, taskLimit)
  const cached = cache ? specProjectionCache.get(key) : undefined
  const response = await send(
    `/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=${taskLimit}`,
    cached ? { headers: { 'If-None-Match': cached.etag } } : undefined,
  )
  if (response.status === 304) {
    const etag = response.headers.get('ETag') ?? cached?.etag
    if (cached && etag) {
      // 命中 304 也算一次使用：移到队尾，避免活跃会话被其它会话挤出。
      specProjectionCache.delete(key)
      specProjectionCache.set(key, { etag, projection: cached.projection })
    }
    return { projection: cached?.projection ?? null, notModified: true }
  }
  const projection = await readBody<SessionSpecProjection>(response)
  if (cache) {
    const etag = response.headers.get('ETag')
    if (etag) rememberSpecProjection(key, etag, projection)
    else specProjectionCache.delete(key)
  }
  return { projection, notModified: false }
}

export interface UserDeliverable { id: string; name: string; createdAt?: number; previewUrl?: string; downloadUrl?: string }
export function getDeliverables(): Promise<{ deliverables?: UserDeliverable[]; total?: number }> {
  return request('/api/deliverables')
}

export function getAllSessionMessages(sessionId: string): Promise<{ messages?: Message[]; sessionId?: string; archived?: boolean; pagination?: boolean }> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/messages?scope=all`)
}

export interface MetricsTotals {
  ttftP50Ms: number | null; ttftP90Ms: number | null; durationP50Ms: number | null; durationP90Ms: number | null
  turns: number; messages: number; tasks: number; failures: number
  promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number
}
export interface MetricsDay extends MetricsTotals { date: string; start: number; end: number }
export interface MetricsPayload { range: string; timezone: string; from: number; to: number; totals: MetricsTotals; series: MetricsDay[] }
export function getMetrics(range: '7d' | '30d', tz = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<MetricsPayload> {
  return request(`/api/metrics?range=${range}&tz=${encodeURIComponent(tz)}`)
}
// ---- P1-CONV §17 任务接口（契约 N2/N3/N6/N7/N8/N9） ----
import type { DeliverablesPayload, TaskDetailPayload, TaskGraphPayload, TaskListPayload } from './types'

export interface TaskQuery { status?: string; mode?: string; batchId?: string; limit?: number; before?: string }

export function listSessionTasks(sessionId: string, query: TaskQuery = {}): Promise<TaskListPayload> {
  const params = new URLSearchParams()
  if (query.status) params.set('status', query.status)
  if (query.mode) params.set('mode', query.mode)
  if (query.batchId) params.set('batchId', query.batchId)
  params.set('limit', String(query.limit ?? 50))
  if (query.before) params.set('before', query.before)
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/tasks?${params.toString()}`)
}

export function getTaskDetail(taskId: string, opts: { traceLimit?: number; traceBefore?: string } = {}): Promise<TaskDetailPayload> {
  const params = new URLSearchParams()
  params.set('traceLimit', String(opts.traceLimit ?? 200))
  if (opts.traceBefore) params.set('traceBefore', opts.traceBefore)
  return request(`/api/tasks/${encodeURIComponent(taskId)}?${params.toString()}`)
}

export function getTaskGraph(sessionId: string): Promise<TaskGraphPayload> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/task-graph`)
}

export function getSessionDeliverables(sessionId: string, query: { taskId?: string; limit?: number; before?: string } = {}): Promise<DeliverablesPayload> {
  const params = new URLSearchParams()
  if (query.taskId) params.set('taskId', query.taskId)
  params.set('limit', String(query.limit ?? 50))
  if (query.before) params.set('before', query.before)
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/deliverables?${params.toString()}`)
}

/** 等待确认的任务：确认或取消（N6，DEC-27 唯一可写入口在消息卡内联区）。 */
export function decideTaskConfirmation(taskId: string, decision: 'confirm' | 'cancel'): Promise<unknown> {
  return afterSessionMutation(request(`/api/tasks/${encodeURIComponent(taskId)}/confirmation`, { method: 'POST', body: JSON.stringify({ decision }) }))
}

/** 等待资源或额度：恢复任务（N7）。 */
export function resumeTask(taskId: string, reason: string): Promise<unknown> {
  return afterSessionMutation(request(`/api/tasks/${encodeURIComponent(taskId)}/resume`, { method: 'POST', body: JSON.stringify({ reason }) }))
}
