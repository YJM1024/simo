// features/memory/MemoryPanel.tsx —— 右栏「记忆（只读）」入口条 + 全屏只读页
//
// 右栏同时挂 tasks 与 memory：入口条 flex-none，任务列表 flex-1，互不挤压。
// 只读页用 portal 挂到 body，避免被右栏宽度/滚动容器限制。

import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import MemoryPage from './MemoryPage.tsx'

export default function MemoryPanel() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      <aside className="flex flex-none items-center justify-between gap-2 border-l border-b border-border-subtle bg-surface px-3.5 py-2 backdrop-blur-glass">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="m-0 text-md font-semibold">记忆</h2>
          <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs tracking-normal text-muted">
            只读
          </span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-sm border border-accent-border bg-accent-soft px-2 py-1 text-xs text-accent-hover transition-colors duration-fast hover:border-accent"
          title="打开记忆只读页（列表/冲突/搜索）"
        >
          打开记忆页 →
        </button>
      </aside>

      {open && createPortal(<MemoryPage onClose={close} />, document.body)}
    </>
  )
}
