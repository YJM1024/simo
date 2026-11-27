#!/usr/bin/env node
/**
 * check-archive.mjs — 归档完整性、附录 D 修订登记、回写补丁与复盘自检。
 *
 * 覆盖规则：MXV2-1-11、3-13、4-23、9-15。
 * 检查内容：
 *   AR-01 附录 D 修订行数与四字段，条号仍落在章区间（1-11）
 *   AR-02 附录 D 的角色卡修订行与 ROLES.md 唯一正文（3-13）
 *   AR-03 归档索引三处标记、12 行、只读说明（4-23）
 *   AR-04 归档目录逐文件哈希与 INDEX 一致（4-23）
 *   AR-05 回写补丁五列、十至二十行、复核签字（4-23）
 *   AR-06 复盘文件名、七节与篇幅（9-15）
 *
 * 用法：
 *   node scripts/check-archive.mjs
 *   node scripts/check-archive.mjs --archive docs/framework/archive/v1.7.5
 *   node scripts/check-archive.mjs --rule MXV2-4-23 --self-test
 */
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

const NAME = 'check-archive';
const RULES = ['MXV2-1-11', 'MXV2-3-13', 'MXV2-4-23', 'MXV2-9-15'];
const RETRO_SECTIONS = ['目标与实际', '时间账', '成本账', '卡点与根因', '可复用经验', '改进项', '预估校准'];
const PATCH_COLUMNS = ['文件', '行号', '原文', '新文', '理由'];
const CLOSURE_FIELDS = ['变更编号', '关闭结论', '关闭人', '关闭时间', '附加口径'];
const CLOSURE_CONDITIONS = ['全部 AC 为 pass', '证据完整', '复盘七节齐全', '索引更新', '签字齐全', '无未决漂移'];

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

export function loadCtx(root, opts = {}) {
  const archive = opts.archive ?? 'docs/framework/archive/v1.7.5';
  const archiveDir = join(root, archive);
  const index = readTextSafe(join(archiveDir, 'INDEX.md'));
  const appendixD = readTextSafe(join(root, 'docs/framework/v2/APPENDIX-D.md'));
  const appendixC = readTextSafe(join(root, 'docs/framework/v2/APPENDIX-C.md'));
  const changelog = readTextSafe(join(root, 'docs/framework/v2/CHANGELOG.md'));
  const retros = [];
  const planDir = join(root, 'docs/plan');
  if (existsSync(planDir)) {
    for (const f of readdirSync(planDir)) {
      if (!/^RETRO-.*\.md$/.test(f)) continue;
      retros.push({ name: f, rel: `docs/plan/${f}`, text: readTextSafe(join(planDir, f)) });
    }
  }
  const patches = [];
  const tmpDir = join(root, '.tmp');
  if (existsSync(tmpDir)) {
    for (const d of readdirSync(tmpDir)) {
      const dir = join(tmpDir, d);
      if (!statSync(dir).isDirectory()) continue;
      for (const f of readdirSync(dir)) {
        if (!/patch.*\.md$|回写.*\.md$/.test(f)) continue;
        const p = join(dir, f);
        patches.push({ rel: relative(root, p).replaceAll('\\', '/'), text: readTextSafe(p) });
      }
    }
  }
  const closures = [];
  const changesDir = join(root, 'specs/changes');
  if (existsSync(changesDir)) {
    for (const d of readdirSync(changesDir)) {
      const f = join(changesDir, d, 'closure.md');
      if (existsSync(f)) {
        closures.push({ id: d, rel: `specs/changes/${d}/closure.md`, text: readTextSafe(f) ?? '' });
        continue;
      }
      // 2026-11-27 起关闭记录并入 proposal.md 的「收口」节；没有独立 closure.md 时
      // 从该节取字段表与六条件表，仍按同一套字段与状态校验，不放宽也不跳过。
      const merged = join(changesDir, d, 'proposal.md');
      if (!existsSync(merged)) continue;
      const text = readTextSafe(merged) ?? '';
      const section = text.match(/^##\s+\d*\s*收口[^\n]*\n([\s\S]*?)(?=\n##\s|(?![^])$)/m);
      if (!section) continue;
      // 只认写全关闭字段表与六条件表的「收口」节；其余包的收口小节是流程说明，
      // 没有关闭记录可审，跳过而不是拿它充数。
      const body = section[1];
      const hasFieldTable = /^\|\s*字段\s*\|\s*值\s*\|/m.test(body);
      const hasConditionTable = /^\|\s*条件\s*\|\s*状态\s*\|/m.test(body);
      if (!hasFieldTable || !hasConditionTable) continue;
      closures.push({ id: d, rel: `specs/changes/${d}/proposal.md#收口`, text: body });
    }
  }
  return {
    root,
    archive,
    archiveDir,
    index,
    appendixD,
    appendixC,
    changelog,
    retros,
    patches,
    closures,
    notes: [],
    verified: { ok: 0, total: 0 },
  };
}

function sha256Prefix(path, len = 12) {
  const buf = readFileSync(path);
  return createHash('sha256').update(buf).digest('hex').slice(0, len).toUpperCase();
}

function checkAppendixD(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.appendixD) {
    ctx.notes.push('附录 D 本体未发布，修订登记按 MOXIAN 附录节的六条登记核对');
    checks++;
    const moxian = readTextSafe(join(ctx.root, 'docs/framework/MOXIAN.md')) ?? '';
    const body = moxian.slice(moxian.indexOf('## 附录 A 至 D'));
    if (!/D-01/.test(body)) issues.push({ rule: 'MXV2-1-11', file: 'docs/framework/MOXIAN.md', msg: '附录节没有 D-01 条目登记' });
    return { checks, issues };
  }
  const t = parseTables(ctx.appendixD).find((x) => x.header[0].startsWith('条号') || x.header.includes('条号'));
  if (!t) {
    issues.push({ rule: 'MXV2-1-11', file: 'docs/framework/v2/APPENDIX-D.md', msg: '没有条号表' });
    return { checks: 1, issues };
  }
  for (const row of t.rows) {
    checks++;
    const id = row.cells[0];
    if (!/^(D-\d{2}|MXV2-\d-\d{2})$/.test(id)) issues.push({ rule: 'MXV2-1-11', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `条号「${id}」格式不合规` });
    if (row.cells.length < 4) issues.push({ rule: 'MXV2-1-11', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `${id} 缺旧文、新文或理由` });
    if (row.cells.some((c) => c === '')) issues.push({ rule: 'MXV2-1-11', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `${id} 有空字段` });
  }
  return { checks, issues };
}

