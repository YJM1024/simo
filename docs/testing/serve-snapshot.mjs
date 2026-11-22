// 静态快照 + /api 反代（只读测试服务，不写工作区）
// 用法：node docs/testing/serve-snapshot.mjs <distDir> <port> [apiBase]
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire('file:///E:/dsh_home/workspaces/agent/frontend/package.json')
const { createProxyServer } = require('http-proxy')

const root = resolve(process.argv[2])
const port = Number(process.argv[3] ?? 8898)
const api = process.argv[4] ?? 'http://127.0.0.1:8877'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
const proxy = createProxyServer({ target: api, ws: true })
proxy.on('error', (_err, _req, res) => { if (!res) return; if (typeof res.writeHead === 'function' && !res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); if (typeof res.end === 'function' && !res.writableEnded) res.end('api unavailable'); else if (typeof res.destroy === 'function') res.destroy() })

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname.startsWith('/api')) { proxy.web(req, res); return }
  const file = join(root, url.pathname === '/' ? 'index.html' : url.pathname)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    const body = await readFile(join(root, 'index.html'))
    res.writeHead(200, { 'content-type': types['.html'] })
    res.end(body)
  }
})
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/api')) return socket.destroy()
  proxy.ws(req, socket, head)
})
server.listen(port, '127.0.0.1', () => console.log(`snapshot ${root} on http://127.0.0.1:${port} -> ${api}`))
