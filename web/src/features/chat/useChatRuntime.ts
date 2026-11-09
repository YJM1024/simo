// features/chat/useChatRuntime.ts —— 对话运行时（本 feature 私有）
//
// M2 变化：
//   - WebSocket 连接上移到 platform/ws-hub（一个标签页一条，chat/tasks 共享）；
//     本 hook 只订阅 ws:frame / ws:state。
//   - reply.* 帧（M2）与 message.*（M1 兼容）统一合并到消息列表。
//   - reply.retracted → 消息标 retracted、清空内容（只显示「已撤回」标记）。
//   - trace.reasoning → 单独存 Map，默认折叠展示，不混入正文。
//   - 发送永不锁：允许连发；只有显式「撤回」才发 correct 帧。

import { useCallback, useEffect, useRef, useState } from 'react'
import { HttpError, getMessages, postChat, toMessages } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import { sendChat, sendCorrect } from '../../platform/ws-hub.ts'
import type {
  AgentState,
  ChatAttachment,
  ChatMessage,
  Notice,
  SessionMetaEntry,
  WireFrame,
} from '../../platform/types.ts'
import { isRecord, readString, toChatMessage } from '../../platform/types.ts'
import {
  parseCreated,
  parseDelta,
  parseDone,
  parseError,
  parseReasoning,
  parseRetracted,
  parseStatus,
} from './frames.ts'
import { clearFeedbackTimers, type FeedbackPhase } from './feedback.ts'
import { HISTORY_PAGE_SIZE, mergeOlderMessages } from './history.ts'
import { normalizeToolCall, upsertToolCall, type ToolCallInfo } from './toolcalls.ts'

const TOOL_FRAME_TYPES = new Set([
  'tool.call',
  'tool.called',
  'tool_call',
  'tool.result',
  'tool_call_result',
  'tool_call.started',
  'tool_call.finished',
])

interface SessionInfo {
  id: string
  title: string
  /** M4：会话在树中的深度（根 = 0） */
  depth: number
  /** M6：归档会话只读（输入禁用；隐藏改名/新建子会话由 sessions feature 处理） */
  archived: boolean
  meta: Map<string, SessionMetaEntry>
}

export interface ChatRuntime {
  sessionId: string | null
  sessionTitle: string
  sessionDepth: number
  sessionArchived: boolean
  sessionMeta: Map<string, SessionMetaEntry>
  messages: ChatMessage[]
  /** replyId -> 推理轨迹文本（默认折叠，不进正文） */
  reasoning: Map<string, string>
  /** M9：最近工具调用（消息流下方折叠展示，不刷屏） */
  toolCalls: ToolCallInfo[]
  messagesLoading: boolean
  messagesError: string | null
  /** M4：主窗口聚合视图（false=仅本会话，true=含递归子会话；根会话默认 true） */
  includeChildren: boolean
  setIncludeChildren: (value: boolean) => void
  agentStatus: AgentState
  /** 并行任务数（来自 tasks feature 的广播，仅用于状态行文案） */
  runningTasks: number
  /** M7 三速反馈：发送后语义确认/等待首内容/处理较久 */
  feedback: FeedbackPhase
  /** M7 派发反馈：后台任务创建后的短暂提示 */
  dispatchHint: { id: string; title: string } | null
  /** M10：是否有工作流在跑（显示「停」按钮；输入框始终可用） */
  workflowRunning: boolean
  workflowPaused: boolean
  workflowActiveId: string | null
  /** M11：分页兼容（有更早消息可加载） */
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => Promise<void>
  /** M15：正在回复的消息（输入区引用条；发送后清空） */
  replyTo: ChatMessage | null
  setReplyTo: (message: ChatMessage | null) => void
  clearReplyTo: () => void
  notice: Notice | null
  dismissNotice: () => void
  send: (text: string, attachments?: ChatAttachment[]) => Promise<boolean>
  /** 撤回指定流式回复（发 correct 帧） */
  retract: (messageId: string) => boolean
  /** 跳转到某会话（发 session:select，由 sessions feature 实际切换） */
  jumpToSession: (sessionId: string) => void
  retryMessages: () => void
}

function sortMessages(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
}

