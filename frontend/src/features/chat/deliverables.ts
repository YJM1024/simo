// features/chat/deliverables.ts —— 会话顶部交付物（UI-1，纯逻辑）
//
// GET /api/sessions/{id}/artifacts（M6）→ 最近产物；支持文本/Markdown/图片预览与下载。
// 后端缺失/空时隐藏卡片，不阻塞对话。

export type DeliverableKind = 'text' | 'markdown' | 'image' | 'other'

export interface Deliverable {
  id: string
  name: string
  mime: string
  size: number | null
  kind: DeliverableKind
  previewUrl: string
  downloadUrl: string
}

function previewKind(name: string, mime: string): DeliverableKind {
  const lowerMime = mime.toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (lowerMime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (lowerMime.includes('markdown') || ext === 'md' || ext === 'markdown') return 'markdown'
  if (lowerMime.startsWith('text/') || ['txt', 'json', 'log', 'csv', 'yaml', 'yml', 'ts', 'js', 'css', 'html', 'go', 'py'].includes(ext)) {
    return 'text'
  }
  return 'other'
}

function toSize(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return null
}

/** 归一化 artifacts/files payload；按 id 去重，最多 8 个。 */
export function normalizeDeliverables(payload: unknown): Deliverable[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const raw = Array.isArray(record['artifacts'])
    ? record['artifacts']
    : Array.isArray(record['files'])
      ? record['files']
      : Array.isArray(payload)
        ? (payload as unknown[])
        : []
  const seen = new Set<string>()
  const items: Deliverable[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    const id = typeof item.id === 'string' ? item.id : null
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name = typeof item.name === 'string' && item.name ? item.name : id
    const mime = typeof item.mime === 'string' ? item.mime : typeof item.contentType === 'string' ? item.contentType : ''
    const previewUrl =
      typeof item.previewUrl === 'string'
        ? item.previewUrl
        : typeof item.url === 'string'
          ? item.url
          : `/api/artifacts/${encodeURIComponent(id)}/content`
    items.push({
      id,
      name,
      mime,
      size: toSize(item.size) ?? toSize(item.bytes),
      kind: previewKind(name, mime),
      previewUrl,
      downloadUrl: typeof item.downloadUrl === 'string' ? item.downloadUrl : previewUrl,
    })
    if (items.length >= 8) break
  }
  return items
}

export function formatDeliverableSize(size: number | null): string {
  if (size === null) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
