#!/usr/bin/env node
// scripts/check-m64.mjs —— M64 布局与 Inspector 断点修复自测
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')
const read = (path) => readFileSync(resolve(src, path), 'utf8')
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8')

let passed = 0
let failed = 0
function check(name, fn) {
  try { fn(); passed += 1; console.log(`  ✔ ${name}`) }
  catch (error) { failed += 1; console.error(`  ✖ ${name}`); console.error(`    ${error instanceof Error ? error.message : String(error)}`) }
}
console.log('M64 布局 / Inspector 断点 / 侧栏自测（前端）')

const chat = read('features/chat/ChatCenter.tsx')
const topBar = read('app/TopBar.tsx')
const permission = read('app/PermissionMenu.tsx')
const session = read('features/sessions/SessionTreePanel.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const app = read('app/App.tsx')
const messageList = read('features/chat/MessageList.tsx')
const historyRail = read('features/chat/HistoryRail.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('范围分段只出现一次；上下文条仅标题/副标题/分段', () => {
  assert.equal((chat.match(/aria-pressed=\{!runtime\.includeChildren\}/g) ?? []).length, 1)
  assert.match(chat, /isRoot \? '主窗口 · 聚合视图'/)
  assert.match(chat, /h-\[42px\] flex-none items-center justify-between/)
  assert.equal(/对话 \/ 轨迹/.test(chat), false)
})

check('任务 pill 留在上下文条右侧；不再有横跨整页的 tab 行', () => {
  assert.match(chat, /个任务进行中/)
  assert.equal(/flex h-8 flex-none items-center justify-between gap-3/.test(chat), false)
})

check('侧栏工作区：名称+环境；新建子会话独立图标按钮；会话小圆点无头像', () => {
  assert.match(session, /主工作区/)
  assert.match(session, /本地环境/)
  assert.match(session, /aria-label="新建子会话"/)
  assert.match(session, /h-1 w-1 flex-none rounded-full/)
  assert.equal(/AgentAvatar/.test(session), false)
  assert.equal(/新建子会话 · 当前会话下/.test(session), false)
})

check('≤1240 Inspector 自动收起为 40px 轨道；展开为覆盖层；聊天列 ≥700', () => {
  assert.match(app, /max-\[1240px\]:grid-cols-\[minmax\(0,1fr\)_40px\]/)
  assert.match(rightRail, /window\.innerWidth > 1240/)
  assert.match(rightRail, /w-10 flex-none border-l/)
  assert.match(rightRail, /max-\[1240px\]:fixed/)
  assert.match(rightRail, /max-\[1240px\]:top-\[96px\]/)
  assert.match(rightRail, /max-\[1240px\]:w-\[min\(90vw,360px\)\]/)
  assert.match(chat, /max-w-\[780px\]/)
})

check('顶栏：≤1240 隐藏权限副文案和连接文字；右侧不换行', () => {
  assert.match(permission, /max-\[1240px\]:hidden/)
  assert.match(permission, /sandboxLabel\(permission\.sandbox\)/)
  assert.match(topBar, /max-\[1240px\]:hidden/)
  assert.match(topBar, /flex flex-none items-center gap-2 whitespace-nowrap/)
})

check('消息 24px 方块与 20px 行盒对齐；时间轴 6px 条/14px 热区', () => {
  assert.match(messageList, /mt-\[-2px\].*h-6 w-6/)
  assert.match(messageList, /mb-1 flex h-5 min-w-0/)
  assert.match(historyRail, /h-3\.5 w-9 flex-none/)
  assert.match(historyRail, /h-1\.5 w-5/)
  assert.match(historyRail, /group-hover:w-\[26px\]/)
})

check('门禁链包含 check-m64；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m64\.mjs/)
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(ts|tsx|css|html)$/.test(entry.name)) files.push(full)
    }
  }
  walk(src)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
