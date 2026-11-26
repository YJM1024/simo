# EVIDENCE · CHG-LEGACY-P6-TEAM

- 日期：2026-11-20
- 执行者：backend（kernel-builder）
- 结论：**PASS WITH NOTES**（相关测试通过；TEAM-004/TEAM-006 未实现，P6 仍为 partial）
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

## 3. P6 相关测试（全部 PASS）

- `TestM23TeamV0View`（`backend/cmd/simo/m23_test.go`）
- `TestM24TeamV1InternalRouting`（`backend/cmd/simo/m24_test.go`）
- `TestM25TeamV2TemplateAndTrigger`（`backend/cmd/simo/m25_test.go`）
- `TestM31TeamEventsBroadcastOnWS`（`backend/cmd/simo/m31_test.go`）
- `TestTeamInternalEventTypesRegistered`（`backend/internal/core/eventlog`）

## 4. 覆盖结论

| PRD | 测试 | 产品状态 | 备注 |
|---|---|---|---|
| TEAM-001 | M23/M24 | partial | 只读视图有；无完整 roster 管理 API/UI |
| TEAM-002 | M24/M25 | partial | 子 session/owner 有；无成员管理产品入口 |
| TEAM-003 | M25 | partial | 模板/角色/触发器有；无完整用户 CRUD |
| TEAM-004 | 无 | unimplemented | 只读投影/会话创建未完成 |
| TEAM-005 | M24（单路径） | partial | 主窗口不显示内部文本；缺越权矩阵 |
| TEAM-006 | 无 | unimplemented | 并行子 agent/看板未实现 |

## 5. 未验证项 / 限制

1. 没有团队前端，无法做用户可感知验收。
2. 没有非成员越权读取 `team_messages`/deliverables 的 HTTP 测试。
3. 没有多成员并发、成员退出、owner 转移、触发器失败重试/超时/通知测试。
4. 没有团队看板/会话创建端到端路径。
5. 全量通过仅说明既有测试通过，不等于 P6 产品 AC 完成。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-P6-01-01 | AC-P6-01 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-07-01 | AC-P6-07 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-02-01 | AC-P6-02 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-03-01 | AC-P6-03 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-04-01 | AC-P6-04 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-05-01 | AC-P6-05 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P6-06-01 | AC-P6-06 | 单元测试日志 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。
