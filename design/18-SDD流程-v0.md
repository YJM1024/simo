# SDD 流程设计 v0.3 —— 自研 SpecCore（借鉴 OpenSpec / Superpowers / 相邻领域，不直接采用）

> **状态**：供讨论的设计稿，**不是定稿**；只写文档，不写代码。
> **日期**：2026-11-06
> **版本记录**：
> - v0（2026-11-06）：首版。按用户拍板「自研 SpecCore、不直接采用 OpenSpec/Superpowers」写成；覆盖 SpecCore 对象、七步流程、门禁、交接、拆分、DB 草案、不照搬清单、冲突点与待拍板问题。
> - **v0.1（2026-11-06，用户已确认）**：补充「**Spec 不可见原则**」（不出现 Spec/规格/需求文档/验收标准/基线/增量等内部词汇）、**8 条「Spec 操作 → 自然对话」投影映射**、**三类打扰规则**（风险门/真歧义/用户主动要求）；并把「人审 Spec」硬门**正式替换**为「风险触发的对话确认」，同时明确**内部状态机与证据绑定不因此取消**。
> - **v0.2（2026-11-06）**：并入 `research/adjacent-frameworks.md` 的高优先级机制（**EARS 五句型 + RFC 2119 强度 + Gherkin 可观察输出**；**Temporal 记账纪律：事件历史=真相、LLM 调用=Activity 先落库、恢复靠 replay**；**Shape Up 的 appetite / circuit breaker / Scopes / non-goals**；**ADR 状态语义 + Y-statement**；**变异测试→反向验收、Pact→`canArchive(specId)` 单一入口**；形式化只借"不变量→运行时断言 + 前置/后置"）；同步更新 Requirement schema（JSON Schema，非 markdown+正则）、Spec 字段、七步流程的记账/证据/归档、DB 表（`event_log`/`activities`/`spec_versions`），以及与 `design/12` 的衔接（**Spec = 记忆的一种内部 kind，markdown 导出仅为视图**）。
> - **v0.3（2026-11-06，用户 2026-11-06 授权 lead 拍板）**：吸收 E5（[`23-Planner与长程任务-v0.md`](23-Planner与长程任务-v0.md)）四项扩展——**`planRevision` + `supersedesPlanId`**（局部重规划不升 Spec 版本）、**`Task.dependsOn[]`**（依赖 DAG）、**`acceptanceKeys[]`**（验收键，对齐 E0 grader / `canArchive`）、**`boundary`**（writeScope/readScopes/allowedTools/forbiddenActions，对齐 E3 边界与 E2 角色槽位）；并写入 **E5 的 trivial 档（T0）**：至多一个 Plan/Task、Spec 按需创建；新增「跨文档字段对齐表」（18/21/22/23），差异处标"以 E5 为准"。
> **依据用户拍板**（原话见 [`10-设计对话记录.md`](10-设计对话记录.md) §30–33）：
> 1. Spec 是 Agent 的**内部真相层**：用户只提交需求与背景上下文，**不操作、不感知 Spec**；
> 2. **一个会话 = 一个 Spec；每个子会话 = 一个 Spec；Spec 之间可以有关系**；
> 3. 一个会话里的不同需求点，**先放在同一个 Spec** 里；需要独立执行/验收时才拆成子 Spec；
> 4. 执行时用 OpenSpec/Superpowers 的机制（change/delta、plan、阶段门禁）推进对应 Spec；执行完 Agent 自己更新 Spec/记忆，再以对话把结果返回用户；
> 5. **所有数据统一存数据库（SQLite）**：Spec 与架构数据都在 DB，文件只做导入/导出；
> 6. **进度真源只有一处**（DB 里的任务状态），断点从第一个未完成项继续；
> 7. 动态粒度：**组织上可嵌套，执行上平铺**（拆出的 Spec 是普通执行单元）；
> 8. 用户不感知 Spec 与「记忆页只读可见」是两条线：**记忆可见、Spec 不可见**；
> 9. **不直接采用** OpenSpec 的目录/文件格式与 Superpowers 的技能包，**自研一套 Spec 框架**，内部名 **SpecCore**（不暴露给用户）。
> 10. **Spec 永远不可见（用户 2026-11-06 已确认）**：用户侧**不出现**"Spec / 规格 / 需求文档 / 验收标准 / 基线 / 增量"等内部词汇；所有 Spec 操作**投影为自然对话**；**只有三类情况打扰用户**——风险门、真歧义、用户主动要求。
> 11. **决策授权（用户 2026-11-06 授权 lead 拍板）**：设计/技术/工程细节由 lead 决定；E5 的四项扩展（planRevision/supersedesPlanId、dependsOn、acceptanceKeys、boundary）与 trivial 档"Spec 按需创建"按此授权采纳（见 §2.4），重大产品方向/不可逆动作/预算仍请用户确认（10 §33）。
> **标记约定**：【拍板】= 用户已确认；【借鉴】= 从 OpenSpec/Superpowers 借鉴的机制（我们改造后使用）；【讨论中】= 本文提出的候选，可推翻；【待核实】= 证据不足。
> **上游**：[`10-设计对话记录.md`](10-设计对话记录.md)（拍板）、[`12-记忆模型-候选稿.md`](12-记忆模型-候选稿.md)（记忆）、[`13-交互协议-候选方案.md`](13-交互协议-候选方案.md)（交互）、[`14-总体设计-v1.md`](14-总体设计-v1.md)（总体）、[`15-开发路线图-v1.md`](15-开发路线图-v1.md)（里程碑）、[`17-评测设计-v0.md`](17-评测设计-v0.md)（E0）；外部参照：`research/openspec-mechanisms.md`、`research/superpowers-mechanisms.md`。

---

## 0. 一分钟读法

1. **SpecCore 是什么**：每个会话/子会话对应一个**内部 Spec**；Spec 管需求（Requirement/Scenario/Acceptance），Plan 管怎么做，Task 管做到哪，Evidence 管凭什么说做完了，Ledger 管过程可恢复。**用户全程看不到这些对象，只看到对话里的需求复述、计划摘要、进度与结果。**
2. **七步流程**：Spec 建立/更新 → Plan → 执行 → 双裁决+证据绑定 → 修复环+ledger → 收尾更新 Spec + 写回记忆 → 对话汇报。
3. **两条硬替换**：文件+git → **SQLite 单写者**；提示词软门禁 → **阶段状态机 + 不可伪造的证据绑定**；人审 Spec → **风险触发的对话确认**【已确认·11-06】；就地归档 → **版本 + delta + 失效不删**。
4. **粒度**：组织上可嵌套（`parentId`/relations），**执行上平铺**（子 Spec 只是普通执行单元）；拆不拆按"能否独立接受/排期/验证/发布"判断，不设固定层级。
5. **不冲突**：用户验收仍走对话（13），记忆页仍只读可见（12/14），Spec 不进入任何用户界面。
6. **v0.2 新增的四个硬机制**：Requirement 用 **EARS 五句型 + RFC 2119 强度**（`must` 缺证据=阻塞）；**事件历史=真相、LLM 调用=Activity 先落库、恢复靠 replay**；**`appetite` + circuit breaker**（超预算砍范围/partial，不默认延期）；**`canArchive(specId)` 单一归档入口**（前端/秘书不得自拼状态）。

---

## 1. 定位与边界

### 1.1 Spec 是"会话内需求真相"，不是用户文档

| 维度 | 结论 | 依据 |
|---|---|---|
| **用户可见性** | **不可见、不可操作**；用户只说需求与背景，Agent 内部建/改 Spec | 【拍板】10 §31 |
| **呈现方式** | 对话里只出现：需求复述、计划摘要、进度、结果、待确认问题；**不出现 Spec 对象/ID/状态/版本** | 【拍板】10 §31 + 13 单向对话原则 |
| **与记忆的关系** | 记忆 = 跨会话长期真相（用户可见只读）；Spec = 会话内需求真相（不可见）；Spec 结论以**候选**写回记忆（12 §5） | 【拍板】10 §31 + 12 §2/§5 |
| **与会话的关系** | 一个会话 = 一个 Spec；每个子会话 = 一个 Spec；Spec 间可有关系（父子/依赖/关联/取代） | 【拍板】10 §30–31 |
| **与任务的关系** | Spec 管"要什么"；Plan 管"怎么做"；Task 管"做到哪"；执行实例（专家）只拿 brief、不拿 Spec 全文 | 【拍板】10 §30 + 13 §11 |
| **与 UI 的关系** | Spec 不进会话树、不进记忆页、不进任务列表；UI 仍按 14 的三栏 | 【拍板】10 §31 + 14 §5 |

#### 1.1.1 Spec 不可见原则（【已确认·用户 2026-11-06】）

**原则**：Spec 是内部真相层，**永远不进入用户可见文本**。用户侧不出现"Spec / 规格 / 需求文档 / 验收标准 / 基线 / 增量"等内部词汇；用户只看到需求复述、计划摘要、进度、结果、确认问题。

**所有 Spec 操作 → 自然对话（投影映射）**：

| Spec 内部操作 | 用户看到的话（投影） |
|---|---|
| **Spec 建立/更新** | 通常**不说**；需要时一句"好的，我记下了 / 按这个理解做" |
| **Spec 拆分** | "我把它拆成两条线：X 和 Y，可以吗？"（**仅需确认时**说） |
| **Spec 澄清** | 直接问"你说的 X 是指 A 还是 B？" |
| **Plan 需确认（风险门）** | 展示**方案摘要** + "确认这么执行吗？" |
| **执行进展** | 只说**结果/状态**（如"第一步做完了，在跑验证"） |
| **验收** | "结果如下…这样可以吗？" |
| **风险动作前** | "这一步会改线上 / 删数据 / 花钱，确认吗？" |
| **Spec 归档** | **不说**，除非用户问 |

**何时打扰用户：只有三类**

1. **风险门**：不可逆 / 动线上 / 删数据 / 花钱 / 影响他人；
2. **真歧义**：至少两种解释会导致实质不同的动作/产物/外部影响（13 §5.5 的"真歧义"）；
3. **用户主动要求**（用户问了、要求确认、要求解释）。

**其余内部自己过门**：Spec 建立/更新/拆分（不需要确认时）/澄清（自己能定的）/Plan（无风险时）/执行进展/归档，均**不打扰用户**。这与 13 §5.5 的"自主决定阈值"一致；**内部状态机与证据绑定并不因此取消**（见 §5.1/§5.2）——只是门的"人类确认"部分改为按风险触发。

### 1.2 与现有概念的边界（避免"两层真相"打架）

1. **Spec = 记忆的一种内部 kind（v0.2 修正）**：Spec 与记忆共用同一套存储/版本/来源/失效语义（`memory_items` 的 `kind=spec`），但它是**会话内需求真相**，属于内部类型：① 默认**不出现在用户可见记忆页**（记忆页按 kind 过滤掉 `spec` 等内部类型）；② Spec 的修改**不直接覆盖**其他记忆条目；③ 生命周期结束后只把**结论/决策/经验**以候选写回普通记忆（12 §5）；④ **markdown 导出只是视图**（文件仅导入/导出，DB 是真相）。
2. **Spec 不是任务列表**：Task 是执行与进度单位（DB 唯一进度源）；Spec 是需求与验收单位。Spec 的状态是工作流阶段，**不是百分比**。
3. **Spec 不是 UI 对象**：用户界面仍只有"会话/子会话"；Spec 的父子关系由秘书内部维护，用于决定"这条需求属于哪个会话"。
4. **Spec 不是交付物**：没有"交付/验收状态机"（10 §24–25）；用户接受/不接受/改需求都用对话表达；Spec 的 `acceptance` 是**内部证据状态**，不是用户可见门。

### 1.3 非目标（v0 不做）

- 不做用户可见的 Spec 编辑器/浏览页/审批流；
- 不采用 OpenSpec 的目录/文件格式（不落 `openspec/` 目录）；
- 不采用 Superpowers 的 16 技能包与 1% 规则；只借其阶段与门禁语义；
- 不引入第二套任务状态机；DB 的 `tasks.status` 是唯一进度源；
- 不写实现代码（门禁见 10 §11）。

---

## 2. 借鉴什么 / 自研替换什么

> 用户拍板：**参考设计思想，自研一套 Spec 框架**（10 §31）。下表把"借"与"改"分开，避免把两家的实现形态当成我们的设计。

### 2.1 借鉴的机制（保留语义，换实现）

