# EVIDENCE · CHG-LEGACY-P7-SCHED

- 日期：2026-11-20
- 执行者：backend（kernel-builder）
- 结论：**PASS WITH NOTES**（M13 精确测试（`TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow`）通过；通知/重试/UI 未实现，P7 仍为 partial）
- 变更性质：docs-only；未改代码/数据，未启动 8787

## 1. 执行命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

结果：exit 0；DURATION_SEC=283.33；日志 `backend/../.tmp/backend-fulltest-20261120.jsonl`。

## 2. 全量计数

| 指标 | 值 |
|---|---|
| packages | 26 |
| 有测试且通过 | 16 |
| 无测试文件 | 10 |
| run/pass | 223 |
| fail | 0 |
| skip | 0 |

## 3. P7 相关测试（全部 PASS）

- `TestM13OnceScheduleFires`
- `TestM13InvalidCronAndNextRun`
- `TestM13ApprovalPausesSchedule`
- `TestM13RestartAndMissedCompensation`
- `TestM13PauseAndRunNow`

均在 `backend/cmd/simo/m13_test.go`。

## 4. 覆盖结论

| PRD | 测试 | 产品状态 | 备注 |
|---|---|---|---|
| SCHED-001 | `TestM13OnceScheduleFires`、`TestM13InvalidCronAndNextRun`、`TestM13ApprovalPausesSchedule`、`TestM13RestartAndMissedCompensation`、`TestM13PauseAndRunNow` | partial | CRUD 主路径有；无 UI，DELETE/PATCH 错误未覆盖 |
| SCHED-002 | M13Invalid.../Pause... | partial | nextRunAt 有；无空列表/排序 |
| SCHED-003 | M13Pause.../Once... | partial | run-now/幂等有；无并发测试 |
| SCHED-004 | M13Invalid.../Once... | partial | 类型/时区基础有；无 DST/完整 cron 边界 |
| SCHED-005 | 无 | unimplemented | 无通知/手动重试/告警产品能力 |

## 5. 未验证项 / 限制

1. 无前端，列表/状态/失败提示无法验收。
2. 无通知渠道、失败告警、手动重试测试。
3. 无 DST、跨日、6 段 cron、非法 timezone 的完整测试。
4. 启动补偿只补最近一次 missed run；多周期停机语义未验证。
5. 测试依赖 5s tick 和短时间窗口，存在时间敏感性；全量通过不代表生产准点率。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-P7-01-01 | AC-P7-01 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-08-01 | AC-P7-08 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-02-01 | AC-P7-02 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-03-01 | AC-P7-03 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-04-01 | AC-P7-04 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-05-01 | AC-P7-05 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-06-01 | AC-P7-06 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P7-07-01 | AC-P7-07 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。
