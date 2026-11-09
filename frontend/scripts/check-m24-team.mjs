#!/usr/bin/env node
// scripts/check-m24-team.mjs —— 团队页 UI（V2 只读）自测
//
// 覆盖：
//   - 成员状态归一化（running/queued/paused/done，旧 active/failed 映射）、进度 0–1/百分比；
//   - 团队/成员/并发/排队原因/模板角色（generic vs template/继承来源）归一化；
//   - 源码：左栏入口、成员列表字段、成员详情（进入会话/任务/产物）、模板空态、WS+轮询、
//     只读（无编辑/写接口）、无内部字段/Spec；门禁链/无第三方。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const built = await build({
  stdin: { contents: `export * from ${JSON.stringify(resolve(src, 'features/team/model.ts'))}`, resolveDir: here, loader: 'ts' },
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
console.log('M24 团队页自测（前端）')

check('成员状态：running/queued/paused/done + 兼容映射', () => {
  assert.equal(mod.normalizeTeamMemberStatus('running'), 'running')
  assert.equal(mod.normalizeTeamMemberStatus('active'), 'running')
  assert.equal(mod.normalizeTeamMemberStatus('pending'), 'queued')
  assert.equal(mod.normalizeTeamMemberStatus('paused'), 'paused')
  assert.equal(mod.normalizeTeamMemberStatus('completed'), 'done')
  assert.equal(mod.normalizeTeamMemberStatus('failed'), 'done')
  assert.equal(mod.normalizeTeamMemberStatus('unknown'), 'queued')
  assert.equal(mod.memberStatusLabel('running'), '执行中')
  assert.equal(mod.memberStatusLabel('queued'), '排队中')
  assert.equal(mod.memberStatusLabel('paused'), '已暂停')
  assert.equal(mod.memberStatusLabel('done'), '已完成')
})

check('进度归一化 0–1 / 百分比 / 空值', () => {
  assert.equal(mod.normalizeProgress(0.4), 0.4)
  assert.equal(mod.normalizeProgress(40), 0.4)
  assert.equal(mod.normalizeProgress(120), 1)
  assert.equal(mod.normalizeProgress(-1), 0)
  assert.equal(mod.normalizeProgress('bad'), null)
  const member = mod.normalizeTeamMember({ id: 'm1', progress: 0.5 }, 0)
  assert.equal(mod.progressPercent(member), 50)
})

check('团队归一化：成员/并发/排队原因/lead/当前任务', () => {
  const team = mod.normalizeTeam({
    team: {
      id: 'team-1',
      name: '交付小组',
      status: 'active',
      leadSessionId: 'main',
      concurrency: { limit: 3, queueReason: '并发已满' },
      members: [
        { id: 'm1', sessionId: 's1', agentId: 'agent:simo', name: '司墨', role: '主理人', status: 'running', current_task: '整理报告', progress: 0.3, isLead: true, leadName: '用户' },
        { id: 'm2', session_id: 's2', agent_id: 'agent:researcher', name: '研究员', status: 'queued', task: '调研', progress: 0 },
      ],
    },
  })
  assert.equal(team.id, 'team-1')
  assert.equal(team.name, '交付小组')
  assert.equal(team.concurrencyLimit, 3)
  assert.equal(team.queueReason, '并发已满')
  assert.equal(team.members.length, 2)
  assert.equal(team.members[0].sessionId, 's1')
  assert.equal(team.members[0].agentId, 'agent:simo')
  assert.equal(team.members[0].status, 'running')
  assert.equal(team.members[0].currentTask, '整理报告')
  assert.equal(team.members[0].isLead, true)
  assert.equal(team.members[0].leadName, '用户')
  assert.equal(team.members[1].sessionId, 's2')
  assert.equal(team.members[1].status, 'queued')
  assert.equal(mod.normalizeTeam(null), null)
})

check('模板角色：通用/模板标记 + 继承来源 + 职责', () => {
  const team = mod.normalizeTeam({
    team: {
      id: 't',
      template: {
        id: 'tpl-1',
        name: '交付模板',
        version: '2',
        inheritsFrom: 'base',
        roles: [
          { role_key: 'researcher', title: '研究员', role_type: 'generic', inherits_from: 'base.researcher', responsibilities: '调研' },
          { key: 'writer', name: '写手', roleType: 'template', personaBase: 'simo' },
        ],
      },
      members: [],
    },
  })
  assert.equal(team.template.roles.length, 2)
  assert.equal(team.template.roles[0].roleType, 'generic')
  assert.equal(mod.roleTypeLabel('generic'), '通用角色')
  assert.equal(team.template.roles[0].inheritsFrom, 'base.researcher')
  assert.equal(team.template.roles[1].roleType, 'template')
  assert.equal(mod.roleTypeLabel('template'), '模板角色')
  assert.equal(team.template.inheritsFrom, 'base')
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
const teamPage = read(resolve(src, 'features/team/TeamPage.tsx'))
const teamEntry = read(resolve(src, 'features/team/TeamMainView.tsx'))
const teamRest = read(resolve(src, 'features/team/rest.ts'))
const teamManifest = read(resolve(src, 'features/team/manifest.ts'))
const registry = read(resolve(src, 'features/registry.ts'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('M40 顶部「团队」内嵌视图 + 成员列表字段/状态/进度/并发/排队', () => {
  assert.match(teamManifest, /mainView/)
  assert.match(registry, /teamFeature/)
  assert.match(teamEntry, /embedded/)
  assert.match(teamEntry, /NAV_CLOSED/)
  assert.match(teamPage, /成员列表/)
  assert.match(teamPage, /AgentAvatar/)
  assert.match(teamPage, /当前任务/)
  assert.match(teamPage, /并发上限/)
  assert.match(teamPage, /排队/)
  assert.match(teamPage, /memberStatusLabel/)
})

check('成员详情：进入会话 + 任务 + 产物', () => {
  assert.match(teamPage, /进入该成员会话/)
  assert.match(teamPage, /SESSION_SELECT/)
  assert.match(teamPage, /getTasks/)
  assert.match(teamPage, /artifacts/)
  assert.match(teamPage, /下载|href=.*artifacts/)
})

check('模板空态/角色清单 + 实时更新（WS+轮询）+ 只读', () => {
  assert.match(teamPage, /还没有团队成员/)
  assert.match(teamPage, /通过对话创建团队/)
  assert.match(teamPage, /roleTypeLabel/)
  assert.match(teamPage, /WS_FRAME/)
  assert.match(teamPage, /setInterval\(\(\) => void load\(\), 8000\)/)
  assert.match(teamPage, /只读/)
  assert.equal(/apiPost|apiPatch|apiDelete|textarea|contentEditable/.test(teamPage), false)
  assert.match(teamRest, /\/api\/sessions\/.*\/team/)
  assert.match(teamRest, /\/api\/team/)
})

check('未就绪降级说明（不伪造）+ 无内部字段', () => {
  assert.match(teamPage, /团队接口尚未就绪/)
  assert.match(teamPage, /不展示示例数据/)
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
  assert.match(packageJson.scripts['check'] ?? '', /check-m24-team\.mjs/)
  const deps = Object.keys(packageJson.dependencies ?? {})
  assert.deepEqual(deps.sort(), ['react', 'react-dom'])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
