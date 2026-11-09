// features/tasks/TaskPanel.tsx —— 右栏任务面板（M10：任务选项卡 + 工作流分组 + 汇报）
//
// 数据：
//   - GET /api/tasks?sessionId= 列表；GET /api/workflows?sessionId= 工作流（含任务摘要）
//   - WS task.created/updated、workflow.created/updated/done、approval.*
// 交互：按状态分组（执行中/待开始/已完成/失败）+ 工作流分组；点击任务开详情；
//       工作流暂停/恢复/取消；聊天汇报卡片通过 task:open 事件打开详情。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HttpError, getTasks } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import type { SessionMetaEntry, TaskInfo } from '../../platform/types.ts'
import { Icon } from '../../platform/ui/icons.tsx'
import { IconButton } from '../../platform/ui/IconButton.tsx'
import ApprovalBar from './ApprovalBar.tsx'
import ArtifactPreview from './ArtifactPreview.tsx'
import PlanSummary from './PlanSummary.tsx'
import TaskDetail from './TaskDetail.tsx'
import {
  parseApprovalRequested,
  parseApprovalResolved,
  parseTaskCreated,
  parseTaskUpdated,
  parseWorkflowFrame,
} from './frames.ts'
import {
  approvalDecisionLabel,
  applyUpdated,
  currentProgressLabel,
  countRunning,
  descendantSessionIds,
  formatTime,
  groupArtifactsBySession,
  isForeignArtifact,
  normalizeApproval,
  normalizeApprovalList,
  normalizeArtifactList,
  normalizeTaskDetail,
  normalizeTaskList,
  pendingApprovals,
  progressPercent,
  tagArtifacts,
  taskStatusMeta,
  upsertCreated,
  type ApprovalDecision,
  type TaskApproval,
  type TaskArtifact,
  type TaskRecord,
} from './model.ts'
import {
  TASK_STATUS_GROUPS,
  formatDurationMs,
  groupTasksByStatus,
  groupTasksByWorkflow,
  normalizeWorkflowList,
  taskStatusGroupLabel,
  workflowActions,
  workflowCounts,
  workflowProgressPercent,
  workflowStatusLabel,
  workflowStatusTone,
  type TaskStatusGroup,
  type WorkflowRecord,
} from './workflows.ts'
import {
  cancelTask,
  fetchApprovals,
  fetchSessionArtifacts,
  fetchTaskDetail,
  fetchWorkflows,
  retryTask,
  submitApproval,
  workflowAction,
  type WorkflowAction,
} from './rest.ts'

function errorText(error: unknown, fallback: string): string {
  if (error instanceof HttpError) {
    if (error.offline) return '无法连接后端，请确认司墨服务正在运行'
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function TaskListItem({ task, pendingCount, onOpen }: { task: TaskRecord; pendingCount: number; onOpen: (task: TaskRecord) => void }) {
  const meta = taskStatusMeta(task.status)
  const percent = progressPercent(task)
  const running = task.status === 'running' || task.status === 'queued'
  const current = currentProgressLabel(task)
  const donePhases = task.phases.filter((phase) => phase.status === 'done').length

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="w-full cursor-pointer rounded-md border border-border-subtle bg-surface-solid p-2.5 text-left shadow-sm transition-colors duration-fast hover:border-accent-border"
        title="打开任务详情（阶段 / 产物 / 审批）"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 flex-1 break-words text-md leading-snug text-ink">{task.title}</span>
          <span className={`inline-flex flex-none items-center gap-1 rounded-pill border px-1.5 font-mono text-2xs tracking-normal ${meta.classes}`}>
            {running && <span className="h-1 w-1 animate-thinking-bounce rounded-xs bg-current opacity-70" aria-hidden="true" />}
            {meta.label}
          </span>
        </div>

        {(pendingCount > 0 || task.neutralized) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {pendingCount > 0 && (
              <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 text-2xs text-warn-ink">
                待批准 {pendingCount}
              </span>
            )}
            {task.neutralized && (
              <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 text-2xs text-warn-ink">已中和</span>
            )}
          </div>
        )}

        {percent !== null && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
              <span className="block h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
            </span>
            <span className="font-mono text-2xs text-muted">{percent}%</span>
          </div>
        )}

        {current && <p className="m-0 mt-1 truncate text-2xs text-ink-secondary">{current}</p>}

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-2xs text-muted">
          {task.workflowId && <span>工作流 {task.workflowTitle ?? task.workflowId.slice(0, 12)}</span>}
          {task.phases.length > 0 && <span>阶段 {donePhases}/{task.phases.length}</span>}
          {task.artifacts.length > 0 && <span>产物 {task.artifacts.length}</span>}
          {task.durationMs !== null && <span>耗时 {formatDurationMs(task.durationMs)}</span>}
          {task.reportMessageId && <span className="text-accent-hover">已汇报</span>}
          {formatTime(task.updatedAt ?? task.createdAt) && <span>{formatTime(task.updatedAt ?? task.createdAt)}</span>}
        </div>

        {(task.status === 'done' || task.status === 'failed') && task.summary && (
          <p className="m-0 mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-secondary">
            <span className="text-muted">摘要：</span>
            {task.summary}
          </p>
        )}
      </button>
    </li>
  )
}

function TaskListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-14 animate-skeleton-shimmer rounded-md bg-linear-to-r from-skeleton via-skeleton-sheen to-skeleton bg-[length:400%_100%]"
        />
      ))}
    </div>
  )
}

const WORKFLOW_TONE: Record<'accent' | 'warn' | 'ok' | 'danger' | 'muted', string> = {
  accent: 'border-accent-border bg-accent-soft text-accent-hover',
  warn: 'border-warn-border bg-warn-soft text-warn-ink',
  ok: 'border-ok-border bg-ok-soft text-ok-ink',
  danger: 'border-danger-border bg-danger-soft text-danger-ink',
  muted: 'border-border-subtle bg-surface-sunken text-muted',
}

function WorkflowGroupHeader({
  workflow,
  busy,
  onAction,
}: {
  workflow: WorkflowRecord | null
  busy: boolean
  onAction: (workflow: WorkflowRecord, action: WorkflowAction) => void
}) {
  if (!workflow) {
    return <p className="m-0 mb-1.5 font-mono text-2xs tracking-normal text-muted">未分组任务</p>
  }
  const counts = workflowCounts(workflow)
  const actions = workflowActions(workflow)
  return (
    <div className="mb-1.5 rounded-md border border-border-subtle bg-surface px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 max-w-[12rem] truncate text-sm font-medium text-ink" title={workflow.title}>
          {workflow.title}
        </span>
        <span className={`rounded-pill border px-1.5 font-mono text-2xs ${WORKFLOW_TONE[workflowStatusTone(workflow.status)]}`}>
          {workflowStatusLabel(workflow.status)}
        </span>
        <span className="font-mono text-2xs text-muted">
          {counts.done}/{workflow.tasks.length}
        </span>
        <span className="font-mono text-2xs text-muted">{workflowProgressPercent(workflow)}%</span>
        <span className="ml-auto flex items-center gap-1">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => onAction(workflow, action)}
              aria-label={`${action === 'pause' ? '暂停' : action === 'resume' ? '恢复' : '取消'}工作流 ${workflow.title}`}
              title={action === 'pause' ? '暂停：不再启动新任务，运行中任务跑完即停' : action === 'resume' ? '恢复工作流' : '取消工作流（不再启动新任务）'}
              className="cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink-secondary transition-colors duration-fast hover:border-accent-border hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action === 'pause' ? '暂停' : action === 'resume' ? '恢复' : '取消'}
            </button>
          ))}
        </span>
      </div>
      <span className="mt-1 block h-1 overflow-hidden rounded-pill bg-surface-sunken" aria-hidden="true">
        <span className="block h-full rounded-pill bg-accent" style={{ width: `${workflowProgressPercent(workflow)}%` }} />
      </span>
    </div>
  )
}

