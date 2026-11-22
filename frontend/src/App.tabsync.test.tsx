import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import { tabId, type TabSyncMessage } from './tabsync'
import {
  appHandlers,
  at,
  createSnapshot,
  eventFrame,
  flush,
  MockWebSocket,
  type AppSnapshot,
} from './App.test-utils'

const server = setupServer()
let snap: AppSnapshot

interface ChannelEvent { data: TabSyncMessage }
type ChannelListener = (event: ChannelEvent) => void

/**
 * setup.ts 里的 BroadcastChannel 是纯 noop，无法把"另一个标签页"的消息送进 App。
 * tabsync.ts 的 channel 是模块级单例、在首次 ensure()（App mount）时创建，
 * 因此在 render 之前替换全局即可捕获真实实例并派发入站消息。
 */
class CapturingBroadcastChannel {
  static instances: CapturingBroadcastChannel[] = []
  static posted: TabSyncMessage[] = []
  readonly name: string
  private listeners = new Set<ChannelListener>()

  constructor(name: string) {
    this.name = name
    CapturingBroadcastChannel.instances.push(this)
  }

  addEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') this.listeners.add(listener)
  }

  removeEventListener(type: string, listener: ChannelListener): void {
    if (type === 'message') this.listeners.delete(listener)
  }

  postMessage(data: TabSyncMessage): void { CapturingBroadcastChannel.posted.push(data) }
  close(): void { this.listeners.clear() }

  emit(data: TabSyncMessage): void {
    for (const listener of this.listeners) listener({ data })
  }
}

const TAB_SYNC_CHANNEL = 'simo.tab-sync.v1'

function peerChannel(): CapturingBroadcastChannel {
  // 同一页面里 Composer 也会建 simo.composer.sendMode.v1，必须按名字取会话同步通道
  const channel = CapturingBroadcastChannel.instances.filter((item) => item.name === TAB_SYNC_CHANNEL).at(-1)
  if (!channel) throw new Error('会话同步 BroadcastChannel 尚未创建：App 未挂载？')
  return channel
}

/** 模拟"另一个标签页"推送一条跨标签消息 */
function fromPeer(message: TabSyncMessage): void {
  act(() => { peerChannel().emit(message) })
}

function peerMessage(partial: { type: TabSyncMessage['type']; sessionId: string; at: number; chain?: string[] }): TabSyncMessage {
  const base = { tabId: 'tab-peer', opId: `tab-peer:${partial.at}`, at: partial.at, sessionId: partial.sessionId }
  if (partial.type === 'ancestor_chain_changed') return { ...base, type: partial.type, chain: partial.chain ?? [] }
  return { ...base, type: partial.type }
}

beforeAll(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('BroadcastChannel', CapturingBroadcastChannel)
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
  CapturingBroadcastChannel.posted = []
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

function messageSessionIds(): Array<string | null> {
  return [...document.querySelectorAll('.conversation-scroll .msg')].map((node) => node.getAttribute('data-session-id'))
}

async function renderAppView(): Promise<{ user: ReturnType<typeof userEvent.setup>; view: ReturnType<typeof render> }> {
  const user = userEvent.setup()
  const view = render(<App />)
  await screen.findByText('主会话消息')
  return { user, view }
}

async function renderApp(): Promise<ReturnType<typeof userEvent.setup>> {
  return (await renderAppView()).user
}

/** 把会话滚到非底部位置，后续新消息才会累计未读气泡。 */
async function scrollAwayFromBottom(): Promise<void> {
  const scroller = document.querySelector('.conversation-scroll') as HTMLElement
  Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 })
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 })
  scroller.scrollTop = 300
  fireEvent.scroll(scroller)
  await flush(10)
}

/** 注入一条新消息并等未读合并定时器落定。 */
async function appendUnreadMessage(id: string, messageAt: number, seq: number): Promise<void> {
  snap.messages.main.push({ id, sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: `${id} 消息`, at: messageAt, status: 'done' })
  MockWebSocket.instances[0]?.emit('message', { data: eventFrame('message.created', id, seq) })
  await flush(360)
}

