// features/views/editor.ts —— M28 视图编辑器纯逻辑（受控 patch / 错误定位 / 看板语义动作 / 版本）
//
// 契约：docs/m24-view-contract.md §8.2/§8.5/§11。只允许受控 patch ops，不提供任意 JSON Patch；
// 前端只把用户的结构化编辑翻译成 add_block/remove_block/set_block_props/set_block_actions/set_page_props。
// 后端 4xx 校验错误按 blockId/field/path 定位；版本列表/回滚经 ui 动作与只读版本端点。

import type { ActionResult } from './actions.ts'
import type { ViewActionBinding, ViewBlock, ViewPage } from './schema.ts'
import { BLOCK_TYPES, type BlockType } from './schema.ts'

export type ViewPatchOp =
  | { op: 'set_page_props'; title?: string }
  | { op: 'replace_blocks'; blocks: ViewBlock[] }
  | { op: 'set_block_props'; blockId: string; props: Record<string, unknown> }
  | { op: 'set_block_actions'; blockId: string; actions: ViewActionBinding[] }
  | { op: 'add_block'; after?: string; block: ViewBlock }
  | { op: 'remove_block'; blockId: string }

export const ALLOWED_PATCH_OPS = ['set_page_props', 'replace_blocks', 'set_block_props', 'set_block_actions', 'add_block', 'remove_block'] as const

export function buildSetPageTitle(title: string): ViewPatchOp {
  return { op: 'set_page_props', title: title.trim() }
}

export function buildSetBlockProps(blockId: string, props: Record<string, unknown>): ViewPatchOp {
  return { op: 'set_block_props', blockId, props }
}

export function buildSetBlockActions(blockId: string, actions: ViewActionBinding[]): ViewPatchOp {
  return { op: 'set_block_actions', blockId, actions }
}

export function buildAddBlock(block: ViewBlock, after?: string): ViewPatchOp {
  return { op: 'add_block', block, ...(after ? { after } : {}) }
}

export function buildRemoveBlock(blockId: string): ViewPatchOp {
  return { op: 'remove_block', blockId }
}

export function buildReplaceBlocks(blocks: ViewBlock[]): ViewPatchOp {
  return { op: 'replace_blocks', blocks }
}

/** 受控 patch 校验（编辑器只生成白名单 ops；防止未来误用任意 JSON Patch）。 */
export function validatePatchOps(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) return ['PATCH_EMPTY']
  const errors: string[] = []
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push(`ops[${index}] 不是对象`)
      return
    }
    const op = (entry as Record<string, unknown>)['op']
    if (typeof op !== 'string' || !(ALLOWED_PATCH_OPS as readonly string[]).includes(op)) {
      errors.push(`ops[${index}] 不允许的 op`)
    }
  })
  return errors
}

export function defaultBlockProps(type: BlockType): Record<string, unknown> {
  if (type === 'text') return { text: '新文本' }
  if (type === 'markdown') return { markdown: '## 新章节\n正文' }
  if (type === 'progress') return { title: '进度' }
  if (type === 'action') return { label: '执行动作', variant: 'primary' }
  if (type === 'ask') return { question: '请确认', options: ['继续', '取消'] }
  if (type === 'form') return { fields: [{ name: 'note', type: 'text', label: '备注' }], submitLabel: '提交' }
  if (type === 'table') return { columns: ['名称', '状态'] }
  if (type === 'kanban') return { columns: ['queued', 'running', 'done'] }
  if (type === 'image') return { src: '', alt: '图片' }
  if (type === 'chat') return { showComposer: false }
  if (type === 'deliverable') return { kind: 'all', layout: 'list' }
  if (type === 'timeline') return { source: 'session' }
  if (type === 'chart') return { kind: 'bar', title: '图表', data: [{ label: 'A', value: 1 }, { label: 'B', value: 2 }] }
  return { orientation: 'TB' }
}

export function newViewBlock(type: BlockType, existingIds: readonly string[]): ViewBlock {
  let index = 1
  let id = `block-${index}`
  const used = new Set(existingIds)
  while (used.has(id)) {
    index += 1
    id = `block-${index}`
  }
  return { id, type, props: defaultBlockProps(type), data: null, actions: [] }
}

