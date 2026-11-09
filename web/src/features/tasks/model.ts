// features/tasks/model.ts —— 任务（阶段/步骤/产物/审批）纯函数模型（可单测，无 React 依赖）
//
// M5 设计依据：design/14 §5.2/§5.3（右栏列表项=任务名/状态/阶段进度/更新时间；详情=阶段/步骤/
// 产物入口）、design/13 §11.4（长任务阶段化）、design/13 §11（产物预览/下载）。
// 后端字段以 tasks 列表/详情 payload 为准，这里做容错归一化（支持阶段/步骤/产物/审批出现在
// 顶层字段或 payload JSON 字符串中）。

import type { TaskInfo } from '../../platform/types.ts'
import { hasNeutralized, isRecord, readNumber, readString } from '../../platform/types.ts'
import type { TaskCreatedPayload, TaskPatch } from './frames.ts'

export interface TaskStep {
  id: string
  title: string
  status: string
  /** 后端 flat steps 用 phaseId 关联阶段（M5 契约） */
  phaseId?: string
  detail?: string
}

export interface TaskPhase {
  id: string
  title: string
  status: string
  progress: number | null
  summary?: string
  steps: TaskStep[]
}

export type ArtifactKind = 'markdown' | 'image' | 'text' | 'other'

export interface TaskArtifact {
  id: string
  name: string
  mime: string
  kind: ArtifactKind
  size: number | null
  /** M6：跨会话产物列表带来源会话（不复制文件，只按 id 预览/下载） */
  sessionId?: string
  sessionTitle?: string
}

export interface TaskApproval {
  id: string
  taskId: string | null
  /** 展示标题（优先工具名） */
  title: string
  summary?: string
  /** 工具名（M9：read/write/pwsh…） */
  kind: string
  status: string
  createdAt: number | null
  /** M9：风险等级 read/write/execute/network */
  risk: string
  /** M9：命令/参数原文（JSON 字符串或纯文本） */
  argsRaw: string
  /** M9：当前/请求的沙盒模式（如 workspace-write / danger-full-access） */
  sandbox: string | null
  /** M9：单次提权申请的目标模式 */
  requestedSandbox: string | null
  /** M9：提权理由（单次提权必填） */
  justification: string | null
  /** M9：影响范围（路径等） */
  impactPaths: string[]
  /** M9：是否申请单次提权 */
  requiresElevation: boolean
  /** M9：后端决策（allow/deny/policy…） */
  decision: string | null
  /** M9：被审批策略直接拒绝（never / fail-closed） */
  policyDenied: boolean
}

export interface TaskRecord extends TaskInfo {
  progress: number | null
  phases: TaskPhase[]
  artifacts: TaskArtifact[]
  approvals: TaskApproval[]
  neutralized: boolean
  /** M10：所属工作流（可空） */
  workflowId: string | null
  workflowTitle: string | null
  /** M10：Plan 里的任务 key（依赖引用用） */
  key: string | null
  /** M10：依赖的任务 key/id */
  dependsOn: string[]
  orderIndex: number | null
  /** M10：任务完成汇报消息 id */
  reportMessageId: string | null
  /** M10：执行耗时（毫秒） */
  durationMs: number | null
}

// ---------------------------------------------------------------------------
// 状态归一化
// ---------------------------------------------------------------------------

const STATUS_SYNONYMS: Record<string, string> = {
  active: 'running',
  in_progress: 'running',
  inprogress: 'running',
  executing: 'running',
  started: 'running',
  completed: 'done',
  complete: 'done',
  success: 'done',
  succeeded: 'done',
  finished: 'done',
  error: 'failed',
  failure: 'failed',
  canceled: 'cancelled',
  canceled_by_user: 'cancelled',
  aborted: 'cancelled',
  waiting: 'blocked',
  pending_approval: 'blocked',
  todo: 'pending',
  idle: 'pending',
}

export function normalizeStatus(raw: string | undefined | null, fallback: string): string {
  const value = (raw ?? '').trim().toLowerCase()
  if (!value) return fallback
  return STATUS_SYNONYMS[value] ?? value
}

export function normalizeProgress(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return null
  const normalized = numeric > 1 ? numeric / 100 : numeric
  return Math.min(1, Math.max(0, normalized))
}

