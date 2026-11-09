// features/chat/toolcards.ts —— UI-2 工具调用卡片纯逻辑
//
// 七类：command / file_read / file_write(含 diff) / web / filegen / approval / error；
// 未识别 card → unknown（JSON 折叠）。命令/参数/输出统一脱敏（Key/Token/Secret/Password）。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export type ToolCardKind =
  | 'command'
  | 'file_read'
  | 'file_write'
  | 'web'
  | 'filegen'
  | 'approval'
  | 'error'
  | 'unknown'

export interface ToolCardDiff {
  added: number
  removed: number
  patch: string | null
}

export interface ToolCardArtifact {
  id: string | null
  name: string
  mime: string
  size: number | null
  previewUrl: string | null
  downloadUrl: string | null
}

export interface ToolCardSource {
  title: string
  url: string
}

export interface ToolCardData {
  id: string
  tool: string
  kind: ToolCardKind
  risk: string
  status: string
  summary: string
  command: string | null
  path: string | null
  query: string | null
  url: string | null
  diff: ToolCardDiff | null
  artifact: ToolCardArtifact | null
  output: string | null
  error: string | null
  durationMs: number | null
  approvalId: string | null
  truncated: boolean
  spillPath: string | null
  sources: ToolCardSource[]
}

const TOOL_KIND: Record<string, ToolCardKind> = {
  pwsh: 'command',
  shell: 'command',
  bash: 'command',
  read: 'file_read',
  read_file: 'file_read',
  glob: 'file_read',
  list_dir: 'file_read',
  grep: 'file_read',
  search_text: 'file_read',
  write: 'file_write',
  write_file: 'file_write',
  edit: 'file_write',
  web_search: 'web',
  web_fetch: 'web',
  make_pdf: 'filegen',
  make_docx: 'filegen',
  make_xlsx: 'filegen',
  make_pptx: 'filegen',
  make_image: 'filegen',
  approval: 'approval',
}

const CARD_KIND: Record<string, ToolCardKind> = {
  command: 'command',
  file_read: 'file_read',
  search: 'file_read',
  file_write: 'file_write',
  file_edit: 'file_write',
  web: 'web',
  filegen: 'filegen',
  approval: 'approval',
  retry: 'error',
  error: 'error',
}

export function classifyToolCard(tool: string, card?: string | null): ToolCardKind {
  if (card && CARD_KIND[card]) return CARD_KIND[card] as ToolCardKind
  const normalized = tool.trim().toLowerCase()
  if (TOOL_KIND[normalized]) return TOOL_KIND[normalized] as ToolCardKind
  if (normalized.startsWith('make_')) return 'filegen'
  if (normalized.startsWith('web_')) return 'web'
  return 'unknown'
}

