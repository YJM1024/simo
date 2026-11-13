# E5 Planner + 长程任务设计 v0.1

> **状态**：E5 设计 **v0.1**，供评审；**不是实现代码，不改其他文档**。
> **日期**：2026-11-06
> **版本**：v0.1（2026-11-06）——按 **用户 2026-11-06 授权 lead 拍板** 写入 Q1/Q2/Q5=A，Q3/Q4 按默认推进；并记录需 18 v0.3 吸收的扩展。
> **依据**：[`18-SDD流程-v0.md`](18-SDD流程-v0.md) v0.2（SpecCore）、[`19-AgentLoop设计-v0.md`](19-AgentLoop设计-v0.md) v0.1（E1 Loop）、[`20-上下文工程-v0.md`](20-上下文工程-v0.md) v0.2（E2）、[`17-评测设计-v0.md`](17-评测设计-v0.md) v0（E0）、[`10-设计对话记录.md`](10-设计对话记录.md) §27–33；调研见 [`sdd-frameworks-survey.md`](../archive/research/sdd-frameworks-survey.md)、[`adjacent-frameworks.md`](../archive/research/adjacent-frameworks.md)、[`superpowers-mechanisms.md`](../archive/research/superpowers-mechanisms.md)。
> **标记约定**：`【已定·18/19/20/17/10】` = 上游已拍板或已成稿；`【拍板】` = 用户 2026-11-06 授权 lead 拍板；`【建议·本稿】` = 本稿设计建议，可被推翻；`【推断】` = 未验证；`【待对齐】` = 需 18 v0.3 / 19 v0.2 并入，不视为已定。
> **一句话**：Planner 把 **Spec（要什么）** 拆成 **Plan（怎么做）** 与 **Task（做到哪）** 的可执行 DAG；执行中只做**有边界的重规划**；长任务靠**检查点 + 预算熔断 + 卡死检测 + 证据**不失控；用户只看到对话投影，永远看不到 Spec/Plan/Task。

---

## 0. 一分钟读法

1. **规划层级与粒度**：§3 —— Spec 是权威，Plan 是论证，Task 是最小可测单元；Plan 回链 Spec 版本。
2. **怎么拆**：§4 —— 先判四档规模（BMAD 的 trivial / one-session / epic / project），再按"能否独立接受/排期/验证/发布"决定拆子 Spec 还是加 Task；组织可嵌套，执行必须平铺。
3. **执行中怎么改**：§7 —— 新消息 / 证据 / 失败 / 超预算 / 新依赖都可能触发重规划；局部改 Plan 版本，改需求走 Spec delta + 版本。
4. **长任务怎么不失控**：§8 —— 检查点、断点续跑、appetite + circuit breaker（超预算砍范围→partial）、卡死检测、人工介入、归档/reopen。
5. **怎么证明规划值得做**：§11 —— 对 E0 自带机器可判定断言 + `t_ckpt`/恢复 case + 预算 `Δ`；指标先测基线再定目标。
6. **拍板记录**：Q1=A / Q2=A / Q5=A（用户 2026-11-06 授权 lead），Q3/Q4 按默认推进；见 §13。

---

## 1. 定位与边界

### 1.1 是什么 / 不是什么

| 维度 | 结论 |
|---|---|
| **是什么** | SpecCore 与 E1 Loop 之间的**规划层**：读 Spec@version 与记忆/约束，产出 Plan + Task DAG + 每个 Task 的 brief 要素；执行中监控进度、触发重规划、管理 appetite/预算/检查点/进度投影。 |
| **不是什么** | 不是 Agent Loop（19 拥有 Turn/Step/工具/停止条件）；不是上下文装配器（20 拥有装配/预算/压缩）；不是记忆存储（12）；不是 SpecCore 本身（18 拥有 Spec/Evidence/Ledger）；不是用户可见的计划编辑器。 |
| **用户感知** | **零**。用户只看到自然语言计划摘要、进度/结果、风险确认；不出现 Spec/Plan/Task/版本/覆盖率等内部词汇（10 §32–33）。 |
| **交付形态** | 设计文档 + 对象扩展 + 判定规则 + E0 断言；实现落 M5（长任务）周边，不单独改 Loop。 |

### 1.2 与上游的接口（只对接，不重造）

| 上游 | E5 读什么 | E5 写/产出什么 | 边界 |
|---|---|---|---|
| **18 SpecCore** | Spec@version、Requirement/Scenario/Acceptance、non-goals、appetite、rabbit holes、memoryScopeRefs、现有 Task/Evidence/Ledger | Plan（含 Plan 版本/修订）、Task 列表（todo）、delta 建议、replan 记录、partial 收口建议 | **不直接写 Spec**；需求变更只提交 delta 候选，由秘书/控制器单写者合并（18 §11 Q4 默认） |
| **19 E1 Loop** | Turn/Step 状态、工具结果、子代理 report/completion notice、三态取消、检查点/恢复事件 | 冻结的 Task brief、DAG 就绪集、预算请求、重规划信号 | **不实现** Turn/Step、工具管线、三屏障；只消费其事件与接口 |
| **20 E2 上下文** | 装配预算/配额、`InjectionPlan` 的 plan/task/progress 摘要需求 | Plan/Task 的**摘要**（不是全文）、当前 wave、阻塞/下一步 | **不决定**上下文层序/压缩；只提供"该给模型看哪段计划"的输入 |
| **17 E0 评测** | 评测骨架、L1/L2 规范、`WITH/W/OUT/Δ`、门禁 | 规划断言、L2 case、E5 指标、消融臂 | **必须自带**（17 §7.3）：机器可判定断言 + `t_ckpt`/恢复 case + 预算 `Δ` |
| **12 记忆** | 约束/决策/进展/经验（带来源与冲突标记） | 收尾时只把结论/决策/经验作为候选（18 §4.6） | **不直接写公共记忆**；不把 Spec 当记忆注入 |
| **10 交互** | 用户消息、steer/queue、风险门、hill chart 语言 | 计划摘要/进度/确认问题（自然语言） | **Spec 不可见**；不新增审批流 |

### 1.3 不变量（违反即实现错误）

| # | 不变量 | 可测方式 |
|---|---|---|
| **I1** | **Spec 是权威，Plan 是论证**；冲突以 Spec 为准 | Plan 必带 `specId@specVersion`；版本不符即失效 |
| **I2** | **每个 Task 都是最小可测单元**：一个可观察结果 + 一组 acceptance/evidence + 一个 writeScope | 规划门检查；不满足不派发 |
| **I3** | **Task 是唯一进度真源**；Spec 状态不是进度，不存百分比 | 进度查询只读 `sc_tasks.status` |
| **I4** | **组织可嵌套，执行必平铺**；执行器不递归处理 Spec 层级 | 调度只从 ready Task 池取；无递归 dispatch |
| **I5** | **重规划不静默**：每次局部/全局重规划写 Ledger，变更范围可解释 | Ledger 可查；无未记账的 Plan 变化 |
| **I6** | **appetite 是输入不是估算**；超预算默认砍范围/partial，不默认延期 | circuit breaker 记录与结果 |
| **I7** | **未知副作用不自动重试**；只报告未知并请人核对（19 §7.5/§8.5） | 故障注入：无重复执行 |
| **I8** | **用户可见文本不含 Spec 内部词汇**；进度用 hill chart 语言 | 投影文案扫描 |
| **I9** | **没有证据的"完成"不写入**；`done ≠ verified` | 双裁决 + Evidence 检查 |
| **I10** | **计划结构可重建**：从存储的 Plan/Task/事件可恢复，不依赖内存 | 同一存储状态重放出同一 DAG/Plan 结构 |

### 1.4 非目标（v0 不做）

- 不做用户可见的 Spec/Plan 页面、甘特图、燃尽图、工时估算；
- 不做多用户/分布式调度、跨机器任务队列、外部 workflow 引擎（Temporal 只借语义，不引入）；
- 不替代 E1 的 Turn/Step 状态机、不替代 E2 的上下文装配、不替代 18 的 Evidence/Ledger；
- 不固定"每层必须几个 Task / 最大深度"——只给软护栏（10 §30：动态粒度、不硬性规定）；
- 不把 Plan 写成代码级实现说明；不把 Task 切成"按分钟数"的步骤。

---

## 2. 术语与对象扩展

### 2.1 术语

| 词 | 定义 | 备注 |
|---|---|---|
| **Spec** | 会话内需求真相（18）；本节不重定义 | 用户不可见 |
| **Plan** | 对某个 `Spec@version` 的"怎么做"论证；含假设、验证方式、Task 列表 | 一个 Spec 版本对应一个有效 Plan |
| **PlanRevision** | 同一 Spec 版本内的局部修订号；局部重规划 +1 | 【建议·本稿】18 目前只有 `specVersion` |
| **Wave** | 按依赖拓扑分层的可并行批次；不是硬性阶段 | 执行仍平铺 |
| **Task** | 执行/进度/验收的最小单位；最小可测单元 | 一个 Task 一个 writeScope 组 |
| **TaskKind** | `implement / verify / spike / integrate` | `spike` 只解决未知，不产出交付 |
| **AcceptanceKey** | Task 覆盖的 Acceptance 标识（回链 Requirement） | 覆盖检查用 |
| **WriteScope** | 允许写的文件/路径前缀、产物 ID、记忆作用域、工具白名单 | 18 只有 `writeScope[]`，本稿扩为 boundary |
| **Boundary** | `writeScope + readScopes + allowedTools + forbiddenActions` | 【建议·本稿】cc-sdd 的 boundary-first |
| **Assumption** | Plan 依赖但未验证的前提；影响范围 + 验证方式 | 高风险 assumption 必须配 spike/clarify |
| **Tier** | 规模档：trivial / one-session / epic / project | 借 BMAD，见 §4.1 |
| **Replan** | 因新消息/证据/失败/预算/依赖导致的计划调整 | 分局部/全局 |
| **Delta** | Spec 版本的 ADDED/MODIFIED/REMOVED/RENAMED（18 §3.3） | 全局重规划的载体 |
| **PlanCheckpoint** | 粗粒度检查点：Spec/Plan 版本、Wave、Task 状态、预算、resumePoint | 【建议·本稿】叠加在 E1 三屏障之上 |
| **HillStage** | 上坡 / 坡顶 / 下坡 / 完成（给用户看的投影） | 不暴露内部状态机 |
| **Appetite** | Shape Up 的时间预算，是输入不是估算（18） | 超预算触发 circuit breaker |
| **CircuitBreaker** | 超预算/多次失败的默认止损：砍范围→partial，不默认延期 | 18 §3.7 |
| **Partial** | `archived + outcome=partial`：只对保留范围交付并说明缺什么 | 不等于失败，不等于会话结束 |
| **Stuck** | 无 durable progress / DAG 死锁 / 重复失败等需要介入的状态 | 见 §8.5 |

