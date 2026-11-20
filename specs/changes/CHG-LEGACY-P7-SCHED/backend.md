# BACKEND · CHG-LEGACY-P7-SCHED

- Scope：`backend/internal/modules/chat/schedules.go`、`migrations.go`
- 状态：历史归档，无新增实现

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/chat/schedules.go` | HTTP CRUD、trigger 解析、next-run、tick、触发、补偿、run-now |
| `backend/internal/modules/chat/migrations.go` v9 | `schedules`、`schedule_fires` |
| `backend/internal/modules/chat/loop.go` | `startTurn` / 审批交互 |

## 2. API（实际注册）

| 方法/路径 | 行为 | 测试 |
|---|---|---|
| `GET /api/schedules` | 列表，`{ok:true,schedules:[]}` | 间接覆盖 |
| `POST /api/schedules` | 创建，成功 201；非法 JSON 400；非法 trigger 400 | `TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun` |
| `GET /api/schedules/{id}` | 详情；未知 404 | 间接覆盖 |
| `PATCH /api/schedules/{id}` | 更新 title/trigger/prompt/enabled | `TestM13PauseAndRunNow` |
| `DELETE /api/schedules/{id}` | 删除；未知 404 | 未单独测试 |
| `POST /api/schedules/{id}/run-now` | 立即触发，200 `{ok:true,scheduleId}` | `TestM13PauseAndRunNow` |

## 3. 数据

chat 迁移 v9（`create schedules`）：

- `schedules(id,session_id,title,trigger_type,trigger_expr,timezone,prompt,enabled,next_run_at,last_run_at,last_status,run_count,created_at,updated_at)`；索引 `idx_schedules_due(enabled,next_run_at)`。
- `schedule_fires(schedule_id,due_at,created_at, PRIMARY KEY(schedule_id,due_at))`。

所有时间戳为毫秒整数；`enabled` 为 0/1；`nextRunAt=0` 表示 no next run。

## 4. 调度语义

- 支持类型：`once`、`interval`、`daily`、`weekly`、`cron`。
- `once` 使用 RFC3339 时间；触发后禁用（`enabled` 表达式为 `CASE WHEN trigger_type='once' THEN 0 ELSE enabled END`）。
- `interval` 为秒数；`daily` 为 `HH:MM` + 可选 IANA timezone；`weekly` 含星期与时间；`cron` 为 5 段（分 时 日 月 周），支持范围/步长/列表，DOM 与 DOW 同时受限时按 OR。
- `nextRunAt` 在创建/更新/触发后计算；非法表达式返回错误，HTTP 400。
- tick 每 5s 扫描 due；执行前 `INSERT OR IGNORE schedule_fires` 抢占，冲突则跳过。
- 启动 `recoverSchedules`：只对最近一次 missed run 触发一次，然后计算下一次；不补全部历史。
- `deliverSchedule`：最多 2 次重试（500ms 间隔），45s 超时；审批 pending 导致失败并禁用，消息包含“审批/暂停”。
- 无通知渠道、无手动重试 API/UI。

## 5. 错误与边界

- 未知 ID：404 `定时任务不存在`。
- 非法 JSON：400 `JSON 非法`。
- 非法 trigger/cron/timezone：400，错误文本来自 `writeScheduleError`（`errScheduleInvalid`/包含 cron/时间/trigger）。
- 列表为空归一化 `[]`。
- `run-now` 对 disabled schedule 仍可触发（测试覆盖暂停后 run-now）。
- 无并发 run-now 重复触发测试；依赖 `schedule_fires` 主键。
- 无时区 DST/跨日边界测试。

## 6. 测试映射

| 测试 | 文件 | 覆盖 |
|---|---|---|
| `TestM13OnceScheduleFires` | `backend/cmd/simo/m13_test.go` | once 到点、runCount/lastRunAt/lastStatus、prompt 交付 |
| `TestM13InvalidCronAndNextRun` | 同上 | 非法 cron 400；daily timezone + nextRunAt；interval |
| `TestM13ApprovalPausesSchedule` | 同上 | 审批 pending → failed/disabled/消息 |
| `TestM13RestartAndMissedCompensation` | 同上 | 重启补偿、runCount≥1 |
| `TestM13PauseAndRunNow` | 同上 | 暂停 nextRunAt=0、run-now 触发 |

## 7. 未验证 / 风险

- 无 UI；无产品可感知验收。
- 无 `GET /api/schedules` 空列表/多任务排序测试，无 DELETE 测试，无 PATCH 非法输入测试。
- 无 cron 全部语法/边界/6 段/DST 测试。
- 无多实例并发调度、tick 漂移、长时间运行、通知/重试测试。
- 启动补偿只补最近一次；多周期停机语义未定。
