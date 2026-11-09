// features/views/kanban.ts —— M34 看板 WIP/泳道/排序持久化（纯逻辑）
//
// 排序是纯展示状态，持久化到 localStorage；跨列移动仍必须映射既有语义动作（onRunAction），
// 不允许"拖到任意列=改状态"。WIP 仅展示/超限提示，不改变服务端数据。

export type KanbanGroupBy = 'status' | 'owner'
export type KanbanOrder = Record<string, string[]>

export interface KanbanLane {
  key: string
  label: string
  cards: Record<string, unknown>[]
}

export function kanbanStorageKey(pageId: string, blockId: string): string {
  return `simo.view.kanban.order:${pageId}:${blockId}`
}

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function readKanbanOrder(storage: StorageLike | null, key: string): KanbanOrder {
  if (!storage) return {}
  try {
    const raw = storage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const order: KanbanOrder = {}
    for (const [group, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) order[group] = ids.filter((id): id is string => typeof id === 'string').slice(0, 500)
    }
    return order
  } catch {
    return {}
  }
}

export function writeKanbanOrder(storage: StorageLike | null, key: string, order: KanbanOrder): void {
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(order))
  } catch {
    // 展示状态持久化失败不影响主流程
  }
}

export function sortCardsByOrder(
  cards: readonly Record<string, unknown>[],
  order: readonly string[],
  idOf: (card: Record<string, unknown>) => string,
): Record<string, unknown>[] {
  const rank = new Map<string, number>()
  order.forEach((id, index) => rank.set(id, index))
  return [...cards].sort((left, right) => {
    const a = rank.get(idOf(left))
    const b = rank.get(idOf(right))
    if (a === undefined && b === undefined) return 0
    if (a === undefined) return 1
    if (b === undefined) return -1
    return a - b
  })
}

/** 在分组内上移/下移卡片，返回新 order（保持完整 id 列表）。 */
export function moveCardInOrder(order: readonly string[], cardId: string, direction: 'up' | 'down'): string[] {
  const next = [...order]
  const index = next.indexOf(cardId)
  if (index < 0) return next
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= next.length) return next
  const [card] = next.splice(index, 1)
  if (card === undefined) return next
  next.splice(target, 0, card)
  return next
}

export function wipLimitFor(props: Record<string, unknown>, status: string): number | null {
  const limits = props['wipLimits']
  if (limits && typeof limits === 'object' && !Array.isArray(limits)) {
    const value = (limits as Record<string, unknown>)[status]
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric)
  }
  const single = props['wipLimit']
  const numeric = typeof single === 'number' ? single : Number(single)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null
}

export function groupCardsByLane(
  cards: readonly Record<string, unknown>[],
  groupBy: KanbanGroupBy,
  ownerOf: (card: Record<string, unknown>) => string,
): KanbanLane[] {
  if (groupBy !== 'owner') return [{ key: 'all', label: '全部', cards: [...cards] }]
  const lanes = new Map<string, Record<string, unknown>[]>()
  for (const card of cards) {
    const key = ownerOf(card) || '未分配'
    const list = lanes.get(key) ?? []
    list.push(card)
    lanes.set(key, list)
  }
  return [...lanes.entries()].map(([key, list]) => ({ key, label: key, cards: list }))
}

export function overWip(limit: number | null, count: number): boolean {
  return limit !== null && count > limit
}
