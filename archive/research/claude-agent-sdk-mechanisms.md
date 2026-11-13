# Claude Agent SDK 机制研究：造另一个 Agent 框架时的参考笔记

> 研究对象：Anthropic **Claude Agent SDK**（原名 Claude Code SDK）+ 其底层的 Claude Code CLI
> 调研时间：2026-11-04 ｜ 调研者：research-super-agent（Team Lead 委派 task-12）
> 纠偏说明：用户澄清的"三种架构"= DSH / Codex CLI / **Claude Code SDK**。本报告研究第三个，即 `@anthropic-ai/claude-agent-sdk` / `claude-agent-sdk`。
> 目的：**不是产品介绍**，而是回答「自研 Go agent 框架时，哪些机制值得抄、哪些抄了会害死我」。
> 约束：只做调研与记录，不含实现代码，未安装任何依赖。

---

## 0. 先钉死事实边界（决定后面能不能信）

### 0.1 证据分级

| 标记 | 含义 |
|---|---|
| 〔A〕 | **官方文档明确**（`code.claude.com/docs/en/...` 的 Markdown 双生页，逐页抓取原文） |
| 〔B〕 | **官方文档给出的代码/路径确认**（文档里明确写出的包名、API 名、文件路径、环境变量名） |
| 〔C〕 | **二手/搜索级信息**（搜索结果标题、索引摘要，未直读正文） |
| 〔D〕 | **本报告作者的推断**（无原文背书，逐条标注） |

### 0.2 "Claude Code SDK" 现在叫什么（用户说的这个名字需要纠偏）

**它已改名为 Claude Agent SDK。** 这不是传闻，官方文档站里有专门的迁移页：

- 迁移页：`https://code.claude.com/docs/en/agent-sdk/migration-guide`，副标题原文是 "Guide for migrating the Claude Code TypeScript and Python SDKs to the Claude Agent SDK"〔A〕
- 两个官方包名（文档中直接出现）〔A〕〔B〕：
  - TypeScript：**`@anthropic-ai/claude-agent-sdk`**（要求 Node.js 18+，服务端使用）
  - Python：**`claude-agent-sdk`**（要求 Python 3.10+）
- 文档站也已迁移：旧的 `docs.claude.com` 现在会跨域重定向到 `platform.claude.com`（我实测抓取 `docs.claude.com/llms.txt` 直接报 cross-origin redirect）；**当前 Claude Code 文档的权威位置是 `code.claude.com/docs/en/...`**，且每页都有 `.md` 双生版本可直读〔A〕。

改名的**确切日期**我没有一手来源（搜索结果为 2025 年，属〔C〕），但"改名已发生"由迁移页存在可确证。

### 0.3 最关键的架构事实：**SDK 不是一个库，是一个子进程监管器**

这一条决定了一切后续设计，务必先理解。官方原文（[Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting.md)）：

> "The Agent SDK spawns and supervises a `claude` CLI subprocess that owns a shell, a working directory, and session files on disk. Hosting it is not like hosting a stateless API wrapper. **Every running agent is a long-lived process tied to local state.**"

具体机制〔A〕〔B〕：

| 事实 | 细节 |
|---|---|
| 你的代码调 `query()` | SDK **spawn 一个 `claude` CLI 子进程**，通过 **stdio** 与之通信 |
| 谁拥有资源 | **子进程**拥有 shell、工作目录、磁盘上的 JSONL 会话记录 |
| 一 session = 一子进程 | N 个并发 session = N 个子进程，各有独立进程树与 transcript 文件 |
| 二进制从哪来 | TS 与 Python SDK **都内置（bundle）一个 native Claude Code 二进制**，多数安装无需单独装 CLI；**二进制版本被钉在 SDK 包版本上**，所以"升级 SDK 就是升级 CLI" |
| 二进制位置 | TS 侧有 `pathToClaudeCodeExecutable` 可覆盖 |

**这跟 Codex 的形态不同**：Codex 是 Rust 单体 + app-server JSON-RPC 服务；Claude 是 **CLI 子进程 + stdio 协议**，SDK 只是薄封装。

### 0.4 对 Go 最重要的一条：官方已经指好了"非 TS/Python 语言"的路

[Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md) 原文：

> "To drive the same agent loop from a language other than Python or TypeScript, **run the CLI as a subprocess with the `-p` flag and `--output-format json`**."

也就是说，**Go 的"官方推荐接入方式"不是复刻 SDK，而是当 CLI 的调用方**。这给了自研框架一条低风险路径（详见 §9）。

### 0.5 版本坐标（判断设计是否已稳定）

文档中出现的版本号密度极高，说明系统在快速演进：

| 线索 | 版本 |
|---|---|
| 文档中反复出现的行为门槛 | Claude Code **v2.1.x**（如 v2.1.210 / 217 / 221 / 246 / 259 / 267 / 271 / 277 / 299 / 302 / 309 / 317） |
| TypeScript SDK | **v0.3.x**（如 v0.3.142 / 149 / 219 / 234 / 236 / 253 / 257 / 271 / 292 / 296 / 317） |
| Python SDK | **v0.2.x**（如 v0.2.127 / 140 / 153 / 177） |
| **已被移除**的实验 API | TypeScript SDK **V2 session API**（`createSession()` + `send`/`stream`）在 **v0.3.142 被移除**，官方让用 `query()` + session options 替代 |
| **已改变的语义** | 子代理工具名从 `"Task"` 改为 `"Agent"`（v2.1.63 之前 tool_use 也叫 `Task`）——**检测子代理必须同时匹配两个名字** |

> 〔D〕读法：**0.2.x → 0.3.x 之间发生过一次会话 API 整体推翻重来**（V2 removed）。这说明"会话/输入流"这一层是 Anthropic 自己也没定型的地方。**抄机制可以，抄 API 形状要极其谨慎。**

### 0.6 许可与使用限制（做产品必须先知道）

