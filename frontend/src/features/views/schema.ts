// features/views/schema.ts —— M24 视图 Schema 校验 / 绑定解析（纯逻辑可单测）
//
// 契约：docs/m24-view-contract.md §3/§4/§5/§6/§9/§10。
// 纯声明式 JSON；无 HTML/JS/内联样式；13 种块白名单；未知块整页 fallback（chat/table）。
// 数据绑定只能引用只读动作（动作目录权威）；动作绑定统一走 /api/actions/{name}。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export const BLOCK_TYPES = [
  'chat',
  'form',
  'ask',
  'action',
  'deliverable',
  'text',
  'markdown',
  'table',
  'image',
  'progress',
  'timeline',
  'dag',
  'kanban',
  'chart',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_META: Record<BlockType, { label: string; fallback: string }> = {
  chat: { label: '对话消息', fallback: 'text' },
  form: { label: '表单', fallback: 'text' },
  ask: { label: '提问', fallback: 'text' },
  action: { label: '动作按钮', fallback: 'text' },
  deliverable: { label: '交付物', fallback: 'table' },
  text: { label: '文本', fallback: 'text' },
  markdown: { label: 'Markdown', fallback: 'text' },
  table: { label: '表格', fallback: 'text' },
  image: { label: '图片', fallback: 'text' },
  progress: { label: '进度', fallback: 'text' },
  timeline: { label: '时间线', fallback: 'table' },
  dag: { label: '工作流 DAG', fallback: 'table' },
  kanban: { label: '任务看板', fallback: 'table' },
  chart: { label: '图表', fallback: 'table' },
}

export interface ViewDataBinding {
  action: string
  args: Record<string, unknown>
  select: string
  fields: string[]
  refreshOn: string[]
  maxEverySec: number | null
}

export interface ViewActionBinding {
  id: string
  action: string
  args: Record<string, unknown>
  confirm: 'none' | 'risk' | 'always'
}

export interface ViewBlock {
  id: string
  type: BlockType
  props: Record<string, unknown>
  data: ViewDataBinding | null
  actions: ViewActionBinding[]
}

export interface ViewArea {
  block: string
  colSpan: number
}

export interface ViewLayout {
  kind: 'rows' | 'grid'
  columns: number
  gap: string
  areas: ViewArea[]
}

export interface ViewEquivalence {
  chatPrompt: string
  actionSequence: Array<{ action: string; args?: Record<string, unknown> }>
  steps: string[]
}

export interface ViewPage {
  schemaVersion: 1
  id: string
  sessionId: string
  title: string
  layout: ViewLayout
  blocks: ViewBlock[]
  equivalence: ViewEquivalence | null
  meta: Record<string, unknown>
}

export interface ViewValidation {
  ok: boolean
  page: ViewPage | null
  errors: string[]
  /** 未知 block type：整页 fallback（chat/table），不白屏 */
  fallback: boolean
  unsupportedTypes: string[]
}

const ALLOWED_PAGE_KEYS = new Set(['schemaVersion', 'id', 'sessionId', 'title', 'layout', 'blocks', 'equivalence', 'meta'])
const FORBIDDEN_KEY_RE = /^(html|script|jsx|component|style|expression|template|dangerouslysetinnerhtml|on[a-z]+)$/i
const MAX_SIZE = 256 * 1024

function collectForbiddenKeys(value: unknown, path = ''): string[] {
  const found: string[] = []
  if (Array.isArray(value)) {
    value.forEach((entry, index) => found.push(...collectForbiddenKeys(entry, `${path}[${index}]`)))
    return found
  }
  if (!isRecord(value)) return found
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEY_RE.test(key)) found.push(`${path}.${key}`)
    if (typeof child === 'string' && (/<script/i.test(child) || /javascript:/i.test(child))) {
      found.push(`${path}.${key}:unsafe-value`)
    }
    found.push(...collectForbiddenKeys(child, `${path}.${key}`))
  }
  return found
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {}
}

