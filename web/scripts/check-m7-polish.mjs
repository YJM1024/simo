#!/usr/bin/env node
// scripts/check-m7-polish.mjs —— M7 通知打扰预算/三速反馈/可访问性 纯逻辑 + 源码约束自测
//
// 覆盖：
//   - platform/notifications.ts：仅三类通知、去重上限、关闭、自动消失时长；
//   - features/chat/feedback.ts：三速阶段、文案、键盘映射、定时器清理；
//   - 源码约束：focus-visible / reduced-motion / aria-live / 焦点陷阱 / 跳过链接 /
//     无第三方 UI 库 / 不出现 Spec 概念。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export {
  normalizeNotification, pushNotification, dismissNotification, autoDismissMs,
  notifyKindLabel, notifyKindTone, MAX_NOTIFICATIONS, NOTIFY_KINDS,
} from ${JSON.stringify(resolve(src, 'platform/notifications.ts'))}
export {
  phaseForElapsed, feedbackLabel, feedbackAnnouncement, composerIntent,
  shouldShowFeedback, clearFeedbackTimers, ACK_WINDOW_MS, THINKING_WINDOW_MS,
} from ${JSON.stringify(resolve(src, 'features/chat/feedback.ts'))}
`

const result = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})
const output = result.outputFiles?.[0]
if (!output) {
  console.error('✖ 无法生成测试模块（esbuild 未输出）')
  process.exit(1)
}
const mod = await import(`data:text/javascript;base64,${Buffer.from(output.text).toString('base64')}`)

let passed = 0
let failed = 0
function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ✔ ${name}`)
  } catch (error) {
    failed += 1
    console.error(`  ✖ ${name}`)
    console.error(`    ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log('M7 打磨自测（通知/三速反馈/可访问性/源码约束）')

// ---- 1. 通知打扰预算 ----
check('只允许三类通知：task-done / approval / error', () => {
  assert.deepEqual([...mod.NOTIFY_KINDS], ['task-done', 'approval', 'error'])
  assert.equal(mod.normalizeNotification({ kind: 'info', title: 'x' }), null)
  assert.equal(mod.normalizeNotification({ kind: 'task-done', title: '' }), null)
  assert.equal(mod.normalizeNotification(null), null)
  const item = mod.normalizeNotification({ kind: 'task-done', title: '任务完成', detail: '报告已生成', id: 't1' }, 1000)
  assert.equal(item?.kind, 'task-done')
  assert.equal(item?.key, 'task-done:t1')
  assert.equal(item?.at, 1000)
})

check('通知上限/去重/关闭', () => {
  let list = []
  for (let index = 0; index < 6; index += 1) {
    list = mod.pushNotification(list, mod.normalizeNotification({ kind: 'error', title: `e${index}`, id: `i${index}` }, index))
  }
  assert.equal(list.length, mod.MAX_NOTIFICATIONS)
  assert.equal(list[0].title, 'e5') // 新通知置顶
  // 同 id 去重（保留最新并置顶）
  const again = mod.pushNotification(list, mod.normalizeNotification({ kind: 'error', title: 'e3-new', id: 'i3' }, 100))
  assert.equal(again.filter((item) => item.key === 'error:i3').length, 1)
  assert.equal(again[0].key, 'error:i3')
  // 关闭
  const dismissed = mod.dismissNotification(again, 'error:i3')
  assert.equal(dismissed.some((item) => item.key === 'error:i3'), false)
  assert.equal(dismissed.length, again.length - 1)
})

check('自动消失：任务完成 6s、错误 10s、审批不自动消失', () => {
  assert.equal(mod.autoDismissMs('task-done'), 6000)
  assert.equal(mod.autoDismissMs('error'), 10000)
  assert.equal(mod.autoDismissMs('approval'), null)
  assert.equal(mod.notifyKindLabel('approval'), '需要确认')
  assert.equal(mod.notifyKindTone('task-done'), 'ok')
  assert.equal(mod.notifyKindTone('approval'), 'warn')
  assert.equal(mod.notifyKindTone('error'), 'danger')
})

// ---- 2. 三速反馈 ----
check('三速阶段：<500ms 语义确认 → 1–3s 首内容 → 较久提示', () => {
  assert.equal(mod.ACK_WINDOW_MS, 500)
  assert.equal(mod.THINKING_WINDOW_MS, 2600)
  assert.equal(mod.phaseForElapsed(0), 'ack')
  assert.equal(mod.phaseForElapsed(499), 'ack')
  assert.equal(mod.phaseForElapsed(500), 'thinking')
  assert.equal(mod.phaseForElapsed(2599), 'thinking')
  assert.equal(mod.phaseForElapsed(2600), 'slow')
  assert.equal(mod.phaseForElapsed(-1), 'idle')
  assert.equal(mod.phaseForElapsed(Number.NaN), 'idle')
})

check('反馈文案存在且不含「排队/假死」类措辞', () => {
  for (const phase of ['ack', 'thinking', 'slow']) {
    const label = mod.feedbackLabel(phase)
    assert.ok(label.length > 0, `${phase} 文案为空`)
    assert.equal(/排队|假死|请等待/.test(label), false)
    assert.ok(mod.feedbackAnnouncement(phase).length > 0)
  }
  assert.equal(mod.feedbackLabel('idle'), '')
  assert.equal(mod.shouldShowFeedback('ack', false), true)
  assert.equal(mod.shouldShowFeedback('ack', true), false) // 已有流式内容时不重复提示
  assert.equal(mod.shouldShowFeedback('idle', false), false)
})

check('键盘映射：Enter 发送 / Shift+Enter 换行 / 输入法组词不发送', () => {
  assert.equal(mod.composerIntent('Enter', false, false), 'send')
  assert.equal(mod.composerIntent('Enter', true, false), 'newline')
  assert.equal(mod.composerIntent('Enter', false, true), 'ignore')
  assert.equal(mod.composerIntent('a', false, false), 'ignore')
  assert.equal(mod.composerIntent('Escape', false, false), 'ignore')
})

check('三速定时器可清理（切换会话/收到首帧）', () => {
  let cleared = 0
  const timers = {
    thinking: setTimeout(() => {}, 10_000),
    slow: setTimeout(() => {}, 10_000),
  }
  clearTimeout(timers.thinking)
  clearTimeout(timers.slow)
  timers.thinking = null
  timers.slow = null
  mod.clearFeedbackTimers(timers)
  assert.equal(timers.thinking, null)
  assert.equal(timers.slow, null)
  cleared += 1
  assert.equal(cleared, 1)
})

// ---- 3. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const read = (path) => readFileSync(path, 'utf8')
const styles = read(resolve(src, 'styles.css'))
const appTsx = read(resolve(src, 'app/App.tsx'))
const hostTsx = read(resolve(src, 'app/NotificationHost.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const memoryPage = read(resolve(src, 'features/memory/MemoryPage.tsx'))
const taskDetail = read(resolve(src, 'features/tasks/TaskDetail.tsx'))

check('焦点环 + reduced-motion 在全局样式中', () => {
  assert.match(styles, /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s)
  assert.match(styles, /@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  assert.match(styles, /scroll-behavior:\s*auto/)
})

check('aria-live / aria-busy / role=log 流式区域', () => {
  assert.match(messageList, /role="log"/)
  assert.match(messageList, /aria-live="polite"/)
  assert.match(messageList, /aria-busy=/)
  assert.match(messageList, /司墨正在思考/)
  assert.match(hostTsx, /aria-live="polite"/)
  assert.match(hostTsx, /pointer-events-none/)
  assert.match(appTsx, /<NotificationHost\s*\/>/)
})

check('焦点陷阱用于两个弹层；Composer 有标签/描述/跳过链接', () => {
  assert.match(memoryPage, /useFocusTrap\(/)
  assert.match(taskDetail, /useFocusTrap\(/)
  assert.match(composer, /id="composer"/)
  assert.match(composer, /aria-describedby="composer-hint"/)
  assert.match(appTsx, /href="#composer"/)
  assert.match(appTsx, /跳到输入框/)
})

check('不引入第三方 UI 组件库', () => {
  const packageJson = JSON.parse(read(resolve(root, 'package.json')))
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
  const files = collect(src, /\.(ts|tsx)$/)
  const forbidden = [/from ['"]antd['"]/, /from ['"]@mui\//, /from ['"]@chakra-ui\//, /from ['"]semantic-ui/]
  for (const file of files) {
    const text = read(file)
    for (const pattern of forbidden) {
      assert.equal(pattern.test(text), false, `${file} 引入了第三方 UI 库`)
    }
  }
})

check('前端源码不出现 Spec / 规格 / 验收标准 概念', () => {
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const forbidden = /Spec|规格|验收标准/g
  const offenders = []
  for (const file of files) {
    const matches = [...read(file).matchAll(forbidden)]
    if (matches.length > 0) offenders.push(`${file.replace(`${src}\\`, '')} (${matches.length})`)
  }
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
