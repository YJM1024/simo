# M22 实现契约：召回层（实体 / 关系 / 多步召回）

> **状态**：实现契约 v0.1（2026-11-08）。**只写设计/契约，不写业务代码**；SQL DDL 与 JSON 示例属于 schema/接口契约内容（不是实现）。
> **前置**：M3（`memory_items` + FTS5 trigram）已验收；本契约依赖 **memory v3 迁移**（[`design/24-记忆模型-v0.3.md`](../design/24-记忆模型-v0.3.md) §9：`entities` / `entity_relations` / `memory_item_entities` / `raw_*` / `canonical_units` 等新表）。M22 不要求金字塔压缩与 canonical 全量迁移先完成，但要求 §6 的实体表与派生索引可用。
> **最高依据**：
> - [`docs/design-core.md`](design-core.md)（2026-11-08 v0.2：**一切皆记忆**；记忆绑定实体/关系；多路召回 + 融合 + agentic；Spec 属于会话、不是顶级实体）；
> - [`design/24-记忆模型-v0.3.md`](../design/24-记忆模型-v0.3.md) **v0.3.1（Lead 拍板）**：实体/关系/五类型/`factKey`/金字塔/canonical/迁移（§2/§8/§9/§12）；
> - [`design/25-召回设计.md`](../design/25-召回设计.md) **v0.1（Lead 拍板）**：召回策略（查询理解、多路实体召回、RRF、关系下钻、agentic；Q1–Q5 已定）；
> - [`design/22-记忆与RAG-v0.md`](../design/22-记忆与RAG-v0.md) v0.2：检索执行（打分/截断/cite/信任/预算）；
> - [`design/20-上下文工程-v0.md`](../design/20-上下文工程-v0.md) v0.2：E2 预算与检索接口；
> - [`docs/m3-contract.md`](m3-contract.md)（M3 现有表/接口/FTS5 trigram）、[`docs/m18-contract.md`](m18-contract.md)（Spec 会话内、记忆只引用 `spec:`）。
> **实现口径**：本契约是 M22 的落地口径；与 design/25 的冲突处按本契约（更细），语义以 design/24 v0.3.1 + design/25 v0.1 为准；与 design-core 冲突以 design-core 为准。**不改 design/24、design/25 与其它文档。**
> **数字默认值**：一律为**工程默认、可配置、非验收承诺**（17 §6.2：先采基线，后校准）。

> **一句话**：M22 在 memory v3 的实体/关系之上，提供 **只读、可解释、可降级** 的召回服务：**查询理解 → 多路实体召回（FTS/别名/1 跳邻域；向量与 2 跳留 R2）→ RRF 融合 → 关系下钻 → 每实体 top-N 记忆 → 交 design/22 打分/截断/cite → 打包注入**；全程受 E2 预算（≤8% A、topK=8、单条 ≤400 token）约束，**R1 无向量可运行**，所有结果带 trace 与 cite。

---

## 1. 目标、范围与前置

### 1.1 目标（可验收）

1. **R1 无向量可用**：实体层 + FTS/别名 + 1 跳邻域 + RRF + top-K 实体 → 每实体 top-N 记忆 + 1 跳关系下钻；**不依赖向量**。
2. **实体层落地**：`entities` / `entity_relations` / `memory_item_entities`（canonical，随 memory v3 迁移）+ `recall_*` 派生索引（可整块重建）；抽取失败不污染记忆。
3. **与 22 分工清晰**：22 负责检索/打分/截断/cite/信任/注入预算；25/M22 只做**召回策略**（查询理解、多路、融合、下钻、agentic）；**不重写 22**。
4. **预算不放大**：注入 ≤ E2 配额（≤8% A、topK=8、单条 ≤400 token）；召回内部参数（实体 K、每实体 N、跳数、边访问）有独立上限。
5. **可解释**：每次召回产出 `memory.recall` trace（查询计划/各路候选/融合/实体分/下钻路径/选中与丢弃/成本/警告），能诊断"为什么没想起它"。
6. **降级确定**：无向量、实体层未就绪、图不可用、22 不可用、超时、预算不足、越权均有确定行为与错误码。
7. **R2 只留接口**：向量路、2 跳下钻、agentic 循环（≤3 步、追问三类）以开关 + 接口占位，默认关闭。
8. **不回归**：M1–M21 既有 evals 全绿；M3 的 `GET /api/memory?q=` 行为不变。

### 1.2 非目标

- 不引入图数据库/图算法平台（实体关系存 SQLite 表，见 §6.2）；
- 不在 R1 实现向量检索（R2 才做，且本地 ONNX）；
- 不重写 design/22 的打分（rel/imp/rec/str）、截断、cite、untrusted、写回；
- 不把 Spec 作为记忆类型/召回对象（design/24 §12 Q7=A：Spec 移出记忆；记忆只通过 `refs` 引用 `spec:`，见 m18 contract）；
- 不做金字塔压缩（P1；R1 只用 `layer` 过滤透传）；
- 不做多用户/团队共享实体库、不做自动爬取、不做训练；
- 不新增用户可见 UI（召回是内部能力；调试走 env-gated 端点）。

### 1.3 前置与降级

| 前置 | 未满足时 |
|---|---|
| memory v3 迁移（实体/关系/映射表）完成 | `recall.enabled=false`（默认）：chat 走 M3 的 `memory.search` 平铺检索；调 recall 返回 `recall_not_ready` |
| `memory_items` canonical 文本可读（M3 现有） | 可用：实体抽取退化为"仅别名/显式绑定"，不阻断 |
| FTS5 trigram 可用（M3 已启用） | 别名路可用、FTS 路空 + `warning:fts_unavailable` |
| design/22 检索执行接口可用 | 返回 `retrieval_unavailable`；chat 回退平铺检索 |

---

## 2. 架构与模块边界

### 2.1 分层

```text
chat / 会话组装（E1/E2） ──► M22 RecallService ──► design/22 Retriever（打分/截断/cite/预算）
                                   │
                                   ├─ 查询理解（规则）→ QueryPlan
                                   ├─ 实体层仓储（entities / relations / recall_*）
                                   ├─ 多路召回 + RRF + 关系下钻 + （R2）agentic
                                   └─ 打包 → RecallResult（items 已由 22 截断/带 cite）

DB：memory_items（真相，M3/v3） + entities/entity_relations/memory_item_entities（canonical）
    + recall_aliases/recall_entity_fts/recall_entity_facts/recall_edges（派生，可重建）
```

### 2.2 模块与依赖约束

| 项 | 约定 |
|---|---|
| 代码位置 | `backend/internal/modules/recall`（新模块）；实体层仓储同模块 `internal/modules/recall/store` |
| 依赖方向 | recall → `core`（Retriever/事件/配置）；**chat 不 import recall**（沿用 M3 的架构测试规则，通过 `core` 接口调用） |
| 单写者 | recall 本身**只读**；实体/关系/派生索引的写入只发生在 memory v3 迁移、memory 写路径后置抽取（单写者队列）与 `recallRebuild()`（迁移/维护命令） |
| 迁移命名空间 | `schema_migrations(module='memory')` 次版本 +1（v3 迁移）；`recall_meta.schema_version` 单独记录派生 schema 版本 |
| 关闭开关 | `recall.enabled`（默认 true 仅在 v3 迁移完成后；否则 false） |
| 调试端点 | `GET /api/debug/recall`、`POST /api/debug/recall/seed` **仅 `SIMO_DEBUG=1` 时注册**；不进入公开 API |

### 2.3 调用方与接口

