#!/usr/bin/env node
// validate-dp.mjs — DP-1 部署配置登记表校验（R17 / R19）+ T065 I 表记录校验
//
// 依据：
//   34-类型库-模板与总览-v1.5.md：§4.2.25（25a/25b 拆分）、§4.3（I 表 15 行）、
//     §4.8（组合条目字段 7 租户归属）、R17（阻断）、R19（警告，P1）、R20（警告，P1）
//   33-智能体框架-产品功能树-v1.5.md：F1.5 C19/C20、F5.3（租户边界）、F2.7（实例运行记录）
//   48-类型库-T25I13回填-v0.md：T065 的 25a 建议值（草案载体）
//   50-I表记录-T065-v0.json：T065 实例记录（人工推演重跑，非运行时落盘）
//
// 用法：node validate-dp.mjs [--dp <path>] [--record <path>] [--backfill <path>]
//                            [--type-def <path>] [--self-test]
// Node 24 原生能力，零依赖。输出 UTF-8 无 BOM。退出码：0=无阻断不通过；1=有不通过项。

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const SELF_TEST = argv.includes('--self-test');

const PATHS = {
  dp: resolve(flag('--dp', join(HERE, 'DP-1.json'))),
  record: resolve(flag('--record', join(ROOT, '50-I表记录-T065-v0.json'))),
  backfill: resolve(flag('--backfill', join(ROOT, '48-类型库-T25I13回填-v0.md'))),
  typeDef: resolve(flag('--type-def', join(ROOT, '38-类型库-专业与边界案例.md'))),
};

const results = [];
const SECTION_ORDER = ['一', '二', '三', '四', '五', '六'];
const SECTION_TITLE = {
  一: 'DP-1 结构（P0，字段齐备与取值可解析）',
  二: 'R17 类型级 25a 完整性（阻断；成员写“继承”时按组合条目字段 7 解析）',
  三: 'R19 25a 与部署取值一致性（警告，P1 未验证）',
  四: 'I 表 15 项字段齐全（7 项必填 + 8 项条件必填，34 §4.3）',
  五: '链路、幂等与事件流（部署配置 → 类型 → 实例记录）',
  六: '封链证明版本化（R20，警告，P1 未验证）',
};

const STATUS_LABEL = { PASS: '通过', WARN: '警告', FAIL: '不通过', SKIP: '跳过' };

function add(section, id, rule, level, status, title, detail = '') {
  results.push({ section, id, rule, level, status, title, detail });
}
const pass = (s, id, rule, level, title, detail) => add(s, id, rule, level, 'PASS', title, detail);
const warn = (s, id, rule, level, title, detail) => add(s, id, rule, level, 'WARN', title, detail);
const fail = (s, id, rule, level, title, detail) => add(s, id, rule, level, 'FAIL', title, detail);
const skip = (s, id, rule, level, title, detail) => add(s, id, rule, level, 'SKIP', title, detail);

// ── 通用工具 ────────────────────────────────────────────────────────────────
const has = (obj, key) => obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0 && v.trim() !== '—';
const isPresent = (v) => {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
};
const readUtf8 = (path) => {
  const buf = readFileSync(path);
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  return { text: buf.toString('utf8').replace(/^\uFEFF/, ''), bom, bytes: buf.length };
};
const sectionOf = (text, heading) => {
  const i = text.indexOf(heading);
  if (i < 0) return '';
  const rest = text.slice(i);
  const j = rest.indexOf('\n### ', 4);
  return j < 0 ? rest : rest.slice(0, j);
};
const splitMarkdownRow = (line) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());

// ── 读取输入 ────────────────────────────────────────────────────────────────
let dpFile = null;
let dp = null;
let dpFatal = '';
try {
  dpFile = readUtf8(PATHS.dp);
  dp = JSON.parse(dpFile.text);
} catch (err) {
  dpFatal = err && err.message ? err.message : String(err);
}

let recordFile = null;
let record = null;
let recordFatal = '';
try {
  recordFile = readUtf8(PATHS.record);
  record = JSON.parse(recordFile.text);
} catch (err) {
  recordFatal = err && err.message ? err.message : String(err);
}

let backfillText = '';
let typeDefText = '';
try { backfillText = readUtf8(PATHS.backfill).text; } catch { backfillText = ''; }
try { typeDefText = readUtf8(PATHS.typeDef).text; } catch { typeDefText = ''; }

// 48 回填表 T065 行：| T编号 | 类型名称 | 域 | 租户 id | 是否允许跨租户 | 跨租户理由 | 跨租户审批人 | I13 口径 | 备注 |
const backfillRowLine = backfillText.split(/\r?\n/).find((l) => /^\|\s*T065\s*\|/.test(l)) || '';
const backfillCells = backfillRowLine ? splitMarkdownRow(backfillRowLine) : null;
const crossTenantValue = backfillCells ? backfillCells[4] : '';
const crossReason = backfillCells ? backfillCells[5] : '';
const crossApprover = backfillCells ? backfillCells[6] : '';
const crossI13 = backfillCells ? backfillCells[7] : '';
const t065Section = sectionOf(typeDefText, '### T065 安全巡检 Agent');
const dpTenants = dp && Array.isArray(dp['租户清单']) ? dp['租户清单'] : [];
const dpTenantIds = dpTenants.map((t) => (t && typeof t['租户 id'] === 'string' ? t['租户 id'].trim() : '')).filter(Boolean);
const dpTypes = dp && Array.isArray(dp['类型部署取值']) ? dp['类型部署取值'] : [];
const dpVersion = dp && typeof dp['配置版本号'] === 'string' ? dp['配置版本号'].trim() : '';
const dpForm = dp && typeof dp['部署形态'] === 'string' ? dp['部署形态'].trim() : '';
const isSingleHost = dpForm === '单机';

