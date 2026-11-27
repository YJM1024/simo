#!/usr/bin/env node
/**
 * check-docs.mjs — 框架文档版本一致性与发布记录自检。
 *
 * 覆盖规则：MXV2-1-09、3-15。
 * 检查内容：
 *   DC-01 版本号在 VERSION、MOXIAN.md、README.md、GATES.md 四处一致（1-09）
 *   DC-02 规则条数在 MOXIAN.md 与 GATES.md 一致，且与实测标题数一致（1-09）
 *   DC-03 门禁条数与 MOXIAN.md 中 script/ai-review 实测条数一致（1-09）
 *   DC-04 发布记录含验收签字、放行签字（两人不同）与放行三项（3-15）
 *
 * 用法：
 *   node scripts/check-docs.mjs
 *   node scripts/check-docs.mjs --rule MXV2-1-09 --json
 */
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseArgs,
  resolveRuleMode,
  selectChecks,
  runChecks,
  printResult,
  fixtureDir,
  createAsserter,
} from './lib/v2-rule-mode.mjs';

const NAME = 'check-docs';
const RULES = ['MXV2-1-09', 'MXV2-3-15'];
const RELEASE_FIELDS = ['验收结论', '版本号', '冻结哈希'];

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function loadCtx(root) {
  const read = (rel) => readTextSafe(join(root, rel));
  return {
    root,
    version: read('docs/framework/VERSION')?.trim() ?? null,
    moxian: read('docs/framework/MOXIAN.md'),
    readme: read('README.md'),
    frameworkReadme: read('docs/framework/README.md'),
    gates: read('docs/framework/GATES.md'),
    acceptDir: join(root, 'docs/framework/accept'),
    notes: [],
  };
}

const SEMVER = /(\d+)\.(\d+)\.(\d+)/;
const CN_DIGIT = { 〇: 0, 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

/** 把「一百五十八」这类中文数字转成整数，纯阿拉伯数字直接返回。 */
export function cnToNumber(text) {
  if (text == null) return null;
  if (/^\d+$/.test(text)) return Number(text);
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const ch of text) {
    if (CN_DIGIT[ch] !== undefined) {
      digit = CN_DIGIT[ch];
      continue;
    }
    if (ch === '十') {
      section += (digit || 1) * 10;
      digit = 0;
      continue;
    }
    if (ch === '百') {
      section += (digit || 1) * 100;
      digit = 0;
      continue;
    }
    if (ch === '千') {
      section += (digit || 1) * 1000;
      digit = 0;
      continue;
    }
    return null;
  }
  if (text.length === 0) return null;
  return total + section + digit;
}

function extractVersion(text, pattern) {
  const m = pattern.exec(text ?? '');
  if (!m) return null;
  const raw = m[1];
  return raw.startsWith('v') ? raw : `v${raw}`;
}

function checkVersions(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.version || !SEMVER.test(ctx.version)) {
    issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/VERSION', msg: '版本文件缺失或不是三段式版本号' });
    return { checks: 1, issues };
  }
  const sources = [
    ['docs/framework/VERSION', ctx.version],
    ['docs/framework/MOXIAN.md', extractVersion(ctx.moxian, /^-\s*版本[：:]\s*(v?\d+\.\d+\.\d+)/m)],
    ['docs/framework/README.md', extractVersion(ctx.frameworkReadme, /框架版本\s*`(v?\d+\.\d+\.\d+)`/)],
    ['docs/framework/GATES.md', extractVersion(ctx.gates, /^-\s*版本[：:]\s*(v?\d+\.\d+\.\d+)/m)],
    ['README.md', extractVersion(ctx.readme, /框架\s*(v\d+\.\d+\.\d+)/)],
  ];
  for (const [file, value] of sources) {
    checks++;
    if (value == null && file === 'README.md') continue;
    if (value == null) {
      issues.push({ rule: 'MXV2-1-09', file, msg: '找不到版本号' });
      continue;
    }
    const norm = value.startsWith('v') ? value : `v${value}`;
    if (norm !== ctx.version) issues.push({ rule: 'MXV2-1-09', file, msg: `版本号 ${norm} 与 VERSION ${ctx.version} 不一致` });
  }
  return { checks, issues };
}

