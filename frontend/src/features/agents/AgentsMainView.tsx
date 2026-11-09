// features/agents/AgentsMainView.tsx —— M40 顶部「智能体」内嵌视图（不是浮窗）
import { bus, EVENTS } from '../../platform/events.ts'
import AgentsPage from './AgentsPage.tsx'

export default function AgentsMainView() {
  return <AgentsPage embedded onClose={() => bus.emit(EVENTS.NAV_CLOSED, { view: 'agents' })} />
}
