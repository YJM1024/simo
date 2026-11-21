import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import {
  appHandlers,
  at,
  createSnapshot,
  deltaFrame,
  eventFrame,
  flush,
  MockWebSocket,
  type AppSnapshot,
} from './App.test-utils'

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

function sessionRow(title: string): HTMLElement {
  return screen.getByTitle(title).closest('.session-row') as HTMLElement
}

const messageInput = (): HTMLTextAreaElement => screen.getByLabelText('消息输入框') as HTMLTextAreaElement

// Sidebar 头部与 "会话" 分组各有一个「新建会话」按钮（library.tsx:128、141），取第一个即可。
function createSessionButton(): HTMLElement {
  return screen.getAllByRole('button', { name: '新建会话' })[0]
}

async function renderApp(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('主会话消息')
  return user
}

function conversation(): HTMLElement {
  return document.querySelector('.conversation-scroll') as HTMLElement
}

function messageSessionIds(): Array<string | null> {
  return [...document.querySelectorAll('.conversation-scroll .msg')].map((node) => node.getAttribute('data-session-id'))
}

describe('App session lifecycle (PRD-CONV-002)', () => {
  it('creates a session, activates it and renders the empty conversation state', async () => {
    const user = await renderApp()
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    expect(snap.createBodies[0]).toMatchObject({ parentId: 'main', title: '新会话' })
    expect(await screen.findByRole('heading', { name: '新会话' })).toBeInTheDocument()
    expect(await screen.findByText('开始和司墨对话')).toBeInTheDocument()
    expect(screen.getByText('发送第一条消息')).toBeInTheDocument()
    expect(sessionRow('新会话')).toHaveClass('is-active')
  })

  it('surfaces a create-session failure and keeps the previous active session', async () => {
    const user = await renderApp()
    snap.createFail = true
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    // 与发送失败一致：错误同时出现在 Composer alert 与会话内 err-text
    expect((await screen.findAllByText('请求失败（500），请稍后重试')).length).toBeGreaterThan(0)
    expect(sessionRow('主会话')).toHaveClass('is-active')
    expect(screen.queryByTitle('新会话')).not.toBeInTheDocument()
  })

  it('renames a session with PATCH and refreshes list and header', async () => {
    const user = await renderApp()
    await user.dblClick(sessionRow('主会话'))
    const input = screen.getByLabelText('重命名会话')
    await user.clear(input)
    await user.type(input, '新主会话{Enter}')
    await waitFor(() => expect(snap.renameBodies).toHaveLength(1))
    expect(snap.renameBodies[0]).toEqual({ id: 'main', title: '新主会话' })
    expect(await screen.findByRole('heading', { name: '新主会话' })).toBeInTheDocument()
    expect(await screen.findByTitle('新主会话')).toBeInTheDocument()
    expect(screen.queryByTitle('主会话')).not.toBeInTheDocument()
  })

  it('archives the active session, hides it by default and renders it read-only when shown', async () => {
    const user = await renderApp()
    await user.click(within(sessionRow('主会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '归档' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['archive:main']))
    await waitFor(() => expect(screen.queryByTitle('主会话')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '显示归档' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: '显示归档' }))
    expect(sessionRow('主会话')).toHaveClass('is-archived')
    expect(screen.getByText('已归档 · 只读')).toBeInTheDocument()
    expect(messageInput()).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  it('restores an archived session through the row menu', async () => {
    snap.tree[0].archived = 1
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    expect(screen.queryByTitle('主会话')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '显示归档' }))
    await user.click(within(sessionRow('主会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '恢复' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['unarchive:main']))
    await waitFor(() => expect(screen.queryByText('已归档 · 只读')).not.toBeInTheDocument())
    expect(sessionRow('主会话')).not.toHaveClass('is-archived')
    expect(messageInput()).not.toBeDisabled()
  })
})

describe('App session search (PRD-CONV-003 / A5 真实数据)', () => {
  it('keeps sessions whose messages match the server-side search, even when titles do not', async () => {
    const user = await renderApp()
    expect(screen.getByTitle('主会话')).toBeInTheDocument()
    expect(screen.getByTitle('子会话')).toBeInTheDocument()

    snap.searchHold = true
    snap.searchIds = ['main']
    await user.type(screen.getByLabelText('搜索会话'), 'token')
    await waitFor(() => expect(snap.searchQueries).toContain('token'), { timeout: 2000 })
    // 服务端检索未返回前只显示"搜索中…"，不能展示未过滤的假结果
    expect(screen.getByText('搜索中…')).toBeInTheDocument()

    act(() => { snap.releaseSearch?.() })
    await waitFor(() => expect(screen.queryByTitle('子会话')).not.toBeInTheDocument())
    expect(screen.getByTitle('主会话')).toBeInTheDocument()
  })

  it('shows the no-match empty state when the server finds nothing', async () => {
    const user = await renderApp()
    snap.searchIds = []
    await user.type(screen.getByLabelText('搜索会话'), '不存在的关键字')
    expect(await screen.findByText('没有匹配的会话', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('never renders a fake zero when the stats endpoint fails', async () => {
    snap.statsFail = true
    render(<App />)
    await screen.findByText('主会话消息')
    expect(await screen.findByText('统计加载失败')).toBeInTheDocument()
    const quota = document.querySelector('.quota') as HTMLElement
    // 用量显示占位符而不是 0，会话/消息计数也不编造数字
    expect(within(quota).getByText('—')).toBeInTheDocument()
    expect(quota).not.toHaveTextContent('0 条消息')
    expect(quota).not.toHaveTextContent('0 个会话')
  })
})

describe('App message sending (PRD-CONV-005)', () => {
  it('sends with a client mutation id and appends the persisted message', async () => {
    const user = await renderApp()
    await user.type(messageInput(), '你好{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(1))
    expect(snap.chatBodies[0]).toMatchObject({ sessionId: 'main', text: '你好' })
    expect(snap.chatBodies[0].clientMutationId).toEqual(expect.stringContaining(':'))
    expect(await screen.findByText('你好')).toBeInTheDocument()
    expect(messageInput()).toHaveValue('')
  })

  it('shows the server error on failure and lets the message be sent again without duplicates', async () => {
    const user = await renderApp()
    snap.chatFail = true
    await user.type(messageInput(), '需要重试{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(1))
    // 失败时错误同时出现在 Composer alert 与会话内 err-text 两处
    const alerts = await screen.findAllByText('请求失败（500），请稍后重试')
    expect(alerts.length).toBeGreaterThan(0)
    expect(within(document.querySelector('.composer') as HTMLElement).getByRole('alert')).toHaveTextContent('请求失败（500），请稍后重试')

    snap.chatFail = false
    await user.clear(messageInput())
    await user.type(messageInput(), '需要重试{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(2))
    await waitFor(() => expect(screen.getAllByText('需要重试')).toHaveLength(1))
    expect(snap.messages.main.filter((message) => message.text === '需要重试')).toHaveLength(1)
  })

  it('accumulates stream deltas once per sequence and closes the stream on reply.done', async () => {
    render(<App />)
    await screen.findByText('主会话消息')
    const socket = MockWebSocket.instances[0]
    await waitFor(() => expect(socket.readyState).toBe(MockWebSocket.OPEN))

    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '正在', 1) }) })
    expect(await screen.findByText('正在')).toBeInTheDocument()
    expect(document.querySelector('.stream-caret')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()

    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '正在', 1) }) })
    await flush(30)
    expect(screen.getAllByText('正在')).toHaveLength(1)

    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '处理', 2) }) })
    expect(await screen.findByText('正在处理')).toBeInTheDocument()

    snap.messages.main = [
      ...snap.messages.main,
      { id: 'stream-1', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '正在处理完成', at: at + 50, status: 'done', agentId: 'simo' },
    ]
    act(() => { socket.emit('message', { data: eventFrame('reply.done', 'stream-1') }) })
    expect(await screen.findByText('正在处理完成')).toBeInTheDocument()
    await waitFor(() => expect(document.querySelector('.stream-caret')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
  })

  it('stops a stream, marks it stopped and ignores later deltas', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const socket = MockWebSocket.instances[0]
    await waitFor(() => expect(socket.readyState).toBe(MockWebSocket.OPEN))
    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '生成中', 1) }) })
    expect(await screen.findByText('生成中')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => expect(document.querySelector('.stream-caret')).not.toBeInTheDocument())
    expect(socket.sent.some((frame) => frame.includes('"correct"'))).toBe(true)

    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '追加', 2) }) })
    await flush(30)
    expect(screen.queryByText('生成中追加')).not.toBeInTheDocument()
    expect(screen.getByText('生成中')).toBeInTheDocument()
  })

  it('reconnects after a socket close, reports the status and reloads missed messages', async () => {
    render(<App />)
    await screen.findByText('主会话消息')
    const first = MockWebSocket.instances[0]
    await waitFor(() => expect(first.readyState).toBe(MockWebSocket.OPEN))
    expect(screen.getByText('已连接')).toBeInTheDocument()

    snap.messages.main = [
      ...snap.messages.main,
      { id: 'missed-1', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '断线期间的消息', at: at + 60, status: 'done' },
    ]
    act(() => { first.emit('close', {}) })
    expect(await screen.findAllByText('重连中')).not.toHaveLength(0)

    await waitFor(() => expect(MockWebSocket.instances.length).toBeGreaterThan(1), { timeout: 5000 })
    expect(await screen.findByText('断线期间的消息', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(await screen.findByText('已连接')).toBeInTheDocument()
  })
})

