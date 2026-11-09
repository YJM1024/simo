// harness 自检（回归用）：不依赖被测服务，纯 Node 断言。
//
// 用途：防止"评测工具自身"静默坏掉。已有教训：
//   1) grader 里的 `{{@id}}` 没展开 → state_delta 拿字面量匹配，永远 0 条；
//   2) state_delta 只给 atMost 时下限被算成 1 → "最多 N 条"永远失败。
// 这类 bug 会让门禁给出**假红/假绿**，比产品 bug 更危险，所以进自检。
//
// 用法：node evals/selftest.mjs      （exit 0 = 全过，1 = 有失败）
// run.mjs 启动默认也会跑一遍（`--no-selfcheck` 可跳过）。

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyVars, applyCtxRefs } from './lib/resolve.mjs';
import * as stateDelta from './graders/state_delta.mjs';
import * as lastState from './graders/last_state.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** @returns {Promise<{ok:boolean, checks:{name:string, pass:boolean, detail:string}[]}>} */
export async function runSelfCheck() {
  const checks = [];
  // 注意：fn 可以是 async——必须 await，否则 r 是 Promise，pass 永远 undefined（曾踩过）
  const add = async (name, fn) => {
    try {
      const r = await fn();
      checks.push({ name, pass: !!r?.pass, detail: String(r?.detail ?? '') });
    } catch (e) {
      checks.push({ name, pass: false, detail: `抛错：${e && e.message ? e.message : e}` });
    }
  };

  // 1) 回归：graders 必须先经过 applyCtxRefs 展开（本 bug 的直接防线）
  await add('run.mjs 对 grader 应用了 applyCtxRefs', () => staticCheckGraderExpansion());

  // 2) 功能：{{@...}} 展开后，state_delta 才能用捕获到的 id 匹配
  add('grader 的 {{@id}} 展开后可匹配', () => {
    const ctx = { retractedId: 'msg-abc' };
    const spec = applyCtxRefs(
      { collection: 'msgs', where: { id: '{{@retractedId}}' }, expect: { status: 'retracted' } },
      ctx,
    );
    const out = stateDelta.grade({ msgs: [{ id: 'msg-abc', status: 'retracted' }] }, spec);
    return { pass: out.pass, detail: out.detail };
  });

  // 3) 行为：不展开时应当匹配失败（证明上面那条断言不是空转）
  add('不展开 {{@id}} 时匹配不到（负例）', () => {
    const out = stateDelta.grade(
      { msgs: [{ id: 'msg-abc', status: 'retracted' }] },
      { collection: 'msgs', where: { id: '{{@retractedId}}' }, expect: { status: 'retracted' } },
    );
    return { pass: !out.pass, detail: out.pass ? '本应失败却通过了' : '符合预期地失败' };
  });

  // 4) 不可解析的运行时引用必须 fail-closed
  add('缺失的 {{@...}} 抛错', () => {
    let threw = false;
    try {
      applyCtxRefs('{{@nope.missing}}', {});
    } catch {
      threw = true;
    }
    return { pass: threw, detail: threw ? '按预期抛错' : '未抛错（会把 undefined 拼进 URL）' };
  });

  // 5) 回归：state_delta 只给 atMost 时，下限必须是 0
  add('state_delta atMost 单独使用时下限为 0', () => {
    const out = stateDelta.grade({ frames: [{ type: 'a' }] }, { collection: 'frames', where: { type: 'task.created' }, atMost: 0 });
    return { pass: out.pass, detail: out.detail };
  });

  // 6) last_state 取末条
  add('last_state 取最后一条匹配项', () => {
    const out = lastState.grade(
      { frames: [{ type: 'task.updated', data: { status: 'queued' } }, { type: 'task.updated', data: { status: 'running' } }] },
      { collection: 'frames', where: { type: 'task.updated' }, expect: { 'data.status': 'running' } },
    );
    return { pass: out.pass, detail: out.detail };
  });

  // 7) applyVars 支持嵌套展开（{{probe}} -> "...{{runId}}"）
  add('applyVars 嵌套展开', () => {
    const out = applyVars({ t: '{{probe}}' }, { runId: 'r1', probe: 'p-{{runId}}' });
    return { pass: out.t === 'p-r1', detail: `展开结果 = ${out.t}` };
  });

  return { ok: checks.every((c) => c.pass), checks };
}

async function staticCheckGraderExpansion() {
  const src = await fs.readFile(path.join(HERE, 'run.mjs'), 'utf8');
  // 允许 `applyCtxRefs(g, ctx)` 或 `applyCtxRefs(grader, ctx)` 等命名
  const ok = /applyCtxRefs\(\s*(g|grader|specG)\s*,\s*ctx\s*\)/.test(src);
  return { pass: ok, detail: ok ? '已应用' : 'run.mjs 的 grader 循环缺少 applyCtxRefs(g, ctx)' };
}

// 允许直接执行：node evals/selftest.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const { ok, checks } = await runSelfCheck();
  for (const c of checks) console.log(`${c.pass ? '✓' : '✗'} ${c.name}：${c.detail}`);
  console.log('');
  console.log(ok ? `harness 自检：${checks.length}/${checks.length} PASS` : 'harness 自检失败');
  process.exit(ok ? 0 : 1);
}
