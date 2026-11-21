import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import { tabId, type TabSyncMessage } from './tabsync'
import {
  appHandlers,
  createSnapshot,
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

async function renderApp(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('主会话消息')
  return user
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

  it('loads every ancestor level for a third-level session reached through tab sync', async () => {
    const user = await renderApp()
    // Sidebar 只渲染两级（library.tsx:146-151），三级会话无法从列表点进去；
    // 跨标签切换是它唯一的产品入口，因此这次切换本身也是 PRD-CONV-001 的一部分。
    expect(screen.queryByTitle('孙会话')).not.toBeInTheDocument()

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
