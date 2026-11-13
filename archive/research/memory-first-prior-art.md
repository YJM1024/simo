# 记忆优先（memory-first）Agent 架构：先行方案与可借鉴机制

> **用途**：为 [`11-设计方案v0.md`](../design/11-设计方案v0.md) 第 7 节（"记忆是主体，实例是视图"）和 [`10-设计对话记录.md`](../design/10-设计对话记录.md) 第 5 节（用户原话）提供外部素材。**不是抄方案，是给讨论提供零件和坑位。**
> **读者**：设计者本人。默认你关心"机制怎么运作、代价是什么、我该不该抄"，不需要产品介绍。
> **调研时间**：2026-11-03（本会话内）。**所有断言尽量挂 URL；没挂 URL 的请当作我的推断。**

---

## 0. 读法：来源分级（全文用四种标记）

| 标记 | 含义 | 你应该给它多少权重 |
|---|---|---|
| **〔原文〕** | 我本次会话抓取并读过的一手文本：论文摘要页、官方文档、项目 README、官方博客 | 高。可以直接引用 |
| **〔摘要〕** | 只读到论文摘要；正文机制我按公开常识补，凡涉及具体参数会另标 | 中。机制方向可信，参数需核 |
| **〔背景〕** | 领域通用知识（黑板、tuple space、CRDT、快照隔离等），本次会话**没有成功抓取原文**，只给进一步阅读入口 | 中低。属于"大家都知道"，但别当引文 |
| **〔推断〕** | 我的分析、合并、或对"如果我们这样做会怎样"的判断 | 低。是讨论靶子，不是证据 |

**一句话方法说明**：这个领域"产品多、机制少、定量证据更少"。我刻意挑了五个有**可读的一手描述**的系统（Letta、Zep/Graphiti、mem0、LangMem、Cognee）加三篇论文（MemGPT、Generative Agents、MIRIX/MemOS），把它们的**记忆单元 / 写入 / 检索 / 失效 / 并发**拆成零件；并发部分因为没人替我们做过"10 实例共享记忆"，我改用"数据库 + 版本控制"的成熟机制做对齐。**最后第 9、10 节是可直接拿去吵架的清单。**

### 0.1 结论速览（如果你只看一段）

1. **"记忆优先"没有现成范式**，但零件齐全：Letta 已经把"记忆块/记忆仓库独立于 agent 存在、agent 只是挂载者"做成了产品原语；MemOS 把"记忆当系统资源、实例当进程"讲成了论文隐喻；MIRIX 把"多 agent 协调记忆"做成了论文。**"记忆是主体、实例是临时视图"目前更像是这几条线的自然合题，而不是已有人做过的东西。**〔推断〕
2. **记忆单元的事实标准是三层**：常驻上下文的小块（always-visible block）+ 可检索的条目集合（records）+ 不可变的原始事件流（episodes/log）。三者缺一不可：只有前两层会丢失"这句话是谁在什么时候说的"，只有第三层则每次都要重算。〔原文，收敛自 Letta / LangMem / Graphiti〕
3. **写入必须与对话推理分离**：让执行任务的实例自己"顺手改记忆"，会同时换来**变慢**和**变脏**两个问题——这是 Letta 从 MemGPT 演进到 sleep-time agent 时给出的明确理由。〔原文〕
4. **"回写"有两种流派**：合并式（mem0 早期：ADD/UPDATE/DELETE/NOOP）和追加式（mem0 2026 版改成 **ADD-only，只累积不覆盖**；Graphiti 用"失效而非删除"）。**趋势是"不原地改、保留历史、把冲突交给时间与检索"**。〔原文〕
5. **共享记忆的并发，工业界最诚实的答案是"版本控制"而不是"CRDT"**：Letta 的 shared memory 就是**组织级 git 仓库**，多 agent 各自挂载、各自提交，push 冲突时 `pull --rebase` 重试一次，**冲突不自动合并，而是把提醒塞进下一轮对话**。〔原文〕
6. **反面教材同样来自 Letta**：共享 memory block 是"整块替换"语义，文档明说**并发写会 last-write-wins、后写覆盖前写**。拿"共享可变块"当 10 并发实例的记忆总线，必然丢写。〔原文〕
7. **检索不是一个余弦相似度**：Generative Agents 用 recency+importance+relevance 三因子；LangMem 明确说 recall 要结合 similarity + importance + **strength（使用频次/时近）**；Graphiti 用 语义+BM25+图遍历 混合。〔原文/摘要〕
8. **"遗忘"在成熟实现里是"失效 + 降权 + 归档"，几乎没人真删**：Graphiti 的双时态边有 `valid_at/invalid_at`，事实被推翻时**旧边失效而不是删除**；Generative Agents 用指数衰减降权。〔原文/摘要〕
9. **记忆污染的可行性已被论文量化**：AgentPoison 用**<0.1% 的投毒率**在多个真实 agent 上拿到 **>80% 攻击成功率**，良性性能影响 <1%，且不需要训练模型。结论不是"别做共享记忆"，而是"写入路径必须可追溯、可回滚、可隔离"。〔摘要〕
10. **来源分级（provenance）是先行方案里最成熟、也最容易抄的一块**：Graphiti 的每个事实都能追回 episode；Letta 的共享记忆要求 commit message 里写 `Sources:`（谁、何时、哪条消息）；MemOS 把 provenance + versioning 做成 MemCube 的必备元数据。〔原文/摘要〕
11. **但"权威分级 + 置信度 + 冲突显式并存"三件事，我没在任何先行方案里看到成体系的做法**——大家都止步于 provenance。**这正是我们设计里最值得做实、也最容易做出差异的空白。**〔推断〕
12. **给设计讨论的直接建议**：先定"记忆 = 三层单元 + 统一元数据（作用域/来源/置信/版本/时间）"，再定"写回 = 候选提交 + 单写者语义合并 + baseVersion 乐观并发"，最后才谈会话树与 UI。顺序反了会返工。〔推断，理由见 §6.6〕

---

## 1. 先行方案全景

### 结论要点

- 五个系统可以按"记忆单元形态"分成四条路线：**分层上下文**（MemGPT/Letta）、**时序图谱**（Zep/Graphiti）、**抽取-合并的条目库**（mem0/LangMem/Cognee）、**记忆流**（Generative Agents）。再往前一步是**记忆 OS / 多类型记忆**（MemOS/MIRIX）。
- **路线之间不是替代关系**，而是记忆的三个层次：流（原始）→ 条目（结构化）→ 块（常驻）。成熟产品最后都长成"三层混用"。
- 对我们的价值排序：**Letta（共享与写入分离）> Graphiti（时序与溯源）> LangMem（作用域与写入质量）> mem0（算法演进史）> GA（检索公式）> MIRIX/MemOS（术语与野心）**。〔推断〕

### 证据与对照表

