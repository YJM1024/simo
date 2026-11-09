// platform/ui/Select.tsx —— M40 选择器（label、统一 chevron、focus ring、错误定位）
import { useId, type SelectHTMLAttributes } from 'react'
import { Icon } from './icons.tsx'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  error?: string
  hint?: string
  options: SelectOption[]
  placeholder?: string
  fieldSize?: 'sm' | 'md'
}

export function Select({ label, error, hint, options, placeholder, fieldSize = 'sm', id, className = '', ...rest }: SelectProps) {
  const autoId = useId()
  const selectId = id ?? `select-${autoId}`
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined
  return (
    <label htmlFor={selectId} className="flex min-w-0 flex-col gap-1 text-xs text-ink-secondary">
      {label && <span>{label}</span>}
      <span className="relative flex min-w-0 items-center">
        <select
          id={selectId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`w-full appearance-none rounded-xs border bg-surface-solid pl-2.5 pr-8 text-sm text-ink outline-none transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:bg-surface-sunken disabled:text-muted ${fieldSize === 'md' ? 'h-9' : 'h-8'} ${error ? 'border-danger-border' : 'border-border'} ${className}`}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-2.5 text-muted" />
      </span>
      {error ? <span id={describedBy} role="alert" className="text-danger-ink">{error}</span> : hint ? <span id={describedBy} className="text-muted">{hint}</span> : null}
    </label>
  )
}
