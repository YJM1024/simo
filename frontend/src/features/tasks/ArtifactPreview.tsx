// features/tasks/ArtifactPreview.tsx —— 产物条目 + 内联预览（文本/Markdown/图片；其它下载）
//
// 契约（M5）：文本/Markdown/图片预览，其它类型显示下载；内容来自
// GET /api/artifacts/{id}/content。Markdown 用本 feature 的极简渲染（无第三方依赖）。

import { useEffect, useState } from 'react'
import { formatSize, parseMarkdown, type MarkdownBlock, type TaskArtifact } from './model.ts'
import { artifactContentUrl, fetchArtifactBlob, fetchArtifactText } from './rest.ts'
import { Icon } from '../../platform/ui/icons.tsx'

const KIND_LABEL: Record<string, string> = {
  markdown: 'Markdown',
  text: '文本',
  image: '图片',
  other: '文件',
}

function renderMarkdown(blocks: MarkdownBlock[]): React.ReactNode {
  return blocks.map((block, index) => {
    switch (block.kind) {
      case 'heading': {
        const size = block.level <= 2 ? 'text-lg' : block.level === 3 ? 'text-md' : 'text-sm'
        return (
          <p key={index} className={`m-0 mt-3 mb-1 font-semibold text-ink ${size}`}>
            {block.text}
          </p>
        )
      }
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex} className="ml-5 list-disc text-md leading-relaxed text-ink-secondary">
            {item}
          </li>
        ))
        return block.ordered ? (
          <ol key={index} className="m-0 my-1 list-decimal pl-5 text-md">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ol>
        ) : (
          <ul key={index} className="m-0 my-1 p-0">
            {items}
          </ul>
        )
      }
      case 'code':
        return (
          <pre
            key={index}
            className="my-2 max-h-60 overflow-auto rounded-md border border-border-subtle bg-surface-sunken p-2 font-mono text-2xs leading-relaxed text-ink-secondary"
          >
            {block.text}
          </pre>
        )
      case 'quote':
        return (
          <blockquote key={index} className="my-2 border-l-2 border-accent-border pl-3 text-sm italic text-muted">
            {block.text}
          </blockquote>
        )
      case 'rule':
        return <hr key={index} className="my-3 border-border-subtle" />
      case 'table':
        return (
          <div key={index} className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th key={headerIndex} className="border border-border-subtle bg-surface-sunken px-2 py-1 text-left font-medium text-ink">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="border border-border-subtle px-2 py-1 align-top text-ink-secondary">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      default:
        return (
          <p key={index} className="m-0 my-1 whitespace-pre-wrap break-words text-md leading-relaxed text-ink-secondary">
            {block.text}
          </p>
        )
    }
  })
}

function previewKindForError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '预览加载失败'
}

