// platform/ws.ts —— WebSocket 客户端（m1-contract §3.2 / m2-contract §5）
//
// 只做传输层，不做业务：
//   - 连接 /api/ws?sessionId=…[&since=…]
//   - 连上后发 subscribe（带 since 续接）
//   - 收 { type, data, id? } 帧，回调给 hub 再广播到各 feature
//   - 断线指数退避重连：1s → 2s → 4s … 上限 30s
//   - 按事件 id 做传输层去重（重连补发时丢弃 <= since 的旧帧）

import type { ConnectionState, WireFrame } from './types.ts'
import { isRecord } from './types.ts'

const RETRY_MIN_MS = 1000
const RETRY_MAX_MS = 30_000

export interface OutgoingFrame {
  type: string
  data?: unknown
}

export interface WsClientOptions {
  sessionId: string
  onFrame: (frame: WireFrame) => void
  onState: (state: ConnectionState, meta?: { reconnect: boolean }) => void
}

export interface WsClient {
  close: () => void
  /** 发送任意协议帧；连接未就绪时返回 false（调用方可回退 REST）。 */
  send: (frame: OutgoingFrame) => boolean
  /** 便捷方法：发送 chat 帧。 */
  sendChat: (text: string) => boolean
  isOpen: () => boolean
  lastEventId: () => number | null
}

/** 从帧里尽力提取事件 id（服务端在信封顶层带 id；兼容 data 内嵌写法）。 */
export function extractEventId(frame: WireFrame): number | null {
  const candidates: unknown[] = [frame.id]
  if (isRecord(frame.data)) candidates.push(frame.data['eventId'], frame.data['id'])
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate
  }
  return null
}

function wsUrl(sessionId: string, since: number | null): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ sessionId })
  if (since !== null) params.set('since', String(since))
  return `${protocol}//${window.location.host}/api/ws?${params.toString()}`
}

export function createWsClient({ sessionId, onFrame, onState }: WsClientOptions): WsClient {
  let socket: WebSocket | null = null
  let stopped = false
  let hasOpened = false
  let retryDelay = RETRY_MIN_MS
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let eventId: number | null = null

  function handleMessage(event: MessageEvent<unknown>): void {
    let parsed: unknown
    try {
      parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    } catch {
      return
    }
    if (!isRecord(parsed) || typeof parsed['type'] !== 'string') return

    const eventIdInFrame = parsed['id']
    const frame: WireFrame = {
      type: parsed['type'],
      data: parsed['data'],
      ...(typeof eventIdInFrame === 'number' ? { id: eventIdInFrame } : {}),
    }

    // 传输层去重：重连补发可能重复（服务端按 since 补发，首帧可能等于 since）
    const id = extractEventId(frame)
    if (id !== null) {
      if (eventId !== null && id <= eventId) return
      eventId = id
    }
    onFrame(frame)
  }

  function connect(): void {
    if (stopped) return
    onState(hasOpened ? 'reconnecting' : 'connecting')

    let next: WebSocket
    try {
      next = new WebSocket(wsUrl(sessionId, eventId))
    } catch {
      scheduleReconnect()
      return
    }
    socket = next

    next.onopen = () => {
      const reconnect = hasOpened
      hasOpened = true
      retryDelay = RETRY_MIN_MS
      onState('open', { reconnect })
      const data: { sessionId: string; since?: number } = { sessionId }
      if (eventId !== null) data.since = eventId
      next.send(JSON.stringify({ type: 'subscribe', data }))
    }

    next.onmessage = handleMessage

    next.onclose = () => {
      socket = null
      if (stopped) return
      onState('reconnecting')
      scheduleReconnect()
    }

    next.onerror = () => {
      // 具体原因由 onclose 处理；这里只保证状态机不悬挂。
      if (!stopped) onState('reconnecting')
    }
  }

  function scheduleReconnect(): void {
    if (stopped || retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      connect()
    }, retryDelay)
    retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS)
  }

  function closeSocket(): void {
    if (!socket) return
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      // 忽略关闭异常
    }
    socket = null
  }

  function send(frame: OutgoingFrame): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(frame))
    return true
  }

  connect()

  return {
    close() {
      if (stopped) return
      stopped = true
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      closeSocket()
      onState('closed')
    },
    send,
    sendChat(text: string): boolean {
      return send({ type: 'chat', data: { sessionId, text } })
    },
    isOpen(): boolean {
      return socket !== null && socket.readyState === WebSocket.OPEN
    },
    lastEventId(): number | null {
      return eventId
    },
  }
}
