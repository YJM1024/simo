// features/memory/model.ts —— 记忆只读页的数据归一化与文案（纯函数，可单测）
//
// 契约：docs/m3-contract.md §2（条目字段）§4（只读 API 与冲突结构）。
// 后端返回：
//   GET /api/memory/items?scope=&q=&status=&limit= → {ok, items:[...], total, query}
//   GET /api/memory/scopes                        → {ok, scopes:[{scope,count}]}
//   GET /api/memory/conflicts                     → {ok, conflicts:[{id,scope,kind,status,items:[...]}]}
// 字段：id/kind/scope/content/source/authority/confidence/status/version/createdAt/updatedAt/refs。
//
// 只读页同时兼容 design/12 全量 schema（provenance/recordedAt/conflictsWith）做防御，
// 但以 m3-contract 为准。用户可见页默认排除内部 kind（design/22 §1.3）。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export interface MemoryItem {
  id: string
  kind: string
  scope: string
  text: string
  authority: string
  source: string
  confidence: number | null
  status: string
  version: number | null
  createdAt: number | null
  updatedAt: number | null
  refs: string[]
}

/** 一条冲突记录（契约：{id, scope, kind, status:"disputed", items:[...]}）。 */
export interface MemoryConflict {
  id: string
  scope: string
  kind: string
  status: string
  items: MemoryItem[]
  reason?: string
}

export interface ScopeOption {
  scope: string
  count: number | null
}

export const KIND_LABEL: Record<string, string> = {
  fact: '事实',
  decision: '决策',
  requirement: '需求',
  progress: '进展',
  experience: '经验',
  preference: '偏好',
  constraint: '约束',
  open_question: '未决',
}

export const STATUS_LABEL: Record<string, string> = {
  active: '生效',
  candidate: '候选',
  disputed: '冲突',
  superseded: '已取代',
  archived: '已归档',
  retracted: '已撤回',
  expired: '已过期',
}

export const AUTHORITY_LABEL: Record<string, string> = {
  user_confirmed: '用户确认',
  system_verified: '系统验证',
  agent_inferred: '推断',
  inferred: '推断',
  user: '用户',
  tool: '工具',
  conversation: '对话',
  document: '文档',
}

/** 内部 kind / 未确认草稿：默认不在用户可见页展示（design/22 §1.3）。 */
export function isVisibleItem(item: MemoryItem): boolean {
  if (item.kind === 'spec') return false
  if (item.kind === 'decision' && item.status === 'candidate') return false
  return true
}

/** 时间戳归一化：支持毫秒、秒、数字字符串、RFC3339。 */
export function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value > 1e9 ? value * 1000 : value
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(value.trim())) return toTimestamp(numeric)
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/** 置信度归一化到 0–1（兼容 0–100 的百分比写法）。 */
export function normalizeConfidence(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 0
  if (numeric > 1) return Math.min(1, numeric / 100)
  return numeric
}

function scopeOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (isRecord(value)) return readString(value, 'id') ?? readString(value, 'scope') ?? readString(value, 'name') ?? ''
  return ''
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return ''
  for (const key of ['text', 'content', 'summary', 'title']) {
    const direct = readString(value, key)
    if (direct) return direct
  }
  const data = value['data']
  if (isRecord(data)) {
    for (const key of ['text', 'summary', 'value', 'rule', 'question']) {
      const fromData = readString(data, key)
      if (fromData) return fromData
    }
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  }
  // refs 在 DB 里是 JSON TEXT，API 可能原样返回字符串
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      }
    } catch {
      return [value]
    }
  }
  return []
}

/** 单条记忆归一化；缺 id 的直接丢弃。 */
export function normalizeItem(value: unknown): MemoryItem | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'memoryId')
  if (!id) return null

  const provenance = isRecord(value['provenance']) ? value['provenance'] : undefined
  const authority =
    readString(value, 'authority') ??
    (provenance ? readString(provenance, 'source') : undefined) ??
    readString(value, 'source') ??
    'inferred'
  const source =
    readString(value, 'source') ?? (provenance ? readString(provenance, 'source') : undefined) ?? 'unknown'

  const text =
    textOf(value['content']) || readString(value, 'text') || readString(value, 'summary') || '（无内容）'

  const status = (readString(value, 'status') ?? 'active').toLowerCase()
  const createdAt = toTimestamp(value['createdAt'] ?? value['recordedAt'] ?? value['updatedAt'])
  const updatedAt = toTimestamp(value['updatedAt'] ?? value['recordedAt'] ?? value['createdAt'])

  return {
    id,
    kind: (readString(value, 'kind') ?? 'fact').toLowerCase(),
    scope: scopeOf(value['scope']) || 'global',
    text,
    authority,
    source,
    confidence: normalizeConfidence(value['confidence']),
    status,
    version: readNumber(value, 'version') ?? null,
    createdAt,
    updatedAt,
    refs: stringArray(value['refs']),
  }
}

function pickArray(payload: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value)) {
      const nested = value['items']
      if (Array.isArray(nested)) return nested
    }
  }
  return []
}

