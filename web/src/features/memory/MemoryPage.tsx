// features/memory/MemoryPage.tsx —— 记忆只读页（全屏抽屉）
//
// 契约：docs/m3-contract.md §4
//   - 只读：列表 / 冲突 / 检索 / scope 过滤；没有编辑控件，页脚固定「修改请跟司墨说」；
//   - 冲突结构：{id, scope, kind, status:"disputed", items:[{id,content,version,authority}]}；
//   - 检索只保证命中/不命中，不依赖排序分值（前端保持后端返回顺序）。
// 只读原则来源：design/12 §10.2 Q12 + design/22 §1.3。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HttpError } from '../../platform/http.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  authorityLabel,
  conflictsFromItems,
  formatConfidence,
  formatTimestamp,
  kindLabel,
  normalizeConflicts,
  normalizeItems,
  normalizeScopes,
  scopesFromItems,
  statusLabel,
  type MemoryConflict,
  type MemoryItem,
  type ScopeOption,
} from './model.ts'
import { fetchMemoryConflicts, fetchMemoryItems, fetchMemoryScopes } from './rest.ts'

const DEBOUNCE_MS = 300
const PAGE_LIMIT = 100

const STATUS_FILTERS = ['active', 'disputed', 'retracted', 'archived'] as const

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请确认司墨服务正在运行'
    if (error.status === 404) return '记忆接口尚未就绪（后端 M3 实现中）'
    return `加载失败：${error.message}`
  }
  if (error instanceof Error && error.message) return `加载失败：${error.message}`
  return '加载失败'
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError'
}

function statusTone(status: string): string {
  switch (status) {
    case 'active':
      return 'border-ok-border bg-ok-soft text-ok-ink'
    case 'disputed':
      return 'border-warn-border bg-warn-soft text-warn-ink'
    case 'retracted':
      return 'border-danger-border bg-danger-soft text-danger-ink'
    case 'candidate':
      return 'border-accent-border bg-accent-soft text-accent-hover'
    default:
      return 'border-border-subtle bg-surface-sunken text-muted'
  }
}