// ---------------------------------------------------------------------------
// 归一化
// ---------------------------------------------------------------------------

function parseJsonish(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed: unknown = JSON.parse(value)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

function normalizeSteps(raw: unknown): TaskStep[] {
  if (!Array.isArray(raw)) return []
  const steps: TaskStep[] = []
  for (const [index, entry] of raw.entries()) {
    if (typeof entry === 'string') {
      steps.push({ id: `step-${index + 1}`, title: entry, status: 'pending' })
      continue
    }
    if (!isRecord(entry)) continue
    const title = readString(entry, 'title') ?? readString(entry, 'name') ?? readString(entry, 'text')
    if (!title) continue
    const detail = readString(entry, 'detail') ?? readString(entry, 'description')
    const phaseId = readString(entry, 'phaseId') ?? readString(entry, 'phase_id')
    steps.push({
      id: readString(entry, 'id') ?? `step-${index + 1}`,
      title,
      status: normalizeStatus(readString(entry, 'status'), 'pending'),
      ...(phaseId === undefined ? {} : { phaseId }),
      ...(detail === undefined ? {} : { detail }),
    })
  }
  return steps
}

function normalizePhase(entry: unknown, index: number): TaskPhase | null {
  if (typeof entry === 'string') {
    return { id: `phase-${index + 1}`, title: entry, status: 'pending', progress: null, steps: [] }
  }
  if (!isRecord(entry)) return null
  const title = readString(entry, 'title') ?? readString(entry, 'name') ?? readString(entry, 'text')
  if (!title) return null
  const summary = readString(entry, 'summary')
  return {
    id: readString(entry, 'id') ?? `phase-${index + 1}`,
    title,
    status: normalizeStatus(readString(entry, 'status'), 'pending'),
    progress: normalizeProgress(entry['progress']),
    ...(summary === undefined ? {} : { summary }),
    steps: normalizeSteps(entry['steps'] ?? entry['tasks']),
  }
}

export function normalizePhases(raw: unknown): TaskPhase[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry, index) => normalizePhase(entry, index))
    .filter((phase): phase is TaskPhase => phase !== null)
}

const MARKDOWN_EXT = new Set(['md', 'markdown', 'mdown'])
const TEXT_EXT = new Set([
  'txt', 'text', 'log', 'json', 'jsonl', 'yaml', 'yml', 'csv', 'tsv', 'xml', 'html', 'css',
  'js', 'mjs', 'ts', 'tsx', 'jsx', 'go', 'py', 'java', 'rs', 'sh', 'ps1', 'sql', 'toml', 'ini',
])

function extensionOf(name: string): string {
  const clean = name.split('#')[0]?.split('?')[0] ?? name
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export function classifyArtifact(name: string, mime: string | undefined): ArtifactKind {
  const lowerMime = (mime ?? '').toLowerCase()
  if (lowerMime.startsWith('image/')) return 'image'
  if (lowerMime.includes('markdown')) return 'markdown'
  if (lowerMime.startsWith('text/')) return 'text'
  const ext = extensionOf(name)
  if (MARKDOWN_EXT.has(ext)) return 'markdown'
  if (TEXT_EXT.has(ext)) return 'text'
  return 'other'
}

function normalizeArtifacts(raw: unknown): TaskArtifact[] {
  if (!Array.isArray(raw)) return []
  const artifacts: TaskArtifact[] = []
  for (const [index, entry] of raw.entries()) {
    if (typeof entry === 'string') {
      artifacts.push({
        id: entry,
        name: entry.split('/').pop() ?? entry,
        mime: '',
        kind: classifyArtifact(entry, ''),
        size: null,
      })
      continue
    }
    if (!isRecord(entry)) continue
    const name =
      readString(entry, 'name') ??
      readString(entry, 'title') ??
      readString(entry, 'filename') ??
      readString(entry, 'path') ??
      `产物 ${index + 1}`
    // 产物预览/下载都依赖 id；没有 id 的条目丢弃（避免点开报错）
    const id = readString(entry, 'id')
    if (!id) continue
    const mime = readString(entry, 'mime') ?? readString(entry, 'contentType') ?? readString(entry, 'content_type') ?? ''
    const sessionId = readString(entry, 'sessionId') ?? readString(entry, 'session_id')
    const sessionTitle = readString(entry, 'sessionTitle') ?? readString(entry, 'session_title')
    artifacts.push({
      id,
      name: name.split('/').pop() ?? name,
      mime,
      kind: classifyArtifact(name, mime),
      size: readNumber(entry, 'size') ?? null,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(sessionTitle === undefined ? {} : { sessionTitle }),
    })
  }
  return artifacts
}

/** M6：会话产物列表（GET /api/artifacts?sessionId=&includeChildren=）归一化。 */
export function normalizeArtifactList(payload: unknown): TaskArtifact[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload['artifacts'])
    ? payload['artifacts']
    : Array.isArray(payload['items'])
      ? payload['items']
      : Array.isArray(payload['data'])
        ? payload['data']
        : []
  return normalizeArtifacts(raw)
}

