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
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { Icon } from '../../platform/ui/icons.tsx'
import { fallbackOwnerForSession, findAgent, useAgentCatalog } from '../../platform/agents.ts'
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
  summaryLine,
} from './model.ts'

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
  const agentCatalog = useAgentCatalog()
  const [roots, setRoots] = useState<SessionNode[]>([])
  const counts = countTree(roots)
  const [activeId, setActiveId] = useState<string | null>(null)
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
  const [runningTasks, setRunningTasks] = useState(0)

  const rootsRef = useRef<SessionNode[]>([])
  rootsRef.current = roots
  const activeIdRef = useRef<string | null>(activeId)
  activeIdRef.current = activeId
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

  useEffect(() => bus.on(EVENTS.TASKS_STATE, (payload) => setRunningTasks(payload.running)), [])

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

  const visibleRoots = query.trim() ? filterTree(roots) : roots
  const sortPinned = (nodes: readonly SessionNode[]): SessionNode[] =>
    [...nodes].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)))

  const renderNodes = (nodes: readonly SessionNode[], depth: number): React.ReactNode =>
    sortPinned(nodes).map((node) => {
      const isActive = node.id === activeId
      const isCollapsed = query.trim() ? false : collapsed.has(node.id)
      const hasChildren = node.children.length > 0
      const editing = editingId === node.id
      const indent = 6 + Math.min(depth, 8) * 12
      const owner = findAgent(agentCatalog.agents, node.agentId ?? fallbackOwnerForSession(node.id))
      const unread = Math.max(0, (node.messageCount ?? 0) - (readCounts[node.id] ?? 0))
      const isPinned = pinned.includes(node.id)

      return (
        <li key={node.id} role="treeitem" aria-selected={isActive} aria-expanded={hasChildren ? !isCollapsed : undefined}>
          <div
            className={`group flex items-start gap-1 rounded-md border py-1.5 pr-1.5 transition-colors duration-fast ${
              isActive
                ? 'border-border-subtle bg-avatar-bg'
                : 'border-transparent hover:bg-surface-sunken'
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
                <span
                  className={`h-1.5 w-1.5 flex-none rounded-xs ${statusTone(node.status)}`}
                  title={statusLabel(node.status)}
                  aria-label={statusLabel(node.status)}
                />
                <AgentAvatar agent={owner} size="xs" className="ml-0.5" />
                <span className={`truncate text-md ${isActive ? 'text-ink' : 'text-ink-secondary'}`}>{node.title}</span>
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
              <span className="mt-0.5 block truncate text-2xs text-muted">{summaryLine(node)}</span>
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
    <aside className="flex min-h-0 flex-1 flex-col border-r border-border-subtle bg-surface backdrop-blur-glass">
      <div className="flex flex-none items-center justify-between gap-2 border-b border-border-subtle px-3.5 pt-2.5 pb-2">
        <div className="flex items-center gap-2">
          <h2 className="m-0 text-md font-semibold">会话</h2>
          <span className="font-mono text-2xs tracking-normal text-muted">{total > 0 ? `${total} 个` : '—'}</span>
        </div>
        <button
          type="button"
          onClick={() => void createChild()}
          disabled={busy || !activeId || activeArchived}
          title={activeArchived ? '已归档会话只读：恢复后才能新建子会话' : '在当前会话下新建子会话'}
          className="cursor-pointer rounded-sm border border-accent-border bg-accent-soft px-2 py-1 text-xs text-accent-hover transition-colors duration-fast hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          + 子会话
        </button>
      </div>

      <div className="flex flex-none items-center gap-1.5 border-b border-border-subtle px-2 py-1.5">
        <label htmlFor="session-search" className="sr-only">
          搜索会话
        </label>
        <input
          id="session-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索会话 / 摘要…"
          aria-label="搜索会话"
          className="min-w-0 flex-1 rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-2xs text-ink outline-none placeholder:text-muted focus:border-accent-border"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="清空会话搜索"
            className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1 text-2xs text-muted"
          >
            ×
          </button>
        )}
      </div>

      {actionError && (
        <div role="alert" className="mx-2 mt-2 rounded-md border border-danger-border bg-danger-soft px-2 py-1.5 text-2xs text-danger-ink">
          {actionError}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-3.5">
        {loading && <TreeSkeleton />}

        {!loading && error && (
          <div role="alert" className="rounded-md border border-danger-border bg-danger-soft p-2.5 text-sm text-danger-ink">
            <p className="m-0 mb-2">{error}</p>
            <button type="button" className="cursor-pointer text-sm text-accent-hover underline underline-offset-2" onClick={() => void load()}>
              重试
            </button>
          </div>
        )}

        {!loading && roots.length === 0 && <p className="m-1 text-sm text-muted">暂无会话。</p>}

        {!loading && roots.length > 0 && visibleRoots.length === 0 && (
          <p className="m-1 text-sm text-muted">没有匹配「{query.trim()}」的会话。</p>
        )}

        {!loading && visibleRoots.length > 0 && (
          <ul role="tree" aria-label="会话树" className="m-0 list-none p-0">
            {renderNodes(visibleRoots, 0)}
          </ul>
        )}

        {!loading && (
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            className="mt-2 w-full cursor-pointer rounded-md border border-dashed border-border px-2 py-1.5 text-left text-2xs text-muted hover:border-accent-border hover:text-accent-hover"
            title="重新拉取会话树"
          >
            刷新会话树
          </button>
        )}
      </div>

      <div className="flex flex-none items-center justify-between gap-2 overflow-hidden whitespace-nowrap border-t border-border-subtle px-3.5 py-2 text-xs text-ink-muted">
        <span className="flex-none whitespace-nowrap">
          {runningTasks > 0 ? `进行中 ${counts.active} · ${runningTasks} 个任务` : `进行中 ${counts.active} · 已归档 ${counts.archived}`}
        </span>
        <span className="flex-none whitespace-nowrap text-ink-muted max-[1180px]:hidden" title="归档后只读，可随时恢复">归档 / 恢复</span>
      </div>
    </aside>
  )
}
