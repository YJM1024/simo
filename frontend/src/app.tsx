import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  connectEvents,
  type ChatEvents,
  archiveSession,
  createSessionDraft,
  getArtifactContent,
  markSessionRead,
  unarchiveSession,
  getPermissions,
  getAllSessionMessages,
  getDeliverables,
  getMetrics,
  getSpecProjection,
  getStats,
  listMessages,
  listSessions,
  peekSpecProjection,
  pinSession,
  renameSession,
  sendChat,
  submitCardAction,
  unpinSession,
} from './api'
import type { Card, Message, PermissionState, Session, StatsBucket, StatsTotals } from './types'
import { publishTabSync, tabId, useTabSync, winsTabSyncTiebreak } from './tabsync'
import { Composer, ConversationPanel, EmptyState, ErrorState, Icon, LoadingState, MessageItem, MetricsDashboard, RightPanel, Segmented, Sidebar, StatusBar, TimelineGroups, WorkbenchChart, formatTime, formatTokens } from './components'

type Page = 'chat' | 'workbench'

/** 底部全局汇总的刷新节流窗口：窗口内连续到达的消息事件合并成一次 GET /api/stats。 */
const STATS_REFRESH_THROTTLE_MS = 1000

/** 主会话 id：没有可恢复的会话（从未选过、已删除或已归档）时的兜底。 */
const MAIN_SESSION_ID = 'main'

/**
 * 本标签上次的 active 会话，存 localStorage 供跨标签共享同一份：
 * 刷新后恢复它，而不是重置回主会话；挂载恢复不广播，避免把其它标签的 active 拉走。
 */
export const ACTIVE_SESSION_KEY = 'simo.active-session'

function readActiveSession(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY) || null
  } catch {
    return null
  }
}

function saveActiveSession(id: string): void {
  try {
    if (id) window.localStorage.setItem(ACTIVE_SESSION_KEY, id)
    else window.localStorage.removeItem(ACTIVE_SESSION_KEY)
  } catch {
    // 隐私模式或存储被禁用：退化为只保留内存状态，不影响会话切换本身。
  }
}

function flattenTree(roots: Session[]): Session[] {
  const result: Session[] = []
  const seen = new Set<string>()
  const walk = (nodes: Session[]): void => {
    for (const node of nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      result.push(node)
      walk(node.children ?? [])
    }
  }
  walk(roots)
  return result
}

/**
 * /api/sessions/tree 同时返回平铺的 sessions 数组与嵌套 tree，同一会话可能在两处各出现一次；
 * 渲染前按 id 去重（先出现者优先，子树跟随先出现者），避免侧栏出现重复行与重复计数。
 */
function dedupeTree(roots: Session[]): Session[] {
  const seen = new Set<string>()
  const walk = (nodes: Session[]): Session[] => {
    const next: Session[] = []
    for (const node of nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      const children = node.children ? walk(node.children) : node.children
      next.push(children === node.children ? node : { ...node, children })
    }
    return next
  }
  return walk(roots)
}

