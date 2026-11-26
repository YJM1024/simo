import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RefObject } from 'react'
import type { Artifact, Card, DeliverableGroup, Message, Session, StatsBucket, Task, TaskCounts, TaskDetailPayload, TaskFile, TaskGraphPayload, TaskView } from '../types'
import { badgeLabel } from '../taskEvents'
import { DeliverablesTab, TaskBadge, TaskDetailLayer, TaskGraphDialog, TaskMessageCard, TaskSummaryCard, TasksTab, type TaskFilter } from './tasks'

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
    gear: <><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.3M8 12.9v1.3M1.8 8h1.3M12.9 8h1.3M3.6 3.6l.9.9M11.5 11.5l.9.9M12.4 3.6l-.9.9M4.5 11.5l-.9.9" /><circle cx="8" cy="8" r="4.6" /></>,
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

/** DefaultSessionID：主会话固定为 'main'，产品口径规定它不可归档（也不提供删除）。 */
export const MAIN_SESSION_ID = 'main'

/** 侧栏计数与树渲染共用同一棵（已按可见性过滤的）树，避免“计数”和“行数”各算一套。 */
function countTree(nodes: Session[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    count += countTree(node.children ?? [])
  }
  return count
}

export function Sidebar({ sessions, activeId, onSelect, onRename, onCreate, onRefresh, connection, usageTotal, quotaPct, sessionCount, archivedCount, messageCount, statsError, loading, error, searchQuery, onSearch, searching, searchError, onRetrySearch, onArchive, onPin }: {
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => Promise<void>
  onCreate: () => void
  onRefresh: () => void
  connection: string
  usageTotal: number | null
  quotaPct: number
  /** 全部会话数（含归档与任意深度），由 app 以去重后的整棵树统计。 */
  sessionCount: number
  /** 归档会话数：与 sessionCount 分开显示，避免“可见行数”和“总数”两个口径互相冒充。 */
  archivedCount: number
  /** 底部汇总的全局消息数（GET /api/stats 的 totals.messages），与单行数字不是同一口径。 */
  messageCount: number | null
  statsError: string
  loading: boolean
  error: string
  searchQuery: string
  onSearch: (value: string) => void
  searching: boolean
  /** 搜索请求失败的原因；非空即错误态（与“真的没有结果”区分）。 */
  searchError: string
  onRetrySearch: () => void
  onArchive: (id: string, archived: boolean) => void
  /** 置顶入口：草稿与主会话不渲染菜单，因此不会触发；成功与否由上层刷新列表/toast 呈现。 */
  onPin: (id: string, pinned: boolean) => void
}): React.ReactNode {
  const [editing, setEditing] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  // 展开/折叠沿用既有树的交互语义：默认全展开，折叠只影响后代行，不改变选中态和数据。
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function commit(id: string): Promise<void> {
    const value = draft.trim()
    if (!value) { setEditing(null); return }
    try {
      await onRename(id, value)
      setEditing(null)
    } catch {
      // 重命名失败：保留编辑框与用户输入（错误提示由上层 app.tsx 的全局提示负责），也不产生未捕获拒绝
    }
  }

  const toggleCollapse = (id: string): void => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderRow = (session: Session, depth = 0): React.ReactNode => {
    const isMain = session.id === MAIN_SESSION_ID
    // 草稿会话（POST /api/sessions 的 draft=true）没落库，归档请求只会得到 404：菜单整体不出现，
    // 等首条消息触发 MaterializeDraft 后由 app.tsx 清掉 draft 标记再恢复菜单。
    const isDraft = session.draft === true
    const hasChildren = (session.children?.length ?? 0) > 0
    return (
    <div key={session.id} className={`session-row ${depth > 0 ? 'child' : ''} ${activeId === session.id ? 'is-active' : ''} ${session.archived ? 'is-archived' : ''}`}
      data-session-id={session.id}
      data-depth={depth}
      style={depth > 0 ? { paddingLeft: `calc(var(--sp-8) + ${depth * 16}px)` } : undefined}
      onDoubleClick={() => { setEditing(session.id); setDraft(session.title) }}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === 'Enter') onSelect(session.id) }}
    >
      {hasChildren ? (
        <button type="button" className="session-toggle" aria-expanded={!collapsed.has(session.id)}
          aria-label={`${collapsed.has(session.id) ? '展开' : '折叠'}子会话：${session.title}`}
          onClick={(event) => { event.stopPropagation(); toggleCollapse(session.id) }}>
          {collapsed.has(session.id) ? '▸' : '▾'}
        </button>
      ) : <span className="session-toggle-spacer" aria-hidden="true" />}
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
      ) : <><span className="session-title" title={session.title}>{session.title}</span>{typeof session.messageCount === 'number' && <span className="session-count">{session.messageCount}</span>}{session.hasUnread === true && <span className="session-unread" data-unread="true" aria-label="未读" />}{!isMain && !isDraft && <button type="button" className="session-more" aria-label="会话操作" onClick={(event) => { event.stopPropagation(); setMenuId((value) => value === session.id ? null : session.id) }}>⋯</button>}</>}
      {/* 主会话不可归档：菜单整体不出现（本轮也没有删除入口——产品裁决只允许归档）。 */}
      {/* AC-CONV-001-04：仅未归档会话可置顶，归档行菜单只保留「恢复」。 */}
      {menuId === session.id && !isMain && !isDraft && <div className="session-menu">{!session.archived && <button type="button" onClick={(event) => { event.stopPropagation(); onPin(session.id, !session.pinned); setMenuId(null) }}>{session.pinned ? '取消置顶' : '置顶'}</button>}<button type="button" onClick={(event) => { event.stopPropagation(); onArchive(session.id, !session.archived); setMenuId(null) }}>{session.archived ? '恢复' : '归档'}</button></div>}
    </div>
  )
  }

  const term = searchQuery.trim().toLowerCase()
  // 标题过滤在服务端完成（GET /api/sessions?q=）；这里只对已返回的结果做大小写无关的本地过滤兜底，
  // 不再并集消息搜索命中（消息正文搜索已降为 P2，侧栏不默认触发）。
  const matches = (session: Session): boolean => !term || session.title.toLowerCase().includes(term)
  // 递归过滤整棵树：深度不再截断，归档过滤与标题过滤对每一层都生效；祖先因后代命中而保留。
  const filterTree = (nodes: Session[]): Session[] => {
    const next: Session[] = []
    for (const node of nodes) {
      if (!showArchived && node.archived) continue
      const children = node.children ? filterTree(node.children) : []
      if (term && !matches(node) && children.length === 0) continue
      next.push(node.children ? { ...node, children } : node)
    }
    return next
  }
  const visibleTree = filterTree(sessions)
  const visibleCount = countTree(visibleTree)
  // 搜索失败 ≠ 没有结果：失败只显示错误态（可重试），绝不落到「没有匹配的会话」。
  const searchFailed = Boolean(term && searchError)

  // 递归渲染整棵树；折叠只影响该节点的后代，展开/收起沿用 aria-expanded 语义。
  const renderTree = (nodes: Session[], depth: number): React.ReactNode =>
    nodes.map((session) => (
      <div key={session.id}>
        {renderRow(session, depth)}
        {!collapsed.has(session.id) && (session.children?.length ?? 0) > 0 ? renderTree(session.children ?? [], depth + 1) : null}
      </div>
    ))

  return (
    <>
      <div className="ws">
        <i>S</i>
        <div><b>主工作区</b><span>{connection === 'open' ? '本地环境' : connection === 'reconnecting' ? '重连中…' : connection === 'error' ? '订阅失败' : connection === 'closed' ? '已关闭' : '连接中…'}</span></div>
        <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}><Icon name="plus" /></button>
      </div>
      <div className="search">
        <Icon name="search" />
        <input value={searchQuery} onChange={(event) => onSearch(event.target.value)} placeholder="搜索会话标题…" aria-label="搜索会话" />
        <kbd>⌘K</kbd>
      </div>
      <div className="sidebar-scroll">
        <div className="side-label">
          <span className="grow">会话</span>
          {/* 口径：这里只报“当前可见行数”（已按归档/标题过滤、含任意深度）；总数与归档数在底部 quota-note 分开报。 */}
          <span title={`当前可见 ${visibleCount} 个会话（归档 ${archivedCount} 个）`} aria-label={`当前可见 ${visibleCount} 个会话`}>{loading || error ? '—' : visibleCount}</span>
          <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>显示归档</button>
          <button type="button" title="刷新会话" aria-label="刷新会话" onClick={onRefresh}><Icon name="refresh" size={12} /></button>
          <button type="button" title="新建会话" aria-label="新建会话" onClick={onCreate}>＋</button>
        </div>
        {loading && visibleTree.length === 0 && <LoadingState label="会话加载中…" />}
        {!loading && error && <ErrorState title="会话加载失败" description={error} onRetry={onRefresh} />}
        {!loading && !error && searchFailed && <ErrorState title="搜索失败，请重试" description={searchError} onRetry={onRetrySearch} />}
        {!loading && !error && !searchFailed && visibleTree.length === 0 && <div className="side-empty">{searching ? '搜索中…' : term ? '没有匹配的会话' : '暂无会话'}</div>}
        {!searchFailed && renderTree(visibleTree, 0)}
      </div>
      <div className="quota"><div className="quota-row"><span>本月用量</span><span>{usageTotal === null ? '—' : formatTokens(usageTotal)}</span></div><div className="quota-bar"><i className={`q${quotaPct}`} /></div><div className="quota-note">{statsError ? '统计加载失败' : `${sessionCount} 个会话 · 归档 ${archivedCount} · ${messageCount === null ? '—' : messageCount} 条消息`}</div></div>
      <div className="user"><span className="avatar">Y</span><div><b>本地用户</b><span>主工作区 · Owner</span></div></div>
    </>
  )
}

