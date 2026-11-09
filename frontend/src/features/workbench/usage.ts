// features/workbench/usage.ts —— 用量统计纯逻辑（UI-1，可单测）
//
// 需求：树状表格 + 每行内嵌时间序列（同一时间轴）：
//   行 = 会话（按会话树缩进，负责人头像）；父行包含子会话汇总；
//   指标切换（消息数/token）、粒度（天/周/月）、范围（7/30/自定义）；SVG 自绘。
// 后端用量接口未就绪时用确定性示例数据（source=sample），token 为估算值。

import type { SessionSummary } from '../../platform/types.ts'

export type UsageMetric = 'messages' | 'tokens'
export type UsageGranularity = 'day' | 'week' | 'month'
export type UsageRangeMode = '7' | '30' | 'custom'

export interface UsageNode {
  id: string
  title: string
  parentId: string | null
  messageCount: number
  tokens: number
  lastActive: number
  agentId: string | null
  /** 自身时间序列（与 buckets 对齐） */
  series: number[]
  children: UsageNode[]
}

export interface UsageRow {
  node: UsageNode
  depth: number
  /** 该行展示的序列（父行含子会话汇总） */
  series: number[]
  totalMessages: number
  totalTokens: number
  hasChildren: boolean
  collapsed: boolean
}

export interface UsageBucket {
  key: string
  label: string
  start: number
  end: number
}

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619) >>> 0
  }
  return value >>> 0
}

function pseudo(seed: string, max: number): number {
  return max === 0 ? 0 : hash(seed) % max
}

/** 会话 → 用量节点（确定性示例值，后端未提供 token 时估算）。 */
export function usageNodeForSession(session: SessionSummary, now = Date.now()): UsageNode {
  const messageCount = Math.max(0, session.messageCount ?? pseudo(session.id, 24))
  const tokens = Math.round(messageCount * 110 + pseudo(`${session.id}:tok`, 900))
  const lastActive = session.createdAt && session.createdAt > 0 ? session.createdAt : now - pseudo(`${session.id}:age`, 7 * 86_400_000)
  return {
    id: session.id,
    title: session.title || session.id,
    parentId: session.parentId ?? null,
    messageCount,
    tokens,
    lastActive,
    agentId: null,
    series: [],
    children: [],
  }
}

/** 扁平会话 → 树（parentId；父不存在时挂根），兄弟按创建时间/标题排序。 */
export function buildUsageTree(sessions: readonly SessionSummary[], now = Date.now()): UsageNode[] {
  const nodes = new Map<string, UsageNode>()
  for (const session of sessions) {
    if (!session.id) continue
    nodes.set(session.id, usageNodeForSession(session, now))
  }
  const roots: UsageNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null
    if (parent && parent.id !== node.id) parent.children.push(node)
    else roots.push(node)
  }
  const sortNodes = (list: UsageNode[]): void => {
    list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    for (const node of list) sortNodes(node.children)
  }
  sortNodes(roots)
  return roots
}

