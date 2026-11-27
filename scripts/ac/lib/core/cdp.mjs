// scripts/ac/lib/core/cdp.mjs
//
// 浏览器动作的唯一入口：连接、按视口开页、等待条件、点击、截图。
// 视口由 AC_VIEWPORT_WIDTH / AC_VIEWPORT_HEIGHT 注入，默认 1280×900；三档端到端靠它切换。
import fs from 'node:fs'
import path from 'node:path'
import {
  connect as rawConnect,
  waitFor,
  click,
  clickAt,
  clickMatching,
  setValue,
  pressKey,
  count,
  queryTexts,
} from '../../../lib/ac-cdp.mjs'
import { startDistServer, openConversation } from '../conversation-ui.mjs'
import { ROOT } from './bootstrap.mjs'

export const VIEWPORT = {
  width: Number(process.env.AC_VIEWPORT_WIDTH || 1280),
  height: Number(process.env.AC_VIEWPORT_HEIGHT || 900),
}

export async function connect(url, opts = {}) {
  const client = await rawConnect(url, opts)
  return client
}

export async function openSession(sessionId, { url, timeout = 20000 } = {}) {
  return openConversation(sessionId, { url, timeout })
}

export async function startFrontend({ apiBase, port, distDir, viewport = VIEWPORT } = {}) {
  const dir = distDir || path.join(ROOT, 'build', 'frontend')
  const server = await startDistServer({ apiBase, port, distDir: dir })
  return { ...server, distDir: dir, viewport }
}

export async function setViewport(client, width = VIEWPORT.width, height = VIEWPORT.height) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 480 })
  return { width, height }
}

/** 截图写到 build/evidence/screenshots/<layer>/；返回相对路径与字节数，供索引与报告引用。 */
export async function screenshot(client, name, layer = 'e2e') {
  const relative = `build/evidence/screenshots/${layer}/${name}`
  const file = path.join(ROOT, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return { file: relative, bytes: fs.statSync(file).size }
}

export { waitFor, click, clickAt, clickMatching, setValue, pressKey, count, queryTexts }