| 系统 | 记忆单元 | 写入方式 | 检索 | 衰减/失效 | 共享/并发 | 最值得抄的点 |
|---|---|---|---|---|---|---|
| **MemGPT / Letta** | 上下文分块（memory blocks）+ 外部 recall/archival | agent 用工具自编辑；新版可交给 **sleep-time agent** 后台改 | 常驻块不用检索；归档靠检索 | 压缩/整理（compaction） | **块可被多个 agent 共享**；共享仓库用 git | 块 + 写入者分离 + git 共享 |
| **Zep / Graphiti** | 实体 + 带**双时态**的关系边 + episode（原始流） | 增量摄取 episode → LLM 抽实体/边 → **去重与矛盾消解** | 语义 + BM25 + 图遍历 混合 | **失效不删除**（`valid_at/invalid_at`） | 单写者式图库；多租户（group_id） | 双时态 + episode 溯源 |
| **mem0** | 抽取出的"记忆条目"（+ 图变体） | 抽取→**合并式更新**（旧）；2026 版改为 **ADD-only 单遍** | 语义 + BM25 + 实体匹配 融合 | 靠时间推理与排序（不覆盖旧值） | per-user/session/agent 三级 | 算法演进：从"改"到"只加" |
| **LangMem / LangGraph Store** | semantic（profile/collection）+ episodic + procedural | **hot path（conscious）** 或 **background（subconscious）**；memory manager 输入"对话+当前记忆"输出"新记忆状态" | 直接取键 / 语义搜索 / 元数据过滤 | 合并时 invalidate/consolidate | **多级命名空间**（org/user/app） | 写入质量权衡 + 命名空间 |
| **Cognee** | 图（实体/关系）+ 向量块 + 会话 | `remember / improve / forget`；**会话蒸馏**把"被采纳的经验"升为长期记忆 | 图/向量/代码混合，多种 search 策略 | `forget` 删除条目或数据集 | dataset 级隔离 | 会话→长期 的蒸馏管线命名 |
| **Generative Agents** | **记忆流**：自然语言记录列表，每条带时间戳/重要性/嵌入 | 感知即写入；**reflection** 把记忆综合成更高层洞察再写回流 | **recency + importance + relevance** 加权 | 时近性指数衰减（降权不删） | 无（单 agent 模拟） | 检索三因子 + 反思回写 |
| **MIRIX** | 六类：Core/Episodic/Semantic/Procedural/Resource/Knowledge Vault | **多 agent 框架**协调更新 | 多组件路由检索 | 未见细节（未读正文） | 多 agent 协调更新/检索 | "记忆类型分治" |
| **MemOS** | **MemCube** = 内容 + 元数据（provenance、版本） | 统一表示/调度/演化 | 统一调度 | 可迁移/融合 | 记忆作为系统资源、可组合迁移 | 单元元数据 + OS 隐喻 |

链接：MemGPT <https://arxiv.org/abs/2310.08560>；Letta 记忆块 <https://docs.letta.com/v1-sdk/memory/memory-blocks>；Letta 共享记忆 <https://docs.letta.com/v1-sdk/memory/shared-memory>；Zep 论文 <https://arxiv.org/abs/2501.13956>；Graphiti <https://github.com/getzep/graphiti>；mem0 论文 <https://arxiv.org/abs/2504.19413>；mem0 仓库 <https://github.com/mem0ai/mem0>；LangMem 概念 <https://langchain-ai.github.io/langmem/concepts/conceptual_guide/>；Cognee <https://github.com/topoteretes/cognee>；Generative Agents <https://arxiv.org/abs/2304.03442>；MIRIX <https://arxiv.org/abs/2507.07957>；MemOS <https://arxiv.org/abs/2507.03724>。

---

## 2. 记忆单元怎么定义（最基础的一节）

### 结论要点

**记忆的最小单位不能只有一种。** 先行方案的收敛结果是**三层**，因为它们回答三个不同问题：

| 层 | 回答的问题 | 形态 | 典型实现 | 关键属性 |
|---|---|---|---|---|
| **块（block / 常驻）** | "实例一启动就必须知道什么？" | 有标签的短文本段，直接拼进 prompt | Letta memory blocks | label、description、value、limit、read_only |
| **条目（record / 可检索）** | "这次任务相关的事实/经验是什么？" | 结构化记录 + 嵌入 | LangMem collection/profile、mem0 memory、Cognee 图节点 | 内容、作用域、来源、重要性、时间、版本 |
| **流（episode / 原始）** | "这条结论凭什么成立？" | 不可变的原始输入（消息、工具结果、文档） | Graphiti episodes、记忆流 | 不可变、时间戳、可溯源 |

### 证据

- **〔原文〕Letta memory block 的字段定义**：`label`（唯一标识）、`description`（**agent 靠它决定怎么读写这块**）、`value`（内容）、`limit`（字符上限）；块是"永远可见、无需检索"的上下文切片，本质上以 XML 形式**前置**到 prompt。来源：<https://docs.letta.com/v1-sdk/memory/memory-blocks>（该页标注 `status: legacy`，属 v1 SDK，但作为机制说明仍然有效）。
- **〔原文〕Letta 明确把块当"协调原语"**：官方列举的用法里包括 "**Coordinate multi-agent systems: parent agents watch subagent result blocks update in real-time**"（父 agent 实时看子 agent 的结果块）和"share read-only policies across all agents from a central source"（中央只读策略块）。这几乎就是我们"共享领域记忆 + 私有工作集"的原型，只是它用"块"而不是"记忆条目"。
- **〔原文〕LangMem 的两种语义记忆形态**：**collection**（无界知识，运行时检索；更新时要"与旧信念对账——删除/失效 或 更新/合并"）与 **profile**（单文档、有 schema、每次更新是"改这份文档"、适合快速取当前状态、**也适合给人手工编辑**）。来源：LangMem 概念页。
- **〔原文〕Graphiti 把一切都追回 episode**：context graph 由 **entities（节点，带随时间演化的摘要）/ facts（边，带有效性窗口）/ episodes（原始数据，"the ground truth stream"，每个派生事实都能追回它）/ custom types（本体）** 组成。来源：<https://github.com/getzep/graphiti>。
- **〔摘要〕MemOS 的单元元数据**：MemCube "encapsulates both memory content and metadata such as **provenance and versioning**"，并可被**组合、迁移、融合**。来源：<https://arxiv.org/abs/2507.03724>。
- **〔摘要〕MIRIX 的类型分治**：Core / Episodic / Semantic / Procedural / Resource Memory / **Knowledge Vault** 六类，配一个多 agent 框架动态控制更新与检索。注意它把"资源"（文件/截图）和"保险库"（敏感信息）也当记忆类型——这对"客服场景要存工单/截图"有直接启发。来源：<https://arxiv.org/abs/2507.07957>。

### 对我们的映射〔推断〕

- 我们第 7 节里提的"结构化条目 + 自由文本附件"是对的，但**少了第三层**：必须有不可变的原始流（对话片段、工具输出、用户原话），否则"可回滚、可追溯"没有落点，也无法回答"这条错误记忆是哪个实例、基于什么写的"。
- 建议的记忆单元：`MemoryItem{id, kind, scope, content, confidence, provenance{episodeIds[], authorAgentId, method}, validity{from,to|null}, version, supersedes, status}`，其中 `kind ∈ {fact, decision, requirement, progress, lesson, preference}`，`status ∈ {active, superseded, disputed, archived}`。
- **块的 description 字段是被低估的设计要点**：Letta 说 agent 靠 description 学怎么用这块。我们的"作用域"如果只做后端过滤、不给模型一句"这块该放什么"的说明，写入质量会明显下降。〔原文 → 推断〕

---

## 3. 写入流程：谁写、何时写、写成什么

### 结论要点

1. **写入者和执行者要分开**。让执行任务的实例一边干活一边整理公共记忆，是**又慢又脏**的双输。
2. **写入时机**：hot path（对话中立即写，快但加延迟、加复杂度）vs background（对话后/空闲时写，慢但质量高）。成熟系统**两者都要，且默认把公共记忆的整理放到 background**。
3. **写入语义**：合并式（改/删旧条目）→ 追加式（只增不改）。mem0 自己的 2026 版就是从这个方向改的。
4. **写入质量有两个反向失效模式**：抽取过度 → 检索精度下降；抽取不足 → 召回下降。这不是 bug，是**必须由设计者调参的取舍**。

### 证据