// ══ 一、DP-1 结构 ═══════════════════════════════════════════════════════════
if (dpFatal) {
  fail('一', 'DP-01', '结构', 'P0', 'DP-1.json 可读取并可解析为 JSON', `读取或解析失败：${dpFatal}`);
} else {
  const bomNote = dpFile.bom ? '发现 UTF-8 BOM' : '无 BOM';
  pass('一', 'DP-01', '结构', 'P0', 'DP-1.json 可读取并可解析为 JSON', `解析成功，${dpFile.bytes} 字节，${bomNote}`);
}

const REQUIRED_TOP = ['部署形态', '租户清单', '配置版本号', '类型部署取值', '生效日期'];
const missingTop = REQUIRED_TOP.filter((k) => !has(dp, k));
if (missingTop.length === 0) {
  pass('一', 'DP-02', '结构', 'P0', '必备顶层字段齐全', REQUIRED_TOP.join(' / '));
} else {
  fail('一', 'DP-02', '结构', 'P0', '必备顶层字段齐全', `缺：${missingTop.join('、')}`);
}

if (['单机', '多租户'].includes(dpForm)) {
  pass('一', 'DP-03', '结构', 'P0', '部署形态为 单机 或 多租户', `取值=${dpForm}`);
} else {
  fail('一', 'DP-03', '结构', 'P0', '部署形态为 单机 或 多租户', `取值=${JSON.stringify(dp && dp['部署形态'])}`);
}

const tenantShapeOk = Array.isArray(dp && dp['租户清单']) && dpTenants.length > 0
  && dpTenants.every((t) => t && typeof t === 'object' && isNonEmptyString(t['租户 id']) && isNonEmptyString(t['名称']));
if (tenantShapeOk) {
  pass('一', 'DP-04', '结构', 'P0', '租户清单非空且每项含 租户 id 与 名称', `共 ${dpTenants.length} 项：${dpTenantIds.join('、')}`);
} else {
  fail('一', 'DP-04', '结构', 'P0', '租户清单非空且每项含 租户 id 与 名称', '租户清单缺失、为空或项缺字段');
}

const PLACEHOLDER_TENANTS = new Set(['全部租户', '公共', '*', 'all', 'ALL', '所有租户']);
const badTenantId = dpTenantIds.filter((id) => PLACEHOLDER_TENANTS.has(id));
if (dpTenantIds.length > 0 && badTenantId.length === 0) {
  pass('一', 'DP-05', '结构', 'P0', '租户 id 不是占位值（全部租户/公共/*）', `取值：${dpTenantIds.join('、')}`);
} else {
  fail('一', 'DP-05', '结构', 'P0', '租户 id 不是占位值（全部租户/公共/*）', `占位值：${badTenantId.join('、') || '无有效租户 id'}`);
}

const versionOk = isNonEmptyString(dpVersion) && dpVersion !== '最新' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(dpVersion);
if (versionOk) {
  pass('一', 'DP-06', '结构', 'P0', '配置版本号非空、非“最新”且可解析', `取值=${dpVersion}`);
} else {
  fail('一', 'DP-06', '结构', 'P0', '配置版本号非空、非“最新”且可解析', `取值=${JSON.stringify(dp && dp['配置版本号'])}`);
}

const VERSION_RE = /^([^@\s]+)@([^@\s]+)$/;
const badTenantVersion = [];
for (const t of dpTenants) {
  const tid = typeof t['租户 id'] === 'string' ? t['租户 id'].trim() : '';
  const tv = typeof t['租户配置版本'] === 'string' ? t['租户配置版本'].trim() : '';
  const m = VERSION_RE.exec(tv);
  if (!m || m[1] !== tid || m[2] !== dpVersion) badTenantVersion.push(`${tid || '?'} => ${tv || '空'}`);
}
if (dpTenants.length > 0 && badTenantVersion.length === 0) {
  pass('一', 'DP-07', '结构', 'P0', '租户配置版本形如 `租户id@配置版本` 且版本等于配置版本号',
    dpTenants.map((t) => t['租户配置版本']).join('、'));
} else {
  fail('一', 'DP-07', '结构', 'P0', '租户配置版本形如 `租户id@配置版本` 且版本等于配置版本号',
    `不一致：${badTenantVersion.join('；') || '无租户'}`);
}

if (isSingleHost && dpTenantIds.length === 1 && dpTenantIds[0] === 'local') {
  pass('一', 'DP-08', '结构', 'P0', '单机部署租户清单只含 local（R19 单机取 local）', '租户清单=[local]');
} else if (isSingleHost) {
  fail('一', 'DP-08', '结构', 'P0', '单机部署租户清单只含 local（R19 单机取 local）', `实际：${dpTenantIds.join('、') || '空'}`);
} else {
  pass('一', 'DP-09', '结构', 'P0', '类型部署取值可解析且命中登记租户', '多租户部署，跳过单机检查');
}

const TYPE_VERSION_RE = /^T\d{3}-[a-z0-9-]+@v\d+$/;
const typeValueProblems = [];
for (const t of dpTypes) {
  const key = typeof t['类型 id@版本'] === 'string' ? t['类型 id@版本'].trim() : '';
  const value = typeof t['部署取值'] === 'string' ? t['部署取值'].trim() : '';
  if (!TYPE_VERSION_RE.test(key)) typeValueProblems.push(`类型 id@版本 不可解析：${key || '空'}`);
  if (!value) typeValueProblems.push(`${key || '?'} 缺部署取值`);
  else if (isSingleHost && value !== 'local') typeValueProblems.push(`${key} 单机部署取值不是 local：${value}`);
  else if (!isSingleHost && !dpTenantIds.includes(value)) typeValueProblems.push(`${key} 部署取值未命中租户清单：${value}`);
}
if (dpTypes.length > 0 && typeValueProblems.length === 0) {
  pass('一', 'DP-09', '结构', 'P0', '类型部署取值可解析且命中登记租户',
    dpTypes.map((t) => `${t['类型 id@版本']}=${t['部署取值']}`).join('、'));
} else {
  fail('一', 'DP-09', '结构', 'P0', '类型部署取值可解析且命中登记租户', typeValueProblems.join('；') || '类型部署取值为空');
}

