// app/NotificationHost.tsx —— 通知宿主（M7/M40：统一 Toast 组件）
//
// 打扰预算：任务完成 / 需审批 / 错误；可关闭、不阻塞输入；最多 3 条（notifications 逻辑约束）。

import { useEffect, useRef, useState } from 'react'
import { bus, EVENTS } from '../platform/events.ts'
import { Toast, type ToastKind } from '../platform/ui/Toast.tsx'
import {
  autoDismissMs,
  dismissNotification,
  normalizeNotification,
  notifyKindLabel,
  notifyKindTone,
  pushNotification,
  type NotificationItem,
} from '../platform/notifications.ts'

const TOAST_KIND: Record<'ok' | 'warn' | 'danger', ToastKind> = {
  ok: 'success',
  warn: 'warn',
  danger: 'error',
}

export default function NotificationHost() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const clearTimer = (key: string): void => {
      const timer = timersRef.current.get(key)
      if (timer !== undefined) {
        clearTimeout(timer)
        timersRef.current.delete(key)
      }
    }

    const off = bus.on(EVENTS.NOTIFY, (payload) => {
      const item = normalizeNotification(payload)
      if (!item) return
      clearTimer(item.key)
      setItems((prev) => pushNotification(prev, item))
      const ttl = autoDismissMs(item.kind)
      if (ttl !== null) {
        timersRef.current.set(
          item.key,
          setTimeout(() => {
            timersRef.current.delete(item.key)
            setItems((prev) => dismissNotification(prev, item.key))
          }, ttl),
        )
      }
    })

    return () => {
      off()
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  const dismiss = (key: string): void => {
    const timer = timersRef.current.get(key)
    if (timer !== undefined) {
      clearTimeout(timer)
      timersRef.current.delete(key)
    }
    setItems((prev) => dismissNotification(prev, key))
  }

  return (
    <div
      className="pointer-events-none fixed right-4 top-28 z-30 flex w-[min(21rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label="通知"
      aria-live="polite"
    >
      <span className="sr-only" role="status">{items.length > 0 ? `${items.length} 条通知` : ''}</span>
      {items.map((item) => (
        <Toast
          key={item.key}
          kind={TOAST_KIND[notifyKindTone(item.kind)]}
          title={item.title}
          message={item.detail ?? notifyKindLabel(item.kind)}
          onClose={() => dismiss(item.key)}
        />
      ))}
    </div>
  )
}