### 2.2 对 18 对象的最小扩展（【拍板·采纳】，需 18 v0.3 并入）

> 原则：**只加字段，不改 18 已有字段语义**；若 18 不采纳，E5 用投影/附属表实现，不另造第二套任务模型。
> **用户 2026-11-06 授权 lead 拍板**：以下扩展采纳；需 **design/18 v0.3** 吸收：`planRevision`、`supersedesPlanId`、`Task.dependsOn[]`、`Task.acceptanceKeys[]`、`Task.boundary{...}`（`writeScope/readScopes/allowedTools/forbiddenActions`）。

| 对象 | 扩展字段 | 用途 | 备注 |
|---|---|---|---|
| **Spec** | `tier`、`tierConfidence`、`tierReasons[]` | 记录规模判定与依据 | 【建议·本稿】18 可不入表，由 Plan 元数据携带；用户不可见 |
| **Plan** | `planRevision`、`supersedesPlanId?`、`waves[]`、`budgetAllocation` | 局部重规划不升 Spec 版本；Wave 仅调度建议 | **【拍板·采纳】** 待 18 v0.3 并入 |
| **Task** | `dependsOn[]`、`acceptanceKeys[]`、`boundary{...}`、`taskKind`、`implementationNotes?`、`parentTaskId?` | DAG、覆盖、边界、spike、任务间学习 | **`dependsOn`/`acceptanceKeys`/`boundary` 为拍板采纳项**；`taskKind`/`implementationNotes` 为建议；`parentTaskId` 只显示/分组，执行平铺（18 §3.4） |
| **新增** | `plan_checkpoints`（DB 表/等价事件投影） | 粗粒度恢复点 | 与 E1 检查点/事件日志不重复；见 §8.1 |
| **新增** | Ledger kind：`plan_created / plan_revised / replan / scope_change / partial_archive / budget_break / stuck / recovery_plan` | 重规划与长任务审计 | append-only；18 §3.5 的 Ledger 扩展 |

**需 design/18 v0.3 吸收的扩展（清单）**：
1. `Plan.planRevision`（同一 Spec 版本内局部重规划；`planRevision+1`，不升 Spec 版本）；
2. `Plan.supersedesPlanId`（新 Plan 取代旧 Plan 时回链；旧 Plan 保留并标 `superseded`）；
3. `Task.dependsOn[]`（显式 DAG 前置；执行平铺，不递归）；
4. `Task.acceptanceKeys[]`（Task ↔ Requirement/Acceptance 的覆盖回链）；
5. `Task.boundary{writeScope, readScopes, allowedTools, forbiddenActions}`（boundary-first；写域/读域/工具/禁则）。

**待对齐 18 v0.3**：① `planRevision`/`supersedesPlanId` 已拍板采纳，待并入；② `Task.dependsOn`/`acceptanceKeys`/`boundary` 已拍板采纳，待并入；③ trivial 档"按需创建 Spec/不建 Plan"的表述由 18 v0.3 确认（Q1=A）；④ `tier`/`taskKind`/`implementationNotes` 为建议字段，可后置。**未并入前，E5 的实现只能用兼容扩展，不能改 18 语义。**

### 2.3 ID 与版本规则

- **Spec id** 稳定；`specVersion` 只在需求 delta 后 +1；
- **Plan id** 每个 Spec 版本一个有效 Plan；局部重规划同 Plan id + `planRevision+1`；全局重规划（Spec 版本变化）创建新 Plan，旧 Plan `superseded`；
- **Task id** 稳定；重试不换 id；拆分产生新 Task，旧 Task `dropped`（带原因）；
- **Wave** 只是拓扑层的建议，不是持久身份；DAG 边以 `dependsOn` 为准。

---

## 3. 规划层级与粒度

### 3.1 三层：Spec → Plan → Task

| 层 | 回答的问题 | 权威性 | 粒度规则 |
|---|---|---|---|
| **Spec** | 要什么、什么算完成、不做什么 | **权威**（18） | 需求/验收单位；一个会话至多一个（按需创建） |
| **Plan** | 怎么做、按什么顺序、依赖/接口/验证方式 | **论证**（服从 Spec） | 每个 `Spec@version` 一个有效 Plan；只写实现者无法独自决定的事 |
| **Task** | 做到哪、怎么证明 | **执行/进度单位**（18 §3.4） | **最小可测单元**：一个可观察结果 + 一组证据 + 一个 writeScope |

**关键分离**：
- Spec 不是进度；Plan 不是 Spec 的复述；Task 不是"一步工具调用"。
- 执行实例只拿 **Task brief**（19 §8.2），不拿 Spec 全文/父对话；父只拿 report/evidence 指针（20 §8）。

### 3.2 Task 必须是"最小可测单元"

一个 Task 可以派发，必须同时满足：

1. **一个可观察结果**：能说清"完成后什么会不同"（文件/输出/状态/产物），不靠"我做了"叙述。
2. **一组 acceptance/evidence**：`acceptanceKeys[]` 至少 1 个；`requiredEvidence[]` 明确（test/command/artifact/approval），能映射到 E0 grader。
3. **一个 writeScope 组**：写文件/产物/记忆作用域声明完整；越界即失败（cc-sdd boundary-first）。
4. **一次验证闭环**：能在一次任务审查（双裁决）里判完；不需要"先做一半再定义验收"。
5. **可独立完成/独立丢弃**：完成不依赖未声明的外部产出；失败/丢弃不会让其他 Task 的验收失效（依赖关系除外）。
6. **粒度不按时间**：不写"2–5 分钟"或人天；按"一个验证闭环"切。一个 Task 内可以有多个 Step（E1 负责），但对外验收只在 Task 边界。

**不合格 → 处理**：
- 多结果/多交付物 → 拆 Task；
- 无法一次验证 → 补验收/拆 Task；
- 只有一个工具调用且无独立验收 → 并入邻近 Task（不是 Task）；
- 只解决未知、不产出交付 → `spike` Task（必须产出"未知是否解决"的证据，之后转实现 Task）。

**示例（个人助理）**："把这周的会议记录整理成周报并提取待办" → 3 个 Task：①收集并校验会议记录（evidence：文件清单/读取日志）；②生成周报草稿（artifact：markdown）；③提取待办并核对（evidence：清单 + 对照 diff）。每个 Task 可独立验收；"把周报写好看"不是一个 Task。

**Task 收尾附加**：每个 Task 写 1–3 行 `implementationNotes`（做法/坑/验证命令），供后续 Task 与 Plan 修订复用；不进入用户可见对话（cc-sdd 的 `## Implementation Notes`，调研 S6）。

### 3.3 Plan 只写"实现者无法独自决定的事"

| Plan 应写 | Plan 不应写 |
|---|---|
| 任务拆分与顺序、Wave、依赖 DAG | 逐行代码/伪代码/变量命名 |
| 跨 Task 的接口/契约/数据形状（高层） | 可由实现者按现有代码自行决定的内部细节 |
| 文件/模块/产物的 writeScope 与边界 | 对 Spec 的重复叙述 |
| 验证方式与 requiredEvidence 选择 | "尽量做好""注意质量"等不可判定话 |
| 关键假设、风险/rabbit holes、回滚/降级方式 | 具体耗时估算/日历承诺 |
| non-goals 的继承与新增、范围裁剪 | 未确认的产品决策（应进 Spec 或问人） |
| 需要 spike 的未知清单 | 角色扮演/流程表演 |

**检验**：如果把 Plan 给一个"有领域能力但没有会话上下文"的实现者，他应该只缺**任务内实现细节**，不缺"边界/接口/验收"；若他仍需要猜需求，说明 Plan 或 Spec 不合格。

### 3.4 Spec 回链与版本锁

- `Plan.specId` + `Plan.specVersion` 必填；`Task.specId/planId` + `acceptanceKeys[]` 必填；
- **版本锁**：`Plan.specVersion != Spec.currentVersion` → Plan `superseded`，**不得派发**；先重规划（§7）；
- **Spec 是权威**：Plan 与 Spec 冲突，以 Spec 为准；冲突处理写 Ledger `ruling`（18 §3.4/§5.1）；
- **不把 Spec 全文传执行者**：brief 只带受影响 Requirement/Acceptance 片段 + acceptance keys + handle（19 §8.2）。

### 3.5 常见粒度反模式

| 反模式 | 症状 | 后果 |
|---|---|---|
| Plan 写成 Spec | 大量需求复述、没有依赖/验证方式 | 改需求时 Plan 跟着漂移，无法定位 |
| Task = 一次工具调用 | 没有独立验收、证据只有"工具成功" | 进度看着多，实际没有可交付 |
| Task 过大 | 多个交付物/多组验收 | 审查一次判不完，返工大 |
| Task 过碎 | 只改一行、无法独立验证 | 调度/审查开销大于收益 |
| 所有事都拆子 Spec | 每个小需求都开新会话/新树 | 组织爆炸、上下文碎片化（10 §30：拆分是例外） |
| 计划不留假设 | 一遇未知就重规划 | 重规划频繁、无法解释 |

