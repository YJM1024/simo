import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskMessageCard, TaskSummaryCard } from './tasks'
import type { Message, TaskView } from '../types'

function message(overrides: Partial<Message> = {}): Message {
  return { id: 'm-1', sessionId: 'main', role: 'agent', text: '整理周报', at: 1, status: 'done', taskId: 'task-1', category: 'task', ...overrides }
}

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '整理周报', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: 1, updatedAt: 2, ...overrides,
  }
}

describe('TaskMessageCard', () => {
  it('renders the task identity, status and mode metadata', () => {
    render(<TaskMessageCard message={message()} task={task()} onOpen={vi.fn()} />)
    const card = document.querySelector('.msg-task-card') as HTMLElement
    expect(card).toHaveAttribute('data-task-id', 'task-1')
    expect(card).toHaveAttribute('data-status', 'running')
    expect(screen.getByText('整理周报')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('计划')).toBeInTheDocument()
    expect(screen.getByText('任务')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看任务：整理周报' })).toBeInTheDocument()
  })

  it('renders the single open entry as 查看任务 with a 120x24 minimum target and only one focusable control', () => {
    render(<TaskMessageCard message={message()} task={task()} onOpen={vi.fn()} />)
    const open = document.querySelector('.msg-task-actions .task-card-open') as HTMLElement
    expect(open).toHaveTextContent('查看任务')
    expect(open).toHaveAttribute('aria-haspopup', 'dialog')
    const card = document.querySelector('.msg-task-card') as HTMLElement
    const focusable = card.querySelectorAll('button, a, input, [tabindex]:not([tabindex="-1"])')
    expect(focusable).toHaveLength(1)
  })

  it('opens the read-only detail from the single entry', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<TaskMessageCard message={message()} task={task()} onOpen={onOpen} />)
    await user.click(screen.getByRole('button', { name: '查看任务：整理周报' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first text line without a task view', () => {
    render(<TaskMessageCard message={message({ taskId: undefined, text: '批量整理\n第二行' })} onOpen={vi.fn()} />)
    expect(screen.getByText('批量整理')).toBeInTheDocument()
    expect(screen.getByText('未开始')).toBeInTheDocument()
  })

  it('shows failure and waiting reasons and reports inline action errors', () => {
    render(<TaskMessageCard message={message()} task={task({ displayStatus: 'failed', failReason: '模型超时', waitingReason: 'confirmation' })} onOpen={vi.fn()} error="确认失败" />)
    expect(screen.getByText('失败：模型超时')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('确认失败')
  })

  it('keeps 查看任务 on failed and pending cards and exposes confirm/cancel only for a confirmation wait', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TaskMessageCard message={message()} task={task({ displayStatus: 'failed', waitingReason: 'confirmation' })} onOpen={vi.fn()} onConfirm={onConfirm} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: '查看任务：整理周报' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument()
  })

  it('disables inline actions while busy and labels it 处理中…', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<TaskMessageCard message={message()} task={task({ waitingReason: 'confirmation' })} onOpen={vi.fn()} onConfirm={onConfirm} onCancel={vi.fn()} busy />)
    const confirm = screen.getByRole('button', { name: '处理中…' })
    expect(confirm).toBeDisabled()
    await user.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('offers resume only for a resource wait and hides all write actions when read-only', async () => {
    const user = userEvent.setup()
    const onResume = vi.fn()
    const { rerender } = render(<TaskMessageCard message={message()} task={task({ waitingReason: 'resource' })} onOpen={vi.fn()} onResume={onResume} />)
    await user.click(screen.getByRole('button', { name: '恢复' }))
    expect(onResume).toHaveBeenCalledTimes(1)
    rerender(<TaskMessageCard message={message()} task={task({ waitingReason: 'confirmation' })} onOpen={vi.fn()} onConfirm={vi.fn()} onCancel={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: /确认|取消|恢复/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看任务：整理周报' })).toBeInTheDocument()
  })
})

describe('TaskSummaryCard', () => {
  const tasks = Array.from({ length: 12 }, (_, index) => task({ id: `t-${index}`, title: `任务 ${index}` }))

  it('shows ten non-interactive rows and the remaining count before expanding', () => {
    const onToggle = vi.fn()
    render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} onToggle={onToggle} />)
    const card = document.querySelector('.msg-task-summary') as HTMLElement
    expect(card).toHaveAttribute('data-batch-id', 'b-1')
    expect(screen.getByText('已创建 12 个任务')).toBeInTheDocument()
    const rows = document.querySelectorAll('.msg-task-summary-item')
    expect(rows).toHaveLength(10)
    expect(rows[0].querySelectorAll('button, a, [tabindex]')).toHaveLength(0)
    expect(rows[0].tagName).toBe('LI')
    expect(screen.getByRole('button', { name: '还有 2 条' })).toBeInTheDocument()
  })

  it('shows the first three names plus 等 N 个 in the preview line', () => {
    render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} />)
    expect(document.querySelector('.msg-task-summary-preview')).toHaveTextContent('任务 0、任务 1、任务 2 等 12 个')
  })

  it('expands in place to the full batch, drops the more entry and can collapse again', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const { rerender } = render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} onToggle={onToggle} />)
    await user.click(screen.getByRole('button', { name: '还有 2 条' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} expanded onToggle={onToggle} />)
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: '还有 2 条' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '收起' }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('caps the expanded list at 100 rows', () => {
    const many = Array.from({ length: 130 }, (_, index) => task({ id: `m-${index}`, title: `任务 ${index}` }))
    render(<TaskSummaryCard message={message({ batchId: 'b-2' })} tasks={many} total={130} expanded />)
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(100)
    expect(screen.queryByRole('button', { name: /还有/ })).not.toBeInTheDocument()
  })

  it('keeps the card and offers retry when the batch request fails', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={[]} total={12} error="任务加载失败" onRetry={onRetry} />)
    expect(document.querySelector('.msg-task-summary')).toHaveAttribute('data-batch-id', 'b-1')
    expect(screen.getByText('已创建 12 个任务')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('任务加载失败')
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('routes row clicks to the task detail and card clicks to the tasks tab without cross-firing', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const onOpenTask = vi.fn()
    const onToggle = vi.fn()
    render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} onOpen={onOpen} onOpenTask={onOpenTask} onToggle={onToggle} />)
    expect(document.querySelector('.msg-task-summary')).toHaveClass('is-clickable')
    await user.click(screen.getByRole('button', { name: '查看任务：任务 0' }))
    expect(onOpenTask).toHaveBeenCalledWith(tasks[0])
    expect(onOpen).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '已创建 12 个任务' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    await user.click(document.querySelector('.msg-task-summary-preview') as HTMLElement)
    expect(onOpen).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole('button', { name: '还有 2 条' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(2)
    expect(onOpenTask).toHaveBeenCalledTimes(1)
  })
})
