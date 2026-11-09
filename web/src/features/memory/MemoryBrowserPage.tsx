// features/memory/MemoryBrowserPage.tsx —— 记忆浏览器（M21 / design/24 v0.3.1，只读）
//
// 浏览：搜索 + 类型过滤（场景/语义/规范/程序/工作）+ 按实体浏览 + 实体详情（关系/关联记忆）。
// 冲突：disputed 双方来源/时间/状态，标注「需裁决」；智能体：按智能体通用记忆（只读，标来源会话）；
// 金字塔：L0–L4 可折叠；全部只读；后端未就绪时显示空态说明，不伪造数据。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyPane, ErrorPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import { authorityLabel, formatConfidence, formatTimestamp, statusLabel } from './model.ts'
import {
  LAYER_META,
  MEMORY_TYPES,
  PYRAMID_VIEWS,
  entitiesFromItems,
  entityKindLabel,
  memoryTypeLabel,
  normalizeAgentList,
  normalizeBrowserConflicts,
  normalizeBrowserItems,
  normalizeEntities,
  normalizeEntityDetail,
  normalizePyramid,
  relationLabel,
  sourceLabel,
  type AgentMemoryAgent,
  type BrowserConflict,
  type BrowserMemoryItem,
  type EntityDetail,
  type MemoryEntity,
  type MemoryRelation,
  type MemoryType,
  type PyramidNode,
} from './browser.ts'
import {
  fetchBrowserAgentMemory,
  fetchBrowserAgents,
  fetchBrowserConflicts,
  fetchBrowserEntities,
  fetchBrowserEntityDetail,
  fetchBrowserItems,
  fetchBrowserPyramid,
} from './browser-rest.ts'

type BrowserTab = 'browse' | 'conflicts' | 'agents' | 'pyramid'

const TABS: Array<{ id: BrowserTab; label: string }> = [
  { id: 'browse', label: '浏览' },
  { id: 'conflicts', label: '冲突' },
  { id: 'agents', label: '智能体' },
  { id: 'pyramid', label: '金字塔' },
]

const TYPE_FILTERS: Array<{ id: MemoryType | 'all'; label: string }> = [
  { id: 'all', label: '全部' },
  ...MEMORY_TYPES.map((type) => ({ id: type.id, label: type.label })),
]

function isUnavailable(error: unknown): boolean {
  const status = (error as { status?: number }).status
  return status === 404 || status === 405
}

function errorText(error: unknown): string {
  if (isUnavailable(error)) return '记忆 v0.3 接口尚未就绪（实体/条目/冲突/智能体/金字塔端点缺失）。'
  return error instanceof Error && error.message ? error.message : '记忆加载失败'
}

function MemoryItemCard({ item, onEntity }: { item: BrowserMemoryItem; onEntity: (id: string, name: string) => void }) {
  return (
    <li className="rounded-md border border-border-subtle bg-surface-solid p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-pill border border-accent-border bg-accent-soft px-1.5 font-mono text-2xs text-accent-hover">
          {memoryTypeLabel(item.type)}
        </span>
        {item.subType && <span className="font-mono text-2xs text-muted">{item.subType}</span>}
        <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">
          {statusLabel(item.status)}
        </span>
        <span className="font-mono text-2xs text-muted">
          层 {item.layer} · {sourceLabel(item.source)} · {authorityLabel(item.authority)} · 置信 {formatConfidence(item.confidence)}
        </span>
        {item.validUntil !== null && <span className="font-mono text-2xs text-warn-ink">已失效</span>}
      </div>
      <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{item.text}</p>
      {item.refs.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1" aria-label="记忆来源">
          <span className="font-mono text-2xs text-muted">来源：</span>
          {item.refs.map((ref) => (
            <span key={ref} className="rounded-xs border border-border-subtle bg-surface-sunken px-1 py-0.5 font-mono text-2xs text-ink-secondary">
              {ref}
            </span>
          ))}
        </div>
      )}
      {(item.entityRefs.length > 0 || item.attributedTo) && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {item.entityRefs.map((ref) => (
            <button
              key={ref.id}
              type="button"
              onClick={() => onEntity(ref.id, ref.name)}
              className="cursor-pointer rounded-xs border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-accent-hover"
              title={`打开实体：${ref.name}`}
            >
              {ref.name}
            </button>
          ))}
          {item.attributedTo && <span className="font-mono text-2xs text-muted">归属：{item.attributedTo}</span>}
          {item.ownerAgent && <span className="font-mono text-2xs text-muted">写域：{item.ownerAgent}</span>}
          {formatTimestamp(item.updatedAt ?? item.createdAt) && (
            <span className="ml-auto font-mono text-2xs text-muted">{formatTimestamp(item.updatedAt ?? item.createdAt)}</span>
          )}
        </div>
      )}
    </li>
  )
}

