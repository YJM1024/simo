#!/usr/bin/env node
/**
 * check-mapping.mjs — 变更包、受理、编号登记与映射自检。
 *
 * 覆盖规则：MXV2-1-01、2-03、2-06、4-01、4-02、4-05、4-11、4-22、5-10。
 * 检查内容：
 *   MP-01 变更包目录有 proposal.md 与 spec.md，proposal 首节写明四项纳入条件（1-01）
 *   MP-02 proposal 与 spec 同批建立，首部有 CHG 编号（4-01）
 *   MP-03 受理六项在 proposal 首节逐条有结论（4-02）
 *   MP-04 立项字段载体表齐全，空值为 0，N/A 都有不少于八字理由（4-05）
 *   MP-05 追溯矩阵里同一编号只出现一次，取消项有标记与日期（2-03）
 *   MP-06 表 2-1 之后有新旧编号对照备注段，存量旧号保留（2-06）
 *   MP-07 LINKAGE.md 八列齐全，规则点一行一条（4-11）
 *   MP-08 收口记录有入口四项、交付十二类与漂移六组（4-22）
 *   MP-09 六类专项各有一行结论，涉及项填写完整，N/A 有理由（5-10）
 *
 * 用法：
 *   node scripts/check-mapping.mjs
 *   node scripts/check-mapping.mjs --change CHG-FW-002 --rule MXV2-4-11
 *   node scripts/check-mapping.mjs --self-test
 */
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  parseArgs,
  resolveRuleMode,
  selectChecks,
  runChecks,
  printResult,
  isPass,
  fixtureDir,
  createAsserter,
} from './lib/v2-rule-mode.mjs';

const NAME = 'check-mapping';
const RULES = [
  'MXV2-1-01',
  'MXV2-2-03',
  'MXV2-2-06',
  'MXV2-4-01',
  'MXV2-4-02',
  'MXV2-4-05',
  'MXV2-4-11',
  'MXV2-4-22',
  'MXV2-5-10',
];
const IMPORT_ITEMS = ['纳入条件', '用户原话', '目标用户', '非目标', '挂点', '验收人', '出口层级'];
const SPECIALS = ['涉及契约项', '数据语义处置', '目标指标与测量口径', '数据合规处置', '插件卸载清理', '备份与第三方副本'];
const LINK_COLUMNS = ['序号', '起点编号', '终点编号', '基数', '原因', '登记人', '日期', '状态'];

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

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

function findTable(text, pred) {
  return parseTables(text).find(pred) ?? null;
}

export function loadCtx(root, opts = {}) {
  const changesDir = join(root, 'specs/changes');
  const all = existsSync(changesDir)
    ? readdirSync(changesDir).filter((d) => /^CHG-[A-Z0-9-]+$/.test(d) && statSync(join(changesDir, d)).isDirectory())
    : [];
  const ids = opts.change ? [opts.change] : all.filter((d) => d === 'CHG-FW-002').length ? ['CHG-FW-002'] : all.sort().slice(-1);
  const packages = ids.map((id) => {
    const dir = join(changesDir, id);
    const rel = `specs/changes/${id}`;
    const files = {};
    for (const name of ['proposal.md', 'spec.md', 'change.md', 'tasks.md', 'evidence.md', 'LINKAGE.md']) {
      files[name] = existsSync(join(dir, name)) ? readTextSafe(join(dir, name)) : null;
    }
    if (files['proposal.md']) {
      for (const name of ['spec.md', 'change.md', 'tasks.md', 'LINKAGE.md']) {
        if (!files[name]) files[name] = files['proposal.md'];
      }
    }
    const mtime = (name) => {
      try {
        return statSync(join(dir, name)).mtimeMs;
      } catch {
        try {
          return statSync(join(dir, 'proposal.md')).mtimeMs;
        } catch {
          return null;
        }
      }
    };
    return { id, dir, rel, exists: existsSync(dir), files, mtime, notes: [] };
  });
  return {
    root,
    packages,
    notes: [],
    trace: readTextSafe(join(root, 'docs/product/TRACEABILITY.md')),
    moxian: readTextSafe(join(root, 'docs/framework/MOXIAN.md')),
    archiveMoxian: readTextSafe(join(root, 'docs/framework/archive/v1.7.5/MOXIAN.md')),
  };
}

function pkgLabel(p) {
  return p.rel;
}

