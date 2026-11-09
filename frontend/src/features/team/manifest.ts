// features/team/manifest.ts —— M40：顶部 tab 内嵌视图（无左栏入口、无浮窗）
import { defineFeature } from '../../platform/manifest.ts'
import TeamMainView from './TeamMainView.tsx'

export const manifest = defineFeature({
  id: 'team',
  slots: { mainView: TeamMainView },
})
