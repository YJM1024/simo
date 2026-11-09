// features/chat/MessageList.tsx —— 中栏消息流
//
// M2 呈现规则：
//   - retracted：只显示「已撤回」标记，不展示被撤回内容，也不显示推理轨迹；
//   - trace.reasoning：默认折叠的 <details>，不进入正文气泡；
//   - streaming 回复可「撤回」（发 correct 帧）；
//   - 用户消息显示「已发送」。

import { type RefObject } from 'react'
import type { AgentState, ChatMessage, SessionMetaEntry } from '../../platform/types.ts'
import { formatClockTime, hasNeutralized, stripNeutralized } from '../../platform/types.ts'
import MarkdownMessage from './MarkdownMessage.tsx'
import MessageAttachments from './MessageAttachments.tsx'
import InlineCards from './InlineCard.tsx'
import { CategoryBadge, SessionPathBadge } from './MessageBadges.tsx'
import TaskReportCard, { isTaskReportMessage } from './TaskReportCard.tsx'
import { formatDuration, toolStatusLabel, toolStatusTone, type ToolCallInfo } from './toolcalls.ts'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { bus, EVENTS } from '../../platform/events.ts'
import { findAgent, useAgentCatalog, type AgentInfo } from '../../platform/agents.ts'

const TOOL_TONE: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

