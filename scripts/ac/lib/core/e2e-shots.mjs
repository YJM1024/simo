// 端到端三档截图：同一份 mock 后端 + build/frontend，在 1280/768/375 三个宽度各截一组。
import fs from 'node:fs'
import path from 'node:path'
import { freePort, startBackend, stop, ROOT, frontendDir } from './bootstrap.mjs'
import { startDistServer } from '../conversation-ui.mjs'

const VIEWPORTS = [[1280, 900], [768, 900], [375, 812]]
const PORT = await freePort(19500)
const HOME = path.join(ROOT, '.tmp', 'pipeline-build', 'shots-home')
fs.mkdirSync(HOME, { recursive: true })
process.env.AC_CONV_SHARED = '1'
process.env.AC_CONV_BASE = `http://127.0.0.1:${PORT}`
process.env.AC_CONV_HOME = HOME

const { createSession, createBatch } = await import('../conv-backend.mjs')
const cdp = await import('./cdp.mjs')

const server = await startBackend({ port: PORT, home: HOME })
let front = null
const sessionId = await createSession('P2 任务域截图')
await createBatch(sessionId, {
  mode: 'plan',
  goal: '截图夹具',
  tasks: [
    { key: 't1', title: '整理会议纪要', mode: 'plan', goal: '整理会议纪要' },
    { key: 't2', title: '核对指标口径', mode: 'plan', goal: '核对指标口径' },
    { key: 't3', title: '输出周报摘要', mode: 'plan', goal: '输出周报摘要' },
  ],
  clientMutationId: `shots-${Date.now()}`,
})

try {
  front = await startDistServer({ apiBase: server.baseUrl, distDir: frontendDir() })
  for (const [width, height] of VIEWPORTS) {
    const page = await cdp.openSession(sessionId, { url: front.url })
    try {
      await cdp.setViewport(page, width, height)
      await cdp.waitFor(page, `document.querySelector('aside.inspector') !== null`, { label: '右栏挂载', timeout: 15000 })
      await new Promise((r) => setTimeout(r, 700))
      const suffix = `${width}x${height}.png`
      await cdp.screenshot(page, `overview-${suffix}`)
      if (width <= 480) {
        await cdp.screenshot(page, `mobile-overview-${suffix}`)
      } else {
        await page.evaluate(`(() => { const b = document.querySelector('.insp-rail button[title="任务"]'); if (b) { b.click(); return true } return false })()`)
        await new Promise((r) => setTimeout(r, 700))
        await cdp.screenshot(page, `task-list-${suffix}`)
        await page.evaluate(`(() => { const b = document.querySelector('.insp-rail button[title="交付物"]'); if (b) { b.click(); return true } return false })()`)
        await new Promise((r) => setTimeout(r, 700))
        await cdp.screenshot(page, `inspector-${suffix}`)
      }
    } finally {
      page.close()
    }
  }
} finally {
  if (front) await front.close().catch(() => {})
  await stop(server.child)
}
console.log('shots ok')
