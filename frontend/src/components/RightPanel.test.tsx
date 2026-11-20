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
    render(<RightPanel session={null} projection={projection({ deliverables: { total: 0, items: [], hasMore: false } })} loading={false} onArtifactOpen={onArtifactOpen} />)
    expect(screen.queryByText('report.md')).not.toBeInTheDocument()
    expect(screen.queryByText('暂无交付物')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /已完成/ }))
    expect(screen.getByText('完成任务 0')).toBeInTheDocument()
  })

  it('uses the right rail navigation and does not fabricate missing session id', () => {
    render(<RightPanel session={null} projection={projection()} loading={false} />)
    const aside = screen.getByRole('complementary', { name: '会话概览' })
    expect(aside).toHaveAttribute('data-session', '')
    expect(within(aside).getByRole('button', { name: '☰' })).toHaveClass('active')
  })
})