function checkRoleCard(ctx) {
  const issues = [];
  let checks = 0;
  checks++;
  if (!existsSync(join(ctx.root, 'docs/framework/ROLES.md'))) {
    issues.push({ rule: 'MXV2-3-13', file: 'docs/framework/ROLES.md', msg: '角色卡正文文件不存在' });
  }
  if (ctx.appendixD) {
    const hasRole = /角色卡|角色/.test(ctx.appendixD);
    checks++;
    if (!hasRole) issues.push({ rule: 'MXV2-3-13', file: 'docs/framework/v2/APPENDIX-D.md', msg: '附录 D 没有角色卡修订行' });
  }
  const dir = join(ctx.root, 'docs/framework');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md') || f === 'ROLES.md') continue;
      const text = readTextSafe(join(dir, f)) ?? '';
      checks++;
      if (/^##\s*角色卡/m.test(text)) issues.push({ rule: 'MXV2-3-13', file: `docs/framework/${f}`, msg: '复制了角色卡正文，应只写角色名与路径' });
    }
  }
  return { checks, issues };
}

function checkIndex(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.index) {
    issues.push({ rule: 'MXV2-4-23', file: `docs/framework/archive/${ctx.archive.split('/').at(-1)}/INDEX.md`, msg: '归档索引不存在' });
    return { checks: 1, issues };
  }
  checks++;
  for (const marker of ['归档时间', '归档人', '归档路径']) {
    if (!ctx.index.includes(marker)) issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/INDEX.md`, msg: `索引缺「${marker}」` });
  }
  checks++;
  if (!/只读/.test(ctx.index)) issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/INDEX.md`, msg: '索引没有只读说明' });
  const t = parseTables(ctx.index)[0];
  checks++;
  if (!t) issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/INDEX.md`, msg: '索引没有主表' });
  else if (t.rows.length !== 12) issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/INDEX.md`, msg: `索引主表 ${t.rows.length} 行，应 12 行` });
  return { checks, issues };
}