export function StatusBar({ connection }: { connection: string }): React.ReactNode {
  return <footer className="statusbar"><span>{connection === 'open' ? '就绪' : connection === 'reconnecting' ? '重连中' : connection === 'error' ? '订阅失败' : connection === 'closed' ? '连接已关闭' : '连接中'}</span><span>V4.1 Flash · 读/写权限按策略</span></footer>
}

type TableAlign = 'left' | 'center' | 'right'

// GFM 分隔行单元格：可选冒号 + 至少一个短横线 + 可选冒号，冒号同时决定该列对齐。
const TABLE_SEPARATOR_CELL = /^:?-+:?$/

function isTableLine(line: string): boolean {
  return line.trim().startsWith('|')
}

/** 拆一行表格：去掉首尾竖线，按未转义的 | 切格；\| 还原成单元格里的竖线。 */
function splitTableRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '\\' && body[i + 1] === '|') { current += '|'; i += 1; continue }
    if (body[i] === '|') { cells.push(current.trim()); current = ''; continue }
    current += body[i]
  }
  cells.push(current.trim())
  return cells
}

function tableAlignments(separator: string[]): TableAlign[] | null {
  const aligns: TableAlign[] = []
  for (const cell of separator) {
    if (!TABLE_SEPARATOR_CELL.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    aligns.push(left && right ? 'center' : right ? 'right' : 'left')
  }
  return aligns
}

type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'strong'; children: InlineToken[] }
  | { kind: 'em'; children: InlineToken[] }
  | { kind: 'del'; children: InlineToken[] }
  | { kind: 'link'; href: string; label: string }

// 链接只放行 http、https、mailto 三种协议；其它协议按纯文本输出，不生成可点击元素。
const SAFE_LINK_PROTOCOL = /^(?:https?:\/\/|mailto:)/i
const WORD_CHAR = /[A-Za-z0-9]/

function isBlank(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char)
}

/** 找右括号：允许地址内部成对括号（例如维基链接），避免在第一个 ) 处截断。 */
function findLinkClose(text: string, from: number): number {
  let depth = 1
  for (let cursor = from; cursor < text.length; cursor += 1) {
    if (text[cursor] === '(') depth += 1
    else if (text[cursor] === ')') {
      depth -= 1
      if (depth === 0) return cursor
    }
  }
  return -1
}

/**
 * 找结束分隔符。跳过行内码内部，避免代码里的 * 或 _ 提前截断；
 * 结束符前必须是实字符，`_` 还要求后面不是字母数字（排除 snake_case 的第二处下划线）。
 */
function findInlineClose(text: string, from: number, delimiter: string, intraWord: boolean): number {
  let cursor = from
  while (cursor < text.length) {
    if (text[cursor] === '`') {
      const codeEnd = text.indexOf('`', cursor + 1)
      if (codeEnd !== -1) { cursor = codeEnd + 1; continue }
    }
    if (text.startsWith(delimiter, cursor) && !isBlank(text[cursor - 1])) {
      if (intraWord || !WORD_CHAR.test(text[cursor + delimiter.length] ?? '')) return cursor
    }
    cursor += 1
  }
  return -1
}

/**
 * 行内 Markdown 解析：优先级为行内码 > 链接 > 加粗/删除线（双字符）> 斜体（单字符）。
 * 反引号内的内容整体成为 code token，不再二次解析；链接文字保持纯文本，不解析加粗。
 */
function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let plain = ''
  const flush = (): void => {
    if (plain) { tokens.push({ kind: 'text', value: plain }); plain = '' }
  }
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '`') {
      const end = text.indexOf('`', index + 1)
      if (end !== -1) {
        flush()
        tokens.push({ kind: 'code', value: text.slice(index + 1, end) })
        index = end + 1
        continue
      }
      plain += char
      index += 1
      continue
    }
    if (char === '[') {
      const bracket = text.indexOf(']', index + 1)
      if (bracket !== -1 && text[bracket + 1] === '(') {
        const end = findLinkClose(text, bracket + 2)
        if (end !== -1) {
          const label = text.slice(index + 1, bracket)
          const href = text.slice(bracket + 2, end).trim()
          if (label && SAFE_LINK_PROTOCOL.test(href)) {
            flush()
            tokens.push({ kind: 'link', href, label })
          } else {
            // 协议不在白名单：连标记一起按原文输出，不产生可点击元素。
            plain += text.slice(index, end + 1)
          }
          index = end + 1
          continue
        }
      }
      plain += char
      index += 1
      continue
    }
    // 两个连续星号优先判加粗，双下划线同理；内容不能为空。
    if (text.startsWith('**', index) || text.startsWith('__', index)) {
      const delimiter = text.startsWith('**', index) ? '**' : '__'
      const intraWord = delimiter === '__' && WORD_CHAR.test(text[index - 1] ?? '')
      const end = intraWord || isBlank(text[index + 2]) ? -1 : findInlineClose(text, index + 2, delimiter, true)
      if (end > index + 2) {
        flush()
        tokens.push({ kind: 'strong', children: parseInline(text.slice(index + 2, end)) })
        index = end + 2
        continue
      }
      plain += delimiter
      index += 2
      continue
    }
    if (text.startsWith('~~', index)) {
      const end = isBlank(text[index + 2]) ? -1 : findInlineClose(text, index + 2, '~~', true)
      if (end > index + 2) {
        flush()
        tokens.push({ kind: 'del', children: parseInline(text.slice(index + 2, end)) })
        index = end + 2
        continue
      }
      plain += '~~'
      index += 2
      continue
    }
    // 单个 * 必须后面有实字符才算斜体起始，单独一个 * 原样输出。
    if (char === '*' && !isBlank(text[index + 1])) {
      const end = findInlineClose(text, index + 1, '*', true)
      if (end > index + 1) {
        flush()
        tokens.push({ kind: 'em', children: parseInline(text.slice(index + 1, end)) })
        index = end + 1
        continue
      }
    }
    // _ 只在不位于单词内部时作为斜体起始，snake_case_identifier 保持原样。
    if (char === '_' && !WORD_CHAR.test(text[index - 1] ?? '') && !isBlank(text[index + 1])) {
      const end = findInlineClose(text, index + 1, '_', false)
      if (end > index + 1) {
        flush()
        tokens.push({ kind: 'em', children: parseInline(text.slice(index + 1, end)) })
        index = end + 1
        continue
      }
    }
    plain += char
    index += 1
  }
  flush()
  return tokens
}

function renderInlineTokens(tokens: InlineToken[]): React.ReactNode[] {
  return tokens.map((token, index) => {
    switch (token.kind) {
      case 'text': return token.value
      case 'code': return <code key={index}>{token.value}</code>
      case 'strong': return <strong key={index}>{renderInlineTokens(token.children)}</strong>
      case 'em': return <em key={index}>{renderInlineTokens(token.children)}</em>
      case 'del': return <del key={index}>{renderInlineTokens(token.children)}</del>
      case 'link': return <a key={index} href={token.href} target="_blank" rel="noopener noreferrer">{token.label}</a>
    }
  })
}

function renderInline(text: string): React.ReactNode[] {
  return renderInlineTokens(parseInline(text))
}

