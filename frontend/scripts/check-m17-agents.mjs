#!/usr/bin/env node
// scripts/check-m17-agents.mjs —— M17 智能体页面 + 会话负责人/消息处理者头像
//
// 覆盖：
//   - platform/agents：GET /api/agents 归一化（包装/裸数组/snake/tools 对象/去重/颜色形状兜底）、
//     内置示例、findAgent 兜底、会话负责人确定性兜底、目录缓存/降级标记；
//   - ChatMessage.agentId 归一化（HTTP/WS）；
//   - 源码约束：左栏「智能体」入口 + 页面字段（名称/角色/人格/工具/模型/图标）、后端未就绪降级提示；
//     会话树负责人头像、消息处理者头像复用 AgentAvatar；主题 token 无硬编码颜色；门禁链/无 Spec。

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'platform/agents.ts'))}
export { toChatMessage } from ${JSON.stringify(resolve(src, 'platform/types.ts'))}
`
const built = await build({
  stdin: { contents: entry, resolveDir: here, loader: 'ts' },
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

console.log('M17 智能体页面 / 头像自测（前端）')

check('GET /api/agents 归一化：包装/裸数组/snake/tools 对象/去重', () => {
  const wrapped = mod.normalizeAgents({
    ok: true,
    agents: [
      { id: 'simo', name: '司墨', role: '主理人', persona: '统筹需求', tools: ['对话', { name: '任务编排' }], model: 'DeepSeek V3', icon: '墨', tone: 'accent', shape: 'round' },
      { agent_id: 'researcher', name: '研究员', summary: '查资料', capabilities: [{ id: 'web_search' }], model: 'V3' },
      { id: 'simo', name: '重复' },
      { name: '无 id' },
    ],
  })
  assert.equal(wrapped.length, 2)
  assert.equal(wrapped[0].name, '司墨')
  assert.deepEqual(wrapped[0].tools, ['对话', '任务编排'])
  assert.equal(wrapped[1].id, 'researcher')
  assert.equal(wrapped[1].persona, '查资料')
  assert.deepEqual(wrapped[1].tools, ['web_search'])
  assert.equal(mod.normalizeAgents([{ id: 'a', name: 'A' }]).length, 1)
  assert.equal(mod.normalizeAgents(null).length, 0)
})

check('归一化兜底：颜色/形状按序、icon 首字、模型缺省', () => {
  const agents = mod.normalizeAgents([
    { id: 'a', name: '阿尔法' },
    { id: 'b', name: '贝塔', tone: 'weird', shape: 'weird' },
  ])
  assert.equal(agents[0].tone, 'accent')
  assert.equal(agents[1].tone, 'ok')
  assert.equal(agents[0].shape, 'round')
  assert.equal(agents[1].shape, 'soft')
  assert.equal(agents[0].icon, '阿')
  assert.equal(agents[0].model, '—')
  assert.equal(agents[0].role, '智能体')
})

check('内置示例：默认负责人司墨 + 四种人格字段完整', () => {
  assert.ok(mod.BUILTIN_AGENTS.length >= 4)
  const simo = mod.BUILTIN_AGENTS.find((agent) => agent.id === mod.DEFAULT_AGENT_ID)
  assert.ok(simo)
  assert.equal(simo.name, '司墨')
  assert.ok(simo.persona.length > 0)
  assert.ok(simo.tools.length > 0)
  for (const agent of mod.BUILTIN_AGENTS) {
    assert.ok(agent.name && agent.role && agent.persona && agent.model && agent.icon)
    assert.ok(['accent', 'ok', 'warn', 'danger', 'muted'].includes(agent.tone))
    assert.ok(['round', 'soft', 'square'].includes(agent.shape))
  }
})

check('findAgent：精确命中/内置兜底/默认司墨', () => {
  const agents = mod.normalizeAgents([{ id: 'x', name: 'X' }])
  assert.equal(mod.findAgent(agents, 'x').name, 'X')
  assert.equal(mod.findAgent(agents, 'researcher').name, '研究员')
  assert.equal(mod.findAgent(agents, 'unknown').id, mod.DEFAULT_AGENT_ID)
  assert.equal(mod.findAgent([], 'researcher').name, '研究员')
})

check('会话负责人兜底：主会话→司墨、确定性、非主会话在其他人格中', () => {
  assert.equal(mod.fallbackOwnerForSession('main'), mod.DEFAULT_AGENT_ID)
  assert.equal(mod.fallbackOwnerForSession('root'), mod.DEFAULT_AGENT_ID)
  const first = mod.fallbackOwnerForSession('child-abc')
  assert.equal(first, mod.fallbackOwnerForSession('child-abc'))
  const known = new Set(mod.BUILTIN_AGENTS.map((agent) => agent.id))
  assert.ok(known.has(first))
  const owners = new Set(['child-1', 'child-2', 'child-3', 'child-4', 'child-5'].map((id) => mod.fallbackOwnerForSession(id)))
  assert.ok(owners.size >= 2, '不同会话应能散列到不同负责人')
})

check('会话树/消息类型：SessionNode.agentId 与 ChatMessage.agentId 归一化', () => {
  // ChatMessage（WS/HTTP 复用）
  const message = mod.toChatMessage({ id: 'm1', role: 'agent', text: 'x', agentId: 'researcher' })
  assert.equal(message.agentId, 'researcher')
  const snake = mod.toChatMessage({ id: 'm2', role: 'agent', text: 'x', agent_id: 'builder' })
  assert.equal(snake.agentId, 'builder')
  assert.equal(mod.toChatMessage({ id: 'm3', role: 'user', text: 'x' }).agentId, undefined)
})

// ---- 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const registry = read(resolve(src, 'features/registry.ts'))
const manifest = read(resolve(src, 'features/agents/manifest.ts'))
const entryFile = read(resolve(src, 'features/agents/AgentsMainView.tsx'))
const page = read(resolve(src, 'features/agents/AgentsPage.tsx'))
const avatar = read(resolve(src, 'platform/AgentAvatar.tsx'))
const sessionPanel = read(resolve(src, 'features/sessions/SessionTreePanel.tsx'))
const sessionModel = read(resolve(src, 'features/sessions/model.ts'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('M40 顶部「智能体」内嵌视图 + 注册', () => {
  assert.match(manifest, /mainView/)
  assert.match(registry, /agentsFeature/)
  assert.match(entryFile, /embedded/)
  assert.match(entryFile, /NAV_CLOSED/)
})

check('智能体页面字段：名称/角色/人格/工具/模型/图标 + 降级提示', () => {
  assert.match(page, /agent\.name/)
  assert.match(page, /agent\.role/)
  assert.match(page, /agent\.persona/)
  assert.match(page, /agent\.tools/)
  assert.match(page, /V4\.1 Flash/)
  assert.match(page, /AgentAvatar/)
  assert.match(page, /内置示例/)
  assert.match(page, /来自后端/)
  assert.match(page, /loadAgents\(true\)/)
  assert.match(page, /只读/)
})

check('头像组件：圆形 30/24、深色助手底、主题 token、可访问性', () => {
  assert.match(avatar, /TONE_CLASS/)
  assert.match(avatar, /SHAPE_CLASS/)
  assert.match(avatar, /rounded-full/)
  assert.match(avatar, /h-\[30px\] w-\[30px\]/)
  assert.match(avatar, /bg-avatar-agent-bg text-avatar-agent-ink/)
  assert.equal(/self-start/.test(avatar), false)
  assert.match(avatar, /aria-label/)
  assert.equal(/#[0-9a-fA-F]{3,8}/.test(avatar), false)
})

check('会话树负责人头像 + 消息处理者头像复用 AgentAvatar', () => {
  assert.match(sessionPanel, /AgentAvatar/)
  assert.match(sessionPanel, /fallbackOwnerForSession/)
  assert.match(sessionModel, /agentId/)
  assert.match(messageList, /AgentAvatar/)
  assert.match(messageList, /findAgent/)
  assert.match(messageList, /useAgentCatalog/)
  assert.match(messageList, /handler/)
})

check('门禁链包含 check-m17；无第三方库；无 Spec 概念；图标资产仍在', () => {
  assert.match(packageJson.scripts['check'] ?? '', /check-m17-agents\.mjs/)
  assert.ok(existsSync(resolve(root, 'public/icon.svg')))
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
