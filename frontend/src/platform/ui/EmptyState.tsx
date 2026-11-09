// platform/ui/EmptyState.tsx —— M40 统一空态（线性图标 + 一句说明 + 至多一个操作）
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons.tsx'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: IconName
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ title, description, icon = 'info', action, compact = false }: EmptyStateProps) {
  return (
    <div role="status" className={`min-w-0 text-center ${compact ? 'px-2 py-3' : 'px-4 py-8'}`}>
      <Icon name={icon} size={20} className="mx-auto text-muted" />
      <p className={`m-0 font-medium text-ink ${compact ? 'mt-2 text-xs' : 'mt-3 text-sm'}`}>{title}</p>
      {description && <p className={`m-0 break-words text-xs leading-relaxed text-muted ${compact ? 'mt-1' : 'mt-2'}`}>{description}</p>}
      {action && <div className="mt-3 flex items-center justify-center">{action}</div>}
    </div>
  )
}
