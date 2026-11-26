// scripts/ac/lib/batch-harness.mjs
//
// æ‰¹æ¬¡çº§å…±äº« harnessï¼ˆCHG-CONV-007 å·¥å…·æ”¹é€ ï¼‰ï¼š
//   ä¸€æ¬¡å¯åŠ¨åŽç«¯ä¸Žå‡ä¸Šæ¸¸ï¼Œæ•´æ‰¹è„šæœ¬å¤ç”¨åŒä¸€å®žä¾‹ï¼›æ¯ç»„ä¸€ä¸ªéš”ç¦» HOMEï¼ˆå„è‡ª simo.dbï¼‰ï¼Œ
//   ç»„é—´å¹¶è¡Œã€ç»„å†…ä¸²è¡Œï¼Œè„šæœ¬ç»“æŸæ—¶ç»Ÿä¸€åœæ­¢ã€‚
//
// ä¸Ž conv-backend.mjs çš„åˆ†å·¥ï¼šconv-backend ä»ä¿ç•™ã€Œè‡ªå·±èµ·ã€è‡ªå·±åœã€æŠ¢æ–‡ä»¶é”ã€çš„
// å•è„šæœ¬æ¨¡å¼ï¼ˆAC_CONV_SHARED æœªè®¾æ—¶èµ°åŽŸè·¯å¾„ï¼Œä½œä¸ºå›žé€€ä¸Žå¯¹ç…§ï¼‰ï¼›æœ¬æ¨¡å—åªåœ¨æ‰¹æ¬¡æ¨¡å¼ä¸‹
// ç”± run-ac.mjs è°ƒç”¨ï¼Œé€šè¿‡çŽ¯å¢ƒå˜é‡æŠŠ base-url ä¸Žéš”ç¦»åº“è·¯å¾„ä¸‹å‘ç»™å­è„šæœ¬ã€‚
//
// ç«¯å£åˆ†é…ï¼š8789/8792 ä¸¤ä¸ª mock åˆ†ç‰‡ï¼ˆbackend ç»„è½®è½¬åˆ†ç‰‡ï¼‰ã€8791 çœŸå®žæ¨¡å¼åˆ†ç‰‡
// ï¼ˆé… 8790 å‡ä¸Šæ¸¸ï¼‰ã€8787 é¡µé¢æœåŠ¡ï¼ˆUI ç»„ï¼Œsimo è‡ªå¸¦ SPA é™æ€é¡µï¼‰ã€‚