---

## 4. 拆分算法与判据

### 4.1 先判规模：BMAD 四档（借其思想，改我们的语义）

> 依据：BMAD 的 right-sizing（`archive/research/sdd-frameworks-survey.md` §2.4）与 S3 建议。**四档是路由，不是用户可见流程**；默认取最轻档，信息变多再升级。

| 档 | 触发信号（建议默认） | 内部处理 | 产出 | 用户感知 |
|---|---|---|---|---|
| **T0 trivial** | 一个可逆动作、无新未知、无需跨任务接口/验收 | **不生成 Plan/Task DAG**；直接执行并落一条 Task/Activity 记录；不建正式 Spec（按需创建） | 执行记录 + 证据（如需要） | 直接结果 |
| **T1 one-session** | 一个连贯交付、需求可一次说清、无独立子交付 | 一个 Spec + 一个 Plan + 1–5 个 Task；单次集成/验收 | Plan + Task DAG | 一句计划摘要（可选） |
| **T2 epic** | 需要多个 Wave、跨多个执行单元、有集成/未知；但仍是**一个可验收结果** | 一个 Spec + 一个 Plan + 多 Wave；**只有出现"可独立接受/发布"的子结果才拆子 Spec**；否则 Task 分组 | Plan + Wave + Task/子 Spec | 阶段性结果/风险确认 |
| **T3 project** | 多个独立可验收/可发布结果，需共享契约/多个 Spec | **多个 Spec（森林）**，每个按 T1/T2 处理；跨 Spec 只建 `depends_on`/`informs` 关系 | Spec 树 + 每个 Spec 的 Plan | 分线汇报（会话树自然投影） |

**软护栏（不是硬规则）**：
- 组织嵌套深度建议 ≤3；每个 Spec 直接子 Spec 建议 ≤5；每 Plan Task 建议 3–9（T1/T2）。超出不直接拒绝，但要求**显式记录理由**（"为什么不能再合并/为什么必须拆"）。
- **默认下探**：不确定时按更低档跑；发现不够再升级（upgrade 不需要用户确认，除非改变交付承诺）。
- **trivial 与 18 的对齐【拍板 Q1=A】**：T0 **不建 Plan/Task DAG**，Spec **按需创建**（18 的"一个会话一个 Spec"解释为"至多一个"）；18 v0.3 需确认该表述。若 18 最终坚持"每会话必有 Spec"，T0 只建极简 Spec（1 条 outcome + 1 条 acceptance），仍不建 Plan/Task DAG。
- **不按时间/人天定档**；档位是范围/交付结构判断。

### 4.2 拆分决策流程

输入：`intent + Spec（或待建 Spec 的摘要）+ appetite + 记忆约束 + 现有 Task/依赖`。

```
Step 1 分类：classifyIntent(intent, context) → tier + confidence + reasons
  - confidence 低 → 默认下探一档；只问 1 个澄清问题（若影响档位/交付）
Step 2 若 T0：直接执行，结束；不建 Plan/Task DAG（除非风险门要求记录）
Step 3 生成候选结果单元（candidate outcomes）
  - 按"用户能单独说'这个做完了'"的边界切
  - 按 DDD 术语变化：同一个词在两个候选里含义不同 → 候选边界
  - 按外部依赖/交付物：能独立交接的 → 候选边界
Step 4 对每个候选，按 §4.3 判"子 Spec 还是 Task"
Step 5 对留下的 Task 逐个做"最小可测"检查（§3.2）；不满足 → 拆/并/补验收
Step 6 建 DAG：显式 dependsOn；writeScope 重叠 → 加串行边或合并 Task
Step 7 覆盖检查 + 质量门（§4.4）；生成 Plan + Task；标 assumptions/spike
Step 8 若覆盖不足/依赖循环/预算明显不匹配 → 回到 Step 3/4（最多 2 轮），仍不行 → 阻塞/问人
```

### 4.3 判据：拆子 Spec 还是加 Task

| 判据（按优先级） | 倾向 | 说明 |
|---|---|---|
| **能否独立验收/发布/排期？** | **拆子 Spec** | 能单独说"这个交付了"、能独立验收/发布 → 子 Spec（18 §7.1） |
| **能否独立 build / integrate / finish？（Shape Up Scope）** | 若同时能独立验收 → 子 Spec；否则 Task 组 | "可独立完成"是 Scope 的判据；只有执行独立、验收仍绑定父级 → 留同一 Spec 的 Task |
| **术语/领域模型是否变化（DDD）** | **拆子 Spec** | 同一个词在两处含义不同 → 边界（相邻调研 §5.3） |
| **是否有明确外部依赖/交接物？** | **拆子 Spec + `depends_on`** | 外部依赖会让验收边界独立 |
| **只是细节/约束/验收补充？** | 留同一 Spec，作 Requirement | 不拆（18 §7.1） |
| **只是执行环境/工具/实例不同？** | Task（不是子 Spec） | 同验收、同交付，仅执行单元不同 |
| **只是排期不同、验收仍一起？** | Task + DAG 排序 | 不拆 |
| **不能一次验证/多交付物？** | 拆 Task | 这是粒度问题，不是 Spec 拆分 |

**"组织嵌套 / 执行平铺"（【已定·18 §7.2】）**：
- 组织：`parentSpecId` + `SpecRelation`（informs/depends_on/reframes）表达层级/依赖；用于上下文/展示/排期；
- 执行：所有可执行 Task 在同一池中按 DAG/依赖调度；**不按 Spec 树递归派发**；
- `parentTaskId` 只做展示分组，执行器不递归；子 Spec 的 Task 与父 Spec 的 Task 平级调度；
- 跨 Spec 依赖只影响"就绪判定/验收顺序"，不影响写权限；跨 Spec 写记忆仍走候选/作用域。

### 4.4 覆盖检查与规划质量门

Plan 生成后、派发前必须全过：

1. **覆盖**：每个 `must` Requirement 至少被 1 个 Task 的 `acceptanceKeys` 覆盖；每个 Task 至少映射 1 个 Acceptance；**无孤儿 Task**。
2. **粒度**：每个 Task 通过 §3.2 的 6 条；否则拆/并。
3. **证据**：每个 Task 有 `requiredEvidence[]` 且能映射到 E0 grader（test/command/artifact/approval/regex/state_delta/forbidden/tool_used 等）。
4. **DAG**：无环；`dependsOn` 只指向存在的 Task；无自依赖。
5. **写域**：每个 Task 有 writeScope；并行的 Task 不写同一路径/产物；重叠必须加依赖或合并。
6. **appetite**：Plan 的范围/并发/预算与 `appetite` 明显不匹配 → 先砍范围（circuit breaker），不是"先做完再说"。
7. **Spec 回链**：`plan.specVersion == spec.currentVersion`；否则不派发。
8. **可解释**：Plan 有 assumptions/risks/non-goals；高风险 assumption 有 spike 或 clarify 安排。

**规划失败处理**：缺验收/不可判定 → 补 Spec（clarify/delta）；无法覆盖 → 补 Task/拆子 Spec；超出 appetite → 先 scope hammer（§8.4），不是硬塞。

### 4.5 个人助理场景示例（拆分不是拍脑袋）

| 用户说 | 档位 | 拆分 |
|---|---|---|
| "把这条待办改短" | T0 | 直接执行；不建 Plan/Task DAG |
| "整理下周日程，并写一份周计划" | T1 | 一个 Spec + 1 Plan + 2–3 Task（收集日程/排程/输出计划），单次验收 |
| "整理下周日程 + 把上季度报销单归档" | T2（或 T1） | 两个结果可独立验收/发布 → 两个子 Spec（或同一 Spec 下两个独立 Task，若验收一起） |
| "帮我做一个季度的个人复盘系统（含数据、模板、自动汇总）" | T3 | 多个 Spec（数据/模板/汇总） + 共享契约；每个子 Spec 按 T2 |
| "先做日程，报销下周再说" | T1/T2 | 日程 Spec 先做；报销 Spec `draft`/`blocked`，不提前建 Plan |

---

## 5. 规划输入与规模判定

### 5.1 输入清单

| 输入 | 来源 | 用途 | 缺失时 |
|---|---|---|---|
| Spec@version（Requirement/Scenario/Acceptance） | 18 | 权威需求/验收 | 无 Spec → T0 或先建 Spec；缺验收 → clarify/补 |
| 记忆命中（约束/决策/进展/经验） | 12（只读） | 约束、默认、历史决策、风险 | 缺 → 用通用默认；不猜用户隐私/偏好 |
| non-goals / rabbit holes / glossary | 18 | 防范围蔓延/已知坑/术语一致 | 缺 → 继承父 Spec；无父则显式空 |
| appetite（时间预算） | 18 / 秘书默认 | 固定时间、弹性范围；超限熔断 | 缺 → 按档位给默认（18 Q2），不承诺日历 |
| 用户消息/steer/queue | 13/19 | 新约束、修正、新目标 | — |
| 当前 Task/DAG/进度/预算 | 18/19 | 重规划/就绪判定 | — |
| 工具/权限/环境能力 | 19/16 | 可行性、边界 | 缺 → 标记 assumption/blocked |
| 父 Spec 的 non-goals/术语/依赖 | 18/20 | 继承与边界 | 缺 → 显式记录"未继承" |

### 5.2 EARS + RFC 2119 在规划里的用法

- **Requirement 强度**（18 §3.3）：`must` 不可静默丢；`should` 可在 appetite 下裁剪（记录理由）；`may` 可后置。
- **一条 Requirement 只描述一个可测行为**；多行为必须拆条（18 §3.3 校验）；Planner 不得把多条揉进一个 Task 的验收里。
- **Acceptance 必须可映射到证据**：`test/command/artifact/approval`；`then` 只认可观察输出（18 §3.3）。
- **不可判定的验收 → 不进入 Plan**：要么澄清（≤1 问，带选项+建议），要么标 `open_question` 并阻塞该 Requirement；**不编造验收**。
- **must 覆盖是硬门**：覆盖检查未过，Plan 不能派发（§4.4）。

