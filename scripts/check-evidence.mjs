#!/usr/bin/env node
/**
 * check-evidence.mjs — 证据完整性门禁（零依赖，只读）
 *
 * 依据 docs/framework/GATES.md 第 3.6 节与 docs/framework/templates/evidence-index.md。
 * 输入是本轮 AC 清单、证据索引与夹具清单，检查每条 AC 是否有证据行、判定值是否合法、
 * 未验证项是否带七种原因码之一、证据路径是否存在、证据时间是否早于本轮构建或超过有效期，
 * 以及生成器与产物的绑定关系是否成立。
 *
 * 已实现的规则：
 *   MX-G-38（error）每条 AC 在证据索引至少有一行。AC 清单来自 --test-plan 的矩阵行、
 *           --change 的 Covers、--ac；都没有时只校验已解析的证据行并输出 warn。
 *           证据行按 AC 列精确匹配，一个 AC 多行时至少一行合法即算有记录。
 *   MX-G-39（error）证据路径存在且非空。仓库相对路径按 --root 解析；绝对路径直接检查；
 *           http(s) URL 无法离线核验，记 warn；`不适用`、`N/A`、`待补` 等占位值跳过。
 *           路径字段为空由 MX-G-40 报缺失，本条不重复报。
 *   MX-G-40（error）十五个必填字段非空：证据编号、AC 编号、证据类型、路径、生成命令、
 *           生成时间、判定人、判定结果、未验证原因码、关联任务卡、轮次、可复跑、构建版本、
 *           失效标记与备注；证据类型必须在六类内；判定结果必须是 pass、partial、missing、
 *           blocked 四值；可复跑写“否”却判 pass 记 error。
 *   MX-G-41（error/warn）证据时效。生成时间早于 --build-time 或距 --now 超过
 *           --max-age-days（默认 7 天）时，pass 证据记 error，非 pass 记 warn；失效标记
 *           写“失效”的 pass 证据记 error。
 *   MX-G-42（error）原因码。missing 必须写 R-SCRIPT；blocked 必须写 R-ENV、R-BUILD、
 *           R-EXT、R-MANUAL、R-SPEC、R-DRILL 之一；partial 必须写除 R-DRILL 外的六码之一，
 *           其中 R-SCRIPT 按模板口径记 warn；pass 的原因码列应写“不适用”。
 *   MX-G-43（error）未验证项的解除信息与空泛结论。partial、missing、blocked 的行必须写
 *           解除条件、待执行动作、责任人与到期日；证据结论只写“通过”“已完成”“ok”“PASS”
 *           时记 error。
 *   MX-G-47（error）证据索引逐条覆盖变更 Covers 与 test-plan 的并集，缺行记 error。
 *   MX-G-51（error）生成器与产物绑定。读 specs/test/<域>/fixtures/manifest.json 或
 *           --fixture-manifest 指定的清单，检查清单字段、生成器与产物是否存在、生成器
 *           mtime 是否晚于产物、verifyCommand 引用的 scripts 路径是否存在、产物根字段
 *           generatorVersion 是否等于清单 generator.version，清单写 sha256 时比对哈希。
 *           仓库内没有任何清单时输出一条 PASS 说明；显式清单缺失时记 error。
 *
 * 口径说明：
 *   - 判定结果取 pass、partial、missing、blocked 四值（MOXIAN.md 表 9-2 与 MX-3-12）；
 *   - 证据类型只接受六类：断言脚本、单元测试日志、接口响应、集成日志、端到端截图、
 *     人工记录；脚本输出、命令日志、截图、数据库快照按非法类型处理；
 *   - 模板定稿前的旧证据表只有九列；这类表按九列判定，模板新增的判定人、未验证原因码、
 *     关联任务卡、构建版本、失效标记与备注六列在表中不存在时不记缺失，存在的列仍按
 *     十五列口径校验（空值照记 error）。新表仍按十五列判定（见 GATES.md MX-G-40）；
 *   - 旧变更包的 AC 是 AC-P1-01 这类两段式编号，解析时与现行三段式一并接受；
 *   - 未验证原因码只接受表 3-4 的 R-SCRIPT、R-ENV、R-BUILD、R-EXT、R-MANUAL、R-SPEC、
 *     R-DRILL 七值，其他前缀或词按非法原因码处理。
 *
 * 输出格式：一行一条检查项，字段依次为
 *   [GATE-EVIDENCE] <path>:<line> <MX-G-NN> <PASS|FAIL|WARN> <检查项> 期望 <期望> 实际 <实际>；<修复动作>
 * 末尾先输出统计行，再按 GATES 第 1 节输出 PASS (gate: ...) 或 FAILED: <e> error(s), <w> warning(s)。
 *
 * 退出码：0 通过或仅有 warn；1 存在 error；2 参数或环境错误。
 *
 * 用法：
 *   node scripts/check-evidence.mjs --test-plan specs/test/P1-CONV/test-plan.md
 *   node scripts/check-evidence.mjs --change CHG-CONV-007
 *   node scripts/check-evidence.mjs --index specs/changes/CHG-X/evidence.md --ac AC-X-001-01
 *   node scripts/check-evidence.mjs --fixture-manifest specs/test/P1-CONV/fixtures/manifest.json
 *   node scripts/check-evidence.mjs --build-time 2026-11-24T18:16+08:00 --now 2026-11-24T19:30+08:00
 *   node scripts/check-evidence.mjs --json
 *   node scripts/check-evidence.mjs --self-test
 *   node scripts/check-evidence.mjs --help
 *
 * 自检在 .tmp/ 下构造通过样例与失败样例，固定时钟 2026-11-24T12:00+08:00，构建时间
 * 2026-11-24T10:00+08:00，不读真实仓库、不读网络。跑完把夹具移入
 * E:\dsh_home\trash\pending-delete\ 保留原路径结构；沙箱拒绝写该目录时改移到
 * .tmp/_gate-trash/，不执行删除。
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const GATE = 'evidence'
const GATE_LABEL = 'GATE-EVIDENCE'
const TRASH_ROOT = 'E:\\dsh_home\\trash\\pending-delete'
const FIXED_NOW = '2026-11-24T12:00:00+08:00'
const FIXED_BUILD = '2026-11-24T10:00:00+08:00'

const RULES = {
  record: 'MX-G-38',
  path: 'MX-G-39',
  fields: 'MX-G-40',
  type: 'MX-G-40',
  verdict: 'MX-G-40',
  rerun: 'MX-G-40',
  freshness: 'MX-G-41',
  reason: 'MX-G-42',
  release: 'MX-G-43',
  coverAll: 'MX-G-47',
  binding: 'MX-G-51',
}

const STATUS_VALUES = ['pass', 'partial', 'missing', 'blocked']
const STATUS_SET = new Set(STATUS_VALUES)
const REASONS = ['R-SCRIPT', 'R-ENV', 'R-BUILD', 'R-EXT', 'R-MANUAL', 'R-SPEC', 'R-DRILL']
const REASON_SET = new Set(REASONS)
const BLOCKED_REASONS = new Set(REASONS.filter((code) => code !== 'R-SCRIPT'))
const TYPE_VALUES = [
  '断言脚本',
  '单元测试日志',
  '接口响应',
  '集成日志',
  '端到端截图',
  '人工记录',
]
const TYPE_SET = new Set(TYPE_VALUES)
const CORE_FIELDS = [
  ['id', '证据编号'],
  ['ac', 'AC 编号'],
  ['type', '证据类型'],
  ['path', '路径'],
  ['command', '生成命令'],
  ['time', '生成时间'],
  ['judge', '判定人'],
  ['result', '判定结果'],
  ['reason', '未验证原因码'],
  ['card', '关联任务卡'],
  ['round', '轮次'],
  ['rerun', '可复跑'],
  ['build', '构建版本'],
  ['invalid', '失效标记'],
  ['note', '备注'],
]
const PLACEHOLDER_PATH = /^(不适用|n\/a|无|—|–|-|\/|待补|待定)$/i
const URL_PATH = /^https?:\/\//i
// 判定人允许写法：docs/framework/GATES.md:249（MX-G-40，error）规定写「自动」或
// 「人工:<动作>」，缺失或写成其他形式按 error 记；角色名取自 ROLES.md 的名册。
const JUDGE_PATTERN = /^(自动|人工\s*[:：])/
// 三段式是现行写法；旧变更包（CHG-LEGACY-*、CHG-CONV-001..006）的 AC 是 AC-P1-01
// 这类两段式编号，证据行按原编号登记，解析时一并接受，不把「编号形态旧」记成缺字段。
const AC_ID = /AC-(?:[A-Z0-9]+-){1,}\d+/g

class UsageError extends Error {}

/* ------------------------------------------------------------------ */
/* 通用工具                                                             */
/* ------------------------------------------------------------------ */