| 调用方 | 方式 | 说明 |
|---|---|---|
| chat 上下文组装 | `core.RecallService.Recall(ctx, RecallRequest)` | 在 E2 组装 T3 前调用；结果交 22 已打包的 items 直接注入 |
| memory 页/搜索 | 不调用 recall（仍用 M3 `GET /api/memory`） | 用户可见检索不启用实体召回（P1 再议） |
| evals/测试 | `GET /api/debug/recall?...`（debug） | 确定性断言；seed 用 debug 端点 |

### 2.4 不变量（违反即实现错误）

| # | 不变量 |
|---|---|
| INV-R1 | **只读**：Recall 不写任何表（trace 走事件/日志，不算业务写入）；实体层与派生索引可整块重建 |
| INV-R2 | **预算不放大**：注入 ≤ E2 配额（≤8% A / topK=8 / 单条 ≤400 token）；召回内部上限见 §7.1 |
| INV-R3 | **作用域/敏感**：只读 `owner_agent` 的读集 + `boundary.readScopes`；`sensitivity=sensitive` 不跨智能体/不跨域（design/24 §12 Q4=B） |
| INV-R4 | **cite 与证据**：注入 items 必须带 cite（由 22 保证）；关系下钻的每条边必须有 `source_item` + version；无证据边不返回 |
| INV-R5 | **无向量可运行**：R1 关闭向量时功能不缺失，只降质量并标 `no_semantic_path` |
| INV-R6 | **不编造**：空结果返回空 + warning；不得用"我记得"补空 |
| INV-R7 | **确定性**：同一 DB 快照 + 同一请求 ⇒ 同一结果顺序（RRF 与 tie-break 固定；trace 不影响结果） |
| INV-R8 | **不引图 DB**：所有遍历基于 SQLite 表 + 索引，见 §6 |

---

## 3. API：`RecallRequest` / `RecallResult`

> 内部 Go 接口形态与 JSON 形态**字段一一对应**（HTTP debug 端点用 JSON）；字段名以本表为准。

### 3.1 `RecallRequest`（字段级）

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `recallId` | string | ✓ | 调用方生成（ULID） | trace/幂等键（只读，不产生副作用） |
| `sessionId` | string | ✓ | — | 当前会话（上下文/读集来源） |
| `agentId` | string | ✓ | — | 调用智能体（决定写域/读集；R1 通常 `agent:simo`） |
| `taskId` | string? |  | null | 当前任务（工作记忆/`about` 关系用） |
| `specRef` | string? |  | null | `spec:<sessionId>@<version>`，只作上下文/引用，**不召回 Spec** |
| `query` | string | ✓ | — | 当前查询（可由 E1/E2 从 Frame 派生；≤2000 字符） |
| `intent` | enum? |  | 由 query 规则判定 | `recall_fact`/`recall_experience`/`verify`/`enumerate`/`relation_query` |
| `types` | string[] |  | [] | 记忆类型过滤：`episodic/semantic/normative/procedural/working`（design/24 §3） |
| `entityTypes` | string[] |  | [] | 语义实体类型过滤（§4.2 的 10 类）；空 = 不限 |
| `filters` | object |  | {} | `status`（默认 `active`，`disputed` 成对）、`validAt`（默认 now）、`layer`、`sensitivity`、`ownerAgent`、`factRole`（`assertion`） |
| `budget` | object |  | 见 §7.1 | `maxEntities`、`perEntityN`、`maxHop`、`maxEdges`、`tokenBudget`、`deadlineMs`、`maxAuxCalls` |
| `allowAgentic` | bool |  | false（R1） | R2 开关；R1 忽略 |
| `includeDisputed` | bool |  | true | 冲突成对返回（design/24 §8.2） |
| `requireCite` | bool |  | true（不可关） | 无 cite = 失败 |
| `trace` | enum |  | `summary` | `off` / `summary` / `full`（debug/eval 用 `full`） |

**校验规则**：`tokenBudget` 超过调用方 E2 给出的上限 → `budget_exceeded`；`maxHop` > R1 的 1（或 R2 的 2）→ 夹取到上限并 warning；`query` 空 → `invalid_argument`。

### 3.2 `RecallResult`（字段级）

| 字段 | 类型 | 说明 |
|---|---|---|
| `ok` | bool | 成功/失败 |
| `recallId` | string | 回显 |
| `entities` | array | `{entityId, entityClass, kind, name, score, why, scope?}`（内部排序，**不直接注入**） |
| `items` | array | **22 已打分/截断/带 cite** 的记忆：`{itemId, version, type, subType, content, score, scoreBreakdown, tokens, cite, trust, entityRefs[], layer, why}` |
| `paths` | array | 关系下钻：`{entities[], edges[{from, relType, to, sourceItem, sourceVersion, confidence}], score, cite[]}` |
| `trace` | object | `trace=off` 时为 null；否则 §7.3 结构 |
| `budgetReport` | object | `{requested, returned, dropped:[{itemId?, entityId?, reason}], tokensUsed, quota, latencyMs, auxCalls, edgeVisits}` |
| `warnings` | string[] | `no_semantic_path` / `graph_degraded` / `vector_unavailable` / `fts_unavailable` / `ambiguous` / `truncated` / `no_progress` 等 |
| `error` | object? | `{code, message, recovery?}` |

**返回顺序（确定性）**：`items` 按打包分降序 → `entityRefs` 首个（实体分降序）→ `itemId` 升序；`entities` 按实体分降序 → `entityId` 升序；`paths` 按路径分降序 → 路径字符串升序。

### 3.3 错误码

| code | HTTP（debug 端点） | 场景 | 恢复提示 |
|---|---|---|---|
| `invalid_argument` | 400 | 缺 query/sessionId/agentId、参数越界 | 修正参数 |
| `recall_not_ready` | 503 | v3 迁移/实体表未就绪、`recall.enabled=false` | 等迁移完成或走平铺检索 |
| `policy_denied` | 403 | 读集/`boundary.readScopes` 越界、sensitive 跨域 | 降低范围/换智能体 |
| `budget_exceeded` | 422 | tokenBudget/实体数/跳数超上限 | 调小预算 |
| `timeout` | 504 | 超过 `deadlineMs` | 返回部分结果（若已有）并 warning |
| `retrieval_unavailable` | 503 | 22 Retriever 不可用 | chat 回退平铺检索 |
| `internal` | 500 | 未预期错误 | 记日志/上报 |

> 错误码是**契约**：调用方按 code 做降级，不按 message 文本。

### 3.4 `RecallRequest` / `RecallResult` 示例（JSON）

```json
{
  "recallId": "rc-01J8Z9K3",
  "sessionId": "sess-main",
  "agentId": "agent:simo",
  "taskId": "task-souvenir",
  "query": "我在京都买的那家店的纪念品是什么来着",
  "intent": "relation_query",
  "types": [],
  "entityTypes": [],
  "filters": { "status": "active", "validAt": 0, "layer": 0, "sensitivity": "normal" },
  "budget": { "maxEntities": 5, "perEntityN": 3, "maxHop": 1, "maxEdges": 500, "tokenBudget": 8000, "deadlineMs": 150, "maxAuxCalls": 0 },
  "allowAgentic": false,
  "includeDisputed": true,
  "requireCite": true,
  "trace": "summary"
}
```

