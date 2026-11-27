#!/usr/bin/env node
/**
 * 规则级命令按 GATES.md 表 3-1 的内部检查映射收窄：--rule 只保留该规则名下的失败项与提示项，
 * 并用该规则名下的检查数判定（零检查不得判 PASS）；未知规则直接退出 2；不带 --rule 时按整套门禁运行。
 * check-trace.mjs — 产品需求追溯硬门禁（零依赖、只读）
 *
 * 旧检查（保留，不退化）：
 *  T1 TREE.md / TRACEABILITY.md 的 PRD 总数一致（合计行 × 实际行数），且无重复 PRD；
 *  T2 TREE 中每个 PRD 都出现在 TRACEABILITY；TRACEABILITY 不出现 TREE 之外的 PRD；
 *  T3 TREE 中每个 PRD 有产品 spec 链接，文件存在且其中声明了该 PRD；
 *     产品 spec 不应声明 TREE 中不存在的 PRD；
 *  T4 每个 PRD 的 TEST 链接指向 specs/test/<域>/test-plan.md，
 *     域匹配、文件存在、`#tc-...` 锚点以 id="..." 存在于该文件；
 *  T5 specs/changes/<CHG>/spec.md 必须声明 `Implements: PRD-...`；
 *     按 Lead 裁决，`Implements: N/A：<理由>`（理由 ≥ 8 字）视为治理豁免：
 *     不失败，输出标注 governance；不按 CHG-SYS-* 前缀开白；
 *  T6 specs/test/e2e/README.md 存在。
 *
 * 新检查（硬门禁）：
 *  R4 解析 TRACEABILITY.md 的追溯表：
 *     - 覆盖状态为 covered 的行，六类列（产品/变更/前端/后端/组件/任务/测试，
 *       按实际表头识别列名含这些词的列）不得为空或「-」；
 *     - partial / gap 行的「缺口」列不得为空或「-」。
 *
 * 用法：
 *   node scripts/check-trace.mjs
 *   node scripts/check-trace.mjs --root <repo-root>
 *   node scripts/check-trace.mjs --json
 *   node scripts/check-trace.mjs --self-test   # 临时目录构造函数夹具自检
 *
 * 失败输出：<相对路径>:<行号> <规则ID> <一句话修复建议>，末行 FAILED: N issue(s)，退出码 1。
 * 成功输出：末行 PASS (checks: X)，退出码 0。
 * 运行前置失败（root 不存在）退出码 2。--self-test 不读写真实仓库。
 */

import {
  existsSync,
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
import { isPass } from './lib/v2-rule-mode.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const PRD_RE = /\bPRD-[A-Z][A-Z0-9]*-\d{3}\b/g
// 三段式与两段式 AC 都认：历史包的冻结验收项是 AC-<域>-<序号>，新包是三段式。
const AC_RE = /\bAC-(?:[A-Z0-9]+-){1,}\d+\b/g
const PRD_ANCHORED_RE = /^`?(PRD-[A-Z][A-Z0-9]*-\d{3})`?$/
const NA_REASON_MIN = 8
const TEST_TARGET_RE = /(?:^|\/)specs\/test\/([^/]+)\/test-plan\.md(?:#|$)/
const PRODUCT_TARGET_RE = /(?:^|\/)specs\/product\/([^/]+)\/spec\.md(?:#|$)/
// 这些单元格值与空同义：R4 对 covered 六类列与 partial/gap 缺口列都按空判。
const EMPTY_CELL_RE = /^[-–—]+$/
const PLACEHOLDER_CELL_RE = /^(?:无|待补|todo|tbd|n\/a)$/i
const CLASS_COLUMNS = [
  { name: '产品', test: /产品|prod(?:uct)?\s*spec/i },
  { name: '变更', test: /变更|change/i },
  { name: '前端', test: /前端|frontend/i },
  { name: '后端', test: /后端|backend/i },
  { name: '组件', test: /组件|component/i },
  { name: '任务', test: /任务|task/i },
  { name: '测试', test: /测试|test/i },
]

class PreflightError extends Error {}

/* ------------------------------------------------------------------ */
/* 运行上下文                                                          */
/* ------------------------------------------------------------------ */

function createRun(root) {
  return {
    root,
    checks: 0,
    // 按内部检查编号（T1..T7、R4）计数，供 --rule 单跑时给出该规则名下的检查数。
    checksByRule: {},
    failures: [],
    warnings: [],
    governance: [],
    stats: {
      prdTotal: 0,
      treeTotal: null,
      traceabilityTotal: null,
      traceabilityPrds: 0,
      missingPrds: 0,
      unknownPrds: 0,
      badAnchors: 0,
      missingTestPlans: 0,
      invalidTestLinks: 0,
      productSpecPrds: 0,
      productSpecIssues: 0,
      changePackages: 0,
      changeIssues: 0,
      governance: 0,
      e2eReadme: false,
      r4Rows: 0,
    },
  }
}

function addCheck(run, rule) {
  run.checks += 1
  if (rule) run.checksByRule[rule] = (run.checksByRule[rule] ?? 0) + 1
}

function fail(run, rule, file, line, message, extra = {}) {
  // 无法定位行号时允许 0（AC-05）；其它非法值仍回退到 1。
  run.failures.push({ rule, file, line: Number.isFinite(line) && line >= 0 ? line : 1, message, ...extra })
}

function warn(run, rule, file, line, message, extra = {}) {
  run.warnings.push({ rule, file, line: line > 0 ? line : 1, message, ...extra })
}

function toRel(run, file) {
  if (!file) return ''
  const raw = String(file)
  const abs = resolve(raw)
  const rel = relative(run.root, abs)
  if (rel && !rel.startsWith('..') && !/^[A-Za-z]:/.test(rel)) return rel.split(sep).join('/')
  return raw.replace(/\\/g, '/')
}

function splitLines(text) {
  return (text || '').split(/\r?\n/)
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function readRequired(run, rel) {
  const file = join(run.root, rel)
  const text = readText(file)
  if (text === null) {
    addCheck(run, 'T1')
    fail(run, 'T1', file, 1, `必需文件不存在或不可读：${rel}；补该文件`)
    return null
  }
  return text
}

function listFiles(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (entry.isFile()) out.push(full)
  }
  return out.sort()
}

/* ------------------------------------------------------------------ */
/* 表格 / 链接 / 锚点                                                  */
/* ------------------------------------------------------------------ */

function parseTableLine(line) {
  let body = String(line || '').trim()
  if (body.endsWith('|')) body = body.slice(0, -1)
  body = body.slice(1)
  return body.split('|').map((cell) => cell.trim())
}

function tableRows(text) {
  const rows = []
  const lines = splitLines(text)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) continue
    rows.push({ line: i + 1, cells: parseTableLine(line), raw: lines[i] })
  }
  return rows
}

function traceBlocks(text) {
  const blocks = []
  let current = []
  for (const row of tableRows(text)) {
    if (current.length > 0 && row.line !== current[current.length - 1].line + 1) {
      blocks.push(current)
      current = []
    }
    current.push(row)
  }
  if (current.length > 0) blocks.push(current)
  return blocks
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cleanCell(cell)))
}

