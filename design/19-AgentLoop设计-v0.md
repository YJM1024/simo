# Agent Loop 设计 v0.1 —— 围绕 Spec 生命周期的连续步进内核

> **状态**：讨论稿（v0.1，供评审，**不是定稿**；只写设计，不写代码）。
> **日期**：2026-11-06
> **版本**：v0.1（2026-11-06）
> **授权与拍板**：**用户 2026-11-06 已授权 lead 拍板**；v0 遗留的 5 个问题（Q1–Q5）已由 lead 定案，见 §12.3。本版只按拍板更新本文，不改其他文档、不写代码。
> **上游依据**：
> - [`10-设计对话记录.md`](10-设计对话记录.md) §27–32（自研内核八题、SDD、Spec 不可见）
> - [`13-交互协议-候选方案.md`](13-交互协议-候选方案.md)（三速、四类消息、抢占、撤回、Intent Frame、中断点、降级）
> - [`14-总体设计-v1.md`](14-总体设计-v1.md)（三栏、会话模型、执行原则、V1 范围）
> - [`16-架构对照表.md`](16-架构对照表.md)（D3 Loop 结构、D4 会话、D5 消息/事件、D12 权限；§3 借鉴清单）
> - [`18-SDD流程-v0.md`](18-SDD流程-v0.md)（SpecCore **v0.2**：对象、生命周期、门禁、三文件、双裁决、修复环；字段/表名/`canArchive` 对齐见 §13.1b）
> - [`20-上下文工程-v0.md`](20-上下文工程-v0.md)（E2：上下文组装/压缩；本稿 §9 的接口与不变量交给它落地）
> - [`17-评测设计-v0.md`](17-评测设计-v0.md)（E1 必须自带判定点清单 + L1/L2 用例）
> - `research/codex-mechanisms.md`（Thread/Turn/Item、steer/queue、goal、预算）
> - `research/claude-agent-sdk-mechanisms.md`（五类消息、Result 五态、六步权限、子代理/预算）
> - `research/dsh-mechanisms.md`（turn/step、五段工具管线、三屏障、三态取消、事件溯源）
> - `research/superpowers-mechanisms.md`（spec 权威/plan 回链、三文件交接、双裁决、修复环 ≤5）
>
> **标记约定**：【拍板】= 上游已由用户确认（含用户 2026-11-06 授权 lead 拍板的 Q1–Q5）；【借鉴】= 从四家机制借鉴、我们改造后使用；【讨论中】= 本稿提出的候选，可推翻；【待核实】= 证据不足或依赖未定；【假设】= 本稿为推进设计而采用的临时前提（会被后续评审替换）。
>
> **v0.1 变更（2026-11-06）**：按「用户 2026-11-06 授权 lead 拍板」把 Q1–Q5 定案并写回正文：Q1=主 Loop 只读+沟通+派发+候选（§6.6）；Q2=steer 仅当前 Spec，跨 Spec 走 queue（§5.2）；Q3=软上限默认+可配置硬熔断（§11.2）；Q4=`OUTCOME_UNKNOWN` 不自动重试、阻塞并给三选一（§7.4/§11.1）；Q5=子代理默认异步结算，仅短任务阈值内或用户明确要求可阻塞（§8.1/§8.5）。同时按 **design/18 v0.2** 对齐 Spec 字段/门禁/表命名（§13.1b 对齐表；差异标「待对齐」）。
>
> **一句话**：Loop 不是一个"ReAct 大循环"，而是**围绕 Spec 生命周期运转的两层循环**——外层负责"人随时插话、可撤回、steer/queue"，内层负责"组装→决策→执行→观察→更新→判断"；所有事实先落事件日志再给模型看，所有副作用受三屏障检查点与工具管线约束，所有"做完了"必须过验收门。

---

## 0. 一分钟读法

1. **三层结构**：会话（= 一个 Spec）→ Turn（外层推进单元，13 的「步」）→ Step（内层单步循环）。Spec 生命周期跨 Turn，Turn 内可跑多个 Step。
2. **一个 Loop 只做六种决策**：回答 / 追问 / 调工具 / 派发 / 等待 / 收尾。每种决策有明确的产出、出口与证据要求；不存在第七种"再想想"。
3. **外层连续交互**：任何消息 1s 内 S0；改变性消息走**快判→撤回/抢占**，普通补充在下一个抢占检查点吸收；steer 并入当前 Turn，queue 排到下一 Turn，用户看不到"排队"。
4. **内层单步**：组装（含规则重注入与单一 token 计量）→ 决策 → 执行（工具管线/派发）→ 观察（结果先落日志）→ 更新（Frame/Task/Spec/ledger/预算）→ 判断（继续/停/改/等）。
5. **Spec 不可见**：Loop 的所有 Spec 操作只投影成"方案/问题/进度/结果/确认"；事件流不出现 Spec/规格/验收标准等词，也不让用户操作生命周期。
6. **证据与门禁**：Task 的 `done` ≠ `verified`；双裁决（Spec 合规 × 质量）都通过且证据齐备才算；修复环 ≤5 轮，超限由控制器裁决并记账。
7. **耐久性**：三屏障 fail-closed 检查点（模型请求前 / 顶层副作用前 / 逐步前）+ 三态取消（`OUTCOME_UNKNOWN` / `NOT_STARTED` / `ABORTED_BEFORE_DISPATCH`）+ ledger 恢复协议；崩溃后**不自动重试有副作用的操作**。
8. **本稿交付**：消息/状态模型、单步循环、连续交互、工具管线、检查点/恢复、子代理接口、SSE 事件流、失败/预算/指标、V1/P1 边界，以及 5 个已由 lead 拍板的问题（Q1–Q5，见 §12.3；用户 2026-11-06 授权）。

---

## 1. 定位与边界

### 1.1 Loop 是什么、不是什么

| 维度 | 结论 |
|---|---|
| **是什么** | 秘书（主 Agent）的**执行内核**：把"人的一句话 / 一个 Spec 阶段 / 一次子代理结算"推进成"回复、工具调用、派发、等待、收尾"的确定状态机；它负责时序、证据、预算、恢复，不负责业务语义。 |
| **不是什么** | 不是用户可见的"需求管理器"（Spec 不可见）；不是任务调度器（任务是 Spec 的 Task，调度是 M5 的事）；不是上下文压缩器（属 E2）；不是提示词系统（属 E3）；不是规划器本身（属 E5）；不是权限系统本身（权限求值在 D12/M2，本稿只定义管线位置与失败语义）。 |
| **与"记忆优先"的关系** | Loop 每步从记忆视图组装上下文；Loop 的结论只能以**候选**写回记忆，不能直写公共层（12 §5）。 |
| **与"一个秘书"的关系** | 只有秘书跑主 Loop；专家实例只执行任务（brief→report），不拥有面向用户的 Loop，不直接对用户说话。 |

### 1.2 三层结构与术语

> 术语撞车说明：13 的「步（step）」指**交互单元**；本稿为避免与内层循环撞名，把交互单元改称 **Turn（轮）**，内层原子循环叫 **Step（单步）**。这是本稿唯一对 13 的改名【讨论中】，评审时需确认。

| 层 | 单位 | 边界 | 生命周期 | 谁推进 | 用户可见 |
|---|---|---|---|---|---|
| **L0 会话 / Spec** | 会话 = 一个 Spec（18 §3.2） | 从会话建立到归档 | `draft → confirmed → planned → executing → verifying → verified → archived`（可 reopen） | 秘书 + SpecCore 门禁（18 §5） | 否（只看到会话/子会话与对话投影） |
| **L1 外层交互** | **Turn（轮）** | 一个目标从提出到"有结论 / 等待 / 被撤销" | `created → running → waiting / closed`（附 reason） | 外层交互：用户消息、steer/queue、撤回、歧义确认 | 是（对话流） |
| **L2 内层循环** | **Step（单步）** | 一次"组装→决策→执行→观察→更新→判断" | `pending → assembling → deciding → executing → observing → updating → judging → done` | Loop 自身 | 部分（流式段、执行轨迹折叠） |
| **L3 最小单元** | **Item** | 一条消息 / 一次工具调用 / 一个状态变更 / 一张检查点 | 追加式，不修改（失效用 `invalidated`/surface 替换） | 各处产生，单写者落库 | 部分（对话或执行轨迹） |

**三条组织规则**（沿用已拍板）：

1. 一个会话 = 一个 Spec；子会话 = 子 Spec；**组织上可嵌套、执行上平铺**（18 §7）。
2. 每个 Turn / Step / Item 都带 `sessionId`（归属唯一）与 `specId@version`（绑定的 Spec 版本）（13 §11.7；18 §3.2）。
3. Spec 的父子关系只影响"读什么、排期、展示、验收顺序"，**不影响 Loop 是否递归执行**；Loop 不按 Spec 树递归派发。

### 1.3 Loop 与 Spec 生命周期的关系（核心表）

> 这是本稿的主轴：**Spec 阶段决定"这一轮 Loop 允许做什么"**；Loop 每完成一次收尾，就尝试通过 SpecCore 的门禁推进阶段；门禁不满足则停在原阶段并投影成一句对话（"还差一个信息/还要你确认"）。

| Spec 阶段 | Loop 的本阶段目标 | 允许的决策 | 明确禁止 | 进入下一阶段的条件（由 SpecCore 判定） | 用户侧投影（示例） |
|---|---|---|---|---|---|
| `draft` | 把需求/约束/验收抽成结构化条目，消解真歧义 | 回答、追问、只读工具（查记忆/查文件/检索） | 派发写操作；建 Plan；任何副作用 | 18 §4.1/§5：结构校验通过（每条 Requirement ≥1 Scenario + Acceptance）、无高风险未决 | "我理解你要的是……对吗？" |
| `confirmed` | 生成/校验 Plan 与 Task（怎么做） | 追问、只读工具、内部 Plan 生成（state_change） | 派发执行；写文件；调副作用工具 | 18 §4.2/§5：覆盖检查通过、Plan 回链当前 Spec 版本 | "我准备拆成 3 步做，先……" |
| `planned` | 派发第一个可执行 Task | 派发、只读工具、追问 | 未派发前直接做；跳过 brief | 18 §5：Task 有 brief/writeScope/requiredEvidence，首个 Task 进入 doing | "已经安排下去，先做第一步：……" |
| `executing` | 推进 Task、收集证据、处理阻塞/修复环 | 全部六种（受任务 writeScope 与权限约束） | 越过 writeScope；无证据宣告完成 | 18 §4.3–4.5/§5：全部 Task done + 每 Task 有 Evidence + 无未处置 Critical | "这一步做完了，结果如下……" |
| `verifying` | 双裁决 + 证据核对（只读/评审派发） | 回答、追问、调只读工具、派发 review、等待、收尾 | 派发新的写任务（除非 reopen） | 18 §4.4/§5：Spec Compliance ✅ + Quality Approved + Evidence 齐 | "我在核对结果，确认没问题就给你结论。" |
| `verified` | 收尾：写回候选记忆、生成 Handoff/结论 | 回答、收尾、只读工具 | 开新执行；直接写公共记忆 | 18 §4.6/§5.7：**`canArchive(specId) == true`**、Handoff 完整、记忆候选已提交；`outcome=complete/partial`（circuit breaker 时为 partial） | "已经完成。结论是……，需要的话我可以展开细节。" |
| `archived` | 只读：回答查询、按需跨会话取用 | 回答、只读工具、reopen 请求 | 任何写入/执行 | 用户/秘书显式 reopen（指 18 §11 的 Q2，不是本稿 Q2）；归档只走 `canArchive`，`outcome=partial` 时说明"哪些没做、为什么" | "这件事已经归档，你随时可以让我重新打开。" |
| `blocked`（异常态，非生命周期主链） | 停在原地等人/等外部，不假装推进 | 回答、追问、收尾（给出阻塞原因与建议） | 自动绕过阻塞继续 | 阻塞条件消失或人给出裁决；记 Ledger | "这一步卡住了：…… 需要你定一下。" |

**补充规则**：

- **Loop 不自己做 Spec 状态迁移**：迁移由 SpecCore 的“阶段状态机 + 门禁”执行（18 §5.1）；Loop 只做“尝试推进”并处理拒绝（把拒绝投影成对话）。
- **阶段越界一律拒绝**：例如 `planned` 阶段收到副作用工具调用请求 → 权限/阶段判定拒绝（fail-closed），并记 Ledger，不静默降级。
- **阶段与进度分开**：`Spec.status` 是工作流阶段；进度 = `sc_tasks.status` 统计（18 §8.4）；Loop 不维护第二份进度。
- **Spec 升版 → 冻结失效**：Frame 里冻结的 `specVersion` 与当前版本不一致时，当前 Turn 的“派发/收尾”决策必须作废重算（回 `draft/confirmed` 做增量确认），已执行的副作用按检查点处理（18 借鉴 B7：Spec 权威、Plan 论证）。
- **对齐 design/18 v0.2**：Spec 字段新增 `outcome / appetite / nonGoals[] / rabbitHoles[] / glossary[]`，Spec 本身是记忆的 `kind=spec` 内部类型；归档唯一入口是 **`canArchive(specId)`**（18 §5.7）；Requirement 使用 **EARS 五句型 + RFC 2119 `strength`**，Acceptance 的 `strength` 决定缺证据时是硬阻塞/警告/不要求。本稿的阶段表与门禁调用已按 v0.2 命名；**Loop 如何消费 `appetite`（派生 Turn/Spec 预算与 circuit breaker 触发）待与 E5/18 §3.7 对齐**（§13.1 标「待对齐」）。

### 1.4 Loop 在 SDD 七步流程中的位置（对齐 18 §4）

| 18 的 SDD 步 | Loop 的角色 | 本稿覆盖 |
|---|---|---|
| ① Spec 建立/更新 | 把用户消息/澄清回答变成 Spec delta（经单写者） | 外层交互 + 决策（回答/追问）+ 收尾更新 |
| ② Plan | 生成/修订 Plan/Task（state_change） | 决策“派发/收尾”里更新 Plan；不展开规划算法（E5） |
| ③ 执行 | 派发 expert、观察结算、处理进度/阻塞 | 决策“派发/调工具/等待/收尾” + 工具管线 + 子代理接口 |
| ④ 双裁决 + 证据绑定 | 派发 reviewer、校验两个 verdict、校验证据 | 子代理接口 §8；验收门在 SpecCore |
| ⑤ 修复环 + Ledger | 控制 ≤5 轮修复、scoped re-review、超限裁决 | §8.4；Ledger 写入 §7.5 |
| ⑥ 收尾更新 Spec + 写回记忆 | 收尾决策、候选记忆、Handoff | §4.3 收尾 + §4.6 更新 |
| ⑦ 对话汇报 | 外层投影（只给摘要 + 指针，不暴露 Spec） | §5 / §10.6 / §11 |

### 1.5 与上游文档的边界

| 本稿回答 | 不在本稿（去哪） |
|---|---|
| 主循环状态机、决策/终止/中断、steer/queue、工具管线、检查点/恢复、子代理接口、SSE 语义、预算/指标框架 | 上下文组装算法与压缩细节 → **E2/design/20（已生成）** |
| Loop 与 Spec 阶段的门禁调用关系 | SpecCore 对象/表/门禁实现 → **design/18**；E5 规划/长任务算法 |
| 事件类型与续接语义 | 具体传输实现（SSE 编码细节）→ M1 工程实现 |
| 权限在管线中的位置与失败语义 | 六步权限完整判定矩阵 → **16 D12/M2** |
| 评测接口（判定点/用例） | 评测框架与 grader → **design/17 E0** |

### 1.6 核心不变量（本稿新增/承接，必须可测）

