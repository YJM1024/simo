// scripts/ac/lib/task-ui-helpers.mjs
//
// P1-CONV §17 任务右栏 UI 断言公共层（AC-CONV-009-05..13 专用）。
// 与 scripts/lib/ac-cdp.mjs 的分工：那边提供 CDP/fetch 桩/点击原语，这边负责
// 统一输出（PASS/FAIL 名称 期望 实际）、SKIP 判定、可复现的 N2/N3/N8 桩数据。
//
// 只读约束：脚本自身不发写请求；页面桩只拦截 GET，POST/PUT/PATCH/DELETE 一律
// 放行给真实后端并在证据里计数，用来证明详情/任务图没有写入口。
//
// 页面依赖：先用 http://127.0.0.1:8787 或 8789 上已启动的前端页面；没有可用
// 页面时输出 SKIP 与原因，退出码 0（SKIP 不计通过）。

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, AcBlocked, connect, installStub, setStub, sleep, waitFor,
  bounds, clickAt, pressKey, READY_INSPECTOR,
} from '../../lib/ac-cdp.mjs';

export { sleep, waitFor, bounds, clickAt, pressKey, READY_INSPECTOR };

export class UiSkip extends Error {}

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
export const OUT_DIR = path.join(ROOT, '.tmp', 'ac-scripts-ui-009');

export const COUNTS = { all: 11, running: 2, pending: 5, failed: 1, done: 3 };

const STATUS_ORDER = ['running', 'failed', 'pending', 'done'];

/** 11 条任务：2 进行中、1 失败、5 未开始、3 已完成；四态厚卡各至少一条。 */
export const TASKS = [
  { id: 't1', title: '八步计划：整理一周材料', mode: 'plan', status: 'running', displayStatus: 'running', stepCount: 8, doneStepCount: 5, currentStepSeq: 6, outputCount: 1, updatedAt: 11 },
  { id: 't2', title: '边做边想：定位首响变慢', mode: 'loop', status: 'running', displayStatus: 'running', outputCount: 0, updatedAt: 10 },
  { id: 't3', title: '未开始：补充指标口径', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 4, doneStepCount: 0, waitingReason: 'dependency', updatedAt: 9 },
  { id: 't4', title: '未开始：收集竞品截图', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 3, doneStepCount: 0, updatedAt: 8 },
  { id: 't5', title: '未开始：整理术语表', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, updatedAt: 7 },
  { id: 't6', title: '未开始：核对下载字节', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, updatedAt: 6 },
  { id: 't7', title: '未开始：等待资源配额', mode: 'plan', status: 'pending', displayStatus: 'pending', stepCount: 2, doneStepCount: 0, waitingReason: 'resource', updatedAt: 5 },
  { id: 't8', title: '已完成：归档会议纪要', mode: 'plan', status: 'done', displayStatus: 'done', stepCount: 4, doneStepCount: 4, outputCount: 2, updatedAt: 4 },
  { id: 't9', title: '已完成：生成排期表', mode: 'plan', status: 'done', displayStatus: 'done', stepCount: 3, doneStepCount: 3, outputCount: 1, updatedAt: 3 },
  { id: 't10', title: '已完成：清理临时产物', mode: 'loop', status: 'done', displayStatus: 'done', outputCount: 0, updatedAt: 2 },
  { id: 't11', title: '失败：外部接口超时', mode: 'plan', status: 'failed', displayStatus: 'failed', stepCount: 5, doneStepCount: 2, failReason: '外部接口超时', updatedAt: 1 },
];

export const TASK_BY_ID = Object.fromEntries(TASKS.map((task) => [task.id, task]));

export function listPayload(status = 'all') {
  const tasks = status === 'all' ? TASKS : TASKS.filter((task) => task.displayStatus === status);
  return { ok: true, tasks, counts: COUNTS, total: tasks.length, hasMore: false, nextBefore: null };
}

function trace(seq, category, text, at) {
  return { id: `tr-${seq}`, traceSeq: seq, category, text, at };
}

const CLOCK = Date.UTC(2026, 10, 24, 2, 0, 0);
const tm = (seq) => CLOCK + seq * 60_000;

