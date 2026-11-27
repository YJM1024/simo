// 墨线 v2 门禁脚本共用件：参数解析、规则模式、结果输出与自检夹具目录。
// 只依赖 Node 内置模块，不引入第三方包。
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 解析 v2 门禁脚本的统一参数。
 * 支持 --self-test / --json / --list-rules / --rule <MXV2-x-yy>，其余 --key value 原样收入对象。
 */
export function parseArgs(argv) {
  const out = { _: [], selfTest: false, json: false, listRules: false, rule: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--self-test') out.selfTest = true;
    else if (a === '--json') out.json = true;
    else if (a === '--list-rules') out.listRules = true;
    else if (a === '--rule') out.rule = argv[++i] ?? null;
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

/**
 * 处理 --list-rules 与 --rule 的合法性；返回 {done:true,code} 表示入口应直接退出。
 * 规则号不属于本脚本时按参数错误退出 2，并在 stderr 列出覆盖范围。
 */
export function resolveRuleMode(args, rules, name) {
  if (args.listRules) {
    console.log(rules.join('\n'));
    return { done: true, code: 0 };
  }
  if (args.rule && !rules.includes(args.rule)) {
    console.error(`${name}: 不覆盖规则 ${args.rule}`);
    console.error(`${name}: 覆盖 ${rules.join(', ')}`);
    return { done: true, code: 2 };
  }
  return { done: false };
}

/** 按规则过滤检查项；--rule 单条模式只跑该规则名下的检查。 */
export function selectChecks(checks, rule) {
  return rule ? checks.filter((c) => c.rule === rule) : checks;
}

/** 逐项执行检查函数，汇总检查项数与问题清单。 */
export function runChecks(checks, ctx) {
  let count = 0;
  const issues = [];
  for (const c of checks) {
    const r = c.run(ctx) || {};
    count += r.checks ?? 1;
    for (const i of r.issues ?? []) issues.push({ rule: i.rule ?? c.rule, ...i });
  }
  return { count, issues };
}

/** 判定：零检查不得判 PASS；无问题且至少跑过一项检查才算通过。 */
export function isPass(issues, count) {
  return issues.length === 0 && (count ?? 0) > 0;
}

/** 统一输出：先摘要，再逐条问题，末行 PASS/FAILED；返回进程退出码。 */
export function printResult({ issues, count, rule, summary, json, name }) {
  const total = count ?? 0;
  const pass = isPass(issues, total);
  if (json) {
    console.log(JSON.stringify({ gate: name, rule: rule ?? null, checks: total, zeroCheck: total === 0, issues }, null, 2));
    return pass ? 0 : 1;
  }
  if (summary) console.log(summary);
  for (const i of issues) {
    const loc = [i.file, i.line].filter((x) => x !== undefined && x !== null).join(':');
    console.log(`- [${i.rule}] ${loc ? loc + " " : ""}${i.msg}`);
  }
  const suffix = rule ? `, rule: ${rule}` : "";
  if (issues.length) console.log(`FAILED: ${issues.length} issue(s) (checks: ${total}${suffix})`);
  else if (total === 0) console.log(`FAILED: 零检查不得判 PASS (checks: 0${suffix})`);
  else console.log(`PASS (checks: ${total}${suffix})`);
  return pass ? 0 : 1;
}

/** 自检夹具根目录：写在 .tmp/v2-p4/self/ 下，保留现场，不做删除。 */
export function fixtureDir(name) {
  const dir = join(process.cwd(), '.tmp', 'v2-p4', 'self', `${name}-${Date.now()}-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 自检断言器：收集结果，末尾统一输出。 */
export function createAsserter(name) {
  const rows = [];
  const assert = (ok, label) => {
    rows.push({ ok: Boolean(ok), label });
    return Boolean(ok);
  };
  const finish = () => {
    const failed = rows.filter((r) => !r.ok);
    for (const r of failed) console.log(`FAIL ${r.label}`);
    if (failed.length) {
      console.log(`SELF-TEST FAILED (${rows.length} assertions, ${failed.length} failed)`);
      return 1;
    }
    console.log(`SELF-TEST PASS (${rows.length} assertions)`);
    return 0;
  };
  return { assert, finish, name };
}