### 5.3 记忆、约束、non-goals、appetite 的用法

| 输入 | 规划规则 |
|---|---|
| **记忆约束/决策** | 作为 Plan 的 assumptions/constraints；与 Spec 冲突时以 Spec 为准，记 `ruling`/open_question；不静默覆盖 |
| **记忆进展** | 用于识别"已完成/已放弃/已变更"；旧进度不当作当前真相（以 Task 状态为准） |
| **non-goals** | 父→子继承；子新增 non-goal 必须显式记录；Plan 不得包含 non-goal 内的事 |
| **appetite** | 作为范围/并发/预算约束；先定预算再定范围；不可行先砍范围，不默认延期（18 §3.7） |
| **用户偏好** | V1 只读记忆中的已确认偏好；偏好层暂缓（10 §14/12 §2.8）；不推断"习惯" |

### 5.4 规模判定算法（classifyIntent）

| 信号 | T0 trivial | T1 one-session | T2 epic | T3 project |
|---|---|---|---|---|
| 可独立验收/发布的结果数 | 0–1（单动作） | 1 | 1 个结果 + 多 Wave/集成 | ≥2 个独立结果 |
| 需求/验收条数 | 0–1 | 少（可一次说清） | 中（跨多个执行单元） | 多 Spec/多领域 |
| 未知/假设 | 无新未知 | 少，可边做边定 | 有 spike/调查需求 | 多领域未知 |
| 外部依赖/交接物 | 无 | 少 | 有 | 跨多个外部系统/交付 |
| 术语是否统一（DDD） | 是 | 是 | 基本是 | 跨 Bounded Context |
| 是否需要集成/多阶段验收 | 否 | 否 | 是 | 是，多个集成点 |
| **默认动作** | 直接执行 | 单 Plan | 单 Plan + Wave/按需子 Spec | 多 Spec + 关系 |

- **confidence**：`high/medium/low`；low → 下探一档并最多问 1 个澄清问题（仅当影响交付/风险）。
- **不允许**用"用户没细说"当升级理由；缺信息先 clarify/spike，不把 T1 硬做成 T2。
- **升级**：发现独立验收/发布边界或大量未知 → 升档；**降级**：发现只是细节 → 降档（记录理由）。

### 5.5 缺输入时的处理

| 缺失 | 处理 |
|---|---|
| 验收标准不可判定 | 澄清（1 问 + 选项 + 建议）；仍不行 → `open_question`，该 Requirement 阻塞，不派发 |
| 关键未知（技术/外部依赖） | 创建 `spike` Task（只读/最小验证，不产出交付）；spike 结果写 Evidence/Handoff，再决定 |
| 风险动作（不可逆/线上/删数据/花钱/影响他人） | 走 18 §5.3 风险门，不因"计划里写了"就自动执行 |
| 任务过大/过小 | 按 §3.2/§4.4 拆/并；不靠"做的时候再说" |
| 预算明显不够 | 先 scope hammer/partial（§8.4），不问"能不能延期"作为默认 |

---

## 6. 依赖 DAG、并行与 write-scope

### 6.1 DAG 规则

- 节点 = Task（子 Spec 的 Task 也在同一池）；跨 Spec 用 `SpecRelation.depends_on` 表示 Spec 级依赖；
- 边 = `dependsOn[]`，原因必须可解释：数据/产物依赖、writeScope 冲突、验收依赖、外部依赖；
- **无环**：规划门检测；出现环 → 合并/拆解/改需求，不强行调度；
- 只有**所有前置 Task `verified`** 才 ready；`done` 不等于 verified（还要双裁决+证据）；
- 父 Task/子 Task 不递归：执行只从 ready 池取；`parentTaskId` 只做展示分组。

### 6.2 并行判定

一个 Task 可进入并行执行，必须同时满足：

1. 所有 `dependsOn` 前置 `verified`；
2. 与所有在飞 Task 的 `writeScope` **不相交**（写文件/产物/记忆写域）；
3. 不需要同一验证资源（同一测试环境/同一数据库分支/同一外部账号）；
4. 不违反 `taskKind` 并发限制（`spike`/只读可并行；实现类默认 ≤2）；
5. 预算/并发上限未满（§6.4）。

否则串行；不确定时**保守串行**（宁慢不冲突）。

### 6.3 writeScope 冲突

| 冲突类型 | 检测 | 处理 |
|---|---|---|
| 文件/路径前缀重叠 | 规划时归一化路径前缀比较；运行前再校验 | 合并 Task / 加 `dependsOn` 串行；未声明路径 = 越界 |
| 产物 ID 相同 | 规划时按 artifact 引用查重 | 同上 |
| 同一记忆作用域写 | 规划时标 `memoryWriteScope`；记忆写入仍走候选单写者 | 允许并行提交候选，但 Plan 要说明冲突风险；不保证顺序 |
| 工具/环境独占（DB、端口、账号） | 预先声明 resource 标签 | 加资源锁或串行 |
| 跨 Spec 写同一文件 | Plan 时跨 Spec 检查（依赖/关系） | 串行或拆成公共前置 Task |

**边界声明**（cc-sdd boundary-first）：每个 Task 带 `boundary`：
- `writeScope[]`：允许写的路径/产物；
- `readScopes[]`：需要读的记忆作用域/文件（不限制并行，只用于上下文）；
- `allowedTools[]`：本 Task 可用工具（与 E1 权限执行层一致）；
- `forbiddenActions[]`：本 Task 明确禁止的动作（如"不改线上配置"）。
**越界 = 失败**，不是"评审时放过"（16 D12/18 §7.1）。

### 6.4 并发与 WIP 默认（【建议·本稿】）

| 项 | V1 默认 | 说明 |
|---|---|---|
| 实现类 Task 并发 | ≤2 | 与 19 §8.1 对齐；同 writeScope 自动降为 1 |
| 审查类并发 | ≤2 | 只读、无写域冲突 |
| 同时 `executing` 的 Spec 数 | ≤3 | 防多开导致证据/上下文失控（Kanban WIP 思想） |
| 子代理深度 | 1（19） | E5 不增加；组织 Spec 嵌套 ≠ 子代理深度 |
| 每 Plan 最大 Task 数 | T1 ≤5 / T2 ≤15（软） | 超出要求显式理由或拆 Wave/子 Spec |
| 重规划次数 | 局部每 Wave ≤3；全局每 Spec ≤2（软） | 超限冻结并请人（§7.6） |

> 以上均可配置；**用户不可感知的队列可以存在，但不能表现为"请稍候"**（13 §3/§7）。

### 6.5 就绪/死锁检测

- **DAG 死锁**：有未完成 Task，但 ready 集为空且无在飞 Task → 立即标 blocked，写 Ledger，触发重规划/问人；不空转。
- **写域死锁**：所有 ready Task 都与在飞 Task 写域重叠 → 等待或重排；超过阈值（如 60s 无进展）→ 报"卡住"并给选项。
- **等待用户**：Task 等澄清/风险确认 → `blocked`，不是空跑；S2 心跳保持，但不假装进度。

### 6.6 规划质量门与派发条件

一个 Plan 可派发，必须：
- 覆盖检查通过（§4.4）；
- DAG 无环、writeScope 无冲突（或冲突已串行化）；
- 每个 Task 有 brief 要素（goal/acceptance/evidence/boundary/budget/return contract）；
- `plan.specVersion` 等于当前 Spec 版本；
- 预算/并发未超；
- 风险动作已有确认（18 §5.3）。
任何一条不满足 → 不派发；修正/重规划，不"先跑起来再说"。

---

## 7. 重规划（Replan）

### 7.1 触发条件

| 触发 | 例子 | 检测来源 | 默认范围 |
|---|---|---|---|
| **新消息（steer）** | 执行中"先别排日程，先列清单" | 13/19 Turn 输入 | 看影响：细节→局部；验收/范围→全局 |
| **新消息（queue）** | 下一轮"顺便把报销也做了" | 队列 | 通常全局（需求 delta）或新增 Spec |
| **证据不足/矛盾** | 实测发现假设不成立 | Evidence/双裁决 | 局部（改方案）或全局（改需求） |
| **Task 失败/修复超限** | 双裁决不过、修复 >5 轮 | 18/19 | 局部（重试/拆 Task）；反复失败→全局 |
| **超预算** | appetite 用完/逼近 | 计量/预算 | 全局（砍范围/partial） |
| **发现新依赖** | 需要另一个 Spec 的产出 | Plan/执行 | 局部（加边/调整 Wave）；跨 Spec→全局 |
| **Spec 版本漂移** | 用户改需求/新 delta | 18 | 全局（Plan 失效） |
| **卡死/重复** | 无进展、同工具重复、DAG 死锁 | 19 §11.3 | 局部/全局（看根因） |
| **权限/工具变化** | 工具不可用/权限被拒 | 19/16 | 局部重排；必要时全局 |

### 7.2 局部重规划 vs 全局重规划

| | 局部（Plan revision） | 全局（Spec delta + 新 Plan） |
|---|---|---|
| 改什么 | Task 拆分/顺序/依赖、实现方式、writeScope 小调整、spike 增加 | Requirement/Scenario/Acceptance、non-goals、appetite、范围/交付 |
| Spec 版本 | **不变** | **+1**（delta 四操作） |
| Plan | 同 id `planRevision+1`；旧 revision 留档 | 新 Plan；旧 Plan `superseded` |
| 已 verified Task | 保留（若验收仍成立） | 保留**仍成立**的；受影响的标 `dropped`/重建（不删历史） |
| 用户感知 | 通常不说；影响交付承诺时说一句 | 风险/范围变化时说清"改了什么、代价是什么" |
| Ledger | `plan_revised` / `replan(local)` | `replan(global)` + `scope_change` |
| 预算 | 尽量不增加；用 Plan 内余量 | 重新对 appetite；超限走 circuit breaker |

