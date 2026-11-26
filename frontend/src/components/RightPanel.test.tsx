import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RightPanel } from '../components'
import { projection, session } from '../test/fixtures'
import type { TaskCounts, TaskView } from '../types'

const counts = (overrides: Partial<TaskCounts> = {}): TaskCounts => ({ all: 6, pending: 2, running: 2, failed: 1, done: 1, ...overrides })

function taskView(overrides: Partial<TaskView> = {}): TaskView {
  return { id: 'task-1', sessionId: 'main', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running', createdAt: 1, updatedAt: 2, progress: 63, ...overrides }
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('RightPanel / OverviewPanel', () => {
  it('renders the three-tab shell with the four overview blocks in fixed order', () => {
    render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} />)
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    expect(aside).toHaveAttribute('data-tab', 'overview')
    expect(aside).toHaveAttribute('data-collapsed', 'false')
    expect(aside).toHaveAttribute('data-session', 'main')
    expect(aside.querySelectorAll('.insp-rail button')).toHaveLength(3)
    expect([...aside.querySelectorAll('.insp-rail button')].map((button) => button.getAttribute('data-tab'))).toEqual(['overview', 'tasks', 'deliverables'])
    expect(screen.getByText('验证前端测试体系')).toBeInTheDocument()
    expect(screen.getByText('只改 frontend · 真实数据')).toBeInTheDocument()
    expect(document.querySelector('.insp-spec-status b')).toHaveTextContent('进行中')
    expect(screen.getByText('rev 7')).toBeInTheDocument()
    expect(screen.getByText('2 进行中 / 2 未开始 / 1 已完成 / 1 失败')).toBeInTheDocument()
    const blocks = [...aside.querySelectorAll('.insp-block')].map((block) => block.getAttribute('data-block'))
    expect(blocks).toEqual(['goal', 'input', 'tasks', 'deliverables'])
  })

  it('shows loading, error/retry and empty projection states', async () => {
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

  it('keeps four-block collapse memory per session across remounts', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} />)
    const goalHead = screen.getByRole('button', { name: '目标' })
    expect(goalHead).toHaveAttribute('aria-expanded', 'true')
    await user.click(goalHead)
    expect(goalHead).toHaveAttribute('aria-expanded', 'false')
    expect(window.localStorage.getItem('simo.insp.overview.main')).toBe(JSON.stringify(['goal']))
    unmount()

    render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} />)
    expect(screen.getByRole('button', { name: '目标' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('switches to the tasks tab and renders the fixed four filters with counts', async () => {
    const user = userEvent.setup()
    const onTaskFilterChange = vi.fn()
    render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts({ all: 11, running: 2, failed: 1, done: 3 })} tab="tasks" tasks={[taskView()]} onTaskFilterChange={onTaskFilterChange} onOpenTask={vi.fn()} />)
    expect(screen.getByRole('complementary', { name: '会话右栏' })).toHaveAttribute('data-tab', 'tasks')
    const group = screen.getByRole('group', { name: '任务筛选' })
    expect([...group.querySelectorAll('button')].map((button) => button.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['全部 11', '进行中 2', '失败 1', '已完成 3'])
    await user.click(within(group).getByRole('button', { name: /进行中/ }))
    expect(onTaskFilterChange).toHaveBeenCalledWith('running')
    expect(screen.getByRole('list').querySelectorAll('.task-card')).toHaveLength(1)
  })

  it('opens the tasks tab from the rail but blocks it when the session has no tasks', async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()
    render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} onTabChange={onTabChange} />)
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    await user.click(within(aside).getByRole('button', { name: /任务，2 个进行中/ }))
    expect(onTabChange).toHaveBeenCalledWith('tasks')

    const { rerender } = render(<RightPanel session={session({ id: 'empty' })} projection={projection()} loading={false} counts={counts({ all: 0, pending: 0, running: 0, failed: 0, done: 0 })} onTabChange={onTabChange} />)
    const emptyAside = screen.getAllByRole('complementary', { name: '会话右栏' }).at(-1) as HTMLElement
    const disabled = within(emptyAside).getByRole('button', { name: '任务，0 个进行中' })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    onTabChange.mockClear()
    await user.click(disabled)
    expect(onTabChange).not.toHaveBeenCalled()
    expect(emptyAside).not.toHaveAttribute('data-tab', 'tasks')
    rerender(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} onTabChange={onTabChange} />)
  })

  it('badge shows 2, 9+ and nothing at all for zero', () => {
    const { rerender } = render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts({ running: 2 })} />)
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    expect(within(aside).getByRole('button', { name: '任务，2 个进行中' }).querySelector('.insp-badge')).toHaveTextContent('2')
    rerender(<RightPanel session={session()} projection={projection()} loading={false} counts={counts({ running: 10 })} />)
    expect(within(aside).getByRole('button', { name: '任务，9 个以上进行中' }).querySelector('.insp-badge')).toHaveTextContent('9+')
    rerender(<RightPanel session={session()} projection={projection()} loading={false} counts={counts({ running: 0, all: 4 })} />)
    expect(within(aside).getByRole('button', { name: '任务，0 个进行中' }).querySelector('.insp-badge')).toBeNull()
  })

  it('collapses to the rail-only strip with persisted state and restores per session', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} />)
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    await user.click(screen.getByRole('button', { name: '收起右栏' }))
    expect(aside).toHaveAttribute('data-collapsed', 'true')
    expect(aside.querySelector('.insp-panel')).toHaveAttribute('hidden')
    expect(window.localStorage.getItem('simo.insp.collapsed.main')).toBe('1')
    unmount()

    render(<RightPanel session={session()} projection={projection()} loading={false} counts={counts()} />)
    expect(screen.getByRole('complementary', { name: '会话右栏' })).toHaveAttribute('data-collapsed', 'true')
  })

  it('renders the deliverables tab with grouped files and no upload entry', () => {
    render(<RightPanel session={session()} projection={projection({ deliverables: { total: 0, items: [], hasMore: false } })} loading={false} counts={counts()} tab="deliverables" deliverableGroups={[{ taskId: 'task-1', taskTitle: '任务一', taskStatus: 'done', files: [{ id: 'f1', name: 'report.md', mime: 'text/markdown', size: 1024, createdAt: 1, typeBadge: 'doc', downloadUrl: '/api/artifacts/f1/content?download=1' }] }]} deliverablesTotal={1} deliverablesFileCount={1} onOpenFile={vi.fn()} />)
    expect(screen.getByText('任务一')).toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载 report.md' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /上传|删除|重命名/ })).not.toBeInTheDocument()
  })

  it('shows empty states for all four blocks without fabricating data', () => {
    const empty = projection({
      goal: null,
      constraints: [],
      inputs: [],
      status: 'draft',
      tasks: { done: { total: 0, items: [], hasMore: false }, running: { total: 0, items: [], hasMore: false }, pending: { total: 0, items: [], hasMore: false } },
      deliverables: { total: 0, items: [], hasMore: false },
      pendingConfirmations: { total: 0 },
    })
    render(<RightPanel session={session()} projection={empty} loading={false} counts={counts({ all: 0, pending: 0, running: 0, failed: 0, done: 0 })} />)
    expect(screen.getByText('目标待生成。')).toBeInTheDocument()
    expect(screen.getByText('暂无输入约束。')).toBeInTheDocument()
    expect(screen.getByText('本会话还没有任务。')).toBeInTheDocument()
    expect(screen.getByText('暂无交付物。')).toBeInTheDocument()
    expect(screen.getByText('草稿', { selector: '.insp-spec-status b' })).toBeInTheDocument()
    expect(screen.queryByText(/待确认/)).not.toBeInTheDocument()
  })

  it('does not fabricate a session id or a task entry and offers no write actions', () => {
    render(<RightPanel session={null} projection={projection()} loading={false} counts={counts({ all: 0, running: 0, pending: 0, failed: 0, done: 0 })} />)
    const aside = screen.getByRole('complementary', { name: '会话右栏' })
    expect(aside).not.toHaveAttribute('data-session')
    expect(screen.getByText('未选择会话')).toBeInTheDocument()
    expect(within(aside).getByRole('button', { name: '概览' })).toHaveAttribute('aria-current', 'page')
    expect(within(aside).queryAllByRole('button', { name: /提交|重试|取消|删除/ })).toHaveLength(0)
    expect(aside.querySelectorAll('form, input, textarea, select')).toHaveLength(0)
  })
})
