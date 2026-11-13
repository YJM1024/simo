import type { SessionSpecProjection, Artifact, Message, PermissionState, Session, SessionOverview, StatsBucket, StatsTotals, Task, Usage } from './types'

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status = 0, code = '') { super(message); this.status = status; this.code = code }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init })
  } catch {
    throw new ApiError('网络请求失败，请检查连接后重试')
  }
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

export function listSessions(): Promise<{ sessions?: Session[]; tree?: Session[] }> {
  return request('/api/sessions/tree')
}

export function listMessages(sessionId: string, limit = 100): Promise<{ messages?: Message[]; hasMore?: boolean }> {
  return request(`/api/messages?sessionId=${encodeURIComponent(sessionId)}&limit=${limit}`)
}

export function sendChat(sessionId: string, text: string): Promise<{ messageId?: string }> {
  return request('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text }) })
}

export function createSessionDraft(parentId: string, title: string): Promise<unknown> {
  return request('/api/sessions', { method: 'POST', body: JSON.stringify({ parentId, title }) })
}

export function renameSession(id: string, title: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) })
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
}

export interface ChatEvents {
  close: () => void
  stop: () => void
}

export function connectEvents(sessionId: string, handlers: { onDelta: (delta: WsDelta) => void; onStatus: (status: string) => void }): ChatEvents {
  let stopped = false
  let socket: WebSocket | null = null
  let retry: number | null = null
  let retryDelay = 800

  const open = (): void => {
    if (stopped) return
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(`${protocol}://${location.host}/api/ws?sessionId=${encodeURIComponent(sessionId)}`)
    socket.addEventListener('open', () => {
      retryDelay = 800
      handlers.onStatus('open')
      socket?.send(JSON.stringify({ type: 'subscribe', data: { sessionId } }))
    })
    socket.addEventListener('message', (event) => {
      try {
        const frame = JSON.parse(String(event.data)) as { type?: string; data?: unknown }
        if (frame.type !== 'reply.delta') return
        const data = frame.data as WsDelta | null
        if (data && typeof data.id === 'string' && typeof data.delta === 'string') handlers.onDelta(data)
      } catch {
        // 非 JSON 帧忽略
      }
    })
    socket.addEventListener('close', () => {
      handlers.onStatus('reconnecting')
      if (stopped) return
      retry = window.setTimeout(open, retryDelay)
      retryDelay = Math.min(retryDelay * 1.8, 5000)
    })
  }
  open()
  return {
    close: () => {
      stopped = true
      if (retry !== null) window.clearTimeout(retry)
      socket?.close()
    },
    stop: () => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'correct', data: { sessionId } }))
      }
    },
  }
}

export function searchMessages(q: string): Promise<{ messages?: Array<{ sessionId: string }> }> {
  return request(`/api/messages/search?q=${encodeURIComponent(q)}`)
}

export function archiveSession(id: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(id)}/archive`, { method: 'POST' })
}

export function unarchiveSession(id: string): Promise<unknown> {
  return request(`/api/sessions/${encodeURIComponent(id)}/unarchive`, { method: 'POST' })
}

export async function getArtifactContent(id: string): Promise<string> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}/content`)
  if (!response.ok) throw new Error(`交付物读取失败（${response.status}）`)
  return response.text()
}

export function getSpecProjection(sessionId: string, taskLimit = 3): Promise<SessionSpecProjection> {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=${taskLimit}`)
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