**判定规则**：
- 改"做什么/做到什么程度/红线" → **全局**（重做，不是调整；13 §11.3）；
- 改"怎么做/顺序/参数/拆分" → **局部**；
- 分不清 → 按全局一侧处理（更保守），在对话里说明理由（13 §11.3）。

### 7.3 与 steer / queue 的关系

| 输入 | 处理 | 对 Plan 的影响 |
|---|---|---|
| **steer（并入当前 Turn）** | 先判断是否影响当前 Task 的验收/边界；影响则尽快停/重规划；不影响则并入 brief 的补充约束 | 局部（改 Task/brief）或全局（改 Spec）；不等新 Turn |
| **queue（下一轮）** | 在当前 Turn 结束后、下一次派发前处理；不打断当前 Task | 通常全局（新增/修改需求）；也可局部 |
| **Ack/补充信息** | 不改变目标 → 不改 Plan，只更新 brief 的 assumptions/notes | 无 |
| **显式纠正** | 复述更正，写 Spec delta/Plan 修订，旧 Task 按需 drop | 看影响：局部/全局 |

**纪律**：
- **派发后的 Task brief 冻结**；运行中不能"悄悄改 brief"；变更必须走重规划并生成新 revision/新 Task；
- 运行中的 Task 若仍满足新约束，可继续；否则**停/取消可逆部分**、保留已做证据、按新 Plan 重派；不可逆动作按 13/19 报告"已发生"；
- 不允许"先按旧 Plan 做完再说"。

### 7.4 Spec 版本与 delta

- 所有需求变化走 18 §3.3 的 delta 四操作：`ADDED / MODIFIED / REMOVED / RENAMED`；
- `MODIFIED` 整块替换 Requirement + 全部 Scenario（不丢字段/场景）；
- `REMOVED` 必须写 `reason + migration`（替代方案/后续动作）；
- **delta 必带 provenance**：来自哪条消息/证据/记忆；不接受"模型顺手改"；
- Spec 版本 +1；旧版本保留（可追溯）；旧 Plan `superseded`；
- **已 verified Task 不因新版本自动作废**：若其验收仍成立，保留；受影响的 Task 标 `dropped`（原因）并建新 Task；不物理删除；
- **不允许**在 Plan 里直接改 Acceptance 绕过 Spec（那会变成"两层真相"）。

### 7.5 重规划算法

```
1. 触发识别（§7.1）→ 记录 Ledger（谁/为什么/影响范围）
2. 判断范围：局部 or 全局（§7.2 规则）；分不清按全局
3. 若全局：生成 Spec delta 候选 → 校验（18 §3.3）→ 合并（单写者）→ Spec 版本+1
4. 若局部：保留 Spec 版本，创建 PlanRevision+1
5. 重算：受影响 Task 的子图；保留不受影响的 verified Task；drop/重建受影响 Task
6. 重新覆盖检查 + DAG/writeScope 检查 + appetite 检查（§4.4/§6.6）
7. 若仍不可行：先 scope hammer/circuit breaker（§8.4）；仍不行 → BLOCKED 问人
8. 派发前冻结新 brief；记录 `plan_revised`/`replan`/`scope_change` Ledger
9. 用户投影：只在影响交付/风险/预算时说一句（不暴露内部词汇）
```

### 7.6 重规划预算与防抖

- **局部重规划**：每 Wave ≤3（建议默认）；同一原因重复 2 次 → 升级为全局或问人；
- **全局重规划**：每 Spec ≤2（建议默认）；超过 → 冻结，不自动继续；
- **防抖**：同一 Turn 内连续 steer 先合并理解（13 §7）；不要每条消息都重算 Plan；
- **成本**：重规划本身消耗 token/时间，计入 Spec 预算；不能靠"无限重规划"代替做对计划；
- **记录**：每次重规划写原因、范围、旧/新版本、受影响 Task，便于 E0 评估 churn。

---

## 8. 长程任务：检查点、预算、卡死与恢复

### 8.1 检查点：E1 三屏障 + E5 计划检查点

- **E1 三屏障**（请求前/顶层工具副作用前/每步前）是**执行级** durability（19 §7）；E5 不重复实现，只消费。
- **E5 PlanCheckpoint** 是**计划级**粗粒度检查点，在以下时机写：
  1. Plan 激活/重规划后；
  2. 每个 Wave 开始/结束；
  3. 每个 Task 派发前 / `verified` 后；
  4. circuit breaker/partial 前；
  5. 卡死/blocked 前。
- **内容（建议字段）**：

| 字段 | 内容 |
|---|---|
| `checkpointId` / `at` | 标识/时间 |
| `specId` / `specVersion` / `planId` / `planRevision` | 版本锁 |
| `waveIndex` / `taskStates[]` | 当前 Wave 与每个 Task 状态/attempt |
| `inFlight[]` | `{taskId, attempt, writeScope, pendingTool?, subagentId?}` |
| `dependencies` | 未满足的 DAG 边 |
| `budget` | appetite 剩余/token/cost/步数 |
| `resumePoint` | 下一步：哪个 Task/哪条 brief |
| `ledgerSeq` / `eventSeq` | 恢复游标 |
| `openRisks[]` | 未决风险/待确认问题 |

- 与 E1 事件日志/`activities` 的关系：**事件日志是真相，检查点是 durable 投影**；恢复重放事件、不重算副作用（19 §7.4/18 §8.3）。【待对齐】18 可加 `sc_plan_checkpoints`。

### 8.2 断点续跑（恢复算法）

启动/恢复时（在 E1 恢复协议之后，19 §7.4）：

1. **拿写所有权**（单实例/会话锁，19 §7.4 已做）。
2. **读 Ledger/事件尾部**，跳过撕裂尾，校验 seq 无洞（19 §7.4）。
3. **对齐 Spec/Plan 版本**：`plan.specVersion` 与当前 Spec 不一致 → Plan `superseded`，不恢复旧 Plan，先重规划。
4. **对账 Task 状态**：
   - `verified`：保留，不重跑；
   - `done`：进入待审查（补双裁决），不重跑实现；
   - `doing`：查最近检查点/pendingCalls：无副作用 → 回 `todo`；有未知副作用 → `blocked/waiting_person`（不自动重试）；
   - `blocked`：保留，按原因重试/问人；
   - `todo`：保留；
   - `dropped`：跳过，不复活（除非新 Plan 新建）。
5. **重算 ready 集**：DAG + writeScope + 预算；不重复已 verified 的前置。
6. **修复不一致**：按 19 §7.5 的恢复表；每处修复写 `recovery`/`recovery_plan` Ledger，不静默。
7. **确定 resumePoint**：第一个未完成 Task（按 DAG/order）；结合最近 PlanCheckpoint。
8. **派发**：优先使用 Task 的**冻结 brief**（若仍与 Spec/Plan 版本一致）；若 Plan/Spec 已变，生成新 brief 并记录差异；不重发旧 prompt（Codex 教训）；用户一句"已从中断点继续"。
9. **恢复后**：更新 checkpoint/事件；SSE 补状态；不显示半截回复（19 §7.4）。

**恢复不承诺**：未知副作用的恰好一次、内存态恢复、跨机恢复（19 §7.6）；只承诺"不自动重试 + 三态标记 + 人可核对"。

### 8.3 预算与 circuit breaker

**预算来源**（不重定义 E1）：
- `Spec.appetite`（时间/范围，18）；E1 的 Step/Turn/Spec/树/全局预算（19 §11.2）；
- E5 负责**分配**：按 Wave/Task 给软预算，保留 headroom（建议 ≥20%，可配）；
- **软上限默认 + 可配置硬熔断**（19 已拍板）；软上限允许最后一个响应完成并计入，报告必须写清。

**触发 circuit breaker**：

| 触发 | 判定 | 默认动作 |
|---|---|---|
| appetite 用尽/逼近 | 时间/token/cost/turn 超软限 | **先 scope hammer**：砍 `may`→`should`→非承重 Task；仍超 → partial |
| 多次验收不过 | 同一 Task 修复 >5 轮/多次双裁决失败 | 裁决：重拆/换方案/partial；不无限重试 |
| 重规划 thrash | 局部 >3 或全局 >2 | 冻结，请人裁决/砍范围 |
| 长任务无交付 | 多个 Wave 无 verified 交付 | 回看 Plan，砍范围或 partial |
| 持续卡死 | 见 §8.5 | 停/重规划/partial |

**默认动作（【拍板 Q2=A】，用户 2026-11-06 授权 lead）**：**自动砍 `may/should` + 未开始低优先 Task → 保留可验证部分 → `outcome=partial` 归档 Spec**；不默认延期、不自动关闭会话（18 §3.7/10 §22）。**砍 `must` 必须人确认**；用户可显式"再给一个预算"（最多一次，18 Q2 建议默认）；之后仍超 → partial。

### 8.4 砍范围（scope hammer）与 partial

**砍范围顺序**（默认，从代价最低开始）：
1. `may` 需求 / 纯优化项；
2. `should` 且非验收必需；
3. 不覆盖任何 Acceptance 的 Task（浪费）；
4. 未开始的低优先 Task（保留已完成/已 verified）；
5. 仍超：**涉及 `must` 的降级必须显式**（must→should/REMOVED + `reason + migration`），并告知用户"哪些不做了、为什么"；**不静默丢**；
6. 剩余范围仍可验收 → 生成 partial Plan/新 Plan，归档 `partial`。

**partial 定义**：
- `Spec.outcome=partial` + `archived`；**会话不关闭**（10 §22）；
- 只对**保留范围**声明完成；未做项在 Handoff/对话中列清（不是"都做完了"）；
- 已 verified Task 的证据保留；partial 不是失败态，是**诚实收口**；
- 可 reopen（新 Spec 版本 + 新 Plan）或开新 Spec；旧记录不删。

### 8.5 卡死/循环检测（E5 计划层）

