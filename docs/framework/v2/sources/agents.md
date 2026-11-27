# 多智能体编排与 Agent 工程：官方原文摘录

采集时间 2026-11-27。只抄录原文事实，不写评价。版本以 GitHub releases/latest、PyPI、npm 元数据为准；同一项目两处版本不一致时并列。

| 名称 | 维护方 | 最新版本 | 出处链接 | 解决什么问题 | 角色划分方式 | 产物与交接方式 | 是否有强制校验（有/无/部分） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|---|---|
| MetaGPT | FoundationAgents（原 geekan/MetaGPT，DeepWisdom） | PyPI `metagpt` 0.8.2（2025-03-09）；GitHub releases/latest v0.8.1 | https://github.com/FoundationAgents/MetaGPT ；https://docs.deepwisdom.ai | 把一句需求变成用户故事、竞品分析、需求、数据结构、API、文档与代码 | Role 子类用 `set_actions` 声明动作、`_watch` 订阅上游动作；内置产品经理、架构师、项目经理、工程师 | 动作产出 `Message(content, role, cause_by)`，Environment 按 cause_by 广播给订阅方 | 无 | "Code = SOP(Team) is the core philosophy."<br>"each role observe the corresponding output from upstream, and publish its own for the downstream" |
| ChatDev | OpenBMB（清华 THUNLP） | README 声明 2.0（DevAll）2026-01-07 发布；GitHub tag v2.2.0 | https://github.com/OpenBMB/ChatDev ；https://docs.chatdev.tech | 用多角色会话从需求做到可运行软件，2.0 改为零代码可视化工作流平台 | 1.0 为 CEO、CTO、Programmer 等职务角色；2.0 由 YAML 图里的 agent 节点声明模型、提示词、工具与记忆 | 节点输出统一为 `List[Message]` 写入 `WareHouse/<session>/`，`context.json` 存快照；Git mode 用提交交接代码 | 部分 | "A Zero-Code Multi-Agent Platform for Developing Everything."<br>"all node outputs are now standardized as `List[Message]`" |
| AutoGen | Microsoft Research（仓库已归档） | `python-v0.7.5`；PyPI `autogen-agentchat` 0.7.5 | https://github.com/microsoft/autogen ；https://microsoft.github.io/autogen/stable/ | 用消息传递把多个可对话 agent 组成团队 | `AssistantAgent(name, model_client, system_message, tools)`；团队预设 RoundRobin、Selector、MagenticOne、Swarm | `TaskResult.messages` 保留思考过程与最终回复，`stop_reason` 说明为何停止；`HandoffMessage` 表示转交 | 部分 | "AgentChat provides intuitive defaults, such as Agents with preset behaviors and Teams with predefined multi-agent design patterns."<br>"Agents are expected to be stateful and this method is expected to be called with new messages, not complete history" |
| CrewAI | CrewAI Inc. | 1.15.45（2026-11-24 发布） | https://github.com/crewAIInc/crewAI ；https://docs.crewai.com | 用 role/goal/backstory 的 agent 组队执行任务，或以 Flows 做事件驱动编排 | Agent 的 role、goal、backstory 三者必填，另有 llm、tools、allow_delegation；hierarchical 过程由 manager 协调 | Task 输出可经 output_pydantic、output_json 结构化或 output_file 落盘，并自动传给下一任务 | 部分 | "CrewAI Crews: Optimize for autonomy and collaborative intelligence with role-based AI agents."<br>"A manager agent coordinates the crew, delegating tasks and validating outcomes before proceeding." |
| Agent OS | Builder Methods（artisan-build/agent-os） | 2.1.1（2025-10-29） | https://github.com/artisan-build/agent-os ；https://buildermethods.com/agent-os | 把 agent 的工作切成计划、规格、任务、实现、验证几个可检查阶段 | 2.0 用 implementers.yml 与 verifiers.yml，每个 role 带 standards 与 `verified_by`；2.1 移除该角色系统，改由 `agents/` 下子代理文件定义 | `requirements.md` → `spec.md` → `tasks.md` 逐级落盘，实现者回写 `- [x]`；orchestrate-tasks 按任务组委派并回写 `orchestration.yml` | 部分 | "It gives your agents the specs they need to ship quality code on the first try—not the fifth."<br>"The final overall verification step for a spec's implementation remains intact." |
| OpenAI Agents SDK | OpenAI | 0.26.0 | https://github.com/openai/openai-agents-python | 提供 agent 循环、handoff、guardrail、session 与 tracing 的生产级 SDK | Agent 由 instructions、tools、handoffs、output_type、guardrails 定义；编排分 agents as tools 与 handoffs 两种 | handoff 默认把整段历史交给下一个 agent，可用 `input_filter` 裁剪；`final_output` 作为产物 | 部分 | "Agents: LLMs configured with instructions, tools, guardrails, and handoffs"<br>"Handoffs are represented as tools to the LLM." |
| OpenAI Swarm | OpenAI（已被 Agents SDK 取代） | 无发行版（releases/latest 返回 404） | https://github.com/openai/swarm | 教学用最小多 agent 原语：Agent 加 handoff | Agent 只有 instructions 与 functions；handoff 由函数返回另一个 Agent 实现 | 无持久产物，"does not store state between calls"，数据靠 context_variables 传递 | 无 | "Swarm (experimental, educational)"<br>"Only the `instructions` of the active `Agent` will be present at any given time" |
| LangGraph | LangChain Inc. | PyPI `langgraph` 1.2.24 | https://github.com/langchain-ai/langgraph ；https://docs.langchain.com/oss/python/langgraph/overview | 低层编排框架，用图结构做有状态、可中断、可恢复的 agent | 不内建角色，节点函数加 State 决定各步做什么，supervisor 与子图自行搭建 | 图状态按 thread_id 存成 checkpoint，可回放与分支；Store 存跨线程长期记忆 | 部分 | "LangGraph's persistence layer gives agents short-term memory through checkpointers and long-term memory through stores."<br>"conversation continuity, human-in-the-loop workflows, time travel, and fault tolerance" |
| Superpowers | Jesse Vincent（obra） | v7.0.2 | https://github.com/obra/superpowers | 给编码 agent 一套强制工作流：构思、写计划、子代理实现、两段审查、收尾 | 协调者不实现，每个任务派全新 implementer 子代理；审查由协调者另派 task reviewer 与 whole-branch reviewer | 计划逐任务写 exact file paths、complete code、verification steps；进度写 `progress.md` ledger；审查报告分 spec 合规与代码质量两段 | 有 | "Fresh subagent per task + task review (spec + quality) + broad final review = high quality, fast iteration"<br>"Never skip the task review, and never accept a report missing either verdict" |
| claude-flow / Ruflo | ruvnet（Reuven Cohen） | v3.80.9 | https://github.com/ruvnet/ruflo | 面向 Claude Code 与 Codex 的 agent 元框架，提供编排、记忆、沙箱与控制 | 100+ 预置 agent；swarm 拓扑为 hierarchical、mesh、adaptive，hierarchical 由 Queen 主导 | HNSW AgentDB 存记忆；`ruflo verify` 用签名核对安装字节 | 部分 | "Agent = Model + Harness. The model writes; the harness gives it tools, memory, loops, sandboxes, and controls"<br>"Cryptographically prove your installed bytes match the signed witness" |
| Anthropic《Effective context engineering for AI agents》 | Anthropic | 文章，无版本号 | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | 说明 agent 推理时如何维护最小的、高信号的 token 集 | 不定义角色；子代理架构里主 agent 派子任务、只收回蒸馏摘要 | 产物为摘要、结构化笔记（NOTES.md、to-do 列表）与子代理返回的浓缩摘要 | 无 | "good context engineering means finding the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome"<br>"context rot" |
| Anthropic《Building effective AI agents》 | Anthropic | 文章，无版本号 | https://www.anthropic.com/engineering/building-effective-agents | 区分 workflow 与 agent，给出五种编排模式与三条设计原则 | 角色按 prompt 与工具划分；orchestrator-workers 与 evaluator-optimizer 中生成与评估分属不同调用 | 步骤间传中间结果；prompt chaining 可在步骤之间插入 programmatic checks 当 gate | 部分 | "Workflows are systems where LLMs and tools are orchestrated through predefined code paths."<br>"one LLM call generates a response while another provides evaluation and feedback in a loop" |

