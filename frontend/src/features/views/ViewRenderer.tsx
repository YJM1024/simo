// features/views/ViewRenderer.tsx —— M24 视图渲染器（13 块，声明式 schema，安全渲染）
//
// 渲染器只认白名单 props；无 HTML/script/内联样式；不可信文本按 React 文本节点/markdown 白名单渲染。
// 数据绑定只读动作（动作目录校验），失败/目录未就绪 → 块 fallback 说明；动作绑定统一走 onRunAction。
// 未知块由上层整页 fallback（chat/table），不在块内白屏。

import { Fragment, useEffect, useMemo, useState } from 'react'
import { isSafeHttpUrl, parseInline, parseMarkdown } from '../../platform/markdown.ts'
import type { InlineNode, MarkdownBlock } from '../../platform/markdown.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import {
  isReadOnlyBinding,
  resolveBindingArgs,
  selectData,
  BLOCK_META,
  type ActionCatalogEntry,
  type ViewActionBinding,
  type ViewBlock,
  type ViewPage,
} from './schema.ts'
import { callAction } from './actions.ts'
import { kanbanBindingForStatus, kanbanTargets } from './editor.ts'
import {
  normalizeFormSteps,
  paginateRows,
  sortRowsMulti,
  stepIndexOfField,
  toggleMultiSort,
  validateForm,
  validateFormSteps,
  type FormFieldDef,
  type FormStep,
} from './interactions.ts'
import { barGeometry, chartSummary, lineGeometry, normalizeChartKind, normalizeChartPoints, pieGeometry } from './chart.ts'
import {
  groupCardsByLane,
  kanbanStorageKey,
  moveCardInOrder,
  overWip,
  readKanbanOrder,
  sortCardsByOrder,
  wipLimitFor,
  writeKanbanOrder,
  type KanbanOrder,
} from './kanban.ts'

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
}

function InlineNodes({ nodes }: { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.kind === 'strong') return <strong key={index}>{node.text}</strong>
        if (node.kind === 'em') return <em key={index}>{node.text}</em>
        if (node.kind === 'code') return <code key={index} className="rounded bg-surface-sunken px-1 font-mono text-2xs">{node.text}</code>
        if (node.kind === 'link') {
          return isSafeHttpUrl(node.href) ? (
            <a key={index} href={node.href} target="_blank" rel="noopener noreferrer" className="text-accent-hover underline underline-offset-2">
              {node.text}
            </a>
          ) : (
            <span key={index}>{node.text}</span>
          )
        }
        return <span key={index}>{node.text}</span>
      })}
    </>
  )
}

function MarkdownView({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source.slice(0, 32 * 1024)), [source])
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-ink">
      {blocks.map((block: MarkdownBlock, index: number) => {
        if (block.kind === 'heading') {
          const level = Math.min(4, Math.max(1, block.level))
          const className = level === 1 ? 'text-lg font-semibold' : level === 2 ? 'text-md font-semibold' : 'text-sm font-medium'
          const content = <InlineNodes nodes={parseInline(block.text)} />
          if (level === 1) return <h1 key={index} className={`m-0 ${className}`}>{content}</h1>
          if (level === 2) return <h2 key={index} className={`m-0 ${className}`}>{content}</h2>
          if (level === 3) return <h3 key={index} className={`m-0 ${className}`}>{content}</h3>
          return <h4 key={index} className={`m-0 ${className}`}>{content}</h4>
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={index} className={`m-0 pl-5 ${block.ordered ? 'list-decimal' : 'list-disc'}`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <InlineNodes nodes={parseInline(item)} />
                </li>
              ))}
            </Tag>
          )
        }
        if (block.kind === 'code') return <pre key={index} className="m-0 overflow-x-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken p-2 font-mono text-2xs text-ink-secondary">{block.text}</pre>
        if (block.kind === 'quote') return <blockquote key={index} className="m-0 border-l-2 border-accent-border pl-2 text-ink-secondary"><InlineNodes nodes={parseInline(block.text)} /></blockquote>
        if (block.kind === 'rule') return <hr key={index} className="m-0 border-border-subtle" />
        if (block.kind === 'table') {
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-2xs">
                <thead>
                  <tr>{block.headers.map((header, headerIndex) => <th key={headerIndex} className="border border-border-subtle bg-surface-sunken px-1 py-0.5 text-left text-ink-secondary">{header}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-border-subtle px-1 py-0.5"><InlineNodes nodes={parseInline(cell)} /></td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={index} className="m-0"><InlineNodes nodes={parseInline(block.text)} /></p>
      })}
    </div>
  )
}

function fallbackNote(message: string) {
  return (
    <p role="status" className="m-0 rounded border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
      {message}
    </p>
  )
}

/** 骨架：数据绑定加载中显示（遵守 reduced-motion 用 motion-safe）。 */
function SkeletonLines({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="加载中" className="flex flex-col gap-1.5">
      {Array.from({ length: Math.max(1, rows) }).map((_, index) => (
        <span key={index} className="block h-4 rounded bg-surface-sunken motion-safe:animate-pulse" style={{ width: `${100 - index * 8}%` }} />
      ))}
    </div>
  )
}

function stringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function rowsValue(value: unknown, props: Record<string, unknown>): unknown[] {
  if (Array.isArray(value)) return value
  if (Array.isArray(props['rows'])) return props['rows']
  if (Array.isArray(props['items'])) return props['items']
  return []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

interface BlockProps {
  block: ViewBlock
  page: ViewPage
  catalog: readonly ActionCatalogEntry[]
  linkedRow: Record<string, unknown> | null
  onLinkRow: (row: Record<string, unknown> | null) => void
  onRunAction: (binding: ViewActionBinding, row?: Record<string, unknown>) => Promise<boolean>
  onNotice: (message: string) => void
}

function BlockRenderer({ block, page, catalog, linkedRow, onLinkRow, onRunAction, onNotice }: BlockProps) {
  const [data, setData] = useState<unknown>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState<string | null>(null)
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [tableSorts, setTableSorts] = useState<Array<{ key: string; dir: 'asc' | 'desc' }>>([])
  const [tablePage, setTablePage] = useState(1)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [rowDraft, setRowDraft] = useState<Record<string, unknown>>({})
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkActionId, setBulkActionId] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)
  const [movePending, setMovePending] = useState<{ cardId: string; status: string } | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const kanbanKey = kanbanStorageKey(page.id, block.id)
  const [kanbanOrder, setKanbanOrder] = useState<KanbanOrder>(() =>
    typeof window === 'undefined' ? {} : readKanbanOrder(window.localStorage, kanbanKey),
  )
  useEffect(() => {
    writeKanbanOrder(typeof window === 'undefined' ? null : window.localStorage, kanbanKey, kanbanOrder)
  }, [kanbanKey, kanbanOrder])

  useEffect(() => {
    if (!block.data) return
    if (catalog.length === 0) {
      setDataError('动作目录未就绪：数据绑定已降级（不伪造数据）。')
      return
    }
    if (!isReadOnlyBinding(block.data, catalog)) {
      setDataError('数据绑定引用了非只读动作（VIEW_BINDING_NOT_READONLY），已降级。')
      return
    }
    const controller = { cancelled: false }
    setDataLoading(true)
    void callAction(block.data.action, resolveBindingArgs(block.data.args, { sessionId: page.sessionId, pageId: page.id, ...(linkedRow ? { row: linkedRow } : {}) })).then((result) => {
      if (controller.cancelled) return
      setDataLoading(false)
      if (result.ok) {
        setData(result.data)
        setDataError(null)
      } else {
        setDataError(result.error?.message ?? '绑定动作失败，块已降级。')
      }
    })
    return () => {
      controller.cancelled = true
    }
  }, [block, catalog, page.id, page.sessionId, linkedRow])

  const value = block.data ? selectData(data, block.data.select) : null
  const props = block.props
  const note = dataError ? fallbackNote(dataError) : null
  const linkedBinding = block.data?.args && JSON.stringify(block.data.args).includes('$row') ? linkedRow : null

  if (block.type === 'text') {
    const text = stringValue(value) || stringValue(props['text'])
    const variant = stringValue(props['variant'])
    return (
      <div className="flex flex-col gap-1">
        <p className={`m-0 whitespace-pre-wrap break-words leading-relaxed ${variant === 'caption' ? 'font-mono text-2xs text-muted' : variant === 'muted' ? 'text-sm text-ink-secondary' : 'text-sm text-ink'}`}>
          {text.slice(0, 8 * 1024) || '（空文本）'}
        </p>
        {note}
      </div>
    )
  }

  if (block.type === 'markdown') {
    const markdown = stringValue(value) || stringValue(props['markdown'])
    return <div className="flex flex-col gap-1"><MarkdownView source={markdown} />{note}</div>
  }

  if (block.type === 'image') {
    const src = stringValue(props['src']) || stringValue(value)
    const alt = stringValue(props['alt'])
    const safe = src.startsWith('/api/artifacts/') || src.startsWith('/api/uploads/')
    if (!safe) return <div className="flex flex-col gap-1">{fallbackNote('图片仅允许 artifact/attachment 引用；已降级为文本。')}<p className="m-0 text-sm text-ink-secondary">{alt || '（无图片）'}</p></div>
    return (
      <figure className="m-0 flex flex-col gap-1">
        <img src={src} alt={alt} className="max-h-80 max-w-full rounded border border-border-subtle object-contain" />
        <figcaption className="font-mono text-2xs text-muted">{alt}</figcaption>
        {note}
      </figure>
    )
  }

  if (block.type === 'progress') {
    const numeric = typeof value === 'number' ? value : typeof props['progress'] === 'number' ? (props['progress'] as number) : null
    const percent = numeric === null ? null : Math.round((numeric > 1 ? numeric / 100 : numeric) * 100)
    return (
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm font-medium text-ink">{stringValue(props['title']) || '进度'}</p>
        {percent === null ? (
          <p className="m-0 text-2xs text-muted">暂无进度（绑定未就绪或数据为空）。</p>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
              <span className="block h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
            </span>
            <span className="font-mono text-2xs text-muted">{percent}%</span>
          </span>
        )}
        {note}
      </div>
    )
  }

  if (block.type === 'timeline') {
    const items = rowsValue(value, props).slice(0, 100)
    if (items.length === 0) return <div className="flex flex-col gap-1">{fallbackNote('时间线数据不可用/为空。')}</div>
    return (
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((entry, index) => {
          const item = asRecord(entry)
          const text = stringValue(item['text']) || stringValue(item['title']) || stringValue(entry)
          return (
            <li key={index} className="flex gap-1.5 text-sm">
              <span className="font-mono text-2xs text-muted">{stringValue(item['at']) || stringValue(item['time']) || index + 1}</span>
              <span className="min-w-0 flex-1 text-ink-secondary">{text}</span>
            </li>
          )
        })}
        {note}
      </ol>
    )
  }

  if (block.type === 'chart') {
    if (dataLoading) return <SkeletonLines rows={4} />
    const kind = normalizeChartKind(props['kind'])
    const rawPoints = Array.isArray(value) ? value : Array.isArray(props['data']) ? props['data'] : Array.isArray(props['values']) ? props['values'] : []
    const points = normalizeChartPoints(rawPoints)
    const title = stringValue(props['title']) || '图表'
    if (points.length === 0) {
      return <div className="flex flex-col gap-1">{fallbackNote('图表数据不可用/为空（需只读动作绑定或 props.data）。')}</div>
    }
    const width = 420
    const height = 170
    const chartBody = kind === 'pie'
      ? (() => {
          const slices = pieGeometry(points, 170)
          return (
            <div className="flex flex-wrap items-center gap-3">
              <svg viewBox="0 0 170 170" role="img" aria-label={`${title} 饼图，${chartSummary(points)}`} className="h-44 w-44 text-accent">
                {slices.map((slice, index) => (
                  <path key={slice.label} d={slice.path} fill="currentColor" opacity={0.35 + (index % 5) * 0.12} className="hover:opacity-90">
                    <title>{`${slice.label}: ${slice.value}（${Math.round(slice.percent * 100)}%）`}</title>
                  </path>
                ))}
              </svg>
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-2xs text-ink-secondary">
                {slices.map((slice, index) => (
                  <li key={slice.label} className="flex items-center gap-1">
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-xs bg-accent" style={{ opacity: 0.35 + (index % 5) * 0.12 }} />
                    {slice.label} · {slice.value} · {Math.round(slice.percent * 100)}%
                  </li>
                ))}
              </ul>
            </div>
          )
        })()
      : kind === 'line'
        ? (() => {
            const linePoints = lineGeometry(points, width, height, 8)
            const polyline = linePoints.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
            return (
              <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 折线图，${chartSummary(points)}`} className="h-44 w-full text-accent">
                <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {linePoints.map((point) => (
                  <g key={point.label}>
                    <circle cx={point.x} cy={point.y} r="2.5" fill="currentColor" />
                    <text x={point.x} y={height - 1} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.65">{point.label.slice(0, 8)}</text>
                  </g>
                ))}
              </svg>
            )
          })()
        : (() => {
            const bars = barGeometry(points, width, height, 8)
            return (
              <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} 柱状图，${chartSummary(points)}`} className="h-44 w-full text-accent">
                {bars.map((bar) => (
                  <g key={bar.label}>
                    <rect x={bar.x} y={bar.y} width={bar.width} height={Math.max(1, bar.height)} rx="2" fill="currentColor">
                      <title>{`${bar.label}: ${bar.value}`}</title>
                    </rect>
                    <text x={bar.x + bar.width / 2} y={height - 1} textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.65">{bar.label.slice(0, 8)}</text>
                  </g>
                ))}
              </svg>
            )
          })()
    return (
      <figure className="m-0 flex flex-col gap-1">
        <figcaption className="flex flex-wrap items-center gap-1 text-sm font-medium text-ink">
          {title}
          <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">{kind}</span>
          {linkedBinding && <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">联动 $row</span>}
        </figcaption>
        {chartBody}
        <details className="text-2xs text-muted">
          <summary className="cursor-pointer">查看数据表</summary>
          <table className="mt-1 w-full border-collapse text-2xs">
            <thead><tr><th className="border border-border-subtle bg-surface-sunken px-1 py-0.5 text-left">标签</th><th className="border border-border-subtle bg-surface-sunken px-1 py-0.5 text-left">值</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.label}><td className="border border-border-subtle px-1 py-0.5">{point.label}</td><td className="border border-border-subtle px-1 py-0.5">{point.value}</td></tr>)}</tbody>
          </table>
        </details>
        {note}
      </figure>
    )
  }

  if (block.type === 'table') {
    if (dataLoading) return <SkeletonLines rows={4} />
    const columns = Array.isArray(props['columns'])
      ? props['columns'].map((column, index) => {
          if (typeof column === 'string') return { key: column, label: column }
          const record = asRecord(column)
          return { key: stringValue(record['key']) || stringValue(record['field']) || `col-${index}`, label: stringValue(record['label']) || stringValue(record['key']) || `列 ${index + 1}` }
        })
      : []
    const allRows = rowsValue(value, props).slice(0, 200).map((entry) => asRecord(entry))
    if (allRows.length === 0 || columns.length === 0) {
      return <div className="flex flex-col gap-1">{columns.length === 0 ? fallbackNote('表格列不可用，已降级。') : <p className="m-0 rounded border border-border-subtle bg-surface-sunken px-2 py-2 text-center text-2xs text-muted">暂无数据；可稍后刷新或回到对话继续。</p>}{note}</div>
    }
    const sortedRows = sortRowsMulti(allRows, tableSorts)
    const pageSize = typeof props['pageSize'] === 'number' ? props['pageSize'] : 20
    const paged = paginateRows(sortedRows, tablePage, pageSize)
    const editable = props['editable'] === true
    const binding = block.actions[0]
    const selectedCount = selectedRows.size
    const allSelected = paged.rows.length > 0 && paged.rows.every((row, index) => selectedRows.has(stringValue(row['id']) || String(paged.from + index)))
    const toggleSort = (key: string): void => {
      setTableSorts((current) => toggleMultiSort(current, key))
      setTablePage(1)
    }
    const startEdit = (row: Record<string, unknown>, rowKey: string): void => {
      setRowDraft({ ...row })
      setEditingRow(rowKey)
      setRowError(null)
    }
    const saveEdit = async (row: Record<string, unknown>, rowKey: string): Promise<void> => {
      if (!binding) return
      setRowBusy(rowKey)
      setRowError(null)
      const ok = await onRunAction({ ...binding, args: { ...binding.args, rowId: rowKey, values: rowDraft } }, { ...row, ...rowDraft })
      setRowBusy(null)
      if (ok) {
        setEditingRow(null)
        setRowDraft({})
      } else {
        // 失败回滚：关闭行内编辑，显示原行数据，不保留本地伪造修改。
        setEditingRow(null)
        setRowDraft({})
        setRowError('行内编辑保存失败/取消，已回滚为原值。')
      }
    }
    const runBulk = async (): Promise<void> => {
      const action = block.actions.find((entry) => entry.id === bulkActionId) ?? block.actions[0]
      if (!action || selectedCount === 0) return
      setBulkBusy(true)
      setRowError(null)
      const rows = allRows.filter((row, index) => selectedRows.has(stringValue(row['id']) || String(index)))
      for (const row of rows) {
        const rowKey = stringValue(row['id']) || String(allRows.indexOf(row))
        const ok = await onRunAction({ ...action, args: { ...action.args, rowId: rowKey } }, row)
        if (!ok) {
          setRowError(`批量动作在第 ${rows.indexOf(row) + 1} 行失败/取消；已停止，未改本地状态。`)
          setBulkBusy(false)
          return
        }
      }
      setBulkBusy(false)
      setSelectedRows(new Set())
    }
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted">
          {tableSorts.map((sort) => (
            <span key={sort.key} className="rounded-pill border border-accent-border bg-accent-soft px-1.5 py-0.5 font-mono text-accent-hover">
              {sort.key} {sort.dir === 'asc' ? '↑' : '↓'}
            </span>
          ))}
          {tableSorts.length > 0 && <button type="button" onClick={() => setTableSorts([])} className="cursor-pointer text-2xs text-muted underline underline-offset-2">清除排序</button>}
          <span className="ml-auto">多列排序：点击表头循环升/降/清除</span>
        </div>
        {rowError && <p role="alert" className="m-0 rounded border border-danger-border bg-danger-soft px-2 py-1 text-2xs text-danger-ink">{rowError}</p>}
        {block.actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded border border-border-subtle bg-surface-sunken px-2 py-1 text-2xs">
            <label className="flex items-center gap-1 text-ink-secondary">
              批量动作
              <select value={bulkActionId} onChange={(event) => setBulkActionId(event.target.value)} className="rounded border border-border-subtle bg-surface px-1 py-0.5 text-2xs text-ink">
                {block.actions.map((action) => <option key={action.id} value={action.id}>{action.id} · {action.action}</option>)}
              </select>
            </label>
            <button type="button" disabled={selectedCount === 0 || bulkBusy} onClick={() => void runBulk()} aria-busy={bulkBusy} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-accent-hover disabled:opacity-50">
              {bulkBusy ? '执行中…' : `对 ${selectedCount} 行执行`}
            </button>
            <span className="text-muted">逐行调用动作；失败停止，不乐观更新</span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-2xs">
            <thead>
              <tr>
                {block.actions.length > 0 && (
                  <th className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left">
                    <input
                      type="checkbox"
                      aria-label="全选当前页"
                      checked={allSelected}
                      onChange={(event) => {
                        setSelectedRows((current) => {
                          const next = new Set(current)
                          paged.rows.forEach((row, index) => {
                            const key = stringValue(row['id']) || String(paged.from + index)
                            if (event.target.checked) next.add(key)
                            else next.delete(key)
                          })
                          return next
                        })
                      }}
                      className="h-3.5 w-3.5"
                    />
                  </th>
                )}
                {columns.map((column) => {
                  const active = tableSorts.find((sort) => sort.key === column.key)
                  const ariaSort = active ? (active.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                  return (
                    <th key={column.key} aria-sort={ariaSort} className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left font-medium text-ink-secondary">
                      <button type="button" onClick={() => toggleSort(column.key)} className="flex cursor-pointer items-center gap-0.5 text-left font-medium hover:text-ink">
                        {column.label}
                        <span aria-hidden="true" className="text-muted"><Icon name={active ? (active.dir === 'asc' ? 'chevron-up' : 'chevron-down') : 'sort'} size={16} /></span>
                      </button>
                    </th>
                  )
                })}
                {(block.actions.length > 0 || editable) && <th className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left font-medium text-ink-secondary">操作</th>}
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((row, rowIndex) => {
                const rowKey = stringValue(row['id']) || String(paged.from + rowIndex)
                const isEditing = editingRow === rowKey
                const isExpanded = expandedRow === rowKey
                const isLinked = linkedBinding !== null && linkedRow !== null && (stringValue(linkedRow['id']) || '') === (stringValue(row['id']) || '')
                return (
                  <Fragment key={rowKey}>
                    <tr className={isLinked ? 'bg-accent-soft/30' : undefined}>
                      {block.actions.length > 0 && (
                        <td className="border border-border-subtle px-1.5 py-1">
                          <input
                            type="checkbox"
                            aria-label={`选择行 ${rowKey}`}
                            checked={selectedRows.has(rowKey)}
                            onChange={(event) => {
                              setSelectedRows((current) => {
                                const next = new Set(current)
                                if (event.target.checked) next.add(rowKey)
                                else next.delete(rowKey)
                                return next
                              })
                            }}
                            className="h-3.5 w-3.5"
                          />
                        </td>
                      )}
                      {columns.map((column) => (
                        <td key={column.key} className="border border-border-subtle px-1.5 py-1 text-ink">
                          {isEditing && editable
                            ? <input aria-label={`编辑 ${column.label}`} value={stringValue(rowDraft[column.key])} onChange={(event) => setRowDraft((current) => ({ ...current, [column.key]: event.target.value }))} className="w-full rounded border border-border-subtle bg-surface px-1 py-0.5 text-2xs text-ink" />
                            : (stringValue(row[column.key]) || '—')}
                        </td>
                      ))}
                      {(block.actions.length > 0 || editable) && (
                        <td className="border border-border-subtle px-1.5 py-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {isEditing ? (
                              <>
                                <button type="button" disabled={rowBusy !== null} onClick={() => void saveEdit(row, rowKey)} aria-busy={rowBusy === rowKey} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50">
                                  {rowBusy === rowKey ? '保存中…' : '保存'}
                                </button>
                                <button type="button" onClick={() => { setEditingRow(null); setRowDraft({}); setRowError(null) }} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">取消</button>
                              </>
                            ) : (
                              <>
                                {binding && (
                                  <button
                                    type="button"
                                    disabled={rowBusy !== null}
                                    onClick={() => {
                                      setRowBusy(rowKey)
                                      void onRunAction(binding, row).then((ok) => {
                                        setRowBusy(null)
                                        if (!ok) setRowError('行操作失败/取消，已保留原状态。')
                                      })
                                    }}
                                    aria-label={`行操作：${binding.id}${rowBusy === rowKey ? '（进行中）' : ''}`}
                                    aria-busy={rowBusy === rowKey}
                                    className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50"
                                  >
                                    {rowBusy === rowKey ? '提交中…' : binding.id}
                                  </button>
                                )}
                                {editable && (
                                  <button type="button" onClick={() => startEdit(row, rowKey)} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary">行内编辑</button>
                                )}
                                <button
                                  type="button"
                                  aria-expanded={isExpanded}
                                  onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                                  className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted"
                                >
                                  {isExpanded ? '收起' : '行详情'}
                                </button>
                                <button type="button" onClick={() => onLinkRow(isLinked ? null : row)} aria-pressed={isLinked} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-accent-hover">联动</button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={columns.length + (block.actions.length > 0 ? 1 : 0) + (block.actions.length > 0 || editable ? 1 : 0)} className="border border-border-subtle bg-surface-sunken px-2 py-1">
                          <dl className="m-0 grid grid-cols-1 gap-x-3 gap-y-0.5 text-2xs sm:grid-cols-2">
                            {Object.entries(row).map(([key, item]) => (
                              <div key={key} className="flex gap-1">
                                <dt className="font-mono text-muted">{key}</dt>
                                <dd className="m-0 text-ink-secondary">{stringValue(item) || '—'}</dd>
                              </div>
                            ))}
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted">
          <span>共 {paged.total} 行 · 第 {paged.from}–{paged.to} 行 · 第 {paged.page}/{paged.totalPages} 页</span>
          <button type="button" onClick={() => setTablePage((page) => Math.max(1, page - 1))} disabled={paged.page <= 1} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 disabled:opacity-40">上一页</button>
          <button type="button" onClick={() => setTablePage((page) => Math.min(paged.totalPages, page + 1))} disabled={paged.page >= paged.totalPages} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 disabled:opacity-40">下一页</button>
          <span className="ml-auto">排序/分页/行内编辑展示状态；保存/批量只经动作</span>
        </div>
        {note}
      </div>
    )
  }

  if (block.type === 'deliverable') {
    const items = rowsValue(value, props).slice(0, 200)
    if (items.length === 0) return <div className="flex flex-col gap-1">{fallbackNote('交付物数据不可用/为空。')}</div>
    return (
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {items.map((entry, index) => {
          const item = asRecord(entry)
          const id = stringValue(item['id']) || stringValue(item['artifactId']) || stringValue(item['artifact_id'])
          const name = stringValue(item['name']) || id || `文件 ${index + 1}`
          const mime = stringValue(item['mime']) || stringValue(item['contentType'])
          const size = typeof item['size'] === 'number' ? ` · ${item['size']} B` : ''
          const href = id ? `/api/artifacts/${encodeURIComponent(id)}/content` : ''
          return (
            <li key={id || index} className="flex flex-wrap items-center gap-1.5 text-2xs">
              {href ? <a href={href} download={name} className="min-w-0 flex-1 truncate text-accent-hover underline underline-offset-2">{name}</a> : <span className="min-w-0 flex-1 truncate text-ink">{name}</span>}
              {mime && <span className="font-mono text-muted">{mime}</span>}
              <span className="font-mono text-muted">{size}</span>
            </li>
          )
        })}
        {note}
      </ul>
    )
  }

  if (block.type === 'chat') {
    const items = rowsValue(value, props).slice(0, 200)
    if (items.length === 0) return <div className="flex flex-col gap-1">{fallbackNote('消息数据不可用/为空（需只读动作绑定）。', )}</div>
    return (
      <div className="flex flex-col gap-1">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {items.map((entry, index) => {
            const item = asRecord(entry)
            return (
              <li key={index} className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 text-sm">
                <span className="mr-1 font-mono text-2xs text-muted">{stringValue(item['role']) || '消息'}</span>
                <span className="text-ink">{stringValue(item['text']) || stringValue(item['content']) || '—'}</span>
              </li>
            )
          })}
        </ul>
        <p className="m-0 text-2xs text-muted">内嵌消息只读；需要回复请回到对话。</p>
        {note}
      </div>
    )
  }

  if (block.type === 'kanban') {
    if (dataLoading) return <SkeletonLines rows={5} />
    const cards = rowsValue(value, props).slice(0, 500).map((entry) => asRecord(entry))
    const columns = Array.isArray(props['columns'])
      ? props['columns'].filter((column): column is string => typeof column === 'string')
      : [...new Set(cards.map((card) => stringValue(card['status'])).filter(Boolean))]
    if (cards.length === 0) return <div className="flex flex-col gap-1">{fallbackNote('任务看板数据不可用/为空。')}</div>
    const cardId = (card: Record<string, unknown>): string => stringValue(card['id']) || stringValue(card['taskId']) || ''
    const ownerOf = (card: Record<string, unknown>): string => stringValue(card['owner']) || stringValue(card['ownerName']) || stringValue(card['assignee']) || ''
    const groupBy = props['groupBy'] === 'owner' ? 'owner' : 'status'
    const lanes = groupCardsByLane(cards, groupBy, ownerOf)
    const targets = kanbanTargets(columns, block.actions)
    const bindingFor = (status: string): ViewActionBinding | null => kanbanBindingForStatus(status, block.actions)
    const moveWithAction = async (status: string, card: Record<string, unknown>): Promise<void> => {
      const binding = bindingFor(status)
      if (!binding) {
        setMoveError(`列「${status}」没有绑定的语义动作；未改状态，请回到对话/任务动作。`)
        onNotice(`列「${status}」没有绑定的语义动作；未改状态。`)
        return
      }
      setMoveError(null)
      setMovePending({ cardId: cardId(card), status })
      const ok = await onRunAction(binding, card)
      setMovePending(null)
      if (!ok) setMoveError(`移动到「${status}」失败/取消，已保留原状态。`)
    }
    const reorder = (groupKey: string, groupCards: Array<Record<string, unknown>>, card: Record<string, unknown>, direction: 'up' | 'down'): void => {
      const current = kanbanOrder[groupKey] ?? groupCards.map((entry) => cardId(entry))
      const next = moveCardInOrder(current, cardId(card), direction)
      setKanbanOrder((order) => ({ ...order, [groupKey]: next }))
    }
    return (
      <div className="flex flex-col gap-1.5">
        {moveError && <p role="alert" className="m-0 rounded border border-danger-border bg-danger-soft px-2 py-1 text-2xs text-danger-ink">{moveError}</p>}
        <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted">
          <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono">泳道：{groupBy === 'owner' ? '负责人' : '状态'}</span>
          {groupBy === 'owner' && <span>按 owner 分泳道；列仍按状态</span>}
          <span>WIP 仅展示/超限提示；排序持久化到本机，跨列移动仍走语义动作</span>
        </div>
        <div className="flex flex-col gap-2">
          {lanes.map((lane) => (
            <section key={lane.key} aria-label={`泳道 ${lane.label}`} className="rounded-md border border-border-subtle bg-surface-solid p-1.5">
              {groupBy === 'owner' && (
                <h4 className="m-0 mb-1 flex items-center gap-1 text-2xs font-medium text-ink">
                  泳道：{lane.label}
                  <span className="font-mono text-muted">{lane.cards.length} 张</span>
                </h4>
              )}
              <div className="flex gap-1.5 overflow-x-auto">
                {columns.map((status) => {
                  const target = targets.find((entry) => entry.status === status)
                  const noBinding = !target || target.binding === null
                  const groupKey = `${lane.key}:${status}`
                  const groupCards = lane.cards.filter((card) => stringValue(card['status']) === status)
                  const orderedCards = sortCardsByOrder(groupCards, kanbanOrder[groupKey] ?? [], cardId)
                  const limit = wipLimitFor(props, status)
                  const over = overWip(limit, orderedCards.length)
                  return (
                    <div
                      key={status}
                      className={`min-w-[9rem] flex-1 rounded-md border p-1.5 ${over ? 'border-warn-border bg-warn-soft/20' : 'border-border-subtle bg-surface-sunken'}`}
                      onDragOver={(event) => {
                        event.preventDefault()
                        event.dataTransfer.dropEffect = noBinding ? 'none' : 'move'
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const id = event.dataTransfer.getData('text/plain')
                        const card = cards.find((entry) => cardId(entry) === id)
                        if (card) void moveWithAction(status, card)
                      }}
                      aria-label={`看板列 ${status}${noBinding ? '（无动作绑定）' : ''}`}
                    >
                      <h5 className="m-0 mb-1 flex flex-wrap items-center gap-1 font-mono text-2xs tracking-normal text-muted">
                        {status}
                        <span className={over ? 'text-warn-ink' : 'text-muted'}>{orderedCards.length}{limit !== null ? `/${limit}` : ''}</span>
                        {limit !== null && <span className="rounded-pill border border-border-subtle bg-surface-solid px-1 font-mono text-2xs text-muted">WIP</span>}
                        {over && <span className="rounded-pill border border-warn-border bg-warn-soft px-1 font-mono text-2xs text-warn-ink">超 WIP</span>}
                        {noBinding && <span className="rounded-pill border border-border-subtle bg-surface-solid px-1 font-mono text-2xs text-muted">无绑定</span>}
                      </h5>
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {orderedCards.map((card, index) => {
                          const id = cardId(card) || `${groupKey}-${index}`
                          const pending = movePending?.cardId === id
                          return (
                            <li
                              key={id}
                              draggable={block.actions.length > 0 && !pending}
                              onDragStart={(event) => {
                                event.dataTransfer.setData('text/plain', id)
                                event.dataTransfer.effectAllowed = 'move'
                              }}
                              aria-busy={pending}
                              className={`rounded border px-1.5 py-1 text-2xs text-ink ${pending ? 'border-accent-border bg-accent-soft/40' : 'border-border-subtle bg-surface-solid'}`}
                            >
                              <span className="block">{stringValue(card['title']) || stringValue(card['name']) || '任务'}</span>
                              {pending && <span role="status" className="block font-mono text-2xs text-accent-hover">提交动作中（{movePending?.status}）…</span>}
                              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                <button type="button" aria-label={`上移 ${stringValue(card['title']) || '任务'}`} disabled={index === 0} onClick={() => reorder(groupKey, orderedCards, card, 'up')} className="cursor-pointer rounded-xs border border-border-subtle bg-surface px-1 text-2xs text-muted disabled:opacity-30">↑</button>
                                <button type="button" aria-label={`下移 ${stringValue(card['title']) || '任务'}`} disabled={index === orderedCards.length - 1} onClick={() => reorder(groupKey, orderedCards, card, 'down')} className="cursor-pointer rounded-xs border border-border-subtle bg-surface px-1 text-2xs text-muted disabled:opacity-30">↓</button>
                                <label className="min-w-0 flex-1">
                                  <span className="sr-only">键盘移动 {stringValue(card['title']) || '任务'}</span>
                                  <select
                                    aria-label={`通过动作移动任务：${stringValue(card['title']) || '任务'}`}
                                    value=""
                                    disabled={pending || targets.every((entry) => entry.binding === null)}
                                    onChange={(event) => {
                                      const selected = event.target.value
                                      if (selected) void moveWithAction(selected, card)
                                    }}
                                    className="w-full cursor-pointer rounded-xs border border-border-subtle bg-surface px-1 py-0.5 text-2xs text-ink-secondary disabled:opacity-50"
                                  >
                                    <option value="">键盘替代：移动到…</option>
                                    {targets.map((entry) => (
                                      <option key={entry.status} value={entry.status} disabled={entry.binding === null}>
                                        {entry.status}{entry.binding ? `（${entry.binding.action}）` : '（无动作绑定）'}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="m-0 text-2xs text-muted">拖拽/键盘移动只映射到块已绑定的语义动作（取消/重试/暂停等）；不直接改状态，失败保留原列，R3+ 仍需审批。</p>
        {note}
      </div>
    )
  }

  if (block.type === 'dag') {
    const valueRecord = asRecord(value)
    const nodes = Array.isArray(valueRecord['nodes']) ? valueRecord['nodes'] : rowsValue(value, props)
    const edges = Array.isArray(valueRecord['edges']) ? valueRecord['edges'] : []
    if (nodes.length === 0) return <div className="flex flex-col gap-1">{fallbackNote('DAG 数据不可用/为空，已降级为依赖表。')}</div>
    return (
      <div className="flex flex-col gap-1">
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {nodes.slice(0, 100).map((entry, index) => {
            const node = asRecord(entry)
            return (
              <li key={index} className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 text-2xs">
                <span className="font-mono text-muted">{stringValue(node['id']) || `node-${index + 1}`}</span>{' '}
                <span className="text-ink">{stringValue(node['title']) || stringValue(node['name']) || '步骤'}</span>
                {stringValue(node['status']) && <span className="ml-1 text-muted">· {stringValue(node['status'])}</span>}
              </li>
            )
          })}
        </ul>
        {edges.length > 0 && (
          <p className="m-0 font-mono text-2xs text-muted">
            依赖：{edges.slice(0, 100).map((edge) => {
              const record = asRecord(edge)
              return `${stringValue(record['from']) || stringValue(record['source'])} → ${stringValue(record['to']) || stringValue(record['target'])}`
            }).join('；')}
          </p>
        )}
        {note}
      </div>
    )
  }

  if (block.type === 'action') {
    const binding = block.actions[0]
    const label = stringValue(props['label']) || '执行'
    const variant = stringValue(props['variant'])
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          disabled={!binding}
          onClick={() => binding && void onRunAction(binding)}
          className={`w-fit cursor-pointer rounded-md border px-2.5 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
            variant === 'danger'
              ? 'border-danger-border bg-danger-soft text-danger-ink'
              : variant === 'primary'
                ? 'border-accent-border bg-accent-soft text-accent-hover'
                : 'border-border-subtle bg-surface-solid text-ink-secondary'
          }`}
        >
          {label}
        </button>
        {!binding && fallbackNote('该动作块未绑定动作（VIEW_ACTION_UNKNOWN），已降级。')}
        {note}
      </div>
    )
  }

  if (block.type === 'form') {
    const steps = normalizeFormSteps(props)
    const currentStep = Math.max(0, Math.min(steps.length - 1, wizardStep))
    const step: FormStep = steps[currentStep] ?? { title: '填写', fields: [] }
    const fields = step.fields
    const isWizard = steps.length > 1
    const isLastStep = currentStep >= steps.length - 1
    const binding = block.actions[0]
    const submit = async (): Promise<void> => {
      if (!binding) {
        onNotice('该表单未绑定动作，无法提交。')
        return
      }
      const errors = validateFormSteps(steps, formValues)
      setFormErrors(errors)
      setFormSuccess(null)
      if (Object.keys(errors).length > 0) {
        const firstField = Object.keys(errors)[0] ?? ''
        const firstStep = stepIndexOfField(steps, firstField)
        setWizardStep(firstStep)
        setFormSubmitError(`第 ${firstStep + 1} 步有字段未通过校验，请修正标红项。`)
        return
      }
      setFormSubmitError(null)
      setFormSubmitting(true)
      const ok = await onRunAction({ ...binding, args: { ...binding.args, ...formValues, form: formValues, steps: formValues } })
      setFormSubmitting(false)
      if (ok) {
        setFormSuccess('提交成功，视图已刷新。')
        setWizardStep(0)
      } else {
        setFormSubmitError('提交失败或被取消；未改本地状态，请重试或回到对话。')
      }
    }
    const nextStep = (): void => {
      const errors = validateForm(fields, formValues)
      setFormErrors(errors)
      if (Object.keys(errors).length > 0) {
        setFormSubmitError('请先修正本步错误。')
        return
      }
      setFormSubmitError(null)
      setWizardStep((index) => Math.min(steps.length - 1, index + 1))
    }
    const inputClass = 'h-8 w-full rounded-[7px] border bg-surface-solid px-2.5 text-[12px] text-ink outline-none transition-colors duration-fast placeholder:text-ink-faint focus:border-accent focus:shadow-focus'
    const updateValue = (name: string, nextValue: unknown): void => {
      setFormValues((prev) => ({ ...prev, [name]: nextValue }))
      setFormErrors((prev) => { const next = { ...prev }; delete next[name]; return next })
      setFormSubmitError(null)
    }
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (isWizard && !isLastStep) nextStep()
          else void submit()
        }}
        noValidate
      >
        {isWizard && (
          <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted">
            <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-accent-hover">第 {currentStep + 1}/{steps.length} 步</span>
            <span role="status" aria-live="polite" className="text-ink-secondary">{step.title}</span>
            <div className="ml-auto flex gap-1" aria-hidden="true">
              {steps.map((entry, index) => (
                <span key={`${entry.title}-${index}`} className={`h-1.5 w-6 rounded-xs ${index <= currentStep ? 'bg-accent' : 'bg-surface-sunken'}`} />
              ))}
            </div>
          </div>
        )}
        {fields.map((field: FormFieldDef) => {
          const error = formErrors[field.name]
          const describedBy = error ? `form-${block.id}-${field.name}-error` : undefined
          const fieldClass = `${inputClass} ${error ? 'border-danger-border' : 'border-border-subtle'}`
          return (
            <label key={field.name} className="flex flex-col gap-1 text-[11px] text-ink-secondary">
              <span className="font-medium">
                {field.label}
                {field.required && <span className="ml-0.5 text-danger-ink" aria-hidden="true">*</span>}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  value={String(formValues[field.name] ?? '')}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className={`min-h-[72px] w-full rounded-[7px] border bg-surface-solid px-2.5 py-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:shadow-focus ${error ? 'border-danger-border' : 'border-border'}`}
                  rows={3}
                />
              ) : field.type === 'select' ? (
                <select
                  value={String(formValues[field.name] ?? '')}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className={`${fieldClass} cursor-pointer`}
                >
                  <option value="">请选择…</option>
                  {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={formValues[field.name] === true}
                  onChange={(event) => updateValue(field.name, event.target.checked)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className="h-4 w-4"
                />
              ) : (
                <input
                  type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                  value={String(formValues[field.name] ?? '')}
                  onChange={(event) => updateValue(field.name, event.target.value)}
                  placeholder={field.placeholder}
                  aria-invalid={Boolean(error)}
                  aria-describedby={describedBy}
                  className={fieldClass}
                />
              )}
              {error && <span id={describedBy} role="alert" className="text-danger-ink">{error}</span>}
            </label>
          )
        })}
        {formSubmitError && <p role="alert" className="m-0 rounded border border-danger-border bg-danger-soft px-2 py-1 text-2xs text-danger-ink">{formSubmitError}</p>}
        {formSuccess && <p role="status" className="m-0 rounded border border-ok-border bg-ok-soft px-2 py-1 text-2xs text-ok-ink">{formSuccess}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {isWizard && currentStep > 0 && (
            <button type="button" onClick={() => { setWizardStep((index) => Math.max(0, index - 1)); setFormSubmitError(null) }} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1 text-sm text-muted">
              上一步
            </button>
          )}
          <button
            type={isWizard && !isLastStep ? 'button' : 'submit'}
            onClick={isWizard && !isLastStep ? nextStep : undefined}
            disabled={!binding || formSubmitting}
            aria-busy={formSubmitting}
            className="h-8 w-fit cursor-pointer rounded-[7px] border border-ink bg-ink px-3 text-[11.5px] font-medium text-ink-inverse transition-colors duration-fast hover:bg-ink-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {formSubmitting ? '提交中…' : isWizard && !isLastStep ? '下一步' : (stringValue(props['submitLabel']) || '提交')}
          </button>
          {isWizard && <span className="font-mono text-2xs text-muted">步骤 {currentStep + 1}/{steps.length} · 发送/回车继续</span>}
        </div>
        {!binding && fallbackNote('该表单未绑定提交动作，已降级。')}
        {note}
      </form>
    )
  }

  if (block.type === 'ask') {
    const question = stringValue(props['question']) || '请选择'
    const options = Array.isArray(props['options']) ? props['options'].filter((option): option is string => typeof option === 'string').slice(0, 5) : []
    const binding = block.actions[0]
    return (
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm text-ink">{question.slice(0, 300)}</p>
        <div className="flex flex-wrap gap-1">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!binding}
              onClick={() => binding && void onRunAction({ ...binding, args: { ...binding.args, answer: option } })}
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2 py-0.5 text-2xs text-ink-secondary disabled:opacity-50"
            >
              {option}
            </button>
          ))}
        </div>
        {!binding && fallbackNote('该提问未绑定动作，请回到对话回答。')}
        {note}
      </div>
    )
  }

  const meta = (BLOCK_META as Record<string, { label: string }>)[block.type as string]
  return fallbackNote(`不支持或未实现的块：${block.type}（${meta?.label ?? block.type}）`)
}

export function ViewPageRenderer({
  page,
  catalog,
  onRunAction,
  onNotice,
}: {
  page: ViewPage
  catalog: readonly ActionCatalogEntry[]
  onRunAction: (page: ViewPage, binding: ViewActionBinding, row?: Record<string, unknown>) => Promise<boolean>
  onNotice: (message: string) => void
}) {
  const areas = page.layout.areas.length > 0 ? page.layout.areas : page.blocks.map((block) => ({ block: block.id, colSpan: page.layout.columns }))
  const blockMap = new Map(page.blocks.map((block) => [block.id, block]))
  const [linkedRow, setLinkedRow] = useState<Record<string, unknown> | null>(null)
  const linkedLabel = linkedRow
    ? stringValue(linkedRow['title']) || stringValue(linkedRow['name']) || stringValue(linkedRow['id']) || '已选行'
    : ''
  return (
    <>
      {linkedRow && (
        <div role="status" className="mb-2 flex flex-wrap items-center gap-1.5 rounded-md border border-accent-border bg-accent-soft px-2 py-1 text-2xs text-accent-hover">
          <span className="rounded-pill border border-accent-border bg-surface-solid px-1.5 font-mono">联动 $row</span>
          <span className="min-w-0 flex-1 truncate text-ink">当前行：{linkedLabel}；带 $row 绑定的块会重新取数。</span>
          <button type="button" onClick={() => setLinkedRow(null)} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-muted">清除联动</button>
        </div>
      )}
      <div className={`grid grid-cols-1 gap-3 md:grid-cols-12 ${page.layout.gap === 'sm' ? 'gap-2' : page.layout.gap === 'lg' ? 'gap-4' : 'gap-3'}`}>
        {areas.map((area) => {
          const block = blockMap.get(area.block)
          if (!block) return null
          return (
            <section key={block.id} className={`min-w-0 rounded-lg border border-border-subtle bg-surface-solid p-2 ${COL_SPAN_CLASS[Math.max(1, Math.min(12, area.colSpan))] ?? 'md:col-span-12'}`} aria-label={BLOCK_META[block.type]?.label ?? block.type}>
              <BlockRenderer
                block={block}
                page={page}
                catalog={catalog}
                linkedRow={linkedRow}
                onLinkRow={setLinkedRow}
                onRunAction={(binding, row) => onRunAction(page, binding, row)}
                onNotice={onNotice}
              />
            </section>
          )
        })}
      </div>
    </>
  )
}
