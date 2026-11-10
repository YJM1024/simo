// platform/ui/Card.tsx —— M40 卡片（surface + 1px border-subtle + radius 10；默认无阴影）
import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md'
  interactive?: boolean
  children: ReactNode
}

export function Card({ padding = 'md', interactive = false, className = '', children, ...rest }: CardProps) {
  const pad = padding === 'none' ? '' : padding === 'sm' ? 'p-3' : 'p-4'
  return (
    <div
      className={`min-w-0 rounded-md border border-border-subtle bg-surface-solid ${pad} ${interactive ? 'cursor-pointer transition-colors duration-fast hover:border-border hover:bg-surface-sunken/40' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`m-0 text-sm font-medium text-ink ${className}`}>{children}</h3>
}

export function CardMeta({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 text-xs text-muted ${className}`}>{children}</p>
}