- **〔原文〕Letta 的 sleep-time agent（MemGPT 的演进）**：开启后系统其实创建**两个 agent**——primary（对话、调工具、检索外部记忆）和 sleep-time agent。关键差异：**primary 不再拥有编辑 core memory 的工具**，这些工具只挂在 sleep-time agent 上，它能改 primary 的上下文内记忆。给的理由原文很清楚：MemGPT 把"记忆管理、对话、其他任务"塞进一个 agent，导致**可能更慢**（对话中要调记忆操作）且**可能更不可靠**（同时调记忆工具和普通工具）；而且 **MemGPT 的记忆形成是增量的，时间一长会变乱**。sleep-time agent 则可以持续把学到的东西整理成"干净、简洁、详细"的记忆。还提到：可以被配成不同模型（primary 用小快模型，sleep 用大慢模型），并且是 **"anytime" 式修改**——primary 不必等它跑完就能读到。来源：<https://www.letta.com/blog/sleep-time-compute>
- **〔原文〕LangMem 的两种形成方式**：**conscious / hot path**（对话中让 agent 自己决定存什么，实现简单但"给用户交互加了可感知延迟"，还多了一个干扰 agent 完成任务的障碍）；**subconscious / background**（对话后或闲置一段时间后让 LLM 反思、找模式、抽洞察，不影响延迟，对召回更友好）。来源：LangMem 概念页。
- **〔原文〕LangMem 的写入质量取舍**：更新 collection 必须"与新信息对旧信念对账"，原文直说：**over-extract → 检索时精度下降；under-extract → 召回低**；它用"memory enrichment"在两者间平衡，并允许改指令来调节强弱。来源同上。
- **〔原文〕mem0 的算法转向**：其当前 README 的 "New Memory Algorithm (April 2026)" 明确写：**Single-pass ADD-only extraction — one LLM call, no UPDATE/DELETE. Memories accumulate; nothing is overwritten.** 另外新增 "Agent-generated facts are first-class"（agent 确认过的动作也算事实，与用户陈述等权）、实体链接、多信号检索、时间推理。来源：<https://github.com/mem0ai/mem0>。这条同时**反证**了旧算法是 ADD/UPDATE/DELETE 式的合并写入（〔摘要〕论文 2504.19413 的两阶段"抽取 + 更新"也是这个思路）。
  > 我的判断〔推断〕：ADD-only 的代价是把"矛盾消解"从写入时推迟到**检索时**（靠时间与排序挑出"当前为真"的那条）。这对 10 并发实例其实是**好消息**——写入不再需要跨实例加锁；坏消息是**"当前谁对"这件事必须在检索/读路径上解决**，阅读理解成本上升。
- **〔原文〕Cognee 的显式生命周期词汇**：`remember`（写入，可带 session）、`recall`（检索，可自动路由策略）、`improve`（富化、应用反馈、**把会话知识桥接进图**）、`forget`（删条目或数据集）；并把 "Session distillation curates **accepted lessons** into permanent memory" 当成一条独立管线。来源：<https://github.com/topoteretes/cognee>。这个"accepted lessons"（被采纳的经验）用词，跟我们"候选记忆经合并才进公共层"高度同构。

### 对我们的映射〔推断〕

- 执行实例**不能直接写公共记忆**，只能产出 **handoff / 候选记忆**；真正的合并由单写者（记忆中台）做。这与我们第 7.4 节一致，先行方案给了两处背书：Letta 的"primary 没有记忆编辑工具"、Cognee 的"accepted lessons"。
- 建议区分两条写入通道：
  - **热通道**：实例结束 → 结构化 handoff（做了什么/结论/证据/未决）→ 立即落为"候选"（不生效，但可见）。
  - **冷通道**：后台整理者（sleep-time 角色）周期性把这些候选**合并、去重、提升为 active**，并负责"把变乱的记忆整理干净"。
- **"agent 生成的事实也等权"这条要谨慎**：mem0 把 agent 确认的动作升为一等事实（〔原文〕），但那是在**工具执行结果可验证**的场景。我们的"总结回写"是**不可验证的自然语言推断**，必须给低权威位。〔推断〕

---

## 4. 检索：不要指望一个余弦相似度

### 结论要点

- 先行方案普遍用**多信号加权**，最稳定的三个因子是：**相关性（嵌入/词法/图距离）+ 重要性（LLM 打分）+ 时近性/使用强度（衰减或强化）**。
- **常驻小块 + 按需检索**是共识：不是"把记忆全灌进上下文"。
- 检索是**记忆系统的性能瓶颈与质量瓶颈**：Generative Agents 的消融显示，检索失败是最主要的错误来源之一。

### 证据

- **〔原文〕Generative Agents**：架构三件套 = memory stream（自然语言记录全部经历）+ **retrieval（结合 relevance、recency、importance 三个因子来"浮现"需要的记录）** + reflection（把记忆综合成更高层推断，并**再写回 memory stream**）；规划同样回写。来源：<https://arxiv.org/abs/2304.03442>（§1、§3、§4 已读；我没有逐字读到 §4.1 的参数细节，**具体常数（如逐时衰减因子 0.995、反思触发的重要性累计阈值 150）是常见二手复述，工程上别照抄**）。
- **〔原文〕Generative Agents 的失效模式**：论文自述最常出现的错误是"**没检索到相关记忆**"和"**给记忆编造了 embellishments**"——后者直接对应我们担心的"记忆污染"：**LLM 写记忆时会美化/脑补**，不是只有恶意投毒才会脏。
- **〔原文〕LangMem**：原文一句 "memory relevance is more than just semantic similarity. Recall should combine similarity with **importance** ... as well as the memory's **strength**, which is a function of how recently/frequently it was used." —— 三个信号的工程含义：重要度要**在写入时**由 LLM 打分，强度要**在读取时**更新（最近/最频繁被用到的记忆更容易再次被用）。
- **〔原文〕Graphiti**：hybrid retrieval = 语义嵌入 + 关键词（BM25）+ 图遍历，明确对比 GraphRAG 的"顺序 LLM 摘要"路线，主打低延迟（README 称典型亚秒级）。图遍历的意义：**"和这条事实相关的事实"往往不是语义相似，而是图上相邻**。
- **〔原文〕mem0**：新版把 semantic / BM25 / entity matching 三路**并行打分后融合**，并单独做 "Temporal Reasoning（时间感知检索，为'当前状态 / 过去事件 / 未来计划'排对日期实例）"。这说明**"当前为真"被当成检索问题，而不是写入时的覆盖问题**。

### 对我们的映射〔推断〕

- 我们的"spawn 时拿作用域快照 + 按需检索"是对的；但**快照里放什么**要显式设计：建议快照 = 该作用域的**常驻块**（约束/偏好/当前目标）+ **top-K 条目**（按上面三因子），而不是整棵子树。
- **重要度必须在写入时打分**（写入者顺手给 1–10），**使用强度必须在读取时累加**（`lastAccessedAt`/`accessCount`），两者共同决定衰减速度。这是 GA 与 LangMem 的共同做法，成本很低。

---

## 5. 衰减、遗忘、失效

### 结论要点

- 成熟实现里，**"遗忘"= 失效 + 降权 + 归档**，几乎不物理删除。
- **失效要能被表达成事实**：Graphiti 用双时态边（什么时候开始为真、什么时候不再为真），旧事实**被 invalidate 而不是 delete**；这同时给了"历史查询"能力。
- 单靠 TTL 会误杀：**"过时"与"重要但久未使用"是两件事**。TTL 只能用于确有保质期的事实（如"当前分支是 X"），不能用于偏好/长期目标。

### 证据

