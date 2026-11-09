// features/chat/DeliverablesBar.tsx —— 会话顶部交付物卡片（UI-1）
//
// 展示当前会话最近产物（最多 4 个 chip）；文本/Markdown/图片可预览，全部可下载。
// GET /api/sessions/{id}/artifacts 缺失/空时隐藏；不阻塞消息流。

import { useCallback, useEffect, useState } from 'react'
import { apiGet, fetchBinary } from '../../platform/http.ts'
import MarkdownMessage from './MarkdownMessage.tsx'
import {
  formatDeliverableSize,
  normalizeDeliverables,
  type Deliverable,
} from './deliverables.ts'

const PREVIEW_LIMIT = 200_000

function DeliverablePreview({ item, onClose }: { item: Deliverable; onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (item.kind === 'image' || item.kind === 'other') return
    let cancelled = false
    setLoading(true)
    void fetchBinary(item.previewUrl)
      .then((response) => response.text())
      .then((value) => {
        if (!cancelled) setText(value.slice(0, PREVIEW_LIMIT))
      })
      .catch(() => {
        if (!cancelled) setError('预览加载失败，可尝试下载。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [item])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim-strong/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`预览 ${item.name}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="popover-surface flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden">
        <header className="flex flex-none items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <span className="min-w-0 truncate text-sm font-medium text-ink">{item.name}</span>
          <div className="flex items-center gap-2">
            <a href={item.downloadUrl} download={item.name} className="rounded-xs border border-accent-border bg-accent-soft px-2 py-0.5 text-2xs text-accent-hover no-underline">
              下载
            </a>
            <button type="button" onClick={onClose} className="cursor-pointer rounded-xs border border-border-subtle px-2 py-0.5 text-2xs text-muted">
              关闭 ×
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          {item.kind === 'image' ? (
            <img src={item.previewUrl} alt={item.name} className="max-h-[70vh] max-w-full rounded border border-border-subtle" />
          ) : item.kind === 'other' ? (
            <p className="m-0 text-sm text-ink-secondary">该类型不支持内联预览，请下载后查看。</p>
          ) : loading ? (
            <p className="m-0 text-sm text-muted">加载预览…</p>
          ) : error ? (
            <p className="m-0 text-sm text-danger-ink">{error}</p>
          ) : item.kind === 'markdown' ? (
            <MarkdownMessage text={text} />
          ) : (
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-secondary">{text}</pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DeliverablesBar({ sessionId }: { sessionId: string | null }) {
  const [items, setItems] = useState<Deliverable[]>([])
  const [preview, setPreview] = useState<Deliverable | null>(null)

  const load = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setItems([])
      return
    }
    try {
      const payload = await apiGet(`/api/sessions/${encodeURIComponent(sessionId)}/artifacts`)
      setItems(normalizeDeliverables(payload))
    } catch {
      setItems([])
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  if (items.length === 0) return null
  const shown = items.slice(0, 4)

  return (
    <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-border-subtle bg-surface-sunken/50 px-4 py-1.5" aria-label="会话交付物">
      <span className="font-mono text-2xs tracking-normal text-muted">交付物</span>
      {shown.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1 rounded-pill border border-border-subtle bg-surface-solid px-1.5 py-0.5">
          <span className="max-w-[10rem] truncate text-2xs text-ink-secondary" title={item.name}>
            {item.name}
          </span>
          {item.size !== null && <span className="font-mono text-2xs text-muted">{formatDeliverableSize(item.size)}</span>}
          {item.kind !== 'other' && (
            <button type="button" onClick={() => setPreview(item)} aria-label={`预览 ${item.name}`} className="cursor-pointer font-mono text-2xs text-accent-hover">
              预览
            </button>
          )}
          <a href={item.downloadUrl} download={item.name} aria-label={`下载 ${item.name}`} className="font-mono text-2xs text-accent-hover no-underline">
            下载
          </a>
        </span>
      ))}
      {items.length > shown.length && <span className="font-mono text-2xs text-muted">+{items.length - shown.length}</span>}
      {preview && <DeliverablePreview item={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
