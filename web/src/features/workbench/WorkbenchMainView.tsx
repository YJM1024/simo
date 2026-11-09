// features/workbench/WorkbenchMainView.tsx —— M40 顶部「工作台」内嵌视图（不是浮窗）
import { bus, EVENTS } from '../../platform/events.ts'
import WorkbenchPage from './WorkbenchPage.tsx'

export default function WorkbenchMainView() {
  return (
    <WorkbenchPage
      embedded
      onClose={() => bus.emit(EVENTS.NAV_CLOSED, { view: 'workbench' })}
      onOpenUsage={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'usage' })}
      onOpenSettings={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'settings' })}
      onOpenPalette={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'palette' })}
      onOpenView={() => bus.emit(EVENTS.WORKBENCH_OPEN, { target: 'view' })}
    />
  )
}
