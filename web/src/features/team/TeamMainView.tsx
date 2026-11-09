// features/team/TeamMainView.tsx —— M40 顶部「团队」内嵌视图（不是浮窗）
import { bus, EVENTS } from '../../platform/events.ts'
import TeamPage from './TeamPage.tsx'

export default function TeamMainView() {
  return <TeamPage embedded onClose={() => bus.emit(EVENTS.NAV_CLOSED, { view: 'team' })} />
}