import fs from 'node:fs'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ensureTestClockBuilt, TESTCLOCK_EXE } from './build-cache.mjs'

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', '..', '..')
export const HARNESS_DIR = path.join(ROOT, '.tmp', 'chg-007-harness')
export const EXE = path.join(ROOT, '.tmp', 'chg-007-T06', 'simo.exe')
const MOCK_LLM = path.join(ROOT, 'scripts', 'ac', 'lib', 'mock-llm.mjs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ç«¯å£æ•´ä½“å¯å¹³ç§»ï¼šå¹¶è¡Œä¼šè¯å…±ç”¨ä¸€å°æœºå™¨æ—¶ï¼Œç”¨ AC_HARNESS_PORT_OFFSET=100 æŠŠ 8787/8789/8790/8791/8792
// æ•´ä½“æŒªåˆ° 8887/8889/8890/8891/8892ï¼Œé¿å…ä¸Žåˆ«çš„ä¼šè¯æŠ¢åŒä¸€ç«¯å£ã€‚
export const PORT_OFFSET = Number(process.env.AC_HARNESS_PORT_OFFSET ?? 0) || 0
const p = (base) => base + PORT_OFFSET

/** é¡µé¢å®žä¾‹çš„åº“å¿«ç…§ï¼šå¸¦ session 'main' ä¸Žç§å­ä»»åŠ¡ï¼ŒUI è„šæœ¬éœ€è¦å®ƒæ‰èƒ½æ¸²æŸ“å³æ ã€‚ */
export const UI_SNAPSHOT = path.join(HARNESS_DIR, 'snapshots', 'ui-main.db')
/** é¡µé¢é™æ€æœåŠ¡ï¼šT07 çš„ dist + /api åä»£ï¼Œæ¯” simo å†…åµŒ dist æ–°ï¼Œå³æ æ‰æ¸²æŸ“å¾—å‡ºæ¥ã€‚ */
export const PAGE_STATIC = path.join(ROOT, '.tmp', 'chg-007-T07', 'serve.mjs')

/** å®žä¾‹è§„æ ¼ï¼šgroups å†³å®šå“ªäº›è„šæœ¬è½åˆ°è¿™ä¸ªå®žä¾‹ä¸Šã€‚UI ç”¨ä¸‰æ¡æ³³é“ï¼Œæ¯æ¡æ³³é“ä¸€å¥—ã€Œé™æ€é¡µ + ç‹¬ç«‹åº“ã€ï¼Œ
 *  ç«¯å£ä¸åŒå³ origin ä¸åŒï¼ŒlocalStorage ä¸Ž simo.db éƒ½ä¸å…±äº«ï¼Œä¸‰æ¡æ³³é“æ‰èƒ½çœŸæ­£å¹¶è¡Œã€‚ */
export const SPECS = [
  { name: 'backend-a', port: p(8789), mode: 'mock', groups: ['backend'], shard: 0, shards: 2 },
  { name: 'backend-b', port: p(8792), mode: 'mock', groups: ['backend'], shard: 1, shards: 2 },
  { name: 'backend-tools', port: p(8791), mode: 'real', upstreamPort: p(8790), groups: ['backend-tools'] },
  // æ—¶é—´ç±»åˆ¤æ®ï¼ˆ30 åˆ†é’Ÿçª—å£ã€1 åˆ†é’Ÿæ—¶é™æé†’ï¼‰è¦ -tags testclock çš„æµ‹è¯•æž„å»ºä¸Ž SIMO_TEST_CLOCKï¼›
  // ç”Ÿäº§ exe ä¸å«è¿™æ®µä»£ç ï¼Œæ‰€ä»¥å•ç‹¬ä¸€æ¡å®žä¾‹ï¼Œä¸ä¸Ž backend ç»„å…±ç”¨ã€‚
  { name: 'backend-clock-a', port: p(8793), mode: 'mock', groups: ['backend-clock'], testClock: 'rate=200', testclock: true, shard: 0, shards: 2 },
  { name: 'backend-clock-b', port: p(8794), mode: 'mock', groups: ['backend-clock'], testClock: 'rate=200', testclock: true, shard: 1, shards: 2 },
  { name: 'page-api-1', port: p(8788), mode: 'mock', groups: ['ui'], lane: 1, seed: UI_SNAPSHOT },
  { name: 'page-api-2', port: p(8777), mode: 'mock', groups: ['ui'], lane: 2, seed: UI_SNAPSHOT },
  { name: 'page-api-3', port: p(8767), mode: 'mock', groups: ['ui'], lane: 3, seed: UI_SNAPSHOT },
  { name: 'page-1', port: p(8787), kind: 'static', groups: ['ui'], lane: 1, apiSpec: 'page-api-1' },
  { name: 'page-2', port: p(8776), kind: 'static', groups: ['ui'], lane: 2, apiSpec: 'page-api-2' },
  { name: 'page-3', port: p(8766), kind: 'static', groups: ['ui'], lane: 3, apiSpec: 'page-api-3' },
]
export const UI_LANES = 3

export function specForGroup(group, index = 0) {
  const candidates = SPECS.filter((s) => s.groups.includes(group) && s.kind !== 'static' && s.groups.includes(group))
  if (candidates.length === 0) return null
  if (group === 'backend') {
    const lanes = candidates.filter((s) => s.shard !== undefined)
    return lanes[index % lanes.length]
  }
  if (group === 'ui') {
    // UI è¦ç»™åˆ°é™æ€é¡µé‚£æ¡è§„æ ¼ï¼ˆè„šæœ¬è¿žçš„æ˜¯é¡µé¢ç«¯å£ï¼‰ï¼Œåº“åœ¨å…¶ apiSpec åŽé¢ã€‚
    const pages = SPECS.filter((s) => s.kind === 'static' && s.groups.includes('ui'))
    return pages[index % pages.length]
  }
  return candidates[0]
}

async function health(base, timeoutMs = 700) {
  try {
    const res = await fetch(base + '/api/health', { signal: AbortSignal.timeout(timeoutMs) })
    return res.status
  } catch {
    return 0
  }
}

async function waitHealth(port, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if ((await health(`http://127.0.0.1:${port}`)) === 200) return 0
    await sleep(60)
  }
  return -1
}