| 信号 | 建议阈值 | 动作 |
|---|---|---|
| 无 durable progress（无 Task 状态/Evidence/Ledger/心跳） | >60s 提示；>5min 升级 | S2 状态 + 心跳；改派/重规划/问人 |
| DAG 无 ready 且无 in-flight | 立即 | 标 blocked + 原因；重规划/问人 |
| writeScope 死锁（ready 全与在飞冲突） | 一个调度周期 | 等待/重排；超时升级 |
| 同一 Task 修复轮次 | >5（18/19） | 裁决：继续/重拆/BLOCKED |
| 同一 Task 重派/新 attempt | >3 | 拆 Task/换方案/问人 |
| 同一工具同参数重复 | ≥3（19） | 提醒 + 强制重规划 |
| 重规划次数 | 局部 >3 / 全局 >2 | 冻结，请人 |
| 子 Spec 无 summary/完成 | 超阈值 | 父可见 + 中止/重派/问人 |

**原则**：检测到卡死不是"再等等"，而是**显式状态 + 选项**（继续等 / 停止重规划 / 人工接手）；不自动杀、不无限空转。

### 8.6 人工介入点（只在这些时候打扰）

| 介入点 | 触发 | 给用户什么 |
|---|---|---|
| **风险门** | 不可逆/线上/删数据/花钱/影响他人（18 §5.3） | 动作 + 影响 + 回滚方式，确认 |
| **真歧义** | 两种解释导致实质不同动作/产物（13 §5.5） | ≤1 问 + 2–3 选项 + 建议 |
| **预算/partial** | circuit breaker 需要砍 `must` 或需延长预算 | 保留/放弃范围 + 代价 + 建议 |
| **卡死** | 无进展/重复失败/死锁 | 继续等/停止重规划/人工接手 三选一 |
| **未知副作用** | 工具结果 unknown（19 §7.4） | 查外部状态/重试/标记完成 三选一 |
| **用户主动** | 用户问/要求确认/要求解释 | 解释 + 证据指针 |

- 用户不审 Spec/Plan；**不新增审批流**（10 §32）；风险门之外的内部检查自动过；
- **预算/partial 只有"改变交付承诺/砍 must"才打扰**；纯内部砍 `may/should` 按告知或静默处理（不伪装成风险门）；
- 问题格式：1 个问题 + 选项 + 建议；不拿内部词汇考用户（18 §1.1.1）。

### 8.7 归档 / reopen

- **归档条件**：`canArchive(specId)` 唯一入口（18 §5.7）；全部 `must` 有证据/`should` 缺证有理由；没有未决 Critical；Ledger 完整；记忆候选已提交。
- **partial 归档**：`outcome=partial`，记录未做项/原因；会话保持进行中（不自动结束）。
- **reopen**：`verified/archived` 可 reopen（新需求/缺陷）；Spec 升版 + 新 Plan；旧 Task/证据保留；记 Ledger；用户一句告知（10 §25/18 Q5）。
- **不自动归档会话**：Spec 归档 ≠ 会话归档；会话仍按 10 §22（手动归档、只读可恢复）。

---

## 9. 进度真源与 hill chart 投影

### 9.1 进度真源

- **唯一真源**：`sc_tasks.status`（18 §8.4）；派生查询 `COUNT(status)`/未完成列表；
- **不存**：Spec 百分比、Plan 百分比、会话进度字段（18 §8.4）；
- **Spec.status** 是工作流阶段，不是进度；**Task.status** 才能回答"做到哪"；
- 跨 Spec 汇总：只从子 Spec 的 Task 统计/摘要计算，不复制子 Task 到父。

### 9.2 Hill chart 投影（给用户看）

| Hill 阶段 | 判定（E5 内部） | 用户侧表达（示例） |
|---|---|---|
| **上坡（uphill）** | 有未解决的 assumption/open_question/spike；或验收路径未定 | "还在摸方案，有几个点没定" / "先搞清楚 X" |
| **坡顶（crest）** | 范围已定、Task/DAG 已定、无未解关键未知 | "方案定了，开始推进" |
| **下坡（downhill）** | 已有实现 Task `verified`，剩余只剩执行/验证；范围与验收路径明确 | "在按计划做/在验证" |
| **完成** | 全部 `verified` 且 `canArchive` | "做完了，结果如下" |

**计算规则**（确定性，供投影器）：
1. 有 `spike` 未完成 / `open_question` 未决 / 关键 assumption 未验证 → 上坡；
2. 否则 Plan 已定但**还没有任何实现 Task `verified`** → 坡顶；
3. 已有实现 Task `verified`，剩余 `todo/doing` 或只剩 `verify`/审查 → 下坡；
4. 全部 `verified` + canArchive → 完成；
5. 有任何 blocked → 先报"卡住/待你决策"，不报"下坡"。

**禁止**：百分比、燃尽图、内部状态字符串、"Spec 80%"；允许"还剩 N 件"这类可核对表述（不伪造精度）。

### 9.3 汇报粒度

- **事件驱动**：只在 Wave/Task 边界、blocked、风险、完成/partial 时汇报；不逐 Step 刷屏；
- **S2**：执行期间心跳/阶段小结；长任务无新进展 >5s 要有心跳（13/19）；
- **最终**：结果摘要（≤几行）+ 产物/证据指针 + 未决/风险 + 下一步；不贴 Spec/Plan 全文；
- **嵌套**：父会话看子 Spec 摘要/状态（20 §8），不把子对话灌入；用户点会话树才看细节；
- **失败**：说"哪一步没成、卡在哪、可选什么"，不编造完成。

### 9.4 用户可见文案（示例）

| 内部状态 | 可对用户说 | 不要说 |
|---|---|---|
| Plan 生成/重规划 | "我调整一下做法，先把 X 做了" | "Plan revision 2/Spec v3" |
| 上坡 | "还在摸方案，有个点需要确认" | "需求覆盖率 40%" |
| 坡顶 | "方案定了，按三步推进" | "Phase 1/2/3" |
| 下坡 | "在按计划做，最后在验证" | "Task 5/9 done" |
| partial | "先交付能做到的部分；没做的是 X/Y，原因是 Z" | "Spec partial archived" |
| 卡住 | "这一步卡住了，可以继续等/换个做法/你来接手" | "DAG deadlock" |

---

## 10. 失败、恢复与 Ledger 对账

### 10.1 失败分类与处理

| 失败 | 检测 | 处理 | 用户可见 |
|---|---|---|---|
| **实现者 report 四态** | `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`（19 §8.2） | DONE→审查；CONCERNS→审查标注；NEEDS_CONTEXT→补 brief 一次；BLOCKED→控制器裁决 | 视情况 |
| **双裁决失败** | Spec Compliance/Quality | 修复环 ≤5 轮（19 §8.4）；超限裁决/blocked | 一句状态 |
| **发布前失败** | 能力/权限/预算不足 | 换方案/拆 Task/问人；不假装派发 | 视情况 |
| **发布后失败/超时** | completion notice | 四态路由；不自动重试副作用 | 状态 + 选项 |
| **工具结果 unknown** | 三态取消/检查点（19 §7.4） | 标 `blocked/waiting_person`；不自动重试 | 三选一 |
| **权限拒绝** | E1 六步权限 | 结构化拒绝；不绕过 | 可解释拒绝 |
| **依赖过期** | Plan/spec 版本/前置被 drop | 重规划；受影响 Task drop/重建 | 影响交付时说 |
| **预算超限** | §8.3 | circuit breaker/partial | 保留/放弃范围 |
| **崩溃/重启** | 启动恢复 | §8.2；不重跑 verified；unknown 不重试 | "已从中断点继续" |

### 10.2 重试策略

- **允许自动重试**：发布前失败、工具超时且**无副作用**、可幂等操作；最多 2 次，退避/换工具；
- **禁止自动重试**：有副作用且结果 unknown（19 §7.4/§7.6）；权限拒绝；需求冲突；
- **同一 Task attempt**：≤3（建议）；超限 → 拆 Task/换方案/问人，不无限重派；
- **修复环**：≤5 轮（19 已定）；超限按裁决规则（争议/不承重/承重→blocked）；
- **每次重试/重派写 Ledger**（`retry`/`replan`），用户侧不暴露内部计数（除非影响交付）。

### 10.3 未知副作用（硬规则）

- 工具调用前有屏障/检查点（19 §7）；崩溃后 `OUTCOME_UNKNOWN` 不自动重试；
- 相关 Task 标 `blocked`（或 waiting_person）；用户三选一：查外部状态 / 重试 / 标记完成；
- **不把 unknown 当成功**，不伪造 Evidence；恢复后仍 unknown → 保持 blocked；
- 相关 Plan 的后续 Task 不自动开始（依赖未 verified）。

### 10.4 Ledger 对账（E5 视角）

E5 追加的 Ledger kind（建议）：`plan_created / plan_revised / replan(local|global) / scope_change / partial_archive / budget_break / stuck / recovery_plan`；Outcome 与 18/19 共用 `stage/gate/verdict/fix_round/ruling/adjudication/close`。

| 现象 | 可能原因 | 恢复/对账动作 |
|---|---|---|
| Plan revision 与 Task 状态不一致 | 重规划中崩溃 | 以 Ledger 最后 `plan_revised` + 事件为准；未完成的 Task 回 `todo`/`blocked`；写 `recovery_plan` |
| Spec 版本升级但 Plan 未失效 | 收尾/合并中崩溃 | Plan 标 `superseded`；按新 Spec 重规划；不沿用旧 brief |
| Task `verified` 但无 verdict/Evidence | 不应发生（门禁顺序错） | Task 退回 `done` 待审；写 `ruling`/`recovery_plan` |
| Ledger 有 `partial_archive` 但 Spec 未归档 | 收尾中断 | 重放 partial 收口；幂等；不重复写记忆候选 |
| `scope_change` 后旧 Task 仍在跑 | 重规划未取消旧派发 | 停可逆部分；不可逆报告已发生；旧 Task drop；新 Plan 重派 |
| 多份 Plan 同时 active | 数据损坏 | 保留最新 `planRevision`，其余 superseded；写 `recovery_plan` |
| 归档后仍有未完成 Task | 错误归档 | 恢复只读；需继续走 reopen（记 Ledger） |
| 预算计数与 Task 对不上 | 计量/并行尾部 | 以单一计量（19）为准；写 `budget_break` 审计；不修正历史数字 |

