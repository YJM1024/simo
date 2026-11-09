// features/memory/manifest.ts
//
// M40：顶部「记忆」tab 内嵌视图；右栏不再保留记忆入口。
import { defineFeature } from '../../platform/manifest.ts'
import MemoryMainView from './MemoryMainView.tsx'

export const manifest = defineFeature({
  id: 'memory',
  slots: { mainView: MemoryMainView },
})
