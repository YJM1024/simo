// scripts/ac/lib/build-cache.mjs
//
// å¢žé‡æž„å»ºä¸Žå½±å“é¢é€‰è·‘ï¼ˆCHG-CONV-007 å·¥å…·æ”¹é€ ï¼‰ã€‚
//
// æž„å»ºï¼šåŽç«¯ exe åªåœ¨ backend/ ä¸‹æœ‰æ–‡ä»¶æ¯”äº§ç‰©æ–°æ—¶é‡å»ºï¼›å‰ç«¯ dist åªåœ¨ frontend/src
// æˆ– frontend/index.html æ¯” dist/assets/app.js æ–°æ—¶é‡å»ºã€‚ç”¨ä¿®æ”¹æ—¶é—´åˆ¤æ–­ï¼Œgo build è‡ªå·±çš„
// ç¼“å­˜å†å…œä¸€å±‚ï¼ˆæ²¡å˜æ—¶ go build æœ¬èº«ä¹Ÿåªåšé“¾æŽ¥ï¼Œä½†è¿™é‡Œè¿žè°ƒç”¨éƒ½çœæŽ‰ï¼‰ã€‚
//
// é€‰è·‘ï¼šimpact-map.json ç»™ã€Œæ”¹åŠ¨è·¯å¾„å‰ç¼€ â†’ è‡³å°‘é‡è·‘å“ªäº› ACã€çš„æ˜ å°„ï¼Œ--impact æŽ¥æ”¶
// æœ¬æ¬¡æ”¹åŠ¨çš„æ–‡ä»¶åˆ—è¡¨ï¼Œå–å¹¶é›†ã€‚æ˜ å°„æ²¡å‘½ä¸­æ—¶æŒ‰å…¨é‡å¤„ç†ï¼Œé¿å…æ¼è·‘ã€‚

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const BACKEND_EXE = path.join('.tmp', 'chg-007-T06', 'simo.exe')
const FRONTEND_MARK = path.join('frontend', 'dist', 'assets', 'app.js')

function newest(dir, filter = () => true) {
  let newestMs = 0
  let newestFile = ''
  const stack = [dir]
  while (stack.length > 0) {
    const current = stack.pop()
    let entries = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.tmp' || entry.name === 'dist') continue
        stack.push(full)
        continue
      }
      if (!filter(full)) continue
      let stat
      try { stat = fs.statSync(full) } catch { continue }
      if (stat.mtimeMs > newestMs) { newestMs = stat.mtimeMs; newestFile = full }
    }
  }
  return { newestMs, newestFile }
}

function mtime(file) {
  try { return fs.statSync(file).mtimeMs } catch { return 0 }
}

/**
 * åŽç«¯å¢žé‡æž„å»ºï¼šè¿”å›ž { rebuilt, reason, ms }ã€‚
 * åªæœ‰ backend/ é‡Œ .go/.mod/.sum æˆ–å†…åµŒå‰ç«¯äº§ç‰©æ¯” exe æ–°æ—¶æ‰è°ƒç”¨ go buildã€‚
 */
export function ensureBackendBuilt(root, { force = false } = {}) {
  const exe = path.join(root, BACKEND_EXE)
  const backend = path.join(root, 'backend')
  const exeMs = mtime(exe)
  const { newestMs, newestFile } = newest(backend, (file) => /\.(go|mod|sum)$/.test(file) || file.includes(`${path.sep}internal${path.sep}webui${path.sep}dist${path.sep}`))
  if (!force && exeMs > 0 && exeMs >= newestMs) {
    return { target: relativePath(root, exe), rebuilt: false, reason: `äº§ç‰©æ¯”æºç æ–°ï¼ˆæºç æœ€æ–° ${relativePath(root, newestFile)}ï¼‰`, ms: 0 }
  }
  if (exeMs === 0) {
    return { target: relativePath(root, exe), rebuilt: false, reason: 'ç¼ºå°‘ simo.exeï¼Œéœ€è¦å…ˆæž„å»ºï¼ˆæœ¬å·¥å…·ä¸ä»£å»ºï¼Œé¿å…æœªç»æ‰¹å‡†çš„æž„å»ºï¼‰', ms: 0, missing: true }
  }
  const go = goBin(root)
  const t0 = Date.now()
  const run = spawnSync(go, ['build', '-o', exe, './cmd/simo'], {
    cwd: backend,
    env: {
      ...process.env,
      ...goEnv(root),
    },
    windowsHide: true,
    stdio: 'ignore',
    timeout: 300000,
  })
  return {
    target: relativePath(root, exe),
    rebuilt: run.status === 0,
    reason: run.status === 0 ? `æºç æ›´æ–°ï¼ˆ${relativePath(root, newestFile)}ï¼‰ï¼Œå·²é‡å»º` : `go build å¤±è´¥ï¼Œé€€å‡ºç  ${run.status}ï¼›äº§ç‰©ä¿ç•™åŽŸæ ·`,
    ms: Date.now() - t0,
  }
}

