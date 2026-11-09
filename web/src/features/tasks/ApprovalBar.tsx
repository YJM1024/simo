// features/tasks/ApprovalBar.tsx —— 权限确认条（M9：风险 / 命令原文 / 影响范围 / 提权）
//
// 契约：docs/m9-contract.md §4。显示风险等级 + 工具名 + 命令/参数原文 + 影响范围（路径/提权）
// + justification；按钮：允许一次 / 本会话允许 / 拒绝；处理中禁用；不自动执行。
// never 策略下被后端拒绝的审批会显示「已按策略拒绝」。

import type { ApprovalDecision, TaskApproval } from './model.ts'
import { approvalRiskLabel, approvalRiskTone } from './model.ts'

interface ApprovalBarProps {
  approvals: TaskApproval[]
  busyId: string | null
  onDecide: (approvalId: string, decision: ApprovalDecision) => void
}

const RISK_TONE: Record<'ok' | 'warn' | 'danger' | 'muted', string> = {
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

/** 从 argsRaw 里取 command（pwsh）用于醒目展示。 */
function commandOf(approval: TaskApproval): string | null {
  if (!approval.argsRaw) return null
  try {
    const parsed: unknown = JSON.parse(approval.argsRaw)
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      const command = record['command'] ?? record['cmd']
      if (typeof command === 'string' && command.trim()) return command
    }
  } catch {
    // 非 JSON：原样当命令/参数展示
  }
  return null
}

function ApprovalCard({ approval, busy, onDecide }: { approval: TaskApproval; busy: boolean; onDecide: ApprovalBarProps['onDecide'] }) {
  const riskTone = RISK_TONE[approvalRiskTone(approval.risk)]
  const command = commandOf(approval)

  return (
    <li className="rounded-md border border-border-subtle bg-surface-solid p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${riskTone}`}>风险 · {approvalRiskLabel(approval.risk)}</span>
        <span className="rounded-xs border border-border-subtle bg-surface-sunken px-1.5 font-mono text-sm text-ink" title="工具名">
          {approval.kind}
        </span>
        {approval.policyDenied && (
          <span className="rounded-pill border border-danger-border bg-danger-soft px-1.5 font-mono text-2xs text-danger-ink">
            已按策略拒绝
          </span>
        )}
        {approval.requiresElevation && (
          <span
            className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink"
            title="本次调用申请更宽一档权限，仅本次有效"
          >
            申请提权{approval.requestedSandbox ? ` → ${approval.requestedSandbox}` : ''}
          </span>
        )}
        {approval.taskId && (
          <span className="truncate font-mono text-2xs text-muted" title={approval.taskId}>
            {approval.taskId}
          </span>
        )}
      </div>

      {approval.summary && approval.summary !== approval.argsRaw && (
        <p className="m-0 mt-1 whitespace-pre-wrap break-words text-2xs text-ink-secondary">{approval.summary}</p>
      )}

      {command && (
        <pre className="mt-1.5 mb-0 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-2 py-1 font-mono text-2xs leading-relaxed text-ink">
          <span className="select-none text-muted">$ </span>
          {command}
        </pre>
      )}
      {approval.argsRaw && (
        <details className="mt-1" open={!command}>
          <summary className="cursor-pointer select-none font-mono text-2xs tracking-normal text-muted">参数原文</summary>
          <pre className="mt-1 mb-0 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded border border-border-subtle bg-surface-sunken px-2 py-1 font-mono text-2xs leading-relaxed text-ink-secondary">
            {approval.argsRaw}
          </pre>
        </details>
      )}

      {(approval.impactPaths.length > 0 || approval.justification) && (
        <div className="mt-1.5 flex flex-col gap-1">
          {approval.impactPaths.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-mono text-2xs text-muted">影响范围</span>
              {approval.impactPaths.map((path) => (
                <span key={path} className="max-w-full truncate rounded-xs border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-ink-secondary" title={path}>
                  {path}
                </span>
              ))}
            </div>
          )}
          {approval.justification && (
            <p className="m-0 rounded border-l-2 border-warn-border bg-warn-soft/40 px-2 py-1 text-2xs text-ink-secondary">
              <span className="font-mono text-muted">justification：</span>
              {approval.justification}
            </p>
          )}
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(approval.id, 'allow_once')}
          aria-label={`允许一次 ${approval.kind}`}
          className="cursor-pointer rounded-xs border border-ok-border bg-ok-soft px-2 py-0.5 text-2xs text-ok-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          允许一次
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(approval.id, 'allow_session')}
          aria-label={`本会话允许 ${approval.kind}`}
          className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-2 py-0.5 text-2xs text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          本会话允许
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecide(approval.id, 'deny')}
          aria-label={`拒绝 ${approval.kind}`}
          className="cursor-pointer rounded-xs border border-danger-border bg-danger-soft px-2 py-0.5 text-2xs text-danger-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          拒绝
        </button>
        {busy && <span className="text-2xs text-muted">处理中…</span>}
      </div>
    </li>
  )
}

export default function ApprovalBar({ approvals, busyId, onDecide }: ApprovalBarProps) {
  if (approvals.length === 0) return null

  return (
    <section aria-label="待批准操作" className="mx-2 mt-2 rounded-md border border-warn-border bg-warn-soft/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink">
          待批准 {approvals.length}
        </span>
        <span className="text-2xs text-muted">不会自动执行，需你允许/拒绝</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {approvals.map((approval) => (
          <ApprovalCard key={approval.id} approval={approval} busy={busyId === approval.id} onDecide={onDecide} />
        ))}
      </ul>
    </section>
  )
}