〔A〕[Overview](https://code.claude.com/docs/en/agent-sdk/overview.md)：

- 受 **Anthropic Commercial Terms of Service** 约束（包括你用它做产品卖给自己的客户）。
- **未经事先批准，Anthropic 不允许第三方开发者用 claude.ai 登录或 claude.ai 的 rate limits 给自己的产品（含基于 Claude Agent SDK 的 agent）**；第三方只能用 API key 认证。
- 品牌：可以叫 "Claude Agent" / "Powered by Claude"；**不允许**叫 "Claude Code" 或用 Claude Code 风格的 ASCII art。

> 〔D〕这条对"自研 Go 框架"的直接含义：**Claude Agent SDK 不能作为你产品的分发内核**（认证与品牌都受限）。可迁移的是**机制与设计**，而不是把它包一层对外卖。

### 0.7 一个容易被忽略的"命名陷阱"

Claude 生态里同时存在四个东西，功能不同〔A〕：

| 名称 | 是什么 |
|---|---|
| **Agent SDK** | 跑 Claude Code 二进制，带内置工具/权限/会话/hooks |
| **Claude Code CLI** | 终端交互界面 |
| **Client SDK** | 直接调 Claude API 的客户端（你自己写工具循环） |
| **Managed Agents** | Anthropic 托管的 agent harness（云端沙箱或自托管 sandbox） |

搜索"Claude Code SDK"很可能撞到 Client SDK 页面。**本文只谈 Agent SDK。**

---

## 1. Agent Loop

### 1.1 它怎么做

**核心抽象：`Session` → `Turn` → `Message`**，但真正暴露给调用方的是**五类消息组成的异步流**〔A〕[How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop.md)：

| 消息类型 | 何时产生 | 内容 |
|---|---|---|
| `SystemMessage` | 会话生命周期 | `subtype` 区分：`init`（会话元数据）、**`compact_boundary`（压缩边界）**、`informational`（状态横幅）、`worker_shutting_down` |
| `AssistantMessage` | Claude 的每个 content block | **一个 message 只带一个 content block**（文本或一次工具调用）；同一次响应的多条共享 message ID |
| `UserMessage` | 每次工具执行后 | 工具结果回灌；**以及你在 loop 中流入的用户输入** |
| `StreamEvent` | 仅在开启 partial messages 时 | 原始 API 流事件（文本增量、tool input 分片） |
| `ResultMessage` | loop 结束 | 最终文本、token usage、cost、session_id、`subtype` |

**主循环五步**〔A〕：

1. **Receive prompt** — 连同 system prompt、工具定义、对话历史一起送入；先 yield 一条 `init` 的 `SystemMessage`
2. **Evaluate and respond** — Claude 可能回文本、请求一个或多个工具调用，或两者兼有
3. **Execute tools** — SDK 执行每个工具并收集结果；**每批工具结果回灌给 Claude 做下一次决策**
4. **Repeat** — 2/3 循环，直到 Claude 产出**不含工具调用**的响应
5. **Return result** — 最后一条 `AssistantMessage`（纯文本）+ `ResultMessage`

**"Turn" 的定义很关键**〔A〕：一次 turn = 一趟循环（Claude 产出 + 若有工具调用则执行并回灌），**这一切在 SDK 内部完成，不把控制权交还你的代码**。loop 只在 Claude 产出无工具调用的响应时结束。

**终止条件与结果分类**〔A〕——这是设计 Go 框架时要照抄的一张表：

| `ResultMessage.subtype` | 含义 | `result` 字段可用？ |
|---|---|---|
| `success` | 正常完成 | 是 |
| `error_max_turns` | 撞 `maxTurns` | 否 |
| `error_max_budget_usd` | 撞预算上限 | 否 |
| `error_during_execution` | 执行被中断（如请求被取消） | 否 |
| `error_max_structured_output_retries` | 结构化输出重试耗尽 | 否 |

另有 `stop_reason` 字段：`end_turn` / `max_tokens` / `refusal`（模型拒答）/ `tool_deferred`（工具被 hook 延后）〔A〕。

**两个易错的边界行为**〔A〕：

- `maxTurns` 的计数是「**有工具调用的 turn + 1 个纯文本收尾 turn**」。所以 `maxTurns=2` 可能在做完第一步就被截断。
- **单发 `query()` 在 yield 出 error result 之后还会 raise 异常**（streaming input 模式则保持存活）。Go 里对应"返回 error 的同时也返回了结果结构"——两者都要给调用方。
- `ResultMessage` 之后可能还有少量尾随 system 事件（如 `prompt_suggestion`），**必须把流迭代完，不要见到 result 就 break**。

**并行工具执行**〔A〕：
- 只读工具（`Read`、`Glob`、`Grep`、标了 read-only 的 MCP 工具）**可并发**；
- 改状态的工具（`Edit`、`Write`、`Bash`）**串行**；
- 自定义工具**默认串行**，要并发必须显式标 `readOnlyHint`。

**两种输入模式**（这是 Claude 相对 Codex 最大的结构性差异）〔A〕[Streaming Input](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md)：

| | **Streaming Input**（官方推荐） | **Single Message Input** |
|---|---|---|
| 形态 | 持久交互会话，`prompt` 传一个**异步生成器** | 一次性 `query()` |
| 图像附件 | 支持 | **不支持** |
| 消息排队 | 支持（可中断） | **不支持** |
| 实时打断 | 支持 | **不支持** |
| 自然多轮 | 支持 | **不支持**（要靠 session resume） |
| 中途改配置 | 支持（`setModel` / `setPermissionMode` / `applyFlagSettings` / `updateSettings`） | 不支持 |
| 适用 | 长期在线 agent | lambda/CI 这类无状态环境 |

> 〔D〕这个"双模式"很值得抄：**同一套核心，暴露两个入口**——"一次性拿结果"和"流式持续交互"。Codex 也是这么做的（`thread.run()` vs app-server 事件流）。**两家独立收敛到同一结论，说明这是对的。**

**流式输入的实现细节**〔A〕：TypeScript 里 `query()` 返回的是**带方法的对象**（可 `await q.setPermissionMode(...)`），Python 里 `query()` 只是迭代器，要控制方法得用 `ClaudeSDKClient`。**"返回对象 vs 返回迭代器"是个真实的 API 设计岔路**：返回对象能挂控制方法，但状态更难推理；返回迭代器更纯粹，但要另一个 client 对象承载控制。Go 里对应"返回 struct 带方法" vs "返回 channel + 单独的 handle"。

### 1.2 值得借

1. **五类消息的划分**（system/assistant/user/stream/result）。它把"生命周期""模型输出""工具结果""原始增量""最终结果"彻底分开，每类消费者只订阅自己关心的。比"一个 event 结构带 type 字段"更清晰，也更容易做向后兼容。
2. **`compact_boundary` 是一个显式消息**。压缩不是一个隐形副作用，而是**流里可见的事件**——UI 可以提示"已压缩历史"，评测可以统计压缩次数。
3. **`maxTurns` 的计数口径写进文档**（含 +1 收尾 turn）。这种"把边界条件钉死"的做法省掉了大量用户困惑。
4. **单发模式 raise、流式模式存活**的不对称设计：承认了两种模式的生命周期不同，不强行统一。
5. **"迭代到流结束，不要在 result 处 break"**——承认 result 之后仍可能有事件。多数框架会在这里丢数据。
6. **只读工具并发、写工具串行，自定义工具默认串行需显式开启**。默认保守，把并发的责任交给工具作者。
7. **五种 result subtype 覆盖了"为什么停下"**，其中 `error_max_structured_output_retries` 尤其少见——承认了结构化输出会失败到放弃。

### 1.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **"turn 在 SDK 内部完成、不交还控制权"** | 这是流式输入的前提，但也意味着**你无法在 turn 中途插手**（只能通过 hooks）。Go 若要做细粒度调度（比如按 token 计费实时熔断），需要把 turn 拆成可观察的子步骤。 |
| **`AssistantMessage` 一个 message 只带一个 content block** | 这让消费方必须自己聚合"同一次响应"。好处是流式友好，坏处是**你得维护 message ID 分组逻辑**。Go 侧建议：要么在事件层聚合好再抛出，要么明确文档化这个契约。 |
| **`StreamEvent` 只在开启 partial messages 时出现** | 默认关闭意味着"想拿真流式必须记得开"。Go 里应反过来：**默认流式，需要时关**（因为 Go 的 channel 天然适合流）。 |
| **工具名 `Task` → `Agent` 的改名** | 官方文档明确说"为兼容各版本请同时匹配两个名字"。**别学这种命名漂移**——工具名是外部契约，改名要有别名期。 |
| **并行工具执行的判定靠 `readOnlyHint` 标注** | 标注是**声明**不是**验证**。一个错标 read-only 的写工具会被并发执行。Go 侧若做并发，建议**白名单**（明确枚举可并发工具）而非依赖工具自述。 |

---

## 2. 上下文工程

### 2.1 它怎么做

**(a) 自动压缩 + 手动压缩 + 可编程介入**〔A〕[Agent loop - Automatic compaction](https://code.claude.com/docs/en/agent-sdk/agent-loop.md)

- **自动**：当上下文接近上限时，SDK 自动压缩——**总结较早的历史**，保留最近的交换和关键决策。触发时在流里发 `system` 类型、`compact_boundary` 子类型的消息。
- **手动**：把 `/compact` 当普通 prompt 字符串发进去，即可按需触发。**命令就是普通 SDK 输入**（这个设计很省事：斜杠命令不需要专门协议）。
- **可编程介入**：`PreCompact` hook，能在压缩前执行自定义逻辑（如归档完整 transcript）。hook 收到 `trigger` 字段：`manual` 或 `auto`。
- **可定制摘要侧重**：官方明说 "**The compactor reads your CLAUDE.md like any other context**"——所以你可以在 CLAUDE.md 里写一节告诉压缩器该保留什么，**节标题是自由的、按意图匹配**。文档给的示例保留项：当前任务目标与验收标准、读过/改过的文件路径、测试结果与错误信息、已做的决策及理由。

**(b) 压缩的代价被明确写出**〔A〕

> "Compaction replaces older messages with a summary, so specific instructions from early in the conversation may not be preserved. **Persistent rules belong in CLAUDE.md rather than in the initial prompt, because CLAUDE.md content is re-injected on every request.**"

并且〔A〕：**项目根 CLAUDE.md 能在压缩后存活**——压缩后 Claude 会从磁盘重读并重新注入；子目录里的嵌套 CLAUDE.md 与带 `paths:` 的规则会在需要时重新按需加载。

**(c) 工具定义也吃上下文 → Tool Search 延迟加载**〔A〕[Scale to many tools](https://code.claude.com/docs/en/agent-sdk/tool-search.md)

这是 Claude 相对 Codex 更强的一块。官方给的量化理由：

- **50 个工具可占 10–20K tokens**；
- **工具选择准确率在加载超过 30–50 个工具后开始退化**。

机制：
- **默认开启**（有例外）。工具定义被**扣留**在上下文之外，agent 只拿到一份"可用工具摘要"，需要时**搜索**，默认**每次加载最相关的 5 个**工具进上下文。
- 加载进来的工具**在后续 turn 保持可用**，直到 SDK 压缩掉"发现这些工具的那些消息"；压缩后下次需要时**重新搜**。
- 代价：**每次搜索多一个往返**；对 <10 个工具且定义装得下的场景，**全量加载更快**。
- 控制旋钮 `ENABLE_TOOL_SEARCH`：不设/`true`（开，带模型回退）、`auto`（**定义达到上下文窗口 10% 时自动开启**）、`auto:N`（自定义百分比，`auto:5` = 5%）、`false`（关，每 turn 全量加载）。
- 上限：**目录最多 10,000 个工具**；每次搜索默认返回 5 个。
- 搜索匹配的是**工具名 + 描述**。官方给的可操作建议：`search_slack_messages` 比 `query_slack` 命中面更广；描述要含具体关键词。
- 还建议在 system prompt 里加一段**工具类别导航**（"You can search for tools to interact with Slack, GitHub, and Jira."），用 preset + `append` 注入。

**(d) 其它上下文预算手段**〔A〕

| 手段 | 细节 |
|---|---|
| 子代理隔离 | 子代理**只把最终回复**返回父级，中间工具调用与结果留在子代理内 → 父上下文只增长一条摘要 |
| 按 agent 裁剪工具 | `AgentDefinition.tools` 限定子代理最小工具集 |
| 调低 effort | `effort: "low"` 用于只需读文件/列目录的 agent，直接减少 token |
| 子代理自定窗口 | `autoCompactWindow`（100,000–1,000,000 tokens），仅 TypeScript SDK 有 |
| CLAUDE.md 尺寸约束 | 建议 **≤200 行**；**>4 MiB 直接整个跳过**；按需加载的子目录文件有字符上限（200K 窗口 = 40,000 字符；1M 窗口 = 200,000 或 150,000 字符，取决于模型） |
| MEMORY.md 读取上限 | **前 200 行或 25KB，先到者为准** |
| 提示词缓存 | 稳定前缀（system prompt、工具定义、CLAUDE.md）自动缓存；`cache_creation_input_tokens` / `cache_read_input_tokens` 在 result 上可读 |

**(e) 一个非常巧妙的缓存技巧**〔A〕[Modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts.md)

- `excludeDynamicSections: true`：preset 会把 **auto memory 的绝对路径**嵌进 system prompt（在 `append` 之前），导致不同用户/机器/检出**无法共享 prompt cache**。打开此选项后，**每用户上下文被移到第一条 user message**，system prompt 只剩静态部分 + 你的 append，于是**跨用户跨机器可共享缓存**。
  代价写得也很诚实：那段文本变成 user message，"指令在 user message 里的权重略低于 system prompt"，可能让 Claude **不那么一贯地遵守 auto memory 指引**。
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY`：TypeScript 可把 custom prompt 传成**字符串数组**，用这个标记隔开"静态部分"和"每次请求都变的部分"，两段各有独立 cache breakpoint。避免"改了 per-request 部分导致整段 prompt 缓存全失效"。

### 2.2 值得借

1. **压缩边界可观测**（`compact_boundary` 消息）+ **压缩可编程介入**（`PreCompact` hook 带 `manual`/`auto`）+ **压缩侧重可配置**（写在 CLAUDE.md 里，按意图匹配）。三层都留了接口，这是我见过最完整的压缩设计。
2. **"压缩器读 CLAUDE.md"** 这个设计极省事：不用新增配置项，复用既有上下文文件。
3. **"持久规则放 CLAUDE.md 而非首条 prompt，因为前者每次请求重新注入"** ——这一句解释了整个 CLAUDE.md 的存在理由。**压缩会吃掉 prompt，但吃不掉每轮重注入的文件。**
4. **Tool Search 的量化门槛**（50 工具 = 10–20K tokens；>30–50 工具准确率退化）与 `auto:N` 的百分比触发。这比"工具多了就加载慢"这种定性说法可操作得多。
5. **`excludeDynamicSections` 的思路**：把"每次不同的一点点"从 system prompt 里请出去，换取跨用户缓存命中。这是把**成本结构**而非**正确性**作为设计变量的范例。
6. **"搜索结果会随压缩失效、需要重搜"** 被明确写出——承认延迟加载与压缩的交互，不假装无状态。

### 2.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **压缩算法本身** | 文档只说"summarizes older history"，**没有披露具体策略**（是否保留工具结果原文？是否分块？）。这是黑盒，自研必须自己设计。**别以为"就是让模型总结一下"够用**——Codex 为这块写了 90KB 代码（见上一份报告）。 |
| **Tool Search 依赖服务端 beta** | 它底层是 Claude API 的 `tool_search` 能力（文档指向 platform 的 "Tool search in the API"），**不是纯客户端实现**。Go 框架若要自己做，得自己实现"工具描述检索"——那本质上是**对工具定义做 RAG**，需要索引与 embedding。 |
| **`auto` 阈值按"上下文窗口百分比"** | 这个口径依赖你能准确知道窗口大小与当前占用。Go 侧若接多 provider，窗口大小不统一，**百分比阈值会失真**。建议加一层"绝对 token 数"兜底。 |
| **CLAUDE.md ≤200 行的建议** | 这是经验值且偏小（一个真实项目的规范很容易超）。Go 框架里应改为**分段 + 路径作用域 + 硬上限**（Claude 自己也是这么补救的：`.claude/rules/` + `paths:` frontmatter）。 |
| **`/compact` 作为普通 prompt 字符串** | 简洁，但**把命令与内容混在同一通道**。后果是你没法区分"用户真的想让我执行 /compact 这个动作"还是"用户在讨论 compact 这个功能"。Go 侧建议命令走独立字段（Codex 的 `turn/steer` 是独立方法，更安全）。 |

---

## 3. 提示词工程

### 3.1 它怎么做

**(a) 三个起点 + 一个 append 层**〔A〕[Modifying system prompts](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts.md)

| 起点 | 你怎么写 | 得到什么 |
|---|---|---|
| **Minimal default** | 不设 `systemPrompt` | **只覆盖工具调用的最小提示**——`claude_code` preset 的其余内容**全部省略，包括其安全与安全指令** |
| **`claude_code` preset** | `{ type: "preset", preset: "claude_code" }` | Claude Code CLI 用的完整系统提示（含工具使用指引 + 安全指令） |
| **Custom string** | 直接给字符串 | 只发你写的内容 |

再加一个 `append` 字段，在 preset 之后追加你的指令——文档称这是 **"lowest-risk customization"**（"Nothing is removed"）。

> **一个必须警惕的坑**〔A〕：不设 `systemPrompt` 时，SDK 用的是 minimal default，**与 `claude -p` 的默认行为不同**（CLI 默认用 Claude Code 提示词）。从 CLI 迁移过来的人会莫名发现"行为变野了"——因为**安全指令没了**。

**四方案对比表**（官方给的，很有决策价值）〔A〕：

| 特性 | CLAUDE.md | Output Styles | preset + append | Custom prompt |
|---|---|---|---|---|
| 持久性 | 每项目文件 | 保存为文件 | 仅会话 | 仅会话 |
| 可复用 | 每项目 | 跨项目 | 代码重复 | 代码重复 |
| 默认工具 | 保留 | 保留 | 保留 | **丢失**（除非自己写进去） |
| 内建安全 | 维持 | 维持 | 维持 | **必须自己补** |
| 定制程度 | 只能新增 | 可新增、可略去编码指令 | 只能新增 | 完全控制 |

**(b) CLAUDE.md：四层作用域 + 拼接而非覆盖**〔A〕[How Claude remembers your project](https://code.claude.com/docs/en/memory.md)

**四层作用域**（文档按"从最宽到最具体"的加载顺序列出）：

| 作用域 | 位置 | 共享给 |
|---|---|---|
| **Managed policy** | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`；Linux/WSL `/etc/claude-code/CLAUDE.md`；Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | 组织内所有用户 |
| **User** | `~/.claude/CLAUDE.md` | 只有你（所有项目） |
| **Project** | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 团队（经版本控制） |
| **Local** | `./CLAUDE.local.md`（应进 .gitignore） | 只有你（当前项目） |

**加载规则（与 Codex 的 AGENTS.md 明显不同，别抄错）**〔A〕：

- **工作目录及其所有上级目录**的 `CLAUDE.md` / `CLAUDE.local.md` 在**启动时**加载；
- **子目录中的**文件**按需加载**——当 Claude **读、写或编辑该子目录中的另一个文件**时才加载（用 Bash 的 `cat`/`head` 单文件也算读）；
- **所有发现的文件被"拼接"进上下文，而不是互相覆盖**；
- 跨目录时，**从文件系统根到工作目录排序**——所以越靠近启动目录的指令**越晚读到**（越晚 = 越靠后）；
- 同一目录内，`CLAUDE.local.md` **追加在** `CLAUDE.md` **之后**；
- **块级 HTML 注释（`<!-- ... -->`）在被注入前剥掉**——可以给人类维护者留注而不花 token（代码块内的注释保留）；
- `claudeMdExcludes` 可排除特定文件（大 monorepo 里挡掉别人的 CLAUDE.md）；
- `--add-dir` 加的目录**默认不加载**其 CLAUDE.md，要 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` 才加载；
- 组织级 `claudeMd` 也可以直接写进 `managed-settings.json`，且**开发者无法排除（`claudeMdExcludes` 对它无效）**。

**(c) `.claude/rules/`：路径作用域规则**〔A〕

- 每个 `.claude/rules/*.md` 讲一个主题；**递归发现**，可分子目录；
- **无 `paths` frontmatter** 的规则**在启动时加载**，优先级与 `.claude/CLAUDE.md` 相同；
- **有 `paths` frontmatter** 的规则是**条件加载**——仅当 Claude 对匹配文件用 Read/Write/Edit（或用 Bash 单文件读）时才加载；
- 路径模式是 glob，支持 brace 展开（`src/**/*.{ts,tsx}`）；**整个 `paths` 列表共享 1,000 个展开模式 / 4 MiB 的预算**，超预算的模式**不展开使用**；
- frontmatter **只读 `paths` 一个字段**，其它字段**静默忽略**（不报错）。
- 用户级规则放 `~/.claude/rules/`，**先于项目规则加载**；**两者不互相覆盖**——冲突时 Claude 可能随便选一个（官方原话），所以要保持一致。

**(d) `@path` 导入 + 深度限制**〔A〕

- 语法 `@path/to/import`，相对路径**相对于包含它的文件**（不是 cwd）；
- **可递归导入，最大深度 4 跳**；
- 路径含空格要用反斜杠转义每个空格；**被引号包起来的路径不会被导入**（这个坑很隐蔽）；
- 解析**会跳过 Markdown 行内代码与围栏代码块**——所以 `` `@README` `` 是字面量，`@README` 才是导入；
- 项目级文件里的**外部导入**（解析到工作目录之外）**首次会弹审批框**；拒绝后导入保持禁用且不再弹。

**(e) AGENTS.md 互操作（这是 2026 年的重要变化）**〔A〕

- 默认值 `claude-md-or-agents-md`：**有 CLAUDE.md/CLAUDE.local.md 时读 CLAUDE.md，没有时读 AGENTS.md**；
- 可选 `claude-md-and-agents-md`（两者都读，每目录先 CLAUDE.md 后 AGENTS.md，已加载的 AGENTS.md 不重复读）、`claude-md`（只读 CLAUDE.md）、`managed-only`（只读组织级 + auto memory）；
- 设置方式：`/config` 的 **Project instructions**，或 settings 里 `pluginConfigs."cc-plugin-agents-md@builtin".options.instructionFiles`；
- 差异：通过该设置读的 AGENTS.md **不触发 `InstructionsLoaded` hook**；`--add-dir` 目录的 AGENTS.md **不加载**；
- `AGENTS.md` 支持需要 Claude Code **v2.1.277+**（部分场景 v2.1.281+）。

**(f) Output Styles**〔A〕

- Markdown 文件 + frontmatter，放 `~/.claude/output-styles/` 或 `.claude/output-styles/`；
- **`keep-coding-instructions: true`** 可保留 preset 的软件工程指令而只替换角色/语气；
- 激活：`/output-style <name>`、settings 里 `outputStyle`、或 SDK 的 `settings` 对象（注意：**`outputStyle` 不是顶层 Options 字段**，要放进 `settings`）。

**(g) 结构化输出**〔A〕：`outputFormat` 选项，支持 **JSON Schema / Zod / Pydantic**，在**多轮工具使用之后**返回校验过的 JSON。失败会重试，重试耗尽 → `error_max_structured_output_retries`。

**(h) 一个极其重要的架构真相**〔A〕：

> "CLAUDE.md content is delivered as **a user message after the system prompt**, not as part of the system prompt itself."

以及 `InstructionsLoaded` hook 可审计"哪些 CLAUDE.md / rules 文件被加载、何时加载、为什么"。还有 `OTEL_LOG_RAW_API_BODIES=file:<dir>` 可把真实请求体写盘以便核对。

### 3.2 值得借

1. **`preset + append` 的"只增不减"模式**。零风险定制，且保留了内建安全指令。这是给"我不确定要改多少"的用户的正确默认。
2. **四层作用域 + 拼接（而非覆盖）**。与 Codex 的"就近覆盖"不同，Claude 选择**全部拼接、靠顺序表达优先级**。好处是不会意外丢失上层规则；坏处是冲突时**行为未定义**（官方承认"Claude may pick one arbitrarily"）。
3. **`.claude/rules/` + `paths:` 条件加载**。这是比"一个大 CLAUDE.md"更可扩展的形态，而且它把"何时加载"绑定到**真实的文件访问事件**上，而不是靠模型判断相关性。
4. **`paths` 的预算上限**（1,000 模式 / 4 MiB）。防止有人写 `**/*` 把规则系统炸掉——这是很实际的防御。
5. **HTML 注释在注入前剥除**。零成本的"给人看但不给模型看"通道。
6. **`@path` 导入的 4 跳上限 + 外部导入审批**。承认导入是**代码执行面**（能读任意文件），所以有审批。
7. **AGENTS.md 互操作做成"可择优的开关"** 而非二选一硬切。迁移期非常实用。
8. **`keep-coding-instructions`**：输出风格可以只换人格不丢能力，比"整段替换"安全。
9. **结构化输出只约束最终结果**（多轮工具调用之后），不约束中间步骤。

### 3.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **minimal default 会丢掉安全指令** | 官方明说。这是**危险的默认值**：一个新用户不写 systemPrompt，就得到一个没有安全约束的编码 agent。Go 框架**不应有这个静默降级**——至少要 warn，或要求显式选择。 |
| **"拼接而非覆盖"导致冲突未定义** | 官方承认"Claude may pick one arbitrarily"。Go 侧若做配置系统，**应做确定性覆盖**（明确优先级 + 检测冲突并报警），而不是依赖模型自觉。 |
| **CLAUDE.md 作为 user message 注入** | 这意味着它**权重低于 system prompt**，且**占用 user 轮次**。Go 框架若把"项目规则"当第一等公民，应放进 system prompt 并接受缓存代价——**这是一次明确的权衡，别默认继承 Claude 的选择**。 |
| **四层作用域 + managed policy 的 OS 路径** | 这四条路径（macOS/Linux/Windows 各写死）是企业 MDM 产物。自研早期不需要，**先做 user/project 两层**。 |
| **`paths` frontmatter 静默忽略未知字段** | 拼错一个字段名毫无提示。Go 侧应**严格校验 + 报错**。 |
| **AGENTS.md 支持的一堆边界情况**（哪些 hook 触发、哪些目录不加载） | 这些是历史债务的痕迹（先有 CLAUDE.md，后有 AGENTS.md）。**新框架别制造两套指令文件**，选一套 + 兼容导入即可。 |

---

## 4. 记忆

### 4.1 它怎么做

Claude 的"记忆"是**三个不同系统**，必须分开看〔A〕：

| 系统 | 谁写 | 存在哪 | 用途 |
|---|---|---|---|
| **① 会话 transcript** | SDK 自动 | `~/.claude/projects/<encoded-cwd>/*.jsonl` | 续跑、分叉、审计 |
| **② CLAUDE.md（本轮 §3 已详述）** | 人 | 四层作用域 | 持久指令 |
| **③ Auto memory** | **Claude 自己** | `~/.claude/projects/<project>/memory/` | 从纠正与偏好中学习 |

#### ① 会话：resume / continue / fork 三态

〔A〕[Work with sessions](https://code.claude.com/docs/en/agent-sdk/sessions.md)

| 需求 | 用法 |
|---|---|
| 一次性任务 | 不用管，一次 `query()` |
| 同进程内多轮 | Python `ClaudeSDKClient` / TS `continue: true`（SDK 自己记 session） |
| 进程重启后接着上次 | `continue_conversation=True` / `continue: true`——**接当前目录最近的一个 session，不需要 ID** |
| 恢复**指定的**过去 session | 捕获 session ID 传给 `resume` |
| 试另一条路而不破坏原路 | `forkSession` |
| 无状态、不落盘 | TS `persistSession: false`；Python `CLAUDE_CODE_SKIP_PROMPT_HISTORY` |

**三条语义区别**（这是本节核心）〔A〕：
- **Continue**：找**当前目录最近**的 session。不需跟踪任何东西。适合一个 app 一次只跑一条对话。
- **Resume**：按 **ID** 恢复。多用户/多 session 必须用这个。
- **Fork**：**新建**一个 session，**以原 session 历史为起点拷贝**，原 session **不变**，fork 拿到**自己的新 ID**。

**存储路径与编码规则**〔A〕：`~/.claude/projects/<encoded-cwd>/*.jsonl`；`<encoded-cwd>` 是**把绝对工作目录里每个非字母数字字符替换成 `-`**（`/Users/me/proj` → `-Users-me-proj`）；转换名超 **200 字符**会**截断并追加 hash**。设了 `CLAUDE_CONFIG_DIR` 则看 `$CLAUDE_CONFIG_DIR/projects/`；`CLAUDE_CODE_PROJECT_DIR_NAME` 可自定义目录名。

**跨主机恢复的三条路**〔A〕：
1. 挂 `sessionStore` 适配器（SDK 把 transcript 镜像到你自己的对象存储/KV/DB）；
2. 搬 session 文件（把 `<session-id>.jsonl` 放到新主机 `~/.claude/projects/` 下任意目录）；
3. **别依赖 session resume**——把需要的产出（分析结论、决策、diff）当应用状态捕获，喂进新 session 的 prompt。**官方原话："This is often more robust than shipping transcript files around."**

**`SessionStore` 的双写语义（非常重要）**〔A〕[Hosting](https://code.claude.com/docs/en/agent-sdk/hosting.md)：

| 特性 | 行为 |
|---|---|
| 范围 | **只镜像 transcript**，不镜像 CLAUDE.md、不镜像工作目录产物 |
| 写入顺序 | **子进程先写本地磁盘**，SDK 再把每批副本转给 store（**mirror，不是 replacement**） |
| 全新 session | 本地 transcript **活得比这次 run 久** |
| 从 store 恢复的 run | **结束时删掉本地副本**，store 持有唯一持久副本 |
| 失败处理 | 投递失败 → **丢弃该批**，发一条 `{type:"system", subtype:"mirror_error"}` 消息，**query 继续**。官方要求"store 耐久性重要就对这个告警" |

**session 相关工具函数**〔A〕：`listSessions()` / `getSessionMessages()` / `getSessionInfo()` / `renameSession()` / `tagSession()`（TS 与 Python 各一套驼峰/下划线命名）。

**一条硬边界**〔A〕：
> "Sessions persist the **conversation**, not the filesystem."
文件改动要用 **file checkpointing**（`enableFileCheckpointing`）才能回滚。

#### ② Auto memory：Claude 自己写的项目记忆

〔A〕[How Claude remembers your project](https://code.claude.com/docs/en/memory.md)

**四种记忆类型**（写在记忆文件 frontmatter 的 `type` 字段）：

| type | 内容 |
|---|---|
| `user` | 你的角色、专长、工作偏好 |
| `feedback` | 你给的纠正、你确认过的做法 |
| `project` | 进行中的工作、截止时间、Claude 无法从代码或 git 历史推导出的决策 |
| `reference` | 项目外部信息在哪找（issue tracker、dashboard） |

**明确不记的**〔A〕：能从代码库推导的内容（架构、文件路径、调试修复）、CLAUDE.md 里已经写过的内容。且**不是每个 session 都记**——Claude 自己判断"未来对话是否用得上"。

**存储结构**〔A〕：

```
~/.claude/projects/<project>/memory/
├── MEMORY.md           # 索引，一行一条，每次会话加载
├── user_role.md        # 一条记忆
├── feedback_testing.md
└── ...
```

- **每个 git 仓库一个目录**（从 git repo 推导），所以**同仓库的所有 worktree 与子目录共享同一个 auto memory 目录**；
- 非 git 仓库则用项目根；
- `autoMemoryDirectory` 可改位置（须绝对路径或 `~/` 开头）；
- **机器本地**，不跨机器、不跨云环境；
- **`cleanupPeriodDays` 的清理扫描会排除 memory 目录**——MEMORY.md 与 topic 文件一直留着。

**加载规则（关键）**〔A〕：
- **`MEMORY.md` 的前 200 行或前 25KB（先到者为准）每次会话开始时加载**；超出部分**不加载**；
- **topic 文件（`user_role.md` 等）启动时不加载**——Claude 需要时用标准文件工具去读；
- 写 MEMORY.md 后 SDK 会**测量文件是否接近上限**，接近就提醒 Claude 缩短（一行一条、细节移入 topic 文件、合并或删除过时条目）；
- **超过上限时写入仍成功，但会返回错误要求 Claude 重写索引**——因为"下次加载时超出部分会被丢掉"；
- 若记忆文件带 YAML frontmatter，SDK 会写入 **`modified` 字段（ISO 8601 时间戳）**，让"这条信息多新"对人和模型都可见。

**子代理与 auto memory**〔A〕：
- **主对话的 auto memory 不会加载进子代理**（fork 例外，fork 继承父对话与 system prompt）；
- 子代理可**有自己的** auto memory，通过 `AgentDefinition.memory` 字段（`'user' | 'project' | 'local'`）启用，是**独立目录**。

**开关**〔A〕：`/memory` 里的 toggle 写 `autoMemoryEnabled` 到 `~/.claude/settings.json`；项目级可设 `autoMemoryEnabled: false`；环境变量 `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`。

> **一个重要的运维坑**〔A〕：在某些会话里（**后台 session**、**由另一个 Claude Code session 启动的 session**，如 Claude 通过 Bash 跑 `claude`），toggle **显示 `off · can't be turned on here`**——必须在终端直接跑 `claude` 才能开。

**审计**：`/memory` 列出并打开所有记忆文件；`/context` 看哪些 CLAUDE.md/rules 在启动时加载了；`InstructionsLoaded` hook 可记录加载来源。

### 4.2 值得借

1. **continue / resume / fork 三态分明**，且"continue 不需要 ID"这个简化很聪明——单用户场景零管理成本。
2. **fork 语义写得很干净**：新 ID、拷贝历史、原 session 不变。而且明确"fork 的是对话历史，不是文件系统"。
3. **SessionStore 的 dual-write 语义被完整定义**：谁先写、谁持有唯一副本、失败怎么办、如何告警。**这是分布式持久化设计的范本**——尤其"失败就丢这批并继续、但要告警"的取舍，比"失败就整个失败"更符合实际。
4. **`mirror_error` 是一条可见消息**，不是静默日志。让上层能感知"我的耐久性出了问题"。
5. **MEMORY.md 索引 + topic 文件分离**，且**索引有硬读取上限（200 行/25KB）**、超限时**写入仍成功但返回错误要求重写**。这是"用错误消息驱动文件结构演进"的巧妙手法。
6. **记忆带 `modified` 时间戳**。让"信息新鲜度"成为模型可读的一等信息。
7. **明确"不记能从代码推导的东西"**。这条负向规则比任何正向规则都重要——它防止记忆膨胀成代码库的劣质副本。
8. **auto memory 按 git 仓库聚合（worktree 共享）**。符合开发者直觉。
9. **记忆目录被排除在 retention 清理外**。记忆比 transcript 更长寿，符合语义。
10. **官方直接说"跨主机别依赖 resume，把产出当应用状态传"**。承认了这一层的脆弱性。

### 4.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **`<encoded-cwd>` 用"非字母数字换 `-`"** | 这个方案**有碰撞风险**（`/a/b-c` 与 `/a-b/c` 都变成 `-a-b-c`），且超 200 字符要截断+hash，查找逻辑变复杂。Go 侧建议**用 cwd 的 hash 作目录名**，另存一份可读映射。 |
| **`~/.claude/projects/` 全局单一根** | 多租户下是灾难（Claude 自己也承认，hosting 文档专门给出 per-tenant `CLAUDE_CONFIG_DIR` 方案）。**新框架应第一天就做成可配置根 + 显式租户隔离**。 |
| **auto memory 用"Claude 自由写 markdown"** | 灵活，但**不可版本化、不可 diff 审查、难回滚**。Claude 自己也只能靠"超限报错"来约束结构。Go 侧建议**结构化存储（每条记忆 = 一条记录 + type + citations + modified）**，导出成 markdown 只是视图。 |
| **MEMORY.md 200 行/25KB** | 对多项目/大型代码库明显不够，且**超出部分静默丢弃**（虽然写入时报错，但读取端就是不给你）。**这是"静默数据丢失"式设计**，Go 侧应改为分页/分层索引。 |
| **`include_turns` 之类 diff 不明确的恢复语义** | Claude 这里没有 Codex 那种 `include_turns=False` 的细粒度（Codex 有）。若你需要"恢复但不回灌历史"，得自己做。 |
| **把 transcript 当 JSONL 文件** | 简单、可 grep，但**并发写、部分写、跨主机同步都很难**。Codex 用 SQLite（单写者+事务）在这一点上更强。**这是 Claude 明显弱于 Codex 的地方。** |

---

## 5. RAG（有就写）

### 5.1 结论：**没有内置的向量 RAG**

这是一个**否定性结论**，我特地去证了：

| 检查项 | 结果 | 证据 |
|---|---|---|
| 官方文档索引（`code.claude.com/docs/llms.txt`，全量目录）有无 RAG / embeddings / vector / 检索增强页 | **无** | 〔A〕全量索引逐条核对 |
| Agent SDK 的工具清单里有无检索类工具 | 只有 `Grep`、`Glob`（**文件/文本搜索**，不是语义检索） | 〔A〕[Agent loop - Built-in tools](https://code.claude.com/docs/en/agent-sdk/agent-loop.md) |
| 有无索引构建/更新流程 | **无** | 〔A〕 |
| `ToolSearch` 是不是文档检索 | **不是**——它是**对工具定义**做检索（§2.1c），不是对文档/代码 | 〔A〕[Tool search](https://code.claude.com/docs/en/agent-sdk/tool-search.md) |

**代码检索怎么做的**〔A〕：靠 agent 自己调 `Grep`（正则搜内容）、`Glob`（按模式找文件）、`Read`（读文件）。**检索策略在模型决策里，不在索引里。**

**那它有什么"检索"？** 三类，都不是 RAG：

1. **Agent 驱动的检索**：`Grep`/`Glob`/`Read`，由模型决定搜什么。
2. **WebSearch / WebFetch**：外部网页检索与抓取（内置工具）。
3. **MCP**：把外部数据源接成工具（数据库、issue tracker、文档系统）。**这是"接数据"而不是"建索引"**——语义检索能力由 MCP server 自己提供（如某个 MCP 提供 `search_docs`），SDK 不管。

**Tool Search 是一个"借用 RAG 思路但对象不同"的机制**〔D〕：它确实是"检索 + 按需加载 + 结果有上限（5 个）+ 结果会随压缩失效"。**把"文档"换成"工具定义"，就是一套 RAG。** 这个类比对你设计框架很有用（见下）。

### 5.2 值得借

1. **"先不做 RAG"这个决定**。对代码 agent，`Grep`+`Read` 在**精确性与可解释性**上通常优于向量检索（无索引陈旧、结果可复现、能直接看到原文）。代价是几轮工具调用。
2. **Tool Search 的整套模式可直接移植到文档检索**〔D〕：摘要索引 + 按需检索 + 每次返回 Top-N（默认 5）+ 已加载项在后续 turn 复用 + 随压缩失效重取 + 百分比阈值自动开启。**这就是一个经过生产验证的 RAG 外壳**，只是它检索的是工具而非文档。
3. **把外部检索能力推给 MCP**。SDK 不实现语义检索，而是让生态提供。这是**划边界**而非**造能力**。

### 5.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **完全不索引** | 当代码库极大（百万行级）或需要跨仓库/跨文档检索时，纯 `Grep` 会退化成多轮试探，**token 成本可能高于向量检索**。**建议：默认无 RAG，但预留 `Retriever` 接口 + 一个 no-op 实现**，触发条件用可观测信号（如同一路径被 grep 超过 N 次）而不是拍脑袋。 |
| **Tool Search 依赖服务端 beta** | 见 §2.3。Go 侧自建需要自己的索引与 embedding。 |
| **MCP 优先** | 适合"接别人已有的检索服务"，不适合"我要为私有代码库建索引"。 |

---

## 6. 评测（有就写）

### 6.1 结论：**没有公开的 SWE-bench 类基准；但有一个真实可用的 eval 框架 `claude plugin eval`**

**(a) 没有公开基准**（这是我的判定，标〔D〕）

文档全量索引里**没有 benchmark / SWE-bench / 能力评测页**；SDK 文档也没有"我们的分数"这类内容。**本报告不给出任何 SWE-bench 分数**，因为我没有一手来源。

**(b) 但有 `claude plugin eval` ——一个设计得相当好的 agent 行为评测框架**〔A〕[Test plugins with evals](https://code.claude.com/docs/en/plugin-evals.md)

这是本节真正的收获。要点：

| 维度 | 设计 |
|---|---|
| 命令 | `claude plugin eval <target>`；`claude plugin eval init` 会**交互式地帮你生成用例**（读你的插件、问什么算好结果、提出正/负例 prompt、设计 grader、试跑一次验证 grader 可用、再写文件） |
| 目录 | `evals/<case>/prompt.md` + `graders/<name>.md`（可选 `case.yaml`） |
| 跑法 | 每个 case **在一个全新、隔离的非交互 session** 里跑，**只加载你的插件** |
| **默认跑 3 次** | 因为"one run of a non-deterministic agent tells you little"；case 分数 = 各次均值 |
| 计分 | 一次 run 的分数 = 通过 grader 的比例（可加权）；case 通过 = 分数 ≥ `--threshold`（默认 **1.0**） |
| **六种 grader** | `regex`、`tool_used`、`tool_order`、`file_exists`（**纯本地计算，零额外成本**）、`llm`（judge 模型三投二中）、`baseline`（与参考 transcript 比"至少一样好"） |
| **无插件基线** | 同一 case **不带插件再跑一遍**，得到 `WITH` / `W/OUT` / **`Δ`**。"If a case scores 1.0 both with and without the plugin, the plugin isn't what made it pass." |
| 成本 | **每次 run 与每次 judge 都是真实模型调用**；输出 `COST` 为 list-price 估算 |
| CI | `--threshold` 控制退出码；`--json` 输出结构化结果；按 case 分数判定 |
| 隔离 | 每次 run 有**临时 home + 临时工作目录 + 临时 Claude Code 配置**；以 `claude -p` 子进程跑；**用户设置/CLAUDE.md/MCP/其他插件/记忆/技能全不加载**；**case 定义对被测 agent 隐藏**；大部分 shell 环境变量被扣留 |
| Mock | MCP server 可 mock：`evals/mocks/<server>/<tool>.md`，body 是返回内容，frontmatter 可 `expect:` **校验输入**（违反则 run 直接 0 分并记原因）、`error: true` 返回工具错误、`type: agent` 让 judge 扮演 server；`_tools.json` 可导入真实 `tools/list`；**agent mock 的回答可录制到 `.replay/` 供 CI 复用**（零模型调用） |
| 安全 | `scaffold_script` **在你自己的权限下、沙箱之外**运行，只在 `--scaffold` 时执行 → 官方明确"只对你或你组织写的 suite 传这个 flag"；git < 2.31 直接拒绝运行（因为它要靠 `GIT_CONFIG_COUNT` 关掉仓库的 git hooks） |
| 明确局限 | 跑过的 suite **不能证明插件安全**（"a suite that passes says nothing about whether the plugin is safe"）；managed policy 仍会限制 run；Artifact 工具被关；除 shell 命令外无网络沙箱 |

**几个设计得特别对的地方**〔A〕：

- **"高分数本身不能说明插件有用"** → 强制引入 no-plugin baseline 与 `Δ`。这是评测设计里最常被忘掉的一步。
- **grader 排除机制**：两臂跑时，某些 grader（如 `tool_used: Skill`）在 without 臂**永远不可能通过**，会计入会**人为抬高 Δ**。所以官方**在两臂都把它排除出分数**，只在 with 臂作为指示器报告。可用 `arm: both` / `arm: with-only` 覆盖。
- **"Δ 为负但 tool_used 通过 → 先怀疑 judge"**：官方建议先换更强 judge（`--judge-model sonnet`）并收紧 rubric，而不是急着改插件。**这是对"用小模型当裁判"风险的诚实提示。**
- **grader 选型建议**：长输出用 `regex` 对文件内容打分（每次都一样），`llm` 只用于短输出且 rubric 要写成具体 PASS/FAIL；每个 case 至少一个"结果" grader + 一个"过程" grader（`tool_used`/`tool_order`）。
- **`skill-creator` 插件有另一套 `evals/evals.json` 格式**，两者**互不读对方的文件**——承认了第二套工具的存在但没统一（〔D〕这是技术债）。

**(c) 内建的自验证习惯**〔A〕：
- `/goal`：设一个**完成条件**，Claude 一直干到条件满足、或模型判定不可能、或你需要修复的错误清掉 goal；
- `/code-review`、`ultrareview`（多 agent 云端深度评审）；
- `TaskCreate` / `TaskUpdate` / TodoWrite 让进度可被外部渲染（`todo-tracking` 文档）。

### 6.2 值得借

1. **`WITH` / `W/OUT` / `Δ` 三列**。这是"证明改动有价值"的最小结构。任何提示词/工具/hook 改动都该这么测。
2. **默认跑 3 次取均值**，并明确"单次运行说明不了什么"。
3. **六种 grader 的分层**：零成本的确定性 grader（regex/tool_used/tool_order/file_exists）打底，昂贵的 `llm` grader 只做语义兜底。**成本与信号强度分离**。
4. **grader 排除机制（`scored: false`）**。会污染对比的 grader 要在两臂都排除——这个细节 99% 的评测框架没做。
5. **`expect:` 在 mock 层校验输入**。这不只 mock 返回值，还**断言 agent 发出的请求长什么样**——测试"agent 是否正确地调用了工具"，而不只是"最终答案对不对"。
6. **mock 录制回放（`.replay/`）**。把非确定性 judge 的回答固化成 fixture，让 CI 可重复且零成本。**这是把"非确定性测试"变成"确定性测试"的标准手法**。
7. **case 定义对被测 agent 隐藏**（run 不能读 `evals/` 目录）。防止 agent 读到评分标准后作弊——**这是 agent 评测独有的威胁模型**，多数人想不到。
8. **隔离的彻底性**：临时 home/cwd/config + 只加载被测插件 + 环境变量 allowlist。让"这个 case 只测这个插件"成为真命题。
9. **对"suite 通过 ≠ 插件安全"的明确声明**。不越界承诺。
10. **`--json` + `--threshold` 的 CI 集成**（退出码驱动）。

### 6.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **它是"插件"评测，不是"模型/框架"评测** | case 的粒度是"这个 skill 会不会被触发、产出对不对"。要评"框架本身好不好"需要自建任务集（10–30 个可自动判定的真实任务）。 |
| **`llm` grader 三投二中** | 便宜但不稳。官方自己也承认"judge 可能把格式不同但正确的答案判错"。Go 侧若做严肃评测，应**优先确定性 grader**，LLM judge 只做辅助并记录 judge 版本。 |
| **`--threshold` 默认 1.0** | 意味着默认"任何 case 不完美就算失败"。真实场景几乎必然要调低或分子集。 |
| **依赖 git ≥ 2.31 关 git hooks** | 这是个很深的细节：跑不可信代码前要禁掉仓库配置能启动的程序。**Go 侧做同类隔离时要抄这个思路**（`GIT_CONFIG_COUNT` / `core.hooksPath` / `credential.helper` 全要关）。 |
| **`scaffold_script` 在沙箱外跑** | 官方靠"只对你信任的 suite 传 `--scaffold`"来约束。**这是把安全责任转移给用户**——Go 侧若做同类功能，建议默认进沙箱。 |

---

## 7. Planner / 子代理 / 编排

### 7.1 它怎么做

**(a) 没有专门的 "planner 工具"，规划是四种东西的组合**〔A〕

| 机制 | 形态 | 说明 |
|---|---|---|
| **`permissionMode: "plan"`** | 权限模式 | Claude**探索并制定计划但不改源码**；文件编辑**永不自动批准**，一律走 `canUseTool` 回调 |
| **`/plan`** | 斜杠命令 | 在动手前先调查并给出方案（[Prompting](https://code.claude.com/docs/en/prompting.md) 提到；`$plan` skill 也可显式调用） |
| **内建 `Plan` agent** | 专用子代理 | 文档提到内建 `Explore` 与 `Plan` agent，且它们**是一次性的、不返回 `agentId`**（所以不能 resume） |
| **任务追踪工具** | `TaskCreate` / `TaskUpdate`（旧称 TodoWrite） | 让"进度"成为**结构化可渲染数据**；文档 `todo-tracking` 专门讲怎么从 tool call 渲染进度 |
| **`/goal`** | 完成条件 | 设一个条件，Claude 一直干到**条件满足 / 模型判定不可能 / 错误清除 goal** |

**plan 模式的三个精确边界**（这几条特别值得抄）〔A〕：
- 在 plan 模式下，**即使 allow 规则匹配、即使 `PreToolUse` hook 返回 `allow`，文件编辑仍不自动批准**，一律走 `canUseTool`；
- **plan 模式对子代理也生效**：主 session 在 plan 模式时，子代理即使 `AgentDefinition.permissionMode: "acceptEdits"` **仍以 plan 模式运行**——"so that handing work to one doesn't get around reviewing the plan first"（**防止用委派绕过计划审阅**，这是很深刻的设计）；
- auto mode 可用时，规划阶段 Claude 跑的命令**默认不进你的回调**，由 auto 分类器审。

**(b) 子代理：三种定义方式 + 一个完整的定义结构**〔A〕[Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents.md)

**三种创建方式**：
1. **程序化**（SDK 推荐）：`agents` 选项传 `AgentDefinition`；
2. **文件系统**：`.claude/agents/*.md`（会被 watch，几秒内生效）；
3. **内建 `general-purpose`**：即使你不定义任何 agent，Claude 也能调它。

**`AgentDefinition` 字段全集**（这张表是本节干货）〔A〕：

| 字段 | 类型 | 作用 |
|---|---|---|
| `description` | string（必填） | **告诉 Claude 何时该用这个子代理**（自然语言） |
| `prompt` | string（必填） | 子代理的 system prompt |
| `tools` | string[] | 允许的工具名。**省略 = 继承所有子代理可用工具**；列了就**只**有这些（工具不在其 session 里，Claude 不会看到提示或错误） |
| `disallowedTools` | string[] | 移除工具；支持 MCP 级模式 `mcp__server` / `mcp__server__*` / `mcp__*` |
| `model` | string | 模型覆盖；接受别名（`fable`/`opus`/`sonnet`/`haiku`/`inherit`）或完整 ID |
| `skills` | string[] | 启动时**预加载**的技能；**最多前 32 个不同名字**生效 |
| `memory` | `'user' \| 'project' \| 'local'` | 该 agent 的记忆源 |
| `mcpServers` | 数组 | 该 agent 可用的 MCP 服务器 |
| `initialPrompt` | string | 当此 agent 作为**主线程**运行时自动提交的第一轮（作为子代理时忽略） |
| `maxTurns` | number | 上限；撞上限时输出**标记为 partial**，可 resume 续跑 |
| `autoCompactWindow` | number | 100,000–1,000,000，仅 TS SDK |
| `background` | boolean | 作为**非阻塞后台任务**运行 |
| `omitClaudeMd` | boolean | 不把 CLAUDE.md 放进该 agent 初始上下文（managed policy 仍加载），仅 TS SDK |
| `effort` | `low\|medium\|high\|xhigh\|max` 或 number | 该 agent 的推理强度 |
| `permissionMode` | PermissionMode | 该 agent 的工具执行权限模式（**受继承规则约束**） |

**子代理继承什么（这张表最重要）**〔A〕：

| 子代理**拿到** | 子代理**拿不到** |
|---|---|
| 自己的 system prompt（`AgentDefinition.prompt`）+ Agent 工具的 prompt 字符串 | **父对话历史** |
| 项目 CLAUDE.md（经 `settingSources` 加载） | **父的工具结果** |
| 工具定义（继承父级或 `tools` 子集） | **预加载的技能内容**（除非列在 `AgentDefinition.skills`） |
| 主会话的 extended thinking 配置 | **父的 system prompt** |

> 官方原话："The only content you pass from parent to subagent is **the Agent tool's prompt string**"——所以要**把文件路径、错误信息、决策都写进那个 prompt**。

**前台 vs 后台**〔A〕：**默认后台**（Agent 工具结果显示 `status: "async_launched"`，报告在后续 turn 到达）；Claude **在下一步需要这份报告时会等待**，此时调用阻塞并返回 `status: "completed"`。可用 prompt 要求"等待"，或用 `background: true` 强制后台。

**规模上限（三把闸）**〔A〕：

| 闸 | 环境变量 / 选项 | 默认 | 到限行为 |
|---|---|---|---|
| **深度** | `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` | **3 层**（`1` = 子代理不能再派生） | 底层子代理**无法派生**，只好自己做 |
| **并发** | `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` | **20 个** | 拒绝派生，返回 `Concurrent subagent limit reached` |
| **花费** | `maxBudgetUsd` / `max_budget_usd` | 无 | 三重生效：拒绝派生（`Budget limit reached`）、**停掉仍在跑的后台子代理**、以 `error_max_budget_usd` 结束 query |

**resume 子代理**〔A〕：子代理 transcript **独立文件存储**，独立于主对话持久化。程序化 resume 三步：捕获 `session_id` → 从 Agent 工具结果文本里**正则提取 `agentId: <id>`** → 下一轮 `resume: sessionId` 并在 prompt 里带上 agent ID。**内建 `Explore`/`Plan` 不返回 agentId，所以不可 resume**。

**(c) 一个非常独特的机制：子代理输出的"指令形态扫描"**〔A〕

v2.1.210+，父级读子代理最终消息**之前**，Claude Code 会扫描"指令形状"的模式，分三类处理：

| 模式 | 处理 |
|---|---|
| **控制标签模仿**（如 `<system-reminder>` 块） | **原地中和**——在开尖括号后插一个反斜杠，**不删除任何内容** |
| **权限配置提及**（`.claude/settings.json`、`bypassPermissions`、`--dangerously-skip-permissions`） | **原样保留** |
| **轮次标记**（行首 `Human:` 或 `Assistant:`） | 在冒号前插反斜杠，使其**不能模仿对话轮次边界** |

对控制标签/权限配置命中，会在前面加一行 `[harness: ...]` 标记命中的模式；轮次标记不加标记行。**"这些是扫描做的唯一修改：它从不删除或改写子代理的文本。"**

> 〔D〕这是个**极其精巧的权限提升防御**：子代理的文本会回到父上下文，如果子代理被提示词注入污染，它可以伪造 `<system-reminder>` 或假扮对话轮次来劫持父级。中和是**最小侵入的**（加反斜杠），保留了可读性也保留了审计价值。

**(d) Hooks：约 30 个事件 + 一套六步权限求值**〔A〕[Hooks](https://code.claude.com/docs/en/agent-sdk/hooks.md)

**事件清单（按用途归类）**：

| 类别 | 事件 |
|---|---|
| 工具 | `PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`PostToolBatch`（TS only） |
| 提示 | `UserPromptSubmit`、`UserPromptExpansion`（TS）、`MessageDisplay`（TS） |
| 停止 | `Stop`、`StopFailure`（TS） |
| 子代理 | `SubagentStart`、`SubagentStop` |
| 压缩 | `PreCompact`、`PostCompact`（TS） |
| 模型切换 | `PreModelSwitch`（TS，**可阻断**）、`PostModelSwitch`（TS） |
| 权限 | `PermissionRequest`、`PermissionDenied`（TS） |
| 会话 | `SessionStart`（TS）、`SessionEnd`（TS）、`Setup`（TS） |
| 团队/任务 | `TeammateIdle`、`TaskCreated`、`TaskCompleted`（TS） |
| MCP | `Elicitation`、`ElicitationResult`（TS） |
| 配置/环境 | `ConfigChange`、`InstructionsLoaded`、`WorktreeCreate`、`WorktreeRemove`、`CwdChanged`、`FileChanged`、`DirectoryAdded`（均 TS） |

**注意**：**Python SDK 缺很多事件**（`SessionStart`/`SessionEnd` 等在 Python 只能作为 settings 里的 shell 命令 hook）。

**matcher 是对"事件过滤字段"的正则**——工具类事件匹配**工具名**（`"Write|Edit"`、`"^mcp__"`）；`Notification` 匹配通知类型；**`Stop` 完全忽略 matcher**。

**hook 的返回结构**〔A〕：

| 字段 | 层 | 作用 |
|---|---|---|
| `permissionDecision` | `hookSpecificOutput`（PreToolUse） | `allow` / `deny` / `ask` / **`defer`** |
| `permissionDecisionReason` | 同上 | 告诉模型为什么 |
| **`updatedInput`** | 同上 | **改写工具入参**（配 `allow` 自动批准，配 `ask` 给人看；**配 `defer` 会被忽略**） |
| `additionalContext` | `hookSpecificOutput`（PostToolUse） | 往工具结果后面追加信息 |
| **`updatedToolOutput`** | 同上 | **替换工具输出**再给模型看 |
| `systemMessage` | 顶层 | **给用户看**（不是给模型） |
| `continue` / `continue_` | 顶层 | 是否继续 |
| `async: true` + `asyncTimeout` | 顶层 | **异步 hook**：agent 立刻继续不等待；**异步输出无法阻断/修改/注入上下文** |

**多 hook 同事件的决策优先级**〔A〕：**`deny` > `defer` > `ask` > `allow`**（注意 `defer` 高于 `ask`，这不直观）。

**超时**〔A〕：默认 **600 秒**；`UserPromptSubmit`/`PreModelSwitch`/`PostModelSwitch` **30 秒**；`MessageDisplay` **10 秒**；`SessionEnd` 有 **1.5 秒**的关闭预算。超时后**取消 hook 并丢弃其输出，会话继续**。**PreToolUse 超时 → 阻断工具调用**（v2.1.210 前会当成"用户拒绝"，导致无人值守会话卡住）。

**失败语义**〔A〕：默认**回调抛异常 → 动作照常进行**，发一条 `hook_callback_failed` 的 informational 消息。要阻断必须显式 `onFailure: "block"`。**`onFailure` 在 `Stop`/`SubagentStop`/`TaskCompleted`/`TeammateIdle` 上被忽略**。

**(e) 六步权限求值顺序**（这是整个安全模型的骨架）〔A〕[Configure permissions](https://code.claude.com/docs/en/agent-sdk/permissions.md)

```
1. Hooks            → 可 deny 或放行；返回 allow 也不能跳过后面的 deny/ask 规则
2. Deny rules       → 命中即拒；即使 bypassPermissions 也不调回调；hook 返回 allow 也没用
3. Ask rules        → 命中则走 canUseTool；即使 bypassPermissions 也会走
4. Permission mode  → bypassPermissions 批一切（except critical-path rm）；acceptEdits 批文件操作；plan 把编辑送回调
5. Allow rules      → 命中则批准（含工具自身即可批准的调用，如工作目录内读文件）
6. canUseTool       → 兜底回调；dontAsk 模式跳过此步直接拒
```

**六个权限模式**〔A〕：

| 模式 | 行为 |
|---|---|
| `default` | 无基于模式的自动批准；需要批准的调用若未匹配 allow 规则 → 走 `canUseTool`（**无回调即拒**） |
| `dontAsk` | **把任何本该提示的调用变成拒绝**，不调 `canUseTool`；但 `allowed_tools` / settings 允许的调用、以及 `default` 模式下本就无需批准的调用照常运行。**另有五类即使有 allow 规则也被拒**：需要用户交互的工具（`AskUserQuestion`、标 `requiresUserInteraction` 的 MCP 工具）、`always_ask` 自定义工具、网络路径读、被识别的 critical-path 删除、组织设为 `ask` 的 connector 工具 |
| `acceptEdits` | 自动批准文件编辑 + `mkdir`/`touch`/`rm`/`rmdir`/`mv`/`cp`/`sed`（**仅限工作目录或 `additionalDirectories` 内**；触碰受保护路径、critical path、或 `touch` 带选项/glob/前缀时不批） |
| `plan` | 探索但不改；文件编辑永不自动批准 |
| `auto` | **模型分类器**审命令与网络请求；切到不支持的模型时**降级为 `default`** |
| `bypassPermissions` | 全部批准；**root/`sudo` 下拒绝启动**（除非在受认可沙箱内）；**`allowed_tools` 不约束它**（要挡必须用 `disallowed_tools`） |

**一个反直觉的警告被官方反复强调**〔A〕：
> "**Auto-approved tools never reach `canUseTool`.**" 任何一个在前序步骤被批准的工具调用**都不经过你的回调**——你写在 `canUseTool` 里的检查会被静默绕过。
TS SDK 甚至会为此发一条 Node 进程警告 `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`。

**"没有任何模式会自动批准"的动作**〔A〕（安全底座）：
- 被识别为 **critical path** 的 `rm`/`rmdir`（如 `rm -rf ~`）；
- 被标记 `Dangerous rm operation not ruled out` 的命令（且**`Bash` 或 `Bash(*)` 规则也批准不了它**）；
- **从网络路径读文件**；
- 组织设为 `ask` 的 connector 工具；
- 标了 `_meta["anthropic/requiresUserInteraction"]` 的 MCP 工具；
- `always_ask` 的自定义工具。

**(f) 动态工作流（大规模编排）**〔A〕：`Workflow` 工具（TS SDK v0.3.149+）——把编排**移进一个脚本**，由运行时在**对话上下文之外**执行，用于"几十到几百个 agent"的场景。配套文档 [dynamic workflows](https://code.claude.com/docs/en/workflows.md) 与博客《A harness for every task: dynamic workflows》。

### 7.2 值得借

1. **`plan` 模式对子代理也生效**（防止用委派绕过计划审阅）。这一条直接解决"我把活包给 subagent 就绕过了人工审批"的漏洞，**绝大多数多 agent 框架没考虑**。
2. **`AgentDefinition` 的字段设计**：`description` 决定"何时用"、`prompt` 决定"怎么做"、`tools` 决定"能碰什么"、`model`+`effort` 决定"多贵"、`maxTurns`+`autoCompactWindow` 决定"多大"。**把"能力/成本/边界"三个维度都做成了声明式字段**。
3. **子代理"新鲜上下文"的诚实定义**：只传 Agent 工具的 prompt 字符串这一个通道。**显式、可预测、无隐式耦合**。
4. **三把闸（深度 3 / 并发 20 / 花费上限）**，且花费到限时**主动停掉仍在跑的后台子代理**。这是"预算必须有牙齿"的范例。
5. **子代理输出的指令形态扫描**：最小侵入（插反斜杠，不删文本）+ 分类处理 + 加 `[harness: ...]` 标记。**这是"上下文即信任边界"的具象化防御。**
6. **六步权限求值顺序被完整文档化**，包括"hook 返回 allow 也不能跳过 deny 规则"这种反直觉细节。
7. **`updatedInput` / `updatedToolOutput`**：hook 能**改写入参与出参**，这让"脱敏、重定向、注入凭据"都能在 hook 层做，而不必改工具。
8. **多 hook 冲突的确定性优先级**（deny > defer > ask > allow）。
9. **"没有任何模式会自动批准"的清单**（critical path rm、网络路径读、requiresUserInteraction、always_ask）。**这是白名单式安全**：默认拒绝，特例显式列出。
10. **`auto` 模式降级时的可见性**（发 `system` + `status` 消息 + `permissionMode: "default"`）。权限发生变化必须让上层知道。
11. **hook 的"失败默认放行、要阻断需显式声明"**——与多数人的直觉相反，但对可用性是正确的（避免一个坏 hook 把整个 agent 卡死）。

### 7.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **30 个 hook 事件** | 这是产品演化出来的，不是设计出来的（TS 有、Python 没有，明显是逐个加的）。**Go 侧先做 5–6 个核心事件**（PreToolUse / PostToolUse / Stop / PreCompact / UserPromptSubmit / SubagentStop），留扩展点。 |
| **TS/Python 事件不对等** | 明显的技术债。**别学"一个语言支持多点"**——会让用户写不可移植的代码。 |
| **`canUseTool` 会被静默绕过** | 官方只发一条警告。**Go 侧应把"权限检查"与"批准回调"分成两个概念**：前者保证每次都跑，后者只在需要时跑。别让用户误以为回调是唯一钩子。 |
| **`bypassPermissions` 无视 `allowed_tools`** | 这个语义很容易让人踩坑（配了白名单却全放开）。**Go 侧两个开关不该互相覆盖**，要么合并语义、要么拒绝同时设置。 |
| **plan 模式把编辑送 `canUseTool`** | 合理，但**在无人值守（无回调）场景下等于全部拒绝**——这其实是好事，但要文档写清。 |
| **子代理 resume 靠从文本里正则提 `agentId`** | 太脆。**Go 侧应把 agentId 放在结构化字段/事件里**，而不是塞在给模型看的文本中。 |
| **`Workflow` 工具的脚本执行** | 文档只说"a script Claude writes and you rerun"，**脚本语言、沙箱、能力边界都没披露**（〔D〕推测与 TS 同栈）。**不要照抄一个你不了解执行模型的机制。** |
| **`/goal` 的"模型判定不可能"** | 把"放弃"的决定权交给模型，且**终止条件不透明**。Go 侧建议 goal 终止条件**可程序断言**（复用 §6 的 grader 思路），而不是让模型自我裁定。 |

---

## 8. 长程任务

### 8.1 它怎么做

**(a) 权限模式**：见 §7.1e（六模式 + 六步求值）。这里补长程视角的三个细节〔A〕：
- **`acceptEdits` 只管工作目录内**，跨目录要 `additionalDirectories`；
- **`additionalDirectories` 只授予文件访问，不授予配置访问**（文档专门有一句 "Additional directories grant file access, not configuration"）；
- `bypassPermissions` **在 root/`sudo` 下直接拒绝启动**（除非在受认可沙箱内）。

**(b) 沙箱**：见 llms.txt 索引中的 [Configure the sandboxed Bash tool](https://code.claude.com/docs/en/sandboxing.md) 与 [Choose a sandbox environment](https://code.claude.com/docs/en/sandbox-environments.md)。SDK 侧有 `sandbox` 选项（TS/Python 参考页有 `sandbox-configuration` 小节），以及 [Secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment.md) 讲隔离与凭据管理。
〔A/待核实〕：我**没有直接读 sandboxing 正文**，因此**不声称其具体 OS 机制**（Linux 用 bubblewrap、macOS 用 Seatbelt 等属搜索级印象，标〔C〕/待核实）。

**(c) 断点续跑**：§4.1 已详述（continue / resume / fork / sessionStore / persistSession:false）。补一条：**file checkpointing**（`enableFileCheckpointing`）可把文件改动回滚到任意先前状态——**session 存对话、checkpoint 存文件，两者正交**。

**(d) 预算**〔A〕：

| 维度 | 机制 |
|---|---|
| 轮数 | `maxTurns` / `max_turns`（**0 = 不限制**） |
| 花费 | `maxBudgetUsd` / `max_budget_usd`（**`0` 被 CLI 直接判为非法金额，session 根本不跑**） |
| 花费如何计算 | **模型响应返回后才比较**（成本来自响应携带的 token usage） |
| **超支 headroom** | 官方明确：**达到上限的那次响应仍会完成并计入** `total_cost_usd`，**子代理仍在跑的也会花掉一些**，所以**实际花费可能超过 cap 一个响应 + 子代理尾巴的成本** → "设 cap 时留出余量" |
| 子代理花费 | **计入** query 的 `total_cost_usd` |
| 到限行为 | 拒绝再派生、**停掉后台子代理**、以 `error_max_budget_usd` 结束 |
| 重置 | **`/clear` 重置预算** |
| 流式输入下 | max-turns 计数**每条排队消息重新开始**；budget **跨消息累积**，一旦达限后续消息都以 `error_max_budget_usd` 结束 |
| 其它 | `effort`（low→max）直接影响每 turn token；`model` 切换会**重算整个未缓存对话**（每个模型有自己的 prompt cache） |

**(e) 成本与用量追踪**〔A〕（`cost-tracking` 文档 + agent-loop）：
- `ResultMessage` 带 `total_cost_usd`、`usage`、`num_turns`、`session_id`——**所有 subtype 都带**，所以出错也能记账与续跑。
- **`usage` 只覆盖主 agent loop**；要整棵树（含子代理）用 `modelUsage` / `model_usage`。
- **session 崩溃后的 result 是 `error_during_execution`，其 cost 字段可能归零、`stop_reason` 为 `null`**，且进程随后退出 → 有专门的 "Recover totals after a session crash" 小节。
- cache token 字段：`cache_creation_input_tokens` / `cache_read_input_tokens`。

**(f) 后台任务与主动推送**〔A〕：
- 子代理**默认后台运行**（`status: "async_launched"`）；
- **Channels**：用 MCP server **把消息、告警、webhook 推进运行中的 session**（"Forward CI results, chat messages, and monitoring events so Claude can react while you're away"）——这是"事件驱动 agent"的官方通道；
- `/loop` 与 cron 调度工具可在 session 内重复跑 prompt、轮询状态、设一次性提醒；
- **scheduled tasks / routines**：云端按计划或 GitHub 事件运行；
- **`/goal`**：设完成条件后持续工作。

**(g) 托管形态（对"长程"最关键的一节）**〔A〕[Hosting](https://code.claude.com/docs/en/agent-sdk/hosting.md)

**四种会话模式**：

| 模式 | 形态 | 适合 |
|---|---|---|
| **Ephemeral** | 每个任务建容器，完成即毁 | 一次性任务（bug 修复、文档抽取、翻译） |
| **Long-running** | 常驻容器，一容器多 SDK 进程 | 持续在线 agent（邮件分诊、聊天机器人） |
| **Hybrid** | 短命容器 + 启动时从 `SessionStore` 水化 + 回写 | 跨多次交互但中间空闲（个人项目经理、深度研究） |
| **Multi-agent container** | 一容器内多个 SDK 子进程协作 | 多 agent 模拟、紧耦合协作 |

**资源与扩展**〔A〕：
- 起点：**1 GiB RAM / 5 GiB 磁盘 / 1 CPU 每 agent**（**是地板不是天花板**，内存随 session 长度与工具活动增长）；
- 公式：`agents per host = (host RAM - overhead) / (per-session RAM ceiling)`，**ceiling 要实测峰值 RSS**；
- 水平扩展：long-running 模式下用 **`sessionId` 的一致性哈希**把会话钉到某个容器（从而钉到同一个子进程）；
- **成本真相**：官方原话 "**Anthropic token cost typically dominates container infrastructure cost by an order of magnitude or more.**"（容器约 $0.05/小时，而一个长 session 可花数美元 token）。

**多租户隔离（五件套）**〔A〕：

| 措施 | 做法 |
|---|---|
| 关设置 | `settingSources: []` / `setting_sources=[]` |
| 关自动记忆 | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`（**关键**：auto memory 在 `~/.claude/projects/<project>/memory/`，**无视 `settingSources` 加载进 system prompt**） |
| 独立配置目录 | `CLAUDE_CONFIG_DIR` 指向 per-tenant 目录（避免共享 `~/.claude.json` 全局配置） |
| 独立工作目录 | 每个 `query()` 显式传 `cwd` |
| 独立出口策略 | per-tenant 出站 IP / 凭据 / 域名白名单，避免一个租户借另一个的出站策略外泄 |

**已知限制（官方自己列的）**〔A〕：

| 限制 | 应对 |
|---|---|
| **没有顶层 session 超时**（session 不会自己超时） | 用 `maxTurns` 兜 |
| 长 session 内存增长 | 限制 session 长度或周期性回收 subprocess |
| **大规模并行子代理扇出会撞 rate limit** | 拆成小批次，别一次性宽扇出 |
| **没有 per-subagent wall-clock deadline** | 子代理只能用 `maxTurns`；`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` 只是"停止产出"的停滞看门狗，**不是总时长上限** |

**(h) 可观测性**〔A〕：SDK **继承环境里的 OpenTelemetry 配置**——在容器/编排层设 `CLAUDE_CODE_ENABLE_TELEMETRY=1`（traces 另需 `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`）、`OTEL_TRACES_EXPORTER` / `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER`、`OTEL_EXPORTER_OTLP_PROTOCOL`、`OTEL_EXPORTER_OTLP_ENDPOINT`。**默认导出里不含 prompt 文本与工具入参**（opt-in 才有）。

**(i) 凭据管理（三段式）**〔A〕：
- **Anthropic API**：子进程从环境读 `ANTHROPIC_API_KEY`，从 secret manager 注入，或 `ANTHROPIC_BASE_URL` 指向**在容器外注入 key** 的代理；
- **入站**：认证放在 agent 容器**前面**的网关，**agent 不该是校验用户 token 的组件**；
- **出站工具**：**把工具凭据留在 agent 环境之外**，走代理在请求离开容器后再注入。

### 8.2 值得借

1. **预算的诚实性**：明确写出"可能超支一个响应 + 子代理尾巴"并要你留余量。**多数框架假装 cap 是硬上限。**
2. **`maxBudgetUsd = 0` 直接拒绝启动**（而 `maxTurns = 0` 是不限制）——两个相似的选项对 0 的解释不同，但都写清了。
3. **所有 result subtype 都带 cost/usage/session_id**——出错也能记账能续跑。**这是可恢复性的基础。**
4. **`usage`（主 loop）与 `modelUsage`（整棵树）分离**。承认"你以为的成本"和"真实成本"不是一回事。
5. **Hybrid 会话模式 + SessionStore**：为"跨多次交互但中间空闲"这个真实场景给出了明确方案（而不是逼你在 ephemeral 与 long-running 之间二选一）。
6. **一致性哈希按 `sessionId` 钉容器**——简单、正确、无需共享状态。
7. **"token 成本比容器成本高一个数量级"** 这句话直接决定了优化优先级：**先优化 token，别优化机器**。
8. **多租户五件套**，尤其"**auto memory 无视 settingSources**"这个坑——不写下来没人能想到。
9. **已知限制里包含"没有 per-subagent wall-clock deadline"**。承认"我们没做这个"，并给出替代（stall watchdog ≠ deadline）。
10. **凭据三段式**（入站/模型/出站工具分别处理），且明确"agent 不该校验用户 token"。
11. **遥测默认不含 prompt 与工具入参**（opt-in）。

### 8.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **子进程 = session 的模型** | 直接后果：**资源按并发 session 数线性增长**（1 GiB/session），冷启动与内存都是问题。**Go 天然适合"一个进程内多 goroutine 多会话"**——这是 Go 框架相对 Claude 形态的**结构性优势，别放弃它去抄子进程模型**。 |
| **没有 session 超时** | 官方自己也列为限制。Go 侧应**默认有 wall-clock 超时**。 |
| **无 per-subagent deadline** | 同上，应补。 |
| **预算"软上限"（可超支一个响应）** | 对成本敏感场景不够。Go 侧可在**响应前**用累计 token 预估做硬熔断，代价是可能误杀。**两种都要提供，让调用方选。** |
| **混合云/沙箱的具体实现** | `secure-deployment` 与 `sandbox-environments` 我只读了索引未读正文。**具体隔离技术（gVisor/Firecracker/bubblewrap）属待核实**。 |
| **Channels（MCP 推事件进 session）** | 依赖 MCP 生态与特定协议契约（`channels-reference` 有专门规范）。Go 侧自建更简单：直接给自己留一个 `InjectEvent` 接口。 |
| **三层凭据代理架构** | 需要基础设施（网关/代理）。早期**先做"凭据放环境变量 + 容器隔离"**，别一上来搭代理。 |

---

## 9. 可迁移到 Go 的机制清单

> 说明：**按"不做什么会返工"排序**。复杂度 L/M/H 相对 3–5 人月的 Go 项目。**只给形状，不含实现代码。**

### 9.0 先做一个战略选择（这决定后面全部）

Claude 的形态给了 Go 两条路，**必须先选**：

| 路线 | 做什么 | 适合 | 风险 |
|---|---|---|---|
| **A. Go 作为 CLI 的调用方** | spawn `claude -p --output-format json`（官方指明的非 TS/Python 接入方式），或直接用 stream-json | 想快速拿到能力、不想重写 loop | 依赖外部二进制、按 Claude 计价、**不能作为对外产品内核**（§0.6 认证与品牌限制） |
| **B. Go 原生实现 loop** | 自己写循环 + 自己接模型 API | 要自主可控、要接多 provider | 要自己解决压缩、权限、会话、并发——即本报告全部内容 |

> 〔D〕建议：**B 为主线，A 作为"验证设计"的参照实现**。先用 A 跑通若干真实任务，把 §6 的 eval 框架搭起来；再按 B 重写，用同一套 eval 证明"自研不差于参照"。**这是唯一能在早期就知道自己有没有跑偏的方法。**

### 9.1 第一优先（不做会返工）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G1** | **消息五分类 + 结果五态** | 事件类型：`System{Subtype}` / `Assistant{ContentBlock}` / `User{ToolResult}` / `Stream{Delta}` / `Result{Subtype, Usage, Cost, SessionID}`；result subtype 照抄那五态（success / max_turns / max_budget / error_during_execution / max_structured_output_retries） | L |
| **G2** | **"迭代到流结束，不在 result 处 break"** | 事件 channel 只在**所有事件发完后** close；不要发完 Result 就 return | L |
| **G3** | **`maxTurns` 口径钉死**（有工具调用的 turn + 1 收尾） | 写进文档与单测；这是最容易产生"为什么少跑一步"投诉的地方 | L |
| **G4** | **双入口：一次性 vs 流式** | `Run(ctx, prompt) (Result, error)` + `Stream(ctx, <-chan Input) (<-chan Event, Handle, error)`；**共用同一核心**，别写两套 | M |
| **G5** | **六步权限求值顺序** | 纯函数：`(toolCall, rules, mode, hooks, callback) → Decision`；顺序照抄 hooks→deny→ask→mode→allow→callback；**deny 规则在 bypass 模式下仍生效** | M |
| **G6** | **"没有任何模式自动批准"的清单** | 内置：critical-path 删除、网络路径读、requiresUserInteraction 工具、always_ask 工具 → **永远走人工/回调** | L |
| **G7** | **`/compact` 可触发 + `compact_boundary` 可观测 + `PreCompact` 可介入** | 压缩是三件事：**策略**（何时压）、**事件**（压了要发消息）、**钩子**（压前能做事） | M |
| **G8** | **持久规则与一次性 prompt 分离** | 每轮重注入的"项目规则文件" vs 只出现一次的对话内容；**压缩只吃后者** | L |
| **G9** | **session 三层语义 continue/resume/fork** | `Continue()`（当前目录最近）/ `Resume(id)` / `Fork(id)`（新 ID + 拷贝历史 + 原不动） | M |
| **G10** | **持久化格式选 SQLite 而非 JSONL** | Claude 用 JSONL 是弱点（并发写/部分写/跨主机同步都难）。**Go 用单写者 + 事务的 SQLite 更稳**（Codex 就是这么做的，见上一份报告任务-10） | M |

### 9.2 第二优先（决定体验与安全上限）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G11** | **plan 模式对子代理同样生效** | 权限模式是**会话级继承属性**，子代理不能"降级"自己的模式去绕过主会话的 plan | L |
| **G12** | **子代理上下文"只有一个通道"** | 父→子只传 **prompt 字符串**；子→父只传 **最终报告**。别偷偷塞历史（会不可预测且吃掉隔离收益） | L |
| **G13** | **子代理三把闸** | 深度（默认 3）/ 并发（默认 20）/ 花费上限；**到花费上限要主动停掉在跑的子代理** | M |
| **G14** | **子代理输出的指令形态中和** | 对回传文本做最小侵入处理：中和控制标签（插反斜杠）、转义轮次标记（`Human:`/`Assistant:`）、加 `[harness:]` 标记；**不删不改原文** | M |
| **G15** | **`updatedInput` / `updatedToolOutput`** | hook 能改写工具入参与出参（脱敏、重定向、注入）→ 不用改工具实现 | M |
| **G16** | **多 hook 决策优先级**（deny > defer > ask > allow） | 确定性归并，不能靠注册顺序 | L |
| **G17** | **hook 失败默认放行 + 显式 `onFailure: block`** | 反直觉但可用性正确；**超时语义要按事件分别定义**（PreToolUse 超时=阻断，PostToolUse 超时=继续） | M |
| **G18** | **Tool Search 式延迟加载**（若工具会超 ~30 个） | 摘要索引 + Top-N 检索（默认 5）+ 已加载项跨 turn 复用 + 压缩后失效重取 + 百分比阈值自动开启 | H |
| **G19** | **`@path` 导入 + 深度上限 + 外部导入审批** | 导入是**读任意文件**的能力，要有界（4 跳）与审批（跨工作目录） | M |
| **G20** | **路径作用域规则（`paths` glob + 加载预算）** | 规则带 glob 条件，**仅在匹配文件被访问时加载**；整个规则集共享展开预算（防 `**/*` 炸掉） | M |
| **G21** | **AGENTS.md / CLAUDE.md 互操作开关** | 别造第三种文件名；提供"用 A 还是 B 还是都用"的显式开关 | L |
| **G22** | **`WITH` / `W/OUT` / `Δ` 三列评测** | 每个改动的 eval 必须带 **no-干预基线**；否则你证明不了改动有价值 | M |
| **G23** | **六种 grader 分层** | 零成本确定性 grader（regex / tool_used / tool_order / file_exists）打底 + `llm` 只做语义兜底；**默认跑 3 次取均值** | M |
| **G24** | **grader 排除机制（`scored: false`）** | 在"无干预臂必然失败"的 grader 要在两臂都排除，否则会人为抬高 Δ | L |
| **G25** | **eval 用例对被测 agent 隐藏** | run 不能读 eval 目录（防 agent 读到评分标准后作弊）——**agent 评测独有的威胁模型** | L |
| **G26** | **mock 的 `expect:` 输入断言 + 录制回放** | 不只 mock 返回值，还**断言 agent 发出的请求**；非确定性回答录成 fixture 供 CI 复用（零成本可重复） | M |
| **G27** | **隔离运行（临时 home/cwd/config + 只加载被测物 + 环境变量 allowlist）** | eval 与多租户共用同一套隔离原语 | M |
| **G28** | **子代理记忆独立**（`memory` 字段） | 主记忆不自动进子代理（fork 例外）；子代理可自带独立记忆目录 | M |

### 9.3 第三优先（生产化）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G29** | **预算三件套 + 软硬两种上限** | `maxTurns`（0=不限）/ `maxBudget`（0=非法）/ 到限三动作（拒派生、停后台子代理、以专属 subtype 结束）；**额外提供"硬熔断"选项**（响应前按累计 token 预判） | M |
| **G30** | **所有 result 都带 cost/usage/sessionID** | 出错也能记账与续跑 | L |
| **G31** | **`usage`（主）与 `modelUsage`（整棵树）分离** | 两个字段，别混 | L |
| **G32** | **SessionStore dual-write 语义** | 本地先写 → 镜像到外部 → 失败**丢批并继续**但发 `mirror_error` 事件；从外部恢复的 run 结束删本地副本 | M |
| **G33** | **session 与文件 checkpoint 正交** | 会话存对话、checkpoint 存文件；**两者独立 API** | M |
| **G34** | **多租户五件套** | 关设置源 / 关自动记忆 / 独立配置目录 / 独立 cwd / 独立出口策略；**特别注意"记忆无视设置源"这类隐藏加载路径** | M |
| **G35** | **凭据三段式** | 入站=网关验；模型=代理注入；出站工具=代理注入；**agent 环境里不放任何密钥** | M |
| **G36** | **OTel 继承环境变量** | 容器/编排层设 OTEL_*，进程直接读；**默认不导出 prompt 与工具入参** | M |
| **G37** | **known limitations 文档化** | 明确写"没有 session 超时""没有 per-subagent deadline""token 成本主导"——**比假装完备更能建立信任** | L |
| **G38** | **显式 wall-clock 超时**（补 Claude 的缺） | session 级 + 子代理级都要有；stall watchdog 只是补充，不能替代 | L |
| **G39** | **启动即校验配置语义** | `maxBudget=0` 应拒绝启动而不是静默跑；选项间冲突（如白名单 + 全放开）应报错 | L |

### 9.4 明确不要抄的

| 别抄 | 原因 |
|---|---|
| **SDK = 子进程监管** | 这是 TS/Python 的运行时约束产物。**Go 用 goroutine 能做"一进程多会话"**，资源效率高一个量级。这是你的优势，别放弃。 |
| **JSONL 当会话存储** | 并发/部分写/跨主机都难。用 SQLite 或 append-only log + 索引。 |
| **`<encoded-cwd>` 用"非字母数字换 `-`"** | 有碰撞风险且超长要截断+hash。用 cwd 的 hash 做目录名。 |
| **30 个 hook 事件且两语言不对等** | 先做 5–6 个核心事件。 |
| **minimal default 静默丢掉安全指令** | 危险默认值。 |
| **`bypassPermissions` 无视 `allowed_tools`** | 语义互踩，用户必踩坑。 |
| **从文本里正则提 `agentId`** | 把结构化 ID 放结构化字段。 |
| **四层 CLAUDE.md 作用域 + OS 写死路径** | 早期只需 user/project 两层。 |
| **`/compact` 与普通 prompt 混同一通道** | 命令走独立字段。 |
| **`Workflow` 的工具脚本机制** | 执行模型未披露，别照抄不理解的机制。 |
| **把 Claude Agent SDK 当产品内核** | 认证与品牌条款不允许（§0.6）。 |

### 9.5 如果只抄 5 个

1. **消息五分类 + 结果五态 + "迭代到流结束"（G1 + G2）** —— 所有其它机制挂在这套事件模型上；三家（DSH/Codex/Claude）在这点上高度收敛。
2. **六步权限求值顺序 + "无模式自动批准清单"（G5 + G6）** —— 安全模型的骨架，且顺序是反直觉的（hook allow 不能跳 deny 规则），自己拍脑袋必错。
3. **plan 模式对子代理生效（G11）** —— 一条规则堵住"用委派绕过审批"的多 agent 漏洞，成本极低。
4. **`WITH` / `W/OUT` / `Δ` 评测三列（G22）** —— 没有这个，你无法证明任何一个改动有价值；这是从"能跑"到"能持续改进"的分水岭。
5. **持久规则每轮重注入、与压缩解耦（G8 + G7）** —— 一句话解释为什么需要"项目规则文件"这个物种：**压缩会吃掉对话，吃不掉每轮重读的文件。**

---

## 10. 待核实清单（不要当结论用）

| # | 待核实项 | 现状 |
|---|---|---|
| 1 | Claude Code SDK → Agent SDK 改名的**确切日期** | 有官方迁移页可证改名发生；日期为搜索结果〔C〕，未直读迁移页正文 |
| 2 | **沙箱的具体 OS 实现**（Linux bubblewrap / macOS Seatbelt / 其它） | 只读文档索引与标题；`sandboxing.md` 与 `sandbox-environments.md` 正文**未读** |
| 3 | **自动压缩的具体算法**（是否保留工具结果原文、是否分块、用什么模型） | 文档只写 "summarizes older history"，**未披露** |
| 4 | **`Workflow` 工具的脚本语言与执行模型/沙箱** | 只说 "a script Claude writes and you rerun"，**未披露** |
| 5 | **`auto` 权限模式的分类器实现**（什么模型、什么规则、误判率） | 只知"模型分类器审 shell 与网络"；有降级与计费相关页但未读 |
| 6 | **`Tool search` 的检索实现**（是否 embedding、索引在哪、是否服务端） | 文档指向 platform 的 API 页，**SDK 侧只讲了开关与效果** |
| 7 | **`claude -p --output-format json` 的完整事件 schema** | 官方指明这是非 TS/Python 的接入方式，但**我没找到该格式的字段级规范**（headless 文档未读） |
| 8 | **是否有官方 SWE-bench 类分数** | 文档索引中**未找到任何基准评测页**；不给出任何分数 |
| 9 | **`SessionStore` 适配器接口的精确签名** | 只读了 hosting 里的行为描述；`session-storage.md` 正文未读 |
| 10 | **Python 与 TS 的能力差集全貌** | 已知 hooks 事件大量缺失、`autoCompactWindow`/`omitClaudeMd` 仅 TS；**未做完整对照** |

---

## 11. 来源列表

### 官方文档（〔A〕，均抓取 Markdown 原文）

1. 文档总索引（用于确认"没有 RAG / 没有 benchmark 页"，并定位所有 SDK 页）— https://code.claude.com/docs/llms.txt
2. Agent SDK overview（四工具对比、能力集、许可与品牌）— https://code.claude.com/docs/en/agent-sdk/overview.md
3. **How the agent loop works**（五类消息、turn 定义、终止五态、effort、压缩、上下文构成）— https://code.claude.com/docs/en/agent-sdk/agent-loop.md
4. **Work with sessions**（continue/resume/fork、存储路径与编码、跨主机三路、V2 API 已移除）— https://code.claude.com/docs/en/agent-sdk/sessions.md
5. **Configure permissions**（**六步求值顺序**、六模式、critical path、hook 优先级、bypass 的坑）— https://code.claude.com/docs/en/agent-sdk/permissions.md
6. Configure your agent（options 组合、settingSources、模型与 fallback、env、cwd、预算、mid-session setter）— https://code.claude.com/docs/en/agent-sdk/configuration.md
7. **Subagents in the SDK**（AgentDefinition 全字段、继承表、三把闸、resume、动态工作流）— https://code.claude.com/docs/en/agent-sdk/subagents.md
8. **Intercept and control agent behavior with hooks**（约 30 事件、matcher、输出结构、超时表、onFailure）— https://code.claude.com/docs/en/agent-sdk/hooks.md
9. **Modifying system prompts**（三起点 + append、四方案对比、CLAUDE.md 加载、output styles、缓存技巧）— https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts.md
10. **Streaming Input**（双模式对比、streaming 独有的四项能力）— https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode.md
11. **How Claude remembers your project**（CLAUDE.md 四层、rules + paths、@import、auto memory）— https://code.claude.com/docs/en/memory.md
12. **Scale to many tools with tool search**（50 工具 10–20K tokens、ENABLE_TOOL_SEARCH 五档、1 万工具上限）— https://code.claude.com/docs/en/agent-sdk/tool-search.md
13. **Hosting the Agent SDK**（**子进程模型**、四种会话模式、资源公式、多租户五件套、已知限制、凭据三段式）— https://code.claude.com/docs/en/agent-sdk/hosting.md
14. **Test plugins with evals**（`claude plugin eval`、六种 grader、WITH/W/OUT/Δ、隔离、mock 与回放、CI）— https://code.claude.com/docs/en/plugin-evals.md
15. Migrate to Claude Agent SDK（改名证据；仅核验页面存在与副标题）— https://code.claude.com/docs/en/agent-sdk/migration-guide

### 索引中出现、本报告引用但未读正文的页面（标注清楚）

16. Sandbox 与沙箱环境 — https://code.claude.com/docs/en/sandboxing.md ／ https://code.claude.com/docs/en/sandbox-environments.md
17. Secure deployment（隔离与凭据）— https://code.claude.com/docs/en/agent-sdk/secure-deployment.md
18. Session storage（SessionStore 适配器与 dual-write）— https://code.claude.com/docs/en/agent-sdk/session-storage.md
19. File checkpointing — https://code.claude.com/docs/en/agent-sdk/file-checkpointing.md
20. Cost tracking — https://code.claude.com/docs/en/agent-sdk/cost-tracking.md
21. Observability (OTel) — https://code.claude.com/docs/en/agent-sdk/observability.md
22. Structured outputs — https://code.claude.com/docs/en/agent-sdk/structured-outputs.md
23. Handle approvals and user input — https://code.claude.com/docs/en/agent-sdk/user-input.md
24. Headless / programmatic（`-p --output-format json`）— https://code.claude.com/docs/en/headless.md
25. Permission modes（CLI 侧的六模式与 critical paths）— https://code.claude.com/docs/en/permission-modes.md
26. Dynamic workflows — https://code.claude.com/docs/en/workflows.md
27. Channels（MCP 推事件进 session）— https://code.claude.com/docs/en/channels.md
28. 官方 demo 仓库 — https://github.com/anthropics/claude-agent-sdk-demos
29. TS SDK CHANGELOG — https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
30. Python SDK CHANGELOG — https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md

---

*报告完。标〔D〕者为本人推断；§10 的待核实项请勿当作结论引用。*