/** å‰ç«¯å¢žé‡æž„å»ºï¼šdist/assets/app.js æ¯” frontend/src ä¸Ž index.html æ—§æ‰é‡å»ºã€‚ */
export function ensureFrontendBuilt(root) {
  const mark = path.join(root, FRONTEND_MARK)
  const src = path.join(root, 'frontend', 'src')
  const srcNewest = newest(src).newestMs
  const htmlMs = mtime(path.join(root, 'frontend', 'index.html'))
  const markMs = mtime(mark)
  const newestMs = Math.max(srcNewest, htmlMs)
  if (markMs > 0 && markMs >= newestMs) {
    return { target: 'frontend/dist/assets/app.js', rebuilt: false, reason: 'äº§ç‰©æ¯” frontend/src æ–°', ms: 0 }
  }
  const t0 = Date.now()
  const run = spawnSync(process.execPath, [path.join(root, 'frontend', 'build.mjs')], {
    cwd: path.join(root, 'frontend'),
    windowsHide: true,
    stdio: 'ignore',
    timeout: 300000,
  })
  return { target: 'frontend/dist/assets/app.js', rebuilt: run.status === 0, reason: run.status === 0 ? 'frontend/src æ›´æ–°ï¼Œå·²é‡å»º' : `å‰ç«¯æž„å»ºå¤±è´¥ï¼Œé€€å‡ºç  ${run.status}`, ms: Date.now() - t0 }
}

/**
 * æ—¶é—´ç±»åˆ¤æ®è¦çš„æµ‹è¯•æž„å»ºï¼š`-tags testclock` çš„ simoï¼Œä¸Žç”Ÿäº§ exe åˆ†å¼€å­˜æ”¾ï¼Œäº’ä¸è¦†ç›–ã€‚
 * å…±äº« harness èµ·ä¸€æ¡ä¸“ç”¨å®žä¾‹è·‘ AC-CONV-009-18 ä¸Ž AC-CHG-CONV-007-08ï¼Œ
 * çœæŽ‰æ¯æ¡è„šæœ¬è‡ªå·± go build ä¸€æ¬¡ï¼ˆçº¦ 25 ç§’ï¼‰å†æŠ¢ 8789 ä¸Ž backend.lockã€‚
 */
export const TESTCLOCK_EXE = path.join('.tmp', 'chg-007-harness', 'build', 'simo-testclock.exe')