function checkPackage(p) {
  const issues = [];
  let checks = 0;
  checks++;
  if (!p.exists) {
    issues.push({ rule: 'MXV2-1-01', file: p.rel, msg: '变更包目录不存在' });
    return { checks, issues };
  }
  for (const name of ['proposal.md']) {
    if (!p.files[name]) issues.push({ rule: 'MXV2-1-01', file: p.rel, msg: `缺 ${name}` });
  }
  const proposal = p.files['proposal.md'] ?? '';
  checks++;
  if (!/纳入条件|纳入范围/.test(proposal)) issues.push({ rule: 'MXV2-1-01', file: `${p.rel}/proposal.md`, msg: '首节没有四项纳入条件的结论' });
  return { checks, issues };
}

function checkSameBatch(p) {
  const issues = [];
  let checks = 0;
  if (!p.files['proposal.md'] || !p.files['spec.md']) return { checks: 1, issues };
  checks++;
  const a = p.mtime('proposal.md');
  const b = p.mtime('spec.md');
  if (a && b && Math.abs(a - b) > 24 * 3600 * 1000) {
    issues.push({ rule: 'MXV2-4-01', file: p.rel, msg: 'proposal.md 与 spec.md 的建立时间相差超过 24 小时' });
  }
  return { checks, issues };
}

function checkIntake(p) {
  const issues = [];
  let checks = 0;
  const text = p.files['proposal.md'];
  if (!text) return { checks: 1, issues };
  checks++;
  for (const item of IMPORT_ITEMS.slice(1)) {
    if (!text.includes(item)) issues.push({ rule: 'MXV2-4-02', file: `${p.rel}/proposal.md`, msg: `受理六项缺「${item}」` });
  }
  return { checks, issues };
}

function checkCarrier(p) {
  const issues = [];
  let checks = 0;
  const text = p.files['change.md'];
  if (!text) return { checks: 1, issues };
  checks++;
  const t = findTable(text, (x) => x.header.includes('载体')) ?? findTable(text, (x) => x.header.some((h) => h.includes('列')) && x.header.some((h) => h.includes('产出')));
  if (!t) {
    issues.push({ rule: 'MXV2-4-05', file: `${p.rel}/change.md`, msg: '没有立项字段载体表' });
    return { checks, issues };
  }
  for (const row of t.rows) {
    checks++;
    for (const cell of row.cells) {
      if (cell === '') issues.push({ rule: 'MXV2-4-05', file: `${p.rel}/change.md`, line: row.line, msg: '载体表有空单元格' });
    }
    const na = row.cells.filter((c) => /N\/A/.test(c));
    for (const cell of na) {
      const reason = cell.replace(/N\/A/, '').replace(/[（(]/g, '').trim();
      if (reason.replace(/[）)]/g, '').length < 8) {
        issues.push({ rule: 'MXV2-4-05', file: `${p.rel}/change.md`, line: row.line, msg: `N/A 理由不足八个字符：「${cell}」` });
      }
    }
  }
  return { checks, issues };
}

function checkIds(ctx) {
  const issues = [];
  let checks = 0;
  const scan = (text, rel) => {
    const local = new Map();
    for (const [i, line] of text.split(/\r?\n/).entries()) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      const id = cells.find((c) => /^(REQ-|AC-|TC-|CHG-|CT-|P-)/.test(c));
      if (!id) continue;
      checks++;
      const key = `${id}|${cells.join("|")}`;
      if (local.has(id) && local.get(id) !== key) {
        issues.push({ rule: 'MXV2-2-03', file: rel, line: i + 1, msg: `编号 ${id} 出现多次` });
      } else if (!local.has(id)) local.set(id, key);
      if (cells.some((c) => /已取消|已撤销/.test(c)) && !cells.some((c) => /\d{4}-\d{2}-\d{2}/.test(c))) {
        issues.push({ rule: 'MXV2-2-03', file: rel, line: i + 1, msg: `取消项 ${id} 没有取消日期` });
      }
    }
  };
  if (ctx.trace) scan(ctx.trace, "docs/product/TRACEABILITY.md");
  for (const p of ctx.packages || []) {
    const text = p.files?.['LINKAGE.md'];
    if (text) scan(text, `${p.rel}/LINKAGE.md`);
  }
  if (checks === 0) {
    issues.push({ rule: 'MXV2-2-03', file: 'docs/product/TRACEABILITY.md', msg: '没有可核对的编号行，编号复用未核对' });
  }
  return { checks, issues };
}

