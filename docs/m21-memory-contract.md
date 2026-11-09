# M21 实现契约：记忆 v0.3（实体 / 关系 / canonical / 金字塔 / 智能体记忆）

> **前置**：M3（记忆地基，已交付）、M9（权限/审批）、M18（SpecCore，`canArchive`）、M19（长程运行时）、M20（动作层，`memory` 命名空间）。
> **版本**：v0.1（2026-11-08，初稿待评审）；字段名/表名/接口形状经评审后即为锁定面。
> **依据**：[`design/24-记忆模型-v0.3.md`](../design/24-记忆模型-v0.3.md)（**v0.3.1 定稿，Lead 拍板**）、[`docs/design-core.md`](design-core.md)（用户 2026-11-07 确认的核心模型）、[`design/22-记忆与RAG-v0.md`](../design/22-记忆与RAG-v0.md)（读路径/预算/cite/打分）、[`docs/m3-contract.md`](m3-contract.md)（已实现记忆地基）、`agentd/internal/modules/memory`（现有实现，只读参考）、[`docs/m18-contract.md`](m18-contract.md)、[`docs/m19-contract.md`](m19-contract.md)、[`docs/m20-contract.md`](m20-contract.md)。
> **定位**：把 design/24 的语义**锁定为字段名/表名/接口形状/迁移步骤**，让后端、前端记忆页、评测三方可并行实现而不各写一套。**本契约不写代码**；SQL 只以语义描述（字段/约束/索引），不贴 DDL。
> **纪律**：本文所有数字（阈值、批量、超时、性能目标）都是**工程默认、可配置、非验收承诺**；验收以 §9 的行为断言为准，数字按 M21 基线校准。

---

## 1. 目标与非目标

### 1.1 目标（可验收）

1. **全局唯一库落地**：一个库内用 `entities / entity_relations / memories` 组织；会话/智能体是视图，不再分库（对齐 design-core §3）。
2. **五类型 + 事实唯一 + 观点归属 + 冲突保留**：`type ∈ {scene,semantic,norm,procedural,working}`；语义事实 `factKey` 部分唯一；观点必须 `attributed_to`；矛盾一律 `disputed`，不自动裁决。
3. **canonical 唯一入口**：raw 不可变 → canonical（意图识别/指代消解/归一化）→ 候选 → 单写者合并；三向溯源（raw↔canonical↔memory）可查。
4. **金字塔 L0–L4**：按实体层级可压缩、多视角、失效传播、可重建；检索可"摘要 + 下钻"。
5. **智能体通用记忆**：从自己负责的会话提炼、带来源、写域隔离；跨智能体默认只读（`sensitive` 例外）。
6. **可迁移、可回滚**：与已实现 `memory_items/history/candidates/conflicts/fts` 双向兼容（双写期 + 读开关 + 备份回滚），M1–M20 evals 不回归。

### 1.2 非目标（本里程碑不做）

- 向量检索/embedding/rerank（P1，沿用 design/22 Q1=C）；文档索引/RAG（P1）。
- 物理删除 raw（只有合规"标记删除"，见 §3.2.12、§9）；用户直接编辑记忆（仍只读，修改走对话）。
- 智能体团队 V1/V2 的协议（消息路由/团队模板）；前端记忆页改版（仅扩字段，保持只读）。
- Spec 语义变更（M18 已定）；长任务/动作层语义变更（M19/M20 已定，这里只增加 memory 动作项）。
- 多租户/多用户隔离。

---

## 2. 总体结构与数据流

### 2.1 架构图