| # | 来源 | 借鉴的机制 | 我们怎么用 |
|---|---|---|---|
| B1 | OpenSpec | **`specs = 真值 / changes = 运动中`** 两分法 | Spec 的当前版本 = 会话内真值；delta（本轮变更）= 运动中；记忆是跨会话真值 |
| B2 | OpenSpec | **delta 四操作**（ADDED / MODIFIED / REMOVED / RENAMED） | Spec 版本间的变更用四操作表达；MODIFIED 必须整块替换、丢字段即报错 |
| B3 | OpenSpec | **tasks 即唯一进度真源** | `tasks.status` 是唯一进度；断点=第一个未完成项；不存"会话进度字段" |
| B4 | OpenSpec | **verify 记分卡**（Completeness / Correctness / Coherence + CRITICAL/WARNING/SUGGESTION） | 双裁决中的"Spec 合规"与收尾门用同结构输出；只读、不改状态 |
| B5 | OpenSpec | **instructions 分层组装**（内置规则 + 模板 + 项目 context/rules，rules 只加不替） | 每步的"行动指令"由 SpecCore 编译为 brief：内置阶段规则 + Spec/Plan 片段 + 项目/领域规则 |
| B6 | Superpowers | **bootstrap 在会话启动/压缩后重注入** | 每次会话开始与每次压缩后，重注入"当前 Spec 阶段 + 下一步门禁 + 禁止事项"（短段，≤20 行） |
| B7 | Superpowers | **spec 是权威、plan 是论证** + plan 强制回链 `**Spec:**` | Plan 必须带 `spec_id@version`；任何冲突以 Spec 为准；Spec 升版触发 Plan 失效检查 |
| B8 | Superpowers | **三文件交接**（brief / report / review-package，父只传路径） | 保留三份产物的**契约**；物理上落 DB（`documents`），父只传 handle，不传正文 |
| B9 | Superpowers | **双裁决**（Spec Compliance × Code Quality，实现者自审不可替代） | 每个 Task 的 done 定义 = 两个独立 verdict 都通过 + 证据齐备 |
| B10 | Superpowers | **修复环 ≤5 轮 + ledger 恢复**（1–3 resume 原实现者、4–5 换更强模型、scoped re-review、超限裁决、无静默丢弃） | 修复环做成显式状态机；ledger 追加式；超限由控制器裁决并记账 |
| B11 | Superpowers | **verification Gate Function**（确定证明方式→跑完整命令→读输出→对照→才宣告） | Evidence 的生成规则与"完成声明"绑定；模型自述不算证据 |
| B12 | Superpowers | 四态 report（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED） | 执行实例回报状态；只有 DONE 进审查；NEEDS_CONTEXT 是正规求助通道 |

### 2.2 自研 / 替换的部分（不照搬）

| # | 两家怎么做 | 我们替换成 | 原因 |
|---|---|---|---|
| R1 | 文件 + git + 人工 rebase | **SQLite 单库 + 单写者** | 【拍板】统一 DB；10 并发共享；文件易漂移/冲突 |
| R2 | 提示词软门禁（HARD-GATE 等文字约束） | **阶段状态机 + 证据绑定** | 软约束不可校验；模型会"合理化"；我们必须机器可判 |
| R3 | 人审 Spec（Superpowers HARD-GATE：人批 design doc 才开工） | **风险触发的对话确认**（只在动线上/删数据/花钱/不可逆/影响他人时问；其余内部自己过门） | 【已确认·11-06】用户不感知 Spec；人审 Spec 与"内部真相层"冲突；**内部状态机/证据绑定不取消** |
| R4 | 就地归档（OpenSpec archive 把 delta 合并进主 spec、可裁剪归档） | **版本 + delta + 失效不删**（Spec 只追加版本、旧版保留、归档只软删） | 与 12「失效优于删除」一致；可回滚/可追溯 |
| R5 | 用户可见的 `changes/` 目录与 slash 命令 | **内部对象 + 对话自然语言** | 【拍板】用户不感知 Spec；不引入第二套命令体系 |
| R6 | 递归嵌套用目录/格式表达 | **`parentId` + `relations` 数据字段** | 动态粒度；组织嵌套、执行平铺 |
| R7 | 单会话、干净上下文、串行 | **多任务同窗 + 可打断 + 实例并发**（13/14） | 我们的交互模型不同；Spec 必须支持并发推进 |
| R8 | 16 宿主平台矩阵 / 30+ 工具兼容 | **单宿主（本机 Web）+ 单一实现** | 自研单机产品，兼容层是纯负担 |
| R9 | 进度 = 文件 checkbox | **进度 = DB `tasks.status`** | 统一 DB；避免双真相；断点可精确恢复 |
| R10 | 结构校验（markdown 正则） | **JSON Schema 校验 + EARS/RFC2119 字段** | 结构化数据比 markdown 标题可靠；同一 schema 可同时约束 LLM 输出与入库（相邻调研 §1/§3） |

### 2.3 相邻领域借鉴（v0.2 新增，来源 `research/adjacent-frameworks.md`）

> 原则：**借思想不借系统**。只取能落到 SpecCore 数据模型/状态机/证据门的机制；不引入 Temporal/TLA+/Shape Up 的组织仪式/Pact broker 等工具链（见该报告 §9 的 21 条"不该借"）。

| # | 机制 | 来源（证据级） | 落到哪 | 优先级 |
|---|---|---|---|---|
| A1 | **EARS 五句型**（`ubiquitous/event/state/optional/unwanted` → `trigger/state/response` 字段） | EARS / AWS ADR-020〔A〕 | Requirement schema（§3.3） | P0 |
| A2 | **RFC 2119 规范力**（`must/should/may` 一等字段） | RFC 2119〔A〕 | Requirement + 证据门（§3.3/§5.2） | P0 |
| A3 | **Gherkin 黄金戒律**：Then 只验证**用户可观察输出**，不认"数据库改了" | Cucumber Reference〔A〕 | Scenario/Evidence 校验（§3.3/§5.2） | P0 |
| A4 | **JSON Schema 同源**：Spec 结构由 schema 定义，LLM 输出与入库共用 | JSON Schema〔A/D〕 | Requirement/Scenario 校验（非 markdown+正则） | P0 |
| A5 | **Shape Up：appetite**（时间预算=输入，非估算） | Shape Up〔A/B〕 | Spec 字段（§3.2）+ 拆分/止损（§7） | P0 |
| A6 | **Shape Up：circuit breaker**（超预算默认砍范围/降级 partial，不默认延期） | Shape Up〔A〕 | 生命周期/收尾（§3.7/§4.6） | P0 |
| A7 | **Shape Up：Scopes = 可独立 build/integrate/finish** | Shape Up〔A〕 | 子 Spec 拆分判据（§7.1） | P0 |
| A8 | **Shape Up：non-goals 一等字段**（防范围蔓延，父→子继承） | Shape Up / Google Design Docs〔A〕 | Spec 字段（§3.2）+ 拆分（§7） | P0 |
| A9 | **Temporal：事件历史=真相；状态=投影；恢复=replay** | Temporal〔A〕 | 记账/恢复（§4/§5.7/§8） | P0 |
| A10 | **Temporal：每次 LLM 调用当 Activity，先落库再推进状态机；重放复用结果不重算** | Temporal〔A〕 | 执行步/Activity 表（§4.3/§8.2） | P0 |
| A11 | **Pact：`canArchive(specId)` 单一判定入口**（前端/秘书不得自拼状态） | Pact〔A〕 | 归档门（§5.7） | P0 |
| A12 | **变异测试思想 → 证据充分性/反向验收**（改坏实现或一条 must，看门禁是否拒绝） | Stryker〔A〕 | 证据门质量度量（§5.6） | P1（离线抽样） |
| A13 | **ADR 状态语义**（编号单调不复用；superseded 保留互链）+ **Y-statement** 四槽位 | Nygard / adr.github.io〔A〕 | Decision 对象（§3.3b） | P1 |
| A14 | **形式化只借"不变量清单 → 运行时断言 + 前置/后置"** | TLA+/Alloy/Dafny〔A/C〕 | 状态机断言/Requirement 字段（§5.8） | P1 |
| A15 | **statechart 语义**（层级态=子 Spec、并行态=实现/验收、守卫转换） | XState〔A〕 | 状态机（§3.7/§5.1） | P1（先扁平+并行维度） |
| A16 | **对话=读模型**（同一事件流投影出会话/上下文/时间线） | Event Sourcing〔A〕 | 投影（§4.7/§5.7） | P1 |
| A17 | **hill chart 语言**（上坡/下坡/完成替代百分比） | Shape Up〔A/B〕 | 对话投影（§4.7） | P2 |
| A18 | **DDD 边界**（同一个词含义变了=拆 Spec 信号）+ 本地术语表 | Fowler〔A〕 | 拆分判据（§7.1） | P2 |

**明确不借（相邻领域）**：TLA+/Alloy/Dafny 工具链、Temporal server、Argo/Airflow、全量 CQRS、Pact broker、Gherkin step definitions、OpenAPI 代码生成、Protobuf 工具链、ADR 长散文、10–20 页 Design Docs、Shape Up 组织仪式、Kanban 度量、C4 图、DDD context map、全量变异测试进 CI、RTM 矩阵、MetaGPT 多角色表演、AutoGen/CrewAI 会话编排、LangChain 运行时依赖（见相邻报告 §9）。

### 2.4 E5 扩展（v0.3 吸收，**用户 2026-11-06 授权 lead 拍板**）

> 来源：[`23-Planner与长程任务-v0.md`](23-Planner与长程任务-v0.md) §2.2/§6/§7/§12.3。四项扩展**全部采纳**；E5 原稿标"待对齐 18"，本版对齐后以 **18 v0.3 语义为准**。

| # | 扩展 | 字段/语义 | 落点 |
|---|---|---|---|
| E5-1 | **Plan 局部重规划** | `Plan.planRevision`（同一 Spec 版本内 +1）；`Plan.supersedesPlanId`（全局重规划时新 Plan 取代旧 Plan）；**局部重规划不升 Spec 版本**，Spec 版本仅在需求/delta 变化时升 | §3.4 Plan、§4.2、§8.2 |
| E5-2 | **Task 依赖 DAG** | `Task.dependsOn[]`：仅指向存在的 Task、无自依赖、无环；**并行判定** = 无依赖边且 `boundary.writeScope` 不相交；写域冲突 → 合并 Task 或加串行边 | §3.4 Task、§4.3、§5.1、§8.2 |
| E5-3 | **验收键** | `Requirement.acceptanceKeys[]` 与 `Task.acceptanceKeys[]`：覆盖检查与 `canArchive` 的判定单位，直接对齐 **E0 grader** 的 case/断言 | §3.3、§5.7、§8.2 |
| E5-4 | **边界声明** | `Task.boundary` / `Plan.boundary`：`{writeScope[], readScopes[], allowedTools[], forbiddenActions[]}`；对齐 **E3 的边界维度**与 **E2 的角色槽位**（秘书/专家各读哪些边界） | §3.4、§5.1、§8.2 |
| E5-5 | **trivial 档（T0）** | 一个可逆动作、无新未知、无需跨任务接口/验收 → **不建 Plan/Task DAG**，直接执行并落一条 Task/Activity 记录；**Spec 按需创建**（至多一个；不强制先建正式 Spec） | §3.7、§7.1 |

**与 v0.2 的差异（冲突处"以 E5 为准"）**：

| 项 | v0.2 表述 | E5 语义（以 E5 为准） |
|---|---|---|
| Spec 创建时机 | "一个会话=一个 Spec"（隐含先建） | **至多一个、按需创建**；T0 可只落 Task/Activity，不强制正式 Spec |
| Plan 版本 | 只有 `specVersion`，Spec 一变 Plan 就失效 | 新增 `planRevision`；**局部重规划不升 Spec 版本**；只有需求/delta 变化才升 Spec 版本 |
| Task 依赖 | 未定义（只靠 order/串行） | 显式 `dependsOn` DAG；并行/串行由依赖边 + writeScope 判定 |
| 验收键 | 只有 Requirement/Scenario/Acceptance | 增加 `acceptanceKeys[]` 作为覆盖检查与 `canArchive` 的判定单位 |

---

## 3. SpecCore 对象模型

### 3.1 对象总览

