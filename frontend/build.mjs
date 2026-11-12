import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, 'dist')
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
await rm(out, { recursive: true, force: true })
await mkdir(out, { recursive: true })

const tailwind = resolve(here, 'node_modules/@tailwindcss/cli/dist/index.mjs')
const css = spawnSync(process.execPath, [tailwind, '-i', resolve(here, 'src/styles.css'), '-o', resolve(out, 'assets/app.css'), '--minify'], {
  cwd: here,
  encoding: 'utf8',
})
if (css.status !== 0) {
  console.error(css.stderr || css.stdout)
  process.exit(css.status ?? 1)
}

await build({
  entryPoints: [resolve(here, 'src/main.tsx')],
  outfile: resolve(out, 'assets/app.js'),
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2022'],
  format: 'esm',
  jsx: 'automatic',
  logLevel: 'info',
})

const html = await readFile(resolve(here, 'index.html'), 'utf8')
const stamped = html
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="build-id" content="${buildId}">`)
  .replace('/assets/app.css', `/assets/app.css?v=${buildId}`)
  .replace('/assets/app.js', `/assets/app.js?v=${buildId}`)
await writeFile(resolve(out, 'index.html'), stamped)

const hash = (path) => createHash('sha256').update(path).digest('hex')
const jsHash = hash(await readFile(resolve(out, 'assets/app.js')))
const cssHash = hash(await readFile(resolve(out, 'assets/app.css')))
console.log('buildId', buildId)
console.log('app.js sha256', jsHash)
console.log('app.css sha256', cssHash)
console.log('build ok →', out)
