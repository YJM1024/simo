import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 正文链接样式的契约。
 *
 * 消息正文里的 `<a>` 由 markdown 链接渲染产生（library.tsx renderInlineTokens），
 * 而全局 `a { color: inherit; text-decoration: none }` 会把它压成和正文一样。
 * jsdom 不解析样式表联动，因此这里直接对 components.css 读规则，锁定：
 *   - `.msg-text a` 恢复 accent 颜色与下划线；
 *   - hover 加粗下划线、focus-visible 有可见外框；
 *   - 规则只落在 `.msg-text` 作用域，全局 a 重置保持原样（侧栏/右栏/Composer 不受影响）。
 * 真实 computed 值由 Chromium 截图证据补充，这里不冒充浏览器验证。
 */

const cssPath = resolve(process.cwd(), 'src/components/components.css')
const css = readFileSync(cssPath, 'utf8')

interface Declaration { prop: string; value: string }
interface Rule { selectors: string[]; declarations: Declaration[] }

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseDeclarations(body: string): Declaration[] {
  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':')
      if (index < 0) return null
      return { prop: part.slice(0, index).trim(), value: part.slice(index + 1).trim() }
    })
    .filter((declaration): declaration is Declaration => declaration !== null)
}

function findBlockEnd(source: string, openIndex: number): number {
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return source.length - 1
}

function parseRules(source: string): Rule[] {
  const rules: Rule[] = []
  let cursor = 0
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor)
    if (open < 0) break
    const header = source.slice(cursor, open).trim()
    const close = findBlockEnd(source, open)
    const body = source.slice(open + 1, close)
    if (header.startsWith('@media')) {
      rules.push(...parseRules(body))
    } else if (!header.startsWith('@')) {
      rules.push({
        selectors: header.split(',').map((selector) => selector.trim()).filter(Boolean),
        declarations: parseDeclarations(body),
      })
    }
    cursor = close + 1
  }
  return rules
}

const rules = parseRules(stripComments(css))

function declarationsFor(selector: string): Map<string, string> {
  const matched = rules.filter((rule) => rule.selectors.includes(selector))
  // 同特异度后写胜出：按源码顺序覆盖。
  const merged = new Map<string, string>()
  for (const rule of matched) {
    for (const declaration of rule.declarations) merged.set(declaration.prop, declaration.value)
  }
  return merged
}

describe('消息正文链接样式', () => {
  it('恢复 accent 颜色与下划线', () => {
    const declarations = declarationsFor('.msg-text a')
    expect(declarations.get('color')).toBe('var(--accent)')
    expect(declarations.get('text-decoration')).toBe('underline')
    expect(declarations.get('text-underline-offset')).toBe('2px')
    expect(declarations.get('word-break')).toBe('break-word')
  })

  it('hover 时下划线加粗且不引入新色值', () => {
    const declarations = declarationsFor('.msg-text a:hover')
    expect(declarations.get('text-decoration-thickness')).toBe('2px')
    for (const value of declarations.values()) {
      expect(value).not.toMatch(/#[0-9a-f]{3,8}/i)
    }
  })

  it('focus-visible 有可见外框，与全局 focus 规范同值', () => {
    const link = declarationsFor('.msg-text a:focus-visible')
    expect(link.get('outline')).toBe('2px solid var(--accent)')
    expect(link.get('outline-offset')).toBe('2px')

    const globalFocus = declarationsFor(':focus-visible')
    expect(globalFocus.get('outline')).toBe('var(--border-2) solid var(--accent)')
    expect(globalFocus.get('outline-offset')).toBe('var(--size-2)')
  })

  it('全局 a 重置保持不变，链接样式只写在 .msg-text 作用域', () => {
    const reset = declarationsFor('a')
    expect(reset.get('color')).toBe('inherit')
    expect(reset.get('text-decoration')).toBe('none')

    const linkSelectors = rules.flatMap((rule) => rule.selectors).filter((selector) => selector === 'a' || selector.startsWith('a:'))
    expect(linkSelectors).toEqual(['a'])
  })
})
