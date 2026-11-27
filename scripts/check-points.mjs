#!/usr/bin/env node
/**
 * check-points.mjs — 流程点链与派单/步骤/检查点自检。
 *
 * 覆盖规则：MXV2-2-02、2-04、3-01、3-09、4-08、4-10、4-12、4-14、4-15、5-02、5-07、6-16、8-12、9-03。
 * 检查内容：
 *   PT-01 对象文件首部有编号（2-02）
 *   PT-02 流程点编号格式、类型码与序号连续（2-04）
 *   PT-03 每个产出物只有一个 owner，且 owner 是七角色之一（3-01）
 *   PT-04 检查点是文件且七项齐全（3-09、4-15）
 *   PT-05 变更包首部七字段与状态取值（4-08）
 *   PT-06 点文件首部有本点与上游点、上游已冻结且更早（4-10）
 *   PT-07 派单卡五要素、档位、四类编号（4-12）
 *   PT-08 步骤号连续、每步有分钟与产出（4-14）
 *   PT-09 判级五字段与判级理由（5-02）
 *   PT-10 缺陷修复严重级别四值（5-07）
 *   PT-11 点判据冻结时间与冻结人（6-16）
 *   PT-12 退回单四项与状态回草稿（8-12）
 *   PT-13 每步有 git status 与 diff、scope 对齐结论（9-03）
 *
 * 用法：
 *   node scripts/check-points.mjs
 *   node scripts/check-points.mjs --change CHG-FW-002
 *   node scripts/check-points.mjs --rule MXV2-4-12 --self-test
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  parseArgs,
  resolveRuleMode,
  selectChecks,
  runChecks,
  printResult,
  fixtureDir,
  createAsserter,
} from './lib/v2-rule-mode.mjs';

const NAME = 'check-points';
const RULES = [
  'MXV2-2-02',
  'MXV2-2-04',
  'MXV2-3-01',
  'MXV2-3-09',
  'MXV2-4-08',
  'MXV2-4-10',
  'MXV2-4-12',
  'MXV2-4-14',
  'MXV2-4-15',
  'MXV2-5-02',
  'MXV2-5-07',
  'MXV2-6-16',
  'MXV2-8-12',
  'MXV2-9-03',
];
const ROLES = ['需求方', '调研员', '判定员', '架构师', '撰写员', '验收员', '发布员'];
const STATUS = ['草稿', '已冻结', '实现中', '通过'];
const POINT_TYPES = ['REQ', 'SRC', 'JUD', 'RUL', 'ACC'];
const POINT_RE = /^P-(REQ|SRC|JUD|RUL|ACC)-(\d{2})$/;
const HEADER_FIELDS = ['变更号', '状态', '类型判级', '规模判级', 'owner', '验收人', '冻结时间'];
const CARD_COLUMNS = ['任务', 'Owner', '写作用域', 'AC', '证据', '状态', '档位', '禁止项'];
const CHECKPOINT_FIELDS = ['步骤号', '状态', '已完成', '未完成', '证据路径', '下一步', '更新时间'];

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** 解析 markdown 表格：表头、数据行与行号。 */
export function parseTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) {
      cur = null;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!cur) {
      cur = { header: cells, rows: [], line: i + 1 };
      tables.push(cur);
      continue;
    }
    if (cells.every((c) => /^[-: ]*$/.test(c) && c.length > 0)) continue;
    cur.rows.push({ cells, line: i + 1 });
  }
  return tables;
}

function headerTable(text) {
  const t = parseTables(text).find((x) => x.header[0] === '字段' && x.header[1] === '值');
  if (!t) return new Map();
  return new Map(t.rows.map((r) => [r.cells[0], r.cells[1] ?? '']));
}

function findTable(text, predicate) {
  return parseTables(text).find(predicate) ?? null;
}

