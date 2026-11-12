import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  connectEvents,
  type ChatEvents,
  archiveSession,
  createSessionDraft,
  getArtifactContent,
  searchMessages,
  unarchiveSession,
  getPermissions,
  getAllSessionMessages,
  getDeliverables,
  getSpecProjection,
  getStats,
  listMessages,
  listSessions,
  renameSession,
  sendChat,
  submitCardAction,
} from './api'
import type { Card, Message, PermissionState, Session, StatsBucket, StatsTotals } from './types'
import { Composer, ConversationPanel, EmptyState, ErrorState, Icon, LoadingState, MessageItem, RightPanel, Segmented, Sidebar, StatusBar, TimelineGroups, WorkbenchChart, formatTime, formatTokens } from './components'

type Page = 'chat' | 'workbench'

function flattenTree(roots: Session[]): Session[] {
  const result: Session[] = []
  const walk = (nodes: Session[]): void => {
    for (const node of nodes) {
      result.push(node)
      walk(node.children ?? [])
    }
  }
  walk(roots)
  return result
}

function extractSessionId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  if (typeof obj.id === 'string') return obj.id
  if (typeof obj.sessionId === 'string') return obj.sessionId
  if (obj.session && typeof obj.session === 'object') return extractSessionId(obj.session)
  return null
}

