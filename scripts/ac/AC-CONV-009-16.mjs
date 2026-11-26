#!/usr/bin/env node
/**
 * AC-CONV-009-16（判据 CT-CONV-536 / TC-P1-CONV-052）
 * sessions-a-b 三份产物：类型徽标各 1 个、来源任务名各 1 个、下载 1 个文件且字节数等于响应 size
 * （会议纪要 12345 / 截图 45678 / 排期 890）。夹具按测试计划产物表落盘并登记 task_artifacts。
 * 同时覆盖交付物负例：limit=0/101 → 400 invalid_task_limit；跨会话 taskId → 200 空页。
 */
import { runAc, createSession, createBatch, api, seedArtifact, waitTaskStatus } from './lib/conv-backend.mjs'

const FILES = [
  { name: '会议纪要.md', mime: 'text/markdown', size: 12345, typeBadge: 'doc', taskTitle: '会话 a：写会议纪要' },
  { name: '截图.png', mime: 'image/png', size: 45678, typeBadge: 'image', taskTitle: '会话 a：截图存档' },
  { name: '排期.pdf', mime: 'application/pdf', size: 890, typeBadge: 'doc', taskTitle: '会话 a：排期表' },
]
// 失败任务也进交付物分组（conv.go:1896 改成 tasks LEFT JOIN task_artifacts），空组排在最后。
const FAILED_TITLE = 'mock:fail 会话 a 失败任务'

await runAc('AC-CONV-009-16', async (ctx) => {
  const sessionA = await createSession('AC-CONV-009-16 会话 a')
  const created = await createBatch(sessionA, {
    mode: 'plan', goal: '会话 a：整理会议纪要并输出三个文件。',
    inputs: ['会话 a 的输入只属于 a。'], constraints: ['产物只出现在会话 a。'],
    tasks: [
      ...FILES.map((f, i) => ({ key: `t${i}`, title: f.taskTitle, mode: 'plan', goal: `产出 ${f.name}。` })),
      { key: 'f', title: FAILED_TITLE, mode: 'plan', goal: '失败任务不产出交付物。' },
    ],
    clientMutationId: 'ac-conv-009-16-a',
  })
  ctx.eq(created.status, 201, '会话 a 创建 4 条任务 201（3 条成功 + 1 条失败）')
  const tasks = created.json.tasks
  const seeded = FILES.map((f, i) => seedArtifact(tasks[i].id, { name: f.name, mime: f.mime, size: f.size }))
  const failedTask = tasks.find((t) => t.title === FAILED_TITLE)
  ctx.check(Boolean(failedTask), '失败任务已建立', FAILED_TITLE, JSON.stringify(tasks.map((t) => t.title)))
  const failedRow = await waitTaskStatus(sessionA, failedTask.id, 'failed', 40000)
  ctx.eq(failedRow.task.status, 'failed', '失败任务进入 failed 状态')

  const res = await api('GET', `/api/sessions/${encodeURIComponent(sessionA)}/deliverables`)
  ctx.eq(res.status, 200, '交付物列表 200')
  const groups = (res.json && res.json.groups) || []
  ctx.eq(groups.length, 4, '按任务分成 4 组（含失败任务空组）')
  ctx.eq(res.json.total, 4, 'total=4 组')
  ctx.eq(res.json.fileCount, 3, 'fileCount=3（空组不计文件）')
  const files = groups.flatMap((g) => g.files || [])
  ctx.eq(files.length, 3, '共 3 个交付物')

  // 有产物的组排前面，空组排后面。
  const failedGroup = groups[groups.length - 1]
  ctx.eq(failedGroup && failedGroup.taskId, failedTask.id, '失败任务空组排在最后')
  ctx.eq(failedGroup && failedGroup.taskStatus, 'failed', '失败组 taskStatus=failed')
  ctx.eq(failedGroup && failedGroup.files.length, 0, '失败组 files 为空')
  ctx.eq(failedGroup && failedGroup.count, 0, '失败组 count=0')
  ctx.check(groups.slice(0, 3).every((g) => (g.files || []).length === 1 && g.count === 1),
    '前 3 组各有 1 个文件且 count=1', '每組 1 个文件', JSON.stringify(groups.map((g) => ({ id: g.taskId, n: (g.files || []).length, c: g.count }))))

  for (let i = 0; i < FILES.length; i += 1) {
    const want = FILES[i]
    const file = files.find((f) => f.name === want.name)
    if (!file) { ctx.check(false, `存在产物 ${want.name}`, want.name, '缺失'); continue }
    ctx.eq(file.typeBadge, want.typeBadge, `${want.name} 类型徽标 ${want.typeBadge}`)
    ctx.eq(file.size, want.size, `${want.name} 记录 size=${want.size}`)
    const group = groups.find((g) => g.taskId === file.taskId)
    ctx.eq(group && group.taskTitle, want.taskTitle, `${want.name} 来源任务名`)
    const dl = await api('GET', `/api/artifacts/${file.id}/content?download=1`)
    ctx.eq(dl.status, 200, `${want.name} 下载 200`)
    const bytes = Buffer.byteLength(dl.text, 'utf8')
    const len = Number(dl.headers.get('content-length'))
    ctx.eq(bytes, want.size, `${want.name} 下载字节数等于 size`)
    ctx.eq(len, want.size, `${want.name} Content-Length 等于 size`)
    ctx.check(Boolean(file.downloadUrl), `${want.name} downloadUrl 非空`, '非空', JSON.stringify(file.downloadUrl))
    ctx.check(Boolean(seeded[i].id), `${want.name} 夹具已登记`, 'artifact id', seeded[i].id)
  }

  const bad0 = await api('GET', `/api/sessions/${encodeURIComponent(sessionA)}/deliverables?limit=0`)
  ctx.eq(bad0.status, 400, '交付物 limit=0 返回 400')
  ctx.eq(bad0.json && bad0.json.code, 'invalid_task_limit', 'limit=0 失败码 invalid_task_limit')
  const bad101 = await api('GET', `/api/sessions/${encodeURIComponent(sessionA)}/deliverables?limit=101`)
  ctx.eq(bad101.status, 400, '交付物 limit=101 返回 400')

  // taskId 过滤到失败任务：仍返回 1 个空组，不是 404。
  const onlyFailed = await api('GET', `/api/sessions/${encodeURIComponent(sessionA)}/deliverables?taskId=${encodeURIComponent(failedTask.id)}`)
  ctx.eq(onlyFailed.status, 200, '按失败任务过滤 200')
  ctx.eq(onlyFailed.json.groups.length, 1, '按失败任务过滤返回 1 个空组')
  ctx.eq(onlyFailed.json.groups[0] && onlyFailed.json.groups[0].count, 0, '按失败任务过滤 count=0')

  const sessionB = await createSession('AC-CONV-009-16 会话 b')
  const cross = await api('GET', `/api/sessions/${encodeURIComponent(sessionB)}/deliverables?taskId=${encodeURIComponent(tasks[0].id)}`)
  ctx.eq(cross.status, 200, '跨会话 taskId 查询 200')
  ctx.eq(cross.json.groups.length, 0, '跨会话 taskId 返回空 groups')
  ctx.eq(cross.json.fileCount, 0, '跨会话 fileCount=0')

  ctx.raw = {
    sessionA, sessionB, failedTaskId: failedTask.id, groups: groups.length, total: res.json.total,
    files: files.map((f) => ({ name: f.name, typeBadge: f.typeBadge, size: f.size })),
  }
})
