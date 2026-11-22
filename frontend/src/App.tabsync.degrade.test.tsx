import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import { appHandlers, createSnapshot, MockWebSocket, type AppSnapshot } from './App.test-utils'

/**
 * AC-SYNC-002-02 / AC-SYNC-003-02 的降级路径：
 * 浏览器不支持 BroadcastChannel（或实现缺失）时，App 必须静默退化，
 * 本地导航照常可用，并且刷新后以后端会话树为准，而不是沿用内存里的跨标签状态。
 *
 * 本文件独立于 App.tabsync.test.tsx：tabsync.ts 的 channel 是模块级单例，
 * 必须在模块加载前就把 BroadcastChannel 拿掉，才能覆盖"启动即不可用"。
 */
const server = setupServer()
let snap: AppSnapshot

beforeAll(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('BroadcastChannel', undefined)
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

describe('App tab sync degradation without BroadcastChannel', () => {
  it('mounts without throwing, keeps local navigation usable and reloads from the backend', async () => {
    expect(typeof BroadcastChannel).toBe('undefined')
    const user = userEvent.setup()
    const first = render(<App />)
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()

    // 没有跨标签通道，本地点击仍必须切换会话
    await user.click(screen.getByTitle('子会话').closest('.session-row') as HTMLElement)
    expect(await screen.findByText('子会话消息')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '子会话' })).toBeInTheDocument()

    first.unmount()

    // 重新加载：跨标签状态不持久化，活动会话以服务端返回的树为准
    render(<App />)
    expect(await screen.findByText('主会话消息')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '主会话' })).toBeInTheDocument()
    expect(screen.getByTitle('子会话')).toBeInTheDocument()
  })
})