/** 命令/参数/输出脱敏：隐藏 KEY/TOKEN/SECRET/PASSWORD 等赋值。 */
export function maskSecrets(text: string): string {
  if (!text) return ''
  return text
    .replace(/(\b[\w.-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[\w.-]*\s*[=:]\s*)([^\s,;]+)/gi, '$1***')
    .replace(/(["']?(?:api[_-]?key|token|secret|password)["']?\s*:\s*["'])([^"']+)(["'])/gi, '$1***$3')
    .replace(/\b(sk-[A-Za-z0-9]{8,})\b/g, 'sk-***')
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeDiff(value: unknown): ToolCardDiff | null {
  if (!isRecord(value)) return null
  const added = readNumber(value, 'added') ?? readNumber(value, 'additions') ?? 0
  const removed = readNumber(value, 'removed') ?? readNumber(value, 'deletions') ?? 0
  const patch = text(value['patch']) ?? text(value['diff'])
  if (added === 0 && removed === 0 && !patch) return null
  return { added, removed, patch: patch ? maskSecrets(patch) : null }
}

function normalizeArtifact(value: unknown): ToolCardArtifact | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? null
  const name = readString(value, 'name') ?? id
  if (!name) return null
  const previewUrl = text(value['previewUrl']) ?? (id ? `/api/artifacts/${encodeURIComponent(id)}/content` : null)
  return {
    id,
    name,
    mime: readString(value, 'mime') ?? '',
    size: readNumber(value, 'size') ?? null,
    previewUrl,
    downloadUrl: text(value['downloadUrl']) ?? previewUrl,
  }
}

function normalizeSources(value: unknown): ToolCardSource[] {
  if (!Array.isArray(value)) return []
  const sources: ToolCardSource[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const url = readString(entry, 'url')
    if (!url) continue
    sources.push({ title: readString(entry, 'title') ?? url, url })
  }
  return sources.slice(0, 8)
}

/** 从 tool 帧/审计/受控卡片数据归一化（未知字段安全忽略）。 */
export function normalizeToolCard(value: unknown, fallbackId = 'tool'): ToolCardData | null {
  if (!isRecord(value)) return null
  const meta = isRecord(value['meta']) ? value['meta'] : isRecord(value['result']) ? value['result'] : {}
  const id = readString(value, 'id') ?? readString(value, 'toolCallId') ?? fallbackId
  const tool = readString(value, 'tool') ?? readString(value, 'name') ?? '工具调用'
  const card = readString(meta, 'card') ?? readString(value, 'card')
  const kind = classifyToolCard(tool, card)
  const status = readString(value, 'status') ?? readString(value, 'phase') ?? ''
  const error = text(value['error']) ?? text(meta['error'])
  const artifact = normalizeArtifact(meta['artifact'] ?? value['artifact'])
  return {
    id,
    tool,
    kind: kind === 'unknown' && (status === 'failed' || error) ? 'error' : kind,
    risk: readString(value, 'risk') ?? readString(meta, 'risk') ?? '',
    status,
    summary: readString(value, 'summary') ?? readString(value, 'argsSummary') ?? '',
    command: maskSecrets(readString(meta, 'command') ?? readString(value, 'command') ?? '') || null,
    path: text(meta['path']) ?? text(meta['file_path']) ?? text(value['path']),
    query: text(meta['query']) ?? text(value['query']),
    url: text(meta['url']) ?? text(value['url']),
    diff: normalizeDiff(meta['diff'] ?? value['diff']),
    artifact,
    output: text(meta['output'] ?? meta['stdout'] ?? value['output']) ? maskSecrets(text(meta['output'] ?? meta['stdout'] ?? value['output']) ?? '') : null,
    error: error ? maskSecrets(error) : null,
    durationMs: readNumber(value, 'durationMs') ?? readNumber(value, 'duration_ms') ?? null,
    approvalId: readString(value, 'approvalId') ?? readString(value, 'approval_id') ?? null,
    truncated: meta['truncated'] === true,
    spillPath: text(meta['spillPath']) ?? text(meta['spill_path']),
    sources: normalizeSources(meta['sources'] ?? value['sources']),
  }
}

/** 从 ToolCallInfo（消息流已有）拼卡片（降级数据源）。 */
export function toolCardFromCall(call: {
  id: string
  tool: string
  status: string
  risk: string
  argsSummary: string
  durationMs: number | null
}): ToolCardData {
  return {
    id: call.id,
    tool: call.tool,
    kind: classifyToolCard(call.tool),
    risk: call.risk,
    status: call.status,
    summary: call.argsSummary,
    command: call.tool === 'pwsh' ? maskSecrets(call.argsSummary) || null : null,
    path: call.tool !== 'pwsh' ? call.argsSummary || null : null,
    query: call.tool.startsWith('web_') ? call.argsSummary || null : null,
    url: null,
    diff: null,
    artifact: null,
    output: null,
    error: call.status === 'failed' ? call.argsSummary || '工具执行失败' : null,
    durationMs: call.durationMs,
    approvalId: null,
    truncated: false,
    spillPath: null,
    sources: [],
  }
}

export function toolCardKindLabel(kind: ToolCardKind): string {
  if (kind === 'command') return '命令'
  if (kind === 'file_read') return '文件读取/搜索'
  if (kind === 'file_write') return '文件写入/编辑'
  if (kind === 'web') return '联网'
  if (kind === 'filegen') return '生成文件'
  if (kind === 'approval') return '审批'
  if (kind === 'error') return '错误'
  return '工具'
}

export function formatToolStatus(status: string): string {
  if (status === 'ok' || status === 'done' || status === 'success') return '成功'
  if (status === 'failed' || status === 'error') return '失败'
  if (status === 'denied') return '已拒绝'
  if (status === 'timeout') return '超时'
  if (status === 'running') return '执行中'
  if (status === 'pending') return '等待中'
  return status || '—'
}
