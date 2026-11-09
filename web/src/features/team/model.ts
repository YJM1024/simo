// features/team/model.ts —— 团队页数据归一化（纯逻辑可单测）
//
// 契约：docs/team-contract.md §2.3/§3/§6/§7。V2 团队页只读；成员=下级会话+负责人 agent；
// 状态仅 running|queued|paused|done；并发上限/排队原因；模板角色分 generic/template。
// 不出现内部字段；后端未就绪时空态/说明，不伪造。

import { isRecord, readNumber, readString } from '../../platform/types.ts'

export type TeamMemberStatus = 'running' | 'queued' | 'paused' | 'done'

export interface TeamTemplateRole {
  roleKey: string
  title: string
  roleType: 'template' | 'generic'
  inheritsFrom: string
  personaBase: string
  responsibilities: string
}

export interface TeamTemplate {
  id: string
  name: string
  version: string
  inheritsFrom: string
  roles: TeamTemplateRole[]
}

export interface TeamMember {
  id: string
  sessionId: string
  agentId: string
  name: string
  role: string
  title: string
  status: TeamMemberStatus
  rawStatus: string
  currentTask: string
  progress: number | null
  leadName: string
  isLead: boolean
  roleType: 'template' | 'generic' | ''
  inheritsFrom: string
}

export interface TeamInfo {
  id: string
  name: string
  status: string
  leadSessionId: string
  concurrencyLimit: number | null
  queueReason: string
  members: TeamMember[]
  template: TeamTemplate | null
}

const STATUS_MAP: Record<string, TeamMemberStatus> = {
  running: 'running',
  active: 'running',
  executing: 'running',
  queued: 'queued',
  queued_up: 'queued',
  pending: 'queued',
  waiting: 'queued',
  paused: 'paused',
  suspended: 'paused',
  done: 'done',
  completed: 'done',
  complete: 'done',
  failed: 'done',
  cancelled: 'done',
  archived: 'done',
}

export function normalizeTeamMemberStatus(value: string | undefined): TeamMemberStatus {
  return STATUS_MAP[(value ?? '').trim().toLowerCase()] ?? 'queued'
}

export function normalizeProgress(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(numeric)) return null
  const normalized = numeric > 1 ? numeric / 100 : numeric
  return Math.max(0, Math.min(1, normalized))
}

function normalizeRoleType(value: string | undefined): 'template' | 'generic' | '' {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'template' || normalized === 'generic') return normalized
  return ''
}

function normalizeTemplateRole(value: unknown, index: number): TeamTemplateRole | null {
  if (!isRecord(value)) return null
  const roleKey = readString(value, 'roleKey') ?? readString(value, 'role_key') ?? readString(value, 'key') ?? `role-${index}`
  const title = readString(value, 'title') ?? readString(value, 'name') ?? roleKey
  return {
    roleKey,
    title,
    roleType: normalizeRoleType(readString(value, 'roleType') ?? readString(value, 'role_type')) === 'generic' ? 'generic' : 'template',
    inheritsFrom: readString(value, 'inheritsFrom') ?? readString(value, 'inherits_from') ?? '',
    personaBase: readString(value, 'personaBase') ?? readString(value, 'persona_base') ?? 'simo',
    responsibilities: readString(value, 'responsibilities') ?? readString(value, 'summary') ?? '',
  }
}

function normalizeTemplate(value: unknown): TeamTemplate | null {
  if (!isRecord(value)) return null
  const rolesRaw = Array.isArray(value['roles']) ? value['roles'] : []
  const roles = rolesRaw.map((role, index) => normalizeTemplateRole(role, index)).filter((role): role is TeamTemplateRole => role !== null)
  return {
    id: readString(value, 'id') ?? 'template',
    name: readString(value, 'name') ?? '团队模板',
    version: readString(value, 'version') ?? '',
    inheritsFrom: readString(value, 'inheritsFrom') ?? readString(value, 'inherits_from') ?? '',
    roles,
  }
}

