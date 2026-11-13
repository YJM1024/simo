# 相邻领域调研：SpecCore 可借鉴的框架与机制

> **对象**：SpecCore = 我们要自研的 agent 需求执行内核（Spec 内部化、会话=Spec、DB 存储、状态机 + 证据绑定、对话投影）。
> **范围**：只覆盖 **SDD 之外**的相邻领域（OpenSpec / Superpowers 已由他人调研，本文不重复）。
> **方法**：7 个方向 × 每方向 2–3 个代表。能抓到一手原文的都读了原文；抓不到的只在背景层使用并明确标注。
> **证据级别（全文统一）**：

| 级别 | 含义 | 读者该给的权重 |
|---|---|---|
| **A** | 一手原文/官方规范，本次会话已读（RFC、标准、官方文档、原书页面、原始论文摘要或正文） | 可直接引用 |
| **B** | 官方概述页/权威二手，已读，但非规范原文 | 方向可信，细节需核 |
| **C** | 领域背景知识，本次**未**抓取到原文，只给入口 URL | 仅供定位，不作引用 |
| **D** | 我的分析/推断（含"移植到 SpecCore 会怎样"） | 讨论靶子 |

---

## 0. 一页结论

1. **最能直接落到 data model 的三件东西**：**EARS 五句型**（把需求变成可解析、可判定原子句）、**RFC 2119 规范力分级**（MUST/SHOULD 直接决定门禁强度）、**Gherkin 的"只验证可观察输出"戒律**（验收证据的判据）。这三者合起来，就是 SpecCore 里 `Requirement` 的字段集与校验规则〔A/D〕。
2. **最能直接落到状态机的两个来源**：**statechart（XState 的语义）** 提供层级态、并行态、守卫；**Temporal 的 durable execution** 提供"**事件历史才是真相、恢复靠 replay、副作用必须落库后不重算**"这条铁律。后者的价值不在于引入 Temporal，而在于**它替你验证过"LLM 调用必须当作 activity 记账"**〔A/D〕。
3. **最能直接落到拆分与止损的一个框架**：**Shape Up**。它把"时间盒"变成第一等的设计输入（appetite：**固定时间、弹性范围**），并给了一个非常适配 agent 的止损机制（circuit breaker：超时不延期，默认砍范围）、一个适配对话的进度模型（hill chart：上坡=未解决未知、下坡=只剩执行）。这三条几乎是为"会话=Spec"量身定做的〔A〕。
4. **决策记录要抄的不是文档格式，而是"编号单调、状态机化、superseded 保留"**：ADR 的 status 语义（proposed/accepted/deprecated/superseded）与我们记忆模型里的 `invalid`/`superseded` 完全同构；Y-statement 的"一句话决策"是最适合 LLM 生成与检索的粒度〔A/D〕。
5. **形式化方法（TLA+/Alloy/Dafny）只借"设计期思维"，不借"运行时工具链"**：借"状态+不变量+边界穷举"来**检查我们自己的状态机设计**（比如"已归档还能不能执行"），不借证明工具。理由很实际：LLM 无法可靠产出可证明的形式化规格，投入产出比在 v0 不成立〔A/D〕。
6. **契约测试（Pact）给的是"验收门"的范式，不是工具**：不是"测试跑了"，而是"双方对同一份可执行契约达成一致，且有一个 `can-i-deploy` 式查询回答能不能上线"。SpecCore 的"能否归档/验收"就该长这样〔A/D〕。
7. **验证方法里最反直觉、最值得抄的是变异测试**：它衡量的不是"测了多少"，而是"**测试能不能抓住错误**"。对应到我们就是"**证据充分性**"：如果实现是错的，我们的证据门会不会放行？可以离线抽样做"反向验收"〔A/D〕。
8. **Agent 框架里只有两类机制值得拿**：LangGraph 的 **graph + checkpointer + interrupt**（状态机+持久化+人机接续的工程形态）与 SWE-agent 的 **ACI 思想**（"给 agent 的接口本身决定它的表现"）。MetaGPT 的 SOP 只借"阶段产物即交接物"，不借"多角色表演"；OpenHands 只借"事件流 + sandbox"〔A/D〕。
9. **普遍不适用的是"组织级/部署级"机制**：Shape Up 的 betting table 与六周周期、Kanban 的度量、Pact broker、Argo/Temporal 服务端、RTM 文档矩阵、CQRS 全量落地——这些在单机 agent 内核里都是纯负担〔D〕。
10. **一句话**：SpecCore 的骨架可以从**需求工程三件套（EARS/RFC2119/Gherkin）+ Shape Up 的时间盒 + Temporal 的记账纪律 + ADR 的状态语义**拼出来；其余方向只提供局部校验或思维工具〔D〕。

---

## 1. 需求工程与验收

### 1.1 EARS（Easy Approach to Requirements Syntax）

- **是什么**：五个句型模板，把自然语言需求约束成"系统 + 触发/条件 + 单一可测响应"〔A〕。
- **核心思想**：模糊性的代价落在实现者身上；而 agent 无法在凌晨三点追问，所以**必须让需求在语法层面就不含歧义**。
- **五个模式（原文表）**〔A，AWS ADR-020 逐字列出，并引自 <https://alistairmavin.com/ears/>〕：

| 模式 | 模板 |
|---|---|
| Ubiquitous（通用） | The `<system>` shall `<response>`. |
| Event-driven（事件驱动） | When `<trigger>`, the `<system>` shall `<response>`. |
| State-driven（状态驱动） | While `<state>`, the `<system>` shall `<response>`. |
| Optional-feature（可选特性） | Where `<feature>`, the `<system>` shall `<response>`. |
| Unwanted-behavior（非期望行为） | If `<trigger>`, then the `<system>` shall `<response>`. |

- **可借到 SpecCore 的机制**：
  - **M1 Spec 模型**：`Requirement{pattern ∈ {ubiquitous,event,state,optional,unwanted}, trigger?, state?, response, actor}`，把句型变成**字段而不是散文**；解析器/LLM 都必须回填这五个槽位。
  - **M8 校验**：一条 requirement 必须**命中且仅命中一个模式**、只描述**一个行为**、`response` 必须有可观察结果；不合格直接拒绝入库（而不是"格式不规范"）。
  - **M3 证据门**：`When/If` → 触发条件，`Then/shall` → 断言目标，**EARS 句子天然可翻译成一条证据检查项**。
- **不适用/过重**：ADR-020 自己承认——**EARS 擅长原子需求，遇到复杂条件逻辑会很别扭**，正确做法是拆成多条而不是嵌套从句〔A〕。另外中文语境下 "shall" 需要本地化标记（如"必须/应"），否则会退化成散文〔D〕。
- **来源**：EARS 官方 <https://alistairmavin.com/ears/>（C，未抓取）；Mavin et al., *Easy Approach to Requirements Syntax*, IEEE RE 2009（C，付费未读）；**已读原文**：AWS 样例仓库 ADR-020（含五模式表、采纳理由、代价）<https://aws-samples.github.io/sample-autonomous-cloud-coding-agents/decisions/adr-020-ears-requirements-syntax/>〔A〕。

### 1.2 Gherkin / BDD（Given-When-Then）