## MetaGPT

- 角色：Role 子类在 `__init__` 里用 `self.set_actions([...])` 声明可执行动作，用 `self._watch([UserRequirement])` 或 `self._watch([SimpleWriteCode])` 声明订阅哪些上游动作；README 写明内置产品经理、架构师、项目经理、工程师，SOP 把协作流程固定成动作序列。
- 产物：动作返回 `Message(content=code_text, role=self.profile, cause_by=type(todo))`，由 `Environment` 按 `cause_by` 广播给订阅该动作的角色；下游用 `self.get_memories()` 取上游消息继续加工。
- 避免自审自签：多智能体示例里有 SimpleReviewer 与其 `SimpleWriteReview` 动作，负责检查测试覆盖与质量；订阅关系写在代码里，仓库文档没给独立签收或门禁机制。
- 上下文：示例里 `context = self.get_memories(k=1)[0].content` 只取最近一条，注释写 "use the most recent memory as context"；也可 `self.get_memories()` 取全部记忆；`Team.run` 的 `n_round` 默认 5。
- 读取范围：GitHub README 全文、文档站 MultiAgent 101 页与 Agent Communication 页全文、PyPI 元数据。

## ChatDev

- 角色：1.0 以 CEO、CTO、Programmer 等职务角色组成 Virtual Software Company，通过 "specialized functional seminars" 完成设计、编码、测试、文档；2.0 的 YAML 图用 `agent` 节点声明 provider、model、prompt_template、tooling、thinking、memories。
- 产物：节点输出统一为 `List[Message]` 写入 `WareHouse/<session>/`，`context.json` 存上下文快照；1.0 的 Git mode 让 programmer 用 Git 管版本，提交即交接。
- 避免自审自签：1.0 的 Human-Agent-Interaction 让人扮演 reviewer 向 programmer 提意见；2.0 有 `human` 节点暂停等输入；另有 `make validate-yamls` 只检查 YAML 语法与 schema。
- 上下文：`passthrough` 节点默认只转发最后一条消息，用于上下文过滤；`literal` 节点注入固定内容；边条件（关键词、function、regex_extract）决定走哪条分支。
- 读取范围：GitHub README 全文、docs/user_guide 的节点类型页与执行页全文。

