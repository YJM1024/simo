import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from './app'
import type { Message, Session, SessionSpecProjection } from './types'

const at = 1_760_000_000_000

const child: Session = { id: 'child', parentId: 'main', title: '子会话', createdAt: at, archived: 0, pinned: false, messageCount: 1 }
const root: Session = { id: 'main', parentId: '', title: '主会话', createdAt: at - 1000, archived: 0, pinned: false, messageCount: 1, children: [child] }

const mainMessage: Message = { id: 'main-1', sessionId: 'main', role: 'user', text: '主会话消息', at: at + 1, status: 'done' }
const childMessage: Message = { id: 'child-1', sessionId: 'child', role: 'user', text: '子会话消息', at: at + 2, status: 'done' }
const parentMessage: Message = { id: 'parent-1', sessionId: 'main', role: 'agent', text: '父会话消息', at: at + 3, status: 'done', agentId: 'simo' }

function projection(sessionId: string): SessionSpecProjection {
  const empty = { total: 0, items: [], hasMore: false }
  return {
    sessionId, status: 'idle', revision: 1, updatedAt: at, goal: null, constraints: [], inputs: [],
    tasks: { done: empty, running: empty, pending: empty },
    deliverables: empty,
    pendingConfirmations: { total: 0 },
  }
}

let ancestorMode: 'ok' | '413' | '403' | 'empty' = 'ok'
let metricsRanges: string[] = []

const handlers = [
  http.get('/api/sessions/tree', () => HttpResponse.json({ tree: [root], sessions: [root, child] })),
  http.get('/api/messages', ({ request }) => {
    const sessionId = new URL(request.url).searchParams.get('sessionId')
    return HttpResponse.json({ messages: sessionId === 'child' ? [childMessage] : [mainMessage] })
  }),
  http.get('/api/sessions/:id/messages', ({ params }) => {
    if (ancestorMode === '413') return HttpResponse.json({ code: 'TOO_LARGE' }, { status: 413 })
    if (ancestorMode === '403') return HttpResponse.json({ code: 'FORBIDDEN' }, { status: 403 })
    if (ancestorMode === 'empty') return HttpResponse.json({ messages: [] })
    void params
    return HttpResponse.json({ messages: [childMessage, parentMessage] })
  }),
  http.get('/api/permissions', () => HttpResponse.json({ permissions: null })),
  http.get('/api/sessions/:id/spec-projection', ({ params }) => HttpResponse.json(projection(String(params.id)))),
  http.get('/api/deliverables', () => HttpResponse.json({ deliverables: [], total: 0 })),
  http.get('/api/stats', () => HttpResponse.json({ buckets: [], totals: { tokens: 1200, messages: 2, tasks: 0 } })),
  http.get('/api/metrics', ({ request }) => {
    metricsRanges.push(new URL(request.url).searchParams.get('range') ?? '')
    return HttpResponse.json({ range: '7d', timezone: 'Asia/Shanghai', from: at, to: at, totals: { ttftP50Ms: null, ttftP90Ms: null, durationP50Ms: null, durationP90Ms: null, turns: 0, messages: 0, tasks: 0, failures: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 }, series: [] })
  }),
]

const server = setupServer(...handlers)

