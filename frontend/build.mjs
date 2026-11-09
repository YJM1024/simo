// frontend/build.mjs —— simo 前端构建（三步，契约 §7 / tech-stack §6）
//
//   1) tsc --noEmit            类型检查（esbuild 只转译，不查类型）
//   2) tailwindcss             CSS → frontend/dist/app.css（--minify）
//   3) esbuild                 JS/TS → frontend/dist/app.js
//
// 产物：frontend/dist/{app.js,app.css,index.html,icon.svg,icon-256.png}
// 内嵌：构建结束后复制到 backend/internal/webui/dist/，供 Go embed.FS 使用。
//
// 用法：node build.mjs [--watch]
// 说明：主入口 src/main.tsx 不 import CSS，CSS 完全由 Tailwind CLI 产出，避免重复出 CSS。

import { build, context } from 'esbuild'
import { spawn } from 'node:child_process'
import { copyFile, cp, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, 'dist')
const embedDir = resolve(here, '../backend/internal/webui/dist')
const watch = process.argv.includes('--watch')

const NODE = process.execPath
const TSC = resolve(here, 'node_modules/typescript/bin/tsc')
const TAILWIND_CLI = resolve(here, 'node_modules/@tailwindcss/cli/dist/index.mjs')

const cssTarget = resolve(outDir, 'app.css')
const cssEntry = resolve(here, 'src/styles.css')

await mkdir(outDir, { recursive: true })

/** 一次性的子进程执行，失败即抛出（带原样错误输出）。 */
function runOnce(label, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(NODE, args, { cwd: here, stdio: 'inherit', ...options })
    child.on('error', (error) => rejectPromise(new Error(`${label} 无法启动：${error.message}`)))
    child.on('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else rejectPromise(new Error(`${label} 失败（exit=${code ?? 'null'}${signal ? `, signal=${signal}` : ''}）`))
    })
  })
}

/** 长期运行的子进程（watch 模式），返回句柄。 */
function runWatch(label, args) {
  const child = spawn(NODE, args, { cwd: here, stdio: 'inherit' })
  child.on('error', (error) => console.error(`[${label}] 无法启动：`, error.message))
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`[${label}] 退出（exit=${code}）`)
  })
  return child
}

function typecheckArgs() {
  return [TSC, '--noEmit', '-p', resolve(here, 'tsconfig.json')]
}

function tailwindArgs({ watchMode }) {
  const args = [TAILWIND_CLI, '-i', cssEntry, '-o', cssTarget]
  if (!watchMode) args.push('--minify')
  if (watchMode) args.push('--watch', '--poll=250')
  return args
}

async function copyStatic() {
  // M15：index.html + 品牌图标（icon.svg / icon-256.png）一并复制进 dist
  for (const name of ['index.html', 'icon.svg', 'icon-256.png']) {
    await copyFile(resolve(here, 'public', name), resolve(outDir, name))
  }
}

async function copyEmbed() {
  await mkdir(embedDir, { recursive: true })
  await cp(outDir, embedDir, { recursive: true, force: true })
  console.log('前端产物已复制到 Go embed 目录 →', embedDir)
}

const esbuildOptions = {
  entryPoints: [resolve(here, 'src/main.tsx')],
  outfile: resolve(outDir, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: !watch,
  sourcemap: watch,
  jsx: 'automatic',
  target: ['es2020'],
  // 保留 UTF-8 文案（不被转义成 \uXXXX），便于打包产物检查与调试
  charset: 'utf8',
  loader: { '.svg': 'dataurl' },
  logLevel: 'info',
}

if (watch) {
  // 1) 类型检查持续跑（首次结果会打印在控制台）
  runWatch('tsc', [...typecheckArgs(), '--watch', '--preserveWatchOutput'])
  // 2) Tailwind watch（轮询模式，规避 @parcel/watcher 原生构建被 pnpm 忽略的问题）
  runWatch('tailwind', tailwindArgs({ watchMode: true }))
  // 3) esbuild watch + 复制 index.html
  const ctx = await context(esbuildOptions)
  await ctx.watch()
  await copyStatic()
  await copyEmbed()
  console.log('watch 模式：tsc + tailwind + esbuild 就绪；改 src/ 自动重建。')
} else {
  await runOnce('tsc 类型检查', typecheckArgs())
  await runOnce('tailwind CSS 构建', tailwindArgs({ watchMode: false }))
  await build(esbuildOptions)
  await copyStatic()
  await copyEmbed()
  console.log('前端构建完成 →', outDir)
}
