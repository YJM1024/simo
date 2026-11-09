#!/usr/bin/env node
// scripts/check-m52.mjs —— M52 页面级美化自测
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
console.log('M52 页面级美化自测（前端）')

const app = read('app/App.tsx')
const taskPanel = read('features/tasks/TaskPanel.tsx')
const planSummary = read('features/tasks/PlanSummary.tsx')
const rightRail = read('features/tasks/RightRail.tsx')
const team = read('features/team/TeamPage.tsx')
const workbench = read('features/workbench/WorkbenchPage.tsx')
const schedules = read('features/schedules/ScheduleManager.tsx')
const sessionTree = read('features/sessions/SessionTreePanel.tsx')
const agents = read('features/agents/AgentsPage.tsx')
const memory = read('features/memory/MemoryBrowserPage.tsx')
const topBar = read('app/TopBar.tsx')
const pkg = JSON.parse(readRoot('package.json'))

check('P0 右栏任务：340 宽、40px 行、单行省略+状态徽标、无调试文案/换行', () => {
  assert.match(app, /const RIGHT_DEFAULT = 340/)
  assert.match(taskPanel, /flex min-h-10 w-full min-w-0.*border-b/)
  assert.match(taskPanel, /min-w-0 flex-1 truncate text-sm/)
  assert.match(taskPanel, /rounded-xs border px-1\.5 py-0\.5 text-\[11px\]/)
  assert.match(taskPanel, /text-\[11px\] text-muted/)
  assert.equal(/任务投影|后端计划接口未就绪|工作流 · 状态分组|>M10</.test(taskPanel), false)
  assert.match(planSummary, /text-xs font-medium text-muted">计划/)
  assert.equal(/任务投影|后端计划接口未就绪|任务列表只读投影/.test(planSummary), false)
})

check('P0 右栏标签/概览：收起态仅图标，无竖排文字', () => {
  assert.equal(/writing-mode:vertical-rl|>任务<|>概览</.test(rightRail), false)
  assert.match(rightRail, /Icon name="task"/)
  assert.match(rightRail, /Icon name="overview"/)
  assert.match(rightRail, /Icon name="pin"/)
})

check('P1 团队空态：单个居中空态 + 创建按钮，模板空态不再叠加', () => {
  assert.match(team, /还没有团队成员/)
  assert.match(team, /通过对话创建团队/)
  assert.match(team, /team\.members\.length > 0 && <TemplateSection/)
  assert.equal(/V2）尚未就绪|模板（V2）/.test(team), false)
})

check('P1 工作台：内容与标题同左缘、max 1000、2 列 16px、卡片等高', () => {
  assert.match(workbench, /w-full max-w-\[1000px\]/)
  assert.equal(/mx-auto w-full max-w-\[60rem\]/.test(workbench), false)
  assert.match(workbench, /items-stretch gap-4/)
  assert.match(workbench, /h-full min-h-\[96px\]/)
})

check('P1 定时任务：已结束/无下次运行、本地时间、标准开关、危险删除 12px', () => {
  assert.match(schedules, /function nextRunText/)
  assert.match(schedules, /已结束/)
  assert.match(schedules, /无下次运行/)
  assert.match(schedules, /formatScheduleTime\(schedule\.nextRunAt\)/)
  assert.match(schedules, /h-5 w-9.*rounded-full/)
  assert.match(schedules, /text-\[12px\] text-danger-ink/)
  assert.equal(/formatScheduleTime\(schedule\.nextRunAt, schedule\.timezone\)/.test(schedules), false)
})

check('P2 侧栏：选中中性灰、状态合并且无重复执行中标签', () => {
  assert.match(sessionTree, /border-border-subtle bg-avatar-bg/)
  assert.match(sessionTree, /进行中 \$\{counts\.active\} · \$\{runningTasks\} 个任务/)
  assert.equal(/执行中\s*<\/span>/.test(sessionTree), false)
  assert.equal(/bg-accent-soft'/.test(sessionTree), false)
})

check('P2 智能体/记忆：模型固定 V4.1 Flash、能力中性；记忆徽标中性', () => {
  assert.match(agents, /V4\.1 Flash/)
  assert.equal(/agent\.model/.test(agents), false)
  assert.match(agents, /rounded-xs border border-border-subtle bg-surface-sunken/)
  assert.match(memory, /rounded-xs border border-border-subtle bg-surface-sunken px-1\.5 text-xs text-muted/)
  assert.equal(/rounded-pill border border-accent-border bg-accent-soft/.test(memory), false)
})

check('设置入口打开设置面板，不落到右栏', () => {
  assert.match(topBar, /WORKBENCH_OPEN, \{ target: 'settings' \}/)
  assert.equal(/设置（从右侧面板\/命令面板进入）/.test(topBar), false)
})

check('门禁链包含 check-m52；无 Spec 内部字段', () => {
  assert.match(pkg.scripts['check'] ?? '', /check-m52\.mjs/)
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