describe('App ancestor chain (PRD-CONV-007)', () => {
  it('loads the parent session before the current messages and drops the control once exhausted', async () => {
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')
    expect(screen.getByRole('button', { name: '显示上级会话：主会话' })).toBeInTheDocument()
    expect(messageSessionIds()).toEqual(['child'])

    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()
    await waitFor(() => expect(messageSessionIds()).toEqual(['main', 'child']))

    expect([...document.querySelectorAll('.session-divider')].map((node) => node.textContent)).toEqual(['主会话', '子会话'])
    expect(document.querySelectorAll('.tlg-session.is-ancestor-session')).toHaveLength(1)
    expect(document.querySelectorAll('.tlg-session.is-current-session')).toHaveLength(1)
    expect(document.querySelectorAll('.tl-bar')).toHaveLength(2)
    // 链已到根：不再提供"显示上级会话"入口
    await waitFor(() => expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument())
  })

  it('reports an empty ancestor and stops offering that level', async () => {
    snap.ancestor.main = []
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')

    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('上级没有消息')).toBeInTheDocument()
    // 空层级被记为已访问，不会重复请求、也不会继续显示入口
    await waitFor(() => expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument())
    expect(screen.queryByText('主会话消息')).not.toBeInTheDocument()
  })

  // PRD-CONV-007 / AC-CONV-007-02：prepend 上级消息后，用户正在看的那条消息必须停在原位
  // （视觉位置不变、scrollTop 相应增大），且后续帧不得回跳。
  it('keeps the visible message anchored when ancestor messages are prepended', async () => {
    snap.messages.child = [
      { id: 'child-1', sessionId: 'child', sessionTitle: '子会话', role: 'user', text: '子会话消息一', at: at + 2, status: 'done' },
      { id: 'child-2', sessionId: 'child', sessionTitle: '子会话', role: 'user', text: '子会话消息二', at: at + 3, status: 'done' },
      { id: 'child-3', sessionId: 'child', sessionTitle: '子会话', role: 'user', text: '子会话消息三', at: at + 4, status: 'done' },
    ]
    snap.ancestor.main = [
      { id: 'main-old', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '历史上级消息', at: at + 1, status: 'done' },
    ]
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息一')
    await flush(40)

    const scroller = conversation()
    const nodes = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.conversation-scroll .msg')]
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => nodes().length * 100 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 0 })
    const rect = (top: number, bottom: number): DOMRect => ({ top, bottom, left: 0, right: 0, width: 0, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === scroller) return rect(0, 500)
      const index = nodes().indexOf(this)
      if (index >= 0) { const top = index * 100 - scroller.scrollTop; return rect(top, top + 100) }
      return rect(0, 0)
    })
    scroller.scrollTop = 120
    fireEvent.scroll(scroller)
    await flush(10)
    expect(scroller.scrollTop).toBe(120)

    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('历史上级消息')).toBeInTheDocument()
    await flush(50)
    expect(nodes()).toHaveLength(4)
    // prepend 100px 后锚点仍是原来那条消息：scrollTop 120 → 220
    expect(scroller.scrollTop).toBe(220)
    // 再等几帧：rAF 里的第二次校正必须幂等，不能把 scrollTop 写回 120
    await flush(50)
    expect(scroller.scrollTop).toBe(220)
  })

  it('maps 413 to a readable error and keeps the retry button', async () => {
    snap.ancestorStatus.main = 413
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')
    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('消息过多，暂不能完整加载')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '显示上级会话：主会话' })).not.toBeDisabled()
  })

  it('maps 403 to the permission error', async () => {
    snap.ancestorStatus.main = 403
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')
    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('无权读取该上级会话')).toBeInTheDocument()
  })
})