function normalizeData(value: unknown): ViewDataBinding | null {
  if (!isRecord(value)) return null
  const action = readString(value, 'action')
  if (!action) return null
  const refresh = isRecord(value['refresh']) ? value['refresh'] : {}
  return {
    action,
    args: normalizeArgs(value['args']),
    select: readString(value, 'select') ?? '',
    fields: Array.isArray(value['fields']) ? value['fields'].filter((field): field is string => typeof field === 'string') : [],
    refreshOn: Array.isArray(refresh['on']) ? refresh['on'].filter((event): event is string => typeof event === 'string') : [],
    maxEverySec: readNumber(refresh, 'maxEverySec') ?? null,
  }
}

function normalizeActions(value: unknown): ViewActionBinding[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry, index): ViewActionBinding | null => {
      if (!isRecord(entry)) return null
      const action = readString(entry, 'action')
      if (!action) return null
      const confirm = readString(entry, 'confirm')
      return {
        id: readString(entry, 'id') ?? `action-${index}`,
        action,
        args: normalizeArgs(entry['args']),
        confirm: confirm === 'risk' || confirm === 'always' ? confirm : 'none',
      }
    })
    .filter((binding): binding is ViewActionBinding => binding !== null)
}

function normalizeBlock(value: unknown, index: number, errors: string[], unsupported: string[]): ViewBlock | null {
  if (!isRecord(value)) {
    errors.push(`blocks[${index}] 不是对象`)
    return null
  }
  const id = readString(value, 'id')
  if (!id) {
    errors.push(`blocks[${index}] 缺少 id`)
    return null
  }
  const type = readString(value, 'type') ?? ''
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
    unsupported.push(type || '(empty)')
    return null
  }
  return {
    id,
    type: type as BlockType,
    props: isRecord(value['props']) ? { ...value['props'] } : {},
    data: normalizeData(value['data']),
    actions: normalizeActions(value['actions']),
  }
}

function normalizeLayout(value: unknown, blockIds: Set<string>, errors: string[]): ViewLayout {
  const source = isRecord(value) ? value : {}
  const kind = readString(source, 'kind') === 'rows' ? 'rows' : 'grid'
  const columns = Math.max(1, Math.min(12, readNumber(source, 'columns') ?? 12))
  const gap = readString(source, 'gap') ?? 'md'
  const areasRaw = Array.isArray(source['areas']) ? source['areas'] : []
  const areas: ViewArea[] = []
  const seen = new Set<string>()
  areasRaw.forEach((entry, index) => {
    if (!isRecord(entry)) return
    const block = readString(entry, 'block')
    if (!block || !blockIds.has(block)) {
      errors.push(`layout.areas[${index}] 引用不存在的 block`)
      return
    }
    if (seen.has(block)) {
      errors.push(`layout.areas[${index}] 重复引用 block ${block}`)
      return
    }
    seen.add(block)
    areas.push({ block, colSpan: Math.max(1, Math.min(columns, readNumber(entry, 'colSpan') ?? columns)) })
  })
  if (areas.length === 0) {
    for (const id of blockIds) areas.push({ block: id, colSpan: columns })
  }
  return { kind, columns, gap, areas }
}

/**
 * 校验 ViewPage：
 *  - schemaVersion 必须 1；未知顶层键/危险键拒绝；
 *  - 1–200 blocks、id 唯一、未知 type → fallback；
 *  - 有动作绑定必须提供 equivalence.chatPrompt；
 *  - 总大小 ≤256KB；image 只允许 artifact/upload 引用。
 */
