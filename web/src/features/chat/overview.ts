// features/chat/overview.ts —— 会话概览（M11，只读）
//
// 契约：docs/m11-contract.md §3：
//   GET  /api/sessions/{id}/overview          → {ok,overview:{goal,constraints,current,completed,pending,notes,timeline,updatedAt,version}}
//   POST /api/sessions/{id}/overview/refresh  → 生成/更新（用户点「更新概览」才触发）
// 概览只读、自然汇报体；不暴露 内部字段名。

import { apiGet, apiPost } from '../../platform/http.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'

export interface OverviewTimelineEntry {
  /** 毫秒时间戳（缺省 null） */
  at: number | null
  text: string
}

export interface OverviewLists {
  constraints: string[]
  completed: string[]
  pending: string[]
  timeline: string[]
}

export interface SessionOverview {
  goal: string
  constraints: string
  current: string
  completed: string
  pending: string
  notes: string
  timeline: string
  /** M14-E：列表化的已完成/待办/时间线/约束（兼容后端数组或旧字符串） */
  lists: OverviewLists
  /** M14-E：时间线 [{at,text}]（兼容旧字符串；at 缺省为 null） */
  timelineEntries: OverviewTimelineEntry[]
  updatedAt: number | null
  version: number | null
}

export interface OverviewListSection {
  key: keyof OverviewLists
  title: string
  /** done=勾选列表；pending=未勾选列表；ordered=有序列表；list=普通列表 */
  kind: 'done' | 'pending' | 'ordered' | 'list'
  items: string[]
}

const LIST_TITLES: Array<{ key: keyof OverviewLists; title: string; kind: OverviewListSection['kind'] }> = [
  { key: 'constraints', title: '约束', kind: 'list' },
  { key: 'completed', title: '已完成', kind: 'done' },
  { key: 'pending', title: '待办', kind: 'pending' },
  { key: 'timeline', title: '时间线', kind: 'ordered' },
]

export interface OverviewSection {
  key: keyof Pick<SessionOverview, 'goal' | 'constraints' | 'current' | 'completed' | 'pending' | 'notes' | 'timeline'>
  title: string
  paragraphs: string[]
}

const SECTION_TITLES: Array<{ key: OverviewSection['key']; title: string }> = [
  { key: 'goal', title: '目标' },
  { key: 'constraints', title: '约束' },
  { key: 'current', title: '现状' },
  { key: 'completed', title: '已完成' },
  { key: 'pending', title: '待办' },
  { key: 'notes', title: '备注' },
  { key: 'timeline', title: '时间线' },
]

/** 字符串/字符串数组 → 段落文本（数组按句拼接，保持完整句子）。 */
function toProse(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter((entry) => entry.length > 0)
      .join(' ')
  }
  if (isRecord(value)) {
    for (const key of ['text', 'summary', 'description', 'content']) {
      const text = readString(value, key)
      if (text) return text.trim()
    }
  }
  return ''
}

function stripListItem(value: string): string {
  return value
    .replace(/^\s*(?:[-*•·]|\d+[.)、]|[\u2705\u2610\u2714\u2611])\s*/, '')
    .trim()
}

/** 数组或旧字符串 → 列表项（数组逐项；字符串按换行/分号拆分并去项目符号）。 */
export function toOverviewItems(value: unknown): string[] {
  const raw: string[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') raw.push(entry)
      else if (isRecord(entry)) {
        const text = readString(entry, 'text') ?? readString(entry, 'summary') ?? readString(entry, 'content')
        if (text) raw.push(text)
      }
    }
  } else if (typeof value === 'string') {
    raw.push(...value.replace(/\r\n?/g, '\n').split(/\n|；|;/))
  }
  return raw.map(stripListItem).filter((item) => item.length > 0).slice(0, 100)
}

function normalizeTimelineEntryAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 兼容秒级时间戳
    return value > 0 && value < 1_000_000_000_000 ? Math.round(value * 1000) : value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/** 时间线：后端 [{at,text}] 或旧字符串/字符串数组；保留时间用于 age 前缀。 */
export function toTimelineEntries(value: unknown): OverviewTimelineEntry[] {
  const entries: OverviewTimelineEntry[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') {
        const text = stripListItem(entry)
        if (text) entries.push({ at: null, text })
        continue
      }
      if (!isRecord(entry)) continue
      const text = readString(entry, 'text') ?? readString(entry, 'summary') ?? readString(entry, 'content')
      if (!text) continue
      const at =
        normalizeTimelineEntryAt(entry['at']) ??
        normalizeTimelineEntryAt(entry['atMs']) ??
        normalizeTimelineEntryAt(entry['at_ms']) ??
        normalizeTimelineEntryAt(entry['time'])
      entries.push({ at, text: stripListItem(text) })
    }
  } else if (typeof value === 'string') {
    for (const line of value.replace(/\r\n?/g, '\n').split(/\n|；|;/)) {
      const text = stripListItem(line)
      if (text) entries.push({ at: null, text })
    }
  }
  return entries.slice(0, 100)
}

