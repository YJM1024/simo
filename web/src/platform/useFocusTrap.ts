// platform/useFocusTrap.ts —— 弹层焦点管理（M7 可访问性）
//
// 约定：打开时焦点进入容器、Tab/Shift+Tab 在容器内循环、Esc 关闭、
// 关闭后把焦点还给之前的元素。用于记忆页抽屉与任务详情 modal。

import { useEffect } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => !el.hasAttribute('disabled') && (el.offsetParent !== null || el === document.activeElement),
  )
}

export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  active: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = focusableWithin(container)[0] ?? container
    first?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = focusableWithin(container)
      if (focusable.length === 0) return
      const firstEl = focusable[0]
      const lastEl = focusable[focusable.length - 1]
      if (!firstEl || !lastEl) return
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [active, containerRef, onClose])
}