export function loadCtx(root, opts = {}) {
  const changesDir = join(root, 'specs/changes');
  let changeId = opts.change;
  if (!changeId) {
    const dirs = existsSync(changesDir) ? readdirSync(changesDir).filter((d) => /^CHG-[A-Z0-9-]+$/.test(d)) : [];
    const framework = dirs.find((d) => d === 'CHG-FW-002');
    changeId = framework ?? dirs.sort().at(-1) ?? null;
  }
  const dir = changeId ? join(changesDir, changeId) : null;
  const exists = Boolean(dir && existsSync(dir));
  const files = {};
  for (const name of ['proposal.md', 'spec.md', 'change.md', 'tasks.md', 'evidence.md', 'LINKAGE.md']) {
    files[name] = dir ? readTextSafe(join(dir, name)) : null;
  }
  const pointsDir = dir ? join(dir, 'points') : null;
  const pointFiles = [];
  if (pointsDir && existsSync(pointsDir)) {
    for (const f of readdirSync(pointsDir)) {
      if (!/\.md$/.test(f)) continue;
      const p = join(pointsDir, f);
      pointFiles.push({ rel: relative(root, p).replaceAll('\\', '/'), text: readTextSafe(p) });
    }
  }
  if (dir && existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (/^P-(REQ|SRC|JUD|RUL|ACC)-\d{2}\.md$/.test(f)) {
        const p = join(dir, f);
        pointFiles.push({ rel: relative(root, p).replaceAll('\\', '/'), text: readTextSafe(p) });
      }
    }
  }
  const tasksText = files['tasks.md'] ?? '';
  const checkpoints = new Set();
  const explicit = opts.checkpoint ?? '.tmp/v2-p4/checkpoint.md';
  if (existsSync(join(root, explicit))) checkpoints.add(explicit);
  for (const m of tasksText.matchAll(/\.tmp\/[\w.-]+\/checkpoint\.md/g)) {
    if (existsSync(join(root, m[0]))) checkpoints.add(m[0]);
  }
  return {
    root,
    changeId,
    exists,
    dir,
    dirRel: dir ? relative(root, dir).replaceAll('\\', '/') : null,
    files,
    pointFiles,
    pointsMissing: Boolean(exists && pointsDir && !existsSync(pointsDir)),
    checkpoints: [...checkpoints],
    notes: [],
    changeMap: files['change.md'] ? headerTable(files['change.md']) : new Map(),
    taskTable: findTable(tasksText, (t) => t.header.includes('Owner') || t.header.includes('owner')),
    stepTables: parseTables(tasksText).filter((t) => t.header.includes('步骤') && t.header.includes('产出')),
  };
}

function relPoint(ctx, p) {
  return p.rel;
}

function checkNumbering(ctx) {
  const issues = [];
  let checks = 0;
  const entries = Object.entries(ctx.files).filter(([, t]) => t !== null);
  if (!entries.length) {
    ctx.notes.push('本次变更包没有任何对象文件，跳过编号首部检查');
    return { checks: 1, issues };
  }
  for (const [name, text] of entries) {
    checks++;
    const head = text.split(/\r?\n/).slice(0, 30).join('\n');
    if (!/CHG-[A-Z0-9-]+/.test(head)) issues.push({ rule: 'MXV2-2-02', file: `${ctx.dirRel}/${name}`, msg: '首部没有变更包编号行' });
  }
  return { checks, issues };
}

function checkPointIds(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.pointFiles.length) {
    ctx.notes.push('变更包内没有流程点文件（点链尚未建立）');
    return { checks: 1, issues };
  }
  const perType = new Map(POINT_TYPES.map((t) => [t, []]));
  for (const p of ctx.pointFiles) {
    checks++;
    const first = (p.text ?? '').split(/\r?\n/).slice(0, 20).join('\n');
    const m = first.match(/(?:点编号|编号)[：:]\s*(P-[A-Z]+-\d{2})/);
    const fileBase = p.rel.split('/').at(-1).replace(/\.md$/, '');
    const id = m ? m[1] : POINT_RE.test(fileBase) ? fileBase : null;
    if (!id) {
      issues.push({ rule: 'MXV2-2-04', file: p.rel, msg: '首部没有 P-<类型>-<NN> 编号行' });
      continue;
    }
    if (!POINT_RE.test(id)) {
      issues.push({ rule: 'MXV2-2-04', file: p.rel, msg: `编号 ${id} 不符合 P-<REQ|SRC|JUD|RUL|ACC>-<NN>` });
      continue;
    }
    perType.get(id.split('-')[1]).push({ id, rel: p.rel, seq: Number(id.split('-')[2]) });
  }
  for (const [type, list] of perType) {
    list.sort((a, b) => a.seq - b.seq);
    list.forEach((item, idx) => {
      if (item.seq !== idx + 1) {
        issues.push({ rule: 'MXV2-2-04', file: item.rel, msg: `${type} 类序号不连续：${item.id} 应为 ${String(idx + 1).padStart(2, '0')}` });
      }
    });
  }
  return { checks, issues };
}

