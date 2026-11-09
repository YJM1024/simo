// platform/markdown.ts —— 共用 Markdown 子集解析（M8）
//
// 契约：docs/m8-contract.md §1/§4。支持：标题 / 粗体 / 斜体 / 无序列表 / 有序列表 /
// 行内代码 / 代码块 / 引用 / 链接 / 分隔线 / 简单表格；原始 HTML 不做解析（渲染层只用
// 文本节点，天然转义）；链接仅允许 http(s)，由渲染层加 rel="noopener noreferrer"。
// 纯函数、无 React 依赖，供消息渲染与产物预览共用，可单测。
//
// 安全边界：
//   - 解析器不产生 HTML 字符串，只产生结构化节点；原始 HTML 会作为普通文本节点渲染。
//   - 链接 URL 只接受 http:// / https://，其它协议保留为纯文本。

export type MarkdownBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; lang: string; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'paragraph'; text: string }

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }

/** 转义 HTML 特殊字符（仅测试/防御用；渲染层走 React 文本节点）。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 链接白名单：只允许 http/https 绝对 URL。 */
export function isSafeHttpUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false
  return /^[\s|:-]+$/.test(trimmed) && trimmed.replace(/[^|-]/g, '').length > 0
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((cell) => cell.trim())
}

/** 解析 Markdown 子集为块级节点（无 HTML 字符串）。 */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let fence: { lang: string; lines: string[] } | null = null

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n').trim() })
    paragraph = []
  }
  const flushList = (): void => {
    if (!list) return
    blocks.push({ kind: 'list', ordered: list.ordered, items: list.items })
    list = null
  }
  const flushAll = (): void => {
    flushParagraph()
    flushList()
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const fenceMatch = /^\s*```(\w*)\s*$/.exec(line)

    if (fence) {
      if (fenceMatch) {
        blocks.push({ kind: 'code', lang: fence.lang, text: fence.lines.join('\n') })
        fence = null
      } else {
        fence.lines.push(line)
      }
      continue
    }
    if (fenceMatch) {
      flushAll()
      fence = { lang: fenceMatch[1] ?? '', lines: [] }
      continue
    }

    if (!line.trim()) {
      flushAll()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushAll()
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2]?.trim() ?? '' })
      continue
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushAll()
      blocks.push({ kind: 'rule' })
      continue
    }

    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      flushAll()
      blocks.push({ kind: 'quote', text: quote[1] ?? '' })
      continue
    }

    // 简单表格：当前行含 |，下一行是分隔行
    const nextLine = lines[index + 1] ?? ''
    if (line.includes('|') && isTableSeparator(nextLine)) {
      flushAll()
      const headers = splitTableRow(line)
      const rows: string[][] = []
      index += 1
      while (index + 1 < lines.length) {
        const rowLine = lines[index + 1] ?? ''
        if (!rowLine.includes('|') || !rowLine.trim()) break
        rows.push(splitTableRow(rowLine))
        index += 1
      }
      blocks.push({ kind: 'table', headers, rows })
      continue
    }

    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line)
    if (ordered) {
      flushParagraph()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ordered[1] ?? '')
      continue
    }
    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (unordered) {
      flushParagraph()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(unordered[1] ?? '')
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  if (fence) blocks.push({ kind: 'code', lang: fence.lang, text: fence.lines.join('\n') })
  flushAll()
  return blocks
}

/** 行内解析：**粗体**、*斜体*、`代码`、[文字](http(s)链接)；其它链接协议保留纯文本。 */
export function parseInline(source: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let plain = ''
  let index = 0

  const pushPlain = (): void => {
    if (plain) {
      nodes.push({ kind: 'text', text: plain })
      plain = ''
    }
  }

  while (index < source.length) {
    const rest = source.slice(index)

    if (rest.startsWith('**')) {
      const end = source.indexOf('**', index + 2)
      if (end > index + 2) {
        pushPlain()
        nodes.push({ kind: 'strong', text: source.slice(index + 2, end) })
        index = end + 2
        continue
      }
    }

    if (rest.startsWith('*')) {
      const end = source.indexOf('*', index + 1)
      if (end > index + 1) {
        pushPlain()
        nodes.push({ kind: 'em', text: source.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }

    if (rest.startsWith('`')) {
      const end = source.indexOf('`', index + 1)
      if (end > index + 1) {
        pushPlain()
        nodes.push({ kind: 'code', text: source.slice(index + 1, end) })
        index = end + 1
        continue
      }
    }

    if (rest.startsWith('[')) {
      const closeBracket = source.indexOf('](', index + 1)
      if (closeBracket > index + 1) {
        const closeParen = source.indexOf(')', closeBracket + 2)
        if (closeParen > closeBracket + 2) {
          const label = source.slice(index + 1, closeBracket)
          const href = source.slice(closeBracket + 2, closeParen)
          if (isSafeHttpUrl(href)) {
            pushPlain()
            nodes.push({ kind: 'link', text: label || href, href: href.trim() })
            index = closeParen + 1
            continue
          }
        }
      }
    }

    plain += source[index] ?? ''
    index += 1
  }

  pushPlain()
  return nodes
}