function renderTable(rows: string[][], aligns: TableAlign[], key: string): React.ReactNode {
  const [header, ...body] = rows
  const alignOf = (column: number): React.CSSProperties => ({ textAlign: aligns[column] ?? 'left' })
  // 外层滚动容器：宽表格在卡片内部横向滚动，消息列与页面不被撑出横向溢出（COMP-conversation-panel A3）。
  return (
    <div className="msg-table-wrap" key={key} tabIndex={0} role="region" aria-label="表格">
      <table className="msg-table">
        <thead><tr>{header.map((cell, column) => <th key={column} scope="col" style={alignOf(column)}>{renderInline(cell)}</th>)}</tr></thead>
        <tbody>{body.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={alignOf(column)}>{renderInline(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function renderTextBlocks(part: string, partIndex: number): React.ReactNode[] {
  const lines = part.split('\n')
  const nodes: React.ReactNode[] = []
  let paragraph: string[] = []
  let count = 0
  const flushParagraph = (): void => {
    const chunk = paragraph.join('\n').trim()
    paragraph = []
    if (!chunk) return
    nodes.push(<p key={`${partIndex}-p${count++}`}>{renderInline(chunk)}</p>)
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (isTableLine(line) && i + 1 < lines.length && isTableLine(lines[i + 1])) {
      const header = splitTableRow(line)
      const separator = splitTableRow(lines[i + 1])
      const aligns = separator.length === header.length ? tableAlignments(separator) : null
      if (aligns) {
        flushParagraph()
        const rows: string[][] = [header]
        let cursor = i + 2
        while (cursor < lines.length && isTableLine(lines[cursor])) {
          const cells = splitTableRow(lines[cursor])
          rows.push(header.map((_, column) => cells[column] ?? ''))
          cursor += 1
        }
        nodes.push(renderTable(rows, aligns, `${partIndex}-t${count++}`))
        i = cursor - 1
        continue
      }
    }
    if (line.trim() === '') { flushParagraph(); continue }
    paragraph.push(line)
  }
  flushParagraph()
  return nodes
}

function renderMessageText(text: string): React.ReactNode {
  const fenced = text.split(/(```[\s\S]*?```)/g)
  return fenced.map((part, index) => {
    if (part.startsWith('```')) {
      const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '')
      return <pre key={index}><code>{code}</code></pre>
    }
    return renderTextBlocks(part, index)
  })
}

/** 消息流任务卡需要的任务数据与动作；缺任务数据时卡片仍以消息文本渲染（单卡入口不消失）。 */
export interface MessageTaskInfo {
  task?: TaskView
  /** 汇总卡当前批次的条目；batchId + limit 由上层按展开态请求。 */
  tasks?: TaskView[]
  total?: number
  expanded?: boolean
  busy?: boolean
  error?: string
  onOpen?: () => void
  onOpenTask?: (task: TaskView) => void
  /** 汇总卡整卡点击：进入右栏任务标签（点击单条任务行走 onOpenTask 进详情）。 */
  onOpenSummary?: () => void
  /** 汇总卡（batchId）加载失败的原因与重试；与单卡的 error 分开，避免互相覆盖。 */
  summaryError?: string
  onRetrySummary?: () => void
  onToggle?: () => void
  onConfirm?: () => void
  onCancel?: () => void
  onResume?: () => void
}

export function MessageItem({ message, onCardAction, readOnly = false, onRetry, taskInfo }: { message: Message; onCardAction: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void>; readOnly?: boolean; onRetry?: (message: Message) => void; taskInfo?: MessageTaskInfo }): React.ReactNode {
  const [streaming, setStreaming] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  // 复制态 1.5s 复位：卸载时必须清掉，否则 jsdom 环境回收后定时器仍触发 setState（window is not defined）。
  const copyResetTimer = useRef<number | null>(null)
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopyState('copied')
    } catch {
      try {
        const area = document.createElement('textarea')
        area.value = message.text
        area.style.position = 'fixed'; area.style.opacity = '0'
        document.body.appendChild(area); area.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(area)
        setCopyState(ok ? 'copied' : 'error')
      } catch { setCopyState('error') }
    }
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current)
    copyResetTimer.current = window.setTimeout(() => setCopyState('idle'), 1500)
  }
  useEffect(() => () => {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current)
  }, [])
  useEffect(() => {
    setStreaming(message.status === 'streaming')
  }, [message.status])
  const isUser = message.role === 'user'
  // 后端把回复失败落成 status:"error"（chat/model.go:67 StatusError），历史数据里还有 StatusFailed。
  // 两种都按失败处理，否则界面只剩一个空气泡，既没有徽标也没有重试入口（AC-CONV-004-01）。
  const failed = message.status === 'failed' || message.status === 'error'
  const rawCategory = message.category === 'delivery' ? 'progress' : message.category
  const categoryKey = isUser ? '' : (rawCategory && CATEGORY_LABEL[rawCategory] ? rawCategory : 'consultation')
  const category = categoryKey ? CATEGORY_LABEL[categoryKey] : ''
  // 任务卡分支必须早于类别回退。批量消息同时带首个任务的 taskId 与 batchId、taskCount，
  // 判定顺序必须是「batchId + taskCount>1」先于 taskId，否则汇总卡分支永远走不到（AC-CONV-009-02、§17.5）。
  if (!isUser && message.category === 'task') {
    const batchSummary = Boolean(message.batchId) && (message.taskCount ?? 0) > 1
    if (batchSummary || (!message.taskId && message.batchId)) {
      return (
        <TaskSummaryCard
          message={message}
          tasks={taskInfo?.tasks ?? []}
          total={taskInfo?.total ?? message.taskCount ?? 0}
          expanded={taskInfo?.expanded}
          error={taskInfo?.summaryError}
          onToggle={taskInfo?.onToggle}
          onRetry={taskInfo?.onRetrySummary}
          onOpen={taskInfo?.onOpenSummary}
          onOpenTask={taskInfo?.onOpenTask}
        />
      )
    }
    if (message.taskId) {
      return (
        <TaskMessageCard
          message={message}
          task={taskInfo?.task}
          readOnly={readOnly}
          busy={taskInfo?.busy}
          error={taskInfo?.error}
          onOpen={() => { if (taskInfo?.task) taskInfo.onOpenTask?.(taskInfo.task); else taskInfo?.onOpen?.() }}
          onConfirm={taskInfo?.onConfirm}
          onCancel={taskInfo?.onCancel}
          onResume={taskInfo?.onResume}
        />
      )
    }
  }
  return (
    <article className={`msg ${isUser ? 'from-user' : 'from-agent'}`} data-message-id={message.id} data-task-id={message.taskId} data-session-id={message.sessionId}>
      <span className="msg-avatar">{isUser ? '你' : '墨'}</span>
      <div className="msg-body">
        <div className="msg-meta"><b>{isUser ? '你' : '司墨'}</b><span>·</span>{category && <><span className={`tag msg-tag msg-tag-${categoryKey}`}>{category}</span><span>·</span></>}<span>{formatTime(message.at)}</span>{failed && <span className="badge danger">失败</span>}{message.text.trim() && <button type="button" className="msg-copy" onClick={() => void copy()} aria-label="复制消息">{copyState === 'copied' ? '已复制' : copyState === 'error' ? '复制失败' : '复制'}</button>}</div>
        <div className="msg-text">
          {message.text.trim() ? <>{renderMessageText(message.text)}{streaming && <p><span className="stream-caret" aria-hidden="true" /></p>}</> : streaming ? <p><span className="stream-caret" aria-hidden="true" /></p> : failed ? <p className="err-text">回复生成失败，未返回内容。</p> : null}
          {failed && onRetry && !readOnly && <button className="btn sm" type="button" onClick={() => onRetry(message)}>重试</button>}
          {(message.cards ?? []).map((card) => <CardBlock key={card.id} card={card} onSubmit={onCardAction} readOnly={readOnly} />)}
        </div>
      </div>
    </article>
  )
}

export function CardBlock({ card, onSubmit, readOnly = false }: { card: Card; onSubmit: (card: Card, action: string, payload: Record<string, unknown>) => Promise<void>; readOnly?: boolean }): React.ReactNode {
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const blocks = card.schema.blocks ?? []
  const form = blocks.find((block) => block.type === 'form')
  const fields = (form?.props?.fields as Array<{ kind: string; label: string; name: string; options?: string[] }> | undefined) ?? []
  const action = form?.actions?.[0]?.id ?? 'submit'
  const disabled = busy || readOnly || card.status !== 'active'
  return (
    <div className="card-block" data-kind="card">
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
                  <select id={id} className="select" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)}>
                    <option value="">请选择…</option>
                    {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.kind === 'textarea' ? (
                  <textarea id={id} className="textarea" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} />
                ) : (
                  <input id={id} className="input" disabled={readOnly} value={value} onChange={(event) => update(event.target.value)} />
                )}
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="card-error" role="alert">{error}</p>}
      <div className="card-actions">
        <button className="btn" type="button" disabled={busy || readOnly} onClick={() => setValues({})}>取消</button>
        <button className="send" type="button" disabled={disabled} onClick={() => {
          setBusy(true)
          setError('')
          void onSubmit(card, action, values).catch((err: unknown) => setError(err instanceof Error ? err.message : '提交失败')).finally(() => setBusy(false))
        }}>{busy ? '提交中…' : error ? '重试' : '确认'}</button>
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

export type TimelineTipState = 'hidden' | 'visible' | 'edge-clamped'

export function TimelineTip({ open, anchorRef, sender, sessionTitle, timeLabel, summary, fallbackLabel, category, onClose, onStateChange }: {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  sender: 'user' | 'agent'
  sessionTitle: string
  timeLabel: string
  summary: string
  fallbackLabel?: string
  category?: string
  onClose: () => void
  onStateChange?: (state: TimelineTipState) => void
}): React.ReactNode {
  const tipRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const [state, setState] = useState<TimelineTipState>('hidden')

  useLayoutEffect(() => {
    if (!open) {
      setState('hidden')
      onStateChange?.('hidden')
      return
    }
    const update = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      const width = Math.min(236, window.innerWidth - 16)
      const height = tipRef.current?.offsetHeight ?? 76
      let left = rect.right + 8
      let clamped = false
      if (left + width > window.innerWidth - 8) {
        left = rect.left - width - 8
        clamped = true
      }
      if (left < 8) { left = 8; clamped = true }
      let top = rect.top + rect.height / 2 - height / 2
      if (top < 8) { top = 8; clamped = true }
      if (top + height > window.innerHeight - 8) { top = window.innerHeight - height - 8; clamped = true }
      setPos({ left, top })
      const next: TimelineTipState = clamped ? 'edge-clamped' : 'visible'
      setState(next)
      onStateChange?.(next)
    }
    update()
    const raf = requestAnimationFrame(update)
    const observer = typeof ResizeObserver !== 'undefined' && tipRef.current ? new ResizeObserver(update) : null
    observer?.observe(tipRef.current as Element)
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      observer?.disconnect()
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef, sender, sessionTitle, timeLabel, summary, onStateChange])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div ref={tipRef} id="timeline-tip" className="timeline-tip-surface" role="tooltip" style={{ left: pos.left, top: pos.top }} data-state={state}>
      <div className="timeline-tip-meta"><b>{sender === 'user' ? '你' : '司墨'}</b><span>·</span><span className="session">{sessionTitle}</span>{category && <><span>·</span><span className="tag">{category}</span></>}<span>·</span><span className="time">{timeLabel}</span></div>
      <div className="timeline-tip-summary">{summary || fallbackLabel || '（消息内容为空）'}</div>
    </div>,
    document.body,
  )
}

/**
 * 时间轴整列命中：把指针的 clientY 映射到纵向最近的刻度下标。
 *
 * 刻度自身 pointer-events:none，命中判定完全由轨道容器按各刻度的真实布局中心
 * （getBoundingClientRect，客户区坐标）计算，不使用 elementFromPoint。原因是 6px
 * 间距下逐条 44×44 热区必然重叠 7 层，物理覆盖判定谁在上谁赢，点击会跳到相邻条。
 * 两个刻度正中间时取下标较小者（上方），同一坐标的归属因此是确定的。
 * 列内越界（高于首条/低于末条）由最近端点兜底，分别返回首/末下标。
 */
export function nearestTickIndex(bars: ReadonlyArray<HTMLElement | null>, clientY: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index]
    if (!bar) continue
    const rect = bar.getBoundingClientRect()
    const distance = Math.abs(rect.top + rect.height / 2 - clientY)
    if (distance < bestDistance) { bestDistance = distance; best = index }
  }
  return best
}

