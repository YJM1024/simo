// features/views/manifest.ts
//
// 无可见栏位：ViewHost 监听 view:open 事件，按需打开自定义视图预览（M24）。

import { defineFeature } from '../../platform/manifest.ts'
import ViewHost from './ViewHost.tsx'

export const manifest = defineFeature({
  id: 'views',
  slots: { leftTree: ViewHost },
})
