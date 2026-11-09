# Codex / Codex SDK 机制研究：造另一个 Agent 框架时的参考笔记

> 研究对象：OpenAI Codex（CLI / agent）+ "Codex SDK"
> 调研时间：2026-11-04 ｜ 调研者：research-super-agent（Team Lead 委派 task-10）
> 目的：**不是产品介绍**，而是回答「自研 Go agent 框架时，哪些机制值得抄、哪些抄了会害死我」。
> 约束：只做调研与记录，不含实现代码、未安装任何依赖。

---

## 0. 先钉死事实边界（这一节决定后面能不能信）

### 0.1 证据分级

| 标记 | 含义 |
|---|---|
| 〔A〕 | **官方文档明确**（learn.chatgpt.com / developers.openai.com 的 Codex 文档页，均抓取原文 Markdown 版） |
| 〔B〕 | **代码/仓库确认**（GitHub 仓库实际路径、目录清单、文件存在性与体积，经 GitHub API 与 raw 文件核对） |
| 〔C〕 | **二手分析**（搜索到但被 403/反爬拦截、未直读正文的第三方文章，仅用于交叉印证标题级信息） |
| 〔D〕 | **本报告作者的推断**（无原文背书；已逐条标注，请勿当结论引用） |

一个必须交代的限制：**我没有拿到 Codex 的基准评测（SWE-bench 类）源码或官方分数**。仓库根目录清单经 GitHub API 核对，**不存在 `evals/` 或 benchmark 目录**（见 §6）。凡是涉及"Codex 在 SWE-bench 上多少分"的内容，本报告一律不写——因为我没有一手证据。

### 0.2 "Codex SDK" 到底指什么（这是最容易搞错的一点）

搜索"Codex SDK"会撞出四种东西，必须分开：

