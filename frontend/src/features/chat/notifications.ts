// features/chat/notifications.ts —— UI-2 通知中心纯逻辑
//
// 三类：task-done / approval / error；toast 与中心同源（bus NOTIFY 事件）。
// 后端 notifications API 未就绪时只保留本次会话内存历史，并在中心说明。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export type NotificationKind = 'task-done' | 'approval' | 'error'
export type NotificationFilter = 'all' | 'unread' | 'task' | 'approval' | 'error'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  title: string
  detail?: string
  at: number
  read: boolean
  taskId?: string
  sessionId?: string
  approvalId?: string
}

export function normalizeNotification(value: unknown, now = Date.now()): NotificationItem | null {
  if (!isRecord(value)) return null
  const rawKind = readString(value, 'kind') ?? readString(value, 'type') ?? ''
  const kind: NotificationKind = rawKind === 'approval' ? 'approval' : rawKind === 'error' ? 'error' : 'task-done'
  const title = readString(value, 'title') ?? readString(value, 'message') ?? (kind === 'approval' ? '有操作等待确认' : kind === 'error' ? '发生错误' : '任务完成')
  const id = readString(value, 'id') ?? `${kind}:${title}:${readNumber(value, 'at') ?? now}`
  return {
    id,
    kind,
    title,
    ...(readString(value, 'detail') ? { detail: readString(value, 'detail') } : {}),
    at: readNumber(value, 'at') ?? readNumber(value, 'createdAt') ?? now,
    read: value['read'] === true || readNumber(value, 'readAt') !== undefined,
    ...(readString(value, 'taskId') ?? readString(value, 'task_id') ? { taskId: readString(value, 'taskId') ?? readString(value, 'task_id') } : {}),
    ...(readString(value, 'sessionId') ?? readString(value, 'session_id') ? { sessionId: readString(value, 'sessionId') ?? readString(value, 'session_id') } : {}),
    ...(readString(value, 'approvalId') ?? readString(value, 'approval_id') ? { approvalId: readString(value, 'approvalId') ?? readString(value, 'approval_id') } : {}),
  }
}

export function normalizeNotificationList(payload: unknown): NotificationItem[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload['notifications']) ? payload['notifications'] : Array.isArray(payload['items']) ? payload['items'] : []
  return raw.map((entry) => normalizeNotification(entry)).filter((item): item is NotificationItem => item !== null)
}

export function mergeNotifications(
  existing: readonly NotificationItem[],
  incoming: readonly NotificationItem[],
  max = 100,
): NotificationItem[] {
  const map = new Map(existing.map((item) => [item.id, item]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, max)
}

export function filterNotifications(
  items: readonly NotificationItem[],
  filter: NotificationFilter,
): NotificationItem[] {
  if (filter === 'all') return [...items]
  if (filter === 'unread') return items.filter((item) => !item.read)
  if (filter === 'task') return items.filter((item) => item.kind === 'task-done')
  return items.filter((item) => item.kind === filter)
}

export function unreadNotificationCount(items: readonly NotificationItem[]): number {
  return items.filter((item) => !item.read).length
}

export function markNotificationRead(items: readonly NotificationItem[], id: string): NotificationItem[] {
  return items.map((item) => (item.id === id ? { ...item, read: true } : item))
}

export function markAllNotificationsRead(items: readonly NotificationItem[]): NotificationItem[] {
  return items.map((item) => ({ ...item, read: true }))
}

export function notificationKindLabel(kind: NotificationKind): string {
  if (kind === 'task-done') return '任务完成'
  if (kind === 'approval') return '审批'
  return '错误'
}

export function notificationKindTone(kind: NotificationKind): string {
  if (kind === 'task-done') return 'border-ok-border bg-ok-soft text-ok-ink'
  if (kind === 'approval') return 'border-warn-border bg-warn-soft text-warn-ink'
  return 'border-danger-border bg-danger-soft text-danger-ink'
}

export function formatNotificationTime(at: number): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
