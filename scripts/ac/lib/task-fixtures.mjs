#!/usr/bin/env node
/**
 * task-fixtures.mjs —— P1-CONV 任务域（N1 批式建任务）测试夹具生成器
 *
 * 夹具写成可直接 POST 给后端 N1 接口的请求体，字段与 specs/backend/P1-CONV/spec.md
 * §17.4 的入参一致（mode / goal / inputs / constraints / tasks[] / deadlineAt /
 * clientMutationId，tasks[] 里再带 key / title / mode / goal / steps / dependsOn / joinMode）。
 * 产物文件写在 fixtures/task/artifacts/，字节数固定，大小与 sha256 写回 json 的 artifacts 字段。
 *
 * 用法：
 *   node scripts/ac/lib/task-fixtures.mjs --list
 *   node scripts/ac/lib/task-fixtures.mjs --emit <name>
 *   node scripts/ac/lib/task-fixtures.mjs --emit-all
 *   node scripts/ac/lib/task-fixtures.mjs --verify
 *   node scripts/ac/lib/task-fixtures.mjs --self-test
 *   可选：--out <目录> 改输出根目录；--now <ISO 时间或毫秒> 固定生成时刻
 *
 * 退出码：0 成功；1 校验或写盘失败；2 参数错误；--self-test 0/1。
 * 零外部依赖，只用 Node 内置模块。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../..')
const DEFAULT_OUT_DIR = path.join(ROOT, 'specs/test/P1-CONV/fixtures/task')
const ARTIFACT_SUBDIR = 'artifacts'
const FIXTURE_KIND = 'simo.task-fixture'
const GENERATED_BY = 'scripts/ac/lib/task-fixtures.mjs'
const FIXTURE_NAMES = [
  'batch-10',
  'batch-12',
  'chain-3',
  'steps-8',
  'explore-14',
  'graph-8',
  'graph-21',
  'history-20',
  'deadline-1m',
  'tools-403',
  'sessions-a-b',
]

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

function usage() {
  return [
    'usage: node scripts/ac/lib/task-fixtures.mjs --list',
    '       node scripts/ac/lib/task-fixtures.mjs --emit <name>',
    '       node scripts/ac/lib/task-fixtures.mjs --emit-all',
    '       node scripts/ac/lib/task-fixtures.mjs --verify',
    '       node scripts/ac/lib/task-fixtures.mjs --self-test',
    `       fixtures: ${FIXTURE_NAMES.join(', ')}`,
  ].join('\n')
}

/* ---------- 产物生成：字节数固定，内容确定 ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(buffer) {
  let a = 1
  let b = 0
  for (const byte of buffer) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** 用 zlib 的 stored（不压缩）块包装原始字节，避免压缩算法版本差异影响 sha256。 */
