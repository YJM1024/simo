#!/usr/bin/env node
/**
 * run-ac.mjsï¼šAC æ–­è¨€æ±‡æ€» runnerï¼ˆé›¶ä¾èµ–ï¼Œåªè¯»ä»“åº“å†…å®¹ï¼‰
 *
 * scripts/ac ä¸‹æ¯ä¸ª .mjs æ˜¯ä¸€ä¸ª AC æ–­è¨€è„šæœ¬ï¼Œè„šæœ¬æŠŠç»“æžœä»¥ä¸€è¡Œ JSON å†™åˆ° stdoutï¼Œ
 * é€€å‡ºç  0 è¡¨ç¤ºé€šè¿‡ã€1 è¡¨ç¤ºå¤±è´¥ã€2 è¡¨ç¤ºå‚æ•°æˆ–çŽ¯å¢ƒé”™è¯¯ã€‚runner è´Ÿè´£åˆ†ç»„ã€å¹¶å‘ã€
 * è¶…æ—¶ã€è¯æ®è½ç›˜ä¸Žæ±‡æ€»ã€‚
 *
 * 两种执行模式：
 *   - 共享模式（默认）：先起本批要用的后端分片与页面服务（见 scripts/ac/lib/batch-harness.mjs），组间并行；
 *     每组按 GROUP_CONCURRENCY 开槽位，槽位环境经 batch.envFor(group, lane) 下发（独立端口、独立库、独立实例锁）。
 *     并发上限：ui 3 条泳道；cdp 4 条泳道（后端 8931-8934、假上游 8941-8944、Chrome 调试 9280-9283）；其余组单槽。
 *   - 单脚本模式（--legacy）：保持原行为，每条脚本自己起后端、自己停、抢 8789 的文件锁。对照基线用这个模式，回退也用它。
 *
 * 分组：scripts/ac/groups.json 显式列出 AC → backend / backend-tools / backend-clock / ui / cdp；
 * 未登记脚本按单脚本模式执行（AC-SYNC-* 自管 CDP，不受共享 harness 影响）。
 * è¶…æ—¶ï¼šå•æ¡è„šæœ¬ 120 ç§’ï¼Œè¶…æ—¶åˆ¤ timeout å¹¶ç»ˆæ­¢å­è¿›ç¨‹ã€‚
 * è¯æ®ï¼šæ¯æ¡è„šæœ¬å†™ .tmp/ac/<AC-ID>.jsonï¼ˆå«å‘½ä»¤ã€å‚æ•°ã€æ—¶é—´ã€è€—æ—¶ã€é€€å‡ºç ã€stdout çš„ JSON è¡Œï¼‰ï¼›
 * è„šæœ¬è‡ªå·±å†™çš„è¯æ®å…ˆè¢«å¤åˆ¶åˆ° .tmp/ac-tooling/script-evidence/<AC-ID>.json å†è¦†ç›–ï¼Œæ–­è¨€æ¡æ•°ä»Žå®ƒè¯»ã€‚
 *
 * æ²™ç®±è¯´æ˜Žï¼šæœ¬æœºå—é™ä¼šè¯ç¦æ­¢å­è¿›ç¨‹ä½¿ç”¨ç®¡é“ï¼Œæ‰€ä»¥å­è¿›ç¨‹çš„ stdout ä¸Ž stderr é‡å®šå‘
 * åˆ° .tmp/ac-tooling/runner-io ä¸‹çš„ä¸´æ—¶æ–‡ä»¶ï¼Œé€€å‡ºåŽè¯»å›žã€‚è¯¥åšæ³•åœ¨æ™®é€šçŽ¯å¢ƒåŒæ ·å¯ç”¨ã€‚
 *
 * ç”¨æ³•ï¼š
 *   node scripts/run-ac.mjs --only AC-CONV-009-04,AC-CONV-009-05
 *   node scripts/run-ac.mjs --only AC-TASK-          # 以 - 结尾的模式按前缀选中 30 条
 *   node scripts/run-ac.mjs --only ... --legacy       # æ”¹é€ å‰è¡Œä¸ºï¼ˆå¯¹ç…§åŸºçº¿ï¼‰
 *   node scripts/run-ac.mjs --only ... --build        # åªåœ¨æºç æ¯”äº§ç‰©æ–°æ—¶é‡å»º
 *   node scripts/run-ac.mjs --impact backend/internal/modules/chat/x.go,frontend/src/App.tsx
 *   node scripts/run-ac.mjs --json
 *   node scripts/run-ac.mjs --self-test
 *
 * æ±‡æ€»è¡¨åˆ—å‡º ACã€ç»“æžœã€è€—æ—¶ã€è¯æ®è·¯å¾„ã€‚--json è¾“å‡º countsã€results ä¸Ž timingsã€‚
 * æœ‰ failã€timeout æˆ– error æ—¶é€€å‡ºç ä¸º 1ï¼Œå…¨éƒ¨é€šè¿‡ä¸º 0ï¼Œå‚æ•°é”™è¯¯ä¸º 2ã€‚
 */

