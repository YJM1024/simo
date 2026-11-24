import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import App from './app'
import { appHandlers, at, createSnapshot, findSession, MockWebSocket, type AppSnapshot } from './App.test-utils'
import { card } from './test/fixtures'

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

async function renderApp(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup()
  render(<App />)
  await screen.findByText('主会话消息')
  // 侧栏树先到再操作会话菜单：否则会读到尚未渲染的子会话行（渲染顺序不稳定）。
  await screen.findByTitle('子会话')
  return user
}

describe('App 会话操作失败反馈 (AC-CONV-002-02)', () => {
  it('创建会话失败时通过 toast 显示错误并保持当前会话', async () => {
    snap.createFail = true
    const user = await renderApp()
    await user.click(screen.getAllByRole('button', { name: '新建会话' })[0])
    await waitFor(() => expect(snap.createBodies).toHaveLength(1))

    const alert = await screen.findByText('请求失败（500），请稍后重试', { selector: '.toast' })
    expect(alert).toHaveAttribute('role', 'alert')
    expect(sessionRow('主会话')).toHaveClass('is-active')
    expect(screen.queryByTitle('新会话')).not.toBeInTheDocument()
  })

  it('rename 失败时显示错误、保留输入，重试后生效且不重复', async () => {
    snap.renameFail = true
    const user = await renderApp()
    await user.dblClick(sessionRow('主会话'))
    const input = screen.getByLabelText('重命名会话')
    await user.clear(input)
    await user.type(input, '失败标题{Enter}')
    await waitFor(() => expect(snap.renameBodies).toHaveLength(1))

    const alert = await screen.findByText('请求失败（500），请稍后重试', { selector: '.toast' })
    expect(alert).toHaveClass('toast')
    // 编辑框与用户输入都还在，列表未被乐观改标题
    expect(screen.getByLabelText('重命名会话')).toHaveValue('失败标题')
    expect(screen.queryByTitle('失败标题')).not.toBeInTheDocument()
    expect(screen.getByTitle('子会话')).toBeInTheDocument()

    snap.renameFail = false
    await user.keyboard('{Enter}')
    await waitFor(() => expect(snap.renameBodies).toHaveLength(2))
    expect(snap.renameBodies[1]).toEqual({ id: 'main', title: '失败标题' })
    expect(await screen.findByRole('heading', { name: '失败标题' })).toBeInTheDocument()
    expect(await screen.findByTitle('失败标题')).toBeInTheDocument()
    expect(screen.queryByLabelText('重命名会话')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('archive 失败时显示错误、会话仍留在列表，重试后归档成功', async () => {
    snap.archiveFail = true
    const user = await renderApp()
    // 主会话按产品裁决不可归档，这里用子会话验证归档失败路径
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '归档' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['archive:child']))

    const alert = await screen.findByText('请求失败（500），请稍后重试', { selector: '.toast' })
    expect(alert).toHaveClass('toast')
    expect(sessionRow('子会话')).not.toHaveClass('is-archived')
    expect(screen.getByRole('button', { name: '显示归档' })).toHaveAttribute('aria-pressed', 'false')

    snap.archiveFail = false
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '归档' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['archive:child', 'archive:child']))
    await waitFor(() => expect(screen.queryByTitle('子会话')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('pin 失败时显示 toast，菜单与列表都保持未置顶', async () => {
    snap.pinFail = true
    const user = await renderApp()
    const listCalls = snap.listCalls
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '置顶' }))
    await waitFor(() => expect(snap.pinCalls).toEqual(['pin:child']))

    const alert = await screen.findByText('请求失败（500），请稍后重试', { selector: '.toast' })
    expect(alert).toHaveClass('toast')
    expect(findSession(snap, 'child')?.pinned).toBe(false)
    expect(snap.listCalls).toBe(listCalls)

    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    expect(await screen.findByRole('button', { name: '置顶' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消置顶' })).not.toBeInTheDocument()
  })

  it('归档成功但列表刷新失败时进入可重试错误态，而不是半状态', async () => {
    const user = await renderApp()
    snap.treeFail = true
    await user.click(within(sessionRow('子会话')).getByRole('button', { name: '会话操作' }))
    await user.click(await screen.findByRole('button', { name: '归档' }))
    await waitFor(() => expect(snap.archiveCalls).toEqual(['archive:child']))

    // 归档请求本身成功，不该误报“归档失败”；刷新失败由侧栏既有错误态承接
    expect(await screen.findByText('会话加载失败')).toBeInTheDocument()
    expect(document.querySelector('.toast')).toBeNull()

    snap.treeFail = false
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.queryByText('会话加载失败')).not.toBeInTheDocument())
    // 重试拿到服务端真值：已归档会话默认隐藏
    expect(screen.queryByTitle('子会话')).not.toBeInTheDocument()
    expect(screen.getByTitle('主会话')).toBeInTheDocument()
  })

  it('卡片动作失败时卡片内联与页面级错误都可见，重试后恢复', async () => {
    snap.messages.main = [{ id: 'main-1', sessionId: 'main', sessionTitle: '主会话', role: 'agent', text: '请确认', at: at + 1, status: 'done', cards: [card({ id: 'c1', messageId: 'main-1' })] }]
    snap.cardFail = true
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('请确认')
    await user.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(snap.cardActionBodies).toHaveLength(1))
    expect(snap.cardActionBodies[0]).toMatchObject({ cardId: 'c1', actionId: 'submit' })

    const inline = await screen.findByText('请求失败（500），请稍后重试', { selector: '.card-error' })
    expect(inline).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    // 页面级通道（err-text / Composer）同样复用既有 error 展示
    expect((await screen.findAllByText('请求失败（500），请稍后重试')).length).toBeGreaterThan(1)

    snap.cardFail = false
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(snap.cardActionBodies).toHaveLength(2))
    await waitFor(() => expect(document.querySelector('.card-error')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '确认' })).toBeInTheDocument()
    expect(screen.queryByText('请求失败（500），请稍后重试')).not.toBeInTheDocument()
  })
})
