// features/sessions/model.ts —— 会话树归一化与遍历（纯函数，可单测）
//
// M4 契约（task-34）：
//   GET /api/sessions/tree → 嵌套树（节点：id/title/parentId?/archived/.../children）
//   兼容旧 GET /api/sessions（扁平列表 + parentId）
// 这里统一成 SessionNode 树，供左栏渲染、chat 的会话标签、includeChildren 默认值使用。

import type { SessionMetaEntry } from '../../platform/types.ts'
import { isRecord, readNumber, readString } from '../../platform/types.ts'

export interface SessionNode {
  id: string
  title: string
  parentId: string | null
  archived: boolean
  status: string
  summary: string
  createdAt: number
  messageCount: number | null
  /** M17：负责人智能体 id（后端未提供时前端确定性兜底） */
  agentId: string | null
  children: SessionNode[]
}

const MAX_DEPTH = 32

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function toNode(value: unknown, fallbackParentId: string | null): SessionNode | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id')
  if (!id) return null

  const archived = toBool(value['archived'])
  const messageCount =
    readNumber(value, 'messageCount') ?? readNumber(value, 'count') ?? readNumber(value, 'messages') ?? null
  const rawSummary =
    readString(value, 'summary') ?? readString(value, 'lastMessage') ?? readString(value, 'preview') ?? ''

  return {
    id,
    title: readString(value, 'title') ?? '未命名会话',
    parentId: readString(value, 'parentId') ?? readString(value, 'parent_id') ?? fallbackParentId,
    archived,
    status: readString(value, 'status') ?? (archived ? 'archived' : 'active'),
    summary: rawSummary,
    createdAt:
      readNumber(value, 'createdAt') ?? readNumber(value, 'created_at') ?? readNumber(value, 'updatedAt') ?? 0,
    messageCount,
    agentId:
      readString(value, 'agentId') ??
      readString(value, 'agent_id') ??
      readString(value, 'ownerAgentId') ??
      readString(value, 'owner_agent_id') ??
      null,
    children: [],
  }
}

function childrenOf(value: Record<string, unknown>): unknown[] {
  for (const key of ['children', 'sessions', 'subSessions']) {
    const candidates = value[key]
    if (Array.isArray(candidates)) return candidates
  }
  return []
}

function collectEntries(value: unknown, fallbackParentId: string | null, out: Map<string, SessionNode>, depth: number): void {
  if (depth > MAX_DEPTH || !Array.isArray(value)) return
  for (const entry of value) {
    const node = toNode(entry, fallbackParentId)
    if (!node) continue
    if (!out.has(node.id)) out.set(node.id, node)
    if (isRecord(entry)) {
      collectEntries(childrenOf(entry), node.id, out, depth + 1)
    }
  }
}

function rawList(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of ['tree', 'sessions', 'roots', 'items', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value)) {
      const nested = value['items']
      if (Array.isArray(nested)) return nested
    }
  }
  return []
}

