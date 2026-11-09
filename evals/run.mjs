#!/usr/bin/env node
// E0 评测骨架（M1 最小可跑）—— 零第三方依赖，只用 Node 标准库。
//
// 用法：
//   node evals/run.mjs                          # 跑全部 case（WITH 臂）
//   node evals/run.mjs --case health            # 只跑一条
//   node evals/run.mjs --verbose                # 打印每个 grader 的判定
//   node evals/run.mjs --base-url http://127.0.0.1:9000
//   node evals/run.mjs --baseline evals/baselines/m0.json   # M1：占位，不参与判定
//
// 退出码：0 全过 / 1 有失败 / 2 前置条件不满足（服务未启动、case 非法、参数错误）
//
// 环境变量：
//   BASE_URL      被测服务地址（默认 127.0.0.1:8787）
//   AGENTD_HOME   被测服务的**持久数据根**（默认 %USERPROFILE%\.agentd）。
//                 跑评测建议指向独立临时目录，避免污染真实数据；run.mjs 只读取该值用于
//                 打印与诊断，**不会往里写任何东西**（唯一写盘是 M2 的自启临时目录）。
//
// 设计依据：design/17（E0）§2.2/§3/§4；契约 docs/m1-contract.md §3.1/§3.2/§6。
// 刻意取舍：
//   - case 用 JSON 而非 YAML（零依赖，不引 YAML 解析器）；
//   - grader 只用确定性的四种（regex/state_delta/forbidden/file_exists）；
//   - 流式断言走 **WebSocket**（Node 24 内置），SSE 步骤仅作兼容保留；
//   - 断言的是**契约里的可观察行为**，不是当前实现的细节（见"契约诊断"）。

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { request, openSSE } from './lib/http.mjs';
import { connectWS, wsBaseURL } from './lib/ws.mjs';
import { applyVars, applyCtxRefs, collectVarNames, resolvePath, deepEqual, brief } from './lib/resolve.mjs';
import { runGrader, GRADER_NAMES } from './graders/index.mjs';
import { runSelfCheck } from './selftest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const CASES_DIR = path.join(HERE, 'cases');
const CASES_REAL_DIR = path.join(HERE, 'cases-real'); // 真实模型 smoke（低 token，结构断言）

const DEFAULT_BASE_URL = '127.0.0.1:8787';
const DEFAULT_AGENTD_HOME = path.join(os.homedir(), '.agentd');

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = {
    baseURL: process.env.BASE_URL || DEFAULT_BASE_URL,
    // 持久数据根：优先 --agentd-home，其次 AGENTD_HOME，最后平台默认。
    // 只用于显示与诊断；M1 不自行起服，所以真正用哪个由**被测服务进程**的环境决定。
    agentdHome: process.env.AGENTD_HOME || DEFAULT_AGENTD_HOME,
    agentdHomeSource: process.env.AGENTD_HOME ? 'AGENTD_HOME' : 'default',
    caseId: null,
    real: false, // --real：跑 cases-real/（真实模型 smoke），并统计 token
    priceIn: 0, // 每 100 万 input token 的价格（元），用于成本估算；0 = 只报 token
    priceOut: 0,
    verbose: false,
    list: false,
    baseline: null,
    diagnostics: true,
    selfCheck: true,
    timeoutMs: 15_000,
    cliBin: '', // --cli：simo.exe 路径（M20 CLI 矩阵用；默认 <repo>/simo.exe）
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) fail(`参数 ${a} 缺少取值`);
      return v;
    };
    switch (a) {
      case '--base-url':
      case '--base':
        opts.baseURL = next();
        break;
      case '--cli':
        opts.cliBin = next();
        break;
      case '--case':
        opts.caseId = next();
        break;
      case '--real':
        opts.real = true;
        break;
      case '--price-in':
        opts.priceIn = Number(next());
        break;
      case '--price-out':
        opts.priceOut = Number(next());
        break;
      case '--only': {
        // 逗号分隔的 id 列表：分批跑（长套件在受限环境里容易被中断，分批更稳）
        opts.onlyIds = next()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      }
      case '--agentd-home':
        opts.agentdHome = next();
        opts.agentdHomeSource = '--agentd-home';
        break;
      case '--verbose':
      case '-v':
        opts.verbose = true;
        break;
      case '--list':
        opts.list = true;
        break;
      case '--baseline':
        opts.baseline = next();
        break;
      case '--no-diagnostics':
        opts.diagnostics = false;
        break;
      case '--no-selfcheck':
        opts.selfCheck = false;
        break;
      case '--timeout':
        opts.timeoutMs = Number(next());
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        fail(`未知参数 ${a}（--help 看用法）`);
    }
  }
  // 允许 BASE_URL=127.0.0.1:8787（不带协议）
  if (!/^https?:\/\//i.test(opts.baseURL)) opts.baseURL = `http://${opts.baseURL}`;
  return opts;
}