export interface ArtifactGroup {
  sessionId: string | null
  sessionTitle: string
  artifacts: TaskArtifact[]
}

/** M6：按来源会话分组展示（不复制文件；顺序保持后端返回顺序）。 */
export function groupArtifactsBySession(artifacts: readonly TaskArtifact[]): ArtifactGroup[] {
  const groups: ArtifactGroup[] = []
  const index = new Map<string, ArtifactGroup>()
  for (const artifact of artifacts) {
    const key = artifact.sessionId ?? ''
    let group = index.get(key)
    if (!group) {
      group = {
        sessionId: artifact.sessionId ?? null,
        sessionTitle: artifact.sessionTitle ?? artifact.sessionId ?? '当前会话',
        artifacts: [],
      }
      index.set(key, group)
      groups.push(group)
    }
    group.artifacts.push(artifact)
  }
  return groups
}

/** 产物是否来自其它会话（用于标注「子会话产物」而不是复制）。 */
export function isForeignArtifact(artifact: TaskArtifact, currentSessionId: string | null): boolean {
  if (!artifact.sessionId || !currentSessionId) return false
  return artifact.sessionId !== currentSessionId
}

/** M6：会话 meta（来自 session:active）里的子树 id 列表（不含根）。 */
export function descendantSessionIds(
  meta: readonly { id: string; parentId?: string }[],
  rootId: string,
): string[] {
  const childrenOf = new Map<string, string[]>()
  for (const entry of meta) {
    if (!entry.parentId) continue
    const siblings = childrenOf.get(entry.parentId)
    if (siblings) siblings.push(entry.id)
    else childrenOf.set(entry.parentId, [entry.id])
  }
  const out: string[] = []
  const queue = [...(childrenOf.get(rootId) ?? [])]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || seen.has(id) || id === rootId) continue
    seen.add(id)
    out.push(id)
    queue.push(...(childrenOf.get(id) ?? []))
  }
  return out
}

/** M6：把接口返回的产物打上来源会话（后端 artifact 本身不带 sessionId）。 */
export function tagArtifacts(
  artifacts: readonly TaskArtifact[],
  sessionId: string,
  sessionTitle: string,
): TaskArtifact[] {
  return artifacts.map((artifact) =>
    artifact.sessionId === undefined && artifact.sessionTitle === undefined
      ? { ...artifact, sessionId, sessionTitle }
      : artifact,
  )
}

const RISK_BY_TOOL: Record<string, string> = {
  read: 'read',
  read_file: 'read',
  glob: 'read',
  list_dir: 'read',
  grep: 'read',
  search_text: 'read',
  write: 'write',
  write_file: 'write',
  edit: 'write',
  pwsh: 'execute',
  shell: 'execute',
  network: 'network',
  web: 'network',
}

function toolRisk(tool: string, explicit: string | undefined): string {
  if (explicit) return explicit.trim().toLowerCase()
  return RISK_BY_TOOL[tool] ?? 'write'
}

