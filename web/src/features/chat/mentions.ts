// features/chat/mentions.ts —— 输入框 @ 引用（UI-1，纯逻辑）
//
// 检测光标前的 @query → 候选会话/文件 → 插入 `@标签 ` 到草稿；不改变发送协议（文本引用）。

import type { ChatMessage } from '../../platform/types.ts'

export interface MentionItem {
  kind: 'session' | 'file'
  id: string
  label: string
  subtitle?: string
}

export interface MentionTrigger {
  /** '@' 在文本中的下标 */
  start: number
  query: string
}

/** 光标前最近的 `@`（前面是行首/空白，query 不含空白）。 */
export function detectMentionTrigger(text: string, caret: number): MentionTrigger | null {
  const before = text.slice(0, Math.max(0, Math.min(caret, text.length)))
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  const query = match[2] ?? ''
  return { start: before.length - query.length - 1, query }
}

export function filterMentions(items: readonly MentionItem[], query: string): MentionItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...items].slice(0, 30)
  return items
    .filter((item) => `${item.label} ${item.subtitle ?? ''} ${item.kind}`.toLowerCase().includes(needle))
    .slice(0, 30)
}

/** 用 `@label ` 替换触发区间，返回新文本与光标位置。 */
export function insertMention(
  text: string,
  trigger: MentionTrigger,
  label: string,
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(trigger.start, text.length))
  const after = text.slice(start + trigger.query.length + 1)
  const inserted = `@${label} `
  const next = `${text.slice(0, start)}${inserted}${after}`
  return { text: next, caret: start + inserted.length }
}

/** 会话候选：标题 + “会话”副标题。 */
export function normalizeMentionSessions(payload: unknown): MentionItem[] {
  const source = Array.isArray(payload) ? payload : (payload as { sessions?: unknown[] } | null)?.sessions
  if (!Array.isArray(source)) return []
  const items: MentionItem[] = []
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : null
    const title = typeof record.title === 'string' ? record.title : id
    if (!id) continue
    items.push({ kind: 'session', id, label: title || id, subtitle: '会话' })
  }
  return items
}

/** 文件候选：来自 /api/sessions/{id}/files。 */
export function normalizeMentionFiles(payload: unknown): MentionItem[] {
  const source = Array.isArray(payload) ? payload : (payload as { files?: unknown[] } | null)?.files
  if (!Array.isArray(source)) return []
  const items: MentionItem[] = []
  for (const entry of source) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : null
    const name = typeof record.name === 'string' ? record.name : id
    if (!id || !name) continue
    const kind = typeof record.kind === 'string' ? record.kind : 'file'
    items.push({ kind: 'file', id, label: name, subtitle: kind === 'artifact' ? '任务产物' : kind === 'upload' ? '消息附件' : '文件' })
  }
  return items
}

/** 重试时用来重发的文本：agent 消息→上一条用户消息；用户消息→自身。 */
export function retryPrompt(messages: readonly ChatMessage[], index: number): string | null {
  const message = messages[index]
  if (!message) return null
  if (message.role === 'user') return message.text.trim() || null
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = messages[cursor]
    if (previous?.role === 'user' && previous.text.trim()) return previous.text
  }
  return null
}

export async function copyMessageText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 剪贴板权限失败 → 尝试旧 fallback
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