function checkOwner(ctx) {
  const issues = [];
  let checks = 0;
  if (ctx.taskTable) {
    for (const row of ctx.taskTable.rows) {
      const idx = ctx.taskTable.header.findIndex((h) => h === 'Owner' || h === 'owner');
      if (idx < 0) continue;
      checks++;
      const val = row.cells[idx] ?? '';
      if (!val) issues.push({ rule: 'MXV2-3-01', file: `${ctx.dirRel}/tasks.md`, line: row.line, msg: 'owner 为空' });
      else if (!ROLES.some((r) => val.includes(r))) issues.push({ rule: 'MXV2-3-01', file: `${ctx.dirRel}/tasks.md`, line: row.line, msg: `owner「${val}」不是七角色之一` });
      else if (ROLES.filter((r) => val.includes(r)).length > 1) issues.push({ rule: 'MXV2-3-01', file: `${ctx.dirRel}/tasks.md`, line: row.line, msg: `owner 出现两个角色名：「${val}」` });
    }
  }
  for (const p of ctx.pointFiles) {
    checks++;
    const owners = [...(p.text ?? '').matchAll(/-\s*owner[：:]\s*(.+)$/gim)].map((m) => m[1].trim());
    if (owners.length !== 1) issues.push({ rule: 'MXV2-3-01', file: p.rel, msg: `owner 行数为 ${owners.length}，应恰好一行` });
    else if (!ROLES.some((r) => owners[0].includes(r))) issues.push({ rule: 'MXV2-3-01', file: p.rel, msg: `owner「${owners[0]}」不是七角色之一` });
  }
  return { checks, issues };
}

function checkCheckpoints(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.checkpoints.length) {
    ctx.notes.push('没有可核对的检查点文件（未声明 .tmp/<task-id>/checkpoint.md）');
    return { checks: 1, issues };
  }
  for (const rel of ctx.checkpoints) {
    checks++;
    const text = readTextSafe(join(ctx.root, rel)) ?? '';
    for (const field of CHECKPOINT_FIELDS) {
      if (!new RegExp(`^\\s*(?:[-*]\\s*)?${field}[：:]`, 'm').test(text)) {
        issues.push({ rule: 'MXV2-4-15', file: rel, msg: `检查点缺「${field}」` });
      }
    }
    if (!/git status/.test(text)) issues.push({ rule: 'MXV2-9-03', file: rel, msg: '检查点没有 git status 与 diff 记录' });
  }
  return { checks, issues };
}

function checkHeader(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.files['change.md']) {
    ctx.notes.push('没有 change.md，跳过首部七字段检查');
    return { checks: 1, issues };
  }
  checks++;
  const keys = [...ctx.changeMap.keys()];
  for (const field of HEADER_FIELDS) {
    if (!ctx.changeMap.has(field)) issues.push({ rule: 'MXV2-4-08', file: `${ctx.dirRel}/change.md`, msg: `首部缺字段「${field}」` });
  }
  const ordered = HEADER_FIELDS.every((f, i) => {
    const at = keys.indexOf(f);
    return at < 0 || i === 0 || at > keys.indexOf(HEADER_FIELDS[i - 1]);
  });
  if (!ordered) issues.push({ rule: 'MXV2-4-08', file: `${ctx.dirRel}/change.md`, msg: `首部字段顺序不是 ${HEADER_FIELDS.join('、')}` });
  const status = ctx.changeMap.get('状态');
  if (status && !STATUS.some((s) => status.includes(s))) issues.push({ rule: 'MXV2-4-08', file: `${ctx.dirRel}/change.md`, msg: `状态「${status}」不在四值内` });
  checks++;
  const trace = readTextSafe(join(ctx.root, 'docs/product/TRACEABILITY.md'));
  if (trace && ctx.changeId && trace.includes(ctx.changeId)) {
    if (status && !trace.includes(status)) issues.push({ rule: 'MXV2-4-08', file: 'docs/product/TRACEABILITY.md', msg: `追溯矩阵里的状态与首部「${status}」不一致` });
  } else {
    ctx.notes.push('追溯矩阵没有该变更包行，两处状态一致性未核对');
  }
  return { checks, issues };
}

