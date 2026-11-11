// features/views/ViewPreview.tsx —— 自定义视图预览（M24：ui.get_view 读取 + 13 块渲染 + fallback）
//
// 入口：设置/命令面板；当前会话视图。渲染器只认声明式 schema；未知块整页 fallback（table/chat）。
// 版本不可变；回滚=ui.set_view mode=rollback 生成新版本；删除=ui.delete_view 软删。
// 数据绑定只读动作（动作目录校验）；动作绑定统一 /api/actions，R3+ 由后端审批。

import { useCallback, useEffect, useRef, useState } from 'react'
import { EmptyPane, ErrorPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { readSessionId } from '../../platform/router.ts'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  extractLoadedView,
  fetchActionCatalog,
  uiDeleteView,
  uiGetView,
  uiSetView,
  callAction,
  type LoadedView,
} from './actions.ts'
import {
  fallbackSummary,
  normalizeActionCatalog,
  resolveBindingArgs,
  validateViewPage,
  type ActionCatalogEntry,
  type ViewActionBinding,
  type ViewPage,
  type ViewValidation,
} from './schema.ts'
import ViewEditor from './ViewEditor.tsx'
import VersionPanel from './VersionPanel.tsx'
import { ViewPageRenderer } from './ViewRenderer.tsx'

interface FallbackInfo {
  title: string
  rows: Array<{ id: string; type: string; label: string }>
  chatPrompt: string
  reason: string
}