- **〔原文〕Graphiti**：事实有 **validity window**——"when it became true, and when (if ever) it was superseded"；"When information changes, old facts are **invalidated — not deleted**. Query what's true now, or what was true at any point in time."；并明确 "**automatic fact invalidation** with temporal history preserved"、双时态跟踪。来源：Graphiti README（上文已引）。
- **〔原文〕Letta 的整理动作**：sleep-time agent 的存在理由之一就是"MemGPT 增量记忆会变乱"，需要持续整理成"干净、简洁、详细"的状态；另外 recall/archival 的分层本身就是一种冷热分离。来源：sleep-time 博客。
- **〔原文〕Cognee**：提供 `forget`（删除指定条目或 dataset），但把"记忆改进"放在 `improve`（富化/反馈/桥接），说明**删除是例外动作，不是常规维护动作**。
- **〔摘要〕MemoryBank**：以艾宾浩斯遗忘曲线做"遗忘/强化"的早期代表（<https://arxiv.org/abs/2305.10250>）。我只读到摘要级信息，**不细引其公式**。
- **〔原文〕mem0**：ADD-only 后靠 **Temporal Reasoning** 在检索时区分"当前/过去/未来"，等价于把"新旧"当成查询维度而不是删除动作。

### 对我们的映射〔推断〕

- 记忆状态机建议：`active → superseded`（有新事实取代，保留双向链接）／`active → disputed`（与另一条矛盾且未裁决，**两条并存且标注冲突**）／`active → archived`（长期未用且低重要度，退出检索候选但可召回）。
- **衰减只作用于"检索排序"，不作用于"存储寿命"**：物理删除只发生在隐私/合规或明确的"这条错了"操作上，并写入审计。
- 我们的第 7.5 条"旧事实要 TTL / 降权"建议改成：**"可失效（validity 可闭合）+ 可降权（decay 影响排序）+ 可归档"**。TTL 单独用会杀掉"三个月前定下的架构决策"这类高价值低时近记忆。〔推断〕

---

## 6. 并发与共享：10 个实例同时读写同一份记忆（本报告的重点）

### 结论要点

1. **经典的多 agent 共享内存模型（黑板 / tuple space）解决的是"协调"而不是"一致性"**，它们的隐含假设是写入是**规则的、可仲裁的**，而 LLM 的写入是**非确定、语义级**的——直接套会漏掉最难的冲突。
2. **共享可变块 = last-write-wins = 必然丢写**。这是 Letta 文档的**明文警告**，不是理论风险。
3. **工业界目前最诚实的做法是"版本控制载体"**：共享记忆 = git 仓库；每个实例一个挂载；提交带来源；push 冲突时 rebase 重试一次；**不自动语义合并，冲突上交人工/agent**。
4. **事件溯源（append-only log）** 是"既要可回滚、又要并发"的正确底座：读用快照/投影，写只追加。
5. **CRDT 不适合直接当"记忆"的合并算法**：CRDT 合的是数据结构（集合/计数器/序列），合不了"两条自然语言事实互相矛盾"。CRDT 只适合**元数据层**（标签集合、引用集合、访问计数）。
6. 结论：**三层并发模型**（私有工作集 → 候选提交带 baseVersion → 单写者语义合并）。这与我们第 7.4 节一致，但要补两个东西：**冲突检测分两层**、**合并裁决要留审计**。

### 6.1 经典模型：黑板与 tuple space〔背景〕

- **黑板架构（Blackboard）**：多个知识源共享一块结构化数据（黑板），由控制组件决定谁在何时能写。它的并发语义是**"受控写"**——总有一个调度者，写入者有明确的知识源身份。参考：<https://en.wikipedia.org/wiki/Blackboard_system>（本次会话未成功抓取，仅作入口；经典文献为 Nii 1986 *Blackboard Systems*）。
- **Tuple space / Linda**：进程通过 `out/in/rd` 操作共享一个元组空间，时间与空间解耦（写者不必知道读者）。优点是不需要直接寻址，缺点是**只有元组级原子性，没有语义一致性**。参考：<https://en.wikipedia.org/wiki/Tuple_space>（同上，未抓取）。
- **对我们的直接启发〔推断〕**：黑板模型里"**控制组件决定谁可写**"这一条，就是我们说的单写者/记忆中台；tuple space 里"**写者不寻址读者**"这一条，正好是"实例写候选、由中台决定谁可见"。

### 6.2 反面教材：共享可变块的 last-write-wins（原文警告）

- **〔原文〕Letta memory blocks 文档**：块更新是"**setting value completely replaces the entire block content — it is not an append operation**"，并明说：**"If multiple processes (agents or external scripts) modify the same block concurrently, the last write wins and overwrites all earlier changes."** 给出的缓解手段是：不想让 agent 改就设 `read_only`；只在"可接受覆盖"的场景直接改；应用逻辑要按"全量替换"而不是"合并"来设计。来源：<https://docs.letta.com/v1-sdk/memory/memory-blocks>
- 意义〔推断〕：**"多个 agent 共享一个可变文本块"看起来最像我们想要的"共享领域记忆"，实际上是最危险的实现**。如果我们的 10 个实例都往"后端记忆"这一个块里写，必然互相覆盖；而且覆盖是**静默**的，不会报错。

### 6.3 生产实践：共享记忆 = git 仓库 + rebase + 冲突上交（原文）

- **〔原文〕Letta 的 shared memory 设计**（来自其 `managing-shared-memory` skill 文档）：
  - 共享记忆的单位是 **shared memory repository**：**组织所有、不是某个 agent 所有**的 git 仓库，可被**动态 attach/detach 到多个 agent**；attach 后在每个 agent 的文件系统里是**真实的 git checkout**，挂在自己的记忆目录旁。
  - 读写就是普通 git：改文件、commit；**harness 在每轮对话后把干净的提交 push 上去**。
  - **冲突处理**：如果 push 与别的 agent 撞车，**`pull --rebase` 后重试一次**；**脏文件和冲突不会被自动改动**，而是**在下一轮对话里给 agent 加一条提醒**让它自己处理。
  - **来源纪律**：每条记忆提交必须在 commit message 里留下可回溯的 `Sources:`——谁（姓名+ID）、何时、原话、发生了什么、为什么值得长期保留；**"记忆行只写结论，provenance 放 commit 里"**；而且要求**一条学习一个 commit**。
  - 明确限制：**共享记忆不进系统提示**（写它不会改变上下文内记忆）；不同 agent 的挂载互相隔离（cross-agent guard）。
  - 来源（raw）：<https://github.com/letta-ai/letta-code/blob/main/src/skills/builtin/managing-shared-memory/SKILL.md>；对应产品文档 <https://docs.letta.com/v1-sdk/memory/shared-memory>
- 意义〔推断〕：这套东西几乎就是我们第 7.4 节"快照 + 乐观并发 + 可回滚"的**工业落地版**，而且它诚实承认了边界：**语义冲突不自动合并，交给 agent/人**。我们可以直接借它的三件事：**组织所有的记忆仓库**、**commit 即版本 + 来源**、**rebase-retry-then-escalate**。

### 6.4 底座：事件溯源（原文）

- **〔原文〕Martin Fowler, Event Sourcing**：把每次状态变化捕获成事件、按序持久化；因此可以**完整重建**、**时间点查询**、**重放/反转**；"event log is a purely additive structure that requires minimal locking"；也警告外部副作用（重放时不能真的再发一遍通知，需要 gateway 屏蔽）。来源：<https://martinfowler.com/eaaDev/EventSourcing.html>
- 意义〔推断〕：**记忆的"写"应该是追加事件（proposal/vote/merge/supersede/dispute），"读"是投影**。这样并发写天然不冲突（都追加），冲突只在"投影时"出现，而投影可以单线程、可重算、可回滚。

### 6.5 为什么不直接上 CRDT〔背景 + 推断〕

