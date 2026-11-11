// features/workbench/UsagePage.tsx —— 用量统计（UI-1，树状表格 + 每行内嵌时间序列）
//
// 每行 = 一个会话（按会话树缩进，负责人头像）；行右侧是该会话自己的 sparkline（同一时间轴），
// 父行含子会话汇总；可折叠；顶部统一切换指标（消息/token）、粒度（天/周/月）、范围（7/30/自定义）。
// 全部 SVG 自绘；后端用量接口未就绪时用确定性示例数据（source=sample）。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSessions, toSessions } from '../../platform/http.ts'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { fallbackOwnerForSession, findAgent, useAgentCatalog } from '../../platform/agents.ts'
import type { SessionSummary } from '../../platform/types.ts'
import { EmptyPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  buildBuckets,
  buildUsageTree,
  flattenUsageRows,
  formatLastActive,
  formatUsageNumber,
  sampleSessions,
  sparklinePoints,
  usageRangeBounds,
  type UsageGranularity,
  type UsageMetric,
  type UsageRangeMode,
} from './usage.ts'

const METRIC_TABS: Array<{ id: UsageMetric; label: string }> = [
  { id: 'messages', label: '消息数' },
  { id: 'tokens', label: 'token' },
]
const GRANULARITY_TABS: Array<{ id: UsageGranularity; label: string }> = [
  { id: 'day', label: '天' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
]

function UsageSparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length === 0) return null
  const points = sparklinePoints(values)
  const max = Math.max(1, ...values)
  return (
    <svg viewBox="0 0 160 28" preserveAspectRatio="none" className="h-7 w-full min-w-[8rem] max-w-[16rem]" role="img" aria-label={label}>
      <title>{label}</title>
      <line x1="2" y1="26" x2="158" y2="26" className="stroke-border-subtle" strokeWidth="0.5" />
      <polyline points={points} fill="none" className="stroke-accent" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="158" cy={28 - 2 - ((values[values.length - 1] ?? 0) / max) * 24} r="1.8" className="fill-accent" />
    </svg>
  )
}