describe('App timeline and message states (PRD-CONV-004 / A2)', () => {
  it('jumps to a message from the timeline bar and marks it current', async () => {
    snap.messages.main = [
      { id: 'main-1', sessionId: 'main', sessionTitle: '主会话', role: 'user', text: '主会话消息', at: at + 1, status: 'done' },
      { id: 'main-2', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '第二条消息', at: at + 10, status: 'done', agentId: 'simo' },
    ]
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    const user = await renderApp()
    const bars = [...document.querySelectorAll<HTMLElement>('.tl-bar')]
    expect(bars).toHaveLength(2)
    expect(bars[0]).toHaveAttribute('aria-current', 'true')

    await user.click(bars[1])
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
    expect(bars[1]).toHaveAttribute('aria-current', 'true')
    expect(bars[0]).not.toHaveAttribute('aria-current')
  })

  it('retries after a message load failure', async () => {
    snap.messageFail = true
    render(<App />)
    expect(await screen.findByText('消息加载失败')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '当前会话消息' })).toHaveClass('is-error')

    snap.messageFail = false
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()
  })

  it('retries after a session list load failure', async () => {
    snap.treeFail = true
    render(<App />)
    expect(await screen.findByText('会话加载失败')).toBeInTheDocument()

    snap.treeFail = false
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByTitle('子会话')).toBeInTheDocument()
  })

  it('renders the empty conversation state for a session without messages', async () => {
    snap.messages.main = []
    render(<App />)
    // App 传入自定义 empty 节点，默认的「暂无消息」不会出现
    expect(await screen.findByText('开始和司墨对话')).toBeInTheDocument()
    expect(screen.getByText('发送第一条消息')).toBeInTheDocument()
    expect(document.querySelector('.conversation-panel')).toHaveClass('is-empty')
    expect(messageInput()).not.toBeDisabled()
  })
})
