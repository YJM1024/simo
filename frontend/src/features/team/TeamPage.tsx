// features/team/TeamPage.tsx —— 只读团队页（V2，team-contract §2.3/§5/§7）
//
// 成员=下级会话+负责人 agent；展示状态（running/queued/paused/done）、当前任务/进度、并发上限/排队原因、
// 模板角色（通用 vs 模板）与继承来源。实时：WS 任务/会话事件 + 8s 轮询降级。
// 只读：无编辑控件；唯一交互=进入成员会话（切会话）/查看任务产物/刷新/关闭；模板 V2 未就绪时空态说明。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiGet, getTasks, toTasks } from '../../platform/http.ts'
import { bus, EVENTS } from '../../platform/events.ts'
import { readSessionId } from '../../platform/router.ts'
import type { TaskInfo, WireFrame } from '../../platform/types.ts'
import AgentAvatar from '../../platform/AgentAvatar.tsx'
import { Icon } from '../../platform/ui/icons.tsx'
import { findAgent, useAgentCatalog, type AgentInfo } from '../../platform/agents.ts'
import { EmptyPane, ErrorPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  memberStatusLabel,
  normalizeTeam,
  progressPercent,
  filterTeamMembers,
  roleTypeLabel,
  type TeamInfo,
  type TeamMember,
  type TeamMemberStatus,
  type TeamTemplateRole,
} from './model.ts'
import { fetchTeam } from './rest.ts'

const BADGE_CLASS =
  'inline-flex h-[17px] flex-none items-center rounded-[3px] border border-border bg-surface-sunken px-1.5 text-[10px] text-ink-muted'
const SECONDARY_BUTTON_CLASS =
  'inline-flex h-7 cursor-pointer items-center justify-center rounded-sm border border-border bg-surface px-2.5 text-[11px] text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50'

interface MemberArtifact {
  id: string
  name: string
  size: number | null
}

function normalizeArtifacts(payload: unknown): MemberArtifact[] {
  if (!payload || typeof payload !== 'object') return []
  const record = payload as Record<string, unknown>
  const raw = Array.isArray(record['artifacts']) ? record['artifacts'] : Array.isArray(payload) ? (payload as unknown[]) : []
  const items: MemberArtifact[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string') continue
    items.push({
      id: item.id,
      name: typeof item.name === 'string' ? item.name : item.id,
      size: typeof item.size === 'number' ? item.size : null,
    })
  }
  return items
}

function MemberMonogram({ agent }: { agent: AgentInfo }) {
  // 原型头像为 26px 方形 monogram；用父级选择器把 AgentAvatar 的圆形尺寸收口。
  return (
    <span className="inline-flex flex-none [&>span]:h-[26px] [&>span]:w-[26px] [&>span]:rounded-[7px] [&>span]:text-[10px]">
      <AgentAvatar agent={agent} size="sm" />
    </span>
  )
}

