// features/chat/message-meta.ts —— 消息分类 / 会话路径 / 预览摘要（M14，纯逻辑可单测）
//
// 契约：docs/m14-contract.md §1/§2/§3/§4。
//   分类仅 agent：requirement(需求提出)/clarification(需求澄清)/progress(进度汇报)/consultation(信息咨询)；
//   （旧消息的 delivery 兼容归入 progress）；sessionPath 从根到当前 [{id,title}]，
//   >3 级折叠中间；预览摘要 ≤120 字。

import type { ChatMessage, SessionMetaEntry, SessionPathItem } from '../../platform/types.ts'
import { toSessionPath } from '../../platform/types.ts'

export const MESSAGE_CATEGORIES = ['requirement', 'clarification', 'progress', 'consultation'] as const
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number]

const CATEGORY_ALIASES: Record<string, MessageCategory> = {
  requirement: 'requirement',
  requirement_proposal: 'requirement',
  req: 'requirement',
  clarification: 'clarification',
  clarify: 'clarification',
  progress: 'progress',
  // 旧后端/旧消息的 delivery 归入「进度汇报」
  delivery: 'progress',
  deliver: 'progress',
  report: 'progress',
  task_delivery: 'progress',
  consultation: 'consultation',
  consult: 'consultation',
  inquiry: 'consultation',
  question: 'consultation',
}

export function normalizeCategory(value: string | undefined | null): MessageCategory | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return CATEGORY_ALIASES[normalized] ?? null
}

export interface CategoryMeta {
  label: string
  tone: 'accent' | 'warn' | 'ok' | 'muted'
  /** 消息头徽标 */
  badgeClass: string
  /** 时间轴 tick（契约：user=accent，progress=ok，clarification=warn，requirement=accent-strong，consultation=muted） */
  tickClass: string
}

export const CATEGORY_META: Record<MessageCategory, CategoryMeta> = {
  requirement: {
    label: '需求提出',
    tone: 'accent',
    badgeClass: 'border-accent-border bg-accent-soft text-accent-hover',
    tickClass: 'bg-accent ring-1 ring-accent-border',
  },
  clarification: {
    label: '需求澄清',
    tone: 'warn',
    badgeClass: 'border-warn-border bg-warn-soft text-warn-ink',
    tickClass: 'bg-warn',
  },
  progress: {
    label: '进度汇报',
    tone: 'ok',
    badgeClass: 'border-ok-border bg-ok-soft text-ok-ink',
    tickClass: 'bg-ok',
  },
  consultation: {
    label: '信息咨询',
    tone: 'muted',
    badgeClass: 'border-border-subtle bg-surface-sunken text-muted',
    tickClass: 'bg-muted',
  },
}

export function categoryMeta(category: string | undefined | null): CategoryMeta | null {
  const normalized = normalizeCategory(category)
  return normalized ? CATEGORY_META[normalized] : null
}

export function normalizeSessionPath(value: unknown): SessionPathItem[] {
  return toSessionPath(value)
}

/**
 * 会话路径：优先消息自带的 sessionPath（HTTP/WS 返回），旧消息按 sessionMeta.parentId 回溯；
 * 无 meta 时至少回退到 sessionTitle（不可跳转）。
 */
export function deriveSessionPath(
  message: Pick<ChatMessage, 'sessionId' | 'sessionTitle' | 'sessionPath'>,
  meta: Map<string, SessionMetaEntry>,
): SessionPathItem[] {
  const provided = normalizeSessionPath(message.sessionPath)
  if (provided.length > 0) return provided
  const sessionId = message.sessionId
  if (!sessionId) {
    return message.sessionTitle ? [{ id: '', title: message.sessionTitle }] : []
  }
  const chain: SessionPathItem[] = []
  const seen = new Set<string>()
  let current: string | undefined = sessionId
  while (current && !seen.has(current) && chain.length < 16) {
    seen.add(current)
    const entry = meta.get(current)
    const title = entry?.title ?? (current === sessionId ? message.sessionTitle ?? current : current)
    chain.push({ id: current, title })
    current = entry?.parentId
  }
  if (chain.length === 0) {
    return message.sessionTitle ? [{ id: sessionId, title: message.sessionTitle }] : [{ id: sessionId, title: sessionId }]
  }
  return chain.reverse()
}

export type BreadcrumbPart =
  | { kind: 'item'; item: SessionPathItem }
  | { kind: 'ellipsis'; hidden: SessionPathItem[] }

/** >3 级折叠中间：保留第一级与最后两级，中间折叠为 …。 */
export function collapseSessionPath(path: readonly SessionPathItem[]): BreadcrumbPart[] {
  if (path.length <= 3) return path.map((item) => ({ kind: 'item', item }))
  const hidden = path.slice(1, path.length - 2)
  return [
    { kind: 'item', item: path[0] as SessionPathItem },
    { kind: 'ellipsis', hidden },
    ...path.slice(-2).map((item) => ({ kind: 'item' as const, item })),
  ]
}

export function sessionPathText(path: readonly SessionPathItem[]): string {
  return path.map((item) => item.title).join(' › ')
}

/** 预览摘要：压空白、≤120 字（按词/空格回退，截断加省略号）。 */
export function truncateSummary(text: string, maxLength = 120): string {
  const plain = text.replace(/\s+/g, ' ').trim()
  if (plain.length <= maxLength) return plain
  let cut = plain.slice(0, Math.max(1, maxLength - 1))
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > maxLength * 0.6) cut = cut.slice(0, lastSpace)
  cut = cut.replace(/[\s,，。；;:：、]+$/, '')
  return `${cut}…`
}
