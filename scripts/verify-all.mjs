#!/usr/bin/env node
// 单一入口：L0 结构门禁 → 构建 → 清单 → 四层验证 → 变异抽查 → 汇总。
// 用法：node scripts/verify-all.mjs [--only l0,build,backend,frontend,e2e,real,mutation] [--skip ...] [--no-build]
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = path.join(ROOT, 'build')
const LOGS = path.join(ROOT, '.tmp', 'pipeline-build', 'logs')
const TRASH = path.join(ROOT, '.tmp', 'pipeline-build', 'trash')
const GO = path.join(ROOT, 'toolchain', 'go', 'bin', 'go.exe')
const GIT = 'E:\\dsh_home\\tools\\PortableGit\\bin\\git.exe'
const NODE_DIR = path.dirname(process.execPath)
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')
const iso = () => new Date().toISOString()
const rel = (p) => path.relative(ROOT, p).split('\\').join('/')

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : '') : null
}
const listArg = (name) => {
  const v = flag(name)
  return v === null ? null : new Set(v.split(',').map((s) => s.trim()).filter(Boolean))
}
const only = listArg('--only')
const skip = listArg('--skip') ?? new Set()
const noBuild = argv.includes('--no-build')
const ALL = ['l0', 'build', 'backend', 'frontend', 'e2e', 'real', 'mutation']
const selected = (id) => (only ? only.has(id) : true) && !skip.has(id)

/** 只终止本项目测试用的无头 Chrome（profile 在 .tmp/chrome 下），避免端口被上一轮残留占用。 */
function cleanupTestBrowsers() {
  const script = [
    "$root = '" + path.join(ROOT, '.tmp').replace(/'/g, "''") + "'",
    "$killed = @()",
    "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object {",
    "  if ($_.CommandLine -and $_.CommandLine.Contains($root)) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $killed += $_.ProcessId }",
    '}',
    "$killed -join ','",
  ].join('\n')
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 20000 })
  return (r.stdout || '').trim()
}

function env() {
  const goRoot = path.join(ROOT, 'toolchain', 'go')
  return {
    ...process.env,
    PATH: `${NODE_DIR};${path.join(ROOT, 'frontend', 'node_modules', '.bin')};${process.env.PATH}`,
    GOROOT: goRoot,
    GOPATH: path.join(ROOT, 'toolchain', 'gopath'),
    GOCACHE: path.join(ROOT, 'toolchain', 'gocache'),
    TMP: path.join(ROOT, 'toolchain', 'tmp'),
    TEMP: path.join(ROOT, 'toolchain', 'tmp'),
    GOFLAGS: '-mod=mod',
    GOPROXY: 'https://goproxy.cn,direct',
    GOSUMDB: 'off',
  }
}

function run(label, command, args, { cwd = ROOT, timeout = 900000, extraEnv = {} } = {}) {
  fs.mkdirSync(LOGS, { recursive: true })
  const logFile = path.join(LOGS, `${label}.log`)
  const fd = fs.openSync(logFile, 'w')
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...env(), ...extraEnv }, stdio: ['ignore', fd, fd], windowsHide: true })
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore */ } }, timeout)
    child.once('exit', (code) => {
      clearTimeout(timer)
      fs.closeSync(fd)
      const output = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
      resolve({ code: code ?? 1, ms: Date.now() - started, output, log: rel(logFile) })
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      fs.closeSync(fd)
      resolve({ code: 1, ms: Date.now() - started, output: String(error), log: rel(logFile) })
    })
  })
}

function tail(text, n = 6) {
  return text.trim().split(/\r?\n/).slice(-n).join(' | ').slice(0, 900)
}

function replaceDir(src, dest) {
  if (fs.existsSync(dest)) {
    fs.mkdirSync(TRASH, { recursive: true })
    fs.renameSync(dest, path.join(TRASH, `${path.basename(dest)}-${Date.now()}`))
  }
  fs.cpSync(src, dest, { recursive: true })
}