/** 平铺列表（搜索结果）按 id 去重，保留首次出现。 */
function dedupeSessions(list: Session[]): Session[] {
  const seen = new Set<string>()
  return list.filter((session) => {
    if (seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
}

/** 本地清除单个会话的未读标记（服务端已读成功后的即时反馈）；刷新页面时仍以后端 hasUnread 为准。 */
function clearUnread(roots: Session[], id: string): Session[] {
  let changed = false
  const next = roots.map((session) => {
    const children = session.children ? clearUnread(session.children, id) : session.children
    const cleared = session.id === id && session.hasUnread === true ? { ...session, hasUnread: false } : session
    const merged = children !== session.children ? { ...cleared, children } : cleared
    if (merged !== session) changed = true
    return merged
  })
  return changed ? next : roots
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
  /** 标题搜索的服务端结果；null = 未搜索，展示完整会话树。 */
  const [searchResults, setSearchResults] = useState<Session[] | null>(null)
  const [searching, setSearching] = useState(false)
  /** 搜索请求失败（区别于“搜索成功但没有命中”）：错误态可重试，且不得显示空态文案。 */
  const [searchError, setSearchError] = useState('')
  /** 递增即重试上一次搜索（searchQuery 不变）。 */
  const [searchRetry, setSearchRetry] = useState(0)
  // 刷新后先恢复上次的 active 会话（没有就按“主会话”占位），会话树返回后由 loadSessions 校正。
  const [activeId, setActiveId] = useState(() => readActiveSession() ?? MAIN_SESSION_ID)
  const restoringActiveRef = useRef<boolean | null>(null)
  if (restoringActiveRef.current === null) restoringActiveRef.current = readActiveSession() !== null
  /** 只有 true 的那次 activeId 变化来自用户主动切会话；挂载恢复与会话树校正都不广播。 */
  const userActiveChangeRef = useRef(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [ancestorMessages, setAncestorMessages] = useState<Message[]>([])
  const [ancestorLoading, setAncestorLoading] = useState(false)
  const ancestorLoadingRef = useRef(false)
  const ancestorRequestRef = useRef<Promise<void> | null>(null)
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
  /** 右栏当前已请求的 taskLimit；展开任务组补取后记 50（合同上限），切会话时归 3。 */
  const rightTaskLimitRef = useRef(3)
  const [error, setError] = useState('')
  // 失败回复的「重试」把触发它的用户消息填回输入框；seq 只用于让 Composer 感知重复点击。
  const [composerPrefill, setComposerPrefill] = useState<{ text: string; seq: number } | null>(null)
  const composerPrefillSeq = useRef(0)
  /** 侧栏操作（重命名/归档）的全局提示：这些操作在工作台页也可见，不能只依赖对话页的 err-text。 */
  const [opError, setOpError] = useState('')
  const [activeMessage, setActiveMessage] = useState(0)
  /**
   * 时间轴跳转后的钉住：末尾几条消息受滚动上限约束到不了视口顶部（真机 1600×1000 下
   * 第 69–74 条最多只能对齐第 68 条），平滑滚动触发的 onScroll 会把 active 重算回 68。
   * 钉住期内 syncTimeline 只同步滚动位置与贴底状态，不改 active；用户下一次手动滚动
   * （滚轮、触摸、拖动滚动条）立刻释放，另外 3 秒兜底，避免发送消息等程序滚动被长期挡住。
   */
  const pinnedActiveRef = useRef<{ index: number; until: number } | null>(null)
  const [statsTotals, setStatsTotals] = useState<StatsTotals | null>(null)
  const [statsError, setStatsError] = useState('')
  const [sessionCount, setSessionCount] = useState(0)
  const [buckets, setBuckets] = useState<StatsBucket[]>([])
  const [workbenchError, setWorkbenchError] = useState('')
  const [workbenchLoading, setWorkbenchLoading] = useState(false)
  const [metricsRange, setMetricsRange] = useState<'7d' | '30d'>('7d')
  const [metrics, setMetrics] = useState<import('./api').MetricsPayload | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)
  const [metricsError, setMetricsError] = useState('')
  const [statsRefresh, setStatsRefresh] = useState(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const scrollPositionsRef = useRef<Map<string, number>>(new Map())
  const restoreScrollRef = useRef<number | null>(null)
  const prevMessageCountRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)
  const [unread, setUnread] = useState(0)
  const remoteActiveRef = useRef(false)
  const lastActiveOpRef = useRef<{ at: number; tabId: string }>({ at: 0, tabId: '' })
  const eventIdsRef = useRef(new Set<string>())
  const sendingRef = useRef(false)
  /**
   * WS 续接游标：事件日志的数字序号（信封顶层 id），不是消息 id。
   * null 表示本页还没收到过任何带序号的事件，首次订阅不带 since。
   */
  const syncStateRef = useRef({ readCursor: {} as Record<string, number>, lastEventId: null as number | null, clientMutationId: '' })
  /** 每个会话最近一次被应用的读游标决策，用于同 at 时按 tabId 决胜；与 active 切换同一套规则。 */
  const lastReadOpRef = useRef<Record<string, { at: number; tabId: string }>>({})
  const pendingSendRef = useRef<{ sessionId: string; text: string; clientMutationId: string } | null>(null)
  const mutationSeqRef = useRef(0)
  const deltaSeqRef = useRef(new Map<string, number>())
  const remoteAncestorChainRef = useRef<Record<string, string>>({})
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const reloadTimer = useRef<number | null>(null)
  /** session_unread 广播的合并定时器：300ms 内的连续帧只触发一次列表刷新。 */
  const unreadTimer = useRef<number | null>(null)
  /**
   * 全局统计刷新的节流定时器：非 null 表示节流窗口仍开着，窗口内的事件直接丢弃。
   * 只在定时器回调里置 null，不用 state，避免 WS 回调因节流状态变化而重连。
   */
  const statsThrottleTimer = useRef<number | null>(null)
  /** 供 WS 回调读取最新搜索词（不把 searchQuery 放进 WS effect 依赖，避免每次输入重连）。 */
  const searchQueryRef = useRef(searchQuery)
  searchQueryRef.current = searchQuery
  const wasDisconnected = useRef(false)
  const eventsRef = useRef<ChatEvents | null>(null)
  const ignoredReplyIds = useRef<Set<string>>(new Set())

  const flatSessions = useMemo(() => flattenTree(sessions), [sessions])
  const activeSession = flatSessions.find((session) => session.id === activeId) ?? null
  // 供 effect 读取当前会话的草稿标记，而不把 sessions 放进 active-session effect 的依赖（否则每次列表刷新都会重载消息/右栏）。
  const activeSessionRef = useRef<Session | null>(activeSession)
  activeSessionRef.current = activeSession

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

  /**
   * 新消息到达后静默刷新底部汇总：走 applyStats 更新数字，但失败时不设置 statsError，
   * 只保留旧值并留一条 console 诊断，避免底部统计被一次后台失败打成错误态。
   */
  const refreshStatsQuietly = useCallback((): void => {
    void getStats('messages')
      .then((data) => applyStats(data))
      .catch((err: unknown) => {
        console.warn('全局统计刷新失败，保留旧值', err)
      })
  }, [applyStats])

  /**
   * 统计节流：窗口打开时立即刷新并关闭窗口 1 秒，窗口内的后续消息事件只丢弃不再请求。
   * 它只读 /api/stats，不写会话列表缓存、不设未读点，因此不会与会话列表刷新或未读点刷新互相触发。
   */
  const scheduleStatsRefresh = useCallback((): void => {
    if (statsThrottleTimer.current !== null) return
    statsThrottleTimer.current = window.setTimeout(() => {
      statsThrottleTimer.current = null
    }, STATS_REFRESH_THROTTLE_MS)
    refreshStatsQuietly()
  }, [refreshStatsQuietly])

  const loadSessions = useCallback(async (): Promise<void> => {
    setSessionsLoading(true)
    setSessionsError('')
    try {
    const data = await listSessions()
    // 304：服务端列表与上次一致，保留当前数组引用与选中态；不能走“清空再填充”，否则界面会闪空。
    if (data.notModified) return
    const roots = dedupeTree(data.tree ?? data.sessions ?? [])
    const flat = flattenTree(roots)
    setSessions(roots)
    // 计数以去重后的整棵树为准（含深层子会话）；不采信 data.sessions 的平铺长度，避免同一会话计两次。
    setSessionCount(flat.length)
    if (restoringActiveRef.current) {
      // 只在首次成功加载时校验“刷新恢复”的会话：它可能已被删除或归档，此时回落主会话。
      restoringActiveRef.current = false
      const restored = flat.find((session) => session.id === activeIdRef.current)
      if (!restored || restored.archived === 1) {
        const fallback = flat.find((session) => session.id === MAIN_SESSION_ID && session.archived !== 1)
          ?? flat.find((session) => session.archived !== 1)
          ?? flat[0]
        if (fallback) {
          if (fallback.id !== activeIdRef.current) setActiveId(fallback.id)
        } else {
          setActiveId('')
        }
      }
      return
    }
    if (!flat.some((session) => session.id === activeIdRef.current)) {
      // 当前选中项不在树里：树非空时落到第一个会话，树为空时清空选中，避免继续加载旧的 main。
      setActiveId(flat[0]?.id ?? '')
    }
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : '会话加载失败')
    } finally {
      setSessionsLoading(false)
    }
  }, [])

  /**
   * 实时未读刷新：先刷新会话树（不打断当前会话），搜索态下再按当前 q 静默重查，
   * 让搜索结果里的未读点也跟上；q 响应慢/失败时保留旧结果，不冲掉输入。
   */
  const refreshSessions = useCallback(async (): Promise<void> => {
    await loadSessions()
    const q = searchQueryRef.current.trim()
    if (!q) return
    try {
      const data = await listSessions(q)
      if (searchQueryRef.current.trim() !== q) return
      // 304：搜索结果没变，保留旧数组与选中态
      if (data.notModified) return
      setSearchResults(dedupeSessions(data.sessions ?? (data.tree ? flattenTree(data.tree) : [])))
      setSearchError('')
    } catch {
      // 后台刷新失败不覆盖现有搜索结果，也不改动 searchQuery（用户输入优先）
    }
  }, [loadSessions])

  const retrySearch = useCallback((): void => setSearchRetry((value) => value + 1), [])

  const markRead = useCallback(async (sessionId: string): Promise<void> => {
    try {
      await markSessionRead(sessionId)
      setSessions((current) => clearUnread(current, sessionId))
    } catch (err) {
      setOpError(`标记已读失败：${err instanceof Error ? err.message : '请稍后重试'}`)
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
    const sessionId = activeIdRef.current
    const cursor = Math.max(0, ...messages.map((message) => message.at))
    const readCursor = Math.max(syncStateRef.current.readCursor[sessionId] ?? 0, cursor)
    syncStateRef.current.readCursor[sessionId] = readCursor
    // 本地读游标也是一次决策：只有它按同一 tiebreak 胜过已应用的决策时才写入，避免把更大的 tabId 降级。
    const decision = { at: readCursor, tabId }
    const applied = lastReadOpRef.current[sessionId]
    if (!applied || winsTabSyncTiebreak(decision, applied)) lastReadOpRef.current[sessionId] = decision
    publishTabSync({ type: 'read_cursor_changed', tabId, opId: `${tabId}:${Date.now()}`, at: readCursor, sessionId })
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
    // 增量校正：以"当前 scrollTop"为基准，只补上目标元素位置的变化。
    // 这样连续 apply（同步一次 + rAF 一次）是幂等的：第二次算出 delta 0，不会把第一次的修正写回旧值。
    const apply = (): void => {
      const target = anchor.id ? scroller.querySelector<HTMLElement>(`[data-message-id="${anchor.id}"]`) : null
      if (target) {
        const nextTop = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top
        scroller.scrollTop += nextTop - anchor.offset
        return
      }
      scroller.scrollTop += scroller.scrollHeight - anchor.scrollHeight
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

  useEffect(() => {
    // 先落盘：刷新后从同一份 localStorage 恢复本标签的 active 会话。
    saveActiveSession(activeId)
    const userInitiated = userActiveChangeRef.current
    userActiveChangeRef.current = false
    // 挂载恢复、会话树校正与远端同步都不广播；只有用户在本标签主动切会话才通知其它标签。
    if (!userInitiated || remoteActiveRef.current) { remoteActiveRef.current = false; return }
    lastActiveOpRef.current = { at: Date.now(), tabId }
    publishTabSync({ type: 'active_session_changed', tabId, opId: `${tabId}:${Date.now()}`, at: lastActiveOpRef.current.at, sessionId: activeId })
  }, [activeId])

  useTabSync((message) => {
    if (message.tabId === tabId) return
    if (message.type === 'active_session_changed') {
      const newer = winsTabSyncTiebreak(message, lastActiveOpRef.current)
      if (!newer || message.sessionId === activeIdRef.current) return
      lastActiveOpRef.current = { at: message.at, tabId: message.tabId }
      remoteActiveRef.current = true
      setActiveId(message.sessionId)
      setAncestorMessages([])
      setEmptyAncestorIds(new Set())
      return
    }
    if (message.type === 'read_cursor_changed' && message.sessionId === activeIdRef.current) {
      const sessionId = message.sessionId
      const cursor = syncStateRef.current.readCursor[sessionId] ?? 0
      const applied = lastReadOpRef.current[sessionId] ?? { at: cursor, tabId: '' }
      // 有 tabId 的帧走与 active 切换相同的 tiebreak；旧版本帧没有 tabId（兼容分支），沿用历史行为：at >= 本地游标即接受。
      const newer = message.tabId ? winsTabSyncTiebreak({ at: message.at, tabId: message.tabId }, applied) : message.at >= cursor
      if (!newer) return
      syncStateRef.current.readCursor[sessionId] = message.at
      if (message.tabId) lastReadOpRef.current[sessionId] = { at: message.at, tabId: message.tabId }
      setUnread(0)
    }
    if (message.type === 'ancestor_chain_changed' && message.sessionId === activeIdRef.current) {
      if (message.chain.length === 0) { setAncestorMessages([]); setEmptyAncestorIds(new Set()); remoteAncestorChainRef.current[message.sessionId] = ''; return }
      const key = message.chain.join('|')
      if (remoteAncestorChainRef.current[message.sessionId] === key) return
      remoteAncestorChainRef.current[message.sessionId] = key
      void (async () => {
        const incoming: Message[] = []
        for (const id of message.chain) {
          try { const data = await getAllSessionMessages(id); incoming.push(...(data.messages ?? [])) } catch { /* 单块失败不影响其他 */ }
        }
        setAncestorMessages((current) => {
          const map = new Map(current.map((item) => [item.id, item]))
          for (const item of incoming) map.set(item.id, item)
          return [...map.values()].sort((a, b) => a.at - b.at)
        })
      })()
    }
  }, [])

  const loadRight = useCallback(async (sessionId: string, taskLimit = 3, silent = false): Promise<void> => {
    // 同一会话同一 taskLimit 已有上一份投影：先占位再用 If-None-Match 条件请求。
    // 命中 304 时服务端没有新数据，占位内容原样保留；因此这类请求从一开始就不亮骨架，也不清空右栏。
    const cached = peekSpecProjection(sessionId, taskLimit)
    if (!silent) {
      if (cached) setProjection((current) => current ?? cached)
      setRightLoading(cached === null)
    }
    setRightError('')
    try {
      const result = await getSpecProjection(sessionId, taskLimit)
      if (activeIdRef.current === sessionId) {
        // 304 时 result.projection 就是同键缓存（与当前已显示的是同一份数据），保留它即可；
        // 200 时它是服务端最新数据。两种情况都不清空、不进错误态。
        setProjection((current) => result.projection ?? current)
        rightTaskLimitRef.current = taskLimit
      }
    } catch (err) {
      if (activeIdRef.current === sessionId) {
        setRightError(err instanceof Error ? err.message : '右栏数据加载失败，可稍后刷新重试')
        rightTaskLimitRef.current = 3
      }
    } finally {
      // 会话在请求期间被切走时，不要用旧请求的收尾把新会话的骨架关掉。
      if (!silent && activeIdRef.current === sessionId) setRightLoading(false)
    }
  }, [])

  // 展开任务组时若只拿到首页（total > items），按合同上限补取一次；silent 保住展开态，
  // 否则 loading 会卸载右栏内容，ExecutionGroup 的展开 state 随之丢失。
  const expandRightGroup = useCallback((): void => {
    if (rightTaskLimitRef.current >= 50) return
    rightTaskLimitRef.current = 50
    void loadRight(activeIdRef.current, 50, true)
  }, [loadRight])

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
    if (!activeId) {
      // 没有选中会话（例如会话树为空）：清掉上一轮的会话内容，避免中栏/右栏继续显示已不存在的会话。
      setMessages([])
      setAncestorMessages([])
      setAncestorError('')
      setEmptyAncestorIds(new Set())
      setAncestorLoading(false)
      ancestorLoadingRef.current = false
      ancestorRequestRef.current = null
      setProjection(null)
      setRightError('')
      setRightLoading(false)
      rightTaskLimitRef.current = 3
      setError('')
      setLoadingMessages(false)
      return
    }
    const saved = scrollPositionsRef.current.get(activeId)
    restoreScrollRef.current = saved ?? null
    stickToBottomRef.current = saved === undefined
    void getPermissions(activeId).then((data) => setPermissions(data.permissions ?? null)).catch(() => setPermissions(null))
    setMessages([])
    setAncestorMessages([])
    setAncestorError('')
    setEmptyAncestorIds(new Set())
    setAncestorLoading(false)
    ancestorLoadingRef.current = false
    ancestorRequestRef.current = null
    setProjection(null)
    rightTaskLimitRef.current = 3
    void loadMessages(activeId)
    // 草稿会话还没落库，spec-projection 只会 404：不发请求，右栏显示占位；首条消息物化后再加载。
    if (activeSessionRef.current?.draft !== true) void loadRight(activeId)
  }, [activeId, loadMessages, loadRight])

  // 进入会话即标记已读：只在服务端判定 hasUnread 时请求（POST /api/sessions/{id}/read，无 body），
  // 成功后本地即时清除该会话未读点；刷新页面后的未读状态仍完全以后端返回为准。
  useEffect(() => {
    const target = flatSessions.find((session) => session.id === activeId)
    if (!target?.hasUnread) return
    void markRead(activeId)
  }, [activeId, flatSessions, markRead])

  useEffect(() => {
    if (!activeId) return
    const events = connectEvents(activeId, {
      // since 是事件日志序号（数字），由 onCursor 从 WS 信封顶层 id 维护；消息 id 不能当游标。
      since: () => syncStateRef.current.lastEventId,
      onCursor: (eventId) => {
        const previous = syncStateRef.current.lastEventId
        if (previous === null || eventId > previous) syncStateRef.current.lastEventId = eventId
      },
      onError: (message) => {
        setConnection('error')
        setOpError(`实时订阅失败：${message}`)
      },
      onStatus: (next) => {
        setConnection(next)
        if (next === 'reconnecting') wasDisconnected.current = true
        if (next === 'open' && wasDisconnected.current) {
          wasDisconnected.current = false
          void loadMessages(activeIdRef.current)
        }
      },
      onEvent: ({ type, id }) => {
        // 已读事件来自其他标签页/端：刷新列表让未读点跟随服务端状态；它不带事件游标，不能写入 since
        if (type === 'session_read') { void loadSessions(); return }
        // 未读广播可能连续到达（一个会话一条）：合并 300ms 刷新一次，且不动当前会话/搜索词
        if (type === 'session_unread') {
          if (unreadTimer.current !== null) window.clearTimeout(unreadTimer.current)
          unreadTimer.current = window.setTimeout(() => {
            unreadTimer.current = null
            void refreshSessions()
          }, 300)
          // 未读广播背后就是一条新消息：底部汇总也要跟上（与列表刷新同一节流，不互相触发）。
          scheduleStatsRefresh()
          return
        }
        const key = `${type}:${id}`
        if (eventIdsRef.current.has(key)) return
        eventIdsRef.current.add(key)
        if (eventIdsRef.current.size > 500) eventIdsRef.current = new Set([...eventIdsRef.current].slice(-250))
        // 消息类事件意味着 /api/stats 的 messages/tokens 已变；节流后静默刷新底部汇总。
        if (type === 'message.created' || type === 'reply.done' || type === 'message.done') scheduleStatsRefresh()
        if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
        reloadTimer.current = window.setTimeout(() => { void loadMessages(activeIdRef.current) }, 300)
      },
      onDelta: ({ id, delta, seq }) => {
        if (ignoredReplyIds.current.has(id)) return
        if (typeof seq === 'number') { const prev = deltaSeqRef.current.get(id) ?? -1; if (seq <= prev) return; deltaSeqRef.current.set(id, seq) }
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
      if (unreadTimer.current !== null) { window.clearTimeout(unreadTimer.current); unreadTimer.current = null }
    }
  }, [activeId, loadMessages, loadSessions, refreshSessions, scheduleStatsRefresh])

  // 组件卸载时清掉统计节流窗口，避免定时器回调落在已卸载的组件上。
  useEffect(() => () => {
    if (statsThrottleTimer.current !== null) {
      window.clearTimeout(statsThrottleTimer.current)
      statsThrottleTimer.current = null
    }
  }, [])

  useEffect(() => {
    const q = searchQuery.trim()
    if (!q) { setSearchResults(null); setSearchError(''); setSearching(false); return }
    let cancelled = false
    setSearching(true)
    setSearchError('')
    const timer = window.setTimeout(() => {
      // 左栏搜索 = 标题搜索：GET /api/sessions?q=（服务端含子会话），不再默认调消息正文搜索
      void listSessions(q)
        .then((data) => {
          if (cancelled) return
          if (data.notModified) {
            // 304：列表没变，保留当前结果引用（同一引用 React 不重渲染，界面不闪空）；
            // 只有当前还没有结果（例如重挂载后命中旧缓存）时才用缓存体兜底。
            setSearchResults((current) => current ?? dedupeSessions(data.sessions ?? (data.tree ? flattenTree(data.tree) : [])))
          } else {
            setSearchResults(dedupeSessions(data.sessions ?? (data.tree ? flattenTree(data.tree) : [])))
          }
          setSearchError('')
        })
        .catch((err: unknown) => {
          if (cancelled) return
          // 失败 ≠ 空结果：置空结果并用 searchError 进入错误态；侧栏错误分支优先，不会落到空态文案
          setSearchResults([])
          setSearchError(err instanceof Error ? err.message : '请稍后重试')
        })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [searchQuery, searchRetry])

  useEffect(() => {
    if (page !== 'workbench') return
    setWorkbenchError('')
    setWorkbenchLoading(true)
    void getStats('messages')
      .then(applyStats)
      .catch((err: unknown) => setWorkbenchError(err instanceof Error ? err.message : '统计加载失败'))
      .finally(() => setWorkbenchLoading(false))
  }, [page, applyStats, statsRefresh])

  useEffect(() => {
    if (page !== 'workbench') return
    let cancelled = false
    setMetricsLoading(true)
    setMetricsError('')
    void getMetrics(metricsRange)
      .then((data) => { if (!cancelled) setMetrics(data) })
      .catch((err: unknown) => { if (!cancelled) setMetricsError(err instanceof Error ? err.message : '指标加载失败') })
      .finally(() => { if (!cancelled) setMetricsLoading(false) })
    return () => { cancelled = true }
  }, [page, metricsRange])

  const jumpToMessage = (index: number): void => {
    const node = document.querySelectorAll<HTMLElement>('.conversation-scroll .msg')[index]
    pinnedActiveRef.current = { index, until: performance.now() + 3000 }
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
    // 跳转后的平滑滚动全程都在重算 active；钉住期内保持点击的那一条，用户滚动或超时再交还。
    const pinned = pinnedActiveRef.current
    if (pinned && performance.now() < pinned.until) return
    pinnedActiveRef.current = null
    const nodes = [...scroller.querySelectorAll<HTMLElement>('.msg')]
    const top = scroller.getBoundingClientRect().top + 64
    let next = 0
    nodes.forEach((node, index) => { if (node.getBoundingClientRect().top <= top) next = index })
    setActiveMessage(next)
  }

  useEffect(() => {
    // 监听挂在 document 上而不是滚动容器本身：会话面板晚于首次 effect 挂载时，
    // 容器 ref 还是空的；按事件目标是否落在当前滚动容器内判断，晚挂载也能捕获。
    const releasePin = (event: Event): void => {
      const scroller = scrollerRef.current
      const target = event.target as Node | null
      if (scroller && target && (target === scroller || scroller.contains(target))) {
        pinnedActiveRef.current = null
      }
    }
    document.addEventListener('wheel', releasePin, { passive: true, capture: true })
    document.addEventListener('touchstart', releasePin, { passive: true, capture: true })
    document.addEventListener('pointerdown', releasePin, true)
    return () => {
      document.removeEventListener('wheel', releasePin, { capture: true })
      document.removeEventListener('touchstart', releasePin, { capture: true })
      document.removeEventListener('pointerdown', releasePin, true)
    }
  }, [])

  useEffect(() => {
    const onResize = (): void => { requestAnimationFrame(() => syncTimeline()) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const stopStreaming = useCallback((): void => {
    const streaming = messages.filter((message) => message.status === 'streaming')
    // Composer 的「停止」是全局停止（streaming 为真时只渲染一个按钮，app.tsx:1028），
    // 因此对每条流式消息各发一帧，由后端按 messageId 精确取消；只带 sessionId 会让
    // 后端退化为“停该会话最新一条”，多流并发时会停错。
    for (const message of streaming) {
      ignoredReplyIds.current.add(message.id)
      eventsRef.current?.stop(message.id)
    }
    if (streaming.length === 0) return
    setMessages((current) => current.map((message) => message.status === 'streaming' ? { ...message, status: 'stopped' } : message))
  }, [messages])

  const send = async (text: string): Promise<void> => {
    if (sendingRef.current) return
    sendingRef.current = true
    const sessionId = activeIdRef.current
    // 先记下发送前是否草稿：setSessions 清掉 draft 标记发生在 await loadMessages 之前，事后再读 ref 会拿到 false。
    const wasDraft = activeSessionRef.current?.draft === true
    setError('')
    // 同一次发送（重试/重连/失败重发）复用同一幂等键；只有新消息才生成新键。
    // 刷新后不要求跨会话保持，失败时保留 pending，成功后清除。
    const pending = pendingSendRef.current
    const clientMutationId = pending && pending.sessionId === sessionId && pending.text === text
      ? pending.clientMutationId
      : `${tabId}:${Date.now()}:${++mutationSeqRef.current}`
    pendingSendRef.current = { sessionId, text, clientMutationId }
    try {
      try {
        syncStateRef.current.clientMutationId = clientMutationId
        await sendChat(sessionId, text, clientMutationId)
      } catch (err) {
        setError(err instanceof Error ? err.message : '发送失败')
        // 继续抛给 Composer：失败时保留用户输入（与卡片动作一致，library.tsx:578-580）
        throw err
      }
      pendingSendRef.current = null
      // 首条消息已送达 → 服务端把草稿物化成库记录（draft.go MaterializeDraft），侧栏菜单恢复可用。
      setSessions((current) => current.map((session) => session.id === sessionId && session.draft ? { ...session, draft: false } : session))
      try {
        await loadMessages(sessionId)
      } catch (err) {
        setError(err instanceof Error ? err.message : '消息刷新失败')
      }
      // 只针对本次发送前仍是草稿的会话请求投影：物化后右栏从占位切到真实数据；普通会话不额外刷新。
      if (wasDraft) void loadRight(sessionId)
    } finally { sendingRef.current = false }
  }

  const handleCardAction = async (card: Card, action: string, payload: Record<string, unknown>): Promise<void> => {
    if (activeSession?.archived) { setError('已归档会话为只读，不能提交卡片'); return }
    setError('')
    try {
      await submitCardAction(card.id, action, payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : '卡片提交失败')
      // 继续抛给 CardBlock：保留卡片内联错误与「重试」态（library.tsx:254-261）
      throw err
    }
    await loadMessages(activeIdRef.current)
    await loadRight(activeIdRef.current)
  }

  const toggleArchive = async (id: string, archived: boolean): Promise<void> => {
    setOpError('')
    // 草稿只存在于服务端内存（draft.go CreateDraft），尚无可归档的库记录；归档接口对它只会 404。
    if (sessions.some((session) => session.id === id && session.draft)) {
      setOpError('发送第一条消息后可用')
      return
    }
    try {
      if (archived) await archiveSession(id)
      else await unarchiveSession(id)
    } catch (err) {
      setOpError(err instanceof Error ? err.message : (archived ? '归档失败' : '恢复失败'))
      return
    }
    // 归档成功后刷新列表；loadSessions 自身会把失败呈现为侧栏可重试的错误态，不会卡在加载中
    await loadSessions()
  }

  const togglePin = async (id: string, pinned: boolean): Promise<void> => {
    setOpError('')
    // AC-CONV-001-04：仅未归档会话可置顶。菜单已不渲染入口，这里再守一道，
    // 防止搜索结果等旧列表视图在会话被归档后仍拿着过期行触发置顶。
    // 用展平后的列表：sessions 只存根节点，子会话的归档状态在 children 里。
    if (flatSessions.some((session) => session.id === id && session.archived)) {
      setOpError('归档会话不可置顶')
      return
    }
    try {
      if (pinned) await pinSession(id)
      else await unpinSession(id)
    } catch (err) {
      setOpError(err instanceof Error ? err.message : (pinned ? '置顶失败' : '取消置顶失败'))
      return
    }
    // 置顶顺序以后端返回为准：重新拉取会话树，前端不做任何本地重排。
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
    if (!nextParent) return
    if (ancestorLoadingRef.current) return ancestorRequestRef.current ?? Promise.resolve()
    ancestorLoadingRef.current = true
    ancestorRequestRef.current = (async (): Promise<void> => {
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
      else {
        setAncestorMessages((current) => [...incoming, ...current].sort((a, b) => a.at - b.at))
        const chain = [...new Set([...ancestorMessages.map((message) => message.sessionId), nextParent.id])]
        publishTabSync({ type: 'ancestor_chain_changed', tabId, opId: `${tabId}:${Date.now()}`, at: Date.now(), sessionId: activeIdRef.current, chain })
      }
      stickToBottomRef.current = false
    } catch (err) {
      const raw = err instanceof Error ? err.message : '上级消息加载失败'
      setAncestorError(raw.includes('413') ? '消息过多，暂不能完整加载' : raw.includes('403') ? '无权读取该上级会话' : raw)
    } finally {
      ancestorLoadingRef.current = false
      ancestorRequestRef.current = null
      setAncestorLoading(false)
    }
    })()
    return ancestorRequestRef.current ?? Promise.resolve()
  }

  const locateTask = (task: { title: string; id: string; messageId?: string }): void => {
    const nodes = [...document.querySelectorAll<HTMLElement>('.conversation-scroll .msg')]
    const index = nodes.findIndex((node) => node.dataset.taskId === task.id) >= 0
      ? nodes.findIndex((node) => node.dataset.taskId === task.id)
      : task.messageId
        ? nodes.findIndex((node) => node.dataset.messageId === task.messageId)
        : nodes.findIndex((node) => (node.textContent ?? '').includes(task.title))
    if (index < 0) return
    setActiveMessage(index)
    const node = nodes[index]
    nodes.forEach((item) => item.classList.remove('is-flash'))
    node.classList.add('is-flash')
    window.setTimeout(() => node.classList.remove('is-flash'), 1200)
    const scroller = scrollerRef.current
    if (!scroller) return
    const box = node.getBoundingClientRect()
    const viewTop = scroller.getBoundingClientRect().top
    if (box.top < viewTop || box.bottom > viewTop + scroller.clientHeight) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const rename = async (id: string, title: string): Promise<void> => {
    setOpError('')
    try {
      await renameSession(id, title)
    } catch (err) {
      setOpError(err instanceof Error ? err.message : '重命名失败')
      // 继续抛给 Sidebar：由它在失败时保留编辑框与用户输入（library.tsx commit）
      throw err
    }
    await loadSessions()
  }

  const createSession = async (): Promise<void> => {
    const root = sessions.find((session) => session.parentId === '' || session.parentId === 'main') ?? sessions[0]
    try {
      const created = await createSessionDraft(root?.id ?? 'main', '新会话')
      const id = extractSessionId(created)
      if (id) {
        setSessions((current) => [{ id, parentId: root?.id ?? 'main', title: '新会话', createdAt: Date.now(), archived: 0, pinned: false, draft: true }, ...current.filter((session) => session.id !== id)])
        userActiveChangeRef.current = true
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
      // 草稿会话没有可投影的 SessionSpec，不请求（请求只会 404，还会把失败当成交互时间）。
      if (session.draft === true) return [session.id, session.createdAt] as const
      try { const data = await getSpecProjection(session.id, 1, false); return [session.id, data.projection?.updatedAt ?? session.createdAt] as const } catch { return [session.id, session.createdAt] as const }
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
    pinnedActiveRef.current = null
    userActiveChangeRef.current = true
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
  const retryFailedReply = (message: Message): void => {
    const index = combinedMessages.findIndex((item) => item.id === message.id)
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = combinedMessages[cursor]
      if (previous.sessionId !== message.sessionId || previous.role !== 'user') continue
      composerPrefillSeq.current += 1
      setComposerPrefill({ text: previous.text, seq: composerPrefillSeq.current })
      return
    }
  }
  const quotaPct = statsTotals?.tokens ? Math.min(100, Math.max(1, Math.round(statsTotals.tokens / 100000 * 100))) : 0
  // 行数字直接取会话对象上的 messageCount（后端按会话自身统计），底部汇总仍用 statsTotals.messages。

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="mark" /><b>司墨</b><span>v4.1</span></div>
        <Sidebar sessions={searchResults ?? sessions} activeId={activeId} onSelect={switchSession} onRename={rename} onCreate={() => void createSession()} onRefresh={() => void loadSessions()} connection={connection} loading={sessionsLoading} error={sessionsError} searchQuery={searchQuery} onSearch={setSearchQuery} searching={searching} searchError={searchError} onRetrySearch={retrySearch} onArchive={(id, archived) => void toggleArchive(id, archived)} onPin={(id, pinned) => void togglePin(id, pinned)} usageTotal={statsTotals?.tokens ?? null} quotaPct={quotaPct} sessionCount={sessionCount || flatSessions.length} archivedCount={flatSessions.filter((session) => session.archived === 1).length} messageCount={statsTotals?.messages ?? null} statsError={statsError} />
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="crumb">司墨 / <b>{page === 'chat' ? activeSession?.title ?? '未选择会话' : '工作台'}</b></div>
          <Segmented value={page} onChange={setPage} />
          <div className="top-right">
            <span className="status"><i className={`connection-dot ${connection === 'open' ? 'open' : connection === 'error' || connection === 'closed' ? 'closed' : ''}`} />{connection === 'open' ? '已连接' : connection === 'reconnecting' ? '重连中' : connection === 'error' ? '订阅失败' : connection === 'closed' ? '连接已关闭' : '连接中'}</span>
            <button type="button" className="icon-btn" aria-label="设置" title="设置"><Icon name="gear" /></button>
            <span className="ok-avatar">Y</span>
          </div>
        </header>

        {page === 'chat' ? (
          <section className="page-chat" aria-label="对话">
            <div className="context">
              <div className="context-title"><h1>{activeSession?.title ?? '未选择会话'}</h1><span className="muted">主窗口 · 聚合视图</span>{activeSession?.archived ? <span className="badge warning">已归档 · 只读</span> : null}</div>
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
                      {nextParent && <div className="message-top"><button className="btn sm" type="button" disabled={ancestorLoading} aria-busy={ancestorLoading} title={nextParent.title} aria-label={`显示上级会话：${nextParent.title}`} onClick={() => void loadAncestor()}>{ancestorLoading ? '加载中…' : '显示上级会话'}</button></div>}
                      {ancestorError && <p className="err-text" role="alert">{ancestorError}</p>}
                      {error && messages.length > 0 && <p className="err-text" role="alert">{error}</p>}
                      {combinedMessages.map((message, index) => {
                        const previous = combinedMessages[index - 1]
                        const divider = !previous || previous.sessionId !== message.sessionId
                        return <div key={message.id}>{divider && <div className="session-divider"><span>{message.sessionTitle ?? (message.sessionId === activeId ? activeSession?.title : '会话')}</span></div>}<MessageItem message={message} onCardAction={handleCardAction} readOnly={Boolean(activeSession?.archived) || message.sessionId !== activeId} onRetry={retryFailedReply} /></div>
                      })}
                    </div>
                  </ConversationPanel>
                  {!atBottom && <button type="button" className="jump-bottom" onClick={scrollToBottom}>回到底部{unread > 0 ? ` · ${unread} 条新消息` : ''}</button>}
                </div>
                <Composer disabled={!activeId || Boolean(activeSession?.archived)} streaming={messages.some((message) => message.status === 'streaming')} onSend={send} onStop={stopStreaming} prefill={composerPrefill ?? undefined} />
              </div>
              <RightPanel session={activeSession} projection={projection} loading={rightLoading} error={rightError} onRetry={() => void loadRight(activeId)} onTaskClick={locateTask} onArtifactOpen={(id) => void openArtifact(id)} onExpandGroup={expandRightGroup} />
            </div>
          </section>
        ) : (
          <section className="page-workbench" aria-label="工作台">
            <div className="page"><div className="page-inner">
              <div className="page-head"><h1>工作台</h1><p>用量与最近活动，来自真实 API。</p></div>
              <MetricsDashboard
                state={metricsLoading ? 'loading' : metricsError ? 'error' : metrics && (metrics.totals.turns > 0 || metrics.totals.messages > 0 || metrics.totals.tasks > 0) ? 'ready' : 'empty'}
                windowKind={metricsRange}
                data={metrics ?? undefined}
                onWindowChange={(value) => setMetricsRange(value)}
                onRetry={() => { setMetricsError(''); setMetricsLoading(true); void getMetrics(metricsRange).then(setMetrics).catch((err: unknown) => setMetricsError(err instanceof Error ? err.message : '指标加载失败')).finally(() => setMetricsLoading(false)) }}
              />
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
                  <button className="row" type="button" key={session.id} onClick={() => { userActiveChangeRef.current = true; setActiveId(session.id); setPage('chat') }}><span className="kind">会话</span><span className="title">{session.title}</span><span className="time">{formatTime(session.createdAt)}</span></button>
                ))}
              </div>
              <div className="section-title"><h2>交付物</h2><span>用户产物</span></div>
              {deliverablesLoading && <LoadingState label="交付物加载中…" />}
              {!deliverablesLoading && deliverablesError && <ErrorState title="交付物加载失败" description={deliverablesError} onRetry={() => { setDeliverablesLoading(true); setDeliverablesError(''); void getDeliverables().then((data) => setUserDeliverables(data.deliverables ?? [])).catch((err: unknown) => setDeliverablesError(err instanceof Error ? err.message : '交付物加载失败')).finally(() => setDeliverablesLoading(false)) }} />}
              {!deliverablesLoading && !deliverablesError && visibleWorkbenchArtifacts.length === 0 && <EmptyState title="暂无交付物" description="报告、文档、表格或文件会出现在这里。" action={<button className="btn sm" type="button" onClick={() => setPage('chat')}>去对话</button>} />}
              {!deliverablesLoading && !deliverablesError && visibleWorkbenchArtifacts.length > 0 && <div className="list">{visibleWorkbenchArtifacts.map((artifact) => <div className="deliverable-line" key={artifact.id}><button className="row" type="button" onClick={() => void openArtifact(artifact.id)}><span className="kind">文件</span><span className="title">{artifact.name}</span><span className="time">{formatTime(artifact.createdAt ?? 0)}</span></button>{artifact.downloadUrl && <a className="download-link" href={artifact.downloadUrl} download aria-label={`下载 ${artifact.name}`}>下载</a>}</div>)}</div>}
            </div></div>
          </section>
        )}
      </div>
      {opError && <button type="button" className="toast" role="alert" title="点击关闭" onClick={() => setOpError('')}>{opError}</button>}
      <StatusBar connection={connection} />
    </div>
  )
}
