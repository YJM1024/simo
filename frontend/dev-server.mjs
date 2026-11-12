import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import httpProxy from 'http-proxy'
const { createProxyServer } = httpProxy

const root = fileURLToPath(new URL('.', import.meta.url))
const api = process.env.SIMO_API ?? 'http://127.0.0.1:8877'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
const proxy = createProxyServer({ target: api, ws: true })
proxy.on('error', (_err, _req, res) => { if (!res) return; if (typeof res.writeHead === 'function' && !res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' }); if (typeof res.end === 'function' && !res.writableEnded) res.end('api unavailable'); else if (typeof res.destroy === 'function') res.destroy() })

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname.startsWith('/api')) {
    proxy.web(req, res, { target: api })
    return
  }
  const path = url.pathname === '/' ? '/index.html' : url.pathname
  const file = join(root, 'dist', path)
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    const body = await readFile(join(root, 'dist/index.html'))
    res.writeHead(200, { 'content-type': types['.html'] })
    res.end(body)
  }
})
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/api')) return socket.destroy()
  proxy.ws(req, socket, head)
})
server.listen(Number(process.env.PORT ?? 8898), '127.0.0.1', () => console.log(`dev on http://127.0.0.1:${process.env.PORT ?? 8898}`))