function checkChain(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.pointFiles.length) {
    ctx.notes.push('没有点文件，点链可达性未核对');
    return { checks: 1, issues };
  }
  const ids = new Map(ctx.pointFiles.map((p) => [p.rel.split('/').at(-1).replace(/\.md$/, ''), p]));
  for (const [id, p] of ids) {
    checks++;
    const text = p.text ?? '';
    const up = text.match(/上游点[：:]\s*(P-[A-Z]+-\d{2}|无)/);
    if (!up) issues.push({ rule: 'MXV2-4-10', file: p.rel, msg: `${id} 首部没有上游点编号` });
    if (!text.includes('本点编号')) issues.push({ rule: 'MXV2-4-10', file: p.rel, msg: `${id} 首部没有本点编号行` });
    if (id.startsWith('P-JUD') || id.startsWith('P-RUL') || id.startsWith('P-ACC')) {
      if (!up || up[1] === '无') issues.push({ rule: 'MXV2-4-10', file: p.rel, msg: `${id} 是无上游的下游点` });
      else if (!ids.has(up[1])) issues.push({ rule: 'MXV2-4-10', file: p.rel, msg: `${id} 的上游点 ${up[1]} 不存在` });
    }
    const frozen = text.match(/冻结时间[：:]\s*(\S+)/);
    const own = text.match(/建立时间[：:]\s*(\S+)/);
    if (frozen && own && frozen[1] > own[1]) issues.push({ rule: 'MXV2-4-10', file: p.rel, msg: `${id} 的建立时间早于上游冻结时间` });
  }
  return { checks, issues };
}

function checkLinkageRefs(ctx) {
  const issues = [];
  let checks = 0;
  const text = ctx.files['LINKAGE.md'];
  if (!text) {
    ctx.notes.push('没有 LINKAGE.md，点链登记表未核对（LINKAGE 存在性由 check-mapping 的 MXV2-4-11 判）');
    return { checks: 1, issues };
  }
  const t = findTable(text, (x) => x.header.includes('起点编号') && x.header.includes('终点编号'));
  if (!t) {
    issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, msg: 'LINKAGE.md 找不到含起点编号与终点编号的点链表' });
    return { checks: 1, issues };
  }
  checks++;
  if (t.header.length !== 8) {
    issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: t.line, msg: `LINKAGE 列为 ${t.header.length}，应八列` });
  }
  const ids = new Set(ctx.pointFiles.map((p) => p.rel.split('/').at(-1).replace(/\.md$/, '')));
  const STATUSES = new Set(['草稿', '已确认', '已撤销']);
  const BASE = /^(1:1|1:N|N:1|N:M)$/;
  t.rows.forEach((row, idx) => {
    checks++;
    if (row.cells.some((c) => c === '')) {
      issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行有空列` });
    }
    if ((row.cells[0] ?? '').trim() !== String(idx + 1)) {
      issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行序号应写作 ${idx + 1}` });
    }
    for (const [label, raw] of [['起点', row.cells[1] ?? ''], ['终点', row.cells[2] ?? '']]) {
      const ref = raw.includes(':') ? raw.split(':').at(-1) : raw;
      if (!POINT_RE.test(ref)) {
        issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行${label}编号不是点编号：「${raw}」` });
        continue;
      }
      if (raw.includes(':')) {
        const other = join(ctx.root, 'specs/changes', raw.split(':')[0], 'points', `${ref}.md`);
        if (!existsSync(other)) {
          issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行引用的跨包点文件不存在：${raw}` });
        }
        continue;
      }
      if (!ids.has(ref)) {
        issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行引用的点文件不存在：${ref}（应有 points/${ref}.md）` });
      }
    }
    const status = (row.cells[7] ?? '').trim();
    if (status && !STATUSES.has(status)) {
      issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行状态「${status}」不在草稿、已确认、已撤销三值内` });
    }
    const base = (row.cells[3] ?? '').trim();
    if (base && !BASE.test(base)) {
      issues.push({ rule: 'MXV2-4-10', file: `${ctx.dirRel}/LINKAGE.md`, line: row.line, msg: `LINKAGE 第 ${idx + 1} 行基数「${base}」不在 1:1、1:N、N:1、N:M 四值内` });
    }
  });
  return { checks, issues };
}

