import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import type { Artifact, Card, Message, Session, StatsBucket, Task } from '../types'

const CATEGORY_LABEL: Record<string, string> = {
  progress: '进度汇报',
  clarification: '需求澄清',
  requirement: '需求提出',
  consultation: '信息咨询',
}

export function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 1)}k`
  return String(Math.round(value))
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Icon({ name, size = 16 }: { name: string; size?: number }): React.ReactNode {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
    plus: <path d="M8 3v10M3 8h10" />,
    more: <><circle cx="3.5" cy="8" r=".8" /><circle cx="8" cy="8" r=".8" /><circle cx="12.5" cy="8" r=".8" /></>,
    gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.3M8 12.9v1.3M1.8 8h1.3M12.9 8h1.3M3.6 3.6l.9.9M11.5 11.5l.9.9M12.4 3.6l-.9.9M4.5 11.5l-.9.9" /><circle cx="8" cy="8" r="4.6" /></>,
    bell: <><path d="M4 11h8l-1-2V6a3 3 0 0 0-6 0v3Z" /><path d="M6.5 13a1.5 1.5 0 0 0 3 0" /></>,
    file: <><path d="M5 2h4l3 3v9H5Z" /><path d="M9 2v3h3" /></>,
    send: <path d="M3 8l10-5-3 10-2-4-5-1Z" />,
    tools: <><path d="m3 13 4-4" /><path d="m8 4 4 4" /><path d="M3 3l10 10" /></>,
    refresh: <><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 2v3h-3" /></>,
  }
  return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.more}</svg>
}

export function Segmented({ value, onChange }: { value: 'chat' | 'workbench'; onChange: (value: 'chat' | 'workbench') => void }): React.ReactNode {
  return (
    <nav className="nav" aria-label="页面">
      <button type="button" className={`nav-chip ${value === 'chat' ? 'is-active' : ''}`} onClick={() => onChange('chat')}>对话</button>
      <button type="button" className={`nav-chip ${value === 'workbench' ? 'is-active' : ''}`} onClick={() => onChange('workbench')}>工作台</button>
    </nav>
  )
}

export function Sidebar({ sessions, activeId, onSelect, onRename, onCreate, onRefresh, connection, usageTotal, quotaPct, sessionCount, messageCount, statsError, loading, error, searchQuery, onSearch, searching, searchIds, onArchive }: {
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onCreate: () => void
  onRefresh: () => void
  connection: string
  usageTotal: number | null
  quotaPct: number
  sessionCount: number
  messageCount: number | null
  statsError: string
  loading: boolean
  error: string
  searchQuery: string
  onSearch: (value: string) => void
  searching: boolean
  searchIds: Set<string> | null
  onArchive: (id: string, archived: boolean) => void
}): React.ReactNode {
  const [editing, setEditing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit(id: string): Promise<void> {
    const value = draft.trim()
    if (value) await onRename(id, value)
    setEditing(null)
  }

  const renderRow = (session: Session, child = false): React.ReactNode => (
    <div key={session.id} className={`session-row ${child ? 'child' : ''} ${activeId === session.id ? 'is-active' : ''} ${session.archived ? 'is-archived' : ''}`}
      onDoubleClick={() => { setEditing(session.id); setDraft(session.title) }}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onSelect(session.id) }}
    >
      <span className="session-dot" aria-hidden="true" />
      {editing === session.id ? (
        <input
          ref={inputRef}
          className="session-rename"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { void commit(session.id) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit(session.id)
            if (event.key === 'Escape') setEditing(null)
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label="重命名会话"
        />
      ) : <><span className="session-title" title={session.title}>{session.title}</span>{activeId === session.id && messageCount !== null && <span className="session-count">{messageCount}</span>}<button type="button" className="session-more" aria-label="会话操作" onClick={(event) => { event.stopPropagation(); setMenuId((value) => value === session.id ? null : session.id) }}>⋯</button></>}
      {menuId === session.id && <div className="session-menu"><button type="button" onClick={(event) => { event.stopPropagation(); onArchive(session.id, !session.archived); setMenuId(null) }}>{session.archived ? '恢复' : '归档'}</button></div>}
    </div>
  )

  const term = searchQuery.trim().toLowerCase()
  const matches = (session: Session): boolean => !term || session.title.toLowerCase().includes(term) || Boolean(searchIds?.has(session.id))
  const visibleSessions: Session[] = []
  for (const session of sessions.filter((item) => showArchived || !item.archived)) {
    const allChildren = (session.children ?? []).filter((child) => showArchived || !child.archived)
    const children = term ? allChildren.filter((child) => matches(child)) : allChildren
    if (!term || matches(session) || children.length > 0) visibleSessions.push({ ...session, children })
  }

  return (
    <>
      <div className="ws">
        <i>S</i>
        <div><b>主工作区</b><span>{connection === 'open' ? '本地环境' : connection === 'reconnecting' ? '重连中…' : '连接中…'}</span></div>
        <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}><Icon name="plus" /></button>
      </div>
      <div className="search">
        <Icon name="search" />
        <input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="搜索会话、消息…" aria-label="搜索会话" />
        <kbd>⌘K</kbd>
      </div>
      <div className="sidebar-scroll">
        <div className="side-label">
          <span className="grow">会话</span>
          <span>{loading || error ? '—' : sessions.reduce((count, session) => count + 1 + (session.children?.length ?? 0), 0)}</span>
          <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>显示归档</button>
          <button type="button" title="刷新会话" aria-label="刷新会话" onClick={onRefresh}><Icon name="refresh" size={12} /></button>
          <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}>＋</button>
        </div>
        {loading && visibleSessions.length === 0 && <LoadingState label="会话加载中…" />}
        {!loading && error && <ErrorState title="会话加载失败" description={error} onRetry={onRefresh} />}
        {!loading && !error && visibleSessions.length === 0 && <div className="side-empty">{searching ? '搜索中…' : term ? '没有匹配的会话' : '暂无会话'}</div>}
        {visibleSessions.map((session) => (
          <div key={session.id}>
            {renderRow(session)}
            {(session.children ?? []).filter((child) => showArchived || !child.archived).map((child) => renderRow(child, true))}
          </div>
        ))}
      </div>
      <div className="quota"><div className="quota-row"><span>本月用量</span><span>{usageTotal === null ? '—' : formatTokens(usageTotal)}</span></div><div className="quota-bar"><i className={`q${quotaPct}`} /></div><div className="quota-note">{statsError ? '统计加载失败' : `${sessionCount} 个会话 · ${messageCount === null ? '—' : messageCount} 条消息`}</div></div>
      <div className="user"><span className="avatar">Y</span><div><b>本地用户</b><span>主工作区 · Owner</span></div></div>
    </>
  )
}

export function StatusBar({ connection }: { connection: string }): React.ReactNode {
  return <footer className="statusbar"><span>{connection === 'open' ? '就绪' : connection === 'reconnecting' ? '重连中' : '连接中'}</span><span>V4.1 Flash · 读/写权限按策略</span></footer>
}

function renderMessageText(text: string): React.ReactNode {
  const fenced = text.split(/(```[\s\S]*?```)/g)
  return fenced.map((part, index) => {
    if (part.startsWith('```')) {
      const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
      return <pre key={index}><code>{code}</code></pre>
    }
    return part.split(/\n{2,}/).filter(Boolean).map((paragraph, pIndex) => (
      <p key={`${index}-${pIndex}`}>{paragraph.split(/(`[^`]+`)/g).map((piece, cIndex) => piece.startsWith('`') && piece.endsWith('`') ? <code key={cIndex}>{piece.slice(1, -1)}</code> : <span key={cIndex}>{piece}</span>)}</p>
    ))
  })
}

export function MessageItem({ message, onCardAction, readOnly = false }: { message: Message; onCardAction: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void>; readOnly?: boolean }): React.ReactNode {
  const [streaming, setStreaming] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopyState('copied')
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = message.text
        area.style.position = 'fixed'; area.style.opacity = '0'
        document.body.appendChild(area); area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        setCopyState(ok ? 'copied' : 'error')
      } catch { setCopyState('error') }
    }
    window.setTimeout(() => setCopyState('idle'), 1500)
  }
  useEffect(() => {
    setStreaming(message.status === 'streaming')
  }, [message.status])
  const isUser = message.role === 'user'
  const rawCategory = message.category === 'delivery' ? 'progress' : message.category
  const categoryKey = isUser ? '' : (rawCategory && CATEGORY_LABEL[rawCategory] ? rawCategory : 'consultation')
  const category = categoryKey ? CATEGORY_LABEL[categoryKey] : ''
  return (
    <article className={`msg ${isUser ? 'from-user' : 'from-agent'}`} data-message-id={message.id} data-session-id={message.sessionId}>
      <span className="msg-avatar">{isUser ? '你' : '墨'}</span>
      <div className="msg-body">
        <div className="msg-meta"><b>{isUser ? '你' : '司墨'}</b><span>·</span>{category && <><span className={`tag msg-tag msg-tag-${categoryKey}`}>{category}</span><span>·</span></>}<span>{formatTime(message.at)}</span>{message.status === 'failed' && <span className="badge danger">失败</span>}{message.text.trim() && <button type="button" className="msg-copy" onClick={() => void copy()} aria-label="复制消息">{copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败' : '复制'}</button>}</div>
        <div className="msg-text">
          {message.text.trim() ? <>{renderMessageText(message.text)}{streaming && <p><span className="stream-caret" aria-hidden="true" /></p>}</> : streaming ? <p><span className="stream-caret" aria-hidden="true" /></p> : null}
          {(message.cards ?? []).map((card) => <CardBlock key={card.id} card={card} onSubmit={onCardAction} readOnly={readOnly} />)}
        </div>
      </div>
    </article>
  )
}

export function CardBlock({ card, onSubmit, readOnly = false }: { card: Card; onSubmit: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void>; readOnly?: boolean }): React.ReactNode {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const blocks = card.schema.blocks ?? []
  const form = blocks.find((block) => block.type === 'form')
  const fields = (form?.props?.fields as Array<{ kind: string; label: string; name: string; options?: string[] }> | undefined) ?? []
  const action = form?.actions?.[0]?.id ?? 'submit'
  const disabled = busy || readOnly || card.status !== 'active'
  return (
    <div className="card-block">
      <div className="card-head"><b>{card.schema.title ?? card.title ?? '交互卡片'}</b><span className="state">{card.status} · v{card.version}</span></div>
      {blocks.filter((block) => block.type === 'text').map((block) => <p className="card-text" key={block.id}>{String(block.props?.text ?? '')}</p>)}
      {fields.length > 0 && (
        <div className="card-fields">
          {fields.map((field) => {
            const id = `${card.id}-${field.name}`
            const value = values[field.name] ?? ''
            const update = (next: string): void => setValues((prev) => ({ ...prev, [field.name]: next }))
            return (
              <div className="card-field" key={field.name}>
                <label htmlFor={id}>{field.label}</label>
                {field.kind === 'select' ? (
                  <select id={id} className="select" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)}>
                    <option value="">请选择…</option>
                    {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.kind === 'textarea' ? (
                  <textarea id={id} className="textarea" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} />
                ) : (
                  <input id={id} className="input" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} />
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="card-error" role="alert">{error}</p>}
      <div className="card-actions">
        <button className="btn" type="button" disabled={busy || readOnly} onClick={() => setValues({})}>取消</button>
        <button className="send" type="button" disabled={disabled} onClick={() => {
          setBusy(true)
          setError('')
          void onSubmit(card, action, values).catch((err: unknown) => setError(err instanceof Error ? err.message : '提交失败')).finally(() => setBusy(false))
        }}>{busy ? '提交中…' : error ? '重试' : '确认'}</button>
      </div>
    </div>
  )
}

export function WorkbenchChart({ buckets }: { buckets: StatsBucket[] }): React.ReactNode {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.messages))
  return (
    <div className="chart" role="img" aria-label="每日消息统计">
      {buckets.map((bucket) => {
        const pct = Math.max(2, Math.round((bucket.messages / max) * 100))
        return <div className="bar" key={bucket.label}><i className={`h${pct}`} /><span>{bucket.label.slice(5)}</span></div>
      })}
    </div>
  )
}

export type TimelineTipState = 'hidden' | 'visible' | 'edge-clamped'

export function TimelineTip({ open, anchorRef, sender, sessionTitle, timeLabel, summary, fallbackLabel, category, onClose, onStateChange }: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  sender: 'user' | 'agent'
  sessionTitle: string
  timeLabel: string
  summary: string
  fallbackLabel?: string
  category?: string
  onClose: () => void
  onStateChange?: (state: TimelineTipState) => void
}): React.ReactNode {
  const tipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [state, setState] = useState<TimelineTipState>('hidden')

  useLayoutEffect(() => {
    if (!open) {
      setState('hidden')
      onStateChange?.('hidden')
      return
    }
    const update = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(236, window.innerWidth - 16)
      const height = tipRef.current?.offsetHeight ?? 76
      let left = rect.right + 8
      let clamped = false
      if (left + width > window.innerWidth - 8) {
        left = rect.left - width - 8
        clamped = true
      }
      if (left < 8) { left = 8; clamped = true }
      let top = rect.top + rect.height / 2 - height / 2
      if (top < 8) { top = 8; clamped = true }
      if (top + height > window.innerHeight - 8) { top = window.innerHeight - height - 8; clamped = true }
      setPos({ left, top })
      const next: TimelineTipState = clamped ? 'edge-clamped' : 'visible'
      setState(next)
      onStateChange?.(next)
    }
    update()
    const raf = requestAnimationFrame(update)
    const observer = typeof ResizeObserver !== 'undefined' && tipRef.current ? new ResizeObserver(update) : null
    observer?.observe(tipRef.current as Element)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef, sender, sessionTitle, timeLabel, summary, onStateChange])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div ref={tipRef} id="timeline-tip" className="timeline-tip-surface" role="tooltip" style={{ left: pos.left, top: pos.top }} data-state={state}>
      <div className="timeline-tip-meta"><b>{sender === 'user' ? '你' : '司墨'}</b><span>·</span><span className="session">{sessionTitle}</span>{category && <><span>·</span><span className="tag">{category}</span></>}<span>·</span><span className="time">{timeLabel}</span></div>
      <div className="timeline-tip-summary">{summary || fallbackLabel || '（消息内容为空）'}</div>
    </div>,
    document.body,
  )
}

export function Timeline({ messages, active, onJump }: { messages: Message[]; active: number; onJump: (index: number) => void }): React.ReactNode {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const barsRef = useRef<Array<HTMLButtonElement | null>>([])
  const anchorRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const first = messages[0]
  const clearShow = (): void => { if (showTimer.current !== null) { window.clearTimeout(showTimer.current); showTimer.current = null } }
  const clearClose = (): void => { if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const openTip = (index: number): void => {
    clearShow()
    clearClose()
    anchorRef.current = barsRef.current[index] ?? null
    setTipIndex(index)
    setTipOpen(true)
  }
  const scheduleOpen = (index: number): void => {
    clearClose()
    clearShow()
    showTimer.current = window.setTimeout(() => openTip(index), 120)
  }
  const scheduleClose = (): void => {
    clearShow()
    clearClose()
    closeTimer.current = window.setTimeout(() => setTipOpen(false), 200)
  }
  useEffect(() => () => { clearShow(); clearClose() }, [])
  const tipMessage = tipIndex !== null ? messages[tipIndex] : null
  return (
    <div className="timeline" aria-label="消息时间轴" onMouseLeave={scheduleClose} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose() }} onKeyDown={(event) => { if (event.key === 'Escape') { clearShow(); clearClose(); setTipOpen(false) } }}>
      <div className="tl-track">
        {first && <span className="tl-date">{formatDate(first.at)}</span>}
        {messages.map((message, index) => (
          <button
            key={message.id}
            ref={(element) => { barsRef.current[index] = element }}
            type="button"
            className={`tl-bar ${message.role === 'user' ? 'is-user' : 'is-agent'} ${index === active ? 'is-current' : ''}`}
            onClick={() => onJump(index)}
            onMouseEnter={() => scheduleOpen(index)}
            onFocus={() => openTip(index)}
            onBlur={scheduleClose}
            aria-describedby={tipOpen && tipIndex === index ? 'timeline-tip' : undefined}
            aria-label={`跳转到第 ${index + 1} 条消息`}
          />
        ))}
      </div>
      {tipOpen && tipMessage && (
        <TimelineTip
          key={tipIndex ?? 0}
          open={tipOpen}
          anchorRef={anchorRef}
          sender={tipMessage.role === 'user' ? 'user' : 'agent'}
          sessionTitle={tipMessage.sessionTitle ?? '主会话'}
          timeLabel={formatTime(tipMessage.at)}
          summary={tipMessage.text}
          onClose={() => { clearShow(); clearClose(); setTipOpen(false) }}
        />
      )}
    </div>
  )
}

export interface TimelineGroupMessage {
  id: string
  sessionId: string
  sessionTitle: string
  sessionOrder: number
  isCurrentSession: boolean
  role: 'user' | 'agent'
  category?: 'clarification' | 'progress' | 'confirmation' | 'result' | 'error'
  at: number
  dateKey: string
  summary?: string
}

export function TimelineGroups({ messages, currentSessionId, activeMessageId, onJump, ariaLabel = '消息时间轴' }: {
  messages: readonly TimelineGroupMessage[]
  currentSessionId: string
  activeMessageId?: string
  onJump: (messageId: string) => void
  ariaLabel?: string
}): React.ReactNode {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const barsRef = useRef<Array<HTMLButtonElement | null>>([])
  const anchorRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const sorted = [...messages].sort((a, b) => a.sessionOrder - b.sessionOrder || a.dateKey.localeCompare(b.dateKey) || a.at - b.at)
  const flat = sorted
  const clearShow = (): void => { if (showTimer.current !== null) { window.clearTimeout(showTimer.current); showTimer.current = null } }
  const clearClose = (): void => { if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const openTip = (index: number): void => { clearShow(); clearClose(); anchorRef.current = barsRef.current[index] ?? null; setTipIndex(index); setTipOpen(true) }
  const scheduleOpen = (index: number): void => { clearClose(); clearShow(); showTimer.current = window.setTimeout(() => openTip(index), 120) }
  const scheduleClose = (): void => { clearShow(); clearClose(); closeTimer.current = window.setTimeout(() => setTipOpen(false), 200) }
  useEffect(() => () => { clearShow(); clearClose() }, [])
  const categoryLabel = (category?: string): string => category ? (CATEGORY_LABEL[category] ?? category) : ''
  const groups: Array<{ sessionId: string; title: string; current: boolean; messages: Array<{ message: TimelineGroupMessage; index: number }> }> = []
  let cursor = 0
  for (const message of sorted) {
    let group = groups[groups.length - 1]
    if (!group || group.sessionId !== message.sessionId) {
      group = { sessionId: message.sessionId, title: message.sessionTitle, current: message.sessionId === currentSessionId, messages: [] }
      groups.push(group)
    }
    group.messages.push({ message, index: cursor++ })
  }
  const tipMessage = tipIndex !== null ? flat[tipIndex] : null
  const onTimelineKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const active = document.activeElement as HTMLElement | null
    const index = barsRef.current.findIndex((bar) => bar === active)
    if (index < 0) return
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(barsRef.current.length - 1, index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = barsRef.current.length - 1
    else if (event.key === 'Escape') { clearShow(); clearClose(); setTipOpen(false); return }
    else return
    event.preventDefault()
    barsRef.current[next]?.focus()
  }
  return (
    <nav className="timeline timeline-groups" aria-label={ariaLabel} onMouseLeave={scheduleClose} onKeyDown={onTimelineKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose() }}>
      <div className="tlg-track">
        {groups.map((group) => (
          <div className={`tlg-session ${group.current ? 'is-current-session' : 'is-ancestor-session'}`} key={group.sessionId} aria-label={`${group.current ? '当前会话' : '上级会话'}：${group.title}`}>
            {group.messages.map(({ message, index }) => (
              <button
                key={message.id}
                ref={(element) => { barsRef.current[index] = element }}
                type="button"
                className={`tl-bar ${message.role === 'user' ? 'is-user' : 'is-agent'} ${message.id === activeMessageId ? 'is-current' : ''}`}
                aria-current={message.id === activeMessageId ? 'true' : undefined}
                aria-describedby={tipOpen && tipIndex === index ? 'timeline-tip' : undefined}
                aria-label={`${message.role === 'user' ? '你' : '司墨'} · ${message.sessionTitle} · ${formatTime(message.at)}`}
                onClick={() => onJump(message.id)}
                onMouseEnter={() => scheduleOpen(index)}
                onFocus={() => openTip(index)}
                onBlur={scheduleClose}
              />
            ))}
          </div>
        ))}
      </div>
      {tipOpen && tipMessage && (
        <TimelineTip key={tipIndex ?? 0} open anchorRef={anchorRef} sender={tipMessage.role} sessionTitle={tipMessage.sessionTitle} timeLabel={formatTime(tipMessage.at)} summary={tipMessage.summary ?? ''} category={categoryLabel(tipMessage.category)} onClose={() => { clearShow(); clearClose(); setTipOpen(false) }} />
      )}
    </nav>
  )
}

export function Composer({ disabled, streaming, onSend, onStop, sendError }: { disabled: boolean; streaming: boolean; onSend: (text: string) => Promise<void>; onStop: () => void; sendError: string }): React.ReactNode {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [localError, setLocalError] = useState('')
  async function submit(): Promise<void> {
    const value = text.trim()
    if (!value || disabled || sending) return
    setText('')
    setLocalError('')
    setSending(true)
    try {
      await onSend(value)
    } catch (err) {
      setText(value)
      setLocalError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="composer">
      <div className="composer-box">
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="给司墨发消息…" aria-label="消息输入框" onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }} />
        {(localError || sendError) && <p className="composer-error" role="alert">{localError || sendError}</p>}
        <div className="composer-foot">
          <div className="composer-left"><Icon name="file" /> <span>支持 Markdown 格式</span></div>
          <div className="composer-right"><span className="composer-hint">Enter 发送 · Shift+Enter 换行</span>{streaming && <button className="btn sm composer-stop" type="button" onClick={onStop}>停止</button>}<button className="send" type="button" disabled={disabled || sending || streaming || !text.trim()} onClick={() => void submit()}>{sending ? '发送中…' : '发送'}</button></div>
        </div>
      </div>
    </div>
  )
}

export function StatusDot({ tone }: { tone: 'done' | 'running' | 'pending' }): React.ReactNode {
  return <i className={`exec-dot ${tone}`} aria-hidden="true" />
}

export function TaskItem({ task, tone, onClick }: { task: Task; tone: 'done' | 'running' | 'pending'; onClick?: () => void }): React.ReactNode {
  return (
    <button type="button" className="exec-row task-row" onClick={onClick} title={onClick ? '定位到相关消息' : undefined}>
      <StatusDot tone={tone} />
      <span className="exec-title" title={task.title}>{task.title}</span>
      <span className="exec-time">{formatTime(task.createdAt)}</span>
    </button>
  )
}

export function List({ children }: { children: React.ReactNode }): React.ReactNode {
  return <div className="exec-list">{children}</div>
}

export function SectionHeader({ title, meta }: { title: string; meta?: React.ReactNode }): React.ReactNode {
  return <div className="insp-head insp-head--tight"><b>{title}</b>{meta !== undefined && <span>{meta}</span>}</div>
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return <section className="insp-block"><h3 className="insp-label">{title}</h3>{children}</section>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }): React.ReactNode {
  return (
    <div className="overview-empty">
      <span className="overview-empty-mark" aria-hidden="true">·</span>
      <div><b>{title}</b>{description && <span>{description}</span>}{action}</div>
    </div>
  )
}

export function LoadingState({ label = '加载中…' }: { label?: string }): React.ReactNode {
  return <div className="state-block state-loading" role="status"><span className="state-mark" aria-hidden="true" /><p>{label}</p></div>
}

export function ErrorState({ title = '加载失败', description, onRetry }: { title?: string; description?: string; onRetry?: () => void }): React.ReactNode {
  return <div className="state-block state-error" role="alert"><span className="state-mark" aria-hidden="true" /><b>{title}</b>{description && <p>{description}</p>}{onRetry && <button className="btn sm" type="button" onClick={onRetry}>重试</button>}</div>
}

export function DeliverableItem({ artifact, onOpen, downloadUrl }: { artifact: Artifact; onOpen?: () => void; downloadUrl?: string }): React.ReactNode {
  return (
    <div className="deliverable-line">
      <button type="button" className="exec-row deliverable-row" onClick={onOpen} title={onOpen ? '打开交付物' : undefined}>
        <span className="deliverable-icon"><Icon name="file" size={14} /></span>
        <span className="exec-title" title={artifact.name}>{artifact.name}</span>
        <span className="exec-time">{formatTime(artifact.createdAt)}</span>
      </button>
      {downloadUrl && <a className="download-link" href={downloadUrl} download aria-label={`下载 ${artifact.name}`}>下载</a>}
    </div>
  )
}

export function ExecutionGroup({ title, tasks, defaultCount, tone, emptyTitle, emptyDescription, onTaskClick }: { title: string; tasks: Task[]; defaultCount: number; tone: 'done' | 'running' | 'pending'; emptyTitle: string; emptyDescription: string; onTaskClick?: (task: Task) => void }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? tasks : tasks.slice(0, defaultCount)
  const shown = expanded ? tasks.length : Math.min(defaultCount, tasks.length)
  return (
    <div className={`exec-group ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" className="exec-head" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="exec-toggle">{expanded ? '▾' : '▸'}</span><span className="exec-name">{title}</span><span className="exec-count">{`${shown}/${tasks.length}`}</span>
      </button>
      {visible.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : (
        <List>{visible.map((task) => <TaskItem key={task.id} task={task} tone={tone} onClick={onTaskClick ? () => onTaskClick(task) : undefined} />)}</List>
      )}
    </div>
  )
}

export function ConversationPanel({ timeline, children, state = 'ready', empty, error, onRetry, scrollRef, onScroll }: {
  timeline?: React.ReactNode
  children: React.ReactNode
  state?: 'ready' | 'loading' | 'empty' | 'error'
  empty?: React.ReactNode
  error?: React.ReactNode
  onRetry?: () => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
}): React.ReactNode {
  return (
    <section className={`conversation-panel is-${state}`} aria-label="当前会话消息">
      {state === 'ready' && <>{timeline}<div className="conversation-scroll" ref={scrollRef} onScroll={onScroll}>{children}</div></>}
      {state !== 'ready' && <div className="conversation-state">{state === 'loading' ? <LoadingState label="消息加载中…" /> : state === 'empty' ? (empty ?? <EmptyState title="暂无消息" description="发送第一条消息开始对话。" />) : (error ?? <ErrorState title="消息加载失败" onRetry={onRetry} />)}</div>}
    </section>
  )
}

export function OverviewPanel({ session, projection, loading, error = '', onRetry, onTaskClick, onArtifactOpen }: {
  session: Session | null
  projection: import('../types').SessionSpecProjection | null
  loading: boolean
  error?: string
  onRetry?: () => void
  onTaskClick?: (task: { id: string; title: string }) => void
  onArtifactOpen?: (id: string) => void
}): React.ReactNode {
  const statusLabel = projection ? ({ completed: '已完成', active: '进行中', draft: '草稿', blocked: '阻塞', done: '已完成' }[projection.status] ?? projection.status) : ''
  const mapTasks = (items: Array<{ id: string; title: string; state: string; updatedAt: number }>): Task[] => items.map((item) => ({ id: item.id, sessionId: projection?.sessionId ?? session?.id ?? '', title: item.title, status: item.state, createdAt: item.updatedAt, updatedAt: item.updatedAt }))
  const groups = {
    done: mapTasks(projection?.tasks.done.items ?? []),
    running: mapTasks([...(projection?.tasks.running.items ?? []), ...(projection?.tasks.pending.items ?? [])]),
    queued: mapTasks([]),
  }
  const deliverables = projection?.deliverables.items ?? []
  return (
    <aside className="inspector" aria-label="会话概览" data-session={session?.id ?? ''}>
      <div className="insp-body">
        {loading && <LoadingState label="右栏加载中…" />}
        {!loading && error && <ErrorState title="右栏加载失败" description={error} onRetry={onRetry} />}
        {!loading && !error && !projection && <EmptyState title="暂无会话投影" description="当前会话还没有可用的 SessionSpec。" />}
        {!loading && !error && projection && <>
          <div className="insp-spec-status"><b>{statusLabel}</b><span>rev {projection.revision}</span>{projection.pendingConfirmations.total > 0 && <em>待确认 {projection.pendingConfirmations.total}</em>}</div>
          <Section title="目标"><p className="insp-text">{projection.goal || (projection.status === 'draft' ? '目标待生成。' : '本会话未记录目标。')}</p></Section>
          <Section title="输入"><p className="insp-text">{projection.constraints.length || projection.inputs.length ? [...projection.constraints, ...projection.inputs].join(' · ') : '暂无输入约束。'}</p></Section>
          <section className="insp-block">
            <SectionHeader title="执行会话" meta={`共 ${projection.tasks.done.total + projection.tasks.running.total + projection.tasks.pending.total} · 本次 ${projection.tasks.done.items.length + projection.tasks.running.items.length + projection.tasks.pending.items.length}`} />
            <ExecutionGroup title="已完成" tasks={groups.done} defaultCount={3} tone="done" emptyTitle="暂无已完成任务" emptyDescription="任务完成后会出现在这里。" onTaskClick={(task) => onTaskClick?.({ id: task.id, title: task.title })} />
            <ExecutionGroup title="进行中" tasks={groups.running} defaultCount={3} tone="running" emptyTitle="暂无进行中任务" emptyDescription="任务开始后会出现在这里。" onTaskClick={(task) => onTaskClick?.({ id: task.id, title: task.title })} />
            <ExecutionGroup title="未开始" tasks={groups.queued} defaultCount={3} tone="pending" emptyTitle="暂无未开始任务" emptyDescription="新任务会先排在这里。" />
          </section>
          <section className="insp-block">
            <SectionHeader title="交付物" meta={deliverables.length} />
            {deliverables.length === 0 ? <EmptyState title="暂无交付物" description="报告、文档、表格或文件会出现在这里。" /> : (
              <List>{deliverables.slice(0, 8).map((artifact) => <DeliverableItem key={artifact.id} artifact={{ id: artifact.id, name: artifact.name, createdAt: artifact.createdAt ?? 0, mime: 'application/octet-stream', size: 0 }} onOpen={onArtifactOpen ? () => onArtifactOpen(artifact.id) : undefined} downloadUrl={artifact.downloadUrl} />)}</List>
            )}
          </section>
        </>}
      </div>
      <div className="insp-rail" aria-label="概览导航">
        <button type="button" className="active" title="概览">☰</button>
        <button type="button" title="消息">◷</button>
        <button type="button" title="交付物">▤</button>
      </div>
    </aside>
  )
}

export function RightPanel(props: React.ComponentProps<typeof OverviewPanel>): React.ReactNode {
  return <OverviewPanel {...props} />
}
