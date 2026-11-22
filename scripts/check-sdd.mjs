#!/usr/bin/env node
/**
 * check-sdd.mjs — SDD 硬门禁（零依赖，只读）
 *
 * 旧检查（保留，不退化）：
 *  S1  specs/<id>/spec.md 必须含：状态、目标、需求（R 编号）、验收（A 编号）、非目标；
 *  S2  每个 A 编号必须在同目录 test-plan.md 或 evidence.md 中有映射；
 *  S3  COMP-* spec 必须含验收与影响范围；
 *  S4  frontend/src/components/manifest.json 存在，且每个组件有 name / variants / state(s)。
 *
 * 新检查（变更包硬门禁）：
 *  R1  遍历 specs/changes/<CHG>/（跳过 archived 状态的包）：
 *      - spec.md / tasks.md / test-plan.md / evidence.md 必须存在；
 *      - frontend.md / backend.md 可缺，但缺任意一个时 spec.md 必须写
 *        「N/A：<理由>」且理由 ≥ 8 字符（design.md 不强制，缺失不报）。
 *  R2  只在 spec.md 的「验收标准 / AC」章节内提取 AC 编号（去重；fenced code 内的
 *      示例不提取，正文里顺带提到的编号不计入），每个编号必须在 test-plan.md 的
 *      Covers: 段落中出现（允许前后有其它字符，如反引号、列表符号）。
 *      偏离任务字面正则的说明：任务书写的是 AC-[A-Z0-9]+-\d+，但该正则在真实编号
 *      AC-CONV-001-01 上只会截到前缀 AC-CONV-001，R2 会形同虚设；故采用
 *      AC-(?:[A-Z0-9]+-){2,}\d+，兼容 4 段（AC-CONV-001-01）与 ID-SPEC 的 5 段
 *      完整编号。代价：3 段旧式 AC-P1-01 不提取（历史 legacy 包通常已归档跳过）。
 *  R3  evidence.md 至少 1 条非空证据条目（表格数据行 / 列表项 / 围栏命令块），
 *      每条须含可复现线索之一：反引号包裹的命令、http(s) URL、文件路径；
 *      且不得出现整行仅为「通过 / 已完成 / ok / PASS」这类无信息结论。
 *      豁免口径：位于「缺失 / 未跑 / 未执行 / 豁免 / 限制 / 风险 / 环境 / 备注」
 *      章节下的条目，或条目本身含 missing / 未执行 / 未跑 / 未验 / 不适用 / N/A /
 *      缺口 / 待补 / TODO / 限制 / 风险 / 不能 / 无法 的，视为非证据主张，不要求
 *      可复现线索（对齐 docs/process/templates/evidence.md 的「未跑 / 豁免」章节）。
 *      已知限制：这些豁免章节内的假证据不会被抓，需靠人工抽查；空行结论检查
 *      （整行仅为 通过 / 已完成 / ok / PASS）仍对全文生效。
 *  R5  spec.md 写 superseded_by: <CHG-ID> 时：目标包存在则 R2/R3 跳过（历史保留，
 *      不删文件；R1 仍执行），目标包不存在则报错。指向存在的包才生效，避免用
 *      不存在的目标“假跳过”。
 *
 * 用法：
 *   node scripts/check-sdd.mjs
 *   node scripts/check-sdd.mjs --root <repo-root>
 *   node scripts/check-sdd.mjs --json        # 机器可读输出
 *   node scripts/check-sdd.mjs --self-test   # 临时目录构造合规/违规夹具自检
 *
 * 失败输出：<相对路径>:<行号> <规则ID> <一句话修复建议>，末行 FAILED: N issue(s)，退出码 1。
 * 成功输出：末行 PASS (checks: X)，退出码 0。
 * 运行前置失败（specs/ 不可读）退出码 2。--self-test 不读写真实仓库。
 * --json 输出 failures[] 每项含 rule / severity / path / line / hint（hint 为修复建议）。
 * 行号无法定位时允许写 0。
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const REQUIRED_CHANGE_DOCS = ['spec.md', 'tasks.md', 'test-plan.md', 'evidence.md']
// 按 Lead 裁决：design.md 不强制，仅 frontend.md / backend.md 缺失时要求 N/A 理由。
const OPTIONAL_CHANGE_DOCS = ['frontend.md', 'backend.md']
const NA_REASON_MIN = 8
const AC_RE = /\bAC-(?:[A-Z0-9]+-){2,}\d+(?![A-Za-z0-9-])/g
// 「验收标准 / AC」章节：标题含「验收」或独立的 AC（AC 证据、AC 判定速查等）。
const ACCEPTANCE_HEADING = /(?:验收|\bAC\b)/i
const VACUOUS_LINE = new Set(['通过', '已通过', '完成', '已完成', 'ok', 'pass'])
/**
 * 明确「不是证据主张」的章节/条目：缺失清单、未跑/豁免、限制与风险等。
 * 这些内容按项目规范应当如实写「missing / 未跑」，不应因为它们没有命令而报红；
 * 反之，证据章节里的结论行必须可复现。
 */