function checkCounts(ctx) {
  const issues = [];
  let checks = 0;
  const headings = (ctx.moxian ?? '').match(/^###\s+MXV2-\d-\d{2}\s/gm) ?? [];
  ctx.ruleCount = headings.length;
  checks++;
  const declaredMatch = /(\d+)\s*条规则/.exec(ctx.moxian ?? '') ?? /共\s*([零〇一二两三四五六七八九十百]+)\s*条/.exec(ctx.moxian ?? '');
  const declared = declaredMatch ? cnToNumber(declaredMatch[1]) : null;
  if (declared === null) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/MOXIAN.md', msg: '首部没有声明规则条数' });
  else if (declared !== headings.length) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/MOXIAN.md', msg: `声明 ${declared} 条，实际 ${headings.length} 个规则标题` });
  checks++;
  const gatesTotal = /全册\s*([零〇一二两三四五六七八九十百]+|\d+)\s*条/.exec(ctx.gates ?? '');
  const gatesNum = gatesTotal ? cnToNumber(gatesTotal[1]) : null;
  if (gatesNum !== null && gatesNum !== headings.length) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: `门禁表写全册 ${gatesNum} 条，与 MOXIAN ${headings.length} 条不一致` });
  if (gatesNum === null) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: '门禁表没有写全册条数' });
  return { checks, issues };
}

function checkGateCounts(ctx) {
  const issues = [];
  let checks = 0;
  const scriptCount = (ctx.moxian ?? '').match(/^-\s*执行[：:]\s*`?script:/gm)?.length ?? 0;
  const reviewCount = (ctx.moxian ?? '').match(/^-\s*执行[：:]\s*`?ai-review:/gm)?.length ?? 0;
  checks++;
  const gatesScript = /script\s*([零〇一二两三四五六七八九十百]+|\d+)\s*条/.exec(ctx.gates ?? '');
  const gatesReview = /ai-review\s*([零〇一二两三四五六七八九十百]+|\d+)\s*条/.exec(ctx.gates ?? '');
  if (!gatesScript) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: '门禁表没有写 script 条数' });
  else {
    const n = cnToNumber(gatesScript[1]);
    if (n !== scriptCount) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: `门禁表 script ${n} 条，MOXIAN 实测 ${scriptCount} 条` });
  }
  checks++;
  if (!gatesReview) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: '门禁表没有写 ai-review 条数' });
  else {
    const n = cnToNumber(gatesReview[1]);
    if (n !== reviewCount) issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/GATES.md', msg: `门禁表 ai-review ${n} 条，MOXIAN 实测 ${reviewCount} 条` });
  }
  checks++;
  if (scriptCount + reviewCount !== (ctx.ruleCount ?? scriptCount + reviewCount)) {
    issues.push({ rule: 'MXV2-1-09', file: 'docs/framework/MOXIAN.md', msg: `script ${scriptCount} + ai-review ${reviewCount} 不等于规则总数 ${ctx.ruleCount}` });
  }
  return { checks, issues };
}

function checkRelease(ctx) {
  const issues = [];
  let checks = 0;
  if (!existsSync(ctx.acceptDir)) {
    ctx.notes.push('没有 docs/framework/accept 目录，发布记录未核对');
    return { checks: 1, issues };
  }
  const candidates = readdirSync(ctx.acceptDir).filter((f) => f.endsWith('.md') && f.includes('ACCEPT'));
  const version = ctx.version ?? '';
  let found = null;
  for (const f of candidates) {
    const text = readTextSafe(join(ctx.acceptDir, f)) ?? '';
    if (text.includes(version)) {
      found = { f, text };
      break;
    }
  }
  checks++;
  if (!found) {
    ctx.notes.push(`accept 目录没有 ${version} 的发布记录，3-15 对本变更不适用`);
    return { checks, issues };
  }
  for (const field of RELEASE_FIELDS) {
    checks++;
    if (!found.text.includes(field)) issues.push({ rule: 'MXV2-3-15', file: `docs/framework/accept/${found.f}`, msg: `发布记录缺「${field}」` });
  }
  checks++;
  const accept = /验收签字[：:]\s*(\S+)/.exec(found.text);
  const release = /放行签字[：:]\s*(\S+)/.exec(found.text);
  if (!accept) issues.push({ rule: 'MXV2-3-15', file: `docs/framework/accept/${found.f}`, msg: '没有验收签字' });
  if (!release) issues.push({ rule: 'MXV2-3-15', file: `docs/framework/accept/${found.f}`, msg: '没有放行签字' });
  if (accept && release && accept[1] === release[1]) issues.push({ rule: 'MXV2-3-15', file: `docs/framework/accept/${found.f}`, msg: '验收签字与放行签字是同一人' });
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-1-09', run: checkVersions },
  { rule: 'MXV2-1-09', run: checkCounts },
  { rule: 'MXV2-1-09', run: checkGateCounts },
  { rule: 'MXV2-3-15', run: checkRelease },
];

