#!/usr/bin/env node
/**
 * 规则级命令已移交 ai-review（MOXIAN 对应执行行注明“该脚本为批处理入口，不支持单跑”）；
 * 本脚本作为整套门禁运行，不再解析 --rule。
 * check-incremental-coverage.mjs — 增量覆盖率门禁（零依赖，只读）
 *
 * 依据 docs/framework/GATES.md 第 3.5 节。输入是本次改动涉及的文件清单，逐项判断
 * 源文件有没有测试映射；映射缺失按 error，覆盖率阈值与报告缺失按 warn。
 *
 * 已实现的规则（脚本内规则号沿用 GATES 的 MX-G 编号）：
 *   MX-G-32（warn/待补）生成改动清单。支持三种来源：命令行文件参数、--changed-files
 *           清单文件、--from-git（git diff 加工作区改动与未跟踪文件）。三者都不可用时
 *           退出码 2，不把空清单当通过。
 *   MX-G-33（error/warn）每个源文件必须有测试映射。映射按以下顺序判定：
 *           1. 同目录同名测试文件（card.tsx 对应 card.test.tsx、card.spec.ts 等）；
 *           2. 同目录 __tests__ 下的同名测试；
 *           3. 后端同目录任意 *_test.go（同包测试）；
 *           4. 测试文件中的引用（import 路径出现在 *.test.*、*_test.go、
 *              frontend/e2e/*.mjs 的引号内说明符中）；
 *           5. scripts/ac/ 下的 AC 断言脚本引用该源文件的路径或文件名；
 *           6. test-plan 中的引用（自动化位置列或正文出现该路径）。
 *           第 1 至 5 条命中记 PASS，仅第 6 条命中记 WARN 并注明“仅 test-plan 引用”；
 *           三条线索（测试文件、test-plan 引用、AC 脚本引用）全无时记 error。
 *           scripts/ac/<AC-ID>.mjs 本身以 test-plan 出现该 AC 编号为准，记 PASS。
 *   MX-G-36（error）没有映射的源文件可以在 specs/test/<域>/test-plan.md 的“豁免”章节
 *           登记：文件路径、类别（七类之一，可选列）、理由不少于 8 个字符、批准人、
 *           未过期的到期日。登记有效记 PASS，登记不完整或过期按 error。
 *   MX-G-34（warn/待补）改动行覆盖率。从 frontend/coverage/coverage-final.json 或
 *           backend/coverage.out 取改动行的可执行语句数，已执行数除以可执行数得百分比，
 *           阈值 80%；低于阈值记 warn，报告缺失或改动行区间缺失记待补，不按 0% 计。
 *   MX-G-35（warn/待补）改动分支覆盖率。从 Istanbul 报告取改动行涉及的分支数，已执行
 *           分支数除以可执行分支数得百分比，阈值 70%；Go 覆盖率不含分支数据时记待补。
 *   MX-G-37（error/待补）映射测试执行。按 --run-report 的 JSON 记录核对每个映射测试
 *           是否真实运行、是否 skipped、退出码是否为 0；变更级未运行记 error，提交前
 *           记待补。
 *
 * 输入约定：
 *   - 改动行区间来自 --changed-lines 的 JSON（文件到行区间数组），或 --from-git 时由
 *     git diff -U0 解析；两者都没有时覆盖率两项记待补；
 *   - 映射测试执行记录来自 --run-report 的 JSON，支持数组与 {tests:[...]} 两种形状，
 *     每项含 path、status、exitCode。
 *
 * 输出格式：一行一条检查项，字段依次为
 *   [GATE-COVERAGE] <path>:<line> <MX-G-NN> <PASS|FAIL|WARN|PENDING> <检查项> 期望 <期望> 实际 <实际>；<修复动作>
 * 末尾先输出统计行，再按 GATES 第 1 节输出 PASS (gate: ...)、FAILED: <e> error(s), <w> warning(s)
 * 或 PENDING (gate: ..., pending: <n>)；待补存在且无 error 时退出码 2。
 *
 * 退出码：0 通过或仅有 warn；1 存在 error；2 参数或环境错误（含 git 不可用、清单为空）。
 *
 * 用法：
 *   node scripts/check-incremental-coverage.mjs <文件> [<文件>...]
 *   node scripts/check-incremental-coverage.mjs --changed-files .tmp/<清单>.txt
 *   node scripts/check-incremental-coverage.mjs --from-git [--base <ref>] [--git <git.exe>]
 *   node scripts/check-incremental-coverage.mjs --json
 *   node scripts/check-incremental-coverage.mjs --self-test
 *   node scripts/check-incremental-coverage.mjs --help
 *
 * 自检在 .tmp/ 下构造通过、失败与豁免失败三组夹具，固定时钟 2026-11-24T12:00+08:00，
 * 不读真实仓库、不读网络。跑完把夹具移入 E:\dsh_home\trash\pending-delete\ 保留原路径
 * 结构；沙箱拒绝写该目录时改移到 .tmp/_gate-trash/，不执行删除。
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const GATE = 'coverage'
const GATE_LABEL = 'GATE-COVERAGE'
const TRASH_ROOT = 'E:\\dsh_home\\trash\\pending-delete'
const FIXED_NOW = '2026-11-24T12:00:00+08:00'

const RULES = {
  changes: 'MX-G-32',
  mapping: 'MX-G-33',
  lineCoverage: 'MX-G-34',
  branchCoverage: 'MX-G-35',
  exemption: 'MX-G-36',
  execution: 'MX-G-37',
}

const EXEMPT_CATEGORIES = [
  '纯文档',
  '注释与格式',
  '生成文件',
  '纯类型声明',
  '设计 token 与视觉基线',
  '数据库迁移回滚演练',
  '锁文件与依赖升级',
]

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.tmp',
  '.pnpm-store',
  '.tools',
  'dist',
  'coverage',
  'report',
  'test-results',
  'vendor',
  'testdata',
])

const FRONTEND_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i
const STYLE_EXT = /\.(css|scss|sass|less)$/i
const AC_ID = /AC-(?:[A-Z0-9]+-){2,}\d+/
const STATUS_VALUES = new Set(['pass', 'partial', 'missing', 'blocked'])

class UsageError extends Error {}

/* ------------------------------------------------------------------ */
/* 通用工具                                                            */
/* ------------------------------------------------------------------ */

function normalizePath(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

function relPath(root, abs) {
  return normalizePath(relative(root, abs))
}

function toRel(root, value) {
  const normalized = normalizePath(String(value).trim())
  if (/^[A-Za-z]:\//.test(normalized)) {
    const rel = normalizePath(relative(root, normalized))
    return rel.startsWith('..') ? normalized : rel
  }
  return normalized
}

function readTextSafe(abs) {
  try {
    return readFileSync(abs, 'utf8')
  } catch {
    return null
  }
}

function writeFixture(root, rel, content) {
  const abs = join(root, ...normalizePath(rel).split('/'))
  const text = content.endsWith('\n') ? content : `${content}\n`
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
}

function walkFiles(dir, accept, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) walkFiles(full, accept, out)
    } else if (entry.isFile() && accept(full)) {
      out.push(full)
    }
  }
  return out
}

function lineAt(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1
  }
  return line
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDate(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00+08:00`)
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?$/.test(raw)) {
    return new Date(raw.replace(' ', 'T') + '+08:00')
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function splitRow(line) {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|')) body = body.slice(0, -1)
  return body.split('|').map((cell) => cell.trim())
}

function stripCell(cell) {
  return String(cell ?? '').replace(/`/g, '').trim()
}