const effectiveDate = dp && typeof dp['生效日期'] === 'string' ? dp['生效日期'].trim() : '';
const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) && !Number.isNaN(Date.parse(`${effectiveDate}T00:00:00Z`));
if (dateOk) {
  pass('一', 'DP-10', '结构', 'P0', '生效日期为合法 YYYY-MM-DD', effectiveDate);
} else {
  fail('一', 'DP-10', '结构', 'P0', '生效日期为合法 YYYY-MM-DD', `取值=${JSON.stringify(dp && dp['生效日期'])}`);
}

// ══ 二、R17 类型级 25a ══════════════════════════════════════════════════════
const VALID_25A = new Set(['是', '否', '仅特定场景']);
if (backfillCells && backfillCells.length >= 8) {
  pass('二', 'R17-01', 'R17', 'P0', '25a 载体可定位且回填行 8 列齐全',
    `48 §1 T065 行：类型=${backfillCells[1]}；租户 id=${backfillCells[3]}；是否允许跨租户=${crossTenantValue}`);
} else {
  fail('二', 'R17-01', 'R17', 'P0', '25a 载体可定位且回填行 8 列齐全', '48 回填表中未找到 T065 行');
}

if (/25a|行\s*25|租户归属|跨租户/.test(t065Section)) {
  pass('二', 'R17-02', 'R17', 'P0', '类型定义本体（38）含 25a 填写位', '38 T065 段落已含租户字段');
} else {
  warn('二', 'R17-02', 'R17', 'P1', '类型定义本体（38）含 25a 填写位',
    '38 的 T065 段只有九要素与验证发现，没有行 25 / 25a 字段；R17 只能对 48 草案执行，本条不能作为阻断证据，需人工评审');
}

if (VALID_25A.has(crossTenantValue)) {
  pass('二', 'R17-03', 'R17', 'P0', '25a 取值为 是 / 否 / 仅特定场景 之一', `取值=${crossTenantValue}`);
} else {
  fail('二', 'R17-03', 'R17', 'P0', '25a 取值为 是 / 否 / 仅特定场景 之一', `取值=${JSON.stringify(crossTenantValue)}`);
}

const reasonSegments = crossReason.split(/[；;]/).map((s) => s.trim()).filter(Boolean);
const flowSegment = reasonSegments[0] || '';
const receiverSegment = reasonSegments.find((s) => s.includes('接收方')) || '';
const basisSegment = reasonSegments.find((s) => s.includes('依据')) || '';
if (flowSegment.length >= 8 && /(扫描|读取|写入|从|到|回传|访问)/.test(flowSegment)) {
  pass('二', 'R17-04', 'R17', 'P0', '三要素·数据流向可解析（哪类数据从哪到哪）', `数据流向=${flowSegment}`);
} else {
  fail('二', 'R17-04', 'R17', 'P0', '三要素·数据流向可解析（哪类数据从哪到哪）', `数据流向段=${JSON.stringify(flowSegment)}`);
}

const receiverOk = receiverSegment.length > 0
  && /(接收方)/.test(receiverSegment)
  && /(租户|角色|外部)/.test(receiverSegment);
if (receiverOk) {
  pass('二', 'R17-05', 'R17', 'P0', '三要素·接收方角色可解析（租户内角色或外部角色）', `接收方=${receiverSegment}`);
} else {
  fail('二', 'R17-05', 'R17', 'P0', '三要素·接收方角色可解析（租户内角色或外部角色）', `接收方段=${JSON.stringify(receiverSegment)}`);
}

const basisHasNumber = /(第\s*[0-9一二三四五六七八九十]+\s*条|合同编号|条款编号|编号\s*[:：]?\s*[A-Za-z0-9])/.test(basisSegment);
if (basisSegment && basisHasNumber) {
  pass('二', 'R17-06', 'R17', 'P0', '三要素·法域或合同依据可解析（写到法规条款或合同编号）', `依据=${basisSegment}`);
} else if (basisSegment) {
  warn('二', 'R17-06', 'R17', 'P1', '三要素·法域或合同依据可解析（写到法规条款或合同编号）',
    `依据段有依据类型但无条款/合同编号：${basisSegment}；25a 未正式入类型定义，按警告转人工，正式入库时本条为 R17 阻断不通过`);
} else {
  fail('二', 'R17-06', 'R17', 'P0', '三要素·法域或合同依据可解析（写到法规条款或合同编号）', '依据段缺失');
}

const approverHasLevel = /A[0-3]/.test(crossApprover);
const approverHasRole = /(负责人|主管|经理|负责人|合规|安全|审计|角色)/.test(crossApprover);
if (['是', '仅特定场景'].includes(crossTenantValue) && approverHasLevel && approverHasRole) {
  pass('二', 'R17-07', 'R17', 'P0', '取“是/仅特定场景”时审批角色含角色与审批档', `审批角色=${crossApprover}`);
} else {
  fail('二', 'R17-07', 'R17', 'P0', '取“是/仅特定场景”时审批角色含角色与审批档',
    `审批角色=${JSON.stringify(crossApprover)}（需角色 + A0 至 A3 审批档）`);
}

// 类型所有者字段在 37/38 均不存在；48 §3 的“与类型所有者不同”是文本自述，不是可核对的字段。
const ownerCarrier = /类型所有者/.test(t065Section);
if (ownerCarrier) {
  pass('二', 'R17-08', 'R17', 'P1', '审批角色与类型所有者不是同一人', '38 T065 段有类型所有者字段，可复核');
} else {
  warn('二', 'R17-08', 'R17', 'P1', '审批角色与类型所有者不是同一人',
    '38 的 T065 段没有“类型所有者”字段，48 §3 声称审批人“与类型所有者不同”只是文本自述；R17 的同人校验没有可核对的载体，只能人工判');
}

