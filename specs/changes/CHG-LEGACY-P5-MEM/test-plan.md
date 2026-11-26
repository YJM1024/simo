# TEST PLAN · CHG-LEGACY-P5-MEM

Covers: AC-P5-01…AC-P5-07（共 7 条，逐条见下表）

## 1. 范围与策略

- 只验证已存在的 P5 后端行为，不新增产品能力。
- 测试层级：模块单测（service/consolidation）+ 进程内集成测试（`cmd/simo` 启动 HTTP/WS/SQLite 临时实例）。
- 真实外部依赖：无。LLM 使用 mock；向量为本地 TF-IDF；不需要 API key。
- 隔离：每个测试使用临时 `SIMO_HOME`/SQLite，端口为进程内 httptest/临时端口；不接触 8787 和正式数据。

## 2. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

本次执行：2026-11-20，exit 0，耗时 283.33s；26 个包中 16 个有测试包全部通过，10 个无测试文件；223 个 test run/pass，0 fail，0 skip。

## 3. AC → 测试矩阵

| AC | 用例 | 测试 | 层级 | 实际 | 期望 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AC-P5-01 条目可见/空数组 | `TestM3RememberVisibilityAndFTS`、`TestM21MemoryV3Pipeline` | `TestM3RememberVisibilityAndFTS`、`TestM21MemoryV3Pipeline` | 集成 | PASS | 写入后可查；空库 `[]` | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-02 中文/短词搜索 | `TestSearchChineseTrigramAndShortLike` | `TestSearchChineseTrigramAndShortLike` | 单测 | PASS | 命中不静默失败 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-03 scope 隔离 | `TestScopeIsolationAndTaskDoneCandidate` | `TestScopeIsolationAndTaskDoneCandidate` | 单测 | PASS | 跨 scope 不污染 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-04 冲突/争议/撤回 | `TestM3ConflictVisibleAndItemsShape`、`TestMemoryV3FactConflictAndCanonical`、`TestPreferenceUpdatesActiveAndOnlyContradictionDisputes`、`TestSubmitMergeConflictRetract` | `TestM3ConflictVisibleAndItemsShape`、`TestMemoryV3FactConflictAndCanonical`、`TestPreferenceUpdatesActiveAndOnlyContradictionDisputes`、`TestSubmitMergeConflictRetract` | 集成+单测 | PASS | 冲突可见、可合并/撤回 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-05 R1/R2/向量 | `TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic`、`TestM32LocalVectorRecallAndFusion`、`TestM32VectorDefaultOff`、`TestM31RecallEntityBindingNoSelfLock` | `TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic`、`TestM32LocalVectorRecallAndFusion`、`TestM32VectorDefaultOff`、`TestM31RecallEntityBindingNoSelfLock` | 集成 | PASS | 开关、融合、降级、默认关闭 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-06 巩固幂等 | `TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestM30ConsolidationDefaultEnabled`、`TestTaskDoneEventWritesProgress` | `TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestM30ConsolidationDefaultEnabled`、`TestTaskDoneEventWritesProgress` | 集成+单测 | PASS | 重复不重复写回 | docs/testing/BACKEND-EVIDENCE-20261120.md |
| AC-P5-07 UI AC-02 | 无 UI | 无 UI | — | MISSING（N/A 后端） | 不可判定 | missing |

## 4. 回归范围

- 记忆注入会话：`TestM3MemoryInjectionIntoChat`。
- 重启持久化：`TestM3RestartPersistence`。
- 巩固键提取：`TestM30FactKeyExtraction`。
- 全部 223 个 test event 均通过，说明本包相关测试未破坏既有套件；但不等于 P5 全 AC 通过。

## 5. 未覆盖/不适用

- 无前端：空态、加载态、权限提示、键盘/可访问性、截图 diff 均 N/A。
- MEM-006：无迁移前后兼容、回滚、索引体积、长事务/崩溃恢复测试。
- HTTP 错误契约：没有逐路由 400/404/500 矩阵。
- 并发：没有多会话并发写入同一 scope 的压力测试。
- 安全：没有 HTTP 层越权矩阵；只有 service scope 测试。
- 真实 LLM/向量服务：不需要也不在范围内。

## 6. 退出标准

- `go test ./...` exit 0 且失败数为 0；
- 每个 PRD 有测试或明确 `missing`；
- 无测试名/命令/结果虚构；
- 文档与产品 spec 状态不冲突（不把 P5 写成 completed）。

## 7. 证据

- 原始 JSONL：`backend/../.tmp/backend-fulltest-20261120.jsonl`（作为执行日志，不提交）
- 汇总：[`evidence.md`](evidence.md)
- 全局报告：[`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