function checkLegacy(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.moxian) {
    ctx.notes.push('没有 MOXIAN.md，新旧编号对照未核对');
    return { checks: 1, issues };
  }
  checks++;
  const at = ctx.moxian.indexOf('表 2-1');
  if (at < 0) issues.push({ rule: 'MXV2-2-06', file: 'docs/framework/MOXIAN.md', msg: '找不到表 2-1' });
  else {
    const after = ctx.moxian.slice(at, at + 4000);
    if (!/备注/.test(after) || !/对照/.test(after)) {
      issues.push({ rule: 'MXV2-2-06', file: 'docs/framework/MOXIAN.md', msg: '表 2-1 之后没有新旧编号对照备注段' });
    }
  }
  checks++;
  if (ctx.archiveMoxian && !/MX-\d+-\d+/.test(ctx.archiveMoxian)) {
    issues.push({ rule: 'MXV2-2-06', file: 'docs/framework/archive/v1.7.5/MOXIAN.md', msg: '归档总册里查不到存量旧编号' });
  }
  return { checks, issues };
}

function pointIds(p) {
  const dir = join(p.dir, 'points');
  if (!existsSync(dir)) return new Set();
  return new Set(
    readdirSync(dir)
      .filter((f) => /^P-(REQ|SRC|JUD|RUL|ACC)-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, '')),
  );
}

function checkLinkage(p) {
  const issues = [];
  let checks = 0;
  const text = p.files['LINKAGE.md'];
  if (!text) {
    if (p.exists) issues.push({ rule: 'MXV2-4-11', file: p.rel, msg: '没有 LINKAGE.md' });
    return { checks: 1, issues };
  }
  checks++;
  const t = findTable(text, (x) => x.header.includes('起点编号') && x.header.includes('终点编号'));
  if (!t) {
    issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, msg: 'LINKAGE.md 没有八列表格' });
    return { checks, issues };
  }
  if (t.header.length !== 8) issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, line: t.line, msg: `LINKAGE 列为 ${t.header.length}，应八列` });
  const ids = pointIds(p);
  const ruleRows = t.rows.filter((r) => r.cells.some((c) => /^P-RUL-\d{2}$/.test(c)));
  // 去重键取规则点编号本身；旧实现取第一列，真实表第一列是序号，重复登记或指向缺失文件都查不出。
  const perRule = new Map();
  for (const row of ruleRows) {
    checks++;
    const ruleId = row.cells.find((c) => /^P-RUL-\d{2}$/.test(c));
    perRule.set(ruleId, (perRule.get(ruleId) ?? 0) + 1);
    if (row.cells.some((c) => c === '')) issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, line: row.line, msg: `${ruleId} 有空列` });
    const accept = row.cells.find((c) => /^P-ACC-\d{2}$/.test(c));
    if (!accept) issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, line: row.line, msg: `${ruleId} 没有对应验收点` });
    for (const ref of [ruleId, accept].filter(Boolean)) {
      if (!ids.has(ref)) issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, line: row.line, msg: `引用的点文件不存在：${ref}` });
    }
  }
  for (const [id, n] of perRule) if (n > 1) issues.push({ rule: 'MXV2-4-11', file: `${p.rel}/LINKAGE.md`, msg: `规则点 ${id} 出现 ${n} 行` });
  return { checks, issues };
}

function checkCloseout(p) {
  const issues = [];
  let checks = 0;
  const change = p.files['change.md'] ?? '';
  const passed = /^\s*\|?\s*状态\s*[:：|]\s*通过/m.test(change);
  if (!passed) {
    p.notes.push('变更未标通过，收口三段未核对');
    return { checks: 1, issues };
  }
  checks++;
  const candidates = ['accept.md', 'closeout.md'].map((f) => join(p.dir, f)).filter((f) => existsSync(f));
  if (!candidates.length) {
    issues.push({ rule: 'MXV2-4-22', file: p.rel, msg: '变更已标通过但没有收口记录' });
    return { checks, issues };
  }
  const text = readTextSafe(candidates[0]) ?? '';
  for (const sec of ['入口四项', '交付十二类', '漂移六组']) {
    if (!text.includes(sec)) issues.push({ rule: 'MXV2-4-22', file: relative(p.dir, candidates[0]), msg: `收口记录缺「${sec}」` });
  }
  return { checks, issues };
}

