// features/chat/MessageAttachments.tsx —— 消息气泡里的附件（M8）
//
// 契约：docs/m8-contract.md §3.3：文本/图片可预览，其它给下载；不复制文件。
// 预览直接读取 GET /api/uploads/{id}（只读、按 id），下载链接带 download。

import { useEffect, useState } from 'react'
import type { ChatAttachment } from '../../platform/types.ts'
import {
  attachmentKind,
  fetchAttachmentBlob,
  fetchAttachmentText,
  formatBytes,
  uploadUrl,
} from './attachments.ts'

interface PreviewState {
  id: string | null
  loading: boolean
  error: string | null
  text: string
  truncated: boolean
  imageUrl: string | null
}

function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  const [preview, setPreview] = useState<PreviewState>({
    id: null,
    loading: false,
    error: null,
    text: '',
    truncated: false,
    imageUrl: null,
  })
  const kind = attachmentKind(attachment)
  const open = preview.id === attachment.id

  useEffect(() => {
    if (!open || kind === 'other') return
    let cancelled = false
    let objectUrl: string | null = null
    setPreview((prev) => ({ ...prev, loading: true, error: null }))
    void (async () => {
      try {
        if (kind === 'image') {
          const blob = await fetchAttachmentBlob(attachment.id)
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setPreview((prev) => ({ ...prev, loading: false, imageUrl: objectUrl }))
        } else {
          const result = await fetchAttachmentText(attachment.id)
          if (!cancelled) {
            setPreview((prev) => ({ ...prev, loading: false, text: result.text, truncated: result.truncated }))
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPreview((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error && error.message ? error.message : '预览加载失败',
          }))
        }
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, kind, attachment.id])

  const togglePreview = (): void => {
    setPreview({ id: open ? null : attachment.id, loading: false, error: null, text: '', truncated: false, imageUrl: null })
  }

  return (
    <li className="rounded-md border border-border-subtle bg-surface-solid px-2 py-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex-none rounded-xs border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-muted">
          {kind === 'image' ? '图片' : kind === 'text' ? '文本' : '文件'}
        </span>
        <span className="min-w-0 max-w-[16rem] truncate text-sm text-ink" title={attachment.name}>
          {attachment.name}
        </span>
        {attachment.size !== null && <span className="flex-none font-mono text-2xs text-muted">{formatBytes(attachment.size)}</span>}
        {kind !== 'other' && (
          <button
            type="button"
            onClick={togglePreview}
            aria-expanded={open}
            aria-label={`${open ? '收起' : '预览'}附件 ${attachment.name}`}
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover"
          >
            {open ? '收起' : '预览'}
          </button>
        )}
        <a
          href={uploadUrl(attachment.id)}
          download={attachment.name}
          aria-label={`下载附件 ${attachment.name}`}
          className="rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover no-underline transition-colors duration-fast hover:border-accent"
        >
          下载
        </a>
      </div>

      {open && (
        <div className="mt-1 rounded border border-border-subtle bg-surface-sunken p-1.5">
          {preview.loading && <p className="m-0 text-2xs text-muted">加载预览…</p>}
          {preview.error && <p className="m-0 text-2xs text-danger-ink">预览失败：{preview.error}</p>}
          {!preview.loading && !preview.error && kind === 'image' && preview.imageUrl && (
            <img src={preview.imageUrl} alt={attachment.name} className="max-h-56 max-w-full rounded border border-border-subtle" />
          )}
          {!preview.loading && !preview.error && kind === 'text' && (
            <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-secondary">
              {preview.text || '（空文件）'}
            </pre>
          )}
          {preview.truncated && <p className="m-0 mt-1 text-2xs text-warn-ink">内容过长，仅展示前 200K 字符；完整内容请下载。</p>}
        </div>
      )}
    </li>
  )
}

export default function MessageAttachments({ attachments }: { attachments: ChatAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0" aria-label="消息附件">
      {attachments.map((attachment) => (
        <AttachmentChip key={attachment.id} attachment={attachment} />
      ))}
    </ul>
  )
}
