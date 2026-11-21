import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A4（375px 不横向溢出）的样式契约。
 *
 * jsdom 不做布局、也没有样式级联，因此这里直接对 components.css 求"在 375px 下的有效声明"：
 * 按源码顺序扫描规则、按 max-width/min-width 的 em 断点判断是否命中，取最后一条命中值
 * （等价于同特异度下后写的规则胜出）。这条链路能抓到的回归是：
 *   - 断点写错/被删（mobile 覆盖失效）；
 *   - 有人给会话主列、Composer 或气泡加了固定像素宽度；
 *   - 长代码块没有兜底滚动，把页面撑宽。
 * 真实像素级验证仍需浏览器（见 test-plan TC-P1-E1），这里不冒充。
 */

// jsdom 环境下 import.meta.url 不是 file: 协议，按 vitest 的工作目录解析；
// 测试命令固定在 frontend/ 下执行（package.json scripts）。
const cssPath = resolve(process.cwd(), 'src/components/components.css')
const css = readFileSync(cssPath, 'utf8')
const EM = 16
const MOBILE_375 = 375
const DESKTOP_1440 = 1440

interface Declaration { prop: string; value: string }
interface Rule { media: string | null; selectors: string[]; declarations: Declaration[] }

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

function parseRules(source: string, media: string | null = null): Rule[] {
  const rules: Rule[] = []
  let cursor = 0
  while (cursor < source.length) {
    const open = source.indexOf('{', cursor)
    if (open < 0) break
    const header = source.slice(cursor, open).trim()
    const close = findBlockEnd(source, open)
    const body = source.slice(open + 1, close)
    if (header.startsWith('@media')) {
      rules.push(...parseRules(body, header.slice('@media'.length).trim()))
    } else if (!header.startsWith('@')) {
      rules.push({
        media,
        selectors: header.split(',').map((selector) => selector.trim()).filter(Boolean),
        declarations: parseDeclarations(body),
      })
    }
    cursor = close + 1
  }
  return rules
}

const rules = parseRules(stripComments(css))

function mediaMatches(media: string, widthPx: number): boolean {
  return media.split(/\s+and\s+/).every((condition) => {
    const match = /^\(\s*(max|min)-width:\s*([\d.]+)em\s*\)$/.exec(condition.trim())
    if (!match) return false // prefers-reduced-motion 等条件在默认环境下不成立
    const bound = Number(match[2]) * EM
    return match[1] === 'max' ? widthPx <= bound : widthPx >= bound
  })
}

function effective(selector: string, prop: string, widthPx: number): string | null {
  let value: string | null = null
  for (const rule of rules) {
    if (rule.media !== null && !mediaMatches(rule.media, widthPx)) continue
    if (!rule.selectors.includes(selector)) continue
    for (const declaration of rule.declarations) {
      if (declaration.prop === prop) value = declaration.value
    }
  }
  return value
}

describe('375px 无横向溢出（A4 / PRD-CONV-004）', () => {
  it('at 375px the document clips horizontal overflow and collapses to one column', () => {
    expect(effective('html', 'overflow-x', MOBILE_375)).toBe('hidden')
    expect(effective('body', 'overflow-x', MOBILE_375)).toBe('hidden')
    expect(effective('.app', 'grid-template-columns', MOBILE_375)).toBe('1fr')
    // 侧栏在窄屏让位给对话区，否则两列最小宽度会把 375 撑爆
    expect(effective('.sidebar', 'display', MOBILE_375)).toBe('none')
  })

  it('keeps the conversation column and composer inside the viewport', () => {
    expect(effective('.main', 'min-width', MOBILE_375)).toBe('0')
    expect(effective('.conversation-panel', 'min-width', MOBILE_375)).toBe('0')
    expect(effective('.chat-content', 'max-width', MOBILE_375)).toBe('100%')
    expect(effective('.conversation-panel', 'width', MOBILE_375)).toBe('calc(100% - var(--sp-16))')
    expect(effective('.composer', 'width', MOBILE_375)).toBe('calc(100% - var(--sp-16))')
    expect(effective('.composer', 'margin-inline', MOBILE_375)).toBe('auto')
  })

  it('never pins the conversation surfaces to a bare pixel width', () => {
    for (const width of [MOBILE_375, DESKTOP_1440]) {
      for (const [selector, prop] of [
        ['.conversation-panel', 'width'],
        ['.composer', 'width'],
        ['.msg-text', 'width'],
        ['.card-block', 'width'],
      ] as const) {
        const value = effective(selector, prop, width)
        if (value !== null) expect(value).not.toMatch(/^\d+(\.\d+)?px$/)
      }
    }
  })

  it('lets long code blocks scroll instead of stretching the page', () => {
    expect(effective('.msg-text pre', 'max-width', MOBILE_375)).toBe('100%')
    expect(effective('.msg-text pre', 'overflow-x', MOBILE_375)).toBe('auto')
    expect(effective('.msg-text code', 'overflow-wrap', MOBILE_375)).toBe('anywhere')
  })

  it('drops the fixed-width timeline gutter on narrow screens and restores it on desktop', () => {
    // 时间轴是 52px 定宽 gutter，窄屏保留等于白占宽度
    expect(effective('.conversation-panel > .timeline', 'display', MOBILE_375)).toBe('none')
    expect(effective('.conversation-panel > .timeline', 'display', DESKTOP_1440)).toBe('flex')
    expect(effective('.conversation-panel > .timeline', 'display', 1280)).toBe('flex')
  })

  it('keeps the 375px guard covering the whole phone range', () => {
    // 断点用 em：47.5em = 760px、30em = 480px，都必须覆盖 375px
    expect(effective('html', 'overflow-x', 320)).toBe('hidden')
    expect(effective('html', 'overflow-x', 480)).toBe('hidden')
    expect(effective('html', 'overflow-x', 760)).toBe('hidden')
    expect(effective('html', 'overflow-x', 761)).toBeNull()
    expect(effective('.composer', 'margin-inline', 481)).toBeNull()
  })
})
