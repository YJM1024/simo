# M18 实现契约：SpecCore 真正驱动执行

> **状态**：实现契约 v0.1（2026-11-08），M18 开发前置。**只写设计/契约，不写代码。**
> **前置**：M13（V1.1）已完成；M14/M15 已 accepted。M18 的目标是把现有“最小 Spec（状态 + acceptance_keys + evidence）”升级为**执行循环实际读取 Spec → 决策 → 执行 → 更新 Spec**。
> **最高依据**：[`docs/design-core.md`](design-core.md)（2026-11-08 v0.2：Spec 是会话内部实现手段；本体只有记忆 + 动作；一切皆记忆、会话是交互视图）。实现对象以本文为准；与 design/18 冲突处按本文（M18 是落地契约，design/18 是早期候选设计）。
> **参考**：`design/18-SDD流程-v0.md`、`design/24-记忆模型-v0.3.md`、`docs/m11-contract.md`、sessions 模块现有 `specs` / `session_overviews` 表。

---

## 1. 目标、范围与非目标

### 1.1 目标

1. **会话 1:1 Spec**：每个会话（含子会话）恰好一个 Spec；Spec 属于会话，不是顶级产品实体。
2. **状态机真正生效**：`draft → confirmed → planning → executing → verifying → verified → archived`，支持 reopen；非法迁移被拒绝并留痕。
3. **执行循环每轮读 Spec**：在模型调用前把 Spec 的**内部上下文块**注入上下文；决策/任务/汇报/工具结果后更新 Spec（版本递增）；用户不可见。
4. **验收键与证据闭环**：任务挂 `acceptance_keys`；任务完成写 evidence；`canArchive` 依据证据判定。
5. **概览由 Spec + 任务生成**：固定结构化字段 + 自然汇报体 + 列表；UI 只叫「概览」。
6. **子任务执行者**：默认 `任务智能体（空人格 NPC）`；可按会话配置为司墨本人；NPC 不与用户对话。
7. **明确边界**：不做团队 V1/V2 消息；不新增公开 Spec API；不把 Spec 暴露成 UI 概念。

### 1.2 非目标

- 不做团队 V1（角色互相对话）/ V2（团队模板、成员会话聊天）；M18 仍是 V0 执行模型。
- 不新增“Spec 页面 / Spec 导航 / Spec 编辑入口”；UI 只有「概览」。
- 不引入第二套任务/进度真相；进度仍以 `tasks.status` 为唯一进度源。
- 不把 Spec 做成记忆的一种 kind（design/24 已定：Spec 属于会话，记忆只引用 `spec:`）。
- 不改已有用户可见文案结构（除概览内部数据来源变化）。

---

## 2. 核心对象

### 2.1 Spec（会话内部）

| 字段 | 说明 |
|---|---|
| `id` | `spec-<sessionId>`（稳定 1:1） |
| `session_id` | 唯一；一个会话一个 Spec |
| `status` | 七态状态机（§3） |
| `version` | 每次内容/状态变更 +1；乐观并发 |
| `goal` | 会话目标（一段自然语言） |
| `constraints` | 约束列表（JSON array；兼容旧 TEXT） |
| `current` | 当前进行到哪（一段自然语言） |
| `plan` | 执行计划（JSON：阶段/任务/依赖/负责人；M18 由决策生成） |
| `acceptance_keys` | 验收键数组（任务/需求对应） |
| `evidence` | 已满足的验收键（兼容旧 JSON；M18 起以 `spec_evidence` 为准，见 §7） |
| `executor_agent_id` | 子任务默认执行者；默认 `agent:task-npc`，可设为 `agent:simo` |
| `state_reason` | 最近一次状态变更原因（内部） |
| `reopened_count` | reopen 次数 |
| `created_at` / `updated_at` | 时间戳 |

> **不可见**：任何公开 API/UI/消息不得返回 `specId`、`specVersion`、`status` 等内部字段；见 §6/§8。

### 2.2 Spec 与记忆