function checkHashes(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.index) return { checks: 1, issues };
  const t = parseTables(ctx.index)[0];
  if (!t) return { checks: 1, issues };
  const nameAt = t.header.findIndex((h) => h.includes('文件名'));
  const hashAt = t.header.findIndex((h) => h.includes('sha256'));
  if (nameAt < 0 || hashAt < 0) {
    issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/INDEX.md`, msg: '索引缺文件名或 sha256 列' });
    return { checks: 1, issues };
  }
  for (const row of t.rows) {
    checks++;
    const name = row.cells[nameAt].replace(/`/g, '');
    const expect = row.cells[hashAt].replace(/`/g, '').toUpperCase();
    const file = join(ctx.archiveDir, name);
    if (!existsSync(file)) {
      issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/${name}`, msg: '索引登记了文件但归档目录里没有' });
      continue;
    }
    ctx.verified.total++;
    const actual = sha256Prefix(file);
    if (actual !== expect) {
      issues.push({ rule: 'MXV2-4-23', file: `${ctx.archive}/${name}`, msg: `sha256 前 12 位 ${actual} 与索引 ${expect} 不一致` });
    } else {
      ctx.verified.ok++;
    }
  }
  return { checks, issues };
}

function checkPatches(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.patches.length) {
    ctx.notes.push('没有回写补丁清单（本变更未改长期 spec）');
    return { checks: 1, issues };
  }
  for (const p of ctx.patches) {
    checks++;
    const t = parseTables(p.text ?? '').find((x) => PATCH_COLUMNS.every((c) => x.header.includes(c)));
    if (!t) {
      issues.push({ rule: 'MXV2-4-23', file: p.rel, msg: '补丁清单缺五列（文件、行号、原文、新文、理由）' });
      continue;
    }
    if (t.rows.length < 10 || t.rows.length > 20) issues.push({ rule: 'MXV2-4-23', file: p.rel, msg: `补丁 ${t.rows.length} 行，应十至二十行` });
    if (!/复核/.test(p.text ?? '') || !/签字/.test(p.text ?? '')) issues.push({ rule: 'MXV2-4-23', file: p.rel, msg: '补丁清单没有复核签字' });
  }
  return { checks, issues };
}

function checkClosure(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.closures.length) {
    checks++;
    issues.push({ rule: 'MXV2-4-23', file: 'specs/changes', msg: '没有关闭记录 specs/changes/<CHG-ID>/closure.md' });
    return { checks, issues };
  }
  for (const c of ctx.closures) {
    checks++;
    const tables = parseTables(c.text);
    const fieldTable = tables.find((t) => t.header.includes('字段') && t.header.includes('值'));
    if (!fieldTable) {
      issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: '关闭记录缺五字段表' });
      continue;
    }
    const fields = new Map(fieldTable.rows.map((r) => [r.cells[0], r.cells[1] ?? '']));
    for (const name of CLOSURE_FIELDS) {
      checks++;
      const value = fields.get(name);
      if (value === undefined) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `关闭记录缺字段「${name}」` });
      else if (!value.trim()) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `关闭记录字段「${name}」为空` });
    }
    const table = tables.find((t) => t.header.includes('条件') && t.header.includes('状态'));
    if (!table) {
      issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: '关闭记录缺六条件表' });
      continue;
    }
    const names = table.rows.map((r) => r.cells[0]);
    for (const name of CLOSURE_CONDITIONS) {
      checks++;
      if (!names.includes(name)) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `关闭记录缺条件「${name}」` });
    }
    for (const name of names.filter((n) => !CLOSURE_CONDITIONS.includes(n))) {
      issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `关闭记录多出条件「${name}」` });
    }
    for (const row of table.rows) {
      checks++;
      const [name, status = '', evidence = ''] = row.cells;
      if (!['pass', 'fail', 'missing', 'N/A'].includes(status)) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `条件「${name}」状态 ${status} 不在 pass/fail/missing/N/A` });
      if (!evidence.trim()) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `条件「${name}」缺证据或说明` });
      if (status === 'N/A' && !/N\/A[:：]\s*\S+/.test(evidence)) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `条件「${name}」记 N/A 但没写理由` });
    }
    checks++;
    if (fields.get('关闭结论') === '已关闭') {
      const open = table.rows.filter((r) => !['pass', 'N/A'].includes(r.cells[1]));
      if (open.length) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: `关闭结论为已关闭，但条件未全 pass：${open.map((r) => r.cells[0]).join('、')}` });
      if (!fields.get('关闭人') || fields.get('关闭人').includes('未签')) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: '关闭结论为已关闭，关闭人未签' });
      if (!/^\d{4}-\d{2}-\d{2}/.test(fields.get('关闭时间') ?? '')) issues.push({ rule: 'MXV2-4-23', file: c.rel, msg: '关闭结论为已关闭，关闭时间不是日期' });
    }
  }
  return { checks, issues };
}