export function evaluate(root, opts = {}) {
  const ctx = loadCtx(root);
  const selected = selectChecks(CHECKS, opts.rule);
  const { count, issues } = runChecks(selected, ctx);
  return { ctx, count, issues, summary: opts.rule ? undefined : `version ${ctx.version ?? 'missing'}, ${issues.length} issue(s), ${ctx.notes.length} notice` };
}

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('docs');
  const mk = (mut) => {
    const root = join(dir, mut, 'repo');
    const fw = join(root, 'docs/framework');
    const accept = join(fw, 'accept');
    mkdirSync(accept, { recursive: true });
    const version = mut === 'version' ? 'v2.0.0' : 'v2.0.0';
    const docVersion = mut === 'version' ? 'v2.0.1' : version;
    const ruleBody = Array.from({ length: 3 }, (_, i) => `### MXV2-1-0${i + 1} 规则${i + 1}\n\n- 规则：$\n- 判据：\n- 执行：\n- 层级：\n- 依据：\n- 适用：\n`).join('\n');
    const scriptN = mut === 'gatecount' ? 2 : 3;
    writeFileSync(join(fw, 'VERSION'), `${version}\n`);
    writeFileSync(join(fw, 'MOXIAN.md'), `# 总册\n- 版本：${docVersion}\n共 3 条规则。\n${ruleBody}${Array.from({ length: 3 }, () => '- 执行：`script:scripts/x.mjs --rule MXV2-1-01` 期望退出码 0\n').join('')}`);
    writeFileSync(join(fw, 'README.md'), `框架版本 \`${docVersion}\`。\n`);
    writeFileSync(join(fw, 'GATES.md'), `- 版本：${docVersion}\n\n全册 3 条，script ${scriptN} 条，ai-review ${3 - scriptN} 条。\n`);
    writeFileSync(join(root, 'README.md'), '无关内容\n');
    writeFileSync(join(accept, 'ACCEPT-1.md'), `# 验收\n验收结论：通过\n版本号：${version}\n冻结哈希：abc123\n验收签字：验收员\n放行签字：${mut === 'samesigner' ? '验收员' : '发布员'}\n`);
    return root;
  };
  const good = evaluate(mk('good'));
  a.assert(good.issues.length === 0, `通过夹具零问题（实际：${good.issues.map((i) => i.msg).join(' | ')}）`);
  a.assert(good.summary.includes('v2.0.0'), `摘要含版本号（${good.summary}）`);
  a.assert(good.count >= 8, `检查项数 ≥8（实际 ${good.count}）`);

  const badVersion = evaluate(mk('version'));
  a.assert(badVersion.issues.some((i) => i.rule === 'MXV2-1-09' && i.msg.includes('v2.0.1')), '版本号不一致被拦下');
  const badGate = evaluate(mk('gatecount'));
  a.assert(badGate.issues.some((i) => i.msg.includes('script')), 'script/ai-review 条数不符被拦下');
  const sameSigner = evaluate(mk('samesigner'));
  a.assert(sameSigner.issues.some((i) => i.rule === 'MXV2-3-15' && i.msg.includes('同一人')), '同一人双签被拦下');
  const single = evaluate(mk('good'), { rule: 'MXV2-1-09' });
  a.assert(single.count === 10 && single.issues.length === 0, `--rule 单条模式 checks=${single.count}`);
  a.assert(resolveRuleMode({ listRules: false, rule: 'MXV2-9-15' }, RULES, NAME).code === 2, '不覆盖的规则号退出码 2');
  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  const result = evaluate(process.cwd(), { rule: args.rule });
  for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
  process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
}

if (process.argv[1] && process.argv[1].endsWith('check-docs.mjs')) main();
