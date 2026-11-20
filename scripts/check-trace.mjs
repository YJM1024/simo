#!/usr/bin/env node
/**
 * check-trace.mjs — 产品需求追溯结构门禁（零依赖、只读）
 *
 * 只检查“结构/追溯是否完整”，不判断 PRD 是否 covered，也不把
 * `missing` 证据当成通过。覆盖：
 *   1) TREE.md 的 PRD 与 TRACEABILITY.md 的 PRD 总数一致（默认应为 71）；
 *   2) TREE.md 中每个 PRD 都出现在 TRACEABILITY.md；
 *   3) 每个 PRD 的 TEST 链接指向的 test-plan 文件存在，且 `#tc-...`
 *      锚点在该文件中存在（TREE 与 TRACEABILITY 两侧都检查）；
 *   4) TREE.md 的每个 PRD 在其产品 spec（specs/product/<域>/spec.md）
 *      中有声明；产品 spec 不应出现 TREE 中不存在的 PRD；
 *   5) specs/changes/**\/spec.md 必须声明 `Implements: PRD-...`
 *      （支持同行、多行、Markdown 列表），且引用的 PRD 存在；
 *   6) specs/test/e2e/README.md 存在。
 *
 * 用法：
 *   node scripts/check-trace.mjs
 *   node scripts/check-trace.mjs --root <repo-root>
 *   node scripts/check-trace.mjs --json
 *
 * 退出码：0 全部通过；1 存在结构/追溯失败；2 运行前置失败。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const opt = (name, fallback = '') => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const asJson = args.includes('--json')
const root = resolve(opt('--root', resolve(dirname(fileURLToPath(import.meta.url)), '..')))
const failures = []
const warnings = []
const stats = {
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
  e2eReadme: false,
}

const PRD_RE = /\bPRD-[A-Z][A-Z0-9]*-\d{3}\b/g
const PRD_ANCHORED_RE = /^`?(PRD-[A-Z][A-Z0-9]*-\d{3})`?$/

function fail(kind, file, message, extra = {}) {
  failures.push({ kind, file: toRel(file), message, ...extra })
}

function warn(kind, file, message) {
  warnings.push({ kind, file: toRel(file), message })
}

function toRel(file) {
  if (!file) return ''
  const abs = resolve(file)
  return abs.startsWith(root) ? abs.slice(root.length).replace(/^[\\/]/, '').replace(/\\/g, '/') : file
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

function readRequired(rel) {
  const file = join(root, rel)
  const text = readText(file)
  if (text === null) {
    fail('missing-file', rel, `必需文件不存在或不可读：${rel}`)
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
  return out
}

function tableRows(text) {
  const rows = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('|')) continue
    let body = line
    if (body.endsWith('|')) body = body.slice(0, -1)
    body = body.slice(1)
    const cells = body.split('|').map((cell) => cell.trim())
    rows.push({ line: i + 1, cells, raw: lines[i] })
  }
  return rows
}

function cleanCell(cell) {
  return String(cell || '').replace(/\*\*/g, '').replace(/`/g, '').trim()
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
    rows.push({
      prd: match[1],
      line: row.line,
      cells: row.cells,
      links: extractLinks(row.raw),
    })
  }
  return rows
}

function splitTarget(target) {
  const hashIndex = target.indexOf('#')
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target
  const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : null
  return { pathPart, anchor: anchor === null ? null : decodeURIComponent(anchor) }
}

function resolveTarget(baseFile, target) {
  const { pathPart, anchor } = splitTarget(target)
  if (/^[a-z][a-z0-9+.-]*:/i.test(pathPart)) {
    return { external: true, pathPart, anchor }
  }
  const decoded = decodeURIComponent(pathPart)
  const abs = decoded.startsWith('/')
    ? resolve(root, `.${decoded}`)
    : resolve(dirname(baseFile), decoded)
  return { external: false, abs, anchor, pathPart, target }
}

function domainFromTarget(target, kind) {
  const re = kind === 'test'
    ? /(?:^|\/)specs\/test\/([^/]+)\/test-plan\.md(?:#|$)/
    : /(?:^|\/)specs\/product\/([^/]+)\/spec\.md(?:#|$)/
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

function validateTestLink(baseFile, link, prd, expectedDomain, source) {
  const resolved = resolveTarget(baseFile, link.target)
  if (resolved.external) {
    stats.invalidTestLinks++
    fail('invalid-test-link', baseFile, `${prd} 的 TEST 链接不是仓库内路径：${link.target}`, { prd, source })
    return false
  }
  const domain = domainFromTarget(link.target, 'test')
  if (!domain) {
    stats.invalidTestLinks++
    fail('invalid-test-link', baseFile, `${prd} 的 TEST 链接不是 specs/test/<域>/test-plan.md：${link.target}`, { prd, source })
    return false
  }
  if (expectedDomain && domain !== expectedDomain) {
    stats.invalidTestLinks++
    fail(
      'test-domain-mismatch',
      baseFile,
      `${prd} 的 TEST 链接域为 ${domain}，TREE 产品 spec 域为 ${expectedDomain}：${link.target}`,
      { prd, source },
    )
  }
  if (!resolved.anchor) {
    stats.badAnchors++
    fail('bad-anchor', baseFile, `${prd} 的 TEST 链接缺少 #锚点：${link.target}`, { prd, source })
    return false
  }
  const planText = readText(resolved.abs)
  if (planText === null) {
    stats.missingTestPlans++
    fail(
      'missing-test-plan',
      baseFile,
      `${prd} 的 TEST 链接指向不存在的计划：${toRel(resolved.abs)}#${resolved.anchor}`,
      { prd, source },
    )
    return false
  }
  if (!explicitAnchorIds(planText).has(resolved.anchor)) {
    stats.badAnchors++
    fail(
      'bad-anchor',
      baseFile,
      `${prd} 的 TEST 锚点不存在：${toRel(resolved.abs)}#${resolved.anchor}`,
      { prd, source },
    )
    return false
  }
  return true
}