- **是什么**：可执行规格语言。`Feature > Rule > Scenario(Example) > Given/When/Then`，配 `Background`、`Scenario Outline + Examples`、`@tags`〔A〕。
- **核心思想**：**规格即测试**；但更大的价值是它在文档里写死了一条戒律：*"You should only verify an outcome that is observable for the user (or external system), and changes to a database are usually not."*（不要用"数据库里改了"当验收）〔A，Cucumber 官方 Reference〕。
- **可借到 SpecCore 的机制**：
  - **M3 证据门**：`Then` 必须是**可观察输出**（报告/UI/消息/API 响应），禁止把"内部状态变化"当验收证据——这直接决定我们的 `evidence.kind` 枚举与合规校验。
  - **M4 拆分**：`Feature`(能力) → `Rule`(业务规则) → `Scenario`(用例) 的三级粒度，可直接映射"父 Spec → 子 Spec → 验收用例"。
  - **M1 模型**：`Scenario{steps[], examples[]}`；`Scenario Outline` 的表格化示例是**低成本批量生成验收用例**的模板。
  - **M8 校验**：官方建议 3–5 步（"too many steps will cause the example to lose its expressive power"）；`Background` 超过 4 行就该抽高级步骤——这些都能变成静态检查规则。
- **不适用/过重**：**不要抄 step definitions**。Gherkin 的一半价值在"步骤与实现解耦（同一句可绑定不同代码）"，那是人类团队维护测试套件用的；我们由 LLM 直接执行，绑定层是纯负担〔D〕。另外它是英文关键词 + 70 多种语言本地化，"Given/When/Then" 在中文界面里应做映射而不是照搬〔D〕。
- **来源**：Cucumber Gherkin Reference（**已读全文**）<https://cucumber.io/docs/gherkin/reference/>〔A〕。

### 1.3 RFC 2119（MUST / SHOULD / MAY）

- **是什么**：IETF 对需求强度的标准定义：MUST/REQUIRED/SHALL = 绝对要求；SHOULD/RECOMMENDED = 允许有理由地忽略；MAY/OPTIONAL = 真可选〔A，RFC 2119 原文已读〕。
- **核心思想**：**需求不是二值的**。原文第 6 节还有一条被忽略的关键约束：*"Imperatives ... must be used with care and sparingly ... only where it is actually required for interoperation or to limit behavior which has potential for causing harm"*——**滥用 MUST 会让整个规范失去区分度**〔A〕。
- **可借到 SpecCore 的机制**：
  - **M1**：`normativeStrength: must | should | may` 作为 requirement 的一等字段（不是写在正文里的英文大写词）。
  - **M3 证据门**：**强度直接映射门禁**——`must` 缺证据 = 阻塞（hard block）；`should` 缺证据 = 警告 + 记录理由；`may` 不要求证据。这比"所有需求都要证据"现实得多。
  - **M8 校验**：统计 must 占比并给出"规范力通胀"警告（例如 >80% 需求都是 must 时提示拆分优先级）。
- **不适用/过重**：原规范是给**跨实现互操作**的协议写的，我们是内部系统，"MUST 只用于互操作或限害"的标准需要放宽；而且英文大写关键词作为解析锚点在中文里无效，必须用结构化字段〔D〕。
- **来源**：RFC 2119 原文（**已读全文**）<https://www.rfc-editor.org/rfc/rfc2119.txt>〔A〕。

### 1.4 用户故事 / 验收标准 / 可追溯性矩阵（RTM）

- **是什么**：用户故事 = "作为…我想要…以便…" + 验收标准（AC）；RTM = 需求 ↔ 设计 ↔ 代码 ↔ 测试 的双向映射表。
- **核心思想**：**双向可追溯**（NASA 系统工程手册的单列条目就叫 Bidirectional Traceability）：既要从需求找到实现与证据（正向），也要从一行代码/一次改动反查它服务哪条需求（反向）〔B，只读到条目标题〕。
- **可借到 SpecCore 的机制**：
  - **M3/M5**：把 RTM 做成**边（edges）而不是矩阵文档**：`Requirement ←(implemented_by)→ Task/Artifact`、`Requirement ←(verified_by)→ Evidence`、`Requirement ←(derived_from)→ Requirement`。反向查询"这行改动影响哪些 Spec"才是并发回写时算冲突的基础。
  - **M4**：用户故事的"角色 + 目的"两个槽位可以并进 EARS 的 `actor`，避免需求只剩技术描述。
- **不适用/过重**：RTM 在汽车/航空/医疗合规里是交付物；我们不需要生成矩阵表，只需要**可查询的引用边**〔D〕。
- **来源**：NASA SWEHB「Bidirectional Traceability」<https://swehb.nasa.gov/pages/viewpage.action?pageId=16458611>〔C〕；用户故事/AC 为行业常识〔C〕。

---

## 2. 决策记录（ADR / Design Docs）

### 2.1 ADR（Michael Nygard, 2011）

- **是什么**：一次架构决策一个短文件，固定五段：Title / Context / Decision / Status / Consequences〔A，原文已读〕。
- **核心思想**（原文里比格式更重要的三句）：
  1. *"Small, modular documents have at least a chance at being updated."*（大文档永远不会被更新）
  2. **编号单调递增且不复用**；被推翻的决策**保留**并标 `superseded`，指向替代它的记录；
  3. *"The consequences of one ADR are very likely to become the context for subsequent ADRs."*——**决策之间是链式的**。
- **可借到 SpecCore 的机制**：
  - **M5 版本/演化**：`Decision{id(单调), status: proposed|accepted|deprecated|superseded, supersedes?, supersededBy?, context, decision, consequences}`。**状态化 + 保留历史**，与记忆模型的 invalidate-not-delete 完全一致〔D〕。
  - **M1**：decision 只是 Spec 条目的一种 `kind`，与 requirement 同级但走不同的校验（决策不要求 scenario，要求 alternatives/consequences）。
  - **M7 对话投影**：用户问"为什么当初这么定"时，投影器直接命中 decision 条目，而不是重新推理（这也防幻觉）。
- **不适用/过重**：ADR 是**给人读的散文**；直接喂给 LLM 需要额外的字段化（status/supersedes/links），否则它读不出状态机〔D〕。
- **来源**：Nygard 原文（**已读全文**）<https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>〔A〕；adr.github.io 组织页（**已读**）<https://adr.github.io/>〔A〕。

### 2.2 MADR 与 Y-Statement

- **是什么**：MADR = 带"考虑过的选项 + 优缺点"的富模板；Y-statement = 一句话决策模板〔A，adr.github.io 模板页已读〕。
- **核心思想（Y-statement 原文）**：
  > *In the context of `<use case>`, facing `<concern>` we decided for `<option>` to achieve `<quality>`, accepting `<downside>`.*
  长版再加一句 `because <additional rationale>`，并显式写 `neglected <other options>`。
- **可借到 SpecCore 的机制**：
  - **M1**：决策条目强制四个槽位 `context / concern / chosen / accepted_downside`（+ 可选 `rejected[]`）。这是**唯一能同时约束"记录了什么"和"LLM 生成时不会写空话"的格式**。
  - **M7**：对用户解释时用 Y-statement 单句（"在有 X 的情况下，我们选了 Y 来获得 Z，代价是接受 W"），比贴整篇 ADR 有效。
  - **M8**：校验"决策必须写出 accepted_downside"——没有代价的决策通常是没想清楚。
- **不适用**：MADR 的"决策人/确认日期/合规元数据"对我们过重；Y-statement 的英文语法（In the context of / facing / accepting）不强制照抄，只要保留槽位〔D〕。
- **来源**：ADR Templates（**已读**）<https://adr.github.io/adr-templates/>〔A〕。

### 2.3 Google 的 Design Docs 实践

