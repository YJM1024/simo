// features/chat/OverviewView.tsx —— 会话概览（M11 只读；M14-E 列表化）
//
// 契约：docs/m11-contract.md §3 + M14-E：目标/现状/备注保持自然段；
// 已完成 check 线性图标列表、待办 square 线性图标列表、约束列表、时间线有序列表（时间前缀 + 完整句子）；
// 打开先读缓存，只有「更新概览」调 refresh；无编辑控件；不出现 内部字段名。

import { useCallback, useEffect, useRef, useState } from 'react'
import { HttpError } from '../../platform/http.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import {
  fetchSessionOverview,
  formatOverviewTime,
  isOverviewEmpty,
  normalizeOverview,
  overviewListSections,
  overviewSections,
  refreshSessionOverview,
  timelineListItems,
  type OverviewListSection,
  type SessionOverview,
} from './overview.ts'

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请稍后重试'
    if (error.status === 404 || error.status === 405) return '概览接口尚未就绪（后端 M11 实现中）'
    return error.message || '概览加载失败'
  }
  return error instanceof Error && error.message ? error.message : '概览加载失败'
}

export default function OverviewView({ sessionId }: { sessionId: string }) {
  const [overview, setOverview] = useState<SessionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      void fetchSessionOverview(sessionId, signal)
        .then((payload) => setOverview(normalizeOverview(payload)))
        .catch((cause) => {
          if (signal?.aborted) return
          setOverview(null)
          setError(errorText(cause))
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false)
        })
    },
    [sessionId],
  )

  useEffect(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true)
    setError(null)
    setNotice(null)
    try {
      const payload = await refreshSessionOverview(sessionId)
      const next = normalizeOverview(payload)
      if (next) setOverview(next)
      else load()
      setNotice('概览已更新')
    } catch (cause) {
      setError(errorText(cause))
    } finally {
      setRefreshing(false)
    }
  }, [load, sessionId])

  const sections = overview ? overviewSections(overview) : []
  const listSections = overview ? overviewListSections(overview) : []
  const timelineItems = overview ? timelineListItems(overview) : []
  const listSection = (key: OverviewListSection['key']): OverviewListSection | null =>
    listSections.find((section) => section.key === key) ?? null
  const proseSection = (key: 'goal' | 'current' | 'notes') => sections.find((section) => section.key === key) ?? null
  const empty = !overview || isOverviewEmpty(overview)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" role="tabpanel" aria-label="概览">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">会话概览</h2>
        <span className="rounded-pill border border-border-subtle bg-surface-solid px-2 py-0.5 font-mono text-2xs tracking-normal text-muted">
          只读
        </span>
        {overview?.updatedAt !== null && overview?.updatedAt !== undefined && (
          <span className="font-mono text-2xs text-muted">更新于 {formatOverviewTime(overview.updatedAt)}</span>
        )}
        {overview?.version !== null && overview?.version !== undefined && (
          <span className="font-mono text-2xs text-muted">内容版本 v{overview.version}</span>
        )}
        <span className="font-mono text-2xs text-muted" title="来源：基于会话目标、任务与关键事件生成">
          来源：基于会话目标与任务生成
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing || loading}
          aria-label="更新概览（让司墨重新生成）"
          title="让司墨根据当前会话重新生成概览（只读页面唯一动作）"
          className="ml-auto cursor-pointer rounded-md border border-accent-border bg-accent-soft px-2.5 py-1 text-sm text-accent-hover transition-colors duration-fast hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? '正在生成…' : '更新概览'}
        </button>
      </div>

      {notice && (
        <p role="status" className="mx-0 mb-3 rounded-md border border-ok-border bg-ok-soft px-2 py-1 text-2xs text-ok-ink">
          {notice}
        </p>
      )}

      {loading && !overview && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="h-10 animate-skeleton-shimmer rounded-md bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%]" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mx-auto mt-6 max-w-md rounded-md border border-border-subtle bg-surface-solid p-3 text-center text-sm text-ink-secondary">
          <p className="m-0 mb-2">{error}</p>
          <button type="button" onClick={() => load()} className="cursor-pointer text-sm text-accent-hover underline underline-offset-2">
            重试
          </button>
        </div>
      )}

      {!loading && !error && empty && (
        <div className="mx-auto mt-8 max-w-md rounded-lg border border-dashed border-border bg-scrim p-6 text-center">
          <div className="text-xl text-accent" aria-hidden="true">
            ◍
          </div>
          <p className="m-0 mt-2 mb-1 text-md font-medium text-ink">还没有概览</p>
          <p className="m-0 text-sm leading-relaxed text-ink-secondary">
            点「更新概览」让司墨根据这个会话的目标、进展和待办生成一份汇报；之后打开会先读缓存。
          </p>
        </div>
      )}

      {!empty && overview && (
        <article className="mx-auto max-w-3xl rounded-lg border border-border-subtle bg-surface-solid px-4 py-3" aria-label="概览正文">
          {proseSection('goal') && (
            <section className="mb-3 last:mb-0" aria-label="目标">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">目标</h3>
              {proseSection('goal')?.paragraphs.map((paragraph, index) => (
                <p key={index} className="m-0 mb-1.5 whitespace-pre-wrap break-words text-md leading-relaxed text-ink last:mb-0">
                  {paragraph}
                </p>
              ))}
            </section>
          )}

          {listSection('constraints') && (
            <section className="mb-3 last:mb-0" aria-label="约束">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">约束</h3>
              <ul className="m-0 list-disc pl-5">
                {listSection('constraints')?.items.map((item, index) => (
                  <li key={index} className="mb-1 whitespace-pre-wrap break-words text-md leading-relaxed text-ink last:mb-0">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {proseSection('current') && (
            <section className="mb-3 last:mb-0" aria-label="现状">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">现状</h3>
              {proseSection('current')?.paragraphs.map((paragraph, index) => (
                <p key={index} className="m-0 mb-1.5 whitespace-pre-wrap break-words text-md leading-relaxed text-ink last:mb-0">
                  {paragraph}
                </p>
              ))}
            </section>
          )}

          {listSection('completed') && (
            <section className="mb-3 last:mb-0" aria-label="已完成">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">已完成</h3>
              <ul className="m-0 list-none p-0" aria-label="已完成列表">
                {listSection('completed')?.items.map((item, index) => (
                  <li key={index} className="mb-1 flex items-start gap-1.5 text-md leading-relaxed text-ink last:mb-0">
                    <span aria-hidden="true" className="mt-0.5 flex-none text-ok">
                      <Icon name="check" size={16} />
                    </span>
                    <span className="sr-only">已完成：</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {listSection('pending') && (
            <section className="mb-3 last:mb-0" aria-label="待办">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">待办</h3>
              <ul className="m-0 list-none p-0" aria-label="待办列表">
                {listSection('pending')?.items.map((item, index) => (
                  <li key={index} className="mb-1 flex items-start gap-1.5 text-md leading-relaxed text-ink last:mb-0">
                    <span aria-hidden="true" className="mt-0.5 flex-none text-muted">
                      <Icon name="square" size={16} />
                    </span>
                    <span className="sr-only">待办：</span>
                    <span className="min-w-0 whitespace-pre-wrap break-words">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {proseSection('notes') && (
            <section className="mb-3 last:mb-0" aria-label="备注">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">备注</h3>
              {proseSection('notes')?.paragraphs.map((paragraph, index) => (
                <p key={index} className="m-0 mb-1.5 whitespace-pre-wrap break-words text-md leading-relaxed text-ink last:mb-0">
                  {paragraph}
                </p>
              ))}
            </section>
          )}

          {timelineItems.length > 0 && (
            <section className="mb-3 last:mb-0" aria-label="时间线">
              <h3 className="m-0 mb-1 font-mono text-2xs font-medium tracking-normal text-muted">时间线</h3>
              <ol className="m-0 list-decimal pl-6">
                {timelineItems.map((item, index) => (
                  <li key={index} className="mb-1 whitespace-pre-wrap break-words text-md leading-relaxed text-ink last:mb-0">
                    {item.prefix && <span className="mr-1 font-mono text-2xs text-muted">{item.prefix}</span>}
                    {item.text}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>
      )}

      <p className="mx-auto mt-3 max-w-3xl rounded-md border border-border-subtle bg-surface-sunken px-2 py-1 text-2xs text-muted">
        概览只读：需要调整目标、进展或待办，请直接跟司墨说，然后再点「更新概览」。
      </p>
    </div>
  )
}
