// features/chat/SessionFilesView.tsx —— 文件选项卡（M11）
//
// 契约：docs/m11-contract.md §1/§3：本会话文件（任务产物/消息附件/工作区文件），
// 只读列表（名称/类型/大小/时间/来源）+ 预览（文本/Markdown/图片）+ 下载；空/加载/错误态。
// 数据：GET /api/sessions/{id}/files?kind=

import { useCallback, useEffect, useState } from 'react'
import { HttpError, fetchBinary } from '../../platform/http.ts'
import MarkdownMessage from './MarkdownMessage.tsx'
import {
  fetchSessionFiles,
  fileKindLabel,
  fileKindTone,
  filePreviewKind,
  fileSourceLabel,
  formatFileSize,
  formatFileTime,
  normalizeSessionFiles,
  type FilePreviewKind,
  type SessionFile,
  type SessionFileKind,
} from './files.ts'

const KIND_FILTERS: Array<{ value: SessionFileKind | null; label: string }> = [
  { value: null, label: '全部' },
  { value: 'artifact', label: '任务产物' },
  { value: 'upload', label: '消息附件' },
  { value: 'workspace', label: '工作区' },
]

const KIND_TONE: Record<'accent' | 'warn' | 'muted', string> = {
  accent: 'border-accent-border bg-accent-soft text-accent-hover',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

const PREVIEW_LIMIT = 200_000

function errorText(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请稍后重试'
    if (error.status === 404 || error.status === 405) return '文件接口尚未就绪（后端 M11 实现中）'
    return error.message || '文件加载失败'
  }
  return error instanceof Error && error.message ? error.message : '文件加载失败'
}

function FileRow({ file }: { file: SessionFile }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [truncated, setTruncated] = useState(false)
  const previewKind: FilePreviewKind = filePreviewKind(file)

  useEffect(() => {
    if (!open) return
    if (previewKind === 'image') return
    if (!file.previewUrl) {
      setError('该文件没有预览地址')
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void fetchBinary(file.previewUrl)
      .then((response) => response.text())
      .then((value) => {
        if (cancelled) return
        setText(value.slice(0, PREVIEW_LIMIT))
        setTruncated(value.length > PREVIEW_LIMIT)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '预览加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, previewKind, file.previewUrl])

  const toggle = (): void => {
    setOpen((value) => !value)
  }

  const tone = KIND_TONE[fileKindTone(file.kind)]

  return (
    <li className="rounded-md border border-border-subtle bg-surface-solid p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`flex-none rounded-xs border px-1.5 font-mono text-2xs ${tone}`}>{fileKindLabel(file.kind)}</span>
        <span className="min-w-0 max-w-[18rem] truncate text-md text-ink" title={file.name}>
          {file.name}
        </span>
        <span className="flex-none font-mono text-2xs text-muted">{formatFileSize(file.size)}</span>
        <span className="flex-none font-mono text-2xs text-muted">{formatFileTime(file.createdAt)}</span>
        <span className="min-w-0 truncate font-mono text-2xs text-muted" title={fileSourceLabel(file)}>
          来源 {fileSourceLabel(file)}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {previewKind !== 'other' && (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-label={`${open ? '收起' : '预览'}文件 ${file.name}`}
              className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover"
            >
              {open ? '收起' : '预览'}
            </button>
          )}
          <a
            href={file.downloadUrl ?? file.previewUrl ?? '#'}
            download={file.name}
            aria-label={`下载文件 ${file.name}`}
            className="rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover no-underline transition-colors duration-fast hover:border-accent"
          >
            下载
          </a>
        </span>
      </div>

      {open && (
        <div className="mt-1.5 rounded border border-border-subtle bg-surface-sunken p-2">
          {previewKind === 'image' && file.previewUrl ? (
            <img src={file.previewUrl} alt={file.name} className="max-h-64 max-w-full rounded border border-border-subtle" />
          ) : loading ? (
            <p className="m-0 text-2xs text-muted">加载预览…</p>
          ) : error ? (
            <p className="m-0 text-2xs text-danger-ink">预览失败：{error}</p>
          ) : previewKind === 'markdown' ? (
            <div className="max-h-72 overflow-auto">
              <MarkdownMessage text={text} />
            </div>
          ) : (
            <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-secondary">
              {text || '（空文件）'}
            </pre>
          )}
          {truncated && <p className="m-0 mt-1 text-2xs text-warn-ink">内容过长，仅展示前 200K 字符；完整内容请下载。</p>}
        </div>
      )}
    </li>
  )
}

export default function SessionFilesView({ sessionId }: { sessionId: string }) {
  const [files, setFiles] = useState<SessionFile[]>([])
  const [kind, setKind] = useState<SessionFileKind | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    (filter: SessionFileKind | null, signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      void fetchSessionFiles(sessionId, filter, signal)
        .then((payload) => setFiles(normalizeSessionFiles(payload)))
        .catch((cause) => {
          if (signal?.aborted) return
          setFiles([])
          setError(errorText(cause))
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false)
        })
    },
    [sessionId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(kind, controller.signal)
    return () => controller.abort()
  }, [load, kind])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" role="tabpanel" aria-label="文件">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1" role="group" aria-label="文件类型筛选">
          {KIND_FILTERS.map((filter) => {
            const active = kind === filter.value
            return (
              <button
                key={filter.value ?? 'all'}
                type="button"
                onClick={() => setKind(filter.value)}
                aria-pressed={active}
                className={`cursor-pointer rounded-xs border px-2 py-0.5 font-mono text-2xs transition-colors duration-fast ${
                  active ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted hover:text-ink-secondary'
                }`}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
        <span className="ml-auto font-mono text-2xs text-muted">{loading ? '加载中…' : `${files.length} 个文件`}</span>
        <button
          type="button"
          onClick={() => load(kind)}
          disabled={loading}
          className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted disabled:opacity-50"
          title="刷新文件列表"
        >
          刷新
        </button>
      </div>

      {loading && files.length === 0 && (
        <div className="flex flex-col gap-2" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className="h-12 animate-skeleton-shimmer rounded-md bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%]" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="mx-auto mt-6 max-w-md rounded-md border border-border-subtle bg-surface-solid p-3 text-center text-sm text-ink-secondary">
          <p className="m-0 mb-2">{error}</p>
          <button type="button" onClick={() => load(kind)} className="cursor-pointer text-sm text-accent-hover underline underline-offset-2">
            重试
          </button>
        </div>
      )}

      {!loading && !error && files.length === 0 && (
        <div className="mx-auto mt-8 max-w-md rounded-lg border border-dashed border-border bg-scrim p-6 text-center">
          <div className="text-xl text-accent" aria-hidden="true">
            ▤
          </div>
          <p className="m-0 mt-2 mb-1 text-md font-medium text-ink">这个会话还没有文件</p>
          <p className="m-0 text-sm leading-relaxed text-ink-secondary">任务产物与消息附件会出现在这里；上传请回到对话输入框。</p>
        </div>
      )}

      {!loading && !error && files.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="会话文件列表">
          {files.map((file) => (
            <FileRow key={`${file.kind}:${file.id}`} file={file} />
          ))}
        </ul>
      )}
    </div>
  )
}
