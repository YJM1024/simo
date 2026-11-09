// features/memory/browser.ts —— 记忆浏览器 v0.3 数据归一化（纯逻辑可单测）
//
// 契约：docs/m21-memory-contract.md §3/§5/§6 + design/24 v0.3.1。
//   types: scene|semantic|norm|procedural|working
//   entities: domain|project|conversation|task|agent
//   pyramid levels L0–L4；relations 带类型/方向/来源；冲突 disputed 只读。
// 后端未就绪时组件显示空态/说明，不伪造数据。

import { isRecord, readNumber, readString } from '../../platform/types.ts'
import { normalizeItem, toTimestamp, type MemoryItem } from './model.ts'

export const MEMORY_TYPES = [
  { id: 'scene', label: '场景' },
  { id: 'semantic', label: '语义' },
  { id: 'norm', label: '规范' },
  { id: 'procedural', label: '程序' },
  { id: 'working', label: '工作' },
] as const

export type MemoryType = (typeof MEMORY_TYPES)[number]['id']

export const ENTITY_KIND_LABEL: Record<string, string> = {
  domain: '领域',
  project: '项目',
  conversation: '会话',
  task: '任务',
  agent: '智能体',
}

export const RELATION_LABEL: Record<string, string> = {
  parent_of: '上级',
  belongs_to: '归属',
  about: '关于',
  owned_by: '负责',
  mapped_to: '映射',
  produced: '产出',
  depends_on: '依赖',
  references: '引用',
  supersedes: '取代',
  conflicts_with: '冲突',
}

export const LAYER_META: Array<{ level: number; label: string; hint: string }> = [
  { level: 0, label: 'L0 原始/工作', hint: 'raw / 工作记忆' },
  { level: 1, label: 'L1 会话', hint: '单会话摘要' },
  { level: 2, label: 'L2 任务/项目', hint: '任务与项目视图' },
  { level: 3, label: 'L3 领域', hint: '长期领域记忆' },
  { level: 4, label: 'L4 全局', hint: '全局抽象' },
]

const TYPE_ALIAS: Record<string, MemoryType> = {
  scene: 'scene',
  semantic: 'semantic',
  norm: 'norm',
  procedural: 'procedural',
  working: 'working',
}

/** 旧 kind → v0.3 type（双写期兼容；前端不依赖 kind）。 */
const KIND_TO_TYPE: Record<string, MemoryType> = {
  fact: 'semantic',
  decision: 'norm',
  requirement: 'norm',
  constraint: 'norm',
  preference: 'norm',
  progress: 'working',
  open_question: 'working',
  experience: 'scene',
}

export function normalizeMemoryType(value: string | undefined, kind?: string): MemoryType {
  const normalized = (value ?? '').trim().toLowerCase()
  if (TYPE_ALIAS[normalized]) return TYPE_ALIAS[normalized] as MemoryType
  return KIND_TO_TYPE[(kind ?? '').trim().toLowerCase()] ?? 'scene'
}

export function memoryTypeLabel(type: string): string {
  return MEMORY_TYPES.find((entry) => entry.id === type)?.label ?? type
}

export interface EntityRef {
  id: string
  name: string
  role: string
}

export interface BrowserMemoryItem extends MemoryItem {
  type: MemoryType
  subType: string
  entityRefs: EntityRef[]
  attributedTo: string | null
  ownerAgent: string | null
  layer: number
  validFrom: number | null
  validUntil: number | null
}

function normalizeEntityRefs(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) return []
  const refs: EntityRef[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry) refs.push({ id: entry, name: entry, role: '' })
      continue
    }
    if (!isRecord(entry)) continue
    const id = readString(entry, 'id') ?? readString(entry, 'entityId') ?? readString(entry, 'entity_id')
    if (!id) continue
    refs.push({ id, name: readString(entry, 'name') ?? readString(entry, 'title') ?? id, role: readString(entry, 'role') ?? '' })
  }
  return refs
}

export function normalizeBrowserItem(value: unknown): BrowserMemoryItem | null {
  const base = normalizeItem(value)
  if (!base || !isRecord(value)) return null
  const type = normalizeMemoryType(readString(value, 'type'), base.kind)
  return {
    ...base,
    type,
    subType: readString(value, 'subType') ?? readString(value, 'sub_type') ?? '',
    entityRefs: normalizeEntityRefs(value['entityRefs'] ?? value['entity_refs']),
    attributedTo: readString(value, 'attributedTo') ?? readString(value, 'attributed_to') ?? null,
    ownerAgent: readString(value, 'ownerAgent') ?? readString(value, 'owner_agent') ?? null,
    layer: readNumber(value, 'layer') ?? 0,
    validFrom: toTimestamp(value['validFrom'] ?? value['valid_from']),
    validUntil: toTimestamp(value['validUntil'] ?? value['valid_until']),
  }
}