| # | 不变量 | 判定方式（建议） |
|---|---|---|
| **INV-1** | **模型可见 ⟺ 已记录**：任何进入模型请求/上下文的内容，必须先有一条 durable 事件；不存在"内存里有、日志里没有"的模型可见内容 | 请求 envelope 哈希 + 日志 seq 对账 |
| **INV-2** | **单写者**：会话/消息/事件/检查点/ledger 的所有写走同一命令入口；读用快照 | 并发写测试；第二个进程被文件锁拒绝（M1） |
| **INV-3** | **每个流恰好一个终止事件**：Turn、消息流、模型流都有且只有一个终态（成功/失败/中断/预算等） | 事件序列断言；尾随事件不得丢（Claude 教训） |
| **INV-4** | **撤回只改视图，不删日志**：撤回 = surface 区间替换 + 对话只显示“已撤回”；原文仍可审计 | 重放后视图一致；审计可查原文 |
| **INV-5** | **没有证据不算完成**：完成声明必须引用本轮新产生的 Evidence；双裁决缺一不可 | 门禁测试；伪证据注入负例 |
| **INV-6** | **无静默丢弃**：任何绕过门禁/偏离 Plan/超限继续的动作必须记 `ruling`/`adjudication`；Minor finding 也要落 Ledger | Ledger 覆盖审计 |
| **INV-7** | **Spec 不可见**：用户可见事件与文案不得出现 Spec/规格/需求文档/验收标准/基线/增量，也不得暴露内部状态机 | 文案规则扫描 + 前端事件抽查 |
| **INV-8** | **用户输入不丢**：每条用户消息先落事件再处理；最终被某 Frame revision 吸收，或显式标注“未纳入及原因” | 消息↔事件↔Frame 三方对账（13 I2） |
| **INV-9** | **有副作用的结果未知，不自动重试**：恢复/重试只允许只读或幂等操作；其余标 `OUTCOME_UNKNOWN` 并停下核对 | 故障注入 + 重复副作用检查 |
| **INV-10** | **预算单一计量**：所有消费者（压缩/预算/UI/评测）读同一个 token/cost 计量服务 | 计量对账（16 D6/M1 A12） |

---

## 2. 总览

### 2.1 一张图（外层 + 内层 + Spec 阶段）

```text
                       用户消息 / 事件（steer / queue / 确认 / 停止）
                                      │
                                      ▼
┌──────────────────────────── 外层：连续交互（Turn 级） ─────────────────────────────┐
│  S0 收到信号 → 合并窗口 → 快判（撤回?）→ 慢判（分类/歧义/Frame 更新）              │
│       │                     │                        │                             │
│       │                     ├─ 撤回未完成回复（surface 替换）                       │
│       │                     ├─ steer：并入当前 Turn 的 next-step 输入               │
│       │                     └─ queue：排到下一 Turn，不打断当前                     │
│       ▼                                                                             │
│  Turn 状态：created → running →（waiting | closed）                                 │
└───────────────────────────────────────┬────────────────────────────────────────────┘
                                        │ 每个 Step 的输入 = Frame 执行视图 + 待吸收输入
                                        ▼
┌──────────────────────────── 内层：单步循环（Step 级） ─────────────────────────────┐
│  ① 组装 → ② 决策 → ③ 执行 → ④ 观察 → ⑤ 更新 → ⑥ 判断                              │
│  (context)  (六分支)  (工具/派发)  (结果/事件)  (Frame/Task/Spec/ledger/预算)       │
│      ▲                                    │                                         │
│      └────────── 继续 / 停 / 改 / 等 ◀────┘                                         │
└───────────────────────────────────────┬────────────────────────────────────────────┘
                                        │ Turn 收尾（CLOSE / 停 / 等）
                                        ▼
                        SpecCore 阶段门禁（18 §5）→ 推进或拒绝
                                        │
                                        ▼
                        对话投影（摘要/问题/进度）+ SSE 事件流
```

### 2.2 驱动源：Loop 被什么唤醒

| 驱动 | 例子 | 进入路径 | 用户可见 |
|---|---|---|---|
| 用户消息 | 新需求、补充、更正、确认、停止 | 外层交互 → Turn（新/并入/排队） | 是（对话） |
| 子代理结算 | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED + report | 作为结构化 `subagent_notice` Item 注入下一步的 Observe/输入 | 只投影为进度/结果摘要（不直接给用户） |
| 工具结果 / 超时 / 取消 | 工具批 settle、三态取消 | 内层 Observe | 执行轨迹（折叠） |
| 定时/提醒事件 | 到点提醒（P1；P0 不做） | 作为内部事件注入 | 站内提示 |
| 人工审批结果 | 高风险确认 | 外层（确认视为特殊 steer） | 是（对话） |
| 进程恢复 | 崩溃重启、断线重连 | 恢复协议（§7.4） | 重连续接 + 状态 |
| 预算/超时/卡死检测 | 触发限制 | 内层判断 | 状态/结果摘要 |

**原则**：驱动源全部**先落事件再处理**；Loop 不依赖"内存里记住的待办"。

### 2.3 阶段 → 决策允许表（摘要，完整见 §1.3）

| Spec 阶段 | 回答 | 追问 | 调工具 | 派发 | 等待 | 收尾 |
|---|---|---|---|---|---|---|
| draft | ✅ | ✅ | ✅（只读） | ❌ | ✅ | ✅（确认阶段） |
| confirmed | ✅ | ✅ | ✅（只读/Plan 内部） | ❌ | ✅ | ✅（出 Plan） |
| planned | ✅ | ✅ | ✅（只读） | ✅（首个 Task） | ✅ | ✅（派发完成） |
| executing | ✅ | ✅ | ✅（按权限） | ✅ | ✅ | ✅（Task 完成/阻塞） |
| verifying | ✅ | ✅ | ✅（只读） | ✅（reviewer） | ✅ | ✅（裁决/收尾） |
| verified | ✅ | ✅ | ✅（只读） | ❌ | ✅ | ✅（写回/归档） |
| archived | ✅ | ✅ | ✅（只读） | ❌ | ✅ | ✅（reopen 请求） |

### 2.4 四家机制的落点（借什么 / 改什么 / 不借什么）

| 来源 | 借 | 我们的改造 | 不借 |
|---|---|---|---|
| **Codex CLI** | Thread/Turn/Item 三层；`turn/steer` 与 queue 二分；中断是请求而非杀进程；`turn.completed` 带 usage；goal 三要素（Outcome/Constraints/Verification） | Thread=会话/Spec；Turn=13 的「步」；Item=事件条目；steer/queue 落成输入队列 + 检查点；goal 三要素压进 `acceptance[]` | Item 类型枚举绑产品面；TUI 键位；slash 命令形态；重发 prompt 式续跑 |
| **Claude Agent SDK** | 五类消息；Result 五态（+所有 subtype 带 cost/usage）；`maxTurns` 口径；流结束再 break；只读并发/写串行；六步权限顺序；“无模式自动批准”清单；plan 对子代理生效；Agent Definition 声明式边界；输出指令形态中和；预算软上限诚实语义 | 五类消息改造成 SSE 语义事件 + 三栏投影；Result 五态映射为 Turn 终态；权限保留顺序但不抄 30 hooks；子代理接口用 DB 三文件而非 prompt 字符串唯一通道 | 子进程=session；JSONL 存储；`canUseTool` 静默绕过；30 hooks；从文本正则提 agentId；Workflow 脚本 |
| **DSH** | turn/step 两层；五段工具管线（pre-execute → guard → execute → post → result）；参数冻结；并行安全/独占屏障；三态取消；三屏障 fail-closed 检查点；“模型可见 ⟺ 已记录”；surface 区间替换；压缩三段式（引用 E2）；结算通知而非阻塞；委派双层预算 | checkpoint 落 SQLite 单写者；三态取消 + Ledger 恢复协议；Turn/Step 状态机显式化；委派接口换成三文件 + 双裁决（Superpowers） | 进程内 job/所有权图跨进程；Cordis 插件；workflow/team/ralph；无 turn 预算 |
| **Superpowers** | spec 权威 / plan 论证 + plan 回链；三文件交接（父只传路径）；双裁决；修复环 ≤5 轮 + ledger；Gate Function（证据化完成）；bootstrap 重注入 | 三文件落 DB（documents）传 handle；门禁绑定框架证据（不可伪造）；修复环做成显式状态机；bootstrap 进“规则每轮重注入” | 提示词软门禁；人审 Spec 硬门（与 Spec 不可见冲突）；全量 TDD 铁律；16 技能包；文件即真相 |

### 2.5 真相源与写路径（单点）

| 事实 | 唯一真源 | 本稿的关系 |
|---|---|---|
| 会话消息 / 事件 / 检查点 / Ledger | **`event_log`（事件历史=真相）+ `activities`（LLM/工具调用先落库）+ surface 视图 + `sc_ledger`**（对齐 18 v0.2 §8） | Loop 的每一步读写都经这里；事件是真相，`status` 是投影 |
| Spec / Requirement / Plan / Task / Evidence | SpecCore 表（18 v0.2 §8：`sc_specs` / `sc_spec_versions` / `sc_plans` / `sc_tasks` / `sc_evidence`；归档判定 `canArchive`） | Loop 只发命令 + 调门禁；不直写 |
| 进度 | `sc_tasks.status`（唯一） | Loop 只读投影；不缓存第二份 |
| 记忆 | 记忆条目 + 候选（12） | Loop 只提交候选 |
| token/cost | 单一计量服务（16 D6/M1） | 所有预算判断读它 |
| 文档交接 | `sc_documents`（brief/report/review_package） | 父只传 handle |

---

## 3. 消息与状态模型

### 3.1 五类消息（借 Claude，按我们的可见性三分改造）

> 消息是**事件日志上的投影**；同一份日志可投影出"对话流"和"执行轨迹"两份视图（14 §5.9）。五类消息是"模型/用户/UI 消费的语义层"，不是存储层的一行。

| 类型 | 何时产生 | 内容 | 落库 | 对话流可见 | 可撤回 | 备注 |
|---|---|---|---|---|---|---|
| **system** | 会话生命周期与内部状态变化 | `init`（会话/模型/工具摘要）、`phase_changed`（内部阶段，**不投影成 Spec 词**）、`compact_boundary`（压缩是显式事件）、`checkpoint_restored`、`rule_injected`、`mode_changed`（plan/execute）、`worker_shutting_down` | ✅ | 部分（只投影为“已压缩历史/已恢复”一句） | 否 | 系统消息**不是**用户消息；不得伪装成用户输入 |
| **assistant** | 模型每个内容块 | 文本段、工具调用请求、Plan 更新、派发说明；`visibility: dialogue/trace` | ✅ | 是（文本段；工具调用只进执行轨迹） | 是（仅未完成文本段） | 一个 assistant 消息 = 一个内容块（Claude 语义）；同一响应的多块共享 messageId，消费方聚合 |
| **user** | 真实用户输入；工具结果回灌；内部注入；子代理通知；人工确认 | `source: human / tool_result / inject / subagent_notice / approval`；只有 `human` 进对话流的“用户”样式 | ✅ | 是（仅 source=human） | 否（user 消息本身不可撤；其触发的未完成回复可撤） | 内部 user-role 消息**不得**显示为用户发言（INV：用户只跟秘书说话） |
| **stream** | 流式增量 | token 级 delta / 分片工具入参 / 进度；**ephemeral，只供展示**，不是 replay 源 | 不单独落库（聚合进一条 durable assistant 结算事件 + 段事件） | 是（打字机） | 是（整条未完成回复撤回） | 每个流恰好一个终止 chunk（成功/error/aborted） |
| **result** | Turn / Step / 模型流结束 | 最终文本、usage/cost、`subtype`、`stop_reason`、`session_id`、`turn_id` | ✅ | 摘要投影 | 否 | **所有 subtype 都带 usage/cost**；Turn 有且只有一个 result |

**五类的边界规则**：

1. **工具结果用 user-role 回灌**（Claude/Codex 一致），但带 `source: tool_result`，前端不得把它显示成"用户说的话"。
2. **子代理完成通知是结构化 user-role Item**（`subagent_notice`），带 `subagentId/taskId/status/reportId/evidenceRefs/stopReason/usage`；**绝不把子代理原文直接塞进对话**。
3. **撤回只作用于未完成的 assistant 文本段**；system/user/result 不撤回；已完成 assistant 不撤回（更正走后续回复）。
4. **system 的 `compact_boundary` 必须在流里可见**（UI 可提示"已压缩历史"，评测可统计压缩次数）；但压缩摘要内容不能出现在对话流。

### 3.2 Item 类型（事件日志最小单元）

| Item | 产生者 | 关键字段 | 用途 |
|---|---|---|---|
| `activity` | 模型/工具执行层（18 v0.2：Temporal 纪律） | kind（llm_call/tool_exec/subagent_call）、requestHash、model、tokens、outputRef、at | **先落库再推进**；重放复用记录、不重算（与 `event_log` 对齐；字段细节待对齐） |
| `message` | 用户/模型 | messageId、role、visibility、contentRef、replyTo | 对话投影、重放 |
| `tool_call` | 模型/管线 | toolCallId、toolName、argsHash、frozenArgs、requiresApproval、stepId | 工具执行与恢复配对 |
| `tool_result` | 管线 | toolCallId、status（ok/error/timeout/cancelled-tri-state）、outputRef（spill 后）、trust | 回灌与证据 |
| `state_change` | Loop/控制器 | kind（plan_updated/task_status/spec_version_member/memory_candidate/frame_revision）、payload | 进度与门禁 |
| `checkpoint` | 检查点服务 | barrier、cursorSeq、openTurn/Step、pendingCalls、frameRev、budget、resumePoint | 崩溃恢复 |
| `subagent` | 派发器 | taskId、briefId、status、reportId、verdicts、usage | 交接与双裁决 |
| `permission` | 权限管线 | decision（allow/deny/ask）、rule、reason、resolvedBy | 风险动作审计 |
| `error` | 各处 | code、retryable、attribution、detailRef | 降级与指标归因 |
| `notice` | 系统 | kind（heartbeat/status/warning）、textRef | S2/心跳/站内提示 |

### 3.3 可见性三分

| 视窗 | 内容 | 默认 | 数据来源 |
|---|---|---|---|
| **对话流** | 用户 human 消息 + 秘书回复文本段 + “已撤回”标记 + 确认问题 + 结果摘要 | 常显（中栏） | assistant(dialogue)、user(human)、system 的投影 |
| **执行轨迹** | 工具调用/结果、子代理进度、检查点、压缩边界、内部错误 | 折叠（可单独开窗） | assistant(trace)、tool_*、subagent、checkpoint、error |
| **审计/回放** | 原始事件、surface 替换、撤回原文、Ledger、Evidence 明细 | 不默认展示（按需/后台） | 全事件日志 |

**投影原则**：对话流里**不出现**工具 JSON、内部 ID、Spec 词；需要时可给"产物/证据指针"（可展开）。

### 3.4 Intent Frame：Loop 的“听懂了什么”（对齐 13 §6.1 + Spec 绑定）

| 字段 | 内容 | 更新时机 | 说明 |
|---|---|---|---|
| `turnId` / `stepId` | 当前 Turn / Step | 开 Turn/Step | 事件归属 |
| `sessionId` | 唯一归属会话 | 开 Turn | 13 §11.7 |
| **`specBinding`** | `{specId, specVersion, phase, planId?, planVersion?, taskId?, acceptanceKeys[], appetite?, outcome?}` | 每次组装/派发/收尾 | **本稿新增**；`appetite/outcome` 来自 18 v0.2；冻结后用于失效检查（`appetite` 如何转成 `stopPolicy` 待对齐 E5） |
| `goal` | 一句话：这一轮要达成什么 | 新目标/更正 | 必须能被用户 Ack 或否认 |
| `constraints[]` | 硬约束（含来源：用户原话/记忆/系统规则/权限） | Refine/Correct | 已确认约束不可被暗改（13 I3） |
| `acceptance[]` | 怎么算完成（可用内部键；用户侧口头表达） | 开 Turn / 阶段变化 | 与 Spec Acceptance 回链 |
| `phases[]` | 长任务阶段（目标/完成标准/产物/依赖/可中断点） | 开 Turn/重规划 | 与 18 Plan/Task 对齐 |
| `refs[]` | 引用的任务/记忆/文件/对象 handle | 引用时 | 按需取用，不复制 |
| `label` + `confidence` | 四类消息分类结果 | 每消息/窗口 | Ack/Refine/Correct/NewTask + Stop |
| `affects` | none / augment / amend / replace / abort | 每消息 | 决定撤回/重答/重规划 |
| `tier` | respond_only / respond_then_act / act | 每窗口 | 决定“只回”还是“派发” |
| `ambiguity` | `{level, options[], question}` | 慢判 | 真歧义才填，最多 1 问 |
| `selfDecisions[]` | 自主决定：`{decision, reason, reversible}` | 自主时 | 一句说明 + 可回看 |
| `mustAsk[]` | 必须问的问题（≤1/轮） | 每窗口 | 问题预算 |
| `revision` | 理解版本号 | 每次吸收/更正 +1 | 输出可引用“第 N 版理解” |
| `provenance` | 依据的消息/记忆/版本 id | 随更新 | 写回候选的来源 |
| `checkpointRef` | 最近检查点 | 写/恢复时 | 13 §9 |
| **`budget`** | `{stepsUsed, modelCalls, tokens, deadlineAt, subagentTree}` | 每步后 | 本稿新增；读单一计量 |
| **`stopPolicy`** | `{maxSteps, softHard, onBudget: pause/close}` | Turn 开始 | 本稿新增；可配置 |
| `frozenAt` | 派发时冻结的版本 | 派发时 | 冻结后旧版作废；执行侧拿执行视图 |

