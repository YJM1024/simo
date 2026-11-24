import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import App from './app'
import {
  appHandlers,
  at,
  createSnapshot,
  deltaFrame,
  eventFrame,
  findSession,
  flush,
  MockWebSocket,
  readFrame,
  unreadFrame,
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

/** 按标题取侧栏行本身：同一标题在会话头/祖先区也可能出现，getByTitle 会命中多个。 */
function sidebarRow(title: string): HTMLElement {
  const row = screen.getAllByTitle(title)
    .map((node) => node.closest('.session-row'))
    .find((node): node is HTMLElement => node !== null)
  if (!row) throw new Error(`missing sidebar row: ${title}`)
  return row
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

  it('keeps a draft session out of the archive menu until its first message materializes it', async () => {
    const user = await renderApp()
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    // 草稿只存在于服务端内存（POST /api/sessions 返回 draft=true，不进 /tree）：
    // 不渲染「会话操作」菜单，归档请求也就无从发出（此前点归档必然 404 not_found）。
    expect(within(sessionRow('新会话')).queryByRole('button', { name: '会话操作' })).not.toBeInTheDocument()
    expect(snap.archiveCalls).toEqual([])

    await user.type(messageInput(), '第一条消息{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(1))
    expect(snap.chatBodies[0]).toMatchObject({ sessionId: 'session-new', text: '第一条消息' })
    // 首条消息触发 MaterializeDraft 后，侧栏菜单恢复
    await waitFor(() => expect(within(sessionRow('新会话')).getByRole('button', { name: '会话操作' })).toBeInTheDocument())
    expect(snap.archiveCalls).toEqual([])
  })

  it('pins a session and shows 取消置顶 after refreshing the list from the backend', async () => {
    const user = await renderApp()
    const listCalls = snap.listCalls
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '置顶' }))
    await waitFor(() => expect(snap.pinCalls).toEqual(['pin:child']))
    await waitFor(() => expect(findSession(snap, 'child')?.pinned).toBe(true))
    await waitFor(() => expect(snap.listCalls).toBeGreaterThan(listCalls))
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    expect(await screen.findByRole('button', { name: '取消置顶' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '置顶' })).not.toBeInTheDocument()
  })

  it('unpins a session and shows 置顶 again', async () => {
    findSession(snap, 'child')!.pinned = true
    const user = await renderApp()
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '取消置顶' }))
    await waitFor(() => expect(snap.pinCalls).toEqual(['unpin:child']))
    await waitFor(() => expect(findSession(snap, 'child')?.pinned).toBe(false))
    await flush(30)
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    expect(await screen.findByRole('button', { name: '置顶' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消置顶' })).not.toBeInTheDocument()
  })

  it('does not request spec projection for a draft and shows the right-panel placeholder', async () => {
    const user = await renderApp()
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: '新会话' })).toBeInTheDocument()
    expect(await screen.findByText('发送第一条消息后生成目标与执行态')).toBeInTheDocument()
    await flush(30)
    expect(snap.projectionCalls.filter((call) => call.sessionId === 'session-new')).toEqual([])
    expect(screen.queryByText('右栏加载失败')).not.toBeInTheDocument()
  })

  it('loads the projection after the first message materializes the draft', async () => {
    const user = await renderApp()
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    expect(await screen.findByText('发送第一条消息后生成目标与执行态')).toBeInTheDocument()

    await user.type(messageInput(), '第一条消息{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(1))
    await waitFor(() => expect(snap.projectionCalls).toContainEqual({ sessionId: 'session-new', taskLimit: '3' }))
    await waitFor(() => expect(screen.queryByText('发送第一条消息后生成目标与执行态')).not.toBeInTheDocument())
  })

  it('keeps loading spec projection for a non-draft session', async () => {
    const user = await renderApp()
    await user.click(screen.getByTitle('子会话'))
    await waitFor(() => expect(snap.projectionCalls).toContainEqual({ sessionId: 'child', taskLimit: '3' }))
    expect(screen.queryByText('发送第一条消息后生成目标与执行态')).not.toBeInTheDocument()
  })

  it('surfaces a create-session failure and keeps the previous active session', async () => {
    const user = await renderApp()
    snap.createFail = true
    await user.click(createSessionButton())
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))
    // 失败以 toast 呈现（与 rename 一致），当前会话不被切走、不产生草稿行
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

  it('archives a non-main session, hides it by default and renders it read-only when shown', async () => {
    const user = await renderApp()
    await user.click(screen.getByTitle('子会话'))
    await screen.findByText('子会话消息')
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '归档' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['archive:child']))
    await waitFor(() => expect(screen.queryByTitle('子会话')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '显示归档' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: '显示归档' }))
    expect(sessionRow('子会话')).toHaveClass('is-archived')
    expect(screen.getByText('已归档 · 只读')).toBeInTheDocument()
    expect(messageInput()).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  it('never offers archive for the main session', async () => {
    await renderApp()
    expect(within(sessionRow('主会话')).queryByRole('button', { name: '会话操作' })).not.toBeInTheDocument()
    expect(snap.archiveCalls).toEqual([])
  })

  it('restores an archived non-main session through the row menu', async () => {
    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.archived = 1
    const user = await renderApp()
    expect(screen.queryByTitle('子会话')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '显示归档' }))
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '恢复' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['unarchive:child']))
    // 恢复后重新回到默认（未归档）列表
    await waitFor(() => expect(sessionRow('子会话')).not.toHaveClass('is-archived'))
  })
})