| 对象 | 一句话 | 关键字段（草案） |
|---|---|---|
| **Spec** | 会话内需求真相（**至多一个**，按需创建；记忆的 `kind=spec` 内部类型） | id、sessionId、parentId、status、outcome、**tier(trivial/one-session/epic/project)**、currentVersion、**appetite**、**nonGoals**、rabbitHoles、glossary、memoryScopeRefs、createdAt/updatedAt |
| **Requirement** | 一条必须满足的需求（EARS 五句型 + RFC2119 强度） | key、specId、**pattern**、**trigger/state**、**response**、**strength**、**acceptanceKeys[]**、pre/post、source、state（随 Spec 版本） |
| **Scenario** | Requirement 下的可测例子（WHEN/THEN，Then 只认可观察输出） | key、requirementKey、when、then、given?、examples? |
| **Acceptance** | 验收标准（可绑定证据，强度映射门禁） | key、requirementKey、criterion、method（test/command/artifact/approval）、requiredEvidence、strength |
| **Decision**（v0.2） | 决策记录（ADR 语义 + Y-statement） | id（单调）、status（proposed/accepted/deprecated/superseded）、supersedes/supersededBy、context、concern、chosen、acceptedDownside、rejected[] |
| **Plan** | 怎么做（论证），回链 Spec 版本；局部修订不升 Spec 版本 | id、specId、specVersion、**planRevision**、**supersedesPlanId?**、tasks[]、verificationApproach、**boundary**、status |
| **Task** | 执行与进度单位（唯一进度源） | id、specId、planId、parentTaskId?、status、**dependsOn[]**、**acceptanceKeys[]**、**boundary{writeScope,readScopes,allowedTools,forbiddenActions}**、taskKind、implementationNotes?、requiredEvidence、attempt、assignee |
| **Evidence** | 不可伪造的证据记录 | id、subjectType/Id、kind、toolCallRef、command、exitCode、outputHash、artifactRef |
| **Handoff** | 结构化交接（结果/结论/产物/未决/证据指针） | id、specId、taskId?、did、conclusion、artifacts[]、open[]、evidenceRefs[]、baseVersion |
| **Ledger** | 追加式过程账本（恢复协议） | id、specId、seq、kind、payload、evidenceRefs、actor、at |
| **SpecRelation** | Spec 间关系（父子之外的关联） | fromSpecId、toSpecId、relType（informs/reframes/depends_on/supersedes?）、note |

> 物理上全部进 SQLite（见 §8）；Requirement/Scenario/Acceptance 作为**版本快照的 JSON** 存在 `spec_versions` 中（见 §8.2 的取舍说明）。

### 3.2 Spec

**字段（草案）**：

| 字段 | 说明 |
|---|---|
| `id` | 稳定 ID（如 `spec-<ulid>`） |
| `sessionId` | 所属会话/子会话；**一个会话最多一个 Spec**（唯一约束） |
| `parentSpecId` | 拆出来的子 Spec 的父 Spec（组织关系；执行时不递归） |
| `goalId` | 可选：顶层目标/长期目标引用（跨 Spec 组织用） |
| `title` / `intent` | 一句话需求 + 意图（用户原话摘要） |
| `status` | `draft / confirmed / planned / executing / verifying / verified / archived`（见 §3.7） |
| **`tier`** | `trivial / one-session / epic / project`（E5 四档；**trivial 允许 Spec 按需创建**，见 §3.7/§7.1） |
| `outcome` | `complete / partial`（v0.2；circuit breaker 降级归档时为 `partial`，见 §3.7/§4.6） |
| **`appetite`** | **时间预算**（Shape Up）：`{timeBudget, maxScope?, unit}`；是输入，不是估算；超预算触发 circuit breaker |
| **`nonGoals[]`** | **明确的非目标**（防范围蔓延；父 Spec 向子 Spec 继承，子新增须显式记录） |
| **`rabbitHoles[]`** | 已知的坑/风险（Shape Up Pitch 五要素之一） |
| **`glossary[]`** | 本地术语表 `{term, definition, notToBeConfusedWith[]}`（DDD 边界；P2） |
| `currentVersion` | 当前版本号（指向 `spec_versions`） |
| `memoryScopeRefs[]` | 读哪些记忆作用域（global/domain/task）；写回只走候选 |
| `planIds[]` / `taskIds[]` | 关联的 Plan/Task（也可反向查） |
| `evidenceRefs[]` / `handoffId` | 收尾证据与交接 |
| `source` | 来源：用户原话 / 记忆引用 / 秘书推断（沿用 12 来源分级） |
| `createdAt` / `updatedAt` / `archivedAt` | 时间戳 |

**规则**：
- **一 Spec 一会话**（`sessionId` 唯一）；子会话各自有 Spec，用 `parentSpecId` + `SpecRelation` 表达组织关系。
- **Spec 内部不嵌 Spec**：需求点在同一个 Spec 里是 Requirement；拆出去才是子 Spec（§7 判据）。
- **Spec 是记忆系统的内部 kind**：持久化复用 `memory_items`（`kind=spec`），但默认**不进用户可见记忆页**，也不直接覆盖普通记忆；收尾时只把结论/决策/经验作为候选提交（12 §5）。

### 3.3 Requirement / Scenario / Acceptance（v0.2：EARS + RFC 2119 + Gherkin）

> 来源：`research/adjacent-frameworks.md` §1。**Spec 结构由 JSON Schema 定义**——同一份 schema 同时约束 LLM 输出与入库（避免 markdown 标题 + 正则的"静默失败"）。

**Requirement 字段（schema 强制）**：

| 字段 | 类型 | 规则 |
|---|---|---|
| `key` | string | Spec 内稳定（`R1`…），不复用 |
| `pattern` | enum | `ubiquitous / event / state / optional / unwanted`；**必须命中且仅命中一个** |
| `actor` / `system` | string | 系统或角色（EARS 的 `<system>`） |
| `trigger` | string? | `event` / `unwanted` 模式必填（When / If） |
| `state` | string? | `state` 模式必填（While） |
| `feature` | string? | `optional` 模式必填（Where） |
| `response` | string | **只描述一个可测行为**；多行为必须拆条 |
| `strength` | enum | `must / should / may`（RFC 2119；默认 must） |
| `pre` / `post` | object? | 前置/后置条件（Dafny 只借字段；可选） |
| `acceptanceKeys[]` | string[] | **至少 1 个**；指向本 Requirement 的 Acceptance，覆盖检查与 `canArchive` 的判定单位（E5-3） |
| `kind` / `priority` / `source` | enum/string | 功能/非功能/约束/兼容性；来源沿用 12 §7.3 |

**EARS 五句型（写入 schema 的 pattern，不写成散文）**：

| pattern | 模板 | 必填槽 |
|---|---|---|
| ubiquitous | The `<system>` shall `<response>`. | actor/system、response |
| event | When `<trigger>`, the `<system>` shall `<response>`. | trigger、response |
| state | While `<state>`, the `<system>` shall `<response>`. | state、response |
| optional | Where `<feature>`, the `<system>` shall `<response>`. | feature、response |
| unwanted | If `<trigger>`, then the `<system>` shall `<response>`. | trigger、response |

**校验规则**：
1. 一条 Requirement 命中且仅命中一个 pattern；
2. 只描述一个行为（复杂条件**拆条不嵌套**——EARS 原文自己承认复杂逻辑会别扭）；
3. `response` 必须可观察、可测；
4. `must` 占比 >80% 时给"规范力通胀"警告（建议拆优先级）；
5. 违反以上任何一条 → **拒绝入库**（不是"格式不规范"的提示）。

**Scenario（Gherkin 黄金戒律）**：
- 每个 Requirement **≥1 个** Scenario；字段 `when`、`then`、可选 `given`、`examples[]`（表格化示例）；
- **`then` 只允许"用户/外部系统可观察的输出"**（报告、UI、消息、API 响应、命令输出）；**禁止把"数据库改了/内部状态变了"当验收**；
- 步骤建议 3–5 步；超过应抽高级步骤（warning，不阻塞）；
- 结构化字段（非 markdown 标题）；缺 Scenario = 校验失败。

**Acceptance**：
- 每个 Requirement **≥1 条** Acceptance；`method ∈ test / command / artifact / human_message / manual_review`；
- `requiredEvidence` 声明所需证据类型；`strength` 继承 Requirement（可覆盖但需理由）；
- **内部自动判定**；用户验收仍走对话（§5.3）。

**强度 → 证据门（RFC 2119）**：

| `strength` | 缺证据时 | 处理 |
|---|---|---|
| **must** | **阻塞（hard block）** | `canArchive=false`；补证据，或显式降级为 should（记理由） |
| **should** | **警告 + 理由** | 可归档；Ledger 记录缺证理由 |
| **may** | 不要求 | 不阻塞 |

**delta 四操作**（版本间变更，借鉴 B2）：

| 操作 | 语义 | 硬规则 |
|---|---|---|
| `ADDED` | 新增 Requirement/Scenario | 至少 1 Scenario + 1 Acceptance |
| `MODIFIED` | 修改已有 Requirement | **整块替换**（Requirement + 全部 Scenario）；旧值保留在旧版本；丢字段/丢 Scenario 直接报错 |
| `REMOVED` | 删除需求 | 必须写 `reason` + `migration`（替代方案/后续动作） |
| `RENAMED` | 仅改名 | 用 `from`/`to`；不改语义、不触发 Scenario 检查 |

#### 3.3b Decision（v0.2：ADR 语义 + Y-statement）

> 来源：相邻调研 §2。决策条目是 Spec 的一种内部 `kind=decision` 记录，与 Requirement 同级但校验不同：**不要求 Scenario，要求"代价"**。

| 字段 | 规则 |
|---|---|
| `id` | **单调递增、永不复用**（ADR 纪律；复用 id 污染历史） |
| `status` | `proposed / accepted / deprecated / superseded` |
| `supersedes` / `supersededBy` | 被推翻的决策**保留**并标 `superseded`，**双向互链**；不删除 |
| `context` / `concern` / `chosen` / `acceptedDownside` | Y-statement 四槽位；**禁空话** |
| `rejected[]` / `because?` | 被否选项与理由（可选，但写了要具体） |

**校验**：`accepted` 必须写 `acceptedDownside`（没有代价的决策通常是没想清楚）；`superseded` 必须互链；决策正文不超过 1 页（长散文不抄）。
**投影**：用户问"当初为什么这么定"时，直接投影 Y-statement 单句（"在有 X 的情况下，我们选了 Y 来获得 Z，代价是接受 W"），不重新推理。

### 3.4 Plan / Task（v0.3：planRevision / dependsOn / acceptanceKeys / boundary）

**Plan**：
- **一个 Spec 版本可有多个 Plan revision**：`planRevision` 从 1 单调递增；**局部重规划只 +1 planRevision，不升 Spec 版本**（Spec 版本只在需求/delta 变化时升）；
- 全局重规划（Spec 版本变化）→ 新建 Plan，旧 Plan 标 `superseded` 并互相 `supersedesPlanId`；
- 字段：`id, specId, specVersion, planRevision, supersedesPlanId?, assumptions[], verificationApproach, boundary, tasks[], status(draft/active/superseded)`；
- **Spec 是权威、Plan 是论证**（借鉴 B7）：两者冲突时以 Spec 为准，记录 `Ruling` 到 Ledger；
- **有效 Plan 约束**：同一 Spec 版本至多一个 `active` 的 planRevision；其余标 superseded/留档。

**Task**：
- **唯一进度源**（借鉴 B3）：`status ∈ todo / doing / blocked / done / verified / dropped`；
- 字段：`id, specId, planId, parentTaskId?, title, status, dependsOn[], acceptanceKeys[], boundary, taskKind, implementationNotes?, requiredEvidence[], attempt, assignee, order, updatedAt`；
- **`dependsOn[]`（DAG）**：只指向存在的 Task、无自依赖、无环；**就绪 = 所有 dependsOn 已 `verified`**；与 `boundary.writeScope` 冲突检查共同决定并行/串行（§5.1）；
- **`acceptanceKeys[]`**：至少 1 个；映射到 Requirement 的 Acceptance，是覆盖检查与 `canArchive` 的判定单位（对齐 E0 grader）；
- **`boundary`**：`{writeScope[], readScopes[], allowedTools[], forbiddenActions[]}`；越界即失败；与 E3 边界维度、E2 角色槽位（秘书/专家各读哪些）对齐；
- **执行平铺**：`parentTaskId` 只用于展示/分组，执行器不按层级递归；所有可执行 Task 在同一池里调度；
- 断点恢复：查 `status IN (todo, doing, blocked)` 且 `dependsOn` 全 verified，按 `order` 取第一个（不依赖内存态）；
- `done` ≠ `verified`：`done` 是执行者报告完成；`verified` 是双裁决 + 证据通过（§5）。

### 3.5 Evidence / Handoff / Ledger

**Evidence（不可伪造）**：

| 字段 | 说明 |
|---|---|
| `id` / `subjectType` / `subjectId` | 证据归属（Task/Requirement/Acceptance） |
| `kind` | `tool_output` / `test_run` / `diff` / `artifact` / `command` / `approval` / `screenshot` |
| `toolCallRef` | **框架工具调用记录 ID**（不是模型自述）；无此引用 = 无效证据 |
| `command` / `exitCode` / `outputHash` | 命令与结果；hash 用于防篡改/去重 |
| `artifactRef` | 产物/文件/截图引用（DB 或对象存储） |
| `producedBy` / `producedAt` | 产生者（实例/工具）与时间；由框架写，不由模型写 |
| `acceptedByVerdict` | 被哪次裁决接受（可空） |

