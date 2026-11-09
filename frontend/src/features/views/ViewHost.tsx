// features/views/ViewHost.tsx —— 自定义视图入口宿主（M24）
//
// 不占用可见栏位：监听总线 view:open（设置/命令面板触发），portal 打开当前会话的视图预览。
// 页面本身只读渲染；生成/修改/回滚通过对话或预览内的动作层完成。

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { bus, EVENTS } from '../../platform/events.ts'
import ViewPreview from './ViewPreview.tsx'

export default function ViewHost() {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => bus.on(EVENTS.VIEW_OPEN, () => setOpen(true)), [])

  if (!open) return null
  return createPortal(<ViewPreview onClose={close} />, document.body)
}
