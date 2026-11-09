// features/sessions/manifest.ts
//
// 左栏功能：会话树。M1 单根「主会话」；结构按 parentId 建树以便 M2 扩展。

import { defineFeature } from '../../platform/manifest.ts'
import SessionTreePanel from './SessionTreePanel.tsx'

export const manifest = defineFeature({
  id: 'sessions',
  slots: { leftTree: SessionTreePanel },
})