if (crossTenantValue === '继承' && !/组合/.test(backfillCells ? backfillCells[8] : '')) {
  fail('二', 'R17-09', 'R17', 'P0', '非组合成员不得写“继承”', 'T065 不是组合成员但 25a 写“继承”');
} else {
  pass('二', 'R17-09', 'R17', 'P0', '非组合成员不得写“继承”', `T065 非组合成员，25a=${crossTenantValue}，未写“继承”`);
}

// 组合条目字段 7 解析逻辑（T065 非组合成员，未触发；--self-test 验证逻辑本身）
function resolveInheritedTenant(member25a, comboEntry) {
  if (member25a !== '继承') return { ok: false, reason: '成员 25a 不是“继承”，不触发组合解析' };
  if (!comboEntry || !has(comboEntry, '租户归属')) return { ok: false, reason: '组合条目缺字段 7 租户归属（34 §4.8）' };
  const raw = String(comboEntry['租户归属']).trim();
  const m = VERSION_RE.exec(raw);
  if (!m) return { ok: false, reason: `字段 7 不是 租户id@配置版本：${raw}` };
  return { ok: true, tenantId: m[1], configVersion: m[2], raw };
}
const comboIsMember = /组合/.test(backfillCells ? backfillCells[8] : '');
if (crossTenantValue === '继承') {
  const resolved = resolveInheritedTenant(crossTenantValue, null);
  if (resolved.ok) {
    pass('二', 'R17-10', 'R17', 'P1', '成员 25a 写“继承”时按组合条目字段 7 解析', `解析为 ${resolved.raw}`);
  } else {
    fail('二', 'R17-10', 'R17', 'P0', '成员 25a 写“继承”时按组合条目字段 7 解析', resolved.reason);
  }
} else {
  skip('二', 'R17-10', 'R17', 'P1', '成员 25a 写“继承”时按组合条目字段 7 解析',
    `T065 非组合成员（组合=${comboIsMember ? '是' : '否'}），未触发；解析逻辑已实现，用 --self-test 验证`);
}

// ══ 三、R19 部署取值一致性（P1） ═════════════════════════════════════════════
if (versionOk) {
  pass('三', 'R19-01', 'R19', 'P1', 'DP-1 部署配置版本非空且可解析', `配置版本号=${dpVersion}`);
} else {
  warn('三', 'R19-01', 'R19', 'P1', 'DP-1 部署配置版本非空且可解析', `配置版本号=${JSON.stringify(dp && dp['配置版本号'])}`);
}

if (isSingleHost && crossTenantValue === '是') {
  warn('三', 'R19-02', 'R19', 'P1', '单机部署的 25a 取值不是“是”',
    `部署形态=${dpForm}，48 的 T065 25a=是；R19 判定项不满足，但 R19 标 P1 只作提示。这是 34 v1.5 未收口的 P0-1：25a 类型级语义与 25b 部署形态混在同一判定里`);
} else if (isSingleHost) {
  pass('三', 'R19-02', 'R19', 'P1', '单机部署的 25a 取值不是“是”', `部署形态=${dpForm}，25a=${crossTenantValue}`);
} else {
  pass('三', 'R19-02', 'R19', 'P1', '单机部署的 25a 取值不是“是”', '非单机部署，不适用');
}

const tenantCtx = record && record['instance'] && has(record['instance'], '租户上下文')
  ? record['instance']['租户上下文']['value'] : null;
const recordTenantId = tenantCtx && typeof tenantCtx['租户 id'] === 'string' ? tenantCtx['租户 id'].trim() : '';
const recordConfigVersion = tenantCtx && typeof tenantCtx['租户配置版本'] === 'string'
  ? tenantCtx['租户配置版本'].trim() : '';
const parsedRecordVersion = VERSION_RE.exec(recordConfigVersion);
const i13TenantMatches = recordTenantId.length > 0
  && !PLACEHOLDER_TENANTS.has(recordTenantId)
  && dpTenantIds.includes(recordTenantId);
if (i13TenantMatches) {
  pass('三', 'R19-03', 'R19', 'P1', 'I 表第 13 项租户 id 命中 DP-1 登记清单', `I13 租户 id=${recordTenantId}，登记清单=${dpTenantIds.join('、')}`);
} else {
  warn('三', 'R19-03', 'R19', 'P1', 'I 表第 13 项租户 id 命中 DP-1 登记清单', `I13 租户 id=${JSON.stringify(recordTenantId)}，登记清单=${dpTenantIds.join('、')}`);
}

if (parsedRecordVersion && parsedRecordVersion[2] === dpVersion && parsedRecordVersion[1] === recordTenantId) {
  pass('三', 'R19-04', 'R19', 'P1', 'I 表第 13 项租户配置版本命中 DP-1 配置版本', recordConfigVersion);
} else {
  warn('三', 'R19-04', 'R19', 'P1', 'I 表第 13 项租户配置版本命中 DP-1 配置版本',
    `I13 写 ${JSON.stringify(recordConfigVersion)}，DP-1 配置版本=${dpVersion}；记录早于 DP-1 建立，引用占位版本 missing_dp1，按 R19 警告，不改原记录`);
}

const receiverRaw = dpTypes.length > 0 && typeof dpTypes[0]['接收方租户'] === 'string'
  ? dpTypes[0]['接收方租户'].trim() : '';
const receiverResolvable = receiverRaw.length > 0 && !receiverRaw.startsWith('—') && dpTenantIds.includes(receiverRaw);
if (crossTenantValue === '是' && !receiverResolvable) {
  warn('三', 'R19-05', 'R19', 'P1', '25a 为“是”时部署配置中存在对应接收方租户与配置版本',
    `DP-1 的 T065 接收方租户=${JSON.stringify(receiverRaw)}；单机部署只有 local，没有独立接收方租户，R19 判定项不满足`);
} else if (['是', '仅特定场景'].includes(crossTenantValue)) {
  pass('三', 'R19-05', 'R19', 'P1', '25a 为“是/仅特定场景”时部署配置中存在对应接收方租户与配置版本', receiverRaw);
} else {
  pass('三', 'R19-05', 'R19', 'P1', '25a 为“是/仅特定场景”时部署配置中存在对应接收方租户与配置版本', '25a=否，不适用');
}