export function validateViewPage(raw: unknown): ViewValidation {
  const errors: string[] = []
  const unsupportedTypes: string[] = []
  if (!isRecord(raw)) return { ok: false, page: null, errors: ['VIEW_SCHEMA_INVALID'], fallback: false, unsupportedTypes }
  try {
    if (JSON.stringify(raw).length > MAX_SIZE) errors.push('VIEW_SCHEMA_TOO_LARGE')
  } catch {
    return { ok: false, page: null, errors: ['VIEW_SCHEMA_INVALID'], fallback: false, unsupportedTypes }
  }
  const forbidden = collectForbiddenKeys(raw)
  if (forbidden.length > 0) errors.push(...forbidden.map((path) => `VIEW_FORBIDDEN_KEY:${path}`))
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_PAGE_KEYS.has(key)) errors.push(`VIEW_UNKNOWN_FIELD:${key}`)
  }
  if (readNumber(raw, 'schemaVersion') !== 1) errors.push('VIEW_SCHEMA_VERSION_UNSUPPORTED')
  const id = readString(raw, 'id')
  if (!id || !/^view-[a-z0-9-]{1,64}$/.test(id)) errors.push('VIEW_SCHEMA_INVALID:id')
  const sessionId = readString(raw, 'sessionId')
  if (!sessionId) errors.push('VIEW_SCHEMA_INVALID:sessionId')
  const title = readString(raw, 'title') ?? ''
  if (title.length < 1 || title.length > 80) errors.push('VIEW_SCHEMA_INVALID:title')

  const blocksRaw = Array.isArray(raw['blocks']) ? raw['blocks'] : []
  if (blocksRaw.length < 1 || blocksRaw.length > 200) errors.push('VIEW_SCHEMA_INVALID:blocks-length')
  const seenIds = new Set<string>()
  const blocks: ViewBlock[] = []
  blocksRaw.forEach((entry, index) => {
    const block = normalizeBlock(entry, index, errors, unsupportedTypes)
    if (!block) return
    if (seenIds.has(block.id)) {
      errors.push(`VIEW_SCHEMA_INVALID:duplicate-block:${block.id}`)
      return
    }
    seenIds.add(block.id)
    if (block.type === 'image') {
      const src = readString(block.props, 'src') ?? ''
      const validRef = src === '' || src.startsWith('/api/artifacts/') || src.startsWith('/api/uploads/')
      if (!validRef) errors.push(`VIEW_IMAGE_SRC_DENIED:${block.id}`)
      if (!readString(block.props, 'alt')) errors.push(`VIEW_IMAGE_ALT_REQUIRED:${block.id}`)
    }
    blocks.push(block)
  })

  const equivalenceRaw = isRecord(raw['equivalence']) ? raw['equivalence'] : null
  const hasActions = blocks.some((block) => block.actions.length > 0)
  const equivalence: ViewEquivalence | null = equivalenceRaw
    ? {
        chatPrompt: readString(equivalenceRaw, 'chatPrompt') ?? '',
        actionSequence: Array.isArray(equivalenceRaw['actionSequence'])
          ? equivalenceRaw['actionSequence']
              .map((entry) => {
                if (!isRecord(entry)) return null
                const action = readString(entry, 'action')
                if (!action) return null
                return { action, ...(isRecord(entry['args']) ? { args: normalizeArgs(entry['args']) } : {}) }
              })
              .filter((entry): entry is { action: string; args?: Record<string, unknown> } => entry !== null)
          : [],
        steps: Array.isArray(equivalenceRaw['steps'])
          ? equivalenceRaw['steps'].filter((step): step is string => typeof step === 'string')
          : [],
      }
    : null
  if (hasActions && (!equivalence || equivalence.chatPrompt.trim().length === 0)) {
    errors.push('VIEW_EQUIVALENCE_MISSING')
  }
  if (equivalence && equivalence.chatPrompt.length > 500) errors.push('VIEW_EQUIVALENCE_TOO_LONG')

  const layout = normalizeLayout(raw['layout'], new Set(blocks.map((block) => block.id)), errors)
  const meta = isRecord(raw['meta']) ? { ...raw['meta'] } : {}

  if (unsupportedTypes.length > 0 || errors.length > 0) {
    return { ok: false, page: null, errors, fallback: unsupportedTypes.length > 0, unsupportedTypes }
  }
  return {
    ok: true,
    page: {
      schemaVersion: 1,
      id: id as string,
      sessionId: sessionId as string,
      title,
      layout,
      blocks,
      equivalence,
      meta,
    },
    errors: [],
    fallback: false,
    unsupportedTypes,
  }
}