**Frame 生命周期**（对齐 13 §6.2）：

```text
开 Turn（新目标） → 增量更新 revision++ → 冻结（派发/收尾） → 执行中只读
      │                                             │
      ├─ 被打断：撤回文本，不改 Frame，按最新消息 revision++（重答）
      └─ 换方式：先写中断点 → 解冻 → revision++ → 新执行视图/改派
```

**Frame 不是记忆**：不进公共记忆；结论以候选写回；用户 Ack 可把来源升级为 `user_confirmed`。

### 3.5 Spec 绑定与失效规则（本稿新增，必须严格执行）

1. 每个 Turn/Step/Item 都写 `specId@specVersion`；Frame 冻结时记 `frozenSpecVersion`。
2. **派发前校验**：`frozenSpecVersion === currentSpecVersion`，否则拒绝派发，回 `confirmed` 做增量确认（“需求变了，我重新对一下”），记 Ledger。
3. **Plan 回链**：brief 里的 planVersion 必须等于当前 Plan 版本；Spec 升版 → Plan 标 `superseded` → 强制重规划（18 借鉴 B7）。
4. **子代理不能写 Spec**：只能交候选（Handoff/`spec_delta_candidate`），由秘书单写者合并（指 18 §11 的 Q4 建议默认，不是本稿 Q4；若 18 定稿变更，标「待对齐」）。
5. **归档/只读**：`archived` 会话收到写操作请求 → 拒绝并提示可 reopen；归档唯一入口是 `canArchive(specId)`；跨会话取用只读/原地处理，不复制文件（13 §11.8）。
6. **Spec = 记忆的内部 kind**（18 v0.2 §3.2）：Loop 不直写 `memory_items`（尤其 `kind=spec` 之外的公共层），只提交候选；Spec 的 markdown 导出只是视图。

### 3.6 状态机

**Turn 状态**：

| 状态 | 含义 | 进入 | 出口 |
|---|---|---|---|
| `created` | 已受理，未组装 | 新消息/steer 合并后开 Turn | `running` |
| `running` | 正在跑 Step 循环 | 进入循环 | `waiting` / `closed` |
| `waiting` | 暂停等外部：等人回答（CLARIFY/权限）或等执行/事件（WAIT） | 决策=追问/等待 | 收到对应事件 → `running`；超时 → 降级或关闭 |
| `closed` | 结束（成功/预算/人工/错误） | 决策=收尾或停止条件 | 只读；可 reopen 为新的 Turn |

> **撤回不是 Turn 状态**：`retracted` 只是 surface/聊天视图的标记（未完成回复撤回），Turn 本身仍在 `running` 并重答。不要把“撤回了”误记成“Turn 失败了/结束了”。

**Step 状态**：`pending → assembling → deciding → executing → observing → updating → judging → done`（异常 → `failed`/`aborted`；预算/中断在 `judging` 统一裁决）。

**工具调用状态**：`requested → (approval_pending) → dispatched → settled`；取消/失败后进入 `aborted_before_dispatch | not_started | outcome_unknown | ok | error | timeout`（三态见 §6.4）。

**子代理状态**（父侧视图）：`dispatching → running → (needs_context | blocked | done_with_concerns | done) → reviewed | fix_loop(n) → verified/blocked`。

**“等的人是谁”必须结构化**：`waitingOn: {kind: person_question | permission | external_event | subagent | timer, ref, question?}`；**禁止**从自由文本推断“在等人”。

### 3.7 幂等与不丢话

| 对象 | 幂等键 | 规则 |
|---|---|---|
| 用户消息 | 客户端 `clientMessageId` | 重复提交不重复落库、不重复开 Turn（M1 A3） |
| Turn | `turnId`（服务端生成，基于 session+seq） | 恢复不重放已结算 Turn |
| 工具调用 | `toolCallId` | 重试必须复用同一 id，避免重复副作用 |
| 检查点 | `checkpointId`（turnId+barrier+seq） | 重复写检查点幂等 |
| Ledger | `(specId, seq)` 唯一 | 追加式；恢复写 `recovery` 行 |
| SSE 事件 | `(sessionId, seq)` | 客户端按 id 去重；续接从 Last-Event-ID 之后 |

**不丢话**：每条用户消息先落事件（不可变），并最终被某 Frame revision 吸收或显式标注“未纳入及原因”（13 I2 / 7.5）。撤回不等于丢话：被撤回回复原文留在日志/审计，不进对话视图。

---

## 4. 内层单步循环（Step Loop）

### 4.1 六阶段总表

> 每个 Step = 一次"模型请求 + 其后的执行/观察/更新"。工具批可能包含多个工具；一次 Step 只产生一个 Step 结果（成功/继续/等待/失败）。

| # | 阶段 | 输入 | 动作 | 产出 | 屏障/记录 |
|---|---|---|---|---|---|
| ① | **组装** | Spec 片段（当前阶段/验收键）、Frame、记忆视图、对话 surface、上一步结果、子代理通知、持久规则、预算 | 组装请求消息与工具 schema；预算预估；决定是否先压缩 | `step/assembled`（envelope 哈希、token 估算、breakdown、注入来源） | **B1：请求前检查点**（先落盘再发模型请求） |
| ② | **决策** | 模型输出（或确定性路径） | 解析为六分支之一（§4.3）；校验阶段允许性、权限预检、参数冻结 | `decision` Item（kind/rationale/toolCalls/delegation/question/closeReason） | 决策与原始 output 一并记录 |
| ③ | **执行** | 决策 | 工具批（只读并行/写串行）或派发子代理；危险动作走权限 ask | `tool_call` / `subagent_dispatch` Items；执行结果 | **B2：顶层副作用前检查点** |
| ④ | **观察** | 执行结果、子代理结算、用户新消息（steer）、超时/取消 | 归一化结果（三态/错误码/usage）；打来源标签与信任标签；过大的结果 spill | `tool_result`/`subagent_notice`/`user_input` Items；更新的 pendingInputs | 结果先记录后可见 |
| ⑤ | **更新** | 上述 Items + 检测到的交互 | 更新 Frame revision、Task/Spec 状态（经单写者）、Ledger、token 计量、surface（spill/撤回/压缩）、预算计数 | `state_change` / `checkpoint` / `ledger` / `meter` 更新 | 事务提交；更新后可重放 |
| ⑥ | **判断** | 等价于一次"下一步该做什么"的判定 | 继续 / 停 / 改 / 等（§4.7）；若停 → 写 result、尝试阶段门禁 | 下一步动作或 Turn 终态 | **B3：逐步前检查点**（进入下一步前 flush） |

**顺序约束**：每个 Step 的 ① 之前必须完成上一 Step 的 ⑤⑥（B3）；不能"边观察边给模型看未记录的结果"。

### 4.2 组装（Assemble）

| 项 | 规则 |
|---|---|
| 输入来源 | ① Spec 当前阶段 + 相关 Requirement/Acceptance 片段（经 handle/摘要）② Frame 执行视图 ③ 记忆视图（常驻块 + 检索 + 冲突提示，作用域受 Spec 读权限约束，12 §4.3）④ 对话 surface（已提交消息，不含被撤文本；含 compact_boundary）⑤ 工具/子代理结果 ⑥ 持久规则（AGENTS.md 式，每步重注入）⑦ 环境事实（时间/路径/模型） |
| 禁止 | 不把 Spec 全文塞入（只放片段/引用）；不把子代理全文塞入（只放 report/handle）；不把被撤回文本再喂给模型 |
| 输出 | 模型请求（messages/tools）、token 估算、breakdown、注入 provenance、`requestHash`（canonical envelope） |
| 关键动作 | 若预估超阈值 → 先触发压缩（E2）；若压缩失败 → 降级为“摘要 + 指针”并给用户一句说明（可见） |
| 不变量 | 每个注入项可追溯到事件（INV-1）；记忆条目不可静默丢（E2 硬断言）；规则每步重注入（与压缩解耦） |

> 组装算法、预算分配、压缩细节归 **E2/design/20**；本稿只定义"Loop 何时调用、必须保证哪些不变量、失败怎么降级"。

### 4.3 决策（Decide）：六分支

| 分支 | 判据（模型 + 确定性预检） | 产出 | 是否打扰用户 | Step 出口 | Turn 出口 |
|---|---|---|---|---|---|
| **回答 ANSWER** | 问题可直接回答；或只是解释/确认；无需外部动作 | 文本段（可多段，按语义段流式） | 否 | 若还有后续工作 → 继续；否则收尾 | 可 `closed(success)` |
| **追问 CLARIFY** | 真歧义（13 §5.5.1 三条同时满足）；或阶段校验缺关键信息 | 1 个问题（2–3 选项 + 建议 + 背景解释） | **是**（≤1 问） | `waitingOn=person_question` | `waiting`（收到回答作为 steer 恢复） |
| **调工具 CALL_TOOL** | 需要外部信息/动作，且在工具白名单与阶段允许内 | 工具批（只读可并行/写串行）或单个工具 | 仅当权限求值为 `ask` | `executing → observing` | 继续 |
| **派发 DELEGATE** | 需要专家执行/评审，且任务有 brief/writeScope/requiredEvidence | 子代理 brief handle + dispatch | 仅风险门（不可逆/动线上/花钱/对外） | 进入 `waitingOn=subagent` 或继续（异步） | 继续/等待 |
| **等待 WAIT** | 结构化阻塞：等人补充、等外部事件、等子代理、等审批 | `waitingOn` + 一句状态（S2） | 是（仅一次，不骚扰） | `waiting` | `waiting` |
| **收尾 CLOSE** | 目标达成 / 无更多可做 / 预算到限 / 错误不可恢复 / 人工停止 / 验证通过 | result（subtype + usage/cost）、更新 Frame/Task/Spec、Handoff/候选记忆 | 可选（给摘要） | `done` | `closed(reason)` |

**决策硬规则**：

1. **阶段门先于模型**：组装时就把“本阶段允许的决策”写进系统段；模型若给出阶段禁止的动作（如 draft 阶段要写文件），**不执行**，改为 CLARIFY/ANSWER 并解释（fail-closed）。
2. **参数冻结**：`CALL_TOOL` 的参数在决策时冻结并记录；pre-execute 之后不得改写（DSH），如需改 = 新工具调用。
3. **一次只做一个“改变性”决策**：同一 Step 不允许既取消旧线又开新线；需要时先写中断点（§5.6），下一个 Step 再做。
4. **CLARIFY 预算**：每个 Turn ≤1 个问题；连续 2 个 Turn 都在问 → 停问，先做可逆部分并列出待定项（13 §5.4 问题预算）。
5. **CLOSE 必须引用证据**：若收尾声明与 Task/验收相关，必须引用本轮 Evidence；没有证据只能表达“我做了 X，但未验证 Y”（INV-5）。
6. **决策可被确定性路径短路**：S0、权限拒绝、阶段拒绝、预算硬停不需要模型；这些路径也必须产出 decision Item（可审计）。

### 4.4 执行（Execute）

| 执行形态 | 何时 | 并发 | 说明 |
|---|---|---|---|
| 只读工具批 | 查询/检索/读文件/读记忆 | 并行（V1 默认 ≤4，上限可配） | 彼此无依赖才并行；顺序敏感 → 串行/独占 |
| 写工具 | 写文件/改状态/发消息/提交 | **串行（独占屏障）** | 与任何并行调用互斥；写前必须通过权限求值 |
| 子代理派发 | 实现/审查/独立调查 | 异步（默认，Q5 已拍板）；V1 ≤2 并发、depth=1 | 父不阻塞；仅短任务阈值内或用户明确要求时阻塞等待（§8.5） |
| 人工确认 | 权限 ask / 风险门 | 挂起 Step | 不执行被确认前的动作；等待期间 S2 心跳 |
| 内部动作 | 读 plan/task、写候选记忆、更新 Frame | 同步 | 受单写者与事务约束 |

**执行原则**：执行前必须过 §6 的工具管线；工具失败不结束 Turn（DSH/Claude 一致），只有不可恢复错误才失败。

### 4.5 观察（Observe）

| 观察对象 | 归一化 | 注意 |
|---|---|---|
| 工具结果 | `{status: ok/error/timeout/cancelled, exitCode?, outputRef, trust, attribution}` | 超大输出 spill；不可信内容打标签；错误码稳定 |
| 子代理结算 | `{subagentId, taskId, status(4 态), reportId, verdicts?, evidenceRefs, stopReason, usage}` | 不直接展示原文；父只读 report/handoff |
| 用户新消息（steer） | 进入 pendingInputs；快判结果（撤回/不撤回/待定） | 在 Step 边界吸收；不打断不可逆原子区 |
| 取消/超时 | 三态之一 + 归因（用户/预算/工具超时/上游取消） | 不把“未知”当“失败” |
| 检查点/计量 | 当前 seq、token 差、预算余量 | 每个 Step 后更新 |

**原则**：观察到的所有事实**先记录**，再进入更新/下一步；模型只看记录过的事实。

### 4.6 更新（Update）

| 更新对象 | 写路径 | 事务边界 |
|---|---|---|
| Frame | 内存 + `frame_revision` 事件；不直接入库为“记忆” | 与 Step 结果同一事务/同一 seq 区间 |
| Task 状态 | SpecCore 单写者命令（18 §8.3） | 与 Evidence/Ledger 同事务 |
| Spec 状态 | 只能在“判断→收尾/门禁”时尝试推进；由 SpecCore 校验 | 与 Ledger 同事务 |
| Ledger | append-only（stage/gate/verdict/fix_round/ruling/adjudication/close/recovery） | 每行 `(specId, seq)` 唯一 |
| token/cost | 单一计量 fold（provider usage 优先） | 每模型/工具结算后 |
| surface | 撤回（replace 区间）、spill、压缩替换 | 只改视图不改日志（INV-4） |
| 记忆 | 仅候选（12 §5） | 候选有 `candidateId/baseVersion` 幂等 |
| 预算 | 更新 Frame.budget → 判定下一步 | 每 Step 后 |

### 4.7 判断（Judge）：继续 / 停 / 改 / 等

| 判断 | 条件（全部满足） | 下一步 | 记录 |
|---|---|---|---|
| **继续** | 工具结果就绪；无待处理改变性输入；预算/步数未超；阶段允许 | 下一个 Step（①） | `step/continued` |
| **停（成功）** | 目标达成；回答已完整；或验证通过 | Turn `closed(success)`；result 带 usage | `turn/closed` |
| **停（上限）** | `stepsUsed ≥ maxSteps` / `turnsInSpec ≥ maxTurns` | `closed(error_max_steps)` | `limit_hit` |
| **停（预算）** | token/cost/wall-clock 触达硬限 | 软限：完成当前响应后停（`closed(budget_soft)`）；硬限：立即停（`closed(error_max_budget)`） | `budget_hit` + 归因 |
| **停（人工）** | 用户 Stop / 取消请求 | 取消可逆动作 → `closed(error_interrupted)`；不可逆动作报告已发生 | `interrupted` |
| **停（错误）** | 不可恢复：模型认证失败/工具契约破坏/检查点写失败/内部断言失败 | `closed(error_during_execution)`；保留现场 | `error` |
| **改（重规划）** | 收到改变性输入（Correct/改变性 Refine）且已吸收 | 写中断点 → 回 ①（新的 Frame revision） | `replan` |
| **等** | CLARIFY / WAIT / 权限 ask / 子代理在跑（父选择等待） | `waiting`，收到事件后回 ① | `waiting` |
| **重试** | 只读/幂等失败且未超重试预算 | 回 ③（同 toolCallId） | `retry` |
| **不重试（未知）** | 有副作用且结果三态含 `OUTCOME_UNKNOWN` | `waiting`/`closed` 并问人/查外部状态 | `outcome_unknown` |

**判断的确定性**：判断阶段由控制代码（不是模型）执行；模型只影响决策分支。这样“继续/停/改/等”可被测试断言（E1 判定点清单 §4.9）。

### 4.8 停止条件与 Result 语义