function cleanCell(cell) {
  return String(cell || '').replace(/\*\*/g, '').replace(/`/g, '').trim()
}

/** 空单元格：空串、破折号，或「无 / 待补 / TODO / TBD」这类占位符。 */
function isBlankCell(value) {
  return !value || EMPTY_CELL_RE.test(value) || PLACEHOLDER_CELL_RE.test(value)
}

function extractLinks(text) {
  const links = []
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match
  while ((match = re.exec(text)) !== null) {
    links.push({ text: match[1], target: match[2].trim() })
  }
  return links
}

function prdRows(text) {
  const rows = []
  for (const row of tableRows(text)) {
    const first = cleanCell(row.cells[0])
    const match = PRD_ANCHORED_RE.exec(first)
    if (!match) continue
    rows.push({ prd: match[1], line: row.line, cells: row.cells, links: extractLinks(row.raw) })
  }
  return rows
}

function splitTarget(target) {
  const hashIndex = target.indexOf('#')
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : null
  return { pathPart, anchor: anchor === null ? null : decodeURIComponent(anchor) }
}

function resolveTarget(run, baseFile, target) {
  const { pathPart, anchor } = splitTarget(target)
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart)) {
    return { external: true, pathPart, anchor }
  }
  const decoded = decodeURIComponent(pathPart)
  const abs = decoded.startsWith('/')
    ? resolve(run.root, `.${decoded}`)
    : resolve(dirname(baseFile), decoded)
  return { external: false, abs, anchor, pathPart, target }
}

function domainFromTarget(target, kind) {
  const re = kind === 'test' ? TEST_TARGET_RE : PRODUCT_TARGET_RE
  const match = re.exec(target)
  return match ? match[1] : null
}

function explicitAnchorIds(text) {
  const ids = new Set()
  const re = /\bid\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/g
  let match
  while ((match = re.exec(text)) !== null) {
    const value = match[1] || match[2] || match[3]
    if (value) ids.add(value)
  }
  return ids
}

function validateTestLink(run, baseFile, link, prd, expectedDomain, source, line) {
  addCheck(run, 'T4')
  const resolved = resolveTarget(run, baseFile, link.target)
  if (resolved.external) {
    run.stats.invalidTestLinks++
    fail(run, 'T4', baseFile, line, `${prd} 的 TEST 链接不是仓库内路径；改为 specs/test/<域>/test-plan.md#<锚点>`, {
      prd,
      source,
    })
    return false
  }
  const domain = domainFromTarget(link.target, 'test')
  if (!domain) {
    run.stats.invalidTestLinks++
    fail(run, 'T4', baseFile, line, `${prd} 的 TEST 链接不是 specs/test/<域>/test-plan.md；改正链接`, { prd, source })
    return false
  }
  if (expectedDomain && domain !== expectedDomain) {
    run.stats.invalidTestLinks++
    fail(
      run,
      'T4',
      baseFile,
      line,
      `${prd} 的 TEST 链接域为 ${domain}，应为 ${expectedDomain}；改成同域 test-plan`,
      { prd, source },
    )
  }
  if (!resolved.anchor) {
    run.stats.badAnchors++
    fail(run, 'T4', baseFile, line, `${prd} 的 TEST 链接缺少 #锚点；补 #tc-...`, { prd, source })
    return false
  }
  const planText = readText(resolved.abs)
  if (planText === null) {
    run.stats.missingTestPlans++
    fail(run, 'T4', baseFile, line, `${prd} 的 TEST 链接指向不存在的计划：${toRel(run, resolved.abs)}#${resolved.anchor}；补该文件`, {
      prd,
      source,
    })
    return false
  }
  if (!explicitAnchorIds(planText).has(resolved.anchor)) {
    run.stats.badAnchors++
    fail(run, 'T4', baseFile, line, `${prd} 的 TEST 锚点不存在：${toRel(run, resolved.abs)}#${resolved.anchor}；在 test-plan 补 id="${resolved.anchor}"`, {
      prd,
      source,
    })
    return false
  }
  return true
}

function productPrdDeclarations(text) {
  const found = new Set()
  for (const line of splitLines(text)) {
    const heading = /^#{2,6}\s+(PRD-[A-Z][A-Z0-9]*-\d{3})\b/.exec(line)
    if (heading) found.add(heading[1])
  }
  for (const row of prdRows(text)) found.add(row.prd)
  return found
}

