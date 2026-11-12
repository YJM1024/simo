# 指标仪表盘 · 产品定义（Metrics Dashboard）

状态：**draft（只定义指标与口径；未实现、未埋点）**
定位：工作台内的只读指标区，不做独立顶层导航；优先回答“系统跑得怎么样、任务质量如何”，不追求实时大屏。
实现 spec：[`specs/FE-008-metrics-dashboard/spec.md`](../../specs/FE-008-metrics-dashboard/spec.md)。

---

## 1. 范围与原则

### 1.1 范围

- **系统性能**：Token、每天话题、每天消息、会话总数、回复速度、首字延迟（TTFT）；
- **业务质量**：任务完成率、一次完成率、返工率、按会话/项目的完成情况、响应速度；
- 每个指标必须写：定义、公式、数据源、时间窗、当前是否具备数据；
- 设计位置：工作台内指标区；不新增顶层导航；先 KPI → 趋势 → 任务质量 → 每块表格。

### 1.2 原则

1. **真实优先**：没有数据就显示“数据未接入/待埋点”，**不得显示示例值/假 0**；
2. **口径先定**：每个率都有明确分子/分母/去重规则；不把不同口径混在一个数字里；
3. **时间窗明确**：7/30 天按本地时区日切；当前天是部分天，需标注；
4. **单一数据源**：指标由后端聚合接口提供；前端不在大量消息上重复计算；
5. **可解释**：每个指标可展开到表格/口径说明；异常值可追溯到会话/任务。

### 1.3 时间窗（统一）

| 项 | 定义 |
|---|---|
| 窗口 | `7d` / `30d`；`from = 本地今天 00:00 - (N-1) 天`，`to = now` |
| 日桶 | 本地 `[00:00, 次日 00:00)`；当前天为部分天 |
| 包含边界 | `startedAt/createdAt >= from` 且 `< to`（半开区间） |
| 时区 | 浏览器本地时区；接口返回 `timezone` 便于核对 |
| 对比 | 首版不做环比；不混用不同窗口 |

---

## 2. 系统性能指标

### 2.1 Token

| 指标 | 定义/公式 | 数据源 | 时间窗 | 当前数据 |
|---|---|---|---|---|
| `tokens.total` | provider 返回的 `total_tokens` 之和；若 provider 不返回 total，则 `prompt + completion`（reasoning 单列，不重复计入） | turn/LLM usage；`/api/stats` 已有部分 totals | 窗口 | **部分已有** |
| `tokens.prompt` | 所有成功模型调用的 prompt tokens 之和 | 同上 | 窗口 | **部分已有** |
| `tokens.completion` | completion tokens 之和（是否含 reasoning 由 provider 口径决定，需标注） | 同上 | 窗口 | **部分已有** |
| `tokens.reasoning` | reasoning tokens 之和；无该字段显示“待埋点”而非 0 | 同上 | 窗口 | **部分/缺失** |
| 按日 | 每个本地日桶的上述四项 | 同上 | 7/30d | 部分已有 |
| 按模型 | 每个 model 的上述四项 | turn.model；需确认已有 | 窗口 | **待确认/可能缺** |
| 按会话 | 每个 session 的 token 总量与分项 | sessionId 聚合 | 窗口 | 部分已有（`bySession`） |

**规则**：`total` 与分项不得重复相加（若 total 已含 reasoning，分项只做解释）；显示“总/分项”时在 tooltip 写口径。

### 2.2 每天话题（v0 口径）

首版不引入意图分类，使用两个会话级信号：

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `topics.newSessions` | 当天**首次物化**的会话数（首条 user/agent 消息发生的会话；空草稿不算） | sessions/messages | 日桶 |
| `topics.activeSessions` | 当天有 ≥1 条 user/agent 消息的**去重会话数**（含新会话） | messages | 日桶 |
| `topics.daily` | 展示为 `newSessions + activeSessions` 两个数，**不直接相加成一个“话题数”**（避免新会话被重复计） | 同上 | 日桶 |

- 当前“话题”=会话，不等同于意图/主题；意图分类待确认（见 §6）。
- 会话归档后仍可按历史当天计入；归档当天消息仍算当天活跃。