- **Ledger append-only**；恢复只追加；`UNIQUE(specId, seq)`；不修改/删除历史（18/19）。
- **偏差必须记账**：任何绕过 Plan 的动作写 `ruling`；"a silent discard is forbidden"（18/19）。
- **不静默丢弃 Task**：drop 必须带原因/替代/影响；已 verified 的 Task 不删。

---

## 11. 评测（对接 E0）

> 17 §7.3 要求 E5 自带：**计划的机器可判定断言 + `t_ckpt`/恢复 case + 预算 `Δ`**。以下满足并具体化。

### 11.1 E5 对 E0 的交付清单

| 交付 | 内容 |
|---|---|
| **L1 断言** | 覆盖/粒度/DAG/writeScope/预算/恢复（§11.2） |
| **≥2 条 L2 case** | 长任务 partial、崩溃续跑、steer 重规划、writeScope 冲突（§11.3） |
| **`Δ` 消融** | 关闭 Planner/CircuitBreaker/Replan/Checkpoint 的对照臂 |
| **指标** | §11.4；先测基线，目标 TBD（17 §6） |
| **恢复 case** | `t_ckpt` + 不重复副作用 + 不重跑 verified（17 §7.3） |

### 11.2 L1 机器可判定断言（建议新增 L1-16~L1-19）

| # | 断言 | 判定 |
|---|---|---|
| **L1-16 覆盖/粒度** | 每个 `must` Requirement 至少 1 Task 覆盖；每个 Task 有 acceptance/evidence/writeScope；无孤儿；Task 通过最小可测 6 条 | 结构检查 |
| **L1-17 DAG/写域** | 无环；`dependsOn` 存在；并行 Task 写域不相交；重叠已串行 | 图算法 + 路径比较 |
| **L1-18 预算/partial** | 超 appetite 触发 breaker；partial 只声明保留范围；`must` 降级有 delta + reason；无"延期代替砍范围" | 注入预算 + 检查 outcome/delta |
| **L1-19 恢复** | 崩溃后不重跑 verified；unknown 不自动重试；resumePoint 正确；`t_ckpt` 在阈值内；恢复写 Ledger | 故障注入 + 事件/ledger 检查 |

**补充**：Plan/版本断言（`plan.specVersion` 锁、局部 revision 不升 Spec、全局 delta 升版）并入 L1-16/18。

### 11.3 L2 场景（个人助理；WITH/W/OUT/Δ）

| Case | 步骤（3–5 步） | 隐藏期望 | graders | W/OUT 消融臂 |
|---|---|---|---|---|
| **E5-L2-01 超预算 partial** | ①"帮我把下季度复盘资料整理成报告，再加一版可视化"（appetite 小）②执行到一半预算逼近 ③用户不追加预算 | 触发 breaker；砍掉可视化/低优先项；已做的验证部分以 partial 收口；明确说没做什么；不自动延期/不假装完成 | `state_delta`（Spec outcome=partial/保留范围 acceptance）、`forbidden`（未批准的新范围/延期）、`regex`（说明未做项）、`file_exists`（保留产物）、`trajectory_shape`（有 scope_change Ledger） | 关闭 circuit breaker → 继续超预算/不收敛；测"砍范围"的价值 |
| **E5-L2-02 崩溃续跑** | ①"把会议记录整理成周报并提取待办"②Task 执行中崩溃/工具 unknown ③重启继续 | 不重复写文件；`verified` 不重跑；unknown 标 blocked；从第一个未完成 Task 继续；用户看到"已从中断点继续" | `file_exists`（文件=1）、`state_delta`（任务状态/证据）、`forbidden`（重跑 verified/重复写=0）、`trajectory_shape`（恢复/核对） | 关闭 checkpoint/恢复 → 重复/丢状态；测恢复价值 |
| **E5-L2-03 steer 局部重规划** | ①"整理下周日程"②执行中"先别排日程，先列清单"③确认后继续 | 只改当前 Plan（局部/必要时全局）；不悄悄改验收；旧 Task drop/新 Task；不重做已完成；用户只看到一句调整 | `state_delta`（Plan revision/Task 集）、`forbidden`（未确认改需求）、`regex`（调整说明）、`trajectory_shape`（无全量重跑） | 关闭 replan → 按旧 Plan 做完或丢 steer；测重规划价值 |
| **E5-L2-04 写域冲突** | ①同一批两个任务都要改同一个文件 ②并行调度 | 规划时发现写域重叠 → 串行/合并；运行无并发写冲突/无丢失；冲突被 Ledger 记录 | `tool_order`/`state_delta`（串行）、`forbidden`（同时写）、`file_exists`（最终内容正确） | 关闭 writeScope 检查 → 并发写坏；测写域判定的价值 |

> 可选 L2：DAG 死锁检测、reopen、跨 Spec 依赖；V1 至少 3 条。

### 11.4 指标（先基线，目标 TBD）

| # | 指标 | 口径 | 方向 |
|---|---|---|---|
| **E5-M01** | 计划覆盖率 | 被 Task 覆盖的 `must` Acceptance / 总 `must` | 100% 才可派发 |
| **E5-M02** | 粒度返工率 | 派发后需拆/并/重定义的 Task / 已派发 Task | 越低越好 |
| **E5-M03** | 重规划 churn | 每 Spec 的局部/全局 replan 次数；同因重复率 | 越低越好 |
| **E5-M04** | 预算命中 | appetite 超限率、partial 率、保留 headroom、到限动作 | 超限率/partial 率按基线 |
| **E5-M05** | 长任务结果 | 完成/partial/blocked 比例；未完成原因 | 完成率高、partial 有说明 |
| **E5-M06** | 卡死检测 | 发生/检出数、检出时延、误报、恢复成功 | 检出快、误报低 |
| **E5-M07** | 并行/写域 | 并行利用率、规划时发现冲突数 vs 运行时冲突数 | 运行冲突=0 |
| **E5-M08** | 恢复 | 重复副作用=0、verified 重跑=0、resume 成功率、`t_ckpt` | 硬指标 0 重复 |

**映射 E0**：L1-16~19（新增）；L2 E5-01~04；L3 指标并入 17 的 M 系列（不另造总表）。所有目标先采基线（17 §6.1），不拍脑袋。

### 11.5 门禁

- 触发 E0 的改动：Planner 拆分规则/阈值、replan 策略、budget/circuit breaker、checkpoint/恢复、writeScope/DAG 调度、进度投影；
- 默认：`Δ` 不得显著为负；恢复/重复副作用指标必须为 0；L1-16~19 必须全绿；
- 失败处理：阻断合并/进入下一里程碑；记录原因与回滚（17 §5）。

---

## 12. V1 / P1 边界

### 12.1 V1 做（E5 相关）

| 项 | 内容 | 依赖 |
|---|---|---|
| 四档规模判定 | trivial/one-session/epic/project；默认下探；T0 不建 Plan/Task DAG | 18 Spec |
| Spec→Plan→Task | 回链/版本锁；Plan 只写边界/接口/顺序/验证；Task 最小可测 6 条 | 18 |
| 拆分算法 | 拆子 Spec 判据 + Task 拆分 + 覆盖/质量门 | 18 §7 |
| 规划输入 | EARS/RFC、记忆、约束、non-goals、appetite；缺输入 clarify/spike/block | 12/18 |
| DAG/并行 | dependsOn、ready 集、writeScope 冲突、≤2 实现/≤2 审查/≤3 Spec | 19/18 |
| 重规划 | 局部 PlanRevision、全局 Spec delta+新 Plan；steer/queue 关系；防抖/预算 | 18/19 |
| 长任务 | PlanCheckpoint、断点续跑、appetite/circuit breaker/partial、卡死检测、人工介入、归档/reopen | 18/19 |
| 进度投影 | Task 真源、hill chart、汇报粒度；不暴露内部词 | 10/18 |
| 失败/恢复 | 四态、重试策略、unknown、Ledger 对账 | 18/19 |
| 评测 | L1-16~19、L2 3–4 条、指标、E0 门禁 | 17 |

### 12.2 P1 / 暂缓

| 项 | 为什么后置 |
|---|---|
| 自动跨 Spec 重组/合并/拆分 | 10 §16/§30 要求动态但 V1 固定会话；自动重组风险高 |
| 多 Plan 方案对比/下注（Shape Up betting） | 单用户单机，先做单 Plan |
| 关键路径/资源 leveling/成本预测 | 需要真实执行数据；V1 先可用 |
| 自动并行度调优/学习型拆分 | 先有基线；避免过拟合 |
| 跨 Spec 全局优化/依赖重排 | V1 只保留基本 `depends_on` |
| 子代理深度 >1 / 大规模并行 | 19 固定 depth=1/并发小；P1 再评估 |
| 用户可见计划编辑/甘特图/燃尽图 | 用户不感知 Spec/Plan（10 §32） |
| 自动时间估算/日历承诺 | appetite 是输入不是估算（Shape Up）；不承诺工时 |
| 自动归档/自动关闭会话 | 10 §22：会话由用户手动归档；circuit breaker 只关 Spec 不关会话 |
| Spec supersedes / 跨 Spec 取代 | 18 Q1 未启用；P1 |
| 复杂资源调度（外部 API 配额/多环境） | V1 仅本地单机；P1 |
| 自动生成计划模板/技能市场 | 与核心判定无关 |

### 12.3 与 18/19 的已知对齐项

