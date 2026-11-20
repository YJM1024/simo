# EVIDENCE · CHG-LEGACY-P5-MEM

- 日期：2026-11-20
- 执行者：backend（kernel-builder）
- 结论：**PASS WITH NOTES**（测试通过；P5 产品能力仍为 partial，MEM-006/UI 缺口未关闭）
- 变更性质：docs-only；未改代码、未改数据、未启动 8787

## 1. 执行命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

结果：进程 exit 0；DURATION_SEC=283.33；日志 `backend/../.tmp/backend-fulltest-20261120.jsonl`，stderr `backend/../.tmp/backend-fulltest-20261120.stderr.txt`。

## 2. 全量计数

| 指标 | 值 |
|---|---|
| Go packages | 26 |
| 有测试且通过 | 16 |
| 无测试文件（skip） | 10 |
| test run/pass | 223 |
| fail | 0 |
| test skip | 0 |
| 顶层 `func Test` | 220（另 3 个 subtest，共 223 run） |

## 3. P5 相关测试（全部 PASS）

在 `simo/cmd/simo` 包中：`TestM3RememberVisibilityAndFTS`、`TestM3ConflictVisibleAndItemsShape`、`TestM3MemoryInjectionIntoChat`、`TestM3RestartPersistence`、`TestM21MemoryV3Pipeline`、`TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic`、`TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestM31RecallEntityBindingNoSelfLock`、`TestM32LocalVectorRecallAndFusion`、`TestM32VectorDefaultOff`。

在 `simo/internal/modules/memory` 包中：`TestMemoryV3FactConflictAndCanonical`、`TestPreferenceUpdatesActiveAndOnlyContradictionDisputes`、`TestSubmitMergeConflictRetract`、`TestSearchChineseTrigramAndShortLike`、`TestScopeIsolationAndTaskDoneCandidate`、`TestTaskDoneEventWritesProgress`、`TestM30FactKeyExtraction`、`TestM30ConsolidationDefaultEnabled`。

## 4. 覆盖结论

| PRD | 后端测试 | 产品状态 | 备注 |
|---|---|---|---|
| MEM-001 | 有，主路径 PASS | partial | 无 HTTP 参数错误矩阵；无 UI |
| MEM-002 | 有，V3 管道 PASS | partial | 实体/图/金字塔无逐接口 HTTP 测试 |
| MEM-003 | 有，冲突/撤回 PASS | partial | 无并发冲突压力测试 |
| MEM-004 | 有，R1/R2 PASS | partial | agentic/两跳仅一个集成用例 |
| MEM-005 | 有，向量/巩固 PASS | partial | 向量默认关闭；无性能/索引测试 |
| MEM-006 | 无专用测试 | unimplemented | 迁移代码存在，但产品化迁移/索引验收缺失 |

## 5. 未验证项 / 限制

1. 未执行前端/CDP/截图验收；P5 无 UI，AC-02 无法判定。
2. 未对 `/api/memory*` 的每个状态码做契约测试。
3. 未做迁移回滚、旧库升级、索引体积、崩溃恢复、并发压力。
4. 未使用真实 LLM/向量服务（测试为 mock/本地 TF-IDF），不能证明生产召回质量。
5. 未接触正式数据、未启动 8787，因此没有线上数据验证。
6. 全量测试通过只证明既有测试通过，不证明产品 spec 的所有 AC 已完成。