function checkDispatch(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.taskTable) {
    if (ctx.files['tasks.md']) issues.push({ rule: 'MXV2-4-12', file: `${ctx.dirRel}/tasks.md`, msg: '没有 owner 列的任务表' });
    else ctx.notes.push('没有 tasks.md，派单卡未核对');
    return { checks: 1, issues };
  }
  checks++;
  for (const col of CARD_COLUMNS) {
    if (!ctx.taskTable.header.some((h) => h === col || h.startsWith(col))) {
      issues.push({ rule: 'MXV2-4-12', file: `${ctx.dirRel}/tasks.md`, msg: `任务表缺列「${col}」` });
    }
  }
  for (const row of ctx.taskTable.rows) {
    checks++;
    const ac = row.cells[ctx.taskTable.header.findIndex((h) => h.startsWith('AC'))] ?? '';
    if (!/AC-[A-Z0-9-]+/.test(ac)) issues.push({ rule: 'MXV2-4-12', file: `${ctx.dirRel}/tasks.md`, line: row.line, msg: '任务行没有 AC 编号' });
    const scope = row.cells[ctx.taskTable.header.findIndex((h) => h.startsWith('写作用域') || h === 'scope')] ?? '';
    if (!scope) issues.push({ rule: 'MXV2-4-12', file: `${ctx.dirRel}/tasks.md`, line: row.line, msg: 'scope 为空' });
  }
  return { checks, issues };
}

function checkSteps(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.stepTables.length) {
    ctx.notes.push('没有步骤表，步骤拆分未核对');
    return { checks: 1, issues };
  }
  for (const t of ctx.stepTables) {
    checks++;
    if (!t.header.includes('分钟') && !t.header.some((h) => h.includes('分钟'))) {
      issues.push({ rule: 'MXV2-4-14', file: `${ctx.dirRel}/tasks.md`, line: t.line, msg: '步骤表没有「分钟」列' });
    }
    const nums = t.rows
      .map((r) => (r.cells[0] ?? '').match(/^(?:S|T\d+-)(\d+)$/))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1] + 1) issues.push({ rule: 'MXV2-4-14', file: `${ctx.dirRel}/tasks.md`, line: t.rows[i]?.line, msg: `步骤号不连续：${nums[i - 1]} 之后是 ${nums[i]}` });
    }
  }
  return { checks, issues };
}

function checkGrading(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.changeId) {
    ctx.notes.push('没有变更包，判级字段未核对');
    return { checks: 1, issues };
  }
  checks++;
  const proposal = ctx.files['proposal.md'] ?? '';
  const combined = `${proposal}\n${ctx.files['change.md'] ?? ''}`;
  for (const key of ['主类型', '附加类型', '非目标', '影响面', '判级理由']) {
    if (!combined.includes(key)) issues.push({ rule: 'MXV2-5-02', file: ctx.dirRel, msg: `判级缺字段「${key}」` });
  }
  if (/感觉像|应该属于|大概/.test(proposal)) issues.push({ rule: 'MXV2-5-02', file: `${ctx.dirRel}/proposal.md`, msg: '判级理由出现「感觉像」这类说法' });
  return { checks, issues };
}

function checkSeverity(ctx) {
  const issues = [];
  let checks = 0;
  const main = ctx.changeMap.get('主类型') ?? ctx.changeMap.get('类型判级') ?? '';
  if (!/缺陷|修复|bug|Bug/.test(main)) {
    ctx.notes.push('本次变更不是缺陷修复，严重级别未核对');
    return { checks: 1, issues };
  }
  checks++;
  const text = `${ctx.files['proposal.md'] ?? ''}\n${ctx.files['change.md'] ?? ''}`;
  const sev = text.match(/严重级别[：:]\s*(\S+)/);
  if (!sev) issues.push({ rule: 'MXV2-5-07', file: ctx.dirRel, msg: '缺陷修复缺严重级别行' });
  else if (!['致命', '严重', '一般', '轻微'].includes(sev[1])) issues.push({ rule: 'MXV2-5-07', file: ctx.dirRel, msg: `严重级别「${sev[1]}」不在四值内` });
  if (!/判定依据[：:]/.test(text)) issues.push({ rule: 'MXV2-5-07', file: ctx.dirRel, msg: '缺陷修复缺判定依据行' });
  return { checks, issues };
}