function normalizeCell(cell) {
  return stripCell(cell).replace(/[\s*`]/g, '').toLowerCase()
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
}

/* ------------------------------------------------------------------ */
/* 改动清单                                                             */
/* ------------------------------------------------------------------ */

function findGit(root, explicit) {
  if (explicit) {
    if (!existsSync(explicit)) throw new UsageError(`--git 指向的 git 不存在：${explicit}`)
    return explicit
  }
  const candidates = [
    join(root, '.tools', 'git', 'cmd', 'git.exe'),
    join(root, '.tools', 'git', 'bin', 'git.exe'),
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  const probe = spawnSync('git', ['--version'], { stdio: 'ignore', windowsHide: true })
  if (!probe.error && probe.status === 0) return 'git'
  return null
}

let gitCaptureDir = null
let gitCaptureSeq = 0

function getGitCaptureDir() {
  if (gitCaptureDir) return gitCaptureDir
  try {
    gitCaptureDir = mkdtempSync(join(tmpdir(), 'dsh-gate-git-'))
  } catch {
    gitCaptureDir = join(REPO_ROOT, '.tmp', `_gate-git-${process.pid}-${Date.now()}`)
    mkdirSync(gitCaptureDir, { recursive: true })
  }
  return gitCaptureDir
}

/**
 * 在受限沙箱里管道会返回 EPERM，因此 git 的 stdout/stderr 重定向到普通文件再读取，
 * 不使用 stdio: 'pipe'。文件留在系统临时目录，由操作系统回收，脚本不执行删除。
 */
function runGit(git, root, args) {
  const captureDir = getGitCaptureDir()
  const outPath = join(captureDir, `out-${gitCaptureSeq}.txt`)
  const errPath = join(captureDir, `err-${gitCaptureSeq}.txt`)
  gitCaptureSeq += 1
  const outFd = openSync(outPath, 'w')
  const errFd = openSync(errPath, 'w')
  let result
  try {
    result = spawnSync(git, args, {
      cwd: root,
      stdio: ['ignore', outFd, errFd],
      windowsHide: true,
    })
  } finally {
    closeSync(outFd)
    closeSync(errFd)
  }
  const output = readTextSafe(outPath) ?? ''
  const errorText = readTextSafe(errPath) ?? ''
  if (result.error) {
    throw new UsageError(`git 执行失败：${result.error.code ?? result.error.message}`)
  }
  if (result.status !== 0) {
    const detail = errorText.trim().split(/\r?\n/)[0] || `退出码 ${result.status}`
    throw new UsageError(`git ${args.join(' ')} 失败：${detail}`)
  }
  return output
}

function splitNul(output) {
  return output.split('\0').map((item) => item.trim()).filter(Boolean)
}

function parseStatusZ(output) {
  const parts = output.split('\0')
  const files = []
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index]
    if (!record || record.length < 4) continue
    const status = record.slice(0, 2)
    const path = record.slice(3)
    if (status.includes('D')) continue
    files.push(path)
    if (/[RC]/.test(status)) index += 1
  }
  return files
}

function listFromGit(root, base, gitOption) {
  const git = findGit(root, gitOption)
  if (!git) {
    throw new UsageError(
      '--from-git 需要 git，但 PATH 与本仓库 .tools/git 都没有可执行的 git；' +
        '请安装 git，或用 --changed-files <清单文件> 提供改动清单',
    )
  }
  const files = []
  const diffArgs = (range) => ['diff', '--name-only', '-z', '--diff-filter=ACMR', range]
  if (base) {
    files.push(...splitNul(runGit(git, root, diffArgs(`${base}...HEAD`))))
    files.push(...splitNul(runGit(git, root, diffArgs(base))))
  } else {
    try {
      files.push(...splitNul(runGit(git, root, diffArgs('HEAD'))))
    } catch {
      files.push(...parseStatusZ(runGit(git, root, ['status', '--porcelain', '-z'])))
    }
  }
  files.push(...splitNul(runGit(git, root, ['ls-files', '--others', '--exclude-standard', '-z'])))
  return files
}

function readChangedList(root, listPath) {
  const candidates = [resolve(listPath), resolve(root, listPath)]
  const abs = candidates.find((candidate) => existsSync(candidate))
  if (!abs) throw new UsageError(`改动清单文件不存在：${listPath}`)
  let text
  try {
    text = readFileSync(abs, 'utf8')
  } catch (error) {
    throw new UsageError(`改动清单文件不可读：${listPath}（${error.code ?? error.message}）`)
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => toRel(root, line))
}

function collectChangedFiles(options) {
  const files = []
  const sources = []
  if (options.fromGit) {
    files.push(...listFromGit(options.root, options.base, options.git))
    sources.push(options.base ? `git ${options.base}...HEAD 与工作区` : 'git 工作区')
  }
  for (const listPath of options.changedFiles) {
    files.push(...readChangedList(options.root, listPath))
    sources.push(`清单 ${normalizePath(listPath)}`)
  }
  if (options.files.length > 0) {
    for (const raw of options.files) files.push(toRel(options.root, raw))
    sources.push('命令行参数')
  }
  const unique = [...new Set(files.map(normalizePath).filter(Boolean))]
  if (unique.length === 0) {
    throw new UsageError(
      '改动文件清单为空：请传文件参数、--changed-files <清单文件> 或 --from-git；空清单不记通过',
    )
  }
  return { files: unique, source: sources.join('、') || '未提供' }
}

/* ------------------------------------------------------------------ */
/* 文件分类                                                             */
/* ------------------------------------------------------------------ */

function classify(rel) {
  const path = rel.toLowerCase()
  if (path.startsWith('.tmp/') || path.includes('/node_modules/') || path.startsWith('node_modules/')) {
    return { kind: 'ignored', why: '临时或依赖路径' }
  }
  if (path.includes('/coverage/') || path.startsWith('frontend/coverage/') || path.includes('/dist/')) {
    return { kind: 'ignored', why: '构建产物' }
  }
  if (path.includes('/testdata/') || path.includes('/__mocks__/')) {
    return { kind: 'non-source', why: '测试夹具或 mock' }
  }
  if (/\.(test|spec)\.[^/]+$/.test(path) || /\/__tests__\//.test(path) || /\/e2e\//.test(path)) {
    return { kind: 'non-source', why: '测试文件' }
  }
  if (path.startsWith('frontend/src/')) {
    if (FRONTEND_EXT.test(path)) return { kind: 'frontend' }
    if (STYLE_EXT.test(path)) return { kind: 'style' }
    return { kind: 'non-source', why: '前端静态资源或配置' }
  }
  if (path.startsWith('backend/')) {
    if (path.endsWith('.go')) {
      if (path.endsWith('_test.go')) return { kind: 'non-source', why: 'Go 测试文件' }
      return { kind: 'backend' }
    }
    if (path.endsWith('.sql')) return { kind: 'migration' }
    return { kind: 'non-source', why: '后端非源文件' }
  }
  if (/^scripts\/ac\/[^/]+\.mjs$/.test(path)) return { kind: 'ac-script' }
  return { kind: 'non-source', why: '文档、spec、脚本、配置或数据' }
}

/* ------------------------------------------------------------------ */
/* 测试映射                                                             */
/* ------------------------------------------------------------------ */

function buildReferenceIndex(root) {
  const files = [
    ...walkFiles(join(root, 'frontend', 'src'), (file) => /\.(test|spec)\.(tsx?|jsx?|mjs|cjs)$/i.test(file)),
    ...walkFiles(join(root, 'frontend', 'e2e'), (file) => /\.(mjs|cjs|tsx?|jsx?)$/i.test(file)),
    ...walkFiles(join(root, 'backend'), (file) => file.endsWith('_test.go')),
  ].sort()
  const entries = []
  for (const abs of files) {
    const content = readTextSafe(abs)
    if (content === null || content.length > 2_000_000) continue
    entries.push({ path: relPath(root, abs), content })
  }
  return entries
}

function findReference(index, rel) {
  const stem = basename(rel).replace(/\.[^.]+$/, '')
  // 只在引号内的模块说明符里找，避免把注释里提到的文件名当成测试引用。
  const quoted = new RegExp(
    `['"\`](?:[^'"\`\\n]*\\/)?${escapeRegExp(stem)}(?:\\.(?:tsx?|jsx?|mjs|cjs|css|scss|less|sql))?['"\`]`,
  )
  for (const entry of index) {
    const match = quoted.exec(entry.content)
    if (match) return { path: entry.path, line: lineAt(entry.content, match.index), mode: stem }
  }
  return null
}

function buildAcScriptIndex(root) {
  const files = walkFiles(join(root, 'scripts', 'ac'), (file) => file.endsWith('.mjs')).sort()
  const entries = []
  for (const abs of files) {
    const content = readTextSafe(abs)
    if (content === null || content.length > 2_000_000) continue
    entries.push({ path: relPath(root, abs), content })
  }
  return entries
}

function findAcScriptReference(index, rel) {
  const base = basename(rel)
  for (const entry of index) {
    const pathIndex = entry.content.indexOf(rel)
    if (pathIndex >= 0) return { path: entry.path, line: lineAt(entry.content, pathIndex), mode: rel }
    const baseIndex = entry.content.indexOf(base)
    if (baseIndex >= 0) return { path: entry.path, line: lineAt(entry.content, baseIndex), mode: base }
  }
  return null
}

function stripExemptionSections(content) {
  const lines = content.split(/\r?\n/)
  let inSection = false
  const kept = []
  for (const line of lines) {
    if (/^#{2,6}\s/.test(line)) {
      inSection = /豁免/.test(line)
      kept.push(line)
      continue
    }
    // 保留空行占位，保证 test-plan 引用行号与原文一致。
    kept.push(inSection ? '' : line)
  }
  return kept.join('\n')
}

function loadTestPlans(root, explicitPlans) {
  const plans = []
  if (explicitPlans.length > 0) {
    for (const raw of explicitPlans) {
      const abs = resolve(root, raw)
      if (!existsSync(abs)) throw new UsageError(`--test-plan 指向的文件不存在：${raw}`)
      const content = readTextSafe(abs)
      if (content === null) throw new UsageError(`--test-plan 指向的文件不可读：${raw}`)
      plans.push({ path: relPath(root, abs), content, lookup: stripExemptionSections(content) })
    }
    return plans
  }
  const files = walkFiles(join(root, 'specs', 'test'), (file) => basename(file) === 'test-plan.md').sort()
  for (const abs of files) {
    const content = readTextSafe(abs)
    if (content !== null) {
      plans.push({ path: relPath(root, abs), content, lookup: stripExemptionSections(content) })
    }
  }
  return plans
}

function findPlanReference(plans, rel, needle) {
  const needles = [rel, basename(rel), needle].filter(Boolean)
  for (const plan of plans) {
    for (const value of needles) {
      const index = plan.lookup.indexOf(value)
      if (index >= 0) return { path: plan.path, line: lineAt(plan.lookup, index), needle: value }
    }
  }
  return null
}

function parseExemptions(plans) {
  const entries = new Map()
  for (const plan of plans) {
    const lines = plan.content.split(/\r?\n/)
    let inSection = false
    let header = null
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (/^#{2,6}\s/.test(line)) {
        inSection = /豁免/.test(line)
        header = null
        continue
      }
      if (!inSection) continue
      if (!/^\s*\|/.test(line)) {
        header = null
        continue
      }
      const cells = splitRow(line)
      if (isSeparatorRow(cells)) continue
      if (!header) {
        const map = { path: -1, reason: -1, approver: -1, deadline: -1, category: -1 }
        cells.forEach((cell, cellIndex) => {
          const value = normalizeCell(cell)
          if (/^(文件路径|文件|路径)$/.test(value)) map.path = cellIndex
          else if (value === '理由') map.reason = cellIndex
          else if (/^(批准人|批准)$/.test(value)) map.approver = cellIndex
          else if (/^(到期日|到期|期限)$/.test(value)) map.deadline = cellIndex
          else if (/^(类别|分类)$/.test(value)) map.category = cellIndex
        })
        if (map.path !== -1 && map.reason !== -1) header = map
        continue
      }
      const value = (cellIndex) => (cellIndex >= 0 ? stripCell(cells[cellIndex] ?? '') : '')
      const pathValue = value(header.path)
      if (!pathValue) continue
      const key = normalizePath(pathValue)
      if (entries.has(key)) continue
      entries.set(key, {
        path: pathValue,
        reason: value(header.reason),
        approver: value(header.approver),
        deadline: value(header.deadline),
        category: value(header.category),
        file: plan.path,
        line: index + 1,
      })
    }
  }
  return entries
}

function validateExemption(entry, now) {
  const problems = []
  if (!entry.reason || entry.reason.length < 8) problems.push('理由少于 8 个字符')
  if (!entry.approver) problems.push('缺少批准人')
  if (!entry.deadline) {
    problems.push('缺少到期日')
  } else {
    const deadline = parseDate(entry.deadline)
    if (!deadline) problems.push(`到期日无法解析（${entry.deadline}）`)
    else if (deadline.getTime() < now.getTime()) problems.push(`豁免已过期（${entry.deadline}）`)
  }
  if (entry.category && !EXEMPT_CATEGORIES.some((category) => entry.category.includes(category))) {
    problems.push(`类别不在七类内（${entry.category}）`)
  }
  return problems
}

function testCandidates(file) {
  const dir = dirname(file)
  const base = basename(file)
  const stem = base.replace(/\.[^.]+$/, '')
  const extensions = ['.test.tsx', '.test.ts', '.test.jsx', '.test.js', '.spec.tsx', '.spec.ts', '.spec.jsx', '.spec.js']
  const candidates = []
  for (const ext of extensions) candidates.push(normalizePath(join(dir, `${stem}${ext}`)))
  for (const ext of extensions) candidates.push(normalizePath(join(dir, '__tests__', `${stem}${ext}`)))
  return candidates
}

function expectedMapping(file, kind) {
  const dir = dirname(file)
  if (kind === 'backend') {
    return normalizePath(join(dir, `${basename(file, '.go')}_test.go`))
  }
  if (kind === 'migration') {
    return normalizePath(join(dir, `${basename(file, '.sql')}_test.go`))
  }
  if (kind === 'ac-script') {
    const match = basename(file).match(AC_ID)
    return match ? `specs/test/<域>/test-plan.md 的 ${match[0]} 行` : 'specs/test/<域>/test-plan.md 的 Covers 与 TC 行'
  }
  return testCandidates(file)[0]
}

function findMapping(context, file, kind) {
  const root = context.root
  if (kind === 'backend') {
    const dir = dirname(file)
    let tests = []
    try {
      tests = readdirSync(join(root, ...dir.split('/')))
        .filter((name) => name.endsWith('_test.go'))
        .sort()
    } catch {
      tests = []
    }
    if (tests.length > 0) {
      return {
        via: '同包测试',
        path: normalizePath(join(dir, tests[0])),
        line: 0,
        detail: tests.length > 1 ? `${tests.length} 个同包测试文件` : '同目录 _test.go',
        strength: 'strong',
      }
    }
  }
  if (kind === 'ac-script') {
    const match = basename(file).match(AC_ID)
    if (match) {
      const planRef = findPlanReference(context.plans, file, match[0])
      if (planRef) {
        return {
          via: 'test-plan 引用',
          path: planRef.path,
          line: planRef.line,
          detail: `AC ${match[0]}`,
          strength: 'strong',
        }
      }
    }
  }
  if (kind === 'frontend' || kind === 'style' || kind === 'ac-script') {
    const candidates = testCandidates(file)
    const found = candidates.find((candidate) => existsSync(join(root, ...candidate.split('/'))))
    if (found) return { via: '同名测试', path: found, line: 0, detail: '同目录测试文件', strength: 'strong' }
  }
  if (kind === 'migration') {
    const dir = dirname(file)
    let tests = []
    try {
      tests = readdirSync(join(root, ...dir.split('/')))
        .filter((name) => name.endsWith('_test.go'))
        .sort()
    } catch {
      tests = []
    }
    if (tests.length > 0) {
      return {
        via: '迁移测试',
        path: normalizePath(join(dir, tests[0])),
        line: 0,
        detail: '同目录迁移测试',
        strength: 'strong',
      }
    }
  }
  if (kind === 'frontend' || kind === 'style' || kind === 'migration') {
    if (context.refs === null) context.refs = buildReferenceIndex(root)
    const reference = findReference(context.refs, file)
    if (reference) {
      return {
        via: '测试引用',
        path: reference.path,
        line: reference.line,
        detail: `引用 ${reference.mode}`,
        strength: 'strong',
      }
    }
  }
  if (context.acRefs === null) context.acRefs = buildAcScriptIndex(root)
  const acReference = findAcScriptReference(context.acRefs, file)
  if (acReference) {
    return {
      via: 'AC 脚本引用',
      path: acReference.path,
      line: acReference.line,
      detail: `引用 ${acReference.mode}`,
      strength: 'strong',
    }
  }
  const planRef = findPlanReference(context.plans, file)
  if (planRef) {
    return {
      via: 'test-plan 引用',
      path: planRef.path,
      line: planRef.line,
      detail: `引用 ${planRef.needle}`,
      strength: 'plan',
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* 检查与输出                                                           */
/* ------------------------------------------------------------------ */

function item(status, check, rule, file, line, expected, actual, hint = '', ac = '') {
  return {
    gate: GATE,
    rule,
    severity: status === 'FAIL' ? 'error' : status === 'WARN' ? 'warn' : status === 'PENDING' ? 'pending' : 'pass',
    path: file,
    line,
    ac,
    hint,
    status,
    check,
    expected,
    actual,
  }
}

/* ------------------------------------------------------------------ */
/* 覆盖率与执行记录                                                     */
/* ------------------------------------------------------------------ */

function readJsonFile(abs) {
  const text = readTextSafe(abs)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function toRepoRel(root, raw) {
  const normalized = normalizePath(String(raw ?? ''))
  const rootRel = normalizePath(relative(root, root))
  if (normalized.startsWith(normalizePath(root))) {
    return normalizePath(normalized.slice(normalizePath(root).length)).replace(/^\//, '')
  }
  for (const marker of ['frontend/', 'backend/', 'scripts/']) {
    const index = normalized.indexOf(marker)
    if (index > 0) return normalized.slice(index)
  }
  return rootRel && normalized.startsWith(rootRel) ? normalized.slice(rootRel.length).replace(/^\//, '') : normalized
}

function normalizeChangedLineMap(raw) {
  const map = new Map()
  if (!raw || typeof raw !== 'object') return map
  const source = raw.files && typeof raw.files === 'object' ? raw.files : raw
  for (const [file, ranges] of Object.entries(source)) {
    if (!Array.isArray(ranges)) continue
    const list = []
    for (const entry of ranges) {
      if (Array.isArray(entry) && entry.length >= 1) {
        const start = Number(entry[0])
        const end = entry.length > 1 ? Number(entry[1]) : start
        if (Number.isFinite(start) && Number.isFinite(end)) {
          list.push([Math.min(start, end), Math.max(start, end)])
        }
      } else if (typeof entry === 'number' && Number.isFinite(entry)) {
        list.push([entry, entry])
      }
    }
    if (list.length > 0) map.set(normalizePath(file), list)
  }
  return map
}

function parseGitDiffLines(output) {
  const map = new Map()
  let current = null
  for (const line of String(output).split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      const raw = line.slice(4).trim()
      current = raw === '/dev/null' ? null : normalizePath(raw.replace(/^b\//, ''))
      continue
    }
    if (!current) continue
    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (!match) continue
    const start = Number(match[1])
    const count = match[2] === undefined ? 1 : Number(match[2])
    if (!Number.isFinite(start) || count <= 0) continue
    if (!map.has(current)) map.set(current, [])
    map.get(current).push([start, start + count - 1])
  }
  return map
}

function lineCountOf(abs) {
  try {
    return readFileSync(abs, 'utf8').split(/\r?\n/).length
  } catch {
    return 0
  }
}

function collectChangedLines(options, files) {
  if (options.changedLines instanceof Map && options.changedLines.size > 0) return options.changedLines
  if (!options.fromGit) return new Map()
  let git
  try {
    git = findGit(options.root, options.git)
  } catch {
    return new Map()
  }
  if (!git) return new Map()
  try {
    let output = ''
    if (options.base) {
      output += runGit(git, options.root, ['diff', '-U0', `${options.base}...HEAD`])
      output += runGit(git, options.root, ['diff', '-U0', options.base])
    } else {
      output += runGit(git, options.root, ['diff', '-U0', 'HEAD'])
    }
    const map = parseGitDiffLines(output)
    const untracked = splitNul(runGit(git, options.root, ['ls-files', '--others', '--exclude-standard', '-z']))
    for (const file of untracked) {
      const key = normalizePath(file)
      const count = lineCountOf(join(options.root, ...key.split('/')))
      if (count > 0) map.set(key, [[1, count]])
    }
    return map
  } catch {
    return new Map()
  }
}

function intersects(ranges, start, end) {
  return ranges.some(([from, to]) => from <= end && to >= start)
}

function loadCoverageReports(root) {
  const istanbulAbs = join(root, 'frontend', 'coverage', 'coverage-final.json')
  const goAbs = join(root, 'backend', 'coverage.out')
  const istanbul = existsSync(istanbulAbs) ? readJsonFile(istanbulAbs) : null
  const go = existsSync(goAbs) ? readTextSafe(goAbs) : null
  return {
    istanbul: istanbul && typeof istanbul === 'object' ? istanbul : null,
    go,
    present: Boolean(istanbul || go),
    names: [istanbul ? 'frontend/coverage/coverage-final.json' : null, go ? 'backend/coverage.out' : null].filter(Boolean),
  }
}

function istanbulEntries(report) {
  const entries = new Map()
  for (const [key, value] of Object.entries(report)) {
    if (!value || typeof value !== 'object') continue
    const file = normalizePath(String(value.path || key))
    entries.set(file, value)
  }
  return entries
}

function findCoverageEntry(entries, file, root) {
  if (entries.has(file)) return entries.get(file)
  const target = toRepoRel(root, file)
  for (const [key, value] of entries) {
    if (toRepoRel(root, key) === target) return value
  }
  return null
}

function parseGoProfile(text, root) {
  const entries = new Map()
  if (!text) return entries
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('mode:')) continue
    const match = line.match(/^(.+?):(\d+)\.(\d+),(\d+)\.(\d+) (\d+) (\d+)$/)
    if (!match) continue
    const file = toRepoRel(root, match[1])
    const start = Number(match[2])
    const end = Number(match[4])
    const count = Number(match[7])
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(count)) continue
    if (!entries.has(file)) entries.set(file, [])
    entries.get(file).push({ start, end, count })
  }
  return entries
}

function measureCoverage(root, files, changedLines) {
  const reports = loadCoverageReports(root)
  const result = {
    present: reports.present,
    names: reports.names,
    lineTotal: 0,
    lineCovered: 0,
    branchTotal: 0,
    branchCovered: 0,
    filesWithoutRanges: [],
    filesWithoutData: [],
    changedFiles: 0,
  }
  if (!reports.present) return result
  const istanbul = reports.istanbul ? istanbulEntries(reports.istanbul) : new Map()
  const go = parseGoProfile(reports.go, root)
  for (const file of files) {
    const classification = classify(file)
    if (!['frontend', 'backend'].includes(classification.kind)) continue
    result.changedFiles += 1
    const ranges = changedLines.get(normalizePath(file))
    if (!ranges || ranges.length === 0) {
      result.filesWithoutRanges.push(file)
      continue
    }
    const entry = findCoverageEntry(istanbul, file, root)
    if (entry) {
      const statements = entry.statementMap ?? {}
      const counts = entry.s ?? {}
      for (const [id, loc] of Object.entries(statements)) {
        const start = loc?.start?.line
        const end = loc?.end?.line ?? start
        if (!Number.isFinite(start)) continue
        if (!intersects(ranges, start, end)) continue
        result.lineTotal += 1
        if (Number(counts[id] ?? 0) > 0) result.lineCovered += 1
      }
      const branches = entry.branchMap ?? {}
      const branchCounts = entry.b ?? {}
      for (const [id, loc] of Object.entries(branches)) {
        const locations = Array.isArray(loc?.locations) ? loc.locations : [loc?.loc]
        const values = branchCounts[id]
        for (let index = 0; index < locations.length; index += 1) {
          const start = locations[index]?.start?.line
          const end = locations[index]?.end?.line ?? start
          if (!Number.isFinite(start)) continue
          if (!intersects(ranges, start, end)) continue
          result.branchTotal += 1
          if (Number(values?.[index] ?? 0) > 0) result.branchCovered += 1
        }
      }
      continue
    }
    const goEntries = go.get(normalizePath(file)) ?? go.get(toRepoRel(root, file))
    if (goEntries) {
      for (const statement of goEntries) {
        if (!intersects(ranges, statement.start, statement.end)) continue
        result.lineTotal += 1
        if (statement.count > 0) result.lineCovered += 1
      }
      continue
    }
    result.filesWithoutData.push(file)
  }
  return result
}

function normalizeRunReport(raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.tests)) return raw.tests
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([key, value]) =>
      value && typeof value === 'object' ? { path: key, ...value } : { path: key, status: value },
    )
  }
  return []
}

function runReportEntries(raw) {
  return normalizeRunReport(raw)
    .map((entry) => ({
      path: normalizePath(String(entry?.path ?? entry?.test ?? '')),
      status: String(entry?.status ?? entry?.result ?? '').toLowerCase(),
      exitCode: Number(entry?.exitCode ?? entry?.exit_code ?? 0),
    }))
    .filter((entry) => entry.path)
}

function coverageItems(root, options, context = {}) {
  const items = []
  const stage = options.stage ?? 'change'
  const threshold = options.threshold ?? 100
  const measurement = measureCoverage(root, context.files ?? [], context.changedLines ?? new Map())
  const hint = '提供 frontend/coverage/coverage-final.json 或 backend/coverage.out，并用 --changed-lines 或 --from-git 给出改动行区间'

  if (!measurement.present) {
    items.push(
      item('PENDING', '改动行覆盖率', RULES.lineCoverage, '-', 0, `改动行覆盖率不低于 ${threshold}%`, '未提供覆盖率报告，记待补，不按 0% 计', hint),
    )
  } else if (measurement.filesWithoutRanges.length > 0 && measurement.lineTotal === 0) {
    items.push(
      item(
        'PENDING',
        '改动行覆盖率',
        RULES.lineCoverage,
        '-',
        0,
        `改动行覆盖率不低于 ${threshold}%`,
        `缺少 ${measurement.filesWithoutRanges.length} 个改动文件的改动行区间，记待补：${measurement.filesWithoutRanges.join('、')}`,
        hint,
      ),
    )
  } else if (measurement.lineTotal === 0) {
    items.push(
      item(
        'PENDING',
        '改动行覆盖率',
        RULES.lineCoverage,
        '-',
        0,
        `改动行覆盖率不低于 ${threshold}%`,
        `覆盖率报告（${measurement.names.join('、')}）没有覆盖改动行，记待补`,
        hint,
      ),
    )
  } else {
    const percent = (measurement.lineCovered / measurement.lineTotal) * 100
    items.push(
      item(
        percent >= threshold ? 'PASS' : 'WARN',
        '改动行覆盖率',
        RULES.lineCoverage,
        '-',
        0,
        `改动行覆盖率不低于 ${threshold}%`,
        `${measurement.lineCovered}/${measurement.lineTotal} 行，${percent.toFixed(1)}%（报告 ${measurement.names.join('、')}）`,
        '补测改动行或登记豁免；低于阈值按 warn 登记原因与到期日',
      ),
    )
  }

  if (!measurement.present) {
    items.push(
      item('PENDING', '改动分支覆盖率', RULES.branchCoverage, '-', 0, `改动分支覆盖率不低于 ${threshold}%`, '未提供覆盖率报告，记待补，不按 0% 计', hint),
    )
  } else if (measurement.branchTotal === 0) {
    items.push(
      item(
        'PENDING',
        '改动分支覆盖率',
        RULES.branchCoverage,
        '-',
        0,
        `改动分支覆盖率不低于 ${threshold}%`,
        measurement.filesWithoutRanges.length > 0 ? '缺少改动行区间，记待补' : '覆盖率报告不含改动分支数据，记待补',
        hint,
      ),
    )
  } else {
    const percent = (measurement.branchCovered / measurement.branchTotal) * 100
    items.push(
      item(
        percent >= threshold ? 'PASS' : 'WARN',
        '改动分支覆盖率',
        RULES.branchCoverage,
        '-',
        0,
        `改动分支覆盖率不低于 ${threshold}%`,
        `${measurement.branchCovered}/${measurement.branchTotal} 个分支，${percent.toFixed(1)}%`,
        '补测改动分支或登记豁免；低于阈值按 warn 登记原因与到期日',
      ),
    )
  }

  const mappedTests = [...new Set(context.mappedTests ?? [])]
  if (mappedTests.length === 0) {
    items.push(
      item('PENDING', '映射测试执行', RULES.execution, '-', 0, '映射测试在本轮真实运行、非 skipped、退出码 0', '没有可检查的映射测试，记待补', '先补测试映射，再提供运行记录'),
    )
  } else if (!options.runReport) {
    items.push(
      item(
        stage === 'commit' ? 'PENDING' : 'PENDING',
        '映射测试执行',
        RULES.execution,
        '-',
        0,
        '映射测试在本轮真实运行、非 skipped、退出码 0',
        `未提供 --run-report，${mappedTests.length} 个映射测试的执行状态记待补`,
        '用 --run-report 传本轮测试运行记录（path、status、exitCode）',
      ),
    )
  } else {
    const entries = runReportEntries(options.runReport)
    const failures = []
    const missing = []
    for (const test of mappedTests) {
      const entry = entries.find((candidate) => candidate.path === normalizePath(test))
      if (!entry) {
        missing.push(test)
        continue
      }
      if (entry.status && entry.status.includes('skip')) {
        failures.push(`${test} 被 skipped`)
      } else if (entry.exitCode !== 0) {
        failures.push(`${test} 退出码 ${entry.exitCode}`)
      }
    }
    if (failures.length > 0) {
      items.push(
        item('FAIL', '映射测试执行', RULES.execution, '-', 0, '映射测试在本轮真实运行、非 skipped、退出码 0', failures.join('；'), '重跑失败用例并把退出码写进运行记录'),
      )
    } else if (missing.length > 0) {
      items.push(
        item(
          stage === 'commit' ? 'PENDING' : 'FAIL',
          '映射测试执行',
          RULES.execution,
          '-',
          0,
          '映射测试在本轮真实运行、非 skipped、退出码 0',
          `未运行 ${missing.length} 个映射测试：${missing.join('、')}`,
          '在变更级跑完全部映射测试，或提交前按待补登记',
        ),
      )
    } else {
      items.push(
        item('PASS', '映射测试执行', RULES.execution, '-', 0, '映射测试在本轮真实运行、非 skipped、退出码 0', `${mappedTests.length} 个映射测试均真实运行且退出码 0`),
      )
    }
  }

  return items
}

function analyze(options) {
  const root = options.root
  const now = options.now ?? new Date()
  const { files, source } = collectChangedFiles(options)
  const plans = loadTestPlans(root, options.testPlans ?? [])
  const context = { root, plans, exemptions: parseExemptions(plans), refs: null, acRefs: null }
  const items = []
  const ignored = []
  const nonSource = []
  const mappedTests = new Set()

  items.push(
    item(
      'PASS',
      '改动清单',
      RULES.changes,
      '-',
      0,
      '非空改动文件清单',
      `${files.length} 个文件（来源：${source}）`,
    ),
  )

  for (const file of files) {
    const classification = classify(file)
    if (classification.kind === 'ignored') {
      ignored.push(file)
      continue
    }
    if (classification.kind === 'non-source') {
      nonSource.push({ file, why: classification.why })
      continue
    }

    const mapping = findMapping(context, file, classification.kind)
    if (mapping) {
      const detail = mapping.line > 0 ? `${mapping.via} ${mapping.path}:${mapping.line}` : `${mapping.via} ${mapping.path}`
      if (mapping.strength === 'plan') {
        items.push(
          item(
            'WARN',
            '测试映射',
            RULES.mapping,
            file,
            0,
            '存在对应测试文件或测试引用',
            `仅 test-plan 引用 ${mapping.path}:${mapping.line}，未找到可执行测试文件`,
            `补 ${expectedMapping(file, classification.kind)} 或测试引用，或在 test-plan 第 5 节登记豁免`,
          ),
        )
      } else {
        if (!/test-plan\.md$/i.test(mapping.path)) mappedTests.add(normalizePath(mapping.path))
        items.push(
          item('PASS', '测试映射', RULES.mapping, file, 0, '存在对应测试文件或测试引用', detail),
        )
      }
      continue
    }

    const exemption = context.exemptions.get(normalizePath(file))
    if (exemption) {
      const problems = validateExemption(exemption, now)
      if (problems.length === 0) {
        items.push(
          item(
            'PASS',
            '豁免登记',
            RULES.exemption,
            file,
            0,
            '豁免落在七类内且路径、理由、批准人、到期日齐备',
            `豁免有效：${exemption.category || '未标类别'}，到期 ${exemption.deadline}（${exemption.file}:${exemption.line}）`,
          ),
        )
      } else {
        items.push(
          item(
            'FAIL',
            '豁免登记',
            RULES.exemption,
            file,
            0,
            '豁免落在七类内且路径、理由、批准人、到期日齐备',
            problems.join('；'),
            `在 ${exemption.file}:${exemption.line} 补全豁免登记或补测试`,
          ),
        )
      }
      continue
    }

    items.push(
      item(
        'FAIL',
        '测试映射',
        RULES.mapping,
        file,
        0,
        `存在对应测试文件或测试引用（首选 ${expectedMapping(file, classification.kind)}）`,
        '无任何测试映射',
        `补 ${expectedMapping(file, classification.kind)}，或在 test-plan 第 5 节登记豁免（文件路径、理由、批准人、到期日）`,
      ),
    )
  }

  if (nonSource.length > 0) {
    const reasons = [...new Set(nonSource.map((entry) => entry.why))].join('、')
    items.push(
      item(
        'PASS',
        '不适用',
        RULES.mapping,
        '-',
        0,
        '仅源文件要求测试映射',
        `${nonSource.length} 个非源文件不要求测试映射（${reasons}）`,
      ),
    )
  }

  const changedLines = collectChangedLines(options, files)
  items.push(...coverageItems(root, options, { files, changedLines, mappedTests: [...mappedTests] }))
  return { items, ignored, files, source }
}

function summarize(items) {
  return {
    total: items.length,
    pass: items.filter((entry) => entry.status === 'PASS').length,
    warn: items.filter((entry) => entry.status === 'WARN').length,
    fail: items.filter((entry) => entry.status === 'FAIL').length,
    pending: items.filter((entry) => entry.status === 'PENDING').length,
  }
}

function printItem(entry) {
  const location = `${entry.path || '-'}:${entry.line ?? 0}`
  const line = `[${GATE_LABEL}] ${location} ${entry.rule} ${entry.status} ${entry.check} 期望 ${entry.expected} 实际 ${entry.actual}`
  console.log(entry.hint ? `${line}；${entry.hint}` : line)
}

function printResult(result) {
  for (const entry of result.items) printItem(entry)
  const counts = summarize(result.items)
  console.log(
    `统计：检查 ${counts.total} 项，PASS ${counts.pass}，WARN ${counts.warn}，FAIL ${counts.fail}，PENDING ${counts.pending}，error ${counts.fail}，warn ${counts.warn}，忽略 ${result.ignored.length} 项`,
  )
  if (counts.fail > 0) console.log(`FAILED: ${counts.fail} error(s), ${counts.warn} warning(s)`)
  else if (counts.pending > 0) console.log(`PENDING (gate: ${GATE}, checks: ${counts.total}, warnings: ${counts.warn}, pending: ${counts.pending})`)
  else console.log(`PASS (gate: ${GATE}, checks: ${counts.total}, warnings: ${counts.warn})`)
}

/* ------------------------------------------------------------------ */
/* 自检夹具                                                             */
/* ------------------------------------------------------------------ */

function buildPassFixture(root) {
  writeFixture(root, 'frontend/src/components/card.tsx', 'export function Card() { return null }')
  writeFixture(
    root,
    'frontend/src/components/card.test.tsx',
    "import { Card } from './card'\nimport './card.css'\ntest('card', () => Card())",
  )
  writeFixture(root, 'frontend/src/components/card.css', '.card { color: #000; }')
  writeFixture(root, 'backend/internal/store/store.go', 'package store')
  writeFixture(root, 'backend/internal/store/store_test.go', 'package store')
  writeFixture(root, 'backend/internal/api/handler.go', 'package api')
  writeFixture(root, 'backend/internal/api/wire_test.go', 'package api')
  writeFixture(root, 'backend/migrations/0001_init.sql', 'CREATE TABLE t (id INTEGER);')
  writeFixture(root, 'backend/migrations/migrate_test.go', 'package migrations\n// 0001_init.sql')
  writeFixture(root, 'scripts/ac/AC-FX-001-01.mjs', '// 自检用断言脚本占位')
  writeFixture(
    root,
    'scripts/ac/AC-FX-001-02.mjs',
    '// 断言脚本引用源文件：frontend/src/components/ac-only.tsx',
  )
  writeFixture(root, 'frontend/src/components/legacy-ok.tsx', 'export const legacyOk = true')
  writeFixture(root, 'frontend/src/components/ac-only.tsx', 'export const acOnly = true')
  writeFixture(root, 'frontend/src/components/plan-only.tsx', 'export const planOnly = true')
  writeFixture(root, 'docs/notes.md', '# 自检说明')
  const istanbulEntry = (line, covered) => ({
    statementMap: { 0: { start: { line, column: 0 }, end: { line, column: 28 } } },
    s: { 0: covered },
    branchMap: {
      0: {
        type: 'if',
        locations: [{ start: { line, column: 0 }, end: { line, column: 10 } }],
        loc: { start: { line, column: 0 }, end: { line, column: 20 } },
      },
    },
    b: { 0: [covered] },
  })
  writeFixture(
    root,
    'frontend/coverage/coverage-final.json',
    JSON.stringify(
      {
        'frontend/src/components/card.tsx': istanbulEntry(1, 3),
        'frontend/src/components/ac-only.tsx': istanbulEntry(1, 1),
        'frontend/src/components/plan-only.tsx': istanbulEntry(1, 1),
        'frontend/src/components/legacy-ok.tsx': istanbulEntry(1, 1),
      },
      null,
      2,
    ),
  )
  writeFixture(
    root,
    'backend/coverage.out',
    [
      'mode: set',
      'backend/internal/store/store.go:1.1,1.15 1 1',
      'backend/internal/api/handler.go:1.1,1.15 1 1',
      '',
    ].join('\n'),
  )
  writeFixture(
    root,
    'specs/test/P1-FX/test-plan.md',
    [
      '# P1-FX 自检夹具',
      '',
      '| # | AC | TC | 类型 | 自动化位置 | 状态 | 证据 |',
      '|---|---|---|---|---|---|---|',
      '| 1 | AC-FX-001-01 | TC-FX-001 | unit | `scripts/ac/AC-FX-001-01.mjs` | pass | EV-FX-001 |',
      '',
      '- 实现说明：frontend/src/components/plan-only.tsx 只被本计划引用，没有直接测试文件。',
      '',
      '## 5 豁免登记',
      '',
      '| 文件 | 类别 | 理由 | 批准人 | 到期日 |',
      '|---|---|---|---|---|',
      '| frontend/src/components/legacy-ok.tsx | 纯类型声明 | 自检夹具证明有效豁免路径 | Lead | 2099-12-31 |',
      '',
    ].join('\n'),
  )
}

const PASS_FILES = [
  'frontend/src/components/card.tsx',
  'frontend/src/components/card.css',
  'backend/internal/store/store.go',
  'backend/internal/api/handler.go',
  'backend/migrations/0001_init.sql',
  'scripts/ac/AC-FX-001-01.mjs',
  'frontend/src/components/legacy-ok.tsx',
  'frontend/src/components/ac-only.tsx',
  'frontend/src/components/plan-only.tsx',
  'docs/notes.md',
]

function buildFailFixture(root) {
  writeFixture(root, 'frontend/src/components/orphan.tsx', 'export const orphan = true')
  writeFixture(root, 'docs/notes.md', '# 自检说明')
  writeFixture(root, 'specs/test/P1-FX/test-plan.md', '# P1-FX 自检夹具\n')
}

const FAIL_FILES = ['frontend/src/components/orphan.tsx', 'docs/notes.md']

const PASS_CHANGED_LINES = normalizeChangedLineMap({
  'frontend/src/components/card.tsx': [[1, 1]],
  'frontend/src/components/ac-only.tsx': [[1, 1]],
  'frontend/src/components/plan-only.tsx': [[1, 1]],
  'frontend/src/components/legacy-ok.tsx': [[1, 1]],
  'backend/internal/store/store.go': [[1, 1]],
  'backend/internal/api/handler.go': [[1, 1]],
})

const PASS_RUN_REPORT = {
  tests: [
    { path: 'frontend/src/components/card.test.tsx', status: 'passed', exitCode: 0 },
    { path: 'backend/internal/store/store_test.go', status: 'passed', exitCode: 0 },
    { path: 'backend/internal/api/wire_test.go', status: 'passed', exitCode: 0 },
    { path: 'backend/migrations/migrate_test.go', status: 'passed', exitCode: 0 },
    { path: 'scripts/ac/AC-FX-001-01.mjs', status: 'passed', exitCode: 0 },
    { path: 'scripts/ac/AC-FX-001-02.mjs', status: 'passed', exitCode: 0 },
  ],
}

function buildExemptFailFixture(root) {
  writeFixture(root, 'frontend/src/components/legacy.tsx', 'export const legacy = true')
  writeFixture(
    root,
    'specs/test/P1-FX/test-plan.md',
    [
      '# P1-FX 自检夹具',
      '',
      '## 5 豁免登记',
      '',
      '| 文件 | 类别 | 理由 | 批准人 | 到期日 |',
      '|---|---|---|---|---|',
      '| frontend/src/components/legacy.tsx | 纯类型声明 | 夹具证明过期豁免会被拦截 | Lead | 2020-01-01 |',
      '',
    ].join('\n'),
  )
}

function quarantineFixture(dir) {
  const rel = relative(REPO_ROOT, dir).split(sep).join('/')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  let trashError = null
  try {
    const target = join(TRASH_ROOT, ...rel.split('/'))
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true })
    renameSync(dir, target)
    return { moved: true, via: 'trash', path: target, trashError: null }
  } catch (error) {
    trashError = error
  }
  try {
    const target = join(REPO_ROOT, '.tmp', '_gate-trash', `${GATE}-${stamp}`, ...rel.split('/').slice(1))
    mkdirSync(dirname(target), { recursive: true })
    renameSync(dir, target)
    return { moved: true, via: 'workspace-quarantine', path: target, trashError }
  } catch (error) {
    return { moved: false, via: 'failed', path: dir, trashError, quarantineError: error }
  }
}