// ══ 四、I 表 15 项字段 ═════════════════════════════════════════════════════
const instance = record && record['instance'] && typeof record['instance'] === 'object' ? record['instance'] : {};
const I_FIELDS = [
  [1, '实例 id', '必填', 'P0', ''],
  [2, '类型 id@版本', '必填', 'P0', ''],
  [3, '输入绑定', '必填', 'P0', '输入对象 + 输入摘要哈希 + 委托人'],
  [4, '租约', '条件必填', 'P1', '长驻/周期批处理/并发类型（T065 为长驻周期类型，条件命中）'],
  [5, '幂等键值', '条件必填', 'P1', 'T 表行 17=必须（T065 命中），写实际键值与生成时刻'],
  [6, '单次运行起止', '必填', 'P0', '开始/结束时刻 + 是否超时'],
  [7, '上轮结果引用', '条件必填', 'P1', '非首次运行（本轮为 2026-W47 轮，条件命中）'],
  [8, '执行证据', '必填', 'P0', '证据条目 + 记录三性落盘证明 + 本次依据留痕 + 封链证明'],
  [9, '审批记录', '条件必填', 'P1', '有需审批能力或高合规（本轮 A0 免审，字段保留）'],
  [10, '状态外化引用', '条件必填', 'P1', '长驻/周期批处理（T065 长驻，条件命中）'],
  [11, '产出引用', '条件必填', 'P1', '成功运行（生命周期=成功，条件命中）'],
  [12, '生命周期状态', '必填', 'P0', '七值枚举之一 + 状态变更时刻'],
  [13, '租户上下文', '条件必填', 'P1', '多租户必填；单机单租户可空（本记录仍写了 local）'],
  [14, '运行事件流', '必填', 'P0', '每次运行至少一条，序号从 1 起单调'],
  [15, '义务清单引用', '条件必填', 'P1', '高合规必填；非高合规写 — 并说明'],
];
const eventStream = instance['运行事件流'] && Array.isArray(instance['运行事件流']['value'])
  ? instance['运行事件流']['value'] : [];
const evidenceValue = instance['执行证据'] ? instance['执行证据']['value'] : null;
const i13Parts = VERSION_RE.exec(recordConfigVersion);

for (const [n, name, need, level, cond] of I_FIELDS) {
  const entry = instance[name];
  const present = entry && has(entry, 'value') && isPresent(entry['value']);
  let detail = cond ? `${need}（${cond}）` : need;
  if (present) {
    const source = typeof entry.source === 'string' ? entry.source : '';
    detail += `；source=${source || '未写'}`;
    if (n === 3 && entry['value'] && typeof entry['value'] === 'object') {
      const sub = ['输入对象', '输入摘要哈希', '委托人'].filter((k) => !has(entry['value'], k));
      detail += sub.length === 0 ? '；三项子字段齐全' : `；缺子字段：${sub.join('、')}`;
      if (entry['value']['输入摘要哈希'] && String(entry['value']['输入摘要哈希']).includes('未计算')) {
        detail += '；摘要哈希未计算（未验证项）';
      }
    }
    if (n === 8 && entry['value'] && typeof entry['value'] === 'object') {
      const sub = ['证据条目', '记录三性落盘证明', '本次依据留痕', '封链证明'].filter((k) => !has(entry['value'], k));
      detail += sub.length === 0 ? '；四个子块齐全' : `；缺子块：${sub.join('、')}`;
    }
    if (n === 9 && entry['value'] && typeof entry['value'] === 'object') {
      detail += `；审批档=${entry['value']['审批档']}`;
    }
    if (n === 13) {
      detail += `；租户 id=${recordTenantId || '空'}；租户配置版本=${recordConfigVersion || '空'}`;
    }
    if (n === 14) {
      detail += `；事件 ${eventStream.length} 条：序号 ${eventStream.map((e) => e['事件序号']).join('、')}`;
    }
    if (n === 15) {
      detail += `；取值=${JSON.stringify(entry['value'])}`;
    }
    pass('四', `I-${String(n).padStart(2, '0')}`, 'I 表', level, `第 ${n} 项 ${name}`, detail);
  } else if (need === '必填') {
    fail('四', `I-${String(n).padStart(2, '0')}`, 'I 表', level, `第 ${n} 项 ${name}`, `${detail}；字段缺失或为空`);
  } else {
    fail('四', `I-${String(n).padStart(2, '0')}`, 'I 表', level, `第 ${n} 项 ${name}`, `${detail}；条件必填命中但字段缺失或为空`);
  }
}

// 类型 id@版本 结构（I 表第 2 项）单独校验可解析性
const recordTypeKey = instance['类型 id@版本'] && typeof instance['类型 id@版本']['value'] === 'string'
  ? instance['类型 id@版本']['value'].trim() : '';
if (TYPE_VERSION_RE.test(recordTypeKey)) {
  pass('四', 'I-02b', 'I 表', 'P0', 'I 表第 2 项 类型 id@版本 可解析为 T0NN-slug@vN', recordTypeKey);
} else {
  fail('四', 'I-02b', 'I 表', 'P0', 'I 表第 2 项 类型 id@版本 可解析为 T0NN-slug@vN', `取值=${JSON.stringify(recordTypeKey)}`);
}