| 停止原因 | Turn 终态 | `result.subtype`（借 Claude 五态 + 扩展） | `result` 内容 | 用户可见 |
|---|---|---|---|---|
| 正常完成 | closed | `success` | 最终文本、usage/cost、session/turn id | 摘要 + 结果 |
| **验证通过（Spec verifying 门禁）** | closed | `success`（附 verdict/evidence 摘要） | 两个 verdict、证据指针、产物、usage/cost | “结果如下……这样可以吗？” |
| 撞步数/轮次上限 | closed | `error_max_steps` | usage/cost；未完成说明 | “这一步做不完，先给你阶段结果” |
| 撞预算（硬） | closed | `error_max_budget` | usage/cost；预算口径 | “到预算上限了，先停；可调预算继续” |
| 撞预算（软） | closed | `budget_soft`（扩展，非错误） | usage/cost；已完成部分 | “到预算上限了，先停；可调预算继续” |
| 被用户停/取消 | closed | `error_interrupted` | 已完成的段/动作说明 | “已停；未完成部分可继续” |
| 执行不可恢复错误 | closed | `error_during_execution` | 错误码、归因、现场指针 | “执行出错，已停” |
| 验证阻塞（双裁决不过且超修复环/需人） | waiting/blocked | （不是 result）`blocked` 状态 + 需人问题 | 两个 verdict、缺失项 | “需要你确认/补一个信息” |
| 真歧义待回答 | waiting | （不是 result） | 问题 + 选项 | 问题 |
| 等子代理（父选择等待） | waiting | （不是 result） | 子代理状态 | 进度/心跳 |

**规则**：

- **每个 Turn 恰好一个 result**（normal/terminal）；`waiting` 不是终态，恢复后继续同一 Turn。
- **所有 subtype 都带 usage/cost/session_id**（出错也能记账与续跑，Claude 借鉴）。
- **流结束语义**：result 之后可能仍有尾随事件（如状态提示）；消费方**必须迭代到流结束再 break**（Claude 教训）。
- **预算诚实性**：软上限允许“最后一个响应 + 子代理尾巴”完成并计入；报告要写清可能超支（Claude 借鉴）。硬熔断在响应前按预估拒绝/停止，会误杀，可配置。
- **与 Claude 五态的映射**：`success` 直用；Claude `error_max_turns` ↔ 本稿 `error_max_steps`；`error_max_budget_usd` ↔ `error_max_budget`；`error_during_execution` 直用；`error_max_structured_output_retries` 可作为“结构化输出解析失败”的扩展 subtype（V1 可选）。本稿额外加 `budget_soft` 与 `error_interrupted`（对应人工停止）。

### 4.9 判定点清单（E1 评测接口，对应 design/17 §7.3）

> E1 必须自带“判定点清单（终止/中断/推进）+ ≥2 条 L2 case + 对应 L1”。以下为 v0 版；用例细节见 §11.5。

| ID | 类型 | 判定点 | 可观测事件/状态 | 断言（建议） |
|---|---|---|---|---|
| P-T1 | 终止 | 回答完成 → 收尾 | `turn/closed{success}` | 有且一个 result；无未结算工具；后续不再消费帧 |
| P-T2 | 终止 | 验证通过 → 收尾 | `verdict` 两条 + `turn/closed{success}` | 双裁决齐、证据齐；缺一不得 closed |
| P-T3 | 终止 | 步数/轮次上限 | `limit_hit` + `error_max_steps` | 到限即停、不静默续跑；给出已完成/未完成 |
| P-T4 | 终止 | 预算硬限 | `budget_hit` + `error_max_budget` | 不发起新模型请求；记账完整；可配置软/硬 |
| P-T5 | 终止 | 人工停止 | `interrupted` + `error_interrupted` | 可逆动作取消；不可逆报告已发生；无新副作用 |
| P-T6 | 终止 | 不可恢复错误 | `error` + `error_during_execution` | 错误码稳定；现场保留；可恢复路径明确 |
| P-I1 | 中断 | 流式中改变性消息 → 撤回 | `message/retracted` + surface 替换 | 对话不显示被撤内容；原文审计可查；重答只答受影响部分 |
| P-I2 | 中断 | 工具取消三态 | `tool_result{status:...}` | 三态准确；副作用不自动重试 |
| P-I3 | 中断 | steer 在检查点吸收 | `next_step_input_consumed` | 不新开 Turn；不丢；不提前改已确认约束 |
| P-I4 | 中断 | queue 排到下一 Turn | `turn/queued` + 新 Turn | 当前 Turn 不被打断；用户看不到“排队” |
| P-I5 | 中断 | 崩溃恢复无重复副作用 | `checkpoint` + `recovery` Ledger | 恢复后副作用次数=1；未知项标 blocked |
| P-I6 | 中断 | 权限 ask 挂起/恢复 | `permission/requested` + waiting | ask 前不执行；回答后恢复；超时 fail-closed |
| P-A1 | 推进 | 工具结果 → 下一步 | `step/continued` | 结果先落库后可见；envelope 哈希一致 |
| P-A2 | 推进 | 子代理结算 → 下一步/收尾 | `subagent_notice` | 父只读 report/handoff；4 态正确路由 |
| P-A3 | 推进 | 澄清回答 → 恢复 | `waiting` → `continued` | 回答作为 steer；问题≤1；不可逆仍等确认 |
| P-A4 | 推进 | 检查点恢复 → 继续 | `checkpoint_restored` | 从第一个未完成项继续；不重放已结算 |
| P-A5 | 推进 | 只读重试 vs 写不重试 | `retry` / `outcome_unknown` | 写不自动重试；只读有上限 |
| P-A6 | 推进 | 压缩后继续 | `compact_boundary` + `continued` | 记忆条目未丢；规则已重注入；请求可重建 |

---

## 5. 外层连续交互（Turn 级）

### 5.1 三速响应与运行态（承接 13 §3–§4，不重定义）

| 档 | 时机 | 内容 | 与 Loop 的关系 |
|---|---|---|---|
| **S0** | 消息到达即发 | “收到/正在看”；不含未验证结论 | 确定性路径，不经过模型；先落事件 |
| **S1** | 合并窗口关闭 + 快判完成 | 确认理解/方向、1 个问题、或简单答案（短） | 通常一次 ANSWER/CLARIFY 决策的首段 |
| **S2** | 每个语义段/执行期间 | 增量结论、阶段/进度、心跳 | 由 Step 执行/观察/更新产生；执行期不得静默 |

**运行态**：`Idle / Speaking / Acting`（Acting 与 Speaking 可并存）；抢占决策看前台态（Idle/Speaking），后台态（Acting）影响“要不要改派/重规划”（13 §4.1）。Loop 的 Turn 状态与这三态是**投影关系**：Speaking ↔ 正在流式；Acting ↔ 有子代理/工具在跑；等待态 `waiting` 是 Turn 状态，不是第四种前台态。

### 5.2 steer vs queue（Codex 借鉴，落成确定性判定）

| 步骤 | 规则 |
|---|---|
| **定义** | **steer** = 并入**当前 Turn** 的下一个 Step 输入（不新开 Turn、不丢、不等待）；**queue** = 存到**下一个 Turn** 再处理（当前工作先跑完，不打断）。**【已拍板·用户 2026-11-06 授权 lead 拍板：Q2】** steer **只在当前会话/当前 Spec 内**生效；**跨 Spec 的输入一律走 queue**，交给目标 Spec 的 Loop 自行处理（不在当前 Spec 抢占）。两者内部有队列，但**用户不可感知**（13 I5）。 |
| **快判（≤200ms，确定性）** | 出现“不对/不是/错了/改成/我说的是/停”等 → 先按“可能改变”处理：若在流式 → 立即停 + 撤回未完成回复；若在工具执行 → 只在安全边界生效（不可逆原子区豁免）。 |
| **慢判（模型）** | 分类为 Ack / Refine / Correct / NewTask / Stop，并决定 steer 还是 queue（见下表）。 |
| **明确指令优先** | 用户说“等这个做完再说/先别管，排后面”→ 即使内容改变，也走 queue（用户显式选择不打断）。 |
| **分类失败** | 走降级：复述理解 + 等确认（13 D2）；不自行选一种执行到底。 |
| **吸收点** | steer 只在**抢占检查点**生效：① 下一步组装前 ② 当前工具批 settle 后 ③ 派发新子代理前 ④ 检查点恢复后。不能插进正在执行的不可逆动作。 |
| **queue 交付** | 当前 Turn 关闭 → 开下一 Turn。**当前 Turn 在 waiting 时**：若新消息是对当前 `waitingOn.person_question` 的回答 → 作为**特殊 steer 恢复同一 Turn**；否则（新目标/与提问无关）按新 Turn 处理（此时没有“当前工作在跑”）。**跨 Spec 的 queue 不进入当前 Turn**：投递到目标 Spec 自己的 Loop/队列，由目标 Spec 开自己的 Turn（Q2 已拍板）。 |
| **顺序与合并** | 同一合并窗口内多条按到达顺序合并；批内冲突以最后一条为准（13 §7.2）；流式中连续多条只撤回一次、合并重答一次。 |

**判定表（慢判结果 → 动作）**：

| 分类 | 含义 | 默认动作 | 例外 |
|---|---|---|---|
| Ack | 确认/接受已说内容 | 不撤回；不新 Turn；更新确认状态 | 若同时含新信息 → 按 Refine |
| Refine（不影响已输出） | 补充细节/参数 | **steer**：并入当前 Turn 的下一个 Step | 与当前工作无关 → queue |
| Refine（改变性） | 改变当前做事方式/约束 | **steer + 重规划**：先写中断点，再改执行视图 | 不可逆动作进行中 → 等其完成，再改后续 |
| Correct | 纠偏/推翻已确认 | **steer + 重规划**；流式中先撤回 | 已完成消息不撤回，用后续更正 |
| NewTask | 无关新目标 | **queue**：当前 Turn 保活；一句“先记下”告知 | 用户显式要求立刻切换 → 中止当前可逆部分再开新 Turn |
| Stop | 明确停止 | **取消当前 Turn**（撤回未完成文本；可逆动作撤销；不可逆报告已发生） | 无 |

**为什么 steer 比“打断重来”好**：steer 只改方向、保留已确认/已完成的内容，成本低且可恢复；queue 让“我等你说完再补充”成为一种明确语义，而不是粗暴排队（Codex 借鉴）。

> **Q2 已拍板（用户 2026-11-06 授权 lead）**：steer 仅当前 Spec 内立即生效；跨 Spec 一律 queue。**跨 Spec 的输入在事件上带 `targetSpecId`，由目标 Spec 的 Loop 在自己的下一个 Turn 处理；当前 Spec 的 Loop 不读取、不抢占、不撤回目标 Spec 的流**。这样避免“在 A 会话里说话却改动了 B 会话正在输出的回复”。

### 5.3 撤回规则（13 §3.2/§8.5，Loop 落点）

| 对象 | 能否撤回 | Loop 动作 |
|---|---|---|
| 流式中未完成 assistant 文本段 | **必须撤回**（被改变性消息打断时） | 停止生成 → surface 区间替换 → 对话只留“已撤回” → 原文留日志 → 基于最新消息重答 |
| 已完成 assistant 消息 | **不撤回** | 用后续回复明确更正，引用被更正内容 |
| S0 状态信号 | 不算回复 | 随状态更新/消失 |
| 已执行的外部动作 | **不可撤回** | 报告“已发生”，按新意图调整后续（不改历史） |
| episode/日志/记忆原文 | 不删 | 撤回只作用于对话视图 |
| 工具结果/子代理报告 | 不撤回 | 标 `invalidated` 或作为新输入；不删历史 |

**呈现**：对话历史只显示“已撤回”标记，不展示内容；审计后台保留（谁、何时、为什么、撤前说到哪）（14 §5.5）。重答前一句说明（“上一条撤回了，按你最新的说法重来”）。

### 5.4 抢占矩阵（13 §8.3 的 Loop 落点）

| 消息类 | Speaking（流式中） | Acting（执行中，无流式） | Idle / waiting（非提问等待） |
|---|---|---|---|
| Correct | 停 → 撤回 → 复述更正 → 重答；有执行 → 重规划 | 回一句“收到更正” → 写中断点 → 重规划（继续/改派/分叉/中止） → 改派 | 正常处理（新 Turn） |
| 改变性 Refine | 停 → 撤回 → 吸收新约束 → 重答（只答受影响部分）；执行侧调整 | 回“记下了，我调整一下” → 调整 brief（不打断执行） | 正常处理 |
| 普通 Refine | 看是否影响已输出：影响 → 撤回重答；不影响 → 下一段吸收（steer） | 附加到执行 brief（steer 到下一次观察） | 正常处理 |
| NewTask | 停 → 撤回 → 旧 Turn 一句收尾 → queue 新 Turn（旧执行保活） | 旧执行继续；queue 新 Turn | 正常处理（新 Turn） |
| Ack | 不撤回，继续/收束 | 只更新确认状态 | 正常处理 |
| 显式停止 | 停 → 撤回 → Idle | 停可逆动作；不可逆动作报告已发生 → Idle | 正常处理 |

> 等待中的**提问回答**是例外：它是对 `waitingOn.person_question` 的回复，按“特殊 steer 恢复同一 Turn”处理，不按新 Turn；上表 Idle/waiting 列只适用于“没有未回答问题”的情况（避免把“回答我的问题”误当成新任务）。

**一句话**：流式中没有“软抢占”——只要新消息会改变当前回复就撤回重答；“段间吸收”只适用于**没有正在流的回复**的时刻（思考中、工具等待、段间）（13 §8.3）。

### 5.5 歧义先确认 + 自主阈值（13 §5.5，Loop 落点）

| 情形 | Loop 动作 |
|---|---|
| 真歧义（≥2 合理解释 + 实质不同动作 + 现有信息无法排除） | 决策 `CLARIFY`：只问 1 个问题，2–3 选项 + 建议 + 背景；**不执行不可逆/改变状态的部分**；可并行做不受影响的可逆部分 |
| 琐碎/可逆/低风险/有默认 | 自己定 + 一句说明，记入 `Frame.selfDecisions[]`；不打断 |
| 不可逆/对外/花钱/改已确认约束/跨作用域写 | 先问（属于风险门，不是 Spec 审批） |
| 问题预算 | 每 Turn ≤1 问；连续 2 个 Turn 都在问 → 停问，做可逆部分并列出待定项 |
| 分类/歧义判定失败 | 走 D2：复述理解 + 等确认，不自行执行到底 |

**两类错误**：该问不问（关键决策静默默认）与过度确认（琐碎也问、一次 >1 问）都算协议失败，需在回复里显式纠正（13 §5.5.4）。

### 5.6 与抢占检查点的关系（段 / 工具 / 步 / 轮）

| 检查点类型 | 时机 | 能做什么 | 不能做什么 | 记录 |
|---|---|---|---|---|
| **段边界** | 模型文本段结束（自然边界或 6s/120 tokens 强制短段） | 吸收 steer；撤回未完成段；更新 S2 | 改已冻结参数；跳步 | segment 事件 + 可选轻检查点 |
| **工具边界** | 每个工具即将 dispatch 前（尤其有副作用） | 权限 ask；取消（ABORTED_BEFORE_DISPATCH）；参数冻结后不可改 | 执行中改参数 | B2 检查点 |
| **步边界** | 观察/更新后、下一步前 | 吸收 steer/queue；重规划；检查点；继续/停 | 看未记录结果 | B3 检查点 |
| **轮边界** | Turn 收尾 | 推进 Spec 阶段门；写 result；开下一 Turn | 绕过门禁推进 | result + Ledger |

**规则**：撤回只发生在段边界之前/之中；steer 只在上述检查点生效；**不可逆动作执行中不抢占**（13 §8.4 原子区），完成后立即报告再处理。

### 5.7 打断恢复与不丢话

- 被打断时写**中断点**（13 §9 字段：phase/progress/interruptReason/oldPlan/newPlan/resumePoint/artifacts/baseVersion/status）；Loop 的检查点与中断点是**两条记录、互相引用**：检查点保“执行到哪”，中断点保“为什么改、从哪继续”。
- 恢复：按最近检查点 + 中断点 + `sc_tasks` 第一个未完成项继续；旧方案保留（`superseded`），不删。
- **不丢话**：每条用户消息先落事件，最终被 Frame revision 吸收或标注“未纳入及原因”；撤回≠丢话。

---

## 6. 工具管线（Tool Pipeline）

### 6.1 五段管线（DSH 借鉴，参数冻结）

```text
pre-execute（allow / deny / ask） → guard（单调 deny，不可翻案） → execute（超时/重试/取消）
      → post-execute（检查/替换/附加 context/脱敏/spill） → result（只观察，写事件）
```

