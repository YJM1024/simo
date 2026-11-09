// features/chat/slash.ts —— 斜杠命令（UI-1，纯逻辑）
//
// 输入框以 '/' 开头时执行命令而不是发消息：/archive /rename /pause /model。
// 这里只解析/校验/给提示；实际执行在 ChatCenter（platform http / ws）。

export interface SlashCommandMeta {
  name: string
  usage: string
  description: string
}

export const SLASH_COMMANDS: readonly SlashCommandMeta[] = [
  { name: 'archive', usage: '/archive', description: '归档当前会话（只读，可恢复）' },
  { name: 'rename', usage: '/rename <新标题>', description: '重命名当前会话' },
  { name: 'pause', usage: '/pause', description: '暂停当前工作流/任务（发送「停」）' },
  { name: 'model', usage: '/model <名称>', description: '记录模型偏好（后端接口未就绪时仅本地）' },
]

export interface ParsedSlash {
  command: string
  arg: string
  raw: string
}

export function parseSlash(text: string): ParsedSlash | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  const body = trimmed.slice(1)
  const space = body.search(/\s/)
  const command = (space === -1 ? body : body.slice(0, space)).toLowerCase()
  if (!command) return null
  const arg = space === -1 ? '' : body.slice(space + 1).trim()
  return { command, arg, raw: trimmed }
}

/** 输入中（尚未发送）的斜杠提示：前缀匹配命令名。 */
export function slashSuggestions(text: string): SlashCommandMeta[] {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/') || trimmed.includes(' ')) return []
  const prefix = trimmed.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(prefix))
}

/** 返回错误文案；null 表示合法。 */
export function validateSlash(parsed: ParsedSlash): string | null {
  const known = SLASH_COMMANDS.find((command) => command.name === parsed.command)
  if (!known) return `未知命令 /${parsed.command}；可用：${SLASH_COMMANDS.map((command) => `/${command.name}`).join('、')}`
  if ((parsed.command === 'rename' || parsed.command === 'model') && !parsed.arg) {
    return `用法：${known.usage}`
  }
  return null
}
