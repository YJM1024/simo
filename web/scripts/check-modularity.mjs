#!/usr/bin/env node
// scripts/check-modularity.mjs —— 前端模块度检查（契约 §9.2 / §9.3）
//
// 规则（发现即失败，exit 1）：
//   1) features/<A> 不得 import features/<B>（A !== B）；唯一例外：chat→views（M41 内联卡片复用 ViewRenderer，显式白名单）
//   2) features 不得 import app/（壳层只被 registry 依赖，feature 只依赖 platform）；
//   3) feature 目录必须有 manifest.ts，且包含 id 与 slots（slot 名必须是约定的四个；M40 新增 mainView 页内视图）；
//   4) 每个 feature 必须在 features/registry.ts 中登记（否则是死代码）；
//   5) 代码（.ts/.tsx）里禁止硬编码颜色（hex / rgb / rgba）：颜色只能出现在
//      src/styles.css 的 token 定义里。
//
// 输出：通过则打印统计；失败则逐条列出并返回 1。

import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const srcRoot = resolve(here, '../src')
const featuresRoot = join(srcRoot, 'features')
/** M41：内联卡片必须复用 views/ViewRenderer；仅允许这一条跨 feature 依赖。 */
const SHARED_FEATURE_IMPORTS = new Set(['chat->views'])
const appRoot = join(srcRoot, 'app')

const SLOT_NAMES = new Set(['leftTree', 'center', 'rightPanel', 'mainView'])
const CODE_EXTENSIONS = new Set(['.ts', '.tsx'])

const IMPORT_RE = /(?:import\s+(?:[^'"]*?\s+from\s+)?|export\s+[^'"]*?\s+from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g

const violations = []
const warnings = []
let scannedFiles = 0
let importEdges = 0

function fail(message) {
  violations.push(message)
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      files.push(...(await walk(full)))
    } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
      files.push(full)
    }
  }
  return files
}

/** src/features/<id>/... → <id>；不在 feature 目录下返回 null。 */
function featureOf(filePath) {
  const rel = relative(featuresRoot, filePath)
  if (rel.startsWith('..') || rel.startsWith(sep)) return null
  const segments = rel.split(sep)
  return segments.length > 1 ? segments[0] : null
}

function within(target, root) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('sep'))
}

function stripExtension(filePath) {
  return filePath.replace(/\.(ts|tsx)$/, '')
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  return stripExtension(base)
}

function targetOf(base) {
  // 解析成已知文件之一（.ts/.tsx），否则按目录处理
  return { base }
}

function relLabel(filePath) {
  return relative(srcRoot, filePath).split(sep).join('/')
}

// ---------- 1) 扫描 import 与颜色 ----------
const allFiles = await walk(srcRoot)
const featureDirs = (
  await readdir(featuresRoot, { withFileTypes: true }).catch(() => [])
).filter((entry) => entry.isDirectory()).map((entry) => entry.name)

for (const file of allFiles) {
  scannedFiles += 1
  const source = await readFile(file, 'utf8')
  const owner = featureOf(file)

  // 颜色
  const colorMatches = [...source.matchAll(COLOR_RE)]
  if (colorMatches.length > 0) {
    fail(`${relLabel(file)} 出现硬编码颜色（${colorMatches[0][0]}）：颜色只允许出现在 src/styles.css 的 token 定义`)
  }

  // import
  const specs = [...source.matchAll(IMPORT_RE)].map((match) => match[1]).filter(Boolean)
  for (const spec of specs) {
    const base = resolveImport(file, spec)
    if (!base) continue
    importEdges += 1

    const targetFeature = featureOf(base)
    if (owner && targetFeature && targetFeature !== owner) {
      if (!SHARED_FEATURE_IMPORTS.has(`${owner}->${targetFeature}`)) {
        fail(`${relLabel(file)} 跨 feature import：features/${owner} → features/${targetFeature}（契约禁止）`)
      }
    }
    if (owner && within(base, appRoot)) {
      fail(`${relLabel(file)} 依赖壳层 app/：features/${owner} 只允许依赖 platform/`)
    }
    if (!owner && targetFeature && relLabel(file) === 'features/registry.ts') {
      // registry 组合 features 是允许的
    }
  }
}

// ---------- 2) manifest 检查 ----------
for (const id of featureDirs) {
  const manifestPath = join(featuresRoot, id, 'manifest.ts')
  let source
  try {
    source = await readFile(manifestPath, 'utf8')
  } catch {
    fail(`features/${id} 缺少 manifest.ts`)
    continue
  }
  if (!/export\s+const\s+manifest\b/.test(source)) fail(`features/${id}/manifest.ts 未导出 manifest`)
  if (!/\bid:\s*'[^']+'/.test(source)) fail(`features/${id}/manifest.ts 缺少 id`)
  const slotBlock = /slots:\s*\{([\s\S]*?)\}/.exec(source)
  if (!slotBlock) {
    fail(`features/${id}/manifest.ts 缺少 slots`)
    continue
  }
  const slotKeys = [...slotBlock[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((match) => match[1])
  if (slotKeys.length === 0) fail(`features/${id}/manifest.ts 的 slots 为空`)
  for (const key of slotKeys) {
    if (!SLOT_NAMES.has(key)) fail(`features/${id}/manifest.ts 声明了未知 slot "${key}"`)
  }
}

// ---------- 3) registry 登记检查 ----------
const registryPath = join(featuresRoot, 'registry.ts')
let registrySource = ''
try {
  registrySource = await readFile(registryPath, 'utf8')
} catch {
  fail('缺少 features/registry.ts（契约 §9.2）')
}

if (registrySource) {
  for (const id of featureDirs) {
    if (!registrySource.includes(`./${id}/manifest.ts`)) {
      fail(`features/${id} 未在 features/registry.ts 登记（死代码或被遗忘）`)
    }
  }
  const registered = [...registrySource.matchAll(/from\s+'\.\/([^/]+)\/manifest\.ts'/g)].map((match) => match[1])
  for (const id of registered) {
    if (!featureDirs.includes(id)) fail(`features/registry.ts 引用了不存在的 feature "${id}"`)
  }
}

// ---------- 输出 ----------
const featureList = featureDirs.length > 0 ? featureDirs.join(', ') : '（无）'
if (violations.length > 0) {
  console.error('✖ 模块度检查失败：')
  for (const item of violations) console.error(`  - ${item}`)
  if (warnings.length > 0) for (const item of warnings) console.warn(`  ! ${item}`)
  console.error(`\n扫描：${scannedFiles} 个文件，${importEdges} 条相对 import；features：${featureList}`)
  process.exit(1)
}

console.log('✔ 模块度检查通过')
console.log(`  features：${featureList}`)
console.log(`  扫描：${scannedFiles} 个 .ts/.tsx，${importEdges} 条相对 import`)
console.log('  规则：无跨 feature import / 无 feature→app / manifest 合法 / registry 已登记 / 无硬编码颜色')