```
                ┌────────────────────── 读路径（§6.1） ──────────────────────┐
 查询/意图 ──> 实体解析 ──> 多路召回(FTS/实体邻域/过滤) ──> RRF 融合 ──> 关系下钻
                └──> 金字塔层选择(摘要/下钻) ──> cite + 预算(8% A / K=8 / ≤400 tok)
                                                                     │
                                                                     ▼
  ┌─────────────── 记忆库（单库，单写者） ───────────────────────────────────┐
  │ raw_messages / raw_events（不可变，append-only）                          │
  │      │ canonical 化（异步，唯一入口）                                     │
  │      ▼                                                                   │
  │ canonical_units + mentions（意图/指代/归一；实体提及）                     │
  │      │ 抽取（W1–W4 触发）                                                 │
  │      ▼                                                                   │
  │ memory_candidates ──> 单写者合并（事务）──> memories（当前版本）            │
  │                                   │          ├─ memory_item_history（版本）│
  │                                   │          ├─ memory_entities（↔实体）   │
  │                                   │          ├─ attribution（观点归属）    │
  │                                   │          ├─ conflicts（disputed 成对） │
  │                                   │          ├─ entity_facts（事实槽位）   │
  │                                   │          └─ memory_fts_v3（派生索引）  │
  │ entities / entity_relations ──> entity_edges（派生邻接，可重建）           │
  │ pyramid_views / pyramid_nodes / pyramid_sources（派生，可重建）            │
  │ agent_memory（智能体通用记忆的来源/写域/提炼记录）                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 写管道（一句话）

**raw 落库（同步、不可变）→ canonical 化（异步、唯一入口、幂等）→ 抽取候选（W0–W4）→ 单写者事务合并（事实唯一/观点归属/冲突 disputed）→ 写 memories + 关系/归属/冲突/事实槽位/FTS（同事务）**。raw/canonical 由 **memory 模块的事件消费者**写；记忆真相由 **单写者 `Submit`** 写；没有第三条写路径。

### 2.3 读管道（一句话）

**实体解析 → 多路召回（FTS 关键词 + 实体邻域 + 结构化过滤；P1 加向量）→ RRF 融合 → 关系/金字塔下钻 → 按 design/22 的预算与 cite 打包**。检索不改任何数据（`access` 计数是唯一副作用，且失败不影响结果）。

### 2.4 模块边界（不可破）

| 边界 | 规则 |
|---|---|
| `chat`/`sessions`/`tasks` ↔ `memory` | 只经 `agentd/internal/core/memory` 接口；**不得 import memory 模块**，不得直接 SQL 读写记忆表（架构测试强制） |
| 事件 | memory 模块 `Start` 订阅 `eventlog`（现有）；写完后 `emit` `memory.*` 事件（§6.6） |
| 单写者 | 所有记忆真相写操作走 `memory.Module.Submit`（单 goroutine/串行事务）；其他 goroutine 只能读 |
| 迁移 | 只在 `memory` 模块迁移命名空间（`schema_migrations(module='memory')`）；**不碰** chat/sessions/tasks 表结构（raw 由消息事件复制而来，不回写 chat） |
| 动作层 | M20 的 `memory.*` 动作只读（R0）；写动作不暴露（§6.5） |

---

## 3. 表结构

### 3.1 表清单与迁移来源

> 命名约定：`TEXT` id 前缀见各表；时间一律 **Unix 毫秒 INTEGER**；`*_json` 为 JSON 文本；空字符串表示"无"，不用 NULL（与现有 memory 表风格一致，简化扫描）。

| # | 表 | 用途 | 真相/派生 | 迁移来源 |
|---|---|---|---|---|
| 1 | `entities` | 实体（域/项目/会话/任务/智能体） | 真相 | 新表；从 `scope` + `sessions` + `tasks` 回填 |
| 2 | `entity_relations` | 实体间关系（父子/归属/关于/负责/映射/依赖/取代/冲突） | 真相 | 新表；从 `tasks.session_id`、`sessions.parent_id`、`refs` 回填 |
| 3 | `entity_edges` | 实体邻接（召回用，带权重） | 派生 | 由 `entity_relations` + `memory_entities` 重建 |
| 4 | `memories` | **v0.3 记忆条目当前版本**（五类型） | 真相 | 从 `memory_items` 回填（id 复用） |
| 5 | `memory_item_history` | 条目版本历史（APPEND-only） | 真相 | 现表扩列；旧版本照搬 |
| 6 | `mentions` | canonical/原文中的实体提及（指代消解产物） | 派生 | 由 canonical 抽取生成，可重建 |
| 7 | `memory_entities` | 条目↔实体（多对多，角色） | 真相（轻） | 回填自 `refs`/scope |
| 8 | `entity_facts` | 事实槽位当前态（`factKey` → active memory） | 派生 | 由 `memories` 重建 |
| 9 | `attribution` | 观点/立场归属（谁认为/谁背书/谁反对） | 真相 | 新表；从旧条目 `authority/source` 回填主归属 |
| 10 | `conflicts` | 冲突记录（disputed 成对 + 询问状态） | 真相 | 从 `memory_conflicts` 迁移 |
| 11 | `canonical_units` | canonical 改写结果（唯一处理入口） | 真相 | 新表；历史消息后台回填 |
| 12 | `raw_messages` | 用户/智能体消息原文（不可变） | 真相 | 从 chat `messages` 复制（单向） |
| 13 | `raw_events` | 工具/任务/系统事件原文（不可变） | 真相 | 新表；由事件总线落库 |
| 14 | `agent_memory` | 智能体通用记忆的来源/写域/提炼记录 | 真相 | 新表；W4 提炼时写 |
| 15 | `pyramid_views` | 金字塔视角定义（多视角） | 配置 | 新表（预置 5 个视角） |
| 16 | `pyramid_nodes` | L0–L4 压缩节点 | 派生 | 后台构建/重建 |
| 17 | `pyramid_sources` | 压缩节点→源（条目/节点） | 派生 | 与节点同事务写；失效传播索引 |
| 18 | `memory_candidates` | 候选（唯一写入口的队列） | 真相（审计） | 现表扩列 |
| 19 | `maintenance_jobs` | 幂等后台任务（canonical 回填/金字塔重建/提炼） | 真相（轻） | 新表 |
| 20 | `memory_fts_v3` | 检索虚表（FTS5 trigram） | 派生 | 重建后替换 `memory_fts` |

**旧表处置**：`memory_items`（双写镜像 + 回滚读源）、`memory_conflicts`（迁移后只读一个版本）、`memory_fts`（切换后删除）——见 §7。
**新增"等"表说明**：`memory_entities`、`pyramid_sources`、`maintenance_jobs`、`raw_events` 是上面 20 张表里 lead 清单未点名但实现必需的支撑表。

### 3.2 字段级

#### 3.2.1 `entities`

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `id` | TEXT PK | `ent-<hex>`；稳定不可变 |
| `kind` | TEXT NOT NULL | `domain` / `project` / `conversation` / `task` / `agent` |
| `name` | TEXT NOT NULL | 显示名 |
| `canonical_name` | TEXT NOT NULL | 规范名（别名归一目标；同名不同 kind 可并存） |
| `aliases_json` | TEXT DEFAULT `'[]'` | 别名数组（实体解析用） |
| `parent_id` | TEXT DEFAULT `''` | 仅 `conversation`（会话树）与 `domain`（域层级）使用；`project` 不用父子归属 |
| `owner_agent` | TEXT DEFAULT `''` | 负责人：`agent:<id>`（会话/任务必有；agent 实体填自身） |
| `attrs_json` | TEXT DEFAULT `'{}'` | 扩展：`agent` 放 `persona_id/persona_version/tools/model`；`project` 放映射说明 |
| `status` | TEXT NOT NULL DEFAULT `'active'` | `active` / `archived` / `merged`（被合并）/ `hidden` |
| `merged_into` | TEXT DEFAULT `''` | 合并目标实体 id（合并后旧实体保留，读时跳转） |
| `version` | INTEGER NOT NULL DEFAULT 1 | 实体变更版本 |
| `sensitivity` | TEXT NOT NULL DEFAULT `'normal'` | `normal` / `sensitive` |
| `created_at` / `updated_at` | INTEGER NOT NULL | |

#### 3.2.2 `entity_relations`

| 字段 | 类型 | 约束 |
|---|---|---|
| `id` | TEXT PK | `rel-<hex>` |
| `from_entity` / `to_entity` | TEXT NOT NULL | 两端 `entities.id`；禁止自环 |
| `rel_type` | TEXT NOT NULL | `parent_of` / `belongs_to` / `about` / `owned_by` / `mapped_to` / `produced` / `depends_on` / `references` / `supersedes` / `conflicts_with` |
| `attrs_json` | TEXT DEFAULT `'{}'` | 条件/权重等 |
| `source` | TEXT NOT NULL | `user` / `tool` / `inferred` / `migration` |
| `confidence` | REAL NOT NULL DEFAULT 0.5 | 0–1；推断关系默认 ≤0.7 |
| `valid_from` / `valid_to` | INTEGER NOT NULL | 双时态；`valid_to=0` 表示仍有效 |
| `created_at` | INTEGER NOT NULL | |

约束：`UNIQUE(from_entity,to_entity,rel_type,valid_from)`；`parent_of` 写入前防环（depth ≤32）。

#### 3.2.3 `entity_edges`（派生邻接）

| 字段 | 说明 |
|---|---|
| `from_entity` / `to_entity` / `rel_type` | 三元组 PK |
| `weight` | REAL；由关系 confidence + 记忆命中次数聚合 |
| `updated_at` | 重建时间 |

用途：检索时实体邻域 1–2 跳快速召回；可由 `entity_relations` + `memory_entities` 全量重建（`maintenance_jobs.kind=rebuild_edges`）。

#### 3.2.4 `memories`（v0.3 主表）

| 字段 | 类型 | 约束/说明 |
|---|---|---|
| `id` | TEXT PK | 复用旧 `memory_items.id`（迁移后 id 不变，引用不断） |
| `type` | TEXT NOT NULL | `scene` / `semantic` / `norm` / `procedural` / `working` |
| `sub_type` | TEXT NOT NULL DEFAULT `''` | 见 §3.4 枚举 |
| `owner_agent` | TEXT NOT NULL | **写域**：`agent:<id>`；team 级由 `agent:simo` 持有 |
| `assertion` | TEXT NOT NULL DEFAULT `'fact'` | `fact` / `opinion` / `instruction` |
| `attributed_to` | TEXT NOT NULL DEFAULT `''` | 观点/判断归属实体（`agent:`/`user:`/`external:`）；`opinion` 时非空 |
| `fact_key` | TEXT NOT NULL DEFAULT `''` | 语义事实槽位（§5.1）；非 semantic 为空 |
| `content` | TEXT NOT NULL | **canonical 文本**（≤2000 字符，沿用 M3 限制；截断在抽取侧做） |
| `canonical_refs_json` | TEXT NOT NULL DEFAULT `'[]'` | `canonical_units.id` 数组（新写入必须 ≥1；迁移旧条目可空 + `canonical_missing=1`） |
| `raw_refs_json` | TEXT DEFAULT `'[]'` | 冗余回指 raw（加速溯源） |
| `source` | TEXT NOT NULL | `user` / `conversation` / `tool` / `inferred` |
| `authority` | TEXT NOT NULL | `user_confirmed` / `system_verified` / `inferred` |
| `confidence` | REAL NOT NULL | 0–1；按来源上限钳制（沿用 M3/design/22 §3.6） |
| `status` | TEXT NOT NULL | `active` / `disputed` / `superseded` / `retracted` / `archived` |
| `version` | INTEGER NOT NULL DEFAULT 1 | 条目版本（同 id 递增） |
| `layer` | INTEGER NOT NULL DEFAULT 0 | 金字塔层级 0–4（§5.4） |
| `importance` | INTEGER NOT NULL DEFAULT 5 | 0–10 |
| `strength` | INTEGER NOT NULL DEFAULT 0 | 使用强度（+1/次有效读取，上限 50 归一化） |
| `last_used_at` | INTEGER NOT NULL DEFAULT 0 | |
| `valid_from` | INTEGER NOT NULL | 世界时间起点；默认 = 写入时刻 |
| `valid_until` | INTEGER NOT NULL DEFAULT 0 | 0 = 仍有效；失效不删 |
| `sensitivity` | TEXT NOT NULL DEFAULT `'normal'` | `sensitive` 不跨智能体、可进本地索引（design/22 Q4） |
| `canonicalizer_version` | TEXT NOT NULL DEFAULT `''` | 生成时 canonical 版本 |
| `content_hash` | TEXT NOT NULL DEFAULT `''` | canonical 内容哈希（防篡改/错配） |
| `canonical_missing` | INTEGER NOT NULL DEFAULT 0 | 迁移兼容标记；=1 时不计入"新写入"统计，回填后置 0 |
| `legacy_kind` / `legacy_scope` | TEXT DEFAULT `''` | 双写期投影（API 兼容）；v0.4 清理 |
| `conflict_with_json` | TEXT DEFAULT `'[]'` | 冲突条目 id（双向） |
| `created_at` / `updated_at` | INTEGER NOT NULL | |

约束（代码 + 测试强制，能进 CHECK 的进 CHECK）：
- `CHECK (assertion <> 'opinion' OR attributed_to <> '')`；
- `CHECK (confidence >= 0 AND confidence <= 1)`；
- **部分唯一索引**：`UNIQUE(fact_key) WHERE type='semantic' AND status='active' AND fact_key<>''`（§5.1）；
- `type='semantic' AND sub_type='fact'` ⇒ `fact_key<>''`（抽取侧保证）；
- `owner_agent` 必须指向存在的 `entities(kind='agent')`；
- `content` 对 `retracted` 条目允许清空（标记删除语义，见 §7）。

#### 3.2.5 `memory_item_history`（扩列）

现有列保留（`history_id,item_id,kind,scope,content,source,authority,confidence,status,version,refs,created_at,updated_at`），**追加**：`type, sub_type, owner_agent, assertion, attributed_to, fact_key, canonical_refs_json, raw_refs_json, layer, valid_from, valid_until, sensitivity, content_hash`。每次主表行**在被更新前**先写一条 history（同事务），保证"旧版本永远可查"。

#### 3.2.6 `mentions`（派生）

| 字段 | 说明 |
|---|---|
| `id` | `mn-<hex>` PK |
| `canonical_id` | `canonical_units.id` |
| `raw_id` | 可空；直接来自 raw 的提及（未经 canonical）不写（canonical 唯一入口） |
| `entity_id` | 解析到的实体；未解析为 `''` |
| `mention_text` | 原文中的表面形式 |
| `start_offset` / `end_offset` | 在 `canonical_text` 中的位置 |
| `role` | `subject` / `object` / `other` / `unresolved` |
| `resolved` | 0/1 |
| `confidence` | REAL |
| `created_at` | INTEGER |

可重建（由 canonical 重新抽取）；用于实体解析、关系构建与溯源。

#### 3.2.7 `memory_entities`（条目↔实体）

`memory_id TEXT`、`entity_id TEXT`、`role TEXT`（`primary` / `related` / `about`）、`source TEXT`（`canonical` / `rule` / `migration`）；PK `(memory_id, entity_id, role)`。索引 `entity_id`。

#### 3.2.8 `entity_facts`（事实槽位，派生）

| 字段 | 说明 |
|---|---|
| `fact_key` | TEXT PK（§5.1 归一化结果） |
| `subject_entity` | TEXT NOT NULL（实体 id） |
| `predicate` | TEXT NOT NULL（受控词表） |
| `qualifier_json` | TEXT DEFAULT `'{}'`（条件/范围/环境） |
| `active_memory_id` | TEXT NOT NULL DEFAULT `''`（当前 active 事实；冲突时为原 active） |
| `active_since` | INTEGER NOT NULL DEFAULT 0 |
| `disputed_memory_ids_json` | TEXT DEFAULT `'[]'`（处于 disputed 的候选事实） |
| `updated_at` | INTEGER NOT NULL |

可重建（`maintenance_jobs.kind=rebuild_facts`）；读取以 `memories` 为准，此表用于"同一事实槽位"的快速定位与时间线（§6.1 timeline API）。

#### 3.2.9 `attribution`（观点归属）

| 字段 | 说明 |
|---|---|
| `id` | `atr-<hex>` PK |
| `memory_id` | TEXT NOT NULL（观点条目） |
| `attributed_to` | TEXT NOT NULL（`agent:<id>` / `user:<id>` / `external:<name>`） |
| `stance` | `assert` / `endorse` / `dispute` |
| `confidence` | REAL |
| `source_ref` | `canonical:<id>` 或 `raw:<id>`（该立场从哪来） |
| `created_at` | INTEGER |

规则：`memories.assertion='opinion'` 必须至少有 1 条 `attribution(stance='assert')`；`memories.attributed_to` 是主归属（冗余，快速展示）。同一话题多观点并存，不产生 conflict（§5.3）。

#### 3.2.10 `conflicts`（扩列迁移自 `memory_conflicts`）

| 字段 | 说明 |
|---|---|
| `id` | TEXT PK |
| `item_a` / `item_b` | TEXT NOT NULL（双方 memory id；A=先进/active 一方，B=新断言） |
| `type` | `fact_contradiction` / `norm_conflict` / `scene_divergence` |
| `severity` | `low` / `medium` / `high`（默认 medium；红线/高风险主题→high） |
| `status` | `open` / `asking` / `deferred` / `resolved` |
| `ask_policy` | `ask_now` / `defer`（写入时判定，§5.3） |
| `ask_count` | INTEGER DEFAULT 0（同一冲突最多问 1 次） |
| `last_asked_at` | INTEGER DEFAULT 0 |
| `resolved_by` | `user` / `agent` / `policy` / `''` |
| `resolution_json` | `{chosen:itemId|"neither", note, resolvedAt}` |
| `reason` / `scope` / `kind` | 兼容旧列（迁移保留，API 投影） |
| `created_at` / `updated_at` | INTEGER |

#### 3.2.11 `canonical_units`（canonical）

| 字段 | 说明 |
|---|---|
| `id` | `can-<hex>` PK |
| `canonical_key` | TEXT NOT NULL **UNIQUE**（幂等键：§4.2） |
| `raw_refs_json` | TEXT NOT NULL（`raw_messages/raw_events` 的 id 数组，≥1） |
| `conversation_entity_id` | TEXT NOT NULL |
| `turn_id` | TEXT DEFAULT `''`（同一轮多条消息可合并成一段 canonical） |
| `actor` | `user` / `agent:<id>` / `tool` |
| `intent` | `statement` / `question` / `instruction` / `preference` / `correction` / `smalltalk` / `task` |
| `canonical_text` | TEXT NOT NULL |
| `frame_json` | TEXT DEFAULT `'{}'`：`entities[]`、`relations[]`、`modality`、`polarity`、`time`、`conditions`、`speaker` |
| `ops_json` | TEXT DEFAULT `'[]'`：`[{op:"resolve",from:"它",to:"ent-…"},{op:"normalize",...}]` |
| `canonicalizer_version` | TEXT NOT NULL |
| `model` | TEXT DEFAULT `''`（可替换算力的记录） |
| `status` | `ok` / `unresolved` / `failed` / `superseded`（重建后旧版本标 superseded） |
| `content_hash` | TEXT NOT NULL |
| `created_at` | INTEGER NOT NULL |

#### 3.2.12 `raw_messages`（不可变）

| 字段 | 说明 |
|---|---|
| `id` | TEXT PK（= chat `messages.id`，`msg-…`） |
| `conversation_entity_id` | TEXT NOT NULL |
| `sender_kind` | `user` / `agent` / `tool` |
| `sender_id` | TEXT DEFAULT `''`（agent id / tool name） |
| `content` | TEXT NOT NULL（原文，不归一化；合规标记删除后被替换为墓碑文本） |
| `attachments_json` | TEXT DEFAULT `'[]'` |
| `content_hash` | TEXT NOT NULL（写入时计算，之后不变） |
| `canonical_state` | `pending` / `ok` / `unresolved` / `failed` / `skipped`（管道进度，**派生**） |
| `redacted` | INTEGER DEFAULT 0（合规标记删除标记，§9） |
| `created_at` | INTEGER NOT NULL |

**不可变规则**：正常路径只 `INSERT`；唯一的 `UPDATE` 是合规标记删除（`redacted=1`、`content='[redacted]'`），且必须由 `compliance_redactions` 审计行 + 审批触发（§9/§12-Q5）。chat 自己的 `messages` 表不变，raw 是它的单向只读副本。

#### 3.2.13 `raw_events`（不可变）

`id TEXT PK`（`ev-…`，事件日志 id）、`conversation_entity_id`、`task_id`、`kind`（`tool_call`/`tool_result`/`approval`/`task_event`/`system`）、`payload_json`、`content_hash`、`created_at`。只 INSERT。

#### 3.2.14 `agent_memory`（智能体通用记忆）

| 字段 | 说明 |
|---|---|
| `id` | `agm-<hex>` PK |
| `agent_id` | TEXT NOT NULL（`agent:<id>` 实体） |
| `memory_id` | TEXT NOT NULL（`memories.id`，该条已写入 agent 写域） |
| `source_conversation_ids_json` | TEXT NOT NULL（≥1：从哪些会话提炼） |
| `source_canonical_ids_json` | TEXT NOT NULL（≥1：哪几段 canonical） |
| `trigger` | `session_archive` / `daily_review` / `task_done` |
| `status` | `candidate` / `active` / `rejected` |
| `distilled_at` | INTEGER NOT NULL |
| `created_at` | INTEGER NOT NULL |

约束：`UNIQUE(agent_id, memory_id)`（同一条通用记忆可被多次提炼强化，但只有一行来源档案，重复时追加 sources 并 bump）；`memory.owner_agent == agent_id`（写域校验）。

#### 3.2.15 `pyramid_views` / `pyramid_nodes` / `pyramid_sources`

**pyramid_views**：`id`（`pv-<id>`，如 `pv-what_happened`）、`name`、`entity_kind`（domain/project/conversation/task/all）、`filter_json`、`perspective`（`what_happened`/`what_is`/`what_should`/`how_to`/`current_state`）、`config_version`、`created_at`。预置 5 个视角（design/24 §5.5）。

**pyramid_nodes**：`id`（`py-<hex>`）、`entity_id`、`level` INTEGER（0–4）、`view_id`、`kind`（`summary`/`cluster`/`abstract`）、`text`、`coverage` REAL（0–1）、`status`（`active`/`stale`/`archived`）、`version` INTEGER、`source_count` INTEGER、`built_by`（job id）、`built_at`、`invalid_at` INTEGER DEFAULT 0、`config_version`。

**pyramid_sources**：`node_id`、`source_kind`（`memory`/`node`）、`source_id`、`source_version`；PK `(node_id,source_kind,source_id)`；索引 `(source_kind,source_id)`（失效传播按源反查）。

#### 3.2.16 `memory_candidates`（扩列）

现有列保留（`id,op,kind,scope,content,source,authority,confidence,refs,base_version,status,item_id,conflict_id,created_at`），**追加**：`candidate_key`（UNIQUE，幂等）、`type`、`sub_type`、`owner_agent`、`assertion`、`attributed_to`、`fact_key`、`canonical_refs_json`、`entity_refs_json`、`instance_id`、`reason`（拒收原因）、`decided_at`。

#### 3.2.17 `maintenance_jobs`

`id TEXT PK`、`kind`（`canonical_backfill`/`rebuild_fts`/`rebuild_edges`/`rebuild_facts`/`rebuild_pyramid`/`distill_agent_memory`）、`job_key TEXT UNIQUE`（幂等：kind+参数哈希）、`status`（`pending`/`running`/`done`/`failed`）、`payload_json`、`attempts` INTEGER、`last_error`、`created_at`、`updated_at`。

### 3.3 索引与约束（汇总）

| 索引 | 用途 |
|---|---|
| `entities(kind,status)`、`entities(canonical_name)`、`entities(owner_agent)` | 列实体/解析 |
| `entity_relations(from_entity,rel_type)`、`(to_entity,rel_type)` | 双向邻域 |
| `entity_edges(from_entity,rel_type)`、`(to_entity,rel_type)` | 召回 |
| `memories(owner_agent,type,status)`、`(type,status)`、`(layer)`、`(valid_until)`、`(updated_at)` | 列表/过滤 |
| **部分唯一** `memories(fact_key) WHERE type='semantic' AND status='active' AND fact_key<>''` | **事实唯一** |
| `memory_entities(entity_id)`、`(memory_id)` | 实体↔记忆 |
| `mentions(canonical_id)`、`(entity_id)`、`(resolved)` | 实体解析/溯源 |
| `entity_facts(subject_entity)` | 事实时间线 |
| `attribution(memory_id)`、`(attributed_to)` | 观点归属查询 |
| `conflicts(status,severity)`、`(item_a)`、`(item_b)` | 冲突页/询问 |
| `canonical_units(canonical_key)` UNIQUE、`(conversation_entity_id,created_at)`、`(status)` | 幂等/回填 |
| `raw_messages(conversation_entity_id,created_at)`、`(canonical_state)` | 管道进度 |
| `agent_memory(agent_id)`、`(memory_id)` | 智能体记忆 |
| `pyramid_nodes(entity_id,level,status)`、`(view_id,status)` | 金字塔读取 |
| `pyramid_sources(source_kind,source_id)` | **失效传播** |
| FTS：`memory_fts_v3(item_id UNINDEXED, content, tokenize='trigram')` + 主库过滤（沿用 trigram + `<3 字` LIKE 兜底） | 检索 |

### 3.4 枚举（实现常量，契约锁定）

- `type`：`scene|semantic|norm|procedural|working`
- `sub_type`：`experience|incident|case`（scene）、`fact|concept|entity_attr`（semantic）、`goal|constraint|decision|rule|preference`（norm）、`sop|playbook|tool_usage|heuristic`（procedural）、`state|todo|blocked|open_question`（working）、`''`（未细分）
- `assertion`：`fact|opinion|instruction`；`status`（memory）：`active|disputed|superseded|retracted|archived`
- `authority`：`user_confirmed|system_verified|inferred`；`source`：`user|conversation|tool|inferred`
- `rel_type`：见 §3.2.2；`conflicts.type/status/ask_policy`：见 §3.2.10
- `mentions.role`：`subject|object|other|unresolved`；`pyramid.perspective`：见 §3.2.15
- `layer`：`0` 原始/工作、`1` 会话、`2` 任务/项目、`3` 领域、`4` 全局

---

## 4. 写入管道

### 4.1 W0：raw 落库（同步、不可变）

- 触发：消息事件（user/agent 消息）、工具事件、任务/审批事件。
- 动作：`INSERT` `raw_messages`/`raw_events`（按 id 幂等：已存在则跳过）；`canonical_state='pending'`。
- 约束：不阻塞对话回复（写入失败 fail-soft：记 `memory.raw_write_failed` 事件 + 指标，不重试到爆）。
- raw 与 chat `messages` 的关系：**单向复制**；chat 仍是聊天记录真相，raw 只作证据。迁移时从 `messages` 回填（§7）。

### 4.2 canonical 化（异步、唯一入口、幂等）

**幂等键**：`canonical_key = sha256(sorted(raw_ids) + canonicalizer_version + prompt_set_version + schema_version)`；`canonical_units.canonical_key UNIQUE`，重复处理直接返回既有 unit。

**步骤**（与 design/24 §7.2 对齐）：
1. 取待处理 raw（`canonical_state='pending'`，批量 ≤50/批，按 created_at 升序）。
2. 分段：按轮次/语义段（同一 turn 多条消息可合并；`raw_refs_json` 保留全部来源）。
3. 意图识别 → `intent`；4. 指代消解 → `ops.resolve`；高置信才改，低置信保留原词（`status='unresolved'` 或 `ok` + 原词 + `unresolved_mentions` 标记）。
4. 归一化：相对时间→绝对+时区；别名→规范名（写 `ops.normalize`）；保留否定/条件/情态。
5. 生成 `frame_json`（实体/关系/情态/否定/时间/条件/说话人）。
6. **忠实性校验**：不得引入 raw 没有的主张；失败 → `status='failed'`（不写记忆，不静默丢）。
7. `INSERT` `canonical_units`；抽取 `mentions`（实体 id 解析走 §6.1 实体解析器，低置信 `resolved=0`）。
8. `UPDATE raw_messages.canonical_state`（ok/unresolved/failed）；`failed` 重试 ≤3 次后停、记指标、进"待人工/后台重放"（不阻塞主链路）。

**硬规则**：
- 对话回复**不等** canonical 化（异步）；但**写入记忆必须等 canonical 就绪**——候选的 `canonical_refs_json` 非空且 `canonical_units.status='ok'` 才允许合并。
- 历史消息回填（迁移）：`maintenance_jobs.kind=canonical_backfill`，幂等、分批、可暂停；回填前旧记忆 `canonical_missing=1`（只读兼容，不进入"新写入"统计）。
- 二次污染防线：canonical 只重述/消解/归一，不总结；抽取必须能回指 canonical 原句（`mentions.start/end` 或 `canonical_refs` + 摘录）。

### 4.3 抽取与候选（对象契约）

候选字段（`memory_candidates`，与 `core/memory.Candidate` 兼容扩展）：

| 字段 | 必填 | 说明 |
|---|---|---|
| `candidate_key` | ✓ | 幂等键（§4.5） |
| `op` | ✓ | `add` / `update` / `retract` / `dispute` / `attribution` |
| `type` / `sub_type` | ✓ | 五类型/子类型 |
| `owner_agent` | ✓ | 写域（写入校验：== 当前智能体，或司墨写 team） |
| `assertion` / `attributed_to` | opinion 时 ✓ | 观点必须带归属 |
| `fact_key` | semantic/fact 时 ✓ | 抽取器计算；缺失拒收 |
| `content` | ✓ | canonical 文本（≤2000 字符） |
| `canonical_refs_json` | ✓（迁移旧条目除外） | ≥1 且状态 ok |
| `entity_refs_json` | ✓（≥1） | 主实体 + 关联实体（带 role） |
| `source` / `authority` / `confidence` | ✓ | 来源等级 + 置信上限钳制 |
| `importance` | | 0–10，抽取器打分（缺省按类型：norm 8、semantic 6、scene 5、procedural 6、working 3） |
| `refs_json` | | session/task/spec/artifact 引用 |
| `base_version` | | 目标条目版本（update/retract 时；用于 stale 检测） |
| `instance_id` | | 产生候选的实例（审计） |

**置信度上限**（沿用 design/22 §3.6）：`user_confirmed=1.0`、`system_verified≤0.99`、`inferred≤0.7`、`experience 总结≤0.6`；超限由单写者钳制并回执。

### 4.4 单写者合并（唯一真相写入）

`Submit(candidate)` 在一个 SQLite 事务内（单 goroutine 串行）：

1. **校验**：schema/长度/枚举；`owner_agent` 写域；`canonical_refs` 就绪；`fact_key`（semantic/fact）；`entity_refs` 存在；`sensitivity` 不越域；`base_version`（update/retract）；去重键幂等。
2. **定位**：按 `op`+`target_id` 或 `(entity_refs[0], type, fact_key/dedupe)` 找目标。
3. **分类**（§5）：
   - `add` semantic/fact → 同 `fact_key`：
     - 无 active → 新建 active；
     - 有 active 且值一致 → **合并来源**（合并 `canonical_refs/raw_refs`、`strength++`、`updated_at`；不升版本，回执 `merged`）；
     - 有 active 且值不一致 → 新建 `status='disputed'` + `conflicts(type=fact_contradiction)` + `entity_facts.disputed_memory_ids_json` 追加（回执 `disputed`）。
   - `add` norm 冲突 → 新条目 `disputed`，**既有条目也置 `disputed`**（两条都保留、成对标记；避免两条"都 active"导致行为歧义），`conflicts(type=norm_conflict)`。
   - `add` opinion → 新建 `assertion='opinion'` + `attribution(stance='assert')`；不产生 conflict。
   - `update`（用户"改成"）→ 校验 `base_version`；旧版本 history 快照、`valid_until=now`、`status='superseded'`；新版本同 id `version+1` active；`supersedes` 关系；更新 `entity_facts.active_memory_id`。
   - `retract`（忘掉）→ `status='retracted'`、`content` 墓碑化、保留 id/hash/refs；若有 conflict → 相应关闭。
   - `dispute`（人工/后台标记矛盾）→ 双方 disputed + conflict。
   - `attribution` → 追加/更新归属行（不改内容）。
4. **写**：`memories` upsert（先 history 快照）→ `memory_entities` → `attribution` → `entity_facts` → `conflicts` → `memory_fts_v3`（同事务；`retracted` 移除索引行；`disputed` 保留索引但读时过滤）→ **双写 legacy `memory_items`**（双写期，§7.3）→ `memory_candidates` 回执（merged/rejected/disputed/deferred + reason）→ `emit memory.merged / memory.disputed`。
5. **回执**：`{outcome, memory_id, version, conflictId?, reason?}`；**绝不静默丢弃**（沿用 M3 纪律）。

**并发**：单写者串行 + 事务；候选可并发提交，串行合并；`base_version` 过期（目标版本已变）→ 拒收 `stale_base`（调用方可重读后重试一次；事实冲突不依赖 base_version，按语义判）。

### 4.5 幂等与来源引用

| 对象 | 幂等键 | 行为 |
|---|---|---|
| raw | 源 id（message id / event id） | 已存在跳过（不重复 raw） |
| canonical | `canonical_key` UNIQUE | 重复处理返回既有 unit |
| 候选 | `candidate_key = sha256(op + type + owner_agent + canonical_refs + fact_key + content_hash)` | 重复提交返回原回执，不产生重复版本 |
| 提炼（W4） | `agent_memory.job_key = sha256(agent_id + conversation_ids + trigger + date)`（放 `maintenance_jobs`） | 同一会话同一天只提炼一次 |
| 金字塔 | `job_key = sha256(entity + level + view + config_version + source_versions_hash)` | 同源同配置不重复构建 |

**三向溯源**：`memories.canonical_refs_json → canonical_units.raw_refs_json → raw_messages/raw_events`（正向）；反向查询：`raw → canonical → memories` 与 `mentions/attribution` 的 source 指针。审计要求：任一记忆条目能回答"哪条原文、哪次改写、哪个实例/模型、哪次合并"。

### 4.6 写触发点（W0–W5）与频率

| # | 触发 | 写什么 | 前置/频率 |
|---|---|---|---|
| W0 | 每条消息/工具/任务事件 | raw + canonical 管道 | 同步 raw；canonical 异步（批量 ≤50） |
| W1 | Task done（双裁决后，M18/M19） | scene/procedural/working 收尾 | 沿用 M3 事件；同实例同任务候选批次 ≤3 |
| W2 | Spec verified（`canArchive==true`，M18） | norm/semantic 结论 | 硬前置；不通过不写 |
| W3 | 用户"记住/改成/忘掉"（chat 现有解析） | norm/semantic/working | 用户权威最高，仍走候选与冲突检测 |
| W4 | 会话归档 / 每日复盘（M19 调度） | 智能体通用记忆（`agent_memory` + memories） | 只从自己负责的会话；每天每会话 ≤1 次 |
| W5 | 后台维护 | 金字塔构建/重建、实体合并、索引重建、canonical 回填 | `maintenance_jobs` 幂等；低频 |

---

## 5. 语义规则（实现判定）

### 5.1 事实唯一（factKey + 部分唯一索引）

**factKey 定义**：`factKey = norm(subject_entity_id) + "|" + norm(predicate) + "|" + norm(qualifier_json)`。

- `subject_entity_id`：实体 id（不是显示名；先解析别名）。
- `predicate`：**受控词表**（V1 初始 12 个：`is_a`、`has_property`、`value_of`、`depends_on`、`owned_by`、`located_at`、`used_by`、`part_of`、`version_of`、`status_of`、`schedule_of`、`contact_of`；映射不了 → 不生成 fact，转 `working/open_question` 候选，**不硬猜**）。
- `qualifier_json`：`{env, scope, time, region, ...}` 归一化键序（JSON 规范化后哈希）。
- `norm`：小写、去空白、NFC、中文全半角归一。

**唯一性约束**：
- 部分唯一索引（§3.3）：同一 `fact_key` 只允许一个 `active` 语义事实。
- 冲突断言：新条目以 `status='disputed'` 入库（不违反唯一索引），旧 active 不动，`conflicts(type=fact_contradiction)` 成对，`entity_facts.disputed_memory_ids_json` 追加。
- **禁止按来源层级自动覆盖**（design/24 Q3 已定）：不允许"系统验证自动替换推断"；权威只用于展示与排序，不用于改写真相。
- 同一事实的演进（值变了且旧值失效）：`update` 路径（用户确认/系统验证 + 目标条目）→ 旧值 `valid_until` 闭合 + `superseded`，新值 active（这是"演进"不是"冲突"；判据：是否显式失效旧值）。

**entity_facts**：写入/修复时由单写者同步维护；`active_memory_id` 指向 active；`disputed_memory_ids_json` 列 disputed 候选；可 `rebuild_facts` 全量重建。

### 5.2 观点归属（attribution）

- `assertion='opinion'`：`attributed_to` 必填 + `attribution` 至少一条 `stance='assert'`。
- 多观点并存：同话题/同实体不同归属，**不产生 conflict**；检索时按归属分组展示（"司墨认为…"/"用户认为…"），他者观点必须打标（§6.4）。
- 观点升级：用户采纳 → 新 `norm/decision`（`attributed_to=user`，`source=user`），观点保留为来源；被验证 → `semantic/fact`（需 `system_verified` 证据），观点保留。
- 无归属的模型输出不能入记忆：只能作为 `inferred` 候选，抽取侧拒收（`reason='missing_attribution'`）。

### 5.3 冲突（disputed 保留）

**类型判定**：

| 情形 | type | 处理 |
|---|---|---|
| 同 `fact_key` 不同值 | `fact_contradiction` | 旧 active + 新 disputed + conflict；询问/延迟 |
| 同槽位规范互斥 | `norm_conflict` | 双方 disputed + conflict；询问/延迟 |
| 同场景结论不一致 | `scene_divergence` | 保留两条，标"结论不一致"，交整理者/用户 |
| 同话题不同观点 | （不算冲突） | 按 attribution 并存，不建 conflict |

**状态机**：`open → asking → (resolved | deferred)`；`deferred → asking`（时机到达）；`resolved` 终态（新 event）。`ask_policy` 判定：影响当前决策/高风险主题 → `ask_now`；否则 `defer`。

**询问纪律**：同一 conflict `ask_count` 上限 1（`ask_count>=1` 且未答 → 保持 deferred，不重复问）；用户回答 → 生成 `norm/decision`（`attributed_to=user`）→ 被否决方 `valid_until` 闭合/`superseded` → conflict `resolved`（历史全留）。**不阻塞**：冲突不影响其他记忆与对话；检索到冲突条目成对带出 + 横幅。

### 5.4 金字塔 L0–L4

**层级**：L0 原始/工作（raw/working）、L1 会话、L2 任务/项目、L3 领域、L4 全局；条目 `layer` 标记（§3.4）。

**生成**（`maintenance_jobs.kind=rebuild_pyramid` 或事件触发）：
- 触发：会话归档、任务完成、实体下条目数超阈值（默认 200）、定时（默认每日低峰）、手动重建。
- 输入：实体子条目（带 `id@version`）+ 子节点；输出：`pyramid_nodes`（level+1、view、text、coverage）+ `pyramid_sources`。
- 硬规则（design/24 §5.3）：**只压缩不新增**（忠实性校验）；必保留约束/否定/数字/日期/风险/未完成项；摘要每句可回指源（cite）；`coverage<0.8` 不生成（或标 `partial`）；源条目保留不删。

**失效传播**：源条目/节点版本变更 → 反查 `pyramid_sources(source_kind,source_id)` 命中的节点 → `status='stale'`、`invalid_at=now` → 向上传播（节点依赖节点）→ 异步重建（同 `job_key` 幂等）。读路径默认不返回 stale（`includeStale=true` 或 `asOf` 历史查询除外）。

**重建**：从当前源重新压缩，不依赖旧压缩结果；模型/提示词/配置版本化（`config_version`、`canonicalizer_version`）；全量重建仅在配置升级时做；失败 → 保留旧 active 节点并标告警（不静默删）。

**多视角**：5 个预置视角（`what_happened`/`what_is`/`what_should`/`how_to`/`current_state`），视角是过滤+组织参数，不改数据。

### 5.5 智能体通用记忆

- **写域**：`memories.owner_agent = agent:<id>`；只允许该 agent 写（司墨写 team；专家写自身域）；跨域写拒绝 `policy_denied`。
- **来源**：`agent_memory` 记录 `source_conversation_ids_json` + `source_canonical_ids_json`（≥1，强制）；无来源的提炼拒收。
- **触发**：会话归档事件 + 每日复盘（默认，可配；Q5=A）；同会话同天 ≤1 次。
- **门槛**：经验类先 `scene`；同 `signature` 攒 ≥3 个**独立会话**才提升为 `procedural/norm`（沿用 design/22 Q6 默认）；提升走候选 + 单写者。
- **敏感**：来源会话中 `sensitivity=sensitive` 的内容不得进入通用记忆（抽取侧过滤，写域校验二次拦截）。
- **读**：跨智能体只读（默认）；`sensitivity=sensitive` 不跨域（Q4 已定）；API 见 §6.1。
- **人格隔离校验点**（三处）：① 提炼时 `agent_id` 必须是来源会话负责人；② 召回时他者内容打 `[agent:<id> 的观点]` 标；③ 写时 `owner_agent` 校验。

---

## 6. API 与查询接口

### 6.1 只读 API（全部 R0，无副作用）

> 沿用 M3 的"无写/编辑接口"纪律：`POST/PUT/PATCH/DELETE /api/memory*` 一律 404 JSON（不返回 `ok:true`）。前端记忆页**只读**（design/24、design-core §6）。

| 方法 | 路径 | 参数 | 返回 |
|---|---|---|---|
| GET | `/api/memory` | `q`（兼容旧入口） | 同 items 检索（旧形状保留） |
| GET | `/api/memory/items` | `q`、`type`、`subType`、`entityId`、`layer`、`status`（默认 active；`all` 内部页用）、`asOf`、`includeDisputed`、`limit`（默认 20，≤100）、`offset`、`sort`（`time|score|layer`） | `{ok, items[], total, query, budgetReport?}` |
| GET | `/api/memory/items/{id}` | — | `{ok, item, history[], canonicalRefs[], attribution[], conflicts[]}`（单条 + 溯源；供 `memory.get` 动作） |
| GET | `/api/memory/entities` | `kind`、`q`、`ownerAgent`、`limit/offset`、`includeArchived` | `{ok, entities[], total}` |
| GET | `/api/memory/entities/{id}` | — | `{ok, entity, relations[], memoryCounts{byType}, recent[]}` |
| GET | `/api/memory/graph` | `entityId`、`depth`（1–2，默认 1）、`relTypes`、`limitNodes`（默认 50） | `{ok, nodes[], edges[]}`（越界返回空的节点集合，不 500） |
| GET | `/api/memory/entities/{id}/timeline` | `asOf`、`type`、`limit` | `{ok, facts[], events[]}`（实体事实槽位时间线，含失效区间） |
| GET | `/api/memory/pyramid` | `entityId`、`level`（0–4）、`view`（默认 `what_happened`）、`includeStale` | `{ok, view, nodes[]}` |
| GET | `/api/memory/canonical/{id}` | — | `{ok, canonical, rawRefs[], mentions[]}`（溯源/审计；sensitive 按 §6.4） |
| GET | `/api/memory/conflicts` | `status`（默认未决）、`limit/offset` | `{ok, conflicts[], total}`（旧形状字段保留：`scope/kind/reason`） |
| GET | `/api/memory/agents` | — | `{ok, agents[{id,name,personaVersion,memoryCount}]}` |
| GET | `/api/memory/agents/{id}/memory` | `type`、`q`、`limit/offset` | `{ok, items[]}`（跨智能体只读，§6.4） |
| GET | `/api/memory/scopes` | — | 兼容旧接口，返回等价视图（`scope` → 实体聚合计数） |

**响应字段（items[]）**：保留 M3 旧字段（`id/kind/scope/content/source/authority/confidence/status/version/refs/createdAt/updatedAt/conflictsWith`），并增：`type/subType/ownerAgent/assertion/attributedTo/layer/validFrom/validUntil/entityRefs/attribution/canonicalRefs/cite/score{relevance,importance,recency,strength,total}`。`kind`/`scope` 由 `type/sub_type` 与主实体投影生成（双写期兼容，前端不用改即可跑）。

### 6.2 内部写端口（Go interface，不暴露 HTTP）

`agentd/internal/core/memory` 采用**加法扩展**（chat/其它模块现有 `Search/Submit` 调用不变）：

| 方法 | 用途 | 约束 |
|---|---|---|
| `Submit(ctx, Candidate) (SubmitResult, error)` | 现有唯一写入口（扩 Candidate 字段） | 单写者；回执不静默 |
| `Canonicalize(ctx, rawIDs) ([]CanonicalUnit, error)` | 管道内部使用；仅 memory 模块调用 | 幂等；失败标记 |
| `Search(ctx, SearchRequest) (SearchResult, error)` | **chat 现有调用不变**；内部走 v0.3 多路召回 | 只读 |
| `SearchEntities(ctx, EntityQuery)` | 实体解析/实体列表 | 只读 |
| `Graph(ctx, entityID, depth)` | 实体邻域 | 只读，深度受限 |
| `Pyramid(ctx, entityID, level, view)` | 金字塔节点 | 只读，默认 active |
| `ListAgentMemory(ctx, agentID, filter)` | 智能体通用记忆 | 只读 |
| `Distill(ctx, agentID, conversationID, trigger)` | W4 提炼（后台任务） | 幂等（job_key）；候选→单写者 |
| `Rebuild(ctx, kind, payload)` | W5 维护任务 | 幂等；失败可重试 |

**禁止**：任何模块直接 `INSERT/UPDATE memories/...`（架构测试：`memory` 表只允许 memory 模块 SQL 出现）；`POST /api/memory/candidates` 等写端点**不存在**（404）。

### 6.3 错误码与分页

- 错误信封（沿用 M19/M20）：`{ok:false, error:{code, message, recovery?}}`；HTTP 状态按语义（404/400/409/403/429/500）。
- 错误码：`invalid_argument`（参数/分页越界）、`not_found`（实体/条目/金字塔不存在）、`conflict`（写域/版本冲突；仅内部端口）、`policy_denied`（跨域写/敏感越界）、`read_only`（归档会话）、`rate_limited`（内部维护队列满）、`degraded`（索引不可用降级已生效）、`internal`。
- 分页：`limit`（默认 20，最大 100）+ `offset`；`total` 返回；`sort` 稳定（同值按 `id` 升序）。
- 权限校验：所有 `/api/memory/*` 走本机请求（单用户）；`sensitivity=sensitive` 在 API 层再过一道（见 §6.4）。

### 6.4 可见性/权限矩阵

| 读方 | team 记忆 | agent:<id> 记忆 | 会话/任务实体记忆 | `sensitivity=sensitive` |
|---|---|---|---|---|
| 用户（本机 UI） | 全部 | 全部 | 全部 | 可见（个人助理场景；记忆页只读） |
| 司墨（主智能体） | 全部 | 全部只读 | 全部 | 可见（除显式 `private_to=user`） |
| 其他智能体 | 全部只读 | 全部只读 | 按实体可见性 | **不可见（不跨域）** |
| 写 | 仅司墨 | 仅该 agent | 该实体负责人 | 仅来源 agent + 用户 |

- 他者观点/记忆注入时打标 `[agent:<id> 的观点]` 并分区（design/24 §6.4）；人格/身份不随之复制。
- 归档会话：只读（沿用 M19）；其记忆不删除、不新写（写候选落到 global/domain 由单写者判定，见 M3 纪律）。

### 6.5 M20 动作层映射

| M20 动作 | 本契约落点 | 风险 |
|---|---|---|
| `memory.search` | §6.1 `/api/memory/items` | R0 |
| `memory.get` | `GET /api/memory/items/{id}`（新增，等价 items 过滤） | R0 |
| `memory.traverse` | §6.1 `/api/memory/graph` | R0 |
| `memory.conflicts` | §6.1 `/api/memory/conflicts` | R0 |
| `memory.entities` / `memory.pyramid` / `memory.agents` | 新增动作（同 §6.1） | R0 |

**不新增写动作**（候选/提炼/重建只由内部任务触发，不走动作层/CLI）。

### 6.6 事件（WS/事件总线）

写入/维护完成后 `emit`（幂等 id）：`memory.merged`（memoryId/version/outcome）、`memory.disputed`（conflictId/pair）、`memory.canonical.updated`、`memory.pyramid.rebuilt`（entityId/level）、`memory.agent.distilled`（agentId/conversationId）。前端记忆页用其刷新列表/冲突区；重连用现有 `since` 续接。**事件不携带原文/敏感内容**（只 id + 摘要级别）。

---

## 7. 迁移（v0.2 → v0.3）

### 7.1 前置与版本

- 模块：`memory` 迁移命名空间从 **v1 → v2**；升级在进程启动、开始服务前执行（单实例锁内），**失败不进入服务**。
- 备份：迁移前对 SQLite 主库做文件备份（或 `VACUUM INTO` 副本），记录 DB 路径 + 备份路径 + 行数快照。
- 开关（配置/环境）：`memory.v3.enabled`（默认 false，迁移+验收后才 true）、`memory.v3.read_from`（`memories|memory_items`，回滚用）、`memory.v3.legacy_shadow`（默认 true，双写期）。
- 数据规模估算（先测）：1 万条记忆 + 10 万条消息量级，迁移应 ≤60s（index 重建另计，后台）。

### 7.2 迁移步骤（v2，事务 + 分批）

| 步 | 动作 | 说明 |
|---|---|---|
| 1 | **建新表**：entities/entity_relations/entity_edges/memories/mentions/memory_entities/entity_facts/attribution/conflicts/canonical_units/raw_messages/raw_events/agent_memory/pyramid_views/pyramid_nodes/pyramid_sources/maintenance_jobs/memory_fts_v3 | 空表；`conflicts` 与旧 `memory_conflicts` 并存 |
| 2 | **扩列**：`memory_item_history`、`memory_candidates`；`memory_items` 加 legacy 投影列（`v3_type` 等，供双写/回滚） | 可空/带默认，旧读写不受影响 |
| 3 | **回填 entities** | `scope='global'`→`agent:simo`（team 写域）；`domain:X`→domain 实体；`task:ID`→task 实体 + `belongs_to` 会话（取 `tasks.session_id`）；`instance:*`→所属任务/会话；另建：根会话 `conversation:main`、所有 `sessions` 行、所有 `tasks` 行、`agent:simo` |
| 4 | **回填 relations** | `sessions.parent_id`→`parent_of`；`tasks.session_id`→`belongs_to`；`sessions.owner`→`owned_by`；`refs` 中的 session/task/spec→`references`/`about` |
| 5 | **回填 memories** | 从 `memory_items` 逐行：id 不变；`type/sub_type` 按 §3.2/映射表（fact→semantic/fact；decision→norm/decision；requirement→norm/goal；constraint→norm/constraint；preference→norm/preference；progress→working/state；experience→scene/experience；未知→semantic/fact + `authority=inferred`）；`owner_agent` 按 scope 映射；`fact_key` 离线计算（无法解析→空 + 报告）；`canonical_refs_json=[]` + `canonical_missing=1`；`layer` 按类型给默认 |
| 6 | **回填 attribution** | 旧语义无观点：迁移条目不补 attribution；仅把 `authority/source` 记为 provenance（不伪造归属） |
| 7 | **回填 entity_facts / memory_entities / conflicts** | 由 memories + scope/refs 重建；`memory_conflicts`→`conflicts`（补 type/severity/status，旧列保留） |
| 8 | **回填 raw_messages / canonical** | 从 chat `messages` 复制（批量 1000，单向）；`canonical_state='pending'`；历史 canonical 化交给后台 `maintenance_jobs(kind=canonical_backfill)`（分批、可暂停、幂等）；>20 万条消息时默认只回填最近 90 天 + 按需回填（§12-Q3） |
| 9 | **建 FTS + 索引** | `memory_fts_v3` 全量导入（memories active + disputed，retracted 不索引）；建全部索引；`entity_edges`/`entity_facts` 后台重建 |
| 10 | **校验 + 切换** | `count(memories)==count(memory_items)`（按 id 对齐）；无空 type；fact_key 覆盖率报告；抽样 100 条人工/规则核对；`memory.v3.enabled=true`，读路径切 `memories`；`memory_items` 继续双写 |

**事务边界**：步骤 1–3/5–7 在事务内（可回滚）；raw 回填 + FTS/索引重建放事务外**幂等**作业（失败可重跑，不阻塞服务启动）。

### 7.3 双写期（1 个发布版本）

- 单写者合并成功后**同事务**写 legacy `memory_items`（字段投影：kind/scope/key/content/source/authority/confidence/status/version/importance/strength/refs/conflict_with/last_used_at/created_at/updated_at）。
- 读路径：默认读 `memories`；`memory.v3.read_from=memory_items` 时读旧表（回滚开关）。
- 旧 API 的 `kind/scope` 由 `type/sub_type`+主实体投影；前端/evals 不改即可通过。
- 双写期目标版本：**1 个 minor**；验收后下个版本清理 `memory_items` 镜像与 legacy 列（v0.4，另行契约）。

### 7.4 回滚

| 情况 | 动作 |
|---|---|
| 迁移事务失败 | 事务回滚 + 从备份恢复；服务以 v1 启动；告警 |
| 迁移成功但运行时异常 | ① `memory.v3.read_from=memory_items`（读旧）② 关 `memory.v3.enabled`（停新写，保留 v2 表不写）③ 必要时回滚二进制；旧表双写期内始终可读 |
| 数据错（fact_key 误判等） | 不删数据：`entity_facts`/`memories` 可按报告修复（history 保留）；必要时 `maintenance_jobs.kind=rebuild_facts` 重建 |
| 索引坏 | `rebuild_fts`/`rebuild_edges` 幂等重建；读路径降级（主库过滤 + 最近 N 条） |

**硬规则**：回滚不丢用户数据；raw/canonical/历史/冲突全部保留；不允许"迁移失败后部分表半写"（事务 + 幂等作业分开）。

### 7.5 迁移验收

- fixture DB（含：多 scope 记忆、冲突成对、历史版本、session/task 树、消息）→ 跑迁移 → 断言：计数一致、id 不变、历史不丢、冲突可查、双写一致、读开关可切、回滚演练通过。
- 迁移后跑 M3 既有 5 类 case + M21 新 case（§8.4）。

---

## 8. 测试计划

### 8.1 单元测试

| # | 覆盖 | 断言要点 |
|---|---|---|
| U1 | factKey 归一化 | 同义/全半角/别名→同 key；不同 predicate/qualifier→不同 key；无法映射 predicate → 不生成 fact |
| U2 | 事实唯一 | 同 key 一致值→合并来源不升版本；不同值→新条目 disputed + conflict + 旧 active 不变；部分唯一索引违例为 0 |
| U3 | 观点归属 | opinion 无 attributed_to 拒收；attribution 行生成；多观点并存不产生 conflict |
| U4 | 冲突判定/询问 | fact/norm/scene 三型；ask_policy；ask_count 上限 1；回答后 resolved + 被否方 superseded |
| U5 | canonical 幂等 | 同 raw 同版本 → 同 canonical_key；重复处理不重复插入；unresolved 不写记忆 |
| U6 | 候选幂等 | 同 candidate_key 重复提交→同回执、单版本 |
| U7 | 实体解析 | 别名/全称命中；低置信不硬绑（resolved=0）；大小写/全半角 |
| U8 | 金字塔 | coverage<0.8 不生成；必保留项校验；源变更→stale；重建幂等；stale 默认不返回 |
| U9 | 智能体记忆 | 来源必填；写域校验；sensitive 不进通用记忆；≥3 独立会话才提升 |
| U10 | 权限 | 跨 agent 写拒绝；sensitive 跨域读拒绝；归档会话不写 |
| U11 | API 形状 | 旧字段兼容（kind/scope）；分页/错误码；写方法 404 |

### 8.2 集成测试

| # | 场景 | 断言 |
|---|---|---|
| I1 | 对话"记住 X" | raw→canonical→候选→memories active；`GET /api/memory/items` 可见；重启仍在 |
| I2 | "记住 A"→"改成 B" | 旧版本 history、旧 valid_until 闭合、新 version；无重复 active |
| I3 | "A" vs 相反 "B" | 两条 disputed + conflicts 成对；`ask_count` 规则；用户选 A 后 B superseded |
| I4 | 实体图 | 建会话/任务 → entities/relations 正确；`/api/memory/graph` depth=1 返回邻域；depth=3 被拒/截断 |
| I5 | 金字塔 | 会话归档 → 生成 L1 节点（coverage≥0.8）；条目更新 → 节点 stale → 重建 active |
| I6 | 智能体通用记忆 | 会话归档提炼 → agent 域 memory + agent_memory 来源；别的 agent 可读不可写 |
| I7 | 双写一致 | 单写者合并后 memories 与 memory_items 投影一致（逐字段） |
| I8 | 读切换 | `read_from=memory_items` 与 `memories` 的 items API 结果等价（旧字段） |

### 8.3 迁移与故障注入

| # | 手段 | 断言 |
|---|---|---|
| M1 | fixture 迁移成功 | §7.5 全部断言 |
| M2 | 迁移中强杀进程 | 重启后事务未半提交；可重跑；无重复行 |
| M3 | 迁移后回滚开关 | 读旧表正常；新写不破坏旧表；再切回新表一致 |
| M4 | canonical 回填中断 | 幂等续跑；已完成不重复；failed 可见 |
| M5 | 索引损坏 | 降级读（主库过滤）不 500；重建后恢复 |
| M6 | 并发候选（10 并发） | 单写者串行；无重复 active fact；冲突成对；无丢失回执 |
| M7 | 磁盘满/只读（可选） | 写失败 fail-soft + 明确错误；不损坏 DB |

### 8.4 E2E / evals

- **回归**：M1–M20 全部 evals 必须全绿（独立端口 + 独立 `AGENTD_HOME`，不动 8787）。
- **新增 case（evals 侧，tier 标注）**：

| case | 断言 |
|---|---|
| `memory-v3-canonical` | 发消息 → `GET /api/memory/canonical/{id}` 有 rawRefs + mentions；raw 不可变（hash 不变） |
| `memory-v3-fact-unique` | 两种冲突写法 → 只有一个 active（或 0 active + disputed 对）；部分唯一索引不报错；冲突可查 |
| `memory-v3-opinion` | 观点带 attributedTo；同话题两观点并存；无归属观点不入库 |
| `memory-v3-disputed-ask` | 冲突出现 → `GET /api/memory/conflicts` 可见；ask_count 不超限 |
| `memory-v3-entities` | 建会话/任务后 `/api/memory/entities` 含对应实体；graph 邻域正确 |
| `memory-v3-pyramid` | 会话归档后 `/api/memory/pyramid` 有 L1 节点；改条目后 stale→重建 |
| `memory-v3-agent-memory` | 提炼后有 agent 域记忆 + 来源；跨 agent 只读（431/`policy_denied`）；sensitive 不跨 |
| `memory-v3-readonly` | 写方法 404；归档会话不写 |
| `memory-v3-migration` | fixture 迁移计数/回滚（可在专门脚本跑，不计入常驻 eval） |

### 8.5 性能与规模（默认占位，先测基线）

| 指标 | 默认目标（占位） |
|---|---|
| `GET /api/memory/items` P95 | ≤100ms（1 万条） |
| 检索（FTS + 实体邻域 + 过滤）P95 | ≤50ms（本地） |
| 单次 `Submit` 事务 P95 | ≤10ms |
| 迁移（1 万条 + 10 万消息，不含 canonical 回填） | ≤60s |
| 金字塔增量重建 | ≤2s/实体（≤200 源） |
| 记忆页 100 条渲染 | ≤300ms |

---

## 9. 验收标准（M21，可执行 checklist）

> 前置：`go vet ./...`、`go test ./...`、`tsc --noEmit`、前端构建全绿；M1–M20 evals 回归全绿。

**A. 数据与管道**

1. 新消息 → raw 落库（不可变，`content_hash` 固定）→ canonical（`status=ok`）→ 候选 → memories；全链路 `GET /api/memory/canonical/{id}` 可回溯 raw。
2. 重复投递同一消息/同一候选/同一 canonical 作业 → 无重复行、同回执（幂等）。
3. `retracted` 不物理删除、不进检索；`superseded` 旧版本在 history 可查；`valid_until` 闭合语义正确。
4. 任一记忆条目可回答：来源 raw、canonical、写入实例/模型、合并回执（审计查询可用）。

**B. 事实/观点/冲突**

5. 同 `factKey` 只存在一个 active；不同值 → disputed 成对 + conflict 记录；**无自动按权威覆盖**。
6. `assertion=opinion` ⇒ `attributed_to` 非空且至少 1 条 attribution；无归属观点无法入库。
7. conflict 状态机可走通 open→asking→resolved（用户回答）；未答保持 deferred；`ask_count ≤1`。

**C. 实体与金字塔**

8. 会话/任务/域/智能体实体可查；关系/图邻域正确（depth 限制生效）。
9. 金字塔 L0–L4 节点可生成；stale 传播正确（改源→stale→重建）；stale 默认不进检索。

**D. 智能体**

10. 通用记忆只从该 agent 负责的会话提炼，来源可查（`agent_memory`）；跨 agent 只读；`sensitive` 不跨域；写入他人域被拒（`policy_denied`）。
11. 人格/身份校验点生效：注入他者内容带归属标；上级会话不传人格（沿用 design-core）。

**E. 迁移与回滚**

12. fixture DB 迁移：计数/id/历史/冲突/双写全部通过；`read_from` 切换等价；回滚演练通过（§7.5）。
13. 迁移中强杀可恢复；重启后无半写数据。

**F. 接口与安全**

14. 记忆 API 只读：`POST/PUT/PATCH/DELETE /api/memory*` 返回 404 且无 `ok:true`。
15. 错误信封/分页/错误码符合 §6.3；旧字段（kind/scope）兼容（前端不改可用）。
16. 归档会话：只读，记忆不新写；跨会话可取用（M19 语义不变）。

**G. 性能**

17. §8.5 指标达基线（数字按 M21 基线校准，作为报告项而非硬门禁；若不达标需给出证据与调整）。

---

## 10. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | **canonical 改写失真**（指代消解错/丢条件） | 记忆从源头错、污染扩散 | 忠实性校验；低置信保留原词（`unresolved`）；`ops` 可审计；可重放重建；`failed` 不写记忆 |
| R2 | **factKey 误判**（实体解析错/词表不全） | 不同事实合并 / 同事实判冲突 | 实体 id 而非名字；predicate 受控词表（未知不硬猜）；`entity_facts` 可重建；报告 + 抽样审计 |
| R3 | **迁移风险**（半写/回填错/双写漂移） | 数据/评测回归 | 事务分层；幂等作业；双写期；读开关；备份回滚；fixture 验收（§7.5） |
| R4 | **性能**（多路召回 + 实体 join + 金字塔） | 首 token / 记忆页变慢 | 硬过滤先行；预算沿用 design/22（8% A/K=8）；邻域 depth≤2；金字塔后台构建；索引见 §3.3 |
| R5 | **实体图噪声/膨胀** | 召回变差、维护成本 | 实体合并（merged_into）；关系来源分级；`entity_edges` 可重建；定期整理（W5） |
| R6 | **冲突积累**（不自动裁决 → disputed 变多） | 记忆页噪声、用户困惑 | `ask_policy` 分级；一次一问不重复；冲突横幅；用户一次回答批量解决 |
| R7 | **智能体通用记忆噪声** | 人格串味/错误经验 | 来源强制；≥3 独立会话门槛；sensitive 过滤；写域隔离；可 retract |
| R8 | **双写漂移** | 两套字段不一致 | 同事务双写；一致性测试（I7）；切换前抽样对账；下版本清理 |
| R9 | **评测缺口**（新语义无现成 grader） | 无法证明改进 | 优先确定性断言（唯一索引/成对/溯源/只读）；少量人工 rubric；`Δ` 消融 |
| R10 | **与 M18/M19/M20 依赖未落地** | W2/W4 触发缺失 | 降级：W2 以 `canArchive` 可用为准（不可用则跳过并记原因）；W4 退化为会话归档触发；memory 动作只读先上 |

---

## 11. V1 / P1 边界

### 11.1 V1（本契约验收范围）

- 全部 20 张表 + 迁移 + 双写 + 回滚；canonical 管道；事实唯一/观点归属/冲突；实体/关系/图；金字塔 L0–L4；智能体通用记忆；只读 API + 内部写端口；索引/FTS；测试计划与验收。

### 11.2 P1（不在本契约）

- 向量召回/混合 RRF 的向量臂、rerank、文档 RAG（design/22 P1）；
- 实体名 FTS/模糊实体链接、跨库实体对齐；
- canonical 全量历史回填的性能优化（增量/分层）；
- 智能体团队 V1 的跨 agent 对话与团队模板记忆；
- 记忆页 UI 增强（时间线/图谱可视化）——本契约只锁定 API。

---

## 12. 需要 Lead/用户确认的契约级决定（5 条，带默认）

1. **`memories` 新表 + 双写 vs 直接扩 `memory_items`**：默认**新表 + 双写 1 个版本**（回滚安全、字段干净），代价是双写与清理成本。若要求"零新表"，则改为扩列（迁移更简单但回滚依赖备份）。
2. **canonical 化同步/异步**：默认**异步、但写记忆必须等 canonical 就绪**（对话回复不等）；若要求"消息写入即可检索"，需要同步 canonical（首响应变慢）。
3. **历史消息 canonical 回填范围**：默认**全量后台分批**；>20 万条消息时默认只回填最近 90 天 + 按需回填。
4. **V1 实体解析方式**：默认**规则 + 别名表 + 轻量模型抽取**（低置信不硬绑 `resolved=0`）；不用向量实体链接（P1）。
5. **谓词受控词表初始 12 个**（§5.1 列出）：默认照此实现，新增词表项需带迁移与评测；若先要更宽，可加 `other` 档但必须进 `open_question`。

---

## 13. 参考

- [`design/24-记忆模型-v0.3.md`](../design/24-记忆模型-v0.3.md)（v0.3.1 定稿：实体/关系/五类型/事实唯一/观点归属/冲突/金字塔/canonical/智能体记忆/迁移）
- [`docs/design-core.md`](design-core.md)（2026-11-07 用户确认：全局唯一库/五类型/金字塔/写入/canonical/不隔离/人格四项）
- [`design/22-记忆与RAG-v0.md`](../design/22-记忆与RAG-v0.md)（读路径七步/预算 8% A/K=8/≤400 token/cite 硬要求/打分公式/写触发 W1–W3）
- [`docs/m3-contract.md`](m3-contract.md)（已实现记忆地基：memory_items/history/candidates/conflicts/fts、API、无写接口纪律）
- `agentd/internal/modules/memory`（现有 migrations.go/service.go/http.go/module.go）与 `agentd/internal/core/memory/memory.go`（Service/Candidate/Search 契约）
- [`docs/m18-contract.md`](m18-contract.md)（canArchive/acceptanceKeys/boundary）、[`docs/m19-contract.md`](m19-contract.md)（长任务/归档只读/幂等）、[`docs/m20-contract.md`](m20-contract.md)（memory 动作命名空间）
- `research/memory-first-prior-art.md`（双时态/ADD-only/实体图/失效不删的先行方案证据）

---

*本契约与 design/24 v0.3.1 冲突时以 design/24 + design-core 为准；本文一旦评审通过，字段名/表名/接口形状即为实现与评测的锁定面。*