- **是什么**：写代码前的非正式设计文档，重点是"高层策略 + 关键决策 + 权衡"〔A，原文已读〕。
- **核心思想（可直接用的几条）**：
  - 结构：**Context and scope → Goals and non-goals → The actual design（含 alternatives considered）→ Cross-cutting concerns**。
  - **non-goals 的定义值得逐字抄**：*"non-goals aren't negated goals like 'The system shouldn't crash', but rather things that could reasonably be goals, but are explicitly chosen not to be goals."*
  - **何时不写**：*"If the solution ... is not [ambiguous], then there is little value in going through the process of writing a doc."* 以及"实现手册不算设计文档"。
  - 生命周期四段：创作迭代 → 评审 → 实现与更新 → 维护与学习。
- **可借到 SpecCore 的机制**：
  - **M4 拆分/边界**：**non-goals 是防范围蔓延的第一工具**。子 Spec 必须继承父 Spec 的 non-goals，且新增 non-goals 要显式记录（这正是"部分上下文共享"的语义）。
  - **M8 质量校验**：Spec 没有 non-goals、没有 alternatives → 提示"这可能只是实现手册"。
  - **M2 分级**：借"何时不写"的思想做 **Spec 轻量档**：低歧义任务生成 mini-spec（1 段 context + 1 条 AC），高歧义任务才生成完整 Spec。
- **不适用/过重**：10–20 页的文档体量、Google Docs 协作与评审会形态，对单机 agent 不适用〔D〕。
- **来源**：*Design Docs at Google*（**已读全文**）<https://www.industrialempathy.com/posts/design-docs-at-google/>〔A〕（注意：这是前 Google 工程师的个人文章，非官方规范，按 B/A 之间看待）。

---

## 3. 规格格式：接口契约与形式化

### 3.1 OpenAPI

- **是什么**：HTTP 接口的机器可读契约（路径/参数/请求响应 schema/安全）〔C，未抓取原文，按公开常识〕。
- **核心思想**：**契约先行、可机器校验、可从契约生成代码与测试**；组件用 `$ref` 复用，版本化演进。
- **可借到 SpecCore 的机制**：
  - **M1**：当 Spec 涉及对外接口时，**不要写散文描述接口，挂一个 schema 引用**（`spec.interfaceRef = "api.x.yaml#/paths/..."`）；散文只写"为什么这个接口长这样"。
  - **M8**：接口相关 requirement 的校验可以直接复用 OpenAPI 校验器（存在性、必填、类型），比让 LLM 自检可靠。
  - **M3**：契约本身可成为证据的一部分（"实现符合 OpenAPI 校验"）。
- **不适用/过重**：OpenAPI 只描述**接口形状**，不描述**验收标准、为什么、边界**；它不是 Spec 的替代品，只是 Spec 的一类附件〔D〕。
- **来源**：OpenAPI Specification <https://spec.openapis.org/oas/latest.html>〔C〕。

### 3.2 JSON Schema

- **是什么**：JSON 数据结构的声明式约束（type/properties/required/enum/oneOf/allOf/$ref…）〔C〕。
- **核心思想**：**同一份 schema 既约束数据、又校验数据、还能约束生成**（structured output / function calling 的 schema 就是它）。
- **可借到 SpecCore 的机制**：
  - **M1（最关键的一条）**：**SpecCore 的 Spec 结构应该由 JSON Schema 定义**，而不是靠 markdown 标题 + 正则去解析。理由：OpenSpec 那份调研已经证明，用标题层级做校验会出现"scenario 少一个 `#` 就静默失败"这类脆弱问题〔D，跨报告推断〕。
  - **M8**：**同一 schema 同时用于"LLM 输出约束"和"入库校验"**——这是把非确定性输出变成可信数据的唯一低成本办法。
  - **M3**：证据对象 `Evidence{kind, ref, producedBy, verifiedAt, hash}` 也 schema 化，便于门禁做类型化判定。
- **不适用**：JSON Schema 表达不了"跨条目的语义一致性"（如两条需求矛盾），那部分仍需 LLM/规则裁决〔D〕。
- **来源**：JSON Schema 官方 <https://json-schema.org/>〔C〕。

### 3.3 Protobuf（只借兼容性纪律）

- **是什么**：IDL + 二进制序列化；字段有编号，有明确的演进规则（不删号、不复用号、加 `reserved`、只加字段不改语义）〔C〕。
- **核心思想**：**线上的数据格式必须能向后/向前兼容**，所以"废弃"要显式声明而不是删除。
- **可借到 SpecCore 的机制**：
  - **M5**：Spec 版本的演进纪律——`requirement.id` 永不重用；删除需求时保留 id 并标 `removed`（带 reason）；新增字段而非改语义；这就是 OpenSpec delta 里 REMOVED/Reason 的同一思想在数据结构上的版本〔D〕。
  - **M6**：SQLite 里的 Spec 快照存储也可以按"只加列 + 迁移脚本"演进，避免破坏旧会话恢复。
- **不适用/过重**：为了兼容性引入 protoc/代码生成链，对单机 Go 单体内核完全没必要；我们只要**纪律**，不要工具〔D〕。
- **来源**：Protocol Buffers 文档 <https://protobuf.dev/programming-guides/proto3/>〔C〕。

### 3.4 TLA+（只借设计期思维）

- **是什么**：Lamport 的形式化规格语言，用状态机 + 时序逻辑描述系统，再用模型检查器（TLC）穷举检查不变量〔C〕。
- **核心思想**：**先写"什么必须永远为真"（invariant），再让机器去找反例**；规格是给设计用的，不是给运行用的。
- **可借到 SpecCore 的机制**：
  - **M2（设计期）**：把状态机写成三元组 `(States, Transitions, Invariants)`，人工/LLM 辅助检查例如：
    - `archived ⇒ ¬can_execute`（归档后不可再执行）
    - `verified ⇒ has_evidence`（验收通过必须有证据）
    - `∀s: executing ⇒ parent.verified ∨ parent.active`（子不能先于父被归档）
  - **M8**：把 invariants 变成**运行时断言 + 单测**（这一步是真正的收益：形式化只写不变量，不必真的跑 TLC）。
- **不适用/过重**：TLA+ 学习曲线陡、工具链是 JVM、**LLM 无法可靠产出可检查的 TLA+ 规格**；v0 引入等于给自己加一道无法自动化的门〔D〕。
- **来源**：Lamport TLA+ 主页 <https://lamport.azurewebsites.net/tla/tla.html>〔C〕；《Specifying Systems》〔C〕。

### 3.5 Alloy / Dafny（只借"契约即前置后置"）

- **是什么**：Alloy = 轻量关系逻辑 + **有界**模型查找（找小反例）；Dafny = 带前置/后置条件、循环不变量的可自动验证语言〔C〕。
- **核心思想**：Dafny 的 `requires/ensures` 就是把每条需求写成"前置条件 → 后置条件"；Alloy 的"小范围假设"（small scope hypothesis）认为**大多数 bug 在很小的输入范围内就能暴露**。
- **可借到 SpecCore 的机制**：
  - **M1**：每条 requirement 在数据结构上就是 `(precondition, postcondition)` 对——这比 EARS 更机器友好，二者可以并存（EARS 是写法，pre/post 是字段）。
  - **M3**：验收用例生成借鉴 small-scope：**优先构造最小边界用例**（空/一/多/超限），而不是堆大用例。
- **不适用**：真做验证需要证明工具与人工投入；LLM 生成的实现也进不了形式化验证闭环〔D〕。
- **来源**：Alloy <https://alloytools.org/>〔C〕；Dafny <https://microsoft.github.io/dafny/>〔C〕。

