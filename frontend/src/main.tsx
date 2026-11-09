// 前端入口：先应用主题（避免闪烁），再挂载 React。
// CSS 由 Tailwind CLI 单独产出 app.css（见 build.mjs），这里不 import 样式。

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { initTheme } from './platform/theme/theme.ts'

initTheme()

const container = document.getElementById('root')
if (!container) throw new Error('缺少 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
