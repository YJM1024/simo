// features/workbench/manifest.ts —— M40：顶部 tab 内嵌工作台；左栏宿主保留命令面板/首启
import { defineFeature } from '../../platform/manifest.ts'
import WorkbenchEntry from './WorkbenchEntry.tsx'
import WorkbenchMainView from './WorkbenchMainView.tsx'

export const manifest = defineFeature({
  id: 'workbench',
  slots: { leftTree: WorkbenchEntry, mainView: WorkbenchMainView },
})
