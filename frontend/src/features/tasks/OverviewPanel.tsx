// features/tasks/OverviewPanel.tsx —— M38 右栏「概览」tab（从中间移出）
//
// GET /api/sessions/{id}/overview；POST /overview/refresh 仅用户点击时触发。
// 紧凑右栏布局：Goal/约束/进展/待办/时间线；空/错/加载态；垂直滚动、break-words、min-w-0。
// 只读展示，不生成/改写概览内容。

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGet, apiPost } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'
import { readSessionId } from '../../platform/router.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import { IconButton } from '../../platform/ui/IconButton.tsx'

interface OverviewTimeline {
  text: string
  at: number | null
}

interface CompactOverview {
  goal: string[]
  constraints: string[]
  current: string[]
  completed: string[]
  pending: string[]
  completedOverflow: number
  pendingOverflow: number
  timelineOverflow: number
  timeline: OverviewTimeline[]
  updatedAt: number | null
  version: number | null
}

const MAX_COMPLETED = 6
const MAX_TIMELINE = 6
const COMPLETED_CHARS = 40
const TIMELINE_CHARS = 50
const SECTION_TITLE = 'm-0 mb-1 text-base font-semibold text-section-title'

function clampText(text: string, limit: number): string {
  const chars = [...text]
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : text
}

function splitListText(text: string): string[] {
  return text
    .split(/\r?\n|[;；]|(?:^|\s)[•·]\s*/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function toStringList(value: unknown, split = false): string[] {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    return split ? splitListText(text) : [text]
  }
  if (!Array.isArray(value)) return []
  const items = value
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (!isRecord(entry)) return ''
      return readString(entry, 'text') ?? readString(entry, 'title') ?? readString(entry, 'content') ?? ''
    })
    .filter(Boolean)
  return split ? items.flatMap(splitListText) : items
}

function normalizeOverview(payload: unknown): CompactOverview | null {
  if (!isRecord(payload)) return null
  const source = isRecord(payload['overview']) ? payload['overview'] : isRecord(payload['data']) ? payload['data'] : payload
  if (!isRecord(source)) return null
  const rawTimeline = Array.isArray(source['timeline']) ? source['timeline'] : []
  const timelineAll = rawTimeline
    .map((entry) => {
      if (!isRecord(entry)) return null
      const text = readString(entry, 'text') ?? readString(entry, 'title') ?? ''
      if (!text) return null
      const atRaw = readNumber(entry, 'at') ?? readNumber(entry, 'createdAt') ?? readNumber(entry, 'time')
      return { text: clampText(text, TIMELINE_CHARS), at: atRaw ?? null }
    })
    .filter((entry): entry is OverviewTimeline => entry !== null)
  const completedAll = toStringList(source['completed'], true).map((item) => clampText(item, COMPLETED_CHARS))
  const pendingAll = toStringList(source['pending'], true).map((item) => clampText(item, COMPLETED_CHARS))
  const overview: CompactOverview = {
    goal: toStringList(source['goal']),
    constraints: toStringList(source['constraints']),
    current: toStringList(source['current']),
    completed: completedAll.slice(0, MAX_COMPLETED),
    pending: pendingAll.slice(0, MAX_COMPLETED),
    completedOverflow: Math.max(0, completedAll.length - MAX_COMPLETED),
    pendingOverflow: Math.max(0, pendingAll.length - MAX_COMPLETED),
    timelineOverflow: Math.max(0, timelineAll.length - MAX_TIMELINE),
    timeline: timelineAll.slice(0, MAX_TIMELINE),
    updatedAt: readNumber(source, 'updatedAt') ?? readNumber(source, 'updated_at') ?? null,
    version: readNumber(source, 'version') ?? null,
  }
  if (
    overview.goal.length === 0 &&
    overview.constraints.length === 0 &&
    overview.current.length === 0 &&
    overview.completed.length === 0 &&
    overview.pending.length === 0 &&
    overview.timeline.length === 0
  ) {
    return null
  }
  return overview
}

function timeLabel(at: number | null): string {
  if (at === null) return ''
  const ms = at > 1e12 ? at : at > 1e9 ? at * 1000 : at
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <section className="mb-3 min-w-0 last:mb-0">
      <h3 className={SECTION_TITLE}>{title}</h3>
      {items.map((item, index) => (
        <p key={`${index}-${item}`} className="m-0 mb-1 min-w-0 break-words text-sm leading-relaxed text-ink last:mb-0">{item}</p>
      ))}
    </section>
  )
}