function printHelp() {
  console.log(`E0 评测骨架 (M1)

  node evals/run.mjs [选项]

  --base-url <url>   被测服务地址（默认 ${DEFAULT_BASE_URL}，也可用 BASE_URL 环境变量）
  --case <id>        只跑指定 case
  --only <a,b,c>     只跑逗号分隔的若干 case（分批跑用；套件变长后更稳）
  --cli <path>       simo.exe 路径（M20 CLI 步骤默认 <repo>/simo.exe）
  --agentd-home <p>  被测服务的持久数据根（默认 $AGENTD_HOME 或 ~/.agentd）；只用于显示与诊断
  --list             列出全部 case 后退出
  --verbose, -v      打印每个 grader 的判定细节
  --baseline <file>  WITH/W/OUT 基线（M1 占位：只记录、不参与判定）
  --no-diagnostics   跳过"契约诊断"区块
  --no-selfcheck     跳过 harness 自检（默认开启；自检失败说明评测工具坏了）
  --timeout <ms>     单步默认超时（默认 15000）
  --help, -h         本帮助

  环境变量: BASE_URL（服务地址） / AGENTD_HOME（持久数据根）
  ⚠ 跑评测建议让被测服务用**独立的临时 AGENTD_HOME**，避免污染真实数据：
      $env:AGENTD_HOME="$env:TEMP\agentd-eval"; agentd serve

  退出码: 0 全过 / 1 有失败 / 2 前置不满足（服务未启动等）
`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(2);
}

/**
 * 打印被测服务的持久数据根，并在用默认路径时给出"可能污染真实数据"的提示。
 * 注意：这里打印的是**本进程**解析到的值；被测服务实际用哪个根，取决于它自己启动时的环境。
 * 所以文案写"应与被测服务一致"，而不是断言服务正在用它。
 */
function printDataRoot(opts) {
  const suffix = opts.agentdHomeSource === 'default' ? '（默认值）' : `（来自 ${opts.agentdHomeSource}）`;
  console.log(`持久数据根：${opts.agentdHome}${suffix}`);
  if (opts.agentdHomeSource === 'default') {
    console.log('  ⚠ 未设置 AGENTD_HOME：若被测服务也用默认值，评测会写进真实数据目录。');
    console.log('    建议：$env:AGENTD_HOME="$env:TEMP\\agentd-eval"; 再起服务与跑评测（见 README §1）');
  }
  console.log('');
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const casesDir = opts.real ? CASES_REAL_DIR : CASES_DIR;

  const cases = await loadCases(casesDir, opts.caseId, opts.onlyIds);
  if (opts.list) {
    console.log(`共 ${cases.length} 条 case：`);
    for (const c of cases) console.log(`  - ${c.id.padEnd(18)} ${c.name ?? ''}（${(c.graders || []).length} 个 grader）`);
    return;
  }
  if (cases.length === 0) fail(`未找到 case（目录 ${casesDir}）`);

  // 0) harness 自检：评测工具自身坏掉会给出假红/假绿，所以先验自己再验产品。
  if (opts.selfCheck) {
    const { ok, checks } = await runSelfCheck();
    const bad = checks.filter((c) => !c.pass);
    if (!ok) {
      console.error('');
      console.error('✗ harness 自检失败（评测工具自身有问题，本次结果不可信）');
      for (const c of bad) console.error(`   ✗ ${c.name}：${c.detail}`);
      console.error('   → 修 evals/ 后再跑；`--no-selfcheck` 可跳过（不建议）');
      process.exit(2);
    }
    console.log(`harness 自检：${checks.length}/${checks.length} PASS`);
  }

  // 前置检查：服务是否在跑。这一步的失败信息要足够明确——这是最常见的误用。
  await assertServiceUp(opts.baseURL);
  printDataRoot(opts);

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const results = [];
  const bag = {}; // 跨 case 的观察，供契约诊断使用
  const usageBefore = opts.real ? await usageSnapshot(opts.baseURL) : null;

  for (const c of cases) {
    // pending：外部还无法断言的 case（等后端提供 seam）。不执行、不计入 PASS/FAIL。
    if (c.pending) {
      results.push({
        id: c.id,
        name: c.name,
        pass: true,
        pending: true,
        pendingReason: String(c.pending),
        ms: 0,
        graders: [],
      });
      continue;
    }
    const uBefore = opts.real ? await usageSnapshot(opts.baseURL) : null;
    let record = await runCase(c, opts, runId, bag);
    if (!record.pass && c.retry && c.retry.max > 0) {
      const failed = record.graders.filter((g) => !g.pass).map((g) => g.name);
      const passed = record.graders.filter((g) => g.pass).map((g) => g.name);
      const subset = c.retry.ifFailedSubsetOf || [];
      const required = c.retry.requirePassed || [];
      const retryable = failed.length > 0 && failed.every((n) => subset.includes(n)) && required.every((n) => passed.includes(n));
      if (retryable) {
        const retriedRun = await runCase(c, opts, runId + "r", bag);
        retriedRun.retried = 1;
        record = retriedRun;
      }
    }
    if (opts.real && uBefore) {
      const uAfter = await usageSnapshot(opts.baseURL);
      record.tokens = diffUsage(uBefore, uAfter);
    }
    results.push(record);
  }

  printTable(results, opts);

  if (opts.diagnostics) await printContractDiagnostics(opts.baseURL, bag, opts);

  const pending = results.filter((r) => r.pending);
  const graded = results.filter((r) => !r.pending);
  const failed = graded.filter((r) => !r.pass);
  console.log('');
  console.log(
    `WITH 臂：${graded.length - failed.length}/${graded.length} PASS` +
      (pending.length ? `  |  PENDING：${pending.length}（不计入门禁）` : '') +
      `  |  W/OUT：跳过（M1/M2 只跑 WITH）` +
      `  |  Δ：n/a` +
      (opts.baseline ? `  |  基线：${opts.baseline}（占位）` : ''),
  );
  for (const p of pending) console.log(`  ⏳ ${p.id}：${p.pendingReason}`);
  const retriedCases = results.filter((r) => r.retried);
  if (retriedCases.length) console.log(`retried: ${retriedCases.length} case(s) - ${retriedCases.map((r) => r.id).join(', ')}`);
  console.log(`grader 可用：${GRADER_NAMES.join(' / ')}`);
  if (opts.real) await reportTokenUsage(results, opts, usageBefore);

  if (failed.length) {
    console.log('');
    console.log(`✗ ${failed.length} 条失败：${failed.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- case 装载

async function loadCases(dir, onlyId, onlyIds) {
  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    fail(`case 目录不存在：${dir}`);
  }
  const files = entries.filter((f) => f.endsWith('.json')).sort();
  const out = [];
  for (const f of files) {
    const abs = path.join(dir, f);
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(abs, 'utf8'));
    } catch (e) {
      fail(`case 文件不是合法 JSON：${f}（${e.message}）`);
    }
    raw.__file = f;
    if (!raw.id) fail(`case 缺少 id：${f}`);
    if (!Array.isArray(raw.steps) || raw.steps.length === 0) fail(`case ${raw.id} 缺少 steps[]`);
    if (!Array.isArray(raw.graders) || raw.graders.length === 0) fail(`case ${raw.id} 缺少 graders[]`);
    if (onlyId && raw.id !== onlyId) continue;
    if (onlyIds && !onlyIds.includes(raw.id)) continue;
    out.push(raw);
  }
  if (onlyId && out.length === 0) fail(`找不到 case id '${onlyId}'`);
  if (onlyIds && out.length === 0) fail(`--only 里的 id 都匹配不到：${onlyIds.join(',')}`);
  return out;
}

// ---------------------------------------------------------------- 跑一条 case

async function runCase(c, opts, runId, bag) {
  const started = Date.now();
  const ctx = { case: c.id };
  const vars = {
    runId,
    // 每条 case 一个独立会话：避免 WS subscribe 回放历史、以及并行 case 的任务/流互相污染。
    // 后端接受任意 sessionId（首次写入即建），所以不需要先创建会话。
    caseSession: `evals-${c.id}-${runId}`,
    // 被测服务的持久数据根：M5 起要断言"产物真的写进 workspace"（如 <home>/workspace/notes.md）
    agentdHome: opts.agentdHome,
    ...(c.vars || {}),
  };

  // 未定义变量 = 直接判失败（对应 E3「未知变量即编译失败」的纪律）
  const used = collectVarNames({ steps: c.steps, graders: c.graders });
  const missing = [...used].filter((v) => !(v in vars));
  if (missing.length) {
    return {
      id: c.id,
      name: c.name,
      pass: false,
      ms: 0,
      graders: c.graders.map((g) => ({
        name: g.id ?? g.type,
        pass: false,
        detail: `未定义变量：${missing.join(', ')}（在 case 的 vars 里声明）`,
      })),
    };
  }

  const steps = applyVars(c.steps, vars);
  const graders = applyVars(c.graders, vars);

  // 1) 执行步骤，产出观察
  for (const step of steps) {
    try {
      await runStep(step, ctx, opts, bag);
    } catch (e) {
      return {
        id: c.id,
        name: c.name,
        pass: false,
        ms: Date.now() - started,
        error: `步骤失败（${step.type}${step.path ? ` ${step.path}` : ''}）：${e.message}`,
        graders: [],
      };
    }
  }

  // 2) 跑 grader（确定性，逐个独立）
  //    注意：grader 也可能引用前序观察（如 `where: {id: "{{@retractedId}}"}`）。
  //    不在这里展开，grader 会拿字面量去匹配 → 永远 0 条（曾真实发生过，见 selftest.mjs）。
  const graderResults = [];
  for (const g of graders) {
    const spec = { ...applyCtxRefs(g, ctx) };
    const name = spec.type;
    delete spec.type;
    const r = await runGrader(name, ctx, spec);
    graderResults.push({ name, pass: r.pass, detail: r.detail });
  }

  return {
    id: c.id,
    name: c.name,
    pass: graderResults.every((g) => g.pass),
    ms: Date.now() - started,
    graders: graderResults,
  };
}

// ---------------------------------------------------------------- 步骤类型

/**
 * CLI 步骤（M20）：直接调用 simo.exe。
 * 沙箱里 Node 不能用管道捕获子进程输出，因此把 stdout/stderr 重定向到临时文件再读回。
 * spec: { type:'cli', args:[...], bin?, env?, cwd?, expectExit?, timeoutMs?, saveAs }
 * 观测：{ exitCode, signal, stdout, stderr, timedOut, args, bin }
 */
async function cliStep(step, opts) {
  const bin = step.bin || opts.cliBin || path.join(REPO_ROOT, 'simo.exe');
  if (!fsSync.existsSync(bin)) {
    throw new Error(`cli: 找不到 CLI 可执行文件 ${bin}（用 --cli 指定）`);
  }
  const args = (step.args || []).map((a) => String(a));
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'evals-cli-'));
  const outPath = path.join(dir, 'stdout.txt');
  const errPath = path.join(dir, 'stderr.txt');
  const outFd = fsSync.openSync(outPath, 'w');
  const errFd = fsSync.openSync(errPath, 'w');
  const env = { ...process.env, SIMO_BASE_URL: opts.baseURL, AGENTD_HOME: opts.agentdHome, ...(step.env || {}) };
  let res;
  try {
    res = spawnSync(bin, args, {
      cwd: step.cwd || process.cwd(),
      env,
      stdio: ['ignore', outFd, errFd],
      timeout: step.timeoutMs ?? opts.timeoutMs,
      windowsHide: true,
    });
  } finally {
    fsSync.closeSync(outFd);
    fsSync.closeSync(errFd);
  }
  const stdout = fsSync.readFileSync(outPath, 'utf8');
  const stderr = fsSync.readFileSync(errPath, 'utf8');
  fsSync.rmSync(dir, { recursive: true, force: true });

  const exitCode = typeof res.status === 'number' ? res.status : -1;
  const obs = { exitCode, signal: res.signal || '', timedOut: res.error?.code === 'ETIMEDOUT', stdout, stderr, args, bin };
  if (step.expectExit !== undefined) {
    const exp = Array.isArray(step.expectExit) ? step.expectExit : [step.expectExit];
    if (!exp.includes(exitCode)) {
      throw new Error(`cli: 退出码 ${exitCode} 不在期望 ${exp.join('/')}（${bin} ${args.join(' ')}）stderr=${brief(stderr, 200)}`);
    }
  }
  return obs;
}

async function runStep(step, ctx, opts, bag) {
  // 运行时引用（{{@前序观察}}）必须在**执行前**展开：此时 ctx 已有前序步骤的产出。
  const s = applyCtxRefs(step, ctx);
  switch (s.type) {
    case 'http': {
      const obs = await httpStep(s, opts);
      save(ctx, s.saveAs, obs);
      if (s.saveAs) bag[s.saveAs] = obs; // 供契约诊断
      return;
    }
    case 'cli': {
      const obs = await cliStep(s, opts);
      save(ctx, s.saveAs, obs);
      if (s.saveAs) bag[s.saveAs] = obs;
      return;
    }
    case 'ws': {
      const obs = await wsStep(s, ctx, opts, bag);
      save(ctx, s.saveAs, obs);
      return;
    }
    case 'poll': {
      const obs = await pollStep(s, ctx, opts);
      save(ctx, s.saveAs, obs);
      if (s.saveAs) bag[s.saveAs] = obs;
      return;
    }
    case 'capture': {
      // 把前序观察里的一条记录抽成标量/对象，供 `{{@...}}` 与 grader 引用。
      const value = await captureStep(s, ctx);
      save(ctx, s.saveAs, value);
      return;
    }
    case 'fs': {
      // 在**步骤序列的这一点**检查文件状态（file_exists grader 只在末尾跑，证明不了"中间态"）。
      // spec: { type:'fs', path, root? } → 观察 { exists, size, path }
      const obs = await fsStep(s);
      save(ctx, s.saveAs, obs);
      return;
    }
    case 'wait': {
      // 固定等待：用于"暂停后等一会儿，确认没有新任务启动""超时后才断言"这类场景。
      // spec: { type:'wait', ms }
      const ms = Number(s.ms ?? 1000);
      if (!Number.isFinite(ms) || ms < 0 || ms > 120000) throw new Error(`wait: ms 非法（${s.ms}）`);
      await sleep(ms);
      save(ctx, s.saveAs, { waitedMs: ms });
      return;
    }
    case 'sse': {
      // 兼容保留：契约 §3.2 起流式走 WebSocket。
      const obs = await sseStep(s, ctx, opts, bag);
      save(ctx, s.saveAs, obs);
      return;
    }
    default:
      throw new Error(`未知步骤类型 '${s.type}'（可用: http / ws / poll / capture / fs / wait / sse）`);
  }
}

/** 目录下最新文件 mtime（毫秒）；用于判断"被测服务是否真的在写这个 home"。 */
async function newestHomeMtime(home) {
  let newest = 0;
  let entries;
  try {
    entries = await fs.readdir(home, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (!e.isFile()) continue;
    try {
      const st = await fs.stat(path.join(home, e.name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      /* 忽略单个文件的 stat 失败 */
    }
  }
  return newest;
}

/**
 * 把 case JSON 里的 multipart 描述转成真实 Buffer。
 * 文件体两种写法：`content`（字符串）或 `sizeBytes`+`fill`（生成大文件用于限额测试，
 * 避免在 case 文件里塞 20MB base64）。
 */
function materializeMultipart(mp) {
  if (!mp) return undefined;
  const files = (mp.files || []).map((f) => {
    let data;
    if (typeof f.sizeBytes === 'number') {
      data = Buffer.alloc(f.sizeBytes, f.fill ?? 0x61); // 默认填 'a'
    } else {
      data = Buffer.from(String(f.content ?? ''), 'utf8');
    }
    return { field: f.field || 'file', filename: f.filename, mime: f.mime, data };
  });
  return { fields: mp.fields || {}, files };
}

async function fsStep(step) {
  if (!step.path) throw new Error('fs: 缺少 path');
  const root = step.root ? path.resolve(step.root) : REPO_ROOT;
  const abs = path.isAbsolute(step.path) ? step.path : path.resolve(root, step.path);
  if (step.op === 'remove') {
    // 用例自清理：保证"文件不存在"类断言不受上一次运行残留影响（幂等）
    let removed = false;
    try {
      await fs.unlink(abs);
      removed = true;
    } catch {
      removed = false;
    }
    return { exists: false, size: 0, path: abs, removed };
  }
  let stat = null;
  try {
    stat = await fs.stat(abs);
  } catch {
    stat = null;
  }
  return {
    exists: !!stat,
    isFile: !!stat && stat.isFile(),
    isDir: !!stat && stat.isDirectory(),
    size: stat ? stat.size : 0,
    path: abs,
  };
}

async function httpStep(step, opts) {
  const hasCandidates = Array.isArray(step.candidate) && step.candidate.length > 0;
  if (!step.path && !hasCandidates) throw new Error('http 步骤缺少 path（或用 candidate 给候选端点）');

  // candidate：契约未定的端点（如"归档到底是 POST /archive 还是 PATCH archived=1"）。
  // 依次尝试，遇到 404/405 视为"这个形状没实现"再试下一个；其余状态一律采纳。
  // spec: { candidate: [{method, path, body}, ...] }
  const variants = hasCandidates ? step.candidate : [{ method: step.method, path: step.path, body: step.body, headers: step.headers }];

  let res = null;
  const tried = [];
  for (const v of variants) {
    // bodies：同一端点、不同请求体的候选（如"切 danger-full-access 的确认标记名未定"）。
    // 依次尝试，命中 expectStatus 即采纳；都不命中则保留最后一次结果（由下面的断言报错并列出尝试过什么）。
    const bodyVariants = Array.isArray(step.bodies) && v.body === undefined ? step.bodies : [v.body];
    const wantStatuses = step.expectStatus === undefined ? null : Array.isArray(step.expectStatus) ? step.expectStatus : [step.expectStatus];
    for (const body of bodyVariants) {
      const r = await request(opts.baseURL, {
        method: v.method || 'GET',
        path: v.path,
        body,
        multipart: materializeMultipart(v.multipart ?? step.multipart),
        headers: v.headers ?? step.headers,
        timeoutMs: step.timeoutMs ?? opts.timeoutMs,
      });
      tried.push(`${v.method || 'GET'} ${v.path}${body !== undefined ? ` body=${brief(body, 80)}` : ''} → ${r.status}`);
      res = r;
      if (![404, 405].includes(r.status)) {
        if (!wantStatuses || wantStatuses.includes(r.status)) break;
      }
    }
    if (![404, 405].includes(res.status)) break;
  }

  if (step.expectStatus !== undefined) {
    const want = Array.isArray(step.expectStatus) ? step.expectStatus : [step.expectStatus];
    if (!want.includes(res.status)) {
      const used = tried.length > 1 ? `（已尝试：${tried.join('；')}）` : '';
      throw new Error(
        `HTTP ${step.method || 'GET'} ${step.path} 返回 ${res.status}，期望 ${want.join('/')}${used}；响应: ${brief(res.body, 200)}`,
      );
    }
  }
  if (tried.length > 1) res.candidatesTried = tried;
  return res;
}

async function sseStep(step, ctx, opts, bag) {
  const untilEvent = step.until?.event || 'message.done';
  const totalTimeout = step.until?.timeoutMs ?? opts.timeoutMs;
  const during = step.during || [];

  const events = [];
  const names = [];
  const rawChunks = [];
  let sseError = null;
  let opened = false;

  const stream = openSSE(opts.baseURL, {
    path: step.path,
    onEvent: (ev) => {
      opened = true;
      events.push(ev);
      names.push(ev.event);
      rawChunks.push(`event: ${ev.event}\ndata: ${ev.data}`);
    },
    onError: (e) => {
      sseError = e;
    },
  });

  // 等连接真的建立（收到首个事件）——否则先 POST 会漏掉 message.created。
  // 契约要求连上即发 hello；为了容错，最多等 2s，超时也继续（记在 obs.warnings）。
  const warnings = [];
  await waitFor(() => opened || sseError, 2_000, 25);
  if (sseError) {
    stream.close();
    throw new Error(`SSE 连接失败：${sseError.message}`);
  }
  if (!opened) warnings.push('连接后 2s 内未收到任何事件（契约要求连上即发 hello）');

  // 连接就绪后再执行 during（典型是 POST /api/chat）
  for (const d of during) {
    if (d.type === 'http') {
      const obs = await httpStep(d, opts);
      save(ctx, d.saveAs, obs);
      bag[d.saveAs] = obs;
    } else if (d.type === 'sse') {
      throw new Error('不支持 sse 步骤内嵌 sse 步骤');
    } else {
      throw new Error(`during 内不支持步骤类型 '${d.type}'`);
    }
  }

  // 等到终止事件或超时
  const ok = await waitFor(() => names.includes(untilEvent) || sseError, totalTimeout, 20);
  if (sseError) {
    stream.close();
    throw new Error(`SSE 流错误：${sseError.message}`);
  }
  if (!ok) {
    stream.close();
    throw new Error(
      `SSE 等待 '${untilEvent}' 超时（${totalTimeout}ms）；已收到 ${names.length} 个事件: ${names.join('>') || '(无)'}`,
    );
  }
  stream.close();
  await Promise.race([stream.done, sleep(200)]);

  return {
    events,
    names,
    // trace 用 '>' 连接，便于用一条 regex 断言"事件顺序子序列"
    trace: names.join('>'),
    raw: rawChunks.join('\n'),
    warnings,
  };
}

/**
 * ws 步骤：连 `/api/ws` → `subscribe` → 等 `hello` → `chat` → 等终点帧。
 * 契约 §3.2：所有帧为 `{type, data}` 信封。
 *
 * case 字段：
 *   path        ws 路径（默认 `/api/ws`）
 *   sessionId   会话 id（可选；省略则由服务端用默认会话）
 *   subscribe   是否发 subscribe 帧（默认 true）
 *   chat        发消息：`{text}` 或完整 data 对象；省略则不发
 *   afterHello  额外帧数组（高级用例）
 *   onDelta     **收到第一帧 `*.delta` 时**发一次（用于"流式中打断"，如 `correct`）
 *   until       `{type, timeoutMs, all?}`，默认等 `message.done`；`all` 是必须出现的帧类型清单
 * 产出：`{frames, types, trace, raw, counts, warnings, url}`
 *
 * 帧内插值：`{{this.replyId}}` 会被替换成"目前为止最近一条 agent 回复的 id"，
 * 让 `correct.targetMessageId` 这类字段不需要外部先知道 id。
 */
async function wsStep(step, ctx, opts, bag) {
  const wsPath = step.path || '/api/ws';
  const sessionId = step.sessionId;
  // until.type 支持字符串或数组：M1 用 message.*，M2 新增 reply.*，两者可能并存
  const untilTypes = Array.isArray(step.until?.type)
    ? step.until.type
    : [step.until?.type || 'message.done'];
  const totalTimeout = step.until?.timeoutMs ?? opts.timeoutMs;
  const drainMs = step.drainMs ?? 0;
  // 只有**显式把 error 写进 until.type** 的 case 才把 error 帧当作"预期终止帧"
  // （例如归档会话的 chat 拒绝）；其余 case 收到 error 帧仍然直接失败。
  const expectError = untilTypes.includes('error');

  let url = `${wsBaseURL(opts.baseURL)}${wsPath}`;
  if (sessionId && !/[?&]sessionId=/.test(url)) {
    url += `${url.includes('?') ? '&' : '?'}sessionId=${encodeURIComponent(sessionId)}`;
  }

  const frames = [];
  // WS subscribe 会**回放历史事件**（契约 §3.2 `since` 语义）。为了让断言只看到"本次请求之后"
  // 的帧，可用 `collectAfterText` 指定一个标记文本：见到包含该文本的帧后才开始收集。
  // 标记通常就是本 case 的 probe 文本（唯一），它会出现在用户消息的 `message.created` 里。
  const marker = step.collectAfterText;
  let collecting = !marker;
  const scoped = [];
  const warnings = [];
  let wsError = null;
  let opened = false;
  let deltaSent = false;

  /** 最近一条 agent 回复的 id（reply.created / message.created 且 role 为 agent 或未标） */
  const latestReplyId = () => {
    for (let i = frames.length - 1; i >= 0; i--) {
      const f = frames[i];
      const isCreated = f.type === 'reply.created' || f.type === 'message.created';
      if (!isCreated || !f.data || typeof f.data.id !== 'string') continue;
      if (f.data.role === undefined || f.data.role === 'agent') return f.data.id;
    }
    return '';
  };

  /** 递归替换帧里的 `{{this.replyId}}`。 */
  const expandThis = (value) => {
    if (typeof value === 'string') return value.replace(/\{\{\s*this\.replyId\s*\}\}/g, () => latestReplyId());
    if (Array.isArray(value)) return value.map(expandThis);
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = expandThis(v);
      return out;
    }
    return value;
  };

  const conn = connectWS(url, {
    onFrame: (f) => {
      opened = true;
      frames.push(f);
      if (!collecting && f.data && typeof f.data.text === 'string' && f.data.text.includes(marker)) {
        collecting = true;
      }
      if (collecting) scoped.push(f);
      // 收到首个增量帧时，按需发"流式中打断"帧（如 correct）
      if (!deltaSent && /\.delta$/.test(f.type) && Array.isArray(step.onDelta) && step.onDelta.length) {
        deltaSent = true;
        for (const fr of step.onDelta) conn.send(expandThis(fr));
      }
    },
    onError: (e) => {
      wsError = e;
    },
    onClose: (c) => {
      if (!frames.some((f) => untilTypes.includes(f.type))) {
        warnings.push(`连接在终止帧 '${untilTypes.join('/')}' 之前关闭（code=${c.code}${c.reason ? `, ${c.reason}` : ''}）`);
      }
    },
    connectTimeoutMs: 5_000,
  });

  try {
    await conn.opened;
  } catch (e) {
    conn.close();
    throw new Error(
      `WebSocket 连接失败：${e.message}。若服务尚未实现 /api/ws（契约 §3.2），或仍在使用 SSE，请先对齐后端`,
    );
  }

  // 1) subscribe
  if (step.subscribe !== false) {
    conn.send({ type: 'subscribe', data: sessionId ? { sessionId } : {} });
  }

  // 2) 等 hello（2s 容错；超时继续，但记 warning——顺序断言会暴露它）
  await waitFor(() => opened || wsError, 2_000, 25);
  if (wsError) {
    conn.close();
    throw new Error(`WebSocket 错误：${wsError.message}`);
  }
  if (!frames.some((f) => f.type === 'hello')) {
    warnings.push('subscribe 后 2s 内未收到 hello（契约 §3.2）');
  }

  const errorFrame = frames.find((f) => f.type === 'error');
  let rejectedBeforeChat = false;
  if (errorFrame) {
    if (!expectError) {
      conn.close();
      throw new Error(`服务端返回 error 帧：${brief(errorFrame.data, 200)}`);
    }
    // 预期内的拒绝：不发送 chat，直接进入收尾（waitFor 会立刻因 error 帧满足）
    rejectedBeforeChat = true;
  }

  // 3) chat
  if (step.chat && !rejectedBeforeChat) {
    const data = typeof step.chat === 'object' && 'text' in step.chat ? { ...step.chat } : { text: String(step.chat) };
    if (sessionId && !data.sessionId) data.sessionId = sessionId;
    conn.send({ type: 'chat', data });
  }

  // 4) afterHello 附加帧
  if (!rejectedBeforeChat) {
    for (const extra of step.afterHello || []) conn.send(expandThis(extra));
  }

  // 5) 等终止帧（只看 scoped：避免被 subscribe 回放的历史帧提前满足）
  const ok = await waitFor(
    () => scoped.some((f) => untilTypes.includes(f.type)) || scoped.some((f) => f.type === 'error') || wsError,
    totalTimeout,
    20,
  );

  // 5b) drain：命中终止帧后再收一小段时间，避免"拿不到突发里的后续帧"。
  //     并发/并行类 case 需要它（不能一看到第一个 done 就关连接）。
  if (ok && drainMs > 0) await sleep(drainMs);

  conn.close();
  await Promise.race([conn.done, sleep(200)]);

  // 预期内的 error 是**终止帧**：它之后的帧不属于本轮（例如 drain 窗口里混进来的
  // 其它会话/后台任务广播），断言不应看到。截断到 error（含）为止。
  let visible = scoped;
  if (expectError) {
    const idx = scoped.findIndex((f) => f.type === 'error');
    if (idx >= 0) visible = scoped.slice(0, idx + 1);
  }

  const err = visible.find((f) => f.type === 'error');
  if (err && !expectError) throw new Error(`服务端返回 error 帧：${brief(err.data, 200)}`);
  if (wsError) throw new Error(`WebSocket 错误：${wsError.message}`);
  if (!ok) {
    const types = visible.map((f) => f.type);
    throw new Error(
      `WebSocket 等待帧 '${untilTypes.join('/')}' 超时（${totalTimeout}ms）；已收到 ${visible.length}/${frames.length} 帧: ${types.join('>') || '(无)'}`,
    );
  }

  // 若声明了必须出现的帧类型，逐个补齐（用于"等多个终点"的 case）
  for (const reqType of step.until?.all || []) {
    if (!visible.some((f) => f.type === reqType)) {
      const types = visible.map((f) => f.type);
      throw new Error(`WebSocket 未收到必需帧 '${reqType}'；已收到 ${types.join('>') || '(无)'}`);
    }
  }

  const types = visible.map((f) => f.type);
  return {
    frames: visible,
    // 全量帧（含 subscribe 回放的历史），仅用于排查；断言请用 frames
    allFrames: frames,
    types,
    // trace 用 '>' 连接，便于用一条 regex 断言"帧顺序子序列"
    trace: types.join('>'),
    raw: visible.map((f) => f.raw).join('\n'),
    warnings,
    url,
    // 供 grader/capture 直接取"按类型分组"的视图，避免写点路径时数下标
    counts: types.reduce((acc, t) => ((acc[t] = (acc[t] || 0) + 1), acc), {}),
    scoped: Boolean(marker),
  };
}

/**
 * poll 步骤：反复请求同一 REST 路径，直到某个数组里出现匹配项（或超时）。
 * 用途：等待异步回复落定——"POST 后 GET 能查到"的**持续版**（不必依赖流式通道）。
 *
 * case 字段：`method/path/intervalMs/timeoutMs/saveAs` +
 *   `until: { path: "json.messages", matchSome: {role:"agent",status:"done"} }`
 */
async function pollStep(step, ctx, opts) {
  const interval = step.intervalMs ?? 150;
  const timeout = step.timeoutMs ?? opts.timeoutMs;
  const until = step.until || {};
  const deadline = Date.now() + timeout;
  let last = null;
  let lastCount = -1;

  while (Date.now() < deadline) {
    last = await httpStep({ ...step, expectStatus: step.expectStatus ?? 200 }, opts);
    // 单个对象也允许（如 /api/schedules/{id} 返回 {schedule:{...}}）→ 当作单元素数组
    const resolved = resolvePath(last, until.path);
    const arr = resolved && !Array.isArray(resolved) && typeof resolved === 'object' ? [resolved] : resolved;
    if (!Array.isArray(arr)) {
      throw new Error(`poll: '${until.path}' 不是数组（实际 ${arr === undefined ? '未产出' : typeof arr}）`);
    }
    lastCount = arr.length;
    if (until.matchSome && arr.some((item) => matchesSome(item, until.matchSome))) return last;
    await sleep(interval);
  }

  throw new Error(
    `poll 超时（${timeout}ms）：'${until.path}' 中未出现匹配 ${brief(until.matchSome, 120)} 的条目（共 ${lastCount} 条）`,
  );
}

/** 逐字段匹配（key 支持点路径，便于直接对 WS 帧数组 `{"data.id": "..."}` 过滤）。 */
function matchesSome(item, matchSome) {
  if (!item || typeof item !== 'object') return false;
  return Object.entries(matchSome).every(([k, v]) => deepEqual(resolvePath(item, k), v));
}

/**
 * capture 步骤：从前序观察的**数组**里挑一条，取出某个字段存进 ctx。
 * 这是"上一步的产出喂给下一步"的结构化版本——比在字符串里拼点路径可读得多。
 *
 * case 字段：
 *   from   ctx 点路径（须为数组，如 `stream.frames`）
 *   where  匹配条件；key 支持点路径（`data.id`）
 *   pick   从命中项取哪个字段（点路径）；省略则取整条
 *   last   true = 取最后一条（默认第一条）
 *   mode   'array' = 保存**过滤后的整个数组**（而不是第一条）
 *   from   也可以是**候选路径数组**：契约未定一级键名时（如 `sessions` vs `tree`），
 *          取第一个能解析成数组的路径——不用赌信封键名，断言仍落在数组元素上。
 *   whereContains  {field: 子串}：按"包含"过滤（用于唯一标题/内容标记）
 *   saveAs 存进 ctx，后续用 `{{@saveAs}}` 引用
 */
async function captureStep(step, ctx) {
  const candidates = Array.isArray(step.from) ? step.from : [step.from];
  let arr = null;
  let usedPath = null;
  for (const p of candidates) {
    const v = resolvePath(ctx, p);
    if (Array.isArray(v)) {
      arr = v;
      usedPath = p;
      break;
    }
    // 单个对象也允许（如 detail.json.workflow）→ 当作只有一个元素的数组
    if (v && typeof v === 'object') {
      arr = [v];
      usedPath = p;
      break;
    }
  }
  if (!arr) {
    const seen = candidates
      .map((p) => {
        const v = resolvePath(ctx, p);
        return `${p}=${v === undefined ? '未产出' : Array.isArray(v) ? 'array' : typeof v}`;
      })
      .join(', ');
    throw new Error(`capture: 候选路径都没有数组（${seen}）`);
  }

  const matched = arr.filter((item) => matchesItem(item, step.where || {}, step.whereContains || {}));
  if (matched.length === 0) {
    throw new Error(
      `capture: 在 '${usedPath}' 中找不到匹配 ${brief(step.where, 80)}${
        step.whereContains ? ` 且包含 ${brief(step.whereContains, 80)}` : ''
      } 的条目（共 ${arr.length} 条）`,
    );
  }
  if (step.mode === 'array') return matched;
  const item = step.last ? matched[matched.length - 1] : matched[0];
  return step.pick ? resolvePath(item, step.pick) : item;
}

/** 精确匹配 where + 子串匹配 whereContains（两者的 key 都支持点路径）。 */
function matchesItem(item, where, whereContains = {}) {
  const exactKeys = Object.keys(where || {});
  const containsKeys = Object.keys(whereContains || {});
  if (exactKeys.length === 0 && containsKeys.length === 0) return true;
  if (!item || typeof item !== 'object') return false;
  const exactOk = Object.entries(where).every(([k, v]) => deepEqual(resolvePath(item, k), v));
  if (!exactOk) return false;
  return Object.entries(whereContains).every(([k, needle]) => {
    const hay = resolvePath(item, k);
    return typeof hay === 'string' && hay.includes(String(needle));
  });
}

function save(ctx, key, value) {
  if (!key) return;
  ctx[key] = value;
}

// ---------------------------------------------------------------- 前置检查 / 诊断

async function assertServiceUp(baseURL) {
  let res;
  try {
    res = await request(baseURL, { path: '/api/health', timeoutMs: 3_000 });
  } catch (e) {
    const code = e && (e.code || (e.cause && e.cause.code));
    const hint =
      code === 'ECONNREFUSED' || code === 'ECONNRESET' || /ECONNREFUSED/.test(String(e.message))
        ? '连接被拒绝'
        : e.message;
    console.error('');
    console.error('✗ 服务未启动');
    console.error(`  无法连接 ${baseURL}（${hint}）`);
    console.error('');
    console.error('  请先在另一个终端启动被测服务，例如：');
    console.error('    agentd serve                       # 默认 127.0.0.1:8787');
    console.error('    agentd serve -addr 127.0.0.1:9000 # 换端口后用 --base-url 指过来');
    console.error('');
    process.exit(2);
  }
  if (res.status !== 200) {
    console.error('✗ 服务未就绪');
    console.error(`  GET /api/health 返回 ${res.status}（期望 200）；响应: ${brief(res.body, 200)}`);
    process.exit(2);
  }
  console.log(`被测服务：${baseURL}（/api/health → 200, ${res.ms}ms）`);
  console.log('');
}

/**
 * 契约诊断：只报告、不计入 PASS/FAIL。
 * 目的：让"实现与契约的偏差"可见，而不是让 case 变红——case 只断言用户可感知的行为。
 */
async function printContractDiagnostics(baseURL, bag, opts) {
  const rows = [];
  const add = (name, ok, note) => rows.push({ name, ok, note });

  // 0) 被测服务真的在用这个 AGENTD_HOME 吗？
  //    两套服务/评测进程共用同一端口时，评测会连到**别人的实例**：审批写进了别人的 workspace、
  //    任务状态来自别人的库 → 表现为"allow 后文件不存在""WS 错误/超时"这类假失败。
  //    判据：本 case 刚跑完 ~1 分钟，若该目录最近一次写入已超过 120s，就说明本次运行没写进这里。
  try {
    const newest = await newestHomeMtime(opts.agentdHome);
    if (!newest) {
      add(
        '被测服务写入本 AGENTD_HOME',
        false,
        `${opts.agentdHome} 下没有任何文件（服务很可能在用别的 AGENTD_HOME）`,
      );
    } else {
      const ageSec = Math.round((Date.now() - newest) / 1000);
      add(
        '被测服务写入本 AGENTD_HOME',
        ageSec < 120,
        ageSec < 120 ? `最近写入 ${ageSec}s 前` : `最近写入 ${ageSec}s 前（超过 120s：**疑似连到了另一个 agentd 实例/home**）`,
      );
    }
  } catch (e) {
    add('被测服务写入本 AGENTD_HOME', false, e.message);
  }

  // 1) GET /api/sessions（契约 §3）
  try {
    const r = await request(baseURL, { path: '/api/sessions', timeoutMs: 3_000 });
    const isHTML = /text\/html/i.test(String(r.headers['content-type'] || '')) || /^\s*</.test(r.body);
    if (r.status === 200 && Array.isArray(r.json?.sessions)) {
      add('GET /api/sessions', true, `${r.json.sessions.length} 个会话`);
    } else if (r.status === 404) {
      add('GET /api/sessions', false, '未实现（契约 §3 要求）');
    } else if (isHTML) {
      // 未注册的 /api/* 被 SPA fallback 兜住：返回 200 + index.html，最容易误判为"已实现"
      add('GET /api/sessions', false, '未实现（请求被 SPA fallback 兜住，返回 index.html 而非 JSON）');
    } else {
      add('GET /api/sessions', false, `HTTP ${r.status}，响应体无 sessions[]`);
    }
  } catch (e) {
    add('GET /api/sessions', false, e.message);
  }

  // 2) POST /api/chat 返回字段：契约是 messageId（复用 case 里已捕获的响应，避免再发一次）
  const post = bag.post;
  if (post && post.json) {
    if (typeof post.json.messageId === 'string') add('POST /api/chat → messageId', true, post.json.messageId);
    else if (typeof post.json.id === 'string')
      add('POST /api/chat → messageId', false, `返回的是 id（${post.json.id}），契约字段名为 messageId`);
    else add('POST /api/chat → messageId', false, `响应体无 messageId: ${brief(post.body, 120)}`);
  }

  // 3) GET /api/messages 是否按 sessionId 过滤（契约 §3 带 sessionId 参数）
  try {
    const all = await request(baseURL, { path: '/api/messages', timeoutMs: 3_000 });
    const filtered = await request(baseURL, { path: '/api/messages?sessionId=evals-no-such-session', timeoutMs: 3_000 });
    const nAll = Array.isArray(all.json?.messages) ? all.json.messages.length : -1;
    const nFiltered = Array.isArray(filtered.json?.messages) ? filtered.json.messages.length : -1;
    if (nFiltered === 0) add('GET /api/messages 按 sessionId 过滤', true, `不存在的 sessionId → 0 条`);
    else if (nAll === nFiltered)
      add('GET /api/messages 按 sessionId 过滤', false, `不存在的 sessionId 仍返回 ${nFiltered} 条（未过滤）`);
    else add('GET /api/messages 按 sessionId 过滤', false, `全量 ${nAll} 条 / 过滤后 ${nFiltered} 条（行为不明）`);
  } catch (e) {
    add('GET /api/messages 按 sessionId 过滤', false, e.message);
  }

  // 4) WebSocket 端点（契约 §3.2）
  try {
    const url = `${wsBaseURL(baseURL)}/api/ws`;
    const probe = connectWS(url, { connectTimeoutMs: 3_000 });
    await Promise.race([
      probe.opened.then(() => 'open'),
      probe.done.then(() => 'closed'),
      sleep(3_000).then(() => 'timeout'),
    ]).then((r) => {
      if (r === 'open') add('WS /api/ws 可连接', true, '握手成功');
      else add('WS /api/ws 可连接', false, r === 'timeout' ? '3s 内未升级成功' : '连接被关闭（可能未实现 WS）');
    });
    probe.close();
  } catch (e) {
    add('WS /api/ws 可连接', false, e.message);
  }

  // 5) 未命中的 /api/* 必须返回 404 JSON，不得落入 SPA fallback（契约 §3.1）
  try {
    const r = await request(baseURL, { path: '/api/__evals_probe__', timeoutMs: 3_000 });
    const isHTML = /text\/html/i.test(String(r.headers['content-type'] || '')) || /^\s*</.test(r.body);
    if (r.status === 404 && !isHTML) add('/api/* 未命中 → 404 JSON', true, '未落入 SPA fallback');
    else add('/api/* 未命中 → 404 JSON', false, `HTTP ${r.status}${isHTML ? '（返回 HTML，落入 SPA fallback）' : ''}`);
  } catch (e) {
    add('/api/* 未命中 → 404 JSON', false, e.message);
  }

  // 6) M3 记忆端点（docs/m3-contract.md §4）。逐项报告"契约 vs 实现"的偏差。
  //    注意：case 断言用契约里的字段路径；这里只把"信封/结构差异"非致命地暴露出来。
  let memItemsStatus = 0;
  try {
    const r = await request(baseURL, { path: '/api/memory/items', timeoutMs: 3_000 });
    memItemsStatus = r.status;
    const isHTML = /text\/html/i.test(String(r.headers['content-type'] || '')) || /^\s*</.test(r.body);
    if (r.status === 404) add('记忆端点 GET /api/memory/items', false, '未实现（M3 待做）');
    else if (isHTML) add('记忆端点 GET /api/memory/items', false, '被 SPA fallback 兜住');
    else if (r.status === 200 && Array.isArray(r.json?.items)) {
      const hasOk = r.json?.ok === true;
      const hasTotal = typeof r.json?.total === 'number';
      add(
        '记忆端点 GET /api/memory/items',
        hasOk && hasTotal,
        `200 + items[]${hasOk ? '' : '；**缺契约要求的 ok:true**'}${hasTotal ? '' : '；**缺契约要求的 total**'}`,
      );
    } else add('记忆端点 GET /api/memory/items', false, `HTTP ${r.status}，响应无 items[]`);
  } catch (e) {
    add('记忆端点 GET /api/memory/items', false, e.message);
  }

  try {
    const r = await request(baseURL, { path: '/api/memory/scopes', timeoutMs: 3_000 });
    add('记忆端点 GET /api/memory/scopes', r.status === 200 && Array.isArray(r.json?.scopes), `HTTP ${r.status}`);
  } catch (e) {
    add('记忆端点 GET /api/memory/scopes', false, e.message);
  }

  // conflicts 的**结构**：契约 §4 要求 `{id,scope,kind,status:"disputed",items:[{id,content,version,authority}]}`
  try {
    const r = await request(baseURL, { path: '/api/memory/conflicts', timeoutMs: 3_000 });
    const list = r.json?.conflicts;
    if (r.status !== 200 || !Array.isArray(list)) {
      add('conflicts 结构与契约一致', false, `HTTP ${r.status}，响应无 conflicts[]`);
    } else if (list.length === 0) {
      add('conflicts 结构与契约一致', true, '空列表（无冲突可校验结构）');
    } else {
      const c = list[0];
      const keys = Object.keys(c || {}).join(',');
      const okShape = c?.status === 'disputed' && Array.isArray(c?.items);
      add(
        'conflicts 结构与契约一致',
        okShape,
        okShape
          ? 'status=disputed + items[]'
          : `实际字段 = {${keys}}；契约要求 status:"disputed" + items[]（当前疑为 itemA/itemB 之类）`,
      );
    }
  } catch (e) {
    add('conflicts 结构与契约一致', false, e.message);
  }

  // items 是否支持 q=（契约 §4 写明 items?scope=&q=&status=&limit=）
  if (memItemsStatus === 200) {
    try {
      const all = await request(baseURL, { path: '/api/memory/items', timeoutMs: 3_000 });
      const none = await request(baseURL, { path: '/api/memory/items?q=evals-no-such-token-zzz', timeoutMs: 3_000 });
      const nAll = Array.isArray(all.json?.items) ? all.json.items.length : -1;
      const nNone = Array.isArray(none.json?.items) ? none.json.items.length : -1;
      add('items 支持 q= 过滤', nNone === 0, `无匹配串 → ${nNone} 条（全量 ${nAll} 条）${nNone === nAll && nAll > 0 ? '；**q 被忽略**' : ''}`);
    } catch (e) {
      add('items 支持 q= 过滤', false, e.message);
    }
  }

  // 7) 记忆必须只读：写/编辑接口不存在（M3 §4 / 12 §5 单写者）
  //    只有"读接口存在且写接口被拒"才算通过——否则模块压根没实现，404 不代表"刻意只读"（避免假绿）。
  try {
    const read = await request(baseURL, { path: '/api/memory/items', timeoutMs: 3_000 });
    if (read.status !== 200) {
      add('记忆只读（无写接口）', false, `无法判断：GET /api/memory/items 返回 ${read.status}（M3 待做）`);
    } else {
      const r = await request(baseURL, {
        method: 'POST',
        path: '/api/memory/items',
        body: { content: 'evals-readonly-probe' },
        timeoutMs: 3_000,
      });
      if (r.status === 404) add('记忆只读（无写接口）', true, `读 200 且 POST → 404`);
      else if (r.status < 300) add('记忆只读（无写接口）', false, `POST 竟返回 ${r.status}（存在可写接口！）`);
      else add('记忆只读（无写接口）', false, `POST → ${r.status}（契约要求 404）`);
    }
  } catch (e) {
    add('记忆只读（无写接口）', false, e.message);
  }

  // 8) M4 会话树 / 聚合 / 改名（docs/m4-contract.md 尚未出；字段名以任务书为准：parentId/children/sessionTitle）
  let treeHasChildren = false;
  try {
    const r = await request(baseURL, { path: '/api/sessions/tree', timeoutMs: 3_000 });
    if (r.status === 404) add('GET /api/sessions/tree', false, '未实现（M4 待做）');
    else if (r.status === 200) {
      const list = r.json?.sessions || r.json?.tree;
      treeHasChildren = Array.isArray(list) && list.some((s) => Array.isArray(s?.children));
      const hasParent = Array.isArray(list) && list.some((s) => s && 'parentId' in s);
      // 与 /api/sessions 对比：若两者返回体一致，说明 tree 很可能只是同一份扁平列表
      let sameAsFlat = false;
      try {
        const flat = await request(baseURL, { path: '/api/sessions', timeoutMs: 3_000 });
        sameAsFlat = flat.status === 200 && flat.body === r.body;
      } catch {
        /* 忽略对比失败 */
      }
      const detail = Array.isArray(list)
        ? `元素含 children=${treeHasChildren}、含 parentId=${hasParent}` +
          (sameAsFlat ? '；**响应与 /api/sessions 完全相同（疑似未实现树，只是同一扁平列表）**' : '')
        : '响应无 sessions[]/tree[]';
      // 没有任何"子会话引用"时，无法区分"树"与"扁平列表"（两者天然相同）→ 跳过，避免假 ⚠
      const hasAnyChildRef = Array.isArray(list) && list.some((s) => s && s.parentId);
      if (!treeHasChildren && !hasAnyChildRef) {
        add('GET /api/sessions/tree', true, '当前无子会话：树与扁平列表不可区分（跳过；M4 case 有子会话时严格校验）');
      } else {
        add('GET /api/sessions/tree', treeHasChildren && hasParent, detail);
      }
    } else add('GET /api/sessions/tree', false, `HTTP ${r.status}`);
  } catch (e) {
    add('GET /api/sessions/tree', false, e.message);
  }

  // includeChildren 参数（true 含子、false 仅本）。单会话库无法证明生效 → 只报可达性（跳过严格判定）。
  try {
    const r = await request(baseURL, { path: '/api/messages?sessionId=main&includeChildren=true', timeoutMs: 3_000 });
    add(
      'GET /api/messages?includeChildren=',
      r.status === 200,
      r.status !== 200 ? `HTTP ${r.status}` : treeHasChildren ? '200（子会话存在）' : '200（单会话库：参数生效与否由 M4 case 严格校验）',
    );
  } catch (e) {
    add('GET /api/messages?includeChildren=', false, e.message);
  }

  // 改名：PATCH /api/sessions/<id> —— 用**已存在的会话**探测（把标题改成它自己，无副作用）。
  // 不能用"不存在的 id → 404"当依据：那既可能是"未实现"，也可能是"对不存在会话正确地返回 404"。
  try {
    const list = await request(baseURL, { path: '/api/sessions', timeoutMs: 3_000 });
    const first = Array.isArray(list.json?.sessions) ? list.json.sessions[0] : null;
    if (!first || !first.id) {
      add('PATCH /api/sessions/<id> 存在', false, '无法探测：/api/sessions 无会话');
    } else {
      const r = await request(baseURL, {
        method: 'PATCH',
        path: `/api/sessions/${encodeURIComponent(first.id)}`,
        body: { title: first.title ?? 'main' }, // 改成当前标题：幂等、无副作用
        timeoutMs: 3_000,
      });
      add('PATCH /api/sessions/<id> 存在', [200, 204].includes(r.status), `真实会话 ${first.id} → HTTP ${r.status}`);
    }
  } catch (e) {
    add('PATCH /api/sessions/<id> 存在', false, e.message);
  }

  // 9) M5 长任务 / 产物 / 审批（docs/m5-contract.md 尚未出；字段/端点以任务书为准）
  try {
    const r = await request(baseURL, { path: '/api/tasks?sessionId=main', timeoutMs: 3_000 });
    const list = Array.isArray(r.json?.tasks) ? r.json.tasks : null;
    add('GET /api/tasks 列表', r.status === 200 && list !== null, r.status !== 200 ? `HTTP ${r.status}` : `${list.length} 个任务`);
    if (list && list[0] && list[0].id) {
      const d = await request(baseURL, { path: `/api/tasks/${encodeURIComponent(list[0].id)}`, timeoutMs: 3_000 });
      add('GET /api/tasks/<id> 明细', d.status === 200, `HTTP ${d.status}`);
    }
  } catch (e) {
    add('GET /api/tasks 列表', false, e.message);
  }

  for (const p of [
    { name: 'POST /api/tasks/<id>/cancel', path: '/api/tasks/evals-none/cancel' },
    { name: 'POST /api/tasks/<id>/retry', path: '/api/tasks/evals-none/retry' },
    { name: 'POST /api/approvals/<id>', path: '/api/approvals/evals-none' },
  ]) {
    try {
      const r = await request(baseURL, { method: 'POST', path: p.path, body: {}, timeoutMs: 3_000 });
      // 对不存在的 id 返回 404 也算"端点存在"（与 PATCH 不同，这里只能靠 405/实现差异判断）
      add(p.name, r.status !== 405, `HTTP ${r.status}${r.status === 405 ? '（方法不允许，端点未实现）' : ''}`);
    } catch (e) {
      add(p.name, false, e.message);
    }
  }

  for (const p of [
    { name: 'GET /api/artifacts', path: '/api/artifacts' },
    { name: 'GET /api/approvals', path: '/api/approvals' },
  ]) {
    try {
      const r = await request(baseURL, { path: p.path, timeoutMs: 3_000 });
      add(p.name, r.status === 200, `HTTP ${r.status}`);
    } catch (e) {
      add(p.name, false, e.message);
    }
  }

  // 10) M6：归档端点 / Spec 不可见 / 跨会话产物过滤
  try {
    const created = await request(baseURL, {
      method: 'POST',
      path: '/api/sessions',
      body: { title: `evals-diag-${Date.now().toString(36)}` },
      timeoutMs: 3_000,
    });
    const sid = created.json?.id || created.json?.session?.id;
    if (!sid) {
      add('归档端点（session archive）', false, `POST /api/sessions 未返回会话 id（HTTP ${created.status}）`);
    } else {
      let shape = null;
      let status = 0;
      for (const v of [
        { method: 'POST', path: `/api/sessions/${encodeURIComponent(sid)}/archive` },
        { method: 'PATCH', path: `/api/sessions/${encodeURIComponent(sid)}`, body: { archived: 1 } },
      ]) {
        const r = await request(baseURL, { method: v.method, path: v.path, body: v.body, timeoutMs: 3_000 });
        status = r.status;
        if (![404, 405].includes(r.status)) {
          shape = `${v.method} ${v.path.replace(sid, '<id>')}`;
          break;
        }
      }
      add('归档端点（session archive）', !!shape, shape ? `${shape} → ${status}` : '未实现（POST /archive 与 PATCH archived=1 均 404/405）');
      if (shape) {
        // 探测完把会话还原，避免留下归档残留
        await request(baseURL, {
          method: 'POST',
          path: `/api/sessions/${encodeURIComponent(sid)}/unarchive`,
          timeoutMs: 3_000,
        }).catch(() => {});
      }
    }
  } catch (e) {
    add('归档端点（session archive）', false, e.message);
  }

  // Spec 不可见：公开访问必须 404（不得落入 SPA fallback）
  try {
    const r = await request(baseURL, { path: '/api/specs', timeoutMs: 3_000 });
    const isHTML = /text\/html/i.test(String(r.headers['content-type'] || '')) || /^\s*</.test(r.body);
    if (r.status === 404 && !isHTML) add('Spec 不可见（/api/specs → 404）', true, '404 JSON');
    else add('Spec 不可见（/api/specs → 404）', false, isHTML ? '返回 HTML（SPA fallback），不是 404' : `HTTP ${r.status}`);
  } catch (e) {
    add('Spec 不可见（/api/specs → 404）', false, e.message);
  }

  // 跨会话产物：必须支持按 sessionId（含子会话）过滤
  try {
    const r = await request(baseURL, { path: '/api/artifacts?sessionId=main&includeChildren=true', timeoutMs: 3_000 });
    add('产物按 sessionId 过滤', r.status === 200, `HTTP ${r.status}`);
  } catch (e) {
    add('产物按 sessionId 过滤', false, e.message);
  }

  // 9) M8：上传端点 / 附件元数据 / 下载穿越
  try {
    const r = await request(baseURL, {
      method: 'POST',
      path: `/api/uploads?sessionId=evals-diag-${Date.now().toString(36)}`,
      multipart: { files: [{ filename: 'diag.txt', mime: 'text/plain', data: Buffer.from('diag') }] },
      timeoutMs: 5_000,
    });
    const list = r.json?.attachments;
    if (r.status === 404 || r.status === 405) add('POST /api/uploads 存在', false, `HTTP ${r.status}（M8 待做）`);
    else if ([200, 201].includes(r.status) && Array.isArray(list) && list.length === 1) {
      const a = list[0];
      const okShape = a && a.id && a.name === 'diag.txt' && a.mime && typeof a.size === 'number';
      add('POST /api/uploads 存在', !!okShape, okShape ? `attachments[0] = {id,name,mime,size}` : `形状不符：${brief(r.body, 160)}`);
    } else add('POST /api/uploads 存在', false, `HTTP ${r.status}，响应无 attachments[]`);
  } catch (e) {
    add('POST /api/uploads 存在', false, e.message);
  }

  try {
    const r = await request(baseURL, { path: '/api/uploads/evals-no-such-upload', timeoutMs: 3_000 });
    add('GET /api/uploads/<未知 id> → 404', r.status === 404, `HTTP ${r.status}`);
  } catch (e) {
    add('GET /api/uploads/<未知 id> → 404', false, e.message);
  }

  try {
    const r = await request(baseURL, { path: '/api/uploads/..%2F..%2Fetc%2Fpasswd', timeoutMs: 3_000 });
    const leaked = /root:|\[boot loader\]/.test(r.body);
    add('GET /api/uploads 路径穿越被拒', [400, 404].includes(r.status) && !leaked, `HTTP ${r.status}${leaked ? '，**疑似泄露**' : ''}`);
  } catch (e) {
    add('GET /api/uploads 路径穿越被拒', false, e.message);
  }

  try {
    const r = await request(baseURL, { path: '/api/messages?sessionId=main', timeoutMs: 3_000 });
    const n = Array.isArray(r.json?.messages) ? r.json.messages.length : -1;
    // 空库时消息体里不会有 "attachments" 键，无法判断字段是否存在 → 判"跳过"（M8 case 已严格断言）
    if (r.status !== 200) add('消息含 attachments 字段（无则空数组）', false, `HTTP ${r.status}`);
    else if (n === 0) add('消息含 attachments 字段（无则空数组）', true, 'main 无消息：跳过（M8 case 已严格断言）');
    else add('消息含 attachments 字段（无则空数组）', r.body.includes('"attachments"'), `messages=${n}`);
  } catch (e) {
    add('消息含 attachments 字段（无则空数组）', false, e.message);
  }

  // 10) M9：权限端点 + 审批里的 sandbox/justification 痕迹
  try {
    const r = await request(baseURL, { path: '/api/permissions', timeoutMs: 3_000 });
    if (r.status === 404) add('GET /api/permissions', false, '未实现（M9 待做）');
    else if (r.status === 200) {
      const hasMode = /workspace-write|read-only|danger-full-access/.test(r.body);
      const hasPolicy = /"(policy|approval|strategy)"\s*:\s*"(auto|ask|never)"/.test(r.body);
      add('GET /api/permissions', hasMode && hasPolicy, hasMode ? `模式可见${hasPolicy ? '，策略可见' : '，**缺策略字段**'}` : '响应无模式字段');
    } else add('GET /api/permissions', false, `HTTP ${r.status}`);
  } catch (e) {
    add('GET /api/permissions', false, e.message);
  }

  // 幂等切回默认模式（无副作用；未实现则报 ⚠）
  try {
    const r = await request(baseURL, {
      method: 'POST',
      path: '/api/permissions',
      body: { mode: 'workspace-write' },
      timeoutMs: 3_000,
    });
    add('POST /api/permissions 可切换', [200, 204].includes(r.status), `HTTP ${r.status}`);
  } catch (e) {
    add('POST /api/permissions 可切换', false, e.message);
  }

  const bad = rows.filter((r) => !r.ok);
  console.log('');
  console.log('契约诊断（不计入 PASS/FAIL）：');
  if (rows.length === 0) {
    console.log('  （无）');
    return;
  }
  for (const r of rows) console.log(`  ${r.ok ? '✓' : '⚠'} ${r.name}：${r.note}`);
  if (bad.length) console.log(`  → ${bad.length} 处与契约有偏差，建议对齐（不阻塞 case）`);
}

// ---------------------------------------------------------------- 输出

// ---------------------------------------------------------------- 真实模型 token 统计（--real）

/** 读 /api/usage（tokenmeter.Report）→ 归一化快照；失败返回 null（不影响 case 判定）。 */
async function usageSnapshot(baseURL) {
  try {
    const r = await request(baseURL, { path: '/api/usage', timeoutMs: 3_000 });
    const total = r.json?.total || {};
    return {
      calls: Number(r.json?.calls || 0),
      promptTokens: Number(total.promptTokens || 0),
      completionTokens: Number(total.completionTokens || 0),
      reasoningTokens: Number(total.reasoningTokens || 0),
      totalTokens: Number(total.totalTokens || 0),
      model: total.model || '',
    };
  } catch {
    return null;
  }
}

function diffUsage(a, b) {
  if (!a || !b) return null;
  return {
    calls: b.calls - a.calls,
    promptTokens: b.promptTokens - a.promptTokens,
    completionTokens: b.completionTokens - a.completionTokens,
    reasoningTokens: b.reasoningTokens - a.reasoningTokens,
    totalTokens: b.totalTokens - a.totalTokens,
  };
}

/** 打印本次真实模型 smoke 的 token 用量与成本估算（单价由 --price-in/--price-out 提供，单位：元/百万 token）。 */
async function reportTokenUsage(results, opts, before) {
  const after = await usageSnapshot(opts.baseURL);
  const total = diffUsage(before, after) || { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, totalTokens: 0 };

  console.log('');
  console.log('真实模型 token 用量（/api/usage 差值）：');
  console.log(`  调用次数 calls = ${total.calls}（模型 ${after?.model || before?.model || 'unknown'}）`);
  console.log(`  prompt = ${total.promptTokens}  completion = ${total.completionTokens}  reasoning = ${total.reasoningTokens}  total = ${total.totalTokens}`);

  const perCase = results.filter((r) => r.tokens);
  if (perCase.length) {
    const rows = perCase.map((r) => [r.id, String(r.tokens.totalTokens), String(r.tokens.promptTokens), String(r.tokens.completionTokens), String(r.tokens.calls)]);
    const head = ['CASE', 'TOKENS', 'PROMPT', 'COMPLETION', 'CALLS'];
    const w = head.map((h, i) => Math.max(strWidth(h), ...rows.map((row) => strWidth(row[i]))));
    console.log('');
    console.log(rows.length ? '' : '');
    console.log(head.map((c, i) => pad(c, w[i])).join('  '));
    console.log(w.map((x) => '-'.repeat(x)).join('  '));
    for (const row of rows) console.log(row.map((c, i) => pad(c, w[i])).join('  '));
  }

  const priceIn = Number(opts.priceIn || 0);
  const priceOut = Number(opts.priceOut || 0);
  console.log('');
  if (priceIn > 0 || priceOut > 0) {
    const cost = (total.promptTokens / 1e6) * priceIn + (total.completionTokens / 1e6) * priceOut;
    console.log(`成本估算：¥${cost.toFixed(6)}（input ¥${priceIn}/M、output ¥${priceOut}/M，按 tokenmeter 上报值计算；仅供参考）`);
  } else {
    console.log('成本估算：未提供单价（--price-in/--price-out，单位 元/百万 token），本轮只报 token。');
  }
  console.log('说明：真实模型 smoke 断言的是**结构**（回复非空/含列表/任务 done/记忆存在），不断言具体文案；mock 协议套件仍为默认门禁。');
}

function printTable(results, opts) {
  const head = opts.real ? ['CASE', 'RESULT', 'GRADERS', 'TOKENS', 'ms'] : ['CASE', 'RESULT', 'GRADERS', 'ms'];
  const rows = results.map((r) => [
    r.id,
    (r.pending ? 'PENDING' : r.pass ? 'PASS' : 'FAIL') + (r.retried ? ' (retried)' : ''),
    r.graders && r.graders.length ? `${r.graders.filter((g) => g.pass).length}/${r.graders.length}` : '-',
    ...(opts.real ? [r.tokens ? String(r.tokens.totalTokens) : '-'] : []),
    String(r.ms),
  ]);
  const w = head.map((h, i) => Math.max(strWidth(h), ...rows.map((row) => strWidth(row[i]))));
  const line = (cells) => cells.map((c, i) => pad(c, w[i])).join('  ');

  console.log(line(head));
  console.log(w.map((x) => '-'.repeat(x)).join('  '));
  for (const row of rows) console.log(line(row));

  // 失败细节：默认只打失败的 grader；--verbose 打全部
  for (const r of results) {
    if (r.error) {
      console.log('');
      console.log(`  ✗ ${r.id}: ${r.error}`);
      continue;
    }
    const shown = (r.graders || []).filter((g) => opts.verbose || !g.pass);
    if (shown.length === 0) continue;
    console.log('');
    for (const g of shown) console.log(`  ${g.pass ? '✓' : '✗'} ${r.id} / ${g.name}: ${g.detail}`);
  }
}

// 中文字符按 2 列宽估算，保证表格不歪（不引第三方，够用即可）
function strWidth(s) {
  let n = 0;
  for (const ch of String(s)) n += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  return n;
}
function pad(s, width) {
  const d = width - strWidth(s);
  return d > 0 ? String(s) + ' '.repeat(d) : String(s);
}

// ---------------------------------------------------------------- 小工具

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 轮询直到 predicate 为真或超时；返回是否满足。 */
async function waitFor(predicate, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(intervalMs);
  }
  return predicate();
}

main().catch((e) => {
  console.error(`✗ 评测自身出错：${e && e.stack ? e.stack : e}`);
  process.exit(2);
});
