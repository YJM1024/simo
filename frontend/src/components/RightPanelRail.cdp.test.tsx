import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * V-CONV-008-6 的真实布局证据（设计 §8.1 三档）：760–1023 下右栏是 40px 图标条，抽屉覆盖不挤压中栏；
 * 1024 起展开，1180 三栏、375 不渲染 都不回归。
 *
 * 做法：把当前源码（main.tsx）用 esbuild 打成 iife，通过 page.route 顶掉
 * http://127.0.0.1:8787/ 的文档（仍是 8787 同源，/api 与 WS 打到真实后端），
 * 于是可以在真实 Chromium 里点 rail、开抽屉、量像素，而不是量 8787 上的旧构建。
 */

const require = createRequire(import.meta.url)
const { chromium } = require('../../e2e/node_modules/playwright') as {
  chromium: { connectOverCDP: (url: string) => Promise<any> }
}

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')
const componentsCss = readFileSync('src/components/components.css', 'utf8')
const cdpUrl = process.env.EXEC_ROW_CDP_URL ?? 'http://127.0.0.1:9223'
const appOrigin = process.env.SIMO_APP_ORIGIN ?? 'http://127.0.0.1:8787'

// vitest 的 jsdom 环境替换了 TextEncoder，esbuild 的 JS API 会因环境不变量失败，
// 因此走 esbuild CLI（stdio=ignore，不经过管道）打到系统临时目录后再读回。
const bundleDir = mkdtempSync(join(tmpdir(), 'conv008-rail-'))
const bundlePath = join(bundleDir, 'app.js')
execFileSync(process.execPath, [join('node_modules', 'esbuild', 'bin', 'esbuild'), 'src/main.tsx', '--bundle', '--format=iife', '--target=es2022', '--jsx=automatic', '--define:process.env.NODE_ENV="production"', `--outfile=${bundlePath}`], {
  cwd: process.cwd(),
  stdio: 'ignore',
})
const appJs = readFileSync(bundlePath, 'utf8').replace(/<\/script/gi, '<\\/script')
const appHtml = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}${tokensCss}\n${componentsCss}</style></head><body><div id="root"></div><script>${appJs}</script></body></html>`

let browser: any = null
try {
  browser = await chromium.connectOverCDP(cdpUrl)
} catch {
  browser = null
}

describe.skipIf(!browser)('右栏三档图标条/展开/隐藏（V-CONV-008-6）', () => {
  // 不关闭共享的 CDP 浏览器：同一次 vitest 里别的文件也在连它。

  async function openApp(width: number, height: number): Promise<{ context: any; page: any }> {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: false })
    const page = await context.newPage()
    await page.route(`${appOrigin}/`, (route: any) => route.fulfill({ status: 200, contentType: 'text/html', body: appHtml }))
    await page.goto(`${appOrigin}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.app', { timeout: 15000 })
    return { context, page }
  }

  it('768×1024：rail 计算宽 40、文档 768、越界元素 0、中栏与 rail 不重叠', async () => {
    const { context, page } = await openApp(768, 1024)
    try {
      const state = await page.evaluate(() => {
        const rail = document.querySelector('.insp-rail') as HTMLElement
        const inspector = document.querySelector('.inspector') as HTMLElement
        const chatCol = document.querySelector('.chat-col') as HTMLElement
        const railRect = rail.getBoundingClientRect()
        const chatRect = chatCol.getBoundingClientRect()
        const outOfBounds = [...document.querySelectorAll<HTMLElement>('body *')].filter((node) => {
          if (getComputedStyle(node).position === 'fixed') return false
          const rect = node.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) return false
          return rect.left < -1 || rect.right > window.innerWidth + 1
        }).length
        return {
          railWidth: railRect.width,
          inspectorWidth: inspector.getBoundingClientRect().width,
          inspectorDisplay: getComputedStyle(inspector).display,
          drawerDisplay: getComputedStyle(document.querySelector('.insp-body') as HTMLElement).display,
          scrollWidth: document.documentElement.scrollWidth,
          outOfBounds,
          chatColRight: chatRect.right,
          chatColWidth: chatRect.width,
          railLeft: railRect.left,
        }
      })
      expect(state.inspectorDisplay).toBe('flex')
      expect(state.inspectorWidth).toBe(40)
      expect(state.drawerDisplay).toBe('none')
      expect(state.railWidth).toBe(40)
      expect(state.scrollWidth).toBe(768)
      expect(state.outOfBounds).toBe(0)
      expect(state.chatColRight).toBeLessThanOrEqual(state.railLeft + 0.5)
      expect(state.chatColWidth).toBe(508) // 768 - 220(sidebar) - 40(rail)
      if (process.env.CONV008_SHOT) await page.screenshot({ path: join(process.env.CONV008_SHOT, '768-closed.png') })

      await page.locator('.insp-rail button[title="概览"]').click()
      const opened = await page.evaluate(() => {
        const drawer = document.querySelector('.insp-body') as HTMLElement
        const scrim = document.querySelector('.insp-drawer-scrim') as HTMLElement
        const chatCol = document.querySelector('.chat-col') as HTMLElement
        const composer = document.querySelector('.composer') as HTMLElement
        const rail = document.querySelector('.insp-rail') as HTMLElement
        const drawerRect = drawer.getBoundingClientRect()
        const railRect = rail.getBoundingClientRect()
        return {
          display: getComputedStyle(drawer).display,
          position: getComputedStyle(drawer).position,
          width: drawerRect.width,
          right: drawerRect.right,
          bottom: drawerRect.bottom,
          scrim: scrim ? getComputedStyle(scrim).display : 'missing',
          chatWidth: chatCol.getBoundingClientRect().width,
          chatRight: chatCol.getBoundingClientRect().right,
          railLeft: railRect.left,
          composerTop: composer.getBoundingClientRect().top,
          scrollWidth: document.documentElement.scrollWidth,
          // 关闭按钮在抽屉自己的右上角，绝对定位在 fixed 抽屉内部
          closeDisplay: (() => {
            const close = document.querySelector('.insp-drawer-close') as HTMLElement | null
            return close ? getComputedStyle(close).display : 'missing'
          })(),
          closePosition: (() => {
            const close = document.querySelector('.insp-drawer-close') as HTMLElement | null
            return close ? getComputedStyle(close).position : 'missing'
          })(),
        }
      })
      expect(opened.display).toBe('block')
      expect(opened.position).toBe('fixed')
      expect(opened.width).toBe(280)
      expect(opened.right).toBe(728)
      expect(opened.scrim).toBe('block')
      expect(opened.chatWidth).toBe(state.chatColWidth)
      expect(opened.chatRight).toBeLessThanOrEqual(opened.railLeft + 0.5)
      expect(opened.bottom).toBeLessThanOrEqual(opened.composerTop + 0.5)
      expect(opened.scrollWidth).toBe(768)
      // 绝对定位元素会做 blockify：inline-flex 计算后是 flex
      expect(opened.closeDisplay).toBe('flex')
      expect(opened.closePosition).toBe('absolute')
      if (process.env.CONV008_SHOT) await page.screenshot({ path: join(process.env.CONV008_SHOT, '768-open.png') })

      // 抽屉开着时 Composer 高度变化，底边要跟着让开（ResizeObserver 路径；真实 Composer 高度固定，
      // 这里直接改它的高度来驱动观察器，验证的是「高度变化 → 底边重算」这条链路）
      const grown = await page.evaluate(async () => {
        const composer = document.querySelector('.composer') as HTMLElement
        composer.style.height = '220px'
        await new Promise((resolve) => setTimeout(resolve, 350))
        const drawer = document.querySelector('.insp-body') as HTMLElement
        return {
          composerTop: composer.getBoundingClientRect().top,
          composerHeight: composer.getBoundingClientRect().height,
          drawerBottom: drawer.getBoundingClientRect().bottom,
          drawerVar: getComputedStyle(drawer).getPropertyValue('--insp-drawer-bottom').trim(),
        }
      })
      expect(grown.composerHeight).toBe(220)
      expect(grown.composerTop).toBeLessThan(800)
      expect(grown.drawerBottom).toBeLessThan(opened.bottom)
      expect(grown.drawerBottom).toBeLessThanOrEqual(grown.composerTop - 7.5)
      expect(grown.drawerVar).not.toBe('')
    } finally {
      await context.close()
    }
  })

  it('1024：恢复展开态（inspector 280、正文可见、无抽屉遮罩），中栏仍可读', async () => {
    const { context, page } = await openApp(1024, 768)
    try {
      const state = await page.evaluate(() => {
        const node = (selector: string) => document.querySelector(selector) as HTMLElement
        const chat = node('.chat-col').getBoundingClientRect()
        const inspector = node('.inspector').getBoundingClientRect()
        const body = node('.insp-body')
        return {
          inspectorWidth: inspector.width,
          inspectorDisplay: getComputedStyle(node('.inspector')).display,
          railWidth: node('.insp-rail').getBoundingClientRect().width,
          bodyDisplay: getComputedStyle(body).display,
          bodyPosition: getComputedStyle(body).position,
          scrim: document.querySelector('.insp-drawer-scrim'),
          chatWidth: chat.width,
          chatRight: chat.right,
          inspectorLeft: inspector.left,
          scrollWidth: document.documentElement.scrollWidth,
          drawerBottom: body.getBoundingClientRect().bottom,
          composerTop: node('.composer').getBoundingClientRect().top,
          outOfBounds: [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => {
            if (getComputedStyle(el).position === 'fixed') return false
            const rect = el.getBoundingClientRect()
            if (rect.width === 0 && rect.height === 0) return false
            return rect.left < -1 || rect.right > window.innerWidth + 1
          }).length,
        }
      })
      expect(state.inspectorWidth).toBe(280)
      expect(state.inspectorDisplay).toBe('flex')
      expect(state.railWidth).toBe(40)
      expect(state.bodyDisplay).toBe('block')
      expect(state.bodyPosition).not.toBe('fixed')
      expect(state.scrim).toBeNull()
      expect(state.chatWidth).toBe(516) // 1024 - 228(sidebar) - 280(inspector)
      expect(state.chatRight).toBeLessThanOrEqual(state.inspectorLeft + 0.5)
      expect(state.scrollWidth).toBe(1024)
      expect(state.outOfBounds).toBe(0)
      if (process.env.CONV008_SHOT) await page.screenshot({ path: join(process.env.CONV008_SHOT, '1024-expanded.png') })
    } finally {
      await context.close()
    }
  })

  it('760/1023/1024/1179：图标条与展开档的边界值', async () => {
    for (const [width, expected] of [[760, 40], [1023, 40], [1024, 280], [1179, 280]] as const) {
      const { context, page } = await openApp(width, 900)
      try {
        const state = await page.evaluate(() => {
          const inspector = document.querySelector('.inspector') as HTMLElement
          return {
            width: inspector.getBoundingClientRect().width,
            display: getComputedStyle(inspector).display,
            bodyDisplay: getComputedStyle(document.querySelector('.insp-body') as HTMLElement).display,
            scrollWidth: document.documentElement.scrollWidth,
          }
        })
        expect(state.display, `${width}px display`).toBe('flex')
        expect(state.width, `${width}px inspector`).toBe(expected)
        expect(state.bodyDisplay, `${width}px body`).toBe(expected === 40 ? 'none' : 'block')
        expect(state.scrollWidth, `${width}px scrollWidth`).toBe(width)
      } finally {
        await context.close()
      }
    }
  })

  it('1180：三栏指标不变（sidebar 228 / 面板 568 / 时间轴 44 / inspector 280 / rail 40）', async () => {
    const { context, page } = await openApp(1180, 1024)
    try {
      const state = await page.evaluate(() => {
        const width = (selector: string): number => {
          const node = document.querySelector(selector) as HTMLElement | null
          return node ? node.getBoundingClientRect().width : -1
        }
        return {
          sidebar: width('.sidebar'),
          panel: width('.conversation-panel'),
          timeline: width('.conversation-panel > .timeline'),
          inspector: width('.inspector'),
          rail: width('.insp-rail'),
          drawerDisplay: getComputedStyle(document.querySelector('.insp-body') as HTMLElement).display,
          scrollWidth: document.documentElement.scrollWidth,
        }
      })
      expect(state.sidebar).toBe(228)
      expect(state.panel).toBe(568)
      expect(state.timeline).toBe(44)
      expect(state.inspector).toBe(280)
      expect(state.rail).toBe(40)
      expect(state.drawerDisplay).toBe('block')
      expect(state.scrollWidth).toBe(1180)
    } finally {
      await context.close()
    }
  })

  it('375：右栏不渲染，文档 375 不溢出', async () => {
    const { context, page } = await openApp(375, 812)
    try {
      const state = await page.evaluate(() => {
        const inspector = document.querySelector('.inspector') as HTMLElement
        const rail = document.querySelector('.insp-rail') as HTMLElement
        return {
          display: getComputedStyle(inspector).display,
          width: inspector.getBoundingClientRect().width,
          height: inspector.getBoundingClientRect().height,
          railRect: rail.getBoundingClientRect().width,
          scrollWidth: document.documentElement.scrollWidth,
        }
      })
      expect(state.display).toBe('none')
      expect(state.width).toBe(0)
      expect(state.height).toBe(0)
      expect(state.railRect).toBe(0)
      expect(state.scrollWidth).toBe(375)
    } finally {
      await context.close()
    }
  })
})