| 段 | 输入 | 动作 | 失败语义 |
|---|---|---|---|
| **pre-execute** | toolCall（已冻结参数）、tool 元数据、当前阶段、主体（秘书/专家）、权限策略 | 求值 allow/deny/ask；记录权限 decision；ask → `waiting` | deny → 工具不执行，返回结构化拒绝；ask → 挂起等确认（fail-closed） |
| **guard** | 已求值结果 | 单调 guard：一旦 deny，后续 listener 不能翻案（DSH）；检查 writeScope/阶段越界 | deny 保持 |
| **execute** | 冻结参数、timeout、retry policy、signal | 执行；超时/重试/取消；结果三态 | 普通失败 → 结构化 error（不结束 Turn）；超时 → `TOOL_TIMEOUT`；取消 → 三态 |
| **post-execute** | 原始结果 | 校验/塑形：截断或 spill（超预算落文件 + 确定性提示行）、不可信内容打标签/转义、脱敏、附加上下文 | 塑形失败 → 降级为 error 结果 + 提示，不静默丢 |
| **result** | 最终结果 | 写 `tool_result` Item；更新计量；只观察，不再改内容 | 记录失败 → fail-closed（该结果不得给模型看） |

**参数冻结**：pre-execute **不能改写参数**（否则日志/渲染/实际执行脱同步，DSH 教训）；需要改 = 新的工具调用（新 toolCallId）。

### 6.2 权限求值（六步顺序，Claude 借鉴；V1 简化状态机）

**求值顺序（不可交换）**：

1. **Hooks**（V1 只做 5–6 个核心事件：PreToolUse / PostToolUse / Stop / PreCompact / UserPromptSubmit / SubagentStop）：可 deny/放行；**即使 hook 返回 allow，也不能跳过后续 deny/ask 规则**。
2. **Deny rules**：命中即拒；**即使 bypass 模式也不调回调**；hook allow 也无效。
3. **Ask rules**：命中则进入人工确认（`permission/requested`，挂起 Step）；bypass 也会走。
4. **Permission mode**：V1 只保留 `default / ask / plan / auto` 四档（不抄六模式）；plan 模式**任何文件编辑/写操作永不自动批准**，一律走确认。
5. **Allow rules**：命中则批准（含工具自身可批准的调用）。
6. **兜底回调/默认**：无人值守且未命中任何 allow → **拒绝**（fail-closed），不静默执行。

**“无任何模式自动批准”清单（V1 初版）**：critical-path 删除（`rm -rf` 等）、网络路径读、工作目录外写、公共记忆写入、对外发送（消息/邮件/发布）、花钱/付费调用、部署/改生产、删除/覆盖用户文件。命中即 ask（或 deny，按 M2 策略）。

**与 Loop 的关系**：`ask` 产生 `waitingOn.permission`；用户确认是**特殊 steer**（不新开 Turn），恢复后从工具边界继续；超时 → fail-closed（不执行）并给用户可见状态。**权限检查每次都跑，批准回调只在需要时跑**（Claude 的 `canUseTool` 静默绕过教训：Go 侧拆成两个概念）。

### 6.3 并发模型

| 分类 | 默认 | 规则 |
|---|---|---|
| 只读工具 | 并行（V1 ≤4，上限 10） | 工具显式声明 `parallelSafe: true`；**依赖兄弟调用/资源比较的工具必须 exclusive**；保守默认串行 |
| 写工具 | **串行** | 独占屏障：等所有 in-flight 只读调用归零；写与写之间按 Step 顺序 |
| 子代理派发 | 异步，V1 并发 ≤2 | 子代理有自己的工具管线；父不等待（可显式等待）；depth=1 |
| 人工确认 | 挂起 | 不占用执行 slot；期间 S2 心跳 |
| 内部只读（spec/task/memory） | 同步 | 单写者读快照 |

**写冲突**：`writeScope` 重叠 → 告警/排队（18 §4.3）；**执行平铺**：所有可执行 Task 同一池，不按 Spec 层级递归。

### 6.4 超时、重试与三态取消（DSH 借鉴）

**超时**：工具定义只声明 `timeoutMs`，由包装层强制；超时 = 通知 + 归因（不硬杀进程），settle 后把结果替换为 `TOOL_TIMEOUT`；嵌套 deadline 冲突按普通上游取消归因。

**重试**：

| 操作类型 | 能否自动重试 | 规则 |
|---|---|---|
| 只读/幂等 | ✅ | 有限次（默认 2 次，指数退避 + 抖动）；同 toolCallId |
| 有副作用 | ❌ | **不自动重试**；结果未知 → `OUTCOME_UNKNOWN`，先查外部状态或问人 |
| LLM 请求 | ✅ | 5 次（EMPTY_RESPONSE/RATE_LIMIT/SERVER/TIMEOUT/TRANSPORT），500ms→10s 指数退避 +10% 抖动；重试前落 `llm/retry`，开始前落 `llm/retry-started`（崩溃不留隐形 pending） |

**三态取消（必须精确区分）**：

| 三态 | 含义 | 历史里怎么办 | 重试 |
|---|---|---|---|
| `ABORTED_BEFORE_DISPATCH` | 已记录 call，但**未派发**给工具体 | 合成“未开始”结果，可配对 | 可重试（安全） |
| `NOT_STARTED` | 未记录为 started | 合成“未开始”结果 | 可重试（安全） |
| `OUTCOME_UNKNOWN` | 已记录 call 且可能已执行，但**无可信结果** | 合成“结果未知”，明确告知模型只做只读/幂等确认 | **不自动重试**；先查外部状态或问人 |
| （补充）`ABORTED` | 执行中被取消，工具体承诺已中止 | 合成取消结果 | 按工具语义 |

**保证**：取消与检查点 flush 竞争只有一个出口（先 flush，后取消 → 返回 aborted-before-dispatch）；绝不在 flush 失败后进入工具体。

### 6.5 结果塑形与信任边界

| 处理 | 规则 |
|---|---|
| 大输出 | spill 到文件（头/尾保留 + 确定性提示行 + 路径），完整内容落盘；模型可 read/grep；日志保留完整 |
| 不可信内容 | 统一封装：来源标签 + 框架标签 + `<` 转义 + 字节预算；**不可信内容不得直接触发写记忆/写文件/改策略**（16 §3.1 借鉴） |
| 脱敏 | 凭据/密钥/个人敏感信息在 post-execute 脱敏；默认遥测不含 prompt/工具入参（opt-in） |
| 工具输出裁剪 | 压缩时先剪工具输出（无模型调用）再摘要（E2 三段式）；被 read 工具读取的结果豁免（防自噬） |
| 子代理输出 | 指令形态中和（§8.6），不删除文本、加 `[harness:]` 标记 |

### 6.6 主循环工具白名单 vs 专家工具

> 对齐 10 §4/§6「秘书不下场干活」与 14 §2（一个秘书 + 专家实例）。**【已拍板·用户 2026-11-06 授权 lead 拍板：Q1=A】** 主 Loop **只读 + 沟通 + 派发 + 候选**；写文件/跑命令/对外发送全部交给专家实例。

| 主体 | 允许的工具（V1 已拍板） | 禁止 |
|---|---|---|
| **秘书主 Loop** | 只读工具（读文件/检索/查记忆/查任务）、沟通类（发消息给用户=对话本身）、内部动作（更新 Frame/提交候选记忆/派发子代理/写 Ledger） | 写用户文件、跑任意命令、对外发送、花钱、删数据 → 一律派给专家实例 |
| **专家实例（子代理）** | 按 brief 的 writeScope 与工具白名单执行；有独立工具管线与权限求值；只交 report/证据 | 面向用户的 Loop；写 Spec；派子代理（depth=1）；越 writeScope |
| **审查者** | **只读**：读 brief/report/review-package；不跑命令、不复跑套件、不爬代码库、不派子代理 | 写任何东西（含写 report 以外的文档） |

**理由**：主循环只管“研判/分派/汇总”（Super-agent 判据：主会话不下场干活，10 §1/README）；副作用集中在专家实例，便于隔离、预算与权限。**代价**：多一次交接延迟与上下文传递成本；收益是单一接口、可审计、权限边界清晰。

### 6.7 失败语义（普通失败不结束 Turn）

| 情况 | 处理 |
|---|---|
| 未知工具 / 参数校验失败 / 工具抛异常 | 结构化错误结果回灌模型（`UNKNOWN_TOOL`/`INVALID_ARGS`/`TOOL_ERROR`），Turn 继续；模型决定换工具/问人/收尾 |
| 工具超时 | 结果替换为 `TOOL_TIMEOUT`；继续（不挂死） |
| 有副作用结果未知 | `OUTCOME_UNKNOWN` → 判断为“不重试”路径；需要人确认或外部核对 |
| 权限拒绝 | 结构化拒绝 + 原因；模型可换方案或问人；不得静默重试绕过 |
| 检查点写失败 | **fail-closed**：不发起模型请求/不进入工具体；Turn 以 `error_during_execution` 停，给用户可见说明 |
| 子代理失败 | 发布前失败 → 模型可见 errored result；发布后失败 → 结算通知带 stopReason/诊断；父按 4 态处理（§8.5） |

---

## 7. 三屏障检查点与崩溃恢复

### 7.1 三屏障（fail-closed）

| 屏障 | 时机 | 必须先落盘的东西 | 失败后果 |
|---|---|---|---|
| **B1 请求前** | 每次模型请求之前 | 请求 envelope（模型/参数/工具集/消息序列哈希）、本 Step 开始标记、当前 Frame revision、预算快照 | 写失败 → 不请求模型；Turn 失败（fail-closed） |
| **B2 顶层副作用前** | 每次顶层工具 dispatch 之前（在 pre-execute 与 guard 之后） | `tool_call`（id/name/冻结参数/权限 decision/stepId） | 写失败 → 不进入工具体；返回规范错误/停止 |
| **B3 每步之前** | 下一个 Step 派生请求之前 | 上一 Step 的响应 + 有序工具结果全部 flush；`step/end` | 写失败 → 不带不完整的信任继续；Turn 失败 |

**补充规则**：

- 检查点只对**顶层调用**生效；嵌套调用复用外层屏障（避免重复 flush/漏 checkpoint）。
- 未完成的 assistant 流保持 transient（不落盘）；被中断的工具以“结果未知”恢复，绝不自动重试。
- 检查点写与取消竞争：flush 成功再处理取消；flush 后已 abort → 返回 `ABORTED_BEFORE_DISPATCH`，绝不进工具体。
- 三屏障由事件日志持久化层统一实现；Loop 只调用“落盘并等待成功”的接口，不自己拼。

### 7.2 检查点内容

| 字段 | 内容 |
|---|---|
| `checkpointId` / `barrier` / `at` | 标识与屏障类型/时间 |
| `cursorSeq` | 已持久化的最后事件 seq（恢复游标） |
| `sessionId` / `turnId` / `stepId` / `specId@version` | 归属与绑定 |
| `openTurn` / `openStep` | 是否仍有未关闭的 Turn/Step |
| `pendingCalls[]` | 未结算工具调用：`{toolCallId, status: dispatched / not_started / unknown}` |
| `frameRevision` / `frameDigest` | 恢复 Frame 的依据 |
| `surfaceGeneration` | surface 视图代数（压缩/撤回后前进） |
| `budget` | steps/modelCalls/tokens/cost/deadline |
| `tasksInFlight[]` | 正在执行的 Task + writeScope + 子代理 id |
| `resumePoint` | 下一步从哪里继续（引用 task/phase/segment） |
| `ledgerSeq` | 对应 Ledger 最后一条 |

### 7.3 写下顺序（每次都一样）

```text
事件 append（单写者事务） → flush/commit 成功 → 才允许下一个动作
   ├─ 模型请求：B1 → 发请求
   ├─ 工具：pre-execute → guard → B2 → dispatch
   └─ Step：结果 flush + step/end → B3 → 下一 Step
```

**不允许**：先发请求/先执行，再补日志；日志写失败继续执行。

### 7.4 崩溃恢复协议（启动时，固定顺序）

1. **拿写所有权**：单实例文件锁 + 会话写锁；同会话并发 resume 直接拒绝（DSH 借鉴）。
2. **读日志尾部**：跳过撕裂尾（不完整行），以最后完整 seq 为游标；校验事件序列（`(sessionId, seq)` 唯一、无洞）。
3. **关闭开放 Turn/Step**：追加 `interruptedTurnClosers`——合成未结算工具结果（`TOOL_NOT_STARTED` / `TOOL_OUTCOME_UNKNOWN` / `ABORTED_BEFORE_DISPATCH`）+ 补 `step/end` + `turn/end{interrupted}`。**不做 partial-turn resume**：只关闭、补齐配对、然后继续。
4. **重建 surface**：transient 流不落盘；已提交文本保留；未完成回复在 UI 投影为“已撤回/已中断”（不显示半截）。撤回/压缩的替换关系按日志重放。
5. **对账 Frame/Ledger/Task/Spec**：按 §7.5 的恢复表修复不一致；每一处修复写一条 `recovery` Ledger 行（不静默）。
6. **处理未知副作用**：**【已拍板·用户 2026-11-06 授权 lead：Q4】** `OUTCOME_UNKNOWN` 的写操作 → 相关 Task 标 `blocked`（或 `waiting_person`），生成一条“需要核对”的用户可见状态，并给用户 **“查外部状态 / 重试 / 标记完成”三选一**；**不自动重试**；只读/幂等操作才允许按重试预算自动重试。
7. **确定恢复点**：`SELECT … WHERE status != 'verified' ORDER BY order_index` 取第一个未完成 Task（18 §8.4）；结合最近检查点/中断点重建 `resumePoint`。
8. **恢复 Loop**：从恢复点进入 Step 循环（通常先做一次 ANSWER/状态说明 + 继续执行）；恢复过程本身不重放用户 prompt（Codex 教训：续跑基于 session id + 历史，不重发 prompt）。
9. **恢复完成后**：更新 `turn/end` 与 `checkpoint`，发 SSE `replay.reset`/状态；通知用户一句“已从中断点继续”。

### 7.5 Ledger 恢复协议（append-only）

**Ledger 行类型与恢复用途**：

| kind | 何时写 | 恢复用途 |
|---|---|---|
| `stage` | Spec 阶段迁移（成功/拒绝） | 确定当前阶段与最后一次合法状态 |
| `gate` | 门禁检查结果 | 判断某迁移是否曾通过/被拒 |
| `verdict` | 双裁决结果 | 重建未完成的审查/修复环 |
| `fix_round` | 每轮修复（含 findings 摘要、执行者、结果） | 判断修复环从第几轮继续；末行为 fix_round → 续轮 |
| `ruling` | 偏离 Plan/绕过门的裁决 | 权威例外，永不删除；恢复时保留 |
| `adjudication` | 超限/争议裁决 | 决定 blocked 还是继续 |
| `close` | 收尾/归档 | 决定是否已关闭；幂等重放 |
| `recovery` | 恢复修复动作 | 审计每次恢复做了什么 |

**恢复对账表（Ledger × Task × Spec）**：

| 现象 | 可能原因 | 恢复动作 |
|---|---|---|
| Ledger 有 `verdict(pass)`，Task 仍 `done/doing` | 崩溃在写 Task 前 | 重放 verdict → Task 置 `verified`（幂等）；写 `recovery` |
| Task `verified`，但 Ledger 无对应 verdict | 不应发生（门禁写顺序错） | 视为不一致：Task 退回 `done`（待审），重建审查任务；记 `ruling`/`recovery` |
| Task `done`，双裁决缺一 | 审查未完成 | 路由到“待审查”；不入 verified；进度仍以 Task 状态为准 |
| 存在开放 `fix_round`（末行） | 修复中崩溃 | 从该轮继续；轮次≤5；超限走裁决 |
| Spec 状态 `verified`，但 Handoff/候选记忆缺失 | 收尾中崩溃 | 保持 `verified`，补 Handoff/候选（幂等），记 `recovery` |
| Spec 状态与 Ledger 最近 `stage` 不一致 | 迁移写了一半 | 以 Ledger 最后合法状态为准回退/前滚；记 `recovery` |
| 证据引用缺失/不属于本 Task | 数据损坏/越权 | 该 Task 置 `blocked` + 需人核对；不得伪造证据 |
| 归档状态与未完成 Task 冲突 | 错误归档 | 恢复为只读；如需继续走 reopen（记 Ledger） |

**硬规则**：Ledger **append-only**；`UNIQUE(specId, seq)`；禁止修改/删除历史行；恢复只追加；哈希链（prevHash/hash）属 P1（v0 不做，但字段预留）；"a silent discard is forbidden"（Superpowers 借鉴）。

> **对齐 design/18 v0.2**：状态 = `fold(event_log)`；LLM/工具调用先落 `activities` 再推进（Temporal 纪律，重放复用记录、不重算）。本稿的检查点是 `event_log` 之上的 durable 投影，恢复=重放事件 + 不重算副作用；`activities` 的具体字段本稿未展开，**待对齐**（以 18 §8 为准）。

### 7.6 恢复的边界（明确不承诺）

