// features/memory/MemoryMainView.tsx —— M40 顶部「记忆」内嵌视图（不是浮窗）
import { bus, EVENTS } from '../../platform/events.ts'
import MemoryBrowserPage from './MemoryBrowserPage.tsx'

export default function MemoryMainView() {
  return <MemoryBrowserPage embedded onClose={() => bus.emit(EVENTS.NAV_CLOSED, { view: 'memory' })} />
}
