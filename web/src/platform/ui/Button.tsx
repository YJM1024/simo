// platform/ui/Button.tsx —— M40 统一按钮（4 variant × 2 size，全状态）
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './icons.tsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

const BASE = 'inline-flex items-center justify-center gap-2 rounded-xs border font-medium transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none'

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-accent-ink hover:bg-accent-hover active:brightness-95',
  secondary: 'border-border bg-surface-solid text-ink-secondary hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken',
  ghost: 'border-transparent bg-transparent text-ink-secondary hover:bg-surface-sunken hover:text-ink active:bg-surface-sunken',
  danger: 'border-danger bg-danger text-ink-inverse hover:brightness-95 active:brightness-90',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: IconName
  iconAfter?: IconName
  children?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading = false, icon, iconAfter, children, className = '', disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {!loading && iconAfter ? <Icon name={iconAfter} size={16} /> : null}
    </button>
  )
}
