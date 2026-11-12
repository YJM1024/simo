import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  connectEvents,
  createSessionDraft,
  getArtifacts,
  getOverview,
  getPermissions,
  getStats,
  getTasks,
  listMessages,
  listSessions,
  renameSession,
  sendChat,
  submitCardAction,
} from './api'
import type { Artifact, Card, Message, PermissionState, Session, SessionOverview, StatsBucket, StatsTotals, Task } from './types'
import { Composer, Icon, MessageItem, RightPanel, Segmented, Sidebar, StatusBar, Timeline, WorkbenchChart, formatTime, formatTokens } from './components'

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
  const [activeId, setActiveId] = useState('main')
  const [messages, setMessages] = useState<Message[]>([])
  const [overview, setOverview] = useState<SessionOverview | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [permissions, setPermissions] = useState<PermissionState | null>(null)
  const [connection, setConnection] = useState('connecting')
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [rightLoading, setRightLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeMessage, setActiveMessage] = useState(0)
  const [statsTotals, setStatsTotals] = useState<StatsTotals | null>(null)
  const [statsError, setStatsError] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [buckets, setBuckets] = useState<StatsBucket[]>([])
  const [workbenchError, setWorkbenchError] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const reloadTimer = useRef<number | null>(null)
  const wasDisconnected = useRef(false)

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
    const data = await listSessions()
    const roots = data.tree ?? data.sessions ?? []
    setSessions(roots)
    setSessionCount(data.sessions?.length ?? flattenTree(roots).length)
    if (!flatSessions.some((session) => session.id === activeId)) {
      const first = flattenTree(roots)[0]
      if (first) setActiveId(first.id)
    }
  }, [activeId, flatSessions])

  const loadMessages = useCallback(async (sessionId: string): Promise<void> => {
    setLoadingMessages(true)
    setError('')
    try {
      const data = await listMessages(sessionId)
      const list = [...(data.messages ?? [])].sort((a, b) => a.at - b.at)
      if (activeIdRef.current !== sessionId) return
      setMessages(list)
    } catch (err) {
      if (activeIdRef.current === sessionId) setError(err instanceof Error ? err.message : '消息加载失败')
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  const scrollToBottom = useCallback((): void => {
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
    if (stickToBottomRef.current) scrollToBottom()
  }, [messages, loadingMessages, activeId, scrollToBottom])

  useEffect(() => () => {
    if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
  }, [])

  const loadRight = useCallback(async (sessionId: string): Promise<void> => {
    setRightLoading(true)
    try {
      const [overviewData, tasksData, artifactsData] = await Promise.all([
        getOverview(sessionId).catch(() => ({ overview: undefined })),
        getTasks(sessionId).catch(() => ({ tasks: [] })),
        getArtifacts(sessionId).catch(() => ({ artifacts: [] })),
      ])
      if (activeIdRef.current !== sessionId) return
      setOverview(overviewData.overview ?? null)
      setTasks(tasksData.tasks ?? [])
      setArtifacts(artifactsData.artifacts ?? [])
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
    if (!activeId) return
    stickToBottomRef.current = true
    void getPermissions(activeId).then((data) => setPermissions(data.permissions ?? null)).catch(() => setPermissions(null))
    setMessages([])
    setOverview(null)
    setTasks([])
    setArtifacts([])
    void loadMessages(activeId)
    void loadRight(activeId)
  }, [activeId, loadMessages, loadRight])

  useEffect(() => {
    if (!activeId) return
    const dispose = connectEvents(activeId, {
      onStatus: (next) => {
        setConnection(next)
        if (next === 'closed') wasDisconnected.current = true
        if (next === 'open' && wasDisconnected.current) {
          wasDisconnected.current = false
          void loadMessages(activeIdRef.current)
        }
      },
      onDelta: ({ id, delta }) => {
        setMessages((current) => {
          const index = current.findIndex((message) => message.id === id)
          if (index < 0) {
            return [...current, { id, sessionId: activeIdRef.current, role: 'agent', text: delta, at: Date.now(), status: 'streaming', agentId: 'simo' }]
          }
          const next = [...current]
          next[index] = { ...next[index], text: `${next[index].text}${delta}`, status: 'streaming' }
          return next
        })
        if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(() => { void loadMessages(activeIdRef.current) }, 1400)
      },
    })
    return () => {
      dispose()
      if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
    }
  }, [activeId, loadMessages])

  useEffect(() => {
    if (page !== 'workbench') return
    setWorkbenchError('')
    void getStats('messages')
      .then(applyStats)
      .catch((err: unknown) => setWorkbenchError(err instanceof Error ? err.message : '统计加载失败'))
  }, [page])

  const jumpToMessage = (index: number): void => {
    const node = document.querySelectorAll<HTMLElement>('.chat-scroll .msg')[index]
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveMessage(index)
  }

  const syncTimeline = (): void => {
    const scroller = scrollerRef.current
    if (!scroller) return
    stickToBottomRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 64
    const nodes = [...scroller.querySelectorAll<HTMLElement>('.msg')]
    const top = scroller.getBoundingClientRect().top + 64
    let next = 0
    nodes.forEach((node, index) => { if (node.getBoundingClientRect().top <= top) next = index })
    setActiveMessage(next)
  }

  const send = async (text: string): Promise<void> => {
    const sessionId = activeIdRef.current
    setError('')
    try {
      await sendChat(sessionId, text)
      await loadMessages(sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送失败')
      throw err
    }
  }

  const handleCardAction = async (card: Card, action: string, payload: Record<string, unknown>): Promise<void> => {
    await submitCardAction(card.id, action, payload)
    await loadMessages(activeIdRef.current)
    await loadRight(activeIdRef.current)
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

  const chartBuckets = buckets.filter((bucket) => bucket.messages > 0 || bucket.tokens > 0).slice(-10)
  const recentSessions = [...flatSessions].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)
  const quotaPct = statsTotals?.tokens ? Math.min(100, Math.max(1, Math.round(statsTotals.tokens / 100000 * 100))) : 0

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="mark" /><b>司墨</b><span>v4.1</span></div>
        <Sidebar sessions={sessions} activeId={activeId} onSelect={setActiveId} onRename={rename} onCreate={() => void createSession()} onRefresh={() => void loadSessions()} connection={connection} usageTotal={statsTotals?.tokens ?? null} quotaPct={quotaPct} sessionCount={sessionCount || flatSessions.length} messageCount={statsTotals?.messages ?? null} statsError={statsError} />
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb">司墨 / <b>{page === 'chat' ? activeSession?.title ?? '主会话' : '工作台'}</b></div>
          <Segmented value={page} onChange={setPage} />
          <div className="top-right">
            <span className="status"><i className={`connection-dot ${connection === 'open' ? 'open' : ''}`} />{connection === 'open' ? '已连接' : '连接中'}</span>
            <button type="button" className="icon-btn" aria-label="设置" title="设置"><Icon name="gear" /></button>
            <span className="ok-avatar">Y</span>
          </div>
        </header>

        {page === 'chat' ? (
          <section className="page-chat" aria-label="对话">
            <div className="context">
              <div className="context-title"><h1>{activeSession?.title ?? '主会话'}</h1><span className="muted">主窗口 · 聚合视图</span></div>
              <span className="seg"><button type="button" className="active">仅本会话</button><button type="button" disabled title="当前版本仅加载当前会话">含子会话</button></span>
            </div>
            <div className="chat">
              <div className="chat-col">
                <div className="chat-tabs"><span className="chat-chip">对话</span></div>
                <div className="chat-body">
                  <div className="chat-content">
                    <Timeline messages={messages} active={activeMessage} onJump={jumpToMessage} />
                    <div className="chat-scroll" ref={scrollerRef} onScroll={syncTimeline}>
                      <div className="chat-inner">
                        {error && <p className="err-text" role="alert">{error}</p>}
                        {loadingMessages && messages.length === 0 && <p className="loading">消息加载中…</p>}
                        {!loadingMessages && messages.length === 0 && (
                          <div className="chat-empty"><div className="empty-mark" aria-hidden="true" /><h2>开始和司墨对话</h2><p>说需求、记信息、派任务，过程和结果都会回流到这里。</p></div>
                        )}
                        {messages.map((message) => <MessageItem key={message.id} message={message} onCardAction={handleCardAction} />)}
                      </div>
                    </div>
                  </div>
                </div>
                <Composer disabled={!activeId} onSend={send} />
              </div>
              <RightPanel session={activeSession} overview={overview} tasks={tasks} artifacts={artifacts} loading={rightLoading} />
            </div>
          </section>
        ) : (
          <section className="page-workbench" aria-label="工作台">
            <div className="page"><div className="page-inner">
              <div className="page-head"><h1>工作台</h1><p>用量与最近活动，来自真实 API。</p></div>
              {workbenchError && <p className="err-text" role="alert">{workbenchError}</p>}
              <div className="section-title"><h2>用量</h2><span>当前实例</span></div>
              <div className="grid-3">
                <div className="card"><span className="kicker">Token</span><div className="metric">{statsTotals ? formatTokens(statsTotals.tokens) : '—'}</div><p>{statsTotals ? `消息 ${statsTotals.messages} 条 · 任务 ${statsTotals.tasks} 个` : '统计加载中…'}</p></div>
                <div className="card"><span className="kicker">会话</span><div className="metric">{sessionCount || flatSessions.length}</div><p>{statsTotals ? `${statsTotals.messages} 条统计消息` : '统计加载中…'}</p></div>
                <div className="card"><span className="kicker">权限</span><div className="metric">{permissions?.sandbox ?? '—'}</div><p>审批 {permissions?.approval ?? '—'}</p></div>
              </div>
              <div className="section-title"><h2>每日消息</h2><span>最近 {chartBuckets.length} 天</span></div>
              {chartBuckets.length === 0 ? <div className="empty"><p>暂无统计数据。</p></div> : <WorkbenchChart buckets={chartBuckets} />}
              <div className="section-title"><h2>最近活动</h2><span>{recentSessions.length} 个会话</span></div>
              <div className="list">
                {recentSessions.length === 0 ? <div className="empty"><p>暂无会话。</p></div> : recentSessions.map((session) => (
                  <div className="row" key={session.id}><span className="kind">会话</span><span className="title">{session.title}</span><span className="time">{formatTime(session.createdAt)}</span></div>
                ))}
              </div>
            </div></div>
          </section>
        )}
      </div>
      <StatusBar connection={connection} />
    </div>
  )
}