function normalizePath(value) {
  return String(value).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

function relPath(root, abs) {
  return normalizePath(relative(root, abs))
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
      if (entry.name !== 'node_modules' && entry.name !== '.git') walkFiles(full, accept, out)
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
  return stripCell(cell).replace(/[\s*`]/g, '').replace(/：$/, '').toLowerCase()
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractAcs(text) {
  return [...new Set(String(text ?? '').match(AC_ID) ?? [])]
}

/* ------------------------------------------------------------------ */
/* 证据索引解析                                                         */
/* ------------------------------------------------------------------ */

const HEADER_ALIASES = {
  id: ['证据编号', '证据id', '编号', '证据序号', 'ev编号'],
  ac: ['ac编号', '对应ac或变更级条目', '对应ac或变更级', '对应ac', 'ac与tc', 'ac或tc', '关联ac', 'ac'],
  type: ['证据类型', '类型'],
  path: ['路径', '证据路径', '产物路径'],
  command: ['生成命令', '命令', '复现命令'],
  time: ['生成时间', '时间', '运行时间', '生成日期'],
  judge: ['判定人', '执行人', '判定者'],
  result: ['判定结果', '结果', '状态'],
  reason: ['未验证原因码', '原因码', '未验证原因'],
  card: ['关联任务卡', '任务卡', '卡号'],
  round: ['轮次', '轮次/日期', '验收轮次'],
  rerun: ['可复跑', '可复运行', '可复算'],
  build: ['构建版本', '构建号', '环境与构建'],
  invalid: ['失效标记', '失效状态'],
  note: ['备注', '说明', '备注与解除'],
}

function mapHeader(cells) {
  const normalized = cells.map(normalizeCell)
  const map = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex((cell) => aliases.includes(cell))
    map[field] = index
  }
  if (map.id === -1 || map.result === -1) return null
  return map
}

function parseEvidenceFile(root, absPath) {
  const content = readTextSafe(absPath)
  if (content === null) return { file: relPath(root, absPath), rows: [], error: '文件不可读' }
  const file = relPath(root, absPath)
  const lines = content.split(/\r?\n/)
  const rows = []
  let header = null
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/^\s*\|/.test(line)) {
      header = null
      continue
    }
    const cells = splitRow(line)
    if (isSeparatorRow(cells)) continue
    if (header === null) {
      header = mapHeader(cells)
      continue
    }
    const value = (field) => (header[field] === -1 ? '' : stripCell(cells[header[field]] ?? ''))
    const values = {}
    for (const field of Object.keys(HEADER_ALIASES)) values[field] = value(field)
    // 模板定稿前的九列表缺判定人、构建版本、失效标记三列；三列都缺才按旧表判定，
    // 只缺一两列的表按十五列口径校验，避免用半张旧表跳过必填字段。
    const absent = new Set(Object.keys(HEADER_ALIASES).filter((field) => header[field] === -1))
    rows.push({
      file,
      line: index + 1,
      values,
      acs: extractAcs(values.ac),
      absent,
      legacy: ['judge', 'build', 'invalid'].every((field) => absent.has(field)),
    })
  }
  return { file, rows, error: null }
}

/* ------------------------------------------------------------------ */
/* AC 清单                                                              */
/* ------------------------------------------------------------------ */

function parseTestPlanAcs(root, rawPath) {
  const abs = resolve(root, rawPath)
  if (!existsSync(abs)) throw new UsageError(`--test-plan 指向的文件不存在：${rawPath}`)
  const content = readTextSafe(abs)
  if (content === null) throw new UsageError(`--test-plan 指向的文件不可读：${rawPath}`)
  const file = relPath(root, abs)
  const map = new Map()
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!/^\s*\|/.test(line)) continue
    const cells = splitRow(line)
    if (isSeparatorRow(cells)) continue
    const statusCells = cells.map(stripCell).filter((cell) => STATUS_SET.has(cell))
    if (statusCells.length !== 1) continue
    const acs = extractAcs(line)
    if (acs.length === 0) continue
    for (const ac of acs) {
      if (map.has(ac)) continue
      map.set(ac, { status: statusCells[0], file, line: index + 1 })
    }
  }
  if (map.size === 0) {
    throw new UsageError(`--test-plan 没有解析到 AC 矩阵行：${rawPath}（需要一行至少一个 AC 编号与一个四值状态）`)
  }
  return map
}

function parseChangeCovers(root, changeId) {
  const abs = join(root, 'specs', 'changes', changeId, 'spec.md')
  if (!existsSync(abs)) throw new UsageError(`--change 指向的变更包 spec 不存在：${relPath(root, abs)}`)
  const content = readTextSafe(abs)
  if (content === null) throw new UsageError(`--change 指向的变更包 spec 不可读：${relPath(root, abs)}`)
  const file = relPath(root, abs)
  const lines = content.split(/\r?\n/)
  const map = new Map()
  const coversIndex = lines.findIndex((line) => /Covers\s*[:：]/i.test(line))
  if (coversIndex >= 0) {
    for (const ac of extractAcs(lines[coversIndex])) map.set(ac, { status: '', file, line: coversIndex + 1 })
  }
  if (map.size === 0) {
    for (let index = 0; index < lines.length; index += 1) {
      for (const ac of extractAcs(lines[index])) {
        if (!map.has(ac)) map.set(ac, { status: '', file, line: index + 1 })
      }
    }
  }
  // 变更级条目同样要进证据门；兼容 AC-CHG-<CHG-ID>-NN 与 AC-<CHG-ID>-NN 两种写法。
  const changeLevelForms = [
    `AC-CHG-${escapeRegExp(changeId)}-\\d+`,
    `AC-${escapeRegExp(changeId)}-\\d+`,
  ]
  if (changeId.startsWith('CHG-')) {
    changeLevelForms.push(`AC-CHG-${escapeRegExp(changeId.slice(4))}-\\d+`)
  }
  for (const form of changeLevelForms) {
    const changeLevel = new RegExp(form, 'g')
    for (let index = 0; index < lines.length; index += 1) {
      for (const ac of lines[index].match(changeLevel) ?? []) {
        if (!map.has(ac)) map.set(ac, { status: '', file, line: index + 1 })
      }
    }
  }
  if (map.size === 0) throw new UsageError(`--change 的 spec 没有 AC 编号：${relPath(root, abs)}`)
  return map
}

function loadAcSet(root, options) {
  const map = new Map()
  const merge = (source) => {
    for (const [ac, meta] of source) if (!map.has(ac)) map.set(ac, meta)
  }
  for (const plan of options.testPlans) merge(parseTestPlanAcs(root, plan))
  for (const change of options.changes) merge(parseChangeCovers(root, change))
  for (const ac of options.acs) {
    const ids = extractAcs(ac)
    for (const id of ids) {
      if (!map.has(id)) map.set(id, { status: '', file: '--ac', line: 0 })
    }
    if (ids.length === 0) throw new UsageError(`--ac 不是合法 AC 编号：${ac}`)
  }
  return map
}

/* ------------------------------------------------------------------ */
/* 证据索引定位                                                         */
/* ------------------------------------------------------------------ */

function resolveIndexes(root, options) {
  const files = []
  const missing = []
  if (options.indexes.length > 0) {
    for (const raw of options.indexes) {
      const abs = resolve(root, raw)
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        throw new UsageError(`--index 指向的证据索引不存在：${raw}`)
      }
      files.push(abs)
    }
    return { files, missing, auto: false }
  }
  if (options.changes.length > 0) {
    for (const change of options.changes) {
      const abs = join(root, 'specs', 'changes', change, 'evidence.md')
      if (existsSync(abs) && statSync(abs).isFile()) files.push(abs)
      else missing.push(relPath(root, abs))
    }
    return { files, missing, auto: false }
  }
  const changeFiles = walkFiles(join(root, 'specs', 'changes'), (file) => basename(file) === 'evidence.md')
  const testingFiles = walkFiles(join(root, 'docs', 'testing'), (file) => /^EVIDENCE-.*\.md$/i.test(basename(file)))
  files.push(...changeFiles.sort(), ...testingFiles.sort())
  return { files, missing, auto: true }
}

/* ------------------------------------------------------------------ */
/* 生成器与产物绑定（MX-G-51）                                          */
/* ------------------------------------------------------------------ */

const BINDING_CHECK = '生成器绑定'
const SCRIPT_PATH_RE = /(?:^|\s)((?:\.\/)?scripts\/[^\s"'`]+)/g

function insideRoot(root, abs) {
  const rel = relative(root, abs)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function discoverFixtureManifests(root, options) {
  const explicit = options.fixtureManifests ?? []
  if (explicit.length > 0) return explicit.map((raw) => resolve(root, raw))
  return walkFiles(
    join(root, 'specs', 'test'),
    (file) => basename(file) === 'manifest.json' && basename(dirname(file)) === 'fixtures',
  ).sort()
}

function analyzeFixtureBinding(root, options) {
  const items = []
  const manifests = discoverFixtureManifests(root, options)
  if (manifests.length === 0) {
    items.push(
      item(
        'PASS',
        BINDING_CHECK,
        RULES.binding,
        'specs/test',
        0,
        '至少一份夹具清单',
        '未发现 specs/test/<域>/fixtures/manifest.json，本条无输入',
        '按 MX-9-23 在夹具清单写生成器路径、版本、校验命令与产物清单',
      ),
    )
    return items
  }
  const fail = (check, file, line, expected, actual, hint) => {
    items.push(item('FAIL', check, RULES.binding, file, line, expected, actual, hint))
  }
  for (const manifestPath of manifests) {
    const manifestRel = relPath(root, manifestPath)
    if (!existsSync(manifestPath) || !statSync(manifestPath).isFile()) {
      fail('清单可读', manifestRel, 1, '夹具清单存在', `清单不存在：${manifestRel}`, '按 MX-9-23 补 specs/test/<域>/fixtures/manifest.json')
      continue
    }
    let manifest
    try {
      manifest = JSON.parse(readTextSafe(manifestPath))
    } catch (error) {
      fail('清单可读', manifestRel, 1, '夹具清单是合法 JSON', `解析失败：${error.message}`, '按清单模板修正 JSON 语法')
      continue
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      fail('清单字段', manifestRel, 1, '夹具清单是 JSON 对象', `实际类型 ${Array.isArray(manifest) ? '数组' : typeof manifest}`, '把清单根写成对象')
      continue
    }
    const generator = manifest.generator && typeof manifest.generator === 'object' ? manifest.generator : null
    const generatorPath = generator && typeof generator.path === 'string' ? generator.path.trim() : ''
    const generatorVersion = generator && typeof generator.version === 'string' ? generator.version.trim() : ''
    const verifyCommand = typeof manifest.verifyCommand === 'string' ? manifest.verifyCommand.trim() : ''
    const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : []
    const before = items.length

    if (
      manifest.schemaVersion === undefined ||
      manifest.schemaVersion === null ||
      String(manifest.schemaVersion).trim() === ''
    ) {
      fail('清单字段', manifestRel, 1, 'schemaVersion 非空', '缺少 schemaVersion', '在清单根写 schemaVersion，当前取 1')
    }
    if (!generatorPath || !generatorVersion) {
      fail(
        '清单字段',
        manifestRel,
        1,
        'generator.path 与 generator.version 均非空',
        `path=${generatorPath || '空'}，version=${generatorVersion || '空'}`,
        '按 MX-9-23 补生成器路径与版本，版本须与产物内嵌值一致',
      )
    }
    const generatorAbs = generatorPath ? resolve(root, generatorPath) : ''
    const generatorExists =
      Boolean(generatorAbs) && insideRoot(root, generatorAbs) && existsSync(generatorAbs) && statSync(generatorAbs).isFile()
    if (generatorPath && !generatorExists) {
      fail('生成器文件', manifestRel, 1, '生成器文件存在', `生成器不存在或不在仓库根内：${generatorPath}`, '把生成器放到 scripts/ 下并在清单写仓库相对路径')
    }
    if (!verifyCommand) {
      fail('校验命令', manifestRel, 1, 'verifyCommand 非空', 'verifyCommand 为空', '按 MX-9-23 写一条同时完成生成与校验的命令')
    } else {
      const references = [...verifyCommand.matchAll(SCRIPT_PATH_RE)].map((match) => match[1])
      if (references.length === 0) {
        fail('校验命令', manifestRel, 1, '校验命令引用 scripts/ 下的脚本', `命令未引用 scripts/ 路径：${verifyCommand}`, '把校验命令写成 node scripts/... 的形式')
      }
      const missing = references.filter((reference) => {
        const abs = resolve(root, reference)
        return !insideRoot(root, abs) || !existsSync(abs) || !statSync(abs).isFile()
      })
      if (missing.length > 0) {
        fail('校验命令', manifestRel, 1, '校验命令引用的脚本存在', `缺失脚本：${missing.join('、')}`, '补脚本或改正 verifyCommand 路径')
      }
    }
    if (fixtures.length === 0) {
      fail('产物文件', manifestRel, 1, 'fixtures 至少一项', 'fixtures 为空', '在清单登记每个产物路径')
    }
    for (const fixture of fixtures) {
      const fixturePath = fixture && typeof fixture.path === 'string' ? fixture.path.trim() : ''
      const fixtureIdRaw = fixture && typeof fixture.id === 'string' ? fixture.id.trim() : ''
      if (!fixtureIdRaw) {
        fail('清单字段', manifestRel, 1, `${fixturePath || '产物'} 写 id`, 'fixture.id 为空', '在清单为每条产物写 FX-<域前缀>-<序号> 格式的 id')
      }
      const fixtureId = fixtureIdRaw || fixturePath || '未命名产物'
      if (!fixturePath) {
        fail('产物文件', manifestRel, 1, `${fixtureId} 写 path`, 'fixture.path 为空', '在清单写仓库相对产物路径')
        continue
      }
      const artifactAbs = resolve(root, fixturePath)
      const artifactRel = relPath(root, artifactAbs)
      if (!insideRoot(root, artifactAbs) || !existsSync(artifactAbs) || !statSync(artifactAbs).isFile()) {
        fail('产物文件', manifestRel, 1, `${fixtureId} 的产物存在`, `产物不存在或不在仓库根内：${fixturePath}`, '重跑生成命令，产物落盘后重试')
        continue
      }
      if (generatorExists) {
        const generatorTime = statSync(generatorAbs).mtimeMs
        const artifactTime = statSync(artifactAbs).mtimeMs
        if (generatorTime > artifactTime) {
          fail(
            '生成器时序',
            artifactRel,
            1,
            `${fixtureId} 的产物不早于生成器`,
            `生成器 mtime ${new Date(generatorTime).toISOString()} 晚于产物 mtime ${new Date(artifactTime).toISOString()}`,
            '重跑生成与校验命令，让产物晚于生成器',
          )
        }
      }
      if (fixturePath.toLowerCase().endsWith('.json')) {
        let artifact
        try {
          artifact = JSON.parse(readTextSafe(artifactAbs))
        } catch (error) {
          fail('产物版本', artifactRel, 1, `${fixtureId} 的产物是合法 JSON`, `解析失败：${error.message}`, '重跑生成器，产物写合法 JSON')
          continue
        }
        const embedded = artifact && typeof artifact === 'object' ? artifact.generatorVersion : undefined
        if (typeof embedded !== 'string' || !embedded.trim()) {
          fail('产物版本', artifactRel, 1, `${fixtureId} 的根字段 generatorVersion 非空`, '产物根字段 generatorVersion 缺失', '生成器在产物根写 generatorVersion，值与清单 generator.version 相同')
        } else if (generatorVersion && embedded.trim() !== generatorVersion) {
          fail('产物版本', artifactRel, 1, `${fixtureId} 的 generatorVersion 等于 ${generatorVersion}`, `产物写 ${embedded.trim()}`, '重跑生成器，或按 MX-6-11 同步清单版本')
        }
      }
    }
    if (generatorExists && generator && typeof generator.sha256 === 'string' && generator.sha256.trim()) {
      const expectedHash = generator.sha256.trim().replace(/^sha256:/i, '').toLowerCase()
      try {
        const actualHash = createHash('sha256').update(readFileSync(generatorAbs)).digest('hex')
        if (expectedHash !== actualHash) {
          fail('生成器哈希', manifestRel, 1, `生成器 sha256 为 ${expectedHash}`, `实际为 ${actualHash}`, '生成器内容已变，更新清单哈希并重跑生成与校验命令')
        }
      } catch (error) {
        fail('生成器哈希', manifestRel, 1, '生成器文件可读', `读取失败：${error.message}`, '检查生成器路径与文件权限后重跑')
      }
    }
    if (items.length === before) {
      items.push(
        item(
          'PASS',
          BINDING_CHECK,
          RULES.binding,
          manifestRel,
          0,
          '生成器不晚于产物、校验命令可解析、产物版本与哈希一致',
          `${fixtures.length} 个产物与生成器 ${generatorPath} 版本 ${generatorVersion} 绑定一致`,
        ),
      )
    }
  }
  return items
}

/* ------------------------------------------------------------------ */
/* 逐行校验                                                             */
/* ------------------------------------------------------------------ */

function isPlaceholderPath(value) {
  return PLACEHOLDER_PATH.test(String(value ?? '').trim())
}

function checkPath(root, value, result) {
  const raw = String(value ?? '').trim()
  if (isPlaceholderPath(raw)) {
    // docs/framework/GATES.md:248（MX-G-39，error）：路径字段非空时按存在性检查，
    // 占位值无法打开，pass 证据必须给可打开的路径，因此记 error 而不是 warn。
    if (result === 'pass') {
      return { status: 'FAIL', detail: `pass 证据的路径是占位值 ${raw}，必须给可打开的路径` }
    }
    return { status: 'PASS', detail: '占位值，不要求路径存在' }
  }
  if (URL_PATH.test(raw)) {
    // docs/framework/GATES.md:248（MX-G-39，error）：URL 要求同目录有本地快照或截图，
    // 检查器无法离线核验 URL 本身，因此要求把快照落盘并改指向本地文件，否则记 error。
    return { status: 'FAIL', detail: `URL 证据无法离线核验（${raw}），需在同目录提供本地快照或截图并改指向该文件` }
  }
  // 路径列允许带节锚点（如 `.../evidence.md §1`），锚点不是路径的一部分。
  const target = raw.replace(/\s*§\s*\d+(?:\.\d+)*\s*$/, '')
  const abs = isAbsolute(target) ? target : join(root, ...normalizePath(target).split('/'))
  if (!existsSync(abs)) return { status: 'FAIL', detail: `路径不存在：${raw}` }
  let stats
  try {
    stats = statSync(abs)
  } catch (error) {
    return { status: 'FAIL', detail: `路径不可读：${raw}（${error.code ?? error.message}）` }
  }
  if (!stats.isFile()) return { status: 'FAIL', detail: `路径不是文件：${raw}` }
  if (stats.size === 0) return { status: 'FAIL', detail: `路径指向空文件：${raw}` }
  return { status: 'PASS', detail: `${raw}（${stats.size} B）` }
}

function checkReason(result, reason) {
  const raw = String(reason ?? '').trim()
  const tokens = raw.match(/R-[A-Z]+/g) ?? []
  const codes = [...new Set(tokens.filter((token) => REASON_SET.has(token)))]
  const illegal = [...new Set(tokens.filter((token) => !REASON_SET.has(token)))]
  if (result === 'missing') {
    if (codes.length === 0) {
      return { status: 'FAIL', detail: illegal.length > 0 ? `非法原因码 ${illegal.join('、')}` : 'missing 缺少原因码，应为 R-SCRIPT' }
    }
    if (codes.length > 1) return { status: 'FAIL', detail: `missing 写了多个原因码：${codes.join('、')}` }
    if (codes[0] !== 'R-SCRIPT') return { status: 'FAIL', detail: `missing 的原因码必须是 R-SCRIPT，实际 ${codes[0]}` }
    return { status: 'PASS', detail: 'R-SCRIPT' }
  }
  if (result === 'blocked') {
    if (codes.length === 0) {
      return { status: 'FAIL', detail: illegal.length > 0 ? `非法原因码 ${illegal.join('、')}` : 'blocked 缺少原因码' }
    }
    if (codes.length > 1) return { status: 'FAIL', detail: `blocked 写了多个原因码：${codes.join('、')}` }
    if (codes[0] === 'R-SCRIPT') return { status: 'FAIL', detail: 'blocked 不得使用 R-SCRIPT' }
    if (!BLOCKED_REASONS.has(codes[0])) return { status: 'FAIL', detail: `blocked 原因码必须是七码中除 R-SCRIPT 外的六码之一，实际 ${codes[0]}` }
    return { status: 'PASS', detail: codes[0] }
  }
  if (result === 'partial') {
    if (codes.length === 0) {
      return { status: 'FAIL', detail: illegal.length > 0 ? `非法原因码 ${illegal.join('、')}` : 'partial 缺少原因码' }
    }
    if (codes.length > 1) return { status: 'FAIL', detail: `partial 写了多个原因码：${codes.join('、')}` }
    if (codes[0] === 'R-SCRIPT') {
      return { status: 'WARN', detail: 'partial 使用 R-SCRIPT，模板要求按 missing 处理' }
    }
    if (codes[0] === 'R-DRILL') {
      return { status: 'FAIL', detail: 'partial 不得使用 R-DRILL，该码只用于 blocked 的恢复演练未通过' }
    }
    return { status: 'PASS', detail: codes[0] }
  }
  if (result === 'pass') {
    // docs/framework/GATES.md:251（MX-G-42，error）：pass 的原因码列必须写「不适用」，
    // 空、带原因码或非法原因码都按 error 记。
    if (!raw) return { status: 'FAIL', detail: '结果 pass 但原因码列为空，应写不适用' }
    if (codes.length > 0) return { status: 'FAIL', detail: `pass 的原因码列应为不适用，实际 ${codes.join('、')}` }
    if (illegal.length > 0) return { status: 'FAIL', detail: `非法原因码 ${illegal.join('、')}` }
    return { status: 'PASS', detail: '不适用' }
  }
  return { status: 'PASS', detail: '判定值非法，原因码交由判定值检查处理' }
}

const VAGUE_CONCLUSION = /^(通过|已完成|ok|pass)$/i
const RELEASE_FIELDS = [
  { key: '解除条件', test: /解除/ },
  { key: '待执行动作', test: /(复跑|重跑|执行|补做|补登)/ },
  { key: '责任人', test: /(责任人|复核人|执行人)/ },
  { key: '到期日', test: /\d{4}-\d{2}-\d{2}/ },
]

function checkRelease(result, values) {
  if (result === 'pass') {
    if (VAGUE_CONCLUSION.test(String(values.reason ?? '').trim())) {
      return { status: 'FAIL', detail: 'pass 的原因码列写成空泛结论，应写不适用并给可复跑线索' }
    }
    return null
  }
  if (!['partial', 'missing', 'blocked'].includes(result)) return null
  const text = `${values.reason ?? ''} ${values.note ?? ''}`
  if (VAGUE_CONCLUSION.test(String(values.reason ?? '').trim()) || VAGUE_CONCLUSION.test(String(values.note ?? '').trim())) {
    return { status: 'FAIL', detail: '证据结论只写「通过」或「已完成」，没有可复现线索' }
  }
  const missing = RELEASE_FIELDS.filter((field) => !field.test.test(text)).map((field) => field.key)
  if (missing.length > 0) {
    return { status: 'FAIL', detail: `未验证项缺少${missing.join('、')}` }
  }
  return { status: 'PASS', detail: '解除信息齐全' }
}

function formatStamp(date) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000)
  return `${shifted.toISOString().slice(0, 16)}+08:00`
}

function checkFreshness(now, buildTime, maxAgeDays, value, result) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const time = parseDate(raw)
  if (!time) {
    return {
      status: result === 'pass' ? 'FAIL' : 'WARN',
      detail: `生成时间无法解析：${raw}`,
    }
  }
  const ageDays = (now.getTime() - time.getTime()) / 86_400_000
  const facts = []
  if (buildTime && time.getTime() < buildTime.getTime()) {
    facts.push(`生成时间 ${raw} 早于本轮构建 ${formatStamp(buildTime)}`)
  }
  if (ageDays > maxAgeDays) {
    facts.push(`距门禁运行 ${ageDays.toFixed(1)} 天，超过 ${maxAgeDays} 天`)
  }
  if (facts.length === 0) return { status: 'PASS', detail: `${raw}，在有效期内` }
  return { status: result === 'pass' ? 'FAIL' : 'WARN', detail: facts.join('；') }
}

