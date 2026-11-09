// features/chat/markdown-edit.ts —— Composer 的 Markdown 编辑纯逻辑（M8）
//
// 契约：docs/m8-contract.md §2。工具栏包裹选区、列表前缀、代码块/链接插入、列表行回车续行。
// 纯函数（输入/输出都是文本+选区），供 Composer 与 check-m8 复用。

export interface EditState {
  text: string
  start: number
  end: number
}

/** 用 marker 包裹选区；无选区时插入「marker+占位+marker」并选中占位文本。 */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  marker: string,
  placeholder = '文本',
): EditState {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const selected = text.slice(from, to)
  const inner = selected.length > 0 ? selected : placeholder
  const next = `${text.slice(0, from)}${marker}${inner}${marker}${text.slice(to)}`
  return { text: next, start: from + marker.length, end: from + marker.length + inner.length }
}

/** 代码块：包裹选区或插入占位代码块。 */
export function insertCodeBlock(text: string, start: number, end: number, placeholder = '代码'): EditState {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const selected = text.slice(from, to)
  const inner = selected.length > 0 ? selected : placeholder
  const block = '```\n' + inner + '\n```'
  const next = text.slice(0, from) + block + text.slice(to)
  return { text: next, start: from + 4, end: from + 4 + inner.length }
}

/**
 * 给选区覆盖的行加列表前缀：无序用固定 marker；有序从 1 递增。
 * 无选区时给当前行加前缀，光标停在内容末尾。
 */
function prefixLinesWith(text: string, start: number, end: number, kind: 'unordered' | 'ordered'): EditState {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const lineEndIndex = text.indexOf('\n', to)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const segment = text.slice(lineStart, lineEnd)
  const lines = segment.split('\n')
  const prefixed = lines.map((line, index) => {
    const stripped = line.replace(/^\s*([-*+]|\d+\.)\s+/, '')
    const prefix = kind === 'ordered' ? `${index + 1}. ` : '- '
    return `${prefix}${stripped}`
  })
  const joined = prefixed.join('\n')
  const next = text.slice(0, lineStart) + joined + text.slice(lineEnd)
  const caret = lineStart + joined.length
  return { text: next, start: caret, end: caret }
}

export function applyUnorderedList(text: string, start: number, end: number): EditState {
  return prefixLinesWith(text, start, end, 'unordered')
}

export function applyOrderedList(text: string, start: number, end: number): EditState {
  return prefixLinesWith(text, start, end, 'ordered')
}

/** 链接：有选区→[选区](https://) 选中 url；无选区→[链接文字](https://) 选中「链接文字」。 */
export function insertLink(text: string, start: number, end: number): EditState {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const selected = text.slice(from, to)
  const label = selected.length > 0 ? selected : '链接文字'
  const next = `${text.slice(0, from)}[${label}](https://)${text.slice(to)}`
  const labelStart = from + 1
  const labelEnd = labelStart + label.length
  // 结构：[label](url) → label 后依次是 ]、(
  const urlStart = labelEnd + 2
  if (selected.length > 0) return { text: next, start: urlStart, end: urlStart + 8 }
  return { text: next, start: labelStart, end: labelEnd }
}

/**
 * 列表行回车续行：光标在 `- item` / `n. item` 行时，Enter 插入同前缀（有序编号 +1）。
 * 空列表项回车 → 去掉该行前缀（不发送）。
 * 返回 handled=false 表示交给默认行为（即 Enter 发送 / Shift+Enter 换行）。
 */
export function continueListOnEnter(text: string, caret: number): { state: EditState; handled: boolean } {
  const from = Math.max(0, Math.min(caret, text.length))
  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const current = text.slice(lineStart, from)
  const match = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(current)
  const plainState: EditState = { text, start: from, end: from }
  if (!match) return { state: plainState, handled: false }

  const indent = match[1] ?? ''
  const marker = match[2] ?? '-'
  const content = match[3] ?? ''
  if (content.trim().length === 0) {
    // 空列表项：删掉标记，停在行首
    const next = text.slice(0, lineStart) + text.slice(from)
    return { state: { text: next, start: lineStart, end: lineStart }, handled: true }
  }

  let nextMarker = marker
  if (/^\d+\.$/.test(marker)) {
    const number = Number.parseInt(marker, 10)
    nextMarker = `${Number.isFinite(number) ? number + 1 : 1}.`
  }
  const insert = `\n${indent}${nextMarker} `
  const next = text.slice(0, from) + insert + text.slice(from)
  const nextCaret = from + insert.length
  return { state: { text: next, start: nextCaret, end: nextCaret }, handled: true }
}

/** Ctrl+B / Ctrl+I 的快捷键语义（大小写不敏感，兼容 Meta 键）。 */
export function shortcutIntent(key: string, ctrlOrMeta: boolean, shift = false): 'bold' | 'italic' | null {
  if (!ctrlOrMeta || shift) return null
  const lower = key.toLowerCase()
  if (lower === 'b') return 'bold'
  if (lower === 'i') return 'italic'
  return null
}
