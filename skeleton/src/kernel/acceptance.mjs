/**
 * 本文件对应决策 D-09：验收门（Acceptance Gate）—— 一等原语。
 *
 * 决策内容：
 *  - 场景包给出 evidenceContract：例如 bugfix 要求 reproTest / testPass / diffScope / rollback
 *    四项结构化证据（kind: text|boolean|list）；
 *  - Worker 的 Report 只有在**证据字段齐全且合格**时才可能进入 person/review；
 *  - 缺项时返回 {ok:false, missing:[{field,label,reason}]}，由 runtime 把 Ticket 退回 working
 *    并打印/持久化缺失清单；
 *  - 通过时签发 clearance（含 ticketId / contractId / evidenceHash），作为 tasks.enterReview
 *    的结构性凭证。
 *
 * 它保证的不变量：
 *  - 验收门是纯函数（不写库、不发事件），只依赖 evidenceContract + report.evidence；
 *  - 缺任何一项都 ok=false，不可能绕过（enterReview 只认 clearance）；
 *  - 证据判定规则显式：text 非空字符串、boolean 必须 true、list 非空数组；
 *  - 同一份 evidence 得到同一个 evidenceHash（确定性）。
 */
import { canonicalJson, shortHash } from './digest.mjs';

export const EVIDENCE_KINDS = Object.freeze(['text', 'boolean', 'list']);

export class AcceptanceConfigError extends Error {
  constructor(message) {
    super(`D-09: ${message}`);
    this.name = 'AcceptanceConfigError';
  }
}

function validateContract(contract) {
  if (!contract || typeof contract !== 'object') throw new AcceptanceConfigError('需要 evidenceContract');
  if (typeof contract.id !== 'string' || contract.id.length === 0) throw new AcceptanceConfigError('evidenceContract.id 必须是非空字符串');
  if (!Array.isArray(contract.requirements) || contract.requirements.length === 0) {
    throw new AcceptanceConfigError('evidenceContract.requirements 必须是非空数组');
  }
  const seen = new Set();
  for (const requirement of contract.requirements) {
    if (!requirement || typeof requirement.field !== 'string' || requirement.field.length === 0) {
      throw new AcceptanceConfigError('每个 evidence requirement 必须有非空 field');
    }
    if (seen.has(requirement.field)) throw new AcceptanceConfigError(`evidence 字段重复：${requirement.field}`);
    seen.add(requirement.field);
    if (!EVIDENCE_KINDS.includes(requirement.kind)) {
      throw new AcceptanceConfigError(`evidence 字段 ${requirement.field} 的 kind 必须是 ${EVIDENCE_KINDS.join('|')}`);
    }
    if (typeof requirement.label !== 'string' || requirement.label.length === 0) {
      throw new AcceptanceConfigError(`evidence 字段 ${requirement.field} 缺少 label`);
    }
  }
}

function evaluateRequirement(requirement, value) {
  switch (requirement.kind) {
    case 'text':
      if (typeof value !== 'string' || value.trim().length === 0) return { ok: false, reason: '缺少文本证据' };
      return { ok: true };
    case 'boolean':
      if (value === true) return { ok: true };
      if (value === false) return { ok: false, reason: '证据为 false（测试/检查未通过）' };
      return { ok: false, reason: '缺少布尔证据' };
    case 'list':
      if (!Array.isArray(value) || value.length === 0) return { ok: false, reason: '缺少列表证据' };
      return { ok: true };
    default:
      return { ok: false, reason: `未知证据类型 ${requirement.kind}` };
  }
}

export function createAcceptanceGate({ contract, clock = () => Date.now() } = {}) {
  validateContract(contract);
  const contractId = contract.id;

  /**
   * 检查一份 Report 的证据是否满足 evidenceContract。
   * @returns {{ok:boolean, contractId:string, ticketId:string|null, reportId:string|null,
   *            missing:Array<{field:string,label:string,reason:string,kind:string}>,
   *            satisfied:string[], evidenceHash:string,
   *            clearance?:{ok:true,ticketId:string,contractId:string,evidenceHash:string,grantedAt:number,by:string}}}
   */
  function check({ ticket = null, report = null } = {}) {
    if (!report || typeof report !== 'object') throw new AcceptanceConfigError('check 需要 report');
    const evidence = report.evidence && typeof report.evidence === 'object' && !Array.isArray(report.evidence) ? report.evidence : {};
    const missing = [];
    const satisfied = [];

    for (const requirement of contract.requirements) {
      const value = evidence[requirement.field];
      const verdict = evaluateRequirement(requirement, value);
      if (verdict.ok) {
        satisfied.push(requirement.field);
      } else {
        missing.push({ field: requirement.field, label: requirement.label, kind: requirement.kind, reason: verdict.reason });
      }
    }

    const evidenceHash = shortHash(canonicalJson(evidence), 16);
    const ticketId = ticket?.id ?? null;
    if (missing.length > 0) {
      return { ok: false, contractId, ticketId, reportId: report.id ?? null, missing, satisfied, evidenceHash };
    }
    return {
      ok: true,
      contractId,
      ticketId,
      reportId: report.id ?? null,
      missing: [],
      satisfied,
      evidenceHash,
      clearance: {
        ok: true,
        ticketId,
        contractId,
        reportId: report.id ?? null,
        evidenceHash,
        grantedAt: clock(),
        by: 'acceptance-gate',
      },
    };
  }

  return {
    check,
    contractId,
    contract,
    requirements: contract.requirements,
    /** 方便 demo/README 打印：缺项的人类可读标签。 */
    labelsOf: (missing = []) => missing.map((item) => item.label ?? item.field),
  };
}