### 2.3 每天消息数

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `messages.user` | role=user 的消息数 | messages | 日桶 |
| `messages.agent` | role=agent 的消息数 | messages | 日桶 |
| `messages.total` | user + agent；不包含 system/合成/提示消息 | messages | 日桶 |

- 消息计数按消息 `createdAt` 落桶；流式回复只计一条最终消息，不按 token/chunk 计。
- 失败/重试产生的重复消息按实际消息记录计；前端可另列“失败回复数”（后续）。

### 2.4 会话总数

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `sessions.total` | 窗口结束时未删除/未软删的会话总数 | sessions | 截至窗口末 |
| `sessions.active` | 窗口内有 ≥1 条 user/agent 消息的去重会话数 | messages/sessions | 窗口 |
| `sessions.archived` | 窗口结束时 `archived=true` 的会话数 | sessions | 截至窗口末 |

规则：
- `total != active + archived` 是允许的（存在非活跃且未归档的会话）；不得强行让三者相等；
- 归档状态以窗口末为准；窗口内曾活跃但后来归档的会话仍计入 active，同时计入 archived，需在 tooltip 说明；
- “会话总数”是状态口径，“活跃”是窗口行为口径，不混为同一分母。

### 2.5 回复速度 p50/p90

| 指标 | 定义/公式 | 数据源 | 时间窗 | 当前数据 |
|---|---|---|---|---|
| `reply.p50` / `reply.p90` | 对每个“成功完成的 agent 回复”计算 `reply.completedAt - 触发 userMessage.createdAt`，取 p50/p90 | turn/reply 时间戳 | 窗口 | **缺埋点** |
| 备注 | 失败/中止/空回复不计入速度；单独统计失败率；工具/任务耗时包含在回复耗时内（按产品口径） | 同上 | 窗口 | — |

- 取整到 ms/s；样本数 <20 时显示“样本不足”，不硬算 p90；
- 同一 user 消息触发多段回复时，以最终回复完成计一次；中间工具消息不单独计。

### 2.6 首字延迟 TTFT p50/p90

| 指标 | 定义/公式 | 数据源 | 时间窗 | 当前数据 |
|---|---|---|---|---|
| `ttft.p50` / `ttft.p90` | 对每个成功回复计算 `firstTokenAt - 触发 userMessage.createdAt`，取 p50/p90 | turn/reply 时间戳 | 窗口 | **缺埋点** |
| 备注 | 只统计成功回复；失败/无首 token 不计；是否只算成功回复见 §6 待确认 | 同上 | 窗口 | — |

- TTFT 与回复速度分开：TTFT 看“开始有输出”，reply 看“完成”；
- 无 `firstTokenAt` 时显示“待埋点”，不能用 `completedAt - startedAt` 冒充。

---

## 3. 业务质量指标

### 3.1 任务完成率

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `tasks.completionRate` | `done / (done + failed + cancelled)`（窗口内进入终态的任务；不含 running/queued） | tasks | 窗口 |
| 展示 | 同时显示分子/分母；running 单列，不塞进分母 | tasks | 窗口 |

- 取消是否算“未完成”需固定；首版计入分母并单列，避免完成率虚高；
- 任务按 `createdAt` 落窗口；跨窗口完成的任务以创建时间归属（需在 tooltip 说明）。

### 3.2 一次完成率

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `tasks.firstPassRate` | `done && maxAttempt == 1` 的任务数 / `done` 任务数 | tasks/attempts | 窗口 |
| 备注 | 只对完成的任务算；失败后重试最终 done 的任务不算一次完成 | attempts | 窗口 |

### 3.3 返工率

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `tasks.reworkRate` | 去重任务中 `maxAttempt > 1` 或 发生 `reopen` 或 失败后重试 的任务数 / 去重“被尝试任务”数 | attempts/reopen | 窗口 |
| 备注 | 分子/分母都按 taskId 去重；一次任务多次重试只算 1 个返工任务 | 同上 | 窗口 |

- “被尝试任务”=窗口内创建且进入执行/终态的任务；未开始（queued）不计；
- reopen/失败重试必须来自事件/字段，不能靠前端猜。

