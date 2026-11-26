# TEST PLAN · CHG-LEGACY-P7-SCHED

Covers: AC-P7-01…AC-P7-08（共 8 条，逐条见下表）

## 1. 范围与策略

- 验证 P7 后端：CRUD、next-run、once/interval/daily 触发、暂停、run-now、重启补偿、审批暂停。
- 层级：`cmd/simo` 进程内集成测试（真实 SQLite/HTTP，mock LLM）。
- 外部依赖：无；不调用真实通知渠道（尚未实现）。
- 隔离：临时 `SIMO_HOME`/SQLite/端口；不接触 8787/正式数据。
- 时间策略：使用 now+2s/interval 2s 等短窗口；测试存在调度 tick 带来的时间敏感性，已记录为风险。

## 2. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

2026-11-20：exit 0；26 包中 16 个测试包通过、10 个无测试文件；223 run/pass，0 fail；283.33s。

## 3. AC → 测试矩阵

| AC | 用例 | 测试 | 层级 | 实际 | 期望 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-P7-01 once 按时触发 | `TestM13OnceScheduleFires` | `TestM13OnceScheduleFires` | 集成 | PASS | 201 创建，runCount=1，done | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-02 非法 cron/timezone/next-run | `TestM13InvalidCronAndNextRun` | `TestM13InvalidCronAndNextRun` | 集成 | PASS | 非法 400；daily nextRunAt>now；interval 201 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-03 run-now | `TestM13PauseAndRunNow` | `TestM13PauseAndRunNow` | 集成 | PASS | 200 且 runCount 增加 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-04 暂停 | `TestM13PauseAndRunNow` | `TestM13PauseAndRunNow` | 集成 | PASS | enabled=false，nextRunAt=0 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-05 重启补偿 | `TestM13RestartAndMissedCompensation` | `TestM13RestartAndMissedCompensation` | 集成 | PASS | 重启后 runCount≥1 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-06 审批暂停 | `TestM13ApprovalPausesSchedule` | `TestM13ApprovalPausesSchedule` | 集成 | PASS | failed/disabled/消息含审批暂停 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P7-07 通知/重试 | 无 | 无 | — | MISSING（未实现） | 无法判定 | missing |
| AC-P7-08 UI | 无 | 无 | — | N/A | 无法判定 | docs/testing/BACKEND-EVIDENCE-20261120.md |

## 4. 缺失用例

- `GET /api/schedules` 空列表、多任务排序。
- `DELETE` 成功/未知 404。
- `PATCH` 非法 JSON、非法 trigger、恢复 enabled。
- cron 范围/步长/列表/DOM-DOW OR 的正反例；6 段/秒级。
- 时区 DST、跨日、无效 timezone。
- 多实例并发、tick 漂移、长停机多次 missed。
- 通知渠道、失败告警、手动重试。

## 5. 未覆盖/不适用

- 无前端，UI/通知交互/截图 N/A。
- 无真实 LLM：只验证 prompt 交付，不验证内容质量。
- 无性能/压测。

## 6. 退出标准

- 全量测试 exit 0 且 0 fail；
- 每个 PRD 有测试或明确 unimplemented；
- 不把“有 CRUD”写成 SCHED-005 完成；
- 不虚构 DST/通知测试。

## 7. 证据

- [`evidence.md`](evidence.md)
- [`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- 原始日志：`backend/../.tmp/backend-fulltest-20261120.jsonl`
