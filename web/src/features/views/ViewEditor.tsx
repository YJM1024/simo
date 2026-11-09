// features/views/ViewEditor.tsx —— M28 受控视图编辑器（不写任意 JSON）
//
// 只通过结构化控件修改：标题、块的 props/actions、add_block/remove_block；
// 所有保存都翻译成白名单 patch ops（ui.set_view mode=patch，baseVersion 并发控制）。
// 后端 4xx → 字段/块定位（高亮 + 可读错误），不伪造成功；缩略预览由外部渲染器负责。

import { useCallback, useEffect, useState } from 'react'
import { isRecord } from '../../platform/types.ts'
import { uiSetView } from './actions.ts'
import {
  buildAddBlock,
  buildSetBlockActions,
  buildSetBlockProps,
  buildSetPageTitle,
  buildRemoveBlock,
  extractViewErrorLocation,
  newViewBlock,
  validatePatchOps,
  type ViewErrorLocation,
  type ViewPatchOp,
} from './editor.ts'
import { BLOCK_TYPES, type ActionCatalogEntry, type BlockType, type ViewActionBinding, type ViewBlock, type ViewPage } from './schema.ts'

interface ViewEditorProps {
  page: ViewPage
  pageId: string
  version: number | null
  catalog: readonly ActionCatalogEntry[]
  onSaved: () => Promise<void>
  onNotice: (message: string) => void
  onDirtyChange?: (dirty: boolean) => void
}

interface BlockDraft {
  props: Record<string, unknown>
  actions: ViewActionBinding[]
}

function editableProps(type: BlockType): Array<{ key: string; label: string; kind: 'text' | 'textarea' | 'comma' }> {
  if (type === 'text') return [{ key: 'text', label: '文本', kind: 'textarea' }]
  if (type === 'markdown') return [{ key: 'markdown', label: 'Markdown', kind: 'textarea' }]
  if (type === 'progress') return [{ key: 'title', label: '标题', kind: 'text' }]
  if (type === 'action') return [{ key: 'label', label: '按钮文案', kind: 'text' }]
  if (type === 'ask') return [{ key: 'question', label: '问题', kind: 'text' }, { key: 'options', label: '选项（逗号分隔）', kind: 'comma' }]
  if (type === 'table') return [{ key: 'columns', label: '列（逗号分隔）', kind: 'comma' }]
  if (type === 'kanban') return [{ key: 'columns', label: '状态列（逗号分隔）', kind: 'comma' }]
  if (type === 'image') return [{ key: 'alt', label: '替代文本（必填）', kind: 'text' }, { key: 'src', label: '图片引用（/api/artifacts/ 或 /api/uploads/）', kind: 'text' }]
  if (type === 'form') return [{ key: 'submitLabel', label: '提交按钮文案', kind: 'text' }]
  if (type === 'chart') return [{ key: 'title', label: '图表标题', kind: 'text' }, { key: 'kind', label: '图表类型（bar/line/pie）', kind: 'text' }]
  return []
}

function propsOfBlock(block: ViewBlock): Record<string, unknown> {
  return { ...block.props }
}

function actionsFromSelect(binding: ViewActionBinding | null): ViewActionBinding[] {
  return binding ? [binding] : []
}

