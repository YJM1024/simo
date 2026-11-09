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
import { findAgent, useAgentCatalog } from '../../platform/agents.ts'
import { EmptyPane, ErrorPane, LoadingPane } from '../../platform/FeedbackPane.tsx'
import { useFocusTrap } from '../../platform/useFocusTrap.ts'
import {
  memberStatusLabel,
  memberStatusTone,
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
    <div className="rounded-lg border border-accent-border bg-surface-solid p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="m-0 text-md font-semibold text-ink">{member.name} 的任务与产物</h3>
        <span className="font-mono text-2xs text-muted">会话 {member.sessionId || '—'}</span>
        <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-muted">
          收起
        </button>
        <button
          type="button"
          disabled={!member.sessionId}
          onClick={() => {
            if (!member.sessionId) return
            bus.emit(EVENTS.SESSION_SELECT, { sessionId: member.sessionId })
          }}
          className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50"
        >
          进入该成员会话 →
        </button>
      </div>
      {loading ? (
        <p className="m-0 mt-1 text-2xs text-muted">加载任务与产物…</p>
      ) : (
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <h4 className="m-0 mb-0.5 font-mono text-2xs tracking-normal text-muted">任务（{tasks.length}）</h4>
            {tasks.length === 0 ? (
              <p className="m-0 text-2xs text-muted">暂无任务（接口未就绪或尚未派发）。</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center gap-1 text-2xs text-ink-secondary">
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1 font-mono text-2xs text-muted">{task.status}</span>
                    {typeof task.progress === 'number' && (
                      <span className="font-mono text-2xs text-muted">{Math.round(task.progress > 1 ? task.progress : task.progress * 100)}%</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="m-0 mb-0.5 font-mono text-2xs tracking-normal text-muted">产物（{artifacts.length}）</h4>
            {artifacts.length === 0 ? (
              <p className="m-0 text-2xs text-muted">暂无产物。</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                {artifacts.map((artifact) => (
                  <li key={artifact.id} className="flex items-center gap-1 text-2xs">
                    <a
                      href={`/api/artifacts/${encodeURIComponent(artifact.id)}/content`}
                      download={artifact.name}
                      className="min-w-0 flex-1 truncate text-accent-hover underline underline-offset-2"
                    >
                      {artifact.name}
                    </a>
                    {artifact.size !== null && <span className="font-mono text-muted">{artifact.size} B</span>}
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
    <section className="rounded-md border border-border-subtle bg-surface-solid p-2" aria-label="团队模板">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer flex-wrap items-center gap-1.5 text-left"
      >
        <span className="rounded-pill border border-border-subtle bg-surface-sunken px-1.5 font-mono text-2xs text-muted">模板</span>
        <span className="text-md font-semibold text-ink">{template.name}</span>
        {template.version && <span className="font-mono text-2xs text-muted">v{template.version}</span>}
        {template.inheritsFrom && <span className="font-mono text-2xs text-muted">继承自 {template.inheritsFrom}</span>}
        <span className="ml-auto font-mono text-2xs text-muted">{template.roles.length} 角色 · {collapsed ? '展开' : '收起'}</span>
      </button>
      {!collapsed && (
        <ul className="m-0 mt-1.5 flex list-none flex-col gap-1 p-0" aria-label="模板角色">
          {template.roles.length === 0 ? (
            <li className="text-2xs text-muted">模板暂无角色。</li>
          ) : (
            template.roles.map((role: TeamTemplateRole) => (
              <li key={role.roleKey} className="rounded border border-border-subtle bg-surface-sunken px-1.5 py-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-medium text-ink">{role.title}</span>
                  <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">{roleTypeLabel(role.roleType)}</span>
                  {role.inheritsFrom && <span className="font-mono text-2xs text-muted">继承 {role.inheritsFrom}</span>}
                  <span className="font-mono text-2xs text-muted">人格 {role.personaBase}</span>
                </div>
                {role.responsibilities && <p className="m-0 mt-0.5 text-2xs leading-relaxed text-ink-secondary">{role.responsibilities}</p>}
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
      className={embedded ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col bg-surface' : 'fixed inset-0 z-40 flex items-center justify-center bg-scrim-strong p-2 backdrop-blur-sm sm:p-4'}
      role={embedded ? undefined : 'dialog'}
      aria-modal={embedded ? undefined : true}
      aria-label="团队"
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className={embedded ? 'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-surface' : 'popover-surface flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden'}>
        <header className="flex flex-none flex-wrap items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
          <div className="min-w-0">
            <h2 className="m-0 text-lg font-semibold tracking-tight">团队</h2>
            <p className="m-0 mt-0.5 text-sm text-ink-secondary">
              成员 = 下级会话 + 负责人；只读。进入成员会话请在详情里点「进入该成员会话」。
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <span className="rounded-pill border border-border-subtle bg-surface-solid px-2 py-0.5 font-mono text-2xs tracking-normal text-muted">只读 · WS + 8s 轮询</span>
            <button type="button" onClick={() => void load()} disabled={loading} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-muted disabled:opacity-50">
              {loading ? '刷新中…' : '刷新'}
            </button>
            <button type="button" onClick={onClose} className="cursor-pointer rounded-md border border-border-subtle bg-surface-solid px-2 py-1 text-sm text-muted hover:text-ink">
              关闭 ×
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-3">
          {error && !team ? (
            <div>
              <ErrorPane message={error} onRetry={() => void load()} />
              <p className="m-0 mt-2 text-center text-2xs text-muted">只读团队页不会本地伪造成员/状态；可继续用会话树查看成员会话。</p>
            </div>
          ) : loading && !team ? (
            <LoadingPane label="加载团队…" rows={3} />
          ) : !team ? (
            <EmptyPane title="暂无团队" description="后端团队接口未就绪；V0/V1 无团队记录，V2 启用后显示只读团队页。" />
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-sunken px-2 py-1.5">
                <span className="text-md font-semibold text-ink">{team.name}</span>
                <span className="rounded-pill border border-border-subtle bg-surface-solid px-1.5 font-mono text-2xs text-muted">{team.status}</span>
                <span className="font-mono text-2xs text-muted">
                  并发上限 {team.concurrencyLimit ?? '—'} · 成员 {team.members.length}
                </span>
                {team.queueReason && (
                  <span className="rounded-pill border border-warn-border bg-warn-soft px-1.5 font-mono text-2xs text-warn-ink" title="排队原因">
                    排队：{team.queueReason}
                  </span>
                )}
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="成员筛选">
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
                    className={`cursor-pointer rounded-pill border px-2 py-0.5 font-mono text-2xs ${statusFilter === filter.id ? 'border-accent-border bg-accent-soft text-accent-hover' : 'border-border-subtle bg-surface-solid text-muted'}`}
                  >
                    {filter.label}
                  </button>
                ))}
                <label className="ml-auto flex min-w-0 items-center gap-1 text-2xs text-ink-secondary">
                  搜索成员
                  <input
                    aria-label="搜索团队成员"
                    value={memberQuery}
                    onChange={(event) => setMemberQuery(event.target.value)}
                    placeholder="名称 / 角色 / 任务…"
                    className="min-w-0 rounded-md border border-border-subtle bg-surface-solid px-1.5 py-0.5 text-2xs text-ink"
                  />
                </label>
              </div>

              {team.members.length === 0 ? (
                <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-border-subtle bg-surface-sunken text-ink-muted" aria-hidden="true">
                    <Icon name="user" size={20} />
                  </span>
                  <p className="m-0 mt-3 text-base font-medium text-ink">还没有团队成员</p>
                  <p className="m-0 mt-1 text-sm leading-relaxed text-ink-secondary">通过对话让司墨按角色创建成员；成员会作为下级会话出现在会话树中。</p>
                  <button
                    type="button"
                    onClick={() => {
                      bus.emit(EVENTS.COMPOSER_INSERT, { text: '帮我创建一个团队' })
                      onClose()
                    }}
                    className="mt-4 cursor-pointer rounded-xs border border-border-subtle bg-surface-solid px-3 py-1.5 text-sm text-ink-secondary hover:border-accent-border hover:text-ink"
                  >
                    通过对话创建团队
                  </button>
                </div>
              ) : filteredMembers.length === 0 ? (
                <EmptyPane compact title="没有匹配的成员" description="调整状态筛选或搜索词；不会伪造成员数据。" />
              ) : (
                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2" aria-label="团队成员列表">
                  {filteredMembers.map((member) => {
                    const agent = findAgent(agentCatalog.agents, member.agentId)
                    const percent = progressPercent(member)
                    const dotClass = member.status === 'running'
                      ? 'bg-accent motion-safe:animate-pulse'
                      : member.status === 'queued'
                        ? 'bg-warn'
                        : member.status === 'paused'
                          ? 'bg-muted'
                          : 'bg-ok'
                    return (
                      <li key={member.id}>
                        <div className={`rounded-lg border transition-colors duration-fast ${selected?.id === member.id ? 'border-accent-border bg-accent-soft/40' : 'border-border-subtle bg-surface-solid hover:border-accent-border'}`}>
                          <button
                            type="button"
                            onClick={() => setSelected(selected?.id === member.id ? null : member)}
                            aria-pressed={selected?.id === member.id}
                            aria-label={`查看成员 ${member.name} 详情`}
                            className="w-full cursor-pointer rounded-lg p-2 text-left"
                          >
                            <div className="flex items-start gap-2">
                              <AgentAvatar agent={agent} size="sm" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="truncate text-sm font-medium text-ink">{member.name}</span>
                                  {member.isLead && <span className="rounded-pill border border-accent-border bg-accent-soft px-1 font-mono text-2xs text-accent-hover">负责人</span>}
                                  <span className={`rounded-pill border px-1.5 font-mono text-2xs ${memberStatusTone(member.status)}`}>
                                    <span aria-hidden="true" className={`mr-1 inline-block h-1.5 w-1.5 rounded-xs ${dotClass}`} />
                                    {memberStatusLabel(member.status)}
                                  </span>
                                </div>
                                <p className="m-0 mt-0.5 truncate font-mono text-2xs text-muted" title={member.role || member.title}>
                                  {member.role || member.title}
                                  {member.leadName ? ` · 上级 ${member.leadName}` : ''}
                                </p>
                                <p className="m-0 mt-0.5 truncate text-2xs text-ink-secondary" title={member.currentTask}>
                                  当前任务：{member.currentTask || '—'}
                                </p>
                                {percent !== null && (
                                  <span className="mt-1 flex items-center gap-1">
                                    <span
                                      role="progressbar"
                                      aria-label={`${member.name} 进度`}
                                      aria-valuemin={0}
                                      aria-valuemax={100}
                                      aria-valuenow={percent}
                                      className="h-1 flex-1 overflow-hidden rounded-pill bg-surface-sunken"
                                    >
                                      <span className="block h-full rounded-pill bg-accent" style={{ width: `${percent}%` }} />
                                    </span>
                                    <span className="font-mono text-2xs text-muted">{percent}%</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          <div className="flex justify-end border-t border-border-subtle/60 px-2 py-1">
                            <button
                              type="button"
                              disabled={!member.sessionId}
                              onClick={() => {
                                if (!member.sessionId) return
                                bus.emit(EVENTS.SESSION_SELECT, { sessionId: member.sessionId })
                                onClose()
                              }}
                              className="cursor-pointer rounded-xs border border-accent-border bg-accent-soft px-1.5 py-0.5 text-2xs text-accent-hover disabled:opacity-50"
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

              <div className="mt-2">
                {team.members.length > 0 && <TemplateSection template={team.template} />}
              </div>
              {selected && <div className="mt-2"><MemberDetail member={selected} onClose={() => setSelected(null)} /></div>}
            </>
          )}
        </div>

        <footer className="flex-none border-t border-border-subtle px-3 py-1.5 font-mono text-2xs text-muted sm:px-4">
          团队页只读：创建/暂停/换负责人通过对话完成；成员状态与交付物以会话/任务为准。
        </footer>
      </div>
    </div>
  )
}