function zlibStored(raw) {
  const header = Buffer.from([0x78, 0x01])
  const block = Buffer.alloc(5)
  block[0] = 0x01
  block.writeUInt16LE(raw.length, 1)
  block.writeUInt16LE(~raw.length & 0xffff, 3)
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(adler32(raw), 0)
  return Buffer.concat([header, block, raw, tail])
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function makeMarkdown(size) {
  const head = [
    '# 会议纪要',
    '',
    '- 会议主题：任务域夹具联调（P1-CONV-009）',
    '- 参会：司墨产品、测试',
    '- 结论：按批式建任务推进，先做依赖链，再做多会话隔离。',
    '',
    '## 待办',
    '',
  ].join('\n') + '\n'
  const bullet = '- 待补：这里是一条占位纪要，用来让文件字节数保持稳定。\n'
  let text = head
  while (Buffer.byteLength(text, 'utf8') + Buffer.byteLength(bullet, 'utf8') <= size) {
    text += bullet
  }
  const remaining = size - Buffer.byteLength(text, 'utf8')
  if (remaining > 0) text += ' '.repeat(remaining)
  return Buffer.from(text, 'utf8')
}

function makePng(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const ihdrChunk = pngChunk('IHDR', ihdr)
  const raw = Buffer.from([0x00, 0x33, 0x66, 0x99, 0xff])
  const idatChunk = pngChunk('IDAT', zlibStored(raw))
  const iendChunk = pngChunk('IEND', Buffer.alloc(0))
  const fixed = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  const textBytes = size - fixed - 12 - Buffer.byteLength('Comment') - 1
  if (textBytes < 0) throw new Error(`png 目标字节数 ${size} 太小`)
  let text = 'simulated screenshot placeholder '
  while (Buffer.byteLength(text, 'ascii') < textBytes) text += 'simulated screenshot placeholder '
  text = text.slice(0, textBytes)
  const textData = Buffer.concat([Buffer.from('Comment', 'ascii'), Buffer.from([0x00]), Buffer.from(text, 'ascii')])
  return Buffer.concat([signature, ihdrChunk, pngChunk('tEXt', textData), idatChunk, iendChunk])
}

function makePdf(size) {
  const contentText = 'BT /F1 12 Tf 40 160 Td (SIMO task fixture placeholder) Tj ET'
  const contentBytes = Buffer.byteLength(contentText, 'ascii')
  const head = [
    '%PDF-1.4',
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${contentBytes} >>stream`,
    contentText,
    'endstream endobj',
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
    '',
  ].join('\n')
  const objectOffsets = []
  let cursor = 0
  for (const line of head.split('\n')) {
    if (/^\d+ 0 obj/.test(line)) objectOffsets.push(cursor)
    cursor += Buffer.byteLength(line, 'ascii') + 1
  }
  const buildXref = (startOffset) => {
    const rows = objectOffsets.map((offset, index) => `${String(offset).padStart(10, '0')} ${String(index + 1).padStart(5, '0')} n \n`)
    return `xref\n0 ${objectOffsets.length + 1}\n0000000000 65535 f \n${rows.join('')}trailer<< /Size ${objectOffsets.length + 1} /Root 1 0 R >>\n`
  }
  let pad = 0
  let xref = ''
  let total = 0
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const startOffset = Buffer.byteLength(head, 'ascii') + pad
    xref = buildXref(startOffset)
    total = startOffset + Buffer.byteLength(xref, 'ascii') + Buffer.byteLength(`startxref\n${startOffset}\n%%EOF\n`, 'ascii')
    const nextPad = size - total + pad
    if (nextPad === pad) break
    pad = nextPad
  }
  if (pad < 2) throw new Error(`pdf 目标字节数 ${size} 太小，需要留出 ${2 - pad} 字节`)
  const padding = '%' + ' '.repeat(pad - 2) + '\n'
  const body = head + padding
  const startOffset = Buffer.byteLength(body, 'ascii')
  const tail = buildXref(startOffset) + `startxref\n${startOffset}\n%%EOF\n`
  const pdf = Buffer.from(body + tail, 'ascii')
  if (pdf.length !== size) throw new Error(`pdf 长度 ${pdf.length} 与目标 ${size} 不一致`)
  return pdf
}

const ARTIFACT_SPECS = [
  {
    name: '会议纪要.md',
    size: 12345,
    mime: 'text/markdown',
    typeBadge: 'doc',
    ownerTaskKey: 'report',
    build: makeMarkdown,
  },
  {
    name: '截图.png',
    size: 45678,
    mime: 'image/png',
    typeBadge: 'image',
    ownerTaskKey: 'screenshot',
    build: makePng,
  },
  {
    name: '排期.pdf',
    size: 890,
    mime: 'application/pdf',
    typeBadge: 'doc',
    ownerTaskKey: 'schedule',
    build: makePdf,
  },
]

function buildArtifacts() {
  return ARTIFACT_SPECS.map((spec) => {
    const content = spec.build(spec.size)
    if (content.length !== spec.size) {
      throw new Error(`产物 ${spec.name} 生成 ${content.length} 字节，期望 ${spec.size}`)
    }
    return { ...spec, content, sha256: sha256(content) }
  })
}

/* ---------- N1 请求构造与校验 ---------- */

function makeTask({ key, title, mode = 'plan', goal, inputs, constraints, steps, dependsOn = [], joinMode = 'all' }) {
  const task = { key, title, mode, goal }
  if (inputs) task.inputs = inputs
  if (constraints) task.constraints = constraints
  if (steps) task.steps = steps
  if (dependsOn.length) task.dependsOn = [...dependsOn]
  task.joinMode = joinMode
  return task
}

function makeRequest({ mode = 'plan', goal, inputs = [], constraints = [], tasks, deadlineAt, clientMutationId }) {
  const request = { mode, goal, inputs, constraints, tasks }
  if (deadlineAt !== undefined) request.deadlineAt = deadlineAt
  request.clientMutationId = clientMutationId
  return request
}

/** 计算依赖分层；返回每层包含的 key，供夹具 expectations 使用。 */
function computeLayers(tasks) {
  const byKey = new Map(tasks.map((task) => [task.key, task]))
  const depth = new Map()
  const visit = (key) => {
    if (depth.has(key)) return depth.get(key)
    const task = byKey.get(key)
    const deps = task && Array.isArray(task.dependsOn) ? task.dependsOn : []
    const value = deps.length ? 1 + Math.max(...deps.map((dep) => visit(dep))) : 0
    depth.set(key, value)
    return value
  }
  for (const task of tasks) visit(task.key)
  const layers = []
  for (const task of tasks) {
    const level = depth.get(task.key) || 0
    if (!layers[level]) layers[level] = []
    layers[level].push(task.key)
  }
  return { layers: layers.filter(Boolean), maxLayer: layers.length }
}

function validateN1Request(request, { now = Date.now(), checkDeadline = true } = {}) {
  const errors = []
  const push = (message) => errors.push(message)
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return ['请求体必须是对象']
  }
  if (!['plan', 'explore'].includes(request.mode)) push(`mode 必须是 plan 或 explore，收到 ${request.mode}`)
  if (typeof request.goal !== 'string' || !request.goal.trim()) push('goal 必须是非空字符串')
  else if (request.goal.length > 2000) push(`goal 超过 2000 字（${request.goal.length}）`)

  for (const field of ['inputs', 'constraints']) {
    const list = request[field]
    if (!Array.isArray(list)) { push(`${field} 必须是数组`); continue }
    if (list.length > 20) push(`${field} 超过 20 条（${list.length}）`)
    list.forEach((item, index) => {
      if (typeof item !== 'string') push(`${field}[${index}] 必须是字符串`)
      else if (item.length > 500) push(`${field}[${index}] 超过 500 字（${item.length}）`)
    })
  }

  if (!Array.isArray(request.tasks)) {
    push('tasks 必须是数组')
  } else {
    if (request.tasks.length < 1 || request.tasks.length > 12) push(`tasks 需要 1..12 项，收到 ${request.tasks.length}`)
    const keys = new Set()
    for (const [index, task] of request.tasks.entries()) {
      const where = `tasks[${index}]`
      if (!task || typeof task !== 'object') { push(`${where} 必须是对象`); continue }
      if (typeof task.key !== 'string' || !task.key.trim()) push(`${where}.key 必须是非空字符串`)
      else if (keys.has(task.key)) push(`${where}.key 重复：${task.key}`)
      else keys.add(task.key)
      if (typeof task.title !== 'string' || task.title.length < 1 || task.title.length > 120) {
        push(`${where}.title 需要 1..120 字，收到 ${task.title ? task.title.length : 0}`)
      }
      if (!['plan', 'explore'].includes(task.mode)) push(`${where}.mode 必须是 plan 或 explore`)
      if (task.goal !== undefined && (typeof task.goal !== 'string' || !task.goal.trim() || task.goal.length > 2000)) {
        push(`${where}.goal 需要非空且不超过 2000 字`)
      }
      if (task.joinMode !== undefined && !['all', 'any', 'each'].includes(task.joinMode)) {
        push(`${where}.joinMode 必须是 all/any/each，收到 ${task.joinMode}`)
      }
      if (task.steps !== undefined) {
        if (task.mode === 'explore') push(`${where} 是 explore 模式，不应带 steps`)
        if (!Array.isArray(task.steps) || task.steps.length > 50) push(`${where}.steps 必须是数组且不超过 50 步`)
        else {
          task.steps.forEach((step, stepIndex) => {
            if (typeof step !== 'string' || !step.trim() || step.length > 200) {
              push(`${where}.steps[${stepIndex}] 需要非空且不超过 200 字`)
            }
          })
        }
      }
      if (task.dependsOn !== undefined) {
        if (!Array.isArray(task.dependsOn)) push(`${where}.dependsOn 必须是数组`)
        else {
          const seen = new Set()
          for (const dep of task.dependsOn) {
            if (dep === task.key) push(`${where}.dependsOn 不能依赖自己（${dep}）`)
            else if (!keys.has(dep) && !request.tasks.some((item) => item && item.key === dep)) {
              push(`${where}.dependsOn 指向批内不存在的 key：${dep}`)
            }
            if (seen.has(dep)) push(`${where}.dependsOn 重复：${dep}`)
            seen.add(dep)
          }
        }
      }
    }
    const cycle = findCycle(request.tasks)
    if (cycle) push(`dependsOn 存在环：${cycle.join(' -> ')}`)
  }

  if (request.deadlineAt !== undefined) {
    if (!Number.isFinite(request.deadlineAt) || !Number.isInteger(request.deadlineAt)) {
      push('deadlineAt 必须是毫秒时间戳整数')
    } else if (checkDeadline && request.deadlineAt <= now) {
      push(`deadlineAt 必须晚于当前时间（${request.deadlineAt} <= ${now}）`)
    }
  }
  if (typeof request.clientMutationId !== 'string' || !request.clientMutationId.trim()) {
    push('clientMutationId 必须是非空字符串')
  } else if (request.clientMutationId.length > 64) {
    push(`clientMutationId 超过 64 字（${request.clientMutationId.length}）`)
  }
  return errors
}

function findCycle(tasks) {
  const byKey = new Map()
  for (const task of tasks) if (task && task.key) byKey.set(task.key, task)
  const state = new Map()
  const stack = []
  const walk = (key) => {
    if (state.get(key) === 'done') return null
    if (state.get(key) === 'visiting') return [...stack.slice(stack.indexOf(key)), key]
    const task = byKey.get(key)
    if (!task) return null
    state.set(key, 'visiting')
    stack.push(key)
    for (const dep of task.dependsOn || []) {
      const found = walk(dep)
      if (found) return found
    }
    stack.pop()
    state.set(key, 'done')
    return null
  }
  for (const task of tasks) {
    if (!task || !task.key) continue
    const found = walk(task.key)
    if (found) return found
  }
  return null
}

/* ---------- 夹具定义 ---------- */

const SESSION_INPUTS = [
  '上周的指标快照：新增会话 1280、消息 9640、平均首响 1.8 秒。',
  '目标：把平均首响压到 1.2 秒以内。',
]

function baseInputs(extra = []) {
  return [...SESSION_INPUTS, ...extra]
}

const FIXTURES = {
  'batch-10': {
    description: '单批 10 条任务一次创建，验证批量创建、列表计数与批量进度。',
    usage: 'POST 一次 N1，断言创建 10 条、列表 total=10、无依赖层级全为 0。',
    build: ({ nowMs }) => {
      const tasks = Array.from({ length: 10 }, (_, index) => {
        const seq = String(index + 1).padStart(2, '0')
        return makeTask({
          key: `t${seq}`,
          title: `批量任务 ${seq}：整理第 ${index + 1} 组材料`,
          goal: `整理第 ${index + 1} 组输入材料并输出三条结论。`,
        })
      })
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [{
            label: 'batch-10-create',
            request: makeRequest({
              goal: '一次创建 10 条互不依赖的任务，用于批量建任务主路径。',
              inputs: baseInputs(['本批 10 条任务彼此无依赖。']),
              constraints: ['每条任务只处理一组材料。'],
              tasks,
              clientMutationId: 'fx-batch-10-001',
            }),
          }],
          expect: { accepted: 10, initialStatus: 'pending', layers: 1 },
        }],
        expect: {
          notes: ['10 条任务无依赖，图层只有 L0。', '列表 counts.total=10，其余状态为 0。'],
        },
        nowMs,
      }
    },
  },
  'batch-12': {
    description: '单批上限 12 条任务，验证边界值不触发 400。',
    usage: 'POST 一次 N1（12 条），再 POST 13 条应得 400（负例由 harness 另造）。',
    build: ({ nowMs }) => {
      const tasks = Array.from({ length: 12 }, (_, index) => {
        const seq = String(index + 1).padStart(2, '0')
        return makeTask({
          key: `u${seq}`,
          title: `上限任务 ${seq}：核对第 ${index + 1} 项清单`,
          goal: `核对第 ${index + 1} 项清单并标记是否通过。`,
          joinMode: index % 3 === 0 ? 'all' : index % 3 === 1 ? 'any' : 'each',
        })
      })
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [{
            label: 'batch-12-create',
            request: makeRequest({
              goal: '用单批上限 12 条验证 N1 的边界值。',
              inputs: baseInputs(['本批正好 12 条，属于允许的最大批量。']),
              constraints: ['不得拆成两次请求。'],
              tasks,
              clientMutationId: 'fx-batch-12-001',
            }),
          }],
          expect: { accepted: 12, initialStatus: 'pending', layers: 1 },
        }],
        expect: {
          notes: ['12 条是单批上限；13 条必须 400。', 'joinMode 覆盖 all/any/each 三种取值。'],
        },
        nowMs,
      }
    },
  },
  'chain-3': {
    description: '三层依赖链：8 条任务、按 all/any/each 三种 joinMode 汇聚。',
    usage: 'POST 一次 N1，观察 L1 只在前置完成后调度，L2 等 a3/b3/c3 全部完成。',
    build: ({ nowMs }) => {
      const tasks = [
        makeTask({ key: 'a1', title: 'L0 材料一：读取会议记录', goal: '读取会议记录并输出要点。' }),
        makeTask({ key: 'a2', title: 'L0 材料二：读取指标快照', goal: '读取指标快照并输出异常项。' }),
        makeTask({ key: 'a3', title: 'L0 材料三：读取访谈记录', goal: '读取访谈记录并输出结论。' }),
        makeTask({ key: 'c3', title: 'L0 独立任务：列风险清单', goal: '列出三条主要风险。' }),
        makeTask({ key: 'b1', title: 'L1 汇总一：合并会议与指标', goal: '把会议要点与指标异常合并成一份摘要。', dependsOn: ['a1'], joinMode: 'all' }),
        makeTask({ key: 'b2', title: 'L1 汇总二：任一份材料即可开写', goal: '基于任意一份材料先写摘要草稿。', dependsOn: ['a2'], joinMode: 'any' }),
        makeTask({ key: 'b3', title: 'L1 汇总三：逐份处理访谈', goal: '逐份处理访谈并输出结论。', dependsOn: ['a3'], joinMode: 'each' }),
        makeTask({ key: 'd3', title: 'L2 终稿：汇总三路输入', goal: '合并 a3、b3、c3 的结果输出终稿。', dependsOn: ['a3', 'b3', 'c3'], joinMode: 'each' }),
      ]
      const { layers } = computeLayers(tasks)
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [{
            label: 'chain-3-create',
            request: makeRequest({
              goal: '验证三层依赖链的调度顺序与 joinMode 语义。',
              inputs: baseInputs(['依赖只在本批内解析，跨批次依赖返回 400。']),
              constraints: ['前置未完成时下游任务保持 pending。', '不得跨批次声明依赖。'],
              tasks,
              clientMutationId: 'fx-chain-3-001',
            }),
          }],
          expect: {
            accepted: 8,
            layers,
            layerSizes: layers.map((layer) => layer.length),
            joins: { b1: 'all', b2: 'any', b3: 'each', d3: 'each' },
          },
        }],
        expect: {
          notes: [
            'L0 有 4 条（a1,a2,a3,c3），L1 有 3 条（b1,b2,b3），L2 有 1 条（d3）。',
            'joinMode=any 表示任一前置完成即可调度；each 表示逐份处理后再汇总。',
          ],
        },
        nowMs,
      }
    },
  },
  'steps-8': {
    description: '单条 plan 任务带 8 个步骤，验证 steps 的落库与详情回读顺序。',
    usage: 'POST 一次 N1，GET 任务详情（N3）按 seq 升序返回 8 步。',
    build: ({ nowMs }) => {
      const steps = Array.from({ length: 8 }, (_, index) => `步骤 ${index + 1}：读取第 ${index + 1} 段材料并记下一条结论`)
      const tasks = [
        makeTask({
          key: 'plan8',
          title: '八步计划：整理一周材料',
          goal: '按八个步骤整理一周材料并输出摘要。',
          steps,
        }),
      ]
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [{
            label: 'steps-8-create',
            request: makeRequest({
              goal: '验证 plan 模式的多步骤计划。',
              inputs: baseInputs(['计划固定 8 步，每步不超过 200 字。']),
              constraints: ['步骤顺序不得打乱。'],
              tasks,
              clientMutationId: 'fx-steps-8-001',
            }),
          }],
          expect: { accepted: 1, steps: 8, stepsOrder: 'seq 升序' },
        }],
        expect: { notes: ['每步文本不超过 200 字；总数不超过 50 步。'] },
        nowMs,
      }
    },
  },
  'explore-14': {
    description: 'explore 模式单条任务，假上游 react 模式产出 14 条轨迹。',
    usage: '以 mock-llm --mode react 启动假上游；POST 一次 N1，N3 详情返回 14 条 traces。',
    build: ({ nowMs }) => {
      const tasks = [
        makeTask({
          key: 'explore14',
          title: '探索任务：定位首响变慢的原因',
          mode: 'explore',
          goal: '探索首响变慢的可能原因，给出可验证的假设。',
        }),
      ]
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          mock: { mode: 'react', reactCount: 14 },
          requests: [{
            label: 'explore-14-create',
            request: makeRequest({
              goal: '验证 explore 模式只产轨迹、不带步骤计划。',
              inputs: baseInputs(['探索任务不写 steps。']),
              constraints: ['探索阶段不生成交付物。'],
              tasks,
              clientMutationId: 'fx-explore-14-001',
            }),
          }],
          expect: { accepted: 1, traces: 14, categories: ['think', 'action', 'observe'], steps: 0 },
        }],
        expect: { notes: ['explore 模式带 steps 会 400，负例由 harness 另造。', '轨迹 at 单调不减。'] },
        nowMs,
      }
    },
  },
  'graph-8': {
    description: '8 节点任务图：链式依赖、平行任务与一条失败分支。',
    usage: 'POST 一次 N1；mock 对任务 d 注入失败；GET 图（N8）应为 8 节点 3 边 3 层。',
    build: ({ nowMs }) => {
      const tasks = [
        makeTask({ key: 'a', title: '图节点 a：拉取原始数据', goal: '拉取原始数据并落盘。' }),
        makeTask({ key: 'b', title: '图节点 b：清洗数据', goal: '清洗数据并输出中间表。', dependsOn: ['a'] }),
        makeTask({ key: 'c', title: '图节点 c：生成指标', goal: '基于中间表生成指标。', dependsOn: ['b'] }),
        makeTask({ key: 'd', title: '图节点 d：尝试外部接口', goal: '调用外部接口补齐维度，本夹具注入失败。' }),
        makeTask({ key: 'e', title: '图节点 e：并行核对口径', goal: '核对指标口径。' }),
        makeTask({ key: 'f', title: '图节点 f：并行检查缺数', goal: '检查缺数与异常值。' }),
        makeTask({ key: 'g', title: '图节点 g：并行整理备注', goal: '整理分析备注。' }),
        makeTask({ key: 'h', title: '图节点 h：失败分支的下游', goal: '等待 d 完成后执行；d 失败时 h 保持未开始。', dependsOn: ['d'] }),
      ]
      const { layers } = computeLayers(tasks)
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          mock: { failures: [{ taskKey: 'd', message: 'mock 注入失败：外部接口超时', code: 'tool_timeout' }] },
          requests: [{
            label: 'graph-8-create',
            request: makeRequest({
              goal: '验证任务图的节点、边与分层计算。',
              inputs: baseInputs(['节点 d 会失败，节点 h 依赖它的失败结果。']),
              constraints: ['失败节点不阻塞平行任务。'],
              tasks,
              clientMutationId: 'fx-graph-8-001',
            }),
          }],
          expect: {
            accepted: 8,
            graph: { nodes: 8, edges: 3, layers: layers.length, layerSizes: layers.map((layer) => layer.length) },
            failedKeys: ['d'],
          },
        }],
        expect: {
          notes: ['边为 a->b、b->c、d->h，共 3 条。', 'e/f/g 与 a 同层，平行执行。', 'd 失败后 h 仍应被调度并收尾。'],
        },
        nowMs,
      }
    },
  },
  'graph-21': {
    description: '21 节点任务图，因单批上限 12 拆成两次 N1（12 + 9）。',
    usage: '同一会话连续 POST 两次 N1；第一次 12 条、第二次 9 条；跨批次不得声明依赖。',
    build: ({ nowMs }) => {
      const batchA = [
        makeTask({ key: 'n01', title: '图节点 01：采集入口', goal: '采集入口数据。' }),
        makeTask({ key: 'n02', title: '图节点 02：采集分支甲', goal: '采集分支甲。', dependsOn: ['n01'] }),
        makeTask({ key: 'n03', title: '图节点 03：采集分支乙', goal: '采集分支乙。', dependsOn: ['n01'] }),
        makeTask({ key: 'n04', title: '图节点 04：清洗甲', goal: '清洗分支甲。', dependsOn: ['n02'] }),
        makeTask({ key: 'n05', title: '图节点 05：清洗乙', goal: '清洗分支乙。', dependsOn: ['n03'] }),
        makeTask({ key: 'n06', title: '图节点 06：指标甲', goal: '生成指标甲。', dependsOn: ['n04'] }),
        makeTask({ key: 'n07', title: '图节点 07：指标乙', goal: '生成指标乙。', dependsOn: ['n05'] }),
        makeTask({ key: 'n08', title: '图节点 08：汇总甲', goal: '汇总指标甲。', dependsOn: ['n06'] }),
        makeTask({ key: 'n09', title: '图节点 09：汇总乙', goal: '汇总指标乙。', dependsOn: ['n07'] }),
        makeTask({ key: 'n10', title: '图节点 10：复核甲', goal: '复核汇总甲。', dependsOn: ['n08'] }),
        makeTask({ key: 'n11', title: '图节点 11：复核乙', goal: '复核汇总乙。', dependsOn: ['n09'] }),
        makeTask({ key: 'n12', title: '图节点 12：输出图表', goal: '输出图表。', dependsOn: ['n10'] }),
      ]
      const batchB = [
        makeTask({ key: 'n13', title: '图节点 13：会话侧采集', goal: '采集会话侧数据。' }),
        makeTask({ key: 'n14', title: '图节点 14：会话侧清洗', goal: '清洗会话数据。', dependsOn: ['n13'] }),
        makeTask({ key: 'n15', title: '图节点 15：会话指标甲', goal: '生成会话指标甲。', dependsOn: ['n14'] }),
        makeTask({ key: 'n16', title: '图节点 16：会话指标乙', goal: '生成会话指标乙。', dependsOn: ['n14'] }),
        makeTask({ key: 'n17', title: '图节点 17：会话指标汇总', goal: '汇总会话指标。', dependsOn: ['n15'] }),
        makeTask({ key: 'n18', title: '图节点 18：会话对比甲', goal: '对比会话指标甲。', dependsOn: ['n17'] }),
        makeTask({ key: 'n19', title: '图节点 19：会话对比乙', goal: '对比会话指标乙。', dependsOn: ['n17'] }),
        makeTask({ key: 'n20', title: '图节点 20：异常说明', goal: '说明异常项。', dependsOn: ['n17'] }),
        makeTask({ key: 'n21', title: '图节点 21：产出结论', goal: '产出结论。', dependsOn: ['n18'] }),
      ]
      const layersA = computeLayers(batchA).layers
      const layersB = computeLayers(batchB).layers
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [
            {
              label: 'graph-21-batch-A-12',
              request: makeRequest({
                goal: '第一批 12 个节点，构成 7 层子图。',
                inputs: baseInputs(['第一批正好 12 条，达到单批上限。']),
                constraints: ['第一批不得引用第二批的 key。'],
                tasks: batchA,
                clientMutationId: 'fx-graph-21-a',
              }),
            },
            {
              label: 'graph-21-batch-B-9',
              request: makeRequest({
                goal: '第二批 9 个节点，独立成 6 层子图。',
                inputs: baseInputs(['第二批 9 条，单独一次 N1。']),
                constraints: ['跨批次依赖会 400，两批必须各自闭环。'],
                tasks: batchB,
                clientMutationId: 'fx-graph-21-b',
              }),
            },
          ],
          expect: {
            accepted: 21,
            requests: 2,
            batchSizes: [12, 9],
            graph: {
              nodes: 21,
              edges: 19,
              layers: Math.max(layersA.length, layersB.length),
              layersPerBatch: [layersA.length, layersB.length],
            },
            runningBadge: 11,
          },
        }],
        expect: {
          notes: [
            '单批上限 12，21 节点必须拆成 12+9 两次 N1。',
            '第一批 11 条边、第二批 8 条边，合并后 19 条。',
            'runningBadge=11 用于验证列表角标只统计进行中的任务。',
          ],
        },
        nowMs,
      }
    },
  },
  'history-20': {
    description: '会话里预置 20 条历史消息后再建任务，验证 N3 的 context 不泄漏历史。',
    usage: '先在会话里造 20 条消息，再 POST 一次 N1；N3 详情 context.historyCount 必须为 0。',
    build: ({ nowMs }) => {
      const tasks = [
        makeTask({ key: 'history', title: '历史上下文任务：整理最近讨论', goal: '整理最近讨论并输出结论。' }),
      ]
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          setup: {
            priorMessages: 20,
            note: '20 条历史消息由 harness 通过会话消息接口预置，不计入 N1 入参。',
          },
          requests: [{
            label: 'history-20-create',
            request: makeRequest({
              goal: '验证任务详情不把会话历史当成任务上下文。',
              inputs: baseInputs(['任务入参只带本夹具声明的材料。']),
              constraints: ['不能读取会话历史作为任务输入。'],
              tasks,
              clientMutationId: 'fx-history-20-001',
            }),
          }],
          expect: { accepted: 1, context: { historyCount: 0 }, setupMessages: 20 },
        }],
        expect: {
          notes: ['N3 详情 context 只回统计值，historyCount 恒为 0。', '历史消息不进入 N1 请求体。'],
        },
        nowMs,
      }
    },
  },
  'deadline-1m': {
    description: 'T1 无截止时间、T2 为生成时刻后 60 秒，验证时限提醒与无时限任务不受影响。',
    usage: '在生成后尽快 POST 两次 N1；重放时按 rebase.deadlineAtFromNowMs 只重算 T2 的 deadlineAt。',
    build: ({ nowMs }) => {
      const t1 = makeTask({ key: 't1', title: '无时限任务：持续观察', goal: '持续观察材料，不设截止时间。', steps: ['读取材料', '记录观察'] })
      const t2 = makeTask({ key: 't2', title: '限时任务：一分钟内给出摘要', goal: '一分钟内给出三条结论。', steps: ['读取材料', '写出三条结论'] })
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          requests: [
            {
              label: 'deadline-1m-create-t1',
              request: makeRequest({
                goal: '验证无 deadlineAt 的任务不会被时限提醒。',
                inputs: baseInputs(['T1 不设截止时间。']),
                constraints: ['T1 在 90 秒观察窗口内状态不变、无提醒。'],
                tasks: [t1],
                clientMutationId: 'fx-deadline-1m-t1',
              }),
            },
            {
              label: 'deadline-1m-create-t2',
              request: makeRequest({
                goal: '验证 deadlineAt 的时限约束。',
                inputs: baseInputs(['T2 截止时间等于生成时刻加 60 秒。']),
                constraints: ['到点只发一条提醒，任务状态仍为 running。'],
                tasks: [t2],
                deadlineAt: nowMs + 60000,
                clientMutationId: 'fx-deadline-1m-t2',
              }),
            },
          ],
          expect: { accepted: 2, deadlineOffsetMs: 60000, deadlineRule: 'deadlineAt > 当前时刻' },
        }],
        expect: { notes: ['T1 不带 deadlineAt，T2 带 now+60s；重放时只把 T2 的 deadlineAt 改为当前时刻加 60 秒。'] },
        rebase: { deadlineAtFromNowMs: 60000 },
        nowMs,
      }
    },
  },
  'tools-403': {
    description: '工具调用被拒：第一次 read_file 成功，第二次越权返回 403，任务仍能收尾。',
    usage: '以 mock-llm --mode react 启动假上游；POST 一次 N1，N3 轨迹里应有 1 条 403 observe 且状态为 done。',
    build: ({ nowMs }) => {
      const tasks = [
        makeTask({ key: 'denied', title: '越权读文件被拒后收尾', goal: '读取允许范围内文件并给出结论。' }),
      ]
      return {
        sessions: [{
          id: 's1',
          createSession: false,
          mock: {
            mode: 'react',
            toolSequence: [
              { seq: 1, tool: 'read_file', args: { path: 'workspace/notes/ok.md' }, result: 'ok' },
              { seq: 2, tool: 'read_file', args: { path: '..\\..\\secret.txt' }, result: 'denied', status: 403, code: 'permission_denied' },
              { seq: 3, tool: null, result: 'final', text: '越权路径被拒绝，按允许范围给出结论。' },
            ],
          },
          requests: [{
            label: 'tools-403-create',
            request: makeRequest({
              goal: '验证工具越权返回 403 后不崩溃、不重试。',
              inputs: baseInputs(['允许范围只有 workspace/notes。']),
              constraints: ['403 后不得自动重试同一路径。'],
              tasks,
              clientMutationId: 'fx-tools-403-001',
            }),
          }],
          expect: {
            accepted: 1,
            traces: 3,
            denied: 1,
            finalStatus: 'done',
            executedActions: 1,
            observeWith403: 1,
          },
        }],
        expect: {
          notes: ['403 只记一条 observe，不重试。', '任务最终状态为 done，不是 failed。'],
        },
        nowMs,
      }
    },
  },
  'sessions-a-b': {
    description: '双会话 a/b 隔离：会话 a 建 3 条任务、会话 b 建 1 条，产物归属与列表互不串。',
    usage: '在会话 a、b 分别 POST 一次 N1；产物目录见 artifacts，N9 按会话分别列举。',
    build: ({ nowMs }) => {
      const sessionA = {
        id: 'a',
        createSession: true,
        requests: [{
          label: 'session-a-create',
          request: makeRequest({
            goal: '会话 a：整理会议纪要并输出三个文件。',
            inputs: baseInputs(['会话 a 的输入只属于 a。']),
            constraints: ['产物只出现在会话 a。'],
            tasks: [
              makeTask({
                key: 'report',
                title: '会话 a：写会议纪要',
                goal: '输出会议纪要 markdown。',
                steps: ['读取材料', '写纪要'],
              }),
              makeTask({
                key: 'screenshot',
                title: '会话 a：截图存档',
                goal: '生成一张截图占位。',
              }),
              makeTask({
                key: 'schedule',
                title: '会话 a：排期表',
                goal: '输出排期 pdf 占位。',
              }),
            ],
            clientMutationId: 'fx-sessions-a-001',
          }),
        }],
        expect: { accepted: 3, sessionId: 'a', artifacts: 3 },
      }
      const sessionB = {
        id: 'b',
        createSession: true,
        requests: [{
          label: 'session-b-create',
          request: makeRequest({
            goal: '会话 b：独立整理一份结论。',
            inputs: baseInputs(['会话 b 的输入只属于 b。']),
            constraints: ['不得读到会话 a 的产物。'],
            tasks: [
              makeTask({ key: 'summary', title: '会话 b：写结论', goal: '写三条结论。' }),
            ],
            clientMutationId: 'fx-sessions-b-001',
          }),
        }],
        expect: { accepted: 1, sessionId: 'b', artifacts: 0 },
      }
      return {
        sessions: [sessionA, sessionB],
        expect: {
          sessions: 2,
          isolation: '会话 a 的 3 个产物不出现在会话 b 的 N9 列表里。',
          notes: ['两个会话都用 createSession=true 新建，避免污染既有会话。'],
        },
        artifacts: true,
        nowMs,
      }
    },
  },
}

/* ---------- 组装、写盘与校验 ---------- */

function buildFixture(name, { nowMs = Date.now(), withArtifacts = true } = {}) {
  const definition = FIXTURES[name]
  if (!definition) throw new Error(`未知夹具 ${name}`)
  const built = definition.build({ nowMs })
  const fixture = {
    schemaVersion: 1,
    kind: FIXTURE_KIND,
    name,
    description: definition.description,
    usage: definition.usage,
    generatedAt: new Date(nowMs).toISOString(),
    generatedBy: GENERATED_BY,
  }
  if (built.rebase) fixture.rebase = built.rebase
  fixture.sessions = built.sessions
  fixture.expect = built.expect

  let artifacts = []
  if (withArtifacts && built.artifacts) {
    artifacts = buildArtifacts()
    fixture.artifacts = artifacts.map((artifact) => ({
      name: artifact.name,
      mime: artifact.mime,
      size: artifact.size,
      sha256: artifact.sha256,
      typeBadge: artifact.typeBadge,
      deliveryKind: 'user_delivery',
      ownerTaskKey: artifact.ownerTaskKey,
    }))
  }
  return { fixture, artifacts }
}

function validateFixture(fixture, { now = Date.now(), checkDeadline = true } = {}) {
  const errors = []
  const push = (message) => errors.push(message)
  if (fixture.kind !== FIXTURE_KIND) push(`kind 应为 ${FIXTURE_KIND}，收到 ${fixture.kind}`)
  if (fixture.schemaVersion !== 1) push(`schemaVersion 应为 1，收到 ${fixture.schemaVersion}`)
  if (fixture.name !== fixture.name.trim()) push('name 不应带空白')
  if (!Array.isArray(fixture.sessions) || !fixture.sessions.length) push('sessions 必须是非空数组')
  else {
    const ids = new Set()
    for (const [index, session] of fixture.sessions.entries()) {
      if (!session || typeof session.id !== 'string' || !session.id) push(`sessions[${index}].id 必须非空`)
      else if (ids.has(session.id)) push(`sessions[${index}].id 重复：${session.id}`)
      else ids.add(session.id)
      if (!Array.isArray(session.requests)) {
        push(`sessions[${index}].requests 必须是数组`)
        continue
      }
      if (!session.requests.length) {
        if (session.createSession !== true) {
          push(`sessions[${index}].requests 为空，只有 createSession=true 的会话可以只建会话不建任务`)
        }
        continue
      }
      for (const [requestIndex, entry] of session.requests.entries()) {
        if (!entry || typeof entry.label !== 'string' || !entry.label) {
          push(`sessions[${index}].requests[${requestIndex}].label 必须非空`)
        }
        const requestErrors = validateN1Request(entry && entry.request, { now, checkDeadline })
        for (const message of requestErrors) {
          push(`sessions[${index}].requests[${requestIndex}]：${message}`)
        }
      }
    }
  }
  if (!fixture.expect || typeof fixture.expect !== 'object') push('expect 必须是对象')
  if (fixture.artifacts) {
    if (fixture.name !== 'sessions-a-b') push('只有 sessions-a-b 携带 artifacts')
    for (const artifact of fixture.artifacts) {
      if (!FIXTURE_NAMES.length) continue
      if (!Number.isInteger(artifact.size) || artifact.size <= 0) push(`artifact ${artifact.name} 的 size 必须是正整数`)
      if (!/^[0-9a-f]{64}$/.test(artifact.sha256 || '')) push(`artifact ${artifact.name} 的 sha256 形状不对`)
      if (!['doc', 'sheet', 'image'].includes(artifact.typeBadge)) push(`artifact ${artifact.name} 的 typeBadge 非法`)
    }
  }
  return errors
}

function resolveOutDir(raw) {
  if (!raw) return DEFAULT_OUT_DIR
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT, raw)
}

function writeFixture(name, { outDir, nowMs }) {
  const { fixture, artifacts } = buildFixture(name, { nowMs })
  const errors = validateFixture(fixture, { now: nowMs, checkDeadline: true })
  if (errors.length) throw new Error(`${name} 校验失败：\n  - ${errors.join('\n  - ')}`)
  fs.mkdirSync(outDir, { recursive: true })
  const file = path.join(outDir, `${name}.json`)
  fs.writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
  const written = []
  if (artifacts.length) {
    const artifactDir = path.join(outDir, ARTIFACT_SUBDIR)
    fs.mkdirSync(artifactDir, { recursive: true })
    for (const artifact of artifacts) {
      const target = path.join(artifactDir, artifact.name)
      fs.writeFileSync(target, artifact.content)
      written.push({ path: target, size: artifact.content.length, sha256: artifact.sha256 })
    }
  }
  return { file, fixture, artifacts: written }
}

function listFixtures() {
  for (const name of FIXTURE_NAMES) {
    const definition = FIXTURES[name]
    const { fixture } = buildFixture(name, { withArtifacts: false })
    const requests = fixture.sessions.reduce((sum, session) => sum + session.requests.length, 0)
    const tasks = fixture.sessions.reduce(
      (sum, session) => sum + session.requests.reduce((inner, entry) => inner + entry.request.tasks.length, 0),
      0,
    )
    const artifactCount = name === 'sessions-a-b' ? ARTIFACT_SPECS.length : 0
    console.log(`${name}\t请求 ${requests} 个\t任务 ${tasks} 条\t产物 ${artifactCount} 个\t${definition.description}`)
  }
  console.log(`共 ${FIXTURE_NAMES.length} 个夹具`)
}

function verifyAll({ outDir, nowMs }) {
  const failures = []
  for (const name of FIXTURE_NAMES) {
    const file = path.join(outDir, `${name}.json`)
    const problems = []
    let fixture = null
    if (!fs.existsSync(file)) {
      problems.push(`缺少文件 ${file}`)
    } else {
      try {
        fixture = JSON.parse(fs.readFileSync(file, 'utf8'))
      } catch (error) {
        problems.push(`JSON 解析失败：${error.message}`)
      }
    }
    if (fixture) {
      if (fixture.name !== name) problems.push(`name 字段为 ${fixture.name}`)
      problems.push(...validateFixture(fixture, { now: nowMs, checkDeadline: false }))
      if (fixture.artifacts) {
        for (const artifact of fixture.artifacts) {
          const target = path.join(outDir, ARTIFACT_SUBDIR, artifact.name)
          if (!fs.existsSync(target)) { problems.push(`缺少产物 ${artifact.name}`); continue }
          const bytes = fs.readFileSync(target)
          if (bytes.length !== artifact.size) problems.push(`产物 ${artifact.name} 实际 ${bytes.length} 字节，json 记 ${artifact.size}`)
          const digest = sha256(bytes)
          if (digest !== artifact.sha256) problems.push(`产物 ${artifact.name} sha256 为 ${digest}，json 记 ${artifact.sha256}`)
        }
      }
    }
    if (problems.length) {
      failures.push(name)
      console.log(`FAIL ${name}：${problems.length} 处问题`)
      for (const problem of problems) console.log(`  - ${problem}`)
    } else {
      console.log(`PASS ${name}`)
    }
  }
  console.log(`\n共 ${FIXTURE_NAMES.length} 个夹具，失败 ${failures.length} 个`)
  return failures.length === 0 ? 0 : 1
}

/* ---------- 命令行与自检 ---------- */

function parseArgs(argv) {
  const options = { list: false, emit: null, emitAll: false, verify: false, selfTest: false, help: false, out: null, now: null }
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    const eq = raw.indexOf('=')
    const name = eq >= 0 ? raw.slice(0, eq) : raw
    const takeValue = () => {
      if (eq >= 0) return raw.slice(eq + 1)
      index += 1
      return argv[index]
    }
    if (raw === '--list') options.list = true
    else if (raw === '--emit-all') options.emitAll = true
    else if (raw === '--verify') options.verify = true
    else if (raw === '--self-test') options.selfTest = true
    else if (raw === '--help' || raw === '-h') options.help = true
    else if (name === '--emit') {
      const value = takeValue()
      if (!value) return { ok: false, error: '--emit 缺少夹具名' }
      if (!FIXTURE_NAMES.includes(value)) return { ok: false, error: `未知夹具 ${value}，可用 --list 查看` }
      options.emit = value
    } else if (name === '--out') {
      const value = takeValue()
      if (!value) return { ok: false, error: '--out 缺少目录' }
      options.out = value
    } else if (name === '--now') {
      const value = takeValue()
      if (!value) return { ok: false, error: '--now 缺少时间' }
      const parsed = /^\d+$/.test(value) ? Number(value) : Date.parse(value)
      if (!Number.isFinite(parsed) || parsed <= 0) return { ok: false, error: `--now 无法解析：${value}` }
      options.now = parsed
    } else {
      return { ok: false, error: `未知参数 ${raw}` }
    }
  }
  return { ok: true, options }
}

function runSelfTest() {
  const checks = []
  const check = (label, condition, detail = '') => checks.push({ label, ok: Boolean(condition), detail })
  const now = 1763899200000

  check('夹具清单为 11 个且顺序固定', FIXTURE_NAMES.length === 11 && new Set(FIXTURE_NAMES).size === 11)
  check('清单包含全部要求的名称', ['batch-10', 'batch-12', 'chain-3', 'steps-8', 'explore-14', 'graph-8', 'graph-21', 'history-20', 'deadline-1m', 'tools-403', 'sessions-a-b'].every((name) => FIXTURE_NAMES.includes(name)))

  const built = {}
  let buildFailed = null
  for (const name of FIXTURE_NAMES) {
    try {
      built[name] = buildFixture(name, { nowMs: now })
    } catch (error) {
      buildFailed = `${name}: ${error.message}`
      break
    }
  }
  check('11 个夹具都能在内存构建', buildFailed === null, buildFailed || '')
  if (buildFailed === null) {
    for (const name of FIXTURE_NAMES) {
      const errors = validateFixture(built[name].fixture, { now, checkDeadline: true })
      check(`夹具 ${name} 通过 N1 校验`, errors.length === 0, errors.slice(0, 3).join('；'))
    }
    const tasksOf = (name) => built[name].fixture.sessions.flatMap((session) => session.requests.map((entry) => entry.request.tasks))
    check('batch-10 有 10 条任务', tasksOf('batch-10')[0].length === 10)
    check('batch-12 有 12 条任务', tasksOf('batch-12')[0].length === 12)
    check('chain-3 有 8 条任务、3 层', tasksOf('chain-3')[0].length === 8 && built['chain-3'].fixture.sessions[0].expect.layers.length === 3)
    check('steps-8 的任务带 8 步', tasksOf('steps-8')[0][0].steps.length === 8)
    check('explore-14 为 explore 且不带 steps', tasksOf('explore-14')[0][0].mode === 'explore' && tasksOf('explore-14')[0][0].steps === undefined)
    check('graph-8 为 8 节点 3 边', built['graph-8'].fixture.sessions[0].expect.graph.nodes === 8 && built['graph-8'].fixture.sessions[0].expect.graph.edges === 3)
    check('graph-21 拆成两次请求 12+9', built['graph-21'].fixture.sessions[0].requests.length === 2
      && tasksOf('graph-21').every((tasks) => tasks.length <= 12)
      && tasksOf('graph-21').reduce((sum, tasks) => sum + tasks.length, 0) === 21)
    check('history-20 预置 20 条历史', built['history-20'].fixture.sessions[0].setup.priorMessages === 20
      && built['history-20'].fixture.sessions[0].expect.context.historyCount === 0)
    const deadlineRequests = built['deadline-1m'].fixture.sessions.flatMap((session) => session.requests.map((entry) => entry.request))
    const withDeadline = deadlineRequests.filter((request) => request.deadlineAt !== undefined)
    check('deadline-1m 为 2 条请求且恰有 1 条带 deadlineAt', deadlineRequests.length === 2 && withDeadline.length === 1)
    check('deadline-1m 的 deadlineAt 落在 now+55s 至 now+65s', withDeadline.length === 1
      && withDeadline[0].deadlineAt - now >= 55000
      && withDeadline[0].deadlineAt - now <= 65000)
    check('tools-403 的 mock 含 403 调用', built['tools-403'].fixture.sessions[0].mock.toolSequence[1].status === 403)
    check('sessions-a-b 有两个会话与 3 个产物', built['sessions-a-b'].fixture.sessions.length === 2
      && built['sessions-a-b'].fixture.artifacts.length === 3)
    check('sessions-a-b 的产物字节数固定为 12345/45678/890',
      built['sessions-a-b'].fixture.artifacts.map((artifact) => artifact.size).join(',') === '12345,45678,890')

    const artifacts = built['sessions-a-b'].artifacts
    check('产物 md 长度 12345', artifacts[0].content.length === 12345)
    check('产物 png 长度 45678 且签名正确', artifacts[1].content.length === 45678
      && artifacts[1].content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    check('产物 png 以 IEND 结尾', artifacts[1].content.subarray(-8, -4).toString('ascii') === 'IEND')
    check('产物 pdf 长度 890 且头尾正确', artifacts[2].content.length === 890
      && artifacts[2].content.subarray(0, 5).toString('ascii') === '%PDF-'
      && artifacts[2].content.toString('ascii').trimEnd().endsWith('%%EOF'))
    check('产物 sha256 与 json 记录一致',
      built['sessions-a-b'].fixture.artifacts.every((artifact, index) => artifact.sha256 === sha256(artifacts[index].content)))
    check('产物生成可重复（两次 sha256 相同）',
      buildArtifacts().every((artifact, index) => artifact.sha256 === artifacts[index].sha256))

    const json = JSON.stringify(built['chain-3'].fixture)
    check('夹具可 JSON 序列化并往返', JSON.parse(json).name === 'chain-3')
  }

  const goodRequest = {
    mode: 'plan',
    goal: '自检用的合法请求',
    inputs: ['一条输入'],
    constraints: [],
    tasks: [
      { key: 'x1', title: '任务一', mode: 'plan', goal: '做一', joinMode: 'all' },
      { key: 'x2', title: '任务二', mode: 'plan', goal: '做二', dependsOn: ['x1'], joinMode: 'all' },
    ],
    clientMutationId: 'self-test-1',
  }
  check('合法请求零错误', validateN1Request(goodRequest, { now, checkDeadline: true }).length === 0)

  const tooMany = { ...goodRequest, tasks: Array.from({ length: 13 }, (_, index) => ({ key: `k${index}`, title: `任务${index}`, mode: 'plan', joinMode: 'all' })) }
  check('13 条任务报错', validateN1Request(tooMany, { now }).some((message) => message.includes('1..12')))
  const duplicate = { ...goodRequest, tasks: [{ key: 'x1', title: 'a', mode: 'plan' }, { key: 'x1', title: 'b', mode: 'plan' }] }
  check('重复 key 报错', validateN1Request(duplicate, { now }).some((message) => message.includes('重复')))
  const selfDep = { ...goodRequest, tasks: [{ key: 'x1', title: 'a', mode: 'plan', dependsOn: ['x1'] }] }
  check('自依赖报错', validateN1Request(selfDep, { now }).some((message) => message.includes('不能依赖自己')))
  const cyclic = {
    ...goodRequest,
    tasks: [
      { key: 'x1', title: 'a', mode: 'plan', dependsOn: ['x2'] },
      { key: 'x2', title: 'b', mode: 'plan', dependsOn: ['x1'] },
    ],
  }
  check('依赖环报错', validateN1Request(cyclic, { now }).some((message) => message.includes('环')))
  const missingDep = { ...goodRequest, tasks: [{ key: 'x1', title: 'a', mode: 'plan', dependsOn: ['nope'] }] }
  check('跨批次/不存在的依赖报错', validateN1Request(missingDep, { now }).some((message) => message.includes('不存在')))
  const exploreSteps = { ...goodRequest, mode: 'explore', tasks: [{ key: 'x1', title: 'a', mode: 'explore', steps: ['一步'] }] }
  check('explore 带 steps 报错', validateN1Request(exploreSteps, { now }).some((message) => message.includes('不应带 steps')))
  const pastDeadline = { ...goodRequest, deadlineAt: now - 1 }
  check('过期 deadlineAt 报错', validateN1Request(pastDeadline, { now, checkDeadline: true }).some((message) => message.includes('deadlineAt')))
  const badJoin = { ...goodRequest, tasks: [{ key: 'x1', title: 'a', mode: 'plan', joinMode: 'some' }] }
  check('非法 joinMode 报错', validateN1Request(badJoin, { now }).some((message) => message.includes('joinMode')))

  const parsed = parseArgs(['--emit', 'chain-3', '--out', '.tmp/x', '--now', String(now)])
  check('参数解析 --emit/--out/--now', parsed.ok && parsed.options.emit === 'chain-3'
    && parsed.options.out === '.tmp/x' && parsed.options.now === now)
  check('未知参数报错', parseArgs(['--bogus']).ok === false)
  check('未知夹具名报错', parseArgs(['--emit', 'nope']).ok === false)

  let failed = 0
  for (const item of checks) {
    if (!item.ok) failed += 1
    console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.label}${item.ok || !item.detail ? '' : `（${item.detail}）`}`)
  }
  console.log(`共 ${checks.length} 项，失败 ${failed} 项`)
  console.log(failed === 0 ? 'SELF-TEST PASS' : 'SELF-TEST FAILED')
  return failed === 0 ? 0 : 1
}

