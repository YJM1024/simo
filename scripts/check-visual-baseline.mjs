#!/usr/bin/env node
/**
 * check-visual-baseline.mjs — 视觉基线四档、阈值与验收截图自检。
 *
 * 覆盖规则：MXV2-7-08、8-11。
 * 检查内容：
 *   VB-01 基线清单含四个宽度档 375/768/1180/1600（7-08）
 *   VB-02 像素差阈值必须是 0，几何断言至少两条（7-08）
 *   VB-03 排版观测四项齐全（7-08）
 *   VB-04 每个宽度档都有验收截图（8-11）
 *   VB-05 缺陷记录到发生档位，验收记录有用户签字（8-11）
 *
 * 本卡不改界面，仓库没有基线清单时两条规则记 notice（对界面改动才强制）。
 *
 * 用法：
 *   node scripts/check-visual-baseline.mjs
 *   node scripts/check-visual-baseline.mjs --baseline frontend/visual-baseline.json
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
import { frameworkDir } from './lib/framework-root.mjs';

const NAME = 'check-visual-baseline';
const RULES = ['MXV2-7-08', 'MXV2-8-11'];
const WIDTHS = ['375', '768', '1180', '1600'];
const TYPOGRAPHY = ['font', 'size', 'lineHeight', 'letterSpacing'];
const SHOT = /^visual-(\d+)[^/\\]*\.(png|jpe?g|webp)$/i;

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function findBaseline(root, explicit) {
  const candidates = explicit
    ? [explicit]
    : [
        'frontend/visual-baseline.json',
        'frontend/review/visual-baseline.json',
        'frontend/scripts/visual-baseline.json',
        'frontend/visual.baseline.json',
      ];
  for (const rel of candidates) {
    const text = readTextSafe(join(root, rel));
    if (text !== null) return { rel, text };
  }
  return null;
}

export function loadCtx(root, opts = {}) {
  const found = findBaseline(root, opts.baseline);
  const reviewDir = join(root, 'frontend/review');
  const shots = [];
  if (existsSync(reviewDir)) {
    for (const f of readdirSync(reviewDir)) {
      const m = SHOT.exec(f);
      if (m) shots.push({ name: f, width: m[1] });
    }
  }
  const signatures = [];
  // 框架正文是外部依赖：读 SIMO_FRAMEWORK_ROOT（默认同级目录 ../moxian-framework）下的 docs/framework。
  const fw = frameworkDir(root);
  for (const [dir, label] of [
    [join(fw, 'accept'), 'docs/framework/accept'],
    [join(root, 'docs/testing'), 'docs/testing'],
  ]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const text = readTextSafe(join(dir, f)) ?? '';
      if (/用户签字[：:]\s*\S+/.test(text)) signatures.push({ rel: `${label}/${f}`, text });
    }
  }
  let manifest = null;
  if (found) {
    try {
      manifest = JSON.parse(found.text);
    } catch {
      manifest = { __parseError: true };
    }
  }
  return { root, found, manifest, shots, signatures, notes: [] };
}

function checkWidths(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.found) {
    ctx.notes.push('没有视觉基线清单，7-08 对当前变更不适用（本变更不改界面）');
    return { checks: 1, issues };
  }
  checks++;
  if (ctx.manifest?.__parseError) {
    issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: '基线清单不是合法 JSON' });
    return { checks, issues };
  }
  const widths = (ctx.manifest.widths ?? ctx.manifest.breakpoints ?? []).map(String);
  for (const w of WIDTHS) {
    checks++;
    if (!widths.includes(w)) issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: `缺宽度档 ${w}` });
  }
  return { checks, issues };
}

function checkThreshold(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.found || ctx.manifest?.__parseError) return { checks: 1, issues };
  checks++;
  const threshold = ctx.manifest.threshold ?? ctx.manifest.pixelThreshold ?? ctx.manifest.pixelDiff;
  if (threshold !== 0) issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: `像素差阈值是 ${threshold}，应为 0` });
  checks++;
  const geometry = ctx.manifest.geometry ?? ctx.manifest.assertions ?? [];
  if (!Array.isArray(geometry) || geometry.length < 2) issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: '几何断言少于两条' });
  return { checks, issues };
}

function checkTypography(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.found || ctx.manifest?.__parseError) return { checks: 1, issues };
  const typo = ctx.manifest.typography ?? ctx.manifest.typographyChecks;
  checks++;
  if (!typo) {
    issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: '没有排版观测四项' });
    return { checks, issues };
  }
  const keys = Object.keys(typo);
  for (const want of TYPOGRAPHY) {
    checks++;
    if (!keys.some((k) => k.toLowerCase().includes(want.toLowerCase()))) {
      issues.push({ rule: 'MXV2-7-08', file: ctx.found.rel, msg: `排版观测缺「${want}」` });
    }
  }
  return { checks, issues };
}

function checkShots(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.found) {
    ctx.notes.push('没有视觉基线清单，8-11 的截图要求对当前变更不适用');
    return { checks: 1, issues };
  }
  for (const w of WIDTHS) {
    checks++;
    if (!ctx.shots.some((s) => s.width === w)) issues.push({ rule: 'MXV2-8-11', file: 'frontend/review', msg: `缺宽度档 ${w} 的验收截图` });
  }
  return { checks, issues };
}

function checkDefectsAndSign(ctx) {
  const issues = [];
  let checks = 0;
  if (!ctx.found) return { checks: 1, issues };
  checks++;
  const defects = ctx.manifest.defects ?? ctx.manifest.knownIssues ?? [];
  if (defects.length && !defects.every((d) => WIDTHS.includes(String(d.width ?? d.at ?? '')))) {
    issues.push({ rule: 'MXV2-8-11', file: ctx.found.rel, msg: '缺陷没有记录发生档位' });
  }
  checks++;
  if (!ctx.signatures.length) {
    issues.push({ rule: 'MXV2-8-11', file: 'docs/framework/accept', msg: '没有用户签字的视觉验收记录' });
  }
  return { checks, issues };
}

const CHECKS = [
  { rule: 'MXV2-7-08', run: checkWidths },
  { rule: 'MXV2-7-08', run: checkThreshold },
  { rule: 'MXV2-7-08', run: checkTypography },
  { rule: 'MXV2-8-11', run: checkShots },
  { rule: 'MXV2-8-11', run: checkDefectsAndSign },
];

export function evaluate(root, opts = {}) {
  const ctx = loadCtx(root, opts);
  const selected = selectChecks(CHECKS, opts.rule);
  const { count, issues } = runChecks(selected, ctx);
  const state = ctx.found ? `baseline ${ctx.found.rel}` : 'no baseline manifest';
  return { ctx, count, issues, summary: opts.rule ? undefined : `${state}, ${ctx.shots.length} screenshot(s), ${issues.length} issue(s), ${ctx.notes.length} notice` };
}

function selfTest() {
  const a = createAsserter(NAME);
  const dir = fixtureDir('visual');
  const mk = (mut) => {
    const root = join(dir, mut, 'repo');
    mkdirSync(join(root, 'frontend/review'), { recursive: true });
    mkdirSync(join(root, 'docs/framework/accept'), { recursive: true });
    const widths = mut === 'width' ? ['375', '768', '1180'] : WIDTHS;
    const manifest = {
      widths,
      threshold: mut === 'threshold' ? 0.5 : 0,
      geometry: [
        { width: '375', selector: '.composer', expect: '不遮挡消息列表' },
        { width: '1600', selector: '.rail', expect: '不超出视口' },
      ],
      typography: mut === 'typo' ? { font: 'x', size: '14' } : { font: 'x', size: '14', lineHeight: '1.6', letterSpacing: '0.01em' },
      defects: mut === 'defect' ? [{ width: '999', note: 'x' }] : [{ width: '1180', note: 'x' }],
    };
    writeFileSync(join(root, 'frontend/visual-baseline.json'), JSON.stringify(manifest, null, 2));
    for (const w of WIDTHS) {
      if (mut === 'shot' && w === '768') continue;
      writeFileSync(join(root, 'frontend/review', `visual-${w}-dpr2.png`), 'x');
    }
    writeFileSync(join(root, 'docs/framework/accept/ACCEPT-UI.md'), mut === 'sign' ? '# 验收\n' : '# 验收\n用户签字：需求方\n');
    return root;
  };
  const good = evaluate(mk('good'));
  a.assert(good.issues.length === 0, `通过夹具零问题（实际：${good.issues.map((i) => i.msg).join(' | ')}）`);
  a.assert(good.summary.includes('frontend/visual-baseline.json'), `摘要含基线路径（${good.summary}）`);
  a.assert(good.count >= 12, `检查项数 ≥12（实际 ${good.count}）`);

  const badWidth = evaluate(mk('width'));
  a.assert(badWidth.issues.some((i) => i.rule === 'MXV2-7-08' && i.msg.includes('缺宽度档 1600')), '缺 1600 档被拦下');
  const badThreshold = evaluate(mk('threshold'));
  a.assert(badThreshold.issues.some((i) => i.msg.includes('应为 0')), '非 0 阈值被拦下');
  const badShot = evaluate(mk('shot'));
  a.assert(badShot.issues.some((i) => i.rule === 'MXV2-8-11' && i.msg.includes('768')), '缺截图被拦下');
  const badSign = evaluate(mk('sign'));
  a.assert(badSign.issues.some((i) => i.msg.includes('用户签字')), '没有用户签字被拦下');
  const single = evaluate(mk('good'), { rule: 'MXV2-7-08' });
  a.assert(single.count === 12 && single.issues.length === 0, `--rule 单条模式 checks=${single.count}`);
  a.assert(resolveRuleMode({ listRules: false, rule: 'MXV2-1-09' }, RULES, NAME).code === 2, '不覆盖的规则号退出码 2');
  return a.finish();
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = resolveRuleMode(args, RULES, NAME);
  if (mode.done) process.exit(mode.code);
  if (args.selfTest) process.exit(selfTest());
  const result = evaluate(process.cwd(), { baseline: args.baseline, rule: args.rule });
  for (const note of result.ctx.notes) if (!args.json) console.log(`notice: ${note}`);
  process.exit(printResult({ ...result, rule: args.rule, json: args.json, name: NAME }));
}

if (process.argv[1] && process.argv[1].endsWith('check-visual-baseline.mjs')) main();