- **〔背景〕CRDT**：靠"操作可交换/可合并"保证最终一致，适合集合（OR-Set）、计数器、序列（RGA）等有明确合并语义的结构。参考：Shapiro et al., *A Comprehensive Study of Convergent and Commutative Replicated Data Types*，<https://inria.hal.science/inria-00555588/document>（本次未读原文）。
- **〔推断〕为什么不适配**：两个客户端同时写 "订单状态=已支付" 和 "订单状态=已退款"，CRDT 能保证两个副本最终看到同样的值，但**没有"谁对"的语义**；LLM 记忆的冲突恰恰是语义级（"接口用 REST" vs "接口改 GraphQL"）。**能合的是元数据**：标签集合、引用列表、`accessCount`、`supersededBy` 的集合——这些用 CRDT 思路（或干脆单写者）是合适的。**文本/事实内容本身必须走裁决。**

### 6.6 建议的三层并发模型（推断，但每一层都有先行方案背书）

```
┌─────────────────────────────────────────────────────────────┐
│ L1 私有工作集（实例内）                                       │
│  - 实例 spawn 时钉住 baseVersion（快照）                       │
│  - 期间所有草稿/试错/工具输出只进私有区，不对外可见              │
│  - 背书：我们 7.3；Letta 的 MemFS/私有记忆 vs shared repo 隔离  │
├─────────────────────────────────────────────────────────────┤
│ L2 候选提交（append-only 事件）                                │
│  - 实例结束 → 提交 proposal{baseVersion, ops[], evidence[]}    │
│  - 只追加，不改公共状态；冲突在这里"排队"而不是"覆盖"            │
│  - 背书：事件溯源（Fowler）；mem0 ADD-only；Cognee accepted lessons │
├─────────────────────────────────────────────────────────────┤
│ L3 单写者语义合并（记忆中台）                                   │
│  - baseVersion == head → 快进；否则进入合并/裁决               │
│  - 结构冲突（同 scope 同 key）→ 规则裁决（来源权威 > 时间）      │
│  - 语义冲突（自然语言矛盾）→ 标 disputed，两条并存，等人/秘书裁决 │
│  - 每次合并产生新版本 + 审计记录（谁提的、依据哪条证据、谁合的）    │
│  - 背书：Letta rebase-retry-then-escalate；Graphiti invalidate   │
└─────────────────────────────────────────────────────────────┘
```

**关键补充 1：冲突检测要分两层**〔推断〕
- **结构冲突**：同一 `(scope, key)` 被两个并发提交改（如两实例同时改"订单超时时间"）。可自动检测、可规则裁决。
- **语义冲突**：不同 key、甚至不同 scope 的两条事实互相矛盾（"用 REST" vs "API 改为 GraphQL"）。**必须靠 LLM/人做判断**，无法靠文本 diff。先行方案里 **只有 Graphiti 明确把"矛盾消解"当成摄取管线的一部分**（自动失效旧边），其它都回避了。〔原文，Graphiti README 的 "Contradiction Handling: Automatic fact invalidation"〕

**关键补充 2：baseVersion 过期是常态，不是异常**〔推断〕
- 10 并发 + 长任务 ⇒ 回写时 `baseVersion` 大概率已过期。若设计成"过期就失败"，会出现大量重试；正确做法是**过期就走三方合并**（base / ours / theirs），并允许"结论仍然成立就 rebase 落地、不成立就降级为 disputed"。
- Letta 的做法印证了这个方向：**rebase 一次，失败就把冲突交给下一轮的 agent**（不设无限重试）。〔原文〕

**关键补充 3：合并本身也是 LLM，会产生新的非确定性**〔推断〕
- 合并裁决如果交给 LLM，就要接受它也会错。因此合并动作必须：① 有 schema 约束（输出结构化决策，不是自由文本）；② 记录 `decidedBy`（模型/规则/人）；③ 可回滚（合并产生新版本，而不是原地改）。这意味着**合并成本要在设计里显式预算**，别假设"反正后台跑"。

---

## 7. 质量、溯源、污染

### 结论要点

- **污染是已被量化的真实威胁**，且**低剂量就够**：<0.1% 的投毒条目即可让检索系统在触发词下命中恶意内容，攻击成功率 >80%。
- **但公开工作几乎只覆盖了"溯源"（provenance）**，没有覆盖"权威分级 + 置信度 + 冲突并存 + 回滚 UI"这一整套。**这是我们的空白，也是差异化机会。**
- 反向风险同样成立：**不用攻击，LLM 自己"总结"就会美化、编造**（Generative Agents 自述的 "embellishments"）。

### 证据

- **〔摘要〕AgentPoison**：首个针对通用/RAG agent 的**长期记忆或知识库后门攻击**；把触发词优化到"唯一嵌入空间"，使得**任何带触发词的指令都会把恶意示范从被污染记忆里检索出来**；**不需要训练或微调**；在自动驾驶、知识密集 QA、医疗 EHRAgent 三类真实 agent 上 **平均攻击成功率 >80%**，**投毒率 <0.1%**，**良性性能影响 <1%**。来源：<https://arxiv.org/abs/2407.12784>（NeurIPS 2024）
- **〔原文〕Generative Agents 的"编造"**：论文在贡献与讨论里明确把"**fabricated embellishments to the agent's memory**"列为主要错误类型之一。也就是说：**幻觉记忆不需要外部攻击者，写入流程自己会产生。**
- **〔原文〕Graphiti 的溯源设计**：每个实体/关系都能追回产生它的 episodes，README 直接说 "Every derived fact traces back to the episodes (raw data)". 另注：其参考 MCP/REST server **明确声明没有鉴权、没有授权、没有 prompt-injection 防护**，"不要把参考服务器暴露到不可信网络"——说明**记忆服务天然是攻击面**，官方自己都不假装安全。
- **〔原文〕Letta 的 commit 级溯源纪律**：`memory(<origin>): <what was learned>` + 正文写"发生了什么、为什么该记" + `Sources:` 列对话 ID/消息 ID/谁/日期/原话；"**不要编造来源；无法确认就写 `Sources: unknown` 并说明原因**"。这是我看过最可操作的 provenance 规范。来源：前述 SKILL.md。
- **〔摘要〕MemOS**：provenance + versioning 是 MemCube 的必备元数据（见 §2）。
- **〔原文〕Cognee**：`external_metadata` 会打在**每个 chunk** 上并在混合检索中暴露——说明"来源元数据跟着数据走"是可实现的工程细节。
- **〔原文〕Letta read-only blocks**：把"组织政策"这类块设成只读，防止 agent 做"potentially destructive changes"。这是**最小成本的一道防线**。

### 可抄的防线（按成本从低到高）〔推断，逐条有背书〕

| 防线 | 做法 | 背书 |
|---|---|---|
| D1 只读层 | 政策/硬约束类记忆设 `read_only`，只能由人/中台改 | Letta read-only blocks〔原文〕 |
| D2 候选制 | 实例只能写候选，公共层只由中台改 | 我们 7.5；Letta primary 无记忆编辑工具〔原文〕；Cognee accepted lessons〔原文〕 |
| D3 来源必填 | 每条记忆强制 `provenance{episodeIds, author, method}`；缺失即拒收 | Graphiti episodes〔原文〕；Letta `Sources:`〔原文〕 |
| D4 方法标记 | 区分 `user-stated / tool-verified / agent-inferred / agent-summarized`，权重递减 | 我们 7.5；mem0 的 "agent-generated facts first-class" 是反例提醒〔原文〕 |
| D5 失效不删 | 新事实闭合旧事实的 validity，旧条保留 | Graphiti 双时态〔原文〕 |
| D6 冲突显式 | 矛盾两条都 `active` 但标 `disputed`，检索时两条一起给并标冲突 | 我们 7.5；先行方案**少见成体系实现**〔推断〕 |
| D7 可回滚 | append-only + 版本号 + 快照，支持"回滚到某版本"与"定位某条记忆的写入者/依据" | 事件溯源〔原文〕；我们 7.4 |
| D8 写入隔离 | 投毒/异常写入可整批撤销（按 `authorAgentId` + 时间窗批量 supersede） | AgentPoison 的教训〔摘要 → 推断〕 |