---

## 4. 工作流、状态机与恢复

### 4.1 XState / statecharts

- **是什么**：状态机库，核心语义是 statechart：**层级状态（parent/child）、并行状态（regions）、守卫转换、actor 通信**〔A，Stately 官方概念页已读〕。
- **核心思想**（原文）：*"Using state machines makes it easier to find impossible states and spot undesirable transitions."* + "transitions are deterministic" + "each state machine has exactly one top-level initial state"。
- **可借到 SpecCore 的机制**：
  - **M2（核心）**：用 **statechart 而不是扁平 FSM** 建模：
    - **层级** = 子 Spec（父态 `executing` 内的子态 `waiting_child` / `merging`）；
    - **并行** = 同一 Spec 的多个独立维度（如 `implementation: {todo,doing,done}` ∥ `acceptance: {pending,checking,passed}`），避免状态爆炸成一个笛卡尔积枚举；
    - **守卫** = 转换条件（`can_archive` 需要 `all_requirements_evidenced`）。
  - **M8**：静态检查"不可达状态/不可能状态"——这正是我们状态机的质量门（XState 的卖点就是"帮你发现 impossible states"）。
  - **M7**：投影器按当前**活跃状态集合**（可能多个并行态）决定对用户说什么，而不是按一个 `status` 字符串。
- **不适用/过重**：XState 是 JS 前端库、v6 还在 alpha；我们只借语义（可在 Go 里用表驱动实现）〔D〕。
- **来源**：Stately 官方「What are state machines and statecharts?」（**已读全文**）<https://stately.ai/docs/state-machines-and-statecharts>〔A〕。

### 4.2 Temporal（durable execution）

- **是什么**：把普通代码变成可持久执行的工作流；核心是 **Event History** 作为唯一真相，worker 崩溃后 **重放历史** 重建状态〔A，Temporal 官方页已读〕。
- **核心思想（原文，逐条都值得抄）**：
  1. *"This history is the source of truth for everything that happens in the Workflow."*
  2. *"Temporal doesn't restore memory from a snapshot. It starts the Workflow code from the beginning, replays the Event History step by step..."*
  3. *"It has to make the same decisions when given the same history. It shouldn't depend on any values not recorded in the history"*——所以直接调 `Date.now()`、随机数、网络调用都会破坏重放。
  4. **副作用必须放进 Activity**：*"When a Workflow calls an Activity, the Activity runs once, its result is recorded in the Event History. During replay, that result is reused, not recomputed."*
  5. 提供 **replay-safe 的时间/定时器/随机数** API。
- **可借到 SpecCore 的机制**：
  - **M6（核心）**：**ledger = event history**。Spec 的所有状态变化都是事件；恢复 = 重放事件；**状态字段是投影产物，不是真相**。
  - **M3/M6**：**把每次 LLM 调用当作 Activity**：先落库（输入、输出、模型、token、时间），再推进状态机；重放时**复用记录结果，绝不重新调用模型**。这是把"非确定性 LLM"接进确定性状态机的关键接缝。
  - **M2**：状态转换函数必须是**纯函数**（输入 events → 新状态）；禁止在转换函数里读时钟/随机/网络。
  - **M4**：child workflow ≈ 子 Spec，父 workflow 等待子结果（对应"汇总"）。
- **不适用/过重**：Temporal 需要 server + SDK 生态；单机 SpecCore 用 **SQLite 事件表 + 重放函数** 即可获得 80% 收益，不必引入 Temporal〔D〕。
- **来源**：Temporal 官方「Temporal Workflow」（**已读全文**）<https://docs.temporal.io/workflows>〔A〕。

### 4.3 事件溯源 / CQRS

- **是什么**：写侧只追加事件、读侧投影出视图（CQRS = 命令/查询职责分离）〔C（ES 部分已在记忆调研中读过 Fowler 原文，此处按 A/B 引用）〕。
- **核心思想**：*"event log is a purely additive structure that requires minimal locking"*——**追加天然并发友好**；读模型可随时重建、可多份。
- **可借到 SpecCore 的机制**：
  - **M7（对话投影）**：**对话就是读模型**。同一份事件可以投影出：给用户的自然语言会话、给 agent 的结构化上下文、给审计的时间线——三者一致，不会"聊的和记的不一样"。
  - **M6**：投影可重算 ⇒ 改投影逻辑不需要改历史数据（对我们迭代"秘书怎么说人话"极其重要）。
  - **M5**：版本 = 事件区间；回滚 = 事件 `reverted`，而不是删除。
- **不适用/过重**：完整 CQRS（多读模型、总线、最终一致）对单机过重；**只需要"一个事件流 + 一个投影"**〔D〕。
- **来源**：Martin Fowler, Event Sourcing <https://martinfowler.com/eaaDev/EventSourcing.html>〔A，前次调研已读〕。

### 4.4 DAG 调度（Argo Workflows / Airflow）

- **是什么**：把任务声明成有向无环图，引擎按依赖调度、并行、重试、补跑〔C〕。
- **核心思想**：**依赖是显式的边**；同层可并行；失败可局部重试/重跑而不必整体重来。
- **可借到 SpecCore 的机制**：
  - **M4**：**拆分产物应该是 DAG 而不是纯树**——一个子 Spec 可以同时依赖两个父产出（对应设计文档里"树 + 显式依赖边"的建议）。
  - **M9**：调度器按拓扑序 + 就绪判定（所有前置 `verified` 才启动），并支持"部分失败只重跑该子图"。
  - **M3**：每个节点带 `outputs/evidence`，下游只能读已验证的输出。
- **不适用/过重**：Airflow/Argo 是集群编排，元数据与 UI 都很重；我们只需要**拓扑排序 + 状态机**两件事〔D〕。
- **来源**：Argo Workflows <https://argoproj.github.io/workflows/>；Airflow <https://airflow.apache.org/>〔C〕。

---

## 5. 项目管理方法论（对应拆分、粒度、边界）

### 5.1 Shape Up（最值得抄的一节）

- **是什么**：Basecamp 的产品方法论（原书免费在线）〔A，官网目录 + Glossary 已读〕。
- **核心思想（用它的原词）**：

| 概念 | 原文要点 | 对我们的意义 |
|---|---|---|
| **Appetite** | "The amount of time we want to spend on a project, **as opposed to an estimate**" | 时间是**输入**不是输出：先定预算，再定范围 |
| **Fixed time, variable scope** | 固定时间、弹性范围 | 超预算时**砍范围**，不延期 |
| **Shaping**（三性质） | rough（粗）/ solved（已解）/ bounded（有界） | Spec 的成熟度判据：够粗、已解、有边界才可以开工 |
| **Pitch 五要素** | Problem / Appetite / Solution / **Rabbit Holes** / **No Gos** | 直接当 Spec 的必填段 |
| **No backlogs** | 不维护待办池，靠 betting table 下注 | 我们不建"待办池"，只有活跃 Spec |
| **Circuit breaker** | "Cancel projects that don't ship in one cycle by default **instead of extending them by default**" | 超时的默认动作是**止损/降级**，不是加时 |
| **Hill chart / 上坡下坡** | uphill = 还有未解未知；downhill = 只剩执行 | 最适合**对话投影**的进度语言 |
| **Scopes** | "parts of a project that can be built, integrated, and finished independently" | 这就是**子 Spec 的定义** |
| **Done means deployed** | 完成=上线，不是合并 | 我们的"归档"也应是"已生效"，不是"写完了" |
| **Assign projects, not tasks** | 给整块，不给碎任务 | 派给子 agent 的应是子 Spec，不是零散步骤 |
| **Imagined vs discovered tasks** | 计划时想到的 vs 开工后发现的 | 任务清单要允许"发现型任务"追加，不算计划失败 |
| **Scope hammering** | 反复锤问"这个能不能砍" | 验收前最后一轮砍范围 |