| 项 | 状态 | 处理 |
|---|---|---|
| Plan `planRevision`/`supersedesPlanId`；Task `dependsOn`/`acceptanceKeys`/`boundary` | **【拍板·采纳】待 18 v0.3 并入** | 已由 lead 拍板；18 v0.3 吸收前用附属表/投影兼容 |
| trivial 与"一会话一 Spec" | **【拍板 Q1=A】待 18 v0.3 确认表述** | T0 不建 Plan/Task DAG、Spec 按需创建（"至多一个"）；若 18 坚持必有，T0 建极简 Spec |
| 子 Spec 嵌套深度/数量 | 【建议·本稿】软护栏 | 不硬性限制；超限需理由 |
| PlanCheckpoint 存储 | 【待对齐】18 | 可先作为 E1 事件投影，不新增表 |
| 预算数字 | TBD | 19 §11.2 已给默认；M2 基线后校准（17 §6） |
| `partial` 自动砍范围 | **【拍板 Q2=A】** | 自动砍 `may/should` + 未开始低优先；砍 `must` 必须人确认；可再给一次预算 |

---

## 13. 拍板记录（用户 2026-11-06 授权 lead；Q1/Q2/Q5=A，Q3/Q4 默认）

> `用户 2026-11-06 授权 lead 拍板`；本稿 v0.1 已按以下决定写回正文。选项保留作决策记录，不再待回答。

### Q1｜四档规模判定与 trivial 处理 ——【拍板=A】

- A（采纳）：按 §4.1 的 BMAD 四档；**T0 不建 Plan/Task DAG、Spec 按需创建**（与 18 解释为"至多一个"）；不确定时默认下探。
- B：每个会话必须先建 Spec（即使 T0），不建 Plan；更重但一致。
- C：不用四档，统一按 T1 起步；简单但会把小事做重。
- **拍板：A（2026-11-06，用户授权 lead）**。影响：小事体验、18 对齐；需 18 v0.3 确认"按需创建"表述。

### Q2｜超预算的 circuit breaker 默认动作 ——【拍板=A】

- A（采纳）：默认**自动砍 `may/should` + 未开始低优先 Task**，生成 `partial` 并告知；**砍 `must` 必须显式确认**（改验收）；允许用户"再给一个预算"一次；不默认延期。
- B：任何砍范围都先问用户（更慢，打扰多）。
- C：允许自动延期（与 Shape Up/18 冲突）。
- **拍板：A（2026-11-06，用户授权 lead）**。影响：长任务收口、用户预期；对应 18 Q2。

### Q3｜并行与 WIP 默认 ——【默认=A】

- A（默认）：同 Spec 实现 Task 并发 ≤2、审查 ≤2、同时 executing 的 Spec ≤3；同 writeScope 强制串行；不确定串行。
- B：全串行（最稳、慢）。
- C：更高并发（2→4/无 Spec 上限），需要更强冲突检测。
- **默认推进：A（2026-11-06）**。影响：长任务速度/冲突率；可配置。

### Q4｜重规划边界 ——【默认=A】

- A（默认）：**局部**可改 Task 拆分/顺序/依赖/实现方式/writeScope 小调整（Spec 版本不变，planRevision+1）；**改 Acceptance/范围/non-goals/appetite 必须走 Spec delta + 版本升级**，影响交付时告知用户。
- B：所有重规划都升 Spec 版本（更可追溯、更重）。
- C：允许局部改验收（不建议；破坏 Spec 权威）。
- **默认推进：A（2026-11-06）**。影响：重规划成本/可追溯性；对应 13 §11.3。

### Q5｜Plan 版本扩展是否并入 18 ——【拍板=A】

- A（采纳）：采纳 `planRevision`（同一 Spec 版本内局部重规划）+ `supersedesPlanId`；全局变化才新建 Plan/升 Spec 版本；请 18 v0.3 并入。
- B：Plan 只在 Spec 版本变化时新建；局部重规划也升 Spec 版本（重、但简单）。
- C：不记录 Plan 版本，只记 Ledger（追溯弱）。
- **拍板：A（2026-11-06，用户授权 lead）**。影响：18 对象模型；已列入 18 v0.3 吸收清单；未并入前用附属表兼容实现。

> 以上 5 条之外的工程默认（表名/字段长度/调度实现/阈值数值）不占用户拍板；由实现阶段按设计文档决定并记录。

---

## 14. 与上游对应、风险、待核实

### 14.1 对应关系

| 本文 | 上游 |
|---|---|
| Spec/Plan/Task 层级、回链、状态 | 18 §3.1–§3.7、§4.2/§4.6、§8.4 |
| 拆分判据、组织嵌套/执行平铺 | 18 §7、10 §30 |
| EARS/RFC2119/验收可判定 | 18 §3.3、相邻调研 §1 |
| appetite/circuit breaker/partial/hill chart | 18 §3.7、相邻调研 §5.1（Shape Up） |
| 检查点/恢复/三态/unknown | 19 §7、§11.1 |
| 子代理与任务闭环/双裁决/修复环 | 18 §4.4–§4.5、19 §8 |
| 预算/卡死/指标 | 19 §11.2–§11.4 |
| 上下文注入/父只读摘要 | 20 §1.2、§8 |
| E0 断言/L2/Δ | 17 §2–§7 |
| Spec 不可见/投影 | 10 §32–33、18 §1.1.1 |
| BMAD 四档/boundary-first/Implementation Notes | 调研 S3/S4/S6 |

**主要借鉴来源（只借机制，不照搬形态）**：

| 来源 | 借什么 | 本稿落点 |
|---|---|---|
| BMAD（`sdd-frameworks-survey` §2.4） | trivial / one-session / epic / project 四档；默认走最轻档 | §4.1/§5.4 |
| Shape Up（`adjacent-frameworks` §5.1） | appetite、circuit breaker、Scopes、hill chart、scope hammer | §8.3–§8.4/§9.2 |
| cc-sdd（`sdd-frameworks-survey` §2.7） | boundary-first（`_Boundary:_`/`_Depends:_`）、Implementation Notes | §3.2/§6.3/§14.1 |
| Superpowers（`superpowers-mechanisms` §3/§4） | writing-plans 的 plan 回链/最小可测任务、双裁决、修复环、Ledger 恢复 | §3.4/§7/§10 |
| Temporal（`adjacent-frameworks` §4.2） | 事件历史=真相、LLM 调用=Activity 先落库、恢复重放不重算 | §8.1–§8.2/§10.4 |
| DDD（`adjacent-frameworks` §5.3） | Bounded Context/术语变化作为拆分判据 | §4.3 |
| EARS + RFC 2119（`adjacent-frameworks` §1.1/§1.3） | Requirement 句型与 must/should/may 强度 | §5.2 |
| 18/19/20/17 | Spec/Plan/Task、三屏障/预算/子代理、上下文预算、评测门禁 | 全文 |

**不借**：OpenSpec 的目录+git 形态、Kiro 三文档强制、BMAD 14 种文档/角色、Superpowers 全量提示词门禁/HARD-GATE、Shape Up 六周 cycle/betting table、Temporal server/SDK 生态、DDD context map 七种模式——对单机个人助理过重（18 §9、10 §31）。

### 14.2 主要风险

| # | 风险 | 应对 |
|---|---|---|
| R1 | 过度拆分/过度规划（小事做重） | 默认下探 T0/T1；软护栏；E0 粒度返工率监控 |
| R2 | Plan 与 Spec 漂移 | 版本锁；冲突 `ruling`；重规划强制覆盖检查 |
| R3 | 并行写冲突 | writeScope 声明 + 规划/派发双重检查；不确定串行 |
| R4 | 预算/partial 被用户理解为"失败" | 投影讲清"保留/没做/为什么"；partial 不等于会话结束 |
| R5 | 重规划 thrash | 防抖/上限/同因升级；E5-M03 监控 |
| R6 | 卡死检测误报/漏报 | 多信号 + 人工三选一；E5-M06 基线校准 |
| R7 | 恢复后重复副作用 | 三屏障 + unknown 不重试；E5-M08 硬指标 0 |
| R8 | Plan 版本扩展与 18 不一致 | 已拍板采纳，待 18 v0.3 并入；未并入前用附属表/投影兼容 |
| R9 | 用户看到内部词 | 投影文案扫描（I8）；E0 `regex` 负例 |
| R10 | `partial` 自动砍 must 侵犯用户预期 | 砍 must 必须确认（§8.4）；不静默 |

### 14.3 待核实 / 不做假设

1. BMAD 四档的精确触发阈值（trivial/one-session/epic/project）——调研只给结构，具体边界需用真实任务校准（不写成定论）。
2. Superpowers "任务 2–5 分钟" vs "最小可测试单元"的自相矛盾——本稿采用**最小可测单元**，不采用 2–5 分钟。
3. Shape Up 的 cycle/betting table 不适用单机个人助理——只借 appetite/circuit breaker/scopes/hill chart 概念。
4. Plan 版本/`dependsOn`/`acceptanceKeys`/`boundary`——**已拍板采纳**，待 18 v0.3 并入；未并入前用附属表/投影兼容（不假设 18 已改）。
5. 预算/阈值（并发、重试、卡死、重规划上限）——工程默认，M5 基线后校准；不是产品承诺。
6. `partial` 自动砍 `may/should` 已按 **Q2=A** 拍板；砍 `must` 仍需人确认。

### 14.4 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0 | 2026-11-06 | 首版：规划层级/拆分算法/规划输入/重规划/DAG/长任务/进度投影/失败恢复/评测/V1-P1/5 问 |
| **v0.1（本稿）** | 2026-11-06 | 按**用户 2026-11-06 授权 lead 拍板**写回：Q1=A（四档/trivial 不建 Plan、Spec 按需创建）、Q2=A（超预算自动砍 may/should→partial，砍 must 需确认，可再给一次预算）、Q5=A（planRevision+supersedesPlanId）；Q3/Q4 默认推进；列出需 18 v0.3 吸收的 `planRevision`/`dependsOn`/`acceptanceKeys`/`boundary` |