/** t1：8 步，第 6 步当前展开并带 8 条轨迹；第 5 步已完成可回看；第 7 步未开始。 */
export function planDetail() {
  const steps = [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({
    id: `s${seq}`,
    seq,
    title: `第 ${seq} 步：${seq === 6 ? '汇总口径并生成结论' : seq === 7 ? '输出周报草稿' : '整理材料'}`,
    status: seq <= 5 ? 'done' : seq === 6 ? 'running' : 'pending',
    traceCount: seq === 6 ? 8 : seq <= 5 ? 2 : 0,
    summary: seq <= 5 ? '已完成' : '',
  }));
  const traces = Array.from({ length: 8 }, (_, i) => trace(i + 1, ['thought', 'action', 'observation'][i % 3], `第 6 步轨迹 ${i + 1}`, tm(i + 1)));
  return {
    task: { ...TASK_BY_ID.t1, status: 'running' },
    steps,
    currentStepId: 's6',
    traces,
    tracesHasMore: false,
    deliverables: [{ id: 'd1', name: '一周材料汇总.md', mime: 'text/markdown', size: 2048, typeBadge: 'doc', createdAt: CLOCK, downloadUrl: '/api/artifacts/d1/content?download=1' }],
    context: { goal: '整理一周材料并输出结论', inputs: ['指标快照'], constraints: ['不得打乱步骤顺序', '每步不超过 200 字'], historyCount: 0 },
    budget: { maxTokens: 20000, maxSteps: 8, usedTokens: 6400, usedSteps: 6 },
    taskTotal: 11,
  };
}

/** t2：边做边想，14 条轨迹、0 步骤、无展开入口。 */
export function exploreDetail() {
  const traces = Array.from({ length: 14 }, (_, i) => trace(i + 1, i % 2 ? 'action' : 'observation', `循环轨迹 ${i + 1}：检查第 ${i + 1} 个采样点`, tm(i + 1)));
  return {
    task: { ...TASK_BY_ID.t2, status: 'running' },
    steps: [],
    currentStepId: null,
    traces,
    tracesHasMore: false,
    deliverables: [],
    context: { goal: '定位首响变慢的环节', inputs: [], constraints: [], historyCount: 0 },
    budget: { maxTokens: 0, maxSteps: 0, usedTokens: 1200, usedSteps: 0 },
    taskTotal: 11,
  };
}

/** 通用详情：四态卡点开后按状态给最小可用数据。 */
export function detailFor(taskId) {
  if (taskId === 't1') return planDetail();
  if (taskId === 't2') return exploreDetail();
  const task = TASK_BY_ID[taskId] ?? { ...TASKS[0], id: taskId };
  const steps = task.mode === 'loop' ? [] : Array.from({ length: Math.max(1, task.stepCount ?? 2) }, (_, i) => ({
    id: `s${i + 1}`,
    seq: i + 1,
    title: `步骤 ${i + 1}`,
    status: task.displayStatus === 'done' ? 'done' : i === 0 ? task.displayStatus : 'pending',
    traceCount: 1,
  }));
  const traces = task.mode === 'loop' ? Array.from({ length: 3 }, (_, i) => trace(i + 1, 'action', `轨迹 ${i + 1}`, tm(i + 1))) : [];
  return {
    task,
    steps,
    currentStepId: steps.find((step) => step.status === 'running')?.id ?? null,
    traces,
    tracesHasMore: false,
    deliverables: [],
    context: { goal: '只读详情', inputs: [], constraints: ['只读'], historyCount: 0 },
    budget: { maxTokens: 0, maxSteps: 0, usedTokens: 0, usedSteps: 0 },
    taskTotal: 11,
  };
}

/** 概览投影：running 2 行、pending 5 行、done 3 行，任务块「还有 9 个」。 */
export function projectionPayload() {
  const group = (state, total) => ({
    total,
    items: TASKS.filter((task) => task.displayStatus === state).slice(0, 2).map((task) => ({ id: task.id, title: task.title, state, updatedAt: task.updatedAt })),
    hasMore: total > 2,
  });
  return {
    sessionId: 'main',
    status: 'active',
    revision: 7,
    updatedAt: CLOCK,
    goal: '把平均首响压到 1.2 秒以内',
    constraints: ['不改后端契约', '只读展示'],
    inputs: ['上周指标：首响 1.8 秒'],
    tasks: { running: group('running', 2), pending: group('pending', 5), done: group('done', 3) },
    deliverables: { total: 3, items: [{ id: 'd1', name: '一周材料汇总.md', kind: 'doc' }, { id: 'd2', name: '排期表.csv', kind: 'sheet' }, { id: 'd3', name: '截图.png', kind: 'image' }], hasMore: true },
    pendingConfirmations: { total: 0 },
  };
}

