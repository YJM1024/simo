import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskBadge, TaskCard, TaskFilterBar, TasksTab } from './tasks'
import type { TaskCounts, TaskView } from '../types'

const counts = (overrides: Partial<TaskCounts> = {}): TaskCounts => ({ all: 6, pending: 2, running: 2, failed: 1, done: 1, ...overrides })

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: 1, updatedAt: 2, stepCount: 8, doneStepCount: 5, outputCount: 1, ...overrides,
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
  it('renders status, step progress, output count and waiting reason', () => {
    render(<TaskCard task={task({ waitingReason: 'confirmation' })} onOpen={vi.fn()} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card).toHaveAttribute('data-status', 'running')
    expect(screen.getByText('任务一')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('步骤 5/8')).toBeInTheDocument()
    expect(screen.getByText('产出 1 个')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(card.querySelector('.task-progress i')).toHaveStyle({ width: '63%' })
  })

  it('opens the task on click and marks a jump target', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<TaskCard task={task({ stepCount: undefined, doneStepCount: undefined, displayStatus: 'failed', failReason: '超时' })} isJumpTarget onOpen={onOpen} />)
    const card = document.querySelector('.task-card') as HTMLElement
    expect(card).toHaveClass('is-jump-target')
    expect(card.querySelector('.task-progress')).toBeNull()
    expect(screen.getByText('失败')).toBeInTheDocument()
    await user.click(card)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('maps unknown waiting reasons through and falls back to 未开始', () => {
    render(<TaskCard task={task({ displayStatus: 'pending', waitingReason: 'quota' })} onOpen={vi.fn()} />)
    expect(screen.getByText('未开始')).toBeInTheDocument()
    expect(screen.getByText('quota')).toBeInTheDocument()
  })
})

describe('TasksTab', () => {
  it('shows a skeleton while the first page loads', () => {
    render(<TasksTab tasks={[]} counts={counts()} filter="all" loading onFilterChange={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByLabelText('任务加载中')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
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
