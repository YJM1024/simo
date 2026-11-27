// scripts/ac/lib/core/evidence.mjs
//
// 证据与产物绑定：每条证据都带 manifest 的 gitHead、buildId 与各产物 sha256。
// 重建后旧证据的 sha 对不上，一眼能看出失效，不需要人再核。
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, artifactStamp } from './bootstrap.mjs'

const EVIDENCE_DIR = path.join(ROOT, 'build', 'evidence')

export function evidenceStamp() {
  return artifactStamp()
}

export function writeEvidence(layer, id, payload = {}) {
  const dir = path.join(EVIDENCE_DIR, layer)
  fs.mkdirSync(dir, { recursive: true })
  const body = {
    schema: 1,
    id,
    layer,
    at: new Date().toISOString(),
    artifact: evidenceStamp(),
    ...payload,
  }
  const file = path.join(dir, `${id}.json`)
  fs.writeFileSync(file, JSON.stringify(body, null, 2))
  return path.relative(ROOT, file).split('\\').join('/')
}

/** 把脚本自己写的 .tmp/ac/<AC>.json 收进 build/evidence/e2e 并附产物戳。 */
export function collectAcEvidence(ids = null) {
  const source = path.join(ROOT, '.tmp', 'ac')
  if (!fs.existsSync(source)) return []
  const wanted = ids ? new Set(ids) : null
  const collected = []
  for (const name of fs.readdirSync(source)) {
    if (!name.endsWith('.json')) continue
    const ac = name.slice(0, -5)
    if (wanted && !wanted.has(ac)) continue
    let payload
    try { payload = JSON.parse(fs.readFileSync(path.join(source, name), 'utf8')) } catch { continue }
    const file = writeEvidence('e2e', ac, {
      pass: Boolean(payload.pass ?? (Array.isArray(payload.checks) && payload.checks.every((c) => c.ok))),
      detail: payload.detail ?? '',
      checks: payload.checks ?? {},
      raw: payload.raw ?? {},
      source: path.relative(ROOT, path.join(source, name)).split('\\').join('/'),
    })
    collected.push(file)
  }
  return collected
}

export function screenshotIndex(layer = 'e2e') {
  const dir = path.join(EVIDENCE_DIR, 'screenshots', layer)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((name) => /\.(png|jpg|jpeg)$/i.test(name)).sort().map((name) => ({
    file: path.relative(ROOT, path.join(dir, name)).split('\\').join('/'),
    bytes: fs.statSync(path.join(dir, name)).size,
    at: new Date(fs.statSync(path.join(dir, name)).mtimeMs).toISOString(),
  }))
}

export function writeJson(rel, value) {
  const file = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
  return path.relative(ROOT, file).split('\\').join('/')
}
