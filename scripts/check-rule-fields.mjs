#!/usr/bin/env node
/**
 * check-rule-fields.mjs — 规则卡字段与执行手段自检。
 *
 * 覆盖规则：MXV2-6-01、6-02、6-03、6-07、6-08、6-10、6-11、6-17。
 * 检查内容：
 *   RF-01 六字段齐全、非空、判据不是空指向、来源可解析（6-01）
 *   RF-02 编号三段式、同章从 01 连续、不复用不跳号（6-02）
 *   RF-03 层级只取 L1 至 L4 且四值都出现（6-03）
 *   RF-04 script 命令含脚本路径、--rule、编号与“期望退出码 0”，脚本存在且声明了该规则（6-07）
 *   RF-05 ai-review 四要素齐全、谁判为七角色之一（6-08）
 *   RF-06 附录 D 六条与 owner、期限（6-10）
 *   RF-07 规则卡七行固定顺序（6-11）
 *   RF-08 附录 C 修订行与版本、变更单可解析（6-17）
 *   RF-09 脚本与规则双向引用一致：不存在“引用但缺脚本”，也不存在“脚本声明但正文指向别处”（6-07）
 *
 * 用法：
 *   node scripts/check-rule-fields.mjs
 *   node scripts/check-rule-fields.mjs --rule MXV2-6-01
 *   node scripts/check-rule-fields.mjs --self-test
 *   node scripts/check-rule-fields.mjs --file docs/framework/MOXIAN.md --json
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { frameworkDir } from './lib/framework-root.mjs';
import {
  parseArgs,
  resolveRuleMode,
  selectChecks,
  runChecks,
  printResult,
  fixtureDir,
  createAsserter,
} from './lib/v2-rule-mode.mjs';

const NAME = 'check-rule-fields';
const RULES = [
  'MXV2-6-01',
  'MXV2-6-02',
  'MXV2-6-03',
  'MXV2-6-07',
  'MXV2-6-08',
  'MXV2-6-10',
  'MXV2-6-11',
  'MXV2-6-17',
];
const FIELD_NAMES = ['规则', '判据', '执行', '依据'];
const LEVELS = ['L1', 'L2', 'L3', 'L4'];
const ROLES = ['需求方', '调研员', '判定员', '架构师', '撰写员', '验收员', '发布员'];
const BANNED_CRITERIA = ['见上文', '按规范执行', '同上', '见相关章节', '略'];
const BANNED_REVIEW = ['可能误判', '酌情', '视情况', '注意'];
const FIELD_RE = /^-\s*(规则|判据|执行|依据)：(.*)$/;
const LEGACY_FIELD_RE = /^-\s*(层级|适用)：(.*)$/;
const LEVEL_INLINE_RE = /(?:^|；)\s*层级\s*(L\d+)(?=；|$)/;
const APPLY_INLINE_RE = /(?:^|；)\s*适用\s*([^；]+)/;
const RULE_HEAD_RE = /^###\s+(MXV2-\d-\d{2})\s+(.+?)\s*$/;

function splitLines(text) {
  return text.split(/\r?\n/);
}

/** 解析规则块：标题、行号、字段值、字段顺序、字段之间的额外非空行。 */
export function parseRules(text) {
  const lines = splitLines(text);
  const rules = [];
  let cur = null;
  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const head = line.match(RULE_HEAD_RE);
    if (head) {
      cur = {
        id: head[1],
        title: head[2],
        line: i + 1,
        fields: {},
        order: [],
        stray: [],
        legacy: [],
        duplicates: [],
      };
      rules.push(cur);
      inBlock = true;
      continue;
    }
    if (/^#{2,3}\s/.test(line)) {
      inBlock = false;
      cur = null;
      continue;
    }
    if (!inBlock || !cur) continue;
    const fm = line.match(FIELD_RE);
    if (fm) {
      const key = fm[1];
      if (cur.fields[key] !== undefined) cur.duplicates.push({ key, line: i + 1 });
      else cur.fields[key] = fm[2].replace(/`/g, '').trim();
      cur.order.push({ key, line: i + 1 });
      cur.lastFieldLine = i + 1;
    } else if (line.trim() && cur.lastFieldLine !== undefined) {
      // 六字段之后的表格属于本节，不算插入；字段之间出现其它内容才算顺序破坏。
      const lm = line.match(LEGACY_FIELD_RE);
      if (lm) cur.legacy.push({ key: lm[1], line: i + 1 });
      else if (cur.order.length < FIELD_NAMES.length) cur.stray.push({ line: i + 1, text: line.trim() });
    }
  }
  return rules;
}

function parseAppendixTable(text, prefix) {
  const rows = [];
  for (const [i, line] of splitLines(text).entries()) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!cells.length || /^-+$/.test(cells[0].replace(/[:\s]/g, ''))) continue;
    if (cells[0].startsWith(prefix)) rows.push({ id: cells[0], cells, line: i + 1 });
  }
  return rows;
}

/** 从脚本源码静态读出 RULES 数组，用于双向引用核对。
 *  新脚本用 `const RULES = [...]`；既有脚本内部已有同名对象，改用 `const V2_RULES = [...]`。 */
export function readScriptRules(code) {
  const m = code.match(/const (?:V2_)?RULES = \[([\s\S]*?)\];/);
  if (!m) return null;
  return [...m[1].matchAll(/'(MXV2-\d-\d{2})'/g)].map((x) => x[1]);
}

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** 读取并解析全部输入，供检查函数共用。框架正文是外部依赖：读 SIMO_FRAMEWORK_ROOT（默认同级目录 ../moxian-framework）下的 docs/framework。 */
export function loadCtx(root, opts = {}) {
  const fw = frameworkDir(root);
  const asked = opts.file ?? 'docs/framework/MOXIAN.md';
  const file = isAbsolute(asked) ? asked : join(fw, asked.replace(/^docs\/framework\//, ''));
  const fileRel = isAbsolute(asked) ? relative(root, file).replaceAll('\\', '/') : asked;
  const text = readTextSafe(file);
  if (text === null) {
    const err = new Error(`找不到规则文件 ${fileRel}`);
    err.preflight = true;
    throw err;
  }
  const rules = parseRules(text);
  const version = (readTextSafe(join(fw, 'VERSION')) ?? '').trim();
  const appendixC = readTextSafe(join(fw, 'v2/APPENDIX-C.md'));
  const appendixD = readTextSafe(join(fw, 'v2/APPENDIX-D.md'));
  const sources = readTextSafe(join(fw, 'v2/SOURCES.md'));
  return {
    root,
    file,
    fileRel,
    text,
    rules,
    version,
    appendixC,
    appendixD,
    sources,
    notes: [],
    scriptCache: new Map(),
    byId: new Map(rules.map((r) => [r.id, r])),
  };
}

function scriptPath(ctx, rel) {
  return join(ctx.root, rel);
}

function loadScriptRules(ctx, rel) {
  if (ctx.scriptCache.has(rel)) return ctx.scriptCache.get(rel);
  const code = readTextSafe(scriptPath(ctx, rel));
  const set = code === null ? null : readScriptRules(code);
  ctx.scriptCache.set(rel, set);
  return set;
}

function parseScriptExec(value) {
  const stripped = value.replace(/；层级\s*L\d+[\s\S]*$/, '').trim();
  const cmd = stripped.replace(/^`|`$/g, '').trim();
  const m = cmd.match(/^script:(\S+\.mjs)\s+--rule\s+(MXV2-\d-\d{2})\s+期望退出码\s+0\s*$/);
  return { cmd, match: m };
}

function parseAiReview(value) {
  const body = value.replace(/^`|`$/g, '').trim();
  const parts = body.split('；').map((s) => s.trim());
  const first = parts.find((p) => p.startsWith('ai-review:')) ?? '';
  const pick = (key) => {
    const hit = parts.find((p) => p.startsWith(`${key}：`));
    return hit ? hit.slice(key.length + 1).trim() : '';
  };
  return {
    hasPrefix: /^ai-review:/.test(body),
    pointed: first.replace(/^ai-review:/, '').trim(),
    judge: pick('谁判'),
    failOpen: pick('误放行'),
    failClose: pick('误拦截'),
    keys: parts.map((p) => p.split('：')[0]),
  };
}

function checkFields(ctx) {
  const issues = [];
  let checks = 0;
  for (const r of ctx.rules) {
    checks++;
    for (const name of FIELD_NAMES) {
      if (r.fields[name] === undefined) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 缺字段「${name}」` });
      else if (!r.fields[name]) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 字段「${name}」为空` });
    }
    for (const d of r.duplicates) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: d.line, msg: `${r.id} 字段「${d.key}」重复出现` });
    const exec = r.fields['执行'] ?? '';
    if (exec && !LEVEL_INLINE_RE.test(exec)) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 执行行未写层级（应为「；层级 L1 至 L4」）` });
    if (exec && !APPLY_INLINE_RE.test(exec)) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 执行行未写适用` });
    if (!r.title.trim()) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 标题行缺陈述` });
    const crit = r.fields['判据'];
    if (crit && crit.length < 20 && BANNED_CRITERIA.some((p) => crit.includes(p))) {
      issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 判据是空指向：「${crit}」` });
    }
    const basis = r.fields['依据'];
    if (basis) {
      const ok = /(MX-\d+-\d+|S-\d+|CHG-[A-Z0-9-]+)/.test(basis) || /\.md/.test(basis);
      if (!ok) issues.push({ rule: 'MXV2-6-01', file: ctx.fileRel, line: r.line, msg: `${r.id} 依据无法解析到旧规则号、来源编号或文件：「${basis}」` });
    }
  }
  return { checks, issues };
}

function checkNumbering(ctx) {
  const issues = [];
  let checks = 0;
  const seen = new Set();
  const perChapter = new Map();
  for (const r of ctx.rules) {
    checks++;
    const m = r.id.match(/^MXV2-([1-9])-(\d{2})$/);
    if (!m) {
      issues.push({ rule: 'MXV2-6-02', file: ctx.fileRel, line: r.line, msg: `${r.id} 编号格式不是 MXV2-<章>-<NN>` });
      continue;
    }
    if (seen.has(r.id)) issues.push({ rule: 'MXV2-6-02', file: ctx.fileRel, line: r.line, msg: `${r.id} 编号重复` });
    seen.add(r.id);
    const ch = Number(m[1]);
    const seq = Number(m[2]);
    if (!perChapter.has(ch)) perChapter.set(ch, []);
    perChapter.get(ch).push({ seq, line: r.line, id: r.id });
  }
  for (const [ch, list] of [...perChapter.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.seq - b.seq);
    list.forEach((item, idx) => {
      const expect = idx + 1;
      if (item.seq !== expect) {
        issues.push({ rule: 'MXV2-6-02', file: ctx.fileRel, line: item.line, msg: `第 ${ch} 章编号不连续：第 ${idx + 1} 条是 ${item.id}，应为 ${String(expect).padStart(2, '0')}` });
      }
    });
  }
  return { checks, issues };
}

function checkLevels(ctx) {
  const issues = [];
  let checks = 0;
  const counts = new Map(LEVELS.map((l) => [l, 0]));
  for (const r of ctx.rules) {
    checks++;
    const exec = r.fields['执行'] ?? '';
    const lv = (exec.match(LEVEL_INLINE_RE) ?? [])[1];
    if (lv === undefined) continue;
    if (!LEVELS.includes(lv)) {
      issues.push({ rule: 'MXV2-6-03', file: ctx.fileRel, line: r.line, msg: `${r.id} 层级取值「${lv}」不在 L1 至 L4` });
      continue;
    }
    counts.set(lv, counts.get(lv) + 1);
  }
  for (const lv of LEVELS) {
    if (!ctx.text.includes(`| ${lv} |`)) issues.push({ rule: 'MXV2-6-03', file: ctx.fileRel, msg: `表 6-1 缺层级 ${lv} 一行` });
  }
  const sum = [...counts.values()].reduce((a, b) => a + b, 0);
  if (sum !== ctx.rules.length) issues.push({ rule: 'MXV2-6-03', file: ctx.fileRel, msg: `层级计数合计 ${sum} 与规则数 ${ctx.rules.length} 不符` });
  return { checks, issues };
}

function checkScriptExec(ctx) {
  const issues = [];
  let checks = 0;
  for (const r of ctx.rules) {
    const exec = r.fields['执行'];
    if (exec === undefined || !exec.startsWith('script:')) continue;
    checks++;
    const { match } = parseScriptExec(exec);
    if (!match) {
      issues.push({ rule: 'MXV2-6-07', file: ctx.fileRel, line: r.line, msg: `${r.id} 执行字段不符合 script 命令格式：「${exec}」` });
      continue;
    }
    const [, scriptRel, ruleId] = match;
    if (ruleId !== r.id) issues.push({ rule: 'MXV2-6-07', file: ctx.fileRel, line: r.line, msg: `${r.id} 命令里的规则号是 ${ruleId}，与所在规则不一致` });
    if (!existsSync(scriptPath(ctx, scriptRel))) {
      issues.push({ rule: 'MXV2-6-07', file: ctx.fileRel, line: r.line, msg: `${r.id} 引用的脚本不存在：${scriptRel}` });
      continue;
    }
    const declared = loadScriptRules(ctx, scriptRel);
    if (declared === null) {
      issues.push({ rule: 'MXV2-6-07', file: ctx.fileRel, line: r.line, msg: `${r.id} 引用的 ${scriptRel} 未声明 RULES 数组，无法核对覆盖范围` });
    } else if (!declared.includes(r.id)) {
      issues.push({ rule: 'MXV2-6-07', file: ctx.fileRel, line: r.line, msg: `${r.id} 引用 ${scriptRel}，但该脚本未声明覆盖此规则` });
    }
  }
  return { checks, issues };
}

function checkAiReview(ctx) {
  const issues = [];
  let checks = 0;
  for (const r of ctx.rules) {
    const exec = r.fields['执行'];
    if (exec === undefined || !exec.startsWith('ai-review:')) continue;
    checks++;
    const v = parseAiReview(exec);
    if (!v.hasPrefix) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 执行字段不是 ai-review 形态` });
    if (!v.pointed) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 缺判据要点` });
    if (!v.judge) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 缺「谁判」` });
    else if (!ROLES.some((role) => v.judge.includes(role))) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 谁判「${v.judge}」不是七角色之一` });
    else if (v.judge.includes('实现者') && !ROLES.some((role) => v.judge.startsWith(role))) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 判定人固定为实现者` });
    for (const [key, val] of [['误放行', v.failOpen], ['误拦截', v.failClose]]) {
      if (!val) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id} 缺「${key}」` });
      else if (val.length < 6 || BANNED_REVIEW.some((p) => val === p)) issues.push({ rule: 'MXV2-6-08', file: ctx.fileRel, line: r.line, msg: `${r.id}「${key}」写的是空话：「${val}」` });
    }
  }
  return { checks, issues };
}

function checkAppendixD(ctx) {
  const issues = [];
  let checks = 0;
  if (ctx.appendixD === null) {
    ctx.notes.push('附录 D 本体未发布（MOXIAN 附录节注明本体另派），按本册登记的六条核对');
    const body = ctx.text.slice(ctx.text.indexOf('## 附录 A 至 D'));
    for (const id of ['D-01', 'D-02', 'D-03', 'D-04', 'D-05', 'MX-1-13']) {
      checks++;
      if (!body.includes(id)) issues.push({ rule: 'MXV2-6-10', file: ctx.fileRel, msg: `附录节未登记条目 ${id}` });
    }
    checks++;
    if (!/owner 为判定员/.test(body)) issues.push({ rule: 'MXV2-6-10', file: ctx.fileRel, msg: '附录节未写六条的 owner 为判定员' });
    checks++;
    if (!/期限/.test(body)) issues.push({ rule: 'MXV2-6-10', file: ctx.fileRel, msg: '附录节未写补判据期限' });
    return { checks, issues };
  }
  const rows = parseAppendixTable(ctx.appendixD, 'D-');
  for (const row of rows) {
    checks++;
    const cells = row.cells.slice(1);
    if (cells.length < 6) issues.push({ rule: 'MXV2-6-10', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `${row.id} 少于六字段（实际 ${cells.length} 列）` });
    if (!cells.some((c) => ROLES.includes(c))) issues.push({ rule: 'MXV2-6-10', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `${row.id} 未写 owner 角色` });
    if (!cells.some((c) => /\d{4}-\d{2}-\d{2}/.test(c))) issues.push({ rule: 'MXV2-6-10', file: 'docs/framework/v2/APPENDIX-D.md', line: row.line, msg: `${row.id} 未写期限日期` });
  }
  if (rows.length !== 6) issues.push({ rule: 'MXV2-6-10', file: 'docs/framework/v2/APPENDIX-D.md', msg: `附录 D 行数 ${rows.length}，应为 6` });
  return { checks, issues };
}

function checkFieldOrder(ctx) {
  const issues = [];
  let checks = 0;
  for (const r of ctx.rules) {
    checks++;
    const got = r.order.map((o) => o.key);
    if (got.join(',') !== FIELD_NAMES.join(',')) {
      issues.push({ rule: 'MXV2-6-11', file: ctx.fileRel, line: r.line, msg: `${r.id} 字段顺序是 ${got.join('/')}，应为 ${FIELD_NAMES.join('/')}` });
    }
    for (const s of r.stray) issues.push({ rule: 'MXV2-6-11', file: ctx.fileRel, line: s.line, msg: `${r.id} 字段之间夹了非字段行：「${s.text}」` });
    for (const s of r.legacy ?? []) issues.push({ rule: 'MXV2-6-11', file: ctx.fileRel, line: s.line, msg: `${r.id} 残留旧字段行「${s.key}」，层级与适用应并入执行行` });
  }
  return { checks, issues };
}

function checkAppendixC(ctx) {
  const issues = [];
  let checks = 0;
  if (ctx.appendixC === null) {
    ctx.notes.push('附录 C 本体未发布（MOXIAN 附录节注明本体另派），本版无已登记修订行');
    return { checks: 1, issues };
  }
  const rows = parseAppendixTable(ctx.appendixC, 'MXV2-');
  const version = ctx.version.replace(/^v/, '');
  for (const row of rows) {
    checks++;
    const cells = row.cells.slice(1);
    if (cells.length < 4) issues.push({ rule: 'MXV2-6-17', file: 'docs/framework/v2/APPENDIX-C.md', line: row.line, msg: `${row.id} 修订行字段不足（规则编号、版本、变更单号、生效时间、理由）` });
    if (version && cells[0] && cells[0].replace(/^v/, '') !== version) issues.push({ rule: 'MXV2-6-17', file: 'docs/framework/v2/APPENDIX-C.md', line: row.line, msg: `${row.id} 版本 ${cells[0]} 与 VERSION ${ctx.version} 不一致` });
    if (cells[1] && !/^CHG-[A-Z0-9-]+$/.test(cells[1])) issues.push({ rule: 'MXV2-6-17', file: 'docs/framework/v2/APPENDIX-C.md', line: row.line, msg: `${row.id} 变更单号「${cells[1]}」不可解析` });
  }
  return { checks, issues };
}

function checkCrossRef(ctx) {
  const issues = [];
  let checks = 0;
  const referenced = new Map(); // scriptRel -> Set(ruleId)
  for (const r of ctx.rules) {
    const exec = r.fields['执行'];
    if (!exec || !exec.startsWith('script:')) continue;
    const { match } = parseScriptExec(exec);
    if (!match) continue;
    if (!referenced.has(match[1])) referenced.set(match[1], new Set());
    referenced.get(match[1]).add(r.id);
  }
  for (const [rel, ids] of referenced) {
    checks++;
    const declared = loadScriptRules(ctx, rel);
    if (declared === null) {
      issues.push({ rule: 'MXV2-6-07', file: rel, msg: `脚本未声明 RULES，无法核对规则归属（正文引用 ${ids.size} 条）` });
      continue;
    }
    const set = new Set(declared);
    for (const id of ids) if (!set.has(id)) issues.push({ rule: 'MXV2-6-07', file: rel, msg: `正文把 ${id} 指向本脚本，但脚本未声明该规则（规则引用错）` });
    for (const id of set) {
      if (ids.has(id)) continue;
      const owner = ctx.rules.find((r) => r.id === id);
      const target = owner && parseScriptExec(owner.fields['执行'] ?? '')?.match?.[1];
      issues.push({ rule: 'MXV2-6-07', file: rel, msg: `脚本声明了 ${id}，但正文把它指向 ${target ?? '未配置脚本'}（规则引用错）` });
    }
  }
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-6-01', run: checkFields },
  { rule: 'MXV2-6-02', run: checkNumbering },
  { rule: 'MXV2-6-03', run: checkLevels },
  { rule: 'MXV2-6-07', run: checkScriptExec },
  { rule: 'MXV2-6-08', run: checkAiReview },
  { rule: 'MXV2-6-10', run: checkAppendixD },
  { rule: 'MXV2-6-11', run: checkFieldOrder },
  { rule: 'MXV2-6-17', run: checkAppendixC },
];

function evaluate(root, opts = {}) {
  const ctx = loadCtx(root, opts);
  const selected = selectChecks(CHECKS, opts.rule);
  const { count: baseCount, issues } = runChecks(selected, ctx);
  const ref = selectChecks([{ rule: 'MXV2-6-07', run: checkCrossRef }], opts.rule);
  const refResult = runChecks(ref, ctx);
  const all = [...issues, ...refResult.issues];
  for (const i of all) {
    const m = i.msg?.match(/^([^ ]+) /);
    i.id = m ? m[1] : undefined;
  }
  let coverage = 0;
  if (!opts.rule) {
    const bad = new Set(
      all
        .filter((i) => ['MXV2-6-01', 'MXV2-6-07', 'MXV2-6-08', 'MXV2-6-11'].includes(i.rule))
        .map((i) => (i.msg.match(/^(MXV2-\d-\d{2})/) ?? [])[1])
        .filter(Boolean),
    );
    const total = ctx.rules.length;
    coverage = total ? Math.round(((total - bad.size) / total) * 100) : 100;
  }
  return {
    ctx,
    count: baseCount + refResult.count,
    issues: all,
    coverage,
    summary: opts.rule ? undefined : `${ctx.rules.length} rules, ${all.length} error, ${ctx.notes.length} notice, coverage ${coverage}%`,
  };
}

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('rule-fields');
  const rulesText = (mut) => {
    const blocks = [
      ['MXV2-1-01', '纳入变更包', 'script:scripts/check-demo.mjs --rule MXV2-1-01 期望退出码 0', 'L1'],
      ['MXV2-1-02', '受理条件', 'ai-review:核对六项；谁判：判定员；误放行：六项缺一项仍受理；误拦截：六项齐全但退回', 'L2'],
      ['MXV2-2-01', '编号写入首部', 'script:scripts/check-demo.mjs --rule MXV2-2-01 期望退出码 0', 'L3'],
    ];
    const out = ['# 测试总册', '', '- 版本：v2.0.0', '', '## 附录 A 至 D 的位置与用途', '', '附录 D 收录六条：D-01、D-02、D-03、D-04、D-05、MX-1-13。六条的 owner 为判定员，补判据期限写在收口材料。', ''];
    out.push('表 6-1 层级取值与后果', '| 层级 | 含义 | 违反后果 | 记录位置 |', '|---|---|---|---|', '| L1 | 框架级 | 记事故 | 事故文件 |', '| L2 | 章级 | 退回重写 | 产物 |', '| L3 | 门禁级 | 阻断 | 门禁输出 |', '| L4 | 附录级 | 提示 | 附录 D |', '');
    for (const [id, title, exec, level] of blocks) {
      const execLine = mut === 'exec' && id === 'MXV2-1-01' ? 'script:scripts/check-demo.mjs --rule MXV2-1-02 期望退出码 0' : exec;
      const lv = mut === 'level' && id === 'MXV2-1-01' ? 'L5' : level;
      const b = [
        `### ${id} ${title}`,
        `- 规则：${title}。`,
        `- 判据：${mut === 'criteria' && id === 'MXV2-1-01' ? '见上文' : '可观察的判据一句。'}`,
        `- 执行：${execLine}；层级 ${lv}；适用 任何改动。`,
        `- 依据：MX-1-01`,
      ];
      if (mut === 'order' && id === 'MXV2-1-01') {
        b[1] = '- 判据：可观察的判据一句。';
        b[2] = '- 规则：纳入变更包。';
      }
      if (mut === 'no-basis' && id === 'MXV2-1-01') b.splice(4, 1);
      if (mut === 'legacy' && id === 'MXV2-1-01') b.push('- 适用：任何改动。');
      if (mut === 'review' && id === 'MXV2-1-02') b[3] = '- 执行：ai-review:核对六项；谁判：判定员；误放行：可能误判；层级 L2；适用 受理时。';
      out.push(...b, '');
    }
    if (mut === 'numbering') out[out.indexOf('### MXV2-2-01 编号写入首部')] = '### MXV2-2-03 编号写入首部';
    return out.join('\n');
  };
  const write = (mut, opts = {}) => {
    const root = join(dir, mut);
    mkdirSync(join(root, 'docs/framework'), { recursive: true });
    mkdirSync(join(root, 'scripts'), { recursive: true });
    let text = rulesText(mut);
    if (mut === 'numbering') text = text.replace('### MXV2-2-01 编号写入首部', '### MXV2-2-03 编号写入首部');
    writeFileSync(join(root, 'docs/framework/MOXIAN.md'), text);
    writeFileSync(join(root, 'docs/framework/VERSION'), 'v2.0.0\n');
    if (!opts.noScript) {
      writeFileSync(
        join(root, 'scripts/check-demo.mjs'),
        `const RULES = ['MXV2-1-01', 'MXV2-2-01'${opts.extraRule ? ", 'MXV2-1-02'" : ''}];\nexport default RULES;\n`,
      );
    }
    return root;
  };

  const good = evaluate(write('good'));
  a.assert(good.issues.length === 0, `通过夹具零问题（实际 ${good.issues.length}：${good.issues.map((i) => i.rule + ' ' + i.msg).join(' | ')}）`);
  a.assert(/3 rules, 0 error, .*coverage 100%/.test(good.summary ?? ''), `摘要含规则数与覆盖率（${good.summary}）`);
  a.assert(good.count >= 15, `检查项数覆盖字段与引用（实际 ${good.count}）`);

  const cases = [
    ['no-basis', 'MXV2-6-01', '缺字段'],
    ['criteria', 'MXV2-6-01', '空指向'],
    ['numbering', 'MXV2-6-02', '不连续'],
    ['level', 'MXV2-6-03', '不在 L1 至 L4'],
    ['exec', 'MXV2-6-07', '与所在规则不一致'],
    ['review', 'MXV2-6-08', '缺「误拦截」'],
    ['order', 'MXV2-6-11', '字段顺序'],
    ['legacy', 'MXV2-6-11', '残留旧字段'],
  ];
  for (const [mut, rule, needle] of cases) {
    const r = evaluate(write(mut));
    const hit = r.issues.find((i) => i.rule === rule && i.msg.includes(needle));
    a.assert(Boolean(hit), `${mut} 命中 ${rule}（${needle}）`);
  }
  const missing = evaluate(write('missing', { noScript: true }));
  a.assert(missing.issues.some((i) => i.rule === 'MXV2-6-07' && i.msg.includes('脚本不存在')), '缺脚本被 6-07 拦下');
  const extra = evaluate(write('extra', { extraRule: true }));
  a.assert(extra.issues.some((i) => i.rule === 'MXV2-6-07' && i.msg.includes('脚本声明了')), '脚本声明未引用规则被拦下');

  const single = evaluate(write('good'), { rule: 'MXV2-6-01' });
  a.assert(single.count === 3 && single.issues.length === 0, `--rule 单条模式只跑该规则检查（checks=${single.count}）`);
  a.assert(single.summary === undefined, '--rule 模式不打印全册摘要');

  const listOut = [];
  const origLog = console.log;
  console.log = (s) => listOut.push(s);
  const mode = resolveRuleMode({ listRules: true, rule: null }, RULES, NAME);
  console.log = origLog;
  a.assert(mode.done && mode.code === 0 && listOut.join('\n').includes('MXV2-6-01'), '--list-rules 列出八条规则');
  const bad = resolveRuleMode({ listRules: false, rule: 'MXV2-9-99' }, RULES, NAME);
  a.assert(bad.done && bad.code === 2, '不覆盖的规则号退出码 2');
  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  try {
    const root = process.cwd();
    const result = evaluate(root, { file: args.file, rule: args.rule });
    for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
    process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
  } catch (err) {
    console.error(`${NAME}: ${err.message}`);
    process.exit(2);
  }
}

if (process.argv[1] && process.argv[1].endsWith('check-rule-fields.mjs')) main();