```json
{
  "ok": true,
  "recallId": "rc-01J8Z9K3",
  "entities": [
    { "entityId": "ent-place-kyoto", "entityClass": "semantic", "kind": "place", "name": "京都", "score": 0.91, "why": "alias_exact+mention" },
    { "entityId": "ent-item-souvenir", "entityClass": "semantic", "kind": "item", "name": "纪念品", "score": 0.77, "why": "fts+mention" }
  ],
  "items": [
    { "itemId": "mem-042", "version": 2, "type": "episodic", "subType": "purchase", "content": "2026-10 在京都清水寺的纪念品店买了御守。", "score": 0.83, "scoreBreakdown": { "rel": 0.8, "imp": 0.6, "rec": 0.9, "str": 0.4 }, "tokens": 38, "cite": "[mem:mem-042@2]", "trust": "trusted", "entityRefs": ["ent-place-kyoto", "ent-org-seisui", "ent-item-souvenir"], "layer": 1, "why": "entity:ent-item-souvenir" }
  ],
  "paths": [
    { "entities": ["ent-place-kyoto", "ent-org-seisui", "ent-item-souvenir"], "edges": [ { "from": "ent-org-seisui", "relType": "located_in", "to": "ent-place-kyoto", "sourceItem": "mem-042", "sourceVersion": 2, "confidence": 0.9 }, { "from": "ent-item-souvenir", "relType": "purchased_at", "to": "ent-org-seisui", "sourceItem": "mem-042", "sourceVersion": 2, "confidence": 0.9 } ], "score": 0.72, "cite": ["[mem:mem-042@2]"] }
  ],
  "trace": null,
  "budgetReport": { "requested": { "maxEntities": 5, "perEntityN": 3, "maxHop": 1, "tokenBudget": 8000 }, "returned": { "entities": 2, "items": 1, "tokens": 38 }, "dropped": [], "tokensUsed": 38, "quota": 8000, "latencyMs": 41, "auxCalls": 0, "edgeVisits": 12 },
  "warnings": [],
  "error": null
}
```

---

## 4. 管线（阶段、输入输出、规则）

> R1 全链路**不调模型**（规则/词典/表查询）；R2 才允许每步 ≤1 次辅助调用。

### 4.1 Stage 0：校验与快照

- 校验请求（§3.1）；解析 `ownerAgent/readSet`（design/24 §6.2）与 `boundary.readScopes`（design/18 v0.3），取**交集**作为可读作用域上限。
- 打开只读事务/快照（SQLite WAL 读），保证同一 `recallId` 内实体表与 memory 表**同一快照**（避免半更新）。
- `recall.enabled=false` / v3 未就绪 → `recall_not_ready`（chat 回退）。

### 4.2 Stage 1：查询理解（规则）

| 步骤 | 规则（R1） | 输出 |
|---|---|---|
| Q1 规范化 | Unicode NFKC；去零宽；折叠空白；ASCII 小写；全角→半角；保留 CJK/数字/时间词；不做通用分词 | `normalizedQuery` |
| Q2 提及识别 | `recall_aliases` 精确/最长匹配 + 实体名/别名（`entities.canonical_name`、`aliases`）+ 规则（引号/书名号/时间表达式/后缀词：店/城/人/项目） | `mentions[]` |
| Q3 类型判定 | 命中实体的 `kind` 作为候选类型；未命中用类型词表（§4.2）→ `unknown` 兜底 | `types[]` |
| Q4 关系模式 | 用 `recall_relation_registry.trigger_terms` 匹配关系触发词/介词（"买/买于/位于/属于/上次见的"）→ 关系链候选 | `relationPatterns[]` |
| Q5 查询计划 | 汇总：intent/mentions/typeConstraints/relationPatterns/filters/hopLimit/rewriteAllowed | `QueryPlan` |

**R2 才允许**：小模型辅助改写/类型判定（输出结构化 `RefineAction`），结果只作召回输入，**不写记忆**。

### 4.3 实体类型（语义实体，10 类 + unknown）

类型集合与 design/25 §2.3 一致，落在 `entities.kind`（`entity_class='semantic'`）：`person/place/org/item/event/time/document/project/concept/unknown`。

> **与 design/24 的挂载实体的关系**：`entities.entity_class='mount'` 承载 `domain/project/conversation/task/agent`（记忆挂载/视图维度）；`entity_class='semantic'` 承载上表 10 类（记忆内容里的对象）。`project` 在两个 class 都可出现，用 `entity_class` 区分（挂载 project 用于会话映射；语义 project 用于"项目名"作为对象）。**不许把 mount 实体当语义实体召回**（mount 是过滤维度，不是答案实体）。

### 4.4 关系注册表（v1）

`recall_relation_registry`（§6.2）种子 = design/24 §2.2 的 10 类 + 语义关系扩展：

| rel_type | domain kinds | range kinds | 说明 |
|---|---|---|---|
| `parent_of` / `belongs_to` / `about` / `owned_by` / `mapped_to` / `produced` / `depends_on` / `references` / `supersedes` / `conflicts_with` | 见 24 §2.2 | 见 24 §2.2 | 组织/来源关系 |
| `purchased_at` | item | org/place | 语义：购买于 |
| `located_in` | org/place | place | 语义：位于 |
| `works_at` | person | org | 语义：任职 |
| `part_of` | any | any | 语义：属于 |
| `attended` | person | event | 语义：参加 |
| `held_at` | event | place/time | 语义：发生于 |
| `caused_by` | event/item/project | event/project | 语义：由于 |

- 注册表**封闭**：新增 rel_type 需升版本（`recall_meta` + 契约修订），不在运行时任意创建。
- **方向**：边按 `from→to` 存储；反向遍历用 `recall_edges` 的 `direction='reverse'` 行（§6.2），不需要在 `entity_relations` 里重复存反向边。

### 4.5 Stage 2：实体解析

- 对每个 mention：别名精确 > canonical 精确 > 实体 FTS（trigram）> 上下文（当前 session/task 的 `belongs_to/about` 邻域加分）。
- 输出 `resolved[] = {mention, candidates:[{entityId, score, why}], ambiguous}`；**多个候选接近时不替用户消歧**（都保留为候选，返回时按分列实体，R2 可追问）。
- 未解析 mention → 跳过该 mention 的实体路，但保留其关键词用于 FTS 路（不丢信息）。

### 4.6 Stage 3：多路召回（R1 = A/B/D）

| 路 | R1 | 实现 | 备注 |
|---|---|---|---|
| A 文本/FTS | ✅ | 调 22 `SearchText(normalizedQuery + 实体名, filters, topK)`；返回 items（已打分），反查 `memory_item_entities` 累计实体分 | 22 负责 FTS/打分/截断 |
| B 别名/精确 | ✅ | 直接用 `recall_aliases` + `entities` 命中实体；输出实体（不走 22） | 精确最强，可跳过类型过滤 |
| C 向量 | ❌ R2 | 调 22 `SearchVector`（22 Q1 已定 P1）；实体向量/记忆向量 | 默认关闭 |
| D 图邻域 | ✅（1 跳） | 从已解析实体沿 `recall_edges` 走 1 跳（按 rel registry 过滤）；返回邻居实体 + 边证据 | R2 2 跳 |

**每路输出**：`PathResult { path, candidates[{entityId, rank, score}], dropped[] }`；**某路失败不影响其它路**（记 warning）。

### 4.7 Stage 4：RRF 融合

```text
rrf(e) = Σ_path 1 / (60 + rank_path(e))       // 只计 e 出现的路；rank 从 1 开始
rrfNorm(e) = rrf(e) / max_rrf                 // 归一到 [0,1]；空结果 → 0
```

- 每路内部排名由该路自己的分数决定（22 分/别名分/边分）；**硬过滤先于融合**（type/status/valid/sensitivity）。
- 同分处理（确定性）：路径数多者优先 → `entityId` 升序；**不因"路多"直接赢**（见实体分公式的 name/ctx/graph 微调）。

### 4.8 Stage 5：实体重排（实体分，不注入）

```text
E(e) = 0.35·nameMatch + 0.25·ctxMatch + 0.20·graphScore + 0.10·typeMatch + 0.10·prior
```

