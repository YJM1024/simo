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
    createdAt: 1, updatedAt: 2, stepCount: 6, doneStepCount: 2, outputCount: 3, ...overrides,
  }
}

describe('TaskMessageCard', () => {
  it('renders the task identity, status and progress metadata', () => {
    render(<TaskMessageCard message={message()} task={task()} onOpen={vi.fn()} />)
    const card = document.querySelector('.msg-task-card') as HTMLElement
    expect(card).toHaveAttribute('data-task-id', 'task-1')
    expect(card).toHaveAttribute('data-status', 'running')
    expect(screen.getByText('整理周报')).toBeInTheDocument()
    expect(screen.getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('步骤 2/6 · 产出 3 个')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看任务：整理周报' })).toBeInTheDocument()
  })

  it('falls back to the first text line and zero outputs without a task view', () => {
    render(<TaskMessageCard message={message({ taskId: undefined, text: '批量整理\n第二行' })} onOpen={vi.fn()} />)
    expect(screen.getByText('批量整理')).toBeInTheDocument()
    expect(screen.getByText('产出 0 个')).toBeInTheDocument()
    expect(screen.getByText('未开始')).toBeInTheDocument()
  })

  it('shows failure and waiting reasons and reports inline action errors', () => {
    render(<TaskMessageCard message={message()} task={task({ displayStatus: 'failed', failReason: '模型超时', waitingReason: 'confirmation', stepCount: undefined, outputCount: 0 })} onOpen={vi.fn()} error="确认失败" />)
    expect(screen.getByText('失败：模型超时')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('确认失败')
    expect(screen.getByText('产出 0 个')).toBeInTheDocument()
  })

  it('exposes confirm and cancel only for a confirmation wait and forwards them', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<TaskMessageCard message={message()} task={task({ waitingReason: 'confirmation' })} onOpen={vi.fn()} onConfirm={onConfirm} onCancel={onCancel} />)
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

  it('shows ten rows and the remaining count before expanding', () => {
    const onToggle = vi.fn()
    render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} onToggle={onToggle} onOpenTask={vi.fn()} />)
    expect(document.querySelector('.msg-task-summary')).toHaveAttribute('data-batch-id', 'b-1')
    expect(screen.getByText('12 个任务')).toBeInTheDocument()
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(10)
    expect(screen.getByRole('button', { name: '还有 2 条' })).toBeInTheDocument()
  })

  it('expands to the full batch, opens a row and can collapse again', async () => {
    const user = userEvent.setup()
    const onOpenTask = vi.fn()
    const onToggle = vi.fn()
    const { rerender } = render(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} onToggle={onToggle} onOpenTask={onOpenTask} />)
    await user.click(screen.getByRole('button', { name: '还有 2 条' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<TaskSummaryCard message={message({ batchId: 'b-1' })} tasks={tasks} total={12} expanded onToggle={onToggle} onOpenTask={onOpenTask} />)
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(12)
    await user.click(screen.getByRole('button', { name: /任务 11/ }))
    expect(onOpenTask).toHaveBeenCalledWith(tasks[11])
    await user.click(screen.getByRole('button', { name: '收起' }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })

  it('caps the expanded list at 100 rows', () => {
    const many = Array.from({ length: 130 }, (_, index) => task({ id: `m-${index}`, title: `任务 ${index}` }))
    render(<TaskSummaryCard message={message({ batchId: 'b-2' })} tasks={many} total={130} expanded onOpenTask={vi.fn()} />)
    expect(document.querySelectorAll('.msg-task-summary-item')).toHaveLength(100)
    expect(screen.queryByRole('button', { name: /还有/ })).not.toBeInTheDocument()
  })
})