function checkRetros(ctx) {
  const issues = [];
  let checks = 0;
  const relevant = ctx.retros.filter((r) => /^RETRO-CHG-/.test(r.name) || /^RETRO-\d{8}-REQ-/.test(r.name));
  if (!relevant.length) {
    ctx.notes.push('没有与本次变更相关的复盘文件，复盘七节未核对');
    return { checks: 1, issues };
  }
  for (const r of relevant) {
    checks++;
    const kind = r.name.startsWith('RETRO-CHG-') ? 'change' : 'point';
    if (kind === 'change' && !/^RETRO-CHG-CHG-[A-Z0-9-]+\.md$/.test(r.name)) issues.push({ rule: 'MXV2-9-15', file: r.rel, msg: '变更复盘文件名不符合 RETRO-CHG-<CHG-ID>.md' });
    if (kind === 'point' && !/^RETRO-\d{8}-REQ-[\d.]+\.md$/.test(r.name)) issues.push({ rule: 'MXV2-9-15', file: r.rel, msg: '单点复盘文件名不符合 RETRO-<YYYYMMDD>-<REQ-ID>.md' });
    const lines = (r.text ?? '').split(/\r?\n/).filter((l) => l.trim()).length;
    if (kind === 'point' && (lines < 20 || lines > 40)) issues.push({ rule: 'MXV2-9-15', file: r.rel, msg: `单点复盘 ${lines} 行，应 20 至 40 行` });
    if (kind === 'change' && (lines < 60 || lines > 120)) issues.push({ rule: 'MXV2-9-15', file: r.rel, msg: `变更复盘 ${lines} 行，应 60 至 120 行` });
    for (const sec of RETRO_SECTIONS) {
      if (!(r.text ?? '').includes(sec)) issues.push({ rule: 'MXV2-9-15', file: r.rel, msg: `复盘缺七节之一「${sec}」` });
    }
  }
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-1-11', run: checkAppendixD },
  { rule: 'MXV2-3-13', run: checkRoleCard },
  { rule: 'MXV2-4-23', run: checkIndex },
  { rule: 'MXV2-4-23', run: checkHashes },
  { rule: 'MXV2-4-23', run: checkPatches },
  { rule: 'MXV2-4-23', run: checkClosure },
  { rule: 'MXV2-9-15', run: checkRetros },
];