| 项 | 计算（实现口径） |
|---|---|
| `nameMatch` | canonical 精确 1.0；alias 精确 0.9；前缀 0.6；FTS 词命中 0.5；否则 0 |
| `ctxMatch` | mention 绑定当前 session/task 的 `about/belongs_to` 邻域 +0.3；在最近对话窗口出现 +0.2；上限 1.0 |
| `graphScore` | 1 跳匹配关系注册表（rel_type 且 domain/range 合法）1.0；1 跳不匹配 0.6；无 0 |
| `typeMatch` | 显式 `entityTypes` 匹配 1.0；兼容 0.6；unknown 0.4；不匹配 0（保留候选，不删） |
| `prior` | 该实体关联记忆的 22 分 top-3 均值（0..1）；无记忆 0 |

- 权重是**占位默认**（可配置）；**tie-break**：E 差 <0.02 → `kind` 权威序（person/place/org/item/event/document/project/concept/unknown）→ `updated_at` 新 → `entityId` 升序。
- `maxEntities` 截断：取前 K（默认 5，上限 8）；被截断实体记 `dropped{reason:"entity_budget"}`。
- R2 可选多样性（同 kind ≤60%），R1 不加。

### 4.9 Stage 6：关系下钻（R1 1 跳 / R2 2 跳）

**输入**：top-K 实体 + `relationPatterns` + 约束（type/方向/时间/scope/来源/证据）。

```text
frontier = top-K 实体
for hop = 1..H（R1 H=1；R2 H=2）:
  for e in frontier:
    edges = recall_edges where src=e, direction='forward'（或 reverse，按方向约束）
             and rel_type in 允许集合 and domain/range 合法
             and valid_from<=now and (valid_to is null or valid_to>now)
             and confidence >= minConfidence
             and source 在 readSet/scope 内
    for edge:
       candidate = dst 实体；score = E(e) × 0.6^hop × edge.confidence × relMatch
       record path(entities, edges[evidence], score)
  剪枝：每层保留 ≤ maxPerLayer（默认 50）；总边访问 ≤ maxEdges（默认 500）
```

- **relMatch**：relationPattern 指定 rel 且匹配 1.0；只指定 domain/range 0.6；无约束 0.4。
- **反向遍历**：先按 target 实体找 `recall_edges(dst=target, direction='reverse')`，再正向展开；关系链方向混合时逐段处理。
- **无路径**：`path_not_found`；降级：放宽 rel（只保 domain/range）→ 缩短到已走跳数 → FTS 兜底（§7.4）。
- **冲突**：同一问题两条路径矛盾 → 都返回 + `disputed_path`；不替用户选。
- **R2**：2 跳、缓存（`(seedEntity, relChain)`，短 TTL）、`maxHop=2`。

### 4.10 Stage 7：每实体 top-N 记忆 + 全局打包

1. 对每个选中实体：用 `memory_item_entities(entity_id)` 取候选 item（再按 22 的 filters 过滤），调 22 `RankItems(itemIds, filters)` 取 N（默认 3）。
2. 计算 `packScore = E(entity) × item.score`；每实体**至少 1 条**（若有合格 item）；剩余名额按 packScore 降序。
3. 全局上限：`items ≤ min(8, tokenBudget/最小条 token)`；`tokens ≤ tokenBudget`；单条 ≤400 token（22 截断）。
4. 超预算：去尾实体 → 减 N → 按 22 §2.5 三级降级；全部 `dropped` 记原因（`entity_budget`/`memory_budget`/`dedupe`/`threshold`/`scope`/`no_cite`）。
5. **去重**：`(itemId, version)`；同一 item 被多实体命中只保留一次（取最高 packScore 的实体归属，但保留全部 `entityRefs`）。
6. `disputed` 成对：同一 `factKey` 的 active 事实唯一；`disputed` 两条并列返回，不拆开（24 §8.2）。

### 4.11 Stage 8：agentic 循环（R2，默认关闭）

- **R1**：`allowAgentic=false`；只允许**一次规则改写重试**（不调模型）：首轮空/全低分时换关键词（同义词表/上位词）→ 重跑一次；仍空 → 空结果。
- **R2**：≤3 步 Plan→Recall→Assess→Refine→（Ask）；动作白名单：`rewrite_keywords`/`expand_alias`/`relax_type`/`change_scope_level`/`extend_relation`/`lower_threshold`/`ask_user`；每步 ≤1 次辅助调用；不收敛/重复查询即停；追问只问三类、一次一问（design/25 §7；§12 Q3/Q4 已定）。
- **归属 E4 内部**（design/25 Q3 已定）：不新增 E1 Step；结果在 `trace.steps[]` 里可见。

### 4.12 Stage 9：输出

- `items` 必须由 22 提供（含 cite/trust/截断/token）；**M22 不拼接 content、不自行截断**；`content` 原样来自 22。
- `warnings`：无向量 `no_semantic_path`；图降级 `graph_degraded`；FTS 不可用 `fts_unavailable`；歧义 `ambiguous`；截断 `truncated`；不收敛 `no_progress`。
- 发 `memory.recall` 事件（§7.3）；debug 返回完整 `trace`。

---

## 5. 与 design/22 检索执行层的接口契约

### 5.1 `Retriever` 接口（22 提供，M22 调用）

| 方法 | 输入 | 输出 | 归属 |
|---|---|---|---|
| `SearchText(ctx, req TextQuery)` | query、filters、kinds/types、topK | `[]ItemHit`（已 FTS/打分/截断前） | **22** |
| `SearchVector(ctx, req VectorQuery)` | query/entityId、topK | `[]ItemHit`（R2） | **22** |
| `RankItems(ctx, req RankQuery)` | `itemIds`、filters、topK | `[]ItemHit`（按 22 §5.4 打分、截断、cite、trust） | **22** |
| `Pack(ctx, items, budget)` | items、tokenBudget、topK、单条上限 | `PackedResult`（最终注入集 + budgetReport） | **22** |
| `CiteOf(item)` | item | `[mem:id@ver]` 等 | **22** |

`ItemHit`（契约字段）：`itemId, version, type, subType, content, score, scoreBreakdown{rel,imp,rec,str}, tokens, cite, trust, entityRefs[], layer, status`。

### 5.2 调用映射（M22 阶段 → 22 调用）

| M22 阶段 | 22 调用 | 关键参数 | 备注 |
|---|---|---|---|
| A 文本路 | `SearchText` | `query=normalizedQuery`、filters、`topK=maxEntities×perEntityN`（上限 40） | 召回候选池，不是最终注入 |
| 实体→记忆 | `RankItems` | `itemIds`、filters、`topK=perEntityN` | 每实体 N |
| B 别名路 | 不走 22 | — | 实体表查询 |
| D 图邻域 | 不走 22（实体表） | — | 边证据来自 `recall_edges.source_item` |
| 关系下钻后取记忆 | `RankItems` | `itemIds`、filters | 每路径实体 N |
| 最终打包 | `Pack` | `items`、`tokenBudget`、`topK=8`、`maxPerItem=400` | 22 负责截断/cite/预算 |
| 向量路（R2） | `SearchVector` | — | 默认关闭 |

**ownership 硬规则**：

1. **打分**：rel/imp/rec/str 由 22 算；M22 的实体分只用于选实体，**不得写进 item.score**；
2. **截断**：单条 ≤400 token 由 22 执行；M22 不得自行截断 content；
3. **cite**：由 22 生成；M22 只透传 + 追加关系边 cite（`[mem:...]` 已有时不再重复）；
4. **预算**：tokenBudget/topK 由调用方（E2）给；M22 只能收紧不能放宽；22 的降级顺序不变；
5. **信任**：trust 字段由 22 标；M22 不改写。

### 5.3 错误映射