/** ä¸Šæ¬¡æ®‹ç•™ï¼šåŒ HOME çš„ pid æ–‡ä»¶é‡Œ pid ä»å­˜æ´»ï¼Œä¸”è¯¥ pid ç¡®å®žæ˜¯æˆ‘ä»¬åœ¨è·‘çš„æœåŠ¡ï¼Œå°±åœæŽ‰ã€‚ */
function killLeftover(spec, home) {
  const pidFile = path.join(home, 'harness.pid')
  if (!fs.existsSync(pidFile)) return null
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim()) || 0
  if (!pid) return null
  let alive = false
  try { process.kill(pid, 0); alive = true } catch { alive = false }
  if (!alive) { removePidFile(pidFile); return null }
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  return pid
}

function removePidFile(file) {
  const trash = process.env.SIMO_TRASH || 'E:\\dsh_home\\trash\\pending-delete'
  try {
    const dir = path.join(trash, 'ac-harness')
    fs.mkdirSync(dir, { recursive: true })
    fs.renameSync(file, path.join(dir, `harness.pid.${Date.now()}`))
  } catch { /* ä¿ç•™åŽŸæ–‡ä»¶ä¸å½±å“åˆ¤å®š */ }
}

function writeRealConfig(home, upstreamPort) {
  fs.writeFileSync(path.join(home, 'config.local.json'), JSON.stringify({
    modelMode: 'real',
    baseURL: `http://127.0.0.1:${upstreamPort}/v1`,
    apiKey: 'mock-key-ac',
    model: 'mock',
  }, null, 2))
}

async function startUpstream(spec, logDir) {
  const log = path.join(logDir, `${spec.name}-upstream.log`)
  const fd = fs.openSync(log, 'a')
  const child = spawn(process.execPath, [MOCK_LLM, '--port', String(spec.upstreamPort), '--mode', 'tools'], {
    cwd: ROOT, env: { ...process.env }, stdio: ['ignore', fd, fd], windowsHide: true,
  })
  child.once('error', () => {})
  fs.closeSync(fd)
  const end = Date.now() + 15000
  while (Date.now() < end) {
    try {
      const res = await fetch(`http://127.0.0.1:${spec.upstreamPort}/health`, { signal: AbortSignal.timeout(1000) })
      if (res.status === 200) return { child, log }
    } catch { /* æœªå°±ç»ª */ }
    if (child.exitCode !== null) break
    await sleep(100)
  }
  await stopChild(child)
  throw new Error(`å‡ä¸Šæ¸¸ :${spec.upstreamPort} æœªå°±ç»ªï¼Œæ—¥å¿—è§ ${path.relative(ROOT, log)}`)
}

export async function stopChild(child, { graceMs = 5000 } = {}) {
  if (!child || child.exitCode !== null) return 0
  const t0 = Date.now()
  try { child.kill() } catch { /* ignore */ }
  while (Date.now() - t0 < graceMs && child.exitCode === null) await sleep(50)
  if (child.exitCode === null) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    const end = Date.now() + 4000
    while (Date.now() < end && child.exitCode === null) await sleep(50)
  }
  return Date.now() - t0
}

/** ç«¯å£è¢«ä¸Šæ¬¡é—ç•™çš„è¿›ç¨‹å ç€ï¼šæŒ‰ netstat æ‰¾åˆ° listening çš„ pidï¼Œé€ä¸ª taskkillï¼›å ä¸åŠ¨å°±æŠ›ã€‚ */
function killPortOwner(port) {
  const out = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true }).stdout || ''
  const pids = new Set()
  for (const line of out.split('\n')) {
    if (!line.includes(`:${port} `)) continue
    if (!/LISTENING/i.test(line)) continue
    const cols = line.trim().split(/\s+/)
    const pid = Number(cols[cols.length - 1])
    if (pid && pid !== 4 && pid !== process.pid) pids.add(pid)
  }
  for (const pid of pids) {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  }
  return [...pids]
}

