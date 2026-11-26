// AC-TASK-001-01 概览任务块默认 3 行、展开后上限 50 行与分页
// 覆盖：默认 3 行的标题/状态逐行一致；55 条任务时概览仍只展示 3 行且“还有 N 个”；
// 进入任务标签首屏按合同上限 50 行，加载更多后补齐 55 行；接口 taskLimit 边界
// （1/3/50 合法，0/51 返回 400 invalid_task_limit）。
// 证据：接口 groups/items 与 DOM 行、任务卡逐条标题对照；断言 29 条（以本轮运行结果为准）。
import {
  runAc, createSession, createBatch, api, detail, list, execDb, queryRows, waitFor, sleep, BASE,
} from './lib/conv-backend.mjs'
import { startDistServer, openConversation } from './lib/conversation-ui.mjs'
import { waitFor as uiWaitFor, count, text, clickSel } from './lib/task-ui-helpers.mjs'

const AC = 'AC-TASK-001-01'
const TERMINAL = new Set(['done', 'failed', 'cancelled', 'interrupted'])

async function settle(sessionId, ids) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const res = await list(sessionId, '?limit=100')
    const byId = new Map((res.json?.tasks || []).map((t) => [t.id, t.status]))
    const pending = ids.filter((id) => !TERMINAL.has(byId.get(id))).length
    if (pending === 0) return
    await sleep(200)
  }
  throw new Error('任务未在 60s 内进入终态')
}