/** 8 节点任务图：四态齐全；d 失败，边 d→h 应虚线，h 仍为未开始。 */
export function graphPayload() {
  const node = (id, title, displayStatus, extra = {}) => ({
    id, title, mode: 'plan', status: displayStatus, displayStatus, ...extra,
  });
  return {
    nodes: [
      node('a', '采集入口', 'done', { progress: 100 }),
      node('b', '清洗样本', 'done', { progress: 100 }),
      node('c', '汇总指标', 'running', { progress: 60 }),
      node('d', '外部接口取数', 'failed', { failReason: '外部接口超时' }),
      node('e', '生成图表', 'pending', { waitingReason: 'dependency' }),
      node('f', '写结论', 'pending', { waitingReason: 'dependency' }),
      node('g', '归档', 'done'),
      node('h', '复核失败分支', 'pending', { waitingReason: 'dependency' }),
    ],
    edges: [
      { from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'd', to: 'h' }, { from: 'c', to: 'e' }, { from: 'e', to: 'f' }, { from: 'f', to: 'g' },
    ],
    layers: [
      { index: 0, nodeIds: ['a'] },
      { index: 1, nodeIds: ['b', 'c', 'd'] },
      { index: 2, nodeIds: ['e', 'h'] },
      { index: 3, nodeIds: ['f'] },
      { index: 4, nodeIds: ['g'] },
    ],
    total: 8,
  };
}

export function deliverablesPayload() {
  return {
    groups: [{
      taskId: 't8', taskTitle: '已完成：归档会议纪要', taskStatus: 'done',
      files: [
        { id: 'f1', name: '会议纪要.md', mime: 'text/markdown', size: 3200, typeBadge: 'doc', createdAt: CLOCK, downloadUrl: '/api/artifacts/f1/content?download=1' },
        { id: 'f2', name: '排期.csv', mime: 'text/csv', size: 512, typeBadge: 'sheet', createdAt: CLOCK, downloadUrl: '/api/artifacts/f2/content?download=1' },
      ],
    }],
    total: 1,
    fileCount: 2,
    hasMore: false,
  };
}

/** 生成页面桩配置；overrides 可替换 counts/tasks/graph 等。 */
export function buildStub(overrides = {}) {
  const counts = overrides.counts ?? COUNTS;
  const list = (status) => {
    const payload = listPayload(status);
    return { ...payload, counts, ...(overrides.listExtra ?? {}) };
  };
  const tasks = overrides.tasks ?? TASKS;
  const rules = [
    { match: '/api/sessions/main/tasks\\?[^#]*status=running', status: 200, body: list('running') },
    { match: '/api/sessions/main/tasks\\?[^#]*status=failed', status: 200, body: list('failed') },
    { match: '/api/sessions/main/tasks\\?[^#]*status=done', status: 200, body: list('done') },
    { match: '/api/sessions/main/tasks\\?[^#]*status=pending', status: 200, body: list('pending') },
    { match: '/api/sessions/main/tasks(\\?|$)', status: 200, body: { ...list('all'), tasks, total: tasks.length } },
    { match: '/api/tasks/t1(\\?|$)', status: 200, body: overrides.detail ?? planDetail() },
    { match: '/api/tasks/t2(\\?|$)', status: 200, body: exploreDetail() },
    { match: '/api/sessions/main/task-graph', status: 200, body: overrides.graph ?? graphPayload() },
    { match: '/api/sessions/main/deliverables', status: 200, body: overrides.deliverables ?? deliverablesPayload() },
    { match: '/api/sessions/main/spec-projection', status: 200, body: overrides.projection ?? projectionPayload() },
  ];
  // 桩配置只能静态匹配，这里按 taskId 展开通用详情。
  for (const task of tasks) {
    if (task.id === 't1' || task.id === 't2') continue;
    rules.push({ match: `/api/tasks/${task.id}(\\?|$)`, status: 200, body: detailFor(task.id) });
  }
  // 任务图节点打开详情也走 N3；节点 id 用 a–h。
  for (const id of ['a', 'b', 'c', 'e', 'f', 'g', 'h']) {
    rules.push({ match: `/api/tasks/${id}(\\?|$)`, status: 200, body: detailFor(id) });
  }
  return { rules };
}

export function measure(client, selector, index = 0) {
  return client.evaluate(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return { exists: false };
    const r = el.getBoundingClientRect();
    return { exists: true, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  })()`);
}

export function text(client, selector) {
  return client.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? (el.textContent || '').trim() : null; })()`);
}

export function count(client, selector) {
  return client.evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}

export function attr(client, selector, name, index = 0) {
  return client.evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; return el ? el.getAttribute(${JSON.stringify(name)}) : null; })()`);
}

export function clickSel(client, selector, index = 0) {
  return client.evaluate(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; el.click(); return true; })()`);
}