- Spec 本身是会话内部规范层，**不是记忆类型**；记忆可通过 `refs: ["spec:<id>"]` 引用。
- Spec 的目标/约束/决定在会话收尾时以候选写回记忆（W2 规则：`canArchive(specId)==true` 前置）。
- 记忆中的实体可被 Spec 引用；Spec 不复制记忆正文。

### 2.3 子任务执行者

| 执行者 | 默认 | 行为 |
|---|---|---|
| **任务智能体 NPC** | ✅ 默认 | `agent:task-npc`；空人格/最小系统提示；只接任务 brief + Spec 切片 + 必要记忆；只回执行报告/证据；**不与用户对话、不写用户可见消息** |
| **司墨本人** | 可配置 | `agent:simo`；仍以“执行者”身份工作，不新开用户对话；报告统一由司墨在会话里发出 |

**配置**：`specs.executor_agent_id` 可按会话设置；任务可带 `executor_agent_id` 覆盖（空 = 继承 Spec）。配置通过内部动作/管理员设置完成，**不新增用户可见 UI**；用户可用对话表达“这个任务用你自己做”，由动作层落到配置。

---

## 3. 状态机

### 3.1 状态与迁移

```
draft ──► confirmed ──► planning ──► executing ──► verifying ──► verified ──► archived
  ▲           │             ▲             │            │            │
  └── 新需求/重置 ──────────┴─────────────┴────────────┘            │
                                                   reopen（任意已终结态）
```

| # | 迁移 | 触发 | 守卫条件 | 副作用 |
|---|---|---|---|---|
| T1 | `draft → confirmed` | Spec 完成目标/约束收集 | 目标非空、无阻塞性歧义；结构校验通过 | version+1；`spec.state_changed` |
| T2 | `confirmed → planning` | 开始拆任务/生成计划 | 有目标；plan 写入 | version+1；`spec.state_changed`；记录 `spec.plan_updated` |
| T3 | `planning → executing` | 首个任务进入 running | 至少一个 task 存在 | version+1；`spec.state_changed` |
| T4 | `executing → verifying` | 所有任务进入终态（done/cancelled/failed 按策略） | 无 queued/running 任务 | version+1；`spec.state_changed` |
| T5 | `verifying → verified` | 所有 acceptance_keys 有 evidence | `allKeysEvidenced` 且无 blocker | version+1；`spec.state_changed`；写 `verified_at` |
| T6 | `verified → archived` | 归档 | `canArchive(specId)==true` | version+1；`spec.state_changed`；会话归档 |
| T7 | `verified/archived → executing` | reopen（新需求/缺陷） | 显式 reopen 动作 | version+1；`reopened_count+1`；`spec.reopened`；保留旧 evidence |
| T8 | `executing → planning` | 重规划 | 计划失效/新约束 | version+1；`spec.replanned`；旧任务保留（superseded） |
| T9 | `any non-archived → archived` | 放弃/完成收尾 | 仅当 canArchive 或显式 abandon（记录原因） | version+1；`spec.state_changed` |

**非法迁移**（如 `draft → executing`、`verified → planning` 未 reopen）→ 返回 409/内部错误，写 `spec.transition_rejected`，不改状态。**状态只由 Spec 服务迁移，业务模块不得直接 UPDATE status。**

### 3.2 与任务状态的关系

- `tasks.status` 是**唯一进度真源**；Spec 状态是工作流阶段，不是进度百分比。
- 任务状态变化事件只触发 `executing/verifying` 的候选迁移；最终迁移由 Spec 服务守卫决定。
- 任务失败/取消：不自动把 Spec 标 verified；Spec 进入 `verifying` 或回 `planning`（取决于是否还有可运行任务）。
- 归档门禁 `canArchive(specId)` 的规则沿用并强化：
  1. 无 queued/running 任务；
  2. 所有 acceptance_keys 有 evidence（或 done 任务兜底）；
  3. 无未处置的 critical/important verdict（若 M18 接入）；
  4. 子 Spec 未 verified 时父 Spec 不可 verified（除非 waiver）。