### 3.4 按会话/项目完成情况

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `bySession` | 每个 session：任务数、done、failed/cancelled、completionRate、firstPassRate、reworkRate | tasks + sessions | 窗口 |
| `byProject` | 项目不是独立实体，按“会话→项目映射”聚合；无映射显示“未归类” | sessions | 窗口 |
| 排序 | 默认按任务数/完成率；可切换；空行不伪造 | — | — |

### 3.5 响应速度（任务）

| 指标 | 定义/公式 | 数据源 | 时间窗 |
|---|---|---|---|
| `tasks.responseP50/P90` | 完成任务 `doneAt - createdAt` 的 p50/p90 | tasks 时间戳 | 窗口 |
| 备注 | 与回复速度不同：这是任务端到端；失败任务不计入 | tasks | 窗口 |

---

## 4. 数据源与埋点缺口

### 4.1 现有可用（部分）

- `/api/stats` 已有按天/粒度/会话的消息、任务、token totals（prompt/completion/reasoning 分项）；具体字段以实际接口为准；
- sessions 表有 archived/createdAt；messages 有 role/createdAt/sessionId；
- tasks 表有状态/createdAt/updatedAt（完成时间需确认）。

### 4.2 必须补的埋点（后端）

| # | 缺口 | 需要字段/事件 | 影响的指标 |
|---|---|---|---|
| G1 | 回复耗时 | turn/reply 的 `startedAt`、`firstTokenAt`、`completedAt` | 回复速度 p50/p90、TTFT |
| G2 | 任务尝试 | task `attemptCount`/attempt 事件（每次开始/重试） | 一次完成率、返工率 |
| G3 | 重开 | task `reopenCount`/reopen 事件 | 返工率 |
| G4 | 任务完成时间 | task `completedAt`（终态时间） | 任务响应速度 |
| G5 | 模型归属 | turn/reply 的 `model` 字段（若未有） | Token 按模型 |
| G6 | 归档时间 | session `archivedAt`（若只有布尔） | 会话归档趋势/窗口末口径 |
| G7 | token 口径 | `total_tokens` 是否含 reasoning、provider 口径 | Token 总/分项不重复 |
| G8 | 失败回复 | reply `status`（成功/失败/中止） | 速度样本过滤、失败率 |

> 缺口未补前：对应指标显示“待埋点/数据未接入”，不显示 0、不估算、不用现有近似字段冒充。

---

## 5. 设计（工作台内指标区）

- **位置**：工作台页内的指标区，不新增顶层导航；不新增独立页面路由；
- **阅读顺序**：
  1. **KPI 行**：Token 总量/分项、每天话题（新/活跃）、每天消息（user/agent/总）、会话（总/活跃/归档）、回复 p50/p90、TTFT p50/p90；
  2. **趋势**：7/30 天；Token、消息、话题（新/活跃）趋势；
  3. **任务质量**：完成率、一次完成率、返工率、任务响应 p50/p90；
  4. **每块表格**：Token 按模型/会话、消息按角色/会话、会话明细、任务按会话/项目、延迟分位样本；
- **筛选**：7 天 / 30 天；切换后所有块同步；显示时间窗/时区/数据更新时间；
- **状态**：空、加载、错误三态；部分指标缺失时标“待埋点”，页面仍可用；
- **禁止**：示例数据、假 0、把总/分项重复相加、混用不同时间窗、无口径说明的百分比。

## 6. 待确认

1. **话题口径**：首版用“新会话 + 活跃会话”两个信号；是否改为意图分类/话题聚类（需要分类器与评估）；
2. **独立导航**：当前明确不新增顶层导航；是否未来升级为独立页面（需产品决策）；
3. **TTFT**：是否只统计成功回复（本 spec 默认只算成功）；是否包含工具调用/排队等待时间（默认从 user 消息到首 token，含排队）；
4. **取消任务**：完成率分母是否包含 cancelled（本 spec 包含并单列）；
5. **跨窗口任务**：按创建时间归属还是完成时间归属（本 spec 首版按创建时间，需确认）；
6. **样本不足**：p90 最小样本阈值（本 spec 暂定 20，待定）。

---

*本文件只定义指标口径与设计方向；实现、埋点、接口以 FE-008 与后端契约为准。*