## AutoGen

- 角色：`AssistantAgent` 由 name、model_client、system_message、tools 定义，自述为 "kitchen sink" agent；团队预设 RoundRobinGroupChat（共享上下文轮流发言）、SelectorGroupChat（模型选下一个发言者）、MagenticOneGroupChat、Swarm（用 HandoffMessage 转交）。
- 产物：`TaskResult` 带 `messages` 与 `stop_reason`，`messages` 同时保留 agent 的思考过程与最终回复；`HandoffMessage` 表示控制权转交。
- 避免自审自签：文档给出 primary 加 critic 的 reflection 模式，critic 被要求回 APPROVE，团队用 `TextMentionTermination("APPROVE")` 结束；是否设 critic 由使用者决定，无强制门禁。
- 上下文：`BufferedChatCompletionContext(buffer_size=5)` 只保留最近 N 条消息，"useful to avoid context overflow in many LLMs"；`HeadAndTailChatCompletionContext` 留头尾，`TokenLimitedChatCompletionContext` 按 token 截断。
- 读取范围：文档站 AgentChat 的 overview、agents、teams、messages、model context、termination、human-in-the-loop 七页渲染正文（源文件是 .ipynb）。

## CrewAI

- 角色：Agent 的 role、goal、backstory 三者必填并决定行为，另有 llm、tools、allow_delegation；process 为 hierarchical 时由 manager 协调全队。
- 产物：Task 的 description 与 expected_output 必填，输出可用 output_pydantic、output_json 结构化，用 output_file 落盘，并自动传给下一任务。
- 避免自审自签：guardrail 在任务产出交给下一任务前校验，不通过把错误发回 agent 重试（guardrail_max_retries 默认 3）；hierarchical 的 manager "validating outcomes before proceeding"。
- 上下文：`respect_context_window=True` 时超限自动摘要；单次工具结果超过窗口 25% 时 agent 只收到预览与临时文件引用；同一工具同参数同结果连续 5 次即熔断。
- 读取范围：docs 的 agents、tasks、crews 三页全文，README 全文。