export function normalizeTeamMember(value: unknown, index: number): TeamMember | null {
  if (!isRecord(value)) return null
  const id = readString(value, 'id') ?? readString(value, 'memberId') ?? readString(value, 'member_id') ?? `member-${index}`
  const sessionId = readString(value, 'sessionId') ?? readString(value, 'session_id') ?? ''
  const agentId = readString(value, 'agentId') ?? readString(value, 'agent_id') ?? readString(value, 'ownerAgentId') ?? readString(value, 'owner_agent_id') ?? ''
  const name = readString(value, 'name') ?? readString(value, 'agentName') ?? readString(value, 'agent_name') ?? readString(value, 'title') ?? agentId ?? id
  const role = readString(value, 'role') ?? readString(value, 'roleKey') ?? readString(value, 'role_key') ?? ''
  const currentTask = readString(value, 'currentTask') ?? readString(value, 'current_task') ?? readString(value, 'taskTitle') ?? readString(value, 'task') ?? ''
  return {
    id,
    sessionId,
    agentId,
    name,
    role,
    title: readString(value, 'title') ?? name,
    status: normalizeTeamMemberStatus(readString(value, 'status')),
    rawStatus: readString(value, 'status') ?? '',
    currentTask,
    progress: normalizeProgress(value['progress']),
    leadName: readString(value, 'leadName') ?? readString(value, 'lead_name') ?? readString(value, 'lead') ?? '',
    isLead: value['isLead'] === true || value['is_lead'] === true,
    roleType: normalizeRoleType(readString(value, 'roleType') ?? readString(value, 'role_type')),
    inheritsFrom: readString(value, 'inheritsFrom') ?? readString(value, 'inherits_from') ?? '',
  }
}

function normalizeConcurrency(source: Record<string, unknown>): { limit: number | null; queueReason: string } {
  const raw = isRecord(source['concurrency']) ? source['concurrency'] : isRecord(source['limits']) ? source['limits'] : {}
  return {
    limit: readNumber(raw, 'limit') ?? readNumber(source, 'concurrencyLimit') ?? readNumber(source, 'concurrency_limit') ?? null,
    queueReason: readString(raw, 'queueReason') ?? readString(raw, 'queue_reason') ?? readString(source, 'queueReason') ?? readString(source, 'queue_reason') ?? '',
  }
}

export function normalizeTeam(payload: unknown): TeamInfo | null {
  if (!isRecord(payload)) return null
  const source = isRecord(payload['team'])
    ? (payload['team'] as Record<string, unknown>)
    : isRecord(payload['data'])
      ? (payload['data'] as Record<string, unknown>)
      : payload
  const membersRaw = Array.isArray(source['members'])
    ? source['members']
    : Array.isArray(payload['members'])
      ? payload['members']
      : []
  const members = membersRaw.map((member, index) => normalizeTeamMember(member, index)).filter((member): member is TeamMember => member !== null)
  const concurrency = normalizeConcurrency(source)
  const template = normalizeTemplate(source['template'] ?? payload['template'])
  return {
    id: readString(source, 'id') ?? readString(source, 'teamId') ?? readString(source, 'team_id') ?? 'team',
    name: readString(source, 'name') ?? '当前团队',
    status: readString(source, 'status') ?? 'active',
    leadSessionId: readString(source, 'leadSessionId') ?? readString(source, 'lead_session_id') ?? '',
    concurrencyLimit: concurrency.limit,
    queueReason: concurrency.queueReason,
    members,
    template,
  }
}

export function memberStatusLabel(status: TeamMemberStatus): string {
  if (status === 'running') return '执行中'
  if (status === 'queued') return '排队中'
  if (status === 'paused') return '已暂停'
  return '已完成'
}

export function memberStatusTone(status: TeamMemberStatus): string {
  if (status === 'running') return 'border-accent-border bg-accent-soft text-accent-hover'
  if (status === 'queued') return 'border-warn-border bg-warn-soft text-warn-ink'
  if (status === 'paused') return 'border-border-subtle bg-surface-sunken text-muted'
  return 'border-ok-border bg-ok-soft text-ok-ink'
}

export function roleTypeLabel(roleType: 'template' | 'generic' | ''): string {
  if (roleType === 'generic') return '通用角色'
  if (roleType === 'template') return '模板角色'
  return ''
}

export function progressPercent(member: TeamMember): number | null {
  return member.progress === null ? null : Math.round(member.progress * 100)
}

/** 团队页筛选：状态 + 关键词（名称/角色/任务/agent），纯展示。 */
export function filterTeamMembers(
  members: readonly TeamMember[],
  status: 'all' | TeamMemberStatus,
  query: string,
): TeamMember[] {
  const text = query.trim().toLowerCase()
  return members.filter((member) => {
    if (status !== 'all' && member.status !== status) return false
    if (!text) return true
    return `${member.name} ${member.role} ${member.title} ${member.currentTask} ${member.agentId}`.toLowerCase().includes(text)
  })
}