---

## 8. 工业界 / 开源里"按需 spawn + 共享记忆"的现状

### 结论要点

- **没有找到公开的、把"记忆当主体、实例当视图"做成产品原语的系统**。最接近的是 Letta（**记忆独立于 agent 存在**：block 可挂多个 agent、shared repo 归组织所有）和 MemOS（OS 隐喻：记忆是资源、可调度/迁移/融合）。〔推断〕
- **"按需 spawn"在工业界普遍存在，但共享的是"知识库/文档"，不是"可写记忆"**：客服类产品共享的是检索库（只读），写回通常被限制在"人审后的知识条目"。**我们要求的"10 实例并发 + 回写长期记忆"属于公开资料里的空白区。**〔推断〕
- 一个耐人寻味的公开事实：**mem0 从"合并式写入"退回到"只追加"**——说明在真实负载下，**让 LLM 在写入时做破坏性更新，代价大于收益**。

### 证据

- **Letta（最接近的形态）**
  - block 可被多个 agent attach（"update once, visible everywhere"），可设 read-only，可作为"中央只读策略源"；官方把块称为"coordination primitive"，并给出"父 agent 实时看子 agent 结果块"的多 agent 协调用法。〔原文〕<https://docs.letta.com/v1-sdk/memory/memory-blocks>
  - 共享记忆仓库归**组织**所有，可 attach 到多个 agent，git 管理、提交带来源、冲突 rebase-then-escalate。〔原文〕（§6.3 链接）
  - sleep-time agent：**同一个"记忆"有两个身份在写**（对话者 + 整理者），且整理者用更强模型、写权限更大。这个"双身份"设计几乎就是"记忆是主体、实例是视图"的工程近似。〔原文〕<https://www.letta.com/blog/sleep-time-compute>
- **Cognee（Company Brain 叙事）**：明确把"把文档、对话、工单、代码、agent 的工作汇入共享记忆，让人和 agent 都能把决定追到讨论与实现"当成产品定位，并提供 "distill useful session lessons into durable knowledge that another session can retrieve"。〔原文〕<https://github.com/topoteretes/cognee>
- **mem0（生产算法的选择）**：ADD-only、agent 生成事实一等化、多信号融合、时间推理——见 §3 引用。
- **MIRIX（多 agent 协调记忆）**：六类记忆 + 多 agent 框架动态控制更新和检索，并给出 LOCOMO 85.4% 的成绩；但它的"多 agent"更多是**记忆系统的内部组件分工**，不是"多个实例共享一份领域记忆、并发写回"。〔摘要〕
- **MemOS（OS 类比）**：memory as a manageable system resource；MemCube 可组合/迁移/融合，在明文、激活、参数三种记忆之间转换。〔摘要〕

### 一张"我们想要的能力 ← 最近的先行实现"对照表〔推断〕

| 我们设计里的能力 | 最接近的先行实现 | 差距 |
|---|---|---|
| 记忆是主体，实例是临时视图 | Letta（记忆独立于 agent、可挂多个 agent）+ MemOS（OS 隐喻） | 两者都没有把"实例=视图"做成显式生命周期语义（spawn = 快照 + 私有工作集） |
| 10 并发实例共享领域记忆 | Letta shared repo（git，多 agent 挂载） | 没有"候选 + 单写者合并"的显式阶段；冲突靠 agent 自己 rebase |
| 结束总结回写长期记忆 | Cognee 的 session distillation / accepted lessons；Letta sleep-time agent | 没有"回写质量分档 + 来源分级"的公共规范 |
| 记忆不污染、可回滚 | Graphiti（失效不删、episode 溯源） | 没有"权威分级 + 冲突并存 + 批量撤销"的成体系做法 |
| 衰减与遗忘 | GA（时近衰减）、MemoryBank（遗忘曲线）、Graphiti（失效） | 未见"衰减"与"权威"联合建模 |

---

## 9. 可借鉴机制清单（建议逐条过一遍，决定抄/不抄）

> 每条都给：机制、来源、在我们设计里怎么落、成熟度。成熟度分：**生产可用 / 论文验证 / 早期实践 / 单点实现**。

| # | 机制 | 一句话 | 来源 | 落地建议 | 成熟度 |
|---|---|---|---|---|---|
| M1 | **三层记忆单元** | 常驻块 + 可检索条目 + 不可变原始流 | Letta blocks〔原文〕/ LangMem〔原文〕/ Graphiti episodes〔原文〕 | 条目表 + episode 表 + 作用域块；条目必须有 `provenance.episodeIds` | 生产可用 |
| M2 | **块带 description** | 用自然语言告诉模型这块"该放什么" | Letta（`description` 是最重要的字段）〔原文〕 | 每个作用域块都写 description，纳入 schema | 生产可用 |
| M3 | **只读块** | 政策/硬约束只允许人/中台改 | Letta read_only〔原文〕 | `scope.constraints` 设为只读层 | 生产可用 |
| M4 | **写入者与执行者分离** | 执行实例没有公共记忆写权限 | Letta sleep-time agent〔原文〕 | 实例只产出 handoff；中台/后台整理者写公共层 | 早期实践 |
| M5 | **后台整理（sleep-time）** | 空闲时用更强模型把记忆整理干净 | Letta〔原文〕；LangMem subconscious〔原文〕 | 单独"记忆整理"任务：去重、合并、闭合失效、提升候选 | 早期实践 |
| M6 | **候选 + accepted 提升** | 只有"被采纳的经验"进长期记忆 | Cognee〔原文〕；我们 7.5 | `proposal → reviewed → accepted` 状态机 | 早期实践 |
| M7 | **追加式写入（ADD-only）** | 不覆盖旧值，靠时间推理新旧 | mem0 2026〔原文〕 | 记忆内容层 append-only；"当前值"是投影 | 生产可用（mem0 自家） |
| M8 | **双时态失效** | `valid_at/invalid_at`，失效不删 | Graphiti〔原文〕 | 条目加 `validity{from,to}` + `supersededBy`；支持"当时为真"查询 | 生产可用 |
| M9 | **episode 级溯源** | 每个派生事实追回原始事件 | Graphiti〔原文〕 | 写入时强制 `evidence[]` 指向 episode ID；缺证据的写入降级为 `inferred` | 生产可用 |
| M10 | **commit 级来源规范** | 一条学习一个 commit，正文写"发生了什么"，附 `Sources:` | Letta SKILL〔原文〕 | 我们的"版本"对象要有 `message + sources + author + baseVersion` | 早期实践 |
| M11 | **共享记忆 = 版本控制仓库** | 组织所有、多实例挂载、rebase 冲突上交 | Letta shared repo〔原文〕 | 记忆库做成 append-only + 可 checkout 的版本目录（git 是最省事的实现） | 早期实践 |
| M12 | **多信号检索** | relevance + importance + recency/strength | GA〔原文〕、LangMem〔原文〕、Graphiti〔原文〕、mem0〔原文〕 | 检索分 = w1·相关 + w2·重要 + w3·时近 + w4·图距离；参数可调、可评估 | 生产可用 |
| M13 | **混合检索** | 向量 + BM25 + 图遍历 + 时间过滤 | Graphiti〔原文〕、mem0〔原文〕 | 先做"向量 + 时间 + 作用域过滤"，BM25/图后加 | 生产可用 |
| M14 | **反思 / 蒸馏回写** | 把记忆综合成更高层洞察再写回 | GA reflection〔原文〕 | "任务 → 经验"的蒸馏是 handoff 的一部分，产物是 `lesson` 类型条目 | 论文验证 |
| M15 | **作用域命名空间** | 多级 namespace（org/domain/task/agent）做隔离与组合 | LangMem〔原文〕；Letta block attach〔原文〕 | scope 用路径式 ID（`global/backend/task-123`），检索按前缀过滤 | 生产可用 |
| M16 | **单元元数据（MemCube 式）** | 内容 + provenance + version 打包成可迁移单元 | MemOS〔摘要〕 | 导出/导入/迁移的最小单位 = 记忆条目 + 证据 + 版本 | 论文验证 |
| M17 | **记忆类型分治** | 语义/情节/程序/资源/敏感分开存 | MIRIX〔摘要〕、LangMem〔原文〕 | 先分事实/决策/经验/偏好四类；"敏感"单列 | 论文验证 |
| M18 | **事件溯源底座** | 写是追加事件，读是投影，可回放 | Fowler〔原文〕 | 记忆版本 = 事件投影；回滚 = 重放；审计 = 事件日志 | 生产可用（通用工程） |
| M19 | **陈旧/冲突可查询** | "当前为真/曾经为真/存在矛盾"是查询维度 | Graphiti〔原文〕、mem0 temporal〔原文〕 | 检索 API 显式带 `asOf` 与 `includeDisputed` 参数 | 早期实践 |