function errorText(err: unknown, fallback: string): string {
  const offline = (err as { offline?: boolean }).offline === true
  if (offline) return '无法连接后端，请确认司墨服务正在运行'
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export function useChatRuntime(): ChatRuntime {
  const [session, setSession] = useState<SessionInfo | null>(() => {
    const id = readSessionId()
    return id ? { id, title: '主会话', depth: 0, archived: false, meta: new Map() } : null
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [reasoning, setReasoning] = useState<Map<string, string>>(new Map())
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [includeChildren, setIncludeChildren] = useState(true)
  const [agentStatus, setAgentStatus] = useState<AgentState>('idle')
  const [runningTasks, setRunningTasks] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [feedback, setFeedback] = useState<FeedbackPhase>('idle')
  const [dispatchHint, setDispatchHint] = useState<{ id: string; title: string } | null>(null)
  const [workflowRunning, setWorkflowRunning] = useState(false)
  const [workflowPaused, setWorkflowPaused] = useState(false)
  const [workflowActiveId, setWorkflowActiveId] = useState<string | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [replyTo, setReplyToState] = useState<ChatMessage | null>(null)
  const replyToRef = useRef<ChatMessage | null>(null)
  replyToRef.current = replyTo
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const sessionIdRef = useRef<string | null>(session?.id ?? null)
  sessionIdRef.current = session?.id ?? null
  const sessionArchivedRef = useRef(session?.archived ?? false)
  sessionArchivedRef.current = session?.archived ?? false
  const includeChildrenRef = useRef(includeChildren)
  includeChildrenRef.current = includeChildren

  const messageIdsRef = useRef<Set<string>>(new Set())
  const resyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const afterDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimersRef = useRef<{ thinking: ReturnType<typeof setTimeout> | null; slow: ReturnType<typeof setTimeout> | null }>({
    thinking: null,
    slow: null,
  })
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- M7 三速反馈：语义确认（<500ms）→ 等待首内容（1–3s）→ 较久提示 ----
  const clearFeedback = useCallback(() => {
    clearFeedbackTimers(feedbackTimersRef.current)
    setFeedback('idle')
  }, [])

  const startFeedback = useCallback(() => {
    clearFeedbackTimers(feedbackTimersRef.current)
    setFeedback('ack')
    feedbackTimersRef.current.thinking = setTimeout(() => setFeedback('thinking'), 500)
    feedbackTimersRef.current.slow = setTimeout(() => setFeedback('slow'), 2600)
  }, [])

  // ---- 历史消息（includeChildren：主窗口聚合视图）----
  const loadMessages = useCallback(
    async (sessionId: string, includeChildren: boolean, options: { silent?: boolean } = {}) => {
      const silent = options.silent === true
      if (!silent) {
        setMessagesLoading(true)
        setMessagesError(null)
      }
      try {
        const payload = await getMessages(sessionId, { includeChildren })
        if (sessionIdRef.current !== sessionId) return
        const list = sortMessages(toMessages(payload))
        messageIdsRef.current = new Set(list.map((item) => item.id))
        setMessages(list)
        setHasOlder(list.length >= HISTORY_PAGE_SIZE)
      } catch (err) {
        if (silent || sessionIdRef.current !== sessionId) return
        setMessagesError(errorText(err, '消息加载失败'))
      } finally {
        if (!silent) setMessagesLoading(false)
      }
    },
    [],
  )

  // ---- 断线自愈：收到未知消息的 delta 时静默拉一次全量 ----
  const scheduleResync = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId || resyncTimerRef.current !== null) return
    resyncTimerRef.current = setTimeout(() => {
      resyncTimerRef.current = null
      if (sessionIdRef.current === sessionId) {
        void loadMessages(sessionId, includeChildrenRef.current, { silent: true })
      }
    }, 400)
  }, [loadMessages])

  // ---- 一轮回复结束后：可能自动建了子会话 → 请求刷树；聚合视图下补拉消息 ----
  const scheduleAfterDone = useCallback(() => {
    if (afterDoneTimerRef.current !== null) return
    afterDoneTimerRef.current = setTimeout(() => {
      afterDoneTimerRef.current = null
      bus.emit(EVENTS.SESSIONS_REFRESH, { reason: 'reply.done' })
      const sessionId = sessionIdRef.current
      if (sessionId && includeChildrenRef.current) {
        void loadMessages(sessionId, true, { silent: true })
      }
    }, 600)
  }, [loadMessages])

  useEffect(
    () => () => {
      if (resyncTimerRef.current !== null) {
        clearTimeout(resyncTimerRef.current)
        resyncTimerRef.current = null
      }
      if (afterDoneTimerRef.current !== null) {
        clearTimeout(afterDoneTimerRef.current)
        afterDoneTimerRef.current = null
      }
    },
    [],
  )

  // ---- 消息合并（消息 id 幂等：重连补发/乐观插入都走这里）----
  const upsertMessage = useCallback((message: ChatMessage) => {
    messageIdsRef.current.add(message.id)
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === message.id)
      if (index === -1) return sortMessages([...prev, message])
      const current = prev[index]
      if (!current) return prev
      // 已撤回的消息不被后续帧复活内容
      if (current.status === 'retracted') return prev
      const next = prev.slice()
      next[index] = { ...current, ...message, text: message.text || current.text }
      return next
    })
  }, [])

  const appendReasoning = useCallback((id: string, delta: string) => {
    setReasoning((prev) => {
      const next = new Map(prev)
      next.set(id, `${prev.get(id) ?? ''}${delta}`)
      return next
    })
  }, [])

  const applyFrame = useCallback(
    (frame: WireFrame) => {
      switch (frame.type) {
        case 'hello':
          return
        case 'message.created':
        case 'reply.created': {
          const message = parseCreated(frame.data)
          if (!message) return
          if (frame.type === 'reply.created') {
            message.role = 'agent'
            message.status = message.status ?? 'streaming'
          }
          upsertMessage(message)
          clearFeedback()
          // 归属会话不是当前会话（例如司墨在 main 里自动建了子会话）→ 请求刷树
          if (message.sessionId && message.sessionId !== sessionIdRef.current) {
            bus.emit(EVENTS.SESSIONS_REFRESH, { reason: 'message.created' })
          }
          return
        }
        case 'message.delta':
        case 'reply.delta': {
          const payload = parseDelta(frame.data)
          if (!payload) return
          clearFeedback()
          if (!messageIdsRef.current.has(payload.id)) {
            scheduleResync()
            return
          }
          setMessages((prev) =>
            prev.map((item) =>
              item.id === payload.id && item.status !== 'retracted'
                ? { ...item, text: `${item.text ?? ''}${payload.delta}`, status: 'streaming' }
                : item,
            ),
          )
          return
        }
        case 'message.done':
        case 'reply.done': {
          const payload = parseDone(frame.data)
          if (!payload) return
          clearFeedback()
          setMessages((prev) =>
            prev.map((item) =>
              item.id === payload.id && item.status !== 'retracted'
                ? { ...item, status: payload.status }
                : item,
            ),
          )
          scheduleAfterDone()
          return
        }
        case 'reply.retracted': {
          const payload = parseRetracted(frame.data)
          if (!payload) return
          clearFeedback()
          setMessages((prev) =>
            prev.map((item) =>
              item.id === payload.id ? { ...item, text: '', status: 'retracted' } : item,
            ),
          )
          setReasoning((prev) => {
            if (!prev.has(payload.id)) return prev
            const next = new Map(prev)
            next.delete(payload.id)
            return next
          })
          return
        }
        case 'trace.reasoning': {
          const payload = parseReasoning(frame.data)
          if (payload) appendReasoning(payload.id, payload.delta)
          return
        }
        case 'status': {
          const payload = parseStatus(frame.data)
          if (payload) setAgentStatus(payload.state)
          return
        }
        case 'error': {
          const payload = parseError(frame.data)
          if (payload) {
            setNotice({ kind: 'error', text: payload.message })
            bus.emit(EVENTS.NOTIFY, {
              kind: 'error',
              title: '对话出错',
              detail: payload.message,
              ...(payload.code ? { id: `chat-error:${payload.code}` } : {}),
            })
          }
          clearFeedback()
          return
        }
        case 'task.created': {
          // M7 派发反馈：任务创建后给一个短暂可见的「已派发」提示
          if (isRecord(frame.data)) {
            const id = readString(frame.data, 'id')
            const title = readString(frame.data, 'title') ?? '后台任务'
            if (id) {
              setDispatchHint({ id, title })
              if (dispatchTimerRef.current !== null) clearTimeout(dispatchTimerRef.current)
              dispatchTimerRef.current = setTimeout(() => setDispatchHint(null), 6000)
            }
          }
          return
        }
        case 'task.report': {
          // M10：逐任务汇报（可能复用 message.created；缺省时也接受本帧）
          const raw = isRecord(frame.data) && isRecord(frame.data['message']) ? frame.data['message'] : frame.data
          const message = toChatMessage(raw, 'agent')
          if (message) {
            message.role = 'agent'
            message.status = message.status ?? 'done'
            upsertMessage(message)
          }
          return
        }
        default: {
          // M9：工具调用审计帧（tool.call 等）→ 消息流下方折叠展示最近记录
          if (TOOL_FRAME_TYPES.has(frame.type)) {
            const toolCall = normalizeToolCall(frame.data)
            if (toolCall) setToolCalls((prev) => upsertToolCall(prev, toolCall))
          }
          return
        }
      }
    },
    [appendReasoning, clearFeedback, scheduleAfterDone, scheduleResync, upsertMessage],
  )

  // ---- 左栏广播的当前会话 ----
  useEffect(
    () =>
      bus.on(EVENTS.SESSION_ACTIVE, (payload) => {
        const switched = sessionIdRef.current !== payload.sessionId
        const meta = new Map(payload.sessionMeta.map((entry) => [entry.id, entry]))
        setSession((prev) =>
          prev && prev.id === payload.sessionId
            ? { ...prev, title: payload.title, depth: payload.depth, archived: payload.archived, meta }
            : { id: payload.sessionId, title: payload.title, depth: payload.depth, archived: payload.archived, meta },
        )
        // 切换会话：根会话默认「含子会话」，子会话默认「仅本会话」（只切不改）
        if (switched) setIncludeChildren(payload.depth <= 0)
      }),
    [],
  )

  // ---- 收帧：所有 WS 帧从总线来（platform/ws-hub 已做传输层去重）----
  useEffect(() => bus.on(EVENTS.WS_FRAME, (payload) => applyFrame(payload.frame)), [applyFrame])

  // ---- 连接建立/重连后静默补齐，覆盖断线窗口 ----
  useEffect(
    () =>
      bus.on(EVENTS.WS_STATE, (payload) => {
        if (payload.connection !== 'open') return
        const sessionId = sessionIdRef.current
        if (sessionId) void loadMessages(sessionId, includeChildrenRef.current, { silent: true })
      }),
    [loadMessages],
  )

  // ---- 并行任务计数（只用于状态行文案，「多个任务进行中」）----
  useEffect(
    () => bus.on(EVENTS.TASKS_STATE, (payload) => setRunningTasks(payload.running)),
    [],
  )

  // ---- M10：工作流运行态（任务面板广播 → 「停」按钮）----
  useEffect(
    () =>
      bus.on(EVENTS.WORKFLOWS_STATE, (payload) => {
        setWorkflowRunning(payload.running)
        setWorkflowPaused(payload.paused)
        setWorkflowActiveId(payload.activeWorkflowId)
      }),
    [],
  )

  // ---- 会话切换 / 聚合视图切换：重置视图并拉历史 ----
  useEffect(() => {
    if (resyncTimerRef.current !== null) {
      clearTimeout(resyncTimerRef.current)
      resyncTimerRef.current = null
    }
    clearFeedback()
    setDispatchHint(null)
    if (dispatchTimerRef.current !== null) {
      clearTimeout(dispatchTimerRef.current)
      dispatchTimerRef.current = null
    }
    setMessages([])
    setReasoning(new Map())
    setToolCalls([])
    setHasOlder(false)
    setReplyToState(null)
    messageIdsRef.current = new Set()
    setMessagesError(null)
    setAgentStatus('idle')

    const sessionId = session?.id
    if (!sessionId) {
      setMessagesLoading(false)
      return
    }
    void loadMessages(sessionId, includeChildren)
  }, [session?.id, includeChildren, clearFeedback, loadMessages])

  // ---- 对话状态广播（顶栏）----
  useEffect(() => {
    bus.emit(EVENTS.CHAT_STATUS, { agentStatus })
  }, [agentStatus])

  // ---- 通知自动消失 ----
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  // ---- 发送（永不锁：不因流式/任务而禁用；归档会话除外，只读）----
  const send = useCallback(async (rawText: string, attachmentMetas: ChatAttachment[] = []): Promise<boolean> => {
    const text = rawText.trim()
    const sessionId = sessionIdRef.current
    const attachmentIds = attachmentMetas.map((attachment) => attachment.id)
    const replyToMessageId = replyToRef.current?.id
    if ((!text && attachmentIds.length === 0) || !sessionId) return false
    if (sessionArchivedRef.current) {
      setNotice({ kind: 'info', text: '已归档会话只读：恢复后才能继续发消息' })
      return false
    }

    // 优先 WS（普通 chat 帧，默认不打断后台工作）；M8 帧里带附件 id 列表；M15 带回复目标
    startFeedback()
    if (sendChat(text, attachmentIds, replyToMessageId)) {
      setReplyToState(null)
      return true
    }

    // 连接未就绪：退回 REST（不保留第二套流式协议；WS 重连后会补发）
    try {
      const body = await postChat(sessionId, text, attachmentIds, replyToMessageId)
      const messageId = body?.messageId
      if (messageId) {
        const optimistic: ChatMessage = {
          id: messageId,
          sessionId,
          role: 'user',
          text,
          at: Date.now(),
          status: 'sent',
          ...(attachmentMetas.length > 0 ? { attachments: attachmentMetas } : {}),
          ...(replyToRef.current
            ? {
                replyTo: {
                  id: replyToRef.current.id,
                  role: replyToRef.current.role,
                  text: replyToRef.current.text.slice(0, 200),
                  ...(replyToRef.current.sessionId ? { sessionId: replyToRef.current.sessionId } : {}),
                  ...(replyToRef.current.sessionTitle ? { sessionTitle: replyToRef.current.sessionTitle } : {}),
                },
              }
            : {}),
        }
        messageIdsRef.current.add(messageId)
        setMessages((prev) =>
          prev.some((item) => item.id === messageId) ? prev : sortMessages([...prev, optimistic]),
        )
      }
      setReplyToState(null)
      return true
    } catch (err) {
      clearFeedback()
      const status = err instanceof HttpError ? err.status : 0
      const message = status === 400 ? '消息不能为空' : `发送失败：${errorText(err, '未知错误')}`
      setNotice({ kind: 'error', text: message })
      bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '发送失败', detail: message })
      return false
    }
  }, [clearFeedback, startFeedback])

  // ---- 撤回：显式修正/停止（correct 帧）→ 后端回 reply.retracted ----
  const retract = useCallback((messageId: string): boolean => {
    const ok = sendCorrect('停止', messageId)
    if (!ok) setNotice({ kind: 'error', text: '连接未就绪，暂时无法撤回' })
    return ok
  }, [])

  const retryMessages = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (sessionId) void loadMessages(sessionId, includeChildrenRef.current)
  }, [loadMessages])

  // ---- M11：加载更早消息（分页兼容；后端忽略 before 时自动隐藏入口） ----
  const loadOlder = useCallback(async (): Promise<void> => {
    const sessionId = sessionIdRef.current
    const first = messagesRef.current[0]
    if (!sessionId || !first || loadingOlder) return
    setLoadingOlder(true)
    try {
      const payload = await getMessages(sessionId, {
        includeChildren: includeChildrenRef.current,
        before: first.id,
        limit: HISTORY_PAGE_SIZE,
      })
      if (sessionIdRef.current !== sessionId) return
      const older = sortMessages(toMessages(payload))
      const currentIds = new Set(messagesRef.current.map((message) => message.id))
      const fresh = older.filter((message) => !currentIds.has(message.id))
      if (fresh.length === 0) {
        setHasOlder(false)
        return
      }
      setMessages((prev) => mergeOlderMessages(prev, fresh))
      setHasOlder(fresh.length >= HISTORY_PAGE_SIZE)
    } catch (error) {
      setNotice({ kind: 'error', text: `加载更早消息失败：${errorText(error, '未知错误')}` })
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder])

  // ---- 标签跳转：只发事件，由 sessions feature 负责切换并广播 ----
  const jumpToSession = useCallback((targetSessionId: string) => {
    if (!targetSessionId || targetSessionId === sessionIdRef.current) return
    bus.emit(EVENTS.SESSION_SELECT, { sessionId: targetSessionId })
  }, [])

  const dismissNotice = useCallback(() => setNotice(null), [])
  const setReplyTo = useCallback((message: ChatMessage | null) => setReplyToState(message), [])
  const clearReplyTo = useCallback(() => setReplyToState(null), [])

  return {
    sessionId: session?.id ?? null,
    sessionTitle: session?.title ?? '主会话',
    sessionDepth: session?.depth ?? 0,
    sessionArchived: session?.archived ?? false,
    sessionMeta: session?.meta ?? new Map(),
    messages,
    reasoning,
    toolCalls,
    messagesLoading,
    messagesError,
    includeChildren,
    setIncludeChildren,
    agentStatus,
    runningTasks,
    feedback,
    dispatchHint,
    workflowRunning,
    workflowPaused,
    workflowActiveId,
    hasOlder,
    loadingOlder,
    loadOlder,
    replyTo,
    setReplyTo,
    clearReplyTo,
    notice,
    dismissNotice,
    send,
    retract,
    jumpToSession,
    retryMessages,
  }
}
