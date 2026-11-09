// platform/ui/Tooltip.tsx —— M40 轻量 Tooltip（hover/focus 300ms，深色底反白，无关键操作）
import { useRef, useState, type ReactNode } from 'react'

export function Tooltip({ label, children, side = 'bottom' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setOpen(true), 300)
  }
  const hide = (): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    setOpen(false)
  }
  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 max-w-60 -translate-x-1/2 whitespace-normal rounded-xs border border-border bg-ink px-2 py-1 text-xs leading-snug text-ink-inverse shadow-lg ${side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
