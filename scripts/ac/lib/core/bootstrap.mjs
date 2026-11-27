// scripts/ac/lib/core/bootstrap.mjs
//
// 单一构建清单入口：所有测试脚本要启动后端/前端，都必须从这里拿路径。
// 清单 build/manifest.json 由 scripts/verify-all.mjs 生成；本模块只负责校验与启动，
// 校验不通过就抛 StaleArtifactError，调用方据此拒绝启动并提示重跑 verify-all。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
export const BUILD_DIR = path.join(ROOT, 'build')
export const MANIFEST_FILE = path.join(BUILD_DIR, 'manifest.json')
const GIT = 'E:\\dsh_home\\tools\\PortableGit\\bin\\git.exe'
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

export class StaleArtifactError extends Error {
  constructor(message, detail = {}) {
    super(message)
    this.name = 'StaleArtifactError'
    this.code = 'R-BUILD'
    this.detail = detail
  }
}

function newestSource(root) {
  let newestMs = 0
  let newestFile = ''
  const visit = (dir, filter) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.tmp', 'dist', 'build', '.git'].includes(entry.name)) continue
        visit(full, filter)
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

export function sourceInventory(root = ROOT) {
  const backend = newestSource(path.join(root, 'backend'), (file) => /\.(go|mod|sum)$/.test(file))
  const frontend = newestSource(path.join(root, 'frontend'), (file) => /\.(tsx?|css|html|mjs|json)$/.test(file) && !file.includes(`${path.sep}dist${path.sep}`))
  return {
    backend: { ...backend, newestFile: path.relative(root, backend.newestFile).split('\\').join('/') },
    frontend: { ...frontend, newestFile: path.relative(root, frontend.newestFile).split('\\').join('/') },
  }
}

export function hashDir(dir) {
  const files = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else files.push(path.relative(dir, full).split('\\').join('/'))
    }
  }
  walk(dir)
  const hash = crypto.createHash('sha256')
  for (const rel of files.sort()) {
    hash.update(rel)
    hash.update('\0')
    hash.update(sha256(fs.readFileSync(path.join(dir, rel))))
    hash.update('\n')
  }
  return { sha256: hash.digest('hex'), files: files.length }
}

export function readManifest({ required = true } = {}) {
  if (!fs.existsSync(MANIFEST_FILE)) {
    if (!required) return null
    throw new StaleArtifactError(`缺少构建清单 ${path.relative(ROOT, MANIFEST_FILE)}，拒绝启动测试；先跑 node scripts/verify-all.mjs`)
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'))
  if (!manifest.artifacts || !manifest.artifacts.backend || !manifest.artifacts.frontend) {
    throw new StaleArtifactError('构建清单不完整（缺 backend 或 frontend），拒绝启动测试；重跑 node scripts/verify-all.mjs')
  }
  return manifest
}

function gitHead() {
  if (!fs.existsSync(GIT)) return null
  const run = spawnSync(GIT, ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true })
  return run.status === 0 ? run.stdout.trim() : null
}

/** 校验清单：文件存在、字节数与 sha 一致、源码不晚于构建、git HEAD 未变。返回绝对路径表。 */
export function verifyManifest(manifest = readManifest()) {
  const errors = []
  const paths = {}
  const now = sourceInventory()
  for (const [key, artifact] of Object.entries(manifest.artifacts)) {
    const abs = path.resolve(ROOT, artifact.path)
    if (!abs.startsWith(ROOT)) { errors.push(`${key}: 清单路径越界 ${artifact.path}`); continue }
    if (!fs.existsSync(abs)) { errors.push(`${key}: 产物不存在 ${artifact.path}`); continue }
    if (artifact.kind === 'dir' || fs.statSync(abs).isDirectory()) {
      const actual = hashDir(abs)
      if (actual.sha256 !== artifact.sha256) errors.push(`${key}: 目录哈希与清单不一致（清单 ${artifact.sha256.slice(0, 12)}…，实际 ${actual.sha256.slice(0, 12)}…）`)
      if (actual.files !== artifact.files) errors.push(`${key}: 文件数不一致（清单 ${artifact.files}，实际 ${actual.files}）`)
    } else {
      const bytes = fs.readFileSync(abs)
      if (bytes.length !== artifact.bytes) errors.push(`${key}: 字节数不一致（清单 ${artifact.bytes}，实际 ${bytes.length}）`)
      const digest = sha256(bytes)
      if (digest !== artifact.sha256) errors.push(`${key}: sha256 与清单不一致（清单 ${artifact.sha256.slice(0, 12)}…，实际 ${digest.slice(0, 12)}…）`)
    }
    paths[key] = abs
  }
  for (const [key, source] of Object.entries(manifest.sources ?? {})) {
    const current = now[key]
    if (!current) continue
    if (current.newestMs > source.newestMs + 1000) {
      errors.push(`${key}: 源码比产物新（${current.newestFile}），产物是旧的`)
    }
  }
  const head = gitHead()
  if (head && manifest.gitHead && head !== manifest.gitHead) {
    errors.push(`git HEAD 变了（清单 ${manifest.gitHead.slice(0, 10)}，当前 ${head.slice(0, 10)}），产物与代码不同源`)
  }
  if (errors.length > 0) {
    throw new StaleArtifactError(
      `构建产物校验失败，拒绝启动测试：\n- ${errors.join('\n- ')}\n请重跑 node scripts/verify-all.mjs（只校验不重建可加 --no-build，但校验仍会执行）`,
      { errors },
    )
  }
  return { manifest, paths, gitHead: head ?? manifest.gitHead ?? null }
}

