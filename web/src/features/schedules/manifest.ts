// features/schedules/manifest.ts —— M40：顶部 tab 内嵌视图（无左栏入口、无浮窗）
import { defineFeature } from '../../platform/manifest.ts'
import ScheduleMainView from './ScheduleMainView.tsx'

export const manifest = defineFeature({
  id: 'schedules',
  slots: { mainView: ScheduleMainView },
})