export default function App(): React.ReactNode {
  const [page, setPage] = useState<Page>('chat')
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [sessionsError, setSessionsError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIds, setSearchIds] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const [activeId, setActiveId] = useState('main')
  const [messages, setMessages] = useState<Message[]>([])
  const [ancestorMessages, setAncestorMessages] = useState<Message[]>([])
  const [ancestorLoading, setAncestorLoading] = useState(false)
  const [ancestorError, setAncestorError] = useState('')
  const [emptyAncestorIds, setEmptyAncestorIds] = useState<Set<string>>(new Set())
  const [activityAt, setActivityAt] = useState<Record<string, number>>({})
  const prependAnchorRef = useRef<{ scrollTop: number; scrollHeight: number; id: string; offset: number } | null>(null)
  const [projection, setProjection] = useState<import('./types').SessionSpecProjection | null>(null)
  const [userDeliverables, setUserDeliverables] = useState<import('./api').UserDeliverable[]>([])
  const [deliverablesLoading, setDeliverablesLoading] = useState(true)
  const [deliverablesError, setDeliverablesError] = useState('')
  const [permissions, setPermissions] = useState<PermissionState | null>(null)
  const [connection, setConnection] = useState('connecting')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [rightLoading, setRightLoading] = useState(false)
  const [rightError, setRightError] = useState('')
  const [error, setError] = useState('')
  const [activeMessage, setActiveMessage] = useState(0)
  const [statsTotals, setStatsTotals] = useState<StatsTotals | null>(null)
  const [statsError, setStatsError] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [buckets, setBuckets] = useState<StatsBucket[]>([])
  const [workbenchError, setWorkbenchError] = useState('')
  const [workbenchLoading, setWorkbenchLoading] = useState(false)
  const [statsRefresh, setStatsRefresh] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const restoreScrollRef = useRef<number | null>(null)
  const prevMessageCountRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)
  const [unread, setUnread] = useState(0)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const reloadTimer = useRef<number | null>(null)
  const wasDisconnected = useRef(false)
  const eventsRef = useRef<ChatEvents | null>(null)
  const ignoredReplyIds = useRef<Set<string>>(new Set())

  const flatSessions = useMemo(() => flattenTree(sessions), [sessions])
  const activeSession = flatSessions.find((session) => session.id === activeId) ?? null

  const applyStats = useCallback((data: { buckets?: StatsBucket[]; totals?: StatsTotals }): void => {
    const buckets = data.buckets ?? []
    const summed = buckets.reduce((acc, bucket) => ({
      tokens: acc.tokens + (bucket.tokens ?? 0),
      messages: acc.messages + (bucket.messages ?? 0),
      tasks: acc.tasks + (bucket.tasks ?? 0),
    }), { tokens: 0, messages: 0, tasks: 0 })
    const totals = data.totals && (data.totals.tokens > 0 || summed.tokens === 0) ? data.totals : summed
    setStatsTotals(totals)
    setBuckets(buckets)
    setStatsError('')
  }, [])

  const loadSessions = useCallback(async (): Promise<void> => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
    const data = await listSessions()
    const roots = data.tree ?? data.sessions ?? []
    setSessions(roots)
    setSessionCount(data.sessions?.length ?? flattenTree(roots).length)
    if (!flattenTree(roots).some((session) => session.id === activeIdRef.current)) {
      const first = flattenTree(roots)[0]
      if (first) setActiveId(first.id)
    }
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : '会话加载失败')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (sessionId: string): Promise<void> => {
    setLoadingMessages(true)
    setError('')
    try {
      const data = await listMessages(sessionId)
      const list = [...(data.messages ?? [])].sort((a, b) => a.at - b.at)
      if (activeIdRef.current !== sessionId) return
      setMessages((current) => {
        const map = new Map(current.map((message) => [message.id, message]))
        for (const message of list) map.set(message.id, message)
        return [...map.values()].sort((a, b) => a.at - b.at)
      })
    } catch (err) {
      if (activeIdRef.current === sessionId) setError(err instanceof Error ? err.message : '消息加载失败')
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const scrollToBottom = useCallback((): void => {
    restoreScrollRef.current = null
    setUnread(0)
    setAtBottom(true)
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(() => {
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollTop = scroller.scrollHeight
      scrollRafRef.current = requestAnimationFrame(() => {
        const next = scrollerRef.current
        if (next) next.scrollTop = next.scrollHeight
        scrollRafRef.current = null
      })
    })
  }, [])

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current
    const scroller = scrollerRef.current
    if (!anchor || !scroller) return
    prependAnchorRef.current = null
    const apply = (): void => {
      const target = anchor.id ? scroller.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`) : null
      const nextTop = target ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top : null
      scroller.scrollTop = nextTop !== null ? anchor.scrollTop + (nextTop - anchor.offset) : anchor.scrollTop + (scroller.scrollHeight - anchor.scrollHeight)
    }
    apply()
    requestAnimationFrame(apply)
  }, [ancestorMessages])

  useLayoutEffect(() => {
    if (restoreScrollRef.current !== null) {
      if (loadingMessages || messages.length === 0) return
      const target = restoreScrollRef.current
      restoreScrollRef.current = null
      const apply = (): void => { const scroller = scrollerRef.current; if (scroller) scroller.scrollTop = target }
      apply()
      requestAnimationFrame(apply)
      return
    }
    if (stickToBottomRef.current) scrollToBottom()
  }, [messages, loadingMessages, activeId, scrollToBottom])

  useEffect(() => {
    const previous = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length > previous && !stickToBottomRef.current) setUnread((value) => value + (messages.length - previous))
  }, [messages])

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
  }, [])

  const loadRight = useCallback(async (sessionId: string): Promise<void> => {
    setRightLoading(true)
    setRightError('')
    try {
      const data = await getSpecProjection(sessionId, 3)
      if (activeIdRef.current === sessionId) setProjection(data)
    } catch (err) {
      setRightError(err instanceof Error ? err.message : '右栏数据加载失败，可稍后刷新重试')
    } finally {
      setRightLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSessions().catch((err: unknown) => setError(err instanceof Error ? err.message : '会话加载失败'))
    void getPermissions('main').then((data) => setPermissions(data.permissions ?? null)).catch(() => setPermissions(null))
    void getStats('messages').then(applyStats).catch((err: unknown) => setStatsError(err instanceof Error ? err.message : '统计加载失败'))
  }, [loadSessions, applyStats])

  useEffect(() => {
    setDeliverablesLoading(true)
    setDeliverablesError('')
    void getDeliverables()
      .then((data) => setUserDeliverables(data.deliverables ?? []))
      .catch((err: unknown) => setDeliverablesError(err instanceof Error ? err.message : '交付物加载失败'))
      .finally(() => setDeliverablesLoading(false))
  }, [])

  useEffect(() => {
    if (!activeId) return
    const saved = scrollPositionsRef.current.get(activeId)
    restoreScrollRef.current = saved ?? null
    stickToBottomRef.current = saved === undefined
    void getPermissions(activeId).then((data) => setPermissions(data.permissions ?? null)).catch(() => setPermissions(null))
    setMessages([])
    setAncestorMessages([])
    setAncestorError('')
    setEmptyAncestorIds(new Set())
    setAncestorLoading(false)
    setProjection(null)
    void loadMessages(activeId)
    void loadRight(activeId)
  }, [activeId, loadMessages, loadRight])

  useEffect(() => {
    if (!activeId) return
    const events = connectEvents(activeId, {
      onStatus: (next) => {
        setConnection(next)
        if (next === 'reconnecting') wasDisconnected.current = true
        if (next === 'open' && wasDisconnected.current) {
          wasDisconnected.current = false
          void loadMessages(activeIdRef.current)
        }
      },
      onDelta: ({ id, delta }) => {
        if (ignoredReplyIds.current.has(id)) return
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === id)
          if (index < 0) {
            return [...current, { id, sessionId: activeIdRef.current, role: 'agent', text: delta, at: Date.now(), status: 'streaming', agentId: 'simo' }]
          }
          const existing = current[index]
          if (existing.status !== 'streaming' && existing.text.endsWith(delta)) return current
          const next = [...current]
          next[index] = { ...existing, text: `${existing.text}${delta}`, status: 'streaming' }
          return next
        })
        if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(() => { void loadMessages(activeIdRef.current) }, 1400)
      },
    })
    eventsRef.current = events
    return () => {
      events.close()
      eventsRef.current = null
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    }
  }, [activeId, loadMessages])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchIds(null); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    const timer = window.setTimeout(() => {
      void searchMessages(q)
        .then((data) => { if (!cancelled) setSearchIds(new Set((data.messages ?? []).map((message) => message.sessionId))) })
        .catch(() => { if (!cancelled) setSearchIds(new Set()) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [searchQuery])

  useEffect(() => {
    if (page !== 'workbench') return
    setWorkbenchError('')
    setWorkbenchLoading(true)
    void getStats('messages')
      .then(applyStats)
      .catch((err: unknown) => setWorkbenchError(err instanceof Error ? err.message : '统计加载失败'))
      .finally(() => setWorkbenchLoading(false))
  }, [page, applyStats, statsRefresh])

  const jumpToMessage = (index: number): void => {
    const node = document.querySelectorAll<HTMLElement>('.conversation-scroll .msg')[index]
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveMessage(index)
  }

  const syncTimeline = (): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    stickToBottomRef.current = distance < 64
    setAtBottom(distance < 64)
    if (distance < 64) setUnread(0)
    scrollPositionsRef.current.set(activeIdRef.current, scroller.scrollTop)
    const nodes = [...scroller.querySelectorAll<HTMLElement>('.msg')]
    const top = scroller.getBoundingClientRect().top + 64
    let next = 0
    nodes.forEach((node, index) => { if (node.getBoundingClientRect().top <= top) next = index })
    setActiveMessage(next)
  }

  useEffect(() => {
    const onResize = (): void => { requestAnimationFrame(() => syncTimeline()) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const stopStreaming = useCallback((): void => {
    const streaming = messages.filter((message) => message.status === 'streaming')
    for (const message of streaming) ignoredReplyIds.current.add(message.id)
    eventsRef.current?.stop()
    setMessages((current) => current.map((message) => message.status === 'streaming' ? { ...message, status: 'stopped' } : message))
  }, [messages])

  const send = async (text: string): Promise<void> => {
    const sessionId = activeIdRef.current
    setError('')
    try {
      await sendChat(sessionId, text)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
      throw err
    }
    try {
      await loadMessages(sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '消息刷新失败')
    }
  }

  const handleCardAction = async (card: Card, action: string, payload: Record<string, unknown>): Promise<void> => {
    if (activeSession?.archived) { setError('已归档会话为只读，不能提交卡片'); return }
    await submitCardAction(card.id, action, payload)
    await loadMessages(activeIdRef.current)
    await loadRight(activeIdRef.current)
  }

  const toggleArchive = async (id: string, archived: boolean): Promise<void> => {
    if (archived) await archiveSession(id)
    else await unarchiveSession(id)
    await loadSessions()
  }

  const openArtifact = async (id: string): Promise<void> => {
    try {
      const target = projection?.deliverables.items.find((item) => item.id === id) ?? userDeliverables.find((item) => item.id === id)
      if (target?.previewUrl) { window.open(target.previewUrl, '_blank', 'noopener,noreferrer'); return }
      if (target?.downloadUrl) { window.open(target.downloadUrl, '_blank', 'noopener,noreferrer'); return }
      const text = await getArtifactContent(id)
      const win = window.open('', '_blank', 'noopener,noreferrer')
      if (win) { win.document.write(`<pre style="white-space:pre-wrap;font:14px/1.6 Consolas,monospace;padding:24px">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] ?? c))}</pre>`); win.document.close() }
    } catch (err) {
      setRightError(err instanceof Error ? err.message : '交付物打开失败')
    }
  }

  const loadAncestor = async (): Promise<void> => {
    if (!nextParent || ancestorLoading) return
    const scroller = scrollerRef.current
    if (scroller) {
      const top = scroller.getBoundingClientRect().top
      const nodes = [...scroller.querySelectorAll<HTMLElement>('.msg')]
      const visible = nodes.find((node) => node.getBoundingClientRect().bottom > top + 1)
      prependAnchorRef.current = {
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        id: visible?.dataset.messageId ?? '',
        offset: visible ? visible.getBoundingClientRect().top - top : 0,
      }
    }
    setAncestorLoading(true)
    setAncestorError('')
    try {
      const data = await getAllSessionMessages(nextParent.id)
      const incoming = (data.messages ?? []).filter((message) => !messages.some((existing) => existing.id === message.id) && !ancestorMessages.some((existing) => existing.id === message.id))
      if (incoming.length === 0) { setAncestorError('上级没有消息'); setEmptyAncestorIds((current) => new Set(current).add(nextParent.id)) }
      else setAncestorMessages((current) => [...incoming, ...current].sort((a, b) => a.at - b.at))
      stickToBottomRef.current = false
    } catch (err) {
      const raw = err instanceof Error ? err.message : '上级消息加载失败'
      setAncestorError(raw.includes('413') ? '消息过多，暂不能完整加载' : raw)
    } finally {
      setAncestorLoading(false)
    }
  }

  const locateTask = (task: { title: string; id: string }): void => {
    const index = messages.findIndex((message) => message.text.includes(task.title) || (task.id && message.text.includes(task.id)))
    if (index >= 0) { setActiveMessage(index); const node = document.querySelectorAll<HTMLElement>('.chat-scroll .msg')[index]; node?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  }

  const rename = async (id: string, title: string): Promise<void> => {
    await renameSession(id, title)
    await loadSessions()
  }

  const createSession = async (): Promise<void> => {
    const root = sessions.find((session) => session.parentId === '' || session.parentId === 'main') ?? sessions[0]
    try {
      const created = await createSessionDraft(root?.id ?? 'main', '新会话')
      const id = extractSessionId(created)
      if (id) {
        setSessions((current) => [{ id, parentId: root?.id ?? 'main', title: '新会话', createdAt: Date.now(), archived: 0, pinned: false }, ...current])
        setActiveId(id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建会话失败')
    }
  }

  const flatAll = useMemo(() => flattenTree(sessions), [sessions])
  const activeMeta = flatAll.find((session) => session.id === activeId) ?? null
  const loadedAncestorIds = useMemo(() => new Set(ancestorMessages.map((message) => message.sessionId)), [ancestorMessages])
  const visitedAncestorIds = useMemo(() => new Set([...loadedAncestorIds, ...emptyAncestorIds]), [loadedAncestorIds, emptyAncestorIds])
  const nextParent = useMemo(() => {
    let cursor = activeMeta
    while (cursor && cursor.parentId) {
      const parent = flatAll.find((session) => session.id === cursor?.parentId)
      if (!parent) return null
      if (!visitedAncestorIds.has(parent.id)) return parent
      cursor = parent
    }
    return null
  }, [activeMeta, flatAll, visitedAncestorIds])
  useEffect(() => {
    let cancelled = false
    void Promise.all(flatAll.map(async (session) => {
      try { const data = await getSpecProjection(session.id, 1); return [session.id, data.updatedAt] as const } catch { return [session.id, session.createdAt] as const }
    })).then((entries) => { if (!cancelled) setActivityAt(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [flatAll])

  const ancestorChain = useMemo(() => {
    const ids: string[] = []
    let cursor = activeMeta
    while (cursor && cursor.parentId) {
      const parent = flatAll.find((session) => session.id === cursor?.parentId)
      if (!parent) break
      ids.unshift(parent.id)
      cursor = parent
    }
    return ids.filter((id) => loadedAncestorIds.has(id))
  }, [activeMeta, flatAll, loadedAncestorIds])

  const switchSession = useCallback((sessionId: string): void => {
    const scroller = scrollerRef.current
    if (scroller) scrollPositionsRef.current.set(activeIdRef.current, scroller.scrollTop)
    setActiveId(sessionId)
  }, [])

  const chartBuckets = buckets.filter((bucket) => bucket.messages > 0 || bucket.tokens > 0).slice(-10)
  const recentSessions = [...flatSessions].sort((a, b) => (activityAt[b.id] ?? b.createdAt) - (activityAt[a.id] ?? a.createdAt)).slice(0, 6)
  const visibleWorkbenchArtifacts = userDeliverables
  const combinedMessages = useMemo(() => {
    const seen = new Set<string>()
    return [...ancestorMessages, ...messages].filter((message) => { if (seen.has(message.id)) return false; seen.add(message.id); return true }).sort((a, b) => a.at - b.at)
  }, [ancestorMessages, messages])
  const timelineGroupMessages = useMemo(() => {
    const order = new Map<string, number>()
    ancestorChain.forEach((id, index) => order.set(id, index))
    order.set(activeId, ancestorChain.length)
    return combinedMessages.map((message) => ({
      id: message.id, sessionId: message.sessionId, sessionTitle: message.sessionTitle ?? (flatAll.find((session) => session.id === message.sessionId)?.title ?? '会话'),
      sessionOrder: order.get(message.sessionId) ?? 0, isCurrentSession: message.sessionId === activeId,
      role: message.role, category: message.category as 'clarification' | 'progress' | 'confirmation' | 'result' | 'error' | undefined,
      at: message.at, dateKey: new Date(message.at).toISOString().slice(0, 10), summary: message.text,
    }))
  }, [combinedMessages, ancestorChain, activeId, flatAll])
  const quotaPct = statsTotals?.tokens ? Math.min(100, Math.max(1, Math.round(statsTotals.tokens / 100000 * 100))) : 0

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="mark" /><b>司墨</b><span>v4.1</span></div>
        <Sidebar sessions={sessions} activeId={activeId} onSelect={switchSession} onRename={rename} onCreate={() => void createSession()} onRefresh={() => void loadSessions()} connection={connection} loading={sessionsLoading} error={sessionsError} searchQuery={searchQuery} onSearch={setSearchQuery} searching={searching} searchIds={searchIds} onArchive={(id, archived) => void toggleArchive(id, archived)} usageTotal={statsTotals?.tokens ?? null} quotaPct={quotaPct} sessionCount={sessionCount || flatSessions.length} messageCount={statsTotals?.messages ?? null} statsError={statsError} />
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb">司墨 / <b>{page === 'chat' ? activeSession?.title ?? '主会话' : '工作台'}</b></div>
          <Segmented value={page} onChange={setPage} />
          <div className="top-right">
            <span className="status"><i className={`connection-dot ${connection === 'open' ? 'open' : ''}`} />{connection === 'open' ? '已连接' : connection === 'reconnecting' ? '重连中' : '连接中'}</span>
            <button type="button" className="icon-btn" aria-label="设置" title="设置"><Icon name="gear" /></button>
            <span className="ok-avatar">Y</span>
          </div>
        </header>

        {page === 'chat' ? (
          <section className="page-chat" aria-label="对话">
            <div className="context">
              <div className="context-title"><h1>{activeSession?.title ?? '主会话'}</h1><span className="muted">主窗口 · 聚合视图</span>{activeSession?.archived ? <span className="badge warning">已归档 · 只读</span> : null}</div>
              <span className="seg"><button type="button" className="active">仅本会话</button><button type="button" disabled title="当前版本仅加载当前会话">含子会话</button></span>
            </div>
            <div className="chat">
              <div className="chat-col">
                <div className="chat-tabs"><span className="chat-chip">对话</span></div>
                <div className="chat-body">
                  <ConversationPanel
                    timeline={<TimelineGroups messages={timelineGroupMessages} currentSessionId={activeId} activeMessageId={combinedMessages[activeMessage]?.id} onJump={(messageId) => { const index = combinedMessages.findIndex((message) => message.id === messageId); if (index >= 0) { jumpToMessage(index) } }} />}
                    state={loadingMessages && messages.length === 0 ? 'loading' : error && messages.length === 0 ? 'error' : messages.length === 0 ? 'empty' : 'ready'}
                    empty={<EmptyState title="开始和司墨对话" description="说需求、记信息、派任务，过程和结果都会回流到这里。" action={<button className="btn sm" type="button" onClick={() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus()}>发送第一条消息</button>} />}
                    error={<ErrorState title="消息加载失败" description={error} onRetry={() => void loadMessages(activeId)} />}
                    onRetry={() => void loadMessages(activeId)}
                    scrollRef={scrollerRef}
                    onScroll={syncTimeline}
                  >
                    <div className="chat-inner">
                      {nextParent && <div className="message-top"><button className="btn sm" type="button" disabled={ancestorLoading} aria-busy={ancestorLoading} onClick={() => void loadAncestor()}>{ancestorLoading ? '加载中…' : `显示上级会话：${nextParent.title}`}</button></div>}
                      {ancestorError && <p className="err-text" role="alert">{ancestorError}</p>}
                      {error && messages.length > 0 && <p className="err-text" role="alert">{error}</p>}
                      {combinedMessages.map((message, index) => {
                        const previous = combinedMessages[index - 1]
                        const divider = !previous || previous.sessionId !== message.sessionId
                        return <div key={message.id}>{divider && <div className="session-divider"><span>{message.sessionTitle ?? (message.sessionId === activeId ? activeSession?.title : '会话')}</span></div>}<MessageItem message={message} onCardAction={handleCardAction} readOnly={Boolean(activeSession?.archived) || message.sessionId !== activeId} /></div>
                      })}
                    </div>
                  </ConversationPanel>
                  {!atBottom && <button type="button" className="jump-bottom" onClick={scrollToBottom}>回到底部{unread > 0 ? ` · ${unread} 条新消息` : ''}</button>}
                </div>
                <Composer disabled={!activeId || Boolean(activeSession?.archived)} streaming={messages.some((message) => message.status === 'streaming')} onSend={send} onStop={stopStreaming} sendError={error} />
              </div>
              <RightPanel session={activeSession} projection={projection} loading={rightLoading} error={rightError} onRetry={() => void loadRight(activeId)} onTaskClick={locateTask} onArtifactOpen={(id) => void openArtifact(id)} />
            </div>
          </section>
        ) : (
          <section className="page-workbench" aria-label="工作台">
            <div className="page"><div className="page-inner">
              <div className="page-head"><h1>工作台</h1><p>用量与最近活动，来自真实 API。</p></div>
              {workbenchError && <ErrorState title="工作台加载失败" description={workbenchError} onRetry={() => setStatsRefresh((value) => value + 1)} />}
              <div className="section-title"><h2>用量</h2><span>当前实例</span></div>
              {workbenchLoading && !statsTotals && <LoadingState label="统计加载中…" />}
              <div className="grid-3">
                <div className="card"><span className="kicker">Token</span><div className="metric">{statsTotals ? formatTokens(statsTotals.tokens) : '—'}</div><p>{statsTotals ? `消息 ${statsTotals.messages} 条 · 任务 ${statsTotals.tasks} 个` : workbenchError ? '统计不可用' : '统计加载中…'}</p></div>
                <div className="card"><span className="kicker">会话</span><div className="metric">{statsTotals ? (sessionCount || flatSessions.length) : '—'}</div><p>{statsTotals ? `${statsTotals.messages} 条统计消息` : workbenchError ? '统计不可用' : '统计加载中…'}</p></div>
                <div className="card"><span className="kicker">权限</span><div className="metric">{permissions?.sandbox ?? '—'}</div><p>审批 {permissions?.approval ?? '—'}</p></div>
              </div>
              <div className="section-title"><h2>每日消息</h2><span>最近 {chartBuckets.length} 天</span></div>
              {chartBuckets.length === 0 ? <EmptyState title="暂无统计数据" description="有消息后每日趋势会出现在这里。" /> : <WorkbenchChart buckets={chartBuckets} />}
              <div className="section-title"><h2>最近活动</h2><span>{recentSessions.length} 个会话</span></div>
              <div className="list">
                {recentSessions.length === 0 ? <EmptyState title="暂无最近活动" description="新建或打开会话后会出现在这里。" /> : recentSessions.map((session) => (
                  <button className="row" type="button" key={session.id} onClick={() => { setActiveId(session.id); setPage('chat') }}><span className="kind">会话</span><span className="title">{session.title}</span><span className="time">{formatTime(session.createdAt)}</span></button>
                ))}
              </div>
              <div className="section-title"><h2>交付物</h2><span>用户产物</span></div>
              {deliverablesLoading && <LoadingState label="交付物加载中…" />}
              {!deliverablesLoading && deliverablesError && <ErrorState title="交付物加载失败" description={deliverablesError} onRetry={() => { setDeliverablesLoading(true); setDeliverablesError(''); void getDeliverables().then((data) => setUserDeliverables(data.deliverables ?? [])).catch((err: unknown) => setDeliverablesError(err instanceof Error ? err.message : '交付物加载失败')).finally(() => setDeliverablesLoading(false)) }} />}
              {!deliverablesLoading && !deliverablesError && visibleWorkbenchArtifacts.length === 0 && <EmptyState title="暂无交付物" description="报告、文档、表格或文件会出现在这里。" />}
              {!deliverablesLoading && !deliverablesError && visibleWorkbenchArtifacts.length > 0 && <div className="list">{visibleWorkbenchArtifacts.map((artifact) => <div className="deliverable-line" key={artifact.id}><button className="row" type="button" onClick={() => void openArtifact(artifact.id)}><span className="kind">文件</span><span className="title">{artifact.name}</span><span className="time">{formatTime(artifact.createdAt ?? 0)}</span></button>{artifact.downloadUrl && <a className="download-link" href={artifact.downloadUrl} download aria-label={`下载 ${artifact.name}`}>下载</a>}</div>)}</div>}
            </div></div>
          </section>
        )}
      </div>
      <StatusBar connection={connection} />
    </div>
  )
}