export function Timeline({ messages, active, onJump }: { messages: Message[]; active: number; onJump: (index: number) => void }): React.ReactNode {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const barsRef = useRef<Array<HTMLButtonElement | null>>([])
  const anchorRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const first = messages[0]
  const clearShow = (): void => { if (showTimer.current !== null) { window.clearTimeout(showTimer.current); showTimer.current = null } }
  const clearClose = (): void => { if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const openTip = (index: number): void => {
    clearShow()
    clearClose()
    anchorRef.current = barsRef.current[index] ?? null
    setTipIndex(index)
    setTipOpen(true)
  }
  const scheduleOpen = (index: number): void => {
    clearClose()
    clearShow()
    showTimer.current = window.setTimeout(() => openTip(index), 120)
  }
  const scheduleClose = (): void => {
    clearShow()
    clearClose()
    closeTimer.current = window.setTimeout(() => setTipOpen(false), 200)
  }
  const jumpTo = (index: number): void => { if (index >= 0 && index < messages.length) onJump(index) }
  const onRailPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    // 触摸没有悬停语义：只在鼠标/笔下更新映射与浮层；点击仍按 clientY 映射。
    if (event.pointerType === 'touch') return
    const index = nearestTickIndex(barsRef.current, event.clientY)
    if (index < 0 || index === hoverIndex) return
    setHoverIndex(index)
    scheduleOpen(index)
  }
  const onRailClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    jumpTo(nearestTickIndex(barsRef.current, event.clientY))
  }
  useEffect(() => () => { clearShow(); clearClose() }, [])
  const tipMessage = tipIndex !== null ? messages[tipIndex] : null
  return (
    <div className="timeline" aria-label="消息时间轴" onMouseLeave={() => { setHoverIndex(null); scheduleClose() }} onPointerMove={onRailPointerMove} onClick={onRailClick} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose() }} onKeyDown={(event) => { if (event.key === 'Escape') { clearShow(); clearClose(); setTipOpen(false) } }}>
      <div className="tl-track">
        {first && <span className="tl-date">{formatDate(first.at)}</span>}
        {messages.map((message, index) => (
          <button
            key={message.id}
            ref={(element) => { barsRef.current[index] = element }}
            type="button"
            className={`tl-bar ${message.role === 'user' ? 'is-user' : 'is-agent'} ${index === active ? 'is-current' : ''} ${index === hoverIndex ? 'is-hover' : ''}`}
            onClick={(event) => { event.stopPropagation(); jumpTo(index) }}
            onFocus={() => openTip(index)}
            onBlur={scheduleClose}
            aria-describedby={tipOpen && tipIndex === index ? 'timeline-tip' : undefined}
            aria-label={`跳转到第 ${index + 1} 条消息`}
          />
        ))}
      </div>
      {tipOpen && tipMessage && (
        <TimelineTip
          key={tipIndex ?? 0}
          open={tipOpen}
          anchorRef={anchorRef}
          sender={tipMessage.role === 'user' ? 'user' : 'agent'}
          sessionTitle={tipMessage.sessionTitle ?? '主会话'}
          timeLabel={formatTime(tipMessage.at)}
          summary={tipMessage.text}
          onClose={() => { clearShow(); clearClose(); setTipOpen(false) }}
        />
      )}
    </div>
  )
}

export interface TimelineGroupMessage {
  id: string
  sessionId: string
  sessionTitle: string
  sessionOrder: number
  isCurrentSession: boolean
  role: 'user' | 'agent'
  category?: 'clarification' | 'progress' | 'confirmation' | 'result' | 'error'
  at: number
  dateKey: string
  summary?: string
}

export function TimelineGroups({ messages, currentSessionId, activeMessageId, onJump, ariaLabel = '消息时间轴' }: {
  messages: readonly TimelineGroupMessage[]
  currentSessionId: string
  activeMessageId?: string
  onJump: (messageId: string) => void
  ariaLabel?: string
}): React.ReactNode {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const barsRef = useRef<Array<HTMLButtonElement | null>>([])
  const anchorRef = useRef<HTMLElement | null>(null)
  const showTimer = useRef<number | null>(null)
  const closeTimer = useRef<number | null>(null)
  const sorted = [...messages].sort((a, b) => a.sessionOrder - b.sessionOrder || a.dateKey.localeCompare(b.dateKey) || a.at - b.at)
  const flat = sorted
  const clearShow = (): void => { if (showTimer.current !== null) { window.clearTimeout(showTimer.current); showTimer.current = null } }
  const clearClose = (): void => { if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null } }
  const openTip = (index: number): void => { clearShow(); clearClose(); anchorRef.current = barsRef.current[index] ?? null; setTipIndex(index); setTipOpen(true) }
  const scheduleOpen = (index: number): void => { clearClose(); clearShow(); showTimer.current = window.setTimeout(() => openTip(index), 120) }
  const scheduleClose = (): void => { clearShow(); clearClose(); closeTimer.current = window.setTimeout(() => setTipOpen(false), 200) }
  const jumpTo = (index: number): void => { const message = flat[index]; if (message) onJump(message.id) }
  const onRailPointerMove = (event: React.PointerEvent<HTMLElement>): void => {
    // 整列一个命中面：按 clientY 映射到最近刻度，触摸没有悬停语义所以只处理鼠标/笔。
    if (event.pointerType === 'touch') return
    const index = nearestTickIndex(barsRef.current, event.clientY)
    if (index < 0 || index === hoverIndex) return
    setHoverIndex(index)
    scheduleOpen(index)
  }
  const onRailClick = (event: React.MouseEvent<HTMLElement>): void => {
    jumpTo(nearestTickIndex(barsRef.current, event.clientY))
  }
  useEffect(() => () => { clearShow(); clearClose() }, [])
  const categoryLabel = (category?: string): string => category ? (CATEGORY_LABEL[category] ?? category) : ''
  const groups: Array<{ sessionId: string; title: string; current: boolean; messages: Array<{ message: TimelineGroupMessage; index: number }> }> = []
  let cursor = 0
  for (const message of sorted) {
    let group = groups[groups.length - 1]
    if (!group || group.sessionId !== message.sessionId) {
      group = { sessionId: message.sessionId, title: message.sessionTitle, current: message.sessionId === currentSessionId, messages: [] }
      groups.push(group)
    }
    group.messages.push({ message, index: cursor++ })
  }
  const tipMessage = tipIndex !== null ? flat[tipIndex] : null
  const onTimelineKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    const active = document.activeElement as HTMLElement | null
    const index = barsRef.current.findIndex((bar) => bar === active)
    if (index < 0) return
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(barsRef.current.length - 1, index + 1)
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = barsRef.current.length - 1
    else if (event.key === 'Escape') { clearShow(); clearClose(); setTipOpen(false); return }
    else return
    event.preventDefault()
    barsRef.current[next]?.focus()
  }
  return (
    <nav className="timeline timeline-groups" aria-label={ariaLabel} onMouseLeave={() => { setHoverIndex(null); scheduleClose() }} onPointerMove={onRailPointerMove} onClick={onRailClick} onKeyDown={onTimelineKeyDown} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) scheduleClose() }}>
      <div className="tlg-track">
        {groups.map((group) => (
          <div className={`tlg-session ${group.current ? 'is-current-session' : 'is-ancestor-session'}`} key={group.sessionId} aria-label={`${group.current ? '当前会话' : '上级会话'}：${group.title}`}>
            {group.messages.map(({ message, index }) => (
              <button
                key={message.id}
                ref={(element) => { barsRef.current[index] = element }}
                type="button"
                className={`tl-bar ${message.role === 'user' ? 'is-user' : 'is-agent'} ${message.id === activeMessageId ? 'is-current' : ''} ${index === hoverIndex ? 'is-hover' : ''}`}
                aria-current={message.id === activeMessageId ? 'true' : undefined}
                aria-describedby={tipOpen && tipIndex === index ? 'timeline-tip' : undefined}
                aria-label={`${message.role === 'user' ? '你' : '司墨'} · ${message.sessionTitle} · ${formatTime(message.at)}`}
                onClick={(event) => { event.stopPropagation(); jumpTo(index) }}
                onFocus={() => openTip(index)}
                onBlur={scheduleClose}
              />
            ))}
          </div>
        ))}
      </div>
      {tipOpen && tipMessage && (
        <TimelineTip key={tipIndex ?? 0} open anchorRef={anchorRef} sender={tipMessage.role} sessionTitle={tipMessage.sessionTitle} timeLabel={formatTime(tipMessage.at)} summary={tipMessage.summary ?? ''} category={categoryLabel(tipMessage.category)} onClose={() => { clearShow(); clearClose(); setTipOpen(false) }} />
      )}
    </nav>
  )
}