- **不保证**正在执行的外部动作恰好一次（只能保证“不自动重试 + 三态标记 + 人可核对”）。
- **不恢复**进程内内存态（队列、正在跑的 LLM 流、子代理进程）；子代理需可重新派发或按 report 恢复。
- **不重放**已结算 Turn；只补未闭合 Turn。
- **不修复**用户可见的历史错误（只追加更正/新状态）。
- 跨机器/多副本恢复不在 V1。

### 7.7 恢复的可测断言

1. 崩溃点之后重启：不产生重复副作用（写文件/发消息次数 = 1）。
2. `OUTCOME_UNKNOWN` 的工具在恢复后被标记为未知，且没有自动再次执行。
3. 未完成回复在对话中显示“已撤回/已中断”，不显示半截文本。
4. 恢复后从第一个未完成 Task 继续，不重放已完成 Task。
5. 恢复写入都可在 Ledger 中查到 `recovery` 行（无静默修复）。
6. 事件序列无洞、无重复；重放后的模型可见内容与崩溃前一致（surface 视角）。

---

## 8. 子代理派发接口（Superpowers 三文件 + 双裁决 + 修复环）

### 8.1 编排形状与预算

```text
主 Loop（秘书，depth 0）
  └─ 派发 Task → 专家实例（depth 1，只执行不对话，不再派子代理）
        └─ 返回 report + Evidence + Handoff（不直接回用户）
  └─ 派发 Task 审查 → 审查者（depth 1，只读三文件，不跑命令、不派子代理）
        └─ 返回两个 verdict
```

| 项 | V1 默认（建议） |
|---|---|
| 嵌套深度 | **1**（专家/审查者不得再派子代理；prompt 第一段写死） |
| 并发 | 实现类 ≤2；审查类 ≤2；与实现并行仅限“无共享状态的独立调查” |
| 预算 | 每个 Task 的 token/cost/时长上限 + 全 Spec 树级上限；**满则拒绝新派生，不排队**（DSH/Claude 借鉴） |
| 计划模式 | 父在 `plan` 模式时，子代理**仍以 plan 模式运行**（防止用委派绕过审阅，Claude 借鉴） |
| 授权固定 | 子代理 prompt 里声明“授权固定、不得自我扩大”；写域=writeScope；越界即拒 |
| 结算方式 | **【Q5 已拍板】默认异步结算通知（completion notice）；仅短任务（阈值可配，V1 建议 ≤60s 或 ≤1 个工具批）或用户明确要求时才阻塞等待**；无轮询 |

### 8.2 三文件交接（物理落 DB，父只传 handle）

| 文件 | 谁写 | 谁读 | 内容（字段） | 预算/约束 |
|---|---|---|---|---|
| **brief** | 控制器（主 Loop） | 专家实例 | `briefId, taskId, specId@specVersion, planVersion, goal, constraints[], nonGoals[], appetite?, acceptanceKeys[], writeScope[], requiredEvidence[], 前序接口/决策, 禁止动作, 风险标记, deadline/budget, 返回契约(report schema), 上下文 handle 列表` | **父不传全文**；≤2K tokens；只给“触发 + 路径/handle + 契约”；**禁止把 Spec 全文/父对话塞入**（字段按 18 v0.2 对齐，`appetite/nonGoals` 的传递方式待对齐 E5） |
| **report** | 专家实例 | 控制器/审查者 | `reportId, taskId, status(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), did, evidenceRefs[]（必须本轮新增）, deviations[] + 理由, open[], artifacts[], next` | ≤3K tokens；必须引用 evidenceId；偏离必须记 Ruling；**只有 DONE 才进审查** |
| **review-package** | 控制器 | 审查者 | `diffRef（产物引用，不内联 diff 本体）, reportId, briefId, spec 片段（只含受影响 Requirement/Scenario/Acceptance）, reviewFocus, 边界声明` | 审查者**只读它**；不跑 git/套件/爬库/派子代理；diff 本体存 artifact |

**纪律**：父只传 `documentId`（handle），不传正文；执行实例按 ID 取 brief，回报按 ID 写 report；文件/DB 是唯一交接载体（Superpowers 借鉴，换成 DB）。需要外部协作时可导出为文件视图，但 DB 是真相。

### 8.3 双裁决（Task done 的定义）

```text
Task.done（进入 verified） :=  SpecCompliance ✅  ∧  Quality Approved  ∧  requiredEvidence 齐
```

| 裁决 | 审查者看什么 | 输出 |
|---|---|---|
| **Spec Compliance** | 对照 Requirement / Scenario / Acceptance：Missing / Extra / Misunderstood；**无法从证据判定的显式记 ⚠️（弃权，不许静默通过）**；**按 18 v0.2 的 `strength` 判**：`must` 缺证据=硬阻塞、`should` 缺证据=警告+理由、`may` 不要求 | `specCompliance: {verdict: PASS/FAIL, missing[], extra[], misunderstood[], cannotJudge[]}` |
| **Quality** | 错误处理/边界/测试是否验真行为/文件职责/是否引入无关改动/可维护性 | `quality: {verdict: APPROVED/NEEDS_FIXES, findings[{severity: critical/important/minor, file, note}]}` |

**规则**：

- 两个 verdict **缺一不可**；缺一 = 不通过。
- **实现者自审不能替代任务审查**（Superpowers 借鉴）；审查者与实现者不是同一实例。
- Critical/Important 未处置不得进入下一 Task；Minor 记 Ledger，不进修复环。
- 审查者能力边界写死（只读、不跑命令、不派子代理），成本可预测。

### 8.4 修复环（≤5 轮，显式状态机）

| 轮次 | 谁修 | 要点 |
|---|---|---|
| 1–3 | **resume 原实现者**（保留上下文） | findings 逐字给出；修完重跑覆盖测试；把修复报告**追加**到原 report；返回短契约 |
| 4–5 | **新派一个更强模型/实例** | 全量任务上下文 + “前 N 次尝试失败，现在由你负责”；避免同一思路死循环 |
| 每轮 | **scoped re-review** | 只看修复 diff；只判“每条 finding addressed / not addressed” + 修复 diff 内新破坏；修复未触达代码的新发现 → non-blocking 记 Ledger，不进环 |
| 上限 | **5 轮** | 超限 → 控制器裁决：①争议/错误 → 记 `ruling` 继续；②真实但不承重 → 记 known-open 继续；③真实且承重（后续依赖/暴露 plan 缺陷）→ **BLOCKED 停止问人** |
| 终审 | 整支 Spec | 只允许**一波**修复 + **恰好一次** scoped re-review（Superpowers 借鉴） |
| 铁律 | — | **无静默丢弃**（每个 finding 有去处）、**无提前退出**、裁决只在封顶时做；Minor 从不进环 |

**状态机**：`REVIEW → FIX_ROUND(n) → REVIEW_SCOPED → (pass: VERIFIED | fail≤5: FIX_ROUND(n+1) | fail>5: ADJUDICATE → LEDGER_CONTINUE | BLOCKED)`；每轮写 `fix_round` Ledger 行。

### 8.5 结算与失败（两段式）

| 阶段 | 失败表现 | 父侧处理 |
|---|---|---|
| **发布前失败**（能力不支持/无权限/重复子代理/预算不足/路由预检失败） | 工具直接抛错 = 模型可见的 errored result | 模型可换方案/拆任务/问人；Turn 继续 |
| **发布后失败**（执行中失败/超时/取消） | 走 completion notice（带 stopReason、诊断、已做部分） | 父按 4 态路由：NEEDS_CONTEXT → 补 brief；BLOCKED → 控制器裁决；DONE_WITH_CONCERNS → 进审查并标注；DONE → 进审查 |
| **父选择等待** | 异步通知到达前需要该结果 | 进入 `waitingOn.subagent`；可被用户 steer/取消；心跳不静默 |
| **子代理无进展** | stall watchdog（“停止产出”≠总时长上限） | 父可见状态 + 中止/重派选项；V1 子代理有 wall-clock deadline（补 Claude 之缺） |

> **【已拍板·用户 2026-11-06 授权 lead：Q5】** 子代理默认**异步结算**（completion notice）；**只有短任务（阈值可配）或用户明确要求时才阻塞等待**。父侧在异步期间用 `waitingOn.subagent` + S2 心跳，不静默、不轮询。

**结算通知内容**：`{subagentId, taskId, status, reportId, evidenceRefs[], stopReason, usage{input,output,cost,cached}, startedAt, endedAt}`；作为 `subagent_notice` user-role Item 注入父的 Observe，不直接展示给用户。

### 8.6 输出中和（信任边界）

- 父读子代理最终消息**之前**做指令形态扫描：控制标签（`<system-reminder>` 等）加反斜杠中和；轮次标记（行首 `Human:`/`Assistant:`）加反斜杠；**不删除、不改写原文**；命中加 `[harness: ...]` 标记。
- `agentId`/`subagentId` 放**结构化字段**，不从文本正则提取（Claude 教训）。
- 子代理报告不直接进对话；父转述时只给摘要 + 指针。

### 8.7 与 Spec/Plan 的关系

- brief 只带**受影响片段**（Requirement/Scenario/Acceptance）+ 前序接口/决策；父不把 Spec 全文交出去（INV / 18 §6）。
- 专家不写 Spec；发现需求变更 → 交 `spec_delta_candidate`（候选），由秘书单写者合并（18 §11 的 Q4 建议默认，非本稿 Q4）。
- Task `verified` 后，Loop 才允许收尾/推进 Spec 阶段；Evidence 由框架写，模型不能伪造。

---

## 9. 上下文组装与压缩（Loop 侧接口；细节见 E2/design/20）

### 9.1 组装接口（Loop 只调用，不实现算法）

| 输入 | 输出 |
|---|---|
| `specView`（阶段 + 受影响 Requirement/Acceptance 片段 + 任务摘要）、`frame`、`task brief`、`memoryView`（常驻 + 检索 + 冲突提示，作用域）、`surface`（对话已提交消息 + compact_boundary）、`recentResults`（工具/子代理）、`persistentRules`、`envFacts`、`budget` | `request`（messages/tools/system 段）、`tokenEstimate`、`breakdown`（system/tools/memory/dialogue/results）、`provenance[]`、`untrustedBlocks[]`、`needsCompaction` |

**不变量**（可测，对应 design/17 L1-9）：

1. **每个注入项可追溯到事件 id**（INV-1）。
2. **记忆条目不可静默丢**：预算不足时显式降级为“摘要 + 指针”并告知用户，不允许悄悄删除。
3. **持久规则每步重注入**（压缩后也注入），与压缩解耦（16 D7 借鉴）。
4. **被撤回文本不得重新进入模型上下文**；surface 视角只含未撤内容。
5. **不可信内容统一封装**（来源 + 标签 + 转义 + 预算），不直接触发写操作。
6. **顺序确定**：同一状态组装结果稳定（便于回放与 hash 对账）。

### 9.2 压缩触发与顺序（引用 E2，Loop 只负责触发/事件）

| 触发 | 时机 | 动作 |
|---|---|---|
| **主动** | 组装前估算 > 阈值（如 `floor(min(W×0.8, W−O−65536))`，DSH 借鉴；具体值 E2 定） | 先剪工具输出（无模型调用）→ 仍超 → 摘要（一次辅助请求）→ 替换 surface → `compact_boundary` |
| **被动** | provider 返回 `CONTEXT_WINDOW_EXCEEDED` | 绕过阈值做最大平衡缩减，成功后重试一次；仍失败 → 降级（摘要 + 指针）并可见说明 |
| **收尾后** | Turn 关闭后（可选，Codex 借鉴） | 若活跃上下文占比高，关闭后补一次压缩，避免下一 Turn 开局就超 |
| **手动** | 用户要求“压缩/整理上下文”（P1） | 同主动路径 |

**Loop 侧要求**：

- 压缩是**事件**（`compaction/start → summary → replace → end`），未闭合的 start 视为锁（宁可 busy 不可重入）。
- 压缩**替换而非追加**；原事件保留（INV-4）。
- 压缩后必须重注入持久规则 + 当前阶段/下一步门禁短段（≤20 行），并重新派生 Frame 所需摘要。
- 压缩失败不阻塞主流程：降级为“摘要 + 指针”，并在对话里说明“这部分按摘要处理”（13 D8）。
- 压缩/撤回/裁剪共用 surface 区间替换机制（16 D5 借鉴）。

### 9.3 不可丢清单（压缩时硬保留）

1. 当前 Spec 阶段 + 受影响 Acceptance/约束（片段）。
2. 当前 Frame 的 `goal/constraints/acceptance/selfDecisions/mustAsk`。
3. 未完成 Task 的 brief 摘要 + writeScope + requiredEvidence。
4. Evidence 引用（不丢指针；明细不进上下文）。
5. 未结算工具调用/子代理的 handle 与三态状态。
6. 持久规则（重注入）。
7. 最近 K 条对话（逐字保留比例由 E2 定）。
8. 不可信来源标签（重放时仍需标注）。

---

## 10. 事件流（SSE）

### 10.1 事件分层与命名

> 命名约定：领域.动作（小写英文，点分隔）；暴露给前端的 SSE `type` 与内部事件 type 一一对应（可加 `visibility` 过滤）。**对话流事件与执行轨迹事件分开**，前端按 `visibility` 订阅。

| 分组 | 事件（示例） | 默认可见 |
|---|---|---|
| 会话/连接 | `session.ready`、`session.updated`、`replay.reset`、`snapshot` | 三栏/诊断 |
| Turn | `turn.started`、`turn.waiting`、`turn.resumed`、`turn.completed`、`turn.failed`、`turn.interrupted` | 状态 |
| 响应（S0/S1/S2） | `ack.received`、`segment.started`、`segment.delta`、`segment.completed`、`heartbeat`、`message.retracted` | 中栏 |
| 消息 | `message.started`、`message.completed`（含 role/visibility） | 按 visibility |
| 工具/Item | `item.started`、`item.completed`（tool_call/tool_result/plan_update/permission） | 执行轨迹（折叠） |
| 权限 | `permission.requested`、`permission.resolved` | 中栏（确认问题）+ 轨迹 |
| 检查点/压缩 | `checkpoint.saved`、`compaction.started`、`compaction.completed`（`compact_boundary`） | 状态 + 轨迹 |
| 子代理 | `subagent.dispatched`、`subagent.progress`、`subagent.completed` | 右栏 + 轨迹 |
| 进度/产物/提示 | `progress.updated`、`artifact.ready`、`notice` | 右栏/顶栏 |
| 结果 | `turn.result`（含 subtype/usage/cost/stopReason/sessionId/turnId） | 中栏摘要 + 诊断 |

### 10.2 字段与 id

| 字段 | 规则 |
|---|---|
| `id`（SSE id） | `<sessionId>:<seq>`；seq 为该会话事件日志单调递增；恢复后从日志续号，**绝不复用** |
| `type` | 上表事件名；未知类型前端忽略但计数（向前兼容） |
| `sessionId` / `turnId` / `stepId` / `itemId` | 归属；Turn/Step 可空（系统事件） |
| `at` | 事件时间（可注入时钟；回放一致） |
| `visibility` | `dialogue / trace / audit`；前端据此分栏 |
| `payload` | 按类型的结构；大内容用 `contentRef`/`artifactRef`，不内联 |
| `schemaVersion` | 事件 schema 版本；消费者忽略未知字段 |
| `retracted`/`invalidated` | 只用于 surface 投影，不删原事件 |

### 10.3 终止与幂等（“每个流恰好一个终止事件”）

| 流 | 开始 | 终止（恰好一次） |
|---|---|---|
| Turn 流 | `turn.started` | `turn.completed` / `turn.failed` / `turn.interrupted`（含 `result` 字段） |
| 消息流 | `message.started`/`segment.started` | `message.completed` / `message.retracted` |
| 模型流（内部） | llm stream | 成功/error/aborted 三选一；记录 `llm/stream-end` |
| 子代理流 | `subagent.dispatched` | `subagent.completed`（含 stopReason） |

**规则**：result 之后可能还有尾随事件（如心跳/状态），**前端必须迭代到流结束再 break**；不要见到 result 就断开。每个终止事件带 usage/cost（如适用）。重复事件按 id 去重；同一 id 内容不可变。

### 10.4 断线续接