export function evaluate(root, opts = {}) {
  const ctx = loadCtx(root, opts);
  const selected = selectChecks(CHECKS, opts.rule);
  const { count, issues } = runChecks(selected, ctx);
  const verified = `${ctx.verified.ok}/${ctx.verified.total} files verified`;
  return {
    ctx,
    count,
    issues,
    verified,
    summary: opts.rule ? undefined : `${verified}, ${issues.length} issue(s), ${ctx.notes.length} notice`,
  };
}

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('archive');
  const base = join(dir, 'repo');
  const arch = join(base, 'docs/framework/archive/v1.7.5');
  mkdirSync(arch, { recursive: true });
  mkdirSync(join(base, 'docs/plan'), { recursive: true });

  const files = { 'MOXIAN.md': '# 总册 v1.7.5\n- MX-1-01 旧规则\n', 'GATES.md': '# 门禁\nMX-G-01\n' };
  const hashOf = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 12).toUpperCase();
  const index = (mut) => {
    const rows = Object.entries(files).map(([name, text]) => {
      const h = mut === 'hash' && name === 'MOXIAN.md' ? '000000000000' : hashOf(text);
      return `| \`${name}\` | v1.7.5 | 10 | \`${h}\` | 1 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 说明 |`;
    });
    const extra = mut === 'rows' ? '' : Array.from({ length: 10 }, (_, i) => `| \`f${i}.md\` | v1.7.5 | 1 | \`${hashOf('x')}\` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | x |`);
    return `# 索引\n\n归档时间：2026-11-27。归档人：验收员。归档路径：\`docs/framework/archive/v1.7.5/\`。归档目录只读。\n\n| 文件名 | 版本 | 行数 | sha256 前 12 位 | 旧规则条数 | 旧门禁条数 | 归档时间 | 归档人 | 说明 |\n|---|---|---:|---|---:|---:|---|---|---|\n${[...rows, ...extra].join('\n')}\n`;
  };
  const closure = (mut) => {
    const row = (name, status, evidence) => `| ${name} | ${status} | ${evidence} |`;
    const closed = mut === 'closureclosed';
    const fields = [
      '| 变更编号 | CHG-TST-001 |',
      `| 关闭结论 | ${closed ? '已关闭' : '未关闭'} |`,
      mut === 'closurefield' ? null : '| 关闭人 | 验收员 |',
      `| 关闭时间 | ${closed ? '2026-11-27' : '未到收口，不写日期'} |`,
      '| 附加口径 | N/A：无附加类型 |',
    ].filter(Boolean);
    const rows = [
      row('全部 AC 为 pass', closed ? 'missing' : 'pass', closed ? 'evidence 第 8 节仍有 1 条 missing' : 'evidence 第 8 节六行全 pass'),
      row('证据完整', 'pass', 'evidence 第 1 至 9 节齐全'),
      row('复盘七节齐全', 'pass', 'RETRO-CHG 七节齐全'),
      row('索引更新', 'pass', 'INDEX 三处字段与 12 行主表'),
      row('签字齐全', 'pass', '验收员与 Lead 已签'),
      row('无未决漂移', 'pass', '六组漂移均无'),
    ];
    return `# 关闭记录\n\n| 字段 | 值 |\n|---|---|\n${fields.join('\n')}\n\n| 条件 | 状态 | 证据与说明 |\n|---|---|---|\n${rows.join('\n')}\n`;
  };
  const build = (mut) => {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(arch, name), mut === 'hash' && name === 'MOXIAN.md' ? `${text}改动` : text);
    for (const [i] of Array.from({ length: 10 }).entries()) writeFileSync(join(arch, `f${i}.md`), 'x');
    writeFileSync(join(arch, 'INDEX.md'), index(mut));
    mkdirSync(join(base, 'docs/framework'), { recursive: true });
    writeFileSync(join(base, 'docs/framework/ROLES.md'), '# 角色\n');
    writeFileSync(join(base, 'docs/framework/MOXIAN.md'), '# 总册\n\n## 附录 A 至 D 的位置与用途\n\n附录 D 收录六条：D-01、D-02、D-03、D-04、D-05、MX-1-13。\n');
    mkdirSync(join(base, 'specs/changes/CHG-TST-001'), { recursive: true });
    writeFileSync(join(base, 'specs/changes/CHG-TST-001/closure.md'), closure(mut));
    return base;
  };

  const good = evaluate(build('good'), { archive: 'docs/framework/archive/v1.7.5' });
  a.assert(good.issues.length === 0, `通过夹具零问题（实际 ${good.issues.length}：${good.issues.map((i) => i.rule + ' ' + i.msg).join(' | ')}）`);
  a.assert(good.verified === '12/12 files verified', `哈希核验计数为 12/12（实际 ${good.verified}）`);
  a.assert(good.count >= 8, `检查项数覆盖索引与哈希（实际 ${good.count}）`);

  const bad = evaluate(build('hash'), { archive: 'docs/framework/archive/v1.7.5' });
  a.assert(bad.issues.some((i) => i.rule === 'MXV2-4-23' && i.msg.includes('sha256')), '哈希不一致被拦下');
  const rows = evaluate(build('rows'), { archive: 'docs/framework/archive/v1.7.5' });
  a.assert(rows.issues.some((i) => i.msg.includes('应 12 行')), '索引行数不足被拦下');
  const closureField = evaluate(build('closurefield'), { archive: 'docs/framework/archive/v1.7.5' });
  a.assert(closureField.issues.some((i) => i.rule === 'MXV2-4-23' && i.msg.includes('缺字段「关闭人」')), '关闭记录缺字段被拦下');
  const closureClosed = evaluate(build('closureclosed'), { archive: 'docs/framework/archive/v1.7.5' });
  a.assert(closureClosed.issues.some((i) => i.rule === 'MXV2-4-23' && i.msg.includes('关闭结论为已关闭')), '已关闭但条件未全 pass 被拦下');

  const single = evaluate(build('good'), { archive: 'docs/framework/archive/v1.7.5', rule: 'MXV2-4-23' });
  a.assert(single.count >= 15 && single.issues.length === 0, `--rule 单条模式 checks=${single.count}`);
  a.assert(single.summary === undefined, '--rule 模式不打印全册摘要');
  a.assert(resolveRuleMode({ listRules: false, rule: 'MXV2-2-02' }, RULES, NAME).code === 2, '不覆盖的规则号退出码 2');
  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  const result = evaluate(process.cwd(), { archive: args.archive, rule: args.rule });
  for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
  process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
}

if (process.argv[1] && process.argv[1].endsWith('check-archive.mjs')) main();
