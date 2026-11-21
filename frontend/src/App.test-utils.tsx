import { act } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Message, Session, SessionSpecProjection } from './types'

export const at = 1_760_000_000_000

export interface AppSnapshot {
  tree: Session[]
  messages: Record<string, Message[]>
  /** 上级会话整级加载（GET /api/sessions/:id/messages）的返回值覆盖 */
  ancestor: Record<string, Message[]>
  /** 上级会话整级加载要返回的 HTTP 状态（413/403/500） */
  ancestorStatus: Record<string, number>
  chatFail: boolean
  statsFail: boolean
  treeFail: boolean
  messageFail: boolean
  createFail: boolean
  searchHold: boolean
  searchIds: string[]
  releaseSearch: (() => void) | null
  chatBodies: Array<{ sessionId: string; text: string; clientMutationId?: string }>
  renameBodies: Array<{ id: string; title: string }>
  createBodies: Array<{ parentId: string; title: string }>
  archiveCalls: string[]
  searchQueries: string[]
}

export function createSnapshot(): AppSnapshot {
  const grandchild: Session = { id: 'grand', parentId: 'child', title: '孙会话', createdAt: at + 2, archived: 0, pinned: false }
  const child: Session = { id: 'child', parentId: 'main', title: '子会话', createdAt: at + 1, archived: 0, pinned: false, children: [grandchild] }
  const root: Session = { id: 'main', parentId: '', title: '主会话', createdAt: at, archived: 0, pinned: false, children: [child] }
  return {
    tree: [root],
    messages: {
      main: [{ id: 'main-1', sessionId: 'main', sessionTitle: '主会话', role: 'user', text: '主会话消息', at: at + 1, status: 'done' }],
      child: [{ id: 'child-1', sessionId: 'child', sessionTitle: '子会话', role: 'user', text: '子会话消息', at: at + 2, status: 'done' }],
      grand: [{ id: 'grand-1', sessionId: 'grand', sessionTitle: '孙会话', role: 'user', text: '孙会话消息', at: at + 3, status: 'done' }],
    },
    ancestor: {},
    ancestorStatus: {},
    chatFail: false,
    statsFail: false,
    treeFail: false,
    messageFail: false,
    createFail: false,
    searchHold: false,
    searchIds: [],
    releaseSearch: null,
    chatBodies: [],
    renameBodies: [],
    createBodies: [],
    archiveCalls: [],
    searchQueries: [],
  }
}

export function flattenSessions(roots: readonly Session[]): Session[] {
  const flat: Session[] = []
  const walk = (sessions: readonly Session[]): void => {
    for (const session of sessions) {
      flat.push(session)
      if (session.children?.length) walk(session.children)
    }
  }
  walk(roots)
  return flat
}

export function findSession(snap: AppSnapshot, id: string): Session | undefined {
  return flattenSessions(snap.tree).find((session) => session.id === id)
}

export function lastMessageFor(snap: AppSnapshot, sessionId: string): Message | undefined {
  return snap.messages[sessionId]?.[snap.messages[sessionId].length - 1]
}

export function projection(sessionId: string): SessionSpecProjection {
  const empty = { total: 0, items: [], hasMore: false }
  return {
    sessionId, status: 'idle', revision: 1, updatedAt: at, goal: null, constraints: [], inputs: [],
    tasks: { done: empty, running: empty, pending: empty },
    deliverables: empty,
    pendingConfirmations: { total: 0 },
  }
}