export default function ViewEditor({ page, pageId, version, catalog, onSaved, onNotice, onDirtyChange }: ViewEditorProps) {
  const [reason, setReason] = useState('手动编辑视图')
  const [title, setTitle] = useState(page.title)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BlockDraft | null>(null)
  const [newType, setNewType] = useState<BlockType>('text')
  const [afterId, setAfterId] = useState(page.blocks[page.blocks.length - 1]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [blockQuery, setBlockQuery] = useState('')
  const [errorLocation, setErrorLocation] = useState<ViewErrorLocation | null>(null)

  const dirty = title.trim() !== page.title || draft !== null || editingId !== null
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])

  const applyPatch = useCallback(
    async (ops: ViewPatchOp[], summary: string): Promise<boolean> => {
      if (!reason.trim()) {
        onNotice('请填写修改原因（用于审计）')
        return false
      }
      const opError = validatePatchOps(ops)
      if (opError.length > 0) {
        onNotice(`保存被拒绝：${opError.join('；')}`)
        return false
      }
      if (version === null) {
        onNotice('缺少 baseVersion，无法安全保存（请刷新）')
        return false
      }
      setBusy(true)
      setSaveState('saving')
      setErrorLocation(null)
      const result = await uiSetView({
        sessionId: page.sessionId,
        pageId,
        mode: 'patch',
        patch: { ops },
        baseVersion: version,
        reason: reason.trim(),
      })
      setBusy(false)
      if (result.ok) {
        setSaveState('saved')
        onNotice(`已保存新版本：${summary}`)
        await onSaved()
        return true
      }
      setSaveState('error')
      const location = extractViewErrorLocation(result)
      setErrorLocation(location)
      onNotice(`保存失败：${location.message}`)
      return false
    },
    [onNotice, onSaved, page.sessionId, pageId, reason, version],
  )

  const startEdit = (block: ViewBlock): void => {
    setEditingId(block.id)
    setDraft({ props: propsOfBlock(block), actions: [...block.actions] })
    setErrorLocation(null)
  }

  const saveBlock = async (block: ViewBlock): Promise<void> => {
    if (!draft) return
    const ops: ViewPatchOp[] = [buildSetBlockProps(block.id, draft.props)]
    if (block.actions.join('|') !== draft.actions.map((action) => action.id).join('|')) {
      ops.push(buildSetBlockActions(block.id, draft.actions))
    }
    const ok = await applyPatch(ops, `更新块 ${block.id}`)
    if (ok) {
      setEditingId(null)
      setDraft(null)
    }
  }

  const removeBlock = async (block: ViewBlock): Promise<void> => {
    if (!window.confirm(`删除块「${block.id}」？会生成新版本。`)) return
    await applyPatch([buildRemoveBlock(block.id)], `删除块 ${block.id}`)
  }

  const addBlock = async (): Promise<void> => {
    const block = newViewBlock(newType, page.blocks.map((entry) => entry.id))
    await applyPatch([buildAddBlock(block, afterId || page.blocks[page.blocks.length - 1]?.id)], `新增块 ${block.id}`)
  }

  const errorBlockId = errorLocation?.blockId ?? null
  const filteredBlocks = page.blocks.filter((block) => {
    const query = blockQuery.trim().toLowerCase()
    if (!query) return true
    return block.id.toLowerCase().includes(query) || block.type.toLowerCase().includes(query)
  })

  return (
    <div className="mb-2 rounded-lg border border-accent-border bg-surface-solid p-2" aria-label="视图编辑器">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">编辑</span>
        <span className="text-2xs text-muted">受控 patch（add/remove/set props/actions），不写任意 JSON</span>
        <label className="ml-auto flex items-center gap-1 text-2xs text-ink-secondary">
          原因
          <input
            aria-label="修改原因"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-44 rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink"
            placeholder="必填（审计）"
          />
        </label>
      </div>

      {errorLocation && (
        <div role="alert" className="mt-1.5 rounded-md border border-danger-border bg-danger-soft px-2 py-1 text-2xs text-danger-ink">
          保存失败：{errorLocation.message}
          {errorBlockId && <span className="ml-1 font-mono">（块 {errorBlockId}）</span>}
          {errorLocation.field && <span className="ml-1 font-mono">（字段 {errorLocation.field}）</span>}
          <span className="ml-1">本地编辑已保留，可修正后重试。</span>
        </div>
      )}
      {saveState === 'saved' && <p role="status" className="m-0 mt-1.5 rounded border border-ok-border bg-ok-soft px-2 py-1 text-2xs text-ok-ink">已保存新版本；历史不可变。</p>}
      {saveState === 'saving' && <p role="status" aria-busy="true" className="m-0 mt-1.5 text-2xs text-muted">保存中…</p>}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="flex items-center gap-1 text-2xs text-ink-secondary">
          标题
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={Boolean(errorLocation?.field === 'title')}
            className="w-56 rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          disabled={busy || title.trim() === page.title}
          onClick={() => void applyPatch([buildSetPageTitle(title)], '更新页面标题')}
          className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50"
        >
          保存标题
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <label className="flex min-w-0 flex-1 items-center gap-1 text-2xs text-ink-secondary">
          搜索块
          <input
            aria-label="搜索块（id 或类型）"
            value={blockQuery}
            onChange={(event) => setBlockQuery(event.target.value)}
            placeholder="id / type…"
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink"
          />
        </label>
        <span className="font-mono text-2xs text-muted">{filteredBlocks.length}/{page.blocks.length} 块</span>
      </div>

      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0" aria-label="视图块列表">
        {filteredBlocks.length === 0 && (
          <li className="rounded border border-border-subtle bg-surface-sunken px-2 py-1 text-2xs text-muted">没有匹配的块；清除搜索可显示全部。</li>
        )}
        {filteredBlocks.map((block) => (
          <li
            key={block.id}
            className={`rounded-md border px-2 py-1.5 ${errorBlockId === block.id ? 'border-danger-border bg-danger-soft/40' : 'border-border-subtle bg-surface-sunken/40'}`}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-2xs text-ink">{block.id}</span>
              <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">{block.type}</span>
              <span className="min-w-0 flex-1 truncate text-2xs text-ink-secondary" title={JSON.stringify(propsOfBlock(block))}>
                {String(block.props['title'] ?? block.props['label'] ?? block.props['text'] ?? block.props['markdown'] ?? '').slice(0, 48)}
              </span>
              <button type="button" onClick={() => startEdit(block)} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary">
                编辑
              </button>
              <button type="button" onClick={() => void removeBlock(block)} disabled={busy || page.blocks.length <= 1} className="cursor-pointer rounded-xs border border-danger-border bg-danger-soft px-1.5 py-0.5 text-2xs text-danger-ink disabled:opacity-40">
                删除
              </button>
            </div>

            {editingId === block.id && draft && (
              <div className="mt-1.5 flex flex-col gap-1.5 border-t border-border-subtle pt-1.5">
                {editableProps(block.type).map((field) => {
                  const raw = draft.props[field.key]
                  const value = field.kind === 'comma' ? (Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')) : String(raw ?? '')
                  const onChange = (text: string): void => {
                    const nextValue = field.kind === 'comma' ? text.split(',').map((part) => part.trim()).filter(Boolean) : text
                    setDraft((current) => (current ? { ...current, props: { ...current.props, [field.key]: nextValue } } : current))
                  }
                  return (
                    <label key={field.key} className="flex flex-col gap-0.5 text-2xs text-ink-secondary">
                      {field.label}
                      {field.kind === 'textarea' ? (
                        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="rounded-md border border-border-subtle bg-surface px-1.5 py-1 font-mono text-2xs text-ink" />
                      ) : (
                        <input value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink" />
                      )}
                    </label>
                  )
                })}
                {block.type === 'action' && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <label className="flex flex-col gap-0.5 text-2xs text-ink-secondary">
                      绑定动作
                      <select
                        value={draft.actions[0]?.action ?? ''}
                        onChange={(event) => {
                          const actionName = event.target.value
                          const next = actionName ? actionsFromSelect({ id: draft.actions[0]?.id ?? 'run', action: actionName, args: draft.actions[0]?.args ?? {}, confirm: draft.actions[0]?.confirm ?? 'risk' }) : []
                          setDraft((current) => (current ? { ...current, actions: next } : current))
                        }}
                        className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink"
                      >
                        <option value="">（未绑定）</option>
                        {catalog.map((entry) => (
                          <option key={entry.name} value={entry.name}>{entry.name} · {entry.risk || '—'}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 text-2xs text-ink-secondary">
                      确认级别
                      <select
                        value={draft.actions[0]?.confirm ?? 'risk'}
                        onChange={(event) => {
                          const confirm = event.target.value === 'always' ? 'always' : event.target.value === 'none' ? 'none' : 'risk'
                          setDraft((current) => (current && current.actions[0] ? { ...current, actions: [{ ...current.actions[0], confirm }] } : current))
                        }}
                        className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink"
                      >
                        <option value="none">none</option>
                        <option value="risk">risk</option>
                        <option value="always">always</option>
                      </select>
                    </label>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => void saveBlock(block)} disabled={busy} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50">
                    保存块
                  </button>
                  <button type="button" onClick={() => { setEditingId(null); setDraft(null) }} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">
                    取消
                  </button>
                  <span className="text-2xs text-muted">保存后生成新版本；后端 4xx 会定位到块/字段。</span>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap items-end gap-1.5 border-t border-border-subtle pt-2">
        <label className="flex flex-col gap-0.5 text-2xs text-ink-secondary">
          新增块类型
          <select value={newType} onChange={(event) => setNewType(event.target.value as BlockType)} className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink">
            {BLOCK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-2xs text-ink-secondary">
          插入到
          <select value={afterId} onChange={(event) => setAfterId(event.target.value)} className="rounded-md border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink">
            {page.blocks.map((block) => <option key={block.id} value={block.id}>{block.id}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void addBlock()} disabled={busy} className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-2 py-0.5 text-2xs text-accent-hover disabled:opacity-50">
          添加块
        </button>
        <span className="text-2xs text-muted">新增块后用「编辑」填属性；保存失败不产生版本。</span>
      </div>
    </div>
  )
}

/** 版本面板纯展示辅助（由 VersionPanel 使用）。 */
export function versionReason(value: unknown): string {
  if (!isRecord(value)) return ''
  return typeof value['reason'] === 'string' ? value['reason'] : ''
}