// ══ 五、链路、幂等与事件流 ═══════════════════════════════════════════════════
const l01Ok = i13Parts && recordTenantId.length > 0 && recordConfigVersion.length > 0;
if (l01Ok) {
  pass('五', 'L-01', '链路', 'P0', 'I 表第 13 项租户上下文可解析为 租户id@配置版本',
    `${recordConfigVersion} → 租户 id=${recordTenantId}，配置版本=${i13Parts[2]}`);
} else {
  warn('五', 'L-01', '链路', 'P1', 'I 表第 13 项租户上下文可解析为 租户id@配置版本',
    `取值=${JSON.stringify(recordConfigVersion)}`);
}

const runs = record && Array.isArray(record.runs) ? record.runs : [];
const runInstanceIds = runs.map((r) => (r['实例 id'] && r['实例 id']['value']) || '');
const instanceId = instance['实例 id'] ? instance['实例 id']['value'] : '';
const runInstanceIdsOk = runs.length === 3 && runInstanceIds.every((id) => id === instanceId && id.length > 0);
if (runInstanceIdsOk) {
  pass('五', 'L-02', '链路', 'P0', '三条运行视图的实例 id 一致且等于实例级记录', instanceId);
} else {
  fail('五', 'L-02', '链路', 'P0', '三条运行视图的实例 id 一致且等于实例级记录',
    `实例级=${JSON.stringify(instanceId)}；运行视图=${runInstanceIds.join('、')}`);
}

const runKeys = runs.map((r) => (r['幂等键值'] && r['幂等键值']['value'] && r['幂等键值']['value']['键值']) || '');
const instanceKey = instance['幂等键值'] && instance['幂等键值']['value'] ? instance['幂等键值']['value']['键值'] : '';
const idemOk = runs.length === 3 && runKeys.every((k) => k === instanceKey && k.length > 0);
if (idemOk) {
  pass('五', 'L-03', '链路', 'P0', '三次运行幂等键值一致且等于实例级记录', instanceKey);
} else {
  fail('五', 'L-03', '链路', 'P0', '三次运行幂等键值一致且等于实例级记录',
    `实例级=${JSON.stringify(instanceKey)}；运行视图=${runKeys.join('、')}`);
}

const runEventSeqs = runs.flatMap((r) => (Array.isArray(r['本次新增事件序号']) ? r['本次新增事件序号'] : []));
const streamSeqs = eventStream.map((e) => e['事件序号']);
const unionSeqs = [...new Set(runEventSeqs)].sort((a, b) => a - b);
const unionOk = runs.length === 3
  && unionSeqs.length === streamSeqs.length
  && unionSeqs.every((v, i) => v === streamSeqs[i])
  && runEventSeqs.length === new Set(runEventSeqs).size;
if (unionOk) {
  pass('五', 'L-04', '链路', 'P0', '三次运行新增事件序号并集覆盖事件流全部序号且无重复',
    `运行视图新增=${JSON.stringify(runs.map((r) => r['本次新增事件序号']))}；并集=[${unionSeqs.join(',')}]；事件流=[${streamSeqs.join(',')}]`);
} else {
  fail('五', 'L-04', '链路', 'P0', '三次运行新增事件序号并集覆盖事件流全部序号且无重复',
    `运行视图新增=${JSON.stringify(runs.map((r) => r['本次新增事件序号']))}；并集=[${unionSeqs.join(',')}]；事件流=[${streamSeqs.join(',')}]`);
}

const dpTypeKeys = dpTypes.map((t) => (typeof t['类型 id@版本'] === 'string' ? t['类型 id@版本'].trim() : ''));
const linkOk = dpTypeKeys.includes(recordTypeKey) && t065Section.includes(recordTypeKey);
if (linkOk) {
  pass('五', 'L-05', '链路', 'P0', '类型版本链路可闭合：DP-1 登记 ↔ I 表第 2 项 ↔ 38 类型定义',
    `${recordTypeKey} 同时出现在 DP-1 类型部署取值（部署取值 local）、50 实例记录与 38 T065 定义`);
} else {
  fail('五', 'L-05', '链路', 'P0', '类型版本链路可闭合：DP-1 登记 ↔ I 表第 2 项 ↔ 38 类型定义',
    `DP-1=${JSON.stringify(dpTypeKeys)}；I 表=${recordTypeKey}；38 命中=${t065Section.includes(recordTypeKey)}`);
}

const EVENT_TYPES = new Set(['拒绝', '重放', '接管', '审批', '失败', '异常']);
const eventTypes = eventStream.map((e) => e['事件类型']);
const C19_TYPES = ['拒绝', '重放', '接管'];
const c19Events = eventStream.filter((e) => C19_TYPES.includes(e['事件类型']));
const c19TypeSet = new Set(c19Events.map((e) => e['事件类型']));
const c19RefOk = c19Events.every((e) => /I\s*表|第\s*\d+\s*项|I-[A-Za-z0-9]/.test(String(e['引用对象'] || '')));
const c19Locatable = C19_TYPES.every((t) => c19TypeSet.has(t)) && c19RefOk;
if (c19Locatable) {
  pass('五', 'L-06', '链路', 'P0', 'C19 拒绝/重放/接管三类事件都存在且引用对象可定位到 I 表记录',
    `事件类型=${eventTypes.join('、')}；三类事件的引用对象：${
      c19Events.map((e) => `${e['事件序号']} ${e['事件类型']}→${String(e['引用对象']).split('；')[0]}`).join(' / ')}`);
} else {
  fail('五', 'L-06', '链路', 'P0', 'C19 拒绝/重放/接管三类事件都存在且引用对象可定位到 I 表记录',
    `事件类型=${eventTypes.join('、')}；缺失=${C19_TYPES.filter((t) => !c19TypeSet.has(t)).join('、') || '无'}；引用对象可定位=${c19RefOk}`);
}

const eventSeqSorted = streamSeqs.every((v, i) => i === 0 ? v === 1 : v === streamSeqs[i - 1] + 1);
const eventTimeSorted = eventStream.every((e, i) => i === 0
  || Date.parse(e['事件时间']) >= Date.parse(eventStream[i - 1]['事件时间']));