function FallbackView({ info, onClose }: { info: FallbackInfo; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-warn-border bg-warn-soft px-2 py-1.5 text-2xs text-warn-ink">
        {info.reason} 已降级为只读表格；对话仍可用。
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-2xs">
          <thead>
            <tr>
              <th className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left text-ink-secondary">块 id</th>
              <th className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left text-ink-secondary">类型</th>
              <th className="border border-border-subtle bg-surface-sunken px-1.5 py-1 text-left text-ink-secondary">说明</th>
            </tr>
          </thead>
          <tbody>
            {info.rows.map((row) => (
              <tr key={row.id}>
                <td className="border border-border-subtle px-1.5 py-1 font-mono text-ink-secondary">{row.id}</td>
                <td className="border border-border-subtle px-1.5 py-1 font-mono text-ink-secondary">{row.type}</td>
                <td className="border border-border-subtle px-1.5 py-1 text-ink-secondary">{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {info.chatPrompt && (
        <p className="m-0 rounded-md border border-border-subtle bg-surface-sunken px-2 py-1 text-2xs text-ink-secondary">
          对话等价：{info.chatPrompt}
        </p>
      )}
      <button type="button" onClick={onClose} className="w-fit cursor-pointer rounded-md border border-accent-border bg-accent-soft px-2.5 py-1 text-sm text-accent-hover">
        回到对话
      </button>
    </div>
  )
}

export default function ViewPreview({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, true, onClose)
  const sessionId = readSessionId()
  const [loaded, setLoaded] = useState<LoadedView | null>(null)
  const [validation, setValidation] = useState<ViewValidation | null>(null)
  const [catalog, setCatalog] = useState<ActionCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallback, setFallback] = useState<FallbackInfo | null>(null)
  const [editing, setEditing] = useState(false)
  const [editorDirty, setEditorDirty] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setNotice(null)
    setEditing(false)
    setFallback(null)
    try {
      const [viewResult, catalogPayload] = await Promise.all([
        uiGetView(sessionId ?? ''),
        fetchActionCatalog().catch(() => null),
      ])
      setCatalog(normalizeActionCatalog(catalogPayload))
      if (!viewResult.ok) {
        setLoaded(null)
        setValidation(null)
        setError(viewResult.error?.message ?? '自定义视图读取失败')
        return
      }
      const extracted = extractLoadedView(viewResult)
      setLoaded(extracted)
      if (!extracted || !extracted.page) {
        setValidation(null)
        return
      }
      const result = validateViewPage(extracted.page)
      setValidation(result)
      if (!result.ok || result.fallback) {
        const summary = fallbackSummary(extracted.page)
        setFallback({
          ...summary,
          reason: result.fallback ? '视图包含当前客户端不支持的块类型。' : '视图 schema 校验未通过/已降级。',
        })
      }
    } catch (cause) {
      setLoaded(null)
      setError(cause instanceof Error ? cause.message : '自定义视图读取失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  const runAction = useCallback(
    async (page: ViewPage, binding: ViewActionBinding, row?: Record<string, unknown>): Promise<boolean> => {
      const resolved = resolveBindingArgs(binding.args, { sessionId: page.sessionId, pageId: page.id, ...(row ? { row } : {}) })
      if (binding.confirm === 'always' || binding.confirm === 'risk') {
        const confirmed = window.confirm(`确认执行动作「${binding.action}」？\n风险动作可能需要审批。`)
        if (!confirmed) return false
      }
      setBusy(true)
      const result = await callAction(binding.action, { ...resolved, source: { kind: 'view', pageId: page.id, actionId: binding.id } })
      setBusy(false)
      if (result.ok) {
        setNotice('动作已提交，正在刷新视图…')
        await load()
        return true
      }
      setNotice(`动作失败：${result.error?.message ?? '未知错误'}${result.error?.recovery ? `；${result.error.recovery}` : ''}`)
      return false
    },
    [load],
  )

  const rollback = async (): Promise<void> => {
    if (!loaded?.pageId || loaded.previousVersion === null || !loaded.version) return
    if (!window.confirm(`回滚到 v${loaded.previousVersion}？回滚会生成新版本，历史版本不删除。`)) return
    setBusy(true)
    const result = await uiSetView({
      sessionId: sessionId ?? '',
      pageId: loaded.pageId,
      mode: 'rollback',
      targetVersion: loaded.previousVersion,
      baseVersion: loaded.version,
      reason: `rollback to v${loaded.previousVersion}`,
    })
    setBusy(false)
    setNotice(result.ok ? '回滚已提交（新版本）' : `回滚失败：${result.error?.message ?? '未知错误'}`)
    if (result.ok) await load()
  }

  const removeView = async (): Promise<void> => {
    if (!loaded?.pageId) return
    if (!window.confirm('删除当前自定义视图（软删）？不影响对话与已有能力。')) return
    setBusy(true)
    const result = await uiDeleteView({ sessionId: sessionId ?? '', pageId: loaded.pageId, reason: 'user delete via preview' })
    setBusy(false)
    if (result.ok) {
      setLoaded(null)
      setValidation(null)
      setFallback(null)
      setNotice('视图已删除（软删）；可继续用对话。')
    } else {
      setNotice(`删除失败：${result.error?.message ?? '未知错误'}`)
    }
  }

  const page = validation?.ok && validation.page ? validation.page : null
  const versionLabel = loaded?.version !== null && loaded?.version !== undefined ? `v${loaded.version}` : 'v—'
  const hasPrevious = loaded?.previousVersion !== null && loaded?.previousVersion !== undefined
  const guardLeave = (action: string): boolean => {
    if (!editing || !editorDirty) return true
    return window.confirm(`有未保存的视图修改，${action}会丢失本地编辑。继续？`)
  }
  const toggleEditing = (): void => {
    if (editing && !guardLeave('退出编辑')) return
    setEditing((value) => !value)
    setEditorDirty(false)
  }
  const requestClose = (): void => {
    if (!guardLeave('关闭预览')) return
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim-strong p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="自定义视图预览" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}>
      <div ref={panelRef} className="popover-surface flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden">
        <header className="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2 className="m-0 flex flex-wrap items-center gap-1.5 font-serif text-[18px] font-medium tracking-normal text-ink">
              自定义视图
              <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">{versionLabel}</span>
              {page && validation?.fallback && <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink">降级</span>}
            </h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">
              只读渲染（schema v1，13 类块）；修改/生成请通过对话。版本不可变；回滚生成新版本。
            </p>
          </div>
          <div className="flex flex-none flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => void load()} disabled={loading || busy} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-muted disabled:opacity-50">
              刷新
            </button>
            {page && loaded?.pageId && (
              <button type="button" onClick={toggleEditing} aria-pressed={editing} className="cursor-pointer rounded-md border border-accent-border bg-accent-soft px-2 py-1 text-sm text-accent-hover">
                {editing ? '退出编辑' : '编辑'}
              </button>
            )}
            {hasPrevious && (
              <button type="button" onClick={() => void rollback()} disabled={busy} className="cursor-pointer rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-sm text-warn-ink disabled:opacity-50">
                回滚到 v{loaded?.previousVersion}
              </button>
            )}
            {loaded?.pageId && (
              <button type="button" onClick={() => void removeView()} disabled={busy} className="cursor-pointer rounded-md border border-danger-border bg-danger-soft px-2 py-1 text-sm text-danger-ink disabled:opacity-50">
                删除视图
              </button>
            )}
            <button type="button" onClick={requestClose} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-muted hover:text-ink">
              关闭 ×
            </button>
          </div>
        </header>

        {notice && (
          <p role="status" className="m-0 border-b border-border-subtle bg-accent-soft px-3 py-1 text-2xs text-accent-hover sm:px-4">
            {notice}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
          {page && loaded?.pageId && (
            <>
              {editing && (
                <ViewEditor
                  page={page}
                  pageId={loaded.pageId}
                  version={loaded.version}
                  catalog={catalog}
                  onSaved={load}
                  onNotice={setNotice}
                  onDirtyChange={setEditorDirty}
                />
              )}
              <VersionPanel
                pageId={loaded.pageId}
                currentVersion={loaded.version}
                onRollback={async (target) => {
                  if (!loaded.version) return
                  const result = await uiSetView({ sessionId: sessionId ?? '', pageId: loaded.pageId as string, mode: 'rollback', targetVersion: target, baseVersion: loaded.version, reason: `rollback to v${target}` })
                  setNotice(result.ok ? `已回滚到 v${target}（生成新版本）` : `回滚失败：${result.error?.message ?? '未知错误'}`)
                  if (result.ok) await load()
                }}
                onNotice={setNotice}
              />
            </>
          )}
          {loading ? (
            <LoadingPane label="加载自定义视图…" rows={3} />
          ) : error ? (
            <div>
              <ErrorPane title="自定义视图不可用" message={error} onRetry={() => void load()} />
              <p className="m-0 mt-2 text-center text-2xs text-muted">视图不可用时对话仍可用；可在对话里让司墨生成或修改视图。</p>
            </div>
          ) : !loaded?.page ? (
            <EmptyPane title="当前会话还没有自定义视图" description="在对话里让司墨生成视图（ui.set_view 已注册）；修改/回滚也通过对话或本页版本提示完成。" />
          ) : fallback ? (
            <FallbackView info={fallback} onClose={onClose} />
          ) : page ? (
            <>
              <h3 className="m-0 mb-2 text-md font-semibold text-ink">{page.title}</h3>
              <ViewPageRenderer page={page} catalog={catalog} onRunAction={runAction} onNotice={setNotice} />
            </>
          ) : (
            <FallbackView
              info={{
                ...fallbackSummary(loaded.page),
                reason: '视图 schema 校验未通过。',
              }}
              onClose={onClose}
            />
          )}
        </div>

        <footer className="flex-none border-t border-border-subtle px-3 py-1.5 font-mono text-2xs text-muted sm:px-4">
          视图是同一套会话消息+动作的投影；动作统一 /api/actions（R3+ 审批）。未知块/绑定失败 → 表格降级，不白屏。
        </footer>
      </div>
    </div>
  )
}
