import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import { type TabSyncMessage } from './tabsync'
import { appHandlers, createSnapshot, MockWebSocket, type AppSnapshot } from './App.test-utils'

const server = setupServer()
let snap: AppSnapshot

interface ChannelEvent { data: TabSyncMessage }
type ChannelListener = (event: ChannelEvent) => void

/**
 * 跨标签协议本身的契约（SYNC-002）：
 *   - 频道名固定为 simo.tab-sync.v1，另一标签页才接得上；
 *   - App 挂载时恢复上次会话，但不广播 active_session_changed（PRD-SYNC-002）：
 *     刷新只影响本标签，不能把其它标签的 active 一起拉走；
 *   - "外部切到同一会话"不应触发本页清空已加载的上级链（否则一跳就丢上下文）。
 * setup.ts 的 BroadcastChannel 是 noop，所以这里替换成可捕获实例的实现。
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

  postMessage(data: TabSyncMessage): void {
    CapturingBroadcastChannel.posted.push(data)
  }

  close(): void {
    this.listeners.clear()
  }

  emit(data: TabSyncMessage): void {
    for (const listener of this.listeners) listener({ data })
  }
}

function peerChannel(): CapturingBroadcastChannel {
  const channel = CapturingBroadcastChannel.instances
    .filter((item) => item.name === 'simo.tab-sync.v1')
    .at(-1)
  if (!channel) throw new Error('会话同步 BroadcastChannel 尚未创建：App 未挂载？')
  return channel
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
  // 不重置 instances：tabsync.ts 的 channel 是模块级单例，首个用例创建后后续用例复用
  CapturingBroadcastChannel.posted = []
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
  vi.unstubAllGlobals()
})

async function renderApp(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('主会话消息')
  return user
}

describe('跨标签通道契约 (SYNC-002)', () => {
  it('uses the stable channel name and does not announce the active session on mount', async () => {
    await renderApp()

    // 频道名是跨标签协议的一部分：改名会让两个标签页互相听不到
    expect(peerChannel()).toBeDefined()

    // 挂载是恢复而不是用户切换：广播 active 会把其它标签一起拉回本标签的会话（PRD-SYNC-002）。
    await act(async () => { await Promise.resolve() })
    expect(CapturingBroadcastChannel.posted.filter((item) => item.type === 'active_session_changed')).toEqual([])
  })

  it('keeps loaded ancestors when another tab re-announces the same session', async () => {
    const user = await renderApp()
    await user.click(screen.getByTitle('子会话').closest('.session-row') as HTMLElement)
    await screen.findByText('子会话消息')

    await user.click(await screen.findByRole('button', { name: '显示上级会话：主会话' }))
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()

    // 另一标签页广播"切到子会话"：与本页当前会话相同，不应清空上级链
    act(() => {
      peerChannel().emit({
        type: 'active_session_changed',
        tabId: 'tab-peer',
        opId: 'tab-peer:1',
        at: Date.now() + 10_000,
        sessionId: 'child',
      })
    })
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()
    expect(screen.getByText('主会话消息')).toBeInTheDocument()
    expect(screen.getByText('子会话消息')).toBeInTheDocument()
  })
})