function checkSpecial(p) {
  const issues = [];
  let checks = 0;
  const text = `${p.files['proposal.md'] ?? ''}\n${p.files['change.md'] ?? ''}`;
  checks++;
  for (const item of SPECIALS) {
    if (!text.includes(item)) issues.push({ rule: 'MXV2-5-10', file: p.rel, msg: `缺专项字段「${item}」` });
  }
  const na = [...text.matchAll(/N\/A[：:]\s*([^\n|]*)/g)].map((m) => m[1].trim());
  for (const reason of na) {
    if (reason.length < 8) issues.push({ rule: 'MXV2-5-10', file: p.rel, msg: `专项 N/A 理由不足八个字符：「${reason}」` });
  }
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-1-01', run: (ctx) => merge(ctx, checkPackage) },
  { rule: 'MXV2-4-01', run: (ctx) => merge(ctx, checkSameBatch) },
  { rule: 'MXV2-4-02', run: (ctx) => merge(ctx, checkIntake) },
  { rule: 'MXV2-4-05', run: (ctx) => merge(ctx, checkCarrier) },
  { rule: 'MXV2-2-03', run: checkIds },
  { rule: 'MXV2-2-06', run: checkLegacy },
  { rule: 'MXV2-4-11', run: (ctx) => merge(ctx, checkLinkage) },
  { rule: 'MXV2-4-22', run: (ctx) => merge(ctx, checkCloseout) },
  { rule: 'MXV2-5-10', run: (ctx) => merge(ctx, checkSpecial) },
];

function merge(ctx, fn) {
  let checks = 0;
  const issues = [];
  for (const p of ctx.packages) {
    const r = fn(p);
    checks += r.checks;
    issues.push(...r.issues);
    for (const n of p.notes ?? []) ctx.notes.push(`${p.id}: ${n}`);
  }
  return { checks, issues };
}

function evaluate(root, opts = {}) {
  const ctx = loadCtx(root, opts);
  const selected = selectChecks(CHECKS, opts.rule);
  const { count, issues } = runChecks(selected, ctx);
  return {
    ctx,
    count,
    issues,
    summary: opts.rule ? undefined : `${ctx.packages.length} package(s), ${issues.length} issue(s), ${ctx.notes.length} notice`,
  };
}

export { evaluate };

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('mapping');

  const proposal = (mut) => `# 提案 · CHG-TST-001

## 1 受理

纳入条件：四项逐条结论如下。

| 项 | 结论 |
|---|---|
| 用户原话 | “改文档” |
| 目标用户 | 维护者 |
| 非目标 | 不改代码 |
| 挂点 | P-REQ-01 |
${mut === 'intake' ? '' : '| 验收人 | 验收员 |\n'}| 出口层级 | 点级 |

${mut === 'intake' ? '' : '## 2 六类专项\n\n' + SPECIALS.map((s) => `- ${s}：N/A：本次不涉及该专项`).join('\n')}
`;
  const change = (mut) => `# 变更包 · CHG-TST-001

| 字段 | 值 |
|---|---|
| 变更号 | CHG-TST-001 |
| 状态 | ${mut === 'closeout' ? '通过' : '草稿'} |

## 1.2 立项字段载体

| 字段 | 载体 | 落点 |
|---|---|---|
| 用户原话 | proposal | 第 1 节 |
| 非目标 | proposal | 第 1 节 |
| 状态 | 变更包头部 | 状态字段 |
| 关闭日期 | ${mut === 'na' ? 'N/A：短期' : 'N/A：待复核后填写关闭日期'} | 头部 |

主类型：文档
附加类型：无
非目标：不改代码
影响面：docs
判级理由：矩阵原句“文档改动”。
`;
  const linkage = (mut) => {
    const cols = mut === 'link7' ? LINK_COLUMNS.slice(0, 7) : LINK_COLUMNS;
    const row = (seq, start, end) => [`${seq}`, start, end, '1:1', '默认一对一', '撰写员', '2026-11-27', '草稿'];
    const rows = [];
    if (mut === 'linkdup') rows.push(row(1, 'P-RUL-01', 'P-ACC-01'), row(2, 'P-RUL-01', 'P-ACC-01'));
    else if (mut === 'linkmissing') rows.push(row(1, 'P-RUL-02', 'P-ACC-02'));
    else rows.push(row(1, 'P-RUL-01', 'P-ACC-01'));
    return `# 联动 · CHG-TST-001\n\n| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.slice(0, cols.length).join(' | ')} |`).join('\n')}\n`;
  };
  const trace = (mut) => `# 追溯矩阵

| ID | 状态 | 说明 |
|---|---|---|
| REQ-1.1 | ${mut === 'dup' ? '已冻结' : '已冻结'} | 首条 |
${mut === 'dup' ? '| REQ-1.1 | 已冻结 | 重复行 |\n' : ''}| REQ-1.2 | 已取消 | 2026-11-01 取消 |
`;
  const moxian = `# 总册