- **可借到 SpecCore 的机制**：
  - **M4**：`Spec{appetite{timeBudget, maxScope}, rabbitHoles[], noGos[]}`——**appetite 是本设计里最强的止损与拆分工具**；`Scopes` 的定义给了"何时拆子 Spec"的权威判据。
  - **M3**：circuit breaker 映射到证据门——超预算/多次验收不过时，**默认降级（缩小 must 集合）并归档为 partial，而不是无限重试**。
  - **M7**：hill chart 是给用户看进度的**唯一不撒谎的模型**：百分比是假精度，"上坡/下坡/完成"是真的；秘书说"这个还在上坡（有未解未知）"比"完成 60%"有用。
  - **M1**：Pitch 五要素 ≈ Spec 的 proposal 段骨架（尤其 rabbit holes 与 no-gos，其他框架都没有）。
- **不适用/过重**：六周 cycle、两周 cool-down、betting table 的人际机制、团队规模假设——全部不适用；我们只需要它的**概念**，不需要它的**日历**〔D〕。
- **来源**：Shape Up 全书在线（**目录 + Glossary 已读**，正文未逐章读）<https://basecamp.com/shapeup>〔A→B〕。

### 5.2 Kanban / WIP 限制

- **是什么**：以看板列表示状态、限制每列在制品数量的流动管理法〔C〕。
- **核心思想**：**WIP 限制暴露瓶颈**；"开始更多"不等于"完成更多"；列即状态，卡片流动即进度。
- **可借到 SpecCore 的机制**：
  - **M9**：**并发 Spec 数上限**（例如同时最多 3 个 `executing`）——防止 agent 多开导致上下文与证据失控；超限时新 Spec 排队（用户可感知的排队被禁止，但内部可以背压）。
  - **M2**：看板列 = 状态机状态，天然对齐；"卡在某一列"就是滞留告警（对 agent 特别有用：长时间停在 `checking` 说明验收逻辑有问题）。
- **不适用/过重**：Lead time / CFD / 周期时间度量对单用户内核是伪需求〔D〕。
- **来源**：Kanban 为行业常识〔C〕；WIP 限制入口 <https://www.atlassian.com/agile/kanban/wip-limits>〔C〕。

### 5.3 DDD：Bounded Context 与 Ubiquitous Language

- **是什么**：DDD 的战略设计：把大模型切成多个 bounded context，每个内部一个统一模型；边界通常由**语言变化**决定〔A，Fowler bliki 已读〕。
- **核心思想（原文）**：*"As you try to model a larger domain, it gets progressively harder to build a single unified model... you need a different model when the language changes."* 并给出经典反例：*"meter" 在电力公司不同部门含义不同*；同类还有 "Customer"、"Product"。
- **可借到 SpecCore 的机制**：
  - **M4（拆分第一判据）**：**"同一个词在这里和那里含义不同"就是拆 Spec 的信号**。这比按功能模块拆更可靠，因为它直接决定 LLM 会不会混淆。
  - **M1**：每个 Spec 带 **本地术语表** `glossary[{term, definition, notToBeConfusedWith[]}]`；LLM 生成/校验时用它做一致性检查（"你说的'订单'是哪个订单？"）。
  - **M7**：对话里用**用户的语言**、Spec 里用**领域语言**，两者建立映射表——投影器负责翻译，避免用户看到内部黑话。
- **不适用**：context map 的七种关系模式（partnership/customer-supplier/anticorruption layer…）对我们是过度设计；只用"边界 + 术语表"两个概念〔D〕。
- **来源**：Martin Fowler, Bounded Context（**已读全文**）<https://martinfowler.com/bliki/BoundedContext.html>〔A〕。

### 5.4 C4 模型

- **是什么**：四层抽象（software system / container / component / code）+ 对应四张图，另加 landscape/dynamic/deployment〔A，官网已读〕。
- **核心思想**：**同一系统按读者需求分层描述**，每层只讲该层关心的东西；符号无关（notation independent）。
- **可借到 SpecCore 的机制**：
  - **M4**：Spec 有**抽象层级**字段（需求级/接口级/实现级），不同层级给不同读者（用户/子 agent/审计）；子 Spec 一般比父 Spec 低一层。
  - **M7**：对话投影**按读者选层**——用户面前只讲 system/container 级（"这块是计费服务"），不 dump component/code 级细节。
- **不适用**：画图工具与 UML 符号体系不适用；我们借的是"分层描述"这个原则〔D〕。
- **来源**：C4 model 官网（**已读首页**）<https://c4model.com/>〔A〕。

---

## 6. 验证方法（对应证据门）

### 6.1 契约测试（Pact）

- **是什么**：consumer-driven 契约测试；契约由 consumer 的测试**执行生成**（contract by example），provider 侧回放验证〔A，Pact 官方 Introduction 已读〕。
- **核心思想（原文三句）**：
  1. *"Contract tests assert that inter-application messages conform to a shared understanding that is documented in a contract."*
  2. *"only parts of the communication that are actually used by the consumer(s) get tested"*——**只测被实际用到的部分**。
  3. 与 schema 的区别：*"a Pact contract is enforced by executing a collection of test cases, each of which describes a single concrete request/response pair — Pact is, in effect, 'contract by example'."*
- **可借到 SpecCore 的机制**：
  - **M3（范式级）**：证据门不是"跑过测试"，而是"**双方（需求方/实现方）对同一份可执行契约达成一致，且示例级证据齐全**"。这正对应我们"证据必须绑定到具体 requirement 的 scenario"。
  - **M3 门禁查询**：Pact 生态里的 `can-i-deploy` 是"能不能发布"的一站式查询——SpecCore 应有一个 `canArchive(specId)`（所有 must 有证据、无未决冲突、父链已就绪），而不是前端自己拼状态。
  - **M8**：契约版本化 + 兼容检查（新契约是否破坏旧消费方）→ Spec 版本升级时检查"旧证据是否仍适用"。
- **不适用/过重**：Pact broker、provider/consumer 双端部署、CI 集成的具体形态不适用；我们是"需求↔实现"而不是两个服务〔D〕。
- **来源**：Pact 官方 Introduction（**已读全文**）<https://docs.pact.io/>〔A〕。

### 6.2 属性测试（property-based testing）

- **是什么**：不写具体用例，而是声明**性质/不变量** + 由框架生成大量输入；失败时自动**收缩（shrinking）**到最小反例〔C〕。
- **核心思想**：**"对所有输入都成立"比"这几个用例通过"强得多**；反例最小化让失败可诊断。
- **可借到 SpecCore 的机制**：
  - **M3**：对可判定的需求，证据形态从"点证据（一个用例）"升级为"**性质证据**（不变量 + 生成范围 + 反例最小化）"；失败时把**最小反例**作为证据交给用户/agent，而不是"测试挂了"。
  - **M8**：验收门可以要求"边界扫描"（空/一/多/超限/并发），作为性质测试的轻量替身。
- **不适用**：很多需求（"语气友好""界面清晰"）写不出可执行性质；只对可判定子集适用〔D〕。
- **来源**：Hypothesis <https://hypothesis.readthedocs.io/>；QuickCheck 论文〔C〕。

### 6.3 变异测试（mutation testing）

