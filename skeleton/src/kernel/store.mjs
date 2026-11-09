/**
 * 本文件对应决策 D-07：存算分离 —— 单写者 append-only 存储（Store）。
 *
 * 决策内容：
 *  - 事实持久化到 `<root>/.superagent/state.jsonl`，每一行是一条不可变的 {op:'put'} 记录；
 *  - 内存索引只是"从日志重放出来的投影"，进程重启时从 JSONL 重建，因此存算分离；
 *  - 同一 state 目录只允许一个写者：启动时用 `.superagent/lock`（O_EXCL 创建）取目录锁，
 *    第二个实例启动直接抛 StoreLockedError；
 *  - 提供 insert-only 的 append(kind, entity) 与事务式 update(kind, id, mutator)，
 *    后者对内存投影做"读出-修改-落一条新记录"，实体 id 不可改。
 *
 * 它保证的不变量：
 *  - 单写者：lockfile 被占用时第二个 Store 实例创建失败（不静默并存）；
 *  - append-only：日志只会追加，从不修改/删除旧行；重启后内存索引与关闭前一致；
 *  - 事务性：update 的 mutator 只看到结构化克隆，落盘成功后内存投影才切换；
 *  - 所有实体带 rev（同一 kind+id 的版本号，从 1 递增），可用于审计与乐观并发。
 */
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const STORE_DIR = '.superagent';
export const STATE_FILE = 'state.jsonl';
export const LOCK_FILE = 'lock';

export class StoreLockedError extends Error {
  constructor(root, owner) {
    const who = owner && owner.pid ? `（持有者 pid=${owner.pid}, instanceId=${owner.instanceId ?? '?'}）` : '';
    super(`D-07 单写者锁冲突：${join(root, STORE_DIR, LOCK_FILE)} 已被占用${who}。同一 state 目录不允许第二个 Store 实例。`);
    this.name = 'StoreLockedError';
    this.root = root;
    this.owner = owner;
  }
}

export class DuplicateEntityError extends Error {
  constructor(kind, id) {
    super(`D-07 重复实体：${kind}/${id} 已存在，append 只允许写入新实体（需要修改请用 update）`);
    this.name = 'DuplicateEntityError';
    this.kind = kind;
    this.id = id;
  }
}

export class EntityNotFoundError extends Error {
  constructor(kind, id) {
    super(`D-07 实体不存在：${kind}/${id}`);
    this.name = 'EntityNotFoundError';
    this.kind = kind;
    this.id = id;
  }
}

export class StoreClosedError extends Error {
  constructor() {
    super('D-07 Store 已关闭（锁已释放），不允许继续读写');
    this.name = 'StoreClosedError';
  }
}

function keyOf(kind, id) {
  return `${kind}\u0000${id}`;
}

function assertKind(kind) {
  if (typeof kind !== 'string' || kind.length === 0) {
    throw new TypeError('D-07: 实体 kind 必须是非空字符串');
  }
}

function assertEntity(entity) {
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
    throw new TypeError('D-07: 实体必须是对象');
  }
  if (typeof entity.id !== 'string' || entity.id.length === 0) {
    throw new TypeError('D-07: 实体必须有非空字符串 id');
  }
}