describe('App unread badge (P1-CONV 未读持久化)', () => {
  it('renders the persisted unread dot and clears it after entering the session', async () => {
    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.hasUnread = true
    const user = await renderApp()
    expect(within(sessionRow('子会话')).getByLabelText('未读')).toHaveAttribute('data-unread', 'true')
    expect(sessionRow('子会话').querySelector('[data-unread="true"]')?.textContent).toBe('')

    await user.click(screen.getByTitle('子会话'))
    await waitFor(() => expect(snap.readCalls).toEqual(['main', 'child']))
    await waitFor(() => expect(within(sessionRow('子会话')).queryByLabelText('未读')).not.toBeInTheDocument())
  })

  it('refreshes the session list on a session_read WS event and trusts server state', async () => {
    const user = await renderApp()
    expect(screen.queryByLabelText('未读')).not.toBeInTheDocument()
    const before = snap.listCalls
    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.hasUnread = true
    act(() => { MockWebSocket.instances[0].emit('message', { data: readFrame('child') }) })
    await waitFor(() => expect(snap.listCalls).toBeGreaterThan(before))
    expect(await screen.findByLabelText('未读')).toBeInTheDocument()

    // 进入该会话 → 服务端已读 → 本地即时清除，且刷新后不再出现
    await user.click(screen.getByTitle('子会话'))
    await waitFor(() => expect(snap.readCalls).toEqual(['main', 'child']))
    await waitFor(() => expect(screen.queryByLabelText('未读')).not.toBeInTheDocument())
    expect(snap.tree[0].children?.[0]?.hasUnread).toBe(false)
  })

  it('coalesces a session_unread burst into one list refresh and keeps the active search query', async () => {
    const user = await renderApp()
    const input = screen.getByLabelText('搜索会话')
    await user.type(input, '子')
    await waitFor(() => expect(snap.titleQueries).toContain('子'), { timeout: 3000 })
    expect(await screen.findByTitle('子会话', {}, { timeout: 3000 })).toBeInTheDocument()
    await flush(40)

    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.hasUnread = true
    const listsBefore = snap.listCalls
    const queriesBefore = snap.titleQueries.length
    act(() => {
      MockWebSocket.instances[0].emit('message', { data: unreadFrame('child') })
      MockWebSocket.instances[0].emit('message', { data: unreadFrame('grand') })
    })

    // 300ms 合并窗口内不得刷新（两帧同批只留一个定时器）
    await flush(150)
    expect(snap.listCalls).toBe(listsBefore)

    await waitFor(() => expect(snap.listCalls).toBe(listsBefore + 1), { timeout: 3000 })
    // 搜索态下按当前 q 重查，未读点出现在搜索结果里，且输入词未被冲掉
    await waitFor(() => expect(snap.titleQueries.length).toBe(queriesBefore + 1), { timeout: 3000 })
    expect(await screen.findByLabelText('未读')).toBeInTheDocument()
    expect(input).toHaveValue('子')

    // 合并窗口结束后也不得重复刷新
    await flush(400)
    expect(snap.listCalls).toBe(listsBefore + 1)
    expect(snap.titleQueries.length).toBe(queriesBefore + 1)
  })

  it('surfaces a visible error and keeps the unread dot when marking read fails', async () => {
    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.hasUnread = true
    snap.readFail = true
    const user = await renderApp()
    await user.click(screen.getByTitle('子会话'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('标记已读失败：请求失败（500），请稍后重试')
    expect(within(sessionRow('子会话')).getByLabelText('未读')).toBeInTheDocument()
  })

  /**
   * 缺陷回归：点击早于列表刷新出未读时（本地 hasUnread=false），旧实现直接 return，
   * 标读请求根本没发，未读点一直留着。判据是“进入即已读”，进入就该发 POST。
   */
  it('marks a session read on entry even when the local list has no unread flag yet', async () => {
    const child = snap.tree[0].children?.[0]
    if (!child) throw new Error('fixture missing child session')
    child.hasUnread = false
    const user = await renderApp()
    expect(within(sessionRow('子会话')).queryByLabelText('未读')).not.toBeInTheDocument()

    await user.click(screen.getByTitle('子会话'))
    await waitFor(() => expect(snap.readCalls).toContain('child'))
  })

  /**
   * 去重：列表刷新会让标读 effect 重跑，同一会话 1 秒内只能发一次；
   * 切到别的会话后记录里的 sessionId 已变，切回来应重新发，不被上个会话的去重窗口挡住。
   */
  it('marks the same session once within a 1s window and again after switching away and back', async () => {
    const user = await renderApp()
    await user.click(sidebarRow('子会话'))
    await waitFor(() => expect(snap.readCalls.filter((id) => id === 'child')).toHaveLength(1))

    // session_read 广播触发列表刷新 → 标读 effect 重跑 → 1 秒内不得重复发
    const listsBefore = snap.listCalls
    act(() => { MockWebSocket.instances[0].emit('message', { data: readFrame('child') }) })
    await waitFor(() => expect(snap.listCalls).toBeGreaterThan(listsBefore))
    await flush(30)
    expect(snap.readCalls.filter((id) => id === 'child')).toHaveLength(1)

    // 切走再切回：重新发（主会话这次是第 2 次：挂载 1 次 + 切回 1 次）
    await user.click(sidebarRow('主会话'))
    await waitFor(() => expect(snap.readCalls.filter((id) => id === 'main')).toHaveLength(2))
    await user.click(sidebarRow('子会话'))
    await waitFor(() => expect(snap.readCalls.filter((id) => id === 'child')).toHaveLength(2))
  })
})

describe('App session title search (P1-CONV 标题搜索)', () => {
  it('filters by title through GET /api/sessions?q= without calling message search', async () => {
    const user = await renderApp()
    expect(screen.getByTitle('主会话')).toBeInTheDocument()
    await user.type(screen.getByLabelText('搜索会话'), '子')
    await waitFor(() => expect(snap.titleQueries).toContain('子'), { timeout: 3000 })
    await waitFor(() => expect(screen.queryByTitle('主会话')).not.toBeInTheDocument())
    expect(screen.getByTitle('子会话')).toBeInTheDocument()
    // 消息正文搜索已降为 P2：左栏搜索不得触发 /api/messages/search
    expect(snap.searchQueries).toEqual([])
  })

  it('shows the no-match empty state and restores the full list when cleared', async () => {
    const user = await renderApp()
    const input = screen.getByLabelText('搜索会话')
    await user.type(input, '不存在的关键字')
    expect(await screen.findByText('没有匹配的会话', {}, { timeout: 3000 })).toBeInTheDocument()
    await user.clear(input)
    expect(await screen.findByTitle('主会话')).toBeInTheDocument()
    expect(screen.getByTitle('子会话')).toBeInTheDocument()
  })

  it('distinguishes a failed search from an empty result and retries in place', async () => {
    const user = await renderApp()
    const input = screen.getByLabelText('搜索会话')
    snap.searchFail = true
    await user.type(input, '子')

    expect(await screen.findByText('搜索失败，请重试', {}, { timeout: 3000 })).toBeInTheDocument()
    // 失败绝不能落到空态；错误原因单独展示，并提供重试入口
    expect(screen.queryByText('没有匹配的会话')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('请求失败（500），请稍后重试')
    expect(input).toHaveValue('子')

    const queriesBefore = snap.titleQueries.length
    snap.searchFail = false
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(snap.titleQueries.length).toBeGreaterThan(queriesBefore), { timeout: 3000 })
    expect(await screen.findByTitle('子会话', {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('搜索失败，请重试')).not.toBeInTheDocument())
    expect(screen.queryByText('没有匹配的会话')).not.toBeInTheDocument()
    expect(input).toHaveValue('子')
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
  it('maps a persisted error reply to the failure badge and refills the composer on retry', async () => {
    snap.messages.main.push({ id: 'main-error', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '', at: at + 10, status: 'error' })
    const user = await renderApp()
    expect(screen.getByText('失败')).toBeInTheDocument()
    expect(screen.getByText('回复生成失败，未返回内容。')).toBeInTheDocument()
    // 重试只回填原文、不自动发送：后端没有回复级重试接口，直接重发会多落一条用户消息。
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(messageInput()).toHaveValue('主会话消息'))
    expect(snap.chatBodies).toHaveLength(0)
  })

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
    // A8：失败保留输入，重发不用重打（契约 COMP-composer-send-mode §5）
    expect(messageInput()).toHaveValue('需要重试')
    await user.type(messageInput(), '{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(2))
    // 同一次发送的失败重发必须复用同一幂等键（C-16）
    expect(snap.chatBodies[1].clientMutationId).toBe(snap.chatBodies[0].clientMutationId)
    await waitFor(() => expect(screen.getAllByText('需要重试')).toHaveLength(1))
    expect(snap.messages.main.filter((message) => message.text === '需要重试')).toHaveLength(1)
    // 成功后清空
    expect(messageInput()).toHaveValue('')

    // 新消息才生成新幂等键
    await user.type(messageInput(), '另一条新消息{Enter}')
    await waitFor(() => expect(snap.chatBodies).toHaveLength(3))
    expect(snap.chatBodies[2].clientMutationId).not.toBe(snap.chatBodies[0].clientMutationId)
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

  it('sends one correct frame per streaming message with its own messageId', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('主会话消息')
    const socket = MockWebSocket.instances[0]
    await waitFor(() => expect(socket.readyState).toBe(MockWebSocket.OPEN))
    // Composer 的「停止」是全局停止：同时有两条流时只渲染一个按钮，
    // 点击后必须对每条流各发一帧，否则后端只能退化为“停最新一条”。
    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '第一条', 1) }) })
    act(() => { socket.emit('message', { data: deltaFrame('stream-2', '第二条', 1) }) })
    expect(await screen.findByText('第一条')).toBeInTheDocument()
    expect(await screen.findByText('第二条')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '停止' })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '停止' }))
    await waitFor(() => expect(document.querySelector('.stream-caret')).not.toBeInTheDocument())

    const correctFrames = socket.sent
      .map((raw) => JSON.parse(raw) as { type?: string; data?: { sessionId?: string; messageId?: string } })
      .filter((frame) => frame.type === 'correct')
    expect(correctFrames).toHaveLength(2)
    expect(correctFrames.map((frame) => frame.data?.sessionId)).toEqual(['main', 'main'])
    expect(correctFrames.map((frame) => frame.data?.messageId).sort()).toEqual(['stream-1', 'stream-2'])

    act(() => { socket.emit('message', { data: deltaFrame('stream-1', '追加', 2) }) })
    act(() => { socket.emit('message', { data: deltaFrame('stream-2', '追加', 2) }) })
    await flush(30)
    expect(screen.queryByText('第一条追加')).not.toBeInTheDocument()
    expect(screen.queryByText('第二条追加')).not.toBeInTheDocument()
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

  it('silently treats an empty ancestor as visited', async () => {
    snap.ancestor.main = []
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')

    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    // 空上级按无上级处理：不插入消息、不渲染任何提示，层级直接记为已访问。
    await waitFor(() => expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument())
    expect(screen.queryByText('上级没有消息')).not.toBeInTheDocument()
    expect(document.querySelector('.err-text, .ancestor-hint')).toBeNull()
    expect(document.querySelectorAll('.tlg-session.is-ancestor-session')).toHaveLength(0)
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

  it('maps 403 to a neutral non-blocking hint', async () => {
    snap.ancestorStatus.main = 403
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')
    await user.click(screen.getByRole('button', { name: '显示上级会话：主会话' }))
    const hint = await screen.findByText('无权读取该上级会话')
    expect(hint).toHaveClass('ancestor-hint')
    expect(hint).not.toHaveClass('err-text')
    expect(hint).not.toHaveTextContent(/失败|错误/)
    expect(screen.getByRole('button', { name: '显示上级会话：主会话' })).not.toBeDisabled()
  })
})

