// scripts/ac/lib/core/db.mjs
//
// 隔离库的快照、恢复与只读查询。快照前必须停后端（WAL 未落盘时拷出来的是半张表）；
// 恢复不删除现有库，只把它移到 .tmp/pipeline-build/trash/ 下，保留原路径结构。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { ROOT } from './bootstrap.mjs'

export const DB_NAME = 'simo.db'

export function dbFile(home) {
  return path.join(home, DB_NAME)
}

export function hasDb(home) {
  return fs.existsSync(dbFile(home))
}

export function queryRows(home, sql, params = []) {
  const file = dbFile(home)
  if (!fs.existsSync(file)) throw new Error(`隔离库不存在：${file}`)
  const db = new DatabaseSync(file, { readOnly: true })
  try { return db.prepare(sql).all(...params) } finally { db.close() }
}

export function execDb(home, sql, params = []) {
  const file = dbFile(home)
  if (!fs.existsSync(file)) throw new Error(`隔离库不存在：${file}`)
  const db = new DatabaseSync(file)
  try { return db.prepare(sql).run(...params) } finally { db.close() }
}

export function countRows(home, table, where = '', params = []) {
  const row = queryRows(home, `SELECT COUNT(*) AS n FROM ${table}${where ? ` WHERE ${where}` : ''}`, params)[0]
  return Number(row?.n ?? 0)
}

/** 快照：库文件 + WAL/SHM 一起复制到 build/evidence/db；返回描述（带 sha256）。 */
export function snapshot(home, label = 'snapshot') {
  const source = dbFile(home)
  if (!fs.existsSync(source)) throw new Error(`快照失败：${source} 不存在`)
  const dir = path.join(ROOT, 'build', 'evidence', 'db')
  fs.mkdirSync(dir, { recursive: true })
  const safe = String(label).replace(/[^a-zA-Z0-9._-]/g, '_')
  const target = path.join(dir, `${safe}-${Date.now()}.db`)
  fs.copyFileSync(source, target)
  const sidecars = []
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(source + suffix)) {
      fs.copyFileSync(source + suffix, target + suffix)
      sidecars.push(path.basename(target + suffix))
    }
  }
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')
  return { path: path.relative(ROOT, target).split('\\').join('/'), bytes: fs.statSync(target).size, sha256, sidecars }
}

/** 恢复：把当前库移到 trash，再把快照复制回来；不删除任何文件。 */
export function restore(home, snapshotPath) {
  const source = path.isAbsolute(snapshotPath) ? snapshotPath : path.join(ROOT, snapshotPath)
  if (!fs.existsSync(source)) throw new Error(`恢复失败：快照 ${source} 不存在`)
  const target = dbFile(home)
  const trash = path.join(ROOT, '.tmp', 'pipeline-build', 'trash', `${path.basename(home)}-${Date.now()}`)
  fs.mkdirSync(trash, { recursive: true })
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(target + suffix)) {
      const dest = path.join(trash, `${DB_NAME}${suffix}`)
      fs.renameSync(target + suffix, dest)
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, target + suffix)
  }
  return { restored: path.relative(ROOT, target).split('\\').join('/'), movedTo: path.relative(ROOT, trash).split('\\').join('/') }
}
