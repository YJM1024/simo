// features/tasks/TaskDetail.tsx —— 任务详情（独立 modal：阶段/步骤、产物、审批、取消/重试）
//
// 设计依据 design/14 §5.2：选中看详情（阶段/步骤/已完成/进行中/待办、产物入口），
// 细看单独开窗；验收走对话，不引入验收状态机（页脚说明）。

import { useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import ApprovalBar from './ApprovalBar.tsx'
import ArtifactPreview from './ArtifactPreview.tsx'
import {
  canCancel,
  canRetry,
  currentProgressLabel,
  formatTime,
  phaseLabel,
  progressPercent,
  stepIcon,
  stepTone,
  taskStatusMeta,
  type ApprovalDecision,
  type TaskApproval,
  type TaskPhase,
  type TaskRecord,
} from './model.ts'
import {
  dependencyLabels,
  formatDurationMs,
  workflowActions,
  workflowProgressPercent,
  workflowStatusLabel,
  workflowStatusTone,
  type WorkflowRecord,
} from './workflows.ts'
import type { WorkflowAction } from './rest.ts'

const WORKFLOW_TONE: Record<'accent' | 'warn' | 'ok' | 'danger' | 'muted', string> = {
  accent: 'border-accent-border bg-accent-soft text-accent-hover',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

interface TaskDetailProps {
  task: TaskRecord | null
  approvals: TaskApproval[]
  /** M10：所属工作流（可空） */
  workflow: WorkflowRecord | null
  /** M10：用于解析依赖标题 */
  allTasks: TaskRecord[]
  loading: boolean
  error: string | null
  busyId: string | null
  onClose: () => void
  onRefresh: () => void
  onCancel: (taskId: string) => void
  onRetry: (taskId: string) => void
  onWorkflowAction: (workflow: WorkflowRecord, action: WorkflowAction) => void
  onDecideApproval: (approvalId: string, decision: ApprovalDecision) => void
}

function PhaseBlock({ phase }: { phase: TaskPhase }) {
  const running = phase.status === 'running'
  const phaseProgress = phase.progress === null ? null : Math.round(phase.progress * 100)

  return (
    <section className={`rounded-md border p-2.5 ${running ? 'border-accent-border bg-accent-soft/40' : 'border-border-subtle bg-surface-solid'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-md font-medium text-ink">{phase.title}</span>
        <span
          className={`rounded-pill border px-1.5 font-mono text-2xs ${
            phase.status === 'done'
              ? 'border-ok-border bg-ok-soft text-ok-ink'
              : phase.status === 'running'
                ? 'border-accent-border bg-accent-soft text-accent-hover'
                : phase.status === 'failed'
                  ? 'border-danger-border bg-danger-soft text-danger-ink'
                  : 'border-border-subtle bg-surface-sunken text-muted'
          }`}
        >
          {phaseLabel(phase.status)}
        </span>
        {phaseProgress !== null && (
          <span className="font-mono text-2xs text-muted">
            {phaseProgress}%
            <span className="ml-1 inline-block h-1 w-12 overflow-hidden rounded-pill bg-surface-sunken align-middle">
              <span className="block h-full rounded-pill bg-accent" style={{ width: `${phaseProgress}%` }} />
            </span>
          </span>
        )}
      </div>
      {phase.summary && <p className="m-0 mt-1 text-sm text-ink-secondary">{phase.summary}</p>}
      {phase.steps.length > 0 && (
        <ul className="m-0 mt-1.5 flex list-none flex-col gap-0.5 p-0">
          {phase.steps.map((step) => (
            <li key={step.id} className="flex items-start gap-1.5 text-sm">
              <span className={`w-4 flex-none text-center font-mono text-xs ${stepTone(step.status)}`} aria-hidden="true">
                {stepIcon(step.status)}
              </span>
              <span className={step.status === 'running' ? 'text-ink' : step.status === 'done' ? 'text-muted line-through' : 'text-ink-secondary'}>
                {step.title}
              </span>
              {step.status === 'running' && <span className="text-2xs text-accent">进行中</span>}
              {step.status === 'failed' && <span className="text-2xs text-danger-ink">失败</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function TaskDetail({
  task,
  approvals,
  workflow,
  allTasks,
  loading,
  error,
  busyId,
  onClose,
  onRefresh,
  onCancel,
  onRetry,
  onWorkflowAction,
  onDecideApproval,
}: TaskDetailProps) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  // M7：焦点进入 modal、Tab 循环、Esc 关闭、关闭后焦点归还
  useFocusTrap(panelRef, true, onClose)

  const handleBackdrop = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose()
    },
    [onClose],
  )

  if (!task) {
    return createPortal(
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-4 backdrop-blur-sm" onMouseDown={handleBackdrop} role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
          <p className="m-0 text-md text-ink">{loading ? '加载任务详情…' : error ?? '任务不存在'}</p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onRefresh} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-3 py-1.5 text-sm">
              重试
            </button>
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-3 py-1.5 text-sm">
              关闭
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const status = taskStatusMeta(task.status)
  const percent = progressPercent(task)
  const running = task.status === 'running' || task.status === 'queued'
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending')

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-scrim-strong p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`任务详情：${task.title}`}
      onMouseDown={handleBackdrop}
    >
      <div
        ref={panelRef}
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg backdrop-blur-glass"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex flex-none items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-lg font-semibold tracking-tight text-ink">{task.title}</h2>
              <span className={`rounded-pill border px-1.5 font-mono text-2xs ${status.classes}`}>{status.label}</span>
              {task.neutralized && (
                <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 text-2xs text-warn-ink">已中和</span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-muted">
              <span>更新 {formatTime(task.updatedAt ?? task.createdAt) || '—'}</span>
              {task.sessionId && <span className="truncate" title={task.sessionId}>会话 {task.sessionId}</span>}
              {task.kind && <span>{task.kind}</span>}
              {task.durationMs !== null && <span>耗时 {formatDurationMs(task.durationMs)}</span>}
              {task.reportMessageId && <span className="text-accent-hover">已汇报</span>}
              {currentProgressLabel(task) && <span className="truncate">当前：{currentProgressLabel(task)}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-none cursor-pointer rounded-sm border border-border-subtle bg-surface-solid px-2 py-1 text-xs text-muted transition-colors duration-fast hover:border-border hover:text-ink"
          >
            关闭 ×
          </button>
        </header>

        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2.5">
          {percent !== null && (
            <div className="flex min-w-[10rem] flex-1 items-center gap-2">
              <span className="h-1.5 w-full max-w-48 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
                <span className="block h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
              </span>
              <span className="font-mono text-2xs text-muted">{percent}%</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2.5 py-1.5 text-sm text-ink-secondary disabled:opacity-50"
            >
              {loading ? '刷新中…' : '刷新'}
            </button>
            {canCancel(task) && (
              <button
                type="button"
                onClick={() => onCancel(task.id)}
                disabled={busyId === task.id}
                className="cursor-pointer rounded-md border border-danger-border bg-danger-soft px-2.5 py-1.5 text-sm text-danger-ink disabled:cursor-not-allowed disabled:opacity-50"
                title="取消该任务（保留中断点，不是撤回）"
              >
                取消任务
              </button>
            )}
            {canRetry(task) && (
              <button
                type="button"
                onClick={() => onRetry(task.id)}
                disabled={busyId === task.id}
                className="cursor-pointer rounded-md border border-accent-border bg-accent-soft px-2.5 py-1.5 text-sm text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                title="重新执行该任务"
              >
                重试
              </button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <div role="alert" className="mb-3 rounded-md border border-danger-border bg-danger-soft p-2.5 text-sm text-danger-ink">
              {error}
            </div>
          )}
          {loading && !task && <p className="m-0 text-sm text-muted">加载中…</p>}

          {pendingApprovals.length > 0 && (
            <div className="mb-3 rounded-md border border-warn-border bg-warn-soft/40 p-2.5">
              <p className="m-0 mb-1.5 text-sm text-warn-ink">该任务有待批准操作（不会自动执行）</p>
              <ApprovalBar approvals={pendingApprovals} busyId={busyId} onDecide={onDecideApproval} />
            </div>
          )}

          {workflow && (
            <section className="mb-3 rounded-md border border-border-subtle bg-surface-solid p-2.5" aria-label="所属工作流">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="m-0 text-sm font-medium text-ink-secondary">工作流</h3>
                <span className={`rounded-pill border px-1.5 font-mono text-2xs ${WORKFLOW_TONE[workflowStatusTone(workflow.status)]}`}>
                  {workflowStatusLabel(workflow.status)}
                </span>
                <span className="min-w-0 truncate text-sm text-ink" title={workflow.title}>{workflow.title}</span>
                <span className="font-mono text-2xs text-muted">{workflowProgressPercent(workflow)}%</span>
                <span className="ml-auto flex items-center gap-1">
                  {workflowActions(workflow).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => onWorkflowAction(workflow, action)}
                      disabled={busyId === workflow.id}
                      aria-label={`${action === 'pause' ? '暂停' : action === 'resume' ? '恢复' : '取消'}工作流 ${workflow.title}`}
                      className="cursor-pointer rounded-xs border border-border-subtle bg-surface px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {action === 'pause' ? '暂停' : action === 'resume' ? '恢复' : '取消'}
                    </button>
                  ))}
                </span>
              </div>
            </section>
          )}

          {task.dependsOn.length > 0 && (
            <section className="mb-3" aria-label="任务依赖">
              <h3 className="m-0 mb-1 text-sm font-medium text-ink-secondary">依赖</h3>
              <div className="flex flex-wrap gap-1">
                {dependencyLabels(task, allTasks).map((label, index) => (
                  <span key={index} className="rounded-xs border border-border-subtle bg-surface-sunken px-1.5 py-0.5 font-mono text-2xs text-ink-secondary">
                    {label}
                  </span>
                ))}
              </div>
            </section>
          )}

          {task.summary && (
            <section className="mb-3">
              <h3 className="m-0 mb-1 text-sm font-medium text-ink-secondary">执行摘要</h3>
              <p className="m-0 whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-surface-solid p-2.5 text-md leading-relaxed text-ink">
                {task.summary}
              </p>
            </section>
          )}

          <section className="mb-3">
            <h3 className="m-0 mb-1 text-sm font-medium text-ink-secondary">阶段 / 步骤</h3>
            {task.phases.length === 0 ? (
              <p className="m-0 rounded-md border border-dashed border-border bg-scrim p-2.5 text-sm text-muted">
                {running ? '任务执行中，阶段信息稍后出现。' : '该任务没有阶段信息。'}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {task.phases.map((phase) => (
                  <PhaseBlock key={phase.id} phase={phase} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="m-0 mb-1 text-sm font-medium text-ink-secondary">产物</h3>
            {task.artifacts.length === 0 ? (
              <p className="m-0 rounded-md border border-dashed border-border bg-scrim p-2.5 text-sm text-muted">暂无产物。</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {task.artifacts.map((artifact) => (
                  <ArtifactPreview key={artifact.id} artifact={artifact} />
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-4 py-2.5 text-2xs text-muted">
          <span>验收走对话：接受 / 不接受 / 改需求都用对话表达。</span>
          <span>取消与重试只影响该任务，保留中断点。</span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