function MemberDetail({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const [artifacts, setArtifacts] = useState<MemberArtifact[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!member.sessionId) return
    const controller = new AbortController()
    setLoading(true)
    void Promise.allSettled([
      getTasks(member.sessionId),
      apiGet(`/api/sessions/${encodeURIComponent(member.sessionId)}/artifacts`),
    ])
      .then(([taskResult, artifactResult]) => {
        if (controller.signal.aborted) return
        setTasks(taskResult.status === 'fulfilled' ? toTasks(taskResult.value) : [])
        setArtifacts(artifactResult.status === 'fulfilled' ? normalizeArtifacts(artifactResult.value) : [])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [member.sessionId])

  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-ink">{member.name} 的任务与产物</h3>
        <span className="font-mono text-[10px] text-ink-faint">会话 {member.sessionId || '—'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
            收起
          </button>
          <button
            type="button"
            disabled={!member.sessionId}
            onClick={() => {
              if (!member.sessionId) return
              bus.emit(EVENTS.SESSION_SELECT, { sessionId: member.sessionId })
            }}
            className="inline-flex h-7 cursor-pointer items-center justify-center rounded-sm border border-ink bg-ink px-2.5 text-[11px] text-ink-inverse transition-colors duration-fast hover:border-ink-secondary hover:bg-ink-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            进入该成员会话 →
          </button>
        </div>
      </div>
      {loading ? (
        <p className="m-0 mt-2 text-[10.5px] text-ink-muted">加载任务与产物…</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <h4 className="m-0 mb-1 font-mono text-[10px] tracking-[0.06em] text-ink-faint">任务（{tasks.length}）</h4>
            {tasks.length === 0 ? (
              <p className="m-0 text-[10.5px] text-ink-muted">暂无任务（接口未就绪或尚未派发）。</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-secondary">
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <span className={BADGE_CLASS}>{task.status}</span>
                    {typeof task.progress === 'number' && (
                      <span className="font-mono text-[10px] text-ink-faint">{Math.round(task.progress > 1 ? task.progress : task.progress * 100)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="m-0 mb-1 font-mono text-[10px] tracking-[0.06em] text-ink-faint">产物（{artifacts.length}）</h4>
            {artifacts.length === 0 ? (
              <p className="m-0 text-[10.5px] text-ink-muted">暂无产物。</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="flex items-center gap-1.5 text-[12px]">
                    <a
                      href={`/api/artifacts/${encodeURIComponent(artifact.id)}/content`}
                      download={artifact.name}
                      className="min-w-0 flex-1 truncate text-ink-secondary underline decoration-border underline-offset-2 hover:text-ink"
                    >
                      {artifact.name}
                    </a>
                    {artifact.size !== null && <span className="font-mono text-[10px] text-ink-faint">{artifact.size} B</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TemplateSection({ template }: { template: TeamInfo['template'] }) {
  const [collapsed, setCollapsed] = useState(false)
  if (!template) return null
  return (
    <section className="rounded-md border border-border bg-surface" aria-label="团队模板">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className={BADGE_CLASS}>模板</span>
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{template.name}</span>
        {template.version && <span className="font-mono text-[10px] text-ink-faint">v{template.version}</span>}
        {template.inheritsFrom && <span className="font-mono text-[10px] text-ink-faint">继承自 {template.inheritsFrom}</span>}
        <span className="ml-auto font-mono text-[10px] text-ink-faint">{template.roles.length} 角色 · {collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <ul className="m-0 border-t border-border-subtle p-0" aria-label="模板角色">
          {template.roles.length === 0 ? (
            <li className="px-3 py-2 text-[10.5px] text-ink-muted">模板暂无角色。</li>
          ) : (
            template.roles.map((role: TeamTemplateRole) => (
              <li key={role.roleKey} className="border-b border-border-subtle px-3 py-2 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-medium text-ink">{role.title}</span>
                  <span className={BADGE_CLASS}>{roleTypeLabel(role.roleType)}</span>
                  {role.inheritsFrom && <span className="font-mono text-[10px] text-ink-faint">继承 {role.inheritsFrom}</span>}
                  <span className="font-mono text-[10px] text-ink-faint">人格 {role.personaBase}</span>
                </div>
                {role.responsibilities && <p className="m-0 mt-1 text-[10.5px] leading-relaxed text-ink-secondary">{role.responsibilities}</p>}
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  )
}

export default function TeamPage({ onClose, embedded = false }: { onClose: () => void; embedded?: boolean }) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(panelRef, !embedded, onClose)
  const agentCatalog = useAgentCatalog()
  const [team, setTeam] = useState<TeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TeamMember | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | TeamMemberStatus>('all')
  const [memberQuery, setMemberQuery] = useState('')
  const sessionId = readSessionId()
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filteredMembers = useMemo(() => (team ? filterTeamMembers(team.members, statusFilter, memberQuery) : []), [team, statusFilter, memberQuery])

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const payload = await fetchTeam(sessionId)
      setTeam(normalizeTeam(payload))
    } catch (cause) {
      setTeam(null)
      setError(
        (cause as { status?: number }).status === 404
          ? '团队接口尚未就绪（V2 团队页未启用）：不展示示例数据。V0/V1 可通过会话树进入成员会话。'
          : cause instanceof Error && cause.message
            ? cause.message
            : '团队加载失败',
      )
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 8000)
    return () => clearInterval(timer)
  }, [load])

  // 实时：WS 任务/会话/团队事件 → 500ms 去抖刷新（降级轮询仍保留）
  useEffect(
    () =>
      bus.on(EVENTS.WS_FRAME, ({ frame }: { frame: WireFrame }) => {
        if (!/^(task|session|workflow|team)\./.test(frame.type)) return
        if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = setTimeout(() => {
          reloadTimerRef.current = null
          void load()
        }, 500)
      }),
    [load],
  )

  useEffect(
    () => () => {
      if (reloadTimerRef.current !== null) clearTimeout(reloadTimerRef.current)
    },
    [],
  )

  return (
    <div
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-canvas' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-2 backdrop-blur-sm sm:p-4'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="团队"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-canvas' : 'popover-surface flex max-h-[92vh] w-full max-w-[1000px] flex-col overflow-hidden'}>
        <header className="flex-none border-b border-border bg-surface">
          <div className="mx-auto flex w-full max-w-[1000px] flex-wrap items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 font-serif text-[18px] font-medium tracking-[-0.01em] text-ink">团队</h2>
                <span className={BADGE_CLASS}>只读 · WS + 8s 轮询</span>
              </div>
              <p className="m-0 mt-1 text-[10.5px] text-ink-muted">
                成员 = 下级会话 + 负责人；只读。进入成员会话请在详情里点「进入该成员会话」。
              </p>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <button type="button" onClick={() => void load()} disabled={loading} className={SECONDARY_BUTTON_CLASS}>
                {loading ? '刷新中…' : '刷新'}
              </button>
              <button type="button" onClick={onClose} className={SECONDARY_BUTTON_CLASS}>
                关闭 ×
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1000px] px-5 py-4">
            {error && !team ? (
              <div>
                <ErrorPane message={error} onRetry={() => void load()} />
                <p className="m-0 mt-2 text-center text-[10.5px] text-ink-muted">只读团队页不会本地伪造成员/状态；可继续用会话树查看成员会话。</p>
              </div>
            ) : loading && !team ? (
              <LoadingPane label="加载团队…" rows={3} />
            ) : !team ? (
              <EmptyPane title="暂无团队" description="后端团队接口未就绪；V0/V1 无团队记录，V2 启用后显示只读团队页。" />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-2.5">
                  <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">{team.name}</span>
                  <span className={BADGE_CLASS}>{team.status}</span>
                  <span className="font-mono text-[10.5px] text-ink-muted">
                    并发上限 {team.concurrencyLimit ?? '—'} · 成员 {team.members.length}
                  </span>
                  {team.queueReason && (
                    <span className="inline-flex h-[17px] items-center rounded-[3px] border border-warn-border bg-warn-soft px-1.5 font-mono text-[10px] text-warn-ink" title="排队原因">
                      排队：{team.queueReason}
                    </span>
                  )}
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="flex flex-wrap items-center gap-0.5 rounded-sm border border-border bg-surface p-0.5" role="group" aria-label="成员筛选">
                    {([
                      { id: 'all', label: '全部' },
                      { id: 'running', label: '执行中' },
                      { id: 'queued', label: '排队中' },
                      { id: 'paused', label: '已暂停' },
                      { id: 'done', label: '已完成' },
                    ] as const).map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        aria-pressed={statusFilter === filter.id}
                        onClick={() => setStatusFilter(filter.id)}
                        className={`h-6 cursor-pointer rounded-[5px] px-2 font-mono text-[10.5px] transition-colors duration-fast ${
                          statusFilter === filter.id ? 'bg-surface-sunken font-medium text-ink' : 'text-ink-muted hover:text-ink'
                        }`}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <label className="ml-auto flex min-w-0 items-center gap-1.5 text-[10.5px] text-ink-muted">
                    搜索成员
                    <input
                      aria-label="搜索团队成员"
                      value={memberQuery}
                      onChange={(event) => setMemberQuery(event.target.value)}
                      placeholder="名称 / 角色 / 任务…"
                      className="h-6 w-40 min-w-0 rounded-[5px] border border-border bg-surface px-1.5 text-[10.5px] text-ink outline-none placeholder:text-ink-faint focus:border-accent focus:shadow-focus"
                    />
                  </label>
                </div>

                {team.members.length === 0 ? (
                  <div className="mx-auto flex max-w-[440px] flex-col items-center px-4 py-16 text-center">
                    <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-ink text-ink-inverse" aria-hidden="true">
                      <Icon name="user" size={16} />
                    </span>
                    <p className="m-0 mt-4 font-serif text-[18px] font-medium text-ink">还没有团队成员</p>
                    <p className="m-0 mt-1 max-w-[360px] text-[11px] leading-relaxed text-ink-muted">
                      通过对话让司墨按角色创建成员；成员会作为下级会话出现在会话树中。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        bus.emit(EVENTS.COMPOSER_INSERT, { text: '帮我创建一个团队' })
                        onClose()
                      }}
                      className="mt-4 inline-flex h-8 cursor-pointer items-center justify-center rounded-sm border border-ink bg-ink px-3 text-[11px] font-medium text-ink-inverse transition-colors duration-fast hover:border-ink-secondary hover:bg-ink-secondary"
                    >
                      通过对话创建团队
                    </button>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <EmptyPane compact title="没有匹配的成员" description="调整状态筛选或搜索词；不会伪造成员数据。" />
                ) : (
                  <ul className="m-0 list-none overflow-hidden rounded-md border border-border bg-surface p-0" aria-label="团队成员列表">
                    {filteredMembers.map((member) => {
                      const agent = findAgent(agentCatalog.agents, member.agentId)
                      const percent = progressPercent(member)
                      const dotClass = member.status === 'running'
                        ? 'bg-accent motion-safe:animate-pulse'
                        : member.status === 'queued'
                          ? 'bg-warn'
                          : member.status === 'paused'
                            ? 'bg-ink-faint'
                            : 'bg-ok'
                      return (
                        <li key={member.id} className="border-b border-border-subtle last:border-b-0">
                          <div className={`transition-colors duration-fast ${selected?.id === member.id ? 'bg-surface-sunken' : 'hover:bg-surface-sunken/60'}`}>
                            <button
                              type="button"
                              onClick={() => setSelected(selected?.id === member.id ? null : member)}
                              aria-pressed={selected?.id === member.id}
                              aria-label={`查看成员 ${member.name} 详情`}
                              className="w-full cursor-pointer px-3 py-3 text-left"
                            >
                              <div className="flex items-start gap-3">
                                <MemberMonogram agent={agent} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate text-[13px] font-medium text-ink">{member.name}</span>
                                    {member.isLead && <span className={BADGE_CLASS}>负责人</span>}
                                    <span className="inline-flex h-[17px] flex-none items-center gap-1 rounded-[3px] border border-border bg-surface-sunken px-1.5 font-mono text-[10px] text-ink-secondary">
                                      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${dotClass}`} />
                                      {memberStatusLabel(member.status)}
                                    </span>
                                  </div>
                                  <p className="m-0 mt-1 truncate font-mono text-[10.5px] text-ink-muted" title={member.role || member.title}>
                                    {member.role || member.title}
                                    {member.leadName ? ` · 上级 ${member.leadName}` : ''}
                                  </p>
                                  <p className="m-0 mt-0.5 truncate text-[12px] text-ink-secondary" title={member.currentTask}>
                                    当前任务：{member.currentTask || '—'}
                                  </p>
                                  {percent !== null && (
                                    <span className="mt-1.5 flex items-center gap-2">
                                      <span
                                        role="progressbar"
                                        aria-label={`${member.name} 进度`}
                                        aria-valuemin={0}
                                        aria-valuemax={100}
                                        aria-valuenow={percent}
                                        className="h-[3px] flex-1 overflow-hidden rounded-full bg-surface-sunken"
                                      >
                                        <span className="block h-full rounded-full bg-ink" style={{ width: `${percent}%` }} />
                                      </span>
                                      <span className="font-mono text-[10px] text-ink-faint">{percent}%</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center justify-between gap-2 border-t border-border-subtle px-3 py-1.5">
                              <span className="min-w-0 truncate font-mono text-[10px] text-ink-faint">会话 {member.sessionId || '—'}</span>
                              <button
                                type="button"
                                disabled={!member.sessionId}
                                onClick={() => {
                                  if (!member.sessionId) return
                                  bus.emit(EVENTS.SESSION_SELECT, { sessionId: member.sessionId })
                                  onClose()
                                }}
                                className="inline-flex h-6 flex-none cursor-pointer items-center justify-center rounded-[5px] border border-border bg-surface px-2 text-[10.5px] text-ink-secondary transition-colors duration-fast hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                                title={member.sessionId ? `进入 ${member.name} 的会话` : '该成员缺少会话 id'}
                              >
                                进入会话 →
                              </button>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="mt-3">
                  {team.members.length > 0 && <TemplateSection template={team.template} />}
                </div>
                {selected && <div className="mt-3"><MemberDetail member={selected} onClose={() => setSelected(null)} /></div>}
              </>
            )}
          </div>
        </div>

        <footer className="flex-none border-t border-border bg-surface">
          <div className="mx-auto w-full max-w-[1000px] px-5 py-2 text-[10.5px] text-ink-faint">
            团队页只读：创建/暂停/换负责人通过对话完成；成员状态与交付物以会话/任务为准。
          </div>
        </footer>
      </div>
    </div>
  )
}
