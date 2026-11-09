// features/chat/HistoryRail.tsx —— 消息侧边迷你时间轴 + 可交互预览（M11/M14/M40）
//
// hover 有 150ms 意图延迟、关闭有 200ms grace；弹窗可交互，鼠标移入不关闭；
// 点击刻度固定预览（再点/点外部/Esc 取消固定），点击即刻跳转到该消息；
// 键盘 Tab 聚焦即打开、Enter 跳转；不使用原生 title 提示（aria-label 仅无障碍）。

import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../platform/types.ts'
import { buildTimeline, type TimelineTick } from './history.ts'
import { categoryMeta, sessionPathText } from './message-meta.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import { IconButton } from '../../platform/ui/IconButton.tsx'
import { Badge } from '../../platform/ui/Badge.tsx'

const ROLE_LABEL: Record<'user' | 'agent' | 'system', string> = { user: '你', agent: '司墨', system: '系统' }
const OPEN_DELAY = 150
const CLOSE_GRACE = 200

function tickColor(tick: TimelineTick): string {
  if (tick.role === 'user') return 'bg-accent'
  if (tick.role === 'system') return 'bg-warn'
  const meta = categoryMeta(tick.category)
  return meta ? meta.tickClass : 'bg-ok'
}

function tickToneLabel(tick: TimelineTick): string {
  const meta = categoryMeta(tick.category)
  return meta ? meta.label : ROLE_LABEL[tick.role]
}

interface HistoryRailProps {
  messages: ChatMessage[]
  activeMessageId: string | null
  highlightId: string | null
  onJump: (messageId: string) => void
}

