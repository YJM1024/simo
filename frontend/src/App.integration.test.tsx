import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import App from './app'
import type { Message, Session, SessionSpecProjection, TaskCounts, TaskDetailPayload, TaskGraphPayload, TaskView } from './types'

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
  await screen.findByTitle('子会话')
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
    expect(await screen.findByText('消息过多，暂不能完整加载')).toBeInTheDocument()

    ancestorMode = 'ok'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    await waitFor(() => expect(screen.queryByText('消息过多，暂不能完整加载')).not.toBeInTheDocument())
    expect(screen.getByText('父会话消息')).toBeInTheDocument()
  })

  it('maps 403 and treats an empty ancestor as visited', async () => {
    const user = await openChild()
    ancestorMode = '403'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    expect(await screen.findByText('无权读取该上级会话')).toBeInTheDocument()

    ancestorMode = 'empty'
    await user.click(screen.getByRole('button', { name: /显示上级会话/ }))
    // 空上级只记入已访问，不渲染提示；入口消失，消息不重复。
    await waitFor(() => expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument())
    expect(screen.queryByText('无权读取该上级会话')).not.toBeInTheDocument()
    expect(screen.getAllByText('子会话消息')).toHaveLength(1)
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

})

function taskView(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: at, updatedAt: at + 1, stepCount: 4, doneStepCount: 1, outputCount: 1, ...overrides,
  }
}

const taskCounts = (overrides: Partial<TaskCounts> = {}): TaskCounts => ({ all: 3, pending: 0, running: 2, failed: 0, done: 1, ...overrides })

describe('App task panel and graph (F-CONV-009)', () => {
  it('opens the tasks tab and refilters through /api/sessions/:id/tasks', async () => {
    const queries: Array<Record<string, string>> = []
    server.use(http.get('/api/sessions/:id/tasks', ({ request }) => {
      const search = Object.fromEntries(new URL(request.url).searchParams)
      queries.push(search)
      const status = search.status
      const tasks = status === 'done' ? [taskView({ id: 'task-3', title: '已完成任务', displayStatus: 'done' })] : [taskView(), taskView({ id: 'task-2', title: '任务二' })]
      return HttpResponse.json({ tasks, counts: taskCounts(), total: 3, hasMore: false })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    await user.click(await within(aside).findByRole('button', { name: '任务，2 个进行中' }))
    expect(aside).toHaveAttribute('data-tab', 'tasks')
    expect(await screen.findByText('任务二')).toBeInTheDocument()
    expect(queries[0]).toEqual({ limit: '50' })

    await user.click(within(aside).getByRole('button', { name: /已完成/ }))
    await waitFor(() => expect(queries.some((query) => query.status === 'done')).toBe(true))
    expect(await screen.findByText('已完成任务')).toBeInTheDocument()
    expect(screen.queryByText('任务二')).not.toBeInTheDocument()
  })

  it('appends the next page with the before cursor without duplicating rows', async () => {
    const befores: Array<string | undefined> = []
    server.use(http.get('/api/sessions/:id/tasks', ({ request }) => {
      const before = new URL(request.url).searchParams.get('before') ?? undefined
      befores.push(before)
      return HttpResponse.json(before
        ? { tasks: [taskView({ id: 'task-3', title: '第三页任务' })], counts: taskCounts(), total: 3, hasMore: false }
        : { tasks: [taskView(), taskView({ id: 'task-2', title: '任务二' })], counts: taskCounts(), total: 3, hasMore: true, nextBefore: 'cursor-1' })
    }))
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    await user.click(await within(aside).findByRole('button', { name: '任务，2 个进行中' }))
    await user.click(await screen.findByRole('button', { name: '加载更多' }))
    expect(await screen.findByText('第三页任务')).toBeInTheDocument()
    expect(befores).toEqual([undefined, 'cursor-1'])
    expect(screen.getAllByText('任务一')).toHaveLength(1)
  })

  it('opens the task graph from the topbar and a node opens its detail', async () => {
    const graph: TaskGraphPayload = {
      nodes: [
        { id: 'task-1', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running' },
        { id: 'task-2', title: '任务二', mode: 'plan', status: 'failed', displayStatus: 'failed' },
      ],
      edges: [{ from: 'task-1', to: 'task-2' }],
      layers: [{ index: 0, nodeIds: ['task-1'] }, { index: 1, nodeIds: ['task-2'] }],
      total: 2,
    }
    const detail: TaskDetailPayload = { task: taskView(), steps: [{ id: 's-1', seq: 1, title: '收集素材', status: 'done', traceCount: 0, traces: [] }], currentStepId: 's-1', traces: [], tracesHasMore: false, deliverables: [] }
    server.use(
      http.get('/api/sessions/:id/tasks', () => HttpResponse.json({ tasks: [taskView(), taskView({ id: 'task-2', title: '任务二', displayStatus: 'failed' })], counts: taskCounts(), total: 2, hasMore: false })),
      http.get('/api/sessions/:id/task-graph', () => HttpResponse.json(graph)),
      http.get('/api/tasks/:id', () => HttpResponse.json(detail)),
    )
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    await user.click(await screen.findByRole('button', { name: '任务图' }))
    const graphDialog = await screen.findByRole('dialog', { name: '任务图' })
    expect(within(graphDialog).getByText('任务二')).toBeInTheDocument()
    await user.click(within(graphDialog).getByRole('button', { name: /任务一/ }))
    const detailDialog = await screen.findByRole('dialog', { name: '任务详情' })
    expect(within(detailDialog).getByText('收集素材')).toBeInTheDocument()
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

    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    expect(aside).not.toHaveAttribute('data-session')
    await waitFor(() => expect(screen.queryByText('主会话目标')).not.toBeInTheDocument())
    expect(screen.queryByText('进行中')).not.toBeInTheDocument()
    expect(within(aside).getByText('未选择会话')).toBeInTheDocument()
    expect(screen.getByLabelText('消息输入框')).toBeDisabled()
  })
})