### 3.3 reopen

- 允许 `verified → executing` 与 `archived → executing`（archived 需先恢复会话/取消归档，再 reopen）；
- reopen 必须记录原因、actor、旧版本；追加新任务；旧 evidence 不删除，新增 evidence 叠加；
- reopen 不清空 completed/pending 历史；概览时间线追加“重新打开”事件。

---

## 4. 执行循环集成（Spec 每轮注入）

### 4.1 每轮流程图

```
用户/触发输入
  ↓
① Spec 服务：GetBySession / ensure spec（1:1）
  ↓
② 组装上下文：系统/规则/记忆/对话 surface + 【Spec 内部块】
  ↓
③ 模型调用（决策：ANSWER/CLARIFY/CALL_TOOL/DELEGATE/WAIT/CLOSE）
  ↓
④ 动作层执行（工具/任务/汇报/配置；所有写经单写者）
  ↓
⑤ Spec 服务：按结果更新 goal/constraints/current/plan/acceptance_keys/evidence/status
  ↓
⑥ 发事件、更新概览缓存（dirty）、返回用户可见回复
```

### 4.2 Spec 内部上下文块（必须）

每轮请求注入一段**内部 block**（不是用户消息、不显示在界面）：

```text
[spec:internal]
sessionId=<id>  version=<n>  status=<state>
goal: <一句话>
constraints: <- 每行一条
current: <当前进展>
acceptance: [key 状态：pending|evidenced]
plan: <阶段/任务/依赖摘要，≤20 行>
open: <未决问题/风险，≤5 条>
recent: <最近 3 条 spec 事件>
[/spec:internal]
```

规则：
- **预算**：≤1200 tokens（超出截断 plan/open，不截断 goal/constraints/acceptance 状态）；
- **只读**：注入块是只读快照；模型不得直接修改；修改只能通过动作层调用 Spec 服务；
- **不泄漏**：块内容不得进入用户可见消息/工具输出/概览；debug 只能查看**摘要**，不得看全量内部字段；
- **缓存**：按 `(specId, version)` 缓存组装结果；version 变化即失效；
- **一致性**：每轮开始读一次；同一轮内不重复读，更新在轮末提交。

### 4.3 决策/任务/汇报后的更新

| 事件/动作 | Spec 更新 |
|---|---|
| 用户提出目标/约束 | `goal`/`constraints` 更新；必要时 `draft→confirmed` |
| 模型决策 `DELEGATE` 拆任务 | 写 `plan`；任务写 `acceptance_keys`；`confirmed→planning` |
| 任务创建 | `spec.acceptance_keys += task:<id>`（幂等）；`planning/executing` |
| 任务 running | `executing`；`current` 更新 |
| 任务 done | 写 evidence（`spec_evidence`，key=`task:<id>`）；`verifying`；全部齐 → `verified` |
| 任务 failed/cancelled | 记录 `state_reason`；决定回 `planning` 或保持 `executing`（有可运行任务） |
| 汇报发出 | 更新 `current`/timeline（内部） |
| 用户纠正/新约束 | 更新 `constraints`；版本+1；必要时 `executing→planning` |
| 归档 | 走 canArchive；`verified→archived` |

- 所有更新在**同一单写者事务**内完成；并发更新用 `version` 乐观锁（冲突重读再应用）；
- 每轮最多一次 `spec.updated` 事件（聚合本轮变更，避免刷屏）；
- 模型自述不作为 evidence；evidence 必须由动作/任务结果生成。

### 4.4 失败与恢复

- 模型调用失败：Spec 不变；写 `spec.turn_failed`（内部）；
- 动作失败：Spec 可加 `open` 风险；不自动改 verified；
- 进程崩溃：Spec 状态/evidence 已持久化；重启从最后一致版本继续；running 任务恢复为 interrupted；
- 重复事件：evidence 写入按 `(specId, acceptanceKey, evidenceRef)` 幂等，不重复追加。