function checkFreeze(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.pointFiles.length) {
    ctx.notes.push('没有点文件，判据冻结未核对');
    return { checks: 1, issues };
  }
  for (const p of ctx.pointFiles) {
    checks++;
    const text = p.text ?? '';
    for (const field of ['冻结时间', '冻结人']) {
      if (!new RegExp(`${field}[：:]`).test(text)) issues.push({ rule: 'MXV2-6-16', file: p.rel, msg: `判据缺「${field}」` });
    }
  }
  return { checks, issues };
}

function checkReturn(ctx) {
  const issues = [];
  let checks = 0;
  const files = [];
  if (ctx.dir && existsSync(join(ctx.dir, 'return'))) {
    for (const f of readdirSync(join(ctx.dir, 'return'))) if (f.endsWith('.md')) files.push(join(ctx.dir, 'return', f));
  }
  if (!files.length) {
    ctx.notes.push('本次变更没有退回单，退回流程未核对');
    return { checks: 1, issues };
  }
  for (const f of files) {
    checks++;
    const rel = relative(ctx.root, f).replaceAll('\\', '/');
    const text = readTextSafe(f) ?? '';
    for (const field of ['AC 编号', '失败证据', '期望与实测差异', '退回对象与期限']) {
      if (!text.includes(field)) issues.push({ rule: 'MXV2-8-12', file: rel, msg: `退回单缺「${field}」` });
    }
    const status = ctx.changeMap.get('状态') ?? '';
    if (/通过/.test(status)) issues.push({ rule: 'MXV2-8-12', file: rel, msg: `退回后变更状态仍是「${status}」，未回草稿` });
  }
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-2-02', run: checkNumbering },
  { rule: 'MXV2-2-04', run: checkPointIds },
  { rule: 'MXV2-3-01', run: checkOwner },
  { rule: 'MXV2-4-08', run: checkHeader },
  { rule: 'MXV2-4-10', run: checkChain },
  { rule: 'MXV2-4-10', run: checkLinkageRefs },
  { rule: 'MXV2-4-12', run: checkDispatch },
  { rule: 'MXV2-4-14', run: checkSteps },
  { rule: 'MXV2-5-02', run: checkGrading },
  { rule: 'MXV2-5-07', run: checkSeverity },
  { rule: 'MXV2-9-03', run: checkCheckpoints },
];

const SPLIT = [
  { rule: 'MXV2-2-04', run: checkPointIds },
  { rule: 'MXV2-3-01', run: checkOwner },
  { rule: 'MXV2-3-09', run: checkCheckpoints },
  { rule: 'MXV2-4-15', run: checkCheckpoints },
  { rule: 'MXV2-6-16', run: checkFreeze },
  { rule: 'MXV2-8-12', run: checkReturn },
];

