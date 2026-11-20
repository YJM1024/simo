import { chromium } from 'playwright'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9223')
console.log('version', browser.version())
const contexts = browser.contexts()
console.log('contexts', contexts.length)
for (const [index, context] of contexts.entries()) {
  const pages = context.pages()
  console.log('ctx', index, 'pages', pages.length, pages.map((page) => page.url()))
}
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto('data:text/html,<h1>ok</h1>')
  console.log('newContext ok', await page.textContent('h1'))
  await context.close()
} catch (error) {
  console.log('newContext failed', String(error))
}
await browser.close()
