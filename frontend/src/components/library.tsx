import { useEffect, useMemo, useRef, useState } from 'react'
import type { Artifact, Card, Message, Session, StatsBucket, Task } from '../types'

const CATEGORY_LABEL: Record<string, string> = {
  progress: '进度汇报',
  clarification: '需求澄清',
  requirement: '需求提出',
  consultation: '信息咨询',
}

export function formatTokens(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 1)}k`
  return String(Math.round(value))
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

export function Icon({ name, size = 16 }: { name: string; size?: number }): React.ReactNode {
  const paths: Record<string, React.ReactNode> = {
    search: <><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></>,
    plus: <path d="M8 3v10M3 8h10" />,
    more: <><circle cx="3.5" cy="8" r=".8" /><circle cx="8" cy="8" r=".8" /><circle cx="12.5" cy="8" r=".8" /></>,
    gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 2.5v1.4M8 12.1v1.4M2.5 8h1.4M12.1 8h1.4M4.1 4.1l1 1M10.9 10.9l1 1M11.9 4.1l-1 1M5.1 10.9l-1 1" /></>,
    bell: <><path d="M4 11h8l-1-2V6a3 3 0 0 0-6 0v3Z" /><path d="M6.5 13a1.5 1.5 0 0 0 3 0" /></>,
    file: <><path d="M5 2h4l3 3v9H5Z" /><path d="M9 2v3h3" /></>,
    send: <path d="M3 8l10-5-3 10-2-4-5-1Z" />,
    tools: <><path d="m3 13 4-4" /><path d="m8 4 4 4" /><path d="M3 3l10 10" /></>,
    refresh: <><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 2v3h-3" /></>,
  }
  return <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.more}</svg>
}

export function Segmented({ value, onChange }: { value: 'chat' | 'workbench'; onChange: (value: 'chat' | 'workbench') => void }): React.ReactNode {
  return (
    <nav className="nav" aria-label="页面">
      <button type="button" className={`nav-chip ${value === 'chat' ? 'is-active' : ''}`} onClick={() => onChange('chat')}>对话</button>
      <button type="button" className={`nav-chip ${value === 'workbench' ? 'is-active' : ''}`} onClick={() => onChange('workbench')}>工作台</button>
    </nav>
  )
}

export function Sidebar({ sessions, activeId, onSelect, onRename, onCreate, onRefresh, connection, usageTotal, quotaPct, sessionCount, messageCount, statsError }: {
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onCreate: () => void
  onRefresh: () => void
  connection: string
  usageTotal: number | null
  quotaPct: number
  sessionCount: number
  messageCount: number | null
  statsError: string
}): React.ReactNode {
  const [editing, setEditing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit(id: string): Promise<void> {
    const value = draft.trim()
    if (value) await onRename(id, value)
    setEditing(null)
  }

  const renderRow = (session: Session, child = false): React.ReactNode => (
    <div key={session.id} className={`session-row ${child ? 'child' : ''} ${activeId === session.id ? 'is-active' : ''}`}
      onDoubleClick={() => { setEditing(session.id); setDraft(session.title) }}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onSelect(session.id) }}
    >
      <span className="session-dot" aria-hidden="true" />
      {editing === session.id ? (
        <input
          ref={inputRef}
          className="session-rename"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { void commit(session.id) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void commit(session.id)
            if (event.key === 'Escape') setEditing(null)
          }}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label="重命名会话"
        />
      ) : <><span className="session-title" title={session.title}>{session.title}</span>{activeId === session.id && messageCount !== null && <span className="session-count">{messageCount}</span>}</>}
    </div>
  )

  const visibleSessions = sessions.filter((session) => showArchived || !session.archived)

  return (
    <>
      <div className="ws">
        <i>S</i>
        <div><b>主工作区</b><span>{connection === 'open' ? '本地环境' : '连接中…'}</span></div>
        <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}><Icon name="plus" /></button>
      </div>
      <div className="search">
        <Icon name="search" />
        <input placeholder="搜索会话、消息…" aria-label="搜索会话" />
        <kbd>⌘K</kbd>
      </div>
      <div className="sidebar-scroll">
        <div className="side-label">
          <span className="grow">会话</span>
          <span>{sessions.reduce((count, session) => count + 1 + (session.children?.length ?? 0), 0)}</span>
          <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>显示归档</button>
          <button type="button" title="刷新会话" aria-label="刷新会话" onClick={onRefresh}><Icon name="refresh" size={12} /></button>
          <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}>＋</button>
        </div>
        {visibleSessions.length === 0 && <div className="side-empty">暂无会话</div>}
        {visibleSessions.map((session) => (
          <div key={session.id}>
            {renderRow(session)}
            {(session.children ?? []).filter((child) => showArchived || !child.archived).map((child) => renderRow(child, true))}
          </div>
        ))}
      </div>
      <div className="quota"><div className="quota-row"><span>本月用量</span><span>{usageTotal === null ? '—' : formatTokens(usageTotal)}</span></div><div className="quota-bar"><i className={`q${quotaPct}`} /></div><div className="quota-note">{statsError ? '统计加载失败' : `${sessionCount} 个会话 · ${messageCount === null ? '—' : messageCount} 条消息`}</div></div>
      <div className="user"><span className="avatar">Y</span><div><b>本地用户</b><span>主工作区 · Owner</span></div></div>
    </>
  )
}

export function StatusBar({ connection }: { connection: string }): React.ReactNode {
  return <footer className="statusbar"><span>{connection === 'open' ? '就绪' : '连接中'}</span><span>V4.1 Flash · 读/写权限按策略</span></footer>
}

export function MessageItem({ message, onCardAction }: { message: Message; onCardAction: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void> }): React.ReactNode {
  const [streaming, setStreaming] = useState(false)
  useEffect(() => {
    setStreaming(message.status === 'streaming')
  }, [message.status])
  const isUser = message.role === 'user'
  const category = message.category ? (CATEGORY_LABEL[message.category] ?? '信息') : ''
  return (
    <article className={`msg ${isUser ? 'from-user' : 'from-agent'}`}>
      <span className="msg-avatar">{isUser ? '你' : '墨'}</span>
      <div className="msg-body">
        <div className="msg-meta"><b>{isUser ? '你' : '司墨'}</b><span>·</span>{category && <><span className="tag">{category}</span><span>·</span></>}<span>{formatTime(message.at)}</span>{message.status === 'failed' && <span className="badge danger">失败</span>}</div>
        <div className="msg-text">
          {message.text.trim() ? <p>{message.text}{streaming && <span className="stream-caret" aria-hidden="true" />}</p> : streaming ? <p><span className="stream-caret" aria-hidden="true" /></p> : null}
          {(message.cards ?? []).map((card) => <CardBlock key={card.id} card={card} onSubmit={onCardAction} />)}
        </div>
      </div>
    </article>
  )
}

export function CardBlock({ card, onSubmit }: { card: Card; onSubmit: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void> }): React.ReactNode {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const blocks = card.schema.blocks ?? []
  const form = blocks.find((block) => block.type === 'form')
  const fields = (form?.props?.fields as Array<{ kind: string; label: string; name: string; options?: string[] }> | undefined) ?? []
  const action = form?.actions?.[0]?.id ?? 'submit'
  const disabled = busy || card.status !== 'active'
  return (
    <div className="card-block">
      <div className="card-head"><b>{card.schema.title ?? card.title ?? '交互卡片'}</b><span className="state">{card.status} · v{card.version}</span></div>
      {blocks.filter((block) => block.type === 'text').map((block) => <p className="card-text" key={block.id}>{String(block.props?.text ?? '')}</p>)}
      {fields.length > 0 && (
        <div className="card-fields">
          {fields.map((field) => {
            const id = `${card.id}-${field.name}`
            const value = values[field.name] ?? ''
            const update = (next: string): void => setValues((prev) => ({ ...prev, [field.name]: next }))
            return (
              <div className="card-field" key={field.name}>
                <label htmlFor={id}>{field.label}</label>
                {field.kind === 'select' ? (
                  <select id={id} className="select" value={value} onChange={(event) => update(event.target.value)}>
                    <option value="">请选择…</option>
                    {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.kind === 'textarea' ? (
                  <textarea id={id} className="textarea" value={value} onChange={(event) => update(event.target.value)} />
                ) : (
                  <input id={id} className="input" value={value} onChange={(event) => update(event.target.value)} />
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="card-error" role="alert">{error}</p>}
      <div className="card-actions">
        <button className="btn" type="button" disabled={busy} onClick={() => setValues({})}>取消</button>
        <button className="send" type="button" disabled={disabled} onClick={() => {
          setBusy(true)
          setError('')
          void onSubmit(card, action, values).catch((err: unknown) => setError(err instanceof Error ? err.message : '提交失败')).finally(() => setBusy(false))
        }}>{busy ? '提交中…' : '确认'}</button>
      </div>
    </div>
  )
}

export function WorkbenchChart({ buckets }: { buckets: StatsBucket[] }): React.ReactNode {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.messages))
  return (
    <div className="chart" role="img" aria-label="每日消息统计">
      {buckets.map((bucket) => {
        const pct = Math.max(2, Math.round((bucket.messages / max) * 100))
        return <div className="bar" key={bucket.label}><i className={`h${pct}`} /><span>{bucket.label.slice(5)}</span></div>
      })}
    </div>
  )
}

export function Timeline({ messages, active, onJump }: { messages: Message[]; active: number; onJump: (index: number) => void }): React.ReactNode {
  const first = messages[0]
  return (
    <div className="timeline" aria-label="消息时间轴">
      <div className="tl-track">
        {first && <span className="tl-date">{formatDate(first.at)}</span>}
        {messages.map((message, index) => (
          <button
            key={message.id}
            type="button"
            className={`tl-bar ${message.role === 'user' ? 'is-user' : 'is-agent'} ${index === active ? 'is-current' : ''}`}
            title={`${message.role === 'user' ? '你' : '司墨'} · ${formatTime(message.at)} · ${message.text.slice(0, 60)}`}
            onClick={() => onJump(index)}
            aria-label={`跳转到第 ${index + 1} 条消息`}
          />
        ))}
      </div>
    </div>
  )
}

export function Composer({ disabled, onSend }: { disabled: boolean; onSend: (text: string) => Promise<void> }): React.ReactNode {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  async function submit(): Promise<void> {
    const value = text.trim()
    if (!value || disabled || sending) return
    setText('')
    setSending(true)
    try { await onSend(value) } finally { setSending(false) }
  }
  return (
    <div className="composer">
      <div className="composer-box">
        <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="给司墨发消息…" aria-label="消息输入框" onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }} />
        <div className="composer-foot">
          <div className="composer-left"><Icon name="file" /> <span>支持 Markdown 格式</span></div>
          <div className="composer-right"><span className="composer-hint">Enter 发送 · Shift+Enter 换行</span><button className="send" type="button" disabled={disabled || sending || !text.trim()} onClick={() => void submit()}>{sending ? '发送中…' : '发送'}</button></div>
        </div>
      </div>
    </div>
  )
}

export function StatusDot({ tone }: { tone: 'done' | 'running' | 'pending' }): React.ReactNode {
  return <i className={`exec-dot ${tone}`} aria-hidden="true" />
}

export function TaskItem({ task, tone }: { task: Task; tone: 'done' | 'running' | 'pending' }): React.ReactNode {
  return (
    <div className="exec-row">
      <StatusDot tone={tone} />
      <span className="exec-title" title={task.title}>{task.title}</span>
      <span className="exec-time">{formatTime(task.createdAt)}</span>
    </div>
  )
}

export function List({ children }: { children: React.ReactNode }): React.ReactNode {
  return <div className="exec-list">{children}</div>
}

export function SectionHeader({ title, meta }: { title: string; meta?: React.ReactNode }): React.ReactNode {
  return <div className="insp-head insp-head--tight"><b>{title}</b>{meta !== undefined && <span>{meta}</span>}</div>
}

export function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return <section className="insp-block"><h3 className="insp-label">{title}</h3>{children}</section>
}

export function EmptyState({ title, description }: { title: string; description?: string }): React.ReactNode {
  return (
    <div className="overview-empty">
      <span className="overview-empty-mark" aria-hidden="true">·</span>
      <div><b>{title}</b>{description && <span>{description}</span>}</div>
    </div>
  )
}

export function DeliverableItem({ artifact }: { artifact: Artifact }): React.ReactNode {
  return (
    <div className="exec-row">
      <span className="deliverable-icon"><Icon name="file" size={14} /></span>
      <span className="exec-title" title={artifact.name}>{artifact.name}</span>
      <span className="exec-time">{formatTime(artifact.createdAt)}</span>
    </div>
  )
}

export function ExecutionGroup({ title, tasks, defaultCount, tone, emptyTitle, emptyDescription }: { title: string; tasks: Task[]; defaultCount: number; tone: 'done' | 'running' | 'pending'; emptyTitle: string; emptyDescription: string }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? tasks : tasks.slice(0, defaultCount)
  const shown = expanded ? tasks.length : Math.min(defaultCount, tasks.length)
  return (
    <div className={`exec-group ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" className="exec-head" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <span className="exec-toggle">{expanded ? '▾' : '▸'}</span><span className="exec-name">{title}</span><span className="exec-count">{`${shown}/${tasks.length}`}</span>
      </button>
      {visible.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : (
        <List>{visible.map((task) => <TaskItem key={task.id} task={task} tone={tone} />)}</List>
      )}
    </div>
  )
}