describe('App timeline and message states (PRD-CONV-004 / A2)', () => {
  it('jumps to the clicked message from the timeline bar and marks it current', async () => {
    snap.messages.main = [
      { id: 'main-1', sessionId: 'main', sessionTitle: '主会话', role: 'user', text: '主会话消息', at: at + 1, status: 'done' },
      { id: 'main-2', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '第二条消息', at: at + 10, status: 'done', agentId: 'simo' },
      { id: 'main-3', sessionId: 'main', sessionTitle: '主会话', role: 'user', text: '第三条消息', at: at + 20, status: 'done' },
      { id: 'main-4', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '第四条消息', at: at + 30, status: 'done', agentId: 'simo' },
    ]
    const targets: Element[] = []
    const scrollIntoView = vi.fn(function (this: Element) { targets.push(this) })
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    const user = await renderApp()
    const bars = [...document.querySelectorAll<HTMLElement>('.tl-bar')]
    expect(bars).toHaveLength(4)
    expect(bars[0]).toHaveAttribute('aria-current', 'true')

    // 点第 N 个刻度必须落在第 N 条消息上：scrollIntoView 的 this 是滚动目标节点，
    // 用 data-message-id 锁定它是被点的那一条，而不是前后相邻的那条。
    for (const [index, id] of [[2, 'main-3'], [0, 'main-1'], [3, 'main-4']] as const) {
      await user.click(bars[index])
      expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ block: 'start' }))
      expect(targets.at(-1)?.getAttribute('data-message-id'), `第 ${index + 1} 个刻度`).toBe(id)
      expect(bars[index]).toHaveAttribute('aria-current', 'true')
      expect(bars.filter((bar) => bar.getAttribute('aria-current') === 'true')).toHaveLength(1)
    }
    expect(targets.map((node) => node.getAttribute('data-message-id'))).toEqual(['main-3', 'main-1', 'main-4'])
  })

  it('keeps the clicked tick active while the jump scroll settles and hands back on the next manual scroll', async () => {
    snap.messages.main = Array.from({ length: 6 }, (_, index) => ({
      id: `main-${index + 1}`,
      sessionId: 'main',
      sessionTitle: '主会话',
      role: index % 2 === 0 ? 'user' as const : 'agent' as const,
      text: index === 0 ? '主会话消息' : `第 ${index + 1} 条消息`,
      at: at + index * 10,
      status: 'done' as const,
    }))
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    const user = await renderApp()
    const scroller = document.querySelector<HTMLElement>('.conversation-scroll')
    expect(scroller).not.toBeNull()
    // 末尾两条到不了视口顶部：只有前四条能落在 64px 阈值之上。
    // 没有钉住时，跳转后平滑滚动触发的 onScroll 会把 active 重算成第 4 条。
    document.querySelectorAll<HTMLElement>('.conversation-scroll .msg').forEach((node, index) => {
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: index < 4 ? 0 : 500, bottom: 540, left: 0, right: 600, width: 600, height: 40, x: 0, y: index < 4 ? 0 : 500, toJSON: () => ({}) }) as DOMRect,
      })
    })
    const bars = [...document.querySelectorAll<HTMLElement>('.tl-bar')]
    await user.click(bars[5])
    expect(bars[5]).toHaveAttribute('aria-current', 'true')

    // 平滑滚动的收尾滚动事件可能晚于任何固定时间窗，钉住不能靠计时结束。
    fireEvent.scroll(scroller as HTMLElement)
    expect(bars[5]).toHaveAttribute('aria-current', 'true')

    // 用户下一次手动滚动（滚轮）立即交还：随后的滚动事件按最近消息重算 active。
    fireEvent.wheel(scroller as HTMLElement, { deltaY: 200 })
    fireEvent.scroll(scroller as HTMLElement)
    expect(bars[3]).toHaveAttribute('aria-current', 'true')
    expect(bars.filter((bar) => bar.getAttribute('aria-current') === 'true')).toHaveLength(1)
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