/* ------------------------------------------------------------------ */
/* 命令行                                                               */
/* ------------------------------------------------------------------ */

function parseThreshold(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d+$/.test(raw)) throw new UsageError(`--threshold 只接受 1 到 100 的整数：${raw || '(空)'}`)
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new UsageError(`--threshold 只接受 1 到 100 的整数：${raw}`)
  }
  return parsed
}

function parseArgs(argv) {
  const options = {
    root: REPO_ROOT,
    json: false,
    selfTest: false,
    help: false,
    fromGit: false,
    base: null,
    git: null,
    files: [],
    changedFiles: [],
    testPlans: [],
    now: null,
    changedLines: new Map(),
    runReport: null,
    stage: 'change',
    threshold: 100,
    error: null,
  }
  try {
    const valueAt = (index, name) => {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${name} 缺少参数值`)
      return value
    }
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index]
      if (arg === '--help' || arg === '-h') options.help = true
      else if (arg === '--json') options.json = true
      else if (arg === '--self-test') options.selfTest = true
      else if (arg === '--from-git') options.fromGit = true
      else if (arg === '--base') options.base = valueAt(index++, '--base')
      else if (arg === '--git') options.git = valueAt(index++, '--git')
      else if (arg === '--root') options.root = resolve(valueAt(index++, '--root'))
      else if (arg === '--changed-files') options.changedFiles.push(valueAt(index++, '--changed-files'))
      else if (arg === '--test-plan') options.testPlans.push(valueAt(index++, '--test-plan'))
      else if (arg === '--changed-lines') {
        const raw = valueAt(index++, '--changed-lines')
        const abs = resolve(options.root, raw)
        if (!existsSync(abs)) throw new UsageError(`--changed-lines 指向的文件不存在：${raw}`)
        const parsed = readJsonFile(abs)
        if (!parsed) throw new UsageError(`--changed-lines 的 JSON 无法解析：${raw}`)
        options.changedLines = normalizeChangedLineMap(parsed)
        if (options.changedLines.size === 0) throw new UsageError(`--changed-lines 没有解析到文件与行区间：${raw}`)
      } else if (arg === '--run-report') {
        const raw = valueAt(index++, '--run-report')
        const abs = resolve(options.root, raw)
        if (!existsSync(abs)) throw new UsageError(`--run-report 指向的文件不存在：${raw}`)
        const parsed = readJsonFile(abs)
        if (!parsed) throw new UsageError(`--run-report 的 JSON 无法解析：${raw}`)
        options.runReport = parsed
      } else if (arg === '--stage') {
        const value = valueAt(index++, '--stage')
        if (!['change', 'commit'].includes(value)) throw new UsageError('--stage 只取 change 或 commit')
        options.stage = value
      } else if (arg.startsWith('--threshold=')) {
        options.threshold = parseThreshold(arg.slice('--threshold='.length))
      } else if (arg === '--threshold') {
        options.threshold = parseThreshold(valueAt(index++, '--threshold'))
      } else if (arg === '--now') options.now = valueAt(index++, '--now')
      else if (arg.startsWith('-')) throw new UsageError(`未知参数 ${arg}`)
      else options.files.push(arg)
    }
    if (options.now) {
      const parsed = parseDate(options.now)
      if (!parsed) throw new UsageError(`--now 无法解析：${options.now}`)
      options.now = parsed
    }
  } catch (error) {
    options.error = error.message
  }
  return options
}

function printHelp() {
  console.log(
    [
      'check-incremental-coverage.mjs — 增量覆盖率门禁',
      '',
      '用法：',
      '  node scripts/check-incremental-coverage.mjs <文件> [<文件>...]',
      '  node scripts/check-incremental-coverage.mjs --changed-files .tmp/<清单>.txt',
      '  node scripts/check-incremental-coverage.mjs --from-git [--base <ref>] [--git <git.exe>]',
      '',
      '选项：',
      '  --changed-files <文件>  每行一个改动路径，# 开头为注释；可重复',
      '  --from-git             用 git diff --name-only <base>...HEAD 加工作区改动与未跟踪文件',
      '  --base <ref>           git 基准 ref；省略时取工作区相对 HEAD 的改动',
      '  --git <path>           指定 git 可执行文件；默认找 PATH 与 .tools/git/cmd/git.exe',
      '  --test-plan <文件>     指定 test-plan；默认扫 specs/test/**/test-plan.md',
      '  --changed-lines <文件> 改动行区间 JSON，形如 {"frontend/src/a.tsx": [[1, 3], [7, 7]]}',
      '  --run-report <文件>    映射测试运行记录 JSON，数组或 {tests:[...]}，每项含 path、status、exitCode',
      '  --stage <change|commit> 判定阶段，默认 change；提交前未运行的映射测试记待补',
      '  --threshold <1-100>    改动行与改动分支覆盖率阈值，默认 100；非整数或越界报错',
      '  --root <目录>          仓库根，默认脚本所在目录的上一级',
      '  --now <ISO 时间>       固定时钟，用于豁免到期判定与自检复现',
      '  --json                 输出对象数组，每项含 gate/rule/severity/path/line/ac/hint',
      '  --self-test            在 .tmp/ 下造夹具自检，跑完移入隔离目录，不删除文件',
      '  --help                 显示本说明',
      '',
      '检查项：改动清单 MX-G-32、测试映射 MX-G-33、豁免登记 MX-G-36、改动行覆盖率',
      'MX-G-34、改动分支覆盖率 MX-G-35、映射测试执行 MX-G-37。测试映射按测试文件、',
      'AC 脚本引用、test-plan 引用三条线索判定：前两条命中记 PASS，仅 test-plan 引用记',
      'WARN，三条全无且无有效豁免记 error。',
      '',
      '覆盖率两项从 frontend/coverage/coverage-final.json 与 backend/coverage.out 计算，',
      '阈值默认 100%（改动行与改动分支同一阈值，可用 --threshold 调整），低于阈值记 WARN；',
      '报告或改动行区间缺失时记 PENDING，退出码 2，不按 0% 计。MX-G-37 按 --run-report 核对真跑、skipped 与退出码。',
      '',
      '退出码：0 通过或仅 warn；1 存在 error；2 参数或环境错误，或存在待补项。',
      '',
      '示例：',
      '  node scripts/check-incremental-coverage.mjs --changed-files .tmp/changed.txt',
      '  node scripts/check-incremental-coverage.mjs frontend/src/components/card.tsx --json',
      '',
    ].join('\n'),
  )
}

function runSelfTest() {
  const stamp = `${Date.now()}-${process.pid}`
  const base = join(REPO_ROOT, '.tmp', `selftest-${GATE}-${stamp}`)
  const assertions = []
  let cleanup = null
  const assert = (name, ok, detail = '') => assertions.push({ name, ok: Boolean(ok), detail })
  try {
    const passRoot = join(base, 'pass')
    const failRoot = join(base, 'fail')
    const exemptRoot = join(base, 'exempt-fail')
    buildPassFixture(passRoot)
    buildFailFixture(failRoot)
    buildExemptFailFixture(exemptRoot)
    const now = new Date(FIXED_NOW)
    const baseOptions = {
      root: passRoot,
      now,
      testPlans: [],
      changedFiles: [],
      fromGit: false,
      base: null,
      git: null,
    }

    const pass = analyze({
      ...baseOptions,
      files: PASS_FILES,
      changedLines: PASS_CHANGED_LINES,
      runReport: PASS_RUN_REPORT,
    })
    const fail = analyze({ ...baseOptions, root: failRoot, files: FAIL_FILES })
    const exempt = analyze({ ...baseOptions, root: exemptRoot, files: ['frontend/src/components/legacy.tsx'] })

    const passCounts = summarize(pass.items)
    const failItems = fail.items.filter((entry) => entry.status === 'FAIL')
    const failCounts = summarize(fail.items)
    const failPending = fail.items.filter((entry) => entry.status === 'PENDING')
    const exemptItems = exempt.items.filter((entry) => entry.status === 'FAIL')
    const coveragePassItems = pass.items.filter(
      (entry) => entry.rule === RULES.lineCoverage || entry.rule === RULES.branchCoverage,
    )
    const executionItem = pass.items.find((entry) => entry.rule === RULES.execution)
    const planOnly = pass.items.find((entry) => entry.path === 'frontend/src/components/plan-only.tsx')
    const acOnly = pass.items.find((entry) => entry.path === 'frontend/src/components/ac-only.tsx')

    assert('通过样例 error=0', passCounts.fail === 0, `error=${passCounts.fail}`)
    assert(
      '通过样例 exit 0',
      passCounts.fail === 0 && passCounts.pending === 0,
      `error=${passCounts.fail}, pending=${passCounts.pending}, warn=${passCounts.warn}`,
    )
    assert(
      '通过样例覆盖 10 个改动文件',
      pass.files.length === PASS_FILES.length && pass.files.length === 10,
      `files=${pass.files.length}`,
    )
    assert(
      '覆盖率与执行状态三项按 PASS 记',
      coveragePassItems.length === 2 &&
        coveragePassItems.every((entry) => entry.status === 'PASS') &&
        executionItem !== undefined &&
        executionItem.status === 'PASS',
      `coverage=${coveragePassItems.map((entry) => entry.status).join(',')}, execution=${executionItem ? `${executionItem.status}:${executionItem.actual}` : 'missing'}`,
    )
    assert(
      '改动行覆盖率写出百分比',
      coveragePassItems.some((entry) => entry.rule === RULES.lineCoverage && /100\.0%/.test(entry.actual)),
      coveragePassItems.map((entry) => entry.actual).join('；'),
    )
    assert(
      '仅 test-plan 引用保持 WARN',
      planOnly !== undefined && planOnly.status === 'WARN' && /仅 test-plan 引用/.test(planOnly.actual),
      planOnly ? `${planOnly.status}:${planOnly.actual}` : 'plan-only 项缺失',
    )
    assert(
      'AC 脚本引用计为映射 PASS',
      acOnly !== undefined && acOnly.status === 'PASS' && /AC 脚本引用/.test(acOnly.actual),
      acOnly ? `${acOnly.status}:${acOnly.actual}` : 'ac-only 项缺失',
    )
    assert('失败样例 exit 1', failCounts.fail === 1, `error=${failCounts.fail}`)
    assert(
      '失败样例缺覆盖率与运行记录记待补',
      failPending.filter(
        (entry) =>
          entry.rule === RULES.lineCoverage ||
          entry.rule === RULES.branchCoverage ||
          entry.rule === RULES.execution,
      ).length === 3,
      failPending.map((entry) => `${entry.rule}:${entry.status}`).join('; '),
    )
    assert(
      '失败样例命中 MX-G-33 一次',
      failItems.length === 1 && failItems[0].rule === RULES.mapping,
      failItems.map((entry) => `${entry.rule}:${entry.check}`).join('; '),
    )
    assert(
      '失败样例提示首选测试路径',
      failItems.some((entry) => String(entry.expected).includes('orphan.test.tsx')),
      failItems.map((entry) => entry.expected).join('; '),
    )
    assert(
      '豁免过期命中 MX-G-36 一次',
      exemptItems.length === 1 && exemptItems[0].rule === RULES.exemption,
      exemptItems.map((entry) => `${entry.rule}:${entry.actual}`).join('; '),
    )

    const strictParse = parseArgs(['--threshold', '60'])
    const floatParse = parseArgs(['--threshold', '60.5'])
    const overParse = parseArgs(['--threshold=101'])
    const zeroParse = parseArgs(['--threshold=0'])
    const tight = analyze({
      ...baseOptions,
      files: PASS_FILES,
      changedLines: PASS_CHANGED_LINES,
      runReport: PASS_RUN_REPORT,
      threshold: 60,
    })
    const tightCoverage = tight.items.filter(
      (entry) => entry.rule === RULES.lineCoverage || entry.rule === RULES.branchCoverage,
    )
    assert(
      '--threshold 接受 1 到 100 的整数并作用于判定',
      strictParse.error === null &&
        strictParse.threshold === 60 &&
        tightCoverage.length === 2 &&
        tightCoverage.every((entry) => entry.status === 'PASS' && /不低于 60%/.test(entry.expected)),
      `error=${strictParse.error}, threshold=${strictParse.threshold}, items=${tightCoverage.map((entry) => `${entry.status}:${entry.expected}`).join('; ')}`,
    )
    assert(
      '--threshold 非整数或越界报错',
      /只接受 1 到 100 的整数/.test(floatParse.error ?? '') &&
        /只接受 1 到 100 的整数/.test(overParse.error ?? '') &&
        /只接受 1 到 100 的整数/.test(zeroParse.error ?? ''),
      `float=${floatParse.error}, over=${overParse.error}, zero=${zeroParse.error}`,
    )

    const signatureOf = (result) =>
      result.items
        .filter((entry) => entry.status !== 'PASS')
        .map((entry) => `${entry.rule}|${entry.check}|${entry.path}|${entry.line}|${entry.status}|${entry.actual}`)
        .sort()
        .join('\n')
    const signatures = [signatureOf(fail), signatureOf(fail), signatureOf(fail)]
    assert(
      '失败样例连续三次规则集合与行号一致',
      signatures[0] === signatures[1] && signatures[1] === signatures[2],
      `signature=${signatures[0].slice(0, 120)}`,
    )
  } catch (error) {
    assert('自检执行未抛错', false, error && error.message ? error.message : String(error))
  } finally {
    cleanup = quarantineFixture(base)
  }

  assert(
    '夹具已移出 .tmp 且隔离副本存在',
    cleanup && cleanup.moved && existsSync(cleanup.path) && !existsSync(base),
    cleanup ? `via=${cleanup.via}, path=${cleanup.path}` : 'cleanup=null',
  )

  const failed = assertions.filter((entry) => !entry.ok)
  for (const entry of assertions) {
    console.log(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}${entry.detail ? `（${entry.detail}）` : ''}`)
  }
  if (cleanup) {
    const note = cleanup.via === 'trash' ? '已移入 trash' : 'trash 不可写，已移入工作区隔离目录'
    console.log(`清理：${note} ${cleanup.path}${cleanup.moved ? '' : '（移动失败，夹具保留）'}`)
  }
  if (failed.length > 0) {
    console.log(`SELF-TEST FAILED (${failed.length}/${assertions.length} assertions failed)`)
    return 1
  }
  console.log(`SELF-TEST PASS (${assertions.length} assertions)`)
  return 0
}

// 规则级命令已移交 ai-review；本脚本按整套门禁运行，不接受 --rule 参数。

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return 0
  }
  if (options.error) {
    console.error(`参数错误：${options.error}`)
    console.error('使用 --help 查看用法。')
    return 2
  }
  if (options.selfTest) return runSelfTest()
  try {
    if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
      throw new UsageError(`--root 指向的目录不存在或不可读：${options.root}`)
    }
    const result = analyze(options)
    if (options.json) {
      console.log(JSON.stringify(result.items))
    } else {
      printResult(result)
    }
    const counts = summarize(result.items)
    if (counts.fail > 0) return 1
    if (counts.pending > 0) return 2
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`运行前置不满足：${error.message}`)
      console.error('未执行检查，退出码 2（按 GATES 记待补，不记通过）。')
      return 2
    }
    console.error(`运行失败：${error && error.message ? error.message : String(error)}`)
    return 2
  }
}

process.exitCode = main()