- **只由框架单写者写入**；模型只能"引用证据 ID"，不能"制造证据"；
- 完成声明必须引用**本轮新产生**的证据（Gate Function，借鉴 B11）；证据不可见 ≠ 证据不存在；
- 证据不可删除，只能标 `invalidated`（失效不删）。

**Handoff（结构化交接）**：
- 字段：`did`（做了什么）、`conclusion`（结论）、`artifacts[]`（产物引用）、`open[]`（未决）、`evidenceRefs[]`、`baseVersion`、`risks[]`、`next`（建议下一步）；
- 执行实例 → 控制器 → 秘书；**父只拿 handoff，不拿子会话全文**（借鉴 B8 的交接纪律）；
- markdown 渲染只是视图；**DB 记录是真相**。

**Ledger（追加式账本 / 恢复协议）**：
- 字段：`id, specId, seq, kind(stage/gate/verdict/fix_round/ruling/adjudication/close), payload, evidenceRefs[], actor, at`；
- **append-only**；`UNIQUE(specId, seq)`；可加 `prevHash/hash` 做哈希链（讨论中）；
- 恢复：读该 Spec 的 Ledger 尾部 → 找最后一条一致状态 → 从下一未完成 Task 继续；
- **禁止静默丢弃**：任何绕过门的动作必须记 `ruling`（借鉴 B10 的"unledgered deviation is a decision made in secret"）。

### 3.6 SpecRelation

| 类型 | 语义 | 用途 |
|---|---|---|
| `informs` | 一个 Spec 为另一个提供输入/背景 | 跨会话引用 |
| `reframes` | 一个 Spec 改变另一个的框架/前提 | 需求重构 |
| `depends_on` | 执行/验收有依赖 | 调度与顺序 |
| `supersedes` | **是否要，待拍板**（Q1） | 取代旧 Spec；v0 暂不启用 |

规则：关系只影响"读/排期/验收顺序"，**不影响执行平铺**；不递归查询上下文（默认只按需引用）。

### 3.7 生命周期（状态机）

```
draft → confirmed → planned → executing → verifying → verified → archived
                       ↑            │           │
                       └── 更新 Spec ┴───────────┘（可 reopen）
```

| 状态 | 含义 | 进入条件 | 出口 |
|---|---|---|---|
| `draft` | 正在收集/整理需求 | 新会话/新需求 | 需求齐备且校验通过 → `confirmed` |
| `confirmed` | 内部确认（不要求用户审） | 结构校验通过 + 无高风险未决 | 生成 Plan → `planned` |
| `planned` | 有 Plan + Task | Plan 覆盖检查通过 | 开始执行 → `executing` |
| `executing` | 执行中 | 有 Task 进入 doing | 全部 Task `done` → `verifying` |
| `verifying` | 双裁决/证据核对 | 所有 requiredEvidence 可查 | 全通过 → `verified`；否则回 `executing` |
| `verified` | 验收通过（内部） | 双裁决 + 证据齐备 | 收尾写回 → `archived`（或直接 archived） |
| `archived` | 归档（只读、可 reopen） | 收尾完成 | 用户/秘书可 reopen → `executing` |
| `reopen` | 从 verified/archived 回到 executing | 新需求/发现缺陷 | 记 Ledger，Spec 升版 |

> **状态与进度分开**：Spec.status 是工作流阶段；**进度=Task 统计**（唯一真源）。不是"Spec 80%"。
>
> **v0.2 增补（相邻调研）**：
> - **statechart 语义**：状态机用层级 + 并行态实现（层级=子 Spec；并行=“实现维度 ∥ 验收维度”），转换带守卫（`canArchive` 等）；转换函数**纯函数**（不读时钟/随机/网络），状态只由事件推导（Temporal 纪律；`event_log` 是真相，`status` 是投影）。
> - **circuit breaker（Shape Up）**：`appetite` 超预算或多次验收不过时，**默认动作是砍范围/降级**（缩 `must` 集合 → 仍可验证的部分归档），**不是自动延期**；归档时 `outcome=partial`，并在 Handoff/对话里说明"哪些没做、为什么"。
> - **partial 的语义**：`archived` + `outcome=partial`；**不关闭会话**（10 §22），只是这个 Spec 以部分完成收口；用户可 reopen 或开新 Spec 继续。
> - **hill chart 语言（投影用）**：对用户说"还在上坡（有未解未知）/ 下坡（只剩执行）/ 完成"，不说百分比。
>
> **v0.3（E5 trivial 档，以 E5 为准）**：
> - `tier=trivial`（T0）→ **极简路径**：至多一个 Plan/Task，**可不建 Plan/Task DAG**；直接执行并落一条 Task/Activity 记录；**Spec 按需创建**（可不建正式 Spec；若建则只含 1 条 outcome + 1 条 acceptance）。
> - 与 v0.2 "一个会话 = 一个 Spec"的差异：**以 E5 为准，改为"至多一个、按需创建"**；正式任务仍建议有一个"极简 Spec"便于追溯，但 T0 不强制。
> - `tier` 取 `one-session / epic / project` 时仍走完整七步流程。

---

## 4. SDD 七步流程

### 4.0 总览

```
① Spec 建立/更新 ──> ② Plan ──> ③ 执行（派发实例） ──> ④ 双裁决+证据绑定
        ↑                    ↑                              │
        │                    └──── ⑤ 修复环+ledger <─────────┘
        │                                                   │
        └── ⑦ 对话汇报 <── ⑥ 收尾更新 Spec + 写回记忆 <──────┘
```

**用户感知**：①–⑥ 都只在内部发生；用户只看到 ⑦ 的对话汇报（以及 ④/⑤ 中"风险触发的对话确认"）。**用户不参与 Spec 审批**。

### 4.1 步①：Spec 建立/更新

| 项 | 内容 |
|---|---|
| **输入** | 用户消息（需求/背景/约束）、相关记忆（按作用域组装）、当前会话焦点 |
| **动作** | 从对话中抽取 Requirement/Scenario/Acceptance（**按 EARS 五句型填槽：pattern + trigger/state/feature + response**，`strength` 取 must/should/may）→ 创建或更新 Spec（新版本 + delta）；**内部完成**，必要时用一句"我理解你要的是…"向用户复述确认（对话层，不是 Spec 审批） |
| **输出** | `specs` 行 + `spec_versions` 新版本（含 requirements/scenarios/acceptance + delta） |
| **门禁** | **JSON Schema 校验**：每条 Requirement 命中且仅命中一个 EARS pattern、只描述一个行为、`response` 可观察；每条 Requirement ≥1 Scenario（`then` 只认可观察输出）、≥1 Acceptance；delta 四操作合法；必须写 `nonGoals[]` 与 `appetite`（否则拒绝入库）；高风险项（动线上/删数据/花钱/不可逆/对外发送）标 `requires_user_confirm`（→ 步⑦/§5.3） |
| **失败处理** | 需求不足 → 回到对话问（最多 1 个问题，13 §5.5）；不阻塞用户 |
| **用户感知** | 只感知复述/提问；**不感知 Spec 对象** |

### 4.2 步②：Plan

| 项 | 内容 |
|---|---|
| **输入** | Spec@version（权威）、记忆中的领域规则/约束 |
| **动作** | 生成 Plan（怎么做/验证方式）+ Task 列表（每个 Task 是一个可独立测试的单元）；Plan 回链 `specId@specVersion`；**局部重规划 = 同 Plan id、`planRevision+1`、不升 Spec 版本**；全局重规划（需求/delta 变化）才新建 Plan 并使旧 Plan `superseded`（`supersedesPlanId`）；检查 `appetite` 是否可行（不可行就先砍范围，而不是延期）；**继承父 Spec 的 `nonGoals`**，新增 non-goals 显式记录 |
| **输出** | `plans`（含 planRevision/supersedesPlanId）+ `tasks`（status=todo，含 dependsOn/acceptanceKeys/boundary）；`requiredEvidence` 填好 |
| **门禁** | **覆盖检查**：每个 Requirement 的 `acceptanceKeys` 至少被一个 Task 的 `acceptanceKeys` 覆盖；每个 Task 至少 1 个 acceptanceKey；Plan 依赖的 Spec 版本 = 当前版本（否则全局重规划）；`appetite` 与 Task 总量明显不匹配 → 先触发 circuit breaker（§3.7） |
| **失败处理** | 覆盖不足 → 补 Task；Spec 当前版本已变 → Plan 标 superseded，回步① |
| **用户感知** | 可选：一句计划摘要（"我准备拆 4 步做…"），不作为审批门 |

### 4.3 步③：执行

| 项 | 内容 |
|---|---|
| **输入** | Task brief（含 Task 描述、writeScope、requiredEvidence、相关 Spec 片段）；**不传 Spec 全文** |
| **动作** | 派发执行实例（专家）；实例按 brief 执行、写 Evidence、回报 Handoff（四态：DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED）；**每次 LLM 调用先作为 Activity 落库（输入/输出/模型/token/时间），再推进状态机**（Temporal 纪律；重放复用记录、不重算） |
| **输出** | `tasks.status` 更新（doing/blocked/done）、`evidence`、`handoffs`、`documents`（report）、`activities`、`event_log` |
| **门禁** | 每个 Task 声明 `boundary`（writeScope/readScopes/allowedTools/forbiddenActions）；**重叠写域 = 告警/串行化**；`dependsOn` 全 verified 才就绪；无 Evidence 的 done 不接受；`NEEDS_CONTEXT` 必须回控制器（不许猜）；**状态推进必须由 `event_log` 追加触发**（不允许"内存里改了、事件没记"） |
| **失败处理** | BLOCKED → 控制器裁决（补上下文/拆任务/升级人）；NEEDS_CONTEXT → 从记忆/父 Spec 补 brief |
| **用户感知** | 无（只在风险触发时问；完成/失败按 13 P2 通知） |

### 4.4 步④：双裁决 + 证据绑定

| 项 | 内容 |
|---|---|
| **输入** | `documents.review_package`（diff + report + brief）、Evidence、Task 的 `acceptanceKeys`、Spec/Plan 版本 |
| **动作** | 两个独立裁决：**Spec Compliance**（逐条 `acceptanceKeys` 检查 Missing / Extra / Misunderstood）与 **Task Quality**（错误处理/边界/测试是否验真行为/文件职责）；每个 verdict 必须显式 ✅/❌ 或 Approved/Needs fixes |
| **输出** | `verdict` 记入 Ledger/DB；通过 → Task `verified`；不通过 → 进修复环 |
| **门禁** | **两个 verdict 缺一不可**；**实现者自审不能替代任务审查**（借鉴 B9）；证据不可伪造（§5.2）；**按 Requirement 强度判**：`must` 缺证据=阻塞，`should` 缺证据=警告+理由，`may` 不阻塞（RFC 2119 映射，§3.3） |
| **失败处理** | 任一 ❌ → 步⑤；**Critical/Important 未处置不得进入下一 Task** |
| **用户感知** | 无（除非触发风险对话确认） |

### 4.5 步⑤：修复环 + Ledger

| 项 | 内容 |
|---|---|
| **输入** | verdict findings（逐字给修复者）、原 Task 上下文、Evidence |
| **动作** | ①第 1–3 轮：resume 原执行者（保留上下文）；②第 4–5 轮：换更强模型的新执行者；③每轮 **scoped re-review**（只看修复 diff）；④Minor findings 不进环、记 Ledger；⑤超 5 轮 → 控制器裁决（争议/错误 → 记账继续；真实且承重 → BLOCKED 停下问人） |
| **输出** | 每轮 `fix_round` Ledger 行 + 修复 Evidence + 最终 verdict |
| **门禁** | **≤5 轮**；**无静默丢弃**（"a silent discard is forbidden"）；**无提前退出**；终审只允许一波修复 |
| **失败处理** | 5 轮后仍不过 → BLOCKED 或重新拆 Task（记 `ruling`）；不得无限循环 |
| **用户感知** | 仅当需要用户拍板（高风险/需求冲突）时问；否则静默推进 |

### 4.6 步⑥：收尾更新 Spec + 写回记忆

| 项 | 内容 |
|---|---|
| **输入** | 全部 Task verified、Evidence 齐备、Ledger 完整、Handoff |
| **动作** | 先调用**唯一判定入口 `canArchive(specId)`**（§5.7）：返回可归档/不可归档 + 缺什么；可归档才更新 Spec 状态与版本（delta 合并、Acceptance 标记 met/waived、写 spec 新版本，`outcome=complete` 或 `partial`）；把结论/决策/经验作为**候选**提交记忆管理器（12 §5）；生成最终 Handoff |
| **输出** | `spec_versions` 新版本（或最终态）、`memory_candidates`（经单写者合并）、`handoff`、`event_log` 的 `spec_archived` 事件 |
| **门禁** | **`canArchive(specId) == true`**（唯一入口；秘书/前端不得自己拼状态）；**按 `acceptanceKeys` 逐条核对**；所有 requiredEvidence 可查；所有 Acceptance 有结论（met/waived + 理由）；`must` 全部有证据、`should` 的缺证有理由；**没有证据的"完成"不写入**；写记忆必须走候选（12 §5） |
| **失败处理** | 有未决 → Spec 回 `executing` 或在 Handoff 标 open（不能假装 verified）；记忆候选被拒 → 记录并继续（不影响 Spec 收尾） |
| **用户感知** | 无（记忆页可见的是合并后的记忆，不是 Spec） |