function hashDir(dir) {
  const files = []
  const walk = (cur) => {
    for (const entry of fs.readdirSync(cur, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(rel(path.relative(dir, full)))
    }
  }
  walk(dir)
  const hash = crypto.createHash('sha256')
  for (const name of files.sort()) {
    hash.update(name); hash.update('\0'); hash.update(sha256(fs.readFileSync(path.join(dir, name)))); hash.update('\n')
  }
  return { sha256: hash.digest('hex'), files: files.length }
}

function newestSource(root, filter) {
  let newestMs = 0
  let newestFile = ''
  const visit = (dir) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.tmp', 'dist', 'build', '.git'].includes(entry.name)) continue
        visit(full)
      } else if (filter(full)) {
        const stat = fs.statSync(full)
        if (stat.mtimeMs > newestMs) { newestMs = stat.mtimeMs; newestFile = full }
      }
    }
  }
  visit(root)
  return { newestMs, newestFile: newestFile ? rel(newestFile) : '' }
}

function sourceInventory() {
  return {
    backend: newestSource(path.join(ROOT, 'backend'), (f) => /\.(go|mod|sum)$/.test(f)),
    frontend: newestSource(path.join(ROOT, 'frontend'), (f) => /\.(tsx?|css|html|mjs|json)$/.test(f) && !f.includes(`${path.sep}dist${path.sep}`)),
  }
}

function gitHead() {
  const r = spawnSync(GIT, ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  return r.status === 0 ? r.stdout.trim() : null
}

function buildIdOf(dir) {
  const index = path.join(dir, 'index.html')
  if (!fs.existsSync(index)) return null
  const m = fs.readFileSync(index, 'utf8').match(/name="build-id"\s+content="([^"]+)"/)
  return m ? m[1] : null
}

