// features/workbench/commands.ts —— 命令面板纯逻辑（UI-1）
//
// Ctrl+K 命令：切会话/新建会话/改权限/开设置/打开用量/暂停任务/切换主题；
// 过滤按 label/detail/keywords 不区分大小写；会话命令由会话列表生成。

import type { SessionSummary } from '../../platform/types.ts'

export type PaletteAction =
  | 'switch-session'
  | 'new-session'
  | 'permissions'
  | 'open-settings'
  | 'open-usage'
  | 'open-view'
  | 'nav-chat'
  | 'nav-workbench'
  | 'nav-schedules'
  | 'nav-agents'
  | 'nav-team'
  | 'nav-memory'
  | 'nav-files'
  | 'pause'
  | 'toggle-theme'

export interface PaletteCommand {
  id: string
  label: string
  detail: string
  keywords: string
  action: PaletteAction
  sessionId?: string
}

export const BASE_COMMANDS: readonly PaletteCommand[] = [
  { id: 'new-session', label: '新建会话', detail: '在当前会话下创建子会话', keywords: 'new create session 会话', action: 'new-session' },
  { id: 'nav-chat', label: '视图：对话', detail: '回到对话页（保留当前会话）', keywords: 'nav view chat 对话 导航', action: 'nav-chat' },
  { id: 'nav-workbench', label: '视图：工作台', detail: '用量 / 设置 / 命令/自定义视图', keywords: 'nav view workbench 工作台 导航', action: 'nav-workbench' },
  { id: 'nav-schedules', label: '视图：任务/定时任务', detail: '定时任务管理', keywords: 'nav view schedule 定时任务 任务 导航', action: 'nav-schedules' },
  { id: 'nav-agents', label: '视图：智能体', detail: '可用智能体目录', keywords: 'nav view agents 智能体 导航', action: 'nav-agents' },
  { id: 'nav-team', label: '视图：团队', detail: '只读团队页', keywords: 'nav view team 团队 导航', action: 'nav-team' },
  { id: 'nav-memory', label: '视图：记忆', detail: '记忆浏览器（只读）', keywords: 'nav view memory 记忆 导航', action: 'nav-memory' },
  { id: 'nav-files', label: '切到会话文件', detail: '中栏「对话/轨迹/文件」子选项卡', keywords: 'nav view files 文件 会话 导航', action: 'nav-files' },
  { id: 'permissions', label: '更改权限', detail: '沙盒模式与审批策略（打开设置）', keywords: 'permission sandbox approval 权限 审批', action: 'permissions' },
  { id: 'pause', label: '暂停当前任务', detail: '发送「停」，不再启动新任务', keywords: 'pause stop 停 暂停 任务', action: 'pause' },
  { id: 'open-settings', label: '打开设置', detail: '模型 / 权限 / 主题 / 数据目录 / 快捷键', keywords: 'settings config 设置', action: 'open-settings' },
  { id: 'open-usage', label: '打开用量统计', detail: '会话树 × 消息数/token 时间序列', keywords: 'usage stats token 用量 统计', action: 'open-usage' },
  { id: 'open-view', label: '打开自定义视图', detail: '当前会话的 schema 渲染预览（只读）', keywords: 'view schema custom 视图 自定义', action: 'open-view' },
  { id: 'toggle-theme', label: '切换主题', detail: '在可用主题间切换', keywords: 'theme dark light 主题', action: 'toggle-theme' },
]

/** 扁平会话 → 切换会话命令（按树缩进标题保持可辨识）。 */
export function sessionCommands(sessions: readonly SessionSummary[]): PaletteCommand[] {
  const byId = new Map(sessions.map((session) => [session.id, session]))
  const depthOf = (session: SessionSummary): number => {
    let depth = 0
    let current = session
    const seen = new Set<string>()
    while (current.parentId && !seen.has(current.id) && depth < 16) {
      seen.add(current.id)
      const parent = byId.get(current.parentId)
      if (!parent) break
      current = parent
      depth += 1
    }
    return depth
  }
  return sessions.map((session) => ({
    id: `session:${session.id}`,
    label: `${'· '.repeat(depthOf(session))}${session.title || session.id}`,
    detail: `切换会话 · ${session.id}`,
    keywords: `session 会话 ${session.title ?? ''} ${session.id}`,
    action: 'switch-session',
    sessionId: session.id,
  }))
}

export function filterPalette(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...commands]
  return commands.filter((command) => `${command.label} ${command.detail} ${command.keywords}`.toLowerCase().includes(needle))
}

export function mergePaletteCommands(
  commands: readonly PaletteCommand[],
  sessions: readonly SessionSummary[],
): PaletteCommand[] {
  return [...sessionCommands(sessions), ...commands]
}