| 名称 | 是什么 | 证据 |
|---|---|---|
| **Codex app-server** | Codex 的**本地服务进程**，JSON-RPC 2.0 协议，是 VS Code 扩展等富客户端的底座。**这才是稳定接口层** | 〔A〕[App Server](https://learn.chatgpt.com/docs/app-server)；〔B〕[codex-rs/app-server](https://github.com/openai/codex/tree/main/codex-rs/app-server) |
| **`@openai/codex-sdk`（TypeScript）** | 官方 TS 库，npm 安装，Node 18+，服务端使用。`new Codex()` → `startThread()` → `thread.run()` → `result.finalResponse`；`resumeThread(id)` 续跑 | 〔A〕[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)；〔B〕`sdk/typescript` |
| **`openai-codex`（Python）** | 官方 Python 库，pip 安装，Python 3.10+。**文档明说它"controls the local Codex app-server over JSON-RPC"**，并自带 pinned 的 Codex CLI runtime 依赖 | 〔A〕同上；〔B〕`sdk/python` |
| 社区封装 | 如 PyPI 上的第三方 `openai-codex-sdk` 等 | 〔C〕仅搜索结果标题，未核验内容——**不要与官方 `openai-codex` 混淆** |

还有两个容易被忽略的事实：

- **`codex mcp-server` 已被移除**，官方明确要求旧集成迁移到 app-server。〔A〕[MCP server removal](https://learn.chatgpt.com/docs/mcp-server)
- 存在 `codex exec-server --remote` 这个面（在 CI/自动化文档里被顺带提到），但独立文档我没找到，**标记待核实**。〔A〕提及 +〔D〕推断其用途

**对自研 Go 框架最重要的判断（〔D〕）**：Codex 的 SDK 不是一个"可嵌入的库"，而是**两个面**——

1. **批处理面**：TS/Python SDK 的 `thread.run(prompt) → final_response`，一次性拿最终答案，无流式事件（我抓到的官方 SDK 文档中，TS 侧只有 `run()`，流式被明确指向 app-server）。
2. **事件面**：app-server 的 JSON-RPC 通知流（`item/started`、`item/agentMessage/delta`、`turn/completed`）。

**它把"简单调用"和"完整事件流"拆成了两种接口，而不是用一套 API 硬兼。** 这是 Go 框架值得直接照搬的产品结构决策（见 §9）。同理，CLI 侧 `codex exec` 也坚持**进度走 stderr、最终结果走 stdout**〔A〕——同一个哲学：结果与过程分离。

### 0.3 当前版本坐标（用于判断"这个设计是否已经稳定"）

从文档里能反推出当前 Codex CLI 至少 ≥ 0.166.x：

- "With Codex CLI **0.166.0** or later, use the thread's saved model provider to resume it."〔A〕
- "`ExternalMessage`、显式 `include_turns`、`turn_service_tier` require Codex CLI **0.151.0** or later."〔A〕
- "Managed permission-profile allowlists require Codex **0.138.0** or later. **0.137.0** and earlier ignore..."〔A〕
- "In Codex **0.134.0** and later, `--profile` no longer reads `[profiles.profile-name]` from `config.toml`"〔A〕
- "WSL1 was supported through Codex **0.114**; starting in **0.115**, the Linux sandbox moved to `bwrap`"〔A〕

**读法**：0.11x → 0.16x 之间，沙箱实现、profile 语义、thread 恢复语义都发生过**破坏性变更**。这说明该系统的接口仍在快速演化——**抄机制可以，抄 API 形状要谨慎**。

### 0.4 仓库结构（〔B〕，GitHub API 实核）

```
openai/codex
├── codex-rs/          # Rust 实现主体（core / app-server / exec / tui / sandboxing ...）
├── codex-cli/         # 旧的 TS CLI 壳
├── sdk/               # typescript/ 与 python/
├── docs/              # 仓库内文档（多指向 learn.chatgpt.com）
├── tools/  scripts/  patches/  third_party/
└── MODULE.bazel / BUILD.bazel / justfile / flake.nix   # Bazel 为主构建，另有 cargo/nix
```

**注意：没有 `evals/`、没有 `benchmarks/`。** 这一点在 §6 会展开。

`codex-rs/core/src/` 里有一批**名字就说明了架构**的文件（〔B〕，逐个文件经 API 核对存在与体积）：

| 文件/目录 | 体积 | 说明什么 |
|---|---|---|
| `client.rs` | 128 KB | 模型客户端（Responses API）是最大单体，说明"协议适配"被当作核心复杂度 |
| `compact.rs` | 34 KB | 上下文压缩是独立子系统 |
| `compact_remote_v2.rs` | 55 KB | **压缩还有 v2，且区分 local / remote 两种实现** |
| `compact_model_fallback.rs` | 2.5 KB | 压缩用模型失败时有回退路径 |
| `compact_remote_history.rs` | 7.4 KB | 远程压缩与历史存储的交互 |
| `rollout.rs` / `rollout_budget.rs` | 1.9 KB / 4.1 KB | **"会话滚动 + 预算"是一等概念** |
| `agents_md.rs` / `agents_md_manager.rs` | 20 KB / 8.6 KB | 指令文件有独立管理器（不是简单读文件） |
| `agents_md_tests.rs` | 61 KB | 测试体积是实现的 3 倍——指令拼装规则极易出错 |
| `safety.rs` / `sandboxing/` / `sandbox_tags.rs` | 6.4 KB / 目录 / 4.1 KB | 安全策略与沙箱标签分离 |
| `command_canonicalization.rs` | 1.5 KB | **命令归一化**（前缀规则匹配的前提） |
| `network_policy_decision.rs` | 3.8 KB | 网络域名策略是独立决策模块 |
| `codex_thread.rs` / `codex_delegate.rs` | 58 KB / 16 KB | Thread 与"委派（subagent）"分离 |
| `agent/` / `agent_communication.rs` | 目录 / 5.7 KB | 多 agent 通信 |
| `responses_retry.rs` | 7.6 KB | 重试是独立模块（不是循环里的 try/catch） |
| `prompt_debug.rs` | 4.6 KB | **提示词可调试是产品能力** |
| `client_tool_metadata.rs` | 1.8 KB | 工具有元数据层 |
| `otel_init.rs` | 4.2 KB | 遥测初始化 |
| `model_search.rs` | 16 KB | 模型检索（**不是代码检索**，别误读成 RAG） |

> 〔D〕这张表本身就是结论：**Codex 的复杂度不在"循环"，而在"压缩、客户端适配、安全策略、指令拼装"这四个外围子系统**。如果你按"先写 loop"的思路造框架，会恰好把 90% 的工作量留到最后。

---

## 1. Agent Loop

### 1.1 Codex 怎么做

**核心抽象是三层：Thread → Turn → Item。**〔A〕[App Server](https://learn.chatgpt.com/docs/app-server#core-primitives)

- **Thread**：一段对话，包含 turns。
- **Turn**：一次用户请求 + 随之而来的 agent 工作，包含 items，并流式产出增量更新。
- **Item**：输入/输出的最小单位（user message、agent message、command run、file change、tool call……）。

**主循环的七个动作**〔A〕：

| 动作 | 接口 | 语义 |
|---|---|---|
| 起会话 | `thread/start` | 发出 `thread/started`，并自动订阅该 thread 的 turn/item 事件 |
| 恢复 | `thread/resume` | 按 id 重新打开，后续 `turn/start` 追加到同一对话 |
| 分叉 | `thread/fork` | 复制已存历史成新 id；支持 `lastTurnId`（截断到某轮）与 `ephemeral: true`（内存态） |
| 开一轮 | `turn/start` | 输入 + 可选 override（model、cwd、sandbox policy） |
| **转向（关键）** | `turn/steer` | **向"正在跑的那一轮"追加用户输入，不新建 turn** |
| **中断** | `turn/interrupt` | 请求取消；成功返回 `{}`，该 turn 以 `status: "interrupted"` 结束 |
| 读事件 | 通知流 | `item/started`、`item/completed`、`item/agentMessage/delta`、tool progress……直到 `turn/completed` |

**停止条件**（〔A〕+〔B〕）：
1. 模型自然结束 → `turn/completed` 带最终 status；
2. 被 `turn/interrupt` 取消 → status = `interrupted`；
3. 失败 → `turn/failed`（`codex exec --json` 的事件类型里有它）；
4. provider/网络类失败走重试（`request_max_retries`、`stream_max_retries`、`stream_idle_timeout_ms`，见 [Advanced Config](https://learn.chatgpt.com/docs/config-file/config-advanced)）。

**流式与结果分离**（〔A〕[Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)）：
- `codex exec` **进度写 stderr，只把最终 agent message 写 stdout**。所以 `codex exec "..." | tee out.md` 天然可用。
- `--json` 则把 stdout 变成 JSONL 事件流：`thread.started`、`turn.started`、`turn.completed`（**带 usage**）、`turn.failed`、`item.*`、`error`。

一个真实 JSONL 样例（〔A〕原文给的）：

```jsonl
{"type":"thread.started","thread_id":"0199a213-..."}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"item_1","type":"command_execution","command":"bash -lc ls","status":"in_progress"}}
{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Repo contains docs, sdk, and examples directories."}}
{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122,"reasoning_output_tokens":0}}
```

**Item 类型清单**（〔A〕，来自 `--json` 文档 + app-server 通知）：`agent_message`、`reasoning`、`command_execution`、`file_change`、`mcp_tool_call`、`web_search`、**`plan` updates**、`dynamicToolCall`（实验）、`mcpToolCall`。

**steer vs queue 的区分**（〔A〕[Prompting](https://learn.chatgpt.com/docs/prompting#steering-and-queuing)）——这是 CLI 层的一个精细设计：

- **Steer**：把消息并入**当前**这一轮（改方向、补信息）。
- **Queue**：存到**下一轮**再发（当前工作先跑完）。
- CLI 里 `Enter` = steer，`Tab` = queue；桌面端可在 Settings 设默认行为。

> 〔D〕这个区分极其重要但常被忽略。多数框架只有"打断"或"排队"两个粗暴选项；Codex 把"我现在要改变你正在做的事"和"我等你说完再补充"明确拆开，并且**给了用户肌肉记忆级的两个键**。这是**交互语义**而不是性能优化，抄成本极低、收益极高。

**其它 loop 相关**：
- `thread/inject_items`：把原始 Responses API items 追加进模型可见历史，**但不开启用户 turn**。〔A〕
- `thread/shellCommand`：用户主动发起的 shell 命令，**跑在沙箱之外、全权限、不继承 thread 的 sandbox policy**。〔A〕（这是"人 > 策略"的逃生舱，但被明确隔离）
- 后台终端：`thread/backgroundTerminals/{list,terminate,clean}`（实验），说明长驻进程被当作需要生命周期管理的一等公民。〔A〕

### 1.2 值得借

1. **Thread/Turn/Item 三层命名**。它让"会话、一次请求、一个可观测单元"三者边界清晰，事件总线、UI、持久化、评测都能对齐到这三层。Go 里就是三个 struct + 明确的 ID 关系。
2. **`turn/steer` 作为独立原语**（不是"打断重来"）。实现上只需一个"当前 turn 的输入队列 + 一个注入点"，语义价值远大于成本。
3. **进度/结果分离**（stderr vs stdout；`-o/--output-last-message` 另存最终消息）。CI 里这条能省掉无数 `sed`/`grep`。
4. **`turn.completed` 自带 usage**（含 `cached_input_tokens`、`reasoning_output_tokens`）。把 token 计量放进 loop 的**结束事件**里，而不是事后查账单——这样任何上层都能即时做预算判断。
5. **中断是"请求"而非"杀进程"**（`turn/interrupt` 返回 `{}`，turn 自己走到 `interrupted`）。给清理留出窗口，避免状态撕裂。

### 1.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **Item 类型膨胀** | Codex 的 item 类型绑定了自家产品面（reasoning 摘要、file_change、web_search、plan）。Go 框架应只定义 4 类核心：`message` / `tool_call` / `tool_result` / `state_change`，其余用 `type` 字符串 + `raw` 扩展。否则每加一个工具就要改协议。 |
| **`turn/steer` 的隐含前提** | 它能成立是因为**模型请求与工具执行在同一个可控循环里**。如果你的 Go 框架把工具执行放到独立 worker 进程，steer 需要跨进程注入，语义会退化成"取消 + 重启"。要先定执行模型，再定 steer。 |
| **`thread/shellCommand` 的全权限逃生舱** | 在 Codex 里它有独立 UI 路径和明确标注。自研框架若没有"人 vs agent"的通道区分，这个后门会被 agent 自己利用（提示词注入的经典目标）。**要么不做，要么在协议层用不同 method 名硬隔离。** |
| **后台终端三件套** | 实验 API（`capabilities.experimentalApi` 才可用）。不稳定，别当基线。 |

---

## 2. 上下文工程（压缩 / 摘要 / token 预算 / 工具输出裁剪）

这是 Codex 投入最重的部分（`compact.rs` 34KB + `compact_remote_v2.rs` 55KB + 3 个相关模块）。

### 2.1 Codex 怎么做

**(a) 压缩是自动触发 + 可手动触发的双通道**〔A〕

配置项（[Config Reference](https://learn.chatgpt.com/docs/config-file/config-reference)）：

| 键 | 作用 |
|---|---|
| `model_context_window` | 当前模型的窗口 token 数 |
| `model_auto_compact_token_limit` | **触发自动压缩的 token 阈值**（不设则用模型默认） |
| `model_auto_compact_token_limit_scope` | `total`（默认，按完整活跃上下文计）或 **`body_after_prefix`（只算"承接压缩窗口前缀之后的增量"）** |
| `model_post_turn_compact_threshold_percent` | 0–100；**最终回复后**若活跃上下文达到可用窗口的这个百分比，就在 turn 结束再压一次；设 0 关闭 |

手动：`thread/compact/start`（立即返回 `{}`，进度经 `turn/*`、`item/*` 通知流出）。〔A〕

**(b) 压缩分 local / remote 两种实现**〔A〕〔B〕

- OTel 指标 `task.compact` 的字段是 `type` = **`remote` | `local`**，口径为"每次压缩计数（含手动与自动）"。〔A〕
- 代码侧对应 `compact.rs`（本地）与 `compact_remote_v2.rs`（远程，55KB）+ `compact_remote_history.rs`。〔B〕
- 另有 `compact_model_fallback.rs`：**压缩用的模型失败时有回退**。〔B〕

> 〔D〕这是全篇最有价值的一条洞察之一：**压缩不是"调个小模型总结一下"，而是一个有远程/本地双实现、有模型回退、有历史交互、且被单独度量的一等子系统。** 大多数自研框架把它写成 30 行 "if tokens > N: summarize"。Codex 的体积说明这条路走不通。

**(c) 压缩窗口前缀（compaction-window prefix）概念**〔A〕

`body_after_prefix` 这个取值暴露了一个关键设计：压缩后会留下一个**"承接前缀"**（compaction-window prefix），而阈值可以选择**只计算前缀之后的增长**。这避免了"刚压完又立刻超阈值"的抖动。

> 〔D〕含义：压缩的产物不是一个摘要字符串，而是**一段被保留的窗口前缀 + 之后的增量**。设计压缩时如果只想着"换成摘要"，就会反复触发压缩（抖动），这是可预见的坑。

**(d) 工具输出裁剪**

- **历史分页带视图粒度**：`thread/turns/list` 的 `itemsView` 可控制 turn 的 items 是 **omitted / summarized / fully loaded**；`thread/items/list` 可只取某个 `turnId` 的 items。〔A〕
- **`thread/revert`**：从持久化分页 thread 中**删除指定 turn 及其后所有 turn**，返回新的历史游标。〔A〕——"后悔药"是上下文管理的一部分。
- **reasoning 事件可关**：`hide_agent_reasoning = true`（TUI 与 `codex exec` 都生效）、`show_raw_agent_reasoning`。〔A〕
- **输出长度可调**：`model_verbosity = "low"`（仅 Responses API 有效）、`model_reasoning_summary = "none"`。〔A〕
- **磁盘侧也裁剪**：`[history] max_bytes`，超限时**丢弃最旧条目并重写压缩文件，保留最新记录**。〔A〕

**(e) 单一真相源是 Codex 的"rollout"**〔B〕
`rollout.rs` + `rollout_budget.rs`：会话以"rollout（滚动日志）"形式持久化，并配套**预算**。`codex exec --ephemeral` 明确说"不把 session rollout 文件持久化到磁盘"〔A〕——可见 rollout 文件就是会话的可重放载体。

**(f) 上下文卫生（不只是 token 数）**〔A〕
`[shell_environment_policy]`：`inherit = "none" | "core"`，配合 `filters`（`"AWS_*" = "exclude"`）与 `ignore_default_excludes`。
注意默认值：**`ignore_default_excludes` 默认为 `true`，即 Codex 默认并不自动剔除名字含 `KEY` / `SECRET` / `TOKEN` 的环境变量**；把它设成 `false` 才会先跑自动排除。这是"上下文卫生"而非 token 优化——防止把凭据喂给模型。

### 2.2 值得借

1. **压缩阈值加"作用域"概念**（`total` vs `body_after_prefix`）。这是防止压缩抖动的最小设计，抄它只需要一个枚举。
2. **压缩作为可替换策略 + 模型回退**。接口化（`Compactor`），并提供 fallback，避免"压缩这一步自己失败把会话搞死"。
3. **turn 结束后再压一次**（`model_post_turn_compact_threshold_percent`）。**时机比阈值更重要**：在用户等待结束后做昂贵操作，感知延迟为零。
4. **历史读取带视图粒度**（omitted/summarized/full）。这让"把历史喂给模型"和"把历史给 UI/评测"复用同一份存储，按需展开。
5. **`thread/revert` + 游标**。把"回退"做成返回新游标的持久操作，而不是内存里删数组。
6. **env 变量过滤策略**。Go 侧直接对应 `cmd.Env` 的白/黑名单，属于"防泄密"而非"省 token"。

### 2.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **remote compaction** | 它依赖服务端有配套能力（Responses API 侧）。自研框架没有服务端，`compact_remote_*` 整套拿不走；只抄本地 `compact.rs` 的思路。 |
| **token 计数用 tiktoken 类精确值** | Go 侧要么接受近似（字符数/4、或 provider 返回的 usage），要么绑定特定 tokenizer。**建议：只信 provider 返回的 usage，本地估算仅用于"提前预警"，且阈值留 20% 余量。** |
| **`model_verbosity` / `model_reasoning_summary`** | 这两个是 Responses API 专属旋钮，换 provider（Anthropic/Gemini/本地 vLLM）后语义不同。应做成 provider capability 而不是全局配置。 |
| **`itemsView` 三档** | 三档够用，但如果 Go 框架要接 UI，建议加"游标 + 上限字节"而非枚举档位（Codex 自己在资源分页上用的是 `{items, next_offset}`，更通用）。 |

---

## 3. 提示词工程（系统提示 / AGENTS.md / 结构化输出）

### 3.1 Codex 怎么做

**(a) 系统提示是"分层拼装"而非一个字符串**〔A〕

- `model_instructions_file`：自定义系统指令文件（**旧名 `experimental_instructions_file` 已废弃**，项目级配置里相对路径**相对 `.codex/` 目录解析**）。
- `developer_instructions`：开发者指令，在 `turn/start` 的 `collaborationMode` 场景下，`settings.developer_instructions: null` 表示"使用所选模式的内置指令"。
- 另有 `additional_developer_instructions`（托管配置里存在，但 Work Cloud 明确拒绝该 key）。
- `collaborationMode/list`：协作模式预设（实验，无分页）——**同一套 loop 换不同"人设/行为模式"**。

**(b) AGENTS.md 的发现与拼装规则**（〔A〕[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)，这是全篇最精确的一段规格）

**发现链（每次运行构建一次；TUI 里通常是每个 session 启动时一次）**：

1. **全局层**：在 Codex home（默认 `~/.codex`，可被 `CODEX_HOME` 覆盖）读 `AGENTS.override.md`，否则读 `AGENTS.md`。**该层只取第一个非空文件。**
2. **项目层**：从项目根（通常是 Git 根）**向下走到 cwd**。每个目录依次检查 `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames` 里的名字。**每个目录最多纳入一个文件。**
3. **合并顺序**：从根向下**拼接**，用空行分隔。**越接近 cwd 的文件越靠后，因此覆盖前面**。

其它规则：
- 跳过空文件；
- 累计大小达到 `project_doc_max_bytes`（**默认 32 KiB**）就**停止继续添加**；
- `project_root_markers`（默认 `[".git"]`）决定项目根；设为 `[]` 则不做父目录搜索，cwd 即根；
- 项目配置 `.codex/config.toml` **只在项目被信任时加载**；不可信项目会跳过整个 `.codex/` 层（含 config、hooks、rules）；
- `## Code Review Rules` 是 AGENTS.md 里的**约定小节名**，承载代码评审规则。

**(c) 结构化输出**〔A〕
`codex exec --output-schema ./schema.json -o ./out.json`：要求**最终响应**符合给定 JSON Schema。文档给的例子是抽取项目元数据（`project_name`、`programming_languages`）。注意这是**最终响应**的约束，不是每个 tool call 的。

**(d) Skills（可复用提示词/能力的载体）**〔A〕
- 调用：用户输入里带 `$<skill-name>`；**推荐同时附带一个 `skill` input item**（含 `SKILL.md` 路径），否则模型要自己去找，**会增加延迟**。
- 发现：`skills/list`（可多 `cwds`、`forceReload`、`perCwdExtraUserRoots`）；读 `SKILL.json` 的 `interface` 与 `dependencies`（依赖可声明 `env_var`、`mcp`）。
- 变更通知：`skills/changed`（watched 文件变化）→ 应当作**失效信号**，重跑 `skills/list`。
- 启停：`skills/config/write`（按路径 enabled）。
- OTel 有 `skill.injected`（含 `status`、`skill`）与 `thread.skills.enabled_total` / `kept_total` / **`truncated`** —— 说明**技能列表本身也受上下文预算约束，会被截断**。〔A〕

**(e) Hooks（提示词之外的确定性注入点）**〔A〕
- 位置：`~/.codex/hooks.json`、`~/.codex/config.toml`、`<repo>/.codex/hooks.json`、`<repo>/.codex/config.toml`。项目级只在项目可信时加载。
- 形状：`[[hooks.PreToolUse]]` + `matcher`（正则匹配**工具名**，如 `"^Bash$"`）+ `type = "command"` + `command` + `timeout` + `statusMessage`。
- 托管侧有 `allow_managed_hooks_only = true`（**仅 `requirements.toml` 支持，放进 `config.toml` 无效**）。

**(f) 提示词可调试**：`prompt_debug.rs`〔B〕；SDK 侧有 `threadSource` 给 thread 打标（如 `"ci"`），**恢复时保留原始 source**〔A〕——这是提示词/行为归因的基础设施。

### 3.2 值得借

1. **AGENTS.md 的"向上发现 + 向下拼装 + 就近覆盖 + 字节上限"四件套**。规格精确到可以照抄：每目录最多一个文件、拼接顺序即优先级、超 32KiB 截断。这套规则比你随手写的 "读 ./AGENTS.md" 强太多，因为它**确定性**。
2. **`AGENTS.override.md` 作为"临时覆盖不删基础文件"的机制**。运维友好度极高（Go 框架里就是"同名 override 优先"）。
3. **`project_doc_max_bytes` 硬上限**。防止有人在根目录塞 500KB 指南把窗口吃光。
4. **技能必须"显式附带"而非"让模型自己找"**。`skill` input item 这个设计承认了一个事实：**让模型去找 = 多一轮 = 更慢更贵**。
5. **`threadSource` 打标 + 恢复时保留**。低成本的归因能力。
6. **Hooks 用"工具名正则"匹配**。比"每个工具写一个 hook"通用得多，实现只要一次 regexp 匹配。
7. **`--output-schema` 只约束最终响应**。这比强制每步结构化更实用——中间过程允许自由文本，终点可被程序消费。

### 3.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **AGENTS.md 生态** | 这是 OpenAI 推的**跨厂商约定**（有独立站点 agents.md），且 Codex 已实现 `externalAgentConfig/import` 把 `CLAUDE.md` 迁移成 `AGENTS.md`〔A〕。自研 Go 框架若自造 `PROMPT.md`，会失去生态互操作。**建议直接支持 AGENTS.md 名字**。 |
| **`model_instructions_file` 单文件** | 单文件 + 空行拼接在需要"按角色（router/worker）分提示词"时不够用。Codex 靠 `collaborationMode` 补，但那是实验接口。**建议：提示词做成"有序片段数组"，每片段有 id、优先级、条件（按角色/渠道/是否子 agent）**，而不是一个文件。 |
| **32 KiB 默认值** | 这个值是为"提示词还不太长"的年代定的。若你的框架要在系统提示里放工具文档，几 KB 就超。**应允许按片段设预算**（Codex 的 `thread.skills.truncated` 指标正是在量化这件事）。 |
| **Skills 的 `SKILL.json` 双格式**（`SKILL.md` + `SKILL.json`） | 两套元数据容易漂移。Go 侧建议单一文件带 YAML frontmatter。 |
| **Hooks 的 4 个位置** | 位置太多导致"为什么这个 hook 没生效"的排查成本高。建议只留 user + project 两层，并**启动时打印生效清单**（Codex 的 `prompt_debug` 是同理）。 |

---

## 4. 记忆（会话持久化 / 恢复 / 项目记忆）

### 4.1 Codex 怎么做

Codex 的记忆其实是**三个互不相同的系统**，很容易被混为一谈：

| 系统 | 存什么 | 存储位置 | 证据 |
|---|---|---|---|
| **① Thread 持久化（会话）** | 完整对话、turn、item | SQLite（`sqlite_home`）+ rollout 文件 | 〔A〕`thread/*` 全套 + `sqlite_home`；〔B〕`rollout.rs` |
| **② 历史文件（transcript）** | 本地会话抄本 | `$CODEX_HOME/history.jsonl` | 〔A〕 |
| **③ Local memories（项目/个人记忆）** | 从过往对话提炼的"记忆条目" | `$CODEX_HOME/memories/` 或 `memories_v2/` | 〔A〕[Memories](https://learn.chatgpt.com/docs/customization/memories) |

#### ① 会话持久化与恢复

接口全集（〔A〕，app-server）：

`thread/start`、`thread/resume`、`thread/fork`（含 `lastTurnId`、`ephemeral`）、`thread/read`（**只读元数据，不 resume**）、`thread/list`（分页 + 过滤 + 运行时 status）、`thread/turns/list`（历史分页，`itemsView` 三档）、`thread/items/list`、`thread/loaded/list`（**当前在内存里的 thread id**）、`thread/name/set`、`thread/goal/set|get|clear`、`thread/metadata/update`（**Git 元数据**）、`thread/archive`（移入 archived 目录，并尝试归档后代 thread）、`thread/unarchive`、`thread/delete`（**同时删持久化与后代**）、`thread/unsubscribe`（最后一个订阅者退出后，经过无订阅宽限期**卸载**并 emit `thread/closed`）、`thread/status/changed`（通知）、`thread/revert`。

**几个设计细节特别值得注意**：

- **loaded vs persisted 是两回事**：`thread/loaded/list` 与 `thread/list` 分开，说明"在内存里跑着的"与"存在磁盘上的"是两个集合。〔A〕
- **无订阅宽限期后卸载**（`thread/unsubscribe` → grace period → unload → `thread/closed`）。这是**内存回收策略**，不是删除数据。〔A〕
- **goal 是一等状态**：`thread/goal/set` + `thread/goal/updated` 通知，有 get/clear。目标不是提示词的一部分，而是**可查询的会话状态**。〔A〕
- **fork 的两种语义**：`lastTurnId`（截断到某轮）与 `ephemeral: true`（纯内存分叉）。〔A〕
- **恢复时可指定新的 cwd**：`tui` 配置里有"恢复或 fork 时使用的工作目录；未设时若当前目录与会话保存目录不同，Codex 会让你选"。〔A〕——**会话与目录解耦**。
- SDK 侧还有一个精妙选项：`include_turns=False` 恢复时**不把旧 turn 装进响应**，但"模型仍然拥有该 thread 的上下文"；要历史再 `thread.read(include_turns=True)`。〔A〕

#### ② 历史文件

`[history] persistence = "none"` 可完全关闭；`max_bytes` 设上限，超限时**丢最旧、重写压缩、保留最新**。〔A〕
`codex exec --ephemeral` 不落 rollout 文件。〔A〕

#### ③ Local memories（真正的"项目记忆"）

〔A〕关键事实：

- **默认关闭**。开启：`[features] memories = true`，或桌面端 Settings。
- **生成与使用是两个开关**：`memories.generate_memories`（新对话能否成为记忆生成的输入）、`memories.use_memories`（是否把已有记忆注入未来会话）。**这个拆分很重要**：可以"只读不写"或"只写不读"。
- **后台生成，不在对话结束时立刻做**：文档明说"Codex 会等到 chat 空闲足够久，避免总结仍在进行中的工作"。
- **两种模型**：`memories.extract_model`（每对话抽取）、`memories.consolidation_model`（全局合并）→ **对应 OTel 的 `memory.phase1` / `memory.phase2` 两阶段**。
- **速率保护**：`memories.min_rate_limit_remaining_percent`——**剩余额度低于阈值就跳过这次后台生成**，避免在快超额时花配额。
- **秘密脱敏**：生成时会 redact secrets；但仍警告不要把秘密存进去。
- **外部上下文隔离**：`memories.disable_on_external_context = true` 让"用过 MCP / web search / tool search 的对话"不参与记忆生成（旧名 `no_memories_if_mcp_or_web_search` 仍被接受）。
- **存储版本**：新 Codex home 默认用 `memories_v2/`；若 `memories/` 已存在则沿用；`memories.version` 可显式指定；`memories.dual_write = false` 让全新 profile 留在 v1（**迁移期双写**）。
- **有引用**：OTel 指标 `turn.memory` 的字段包含 **`has_citations`**，以及 `read_allowed`、`feature_enabled`、`config_use_memories`。→ 记忆条目是**带出处**的。
- 文档明确的定位警告：**"把必需的团队规则放在 AGENTS.md 或入库文档里，把记忆当作有帮助的召回层，而不是唯一真相源。"**

> 〔D〕这句话是整个记忆设计的灵魂，也是最多人做错的地方。Codex 没有把"记忆"做成 RAG 索引，而是做成**一个不可信的、异步的、带引用的提示注入源**，并且明确降级它的权威性（低于 AGENTS.md）。

### 4.2 值得借

1. **generation / use 分离**（写与读独立开关）。让"冷启动阶段只积累不使用"成为可能。
2. **异步 + 空闲延迟 + 速率阈值**三件套。记忆生成是后台批处理，**绝不在用户等待的路径上**。`min_rate_limit_remaining_percent` 这个旋钮几乎没人想到，但极其务实。
3. **两阶段 + 两个模型**（extract / consolidate）。抽取是 per-chat 的便宜活，合并是全局的贵活，分开配置成本。
4. **记忆必须带引用**（`has_citations`）。没有出处的记忆无法验证、无法纠错、无法删除。
5. **loaded / persisted 分离**（内存集合 vs 磁盘集合）。Go 里就是两个 map + 一个 LRU 卸载器。
6. **无订阅宽限期后卸载**。给"用户切走了"和"用户马上回来"都留了余地。
7. **goal 作为会话状态**（可 get/set/clear、有变更通知）。比"在提示词里写一句目标"可查询得多。
8. **`include_turns=False`**：恢复会话但不回灌历史到响应里。对构建 UI/API 特别有用（省带宽、省一次序列化）。

### 4.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **`history.jsonl` 单独一份** | 与 SQLite 里的 thread 数据**双份存储**，必然漂移。Go 侧建议只留一份持久化（SQLite 或 append-only log），导出功能按需生成。 |
| **memories_v2 双写迁移** | 这是历史包袱的产物。新框架从 v1 开始，不要复制"双写 + version 开关"的复杂度。 |
| **记忆 = 纯文本注入** | Codex 的记忆是"注入一段文本 + 引用"。若你的场景需要大量条目（>几百），纯文本注入会吃窗口。**建议：小规模用注入，大规模必须转成显式检索（此时才需要真 RAG）**。 |
| **`thread/metadata/update` 只存 Git 元数据** | 类型太窄。Go 侧应设计成通用 `map[string]string` 元数据，别写死 Git。 |

---

## 5. RAG（有就写）

### 5.1 结论先说：**Codex 没有做"检索增强生成"意义上的 RAG**

证据（这是我特意去证的**否定性结论**，请注意它与"我没找到"的区别）：

| 检查项 | 结果 | 证据等级 |
|---|---|---|
| 官方文档全集索引里有无 RAG / embeddings / vector index / 向量检索页 | **无** | 〔A〕[llms.txt](https://learn.chatgpt.com/docs/llms.txt) 全量目录核对 |
| 仓库根目录有无 `evals`/index/vector 相关目录 | **无**（只有 `codex-rs`、`codex-cli`、`sdk`、`docs`、`tools`、`scripts`、`patches`、`third_party`） | 〔B〕GitHub API 根目录清单 |
| `model_search.rs`（16KB）是不是代码检索 | **不是**，是**模型**检索（用于 `model/list` 之类） | 〔B〕文件名 + 上下文；〔D〕语义判断 |
| 代码检索靠什么 | **靠 agent 自己跑 shell**（`rg`/`grep`/`find`）+ 读文件 + `apply_patch` | 〔A〕工具集文档、`sandbox` 作用于"spawned commands"〔B〕 |

**那 Codex 有什么"检索"？** 三类，都不是 RAG：

1. **Agent 驱动的检索**：模型自主决定 `rg` 什么、读哪个文件。检索策略在**模型脑子里**，不在索引里。〔A〕〔D〕
2. **Web search 工具**，且有**四档模式**〔A〕：
   - `cached`（**默认**）：用 OpenAI 维护的索引做结果缓存，**不访问外部网络**——官方理由明确写着"减少来自任意实时内容的提示词注入暴露"。
   - `indexed`：仅当被搜索索引门控时才允许外部访问。
   - `live`：无限制实时检索（`--search` 等价；`--yolo`/full-access 下默认变 live）。
   - `disabled`：移除该工具。
   另有 `tools.web_search` 可配 `context_size`（low/medium/high）、`allowed_domains`、`location`。
3. **Skills / MCP 的"按需加载"**：`plugin/skill/read`（按需读远端插件技能的 Markdown）、`mcpServer/resource/read`、`tools/list` 的 **defer** 机制（配置里出现过已退休的 `tool_search`、`tool_search_always_defer_mcp_tools`）。→ **工具定义本身也做延迟加载**，这是"上下文即缓存"思想的另一面。〔A〕〔D〕

### 5.2 值得借

1. **"先不做 RAG"这个决定本身**。对于代码 agent，`rg` + 读文件在**正确性**上通常优于向量检索（精确匹配、可解释、无索引陈旧），成本只是几轮工具调用。**这省掉了一整个索引管道。**
2. **web search 默认 `cached` 作为注入防线**。这是一个把"安全"直接编码进默认值的范例：不给你实时网页，除非你明确要。Go 框架里对应"外部内容默认走白名单/缓存，live 需显式开启"。
3. **工具定义的延迟加载（defer / tool_search）**。工具多到几百个时，光工具 schema 就吃满窗口。延迟加载 + 按需发现是必要手段。
4. **`allowed_domains` + `context_size` 作为工具参数**（而非全局配置）。让模型/调用方按任务调检索强度。

### 5.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **完全不索引** | 当仓库巨大（>百万行）或需要跨仓库/跨文档检索时，纯 `rg` 会退化成"多轮试探"，token 成本高于向量检索。**建议：默认无 RAG，但预留 `Retriever` 接口；触发条件做成"同一路径被 grep 超过 N 次"这类可观测信号，而不是拍脑袋。** |
| **web search `cached`** | 它依赖 OpenAI 的索引服务，自研无法复制。可迁移的是**策略**（默认保守 + 显式升级），不是实现。 |
| **`model_search.rs` 的命名** | 抄代码结构时极易误读成"代码搜索"。这是一个提醒：**名字相同的模块在不同系统里语义可能完全相反**。 |

> 〔D〕给 Go 框架的建议：把 RAG 设计成**可选插件而非核心**。核心只提供 `Retriever` 接口 + 一个"无操作实现"（返回空）。这样既不阻塞，也不背锅。

---

## 6. 评测（SWE-bench 类）

### 6.1 结论：**Codex 的基准评测未开源，但它的生产遥测指标恰好就是一套评测指标体系**

**(a) 没有开源基准评测**〔B〕

GitHub API 核对仓库根目录：**无 `evals/`、无 `benchmarks/`、无 SWE-bench 相关目录**。仓库里有的是各 crate 的单元/集成测试（`justfile` 驱动）、`tests/` 目录、以及 `tests/fixtures/` 类资产——**这是工程质量保障，不是模型能力评测**。

> 明确声明（〔D〕）：**本报告不给出任何 Codex 在 SWE-bench / SWE-bench Verified 上的分数**，因为我没有一手来源。凡你在别处看到的"Codex 得分 X%"，请自行核实是否为官方发布。

**(b) 但 Codex 暴露了一整套**可直接当评测指标**的 OTel 遥测**〔A〕[Advanced Config - OTel](https://learn.chatgpt.com/docs/config-file/config-advanced)

这是本节真正的收获。Codex 的指标分为**请求/流/工具**、**线程与任务**、**记忆与本地状态**、**沙箱**四大类。挑出对"评测"最有用的：

| 指标 | 类型 | 字段 | 为什么对评测有用 |
|---|---|---|---|
| `turn.ttft.duration_ms` | histogram | — | 首 token 延迟 |
| `turn.ttfm.duration_ms` | histogram | — | **首个模型输出 item** 延迟（比 ttft 更贴近"用户看到东西"） |
| `turn.duration_ms`（端到端） | histogram | — | 一轮总耗时 |
| `turn.token_usage` | histogram | `token_type` = total / input / **cached_input** / output / **reasoning_output** | 成本与"思考开销"分离 |
| `turn.tool.call` | histogram | — | 每轮工具调用次数（**衡量是否过度探索**） |
| `tool.call` / `tool.call.duration_ms` | counter / histogram | `tool`、`success` | 按工具名的成功率与耗时 |
| `approval.requested` | counter | `tool`、`approved`（**approved / approved_with_amendment / approved_for_session / denied / abort**） | **审批摩擦度量**：denied 比例高说明提示词或权限设计有问题 |
| `task.compact` | counter | `type` = remote / local | 压缩频次（**过高说明上下文工程有问题**） |
| `task.review` / `task.undo` / `task.user_shell` | counter | — | 用户行为：触发评审、撤销、手动 shell 的次数 |
| `conversation.turn.count` | counter | — | 每 thread 的轮数，**在 thread 结束时记录** |
| `thread.skills.truncated` | histogram | 1/0 | **技能列表是否被截断**——提示词预算的直接证据 |
| `multi_agent.spawn` / `multi_agent.resume` | counter | `role` | 子 agent 使用强度 |
| `thread.fork` | counter | `source` | 分叉行为来源 |
| `turn.memory` | counter | `read_allowed`、`feature_enabled`、`config_use_memories`、`has_citations` | 记忆是否真被用上 |
| `db.error` / `db.backfill` | counter | `stage`、`status` | 本地状态健康度 |
| `windows_sandbox.*` | 多种 | mode、result | 沙箱可用性 |

同时有**结构化日志事件**：`codex.conversation_starts`、`codex.api_request`、`codex.sse_event`（**`response.completed` 时带 token 数**）、`codex.websocket_request`/`_event`、`codex.user_prompt`（**默认脱敏**）、`codex.agent_response`（需 `otel.log_agent_responses`）、`codex.guardian_assessment`（需开关）、`codex.tool_decision`（**approved/denied 且区分来自配置还是用户**）、`codex.tool_result`。

**工程约束**〔A〕：OTel **默认关闭**；`log_user_prompt = false` 默认脱敏；事件带 `service.name`、CLI 版本、环境标签；批量发送、退出时 flush。

**(c) 内建的自验证习惯**〔A〕
文档反复把"验证"写进推荐工作流，而不是交给外部评测：
- `/goal` 的目标模板明确要求写 **Verification**（"加上测试、度量或评审标准来证明完成"）；
- 修 bug 工作流要求"**修完后重跑复现步骤**"并"报告命令与结果"；
- `/review` 与 `codex review` 是内建的第二道眼睛；
- `--output-schema` 让最终产物可被程序断言。

### 6.2 值得借

1. **把评测指标定义成"运行时遥测"而不是"离线跑分"**。Codex 的 `turn.token_usage` / `tool.call` / `approval.requested` / `task.compact` 是**每次真实运行都在产出的**。对你造框架的意义：**第一天就把这些埋点做进去**，否则事后补不上历史数据。
2. **`approval.requested` 的五态**（approved / with_amendment / for_session / denied / abort）。多数系统只有 approved/denied；"带修改批准"和"本会话内批准"是真实存在的决策，能反映权限设计好坏。
3. **`task.compact` 作为健康指标**。压缩频繁 ≠ 正常，而是**上下文工程在告警**。
4. **`thread.skills.truncated`**：把"提示词预算是否被打爆"变成可观测数字。
5. **默认脱敏的遥测**（`log_user_prompt = false` 是默认值）。评测要看数据，但不能默认收集代码与秘密。
6. **内建 `/review` 作为独立一"运行模式"**（`review/start`、`enteredReviewMode`/`exitedReviewMode` item、`review_model` 可单独指定模型）。**评审用不同模型**是个便宜的质量杠杆。

### 6.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **没有离线基准** | 生产遥测能反映"真实分布下的健康度"，但**无法回归**（你不知道昨天和今天的任务难度是否相同）。Go 框架必须**自建小型固定任务集**（10–30 个可自动判定的任务），否则改提示词等于盲改。 |
| **OTel 全量事件** | 事件类型极多且字段随版本变化（我抓到的文档里就有"retired switches"被拒的清单）。建议 Go 侧只定义**自己的 8–10 个核心指标**，OTel 作为出口而非 schema。 |
| **`conversation.turn.count` 在 thread 结束时记录** | 长 thread 永远不结束 → 永远没有这条数据。评测口径应改为"周期性快照"。 |

---

## 7. Planner（计划 / 分解 / 重规划）

### 7.1 Codex 怎么做

Codex 的"规划"不是一个 planner 模块，而是**四个松散耦合的东西**：

**(a) `/plan` —— 先调查再动手**〔A〕[Prompting](https://learn.chatgpt.com/docs/prompting#goal-mode)
官方原文："For a multi-step task, enter `/plan` in the app composer when you want Codex to **investigate and propose an approach before editing**."
也有 `$plan` 技能形式（"If you have the `$plan` skill available, invoke it explicitly"），并给出用法：让它产出分里程碑的迁移计划、指定每个里程碑动哪些文件、包含回滚策略。

**(b) plan 是**事件流里的一等 item 类型**〔A〕
`codex exec --json` 的 item 类型清单里明确包含 "**plan updates**"。→ 计划不是一段文本，而是**可增量更新的结构化状态**，会作为事件流出去（供 UI 渲染成 checklist）。

**(c) Goal mode `/goal` —— 把"定义完成"变成机制**〔A〕[Long-running work](https://learn.chatgpt.com/docs/long-running-work)

这是最值得抄的一段。`/goal` 的**goal 文本同时是第一条提示词和完成判据**。文档要求 goal 写清三件事：

| 要素 | 要求 |
|---|---|
| **Outcome** | 描述想要的结果，而不只是要做哪些动作 |
| **Constraints** | 点名必需工具、边界、兼容性需求、要避免的做法 |
| **Verification** | 加上测试、度量或评审标准，**证明工作已完成** |

文档原话：要写一个"**让系统能自己验证进度**"的 goal。
配套：`/plan` 先行（若结果不清，先让 Codex 访谈你、识别约束、把结果变成可度量的 goal）→ `/goal` 启动 → 用进度行 **pause / resume / edit / clear** → 发后续消息 steer。
状态侧：`thread/goal/set|get|clear` + `thread/goal/updated` 通知〔A〕。

**(d) 子 agent 分解**〔A〕〔B〕
- 配置：`[agents]`（见 Subagents 文档）；SDK 侧有 `multi_agent.spawn`（按 `role`）、`multi_agent.resume`、`multi_agent.nickname_pool_reset` 指标。
- 代码：`codex_delegate.rs`（委派）、`agent/`、`agent_communication.rs`。
- 工具：`dynamicTools` + `item/tool/call`（客户端可动态注入工具，实验）。
- **`turn/steer` 也是重规划手段**：不推翻计划，而是在飞行中改方向。
- **`thread/revert`**：删掉某个 turn 及之后所有 turn，等于"回到计划某个检查点"。

**(e) 计划产物可跨环境搬运**〔A〕
IDE → Cloud 委派工作流明确说：新 cloud chat "**carries over the existing chat context (including the plan and any local source changes)**"，然后你逐里程碑实施。→ **计划是可携带的上下文资产**，不是会话内临时变量。

### 7.2 值得借

1. **goal 的三要素模板（Outcome / Constraints / Verification）**。这是把"模糊需求"压成"可验证目标"的最小规格，可以直接做成框架的强制校验：**没有 Verification 的 goal 不允许进 auto 模式**。
2. **goal 是一等状态**（get/set/clear + 变更事件 + 进度行可 pause/resume/edit）。这让"目标"能被 UI、调度器、评测三方共同读取。
3. **plan 作为增量 item**，而非一次性输出。计划会变，所以要能"更新"而不是"重写"。
4. **`/plan` 与 `/goal` 分两步**：先**只调查不改文件**（plan），确认后再进入执行（goal）。这个"只读调查阶段"是防止 agent 一上来就乱改的廉价保险。
5. **steer 是重规划的一等通道**。不必"取消→重新规划→重跑"，直接改方向。
6. **计划可跨环境携带**（IDE→Cloud 带着 plan 走）。

### 7.3 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **`/plan`、`/goal` 是斜杠命令（UI 概念）** | 自研框架如果是库/SDK，没有 composer。**应把它降为 API**：`mode: plan 或 execute`（只读/可写）与 `goal: {outcome, constraints, verification}` 作为 `startTurn` 的字段。 |
| **plan 的渲染与存储耦合** | Codex 的 plan item 主要服务 UI。若你要用 plan 驱动调度，需要**机器可判定的 plan 结构**（步骤 + 完成条件 + 当前指针），而不仅是文本 bullet。**这是 Codex 没解决好的地方（〔D〕）**：plan 是给人看的，不是给调度器看的。 |
| **子 agent 的 role 体系** | `multi_agent.spawn` 按 role 计数，但 role 的具体语义在 `[agents]` 配置里。Go 侧建议先只做**两级**（orchestrator / worker），别一上来做 role 矩阵。 |
| **`nickname_pool_reset` 这类** | 明显是特定 UI 需求的产物。不要因为它存在就以为需要。 |

---

## 8. 长程任务（审批 / 沙箱 / 断点续跑 / 预算）

这是 Codex 最成熟、也最值得抄的一块。

### 8.1 审批与沙箱：两个**正交**的控制

官方一句话点透〔A〕：
> **"沙箱定义技术边界；审批策略决定 agent 何时必须停下来问。"**

#### (a) sandbox_mode（技术边界）〔A〕

| 模式 | 能力 |
|---|---|
| `read-only` | 只能看文件；**不批准就不能改文件、不能跑命令** |
| `workspace-write` | 可读、可在 workspace 内改、可跑常规本地命令（**默认低摩擦模式**） |
| `danger-full-access` | 无沙箱限制（文件与网络边界都移除） |

**关键细节（这些是真正值钱的部分）**：

- 沙箱作用于**被 spawn 的命令**，不只是内置文件操作。`git`、包管理器、测试运行器**都继承同一套边界**。〔A〕
- **workspace 包含 cwd 与 `/tmp` 等临时目录**（`/status` 可查看）。`exclude_tmpdir_env_var`、`exclude_slash_tmp` 可关。〔A〕
- **writable roots 里的受保护路径**：`.git`（是目录还是 pointer file 都保护，pointer 则解析出的 gitdir 也保护）、`.agents`、`.codex`、`.aws`——**递归只读**。〔A〕
- 平台实现：macOS **Seatbelt**（`sandbox-exec -p`）、Linux **`bwrap` + `seccomp`**、Windows **MXC**（`elevated`/`unelevated` 为 legacy 回退）；WSL2 走 Linux 实现，**WSL1 自 0.115 起不再支持**。〔A〕
- **可自测**：`codex sandbox macos|linux|windows [--permissions-profile X] [--log-denials] [COMMAND]...`（也作 `codex debug`）。〔A〕**这条太实用了**：沙箱是一个可以被单元测试的东西。
- 启动时**自动探测**：Git 仓库 → 推荐 `Auto`（workspace-write + on-request）；非 Git → `read-only`；某些情况下会一直停在 `read-only` 直到你显式信任该目录。〔A〕

#### (b) approval_policy（何时停下来问）〔A〕

- `on-request`：默认在沙箱内工作，**越界时问**。
- `never`：不问。
- **`on-failure` 已弃用**；**`untrusted` 已退休**（不再支持，配置里留着会导致客户端**启动失败**）。迁移路径：用 `sandbox_mode = "read-only"` + `approval_policy = "on-request"`，或保留严格性用项目级 `trust_level = "untrusted"`。
- **`granular` 策略**：可逐类开关——`sandbox_approval`、`rules`、`mcp_elicitations`、`request_permissions`、`skill_approval`。**未开的那类会被自动拒绝（fail closed）**，而不是弹窗。

#### (c) approvals_reviewer（谁来审）〔A〕

`user`（默认）或 **`auto_review`** —— 把符合条件的审批请求交给**评审 agent**。
- 评审策略检查：**数据外泄、凭据探测、持续性安全削弱、破坏性动作**。
- 风险分级：低/中风险可放行；**critical 一律拒绝**；high 需要足够用户授权且无匹配 deny 规则。
- **失败模式是 fail closed**（prompt 构建、评审会话、解析失败 → 拒绝）；超时单独提示但**动作仍不执行**。
- 默认策略文件在仓库里：`codex-rs/core/src/guardian/policy.md`〔A〕；企业可用 `guardian_policy_config` 替换租户段。
- **成本**：自动评审要用额外模型调用，会影响用量。〔A〕

#### (d) rules（execpolicy 前缀规则）〔A〕

允许 / 提示 / 禁止**命令前缀**，作用于"沙箱之外"。是比"整体放开权限"更细的调节器。配套有 **`command_canonicalization.rs`**〔B〕——**命令归一化是前缀规则能可靠工作的前提**（否则 `git  commit`、`/usr/bin/git commit`、`bash -c "git commit"` 全都绕过）。

#### (e) 网络〔A〕

- `workspace-write` 下**默认网络关闭**；`[sandbox_workspace_write] network_access = true` 才开。
- `[features.network_proxy]` 才是**强制**：`enabled` 本身不授权网络，只在网络已开时**约束**出站流量。
- 域名规则是**allowlist 优先**：精确主机只匹配自己；`*.example.com` 匹配子域不含 apex；`**.example.com` 含 apex 与子域；全局 `*` 只允许出现在 allow；**`deny` 永远赢**。
- **本地/私有目的地默认封**（`allow_local_binding = false`）：loopback、link-local、私有地址都挡；**通配符不算显式本地例外**；**解析到本地/私有 IP 的主机名即使命中 allowlist 也挡住**。
- **DNS rebinding 防护**：放行前做 DNS + IP 分类检查；查询失败/超时一律**拒绝**；官方明确说这是**降低而非消除**风险（彻底防需要传输层固定 IP）。
- 两个 `dangerously_*` 开关（非 loopback 代理、全部 unix socket）默认 false。
- **代理的盲区被明确列出**：它**不**过滤 web search、app/connector、MCP 连接、browser、Computer Use、cloud 任务、模型与鉴权请求。

#### (f) 其它安全机制

- **语料层防护**：`web_search` 默认 `cached` 以降低提示词注入（见 §5）。
- **环境变量剥离**：`shell_environment_policy`（见 §2）。
- **登录 shell 可禁**：`allow_login_shell = false`（`login = true` 请求被拒，省略则默认非登录 shell）。〔A〕
- **项目信任层级**：`projects.<path>.trust_level = "trusted" | "untrusted"`；不可信项目**跳过整个 `.codex/` 层**（config、hooks、rules）。〔A〕
- **安全监控可暂停任务**：GPT-6 Astra 起有异步安全监控，**能暂停任务**，且"暂停可能晚于触发行为"；CLI/移动端拿不到完整 findings，任务直接结束。〔A〕
- **托管配置的优先级链**（企业场景）：OS 特定环境覆盖 → 全 OS 环境覆盖 → Global；本地执行时 MDM/legacy 托管设备要求 > Agent Security > 设备系统 requirements 文件。〔A〕

### 8.2 断点续跑

〔A〕可用的续跑原语：

| 场景 | 手段 |
|---|---|
| 交互式继续 | `thread/resume`；TUI 里恢复时若 cwd 变了会让你选目录 |
| 非交互式续跑 | `codex exec resume --last` 或 `codex exec resume <SESSION_ID>` |
| 回到检查点 | `thread/revert`（删某 turn 及之后） |
| 从历史分叉 | `thread/fork`（`lastTurnId` 截断 / `ephemeral` 内存态） |
| 不落盘运行 | `codex exec --ephemeral` |
| 中断 | `turn/interrupt` → turn 以 `interrupted` 结束 |
| 归档/恢复 | `thread/archive` / `thread/unarchive`（归档会**尝试连带归档后代 thread**） |
| 不重放事件 | Source 侧游标思路在 Codex 里体现为**thread 事件 + 游标**（`thread/revert` 返回新游标） |

**注意一个容易踩的坑**〔A〕：`turn_steer` / `turn_start` 在 `thread` 上的输入是**追加**语义。若你的续跑逻辑"重发上一条消息"，会导致重复输入。**续跑应基于 thread id + 历史状态，而不是重发 prompt。**

### 8.3 预算

- **`rollout_budget.rs`**〔B〕：预算是独立模块，不是散落的计数。
- **`turn.completed` 带 usage**（`input_tokens` / `cached_input_tokens` / `output_tokens` / `reasoning_output_tokens`）〔A〕——预算判断有实时数据源。
- **`account/rateLimits/read` + `rateLimits/updated` 通知**〔A〕：额度是外部状态且**会变**，Codex 把它建模成"可订阅状态"而不是"一次查询"。
- **`memories.min_rate_limit_remaining_percent`**〔A〕：**额度快用完就跳过后台记忆生成**。这是"预算感知"做到极致的表现——不是拒绝主任务，而是砍掉增值后台任务。
- **压缩即预算工具**：`model_auto_compact_token_limit` 直接就是"窗口预算"的执行器。
- **`turn.token_usage` 按类型细分**：cached_input 便宜、reasoning_output 贵。只看 total 会误判成本结构。

### 8.4 值得借

1. **沙箱与审批正交**（技术边界 vs 停不停下来问）。这是整个安全模型的骨架，抄它比抄任何单个模式都重要。
2. **沙箱可被命令行自测**（`codex sandbox ... --log-denials`）。把安全边界变成**可回归测试的对象**。
3. **受保护路径递归只读**（`.git`、`.agents`、`.codex`、`.aws`）。这四类恰好覆盖了"agent 改了自己就能越权"的所有入口——`.git` 改 hooks、`.agents`/`.codex` 改指令、`.aws` 偷凭据。**这是经验结晶，直接抄。**
4. **granular 审批：未开启的类别 fail closed**。比"弹窗让用户决定"安全得多。
5. **`auto_review` 作为审批人**，且**fail closed**、**critical 一律拒**、**超时不执行**。把"模型审模型"这个危险想法用三重保险包起来。
6. **命令归一化（canonicalization）**。任何基于"命令前缀"的策略，**没有归一化就是纸糊的**。
7. **DNS rebinding 防护 + "解析到私有 IP 即拒"**。很多自研沙箱只做字符串匹配域名，这里给出的是正确层级。
8. **明确列出代理的盲区**（web search / MCP / browser / 模型请求不受命令代理约束）。**知道自己防不住什么**，比声称全防更专业。
9. **`min_rate_limit_remaining_percent`**：预算不足时优先砍后台增值任务，而非主任务。
10. **续跑基于 thread id 而非重发 prompt**。

### 8.5 不适用 / 需改造

| 点 | 为什么不直接抄 |
|---|---|
| **平台原生沙箱实现** | Seatbelt / bwrap+seccomp / MXC 都是 OS 特定、且需要特权或用户命名空间。Go 框架跨平台成本极高。**建议：Go 侧第一版只做"单进程内策略 + 路径/命令白名单 + 不 spawn 未授权命令"，把 OS 级隔离做成可选后端（Linux 上 bwrap，容器里直接跳过）。** |
| **`approvals_reviewer = auto_review`** | 需要额外模型调用（成本）+ 一个高质量策略文件（效果）。没有策略文件时，它会**看起来在工作但什么都没防住**。建议先做 `user` 审批，auto_review 作为第二阶段。 |
| **网络代理（SOCKS5、unix socket 白名单、upstream proxy 链）** | 这是完整的企业级网络栈，实现量巨大且坑多（DNS、UDP、socket）。**Go 侧先做"网络开关 + 域名 allowlist（在 http.Client 的 Transport 层做）"，不要碰 socket 代理。** |
| **`untrusted` 已退休这件事** | 说明"过于复杂的审批语义"最终会被砍。**Go 侧审批状态机应尽量少态**：建议只有 `auto`（沙箱内不问）/ `ask`（越界问）/ `deny`。别造五态。 |
| **托管配置 5 层优先级** | 企业需求驱动，自研早期完全不需要。**先做"默认 < 项目 < 用户 < CLI 覆盖"四层，留扩展点。** |
| **安全监控（可暂停任务）** | 依赖服务端能力，不可迁移。可迁移的只有"异步监控 + 可暂停"这个**形状**。 |

---

## 9. 可迁移到 Go 的机制清单

> 说明：**按"值得抄的程度"排序，不是按模块顺序**。复杂度用 L/M/H 标（相对一个 3–5 人月规模的 Go 项目）。"Go 侧落法"只给形状，不含实现。

### 9.1 第一优先（不做会返工）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G1** | **Thread / Turn / Item 三层模型** | 三个 struct + 严格 ID 关系；`Item` 用 `Type string + Raw json.RawMessage` 做扩展；所有事件、存储、UI、评测都对齐这三层 | L |
| **G2** | **沙箱与审批正交** | 两个独立字段：`SandboxPolicy{ReadOnly, WorkspaceWrite{dirs}, FullAccess}` 与 `ApprovalPolicy{Auto, Ask, Deny}`；**越界检查是纯函数**，输入(命令, 路径集, 策略) → 决策 | M |
| **G3** | **受保护路径递归只读** | 策略里内置 `.git`、`.agents`、`.codex`、`.aws`（+ 你自己的 `.dsh`）；**是目录还是 pointer file 都处理**；递归生效 | L |
| **G4** | **命令归一化** | 在策略判断前把命令归一（绝对路径 → 基名、去多余空白、展开 `bash -c` 一层、检测 `&&` / `;` / 管道分段）；**这是所有前缀规则的前提** | M |
| **G5** | **进度/结果分离** | `Run()` 返回 `(result, error)`，进度走 `io.Writer` 注入；CLI 层默认 result→stdout、progress→stderr；另留 `--output-last-message` 式落盘 | L |
| **G6** | **`turn.completed` 自带 usage** | Turn 结束事件结构里固定带 `Usage{Input, CachedInput, Output, ReasoningOutput}`；预算判断从事件读，不查账单 | L |
| **G7** | **续跑基于 thread id + 历史状态** | 持久化 `Thread{ID, Turns[], Items[], Status, Goal, Meta}`；`Resume(id)` 从存储重建；**绝不通过重发 prompt 续跑** | M |

### 9.2 第二优先（决定体验上限）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G8** | **`Steer` 与 `Queue` 分离** | Turn 上开两个 channel：`steerCh`（注入当前轮）与 `queueCh`（下一轮）；CLI 绑定两个键 | M |
| **G9** | **压缩阈值带"作用域"** | `CompactionPolicy{Limit int, Scope 取 Total 或 BodyAfterPrefix, PostTurnPercent int, Compactor}`；保留"压缩窗口前缀"概念避免抖动 | M |
| **G10** | **压缩是可替换策略 + 模型回退** | 抽象出一个 `Compactor` 接口（输入 Thread，输出"压缩前缀"）；提供本地实现 + fallback 实现；**压缩失败不能让会话死掉** | M |
| **G11** | **turn 结束后再压一次** | loop 末尾判断 `percent`，命中则在**返回结果之后**异步压 | L |
| **G12** | **AGENTS.md 四件套** | 向上发现项目根（`project_root_markers`）→ 向下拼装（每目录最多一个，override 优先）→ 就近覆盖 → **字节硬上限**截断 | M |
| **G13** | **goal 三要素 + 作为一等状态** | `Goal{Outcome, Constraints, Verification string; Status}`；`SetGoal/GetGoal/ClearGoal` + 变更事件；**auto 模式下缺 Verification 直接拒绝启动** | L |
| **G14** | **plan 作为增量 item** | `Item.Type = "plan"`，含 `Steps[]{Text, Done}`；**更新而非重写**；同时给调度器一份机器可读结构 | M |
| **G15** | **只读调查阶段**（`/plan` 语义） | `TurnMode: Plan（禁写）| Execute`；Plan 模式下沙箱强制 read-only | L |
| **G16** | **loaded / persisted 双集合 + 宽限期卸载** | 内存 `map[id]*Thread` + 持久层；引用计数归零后启动 `grace` 定时器，到期 unload 并 emit `thread/closed` | M |
| **G17** | **记忆 generate / use 分离** | 两个 bool：`Memories.Generate`、`Memories.Use`；注入点只在 system prompt 组装末尾 | L |
| **G18** | **记忆异步 + 空闲延迟 + 速率阈值** | 后台 goroutine：`idle > T` 且 `quotaRemaining > P%` 才抽取；两阶段（extract per-session → consolidate global） | M |
| **G19** | **记忆必须带引用** | `Memory{Text, Citations[]{SessionID, TurnID, ItemID}, CreatedAt, TTL}`；无引用的记忆**不许注入** | L |
| **G20** | **`include_turns` 式恢复** | `Resume(id, ResumeOpts{IncludeTurns bool})`；false 时只加载"供模型用的上下文"不回灌响应 | L |

### 9.3 第三优先（生产化必需）

| # | 机制 | Go 侧落法 | 复杂度 |
|---|---|---|---|
| **G21** | **事件流协议（JSON-RPC 2.0 / JSONL）** | `jsonrpc` 包 + `bufio.Scanner`（**务必放大 buffer，默认 64KB 会被长事件撑爆**）；**注意 Codex 的线上去掉了 `"jsonrpc":"2.0"` 头**，若做兼容要照做 | M |
| **G22** | **双接口面：批处理面 + 事件面** | 批处理：`Run(ctx, prompt) (Result, error)`；事件面：`Subscribe(ctx) <-chan Event`。**两者共用同一核心**，不要用一套 API 硬兼 | M |
| **G23** | **OTel 指标只定 8–10 个核心项** | 建议：`turn.duration`、`turn.ttft`、`turn.token_usage{type}`、`tool.call{tool,success}`、`tool.call.duration`、`approval.requested{decision}`、`task.compact{type}`、`thread.active`。其余按需加 | M |
| **G24** | **遥测默认脱敏 + 默认关闭** | 默认不记录 prompt 正文；开关名就叫 `log_user_prompt`（默认 false） | L |
| **G25** | **exec 的默认最小权限** | 非交互模式默认 **read-only** 沙箱（Codex 就是这么做的），要写必须显式 `workspace-write` | L |
| **G26** | **Git 仓库前置检查** | 非交互执行前要求处于 Git 仓库内（Codex 有此检查，可 `--skip-git-repo-check` 跳过）；**这是"防破坏"的低成本保险** | L |
| **G27** | **工具元数据层 + 工具定义延迟加载** | `ToolMeta{Name, ReadOnly, Destructive bool, ApprovalMode}`；工具数 > N 时只注入摘要，按需发现完整 schema | M |
| **G28** | **`approval.requested` 五态** | `Approved / ApprovedWithAmendment / ApprovedForSession / Denied / Abort` | L |
| **G29** | **Hooks：工具名正则 + 命令式动作 + 超时** | `Hook{Event, Matcher *regexp.Regexp, Command string, Timeout, StatusMessage}`；事件至少 `PreToolUse` / `PostToolUse`；**未开启的类别 fail closed** | M |
| **G30** | **`--output-schema` 只约束最终响应** | 用 JSON Schema 校验最终 `Result.Content`；中间过程自由文本 | M |
| **G31** | **`:root`/`allowlist` 网络策略（HTTP 层）** | 包一层 `http.RoundTripper`：域名 allowlist（`deny` 优先）、**解析出的 IP 若属私有段则拒**、lookup 失败即拒 | M |
| **G32** | **沙箱自测子命令** | `myagent sandbox test --log-denials <cmd>`；把安全边界纳入 CI | L |
| **G33** | **`threadSource` 打标** | `Thread.Source string`，创建时设、恢复时保留 | L |
| **G34** | **`--ephemeral`** | `RunOpts{Persist bool}`；false 时用内存存储实现 | L |

### 9.4 明确不要抄的（反向清单）

| 别抄 | 原因 |
|---|---|
| **`remote compaction` / `compact_remote_v2`** | 依赖服务端能力，你没有 |
| **完整 SOCKS5 / unix socket / upstream proxy 网络栈** | 实现量远超框架本体；HTTP 层域名策略已覆盖 90% |
| **五种审批语义（`on-request`/`never`/`on-failure`/`untrusted`/`granular`）** | 官方自己已砍掉两个（`on-failure` 弃用、`untrusted` 退休），说明过多态不可维护 |
| **`history.jsonl` 与 SQLite 双写** | 必然漂移；一份持久化即可 |
| **`memories_v2` 双写迁移机制** | 历史包袱；新项目从 v1 开始 |
| **Item 类型枚举绑定产品面** | 每加一个工具就要改协议 |
| **托管配置 5 层优先级链** | 早期纯负担 |
| **`nickname_pool_reset` 之类的 UI 产物** | 存在的理由是特定产品需求，不是架构 |

### 9.5 如果只抄 5 个

1. **Thread / Turn / Item 三层模型（G1）** —— 所有其它机制的挂载点。
2. **沙箱与审批正交 + 受保护路径（G2 + G3）** —— 安全模型的骨架，而且`.git`/`.agents`/`.codex`/`.aws` 那份清单是别人踩过坑的结晶。
3. **Steer / Queue 分离（G8）** —— 成本极低、体验差异极大；多数框架只有粗暴打断。
4. **AGENTS.md 四件套（G12）** —— 确定性优先的指令拼装规则，直接决定"提示词工程能不能被治理"。
5. **压缩阈值的作用域 + 时机（G9 + G11）** —— `body_after_prefix` 与"turn 结束后再压"这两点，是避免压缩抖动与感知延迟的现成答案。

---

## 10. 待核实清单（不要当结论用）

| # | 待核实项 | 现状 |
|---|---|---|
| 1 | TypeScript SDK 与 app-server 的**实际传输方式**（是否也走 JSON-RPC 子进程、是否有流式 API） | 我读到的官方 SDK 文档只展示了 `run()` 非流式用法，并明说"流式事件请用 app-server"。**TS 的具体传输未在文档中明示** |
| 2 | `codex exec-server --remote` 的用途与协议 | 仅在 CI 文档被顺带提及，无独立文档 |
| 3 | Codex 在 SWE-bench 类基准上的**官方分数与评测方式** | **未找到任何一手来源**；仓库无 evals 目录 |
| 4 | `compact_remote_v2` 的具体压缩算法（是否用第二轮模型、是否有验证步骤） | 只知道文件存在、55KB、OTel 有 `task.compact{type=remote}` |
| 5 | `rollout_budget.rs` 的预算维度（token? 时间? 步数?） | 只知道模块存在（4.1KB） |
| 6 | plan item 的**结构 schema**（是否机器可判定，还是纯文本） | 只知道 `--json` item 类型含 "plan updates" |
| 7 | `memories` 的注入格式（如何组织成 prompt 片段、引用如何呈现） | 只知道有 `has_citations`、脱敏、两阶段 |
| 8 | 社区封装的 `openai-codex-sdk`（PyPI）与官方 `openai-codex` 的关系 | 仅搜索标题，未核验内容，**有混淆风险** |

---

## 11. 来源列表

### 官方文档（〔A〕，均抓取 Markdown 原文）

1. Codex SDK — https://learn.chatgpt.com/docs/codex-sdk
2. Codex App Server（协议全文，本报告 §1/§4 的主要依据）— https://learn.chatgpt.com/docs/app-server
3. Sandbox（沙箱概念与平台实现）— https://learn.chatgpt.com/docs/sandboxing
4. Agent approvals & security（审批/网络/受保护路径/auto-review/OTel）— https://learn.chatgpt.com/docs/agent-approvals-security
5. Custom instructions with AGENTS.md（发现链与合并规则）— https://learn.chatgpt.com/docs/agent-configuration/agents-md
6. Long-running work（Goal mode）— https://learn.chatgpt.com/docs/long-running-work
7. Non-interactive mode（`codex exec` / `--json` / `--output-schema` / resume）— https://learn.chatgpt.com/docs/non-interactive-mode
8. Configuration Reference（压缩/沙箱/权限 profile/全部键）— https://learn.chatgpt.com/docs/config-file/config-reference
9. Advanced Configuration（history/OTel 指标与日志事件/shell env policy/profiles）— https://learn.chatgpt.com/docs/config-file/config-advanced
10. Memories（本地记忆存储与开关）— https://learn.chatgpt.com/docs/customization/memories
11. Prompting（steer vs queue、`/plan`、`/goal` 衔接）— https://learn.chatgpt.com/docs/prompting
12. 文档总索引（用于确认"没有 RAG 页"）— https://learn.chatgpt.com/docs/llms.txt
13. Configuration（仓库内 `docs/config.md`，含 managed hooks）— https://github.com/openai/codex/blob/main/docs/config.md
14. MCP server removal（迁移到 app-server）— https://learn.chatgpt.com/docs/mcp-server

### 仓库与代码（〔B〕，GitHub API / raw 核对）

15. 主仓库 — https://github.com/openai/codex
16. README（安装方式、平台产物、Apache-2.0）— https://github.com/openai/codex/blob/main/README.md
17. 根目录清单（确认无 evals/benchmarks）— https://api.github.com/repos/openai/codex/contents/
18. `codex-rs/core/src/` 清单（compact / rollout / agents_md / sandboxing / guardian 等）— https://api.github.com/repos/openai/codex/contents/codex-rs/core/src
19. app-server 实现 — https://github.com/openai/codex/tree/main/codex-rs/app-server
20. auto-review 默认策略 — https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/policy.md
21. TypeScript SDK — https://github.com/openai/codex/tree/main/sdk/typescript
22. Python SDK — https://github.com/openai/codex/tree/main/sdk/python

### 二手（〔C〕，仅交叉印证，正文未获取）

23. 中文源码剖析《137 个 crate 造出「敢在你电脑上动手」的 AI》— https://grapecity.csdn.net/6a89c32b10ee7a33f29dc8ad.html （**未直读，仅标题级参考**）
24. 第三方源码研究仓库 `xiaonancs/codex-source-analysis` — https://github.com/xiaonancs/codex-source-analysis （**未核验内容**）

---

*报告完。标〔D〕者为本人推断；§10 的待核实项请勿当作结论引用。*
