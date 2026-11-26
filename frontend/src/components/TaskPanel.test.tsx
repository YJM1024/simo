import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskBadge, TaskCard, TaskFilterBar, TasksTab, alignTaskListJump } from './tasks'
import type { TaskCounts, TaskView } from '../types'

const counts = (overrides: Partial<TaskCounts> = {}): TaskCounts => ({ all: 6, pending: 2, running: 2, failed: 1, done: 1, ...overrides })

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: 1, updatedAt: 2, progress: 63, attempt: 2, ...overrides,
  }
}

describe('TaskFilterBar', () => {
  it('renders the fixed four filters in order with counts and marks the active one', () => {
    const onChange = vi.fn()
    render(<TaskFilterBar filter="running" counts={counts()} onChange={onChange} />)
    const group = screen.getByRole('group', { name: '任务筛选' })
    expect([...group.querySelectorAll('button')].map((button) => button.textContent?.replace(/\s+/g, ' ').trim()))
      .toEqual(['全部 6', '进行中 2', '失败 1', '已完成 1'])
    expect(screen.getByRole('button', { name: '进行中 2' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '全部 6' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('forwards the filter key without changing it locally', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TaskFilterBar filter="all" counts={counts()} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /已完成/ }))
    expect(onChange).toHaveBeenCalledWith('done')
    expect(screen.getByRole('button', { name: /全部/ })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('TaskCard', () => {
  it('renders status, mode, artifacts, step ticks, foot and waiting reason', () => {
    render(<TaskCard task={task({
      waitingReason: 'confirmation',
      steps: [
        { id: 's1', title: '读需求', status: 'done' },
        { id: 's2', title: '写初稿', status: 'running' },
        { id: 's3', title: '校对', status: 'pending' },
      ],
      artifacts: [{ id: 'a1', name: 'a.md', size: 10 }],
    })} onOpen={vi.fn()} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card).toHaveAttribute('data-status', 'running')
    expect(card).toHaveAttribute('data-mode', 'plan')
    expect(screen.getByText('任务一')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('产出 1 个')).toBeInTheDocument()
    expect(screen.getByText('尝试 2')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(card.querySelectorAll('.task-tick')).toHaveLength(3)
    expect(card.querySelectorAll('.task-tick[data-state="done"]')).toHaveLength(1)
    expect(card.querySelectorAll('.task-tick[data-state="running"]')).toHaveLength(1)
    expect(screen.getByText('已完成 1/3 步')).toBeInTheDocument()
    expect(screen.getByText('第 2 步 · 进行中')).toBeInTheDocument()
  })

  it('merges step ticks beyond twelve segments and marks a failed segment', () => {
    const steps = Array.from({ length: 24 }, (_, index) => ({ id: `s${index}`, title: `步骤${index}`, status: index === 5 ? 'failed' : index < 5 ? 'done' : 'pending' }))
    render(<TaskCard task={task({ displayStatus: 'failed', steps, failReason: '第 6 步写初稿超时' })} onOpen={vi.fn()} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card.querySelectorAll('.task-tick')).toHaveLength(12)
    expect(card.querySelectorAll('.task-tick[data-state="failed"]')).toHaveLength(1)
    expect(screen.getByText('第 6 步写初稿超时')).toBeInTheDocument()
  })

  it('falls back to the percent bar when the task carries no steps', () => {
    render(<TaskCard task={task()} onOpen={vi.fn()} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card.querySelector('.task-progress i')).toHaveStyle({ width: '63%' })
    expect(card.querySelector('.task-tick')).toBeNull()
  })

  it('renders the percent bar and text alongside step ticks for real progress', () => {
    render(<TaskCard task={task({
      progress: 40,
      steps: [
        { id: 's1', title: '读需求', status: 'done' },
        { id: 's2', title: '写初稿', status: 'running' },
      ],
    })} onOpen={vi.fn()} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card.querySelectorAll('.task-tick')).toHaveLength(2)
    expect(card.querySelector('.task-progress i')).toHaveStyle({ width: '40%' })
    expect(card.querySelector('.task-progress-text')).toHaveTextContent('40%')
  })

  it('opens the task on click and marks a jump target', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<TaskCard task={task({ progress: undefined, status: 'failed', displayStatus: 'failed', failReason: '超时' })} isJumpTarget onOpen={onOpen} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card).toHaveClass('is-jump-target')
    expect(card.querySelector('.task-progress')).toBeNull()
    expect(screen.getByText('失败')).toBeInTheDocument()
    await user.click(card)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('maps unknown waiting reasons through and falls back to 未开始', () => {
    render(<TaskCard task={task({ status: 'pending', displayStatus: 'pending', waitingReason: 'quota', steps: [{ id: 's1', title: '读需求', status: 'pending' }] })} onOpen={vi.fn()} />)
    expect(screen.getByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('quota')).toBeInTheDocument()
    expect(screen.getByText('等待前置')).toBeInTheDocument()
  })
})

describe('alignTaskListJump', () => {
  it('lands the target 4px below the scroller top and stays inside the 0–8px band', () => {
    const scroller = document.createElement('div')
    const target = document.createElement('div')
    document.body.append(scroller, target)
    scroller.scrollTop = 0
    scroller.getBoundingClientRect = () => ({ top: 100, left: 0, right: 280, bottom: 500, width: 280, height: 400, x: 0, y: 100, toJSON: () => ({}) })
    target.getBoundingClientRect = () => ({ top: 340 - scroller.scrollTop, left: 0, right: 280, bottom: 460, width: 280, height: 120, x: 0, y: 340, toJSON: () => ({}) })
    const offset = alignTaskListJump(scroller, target)
    expect(scroller.scrollTop).toBe(236)
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset).toBeLessThanOrEqual(8)
    target.remove()
    scroller.remove()
  })
})

describe('TasksTab', () => {
  it('shows a skeleton while the first page loads', () => {
    const { container } = render(<TasksTab tasks={[]} counts={counts()} filter="all" loading onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByLabelText('任务加载中')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // 加载期不显示任何假百分比（AC-TASK-002-04）。
    expect(container.textContent ?? '').not.toMatch(/\d+%/)
  })

  it('separates the empty all-state from the empty filtered state', () => {
    const { rerender } = render(<TasksTab tasks={[]} counts={counts({ all: 0 })} filter="all" loading={false} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('本会话还没有任务')).toBeInTheDocument()
    rerender(<TasksTab tasks={[]} counts={counts()} filter="failed" loading={false} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('没有符合条件的任务')).toBeInTheDocument()
  })

  it('renders the error state with a retry entry only', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<TasksTab tasks={[task()]} counts={counts()} filter="all" loading={false} error="任务加载失败" onRetry={onRetry} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('任务加载失败')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders one card per task, marks the jump target and opens the clicked task', async () => {
    const user = userEvent.setup()
    const onOpenTask = vi.fn()
    const tasks = [task(), task({ id: 'task-2', title: '任务二', displayStatus: 'done' })]
    render(<TasksTab tasks={tasks} counts={counts()} filter="all" loading={false} jumpTaskId="task-2" onFilterChange={vi.fn()} onOpenTask={onOpenTask} />)
    const list = screen.getByRole('list')
    expect(list.querySelectorAll('.task-card')).toHaveLength(2)
    const target = list.querySelector('[data-task-id="task-2"]') as HTMLElement
    expect(target).toHaveClass('is-jump-target')
    await user.click(target)
    expect(onOpenTask).toHaveBeenCalledWith(tasks[1])
  })

  it('offers 加载更多 only when another page exists and disables it while loading', async () => {
    const user = userEvent.setup()
    const onLoadMore = vi.fn()
    const { rerender } = render(<TasksTab tasks={[task()]} counts={counts()} filter="all" loading={false} onLoadMore={onLoadMore} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument()
    rerender(<TasksTab tasks={[task()]} counts={counts()} filter="all" loading={false} hasMore onLoadMore={onLoadMore} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    const more = screen.getByRole('button', { name: '加载更多' })
    await user.click(more)
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    rerender(<TasksTab tasks={[task()]} counts={counts()} filter="all" loading hasMore onLoadMore={onLoadMore} onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByRole('button', { name: '加载中…' })).toBeDisabled()
  })
})

describe('TaskBadge', () => {
  it('renders nothing at zero, the number up to 9 and 9+ from ten', () => {
    const { rerender, container } = render(<TaskBadge count={0} />)
    expect(container.querySelector('.insp-badge')).toBeNull()
    rerender(<TaskBadge count={7} />)
    expect(container.querySelector('.insp-badge')).toHaveTextContent('7')
    rerender(<TaskBadge count={10} />)
    expect(container.querySelector('.insp-badge')).toHaveTextContent('9+')
  })
})