---

## 5. 概览生成（Spec + 任务 → 概览）

### 5.1 数据来源

- Spec：`goal / constraints / current / acceptance_keys / evidence / status`；
- 任务：`tasks` 的状态/标题/时间/产物；
- 事件：任务/工作流/关键消息的时间线；
- 记忆：会话相关的规范/决定（可选，只取摘要）。

### 5.2 输出结构（API 用户可见）

```json
{
  "goal": "这个会话在做的一件事（一段自然语言）",
  "constraints": ["约束一（完整句子）", "约束二"],
  "current": "目前进展（一段自然语言）",
  "completed": ["已完成项一（完整句子）"],
  "pending": ["待办项一（完整句子）"],
  "timeline": [
    {"at": 1760000000000, "text": "一句完整的话"}
  ],
  "updatedAt": 1760000000000,
  "version": 3
}
```

- `constraints/completed/pending` 为字符串数组；`timeline` 为 `{at,text}` 数组，`at` 毫秒；
- **不返回** `specId/specVersion/status/evidence` 等内部字段；
- 字段命名对外沿用 M11；旧数据若 `constraints` 是字符串，读取时归一为单元素数组；新写入一律数组。

### 5.3 自然汇报体 + 列表

- `goal/constraints/current`：自然段落，完整句子，禁止“目标：X／约束：Y”电报体；
- `completed/pending`：**列表**，每项完整句子；completed 可带 ✓，pending 可带 ☐；
- `timeline`：有序列表，每项“时间 + 一句完整的话”；时间粒度按 M11 规则（24h 内 HH:mm、1 月内 M月D日、1 年内 YYYY年M月、更早 YYYY年）；
- 生成方式：结构化数据由 Spec+任务聚合；自然语句用模板或一次模型润色（失败回退模板，不丢条目）；**不把 Spec 字段名写进文案**。
- 刷新：打开读缓存；`POST /api/sessions/{id}/overview/refresh` 重新生成；Spec version 变化标记 dirty，下次打开/刷新时更新。

### 5.4 入口

- UI 仍叫「概览」（会话顶部三标签：对话/文件/概览）；不新增 Spec 入口；
- 概览只读；修改目标/任务通过对话，刷新后更新。

---

## 6. 子任务执行者（NPC / 司墨）

### 6.1 默认 NPC

- 身份：`agent:task-npc`，空人格/中性执行提示，仅任务上下文；
- 输入：任务 brief（标题/描述/依赖产物/写作用域/accepted keys）+ Spec 切片（目标/约束/当前）+ 必要记忆视图；
- 输出：执行报告（结论/产物/证据引用/未决/风险）；**不得**直接给用户发消息、不得写公共记忆、不得改 Spec；
- 报告回到司墨，由司墨统一汇报（避免“多个执行者同时跟用户说话”）。

### 6.2 配置为司墨本人

- `specs.executor_agent_id = agent:simo` 或任务级覆盖；
- 仍以执行者身份工作：不复制/继承用户对话历史，只拿 brief + Spec 切片；报告仍由会话中的司墨发出（同一身份，但不是“另一个对话”）；
- 身份锁定：执行者不得冒充用户/其他智能体；输出打标 `[executor:…]`（内部）。

### 6.3 明确不做

- 不做团队 V1（角色互相对话）、V2（团队模板/成员会话聊天）；
- 不做执行者之间的消息路由/群聊；
- 不做 NPC 向用户主动汇报；所有对外输出收口到会话负责人。

---

## 7. 表结构演进

> 迁移只前进不回滚；迁移前备份。M13 现有 schema 为基线。

### 7.1 `specs`（sessions 模块，migration v6）

在现有列（`id, session_id, status, version, acceptance_keys, evidence, created_at, updated_at`）上新增：

