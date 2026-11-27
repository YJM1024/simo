// scripts/ac/lib/core/frontend-server.mjs
//
// 测试用前端静态服务：读 build/frontend（清单校验过的产物），把 /api 与 WebSocket 反代到隔离后端。
// 独立进程，由 batch-harness 以 DIST_DIR / PORT / API_PORT 启动；端口与后端由调用方分配。
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createServer as createNetServer, connect as netConnect } from 'node:net'
import path from 'node:path'

const root = path.resolve(process.env.DIST_DIR || 'build/frontend')
const apiHost = process.env.API_HOST || '127.0.0.1'
const apiPort = Number(process.env.API_PORT || 8789)
const port = Number(process.env.PORT || 8787)
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname.startsWith('/api')) {
    const upstream = request({ hostname: apiHost, port: apiPort, method: req.method, path: req.url, headers: { ...req.headers, host: `${apiHost}:${apiPort}` } }, (up) => {
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
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
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
  }
})

const sockets = new Set()
server.on('upgrade', (req, socket, head) => {
  if (!(req.url ?? '').startsWith('/api')) { socket.destroy(); return }
  const upstream = netConnect(apiPort, apiHost, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`]
    const headers = { ...req.headers, host: `${apiHost}:${apiPort}` }
    // 页面与后端端口不同，WS Origin 会被同源校验拒绝；这里改写为后端自己的源。
    if (headers.origin) headers.origin = `http://${apiHost}:${apiPort}`
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) for (const item of value) lines.push(`${key}: ${item}`)
      else if (value !== undefined) lines.push(`${key}: ${value}`)
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (head?.length) upstream.write(head)
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

server.listen(port, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, port, dist: root, api: `http://${apiHost}:${apiPort}` }))
})
process.on('SIGTERM', () => server.close(() => process.exit(0)))