function collectImpactPaths(args: Record<string, unknown> | null, entry: Record<string, unknown>): string[] {
  const paths = new Set<string>()
  const push = (value: unknown): void => {
    if (typeof value === 'string' && value.trim()) paths.add(value.trim())
  }
  if (args) {
    push(args['file_path'])
    push(args['path'])
    push(args['cwd'])
    push(args['destination'])
    push(args['target'])
    if (Array.isArray(args['paths'])) for (const item of args['paths']) push(item)
  }
  const declared = entry['impactPaths'] ?? entry['impact_paths'] ?? entry['paths']
  if (Array.isArray(declared)) for (const item of declared) push(item)
  return [...paths]
}

function toBoolFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function buildApproval(entry: Record<string, unknown>, fallbackTaskId: string | null, fallbackId: string): TaskApproval {
  const tool = readString(entry, 'tool') ?? readString(entry, 'kind') ?? readString(entry, 'name') ?? 'tool'
  const rawArgs = entry['args']
  const argsObject = parseJsonish(rawArgs)
  const argsRaw =
    typeof rawArgs === 'string'
      ? rawArgs
      : rawArgs === undefined || rawArgs === null
        ? ''
        : JSON.stringify(rawArgs, null, 2)

  const requestedSandbox =
    readString(entry, 'sandbox_permissions') ??
    readString(entry, 'sandboxPermissions') ??
    (argsObject ? readString(argsObject, 'sandbox_permissions') ?? readString(argsObject, 'sandboxPermissions') : undefined) ??
    null
  const justification =
    readString(entry, 'justification') ??
    (argsObject ? readString(argsObject, 'justification') : undefined) ??
    (argsObject ? readString(argsObject, 'reason') : undefined) ??
    null
  const sandbox =
    readString(entry, 'sandbox') ??
    readString(entry, 'sandboxMode') ??
    readString(entry, 'sandbox_mode') ??
    readString(entry, 'currentSandbox') ??
    null
  const decision = readString(entry, 'decision') ?? null
  const status = normalizeStatus(readString(entry, 'status'), 'pending')
  const reason = `${readString(entry, 'reason') ?? ''} ${readString(entry, 'error') ?? ''}`.toLowerCase()
  const policyDenied =
    toBoolFlag(entry['policyDenied']) ||
    toBoolFlag(entry['deniedByPolicy']) ||
    (status === 'denied' &&
      (decision === 'policy' ||
        decision === 'never' ||
        decision === 'fail_closed' ||
        decision === 'fail-closed' ||
        reason.includes('policy') ||
        reason.includes('never') ||
        reason.includes('fail-closed') ||
        reason.includes('fail_closed')))

  const summary =
    readString(entry, 'summary') ??
    readString(entry, 'reason') ??
    readString(entry, 'detail') ??
    (typeof rawArgs === 'string' && rawArgs.trim() ? rawArgs.trim() : undefined)
  return {
    id: readString(entry, 'id') ?? readString(entry, 'approvalId') ?? fallbackId,
    taskId: readString(entry, 'taskId') ?? readString(entry, 'task_id') ?? readString(entry, 'sessionId') ?? fallbackTaskId,
    title: tool,
    ...(summary === undefined ? {} : { summary }),
    kind: tool,
    status,
    createdAt: readNumber(entry, 'createdAt') ?? readNumber(entry, 'created_at') ?? null,
    risk: toolRisk(tool, readString(entry, 'risk')),
    argsRaw,
    sandbox,
    requestedSandbox,
    justification,
    impactPaths: collectImpactPaths(argsObject, entry),
    requiresElevation: Boolean(requestedSandbox) || toBoolFlag(entry['requiresElevation']) || toBoolFlag(entry['escalated']),
    decision,
    policyDenied,
  }
}

function normalizeApprovals(raw: unknown, taskId: string | null): TaskApproval[] {
  if (!Array.isArray(raw)) return []
  const approvals: TaskApproval[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) continue
    approvals.push(buildApproval(entry, taskId, `approval-${index + 1}`))
  }
  return approvals
}