| 列 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `goal` | TEXT | `''` | 目标 |
| `constraints` | TEXT(JSON) | `'[]'` | 约束数组 |
| `current` | TEXT | `''` | 当前进展 |
| `plan` | TEXT(JSON) | `'{}'` | 计划（阶段/任务/依赖/负责人） |
| `executor_agent_id` | TEXT | `'agent:task-npc'` | 默认执行者 |
| `state_reason` | TEXT | `''` | 最近迁移原因 |
| `reopened_count` | INTEGER | `0` | reopen 次数 |
| `last_injected_version` | INTEGER | `0` | 最近注入上下文的版本（防重复/观测） |

> `evidence` 列保留兼容读取；M18 起新写入以 §7.3 `spec_evidence` 为准，旧 JSON 在迁移时回填/保留只读。

### 7.2 `spec_transitions`（新增，append-only）

| 列 | 说明 |
|---|---|
| `id` | `st-…` |
| `spec_id` / `session_id` | 归属 |
| `from_status` / `to_status` | 迁移 |
| `version` | 迁移后 Spec 版本 |
| `reason` | 原因 |
| `actor` | `user`/`simo`/`executor`/`system` |
| `created_at` | 时间戳 |
| 索引 | `(spec_id, version)` |

### 7.3 `spec_evidence`（新增，权威）

| 列 | 说明 |
|---|---|
| `id` | `ev-…` |
| `spec_id` / `session_id` | 归属 |
| `acceptance_key` | 验收键（如 `task:<id>`） |
| `task_id` | 关联任务（可空） |
| `kind` | `task_done`/`tool`/`artifact`/`user_confirm` |
| `ref` | 证据引用（task/event/artifact/消息 id） |
| `hash` | 内容/结果摘要（防篡改） |
| `created_at` | |
| `invalidated_at` / `invalid_reason` | 失效不删 |
| 唯一 | `(spec_id, acceptance_key, ref)` 幂等 |

### 7.4 `tasks`（tasks 模块，migration v5）

| 列 | 说明 |
|---|---|
| `spec_id` | 冗余归属（便于按 Spec 查询） |
| `acceptance_keys` | TEXT(JSON)；任务完成要满足的键 |
| `executor_agent_id` | 空 = 继承 Spec；可覆盖为 `agent:simo` |

### 7.5 `session_overviews`（sessions 模块，migration v6 同批）

| 列 | 说明 |
|---|---|
| `source_spec_version` | 生成时的 Spec 版本（判定过期） |
| `dirty` | 0/1；Spec/任务变化置 1 |
| `constraints` | 仍 TEXT，但写 JSON 数组（兼容旧文本） |

### 7.6 迁移顺序与回滚

1. 备份 `SIMO_HOME`；
2. sessions v6：扩展 `specs`、建 `spec_transitions`/`spec_evidence`、扩展 `session_overviews`；旧 Spec 行填默认值；
3. tasks v5：加列；旧任务 `acceptance_keys=[]`、`executor_agent_id=''`；
4. 回填：旧 `tasks` 的 done 任务建议生成 `task:<id>` evidence（可配置为迁移期回填，避免归档门禁卡住）；旧 `specs.evidence` 只读保留；
5. 失败 fail-closed：迁移失败保持原版本并报错，恢复备份；不做自动回滚脚本。

---

## 8. API / 事件增量

### 8.1 公开 API（用户可见）

| 方法 | 路径 | 变化 |
|---|---|---|
| GET | `/api/sessions/{id}/overview` | 返回 §5.2 结构；**不返回 Spec 字段**；无概览时返回空结构 |
| POST | `/api/sessions/{id}/overview/refresh` | 从 Spec+任务重新生成并缓存；返回同结构 |
| GET | `/api/tasks?sessionId=` | 任务增加 `executorAgentId`/`acceptanceKeys` 可选字段？**建议不加**，避免暴露内部；任务详情仍不显示 Spec |
| GET | `/api/tasks/{id}` | 不新增 Spec 字段；只返回任务原有信息 |

> **不新增公开 `/api/specs`、不新增 Spec 页面、不在概览返回 specId/specVersion/status。**

### 8.2 内部服务接口（core/spec Service 扩展）

