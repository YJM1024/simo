// features/chat/NotificationCenter.tsx —— UI-2 通知中心（铃铛 + 历史 + 已读 + 筛选）
//
// 与 M7 toast 同源（bus NOTIFY），并消费 WS notification.created；三类：任务完成/审批/错误。
// GET /api/notifications 未就绪时只保留本次会话内存历史并说明；已读上报后端失败仅本地生效。

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiGet, apiPost } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import type { WireFrame } from '../../platform/types.ts'
import { EmptyPane } from '../../platform/FeedbackPane.tsx'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  filterNotifications,
  formatNotificationTime,
  markAllNotificationsRead,
  markNotificationRead,
  mergeNotifications,
  normalizeNotification,
  normalizeNotificationList,
  notificationKindLabel,
  notificationKindTone,
  unreadNotificationCount,
  type NotificationFilter,
  type NotificationItem,
} from './notifications.ts'

const FILTERS: Array<{ id: NotificationFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'unread', label: '未读' },
  { id: 'task', label: '任务' },
  { id: 'approval', label: '审批' },
  { id: 'error', label: '错误' },
]

export default function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [note, setNote] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, open, () => setOpen(false))

  useEffect(() => {
    let cancelled = false
    void apiGet('/api/notifications?limit=50')
      .then((payload) => {
        if (!cancelled) setItems((prev) => mergeNotifications(normalizeNotificationList(payload), prev))
      })
      .catch(() => {
        if (!cancelled) setNote('后端通知接口未就绪：历史仅保留本次打开后的通知（toast 同源）。')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () =>
      bus.on(EVENTS.NOTIFY, (payload) => {
        const item = normalizeNotification(payload)
        if (item) setItems((prev) => mergeNotifications(prev, [item]))
      }),
    [],
  )

  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        if (frame.type !== 'notification.created') return
        const item = normalizeNotification(frame.data)
        if (item) setItems((prev) => mergeNotifications(prev, [item]))
      }),
    [],
  )

  const markRead = useCallback((item: NotificationItem): void => {
    setItems((prev) => markNotificationRead(prev, item.id))
    void apiPost(`/api/notifications/${encodeURIComponent(item.id)}/read`, {}).catch(() => {
      // 后端未就绪：本地已读即可
    })
    if (item.sessionId) bus.emit(EVENTS.SESSION_SELECT, { sessionId: item.sessionId })
    if (item.taskId) bus.emit(EVENTS.TASK_OPEN, { taskId: item.taskId })
  }, [])

  const markAll = useCallback((): void => {
    setItems((prev) => markAllNotificationsRead(prev))
    void apiPost('/api/notifications/read-all', {}).catch(() => {
      // 本地已读即可
    })
  }, [])

  const unread = unreadNotificationCount(items)
  const visible = filterNotifications(items, filter)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`通知中心（${unread} 条未读）`}
        aria-expanded={open}
        title="通知中心：任务完成 / 审批 / 错误"
        className="relative flex-none cursor-pointer whitespace-nowrap rounded-xs border border-border-subtle bg-surface-solid px-2 py-1 text-xs text-muted transition-colors duration-fast hover:border-accent-border hover:text-ink"
      >
        通知
        {unread > 0 && items.length > 0 && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-xs bg-danger" aria-hidden="true" />
        )}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-start justify-end bg-scrim-strong/60 p-2 pt-14 backdrop-blur-sm sm:p-4 sm:pt-16" role="dialog" aria-modal="true" aria-label="通知中心" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false) } }}>
            <div ref={panelRef} className="popover-surface flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden">
              <header className="flex flex-none items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
                <div>
                  <h2 className="m-0 text-md font-semibold">通知中心</h2>
                  <p className="m-0 text-2xs text-muted">任务完成 / 审批 / 错误 · 与 toast 同源</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={markAll} className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">
                    全部已读
                  </button>
                  <button type="button" onClick={() => setOpen(false)} aria-label="关闭通知中心" className="cursor-pointer rounded-xs border border-border-subtle px-1.5 py-0.5 text-2xs text-muted">
                    ×
                  </button>
                </div>
              </header>

              <div className="flex flex-none flex-wrap gap-1 border-b border-border-subtle px-3 py-1.5">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className={`cursor-pointer rounded-xs border px-1.5 py-0.5 font-mono text-2xs ${
                      filter === item.id ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {note && <p className="m-0 border-b border-warn-border bg-warn-soft/60 px-3 py-1 text-2xs text-warn-ink">{note}</p>}
                {visible.length === 0 ? (
                  <EmptyPane compact title="暂无通知" description="任务完成、审批和错误会出现在这里；与 toast 同源。" />
                ) : (
                  <ul className="m-0 list-none p-0" aria-label="通知历史">
                    {visible.map((item) => (
                      <li key={item.id} className="border-b border-border-subtle/60 last:border-0">
                        <button
                          type="button"
                          onClick={() => markRead(item)}
                          className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-left transition-colors duration-fast hover:bg-surface-sunken ${
                            item.read ? 'opacity-70' : ''
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-pill border px-1.5 font-mono text-2xs ${notificationKindTone(item.kind)}`}>
                              {notificationKindLabel(item.kind)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">{item.title}</span>
                            {!item.read && <span className="h-1.5 w-1.5 flex-none rounded-xs bg-accent" aria-label="未读" />}
                            <span className="font-mono text-2xs text-muted">{formatNotificationTime(item.at)}</span>
                          </span>
                          {item.detail && <span className="truncate text-2xs text-ink-secondary">{item.detail}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