/** 单任务归一化：顶层字段优先，payload（字符串/对象）兜底。 */
export function normalizeTask(raw: unknown): TaskRecord | null {
  if (!isRecord(raw)) return null
  const id = readString(raw, 'id') ?? readString(raw, 'taskId')
  if (!id) return null
  const payload = parseJsonish(raw['payload'])
  const source: Record<string, unknown> = payload ? { ...payload, ...raw } : raw

  const title = readString(source, 'title') ?? '未命名任务'
  const status = normalizeStatus(readString(source, 'status'), 'queued')
  const summary = readString(source, 'summary') ?? readString(source, 'result')
  const phases = normalizePhases(source['phases'] ?? source['stages'])
  const flatSteps = normalizeSteps(source['steps'])
  if (phases.length > 0) {
    // 后端 flat steps 用 phaseId 关联阶段；没有 phaseId 的步骤归入「步骤」阶段。
    const phaseById = new Map(phases.map((phase) => [phase.id, phase]))
    const loose: TaskStep[] = []
    for (const step of flatSteps) {
      const phase = step.phaseId ? phaseById.get(step.phaseId) : undefined
      if (phase) {
        if (!phase.steps.some((existing) => existing.id === step.id)) phase.steps.push(step)
      } else {
        loose.push(step)
      }
    }
    if (loose.length > 0) {
      phases.push({
        id: 'phase-loose-steps',
        title: '步骤',
        status: status === 'running' ? 'running' : status === 'done' ? 'done' : 'pending',
        progress: null,
        steps: loose,
      })
    }
  } else if (flatSteps.length > 0) {
    phases.push({
      id: 'phase-steps',
      title: '步骤',
      status: status === 'running' ? 'running' : status === 'done' ? 'done' : 'pending',
      progress: null,
      steps: flatSteps,
    })
  }
  const artifacts = normalizeArtifacts(source['artifacts'] ?? source['outputs'] ?? source['files'])
  const approvals = normalizeApprovals(source['approvals'] ?? raw['approvals'], id)
  const progress = normalizeProgress(source['progress'])
  const neutralized =
    hasNeutralized(title) ||
    hasNeutralized(summary) ||
    phases.some(
      (phase) => hasNeutralized(phase.title) || phase.steps.some((step) => hasNeutralized(step.title)),
    )

  const dependsRaw = source['dependsOn'] ?? source['depends_on']
  const dependsOn = Array.isArray(dependsRaw)
    ? dependsRaw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : []

  return {
    id,
    title,
    status,
    ...(summary === undefined ? {} : { summary }),
    createdAt: readNumber(source, 'createdAt') ?? readNumber(source, 'created_at') ?? undefined,
    updatedAt: readNumber(source, 'updatedAt') ?? readNumber(source, 'updated_at') ?? undefined,
    sessionId: readString(source, 'sessionId') ?? readString(source, 'session_id') ?? undefined,
    kind: readString(source, 'kind') ?? undefined,
    progress,
    phases,
    artifacts,
    approvals,
    neutralized,
    workflowId: readString(source, 'workflowId') ?? readString(source, 'workflow_id') ?? null,
    workflowTitle: readString(source, 'workflowTitle') ?? readString(source, 'workflow_title') ?? null,
    key: readString(source, 'key') ?? readString(source, 'taskKey') ?? null,
    dependsOn,
    orderIndex: readNumber(source, 'orderIndex') ?? readNumber(source, 'order_index') ?? null,
    reportMessageId: readString(source, 'reportMessageId') ?? readString(source, 'report_message_id') ?? null,
    durationMs:
      readNumber(source, 'durationMs') ??
      readNumber(source, 'duration_ms') ??
      readNumber(source, 'elapsedMs') ??
      readNumber(source, 'elapsed_ms') ??
      null,
  }
}

function taskArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  for (const key of ['tasks', 'items', 'data']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (isRecord(value)) {
      const nested = value['tasks'] ?? value['items']
      if (Array.isArray(nested)) return nested
    }
  }
  return []
}

export function normalizeTaskList(payload: unknown): TaskRecord[] {
  const seen = new Set<string>()
  const tasks: TaskRecord[] = []
  for (const entry of taskArray(payload)) {
    const task = normalizeTask(entry)
    if (!task || seen.has(task.id)) continue
    seen.add(task.id)
    tasks.push(task)
  }
  return tasks
}

