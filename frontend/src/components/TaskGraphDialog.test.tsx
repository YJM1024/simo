import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskGraphDialog, layoutTaskGraph } from './tasks'
import type { TaskGraphNode, TaskGraphPayload } from '../types'

function node(overrides: Partial<TaskGraphNode> = {}): TaskGraphNode {
  return { id: 'n-1', title: '任务一', mode: 'plan', status: 'running', displayStatus: 'running', ...overrides }
}

function graph(overrides: Partial<TaskGraphPayload> = {}): TaskGraphPayload {
  return {
    nodes: [node(), node({ id: 'n-2', title: '任务二', displayStatus: 'failed' })],
    edges: [{ from: 'n-1', to: 'n-2' }],
    layers: [{ index: 0, nodeIds: ['n-1'] }, { index: 1, nodeIds: ['n-2'] }],
    total: 2,
    ...overrides,
  }
}

describe('layoutTaskGraph', () => {
  it('lays out at most twenty nodes in a fixed four-column grid', () => {
    const nodes = Array.from({ length: 10 }, (_, index) => node({ id: `n-${index}` }))
    const placement = layoutTaskGraph(graph({ nodes, edges: [], layers: [] }))
    expect(placement['n-0']).toEqual({ x: 24, y: 24, w: 156, h: 64 })
    expect(placement['n-3']).toEqual({ x: 24 + 3 * 188, y: 24, w: 156, h: 64 })
    expect(placement['n-4']).toEqual({ x: 24, y: 24 + 104, w: 156, h: 64 })
  })

  it('stacks layers by index once a graph exceeds twenty nodes', () => {
    const nodes = Array.from({ length: 22 }, (_, index) => node({ id: `n-${index}` }))
    const ids = (start: number, count: number): string[] => Array.from({ length: count }, (_, index) => `n-${start + index}`)
    const placement = layoutTaskGraph(graph({
      nodes,
      edges: [],
      layers: [
        { index: 3, nodeIds: ids(16, 6) },
        { index: 0, nodeIds: ids(0, 4) },
        { index: 2, nodeIds: ids(8, 8) },
        { index: 1, nodeIds: ids(4, 4) },
      ],
      total: 22,
    }))
    // 22 个节点走分层分支：每层按 index 顺序占用行，单层超过 4 个折行。
    expect(placement['n-0'].y).toBe(24)
    expect(placement['n-4'].y).toBe(24 + 104)
    expect(placement['n-8'].y).toBe(24 + 2 * 104)
    expect(placement['n-12'].y).toBe(24 + 3 * 104)
    expect(placement['n-16'].y).toBe(24 + 4 * 104)
    expect(placement['n-0'].x).toBe(24)
  })
})

describe('TaskGraphDialog', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<TaskGraphDialog open={false} graph={graph()} loading={false} onClose={vi.fn()} onOpenTask={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows loading, then the error state with retry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<TaskGraphDialog open graph={null} loading onClose={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('任务图加载中…')).toBeInTheDocument()
    rerender(<TaskGraphDialog open graph={null} loading={false} error="图失败" onRetry={onRetry} onClose={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('任务图加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders an empty graph without fabricating nodes', () => {
    render(<TaskGraphDialog open graph={graph({ nodes: [], edges: [], layers: [], total: 0 })} loading={false} onClose={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('本会话还没有任务')).toBeInTheDocument()
    expect(document.querySelectorAll('.task-graph-node')).toHaveLength(0)
  })

  it('renders nodes and edges with a dashed style for failed sources', () => {
    render(<TaskGraphDialog open graph={graph({ edges: [{ from: 'n-2', to: 'n-1' }], nodes: [node({ id: 'n-2', title: '失败任务', displayStatus: 'failed' }), node()] })} loading={false} onClose={vi.fn()} onOpenTask={vi.fn()} />)
    const edge = document.querySelector('.task-graph-edge') as SVGPathElement
    expect(edge).toHaveAttribute('data-from', 'n-2')
    expect(edge).toHaveAttribute('data-style', 'dashed')
    expect(edge).toHaveAttribute('stroke-dasharray', '4 4')
    expect(screen.getByText('失败任务')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeInTheDocument()
  })

  it('opens a node, closes from the button and Escape', async () => {
    const user = userEvent.setup()
    const onOpenTask = vi.fn()
    const onClose = vi.fn()
    render(<TaskGraphDialog open graph={graph()} loading={false} onClose={onClose} onOpenTask={onOpenTask} />)
    await user.click(screen.getByRole('button', { name: /任务二/ }))
    expect(onOpenTask).toHaveBeenCalledWith('n-2')
    await user.click(screen.getByRole('button', { name: '关闭任务图' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('marks loop tasks and keeps a minimum canvas width', () => {
    render(<TaskGraphDialog open graph={graph({ nodes: [node({ mode: 'loop' })], edges: [], layers: [], total: 1 })} loading={false} onClose={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('循环')).toBeInTheDocument()
    const canvas = document.querySelector('.task-graph-canvas') as HTMLElement
    expect(canvas.style.width).toBe('920px')
  })
})