| 场景 | 服务端行为 | 客户端行为 |
|---|---|---|
| 正常断线重连 | 客户端带 `Last-Event-ID`；服务端从该 seq 之后重放**surface 投影后的事件**（撤回/压缩已生效） | 按 id 去重后追加 |
| id 过旧 / 已被压缩/清理，无法完整重放 | 发 `replay.reset` + `snapshot`（当前对话 surface 快照 + 最新 seq） | 丢弃本地增量，以快照为准，重置游标 |
| 长时间离线 | 重新拉取 snapshot；只补“结果/状态”事件，不补流式 delta | 显示“已重新同步” |
| 事件乱序/缺口 | 服务端严格按 seq 写；客户端发现缺口 → 请求重放；不自行猜测顺序 | 不渲染乱序内容 |
| 心跳 | 每 ≤10s 一条 `heartbeat`（无新内容时）；≥5s 空窗必须发心跳（13 S2） | 超时判定连接劣化 |

**SSE 幂等**：事件 id 即日志 seq，天然幂等；重放不产生新事件；客户端提交命令用 `commandId` 幂等。

### 10.5 与前端三栏的对应

| 区域 | 订阅事件 | 展示内容 | 禁止 |
|---|---|---|---|
| **左：会话树** | `session.updated`、`progress.updated`（汇总）、`turn.waiting`（未决提示） | 会话/子会话、生命周期（进行中/空闲/已归档）、未读/未决标记 | 不显示 Spec/阶段名 |
| **中：对话** | `ack.received`、`segment.*`、`message.retracted`、`permission.requested`、`notice`、`turn.result` | 双方消息按时间；S0/S1/S2；“已撤回”标记；确认问题；结果摘要 | 不显示工具 JSON/内部 ID/Spec 词；“排队”字样 |
| **右：长任务列表** | `progress.updated`、`checkpoint.saved`、`artifact.ready`、`subagent.*`、`turn.waiting`、`turn.interrupted` | 执行中+已完成任务；阶段/步骤；阻塞/待确认；产物入口 | 不显示会话本身（只放执行任务） |
| **执行轨迹（折叠/单独窗口）** | `item.*`、`compaction.*`、`permission.resolved`、错误细节 | 工具调用/结果、子代理、检查点、压缩边界 | 不混入对话流 |

### 10.6 用户可见措辞（Spec 不可见）

| 内部动作 | 用户侧（允许） | 禁止 |
|---|---|---|
| Spec 建立/更新 | “好的，我记下了 / 我按这个理解做” | “Spec / 规格 / 需求文档” |
| Spec 澄清 | “你说的 X 是指 A 还是 B？” | “基线 / 增量 / 验收标准” |
| Plan 需确认（风险门） | 方案摘要 + “确认这么执行吗？” | “Plan / Task / 门禁” |
| 执行进展 | “正在做第 2 步：……” | “Spec 阶段 executing” |
| 验证/收尾 | “结果如下……这样可以吗？” | “双裁决通过 / verified” |
| 阻塞 | “需要你定一下：……” | “Spec blocked / 门禁拒绝” |
| 归档 | 不说；除非用户问 | 暴露状态机 |

**禁用词扫描**：Spec/规格/需求文档/验收标准/基线/增量/排队/请稍候（I5）→ 作为 SSE 文案与前端文案的 CI 规则。

---

## 11. 失败、降级、预算与指标

### 11.1 失败分类与降级（承接 13 §10，补 Loop 特有）

| # | 触发 | 降级行为 | 用户可见 | 恢复 |
|---|---|---|---|---|
| F1 | S1 超时（>4s） | 发模板段“我理解到的是 X，正在做 Y”，不等模型（D1） | 一句计划 | 模型返回后接正常 S1 |
| F2 | 分类/歧义判定失败 | 复述 + 等确认；不自行执行到底（D2） | 一句确认请求 | 用户 Ack/否认 |
| F3 | 模型超时/不返回（>30s） | 心跳 + 三选一（继续等/换说法/按现有信息做）（D3） | 明确选项 | 用户选择/模型恢复 |
| F4 | 执行体无进展（>60s 无 progress） | 显示“执行中但无新进展”；可中止/重派（D4） | 状态 + 中止入口 | 执行恢复/重派 |
| F5 | 上下文超限 | 压缩 → 仍超 → 摘要+指针，并说明（D8） | 一句说明 | 预算恢复后补细节 |
| F6 | 检查点写失败 | **fail-closed**：不继续；Turn 停 | “这次没记下来，先停住” | 重试/人工 |
| F7 | 工具超时 | 结果 `TOOL_TIMEOUT`，Turn 继续；可换工具/问人 | 进度提示 | 模型换方案 |
| F8 | 有副作用结果未知 | 不自动重试；Task/Step 挂起或 blocked（Q4 已拍板） | “这一步结果需要核对，我先停；查外部状态 / 重试 / 标记完成，三选一” | 查外部状态/人工核对 |
| F9 | 子代理发布前失败 | 模型可见 errored result | 视上下文 | 换方案/拆任务 |
| F10 | 子代理发布后失败 | 结算通知 + 4 态路由 | 状态摘要 | 补 brief/重派/裁决 |
| F11 | 修复环超限 | 裁决：继续（记 ruling）/ BLOCKED 问人 | 一句说明 + 问题 | 人裁决 |
| F12 | 预算软限 | 完成当前响应后停；砍后台增值任务 | “到预算上限，先停” | 调预算/继续 |
| F13 | 预算硬限 | 响应前拒绝新请求；停子代理 | “预算用尽” | 调预算 |
| F14 | SSE 断线 | 重连续接/快照重置（§10.4） | “重连中” | 补齐后继续 |
| F15 | 重复调用/死循环 | 同工具同参数 ≥3 次 → 提醒/停；强制重规划 | “我在重复一个操作，先停下确认” | 人/重规划 |
| F16 | 阶段/权限拒绝 | 结构化拒绝 + 原因；不静默绕过 | 可解释的拒绝 | 换方案/问人 |
| F17 | Spec 版本漂移 | 冻结失效 → 回 confirmed 重对 | “需求变了，我重新对一下” | 重新确认 |
| F18 | 恢复失败（日志损坏） | 只读降级：展示最后可读状态；禁止继续写 | “数据需要修复” | 备份/人工 |

**三条铁律**（13 §10）：降级必须可见；降级不丢已确认约束；降级不编事实。

### 11.2 预算分层与到限动作（Q3 已拍板；数字仍待实测校准）

> **【已拍板·用户 2026-11-06 授权 lead 拍板：Q3=A】** **软上限默认 + 可配置硬熔断**；软上限允许最后一个响应 + 子代理尾巴完成并计入，必须留 headroom。硬熔断默认关闭，用户显式要求时开启。
>
> 17 §6.2：**目标值一律 TBD，先采基线**。下表是工程默认值，不是验收承诺；数字必须在 M2 基线后校准。

| 层级 | 计量 | 建议软限 | 建议硬限 | 到限动作 |
|---|---|---|---|---|
| **Step** | 模型调用数 / 工具调用数 / step token | 模型 2 次/step；工具 8 次/step | 可配 | 超出 → 判断“继续/停”，不静默 |
| **Turn** | steps / wall-clock / token / cost | steps 20；wall-clock 10min；token 120K；cost 可配 | steps 32；wall-clock 15min；token 200K | 软限：完成当前响应后停（`budget_soft`）；硬限：立即停（`error_max_budget`） |
| **Spec** | turns / token / cost / 时长 / 修复轮次 | turns 50；token 1M；2h；fix≤5 | 按需 | 到限 → 收尾/阻塞，给出“已完成/未完成/后续” |
| **委派树** | depth / 并发 / 子树 token | depth=1；并发 2；子树 300K | 满则拒绝派生（不排队） | 父可见状态；不静默失败 |
| **全局** | 日 token/cost | 可配 | 可配 | 拒绝新 Turn/新派生；保留只读 |

**诚实语义**（Claude 借鉴，Q3 已拍板）：软上限允许“触发上限的那个响应完成并计入”+ 子代理尾巴，所以**实际可能超支**；报告必须写清并留 headroom。硬熔断在响应前按累计预估拒绝，会误杀，默认关闭（可配置）。

### 11.3 卡死/循环检测

| 信号 | 阈值（建议） | 动作 |
|---|---|---|
| 无 durable progress（无新事件/无工具结果） | >60s | S2 状态 + 心跳；显示“执行中但无新进展” |
| 仍无进展 | >5min | 三选一：继续等 / 中止重派 / 换方式；写中断点 |
| 同工具同参数重复 | ≥3 次 | 提醒 + 强制重规划（不直接杀） |
| 同 Task 修复轮次 | >5 | 裁决（§8.4） |
| Turn 步数/预算 | 见 §11.2 | 停 |
| 子代理无输出 | 按 stall watchdog | 父可见 + 中止/重派 |
| SSE 空窗 | >10s | 服务端补心跳；客户端判定连接劣化 |

### 11.4 指标清单（Loop 核心 12 个，映射 E0/L3）

| # | 指标 | 口径 | 来源 | 对应 design/17 |
|---|---|---|---|---|
| E1-M01 | 首响 S0 | 消息到达→首个可感知信号 | 事件时间戳 | M01 |
| E1-M02 | 首实质 S1 | 消息到达→首个实质 token | 事件时间戳 | M02 |
| E1-M03 | 无响应空窗 | 相邻可见事件最大间隔 | 事件流 | M03 |
| E1-M04 | 撤回时延 `t_retract` / 重答 `t_reanswer` | 快判→撤回完成→重答首 token | 事件 | M04/M05 |
| E1-M05 | **误撤回率** | 撤回后用户要求继续/恢复 / 撤回次数 | 撤回+后续消息 | M09（与 M04 一起看，防“抢话”） |
| E1-M06 | steer/queue 吸收时延 | 消息到达→在检查点被吸收 | 事件 | 新增 |
| E1-M07 | 步/轮时延与模型调用数 | 每 Step/每 Turn 的模型请求数、工具数、耗时 | 事件+计量 | 新增 |
| E1-M08 | 工具结果分布 | ok/error/timeout/cancelled 三态计数、重试次数 | 工具事件 | 新增 |
| E1-M09 | 检查点/恢复 | 检查点写时延、失败数、恢复成功率、重复副作用数（目标 0） | checkpoint/recovery | M13 |
| E1-M10 | token/成本 | 每 Step/Turn/Spec 的 token（含缓存）、cost、预算到限次数 | 单一计量 | M07 |
| E1-M11 | 上下文压力/压缩 | 请求压力、压缩次数/耗时、压缩后 token 降幅、记忆丢失断言 | 计量+压缩事件 | 新增 |
| E1-M12 | 治理/门禁 | 双裁决通过率、fix 轮次分布、ruling/adjudication 数、blocked 原因直方图、非法阶段动作拒绝数 | Ledger | M12/M14 等 |
| E1-M13 | SSE 续接 | 重连次数、重放事件数、去重数、快照重置数 | 事件 | L1-12 |

**8–10 个核心**：E1-M01/M04/M05/M08/M09/M10/M11/M12 + 成本/预算。**指标必须可归因**（模型慢/分类慢/撤回失败/执行慢/连接），否则调优是瞎调（13 §13.3）。

### 11.5 与 E0 评测的接口（E1 交付物）

**判定点清单**：见 §4.9（P-T1…P-A6），每个都有可观测事件与断言；这是 E1 对 design/17 §7.3 的“必须自带”。

**建议新增/复用的 L1 用例**（design/17 §2.2）：

| L1 | 覆盖 E1 判定点 |
|---|---|
| L1-1 意图分类与路由 | turn tier / 开新 Turn / steer / queue |
| L1-2 快判撤回 | P-I1 / P-I3 |
| L1-3 歧义 | P-A3（问≤1）/ P-I6 |
| L1-6 工具调用 | P-A1 / P-I2 |
| L1-7 撤回正确率 | P-I1 / P-I4 |
| L1-8 中断点 | P-A4 / P-I5 |
| L1-9 上下文装配 | P-A6 |
| L1-10 权限求值顺序 | P-I6 |
| L1-12 事件/SSE 契约 | P-A1/A4 + 续接 |
| **新增建议 L1-13** | Turn/Step 状态迁移与终止类型（P-T1…T6） |
| **新增建议 L1-14** | 三屏障与恢复（合成 closers、无重复副作用）（P-I5/A4） |
| **新增建议 L1-15** | steer/queue 判定表（P-I3/I4） |

**≥2 条 L2 场景（个人助理场景，design/15 §2.1；都需 WITH/W/OUT 消融臂）**：

| Case | 步骤（3–5 步） | 隐藏期望 | graders | 消融臂 `W/OUT` |
|---|---|---|---|---|
| **E1-L2-01 打断与重答** | ①“帮我把下周待办排一下并写周计划” ②流式中“不对，先别排日程，先把清单按优先级列出来” ③“补充：只列工作项” | 旧回复撤回（不显示内容）；重答体现“只列清单、不排日程、只列工作项”；不产生日程写入；每 Turn ≤1 问 | `regex`（已撤回/不含被撤内容）、`forbidden`（日程写入=0）、`state_delta`（待办未变）、`trajectory_shape`（问≤1、无重复工具≥3）、`timerange`（t_retract 区间） | 关闭“抢占/撤回”，退回整段说完再听；`t_retract` 作指示器（arm both，design/17 R2） |
| **E1-L2-02 工具未知结果与恢复** | ①“读 A 文件并生成摘要文档” ②注入：写操作 dispatch 后进程崩溃/工具未知 ③重启后继续 | 不重复写文件；`OUTCOME_UNKNOWN` 被标记；恢复后任务 blocked/需核对；无伪造结果；对话显示“已中断/已撤回”而非半截 | `file_exists`（文件=1）、`state_delta`（任务状态/证据）、`forbidden`（第二次写=0）、`tool_used`（次数=1）、`trajectory_shape`（出现等待/核对） | 关闭“三屏障/恢复”，崩溃后重复执行或丢状态；测“恢复”机制的价值 |
| **E1-L2-03 真歧义与委派** | ①“把那个提醒关掉”（两个候选） ②回答选择 ③“确认后执行” | 只问 1 个问题（2–3 选项+建议）；确认前不删除/不改状态；回答作为 steer 并入当前 Turn；执行后结果可查 | `regex`（问题格式）、`forbidden`（确认前删除=0）、`tool_order`（先读后写）、`state_delta`（提醒状态）、`trajectory_shape`（问=1） | 关闭“歧义确认”，默认选一个执行；测“先问”的价值 |

**评测纪律**：每个 case 独立临时数据目录/DB/注入时钟/回放模型；case 对被测 agent 隐藏；排除规则随 case 版本化（design/17 §3.4/§3.5）。

---

## 12. V1 范围 / P1 / 已拍板

### 12.1 V1 范围（E1 相关）

| 项 | V1 做 | 依赖 |
|---|---|---|
| Session/Turn/Step 三层状态机 | 三层 + 六决策 + 判断四分支 | M1 事件日志 |
| 五类消息 | system/assistant/user/stream/result；可见性三分 | M1 |
| Intent Frame | 13 §6.1 字段 + Spec 绑定 + 预算/停止策略 | M2 |
| 连续交互 | S0/S1/S2；快判/慢判；steer/queue；撤回；歧义≤1；中断点 | M2 |
| 工具管线 | 五段 + 六步权限（简化状态机）+ 三态取消 + 只读并行/写串行 | M2 判定、M5 执行 |
| 三屏障 + 恢复 | fail-closed、B1/B2/B3、合成 closers、Ledger 对账、恢复协议 | M1 |
| 子代理接口 | depth=1、并发≤2、三文件（DB handle）、双裁决、修复环≤5、异步结算 | M5 真实子代理；M2 mock 规则 |
| 上下文 | 组装接口 + 压缩触发/事件/降级（算法 E2） | E2/M2 |
| SSE | 事件类型/id/终止/续接/三栏投影 | M1 |
| 预算/指标 | 分层预算（软上限默认）、stall、12 指标埋点 | M1 计量/E0 |
| 阶段门禁 | 调 SpecCore 阶段门禁 + **`canArchive(specId)` 唯一归档入口**（18 v0.2）；阶段→决策允许表；Spec 不可见投影 | 18/M2/M5 |

### 12.2 P1 / 暂缓（不在 v0 实现承诺）

| 项 | 原因 |
|---|---|
| 多子代理后端（ACP/Codex/Claude 外部后端）、workflow 脚本编排 | 单机 V1 不需要；先固定“派发 seam + 一进程内专家” |
| 会话/ Turn fork、跨 Turn 回滚（thread/revert 式） | V1 固定会话；恢复只到检查点；P1 再支持分叉 |
| 分布式/多副本、跨机恢复、一致性哈希 | 单机本地 Web（10 §2）；不做分布式锁 |
| 30+ hook 事件、完整六模式权限、托管配置 5 层 | V1 只做 5–6 核心事件 + 四模式（default/ask/plan/auto） |
| 工具/文档延迟加载（Tool Search）、动态工具、MCP 全量 | 工具少时不需要；留扩展点 |
| 多模型路由、推理强度/effort 调节、模型级自动降级 | 先一个 provider + mock；换模型不改语义 |
| 跨设备/多渠道会话、Channels 事件注入 | V1 本机 Web；P1 再做 |
| 记忆自动生成/每日复盘（人格偏好层） | 用户明确暂缓（10 §14；12 §2.8） |
| 预算硬熔断的精确预估、成本预测 | 先软上限 + 事后记账；硬熔断可配置但默认关 |
| 完整哈希链、Ledger 加密/签名 | v0 不需要防篡改到密码学级；字段预留 |
| 自动“结果未知”外部状态探测工具 | 先人工/只读核对；后续再做探测适配器 |

