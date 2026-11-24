import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskDetailLayer } from './tasks'
import type { TaskDetailPayload, TaskStep, TraceItem, TaskView } from '../types'

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '整理周报', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: 1, updatedAt: 2, stepCount: 2, doneStepCount: 1, outputCount: 1, attempt: 2, ...overrides,
  }
}

function trace(overrides: Partial<TraceItem> = {}): TraceItem {
  return { id: 'tr-1', traceSeq: 1, category: 'action', text: '读取文件', at: 1_760_000_000_000, ...overrides }
}

function step(overrides: Partial<TaskStep> = {}): TaskStep {
  return { id: 's-1', seq: 1, title: '收集素材', status: 'done', traceCount: 1, traces: [trace()], ...overrides }
}

function detail(overrides: Partial<TaskDetailPayload> = {}): TaskDetailPayload {
  return {
    task: task(),
    steps: [step(), step({ id: 's-2', seq: 2, title: '撰写正文', status: 'running', traceCount: 0, traces: [] })],
    currentStepId: 's-2',
    traces: [],
    tracesHasMore: false,
    deliverables: [{ id: 'f-1', name: 'report.md', mime: 'text/markdown', size: 2048, createdAt: 1 }],
    context: { goal: '输出周报', constraints: ['中文'], inputs: ['素材.md'], historyCount: 3 },
    budget: { usedTokens: 1200, maxTokens: 4000, usedSteps: 1, maxSteps: 6 },
    ...overrides,
  }
}

describe('TaskDetailLayer', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<TaskDetailLayer open={false} detail={detail()} loading={false} onClose={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows loading, error with retry and the empty detail states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<TaskDetailLayer open detail={null} loading onClose={vi.fn()} />)
    expect(screen.getByText('任务详情加载中…')).toBeInTheDocument()
    rerender(<TaskDetailLayer open detail={null} loading={false} error="详情失败" onRetry={onRetry} onClose={vi.fn()} />)
    expect(screen.getByText('任务详情加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<TaskDetailLayer open detail={null} loading={false} onClose={vi.fn()} />)
    expect(screen.getByText('暂无任务详情')).toBeInTheDocument()
  })

  it('renders the header, metadata, context, budget and deliverable files', () => {
    render(<TaskDetailLayer open detail={detail()} loading={false} onClose={vi.fn()} onOpenFile={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    expect(dialog).toHaveAttribute('data-task-id', 'task-1')
    expect(dialog).toHaveAttribute('data-mode', 'overlay')
    expect(within(dialog.querySelector('.task-detail-head') as HTMLElement).getByText('整理周报')).toBeInTheDocument()
    expect(within(dialog.querySelector('.task-detail-head') as HTMLElement).getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByText('尝试')).toBeInTheDocument()
    expect(within(document.querySelector('.task-detail-meta') as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('输出周报')).toBeInTheDocument()
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByText('素材.md')).toBeInTheDocument()
    expect(screen.getByText('3 条')).toBeInTheDocument()
    expect(screen.getByText('已用 1200/4000 tokens · 1/6 步')).toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 report.md' })).toBeInTheDocument()
  })

  it('opens the current step and shows trace labels, then toggles a long trace', async () => {
    const user = userEvent.setup()
    const longText = '很长的轨迹'.repeat(30)
    const data = detail({ steps: [step({ id: 's-1', traces: [trace({ id: 'tr-long', text: longText })] }), step({ id: 's-2', title: '撰写正文', status: 'running', traceCount: 0, traces: [] })], currentStepId: 's-1' })
    render(<TaskDetailLayer open detail={data} loading={false} onClose={vi.fn()} />)
    const stepHead = screen.getByRole('button', { name: /收集素材/ })
    expect(stepHead).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('动作')).toBeInTheDocument()
    const traceToggle = screen.getByRole('button', { name: '展开' })
    await user.click(traceToggle)
    expect(screen.getByRole('button', { name: '收起' })).toHaveAttribute('aria-expanded', 'true')
    await user.click(stepHead)
    expect(stepHead).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('动作')).not.toBeInTheDocument()
  })

  it('keeps pending steps non-interactive', () => {
    render(<TaskDetailLayer open detail={detail({ steps: [step({ id: 's-3', seq: 3, title: '待办步骤', status: 'pending', traceCount: 0, traces: undefined })] })} loading={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /待办步骤/ })).not.toBeInTheDocument()
    expect(document.querySelector('.task-step-head')).toHaveTextContent('待办步骤')
  })

  it('adds the loop timeline and expands older traces in pages of 200', async () => {
    const user = userEvent.setup()
    const traces = [trace({ id: 't-1', text: '循环轨迹一' }), trace({ id: 't-2', traceSeq: 2, text: '循环轨迹二' })]
    render(<TaskDetailLayer open detail={detail({ task: task({ mode: 'loop' }), traces, tracesHasMore: true })} loading={false} onClose={vi.fn()} />)
    expect(document.querySelectorAll('.task-timeline-row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '加载更早轨迹' }))
    expect(screen.getByText('仅显示最近 400 条')).toBeInTheDocument()
  })

  it('closes on Escape and the close button, and shows failure and waiting labels', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TaskDetailLayer open detail={detail({ task: task({ displayStatus: 'failed', failReason: '模型超时', waitingReason: 'confirmation' }) })} loading={false} onClose={onClose} />)
    expect(screen.getByText('失败：模型超时')).toBeInTheDocument()
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭任务详情' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