/** 详情响应：兼容 {task:{...}} / {data:{task:{...}}} / 任务对象本身（递归解包）。 */
export function normalizeTaskDetail(payload: unknown): TaskRecord | null {
  const direct = normalizeTask(payload)
  if (direct) return direct
  if (!isRecord(payload)) return null
  for (const key of ['task', 'data', 'item', 'result']) {
    const value = payload[key]
    if (!isRecord(value)) continue
    const nested = normalizeTaskDetail(value)
    if (nested) return nested
  }
  return null
}

// ---------------------------------------------------------------------------
// 列表归约（WS 增量）
// ---------------------------------------------------------------------------

export function upsertCreated(tasks: readonly TaskRecord[], payload: TaskCreatedPayload): TaskRecord[] {
  const created = normalizeTask({ ...payload.fields, id: payload.id, title: payload.title, status: payload.status })
  if (!created) return [...tasks]
  const index = tasks.findIndex((task) => task.id === payload.id)
  if (index === -1) return [...tasks, created]
  const current = tasks[index]
  if (!current) return [...tasks]
  const next = tasks.slice()
  next[index] = { ...current, title: current.title || created.title }
  return next
}

export function applyUpdated(tasks: readonly TaskRecord[], patch: TaskPatch): TaskRecord[] {
  const index = tasks.findIndex((task) => task.id === patch.id)
  if (index === -1) {
    const created = normalizeTask({ ...patch.fields, id: patch.id, title: '任务', status: 'running' })
    return created ? [...tasks, created] : [...tasks]
  }
  const current = tasks[index]
  if (!current) return [...tasks]
  const merged = normalizeTask({ ...current, ...patch.fields, id: patch.id })
  if (!merged) return [...tasks]
  const next = tasks.slice()
  next[index] = merged
  return next
}

export function countRunning(tasks: readonly TaskRecord[]): number {
  return tasks.filter((task) => task.status === 'running' || task.status === 'queued').length
}

// ---------------------------------------------------------------------------
// 展示辅助
// ---------------------------------------------------------------------------

export interface StatusMeta {
  label: string
  classes: string
}

const TASK_STATUS_META: Record<string, StatusMeta> = {
  queued: { label: '排队中', classes: 'border-border-subtle bg-surface-solid text-muted' },
  running: { label: '执行中', classes: 'border-accent-border bg-accent-soft text-accent-hover' },
  done: { label: '完成', classes: 'border-ok-border bg-ok-soft text-ok-ink' },
  failed: { label: '失败', classes: 'border-danger-border bg-danger-soft text-danger-ink' },
  cancelled: { label: '已取消', classes: 'border-border-subtle bg-surface-sunken text-muted' },
}

export function taskStatusMeta(status: string): StatusMeta {
  return TASK_STATUS_META[status] ?? { label: status, classes: 'border-border-subtle bg-surface-solid text-muted' }
}

const STEP_ICON: Record<string, string> = {
  done: '\u2713',
  running: '\u25B6',
  pending: '\u25CB',
  failed: '\u2715',
  blocked: '!',
  cancelled: '\u2013',
}

export function stepIcon(status: string): string {
  return STEP_ICON[status] ?? '○'
}

export function stepTone(status: string): string {
  switch (status) {
    case 'done':
      return 'text-ok-ink'
    case 'running':
      return 'text-accent-hover'
    case 'failed':
      return 'text-danger-ink'
    case 'blocked':
      return 'text-warn-ink'
    default:
      return 'text-muted'
  }
}

export function phaseLabel(status: string): string {
  switch (status) {
    case 'done':
      return '已完成'
    case 'running':
      return '进行中'
    case 'failed':
      return '失败'
    case 'blocked':
      return '阻塞'
    case 'cancelled':
      return '已取消'
    default:
      return '待开始'
  }
}

/** 0–100；优先 task.progress，否则用阶段完成比例，未知返回 null。 */
export function progressPercent(task: TaskRecord): number | null {
  if (task.progress !== null) return Math.round(task.progress * 100)
  if (task.phases.length > 0) {
    const done = task.phases.filter((phase) => phase.status === 'done').length
    return Math.round((done / task.phases.length) * 100)
  }
  if (task.status === 'done') return 100
  return null
}

