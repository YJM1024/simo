import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import App from '../app'
import { ConversationPanel, MessageItem } from '../components'
import { message } from '../test/fixtures'

// jsdom 没有布局引擎，量不出 scrollWidth/clientWidth；表格的横向滚动只能用真实 Chromium 断言（CDP 9223）。
const require = createRequire(import.meta.url)
const { chromium } = require('../../e2e/node_modules/playwright') as {
  chromium: { connectOverCDP: (url: string) => Promise<any> }
}

const tokensCss = readFileSync('src/styles/tokens.css', 'utf8')
const componentsCss = readFileSync('src/components/components.css', 'utf8')

const cdpUrl = process.env.MSG_TABLE_CDP_URL ?? 'http://127.0.0.1:9223'
let browser: any = null
try {
  browser = await chromium.connectOverCDP(cdpUrl)
} catch {
  browser = null
}

// 10 列宽表：每列保底 4.5em，10 列合计 585px，超过 1180 档的 460px 与 375 档的 297px 消息正文宽。
const COLUMNS = 10
const cells = (offset: number, render: (index: number) => string): string => `| ${Array.from({ length: COLUMNS }, (_, index) => render(index + offset)).join(' | ')} |`
const WIDE_TABLE = [
  cells(1, (index) => `指标${index}`),
  `| ${Array.from({ length: COLUMNS }, () => '---').join(' | ')} |`,
  cells(0, (index) => String(index + 1)),
  cells(10, (index) => String(index + 1)),
].join('\n')

// 三列短表：宽度仍在卡片内，用来守住"宽表才滚动、短表不滚动"这一条。
const SHORT_TABLE = ['| 名称 | 状态 | 数量 |', '| :--- | :---: | ---: |', '| 甲 | 完成 | 12 |', '| 乙 | 进行中 | 3 |'].join('\n')

function panelMarkup(): string {
  return renderToStaticMarkup(
    <ConversationPanel ariaLabel="当前会话消息">
      <div className="chat-inner">
        <MessageItem message={message({ id: 'tbl', text: WIDE_TABLE })} onCardAction={async () => undefined} />
        <MessageItem message={message({ id: 'tbl-short', text: SHORT_TABLE })} onCardAction={async () => undefined} />
      </div>
    </ConversationPanel>,
  )
}

describe.skipIf(!browser)('message table scrolls inside its wrapper in Chromium', () => {
  afterAll(async () => {
    await browser?.close()
  })

  async function openShell(width: number, height: number): Promise<{ context: any; page: any }> {
    const context = await browser.newContext({ viewport: { width, height } })
    const page = await context.newPage()
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0}${tokensCss}\n${componentsCss}</style></head><body>${renderToStaticMarkup(<App />)}</body></html>`,
    )
    await page.evaluate((markup: string) => {
      const host = document.querySelector('.chat-body')
      if (host) host.innerHTML = markup
    }, panelMarkup())
    return { context, page }
  }

  it.each([1180, 375])('keeps a %ipx wide table scrolling inside its own wrapper, not the page', async (width) => {
    const { context, page } = await openShell(width, 900)
    try {
      const measured = await page.evaluate(() => {
        const wraps = [...document.querySelectorAll<HTMLElement>('.msg-table-wrap')]
        const wrap = wraps[0]
        const short = wraps[1]
        const table = wrap.querySelector('table') as HTMLElement
        const msg = document.querySelector('.msg') as HTMLElement
        const msgText = document.querySelector('.msg-text') as HTMLElement
        const scroll = document.querySelector('.conversation-scroll') as HTMLElement
        return {
          wrapScrollWidth: wrap.scrollWidth,
          wrapClientWidth: wrap.clientWidth,
          tableWidth: Math.round(table.getBoundingClientRect().width),
          shortScrollWidth: short.scrollWidth,
          shortClientWidth: short.clientWidth,
          msgWidth: Math.round(msg.getBoundingClientRect().width),
          msgTextWidth: Math.round(msgText.getBoundingClientRect().width),
          scrollWidth: scroll.scrollWidth,
          scrollClientWidth: scroll.clientWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          docClientWidth: document.documentElement.clientWidth,
        }
      })
      // 宽表格比包裹层宽，同时在包裹层内部可横向滚动
      expect(measured.tableWidth).toBeGreaterThan(measured.wrapClientWidth)
      expect(measured.wrapScrollWidth).toBeGreaterThan(measured.wrapClientWidth)
      // 三列短表在同样宽度内放得下，不应出现内部滚动
      expect(measured.shortScrollWidth).toBeLessThanOrEqual(measured.shortClientWidth + 1)
      // 卡片与消息列不被表格撑开，横向滚动不落到会话列或页面上
      expect(measured.wrapClientWidth).toBeLessThanOrEqual(measured.msgTextWidth)
      expect(measured.msgWidth).toBeLessThanOrEqual(width)
      expect(measured.scrollWidth).toBeLessThanOrEqual(measured.scrollClientWidth + 1)
      expect(measured.docScrollWidth).toBeLessThanOrEqual(measured.docClientWidth + 1)
    } finally {
      await context.close()
    }
  })
})