type WsListener = (event: { data?: string }) => void
class MockWebSocket {
  static OPEN = 1
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
  close(): void { this.readyState = 3 }
  emit(type: string, event: { data?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

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
  ancestorMode = 'ok'
  metricsRanges = []
  MockWebSocket.instances = []
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
  vi.unstubAllGlobals()
})

async function openChild(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('主会话消息')
  await user.click(screen.getByTitle('子会话').closest('.session-row') as HTMLElement)
  await screen.findByText('子会话消息')
  return user
}

describe('App ancestor loading integration (FE-007)', () => {
  it('loads ancestor messages and de-duplicates ids', async () => {
    const user = await openChild()
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByText('父会话消息')).toBeInTheDocument()
    expect(screen.getAllByText('子会话消息')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument()
  })

  it('maps 413 and succeeds when retried', async () => {
    const user = await openChild()
    ancestorMode = '413'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('消息过多，暂不能完整加载')

    ancestorMode = 'ok'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByText('父会话消息')).toBeInTheDocument()
  })

  it('maps 403 and treats an empty ancestor as visited', async () => {
    const user = await openChild()
    ancestorMode = '403'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('无权读取该上级会话')

    ancestorMode = 'empty'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('上级没有消息')
    expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument()
  })

  it('clears the ancestor chain when switching sessions', async () => {
    const user = await openChild()
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByText('父会话消息')).toBeInTheDocument()

    await user.click(screen.getByTitle('主会话').closest('.session-row') as HTMLElement)
    await screen.findByText('主会话消息')
    expect(screen.queryByText('父会话消息')).not.toBeInTheDocument()

    await user.click(screen.getByTitle('子会话').closest('.session-row') as HTMLElement)
    await screen.findByText('子会话消息')
    expect(screen.queryByText('父会话消息')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /显示上级会话/ })).toBeInTheDocument()
  })

  it('restores per-session scroll positions after switching away and back', async () => {
    const user = await openChild()
    const flush = async (): Promise<void> => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)) }) }
    await flush()
    const scroller = document.querySelector('.conversation-scroll') as HTMLElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 })
    scroller.scrollTop = 300
    fireEvent.scroll(scroller)
    await flush()

    await user.click(screen.getByText('主会话', { selector: '.session-title' }).closest('.session-row') as HTMLElement)
    await screen.findByText('主会话消息')
    await flush()
    scroller.scrollTop = 400
    fireEvent.scroll(scroller)
    await flush()

    await user.click(screen.getByText('子会话', { selector: '.session-title' }).closest('.session-row') as HTMLElement)
    await screen.findByText('子会话消息')
    await flush()
    expect(document.querySelector('.conversation-scroll')?.scrollTop).toBe(300)
  })

  it('renders workbench metrics, switches 7d/30d and shows the empty state', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    await user.click(screen.getAllByRole('button', { name: '工作台' })[0])
    expect(await screen.findByRole('region', { name: '工作台' })).toBeInTheDocument()
    expect(await screen.findByText('窗口内暂无指标')).toBeInTheDocument()
    expect(metricsRanges).toEqual(['7d'])
    await user.click(screen.getByRole('button', { name: '30天' }))
    await waitFor(() => expect(metricsRanges).toContain('30d'))
    expect(screen.getByRole('button', { name: '30天' })).toHaveClass('active')
  })

  it('applies WebSocket deltas once and ignores duplicate sequence numbers', async () => {
    render(<App />)
    await screen.findByText('主会话消息')
    const socket = MockWebSocket.instances[0]
    expect(socket).toBeDefined()
    await waitFor(() => expect(socket.readyState).toBe(MockWebSocket.OPEN))
    act(() => {
      socket.emit('message', { data: JSON.stringify({ type: 'reply.delta', data: { id: 'stream-1', delta: '片段', seq: 1 } }) })
    })
    expect(await screen.findByText('片段')).toBeInTheDocument()
    act(() => {
      socket.emit('message', { data: JSON.stringify({ type: 'reply.delta', data: { id: 'stream-1', delta: '片段', seq: 1 } }) })
    })
    await waitFor(() => expect(screen.getAllByText(/片段/)).toHaveLength(1))
  })
})