**如果只能抄三个**：M1（三层单元 + 元数据）、M4+M5（写入者分离 + 后台整理）、M11（共享记忆做成版本控制仓库）。这三个决定了架构骨架，其余是优化。

---

## 10. 我们应避免的坑（每一条都尽量有出处）

| # | 坑 | 证据 | 后果 | 规避 |
|---|---|---|---|---|
| P1 | **把"共享领域记忆"实现成一个可变文本块，多实例直接写** | Letta 文档明说块更新是**全量替换**、并发写 **last-write-wins**〔原文〕 | 静默丢写；10 实例下几乎必现；且无法定位谁覆盖了谁 | 共享层只接受 append-only 候选；可变块只用于只读/单写者 |
| P2 | **让执行实例自己顺手管记忆** | Letta：MemGPT 单 agent 兼任记忆管理 → **更慢 + 更不可靠**；增量记忆会"变乱"〔原文〕 | 对话延迟上升、工具调用互相干扰、记忆质量随时间劣化 | 写入者分离（M4/M5）；执行实例无公共写权限 |
| P3 | **让 LLM 在写入时做破坏性 UPDATE/DELETE** | mem0 2026 版直接改成 **ADD-only，不覆盖**〔原文〕 | 一次错误合并会抹掉正确旧值，且难以发现 | 内容层只追加；"当前值"由投影/检索决定；删除走显式审计动作 |
| P4 | **只做"更相似就更相关"的检索** | GA 三因子〔原文〕、LangMem 明说 relevance ≠ similarity〔原文〕 | 久未使用但关键的决策被淹没；高频闲聊挤掉重要事实 | 引入 importance（写入时打分）+ strength/recency（读取时更新） |
| P5 | **用 TTL 当遗忘机制** | Graphiti 用"失效不删"〔原文〕；TTL 无来源说明 | 误杀长期有效的架构决策/用户偏好；且"过时"无法被记录 | 失效（validity 闭合）+ 降权（影响排序）+ 归档三件套 |
| P6 | **冲突检测只在文本层（git merge / diff）** | 无先行方案把语义冲突做成通用能力〔推断〕；Graphiti 是少数在摄取时做矛盾消解的〔原文〕 | "两条都写进去、谁也不报错"；下游实例各信一条，行为分裂 | 结构冲突用规则；语义冲突用 LLM/人裁决并标 `disputed`，两条并存 |
| P7 | **假设"最新写入 = 最正确"** | Graphiti 用双时态区分"何时为真"〔原文〕；AgentPoison 说明恶意内容可以"很新"〔摘要〕 | 幻觉/投毒会比正确旧知识更"权威" | 权威由**来源+方法**决定，不由时间决定；时间只影响排序 |
| P8 | **把 agent 总结的推断与用户原话等权** | mem0 把 agent 生成事实一等化是在"动作可验证"前提下〔原文〕；GA 报告 LLM 会 embellish〔原文〕 | 一轮轮总结后事实漂移（"传话游戏"） | 方法分级（user-stated > tool-verified > agent-inferred）；推断类不参与硬约束 |
| P9 | **过度抽取** | LangMem：over-extract → 检索精度下降〔原文〕 | 记忆库膨胀、检索噪声高、token 成本上升 | 写入时按 importance 阈值 + 类型白名单；定期整理降噪 |
| P10 | **抽取不足** | LangMem：under-extract → 召回低〔原文〕 | 经验沉淀失败，"记忆优先"名不副实 | 用"候选 + 复核"补召回，而不是放宽写入门槛 |
| P11 | **共享记忆服务没有鉴权/注入防护** | Graphiti 参考 server 明确"无鉴权、无授权、无 prompt-injection 防护，勿暴露"〔原文〕 | 任何能写记忆的通道都是提权通道 | 记忆写入路径当"特权 API"设计：鉴权、schema 校验、速率限制、内容审查 |
| P12 | **低剂量污染无感** | AgentPoison：<0.1% 投毒率 → >80% ASR，良性影响 <1%〔摘要〕 | 抽查很难发现；出问题时已扩散到多个实例 | 写入可批量撤销（按 author + 时间窗）；异常模式监控（同一来源短时间大量写入） |
| P13 | **快照钉死后"过期就失败"** | Letta 的做法是 rebase 一次、失败则把冲突交给下一轮〔原文〕 | 10 并发长任务下大量回写失败/重试风暴 | baseVersion 过期走三方合并；允许"结论仍成立则 rebase 落地" |
| P14 | **把合并裁决当免费操作** | 推断：合并若用 LLM，本身也是非确定性写入 | 合并引入新错误且难追溯 | 合并输出结构化决策 + 记 `decidedBy` + 产生新版本可回滚 |
| P15 | **把"记忆"当纯文本堆，不做类型/作用域** | MIRIX 六类〔摘要〕、LangMem 三类〔原文〕、Letta block 带 label〔原文〕 | 检索无法按用途过滤；权限无法按类型收敛 | 先定 `kind` + `scope` 两个维度，再谈算法 |
| P16 | **私有工作集被顺手写回公共层** | 我们 7.3 的"默认隔离"；Letta 的 private vs shared 物理隔离〔原文〕 | 草稿/试错污染公共记忆（最典型、最容易被忽略） | 物理隔离：私有区与公共区不同存储；回写必须显式 `promote` 操作 |
| P17 | **只抄"记忆流/反思"，不抄"检索与失效"** | GA 的消融显示反思与检索各自关键〔原文〕；很多复刻只做 stream | 记忆越写越多、越来越难用 | 检索公式与失效机制必须同时实现，否则不要上"反思回写" |

---

## 11. 对 [`11-设计方案v0.md`](../design/11-设计方案v0.md) 第 7.6 节六个待拍板问题的直接回话

> 下面每条 = 先行方案怎么看 + 我的建议 + 置信度。

1. **记忆的最小单位：结构化条目 vs 自由文本块？**
   - 先行方案：**两者都要，且是三层**（块 / 条目 / 原始流，见 M1）。只做自由文本块 → 无法做冲突检测与权限；只做结构化条目 → 丢失上下文与语气。
   - 建议：条目为主 + 块为入口 + 原始流为证据。**置信度：高**。