const NON_EVIDENCE_HEADING = /(?:缺失|未跑|未执行|豁免|限制|风险|环境|备注)/i
const NON_CLAIM_MARKER =
  /(?:missing|未执行|未跑|未验|未做|未接入|未接线|不适用|\bN\/A\b|缺口|待补|TODO|限制|风险|不能|无法)/i
const COMMAND_RE =
  /^(?:\$\s*)?(?:cd|npm|npx|pnpm|node|go|git|curl|pwsh|powershell|python|python3|py|make|bash|sh|deno|bun|dotnet|vitest|tsc|grep|rg|docker|kubectl)\b/
const KNOWN_PATH_PREFIX =
  /^(?:docs|specs|frontend|backend|scripts|src|tests?|deploy|data|evals|harness|design|config|\.github|\.tmp)\b/

class PreflightError extends Error {}

function createRun(root) {
  return {
    root,
    checks: 0,
    failures: [],
    warnings: [],
    stats: {
      specs: 0,
      comps: 0,
      aIds: 0,
      mapped: 0,
      components: 0,
      changes: 0,
      archived: 0,
      superseded: 0,
      supersededSkipped: 0,
      acIds: 0,
      acMapped: 0,
      evidenceEntries: 0,
      evidenceExempt: 0,
    },
  }
}

function addCheck(run, count = 1) {
  run.checks += count
}

function addFailure(run, rule, file, line, message) {
  run.failures.push({ file, line: line > 0 ? line : 1, rule, message })
}

function addWarning(run, rule, file, line, message) {
  run.warnings.push({ file, line: line > 0 ? line : 1, rule, message })
}

function relPath(run, file) {
  const rel = relative(run.root, resolve(file)) || '.'
  return rel.split(sep).join('/')
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isDir(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function splitLines(text) {
  return (text || '').split(/\r?\n/)
}

function lineOf(text, re) {
  if (!text) return 1
  const lines = splitLines(text)
  for (let i = 0; i < lines.length; i++) {
    const test = new RegExp(re.source, re.flags.replace(/[gy]/g, ''))
    if (test.test(lines[i])) return i + 1
  }
  return 1
}

function headingLine(text, matcher) {
  if (!text) return 1
  const lines = splitLines(text)
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i])
    if (m) {
      const test = new RegExp(matcher.source, matcher.flags.replace(/[gy]/g, ''))
      if (test.test(m[2].trim())) return i + 1
    }
  }
  return 1
}

function parseHeadings(text) {
  const lines = splitLines(text)
  const headings = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i])
    if (m) headings.push({ level: m[1].length, text: m[2].trim(), line: i })
  }
  return { lines, headings }
}

/** 取标题匹配的第一个 section（到下一个同级/更高级标题为止）；没有则 null。 */
function section(text, matcher) {
  const { lines, headings } = parseHeadings(text)
  const start = headings.find((h) => matcher.test(h.text))
  if (!start) return null
  let end = lines.length
  for (const h of headings) {
    if (h.line > start.line && h.level <= start.level) {
      end = h.line
      break
    }
  }
  return lines.slice(start.line + 1, end).join('\n')
}