export default function ArtifactPreview({ artifact, compact = false }: { artifact: TaskArtifact; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  const previewable = artifact.kind !== 'other'

  useEffect(() => {
    if (!open || !previewable) return
    let cancelled = false
    let objectUrl: string | null = null
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        if (artifact.kind === 'image') {
          const blob = await fetchArtifactBlob(artifact.id)
          objectUrl = URL.createObjectURL(blob)
          if (!cancelled) setImageUrl(objectUrl)
        } else {
          const result = await fetchArtifactText(artifact.id)
          if (!cancelled) {
            setText(result.text)
            setTruncated(result.truncated)
          }
        }
      } catch (err) {
        if (!cancelled) setError(previewKindForError(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, previewable, artifact.id, artifact.kind])

  function closePreview(): void {
    setOpen(false)
    setImageUrl(null)
    setText('')
    setTruncated(false)
    setError(null)
  }

  return compact ? (
    <li className="group border-b border-border-subtle last:border-0">
      <div className="flex h-8 min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-ink" title={artifact.name}>{artifact.name}</span>
        {artifact.size !== null && <span className="flex-none text-[11px] tabular-nums text-muted">{formatSize(artifact.size)}</span>}
        <div className="flex flex-none items-center gap-1 opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100">
          {previewable && (
            <button type="button" onClick={() => (open ? closePreview() : setOpen(true))} aria-label={`${open ? '收起' : '预览'} ${artifact.name}`} title={open ? '收起预览' : '预览'} className="grid h-6 w-6 cursor-pointer place-items-center rounded-xs border border-border-subtle bg-surface-solid text-ink-secondary hover:text-ink">
              <Icon name="file" size={16} />
            </button>
          )}
          <a href={artifactContentUrl(artifact.id)} download={artifact.name} aria-label={`下载 ${artifact.name}`} title="下载" className="grid h-6 w-6 place-items-center rounded-xs border border-border-subtle bg-surface-solid text-ink-secondary no-underline hover:text-ink">
            <Icon name="external" size={16} />
          </a>
        </div>
      </div>
      {open && (
        <div className="mb-2 rounded-xs border border-border-subtle bg-surface-sunken p-2">
          {loading && <p className="m-0 text-xs text-muted">加载预览…</p>}
          {error && <p className="m-0 text-xs text-danger-ink">预览失败：{error}</p>}
          {!loading && !error && artifact.kind === 'image' && imageUrl && <img src={imageUrl} alt={artifact.name} className="max-h-60 max-w-full rounded-xs border border-border-subtle" />}
          {!loading && !error && artifact.kind === 'text' && <pre className="m-0 max-h-60 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-secondary">{text || '（空文件）'}</pre>}
          {!loading && !error && artifact.kind === 'markdown' && <div className="max-h-60 overflow-auto">{renderMarkdown(parseMarkdown(text))}</div>}
          {!loading && !error && artifact.kind === 'other' && <p className="m-0 text-xs text-muted">该类型不支持内联预览，请下载。</p>}
        </div>
      )}
    </li>
  ) : (
    <li className="rounded-md border border-border-subtle bg-surface-solid p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex-none rounded-xs border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-muted">
            {KIND_LABEL[artifact.kind] ?? '文件'}
          </span>
          <span className="min-w-0 truncate text-md text-ink" title={artifact.name}>
            {artifact.name}
          </span>
          {artifact.size !== null && <span className="flex-none font-mono text-2xs text-muted">{formatSize(artifact.size)}</span>}
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {previewable && (
            <button
              type="button"
              onClick={() => (open ? closePreview() : setOpen(true))}
              className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover"
            >
              {open ? '收起' : '预览'}
            </button>
          )}
          <a
            href={artifactContentUrl(artifact.id)}
            download={artifact.name}
            className="rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover no-underline transition-colors duration-fast hover:border-accent"
            title="下载产物"
          >
            下载
          </a>
        </div>
      </div>

      {open && (
        <div className="mt-2 rounded-md border border-border-subtle bg-surface-sunken p-2">
          {loading && <p className="m-0 text-sm text-muted">加载预览…</p>}
          {error && (
            <p className="m-0 text-sm text-danger-ink">
              预览失败：{error}
              <span className="ml-1 text-muted">（仍可下载）</span>
            </p>
          )}
          {!loading && !error && artifact.kind === 'image' && imageUrl && (
            <img src={imageUrl} alt={artifact.name} className="max-h-72 max-w-full rounded border border-border-subtle" />
          )}
          {!loading && !error && artifact.kind === 'text' && <pre className="m-0 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-ink-secondary">{text || '（空文件）'}</pre>}
          {!loading && !error && artifact.kind === 'markdown' && <div className="max-h-72 overflow-auto">{renderMarkdown(parseMarkdown(text))}</div>}
          {!loading && !error && artifact.kind === 'other' && (
            <p className="m-0 text-sm text-muted">该类型不支持内联预览，请使用右侧「下载」。</p>
          )}
          {truncated && <p className="m-0 mt-1 text-2xs text-warn-ink">内容过长，仅展示前 200K 字符；完整内容请下载。</p>}
        </div>
      )}
    </li>
  )
}
