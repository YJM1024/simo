#!/usr/bin/env node
/**
 * 会话界面的只读辅助：把 verify-all 产出的前端（清单里的 build/frontend）起在空闲端口，/api 反代到当前隔离后端，
 * 再用 CDP 打开脚本自己创建的那个真实会话（localStorage 指向该 sessionId）。
 *
 * 这样做的好处是界面断言与接口断言共用同一份数据：不埋会话夹具、不改 dist、不碰 5174/8787，
 * 静态服务只做转发，卡片上的任务行与状态都来自隔离后端的真实响应。
 */
import { createServer as createHttpServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, waitFor, sleep } from '../../lib/ac-cdp.mjs'
import { frontendDir } from './core/bootstrap.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const DIST_DIR = path.resolve(here, '../../../frontend/dist')

/** 默认服务清单里的前端产物；清单缺失时退回本地 dist，供不经过 verify-all 的老脚本使用。 */
function defaultDistDir() {
  try { return frontendDir() } catch { return DIST_DIR }
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
}

/** 取一个空闲端口：先 bind 0 再释放，避免与 8787/8789/5174 冲突。 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** 起静态服务：dist 资源直读，/api 原样反代到 apiBase（含查询串与请求体）。 */
export async function startDistServer({ apiBase, port, distDir } = {}) {
  const api = new URL(apiBase)
  const root = distDir ? path.resolve(distDir) : defaultDistDir()
  const listenPort = port ?? (await freePort())
  const server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/api')) {
      const upstream = request({
        hostname: api.hostname,
        port: api.port || 80,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: `${api.hostname}:${api.port}` },
      }, (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers)
        up.pipe(res)
      })
      upstream.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('api unavailable')
      })
      req.pipe(upstream)
      return
    }
    const rel = url.pathname === '/' ? '/index.html' : url.pathname
    const file = path.resolve(root, `.${rel}`)
    if (!file.startsWith(root)) {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('forbidden')
      return
    }
    readFile(file)
      .then((body) => {
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
        res.end(body)
      })
      .catch(async () => {
        if (rel === '/index.html' || path.extname(rel) === '') {
          try {
            const html = await readFile(path.join(root, 'index.html'))
            res.writeHead(200, { 'content-type': TYPES['.html'], 'cache-control': 'no-store' })
            res.end(html)
            return
          } catch { /* fall through */ }
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('not found')
      })
  })
  // WebSocket：/api/events 等 upgrade 请求直连后端，页面才能收到 task.progress 等推送。
  const sockets = new Set()
  server.on('upgrade', (req, socket, head) => {
    if (!(req.url ?? '').startsWith('/api')) { socket.destroy(); return }
    const upstream = netConnect(Number(api.port || 80), api.hostname, () => {
      const lines = [`${req.method} ${req.url} HTTP/1.1`]
      const headers = { ...req.headers, host: `${api.hostname}:${api.port}` }
      // 页面与后端在真实部署里同源；测试里 dist 站在另一个端口，WS 的 Origin 会被后端按 Host 校验拒绝。
      // 反代把 Origin 改写成后端自己的源，语义上仍是「同源直连」，不改后端校验。
      if (headers.origin) headers.origin = `http://${api.hostname}:${api.port}`
      for (const [key, value] of Object.entries(headers)) {
        if (Array.isArray(value)) for (const item of value) lines.push(`${key}: ${item}`)
        else if (value !== undefined) lines.push(`${key}: ${value}`)
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (head && head.length > 0) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    sockets.add(upstream)
    sockets.add(socket)
    const drop = () => { upstream.destroy(); socket.destroy() }
    upstream.on('error', drop)
    socket.on('error', drop)
    upstream.on('close', () => sockets.delete(upstream))
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(listenPort, '127.0.0.1', resolve)
  })
  const actual = server.address().port
  return {
    url: `http://127.0.0.1:${actual}`,
    port: actual,
    apiBase,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) socket.destroy()
      sockets.clear()
      server.close(() => resolve())
      server.closeAllConnections?.()
    }),
  }
}

/**
 * 打开真实会话页面：新标签 + 每次新文档前预置 active-session，然后等右栏挂到该会话。
 * 返回 CDP client，调用方负责 close。
 */
export async function openConversation(sessionId, { url, timeout = 20000 } = {}) {
  const client = await connect(url, { newTarget: true })
  try {
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try {
        localStorage.setItem('simo.active-session', ${JSON.stringify(sessionId)});
        localStorage.removeItem('simo.insp.collapsed.' + ${JSON.stringify(sessionId)});
        localStorage.removeItem('simo.insp.overview.' + ${JSON.stringify(sessionId)});
      } catch (error) { /* about:blank 上没有 localStorage */ }`,
    })
    await client.navigate(`${url}/`)
    await waitFor(client, `document.querySelector('aside.inspector') !== null`, { timeout, label: '右栏骨架' })
    await waitFor(client, `document.querySelector('aside.inspector').getAttribute('data-session') === ${JSON.stringify(sessionId)}`, {
      timeout, label: `会话 ${sessionId} 成为当前会话`,
    })
    return client
  } catch (error) {
    client.close()
    throw error
  }
}

/** 一次取回汇总卡的全部界面事实，减少往返；卡片不存在时只返回 {cards:0}。 */
export function readSummaryCard(client) {
  return client.evaluate(`(() => {
    const cards = Array.from(document.querySelectorAll('.msg-task-summary'));
    const card = cards[0];
    if (!card) return { cards: 0 };
    const items = Array.from(card.querySelectorAll('.msg-task-summary-item'));
    const more = card.querySelector('.task-summary-more');
    const title = (el) => (el ? (el.textContent || '').trim() : '');
    return {
      cards: cards.length,
      batchId: card.getAttribute('data-batch-id'),
      head: title(card.querySelector('.msg-task-summary-head b')),
      preview: title(card.querySelector('.msg-task-summary-preview')),
      toggle: title(card.querySelector('.task-summary-toggle')),
      items: items.length,
      ids: items.map((el) => el.getAttribute('data-task-id')),
      titles: items.map((el) => title(el.querySelector('.msg-task-summary-title'))),
      statuses: items.map((el) => el.getAttribute('data-status')),
      more: more ? title(more) : null,
      moreCount: card.querySelectorAll('.task-summary-more').length,
    };
  })()`)
}

export { waitFor, sleep }