### 4.7 步⑦：对话汇报

| 项 | 内容 |
|---|---|
| **输入** | Handoff（结论/产物/未决/证据指针）、当前对话焦点 |
| **动作** | 以对话形式给用户：结果摘要（≤几行）、产物/证据指针（可预览/下载）、待确认问题（≤1 个，风险触发）；**不暴露 Spec 内部状态/版本/表**；进度用 **hill chart 语言**（"还在上坡（有未解未知）/ 下坡（只剩执行）/ 完成"），不用百分比 |
| **输出** | 对话消息（13 协议）、可选站内提示 |
| **门禁** | **完成声明必须引用本轮证据**（Gate Function）；没有证据只用"我做了 X，但未验证 Y"表达；不得把推断写成定论；**用户可见文本不得出现 Spec 内部词汇**（§1.1.1） |
| **失败处理** | 用户不接受/改需求 → 新需求进 Spec（delta），Spec 升版；**不开"验收状态机"** |
| **用户感知** | 这是用户唯一感知的一步 |

---

## 5. 门禁设计

### 5.1 阶段状态机（框架强制）

| 迁移 | 触发 | 强制条件 | 谁可触发 |
|---|---|---|---|
| draft → confirmed | Spec 结构校验通过 | 每条 Requirement 有 Scenario + Acceptance；无高风险未决 | 秘书（自动） |
| confirmed → planned | Plan 生成 | 覆盖检查通过（Requirement ⇄ Task/Evidence） | 秘书 |
| planned → executing | 首个 Task 派发 | Task 有 brief、writeScope、requiredEvidence | 控制器 |
| executing → verifying | 全部 Task done | 无未处置 Critical；每 Task 有 Evidence | 控制器 |
| verifying → verified | 双裁决通过 | Spec Compliance ✅ + Quality Approved + Evidence 齐 | 控制器 |
| verified → archived | 收尾写回完成 | 记忆候选已提交；Handoff 完整 | 秘书 |
| 任意 → blocked | 5 轮不过/需求冲突/权限拒绝 | 记 Ledger + 原因 | 控制器 |
| verified/archived → executing | reopen | 新需求/缺陷；Spec 升版 | 用户/秘书 |
| 任意 → abandoned（讨论中） | 放弃 | 记原因；不写记忆（或写"放弃"决策） | 用户/秘书 |

> 所有迁移必须**校验前置状态与证据**，不能仅凭模型一句话推进；迁移写 Ledger。

### 5.2 证据绑定（不可伪造）

**Evidence 生成规则**：
1. 由**框架工具执行层**在工具调用返回时写入（`toolCallRef`），模型不能直接 INSERT；
2. 每条 Evidence 必须有 `command`（或工具名）+ `exitCode` + `outputHash`/`artifactRef`；
3. 模型只能"引用 evidenceId"；引用不存在/不属于本 Task 的证据 = 无效；
4. 证据只追加，不删；失效用 `invalidated`；
5. **Gate Function（借鉴 B11）**：完成声明前必须完成"确定证明方式 → 跑完整命令 → 读完整输出/退出码 → 对照结论 → 才宣告"；跳过任一步=未验证；
6. **回归反向验证**：修 bug 的测试必须能"撤销修复→失败→恢复→通过"（red-green 反向），否则视为未验证（借鉴 B11 的回归检查）；
7. **不信任子代理自述**：父代理核对 diff/证据后再接受（借鉴 B11）。

**防伪造的边界**：
- Evidence 只证明"某命令/工具产生某输出"，不证明"需求正确"；需求正确靠 Spec 评审（内部）与用户对话；
- 证据哈希链（Ledger hash）防篡改（讨论中，v0 可不做）。

### 5.3 风险触发的对话确认（正式替代"人审 Spec"）

> **【已确认·用户 2026-11-06】**：本版**正式取消"人审 Spec"硬门**（即 Superpowers 的 HARD-GATE「人必须批准设计文档才开工」），改为**风险触发的对话确认**。用户不审 Spec、不看 Spec、不感知 Spec。
>
> **但内部门禁不取消**：§5.1 的阶段状态机、§5.2 的证据绑定、双裁决与修复环**照旧强制执行**。只是门的"人类确认"部分从"每次开工前"改为"只在风险动作前"。

**三类打扰（只有这三类会打断用户）**：

1. **风险门**：不可逆 / 动线上 / 删数据 / 花钱 / 影响他人；
2. **真歧义**：至少两种解释导致实质不同的动作/产物/外部影响（13 §5.5）；
3. **用户主动要求**（问了/要求确认/要求解释）。

**其余一律内部自己过门**：Spec 建立/更新（不需要确认时）、拆分（不需要确认时）、澄清（自己能定的）、Plan（无风险时）、执行进展、归档——**不打扰用户**（对应 18 §1.1.1 的投影映射）。

| 风险类别 | 触发示例 | 处理 |
|---|---|---|
| **动线上/生产** | 部署、重启、改配置、连生产库 | 必须对话确认（引用动作+影响+回滚方式） |
| **删数据/不可逆** | 删除文件/记录、强制覆盖、清理 | 必须对话确认；不可逆动作先报告再执行 |
| **花钱/外部调用** | 调用付费 API、发消息/邮件、下单 | 必须对话确认（金额/对象/次数） |
| **影响他人** | 对外发送、改共享环境、通知第三方 | 必须对话确认（对象/内容/范围） |
| **改已确认约束** | 与 12 的 constraint/decision 冲突 | 必须对话确认（引用记忆条目） |
| **跨作用域写入** | 写非本任务作用域/公共层 | 走 12 候选制 + 高风险人审（12 §5.4） |
| **真歧义** | 两种解释导致实质不同动作 | 1 个问题 + 选项 + 建议（13 §5.5） |
| **其他** | 可逆、低风险、成本低、有默认 | **不问**，自己做 + 一句说明（13 §5.5 自主阈值） |

**与 13 的关系**：复用 13 §5.5 的"真歧义先确认 + 自主决定阈值"；本表只补"动作风险"维度。**不改 13 的交互协议**。

### 5.4 双裁决（Task done 的定义）

```
Task.done  := SpecCompliance ✅  ∧  TaskQuality Approved  ∧  requiredEvidence 齐
```

- **Spec Compliance**：对照 Requirement/Scenario/Acceptance 检查 Missing / Extra / Misunderstood；**无法从证据判定的记 ⚠️（显式弃权，不许静默）**；
- **Task Quality**：错误处理、边界、测试是否验真行为、文件职责、是否引入无关改动；
- **两个 verdict 必须显式记录**；缺一 = 不通过（借鉴 B9）；
- 终审（整支 Spec）用同结构，但只允许**一波**修复（借鉴 B10）。

### 5.5 bootstrap 重注入（防"压缩后规则丢失"）

- 每次会话开始 + 每次上下文压缩后，重注入**短段**（≤20 行）：当前 Spec 阶段、下一步门禁、禁止事项、待确认风险；
- 注入内容由 SpecCore 从 DB 读当前状态生成（不靠模型记忆）；
- 与 14 §7 的"持久规则每轮重注入"一致（借鉴 B6/R6）。

### 5.6 证据充分性：反向验收（v0.2，借鉴变异测试）

> 来源：相邻调研 §6.3（Stryker）。**衡量"证据能不能抓住错误"，而不是"证据数量"**。

- **离线抽样**：周期性挑选已完成 Spec/Task，做"**反向验收**"——故意改坏实现，或把一条 `must` 需求改坏/降级，然后跑门禁；**门禁应拒绝**。若放行，说明证据只是形式（记指标，不阻塞正常流程）。
- 抽样频率与样本量属工程默认（v0 建议：每周/每 M 里程碑一次，样本 ≤10）。
- 与 E0 评测衔接：反向验收用例可作为 E0 的"门禁回归集"（design/17）。
- 不引入全量变异测试 CI（成本过高，见相邻报告 §9）。

### 5.7 `canArchive(specId)`：归档的唯一判定入口（v0.2，借鉴 Pact）

> 来源：相邻调研 §6.1。**前端/秘书不允许自己拼状态判断能不能归档**；只查这一个函数/接口。

**输入**：specId（可带 version）。
**输出**：`{ allowed: boolean, blockers[], warnings[], missingEvidence[], shouldReasons[] }`。

**判定内容（缺一不可）**：

1. Spec 状态 ∈ `{verified}` 或（circuit breaker 后的 `executing` 降级路径）；
2. **所有 `acceptanceKeys` 都被覆盖**，且每个 `must` 的 key 都有可查 Evidence（无 → blocker）；
3. 所有 `should` 的缺证都有理由（无理由 → blocker；有理由 → warning）；
4. 无未处置的 `Critical/Important` verdict（查询 Ledger）；
5. 无未决冲突/`open_question`（与 12 的 disputed/open_question 对齐）；
6. 父链/依赖（`depends_on`）满足：父 Spec 未 archived 时，子 Spec 可不阻塞归档但需 warning；反过来阻塞；**Task 级 `dependsOn` 必须全部 verified**；
7. 若 `appetite` 超预算且未降级 → 返回建议"circuit breaker（缩 must 或 partial）"，而不是允许延期；
8. 若任一 Task 的 `boundary` 被越界记录 → blocker（越界即失败，需先修复/记 ruling）。

> 实现上它是**只读查询**（读 DB 投影），不是状态改写；归档动作在通过后由单写者执行。

### 5.8 形式化只借"不变量 + 前置/后置"（v0.2）

> 来源：相邻调研 §3.4/§3.5。**不借 TLA+/Alloy/Dafny 工具链**，只借设计期思维。

**不变量清单（运行时断言 + 单测）**：

| # | 不变量 | 落地 |
|---|---|---|
| INV1 | `archived ⇒ ¬can_execute` | 状态迁移守卫 |
| INV2 | `verified ⇒ has_evidence`（must 全有证据） | `canArchive` 检查 |
| INV3 | 事件是真相：`status` = fold(event_log) | 重放单测（随机事件序列 fold 应等于 DB 状态） |
| INV4 | 一个会话最多一个 Spec（`sessionId` 唯一） | DB 唯一约束 |
| INV5 | `Task.verified ⇒ 双 verdict 齐` | Ledger 校验 |
| INV6 | 子 Spec 未 `verified` 时父 Spec 不可 `verified`（除非显式 waiver） | 状态机守卫 |

**前置/后置**：Requirement 可选 `pre/post` 字段（Dafny 只借字段语义），用于生成边界用例与断言；不要求形式化证明。
**设计期检查**：每次改状态机时跑"不可达状态/不可能迁移"静态检查（XState 思想，可表驱动实现）。

---

## 6. 三文件交接（brief / report / review-package）

### 6.1 契约

| 文件 | 谁写 | 谁读 | 内容 | 约束 |
|---|---|---|---|---|
| **brief** | 控制器 | 执行实例 | Task 目标、Spec 片段、writeScope、requiredEvidence、前序接口/决策、返回契约 | **父不传全文**；≤2K tokens；只给"触发+路径+契约"（借鉴 B8） |
| **report** | 执行实例 | 控制器/审查者 | 做了什么、四态结论、Evidence 引用、未决、偏离与理由 | **必须引用 evidenceId**；偏离必须记 Ruling（不许静默） |
| **review-package** | 控制器 | 审查者 | 变更 diff（或 diff 的 DB 引用）、report、Spec/Plan 片段、Review Focus | **审查者只读它**；不重跑全套、不爬代码库、不派子代理（借鉴 Superpowers 的审查者能力边界） |

### 6.2 物理形态（DB 化，重要）

- 用户拍板"统一 DB、文件只做导入/导出"（10 §31），所以三文件**物理上落 `documents` 表**（`kind=brief/report/review_package`，内容 hash，归属 Task/Spec）；
- **交接纪律不变**：父只传 `documentId`（handle），不传正文；执行实例按 ID 取 brief，回报按 ID 写 report；
- 需要与外部工具/人协作时，可导出为文件（导入/导出视图），但**DB 是真相**；
- 大小预算：brief ≤2K tokens、report ≤3K tokens、review-package 只放 diff 引用（diff 本体存 artifact，避免灌上下文）。

