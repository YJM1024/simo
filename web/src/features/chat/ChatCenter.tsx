// features/chat/ChatCenter.tsx —— 中栏容器：会话顶部标签（对话/文件/概览）+ 消息流 + 输入区
//
// M4：主窗口 = 根节点聚合视图；M7：三速反馈 + 通知；M10：工作流「停」按钮；
// M11：顶部标签「对话 / 文件 / 概览」、消息侧边迷你时间轴（点击预览+跳转高亮、视口高亮、可折叠）。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { archiveSession, renameSession } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { Tabs } from '../../platform/ui/Tabs.tsx'
import { Icon } from '../../platform/ui/icons.tsx'
import { saveModelPreference } from '../../platform/preferences.ts'
import { sendChat } from '../../platform/ws-hub.ts'
import type { ChatMessage, WireFrame } from '../../platform/types.ts'
import HistoryRail from './HistoryRail.tsx'
import SessionFilesView from './SessionFilesView.tsx'
import TrajectoryView from './TrajectoryView.tsx'
import { feedbackLabel, shouldShowFeedback } from './feedback.ts'
import { pickActiveTick } from './history.ts'
import { copyMessageText } from './mentions.ts'
import { parseSlash, validateSlash } from './slash.ts'
import { compactionSummary } from './trajectory.ts'
import Composer from './Composer.tsx'
import MessageList from './MessageList.tsx'
import { useChatRuntime } from './useChatRuntime.ts'

const BOTTOM_THRESHOLD = 96

const TABS = [
  { id: 'chat', label: '对话' },
  { id: 'trajectory', label: '轨迹' },
  { id: 'files', label: '文件' },
] as const

type CenterTab = (typeof TABS)[number]['id']

