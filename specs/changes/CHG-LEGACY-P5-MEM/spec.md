# SPEC · CHG-LEGACY-P5-MEM

Covers: AC-P5-01、AC-P5-02、AC-P5-03、AC-P5-04、AC-P5-05、AC-P5-06、AC-P5-07（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-MEM-001, PRD-MEM-002, PRD-MEM-003, PRD-MEM-004, PRD-MEM-005, PRD-MEM-006

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：backend
- 日期：2026-11-20
- 产品依据：`specs/product/P5-MEM/spec.md`
Change：CHG-LEGACY-P5-MEM
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

为 P5 的每一个 PRD 建立可复核的后端事实基线：已有接口、数据、测试、错误边界与明确缺口。本包不改变行为，不把未实现能力写成已完成。

## 2. 需求与状态

| ID | 需求（来自产品 spec） | 后端事实 | 状态 | 主要证据 |
|---|---|---|---|---|
| R1 | MEM-001 记忆条目、作用域、搜索 | `/api/memory*` 查询、scope 过滤、FTS/短词搜索、注入会话 | partial | `TestM3RememberVisibilityAndFTS`、`TestSearchChineseTrigramAndShortLike`、`TestM3MemoryInjectionIntoChat` |
| R2 | MEM-002 实体、关系、金字塔 | V3 entities/graph/pyramid/canonical 接口与表 | partial | `TestM21MemoryV3Pipeline`、`TestM23TeamV0View`（实体断言） |
| R3 | MEM-003 冲突与争议保留 | conflict/canonical/disputed 字段与合并、撤回 | partial | `TestM3ConflictVisibleAndItemsShape`、`TestMemoryV3FactConflictAndCanonical`、`TestSubmitMergeConflictRetract` |
| R4 | MEM-004 召回 R1/R2 | recall/debug 接口、任务上下文召回、实体绑定 | partial | `TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic`、`TestM31RecallEntityBindingNoSelfLock` |
| R5 | MEM-005 向量召回与巩固 | 本地 TF-IDF 向量、融合、consolidation job 与写回审计 | partial | `TestM32LocalVectorRecallAndFusion`、`TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestTaskDoneEventWritesProgress` |
| R6 | MEM-006 迁移与索引产品化 | 代码已有 v1–v6 SQLite 迁移，但无独立迁移/回滚/兼容验收，产品要求的索引治理未完成 | unimplemented（产品级） | 无专用测试；仅代码存在 |

## 3. 验收标准（本包）

- **AC-P5-01**：给定已写入的记忆，`GET /api/memory/items` 能返回该条目；空库返回 `[]` 而不是 `null`。证据：`TestM3RememberVisibilityAndFTS`、`TestM21MemoryV3Pipeline`。
- **AC-P5-02**：给定中文查询或短词，搜索仍能命中，不因 trigram 限制静默失败。证据：`TestSearchChineseTrigramAndShortLike`。
- **AC-P5-03**：不同 scope/session 的记忆互不污染，任务完成事件只更新候选而非错误提升。证据：`TestScopeIsolationAndTaskDoneCandidate`。
- **AC-P5-04**：冲突记忆不会被静默覆盖，争议项仍可查询且可撤回/合并。证据：`TestMemoryV3FactConflictAndCanonical`、`TestPreferenceUpdatesActiveAndOnlyContradictionDisputes`、`TestSubmitMergeConflictRetract`。
- **AC-P5-05**：召回 R1/R2 可开关、可融合，向量召回默认关闭时不影响 R1。证据：`TestM22RecallR1`、`TestM27RecallR2DefaultOn`、`TestM32VectorDefaultOff`。
- **AC-P5-06**：consolidation 具备幂等性，重复任务不重复写回。证据：`TestM30ConsolidationCandidatesMergeAndIdempotency`、`TestM30ConsolidationDefaultEnabled`。
- **AC-P5-07**：P5 的 UI/空态/加载态/权限反馈没有实现，不得判定通过；对应产品 AC-02 记 `missing`（N/A 后端包）。

## 4. 状态、错误与边界

- 成功响应统一含 `ok:true`；列表为空时归一化为 `[]`。
- 旧搜索路径的非法参数没有逐项 400 契约；存储/查询失败多为中文 500。**这属于已知缺口**，不能当作完整错误契约。
- scope 由 session/agent 决定；跨 scope 读取必须被限制。当前有服务级隔离测试，但没有 HTTP 越权矩阵测试。
- 召回/巩固 debug 路由只用于测试和诊断，不是产品用户入口。
- MEM-006 的索引治理、迁移兼容与回滚没有验收，故整体仍为 unimplemented。

## 5. 接口与数据（归档）

主要接口：`GET /api/memory`、`/api/memory/scopes`、`/api/memory/items`、`/api/memory/conflicts`、`/api/memory/items/{id}`、`/api/memory/entities`、`/api/memory/entities/{id}`、`/api/memory/entities/{id}/timeline`、`/api/memory/graph`、`/api/memory/pyramid`、`/api/memory/canonical/{id}`、`/api/memory/agents`、`/api/memory/agents/{id}/memory`；诊断路由 `/api/debug/recall*`、`/api/debug/memory/*`。

数据：`memories`、`memory_entities`、`memory_relations`、`memory_conflicts`、`memory_canonical`、`memory_pyramid`、`memory_recall_*`、`memory_consolidation*`、`memory_writeback_audit` 等；迁移 v1–v6。精确字段见 `backend.md`。

## 6. 待确认

- MEM-006 的“迁移与索引”是否要求在线迁移、回滚演练和索引体积门槛？
- 向量召回默认关闭是否为最终产品策略？
- 记忆 UI 是否在 P5 范围外；若是，产品 AC-02 应由哪个域承接？

## 7. 链接

- [proposal.md](proposal.md)
- [backend.md](backend.md)
- [frontend.md](frontend.md)
- [tasks.md](tasks.md)
- [test-plan.md](test-plan.md)
- [evidence.md](evidence.md)
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

覆盖范围：`PRD-MEM-001`、`PRD-MEM-002`、`PRD-MEM-003`、`PRD-MEM-004`、`PRD-MEM-005`、`PRD-MEM-006`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-MEM-001` | partial | `AC-MEM-001-01` | api/memory 查询、scope 过滤、FTS 与注入已有，产品级作用域与搜索 AC 未全过 |
| `PRD-MEM-002` | partial | `AC-MEM-002-01` | V3 entities、graph、pyramid、canonical 接口与表已有，金字塔与实体关系 AC 未验收 |
| `PRD-MEM-003` | partial | `AC-MEM-003-01` | conflict、canonical、disputed 字段与合并、撤回已有，争议保留 AC 未验收 |
| `PRD-MEM-004` | partial | `AC-MEM-004-01` | recall、debug 与上下文召回已有，R1 与 R2 产品 AC 未全过 |
| `PRD-MEM-005` | partial | `AC-MEM-005-01` | 本地 TF-IDF 向量、融合与 consolidation job 已有，向量召回 AC 未验收 |
| `PRD-MEM-006` | out | — | 未实现：v1–v6 SQLite 迁移代码存在，但缺少迁移、回滚与兼容验收 |