export default function TaskPanel() {
  const [sessionId, setSessionId] = useState<string | null>(() => readSessionId())
  const [sessionMeta, setSessionMeta] = useState<SessionMetaEntry[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [frameApprovals, setFrameApprovals] = useState<TaskApproval[]>([])
  const [remoteApprovals, setRemoteApprovals] = useState<TaskApproval[]>([])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TaskRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  // M10：工作流 + 任务选项卡分组
  const [workflows, setWorkflows] = useState<WorkflowRecord[]>([])
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState<string | null>(null)
  const [workflowBusyId, setWorkflowBusyId] = useState<string | null>(null)
  const [statusGroup, setStatusGroup] = useState<TaskStatusGroup>('running')
  // M6：跨会话产物（父会话/聚合视图查看子会话产物，只读、不复制）
  const [sessionArtifacts, setSessionArtifacts] = useState<TaskArtifact[]>([])
  const [artifactsLoading, setArtifactsLoading] = useState(false)
  const [artifactsAvailable, setArtifactsAvailable] = useState(true)

  const tasksRef = useRef<TaskRecord[]>([])
  tasksRef.current = tasks
  const remoteApprovalsRef = useRef<TaskApproval[]>([])
  remoteApprovalsRef.current = remoteApprovals
  const detailIdRef = useRef<string | null>(detailId)
  detailIdRef.current = detailId
  const artifactsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workflowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---- 详情 ----
  const loadDetail = useCallback(async (taskId: string, options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setDetailLoading(true)
      setDetailError(null)
    }
    try {
      const payload = await fetchTaskDetail(taskId)
      const record = normalizeTaskDetail(payload)
      if (!record) throw new Error('详情为空')
      setTasks((prev) =>
        prev.some((task) => task.id === record.id) ? prev.map((task) => (task.id === record.id ? record : task)) : [...prev, record],
      )
      if (detailIdRef.current === taskId) setDetail(record)
    } catch (error) {
      if (detailIdRef.current !== taskId || options.silent) return
      const fallback = tasksRef.current.find((task) => task.id === taskId) ?? null
      setDetail(fallback)
      setDetailError(
        error instanceof HttpError && (error.status === 404 || error.status === 405)
          ? '详情接口尚未就绪，当前显示列表已知信息'
          : `加载详情失败：${errorText(error, '未知错误')}`,
      )
    } finally {
      if (!options.silent) setDetailLoading(false)
    }
  }, [])

  const openDetail = useCallback(
    (task: TaskRecord) => {
      setDetailId(task.id)
      setDetail(task)
      setDetailError(null)
      void loadDetail(task.id)
    },
    [loadDetail],
  )

  const closeDetail = useCallback(() => {
    setDetailId(null)
    setDetail(null)
    setDetailError(null)
  }, [])

  const reloadList = useCallback(async () => {
    if (!sessionId) return
    setListLoading(true)
    setListError(null)
    try {
      const payload = await getTasks(sessionId)
      setTasks((prev) => {
        const restored = normalizeTaskList(payload)
        if (prev.length === 0) return restored
        const known = new Set(prev.map((task) => task.id))
        return [...restored.filter((task) => !known.has(task.id)), ...prev]
      })
    } catch (error) {
      if (tasksRef.current.length === 0) setListError(errorText(error, '任务加载失败'))
    } finally {
      setListLoading(false)
    }
  }, [sessionId])

  // ---- 会话切换：清空 ----
  useEffect(
    () =>
      bus.on(EVENTS.SESSION_ACTIVE, (payload) => {
        setSessionId(payload.sessionId)
        setSessionMeta(payload.sessionMeta)
        setTasks([])
        setWorkflows([])
        setStatusGroup('running')
        setFrameApprovals([])
        setSessionArtifacts([])
        setDetailId(null)
        setDetail(null)
      }),
    [],
  )

  useEffect(() => {
    void reloadList()
  }, [reloadList])

  // M10：工作流列表（GET /api/workflows?sessionId=）；失败不影响任务列表
  const reloadWorkflows = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!sessionId) return
      if (!options.silent) setWorkflowLoading(true)
      setWorkflowError(null)
      try {
        const payload = await fetchWorkflows(sessionId)
        setWorkflows(normalizeWorkflowList(payload))
      } catch (error) {
        // 后端 M10-A 尚未提供 workflows 端点时静默降级（任务列表仍可用）
        if (error instanceof HttpError && (error.status === 404 || error.status === 405)) {
          setWorkflows([])
          return
        }
        if (!options.silent) setWorkflowError(errorText(error, '工作流加载失败'))
      } finally {
        if (!options.silent) setWorkflowLoading(false)
      }
    },
    [sessionId],
  )

  useEffect(() => {
    void reloadWorkflows()
  }, [reloadWorkflows])

  // 工作流运行态 → 聊天「停」按钮
  useEffect(() => {
    const running = workflows.some((workflow) => workflow.status === 'running')
    const paused = workflows.some((workflow) => workflow.status === 'paused')
    bus.emit(EVENTS.WORKFLOWS_STATE, {
      running,
      paused,
      activeWorkflowId: workflows.find((workflow) => workflow.status === 'running')?.id ?? null,
    })
  }, [workflows])

  const scheduleWorkflowsRefresh = useCallback(() => {
    if (workflowTimerRef.current !== null) return
    workflowTimerRef.current = setTimeout(() => {
      workflowTimerRef.current = null
      void reloadWorkflows({ silent: true })
    }, 700)
  }, [reloadWorkflows])

  useEffect(
    () => () => {
      if (workflowTimerRef.current !== null) {
        clearTimeout(workflowTimerRef.current)
        workflowTimerRef.current = null
      }
    },
    [],
  )

  // M10：聊天里的汇报卡片点击 → 打开任务详情
  useEffect(
    () =>
      bus.on(EVENTS.TASK_OPEN, (payload) => {
        const existing = tasksRef.current.find((task) => task.id === payload.taskId)
        if (existing) {
          openDetail(existing)
          return
        }
        setDetailId(payload.taskId)
        setDetail(null)
        setDetailError(null)
        void loadDetail(payload.taskId)
      }),
    [loadDetail, openDetail],
  )

  // 审批列表：REST 拉取 + 轮询（后端未通过 WS 推送审批时也能看到待批准）
  const reloadApprovals = useCallback(async () => {
    try {
      const payload = await fetchApprovals()
      const next = normalizeApprovalList(payload)
      const knownPending = new Set(
        remoteApprovalsRef.current.filter((approval) => approval.status === 'pending').map((approval) => approval.id),
      )
      setRemoteApprovals(next)
      // M7：只有新出现的待审批才打扰（同一 id 由通知宿主去重）
      for (const approval of next) {
        if (approval.status === 'pending' && !knownPending.has(approval.id)) {
          bus.emit(EVENTS.NOTIFY, {
            kind: 'approval',
            title: '有操作等待你确认',
            detail: approval.title,
            id: approval.id,
          })
        }
      }
      // M9：never 策略下被拒的动作 → 明确显示「已按策略拒绝」
      const policyDenied = next.find((approval) => approval.policyDenied)
      if (policyDenied) {
        setNotice(`已按策略拒绝：${policyDenied.kind}（审批策略：never / fail-closed）`)
      }
    } catch {
      // 端点未就绪时保持现有列表
    }
  }, [])

  // M6：会话产物（含子会话，父会话聚合视图可查看子会话产物；不复制文件）
  const reloadArtifacts = useCallback(async () => {
    if (!sessionId) return
    setArtifactsLoading(true)
    const titleById = new Map(sessionMeta.map((entry) => [entry.id, entry.title]))
    titleById.set(sessionId, titleById.get(sessionId) ?? '当前会话')
    const targets = [sessionId, ...descendantSessionIds(sessionMeta, sessionId)]
    try {
      const results = await Promise.allSettled(targets.map((id) => fetchSessionArtifacts(id)))
      const primary = results[0]
      if (primary?.status === 'rejected') {
        const error = primary.reason
        if (error instanceof HttpError && (error.status === 404 || error.status === 405)) {
          setArtifactsAvailable(false)
        }
        setSessionArtifacts([])
        return
      }
      const merged: TaskArtifact[] = []
      for (const [index, result] of results.entries()) {
        if (result.status !== 'fulfilled') continue
        const targetId = targets[index]
        if (!targetId) continue
        merged.push(...tagArtifacts(normalizeArtifactList(result.value), targetId, titleById.get(targetId) ?? targetId))
      }
      setSessionArtifacts(merged)
      setArtifactsAvailable(true)
    } catch {
      // 非主端点错误：保持可用，避免 UI 抖动
    } finally {
      setArtifactsLoading(false)
    }
  }, [sessionId, sessionMeta])

  const scheduleArtifactsRefresh = useCallback(() => {
    if (artifactsTimerRef.current !== null) return
    artifactsTimerRef.current = setTimeout(() => {
      artifactsTimerRef.current = null
      void reloadArtifacts()
    }, 900)
  }, [reloadArtifacts])

  useEffect(() => {
    void reloadArtifacts()
  }, [reloadArtifacts])

  useEffect(
    () => () => {
      if (artifactsTimerRef.current !== null) {
        clearTimeout(artifactsTimerRef.current)
        artifactsTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    void reloadApprovals()
    const timer = setInterval(() => void reloadApprovals(), 8000)
    const onFocus = (): void => void reloadApprovals()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [reloadApprovals, sessionId])

  // ---- WS 增量 ----
  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }) => {
        if (frame.type === 'workflow.created' || frame.type === 'workflow.updated' || frame.type === 'workflow.done') {
          const payload = parseWorkflowFrame(frame.data)
          if (payload) scheduleWorkflowsRefresh()
          return
        }
        if (frame.type === 'task.report') {
          // 汇报消息由 chat 渲染；任务面板刷新工作流/任务状态
          scheduleWorkflowsRefresh()
          void reloadList()
          return
        }
        if (frame.type === 'task.created') {
          const payload = parseTaskCreated(frame.data)
          if (payload) setTasks((prev) => upsertCreated(prev, payload))
          return
        }
        if (frame.type === 'task.updated') {
          const payload = parseTaskUpdated(frame.data)
          if (!payload) return
          const previous = tasksRef.current.find((task) => task.id === payload.id)
          setTasks((prev) => applyUpdated(prev, payload))
          if (detailIdRef.current === payload.id) void loadDetail(payload.id, { silent: true })
          scheduleArtifactsRefresh()
          scheduleWorkflowsRefresh()
          // M7：任务完成通知（只在进入 done 时提示一次）
          if (payload.fields['status'] === 'done' && previous?.status !== 'done') {
            bus.emit(EVENTS.NOTIFY, {
              kind: 'task-done',
              title: previous?.title ?? '任务已完成',
              detail: '右栏可查看阶段、产物与摘要',
              id: payload.id,
            })
          }
          return
        }
        if (frame.type === 'approval.requested') {
          const payload = parseApprovalRequested(frame.data)
          if (!payload) return
          bus.emit(EVENTS.NOTIFY, {
            kind: 'approval',
            title: '有操作等待你确认',
            detail: payload.title,
            id: payload.id,
          })
          const approval = normalizeApproval(frame.data)
          if (!approval) return
          setFrameApprovals((prev) => (prev.some((item) => item.id === approval.id) ? prev : [...prev, approval]))
          if (detailIdRef.current && payload.taskId === detailIdRef.current) void loadDetail(payload.taskId, { silent: true })
          return
        }
        if (frame.type === 'approval.resolved') {
          const payload = parseApprovalResolved(frame.data)
          if (!payload) return
          setFrameApprovals((prev) => prev.filter((item) => item.id !== payload.id))
          if (payload.policyDenied) {
            setNotice(`已按策略拒绝：${payload.tool ?? '工具调用'}（审批策略：never / fail-closed）`)
          }
          if (detailIdRef.current) void loadDetail(detailIdRef.current, { silent: true })
        }
      }),
    [loadDetail, reloadList, scheduleArtifactsRefresh, scheduleWorkflowsRefresh],
  )

  // ---- 广播并行任务数 ----
  const running = useMemo(() => countRunning(tasks), [tasks])
  useEffect(() => {
    bus.emit(EVENTS.TASKS_STATE, { running, total: tasks.length })
  }, [running, tasks.length])

  // ---- 待批准（任务详情内 + WS 帧 + REST 列表，按 id 去重）----
  const pending = useMemo(() => {
    const map = new Map<string, TaskApproval>()
    for (const approval of pendingApprovals(tasks)) map.set(approval.id, approval)
    for (const approval of frameApprovals) {
      if (approval.status === 'pending') map.set(approval.id, approval)
    }
    for (const approval of remoteApprovals) {
      if (approval.status === 'pending') map.set(approval.id, approval)
    }
    return [...map.values()]
  }, [tasks, frameApprovals, remoteApprovals])

  const detailApprovals = useMemo(() => {
    const map = new Map<string, TaskApproval>()
    for (const approval of detail?.approvals ?? []) map.set(approval.id, approval)
    for (const approval of pending) {
      if (approval.taskId && approval.taskId === detail?.id) map.set(approval.id, approval)
    }
    return [...map.values()]
  }, [detail, pending])

  // M6：产物按来源会话分组（父会话聚合视图里子会话产物只读展示，不复制）
  const artifactGroups = useMemo(() => groupArtifactsBySession(sessionArtifacts), [sessionArtifacts])

  // ---- 操作 ----
  const handleCancel = useCallback(
    async (taskId: string) => {
      setBusyId(taskId)
      setNotice(null)
      try {
        await cancelTask(taskId)
        setTasks((prev) => applyUpdated(prev, { id: taskId, fields: { status: 'cancelled' } }))
        await loadDetail(taskId, { silent: true })
      } catch (error) {
        const message = `取消失败：${errorText(error, '未知错误')}`
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '取消任务失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [loadDetail],
  )

  const handleRetry = useCallback(
    async (taskId: string) => {
      setBusyId(taskId)
      setNotice(null)
      try {
        await retryTask(taskId)
        setTasks((prev) => applyUpdated(prev, { id: taskId, fields: { status: 'running' } }))
        await loadDetail(taskId, { silent: true })
      } catch (error) {
        const message = `重试失败：${errorText(error, '未知错误')}`
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '重试任务失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [loadDetail],
  )

  const handleDecideApproval = useCallback(
    async (approvalId: string, decision: ApprovalDecision) => {
      setBusyId(approvalId)
      setNotice(null)
      try {
        await submitApproval(approvalId, decision)
        setFrameApprovals((prev) => prev.filter((item) => item.id !== approvalId))
        setRemoteApprovals((prev) =>
          prev.map((item) =>
            item.id === approvalId ? { ...item, status: decision === 'deny' ? 'denied' : 'approved' } : item,
          ),
        )
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                approvals: prev.approvals.map((item) =>
                  item.id === approvalId ? { ...item, status: decision === 'deny' ? 'denied' : 'approved' } : item,
                ),
              }
            : prev,
        )
        if (detailIdRef.current) void loadDetail(detailIdRef.current, { silent: true })
        void reloadApprovals()
        setNotice(`已${approvalDecisionLabel(decision)}`)
      } catch (error) {
        const message = `审批失败：${errorText(error, '未知错误')}`
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '审批提交失败', detail: message })
      } finally {
        setBusyId(null)
      }
    },
    [loadDetail, reloadApprovals],
  )

  // M10：工作流控制（暂停/恢复/取消）
  const handleWorkflowAction = useCallback(
    async (workflow: WorkflowRecord, action: WorkflowAction) => {
      setWorkflowBusyId(workflow.id)
      setNotice(null)
      try {
        await workflowAction(workflow.id, action)
        const label = action === 'pause' ? '已暂停' : action === 'resume' ? '已恢复' : '已取消'
        setNotice(`${label}工作流：${workflow.title}`)
        await reloadWorkflows({ silent: true })
        await reloadList()
      } catch (error) {
        const message = `工作流操作失败：${errorText(error, '未知错误')}`
        setNotice(message)
        bus.emit(EVENTS.NOTIFY, { kind: 'error', title: '工作流操作失败', detail: message })
      } finally {
        setWorkflowBusyId(null)
      }
    },
    [reloadList, reloadWorkflows],
  )

  const statusGroups = useMemo(() => groupTasksByStatus(tasks), [tasks])
  const selectedTasks = statusGroups[statusGroup]
  const workflowGroups = useMemo(
    () => groupTasksByWorkflow(selectedTasks, workflows),
    [selectedTasks, workflows],
  )
  const currentArtifactGroups = useMemo(
    () => (sessionId ? artifactGroups.filter((group) => !group.sessionId || group.sessionId === sessionId) : artifactGroups),
    [artifactGroups, sessionId],
  )
  const activeDetail = detailId ? detail ?? tasks.find((task) => task.id === detailId) ?? null : null
  const activeDetailWorkflow = activeDetail?.workflowId
    ? workflows.find((workflow) => workflow.id === activeDetail.workflowId) ?? null
    : null

  return (
    <aside className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border-subtle bg-surface backdrop-blur-glass">
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-border-subtle px-3.5 pt-2.5 pb-2">
        <h2 className="m-0 min-w-0 truncate text-md font-semibold">任务</h2>
        <div className="flex flex-none items-center gap-2">
          <span className="font-mono text-2xs tracking-normal text-muted">
            {workflows.length > 0 ? `${tasks.length} 个 · ${workflows.length} 工作流` : `${tasks.length} 个`}
          </span>
          <IconButton
            icon="refresh"
            label="刷新任务与工作流"
            size="sm"
            tone="ghost"
            disabled={listLoading || workflowLoading}
            onClick={() => {
              void reloadList()
              void reloadWorkflows({ silent: true })
            }}
          />
        </div>
      </div>

      {notice && (
        <div role="status" className="mx-2 mt-2 rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-2xs text-ink-secondary">
          {notice}
        </div>
      )}

      <ApprovalBar approvals={pending} busyId={busyId} onDecide={(id, decision) => void handleDecideApproval(id, decision)} />

      <div
        role="tablist"
        aria-label="任务状态"
        className="flex min-w-0 flex-none gap-1 overflow-x-auto border-b border-border-subtle px-2 pt-2 pb-1.5"
      >
        {TASK_STATUS_GROUPS.map((group) => {
          const active = statusGroup === group
          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatusGroup(group)}
              className={`flex-none cursor-pointer whitespace-nowrap rounded-xs px-1.5 py-0.5 font-mono text-2xs tracking-normal transition-colors duration-fast ${
                active ? 'bg-accent-soft text-accent-hover' : 'text-muted hover:text-ink-secondary'
              }`}
            >
              {taskStatusGroupLabel(group)} {statusGroups[group].length}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pt-2 pb-3.5">
        <PlanSummary sessionId={sessionId} tasks={tasks as unknown as TaskInfo[]} />
        {listLoading && tasks.length === 0 && <TaskListSkeleton />}

        {!listLoading && listError && tasks.length === 0 && (
          <div role="alert" className="mx-1 mt-4 rounded-md border border-danger-border bg-danger-soft p-2.5 text-sm text-danger-ink">
            <p className="m-0 mb-2">{listError}</p>
            <button
              type="button"
              onClick={() => void reloadList()}
              className="cursor-pointer text-sm text-accent-hover underline underline-offset-2"
            >
              重试
            </button>
          </div>
        )}

        {workflowError && (
          <p role="status" className="mx-1 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
            工作流加载失败：{workflowError}
          </p>
        )}

        {!listLoading && listError && tasks.length > 0 && (
          <p role="status" className="mx-1 mb-2 rounded-md border border-warn-border bg-warn-soft px-2 py-1 text-2xs text-warn-ink">
            刷新失败：{listError}
          </p>
        )}

        {!listLoading && tasks.length === 0 && (
          <div className="mx-1 mt-6 rounded-lg border border-dashed border-border bg-scrim p-4 text-center">
            <div className="text-xl text-accent" aria-hidden="true">
              <Icon name="task" size={20} className="mx-auto text-muted" />
            </div>
            <p className="m-0 mt-2 mb-0.5 text-md font-medium text-ink">暂无任务</p>
            <p className="m-0 text-sm leading-relaxed text-ink-secondary">
              司墨拆解需求后会在这里按工作流与状态展示；每个任务完成都会在会话里发一条汇报。
            </p>
            <div className="mt-3.5 flex items-center justify-center gap-2 text-2xs text-muted">
              <span className="rounded-xs border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink">M10</span>
              <span>工作流 · 状态分组 · 逐任务汇报</span>
            </div>
          </div>
        )}

        {!listLoading && tasks.length > 0 && selectedTasks.length === 0 && (
          <div className="mx-1 mt-4 rounded-lg border border-dashed border-border bg-scrim p-3 text-center">
            <p className="m-0 text-sm text-ink-secondary">
              {taskStatusGroupLabel(statusGroup)}分组暂无任务
            </p>
          </div>
        )}

        {workflowGroups.map((group) => (
          <section
            key={group.workflow?.id ?? 'ungrouped'}
            aria-label={group.workflow?.title ?? '未分组任务'}
            className="mb-3"
          >
            <WorkflowGroupHeader
              workflow={group.workflow}
              busy={workflowBusyId === group.workflow?.id}
              onAction={(workflow, action) => void handleWorkflowAction(workflow, action)}
            />
            <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="任务列表">
              {group.tasks.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  pendingCount={pending.filter((approval) => approval.taskId === task.id).length}
                  onOpen={openDetail}
                />
              ))}
            </ul>
          </section>
        ))}

        {artifactsAvailable && (
          <section aria-label="当前会话交付物" className="mt-3 min-w-0 rounded-md border border-border-subtle bg-surface-solid p-2">
            <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
              <h3 className="m-0 min-w-0 truncate text-2xs font-medium tracking-normal text-muted">交付物（当前会话）</h3>
              <div className="flex flex-none items-center gap-1.5">
                <span className="font-mono text-2xs text-muted">{sessionArtifacts.length}</span>
                <IconButton icon="refresh" label="刷新交付物列表" size="sm" tone="ghost" disabled={artifactsLoading} onClick={() => void reloadArtifacts()} />
              </div>
            </div>
            {artifactsLoading && sessionArtifacts.length === 0 ? (
              <p className="m-0 text-sm text-muted">加载产物…</p>
            ) : currentArtifactGroups.length === 0 ? (
              <p className="m-0 break-words text-2xs text-muted">暂无交付物；任务完成后产物会出现在这里（只读，不复制文件）。</p>
            ) : (
              currentArtifactGroups.map((group) => {
                const foreign = group.artifacts.some((artifact) => isForeignArtifact(artifact, sessionId))
                return (
                  <div key={group.sessionId ?? 'current'} className="mt-1.5 min-w-0 first:mt-1">
                    <p className="m-0 mb-1 flex min-w-0 items-center gap-1.5 font-mono text-2xs text-muted">
                      <span className="min-w-0 truncate">{group.sessionTitle}</span>
                      {foreign && (
                        <span className="flex-none rounded-pill border border-warn-border bg-warn-soft px-1 text-warn-ink">子会话</span>
                      )}
                    </p>
                    <ul className="m-0 flex min-w-0 list-none flex-col gap-1.5 p-0">
                      {group.artifacts.map((artifact) => (
                        <ArtifactPreview key={artifact.id} artifact={artifact} />
                      ))}
                    </ul>
                  </div>
                )
              })
            )}
          </section>
        )}
      </div>

      <div className="min-w-0 border-t border-border-subtle px-3.5 py-2 text-2xs text-muted">
        任务按状态/工作流分组 · 汇报卡片可点开
      </div>

      {detailId && (
        <TaskDetail
          task={activeDetail}
          approvals={detailApprovals}
          workflow={activeDetailWorkflow}
          allTasks={tasks}
          loading={detailLoading}
          error={detailError}
          busyId={busyId}
          onClose={closeDetail}
          onRefresh={() => void loadDetail(detailId)}
          onCancel={(taskId) => void handleCancel(taskId)}
          onRetry={(taskId) => void handleRetry(taskId)}
          onWorkflowAction={(workflow, action) => void handleWorkflowAction(workflow, action)}
          onDecideApproval={(id, decision) => void handleDecideApproval(id, decision)}
        />
      )}
    </aside>
  )
}