function MemoryCard({ item }: { item: MemoryItem }) {
  const confidence = item.confidence === null ? null : Math.round(item.confidence * 100)
  return (
    <article title={`id: ${item.id}${item.refs.length > 0 ? ` · refs: ${item.refs.join(', ')}` : ''}`} className="rounded-lg border border-border-subtle bg-surface-solid p-3 shadow-sm">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-xs border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">
          {kindLabel(item.kind)}
        </span>
        <span
          className="max-w-[16rem] truncate rounded-xs border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted"
          title={item.scope}
        >
          {item.scope}
        </span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${statusTone(item.status)}`}>
          {statusLabel(item.status)}
        </span>
        <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-ink-secondary">
          {authorityLabel(item.authority)}
        </span>
        {item.version !== null && (
          <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">
            v{item.version}
          </span>
        )}
      </div>

      <p className="m-0 whitespace-pre-wrap break-words text-md leading-relaxed text-ink">{item.text}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          置信度
          <span className="font-mono text-ink-secondary">{formatConfidence(item.confidence)}</span>
          <span className="inline-block h-1 w-16 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
            <span className="block h-full rounded-pill bg-accent" style={{ width: `${confidence ?? 0}%` }} />
          </span>
        </span>
        <span>
          记录于 <span className="font-mono text-ink-secondary">{formatTimestamp(item.createdAt)}</span>
        </span>
        <span>来源 {item.source}</span>
      </div>
    </article>
  )
}

function ConflictSection({ conflicts }: { conflicts: MemoryConflict[] }) {
  if (conflicts.length === 0) return null
  return (
    <section aria-label="冲突记忆" className="mb-3 rounded-lg border border-warn-border bg-warn-soft/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-warn-border bg-warn-soft px-2 py-0.5 font-mono text-2xs text-warn-ink">
          冲突 · disputed
        </span>
        <span className="text-sm text-ink-secondary">
          {conflicts.length} 组：两条并存、未自动裁决（修改请跟司墨说）
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {conflicts.map((group) => (
          <div key={group.id}>
            <div className="mb-1 flex flex-wrap items-center gap-2 font-mono text-2xs text-muted">
              <span>
                {group.scope} · {kindLabel(group.kind)}
              </span>
              {group.reason && <span className="italic text-warn-ink">冲突原因：{group.reason}</span>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((item) => (
                <MemoryCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface MemoryPageProps {
  onClose: () => void
}

export default function MemoryPage({ onClose }: MemoryPageProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [scope, setScope] = useState('')
  const [status, setStatus] = useState('')
  const [scopes, setScopes] = useState<ScopeOption[]>([])
  const [items, setItems] = useState<MemoryItem[]>([])
  const [conflicts, setConflicts] = useState<MemoryConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 搜索防抖（契约：q<3 字由后端 LIKE 兜底，前端不处理）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // M7：焦点进入抽屉、Tab 在内部循环、Esc 关闭、关闭后焦点归还
  useFocusTrap(panelRef, true, onClose)

  // 搜索框优先聚焦（覆盖焦点陷阱默认命中「关闭」按钮）
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])

  // 作用域选项（端点缺失时用条目推导兜底）
  useEffect(() => {
    const controller = new AbortController()
    void fetchMemoryScopes(controller.signal)
      .then((payload) => setScopes(normalizeScopes(payload)))
      .catch(() => {
        /* 端点可能尚未提供：保持空，后面由条目推导 */
      })
    return () => controller.abort()
  }, [])

  // 列表 + 冲突（q/scope/status 变化或手动刷新）
  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)

    void (async () => {
      const [itemsResult, conflictsResult] = await Promise.allSettled([
        fetchMemoryItems({ q: debouncedQuery, scope, status, limit: PAGE_LIMIT }, controller.signal),
        fetchMemoryConflicts(controller.signal),
      ])
      if (controller.signal.aborted) return

      if (itemsResult.status === 'rejected') {
        if (isAbort(itemsResult.reason)) return
        setItems([])
        setConflicts([])
        setError(errorText(itemsResult.reason))
        setLoading(false)
        return
      }

      const nextItems = normalizeItems(itemsResult.value)
      const byId = new Map(nextItems.map((item) => [item.id, item]))
      const fromEndpoint =
        conflictsResult.status === 'fulfilled' ? normalizeConflicts(conflictsResult.value, byId) : []
      setItems(nextItems)
      setConflicts(fromEndpoint.length > 0 ? fromEndpoint : conflictsFromItems(nextItems))
      setLoading(false)
    })()

    return () => controller.abort()
  }, [debouncedQuery, scope, status, refreshKey])

  const scopeOptions = useMemo<ScopeOption[]>(() => {
    if (scopes.length > 0) return scopes
    return scopesFromItems(items).map((value) => ({ scope: value, count: null }))
  }, [scopes, items])

  const handleBackdrop = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  const disputedCount = items.filter((item) => item.status === 'disputed').length
  const showEmpty = !loading && !error && items.length === 0

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-scrim-strong p-4 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="记忆（只读）"
      onMouseDown={handleBackdrop}
    >
      <div
        ref={panelRef}
        className="popover-surface flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex flex-none items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">记忆</h2>
            <span className="rounded-pill border border-border-subtle bg-surface-solid px-2 py-0.5 font-mono text-2xs tracking-normal text-muted">
              只读
            </span>
            <span className="font-mono text-2xs tracking-normal text-muted">
              {loading ? '加载中…' : `${items.length} 条${disputedCount > 0 ? ` · ${disputedCount} 条冲突` : ''}`}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-sm border border-border-subtle bg-surface-solid px-2 py-1 text-xs text-muted transition-colors duration-fast hover:border-border hover:text-ink"
          >
            关闭 ×
          </button>
        </header>

        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="sr-only">搜索记忆</span>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索记忆（内容/关键词，2 字也可）…"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-solid px-2.5 py-1.5 text-md text-ink outline-none transition-shadow duration-fast placeholder:text-muted focus:border-accent focus:shadow-focus"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            作用域
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              className="rounded-md border border-border bg-surface-solid px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">全部</option>
              {scopeOptions.map((option) => (
                <option key={option.scope} value={option.scope}>
                  {option.count === null ? option.scope : `${option.scope}（${option.count}）`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-sm text-muted">
            状态
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-md border border-border bg-surface-solid px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
            >
              <option value="">全部</option>
              {STATUS_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover"
            title="重新拉取（不修改任何记忆）"
          >
            刷新
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <div role="alert" className="mb-3 rounded-lg border border-danger-border bg-danger-soft p-3 text-sm text-danger-ink">
              <p className="m-0 mb-2">{error}</p>
              <button
                type="button"
                onClick={() => setRefreshKey((key) => key + 1)}
                className="cursor-pointer text-sm text-accent-hover underline underline-offset-2"
              >
                重试
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col gap-2.5" aria-hidden="true">
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-20 animate-skeleton-shimmer rounded-lg bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%]"
                />
              ))}
            </div>
          )}

          {!loading && !error && <ConflictSection conflicts={conflicts} />}

          {!loading && !error && items.length > 0 && (
            <section aria-label="记忆条目" className="mt-3 flex flex-col gap-2">
              <h3 className="m-0 mb-0.5 text-sm font-medium text-ink-secondary">全部条目</h3>
              {items.map((item) => (
                <MemoryCard key={item.id} item={item} />
              ))}
            </section>
          )}

          {showEmpty && (
            <div className="mx-auto mt-10 max-w-md rounded-lg border border-dashed border-border bg-scrim p-6 text-center">
              <div className="text-xl text-accent" aria-hidden="true">
                ◍
              </div>
              <p className="m-0 mt-2 mb-1 text-md font-medium text-ink">
                {debouncedQuery || scope || status ? '没有匹配的记忆' : '还没有可展示的记忆'}
              </p>
              <p className="m-0 text-sm leading-relaxed text-ink-secondary">
                {debouncedQuery || scope || status
                  ? '试试清空搜索词或切换筛选条件。'
                  : '让司墨记住一件事（例如「记住：我的项目叫 X」），这里就会出现。'}
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5 text-2xs text-muted">
          <span className="rounded-xs border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">只读</span>
          <span>修改请跟司墨说：记忆页不提供编辑/删除，变更通过对话产生新版本。</span>
        </footer>
      </div>
    </div>
  )
}
