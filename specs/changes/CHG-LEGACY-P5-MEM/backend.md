# BACKEND · CHG-LEGACY-P5-MEM

- Scope：`backend/internal/modules/memory/**`、`backend/internal/core/memory/**`
- 状态：历史归档，无新增实现
- 后端入口：`backend/cmd/simo` 注册 memory module

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/memory/module.go` | 注册 4 个兼容/主查询路由，调用 `registerV3` |
| `backend/internal/modules/memory/http.go` | 兼容 `GET /api/memory`、items/conflicts/scopes 处理 |
| `backend/internal/modules/memory/http_v3.go` | V3 item/entity/graph/pyramid/canonical/agents 路由 |
| `backend/internal/modules/memory/migrations.go` | v1–v6 SQLite 迁移 |
| `backend/internal/modules/memory/service.go` | 基础记忆写入、查询、注入 |
| `backend/internal/modules/memory/v3.go`、`v3_service.go` | 实体/事实/规范单元/金字塔 |
| `backend/internal/modules/memory/recall.go`、`recall_r2.go`、`vector_recall.go` | 召回 R1/R2、实体绑定、向量融合 |
| `backend/internal/modules/memory/consolidation.go` | 巩固任务、候选合并、写回审计 |
| `backend/internal/modules/memory/fts.go` | FTS5 trigram 与短词查询 |

## 2. API（实际注册）

| 方法/路径 | 行为 | 备注 |
|---|---|---|
| `GET /api/memory` | 兼容旧搜索，参数 `q/scope/limit/maxChars`，返回 `{ok,items,total,query}` | 主入口已迁移到 `/api/memory/items` |
| `GET /api/memory/scopes` | 返回作用域汇总 | 无专用 HTTP 测试 |
| `GET /api/memory/items` | 列表/搜索；V3 参数 `q/type/subType/status/includeDisputed/entityId/layer/asOf/sort/limit/offset` | limit 上限 100 |
| `GET /api/memory/conflicts` | 冲突列表 | 服务级冲突测试覆盖 |
| `GET /api/memory/items/{id}` | 条目详情 + 历史 + canonicalRefs + 归因 | `TestM21MemoryV3Pipeline` |
| `GET /api/memory/entities` | 实体列表 | `TestM21MemoryV3Pipeline` |
| `GET /api/memory/entities/{id}` | 实体详情 | 间接覆盖 |
| `GET /api/memory/entities/{id}/timeline` | 实体时间线 | 间接覆盖 |
| `GET /api/memory/graph` | 关系图 | 间接覆盖 |
| `GET /api/memory/pyramid` | 金字塔视图 | 间接覆盖 |
| `GET /api/memory/canonical/{id}` | 规范单元 | 冲突/canonical 测试覆盖 |
| `GET /api/memory/agents` | agent 记忆索引 | 无专用 HTTP 测试 |
| `GET /api/memory/agents/{id}/memory` | agent 记忆 | 无专用 HTTP 测试 |
| `GET/POST /api/debug/recall` | 默认关闭的 debug 召回 | 测试/诊断用 |
| `POST /api/debug/recall/seed`、`/rebuild` | 召回种子/重建 | 测试/诊断用 |
| `POST /api/debug/memory/consolidate` | 触发巩固 | 测试/诊断用 |
| `GET /api/debug/memory/consolidation` | 巩固状态 | 测试/诊断用 |

## 3. 数据与迁移

`migrations.go` 的迁移版本：

| 版本 | 名称 | 主要对象 |
|---|---|---|
| v1 | create memory tables and fts | `memory_items`、`memory_item_history`、`memory_candidates`、`memory_conflicts`、`memory_fts`(FTS5 trigram) |
| v2 | memory v0.3 entities canonical pyramid | `entities`、`entity_relations`、`entity_edges`、`memories`、`mentions`、`memory_entities`、`entity_facts`、`attribution`、`conflicts`、`canonical_units`、`raw_messages`、`raw_events`、`agent_memory`、`pyramid_views`、`pyramid_nodes`、`pyramid_sources`、`maintenance_jobs`、`memory_fts_v3` |
| v3 | M22 recall derived layer | `memory_item_entities`、`recall_relation_registry`、`recall_aliases`、`recall_entity_fts`、`recall_entity_facts`、`recall_edges`、`recall_meta` |
| v4 | normalize agent brand | 数据规范化 |
| v5 | M30 memory consolidation | `memory_consolidation_jobs`、`memory_consolidation_state`、`memory_writeback_audit` |
| v6 | M32 local TF-IDF recall vectors | `recall_vectors`、`recall_vector_terms` |

迁移由 `schema_migrations` 记录。**MEM-006 要求的产品化迁移/索引验收未实现**：没有专门的迁移测试、回滚演练、索引体积/兼容矩阵。

## 4. 错误与边界

- 列表空结果归一化为 `[]`；成功响应 `ok:true`。
- 旧搜索路径没有严格参数校验；非法 limit/offset 未形成统一 400 契约。查询失败返回中文 500。
- 无 HTTP 越权矩阵测试；隔离靠 service scope 过滤，已有 `TestScopeIsolationAndTaskDoneCandidate`。
- 召回/巩固 debug 路由不是用户入口，不应暴露为产品能力。
- 所有测试使用临时 `SIMO_HOME`/SQLite；本包未接触正式数据。

## 5. 测试映射

| 测试 | 文件 | 覆盖 |
|---|---|---|
| `TestM3RememberVisibilityAndFTS` | `backend/cmd/simo/m3_test.go` | 写入可见、FTS、条目形态 |
| `TestM3ConflictVisibleAndItemsShape` | 同上 | 冲突可见、items 结构 |
| `TestM3MemoryInjectionIntoChat` | 同上 | 记忆注入会话 |
| `TestM3RestartPersistence` | 同上 | 重启后持久化 |
| `TestM21MemoryV3Pipeline` | `backend/cmd/simo/m21_test.go` | V3 条目/实体/金字塔主流程 |
| `TestM22RecallR1` | `backend/cmd/simo/m22_test.go` | R1 召回 |
| `TestM27RecallR2DefaultOn`、`TestM27RecallR2SwitchAndVectorDegrade`、`TestM27RecallR2TwoHopAndAgentic` | `backend/cmd/simo/m27_test.go` | R2 开关、融合、两跳/agentic |
| `TestM30ConsolidationCandidatesMergeAndIdempotency` | `backend/cmd/simo/m30_test.go` | 候选合并与幂等 |
| `TestM31RecallEntityBindingNoSelfLock` | `backend/cmd/simo/m31_recall_test.go` | 实体绑定无自锁 |
| `TestM32LocalVectorRecallAndFusion`、`TestM32VectorDefaultOff` | `backend/cmd/simo/m32_test.go` | 本地向量、融合、默认关闭 |
| `TestMemoryV3FactConflictAndCanonical` | `backend/internal/modules/memory/service_test.go` | 事实冲突/canonical |
| `TestPreferenceUpdatesActiveAndOnlyContradictionDisputes` | 同上 | 偏好更新/争议 |
| `TestSubmitMergeConflictRetract` | 同上 | 提交、合并、撤回 |
| `TestSearchChineseTrigramAndShortLike` | 同上 | 中文 trigram/短词 |
| `TestScopeIsolationAndTaskDoneCandidate` | 同上 | scope 隔离/任务候选 |
| `TestTaskDoneEventWritesProgress` | 同上 | 任务完成写回进度 |
| `TestM30FactKeyExtraction`、`TestM30ConsolidationDefaultEnabled` | `backend/internal/modules/memory/consolidation_test.go` | 巩固键提取/默认开关 |

## 6. 未验证 / 风险

- 所有 `/api/memory*` 的 HTTP 状态码/参数错误没有逐个测试；不能声称完整错误契约。
- `/api/memory/scopes`、`/api/memory/agents*` 无专用测试。
- 无并发写入、崩溃恢复、索引体积、迁移回滚测试。
- 无 P5 前端，用户可感知 AC 未验收。