import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { startBatch, stopBatch, CDP_LANES } from './ac/lib/batch-harness.mjs'
import { ensureBackendBuilt, ensureFrontendBuilt, impactSelection } from './ac/lib/build-cache.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(SCRIPT_DIR, '..')
const FIXTURE_DIR = join(DEFAULT_ROOT, '.tmp', 'ac-tooling', 'fixtures', 'runner')
const DEFAULT_TIMEOUT_MS = 120_000
const CONCURRENCY = 4
/**
 * 按组并发槽位表。
 *   ui            3 条页面泳道（页面端口 8787/8776/8766，各槽独立库）
 *   cdp           4 条自起后端泳道（后端 8931-8934、假上游 8941-8944、Chrome 调试 9280-9283）
 *   backend       1（按 2 片轮转，两个 mock 分片 8789/8792）
 *   backend-tools 1（8791，配 8790 假上游）
 *   backend-clock 1（按 2 片轮转，testclock 构建 8793/8794）
 */
const GROUP_CONCURRENCY = { ui: 3, cdp: CDP_LANES, backend: 1, 'backend-tools': 1, 'backend-clock': 1 }
const IO_DIR = join('.tmp', 'ac-tooling', 'runner-io')
const GROUPS = new Set(['cdp', 'http', 'unit'])
const SHARED_GROUPS = new Set(['backend', 'backend-tools', 'backend-clock', 'ui'])
/** 组内可切两片并行（共享库的写操作按脚本互不相干；backend-clock 两条各等 30 秒真实周期，切片省一半）。 */
const SHARDED_GROUPS = new Set(['backend', 'backend-clock'])
/** 不共享 harness 实例、但按槽位下发隔离环境的组：cdp 每条泳道自起后端与浏览器，槽位内串行。 */
const LANE_GROUPS = new Set(['cdp'])

/** è¯»å– scripts/ac/groups.jsonï¼šAC â†’ å…±äº«ç»„åã€‚æ²¡æœ‰è¯¥æ–‡ä»¶æ—¶å…¨éƒ¨å›žè½åˆ°å•è„šæœ¬æ¨¡å¼ã€‚ */
function readGroupMap(root) {
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'scripts', 'ac', 'groups.json'), 'utf8'))
    const map = {}
    for (const [group, list] of Object.entries(parsed?.groups ?? {})) {
      for (const ac of list) map[ac] = group
    }
    return map
  } catch {
    return {}
  }
}

/** è¯»å– scripts/ac ä¸‹çš„è„šæœ¬ä¸Žåˆ†ç»„ï¼Œè¿”å›žå¸¦åˆ†ç»„ä¿¡æ¯çš„æ¡ç›®ã€‚ */
function discoverScripts(root) {
  const acDir = join(root, 'scripts', 'ac')
  let names = []
  try {
    names = readdirSync(acDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
      .map((entry) => entry.name)
      .sort()
  } catch {
    return []
  }

  const central = readManifest(join(acDir, 'manifest.json'))
  const groupMap = readGroupMap(root)
  return names.map((name, index) => {
    const ac = name.slice(0, -4)
    const file = join(acDir, name)
    const sidecar = readManifest(join(acDir, `${ac}.json`))
    const shared = groupMap[ac]
    const group = shared ?? pickGroup(ac, central, sidecar)
    return { ac, file, group, shared: Boolean(shared), index }
  })
}

function readManifest(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** æ¸…å•æ”¯æŒä¸‰ç§å†™æ³•ï¼šAC ç›´æŽ¥æ˜ å°„ç»„åã€scripts æ˜ å°„å¯¹è±¡ã€ç»„åæ˜ å°„ AC æ•°ç»„ã€‚ */
function pickGroup(ac, central, sidecar) {
  const candidates = [sidecar.group, central[ac], central.scripts?.[ac]?.group]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && (GROUPS.has(candidate) || SHARED_GROUPS.has(candidate))) return candidate
  }
  for (const group of GROUPS) {
    const list = central[group]
    if (Array.isArray(list) && list.includes(ac)) return group
  }
  if (/cdp/i.test(ac)) return 'cdp'
  if (/http/i.test(ac)) return 'http'
  if (/unit/i.test(ac)) return 'unit'
  return 'http'
}