function startOfDay(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function startOfWeek(ts: number): number {
  const date = new Date(startOfDay(ts))
  const day = date.getDay()
  const offset = (day + 6) % 7 // 周一为一周开始
  date.setDate(date.getDate() - offset)
  return date.getTime()
}

function startOfMonth(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  date.setDate(1)
  return date.getTime()
}

function formatBucketLabel(ts: number, granularity: UsageGranularity): string {
  const date = new Date(ts)
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (granularity === 'month') return `${date.getFullYear()}年${month}月`
  if (granularity === 'week') return `${month}/${day}周`
  return `${month}/${day}`
}

/** 时间范围（7/30/自定义）→ 起止毫秒（含当天）。 */
export function usageRangeBounds(
  mode: UsageRangeMode,
  now = Date.now(),
  customStart?: string,
  customEnd?: string,
): { start: number; end: number } {
  const end = startOfDay(now) + 86_400_000
  if (mode === '7') return { start: end - 7 * 86_400_000, end }
  if (mode === '30') return { start: end - 30 * 86_400_000, end }
  const parse = (value?: string): number | null => {
    if (!value) return null
    const time = Date.parse(`${value}T00:00:00`)
    return Number.isNaN(time) ? null : time
  }
  const customStartTime = parse(customStart)
  const customEndTime = parse(customEnd)
  if (customStartTime !== null && customEndTime !== null && customStartTime <= customEndTime) {
    return { start: customStartTime, end: customEndTime + 86_400_000 }
  }
  return { start: end - 7 * 86_400_000, end }
}

/** 按粒度切桶（同一行共用时间轴）。 */
export function buildBuckets(
  start: number,
  end: number,
  granularity: UsageGranularity,
): UsageBucket[] {
  const buckets: UsageBucket[] = []
  const align = granularity === 'month' ? startOfMonth : granularity === 'week' ? startOfWeek : startOfDay
  let cursor = align(Math.min(start, end - 1))
  let guard = 0
  while (cursor < end && guard < 400) {
    guard += 1
    const next =
      granularity === 'month'
        ? (() => {
            const date = new Date(cursor)
            date.setMonth(date.getMonth() + 1)
            return date.getTime()
          })()
        : granularity === 'week'
          ? cursor + 7 * 86_400_000
          : cursor + 86_400_000
    const bucketEnd = Math.min(next, end)
    buckets.push({ key: new Date(cursor).toISOString().slice(0, 10), label: formatBucketLabel(cursor, granularity), start: cursor, end: bucketEnd })
    cursor = next
  }
  return buckets
}

function metricValue(seed: string, bucket: UsageBucket, node: UsageNode, metric: UsageMetric, bucketCount: number): number {
  const base = metric === 'tokens' ? node.tokens : node.messageCount
  const noise = pseudo(`${seed}:${bucket.key}:${metric}`, 100)
  return Math.round((base / Math.max(1, bucketCount)) * (0.5 + noise / 50))
}

/** 每个会话自己的时间序列（按桶）；确定性示例数据。 */
export function seriesForNode(
  node: UsageNode,
  buckets: readonly UsageBucket[],
  metric: UsageMetric,
  seed = 'usage',
): number[] {
  return buckets.map((bucket) => metricValue(`${seed}:${node.id}`, bucket, node, metric, buckets.length))
}

/** 父行 = 自身 + 所有后代逐桶相加。 */
export function aggregateSeries(own: readonly number[], children: ReadonlyArray<readonly number[]>, length: number): number[] {
  const total = Array.from({ length }, (_, index) => own[index] ?? 0)
  for (const child of children) {
    for (let index = 0; index < length; index += 1) total[index] = (total[index] ?? 0) + (child[index] ?? 0)
  }
  return total
}

/** 展开/折叠后的树状行（父行含子会话汇总；折叠隐藏子孙）。 */
export function flattenUsageRows(
  roots: readonly UsageNode[],
  buckets: readonly UsageBucket[],
  metric: UsageMetric,
  collapsed: ReadonlySet<string>,
): UsageRow[] {
  const rows: UsageRow[] = []

  const walk = (node: UsageNode, depth: number): { series: number[]; messages: number; tokens: number } => {
    const row: UsageRow = {
      node,
      depth,
      series: [],
      totalMessages: 0,
      totalTokens: 0,
      hasChildren: node.children.length > 0,
      collapsed: collapsed.has(node.id),
    }
    rows.push(row)
    const childResults = node.children.map((child) => walk(child, depth + 1))
    const own = seriesForNode(node, buckets, metric)
    row.series = aggregateSeries(own, childResults.map((child) => child.series), buckets.length)
    row.totalMessages = node.messageCount + childResults.reduce((sum, child) => sum + child.messages, 0)
    row.totalTokens = node.tokens + childResults.reduce((sum, child) => sum + child.tokens, 0)
    return { series: row.series, messages: row.totalMessages, tokens: row.totalTokens }
  }

  for (const root of roots) walk(root, 0)
  // 折叠：只保留被折叠节点的行本身，不输出其子孙
  const visible: UsageRow[] = []
  const hiddenDepths: number[] = []
  for (const row of rows) {
    while (hiddenDepths.length > 0 && row.depth <= (hiddenDepths[hiddenDepths.length - 1] ?? -1)) hiddenDepths.pop()
    if (hiddenDepths.length > 0) continue
    visible.push(row)
    if (row.hasChildren && row.collapsed) hiddenDepths.push(row.depth)
  }
  return visible
}

/** 折线 sparkline 的 SVG points（宽度/高度固定，viewBox 内）。 */
export function sparklinePoints(values: readonly number[], width = 160, height = 28, padding = 2): string {
  if (values.length === 0) return ''
  const max = Math.max(1, ...values)
  const stepX = values.length === 1 ? 0 : (width - padding * 2) / (values.length - 1)
  return values
    .map((value, index) => {
      const x = padding + index * stepX
      const y = height - padding - (value / max) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

export function formatUsageNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(0)}k`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function formatLastActive(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} 小时前`
  return `${Math.round(diff / 86_400_000)} 天前`
}

/** 示例会话（后端会话接口不可用时的空/降级展示）。 */
export function sampleSessions(now = Date.now()): SessionSummary[] {
  return [
    { id: 'main', title: '主会话', parentId: undefined, messageCount: 18, createdAt: now - 2 * 86_400_000 },
    { id: 'child-report', title: '季度报告', parentId: 'main', messageCount: 12, createdAt: now - 86_400_000 },
    { id: 'child-data', title: '数据整理', parentId: 'main', messageCount: 7, createdAt: now - 3 * 3_600_000 },
    { id: 'grand-draft', title: '初稿校对', parentId: 'child-report', messageCount: 5, createdAt: now - 2 * 3_600_000 },
  ]
}