describe('App session list ETag (AC-CONV-008-04)', () => {
  it('keeps the search rows and the active session when the list request is answered with 304', async () => {
    const etag = '"sess-304"'
    const conditionalHeaders: Array<string | null> = []
    server.use(http.get('/api/sessions', ({ request }) => {
      const header = request.headers.get('If-None-Match')
      conditionalHeaders.push(header)
      if (header === etag) return new HttpResponse(null, { status: 304, headers: { ETag: etag } })
      return HttpResponse.json({ sessions: [findSession(snap, 'child')] }, { headers: { ETag: etag } })
    }))
    const user = await renderApp()
    await user.type(screen.getByLabelText('搜索会话'), '子')
    expect(await screen.findByTitle('子会话', {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(conditionalHeaders).toEqual([null]))

    await user.click(screen.getByTitle('子会话'))
    expect(await screen.findByText('子会话消息')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()

    // 未读事件走 refreshSessions：先刷会话树，再按当前 q 重查搜索 → 命中 304
    act(() => { MockWebSocket.instances.at(-1)?.emit('message', { data: unreadFrame('child') }) })
    await waitFor(() => expect(conditionalHeaders).toEqual([null, etag]), { timeout: 3000 })

    // 304 不替换状态：搜索结果与选中会话都还在，没有闪成空列表或错误态
    expect(screen.getByTitle('子会话')).toBeInTheDocument()
    expect(screen.queryByText('主会话')).not.toBeInTheDocument()
    expect(screen.queryByText('没有匹配的会话')).not.toBeInTheDocument()
    expect(screen.queryByText('搜索失败，请重试')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()
    expect(screen.getByText('子会话消息')).toBeInTheDocument()
  })

  it('rejects pinning a session archived in the tree but still shown by stale search results', async () => {
    let searchRequests = 0
    server.use(http.get('/api/sessions', () => {
      searchRequests += 1
      const child = findSession(snap, 'child')
      if (!child) return HttpResponse.json({ sessions: [] })
      // 搜索结果按请求时刻快照（真实后端每次都返回新解析的对象）：
      // 会话随后被归档，这份旧快照仍停在未归档状态，用来复现“旧列表触发置顶”。
      return HttpResponse.json({ sessions: [{ ...child }] })
    }))
    const user = await renderApp()
    await user.type(screen.getByLabelText('搜索会话'), '子')
    // 等搜索请求真正完成并把快照写进状态（首屏那行来自会话树，不代表搜索已返回）
    await waitFor(() => expect(searchRequests).toBe(1), { timeout: 3000 })
    await flush(20)
    expect(await screen.findByTitle('子会话', {}, { timeout: 3000 })).toBeInTheDocument()
    await user.click(screen.getByTitle('子会话'))
    expect(await screen.findByText('子会话消息')).toBeInTheDocument()

    const child = findSession(snap, 'child')
    if (!child) throw new Error('fixture missing child session')
    child.archived = 1
    // 「刷新会话」只刷会话树，不重查搜索，旧搜索结果行因此仍显示为未归档
    await user.click(screen.getByRole('button', { name: '刷新会话' }))
    expect(await screen.findByText('已归档 · 只读')).toBeInTheDocument()

    const staleRow = screen.getByTitle('子会话').closest('.session-row') as HTMLElement
    expect(staleRow).not.toHaveClass('is-archived')
    await user.click(within(staleRow).getByRole('button', { name: '会话操作' }))
    await user.click(within(staleRow).getByRole('button', { name: '置顶' }))

    // AC-CONV-001-04：App 守卫拦下并提示，置顶请求一条都不发
    expect(await screen.findByRole('alert')).toHaveTextContent('归档会话不可置顶')
    expect(snap.pinCalls).toEqual([])
  })
})