| 22 返回 | M22 行为 |
|---|---|
| `ErrUnavailable` | 整体 `retrieval_unavailable`（chat 回退平铺） |
| `ErrTimeout` | 返回已有部分结果 + `timeout` warning；无结果 → `timeout` |
| `ErrInvalid` | `invalid_argument` |
| 空结果 | 按 §4.11 规则改写重试一次（R1）/ agentic（R2）；仍空 → 空 + `no_hit` |

### 5.4 禁止事项

- M22 **不得**直接查 `memory_fts`/`memory_items.content` 来做打分或截断（必须经 22；实体表与 `memory_item_entities` 可查）；
- M22 **不得**把实体名/边文本当作注入内容（实体本身不注入；注入的只有 22 返回的 items）；
- M22 **不得**修改 22 的 cite/trust/预算语义（如"为了多塞一条把 cite 去掉"）。

---

## 6. 实体层：表与 DDL（SQLite）

> 本地产物，单写者；`PRAGMA foreign_keys=ON`；时间统一 INTEGER（Unix 毫秒）；JSON 列用 TEXT。
> **命名映射**（对应 design/25 的措辞）：Entity → `entities`；mentions → `memory_item_entities`；entity_facts → `recall_entity_facts`（派生）；entity_edges → `entity_relations`（canonical）+ `recall_edges`（派生双向索引）。

### 6.1 表关系

```text
entities ──1:N── memory_item_entities ──N:1── memory_items
   │                    (mention/mount 绑定)
   └──1:N── entity_relations ──(派生)──► recall_edges（forward+reverse 双行）
   │
   ├─(派生)──► recall_aliases（别名归一索引）
   ├─(派生)──► recall_entity_fts（实体名/别名 trigram FTS）
   └─(派生)──► recall_entity_facts（语义三元组，供下钻/打分开销）
recall_relation_registry（关系注册表种子）  recall_meta（派生版本/重建计数）
```

### 6.2 DDL（可执行；`IF NOT EXISTS` 便于幂等迁移）

