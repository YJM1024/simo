#!/usr/bin/env node
// scripts/check-m15-reply-brand.mjs —— M15 前端：消息回复引用 + 品牌改名「司墨」+ 品牌图标
//
// 覆盖：
//   - replyTo 快照归一化（HTTP/WS、snake/camel、text≤200）
//   - 回复 UI 源码约束：hover 回复按钮、输入区引用条（Esc 取消）、气泡引用卡片点击跳转、跨会话标题
//   - 品牌：全站用户可见文案统一「司墨」（无 秘书/本地秘书/私默/思默）；顶栏内联 SVG 徽标；
//     public/icon.svg + icon-256.png；favicon；构建复制图标
//   - 门禁链 / 无第三方库 / 无 Spec

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const built = await build({
  stdin: {
    contents: `export { toChatMessage } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}`,
    resolveDir: here,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'silent',
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)

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

const read = (path) => readFileSync(path, 'utf8')
console.log('M15 回复引用 / 品牌改名 / 图标自测（前端）')

// ---- 1. replyTo 归一化 ----
check('replyTo 快照：对象/camel/snake/text≤200', () => {
  const message = mod.toChatMessage({
    id: 'm2',
    role: 'user',
    text: '回复内容',
    replyTo: { id: 'm1', role: 'agent', text: '被引用的消息', sessionId: 'main', sessionTitle: '主会话' },
  })
  assert.equal(message.replyTo.id, 'm1')
  assert.equal(message.replyTo.role, 'agent')
  assert.equal(message.replyTo.text, '被引用的消息')
  assert.equal(message.replyTo.sessionId, 'main')
  assert.equal(message.replyTo.sessionTitle, '主会话')

  const long = mod.toChatMessage({
    id: 'm3',
    role: 'user',
    text: 'x',
    reply_to: { id: 'm0', role: 'user', text: 'a'.repeat(500), session_title: '子会话' },
  })
  assert.ok(long.replyTo.text.length <= 200)
  assert.equal(long.replyTo.sessionTitle, '子会话')

  const plain = mod.toChatMessage({ id: 'm4', role: 'user', text: 'x' })
  assert.equal(plain.replyTo, undefined)
  const bad = mod.toChatMessage({ id: 'm5', role: 'user', text: 'x', replyTo: { role: 'user' } })
  assert.equal(bad.replyTo, undefined)
})

// ---- 2. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const composer = read(resolve(src, 'features/chat/Composer.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const runtime = read(resolve(src, 'features/chat/useChatRuntime.ts'))
const http = read(resolve(src, 'platform/http.ts'))
const wsHub = read(resolve(src, 'platform/ws-hub.ts'))
const topBar = read(resolve(src, 'app/TopBar.tsx'))
const brandMark = read(resolve(src, 'app/BrandMark.tsx'))
const publicIndex = read(resolve(root, 'public/index.html'))
const buildScript = read(resolve(root, 'build.mjs'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('回复入口：hover 回复按钮（agent/user） + aria', () => {
  assert.match(messageList, />\s*引用\s*</)
  assert.match(messageList, /aria-label={`回复这条消息/)
  assert.match(messageList, /group-hover:opacity-100/)
  assert.match(messageList, /onReply=\{onReply\}/)
})

check('输入区引用条：角色+摘要+取消 + Esc', () => {
  assert.match(composer, /正在回复的消息/)
  assert.match(composer, /取消引用/)
  assert.match(composer, /event\.key === 'Escape'/)
  assert.match(composer, /onCancelReply/)
})

check('气泡引用卡片：点击跳转原消息 + 跨会话会话标题', () => {
  assert.match(messageList, /message\.replyTo/)
  assert.match(messageList, /onJumpToMessage\(message\.replyTo\?\.id/)
  assert.match(messageList, /会话：\{message\.replyTo\.sessionTitle\}/)
  assert.match(messageList, /aria-label={`跳到被引用的消息/)
})

check('发送链路：sendChat/postChat 带 replyToMessageId；发送后清空', () => {
  assert.match(wsHub, /replyToMessageId/)
  assert.match(http, /replyToMessageId/)
  assert.match(runtime, /const replyToMessageId = replyToRef\.current\?\.id/)
  assert.match(runtime, /sendChat\(text, attachmentIds, replyToMessageId\)/)
  assert.match(runtime, /postChat\(sessionId, text, attachmentIds, replyToMessageId\)/)
  assert.match(runtime, /setReplyToState\(null\)/)
})

check('品牌：顶栏内联 SVG 徽标 + 文案仅「司墨」', () => {
  assert.match(topBar, /BrandMark/)
  assert.match(topBar, /司墨/)
  assert.equal(/本地/.test(topBar), false)
  assert.match(brandMark, /<svg/)
  assert.match(brandMark, /rx="24"/)
  assert.equal(/linearGradient|feDropShadow/.test(brandMark), false)
  assert.match(brandMark, /aria-label="司墨"/)
})

check('图标资产：public icon.svg/icon-256.png + favicon + 构建复制', () => {
  assert.ok(existsSync(resolve(root, 'public/icon.svg')))
  assert.ok(existsSync(resolve(root, 'public/icon-256.png')))
  assert.match(publicIndex, /rel="icon"/)
  assert.match(publicIndex, /\/icon\.svg/)
  assert.match(buildScript, /icon-256\.png/)
  assert.match(buildScript, /copyStatic/)
})

check('改名：src 中无 秘书/本地秘书/私默/思默 用户可见字样', () => {
  const files = collect(src, /\.(ts|tsx|html|css)$/)
  const offenders = []
  for (const file of files) {
    const text = read(file)
    for (const banned of ['秘书', '本地秘书', '私默', '思默']) {
      if (text.includes(banned)) offenders.push(`${file}: ${banned}`)
    }
  }
  assert.deepEqual(offenders, [])
  // 品牌文案存在
  const all = files.map(read).join('\n')
  assert.ok(all.includes('司墨'))
})

check('门禁链包含 check-m15；无第三方库；无 Spec', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m15-reply-brand\.mjs/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
