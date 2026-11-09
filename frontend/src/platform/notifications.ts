// platform/notifications.ts —— 通知打扰预算的纯模型（M7）
//
// 设计依据：M7「仅三类打扰」——任务完成 / 需审批 / 错误。
// 通知必须可关闭、不阻塞输入（渲染层用 pointer-events 处理），且与右栏任务状态一致。
// 这里只做纯逻辑：归一化、上限、去重、关闭、自动消失时长（可单测）。

export const NOTIFY_KINDS = ['task-done', 'approval', 'error'] as const

export type NotifyKind = (typeof NOTIFY_KINDS)[number]

export interface NotifyInput {
  kind: string
  title: string
  detail?: string
  /** 关联 id（任务/审批 id）：用于去重，避免同一事件重复提示 */
  id?: string
}

export interface NotificationItem {
  key: string
  kind: NotifyKind
  title: string
  detail?: string
  at: number
}

export const MAX_NOTIFICATIONS = 4

const KIND_SET = new Set<string>(NOTIFY_KINDS)

export function isNotifyKind(value: string): value is NotifyKind {
  return KIND_SET.has(value)
}

export function normalizeNotification(input: unknown, at: number = Date.now()): NotificationItem | null {
  if (typeof input !== 'object' || input === null) return null
  const record = input as Record<string, unknown>
  const kind = typeof record['kind'] === 'string' ? record['kind'] : ''
  if (!isNotifyKind(kind)) return null
  const title = typeof record['title'] === 'string' ? record['title'].trim() : ''
  if (!title) return null
  const detailRaw = record['detail']
  const detail = typeof detailRaw === 'string' && detailRaw.trim() ? detailRaw.trim() : undefined
  const id = typeof record['id'] === 'string' && record['id'].trim() ? record['id'].trim() : undefined
  return {
    key: `${kind}:${id ?? title}`,
    kind,
    title,
    ...(detail === undefined ? {} : { detail }),
    at,
  }
}

/** 新通知置顶；同 key 去重（保留最新），最多 MAX_NOTIFICATIONS 条。 */
export function pushNotification(
  list: readonly NotificationItem[],
  item: NotificationItem,
  max: number = MAX_NOTIFICATIONS,
): NotificationItem[] {
  const deduped = list.filter((existing) => existing.key !== item.key)
  return [item, ...deduped].slice(0, Math.max(0, max))
}

export function dismissNotification(list: readonly NotificationItem[], key: string): NotificationItem[] {
  return list.filter((item) => item.key !== key)
}

/** 自动消失时长：任务完成 6s；错误 10s；需审批必须人来处理，不自动消失。 */
export function autoDismissMs(kind: NotifyKind): number | null {
  if (kind === 'task-done') return 6000
  if (kind === 'error') return 10000
  return null
}

export function notifyKindLabel(kind: NotifyKind): string {
  if (kind === 'task-done') return '任务完成'
  if (kind === 'approval') return '需要确认'
  return '出错了'
}

/** 供 UI 选择语义 token（不硬编码颜色）。 */
export function notifyKindTone(kind: NotifyKind): 'ok' | 'warn' | 'danger' {
  if (kind === 'task-done') return 'ok'
  if (kind === 'approval') return 'warn'
  return 'danger'
}
