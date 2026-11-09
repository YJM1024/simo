// features/views/VersionPanel.tsx —— M28 版本面板（列表/预览/回滚确认）
//
// GET /api/views/{id}/versions 列表；GET /api/views/{id}/versions/{v} 回滚前预览；
// 回滚由父组件调用 ui.set_view mode=rollback（生成新版本，历史不删）。后端缺失时空态说明。
// 只读面板 + 显式确认；不伪造版本/回滚成功。

import { useCallback, useEffect, useState } from 'react'
import { apiGet } from '../../platform/http.ts'
import { isRecord, readString } from '../../platform/types.ts'
import { EmptyPane } from '../../platform/FeedbackPane.tsx'
import { extractVersionSchema, normalizeViewVersions, type ViewVersionInfo } from './editor.ts'
import { BLOCK_META } from './schema.ts'

interface VersionPanelProps {
  pageId: string
  currentVersion: number | null
  onRollback: (targetVersion: number) => Promise<void>
  onNotice: (message: string) => void
}

interface VersionPreview {
  version: number
  title: string
  blockTypes: string[]
  hash: string
}

function summarizeSchema(value: unknown, version: number): VersionPreview | null {
  if (!isRecord(value)) return null
  const title = readString(value, 'title') ?? '（无标题）'
  const blocks = Array.isArray(value['blocks']) ? value['blocks'] : []
  return {
    version,
    title,
    blockTypes: blocks
      .map((entry) => (isRecord(entry) ? readString(entry, 'type') ?? 'unknown' : 'unknown'))
      .filter((type) => typeof type === 'string'),
    hash: readString(value, 'hash') ?? '',
  }
}

export default function VersionPanel({ pageId, currentVersion, onRollback, onNotice }: VersionPanelProps) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<ViewVersionInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<VersionPreview | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const payload = await apiGet(`/api/views/${encodeURIComponent(pageId)}/versions`)
      setVersions(normalizeViewVersions(payload))
    } catch (cause) {
      setVersions([])
      setError(
        (cause as { status?: number }).status === 404
          ? '版本接口尚未就绪（或该视图暂无历史）；不展示示例数据。'
          : cause instanceof Error && cause.message
            ? cause.message
            : '版本列表加载失败',
      )
    } finally {
      setLoading(false)
    }
  }, [pageId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const previewVersion = async (version: number): Promise<void> => {
    setPreview(null)
    try {
      const payload = await apiGet(`/api/views/${encodeURIComponent(pageId)}/versions/${version}`)
      const schema = extractVersionSchema(payload)
      const summary = summarizeSchema(schema, version)
      if (!summary) {
        onNotice('该版本 schema 为空/不可解析')
        return
      }
      setPreview({ ...summary, hash: readString(isRecord(payload) ? payload : {}, 'hash') ?? summary.hash })
    } catch (cause) {
      onNotice(`版本预览失败：${cause instanceof Error ? cause.message : '未知错误'}`)
    }
  }

  const rollback = async (version: number): Promise<void> => {
    if (!window.confirm(`回滚到 v${version}？回滚会生成新版本，历史版本不删除。`)) return
    setBusy(true)
    await onRollback(version)
    setBusy(false)
  }

  return (
    <div className="mb-2 rounded-lg border border-border-subtle bg-surface-solid p-2" aria-label="视图版本">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 text-left"
      >
        <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">版本</span>
        <span className="text-sm text-ink">版本面板</span>
        <span className="font-mono text-2xs text-muted">当前 v{currentVersion ?? '—'} · 历史不可变，回滚生成新版本</span>
        <span className="ml-auto font-mono text-2xs text-muted">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="mt-1.5 border-t border-border-subtle pt-1.5">
          {loading ? (
            <p className="m-0 text-2xs text-muted">加载版本列表…</p>
          ) : error ? (
            <div role="status" className="rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
              {error}
            </div>
          ) : versions.length === 0 ? (
            <EmptyPane compact title="暂无版本历史" description="后端版本接口未就绪或还没有保存过版本；不展示示例版本。" />
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="版本列表">
                {versions.map((version) => (
                  <li key={version.version} className="flex flex-wrap items-center gap-1.5 rounded border border-border-subtle bg-surface-sunken px-1.5 py-1 text-2xs">
                    <span className="font-mono text-ink">v{version.version}</span>
                    {version.version === currentVersion && <span className="rounded-pill border border-accent-border bg-accent-soft px-1 font-mono text-2xs text-accent-hover">当前</span>}
                    {version.reason && <span className="min-w-0 flex-1 truncate text-ink-secondary" title={version.reason}>{version.reason}</span>}
                    {version.hash && <span className="font-mono text-muted" title={version.hash}>{version.hash.slice(0, 10)}</span>}
                    {version.createdAt !== null && <span className="font-mono text-muted">{new Date(version.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>}
                    <button type="button" onClick={() => void previewVersion(version.version)} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary">
                      预览
                    </button>
                    {version.version !== currentVersion && (
                      <button type="button" onClick={() => void rollback(version.version)} disabled={busy} className="cursor-pointer rounded-xs border border-warn-border bg-warn-soft px-1.5 py-0.5 text-2xs text-warn-ink disabled:opacity-50">
                        回滚到 v{version.version}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {preview && (
                <div className="mt-1.5 rounded border border-border-subtle bg-surface-sunken px-1.5 py-1">
                  <p className="m-0 text-2xs text-ink">
                    预览 v{preview.version}：{preview.title} · {preview.blockTypes.length} 块
                  </p>
                  <p className="m-0 mt-0.5 font-mono text-2xs text-muted">
                    {preview.blockTypes.map((type) => BLOCK_META[type as keyof typeof BLOCK_META]?.label ?? type).join(' / ') || '（无块）'}
                  </p>
                  <p className="m-0 mt-0.5 text-2xs text-warn-ink">回滚前确认：回滚会生成新版本，不修改历史；旧 schema 若引用下架动作会被后端拒绝。</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