function CheckList({ title, items, checked, overflow = 0 }: { title: string; items: string[]; checked: boolean; overflow?: number }) {
  if (items.length === 0) return null
  return (
    <section className="mb-3 min-w-0 last:mb-0">
      <h3 className={SECTION_TITLE}>{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={title}>
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex min-w-0 items-start gap-1.5 text-sm leading-relaxed">
            <span aria-hidden="true" className={`mt-0.5 flex-none ${checked ? 'text-ok' : 'text-muted'}`}>
              <Icon name={checked ? 'check' : 'square'} size={16} />
            </span>
            <span className="min-w-0 break-words text-ink">{item}</span>
          </li>
        ))}
      </ul>
      {overflow > 0 && <p className="m-0 mt-1 text-xs text-muted">另有 {overflow} 项</p>}
    </section>
  )
}

export default function OverviewPanel() {
  const [sessionId, setSessionId] = useState<string | null>(() => readSessionId())
  const [overview, setOverview] = useState<CompactOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setOverview(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const payload = await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/overview`)
      setOverview(normalizeOverview(payload))
    } catch (cause) {
      setOverview(null)
      setError(cause instanceof Error && cause.message ? cause.message : '概览加载失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => bus.on(EVENTS.SESSION_ACTIVE, ({ sessionId: next }: { sessionId: string }) => setSessionId(next)), [])

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  const refresh = async (): Promise<void> => {
    if (!sessionId || refreshing) return
    setRefreshing(true)
    setNotice(null)
    try {
      await apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/overview/refresh`, {})
      await load()
      setNotice('概览已更新')
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setNotice(null), 4000)
    } catch {
      setNotice('概览更新需要后端接口支持；未在本地伪造内容。')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" role="tabpanel" aria-label="概览">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-border-subtle px-2 py-1.5">
        <h2 className="m-0 text-base font-semibold text-section-title">概览</h2>
        <div className="flex items-center gap-1.5">
          {overview?.version !== null && overview?.version !== undefined && <span className="font-mono text-2xs text-muted">v{overview.version}</span>}
          <IconButton icon="refresh" label="刷新概览" size="sm" tone="ghost" disabled={loading} onClick={() => void load()} />
          <button type="button" onClick={() => void refresh()} disabled={refreshing || loading} aria-busy={refreshing} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50">
            {refreshing ? '更新中…' : '更新概览'}
          </button>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
        {notice && <p role="status" className="m-0 mb-2 rounded border border-warn-border bg-warn-soft px-1.5 py-0.5 text-2xs text-warn-ink">{notice}</p>}
        {loading && !overview ? (
          <div className="flex flex-col gap-2" role="status" aria-busy="true">
            {[0, 1, 2].map((index) => <span key={index} className="h-8 rounded bg-surface-sunken motion-safe:animate-pulse" />)}
          </div>
        ) : error && !overview ? (
          <div role="alert" className="rounded border border-danger-border bg-danger-soft px-2 py-1.5 text-2xs text-danger-ink">
            <p className="m-0 mb-1 break-words">{error}</p>
            <button type="button" onClick={() => void load()} className="cursor-pointer text-accent-hover underline underline-offset-2">重试</button>
          </div>
        ) : !overview ? (
          <p className="m-0 rounded border border-dashed border-border-subtle bg-surface-sunken/40 px-2 py-2 text-center text-2xs text-muted">
            还没有概览；后端生成后会在这里显示只读摘要。
          </p>
        ) : (
          <>
            {overview.updatedAt !== null && <p className="m-0 mb-2 text-xs tabular-nums text-muted">更新于 {timeLabel(overview.updatedAt)}</p>}
            <Section title="目标" items={overview.goal} />
            <Section title="约束" items={overview.constraints} />
            <Section title="现状" items={overview.current} />
            <CheckList title="已完成" items={overview.completed} checked overflow={overview.completedOverflow} />
            <CheckList title="待办" items={overview.pending} checked={false} overflow={overview.pendingOverflow} />
            {overview.timeline.length > 0 && (
              <section className="min-w-0">
                <h3 className={SECTION_TITLE}>时间线</h3>
                <ol className="relative m-0 ml-1 flex list-none flex-col gap-0 border-l border-border py-0 pl-3 pr-0">
                  {overview.timeline.map((entry, index) => (
                    <li key={`${index}-${entry.text}`} className="relative min-w-0 py-1.5 first:pt-0 last:pb-0">
                      <span aria-hidden="true" className="absolute -left-[17px] top-2 h-2 w-2 rounded-pill border border-surface-solid bg-accent" />
                      <time className="block text-xs tabular-nums text-muted">{timeLabel(entry.at) || `#${index + 1}`}</time>
                      <p className="m-0 mt-0.5 line-clamp-2 min-w-0 break-words text-sm leading-relaxed text-ink" title={entry.text}>{entry.text}</p>
                    </li>
                  ))}
                </ol>
                {overview.timelineOverflow > 0 && <p className="m-0 mt-1 text-xs text-muted">另有 {overview.timelineOverflow} 项</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
