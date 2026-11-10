// platform/ui/Badge.tsx —— M40 徽标/状态点（文字 + 颜色，99+，tabular-nums）
import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'muted'

const TONE: Record<BadgeTone, string> = {
  neutral: 'border-border-subtle bg-surface-sunken text-ink-secondary',
  accent: 'border-accent-border bg-accent-soft text-accent',
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-transparent bg-transparent text-muted',
}

const DOT: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-muted',
}

export interface BadgeProps {
  children?: ReactNode
  tone?: BadgeTone
  dot?: boolean
  count?: number
  size?: 'sm' | 'md'
  className?: string
  title?: string
}

export function Badge({ children, tone = 'neutral', dot = false, count, size = 'sm', className = '', title }: BadgeProps) {
  const content = typeof count === 'number' ? (count > 99 ? '99+' : String(count)) : children
  return (
    <span
      title={title}
      className={`inline-flex flex-none items-center gap-1.5 rounded-[3px] border font-medium tabular-nums ${size === 'md' ? 'h-5 px-2 text-[10px]' : 'h-[17px] px-1.5 text-[9px]'} ${TONE[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 flex-none rounded-pill ${DOT[tone]}`} aria-hidden="true" />}
      {content}
    </span>
  )
}