export function ensureTestClockBuilt(root, { force = false } = {}) {
  const exe = path.join(root, TESTCLOCK_EXE)
  const backend = path.join(root, 'backend')
  const exeMs = mtime(exe)
  const { newestMs, newestFile } = newest(backend, (file) => /\.(go|mod|sum)$/.test(file) || file.includes(`${path.sep}internal${path.sep}webui${path.sep}dist${path.sep}`))
  if (!force && exeMs > 0 && exeMs >= newestMs) {
    return { target: relativePath(root, exe), rebuilt: false, reason: `æµ‹è¯•æž„å»ºäº§ç‰©æ¯”æºç æ–°ï¼ˆæºç æœ€æ–° ${relativePath(root, newestFile)}ï¼‰`, ms: 0 }
  }
  const go = goBin(root)
  const t0 = Date.now()
  fs.mkdirSync(path.dirname(exe), { recursive: true })
  const run = spawnSync(go, ['build', '-tags', 'testclock', '-o', exe, './cmd/simo'], {
    cwd: backend,
    env: {
      ...process.env,
      ...goEnv(root),
    },
    windowsHide: true,
    stdio: 'ignore',
    timeout: 300000,
  })
  return {
    target: relativePath(root, exe),
    rebuilt: run.status === 0,
    reason: run.status === 0 ? `testclock æµ‹è¯•æž„å»ºï¼ˆæºç æœ€æ–° ${relativePath(root, newestFile)}ï¼‰` : `testclock æž„å»ºå¤±è´¥ï¼Œé€€å‡ºç  ${run.status}`,
    ms: Date.now() - t0,
  }
}

/** 工具链里的 go 在 toolchain/go/bin/go.exe；配套环境见 toolchain/go.ps1（GOROOT/GOPATH/GOCACHE/镜像）。 */
function goBin(root) {
  return path.join(root, 'toolchain', 'go', 'bin', process.platform === 'win32' ? 'go.exe' : 'go')
}

function goEnv(root) {
  return {
    GOROOT: path.join(root, 'toolchain', 'go'),
    GOPATH: path.join(root, 'toolchain', 'gopath'),
    GOCACHE: path.join(root, 'toolchain', 'gocache'),
    GOFLAGS: '-mod=mod',
    GOPROXY: process.env.GOPROXY || 'https://goproxy.cn,direct',
    GOSUMDB: process.env.GOSUMDB || 'off',
    TMP: path.join(root, 'toolchain', 'tmp'),
    TEMP: path.join(root, 'toolchain', 'tmp'),
  }
}

function relativePath(root, file) {
  return path.relative(root, file).split('\\').join('/')
}

/**
 * å½±å“é¢é€‰è·‘ï¼šè¯» scripts/ac/impact-map.json çš„ rulesï¼ˆå‰ç¼€ â†’ AC åˆ—è¡¨ï¼‰ã€‚
 * æ”¹åŠ¨è·¯å¾„å‘½ä¸­ä»»ä¸€å‰ç¼€å³æŠŠè¯¥è¡Œ AC å¹¶å…¥ï¼›å¦æœ‰ä¸€æ¡ always è§„åˆ™ï¼ˆè„šæœ¬æˆ–å…¬å…±å±‚æ”¹åŠ¨æ—¶å…¨é‡ï¼‰ã€‚
 */
export function impactSelection(root, changed) {
  const mapPath = path.join(root, 'scripts', 'ac', 'impact-map.json')
  let map = null
  try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')) } catch { map = null }
  if (!map) return { scripts: [], notes: [`ç¼ºå°‘ ${relativePath(root, mapPath)}ï¼ŒæŒ‰å…¨é‡å¤„ç†`] }
  const picked = new Set()
  const notes = []
  for (const file of changed) {
    const normalized = file.split('\\').join('/')
    let hit = false
    for (const rule of map.rules ?? []) {
      const prefixes = Array.isArray(rule.paths) ? rule.paths : [rule.path]
      if (prefixes.some((prefix) => normalized.startsWith(prefix))) {
        for (const ac of rule.acs ?? []) picked.add(ac)
        hit = true
        notes.push(`${normalized} â†’ ${rule.id}`)
      }
    }
    if (!hit) notes.push(`${normalized} æœªå‘½ä¸­æ˜ å°„ï¼ŒæŒ‰å…¨é‡å¤„ç†`)
  }
  const unmatched = changed.some((file) => !(map.rules ?? []).some((rule) => {
    const prefixes = Array.isArray(rule.paths) ? rule.paths : [rule.path]
    return prefixes.some((prefix) => file.split('\\').join('/').startsWith(prefix))
  }))
  if (unmatched) return { scripts: (map.all ?? []).slice(), notes }
  return { scripts: [...picked].sort(), notes }
}