let cached = null
export function ensureArtifacts() {
  if (!cached) cached = verifyManifest()
  return cached
}

export function backendExe() { return required('backend') }
export function testclockExe() { return required('testclock') }
export function frontendDir() { return required('frontend') }

function required(key) {
  const { paths } = ensureArtifacts()
  const value = paths[key]
  if (!value) throw new StaleArtifactError(`构建清单缺少 ${key} 产物，拒绝启动测试；重跑 node scripts/verify-all.mjs`)
  return value
}

/** 证据戳：产物 sha 与 buildId，写进每份 evidence。 */
export function artifactStamp() {
  try {
    const { manifest, paths } = ensureArtifacts()
    return {
      gitHead: manifest.gitHead,
      buildId: manifest.buildId,
      builtAt: manifest.builtAt,
      artifacts: Object.fromEntries(Object.entries(manifest.artifacts).map(([key, item]) => [key, {
        path: item.path,
        sha256: item.sha256,
        bytes: item.bytes ?? null,
        builtAt: item.builtAt ?? manifest.builtAt,
      }])),
      resolved: Object.fromEntries(Object.keys(paths).map((key) => [key, path.relative(ROOT, paths[key]).split('\\').join('/')])),
    }
  } catch (error) {
    return { error: error.message }
  }
}

export function isPortFree(port) {
  const run = spawnSync(process.execPath, ['-e', `const net=require('net');const s=net.createServer();s.once('error',()=>process.exit(1));s.listen(${port},'127.0.0.1',()=>s.close(()=>process.exit(0)))`], { windowsHide: true, timeout: 5000 })
  return run.status === 0
}

export function freePort(start = 19000, end = start + 200) {
  for (let port = start; port <= end; port += 1) if (isPortFree(port)) return port
  throw new Error(`找不到空闲端口（扫描 ${start}-${end}）`)
}

export function waitHealthy(baseUrl, timeoutMs = 25000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(baseUrl + '/api/health', { signal: AbortSignal.timeout(1000) })
        if (res.status === 200) return resolve(Date.now() - started)
      } catch { /* 未就绪 */ }
      if (Date.now() - started > timeoutMs) return reject(new Error(`后端 ${baseUrl} 在 ${timeoutMs}ms 内未就绪`))
      setTimeout(tick, 100)
    }
    tick()
  })
}

/**
 * 按清单启后端：路径只接受 verifyManifest 的产物；HOME 由调用方隔离。
 * 返回 { child, port, baseUrl, home, exe, stop }。
 */
export async function startBackend({ exe, port, home, mode = 'mock', testClock, upstreamPort, env = {}, timeoutMs = 25000, logFile } = {}) {
  const backend = exe ?? backendExe()
  const homeDir = home ?? path.join(ROOT, '.tmp', 'pipeline-build', 'runs', `backend-${process.pid}-${Date.now()}`)
  fs.mkdirSync(homeDir, { recursive: true })
  const listenPort = port ?? freePort(19000)
  const baseUrl = `http://127.0.0.1:${listenPort}`
  const log = logFile ?? path.join(homeDir, 'backend.log')
  const fd = fs.openSync(log, 'a')
  const child = spawn(backend, ['serve', '-addr', `127.0.0.1:${listenPort}`, '-model', mode], {
    cwd: homeDir,
    env: {
      ...process.env,
      SIMO_HOME: homeDir,
      SIMO_LLM: mode,
      SIMO_ADDR: `127.0.0.1:${listenPort}`,
      ...(testClock ? { SIMO_TEST_CLOCK: testClock } : {}),
      ...(upstreamPort ? { SIMO_UPSTREAM: `http://127.0.0.1:${upstreamPort}` } : {}),
      ...env,
    },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  fs.closeSync(fd)
  child.once('error', () => {})
  try {
    await waitHealthy(baseUrl, timeoutMs)
  } catch (error) {
    const tail = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-1200) : ''
    await stop(child)
    throw new Error(`${error.message}；日志尾部：${tail.replace(/\s+/g, ' ').slice(-600)}`)
  }
  return {
    child, port: listenPort, baseUrl, home: homeDir, exe: backend,
    stop: () => stop(child),
  }
}

export function stop(child) {
  if (!child || child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } resolve() }, 3000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    try { child.kill() } catch { clearTimeout(timer); resolve() }
  })
}
