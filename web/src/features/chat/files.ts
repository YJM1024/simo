// features/chat/files.ts —— 会话文件（M11）
//
// 契约：docs/m11-contract.md §1.2：
//   GET /api/sessions/{id}/files?kind=artifact|upload|workspace
//   → {ok,files:[{id,kind,name,mime,size,createdAt,source:{taskId,messageId,path},previewUrl,downloadUrl}],total}
// 同一文件按路径去重；只读（预览/下载），上传入口在 Composer。

import { apiGet } from '../../platform/http.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'
import { formatBytes } from './attachments.ts'

export type SessionFileKind = 'artifact' | 'upload' | 'workspace'

export interface SessionFileSource {
  taskId: string | null
  messageId: string | null
  path: string | null
}

export interface SessionFile {
  id: string
  kind: SessionFileKind
  name: string
  mime: string
  size: number | null
  createdAt: number | null
  source: SessionFileSource
  previewUrl: string | null
  downloadUrl: string | null
}

const KIND_LABEL: Record<SessionFileKind, string> = {
  artifact: '任务产物',
  upload: '消息附件',
  workspace: '工作区文件',
}

function normalizeKind(value: string | undefined): SessionFileKind {
  if (value === 'upload' || value === 'workspace') return value
  return 'artifact'
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function normalizeSessionFile(value: unknown): SessionFile | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null
  const name = readString(value, 'name') ?? id.split('/').pop() ?? id
  const kind = normalizeKind(readString(value, 'kind'))
  const sourceRaw = isRecord(value['source']) ? value['source'] : {}
  const mime = readString(value, 'mime') ?? readString(sourceRaw, 'mime') ?? ''
  const previewUrl = asText(value['previewUrl'])
  const downloadUrl = asText(value['downloadUrl'])
  return {
    id,
    kind,
    name,
    mime,
    size: readNumber(value, 'size') ?? null,
    createdAt: readNumber(value, 'createdAt') ?? readNumber(value, 'created_at') ?? null,
    source: {
      taskId: readString(sourceRaw, 'taskId') ?? readString(sourceRaw, 'task_id') ?? null,
      messageId: readString(sourceRaw, 'messageId') ?? readString(sourceRaw, 'message_id') ?? null,
      path: readString(sourceRaw, 'path') ?? null,
    },
    previewUrl: previewUrl ?? fallbackPreviewUrl(kind, id),
    downloadUrl: downloadUrl ?? previewUrl ?? fallbackPreviewUrl(kind, id),
  }
}

function fallbackPreviewUrl(kind: SessionFileKind, id: string): string | null {
  if (kind === 'artifact') return `/api/artifacts/${encodeURIComponent(id)}/content`
  if (kind === 'upload') return `/api/uploads/${encodeURIComponent(id)}`
  return null
}

/** 归一化 + 按路径（或 id）去重；同一文件只出现一次。 */
export function normalizeSessionFiles(payload: unknown): SessionFile[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload['files']) ? payload['files'] : Array.isArray(payload['items']) ? payload['items'] : []
  const seen = new Set<string>()
  const files: SessionFile[] = []
  for (const entry of raw) {
    const file = normalizeSessionFile(entry)
    if (!file) continue
    const dedupeKey = file.source.path ?? file.id
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    files.push(file)
  }
  return files
}

export function fileKindLabel(kind: SessionFileKind): string {
  return KIND_LABEL[kind] ?? kind
}

export function fileKindTone(kind: SessionFileKind): 'accent' | 'warn' | 'muted' {
  if (kind === 'artifact') return 'accent'
  if (kind === 'upload') return 'warn'
  return 'muted'
}

export type FilePreviewKind = 'markdown' | 'text' | 'image' | 'other'

function extensionOf(name: string): string {
  const clean = name.split('?')[0]?.split('#')[0] ?? name
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export function filePreviewKind(file: Pick<SessionFile, 'name' | 'mime'>): FilePreviewKind {
  const mime = (file.mime ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('markdown')) return 'markdown'
  if (mime.startsWith('text/')) return 'text'
  const ext = extensionOf(file.name)
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  if (['txt', 'json', 'log', 'csv', 'yaml', 'yml', 'ts', 'js', 'tsx', 'jsx', 'css', 'html', 'go', 'py', 'sh'].includes(ext)) return 'text'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  return 'other'
}

export function fileSourceLabel(file: SessionFile): string {
  if (file.source.taskId) return `任务 ${file.source.taskId}`
  if (file.source.messageId) return `消息 ${file.source.messageId}`
  if (file.source.path) return file.source.path
  return '—'
}

export function formatFileSize(size: number | null): string {
  return formatBytes(size) || '—'
}

export function formatFileTime(at: number | null): string {
  if (at === null) return '—'
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fetchSessionFiles(
  sessionId: string,
  kind: SessionFileKind | null,
  signal?: AbortSignal,
): Promise<unknown> {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  return apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/files${query}`, signal ? { signal } : {})
}