function ids(text, prefix) {
  if (!text) return []
  const re = new RegExp(`\\b${prefix}\\d+\\b`, 'g')
  return [...new Set(text.match(re) || [])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
}

/* ------------------------------------------------------------------ */
/* 旧检查：产品/组件 spec 与 manifest                                  */
/* ------------------------------------------------------------------ */

function checkSpecDir(run, dir, name) {
  run.stats.specs++
  const specPath = join(dir, 'spec.md')
  const text = readText(specPath)
  if (text === null) {
    addCheck(run)
    addFailure(run, 'S1', specPath, 1, '缺失 spec.md；补该文件')
    return
  }
  const isComp = /^COMP-/.test(name)
  if (isComp) run.stats.comps++

  // 1. 状态
  addCheck(run)
  const statusMatch = /^\s*(?:[-*]\s*)?状态\s*[:：]\s*(.+)$/m.exec(text)
  if (!statusMatch || !statusMatch[1].replace(/[*_`\s]/g, '').trim()) {
    addFailure(run, 'S1', specPath, statusMatch ? lineOf(text, /状态\s*[:：]/) : 1, '补一行非空的「状态：<状态>」')
  }

  // 2. 目标
  addCheck(run)
  const goal = section(text, /(^|[.\s])目标($|[（(：:\s])/)
  if (!goal || !goal.trim()) {
    addFailure(run, 'S1', specPath, headingLine(text, /目标/), '补「目标」章节并写明本轮目标')
  }

  // 3. 需求 R 编号
  addCheck(run)
  const req = section(text, /需求/)
  const rIds = ids(req, 'R')
  if (!req) addFailure(run, 'S1', specPath, 1, '补「需求」章节并给 R 编号（如 R1）')
  else if (rIds.length === 0) {
    addFailure(run, 'S1', specPath, headingLine(text, /需求/), '在「需求」章节补 R 编号（如 R1）')
  }

  // 4. 验收 A 编号
  addCheck(run)
  const acc = section(text, /验收/)
  const aIds = ids(acc, 'A')
  if (!acc) addFailure(run, 'S1', specPath, 1, '补「验收」章节并给 A 编号（如 A1）')
  else if (aIds.length === 0) {
    addFailure(run, 'S1', specPath, headingLine(text, /验收/), '在「验收」章节补 A 编号（如 A1）')
  }
  run.stats.aIds += aIds.length

  // 5. 非目标
  addCheck(run)
  if (!section(text, /非目标/)) addFailure(run, 'S1', specPath, 1, '补「非目标」章节')

  // 6. A 编号映射到 test-plan.md / evidence.md
  if (aIds.length > 0) {
    addCheck(run)
    const testPlan = readText(join(dir, 'test-plan.md'))
    const evidence = readText(join(dir, 'evidence.md'))
    const mappingText = [testPlan, evidence].filter((x) => x !== null).join('\n')
    const where = headingLine(text, /验收/)
    if (!mappingText.trim()) {
      addFailure(
        run,
        'S2',
        specPath,
        where,
        `没有 test-plan.md / evidence.md，A 编号无法映射（${aIds.join(',')}）；补映射文件`,
      )
    } else {
      const missing = aIds.filter((id) => !new RegExp(`\\b${id}\\b`).test(mappingText))
      run.stats.mapped += aIds.length - missing.length
      if (missing.length) {
        addFailure(run, 'S2', specPath, where, `A 编号未在 test-plan.md/evidence.md 映射：${missing.join(',')}；补映射`)
      }
    }
  }

  // 7. COMP 额外：验收 + 影响范围
  if (isComp) {
    addCheck(run)
    if (!acc) addFailure(run, 'S3', specPath, 1, 'COMP spec 补「验收」章节')
    addCheck(run)
    if (!section(text, /影响(范围|页面)/)) {
      addFailure(run, 'S3', specPath, 1, 'COMP spec 补「影响范围/影响页面」章节')
    }
  }
}

function lineFromJsonError(text, message) {
  const m = /position (\d+)/.exec(message || '')
  if (!m) return 1
  return splitLines(text.slice(0, Number(m[1]))).length
}

function checkManifest(run) {
  const rel = 'frontend/src/components/manifest.json'
  const path = join(run.root, rel)
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    addCheck(run)
    addFailure(run, 'S4', path, 1, '文件不存在（前端组件清单缺失）；补 manifest.json')
    return
  }
  addCheck(run)
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    addFailure(run, 'S4', path, lineFromJsonError(text, e.message), `JSON 解析失败：${e.message}；修正 JSON`)
    return
  }
  if (!Array.isArray(data.components) || data.components.length === 0) {
    addFailure(run, 'S4', path, lineOf(text, /"components"/), '缺少非空 components[] 数组；补组件清单')
    return
  }
  run.stats.components = data.components.length
  const seen = new Set()
  data.components.forEach((c, i) => {
    addCheck(run)
    const where = `components[${i}]`
    if (!c || typeof c !== 'object') {
      addFailure(run, 'S4', path, 1, `${where} 不是对象；改为组件对象`)
      return
    }
    if (!c.name || typeof c.name !== 'string') {
      addFailure(run, 'S4', path, 1, `${where} 缺少 name；补组件名`)
    } else if (seen.has(c.name)) {
      addFailure(run, 'S4', path, 1, `${where} 组件 name 重复：${c.name}；改为唯一名`)
    } else {
      seen.add(c.name)
    }
    if (!Array.isArray(c.variants)) addFailure(run, 'S4', path, 1, `${where} 缺少 variants[]；补变体数组`)
    if (!Array.isArray(c.states) && !Array.isArray(c.state)) {
      addFailure(run, 'S4', path, 1, `${where} 缺少 states[]/state[]；补状态数组`)
    } else if ((c.states || c.state).length === 0) {
      addWarning(run, 'S4', path, 1, `${where} 组件 ${c.name || '?'} 的 states 为空`)
    }
  })
}

/* ------------------------------------------------------------------ */
/* R1 / R2 / R3：变更包                                                */
/* ------------------------------------------------------------------ */

function statusText(text) {
  const m = /^\s*(?:[-*]\s*)?(?:状态|status)\s*[:：]\s*(.+)$/im.exec(text || '')
  return m ? m[1] : ''
}

function isArchivedStatus(status) {
  return /(?:\barchived\b|已归档|归档)/i.test(status)
}

/**
 * 只保留「验收标准 / AC」章节的正文（含下级子标题），fenced code 整块排除。
 * 目的：AC 定义以验收章节为准，避免把正文/状态表里顺带提到的编号当成规范。
 * 章节在其后第一个同级或更高级标题处结束。
 */
function acceptanceText(text) {
  const lines = splitLines(text)
  const out = []
  let active = false
  let level = 0
  let fence = false
  for (const raw of lines) {
    const t = raw.trim()
    if (/^(?:```|~~~)/.test(t)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const hm = /^(#{1,6})\s+(.+?)\s*$/.exec(t)
    if (hm) {
      const nextLevel = hm[1].length
      if (active && nextLevel <= level) active = false
      if (!active && ACCEPTANCE_HEADING.test(hm[2])) {
        active = true
        level = nextLevel
      }
      continue
    }
    if (active) out.push(raw)
  }
  return out.join('\n')
}

/**
 * superseded_by: <CHG-ID>（允许列表前缀与反引号，行尾可带空白）。
 * 返回 { id, line }；没有该字段返回 null。
 */
function supersededBy(text) {
  if (!text) return null
  const lines = splitLines(text)
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:[-*]\s*)?superseded_by\s*[:：]\s*`?([A-Za-z0-9._-]+)`?\s*$/i.exec(lines[i])
    if (m) return { id: m[1], line: i + 1 }
  }
  return null
}

function hasNaReason(text) {
  if (!text) return { ok: false, line: 1 }
  const re = /N\/A\s*[：:]\s*([^\n]*)/g
  let m
  while ((m = re.exec(text))) {
    const reason = m[1]
      .replace(/[`*_>#|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if ([...reason].length >= NA_REASON_MIN) {
      return { ok: true, line: splitLines(text.slice(0, m.index)).length }
    }
  }
  return { ok: false, line: lineOf(text, /N\/A/) }
}

function extractAcIds(text) {
  if (!text) return []
  AC_RE.lastIndex = 0
  return [...new Set(text.match(AC_RE) || [])].sort()
}

function coversText(text) {
  if (!text) return ''
  const lines = splitLines(text)
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:[-*+]\s*|\d+[.)]\s*)?Covers\s*[:：]\s*(.*)$/i.exec(lines[i])
    if (!m) continue
    out.push(m[1])
    for (let j = i + 1; j < lines.length; j++) {
      const raw = lines[j]
      const t = raw.trim()
      if (!t) continue
      if (/^#{1,6}\s/.test(t)) break
      if (/^\|/.test(t)) break
      if (/^(?:>|```)/.test(t)) continue
      const isListItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(raw)
      const isField = /^[A-Za-z\u4e00-\u9fa5][A-Za-z0-9 _\-\u4e00-\u9fa5]*\s*[:：]/.test(t)
      if (!isListItem && isField) break
      out.push(raw)
    }
  }
  return out.join('\n')
}

