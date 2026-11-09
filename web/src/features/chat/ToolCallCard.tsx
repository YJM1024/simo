// features/chat/ToolCallCard.tsx —— UI-2 工具调用卡片（七类渲染）
//
// command / file_read / file_write(含 diff) / web / filegen / approval / error；unknown 降级 JSON。
// 只读展示；命令/输出已脱敏；审批动作仍走现有审批条（不在此处本地执行）。

import { useState } from 'react'
import {
  formatToolStatus,
  maskSecrets,
  toolCardKindLabel,
  type ToolCardData,
} from './toolcards.ts'

const STATUS_TONE: Record<string, string> = {
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  done: 'border-ok-border bg-ok-soft text-ok-ink',
  success: 'border-ok-border bg-ok-soft text-ok-ink',
  failed: 'border-danger-border bg-danger-soft text-danger-ink',
  error: 'border-danger-border bg-danger-soft text-danger-ink',
  denied: 'border-warn-border bg-warn-soft text-warn-ink',
  timeout: 'border-warn-border bg-warn-soft text-warn-ink',
  running: 'border-accent-border bg-accent-soft text-accent-hover',
  pending: 'border-border-subtle bg-surface-sunken text-muted',
}

function toneOf(status: string): string {
  return STATUS_TONE[status] ?? 'border-border-subtle bg-surface-sunken text-muted'
}

function formatSize(size: number | null): string {
  if (size === null) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export default function ToolCallCard({ data, defaultOpen = false }: { data: ToolCardData; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border border-border-subtle bg-surface-solid">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 px-2 py-1.5 text-left"
      >
        <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">
          {toolCardKindLabel(data.kind)}
        </span>
        <span className="font-mono text-2xs text-ink">{data.tool}</span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${toneOf(data.status)}`}>{formatToolStatus(data.status)}</span>
        {data.risk && <span className="font-mono text-2xs text-warn-ink">风险·{data.risk}</span>}
        {data.durationMs !== null && <span className="font-mono text-2xs text-muted">{Math.round(data.durationMs)}ms</span>}
        <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary" title={data.summary || data.command || data.path || data.tool}>
          {data.summary || data.command || data.path || data.query || data.tool}
        </span>
        <span className="font-mono text-2xs text-muted">{open ? '收起' : '详情'}</span>
      </button>

      {open && (
        <div className="border-t border-border-subtle px-2 py-1.5">
          {data.kind === 'command' && (
            <div className="flex flex-col gap-1">
              {data.command && (
                <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink">
                  $ {data.command}
                </pre>
              )}
              {data.output && (
                <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink-secondary">
                  {data.output}
                </pre>
              )}
              {data.truncated && (
                <p className="m-0 text-2xs text-warn-ink">输出过大，已截断{data.spillPath ? `；完整输出：${data.spillPath}` : ''}。</p>
              )}
            </div>
          )}

          {(data.kind === 'file_read' || data.kind === 'file_write') && (
            <div className="flex flex-col gap-1">
              {data.path && <p className="m-0 break-all font-mono text-2xs text-ink-secondary">路径：{data.path}</p>}
              {data.kind === 'file_read' && data.query && <p className="m-0 font-mono text-2xs text-muted">模式：{data.query}</p>}
              {data.diff && (
                <p className="m-0 font-mono text-2xs text-muted">
                  diff：<span className="text-ok-ink">+{data.diff.added}</span> / <span className="text-danger-ink">-{data.diff.removed}</span>
                </p>
              )}
              {data.diff?.patch && (
                <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink-secondary">
                  {data.diff.patch}
                </pre>
              )}
            </div>
          )}

          {data.kind === 'web' && (
            <div className="flex flex-col gap-1">
              {data.query && <p className="m-0 text-2xs text-ink-secondary">查询：{data.query}</p>}
              {data.url && (
                <a href={data.url} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-2xs text-accent-hover underline underline-offset-2">
                  {data.url}
                </a>
              )}
              {data.sources.length > 0 && (
                <ul className="m-0 list-none p-0">
                  {data.sources.map((source) => (
                    <li key={source.url} className="truncate text-2xs">
                      <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent-hover underline underline-offset-2">
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {data.kind === 'filegen' && data.artifact && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs text-ink">{data.artifact.name}</span>
              {data.artifact.size !== null && <span className="font-mono text-2xs text-muted">{formatSize(data.artifact.size)}</span>}
              {data.artifact.previewUrl && (
                <a href={data.artifact.previewUrl} target="_blank" rel="noopener noreferrer" className="rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover no-underline">
                  预览
                </a>
              )}
              {data.artifact.downloadUrl && (
                <a href={data.artifact.downloadUrl} download={data.artifact.name} className="rounded-xs border border-border-subtle px-1.5 py-0.5 text-2xs text-ink-secondary no-underline">
                  下载
                </a>
              )}
            </div>
          )}

          {data.kind === 'approval' && (
            <div className="flex flex-col gap-1">
              <p className="m-0 text-2xs text-warn-ink">审批动作请在审批条/任务详情完成（M9）；这里只读展示。</p>
              {data.command && <pre className="m-0 break-words whitespace-pre-wrap rounded bg-surface-sunken px-1.5 py-1 font-mono text-2xs">{data.command}</pre>}
              {data.approvalId && <p className="m-0 font-mono text-2xs text-muted">审批 id：{data.approvalId}</p>}
            </div>
          )}

          {data.kind === 'error' && <p className="m-0 whitespace-pre-wrap break-words text-2xs text-danger-ink">{data.error ?? '工具执行失败'}</p>}

          {data.kind === 'unknown' && (
            <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink-secondary">
              {maskSecrets(JSON.stringify(data, null, 2))}
            </pre>
          )}

          <details className="mt-1">
            <summary className="cursor-pointer font-mono text-2xs text-muted">原始数据（已脱敏）</summary>
            <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-surface-sunken px-1.5 py-1 font-mono text-2xs text-ink-secondary">
              {maskSecrets(JSON.stringify(data, null, 2))}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