export default function ChatCenter() {
  const runtime = useChatRuntime()
  const listRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [tab, setTab] = useState<CenterTab>('chat')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [compactionText, setCompactionText] = useState<string | null>(null)
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMessage = runtime.messages[runtime.messages.length - 1]
  const hasStreamingReply = lastMessage?.role === 'agent' && lastMessage.status === 'streaming'
  const showFeedback = shouldShowFeedback(runtime.feedback, hasStreamingReply)

  const showActionNotice = useCallback((message: string) => {
    setActionNotice(message)
    if (actionTimerRef.current !== null) clearTimeout(actionTimerRef.current)
    actionTimerRef.current = setTimeout(() => setActionNotice(null), 4000)
  }, [])

  useEffect(
    () => () => {
      if (actionTimerRef.current !== null) clearTimeout(actionTimerRef.current)
    },
    [],
  )

  // M37：顶部导航与中栏会话标签同步（文件 tab 等）
  useEffect(
    () =>
      bus.on(EVENTS.CHAT_TAB_OPEN, ({ tab: next }: { tab: string }) => {
      if (TABS.some((entry) => entry.id === next)) setTab(next as CenterTab)
      }),
    [],
  )
  useEffect(() => {
    bus.emit(EVENTS.CHAT_TAB_STATE, { tab })
  }, [tab])

  // UI-2：上下文压缩事件 → 可视化提示（只显示事件真实数字）
  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        if (frame.type !== 'context.compacted' && frame.type !== 'compaction') return
        const summary = compactionSummary(frame.data)
        if (summary) setCompactionText(summary)
      }),
    [],
  )

  // ---- UI-1：斜杠命令（/archive /rename /pause /model）；不发送普通消息 ----
  const handleSlashCommand = useCallback(
    async (text: string): Promise<boolean> => {
      const parsed = parseSlash(text)
      if (!parsed) return false
      const error = validateSlash(parsed)
      if (error) {
        showActionNotice(error)
        return true
      }
      const sessionId = runtime.sessionId
      try {
        if (parsed.command === 'archive') {
          if (!sessionId) return true
          await archiveSession(sessionId)
          bus.emit(EVENTS.SESSIONS_REFRESH, { reason: 'slash.archive' })
          showActionNotice('当前会话已归档（只读，可在会话树恢复）')
        } else if (parsed.command === 'rename') {
          if (!sessionId) return true
          await renameSession(sessionId, parsed.arg)
          bus.emit(EVENTS.SESSIONS_REFRESH, { reason: 'slash.rename' })
          showActionNotice(`已重命名为「${parsed.arg}」`)
        } else if (parsed.command === 'pause') {
          showActionNotice(sendChat('停') ? '已发送暂停指令（运行中任务跑完即停）' : '连接未就绪，暂停未发送')
        } else if (parsed.command === 'model') {
          const model = saveModelPreference(parsed.arg)
          showActionNotice(`模型偏好已记录：${model}（后端切换接口未就绪时仅本地）`)
        }
      } catch (cause) {
        showActionNotice(`命令执行失败：${cause instanceof Error ? cause.message : '未知错误'}`)
      }
      return true
    },
    [runtime.sessionId, showActionNotice],
  )

  const copyMessage = useCallback(
    (message: ChatMessage) => {
      void copyMessageText(message.text).then((ok) => showActionNotice(ok ? '已复制消息文本' : '复制失败，请手动选择文本'))
    },
    [showActionNotice],
  )

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current
    if (!el) return
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    } else {
      // 切换会话/首次加载：直接瞬间定位到底部，不做平滑动画
      el.scrollTop = el.scrollHeight
    }
  }, [])

  // 贴底跟随：只有用户主动上滑后才停止；消息渲染完成前不滚动
  useLayoutEffect(() => {
    if (tab === 'chat' && stickRef.current && !runtime.messagesLoading) scrollToBottom(false)
  }, [runtime.messages, runtime.messagesLoading, runtime.agentStatus, tab, scrollToBottom])

  // 换会话/换聚合视图时恢复贴底；换会话回到「对话」标签
  useLayoutEffect(() => {
    stickRef.current = true
    setAtBottom(true)
    setTab('chat')
    setHighlightId(null)
    setActiveMessageId(null)
    scrollToBottom(false)
  }, [runtime.sessionId, runtime.includeChildren, scrollToBottom])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
    stickRef.current = near
    setAtBottom(near)
  }, [])

  const jumpToBottom = useCallback(() => {
    stickRef.current = true
    setAtBottom(true)
    scrollToBottom(true)
  }, [scrollToBottom])

  // M11：历史导航跳转 + 短暂高亮
  const jumpToMessage = useCallback((messageId: string) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
    if (!el) return
    stickRef.current = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(messageId)
    if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1800)
  }, [])

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) clearTimeout(highlightTimerRef.current)
    },
    [],
  )

  // M11：当前视口高亮（取视口内最早可见消息）
  useEffect(() => {
    if (tab !== 'chat') return
    const root = listRef.current
    if (!root) return
    const articles = [...root.querySelectorAll<HTMLElement>('[data-message-id]')]
    if (articles.length === 0) return
    const visible = new Set<string>()
    const orderedIds = runtime.messages.map((message) => message.id)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset['messageId']
          if (!id) continue
          if (entry.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        setActiveMessageId(pickActiveTick([...visible], orderedIds))
      },
      { root, threshold: 0.01 },
    )
    for (const article of articles) observer.observe(article)
    return () => observer.disconnect()
  }, [tab, runtime.messages])

  const { notice, dismissNotice } = runtime
  // 消息加载完成前只显示加载态，避免旧消息/第一条先渲染再跳到底部
  const visibleMessages = runtime.messagesLoading ? [] : runtime.messages

  // 状态行：并行任务优先（执行回路），其次对话思考中
  const statusLabel =
    runtime.runningTasks > 0
      ? `多个任务进行中（${runtime.runningTasks}）`
      : runtime.agentStatus === 'thinking'
        ? '思考中'
        : '就绪'

  const isRoot = runtime.sessionDepth === 0

  return (
    <main
      className="relative flex h-full min-h-0 flex-col bg-transparent pt-3"
      aria-label={`会话工作台：${runtime.sessionTitle}`}
    >
      <Tabs
        items={TABS}
        active={tab}
        onChange={(id) => setTab(id as CenterTab)}
        ariaLabel="会话标签"
        size="sm"
        className="flex-none border-b border-border-subtle bg-surface px-2 sm:px-4"
      />

      <div className="flex items-center gap-3 border-b border-border-subtle px-3 pt-2.5 pb-2 sm:px-5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="m-0 text-lg font-semibold tracking-tight">{runtime.sessionTitle}</h2>
        <span className="font-mono text-2xs tracking-normal text-muted">
          {isRoot ? '主窗口 · 聚合视图' : `子会话 · 深度 ${runtime.sessionDepth}`}
        </span>

        {/* M4：仅本会话 / 含子会话 */}
        <div
          className="flex items-center gap-4 text-[13px]"
          role="group"
          aria-label="消息范围"
          title="根会话默认含子会话；聚合视图按时间合并递归子会话消息"
        >
          <button
            type="button"
            onClick={() => runtime.setIncludeChildren(false)}
            aria-pressed={!runtime.includeChildren}
            className={`relative cursor-pointer pb-1 transition-colors duration-fast ${
              !runtime.includeChildren ? 'font-medium text-ink' : 'text-muted hover:text-ink-secondary'
            }`}
          >
            仅本会话
            {!runtime.includeChildren && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => runtime.setIncludeChildren(true)}
            aria-pressed={runtime.includeChildren}
            className={`relative cursor-pointer pb-1 transition-colors duration-fast ${
              runtime.includeChildren ? 'font-medium text-ink' : 'text-muted hover:text-ink-secondary'
            }`}
          >
            含子会话
            {runtime.includeChildren && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-ink" aria-hidden="true" />}
          </button>
        </div>

        {runtime.workflowRunning && !runtime.sessionArchived && (
          <button
            type="button"
            onClick={() => void runtime.send('停')}
            aria-label="暂停当前工作流"
            title="停：不再启动新任务，运行中任务跑完即停；输入框仍可用"
            className="cursor-pointer rounded-xs border border-warn-border bg-warn-soft px-2 py-0.5 font-mono text-2xs text-warn-ink transition-colors duration-fast hover:border-warn"
          >
            停
          </button>
        )}
        {runtime.workflowPaused && (
          <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink" title="工作流已暂停；右栏任务卡片可恢复">
            已暂停
          </span>
        )}

        </div>
        <div className="flex flex-none items-center gap-2 whitespace-nowrap">
        <span className="text-[13px] text-ink-muted" title="对话回路与执行回路相互独立：输入框始终保持可用">
          {statusLabel}
        </span>
        </div>
      </div>

      <p className="hidden border-b border-border-subtle bg-surface-sunken px-2 py-1 font-mono text-2xs text-muted max-[820px]:block">
        窄屏：左右栏已折叠；Ctrl/⌘+K 可切换会话、打开用量/设置。
      </p>

      {compactionText && (
        <details className="border-b border-border-subtle bg-surface-sunken px-4 py-1 font-mono text-2xs text-muted">
          <summary className="cursor-pointer select-none">{compactionText}</summary>
          <p className="m-0 mt-1 text-2xs text-ink-secondary">
            上下文已压缩；只显示统计，不展示被压缩原文或内部摘要。压缩失败不影响对话。
          </p>
        </details>
      )}

      {runtime.sessionArchived && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b border-warn-border bg-warn-soft/60 px-4 py-1.5 text-sm text-warn-ink"
        >
          <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs">只读</span>
          <span>已归档，只读：可在左侧会话树点 ↺ 恢复后继续对话。</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className={`flex items-center justify-between gap-2.5 border-b border-border-subtle px-4 py-2 text-md backdrop-blur-glass ${
            notice.kind === 'error' ? 'bg-danger-soft text-danger-ink' : 'bg-accent-soft text-accent-hover'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            aria-label="关闭提示"
            onClick={dismissNotice}
            className="cursor-pointer border-0 bg-transparent px-1 text-lg leading-none opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {tab === 'chat' && runtime.dispatchHint && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 border-b border-accent-border bg-accent-soft px-4 py-1.5 text-sm text-accent-hover"
        >
          <span className="rounded-pill border border-accent-border bg-surface-solid px-1.5 font-mono text-2xs">已派发</span>
          <span className="min-w-0 truncate">后台任务：{runtime.dispatchHint.title}</span>
          <span className="text-2xs text-muted">右栏可看阶段与进度；对话不会被阻塞</span>
        </div>
      )}

      {tab === 'chat' && showFeedback && (
        <div role="status" aria-live="polite" className="border-b border-border-subtle bg-surface-sunken px-5 py-1 font-mono text-2xs text-muted">
          {feedbackLabel(runtime.feedback)}
        </div>
      )}

      {tab === 'chat' && actionNotice && (
        <p role="status" className="m-0 border-b border-border-subtle bg-accent-soft px-5 py-1 text-2xs text-accent-hover">
          {actionNotice}
        </p>
      )}

      {tab === 'chat' && (
        <div
          id="session-panel-chat"
          role="tabpanel"
          aria-label="对话"
          className="flex min-h-0 flex-1 justify-center"
        >
          <div className="relative flex min-h-0 w-full max-w-[832px]">
            {visibleMessages.length > 0 && (
              <div className="absolute inset-y-0 left-0 z-10">
                <HistoryRail
                  messages={visibleMessages}
                  activeMessageId={activeMessageId}
                  highlightId={highlightId}
                  onJump={jumpToMessage}
                />
              </div>
            )}
            <MessageList
              messages={visibleMessages}
              meta={runtime.sessionMeta}
              sessionId={runtime.sessionId ?? ''}
              reasoning={runtime.reasoning}
              toolCalls={runtime.toolCalls}
              highlightId={highlightId}
              hasOlder={runtime.hasOlder}
              loadingOlder={runtime.loadingOlder}
              onLoadOlder={() => void runtime.loadOlder()}
              loading={runtime.messagesLoading}
              error={runtime.messagesError}
              agentStatus={runtime.agentStatus}
              listRef={listRef}
              onScroll={handleScroll}
              onRetry={runtime.retryMessages}
              onRetract={runtime.retract}
              onJumpSession={runtime.jumpToSession}
              onReply={(message) => runtime.setReplyTo(message)}
              onJumpToMessage={jumpToMessage}
              onCopy={copyMessage}
            />
            {!atBottom && (
              <button
                type="button"
                onClick={jumpToBottom}
                aria-label="回到最底部"
                title="回到最底部"
                className="absolute bottom-2 right-3 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-xs border border-border bg-surface-solid text-ink-secondary hover:border-accent-border hover:text-ink"
              >
                <Icon name="chevron-down" size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'trajectory' && (
        <div id="session-panel-trajectory" className="flex min-h-0 flex-1">
          <TrajectoryView
            sessionId={runtime.sessionId}
            messages={runtime.messages}
            toolCalls={runtime.toolCalls}
            onJumpMessage={(messageId) => {
              setTab('chat')
              requestAnimationFrame(() => requestAnimationFrame(() => jumpToMessage(messageId)))
            }}
            onOpenTask={(taskId) => bus.emit(EVENTS.TASK_OPEN, { taskId })}
          />
        </div>
      )}

      {tab === 'files' && runtime.sessionId && (
        <div id="session-panel-files" role="tabpanel" aria-label="文件" className="flex min-h-0 flex-1">
          <SessionFilesView sessionId={runtime.sessionId} />
        </div>
      )}

      {tab === 'chat' && (
        <Composer
          disabled={!runtime.sessionId || runtime.sessionArchived}
          disabledReason={runtime.sessionArchived ? '已归档，只读' : undefined}
          sessionId={runtime.sessionId}
          replyTo={runtime.replyTo}
          onCancelReply={runtime.clearReplyTo}
          onSlashCommand={handleSlashCommand}
          onSend={runtime.send}
        />
      )}
    </main>
  )
}
