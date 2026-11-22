// 前端快照构建（不改动 frontend/dist，不删除任何文件）
// 用法：node docs/testing/build-snapshot.mjs <outDir>
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..', '..')
const frontend = join(repo, 'frontend')
const out = resolve(process.argv[2] ?? join(here, 'build-snapshot'))
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

await mkdir(join(out, 'assets'), { recursive: true })

const tailwind = join(frontend, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs')
const css = spawnSync(process.execPath, [tailwind, '-i', join(frontend, 'src', 'styles.css'), '-o', join(out, 'assets', 'app.css'), '--minify'], { cwd: frontend, stdio: 'inherit' })
if (css.status !== 0) {
  console.error('tailwind failed', css.error, css.status, css.stderr || css.stdout)
  process.exit(css.status ?? 1)
}

const esbuildBin = join(frontend, 'node_modules', '.pnpm', 'esbuild@0.28.2', 'node_modules', '@esbuild', `win32-${process.arch}`, 'esbuild.exe')
const js = spawnSync(esbuildBin, [
  join(frontend, 'src', 'main.tsx'),
  '--bundle',
  '--minify',
  `--outfile=${join(out, 'assets', 'app.js')}`,
  '--target=es2022',
  '--format=esm',
  '--jsx=automatic',
  '--log-level=info',
], { cwd: frontend, stdio: 'inherit' })
if (js.status !== 0) {
  console.error('esbuild failed', js.error, js.status)
  process.exit(js.status ?? 1)
}

const html = await readFile(join(frontend, 'index.html'), 'utf8')
const stamped = html
  .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta name="build-id" content="${buildId}">`)
  .replace('/assets/app.css', `/assets/app.css?v=${buildId}`)
  .replace('/assets/app.js', `/assets/app.js?v=${buildId}`)
await writeFile(join(out, 'index.html'), stamped)
console.log(JSON.stringify({ out, buildId }))