/** è·‘ä¸€æ¡è„šæœ¬ï¼Œè¿”å›žç»“æžœå¯¹è±¡ï¼›stdout ä¸Ž stderr ç»ä¸´æ—¶æ–‡ä»¶å›žè¯»ï¼Œè¶…æ—¶åˆ™ç»ˆæ­¢è¿›ç¨‹ã€‚ */
function runOne(root, entry, options) {
  const startedAt = new Date().toISOString()
  const started = Date.now()
  const ioDir = join(root, IO_DIR)
  mkdirSync(ioDir, { recursive: true })
  const safe = entry.ac.replace(/[^A-Za-z0-9_.-]/g, '_')
  const stdoutPath = join(ioDir, `${safe}.${process.pid}.${entry.index}.out`)
  const stderrPath = join(ioDir, `${safe}.${process.pid}.${entry.index}.err`)
  const stdoutFd = openSync(stdoutPath, 'w')
  const stderrFd = openSync(stderrPath, 'w')
  const args = [entry.file]
  if (options.baseUrl) args.push('--base-url', options.baseUrl)
  const env = { ...process.env, ...(entry.env ?? {}) }
  if (options.failFast) env.AC_FAIL_FAST = '1'
  // 记录脚本运行前的证据 mtime，用来识别“本轮没有重写证据”的旧文件。
  const evidenceProbe = join(root, '.tmp', 'ac', `${entry.ac}.json`)
  const evidenceMtimeBefore = fileMtimeMs(evidenceProbe)

  return new Promise((resolveResult) => {
    let settled = false
    let timedOut = false
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs)

    const finish = (code, signal, spawnError) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      let stdout = ''
      let stderr = ''
      try {
        stdout = readFileSync(stdoutPath, 'utf8')
        stderr = readFileSync(stderrPath, 'utf8')
      } catch {
        stdout = ''
        stderr = ''
      }
      try {
        closeSync(stdoutFd)
        closeSync(stderrFd)
      } catch {
        // æ–‡ä»¶æè¿°ç¬¦å·²å…³é—­æ—¶å¿½ç•¥ï¼Œç»“æžœç…§å¸¸è¿”å›žã€‚
      }

      const jsonLines = parseJsonLines(stdout)
      const skipped = /^SKIP\b/m.test(stdout)
      let result = 'pass'
      if (timedOut) result = 'timeout'
      else if (spawnError) result = 'error'
      else if (code !== 0) result = 'fail'
      // 退出码 0 且输出 SKIP 的脚本是跳过，不是通过；必须在判定阶段就分开。
      else if (skipped) result = 'skip'

      const detail =
        jsonLines.find((item) => typeof item?.detail === 'string')?.detail ??
        (spawnError ? spawnError.message : '')
      const finishedAt = new Date().toISOString()
      const evidenceRelative = join('.tmp', 'ac', `${entry.ac}.json`).split('\\').join('/')
      const evidenceAbsolute = join(root, evidenceRelative)
      const scriptEvidence = preserveScriptEvidence(root, entry.ac, evidenceMtimeBefore)
      const record = {
        ac: entry.ac,
        group: entry.group,
        result,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - started,
        startedAt,
        finishedAt,
        baseUrl: options.baseUrl ?? entry.baseUrl ?? null,
        shared: Boolean(entry.env?.AC_CONV_SHARED || entry.env?.AC_UI_SHARED),
        script: relative(root, entry.file).split('\\').join('/'),
        command: process.execPath,
        args,
        detail,
        assertions: scriptEvidence ? countAssertions(scriptEvidence) : null,
        skipped,
        jsonLines,
      }
      writeEvidence(evidenceAbsolute, record, stdout, stderr)
      resolveResult({ ...record, evidence: evidenceRelative })
    }

    child.on('error', (error) => finish(null, null, error))
    child.on('close', (code, signal) => finish(code, signal))
  })
}

/**
 * è„šæœ¬è‡ªå·±å†™çš„è¯æ®åœ¨ .tmp/ac/<AC>.jsonï¼›runner è¦†ç›–å‰å…ˆå¤åˆ¶ä¸€ä»½åˆ°
 * .tmp/ac-tooling/script-evidence/ï¼Œç”¨äºŽæ ¸å¯¹æ–­è¨€æ¡æ•°ï¼ˆæœ¬æ”¹é€ è¦æ±‚å‰åŽä¸€è‡´ï¼‰ã€‚
 */
