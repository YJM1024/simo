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

  it('keeps inline-code chrome out of fenced code blocks so block text stays readable', () => {
    // .msg-text pre>code 会同时命中 .msg-text code：行内码的浅色背景/内边距会盖在深色
    // pre 上，而 pre 又把文字设成浅色，结果浅底浅字（实测 #E9E9F0 on #F4F3EF，~1.04:1）。
    // 块级 code 必须只继承 pre 的配色，不画自己的底。
    for (const width of [MOBILE_375, DESKTOP_1440]) {
      expect(effective('.msg-text pre code', 'background', width)).toBe('none')
      expect(effective('.msg-text pre code', 'color', width)).toBe('inherit')
      expect(effective('.msg-text pre code', 'padding', width)).toBe('0')
      expect(effective('.msg-text pre code', 'border-radius', width)).toBe('0')
    }
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

/**
 * A5/A13 的样式契约。jsdom 没有布局，这里只断言"最后一条命中规则"，
 * 真实像素（卡内是否只剩一道边、标签差 0）由 CDP 在 8787 同源构建上量取。
 */
describe('会话面板与 Composer 基线样式（A5 / A13）', () => {
  const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

  it('A5：卡片内层不再叠白底，只保留 1px line 与 10px 圆角', () => {
    for (const width of [1600, 1180, MOBILE_375]) {
      expect(effective('.conversation-panel .card-block', 'background', width)).toBe('transparent')
      expect(effective('.conversation-panel .card-block', 'border', width)).toBe('1px solid var(--line)')
      expect(effective('.conversation-panel .card-block', 'border-radius', width)).toBe('var(--r-10)')
    }
  })

  it('A13：1180 档标签行左内距按时间轴 gutter 复算，chip 内缩与卡内容同宽', () => {
    expect(effective('.chat-tabs', 'padding-left', 1600)).toBe('calc(max((100% - var(--conversation-card-w)) / 2, var(--conversation-gutter-x)) + 20px)')
    expect(effective('.chat-tabs', 'padding-left', 1180)).toBe('calc(var(--gutter-timeline) + var(--sp-8) + 20px)')
    expect(effective('.chat-tabs .chat-chip', 'padding', 1600)).toBe('0 var(--space-14)')
    expect(effective('.chat-tabs .chat-chip', 'padding', 1180)).toBe('0 var(--space-14)')
    // 窄屏卡内边距收到 12px，chip 必须同步，否则 375 档又出现 2px 错位
    expect(effective('.chat-tabs .chat-chip', 'padding', MOBILE_375)).toBe('0 var(--sp-12)')
  })

  it('A13：右栏首块与消息列同起于标签行下 12px', () => {
    expect(effective('.insp-body', 'padding-top', 1600)).toBe('calc(var(--sp-12) + var(--chat-tabs-h))')
    expect(effective('.insp-body', 'padding-top', 1180)).toBe('calc(var(--sp-12) + var(--chat-tabs-h))')
    expect(tokens).toContain('--chat-tabs-h: calc(var(--sp-8) + var(--size-30) + var(--sp-12) + 1px)')
  })

  it('A5（composer）：模式文案默认透明，聚焦或空输入悬停时显示，失焦即隐藏', () => {
    expect(effective('.composer-send-mode-hint', 'opacity', 1600)).toBe('0')
    expect(effective('.composer-send-mode-hint', 'opacity', MOBILE_375)).toBe('0')
    expect(effective('.composer-box:focus-within .composer-send-mode-hint', 'opacity', 1600)).toBe('1')
    // 悬停只在输入为空时生效：非空失焦后指针停在提示区也不能把文案带回来
    expect(effective('.composer-box:has(textarea:placeholder-shown) .composer-right:hover .composer-send-mode-hint', 'opacity', 1600)).toBe('1')
    // 不用 visibility:hidden，避免占位跳动
    expect(effective('.composer-send-mode-hint', 'visibility', 1600)).toBeNull()
  })

  it('A5（panel）：density=compact 收紧消息内边距，默认 normal 不动现有视觉', () => {
    expect(effective('.conversation-panel.is-compact .chat-inner', 'padding', 1600)).toBe('var(--sp-12)')
    expect(effective('.conversation-panel .chat-inner', 'padding', 1600)).toBe('var(--sp-16) var(--sp-20)')
  })
})