function evaluate(root, opts = {}) {
  const ctx = loadCtx(root, opts);
  const all = opts.rule ? [...CHECKS, ...SPLIT] : CHECKS;
  const selected = selectChecks(all, opts.rule);
  const { count, issues } = ctx.exists ? runChecks(selected, ctx) : { count: 1, issues: [] };
  if (ctx.pointsMissing) {
    issues.push({ rule: 'MXV2-2-04', file: `${ctx.dirRel}/points`, msg: 'points/ 目录不存在，点链无法核对' });
  }
  if (!ctx.exists) issues.push({ rule: 'MXV2-4-08', msg: `变更包目录不存在：specs/changes/${ctx.changeId}` });
  return { ctx, count, issues, summary: opts.rule ? undefined : `change ${ctx.changeId ?? 'none'}, ${issues.length} issue(s), ${ctx.notes.length} notice` };
}

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('points');
  const base = join(dir, 'repo');
  const chg = join(base, 'specs/changes/CHG-TST-001');
  mkdirSync(join(chg, 'points'), { recursive: true });
  mkdirSync(join(base, '.tmp/v2-p4'), { recursive: true });
  mkdirSync(join(base, 'docs/product'), { recursive: true });

  const change = (mut) => `# 变更包 · CHG-TST-001

## 1 头部

| 字段 | 值 |
|---|---|
| 变更号 | \`CHG-TST-001\` |
| 状态 | ${mut === 'status' ? '已上线' : '草稿'} |
| 类型判级 | 文档 |
| 规模判级 | 小 |
| owner | 撰写员 |
| 验收人 | 验收员 |
| 冻结时间 | 2026-11-27 04:00 |

主类型：文档
附加类型：无
非目标：不改代码
影响面：docs
判级理由：矩阵原句“文档改动”。
`;
  const proposal = `# 提案 · CHG-TST-001

## 1 受理

| 项 | 结论 |
|---|---|
| 用户原话 | “改文档” |
| 目标用户与场景 | 维护者改文档 |
| 非目标 | 不改代码 |
| 挂点 | P-REQ-01 |
| 验收人 | 验收员 |
| 出口层级 | 点级 |

## 2 六类专项

| 专项 | 结论 |
|---|---|
| 涉及契约项 | N/A：本次不涉及契约 |
| 数据语义处置 | N/A：无数据改动 |
| 目标指标与测量口径 | N/A：无指标 |
| 数据合规处置 | N/A：无个人数据 |
| 插件卸载清理 | N/A：不涉及插件 |
| 备份与第三方副本 | N/A：无副本 |
`;
  const taskRows = (mut) => {
    const cols = mut === 'dispatch' ? ['ID', '任务', 'Owner', '写作用域', 'AC', '证据', '状态'] : ['ID', '任务', 'Owner', '写作用域', 'AC', '证据', '状态', '档位', '禁止项'];
    const row = ['T1', '改文档', mut === 'owner' ? '撰写员、验收员' : '撰写员', '`docs/`', 'AC-TST-001-01', 'evidence.md', 'todo'];
    if (mut !== 'dispatch') row.push('high', '不改代码');
    return `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n| ${row.join(' | ')} |\n`;
  };
  const steps = (mut) => {
    const header = mut === 'steps' ? '| 步骤 | 产出 | 验收 | 状态 |' : '| 步骤 | 产出 | 分钟 | 验收 | 状态 |';
    const r1 = mut === 'steps' ? '| S1 | 草案 | 自查 | done |' : '| S1 | 草案 | 15 | 自查 | done |';
    const r2 = mut === 'steps' ? '| S3 | 定稿 | 自查 | done |' : '| S2 | 定稿 | 15 | 自查 | done |';
    return `${header}\n| ${header.split('|').slice(1, -1).map(() => '---').join(' | ')} |\n${r1}\n${r2}\n`;
  };
  const point = (id, up) => `# ${id}

- 点编号：${id}
- 本点编号：${id}
- 上游点：${up}
- owner：需求方
- 冻结时间：2026-11-27 04:10
- 冻结人：判定员
- 建立时间：2026-11-27 04:05
`;
  const linkage = (mut) => `# LINKAGE · CHG-TST-001

| 序号 | 起点编号 | 终点编号 | 基数 | 原因 | 登记人 | 日期 | 状态 |
|---|---|---|---|---|---|---|---|
| 1 | ${mut === 'linkmissing' ? 'P-RUL-02' : 'P-RUL-01'} | ${mut === 'linkmissing' ? 'P-ACC-02' : 'P-ACC-01'} | 1:1 | 默认一对一 | 撰写员 | 2026-11-27 | 草稿 |
`;
  const checkpoint = (mut) => `# 检查点

- 步骤号：S2
- 状态：进行中
- 已完成：草案
- 未完成：定稿
${mut === 'checkpoint' ? '' : '- 证据路径：.tmp/v2-p4/gate-run.md\n'}- 下一步：写定稿
- 更新时间：2026-11-27 04:50

\`\`\`
$ git status --short
?? docs/a.md
$ git diff --stat
 1 file changed
\`\`\`
`;

  const build = (mut) => {
    writeFileSync(join(chg, 'change.md'), change(mut));
    writeFileSync(join(chg, 'proposal.md'), proposal);
    writeFileSync(join(chg, 'spec.md'), '# 规格 · CHG-TST-001\n');
    writeFileSync(join(chg, 'tasks.md'), `# 任务 · CHG-TST-001\n\n## 任务表\n\n${taskRows(mut)}\n## 步骤\n\n${steps(mut)}`);
    writeFileSync(join(chg, 'points/P-REQ-01.md'), point('P-REQ-01', '无'));
    writeFileSync(join(chg, 'points/P-SRC-01.md'), point('P-SRC-01', 'P-REQ-01'));
    writeFileSync(join(chg, 'points/P-JUD-01.md'), point('P-JUD-01', 'P-SRC-01'));
    writeFileSync(join(chg, 'points/P-RUL-01.md'), point('P-RUL-01', 'P-JUD-01'));
    writeFileSync(join(chg, 'points/P-ACC-01.md'), point('P-ACC-01', 'P-RUL-01'));
    writeFileSync(join(chg, 'LINKAGE.md'), linkage(mut));
    writeFileSync(join(base, '.tmp/v2-p4/checkpoint.md'), checkpoint(mut));
    return base;
  };

  const good = evaluate(build('good'), { change: 'CHG-TST-001', checkpoint: '.tmp/v2-p4/checkpoint.md' });
  a.assert(good.issues.length === 0, `通过夹具零问题（实际 ${good.issues.length}：${good.issues.map((i) => i.rule + ' ' + i.msg).join(' | ')}）`);
  a.assert(good.count >= 10, `检查项数覆盖派单、步骤与检查点（实际 ${good.count}）`);

  const cases = [
    ['dispatch', 'MXV2-4-12', '缺列'],
    ['steps', 'MXV2-4-14', '分钟'],
    ['owner', 'MXV2-3-01', '两个角色'],
    ['status', 'MXV2-4-08', '不在四值内'],
    ['checkpoint', 'MXV2-4-15', '证据路径'],
    ['linkmissing', 'MXV2-4-10', '引用的点文件不存在'],
  ];
  for (const [mut, rule, needle] of cases) {
    const r = evaluate(build(mut), { change: 'CHG-TST-001', checkpoint: '.tmp/v2-p4/checkpoint.md' });
    a.assert(r.issues.some((i) => i.rule === rule && i.msg.includes(needle)), `${mut} 命中 ${rule}（${needle}）`);
  }

  const single = evaluate(build('good'), { change: 'CHG-TST-001', rule: 'MXV2-4-12', checkpoint: '.tmp/v2-p4/checkpoint.md' });
  a.assert(single.count === 2 && single.issues.length === 0, `--rule 单条模式 checks=${single.count}`);
  a.assert(single.summary === undefined, '--rule 模式不打印全册摘要');

  const missing = evaluate(join(dir, 'empty'), { change: 'CHG-NONE-999' });
  a.assert(missing.issues.length === 1 && missing.issues[0].msg.includes('不存在'), '不存在的变更包被拦下');

  const listOut = [];
  const orig = console.log;
  console.log = (s) => listOut.push(s);
  const mode = resolveRuleMode({ listRules: true, rule: null }, RULES, NAME);
  console.log = orig;
  a.assert(mode.code === 0 && listOut.join('\n').includes('MXV2-9-03'), '--list-rules 列出十四条规则');
  a.assert(resolveRuleMode({ listRules: false, rule: 'MXV2-1-01' }, RULES, NAME).code === 2, '不覆盖的规则号退出码 2');
  const np = join(dir, 'nopoints', 'repo');
  mkdirSync(join(np, 'specs/changes/CHG-TST-001'), { recursive: true });
  mkdirSync(join(np, 'docs/product'), { recursive: true });
  writeFileSync(join(np, 'specs/changes/CHG-TST-001/change.md'), change('good'));
  writeFileSync(join(np, 'specs/changes/CHG-TST-001/proposal.md'), proposal);
  writeFileSync(join(np, 'specs/changes/CHG-TST-001/spec.md'), '# 规格 · CHG-TST-001\n');
  const nopoints = evaluate(np, { change: 'CHG-TST-001', rule: 'MXV2-2-04' });
  a.assert(nopoints.issues.some((x) => x.msg.includes('points/ 目录不存在')), 'points 目录缺失报 error 而不是静默放过');

  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  try {
    const result = evaluate(process.cwd(), { change: args.change, rule: args.rule, checkpoint: args.checkpoint });
    for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
    process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
  } catch (err) {
    console.error(`${NAME}: ${err.message}`);
    process.exit(2);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-points.mjs')) main();