function extractArray(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  const value = payload[key]
  if (Array.isArray(value)) return value
  for (const fallback of ['items', 'data', 'list']) {
    const nested = payload[fallback]
    if (Array.isArray(nested)) return nested
    if (isRecord(nested) && Array.isArray(nested[key])) return nested[key] as unknown[]
  }
  return []
}

export function normalizeBrowserItems(payload: unknown): BrowserMemoryItem[] {
  const seen = new Set<string>()
  const items: BrowserMemoryItem[] = []
  for (const entry of extractArray(payload, 'items')) {
    const item = normalizeBrowserItem(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  return items
}

export interface MemoryEntity {
  id: string
  kind: string
  name: string
  canonicalName: string
  aliases: string[]
  parentId: string | null
  ownerAgent: string | null
  status: string
  version: number | null
  createdAt: number | null
  updatedAt: number | null
}

export function normalizeEntity(value: unknown): MemoryEntity | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const rawAliases = value['aliases']
  return {
    id,
    kind: readString(value, 'kind') ?? 'domain',
    name: readString(value, 'name') ?? id,
    canonicalName: readString(value, 'canonicalName') ?? readString(value, 'canonical_name') ?? '',
    aliases: Array.isArray(rawAliases) ? rawAliases.filter((alias): alias is string => typeof alias === 'string') : [],
    parentId: readString(value, 'parentId') ?? readString(value, 'parent_id') ?? null,
    ownerAgent: readString(value, 'ownerAgent') ?? readString(value, 'owner_agent') ?? null,
    status: readString(value, 'status') ?? 'active',
    version: readNumber(value, 'version') ?? null,
    createdAt: toTimestamp(value['createdAt'] ?? value['created_at']),
    updatedAt: toTimestamp(value['updatedAt'] ?? value['updated_at']),
  }
}

export function normalizeEntities(payload: unknown): MemoryEntity[] {
  const seen = new Set<string>()
  const entities: MemoryEntity[] = []
  for (const entry of extractArray(payload, 'entities')) {
    const entity = normalizeEntity(entry)
    if (!entity || seen.has(entity.id)) continue
    seen.add(entity.id)
    entities.push(entity)
  }
  return entities
}

export function entityKindLabel(kind: string): string {
  return ENTITY_KIND_LABEL[kind] ?? kind
}

export interface MemoryRelation {
  id: string
  fromEntity: string
  toEntity: string
  relType: string
  source: string
  confidence: number | null
  validFrom: number | null
  validTo: number | null
  /** 目标实体显示名（若响应带 target 对象） */
  toName: string | null
}

export function normalizeRelation(value: unknown): MemoryRelation | null {
  if (!isRecord(value)) return null
  const endpoint = (raw: unknown): string => {
    if (typeof raw === 'string') return raw
    if (isRecord(raw)) return readString(raw, 'id') ?? ''
    return ''
  }
  const fromRaw = value['fromEntity'] ?? value['from_entity'] ?? value['from']
  const toRaw = value['toEntity'] ?? value['to_entity'] ?? value['to']
  const fromEntity = endpoint(fromRaw)
  const toEntity = endpoint(toRaw)
  if (!fromEntity || !toEntity) return null
  const target = isRecord(toRaw) ? toRaw : isRecord(value['target']) ? value['target'] : null
  return {
    id: readString(value, 'id') ?? `${fromEntity}:${toEntity}`,
    fromEntity,
    toEntity,
    relType: readString(value, 'relType') ?? readString(value, 'rel_type') ?? readString(value, 'type') ?? 'references',
    source: readString(value, 'source') ?? '',
    confidence: readNumber(value, 'confidence') ?? null,
    validFrom: toTimestamp(value['validFrom'] ?? value['valid_from']),
    validTo: toTimestamp(value['validTo'] ?? value['valid_to']),
    toName: target ? readString(target, 'name') ?? null : null,
  }
}

export function normalizeRelations(payload: unknown): MemoryRelation[] {
  return extractArray(payload, 'relations')
    .map((entry) => normalizeRelation(entry))
    .filter((relation): relation is MemoryRelation => relation !== null)
}

export function relationLabel(relType: string): string {
  return RELATION_LABEL[relType] ?? relType
}

export interface EntityDetail {
  entity: MemoryEntity
  relations: MemoryRelation[]
  recent: BrowserMemoryItem[]
  memoryCounts: Record<string, number>
}

export function normalizeEntityDetail(payload: unknown, fallback: MemoryEntity): EntityDetail {
  const root = isRecord(payload) ? payload : {}
  const entityRaw = isRecord(root['entity']) ? (root['entity'] as Record<string, unknown>) : root
  const entity = normalizeEntity(entityRaw) ?? fallback
  const countsRaw = isRecord(root['memoryCounts'])
    ? root['memoryCounts']
    : isRecord(root['memory_counts'])
      ? root['memory_counts']
      : isRecord(entityRaw['memoryCounts'])
        ? entityRaw['memoryCounts']
        : entityRaw['memory_counts']
  const memoryCounts: Record<string, number> = {}
  if (isRecord(countsRaw)) {
    for (const [key, value] of Object.entries(countsRaw)) {
      if (typeof value === 'number') memoryCounts[key] = value
    }
  }
  const recentRaw = Array.isArray(root['recent']) ? root['recent'] : Array.isArray(entityRaw['recent']) ? entityRaw['recent'] : []
  const recent = normalizeBrowserItems({ items: recentRaw })
  return { entity, relations: normalizeRelations(root), recent, memoryCounts }
}

export interface BrowserConflict {
  id: string
  status: string
  askPolicy: string
  reason: string
  items: BrowserMemoryItem[]
}

export function normalizeBrowserConflicts(payload: unknown): BrowserConflict[] {
  return extractArray(payload, 'conflicts')
    .map((entry) => {
      if (!isRecord(entry)) return null
      const items = normalizeBrowserItems({ items: Array.isArray(entry['items']) ? entry['items'] : [] })
      return {
        id: readString(entry, 'id') ?? `conflict-${items.map((item) => item.id).join('-')}`,
        status: readString(entry, 'status') ?? 'disputed',
        askPolicy: readString(entry, 'askPolicy') ?? readString(entry, 'ask_policy') ?? '',
        reason: readString(entry, 'reason') ?? '',
        items,
      }
    })
    .filter((conflict): conflict is BrowserConflict => conflict !== null)
}

export interface AgentMemoryAgent {
  id: string
  name: string
  personaVersion: string
  memoryCount: number
}

export function normalizeAgentList(payload: unknown): AgentMemoryAgent[] {
  return extractArray(payload, 'agents')
    .map((entry) => {
      if (!isRecord(entry)) return null
      const id = readString(entry, 'id')
      if (!id) return null
      return {
        id,
        name: readString(entry, 'name') ?? id,
        personaVersion: readString(entry, 'personaVersion') ?? readString(entry, 'persona_version') ?? '',
        memoryCount: readNumber(entry, 'memoryCount') ?? readNumber(entry, 'memory_count') ?? 0,
      }
    })
    .filter((agent): agent is AgentMemoryAgent => agent !== null)
}

export interface PyramidNode {
  id: string
  entityId: string
  level: number
  viewId: string
  kind: string
  text: string
  coverage: number | null
  status: string
  sourceCount: number | null
  builtAt: number | null
}

export function normalizePyramid(payload: unknown): PyramidNode[] {
  return extractArray(payload, 'nodes')
    .map((entry) => {
      if (!isRecord(entry)) return null
      const id = readString(entry, 'id')
      if (!id) return null
      return {
        id,
        entityId: readString(entry, 'entityId') ?? readString(entry, 'entity_id') ?? '',
        level: Math.max(0, Math.min(4, readNumber(entry, 'level') ?? 0)),
        viewId: readString(entry, 'viewId') ?? readString(entry, 'view_id') ?? '',
        kind: readString(entry, 'kind') ?? 'summary',
        text: readString(entry, 'text') ?? '',
        coverage: readNumber(entry, 'coverage') ?? null,
        status: readString(entry, 'status') ?? 'active',
        sourceCount: readNumber(entry, 'sourceCount') ?? readNumber(entry, 'source_count') ?? null,
        builtAt: toTimestamp(entry['builtAt'] ?? entry['built_at']),
      }
    })
    .filter((node): node is PyramidNode => node !== null)
}

export const PYRAMID_VIEWS = [
  { id: 'what_happened', label: '发生了什么' },
  { id: 'what_is', label: '是什么' },
  { id: 'what_should', label: '应该怎样' },
  { id: 'how_to', label: '怎么做' },
  { id: 'current_state', label: '当前状态' },
] as const

/** 由记忆条目实体引用派生实体列表（实体 API 未就绪时降级，不伪造）。 */
export function entitiesFromItems(items: readonly BrowserMemoryItem[]): MemoryEntity[] {
  const map = new Map<string, MemoryEntity>()
  for (const item of items) {
    for (const ref of item.entityRefs) {
      if (map.has(ref.id)) continue
      map.set(ref.id, {
        id: ref.id,
        kind: 'domain',
        name: ref.name,
        canonicalName: '',
        aliases: [],
        parentId: null,
        ownerAgent: item.ownerAgent,
        status: 'active',
        version: null,
        createdAt: null,
        updatedAt: null,
      })
    }
  }
  return [...map.values()]
}

export function sourceLabel(source: string): string {
  if (source === 'user') return '用户'
  if (source === 'conversation') return '对话'
  if (source === 'tool') return '工具'
  if (source === 'inferred') return '推断'
  return source || '未知'
}
