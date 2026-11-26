# TASKS · CHG-LEGACY-P7-SCHED

本包为 docs-only 历史归档，不包含新的定时任务实现。

## T1 调度 API/数据盘点

- Owner：backend
- Scope：只读 `schedules.go`、`migrations.go` v9
- AC：列出 5 个路由、Schedule 字段、`schedules`/`schedule_fires`；明确 201/400/404。
- Evidence：`backend.md` 第 2–3 节。
- 状态：done

## T2 触发/补偿/幂等核验

- Owner：backend
- Scope：`m13_test.go` + 调度代码
- AC：once、run-now、暂停、重启补偿、审批暂停均有测试映射；补偿范围写明只补最近一次。
- Evidence：`TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow`。
- 状态：done

## T3 边界/缺口登记

- Owner：backend
- Scope：`spec.md`、`evidence.md`
- AC：登记通知/重试/UI、DST、cron 语法、DELETE/PATCH 错误、并发缺失；不写 covered。
- Evidence：未验证项小节。
- 状态：done

## T4 全量测试与证据

- Owner：backend
- Scope：`backend/` 全量 `go test ./... -count=1 -json`，环境变量指向 `../.tmp`
- AC：记录包数/测试数/失败/耗时；失败不得 PASS。
- Evidence：`docs/testing/BACKEND-EVIDENCE-20261120.md`。
- 状态：done（26 包 / 223 / 0 fail / 283.33s）

## T5 验收交接

- Owner：backend → 验收 Agent
- Scope：本包文档与证据
- AC：独立核对测试名、状态和缺口；实现者不自签。
- Evidence：交接消息 + 文件清单。
- 状态：pending

## 任务表

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| T1 | 调度 API/数据盘点 | backend | 只读 `schedules.go`、`migrations.go` v9 | 无 | 列出 5 个路由、Schedule 字段、`schedules`/`schedule_fires`；明确 201/400/404。 | `backend.md` 第 2–3 节。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T2 | 触发/补偿/幂等核验 | backend | `m13_test.go` + 调度代码 | 无 | once、run-now、暂停、重启补偿、审批暂停均有测试映射；补偿范围写明只补最近一次。 | `TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow`。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T3 | 边界/缺口登记 | backend | `spec.md`、`evidence.md` | 无 | 登记通知/重试/UI、DST、cron 语法、DELETE/PATCH 错误、并发缺失；不写 covered。 | 未验证项小节。 | done | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T4 | 全量测试与证据 | backend | `backend/` 全量 `go test ./... -count=1 -json`，环境变量指向 `../.tmp` | 无 | 记录包数/测试数/失败/耗时；失败不得 PASS。 | `docs/testing/BACKEND-EVIDENCE-20261120.md`。 | done（26 包 / 223 / 0 fail / 283.33s） | 验收 Agent | 不改实现、不删文件、不编造证据 |
| T5 | 验收交接 | backend → 验收 Agent | 本包文档与证据 | 无 | 独立核对测试名、状态和缺口；实现者不自签。 | 交接消息 + 文件清单。 | pending | 验收 Agent | 不改实现、不删文件、不编造证据 |

> 本表由既有 T1–T5 任务卡转录，字段与卡片正文一致；原卡片保留在上文，供逐条核对。