### 12.3 已拍板（用户 2026-11-06 授权 lead 拍板；原 5 个待拍板问题）

> **拍板人：lead；授权：用户 2026-11-06。** 本节已定案，不再阻塞实现；若后续要改，需用户显式 reopen，并按 18 v0.2 的 Decision/ADR 语义记录（改决策要留痕，不得静默改）。

#### Q1. 主 Loop 工具边界 —— 【已拍板 = A】

- **决定**：主 Loop **只读 + 沟通 + 派发 + 候选**；写文件/跑命令/对外发送全部交给专家实例（实现落点 §6.6）。
- **理由**：对齐 10 §4/§6「秘书不下场干活」与 14 §2；单一接口、可审计、权限与预算边界清晰。
- **代价/边界**：多一次交接延迟；P1 可为低风险动作加“就地执行”白名单（需用户再确认，不属于 V1）。
- **影响**：E1 工具白名单、权限求值主体、SSE 轨迹、评测 `forbidden` 清单。

#### Q2. Turn 粒度与 steer 边界 —— 【已拍板】

- **决定**：Turn = 一次用户目标（13 的「步」）；**steer 只在当前 Spec 内立即生效；跨 Spec 一律 queue**，由目标 Spec 的 Loop 自己处理（实现落点 §5.2）。
- **实现约束**：跨 Spec 输入事件带 `targetSpecId`；当前 Spec 的 Loop **不读取、不抢占、不撤回**目标 Spec 的流；目标 Spec 在自己的下一个 Turn 消费。
- **影响**：外层交互判定、事件归属、Spec 绑定校验、评测 case（跨会话 steer 应产生 queue 而非 retract）。

#### Q3. 预算到限 —— 【已拍板 = A】

- **决定**：**软上限默认 + 可配置硬熔断**；软上限允许最后一个响应 + 子代理尾巴完成并计入，报告必须写清“可能超支”并留 headroom；硬熔断默认关闭，用户显式要求时开启（实现落点 §11.2）。
- **影响**：`result` 语义（`budget_soft`/`error_max_budget`）、E1-M10 指标、用户沟通文案。

#### Q4. 崩溃后“有副作用且结果未知” —— 【已拍板 = A】

- **决定**：**不自动重试**；Task/Step 停为 `blocked`/`waiting`，给用户 **“查外部状态 / 重试 / 标记完成”三选一**；只有只读/幂等操作才允许按重试预算自动重试（实现落点 §7.4/§11.1）。
- **影响**：恢复协议、用户打扰频率、评测 P-I5/P-A5、M13（中断点恢复成功率）。

#### Q5. 子代理结算方式 —— 【已拍板】

- **决定**：默认**异步结算**（completion notice）；**只有短任务（阈值可配）或用户明确要求时**才阻塞等待（实现落点 §8.1/§8.5）。
- **影响**：`waitingOn.subagent` 语义、S2 心跳、SSE 事件、M5 实现；异步期间父不轮询。

---

## 13. 与上游的对应、假设与待核实

### 13.1 引用对照

| 本稿内容 | 上游依据 |
|---|---|
| Spec 生命周期与门禁 | 18 v0.2 §3.7/§5/§5.7；10 §30–32 |
| Spec 不可见与投影 | 10 §32；14 §5 |
| 三速/四类消息/撤回/中断点/降级 | 13 §3–§10 |
| Intent Frame | 13 §6.1（本稿加 Spec 绑定/预算/停止策略） |
| 会话/消息归属/三栏 | 14 §5.1b/§5.9/§5.10；13 §11.7 |
| 秘书不下场 / 一个秘书 + 专家 | 10 §4/§6；14 §2 |
| turn/step、管线、三态、三屏障 | 16 D3/D5/D10/D14；research/dsh §1/§8 |
| 五类消息/Result 五态/权限顺序/子代理边界/预算 | 16 D3/D5/D12/D15；research/claude §1/§7/§8 |
| steer/queue/Thread-Turn-Item/goal | 16 D2/D3；research/codex §1/§7/§8 |
| 三文件/双裁决/修复环/Ledger | 18 v0.2 §4–§6；research/superpowers 阶段 4–5 |
| E1 判定点/L1/L2 要求 | 17 §7.3；§2.2/§2.3 |
| V1/P1 与工程默认值 | 14 §9；15 §2.5 |

### 13.1b 与 design/18 v0.2 的对齐状态（任务要求）

> design/18 当前为 **v0.2（2026-11-06）**，已不是 v0.1；本稿按 v0.2 对齐字段/门禁/表命名。下表列出"已对齐"与"待对齐"，避免把差异当定论。

| 项 | 18 v0.2 写法 | 本稿落点 | 状态 |
|---|---|---|---|
| 生命周期 | `draft → confirmed → planned → executing → verifying → verified → archived`，可 reopen；statechart + circuit breaker + `outcome=complete/partial` | §1.2/§1.3/§3.5 | **已对齐**（阶段表+canArchive+outcome） |
| Spec 字段 | `id/sessionId/parentSpecId/status/outcome/appetite/nonGoals/rabbitHoles/glossary/currentVersion/memoryScopeRefs/...` | §3.4 `specBinding`（子集）、§1.3 补充规则 | **已对齐字段引用**；`appetite → budget/stopPolicy` 的换算**待对齐 E5** |
| Requirement/Scenario/Acceptance | EARS 五句型 + RFC2119 `strength` + Gherkin 可观察输出；JSON Schema 校验 | §8.2 brief/§8.3 双裁决（只引用、不重定义 schema） | **已对齐**（brief 传递、verdict 按 strength 判定） |
| 归档门禁 | **`canArchive(specId)` 唯一入口**；`must` 缺证据硬阻塞 | §1.3/§12.1/§3.5 | **已对齐** |
| 表名 | `sc_specs/sc_spec_versions/sc_plans/sc_tasks/sc_documents/sc_evidence/sc_ledger` + `event_log`/`activities` | §2.5/§7.5 | **已对齐表名引用**；`activities` 与检查点/三屏障的字段级映射**待对齐 M1** |
| Spec 与记忆 | Spec = `memory_items` 的 `kind=spec` 内部类型；markdown 仅视图 | §3.5 第 6 条 | **已对齐** |
| 门禁/状态命名 | 状态名 + `canArchive` + Requirement `strength` | §1.3/§8.3 | **已对齐** |
| Decision/ADR vs Ledger | 18 v0.2 新增 `Decision`（proposed/accepted/deprecated/superseded + Y-statement） | 本稿 §7.5 Ledger（ruling/adjudication） | **部分对齐**：需补"Decision ↔ Ledger 字段映射"**待对齐 M1** |

**差异清单（全部标"待对齐"，不影响 v0.1 Loop 机制）**：① `appetite` 如何派生 Turn/Spec 预算与 circuit breaker 触发（E5）；② `activities` 表与三屏障检查点/事件日志的字段级映射（M1 实现）；③ 18 v0.2 `Decision/ADR` 与本稿 `ruling/adjudication` 的 Ledger 字段映射。落地时以 18 v0.2 §8 为准。

### 13.2 假设（会被后续评审替换）

| # | 假设 | 影响 |
|---|---|---|
| A1 | design/18 **v0.2**（2026-11-06）的对象/生命周期/门禁/表名按现有草案成立；差异见 §13.1b（标「待对齐」） | 若 18 再升版，本稿 §1.3/§3.5/§7.5/§13.1b 需同步 |
| A2 | 单机单进程 + SQLite 单写者 + 文件锁成立；无分布式 | 恢复/锁/事件续号方案 |
| A3 | 用户不感知 Spec，所有阶段/门禁必须可投影为对话 | 事件流与文案规范 |
| A4 | 模型支持流式 + 工具调用 + 结构化输出；不支持时走文本解析降级 | 决策解析与 result 契约 |
| A5 | SSE 事件日志保留 ≥24h（或按会话保留），可重放；压缩后保留快照 | 断线续接策略 |
| A6 | E2 已产出 design/20（提供压缩/组装算法与阈值）；E3 提供提示词分层；E5 提供规划算法 | 本稿只定义接口与不变量；细节以 E2/20 为准 |
| A7 | ~~秘书工具边界按 Q1 建议默认 A 暂定（待拍板）~~ **已由 Q1 拍板消除**：主 Loop 只读+沟通+派发+候选 | 工具白名单/权限主体（已定） |
| A8 | 子代理实现形态（goroutine/子进程/外部后端）未定，但接口（三文件 + 4 态 + 结算通知）不变 | M5 实现可替换 |
| A9 | 本稿把 13 的「步」改称 Turn，仅为避免与内层 Step 撞名 | 评审确认术语；若坚持“步”，全稿替换（Q2 的“Turn=一次用户目标”不受影响） |
| A10 | 六步权限的 V1 简化（四模式）由 M2 最终定；本稿只固定“顺序 + fail-closed + 无自动批准清单” | 权限实现 |
| A11 | 18 v0.2 的三处差异（appetite 映射 / activities 字段 / Decision↔Ledger）按 §13.1b 处理，本稿不把它们写成定论 | E5/M1 落地时对齐 |

### 13.3 待核实

| # | 事项 | 为什么 |
|---|---|---|
| V1 | 模型真实能力（流式工具入参分片、structured output 重试、usage 准确性） | 决定决策解析与预算精度；需真模型验证 |
| V2 | SSE 保留窗口与快照成本 | 决定 `replay.reset` 阈值 |
| V3 | 子代理 wall-clock deadline 的实现（goroutine 可取消性） | 补 Claude 的“无 per-subagent deadline”缺口 |
| V4 | 事件日志的写入吞吐（单写者 + fsync 屏障）在本地机器上的实际延迟 | 影响 S1/S2 与检查点开销 |
| V5 | 中文语境下 token 估算误差 | 预算与压缩阈值需实测校准 |
| V6 | 权限矩阵的最终形态（四模式是否够用） | M2 评审 |
| V7 | 上下文压缩与记忆不可丢的具体切分（E2） | 本稿只列不可丢清单 |
| V8 | 18 v0.2 的 `activities` 字段与 `Decision↔Ledger` 映射（§13.1b） | M1 实现前需与 SpecCore 对齐 |

### 13.4 明确不在本稿

- 实现代码/API/表结构 DDL/SSE 编码细节；
- 上下文压缩算法（E2）、提示词分层（E3）、规划算法（E5）、记忆模型（12）、评测框架（17）；
- UI 布局与交互细节（13/14）；
- 具体权限策略文件与沙箱实现（M2/M5）；
- 多用户/多设备/分布式。

---

## 附录 A：一次带 steer 的 Turn 时序（文字）

```text
t0  用户：“帮我把下周待办排一下并写周计划”（新 Turn）
t0+ S0 ack.received
t1  组装 → 决策 ANSWER（先确认理解 + 计划）→ S1 短段
t2  决策 DELEGATE（派发“整理待办”子任务）→ waiting/继续
t3  用户流式中：“不对，先别排日程，先列清单”（改变性 Correct）
t4  快判命中“不对” → 停止生成 → 撤回未完成段（surface 替换）→ 写中断点
t5  慢判：Correct → steer（并入当前 Turn）→ Frame revision++（目标/约束更新）
t6  重答（只答受影响部分）→ 继续执行：只列清单，不排日程
t7  子代理结算 DONE → 观察 report/Evidence → 更新 Task/进度
t8  收尾：双裁决通过 → result(success) → 对话摘要（不暴露 Spec）
```

## 附录 B：崩溃恢复时序（文字）

```text
崩溃前：B1 已有请求记录；B2 已记录 tool_call（副作用可能已发生）
启动：拿写所有权 → 读日志尾部（跳过撕裂尾）→ 补 interruptedTurnClosers
      → 未结算工具结果合成三态（OUTCOME_UNKNOWN）→ 关闭开放 Turn/Step
      → 重建 surface（未完成回复显示“已撤回/已中断”）
      → Ledger/Task/Spec 对账（§7.5）→ 第一个未完成 Task 为恢复点
      → 写 recovery Ledger → 通知用户“已从中断点继续”
      → 进入 Step：先说明状态，再继续；不重放 prompt；不自动重试副作用
```

## 附录 C：借 / 不借清单（速查）

| 来源 | 直接借 | 改造后借 | 不借 |
|---|---|---|---|
| DSH | 三屏障、三态、五段管线、模型可见⟺已记录、区间替换 | checkpoint 落 SQLite、取消与 Ledger 结合 | 进程内 job 图、Cordis、workflow/team/ralph、无 turn 预算 |
| Codex | Thread/Turn/Item、steer/queue、中断请求式、usage 随结束 | Turn=13 的步、goal 三要素压进 acceptance | Item 枚举绑产品、TUI、slash 命令、重发 prompt 续跑 |
| Claude | 五类消息、Result 五态、只读并发/写串行、六步权限顺序、plan 对子代理、预算诚实、输出中和 | 五类→SSE 语义事件；子代理接口→DB 三文件；权限简化四模式；agentId 结构化 | 子进程=session、JSONL、canUseTool 静默绕过、30 hooks、文本正则提 agentId、Workflow 脚本 |
| Superpowers | spec 权威/plan 回链、三文件、双裁决、修复环≤5、Gate Function、bootstrap 重注入 | 文件→DB documents+handle；软门禁→阶段状态机+证据绑定；人审 Spec→风险触发对话确认 | 提示词软门禁、人审 Spec 硬门、全量 TDD 铁律、16 技能、文件即真相 |

## 附录 D：术语索引（本稿）

| 术语 | 含义 |
|---|---|
| **Turn** | 外层推进单元（13 的「步」）；一个目标从提出到结论/等待/撤销 |
| **Step** | 内层单步循环：组装→决策→执行→观察→更新→判断 |
| **Item** | 事件日志最小单元（message/tool_call/tool_result/state_change/checkpoint/subagent/permission/error/notice） |
| **Intent Frame** | Loop 对“这一轮要什么”的结构化理解（含 Spec 绑定） |
| **Six Decisions** | 回答/追问/调工具/派发/等待/收尾 |
| **Judge** | 控制代码执行的继续/停/改/等判定 |
| **抢占检查点** | 段/工具/步/轮边界；撤回、steer、重规划在此生效 |
| **三屏障** | 请求前/顶层副作用前/逐步前的 fail-closed 检查点 |
| **三态取消** | ABORTED_BEFORE_DISPATCH / NOT_STARTED / OUTCOME_UNKNOWN |
| **三文件** | brief / report / review-package（DB documents + handle） |
| **双裁决** | Spec Compliance × Quality，缺一不可 |
| **修复环** | ≤5 轮，1–3 resume 原实现者、4–5 换新实例、scoped re-review、超限裁决 |
| **Ledger** | append-only 过程账本/恢复协议 |
| **Result** | Turn 终态事件，带 usage/cost/subtype |

---

### 版本记录

- **v0（2026-11-06）**：首版。按 task-17 要求，围绕 Spec 生命周期写清双层 Loop（外层交互 + 内层单步）、消息/状态、工具管线、三屏障/恢复、子代理三文件/双裁决/修复环、SSE、失败/预算/指标、V1/P1 与 5 个待拍板问题；附 E1 判定点清单与 2 条 L2 用例（另含 1 条可选），满足 design/17 §7.3 对 E1 的交付要求。
- **v0.1（2026-11-06）**：按**用户 2026-11-06 授权 lead 拍板**定案 Q1–Q5（§12.3）：Q1=A 主 Loop 只读+沟通+派发+候选；Q2=steer 仅当前 Spec、跨 Spec 走 queue；Q3=A 软上限+可配置硬熔断；Q4=A `OUTCOME_UNKNOWN` 不自动重试、给三选一；Q5=子代理默认异步结算、仅短任务阈值内或用户明确要求时阻塞。同步按 **design/18 v0.2** 对齐 Spec 字段/门禁/表命名（§13.1b，差异标「待对齐」），并在正文落点标注拍板（§5.2/§6.6/§7.4/§8.1/§8.5/§11.1/§11.2）。仅改本文，不改其他文档、不写代码。
