// features/chat/MessageBadges.tsx —— 消息头元信息（M14/M42：纯文本 + 分隔符，不做灰胶囊）
//
// 分类：低饱和小灰点 + 文字；会话路径：次要灰文字 + › 分隔（hover 才下划线）。
// 元信息不再使用 border/background/pill，避免一排“按钮感”标签。

import { Fragment } from 'react'
import type { ChatMessage, SessionMetaEntry } from '../../platform/types.ts'
import { categoryMeta, collapseSessionPath, deriveSessionPath, sessionPathText } from './message-meta.ts'

export function CategoryBadge({ message }: { message: ChatMessage }) {
  if (message.role !== 'agent') return null
  const meta = categoryMeta(message.category)
  if (!meta) return null
  return (
    <span className="inline-flex flex-none items-center gap-1 text-[13px] leading-5 text-ink-muted" aria-label={`消息分类：${meta.label}`}>
      <span className="h-1 w-1 flex-none rounded-full bg-ink-muted opacity-60" aria-hidden="true" />
      {meta.label}
    </span>
  )
}

interface SessionPathBadgeProps {
  message: ChatMessage
  meta: Map<string, SessionMetaEntry>
  onJumpSession: (sessionId: string) => void
}

export function SessionPathBadge({ message, meta, onJumpSession }: SessionPathBadgeProps) {
  const path = deriveSessionPath(message, meta)
  if (path.length === 0) return null
  const parts = collapseSessionPath(path)
  return (
    <span className="inline-flex min-w-0 max-w-[22rem] flex-wrap items-center gap-x-1 text-[13px] leading-5 text-ink-muted" aria-label={`会话路径：${sessionPathText(path)}`}>
      {parts.map((part, index) => (
        <Fragment key={part.kind === 'item' ? part.item.id || `item-${index}` : `ellipsis-${index}`}>
          {part.kind === 'ellipsis' ? (
            <span className="text-ink-muted" aria-label={`折叠的 ${part.hidden.length} 级会话`}>…</span>
          ) : part.item.id ? (
            <button
              type="button"
              onClick={() => onJumpSession(part.item.id)}
              className="max-w-[9rem] cursor-pointer truncate border-0 bg-transparent p-0 text-[13px] leading-5 text-ink-muted hover:text-ink-secondary hover:underline"
              aria-label={`跳转到会话：${part.item.title}`}
            >
              {part.item.title}
            </button>
          ) : (
            <span className="max-w-[9rem] truncate text-[13px] leading-5 text-ink-muted">{part.item.title}</span>
          )}
          {index < parts.length - 1 && <span aria-hidden="true" className="text-ink-muted/70">›</span>}
        </Fragment>
      ))}
    </span>
  )
}
