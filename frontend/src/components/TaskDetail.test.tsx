import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskDetailLayer } from './tasks'
import type { TaskDetailPayload, TaskStep, TraceItem, TaskView } from '../types'

function task(overrides: Partial<TaskView> = {}): TaskView {
  return {
    id: 'task-1', sessionId: 'main', title: '整理周报', mode: 'plan', status: 'running', displayStatus: 'running',
    createdAt: 1, updatedAt: 2, attempt: 2, ...overrides,
  }
}

function trace(overrides: Partial<TraceItem> = {}): TraceItem {
  return { id: 'tr-1', stepId: 's-1', seq: 1, category: 'action', text: '读取文件', at: 1_760_000_000_000, ...overrides }
}

function step(overrides: Partial<TaskStep> = {}): TaskStep {
  return { id: 's-1', seq: 1, title: '收集素材', status: 'done', traceCount: 1, ...overrides }
}

function detail(overrides: Partial<TaskDetailPayload> = {}): TaskDetailPayload {
  return {
    task: task(),
    steps: [step(), step({ id: 's-2', seq: 2, title: '撰写正文', status: 'running', traceCount: 0 })],
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
    expect(screen.getByText('详情失败')).toBeInTheDocument()
    // 错误态恰好一个重试入口；正常态没有重试入口（COMP-task-detail-layer A3）。
    expect(screen.getAllByRole('button', { name: '重试' })).toHaveLength(1)
    expect(document.querySelectorAll('section.task-detail form, section.task-detail input, section.task-detail textarea')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<TaskDetailLayer open detail={detail()} loading={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
    rerender(<TaskDetailLayer open detail={null} loading={false} onClose={vi.fn()} />)
    expect(screen.getByText('暂无任务详情')).toBeInTheDocument()
  })

  it('renders the header, computed metadata, context, budget and deliverable files', () => {
    render(<TaskDetailLayer open detail={detail()} loading={false} onClose={vi.fn()} onOpenFile={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    expect(dialog).toHaveAttribute('data-task-id', 'task-1')
    expect(dialog).toHaveAttribute('data-mode', 'plan')
    expect(dialog).toHaveAttribute('data-layout', 'overlay')
    const head = dialog.querySelector('.task-detail-head') as HTMLElement
    expect(within(head).getByText('任务详情 · 计划')).toBeInTheDocument()
    expect(within(head).getByText('只读')).toBeInTheDocument()
    expect(within(dialog.querySelector('.task-detail-title-row') as HTMLElement).getByText('整理周报')).toBeInTheDocument()
    expect(within(dialog.querySelector('.task-detail-title-row') as HTMLElement).getByText('进行中')).toBeInTheDocument()
    expect(screen.getByText('2 步 · 已完成 1 · 产出 1 个')).toBeInTheDocument()
    expect(screen.getByText('输出周报')).toBeInTheDocument()
    expect(screen.getByText('中文')).toBeInTheDocument()
    expect(screen.getByText('素材.md')).toBeInTheDocument()
    expect(screen.getByText('3 条')).toBeInTheDocument()
    expect(screen.getByText('已用 1200/4000 tokens · 1/6 步')).toBeInTheDocument()
    expect(screen.getByText('report.md')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 report.md' })).toBeInTheDocument()
  })

  it('opens the current step, groups flat traces by stepId and toggles a long trace', async () => {
    const user = userEvent.setup()
    const longText = '很长的轨迹'.repeat(30)
    const data = detail({
      steps: [step(), step({ id: 's-2', title: '撰写正文', status: 'running', traceCount: 0 })],
      traces: [trace({ id: 'tr-long', stepId: 's-1', text: longText })],
      currentStepId: 's-1',
    })
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
    render(<TaskDetailLayer open detail={detail({ steps: [step({ id: 's-3', seq: 3, title: '待办步骤', status: 'pending', traceCount: 0 })], traces: [], currentStepId: 's-3' })} loading={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /待办步骤/ })).not.toBeInTheDocument()
    expect(document.querySelector('.task-step-head')).toHaveTextContent('待办步骤')
  })

  it('renders the explore timeline as a flat trace list', () => {
    const traces = [trace({ id: 't-1', text: '探索轨迹一' }), trace({ id: 't-2', seq: 2, text: '探索轨迹二' })]
    render(<TaskDetailLayer open detail={detail({ task: task({ mode: 'explore' }), traces, tracesHasMore: true })} loading={false} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    expect(dialog).toHaveAttribute('data-mode', 'explore')
    expect(dialog.querySelector('.task-detail-tip')).toBeInTheDocument()
    expect(dialog.querySelectorAll('.task-trace')).toHaveLength(2)
    expect(dialog.querySelectorAll('.task-step')).toHaveLength(0)
  })

  it('caps the explore timeline at 200 rows, pages +200 up to 500 and then hides the entry', async () => {
    const user = userEvent.setup()
    const traces = Array.from({ length: 520 }, (_, i) => trace({ id: `ex-${i + 1}`, seq: i + 1, stepId: undefined, at: 1_760_000_000_000 + i, text: `探索轨迹 ${i + 1}` }))
    render(<TaskDetailLayer open detail={detail({ task: task({ mode: 'explore' }), traces, tracesHasMore: true })} loading={false} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    const rows = (): number => dialog.querySelectorAll('.task-trace').length
    expect(rows()).toBe(200)
    await user.click(screen.getByRole('button', { name: '加载更早轨迹' }))
    expect(rows()).toBe(400)
    await user.click(screen.getByRole('button', { name: '加载更早轨迹' }))
    expect(rows()).toBe(500)
    expect(screen.queryByRole('button', { name: '加载更早轨迹' })).not.toBeInTheDocument()
    expect(screen.getByText('已显示最近 500 条，达到上限')).toBeInTheDocument()
    expect(rows()).toBe(500)
  })

  it('applies the same 200/500 cap to plan steps and never exceeds 500 rows', async () => {
    const user = userEvent.setup()
    const traces = Array.from({ length: 520 }, (_, i) => trace({ id: `pl-${i + 1}`, seq: i + 1, stepId: 's-1', at: 1_760_000_000_000 + i, text: `步骤轨迹 ${i + 1}` }))
    render(<TaskDetailLayer open detail={detail({
      steps: [step({ traceCount: 520, status: 'running' })],
      currentStepId: 's-1',
      traces,
      tracesHasMore: true,
    })} loading={false} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    const rows = (): number => dialog.querySelectorAll('.task-step .task-trace').length
    expect(rows()).toBe(200)
    await user.click(screen.getByRole('button', { name: '加载更早轨迹' }))
    expect(rows()).toBe(400)
    await user.click(screen.getByRole('button', { name: '加载更早轨迹' }))
    expect(rows()).toBe(500)
    expect(screen.queryByRole('button', { name: '加载更早轨迹' })).not.toBeInTheDocument()
    expect(screen.getByText('已显示最近 500 条，达到上限')).toBeInTheDocument()
    expect(rows()).toBe(500)
  })

  it('shows the failure reason or the waiting reason, never both at once', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { rerender } = render(<TaskDetailLayer open detail={detail({ task: task({ displayStatus: 'failed', failReason: '模型超时' }) })} loading={false} onClose={onClose} />)
    expect(screen.getByText('失败：模型超时')).toBeInTheDocument()
    expect(screen.queryByText('等待确认')).not.toBeInTheDocument()
    rerender(<TaskDetailLayer open detail={detail({ task: task({ displayStatus: 'running', waitingReason: 'confirmation' }) })} loading={false} onClose={onClose} />)
    expect(screen.getByText('等待确认')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭任务详情' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('lands the requested step 4px below the detail scroller top and focuses it', () => {
    const proto = HTMLElement.prototype.getBoundingClientRect
    const rect = (top: number): DOMRect => ({ top, left: 0, right: 280, bottom: top + 30, width: 280, height: 30, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains('task-detail-body')) return rect(100)
      if (this.getAttribute('data-step-id') === 's-1') return rect(500 - (document.querySelector('.task-detail-body')?.scrollTop ?? 0))
      return proto.call(this)
    }
    try {
      render(<TaskDetailLayer open detail={detail()} jumpStepId="s-1" loading={false} onClose={vi.fn()} />)
      const body = document.querySelector('.task-detail-body') as HTMLElement
      expect(body.scrollTop).toBe(396)
      const row = document.querySelector('[data-step-id="s-1"]') as HTMLElement
      expect(row).toHaveFocus()
      expect(row).toHaveAttribute('tabindex', '-1')
      expect(row).toHaveClass('is-jump-target')
      expect(row.getBoundingClientRect().top - body.getBoundingClientRect().top).toBe(4)
    } finally {
      HTMLElement.prototype.getBoundingClientRect = proto
    }
  })

  it('locks body scroll, marks the middle column inert and returns focus to the source on close', () => {
    const middle = document.createElement('div')
    middle.className = 'conversation-panel'
    const source = document.createElement('button')
    source.textContent = '来源任务卡'
    middle.append(source)
    document.body.append(middle)
    source.focus()
    const view = render(<TaskDetailLayer open detail={detail()} loading={false} onClose={vi.fn()} />)
    expect(middle).toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('hidden')
    const dialog = screen.getByRole('dialog', { name: '任务详情' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    view.unmount()
    expect(middle).not.toHaveAttribute('inert')
    expect(document.body.style.overflow).toBe('')
    expect(source).toHaveFocus()
    middle.remove()
  })

  it('exposes no write entry: the only controls are close, step and trace toggles and file open', () => {
    render(<TaskDetailLayer open detail={detail({
      task: task({ displayStatus: 'failed', failReason: '超时' }),
      steps: [step(), step({ id: 's-2', seq: 2, title: '撰写正文', status: 'failed', traceCount: 1 })],
      traces: [trace({ stepId: 's-2', text: '写失败' })],
      currentStepId: 's-2',
    })} loading={false} onClose={vi.fn()} onOpenFile={vi.fn()} />)
    const buttons = [...document.querySelectorAll('.task-detail button')]
    expect(buttons).toHaveLength(4)
    expect(screen.getByRole('button', { name: '关闭任务详情' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开 report.md' })).toBeInTheDocument()
    for (const forbidden of ['重试', '取消', '编辑', '删除', '确认', '恢复']) {
      expect(screen.queryByRole('button', { name: new RegExp(forbidden) })).not.toBeInTheDocument()
    }
    expect(document.querySelectorAll('.task-detail form, .task-detail input, .task-detail textarea')).toHaveLength(0)
  })
})