export async function startInstance(spec, runDir, instances = new Map()) {
  const home = path.join(runDir, spec.name)
  fs.mkdirSync(home, { recursive: true })
  killLeftover(spec, home)
  if ((await health(`http://127.0.0.1:${spec.port}`)) === 200) {
    // ä¸Šæ¬¡è¢« SIGKILL çš„å®žä¾‹å¯èƒ½æ²¡é€€å¹²å‡€ï¼šå…ˆæŒ‰ç«¯å£æ¸…æ®‹ç•™ï¼Œå†å¤æ£€ï¼Œä»è¢«å æ‰ç®—çœŸå†²çªã€‚
    const killed = killPortOwner(spec.port)
    if (killed.length > 0) await sleep(300)
    if ((await health(`http://127.0.0.1:${spec.port}`)) === 200) {
      throw new Error(`ç«¯å£ ${spec.port} å·²è¢«å…¶å®ƒå®žä¾‹å ç”¨ï¼ˆä¸æ˜¯æœ¬ harness å¯åŠ¨çš„ï¼‰ï¼Œæ‹’ç»å¤ç”¨`)
    }
  }
  if (spec.kind === 'static') {
    const api = instances.get(spec.apiSpec)
    if (!api) throw new Error(`é¡µé¢å®žä¾‹ä¾èµ– ${spec.apiSpec}ï¼Œä½†å®ƒæ²¡æœ‰å¯åŠ¨`)
    const log = path.join(runDir, `${spec.name}.log`)
    const fd = fs.openSync(log, 'a')
    const child = spawn(process.execPath, [PAGE_STATIC], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(spec.port), API_PORT: String(api.port) },
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    })
    child.once('error', () => {})
    fs.closeSync(fd)
    fs.writeFileSync(path.join(home, 'harness.pid'), String(child.pid))
    const end = Date.now() + 15000
    let ok = false
    while (Date.now() < end) {
      try {
        const r = await fetch(`http://127.0.0.1:${spec.port}/`, { signal: AbortSignal.timeout(700) })
        if (r.status === 200) { ok = true; break }
      } catch { /* æœªå°±ç»ª */ }
      await sleep(60)
    }
    if (!ok) { await stopChild(child); throw new Error(`é¡µé¢æœåŠ¡ :${spec.port} æœªå°±ç»ª`) }
    return { spec, home, port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}`, child, upstream: null, log, startedAt: Date.now() }
  }
  if (!fs.existsSync(EXE)) throw new Error(`ç¼ºå°‘åŽç«¯æž„å»ºäº§ç‰© ${path.relative(ROOT, EXE)}ï¼›å…ˆè·‘ node scripts/run-ac.mjs --build`)
  // æ—¶é—´ç±»å®žä¾‹ç”¨ testclock æµ‹è¯•æž„å»ºï¼ˆä¸Žç”Ÿäº§ exe åˆ†å¼€å­˜æ”¾ï¼‰ï¼Œé¦–æ¬¡å¯åŠ¨æ—¶æŒ‰ä¿®æ”¹æ—¶é—´å¢žé‡æž„å»ºã€‚
  let exe = EXE
  if (spec.testclock) {
    const built = ensureTestClockBuilt(ROOT)
    if (!built.rebuilt && built.ms === 0 && !fs.existsSync(path.join(ROOT, TESTCLOCK_EXE))) {
      throw new Error(`ç¼ºå°‘ testclock æµ‹è¯•æž„å»ºä¸”æž„å»ºå¤±è´¥ï¼š${built.reason}`)
    }
    exe = path.join(ROOT, TESTCLOCK_EXE)
  }
  // åº“å¿«ç…§å¤ç”¨ï¼šé¡µé¢å®žä¾‹ç›´æŽ¥æ¢å¤åˆ°é¢„ç½®åº“ï¼ˆsession 'main' + ç§å­ä»»åŠ¡ï¼‰ï¼ŒçœæŽ‰æ¯è½®é‡æ–°é€ æ•°æ®ã€‚
  if (spec.seed) {
    if (!fs.existsSync(spec.seed)) throw new Error(`ç¼ºå°‘åº“å¿«ç…§ ${path.relative(ROOT, spec.seed)}`)
    fs.copyFileSync(spec.seed, path.join(home, 'simo.db'))
  }
  if (spec.mode === 'real') writeRealConfig(home, spec.upstreamPort)
  let upstream = null
  if (spec.upstreamPort) upstream = await startUpstream(spec, runDir)
  const log = path.join(runDir, `${spec.name}.log`)
  const fd = fs.openSync(log, 'a')
  const child = spawn(exe, ['serve', '-addr', `127.0.0.1:${spec.port}`, '-model', spec.mode], {
    cwd: home,
    env: {
      ...process.env, SIMO_HOME: home, SIMO_LLM: spec.mode, SIMO_ADDR: `127.0.0.1:${spec.port}`,
      ...(spec.testClock ? { SIMO_TEST_CLOCK: spec.testClock } : {}),
    },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  child.once('error', () => {})
  fs.closeSync(fd)
  fs.writeFileSync(path.join(home, 'harness.pid'), String(child.pid))
  const readyMs = await waitHealth(spec.port)
  if (readyMs < 0) {
    const tail = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-800) : ''
    await stopChild(child)
    if (upstream) await stopChild(upstream.child)
    throw new Error(`${spec.name} :${spec.port} æœªå°±ç»ªï¼›æ—¥å¿—å°¾éƒ¨ ${tail.replace(/\s+/g, ' ').slice(-400)}`)
  }
  return { spec, home, port: spec.port, baseUrl: `http://127.0.0.1:${spec.port}`, child, upstream, log, startedAt: Date.now() }
}

