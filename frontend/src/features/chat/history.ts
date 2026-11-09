// features/chat/history.ts —— 历史导航（M11）纯逻辑
//
// 契约：docs/m11-contract.md §2：消息侧边迷你时间轴（每条消息一个小横杠，按用户/助手区分），
// 点击预览摘要 + 跳转高亮、当前视口高亮、可折叠、兼容分页数据。

import type { ChatMessage, SessionPathItem } from '../../platform/types.ts'
import { normalizeCategory, normalizeSessionPath, type MessageCategory } from './message-meta.ts'

export interface TimelineTick {
  id: string
  role: 'user' | 'agent' | 'system'
  at: number
  preview: string
  /** M14：agent 分类（未分类为 null） */
  category: MessageCategory | null
  /** M14：会话路径（根→当前；旧消息回退 sessionTitle） */
  sessionPath: SessionPathItem[]
}

function roleOf(message: ChatMessage): TimelineTick['role'] {
  return message.role === 'user' || message.role === 'agent' ? message.role : 'system'
}

/** 消息摘要：去 Markdown 标记、压空白、截断（1–2 行）。 */
export function summarizeMessage(message: Pick<ChatMessage, 'text' | 'status'>, maxLength = 96): string {
  if (message.status === 'retracted') return '（已撤回）'
  const plain = message.text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return '（无文字内容）'
  return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain
}

export function buildTimeline(messages: readonly ChatMessage[]): TimelineTick[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'agent')
    .map((message) => {
    const provided = normalizeSessionPath(message.sessionPath)
    const sessionPath =
      provided.length > 0
        ? provided
        : message.sessionTitle
          ? [{ id: message.sessionId ?? '', title: message.sessionTitle }]
          : []
    return {
      id: message.id,
      role: roleOf(message),
      at: message.at,
      preview: summarizeMessage(message, 120),
      category: normalizeCategory(message.category),
      sessionPath,
    }
  })
}

/** 合并更早一页消息：按 id 去重、按时间升序（兼容后端分页）。 */
export function mergeOlderMessages(
  current: readonly ChatMessage[],
  older: readonly ChatMessage[],
): ChatMessage[] {
  const seen = new Set(current.map((message) => message.id))
  const merged = [...older.filter((message) => !seen.has(message.id)), ...current]
  return merged.sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
}

/** 当前视口应高亮的消息：取可见消息中最早的一条（视口顶部）。 */
export function pickActiveTick(visibleIds: readonly string[], orderedIds: readonly string[]): string | null {
  const visible = new Set(visibleIds)
  for (const id of orderedIds) {
    if (visible.has(id)) return id
  }
  return null
}

export const HISTORY_PAGE_SIZE = 50

/** 是否值得显示「加载更早消息」：当前列表达到一页（后端分页兼容的启发式）。 */
export function shouldOfferOlder(messages: readonly ChatMessage[], pageSize = HISTORY_PAGE_SIZE): boolean {
  return messages.length >= pageSize
}