export default function HistoryRail({ messages, activeMessageId, highlightId, onJump }: HistoryRailProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(false)
  const ticks = buildTimeline(messages)
  const targetId = pinnedId ?? hoveredId
  const previewTick = targetId ? ticks.find((tick) => tick.id === targetId) ?? null : null

  const clearTimers = (): void => {
    if (openTimerRef.current !== null) clearTimeout(openTimerRef.current)
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
    openTimerRef.current = null
    closeTimerRef.current = null
  }

  useEffect(() => clearTimers, [])

  const updateScrollState = (): void => {
    const element = scrollRef.current
    if (!element) return
    setAtTop(element.scrollTop <= 1)
    setAtBottom(element.scrollTop + element.clientHeight >= element.scrollHeight - 1)
  }

  useEffect(() => {
    updateScrollState()
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => updateScrollState())
    observer.observe(element)
    return () => observer.disconnect()
  }, [ticks.length, collapsed])

  const scrollByPage = (direction: -1 | 1): void => {
    scrollRef.current?.scrollBy({ top: direction * 120, behavior: 'smooth' })
  }

  useEffect(() => {
    if (pinnedId === null) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (railRef.current?.contains(target) || popupRef.current?.contains(target)) return
      setPinnedId(null)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setPinnedId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pinnedId])

  if (ticks.length === 0) return null

  const openSoon = (id: string): void => {
    clearTimers()
    openTimerRef.current = setTimeout(() => setHoveredId(id), OPEN_DELAY)
  }
  const closeSoon = (): void => {
    clearTimers()
    closeTimerRef.current = setTimeout(() => setHoveredId(null), CLOSE_GRACE)
  }
  const pin = (id: string): void => {
    clearTimers()
    setPinnedId((current) => (current === id ? null : id))
    setHoveredId(null)
  }
  const jumpAndPin = (id: string): void => {
    onJump(id)
    pin(id)
  }

  const tickClassName = (id: string): string => {
    const selected = pinnedId === id
    const active = activeMessageId === id
    const highlighted = highlightId === id
    return `group flex h-5 w-8 flex-none cursor-pointer items-center justify-center rounded-xs transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      selected ? 'bg-accent-soft' : 'hover:bg-surface-sunken'
    } ${highlighted ? 'bg-accent-soft' : ''} ${active && !selected ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`
  }

  const tickBarClassName = (id: string): string => {
    const emphasized = pinnedId === id || highlightId === id || activeMessageId === id
    return `block h-1.5 rounded-xs ${emphasized ? 'w-1.5' : 'w-1'}`
  }

  return (
    <div
      ref={railRef}
      className="relative flex w-8 flex-none flex-col items-center gap-0.5 border-r border-border-subtle bg-surface-sunken/40 py-2"
      role="navigation"
      aria-label="消息时间轴"
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-label={collapsed ? '展开消息时间轴' : '折叠消息时间轴'}
        aria-expanded={!collapsed}
        className="mb-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-xs border border-border-subtle bg-surface-solid text-muted hover:text-ink"
      >
        {collapsed ? <Icon name="chevron-right" size={16} /> : <Icon name="chevron-left" size={16} />}
      </button>

      {collapsed ? (
        <span className="text-xs tabular-nums text-muted">{ticks.length}</span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={atTop}
            aria-label="向上滚动时间轴"
            className="mb-1 flex h-6 w-8 flex-none cursor-pointer items-center justify-center rounded-xs text-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-default disabled:opacity-30"
          >
            <Icon name="chevron-up" size={16} />
          </button>
          <div
            ref={scrollRef}
            onScroll={updateScrollState}
            className="flex min-h-0 flex-1 flex-col items-center gap-px overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {ticks.map((tick, index) => (
              <button
                key={tick.id}
                type="button"
                onMouseEnter={() => openSoon(tick.id)}
                onMouseLeave={closeSoon}
                onFocus={() => { clearTimers(); setHoveredId(tick.id) }}
                onBlur={closeSoon}
                onClick={() => jumpAndPin(tick.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    jumpAndPin(tick.id)
                  }
                }}
                className={tickClassName(tick.id)}
                aria-label={`第 ${index + 1} 条${ROLE_LABEL[tick.role]}消息${tickToneLabel(tick) ? `（${tickToneLabel(tick)}）` : ''}：${tick.preview}`}
                aria-expanded={targetId === tick.id}
              >
                <span className={`${tickBarClassName(tick.id)} ${tickColor(tick)}`} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={atBottom}
            aria-label="向下滚动时间轴"
            className="mt-1 flex h-6 w-8 flex-none cursor-pointer items-center justify-center rounded-xs text-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-default disabled:opacity-30"
          >
            <Icon name="chevron-down" size={16} />
          </button>
        </>
      )}

      {previewTick && !collapsed && (
        <div
          ref={popupRef}
          onMouseEnter={clearTimers}
          onMouseLeave={closeSoon}
          onFocus={clearTimers}
          onBlur={closeSoon}
          className="absolute left-full top-8 z-20 ml-1 w-60 rounded-sm border border-border bg-surface-solid p-2.5 text-left shadow-lg"
          role="dialog"
          aria-label="消息预览"
        >
          <div className="flex items-start gap-2 border-b border-border-subtle pb-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="muted">{ROLE_LABEL[previewTick.role]}</Badge>
                {categoryMeta(previewTick.category) && <Badge tone="neutral">{categoryMeta(previewTick.category)?.label}</Badge>}
              </div>
              <time className="mt-1 block text-xs tabular-nums text-muted">
                {new Date(previewTick.at).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </time>
            </div>
            <IconButton icon="close" label="关闭消息预览" size="sm" tone="ghost" onClick={() => { setPinnedId(null); setHoveredId(null) }} />
          </div>
          {previewTick.sessionPath.length > 0 && (
            <p className="m-0 mt-2 truncate text-xs text-muted">
              会话：{sessionPathText(previewTick.sessionPath)}
            </p>
          )}
          <p className="m-0 mt-1 line-clamp-3 break-words text-sm leading-relaxed text-ink-secondary">{previewTick.preview}</p>
        </div>
      )}
    </div>
  )
}