/** 时间前缀：24h 内 HH:mm；超 1 天 M月D日；超 1 月 YYYY年M月；超 1 年 YYYY年。 */
export function formatTimelineAge(at: number | null, now = Date.now()): string {
  if (at === null) return ''
  const diff = Math.max(0, now - at)
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  if (diff < 24 * 3_600_000) return `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (diff < 30 * 24 * 3_600_000) return `${date.getMonth() + 1}月${date.getDate()}日`
  if (diff < 365 * 24 * 3_600_000) return `${date.getFullYear()}年${date.getMonth() + 1}月`
  return `${date.getFullYear()}年`
}

/** 时间线有序列表项：时间前缀 + 完整句子（越老越概括由前缀体现）。 */
export function timelineListItems(
  overview: SessionOverview,
  now = Date.now(),
): Array<{ prefix: string; text: string }> {
  const entries =
    overview.timelineEntries.length > 0 ? overview.timelineEntries : toTimelineEntries(overview.timeline)
  return entries.map((entry) => ({ prefix: formatTimelineAge(entry.at, now), text: entry.text }))
}

function unwrapOverview(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  for (const key of ['overview', 'data', 'item']) {
    const value = payload[key]
    if (isRecord(value)) return value
  }
  return payload
}

export function normalizeOverview(payload: unknown): SessionOverview | null {
  const source = unwrapOverview(payload)
  if (!source) return null
  const overview: SessionOverview = {
    goal: toProse(source['goal']),
    constraints: toProse(source['constraints']),
    current: toProse(source['current']),
    completed: toProse(source['completed']),
    pending: toProse(source['pending']),
    notes: toProse(source['notes']),
    timeline: toProse(source['timeline']),
    lists: {
      constraints: toOverviewItems(source['constraints']),
      completed: toOverviewItems(source['completed']),
      pending: toOverviewItems(source['pending']),
      timeline: toOverviewItems(source['timeline']),
    },
    timelineEntries: toTimelineEntries(source['timeline']),
    updatedAt: readNumber(source, 'updatedAt') ?? readNumber(source, 'updated_at') ?? null,
    version: readNumber(source, 'version') ?? null,
  }
  return isOverviewEmpty(overview) && overview.updatedAt === null ? null : overview
}

export function isOverviewEmpty(overview: SessionOverview | null): boolean {
  if (!overview) return true
  return SECTION_TITLES.every(({ key }) => overview[key].length === 0)
}

/** 只保留有内容的段落（按自然汇报顺序）；timeline 段落保持「先…随后…然后…」叙述。 */
export function overviewSections(overview: SessionOverview): OverviewSection[] {
  const sections: OverviewSection[] = []
  for (const { key, title } of SECTION_TITLES) {
    const text = overview[key].replace(/\r\n?/g, '\n').trim()
    if (!text) continue
    const paragraphs = text
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
      .filter((paragraph) => paragraph.length > 0)
    sections.push({ key, title, paragraphs: paragraphs.length > 0 ? paragraphs : [text] })
  }
  return sections
}

/** 自然段字段（目标/现状/备注）：保持完整句子段落。 */
export function overviewProseSections(overview: SessionOverview): OverviewSection[] {
  return overviewSections(overview).filter((section) => section.key === 'goal' || section.key === 'current' || section.key === 'notes')
}

/** 列表字段（约束/已完成/待办/时间线）；空列表不返回。 */
export function overviewListSections(overview: SessionOverview): OverviewListSection[] {
  const sections: OverviewListSection[] = []
  for (const { key, title, kind } of LIST_TITLES) {
    const items = overview.lists[key].length > 0 ? overview.lists[key] : toOverviewItems(overview[key])
    if (items.length === 0) continue
    sections.push({ key, title, kind, items })
  }
  return sections
}

export function formatOverviewTime(at: number | null): string {
  if (at === null) return ''
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fetchSessionOverview(sessionId: string, signal?: AbortSignal): Promise<unknown> {
  return apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/overview`, signal ? { signal } : {})
}

export function refreshSessionOverview(sessionId: string): Promise<unknown> {
  return apiPost(`/api/sessions/${encodeURIComponent(sessionId)}/overview/refresh`, {})
}
