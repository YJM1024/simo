import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RightPanel } from '../components'
import { projection, session } from '../test/fixtures'

describe('RightPanel / OverviewPanel', () => {
  it('renders goal, inputs, status, task groups and deliverables', () => {
    render(<RightPanel session={session()} projection={projection()} loading={false} />)
    expect(screen.getByRole('complementary', { name: '会话概览' })).toBeInTheDocument()
    expect(screen.getByText('验证前端测试体系')).toBeInTheDocument()
    expect(screen.getByText('只改 frontend · 真实数据')).toBeInTheDocument()
    expect(document.querySelector('.insp-spec-status b')).toHaveTextContent('进行中')
    expect(screen.getByText('rev 7')).toBeInTheDocument()
    expect(screen.getByText('待确认 1')).toBeInTheDocument()
    expect(screen.getByText('共 5 · 本次 5')).toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '下载 report.md' })).toHaveAttribute('href', '/api/deliverables/a1/download')
  })

  it('shows loading, error/retry, and empty projection states', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<RightPanel session={session()} projection={null} loading />)
    expect(screen.getByText('右栏加载中…')).toBeInTheDocument()
    const onRetry = vi.fn()
    rerender(<RightPanel session={session()} projection={null} loading={false} error="投影失败" onRetry={onRetry} />)
    expect(screen.getByText('右栏加载失败')).toBeInTheDocument()
    expect(screen.getByText('投影失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<RightPanel session={session()} projection={null} loading={false} />)
    expect(screen.getByText('暂无会话投影')).toBeInTheDocument()
  })

  it('shows the draft placeholder instead of loading, error or empty projection', () => {
    render(<RightPanel session={session({ id: 'draft-1', draft: true })} projection={null} loading error="投影失败" />)
    expect(screen.getByText('发送第一条消息后生成目标与执行态')).toBeInTheDocument()
    expect(screen.queryByText('右栏加载中…')).not.toBeInTheDocument()
    expect(screen.queryByText('右栏加载失败')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无会话投影')).not.toBeInTheDocument()
  })

  it('expands and collapses grouped tasks and forwards messageId locating', async () => {
    const user = userEvent.setup()
    const onTaskClick = vi.fn()
    render(<RightPanel session={session()} projection={projection()} loading={false} onTaskClick={onTaskClick} />)
    const doneHead = screen.getByRole('button', { name: /已完成/ })
    expect(doneHead).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('完成任务 3')).not.toBeInTheDocument()
    await user.click(doneHead)
    expect(doneHead).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('完成任务 3')).toBeInTheDocument()
    await user.click(screen.getByText('完成任务 3'))
    expect(onTaskClick).toHaveBeenCalledWith({ id: 'done-3', title: '完成任务 3', messageId: 'msg-3' })
    await user.click(doneHead)
    expect(screen.queryByText('完成任务 3')).not.toBeInTheDocument()
  })

  it('counts against the server total and requests the full page on first expand', async () => {
    const user = userEvent.setup()
    const onExpandGroup = vi.fn()
    const partial = projection({
      tasks: {
        done: { total: 6, items: [0, 1, 2].map((n) => ({ id: `done-${n}`, title: `完成任务 ${n}`, state: 'done', updatedAt: 1_700_000_100_000 + n, messageId: `msg-${n}` })), hasMore: true },
        running: { total: 1, items: [{ id: 'run-1', title: '进行中的任务', state: 'running', updatedAt: 1_700_000_200_000, messageId: 'msg-run' }], hasMore: false },
        pending: { total: 0, items: [], hasMore: false },
      },
    })
    const { rerender } = render(<RightPanel session={session()} projection={partial} loading={false} onExpandGroup={onExpandGroup} />)
    const doneGroup = (): HTMLElement => screen.getByText('已完成', { selector: '.exec-name' }).closest('.exec-group') as HTMLElement
    // 分母取接口 total（6），未过滤到首页 3 条就冒充总数。
    expect(within(doneGroup()).getByText('3/6')).toBeInTheDocument()
    expect(within(doneGroup()).queryByText('完成任务 3')).not.toBeInTheDocument()

    await user.click(within(doneGroup()).getByRole('button', { name: /已完成/ }))
    expect(onExpandGroup).toHaveBeenCalledTimes(1)
    expect(within(doneGroup()).getByText('3/6')).toBeInTheDocument()

    // 补取完成：展开态保留，6 条全部可见，计数与可见条目一致。
    const full = projection({
      tasks: {
        done: { total: 6, items: [0, 1, 2, 3, 4, 5].map((n) => ({ id: `done-${n}`, title: `完成任务 ${n}`, state: 'done', updatedAt: 1_700_000_100_000 + n, messageId: `msg-${n}` })), hasMore: false },
        running: partial.tasks.running,
        pending: partial.tasks.pending,
      },
    })
    rerender(<RightPanel session={session()} projection={full} loading={false} onExpandGroup={onExpandGroup} />)
    expect(within(doneGroup()).getByText('6/6')).toBeInTheDocument()
    expect(within(doneGroup()).getByText('完成任务 5')).toBeInTheDocument()

    // 已取全的组再展开不需要补取。
    await user.click(within(doneGroup()).getByRole('button', { name: /已完成/ }))
    await user.click(within(doneGroup()).getByRole('button', { name: /已完成/ }))
    expect(onExpandGroup).toHaveBeenCalledTimes(1)
  })

  it('renders pending tasks in 未开始 without mixing them into 进行中', async () => {
    const user = userEvent.setup()
    const onTaskClick = vi.fn()
    const data = projection({
      tasks: {
        done: { total: 0, items: [], hasMore: false },
        running: { total: 1, items: [{ id: 'run-1', title: '进行中的任务', state: 'running', updatedAt: 1_700_000_200_000, messageId: 'msg-run' }], hasMore: false },
        pending: { total: 1, items: [{ id: 'pending-1', title: '待开始的任务', state: 'pending', updatedAt: 1_700_000_300_000, messageId: 'msg-pending' }], hasMore: false },
      },
    })
    render(<RightPanel session={session()} projection={data} loading={false} onTaskClick={onTaskClick} />)

    expect(screen.getByText('共 2 · 本次 2')).toBeInTheDocument()
    const runningGroup = screen.getByText('进行中', { selector: '.exec-name' }).closest('.exec-group') as HTMLElement
    const queuedGroup = screen.getByText('未开始', { selector: '.exec-name' }).closest('.exec-group') as HTMLElement
    expect(within(runningGroup).getByText('进行中的任务')).toBeInTheDocument()
    expect(within(runningGroup).queryByText('待开始的任务')).not.toBeInTheDocument()
    expect(within(queuedGroup).getByText('待开始的任务')).toBeInTheDocument()
    expect(within(queuedGroup).queryByText('进行中的任务')).not.toBeInTheDocument()

    await user.click(within(queuedGroup).getByText('待开始的任务'))
    expect(onTaskClick).toHaveBeenCalledWith({ id: 'pending-1', title: '待开始的任务', messageId: 'msg-pending' })
  })

  it('renders empty states for all task groups and deliverables', () => {
    const empty = projection({
      goal: null,
      constraints: [],
      inputs: [],
      status: 'draft',
      tasks: {
        done: { total: 0, items: [], hasMore: false },
        running: { total: 0, items: [], hasMore: false },
        pending: { total: 0, items: [], hasMore: false },
      },
      deliverables: { total: 0, items: [], hasMore: false },
      pendingConfirmations: { total: 0 },
    })
    render(<RightPanel session={session()} projection={empty} loading={false} />)
    expect(screen.getByText('目标待生成。')).toBeInTheDocument()
    expect(screen.getByText('暂无输入约束。')).toBeInTheDocument()
    expect(screen.getByText('暂无已完成任务')).toBeInTheDocument()
    expect(screen.getByText('暂无进行中任务')).toBeInTheDocument()
    expect(screen.getByText('暂无未开始任务')).toBeInTheDocument()
    expect(screen.getByText('暂无交付物')).toBeInTheDocument()
    expect(screen.getByText('草稿')).toBeInTheDocument()
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument()
  })

  it('opens deliverables and handles missing projection without crashing', async () => {
    const user = userEvent.setup()
    const onArtifactOpen = vi.fn()
    render(<RightPanel session={session()} projection={projection({ deliverables: { total: 0, items: [], hasMore: false } })} loading={false} onArtifactOpen={onArtifactOpen} />)
    expect(screen.queryByText('report.md')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无交付物')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /已完成/ }))
    expect(screen.getByText('完成任务 0')).toBeInTheDocument()
  })

  it('offers no submit, retry or cancel entry in the rail, including expanded task groups', async () => {
    const user = userEvent.setup()
    render(<RightPanel session={session()} projection={projection()} loading={false} onTaskClick={vi.fn()} />)
    const aside = screen.getByRole('complementary', { name: '会话概览' })

    // 三种任务组全部展开，排除“只有展开后才出现操作入口”的情况
    const heads = [...aside.querySelectorAll<HTMLButtonElement>('button.exec-head')]
    expect(heads).toHaveLength(3)
    for (const head of heads) {
      if (head.getAttribute('aria-expanded') === 'false') await user.click(head)
      expect(head).toHaveAttribute('aria-expanded', 'true')
    }

    expect(within(aside).queryAllByRole('button', { name: /提交|重试|取消/ })).toHaveLength(0)
    expect(within(aside).queryAllByRole('link', { name: /提交|重试|取消/ })).toHaveLength(0)
    expect(aside.querySelectorAll('form, input[type="submit"], button[type="submit"]')).toHaveLength(0)
    expect(aside.textContent).not.toMatch(/提交|重试|取消/)
  })

  it('uses the right rail navigation and does not fabricate missing session id', () => {
    render(<RightPanel session={null} projection={projection()} loading={false} />)
    const aside = screen.getByRole('complementary', { name: '会话概览' })
    expect(aside).not.toHaveAttribute('data-session')
    expect(screen.getByText('未选择会话')).toBeInTheDocument()
    expect(within(aside).getByRole('button', { name: '☰' })).toHaveClass('active')
  })
})