### 6.3 结构化 Handoff

```text
Handoff {
  specId, taskId?, baseVersion,
  did:       string,            // 做了什么
  conclusion: string,           // 结论
  artifacts: [{kind, ref, note}],
  evidence:  [evidenceId],
  open:      [{question, blocking, suggestion}],
  risks:     [{what, severity, mitigation}],
  next:      string             // 建议下一步
}
```

- 执行实例 → 控制器：只回 Handoff + report；控制器 → 秘书：只回摘要 + 指针；
- 用户看到的永远是秘书转述（13 §11.5），不是 Handoff 原文。

---

## 7. 拆分判据与"组织嵌套 / 执行平铺"

### 7.1 什么时候拆子 Spec

**判据（借鉴 OpenSpec `/work`）**：**新需求能否独立接受/排期/验证/发布**？

| 情况 | 处理 |
|---|---|
| 新需求点只是当前需求的**细节/约束/验收补充** | **留在同一 Spec** 作为 Requirement（不拆） |
| 需要**独立执行**（不同工具/环境/实例） | 可拆子 Spec，但若验证/发布仍绑定父 Spec → 也可留作 Task |
| 需要**独立验收/发布**（能单独说"这个做完了"） | **拆子 Spec**（新会话/子会话） |
| 只是**排期不同**、验收仍一起 | 留同一 Spec，用 Task 分组/依赖 |
| 有明确的**外部依赖/交接物** | 拆子 Spec + `SpecRelation.depends_on` |

**v0.3（E5 规模四档，以 E5 为准）**：

| tier | 判据（E5 §4.1/§5.4） | 形态 |
|---|---|---|
| **trivial（T0）** | 一个可逆动作、无新未知、无需跨任务接口/验收 | **至多一个 Plan/Task，可无 DAG**；**Spec 按需创建**（可不建正式 Spec，或只建极简 Spec）；直接执行并落 Task/Activity |
| **one-session** | 一次会话可完成，1–3 个 Task | Spec + 1 个 Plan + 少量 Task；完整七步剪裁版 |
| **epic** | 多阶段/多依赖，需拆分 | Spec + Plan + Task DAG，必要时拆子 Spec |
| **project** | 跨会话/跨领域，需持续多轮 | 父 Spec + 子 Spec 森林 + 依赖关系 |

> 与 v0.2 的冲突：v0.2 写"一个会话=一个 Spec"隐含"先建 Spec"；**v0.3 以 E5 为准——"至多一个、按需创建"**（T0 不强制）。正式任务仍建议有极简 Spec 以便追溯。
>
> 用户额外拍板：不同需求点**先放同一 Spec**（10 §31）；所以"拆"是例外而非常态。拆的动作由秘书内部完成，用户只看到"这件事我单独开一个子会话推进"。

### 7.2 组织嵌套 vs 执行平铺

```
组织（DB 关系）                          执行（平铺）
Spec A (root)                           executor pool
 ├─ Spec B (parent=A)   ── 关系边 ──>    [Task A1] [Task B1] [Task B2] ...
 │    └─ Spec C (parent=B)              （所有可执行 Task 同一池；不按 Spec 层级递归）
 └─ Spec D (parent=A, depends_on B)
```

- **组织上可嵌套**：`parentSpecId` + `SpecRelation` 表达层级/依赖/关联；用于上下文、展示、排期；
- **执行上平铺**：执行器不感知父子层级；每个 Task 独立派发/验收；子 Spec 只是"普通执行单元"；
- **不设固定粒度**（用户拍板"灵活判断"）：不强制 depth/每层数量；只设**软预算**（并发/深度/每 Task 修复轮次，讨论中）；
- **嵌套只影响读/排期/验收顺序，不影响写权限**；跨 Spec 写仍走记忆候选/作用域规则。

### 7.3 例子

| 用户说 | Spec 处理 |
|---|---|
| "给产品页加一个筛选" | 一个 Spec，一个 Requirement（或几个） |
| "加筛选 + 顺手把后端接口也改了" | 同一 Spec（接口是支撑）还是拆？看"后端接口能否独立验收"；能 → 子 Spec；不能 → Task |
| "先做支付，支付做完再做对账（两件事分别上线）" | 两个 Spec，`depends_on` |
| "这个需求先放着，半年后再说" | Spec 保持 draft/archived；不写记忆（或写 open_question） |

---

## 8. 数据库表设计草案（SQLite）

### 8.1 原则

1. **单库 SQLite + 单写者**：所有写走单一命令入口（actor/队列），读用快照；避免并发写冲突（借鉴 12 §6 的单写者）。
2. **append-only 优先**：spec_versions / evidence / ledger / **event_log** / **activities** 只追加；更新用新版本/新行。
3. **事件历史是真相**（Temporal 纪律）：`event_log` 记录所有状态变化；`sc_specs.status`/`sc_tasks.status` 是**投影**（可重算）；恢复=重放事件，副作用结果落库后**重放不重算**。
4. **JSON 字段 + JSON Schema**：Requirement/Scenario/Acceptance 等结构存 JSON；**同一份 schema 约束 LLM 输出与入库**（不是 markdown+正则）。
5. **外键 + 事务**：关键一致性用事务；跨表写入用"命令 + event_log 行"一起提交。
6. **文件只做导入/导出**（【拍板】10 §31）：DB 是唯一真相；导出 JSON/Markdown 为视图。
7. **进度真源单点**：`sc_tasks.status`（见 §8.4）。
8. **Spec 是记忆的内部 kind**：`memory_items.kind=spec`，默认不进用户可见记忆页（见 §8.5）。

### 8.2 表（草案）

> 命名约定：`sc_` 前缀表示 SpecCore 内部表（避免与消息/记忆表混淆）；类型/约束为草案。

**1) `sc_specs`**（Spec 主表）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | TEXT PK | spec id |
| `session_id` | TEXT UNIQUE | 一 Spec 一会话 |
| `parent_spec_id` | TEXT NULL | 组织父子 |
| `goal_id` | TEXT NULL | 顶层目标 |
| `title` / `intent` | TEXT | 标题/意图 |
| `status` | TEXT CHECK | draft/confirmed/planned/executing/verifying/verified/archived |
| **`tier`** | TEXT CHECK | trivial/one-session/epic/project（E5 四档；trivial 可无 Plan/Task DAG，Spec 按需创建） |
| `outcome` | TEXT CHECK | complete/partial（partial = circuit breaker 降级归档，§3.7） |
| **`appetite`** | JSON | Shape Up 时间预算 `{timeBudget, maxScope, unit}` |
| **`non_goals`** | JSON | 非目标列表（父→子继承） |
| **`rabbit_holes` / `glossary`** | JSON | 已知坑 / 本地术语表（P2） |
| `current_version` | INTEGER | 指向 sc_spec_versions |
| `memory_scope_refs` | JSON | 读作用域 |
| `created_at` / `updated_at` / `archived_at` | TEXT | ISO8601 |
| `reopen_count` | INTEGER DEFAULT 0 | reopen 次数 |

**2) `sc_spec_versions`**（版本快照 + delta，append-only）

| 列 | 类型 | 说明 |
|---|---|---|
| `spec_id` | TEXT FK | |
| `version` | INTEGER | 联合 PK |
| `base_version` | INTEGER | 乐观并发 |
| `requirements` | JSON | Requirement[]（EARS 字段 + scenario/acceptance 嵌套，按 JSON Schema） |
| `delta` | JSON | 四操作列表（ADDED/MODIFIED/REMOVED/RENAMED） |
| `schema_version` | INTEGER | Requirement schema 版本（便于演进/回放） |
| `change_reason` | TEXT | 为什么升版 |
| `content_hash` | TEXT | 防篡改/去重 |
| `created_by` / `created_at` | TEXT | 秘书/合并器 |
| PK | (spec_id, version) | |

**3) `sc_spec_relations`**

| 列 | 类型 | 说明 |
|---|---|---|
| `from_spec_id` / `to_spec_id` | TEXT FK | |
| `rel_type` | TEXT | informs/reframes/depends_on/supersedes? |
| `note` | TEXT | |
| `created_at` | TEXT | |
| PK | (from, to, rel_type) | |

**4) `sc_plans`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | |
| `spec_id` / `spec_version` | FK | Plan 回链 Spec 版本 |
| **`plan_revision`** | INTEGER | 同一 Spec 版本内单调 +1（局部重规划不升 Spec 版本） |
| **`supersedes_plan_id`** | TEXT NULL | 全局重规划时指向被取代 Plan（旧 Plan 标 superseded） |
| `status` | TEXT | draft/active/superseded |
| `verification_approach` | TEXT | |
| **`boundary`** | JSON | `{writeScope,readScopes,allowedTools,forbiddenActions}` |
| `created_at` | | |

**5) `sc_tasks`**（进度真源）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | |
| `spec_id` / `plan_id` / `parent_task_id` | FK/NULL | parent 仅展示 |
| `title` | TEXT | |
| `status` | TEXT CHECK | todo/doing/blocked/done/verified/dropped |
| **`depends_on`** | JSON | Task id 列表（DAG；无环、无自依赖；全 verified 才就绪） |
| **`acceptance_keys`** | JSON | 覆盖的验收键（至少 1 个；对齐 E0 grader / canArchive） |
| **`boundary`** | JSON | `{writeScope,readScopes,allowedTools,forbiddenActions}`（越界即失败） |
| `task_kind` | TEXT | implement/review/fix/spike/ops（E5；spike 需标 PROTOTYPE、不得合入） |
| `implementation_notes` | TEXT NULL | 实现注意事项（从 cc-sdd 借鉴，可选） |
| `write_scope` | JSON | 从 `boundary.writeScope` 冗余，便于索引/冲突检查 |
| `required_evidence` | JSON | 需要的证据类型 |
| `attempt` | INTEGER | 修复轮次/尝试次数 |
| `assignee` | TEXT NULL | 执行实例 |
| `order_index` | INTEGER | 断点顺序 |
| `updated_at` | TEXT | |

**6) `sc_documents`**（三文件 + 导出视图）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | handle（父只传 id） |
| `kind` | TEXT | brief/report/review_package/export |
| `subject_type` / `subject_id` | TEXT | task/spec |
| `content` / `storage_ref` | TEXT | 正文或对象引用 |
| `content_hash` | TEXT | |
| `created_by` / `created_at` | TEXT | |
| `expires_at` | TEXT NULL | 工作区清理（讨论中） |

**7) `sc_evidence`**（不可伪造）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | |
| `subject_type` / `subject_id` | TEXT | task/requirement/acceptance |
| `kind` | TEXT | tool_output/test_run/diff/artifact/command/approval/screenshot |
| `tool_call_ref` | TEXT | 框架工具调用 ID（必填） |
| `command` / `exit_code` / `output_hash` | TEXT/INT | |
| `artifact_ref` | TEXT NULL | |
| `produced_by` / `produced_at` | TEXT | 框架写 |
| `invalidated_at` / `invalid_reason` | NULL | 失效不删 |

**8) `sc_handoffs`**

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | |
| `spec_id` / `task_id` | FK/NULL | |
| `payload` | JSON | did/conclusion/artifacts/open/evidence/risks/next |
| `base_version` | INTEGER | |
| `created_at` | TEXT | |

**9) `sc_ledger`**（append-only 恢复协议）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | |
| `spec_id` / `seq` | UNIQUE(spec_id, seq) | |
| `kind` | TEXT | stage/gate/verdict/fix_round/ruling/adjudication/close |
| `payload` | JSON | 详情 |
| `evidence_refs` | JSON | |
| `actor` | TEXT | |
| `at` | TEXT | |
| `prev_hash` / `hash` | TEXT NULL | 哈希链（讨论中） |

**10) `sc_event_log`**（事件历史 = 真相，v0.2）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | 事件 id |
| `seq` INTEGER | 全局单调（单写者分配） | 重放顺序 |
| `spec_id` / `task_id` | FK/NULL | 归属 |
| `type` | TEXT | `spec_created/spec_versioned/status_changed/task_status_changed/evidence_added/verdict/fix_round/ruling/archived/reopened…` |
| `payload` | JSON | 事件数据（足以重建状态） |
| `actor` / `at` | TEXT | 谁/何时 |
| `causation_id` / `correlation_id` | TEXT NULL | 因果/关联（可选） |

- **不变量**：状态字段 = `fold(event_log)`；任何状态写必须在同一事务里追加事件（禁止"内存改了、事件没记"）。
- **恢复**：读最新快照（可选）→ 重放之后的事件；**副作用结果（activities 输出）落库后重放复用，不重算**。