function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (!parsed.ok) {
    console.error(parsed.error)
    console.error(usage())
    process.exit(2)
  }
  const { options } = parsed
  if (options.help) {
    console.log(usage())
    process.exit(0)
  }
  const outDir = resolveOutDir(options.out)
  const nowMs = options.now === null ? Date.now() : options.now

  if (options.selfTest) {
    console.log('自检：离线构建 11 个夹具与产物，只校验形状，不写盘、不联网')
    process.exit(runSelfTest())
  }
  if (options.list) {
    listFixtures()
    process.exit(0)
  }
  if (options.verify) {
    process.exit(verifyAll({ outDir, nowMs }))
  }
  if (options.emit || options.emitAll) {
    const names = options.emitAll ? FIXTURE_NAMES : [options.emit]
    let failed = 0
    for (const name of names) {
      try {
        const result = writeFixture(name, { outDir, nowMs })
        console.log(`WROTE ${path.relative(ROOT, result.file)}`)
        for (const artifact of result.artifacts) {
          console.log(`  ARTIFACT ${path.relative(ROOT, artifact.path)} ${artifact.size} B sha256=${artifact.sha256.slice(0, 12)}…`)
        }
      } catch (error) {
        failed += 1
        console.error(`FAILED ${name}：${error.message}`)
      }
    }
    process.exit(failed === 0 ? 0 : 1)
  }
  console.error('缺少动作，需要 --list、--emit、--emit-all、--verify 或 --self-test')
  console.error(usage())
  process.exit(2)
}

main()