const eventFieldsOk = eventStream.length > 0 && eventStream.every((e) =>
  ['事件序号', '事件时间', '事件类型', '判定依据', '引用对象', '判定人角色'].every((k) => isPresent(e[k]))
  && EVENT_TYPES.has(e['事件类型']));
if (eventSeqSorted && eventTimeSorted && eventFieldsOk) {
  pass('五', 'L-07', '链路', 'P0', '事件流序号从 1 起单调、时间单调、六个必填子字段齐全且类型在六值内',
    `序号=[${streamSeqs.join(',')}]；类型=[${eventTypes.join('、')}]；时间单调`);
} else {
  fail('五', 'L-07', '链路', 'P0', '事件流序号从 1 起单调、时间单调、六个必填子字段齐全且类型在六值内',
    `序号=[${streamSeqs.join(',')}]；序号单调=${eventSeqSorted}；时间单调=${eventTimeSorted}；子字段齐全=${eventFieldsOk}`);
}

const RUN_EXTRA = ['运行标识', '本次新增事件序号'];
const runShapesOk = runs.length === 3 && runs.every((r) =>
  I_FIELDS.every(([, name]) => has(r, name)) && RUN_EXTRA.every((k) => has(r, k)));
if (runShapesOk) {
  warn('五', 'L-08', '链路', 'P1', '三条运行视图与实例级同构（15 项字段 + 运行标识 + 本次新增事件序号）',
    '字段名齐全，但运行视图第 8 项的“证据条目/记录三性落盘证明/本次依据留痕”被简写为字符串且无“封链证明”子块，与 34 §4.3 第 8 项结构不同；字段齐全不等于结构同构');
} else {
  fail('五', 'L-08', '链路', 'P0', '三条运行视图与实例级同构（15 项字段 + 运行标识 + 本次新增事件序号）', '存在缺字段的运行视图');
}

// ══ 六、封链证明版本化（R20，P1；字段按 57 定下的五子项） ═══════════════════
const seal = evidenceValue && evidenceValue['封链证明'] ? evidenceValue['封链证明'] : null;
const SEAL_FIELDS = ['封链版本号', '封链时点', '封链末事件序号', '封链哈希', '前一版本引用'];
const sealMissing = SEAL_FIELDS.filter((k) => !(seal && isPresent(seal[k])));
if (seal && sealMissing.length === 0) {
  pass('六', 'S-01', 'R20', 'P1', '封链证明五子项齐全（版本号、时点、末事件序号、哈希、前一版本引用）',
    `封链版本号=${seal['封链版本号']}；封链时点=${seal['封链时点']}；封链末事件序号=${seal['封链末事件序号']}；前一版本引用=${seal['前一版本引用']}`);
} else {
  warn('六', 'S-01', 'R20', 'P1', '封链证明五子项齐全（版本号、时点、末事件序号、哈希、前一版本引用）',
    `封链证明缺失或子项不全，缺：${sealMissing.length ? sealMissing.join('、') : '封链证明整块'}`);
}

const sealSeq = seal ? Number(seal['封链末事件序号']) : NaN;
const maxStreamSeq = streamSeqs.length ? Math.max(...streamSeqs) : 0;
if (Number.isFinite(sealSeq) && sealSeq === maxStreamSeq) {
  pass('六', 'S-02', 'R20', 'P1', '封链末事件序号等于追加后事件流末序号', `封链=${sealSeq}，事件流末=${maxStreamSeq}`);
} else {
  warn('六', 'S-02', 'R20', 'P1', '封链末事件序号等于追加后事件流末序号',
    `封链末事件序号=${sealSeq}，事件流末序号=${maxStreamSeq}；追加后未生成新版本封链证明，R20 判定项不满足（P1 只作提示）`);
}

const sealVer = seal ? String(seal['封链版本号'] || '') : '';
const prevRef = seal ? String(seal['前一版本引用'] || '') : '';
const prevRefOk = /v\d+/.test(prevRef) && /末事件序号\s*\d+/.test(prevRef) && /哈希/.test(prevRef);
if (prevRefOk) {
  pass('六', 'S-03', 'R20', 'P1', '前一版本引用含版本号、末事件序号与哈希三项', prevRef);
} else if (/^v1$/.test(sealVer) && /首版|无前一版本/.test(prevRef)) {
  pass('六', 'S-03', 'R20', 'P1', '首版封链证明无需前一版本引用，引用位已声明', `封链版本号=${sealVer}；前一版本引用=${prevRef}`);
} else {
  warn('六', 'S-03', 'R20', 'P1', '前一版本引用含版本号、末事件序号与哈希三项',
    `封链版本号=${sealVer}；前一版本引用=${prevRef}；引用不完整，R20 要求追加后的新版本必须写前一版本号、末事件序号与哈希`);
}

const sealVersions = [];
if (seal && Array.isArray(seal['版本序列'])) sealVersions.push(...seal['版本序列']);
const prevSeqMatch = prevRef.match(/末事件序号\s*(\d+)/);
const prevSeq = prevSeqMatch ? Number(prevSeqMatch[1]) : NaN;
if (sealVersions.length >= 2) {
  const monotonic = sealVersions.every((v, i) => i === 0 || String(v) > String(sealVersions[i - 1]));
  const seqOrdered = !Number.isFinite(sealSeq) || !Number.isFinite(prevSeq) || sealSeq > prevSeq;
  if (monotonic && seqOrdered) {
    pass('六', 'S-04', 'R20', 'P1', '封链版本序列单调递增、旧版本保留且末事件序号严格递增',
      `${sealVersions.join(' 到 ')}；前一版本末序号=${prevSeq}，本版本末序号=${sealSeq}`);
  } else {
    warn('六', 'S-04', 'R20', 'P1', '封链版本序列单调递增、旧版本保留且末事件序号严格递增',
      `版本序列=${sealVersions.join(' 到 ')}；单调=${monotonic}；末序号递增=${seqOrdered}`);
  }
} else {
  skip('六', 'S-04', 'R20', 'P1', '封链版本序列单调递增、旧版本保留且末事件序号严格递增',
    '封链证明只有一版，版本序列与旧版本保留不可判定；首版追加前这一项不适用');
}