function ToolCallsPanel({ calls }: { calls: ToolCallInfo[] }) {
  if (calls.length === 0) return null
  return (
    <details className="mb-1 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
      <summary className="cursor-pointer select-none font-mono text-2xs tracking-normal text-muted">
        最近工具调用 · {calls.length}
      </summary>
      <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0" aria-label="最近工具调用">
        {calls.map((call) => {
          const tone = TOOL_TONE[toolStatusTone(call)]
          return (
            <li key={call.id} className="flex flex-wrap items-center gap-1.5 text-2xs">
              <span className={`rounded-xs border px-1.5 font-mono ${tone}`}>{toolStatusLabel(call)}</span>
              <span className="font-mono text-ink">{call.tool}</span>
              {call.risk && <span className="text-muted">风险·{call.risk}</span>}
              {call.durationMs !== null && <span className="font-mono text-muted">{formatDuration(call.durationMs)}</span>}
              {call.escalated && (
                <span className="rounded-xs border border-warn-border bg-warn-soft px-1 text-warn-ink">提权</span>
              )}
              {call.argsSummary && (
                <span className="min-w-0 max-w-full truncate text-muted" title={call.argsSummary}>
                  {call.argsSummary}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

const ROLE_LABEL: Record<string, string> = { user: '你', agent: '司墨' }

function roleOf(message: ChatMessage): 'user' | 'agent' {
  return message.role === 'user' ? 'user' : 'agent'
}

interface MessageBubbleProps {
  message: ChatMessage
  meta: Map<string, SessionMetaEntry>
  sessionId: string
  highlightId?: string | null
  reasoningText?: string
  onRetract: (messageId: string) => void
  onJumpSession: (sessionId: string) => void
  onReply: (message: ChatMessage) => void
  onJumpToMessage: (messageId: string) => void
  /** M17：处理者（agent 消息头像） */
  handler?: AgentInfo | null
  /** UI-1：消息操作 */
  onCopy: (message: ChatMessage) => void
}

function MessageBubble({
  message,
  meta,
  sessionId,
  highlightId,
  reasoningText,
  onRetract,
  onJumpSession,
  onReply,
  onJumpToMessage,
  handler,
  onCopy,
}: MessageBubbleProps) {
  const role = roleOf(message)
  const streaming = message.status === 'streaming'
  const failed = message.status === 'error' || message.status === 'failed'
  const retracted = message.status === 'retracted'
  const sessionInfo = message.sessionId ? meta.get(message.sessionId) : undefined
  const depth = sessionInfo?.depth ?? 0
  const showReasoning = !retracted && role === 'agent' && Boolean(reasoningText)
  // M5：子代理输出带 [harness: neutralized] 时显示「已中和」小标记，标记本身不进正文
  const neutralized = role === 'agent' && hasNeutralized(message.text)
  const displayText = neutralized ? stripNeutralized(message.text) : message.text
  // M10：任务汇报消息（agent + taskId）显示任务卡片
  const isReport = isTaskReportMessage(message)

  return (
    <article
      data-message-id={message.id}
      className={`group flex items-start gap-3 rounded-md animate-msg-in transition-shadow duration-base ${
        highlightId === message.id ? 'shadow-focus ring-2 ring-accent ring-offset-2 ring-offset-canvas' : ''
      }`}
      style={depth > 0 ? ({ marginLeft: `${Math.min(depth, 4) * 14}px` } as React.CSSProperties) : undefined}
    >
      {role === 'agent' ? (
        <AgentAvatar agent={handler ?? findAgent([], message.agentId)} size="sm" />
      ) : (
        <div
          aria-hidden="true"
          className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-full border text-xs ${
            role === 'user'
              ? 'border-avatar-border bg-avatar-bg text-avatar-ink'
              : 'border-avatar-border bg-avatar-bg text-ink-muted'
          }`}
        >
          {'你'}
        </div>
      )}
      <div className="min-w-0 max-w-[min(72ch,84%)]">
        <div className="mb-1.5 flex h-[30px] flex-nowrap items-center gap-x-2 overflow-hidden leading-5">
          {role !== 'user' && (
            <span className="flex-none text-[13px] font-medium leading-5 text-ink">
              {role === 'agent' && handler ? handler.name : ROLE_LABEL[role] ?? '司墨'}
            </span>
          )}
          <CategoryBadge message={message} />
          <SessionPathBadge message={message} meta={meta} onJumpSession={onJumpSession} />
          <time dateTime={new Date(message.at).toISOString()} className="flex-none text-[13px] leading-5 tabular-nums text-ink-muted">
            {formatClockTime(message.at)}
          </time>
          {role === 'user' && !failed && <span className="flex-none text-[13px] leading-5 text-ink-muted">已发送</span>}
          {streaming && <span className="flex-none text-[13px] leading-5 text-accent">正在输入…</span>}
          {streaming && (
            <button
              type="button"
              onClick={() => onRetract(message.id)}
              className="cursor-pointer rounded-xs border border-border-subtle bg-transparent px-1.5 py-0.5 text-xs text-muted transition-colors duration-fast hover:border-danger-border hover:text-danger-ink"
              title="撤回这条未完成的回复（显式停止，不影响后台任务）"
            >
              撤回
            </button>
          )}
          {failed && <span className="flex-none text-[13px] leading-5 text-danger-ink">{role === 'agent' ? '回复中断' : '发送失败'}</span>}
          {neutralized && <span className="text-[13px] leading-5 text-warn-ink" aria-label="子代理输出已被中和">已中和</span>}
          {retracted && <span className="text-[13px] leading-5 text-ink-muted">已撤回</span>}
          {!retracted && (
            <span className="flex items-center gap-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => onCopy(message)}
                aria-label="复制消息"
                title="复制消息文本"
                className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 text-2xs text-muted hover:border-accent-border hover:text-accent-hover"
              >
                复制
              </button>
              <button
                type="button"
                onClick={() => onReply(message)}
                aria-label={`回复这条消息：${message.text.slice(0, 40)}`}
                title="引用这条消息"
                className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 text-2xs text-muted hover:border-accent-border hover:text-accent-hover"
              >
                引用
              </button>
              {message.replyTo && (
                <button
                  type="button"
                  onClick={() => onJumpToMessage(message.replyTo?.id ?? '')}
                  aria-label="跳到被引用的原始消息"
                  title="跳到原文"
                  className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 text-2xs text-muted hover:border-accent-border hover:text-accent-hover"
                >
                  跳到原文
                </button>
              )}
            </span>
          )}
        </div>

        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpToMessage(message.replyTo?.id ?? '')}
            aria-label={`跳到被引用的消息：${message.replyTo.text}`}
            title="跳到被引用的原消息"
            className="mb-1 flex w-full items-center gap-1.5 overflow-hidden rounded-md border border-border-subtle bg-surface-sunken px-2 py-1 text-left transition-colors duration-fast hover:border-accent-border"
          >
            <span className="flex-none rounded-xs border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">
              {message.replyTo.role === 'user' ? '你' : message.replyTo.role === 'agent' ? '司墨' : '系统'}
            </span>
            <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary">{message.replyTo.text || '（无文字内容）'}</span>
            {message.replyTo.sessionTitle && (
              <span className="max-w-[10rem] flex-none truncate font-mono text-2xs text-muted" title={message.replyTo.sessionTitle}>
                会话：{message.replyTo.sessionTitle}
              </span>
            )}
          </button>
        )}

        {retracted ? (
          <div className="rounded-lg border border-dashed border-border bg-surface-sunken px-3 py-2.5 text-sm italic text-muted">
            已撤回（不展示内容）
          </div>
        ) : displayText || streaming || !isReport ? (
          <div
            className={`break-words text-[15px] leading-[1.65] text-ink ${
              role === 'user'
                ? 'rounded-bubble border border-message-user-border bg-message-user px-3 py-2.5'
                : 'px-0 py-0'
            } ${streaming ? "after:ml-px after:animate-cursor-blink after:text-accent after:content-['▍']" : ''} ${
              failed ? 'border-danger-border' : ''
            }`}
          >
            {displayText ? <MarkdownMessage text={displayText} /> : streaming ? null : ' '}
          </div>
        ) : null}

        {isReport && message.taskId && (
          <TaskReportCard taskId={message.taskId} workflowId={message.workflowId} agent={handler} />
        )}

        {!retracted && message.attachments && message.attachments.length > 0 && (
          <MessageAttachments attachments={message.attachments} />
        )}

        {!retracted && message.cards && message.cards.length > 0 && (
          <InlineCards cards={message.cards} messageId={message.id} sessionId={message.sessionId ?? sessionId} />
        )}

        {/* 推理轨迹：默认折叠，不混入正文 */}
        {showReasoning && (
          <details className="mt-1.5 rounded-md border border-border-subtle bg-surface-sunken px-3 py-2">
            <summary className="cursor-pointer select-none font-mono text-2xs tracking-normal text-muted">
              推理轨迹 · 默认折叠
            </summary>
            <pre className="mt-2 max-h-60 overflow-y-auto whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-secondary">
              {reasoningText}
            </pre>
          </details>
        )}
      </div>
    </article>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3.5 py-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-14 animate-skeleton-shimmer rounded-md bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%] ${
            index === 1 ? 'w-[56%] self-end' : 'w-[78%]'
          }`}
        />
      ))}
    </div>
  )
}

const EMPTY_SUGGESTIONS = [
  '帮我整理一份本周待办',
  '记住：我的项目叫「司墨」',
  '解释一下当前工作区',
] as const

function EmptyState() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-start px-1 py-10">
      <AgentAvatar size="sm" className="mb-3" />
      <h2 className="m-0 text-lg font-semibold text-ink">开始和司墨对话</h2>
      <p className="m-0 mt-1 text-sm text-ink-secondary">说需求、记信息、派任务；过程和结果都会回流到这里。</p>
      <div className="mt-5 grid w-full gap-2">
        {EMPTY_SUGGESTIONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => bus.emit(EVENTS.COMPOSER_INSERT, { text })}
            className="w-full cursor-pointer rounded-md border border-border bg-surface-solid px-3 py-2 text-left text-sm text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-ink"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

interface MessageListProps {
  messages: ChatMessage[]
  meta: Map<string, SessionMetaEntry>
  sessionId: string
  reasoning: Map<string, string>
  /** M9：最近工具调用（折叠展示，不刷屏） */
  toolCalls: ToolCallInfo[]
  /** M11：历史导航跳转后的短暂高亮 */
  highlightId?: string | null
  /** M11：分页兼容（加载更早消息） */
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  loading: boolean
  error: string | null
  agentStatus: AgentState
  listRef: RefObject<HTMLDivElement | null>
  onScroll: () => void
  onRetry: () => void
  onRetract: (messageId: string) => void
  onJumpSession: (sessionId: string) => void
  /** M15：回复某条消息（设置输入区引用条） */
  onReply: (message: ChatMessage) => void
  /** M15：点击引用卡片跳转到原消息 */
  onJumpToMessage: (messageId: string) => void
  /** UI-1：复制 / 引用回复 */
  onCopy: (message: ChatMessage) => void
}

export default function MessageList({
  messages,
  meta,
  sessionId,
  reasoning,
  toolCalls,
  highlightId,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  loading,
  error,
  agentStatus,
  listRef,
  onScroll,
  onRetry,
  onRetract,
  onJumpSession,
  onReply,
  onJumpToMessage,
  onCopy,
}: MessageListProps) {
  const agentCatalog = useAgentCatalog()
  const displayedMessages = messages.filter((message) => message.role === 'user' || message.role === 'agent')
  const hasMessages = displayedMessages.length > 0
  const last = displayedMessages[displayedMessages.length - 1]
  const showThinking = agentStatus === 'thinking' && (!last || last.role !== 'agent')

  return (
    <div
      ref={listRef}
      onScroll={onScroll}
      role="log"
      aria-label="对话消息"
      aria-live="polite"
      aria-relevant="additions text"
      aria-busy={agentStatus === 'thinking' || loading}
      className="flex w-full min-w-0 flex-1 flex-col gap-4 overflow-y-auto py-6 pl-[52px] pr-3 sm:py-8 sm:pr-5"
    >
      {/* 流式/等待的读屏播报（视觉上是隐藏的，避免重复打扰） */}
      <span className="sr-only" role="status" aria-live="polite">
        {loading ? '正在加载消息' : agentStatus === 'thinking' ? '司墨正在思考' : ''}
      </span>
      {loading && !hasMessages && <ListSkeleton />}

      {!loading && error && !hasMessages && (
        <div role="alert" className="m-auto max-w-[460px] rounded-lg border border-danger-border bg-danger-soft p-6 text-center text-danger-ink shadow-sm">
          <h3 className="m-0 mb-1.5 text-lg">消息加载失败</h3>
          <p className="m-0 mb-4 text-md">{error}</p>
          <button type="button" className="cursor-pointer rounded-lg border border-border bg-surface-solid px-4 py-2 text-md" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && !hasMessages && <EmptyState />}

      {hasMessages && (hasOlder || loadingOlder) && onLoadOlder && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-3 py-1 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover disabled:opacity-50"
          >
            {loadingOlder ? '加载更早消息…' : '加载更早消息'}
          </button>
        </div>
      )}

      {hasMessages &&
        displayedMessages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            meta={meta}
            sessionId={sessionId}
            highlightId={highlightId}
            reasoningText={reasoning.get(message.id)}
            onRetract={onRetract}
            onJumpSession={onJumpSession}
            onReply={onReply}
            onJumpToMessage={onJumpToMessage}
            onCopy={onCopy}
            handler={message.role === 'agent' ? findAgent(agentCatalog.agents, message.agentId) : null}
          />
        ))}

      {hasMessages && <ToolCallsPanel calls={toolCalls} />}

      {showThinking && (
        <div className="flex gap-1 pl-11" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-thinking-bounce rounded-xs bg-accent opacity-45" />
          <span className="h-1.5 w-1.5 animate-thinking-bounce rounded-xs bg-accent opacity-45 [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-thinking-bounce rounded-xs bg-accent opacity-45 [animation-delay:300ms]" />
        </div>
      )}
    </div>
  )
}