export default function UsagePage({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, true, onClose)
  const agentCatalog = useAgentCatalog()

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [source, setSource] = useState<'api' | 'sample'>('sample')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<UsageMetric>('messages')
  const [granularity, setGranularity] = useState<UsageGranularity>('day')
  const [rangeMode, setRangeMode] = useState<UsageRangeMode>('7')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const payload = await getSessions()
      const list = toSessions(payload)
      if (list.length === 0) {
        setSessions(sampleSessions())
        setSource('sample')
      } else {
        setSessions(list)
        setSource('api')
      }
    } catch {
      setSessions(sampleSessions())
      setSource('sample')
      setError('会话接口暂不可用，当前展示示例用量数据。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const now = Date.now()
  const bounds = useMemo(
    () => usageRangeBounds(rangeMode, now, customStart, customEnd),
    [rangeMode, customStart, customEnd, now],
  )
  const buckets = useMemo(() => buildBuckets(bounds.start, bounds.end, granularity), [bounds.start, bounds.end, granularity])
  const tree = useMemo(() => buildUsageTree(sessions, now), [sessions, now])
  const rows = useMemo(() => flattenUsageRows(tree, buckets, metric, collapsed), [tree, buckets, metric, collapsed])

  const axisLabels = useMemo(() => {
    if (buckets.length <= 6) return buckets.map((bucket) => bucket.label)
    const step = Math.ceil(buckets.length / 6)
    return buckets.filter((_, index) => index % step === 0).map((bucket) => bucket.label)
  }, [buckets])

  const toggleCollapsed = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="用量统计"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className="popover-surface flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 font-serif text-[18px] font-medium tracking-normal text-ink">用量统计</h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">
              每行一个会话（按会话树缩进）；右侧是同一时间轴上的消息数 / token 序列；父行含子会话汇总。
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span
              className={`rounded-pill border px-2 py-0.5 font-mono text-2xs ${
                source === 'api' ? 'border-ok-border bg-ok-soft text-ok-ink' : 'border-warn-border bg-warn-soft text-warn-ink'
              }`}
              title={source === 'api' ? '会话来自后端；token 为示例估算' : '后端用量/会话接口未就绪，展示示例数据'}
            >
              {source === 'api' ? '会话来自后端 · token 估算' : '示例数据'}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted disabled:opacity-50"
            >
              刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted hover:text-ink"
            >
              关闭 ×
            </button>
          </div>
        </header>

        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
          <div className="flex items-center rounded-md border border-border-subtle bg-surface-solid p-0.5" role="group" aria-label="指标">
            {METRIC_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={metric === tab.id}
                onClick={() => setMetric(tab.id)}
                className={`cursor-pointer rounded-xs px-2 py-0.5 font-mono text-2xs ${
                  metric === tab.id ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:text-ink-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-md border border-border-subtle bg-surface-solid p-0.5" role="group" aria-label="粒度">
            {GRANULARITY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={granularity === tab.id}
                onClick={() => setGranularity(tab.id)}
                className={`cursor-pointer rounded-xs px-2 py-0.5 font-mono text-2xs ${
                  granularity === tab.id ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:text-ink-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-md border border-border-subtle bg-surface-solid p-0.5" role="group" aria-label="时间范围">
            {(['7', '30', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={rangeMode === mode}
                onClick={() => setRangeMode(mode)}
                className={`cursor-pointer rounded-xs px-2 py-0.5 font-mono text-2xs ${
                  rangeMode === mode ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:text-ink-secondary'
                }`}
              >
                {mode === '7' ? '7 天' : mode === '30' ? '30 天' : '自定义'}
              </button>
            ))}
          </div>
          {rangeMode === 'custom' && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
                aria-label="开始日期"
                className="rounded-xs border border-border-subtle bg-surface-solid px-1 py-0.5 text-2xs text-ink"
              />
              <span className="text-2xs text-muted">至</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
                aria-label="结束日期"
                className="rounded-xs border border-border-subtle bg-surface-solid px-1 py-0.5 text-2xs text-ink"
              />
            </div>
          )}
          <span className="ml-auto font-mono text-2xs text-muted">共 {rows.length} 行 · {buckets.length} 个时间点</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-4">
          {error && (
            <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
              {error}
            </p>
          )}
          {loading && rows.length === 0 ? (
            <LoadingPane label="加载用量…" />
          ) : rows.length === 0 ? (
            <EmptyPane title="暂无用量数据" description="开始对话后，这里会按会话树展示消息与 token 的时间序列。" />
          ) : (
            <div role="table" aria-label="会话用量表" className="min-w-[40rem]">
              <div role="row" className="flex items-end gap-3 border-b border-border-subtle px-2 pb-1 font-mono text-2xs text-muted">
                <span className="w-[18rem] flex-none">会话（负责人 / 消息 / token / 最后活跃）</span>
                <span className="flex min-w-0 flex-1 items-center justify-between gap-1">
                  {axisLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </span>
              </div>
              {rows.map((row) => {
                const owner = findAgent(agentCatalog.agents, row.node.agentId ?? fallbackOwnerForSession(row.node.id))
                return (
                  <div
                    key={row.node.id}
                    role="row"
                    className="flex items-center gap-3 border-b border-border-subtle/60 px-2 py-1.5 last:border-0"
                  >
                    <div className="flex w-[18rem] flex-none items-center gap-1.5" style={{ paddingLeft: `${row.depth * 12}px` }}>
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(row.node.id)}
                        disabled={!row.hasChildren}
                        aria-label={row.collapsed ? `展开 ${row.node.title} 的子会话` : `折叠 ${row.node.title} 的子会话`}
                        aria-expanded={row.hasChildren ? !row.collapsed : undefined}
                        className="grid h-4 w-4 flex-none cursor-pointer place-items-center text-2xs text-muted disabled:cursor-default disabled:opacity-30"
                      >
                        {row.hasChildren ? (row.collapsed ? '▸' : '▾') : '·'}
                      </button>
                      <AgentAvatar agent={owner} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink" title={row.node.title}>
                        {row.node.title}
                      </span>
                      <span className="flex-none font-mono text-2xs text-muted" title="消息数 / token（含子会话）">
                        {formatUsageNumber(row.totalMessages)} · {formatUsageNumber(row.totalTokens)}
                      </span>
                      <span className="hidden flex-none font-mono text-2xs text-muted lg:inline">{formatLastActive(row.node.lastActive, now)}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center">
                      <UsageSparkline
                        values={row.series}
                        label={`${row.node.title} · ${metric === 'tokens' ? 'token' : '消息数'}时间序列（含子会话汇总）`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex-none border-t border-border-subtle px-4 py-2 font-mono text-2xs text-muted">
          所有行共用同一时间轴；父行数值含子会话汇总。SVG 自绘，无第三方图表库。
        </footer>
      </div>
    </div>
  )
}