/** 列表归一化：契约 {items:[]}；兼容 {memories}/{results}/裸数组；按 id 去重。 */
export function normalizeItems(payload: unknown): MemoryItem[] {
  const raw = pickArray(payload, ['items', 'memories', 'results', 'data'])
  const seen = new Set<string>()
  const items: MemoryItem[] = []
  for (const entry of raw) {
    const item = normalizeItem(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    if (!isVisibleItem(item)) continue
    items.push(item)
  }
  return items
}

/** 作用域列表：契约 {scopes:[{scope,count}]}；兼容字符串数组。 */
export function normalizeScopes(payload: unknown): ScopeOption[] {
  const raw = pickArray(payload, ['scopes', 'items', 'data'])
  const seen = new Set<string>()
  const options: ScopeOption[] = []
  for (const entry of raw) {
    const scope = scopeOf(entry)
    if (!scope || seen.has(scope)) continue
    seen.add(scope)
    options.push({ scope, count: isRecord(entry) ? readNumber(entry, 'count') ?? null : null })
  }
  return options
}

const ITEM_KEYS = ['a', 'b', 'left', 'right', 'first', 'second', 'itemA', 'itemB'] as const

function itemFrom(value: unknown, byId: Map<string, MemoryItem>): MemoryItem | null {
  if (typeof value === 'string') return byId.get(value) ?? normalizeItem(value)
  return normalizeItem(value)
}

function groupFromEntry(entry: unknown, byId: Map<string, MemoryItem>): MemoryConflict | null {
  if (Array.isArray(entry)) {
    const items = entry.map((value) => itemFrom(value, byId)).filter((value): value is MemoryItem => value !== null)
    return items.length >= 2 ? conflictFromItems(items) : null
  }
  if (!isRecord(entry)) return null

  // 契约形态：{id, scope, kind, status:"disputed", items:[{id,content,version,authority}]}
  const rawItems = entry['items']
  if (Array.isArray(rawItems) && rawItems.length >= 2) {
    const items = rawItems.map((value) => itemFrom(value, byId)).filter((value): value is MemoryItem => value !== null)
    if (items.length >= 2) {
      const reason = readString(entry, 'reason') ?? readString(entry, 'conflictReason')
      const group: MemoryConflict = {
        id: readString(entry, 'id') ?? conflictId(items),
        scope: scopeOf(entry['scope']) || items[0]?.scope || 'global',
        kind: readString(entry, 'kind') ?? items[0]?.kind ?? 'fact',
        status: readString(entry, 'status') ?? 'disputed',
        items,
      }
      if (reason !== undefined) group.reason = reason
      return group
    }
  }

  // 兼容旧形态：{a,b} / {left,right}
  const picked = ITEM_KEYS.map((key) => itemFrom(entry[key], byId)).filter(
    (value): value is MemoryItem => value !== null,
  )
  if (picked.length < 2) return null
  const reason = readString(entry, 'reason') ?? readString(entry, 'conflictReason')
  const group = conflictFromItems(picked.slice(0, 2))
  if (reason !== undefined) group.reason = reason
  return group
}

function conflictId(items: readonly MemoryItem[]): string {
  return items
    .map((item) => item.id)
    .sort()
    .join('|')
}

function conflictFromItems(items: readonly MemoryItem[]): MemoryConflict {
  const first = items[0]
  return {
    id: conflictId(items),
    scope: first?.scope ?? 'global',
    kind: first?.kind ?? 'fact',
    status: 'disputed',
    items: [...items],
  }
}

/** 冲突记录归一化（契约 groups + 旧 pair 形态兼容），按条目集合去重。 */
export function normalizeConflicts(payload: unknown, byId: Map<string, MemoryItem>): MemoryConflict[] {
  const raw = pickArray(payload, ['conflicts', 'pairs', 'groups', 'items', 'data'])
  const seen = new Set<string>()
  const groups: MemoryConflict[] = []
  for (const entry of raw) {
    const group = groupFromEntry(entry, byId)
    if (!group) continue
    const key = conflictId(group.items)
    if (seen.has(key)) continue
    seen.add(key)
    groups.push(group)
  }
  return groups
}

/** 后端没提供 conflicts 端点时的兜底：用 conflictsWith 双向指针配对。 */
export function conflictsFromItems(items: readonly MemoryItem[], raw?: readonly unknown[]): MemoryConflict[] {
  // raw（未过滤的原始条目）可能带 conflictsWith；优先用回调方传入的原始列表
  const source = items
  const byId = new Map(source.map((item) => [item.id, item]))
  const seen = new Set<string>()
  const groups: MemoryConflict[] = []
  const rawById = new Map<string, string[]>()
  for (const entry of raw ?? []) {
    if (!isRecord(entry)) continue
    const id = readString(entry, 'id')
    const conflicts = stringArray(entry['conflictsWith'])
    if (id && conflicts.length > 0) rawById.set(id, conflicts)
  }
  for (const item of source) {
    const targets = rawById.get(item.id) ?? []
    for (const targetId of targets) {
      const other = byId.get(targetId)
      if (!other) continue
      const group = conflictFromItems([item, other])
      if (seen.has(group.id)) continue
      seen.add(group.id)
      groups.push(group)
    }
  }
  return groups
}

export function formatTimestamp(value: number | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatConfidence(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value * 100)}%`
}

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

export function authorityLabel(authority: string): string {
  return AUTHORITY_LABEL[authority] ?? authority
}

/** 供外部做计数/调试。 */
export function countByStatus(items: readonly MemoryItem[], status: string): number {
  return items.filter((item) => item.status === status).length
}

/** 从条目里推导作用域下拉选项（scopes 端点不可用时的兜底）。 */
export function scopesFromItems(items: readonly MemoryItem[]): string[] {
  return [...new Set(items.map((item) => item.scope).filter(Boolean))].sort()
}

/** 供 backend 端可能返回 {items: [...]} 的场景复用（导出给测试）。 */
export function extractArray(payload: unknown, keys: readonly string[] = ['items']): unknown[] {
  return pickArray(payload, keys)
}
