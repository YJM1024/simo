import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetricsDashboard, WorkbenchChart } from '../components'
import { metrics } from '../test/fixtures'

describe('MetricsDashboard', () => {
  it('renders KPI, latency, trend and detail table from real metrics shape', () => {
    render(<MetricsDashboard state="ready" windowKind="7d" data={metrics()} />)
    expect(screen.getByText('1.6k')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByText('30', { selector: '.metric-card b' })).toBeInTheDocument()
    expect(screen.getByText('4', { selector: '.metric-card b' })).toBeInTheDocument()
    expect(screen.getByText('900ms / 1600ms')).toBeInTheDocument()
    expect(screen.getByText('120ms / 300ms')).toBeInTheDocument()
    expect(screen.getByText(/80\.0% \(4\/5\)/)).toBeInTheDocument()
    expect(screen.getByText(/50\.0% \(2\/4\)/)).toBeInTheDocument()
    expect(screen.getByText(/20\.0% \(1\/5\)/)).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('2026-11-01')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7天' })).toHaveClass('active')
  })

  it('switches 7d/30d through callback', async () => {
    const user = userEvent.setup()
    const onWindowChange = vi.fn()
    render(<MetricsDashboard state="ready" windowKind="7d" data={metrics()} onWindowChange={onWindowChange} />)
    await user.click(screen.getByRole('button', { name: '30天' }))
    expect(onWindowChange).toHaveBeenCalledWith('30d')
  })

  it('renders loading, empty and error/retry states', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const { rerender } = render(<MetricsDashboard state="loading" data={metrics()} />)
    expect(screen.getByText('指标加载中…')).toBeInTheDocument()
    rerender(<MetricsDashboard state="error" data={metrics()} onRetry={onRetry} />)
    expect(screen.getByText('指标加载失败')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<MetricsDashboard state="empty" data={metrics()} />)
    expect(screen.getByText('窗口内暂无指标')).toBeInTheDocument()
    expect(screen.queryByText('每日趋势')).not.toBeInTheDocument()
  })

  it('explains missing samples and partial/missing telemetry instead of showing fake zeros', () => {
    render(<MetricsDashboard state="partial" data={metrics({
      totals: { ...metrics().totals, turns: 0, messages: 0, ttftP50Ms: null, ttftP90Ms: null },
      availability: { replySpeed: 'partial', ttft: 'missing', taskCompletion: 'partial' },
      kpis: { ...metrics().kpis!, reply: { p50: null, p90: null, sample: 0 }, ttft: { p50: null, p90: null, sample: 0 } },
      partialToday: true,
    })} />)
    expect(screen.getByText('部分数据：回复耗时、任务完成')).toBeInTheDocument()
    expect(screen.getByText('待埋点：首字延迟')).toBeInTheDocument()
    expect(screen.getByText('部分数据', { selector: '.metrics-badge' })).toBeInTheDocument()
    expect(screen.getByText(/今日未完整/)).toBeInTheDocument()
  })

  it('renders no-data fallbacks when data is absent', () => {
    render(<MetricsDashboard state="ready" />)
    expect(screen.getByText('7/30 天窗口 · 只读聚合')).toBeInTheDocument()
    expect(screen.getAllByText('待接入').length).toBeGreaterThan(0)
    expect(screen.getAllByText('无数据').length).toBeGreaterThan(0)
    expect(screen.getByText('暂无趋势数据')).toBeInTheDocument()
  })

  it('renders optional extra tables and empty table details', () => {
    render(<MetricsDashboard state="ready" data={metrics({
      tables: {
        tokensByModel: [{ model: 'deepseek', totalTokens: 100 }],
        emptyTable: [],
      },
    })} />)
    expect(screen.getByText('Token 按模型')).toBeInTheDocument()
    expect(screen.getByText('deepseek')).toBeInTheDocument()
    expect(screen.getByText('emptyTable')).toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('deduplicates samples under 20 with a badge', () => {
    render(<MetricsDashboard state="ready" data={metrics({
      taskQuality: { ...metrics().taskQuality!, response: { p50: null, p90: null, sample: 3 } },
    })} />)
    expect(screen.getByText('任务响应 p50 — / p90 —')).toBeInTheDocument()
    expect(screen.getByText('样本不足')).toBeInTheDocument()
  })
})

describe('WorkbenchChart', () => {
  it('renders one bar per bucket with normalized heights', () => {
    render(<WorkbenchChart buckets={[
      { label: '2026-11-01', messages: 10, tokens: 1, tasks: 0, start: 1 },
      { label: '2026-11-02', messages: 0, tokens: 0, tasks: 0, start: 2 },
    ]} />)
    expect(screen.getByRole('img', { name: '每日消息统计' })).toBeInTheDocument()
    expect(document.querySelectorAll('.chart .bar')).toHaveLength(2)
    expect(document.querySelector('.chart .bar i')).toHaveClass('h100')
    expect(document.querySelectorAll('.chart .bar i')[1]).toHaveClass('h2')
    expect(screen.getByText('11-01')).toBeInTheDocument()
  })

  it('renders an empty chart safely', () => {
    render(<WorkbenchChart buckets={[]} />)
    expect(document.querySelectorAll('.chart .bar')).toHaveLength(0)
  })
})

