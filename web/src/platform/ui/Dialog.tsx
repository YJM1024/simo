// platform/ui/Dialog.tsx —— M40 统一弹窗（scrim-strong + border + radius 10 + overlay 阴影，焦点陷阱/Esc）
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../useFocusTrap.ts'
import { IconButton } from './IconButton.tsx'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  description?: string
}

const SIZE = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-4xl', xl: 'max-w-5xl' } as const

export function Dialog({ open, onClose, title, children, footer, size = 'md', description }: DialogProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, open, onClose)
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div ref={panelRef} className={`popover-surface flex max-h-[92vh] w-full ${SIZE[size]} flex-col overflow-hidden`}>
        <header className="flex flex-none items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="m-0 mt-1 break-words text-sm text-ink-secondary">{description}</p>}
          </div>
          <IconButton icon="close" label="关闭" tone="ghost" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 text-sm text-ink">{children}</div>
        {footer && <footer className="flex flex-none flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-4 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