describe('App cross-tab session sync (SYNC-002 / PRD-CONV-001)', () => {
  it('switches to a newer session announced by another tab and ignores own or stale messages', async () => {
    await renderApp()
    expect(screen.getByRole('heading', { name: '主会话' })).toBeInTheDocument()

    fromPeer(peerMessage({ type: 'active_session_changed', sessionId: 'child', at: Date.now() + 10_000 }))
    expect(await screen.findByRole('heading', { name: '子会话' })).toBeInTheDocument()
    expect(await screen.findByText('子会话消息')).toBeInTheDocument()
    expect(sessionRow('子会话')).toHaveClass('is-active')

    // 自己标签页的消息不应被回放（否则点一下就被拉回）
    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'main', at: Date.now() + 20_000 }), tabId })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()

    // 更早的切换（乱序到达）应被丢弃
    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'main', at: 1 }), tabId: 'tab-peer' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()
  })

  it('publishes its own active session switch for other tabs', async () => {
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')
    await waitFor(() => {
      expect(CapturingBroadcastChannel.posted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'active_session_changed', sessionId: 'child' }),
        ]),
      )
    })
  })

  it('merges ancestor messages forwarded by another tab', async () => {
    const user = await renderApp()
    await user.click(sessionRow('子会话'))
    await screen.findByText('子会话消息')

    fromPeer(peerMessage({ type: 'ancestor_chain_changed', sessionId: 'child', at: Date.now() + 10_000, chain: ['main'] }))
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()
    expect(messageSessionIds()).toEqual(['main', 'child'])
    expect(document.querySelectorAll('.tlg-session.is-ancestor-session')).toHaveLength(1)

    // 同一条链再次广播不应重复合并
    fromPeer(peerMessage({ type: 'ancestor_chain_changed', sessionId: 'child', at: Date.now() + 20_000, chain: ['main'] }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getAllByText('主会话消息')).toHaveLength(1)
    expect(messageSessionIds()).toEqual(['main', 'child'])
  })

  it('resolves an active-session tie at the same at by tabId and stays put on duplicates', async () => {
    await renderApp()
    const sameAt = Date.now() + 10_000

    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'child', at: sameAt }), tabId: 'tab-m' })
    expect(await screen.findByRole('heading', { name: '子会话' })).toBeInTheDocument()

    // 同一个 at、更小的 tabId 来晚：不能覆盖已应用的决策
    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'grand', at: sameAt }), tabId: 'tab-a' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()

    // 同一个 at、更大的 tabId：按字典序胜出
    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'grand', at: sameAt }), tabId: 'tab-z' })
    expect(await screen.findByRole('heading', { name: '孙会话' })).toBeInTheDocument()

    // 重复投递同一条（含同 at 的旧 sessionId）不产生回退或抖动
    fromPeer({ ...peerMessage({ type: 'active_session_changed', sessionId: 'child', at: sameAt }), tabId: 'tab-z' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '孙会话' })).toBeInTheDocument()
  })

  it('converges to the same session for out-of-order tab messages in either arrival order', async () => {
    const earlier = Date.now() + 10_000
    const later = earlier + 5_000
    const first = { ...peerMessage({ type: 'active_session_changed', sessionId: 'child', at: earlier }), tabId: 'tab-1' }
    const second = { ...peerMessage({ type: 'active_session_changed', sessionId: 'grand', at: later }), tabId: 'tab-2' }

    // 顺序一：后发先到，再收到旧消息
    const firstRun = await renderAppView()
    fromPeer(second)
    expect(await screen.findByRole('heading', { name: '孙会话' })).toBeInTheDocument()
    fromPeer(first)
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('heading', { name: '孙会话' })).toBeInTheDocument()
    firstRun.view.unmount()

    // 顺序二：先到旧消息，再到新消息；最终状态与顺序一相同
    const secondRun = await renderAppView()
    fromPeer(first)
    expect(await screen.findByRole('heading', { name: '子会话' })).toBeInTheDocument()
    fromPeer(second)
    expect(await screen.findByRole('heading', { name: '孙会话' })).toBeInTheDocument()
    secondRun.view.unmount()
  })

  it('clears unread when a peer reports an equal-or-newer read cursor and ignores an older one', async () => {
    await renderApp()
    const scroller = document.querySelector('.conversation-scroll') as HTMLElement
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, get: () => 2000 })
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 })
    scroller.scrollTop = 300
    fireEvent.scroll(scroller)
    await flush(10)

    // 有新消息到达且用户不在底部：累积未读
    snap.messages.main.push({ id: 'main-2', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '第二条消息', at: at + 2, status: 'done' })
    MockWebSocket.instances[0]?.emit('message', { data: eventFrame('message.created', 'main-2', 1) })
    await flush(360)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()

    // 另一标签读到同一条消息（at 等于本地游标）：清未读
    fromPeer(peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }))
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 重复同一游标是幂等的
    fromPeer(peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }))
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 又来一条新消息，未读重新累积
    snap.messages.main.push({ id: 'main-3', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '第三条消息', at: at + 3, status: 'done' })
    MockWebSocket.instances[0]?.emit('message', { data: eventFrame('message.created', 'main-3', 2) })
    await flush(360)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()

    // 更旧的读游标不能让未读回退
    fromPeer(peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: 0 }))
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()

    // 更新到最新消息的游标才清除
    fromPeer(peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 3 }))
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()
  })

  it('applies a same-at read cursor from the larger tabId and does not re-apply duplicates', async () => {
    await renderApp()
    await scrollAwayFromBottom()

    // tab-a 先建立 at+2 的读游标决策
    await appendUnreadMessage('main-2', at + 2, 1)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }), tabId: 'tab-a' })
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 新消息再次累积未读；同 at、更大 tabId 的决策按字典序获胜并清未读
    await appendUnreadMessage('main-3', at + 3, 2)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }), tabId: 'tab-z' })
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 重复广播同一条已应用的决策是幂等的：不能清掉后来累积的未读
    await appendUnreadMessage('main-4', at + 4, 3)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }), tabId: 'tab-z' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
  })

  it('ignores a same-at read cursor from a smaller tabId even when it arrives later', async () => {
    await renderApp()
    await scrollAwayFromBottom()

    // tab-z 先建立 at+2 的获胜决策
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }), tabId: 'tab-z' })
    await appendUnreadMessage('main-2', at + 2, 1)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()

    // 同 at、更小 tabId 来晚：不得清未读（旧实现只比 at，会接受）
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 2 }), tabId: 'tab-a' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()

    // at 更大时 tabId 不参与比较：更小的 tabId 也能推进游标
    fromPeer({ ...peerMessage({ type: 'read_cursor_changed', sessionId: 'main', at: at + 3 }), tabId: 'tab-a' })
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()
  })

  it('keeps legacy read-cursor frames without tabId working by at comparison', async () => {
    await renderApp()
    await scrollAwayFromBottom()

    // 旧版本帧没有 tabId：at >= 本地游标即接受（兼容分支）
    await appendUnreadMessage('main-2', at + 2, 1)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ type: 'read_cursor_changed', opId: 'legacy:1', at: at + 2, sessionId: 'main' })
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 同 at 的旧帧重复投递仍按 at 接受
    await appendUnreadMessage('main-3', at + 3, 2)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ type: 'read_cursor_changed', opId: 'legacy:2', at: at + 2, sessionId: 'main' })
    expect(screen.getByRole('button', { name: '回到底部' })).toBeInTheDocument()

    // 更旧的旧帧仍被 at 比较拒绝
    await appendUnreadMessage('main-4', at + 4, 3)
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
    fromPeer({ type: 'read_cursor_changed', opId: 'legacy:3', at: at + 1, sessionId: 'main' })
    await act(async () => { await Promise.resolve() })
    expect(screen.getByRole('button', { name: '回到底部 · 1 条新消息' })).toBeInTheDocument()
  })

  it('loads every ancestor level for a third-level session reached through tab sync', async () => {
    const user = await renderApp()
    // 侧栏现在递归渲染全部层级，三级会话直接可见；这个用例仍走跨标签切换，验证它同样补全祖先链。
    expect(screen.getByTitle('孙会话')).toBeInTheDocument()

    fromPeer(peerMessage({ type: 'active_session_changed', sessionId: 'grand', at: Date.now() + 10_000 }))
    expect(await screen.findByText('孙会话消息')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '孙会话' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '显示上级会话：子会话' }))
    expect(await screen.findByText('子会话消息')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()

    await waitFor(() => expect(messageSessionIds()).toEqual(['main', 'child', 'grand']))
    expect([...document.querySelectorAll('.session-divider')].map((node) => node.textContent)).toEqual(['主会话', '子会话', '孙会话'])
    expect(document.querySelectorAll('.tlg-session.is-ancestor-session')).toHaveLength(2)
    expect(document.querySelectorAll('.tlg-session.is-current-session')).toHaveLength(1)
    expect(document.querySelectorAll('.tl-bar')).toHaveLength(3)
    await waitFor(() => expect(screen.queryByRole('button', { name: /显示上级会话/ })).not.toBeInTheDocument())
  })
})
