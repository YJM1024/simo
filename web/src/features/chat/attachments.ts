// features/chat/attachments.ts —— 附件上传 / 归一化 / 预览辅助（M8）
//
// 契约：docs/m8-contract.md §3。上传：POST /api/uploads?sessionId=，multipart 字段名 file；
// 单文件 ≤20MiB、单条消息 ≤5 个；返回 {ok:true, attachments:[{id,name,mime,size,createdAt}]}。

import { HttpError, fetchBinary } from '../../platform/http.ts'
import { isRecord, readNumber, readString, type ChatAttachment } from '../../platform/types.ts'

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_MESSAGE = 5
export const TEXT_PREVIEW_LIMIT = 200_000

export function formatBytes(size: number | null): string {
  if (size === null || !Number.isFinite(size)) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function normalizeAttachmentList(payload: unknown): ChatAttachment[] {
  const raw = isRecord(payload) && Array.isArray(payload['attachments'])
    ? payload['attachments']
    : Array.isArray(payload)
      ? payload
      : []
  const out: ChatAttachment[] = []
  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const id = readString(entry, 'id')
    if (!id) continue
    out.push({
      id,
      name: readString(entry, 'name') ?? id,
      mime: readString(entry, 'mime') ?? '',
      size: readNumber(entry, 'size') ?? null,
      createdAt: readNumber(entry, 'createdAt') ?? null,
    })
  }
  return out
}

export function uploadUrl(id: string): string {
  return `/api/uploads/${encodeURIComponent(id)}`
}

export function attachmentKind(attachment: Pick<ChatAttachment, 'name' | 'mime'>): 'text' | 'image' | 'other' {
  const mime = (attachment.mime ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('markdown')) return 'text'
  const ext = attachment.name.split('.').pop()?.toLowerCase() ?? ''
  if (['txt', 'md', 'markdown', 'json', 'log', 'csv', 'yaml', 'yml', 'ts', 'js', 'tsx', 'jsx', 'css', 'html', 'go', 'py', 'sh'].includes(ext)) {
    return 'text'
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  return 'other'
}

/** 上传前本地校验（服务端仍会二次校验）；返回错误文案或 null。 */
export function validateFiles(files: readonly File[], existingCount: number): string | null {
  if (files.length === 0) return null
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return `单条消息最多 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`
  }
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return `「${file.name}」超过 20 MiB 上限`
    }
  }
  return null
}

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请稍后重试'
    return error.message || '上传失败'
  }
  if (error instanceof Error && error.message) return error.message
  return '上传失败'
}

/** multipart 上传；失败抛出带可读信息的 HttpError。 */
export async function uploadFiles(
  sessionId: string,
  files: readonly File[],
  signal?: AbortSignal,
): Promise<ChatAttachment[]> {
  const form = new FormData()
  for (const file of files) form.append('file', file, file.name)

  let response: Response
  try {
    response = await fetch(`/api/uploads?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      body: form,
      ...(signal ? { signal } : {}),
    })
  } catch (cause) {
    if ((cause as { name?: string } | null)?.name === 'AbortError') throw cause
    throw new HttpError('无法连接后端，请确认司墨服务正在运行', { offline: true, body: cause })
  }

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload['error'] === 'string' && payload['error'].trim()
        ? payload['error']
        : `上传失败（HTTP ${response.status}）`
    throw new HttpError(message, { status: response.status, body: payload })
  }
  const attachments = normalizeAttachmentList(payload)
  if (attachments.length === 0) throw new HttpError('上传未返回附件信息', { status: response.status, body: payload })
  return attachments
}

export { errorText as attachmentErrorText }

export interface AttachmentText {
  text: string
  truncated: boolean
  contentType: string
}

export async function fetchAttachmentText(attachmentId: string, signal?: AbortSignal): Promise<AttachmentText> {
  const response = await fetchBinary(uploadUrl(attachmentId), signal ? { signal } : {})
  const contentType = response.headers.get('content-type') ?? ''
  const text = await response.text()
  return { text: text.slice(0, TEXT_PREVIEW_LIMIT), truncated: text.length > TEXT_PREVIEW_LIMIT, contentType }
}

export async function fetchAttachmentBlob(attachmentId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await fetchBinary(uploadUrl(attachmentId), signal ? { signal } : {})
  return response.blob()
}