2. **写回方式：直接写 vs 候选 + 合并？**
   - 先行方案：**候选/受控写**是主流（Letta primary 无写权限、Cognee accepted lessons、Graphiti 摄取管线统一处理合并）。直接写只在"单 agent 单用户"场景成立。
   - 建议：候选 + 单写者合并；高风险写入（改硬约束、删记忆、跨作用域提升）要人审。**置信度：高**。

3. **会话树 = 记忆树？同一棵树，还是两个视图？**
   - 先行方案：没有直接对应物。最接近的是 LangMem 的**多级命名空间**（作用域是数据维度）与 Letta 的**块可挂多个 agent**（一个记忆可被多个执行体共享）——两者都指向"**作用域是数据，会话/实例是运行时**"。
   - 建议：**树 + 引用图**。会话树决定"谁来读"、记忆作用域树决定"读什么"，一个会话可以引用多个作用域（跨领域任务必然如此）。不要强行合成一棵树。**置信度：中（推断为主）**。

4. **并发语义：快照隔离 + 乐观合并可以吗？**
   - 先行方案：方向上对（事件溯源 + 版本控制是工业界的现实解），但要补 **baseVersion 过期走三方合并**、**语义冲突显式并存**、**合并可审计可回滚**。**不要用 CRDT 合并记忆内容，也不要用共享可变块。**
   - 建议：采用 §6.6 的三层模型。**置信度：高（机制层面）/ 中（参数与成本层面）**。

5. **权威顺序：用户 > 系统 > 推断，对吗？旧记忆要不要 TTL？**
   - 先行方案：**权威分级没人成体系做**（只有 provenance），所以这条我们可以自己定，但要做成**可判定**的：权威应体现在 `method` 字段与合并规则上，而不是文案。
   - 建议：`user-stated > tool-verified > agent-confirmed > agent-inferred`；TTL **只用于确实有保质期的事实**，其余用 validity + 衰减 + 归档。**置信度：中高**。

6. **spawn 权限：秘书 spawn，还是领域作用域自己按负载 spawn？**
   - 先行方案：**没有讨论**（先行方案里实例是应用层创建的，不是记忆自己生的）。所以这不是"抄"的问题，而是我们要不要引入"记忆自调度"的新概念。
   - 建议：v1 **只允许秘书/中台 spawn**（可审计、可控并发上限），把"作用域自 spawn"留作后续能力。**置信度：中（纯设计取舍）**。

---

## 12. 本次调研的空白与不确定（诚实清单）

1. **"10 并发实例共享一份可写领域记忆"没有公开的定量研究**。我找到的最接近的是 Letta 的多 agent 共享 git 仓库（工程实践）和 Graphiti 的单写者图库（摄取管线）。**我们的核心场景，公开资料里没有现成答案。**〔推断〕
2. **多 agent 记忆的"权限/可见性"语义**（哪些实例能读哪些作用域、能否跨作用域引用）在先行方案里都不是一等公民：LangMem 只有 namespace 字符串，Letta 只有 attach/detach。**这块要我们自己设计。**
3. **失败模式与评估**：除了 LOCOMO/LongMemEval/DMR 这类问答基准，没有"记忆长期演化后质量如何"的基准。**"记忆污染率""错误沉淀率""回写冲突率"这类指标需要自建**。〔推断〕
4. **Generative Agents 的具体超参**（衰减因子、反思阈值）我没逐字核对原文，报告中已标注；工程上建议自己跑 AB，而不是照抄数字。
5. **MemoryBank / CRDT / 黑板 / tuple space** 我只用了背景级描述，没有精读原文。如果要把它们写进设计文档的"相关工作"，建议单独补读（入口见 §13）。
6. **成本数据**：sleep-time / 后台整理的 token 成本、git 式共享记忆的存储增长，公开材料里没有可比数字。**需要在我们的设计里先做成本模型。**〔推断〕

---

## 13. 参考来源（按可信度分组）

**A. 一手：我读过的原文/官方文档**
1. Letta — Memory blocks（字段、共享、只读、**last-write-wins 警告**）：<https://docs.letta.com/v1-sdk/memory/memory-blocks>
2. Letta — Shared memory（块共享）：<https://docs.letta.com/v1-sdk/memory/shared-memory>
3. Letta Code — `managing-shared-memory` skill（**git 共享记忆仓库、rebase-retry、冲突上交、commit 来源规范**）：<https://github.com/letta-ai/letta-code/blob/main/src/skills/builtin/managing-shared-memory/SKILL.md>
4. Letta — Sleep-time Compute（**双 agent、写入者分离、增量记忆会变乱**）：<https://www.letta.com/blog/sleep-time-compute>
5. Graphiti README（**双时态、episode 溯源、混合检索、矛盾自动失效、安全声明**）：<https://github.com/getzep/graphiti>
6. mem0 README（**2026 新算法：ADD-only、agent 事实一等化、多信号检索、时间推理**）：<https://github.com/mem0ai/mem0>
7. LangMem 概念指南（**三类记忆、collection vs profile、hot path vs background、over/under-extraction、similarity+importance+strength、命名空间**）：<https://langchain-ai.github.io/langmem/concepts/conceptual_guide/>
8. Cognee README（**remember/recall/improve/forget、session distillation、accepted lessons、Company Brain**）：<https://github.com/topoteretes/cognee>
9. Martin Fowler — Event Sourcing（**追加日志、重建、时间点查询、重放、最小锁**）：<https://martinfowler.com/eaaDev/EventSourcing.html>

**B. 论文（读到摘要，正文按需补）**
10. MemGPT: Towards LLMs as Operating Systems — <https://arxiv.org/abs/2310.08560>
11. Generative Agents: Interactive Simulacra of Human Behavior — <https://arxiv.org/abs/2304.03442>（§1–4 已读，§4.1 参数未逐字核）
12. Zep: A Temporal Knowledge Graph Architecture for Agent Memory — <https://arxiv.org/abs/2501.13956>
13. Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory — <https://arxiv.org/abs/2504.19413>
14. MIRIX: Multi-Agent Memory System for LLM-Based Agents — <https://arxiv.org/abs/2507.07957>
15. MemOS: A Memory OS for AI System — <https://arxiv.org/abs/2507.03724>
16. AgentPoison: Red-teaming LLM Agents via Poisoning Memory or Knowledge Bases — <https://arxiv.org/abs/2407.12784>
17. MemoryBank: Enhancing Large Language Models with Long-Term Memory — <https://arxiv.org/abs/2305.10250>

**C. 背景（本次未成功抓取原文，仅作进一步阅读入口）**
18. Blackboard system — <https://en.wikipedia.org/wiki/Blackboard_system>
19. Tuple space / Linda — <https://en.wikipedia.org/wiki/Tuple_space>
20. CRDTs（Shapiro et al.）— <https://inria.hal.science/inria-00555588/document>
21. Optimistic concurrency control / snapshot isolation — 见 Kleppmann, *Designing Data-Intensive Applications* ch.7（<https://dataintensive.net/>）
22. OWASP GenAI — "Memory Is a Feature. It Is Also an Attack Surface"（**本次抓取返回空，仅保留入口，未引用其结论**）：<https://genai.owasp.org/2026/05/13/memory-is-a-feature-it-is-also-an-attack-surface/>

---

## 附：一句话给设计讨论

> 这个领域的先行方案已经把"记忆"拆成了可复用的零件（三层单元、溯源、失效、写入者分离、版本化共享），但**没有一家把"并发实例共享一份可写记忆"当成一等公民解决过**。所以我们的设计不是"抄一个架构"，而是**把数据库的并发控制、版本控制的溯源纪律、记忆系统的检索与失效，拼成一个新东西**——拼法在 §6.6，清单在 §9，坑在 §10。