- **是什么**：向代码注入小变异（改比较符、删条件），跑测试；测试失败=变异被"杀死"，说明测试有效〔A，Stryker 官方介绍已读〕。
- **核心思想（原文）**：*"If they don't fail, it might indicate your tests do not sufficiently cover the code."* 并直接嘲讽覆盖率：*"code coverage doesn't tell you everything about the effectiveness of your tests"*——覆盖率只说"涂了多少面包"，变异测试才说"涂的是不是巧克力酱"。
- **可借到 SpecCore 的机制**：
  - **M3（离线质量度量）**：**反向验收**——故意改坏实现（或改坏需求里的一个 must），看证据门会不会拒绝。如果拒绝率低，说明"证据"只是形式。
  - **M8**：对"证据充分性"做抽样审计（不是每次运行，而是周期性/离线），成本可控。
- **不适用**：全量接入 CI 成本高、LLM 生成的实现变异空间巨大；v0 只做**抽样式反向验收**〔D〕。
- **来源**：Stryker Mutator 官方「What is mutation testing?」（**已读全文**）<https://stryker-mutator.io/docs/>〔A〕。

---

## 7. Agent 框架（只取 Spec 执行相关）

### 7.1 LangGraph

- **是什么**：以图（StateGraph：节点/边/条件边）组织 agent 循环，配 typed state + reducers、checkpointer（持久化/时间旅行/中断恢复）、subgraph、streaming〔C，文档抓取失败，按公开资料〕。
- **核心思想**：**把 agent 循环显式化为图 + 状态**，把"恢复/人机接续"交给 checkpoint，而不是靠重放对话历史。
- **可借到 SpecCore 的机制**：
  - **M2/M6**：图 + checkpointer 与我们"状态机 + ledger"是同一问题的两种实现；**checkpoint 粒度**（每个节点后落盘）值得照抄。
  - **M7**：`interrupt`（在执行中暂停等人输入）正是"对话投影 + 人机接续"的机制化形态；`stream` 对应增量投影。
  - **M4**：subgraph = 子 Spec，父图通过共享 state 片段传递"部分上下文"。
- **不适用/过重**：不引入 LangChain 生态（我们是 Go 单机）；只借"图 + checkpoint + interrupt"三个概念〔D〕。
- **来源**：LangGraph 文档 <https://docs.langchain.com/oss/python/langgraph/graph-api>〔C，本次抓取仅得导航〕。

### 7.2 MetaGPT

- **是什么**：把人类 SOP 编码进 prompt 序列，用角色分工（产品经理/架构师/工程师…）与**装配线**完成软件任务〔A，论文摘要已读〕。
- **核心思想（摘要原文）**：*"encodes Standardized Operating Procedures (SOPs) into prompt sequences ... allowing agents with human-like domain expertise to verify intermediate results"*；*"assembly line paradigm to assign diverse roles"*。
- **可借到 SpecCore 的机制**：
  - **M1**：**阶段产物即交接物**——每个 SOP 阶段有固定交付物与 schema（需求→设计→接口→任务），给"Spec 阶段化"提供直接参照。
  - **M4**：SOP 的固定工序 = 可复用的拆分模板（不同类型任务用不同工序）。
  - **M9**：不同阶段可由不同执行器（模型）承担（对应"秘书快、专家强"）。
- **不适用/过重**：多角色"表演式协作"、角色间对话往返的 token 成本；它的价值在"流水线产物"，不在于"角色人格"〔D〕。
- **来源**：MetaGPT 论文（**摘要已读**）<https://arxiv.org/abs/2308.00352>〔A(摘要)〕。

### 7.3 SWE-agent（ACI：Agent-Computer Interface）

- **是什么**：为 LLM agent 专门设计"计算机接口"（编辑、检索、执行命令的形态与反馈），在 SWE-bench 上显著超越非交互式方案〔A，论文摘要已读〕。
- **核心思想（摘要原文）**：*"we posit that LM agents represent a new category of end users with their own needs and abilities, and would benefit from specially-built interfaces"*——**接口设计本身决定表现**。
- **可借到 SpecCore 的机制**：
  - **M7（核心）**：**对话投影是"给 agent 的 ACI"**：给用户的自然语言要短、给执行 agent 的上下文要结构化（明确下一步、明确可写范围、明确报错含义）；这比换模型更能提升成功率。
  - **M3**：把"执行测试并读结果"作为一等工具，输出要**精简且可判定**（通过/失败/最小差异），而不是贴全量日志。
  - **M8**：错误信息要"可行动"（OpenSpec 的可修复校验是同一思想）。
- **不适用**：具体 terminal 交互/文件编辑工具集不适用；我们借的是设计原则〔D〕。
- **来源**：SWE-agent 论文（**摘要已读**）<https://arxiv.org/abs/2405.15793>〔A(摘要)〕。

### 7.4 OpenHands

- **是什么**：通用 agent 平台：沙箱执行、事件流、多 agent 协调、benchmark 集成〔A，论文摘要已读〕。
- **核心思想（摘要原文）**：*"safe interaction with sandboxed environments for code execution, coordination between multiple agents, and incorporation of evaluation benchmarks"*。
- **可借到 SpecCore 的机制**：
  - **M6**：**事件流即 ledger**（它把 agent 的所有动作作为事件记录，可回放/审计）。
  - **M9**：沙箱隔离（危险操作的边界）。
  - **M3**：benchmark 集成的思路 → 我们的"验收用例集"应该是可复用、可回归的资产。
- **不适用/过重**：平台体量、多 agent 编排、Web UI 均不需要〔D〕。
- **来源**：OpenHands 论文（**摘要已读**）<https://arxiv.org/abs/2407.16741>〔A(摘要)〕。

### 7.5 AutoGen / CrewAI（只作对照）

- **是什么**：会话式多 agent 编排框架（角色/任务/对话模式）〔C〕。
- **可借机制**：仅"角色 + 任务"声明式配置的形态（M9 执行器配置）。
- **不适用**：它们的核心是**把协作暴露成对话**；SpecCore 恰恰要**把 Spec 内部化**（用户只见会话，不见编排）。方向相反，不宜借鉴其协作模型〔D〕。
- **来源**：AutoGen <https://microsoft.github.io/autogen/>；CrewAI <https://docs.crewai.com/>〔C〕。

---

## 8. ① SpecCore 借鉴地图（模块 × 来源 × 机制）

> 模块缩写：**M1 Spec 模型 / M2 状态机 / M3 证据门 / M4 拆分与边界 / M5 版本与决策 / M6 持久化与恢复 / M7 对话投影 / M8 校验 / M9 调度与并发**