/** 未知块/渲染失败时的整页 fallback 信息（chat/table）。 */
export function fallbackSummary(raw: unknown): { title: string; rows: Array<{ id: string; type: string; label: string }>; chatPrompt: string } {
  if (!isRecord(raw)) return { title: '自定义视图', rows: [], chatPrompt: '' }
  const title = readString(raw, 'title') ?? '自定义视图'
  const blocks = Array.isArray(raw['blocks']) ? raw['blocks'] : []
  const rows = blocks
    .map((entry, index) => {
      if (!isRecord(entry)) return null
      const type = readString(entry, 'type') ?? 'unknown'
      const id = readString(entry, 'id') ?? `block-${index}`
      return { id, type, label: BLOCK_META[type as BlockType]?.label ?? type }
    })
    .filter((row): row is { id: string; type: string; label: string } => row !== null)
  const equivalence = isRecord(raw['equivalence']) ? raw['equivalence'] : {}
  return { title, rows, chatPrompt: readString(equivalence, 'chatPrompt') ?? '' }
}

/** JSONPath 子集：`a.b[0].c`。 */
export function selectData(data: unknown, path: string): unknown {
  if (!path) return data
  let current: unknown = data
  for (const part of path.split('.')) {
    if (current === null || current === undefined) return undefined
    const match = /^([^[\]]*)(?:\[(\d+)\])?$/.exec(part)
    if (!match) return undefined
    const key = match[1] ?? ''
    if (key) {
      if (!isRecord(current)) return undefined
      current = current[key]
    }
    if (match[2] !== undefined) {
      if (!Array.isArray(current)) return undefined
      current = current[Number(match[2])]
    }
  }
  return current
}

/** 绑定参数注入：只允许 $session/$page/$row/$field，禁止显式跨会话。 */
export function resolveBindingArgs(
  args: Record<string, unknown>,
  scope: { sessionId: string; pageId: string; row?: Record<string, unknown> },
): Record<string, unknown> {
  const resolveValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      if (value === '$session') return scope.sessionId
      if (value === '$page') return scope.pageId
      if (value.startsWith('$row.')) return selectData(scope.row, value.slice(5))
      return value
    }
    if (Array.isArray(value)) return value.map(resolveValue)
    if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveValue(child)]))
    return value
  }
  return resolveValue(args) as Record<string, unknown>
}

export interface ActionCatalogEntry {
  name: string
  risk: string
  readOnly: boolean
}

export function normalizeActionCatalog(payload: unknown): ActionCatalogEntry[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload['actions']) ? payload['actions'] : Array.isArray(payload['items']) ? payload['items'] : []
  return raw
    .map((entry): ActionCatalogEntry | null => {
      if (!isRecord(entry)) return null
      const name = readString(entry, 'name') ?? readString(entry, 'id')
      if (!name) return null
      const risk = readString(entry, 'risk') ?? ''
      return { name, risk, readOnly: entry['readOnly'] === true || entry['read_only'] === true || risk === 'R0' || risk === 'R1' }
    })
    .filter((entry): entry is ActionCatalogEntry => entry !== null)
}

export function isReadOnlyBinding(binding: ViewDataBinding | null, catalog: readonly ActionCatalogEntry[]): boolean {
  if (!binding) return false
  const entry = catalog.find((candidate) => candidate.name === binding.action)
  return entry?.readOnly === true
}

export function actionLabel(action: string): string {
  return action
}
