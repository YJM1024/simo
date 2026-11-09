// features/chat/TrajectoryView.tsx —— UI-2 轨迹视图（事件流 + 筛选 + 降级）
//
// 主数据：GET /api/sessions/{id}/trajectory；实时：WS 帧；降级：消息 + 工具调用。
// 只读事件投影；点击消息项跳回对话并高亮，任务项打开任务详情；不写第二份状态。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { apiGet } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import type { ChatMessage, WireFrame } from '../../platform/types.ts'
import ToolCallCard from './ToolCallCard.tsx'
import { maskSecrets, normalizeToolCard } from './toolcards.ts'
import {
  compactionSummary,
  eventsFromMessages,
  filterTrajectoryEvents,
  formatTrajectoryTime,
  mergeTrajectoryEvents,
  normalizeTrajectoryFrame,
  normalizeTrajectoryResponse,
  trajectoryKindLabel,
  type TrajectoryEvent,
  type TrajectoryFilter,
} from './trajectory.ts'
import type { ToolCallInfo } from './toolcalls.ts'

const FILTERS: Array<{ id: TrajectoryFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'tool', label: '工具' },
  { id: 'approval', label: '审批' },
  { id: 'task', label: '任务' },
  { id: 'compaction', label: '压缩' },
  { id: 'error', label: '错误' },
]

const KIND_TONE: Record<string, string> = {
  message: 'border-border-subtle bg-surface-sunken text-muted',
  tool: 'border-accent-border bg-accent-soft text-accent-hover',
  approval: 'border-warn-border bg-warn-soft text-warn-ink',
  task: 'border-ok-border bg-ok-soft text-ok-ink',
  plan: 'border-accent-border bg-accent-soft text-accent-hover',
  retry: 'border-warn-border bg-warn-soft text-warn-ink',
  compaction: 'border-border-subtle bg-surface-sunken text-muted',
  error: 'border-danger-border bg-danger-soft text-danger-ink',
}

interface TrajectoryViewProps {
  sessionId: string | null
  messages: ChatMessage[]
  toolCalls: ToolCallInfo[]
  onJumpMessage: (messageId: string) => void
  onOpenTask: (taskId: string) => void
}