function parseTotal(text, label) {
  for (const row of tableRows(text)) {
    if (cleanCell(row.cells[0]) !== '合计') continue
    const nums = row.cells
      .map(cleanCell)
      .filter((cell) => /^\d+$/.test(cell))
      .map(Number)
    if (nums.length === 0) continue
    if (label === 'tree') {
      // 域总览：L2 总数、L3(PRD) 总数、...；L3 为第 2 个数。
      if (nums.length >= 2) return { value: nums[1], line: row.line }
    } else {
      // TRACEABILITY 汇总：PRD 总数为第 1 个数。
      return { value: nums[0], line: row.line }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Implements（含 Lead 裁决的 N/A 治理豁免）                            */
/* ------------------------------------------------------------------ */

function extractImplements(text) {
  const lines = splitLines(text)
  const directives = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*Implements\s*:\s*(.*)$/i.exec(lines[i])
    if (m) directives.push({ index: i, value: m[1].trim() })
  }
  if (directives.length === 0) return { foundDirective: false, ids: [], line: 1, naReason: null }

  const first = directives[0]
  const na = /^N\/A\b\s*[：:]?\s*(.*)$/i.exec(first.value)
  if (na) return { foundDirective: true, ids: [], line: first.index + 1, naReason: na[1].trim() }

  const ids = new Set()
  for (const directive of directives) {
    const buffer = [directive.value]
    for (let j = directive.index + 1; j < lines.length; j++) {
      const line = lines[j]
      if (/^#{1,6}\s/.test(line)) break
      if (/^\s*$/.test(line)) continue
      // 遇到下一个 frontmatter/文档字段（行首 key:）就停止。
      if (/^[A-Za-z][A-Za-z0-9 _-]*:\s/.test(line)) break
      const isListItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)
      const isIndented = /^\s+/.test(line)
      const containsPrd = /PRD-[A-Z][A-Z0-9]*-\d{3}/.test(line)
      if (isListItem || (isIndented && containsPrd) || (containsPrd && !/^\S/.test(line))) {
        buffer.push(line)
        continue
      }
      if (containsPrd) buffer.push(line)
      else break
    }
    const matches = buffer.join(' ').match(PRD_RE) || []
    for (const id of matches) ids.add(id)
  }
  return { foundDirective: true, ids: [...ids], line: first.index + 1, naReason: null }
}

/* ------------------------------------------------------------------ */
/* R4 追溯表一致性                                                     */
/* ------------------------------------------------------------------ */

function checkTraceabilityConsistency(run, traceText, traceFile) {
  let identifiedCoverageTable = false
  let identifiedClassColumns = false
  for (const block of traceBlocks(traceText)) {
    if (block.length < 2 || !isSeparatorRow(block[1].cells)) continue
    const header = block[0]
    const headerNames = header.cells.map(cleanCell)
    const coverageIdx = headerNames.findIndex((name) => /覆盖(?:状态)?|coverage/i.test(name))
    if (coverageIdx < 0) continue
    identifiedCoverageTable = true
    const gapIdx = headerNames.findIndex((name) => /缺口|gap/i.test(name))

    const classColumns = []
    for (const def of CLASS_COLUMNS) {
      const idx = headerNames.findIndex(
        (name, i) => i !== coverageIdx && i !== gapIdx && def.test.test(name),
      )
      if (idx >= 0 && !classColumns.some((col) => col.idx === idx)) {
        classColumns.push({ name: headerNames[idx], idx })
      }
    }
    if (classColumns.length > 0) identifiedClassColumns = true

    for (const row of block.slice(2)) {
      const first = cleanCell(row.cells[0])
      if (!PRD_ANCHORED_RE.test(first)) continue
      run.stats.r4Rows++
      const status = cleanCell(row.cells[coverageIdx] || '')
        .toLowerCase()
        .replace(/[^a-z]/g, '')
      if (status === 'covered') {
        for (const col of classColumns) {
          addCheck(run, 'R4')
          const value = cleanCell(row.cells[col.idx] || '')
          if (isBlankCell(value)) {
            fail(
              run,
              'R4',
              traceFile,
              row.line,
              `${first} 状态为 covered，但「${col.name}」列为空/占位符；补对应编号/链接`,
            )
          }
        }
      } else if (status === 'partial' || status === 'gap') {
        addCheck(run, 'R4')
        if (gapIdx < 0) {
          fail(run, 'R4', traceFile, row.line, `${first} 状态为 ${status}，但表头缺少「缺口」列；补该列`)
          continue
        }
        const gap = cleanCell(row.cells[gapIdx] || '')
        if (isBlankCell(gap)) {
          fail(run, 'R4', traceFile, row.line, `${first} 状态为 ${status}，但「缺口」列为空/占位符；补缺口说明`)
        }
      }
    }
  }
  addCheck(run, 'R4')
  if (!identifiedCoverageTable) {
    fail(run, 'R4', traceFile, 1, '未找到含「覆盖」状态列的追溯表；按规范补表头')
  } else if (!identifiedClassColumns) {
    fail(run, 'R4', traceFile, 1, '追溯表未识别到六类列（产品/变更/前端/后端/组件/任务/测试）；核对表头')
  }
}

/* ------------------------------------------------------------------ */
/* 主检查                                                              */
/* ------------------------------------------------------------------ */

function runChecks(run) {
  const treeFile = join(run.root, 'docs/product/TREE.md')
  const traceFile = join(run.root, 'docs/product/TRACEABILITY.md')
  const treeText = readRequired(run, 'docs/product/TREE.md')
  const traceText = readRequired(run, 'docs/product/TRACEABILITY.md')
  if (treeText === null || traceText === null) return

  const treeRows = prdRows(treeText)
  const treePrds = new Map()
  for (const row of treeRows) {
    addCheck(run, 'T1')
    if (treePrds.has(row.prd)) {
      fail(run, 'T1', treeFile, row.line, `TREE.md 中 ${row.prd} 重复出现；删除重复行`, { prd: row.prd })
      continue
    }
    treePrds.set(row.prd, row)
  }
  run.stats.prdTotal = treePrds.size
  const treeTotal = parseTotal(treeText, 'tree')
  const traceTotal = parseTotal(traceText, 'traceability')
  run.stats.treeTotal = treeTotal ? treeTotal.value : null
  run.stats.traceabilityTotal = traceTotal ? traceTotal.value : null

  addCheck(run, 'T1')
  if (treeTotal === null) {
    fail(run, 'T1', treeFile, 1, 'TREE.md 未找到「合计」行或无法解析 L3(PRD) 总数；补合计行')
  } else if (treeTotal.value !== treePrds.size) {
    fail(
      run,
      'T1',
      treeFile,
      treeTotal.line,
      `TREE.md 合计 ${treeTotal.value} 与解析到的 PRD 行数 ${treePrds.size} 不一致；修正合计行`,
    )
  }
  addCheck(run, 'T1')
  if (traceTotal === null) {
    fail(run, 'T1', traceFile, 1, 'TRACEABILITY.md 未找到「合计」行或无法解析 PRD 总数；补合计行')
  } else if (traceTotal.value !== treePrds.size) {
    fail(
      run,
      'T1',
      traceFile,
      traceTotal.line,
      `TRACEABILITY.md 合计 ${traceTotal.value} 与 TREE.md PRD 数 ${treePrds.size} 不一致；修正合计行`,
    )
  }

  const traceRows = prdRows(traceText)
  const tracePrds = new Map()
  for (const row of traceRows) {
    addCheck(run, 'T1')
    if (tracePrds.has(row.prd)) {
      fail(run, 'T1', traceFile, row.line, `TRACEABILITY.md 中 ${row.prd} 重复出现；删除重复行`, { prd: row.prd })
      continue
    }
    tracePrds.set(row.prd, row)
  }
  run.stats.traceabilityPrds = tracePrds.size

  // 产品 spec 声明集合（按域）。
  const productSpecFiles = listFiles(join(run.root, 'specs/product')).filter(
    (file) => file.endsWith('/spec.md') || file.endsWith('\\spec.md'),
  )
  const productDeclarations = new Map()
  for (const file of productSpecFiles) {
    const text = readText(file)
    if (text === null) {
      fail(run, 'T3', file, 1, `产品 spec 不可读：${toRel(run, file)}；修正文件权限/编码`)
      continue
    }
    const normalizedFile = file.replace(/\\/g, '/')
    const domainMatch = /(?:^|\/)specs\/product\/([^/]+)\/spec\.md$/.exec(normalizedFile)
    const domain = domainMatch ? domainMatch[1] : ''
    productDeclarations.set(domain, productPrdDeclarations(text))
    run.stats.productSpecPrds += productDeclarations.get(domain).size
  }

  // 每个 TREE PRD：产品 spec、TEST 链接。
  for (const [prd, row] of treePrds) {
    addCheck(run, 'T3')
    const productLinks = row.links.filter((link) => PRODUCT_TARGET_RE.test(link.target))
    const testLinks = row.links.filter((link) => TEST_TARGET_RE.test(link.target))

    if (productLinks.length === 0) {
      fail(run, 'T3', treeFile, row.line, `TREE.md 中 ${prd} 缺少产品 spec 链接；补链接`, { prd })
    } else if (productLinks.length > 1) {
      warn(run, 'T3', treeFile, row.line, `TREE.md 中 ${prd} 有多个产品 spec 链接；保留一个`, { prd })
    }

    let expectedDomain = null
    if (productLinks.length > 0) {
      const link = productLinks[0]
      expectedDomain = domainFromTarget(link.target, 'product')
      const resolved = resolveTarget(run, treeFile, link.target)
      if (resolved.external || !resolved.abs) {
        fail(run, 'T3', treeFile, row.line, `TREE.md 中 ${prd} 的产品 spec 链接不是仓库内路径；改正链接`, { prd })
      } else {
        const text = readText(resolved.abs)
        if (text === null) {
          fail(run, 'T3', treeFile, row.line, `TREE.md 中 ${prd} 的产品 spec 不存在：${toRel(run, resolved.abs)}；补该文件`, {
            prd,
          })
        } else if (!productPrdDeclarations(text).has(prd)) {
          run.stats.productSpecIssues++
          fail(run, 'T3', resolved.abs, 1, `${prd} 未在对应产品 spec 中声明；用 ## PRD-... 补声明`, { prd })
        }
      }
    }

    if (testLinks.length === 0) {
      run.stats.badAnchors++
      fail(run, 'T4', treeFile, row.line, `TREE.md 中 ${prd} 缺少 TEST 链接；补 test-plan 锚点链接`, {
        prd,
        source: 'TREE',
      })
    } else {
      for (const link of testLinks) {
        validateTestLink(run, treeFile, link, prd, expectedDomain, 'TREE', row.line)
      }
    }
  }

  // 产品 spec 中出现但 TREE 不存在的 PRD。
  for (const [domain, declarations] of productDeclarations) {
    for (const prd of declarations) {
      addCheck(run, 'T3')
      if (!treePrds.has(prd)) {
        run.stats.productSpecIssues++
        fail(run, 'T3', join(run.root, 'specs/product', domain, 'spec.md'), 1, `${prd} 未出现在 TREE.md 中；删除声明或补进 TREE`, {
          prd,
        })
      }
    }
  }

  // 每个 TREE PRD 必须出现在 TRACEABILITY，且其 TEST 链接有效。
  for (const [prd, row] of treePrds) {
    addCheck(run, 'T2')
    const traceRow = tracePrds.get(prd)
    if (!traceRow) {
      run.stats.missingPrds++
      fail(run, 'T2', traceFile, 1, `${prd} 未出现在 TRACEABILITY.md；补该 PRD 行`, { prd })
      continue
    }
    const testLinks = traceRow.links.filter((link) => TEST_TARGET_RE.test(link.target))
    if (testLinks.length === 0) {
      run.stats.badAnchors++
      fail(run, 'T4', traceFile, traceRow.line, `TRACEABILITY.md 中 ${prd} 缺少 TEST 链接；补 test-plan 锚点链接`, {
        prd,
        source: 'TRACEABILITY',
      })
      continue
    }
    const productLinks = row.links.filter((link) => PRODUCT_TARGET_RE.test(link.target))
    const expectedDomain = productLinks.length > 0 ? domainFromTarget(productLinks[0].target, 'product') : null
    for (const link of testLinks) {
      validateTestLink(run, traceFile, link, prd, expectedDomain, 'TRACEABILITY', traceRow.line)
    }
  }

  // TRACEABILITY 中出现但 TREE 不存在的 PRD。
  for (const prd of tracePrds.keys()) {
    addCheck(run, 'T2')
    if (!treePrds.has(prd)) {
      run.stats.unknownPrds++
      fail(run, 'T2', traceFile, 1, `${prd} 出现在 TRACEABILITY.md，但 TREE.md 中没有；补进 TREE 或删除`, { prd })
    }
  }

  // change 包：specs/changes/**/spec.md 的 Implements。
  const changeFiles = listFiles(join(run.root, 'specs/changes')).filter(
    (file) => file.endsWith('/spec.md') || file.endsWith('\\spec.md'),
  )
  run.stats.changePackages = changeFiles.length
  for (const file of changeFiles) {
    addCheck(run, 'T5')
    const text = readText(file)
    if (text === null) {
      run.stats.changeIssues++
      fail(run, 'T5', file, 1, `change spec 不可读：${toRel(run, file)}；修正文件权限/编码`)
      continue
    }
    const impl = extractImplements(text)
    if (!impl.foundDirective) {
      run.stats.changeIssues++
      fail(run, 'T5', file, 1, '缺少 Implements 声明；补 PRD 列表或 `Implements: N/A：<≥8 字理由>`')
      continue
    }
    if (impl.naReason !== null) {
      if ([...impl.naReason].length < NA_REASON_MIN) {
        run.stats.changeIssues++
        fail(run, 'T5', file, impl.line, `Implements: N/A 的理由需 ≥${NA_REASON_MIN} 字；补足理由`)
      } else {
        run.stats.governance++
        run.governance.push({ file, line: impl.line, reason: impl.naReason })
      }
      continue
    }
    if (impl.ids.length === 0) {
      run.stats.changeIssues++
      fail(run, 'T5', file, impl.line, 'Implements 未列出任何 PRD；补 PRD 编号')
      continue
    }
    for (const prd of impl.ids) {
      if (!treePrds.has(prd)) {
        run.stats.changeIssues++
        fail(run, 'T5', file, impl.line, `引用了 TREE 中不存在的 PRD：${prd}；改为 TREE 中的 PRD`, { prd })
      }
    }
  }

  // E2E 测试计划入口。
  const e2eReadme = join(run.root, 'specs/test/e2e/README.md')
  addCheck(run, 'T6')
  run.stats.e2eReadme = existsSync(e2eReadme) && statSync(e2eReadme).isFile()
  if (!run.stats.e2eReadme) {
    fail(run, 'T6', e2eReadme, 1, '缺少 specs/test/e2e/README.md；补 E2E 测试计划入口')
  }

  // R4：TRACEABILITY 表格的 covered / partial / gap 一致性。
  checkTraceabilityConsistency(run, traceText, traceFile)

  // 非阻塞提示：未被任何 change 引用的 PRD（仅提示，不制造通过/失败）。
  const changePrds = new Set()
  for (const file of changeFiles) {
    const text = readText(file)
    if (!text) continue
    for (const prd of extractImplements(text).ids) changePrds.add(prd)
  }
  if (changeFiles.length > 0) {
    const unreferenced = [...treePrds.keys()].filter((prd) => !changePrds.has(prd))
    if (unreferenced.length > 0) {
      const preview = unreferenced.slice(0, 10).join(', ')
      const more = unreferenced.length > 10 ? ` ... (+${unreferenced.length - 10})` : ''
      warn(run, 'T2', traceFile, 1, `${unreferenced.length} 个 PRD 未被任何 change 包引用（仅提示）：${preview}${more}`)
    }
  }
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

/** 判定：零检查不得判 PASS；--rule 单跑时用该规则名下的检查数。 */
function decideRun(run) {
  const count = run.stats.ruleFilter ? (run.filteredChecks ?? 0) : run.checks
  return { pass: isPass(run.failures, count), count }
}

function reportExitCode(run) {
  return decideRun(run).pass ? 0 : 1
}

function report(run, asJson) {
  const decision = decideRun(run)
  const ok = decision.pass
  const checks = decision.count
  const failures = run.failures.map((item) => ({
    rule: item.rule,
    severity: 'error',
    path: toRel(run, item.file),
    file: toRel(run, item.file),
    line: item.line,
    hint: item.hint ?? item.message,
    message: item.message,
    ...(item.prd ? { prd: item.prd } : {}),
    ...(item.source ? { source: item.source } : {}),
  }))
  const warnings = run.warnings.map((item) => ({
    rule: item.rule,
    severity: 'warning',
    path: toRel(run, item.file),
    file: toRel(run, item.file),
    line: item.line,
    hint: item.hint ?? item.message,
    message: item.message,
  }))
  const governance = run.governance.map((item) => ({
    file: toRel(run, item.file),
    line: item.line,
    reason: item.reason,
  }))

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          ok,
          root: run.root,
          checks,
          stats: { ...run.stats, failures: run.failures.length },
          change: run.stats.changeId || null,
          failures,
          warnings,
          governance,
        },
        null,
        2,
      ),
    )
    return ok ? 0 : 1
  }

  console.log('check-trace: PRD 追溯结构门禁')
  console.log(`  根目录：${run.root}`)
  console.log(
    `  PRD 总数：TREE ${run.stats.prdTotal}，TRACEABILITY 声明 ${run.stats.traceabilityTotal ?? 'N/A'}，TRACEABILITY 实际 ${run.stats.traceabilityPrds}`,
  )
  console.log(`  缺失（TRACEABILITY 未收录）：${run.stats.missingPrds}`)
  console.log(`  坏 TEST 锚点：${run.stats.badAnchors}`)
  console.log(`  缺失 TEST 计划：${run.stats.missingTestPlans}`)
  console.log(`  非法 TEST 链接：${run.stats.invalidTestLinks}`)
  console.log(`  产品 spec PRD 声明：${run.stats.productSpecPrds}，产品 spec 问题：${run.stats.productSpecIssues}`)
  console.log(`  change 包：${run.stats.changePackages}，change 问题：${run.stats.changeIssues}，治理豁免：${run.stats.governance}`)
  console.log(`  E2E README：${run.stats.e2eReadme ? '存在' : '缺失'}；R4 检查行：${run.stats.r4Rows}`)
  if (run.stats.ruleFilter) console.log(`  规则过滤：${run.stats.ruleFilter}（只统计该规则名下的检查）`)
  console.log(`  失败项：${run.failures.length}，提示项：${run.warnings.length}`)

  for (const item of governance) {
    console.log(`[GOVERNANCE] ${item.file}:${item.line} Implements: N/A — ${item.reason}`)
  }
  for (const item of failures) {
    console.log(`${item.file}:${item.line} ${item.rule} ${item.message}`)
  }
  for (const item of warnings) {
    console.log(`[WARN] ${item.file}:${item.line} ${item.rule} ${item.message}`)
  }
  console.log(formatGateLine(run))
  const ruleSuffix = run.stats.ruleFilter ? `, rule: ${run.stats.ruleFilter}` : ''
  if (ok) {
    console.log(`PASS (checks: ${checks}${ruleSuffix})`)
    return 0
  }
  if (run.failures.length === 0) {
    console.log(`FAILED: 零检查不得判 PASS (checks: ${checks}${ruleSuffix})`)
    return 1
  }
  console.log(`FAILED: ${run.failures.length} issue(s)${run.stats.ruleFilter ? ` (rule: ${run.stats.ruleFilter})` : ''}`)
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
  // 违规夹具用 5 行矩阵覆盖 AC-04：完整 covered / covered 缺列 / partial 缺缺口 /
  // gap 占位符 / partial 有缺口。合规夹具只放 1 行完整 covered。
  const prds = good
    ? ['PRD-DEMO-001']
    : ['PRD-DEMO-001', 'PRD-DEMO-002', 'PRD-DEMO-003', 'PRD-DEMO-004', 'PRD-DEMO-005']
  const n3 = (i) => String(i + 1).padStart(3, '0')
  const tc = (i) => `[TC-DEMO-${n3(i)}](../../specs/test/demo/test-plan.md#tc-demo-${n3(i)})`
  const specLink = (prd) => `[spec](../../specs/product/demo/spec.md#${prd.toLowerCase()})`
  const changeLink = '[CHG-SELFTEST-001](../../specs/changes/CHG-SELFTEST-001/spec.md)'

  const treeRows = prds.map(
    (prd, i) =>
      `| \`${prd}\` | 演示 ${n3(i)} | ${changeLink} | ${specLink(prd)} | ${tc(i)} | \`partial\` | 待补 |`,
  )
  writeFixtureFile(root, 'docs/product/TREE.md', [
    '# TREE',
    '',
    '| 域 | PRD | covered | partial | gap | 产品 spec | TEST |',
    '|---|---|---:|---:|---:|---|---|',
    `| P1 | ${prds.length} | 0 | ${prds.length} | 0 | [spec](../../specs/product/demo/spec.md) | [test](../../specs/test/demo/test-plan.md) |`,
    `| **合计** | — | 1 个技术域码 | **${prds.length}** | **${prds.length}** | **0** | **0** |`,
    '',
    '| PRD | 名称 | 变更 | 产品 spec | TEST | 覆盖 | 缺口 |',
    '|---|---|---|---|---|---|---|',
    ...treeRows,
    '',
  ].join('\n'))

  if (good) {
    writeFixtureFile(root, 'docs/product/TRACEABILITY.md', [
      '# TRACEABILITY',
      '',
      '| PRD | 名称 | CHANGE | TEST | 覆盖 | 缺口 |',
      '|---|---|---|---|---|---|',
      `| \`PRD-DEMO-001\` | 演示 | ${changeLink} | ${tc(0)} | \`covered\` | — |`,
      '',
      '| **合计** | **1** | **1** | **0** | **0** |',
      '',
    ].join('\n'))
  } else {
    writeFixtureFile(root, 'docs/product/TRACEABILITY.md', [
      '# TRACEABILITY',
      '',
      '| PRD | 名称 | 产品 | 变更 | 前端 | 后端 | 组件 | 任务 | 测试 | 覆盖 | 缺口 |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
      `| \`PRD-DEMO-001\` | covered 完整 | spec | CHG | fe | be | comp | task | ${tc(0)} | \`covered\` | — |`,
      `| \`PRD-DEMO-002\` | covered 缺任务 | spec | CHG | fe | be | comp |  | ${tc(1)} | \`covered\` | — |`,
      `| \`PRD-DEMO-003\` | partial 缺缺口 | spec | CHG | fe | be | comp | task | ${tc(2)} | \`partial\` |  |`,
      `| \`PRD-DEMO-004\` | gap 占位 | spec | CHG | fe | be | comp | task | ${tc(3)} | \`gap\` | 无 |`,
      `| \`PRD-DEMO-005\` | partial 有缺口 | spec | CHG | fe | be | comp | task | ${tc(4)} | \`partial\` | 权限未测 |`,
      '',
      '| **合计** | **5** | **0** | **0** |',
      '',
    ].join('\n'))
  }

  const productSpec = ['# demo 产品 spec', '']
  for (const prd of prds) productSpec.push(`## ${prd}`, '', '演示用 PRD。', '', '### 验收', '', '- A1 自测。', '')
  writeFixtureFile(root, 'specs/product/demo/spec.md', productSpec.join('\n'))

  writeFixtureFile(
    root,
    'specs/test/demo/test-plan.md',
    [
      '# demo 测试计划',
      '',
      ...prds.flatMap((prd, i) => [`<a id="tc-demo-${n3(i)}"></a>`, '', `## TC-DEMO-${n3(i)}`, '', '- 自测用例。', '']),
    ].join('\n'),
  )

  writeFixtureFile(root, 'specs/test/e2e/README.md', '# E2E\n\n自测夹具。\n')

  const changeSpec = good
    ? [
        '# CHG-SELFTEST-001',
        '',
        'Implements: N/A：本变更为追溯门禁自测夹具，不关联任何产品 PRD（工程治理）。',
        '',
      ]
    : ['# CHG-SELFTEST-001', '', '状态：active', '', '（故意缺少 Implements 声明）', '']
  writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-001/spec.md', changeSpec.join('\n'))

  if (!good) {
    // AC-06：Implements: N/A：空理由 / 短理由都必须命中 T5。
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-NA-EMPTY/spec.md', '# NA 空理由\n\nImplements: N/A：\n')
    writeFixtureFile(root, 'specs/changes/CHG-SELFTEST-NA-SHORT/spec.md', '# NA 短理由\n\nImplements: N/A：短\n')
  }
}

