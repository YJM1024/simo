// platform/ui/Tabs.tsx —— M40 统一 Tab（underline，32px，键盘左右/Home/End）
import { useRef } from 'react'

export interface TabItem {
  id: string
  label: string
  count?: number
}

export interface TabsProps {
  items: readonly TabItem[]
  active: string
  onChange: (id: string) => void
  ariaLabel: string
  className?: string
  size?: 'sm' | 'md'
}

export function Tabs({ items, active, onChange, ariaLabel, className = '', size = 'md' }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const move = (index: number): void => {
    const item = items[index]
    if (!item) return
    onChange(item.id)
    refs.current[index]?.focus()
  }
  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap ${className}`}>
      {items.map((item, index) => {
        const selected = item.id === active
        return (
          <button
            key={item.id}
            ref={(element) => { refs.current[index] = element }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') { event.preventDefault(); move((index + 1) % items.length) }
              else if (event.key === 'ArrowLeft') { event.preventDefault(); move((index - 1 + items.length) % items.length) }
              else if (event.key === 'Home') { event.preventDefault(); move(0) }
              else if (event.key === 'End') { event.preventDefault(); move(items.length - 1) }
            }}
            className={`flex h-8 flex-none items-center gap-1.5 border-b-2 px-2.5 text-sm transition-colors duration-fast focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${size === 'sm' ? 'text-xs' : ''} ${selected ? 'border-accent font-medium text-ink' : 'border-transparent text-ink-secondary hover:text-ink'}`}
          >
            {item.label}
            {typeof item.count === 'number' && <span className="rounded-pill bg-surface-sunken px-1.5 font-mono text-xs tabular-nums text-muted">{item.count > 99 ? '99+' : item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