export function OverviewPanel({ session, overview, tasks, artifacts, loading }: { session: Session | null; overview: { goal?: string; constraints?: string[] } | null; tasks: Task[]; artifacts: Artifact[]; loading: boolean }): React.ReactNode {
  const groups = useMemo(() => {
    const done = tasks.filter((task) => task.status === 'done').sort((a, b) => a.createdAt - b.createdAt)
    const running = tasks.filter((task) => task.status === 'running' || task.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)
    const queued = tasks.filter((task) => !['done', 'running', 'pending', 'failed', 'cancelled'].includes(task.status)).sort((a, b) => a.createdAt - b.createdAt)
    return { done, running, queued }
  }, [tasks])
  return (
    <aside className="inspector" aria-label="会话概览">
      <div className="insp-body">
        <Section title="目标"><p className="insp-text">{overview?.goal || '暂无目标，发送消息后由会话生成。'}</p></Section>
        <Section title="输入"><p className="insp-text">{overview?.constraints?.length ? overview.constraints.join(' · ') : (session ? '当前会话 · 真实消息驱动' : '暂无会话')}</p></Section>
        <section className="insp-block">
          <SectionHeader title="执行会话" meta={`共 ${tasks.length} · 本次 ${tasks.length}`} />
          {loading ? <EmptyState title="加载中" /> : (
            <>
              <ExecutionGroup title="已完成" tasks={groups.done} defaultCount={3} tone="done" emptyTitle="暂无已完成任务" emptyDescription="任务完成后会出现在这里。" />
              <ExecutionGroup title="进行中" tasks={groups.running} defaultCount={3} tone="running" emptyTitle="暂无进行中任务" emptyDescription="任务开始后会出现在这里。" />
              <ExecutionGroup title="未开始" tasks={groups.queued} defaultCount={3} tone="pending" emptyTitle="暂无未开始任务" emptyDescription="新任务会先排在这里。" />
            </>
          )}
        </section>
        <section className="insp-block">
          <SectionHeader title="交付物" meta={artifacts.length} />
          {artifacts.length === 0 ? <EmptyState title="暂无交付物" description="任务产出文件会出现在这里。" /> : (
            <List>{artifacts.slice(0, 8).map((artifact) => <DeliverableItem key={artifact.id} artifact={artifact} />)}</List>
          )}
        </section>
      </div>
      <div className="insp-rail" aria-label="概览导航">
        <button type="button" className="active" title="概览">☰</button>
        <button type="button" title="消息">◷</button>
        <button type="button" title="交付物">▤</button>
      </div>
    </aside>
  )
}

export function RightPanel(props: React.ComponentProps<typeof OverviewPanel>): React.ReactNode {
  return <OverviewPanel {...props} />
}