```go
type Service interface {
  GetBySession(ctx, sessionID) (Spec, error)
  Ensure(ctx, sessionID) (Spec, error)
  Transition(ctx, specID, to, reason, actor) (Spec, error)
  Update(ctx, specID, baseVersion, patch, actor) (Spec, error)
  AttachTask(ctx, specID, taskID, keys) error
  RecordEvidence(ctx, specID, key, ref, kind) error
  Reopen(ctx, specID, reason, actor) (Spec, error)
  CanArchive(ctx, specID) (ArchiveCheck, error)
  ContextForTurn(ctx, sessionID) (SpecContext, error) // 内部注入用
}
```

- 只由 `sessions` 模块实现；chat/tasks 通过接口调用，不直接读写 `specs`；
- `ContextForTurn` 返回已裁剪/预算内的内部块字符串或结构；**不得**通过公开 HTTP 暴露。

### 8.3 事件（内部事件日志）

| 事件 | 何时 | 关键 payload |
|---|---|---|
| `spec.created` | 会话创建/补建 | specId, sessionId, version |
| `spec.updated` | 每轮聚合更新 | specId, version, changed[]（goal/plan/current…） |
| `spec.state_changed` | 状态迁移 | from,to,reason,version |
| `spec.evidence_added` | 证据写入 | key,ref,kind |
| `spec.reopened` | reopen | reason,oldVersion,newVersion |
| `spec.replanned` | 重规划 | reason,planVersion |
| `spec.transition_rejected` | 非法迁移 | from,to,reason |

- 事件仅供内部审计/调试；**不向用户 UI 广播**；debug 端点可查看摘要；
- 任务/工作流事件保留；`task.updated done` 仍触发证据写入，但证据写入由 Spec 服务幂等完成。

### 8.4 调试端点

- `GET /api/debug/spec?sessionId=` 保留，仅 `-debug` + loopback；返回内部字段用于排障，**不得**作为用户功能；
- 新增 `GET /api/debug/spec/context?sessionId=` 可选：返回注入块摘要（不含记忆正文），用于验证“每轮注入”。

---

## 9. 验收标准（M18）

1. **1:1**：每个新会话自动创建 Spec；会话删除/归档不产生孤立 Spec；`session_id` 唯一。
2. **状态机**：T1–T9 合法；非法迁移返回错误且状态不变；每次迁移 version+1 且写 `spec_transitions`。
3. **每轮注入**：mock 模式下检查最近一次模型请求包含 `[spec:internal]` 块（goal/constraints/status/acceptance）；用户消息、工具输出、概览中**不出现** Spec 字段/块。
4. **更新闭环**：用户给目标、拆任务、任务 running/done、汇报/纠正，Spec 对应字段更新；版本递增；事件可查。
5. **验收键/证据**：任务挂 acceptance_keys；done 写 evidence（幂等）；缺证据时 `canArchive` 返回 blocker；全部有证据后 verified。
6. **概览**：`GET/POST overview` 返回 §5.2 字段；自然汇报体 + completed/pending 列表 + timeline `{at,text}` 带时间；无 Spec 字段；刷新读 Spec+任务；缓存/dirty 正确。
7. **执行者**：默认 NPC；NPC 不产生用户可见消息、不改 Spec/公共记忆；配置为司墨后报告仍由会话负责人发出；身份打标。
8. **reopen**：verified/archived 可 reopen，保留旧证据、新增任务、版本+1、概览时间线出现“重新打开”。
9. **范围**：无团队 V1/V2 消息、无 Spec UI/公开 API、无新顶级实体。
10. **兼容**：M1–M17 回归；M13 数据迁移后会话/任务/概览/归档不回退；容器仍未实测（不承诺）。

---

## 10. 测试计划