function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), 'dsh-trace-gate-'))
  const assertions = []
  let badIssues = 0
  try {
    const goodRoot = join(tmp, 'good')
    const badRoot = join(tmp, 'bad')
    buildSelfTestFixture(goodRoot, 'good')
    buildSelfTestFixture(badRoot, 'bad')

    const good = createRun(goodRoot)
    const bad = createRun(badRoot)
    try {
      runChecks(good)
      runChecks(bad)
    } catch (e) {
      assertions.push({ name: '自测执行未抛错', ok: false, detail: e && e.stack ? e.stack : String(e) })
      throw e
    }
    badIssues = bad.failures.length
    const badRules = new Set(bad.failures.map((f) => f.rule))
    const assert = (name, ok, detail = '') => assertions.push({ name, ok, detail })

    assert('合规夹具 exit 0', (good.failures.length === 0 ? 0 : 1) === 0, `issues=${good.failures.length}`)
    assert('违规夹具 exit 1', (bad.failures.length === 0 ? 0 : 1) === 1, `issues=${bad.failures.length}`)
    assert('合规夹具无失败项', good.failures.length === 0, good.failures.map((f) => `${f.rule}:${f.message}`).join('; '))
    assert('合规夹具命中 governance 豁免', good.governance.length === 1, `governance=${good.governance.length}`)
    assert('违规夹具命中 R4', badRules.has('R4'), `rules=${[...badRules].join(',')}`)
    assert('违规夹具命中 T5', badRules.has('T5'), `rules=${[...badRules].join(',')}`)

    // RC-11：零检查结果必须判红，不得因“没有失败项”放行。
    const zeroRun = createRun(goodRoot)
    const zeroLogs = []
    const originalLog = console.log
    let zeroCode = 0
    try {
      console.log = (...args) => zeroLogs.push(args.join(' '))
      zeroCode = report(zeroRun, false)
    } finally {
      console.log = originalLog
    }
    assert('零检查结果退出码非 0', zeroCode === 1, `exit=${zeroCode}`)
    assert('零检查结果输出判红行', zeroLogs.some((line) => line.includes('零检查不得判 PASS')), zeroLogs.slice(-1).join(''))
    assert('合规夹具退出码 0', reportExitCode(good) === 0, `exit=${reportExitCode(good)}`)
    assert('违规夹具退出码 1', reportExitCode(bad) === 1, `exit=${reportExitCode(bad)}`)
    const zeroRuleRun = createRun(goodRoot)
    zeroRuleRun.stats.ruleFilter = 'MXV2-1-06'
    zeroRuleRun.filteredChecks = 0
    assert('--rule 零检查退出码非 0', reportExitCode(zeroRuleRun) === 1, `exit=${reportExitCode(zeroRuleRun)}`)

    // AC-04 / AC-06：5 行矩阵只报 002（covered 缺任务）、003（partial 缺缺口）、
    // 004（gap 占位符「无」）；001（完整 covered）与 005（partial 有缺口）必须通过。
    const r4 = bad.failures.filter((f) => f.rule === 'R4')
    const r4Text = r4.map((f) => f.message).join('\n')
    const r4Ids = [...new Set((r4Text.match(/PRD-DEMO-\d{3}/g) || []))].sort()
    assert('五行矩阵 R4 报 3 条', r4.length === 3, `r4=${r4.length}: ${r4Text}`)
    assert(
      'R4 只报 002/003/004',
      r4Ids.join(',') === 'PRD-DEMO-002,PRD-DEMO-003,PRD-DEMO-004',
      `ids=${r4Ids.join(',')}`,
    )
    assert(
      'partial/gap 不被误判 covered',
      !/PRD-DEMO-00[15]/.test(r4Text) && r4Text.includes('缺口'),
      r4Text,
    )

    // AC-06：Implements: N/A：空理由 / 短理由（<8 字）都必须命中 T5。
    const naEmpty = bad.failures.filter((f) => f.file.includes('CHG-SELFTEST-NA-EMPTY'))
    const naShort = bad.failures.filter((f) => f.file.includes('CHG-SELFTEST-NA-SHORT'))
    assert(
      'Implements N/A 空理由命中 T5',
      naEmpty.length === 1 && naEmpty[0].rule === 'T5',
      naEmpty.map((f) => `${f.rule}:${f.message}`).join('; ') || '无失败',
    )
    assert(
      'Implements N/A 短理由命中 T5',
      naShort.length === 1 && naShort[0].rule === 'T5',
      naShort.map((f) => `${f.rule}:${f.message}`).join('; ') || '无失败',
    )

    // T7（--change 单包闭环）：每个包放在独立根目录，避免 T5 把其它夹具包一起扫进来。
    const changeRoot = (tag) => {
      const root = join(tmp, `change-${tag}`)
      buildSelfTestFixture(root, 'good')
      return root
    }
    const root001 = changeRoot('ok')
    writeFixtureFile(root001, 'specs/changes/CHG-T7-001/spec.md', [
      '# CHG-T7-001',
      '',
      'Implements: PRD-DEMO-001',
      '',
      '| AC | 判据 |',
      '|---|---|',
      '| AC-DEMO-001 | 变更包合规 |',
      '',
    ].join('\n'))
    writeFixtureFile(root001, 'specs/changes/CHG-T7-001/evidence.md', '# 证据\n\nAC-DEMO-001 由 test-plan 覆盖。\n')
    const root002 = changeRoot('orphan-ac')
    writeFixtureFile(root002, 'specs/changes/CHG-T7-002/spec.md', [
      '# CHG-T7-002',
      '',
      'Implements: PRD-DEMO-001',
      '',
      'AC-DEMO-999 只写在 spec.md 里。',
      '',
    ].join('\n'))
    const root003 = changeRoot('no-implements')
    writeFixtureFile(root003, 'specs/changes/CHG-T7-003/spec.md', '# CHG-T7-003\n\n没有 Implements 行，也没有 AC。\n')
    const root004 = changeRoot('stray-prd')
    writeFixtureFile(root004, 'specs/changes/CHG-T7-004/spec.md', [
      '# CHG-T7-004',
      '',
      'Implements: PRD-DEMO-777',
      '',
    ].join('\n'))

    const changeRun = (root, id) => {
      const run = createRun(root)
      run.stats.changeId = id
      runChecks(run)
      checkChangeTrace(run, id)
      return run
    }
    const okChange = changeRun(root001, 'CHG-T7-001')
    assert(
      '合规变更包 T7 零失败',
      okChange.failures.length === 0,
      okChange.failures.map((f) => `${f.rule}:${f.message}`).join('; '),
    )
    const missing = changeRun(root001, 'CHG-T7-404')
    assert(
      '缺失变更包命中 T7',
      missing.failures.length === 1 && missing.failures[0].rule === 'T7' && missing.failures[0].message.includes('不存在'),
      missing.failures.map((f) => `${f.rule}:${f.message}`).join('; ') || '无失败',
    )
    const orphanAc = changeRun(root002, 'CHG-T7-002')
    assert(
      'AC 未被任务/证据/测试引用命中 T7',
      orphanAc.failures.some((f) => f.rule === 'T7' && f.message.includes('AC-DEMO-999')),
      orphanAc.failures.map((f) => f.rule + ':' + f.message).join('; ') || '无失败',
    )
    const noImplements = changeRun(root003, 'CHG-T7-003')
    assert(
      '缺 Implements 命中 T7',
      noImplements.failures.some((f) => f.rule === 'T7' && f.message.includes('Implements')),
      noImplements.failures.map((f) => f.rule + ':' + f.message).join('; ') || '无失败',
    )
    const strayPrd = changeRun(root004, 'CHG-T7-004')
    assert(
      'Implements 的 PRD 不在矩阵命中 T7',
      strayPrd.failures.some((f) => f.rule === 'T7' && f.message.includes('PRD-DEMO-777')),
      strayPrd.failures.map((f) => f.rule + ':' + f.message).join('; ') || '无失败',
    )
    assert(
      '[GATE-TRACE] 汇总行含 checks/failures/change/status',
      /^\[GATE-TRACE\] checks=\d+ failures=\d+ change=CHG-T7-001 status=PASS$/.test(formatGateLine(okChange)),
      formatGateLine(okChange),
    )
  } catch {
    // 断言已记录，交给下方统一输出。
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

const RULES = ['MXV2-1-06', 'MXV2-2-05', 'MXV2-4-04', 'MXV2-7-02', 'MXV2-7-05'];

/** GATES.md 表 3-1：规则位与内部检查编号的映射，供 --rule 单跑收窄。 */
const RULE_ROOTS = {
  T1: ['MXV2-1-06'],
  T2: ['MXV2-2-05'],
  T3: ['MXV2-4-04'],
  T4: ['MXV2-7-02'],
  T5: ['MXV2-7-05'],
  T6: ['MXV2-1-06', 'MXV2-2-05'],
}

function narrowRun(run, rule) {
  const internal = new Set(
    Object.entries(RULE_ROOTS)
      .filter(([, rules]) => rules.includes(rule))
      .map(([code]) => code),
  )
  run.failures = run.failures.filter((item) => internal.has(item.rule))
  run.warnings = run.warnings.filter((item) => internal.has(item.rule))
  // 单跑时只计该规则名下的检查数；零检查不得借整册计数判 PASS。
  run.filteredChecks = [...internal].reduce((sum, code) => sum + (run.checksByRule[code] ?? 0), 0)
  run.stats.ruleFilter = rule
}

function parseArgs(argv) {
  const knownFlags = new Set(['--self-test', '--json'])
  const valueFlags = new Set(['--root', '--change', '--rule'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (valueFlags.has(arg)) {
      i += 1
      continue
    }
    if (!knownFlags.has(arg)) {
      console.error(`✗ 未知参数 ${arg}；可用：--self-test --json --root <dir> --change <CHG-ID>`)
      process.exit(2)
    }
  }
  const opt = (name, fallback = '') => {
    const i = argv.indexOf(name)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
  }
  return {
    selfTest: argv.includes('--self-test'),
    json: argv.includes('--json'),
    root: resolve(opt('--root', DEFAULT_ROOT)),
    change: opt('--change', ''),
    rule: opt('--rule', ''),
  }
}

/**
 * 变更包追溯闭环（T7）：--change 指定变更包时，核对「本包声明的 AC 是否真的被
 * 任务/证据/测试引用」以及「本包 Implements 的 PRD 是否在追溯矩阵里」。整册 T1–T6
 * 只看 PRD 层，T7 补的是单包层，两者不互相替代。
 */
function checkChangeTrace(run, changeId) {
  const dir = join(run.root, 'specs/changes', changeId)
  run.stats.changeId = changeId
  addCheck(run, 'T7')
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail(run, 'T7', join(dir, 'spec.md'), 1, `--change 指定的变更包不存在：specs/changes/${changeId}；核对包号或先建包`, {
      change: changeId,
    })
    return
  }
  const specFile = join(dir, 'spec.md')
  const specText = existsSync(specFile) ? readText(specFile) : null
  addCheck(run, 'T7')
  if (specText === null) {
    fail(run, 'T7', specFile, 1, `变更包 ${changeId} 缺 spec.md；按模板补 spec.md 并声明 Implements 与 AC`, {
      change: changeId,
    })
    return
  }

  const traceText = readText(join(run.root, 'docs/product/TRACEABILITY.md')) ?? ''
  const tracePrds = new Set((traceText.match(PRD_RE) || []).map((id) => id.toUpperCase()))
  const implementsMatch = /Implements\s*[:：]\s*([^\n]*)/.exec(specText)
  addCheck(run, 'T7')
  if (!implementsMatch) {
    fail(run, 'T7', specFile, 1, `变更包 ${changeId} 的 spec.md 缺「Implements: PRD-…」声明；补实现对象`, {
      change: changeId,
    })
  } else {
    const declared = (implementsMatch[1].match(PRD_RE) || []).map((id) => id.toUpperCase())
    if (declared.length === 0 && !/N\/A/.test(implementsMatch[1])) {
      fail(run, 'T7', specFile, 1, `变更包 ${changeId} 的 Implements 既不是 PRD 也不是 N/A：<理由>；改写声明`, {
        change: changeId,
      })
    }
    for (const prd of declared) {
      addCheck(run, 'T7')
      if (!tracePrds.has(prd)) {
        fail(run, 'T7', specFile, 1, `变更包 ${changeId} 声明实现 ${prd}，但追溯矩阵里没有这个 PRD；先在 TRACEABILITY.md 登记`, {
          change: changeId,
          prd,
        })
      }
    }
  }

  // AC 必须在 spec.md 之外至少被引用一次（任务卡、证据、测试计划都算），
  // 否则「验收条目」只是写在纸面上，没有人会去跑。
  const acIds = [...new Set((specText.match(AC_RE) || []).map((id) => id.toUpperCase()))]
  const referenced = new Set()
  for (const file of listFiles(dir)) {
    if (file === specFile || !file.endsWith('.md')) continue
    const text = readText(file) ?? ''
    for (const id of text.match(AC_RE) || []) referenced.add(id.toUpperCase())
  }
  for (const file of listFiles(join(run.root, 'specs/test'))) {
    if (!file.endsWith('.md')) continue
    const text = readText(file) ?? ''
    for (const id of text.match(AC_RE) || []) referenced.add(id.toUpperCase())
  }
  for (const id of acIds) {
    addCheck(run, 'T7')
    if (!referenced.has(id)) {
      fail(run, 'T7', specFile, 1, `变更包 ${changeId} 的 ${id} 只写在 spec.md 里，任务/证据/测试都没有引用；补引用`, {
        change: changeId,
        ac: id,
      })
    }
  }
}

function formatGateLine(run) {
  const decision = decideRun(run)
  const status = decision.pass ? 'PASS' : 'FAILED'
  return `[GATE-TRACE] checks=${decision.count} failures=${run.failures.length} change=${run.stats.changeId || '-'} status=${status}`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.rule && !RULES.includes(options.rule)) {
    console.error(`✗ 不覆盖规则 ${options.rule}；覆盖：${RULES.join('、')}`)
    process.exit(2)
  }
  if (options.selfTest) {
    process.exit(runSelfTest())
  }
  if (!existsSync(options.root)) {
    console.error(`✗ 根目录不存在：${options.root}`)
    process.exit(2)
  }
  const run = createRun(options.root)
  if (options.change) run.stats.changeId = options.change
  try {
    runChecks(run)
    if (options.change) checkChangeTrace(run, options.change)
  } catch (e) {
    if (e instanceof PreflightError) {
      console.error(`✗ ${e.message}`)
      process.exit(2)
    }
    throw e
  }
  if (options.rule) narrowRun(run, options.rule)
  process.exit(report(run, options.json))
}

// 规则级命令按内部检查映射收窄；零检查结果一律判红（见 decideRun）。

main()


