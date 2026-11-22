import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { setupServer } from 'msw/node'
import App from './app'
import { appHandlers, createSnapshot, findSession, flush, MockWebSocket, type AppSnapshot } from './App.test-utils'

const server = setupServer()
let snap: AppSnapshot

beforeAll(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  server.listen({
    onUnhandledFrame({ frame, defaults }) {
      if (frame.protocol === 'ws') return
      defaults.error()
    },
  })
})

beforeEach(() => {
  snap = createSnapshot()
  server.use(...appHandlers(snap))
  MockWebSocket.instances = []
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
  vi.unstubAllGlobals()
})

async function renderApp(): Promise<void> {
  render(<App />)
  await screen.findByText('主会话消息')
}

describe('会话树与实时游标 (AC-SYNC-001)', () => {
  it('renders grandchildren and drops a duplicate node that also appears at the root', async () => {
    // 后端 /api/sessions/tree 同时返回平铺 sessions 与嵌套 tree；这里模拟把孙会话又挂到根上。
    const grand = findSession(snap, 'grand')
    expect(grand).toBeDefined()
    snap.tree = [snap.tree[0], { ...grand!, children: [] }]

    await renderApp()

    expect(await screen.findByText('孙会话')).toBeInTheDocument()
    expect(screen.getAllByText('孙会话')).toHaveLength(1)
    expect(document.querySelectorAll('.session-row')).toHaveLength(3)
    const grandRow = screen.getByTitle('孙会话').closest('.session-row') as HTMLElement
    expect(grandRow).toHaveAttribute('data-depth', '2')
  })

  it('reconnects with the numeric envelope event id as since, never a message id', async () => {
    await renderApp()
    const first = MockWebSocket.instances[0]
    await waitFor(() => expect(first.readyState).toBe(MockWebSocket.OPEN))
    const initial = JSON.parse(first.sent[0] ?? '{}') as { data: Record<string, unknown> }
    expect(initial.data).not.toHaveProperty('since')

    act(() => { first.emit('message', { data: JSON.stringify({ type: 'message.created', id: 17, data: { id: 'msg-abc', seq: 1 } }) }) })
    await flush(20)
    act(() => { first.emit('close', {}) })

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(1), { timeout: 3000 })
    const second = MockWebSocket.instances.at(-1)!
    await waitFor(() => expect(second.readyState).toBe(MockWebSocket.OPEN))
    const resubscribe = JSON.parse(second.sent[0] ?? '{}') as { type: string; data: { sessionId: string; since?: unknown } }
    expect(resubscribe.type).toBe('subscribe')
    expect(resubscribe.data.sessionId).toBe('main')
    expect(resubscribe.data.since).toBe(17)
    expect(typeof resubscribe.data.since).toBe('number')
  })

  it('shows a subscription failure state instead of pretending to stay connected', async () => {
    await renderApp()
    const socket = MockWebSocket.instances[0]
    await waitFor(() => expect(socket.readyState).toBe(MockWebSocket.OPEN))

    act(() => { socket.emit('message', { data: JSON.stringify({ type: 'error', data: { message: 'subscribe.data 非法' } }) }) })

    expect((await screen.findAllByText('订阅失败')).length).toBeGreaterThan(0)
  })
})
