// features/chat/manifest.ts
//
// 中栏功能：消息流 + 输入框 + WS 流式。只通过事件总线与左栏协作。

import { defineFeature } from '../../platform/manifest.ts'
import ChatCenter from './ChatCenter.tsx'

export const manifest = defineFeature({
  id: 'chat',
  slots: { center: ChatCenter },
})
