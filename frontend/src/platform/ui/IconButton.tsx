// platform/ui/IconButton.tsx —— M40 纯图标按钮（28/32，aria-label 必填）
import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './icons.tsx'
import { Tooltip } from './Tooltip.tsx'
import type { ButtonVariant } from './Button.tsx'

const BASE = 'inline-flex items-center justify-center rounded-xs border transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'
const SIZE = { sm: 'h-7 w-7', md: 'h-7 w-7' } as const
const TONE: Record<'ghost' | 'secondary' | 'primary' | 'danger', string> = {
  ghost: 'border-transparent bg-transparent text-ink-secondary hover:bg-surface-sunken hover:text-ink',
  secondary: 'border-border bg-surface-solid text-ink-secondary hover:bg-surface-sunken hover:text-ink',
  primary: 'border-ink bg-ink text-ink-inverse shadow-sm hover:bg-ink-secondary',
  danger: 'border-danger-border bg-danger-soft text-danger-ink hover:border-danger',
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName
  label: string
  size?: keyof typeof SIZE
  tone?: keyof typeof TONE
  loading?: boolean
  variant?: ButtonVariant
  tooltip?: string
}

export function IconButton({ icon, label, size = 'md', tone = 'ghost', loading = false, className = '', disabled, type = 'button', tooltip, ...rest }: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${SIZE[size]} ${TONE[tone]} ${className}`}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <Icon name={icon} size={16} />}
    </button>
  )
  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button
}