function productPrdDeclarations(text) {
  const found = new Set()
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
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
      if (nums.length >= 2) return nums[1]
    } else {
      // TRACEABILITY 汇总：PRD 总数为第 1 个数。
      return nums[0]
    }
  }
  return null
}

function extractImplements(text) {
  const lines = text.split(/\r?\n/)
  const ids = new Set()
  let foundDirective = false
  for (let i = 0; i < lines.length; i++) {
    const directive = /^\s*Implements\s*:\s*(.*)$/i.exec(lines[i])
    if (!directive) continue
    foundDirective = true
    const buffer = [directive[1]]
    for (let j = i + 1; j < lines.length; j++) {
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
  return { foundDirective, ids: [...ids] }
}

function main() {
  const treeFile = join(root, 'docs/product/TREE.md')
  const traceFile = join(root, 'docs/product/TRACEABILITY.md')
  const treeText = readRequired('docs/product/TREE.md')
  const traceText = readRequired('docs/product/TRACEABILITY.md')
  if (treeText === null || traceText === null) {
    return report()
  }

  const treeRows = prdRows(treeText)
  const treePrds = new Map()
  for (const row of treeRows) {
    if (treePrds.has(row.prd)) {
      fail('duplicate-prd', treeFile, `TREE.md 中 ${row.prd} 重复出现（行 ${row.line}）`, { prd: row.prd })
      continue
    }
    treePrds.set(row.prd, row)
  }
  stats.prdTotal = treePrds.size
  stats.treeTotal = parseTotal(treeText, 'tree')
  stats.traceabilityTotal = parseTotal(traceText, 'traceability')

  if (stats.treeTotal === null) {
    fail('totals', treeFile, 'TREE.md 未找到「合计」行或无法解析 L3(PRD) 总数')
  } else if (stats.treeTotal !== stats.prdTotal) {
    fail('totals', treeFile, `TREE.md L3 合计 ${stats.treeTotal} 与解析到的 PRD 行数 ${stats.prdTotal} 不一致`)
  }
  if (stats.traceabilityTotal === null) {
    fail('totals', traceFile, 'TRACEABILITY.md 未找到「合计」行或无法解析 PRD 总数')
  } else if (stats.traceabilityTotal !== stats.prdTotal) {
    fail(
      'totals',
      traceFile,
      `TRACEABILITY.md 合计 ${stats.traceabilityTotal} 与 TREE.md PRD 数 ${stats.prdTotal} 不一致`,
    )
  }

  const traceRows = prdRows(traceText)
  const tracePrds = new Map()
  for (const row of traceRows) {
    if (tracePrds.has(row.prd)) {
      fail('duplicate-prd', traceFile, `TRACEABILITY.md 中 ${row.prd} 重复出现（行 ${row.line}）`, { prd: row.prd })
      continue
    }
    tracePrds.set(row.prd, row)
  }
  stats.traceabilityPrds = tracePrds.size

  // 产品 spec 声明集合（按域）。
  const productSpecFiles = listFiles(join(root, 'specs/product')).filter((file) => file.endsWith('/spec.md') || file.endsWith('\\spec.md'))
  const productDeclarations = new Map()
  for (const file of productSpecFiles) {
    const text = readText(file)
    if (text === null) {
      fail('missing-file', file, `产品 spec 不可读：${toRel(file)}`)
      continue
    }
    const normalizedFile = file.replace(/\\/g, '/')
    const domainMatch = /(?:^|\/)specs\/product\/([^/]+)\/spec\.md$/.exec(normalizedFile)
    const domain = domainMatch ? domainMatch[1] : ''
    productDeclarations.set(domain, productPrdDeclarations(text))
    stats.productSpecPrds += productDeclarations.get(domain).size
  }

  // 每个 TREE PRD：产品 spec、TEST 链接。
  for (const [prd, row] of treePrds) {
    const productLinks = row.links.filter((link) => /(?:^|\/)specs\/product\/([^/]+)\/spec\.md(?:#|$)/.test(link.target))
    const testLinks = row.links.filter((link) => /(?:^|\/)specs\/test\/([^/]+)\/test-plan\.md(?:#|$)/.test(link.target))

    if (productLinks.length === 0) {
      fail('missing-product-spec', treeFile, `TREE.md 中 ${prd} 缺少产品 spec 链接（行 ${row.line}）`, { prd })
    } else if (productLinks.length > 1) {
      warn('multiple-product-spec', treeFile, `TREE.md 中 ${prd} 有多个产品 spec 链接（行 ${row.line}）`)
    }

    let expectedDomain = null
    if (productLinks.length > 0) {
      const link = productLinks[0]
      const domain = domainFromTarget(link.target, 'product')
      expectedDomain = domain
      const resolved = resolveTarget(treeFile, link.target)
      if (resolved.external || !resolved.abs) {
        fail('invalid-product-spec', treeFile, `TREE.md 中 ${prd} 的产品 spec 链接不是仓库内路径：${link.target}`, { prd })
      } else {
        const text = readText(resolved.abs)
        if (text === null) {
          fail('missing-product-spec', treeFile, `TREE.md 中 ${prd} 的产品 spec 不存在：${toRel(resolved.abs)}`, { prd })
        } else if (!productPrdDeclarations(text).has(prd)) {
          stats.productSpecIssues++
          fail(
            'product-spec-missing-prd',
            resolved.abs,
            `${prd} 未在对应产品 spec 中声明（TREE 行 ${row.line}）`,
            { prd },
          )
        }
      }
    }

    if (testLinks.length === 0) {
      stats.badAnchors++
      fail('missing-test-anchor', treeFile, `TREE.md 中 ${prd} 缺少 TEST 链接（行 ${row.line}）`, { prd, source: 'TREE' })
    } else {
      for (const link of testLinks) {
        validateTestLink(treeFile, link, prd, expectedDomain, 'TREE')
      }
    }
  }

  // 产品 spec 中出现但 TREE 不存在的 PRD。
  for (const [domain, declarations] of productDeclarations) {
    for (const prd of declarations) {
      if (!treePrds.has(prd)) {
        stats.productSpecIssues++
        fail('product-spec-unknown-prd', join(root, 'specs/product', domain, 'spec.md'), `${prd} 未出现在 TREE.md 中`)
      }
    }
  }

  // 每个 TREE PRD 必须出现在 TRACEABILITY，且其 TEST 链接有效。
  for (const [prd, row] of treePrds) {
    const traceRow = tracePrds.get(prd)
    if (!traceRow) {
      stats.missingPrds++
      fail('missing-in-traceability', traceFile, `${prd} 未出现在 TRACEABILITY.md`, { prd })
      continue
    }
    const testLinks = traceRow.links.filter((link) => /(?:^|\/)specs\/test\/([^/]+)\/test-plan\.md(?:#|$)/.test(link.target))
    if (testLinks.length === 0) {
      stats.badAnchors++
      fail('missing-test-anchor', traceFile, `TRACEABILITY.md 中 ${prd} 缺少 TEST 链接（行 ${traceRow.line}）`, { prd, source: 'TRACEABILITY' })
      continue
    }
    const productLinks = row.links.filter((link) => /(?:^|\/)specs\/product\/([^/]+)\/spec\.md(?:#|$)/.test(link.target))
    const expectedDomain = productLinks.length > 0 ? domainFromTarget(productLinks[0].target, 'product') : null
    for (const link of testLinks) {
      validateTestLink(traceFile, link, prd, expectedDomain, 'TRACEABILITY')
    }
  }

  // TRACEABILITY 中出现但 TREE 不存在的 PRD。
  for (const prd of tracePrds.keys()) {
    if (!treePrds.has(prd)) {
      stats.unknownPrds++
      fail('unknown-in-traceability', traceFile, `${prd} 出现在 TRACEABILITY.md，但 TREE.md 中没有`, { prd })
    }
  }

  // change 包：specs/changes/**/spec.md 的 Implements。
  const changeFiles = listFiles(join(root, 'specs/changes')).filter((file) => file.endsWith('/spec.md') || file.endsWith('\\spec.md'))
  stats.changePackages = changeFiles.length
  for (const file of changeFiles) {
    const text = readText(file)
    if (text === null) {
      stats.changeIssues++
      fail('missing-file', file, `change spec 不可读：${toRel(file)}`)
      continue
    }
    const { foundDirective, ids } = extractImplements(text)
    if (!foundDirective) {
      stats.changeIssues++
      fail('change-missing-implements', file, `${toRel(file)} 缺少 Implements: PRD-... 声明`)
      continue
    }
    if (ids.length === 0) {
      stats.changeIssues++
      fail('change-missing-prd', file, `${toRel(file)} 的 Implements 未列出任何 PRD`)
      continue
    }
    for (const prd of ids) {
      if (!treePrds.has(prd)) {
        stats.changeIssues++
        fail('change-unknown-prd', file, `${toRel(file)} 引用了 TREE 中不存在的 PRD：${prd}`, { prd })
      }
    }
  }

  // E2E 测试计划入口。
  const e2eReadme = join(root, 'specs/test/e2e/README.md')
  stats.e2eReadme = existsSync(e2eReadme) && statSync(e2eReadme).isFile()
  if (!stats.e2eReadme) {
    fail('missing-e2e-readme', 'specs/test/e2e/README.md', '缺少 specs/test/e2e/README.md')
  }

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
      warn('prd-without-change', '', `${unreferenced.length} 个 PRD 未被任何 change 包引用（仅提示）：${preview}${more}`)
    }
  }

  return report()
}

function report() {
  const ok = failures.length === 0
  const output = {
    ok,
    root,
    stats: { ...stats, failures: failures.length },
    failures,
    warnings,
  }
  if (asJson) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log('check-trace: PRD 追溯结构门禁')
    console.log(`  根目录：${root}`)
    console.log(`  PRD 总数：TREE ${stats.prdTotal}，TRACEABILITY 声明 ${stats.traceabilityTotal ?? 'N/A'}，TRACEABILITY 实际 ${stats.traceabilityPrds}`)
    console.log(`  缺失（TRACEABILITY 未收录）：${stats.missingPrds}`)
    console.log(`  坏 TEST 锚点：${stats.badAnchors}`)
    console.log(`  缺失 TEST 计划：${stats.missingTestPlans}`)
    console.log(`  非法 TEST 链接：${stats.invalidTestLinks}`)
    console.log(`  产品 spec PRD 声明：${stats.productSpecPrds}，产品 spec 问题：${stats.productSpecIssues}`)
    console.log(`  change 包：${stats.changePackages}，change 问题：${stats.changeIssues}`)
    console.log(`  E2E README：${stats.e2eReadme ? '存在' : '缺失'}`)
    console.log(`  失败项：${failures.length}，提示项：${warnings.length}`)
    if (failures.length > 0) {
      console.log('')
      console.log('失败明细：')
      for (const item of failures) {
        const where = item.file ? `${item.file}: ` : ''
        console.log(`  - [${item.kind}] ${where}${item.message}`)
      }
    }
    if (warnings.length > 0) {
      console.log('')
      console.log('提示：')
      for (const item of warnings) {
        const where = item.file ? `${item.file}: ` : ''
        console.log(`  - [${item.kind}] ${where}${item.message}`)
      }
    }
    console.log('')
    console.log(`RESULT: ${ok ? 'PASS' : 'FAIL'}`)
  }
  process.exit(ok ? 0 : 1)
}

main()