async function buildAll(row) {
  fs.mkdirSync(path.join(BUILD, 'backend'), { recursive: true })
  const prod = await run('build-backend', GO, ['build', '-trimpath', '-o', path.join(BUILD, 'backend', 'simo.exe'), './cmd/simo'], { cwd: path.join(ROOT, 'backend') })
  if (prod.code !== 0) throw new Error(`后端构建失败：${tail(prod.output)}`)
  const clock = await run('build-testclock', GO, ['build', '-trimpath', '-tags', 'testclock', '-o', path.join(BUILD, 'backend', 'simo-testclock.exe'), './cmd/simo'], { cwd: path.join(ROOT, 'backend') })
  if (clock.code !== 0) throw new Error(`testclock 构建失败：${tail(clock.output)}`)
  const front = await run('build-frontend', process.execPath, ['build.mjs'], { cwd: path.join(ROOT, 'frontend') })
  if (front.code !== 0) throw new Error(`前端构建失败：${tail(front.output)}`)
  replaceDir(path.join(ROOT, 'frontend', 'dist'), path.join(BUILD, 'frontend'))

  const builtAt = iso()
  const prodBytes = fs.readFileSync(path.join(BUILD, 'backend', 'simo.exe'))
  const clockBytes = fs.readFileSync(path.join(BUILD, 'backend', 'simo-testclock.exe'))
  const frontHash = hashDir(path.join(BUILD, 'frontend'))
  const buildId = buildIdOf(path.join(BUILD, 'frontend'))
  if (!buildId) throw new Error('前端产物缺 build-id（build/frontend/index.html 未打标）')
  const manifest = {
    schema: 1,
    builtAt,
    gitHead: gitHead(),
    buildId,
    artifacts: {
      backend: { kind: 'file', path: 'build/backend/simo.exe', bytes: prodBytes.length, sha256: sha256(prodBytes), builtAt },
      testclock: { kind: 'file', path: 'build/backend/simo-testclock.exe', bytes: clockBytes.length, sha256: sha256(clockBytes), builtAt },
      frontend: { kind: 'dir', path: 'build/frontend', files: frontHash.files, sha256: frontHash.sha256, builtAt },
    },
    sources: sourceInventory(),
  }
  fs.writeFileSync(path.join(BUILD, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  row.detail = `buildId ${buildId}；backend ${prodBytes.length}B；testclock ${clockBytes.length}B；frontend ${frontHash.files} 文件`
  return manifest
}

function parseMapping() {
  const file = path.join(ROOT, 'specs', 'features', 'P2-TASK.yaml')
  const text = fs.readFileSync(file, 'utf8')
  const features = []
  const mutations = []
  let section = null
  let cur = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (!line || line.trimStart().startsWith('#')) continue
    if (/^\S/.test(line)) {
      section = line.startsWith('features:') ? 'features' : line.startsWith('mutations:') ? 'mutations' : null
      cur = null
      continue
    }
    const item = line.match(/^  - (\w+):\s*(.*)$/)
    if (item && section) {
      cur = { [item[1]]: strip(item[2]) }
      ;(section === 'features' ? features : mutations).push(cur)
      continue
    }
    if (!cur) continue
    const field = line.match(/^    (\w+):\s*(.*)$/)
    if (field) {
      const [, key, value] = field
      if (value.startsWith('[')) cur[key] = value.replace(/^\[|\]$/g, '').split(',').map((s) => strip(s.trim())).filter(Boolean)
      else if (value) cur[key] = strip(value)
      else cur[key] = []
      continue
    }
    const listItem = line.match(/^      - (.+)$/)
    if (listItem && cur) {
      if (!Array.isArray(cur.scenarios)) cur.scenarios = []
      cur.scenarios.push(strip(listItem[1]))
    }
  }
  return { file, features, mutations }
}

function strip(v) {
  return String(v).trim().replace(/^['"]|['"]$/g, '')
}

function validateMapping(mapping, { checkScreenshots }) {
  const errors = []
  const covered = new Set()
  for (const feature of mapping.features) {
    if (!feature.featureId || !feature.title) errors.push(`功能点缺 featureId/title：${JSON.stringify(feature)}`)
    if (!Array.isArray(feature.scenarios) || feature.scenarios.length === 0) { errors.push(`${feature.featureId} 没有场景`); continue }
    for (const ac of feature.scenarios) {
      covered.add(ac)
      if (!fs.existsSync(path.join(ROOT, 'scripts', 'ac', `${ac}.mjs`))) errors.push(`${feature.featureId} 的场景缺文件 scripts/ac/${ac}.mjs`)
    }
    if (checkScreenshots) {
      for (const shot of feature.screenshots || []) {
        if (!fs.existsSync(path.join(BUILD, 'evidence', 'screenshots', 'e2e', shot))) errors.push(`${feature.featureId} 的截图缺失 ${shot}`)
      }
    }
  }
  const existing = fs.readdirSync(path.join(ROOT, 'scripts', 'ac')).filter((f) => /^AC-TASK-\d{3}-\d{2}\.mjs$/.test(f)).map((f) => f.replace(/\.mjs$/, ''))
  for (const ac of existing) if (!covered.has(ac)) errors.push(`${ac} 未归并到任何功能点`)
  return { errors, covered: covered.size, total: existing.length }
}

function sqliteUsage(home) {
  const dbFile = path.join(home, 'simo.db')
  if (!fs.existsSync(dbFile)) return { calls: 0, input: 0, output: 0, rows: [] }
  const db = new DatabaseSync(dbFile, { readOnly: true })
  try {
    const events = db.prepare("select id, payload from events where type='usage.recorded' order by id").all()
    const rows = events.map((e) => {
      const p = JSON.parse(e.payload || '{}')
      const u = p.usage || {}
      return { id: e.id, prompt: Number(u.promptTokens || 0), completion: Number(u.completionTokens || 0), model: u.model || '' }
    })
    return { calls: rows.length, input: rows.reduce((a, r) => a + r.prompt, 0), output: rows.reduce((a, r) => a + r.completion, 0), rows }
  } finally { db.close() }
}

async function realLayer(row) {
  const home = path.join(ROOT, '.tmp', 'pipeline-build', 'real-home')
  fs.mkdirSync(home, { recursive: true })
  const cfg = path.join(ROOT, 'backend', 'config.local.json')
  if (!fs.existsSync(cfg)) throw new Error('缺 backend/config.local.json，无法跑真实模型层')
  fs.copyFileSync(cfg, path.join(home, 'config.local.json'))
  const { startBackend, freePort } = await import('./ac/lib/core/bootstrap.mjs')
  const port = freePort(19600)
  const server = await startBackend({ port, home, mode: 'real', timeoutMs: 30000, env: { NO_PROXY: 'api.deepseek.com', no_proxy: 'api.deepseek.com' } })
  const prompts = ['用一个词回答：连通。', '帮我建一个任务：整理本周会议纪要', '列出当前任务']
  const sessionRes = await fetch(`${server.baseUrl}/api/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'P2 真机小样本' }),
  })
  const session = await sessionRes.json()
  const sessionId = session.id || session.session?.id
  if (!sessionId) throw new Error(`创建会话失败：${JSON.stringify(session).slice(0, 200)}`)
  const replies = []
  const baseline = sqliteUsage(home)
  try {
    for (let i = 0; i < prompts.length; i += 1) {
      const before = sqliteUsage(home).calls - baseline.calls
      if (before >= 55) throw new Error(`调用预算将超限（已 ${before} 次），停止真机层`)
      const countAgent = (items) => items.filter((m) => m.role === 'agent' && String(m.text || '').trim()).length
      const beforeItems = (await (await fetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`)).json()).messages || []
      const beforeCount = countAgent(beforeItems)
      const res = await fetch(`${server.baseUrl}/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, text: prompts[i], clientMutationId: `verify-real-${Date.now()}-${i}` }),
      })
      if (![200, 202].includes(res.status)) throw new Error(`第 ${i + 1} 次对话返回 ${res.status}`)
      const deadline = Date.now() + 90000
      let reply = ''
      while (Date.now() < deadline) {
        const list = await (await fetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`)).json()
        const items = list.messages || []
        if (countAgent(items) > beforeCount) {
          reply = items.filter((m) => m.role === 'agent' && String(m.text || '').trim()).map((m) => String(m.text)).pop() || ''
          if (reply) break
        }
        await new Promise((r) => setTimeout(r, 500))
      }
      if (!reply) throw new Error(`第 ${i + 1} 次对话 90 秒内无回复`)
      replies.push(reply.slice(0, 120))
    }
    const usage = sqliteUsage(home)
    const calls = usage.calls - baseline.calls
    const input = usage.input - baseline.input
    const output = usage.output - baseline.output
    if (calls > 60) throw new Error(`真实模型调用 ${calls} 次，超过 60 次上限`)
    row.detail = `真实调用 ${calls} 次；输入 ${input} tok；输出 ${output} tok；回复 ${replies.length}/3`
    row.realCalls = calls
    return { usage: { calls, input, output }, replies }
  } finally {
    await server.stop()
  }
}