## Agent OS

- 角色：2.0 用 `roles/implementers.yml` 与 `roles/verifiers.yml`，每个 role 写明 standards 与 `verified_by`（由哪个 verifier 验证）；2.1 移除这套系统，改由 `agents/` 下子代理文件定义 spec-initializer、spec-shaper、spec-verifier、implementer、implementation-verifier、product-planner。
- 产物：`requirements.md`、`spec.md`、`tasks.md` 逐级落盘；实施前写 `orchestration.yml` 记录任务组、指派的子代理与 standards；实现者把 tasks.md 里对应项改成 `- [x]`。
- 避免自审自签：实现与验证分属不同子代理，implementation-verifier 独立核对 tasks.md、跑全量测试并写 `verifications/final-verification.html`；spec 校验在 2.1 改为"仍可调用"的可选子代理，不再自动触发。
- 上下文：standards 按任务组编译后随委派下发；1.1.0 引入条件加载与 `mission-lite.md`、`spec-lite.md` 精简副本，CHANGELOG 记作上下文效率提升 60-80%。
- 读取范围：README、CLAUDE.md、CHANGELOG 全文；shape-spec、write-spec、verify-spec、create-tasks-list、implement-tasks、orchestrate-tasks、verify-tasks、create-verification-report 与 implementation-verifier 全文。

## OpenAI Agents SDK

- 角色：Agent 由 instructions、tools、handoffs、output_type、guardrails 定义；编排有 agents as tools（经理 agent 保持控制权、把专家当工具调）与 handoffs（分流后专家接管本轮）两种。
- 产物：`final_output` 与运行结果对象；handoff 默认让新 agent 看到整段对话历史，可用 `input_filter` 只传需要部分，SDK 自带 `remove_all_tools` 等过滤器。
- 避免自审自签：input/output guardrail 返回 `tripwire_triggered` 为真即抛异常中止；tool guardrail 在执行前后包住每次函数工具调用；挂不挂 guardrail 由使用方配置。
- 上下文：guardrail 默认并行执行，可设 `run_in_parallel=False` 先检后跑；`nest_handoff_history` 把可摘要历史压成 assistant 摘要段；Session 自动管理跨轮对话历史。
- 读取范围：README、docs 的 multi_agent、handoffs、guardrails 三页全文。

## OpenAI Swarm

- 角色：Agent 只含 instructions 与 functions，没有角色系统；handoff 由函数返回另一个 Agent 实现。
- 产物：无持久产物，调用返回 Response（含 messages 与当前 agent）；README 写明 "does not store state between calls"。
- 避免自审自签：无 guardrail、无审查角色、无终止校验，只靠 `max_turns` 防死循环。
- 上下文：每次只放当前 agent 的 instructions，"Only the `instructions` of the active `Agent` will be present at any given time"；数据靠 context_variables 显式传递。
- 读取范围：README 全文（仓库无独立文档站），源码未逐行读。

## LangGraph

- 角色：不内建角色，节点函数加 State 决定各步做什么；supervisor、子图等分工模式由使用方自行搭建。
- 产物：图状态按 thread_id 存成 checkpoint，可回放、分支与恢复；Store 存跨线程长期记忆。
- 避免自审自签：无内建审查角色；`interrupt()` 可在节点里暂停并把 payload 交给调用方，恢复时用 `Command(resume=...)`，文档给的 approval_node 例子据此决定 `Command(goto="proceed")` 还是 `Command(goto="cancel")`。
- 上下文：checkpointer 管线程级短期状态，Store 管跨线程长期记忆；节点恢复时从头重跑，所以 interrupt 前只放幂等副作用，interrupt 调用顺序固定、不能包在 try/except 里；checkpoint 会无限增长，需清理或设保留策略。
- 读取范围：README、overview、persistence、interrupts 四页全文。

