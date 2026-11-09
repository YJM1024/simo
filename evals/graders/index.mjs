// grader 注册表：新增 grader 只需在这里登记一行。
// 约定：每个 grader 导出 { type, grade(ctx, spec) -> {pass, detail} }；
// grade 可以是 async（如 file_exists）。E0 只接受**确定性** grader。
import * as regex from './regex.mjs';
import * as stateDelta from './state_delta.mjs';
import * as forbidden from './forbidden.mjs';
import * as fileExists from './file_exists.mjs';
import * as lastState from './last_state.mjs';
import * as numeric from './numeric.mjs';
import * as count from './count.mjs';
import * as sumEq from './sum_eq.mjs';

export const GRADERS = {
  [regex.type]: regex,
  [stateDelta.type]: stateDelta,
  [forbidden.type]: forbidden,
  [fileExists.type]: fileExists,
  [lastState.type]: lastState,
  [numeric.type]: numeric,
  [count.type]: count,
  [sumEq.type]: sumEq,
};

/** @returns {{pass:boolean, detail:string}} */
export async function runGrader(name, ctx, spec) {
  const g = GRADERS[name];
  if (!g) return { pass: false, detail: `未知 grader '${name}'（可用: ${Object.keys(GRADERS).join(' / ')}）` };
  try {
    const out = await g.grade(ctx, spec);
    return { pass: !!out.pass, detail: String(out.detail ?? '') };
  } catch (e) {
    // grader 自身异常 = 该 grader 失败，但不炸掉整个 run
    return { pass: false, detail: `${name}: grader 抛错 ${e && e.message ? e.message : e}` };
  }
}

export const GRADER_NAMES = Object.keys(GRADERS);