export function blockTypeLabel(type: string): string {
  if ((BLOCK_TYPES as readonly string[]).includes(type)) {
    return type
  }
  return type
}

export interface ViewErrorLocation {
  blockId: string | null
  field: string | null
  path: string | null
  message: string
}

function readStringField(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate) return candidate
  }
  return null
}

/** 后端 4xx 校验错误 → 字段/块定位（兼容 details/errors/path/blockId）。 */
export function extractViewErrorLocation(result: ActionResult): ViewErrorLocation {
  const details = result.error?.details
  const message = result.error?.message ?? '视图保存失败'
  let blockId: string | null = null
  let field: string | null = null
  let path: string | null = null
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = value as Record<string, unknown>
    blockId = blockId ?? readStringField(record, ['blockId', 'block_id', 'block'])
    field = field ?? readStringField(record, ['field', 'property', 'prop'])
    path = path ?? readStringField(record, ['path', 'pointer', 'instancePath'])
    for (const nested of Object.values(record)) visit(nested)
  }
  if (details) visit(details)
  if (!blockId) {
    const match = /block(?:Id)?["':\s]+([a-zA-Z0-9_-]+)/.exec(message)
    if (match) blockId = match[1] ?? null
  }
  if (!path && field) path = field
  return { blockId, field, path, message }
}

/** 看板列 → 语义动作候选（不直接改状态；只映射到块已绑定的动作）。 */
const KANBAN_STATUS_ACTIONS: Array<{ match: RegExp; actions: string[] }> = [
  { match: /cancel/i, actions: ['task.cancel', 'workflow.cancel'] },
  { match: /retry|fail|error/i, actions: ['task.retry', 'task.run'] },
  { match: /paus/i, actions: ['workflow.pause', 'task.pause'] },
  { match: /resume|run|active|progress/i, actions: ['workflow.resume', 'task.retry', 'task.run'] },
  { match: /done|complete/i, actions: ['task.complete', 'workflow.confirm'] },
]

export function kanbanBindingForStatus(status: string, actions: readonly ViewActionBinding[]): ViewActionBinding | null {
  const candidates = KANBAN_STATUS_ACTIONS.find((entry) => entry.match.test(status))?.actions ?? []
  for (const candidate of candidates) {
    const binding = actions.find((action) => action.action === candidate || action.id === candidate)
    if (binding) return binding
  }
  return null
}

export function kanbanTargets(columns: readonly string[], actions: readonly ViewActionBinding[]): Array<{ status: string; binding: ViewActionBinding | null }> {
  return columns.map((status) => ({ status, binding: kanbanBindingForStatus(status, actions) }))
}

export interface ViewVersionInfo {
  version: number
  hash: string
  createdAt: number | null
  createdBy: string
  reason: string
}

export function normalizeViewVersions(payload: unknown): ViewVersionInfo[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const raw = Array.isArray(record['versions']) ? record['versions'] : Array.isArray(payload) ? (payload as unknown[]) : []
  const versions: ViewVersionInfo[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const version = typeof item['version'] === 'number' ? item['version'] : Number(item['version'])
    if (!Number.isFinite(version)) continue
    versions.push({
      version,
      hash: typeof item['hash'] === 'string' ? item['hash'] : typeof item['schemaHash'] === 'string' ? item['schemaHash'] : '',
      createdAt: typeof item['createdAt'] === 'number' ? item['createdAt'] : typeof item['created_at'] === 'number' ? item['created_at'] : null,
      createdBy: typeof item['createdBy'] === 'string' ? item['createdBy'] : '',
      reason: typeof item['reason'] === 'string' ? item['reason'] : '',
    })
  }
  return versions.sort((a, b) => b.version - a.version)
}

/** GET /api/views/{id}/versions/{v} → 版本 schema（回滚前预览）。 */
export function extractVersionSchema(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (typeof record['schemaJson'] === 'string') {
    try {
      return JSON.parse(record['schemaJson'])
    } catch {
      return null
    }
  }
  if (typeof record['schema_json'] === 'string') {
    try {
      return JSON.parse(record['schema_json'])
    } catch {
      return null
    }
  }
  return record['schema'] ?? record['page'] ?? record
}

/** 编辑器摘要（版本面板/确认文案）。 */
export function pageSummary(page: ViewPage): string {
  return `${page.title} · ${page.blocks.length} 块`
}
