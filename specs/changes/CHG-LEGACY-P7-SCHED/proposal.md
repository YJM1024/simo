# PROPOSAL · CHG-LEGACY-P7-SCHED

- 变更 ID：CHG-LEGACY-P7-SCHED
- 类型：历史能力归档（docs-only）
- Owner：backend
- 日期：2026-11-20
- 关联产品域：`specs/product/P7-SCHED/spec.md`
- 状态：archived / partial（不表示 P7 已完整交付）

## 1. 背景

P7 定时任务后端已具备 CRUD、列表、next-run 计算、once/interval/daily/weekly/cron 触发、run-now、启动补偿和基于 `schedule_fires` 的幂等，并有 `TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow` 集成测试。但产品要求的失败通知、用户重试入口和 UI 不完整，`specs/test/P7-SCHED/test-plan.md` 仍是全 `missing` 骨架。

## 2. 目标

1. 归档 P7 的真实 API、调度语义、数据表、错误边界和测试证据。
2. 明确“后端能跑”不等于“产品完成”：无 UI、无通知/重试产品能力。
3. 为验收 Agent 提供可复核的 AC 映射与未验证项。

成功标准：每条 PRD 有实际行为 + 测试或明确 `unimplemented`，不把 cron 支持写成完整时区/DST 能力。

## 3. 范围

### In scope

- `backend/internal/modules/chat/schedules.go`、`migrations.go` v9。
- `backend/cmd/simo/m13_test.go` 的 5 个集成测试。
- 2026-11-20 全量测试结果。

### Out of scope

- 不新增通知渠道、重试 UI、定时任务页面。
- 不修改前端/产品 spec/TREE/TRACE/验收记录。
- 不写正式数据，不启动 8787。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 无（N/A） |
| 后端 API | 归档既有 `/api/schedules*` |
| 数据 | 归档 `schedules`、`schedule_fires` |
| 测试 | `TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow` |
| 文档 | 新增本包 7 个文件 |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 以“有 CRUD + 能触发”判定 P7 完成 | 拒绝：缺通知/重试/UI/时区边界，产品 AC 未闭环 |
| B. 只写调度算法说明 | 不足：无法证明 HTTP 与持久化行为 |
| C. 归档实现 + 五个集成测试 + 缺口（采用） | 与事实一致，便于后续补产品能力 |

## 6. 风险、依赖与假设

- 风险：后台 tick 为 5s，测试依赖时间窗口；不能据此保证生产准点率。
- 风险：启动补偿只补最近一次 missed run，多周期停机可能丢触发；产品需明确语义。
- 风险：时区只做了基本 `time.LoadLocation`，无 DST/跨时区边界测试。
- 依赖：SQLite、会话/LLM 启动链路、approval 机制。
- 假设：P7 没有前端页面；用户通过 API/其他入口管理。
- 待确认：SCHED-005 的通知渠道与重试策略是否仍为 P2。

## 7. 决策请求

请产品/验收 owner 确认：

1. P7 保持 partial；SCHED-005 记为 unimplemented。
2. 接受“启动只补最近一次 missed run”为当前限制，不写成完整补偿。
3. 后续通知/重试另开实现型 CHG。

## 8. 链接

- [spec.md](spec.md) · [backend.md](backend.md) · [frontend.md](frontend.md) · [tasks.md](tasks.md) · [test-plan.md](test-plan.md) · [evidence.md](evidence.md)
- 产品 spec：[`specs/product/P7-SCHED/spec.md`](../../product/P7-SCHED/spec.md)