/** 页面就绪：右栏挂到 main 会话；不满足按 SKIP 处理（页面状态未就绪，而不是选择器缺失）。 */
export async function openSessionPage(ctx, { stub, ready = READY_INSPECTOR } = {}) {
  const client = ctx.client;
  await client.navigate(`${ctx.baseUrl}/`);
  await client.evaluate(`(() => {
    localStorage.setItem('simo.active-session', 'main');
    // 每个脚本从「展开 + 四块全展开」的确定起点开始；脚本内部 reload 不会清。
    localStorage.removeItem('simo.insp.collapsed.main');
    localStorage.removeItem('simo.insp.overview.main');
  })()`);
  await setStub(client, stub);
  await client.reload({ ready, timeout: 20000 });
  try {
    await waitFor(client, `document.querySelector('aside.inspector')?.getAttribute('data-session') === 'main' && document.querySelector('nav.insp-rail') !== null`, { timeout: 12000, label: 'main 会话右栏' });
  } catch {
    throw new UiSkip('页面没有可用的 main 会话右栏（缺少会话数据或右栏未渲染）');
  }
  await sleep(350);
  return client;
}

function fmt(value) {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * 统一 runner：
 *   PASS 名称 期望=... 实际=...
 *   FAIL 名称 期望=... 实际=...
 *   N passed, M failed
 * 失败 exit 1；无页面/环境不可用 SKIP 并 exit 0。
 */
export async function runUiAc(ac, fn) {
  const argv = process.argv.slice(2);
  let baseUrl = DEFAULT_BASE_URL;
  let explicitBase = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base-url') { baseUrl = argv[++i] ?? baseUrl; explicitBase = true; }
    else if (argv[i].startsWith('--base-url=')) { baseUrl = argv[i].slice('--base-url='.length); explicitBase = true; }
  }
  baseUrl = String(baseUrl).replace(/\/+$/, '');
  const checks = [];
  const evidence = {};
  const ctx = {
    ac, baseUrl, checks, evidence, client: null,
    check(ok, name, expected, actual) {
      checks.push({ ok: !!ok, name, expected, actual });
      return !!ok;
    },
    async open(stub, options = {}) {
      return openSessionPage(ctx, { stub: stub ?? buildStub(), ...options });
    },
  };

  let skipReason = '';
  let fatal = '';
  const started = Date.now();
  try {
    // 服务页面可用性：未显式给 --base-url 时按既有做法在 8787/8789 里取当前服务。
    const candidates = explicitBase ? [baseUrl] : [baseUrl, 'http://127.0.0.1:8789'];
    let reachable = false;
    const tried = [];
    for (const candidate of candidates) {
      try {
        await fetch(candidate + '/', { signal: AbortSignal.timeout(2500), redirect: 'manual' });
        baseUrl = candidate;
        ctx.baseUrl = candidate;
        reachable = true;
        break;
      } catch (err) {
        tried.push(`${candidate}（${err.message}）`);
      }
    }
    if (!reachable) throw new UiSkip(`没有可用前端页面：${tried.join('、')}`);
    ctx.client = await connect(baseUrl);
    await installStub(ctx.client);
    await fn(ctx);
  } catch (err) {
    if (err instanceof UiSkip || err instanceof AcBlocked) skipReason = err.message;
    else fatal = err?.stack ?? String(err);
  } finally {
    try { ctx.client?.close(); } catch { /* 已断开 */ }
  }

  const passed = checks.filter((item) => item.ok).length;
  const failed = checks.length - passed;
  for (const item of checks) {
    const line = `${item.ok ? 'PASS' : 'FAIL'} ${item.name} 期望=${fmt(item.expected)} 实际=${fmt(item.actual)}`;
    console.log(line);
  }
  if (skipReason) {
    console.log(`SKIP ${ac} 原因：${skipReason}`);
    console.log('0 passed, 0 failed');
    return;
  }
  if (fatal) {
    console.log(`FAIL ${ac} 期望=脚本执行完成 实际=${fatal.split('\n')[0]}`);
  }
  console.log(`${passed} passed, ${failed} failed`);
  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, `${ac}.json`), JSON.stringify({
      ac, baseUrl, pass: failed === 0 && !fatal, checks, evidence, durationMs: Date.now() - started,
    }, null, 2));
  } catch { /* 证据写失败不影响判定 */ }
  if (failed > 0 || fatal) process.exitCode = 1;
}