export default function TrajectoryView({ sessionId, messages, toolCalls, onJumpMessage, onOpenTask }: TrajectoryViewProps) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([])
  const [filter, setFilter] = useState<TrajectoryFilter>('all')
  const [loading, setLoading] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const fallbackEvents = useMemo(() => eventsFromMessages(messages, toolCalls), [messages, toolCalls])

  const load = useCallback(async (session: string | null): Promise<void> => {
    if (!session) {
      setEvents(fallbackEvents)
      setFallback(true)
      setNote('没有会话，展示空轨迹。')
      return
    }
    setLoading(true)
    setNote(null)
    try {
      const payload = await apiGet(`/api/sessions/${encodeURIComponent(session)}/trajectory?limit=100`)
      const parsed = normalizeTrajectoryResponse(payload)
      setEvents((prev) => mergeTrajectoryEvents(parsed.items.length > 0 ? parsed.items : [], prev))
      setHasMore(parsed.hasMore)
      setNextBefore(parsed.nextBefore)
      setFallback(parsed.items.length === 0)
      if (parsed.items.length === 0) setNote('后端轨迹暂无事件，当前用消息与工具调用降级展示。')
    } catch {
      setEvents(fallbackEvents)
      setFallback(true)
      setHasMore(false)
      setNextBefore(null)
      setNote('后端轨迹接口未就绪，当前用消息与工具调用降级展示。')
    } finally {
      setLoading(false)
    }
  }, [fallbackEvents])

  useEffect(() => {
    void load(sessionId)
  }, [load, sessionId])

  // 实时 WS 帧合并（工具/审批/任务/压缩/错误等）
  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        const incoming = normalizeTrajectoryFrame(frame)
        if (incoming.length === 0) return
        setEvents((prev) => mergeTrajectoryEvents(prev, incoming))
      }),
    [],
  )

  // 降级数据随消息/工具调用增长
  useEffect(() => {
    if (!fallback) return
    setEvents((prev) => mergeTrajectoryEvents(prev, fallbackEvents))
  }, [fallback, fallbackEvents])

  const filtered = useMemo(() => filterTrajectoryEvents(events, filter), [events, filter])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [filtered.length])

  const loadEarlier = async (): Promise<void> => {
    if (!sessionId || nextBefore === null) return
    try {
      const payload = await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/trajectory?limit=100&before=${nextBefore}`)
      const parsed = normalizeTrajectoryResponse(payload)
      setEvents((prev) => mergeTrajectoryEvents(parsed.items, prev))
      setHasMore(parsed.hasMore)
      setNextBefore(parsed.nextBefore)
    } catch {
      setNote('加载更早轨迹失败（接口可能未就绪）。')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" role="tabpanel" aria-label="轨迹">
      <div role="group" aria-label="轨迹筛选" className="flex flex-none flex-wrap items-center gap-1.5 overflow-x-auto border-b border-border-subtle px-2 py-1.5 sm:px-4">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`cursor-pointer rounded-xs border px-2 py-0.5 font-mono text-2xs ${
              filter === item.id ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto font-mono text-2xs text-muted">{events.length} 条事件{fallback ? ' · 降级' : ''}</span>
        <button
          type="button"
          onClick={() => void load(sessionId)}
          disabled={loading}
          className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 text-2xs text-muted disabled:opacity-50"
        >
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {note && (
        <p role="status" className="m-0 border-b border-warn-border bg-warn-soft/60 px-4 py-1 text-2xs text-warn-ink">
          {note}
        </p>
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
        {loading && filtered.length === 0 ? (
          <LoadingPane label="加载轨迹…" />
        ) : filtered.length === 0 ? (
          <EmptyPane title="暂无轨迹事件" description="对话中的消息、工具调用与任务事件会出现在这里；后端事件未就绪时用消息降级。" />
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {filtered.map((event) => {
              const expanded = expandedId === event.id
              const card = event.kind === 'tool' ? normalizeToolCard(event.detail, event.id) : null
              return (
                <li key={event.id} className="rounded-md border border-border-subtle bg-surface-solid px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (event.kind === 'message' && event.source.messageId) onJumpMessage(event.source.messageId)
                      else if ((event.kind === 'task' || event.kind === 'plan' || event.kind === 'retry') && event.source.taskId) onOpenTask(event.source.taskId)
                      else setExpandedId(expanded ? null : event.id)
                    }}
                    className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 text-left"
                  >
                    <span className="font-mono text-2xs text-muted">{formatTrajectoryTime(event.at)}</span>
                    <span className={`rounded-pill border px-1.5 font-mono text-2xs ${KIND_TONE[event.kind] ?? ''}`}>{trajectoryKindLabel(event.kind)}</span>
                    {event.status && <span className="font-mono text-2xs text-muted">{event.status}</span>}
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{event.title}</span>
                    <span className="min-w-0 max-w-[45%] truncate text-2xs text-ink-secondary">{event.summary}</span>
                    {event.kind !== 'message' && event.kind !== 'task' && (
                      <span className="font-mono text-2xs text-muted">{expanded ? '收起' : '详情'}</span>
                    )}
                  </button>

                  {expanded && (
                    <div className="mt-1.5 border-t border-border-subtle pt-1.5">
                      {card ? (
                        <ToolCallCard data={card} defaultOpen />
                      ) : event.kind === 'compaction' ? (
                        <p className="m-0 text-2xs text-ink-secondary">{compactionSummary(event.detail) ?? '压缩事件'}</p>
                      ) : (
                        <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink-secondary">
                          {maskSecrets(JSON.stringify(event.detail ?? event, null, 2))}
                        </pre>
                      )}
                      {event.kind === 'approval' && (
                        <p className="m-0 mt-1 text-2xs text-warn-ink">审批请在审批条/任务详情完成；轨迹中只读。</p>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
        {hasMore && nextBefore !== null && (
          <div className="mt-2 flex justify-center">
            <button type="button" onClick={() => void loadEarlier()} className="cursor-pointer rounded-pill border border-border-subtle bg-surface-solid px-3 py-1 text-2xs text-ink-secondary">
              加载更早轨迹
            </button>
          </div>
        )}
      </div>

      {fallback && toolCalls.some((call) => call.tool) && (
        <p className="m-0 flex-none border-t border-border-subtle px-4 py-1 font-mono text-2xs text-muted">
          降级数据源：消息 + 工具调用（另有 {toolCalls.length} 条工具调用可用）
        </p>
      )}
    </div>
  )
}
