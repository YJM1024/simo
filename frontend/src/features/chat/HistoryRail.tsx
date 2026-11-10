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
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [atTop, setAtTop] = useState(true)
  const [atBottom, setAtBottom] = useState(false)
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })
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
  }, [ticks.length])

  const scrollByPage = (direction: -1 | 1): void => {
    scrollRef.current?.scrollBy({ top: direction * 120, behavior: 'smooth' })
  }

  const trackPointer = (event: React.MouseEvent): void => {
    const width = 240
    const height = 240
    const gap = 12
    let x = event.clientX + gap
    let y = event.clientY + gap
    if (x + width > window.innerWidth - 8) x = event.clientX - width - gap
    if (y + height > window.innerHeight - 8) y = event.clientY - height - gap
    setPopupPos({ x: Math.max(8, x), y: Math.max(8, y) })
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
    const highlighted = highlightId === id
    return `group flex h-3.5 w-9 flex-none cursor-pointer items-center justify-center rounded-xs transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      selected ? 'bg-accent-soft' : 'hover:bg-surface-sunken'
    } ${highlighted ? 'bg-accent-soft' : ''}`
  }

  const tickBarClassName = (tick: TimelineTick): string => {
    const emphasized = pinnedId === tick.id || highlightId === tick.id || activeMessageId === tick.id
    const color = tick.role === 'user'
      ? emphasized ? 'bg-timeline-user-active' : 'bg-timeline-user'
      : 'bg-timeline-agent'
    return `block rounded-[3px] transition-[width,height,opacity] duration-fast ${
      emphasized ? 'h-2 w-[26px] opacity-100' : 'h-1.5 w-5 opacity-65 group-hover:w-[26px] group-hover:opacity-100'
    } ${color}`
  }

  return (
    <div
      ref={railRef}
      className="relative flex w-9 flex-none flex-col items-center gap-0.5 border-r border-border-subtle bg-surface-sunken/30 py-2"
      role="navigation"
      aria-label="消息时间轴"
    >
      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        disabled={atTop}
        aria-label="向上滚动时间轴"
        className="mb-1 flex h-6 w-8 flex-none cursor-pointer items-center justify-center rounded-xs text-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-default disabled:opacity-30"
      >
        <Icon name="chevron-up" size={16} />
      </button>
      <div className="relative flex min-h-0 w-8 flex-1 flex-col items-center">
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-timeline-track" />
        <div
          ref={scrollRef}
          onScroll={updateScrollState}
          className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="my-auto flex w-full flex-none flex-col items-center gap-0.5 py-1">
            {ticks.map((tick, index) => (
              <button
                key={tick.id}
                type="button"
                onMouseEnter={() => openSoon(tick.id)}
                onMouseMove={trackPointer}
                onMouseLeave={closeSoon}
                onFocus={(event) => {
                  clearTimers()
                  setHoveredId(tick.id)
                  const rect = event.currentTarget.getBoundingClientRect()
                  setPopupPos({ x: Math.min(window.innerWidth - 248, rect.right + 12), y: Math.min(window.innerHeight - 248, rect.top) })
                }}
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
                <span className={tickBarClassName(tick)} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
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

      {previewTick && (
        <div
          ref={popupRef}
          onMouseEnter={clearTimers}
          onMouseLeave={closeSoon}
          onFocus={clearTimers}
          onBlur={closeSoon}
          className="popover-surface fixed w-60 p-2.5 text-left"
          style={{ left: popupPos.x, top: popupPos.y }}
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