| 层 | 用例 | 判据 |
|---|---|---|
| 单元 | 状态迁移表（合法/非法/reopen）、version 乐观锁、evidence 幂等、canArchive 规则 | 表驱动测试全绿 |
| 单元 | SpecContext 组装预算/裁剪/不含用户可见字段 | 快照测试；≤1200 tokens |
| 集成 | sessions/tasks/chat 三方：任务 done → evidence → verifying/verified | mock 任务 + API 断言 |
| 集成 | 每轮注入：mock LLM 请求快照含 spec block；用户消息不含 | `/api/debug/last-llm-request` |
| 集成 | 概览刷新：Spec version/dirty/缓存；字段结构；无 spec 字段 | API + 快照 |
| 集成 | NPC vs simo：NPC 不发消息、不改 Spec；simo 报告归属 | WS/REST 审计 |
| 迁移 | M13 数据 + 旧 specs/overviews → v6/v5；备份/失败回滚 | 迁移测试 + 启动检查 |
| E2E | 一个需求：Spec→计划→任务→汇报→概览→归档→reopen | 干净 SIMO_HOME |
| 回归 | M1–M17 mock 套件 | 全绿（或注明已知） |
| 安全 | 公开 API 扫描无 specId/specVersion；debug 仅 loopback；无 key | 扫描 + 权限测试 |

**新增 mock case（编号顺延）**：

- `m18-spec-1to1`：新会话自动 spec，`session_id` 唯一；
- `m18-state-guard`：非法迁移被拒、合法迁移 version+1；
- `m18-context-inject`：每轮请求含内部块、用户可见无 Spec；
- `m18-evidence`：任务 done 写 evidence、canArchive 阻塞/放行；
- `m18-overview`：结构/自然体/列表/timeline 时间/no-spec；
- `m18-executor-npc`：NPC 无用户消息；
- `m18-reopen`：reopen 证据保留/版本递增。

---

## 11. 风险与应对

| # | 风险 | 应对 |
|---|---|---|
| 1 | 模型忽略 Spec（仍按自己想法做） | 注入块必含 goal/constraints/acceptance；每轮决策后校验；评测断言“上下文有 Spec 且执行符合” |
| 2 | 内部状态与外部事实漂移 | 所有写经单写者 + version 乐观锁；`spec_transitions` 审计；概览从 Spec+任务重算 |
| 3 | 任务 done 与 evidence 事件竞态 | Spec 服务在任务状态变更事务后幂等写 evidence；不依赖事件到达顺序 |
| 4 | 概览泄漏内部字段/术语 | API schema 白名单 + 响应扫描；UI 文案扫描；只返回 §5.2 字段 |
| 5 | NPC 人格/身份混乱 | 空人格 + 身份打标 + 不写公共记忆 + 不直接对用户；报告收口到负责人 |
| 6 | 迁移卡住归档门禁 | 迁移回填 done 任务 evidence；`canArchive` 对 done 任务兜底；迁移前备份 |
| 7 | 每轮读 Spec 带来延迟 | 按 version 缓存；上下文块 ≤1200 tokens；单次查询；turn 内不重复 |
| 8 | 范围蔓延到团队 V1/V2 | 明确非目标；不做消息路由/团队模板；评审拒绝 |
| 9 | 状态机与旧事件消费者重复推进 | 所有状态变更 centralize 到 Spec 服务；旧事件消费者改为调用服务，不直接写 status |

---

## 12. 与既有文档的差异

- **design/18**：早期把 Spec 当一等对象、有 Plan/Task/Evidence/Ledger 全套；M18 以 **会话内部 Spec + 任务**落地，不新增公开 Spec API/页面；Evidence 以 `spec_evidence` 为准。
- **design/24**：Spec 不是记忆类型，记忆只引用 `spec:`；M18 遵循。
- **m11-contract**：概览字段沿用；M18 明确 `completed/pending` 列表、`timeline[{at,text}]`、无 Spec 字段；`constraints` 新写入数组。
- **M13 现状**：现有 specs 只有状态/验收键/证据；M18 扩展字段与执行循环，保留兼容读取。

---

*本契约只写设计，不写实现；所有“建议/可选”项不构成已实现承诺。*