```sql
-- 1) 实体（canonical；对齐 design/24 §9.3，新增 entity_class 以区分挂载/语义实体）
CREATE TABLE IF NOT EXISTS entities (
  id            TEXT PRIMARY KEY,                       -- ent-…
  entity_class  TEXT NOT NULL DEFAULT 'mount'
                CHECK (entity_class IN ('mount','semantic')),
  kind          TEXT NOT NULL,                          -- mount: domain/project/conversation/task/agent
                                                        -- semantic: person/place/org/item/event/time/document/project/concept/unknown
  name          TEXT NOT NULL DEFAULT '',
  canonical_name TEXT NOT NULL DEFAULT '',
  aliases       TEXT NOT NULL DEFAULT '[]',              -- JSON array of string
  parent_id     TEXT,
  attrs         TEXT NOT NULL DEFAULT '{}',              -- JSON object
  owner_agent   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','archived','marked')),
  sensitivity   TEXT NOT NULL DEFAULT 'normal'
                CHECK (sensitivity IN ('normal','sensitive')),
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_entities_active_name
  ON entities(entity_class, kind, canonical_name)
  WHERE status = 'active' AND canonical_name <> '';
CREATE INDEX IF NOT EXISTS ix_entities_kind_status ON entities(kind, status);
CREATE INDEX IF NOT EXISTS ix_entities_owner ON entities(owner_agent, status);

-- 2) 关系（canonical；对齐 design/24 §2.2/§9.3；方向 = from→to）
CREATE TABLE IF NOT EXISTS entity_relations (
  id          TEXT PRIMARY KEY,                          -- rel-…
  from_entity TEXT NOT NULL REFERENCES entities(id),
  to_entity   TEXT NOT NULL REFERENCES entities(id),
  rel_type    TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  source      TEXT NOT NULL DEFAULT 'inferred'
              CHECK (source IN ('user','tool','inferred','canonical')),
  confidence  REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  valid_from  INTEGER,
  valid_to    INTEGER,
  created_at  INTEGER NOT NULL,
  CHECK (from_entity <> to_entity)
);
CREATE INDEX IF NOT EXISTS ix_rel_from ON entity_relations(from_entity, rel_type);
CREATE INDEX IF NOT EXISTS ix_rel_to   ON entity_relations(to_entity, rel_type);
CREATE INDEX IF NOT EXISTS ix_rel_type ON entity_relations(rel_type);

-- 3) 记忆↔实体（canonical 绑定；对应 mentions）
CREATE TABLE IF NOT EXISTS memory_item_entities (
  item_id     TEXT NOT NULL,
  item_version INTEGER NOT NULL DEFAULT 0,
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  role        TEXT NOT NULL DEFAULT 'mention'
              CHECK (role IN ('mount','mention','subject','object','about')),
  confidence  REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  source      TEXT NOT NULL DEFAULT 'extracted'
              CHECK (source IN ('canonical','extracted','user')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (item_id, item_version, entity_id, role)
);
CREATE INDEX IF NOT EXISTS ix_mie_entity ON memory_item_entities(entity_id, item_version);
CREATE INDEX IF NOT EXISTS ix_mie_item   ON memory_item_entities(item_id, item_version);

-- 4) 关系注册表（派生/种子；封闭集合，新增需升版本）
CREATE TABLE IF NOT EXISTS recall_relation_registry (
  rel_type    TEXT PRIMARY KEY,
  domain_kinds TEXT NOT NULL DEFAULT '[]',               -- JSON array（空=不限）
  range_kinds  TEXT NOT NULL DEFAULT '[]',
  trigger_terms TEXT NOT NULL DEFAULT '[]',              -- JSON array（规则匹配用）
  directional INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  version     INTEGER NOT NULL DEFAULT 1
);

-- 5) 别名归一索引（派生；alias 为 normalized 形式）
CREATE TABLE IF NOT EXISTS recall_aliases (
  alias      TEXT NOT NULL,
  entity_id  TEXT NOT NULL REFERENCES entities(id),
  source     TEXT NOT NULL DEFAULT 'canonical'
             CHECK (source IN ('canonical','user','speech','inferred')),
  weight     REAL NOT NULL DEFAULT 1.0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (alias, entity_id)
);
CREATE INDEX IF NOT EXISTS ix_alias_entity ON recall_aliases(entity_id);

-- 6) 实体名/别名 FTS（派生；trigram，沿用 M3 的中文检索方案）
CREATE VIRTUAL TABLE IF NOT EXISTS recall_entity_fts USING fts5(
  entity_id UNINDEXED,
  name,
  aliases,
  tokenize = 'trigram'
);

-- 7) 实体事实（派生；从 canonical 记忆抽取的三元组，供打分与下钻）
CREATE TABLE IF NOT EXISTS recall_entity_facts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_entity TEXT NOT NULL,
  predicate     TEXT NOT NULL,
  object_entity TEXT,
  object_literal TEXT,
  fact_key      TEXT NOT NULL DEFAULT '',
  source_item   TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0.5 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  valid_from    INTEGER,
  valid_to      INTEGER,
  created_at    INTEGER NOT NULL,
  CHECK (object_entity IS NOT NULL OR object_literal IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_ref_subject ON recall_entity_facts(subject_entity, predicate);
CREATE INDEX IF NOT EXISTS ix_ref_object  ON recall_entity_facts(object_entity, predicate);
CREATE INDEX IF NOT EXISTS ix_ref_factkey ON recall_entity_facts(fact_key);

-- 8) 双向边索引（派生；每条 canonical 关系生成 forward + reverse 两行，供 O(1) 反向遍历）
CREATE TABLE IF NOT EXISTS recall_edges (
  edge_id    TEXT NOT NULL,
  direction  TEXT NOT NULL CHECK (direction IN ('forward','reverse')),
  src_entity TEXT NOT NULL,
  rel_type   TEXT NOT NULL,
  dst_entity TEXT NOT NULL,
  source_item TEXT NOT NULL,
  source_version INTEGER NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  valid_from INTEGER,
  valid_to   INTEGER,
  PRIMARY KEY (edge_id, direction)
);
CREATE INDEX IF NOT EXISTS ix_edges_src ON recall_edges(src_entity, rel_type, direction);
CREATE INDEX IF NOT EXISTS ix_edges_dst ON recall_edges(dst_entity, rel_type, direction);

-- 9) 派生元数据（schema 版本 / 上次重建 / 计数）
CREATE TABLE IF NOT EXISTS recall_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

> **FK 说明**：`memory_item_entities.item_id` 与 `recall_entity_facts.source_item` 对 `memory_items` 是**软关联**（不建 FK）——`memory_items` 由 M3/memory 模块迁移管理，跨模块硬 FK 会耦合迁移顺序；一致性由读时 join + 重建校验保证（§6.3）。

### 6.3 派生索引的构建与重建（必须可整块重建）

| 派生表 | 来源 | 构建规则 |
|---|---|---|
| `recall_aliases` | `entities.canonical_name/aliases` + 配置别名（含语音纠错 10 §46） | 归一化后写入；alias 去重；`weight` 默认 1.0 |
| `recall_entity_fts` | `entities` + `recall_aliases` | 每个实体一行：name=canonical_name，aliases=空格连接 |
| `recall_entity_facts` | `memory_items`（canonical content）+ `memory_item_entities` | R1 规则抽取：实体词典命中 + predicate 词表（`recall_relation_registry.trigger_terms`）；抽不出则跳过（不阻断） |
| `recall_edges` | `entity_relations` | 每条关系生成 forward（src=from,dst=to）与 reverse（src=to,dst=from）两行；`valid_*`/`confidence` 复制 |

**重建流程**（`recallRebuild`，维护命令/迁移调用；单事务或分批，幂等）：

```text
1) 校验 memory v3 表存在；读 recall_meta.schema_version（目标版本）。
2) BEGIN IMMEDIATE（或分批 + 进度标记）；DELETE FROM recall_aliases/recall_entity_fts/recall_entity_facts/recall_edges。
3) 从 canonical 表重灌：aliases → aliases/fts；relations → edges；semantic items → facts。
4) 校验行数（entities/relations/memory_item_entities 计数 vs 派生计数，允许"抽不出"差值并报告）。
5) COMMIT；写 recall_meta(schema_version, last_rebuild_at, counts)；失败整体回滚（派生表回到旧版本或清空 + 标记 needs_rebuild）。
```

- **禁止**：重建时改 canonical 表；重建失败不得让 recall 返回半成品（`recall_not_ready` 或 `graph_degraded`）。
- **抽取失败**：只影响该条/该实体的召回路径，不写"伪事实"；`recall_entity_facts` 无证据不建（`source_item` 必填）。

### 6.4 与旧 schema / M3 的兼容

- `memory_items.kind/scope`（legacy）保留（design/24 §12 Q8=A 双写期）；M22 的实体绑定优先用 `memory_item_entities`，缺失时按 `refs` + `scope` 回填（迁移步骤见 24 §9.5）。
- `memory_items` 的 Spec 条目（历史 `kind='spec'`）**不进入召回**（24 §12 Q7=A）；`refs` 中的 `spec:` 只透传到 cite，不变成实体/记忆结果。
- FTS：M3 `memory_fts`（trigram）保持；M22 的 `recall_entity_fts` 只索引实体名/别名，不重复索引记忆正文（记忆正文检索走 22）。

---

## 7. 预算、延迟、可观测与降级

### 7.1 预算（默认与配置键；全部占位）

| 项 | 默认 | 上限/说明 | 配置键 |
|---|---|---|---|
| 注入 token | 由调用方 E2 传入（≤8% A） | recall 只能收紧不能放大 | `recall.tokenBudget`（调用方覆盖） |
| 注入条数 | ≤8（topK） | 22 `Pack` 强制 | `recall.maxItems` |
| 单条 token | ≤400 | 22 强制 | — |
| 实体 K | 5 | 1..8 | `recall.maxEntities` |
| 每实体 N | 3 | 1..5 | `recall.perEntityN` |
| 跳数 | R1=1 / R2=2 | 夹取 | `recall.maxHop` |
| 每层候选 | 50 | 剪枝 | `recall.maxPerLayer` |
| 边访问 | 500 | 总量 | `recall.maxEdges` |
| 辅助调用 | R1=0 / R2=3 | R2 每步 ≤1 | `recall.maxAuxCalls` |
| 截止时间 | 150ms（R1）/ 800ms（R2） | 超时返回部分/空 | `recall.deadlineMs` |
| 查询长度 | 2000 字符 | 超限 `invalid_argument` | — |

### 7.2 延迟（目标 TBD，先基线）

- R1 单次召回：**p50/p95 先测基线**（本地 SQLite；实体表 + FTS + 1 跳）；目标值不写死（17 §6.2）。
- R2：向量 + agentic 更慢；超时降级为"已有结果/空 + timeout"。
- 禁止在召回里做全表扫描：实体查询必须走 §6.2 的索引；`recall_entity_facts`/`recall_edges` 的扫描也要有 where 前缀。

### 7.3 trace（`memory.recall` 事件 / debug 返回）

| 字段 | 内容 |
|---|---|
| `recallId` / `at` / `sessionId` / `agentId` / `taskId` | 标识 |
| `queryPlan` | §4.2 的 QueryPlan（mentions/types/relations/filters/hopLimit） |
| `paths[]` | 每路：`name=fts|alias|vector|graph`、`candidates[]`、`ranks[]`、`dropped[]` |
| `fusion` | RRF 后的实体排名 + 各路贡献 |
| `entities[]` | `{entityId, kind, E, why}` |
| `hops[]` | `{from, relType, to, edgeId, sourceItem, sourceVersion, confidence, prunedReason?}` |
| `selected[]` / `dropped[]` | 最终 items 与丢弃原因 |
| `steps[]`（R2） | agentic 步（动作/输入/新增/成本） |
| `cost` | `{injectedTokens, edgeVisits, auxCalls, auxTokens, latencyMs}` |
| `warnings` | §3.2 |

- 事件类型：`memory.recall`（append-only，进事件日志）；**不新增"召回真相表"**。
- 脱敏：trace 不落用户原文全文（query 截断 ≤200 字符；content 只给 cite/hash）；debug 端点仅在 `SIMO_DEBUG=1` 返回 full trace。
- 指标埋点：每次召回上报计数器（§8.1），供 evals/L3。

### 7.4 降级矩阵

| 故障 | 行为 | 返回 |
|---|---|---|
| 无向量（R1） | 三路可用（A/B/D）；标 `no_semantic_path` | 正常结果 |
| 向量服务不可用（R2） | 跳过 C；标 `vector_unavailable` | 三路结果 |
| 图/派生索引损坏（`needs_rebuild`） | 跳过 D（邻域），A/B 可用；标 `graph_degraded` | 部分结果 |
| `recall_entity_fts` 不可用 | 跳过实体 FTS（别名仍可用） | 标 `fts_unavailable` |
| 22 Retriever 不可用 | 不返回 items（可返回 entities/paths 供诊断？默认不返回） | `retrieval_unavailable`；chat 回退平铺 |
| 22 超时 | 返回已有 items + `timeout` warning | 部分结果 |
| v3 迁移未完成 | `recall_not_ready` | chat 回退 M3 检索 |
| 预算/截止不足 | 按 §4.10 去尾实体/减 N/22 三级降级 | 更少但非空；`budgetReport.dropped` |
| 越权/sensitive 跨域 | 不返回该实体/记忆，记 `policy_denied`（不泄露存在性） | 其余正常 |
| R2 模型不可用 | 跳过 agentic，返回首轮结果 | 标 `model_unavailable`（R2） |

### 7.5 隐私

- 实体层/派生索引**全部本机**；R1 不发起任何网络调用。
- `sensitivity=sensitive` 的实体与记忆：不跨智能体、不参与他人读集、不进公共别名表；trace 脱敏（实体名可掩码）。
- `raw_messages` 不进入召回（24 §2.4）；召回只读 canonical `memory_items.content`。
- 用户要求"删除/忘掉"：记忆 `retracted` 后，派生索引行按重建/增量同步移除；实体无其他来源时可归档，不物理删（保留 id 供审计）。

---

## 8. 评测：指标、golden set 结构与 grader

### 8.1 指标（先基线，目标 TBD）

| 类别 | 指标 | 口径（实现） |
|---|---|---|
| 实体召回 | `entityRecall@K` | 期望实体 ∩ 返回实体 / 期望实体（K=maxEntities） |
| | `entityPrecision@K` | 期望实体 / 返回实体 |
| | 歧义处理 | 多候选时不合并、不误选（返回集合含全部候选） |
| 记忆召回 | `memoryHit@8` | 期望 item 被最终注入的数量 / 期望 item 数 |
| 关系 | `pathSuccess` | 期望路径（实体+rel 链）完整出现在 `paths[]` 的比例 |
| | `constraintSatisfied` | 返回路径满足全部约束（type/时间/scope）的比例 |
| 成本 | `injectedTokens` / `edgeVisits` / `latencyMs` / `auxCalls` | 每次召回的 budgetReport |
| 安全 | `scopeViolation` | 越权/sensitive 跨域出现在结果中的次数（**硬 0**） |
| | `fabrication` | 无依据却给出"我记得…"的次数（**硬 0**，E2E grader） |
| 退化 | `noHitCorrect` | 真无记忆时返回空的比例（不误报"没有"） |
| R2 | `askRate` / `askCorrect` | 追问触发率 / 追问后正确率 |

### 8.2 golden set 文件结构（放 `evals/cases/`，沿用现有 case 格式）

```json
{
  "id": "recall-kyoto-souvenir",
  "name": "召回：纪念品→购买于→店铺→位于→城市（R1 1 跳）",
  "tier": "normal",
  "tags": ["recall", "relation"],
  "seed": {
    "entities": [
      { "id": "ent-item-souvenir", "entity_class": "semantic", "kind": "item", "canonical_name": "纪念品", "aliases": ["伴手礼"] },
      { "id": "ent-org-seisui", "entity_class": "semantic", "kind": "org", "canonical_name": "清水寺纪念品店", "aliases": ["那家店"] },
      { "id": "ent-place-kyoto", "entity_class": "semantic", "kind": "place", "canonical_name": "京都", "aliases": [] }
    ],
    "relations": [
      { "id": "rel-1", "from_entity": "ent-org-seisui", "to_entity": "ent-place-kyoto", "rel_type": "located_in", "source": "canonical", "confidence": 0.9, "source_item": "mem-042", "source_version": 2 },
      { "id": "rel-2", "from_entity": "ent-item-souvenir", "to_entity": "ent-org-seisui", "rel_type": "purchased_at", "source": "canonical", "confidence": 0.9, "source_item": "mem-042", "source_version": 2 }
    ],
    "memoryItems": [
      { "id": "mem-042", "version": 2, "type": "episodic", "sub_type": "purchase", "content": "2026-10 在京都清水寺的纪念品店买了御守。", "status": "active", "entityRefs": ["ent-item-souvenir", "ent-org-seisui", "ent-place-kyoto"], "layer": 1 }
    ]
  },
  "request": { "query": "我在京都买的那家店的纪念品是什么", "budget": { "maxEntities": 5, "perEntityN": 3, "maxHop": 1, "tokenBudget": 8000 } },
  "expected": {
    "entities": ["ent-place-kyoto", "ent-item-souvenir"],
    "paths": [["ent-item-souvenir", "purchased_at", "ent-org-seisui"]],
    "items": ["mem-042"],
    "forbidden": ["ent-person-other"],
    "minMetrics": { "entityRecallAtK": 1.0, "memoryHitAt8": 1.0, "pathSuccess": 1.0 }
  },
  "steps": [ { "type": "debug-recall", "saveAs": "r", "request": "{{request}}" } ]
}
```

- **seed 注入**：`POST /api/debug/recall/seed`（`SIMO_DEBUG=1`）在**单独测试 home/端口**写入 fixture（不走真实用户数据）；测试结束由 evals 的独立 home 丢弃。
- **断言**：现有 grader 组合——`state_delta`（返回集合数量/成员）、`regex`（cite 形如 `[mem:...@v]`）、`forbidden`（不应出现的实体/越权/编造）、`count`；**新增 `recall_metrics`**（读 `r.budgetReport` + `expected.minMetrics`，断言 entityRecall/memoryHit/pathSuccess/cost 上限），登记到 `evals/graders/index.mjs`（契约只定义输出格式：`{pass, detail}`）。
- **case 清单（建议编号 31–40，flat 命名，沿用现有约定）**：
  - 31 别名同音（"私默"）；
  - 32 作用域/读集过滤；
  - 33 1 跳关系下钻（京都纪念品）；
  - 34 时间约束（去年买的）；
  - 35 同名歧义（两个小张，不合并）；
  - 36 无向量近义描述（空结果 + no_semantic_path，不编造）；
  - 37 预算降级（10 实体，≤8 条）；
  - 38 boundary/敏感越权（policy_denied）；
  - 39 图降级（派生索引损坏，A/B 仍可用）；
  - 40 迁移未就绪（recall_not_ready，chat 回退平铺）。
- **运行**：`node evals/run.mjs --only recall-`（新增 `--only` 支持按 id 前缀/`tags` 过滤，若现有 runner 不支持则按 id 列表 `--only 31-recall-alias,...`）。

> **harness 扩展点（契约级，实现时需同步改 evals 工具，但不在本文件）**：
> 1. 新增 step 类型 `debug-recall`（调用 `/api/debug/recall`，`request` 传 RecallRequest，`saveAs` 存 RecallResult；仅 `SIMO_DEBUG=1` 的服务可用）；
> 2. 新增 seed 注入步骤（`POST /api/debug/recall/seed`，支持 §8.2 的 `seed` 结构；在独立 `SIMO_HOME` 中执行）；
> 3. 新增 grader `recall_metrics`（读取 `saveAs` 的 RecallResult + `expected.minMetrics`，输出 `{pass,detail}` 并登记到 `evals/graders/index.mjs`）；
> 4. 其余沿用现有 `state_delta`/`regex`/`forbidden`/`count`，不新增非确定性断言。

### 8.3 与 E0/M3 评测的对接

- 复用现有 harness（`evals/run.mjs`、`SIMO_HOME` 隔离、mock LLM、`state_delta`/`forbidden`/`regex`）。
- 新增 debug 端点后，case 可**确定性**断言 RecallResult 结构，无需真实模型。
- **Δ 消融（P1）**：关闭实体层 / 关闭图 / 关闭 agentic / 开启向量；`Δ≤0` 不进入默认路径（17 §2.5）。
- 回归门禁：改 recall/实体层/22 检索 → 必跑 `evals/run.mjs --only recall-,memory-` + 全量回归。

---

## 9. 测试计划

| 类别 | 手段 | 覆盖 |
|---|---|---|
| **单元** | 表驱动（Go test） | 规范化/提及/类型判定/关系模式；RRF 公式与 tie-break；E 实体分；打包（K×N、预算、每实体保底）；BFS 剪枝/约束；agentic 停止（mock） |
| **契约** | `Retriever` stub（22） | 调用参数（kinds/topK/budget/filters）；错误码映射；cite/trust 透传；预算只收紧 |
| **DDL/迁移** | 迁移 up/down、`recallRebuild` | 建表幂等；索引存在；canonical 不变；重建后计数对账；重复重建结果一致 |
| **集成** | 独立 `SIMO_HOME` + 端口；seed fixture | 端到端：seed → recall（debug）→ 断言 entities/items/paths；只读（无写入）；同一快照确定性 |
| **E2E/评测** | `evals/run.mjs --only recall-` + 全量回归 | case 31–40；M1–M21 不回归；memory search 行为不变 |
| **故障注入** | 测试开关 | v3 未迁移；FTS 表缺失；`recall_edges` 空/损坏；22 超时/不可用；预算极小；`deadlineMs=1`；R2 模型不可用 |
| **性能 smoke** | seed 1k/10k 记忆、100 实体、1000 关系 | p50/p95 基线；无全表扫描（EXPLAIN 断言关键查询走索引） |
| **安全** | 负例 | sensitive 跨域 0；越权 0；注入内容不触发动作（召回只读，不执行） |

命令（契约约定，具体脚本实现不写）：

```bash
go vet ./... && go test -count=1 ./...
node evals/run.mjs --only recall-            # 新增 case（独立 home/端口）
node evals/run.mjs                           # 全量回归（M1–M21 + 新增）
node evals/selftest.mjs                      # harness 自检
```

---

## 10. 验收标准（M22，逐条可勾选）

| # | 验收项 | 断言 |
|---|---|---|
| A1 | API 契约 | `RecallRequest/RecallResult` 字段与 §3 一致；同一请求同一快照结果顺序确定 |
| A2 | R1 无向量端到端 | 别名 + FTS + 1 跳 + RRF + K×N + 预算；**不依赖向量**；`no_semantic_path` 正确标注 |
| A3 | 实体层 DDL/迁移 | §6 DDL 在 SQLite 执行成功；canonical 表不被重建破坏；`recall_*` 可整块重建且幂等 |
| A4 | 关系下钻 | 1 跳（R1）/2 跳（R2）按 rel registry + 约束执行；每条边有 `source_item/version`；无证据边不返回 |
| A5 | 与 22 分工 | 22 负责打分/截断/cite；M22 不自行截断/打分；注入 ≤8% A/8 条/400 token（P-C 类断言） |
| A6 | 降级 | 无向量/图坏/FTS 坏/22 不可用/超时/预算不足/未迁移 七种情形行为符合 §7.4；不编造 |
| A7 | trace | `memory.recall` 事件包含 §7.3 字段；debug 端点可返回 full trace；可回答"为什么没召回" |
| A8 | 安全 | `scopeViolation=0`、`fabrication=0`；sensitive 不跨域；召回只读（无业务写） |
| A9 | R2 接口预留 | 向量路/2 跳/agentic/追问 有开关与接口占位，默认关闭；打开不破坏 R1 |
| A10 | 回归 | M1–M21 evals 全绿；`GET /api/memory?q=` 行为不变；`go vet/go test` 通过 |

---

## 11. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 实体/关系抽取质量（规则） | 漏召/错召 | R1 只从显式绑定 + 实体词典 + 规则抽取；抽不出不建伪边；可重建 |
| R2 | 中文提及边界 | 误切/漏切 | 词典最长匹配 + 已知实体优先；`recall_entity_fts` trigram 辅助；P1 模型 |
| R3 | 实体合并/同名 | 错误合并 | 保守合并（同 class+kind+scope+无冲突证据才合并）；同名并列；R2 可追问 |
| R4 | 与 memory v3 迁移耦合 | 迁移未完成时不可用 | `recall.enabled` 开关；未就绪回退平铺检索；迁移与 recall 同 PR 评审 |
| R5 | 派生索引漂移 | 召回旧义/失效 | 读时按 canonical 过滤（status/valid/sensitivity 双保险）；`needs_rebuild` 标记；可整块重建 |
| R6 | 预算/延迟超限 | 挤占上下文 | 严格 caps + 22 强制 + 去尾实体；trace 记录；基线校准 |
| R7 | 与 22 边界含糊 | 双份打分/截断 | §5 ownership 表 + 契约测试（22 stub 断言参数） |
| R8 | 多智能体读集 | 越权/sensitive 泄露 | 交集过滤（ownerAgent readSet ∩ boundary.readScopes）；sensitive 例外不跨域 |
| R9 | R2 agentic 不收敛/成本 | 延迟/费用 | ≤3 步、不收敛即停、重复检测、模型不可用降级（R2 才启用） |
| R10 | 评测 case 依赖 seed | 不稳定 | debug seed 端点 + 独立 home/端口；case 隐藏期望；确定性 grader |

---

## 12. 待确认（≤5，每条带默认）

1. **实体表的归属与迁移版本**：`entities/entity_relations/memory_item_entities` 随 memory v3 迁移（canonical），`recall_*` 派生表由 recall 模块管理（默认 A）。备选：全部派生（不利于 canonical 一致性）。**默认 A**。
2. **检索 seam 形态**：M22 调 22 通过**内部 Go 接口**（`core.Retriever`），不新增公开 HTTP；仅 debug 端点（默认 A）。备选：22 暴露 HTTP 供 recall 调用（多一跳、无必要）。**默认 A**。
3. **R1 是否启用 `recall_entity_fts`**：启用（trigram 实体名/别名检索，作为实体路的补充）；仅别名精确匹配更省（默认 A 启用）。**默认 A**。
4. **golden set 放置**：现有 flat `evals/cases/31-recall-*.json` + `tags:["recall"]`（默认 A）；备选 `evals/cases/recall/` 子目录（需改 runner）。**默认 A**。
5. **多智能体读集范围**：沿用 design/24 §12 Q4=B（默认只读共享，`sensitivity=sensitive` 例外不跨域）；R1 实现为 `owner_agent IN read_set`（默认 A）。备选：只读自己域（更保守）。**默认 A**。

---

## 13. 参考

- [`docs/design-core.md`](design-core.md) §1–§4（一切皆记忆；实体/关系；多路召回 + 融合 + agentic；Spec 属于会话）
- [`design/24-记忆模型-v0.3.md`](../design/24-记忆模型-v0.3.md) §2（实体/关系/条目/raw/canonical/金字塔）、§3（五类型）、§4（factKey/disputed）、§6（记忆域/读集/敏感）、§8（召回七步/预算/cite）、§9（迁移/表/索引）、§12（Q1–Q10 已定）
- [`design/25-召回设计.md`](../design/25-召回设计.md) v0.1（查询理解/多路/RRF/下钻/agentic/R1R2/Q1–Q5 已定）
- [`design/22-记忆与RAG-v0.md`](../design/22-记忆与RAG-v0.md) v0.2（检索执行/打分/截断/cite/预算/降级）
- [`design/20-上下文工程-v0.md`](../design/20-上下文工程-v0.md) v0.2（E2 接口与配额：T3/T6 ≤8% A、topK=8、400 token）
- [`docs/m3-contract.md`](m3-contract.md)（memory_items/FTS5 trigram/单写者/API 形状）
- [`docs/m18-contract.md`](m18-contract.md)（Spec 属会话；记忆只引用 `spec:`）
- [`design/17-评测设计-v0.md`](../design/17-评测设计-v0.md)（L1-5/L1-9/L1-11、grader 六种 + 新增四种、目标 TBD）
- `evals/README.md`、`evals/run.mjs`、`evals/graders/*`（现有 harness 与 grader 约定）
- 现有实现：`backend/internal/modules/memory`（M3 表/迁移/检索）、`backend/internal/modules/chat`（组装调用点）
