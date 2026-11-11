#!/usr/bin/env node
// scripts/check-m9-permissions.mjs —— M9 权限模式/审批条/工具轨迹纯逻辑 + 源码约束自测
//
// 覆盖：
//   - platform/permissions.ts：默认值、多种包装/别名归一化、文案、full 确认、POST 体；
//   - features/tasks/model.ts：审批扩展（风险/参数原文/路径/提权/justification/策略拒绝）；
//     审批动作（allow_once/allow_session/deny）与标签；
//   - features/chat/toolcalls.ts：工具调用帧归一化、去重上限、状态文案、耗时格式；
//   - 源码约束：顶栏权限 pill/面板、二次确认、审批条三按钮、工具轨迹折叠、无 Spec 概念。

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'src')

const entry = `
export * from ${JSON.stringify(resolve(src, 'platform/permissions.ts'))}
export {
  normalizeApproval, normalizeApprovalList, approvalActionBody, approvalDecisionBody,
  approvalDecisionLabel, approvalRiskLabel, approvalRiskTone,
} from ${JSON.stringify(resolve(src, 'features/tasks/model.ts'))}
export { parseApprovalResolved } from ${JSON.stringify(resolve(src, 'features/tasks/frames.ts'))}
export * from ${JSON.stringify(resolve(src, 'features/chat/toolcalls.ts'))}
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

console.log('M9 权限模式/审批条/工具轨迹自测（前端）')

// ---- 1. 权限模型 ----
check('默认 workspace-write + auto；包装/别名/snake_case 归一化', () => {
  assert.deepEqual(mod.normalizePermission(null), { sandbox: 'workspace-write', approval: 'auto' })
  assert.deepEqual(mod.normalizePermission({ sandbox: 'read-only', approval: 'never' }), {
    sandbox: 'read-only',
    approval: 'never',
  })
  assert.deepEqual(mod.normalizePermission({ permissions: { sandboxMode: 'danger-full-access', approvalPolicy: 'ask' } }), {
    sandbox: 'danger-full-access',
    approval: 'ask',
  })
  assert.deepEqual(mod.normalizePermission({ sandbox_mode: 'read_only', approval_policy: 'auto' }), {
    sandbox: 'read-only',
    approval: 'auto',
  })
  assert.deepEqual(mod.normalizePermission({ mode: 'full', policy: 'never' }), {
    sandbox: 'danger-full-access',
    approval: 'never',
  })
})

check('权限文案 / 危险判定 / 摘要', () => {
  assert.equal(mod.sandboxLabel('workspace-write'), '工作区可写')
  assert.equal(mod.sandboxLabel('danger-full-access'), '完全访问')
  assert.equal(mod.approvalLabel('auto'), '自动通过只读')
  assert.equal(mod.approvalLabel('never'), '不询问（拒绝高风险）')
  assert.equal(mod.isDangerousMode('danger-full-access'), true)
  assert.equal(mod.isDangerousMode('workspace-write'), false)
  assert.equal(mod.permissionSummary({ sandbox: 'read-only', approval: 'ask' }), '只读 · 每次询问')
  assert.ok(mod.sandboxDescription('read-only').includes('禁止执行'))
})

check('切 full 需二次确认；POST 体带确认标记', () => {
  const current = { sandbox: 'workspace-write', approval: 'auto' }
  const full = { sandbox: 'danger-full-access', approval: 'auto' }
  assert.equal(mod.needsFullAccessConfirmation(current, full), true)
  assert.equal(mod.needsFullAccessConfirmation(full, full), false)
  assert.equal(mod.needsFullAccessConfirmation(current, { sandbox: 'read-only', approval: 'auto' }), false)
  const body = mod.permissionUpdateBody(full, { confirmedFullAccess: true })
  assert.equal(body.sandbox, 'danger-full-access')
  assert.equal(body.confirm, true)
  assert.equal(body.confirmDangerFullAccess, true)
  const safeBody = mod.permissionUpdateBody(current, { confirmedFullAccess: false })
  assert.equal('confirm' in safeBody, false)
})

check('WS 权限变更帧解析 + 比较', () => {
  assert.deepEqual(mod.readPermissionPair({ sandbox: 'read-only', approvalPolicy: 'never' }), {
    sandbox: 'read-only',
    approval: 'never',
  })
  assert.equal(mod.readPermissionPair({}), null)
  assert.equal(mod.samePermission({ sandbox: 'read-only', approval: 'ask' }, { sandbox: 'read-only', approval: 'ask' }), true)
  assert.equal(mod.samePermission({ sandbox: 'read-only', approval: 'ask' }, { sandbox: 'read-only', approval: 'never' }), false)
})

// ---- 2. 审批扩展 ----
const rawApproval = {
  id: 'appr-1',
  tool: 'pwsh',
  args: JSON.stringify({
    command: 'Get-ChildItem -Recurse',
    file_path: 'workspace/reports',
    sandbox_permissions: 'danger-full-access',
    justification: '需要读取 workspace 外的资料',
  }),
  status: 'pending',
  risk: 'execute',
  sandbox: 'workspace-write',
  createdAt: 1794020000000,
}

check('审批归一化：风险/参数原文/命令/路径/提权/justification', () => {
  const approval = mod.normalizeApproval(rawApproval)
  assert.equal(approval.id, 'appr-1')
  assert.equal(approval.kind, 'pwsh')
  assert.equal(approval.title, 'pwsh')
  assert.equal(approval.risk, 'execute')
  assert.ok(approval.argsRaw.includes('Get-ChildItem'))
  assert.deepEqual(approval.impactPaths, ['workspace/reports'])
  assert.equal(approval.requiresElevation, true)
  assert.equal(approval.requestedSandbox, 'danger-full-access')
  assert.equal(approval.justification, '需要读取 workspace 外的资料')
  assert.equal(approval.policyDenied, false)
})

check('风险推导：read/glob/grep→read，write/edit→write，pwsh→execute', () => {
  const read = mod.normalizeApproval({ id: 'a', tool: 'read_file', args: '{}', status: 'pending' })
  assert.equal(read.risk, 'read')
  assert.equal(read.kind, 'read_file')
  const write = mod.normalizeApproval({ id: 'b', tool: 'write', args: '{}', status: 'pending' })
  assert.equal(write.risk, 'write')
  const exec = mod.normalizeApproval({ id: 'c', tool: 'pwsh', args: '{}', status: 'pending' })
  assert.equal(exec.risk, 'execute')
  assert.equal(mod.approvalRiskLabel('execute'), '执行')
  assert.equal(mod.approvalRiskTone('execute'), 'danger')
  // 后端 M9 用 R0–R4 风险等级
  assert.equal(mod.approvalRiskLabel('R1'), '写')
  assert.equal(mod.approvalRiskLabel('r2'), '执行')
  assert.equal(mod.approvalRiskLabel('R4'), '高危')
  assert.equal(mod.approvalRiskTone('R4'), 'danger')
  assert.equal(mod.approvalRiskTone('R0'), 'ok')
})

check('审批动作：allow_once / allow_session / deny + 旧兼容', () => {
  assert.deepEqual(mod.approvalActionBody('allow_once'), { decision: 'allow_once', approved: true, action: 'allow_once' })
  assert.deepEqual(mod.approvalActionBody('allow_session'), { decision: 'allow_session', approved: true, action: 'allow_session' })
  assert.deepEqual(mod.approvalActionBody('deny'), { decision: 'deny', approved: false, action: 'deny' })
  assert.equal(mod.approvalDecisionLabel('allow_once'), '允许一次')
  assert.equal(mod.approvalDecisionLabel('allow_session'), '本会话允许')
  assert.deepEqual(mod.approvalDecisionBody('approve'), { decision: 'allow', approved: true, action: 'allow' })
})

check('never 策略拒绝：denied + policy/never/fail-closed → 已按策略拒绝', () => {
  const denied = mod.normalizeApproval({
    id: 'appr-policy',
    tool: 'pwsh',
    args: JSON.stringify({ command: 'Remove-Item -Recurse workspace/x' }),
    status: 'denied',
    decision: 'policy',
  })
  assert.equal(denied.policyDenied, true)
  const deniedByReason = mod.normalizeApproval({
    id: 'appr-policy-2',
    tool: 'write',
    args: '{}',
    status: 'denied',
    reason: 'denied by policy (never)',
  })
  assert.equal(deniedByReason.policyDenied, true)
  const normalDeny = mod.normalizeApproval({ id: 'appr-deny', tool: 'write', args: '{}', status: 'denied', decision: 'deny' })
  assert.equal(normalDeny.policyDenied, false)
  // approval.resolved 帧同样识别
  const frame = mod.parseApprovalResolved({ id: 'appr-policy', status: 'denied', decision: 'policy', tool: 'pwsh' })
  assert.equal(frame.policyDenied, true)
  assert.equal(frame.tool, 'pwsh')
})

check('审批列表归一化：混合形状 + 坏条目', () => {
  const list = mod.normalizeApprovalList({ approvals: [rawApproval, { tool: 'read', args: '{}' }, null] })
  assert.equal(list.length, 1)
  const list2 = mod.normalizeApprovalList({ approvals: [{ id: 'x', tool: 'write', args: '{}' }] })
  assert.equal(list2.length, 1)
  assert.equal(list2[0].impactPaths.length, 0)
})

// ---- 3. 工具调用轨迹 ----
check('工具调用归一化：旧名映射/状态/耗时/参数摘要', () => {
  const call = mod.normalizeToolCall({
    id: 'call-1',
    tool: 'read_file',
    status: 'done',
    durationMs: 12,
    args: { file_path: 'workspace/a.md' },
  })
  assert.equal(call.tool, 'read')
  assert.equal(call.status, 'done')
  assert.equal(call.durationMs, 12)
  assert.equal(call.argsSummary, 'workspace/a.md')
  assert.equal(mod.toolStatusLabel(call), '成功')
  const exec = mod.normalizeToolCall({ tool: 'pwsh', status: 'running', args: { command: 'echo hi' } })
  assert.equal(exec.argsSummary, 'echo hi')
  assert.equal(mod.toolStatusLabel(exec), '进行中')
})

check('策略拒绝/失败/提权的状态文案', () => {
  const policy = mod.normalizeToolCall({ tool: 'pwsh', status: 'denied', reason: 'fail-closed by policy never' })
  assert.equal(policy.policyDenied, true)
  assert.equal(mod.toolStatusLabel(policy), '已按策略拒绝')
  assert.equal(mod.toolStatusTone(policy), 'danger')
  const failed = mod.normalizeToolCall({ tool: 'write', status: 'failed', error: 'denied by user' })
  assert.equal(mod.toolStatusLabel(failed), '失败')
  const escalated = mod.normalizeToolCall({ tool: 'write', status: 'done', sandbox_permissions: 'workspace-write' })
  assert.equal(escalated.escalated, true)
})

check('工具调用去重/上限/耗时格式', () => {
  let calls = []
  for (let index = 0; index < 10; index += 1) {
    calls = mod.upsertToolCall(calls, mod.normalizeToolCall({ id: `c${index}`, tool: 'read', status: 'done' }, index), 4)
  }
  assert.equal(calls.length, 4)
  assert.equal(calls[0].id, 'c9')
  calls = mod.upsertToolCall(calls, mod.normalizeToolCall({ id: 'c9', tool: 'read', status: 'failed', durationMs: 30 }, 100), 4)
  assert.equal(calls.filter((call) => call.id === 'c9').length, 1)
  assert.equal(calls.find((call) => call.id === 'c9').status, 'failed')
  assert.equal(mod.formatDuration(12), '12ms')
  assert.equal(mod.formatDuration(1500), '1.5s')
  assert.equal(mod.formatDuration(null), '')
})

// ---- 4. 源码约束 ----
function collect(dir, pattern, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collect(full, pattern, out)
    else if (pattern.test(entry.name)) out.push(full)
  }
  return out
}
const read = (path) => readFileSync(path, 'utf8')
const permissionMenu = read(resolve(src, 'app/PermissionMenu.tsx'))
const topBar = read(resolve(src, 'app/ShellHeader.tsx'))
const approvalBar = read(resolve(src, 'features/tasks/ApprovalBar.tsx'))
const messageList = read(resolve(src, 'features/chat/MessageList.tsx'))
const packageJson = JSON.parse(read(resolve(root, 'package.json')))

check('顶栏权限 pill + 切换面板 + full 二次确认（源码约束）', () => {
  assert.match(topBar, /<PermissionMenu/)
  assert.match(permissionMenu, /aria-haspopup="dialog"/)
  assert.match(permissionMenu, /aria-expanded=/)
  assert.match(permissionMenu, /role="alertdialog"/)
  assert.match(permissionMenu, /确认切换到「完全访问」/)
  assert.match(permissionMenu, /确认切换/)
  assert.match(permissionMenu, /needsConfirm\(next\)/)
})

check('审批条：风险/命令原文/影响范围/提权/三按钮（源码约束）', () => {
  assert.match(approvalBar, /风险 · /)
  assert.match(approvalBar, /参数原文/)
  assert.match(approvalBar, /影响范围/)
  assert.match(approvalBar, /申请提权/)
  assert.match(approvalBar, /justification/)
  assert.match(approvalBar, /允许一次/)
  assert.match(approvalBar, /本会话允许/)
  assert.match(approvalBar, /已按策略拒绝/)
})

check('工具调用轨迹折叠展示；check:m9 已加入门禁链', () => {
  assert.match(messageList, /<ToolCallsPanel calls=\{toolCalls\}/)
  assert.match(messageList, /最近工具调用/)
  assert.match(packageJson.scripts['check'] ?? '', /check-m9-permissions\.mjs/)
})

check('前端源码不出现 Spec / 规格 / 验收标准 概念', () => {
  const files = collect(src, /\.(ts|tsx|css|html)$/)
  const offenders = files.filter((file) => /Spec|规格|验收标准/.test(read(file)))
  assert.deepEqual(offenders, [])
})

console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
if (failed > 0) process.exit(1)