function fileMtimeMs(path) {
  try { return statSync(path).mtimeMs } catch { return 0 }
}

function preserveScriptEvidence(root, ac, mtimeBefore = 0) {
  const source = join(root, '.tmp', 'ac', `${ac}.json`)
  if (!existsSync(source)) return null
  // 只接受本轮重写过的证据文件；0 断言 skip 不能沿用上一轮留下的断言数。
  if (fileMtimeMs(source) <= mtimeBefore) return null
  const dir = join(root, '.tmp', 'ac-tooling', 'script-evidence')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `${ac}.json`)
  try { copyFileSync(source, dest) } catch { return null }
  return dest
}

function countAssertions(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (Array.isArray(parsed?.checks)) return parsed.checks.length
    if (parsed?.checks && typeof parsed.checks === 'object') return Object.keys(parsed.checks).length
  } catch {
    return null
  }
  return null
}

function parseJsonLines(stdout) {
  const parsed = []
  for (const line of stdout.split(/\r?\n/)) {
    const text = line.trim()
    if (!text.startsWith('{')) continue
    try {
      parsed.push(JSON.parse(text))
    } catch {
      // éž JSON è¡Œå¿½ç•¥ï¼Œè„šæœ¬å…è®¸åœ¨ JSON ä¹‹å¤–å†™è°ƒè¯•ä¿¡æ¯ã€‚
    }
  }
  return parsed
}

/** è¯æ®æŽ§åˆ¶åœ¨ 8KB ä»¥å†…ï¼Œè¶…å‡ºæ—¶æˆªæ–­åŽŸå§‹è¾“å‡ºå¹¶ä¿ç•™ JSON è¡Œã€‚ */
function writeEvidence(path, record, stdout, stderr) {
  const payload = {
    ...record,
    stdout: stdout.slice(0, 4000),
    stderr: stderr.slice(0, 2000),
    outputTruncated: stdout.length > 4000 || stderr.length > 2000,
  }
  let text = JSON.stringify(payload, null, 2)
  if (text.length > 8192) {
    payload.stdout = payload.stdout.slice(0, 1500)
    payload.stderr = payload.stderr.slice(0, 800)
    payload.outputTruncated = true
    text = JSON.stringify(payload, null, 2)
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

/** å•è„šæœ¬æ¨¡å¼ï¼šcdp ç»„é€æ¡æ‰§è¡Œï¼Œå…¶ä½™ç»„ç”¨ 4 ä¸ª worker å¹¶è¡Œï¼Œç»“æžœæŒ‰å‘çŽ°é¡ºåºå›žæŽ’ã€‚ */
async function runAll(root, entries, options) {
  const results = []
  const cdp = entries.filter((entry) => entry.group === 'cdp')
  const rest = entries.filter((entry) => entry.group !== 'cdp')

  for (const entry of cdp) {
    results.push(await runOne(root, entry, options))
  }

  const queue = [...rest]
  const workerCount = Math.min(CONCURRENCY, queue.length)
  const workers = []
  for (let worker = 0; worker < workerCount; worker += 1) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const entry = queue.shift()
          if (!entry) return
          results.push(await runOne(root, entry, options))
        }
      })(),
    )
  }
  await Promise.all(workers)
  sortResults(results, entries)
  return results
}

/**
 * å…±äº«æ¨¡å¼ï¼šå…ˆèµ·å®žä¾‹ï¼Œå†æŒ‰ç»„å¹¶è¡Œã€‚
 *   - backendï¼šä¸¤ä¸ª mock åˆ†ç‰‡è½®è½¬ï¼Œå„ 1 æ¡ä¸²è¡Œï¼ˆæ¯ç‰‡ç‹¬ç«‹ HOME ä¸Ž simo.dbï¼Œäº’ä¸å…±äº«çŠ¶æ€ï¼‰ï¼›
 *   - backend-toolsï¼šçœŸå®žæ¨¡å¼åˆ†ç‰‡ 1 æ¡ä¸²è¡Œï¼ˆé… 8790 å‡ä¸Šæ¸¸ï¼‰ï¼›
 *   - uiï¼šåŒä¸€ Chrome é‡Œæ¯æ¡è„šæœ¬ä¸€ä¸ªæ ‡ç­¾é¡µï¼Œ3 æ¡å¹¶è¡Œï¼›
 *   - cdp/å…¶å®ƒæœªç™»è®°è„šæœ¬ï¼šèµ°å•è„šæœ¬æ¨¡å¼ä¸²è¡Œï¼ˆè‡ªèµ·è‡ªåœï¼‰ã€‚
 */