| 模块 | 来源 | 具体机制 | 优先级 | 证据 |
|---|---|---|---|---|
| **M1** | EARS | 五句型 → `Requirement.pattern + trigger/state/response` 字段 | P0 | A |
| **M1** | RFC 2119 | `normativeStrength ∈ {must,should,may}` 一等字段 | P0 | A |
| **M1** | Gherkin | `Scenario{steps, examples}`；Then 只允许可观察输出 | P0 | A |
| **M1** | JSON Schema | **Spec 结构由 schema 定义**，LLM 输出与入库共用同一 schema | P0 | A/D |
| **M1** | Shape Up | `appetite{timeBudget,maxScope}` + `rabbitHoles[]` + `noGos[]` | P0 | A |
| **M1** | ADR / Y-statement | `Decision{status,supersedes,context,chosen,acceptedDownside}` | P1 | A |
| **M1** | DDD | 每个 Spec 带 `glossary[{term,def,notToBeConfusedWith}]` | P1 | A |
| **M2** | XState/statechart | 层级态 = 子 Spec；并行态 = 多维状态；守卫转换 | P0 | A |
| **M2** | Temporal | 转换函数纯函数（不读时钟/随机/网络）；状态=事件投影 | P0 | A |
| **M2** | TLA+（设计期） | 不变量清单（`verified⇒has_evidence`、`archived⇒¬executable`）转运行时断言 | P1 | A/D |
| **M2** | Kanban | 列=状态；滞留时长告警 | P2 | C |
| **M3** | Pact | 契约即证据；`canArchive()` 门禁查询；只测被用到的部分 | P0 | A |
| **M3** | Gherkin | 证据必须绑定到具体 scenario 的 Then | P0 | A |
| **M3** | RFC 2119 | must 缺证据=阻塞；should 缺证据=警告+理由 | P0 | A |
| **M3** | 属性测试 | 对可判定需求用"不变量 + 边界生成 + 最小反例" | P1 | C/D |
| **M3** | 变异测试 | 离线"反向验收"：故意改坏实现，看门禁是否拒绝 | P2 | A/D |
| **M3** | Shape Up | circuit breaker：超预算/多次不过 → 默认降级而非重试 | P1 | A |
| **M4** | Shape Up | `Scopes` 定义 = "可独立 build/integrate/finish" ⇒ 子 Spec 判据 | P0 | A |
| **M4** | DDD | 拆分歧义判据：**同一词含义变化**就拆 | P0 | A |
| **M4** | Google Design Docs | non-goals 作为边界工具 + 防范围蔓延 | P0 | A |
| **M4** | Argo/Airflow | 子 Spec 依依赖成 **DAG**（不是纯树） | P1 | C/D |
| **M4** | C4 | Spec 的抽象层级字段（需求/接口/实现） | P1 | A |
| **M4** | EARS | 复杂需求拆成多条原子句，而不是嵌套 | P1 | A |
| **M5** | ADR | 编号单调不复用；superseded 保留并互链 | P0 | A |
| **M5** | Protobuf | id 永不重用、删除保留 id+reason、只加不改 | P0 | C/D |
| **M5** | 事件溯源 | 版本 = 事件区间；回滚 = revert 事件 | P0 | A |
| **M6** | Temporal | ledger=event history；恢复=replay；**LLM 调用=Activity 先落库** | P0 | A |
| **M6** | OpenHands/LangGraph | 每节点 checkpoint；事件流可审计 | P1 | A(摘要)/C |
| **M7** | 事件溯源 | 对话是**读模型**：可重算、可多投影 | P0 | A |
| **M7** | Shape Up | hill chart 语言（上坡/下坡/完成）替代百分比 | P0 | A |
| **M7** | SWE-agent | ACI 原则：给 agent 的上下文要结构化、可行动 | P1 | A(摘要) |
| **M7** | DDD | 用户语言 ↔ 领域语言映射（投影器做翻译） | P1 | A |
| **M7** | C4 | 按读者选抽象层（用户只看 system/container） | P2 | A |
| **M8** | JSON Schema | 同一 schema 同时约束 LLM 输出与入库 | P0 | A |
| **M8** | EARS/RFC2119 | "一条需求一个行为 + 规范力合法"静态检查 | P0 | A |
| **M8** | XState | 不可达状态 / 不可能状态检查 | P1 | A |
| **M8** | Dafny/Alloy | `(precondition, postcondition)` 字段化；边界优先（small scope） | P2 | C |
| **M9** | Kanban | 并发 Spec 数上限（WIP），超限内部排队 | P1 | C |
| **M9** | MetaGPT | SOP 阶段化：不同阶段不同执行器 | P1 | A(摘要) |
| **M9** | Shape Up | "assign projects, not tasks"：派子 Spec 而非碎步骤 | P1 | A |
| **M9** | OpenHands | 沙箱隔离危险操作 | P2 | A(摘要) |

**读法建议**：P0 的 12 条基本就是 SpecCore v0 的骨架；P1 是 v0.1；P2 是"有余力再说"。

---

## 9. ② 不该借清单（过重 / 不适合单机 / 不适合 LLM）

| 不该借 | 出处 | 为什么 | 替代 |
|---|---|---|---|
| **TLA+ / Alloy / Dafny 全量形式化** | §3.4/3.5 | 需要工具链与证明能力；LLM 无法可靠产出可检查规格；运行时用不上 | 只写"不变量清单"当运行时断言 + 单测 |
| **Temporal server / Cadence 部署** | §4.2 | 需要集群与 SDK；单机不需要 | SQLite 事件表 + 重放函数 |
| **Argo / Airflow 编排** | §4.4 | 集群级元数据与 UI 负担 | 拓扑排序 + 状态机 |
| **全量 CQRS（多读模型 + 总线）** | §4.3 | 最终一致复杂度对单用户无收益 | 一个事件流 + 一个对话投影 |
| **Pact broker / provider-consumer 双端部署** | §6.1 | 我们是单体内核，没有两个服务 | 只借"契约即证据 + can-i-deploy 查询" |
| **Gherkin 的 step definitions 全套** | §1.2 | 人类维护测试套件的解耦层，LLM 执行时是纯负担 | 只保留 Feature/Scenario 结构 |
| **OpenAPI 代码生成链** | §3.1 | 生成器与版本管理成本 >> 收益 | 只把 schema 当接口附件 |
| **Protobuf 工具链** | §3.3 | 需要 IDL 编译 | 只借"字段编号纪律" |
| **ADR 长散文** | §2.1 | LLM 读不出状态机，人也读得慢 | 状态字段 + Y-statement 单句 + 短正文 |
| **Google Design Docs 的 10–20 页体量** | §2.3 | 对单会话过重；协作评审形态不适用 | 保留 four-section 骨架，压到 1 页 |
| **Shape Up 的组织机制**（betting table / 六周 cycle / cool-down / 团队下注） | §5.1 | 全是人际协调机制 | 只借 appetite / circuit breaker / hill chart / scopes |
| **Kanban 的度量体系**（lead time / CFD） | §5.2 | 单用户内核无统计意义 | 只借 WIP 上限与滞留告警 |
| **C4 的图与符号体系** | §5.4 | 我们不需要画图 | 只借"分层描述" |
| **DDD 的 context map 七种关系模式** | §5.3 | 过度设计 | 只借"边界 + 术语表" |
| **全量变异测试进 CI** | §6.3 | 成本高、LLM 实现变异空间大 | 抽样/离线反向验收 |
| **RTM 矩阵文档** | §1.4 | 合规交付物，不是运行时结构 | 做可查询的引用边 |
| **MetaGPT 的多角色表演** | §7.2 | 对话往返的 token 成本，且与"Spec 内部化"目标冲突 | 只借 SOP 阶段产物 |
| **AutoGen/CrewAI 的会话编排模型** | §7.5 | 核心是把协作暴露成对话，方向相反 | 只借"角色+任务"配置形态 |
| **LangChain/LangGraph 运行时依赖** | §7.1 | Go 单机不宜引入 Python 生态 | 只借"图 + checkpoint + interrupt"概念 |

---

## 10. ③ 对 SpecCore v0 的 5 条建议

> 每条 = 结论 + 依据 + 落点。全部为 D（推断），但依据都是 A 级材料。

1. **Spec 用 JSON Schema 定义，不要用 markdown 定义。**
   理由：markdown 用正则校验会在格式细节上静默失败（OpenSpec 那份调研已给出证据），而 JSON Schema 可以**同一份约束 LLM 输出与入库**〔跨报告 + A〕。落点：M1 + M8，第一天就定 schema，后续所有生成/校验/投影都从它派生。