async function mutationLayer(row) {
  const mapping = parseMapping()
  const picks = mapping.mutations.slice(0, 3)
  if (picks.length < 3) throw new Error(`映射表里的变异抽查只有 ${picks.length} 条，需要 3 条`)
  const results = []
  for (const mut of picks) {
    const target = path.join(ROOT, mut.target)
    const original = fs.readFileSync(target, 'utf8')
    if (!original.includes(mut.find)) throw new Error(`${mut.id} 的变异点在 ${mut.target} 找不到：${mut.find}`)
    let outcome
    try {
      fs.writeFileSync(target, original.replace(mut.find, mut.replace))
      if (mut.layer === 'backend') {
        outcome = await run(`mut-${mut.id}`, GO, ['test', ...mut.test.split(' '), '-count=1'], { cwd: path.join(ROOT, 'backend'), timeout: 300000 })
      } else {
        outcome = await run(`mut-${mut.id}`, process.execPath, ['node_modules/vitest/vitest.mjs', 'run', mut.test, '--pool=threads', '--maxWorkers=2'], { cwd: path.join(ROOT, 'frontend'), timeout: 300000 })
      }
    } finally {
      fs.writeFileSync(target, original)
    }
    const red = outcome.code !== 0
    const diff = spawnSync(GIT, ['diff', '--quiet', '--', mut.target], { cwd: ROOT, windowsHide: true })
    const restored = fs.readFileSync(target, 'utf8') === original && diff.status === 0
    results.push({ id: mut.id, featureId: mut.featureId, target: mut.target, test: mut.test, status: red ? 'red' : 'green', red, restored, ms: outcome.ms })
    if (!red) throw new Error(`变异抽查未变红：${mut.id} 改坏 ${mut.target} 后 ${mut.test} 仍通过，这条测试是假的`)
    if (!restored) throw new Error(`变异抽查未还原：${mut.target} 与运行前不一致`)
  }
  row.detail = results.map((r) => `${r.id} 红`).join('、')
  row.mutations = results
  return results
}

