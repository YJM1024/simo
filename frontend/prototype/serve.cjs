const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const root = __dirname
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  let p = decodeURIComponent(url.pathname)
  if (p === '/') p = '/index.html'
  if (p.startsWith('/prototype/')) p = p.slice('/prototype'.length)
  const file = path.join(root, p)
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('not found')
    return
  }
  const type = file.endsWith('.css') ? 'text/css; charset=utf-8'
    : file.endsWith('.js') ? 'text/javascript; charset=utf-8'
      : 'text/html; charset=utf-8'
  res.writeHead(200, { 'content-type': type })
  fs.createReadStream(file).pipe(res)
}).listen(8899, '127.0.0.1', () => console.log('prototype on http://127.0.0.1:8899'))