**11) `sc_activities`**（LLM 调用 = Activity，先落库再推进状态，v0.2）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | activity id |
| `spec_id` / `task_id` / `step_id` | FK/NULL | 归属 |
| `kind` | TEXT | `llm_call`（v0；预留 tool/approval） |
| `model` / `provider` | TEXT | 模型信息 |
| `request_hash` / `response_hash` | TEXT | 输入/输出指纹 |
| `request_payload` / `response_payload` | JSON/BLOB | 可存全量或引用（含 tool_calls/usage） |
| `tokens_in/out` / `cost_usd` | INT/REAL | token/成本（单一计量对账） |
| `started_at` / `finished_at` | TEXT | |
| `status` | TEXT | `started/succeeded/failed/aborted` |
| `idempotency_key` | TEXT UNIQUE | 防重放重复扣费/重复副作用 |

- **纪律**：模型调用前写 `started`，返回后写 `succeeded/failed`；**先落库，才允许迁移状态机**；
- **重放**：同一 `idempotency_key` 命中则复用结果（不重调模型）；副作用结果落库后重放不重算（Temporal 纪律，不引入 Temporal server）。

**12) `sc_decisions`**（ADR/Y-statement，v0.2）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` TEXT PK | | 单调、不复用 |
| `spec_id` | FK | 归属 Spec（内部 `memory_items.kind=decision`） |
| `status` | TEXT | proposed/accepted/deprecated/superseded |
| `supersedes` / `superseded_by` | TEXT NULL | 双向互链，保留历史 |
| `context` / `concern` / `chosen` / `accepted_downside` | TEXT | Y-statement 四槽位 |
| `rejected` | JSON | 被否选项与理由 |
| `created_at` | TEXT | |

**13) 已有表的衔接（不重复定义，引用现有设计）**

| 表 | 来源 | 与 Spec 的关系 |
|---|---|---|
| `messages` | 13/14 | 每条消息带 `session_id`；Spec 的对话证据来自 message 引用；**不把 Spec 状态写进消息表** |
| `memory_items` | 12 | **`kind=spec` 承载 Spec（内部类型，用户不可见）**；收尾只把结论/决策/经验以候选写回普通记忆（12 §5）；**记忆页按 kind 过滤掉 spec** |
| `sessions` | 14 | `sc_specs.session_id` 唯一引用；会话生命周期（10 §22）不变 |
| `artifacts` | 14 | Evidence 可引用产物；产物预览/下载走 14 §5.4 |

> 说明：Requirement/Scenario/Acceptance 不单表（放 `sc_spec_versions.requirements` JSON）——v0 优先原子性与简单；若后续需要"按 requirement 跨版本查询/引用"，再拆 `sc_requirements` 索引表（讨论中）。

### 8.3 单写者、并发与迁移

- **单写者**：所有写命令进一个队列/actor；事务内写实体 + Ledger；读用 WAL 快照；
- **乐观并发**：提交带 `base_version`；过期 → 拒绝/重合并（同 12 §6.1）；
- **幂等**：命令带 `command_id`（重复提交不重复写）；
- **迁移**：`PRAGMA user_version` + 顺序脚本；迁移前自动备份；**只前进不回滚**（回滚用备份）；导出 JSON 作为逃生口；
- **备份**：定时 DB 副本 + 导出；文件仅导入导出（【拍板】）。

### 8.4 进度真源（单点）

- **唯一**：`sc_tasks.status`；派生看板 = `COUNT(status)` 查询；
- Spec.status 是工作流阶段（§3.7），**不等于进度**；不许在 `sc_specs` 存 "pct/progress" 字段；
- 断点恢复：查 `status IN (todo, doing, blocked)` 且 `depends_on` 全部 verified，按 `order_index` 取第一个；**不依赖内存/会话变量**；
- 并发写 Task：以 Task 为单位加乐观锁（`version`/`updated_at`），不锁整库。

### 8.5 Spec 与记忆的衔接（v0.2：Spec = 记忆的一种内部 kind）

| 项 | 约定 |
|---|---|
| **存储复用** | Spec 使用 `memory_items` 的 `kind=spec`（以及 `kind=decision` 的决策）；共享 12 的版本/来源/失效语义 |
| **不可见** | 记忆页/检索/上下文注入默认**排除内部 kind（spec/decision 草稿）**；用户看到的是"合并后的记忆"，不是 Spec（10 §31；18 §1.1.1） |
| **写回** | Spec 收尾只把**结论/决策/经验**作为候选写回普通记忆（12 §5）；Spec 正文、Requirement 细节、Evidence 明细**不写回** |
| **冲突** | Spec 内部 decision 与 `memory_items` 的 decision/constraint 冲突 → 以 12 §7.3 权威分轴 + `disputed` 处理，不静默覆盖 |
| **导出** | `export_spec_markdown(specId)` 只是**视图**（文件仅导入/导出）；内容由 DB 生成，回写 DB 需走导入校验 |
| **检索** | Spec 的 Requirement/Scenario 可被秘书检索（内部）；对用户搜索默认不可见（记忆页只显示普通记忆） |

---

## 9. 不照搬清单

### 9.1 OpenSpec：不照搬

| # | 不照搬 | 为什么 | 我们的替代 |
|---|---|---|---|
| O1 | 文件目录 + git 作为存储/合并 | 并发写冲突、静默覆盖、与"统一 DB"冲突 | SQLite + 单写者 + 版本化（§8） |
| O2 | 就地 archive（delta 合并进主 spec、可裁剪归档） | 覆盖式更新丢失历史；与"失效不删"冲突 | 版本 + delta + 失效不删；归档=软删/可 reopen |
| O3 | markdown 正则校验（`####` 等） | 格式脆弱、静默失败；中文/结构化数据不适合 | schema 校验 + 结构化字段（§3） |
| O4 | 用户可见 `openspec/changes` 目录与 slash 命令 | 用户不感知 Spec（【拍板】） | 内部对象 + 自然语言对话 |
| O5 | 假设"单会话/串行/干净上下文" | 我们多任务同窗、可打断、并发实例 | 并发安全 + 证据绑定 + Steer/Queue（13） |
| O6 | 英文 RFC 2119（SHALL/MUST）词表 | 中文语境；校验成本高 | 中文"必须/禁止"语义 + 结构化 kind |
| O7 | 多层用户可见名词（initiative/workspace 等） | OpenSpec 自己已收缩，警告"别做成用户名词" | 层级只做数据字段（parentId/relations） |
| O8 | 命令/技能双形态、30+ 工具适配 | 单宿主自研，纯负担 | 单一实现（内部 API/工具） |

### 9.2 Superpowers：不照搬

| # | 不照搬 | 为什么 | 我们的替代 |
|---|---|---|---|
| S1 | 一切压进提示词（HARD-GATE/1% 规则） | 软约束不可校验；模型会合理化 | 阶段状态机 + 证据绑定（§5） |
| S2 | **人审 Spec 的 HARD-GATE**（人批 design doc 才开工） | 与"用户不感知 Spec"直接冲突（【已确认·11-06】） | 风险触发的对话确认（§5.3） |
| S3 | 全量 TDD 铁律（探索型也强制） | 探索/spike 成本过高 | 实现阶段强制；spike 用 `PROTOTYPE` 标记、禁止合入（讨论中） |
| S4 | "重复直到通过"的修复环 | 病态循环/成本失控 | ≤5 轮 + 裁决 + Ledger（§4.5） |
| S5 | 16 宿主平台矩阵 | 单宿主产品；兼容层无收益 | 只服务本机 Web |
| S6 | 16 技能 + 1% 触发规则 | 过度流程；简单问题也要查技能 | 只保留阶段级规则 + 按需 references（体积预算） |
| S7 | 文件交接依赖 agent 自律写文件 | 文件会丢/污染/漂移 | DB documents + handle + 单写者（§6/§8） |
| S8 | "human partner" 语气/社区文化 | 是产品人格，不是机制 | 不照抄；我们的语气由 14 §8 执行原则定 |
| S9 | plan 按分钟估时 | 不适用于 LLM 执行 | Task = 最小可测试单元（§3.4） |

### 9.3 两家共同的"不照搬"

- **不把 Spec 做成用户文档**；**不引入第二套状态机**；**不做跨工具兼容层**；**不做"人审 Spec"硬门**；**不做文件即真相**。

---

## 10. 与现有设计的冲突点与解决建议

| # | 冲突 | 冲突双方 | 解决建议 |
|---|---|---|---|
| C1 | **Superpowers 的 HARD-GATE「人批 Spec 才开工」** vs **用户不感知 Spec** | Superpowers §2 阶段 1 ↔ 10 §31 | **已正式替换（用户 2026-11-06 确认）**：取消"人审 Spec"硬门；Spec 内部自动 confirmed；只有**风险动作**（动线上/删数据/花钱/不可逆/影响他人）走对话确认（§5.3）；**状态机与证据绑定继续强制** |
| C2 | **OpenSpec 的就地归档** vs **我们"失效不删/版本化"** | OpenSpec §2.3 ↔ 12 §2.7 | 归档 = Spec 状态改 `archived`（软删、可 reopen）；历史版本/证据/Ledger 全保留；不合并覆盖、不裁剪 |
| C3 | **OpenSpec `tasks.md` 唯一进度** vs **我们 DB task 状态唯一进度** | OpenSpec §3.2 ↔ 10 §31 | 语义相同、载体不同：`sc_tasks.status` 是唯一进度；**禁止再存"Spec 百分比"或第二份进度**；导出文件时从 DB 生成 |
| C4 | **Superpowers 无 spec 版本管理** vs **我们需要版本化** | Superpowers §4.2 ↔ 12 §2 | Spec 带版本 + delta + baseVersion；Plan 回链 `specId@version`；Spec 升版 → Plan 失效检查 |
| C5 | **"一个会话=一个 Spec"** vs **"一个会话里有很多更细需求点"** | 10 §30–31 | 细需求点先作为**同一 Spec 的 Requirement**；只有"能独立接受/排期/验证/发布"才拆子 Spec（§7）。不把每个点都升格 |
| C6 | **Spec 内部真相层** vs **记忆是唯一真相（12）** | 10 §31 ↔ 12 §1 | v0.2 修正：**Spec = 记忆的一种内部 kind（`kind=spec`）**，与记忆共享存储/版本/来源/失效语义；但默认**不进用户可见记忆页**，也不直接覆盖普通记忆。**单向写回**：Spec 结论→候选→普通记忆；记忆不反向覆盖 Spec；Spec 原文不写回（18 §1.2/§8.5） |
| C13 | **Shape Up circuit breaker 自动降级** vs **会话不自动结束/不自动完成（10 §22）** | 相邻调研 §4 ↔ 10 §22 | circuit breaker 只作用于**Spec（需求单元）**，不关闭会话：超 `appetite` → 缩 `must` 范围 → 以 `outcome=partial` 归档该 Spec；**会话仍进行中**，用户可 reopen 或开新 Spec。除"超预算"外仍不自动完成 |
| C14 | **Temporal 事件历史=真相** vs **"进度真源唯一（tasks.status）"（10 §31）** | 相邻调研 §3 ↔ 10 §31 | 二者不矛盾：`event_log` 是**状态变化的真相/重放源**；`sc_tasks.status` 是**唯一进度投影**（不存第二份进度字段）。查询进度只读 `tasks.status`，恢复/审计读 `event_log` |
| C15 | **变异测试/反向验收** vs **"门禁不可被绕过"** | 相邻调研 §6.3 ↔ 本稿 §5 | 反向验收是**离线抽样度量**，不进主流程、不阻塞交付；只用于检验证据是否形式化（放行则记指标，不改变门禁规则） |
| C16 | **E5 trivial 档"Spec 按需创建"** vs **"一个会话=一个 Spec"** | 23 §4.1/§12.3 ↔ 10 §31 | **以 E5 为准**：改为"至多一个、按需创建"；T0 允许不建正式 Spec（只落 Task/Activity）；正式任务仍建议极简 Spec 便于追溯（§3.7/§7.1） |
| C17 | **E5 planRevision** vs **"Spec 版本变化才重规划"** | 23 §7.2/§7.4 ↔ 本稿 v0.2 §3.4 | **以 E5 为准**：局部重规划只 +planRevision，不升 Spec 版本；只有需求/delta 变化才升 Spec 版本。旧 Plan 标 superseded、不删除（§3.4/§8） |
| C18 | **E5 dependsOn / boundary** vs **v0.2 "writeScope + order"** | 23 §6 ↔ 本稿 v0.2 §3.4 | **以 E5 为准**：并行/串行由 `dependsOn` DAG + `boundary.writeScope` 不相交判定；order 仅作就绪顺序的 tie-breaker；越 `boundary` 即失败（§3.4/§5.7） |
| C7 | **"验收走消息/取消验收状态机"** vs **Spec 需要 verified 状态** | 10 §24–25 ↔ 本稿 §3.7 | 分清两种验收：① **用户验收**=对话（接受/不接受/改需求），无状态机；② **Spec 内部 verified**=证据+双裁决的**内部完成标记**，用户不可见。二者不互相替代 |
| C8 | **"记忆页只读可见"** vs **"Spec 不可见"** | 10 §31 ↔ 12/14 | 两条线：记忆页只显示 memory_items（可见只读）；Spec 不进记忆页、不进 UI；用户只能通过对话了解需求进展 |
| C9 | **执行平铺** vs **会话树/主窗口嵌套** | 10 §31 ↔ 13 §11.7/14 §5 | 组织层级只在 DB（parentId/relations）+ UI（会话树）；执行器无层级概念；Task 平铺调度（§7.2） |
| C10 | **E0 评测提前** vs **SDD 验证门** | 10 §29 ↔ 本稿 §5 | 两者互操作：Evidence/verdict 可作为 E0 的 golden/regression 输入；E0 的 grader 可读取 Ledger/Evidence 判定；不建第二套评测数据 |
| C11 | **路线图 M1–M7 无 SDD 里程碑** | 15 ↔ 本稿 | 建议插入点（讨论中）：M1 建 `sc_*` 表与事件/检查点；M2 对话产生 Spec（draft/confirmed）；M4 会话树接 parentSpecId；M5 长任务接 Plan/Task/Evidence；M6 归档接 Spec 归档；具体以 G1 路线图调整为准 |
| C12 | **"取消交付机制"** vs **Handoff/收尾写回** | 10 §24 ↔ 本稿 §3.5/§4.6 | Handoff 是**内部交接**（执行→控制器/秘书），不是"交付推送"；不产生用户可见交付状态、不自动推父会话；父会话仍靠聚合视图 + 按需取用（10 §24–25） |

