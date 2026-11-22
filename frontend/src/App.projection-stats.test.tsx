import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import App from './app'
import {
  appHandlers,
  createSnapshot,
  eventFrame,
  flush,
  MockWebSocket,
  unreadFrame,
  type AppSnapshot,
} from './App.test-utils'
import type { SessionSpecProjection } from './types'

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
  vi.restoreAllMocks()
})

afterAll(() => {
  server.close()
  vi.unstubAllGlobals()
})

function sessionRow(title: string): HTMLElement {
  // 对话区的「显示上级会话」按钮也带 title，按侧栏标题节点定位会话行。
  const label = Array.from(document.querySelectorAll<HTMLElement>('.session-title'))
    .find((item) => item.getAttribute('title') === title)
  return label?.closest('.session-row') as HTMLElement
}

function spec(overrides: Partial<SessionSpecProjection> = {}): SessionSpecProjection {
  const empty = { total: 0, items: [], hasMore: false }
  return {
    sessionId: 'main',
    status: 'running',
    revision: 1,
    updatedAt: 100,
    goal: null,
    constraints: [],
    inputs: [],
    tasks: { done: empty, running: empty, pending: empty },
    deliverables: empty,
    pendingConfirmations: { total: 0 },
    ...overrides,
  }
}

describe('右栏投影的条件请求', () => {
  it('304 保留缓存数据，不显示骨架与错误；200 时更新数据与 ETag', async () => {
    const requests: Array<{ sessionId: string; taskLimit: string; ifNoneMatch: string | null }> = []
    const revisions = new Map<string, number>()
    let delayNext304: (() => void) | null = null
    let block304 = false

    server.use(http.get('/api/sessions/:id/spec-projection', async ({ params, request }) => {
      const sessionId = String(params.id)
      const taskLimit = new URL(request.url).searchParams.get('taskLimit') ?? ''
      const ifNoneMatch = request.headers.get('If-None-Match')
      requests.push({ sessionId, taskLimit, ifNoneMatch })
      const revision = revisions.get(sessionId) ?? 1
      const etag = `"spec-${sessionId}-${taskLimit}-${revision}"`
      if (ifNoneMatch === etag) {
        if (block304) {
          block304 = false
          await new Promise<void>((resolve) => { delayNext304 = resolve })
        }
        return new HttpResponse(null, { status: 304, headers: { ETag: etag } })
      }
      return HttpResponse.json(
        spec({ sessionId, revision, goal: `目标 ${sessionId} rev ${revision}` }),
        { headers: { ETag: etag } },
      )
    }))

    render(<App />)
    await screen.findByText('目标 main rev 1')

    fireEvent.click(sessionRow('子会话'))
    await screen.findByText('目标 child rev 1')

    // 切回主会话：命中上次的 ETag，服务端回 304，且响应刻意挂起以观察等待期间的状态。
    const previousEtags = requests.filter((item) => item.sessionId === 'main' && item.taskLimit === '3')
    expect(previousEtags[0]?.ifNoneMatch).toBeNull()
    block304 = true
    fireEvent.click(sessionRow('主会话'))

    await waitFor(() => { expect(delayNext304).not.toBeNull() })
    expect(screen.getByText('目标 main rev 1')).toBeInTheDocument()
    expect(screen.queryByText('右栏加载中…')).toBeNull()
    expect(screen.queryByText('右栏加载失败')).toBeNull()
    expect(screen.queryByText('暂无会话投影')).toBeNull()

    await act(async () => { delayNext304?.() })
    await flush(40)
    expect(screen.getByText('目标 main rev 1')).toBeInTheDocument()
    expect(screen.queryByText('右栏加载失败')).toBeNull()
    const mainRequests = requests.filter((item) => item.sessionId === 'main' && item.taskLimit === '3')
    expect(mainRequests.at(-1)?.ifNoneMatch).toBe('"spec-main-3-1"')

    // 服务端数据变化后 ETag 也变：下一次请求回 200，右栏更新到新 revision。
    revisions.set('main', 2)
    fireEvent.click(sessionRow('子会话'))
    await screen.findByText('目标 child rev 1')
    fireEvent.click(sessionRow('主会话'))
    await screen.findByText('目标 main rev 2')
    const updated = requests.filter((item) => item.sessionId === 'main' && item.taskLimit === '3').at(-1)
    expect(updated?.ifNoneMatch).toBe('"spec-main-3-1"')
    expect(screen.queryByText('右栏加载失败')).toBeNull()
  })
})

describe('底部汇总的节流刷新', () => {
  it('新消息事件在 1 秒窗口内只请求一次 /api/stats，并更新底部数字', async () => {
    let statsCalls = 0
    let messages = 2
    server.use(http.get('/api/stats', () => {
      statsCalls += 1
      return HttpResponse.json({ buckets: [], totals: { tokens: 1200, messages, tasks: 0 } })
    }))

    render(<App />)
    await screen.findByText(/2 条消息/)
    expect(statsCalls).toBe(1)

    messages = 334
    const socket = MockWebSocket.instances[0]
    act(() => {
      socket.emit('message', { data: eventFrame('message.created', 'new-1') })
      socket.emit('message', { data: eventFrame('message.done', 'new-2') })
      socket.emit('message', { data: unreadFrame('child') })
    })

    await waitFor(() => { expect(statsCalls).toBe(2) })
    await screen.findByText(/334 条消息/)
    // 窗口内到达的后续事件不再发请求。
    act(() => {
      socket.emit('message', { data: eventFrame('message.created', 'new-3') })
    })
    await flush(250)
    expect(statsCalls).toBe(2)
    expect(screen.getByText(/334 条消息/)).toBeInTheDocument()
  })

  it('后台刷新失败时保留旧值，只记一条 console.warn，底部不进错误态', async () => {
    let statsCalls = 0
    let messages = 2
    let fail = false
    server.use(http.get('/api/stats', () => {
      statsCalls += 1
      if (fail) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      return HttpResponse.json({ buckets: [], totals: { tokens: 1200, messages, tasks: 0 } })
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<App />)
    await screen.findByText(/2 条消息/)
    messages = 334
    const socket = MockWebSocket.instances[0]
    act(() => { socket.emit('message', { data: eventFrame('message.created', 'ok-1') }) })
    await screen.findByText(/334 条消息/)
    expect(statsCalls).toBe(2)

    // 等过 1 秒节流窗口，再制造一次失败的后台刷新。
    await flush(1100)
    fail = true
    messages = 400
    act(() => { socket.emit('message', { data: eventFrame('message.created', 'fail-1') }) })
    await waitFor(() => { expect(statsCalls).toBe(3) })
    await flush(80)

    expect(screen.getByText(/334 条消息/)).toBeInTheDocument()
    expect(screen.queryByText('统计加载失败')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('全局统计刷新失败，保留旧值', expect.anything())
  })
})