export function createStore({ root, clock = () => Date.now(), instanceId = `ins-${randomUUID().slice(0, 8)}` } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('D-07: createStore 需要 root 目录');
  }

  const dir = join(root, STORE_DIR);
  const logPath = join(dir, STATE_FILE);
  const lockPath = join(dir, LOCK_FILE);
  mkdirSync(dir, { recursive: true });

  // 1) 先取目录锁：O_EXCL 语义的 'wx'，已存在则失败。
  let lockFd;
  try {
    lockFd = openSync(lockPath, 'wx');
    writeSync(lockFd, JSON.stringify({ v: 1, pid: process.pid, instanceId, acquiredAt: clock() }));
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      let owner = null;
      try {
        owner = JSON.parse(readFileSync(lockPath, 'utf8'));
      } catch {
        owner = null;
      }
      throw new StoreLockedError(root, owner);
    }
    throw error;
  }

  let closed = false;
  let recordCount = 0;
  const index = new Map(); // kind -> Map<id, entity>
  const revisions = new Map(); // kind\0id -> rev

  function assertOpen() {
    if (closed) throw new StoreClosedError();
  }

  function setLoaded(kind, id, entity, rev) {
    if (!index.has(kind)) index.set(kind, new Map());
    index.get(kind).set(id, structuredClone(entity));
    revisions.set(keyOf(kind, id), rev);
  }

  // 2) 从 JSONL 重建内存索引（重启恢复）。
  if (existsSync(logPath)) {
    const raw = readFileSync(logPath, 'utf8');
    const lines = raw.split('\n');
    for (const line of lines) {
      const text = line.trim();
      if (!text) continue;
      let record;
      try {
        record = JSON.parse(text);
      } catch {
        throw new Error(`D-07: state.jsonl 第 ${recordCount + 1} 条记录不是合法 JSON，拒绝静默跳过`);
      }
      if (record.op !== 'put') {
        throw new Error(`D-07: 未知的日志操作 op=${record.op}（append-only 日志只允许 put）`);
      }
      assertKind(record.kind);
      assertEntity(record.entity);
      setLoaded(record.kind, record.id ?? record.entity.id, record.entity, Number(record.rev) || 1);
      recordCount += 1;
    }
  }

  function writeRecord(record) {
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf8');
    recordCount += 1;
  }

  function append(kind, entity) {
    assertOpen();
    assertKind(kind);
    assertEntity(entity);
    if (index.get(kind)?.has(entity.id)) throw new DuplicateEntityError(kind, entity.id);
    const key = keyOf(kind, entity.id);
    const rev = (revisions.get(key) ?? 0) + 1;
    writeRecord({ v: 1, op: 'put', kind, id: entity.id, rev, at: clock(), entity: structuredClone(entity) });
    setLoaded(kind, entity.id, entity, rev);
    return structuredClone(entity);
  }

  function update(kind, id, mutator) {
    assertOpen();
    assertKind(kind);
    if (typeof mutator !== 'function') throw new TypeError('D-07: update 的 mutator 必须是函数');
    const current = index.get(kind)?.get(id);
    if (!current) throw new EntityNotFoundError(kind, id);
    const draft = structuredClone(current);
    const next = mutator(draft) ?? draft;
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new TypeError('D-07: update 的 mutator 必须返回实体对象');
    }
    if (next.id !== id) throw new Error('D-07: 事务 update 不允许修改实体 id');
    const key = keyOf(kind, id);
    const rev = (revisions.get(key) ?? 0) + 1;
    writeRecord({ v: 1, op: 'put', kind, id, rev, at: clock(), entity: structuredClone(next) });
    setLoaded(kind, id, next, rev);
    return structuredClone(next);
  }

  function get(kind, id) {
    assertOpen();
    const entity = index.get(kind)?.get(id);
    return entity ? structuredClone(entity) : null;
  }

  function has(kind, id) {
    assertOpen();
    return Boolean(index.get(kind)?.has(id));
  }

  function list(kind) {
    assertOpen();
    const bucket = index.get(kind);
    return bucket ? [...bucket.values()].map((entity) => structuredClone(entity)) : [];
  }

  function count(kind) {
    assertOpen();
    return index.get(kind)?.size ?? 0;
  }

  function stats() {
    let entities = 0;
    for (const bucket of index.values()) entities += bucket.size;
    return { root, dir, logPath, records: recordCount, entities, closed };
  }

  function close() {
    if (closed) return;
    closed = true;
    try {
      closeSync(lockFd);
    } catch {
      // fd 已关闭时忽略
    }
    try {
      const owner = JSON.parse(readFileSync(lockPath, 'utf8'));
      if (owner.instanceId === instanceId) unlinkSync(lockPath);
    } catch {
      // 锁文件已被移除 / 不可读：不阻断关闭流程
    }
  }

  return {
    instanceId,
    append,
    update,
    get,
    has,
    list,
    count,
    stats,
    close,
    logPath,
  };
}