async function seed(title, taskTitles) {
  const sessionId = await createSession(title)
  const batch = await createBatch(sessionId, {
    mode: 'plan',
    goal: title,
    tasks: taskTitles.map((t, i) => ({ key: `t${i + 1}`, title: t, mode: 'plan', goal: t })),
    clientMutationId: `ac-001-01-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  })
  const ids = (batch.json.tasks || []).map((t) => t.id)
  const batchId = batch.json.batch?.id || ''
  await settle(sessionId, ids)
  return { sessionId, ids, batchId }
}

async function pinTask(sessionId, taskId, status, progress) {
  execDb('UPDATE tasks SET status = ?, progress = ?, updated_at = ? WHERE id = ?', [status, progress, Date.now(), taskId])
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const r = await detail(sessionId, taskId)
    if (r.json?.task?.status === status && Number(r.json?.task?.progress) === progress) return
    await sleep(150)
  }
  throw new Error(`任务 ${taskId} 未能固定到 ${status}/${progress}`)
}

function cloneTasks(sourceId, total) {
  const cols = queryRows('PRAGMA table_info(tasks)').map((c) => c.name).filter((c) => c !== 'id')
  const colList = cols.join(', ')
  const insert = `INSERT INTO tasks (id, ${colList}) SELECT ?, ${colList} FROM tasks WHERE id = ?`
  const base = Date.now()
  for (let i = 2; i <= total; i += 1) {
    const id = `fx-00101-${i}-${base}`
    execDb(insert, [id, sourceId])
    execDb(
      "UPDATE tasks SET title = ?, status = 'done', progress = 100, updated_at = ?, created_at = ? WHERE id = ?",
      [`分页任务 ${String(i).padStart(2, '0')}`, base + i, base + i, id],
    )
  }
}

function projectionItems(json) {
  const tasks = json?.tasks || {}
  // 与右栏概览一致：running → pending → done 依次拼接。
  return [...(tasks.running?.items || []), ...(tasks.pending?.items || []), ...(tasks.done?.items || [])]
}

async function rowsOf(client) {
  return client.evaluate(`(() => Array.from(document.querySelectorAll('#insp-block-tasks .exec-row')).map((el) => {
    const title = el.querySelector('.exec-title')?.textContent?.trim() || ''
    const status = el.querySelector('.exec-time')?.textContent?.trim() || ''
    return { id: el.getAttribute('data-task-id') || '', title, status }
  }))()`)
}

async function cardTitles(client) {
  return client.evaluate(`(() => Array.from(document.querySelectorAll('.task-card')).map((el) => el.querySelector('.task-card-title')?.textContent?.trim() || ''))()`)
}

async function acCase(ctx) {
  // 第一段：3 条任务时的默认展示与逐行对照。
  const main = await seed('AC-001-01 概览三分组', ['任务甲：整理结论', '任务乙：核对数据', '任务丙：输出摘要'])
  await pinTask(main.sessionId, main.ids[0], 'done', 100)
  await pinTask(main.sessionId, main.ids[1], 'running', 40)
  await pinTask(main.sessionId, main.ids[2], 'queued', 0)

  const proj = await api('GET', `/api/sessions/${main.sessionId}/spec-projection?taskLimit=3`)
  ctx.check(proj.status === 200, 'spec-projection 返回 200', 200, proj.status, 'R-API')
  const tasks = proj.json?.tasks || {}
  const items = projectionItems(proj.json)
  ctx.check(Boolean(tasks.done && tasks.running && tasks.pending), 'tasks 含 done/running/pending 三组', true, Object.keys(tasks), 'R-DATA')
  ctx.check(items.length === 3, 'taskLimit=3 时 items 为 3 条', 3, items.length, 'R-API')
  ctx.check(tasks.running?.total === 1, 'running.total 为 1', 1, tasks.running?.total, 'R-DATA')
  ctx.check(tasks.pending?.total === 1, 'pending.total 为 1', 1, tasks.pending?.total, 'R-DATA')
  ctx.check(tasks.done?.total === 1, 'done.total 为 1', 1, tasks.done?.total, 'R-DATA')
  const apiTitles = items.map((t) => t.title)

  const server = await startDistServer({ apiBase: BASE })
  let client = await openConversation(main.sessionId, { url: server.url })
  try {
    await uiWaitFor(client, `document.querySelectorAll('#insp-block-tasks .exec-row').length === 3`, { label: '概览任务块 3 行' })
    const rows = await rowsOf(client)
    ctx.check(rows.length === items.length, 'DOM 行数等于接口 items 条数', items.length, rows.length, 'R-UI')
    ctx.check(rows.length === 3, 'DOM 默认展示 3 行', 3, rows.length, 'R-UI')
    ctx.check(JSON.stringify(rows.map((r) => r.title)) === JSON.stringify(apiTitles), 'DOM 逐行标题与接口一致', JSON.stringify(apiTitles), JSON.stringify(rows.map((r) => r.title)), 'R-UI')
    ctx.check(rows.every((r) => r.title.length > 0), '每行标题非空', true, rows.map((r) => r.title.length), 'R-UI')
    ctx.check(rows.every((r) => ['已完成', '进行中', '失败', '未开始'].includes(r.status)), '每行状态文案可识别', true, rows.map((r) => r.status), 'R-UI')
    ctx.check((await count(client, '#insp-block-tasks .exec-row')) === 3, '无更多任务时仍为 3 行', 3, await count(client, '#insp-block-tasks .exec-row'), 'R-UI')

    // 第二段：55 条任务时的 50 行上限与分页。
    const many = await seed('AC-001-01 五十五条分页', ['分页基线任务'])
    await pinTask(many.sessionId, many.ids[0], 'done', 100)
    cloneTasks(many.ids[0], 55)

    const totalRow = queryRows('SELECT COUNT(*) AS n FROM tasks WHERE session_id = ?', [many.sessionId])[0]
    ctx.check(Number(totalRow.n) === 55, '夹具落库 55 条任务', 55, Number(totalRow.n), 'R-DATA')

    const page3 = await api('GET', `/api/sessions/${many.sessionId}/spec-projection?taskLimit=3`)
    ctx.check(projectionItems(page3.json).length === 3, 'taskLimit=3 时 items 不超过 3 条', 3, projectionItems(page3.json).length, 'R-API')
    ctx.check(page3.json?.tasks?.done?.total === 55, 'done.total 统计全部 55 条', 55, page3.json?.tasks?.done?.total, 'R-API')
    ctx.check(page3.json?.tasks?.done?.hasMore === true, '3 条时有更多标记', true, page3.json?.tasks?.done?.hasMore, 'R-API')

    const page50 = await api('GET', `/api/sessions/${many.sessionId}/spec-projection?taskLimit=50`)
    ctx.check(projectionItems(page50.json).length === 50, 'taskLimit=50 时 items 为 50 条（合同上限）', 50, projectionItems(page50.json).length, 'R-API')
    ctx.check(page50.json?.tasks?.done?.hasMore === true, '50 条时仍有更多标记', true, page50.json?.tasks?.done?.hasMore, 'R-API')

    const page1 = await api('GET', `/api/sessions/${many.sessionId}/spec-projection?taskLimit=1`)
    ctx.check(projectionItems(page1.json).length === 1, 'taskLimit=1 时 items 为 1 条', 1, projectionItems(page1.json).length, 'R-API')

    const over = await api('GET', `/api/sessions/${many.sessionId}/spec-projection?taskLimit=51`)
    ctx.check(over.status === 400, 'taskLimit=51 返回 400', 400, over.status, 'R-API')
    ctx.check(over.json?.error?.code === 'invalid_task_limit', 'taskLimit=51 的错误码为 invalid_task_limit', 'invalid_task_limit', over.json?.error?.code, 'R-API')
    const zero = await api('GET', `/api/sessions/${many.sessionId}/spec-projection?taskLimit=0`)
    ctx.check(zero.status === 400, 'taskLimit=0 返回 400', 400, zero.status, 'R-API')

    client.close()
    client = await openConversation(many.sessionId, { url: server.url })
    await uiWaitFor(client, `document.querySelectorAll('#insp-block-tasks .exec-row').length === 3`, { label: '55 条会话概览 3 行' })
    const moreText = (await text(client, '#insp-block-tasks .insp-more')).trim()
    ctx.check(moreText === '还有 52 个', '概览“还有 N 个”提示 52 条', '还有 52 个', moreText, 'R-UI')

    await clickSel(client, '#insp-block-tasks .insp-more')
    await uiWaitFor(client, `document.querySelectorAll('.task-card').length === 50`, { label: '任务标签首屏 50 张卡', timeout: 12000 })
    const firstPage = await count(client, '.task-card')
    ctx.check(firstPage === 50, '任务标签首屏最多 50 行', 50, firstPage, 'R-UI')

    const list1 = await list(many.sessionId, '?limit=50')
    const firstIds = (list1.json?.tasks || []).map((t) => t.id)
    ctx.check(firstIds.length === 50, '列表接口首屏 50 条', 50, firstIds.length, 'R-API')

    const moreBtn = await client.evaluate(`(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === '加载更多'); if (!b) return false; b.click(); return true })()`)
    ctx.check(moreBtn === true, '存在并点击“加载更多”', true, moreBtn, 'R-UI')
    await uiWaitFor(client, `document.querySelectorAll('.task-card').length === 55`, { label: '分页补齐 55 张卡', timeout: 12000 })
    const allTitles = await cardTitles(client)
    ctx.check(allTitles.length === 55, '加载更多后共 55 行', 55, allTitles.length, 'R-UI')

    const list2 = await list(many.sessionId, `?limit=50&before=${encodeURIComponent(list1.json?.nextBefore || '')}`)
    const secondIds = (list2.json?.tasks || []).map((t) => t.id)
    ctx.check(secondIds.length === 5, '第二页接口返回 5 条', 5, secondIds.length, 'R-API')
    ctx.check(firstIds.length + secondIds.length === 55 && new Set([...firstIds, ...secondIds]).size === 55, '两页合计 55 条且无重复', 55, new Set([...firstIds, ...secondIds]).size, 'R-API')

    ctx.raw.sessionId = main.sessionId
    ctx.raw.manySessionId = many.sessionId
    ctx.raw.apiTitles = apiTitles
    ctx.raw.rows = rows
    ctx.raw.firstPage = firstPage
    ctx.raw.totalCards = allTitles.length
  } finally {
    try { client.close() } catch { /* 已关闭 */ }
    await server.close().catch(() => {})
  }
}

await runAc(AC, acCase, { timeoutMs: 120000 })