/** 上次一条脚本的实际耗时（毫秒），用于泳道负载均衡；没有证据（或证据正被占用）时按 0 返回，由调用方估算。 */
function lastDurationMs(root, ac) {
  const file = join(root, '.tmp', 'ac', `${ac}.json`)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const record = JSON.parse(readFileSync(file, 'utf8'))
      const value = Number(record?.durationMs)
      if (Number.isFinite(value) && value > 0) return value
      return 0
    } catch {
      // 上一轮刚写完时可能短暂读不到（句柄/扫描占用），重试一次再放弃。
      if (attempt === 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  return 0
}

/**
 * 按耗时做 LPT 分配：先排长脚本，依次放进当前累计负载最小的泳道，避免平均切造成长尾。
 * 读不到耗时的条目按已知耗时的中位数估算，不能当成 0——否则这些条目会被全部堆进同一条泳道。
 * 完全没有历史耗时（首跑）时按发现顺序轮转，保证各泳道条数尽量均匀。
 */
function assignLanes(entries, laneCount, root) {
  const buckets = Array.from({ length: laneCount }, () => [])
  const timed = entries.map((entry) => ({ entry, ms: lastDurationMs(root, entry.ac) }))
  if (timed.every((item) => item.ms === 0)) {
    entries.forEach((entry, index) => buckets[index % laneCount].push(entry))
    return buckets
  }
  const known = timed.map((item) => item.ms).filter((ms) => ms > 0).sort((left, right) => left - right)
  const median = known[Math.floor(known.length / 2)]
  for (const item of timed) if (item.ms === 0) item.ms = median
  const loads = new Array(laneCount).fill(0)
  timed.sort((left, right) => right.ms - left.ms || left.entry.index - right.entry.index)
  for (const { entry, ms } of timed) {
    let target = 0
    for (let lane = 1; lane < laneCount; lane += 1) {
      if (loads[lane] < loads[target]) target = lane
    }
    buckets[target].push(entry)
    loads[target] += ms
  }
  for (const bucket of buckets) bucket.sort((left, right) => left.index - right.index)
  return buckets
}

async function runAllShared(root, entries, options) {
  const shared = entries.filter((entry) => SHARED_GROUPS.has(entry.group))
  const lane = entries.filter((entry) => LANE_GROUPS.has(entry.group))
  const legacy = entries.filter((entry) => !SHARED_GROUPS.has(entry.group) && !LANE_GROUPS.has(entry.group))
  const results = []
  const timings = { startMs: 0, groups: {}, stopMs: 0 }

  if (shared.length === 0 && lane.length === 0) {
    return { results: await runAll(root, entries, options), timings }
  }

  const groups = [...new Set(shared.map((entry) => entry.group))]
  const startAt = Date.now()
  const batch = await startBatch(groups)
  timings.startMs = Date.now() - startAt
  timings.runId = batch.runId

  const shards = new Map()
  const workers = []
  try {
    for (const group of groups) {
      const list = shared.filter((entry) => entry.group === group)
      const shardCount = SHARDED_GROUPS.has(group) ? 2 : 1
      const concurrency = GROUP_CONCURRENCY[group] ?? 1
      for (let shard = 0; shard < shardCount; shard += 1) {
        const queue = list.filter((_, i) => i % shardCount === shard)
        if (queue.length === 0) continue
        const key = shardCount > 1 ? `${group}#${shard}` : group
        const stat = { count: queue.length, concurrency, wallMs: 0, queue }
        shards.set(key, stat)
        timings.groups[key] = { scripts: queue.map((entry) => entry.ac), concurrency }
        const env = batch.envFor(group, group === 'ui' ? 0 : shard)
        for (const entry of queue) {
          entry.env = env
          entry.baseUrl = env.AC_UI_BASE ?? options.baseUrl
        }
        for (let slot = 0; slot < concurrency; slot += 1) {
          workers.push((async () => {
            const t0 = Date.now()
            const laneEnv = batch.envFor(group, slot)
            while (queue.length > 0) {
              const entry = queue.shift()
              if (!entry) break
              // UI æ¯æ¡å¹¶è¡Œæ§½ä½ç»‘ä¸€æ¡ç‹¬ç«‹æ³³é“ï¼ˆç‹¬ç«‹é¡µé¢ç«¯å£ + ç‹¬ç«‹åº“ï¼‰ï¼Œé¿å…å…±äº« localStorage ä¸Žåº“çŠ¶æ€ã€‚
              if (group === 'ui') {
                entry.env = laneEnv
                entry.baseUrl = laneEnv.AC_UI_BASE
              }
              results.push(await runOne(root, entry, options))
            }
            stat.wallMs = Math.max(stat.wallMs, Date.now() - t0)
          })())
        }
      }
    }
    // æœªç™»è®°è„šæœ¬ï¼ˆæ—¶é—´ç±»åˆ¤æ®èµ° testclock å•è„šæœ¬æ¨¡å¼ï¼‰è‡ªæˆä¸€æ¡ä¸²è¡Œé“¾ï¼Œä¸Žå…±äº«ç»„å¹¶è¡Œï¼š
    // å®ƒä»¬å½¼æ­¤è¦æŠ¢ 8789 ä¸Ž backend.lockï¼Œåªèƒ½ä¸²è¡Œï¼›ä½†ä¸å¿…ç­‰å…±äº«ç»„è·‘å®Œï¼Œå¦åˆ™æ•´æ‰¹è¢«æ‹–åˆ°åˆ†é’Ÿçº§ã€‚
    // cdp 组按槽位分泳道：槽位环境由 batch.envFor('cdp', lane) 下发（独立后端/上游/Chrome/HOME/锁），
    // 泳道内脚本串行（同一槽位共用一份库），泳道之间并行。分配按上次耗时做 LPT，不平均切。
    for (const group of new Set(lane.map((entry) => entry.group))) {
      const list = lane.filter((entry) => entry.group === group)
      const laneCount = GROUP_CONCURRENCY[group] ?? 1
      const buckets = assignLanes(list, laneCount, root)
      for (let laneIndex = 0; laneIndex < buckets.length; laneIndex += 1) {
        const bucket = buckets[laneIndex]
        if (bucket.length === 0) continue
        const key = `${group}#lane-${laneIndex + 1}`
        const stat = { count: bucket.length, concurrency: 1, wallMs: 0 }
        shards.set(key, stat)
        timings.groups[key] = { scripts: bucket.map((entry) => entry.ac), concurrency: 1 }
        const laneEnv = batch.envFor(group, laneIndex)
        for (const entry of bucket) {
          entry.env = laneEnv
          entry.baseUrl = laneEnv.AC_CONV_BASE ?? options.baseUrl
        }
        workers.push((async () => {
          const t0 = Date.now()
          for (const entry of bucket) results.push(await runOne(root, entry, options))
          stat.wallMs = Date.now() - t0
        })())
      }
    }

    workers.push((async () => {
      for (const entry of legacy) results.push(await runOne(root, entry, options))
    })())
    await Promise.all(workers)
  } finally {
    const stopAt = Date.now()
    timings.stopMs = (await stopBatch([...batch.instances.values()])).reduce((sum, item) => sum + item.stopMs, 0)
    timings.teardownMs = Date.now() - stopAt
    timings.instances = [...batch.instances.values()].map((handle) => ({ name: handle.spec.name, port: handle.port, home: relative(root, handle.home).split('\\').join('/') }))
  }
  for (const [key, stat] of shards) timings.groups[key].wallMs = stat.wallMs
  sortResults(results, entries)
  return { results, timings }
}

function sortResults(results, entries) {
  results.sort((a, b) => {
    const left = entries.find((entry) => entry.ac === a.ac)?.index ?? 0
    const right = entries.find((entry) => entry.ac === b.ac)?.index ?? 0
    return left - right
  })
}

function summarize(results) {
  const counts = { pass: 0, fail: 0, skip: 0, timeout: 0, error: 0 }
  for (const item of results) counts[item.result] += 1
  return counts
}

/** 断言数缺证据记 0；只有判 pass 且为 0 时才触发 invalid。 */
function assertionCount(item) {
  return Number.isFinite(item.assertions) ? item.assertions : 0
}

/** skip 不计入断言合计：跳过没有执行断言，不能把旧数字或预期数字加回来。 */
function assertionTotalOf(results) {
  return results
    .filter((item) => item.result !== 'skip')
    .reduce((sum, item) => sum + assertionCount(item), 0)
}

function invalidPasses(results) {
  return results.filter((item) => item.result === 'pass' && assertionCount(item) === 0)
}

function printTable(results, counts) {
  console.log('AC\t结果\t耗时\t断言\t证据')
  for (const item of results) {
    console.log(`${item.ac}\t${item.result}\t${item.durationMs}ms\t${item.assertions ?? '-'}\t${item.evidence}`)
  }
  const errorPart = counts.error > 0 ? ` / error ${counts.error}` : ''
  console.log(
    `汇总：${results.length} 条，pass ${counts.pass} / fail ${counts.fail} / skip ${counts.skip} / timeout ${counts.timeout}${errorPart}；断言 ${assertionTotalOf(results)} 条`,
  )
  const invalid = invalidPasses(results)
  if (invalid.length > 0) {
    console.log(`invalid：${invalid.map((item) => item.ac).join(',')} 判 pass 但断言数为 0`)
  }
}

function writeSelfTestFixtures() {
  const acDir = join(FIXTURE_DIR, 'scripts', 'ac')
  mkdirSync(acDir, { recursive: true })
  writeFileSync(
    join(acDir, 'AC-TST-002-01.mjs'),
    [
      'import { mkdirSync, writeFileSync } from "node:fs"',
      'mkdirSync(".tmp/ac", { recursive: true })',
      'writeFileSync(".tmp/ac/AC-TST-002-01.json", JSON.stringify({ checks: [{ ok: true }] }))',
      'console.log(JSON.stringify({ ac: "AC-TST-002-01", pass: true, detail: "self-test pass sample" }))',
      'process.exit(0)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-01.json'),
    '{"group":"cdp"}\n',
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-02.mjs'),
    [
      'console.log(JSON.stringify({ ac: "AC-TST-002-02", pass: false, detail: "self-test fail sample" }))',
      'process.exit(1)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-03.mjs'),
    [
      'console.log(JSON.stringify({ ac: "AC-TST-002-03", pass: true, detail: "self-test timeout sample" }))',
      'setTimeout(() => {}, 10000)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-04.mjs'),
    [
      'console.log("SKIP AC-TST-002-04 reason: self-test skip sample")',
      'console.log("0 passed, 0 failed")',
      'process.exit(0)',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    join(acDir, 'AC-TST-002-05.mjs'),
    [
      'console.log(JSON.stringify({ ac: "AC-TST-002-05", pass: true, detail: "self-test zero-assertion pass" }))',
      'process.exit(0)',
      '',
    ].join('\n'),
    'utf8',
  )
}

async function runSelfTest() {
  writeSelfTestFixtures()
  const entries = discoverScripts(FIXTURE_DIR)
  const options = {
    baseUrl: 'http://127.0.0.1:1',
    timeoutMs: 1200,
  }
  const results = await runAll(FIXTURE_DIR, entries, options)
  const counts = summarize(results)
  const invalid = invalidPasses(results)
  let ok = true
  const cdpEntry = entries.find((entry) => entry.ac === 'AC-TST-002-01')
  const cdpOk = cdpEntry?.group === 'cdp'
  if (!cdpOk) ok = false
  console.log(`${cdpOk ? 'PASS' : 'FAIL'} sidecar marks AC-TST-002-01 as cdp serial group`)
  const expectations = [
    ['pass', counts.pass, 2],
    ['fail', counts.fail, 1],
    ['skip', counts.skip, 1],
    ['timeout', counts.timeout, 1],
    ['total', results.length, 5],
  ]
  for (const [label, actual, expected] of expectations) {
    const passed = actual === expected
    if (!passed) ok = false
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label} ${actual}, expected ${expected}`)
  }
  const invalidOk = invalid.length === 1 && invalid[0].ac === 'AC-TST-002-05'
  if (!invalidOk) ok = false
  console.log(`${invalidOk ? 'PASS' : 'FAIL'} zero-assertion pass is invalid (${invalid.map((item) => item.ac).join(',') || 'none'})`)
  const simulatedExit = counts.fail + counts.timeout + counts.error + invalid.length > 0 ? 1 : 0
  const exitOk = simulatedExit === 1
  if (!exitOk) ok = false
  console.log(`${exitOk ? 'PASS' : 'FAIL'} summary exit ${simulatedExit}, expected 1`)
  const evidenceOk = results.every((item) => existsSync(join(FIXTURE_DIR, item.evidence)))
  if (!evidenceOk) ok = false
  console.log(`${evidenceOk ? 'PASS' : 'FAIL'} all evidence files written`)
  console.log(ok ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  return ok ? 0 : 1
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    json: false,
    selfTest: false,
    baseUrl: undefined,
    only: [],
    group: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    legacy: false,
    build: false,
    impact: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') options.json = true
    else if (arg === '--self-test') options.selfTest = true
    else if (arg === '--legacy') options.legacy = true
    else if (arg === '--build') options.build = true
    else if (arg === '--impact') {
      const value = argv[index + 1]
      if (!value) return { error: '--impact ç¼ºå°‘æ”¹åŠ¨æ–‡ä»¶åˆ—è¡¨' }
      options.impact.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg === '--base-url') {
      options.baseUrl = argv[index + 1]
      if (!options.baseUrl) return { error: '--base-url ç¼ºå°‘åœ°å€å‚æ•°' }
      index += 1
    } else if (arg === '--only') {
      const value = argv[index + 1]
      if (!value) return { error: '--only ç¼ºå°‘ AC ID' }
      options.only.push(...value.split(',').map((item) => item.trim()).filter(Boolean))
      index += 1
    } else if (arg === '--group') {
      const value = argv[index + 1]
      if (!value || !GROUPS.has(value)) return { error: '--group åªæŽ¥å— cdpã€httpã€unit' }
      options.group = value
      index += 1
    } else if (arg === '--root') {
      const value = argv[index + 1]
      if (!value) return { error: '--root ç¼ºå°‘ç›®å½•å‚æ•°' }
      options.root = resolve(value)
      index += 1
    } else if (arg === '--timeout') {
      const value = Number(argv[index + 1])
      if (!Number.isFinite(value) || value <= 0) return { error: '--timeout éœ€è¦æ­£æ¯«ç§’æ•°' }
      options.timeoutMs = value
      index += 1
    } else {
      return { error: `æœªçŸ¥å‚æ•° ${arg}` }
    }
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.error) {
    console.error(options.error)
    return 2
  }
  if (options.selfTest) return runSelfTest()

  if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
    console.error(`ä»“åº“æ ¹ç›®å½•ä¸å¯è¯»ï¼š${options.root}`)
    return 2
  }

  const build = []
  if (options.build) {
    build.push(ensureBackendBuilt(options.root), ensureFrontendBuilt(options.root))
  }

  if (options.impact.length > 0) {
    const selection = impactSelection(options.root, options.impact)
    console.log(`å½±å“é¢ï¼š${options.impact.join('ã€')}`)
    console.log(`è‡³å°‘é‡è·‘ï¼š${selection.scripts.join(',') || 'ï¼ˆæ— åŒ¹é…ï¼ŒæŒ‰å…¨é‡å¤„ç†ï¼‰'}`)
    for (const note of selection.notes) console.log(`è¯´æ˜Žï¼š${note}`)
    options.only.push(...selection.scripts)
  }

  let entries = discoverScripts(options.root)
  if (options.group) entries = entries.filter((entry) => entry.group === options.group)
  // --only 支持精确 ID 与前缀：以「-」结尾的模式按前缀匹配（如 AC-TASK- 选中 30 条任务域脚本）。
  if (options.only.length > 0) {
    entries = entries.filter((entry) => options.only.some((pattern) => (
      pattern.endsWith('-') ? entry.ac.startsWith(pattern) : entry.ac === pattern
    )))
  }

  if (entries.length === 0) {
    console.log('æ²¡æœ‰åŒ¹é…çš„ AC æ–­è¨€è„šæœ¬')
    return 0
  }

  options.failFast = true
  const started = Date.now()
  const { results, timings } = options.legacy
    ? { results: await runAll(options.root, entries, options), timings: null }
    : await runAllShared(options.root, entries, options)
  const elapsedMs = Date.now() - started
  const counts = summarize(results)
  const assertionTotal = assertionTotalOf(results)
  const invalid = invalidPasses(results)
  const invalidScripts = invalid.map((item) => item.ac)
  const failed = counts.fail + counts.timeout + counts.error + invalid.length
  if (options.json) {
    console.log(JSON.stringify({
      mode: options.legacy ? 'legacy' : 'shared',
      counts,
      total: results.length,
      elapsedMs,
      assertions: assertionTotal,
      invalid: invalid.length > 0,
      invalidScripts,
      build,
      timings,
      results,
    }, null, 0))
  } else {
    printTable(results, counts)
    console.log(`总耗时 ${elapsedMs}ms，断言 ${assertionTotal} 条`)
  }
  return failed > 0 ? 1 : 0
}

main().then((code) => process.exit(code))

