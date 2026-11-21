/**
 * Fork-free CDP E2E runner.
 *
 * Why this exists:
 *   `playwright test` forks a worker process; in this Windows sandbox
 *   `child_process.fork` fails with `spawn EPERM`. A normal Windows/CI
 *   terminal should keep using `pnpm test:e2e` (the real Playwright Test
 *   suite). This script exists for environments that cannot fork a worker but
 *   DO expose a headless Chrome DevTools endpoint.
 *
 * What it does:
 *   - connects to an already-running Chrome via `chromium.connectOverCDP`
 *     (default http://127.0.0.1:9223, override with E2E_CDP_URL);
 *   - starts an isolated backend on a dedicated port (default 19230) with an
 *     empty SIMO_HOME and mock model;
 *   - executes real-browser assertions with screenshots on failure.
 *
 * Scope: P1-CONV (会话/对话) only. The 01..07 scenarios mirror specs/01..07
 * (01,02,03,04a-04d,05,06 are session-domain; 07 is the workbench deliverable
 * download, which belongs to the frozen P2 workbench and is therefore NOT run
 * by default — opt in with E2E_INCLUDE_OOS=1). 08..16 add the P1-CONV gaps:
 * new-session lazy draft, rename, archive/restore, session switching,
 * long-scroll/jump-bottom/timeline jump, multi-tab sync, search, session-list
 * failure+retry, and send failure (no fake persistence).
 *
 * It does NOT relax assertions. The only skipped scenarios are the explicitly
 * out-of-scope (OOS) ones above, and every one of them is reported in
 * report/cdp/results.json + summary.md as skipped, never as passed.
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect as baseExpect } from '@playwright/test'

// 只放宽「等待可见/文本出现」的等待时间，不放宽任何期望值：本机负载高时单次
// 断言可能超过 Playwright 默认 5s（实测 04a/13 偶发），但语义断言完全保持原样。
const expect = baseExpect.configure({ timeout: 15_000 })

const HERE = fileURLToPath(new URL('.', import.meta.url))
const E2E_DIR = resolve(HERE, '..')
const FRONTEND_DIR = resolve(E2E_DIR, '..')
const WORKSPACE_DIR = resolve(FRONTEND_DIR, '..')
const REPORT_DIR = resolve(E2E_DIR, 'report', 'cdp')

const CDP_URL = process.env.E2E_CDP_URL ?? 'http://127.0.0.1:9223'
const PORT = Number(process.env.E2E_CDP_PORT ?? 19230)
const API_BASE = `http://127.0.0.1:${PORT}`
// 07 是 P2 工作台交付物下载，超出当前 P1-CONV 产品范围；默认不跑，显式 opt-in。
const INCLUDE_OOS = process.env.E2E_INCLUDE_OOS === '1'

const results = []
let apiChild = null
let apiExited = false
let runDir = ''

function unique(prefix) {
  return `${prefix} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function resolveBackendExe() {
  const candidates = [process.env.E2E_BACKEND_EXE, resolve(WORKSPACE_DIR, 'backend', 'simo-live-composer.exe')].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(`未找到后端可执行文件；可用 E2E_BACKEND_EXE 指定。候选：${candidates.join(', ')}`)
}

async function waitHttp(url, timeoutMs = 45_000, label = url) {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) return response
      last = `HTTP ${response.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }
  throw new Error(`等待服务就绪超时（${timeoutMs}ms）：${label}；最后错误：${last}`)
}

async function startApi() {
  mkdirSync(join(WORKSPACE_DIR, '.tmp'), { recursive: true })
  runDir = mkdtempSync(join(WORKSPACE_DIR, '.tmp', 'e2e-cdp-'))
  const home = join(runDir, 'home')
  mkdirSync(join(home, 'artifacts'), { recursive: true })
  mkdirSync(join(home, 'workspace'), { recursive: true })
  mkdirSync(join(home, 'logs'), { recursive: true })

  const exe = resolveBackendExe()
  const logPath = join(runDir, 'api.log')
  const fd = openSync(logPath, 'a')
  apiChild = spawn(exe, ['serve', '-addr', `127.0.0.1:${PORT}`, '-model', 'mock'], {
    env: {
      ...process.env,
      SIMO_HOME: home,
      SIMO_LLM: 'mock',
      SIMO_MODEL: 'mock',
      SIMO_DEBUG: '1',
    },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  closeSync(fd)
  apiChild.on('exit', (code, signal) => {
    apiExited = true
    console.log(`[cdp] backend exited code=${code} signal=${signal}`)
  })
  apiChild.on('error', (error) => {
    console.log(`[cdp] backend spawn error: ${error.message}`)
  })

  await waitHttp(`${API_BASE}/api/health`, 45_000, 'backend /api/health')
  await waitHttp(`${API_BASE}/`, 15_000, 'backend /')
  console.log(`[cdp] backend ready: ${API_BASE} (exe=${exe}, home=${home})`)
}

async function stopApi() {
  if (!apiChild || apiExited) return
  apiChild.kill()
  for (let index = 0; index < 40; index += 1) {
    if (apiExited) break
    await sleep(125)
  }
  if (!apiExited) {
    console.log(`[cdp] WARN backend pid ${apiChild.pid} did not exit; leaving ${runDir} for inspection`)
    return
  }
  try {
    rmSync(runDir, { recursive: true, force: true })
  } catch (error) {
    console.log(`[cdp] WARN cleanup failed: ${error.message}`)
  }
}

async function request(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`API 失败：${init.method ?? 'GET'} ${path} → ${response.status} ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text) : {}
}

async function waitFor(label, probe, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const value = await probe()
      if (value !== null && value !== undefined) return value
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(intervalMs)
  }
  throw new Error(`等待超时（${timeoutMs}ms）：${label}${lastError ? `；最后错误：${lastError}` : ''}`)
}

async function createSession(parentId, title) {
  const body = { title, draft: false }
  if (parentId) body.parentId = parentId
  const data = await request('/api/sessions', { method: 'POST', body: JSON.stringify(body) })
  if (!data.session?.id) throw new Error(`创建会话响应缺少 session.id：${JSON.stringify(data).slice(0, 200)}`)
  return data.session
}

async function getMessages(sessionId) {
  const data = await request(`/api/messages?sessionId=${encodeURIComponent(sessionId)}&limit=100`)
  return data.messages ?? []
}

async function postChat(sessionId, text) {
  const data = await request('/api/chat', { method: 'POST', body: JSON.stringify({ sessionId, text }) })
  return data.messageId ?? ''
}

async function seedChat(sessionId, text) {
  await postChat(sessionId, text)
  await waitFor(`用户消息落库：${text.slice(0, 30)}`, async () => {
    const messages = await getMessages(sessionId)
    return messages.some((message) => message.role === 'user' && message.text.includes(text)) ? true : null
  })
  await waitFor(`mock 回复落库：${text.slice(0, 30)}`, async () => {
    const messages = await getMessages(sessionId)
    return messages.some((message) => message.role === 'agent' && message.text.includes('Mock 模型')) ? true : null
  }, 45_000)
}

async function getTasks(sessionId) {
  const data = await request(`/api/tasks?sessionId=${encodeURIComponent(sessionId)}`)
  return data.tasks ?? []
}

async function getProjection(sessionId, taskLimit = 3) {
  return request(`/api/sessions/${encodeURIComponent(sessionId)}/spec-projection?taskLimit=${taskLimit}`)
}

async function waitForTaskDone(sessionId, titleIncludes) {
  return waitFor(`任务完成：${titleIncludes}`, async () => {
    const tasks = await getTasks(sessionId)
    return tasks.find((task) => task.title.includes(titleIncludes) && task.status === 'done') ?? null
  }, 30_000)
}

async function waitForProjectionTask(sessionId, taskId) {
  return waitFor(`任务进入 spec projection：${taskId}`, async () => {
    const projection = await getProjection(sessionId)
    const all = [...projection.tasks.done.items, ...projection.tasks.running.items, ...projection.tasks.pending.items]
    return all.some((item) => item.id === taskId) ? projection : null
  }, 15_000)
}

async function listApprovals() {
  const data = await request('/api/approvals')
  return data.approvals ?? []
}

async function waitForPendingApproval(argsInclude) {
  return waitFor(`待审批：${argsInclude}`, async () => {
    const approvals = await listApprovals()
    return approvals.find((approval) => approval.status === 'pending' && approval.args.includes(argsInclude)) ?? null
  }, 45_000)
}

async function decideApproval(id, decision = 'allow') {
  await request(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ decision }) })
}

async function listDeliverables() {
  const data = await request('/api/deliverables')
  return data.deliverables ?? []
}

async function waitForDeliverable(name) {
  return waitFor(`交付物出现：${name}`, async () => {
    const deliverables = await listDeliverables()
    return deliverables.find((item) => item.name === name) ?? null
  }, 45_000)
}

async function seedDeliverable(sessionId) {
  await postChat(sessionId, 'mock:write')
  const approval = await waitForPendingApproval('mock-write.txt')
  await decideApproval(approval.id, 'allow')
  return waitForDeliverable('mock-write.txt')
}

async function gotoHome(page) {
  await page.goto(API_BASE)
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('textarea[aria-label="消息输入框"]')).toBeVisible({ timeout: 15_000 })
}

async function openSession(page, title) {
  await gotoHome(page)
  const row = page.locator('.session-row', { has: page.locator('.session-title', { hasText: title }) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.conversation-panel')).toBeVisible()
}

async function openSessionViaWorkbench(page, title) {
  await gotoHome(page)
  await page.locator('.nav-chip', { hasText: '工作台' }).click()
  await expect(page.locator('section[aria-label="工作台"]')).toBeVisible()
  const row = page.locator('.list .row', { hasText: title }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.conversation-panel')).toBeVisible()
}

async function sendViaComposer(page, text) {
  const box = page.locator('textarea[aria-label="消息输入框"]')
  await box.click()
  await box.fill(text)
  await box.press('Enter')
}

async function switchToWorkbench(page) {
  await page.locator('.nav-chip', { hasText: '工作台' }).click()
  await expect(page.locator('section[aria-label="工作台"]')).toBeVisible()
}

async function expectNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(metrics.scrollWidth, `documentElement.scrollWidth=${metrics.scrollWidth} > clientWidth=${metrics.clientWidth}`).toBeLessThanOrEqual(metrics.clientWidth + 1)
  expect(metrics.bodyScrollWidth, `body.scrollWidth=${metrics.bodyScrollWidth} > innerWidth=${metrics.innerWidth}`).toBeLessThanOrEqual(metrics.innerWidth + 1)
}

async function messageOffsetInScroller(page, messageId) {
  return page.evaluate((id) => {
    const scroller = document.querySelector('.conversation-scroll')
    const node = document.querySelector(`.conversation-scroll .msg[data-message-id="${id}"]`)
    if (!scroller || !node) return null
    return node.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  }, messageId)
}

async function dispatchClick(page, selector) {
  await page.locator(selector).first().dispatchEvent('click')
}

async function listAllSessions() {
  const data = await request('/api/sessions')
  return data.sessions ?? []
}

async function findSessionById(sessionId) {
  const sessions = await listAllSessions()
  return sessions.find((session) => session.id === sessionId) ?? null
}

function sessionRow(page, title) {
  return page.locator('.session-row', { has: page.locator('.session-title', { hasText: title }) })
}

async function openSecondTab(context) {
  const tab = await context.newPage()
  tab.setDefaultTimeout(15_000)
  return tab
}

async function seedChain(childMessages) {
  const suffix = unique('E2E 链路')
  const mainText = `${suffix} 根消息`
  const parentTitle = `${suffix} 上级`
  const childTitle = `${suffix} 当前`
  const parent = await createSession('main', parentTitle)
  const child = await createSession(parent.id, childTitle)
  await seedChat('main', mainText)
  await seedChat(parent.id, `${suffix} 上级消息`)
  for (let index = 0; index < childMessages; index += 1) {
    await seedChat(child.id, `${suffix} 当前消息 ${String(index + 1).padStart(2, '0')}`)
  }
  return { mainText, parentTitle, childTitle, parentId: parent.id, childId: child.id }
}

const suite = []
function scenario(name, viewport, fn, options = {}) {
  suite.push({ name, viewport, fn, oos: Boolean(options.oos) })
}

// 01a / E2E-SHELL-001
scenario('01a 首屏结构（消息 + 时间轴 + 右栏）', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 加载会话')
  const text = unique('会话加载消息')
  const session = await createSession('main', title)
  await seedChat(session.id, text)
  await openSession(page, title)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
  await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible()
  await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible()
  await expect(page.locator('.timeline.timeline-groups')).toBeVisible()
  await expect(page.locator('.inspector[aria-label="会话概览"]')).toBeVisible()
})

// 01b / E2E-RESP-001
scenario('01b 375 宽度无横向溢出、时间轴/侧栏隐藏', { width: 375, height: 812 }, async (page) => {
  await gotoHome(page)
  await expect(page.locator('.composer textarea')).toBeVisible()
  await expectNoHorizontalOverflow(page)
  const box = await page.locator('.composer textarea').boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(120)
  await expect(page.locator('.conversation-panel > .timeline')).toBeHidden()
  await expect(page.locator('.sidebar')).toBeHidden()
})

// 02 / E2E-CHAT-001
scenario('02 Enter 发送、WS 流式与 mock 回复', { width: 1440, height: 900 }, async (page) => {
  const title = unique('E2E 流式会话')
  const text = unique('流式消息')
  await createSession('main', title)
  const frames = []
  const consoleErrors = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', (event) => {
      try {
        frames.push(JSON.parse(String(event.payload)))
      } catch {
        // 非 JSON 帧忽略
      }
    })
  })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await openSession(page, title)
  await sendViaComposer(page, text)
  await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible()
  await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.composer-error')).toHaveCount(0)
  await expect.poll(() => frames.filter((frame) => frame.type === 'reply.delta').length, { timeout: 20_000 }).toBeGreaterThan(0)
  await expect.poll(() => frames.filter((frame) => frame.type === 'reply.done').length, { timeout: 20_000 }).toBeGreaterThan(0)
  expect(consoleErrors.filter((line) => !line.includes('favicon'))).toEqual([])
})

// 03 / E2E-COMPOSER-001
scenario('03 Enter/Shift+Enter 与反转模式', { width: 1440, height: 900 }, async (page) => {
  const title = unique('E2E 键盘会话')
  const session = await createSession('main', title)
  const firstLine = unique('第一行')
  await seedChat(session.id, unique('预热消息'))
  await openSession(page, title)
  const box = page.locator('textarea[aria-label="消息输入框"]')
  await box.click()

  await box.fill(firstLine)
  await box.press('Shift+Enter')
  await page.keyboard.type('第二行')
  await expect(box).toHaveValue(new RegExp(`${firstLine}\\n第二行`))

  await box.press('Enter')
  await expect(box).toHaveValue('', { timeout: 15_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: firstLine })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.composer-error')).toHaveCount(0)

  const modeButton = page.locator('.composer-hint-icon')
  await modeButton.click()
  await expect(modeButton).toHaveAttribute('aria-pressed', 'true')

  const thirdLine = unique('反转模式')
  await box.fill(thirdLine)
  await box.press('Enter')
  await expect(box).toHaveValue(new RegExp(`${thirdLine}\\n`))
  await expect(page.locator('.msg.from-user').filter({ hasText: thirdLine })).toHaveCount(0)

  await box.press('Shift+Enter')
  await expect(box).toHaveValue('', { timeout: 15_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: thirdLine })).toBeVisible({ timeout: 15_000 })
})

// 04a / E2E-ANCESTOR-001
scenario('04a FE-007 逐级加载、时间轴增长、prepend 锚定', { width: 1600, height: 800 }, async (page) => {
  // 子会话必须有足够消息产生真实滚动，否则 scrollTop 会被夹到 0，
  // 测到的是“贴底”状态，加载祖先自然会被 auto-scroll 到底部。
  const chain = await seedChain(24)
  await openSessionViaWorkbench(page, chain.childTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
  await expect(page.locator('.tlg-session')).toHaveCount(1)
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
  // 多消息时首条可能已在视口外，这里只断言存在，不断言可见。
  await expect(page.locator('.msg.from-user').filter({ hasText: '当前消息 01' })).toHaveCount(1)

  // 等启动时的自动滚底 rAF 结束，再手动设置滚动位置。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const scroller = page.locator('.conversation-scroll')
  await expect.poll(async () => scroller.evaluate((element) => element.scrollHeight - element.clientHeight), {
    message: '子会话消息不足以产生滚动，无法验证 prepend 锚定',
  }).toBeGreaterThan(0)
  await scroller.evaluate((element) => {
    element.scrollTop = 260
  })
  const scrollState = await scroller.evaluate((element) => ({
    top: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  expect(scrollState.scrollHeight, '子会话应可滚动').toBeGreaterThan(scrollState.clientHeight)
  expect(scrollState.top, 'scrollTop=260 应生效（未被夹到 0）').toBeGreaterThan(0)
  const anchor = await page.evaluate(() => {
    const box = document.querySelector('.conversation-scroll')
    if (!box) return null
    const top = box.getBoundingClientRect().top
    const node = [...box.querySelectorAll('.msg')].find((item) => item.getBoundingClientRect().bottom > top + 1)
    if (!node?.dataset.messageId) return null
    return { id: node.dataset.messageId, offset: node.getBoundingClientRect().top - top }
  })
  expect(anchor, '滚动后应能定位到可见消息').not.toBeNull()

  await dispatchClick(page, '.message-top button')
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.tlg-session')).toHaveCount(2)
  const opacity = await page.locator('.tlg-session.is-ancestor-session').first().evaluate((element) => Number(getComputedStyle(element).opacity))
  expect(Math.abs(opacity - 0.55)).toBeLessThan(0.06)
  await expect(page.locator('.message-top button')).toHaveAttribute('title', '主会话')

  // prepend 锚定由 App 的 useLayoutEffect + rAF 恢复；等两帧布局稳定再测量。
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const afterOffset = anchor ? await messageOffsetInScroller(page, anchor.id) : null
  expect(afterOffset, '加载上级后锚定消息仍应存在').not.toBeNull()
  expect(Math.abs((afterOffset ?? 0) - (anchor?.offset ?? 0))).toBeLessThanOrEqual(1)

  await dispatchClick(page, '.message-top button')
  await expect(page.locator('.tlg-session')).toHaveCount(3, { timeout: 15_000 })
  await expect(page.locator('.message-top button')).toHaveCount(0)

  await page.locator('.session-row', { has: page.locator('.session-title', { hasText: chain.parentTitle }) }).first().click()
  await expect(page.locator('.context-title h1')).toHaveText(chain.parentTitle)
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
})

// 04b / E2E-ANCESTOR-001
scenario('04b FE-007 413 显示错误且不插入祖先消息', { width: 1440, height: 900 }, async (page) => {
  const chain = await seedChain(1)
  await page.route(/\/api\/sessions\/[^/]+\/messages\?scope=all/, (route) =>
    route.fulfill({ status: 413, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'messages_too_many' }) }),
  )
  await openSessionViaWorkbench(page, chain.childTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
  await expect(page.locator('.msg').first()).toBeVisible()
  const before = await page.locator('.msg').count()
  await page.locator('.message-top button').click()
  await expect(page.locator('.err-text[role="alert"]')).toHaveText('消息过多，暂不能完整加载', { timeout: 15_000 })
  expect(await page.locator('.msg').count()).toBe(before)
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
})

// 04c / E2E-ANCESTOR-001
scenario('04c FE-007 403 显示无权限', { width: 1440, height: 900 }, async (page) => {
  const chain = await seedChain(1)
  await page.route(/\/api\/sessions\/[^/]+\/messages\?scope=all/, (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'forbidden' }) }),
  )
  await openSessionViaWorkbench(page, chain.childTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
  await expect(page.locator('.msg').first()).toBeVisible()
  await page.locator('.message-top button').click()
  await expect(page.locator('.err-text[role="alert"]')).toHaveText('无权读取该上级会话', { timeout: 15_000 })
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
})

// 04d / E2E-ANCESTOR-001
scenario('04d FE-007 空上级提示并允许继续向上', { width: 1440, height: 900 }, async (page) => {
  const suffix = unique('E2E 空上级')
  const parent = await createSession(null, `${suffix} 上级`)
  const childTitle = `${suffix} 当前`
  const child = await createSession(parent.id, childTitle)
  await seedChat(child.id, `${suffix} 当前消息`)
  await openSessionViaWorkbench(page, childTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible()
  await expect(page.locator('.msg').first()).toBeVisible()
  const before = await page.locator('.msg').count()
  await page.locator('.message-top button').click()
  await expect(page.locator('.err-text[role="alert"]')).toContainText('上级没有消息', { timeout: 15_000 })
  expect(await page.locator('.msg').count()).toBe(before)
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(0)
  await expect(page.locator('.message-top button')).toHaveAttribute('title', '主会话')

  await page.locator('.message-top button').click()
  await expect(page.locator('.message-top button')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.locator('.tlg-session.is-ancestor-session')).toHaveCount(1)
  expect((await getMessages(child.id)).length).toBeGreaterThan(0)
})

// 05 / E2E-ERROR-001
scenario('05 消息接口 500 错误态与重试恢复', { width: 1440, height: 900 }, async (page) => {
  const title = unique('E2E 重试会话')
  const text = unique('重试消息')
  const session = await createSession('main', title)
  await seedChat(session.id, text)

  let failTarget = true
  await page.route(/\/api\/messages\?sessionId=/, async (route) => {
    const url = new URL(route.request().url())
    const isTarget = url.searchParams.get('sessionId') === session.id
    if (isTarget && failTarget) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) })
      return
    }
    await route.continue()
  })

  await gotoHome(page)
  const row = page.locator('.session-row', { has: page.locator('.session-title', { hasText: title }) })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.state-error[role="alert"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.state-error[role="alert"]')).toContainText('消息加载失败')

  failTarget = false
  await page.unroute(/\/api\/messages\?sessionId=/)
  await page.locator('.state-error[role="alert"] button', { hasText: '重试' }).click()
  await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.state-error[role="alert"]')).toHaveCount(0)
})

// 06 / E2E-OVERVIEW-001
scenario('06 右栏任务点击定位并高亮消息', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 任务定位')
  const taskText = `帮我整理一份周报 ${unique('定位')}`
  const session = await createSession('main', title)
  await postChat(session.id, taskText)

  const task = await waitForTaskDone(session.id, '周报')
  expect(task.status).toBe('done')
  const projection = await waitForProjectionTask(session.id, task.id)
  const projected = [...projection.tasks.done.items, ...projection.tasks.running.items, ...projection.tasks.pending.items].find(
    (item) => item.id === task.id,
  )
  expect(projected?.title).toContain('周报')

  await openSession(page, title)
  await expect(page.locator('.inspector[aria-label="会话概览"]')).toBeVisible()
  const taskRow = page.locator('.exec-row.task-row', { hasText: task.title }).first()
  await expect(taskRow).toBeVisible({ timeout: 20_000 })
  await taskRow.click()
  const flash = page.locator('.msg.is-flash').first()
  await expect(flash).toBeVisible({ timeout: 10_000 })
  const flashText = await flash.innerText()
  const flashTaskId = await flash.getAttribute('data-task-id')
  expect(flashText.includes('周报') || flashTaskId === task.id).toBeTruthy()
})

// 07 / E2E-DELIVERABLE-001
scenario('07 交付物右栏/工作台可见并真实下载', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 下载会话')
  const session = await createSession('main', title)
  const deliverable = await seedDeliverable(session.id)
  expect(deliverable.downloadUrl, '交付物应带 downloadUrl').toBeTruthy()

  await openSession(page, title)
  const inspectorLine = page.locator('.inspector .deliverable-line', { hasText: 'mock-write.txt' }).first()
  await expect(inspectorLine).toBeVisible({ timeout: 20_000 })

  await switchToWorkbench(page)
  const line = page.locator('.deliverable-line', { hasText: 'mock-write.txt' }).first()
  await expect(line).toBeVisible({ timeout: 20_000 })

  const downloadPromise = page.waitForEvent('download', { timeout: 20_000 })
  await line.locator('a.download-link').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toContain('mock-write.txt')
  expect(await download.failure()).toBeNull()
  const path = await download.path()
  expect(path, '下载文件应落盘').toBeTruthy()
  expect(readFileSync(path, 'utf8')).toBe('TODO\n')
}, { oos: true })

// 08 / E2E-CONV-NEW — 新建会话走懒草稿：本地行 + 空态 + 首条消息落库物化
scenario('08 新建会话空态与首条消息物化', { width: 1600, height: 1000 }, async (page) => {
  const seedTitle = unique('E2E 新建前置')
  const seed = await createSession('main', seedTitle)
  await seedChat(seed.id, unique('新建前置消息'))

  await gotoHome(page)
  await sessionRow(page, seedTitle).first().click()
  await expect(page.locator('.context-title h1')).toHaveText(seedTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 15_000 })

  const sessionsBefore = (await listAllSessions()).length
  const rowsBefore = await page.locator('.session-row').count()

  await page.locator('button[aria-label="新建会话"]').first().click()
  await expect(page.locator('.context-title h1')).toHaveText('新会话')
  await expect(page.locator('.conversation-panel.is-empty')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.overview-empty b').first()).toHaveText('开始和司墨对话')
  // 注意：EmptyState 的结构是 .overview-empty > span.overview-empty-mark(装饰点) + div > span(description)
  await expect(page.locator('.overview-empty div > span').first()).toContainText('说需求、记信息、派任务')
  await expect(page.locator('.overview-empty button', { hasText: '发送第一条消息' })).toBeVisible()
  await expect(page.locator('.session-row')).toHaveCount(rowsBefore + 1)
  // 懒草稿只在本地内存，会话树里还没有它（首条消息才物化）
  expect((await listAllSessions()).length, '空草稿不应立即落库').toBe(sessionsBefore)

  await page.locator('.overview-empty button', { hasText: '发送第一条消息' }).click()
  await expect(page.locator('textarea[aria-label="消息输入框"]')).toBeFocused()

  const firstText = unique('草稿首条消息')
  await sendViaComposer(page, firstText)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: firstText })).toBeVisible()
  await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.context-title h1')).toHaveText('新会话')
  await expect.poll(async () => (await listAllSessions()).length, {
    timeout: 15_000,
    message: '首条消息后草稿应物化为真实会话',
  }).toBe(sessionsBefore + 1)
  await expect(page.locator('.session-row', { has: page.locator('.session-title', { hasText: '新会话' }) })).toHaveCount(1)
})

// 09 / E2E-CONV-RENAME — 重命名四态：空值不提交、Escape 取消、Enter 提交、blur 提交
scenario('09 重命名 Enter/Escape/空值/blur 与持久化', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 重命名原')
  const session = await createSession('main', title)
  await seedChat(session.id, unique('重命名预热消息'))
  await gotoHome(page)
  const row = sessionRow(page, title).first()
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  const input = page.locator('input.session-rename')

  // 空值：关闭编辑但不提交
  await row.dblclick()
  await expect(input).toBeVisible()
  await input.fill('   ')
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  expect((await findSessionById(session.id))?.title, '空标题不应提交').toBe(title)

  // Escape：取消编辑，不提交
  await row.dblclick()
  await expect(input).toBeVisible()
  await input.fill(unique('应被丢弃的标题'))
  await input.press('Escape')
  await expect(input).toHaveCount(0)
  expect((await findSessionById(session.id))?.title, 'Escape 不应提交').toBe(title)
  await expect(page.locator('.context-title h1')).toHaveText(title)

  // Enter 提交：API 持久化 + 侧栏/标题同步
  const renamed = unique('E2E 重命名落库')
  await row.dblclick()
  await input.fill(renamed)
  await input.press('Enter')
  await expect(input).toHaveCount(0)
  await expect.poll(async () => (await findSessionById(session.id))?.title, { timeout: 15_000 }).toBe(renamed)
  await expect(page.locator('.context-title h1')).toHaveText(renamed)
  await expect(sessionRow(page, renamed)).toHaveCount(1)
  await expect(sessionRow(page, title)).toHaveCount(0)

  // blur 提交
  const blurred = unique('E2E 失焦落库')
  await sessionRow(page, renamed).first().dblclick()
  await input.fill(blurred)
  await page.locator('.context-title h1').click()
  await expect.poll(async () => (await findSessionById(session.id))?.title, { timeout: 15_000 }).toBe(blurred)
  await expect(page.locator('.context-title h1')).toHaveText(blurred)
  await expect(sessionRow(page, blurred)).toHaveCount(1)
})

// 10 / E2E-CONV-ARCHIVE — 归档、显示归档、只读与恢复
scenario('10 归档、显示归档、只读与恢复', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 归档会话')
  const warm = unique('归档前消息')
  const session = await createSession('main', title)
  await seedChat(session.id, warm)
  await gotoHome(page)
  const row = sessionRow(page, title).first()
  await row.click()
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.msg.from-user').filter({ hasText: warm })).toBeVisible()

  await row.locator('.session-more').click()
  await expect(page.locator('.session-menu')).toBeVisible()
  await expect(page.locator('.session-menu button')).toHaveText('归档')
  await page.locator('.session-menu button').click()
  await expect.poll(async () => (await findSessionById(session.id))?.archived, { timeout: 15_000 }).toBe(1)
  // 默认列表隐藏归档会话，但当前会话仍是它（只读）
  await expect(sessionRow(page, title)).toHaveCount(0)
  await expect(page.locator('.context-title h1')).toHaveText(title)
  await expect(page.locator('.context-title .badge', { hasText: '已归档' })).toBeVisible()
  const box = page.locator('textarea[aria-label="消息输入框"]')
  await expect(box).toBeDisabled()
  await expect(page.locator('.msg.from-user').filter({ hasText: warm })).toBeVisible()

  // 显示归档 → 归档行带 is-archived
  const toggle = page.locator('.side-label button', { hasText: '显示归档' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const archivedRow = page.locator('.session-row.is-archived', { has: page.locator('.session-title', { hasText: title }) })
  await expect(archivedRow).toHaveCount(1)

  // 恢复
  await archivedRow.locator('.session-more').click()
  await expect(page.locator('.session-menu button')).toHaveText('恢复')
  await page.locator('.session-menu button').click()
  await expect.poll(async () => (await findSessionById(session.id))?.archived, { timeout: 15_000 }).toBe(0)
  await expect(page.locator('.context-title .badge', { hasText: '已归档' })).toHaveCount(0)
  await expect(box).toBeEnabled()
  await expect(page.locator('.session-row.is-archived')).toHaveCount(0)
  await expect(sessionRow(page, title)).toHaveCount(1)

  // 关闭显示归档，默认列表仍可见
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(sessionRow(page, title)).toHaveCount(1)

  // 恢复后可继续发消息
  const after = unique('恢复后消息')
  await sendViaComposer(page, after)
  await expect(page.locator('.msg.from-user').filter({ hasText: after })).toBeVisible({ timeout: 20_000 })
})

// 11 / E2E-CONV-SWITCH — 会话切换与消息隔离
scenario('11 会话切换与消息隔离', { width: 1600, height: 1000 }, async (page) => {
  const aTitle = unique('E2E 切换甲')
  const bTitle = unique('E2E 切换乙')
  const aText = unique('甲会话专属消息')
  const bText = unique('乙会话专属消息')
  const a = await createSession('main', aTitle)
  const b = await createSession('main', bTitle)
  await seedChat(a.id, aText)
  await seedChat(b.id, bText)

  await gotoHome(page)
  await sessionRow(page, aTitle).first().click()
  await expect(page.locator('.context-title h1')).toHaveText(aTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: aText })).toBeVisible()
  await expect(page.locator('.msg.from-user').filter({ hasText: bText })).toHaveCount(0)
  await expect(page.locator('.tlg-session')).toHaveCount(1)
  await expect(page.locator('.tlg-session.is-current-session')).toHaveAttribute('aria-label', `当前会话：${aTitle}`)

  await sessionRow(page, bTitle).first().click()
  await expect(page.locator('.context-title h1')).toHaveText(bTitle)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: bText })).toBeVisible()
  await expect(page.locator('.msg.from-user').filter({ hasText: aText })).toHaveCount(0)

  await sessionRow(page, aTitle).first().click()
  await expect(page.locator('.context-title h1')).toHaveText(aTitle)
  await expect(page.locator('.msg.from-user').filter({ hasText: aText })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.msg.from-user').filter({ hasText: bText })).toHaveCount(0)
  await expect(page.locator('.tlg-session')).toHaveCount(1)

  const aMessages = await getMessages(a.id)
  const bMessages = await getMessages(b.id)
  expect(aMessages.some((message) => message.text.includes(aText)), '甲会话应含甲消息').toBe(true)
  expect(aMessages.some((message) => message.text.includes(bText)), '甲会话不应含乙消息').toBe(false)
  expect(bMessages.some((message) => message.text.includes(bText)), '乙会话应含乙消息').toBe(true)
  expect(bMessages.some((message) => message.text.includes(aText)), '乙会话不应含甲消息').toBe(false)
})

// 12 / E2E-CONV-SCROLL — 长消息滚动、回到底部与时间轴跳转
scenario('12 长消息滚动、回到底部与时间轴跳转', { width: 1600, height: 900 }, async (page) => {
  const title = unique('E2E 长滚动会话')
  const session = await createSession('main', title)
  const total = 16
  for (let index = 0; index < total; index += 1) {
    await seedChat(session.id, `${title} 长消息 ${String(index + 1).padStart(2, '0')}`)
  }
  await openSession(page, title)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 15_000 })
  const scroller = page.locator('.conversation-scroll')
  await expect.poll(async () => scroller.evaluate((element) => element.scrollHeight - element.clientHeight), {
    message: '长会话应可滚动',
  }).toBeGreaterThan(0)
  await expect.poll(async () => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight), {
    message: '首屏应贴底',
  }).toBeLessThan(4)

  const messageCount = await page.locator('.conversation-scroll .msg').count()
  expect(messageCount).toBeGreaterThanOrEqual(total * 2)
  await expect(page.locator('.tl-bar')).toHaveCount(messageCount)

  // 滚到顶部 → 出现「回到底部」且时间轴标记唯一当前项
  await scroller.evaluate((element) => { element.scrollTop = 0 })
  await expect(page.locator('.jump-bottom')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.jump-bottom')).toContainText('回到底部')
  await expect(page.locator('.tl-bar[aria-current="true"]')).toHaveCount(1)

  // 时间轴跳转到第 11 条消息：滚到视口顶部
  const targetId = await page.locator('.conversation-scroll .msg').nth(10).getAttribute('data-message-id')
  await page.locator('.tl-bar').nth(10).click()
  await expect.poll(async () => {
    const offset = targetId ? await messageOffsetInScroller(page, targetId) : null
    return offset === null ? null : Math.abs(offset)
  }, { message: '时间轴点击应把目标消息滚到视口顶部' }).toBeLessThan(4)
  await expect(page.locator('.tl-bar[aria-current="true"]')).toHaveCount(1)
  await expect(page.locator('.tl-bar.is-current')).toHaveCount(1)

  // 回到底部
  await page.locator('.jump-bottom').click()
  await expect.poll(async () => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(4)
  await expect(page.locator('.jump-bottom')).toHaveCount(0)

  // 跳到首条：滚回顶部并再次出现「回到底部」
  await page.locator('.tl-bar').first().click()
  await expect(page.locator('.conversation-scroll .msg').first()).toBeInViewport()
  await expect(page.locator('.jump-bottom')).toBeVisible()
})

// 13 / E2E-CONV-TABS — 多标签：active 会话、发送模式与 WS 实时同步
scenario('13 多标签 active 会话、发送模式与 WS 同步', { width: 1440, height: 900 }, async (page, context) => {
  const title = unique('E2E 多标签会话')
  const session = await createSession('main', title)
  await seedChat(session.id, unique('多标签预热消息'))

  const tabB = await openSecondTab(context)
  try {
    await gotoHome(page)
    await gotoHome(tabB)
    // 等 B 的首次 active 广播落定，避免「A 的点击早于 B 的初始发布」这种竞态
    await sleep(400)

    // A 切会话 → B 通过 BroadcastChannel 跟随
    await sessionRow(page, title).first().click()
    await expect(page.locator('.context-title h1')).toHaveText(title)
    await expect(tabB.locator('.context-title h1')).toHaveText(title, { timeout: 15_000 })

    // A 发消息 → B 通过 WS 实时收到
    const text = unique('跨标签实时消息')
    await sendViaComposer(page, text)
    await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible({ timeout: 20_000 })
    await expect(tabB.locator('.msg.from-user').filter({ hasText: text })).toBeVisible({ timeout: 20_000 })

    // A 切换发送模式 → B 同步
    await page.locator('.composer-hint-icon').click()
    await expect(page.locator('.composer-hint-icon')).toHaveAttribute('aria-pressed', 'true')
    await expect(tabB.locator('.composer-hint-icon')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

    // B 在反转模式下 Enter 只换行、不发送
    const boxB = tabB.locator('textarea[aria-label="消息输入框"]')
    await boxB.click()
    await boxB.fill(unique('反转模式换行'))
    const beforeCount = await tabB.locator('.msg.from-user').count()
    await boxB.press('Enter')
    await expect(boxB).toHaveValue(/\n$/)
    expect(await tabB.locator('.msg.from-user').count(), '反转模式下 Enter 不应发送').toBe(beforeCount)

    // B Shift+Enter 发送 → A 通过 WS 收到
    const reply = unique('跨标签回复消息')
    await boxB.fill(reply)
    await boxB.press('Shift+Enter')
    await expect(tabB.locator('.msg.from-user').filter({ hasText: reply })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.msg.from-user').filter({ hasText: reply })).toBeVisible({ timeout: 20_000 })
  } finally {
    await tabB.close()
  }
})

// 14 / E2E-CONV-SEARCH — 会话搜索：标题命中、消息命中与无匹配空态
scenario('14 会话搜索标题/消息命中与无匹配空态', { width: 1600, height: 1000 }, async (page) => {
  const titleToken = unique('标题令牌')
  const msgToken = unique('正文令牌')
  const aTitle = `E2E 搜索甲 ${titleToken}`
  const bTitle = unique('E2E 搜索乙')
  const a = await createSession('main', aTitle)
  const b = await createSession('main', bTitle)
  await seedChat(a.id, unique('搜索预热甲'))
  // 前端 searchMessages 不传 sessionId，服务端按默认会话 main 过滤，因此正文命中种子放 main
  await seedChat('main', `主会话正文包含 ${msgToken}`)
  await seedChat(b.id, unique('搜索预热乙'))

  await gotoHome(page)
  const search = page.locator('input[aria-label="搜索会话"]')
  const rowA = sessionRow(page, aTitle)
  const rowB = sessionRow(page, bTitle)
  const rowMain = sessionRow(page, '主会话')

  // 标题命中（客户端过滤，跨会话）
  await search.fill(titleToken)
  await expect(rowA).toHaveCount(1, { timeout: 15_000 })
  await expect(rowB).toHaveCount(0)

  // 正文命中（服务端 /api/messages/search 结果按 sessionId 命中）
  await search.fill(msgToken)
  await expect(rowMain).toHaveCount(1, { timeout: 15_000 })
  await expect(rowA).toHaveCount(0)
  await expect(page.locator('.side-empty')).toHaveCount(0)

  // 无匹配空态
  await search.fill(unique('绝无匹配令牌'))
  await expect(page.locator('.side-empty')).toHaveText('没有匹配的会话', { timeout: 15_000 })

  // 清空恢复
  await search.fill('')
  await expect(page.locator('.side-empty')).toHaveCount(0)
  await expect(rowA).toHaveCount(1)
  await expect(rowB).toHaveCount(1)
})

// 15 / E2E-CONV-LIST-ERROR — 会话列表加载失败与重试恢复
scenario('15 会话列表加载失败与重试恢复', { width: 1600, height: 1000 }, async (page) => {
  const title = unique('E2E 列表重试')
  const session = await createSession('main', title)
  await seedChat(session.id, unique('列表重试预热'))

  let failTree = true
  await page.route(/\/api\/sessions\/tree/, async (route) => {
    if (!failTree) { await route.continue(); return }
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) })
  })

  await gotoHome(page)
  const sidebarError = page.locator('.sidebar .state-error[role="alert"]')
  await expect(sidebarError).toBeVisible({ timeout: 15_000 })
  await expect(sidebarError).toContainText('会话加载失败')
  await expect(sidebarError).toContainText('请求失败（500）')
  await expect(page.locator('.session-row')).toHaveCount(0)
  await expect(page.locator('.sidebar .state-loading')).toHaveCount(0)

  failTree = false
  await sidebarError.locator('button').click()
  await expect(sessionRow(page, title)).toHaveCount(1, { timeout: 15_000 })
  await expect(sidebarError).toHaveCount(0)

  // 刷新按钮同样从真实接口取数，且不再出现错误态
  await page.locator('button[aria-label="刷新会话"]').click()
  await expect(sessionRow(page, title)).toHaveCount(1)
  await expect(page.locator('.sidebar .state-error')).toHaveCount(0)
})

// 16 / E2E-CONV-SEND-ERROR — 发送失败提示且不假落库，恢复后重发成功
scenario('16 发送失败提示且不假落库，恢复后重发成功', { width: 1440, height: 900 }, async (page) => {
  const title = unique('E2E 发送失败')
  const session = await createSession('main', title)
  await seedChat(session.id, unique('发送失败预热'))
  await openSession(page, title)
  await expect(page.locator('.conversation-panel.is-ready')).toBeVisible({ timeout: 15_000 })

  let failChat = true
  await page.route(/\/api\/chat$/, async (route) => {
    if (!failChat) { await route.continue(); return }
    await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) })
  })

  const text = unique('发送失败消息')
  await sendViaComposer(page, text)
  const composerError = page.locator('.composer-error[role="alert"]')
  await expect(composerError).toBeVisible({ timeout: 15_000 })
  await expect(composerError).toHaveText('请求失败（502），请稍后重试')
  await expect(page.locator('.msg.from-user').filter({ hasText: text })).toHaveCount(0)
  const messagesAfterFailure = await getMessages(session.id)
  expect(messagesAfterFailure.some((message) => message.text.includes(text)), '失败的发送不应落库').toBe(false)

  failChat = false
  await page.unroute(/\/api\/chat$/)
  await sendViaComposer(page, text)
  await expect(page.locator('.msg.from-user').filter({ hasText: text })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.msg.from-agent').filter({ hasText: 'Mock 模型' }).first()).toBeVisible({ timeout: 20_000 })
  await expect(composerError).toHaveCount(0)
})

async function run() {
  mkdirSync(REPORT_DIR, { recursive: true })
  await startApi()

  const browser = await chromium.connectOverCDP(CDP_URL)
  console.log(`[cdp] connected: ${CDP_URL} version=${browser.version()}`)

  // P1-CONV 范围：07（工作台交付物，P2 冻结）默认不跑，只有显式 E2E_INCLUDE_OOS=1 才执行。
  // 跳过项在报告里标 SKIPPED，绝不混进 passed。
  const selected = INCLUDE_OOS ? suite : suite.filter((item) => !item.oos)
  const skippedOos = (INCLUDE_OOS ? [] : suite.filter((item) => item.oos)).map((item) => item.name)
  if (skippedOos.length > 0) {
    console.log(`[cdp] skip out-of-scope: ${skippedOos.join(', ')} (E2E_INCLUDE_OOS=1 to include)`)
  }

  for (const item of selected) {
    const startedAt = Date.now()
    let page
    try {
      const context = await browser.newContext({
        acceptDownloads: true,
        viewport: item.viewport,
      })
      await context.addInitScript(() => {
        try {
          localStorage.removeItem('simo.composer.sendMode')
        } catch {
          // ignore
        }
      })
      page = await context.newPage()
      page.setDefaultTimeout(15_000)
      await item.fn(page, context)
      results.push({ name: item.name, ok: true, durationMs: Date.now() - startedAt })
      console.log(`PASS ${item.name} (${Date.now() - startedAt}ms)`)
      await context.close()
    } catch (error) {
      const durationMs = Date.now() - startedAt
      const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
      results.push({ name: item.name, ok: false, durationMs, error: message })
      console.log(`FAIL ${item.name} (${durationMs}ms): ${message.split('\n')[0]}`)
      if (page) {
        const shot = join(REPORT_DIR, `${item.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '_')}.png`)
        try {
          await page.screenshot({ path: shot, fullPage: true })
          console.log(`[cdp] screenshot: ${shot}`)
        } catch (shotError) {
          console.log(`[cdp] screenshot failed: ${shotError.message}`)
        }
      }
    }
  }

  const passed = results.filter((result) => result.ok).length
  const failed = results.length - passed
  writeFileSync(
    join(REPORT_DIR, 'results.json'),
    `${JSON.stringify({
      cdpUrl: CDP_URL,
      apiBase: API_BASE,
      scope: 'P1-CONV',
      includeOos: INCLUDE_OOS,
      inScope: selected.length,
      passed,
      failed,
      skippedOos,
      total: results.length,
      results,
    }, null, 2)}\n`,
  )
  const lines = [
    '# CDP E2E 运行结果',
    '',
    `- CDP: ${CDP_URL}`,
    `- API: ${API_BASE}`,
    '- 范围: P1-CONV（会话/对话）',
    `- 时间: ${new Date().toISOString()}`,
    `- 结果: ${passed}/${results.length} passed, ${failed} failed`,
    `- 跳过（P2 冻结，非本范围）: ${skippedOos.length > 0 ? skippedOos.join('、') : '无'}`,
    '',
    '| 场景 | 结果 | 耗时(ms) |',
    '|---|---|---|',
    ...results.map((result) => `| ${result.name} | ${result.ok ? 'PASS' : 'FAIL'} | ${result.durationMs} |`),
    ...skippedOos.map((name) => `| ${name} | SKIPPED (OOS) | - |`),
  ]
  if (failed > 0) {
    lines.push('', '## 失败原因', '')
    for (const result of results.filter((item) => !item.ok)) {
      lines.push('### ' + result.name, '', '```', result.error, '```', '')
    }
  }
  writeFileSync(join(REPORT_DIR, 'summary.md'), lines.join('\n'))
  console.log(`[cdp] RESULT ${passed}/${results.length} passed, ${failed} failed; report=${REPORT_DIR}`)

  // Do not call browser.close(): the CDP endpoint belongs to the caller/environment.
  await stopApi()
  process.exit(failed === 0 ? 0 : 1)
}

run().catch(async (error) => {
  console.error(`[cdp] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  await stopApi()
  process.exit(1)
})