function BrowseView() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [type, setType] = useState<MemoryType | 'all'>('all')
  const [entities, setEntities] = useState<MemoryEntity[]>([])
  const [items, setItems] = useState<BrowserMemoryItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<EntityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setUnavailable(false)
    setNote(null)
    void Promise.allSettled([
      fetchBrowserEntities({ q: debounced, limit: 100 }, controller.signal),
      fetchBrowserItems({ q: debounced, type: type === 'all' ? undefined : type, limit: 100 }, controller.signal),
    ]).then(([entityResult, itemResult]) => {
      if (controller.signal.aborted) return
      const nextItems = itemResult.status === 'fulfilled' ? normalizeBrowserItems(itemResult.value) : []
      setItems(nextItems)
      if (entityResult.status === 'fulfilled') {
        setEntities(normalizeEntities(entityResult.value))
      } else {
        setEntities(entitiesFromItems(nextItems))
        if (itemResult.status === 'fulfilled') setNote('实体接口未就绪：当前按记忆条目的实体引用降级浏览（只读）。')
      }
      if (entityResult.status === 'rejected' && itemResult.status === 'rejected') {
        setUnavailable(true)
        setError(errorText(entityResult.reason))
        setEntities([])
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [debounced, type])

  const selectEntity = useCallback(async (entity: MemoryEntity): Promise<void> => {
    setSelectedId(entity.id)
    setDetail(null)
    try {
      const payload = await fetchBrowserEntityDetail(entity.id)
      setDetail(normalizeEntityDetail(payload, entity))
    } catch (cause) {
      setDetail({ entity, relations: [], recent: [], memoryCounts: {} })
      if (!isUnavailable(cause)) setError(errorText(cause))
    }
  }, [])

  const openEntity = useCallback(
    (id: string, name: string): void => {
      const known = entities.find((entity) => entity.id === id)
      void selectEntity(
        known ?? {
          id,
          kind: 'domain',
          name,
          canonicalName: '',
          aliases: [],
          parentId: null,
          ownerAgent: null,
          status: 'active',
          version: null,
          createdAt: null,
          updatedAt: null,
        },
      )
    },
    [entities, selectEntity],
  )

  const visibleItems = useMemo(() => {
    if (!selectedId) return items
    const filtered = items.filter((item) => item.entityRefs.some((ref) => ref.id === selectedId))
    return filtered.length > 0 ? filtered : detail?.recent ?? filtered
  }, [items, selectedId, detail])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label htmlFor="memory-browser-search" className="sr-only">
          搜索记忆
        </label>
        <input
          id="memory-browser-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索记忆 / 实体…"
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            aria-pressed={type === filter.id}
            onClick={() => setType(filter.id)}
            className={`cursor-pointer rounded-xs border px-2 py-0.5 font-mono text-2xs ${
              type === filter.id ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {note && (
        <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
          {note}
        </p>
      )}

      {loading && entities.length === 0 && items.length === 0 ? (
        <LoadingPane label="加载记忆…" rows={4} />
      ) : unavailable ? (
        <div>
          <ErrorPane message={error ?? '记忆接口未就绪'} />
          <p className="m-0 mt-2 text-center text-2xs text-muted">
            期望只读端点：/api/memory/entities、/api/memory/items、/api/memory/entities/{'{id}'}。当前不展示示例数据。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[16rem_1fr]">
          <div className="min-w-0">
            <h3 className="m-0 mb-1 font-mono text-2xs tracking-normal text-muted">实体（{entities.length}）</h3>
            {entities.length === 0 ? (
              <EmptyPane compact title="暂无实体" description="记忆接口未返回实体；可按类型/关键词搜索记忆条目。" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 overflow-y-auto p-0">
                {entities.map((entity) => (
                  <li key={entity.id}>
                    <button
                      type="button"
                      onClick={() => void selectEntity(entity)}
                      aria-pressed={selectedId === entity.id}
                      className={`w-full cursor-pointer rounded-md border px-2 py-1 text-left ${
                        selectedId === entity.id ? 'border-accent-border bg-accent-soft' : 'border-border-subtle bg-surface-solid hover:border-accent-border'
                      }`}
                    >
                      <span className="block truncate text-sm text-ink">{entity.name}</span>
                      <span className="block font-mono text-2xs text-muted">
                        {entityKindLabel(entity.kind)}
                        {entity.ownerAgent ? ` · ${entity.ownerAgent}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0">
            {selectedId && detail ? (
              <div className="mb-2 rounded-md border border-border-subtle bg-surface-sunken p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="m-0 text-md font-semibold text-ink">{detail.entity.name}</h3>
                  <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">
                    {entityKindLabel(detail.entity.kind)}
                  </span>
                  <span className="font-mono text-2xs text-muted">{detail.entity.status}</span>
                  {detail.entity.ownerAgent && <span className="font-mono text-2xs text-muted">负责人 {detail.entity.ownerAgent}</span>}
                  {detail.entity.aliases.length > 0 && <span className="font-mono text-2xs text-muted">别名：{detail.entity.aliases.join('、')}</span>}
                  <button type="button" onClick={() => { setSelectedId(null); setDetail(null) }} className="ml-auto cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">
                    查看全部
                  </button>
                </div>
                <p className="m-0 mt-1 font-mono text-2xs text-muted">
                  记忆：{Object.entries(detail.memoryCounts).map(([key, value]) => `${memoryTypeLabel(key)} ${value}`).join(' · ') || '—'}
                </p>
                {detail.relations.length > 0 && (
                  <div className="mt-1.5">
                    <h4 className="m-0 mb-1 font-mono text-2xs tracking-normal text-muted">关系</h4>
                    <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
                      {detail.relations.map((relation: MemoryRelation) => (
                        <li key={relation.id}>
                          <button
                            type="button"
                            onClick={() => openEntity(relation.toEntity, relation.toName ?? relation.toEntity)}
                            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 font-mono text-2xs text-accent-hover"
                            title={`${relationLabel(relation.relType)} → ${relation.toName ?? relation.toEntity}（点击跳转）`}
                          >
                            {relationLabel(relation.relType)} → {relation.toName ?? relation.toEntity}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : null}

            <h3 className="m-0 mb-1 font-mono text-2xs tracking-normal text-muted">
              记忆条目（{visibleItems.length}）· 只读
            </h3>
            {visibleItems.length === 0 ? (
              <EmptyPane compact title="没有匹配的记忆" description="可换关键词或类型过滤；后端未就绪时不会展示示例数据。" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="记忆条目列表">
                {visibleItems.map((item) => (
                  <MemoryItemCard key={item.id} item={item} onEntity={openEntity} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ConflictsView() {
  const [conflicts, setConflicts] = useState<BrowserConflict[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void fetchBrowserConflicts(controller.signal)
      .then((payload) => {
        setConflicts(normalizeBrowserConflicts(payload))
        setNote(null)
      })
      .catch((cause) => {
        setConflicts([])
        setNote(errorText(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
      <p className="m-0 mb-2 text-2xs text-muted">冲突一律保留为 disputed，不自动裁决；本页只读，标注「需裁决」。</p>
      {note && (
        <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
          {note}
        </p>
      )}
      {loading ? (
        <LoadingPane label="加载冲突…" />
      ) : conflicts.length === 0 ? (
        <EmptyPane title="暂无冲突" description="没有待裁决的 disputed 记忆；后端未就绪时也会显示为空态。" />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="冲突列表">
          {conflicts.map((conflict) => (
            <li key={conflict.id} className="rounded-lg border border-warn-border bg-warn-soft/30 p-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-pill border border-danger-border bg-danger-soft px-1.5 font-mono text-2xs text-danger-ink">需裁决</span>
                <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink">{conflict.status}</span>
                <span className="font-mono text-2xs text-muted">{conflict.askPolicy}</span>
                <span className="min-w-0 truncate font-mono text-2xs text-muted">{conflict.id}</span>
              </div>
              {conflict.reason && <p className="m-0 mt-1 text-2xs text-warn-ink">原因：{conflict.reason}</p>}
              <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {conflict.items.map((item, index) => (
                  <div key={`${conflict.id}:${item.id}`} className="rounded-md border border-border-subtle bg-surface-solid p-1.5">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-mono text-2xs text-muted">一方 {index + 1}</span>
                      <span className="font-mono text-2xs text-muted">{sourceLabel(item.source)} · {authorityLabel(item.authority)}</span>
                      <span className="font-mono text-2xs text-muted">{formatTimestamp(item.updatedAt ?? item.createdAt) || '—'}</span>
                      <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-muted">{statusLabel(item.status)}</span>
                    </div>
                    <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{item.text}</p>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AgentsView() {
  const [agents, setAgents] = useState<AgentMemoryAgent[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [items, setItems] = useState<BrowserMemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchBrowserAgents(controller.signal)
      .then((payload) => {
        const list = normalizeAgentList(payload)
        setAgents(list)
        setSelected((current) => current ?? list[0]?.id ?? null)
        setNote(list.length === 0 ? '后端暂无智能体记忆；不展示示例数据。' : null)
      })
      .catch((cause) => {
        setAgents([])
        setNote(errorText(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!selected) {
      setItems([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    void fetchBrowserAgentMemory(selected, { limit: 100 }, controller.signal)
      .then((payload) => setItems(normalizeBrowserItems(payload)))
      .catch(() => setItems([]))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [selected])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
      <p className="m-0 mb-2 text-2xs text-muted">智能体通用记忆：只读（跨智能体只读）；每条标注来源会话，不复制人格。</p>
      {note && (
        <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
          {note}
        </p>
      )}
      {loading && agents.length === 0 ? (
        <LoadingPane label="加载智能体记忆…" />
      ) : agents.length === 0 ? (
        <EmptyPane title="暂无智能体记忆" description="后端 /api/memory/agents 未就绪或尚未提炼；不展示示例数据。" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                aria-pressed={selected === agent.id}
                onClick={() => setSelected(agent.id)}
                className={`cursor-pointer rounded-pill border px-2 py-0.5 text-2xs ${
                  selected === agent.id ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted'
                }`}
                title={agent.personaVersion ? `人格版本 ${agent.personaVersion}` : undefined}
              >
                {agent.name} · {agent.memoryCount}
              </button>
            ))}
          </div>
          {loading ? (
            <LoadingPane label="加载智能体记忆…" />
          ) : items.length === 0 ? (
            <EmptyPane title="该智能体暂无通用记忆" description="记忆提炼后会出现；来源会话见条目引用，只读。" />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="智能体通用记忆">
              {items.map((item) => (
                <MemoryItemCard key={item.id} item={item} onEntity={() => {}} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function PyramidView() {
  const [entities, setEntities] = useState<MemoryEntity[]>([])
  const [entityId, setEntityId] = useState('')
  const [view, setView] = useState<string>(PYRAMID_VIEWS[0].id)
  const [nodes, setNodes] = useState<PyramidNode[]>([])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchBrowserEntities({ limit: 100 }, controller.signal)
      .then((payload) => setEntities(normalizeEntities(payload)))
      .catch(() => setEntities([]))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void fetchBrowserPyramid({ entityId: entityId || undefined, level: undefined, view }, controller.signal)
      .then((payload) => {
        setNodes(normalizePyramid(payload))
        setNote(null)
      })
      .catch((cause) => {
        setNodes([])
        setNote(errorText(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [entityId, view])

  const toggle = (level: number): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(level)) next.delete(level)
      else next.add(level)
      return next
    })
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label htmlFor="memory-pyramid-entity" className="sr-only">实体</label>
        <select
          id="memory-pyramid-entity"
          value={entityId}
          onChange={(event) => setEntityId(event.target.value)}
          className="rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-ink"
        >
          <option value="">全部实体</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>{entity.name}</option>
          ))}
        </select>
        <label htmlFor="memory-pyramid-view" className="sr-only">视角</label>
        <select
          id="memory-pyramid-view"
          value={view}
          onChange={(event) => setView(event.target.value)}
          className="rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-ink"
        >
          {PYRAMID_VIEWS.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
        <span className="font-mono text-2xs text-muted">L0–L4 可折叠；只读投影，不直接编辑</span>
      </div>
      {note && (
        <p role="status" className="m-0 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
          {note}
        </p>
      )}
      {loading ? (
        <LoadingPane label="加载金字塔…" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {LAYER_META.map((layer) => {
            const levelNodes = nodes.filter((node) => node.level === layer.level)
            const isCollapsed = collapsed.has(layer.level)
            return (
              <section key={layer.level} className="rounded-md border border-border-subtle bg-surface-solid">
                <button
                  type="button"
                  onClick={() => toggle(layer.level)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left"
                >
                  <span className="font-mono text-2xs text-muted">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">{layer.label}</span>
                  <span className="min-w-0 truncate text-2xs text-ink-secondary">{layer.hint}</span>
                  <span className="ml-auto font-mono text-2xs text-muted">{levelNodes.length} 节点</span>
                </button>
                {!isCollapsed && (
                  <div className="border-t border-border-subtle px-2 py-1.5">
                    {levelNodes.length === 0 ? (
                      <p className="m-0 text-2xs text-muted">该层暂无节点（金字塔未构建或源不足 coverage 阈值）。</p>
                    ) : (
                      <ul className="m-0 flex list-none flex-col gap-1 p-0">
                        {levelNodes.map((node) => (
                          <li key={node.id} className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-1">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="font-mono text-2xs text-muted">{node.kind}</span>
                              <span className="rounded-pill border border-border-subtle bg-surface-solid px-1 font-mono text-2xs text-muted">{node.status}</span>
                              {node.coverage !== null && <span className="font-mono text-2xs text-muted">覆盖 {Math.round(node.coverage * 100)}%</span>}
                              {node.sourceCount !== null && <span className="font-mono text-2xs text-muted">{node.sourceCount} 源</span>}
                              {formatTimestamp(node.builtAt) && <span className="ml-auto font-mono text-2xs text-muted">{formatTimestamp(node.builtAt)}</span>}
                            </div>
                            <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{node.text}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function MemoryBrowserPage({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const [tab, setTab] = useState<BrowserTab>('browse')
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, !embedded, onClose)

  return (
    <div
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-2 backdrop-blur-sm sm:p-4'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="记忆浏览器"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-surface' : 'flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-border bg-surface-solid shadow-lg'}>
        <header className="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold tracking-tight">记忆</h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">
              实体 / 类型 / 冲突 / 智能体 / 金字塔 · 只读；修改请通过对话。
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="rounded-pill border border-border-subtle bg-surface-solid px-2 py-0.5 font-mono text-2xs tracking-normal text-muted">v0.3</span>
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-muted hover:text-ink">
              关闭 ×
            </button>
          </div>
        </header>

        <div role="tablist" aria-label="记忆视图" className="flex flex-none items-center gap-1 overflow-x-auto border-b border-border-subtle px-2 pt-1.5 pb-0 sm:px-4">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={`-mb-px cursor-pointer border-b-2 px-2.5 pb-1.5 font-mono text-2xs tracking-normal ${
                tab === entry.id ? 'border-accent text-accent-hover' : 'border-transparent text-muted hover:text-ink-secondary'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {tab === 'browse' && <BrowseView />}
        {tab === 'conflicts' && <ConflictsView />}
        {tab === 'agents' && <AgentsView />}
        {tab === 'pyramid' && <PyramidView />}

        <footer className="flex-none border-t border-border-subtle px-3 py-1.5 font-mono text-2xs text-muted sm:px-4">
          只读记忆视图：冲突不自动裁决；智能体跨域只读；不出现内部字段/原文压缩内容。
        </footer>
      </div>
    </div>
  )
}
