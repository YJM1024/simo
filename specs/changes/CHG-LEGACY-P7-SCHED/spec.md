# SPEC · CHG-LEGACY-P7-SCHED

Covers: AC-P7-01、AC-P7-02、AC-P7-03、AC-P7-04、AC-P7-05、AC-P7-06、AC-P7-07、AC-P7-08（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-SCHED-001, PRD-SCHED-002, PRD-SCHED-003, PRD-SCHED-004, PRD-SCHED-005

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：backend
- 日期：2026-11-20
- 产品依据：`specs/product/P7-SCHED/spec.md`
Change：CHG-LEGACY-P7-SCHED
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

归档 P7 的定时任务后端契约、调度语义、持久化与测试证据，并明确通知/重试/UI 缺口。

## 2. 需求与状态

| ID | 需求 | 后端事实 | 状态 | 主要证据 |
|---|---|---|---|---|
| R1 | SCHED-001 CRUD | `GET/POST /api/schedules`、`GET/PATCH/DELETE /api/schedules/{id}`；创建 201；未知 404；非法 400 | partial | `TestM13OnceScheduleFires`、`TestM13PauseAndRunNow`、`TestM13InvalidCronAndNextRun` |
| R2 | SCHED-002 list/next-run | 列表返回 `schedules:[]`；创建/更新计算 `nextRunAt`；once 完成后禁用 | partial | `TestM13InvalidCronAndNextRun`、`TestM13PauseAndRunNow` |
| R3 | SCHED-003 run-now/idempotency | `POST /api/schedules/{id}/run-now`；`schedule_fires(schedule_id,due_at)` 主键；run-now due=now | partial | `TestM13PauseAndRunNow`、`TestM13OnceScheduleFires` |
| R4 | SCHED-004 recurrence/timezone | once/interval/daily/weekly/cron；daily 支持 timezone；cron 5 段；无 DST 专项测试 | partial | `TestM13InvalidCronAndNextRun`、`TestM13OnceScheduleFires` |
| R5 | SCHED-005 failure/retry/notification | 触发失败会记录 failed 并有内部 startTurn 重试；**无用户通知渠道、无手动重试 API、无 UI** | unimplemented（产品级） | `TestM13ApprovalPausesSchedule` 只覆盖审批暂停，不覆盖通知 |

## 3. 验收标准（本包）

- **AC-P7-01**：once 到点后触发一次，`runCount=1`、`lastRunAt` 非零、`lastStatus=done`。证据：`TestM13OnceScheduleFires`。
- **AC-P7-02**：非法 cron 返回 400；daily `09:30` + `Asia/Shanghai` 创建成功且 `nextRunAt > now`；interval 创建成功。证据：`TestM13InvalidCronAndNextRun`。
- **AC-P7-03**：run-now 可用，触发后 `runCount` 增加。证据：`TestM13PauseAndRunNow`。
- **AC-P7-04**：暂停后 `enabled=false`、`nextRunAt=0`，不再自动触发。证据：`TestM13PauseAndRunNow`。
- **AC-P7-05**：重启后补偿 missed run，至少执行一次。证据：`TestM13RestartAndMissedCompensation`。
- **AC-P7-06**：触发命中审批且无人应答时，任务标 failed 并暂停，消息包含“审批/暂停”。证据：`TestM13ApprovalPausesSchedule`。
- **AC-P7-07**：通知、手动重试、失败告警无产品实现，SCHED-005 记 `unimplemented`。
- **AC-P7-08**：无 P7 UI，所有用户可见 AC 不判定通过。

## 4. 状态、错误与边界

- 创建成功 201，body `{ok:true,schedule}`；列表/详情/PATCH/DELETE/run-now 200。
- 未知 ID → 404 `定时任务不存在`；非法 JSON → 400 `JSON 非法`；非法 trigger/cron/timezone → 400（`writeScheduleError`）。
- 支持 `trigger:{type,expr,timezone}` 或扁平 `triggerType/triggerExpr/timezone`。
- 调度 tick 5s；`schedule_fires` 主键保证同一 due 不重复执行。
- 启动 `recoverSchedules` 只补偿最近一次 missed run，然后重算 next；不是全量补跑。
- `deliverSchedule` 对 `startTurn` 最多重试 2 次（500ms 间隔），45s 截止；审批 pending 会标 failed 并禁用。
- 无通知渠道、无用户 retry 按钮/API、无 UI。
- 时区只做 IANA `LoadLocation` 与本地时间计算；无 DST、跨日、闰秒测试。

## 5. 接口与数据（归档）

路由：`GET/POST /api/schedules`；`GET/PATCH/DELETE /api/schedules/{id}`；`POST /api/schedules/{id}/run-now`。

`Schedule`：`id/sessionId/title/trigger{type,expr,timezone}/triggerType/triggerExpr/prompt/enabled/nextRunAt/lastRunAt/lastStatus/runCount/createdAt/updatedAt`。

表（chat 迁移 v9）：`schedules(id,session_id,title,trigger_type,trigger_expr,timezone,prompt,enabled,next_run_at,last_run_at,last_status,run_count,created_at,updated_at)`，索引 `idx_schedules_due(enabled,next_run_at)`；`schedule_fires(schedule_id,due_at,created_at, PRIMARY KEY(schedule_id,due_at))`。

## 6. 待确认

- 启动补偿是否允许只补最近一次，还是必须补所有 missed？
- 失败通知的产品渠道（消息/桌面/邮件）与重试上限？
- cron 是否要求秒级/6 段，是否要求完整 DST 语义？

## 7. 链接

- [proposal.md](proposal.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 全量证据：[`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)

## 非目标

本包是历史归档，只登记既有事实：不新增能力、不改实现与数据、不把未验证项写成已完成；未覆盖的断言保持 `missing`，后续承接见对应的 `CHG-CONV-*` 收口包。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-20：建立本包并首次登记状态。
- 2026-11-20：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

已归档：本包是历史归档包，不再接受变更；产品能力仍按域 spec 的 `covered/partial/gap` 统计，归档不表示完成。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

## 8. 功能点覆盖

覆盖范围：`PRD-SCHED-001`、`PRD-SCHED-002`、`PRD-SCHED-003`、`PRD-SCHED-004`、`PRD-SCHED-005`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-SCHED-001` | partial | `AC-SCHED-001-01` | cron 调度与任务记录已有，时区与补跑 AC 未验收 |
| `PRD-SCHED-002` | partial | `AC-SCHED-002-01` | 计划任务列表与启停已有，并发与冲突 AC 未验收 |
| `PRD-SCHED-003` | partial | `AC-SCHED-003-01` | 运行时状态与最近运行已有，失败与重试展示未验收 |
| `PRD-SCHED-004` | partial | `AC-SCHED-004-01` | 运行历史接口与面板已有，留存与分页 AC 未验收 |
| `PRD-SCHED-005` | out | — | 未实现：触发失败只落 failed 与内部重试，没有用户通知、手动重试 API 与 UI |