## Superpowers

- 角色：协调者不实现，每个任务派一个全新 implementer 子代理；审查由协调者另派 task reviewer（spec 合规加代码质量）与 whole-branch reviewer。
- 产物：计划逐任务写 exact file paths、complete code、verification steps；进度写 `progress.md` ledger，首行 `# SDD ledger — plan: <plan file path>`，完成行写 `Task <N>: complete (commits <base7>..<head7>, review clean)`。
- 避免自审自签：每个任务后必须两段审查，"Implementer self-review never replaces the task review"；implementer 不得自己派审查者，"A worker-spawned reviewer is a defect to flag, not rigor"。
- 上下文：派单 prompt 只带该任务需要的材料并"Hand artifacts over as files"；禁止让子代理读整份计划；审查者只拿 brief、report、review package 三个文件路径加全局约束。
- 读取范围：README、subagent-driven-development 与 requesting-code-review 两个 SKILL.md 全文。

## claude-flow / Ruflo

- 角色：100+ 预置 agent，按 swarm 拓扑组织，可选 hierarchical、mesh、adaptive；hierarchical 由 Queen 主导，共识用 Raft、Byzantine、Gossip。
- 产物：HNSW AgentDB 存记忆；`ruflo verify` 输出安装字节与签名 witness 的核对结果。
- 避免自审自签：`ruflo verify` 是供应链校验，核对安装字节而非审查工作产物；README 没给独立审查角色。
- 上下文：README 把 harness 定位为给模型工具、记忆、循环、沙箱与控制；12 个后台 worker 与 48 个插件承载任务与上下文。
- 读取范围：README 全文与 releases 元数据；仓库 docs/USERGUIDE.md 是 307KB 单文件，未通读。

## Anthropic《Effective context engineering for AI agents》

- 角色：不定义角色；子代理架构里主 agent 派子任务，子代理 "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)"。
- 产物：compaction 后的摘要、结构化笔记（NOTES.md、to-do 列表）、子代理返回的浓缩摘要。
- 避免自审自签：文章只讨论上下文维护手段，不涉及审查与签收流程。
- 上下文：主张 "finding the smallest possible set of high-signal tokens"；三种手段是 compaction、structured note-taking、sub-agent architectures；另提出 context rot 现象。
- 读取范围：文章正文全文（页面实际落在 /research/ 路径）。

## Anthropic《Building effective AI agents》

- 角色：角色按 prompt 与工具划分；orchestrator-workers 由主 LLM 拆任务给 worker，evaluator-optimizer 由两个 LLM 分别生成与评估。
- 产物：步骤之间传中间结果；prompt chaining 可在步骤之间插入 programmatic checks 作为 gate。
- 避免自审自签：evaluator-optimizer 把生成与评估分给两次调用，"one LLM call generates a response while another provides evaluation and feedback in a loop"。
- 上下文：三条原则是 simplicity、transparency（显式展示 agent 的规划步骤）、认真设计并测试 ACI；按任务可预测性在 workflow 与 agent 之间选择。
- 读取范围：文章正文全文。

## 未取得原文与仅取得摘要的项

- OpenAI Swarm 仓库没有独立文档站，只有 README；README 全文已读，核心源码未逐行读，因此 Swarm 的上下文细节只到 README 描述层面。
- claude-flow（Ruflo）只读了 README 全文与 GitHub releases 元数据，wiki 文档站未逐页读。
- AutoGen 官方文档源文件是 .ipynb，读的是渲染后的 HTML 正文，未读 notebook 源码。
- Agent OS 的命令正文按 single-agent 与 multi-agent 分目录，读的是 single-agent 版；multi-agent 版的 write-spec、create-tasks、implement-tasks 命令正文未读。
- LangGraph 读了 README、overview、persistence、interrupts 四页全文，human-in-the-loop 的细节页未读。
- MetaGPT 中文文档与 API 参考未读，只读英文教程两页与 README。
- 版本口径：MetaGPT 的 GitHub releases/latest 为 v0.8.1，PyPI 为 0.8.2，两处不一致，表内并列；Swarm 的 releases/latest 返回 404，按无发行版记录。