/**
 * èµ·æ•´æ‰¹å®žä¾‹ã€‚è¿”å›ž { runId, runDir, instances: Map<name, handle>, envFor(group, index) }ã€‚
 * åªèµ·æœ¬æ‰¹å®žé™…ç”¨åˆ°çš„ç»„ï¼Œé¿å…ç©ºè·‘å®žä¾‹æ‹–æ…¢æ”¶å°¾ã€‚
 */
export async function startBatch(groups, { runId } = {}) {
  const id = runId || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const runDir = path.join(HARNESS_DIR, 'runs', id)
  fs.mkdirSync(runDir, { recursive: true })
  const wanted = new Set()
  for (const group of groups) {
    for (const spec of SPECS.filter((s) => s.groups.includes(group))) wanted.add(spec.name)
  }
  // é™æ€é¡µé¢ä¾èµ–å®ƒåä»£çš„åŽç«¯å®žä¾‹ï¼Œä¸€å¹¶èµ·ã€‚
  for (const name of [...wanted]) {
    const spec = SPECS.find((s) => s.name === name)
    if (spec?.apiSpec) wanted.add(spec.apiSpec)
  }
  const instances = new Map()
  const started = []
  try {
    // å…ˆèµ·åŽç«¯åˆ†ç‰‡ï¼Œå†èµ·é¡µé¢æœåŠ¡ï¼šUI è„šæœ¬ä¾èµ–é¡µé¢æœåŠ¡ï¼Œå¤±è´¥æ—¶èƒ½æ›´å¿«æš´éœ²ã€‚
    for (const spec of SPECS.filter((s) => wanted.has(s.name))) {
      const handle = await startInstance(spec, runDir, instances)
      instances.set(spec.name, handle)
      started.push(handle)
    }
  } catch (err) {
    await stopBatch(started)
    throw err
  }
  return {
    runId: id,
    runDir,
    instances,
    envFor(group, index = 0) {
      const spec = specForGroup(group, index)
      const handle = spec && instances.get(spec.name)
      if (!handle) return {}
      if (group === 'ui') {
        return {
          AC_UI_SHARED: '1',
          AC_UI_BASE: handle.baseUrl,
          AC_UI_NEW_TARGET: '1',
          // UI 脚本连 Chrome 调试端口；共享批必须显式下发，否则脚本会回落到默认 9223/8787。
          AC_CDP_PORT: process.env.AC_CDP_PORT || '9223',
        }
      }
      return { AC_CONV_SHARED: '1', AC_CONV_BASE: handle.baseUrl, AC_CONV_HOME: handle.home }
    },
  }
}

export async function stopBatch(handles) {
  // äº”ä¸ªå®žä¾‹å¹¶è¡Œåœï¼šä¸²è¡Œç­‰ 5s å®½é™ + taskkill ä¼šè®©æ”¶å°¾å˜æˆ 45s é‡çº§çš„å›ºå®šæˆæœ¬ã€‚
  const details = await Promise.all(handles.filter(Boolean).map(async (handle) => {
    const ms = await stopChild(handle.child, { graceMs: 2500 })
    if (handle.upstream) await stopChild(handle.upstream.child, { graceMs: 1500 })
    try { fs.rmSync(path.join(handle.home, 'harness.pid'), { force: true }) } catch { /* ignore */ }
    return { instance: handle.spec.name, port: handle.port, stopMs: ms }
  }))
  return details
}

export { health, sleep }