/** 列表一行「当前进度」：优先当前步骤，其次阶段，再退回摘要。 */
export function currentProgressLabel(task: TaskRecord): string {
  for (const phase of task.phases) {
    const runningStep = phase.steps.find((step) => step.status === 'running')
    if (runningStep) return `${phase.title} · ${runningStep.title}`
    if (phase.status === 'running') return `${phase.title}（进行中）`
  }
  const donePhases = task.phases.filter((phase) => phase.status === 'done').length
  if (task.phases.length > 0) return `阶段 ${donePhases}/${task.phases.length}`
  return task.summary ?? ''
}

export function canCancel(task: { status: string }): boolean {
  return task.status === 'running' || task.status === 'queued'
}

export function canRetry(task: { status: string }): boolean {
  return task.status === 'failed' || task.status === 'cancelled'
}

/** 列表里的最后更新时间（本地时区，精确到分钟）。 */
export function formatTime(value: number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (input: number): string => String(input).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 产物大小展示。 */
export function formatSize(bytes: number | null): string {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 待审批（跨任务汇总用）。 */
export function pendingApprovals(tasks: readonly TaskRecord[]): TaskApproval[] {
  const seen = new Set<string>()
  const approvals: TaskApproval[] = []
  for (const task of tasks) {
    for (const approval of task.approvals) {
      if (approval.status !== 'pending' || seen.has(approval.id)) continue
      seen.add(approval.id)
      approvals.push({ ...approval, taskId: approval.taskId ?? task.id })
    }
  }
  return approvals
}

/** 审批按钮提交体：后端接受 decision=allow|deny（也接受 approved/denied），并附 approved 布尔。 */
export function approvalDecisionBody(decision: 'approve' | 'deny'): Record<string, unknown> {
  return {
    decision: decision === 'approve' ? 'allow' : 'deny',
    approved: decision === 'approve',
    action: decision === 'approve' ? 'allow' : 'deny',
  }
}

/** M9：审批动作（允许一次 / 本会话允许 / 拒绝）。 */
export type ApprovalDecision = 'allow_once' | 'allow_session' | 'deny'

/** M9 审批提交体（后端 400 时由 rest 层回退到旧 allow/deny）。 */
export function approvalActionBody(decision: ApprovalDecision): Record<string, unknown> {
  return { decision, approved: decision !== 'deny', action: decision }
}

export function approvalDecisionLabel(decision: string): string {
  if (decision === 'allow_once') return '允许一次'
  if (decision === 'allow_session') return '本会话允许'
  if (decision === 'deny') return '拒绝'
  return decision
}

export function approvalRiskLabel(risk: string): string {
  const normalized = risk.trim().toLowerCase()
  if (normalized === 'read' || normalized === 'r0') return '读'
  if (normalized === 'write' || normalized === 'r1') return '写'
  if (normalized === 'execute' || normalized === 'r2') return '执行'
  if (normalized === 'network' || normalized === 'r3') return '网络'
  if (normalized === 'danger' || normalized === 'r4') return '高危'
  return risk || '未知'
}

export function approvalRiskTone(risk: string): 'ok' | 'warn' | 'danger' | 'muted' {
  const normalized = risk.trim().toLowerCase()
  if (normalized === 'read' || normalized === 'r0') return 'ok'
  if (normalized === 'write' || normalized === 'r1') return 'warn'
  if (normalized === 'execute' || normalized === 'r2') return 'danger'
  if (normalized === 'network' || normalized === 'r3') return 'danger'
  if (normalized === 'danger' || normalized === 'r4') return 'danger'
  return 'muted'
}

/** REST approvals 形状：{id,tool,args,status,risk,sandbox,justification,...}。 */
export function normalizeApproval(value: unknown): TaskApproval | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'approvalId')
  if (!id) return null
  return buildApproval(value, null, id)
}

export function normalizeApprovalList(payload: unknown): TaskApproval[] {
  if (!isRecord(payload)) return []
  const raw = Array.isArray(payload) ? payload : payload['approvals']
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => normalizeApproval(entry))
    .filter((approval): approval is TaskApproval => approval !== null)
}

// Markdown 解析已抽到 platform/markdown.ts（M8 共用：消息富文本 + 产物预览）；此处保留 re-export 兼容旧引用。
export { parseMarkdown } from '../../platform/markdown.ts'
export type { MarkdownBlock } from '../../platform/markdown.ts'