---

## 11. 待用户拍板（≤5 个，每条带建议默认）

> **E5 相关项已由 lead 按用户 2026-11-06 授权拍板**（见 §2.4）：`planRevision` / `supersedesPlanId`、`dependsOn`、`acceptanceKeys`、`boundary`、trivial 档"Spec 按需创建"均采纳，**不占下面 5 个用户拍板问题**；E5 原稿"待 18 对齐"的条目视为已对齐（§12.3/跨文档对齐表）。

### Q1. Spec 是否需要 `supersedes`（取代关系）？

- **背景**：Spec 版本已能表达"同一需求内变更"；`supersedes` 只用于"整份 Spec 被另一份取代"（如需求彻底重写/重建）。
- **建议默认**：**要，但只在 Spec 级、且只作 `SpecRelation` 的一种**；同一 Spec 内用 delta/版本，不用 supersedes。v0 可先不启用，留字段。
- **影响**：关系表/查询复杂度；历史追溯。

### Q2. `appetite` 默认值与 circuit breaker 默认动作？

- **背景**：Shape Up 的时间盒是"固定时间、弹性范围"；超预算默认砍范围，而不是延期。
- **建议默认**：秘书按任务规模给默认 `appetite`（小/中/大 = 1 天 / 3 天 / 1 周，**待真实数据校准**）；超预算默认 **circuit breaker**——缩 `must` 集合 → 可验证部分以 `outcome=partial` 归档；用户可显式"再给一个预算"，最多一次。
- **影响**：用户预期（"怎么没做完"）、Spec 质量（partial 的比例）。

### Q3. Spec 作为记忆 `kind` 的可见性隔离与导出？

- **背景**：v0.2 采纳"Spec = 记忆的一种内部 kind（`kind=spec`）"；但记忆页对用户可见只读，Spec 永远不可见（10 §31）。
- **建议默认**：记忆页 / 检索 / 上下文注入默认**过滤内部 kind**（`spec`、未确认的 `decision` 草稿）；**markdown 导出只是视图**（只读生成，导入需 schema 校验）；用户不能通过记忆页看到 Spec 原文。
- **影响**：记忆页查询范围；导出/导入的边界。

### Q4. 执行实例能否直接写 Spec（spec_versions）？

- **建议默认**：**不能**。执行实例只能提交候选（candidate delta/requirement），由**秘书/控制器（单写者）**合并；避免并发写与责任不清（同 12 的候选制思想）。
- **影响**：写入延迟；执行中发现需求变更的流程（走 Handoff + 候选）。

### Q5. reopen 的范围与风险门阈值？

- **建议默认**：`verified`/`archived` 可 reopen（新需求/缺陷），需 **Spec 升版 + 记 Ledger + 一句告知**；`partial` 可 reopen 或开新 Spec；归档仍只读可恢复（10 §25）。风险门**沿用 13 §5.5 + 动作风险清单**（动线上/删数据/花钱/不可逆/影响他人 → 必问），只有三类打扰（18 §1.1.1）。
- **影响**：状态机复杂度；用户打扰频率。

> 以上 5 条之外的实现细节（表名/索引/迁移脚本/哈希链等）属工程决定，不占用户拍板。

---

## 12. 附录

### A. 术语（SpecCore 内部，不暴露）

| 术语 | 含义 |
|---|---|
| Spec | 会话内需求真相；**至多一个、按需创建**（E5 trivial 档可不建正式 Spec） |
| Requirement / Scenario / Acceptance | 需求 / 可测例子 / 验收标准 |
| Plan / Task | 怎么做 / 执行与进度单位 |
| Evidence | 不可伪造的证据记录 |
| Handoff | 结构化交接（内部，不是交付） |
| Ledger | 追加式过程账本/恢复协议 |
| SpecRelation | Spec 间关系（informs/reframes/depends_on/supersedes?） |
| SpecCore | 本框架内部名，不暴露给用户 |
| EARS / pattern | 需求五句型（ubiquitous/event/state/optional/unwanted），Requirement 的 `pattern` 字段 |
| strength（RFC 2119） | `must/should/may`；直接决定证据门强度（must 缺证据=阻塞） |
| Gherkin Then 戒律 | Scenario 的 then 只允许"用户/外部可观察输出" |
| appetite | 时间预算（Shape Up）；超预算触发 circuit breaker |
| circuit breaker | 超预算/多次不过时默认砍范围或降级，不默认延期 |
| Activity | 一次 LLM 调用（或工具）的记账记录；先落库再推进状态 |
| event_log | 事件历史（真相）；状态是其投影；恢复靠 replay |
| canArchive(specId) | 归档的唯一判定入口；返回 allowed/blockers/warnings |
| Y-statement / ADR | 决策模板与状态语义（proposed/accepted/deprecated/superseded，互链保留） |
| reverse acceptance | 反向验收：故意改坏实现/需求，检验证据门是否拒绝 |
| planRevision / supersedesPlanId | Plan 局部修订序号 / 全局重规划时被取代的旧 Plan（E5） |
| dependsOn | Task 依赖 DAG（无环；全 verified 才就绪） |
| acceptanceKeys | 验收键：覆盖检查与 canArchive 的判定单位（对齐 E0 grader） |
| boundary | writeScope/readScopes/allowedTools/forbiddenActions（对齐 E3 边界、E2 角色槽位） |
| tier | trivial/one-session/epic/project（E5 规模四档；trivial 可无 DAG、Spec 按需创建） |

### B. 与上游/参考的映射

| 本文概念 | OpenSpec | Superpowers |
|---|---|---|
| Spec / spec_versions | `specs` + `changes` | spec + plan 回链 |
| delta 四操作 | ADDED/MODIFIED/REMOVED/RENAMED | — |
| Task 进度 | `tasks.md` checkbox | ledger + report |
| 双裁决 | — | Spec Compliance × Code Quality |
| 修复环 | — | ≤5 轮 + 裁决 |
| 三文件交接 | — | brief/report/review-package |
| 证据门 | verify 记分卡 | verification Gate Function |
| bootstrap 重注入 | — | SessionStart（startup/clear/compact） |
| DB 单写者 | （无；文件+git） | （无；文件） |
| Requirement 结构 | — | —（相邻：EARS + RFC 2119） |
| appetite / circuit breaker | — | —（相邻：Shape Up） |
| 事件历史 / Activity | — | —（相邻：Temporal） |
| canArchive | verify 记分卡 | verification Gate Function + Pact `can-i-deploy` |
| 反向验收 | — | —（相邻：变异测试思想） |

### C. 明确不在本稿

- 实现代码/表结构 DDL/API 设计；
- UI 呈现（用户不可见 Spec；如需"需求摘要"展示，归 13/14 讨论）；
- 评测框架细节（归 design/17 E0）；
- 具体调度算法/并发上限（归路线图/实现设计）。

### D. 跨文档字段对齐表（18 / 21 / 22 / 23）

> 用途：18 v0.3 的字段是**单一出处**；21（E3 提示词）、22（E4 记忆/RAG）、23（E5 Planner）引用时以本表为准。**标"待改"的仅表示引用文档的措辞需同步，不代表 18 字段未定。**

| 字段 | 18 定义（本稿） | 21（E3）引用 | 22（E4）引用 | 23（E5）引用 | 对齐动作 |
|---|---|---|---|---|---|
| **Spec** | 内部 `kind=spec`；至多一个、按需创建；`tier` 四档 | 21 §2.2/§4 用 `specView` 片段（不整篇） | 22 §1.4 检索 `kind=spec`（内部）、用户侧排除；片段=Requirement/Scenario/Acceptance 原子句 | 23 §3.1/§12.3 三层 Spec→Plan→Task；trivial 档 | 21/22/23 已引用；18 v0.3 补 `tier`、按需创建 |
| **Requirement** | `pattern/trigger/state/feature/response/strength/pre/post/acceptanceKeys[]` | 21 §2.2 L2 任务层含 `acceptanceKeys`；v0.1 更正说它并入 `specView`/`frame` | 22 片段单位（EARS 原子句） | 23 §5.2 EARS+RFC2119 规划用法 | **21 的措辞"并入 specView/frame"是渲染层归并，不是删除字段**；18 保留字段，E3 从 `specView` 读 |
| **Scenario/Acceptance** | `then` 只认可观察输出；Acceptance 有 `strength` | 21 `acceptanceKeys` 用于契约完成判据 | 22 片段单位 | 23 §4.4 覆盖检查 | 21 §2.2 v0.1 更正已注明归并；无需改字段 |
| **Plan** | `specVersion/planRevision/supersedesPlanId/boundary` | 21 用 `planView`（并入 `specView`/`frame`） | — | 23 §2.2/§7.2/§7.4 待 18 v0.3 并入 | **已对齐**（18 v0.3 吸收）；21 `planView` 改读 `specView.plan` |
| **Task** | `dependsOn[]/acceptanceKeys[]/boundary/taskKind/implementationNotes` | 21 L2 任务层含 `acceptanceKeys`/`writeScope` | — | 23 §6 DAG/并行/writeScope；§2.2 待并入 | **已对齐**（18 v0.3 吸收）；21 的 `writeScope` = 18 `boundary.writeScope`（建议 21 用新名，标"待改"） |
| **Task.boundary** | `{writeScope,readScopes,allowedTools,forbiddenActions}` | 21 专家角色"越 writeScope/白名单" | — | 23 §6.3 writeScope 冲突 | 21/23 的 writeScope 是子集；18 统一为 `boundary`（标"待改"） |
| **acceptanceKeys** | Requirement + Task 均带；`canArchive` 判定单位 | 21 L2 任务层 + 契约完成判据 | — | 23 §4.4/§12.3 待 18 对齐 | **已对齐**；E0 grader 见 [`17-评测设计-v0.md`](17-评测设计-v0.md) |
| **tier** | Spec.trivial/one-session/epic/project | — | — | 23 §4.1 BMAD 四档 / §5.4 classifyIntent | **已对齐**；trivial 以 E5 为准 |
| **canArchive** | 唯一归档入口；返回 blockers/warnings | 21 阶段规则引用 | 22 §1.4 写触发（Task done/Spec verified） | 23 §8.7 归档/reopen | 22 写触发需调 `canArchive`（标"待改"：22 若直接写状态需改） |
| **event_log / status 投影** | `event_log` 真相；`status` 投影 | — | 22 版本/失效语义 | 23 §9.1 进度真源/§10.4 Ledger 对账 | 23 的"进度真源"= `tasks.status` 投影；与 18 一致 |
| **Spec 可见性** | 记忆页默认排除 `kind=spec` | 21 秘书"NEVER LET USER SEE SPEC" | 22 §1.4 用户侧排除内部 kind | 23 §9.2 hill chart 投影 | 已一致 |

> **差异汇总**：① 21 把 `planView`/`acceptanceKeys` 说成"并入 specView/frame"——这是 E3 渲染层归并，18 仍保留字段；② 21 的 `writeScope` 应改名为 `boundary.writeScope`；③ 22 若在 Task/Spec 状态变更处直接写 DB，需改为经 `canArchive`/单写者（标"待改"）。**其余 21/22/23 引用与 18 v0.3 一致。**
