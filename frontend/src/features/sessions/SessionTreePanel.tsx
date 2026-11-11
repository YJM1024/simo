// features/sessions/SessionTreePanel.tsx —— 左栏会话树（M4）
//
// 能力：展开/折叠、层级缩进、状态点、一行摘要、点选切换（广播 session:active）、
//       会话改名（PATCH，纯显示）、新建子会话、对话触发后刷新（sessions:refresh）。
// 解耦：chat 需要切会话/刷树时只发总线事件（session:select / sessions:refresh），
//       本 feature 不 import chat。

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  HttpError,
  archiveSession,
  createSession,
  getSessionTree,
  getSessions,
  renameSession,
  unarchiveSession,
} from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId, writeSessionId } from '../../platform/router.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import {
  loadPinnedSessions,
  loadReadCounts,
  markSessionRead,
  togglePinnedSession,
} from '../../platform/preferences.ts'
import type { SessionNode } from './model.ts'
import {
  archivedBadge,
  countNodes,
  extractCreatedSessionId,
  findNode,
  findPath,
  flattenSessionMeta,
  nodeDepth,
  normalizeSessionTree,
  statusLabel,
  statusTone,
} from './model.ts'

const DRAFT_ID = 'draft:new'
const DRAFT_TITLE = '新会话'

function pruneEmptySessions(nodes: readonly SessionNode[], keepId: string | null): SessionNode[] {
  const out: SessionNode[] = []
  for (const node of nodes) {
    const children = pruneEmptySessions(node.children, keepId)
    if (node.messageCount !== 0 || children.length > 0 || node.id === keepId) out.push({ ...node, children })
  }
  return out
}

const FALLBACK_NODE: SessionNode = Object.freeze({
  id: 'main',
  title: '主会话',
  parentId: null,
  archived: false,
  status: 'active',
  summary: '',
  createdAt: 0,
  messageCount: null,
  agentId: null,
  children: [],
})

function errorText(error: unknown, fallback: string): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请确认司墨服务正在运行'
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function isLegacyFallback(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 404 || error.status === 405)
}

function countTree(nodes: readonly SessionNode[]): { active: number; archived: number } {
  let active = 0
  let archived = 0
  const walk = (list: readonly SessionNode[]): void => {
    for (const node of list) {
      if (node.archived) archived += 1
      else active += 1
      walk(node.children)
    }
  }
  walk(nodes)
  return { active, archived }
}

function TreeSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-8 animate-skeleton-shimmer rounded-md bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%] ${
            index === 1 ? 'ml-3 w-[88%]' : 'w-full'
          }`}
        />
      ))}
    </div>
  )
}

export default function SessionTreePanel() {
  const [roots, setRoots] = useState<SessionNode[]>([])
  const counts = countTree(roots)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [pinned, setPinned] = useState<string[]>(() => loadPinnedSessions())
  const [readCounts, setReadCounts] = useState<Record<string, number>>(() => loadReadCounts())

  const rootsRef = useRef<SessionNode[]>([])
  rootsRef.current = roots
  const activeIdRef = useRef<string | null>(activeId)
  activeIdRef.current = activeId
  const draftingRef = useRef(false)
  draftingRef.current = drafting
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const publish = useCallback((nextRoots: readonly SessionNode[], id: string) => {
    const node = findNode(nextRoots, id)
    if (!node) return
    setActiveId(id)
    writeSessionId(id)
    const nextReads = markSessionRead(id, node.messageCount ?? 0)
    setReadCounts(nextReads)
    bus.emit(EVENTS.SESSION_ACTIVE, {
      sessionId: id,
      title: node.title,
      depth: nodeDepth(nextRoots, id),
      archived: node.archived,
      sessionMeta: flattenSessionMeta(nextRoots),
    })
  }, [])

  const publishDraft = useCallback(() => {
    draftingRef.current = true
    setDrafting(true)
    setActiveId(DRAFT_ID)
    bus.emit(EVENTS.SESSION_ACTIVE, {
      sessionId: DRAFT_ID,
      title: DRAFT_TITLE,
      depth: 0,
      archived: false,
      sessionMeta: flattenSessionMeta(rootsRef.current),
    })
  }, [])

  const startDraft = useCallback(() => {
    setActionError(null)
    publishDraft()
  }, [publishDraft])

  const load = useCallback(
    async (options: { silent?: boolean } = {}): Promise<SessionNode[]> => {
      if (!options.silent) {
        setLoading(true)
        setError(null)
      }
      try {
        let payload: unknown
        try {
          payload = await getSessionTree()
        } catch (err) {
          // 旧后端只有 /api/sessions（扁平）；新后端用 /tree。404/405 时降级。
          if (!isLegacyFallback(err)) throw err
          payload = await getSessions()
        }
        const normalized = normalizeSessionTree(payload)
        const resolved = normalized.length > 0 ? normalized : [FALLBACK_NODE]
        setRoots(resolved)
        if (draftingRef.current) return resolved
        const preferred = activeIdRef.current ?? readSessionId()
        const target = preferred && findNode(resolved, preferred) ? preferred : resolved[0]!.id
        publish(resolved, target)
        return resolved
      } catch (err) {
        if (!options.silent) {
          setRoots([FALLBACK_NODE])
          setActiveId(FALLBACK_NODE.id)
          setError(errorText(err, '会话加载失败'))
          publish([FALLBACK_NODE], FALLBACK_NODE.id)
        }
        return []
      } finally {
        if (!options.silent) setLoading(false)
      }
    },
    [publish],
  )

  useEffect(() => {
    void load()
  }, [load])

  const selectNode = useCallback(
    (id: string) => {
      const path = findPath(rootsRef.current, id)
      if (path.length === 0) return
      draftingRef.current = false
      setDrafting(false)
      setCollapsed((prev) => {
        const next = new Set(prev)
        for (const node of path.slice(0, -1)) next.delete(node.id)
        return next
      })
      publish(rootsRef.current, id)
    },
    [publish],
  )

  // 标签跳转 / 其他 feature 请求切换会话
  useEffect(
    () =>
      bus.on(EVENTS.SESSION_SELECT, (payload) => {
        if (findNode(rootsRef.current, payload.sessionId)) {
          selectNode(payload.sessionId)
          return
        }
        // 树可能过期（对话刚建了子会话）：先刷新再切
        void load({ silent: true }).then((next) => {
          if (findNode(next, payload.sessionId)) selectNode(payload.sessionId)
        })
      }),
    [load, selectNode],
  )

  // 对话触发的树刷新（自动建子会话后 chat 广播）
  useEffect(() => {
    const off = bus.on(EVENTS.SESSIONS_REFRESH, () => {
      if (refreshTimerRef.current !== null) return
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        void load({ silent: true })
      }, 600)
    })
    return () => {
      off()
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [load])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const startRename = useCallback((node: SessionNode) => {
    if (node.archived) {
      setActionError('已归档会话只读：请先恢复后再改名')
      return
    }
    setEditingId(node.id)
    setDraftTitle(node.title)
    setActionError(null)
  }, [])

  const cancelRename = useCallback(() => {
    setEditingId(null)
    setDraftTitle('')
  }, [])

  const commitRename = useCallback(async () => {
    const id = editingId
    if (!id) return
    const title = draftTitle.trim()
    const node = findNode(rootsRef.current, id)
    setEditingId(null)
    setDraftTitle('')
    if (!title || !node || title === node.title) return

    setBusy(true)
    setActionError(null)
    try {
      await renameSession(id, title)
      // 本地先更新（立即反馈），再静默拉树对齐后端
      const next = rootsRef.current.map(function rename(node): SessionNode {
        return node.id === id ? { ...node, title } : { ...node, children: node.children.map(rename) }
      })
      setRoots(next)
      publish(next, activeIdRef.current ?? id)
      await load({ silent: true })
    } catch (err) {
      setActionError(`改名失败：${errorText(err, '未知错误')}`)
    } finally {
      setBusy(false)
    }
  }, [draftTitle, editingId, load, publish])

  useEffect(
    () =>
      bus.on(EVENTS.SESSION_DRAFT_ACCEPT, ({ draftId, sessionId }: { draftId: string; sessionId: string }) => {
        if (draftId !== DRAFT_ID) return
        draftingRef.current = false
        setDrafting(false)
        setActiveId(sessionId)
        void load({ silent: true })
      }),
    [load],
  )

  const createChild = useCallback(async () => {
    const parentId = activeIdRef.current ?? rootsRef.current[0]?.id
    if (!parentId) return
    if (findNode(rootsRef.current, parentId)?.archived) {
      setActionError('已归档会话只读：请先恢复后再新建子会话')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      const response = await createSession(parentId, '新会话')
      const createdId = extractCreatedSessionId(response)
      const next = await load({ silent: true })
      const fallbackId = findNode(next, parentId)?.children.at(-1)?.id
      const target = createdId && findNode(next, createdId) ? createdId : fallbackId
      if (target) selectNode(target)
    } catch (err) {
      setActionError(`新建子会话失败：${errorText(err, '未知错误')}`)
    } finally {
      setBusy(false)
    }
  }, [load, selectNode])

  // M6：归档 / 恢复（归档后只读；恢复后还原可写）
  const setArchived = useCallback(
    async (node: SessionNode, archived: boolean) => {
      setBusy(true)
      setActionError(null)
      try {
        if (archived) await archiveSession(node.id)
        else await unarchiveSession(node.id)
        await load({ silent: true })
      } catch (err) {
        setActionError(`${archived ? '归档' : '恢复'}失败：${errorText(err, '未知错误')}`)
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const activeNode = findNode(roots, activeId)
  const activeArchived = activeNode?.archived === true

  const searchMatches = useCallback(
    (node: SessionNode): boolean => {
      if (!query.trim()) return true
      const needle = query.trim().toLowerCase()
      return `${node.title} ${node.summary} ${node.id}`.toLowerCase().includes(needle)
    },
    [query],
  )

  const filterTree = useCallback(
    (nodes: readonly SessionNode[]): SessionNode[] => {
      const filtered: SessionNode[] = []
      for (const node of nodes) {
        const children = filterTree(node.children)
        if (searchMatches(node) || children.length > 0) filtered.push({ ...node, children })
      }
      return filtered
    },
    [searchMatches],
  )

  const visibleRoots = query.trim() ? filterTree(roots) : pruneEmptySessions(roots, activeId)
  const sortPinned = (nodes: readonly SessionNode[]): SessionNode[] =>
    [...nodes].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)))

  const renderNodes = (nodes: readonly SessionNode[], depth: number): React.ReactNode =>
    sortPinned(nodes).map((node) => {
      const isActive = node.id === activeId
      const isCollapsed = query.trim() ? false : collapsed.has(node.id)
      const hasChildren = node.children.length > 0
      const editing = editingId === node.id
      const indent = 6 + Math.min(depth, 8) * 12
      const unread = Math.max(0, (node.messageCount ?? 0) - (readCounts[node.id] ?? 0))
      const isPinned = pinned.includes(node.id)

      return (
        <li key={node.id} role="treeitem" aria-selected={isActive} aria-expanded={hasChildren ? !isCollapsed : undefined}>
          <div
            className={`group flex items-start gap-1 rounded-sm border-0 border-l-2 py-1.5 pr-1.5 transition-colors duration-fast ${
              isActive
                ? 'border-l-accent bg-accent-soft'
                : 'border-l-transparent hover:bg-surface-sunken'
            }`}
            style={{ paddingLeft: `${indent}px` }}
          >
            <button
              type="button"
              aria-label={hasChildren ? (isCollapsed ? `展开 ${node.title}` : `折叠 ${node.title}`) : '没有子会话'}
              onClick={() => toggleCollapse(node.id)}
              disabled={!hasChildren}
              className="mt-0.5 grid h-5 w-4 flex-none cursor-pointer place-items-center text-muted disabled:cursor-default disabled:opacity-50"
            >
              {hasChildren ? <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={16} /> : <span aria-hidden="true">·</span>}
            </button>

            <button type="button" onClick={() => selectNode(node.id)} className="min-w-0 flex-1 cursor-pointer text-left">
              <span className="flex items-center gap-1.5">
                <span className={`h-1 w-1 flex-none rounded-full ${statusTone(node.status)}`} title={statusLabel(node.status)} aria-label={statusLabel(node.status)} />
                <span className={`min-w-0 flex-1 truncate text-[12px] font-medium ${isActive ? 'text-ink' : 'text-ink-secondary'}`}>{node.title}</span>
                {unread > 0 && (
                  <span className="flex-none text-xs tabular-nums text-accent" title={`${unread} 条未读消息`}>
                    {unread}
                  </span>
                )}
                {node.archived && (
                  <span className="flex-none text-xs text-muted" title={archivedBadge()}>
                    只读
                  </span>
                )}
                {hasChildren && (
                  <span className="flex-none text-xs tabular-nums text-muted">
                    {node.children.length}
                  </span>
                )}
              </span>
            </button>

            {!editing && (
              <span className="flex flex-none items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPinned(togglePinnedSession(node.id))}
                  title={isPinned ? '取消置顶' : '置顶会话'}
                  aria-label={isPinned ? `取消置顶 ${node.title}` : `置顶 ${node.title}`}
                  className={`mt-0.5 cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-2xs ${
                    isPinned ? 'text-accent-hover' : 'text-muted opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100'
                  }`}
                >
                  {isPinned ? <Icon name="star" size={16} /> : <Icon name="star" size={16} className="opacity-60" />}
                </button>
                {isActive && !node.archived && (
                  <button
                    type="button"
                    onClick={() => startRename(node)}
                    title="重命名（纯显示，不影响语义）"
                    className="mt-0.5 cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-xs text-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus:opacity-100"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void setArchived(node, !node.archived)}
                  title={node.archived ? '恢复会话（取消归档）' : '归档会话（归档后只读，可恢复）'}
                  className="mt-0.5 cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-2xs text-muted opacity-0 transition-opacity duration-fast group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                >
                  {node.archived ? '↺' : '⊘'}
                </button>
              </span>
            )}
          </div>

          {editing && (
            <div className="mt-1 flex items-center gap-1" style={{ paddingLeft: `${indent + 20}px` }}>
              <input
                autoFocus
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void commitRename()
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelRename()
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-accent bg-surface-solid px-1.5 py-0.5 text-sm text-ink outline-none"
                aria-label="会话标题"
              />
              <button
                type="button"
                onClick={() => void commitRename()}
                disabled={busy}
                className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50"
              >
                保存
              </button>
              <button
                type="button"
                onClick={cancelRename}
                className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted"
              >
                取消
              </button>
            </div>
          )}

          {hasChildren && !isCollapsed && <ul className="m-0 list-none p-0">{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      )
    })

  const total = countNodes(roots)

  return (
    <aside className="flex min-h-0 flex-1 flex-col border-r border-border bg-surface">
      <div className="flex flex-none items-center gap-2.5 px-1 pb-3.5 pt-3.5">
        <span className="relative grid h-[26px] w-[26px] flex-none place-items-center overflow-hidden rounded-[7px] bg-ink" aria-hidden="true">
          <span className="h-[2px] w-4 -rotate-[24deg] rounded-pill bg-linear-to-r from-accent to-accent-3" />
        </span>
        <span className="font-semibold tracking-[-0.02em] text-[15px]">司墨</span>
        <span className="ml-auto font-mono text-[10px] text-ink-faint">v4.1</span>
      </div>

      <div className="mb-2.5 flex flex-none items-center gap-1.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm border border-border bg-surface px-2 py-1.5 text-left transition-colors duration-fast hover:border-border-subtle"
          title="工作区"
        >
          <span className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] bg-ink text-[10px] font-semibold text-ink-inverse">S</span>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
            <span className="truncate text-[11.5px] font-semibold text-ink">主工作区</span>
            <span className="truncate text-[10px] text-ink-faint">本地环境</span>
          </span>
          <Icon name="chevron-down" size={16} className="text-ink-faint" />
        </button>
        <button
          type="button"
          onClick={startDraft}
          onDoubleClick={() => void createChild()}
          disabled={busy || activeArchived}
          title="新建会话（只保留一个草稿；双击在当前会话下新建子会话）"
          aria-label="新建会话"
          className="grid h-[34px] w-[34px] flex-none cursor-pointer place-items-center rounded-sm border border-border bg-surface text-ink-muted transition-colors duration-fast hover:border-border-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-[18px] leading-none">＋</span>
        </button>
      </div>

      <div className="mb-2 flex flex-none items-center gap-1.5 rounded-sm border border-border bg-surface px-2 text-ink-faint focus-within:border-accent focus-within:shadow-focus">
        <Icon name="search" size={16} className="flex-none" />
        <label htmlFor="session-search" className="sr-only">
          搜索会话
        </label>
        <input
          id="session-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索会话、消息…"
          aria-label="搜索会话"
          className=""
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空会话搜索"
            className="cursor-pointer px-0.5 text-2xs text-ink-faint hover:text-ink"
          >
            ×
          </button>
        ) : (
          <kbd className="flex-none rounded-[4px] border border-border px-1 font-mono text-[9px] text-ink-faint">⌘K</kbd>
        )}
      </div>

      {actionError && (
        <div role="alert" className="mx-2 mt-2 rounded-md border border-danger-border bg-danger-soft px-2 py-1.5 text-2xs text-danger-ink">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pt-2 pb-3">
        <div className="flex items-center justify-between px-1 pb-1 pt-2 text-[9.5px] uppercase tracking-[0.07em] text-ink-faint">
          <span>会话</span>
          <span className="flex items-center gap-1">
            {total}
            <button type="button" onClick={() => void load({ silent: true })} aria-label="刷新会话树" title="刷新会话树" className="grid h-4 w-4 cursor-pointer place-items-center rounded-xs hover:bg-surface-sunken hover:text-ink">
              <Icon name="refresh" size={16} />
            </button>
          </span>
        </div>

        {loading && <TreeSkeleton />}

        {!loading && error && (
          <div role="alert" className="rounded-md border border-danger-border bg-danger-soft p-2.5 text-sm text-danger-ink">
            <p className="m-0 mb-2">{error}</p>
            <button type="button" className="cursor-pointer text-sm text-accent-hover underline underline-offset-2" onClick={() => void load()}>
              重试
            </button>
          </div>
        )}

        {drafting && !query.trim() && (
          <button
            type="button"
            onClick={publishDraft}
            className={`mb-1 flex w-full min-w-0 items-center gap-2 rounded-sm border-0 border-l-2 py-1.5 pr-1.5 text-left transition-colors duration-fast ${activeId === DRAFT_ID ? 'border-l-accent bg-accent-soft' : 'border-l-transparent hover:bg-surface-sunken'}`}
          >
            <span className={`h-1 w-1 flex-none rounded-full ${activeId === DRAFT_ID ? 'bg-accent' : 'bg-ink-faint'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">新会话</span>
            <span className="flex-none rounded-[3px] border border-border-subtle bg-surface-sunken px-1 text-[9px] text-ink-faint">草稿</span>
          </button>
        )}

        {!loading && visibleRoots.length === 0 && !query.trim() && !drafting && <p className="m-1 text-sm text-muted">暂无会话。</p>}

        {!loading && query.trim() && roots.length > 0 && visibleRoots.length === 0 && (
          <p className="m-1 text-sm text-muted">没有匹配「{query.trim()}」的会话。</p>
        )}

        {!loading && visibleRoots.length > 0 && (
          <ul role="tree" aria-label="会话树" className="m-0 list-none p-0">
            {renderNodes(visibleRoots, 0)}
          </ul>
        )}

      </div>

      <div className="flex-none border-t border-border-subtle pt-2">
        <div className="rounded-sm border border-border bg-surface-sunken px-2.5 py-2">
          <div className="flex items-center justify-between text-[10.5px] text-ink-muted">
            <span>本月用量</span>
            <b className="font-semibold text-ink-secondary">—%</b>
          </div>
          <div className="my-1.5 h-1 overflow-hidden rounded-pill bg-surface-solid">
            <i className="block h-full rounded-pill bg-linear-to-r from-accent to-accent-3" style={{ width: '0%' }} />
          </div>
          <div className="truncate text-[9.5px] text-ink-faint">
            token 用量暂不可用 · {counts.active} 个会话
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-2 border-t border-border-subtle px-1 pt-2">
          <span className="grid h-[26px] w-[26px] flex-none place-items-center rounded-full bg-ink text-[10px] font-semibold text-ink-inverse">Y</span>
          <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <b className="text-[11px] font-semibold text-ink">本地用户</b>
            <span className="text-[9.5px] text-ink-faint">主工作区 · Owner</span>
          </span>
          <Icon name="chevron-down" size={16} className="text-ink-faint" />
        </div>
      </div>
    </aside>
  )
}
