import type { Artifact, Message, PermissionState, Session, SessionOverview, StatsBucket, StatsTotals, Task, Usage } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`${response.status} ${response.statusText}${body ? `: ${body.slice(0, 240)}` : ''}`)
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

export function connectEvents(sessionId: string, handlers: { onDelta: (delta: WsDelta) => void; onStatus: (status: string) => void }): () => void {
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
      handlers.onStatus('closed')
      if (stopped) return
      retry = window.setTimeout(open, retryDelay)
      retryDelay = Math.min(retryDelay * 1.8, 5000)
    })
  }
  open()
  return () => {
    stopped = true
    if (retry !== null) window.clearTimeout(retry)
    socket?.close()
  }
}
