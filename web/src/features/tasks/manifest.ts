// features/tasks/manifest.ts
//
// M38：右栏 = 细竖条（任务/概览）+ 展开面板；任务面板承载计划/待办/任务/交付物。

import { defineFeature } from '../../platform/manifest.ts'
import RightRail from './RightRail.tsx'

export const manifest = defineFeature({
  id: 'tasks',
  slots: { rightPanel: RightRail },
})
