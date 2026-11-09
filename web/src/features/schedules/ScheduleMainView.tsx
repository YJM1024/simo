// features/schedules/ScheduleMainView.tsx —— M40 顶部「任务/定时任务」内嵌视图（不是浮窗）
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import ScheduleManager from './ScheduleManager.tsx'

export default function ScheduleMainView() {
  return (
    <ScheduleManager
      embedded
      defaultSessionId={readSessionId() ?? ''}
      onClose={() => bus.emit(EVENTS.NAV_CLOSED, { view: 'schedules' })}
      onChanged={() => undefined}
    />
  )
}