2. **Requirement 的字段集就照 EARS + RFC2119 建，但只强制五个槽位。**
   `pattern`（五选一）、`trigger`、`state`、`response`、`strength(must/should/may)`；Scenario 只允许可观察输出。复杂逻辑**拆条不嵌套**。
   理由：这是把"自然语言需求"变成"可判定单元"的最低成本方案，同时直接决定证据门强度〔A〕。落点：M1 + M3 + M8。

3. **状态机用 statechart 语义实现，转换函数必须是纯函数，状态只由事件推导；LLM 调用当 Activity 先落库。**
   理由：层级解决子 Spec，并行解决"实现/验收"多维状态，纯函数 + 事件历史解决恢复与非确定性（Temporal 已替我们验证过这条纪律：副作用不落库，重放就会分叉）〔A〕。落点：M2 + M6。**这是整个内核最不该妥协的一条。**

4. **证据门做成 `canArchive(specId)` 单一查询，强度分级 + 可观察性 + 契约化。**
   必须有：`must` 缺证据→阻塞；`should` 缺证据→警告并记录理由；`Then` 只认可观察输出；"契约+示例"而非"测试跑过了"。
   理由：Pact 的 `can-i-deploy` + Gherkin 的可观察戒律 + RFC2119 的分级，三者拼起来就是验收门的完整规格〔A〕。落点：M3。**前端/秘书不允许自己拼状态判断能不能归档。**

5. **拆分与止损用 Shape Up + DDD 两个判据，不要用层级好看决定。**
   - 拆：新工作**能被独立 build/integrate/finish**（Scopes 定义）、或**同一个词含义变了**（DDD 边界）→ 拆子 Spec；
   - 止损：每个 Spec 带 `appetite`，超预算/多次验收不过 → **circuit breaker 默认降级**（缩 must 集合，归档为 partial），不默认延期；
   - 父 Spec 用 **non-goals** 划界并向下继承。
   理由：这三个机制共同解决"森林"的失控问题（无限拆分、无限重试、范围蔓延），且都来自已被验证的实践〔A〕。落点：M4 + M3。

---

## 11. ④ 待核实项

1. **EARS 原始论文未读**（Mavin et al., IEEE RE 2009，付费）；五模式与采纳教训来自 AWS ADR-020 的逐字转述与 alistairmavin.com 的入口，**未核对原始表述**。
2. **Cucumber 之外还读过哪些 BDD 材料**：本文对 BDD 的描述仅基于 Gherkin Reference 官方页；"BDD 三原则（举例、会话、自动化）"等未引用。
3. **TLA+ / Alloy / Dafny 全部为背景级**：未读原书/论文，只给入口；文中对它们的机制描述是通用背景，若要在设计文档里正式引用需补读。
4. **OpenAPI / JSON Schema / Protobuf 未逐页读规范**，只按公开常识描述；具体关键字（如 `reserved`、兼容规则细则）需核对官方页面。
5. **LangGraph 文档抓取失败**（返回 302/仅导航），其"checkpointer/interrupt/subgraph"机制按公开资料描述，**未读官方原文**。
6. **Shape Up 只读了官网目录与 Glossary**，正文（尤其第 3、13、14 章）未逐章读；文中引用均为 Glossary 原文或目录标题，未过度外推。
7. **AutoGen / CrewAI / Hypothesis / Argo / Airflow 未抓取**，按背景知识使用，若要引用具体机制需补读。
8. **Kanban 的 WIP 限制**：未读原始文献（Anderson 的书），只作常识使用。
9. **MetaGPT / SWE-agent / OpenHands**：只读了 arXiv 摘要，**未读正文的方法细节**（例如 SWE-agent 的具体 ACI 设计、MetaGPT 的 SOP 具体阶段），引用时请以"摘要级"为准。
10. **"反向验收（变异测试思想）"落地成本未评估**：这是我自己提出的组合（D），没有现成实践可参照。

---

## 12. 来源清单

**A 级（本次已读原文/官方页）**
1. RFC 2119 <https://www.rfc-editor.org/rfc/rfc2119.txt>
2. Cucumber Gherkin Reference <https://cucumber.io/docs/gherkin/reference/>
3. AWS 样例 ADR-020（EARS 五模式表 + 采纳理由 + 代价）<https://aws-samples.github.io/sample-autonomous-cloud-coding-agents/decisions/adr-020-ears-requirements-syntax/>
4. Michael Nygard, *Documenting Architecture Decisions* <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions>
5. adr.github.io 首页 <https://adr.github.io/>；ADR Templates（MADR / Nygard / Y-Statement）<https://adr.github.io/adr-templates/>
6. *Design Docs at Google* <https://www.industrialempathy.com/posts/design-docs-at-google/>（作者为前 Google 工程师，非官方规范）
7. Stately/XState《What are state machines and statecharts?》<https://stately.ai/docs/state-machines-and-statecharts>
8. Temporal《Temporal Workflow》（Event History / replay / Activity）<https://docs.temporal.io/workflows>
9. Martin Fowler《Bounded Context》<https://martinfowler.com/bliki/BoundedContext.html>
10. C4 model 官网 <https://c4model.com/>
11. Shape Up 官网（目录 + Glossary）<https://basecamp.com/shapeup>
12. Pact 官方 Introduction（contract by example / consumer-driven）<https://docs.pact.io/>
13. Stryker Mutator《What is mutation testing?》<https://stryker-mutator.io/docs/>
14. MetaGPT 摘要 <https://arxiv.org/abs/2308.00352>
15. SWE-agent 摘要 <https://arxiv.org/abs/2405.15793>
16. OpenHands 摘要 <https://arxiv.org/abs/2407.16741>
17. Martin Fowler, Event Sourcing <https://martinfowler.com/eaaDev/EventSourcing.html>（前次调研已读，本报告引用其"追加结构最小锁"结论）

**C 级（入口，未核验原文）**
18. EARS 官方 <https://alistairmavin.com/ears/>；Mavin et al., IEEE RE 2009
19. NASA SWEHB Bidirectional Traceability <https://swehb.nasa.gov/pages/viewpage.action?pageId=16458611>
20. OpenAPI <https://spec.openapis.org/oas/latest.html>；JSON Schema <https://json-schema.org/>；Protobuf <https://protobuf.dev/programming-guides/proto3/>
21. TLA+ <https://lamport.azurewebsites.net/tla/tla.html>；Alloy <https://alloytools.org/>；Dafny <https://microsoft.github.io/dafny/>
22. Argo Workflows <https://argoproj.github.io/workflows/>；Airflow <https://airflow.apache.org/>
23. Kanban WIP 限制 <https://www.atlassian.com/agile/kanban/wip-limits>
24. Hypothesis <https://hypothesis.readthedocs.io/>
25. LangGraph <https://docs.langchain.com/oss/python/langgraph/graph-api>
26. AutoGen <https://microsoft.github.io/autogen/>；CrewAI <https://docs.crewai.com/>

---

## 附：一句话给设计讨论

> 相邻领域里真正能"搬进来就用"的只有四样：**EARS 的句子骨架、RFC 2119 的强度分级、Shape Up 的时间盒与止损、Temporal 的记账纪律**；其余（形式化、DAG 引擎、多 agent 框架、项目管理仪式）都只能提供思维工具或局部校验——**借思想不借系统**，是我们从这 7 个方向里能拿到的最稳收益。