function containsAcId(text, id) {
  const re = new RegExp(`(?<![A-Za-z0-9-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9-])`)
  return re.test(text)
}

function isTableSeparator(t) {
  return /^\|[\s:|-]*-{2,}[\s:|-]*\|?$/.test(t) && t.includes('|')
}

function isTableHeader(lines, i) {
  const t = (lines[i] || '').trim()
  if (!/^\|/.test(t)) return false
  const next = (lines[i + 1] || '').trim()
  return isTableSeparator(next)
}

/**
 * 证据条目：表格数据行、列表项、围栏代码块（整块算一条）。
 * 标题、元信息段落、表格表头/分隔行不算证据条目（避免把文档结构误判为证据）。
 * 每条带 exempt 标记：位于「缺失/未跑/限制/风险」等章节，或条目本身明确写
 * missing / 未执行 / 不适用 时，视为非证据主张，不要求可复现线索。
 */
function evidenceEntries(text) {
  const lines = splitLines(text)
  const entries = []
  let inFence = false
  let fenceStart = 0
  let fenceBody = []
  let heading = ''
  const markExempt = (body) => NON_EVIDENCE_HEADING.test(heading) || NON_CLAIM_MARKER.test(body)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const t = raw.trim()
    if (/^```/.test(t) || /^~~~/.test(t)) {
      if (inFence) {
        const body = fenceBody.join('\n')
        if (body.trim()) entries.push({ line: fenceStart + 1, text: body, kind: 'code', exempt: markExempt(body) })
        inFence = false
        fenceBody = []
      } else {
        inFence = true
        fenceStart = i
      }
      continue
    }
    if (inFence) {
      fenceBody.push(raw)
      continue
    }
    if (!t) continue
    const hm = /^#{1,6}\s+(.+?)\s*$/.exec(t)
    if (hm) {
      heading = hm[1]
      continue
    }
    if (isTableSeparator(t)) continue
    if (/^\|/.test(t)) {
      if (isTableHeader(lines, i)) continue
      entries.push({ line: i + 1, text: t, kind: 'table', exempt: markExempt(t) })
      continue
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(raw)) {
      entries.push({ line: i + 1, text: t, kind: 'item', exempt: markExempt(t) })
    }
  }
  if (inFence && fenceBody.join('\n').trim()) {
    const body = fenceBody.join('\n')
    entries.push({ line: fenceStart + 1, text: body, kind: 'code', exempt: markExempt(body) })
  }
  return entries
}

function looksLikePath(token) {
  if (!token || /[\s`"'()<>]/.test(token)) return false
  if (!/[A-Za-z]/.test(token)) return false
  if (token.includes('/')) {
    const parts = token.split('/').filter((p) => p && p !== '.' && p !== '..')
    if (parts.length < 2) return false
    const last = parts[parts.length - 1]
    return last.includes('.') || KNOWN_PATH_PREFIX.test(token)
  }
  return /\.(?:md|mjs|go|tsx)$/i.test(token)
}

function looksLikeCommand(snippet) {
  if (!snippet || !/\s/.test(snippet.trim())) return false
  return COMMAND_RE.test(snippet.trim())
}

function hasClue(line) {
  if (/https?:\/\/\S+/.test(line)) return true
  for (const m of line.matchAll(/`([^`]+)`/g)) {
    const snippet = m[1].trim()
    if (looksLikeCommand(snippet)) return true
    if (looksLikePath(snippet)) return true
  }
  const withoutCode = line.replace(/`[^`]*`/g, ' ')
  for (const token of withoutCode.match(/[A-Za-z0-9_.~@-]+(?:\/[A-Za-z0-9_.~@-]+)+/g) || []) {
    if (looksLikePath(token)) return true
  }
  for (const token of withoutCode.match(/\b[A-Za-z0-9_.-]+\.(?:md|mjs|go|tsx)\b/g) || []) {
    if (looksLikePath(token)) return true
  }
  return false
}

function isVacuousLine(line) {
  const normalized = line
    .replace(/[`*_>#|]/g, '')
    .replace(/[。．.!！?？、,，;；:：\s]/g, '')
    .toLowerCase()
  return VACUOUS_LINE.has(normalized)
}

function checkChangePackage(run, name, dir) {
  run.stats.changes++
  const specPath = join(dir, 'spec.md')
  const specText = readText(specPath)
  const status = statusText(specText)
  if (isArchivedStatus(status)) {
    run.stats.archived++
    return
  }

  // R1 必需产物
  for (const doc of REQUIRED_CHANGE_DOCS) {
    addCheck(run)
    if (!isFile(join(dir, doc))) {
      addFailure(run, 'R1', join(dir, doc), 1, `变更包缺少必需产物 ${doc}；补该文件`)
    }
  }

  // R1 可选产物 + N/A 理由；spec.md 本身缺失时已由必需产物报错，不再重复要求 N/A。
  const missingOptional = OPTIONAL_CHANGE_DOCS.filter((doc) => !isFile(join(dir, doc)))
  if (specText !== null && missingOptional.length > 0) {
    addCheck(run)
    const na = hasNaReason(specText)
    if (!na.ok) {
      addFailure(
        run,
        'R1',
        specPath,
        na.line,
        `缺少 ${missingOptional.join('/')}，须在 spec.md 写「N/A：<≥${NA_REASON_MIN} 字理由>」；补 N/A 理由`,
      )
    }
  }

  // R5 superseded_by：目标存在 → R2/R3 由后续包承接；目标不存在 → 报错。
  const superseded = supersededBy(specText)
  if (superseded) {
    run.stats.superseded++
    if (!isDir(join(run.root, 'specs/changes', superseded.id))) {
      addCheck(run)
      addFailure(
        run,
        'R5',
        specPath,
        superseded.line,
        `superseded_by 指向的变更包 ${superseded.id} 不存在；改为已存在的 CHG-ID 或删除该字段`,
      )
    } else {
      run.stats.supersededSkipped++
      return
    }
  }

  // R2 AC → Covers（只在验收标准 / AC 章节内提取）
  const acIds = extractAcIds(acceptanceText(specText))
  run.stats.acIds += acIds.length
  const testPlanPath = join(dir, 'test-plan.md')
  const testPlanText = readText(testPlanPath)
  if (acIds.length > 0 && testPlanText !== null) {
    const covers = coversText(testPlanText)
    const coversLine = lineOf(testPlanText, /Covers\s*[:：]/i)
    for (const id of acIds) {
      addCheck(run)
      if (containsAcId(covers, id)) {
        run.stats.acMapped++
      } else {
        addFailure(run, 'R2', testPlanPath, coversLine, `${id} 未在 Covers: 中映射；补该 AC 编号`)
      }
    }
  }

  // R3 evidence.md
  const evidencePath = join(dir, 'evidence.md')
  const evidenceText = readText(evidencePath)
  if (evidenceText !== null) {
    addCheck(run)
    const entries = evidenceEntries(evidenceText)
    run.stats.evidenceEntries += entries.length
    if (entries.length === 0) {
      addFailure(run, 'R3', evidencePath, 1, 'evidence.md 没有证据条目；补表格行/列表项/命令块')
    }
    addCheck(run)
    const allLines = splitLines(evidenceText)
    for (let i = 0; i < allLines.length; i++) {
      const t = allLines[i].trim()
      if (!t) continue
      if (!isVacuousLine(t)) continue
      addFailure(run, 'R3', evidencePath, i + 1, '证据不得只写「通过/已完成/ok/PASS」；补命令/路径/URL')
    }
    for (const entry of entries) {
      addCheck(run)
      if (entry.exempt) {
        run.stats.evidenceExempt++
        continue
      }
      if (!hasClue(entry.text)) {
        addFailure(
          run,
          'R3',
          evidencePath,
          entry.line,
          '证据条目缺少可复现线索（反引号命令、http(s) URL 或文件路径）；补线索',
        )
      }
    }
  }
}

function checkChangePackages(run) {
  const changesDir = join(run.root, 'specs/changes')
  let entries
  try {
    entries = readdirSync(changesDir, { withFileTypes: true })
  } catch {
    return // 没有 specs/changes/ 不是错误（老仓库 / 自测夹具）
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const name of dirs) {
    checkChangePackage(run, name, join(changesDir, name))
  }
}

/* ------------------------------------------------------------------ */
/* 执行与输出                                                          */
/* ------------------------------------------------------------------ */

function runChecks(run) {
  const specsDir = join(run.root, 'specs')
  let entries
  try {
    entries = readdirSync(specsDir, { withFileTypes: true })
  } catch {
    throw new PreflightError(`无法读取 specs/：${specsDir}`)
  }
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  for (const name of dirs) {
    const dir = join(specsDir, name)
    if (!isFile(join(dir, 'spec.md'))) continue
    checkSpecDir(run, dir, name)
  }
  checkManifest(run)
  checkChangePackages(run)
}

function report(run, asJson) {
  if (asJson) {
    const payload = {
      ok: run.failures.length === 0,
      root: run.root,
      checks: run.checks,
      stats: run.stats,
      failures: run.failures.map((f) => ({
        rule: f.rule,
        severity: 'error',
        path: relPath(run, f.file),
        file: relPath(run, f.file),
        line: f.line,
        hint: f.hint ?? f.message,
        message: f.message,
      })),
      warnings: run.warnings.map((w) => ({
        rule: w.rule,
        severity: 'warning',
        path: relPath(run, w.file),
        file: relPath(run, w.file),
        line: w.line,
        hint: w.hint ?? w.message,
        message: w.message,
      })),
    }
    console.log(JSON.stringify(payload, null, 2))
    return run.failures.length === 0 ? 0 : 1
  }

  console.log(`SDD check — root: ${run.root}`)
  console.log(
    `specs: ${run.stats.specs}（COMP ${run.stats.comps}）；A 编号: ${run.stats.aIds}，已映射: ${run.stats.mapped}；` +
      `change 包: ${run.stats.changes}（归档跳过 ${run.stats.archived}，superseded 跳过 ${run.stats.supersededSkipped}）；` +
      `AC: ${run.stats.acIds}，Covers 命中: ${run.stats.acMapped}；` +
      `证据条目: ${run.stats.evidenceEntries}（非主张豁免 ${run.stats.evidenceExempt}）；manifest 组件: ${run.stats.components}`,
  )
  for (const f of run.failures) {
    console.log(`${relPath(run, f.file)}:${f.line} ${f.rule} ${f.message}`)
  }
  for (const w of run.warnings) {
    console.log(`[WARN] ${relPath(run, w.file)}:${w.line} ${w.rule} ${w.message}`)
  }
  if (run.failures.length === 0) {
    console.log(`PASS (checks: ${run.checks})`)
    return 0
  }
  console.log(`FAILED: ${run.failures.length} issue(s)`)
  return 1
}

/* ------------------------------------------------------------------ */
/* --self-test                                                         */
/* ------------------------------------------------------------------ */

function writeFixtureFile(root, rel, content) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function buildSelfTestFixture(root, kind) {
  const good = kind === 'good'
  const dir = join(root, 'specs/changes/CHG-SELFTEST-001')
  const spec = [
    '# CHG-SELFTEST-001',
    '',
    '状态：active',
    '',
    '## 目标',
    '',
    '自测夹具，不读写真实仓库。',
    '',
    '## 需求',
    '',
    '- R1 门禁脚本可自检。',
    '',
    '## 验收',
    '',
    '- A1 自测通过。',
    `- ${good ? 'AC-TEST-001-01' : 'AC-TEST-002-01'} 用例可通过 Covers 映射。`,
    '',
    '## 非目标',
    '',
    '- 不覆盖真实仓库内容。',
    '',
    ...(good ? ['design.md：N/A：本轮不涉及设计稿，自测夹具无需设计产物。'] : []),
  ].join('\n')
  writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/spec.md', spec)
  // design.md 按 Lead 裁决不强制；frontend/backend 缺失时才要求 N/A 理由。
  if (good) {
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/frontend.md', '# 前端\n\nN/A：自测夹具无前端改动。\n')
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/backend.md', '# 后端\n\nN/A：自测夹具无后端改动。\n')
  }
  writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/test-plan.md', [
    '# 测试',
    '',
    `Covers: ${good ? 'AC-TEST-001-01' : 'AC-TEST-999-01'}`,
    '',
    '- A1 自测用例：`node scripts/check-sdd.mjs --self-test`。',
    '',
  ].join('\n'))
  if (good) {
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/tasks.md', '# 任务\n\n- [x] T1 自测。\n')
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/evidence.md', [
      '# 证据',
      '',
      '| AC | 命令 | 结果 |',
      '|---|---|---|',
      '| AC-TEST-001-01 | `node scripts/check-sdd.mjs --self-test` | PASS |',
      '',
    ].join('\n'))
  } else {
    // 故意违规：缺 tasks.md / 缺 design.md 且无 N/A / AC 未被 Covers 覆盖 / 证据只写「已完成」
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/evidence.md', '# 证据\n\n- 已完成\n')
  }
  writeFixtureFile(
    root,
    'frontend/src/components/manifest.json',
    JSON.stringify({ components: [{ name: 'FixtureCard', variants: ['default'], states: ['idle'] }] }, null, 2),
  )
  return dir
}

/**
 * 自测辅助：写一个最小变更包。covers 故意与 ac 不一致时，若 R2 未被跳过就会报红；
 * evidence 传 ['- 已完成'] 时，若 R3 未被跳过也会报红。
 */
function writeSelfTestPackage(root, name, opts = {}) {
  const {
    status = 'active',
    header = '',
    ac = 'AC-TEST-010-01',
    covers = null,
    evidence = [
      '| AC | 命令 | 结果 |',
      '|---|---|---|',
      `| ${ac} | \`node scripts/check-sdd.mjs --self-test\` | PASS |`,
    ],
    optional = true,
  } = opts
  writeFixtureFile(
    root,
    `specs/changes/${name}/spec.md`,
    [
      `# ${name}`,
      '',
      `状态：${status}`,
      ...(header ? [header, ''] : []),
      '## 目标',
      '',
      '自测夹具，不读写真实仓库。',
      '',
      '## 需求',
      '',
      '- R1 门禁脚本可自检。',
      '',
      '## 验收标准（AC）',
      '',
      `- ${ac} 用例可通过 Covers 映射。`,
      '',
      '## 非目标',
      '',
      '- 不覆盖真实仓库内容。',
      '',
    ].join('\n'),
  )
  writeFixtureFile(root, `specs/changes/${name}/tasks.md`, '# 任务\n\n- [x] T1 自测。\n')
  writeFixtureFile(
    root,
    `specs/changes/${name}/test-plan.md`,
    ['# 测试', '', `Covers: ${covers ?? ac}`, '', '- A1 自测用例：`node scripts/check-sdd.mjs --self-test`。', ''].join(
      '\n',
    ),
  )
  writeFixtureFile(root, `specs/changes/${name}/evidence.md`, ['# 证据', '', ...evidence, ''].join('\n'))
  if (optional) {
    writeFixtureFile(root, `specs/changes/${name}/frontend.md`, '# 前端\n\nN/A：自测夹具无前端改动。\n')
    writeFixtureFile(root, `specs/changes/${name}/backend.md`, '# 后端\n\nN/A：自测夹具无后端改动。\n')
  }
  // S4 是全局检查：每个自测根都要有合法 manifest，避免把夹具缺件误算成规则失败。
  writeFixtureFile(
    root,
    'frontend/src/components/manifest.json',
    JSON.stringify({ components: [{ name: 'FixtureCard', variants: ['default'], states: ['idle'] }] }, null, 2),
  )
}

function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-sdd-gate-'))
  const assertions = []
  let badIssues = 0
  try {
    const goodRoot = join(tmp, 'good')
    const badRoot = join(tmp, 'bad')
    buildSelfTestFixture(goodRoot, 'good')
    buildSelfTestFixture(badRoot, 'bad')

    const good = createRun(goodRoot)
    const bad = createRun(badRoot)
    runChecks(good)
    runChecks(bad)
    badIssues = bad.failures.length
    const badRules = new Set(bad.failures.map((f) => f.rule))

    // Lead 裁决：只有含 archived/归档 字样才跳过；纯 historical 必须照常受检。
    const histRoot = join(tmp, 'historical')
    const archivedRoot = join(tmp, 'archived')
    buildSelfTestFixture(histRoot, 'bad')
    buildSelfTestFixture(archivedRoot, 'bad')
    const retag = (root, status) => {
      const file = join(root, 'specs/changes/CHG-SELFTEST-001/spec.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('状态：active', `状态：${status}`), 'utf8')
    }
    retag(histRoot, 'historical / partial')
    retag(archivedRoot, 'archived')
    const hist = createRun(histRoot)
    const archived = createRun(archivedRoot)
    runChecks(hist)
    runChecks(archived)

    // AC-06 夹具：N/A：空理由必须命中 R1。
    const naRoot = join(tmp, 'na-empty')
    writeSelfTestPackage(naRoot, 'CHG-SELFTEST-NA', {
      header: 'design.md：N/A：',
      optional: false,
    })
    const na = createRun(naRoot)
    runChecks(na)

    // superseded：目标存在 → R2/R3 跳过；目标不存在 → R5 报错。
    const supRoot = join(tmp, 'superseded')
    writeSelfTestPackage(supRoot, 'CHG-SELFTEST-S2', { ac: 'AC-TEST-020-01' })
    writeSelfTestPackage(supRoot, 'CHG-SELFTEST-S1', {
      header: 'superseded_by: CHG-SELFTEST-S2',
      ac: 'AC-TEST-021-01',
      covers: 'AC-TEST-999-01',
      evidence: ['- 已完成'],
    })
    const sup = createRun(supRoot)
    runChecks(sup)
    const supSourceIssues = sup.failures.filter((f) => f.file.includes('CHG-SELFTEST-S1'))

    const supMissingRoot = join(tmp, 'superseded-missing')
    writeSelfTestPackage(supMissingRoot, 'CHG-SELFTEST-S3', {
      header: 'superseded_by: CHG-NOT-THERE',
    })
    const supMissing = createRun(supMissingRoot)
    runChecks(supMissing)
    const supMissingRules = new Set(supMissing.failures.map((f) => f.rule))

    const assert = (name, ok, detail = '') => assertions.push({ name, ok, detail })
    assert('合规夹具 exit 0', (good.failures.length === 0 ? 0 : 1) === 0, `issues=${good.failures.length}`)
    assert('违规夹具 exit 1', (bad.failures.length === 0 ? 0 : 1) === 1, `issues=${bad.failures.length}`)
    assert('合规夹具无失败项', good.failures.length === 0, good.failures.map((f) => `${f.rule}:${f.message}`).join('; '))
    assert(
      'historical 不跳过（仍命中 R1）',
      hist.stats.archived === 0 && hist.failures.some((f) => f.rule === 'R1'),
      `archived=${hist.stats.archived}, issues=${hist.failures.length}`,
    )
    assert(
      'archived 跳过（0 失败）',
      archived.stats.archived === 1 && archived.failures.length === 0,
      `archived=${archived.stats.archived}, issues=${archived.failures.length}`,
    )
    for (const rule of ['R1', 'R2', 'R3']) {
      assert(`违规夹具命中 ${rule}`, badRules.has(rule), `rules=${[...badRules].join(',')}`)
    }
    assert(
      'N/A：空理由命中 R1',
      na.failures.some((f) => f.rule === 'R1' && /N\/A/.test(f.message)),
      `issues=${na.failures.length}`,
    )
    assert(
      'superseded 目标存在 → R2/R3 跳过',
      supSourceIssues.length === 0,
      supSourceIssues.map((f) => `${f.rule}:${f.message}`).join('; '),
    )
    assert('superseded 跳过计数', sup.stats.supersededSkipped === 1, `skipped=${sup.stats.supersededSkipped}`)
    assert(
      'superseded 目标不存在 → R5',
      supMissingRules.has('R5') && supMissing.failures.length === 1,
      `rules=${[...supMissingRules].join(',')}, issues=${supMissing.failures.length}`,
    )
  } catch (e) {
    assertions.push({ name: '自测执行未抛错', ok: false, detail: e && e.stack ? e.stack : String(e) })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(`tmp=${tmp} removed`)

  const failed = assertions.filter((a) => !a.ok)
  if (failed.length > 0) {
    console.error('SELF-TEST FAILED')
    for (const a of failed) console.error(` - ${a.name}${a.detail ? `（${a.detail}）` : ''}`)
    return 1
  }
  console.log(`SELF-TEST PASS (${assertions.length} assertions, bad fixture issues=${badIssues})`)
  return 0
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opt = (name, fallback = '') => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
  }
  return {
    selfTest: argv.includes('--self-test'),
    json: argv.includes('--json'),
    root: resolve(opt('--root', DEFAULT_ROOT)),
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.selfTest) {
    process.exit(runSelfTest())
  }
  const run = createRun(options.root)
  try {
    runChecks(run)
  } catch (e) {
    if (e instanceof PreflightError) {
      console.error(`✗ ${e.message}`)
      process.exit(2)
    }
    throw e
  }
  process.exit(report(run, options.json))
}

main()
