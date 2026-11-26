import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../app'
import { RightPanel, TimelineGroups, type TimelineGroupMessage } from '../components'
import { projection, session } from '../test/fixtures'

const require = createRequire(import.meta.url)
const { chromium } = require('../../e2e/node_modules/playwright') as {
  chromium: { connectOverCDP: (url: string) => Promise<any> }
}

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')
const componentsCss = readFileSync('src/components/components.css', 'utf8')

const cdpUrl = process.env.EXEC_ROW_CDP_URL ?? 'http://127.0.0.1:9223'
let browser: any = null
try {
  browser = await chromium.connectOverCDP(cdpUrl)
} catch {
  browser = null
}

/** 只有真实浏览器能给出布局与命中测试；CDP 不可用时整组 skip，并在用例里写明原因。 */
describe.skipIf(!browser)('coarse hit areas and narrow-layout occlusion in Chromium', { timeout: 20000 }, () => {
  afterAll(async () => {
    await browser?.close()
  })

  async function openPage(width: number, height: number, body: string): Promise<{ context: any; page: any }> {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    const client = await context.newCDPSession(page)
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true })
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await page.setContent(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}${tokensCss}\n${componentsCss}</style></head><body>${body}</body></html>`,
    )
    return { context, page }
  }

  /** 桌面默认指针：不开 mobile、不开触摸模拟，matchMedia('(pointer: coarse)') 为 false。 */
  async function openFinePage(width: number, height: number, body: string): Promise<{ context: any; page: any }> {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: false })
    const page = await context.newPage()
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0}${tokensCss}\n${componentsCss}</style></head><body>${body}</body></html>`,
    )
    return { context, page }
  }

  it('measures every exec row of every expanded task group at >=44px, not only the first', async () => {
    // 概览四块（DEC-36）：目标/输入/任务/交付物各一个可折叠头，展开后任务 3 行 + 交付物 1 行（AC-TASK-001-01）
    const view = render(<RightPanel session={session()} projection={projection()} loading={false} />)
    const heads = [...view.container.querySelectorAll<HTMLButtonElement>('button.insp-block-head')]
    expect(heads).toHaveLength(4)
    for (const head of heads) {
      if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head)
      expect(head).toHaveAttribute('aria-expanded', 'true')
    }
    const panelMarkup = view.container.innerHTML
    view.unmount()

    const { context, page } = await openPage(1280, 1000, `<div style="width:320px">${panelMarkup}</div>`)
    try {
      const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
      expect(coarse).toBe(true)
      const rows = await page.locator('.exec-row').evaluateAll((nodes: Element[]) => nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return { height: rect.height, width: rect.width, text: node.textContent ?? '' }
      }))
      // 任务行 3 行 + 交付物行 1 行（AC-TASK-001-01 要求概览展示 3 条任务）
      expect(rows).toHaveLength(4)
      for (const row of rows) expect(row.height, `命中区不足 44px：${row.text}`).toBeGreaterThanOrEqual(44)
    } finally {
      await context.close()
    }
  })

  /**
   * 时间轴的新契约：命中面是整条 44px 轨道列，刻度只负责视觉（20×4）且 pointer-events:none。
   * 这里量三件事：列宽 44；刻度尺寸与穿透；列内逐像素扫描没有落不到时间轴的死区。
   * 点击坐标到最近刻度的映射在 jsdom 里覆盖（TimelineGroups.test.tsx），静态渲染没有 JS 处理器。
   */
  async function measureRail(page: any): Promise<{
    rail: { width: number; height: number }
    ticks: Array<{ width: number; height: number; pointerEvents: string; afterContent: string; ownerIsTick: boolean; insideRail: boolean }>
    deadZones: string[]
  }> {
    return page.evaluate(() => {
      const rail = document.querySelector<HTMLElement>('.timeline')
      if (!rail) throw new Error('missing .timeline')
      const railRect = rail.getBoundingClientRect()
      const ticks = [...document.querySelectorAll<HTMLElement>('.tl-bar')].map((tick) => {
        const rect = tick.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) as HTMLElement | null
        return {
          width: rect.width,
          height: rect.height,
          pointerEvents: getComputedStyle(tick).pointerEvents,
          afterContent: getComputedStyle(tick, '::after').content,
          ownerIsTick: Boolean(hit?.closest('.tl-bar')),
          insideRail: Boolean(hit?.closest('.timeline')),
        }
      })
      const deadZones: string[] = []
      const x = railRect.left + railRect.width / 2
      // 上下各留 1px：视口最后一行的 elementFromPoint 在不同 emulation 下会返回 null，
      // 那是光栅边界而不是轨道内的死区。
      for (let y = railRect.top + 1; y <= railRect.bottom - 1; y += 1) {
        const hit = document.elementFromPoint(x, y) as HTMLElement | null
        if (!hit || !hit.closest('.timeline')) deadZones.push(`${Math.round(y)}:${hit?.tagName ?? 'null'}`)
      }
      return { rail: { width: railRect.width, height: railRect.height }, ticks, deadZones: deadZones.slice(0, 5) }
    })
  }

  it('renders one 44px timeline rail at touch-capable widths with pointer-transparent 20x4 ticks', async () => {
    const make = (id: string, sessionId: string, sessionTitle: string, sessionOrder: number, role: 'user' | 'agent', index: number): TimelineGroupMessage => ({
      id,
      sessionId,
      sessionTitle,
      sessionOrder,
      isCurrentSession: sessionId === 'main',
      role,
      category: role === 'user' ? 'progress' : 'result',
      at: 1_700_000_000_000 + index,
      dateKey: '2026-11-21',
      summary: `${sessionTitle}消息 ${index}`,
    })
    const messages: TimelineGroupMessage[] = [
      make('a1', 'main', '主会话', 0, 'user', 1),
      make('a2', 'main', '主会话', 0, 'agent', 2),
      make('a3', 'main', '主会话', 0, 'user', 3),
      make('b1', 'child', '子会话', 1, 'user', 4),
      make('b2', 'child', '子会话', 1, 'agent', 5),
      make('c1', 'grand', '孙会话', 2, 'user', 6),
    ]
    const body = renderToStaticMarkup(
      <div style={{ height: 900, display: 'flex', justifyContent: 'center' }}>
        <TimelineGroups messages={messages} currentSessionId="main" onJump={() => undefined} />
      </div>,
    )
    // 900px 以下轨道全局 display:none（components.css:381 的 56.25em 补集断点），只量可见档。
    // 夹具没带 viewport meta，移动端模拟的布局视口约 981px，375/900 两档量到的是同一宽度、没有区分力。
    for (const width of [1000, 1280, 1600]) {
      const { context, page } = await openPage(width, 900, body)
      try {
        expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), `${width}px 粗指针环境`).toBe(true)
        const measured = await measureRail(page)
        expect(measured.rail.width, `${width}px 轨道列宽`).toBe(44)
        expect(measured.ticks, `${width}px 刻度数`).toHaveLength(messages.length)
        for (const [index, tick] of measured.ticks.entries()) {
          const label = messages[index].id
          expect(tick.width, `${width}px ${label} 刻度宽`).toBe(20)
          expect(tick.height, `${width}px ${label} 刻度高`).toBe(4)
          expect(tick.pointerEvents, `${width}px ${label} 刻度不吃指针`).toBe('none')
          expect(tick.afterContent, `${width}px ${label} 旧命中块应消失`).toBe('none')
          expect(tick.ownerIsTick, `${width}px ${label} 刻度不该自己接指针`).toBe(false)
          expect(tick.insideRail, `${width}px ${label} 命中点应在轨道内`).toBe(true)
        }
        // 44px 列内任意纵向位置都落在时间轴上：点击总能映射到某一条，没有死区。
        expect(measured.deadZones, `${width}px 列内死区`).toEqual([])
      } finally {
        await context.close()
      }
    }
  })

  it('keeps the same 44px rail and pointer-transparent ticks with the default fine pointer', async () => {
    const make = (id: string, role: 'user' | 'agent', index: number): TimelineGroupMessage => ({
      id,
      sessionId: 'main',
      sessionTitle: '主会话',
      sessionOrder: 0,
      isCurrentSession: true,
      role,
      category: role === 'user' ? 'progress' : 'result',
      at: 1_700_000_000_000 + index,
      dateKey: '2026-11-21',
      summary: `消息 ${index}`,
    })
    const messages: TimelineGroupMessage[] = [
      make('a1', 'user', 1),
      make('a2', 'agent', 2),
      make('a3', 'user', 3),
      make('a4', 'agent', 4),
      make('a5', 'user', 5),
    ]
    const body = renderToStaticMarkup(
      <div style={{ height: 900, display: 'flex', justifyContent: 'center' }}>
        <TimelineGroups messages={messages} currentSessionId="main" onJump={() => undefined} />
      </div>,
    )

    // 900px 是显示档的下边界：899 隐藏，900/901 显示，三档一起锁住断点缝隙；375 档由粗指针用例覆盖。
    for (const width of [899, 900, 901, 1280, 1600]) {
      const { context, page } = await openFinePage(width, 900, body)
      try {
        expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), '细指针环境').toBe(false)
        const measured = await measureRail(page)
        if (width < 900) {
          expect(measured.rail.width, `${width}px 窄档不显示时间轴`).toBe(0)
          for (const tick of measured.ticks) expect(tick.width, `${width}px 窄档刻度不可见`).toBe(0)
          continue
        }
        expect(measured.rail.width, `${width}px 轨道列宽`).toBe(44)
        expect(measured.ticks).toHaveLength(messages.length)
        for (const [index, tick] of measured.ticks.entries()) {
          const label = messages[index].id
          // 视觉条保持 20×4，不再挂任何命中块；命中由轨道的最近刻度映射承担。
          expect(tick.width, `${width}px ${label} 刻度宽`).toBe(20)
          expect(tick.height, `${width}px ${label} 刻度高`).toBe(4)
          expect(tick.pointerEvents, `${width}px ${label} 刻度不吃指针`).toBe('none')
          expect(tick.afterContent, `${width}px ${label} 旧命中块应消失`).toBe('none')
          expect(tick.ownerIsTick, `${width}px ${label} 刻度不该自己接指针`).toBe(false)
          expect(tick.insideRail, `${width}px ${label} 命中点应在轨道内`).toBe(true)
        }
        expect(measured.deadZones, `${width}px 列内死区`).toEqual([])
      } finally {
        await context.close()
      }
    }
  })

  it('keeps the composer and send button uncovered at 375px, and the rail clear of them at 1600px', async () => {
    const shell = renderToStaticMarkup(<App />)
    const panelMarkup = renderToStaticMarkup(<RightPanel session={session()} projection={projection()} loading={false} />)

    // 375：右栏必须退出布局，Composer 与发送按钮仍在视口内且可被直接命中
    const narrow = await openPage(375, 812, shell)
    try {
      const narrowState = await narrow.page.evaluate(() => {
        const inspector = document.querySelector('.inspector') as HTMLElement
        const composer = document.querySelector('.composer') as HTMLElement
        const send = document.querySelector('.send') as HTMLButtonElement
        const visible = (node: HTMLElement): boolean => {
          const rect = node.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= window.innerWidth + 1
        }
        const sendRect = send.getBoundingClientRect()
        const hit = document.elementFromPoint(sendRect.left + sendRect.width / 2, sendRect.top + sendRect.height / 2)
        return {
          inspectorDisplay: getComputedStyle(inspector).display,
          inspectorWidth: inspector.getBoundingClientRect().width,
          composerVisible: visible(composer),
          sendVisible: visible(send),
          sendHit: hit === send || send.contains(hit),
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        }
      })
      expect(narrowState.inspectorDisplay).toBe('none')
      expect(narrowState.inspectorWidth).toBe(0)
      expect(narrowState.composerVisible).toBe(true)
      expect(narrowState.sendVisible).toBe(true)
      expect(narrowState.sendHit).toBe(true)
      expect(narrowState.horizontalOverflow).toBe(false)
    } finally {
      await narrow.context.close()
    }

    // 1600：右栏正常显示，与 Composer 不重叠，关键区块完整在视口内且未被浮层盖住
    const wide = await openPage(1600, 1000, shell)
    try {
      await wide.page.evaluate((markup: string) => {
        const current = document.querySelector('.inspector')
        if (current) current.outerHTML = markup
      }, panelMarkup)
      const state = await wide.page.evaluate(() => {
        const inspector = document.querySelector('.inspector') as HTMLElement
        const composer = document.querySelector('.composer') as HTMLElement
        const send = document.querySelector('.send') as HTMLElement
        const visibleRatio = (node: HTMLElement): number => {
          const rect = node.getBoundingClientRect()
          const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0))
          const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0))
          return rect.width * rect.height === 0 ? 0 : (width * height) / (rect.width * rect.height)
        }
        const covered = (node: HTMLElement): boolean => {
          const rect = node.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return !(hit === node || node.contains(hit))
        }
        const keys = [...document.querySelectorAll<HTMLElement>('.insp-spec-status, .insp-block-head')]
        const inspectorRect = inspector.getBoundingClientRect()
        const composerRect = composer.getBoundingClientRect()
        const sendRect = send.getBoundingClientRect()
        return {
          inspectorDisplay: getComputedStyle(inspector).display,
          inspectorWidth: inspectorRect.width,
          overlapWithComposer: inspectorRect.left < composerRect.right && inspectorRect.right > composerRect.left && inspectorRect.top < composerRect.bottom && inspectorRect.bottom > composerRect.top,
          overlapWithSend: inspectorRect.left < sendRect.right && inspectorRect.right > sendRect.left && inspectorRect.top < sendRect.bottom && inspectorRect.bottom > sendRect.top,
          keyCount: keys.length,
          ratios: keys.map(visibleRatio),
          coveredFlags: keys.map(covered),
        }
      })
      expect(state.inspectorDisplay).not.toBe('none')
      expect(state.inspectorWidth).toBeGreaterThan(0)
      expect(state.overlapWithComposer).toBe(false)
      expect(state.overlapWithSend).toBe(false)
      expect(state.keyCount).toBe(5) // 1 个状态块 + 4 块折叠头
      for (const ratio of state.ratios) expect(ratio).toBeGreaterThan(0.99)
      expect(state.coveredFlags).toEqual([false, false, false, false, false])
    } finally {
      await wide.context.close()
    }
  })
})