const runSealMissing = runs.length > 0 && runs.every((r) => {
  const v = r['执行证据'] && r['执行证据']['value'];
  return v && typeof v === 'object' && !has(v, '封链证明');
});
if (runSealMissing) {
  warn('六', 'S-05', 'R20', 'P1', '运行视图第 8 项含封链证明（版本号、时点、前一版本引用）',
    '三条运行视图的第 8 项都没有“封链证明”子块，封链版本只能在实例级第 8 项核对；运行级视图无法独立复核封链');
} else if (runs.length === 0) {
  warn('六', 'S-05', 'R20', 'P1', '运行视图第 8 项含封链证明（版本号、时点、前一版本引用）', '没有运行视图');
} else {
  pass('六', 'S-05', 'R20', 'P1', '运行视图第 8 项含封链证明（版本号、时点、前一版本引用）', '运行视图第 8 项含封链证明');
}

// ══ 自测：组合条目字段 7 的“继承”解析（T065 无样本，验证逻辑分支可用） ═════
const selfTestResults = [];
if (SELF_TEST) {
  const comboOk = { '组合 id@版本': 'C-DEMO@v1', '租户归属': 'local@dp1-local-20261122-01' };
  const comboBad = { '组合 id@版本': 'C-DEMO@v1' };
  const comboMismatch = { '组合 id@版本': 'C-DEMO@v1', '租户归属': 'tenant-a@cfg-9' };
  const cases = [
    ['继承 + 组合条目字段 7 可解析', resolveInheritedTenant('继承', comboOk), (r) => r.ok && r.tenantId === 'local' && r.configVersion === 'dp1-local-20261122-01'],
    ['继承 + 组合条目缺字段 7', resolveInheritedTenant('继承', comboBad), (r) => !r.ok && /缺字段 7/.test(r.reason)],
    ['成员写具体租户且与组合租户不一致', (() => {
      const m = VERSION_RE.exec('tenant-b@cfg-9');
      const member = { tenantId: m[1], configVersion: m[2] };
      const combo = VERSION_RE.exec(comboMismatch['租户归属']);
      return { ok: member.tenantId === combo[1] && member.configVersion === combo[2], reason: `成员=${member.tenantId}@${member.configVersion}，组合=${combo[1]}@${combo[2]}` };
    })(), (r) => !r.ok],
  ];
  for (const [name, result, predicate] of cases) {
    selfTestResults.push({ name, ok: predicate(result), detail: result.ok ? `${result.tenantId}@${result.configVersion}` : result.reason });
  }
}

// ══ 输出 ═══════════════════════════════════════════════════════════════════
const nodeVersion = process.version;
const out = [];
out.push('DP-1 部署配置登记表 · 首次真跑校验');
out.push('依据：34 v1.5 §4.2.25 / §4.3 / §4.8 / R17 / R19 / R20；33 v1.5 F1.5 C19/C20、F5.3、F2.7');
out.push(`运行环境：Node ${nodeVersion}，零依赖，脚本 dp/validate-dp.mjs`);
out.push(`DP-1      ：${PATHS.dp}`);
out.push(`I 表记录  ：${PATHS.record}`);
out.push(`25a 载体  ：${PATHS.backfill}`);
out.push(`类型定义  ：${PATHS.typeDef}`);
out.push('');
if (dpFatal) {
  out.push(`致命：DP-1 读取失败（${dpFatal}），仅能报告 DP-01。`);
}
if (recordFatal) {
  out.push(`致命：I 表记录读取失败（${recordFatal}）。`);
}

const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
for (const section of SECTION_ORDER) {
  const items = results.filter((r) => r.section === section);
  if (items.length === 0) continue;
  out.push(`[${section}] ${SECTION_TITLE[section]}（${items.length} 项）`);
  for (const r of items) {
    counts[r.status] += 1;
    out.push(`  [${STATUS_LABEL[r.status]}] ${r.id} ${r.title}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  out.push('');
}

const total = results.length;
out.push('─'.repeat(88));
out.push(`分组统计：${SECTION_ORDER.map((s) => {
  const items = results.filter((r) => r.section === s);
  return `[${s}] ${items.filter((r) => r.status === 'PASS').length}/${items.length} 通过`;
}).join('；')}`);
out.push(`汇总：共 ${total} 项，通过 ${counts.PASS}，警告 ${counts.WARN}，跳过 ${counts.SKIP}，不通过 ${counts.FAIL}`);
out.push('口径：只有“不通过”影响退出码；警告项按 34 §5.3 的 P1（R19/R20）或“载体缺失、只能人工判”处理。');
out.push(`退出码：${counts.FAIL > 0 ? 1 : 0}`);

const manual = results.filter((r) => r.status === 'WARN' || r.status === 'SKIP');
if (manual.length > 0) {
  out.push('');
  out.push('只能人工判或需人工复核的项：');
  for (const r of manual) out.push(`  · ${r.id} ${r.title}`);
}

if (SELF_TEST) {
  out.push('');
  out.push('组合条目字段 7 的“继承”解析自测（T065 无组合成员样本，用内置夹具验证逻辑分支）：');
  let okCount = 0;
  for (const [i, t] of selfTestResults.entries()) {
    if (t.ok) okCount += 1;
    out.push(`  [${t.ok ? '通过' : '不通过'}] 自测 ${i + 1}：${t.name} — ${t.detail}`);
  }
  out.push(`  自测汇总：${okCount}/${selfTestResults.length} 通过`);
}

process.stdout.write(`${out.join('\n')}\n`, 'utf8');
process.exitCode = counts.FAIL > 0 ? 1 : 0;