export function appHandlers(snap: AppSnapshot): Array<ReturnType<typeof http.get>> {
  return [
    http.get('/api/sessions/tree', () => {
      if (snap.treeFail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      return HttpResponse.json({ tree: snap.tree, sessions: flattenSessions(snap.tree) })
    }),
    http.get('/api/messages/search', ({ request }) => {
      const query = new URL(request.url).searchParams.get('q') ?? ''
      snap.searchQueries.push(query)
      const body = { messages: snap.searchIds.map((sessionId) => ({ sessionId })) }
      if (snap.searchHold) {
        return new Promise<Response>((resolve) => { snap.releaseSearch = () => resolve(HttpResponse.json(body)) })
      }
      return HttpResponse.json(body)
    }),
    http.get('/api/messages', ({ request }) => {
      if (snap.messageFail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      const sessionId = new URL(request.url).searchParams.get('sessionId') ?? 'main'
      return HttpResponse.json({ messages: snap.messages[sessionId] ?? [] })
    }),
    http.get('/api/sessions/:id/messages', ({ params }) => {
      const sessionId = String(params.id)
      const status = snap.ancestorStatus[sessionId]
      if (status) return HttpResponse.json({ code: 'ERROR' }, { status })
      return HttpResponse.json({ messages: snap.ancestor[sessionId] ?? snap.messages[sessionId] ?? [] })
    }),
    http.post('/api/chat', async ({ request }) => {
      const body = await request.json() as { sessionId: string; text: string; clientMutationId?: string }
      snap.chatBodies.push(body)
      if (snap.chatFail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      const session = findSession(snap, body.sessionId)
      const message: Message = {
        id: `sent-${snap.chatBodies.length}`,
        sessionId: body.sessionId,
        sessionTitle: session?.title ?? '主会话',
        role: 'user',
        text: body.text,
        at: at + 100 + snap.chatBodies.length,
        status: 'done',
      }
      snap.messages[body.sessionId] = [...(snap.messages[body.sessionId] ?? []), message]
      return HttpResponse.json({ ok: true })
    }),
    http.post('/api/sessions', async ({ request }) => {
      const body = await request.json() as { parentId: string; title: string }
      snap.createBodies.push(body)
      if (snap.createFail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      return HttpResponse.json({ id: 'session-new', parentId: body.parentId, title: body.title })
    }),
    http.patch('/api/sessions/:id', async ({ params, request }) => {
      const body = await request.json() as { title: string }
      const id = String(params.id)
      snap.renameBodies.push({ id, title: body.title })
      const session = findSession(snap, id)
      if (session) session.title = body.title
      return HttpResponse.json({ id, title: body.title })
    }),
    http.post('/api/sessions/:id/archive', ({ params }) => {
      const id = String(params.id)
      snap.archiveCalls.push(`archive:${id}`)
      const session = findSession(snap, id)
      if (session) session.archived = 1
      return HttpResponse.json({ ok: true })
    }),
    http.post('/api/sessions/:id/unarchive', ({ params }) => {
      const id = String(params.id)
      snap.archiveCalls.push(`unarchive:${id}`)
      const session = findSession(snap, id)
      if (session) session.archived = 0
      return HttpResponse.json({ ok: true })
    }),
    http.get('/api/permissions', () => HttpResponse.json({ permissions: null })),
    http.get('/api/sessions/:id/spec-projection', ({ params }) => HttpResponse.json(projection(String(params.id)))),
    http.get('/api/deliverables', () => HttpResponse.json({ deliverables: [], total: 0 })),
    http.get('/api/stats', () => {
      if (snap.statsFail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      return HttpResponse.json({ buckets: [], totals: { tokens: 1200, messages: 2, tasks: 0 } })
    }),
  ]
}

type WsListener = (event: { data?: string }) => void

/** 与 App.integration.test.tsx 中的受控 WebSocket 一致：测试可 emit('message'|'close')。 */
export class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  readyState = 0
  sent: string[] = []
  private listeners = new Map<string, Set<WsListener>>()

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN
      this.emit('open', {})
    })
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const set = this.listeners.get(type) ?? new Set<WsListener>()
    set.add(listener as unknown as WsListener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as unknown as WsListener)
  }

  send(data: string): void { this.sent.push(data) }
  /** 只改状态、不派发 close：避免组件卸载时触发重连副作用。模拟断线请用 emit('close')。 */
  close(): void { this.readyState = MockWebSocket.CLOSED }

  emit(type: string, event: { data?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

export function deltaFrame(id: string, delta: string, seq?: number): string {
  return JSON.stringify({ type: 'reply.delta', data: { id, delta, seq } })
}

export function eventFrame(type: 'message.created' | 'reply.done' | 'message.done', id: string, seq?: number): string {
  return JSON.stringify({ type, data: { id, seq } })
}

/** 让 React effect、rAF（setup 中替换为 setTimeout 0）与 300/1400ms 防抖刷新跑完。 */
export async function flush(ms = 30): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
}