describe('App sidebar counts and task group top-up (CONV-008-02 / CONV-001-05)', () => {
  it('shows each session own message count in its row while the footer keeps the global total', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const row = (title: string): HTMLElement => screen.getByText(title, { selector: '.session-title' }).closest('.session-row') as HTMLElement
    const rowCount = (title: string): Element | null => row(title).querySelector('.session-count')

    await waitFor(() => expect(rowCount('主会话')).toHaveTextContent('1'))
    expect(screen.getByText(/2 条消息/)).toBeInTheDocument()

    await user.click(row('子会话'))
    await screen.findByText('子会话消息')
    await waitFor(() => expect(rowCount('子会话')).toHaveTextContent('1'))
    // 每行的数字来自该会话自己的 messageCount，不随选中切换出现或消失。
    expect(rowCount('主会话')).toHaveTextContent('1')
    expect(screen.getByText(/2 条消息/)).toBeInTheDocument()

    await user.click(row('主会话'))
    await screen.findByText('主会话消息')
    await waitFor(() => expect(rowCount('主会话')).toHaveTextContent('1'))
  })

  it('keeps the row count at the backend messageCount when the loaded message page is capped at 100', async () => {
    const cappedPage: Message[] = Array.from({ length: 100 }, (_, index) => ({
      id: `bulk-${index}`, sessionId: 'main', role: 'user', text: `批量消息 ${index}`, at: at + index, status: 'done',
    }))
    const countedChild: Session = { ...child, messageCount: 42 }
    const countedRoot: Session = { ...root, messageCount: 137, children: [countedChild] }
    server.use(
      http.get('/api/sessions/tree', () => HttpResponse.json({ tree: [countedRoot], sessions: [countedRoot, countedChild] })),
      http.get('/api/messages', () => HttpResponse.json({ messages: cappedPage })),
    )
    render(<App />)
    await screen.findByText('批量消息 99')
    const row = (title: string): HTMLElement => screen.getByText(title, { selector: '.session-title' }).closest('.session-row') as HTMLElement
    // 消息列表被接口上限截到 100 条，行数字仍取后端的 137：不再按 messages 过滤计数，也就没有 100 条截断。
    await waitFor(() => expect(row('主会话').querySelector('.session-count')).toHaveTextContent('137'))
    expect(row('子会话').querySelector('.session-count')).toHaveTextContent('42')
  })

  it('requests taskLimit=50 on first expand and renders the full group with matching counts', async () => {
    const taskLimits: string[] = []
    const empty = { total: 0, items: [], hasMore: false }
    const doneItem = (n: number) => ({ id: `done-${n}`, title: `完成任务 ${n}`, state: 'done', updatedAt: at + n, messageId: `msg-${n}` })
    server.use(http.get('/api/sessions/:id/spec-projection', ({ request, params }) => {
      const limit = new URL(request.url).searchParams.get('taskLimit') ?? ''
      taskLimits.push(limit)
      const count = limit === '50' ? 6 : 3
      return HttpResponse.json({
        ...projection(String(params.id)),
        tasks: { done: { total: 6, items: [0, 1, 2, 3, 4, 5].slice(0, count).map(doneItem), hasMore: count < 6 }, running: empty, pending: empty },
      })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const doneHead = await screen.findByRole('button', { name: /已完成/ })
    await waitFor(() => expect(doneHead).toHaveTextContent('3/6'))
    expect(screen.queryByText('完成任务 5')).not.toBeInTheDocument()

    await user.click(doneHead)
    await waitFor(() => expect(taskLimits).toContain('50'))
    await waitFor(() => expect(doneHead).toHaveTextContent('6/6'))
    expect(screen.getByText('完成任务 5')).toBeInTheDocument()
    expect(taskLimits.filter((limit) => limit === '50')).toHaveLength(1)
  })

  it('tops up a pending group from 3 to its total of 4', async () => {
    const taskLimits: string[] = []
    const empty = { total: 0, items: [], hasMore: false }
    const pendingItem = (n: number) => ({ id: `pending-${n}`, title: `待开始任务 ${n}`, state: 'pending', updatedAt: at + n, messageId: `msg-pending-${n}` })
    server.use(http.get('/api/sessions/:id/spec-projection', ({ request, params }) => {
      const limit = new URL(request.url).searchParams.get('taskLimit') ?? ''
      taskLimits.push(limit)
      const items = [0, 1, 2, 3].slice(0, limit === '50' ? 4 : 3).map(pendingItem)
      return HttpResponse.json({
        ...projection(String(params.id)),
        tasks: { done: empty, running: empty, pending: { total: 4, items, hasMore: items.length < 4 } },
      })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const queuedHead = await screen.findByRole('button', { name: /未开始/ })
    await waitFor(() => expect(queuedHead).toHaveTextContent('3/4'))
    expect(screen.queryByText('待开始任务 3')).not.toBeInTheDocument()

    await user.click(queuedHead)
    await waitFor(() => expect(taskLimits).toContain('50'))
    await waitFor(() => expect(queuedHead).toHaveTextContent('4/4'))
    expect(screen.getByText('待开始任务 3')).toBeInTheDocument()
  })

  it('shows a visible error when the top-up fails and retries the request', async () => {
    const taskLimits: string[] = []
    const empty = { total: 0, items: [], hasMore: false }
    const doneItem = (n: number) => ({ id: `retry-done-${n}`, title: `重试任务 ${n}`, state: 'done', updatedAt: at + n, messageId: `msg-retry-${n}` })
    let failTopUp = true
    server.use(http.get('/api/sessions/:id/spec-projection', ({ request, params }) => {
      const limit = new URL(request.url).searchParams.get('taskLimit') ?? ''
      taskLimits.push(limit)
      if (limit === '50' && failTopUp) return HttpResponse.json({ code: 'INTERNAL' }, { status: 500 })
      const count = limit === '50' ? 6 : 3
      return HttpResponse.json({
        ...projection(String(params.id)),
        tasks: { done: { total: 6, items: [0, 1, 2, 3, 4, 5].slice(0, count).map(doneItem), hasMore: count < 6 }, running: empty, pending: empty },
      })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const doneHead = await screen.findByRole('button', { name: /已完成/ })
    await waitFor(() => expect(doneHead).toHaveTextContent('3/6'))

    await user.click(doneHead)
    expect(await screen.findByText('右栏加载失败')).toBeInTheDocument()
    expect(screen.getByText('重试')).toBeInTheDocument()
    expect(taskLimits).toContain('50')

    failTopUp = false
    const beforeRetry = taskLimits.length
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(taskLimits.length).toBeGreaterThan(beforeRetry))
    await waitFor(() => expect(screen.queryByText('右栏加载失败')).not.toBeInTheDocument())
    expect(await screen.findByText('重试任务 0')).toBeInTheDocument()

    // 重试先取回首屏 3 条；再展开同组时补取成功，恢复到 6/6（两条 AC-008-05 路径都走通）。
    const retriedHead = screen.getByRole('button', { name: /已完成/ })
    expect(retriedHead).toHaveTextContent('3/6')
    await user.click(retriedHead)
    await waitFor(() => expect(taskLimits.filter((limit) => limit === '50')).toHaveLength(2))
    await waitFor(() => expect(retriedHead).toHaveTextContent('6/6'))
    expect(screen.getByText('重试任务 5')).toBeInTheDocument()
  })
})

describe('App empty tree empty states (CONV-008-03)', () => {
  it('does not keep the main session in the middle or right panel when tree and stats are empty', async () => {
    let releaseTree!: () => void
    const treeGate = new Promise<void>((resolve) => { releaseTree = resolve })
    server.use(
      // 先卡住空树响应，等主会话渲染出来再放行：确定性地证明空树到达后会清掉已渲染的旧会话内容。
      http.get('/api/sessions/tree', async () => {
        await treeGate
        return HttpResponse.json({ tree: [], sessions: [] })
      }),
      http.get('/api/stats', () => HttpResponse.json({ buckets: [], totals: { tokens: 0, messages: 0, tasks: 0 } })),
      http.get('/api/sessions/:id/spec-projection', () => HttpResponse.json({ ...projection('main'), goal: '主会话目标', status: 'active' })),
    )
    render(<App />)
    // 首屏先按 main 占位并渲染主会话，空树放行后必须清掉。
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()
    releaseTree()
    await waitFor(() => expect(screen.queryByText('主会话消息')).not.toBeInTheDocument())
    expect(await screen.findByText('暂无会话')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('主会话消息')).not.toBeInTheDocument())
    expect(await screen.findByText('开始和司墨对话')).toBeInTheDocument()

    const aside = screen.getByRole('complementary', { name: '会话概览' })
    expect(aside).not.toHaveAttribute('data-session')
    await waitFor(() => expect(screen.queryByText('主会话目标')).not.toBeInTheDocument())
    expect(screen.queryByText('进行中')).not.toBeInTheDocument()
    expect(within(aside).getByText('未选择会话')).toBeInTheDocument()
    expect(screen.getByLabelText('消息输入框')).toBeDisabled()
  })
})
