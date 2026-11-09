// platform/ui/Toast.tsx —— M40 通知条（左侧 2px 状态条，不整块染色；可关闭）
import type { ReactNode } from 'react'
import { IconButton } from './IconButton.tsx'

export type ToastKind = 'info' | 'success' | 'warn' | 'error'

const BAR: Record<ToastKind, string> = {
  info: 'bg-accent',
  success: 'bg-ok',
  warn: 'bg-warn',
  error: 'bg-danger',
}

export interface ToastProps {
  kind: ToastKind
  title: string
  message?: string
  action?: ReactNode
  onClose?: () => void
}

export function Toast({ kind, title, message, action, onClose }: ToastProps) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="pointer-events-auto flex w-80 max-w-[calc(100vw-2rem)] items-start gap-2 rounded-md border border-border bg-surface-solid p-3 shadow-lg animate-msg-in"
    >
      <span className={`mt-0.5 h-full min-h-8 w-0.5 flex-none rounded-pill ${BAR[kind]}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-medium text-ink">{title}</p>
        {message && <p className="m-0 mt-1 break-words text-xs leading-relaxed text-ink-secondary">{message}</p>}
        {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
      </div>
      {onClose && <IconButton icon="close" label="关闭通知" size="sm" tone="ghost" onClick={onClose} />}
    </div>
  )
}