export function Composer({ disabled, streaming, onSend, onStop, sendError, prefill }: { disabled: boolean; streaming: boolean; onSend: (text: string) => Promise<void>; onStop: () => void; sendError?: string; prefill?: { text: string; seq: number } }): React.ReactNode {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [sending, setSending] = useState(false)
  const [localError, setLocalError] = useState('')
  // 失败消息的「重试」只把上一条用户消息填回输入框：后端没有回复级重试接口，
  // 直接重发 /api/chat 会多落一条用户消息（chat/loop.go startTurn 每次新建），所以交给用户确认后发送。
  useEffect(() => {
    if (!prefill) return
    setText(prefill.text)
    setLocalError('')
    const area = textareaRef.current
    if (area) {
      area.focus()
      area.setSelectionRange(prefill.text.length, prefill.text.length)
    }
  }, [prefill])
  const [sendMode, setSendMode] = useState<'enter' | 'shift-enter'>(() => {
    const storageKey = 'simo.composer.sendMode'
    const legacyKey = 'simo.composer.send-mode'
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === 'enter' || stored === 'shift-enter') return stored
      const legacy = localStorage.getItem(legacyKey)
      const migrated = legacy === 'enter-send' ? 'enter' : legacy === 'enter-newline' ? 'shift-enter' : null
      if (migrated) { localStorage.setItem(storageKey, migrated); localStorage.removeItem(legacyKey); return migrated }
    } catch { /* localStorage 不可用时仅内存态 */ }
    return 'enter'
  })
  const composingRef = useRef(false)
  const compositionEndAtRef = useRef(0)
  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      // 构造器存在也可能抛错（隐私模式、沙箱）：与“不支持”同一条降级路径，只保留 storage 事件。
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('simo.composer.sendMode.v1')
    } catch { channel = null }
    const apply = (value: string | null): void => { if (value === 'enter' || value === 'shift-enter') setSendMode(value) }
    const onMessage = (event: MessageEvent): void => apply(String(event.data))
    const onStorage = (event: StorageEvent): void => { if (event.key === 'simo.composer.sendMode') apply(event.newValue) }
    channel?.addEventListener('message', onMessage)
    window.addEventListener('storage', onStorage)
    return () => { channel?.removeEventListener('message', onMessage); channel?.close(); window.removeEventListener('storage', onStorage) }
  }, [])
  const setMode = (mode: 'enter' | 'shift-enter'): void => {
    setSendMode(mode)
    try { localStorage.setItem('simo.composer.sendMode', mode) } catch { /* localStorage 不可用时仅本标签 */ }
    try { const channel = new BroadcastChannel('simo.composer.sendMode.v1'); channel.postMessage(mode); channel.close() } catch { /* 无 BroadcastChannel 时退化 */ }
  }
  async function submit(): Promise<void> {
    const value = text.trim()
    if (!value || disabled || sending) return
    setText('')
    setLocalError('')
    setSending(true)
    try {
      await onSend(value)
    } catch (err) {
      setText(value)
      setLocalError(err instanceof Error ? err.message : '发送失败，请重试')
    } finally {
      setSending(false)
    }
  }
  const hint = sendMode === 'enter' ? 'Enter 发送，Shift+Enter 换行' : 'Enter 换行，Shift+Enter 发送'
  const ariaAction = sendMode === 'enter' ? '切换发送方式，当前 Enter 发送；按下后改为 Shift+Enter 发送' : '切换发送方式，当前 Shift+Enter 发送；按下后改为 Enter 发送'
  return (
    <div className="composer">
      <div className="composer-box">
        <textarea ref={textareaRef} value={text} onChange={(event) => setText(event.target.value)} placeholder="给司墨发消息…" aria-label="消息输入框" disabled={disabled}
          onCompositionStart={() => { composingRef.current = true }}
          onCompositionEnd={() => { composingRef.current = false; compositionEndAtRef.current = Date.now() }}
          onKeyDown={(event) => {
            if (disabled) return
            if (event.nativeEvent.isComposing || composingRef.current) return
            if (event.key !== 'Enter') return
            if (Date.now() - compositionEndAtRef.current < 50) { event.preventDefault(); return }
            const withModifier = event.metaKey || event.ctrlKey
            if (withModifier || (sendMode === 'enter' && !event.shiftKey) || (sendMode === 'shift-enter' && event.shiftKey)) {
              event.preventDefault()
              void submit()
            }
          }} />
        {(localError || sendError) && <p className="composer-error" role="alert">{localError || sendError}</p>}
        <div className="composer-foot">
          <div className="composer-left"><Icon name="file" /> <span>支持 Markdown 格式</span></div>
          <div className="composer-right">
            <span className="composer-hint-group">
              {!disabled && <button className="composer-hint-icon" type="button" aria-pressed={sendMode === 'shift-enter'} aria-label={ariaAction} onClick={() => setMode(sendMode === 'enter' ? 'shift-enter' : 'enter')}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3v5.2c0 1.2 1 2.1 2.1 2.1H12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M9.5 7.5 12 10l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>}
              <span className="composer-hint composer-send-mode-hint" aria-live="polite">{hint}</span>
            </span>
            {streaming && <button className="btn sm composer-stop" type="button" onClick={onStop}>停止</button>}
            <button className="send" type="button" disabled={disabled || sending || streaming || !text.trim()} onClick={() => void submit()}>{sending ? '发送中…' : '发送'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function StatusDot({ tone }: { tone: 'done' | 'running' | 'pending' }): React.ReactNode {
  return <i className={`exec-dot ${tone}`} aria-hidden="true" />
}

export function TaskItem({ task, tone, onClick }: { task: Task; tone: 'done' | 'running' | 'pending'; onClick?: () => void }): React.ReactNode {
  return (
    <button type="button" className="exec-row task-row" onClick={onClick} title={onClick ? '定位到相关消息' : undefined}>
      <StatusDot tone={tone} />
      <span className="exec-title" title={task.title}>{task.title}</span>
      <span className="exec-time">{formatTime(task.createdAt)}</span>
    </button>
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

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }): React.ReactNode {
  return (
    <div className="overview-empty">
      <span className="overview-empty-mark" aria-hidden="true">·</span>
      <div><b>{title}</b>{description && <span>{description}</span>}{action}</div>
    </div>
  )
}

export function LoadingState({ label = '加载中…' }: { label?: string }): React.ReactNode {
  return <div className="state-block state-loading" role="status"><span className="state-mark" aria-hidden="true" /><p>{label}</p></div>
}

export function ErrorState({ title = '加载失败', description, onRetry }: { title?: string; description?: string; onRetry?: () => void }): React.ReactNode {
  return <div className="state-block state-error" role="alert"><span className="state-mark" aria-hidden="true" /><b>{title}</b>{description && <p>{description}</p>}{onRetry && <button className="btn sm" type="button" onClick={onRetry}>重试</button>}</div>
}

export function DeliverableItem({ artifact, onOpen, downloadUrl }: { artifact: Artifact; onOpen?: () => void; downloadUrl?: string }): React.ReactNode {
  return (
    <div className="deliverable-line">
      <button type="button" className="exec-row deliverable-row" onClick={onOpen} title={onOpen ? '打开交付物' : undefined}>
        <span className="deliverable-icon"><Icon name="file" size={14} /></span>
        <span className="exec-title" title={artifact.name}>{artifact.name}</span>
        <span className="exec-time">{formatTime(artifact.createdAt)}</span>
      </button>
      {downloadUrl && <a className="download-link" href={downloadUrl} download aria-label={`下载 ${artifact.name}`}>下载</a>}
    </div>
  )
}

export function ExecutionGroup({ title, tasks, total, defaultCount, tone, emptyTitle, emptyDescription, onTaskClick, onExpandAll, groupError, onRetryGroup }: { title: string; tasks: Task[]; total?: number; defaultCount: number; tone: 'done' | 'running' | 'pending'; emptyTitle: string; emptyDescription: string; onTaskClick?: (task: Task) => void; onExpandAll?: () => void; groupError?: string; onRetryGroup?: () => void }): React.ReactNode {
  const [expanded, setExpanded] = useState(false)
  const totalCount = Math.max(total ?? tasks.length, tasks.length)
  const visible = expanded ? tasks : tasks.slice(0, defaultCount)
  const shown = expanded ? tasks.length : Math.min(defaultCount, tasks.length)
  // 展开时若接口只返回了首页（total > items），先请上层按合同上限补取；补取后展开态沿用，计数随 items 变为 n/n。
  const toggle = (): void => {
    const next = !expanded
    setExpanded(next)
    if (next && tasks.length < totalCount) onExpandAll?.()
  }
  return (
    <div className={`exec-group ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" className="exec-head" aria-expanded={expanded} onClick={toggle}>
        <span className="exec-toggle">{expanded ? '▾' : '▸'}</span><span className="exec-name">{title}</span><span className="exec-count">{`${shown}/${totalCount}`}</span>
      </button>
      {groupError && (
        <div className="exec-group-error" role="alert">
          <span className="exec-group-error-text">{groupError}</span>
          {onRetryGroup && <button className="btn sm" type="button" onClick={onRetryGroup}>重试</button>}
        </div>
      )}
      {visible.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : (
        <List>{visible.map((task) => <TaskItem key={task.id} task={task} tone={tone} onClick={onTaskClick ? () => onTaskClick(task) : undefined} />)}</List>
      )}
    </div>
  )
}

export function ConversationPanel({ timeline, children, state = 'ready', empty, error, onRetry, scrollRef, onScroll, density = 'normal', ariaLabel = '当前会话消息' }: {
  timeline?: React.ReactNode
  children: React.ReactNode
  state?: 'ready' | 'loading' | 'empty' | 'error'
  empty?: React.ReactNode
  error?: React.ReactNode
  onRetry?: () => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: () => void
  density?: 'normal' | 'compact'
  ariaLabel?: string
}): React.ReactNode {
  return (
    <section className={`conversation-panel is-${state}${density === 'compact' ? ' is-compact' : ''}`} aria-label={ariaLabel}>
      {state === 'ready' && <>{timeline}<div className="conversation-scroll" ref={scrollRef} onScroll={onScroll}>{children}</div></>}
      {state !== 'ready' && <div className="conversation-state">{state === 'loading' ? <LoadingState label="消息加载中…" /> : state === 'empty' ? (empty ?? <EmptyState title="暂无消息" description="发送第一条消息开始对话。" />) : (error ?? <ErrorState title="消息加载失败" onRetry={onRetry} />)}</div>}
    </section>
  )
}

export type RightTab = 'overview' | 'tasks' | 'deliverables'
export const RIGHT_TABS: Array<{ key: RightTab; label: string; icon: string }> = [
  { key: 'overview', label: '概览', icon: '☰' },
  { key: 'tasks', label: '任务', icon: '◷' },
  { key: 'deliverables', label: '交付物', icon: '▤' },
]
const INSP_COLLAPSED_PREFIX = 'simo.insp.collapsed.'
const INSP_OVERVIEW_PREFIX = 'simo.insp.overview.'

function readStored(key: string): string | null {
  try { return window.localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string): void {
  try { window.localStorage.setItem(key, value) } catch { /* 隐私模式或配额满时退化为内存态 */ }
}
/** 收起状态按会话持久化：只在 sessionId 非空时读写，缺失按展开处理（§17.2.3）。 */
export function readInspCollapsed(sessionId?: string): boolean {
  if (!sessionId) return false
  return readStored(`${INSP_COLLAPSED_PREFIX}${sessionId}`) === '1'
}
export function saveInspCollapsed(sessionId: string | undefined, collapsed: boolean): void {
  if (!sessionId) return
  writeStored(`${INSP_COLLAPSED_PREFIX}${sessionId}`, collapsed ? '1' : '0')
}
/** 概览四块的折叠记忆，值为已收起块的 id 数组（§17.6）。 */
export function readInspOverviewCollapsed(sessionId?: string): string[] {
  if (!sessionId) return []
  const raw = readStored(`${INSP_OVERVIEW_PREFIX}${sessionId}`)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}
export function saveInspOverviewCollapsed(sessionId: string | undefined, blocks: string[]): void {
  if (!sessionId) return
  writeStored(`${INSP_OVERVIEW_PREFIX}${sessionId}`, JSON.stringify(blocks))
}

/** 概览四块：固定顺序 目标 / 输入 / 任务 / 交付物，块头可折叠且按会话记忆。 */
export function OverviewContent({ session, projection, loading, error = '', onRetry, onTaskClick, onArtifactOpen, counts, onJumpTasks, onJumpDeliverables }: {
  session: Session | null
  projection: import('../types').SessionSpecProjection | null
  loading: boolean
  error?: string
  onRetry?: () => void
  onTaskClick?: (task: { id: string; title: string; messageId?: string }) => void
  onArtifactOpen?: (id: string) => void
  counts?: TaskCounts
  /** 概览块里的「还有 N 个」跳到任务标签。 */
  onJumpTasks?: () => void
  /** 交付物块的「还有 N 个」跳到交付物标签。 */
  onJumpDeliverables?: () => void
}): React.ReactNode {
  const statusLabel = projection ? ({ completed: '已完成', active: '进行中', draft: '草稿', blocked: '阻塞', done: '已完成' }[projection.status] ?? projection.status) : ''
  const [collapsedBlocks, setCollapsedBlocks] = useState<string[]>(() => readInspOverviewCollapsed(session?.id))
  useEffect(() => {
    setCollapsedBlocks(readInspOverviewCollapsed(session?.id))
  }, [session?.id])
  const toggleBlock = (block: string): void => {
    setCollapsedBlocks((prev) => {
      const next = prev.includes(block) ? prev.filter((item) => item !== block) : [...prev, block]
      saveInspOverviewCollapsed(session?.id, next)
      return next
    })
  }
  const isDraft = session?.draft === true
  if (!session) return <p className="insp-placeholder">未选择会话</p>
  if (isDraft) return <EmptyState title="目标与执行态待生成" description="发送第一条消息后生成目标与执行态" />
  const doneTotal = projection?.tasks.done.total ?? 0
  const runningTotal = projection?.tasks.running.total ?? 0
  const pendingTotal = projection?.tasks.pending.total ?? 0
  const taskCounts: TaskCounts = counts ?? { all: doneTotal + runningTotal + pendingTotal, done: doneTotal, running: runningTotal, pending: pendingTotal, failed: 0 }
  const overviewTasks: Array<{ id: string; title: string; state: string; messageId?: string }> = [
    ...(projection?.tasks.running.items ?? []),
    ...(projection?.tasks.pending.items ?? []),
    ...(projection?.tasks.done.items ?? []),
  ]
  const visibleTasks = overviewTasks.slice(0, 2)
  const moreTasks = Math.max(0, taskCounts.all - visibleTasks.length)
  const deliverables = projection?.deliverables.items ?? []
  const deliverablesTotal = projection?.deliverables.total ?? deliverables.length
  const visibleDeliverables = deliverables.slice(0, 2)
  const moreDeliverables = Math.max(0, deliverablesTotal - visibleDeliverables.length)
  const collapsed = (block: string): boolean => collapsedBlocks.includes(block)
  const blockHead = (block: string, title: string, meta?: React.ReactNode): React.ReactNode => (
    <button type="button" className="insp-block-head" aria-expanded={!collapsed(block)} aria-controls={`insp-block-${block}`} onClick={() => toggleBlock(block)}>
      <b>{title}</b>
      {meta !== undefined && <span>{meta}</span>}
    </button>
  )
  return (
    <>
      {loading && <LoadingState label="右栏加载中…" />}
      {!loading && error && <ErrorState title="右栏加载失败" description={error} onRetry={onRetry} />}
      {!loading && !error && !projection && <EmptyState title="暂无会话投影" description="当前会话还没有可用的 SessionSpec。" />}
      {!loading && !error && projection && (
        <>
          <div className="insp-spec-status"><b>{statusLabel}</b><span>rev {projection.revision}</span>{projection.pendingConfirmations.total > 0 && <em>待确认 {projection.pendingConfirmations.total}</em>}</div>
          <section className="insp-block" data-block="goal">
            {blockHead('goal', '目标')}
            {!collapsed('goal') && <div className="insp-block-body" id="insp-block-goal"><p className="insp-text">{projection.goal || (projection.status === 'draft' ? '目标待生成。' : '本会话未记录目标。')}</p></div>}
          </section>
          <section className="insp-block" data-block="input">
            {blockHead('input', '输入')}
            {!collapsed('input') && <div className="insp-block-body" id="insp-block-input"><p className="insp-text">{projection.constraints.length || projection.inputs.length ? [...projection.constraints, ...projection.inputs].join(' · ') : '暂无输入约束。'}</p></div>}
          </section>
          <section className="insp-block" data-block="tasks">
            {blockHead('tasks', '任务', `${taskCounts.all}`)}
            {!collapsed('tasks') && (
              <div className="insp-block-body" id="insp-block-tasks">
                <p className="insp-task-counts">{taskCounts.running} 进行中 / {taskCounts.pending} 未开始 / {taskCounts.done} 已完成 / {taskCounts.failed} 失败</p>
                {visibleTasks.map((task) => (
                  <button key={task.id} type="button" className="exec-row" data-task-id={task.id} onClick={() => onTaskClick?.({ id: task.id, title: task.title, messageId: task.messageId })}>
                    <span className={`exec-dot ${task.state}`} aria-hidden="true" />
                    <span className="exec-title" title={task.title}>{task.title}</span>
                    <span className="exec-time">{task.state === 'done' ? '已完成' : task.state === 'running' ? '进行中' : task.state === 'failed' ? '失败' : '未开始'}</span>
                  </button>
                ))}
                {visibleTasks.length === 0 && <p className="insp-text">本会话还没有任务。</p>}
                {moreTasks > 0 && <button type="button" className="insp-more" onClick={onJumpTasks}>还有 {moreTasks} 个</button>}
              </div>
            )}
          </section>
          <section className="insp-block" data-block="deliverables">
            {blockHead('deliverables', '交付物', `${deliverablesTotal}`)}
            {!collapsed('deliverables') && (
              <div className="insp-block-body" id="insp-block-deliverables">
                {visibleDeliverables.map((artifact) => (
                  <button key={artifact.id} type="button" className="exec-row" onClick={() => onArtifactOpen?.(artifact.id)}>
                    <span className="exec-dot done" aria-hidden="true" />
                    <span className="exec-title" title={artifact.name}>{artifact.name}</span>
                    <span className="exec-time">打开</span>
                  </button>
                ))}
                {visibleDeliverables.length === 0 && <p className="insp-text">暂无交付物。</p>}
                {moreDeliverables > 0 && <button type="button" className="insp-more" onClick={onJumpDeliverables}>还有 {moreDeliverables} 个</button>}
              </div>
            )}
          </section>
        </>
      )}
    </>
  )
}

export function OverviewPanel(props: React.ComponentProps<typeof OverviewContent>): React.ReactNode {
  return (
    <aside className="inspector" aria-label="会话右栏" data-tab="overview">
      <nav className="insp-rail" aria-label="右栏导航"><button type="button" className="active" aria-current="page">☰</button></nav>
      <div className="insp-panel"><div className="insp-body" id="insp-panel" role="region"><OverviewContent {...props} /></div></div>
    </aside>
  )
}

type RightPanelProps = React.ComponentProps<typeof OverviewContent> & {
  counts?: TaskCounts
  tasks?: TaskView[]
  tasksLoading?: boolean
  tasksError?: string
  tasksHasMore?: boolean
  taskFilter?: TaskFilter
  jumpTaskId?: string | null
  tab?: RightTab
  onTabChange?: (tab: RightTab) => void
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onTaskFilterChange?: (filter: TaskFilter) => void
  onOpenTask?: (task: TaskView) => void
  onLoadMoreTasks?: () => void
  onRetryTasks?: () => void
  deliverableGroups?: DeliverableGroup[]
  deliverablesLoading?: boolean
  deliverablesError?: string
  deliverablesHasMore?: boolean
  deliverablesTotal?: number
  deliverablesFileCount?: number
  onLoadMoreDeliverables?: () => void
  onRetryDeliverables?: () => void
  onOpenTaskById?: (taskId: string) => void
  onOpenFile?: (file: TaskFile) => void
  detail?: TaskDetailPayload | null
  /** 详情接口返回前的列表快照：外壳、模式与几何先用它成立。 */
  detailTask?: TaskView | null
  detailLoading?: boolean
  detailError?: string
  detailMode?: 'overlay' | 'drawer'
  /** 详情数据到达后要对齐的步骤行；来自任务卡/图节点跳转，空则按任务状态落点。 */
  jumpStepId?: string | null
  /** 概览「还有 N 个」：切到任务标签并把首个未显示的任务对齐到滚动口顶。 */
  onJumpToTasks?: () => void
  graphOpen?: boolean
  graph?: TaskGraphPayload | null
  graphLoading?: boolean
  graphError?: string
  onCloseDetail?: () => void
  onRetryDetail?: () => void
  onCloseGraph?: () => void
  onRetryGraph?: () => void
  /** 旧概览的「展开执行组」入口在三标签版里不再渲染，属性保留以免调用点改签名。 */
  onExpandGroup?: (kind: string) => void
  groupError?: { group: string; message: string } | null
  onRetryGroup?: () => void
}

/** 760–1023 右栏只留竖条，面板改抽屉；其余档位抽屉样式不生效，状态是空操作。 */
function isDrawerRange(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 760px) and (max-width: 1023px)').matches
}

export function RightPanel(props: RightPanelProps): React.ReactNode {
  const { session, tab, onTabChange, collapsed, onCollapsedChange, counts } = props
  const [innerTab, setInnerTab] = useState<RightTab>('overview')
  const activeTab = tab ?? innerTab
  const controlledCollapse = collapsed !== undefined
  const [innerCollapsed, setInnerCollapsed] = useState(false)
  const collapsedNow = collapsed ?? innerCollapsed
  // 抽屉档（760–1023）首次加载一律收起，只留 40px 竖条（V-CONV-008-6：点图标条才展开覆盖层）；
  // 只有本会话已有用户主动选择（存了 0/1）时才按记忆恢复。
  const [drawerOpen, setDrawerOpen] = useState(() => {
    if (!isDrawerRange() || !session?.id) return false
    return readStored(`${INSP_COLLAPSED_PREFIX}${session.id}`) === '0'
  })
  const [drawerBottom, setDrawerBottom] = useState<number | null>(null)
  // 非受控用法（组件测试、画廊）自己按会话读收起记忆；受控时由 app.tsx 统一读写。
  useEffect(() => {
    if (controlledCollapse) return
    setInnerCollapsed(isDrawerRange() ? false : readInspCollapsed(session?.id))
  }, [session?.id, controlledCollapse])
  useEffect(() => {
    if (!drawerOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawerOpen])
  useLayoutEffect(() => {
    if (!drawerOpen) { setDrawerBottom(null); return }
    const measure = (): void => {
      const composer = document.querySelector('.composer')
      const rect = composer?.getBoundingClientRect()
      setDrawerBottom(rect && rect.height > 0 ? Math.round(window.innerHeight - rect.top + 8) : null)
    }
    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    const composer = document.querySelector('.composer')
    if (observer && composer) observer.observe(composer)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [drawerOpen])
  const setCollapsed = (next: boolean): void => {
    if (!controlledCollapse) setInnerCollapsed(next)
    if (!controlledCollapse) saveInspCollapsed(session?.id, next)
    onCollapsedChange?.(next)
  }
  const selectTab = (key: RightTab): void => {
    // 零任务态：任务标签 aria-disabled，点击不切标签（F-CONV-009-04）。
    if (key === 'tasks' && (counts?.all ?? 0) === 0) return
    const drawer = isDrawerRange()
    if (drawer) {
      setDrawerOpen(true)
      if (collapsedNow) setCollapsed(false)
      setInnerTab(key)
      onTabChange?.(key)
      return
    }
    if (key === activeTab) {
      setCollapsed(!collapsedNow)
      return
    }
    setInnerTab(key)
    onTabChange?.(key)
    if (collapsedNow) setCollapsed(false)
  }
  const drawerRange = isDrawerRange()
  const drawerMode = drawerOpen || drawerRange
  // 抽屉档宽度由媒体查询决定，不读也不写收起记忆：收起态只在宽档隐藏面板（§17.2.3）。
  const visualCollapsed = collapsedNow && !drawerOpen
  const panelHidden = visualCollapsed
  const panelExpanded = !visualCollapsed
  const countsAll = counts?.all ?? 0
  const countsRunning = counts?.running ?? 0
  const closeDrawer = (): void => setDrawerOpen(false)
  const mode: 'overlay' | 'drawer' = props.detailMode ?? (drawerRange ? 'drawer' : 'overlay')
  const tabTitle = RIGHT_TABS.find((item) => item.key === activeTab)?.label ?? '概览'
  return (
    <aside
      className={drawerOpen ? 'inspector is-drawer-open' : 'inspector'}
      aria-label="会话右栏"
      data-tab={activeTab}
      data-collapsed={visualCollapsed ? 'true' : 'false'}
      data-drawer-open={drawerOpen ? 'true' : undefined}
      data-session={session ? session.id : undefined}
      style={drawerBottom === null ? undefined : ({ '--insp-drawer-bottom': `${drawerBottom}px` } as React.CSSProperties)}
    >
      <nav className="insp-rail" aria-label="右栏导航">
        {RIGHT_TABS.map((item) => {
          const active = item.key === activeTab
          const disabled = item.key === 'tasks' && countsAll === 0
          return (
            <button
              key={item.key}
              type="button"
              data-tab={item.key}
              className={active ? 'active' : undefined}
              aria-label={item.key === 'tasks' ? (badgeLabel(countsRunning) ?? '任务，0 个进行中') : item.label}
              aria-current={active ? 'page' : undefined}
              aria-expanded={active ? panelExpanded : undefined}
              aria-controls={active ? 'insp-panel' : undefined}
              aria-disabled={disabled ? true : undefined}
              title={disabled ? '本会话还没有任务' : item.label}
              onClick={() => selectTab(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.key === 'tasks' && <TaskBadge count={countsRunning} />}
            </button>
          )
        })}
      </nav>
      {/* 遮罩与面板是同级：遮罩 z-index 54 排在面板 55 之下，只盖面板之外的区域。
          放进面板内部会让它压住面板内容，鼠标点在按钮上命中的却是遮罩。 */}
      {drawerOpen ? <button type="button" className="insp-drawer-scrim" aria-label="关闭右栏" tabIndex={-1} onClick={closeDrawer} /> : null}
      <div className="insp-panel" hidden={panelHidden}>
        <div className="insp-head" hidden={panelHidden}>
          <b>{tabTitle}</b>
          <span>{activeTab === 'tasks' ? `${countsAll} 个任务` : activeTab === 'deliverables' ? `${props.deliverablesTotal ?? 0} 个交付物` : session ? '会话投影' : ''}</span>
          {drawerMode && <button type="button" className="insp-drawer-close" aria-label="关闭右栏" onClick={closeDrawer}>×</button>}
          <button type="button" className="insp-collapse" aria-label={visualCollapsed ? '展开右栏' : '收起右栏'} aria-expanded={!visualCollapsed} aria-controls="insp-panel" onClick={() => { if (drawerRange) { setDrawerOpen(false); setCollapsed(true); return } setCollapsed(!collapsedNow) }}>{visualCollapsed ? '«' : '»'}</button>
        </div>
        <div className="insp-body" id="insp-panel" role="region" hidden={panelHidden}>
          {activeTab === 'overview' ? (
            <OverviewContent
              session={session}
              projection={props.projection}
              loading={props.loading}
              error={props.error}
              onRetry={props.onRetry}
              onTaskClick={props.onTaskClick}
              onArtifactOpen={props.onArtifactOpen}
              counts={counts}
              onJumpTasks={props.onJumpToTasks ?? (() => props.onTabChange?.('tasks'))}
              onJumpDeliverables={() => props.onTabChange?.('deliverables')}
            />
          ) : activeTab === 'tasks' ? (
            <TasksTab
              tasks={props.tasks ?? []}
              counts={counts}
              filter={props.taskFilter ?? 'all'}
              loading={props.tasksLoading ?? false}
              error={props.tasksError ?? ''}
              hasMore={props.tasksHasMore ?? false}
              jumpTaskId={props.jumpTaskId ?? null}
              onFilterChange={props.onTaskFilterChange ?? (() => undefined)}
              onOpenTask={props.onOpenTask ?? (() => undefined)}
              onLoadMore={props.onLoadMoreTasks}
              onRetry={props.onRetryTasks}
            />
          ) : (
            <DeliverablesTab
              groups={props.deliverableGroups ?? []}
              loading={props.deliverablesLoading ?? false}
              error={props.deliverablesError ?? ''}
              total={props.deliverablesTotal ?? 0}
              fileCount={props.deliverablesFileCount ?? 0}
              hasMore={props.deliverablesHasMore ?? false}
              onOpenTask={props.onOpenTaskById}
              onOpenFile={props.onOpenFile}
              onLoadMore={props.onLoadMoreDeliverables}
              onRetry={props.onRetryDeliverables}
            />
          )}
        </div>
        <div className="insp-foot" hidden={panelHidden}>
          <span>任务 {countsAll} · 交付物 {props.deliverablesTotal ?? 0}</span>
        </div>
      </div>
      {(props.detail || props.detailTask) && (
        <TaskDetailLayer
          open
          detail={props.detail ?? null}
          fallbackTask={props.detailTask ?? null}
          loading={props.detailLoading ?? false}
          error={props.detailError ?? ''}
          mode={mode}
          collapsed={visualCollapsed}
          jumpStepId={props.jumpStepId ?? null}
          onClose={props.onCloseDetail ?? (() => undefined)}
          onRetry={props.onRetryDetail}
          onOpenFile={props.onOpenFile}
        />
      )}
      <TaskGraphDialog
        open={props.graphOpen ?? false}
        graph={props.graph ?? null}
        loading={props.graphLoading ?? false}
        error={props.graphError ?? ''}
        onClose={props.onCloseGraph ?? (() => undefined)}
        onRetry={props.onRetryGraph}
        onOpenTask={props.onOpenTaskById ?? (() => undefined)}
      />
    </aside>
  )
}

export interface MetricsDashboardData {
  range: string
  timezone: string
  from: number
  to: number
  totals: { ttftP50Ms: number | null; ttftP90Ms: number | null; durationP50Ms: number | null; durationP90Ms: number | null; turns: number; messages: number; tasks: number; failures: number; promptTokens: number; completionTokens: number; reasoningTokens: number; totalTokens: number }
  series: Array<{ date: string; messages: number; turns: number; tasks?: number; totalTokens: number; failures: number }>
  partialToday?: boolean
  availability?: Record<string, 'ready' | 'partial' | 'missing'>
  kpis?: { tokens?: { total: number; prompt: number; completion: number; reasoning: number }; topics?: { newSessions: number; activeSessions: number }; messages?: { total: number; user: number; agent: number }; sessions?: { total: number; active: number; archived: number }; reply?: { p50: number | null; p90: number | null; sample: number }; ttft?: { p50: number | null; p90: number | null; sample: number } }
  topics?: { newSessions: number; activeSessions: number }
  sessions?: { total: number; active: number; archived: number }
  taskQuality?: { completionRate: { value: number | null; numerator: number; denominator: number }; firstPassRate: { value: number | null; numerator: number; denominator: number }; reworkRate: { value: number | null; numerator: number; denominator: number }; response?: { p50: number | null; p90: number | null; sample: number } }
  tables?: Record<string, Array<Record<string, unknown>>>
}

export function MetricsDashboard({ state = 'ready', windowKind = '7d', data, onWindowChange, onRetry }: {
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'partial'
  windowKind?: '7d' | '30d'
  data?: MetricsDashboardData
  onWindowChange?: (value: '7d' | '30d') => void
  onRetry?: () => void
}): React.ReactNode {
  const ms = (value: number | null | undefined): string => value == null ? '—' : `${value}ms`
  const latency = (key: 'replySpeed' | 'ttft', latencyKey: 'reply' | 'ttft'): { value: string; note: string } => {
    const avail = data?.availability?.[key]
    const latencyData = data?.kpis?.[latencyKey]
    if (avail === 'missing') return { value: '待埋点', note: '埋点缺失' }
    if (avail === 'partial') return { value: '部分数据', note: '部分样本' }
    if ((latencyData?.sample ?? 0) === 0) return { value: (data?.totals.turns ?? 0) === 0 && (data?.totals.messages ?? 0) === 0 ? '无数据' : '样本不足', note: '样本不足' }
    return { value: `${ms(latencyData?.p50)} / ${ms(latencyData?.p90)}`, note: latencyKey === 'reply' ? 'turn duration' : 'first token' }
  }
  const reply = latency('replySpeed', 'reply')
  const ttft = latency('ttft', 'ttft')
  const fresh = data?.series ?? []
  return (
    <section className="metrics-dashboard" aria-label="指标仪表盘">
      <div className="metrics-head"><div><h3 className="insp-label">指标仪表盘</h3><p className="insp-text">{data ? `${data.range} · ${data.timezone} · ${new Date(data.from).toLocaleDateString('zh-CN')} → ${new Date(data.to).toLocaleString('zh-CN')}${data.partialToday ? ' · 今日未完整' : ''}` : '7/30 天窗口 · 只读聚合'}</p></div><div className="metrics-window" role="group" aria-label="指标窗口"><button type="button" className={windowKind === '7d' ? 'active' : ''} onClick={() => onWindowChange?.('7d')}>7天</button><button type="button" className={windowKind === '30d' ? 'active' : ''} onClick={() => onWindowChange?.('30d')}>30天</button></div></div>
      {state === 'loading' && <LoadingState label="指标加载中…" />}
      {state === 'error' && <ErrorState title="指标加载失败" onRetry={onRetry} />}
      {state === 'empty' && <EmptyState title="窗口内暂无指标" description="有 turn/消息/任务后这里会显示聚合数据。" />}
      {data?.availability && Object.values(data.availability).some((value) => value === 'missing') && <p className="insp-text">待埋点：{Object.entries(data.availability).filter(([, value]) => value === 'missing').map(([key]) => ({ replySpeed: '回复耗时', ttft: '首字延迟', taskReopen: '任务重开', taskAttempts: '任务尝试', taskCompletion: '任务完成', topics: '话题', sessions: '会话', taskQuality: '任务质量', tokens: 'Token' } as Record<string,string>)[key] ?? key).join('、')}</p>}
      {data?.availability && Object.values(data.availability).some((value) => value === 'partial') && <p className="insp-text">部分数据：{Object.entries(data.availability).filter(([, value]) => value === 'partial').map(([key]) => ({ replySpeed: '回复耗时', ttft: '首字延迟', taskReopen: '任务重开', taskAttempts: '任务尝试', taskCompletion: '任务完成', sessions: '会话' } as Record<string,string>)[key] ?? key).join('、')}</p>}
      {(state === 'ready' || state === 'partial') && (
        <>
          <div className="metrics-kpis">
            <div className="metric-card"><span>Token</span><b>{formatTokens(data?.kpis?.tokens?.total ?? data?.totals.totalTokens ?? 0)}</b><small>prompt {formatTokens(data?.kpis?.tokens?.prompt ?? data?.totals.promptTokens ?? 0)} · completion {formatTokens(data?.kpis?.tokens?.completion ?? data?.totals.completionTokens ?? 0)} · reasoning {formatTokens(data?.kpis?.tokens?.reasoning ?? data?.totals.reasoningTokens ?? 0)}</small></div>
            <div className="metric-card"><span>话题</span><b>{data?.kpis?.topics ? `${data.kpis.topics.newSessions} / ${data.kpis.topics.activeSessions}` : data?.topics ? `${data.topics.newSessions} / ${data.topics.activeSessions}` : '待接入'}</b><small>新增 / 活跃</small></div>
            <div className="metric-card"><span>消息</span><b>{data?.kpis?.messages?.total ?? data?.totals.messages ?? 0}</b><small>user + agent</small></div>
            <div className="metric-card"><span>会话</span><b>{data?.kpis?.sessions ? data.kpis.sessions.total : data?.sessions ? data.sessions.total : '待接入'}</b><small>{data?.kpis?.sessions ? `活跃 ${data.kpis.sessions.active} · 归档 ${data.kpis.sessions.archived}${data.availability?.sessions === 'partial' ? ' · 部分数据' : ''}` : data?.sessions ? `活跃 ${data.sessions.active} · 归档 ${data.sessions.archived}` : '数据未接入'}</small></div>
            <div className="metric-card"><span>回复 p50 / p90</span><b>{reply.value}</b><small>{reply.note}</small></div>
            <div className="metric-card"><span>TTFT p50 / p90</span><b>{ttft.value}</b><small>{ttft.note}</small></div>
          </div>
          <div className="section-title"><h2>每日趋势</h2><span>{fresh.length} 天</span></div>
          {fresh.length === 0 ? <EmptyState title="暂无趋势数据" /> : <div className="metrics-bars">{fresh.map((day) => { const max = Math.max(1, ...fresh.map((item) => item.messages)); return <div className="metrics-bar" key={day.date}><i style={{ height: `${Math.max(day.messages === 0 ? 1 : 4, Math.round(day.messages / max * 80))}px` }} /><span>{day.date.slice(5)}</span></div> })}</div>}
          <div className="section-title"><h2>任务质量</h2><span>分母为 0 不计算</span></div>
          <div className="metrics-rates">
            <span>完成率 {data?.taskQuality?.completionRate.value == null ? '无数据' : `${(data.taskQuality.completionRate.value * 100).toFixed(1)}% (${data.taskQuality.completionRate.numerator}/${data.taskQuality.completionRate.denominator})`}{data?.availability?.taskCompletion === 'partial' && <em className="metrics-badge">部分数据</em>}{data?.availability?.taskCompletion === 'missing' && <em className="metrics-badge">待埋点</em>}</span>
            <span>一次完成 {data?.taskQuality?.firstPassRate.value == null ? '无数据' : `${(data.taskQuality.firstPassRate.value * 100).toFixed(1)}% (${data.taskQuality.firstPassRate.numerator}/${data.taskQuality.firstPassRate.denominator})`}{data?.availability?.taskAttempts === 'partial' && <em className="metrics-badge">部分数据</em>}{data?.availability?.taskAttempts === 'missing' && <em className="metrics-badge">待埋点</em>}</span>
            <span>返工 {data?.taskQuality?.reworkRate.value == null ? '无数据' : `${(data.taskQuality.reworkRate.value * 100).toFixed(1)}% (${data.taskQuality.reworkRate.numerator}/${data.taskQuality.reworkRate.denominator})`}{data?.availability?.taskReopen === 'partial' && <em className="metrics-badge">部分数据</em>}{data?.availability?.taskReopen === 'missing' && <em className="metrics-badge">待埋点</em>}</span>
            <span>任务 {data?.totals.tasks ?? 0} · 失败 {data?.totals.failures ?? 0}</span><span>任务响应 p50 {data?.taskQuality?.response?.p50 == null ? '—' : `${data.taskQuality.response.p50}ms`} / p90 {data?.taskQuality?.response?.p90 == null ? '—' : `${data.taskQuality.response.p90}ms`}{(data?.taskQuality?.response?.sample ?? 0) < 20 && <em className="metrics-badge">样本不足</em>}</span>
          </div>
          <div className="section-title"><h2>明细</h2><span>按日 · 可横向滚动</span></div>
          <div className="metrics-table-wrap" tabIndex={0} aria-label="指标明细表"><table className="metrics-table"><thead><tr><th>日期</th><th>消息</th><th>轮次</th><th>任务</th><th>失败</th><th>Token</th></tr></thead><tbody>{fresh.map((day) => <tr key={day.date}><td>{day.date}</td><td>{day.messages}</td><td>{day.turns}</td><td>{day.tasks ?? 0}</td><td>{day.failures}</td><td>{formatTokens(day.totalTokens)}</td></tr>)}</tbody></table></div>
          <div className="metrics-tables">
            {Object.entries(data?.tables ?? {}).map(([key, rows]) => {
              const labels: Record<string, string> = { tokensByModel: 'Token 按模型', tokensBySession: 'Token 按会话', messagesByRole: '消息按角色', messagesBySession: '消息按会话', sessions: '会话', tasksBySession: '任务按会话', latencySamples: '延迟分位' }
              const headers = rows[0] ? Object.keys(rows[0]).filter((field) => !['sessionId', 'internal', 'terminal', 'firstPass', 'reworked'].includes(field)) : []
              return <details className="metrics-table-details" key={key}><summary>{labels[key] ?? key} <span>{rows.length}</span></summary>{rows.length === 0 ? <p className="insp-text">暂无数据</p> : <div className="metrics-table-wrap" tabIndex={0} aria-label={`${labels[key] ?? key}明细`}><table className="metrics-table"><thead><tr>{headers.map((field) => <th key={field}>{field}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((field) => <td key={field}>{typeof row[field] === 'object' && row[field] !== null ? '—' : String(row[field] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</details>
            })}
          </div>
        </>
      )}
    </section>
  )
}
