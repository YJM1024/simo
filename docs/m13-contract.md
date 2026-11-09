# M13 实现契约：定时任务 + 自动化

> 前置：M12（文件生成/联网）完成。原则：先做时间触发；事件触发放 P2。

## 1. 概念

- **定时任务（Schedule）**：到点向某个会话投递一条任务/消息，由秘书按正常流程执行（工具/审批/汇报都沿用）。
- **与工作流的关系**：定时任务只负责"触发"；触发后可以是一个普通任务，也可以启动一个工作流（M10）。
- **自动化（本阶段）**：时间触发 + 工作流组合；事件触发（文件变化/任务完成）后续。

## 2. 数据（`schedules`）

| 字段 | 说明 |
|---|---|
| `id` | `sch-…` |
| `session_id` | 目标会话（必填；不存在则创建） |
| `title` | 名称 |
| `trigger_type` | `once / interval / daily / weekly / cron` |
| `trigger_expr` | once=ISO 时间；interval=秒；daily=HH:MM；weekly=ISO 周几+HH:MM；cron=五段表达式 |
| `timezone` | IANA，默认本机 |
| `prompt` | 到点时投递的内容（一句话任务或模板） |
| `enabled` | 是否启用 |
| `next_run_at` / `last_run_at` | 毫秒时间戳 |
| `last_status` | `pending/running/done/failed/skipped` |
| `run_count` | 次数 |
| `created_at/updated_at` | |

- 停机错过：重算下次时间，**只补最近一次**（不补历史全部）；
- 重复投递可容忍（幂等键 `scheduleId+dueAt`，同一次只执行一次）。

## 3. 调度器

- 进程内单 goroutine tick（每 5s 检查 due）；
- 到点：写事件 → 在目标会话创建一条 user 消息（prompt）或任务/工作流 → 触发正常 chat 流程；
- 执行结果按逐任务汇报回到会话；
- 失败重试 ≤2；仍失败记 `failed` 并汇报；
- 权限：定时任务执行沿用会话权限；需要审批但无人应答 → 不自动放行，暂停该 schedule 并汇报（fail-closed）。

## 4. API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/schedules` | 列表（含下次/上次/状态） |
| POST | `/api/schedules` | 创建（body: sessionId/title/trigger/prompt/enabled） |
| GET | `/api/schedules/{id}` | 详情 |
| PATCH | `/api/schedules/{id}` | 修改/启停 |
| DELETE | `/api/schedules/{id}` | 删除 |
| POST | `/api/schedules/{id}/run-now` | 立即触发一次 |

- 所有时间返回毫秒；时区按 `timezone` 计算；
- 校验：非法 cron/时间 → 400 + 错误信封。

## 5. 前端

- 入口：左侧栏"定时任务"（或在设置页 tab）；
- 列表：名称、目标会话、下次运行、上次结果、开关；
- 创建/编辑向导：触发方式（一次/间隔/每天/每周/cron）、时间、时区、目标会话、内容；
- 操作：启停、立即运行、删除；
- 运行结果在目标会话里以普通汇报消息出现。

## 6. 验收（M13）

1. 创建 `once`（3 秒后）→ 到点执行，目标会话出现消息/任务，`last_status=done`；
2. `interval`/`daily` 下次时间计算正确；非法 cron 400；
3. 暂停后不再触发；`run-now` 立即触发；
4. 重启后 schedule 不丢，`next_run_at` 重算正确；错过只补最近一次；
5. 审批不可用 → 暂停并汇报（fail-closed）；
6. `go vet/test`、`tsc`、构建、M1–M12 evals 全绿 + M13 新 case。

## 7. 边界

- 不做事件触发/webhook（P2）；不做多用户共享；不做跨设备。