/** 归一化会话树：支持嵌套树 / 扁平列表，去重、排序、孤儿挂根、防环。 */
export function normalizeSessionTree(payload: unknown): SessionNode[] {
  const entries = new Map<string, SessionNode>()
  collectEntries(rawList(payload), null, entries, 0)

  // 防环：沿 parent 链向上走，超过范围或回到自己则视为根
  const resolveParent = (node: SessionNode): SessionNode | null => {
    if (!node.parentId || node.parentId === node.id) return null
    let current = entries.get(node.parentId)
    const seen = new Set<string>([node.id])
    while (current) {
      if (seen.has(current.id)) return null
      seen.add(current.id)
      if (!current.parentId) break
      current = entries.get(current.parentId)
    }
    return entries.get(node.parentId) ?? null
  }

  const roots: SessionNode[] = []
  for (const node of entries.values()) {
    node.children = []
  }
  for (const node of entries.values()) {
    const parent = resolveParent(node)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const byCreatedAt = (a: SessionNode, b: SessionNode): number =>
    a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  // 根排序：main 永远在最前（主窗口 = 根聚合视图），其余按创建时间
  roots.sort((a, b) => {
    if (a.id === 'main' && b.id !== 'main') return -1
    if (b.id === 'main' && a.id !== 'main') return 1
    return byCreatedAt(a, b)
  })
  for (const node of entries.values()) node.children.sort(byCreatedAt)
  return roots
}

/** id -> { title, depth }：左栏缩进与中栏「归属会话标签」共用。 */
export function flattenSessionMeta(roots: readonly SessionNode[]): SessionMetaEntry[] {
  const meta: SessionMetaEntry[] = []
  const walk = (nodes: readonly SessionNode[], depth: number): void => {
    for (const node of nodes) {
      const entry: SessionMetaEntry = { id: node.id, title: node.title, depth }
      if (node.parentId) entry.parentId = node.parentId
      meta.push(entry)
      walk(node.children, depth + 1)
    }
  }
  walk(roots, 0)
  return meta
}

export function findNode(roots: readonly SessionNode[], id: string | null): SessionNode | null {
  if (!id) return null
  for (const root of roots) {
    if (root.id === id) return root
    const found = findNode(root.children, id)
    if (found) return found
  }
  return null
}

/** 根 → 目标节点的路径（含目标）；找不到返回空数组。 */
export function findPath(roots: readonly SessionNode[], id: string | null): SessionNode[] {
  if (!id) return []
  const walk = (nodes: readonly SessionNode[], trail: SessionNode[]): SessionNode[] => {
    for (const node of nodes) {
      const nextTrail = [...trail, node]
      if (node.id === id) return nextTrail
      const found = walk(node.children, nextTrail)
      if (found.length > 0) return found
    }
    return []
  }
  return walk(roots, [])
}

export function nodeDepth(roots: readonly SessionNode[], id: string | null): number {
  const path = findPath(roots, id)
  return path.length === 0 ? -1 : path.length - 1
}

export function countNodes(roots: readonly SessionNode[]): number {
  return roots.reduce((sum, node) => sum + 1 + countNodes(node.children), 0)
}

export function collectIds(roots: readonly SessionNode[]): Set<string> {
  const ids = new Set<string>()
  const walk = (nodes: readonly SessionNode[]): void => {
    for (const node of nodes) {
      ids.add(node.id)
      walk(node.children)
    }
  }
  walk(roots)
  return ids
}

/** 状态点语义：archived → 已归档；其余视为进行中（后端可选 status 覆盖）。 */
export function statusLabel(status: string): string {
  if (status === 'archived') return '已归档'
  if (status === 'idle') return '空闲'
  return '进行中'
}

/** M6：归档会话只读（不能改名/新建子会话/发消息），恢复后还原。 */
export function isReadOnly(node: Pick<SessionNode, 'archived'> | null): boolean {
  return node?.archived === true
}

/** 归档徽标文案（树节点与中栏只读提示共用同一套措辞）。 */
export function archivedBadge(): string {
  return '已归档 · 只读'
}

export function statusTone(status: string): string {
  if (status === 'archived') return 'bg-muted'
  if (status === 'idle') return 'bg-warn'
  return 'bg-ok'
}

/** 一行摘要：后端有 summary 用 summary，否则退回消息条数/状态。 */
export function summaryLine(node: SessionNode): string {
  if (node.summary) return node.summary
  if (node.messageCount && node.messageCount > 0) return `${node.messageCount} 条消息`
  return statusLabel(node.status)
}

/** 从 POST /api/sessions 的返回里取新会话 id（兼容多种包装）。 */
export function extractCreatedSessionId(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const direct = readString(payload, 'id') ?? readString(payload, 'sessionId')
  if (direct) return direct

  const session = payload['session']
  if (isRecord(session)) return readString(session, 'id') ?? null

  const data = payload['data']
  if (isRecord(data)) {
    const nested = readString(data, 'id') ?? readString(data, 'sessionId')
    if (nested) return nested
    const nestedSession = data['session']
    if (isRecord(nestedSession)) return readString(nestedSession, 'id') ?? null
  }
  return null
}

/** 供 chat 决定 includeChildren 默认值：根会话默认含子会话。 */
export function shouldIncludeChildrenByDefault(depth: number): boolean {
  return depth <= 0
}