// L0 结构门禁：只读结构检查先跑，任一失败即整体失败，不进入构建与四层验证。
const L0_CHECKS = [
  ['check-rule-fields', '规则位对照'],
  ['check-points', '需求点四件套'],
  ['check-mapping', 'AC 与测试映射'],
  ['check-archive', '归档完整性'],
]
const l0Results = []
if (selected('l0')) {
  const l0Started = Date.now()
  for (const [id, title] of L0_CHECKS) {
    const result = await run(`l0-${id}`, process.execPath, [path.join('scripts', `${id}.mjs`)], { timeout: 300000 })
    l0Results.push({
      id: `l0-${id}`,
      title,
      status: result.code === 0 ? 'pass' : 'fail',
      code: result.code,
      ms: result.ms,
      log: result.log,
      detail: result.code === 0 ? '通过' : tail(result.output, 6),
    })
    console.log(`[L0] ${id} ${result.code === 0 ? 'PASS' : 'FAIL'}（${(result.ms / 1000).toFixed(1)}s）${result.code === 0 ? '' : `：${tail(result.output, 3)}`}`)
  }
  const red = l0Results.filter((entry) => entry.status === 'fail')
  if (red.length > 0) {
    const report = { at: iso(), stage: 'L0', elapsedMs: Date.now() - l0Started, layers: l0Results }
    fs.mkdirSync(BUILD, { recursive: true })
    fs.writeFileSync(path.join(BUILD, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.error(`L0 结构门禁失败：${red.map((entry) => `${entry.id}（exit ${entry.code}）`).join('；')}；不进入构建与四层验证`)
    process.exit(1)
  }
}

const rows = new Map()
const addRow = (id, title) => { const row = { id, title, status: 'skip', pass: 0, fail: 0, skip: 0, ms: 0, detail: '' }; rows.set(id, row); return row }

const mapping = parseMapping()
const mappingRow = addRow('mapping', '映射表校验')
const scenarioTotal = mapping.features.reduce((n, f) => n + f.scenarios.length, 0)
const mappingCheck = selected('mapping')
  ? validateMapping(mapping, { checkScreenshots: false })
  : { covered: scenarioTotal, total: scenarioTotal, errors: [] }
if (!selected('mapping')) {
  mappingRow.detail = '按参数跳过'
} else if (mappingCheck.errors.length) {
  mappingRow.status = 'fail'; mappingRow.fail = mappingCheck.errors.length; mappingRow.detail = mappingCheck.errors.join('；')
} else {
  mappingRow.status = 'pass'; mappingRow.pass = 1; mappingRow.detail = `${mappingCheck.covered}/${mappingCheck.total} 条 AC 已归并，${mapping.features.length} 个功能点`
}

let manifest = null
const buildRow = addRow('build', '构建与清单')
const backendRow = addRow('backend', '后端单测与集成')
const frontendRow = addRow('frontend', '前端 vitest')
const e2eRow = addRow('e2e', '端到端三档')
const realRow = addRow('real', '真机真实模型')
const mutationRow = addRow('mutation', '变异抽查')

const started = Date.now()
try {
  if (!noBuild && selected('build')) {
    manifest = await buildAll(buildRow)
    buildRow.status = 'pass'; buildRow.pass = 1; buildRow.ms = 0
  } else {
    const { verifyManifest } = await import('./ac/lib/core/bootstrap.mjs')
    const verified = verifyManifest()
    manifest = verified.manifest
    buildRow.status = 'pass'; buildRow.pass = 1; buildRow.detail = noBuild ? '复用现有清单，强制校验通过' : '复用清单'
  }
  buildRow.ms = Date.now() - started
} catch (error) {
  buildRow.status = 'fail'; buildRow.fail = 1; buildRow.detail = error.message; buildRow.ms = Date.now() - started
}

if (buildRow.status === 'pass' && (selected('frontend') || selected('e2e'))) {
  cleanupTestBrowsers()
}

if (selected('backend') && buildRow.status !== 'fail') {
  const t = Date.now()
  const result = await run('test-backend', GO, ['test', './...', '-count=1', '-p', '1'], { cwd: path.join(ROOT, 'backend'), timeout: 900000 })
  backendRow.ms = Date.now() - t
  const fails = (result.output.match(/^FAIL\s+\S+/gm) || []).length
  backendRow.fail = fails; backendRow.pass = result.code === 0 ? 1 : 0
  backendRow.status = result.code === 0 ? 'pass' : 'fail'
  backendRow.detail = result.code === 0 ? 'go test ./... 全绿' : tail(result.output, 8)
  backendRow.log = result.log
}

if (selected('frontend') && buildRow.status !== 'fail') {
  const t = Date.now()
  const result = await run('test-frontend', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--pool=threads', '--maxWorkers=8'], { cwd: path.join(ROOT, 'frontend'), timeout: 600000 })
  frontendRow.ms = Date.now() - t
  const m = result.output.match(/Tests\s+(?:(\d+) failed \| )?(\d+) passed(?:\s*\| (\d+) skipped)?/)
  frontendRow.fail = m ? Number(m[1] ?? 0) : (result.code === 0 ? 0 : 1)
  frontendRow.pass = m ? Number(m[2]) : 0
  frontendRow.skip = m && m[3] ? Number(m[3]) : 0
  frontendRow.status = result.code === 0 ? 'pass' : 'fail'
  frontendRow.detail = result.code === 0 ? `vitest ${frontendRow.pass} passed, ${frontendRow.skip} skipped` : tail(result.output, 8)
  frontendRow.log = result.log
}

if (selected('e2e') && buildRow.status !== 'fail') {
  const t = Date.now()
  const tiers = []
  const full = await run('e2e-1280', process.execPath, ['scripts/run-ac.mjs', '--only', 'AC-TASK-', '--json'], { extraEnv: { AC_VIEWPORT_WIDTH: '1280', AC_VIEWPORT_HEIGHT: '900' }, timeout: 600000 })
  const parse = (out) => {
    const line = out.trim().split(/\r?\n/).filter((l) => l.trim().startsWith('{')).pop()
    try { return JSON.parse(line) } catch { return null }
  }
  const fullJson = parse(full.output)
  tiers.push({ tier: '1280x900', code: full.code, summary: fullJson })
  const small = await run('e2e-small', process.execPath, ['scripts/run-ac.mjs', '--only', 'AC-TASK-001-01,AC-TASK-003-01', '--json'], { extraEnv: { AC_VIEWPORT_WIDTH: '768', AC_VIEWPORT_HEIGHT: '900' }, timeout: 300000 })
  const smallJson = parse(small.output)
  tiers.push({ tier: '768x900', code: small.code, summary: smallJson })
  const narrow = await run('e2e-375', process.execPath, ['scripts/run-ac.mjs', '--only', 'AC-TASK-001-01,AC-TASK-003-01', '--json'], { extraEnv: { AC_VIEWPORT_WIDTH: '375', AC_VIEWPORT_HEIGHT: '812' }, timeout: 300000 })
  const narrowJson = parse(narrow.output)
  tiers.push({ tier: '375x812', code: narrow.code, summary: narrowJson })
  const shots = await run('e2e-shots', process.execPath, ['scripts/ac/lib/core/e2e-shots.mjs'], { timeout: 300000, extraEnv: { AC_CDP_PORT: '9225' } })
  tiers.push({ tier: 'screenshots', code: shots.code, summary: null })

  const failed = tiers.filter((t) => t.code !== 0)
  const checked = validateMapping(mapping, { checkScreenshots: true })
  e2eRow.ms = Date.now() - t
  e2eRow.status = failed.length === 0 && checked.errors.length === 0 && (!selected('mapping') || mappingRow.status === 'pass') ? 'pass' : 'fail'
  e2eRow.fail = failed.length + checked.errors.length
  e2eRow.pass = e2eRow.status === 'pass' ? 1 : 0
  const detail = tiers.map((t) => {
    if (!t.summary) return `${t.tier}:${t.code === 0 ? 'ok' : 'fail'}`
    const c = t.summary.counts || {}
    return `${t.tier}:${c.pass ?? '?'}过/${c.fail ?? '?'}败`
  }).join('，')
  e2eRow.detail = detail + (checked.errors.length ? `；${checked.errors.join('；')}` : '')
  e2eRow.tiers = tiers
  const shotDir = path.join(BUILD, 'evidence', 'screenshots', 'e2e')
  e2eRow.screenshots = fs.existsSync(shotDir) ? fs.readdirSync(shotDir).sort().map((name) => {
    const buf = fs.readFileSync(path.join(shotDir, name))
    return { name, bytes: buf.length, sha256: sha256(buf), artifactBuildId: manifest ? manifest.buildId : null }
  }) : []
  if (mappingRow.status === 'pass' && checked.errors.length) { mappingRow.status = 'fail'; mappingRow.detail = checked.errors.join('；') }
}

if (selected('real') && buildRow.status !== 'fail') {
  const t = Date.now()
  try {
    const result = await realLayer(realRow)
    realRow.status = 'pass'; realRow.pass = 1
    realRow.realCalls = result.usage.calls
  } catch (error) {
    realRow.status = 'fail'; realRow.fail = 1; realRow.detail = error.message
  } finally {
    realRow.ms = Date.now() - t
  }
}

if (selected('mutation') && buildRow.status !== 'fail') {
  const t = Date.now()
  try {
    await mutationLayer(mutationRow)
    mutationRow.status = 'pass'; mutationRow.pass = 3
  } catch (error) {
    mutationRow.status = 'fail'; mutationRow.fail = 1; mutationRow.detail = error.message
  } finally {
    mutationRow.ms = Date.now() - t
  }
}

const elapsed = Date.now() - started
const order = ['build', 'mapping', 'backend', 'frontend', 'e2e', 'real', 'mutation']
const lineRows = order.filter((id) => rows.has(id) && (selected(id) || id === 'mapping' || rows.get(id).status === 'fail')).map((id) => rows.get(id))

const pad = (s, n) => String(s).padEnd(n, ' ')
const table = [
  `${pad('层', 16)}${pad('通过', 6)}${pad('失败', 6)}${pad('跳过', 6)}${pad('耗时', 10)}状态`,
  ...lineRows.map((r) => `${pad(r.title, 16)}${pad(r.pass, 6)}${pad(r.fail, 6)}${pad(r.skip, 6)}${pad(`${(r.ms / 1000).toFixed(1)}s`, 10)}${r.status}`),
].join('\n')
console.log(table)

const report = {
  at: iso(),
  elapsedMs: elapsed,
  manifest: manifest ? { path: 'build/manifest.json', buildId: manifest.buildId, gitHead: manifest.gitHead, artifacts: manifest.artifacts } : null,
  mapping: { features: mapping.features.length, scenarios: mappingCheck.covered, total: mappingCheck.total, errors: mappingCheck.errors },
  layers: lineRows.map((r) => ({ id: r.id, title: r.title, status: r.status, pass: r.pass, fail: r.fail, skip: r.skip, ms: r.ms, detail: r.detail })),
  l0: l0Results.map((entry) => ({ id: entry.id, title: entry.title, status: entry.status, code: entry.code, ms: entry.ms, detail: entry.detail })),
  mutations: mutationRow.mutations || [],
  screenshots: e2eRow.screenshots || [],
  realCalls: realRow.realCalls ?? null,
}
fs.mkdirSync(BUILD, { recursive: true })
fs.writeFileSync(path.join(BUILD, 'report.json'), JSON.stringify(report, null, 2) + '\n')

const failedLayers = lineRows.filter((r) => r.status === 'fail')
console.log(`\n报告：build/report.json；清单：build/manifest.json；截图 ${report.screenshots.length} 张；总耗时 ${(elapsed / 1000).toFixed(1)}s`)
if (failedLayers.length) {
  console.error(`失败层：${failedLayers.map((r) => `${r.id}（${r.detail}）`).join('；')}`)
  process.exit(1)
}
console.log('全部选定层通过')