/* ------------------------------------------------------------------ */
/* 分析                                                                 */
/* ------------------------------------------------------------------ */

function item(status, check, rule, file, line, expected, actual, hint = '', ac = '') {
  return {
    gate: GATE,
    rule,
    severity: status === 'FAIL' ? 'error' : status === 'WARN' ? 'warn' : 'pass',
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

function analyze(options) {
  const root = options.root
  const now = options.now ?? new Date()
  const buildTime = options.buildTime ?? null
  const maxAgeDays = options.maxAgeDays
  const items = []
  const acSet = loadAcSet(root, options)
  const indexes = resolveIndexes(root, options)

  for (const missing of indexes.missing) {
    items.push(
      item(
        'WARN',
        '证据索引',
        RULES.record,
        missing,
        0,
        '变更包 evidence.md 存在',
        '证据索引文件不存在，按 0 条证据行处理',
        '在变更包根目录补 evidence.md，并按 docs/framework/templates/evidence-index.md 建表',
      ),
    )
  }

  const rows = []
  for (const abs of indexes.files) {
    const parsed = parseEvidenceFile(root, abs)
    if (parsed.error) {
      items.push(item('WARN', '证据索引', RULES.record, parsed.file, 0, '证据索引可读', parsed.error))
    }
    rows.push(...parsed.rows)
  }

  if (rows.length === 0) {
    const scanned = indexes.files.length
    items.push(
      item(
        'WARN',
        '证据索引',
        RULES.record,
        '-',
        0,
        '至少一张符合模板的 evidence-index 登记表',
        `扫描 ${scanned} 个索引文件，未解析到证据登记表（0 行）`,
        '按 docs/framework/templates/evidence-index.md 的 15 列建表，表头需含证据编号与判定结果',
      ),
    )
  }

  if (acSet.size === 0 && rows.length === 0) {
    throw new UsageError(
      '没有可检查的内容：未提供 AC 清单，且证据索引中没有符合模板的证据行；' +
        '请用 --test-plan、--change 或 --ac 指定 AC，并确认索引表头含证据编号与判定结果',
    )
  }

  // MX-G-38 AC 覆盖
  if (acSet.size === 0) {
    items.push(
      item(
        'WARN',
        '证据记录',
        RULES.record,
        '-',
        0,
        '提供 AC 清单以核对覆盖',
        `未提供 AC 清单，仅校验已解析的 ${rows.length} 条证据行`,
        '用 --test-plan、--change 或 --ac 指定本轮 AC',
      ),
    )
  } else {
    let covered = 0
    for (const [ac, meta] of acSet) {
      const found = rows.some((row) => row.acs.includes(ac))
      if (found) {
        covered += 1
        continue
      }
      const status = meta.status ? `test-plan 状态 ${meta.status}` : '状态未声明'
      items.push(
        item(
          'FAIL',
          '证据记录',
          RULES.record,
          meta.file,
          meta.line,
          '证据索引至少一行挂该 AC',
          `证据索引无该 AC 的记录（${status}）`,
          status.includes('missing') || status.includes('blocked')
            ? '补一行 missing（R-SCRIPT）或 blocked（R-SCRIPT 外的六码之一）证据，写解除条件与解除后的复跑方式'
            : '补证据行，或把该 AC 改判为 missing/blocked 并写原因码',
          ac,
        ),
      )
    }
    if (covered === acSet.size) {
      items.push(
        item(
          'PASS',
          '证据记录',
          RULES.record,
          '-',
          0,
          '每条 AC 至少一行证据',
          `${acSet.size} 条 AC 均有证据行（共 ${rows.length} 行）`,
        ),
      )
    }
  }

  // 逐行检查
  const problems = {
    fields: [],
    type: [],
    verdict: [],
    path: [],
    reason: [],
    freshness: [],
    rerun: [],
    judge: [],
    card: [],
    release: [],
  }
  let checkedPaths = 0
  let checkedTimes = 0
  const fieldComplete = new Map()

  for (const row of rows) {
    const values = row.values
    const missingFields = []
    for (const [field, label] of CORE_FIELDS) {
      if (row.legacy && row.absent.has(field)) continue
      if (field === 'ac') {
        if (row.acs.length === 0) missingFields.push(label)
        continue
      }
      if (!String(values[field] ?? '').trim()) missingFields.push(label)
    }
    if (missingFields.length > 0) {
      problems.fields.push({ row, detail: `缺少字段 ${missingFields.join('、')}` })
    } else {
      fieldComplete.set(row, true)
    }

    if (values.type && !TYPE_SET.has(values.type)) {
      problems.type.push({ row, detail: `证据类型不在允许集合内：${values.type}` })
    }

    const resultOk = STATUS_SET.has(values.result)
    if (values.result && !resultOk) {
      problems.verdict.push({ row, detail: `判定值必须是 pass、partial、missing、blocked，实际 ${values.result}` })
    }

    if (values.path) {
      const pathCheck = checkPath(root, values.path, values.result)
      if (pathCheck.status === 'FAIL') problems.path.push({ row, detail: pathCheck.detail })
      else if (pathCheck.status === 'WARN') problems.path.push({ row, detail: pathCheck.detail, severity: 'WARN' })
      else checkedPaths += 1
    }

    if (resultOk && !(row.legacy && row.absent.has('reason'))) {
      const reasonCheck = checkReason(values.result, values.reason)
      if (reasonCheck.status === 'FAIL') problems.reason.push({ row, detail: reasonCheck.detail })
      else if (reasonCheck.status === 'WARN') problems.reason.push({ row, detail: reasonCheck.detail, severity: 'WARN' })
    }

    if (values.time) {
      const freshness = checkFreshness(now, buildTime, maxAgeDays, values.time, values.result)
      if (freshness) {
        checkedTimes += 1
        if (freshness.status !== 'PASS') problems.freshness.push({ row, detail: freshness.detail, severity: freshness.status })
      }
    }

    if (values.rerun) {
      if (!['是', '否'].includes(values.rerun)) {
        // docs/framework/GATES.md:249（MX-G-40，error）：可复跑必须写「是」或「否」。
        problems.rerun.push({ row, detail: `可复跑必须是“是”或“否”，实际 ${values.rerun}` })
      } else if (values.rerun === '否' && values.result === 'pass') {
        problems.rerun.push({ row, detail: '可复跑写“否”却判 pass，按违规处理' })
      }
    }

    if (values.invalid) {
      if (!['有效', '失效'].includes(values.invalid)) {
        problems.freshness.push({ row, detail: `失效标记必须是“有效”或“失效”，实际 ${values.invalid}` })
      } else if (values.invalid === '失效' && values.result === 'pass') {
        problems.freshness.push({ row, detail: '失效标记为“失效”的证据不得判 pass' })
      }
    }

    if (!values.judge) {
      // 旧表没有判定人列，列不存在时不记缺失（不降级成 warning，也不记 error）。
      if (!(row.legacy && row.absent.has('judge'))) {
        problems.judge.push({ row, detail: '缺少判定人，证据按未判定处理' })
      }
    } else if (!JUDGE_PATTERN.test(values.judge)) {
      // docs/framework/GATES.md:249（MX-G-40，error）：判定人写「自动」或「人工:<动作>」，
      // 缺失或写成其他形式按 error 记；此处不得降为 warning。
      problems.judge.push({ row, detail: `判定人应写“自动”或“人工:<动作>”，实际 ${values.judge}` })
    }

    if (!values.card && !(row.legacy && row.absent.has('card'))) {
      problems.card.push({ row, detail: '缺少关联任务卡，不计入收口范围' })
    }

    if (resultOk && !(row.legacy && row.absent.has('note') && row.absent.has('reason'))) {
      const releaseCheck = checkRelease(values.result, values)
      if (releaseCheck && releaseCheck.status === 'FAIL') problems.release.push({ row, detail: releaseCheck.detail })
    }
  }

  const emit = (bucket, check, rule, passDetail, failHint) => {
    const entries = problems[bucket]
    if (entries.length === 0) {
      if (rows.length > 0) items.push(item('PASS', check, rule, '-', 0, passDetail.expected, passDetail.actual))
      return
    }
    for (const entry of entries) {
      const status = entry.severity ?? 'FAIL'
      items.push(
        item(status, check, rule, entry.row.file, entry.row.line, passDetail.expected, entry.detail, failHint, entry.row.acs[0] ?? ''),
      )
    }
  }

  if (rows.length > 0) {
    emit(
      'fields',
      '核心字段',
      RULES.fields,
      { expected: '十五个必填字段非空', actual: `${fieldComplete.size}/${rows.length} 条证据行字段齐全` },
      '按 docs/framework/templates/evidence-index.md 补字段，缺字段的行不得判 pass',
    )
    emit(
      'type',
      '证据类型',
      RULES.type,
      { expected: `证据类型属于 ${TYPE_VALUES.length} 个允许值`, actual: `${rows.length} 条证据类型合法` },
      '改为断言脚本、单元测试日志、接口响应、集成日志、端到端截图、人工记录之一',
    )
    emit(
      'verdict',
      '判定值',
      RULES.verdict,
      { expected: '判定值为 pass、partial、missing、blocked 之一', actual: `${rows.length} 条判定值合法` },
      '按四值改写，四值之外的写法按非法状态处理',
    )
    emit(
      'path',
      '证据路径',
      RULES.path,
      { expected: '路径存在且非空', actual: `${checkedPaths} 条路径可打开` },
      '补证据文件或改路径；URL 证据需补本地快照或截图',
    )
    emit(
      'reason',
      '原因码',
      RULES.reason,
      { expected: 'missing 写 R-SCRIPT，blocked 写 R-SCRIPT 外的六码之一，partial 写除 R-DRILL 外的六码之一', actual: `${rows.length} 条原因码与状态匹配` },
      '按 docs/framework/domains/testing.md 第 8 节改写原因码与解除条件',
    )
    emit(
      'freshness',
      '证据时效',
      RULES.freshness,
      { expected: '生成时间不早于本轮构建且不超过有效期', actual: `${checkedTimes} 条证据在有效期内` },
      '重跑并写本轮构建时间，或改判 missing/blocked 并写原因码',
    )
    emit(
      'rerun',
      '可复跑',
      RULES.rerun,
      { expected: '可复跑写“是”或“否”，判 pass 时不得写“否”', actual: `${rows.length} 条可复跑取值合法` },
      '改为“是”；确不可复跑时给出替代复核方式并不得判 pass',
    )
    emit(
      'judge',
      '判定人',
      RULES.fields,
      { expected: '判定人写“自动”或“人工:<角色>”', actual: `${rows.length} 条判定人齐备` },
      '补判定人；判定人与用例作者分离',
    )
    emit(
      'card',
      '关联任务卡',
      RULES.fields,
      { expected: '关联任务卡非空', actual: `${rows.length} 条挂到任务卡` },
      '补派单卡编号，找不到卡的证据不计入收口范围',
    )
    emit(
      'release',
      '解除信息',
      RULES.release,
      { expected: '未验证项写明解除条件、待执行动作、责任人与到期日，结论不得只写通过', actual: `${rows.length} 条未验证项解除信息齐全` },
      '按 MX-9-16 补解除条件、待执行动作、责任人与到期日，空泛结论改为可复跑线索',
    )
  }

  // MX-G-47 覆盖汇总：变更 Covers 与 test-plan 的并集逐条核对
  if (acSet.size > 0) {
    const missingAcs = [...acSet.keys()].filter((ac) => !rows.some((row) => row.acs.includes(ac)))
    if (missingAcs.length > 0) {
      items.push(
        item(
          'FAIL',
          '覆盖汇总',
          RULES.coverAll,
          '-',
          0,
          '证据索引逐条覆盖 Covers 与 test-plan 的并集',
          `差集 ${missingAcs.length} 条：${missingAcs.join('、')}`,
          '按缺号补证据行，同一行只写一个 AC 编号',
        ),
      )
    } else {
      items.push(
        item(
          'PASS',
          '覆盖汇总',
          RULES.coverAll,
          '-',
          0,
          '证据索引逐条覆盖 Covers 与 test-plan 的并集',
          `${acSet.size} 条 AC 均有独立证据行`,
        ),
      )
    }
  }

  if (!buildTime) {
    items.push(
      item(
        'WARN',
        '构建时间',
        RULES.freshness,
        '-',
        0,
        '提供本轮构建时间',
        `未提供 --build-time，仅按 ${maxAgeDays} 天有效期判定，无法判断证据是否早于本轮构建`,
        '用 --build-time 传本轮 buildId 对应的开始时间或提交时间',
      ),
    )
  }

  items.push(...analyzeFixtureBinding(root, options))

  return { items, rows, acs: acSet, indexes }
}

function summarize(items) {
  return {
    total: items.length,
    pass: items.filter((entry) => entry.status === 'PASS').length,
    warn: items.filter((entry) => entry.status === 'WARN').length,
    fail: items.filter((entry) => entry.status === 'FAIL').length,
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
    `统计：检查 ${counts.total} 项，PASS ${counts.pass}，WARN ${counts.warn}，FAIL ${counts.fail}，error ${counts.fail}，warn ${counts.warn}，AC ${result.acs.size} 条，证据行 ${result.rows.length} 条`,
  )
  if (counts.fail > 0) console.log(`FAILED: ${counts.fail} error(s), ${counts.warn} warning(s)`)
  else console.log(`PASS (gate: ${GATE}, checks: ${counts.total}, warnings: ${counts.warn})`)
}

/* ------------------------------------------------------------------ */
/* 自检夹具                                                             */
/* ------------------------------------------------------------------ */

const PASS_PLAN = [
  '# P1-FX 自检夹具',
  '',
  '| # | AC | TC | 类型 | 自动化位置 | 状态 | 证据 |',
  '|---|---|---|---|---|---|---|',
  '| 1 | AC-FX-001-01 | TC-FX-001 | unit | `scripts/ac/AC-FX-001-01.mjs` | pass | EV-FX-001 |',
  '| 2 | AC-FX-001-02 | TC-FX-002 | unit | `scripts/ac/AC-FX-001-02.mjs` | partial | EV-FX-002 |',
  '| 3 | AC-FX-001-03 | TC-FX-003 | unit | 缺失 | missing | EV-FX-003 |',
  '| 4 | AC-FX-001-04 | TC-FX-004 | unit | 缺失 | blocked | EV-FX-004 |',
  '',
].join('\n')

const PASS_EVIDENCE = [
  '# 证据索引 · P1-FX',
  '',
  '| 证据编号 | AC 编号 | 证据类型 | 路径 | 生成命令 | 生成时间 | 判定人 | 判定结果 | 未验证原因码 | 关联任务卡 | 轮次 | 可复跑 | 构建版本 | 失效标记 | 备注 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  '| EV-FX-001 | AC-FX-001-01 | 断言脚本 | `docs/testing/fx/pass.png` | `node scripts/ac/AC-FX-001-01.mjs` | `2026-11-24T11:00+08:00` | 自动 | pass | 不适用 | TASK-CHG-FX-001-01 | R1 | 是 | `main@abc123，buildId fx-1，端口 8787` | 有效 | 无 |',
  '| EV-FX-002 | AC-FX-001-02 | 单元测试日志 | `docs/testing/fx/partial.log` | `node node_modules/vitest/vitest.mjs run` | `2026-11-24T11:10+08:00` | 人工:测试 | partial | R-EXT：上游 403；解除：恢复凭据后重跑；责任人：测试；到期日：2026-12-01 | TASK-CHG-FX-001-02 | R1 | 是 | `main@abc123，buildId fx-1，端口 8787` | 有效 | 未完成分支为主路径 |',
  '| EV-FX-003 | AC-FX-001-03 | 人工记录 | 不适用 | 不适用 | `2026-11-24T11:20+08:00` | 人工:测试 | missing | R-SCRIPT：断言脚本待建；解除：脚本落盘后复跑；责任人：测试；到期日：2026-12-01 | TASK-CHG-FX-001-03 | R1 | 否 | `main@abc123，buildId fx-1，端口 8787` | 有效 | 断言脚本未落盘 |',
  '| EV-FX-004 | AC-FX-001-04 | 集成日志 | `docs/testing/fx/blocked.log` | `go test ./... -run TestBlocked` | `2026-11-24T11:30+08:00` | 自动 | blocked | R-ENV：CDP 无监听；解除：启动 Chrome 后复跑；责任人：测试；到期日：2026-12-01 | TASK-CHG-FX-001-04 | R1 | 是 | `main@abc123，buildId fx-1，端口 8787` | 有效 | 环境恢复后复跑 |',
  '',
].join('\n')

function writeBindingFixture(root, mode) {
  const generator = 'scripts/ac/fx-generator.mjs'
  const passing = mode === 'pass'
  const generatorContent = '// 自检用夹具生成器，版本 1.2.0\n'
  writeFixture(root, generator, generatorContent)
  const generatorHash = createHash('sha256').update(generatorContent).digest('hex')
  const fixtures = [
    {
      id: 'FX-FX-001',
      path: 'specs/test/P1-FX/fixtures/fx/data.json',
      covers: ['TC-FX-001'],
      generateCommand: 'node scripts/ac/fx-generator.mjs --write',
      keyFields: ['count'],
      owner: '测试',
      invalidWhen: 'schemaVersion 变化',
    },
  ]
  if (!passing) {
    fixtures.push({
      id: 'FX-FX-002',
      path: 'specs/test/P1-FX/fixtures/fx/absent.json',
      covers: ['TC-FX-002'],
      generateCommand: 'node scripts/ac/fx-generator.mjs --write',
      keyFields: ['count'],
      owner: '测试',
      invalidWhen: 'schemaVersion 变化',
    })
  }
  const manifest = {
    schemaVersion: 1,
    generator: { path: generator, version: '1.2.0', sha256: passing ? generatorHash : '0'.repeat(64) },
    verifyCommand: passing ? 'node scripts/ac/fx-generator.mjs --verify' : 'node scripts/ac/missing-verifier.mjs --verify',
    fixtures,
  }
  writeFixture(root, 'specs/test/P1-FX/fixtures/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)
  writeFixture(
    root,
    'specs/test/P1-FX/fixtures/fx/data.json',
    `${JSON.stringify({ generatorVersion: passing ? '1.2.0' : '1.1.0', count: 2 }, null, 2)}\n`,
  )
  const generatorTime = new Date(passing ? '2026-11-24T10:00:00+08:00' : '2026-11-24T10:10:00+08:00')
  const artifactTime = new Date('2026-11-24T10:05:00+08:00')
  utimesSync(join(root, generator), generatorTime, generatorTime)
  utimesSync(join(root, 'specs/test/P1-FX/fixtures/fx/data.json'), artifactTime, artifactTime)
}

function buildPassFixture(root) {
  writeFixture(root, 'specs/test/P1-FX/test-plan.md', PASS_PLAN)
  writeFixture(root, 'docs/testing/EVIDENCE-20261124.md', PASS_EVIDENCE)
  writeFixture(root, 'docs/testing/fx/pass.png', 'PNG 自检占位')
  writeFixture(root, 'docs/testing/fx/partial.log', '2 passed, 1 skipped')
  writeFixture(root, 'docs/testing/fx/blocked.log', 'blocked: CDP 9223 unreachable')
  writeBindingFixture(root, 'pass')
}

const FAIL_PLAN = [
  '# P1-FX 自检夹具',
  '',
  '| # | AC | TC | 类型 | 自动化位置 | 状态 | 证据 |',
  '|---|---|---|---|---|---|---|',
  '| 1 | AC-FX-001-01 | TC-FX-001 | unit | 缺失 | pass | EV-FX-001 |',
  '| 2 | AC-FX-001-02 | TC-FX-002 | unit | 缺失 | pass | EV-FX-002 |',
  '| 3 | AC-FX-001-03 | TC-FX-003 | unit | 缺失 | pass | EV-FX-003 |',
  '| 4 | AC-FX-001-04 | TC-FX-004 | unit | 缺失 | pass | EV-FX-004 |',
  '| 5 | AC-FX-001-05 | TC-FX-005 | unit | 缺失 | missing | EV-FX-005 |',
  '| 6 | AC-FX-001-06 | TC-FX-006 | unit | 缺失 | pass | EV-FX-006 |',
  '',
].join('\n')

const FAIL_EVIDENCE = [
  '# 证据索引 · P1-FX',
  '',
  '| 证据编号 | AC 编号 | 证据类型 | 路径 | 生成命令 | 生成时间 | 判定人 | 判定结果 | 未验证原因码 | 关联任务卡 | 轮次 | 可复跑 | 构建版本 | 失效标记 | 备注 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  '| EV-FX-002 | AC-FX-001-02 | 断言脚本 | `docs/testing/fx/nope.png` | `node scripts/ac/AC-FX-001-02.mjs` | `2026-11-24T11:00+08:00` | 自动 | pass | 不适用 | TASK-CHG-FX-001-02 | R1 | 是 | `main@abc123，buildId fx-1` | 有效 | 无 |',
  '| EV-FX-003 | AC-FX-001-03 | 断言脚本 | `docs/testing/fx/pass.png` |  | `2026-11-24T11:00+08:00` | 自动 | pass | 不适用 | TASK-CHG-FX-001-03 |  |  |  |  |  |',
  '| EV-FX-004 | AC-FX-001-04 | 断言脚本 | `docs/testing/fx/pass.png` | `node scripts/ac/AC-FX-001-04.mjs` | `2026-11-24T11:00+08:00` | 自动 | 通过 | 不适用 | TASK-CHG-FX-001-04 | R1 | 是 | `main@abc123，buildId fx-1` | 有效 | 无 |',
  '| EV-FX-005 | AC-FX-001-05 | 人工记录 | 不适用 | 不适用 | `2026-11-24T11:00+08:00` | 人工:测试 | missing | R-ENV：断言脚本待建 | TASK-CHG-FX-001-05 | R1 | 否 | `main@abc123，buildId fx-1` | 有效 | 无 |',
  '| EV-FX-006 | AC-FX-001-06 | 断言脚本 | `docs/testing/fx/pass.png` | `node scripts/ac/AC-FX-001-06.mjs` | `2026-11-01T10:00+08:00` | 自动 | pass | 不适用 | TASK-CHG-FX-001-06 | R1 | 是 | `main@abc123，buildId fx-1` | 有效 | 无 |',
  '',
].join('\n')

function buildFailFixture(root) {
  writeFixture(root, 'specs/test/P1-FX/test-plan.md', FAIL_PLAN)
  writeFixture(root, 'docs/testing/EVIDENCE-20261124.md', FAIL_EVIDENCE)
  writeFixture(root, 'docs/testing/fx/pass.png', 'PNG 自检占位')
  writeBindingFixture(root, 'fail')
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

function parseArgs(argv) {
  const options = {
    root: REPO_ROOT,
    json: false,
    selfTest: false,
    help: false,
    testPlans: [],
    changes: [],
    indexes: [],
    acs: [],
    fixtureManifests: [],
    now: null,
    buildTime: null,
    maxAgeDays: 7,
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
      else if (arg === '--root') options.root = resolve(valueAt(index++, '--root'))
      else if (arg === '--test-plan') options.testPlans.push(valueAt(index++, '--test-plan'))
      else if (arg === '--change') options.changes.push(valueAt(index++, '--change'))
      else if (arg === '--index') options.indexes.push(valueAt(index++, '--index'))
      else if (arg === '--ac') options.acs.push(valueAt(index++, '--ac'))
      else if (arg === '--fixture-manifest') options.fixtureManifests.push(valueAt(index++, '--fixture-manifest'))
      else if (arg === '--now') options.now = valueAt(index++, '--now')
      else if (arg === '--build-time') options.buildTime = valueAt(index++, '--build-time')
      else if (arg === '--max-age-days') {
        const value = Number(valueAt(index++, '--max-age-days'))
        if (!Number.isFinite(value) || value <= 0) throw new UsageError('--max-age-days 必须是正数')
        options.maxAgeDays = value
      } else if (arg.startsWith('-')) throw new UsageError(`未知参数 ${arg}`)
      else throw new UsageError(`多余的位置参数 ${arg}；证据门禁不用位置参数`)
    }
    if (options.now) {
      const parsed = parseDate(options.now)
      if (!parsed) throw new UsageError(`--now 无法解析：${options.now}`)
      options.now = parsed
    }
    if (options.buildTime) {
      const parsed = parseDate(options.buildTime)
      if (!parsed) throw new UsageError(`--build-time 无法解析：${options.buildTime}`)
      options.buildTime = parsed
    }
  } catch (error) {
    options.error = error.message
  }
  return options
}

function printHelp() {
  console.log(
    [
      'check-evidence.mjs — 证据完整性门禁',
      '',
      '用法：',
      '  node scripts/check-evidence.mjs --test-plan specs/test/P1-CONV/test-plan.md',
      '  node scripts/check-evidence.mjs --change CHG-CONV-007',
      '  node scripts/check-evidence.mjs --index <证据索引> --ac AC-X-001-01',
      '',
      '选项：',
      '  --test-plan <文件>    从 test-plan 矩阵取 AC 与状态；可重复',
      '  --change <CHG-ID>     从变更包 spec 的 Covers 取 AC，并读该包 evidence.md；可重复',
      '  --index <文件>        指定证据索引；可重复；省略时自动找 specs/changes/*/evidence.md',
      '                        与 docs/testing/EVIDENCE-*.md',
      '  --ac <AC-ID>          直接追加 AC；可重复',
      '  --fixture-manifest <文件>  指定夹具清单；可重复；省略时自动找',
      '                        specs/test/*/fixtures/manifest.json',
      '  --now <ISO 时间>      门禁运行时间，用于过期判定；默认当前时间',
      '  --build-time <ISO>    本轮构建开始时间；证据早于该时间按失效处理',
      '  --max-age-days <N>    证据有效期天数，默认 7',
      '  --root <目录>         仓库根，默认脚本所在目录的上一级',
      '  --json                输出对象数组，每项含 gate/rule/severity/path/line/ac/hint',
      '  --self-test           在 .tmp/ 下造通过样例与失败样例，跑完移入隔离目录，不删除文件',
      '  --help                显示本说明',
      '',
      '检查项：证据记录 MX-G-38、证据路径 MX-G-39、十五个核心字段与判定值 MX-G-40、证据时效',
      'MX-G-41、原因码 MX-G-42、解除信息与空泛结论 MX-G-43、并集覆盖 MX-G-47、生成器与产物',
      '绑定 MX-G-51。AC 无证据行、路径断链、核心字段缺失、判定值非法、原因码与状态不匹配、',
      'pass 证据过期、未验证项缺解除信息、生成器晚于产物、校验命令引用的脚本缺失、产物版本',
      '与清单不一致记 error；非 pass 证据过期记 warn。',
      '',
      '证据类型只接受六类：断言脚本、单元测试日志、接口响应、集成日志、端到端截图、',
      '人工记录。判定值只接受 pass、partial、missing、blocked 四值。',
      '',
      '退出码：0 通过或仅 warn；1 存在 error；2 参数或环境错误。',
      '',
      '示例：',
      '  node scripts/check-evidence.mjs --test-plan specs/test/P1-CONV/test-plan.md --json',
      '  node scripts/check-evidence.mjs --change CHG-CONV-007 --build-time 2026-11-24T18:16+08:00',
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
    buildPassFixture(passRoot)
    buildFailFixture(failRoot)
    const baseOptions = {
      root: passRoot,
      now: new Date(FIXED_NOW),
      buildTime: new Date(FIXED_BUILD),
      maxAgeDays: 7,
      testPlans: [join(passRoot, 'specs/test/P1-FX/test-plan.md')],
      changes: [],
      indexes: [],
      acs: [],
    }

    const pass = analyze(baseOptions)
    const fail = analyze({
      ...baseOptions,
      root: failRoot,
      testPlans: [join(failRoot, 'specs/test/P1-FX/test-plan.md')],
    })
    const passCounts = summarize(pass.items)
    const failCounts = summarize(fail.items)
    const failItems = fail.items.filter((entry) => entry.status !== 'PASS')
    const passFailItems = pass.items.filter((entry) => entry.status === 'FAIL')
    const passWarnItems = pass.items.filter((entry) => entry.status === 'WARN')

    assert('通过样例 error=0', passCounts.fail === 0, `error=${passCounts.fail}`)
    assert(
      '通过样例无 WARN',
      passCounts.fail === 0 && passCounts.warn === 0,
      `warn=${passCounts.warn}, rules=${passWarnItems.map((entry) => entry.rule).join(',')}`,
    )
    assert('通过样例 4 条 AC 与 4 条证据行', pass.acs.size === 4 && pass.rows.length === 4, `acs=${pass.acs.size}, rows=${pass.rows.length}`)
    assert(
      '通过样例无 FAIL 项',
      passFailItems.length === 0,
      pass.items.filter((entry) => entry.status === 'FAIL').map((entry) => `${entry.rule}:${entry.check}`).join('; '),
    )

    const blockedDrill = checkReason(
      'blocked',
      'R-DRILL：恢复演练 RTO 超出目标；解除：修复后重跑整轮演练；责任人：测试；到期日：2026-12-01',
    )
    assert('blocked 使用 R-DRILL 通过', blockedDrill.status === 'PASS', blockedDrill.detail)
    const unknownReason = checkReason(
      'blocked',
      'R-UNKNOWN：夹具；解除：补写合法原因码；责任人：测试；到期日：2026-12-01',
    )
    assert('七码外的原因码判失败', unknownReason.status === 'FAIL', unknownReason.detail)
    const partialDrill = checkReason(
      'partial',
      'R-DRILL：恢复演练未完成；解除：重跑整轮演练；责任人：测试；到期日：2026-12-01',
    )
    assert('partial 使用 R-DRILL 判失败', partialDrill.status === 'FAIL', partialDrill.detail)

    assert('失败样例 exit 1', failCounts.fail === 13, `error=${failCounts.fail}`)
    const expected = [
      'MX-G-38|证据记录',
      'MX-G-39|证据路径',
      'MX-G-40|核心字段',
      'MX-G-40|判定值',
      'MX-G-41|证据时效',
      'MX-G-42|原因码',
      'MX-G-43|解除信息',
      'MX-G-47|覆盖汇总',
      'MX-G-51|产物文件',
      'MX-G-51|产物版本',
      'MX-G-51|校验命令',
      'MX-G-51|生成器哈希',
      'MX-G-51|生成器时序',
    ].sort()
    const actual = failItems
      .filter((entry) => entry.status === 'FAIL')
      .map((entry) => `${entry.rule}|${entry.check}`)
      .sort()
    assert(
      '失败样例命中固定规则集合且每条一次',
      actual.length === expected.length && expected.every((rule, index) => rule === actual[index]),
      actual.join('; '),
    )

    const passBinding = pass.items.filter((entry) => entry.rule === 'MX-G-51')
    assert(
      '通过样例夹具绑定 PASS',
      passBinding.length === 1 && passBinding[0].status === 'PASS',
      `${passBinding.length} 项，状态 ${passBinding.map((entry) => entry.status).join(',') || '无'}`,
    )
    const failBinding = fail.items.filter((entry) => entry.rule === 'MX-G-51' && entry.status === 'FAIL')
    assert('失败样例 MX-G-51 命中 5 项', failBinding.length === 5, `实际 ${failBinding.length}`)
    const bindingChecks = failBinding.map((entry) => entry.check).sort()
    assert(
      '失败样例 MX-G-51 覆盖时序、命令、版本、哈希与产物',
      bindingChecks.join(',') === '产物文件,产物版本,校验命令,生成器哈希,生成器时序',
      bindingChecks.join('、'),
    )

    const legacyHeader = [
      '| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |',
      '|---|---|---|---|---|---|---|---|---|',
    ]
    const legacyRow = (type) =>
      `| EV-LEGACY-01 | AC-P1-01 | ${type} | \`node scripts/ac/AC-FX-001-01.mjs\` | \`docs/testing/fx/pass.png\` | \`2026-11-24T11:00+08:00\` | pass | 是 | R1 |`
    const legacyRoot = join(base, 'legacy')
    writeFixture(legacyRoot, 'docs/testing/fx/pass.png', 'PNG 自检占位')
    writeFixture(
      legacyRoot,
      'docs/testing/EVIDENCE-LEGACY.md',
      ['# 旧格式证据索引', '', ...legacyHeader, legacyRow('断言脚本'), ''].join('\n'),
    )
    const legacyOptions = {
      ...baseOptions,
      root: legacyRoot,
      testPlans: [],
      indexes: [join(legacyRoot, 'docs/testing/EVIDENCE-LEGACY.md')],
    }
    const legacy = analyze(legacyOptions)
    const legacyFail = legacy.items.filter((entry) => entry.status === 'FAIL')
    assert(
      '旧格式表按旧字段集校验，不因缺新增六列报错',
      legacyFail.length === 0,
      legacyFail.map((entry) => `${entry.rule}|${entry.check}`).join('; '),
    )
    const legacyBadRoot = join(base, 'legacy-bad')
    writeFixture(legacyBadRoot, 'docs/testing/fx/pass.png', 'PNG 自检占位')
    writeFixture(
      legacyBadRoot,
      'docs/testing/EVIDENCE-LEGACY.md',
      ['# 旧格式证据索引', '', ...legacyHeader, legacyRow(''), ''].join('\n'),
    )
    const legacyBad = analyze({
      ...legacyOptions,
      root: legacyBadRoot,
      indexes: [join(legacyBadRoot, 'docs/testing/EVIDENCE-LEGACY.md')],
    })
    const legacyBadCore = legacyBad.items.filter(
      (entry) => entry.status === 'FAIL' && entry.rule === 'MX-G-40' && entry.check === '核心字段',
    )
    assert('旧格式表已有列的空单元格仍判失败', legacyBadCore.length === 1, `实际 ${legacyBadCore.length}`)
    const anchor = checkPath(legacyRoot, 'docs/testing/fx/pass.png §1', 'partial')
    assert('路径节锚点不参与存在性判定', anchor.status === 'PASS', anchor.detail)

    const judgeRoot = join(base, 'judge')
    writeFixture(judgeRoot, 'docs/testing/fx/pass.png', 'PNG 自检占位')
    writeFixture(judgeRoot, 'docs/testing/fx/partial.log', '2 passed, 1 skipped')
    writeFixture(judgeRoot, 'docs/testing/fx/blocked.log', 'blocked: CDP 9223 unreachable')
    writeFixture(
      judgeRoot,
      'docs/testing/EVIDENCE-JUDGE.md',
      PASS_EVIDENCE.replace('| 自动 | pass |', '| p2-final-verify | pass |'),
    )
    const judgeRun = analyze({
      ...baseOptions,
      root: judgeRoot,
      testPlans: [],
      indexes: [join(judgeRoot, 'docs/testing/EVIDENCE-JUDGE.md')],
    })
    const judgeProblems = judgeRun.items.filter(
      (entry) => entry.rule === 'MX-G-40' && entry.check === '判定人' && entry.status !== 'PASS',
    )
    // 依据 docs/framework/GATES.md:249（MX-G-40，error）：判定人非法必须记 error。
    assert(
      '判定人非法记 error',
      judgeProblems.length === 1 && judgeProblems[0].severity === 'error' && judgeProblems[0].ac === 'AC-FX-001-01',
      judgeProblems.map((entry) => `${entry.ac}:${entry.status}:${entry.severity}`).join('; ') || '无问题项',
    )
    assert(
      '判定人合法（自动、人工:测试）不记问题',
      !judgeProblems.some((entry) => ['AC-FX-001-02', 'AC-FX-001-03', 'AC-FX-001-04'].includes(entry.ac)),
      judgeProblems.map((entry) => entry.ac).join('、') || '无问题项',
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
      `signature=${signatures[0].slice(0, 140)}`,
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
    return counts.fail > 0 ? 1 : 0
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
