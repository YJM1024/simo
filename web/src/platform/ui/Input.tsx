// platform/ui/Input.tsx —— M40 输入框 / 文本域（label、focus ring、错误定位、hint）
import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

const FIELD = 'w-full rounded-xs border bg-surface-solid px-2.5 text-sm text-ink placeholder:text-muted outline-none transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-muted'
const HEIGHT = { sm: 'h-8', md: 'h-9' } as const

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  fieldSize?: keyof typeof HEIGHT
  leading?: ReactNode
}

export function Input({ label, error, hint, fieldSize = 'sm', leading, id, className = '', ...rest }: InputProps) {
  const autoId = useId()
  const inputId = id ?? `input-${autoId}`
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <label htmlFor={inputId} className="flex min-w-0 flex-col gap-1 text-xs text-ink-secondary">
      {label && <span>{label}</span>}
      <span className="relative flex items-center">
        {leading && <span className="pointer-events-none absolute left-2.5 text-muted">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`${FIELD} ${HEIGHT[fieldSize]} ${leading ? 'pl-8' : ''} ${error ? 'border-danger-border' : 'border-border'} ${className}`}
          {...rest}
        />
      </span>
      {error ? <span id={describedBy} role="alert" className="text-danger-ink">{error}</span> : hint ? <span id={describedBy} className="text-muted">{hint}</span> : null}
    </label>
  )
}

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export function TextArea({ label, error, hint, id, className = '', ...rest }: TextAreaProps) {
  const autoId = useId()
  const textareaId = id ?? `textarea-${autoId}`
  const describedBy = error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined
  return (
    <label htmlFor={textareaId} className="flex min-w-0 flex-col gap-1 text-xs text-ink-secondary">
      {label && <span>{label}</span>}
      <textarea
        id={textareaId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`${FIELD} min-h-20 resize-y py-2 ${error ? 'border-danger-border' : 'border-border'} ${className}`}
        {...rest}
      />
      {error ? <span id={describedBy} role="alert" className="text-danger-ink">{error}</span> : hint ? <span id={describedBy} className="text-muted">{hint}</span> : null}
    </label>
  )
}