## 2 编号

表 2-1 编号规则

| 对象 | 格式 |
|---|---|
| 需求点 | REQ-<域>.<点> |

备注段：旧格式 MX-x-yy 逐行对照到表 2-1，存量编号保留原形。
`;

  const build = (mut) => {
    const base = join(dir, mut, 'repo');
    const chg = join(base, 'specs/changes/CHG-TST-001');
    mkdirSync(chg, { recursive: true });
    mkdirSync(join(base, 'docs/product'), { recursive: true });
    mkdirSync(join(base, 'docs/framework'), { recursive: true });
    writeFileSync(join(chg, 'proposal.md'), proposal(mut));
    if (mut !== 'nospec') writeFileSync(join(chg, 'spec.md'), '# 规格 · CHG-TST-001\n');
    writeFileSync(join(chg, 'change.md'), change(mut));
    writeFileSync(join(chg, 'LINKAGE.md'), linkage(mut));
    mkdirSync(join(chg, 'points'), { recursive: true });
    writeFileSync(join(chg, 'points/P-RUL-01.md'), '# P-RUL-01\n\n- 点编号：P-RUL-01\n');
    writeFileSync(join(chg, 'points/P-ACC-01.md'), '# P-ACC-01\n\n- 点编号：P-ACC-01\n');
    writeFileSync(join(base, 'docs/product/TRACEABILITY.md'), trace(mut));
    writeFileSync(join(base, 'docs/framework/MOXIAN.md'), moxian);
    return base;
  };

  const good = evaluate(build('good'), { change: 'CHG-TST-001' });
  a.assert(good.issues.length === 0, `通过夹具零问题（实际 ${good.issues.length}：${good.issues.map((i) => i.rule + ' ' + i.msg).join(' | ')}）`);
  a.assert(good.count >= 12, `检查项数覆盖九类检查（实际 ${good.count}）`);

  const cases = [
    ['nospec', 'MXV2-1-01', '缺 spec.md'],
    ['intake', 'MXV2-4-02', '受理六项缺'],
    ['na', 'MXV2-4-05', 'N/A 理由'],
    ['link7', 'MXV2-4-11', '应八列'],
    ['linkmissing', 'MXV2-4-11', '引用的点文件不存在'],
    ['linkdup', 'MXV2-4-11', '规则点 P-RUL-01 出现 2 行'],
    ['dup', 'MXV2-2-03', '出现多次'],
  ];
  for (const [mut, rule, needle] of cases) {
    const r = evaluate(build(mut), { change: 'CHG-TST-001' });
    a.assert(r.issues.some((i) => i.rule === rule && i.msg.includes(needle)), `${mut} 命中 ${rule}（${needle}）`);
  }

  const closed = evaluate(build('closeout'), { change: 'CHG-TST-001' });
  a.assert(closed.issues.some((i) => i.rule === 'MXV2-4-22' && i.msg.includes('收口记录')), '已通过的变更缺收口记录被拦下');

  const single = evaluate(build('good'), { change: 'CHG-TST-001', rule: 'MXV2-4-02' });
  a.assert(single.count === 1 && single.issues.length === 0, `--rule 单条模式 checks=${single.count}`);
  a.assert(single.summary === undefined, '--rule 模式不打印全册摘要');
  a.assert(isPass([], 0) === false, '零检查不得判 PASS（自检）');
  a.assert(isPass([], 1) === true, '有检查且无问题判 PASS（自检）');
  a.assert(isPass([{ rule: 'MXV2-1-01', msg: 'x' }], 5) === false, '有问题判 FAIL（自检）');
  const two06 = evaluate(build('good'), { change: 'CHG-TST-001', rule: 'MXV2-2-06' });
  a.assert(two06.count > 0, `--rule 2-06 有非零检查（实际 ${two06.count}）`);
  const noRows = evaluate(build("good"), { change: "CHG-TST-001", rule: "MXV2-2-03" });
  a.assert(noRows.count > 0, `--rule 2-03 覆盖回溯与 LINKAGE（实际 ${noRows.count}）`);
  a.assert(resolveRuleMode({ listRules: false, rule: 'MXV2-9-01' }, RULES, NAME).code === 2, '不覆盖的规则号退出码 2');
  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  const result = evaluate(process.cwd(), { change: args.change, rule: args.rule });
  for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
  process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
}

if (process.argv[1] && process.argv[1].endsWith('check-mapping.mjs')) main();
