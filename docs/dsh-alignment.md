# DSH 工具面与安全模型基线 → simo M9/M10 对齐清单

> **目的**：给 simo 从"会聊天"升级到"能操作电脑 / 能浏览"提供一份**可对照的 DSH 基线**：工具清单、安全模型（沙箱/审批/约束/审计）、工具描述与系统提示词写法，以及 simo 的差距与 M9（工具运行时）/M10（浏览器）的落点建议。
> **日期**：2026-11-07｜**范围**：只调研与设计，**不改代码**。
> **证据等级**（本机 DSH checkout `E:\dsh\resources\app.asar\dsh` 的读取方式有特殊性，先说明）：
> - **[R·运行时]**：本会话通过 `cordis_inspect_query` 读到的**活运行时**事实（`Tool.listTools` 的完整 schema、`Config.listConfigs` 的配置 schema）——最硬证据。
> - **[R·包文档]**：本次用 file-read 直读 `E:\dsh\resources\app.asar\dsh\node_modules\@deepseek-ai\*\README.md` 的原文（注意：`read` 工具能读 asar 内部；`grep`/`pwsh`/`glob` **不能**——已实测 `grep` 报 `os error 3`，这是 asar 的访问边界）。
> - **[D]**：仓库内既有文档/契约（`docs/m1-contract.md`、`docs/m2-contract.md`、`docs/tech-stack.md`、`backend/README.md`、`design/19`、`design/20`、`harness/harness-map.md`、`research/dsh-mechanisms.md`）。
> - **[I·推断]**：由上述证据推导、未在运行时直接观测的结论（会逐条标注）。
>
> **重要边界**：本次抓到的工具清单来自**当前 profile / 当前会话的 preset（creator 类 preset）**。DSH 的工具面 = **Host 平面工具 + 所选 preset 的贡献**；换 preset 会增减工具（例：`tool-cordis` 只在 creator preset；`tool-web`/`tool-schedule` 由各 preset 自行挂载）。因此下表是"这一套组合"的真实快照，不是"DSH 全量工具的唯一形态"。

---

## 0. 一页结论

1. **DSH 的工具面不是"给模型一把万能锤"，而是"一族小而单义的工具 + 一套统一的执行/权限/输出治理"**：文件四件套（`read`/`read_image`/`write`/`edit`）、发现两件套（`glob`/`grep`）、执行（`pwsh` 或 `bash`，可选持久终端 6 件套）、网络两件套（`web_search`/`web_fetch`）、以及编排/上下文类（`subagent*`、`workflow`、`ralph`、team、goal、schedule、`todo_write`、`skill`、`present`…）。
2. **安全模型 = 三件套**：**沙箱模式**（`read-only` / `workspace-write` / `danger-full-access`，按会话可切换、可一次性提权）、**审批**（`ask` / `never`，fail-closed，一次性、与 turn 绑定、进审计）、**执行管线**（`tools/pre-execute` 的 allow/deny/ask → 单调 guard → 执行包装（超时/重试）→ post-execute（截断/spill/中和）→ 结果）。**提示词不做门禁**，门禁在代码里。
3. **"操作电脑"的边界非常清楚**：DSH 没有"看屏幕/点鼠标"的原生工具（本 profile 未挂 computer-use/browser-use）；它用 **shell（pwsh/bash）+ 文件工具 + 终端** 覆盖本机操作，用 **MCP** 作为接外部能力（含浏览器）的缝。**M9 应先对齐 shell/文件/审批/输出治理；M10 应对齐"web_search/web_fetch + MCP 浏览器"两条路**。
4. **simo 的差距不在"缺工具"，而在"缺治理"**：当前只有 `read_file/list_dir/search_text`（只读）+ `write_file` ask/delete deny，缺：进程执行面、per-call 提权、沙箱模式、输出/超时治理、`DSH_*` 环境重建、审计事件、工具名与参数形状对齐。
5. **最值得直接抄的三样**：① `sandbox_permissions` + `justification` 的"一次性严格更宽重试"（同一轮生效、必须写理由）；② 工具的"错误即数据"文案规范（`Error: <message>` + 稳定 code + recovery hint，工具失败不结束 turn）；③ 输出治理三层（inline 上限 → 落盘 spill + 取回提示 → 压缩期裁剪/摘要）。

---

## 1. DSH 工具表（当前运行时快照）

> 参数只列"关键参数"；完整 schema 见本会话 `Tool.listTools` 结果（已落盘为 spill 文件，见 §8 参考来源）。风险类别定义见 §1.6。

### 1.1 文件与搜索族

| 工具 | 用途 | 关键参数 | 风险 | 证据 |
|---|---|---|---|---|
| `read` | 读 UTF-8 文本，带行号与分页页脚 | `file_path`, `offset?`(1-based), `limit?`(默认/上限 `readLimit=2000`) | **R0 只读** | [R·运行时] 参数；[R·包文档] `dsh-tool-fs`：`readMaxBytes=51200`、`readMaxLineLength=2000`、`readStreamMinSize=10MB` |
| `read_image` | 读 PNG/JPEG/WebP/GIF 并存为附件（可被模型下一轮"看见"） | `file_path` | **R0 读本地**（但会把内容送进模型上下文） | [R·包文档] 需要 attachment store + 支持图片输入的模型；无扩展名按文件签名识别 |
| `write` | 创建或**整文件替换** | `file_path`, `content`, `sandbox_permissions?`, `justification?` | **R1 写**（工作区）/ **R4 越界** | [R·运行时] 参数含提权字段；[R·包文档] 覆盖需先 `read` 且版本未变；`fs-observation-policy` 提供 `FS_NOT_OBSERVED`/`FS_STALE_VERSION` |
| `edit` | 字面替换（默认要求唯一匹配） | `file_path`, `old_string`, `new_string`, `replace_all?`, `sandbox_permissions?`, `justification?` | **R1/R4** | 同上 |
| `glob` | 按 glob 找文件（含隐藏/忽略文件，排除 VCS 元数据），mtime 排序 | `pattern`, `path?` | **R0** | [R·运行时]；[R·包文档] `globMaxResults=100`、`sampleOverCapGlobResults`（必填） |
| `grep` | ripgrep 正则搜内容，按文件分组 | `pattern`, `path?`, `include?`(单个正向 glob) | **R0** | 同上；`grepMaxMatches=250`、`grepMaxLineBytes=2000`、`timeoutMs=30000`、`graceMs=3000`、原始输出上限 20MB（`SEARCH_RAW_OUTPUT_OVERFLOW`） |
| `working_directory` | 读/切换会话 cwd（持久、影响后续相对路径） | `cd?` | **R1（状态变更，不写文件）** | [R·运行时] 描述原文 |
| `create_worktree` | 从本地 commit/branch/tag 建 git worktree 并切 cwd | `name?`, `from?` | **R2 改变工作区**（写 git 元数据） | [R·运行时] 描述原文 |

> **注意**：DSH **没有 `list_dir` 工具**——目录发现由 `glob` 承担（`glob` 含隐藏/忽略文件、按 mtime 排序）。simo 若保留 `list_dir`，属于"额外工具"，不是对齐项。

### 1.2 执行族（"操作电脑"的主入口）

| 工具 | 用途 | 关键参数 | 风险 | 证据 |
|---|---|---|---|---|
| `pwsh` | **一次性** PowerShell 进程执行（Windows 组合的主 shell） | `command`, `description`（要求先写）, `timeoutMs?`, `workdir?`, `run_in_background?`, `sandbox_permissions?`, `justification?` | **R2 进程执行**（最高风险面） | [R·运行时] 参数；[R·包文档] `dsh-tool-pwsh`：每次新进程、`promoteOnTimeout=true`（超时转后台作业）、`[exit code: N]` 标记、非零退出**不是**工具错误；沙箱拒绝显示 `[sandbox: file access denied under <mode> mode]`；受限令牌下 ConstrainedLanguage 与命名管道约束 |
| `bash`（孪生，本组合**未挂载**） | 同 `pwsh` 的 POSIX 形态 | 同上（`dsh-tool-bash`） | **R2** | [R·包文档] pwsh README 明说两者 call-for-call 对齐；[D] 预设里 `tool-bash` 在 win32 上 `disabled`（只有 `tool-pwsh` 生效），因此本 Windows 组合没有 bash 工具。**包是否存在未验证**：`grep`/`rg` 无法读 asar（实测 IO error），不能据此判定包缺失 |
| `terminal_open` / `terminal_send` / `terminal_read` / `terminal_signal` / `terminal_close` / `terminal_list` | **持久 PTY** 会话：跨调用的 shell/REPL 状态 | `type`(`shell`), `name?`, `cwd?`；`sessionId`；`text`/`submit?`/`run_in_background?`；`offset`/`count`；`signal`(SIGINT/SIGTERM/SIGKILL/SIGTSTP/SIGHUP，shell 上 SIGKILL 被拒) | **R2**（会话持有状态） | [R·运行时] 完整 schema；[D] `research/dsh-mechanisms.md` §8：owner-scoped、单 send 预留、关闭等进程树静默 |
| `job_output` / `job_list` / `job_kill` | 后台作业观察与控制 | `job_id`, `wait?`, `timeout_ms?`；`job_id`, `reason?` | **R2 间接**（作业由执行工具产生） | [R·运行时] |

> **关键语义**（M9 必抄）：① 执行工具的**非零退出是正常结果**（`[exit code: N]`），只有 spawn/abort 等基础设施失败才是工具错误；② 前台超时可"升级为后台作业"并把已有输出交给 `job_output`；③ 沙箱拒绝是**结构化 marker + 提权重试提示**，不是一个黑盒错误。

### 1.3 网络族

| 工具 | 用途 | 关键参数 | 风险 | 证据 |
|---|---|---|---|---|
| `web_search` | 一次 1–4 个 query，合并去重、附来源 URL，要求引用 | `queries: string[1..4]` | **R3 网络出站**（外部不可信内容入口） | [R·运行时]；[R·包文档] `searchMaxResults=8`、`searchMaxQueries=4`、`searchTimeoutMs=30000`、**超时/条数上限是部署配置、不出现在 schema** |
| `web_fetch` | 取一个 URL，HTML→markdown；文本按不可信内容提示透传 | `url` | **R3**（SSRF/内容注入面） | 同上；`fetchTimeoutMs=30000`、`fetchMaxOutputChars=200000`；**非 2xx 是结果、不是抛错**；截断附"再取更具体 URL"提示 |

> **DSH 本 profile 没有 agent 浏览器工具**（无 navigate/click/screenshot）；浏览器在 DSH 里是**用户侧 UI**（右侧栏 Browser tab，客户端插件 `client-ui-sidebar-browser`），以及**可安装的 browser-use 实验包**（chrome-devtools-mcp / playwright-mcp / stagehand-native，目录里有、本机未装）。→ 见 §5 M10 建议。

### 1.4 上下文 / 技能 / 人机交互族

| 工具 | 用途 | 关键参数 | 风险 |
|---|---|---|---|
| `skill` | 加载技能全文（先看目录、按需取正文） | `name` | R0 |
| `session_search` / `session_event_search` / `session_trace` / `session_event_trace` / `session_event_read` | 跨会话/单会话的只读检索与溯源 | `query`, 过滤条件；`session_id?`, `seq` 等 | R0（跨会话授权按 cwd） |
| `todo_write` | 执行期任务清单（整表替换、写会话日志） | 见工具 schema | R1（状态） |
| `present` | 声明"这些文件是交付物"给用户 | `files[{path, description?}]`（≤4） | R1（改 UI 事实） |
| `ask_user_question` | 向人提问/选择（阻塞等待） | `questions[]` | R0（但会阻塞流程） |
| `exit_plan_mode` | 退出 plan 模式（人工审批计划） | `plan`(markdown) | R1（模式切换） |
| `load_workspace_dependencies` | 取捆绑 Python/Node 路径与库版本 | 无 | R0 |
| `cordis_inspect_list` / `cordis_inspect_query` | 只读运行时自省（Service/Event/Config/Tool/Slots/Theme） | `platform`, `provider`, `method`, `input` / 无 | R0（只读） |
| `plugin_manager` / `plugin_market` | 启停/安装插件与浏览市场 | 见 schema | **R2/R5**（会执行插件代码！） |

### 1.5 编排族（多 agent / 长任务）

| 工具 | 用途 | 关键参数/约束 | 风险 |
|---|---|---|---|
| `subagent` / `subagent_fork` | 派独立上下文的子 agent（fresh / fork）；立即返回 id，结果回流 | `description`,`prompt`,`cwd?`,`provider?`,`model?`,`reasoning_effort?` | R1（产生执行） |
| `send_message` / `interrupt_agent` / `list_agents` | 对子/队友发消息、打断、列成员 | `target`, `message` / `target` / 无 | R1 |
| `spawn_teammate` / `wait_agent` / `team_task_*` | Agent Teams：具名队友 + 共享任务板（CAS 版本） | 见 schema | R1/R2 |
| `workflow` | 跑 JS 编排脚本（沙箱 PTC），`agent()/parallel()/pipeline()` | `script`, `meta`, `args?` | **R2/R5**（脚本执行） |
| `ralph` | 固定循环：每轮全新 agent 冲同一目标 | `objective`, `maxRounds?` | R1 |
| `goal` 工具（`create_goal`/`get_goal`/`update_goal`） | 跨 turn/重启的单一目标 + 轮次预算 | 见 schema | R1 |
| `schedule_*` | 定时提醒（投回原会话） | 见 schema | R1 |
| `exit_plan_mode` / plan 模式 | 计划阶段人工审批 | `plan` | R1 |

### 1.6 风险类别（本文统一口径，供 M9 复用）

| 级别 | 含义 | 典型工具 | 默认处置 |
|---|---|---|---|
| **R0 只读** | 只读取，不改变任何外部状态 | `read`/`glob`/`grep`/`read_image`/`web_search`/会话检索 | allow（web 除外，见 R3） |
| **R1 局部写** | 改变工作区/会话内状态 | `write`/`edit`/`todo_write`/`present`/goal/schedule | workspace-write 下 allow；越界转 R4 |
| **R2 执行** | 起进程、跑代码、持有终端/作业 | `pwsh`/`bash`/`terminal_*`/`workflow`/`ralph`/`subagent` | **默认 ask**（或沙箱内 allow + 越界 ask）；非零退出不算失败 |
| **R3 网络出站** | 把数据发到外部 / 取外部内容 | `web_search`/`web_fetch`（未来 MCP/browser） | allow 但**内容一律标 untrusted**；敏感数据外发升级为 R4 |
| **R4 越界/提权** | 写工作区外、改系统、提升沙箱模式 | `sandbox_permissions`+`justification` 的任何调用 | **ask + 一次性 grant（严格更宽）**，必须写理由，进审计 |
| **R5 安装/扩展** | 安装插件、执行第三方代码、接 MCP | `plugin_manager`/`plugin_market`/MCP server | **ask**，且只允许白名单来源 |

---

## 2. DSH 安全模型

### 2.1 沙箱模式（sandbox-policy）

- **三种模式**（`Config` schema 枚举，实测）：`read-only`（默认）/ `workspace-write` / `danger-full-access`；部署默认 + **会话级覆盖** + **单次调用提权**。
- **工作区边界**：`workspace-write` 只允许写到「会话的不可变 cwd（= workspace root）」或**平台临时目录**；`read-only` 拒绝一切变更；`danger-full-access` 不限制。
- **模式是事件**：会话切换模式写一条 **log-only `sandbox/mode` 事件**（可回放、重启后仍然有效）；`effective = 单次授权 ?? 事件 fold ?? 部署默认`（[R·包文档] `dsh-sandbox-policy` README）。
- **不是内核边界**：`fs-sandbox` 自己写明"这是 trusted code 里的策略检查 + canonicalize-then-contain，不是 kernel boundary"；残余 TOCTOU 用"写入前立刻重新 canonicalize"收窄；**真正的 OS 级隔离在 shell 执行器**（Windows 受限令牌 / Seatbelt / bwrap）。
- **模型可见**：每个请求的运行时上下文里有一段 `sandbox:policy`（说明当前模式与可写根），并明确："**不要仅因为策略就拒绝**；照常调用工具，按工具返回的拒绝/提权指引处理。" —— 这条设计让"拒绝"变成工具层可解释的行为，而不是模型自己猜。

### 2.2 审批（allow / deny / ask + fail-closed）

> 来源：[R·包文档] `dsh-user-approval`、`dsh-permission-presets`（Config schema 实测）、`dsh-tools`（管线）；[D] 本会话系统提示中的约定。

- **两种审批策略**：`ask`（默认，交给"answerer"/人类或机器裁决）与 `never`（**直接拒绝**，确定性的无人值守姿态）。
- **fail-closed**：**没有 answerer / answerer 失败 → `unavailable` → 动作不执行**。审批缺失不是"放行"。
- **一次性**：一个 approval 只对**那一个请求**有效；等待期间的工具调用被挂起，**超时/取消也 fail-closed**。
- **与 turn 绑定**：审批请求必须 turn-enclosed（"turn 是持久日志的提交/重放边界"），turn 之间的裸事件与崩溃尾无法区分。
- **审计**：每个 approval 请求与结果都写进**请求会话的审计日志**；模型只看到工具结果（allowed/rejected/cancelled/unavailable）与当前策略，**看不到审批 UI/审计事件**。
- **权限预设 = 沙箱模式 × 审批策略的打包**（schema 实测默认值）：

| 预设 | sandbox | approval | 含义 |
|---|---|---|---|
| `workspace-write`（默认档之一） | workspace-write | **ask** | 工作区内直接写；更宽操作需审批 |
| `danger-full-access` | danger-full-access | **never** | 全文件访问、**不弹审批**（危险档，显式选择才生效） |

  > 预设可自定义（`presets: {name: {sandbox, approval, name?, description?}}`），`defaultPreset` 是会话新选择的默认值（volatile 字段，由设置页写回）。
- **六步权限求值顺序**（DSH 管线 + simo 已实现同序）：`hooks → deny → ask → mode → allow → canUseTool`；纪律：**hook 的 allow 不能跳过 deny**；**deny 在 bypass 模式仍生效**；**自动批准永远不调用 canUseTool**（要记 warning）；**未命中任何规则且无 canUseTool → 拒绝**（fail-closed）。

### 2.3 命令 / 路径约束

- **cwd 模型**：每个工具调用用**会话 cwd** 解析相对路径；`workdir` 只是本次调用的启动目录，**不改变**会话 cwd；shell 命令自己的 `cd` 也不改会话 cwd。
- **路径规范化**：写入前**重新 canonicalize 目标**并要求包含在可写根下（防 symlink 祖先被替换）；拒绝时返回结构化 `FsError`/`FS_SANDBOX_DENIED`，不是靠 stderr 猜。
- **读前写守卫**（可选但默认组合里有）：`write`/`edit` 需要**先 `read` 且文件版本未变**；否则 `FS_NOT_OBSERVED` / `FS_STALE_VERSION`，并给出"先读再试"的恢复指令。
- **删除**：DSH **没有 delete/rm 工具**；删除只能经 shell/R4 路径，因此天然进入 R2 审批面（这是有意的设计——删除不提供"看起来安全"的专用工具）。
- **工作目录切换**：`working_directory` 是显式工具 + 持久事件，不靠 prompt 里说"我现在在 X"。

### 2.4 超时 / 输出上限 / 结果治理

| 层 | 机制 | 数字（实测/文档） |
|---|---|---|
| 工具调用超时 | 工具 schema **不暴露** `timeoutMs` 给模型（frontend/search 明确"部署配置"）；执行类工具 `pwsh` 有 `timeoutMs` 参数但**由调用方给**；统一超时由 `tool-call-timeout-policy` 包 **声明式**执行（定义上的 `timeoutMs` 只声明不强制） | `dsh-tool-fs-search`: `timeoutMs=30000`,`graceMs=3000`；`web`: 30s；fs read 上限见 §2.4 下表 |
| 单次读取 | `read` 有 **行数/字节/单行长度** 三上限 | `readLimit=2000` 行、`readMaxBytes=51200`、`readMaxLineLength=2000` 字符 |
| 搜索 | 内联条数 + 单行字节 + 原始输出硬上限 + 诊断尾上限 | glob 100、grep 250、grep 行 2000B、raw 20MB、stderr 64KB |
| 网络 | 结果条数/query 数/超时/输出字符 | search 8 源/4 query/30s；fetch 30s/200,000 字符 |
| 工具结果「超预算」 | **spill**：超 `maxInlineTokens`（本 profile 由 `dsh-spill-policy` 控制，研究记录值 12500 估算 token）→ 落盘 + 确定性提示行（"Omitted N bytes. Full result stored at <path>. Use read with offset/limit, or grep this path"） | `dsh-spill-policy` / `dsh-spill-local` |
| 压缩期裁剪 | 超 `thresholdChars=8192` → 头 4096 + 标记 + 尾 1024（code point）；`read` 的结果豁免（防自噬） | `dsh-compaction-tool-result-pruner` |
| 后台作业 | 每 job 有界输出环（live 256KiB / settled 16KiB，模型未读字节保留） | `dsh-jobs-local` |

> **共同原则**：**省略必须自带可恢复路径 + 精确计数**；"截断"不是终点，"落盘 + 指路"才是。

### 2.5 环境清理

- **`DSH_*` 命名空间每调用重建**：执行器**丢弃继承的 `DSH_*`**，合并注册表当前快照；`process.env` 不被修改。内置：`DSH_HOME`、`DSH_SHELL=1`、`DSH_SESSION_ID`、`DSH_PROFILE`、`DSH_PROFILE_DIR`；插件贡献需**声明 key**（全大写+下划线、必须有 description、重复/占用保留 key 在加载期报错）。
- **凭据**：本地配置/环境变量提供；**不入库、不进日志**（`docs/tech-stack.md` §5）；PTC/工作流程序可见环境为空（研究记录），网络不受文件策略限制。
- **受限令牌副作用**（Windows）：read-only shell 跑在 ConstrainedLanguage（`.NET` 静态调用/`Add-Type`/COM/反射失败），两种受限模式都**不能开命名管道**（捕获别的程序输出会 EPERM）；工具描述里直接教模型这两条，避免把它误判成命令坏了。

### 2.6 审计

- **一切先落事件**：工具调用/结果、审批决策、沙箱模式切换、检查点、压缩边界都是会话事件；"模型可见 ⟺ 已记录"。
- **审批**：请求+结果进请求会话的审计日志（模型不可见）。
- **不可信内容**：工具结果回填前统一**中和/转义**（来源标签 + 框架标签 + `<` 转义 + 字节预算），且**不可信内容不得直接触发写记忆/写文件/改策略**。
- **三屏障检查点**：模型请求前 / 顶层副作用前 / 每步前 flush，崩溃恢复用"未知结果"合成而非自动重试（与工具面直接相关：`OUTCOME_UNKNOWN` 语义）。

---

## 3. 工具描述与系统提示词写法（对齐要点）

> 证据：[R·包文档] 各工具 README 的 "Model Experience / description" 章节；[R·运行时] 工具描述原文；[D] `dsh-system-prompt` 研究笔记。

1. **命名单义、动作粒度小**：`read`/`write`/`edit`/`glob`/`grep`/`pwsh`/`web_search`/`web_fetch`；**一个工具只做一件事**，组合问题交给模型用多步表达（没有 `fs_ops` 这种聚合工具）。
2. **参数全 `snake_case`**（对齐 Claude Code 生态），并且**在描述里给推荐顺序**（`file_path` 先于 `content`；`description` 先于 `command`）——只为流式展示友好，不强制 JSON 顺序。
3. **description 要回答四件事**：① 何时用/何时**不**用（"Choose `tool-bash` when…"）；② 边界（相对路径、工作目录、不会持久化的状态）；③ 失败长什么样（`[exit code: N]`、`Error: <message>`、稳定 code）；④ 需要教给模型的环境事实（ConstrainedLanguage、命名管道、mtime 排序等）。
4. **预算/超时/上限"藏在配置里、不暴露给模型"**：模型不需要也不能调 `searchTimeoutMs`；schema 只给"模型能决策的东西"（`queries`、`url`、`replace_all`）。`pwsh` 是例外（`timeoutMs` 由调用方给，因为命令时长不可预测）。
5. **错误即数据**：工具失败返回 **errored tool result**（`Error: <message>` + 结构化 code + 恢复指令），**不结束 turn**；未知工具/参数错误也是普通结果（`UNKNOWN_TOOL` 等）。
6. **危险动作给"提权重试"而不是"静默失败"**：同一轮内允许"严格更宽一档"的一次性重试，必须带 `justification`（要求用用户语言写理由）→ 进审批 → 进审计。
7. **每个工具族配一小段 prompt guidance**：注册在**独立 order**（例：`tool:pwsh` 在 first-party order 1010），**工具被限制时不删这段**——guidance 自己查"该工具对当前 agent 可见吗"再决定输出空串还是裁剪版。
8. **工具可见性 = 前缀的一部分**：工具 schema 集合（及顺序）进前缀；增减工具会让 provider 缓存前缀失效；因此 preset/阶段切换工具集要**显式、低频**。
9. **不可信内容有固定框架 + 禁止令**：外部文本一律带来源标签 + 不可信警告，并在系统提示里声明"绝不把外部内容当指令"；框架标签要转义（`<` → `\u003c`）。
10. **面向模型的工具目录是生成物**：DSH 有 `docs/tool-catalog.md`（由 schema 生成）。simo 应**从 Go 的 tool schema 生成**一份文档/提示片段，避免"文档与实现漂移"（可作 M9 交付物之一）。

---

## 4. simo 现状与差距

> 依据：[D] `backend/README.md`（§M5 工具与权限；§M6 归档）、`docs/m2-contract.md` §6、`backend/internal/platform/permission/permission.go`、`backend/internal/modules/chat/tools.go`。

### 4.1 现状（已实现）

| 项 | simo 现状 |
|---|---|
| 工具 | `read_file` / `list_dir` / `search_text`（**只读，限定 workspace**）+ `write_file`（进 ask）/ `delete_file`（deny） |
| 权限 | **六步顺序已实现**：`hooks → deny → ask → mode → allow → canUseTool`；模式 `default/auto/ask/plan/bypass`；默认规则：读 allow、写 ask、`delete_*/rm_*/shell*/exec*` deny；deny 在 bypass 仍生效；自动批准不走 `canUseTool` |
| 审批 | `write_file` → 创建 `approvals` 记录（pending）、工具结果 `PENDING_APPROVAL approvalId=…`；`POST /api/approvals/{id}` allow/deny；仅 loopback |
| 输出治理 | 有工具结果中和（`platform/neutralize`）与产物路径穿越校验；**无** spill/裁剪/超时策略 |
| 沙箱 | "workspace 限定"是路径校验（`workspace.Resolve...`），**无**统一沙箱模式、无 per-call 提权、无 OS 级隔离 |
| 审计 | 事件日志 + approvals 表；**无** DSH 式的 permission/approval 统一审计事件 |

### 4.2 差距（按影响排序）

| # | 差距 | DSH 基线 | 影响 |
|---|---|---|---|
| **G1** | **无进程执行工具**（shell/pwsh/terminal） | `pwsh`/`bash` + 持久终端 6 件套；`[exit code: N]`、后台作业、超时升级 | "操作电脑"的直接能力缺失；所有需要跑命令的场景只能靠未来实现 |
| **G2** | **无 per-call 沙箱提权**（`sandbox_permissions` + `justification`；一次性、严格更宽、进审批） | 文件与 shell 工具都带；拒绝返回结构化 marker + 同一轮重试提示 | 要么全放行、要么全拒绝，无法"默认最严 + 单次授权" |
| **G3** | **无沙箱模式抽象**（`read-only`/`workspace-write`/`danger-full-access` + 会话可切换 + 事件化） | 统一 policy 服务；`sandbox/mode` 事件；模型可见 `sandbox:policy` | 权限语义散在工具/路径校验里，无法按会话调档 |
| **G4** | **工具命名/参数形状不对齐**（`read_file`/`list_dir`/`search_text` vs `read`/`glob`/`grep`） | 单义命名 + snake_case + 分页参数（offset/limit） | 提示词/评测/迁移成本；`list_dir` 与 `glob` 语义重叠 |
| **G5** | **输出/超时治理缺失**（无 inline 上限 → spill → 取回提示；无声明式 timeout；无压缩期裁剪） | 三层治理 + spill 提示行 + timeout policy | 大输出会撑爆上下文/日志；工具卡死无统一 deadline |
| **G6** | **无 `DSH_*` 式环境重建**（每次执行丢弃继承、合并声明式快照、不改进程 env） | `shell-env` 注册表 | 进程间泄漏/串味；测试与子 agent 会继承脏环境 |
| **G7** | **审批语义简化**（无 fail-closed 的 `unavailable`、无 turn-enclosed、无审计事件、无"一次性"表述） | 见 §2.2 | 无人值守/并发/崩溃恢复时行为不确定 |
| **G8** | **无网络/浏览能力**（无 `web_search`/`web_fetch`/MCP） | web 两件套 + MCP client seam + 可安装 browser-use | 用户要求的"浏览"缺口 |
| **G9** | **无工具目录生成与 guidance 段** | tool-catalog 生成物；每族 guidance 独立 order、随可见性裁剪 | 提示词与实现漂移；模型不知道"何时用哪个" |

---

## 5. M9 / M10 建议

### 5.1 M9：工具运行时（Tool Runtime）

**目标**：在 simo 现有六步权限 + workspace 限定之上，补齐"可执行 + 可治理 + 可审计"的工具体系，并让工具名/参数与 DSH 对齐。

#### M9-1 工具清单（建议改名 + 新增）

| 建议工具名 | 对应 DSH | 关键参数 | 风险 | 备注 |
|---|---|---|---|---|
| `read`（由 `read_file` 改名） | `read` | `file_path`, `offset?`, `limit?` | R0 | 保留"行号 + 分页"；加上限（行/字节/单行） |
| `write`（由 `write_file`） | `write` | `file_path`, `content`, `sandbox_permissions?`, `justification?` | R1/R4 | 保留 ask；新增提权字段 |
| `edit`（新增） | `edit` | `file_path`, `old_string`, `new_string`, `replace_all?` + 提权字段 | R1/R4 | 与 write 共用"读后写/版本守卫" |
| `glob`（新增，替代 `list_dir`） | `glob` | `pattern`, `path?` | R0 | 目录发现改由 glob（含隐藏/忽略、mtime 排序） |
| `grep`（由 `search_text` 改名） | `grep` | `pattern`, `path?`, `include?` | R0 | 返回 `Line N: <preview>` |
| `pwsh`（新增；Windows 主执行面） | `pwsh` | `command`, `description`, `timeoutMs?`, `workdir?`, `run_in_background?`, `sandbox_permissions?`, `justification?` | **R2** | **M9 的核心**：每次新进程、合并输出、`[exit code: N]`、非零退出不算工具错误；超时→后台作业（可选） |
| `read_image`（可选） | `read_image` | `file_path` | R0 | 需附件存储 + 图片输入模型（放 P1） |
| `todo_write`（可选） | `todo_write` | 见 DSH | R1 | 若 simo 已有任务面板，可后置 |
| `present`（可选） | `present` | `files[]` | R1 | 与现有产物/交付物联动 |
| `ask_user_question`（可选） | `ask_user_question` | `questions[]` | R0 | 补"真歧义/风险确认"通道 |
| `working_directory`（可选） | 同名 | `cd?` | R1 | 替代"隐式 cwd 变化" |

> **保留 `delete_file` 的 deny 语义**：DSH 没有删除工具（删除走 shell → R2 审批），这是更安全的形状；simo 若能保证"删只能经 pwsh + ask"，可考虑移除 `delete_file`（或永久 deny）。

#### M9-2 沙箱与审批（对齐 §2）

1. **引入统一 `SandboxPolicy`**：`mode: read-only|workspace-write|danger-full-access`（默认 read-only）+ `workspaceRoot` + **会话级覆盖事件**（`sandbox/mode`，append-only，重启可回放）。
2. **路径围栏**：所有写/删/执行的可写根 = workspace（+ 平台 temp）；写入前 canonicalize + containment；拒绝用结构化 code（如 `FS_SANDBOX_DENIED`）+ `[sandbox: file access denied under <mode> mode]` 文案 + 提权提示。
3. **per-call 提权**：`sandbox_permissions`（枚举：只允许**严格更宽**一档）+ `justification`（必填，用户语言）；**同一轮内一次性有效**，必须经审批，审批后只作用于该次调用。
4. **审批语义补齐**：`ask` / `never` 两档；**无 answerer → 拒绝（fail-closed）**；一次性；turn-enclosed；写审计事件（`permission/requested`、`permission/resolved`、`approval/pending`、`approval/resolved`）。
5. **六步顺序保持不变**，但补两条 DSH 纪律：hook allow 不跳过 deny；自动批准记 warning。

#### M9-3 输出 / 超时 / 环境 / 审计

1. **工具结果三层治理**：单次内联上限（建议先按 provider 上下文 10%）→ 超限落盘 `SIMO_HOME/spill/` + 固定提示行（`Omitted N bytes; full result at <path>; use read/grep`）→ 会话压缩时裁剪/摘要（引用 design/20 的三段式）。
2. **声明式超时**：每个工具定义带 `timeoutMs`（执行类可被调用方覆盖），统一 `tools/execute` 包装器执行 deadline；超时返回 `TOOL_TIMEOUT`，**不结束 turn**。
3. **`SIMO_*` 环境重建**：每次 shell 执行丢弃继承的 `SIMO_*`，注入 `SIMO_HOME`、`SIMO_SESSION_ID`、`SIMO_SHELL=1` 等；进程 `os.Environ` 不改；贡献者需声明 key（对齐 DSH shell-env 的"声明所有权"）。
4. **审计事件**（最小集）：`tool/call`、`tool/result`（含三态）、`permission/decision`、`approval/*`、`sandbox/mode`、`spill/created`。全部 append-only，模型可见 ⟺ 已记录。
5. **工具目录生成**：从 Go 的 schema 生成一份 `docs/tool-catalog.md`（名称/参数/风险级别/审批点），供提示词与文档共用（对齐 DSH 的生成式 tool catalog）。

#### M9-4 风险分级与审批点（可直接实现为规则表）

| 工具/动作 | 默认 verdict | 审批点 | 说明 |
|---|---|---|---|
| `read`/`glob`/`grep` | allow | 无 | workspace 内只读；越界由 fs 策略拒绝 |
| `write`/`edit`（workspace 内） | allow（workspace-write） | 无 | 读后写/版本守卫 |
| `write`/`edit`（越界或提权） | **ask** | 一次性 grant | `justification` 必填 |
| `pwsh`（read-only 类命令） | allow（可选，需命令分类器） | 无 | **建议 M9 先一律 ask**，等命令分类器成熟再放开 |
| `pwsh`（写/网络/系统变更） | **ask** | 每次 | 默认 deny 某些前缀（`rm -rf`、`format`、注册表写入、服务管理） |
| `install`/`plugin_manager`/MCP 新增 server | **ask** | 每次 | 白名单来源 |
| `web_fetch` 到内网/私网地址 | **deny** | 无 | SSRF 防护（M10 前先做 URL 校验） |
| 删除类（若保留工具） | **deny** | 无（或 ask+二次确认） | 对齐 DSH"无删除工具"的设计意图 |

### 5.2 M10：浏览器

**结论先行**：**不要自研浏览器内核**。DSH 的做法是「**没有 agent 浏览器工具**：用户侧 Browser tab 是 UI 插件；agent 侧用 `web_search`/`web_fetch`；真要操作浏览器就接 **MCP**」。simo 应沿这条缝走：

#### 方案对比

| 方案 | 做法 | 对齐度 | 风险/成本 |
|---|---|---|---|
| **A. MCP 浏览器（推荐）** | 实现 MCP client（对齐 `dsh-mcp-client` 的 seam：server 注册 → tools/resources 动态注册进工具面），接 Playwright MCP / chrome-devtools-mcp | 高（DSH 正是"能力靠 MCP 接"） | 需 MCP client 运行时 + 每个 server 的审批/白名单；工具数量膨胀 |
| **B. 自研 CDP 直连** | Go 直连 Chromium CDP，暴露 `browser_*` 工具 | 低（DSH 无此形态） | 自建协议/会话/生命周期/隔离；长期维护成本高 |
| **C. 只做 web_fetch 增强** | 加 HTTP 抓取 + 渲染（headless）取静态 HTML | 中 | 不能交互/点击/登录；适合"读网页"而非"用网页" |

**建议：M10 = A（先接一个浏览器 MCP server，做通一条"导航→取内容→标注不可信→截图回填"的最小链），同时把 `web_search`/`web_fetch` 作为无浏览器时的降级路径。**

#### M10 工具面（通过 MCP 暴露时，建议统一包装而非直接透传）

| 建议工具名 | 参数（建议） | 风险 | 审批点 |
|---|---|---|---|
| `browser_navigate` | `url`, `waitUntil?` | **R3/R5** | **首次访问新 origin 必 ask**；origin 进 allowlist 后 allow |
| `browser_snapshot`（或 `browser_get_text`） | 无 / `format?: text\|a11y\|markdown` | R3（外部内容→不可信） | allow（内容一律 untrusted） |
| `browser_click` / `browser_type` / `browser_press` | `selector`/`ref`, `text?`, `key?` | **R2**（可触发提交/付款/发消息） | **ask**（可配"允许列表内的只读页面自动放行"） |
| `browser_screenshot` | 无 | R3 | allow；截图经 `read_image` 进上下文（受图片预算限制） |
| `browser_evaluate`（JS 执行） | `expression` | **R5** | **deny**（默认不给；需要时单独开） |
| `browser_download` / upload | `path`, `url` | **R4** | ask + 路径白名单 |
| `browser_tabs`（列表/切换/关闭） | 无 / `tabId` | R2 | allow（关闭前 ask 可选） |

#### M10 安全要点（对齐 DSH 的安全哲学）

1. **origin allowlist + 首次导航审批**；未知 origin 一律 ask；`file://`、`chrome://`、内网地址默认 deny。
2. **页面内容一律 untrusted**：来源标签 + 框架标签 + 转义；**不可信内容不得触发写文件/改策略/发消息**；对"页面里的指令"要有显式禁止令（提示词层）+ 结构层拦截（工具层）。
3. **下载/上传/凭据/cookie** 是独立审批点；**不自动填充**任何已保存凭据。
4. **截图进上下文要计量**：按图片预算（E2 §4/§7），超限只给路径 + 取回提示。
5. **浏览器进程隔离**：独立 profile/临时 user-data-dir、禁用扩展、限制并发 tab、明确超时；崩溃不拖垮 simo。
6. **审计**：导航/点击/提交/下载/脚本执行都写事件（含 URL、origin、动作、结果），支持回放。

---

## 6. 未验证项（明确标注）

| # | 未验证项 | 原因/影响 |
|---|---|---|
| 1 | DSH 审批审计**事件名/字段**的精确形状 | 只读到"会写审计日志"的契约；未读到 session event schema。M9 审计事件名可按 §5.1 先自定，后续对齐 |
| 2 | `tool-bash` 的**输出截断数字**（`maxOutputBytes` 等） | 该工具在 Windows 组合未挂载（预设里 `disabled`）；pwsh README 只说"与 bash 一致"。另：asar 内路径 `rg` 读不了，包是否存在只能靠 `package.json`/catalog 推断（本文未据此下结论） |
| 3 | DSH 的 **MCP client 在本 profile 未挂载**（`Config.listConfigs` 查 `dsh-mcp-client` 返回空） | 说明"接 MCP"是可选组合；其配置项与启用方式未在本机验证 |
| 4 | browser-use / computer-use 包的**真实工具 schema** | 目录里有（chrome-devtools-mcp / playwright-mcp / stagehand-native / cua-driver），**本机未安装**；只有目录描述 |
| 5 | 本 profile 的**实际生效沙箱模式/默认预设** | 读到部署默认（read-only）与预设 schema；桌面 app 是否通过 settings 改了默认（`defaultPreset` volatile）未验证 |
| 6 | `danger-full-access` 是否**永远**不带审批 | 预设默认 `approval: never`；是否有其他组合/覆盖未验证 |
| 7 | 沙箱在**容器/远程**下的执行器差异（bwrap/Seatbelt/受限令牌） | 只读到 seam 契约；本机为 Windows 受限令牌路径 |
| 8 | DSH **网页 UI 的 Browser tab** 是否对 agent 工具可见/可驱动 | 它是客户端插件（用户侧），未见 agent 侧接口；推断"不可驱动" |
| 9 | DSH 工具数量上限/稠密度对模型的影响（Tool Search 未启用） | 本会话工具数已 56 个；DSH 有 `tool search` 延迟加载能力但未挂载，阈值未验证 |
| 10 | 上述 M9/M10 建议的**性能与安全实测** | 本文件是设计基线，任何数字（超时/上限/预算）都需实现后校准 |

---

## 7. 长程任务与记忆/视图参考（面向 M18 / M19 / 视图层）

> **目的**：给并行开发中的三条线补 DSH 参考：**M18 SpecCore 驱动执行**（长程/恢复/看门狗）、**M19 记忆与召回**、**视图层（视图 Schema）**。
> **先说 DSH 没有什么**：DSH **没有 Spec/验收概念**、**没有"模型生成 UI"**、**没有向量 RAG**。所以本节明确"抄机制 / 自建语义"。
> **M18/M19 口径**：以任务板为准——M18 = SpecCore 真正驱动会话执行（task-81：状态机/证据/概览/任务交接）；M19 按 design/12 的用法指**记忆双时态与召回**（task-84 召回设计、task-86 记忆 v0.3；`asOf` 历史查询）。**若 Lead 的里程碑表更新，以 Lead 为准**（此口径为推断 `[I]`）。

### 7.1 长程任务：DSH 机制清单（分"有证据 / 推断"）

#### A. 有证据（`[R·包文档]` 本会话/前期直读 README；汇总见 `research/dsh-mechanisms.md` §8）

1. **三屏障 fail-closed 检查点**（`dsh-session-checkpoint-policy`）：①**模型请求前** ②**顶层工具副作用前**（`exec.parent === undefined`）③**每步前** flush；失败即**不 continue**（不构造 adapter 流 / 不进 tool body）；嵌套调用复用外层屏障；取消与 flush 竞态只有一个出口（`ABORTED_BEFORE_DISPATCH`）。
2. **崩溃恢复 = 补配对，不续跑半截 turn**（`dsh-session` / `dsh-agent-loop`）：为未回答的调用合成 `TOOL_OUTCOME_UNKNOWN` / `TOOL_NOT_STARTED` / `ABORTED_BEFORE_DISPATCH`；`interruptedTurnClosers` = 合成 tool/result + `step/end` + `turn/end{interrupted}`；resume **先取写所有权**（单写者），**绝不自动重试有副作用的操作**。
3. **后台作业**（`dsh-jobs-local` / `dsh-tool-jobs`）：按 owner（session id）围栏；每 owner 并发上限（默认 10 running+stopping，**满则拒绝不排队**）；有界输出环（live 256KiB / settled 16KiB，**模型未读字节保留**）；**模型消费游标 vs 观察者 `readAt` 绝对偏移**分离；settle first-wins；`awaited` 去重；完成投递两条 lane（busy → 注入下一步 / idle → 唤醒 follow-up），`completionDelivery:quiet` 只注入；自激唤醒有 `maxConsecutiveWakes` 预算。
4. **定时/延迟任务**（`dsh-schedule`）：任务行持久化；到期**投回原会话**；**投递 = 入 inbox + `session/flush` 确认**才算成功；**错过只补最近一次**；update 是整行 CAS（`schedule_conflict`）；明确承认**非 exactly-once**（flush 后 put 前崩溃会重复投递）。
5. **长期目标**（`dsh-goal` / `dsh-goal-round-driver`）：四相 `active/paused/blocked/complete` + **CAS revision**；`maxGoalRounds`（默认 256）；**每个 `agent/created` 都 disarm**（重启/恢复后必须人显式 resume，防无人值守续跑）；**reservation-then-admission**（先预留 `roundsStarted+1` 再排队）+ `agent/pre-step` 前后双向 fence；排队前 `flush`。
6. **超时 / 看门狗**（三个不同层）：`dsh-tool-call-timeout-policy`（工具定义**声明式** `timeoutMs`，由 `tools/execute` 包装强制执行，到点返回 `TOOL_TIMEOUT`）；`dsh-llm-retry`（只在**步骤边界**重试，重试前先落 `llm/retry`/`llm/retry-started`）；`dsh-timeout` 的 `idleWatchdog`（只对未决的 `next()` 计时 → `LLM_STREAM_IDLE_TIMEOUT`）。
7. **交互式长任务**（`terminal_*` 6 件套）：owner-scoped 会话、**单 send 同步预留**、真实信号（不模拟 `\x03`）、关闭时等进程树静默、**就绪判定是启发式三档且明确 "inferred_idle/timeout 不证明前台命令已退出"**。
8. **预算分层**（`[D]` design/19 已借鉴）：工具超时 / LLM 重试 / **turn 无内建预算** / 委派树配额 / goal 轮次——各有 owner，不混成"总超时"。
9. **恢复的诚实语义**：`jobs`/terminal 明确**不跨重启**（只留生命周期事件）；JSONL 持久化 torn-tail **只丢未确认尾**；projection cache **日志领先、缓存跟随**（crash 只能让缓存落后，不能超前）。

#### B. 推断（`[I]`，无直接证据，供 M18 评估）

1. DSH **没有任务级 DAG 调度器**：「完成一个自动创建下一个」这类编排要靠 **委派工具 + goal 轮次 + schedule** 组合出来，没有中心调度组件。→ 司墨 M18 的"任务链自动推进"需要**自建调度器**。
2. DSH **没有统一的"任务无进展看门狗"**：stall 判定分散在 job 无进展、terminal 就绪启发式、LLM idle watchdog；**没有**"任务 N 分钟无新事件则降级/改派"的统一策略。
3. `dsh-jobs-local` **不持久**：重启后 live job 消失，只剩事件记录。若司墨要求"后台任务重启续跑"，必须自建（或明确不承诺）。

### 7.2 UI 视图定制 / 生成式 UI：DSH 到底有什么

#### A. 有证据

1. **UI 是客户端插件 + Slots，不是模型产物**（`[R·包文档]` `cordis-plugin-development/references/ui-plugin.md` 原文）：客户端插件是一个 **lazy factory**，通过 `ctx.slots.inject` / `ctx.slots.register` 注册进指定 slot；slot 的 props/options 由 `Slots.listSubTree` 查询；**禁止替换 app root、禁止读别的插件 DOM/样式**；容器与控件要继承宿主主题，可见文案走 Client locale；注册即代码（JS），不是模型输出。
2. **工具结果带"受控呈现元数据"**（`[R·包文档]` `dsh-tool-fs` 等）：工具结果除内容外可带 `presentationMeta`（如 `write`/`edit` 生成**可回放的 diff-card 元数据**）；`present` 工具把文件声明为交付物 → 客户端 deliverables 渲染卡片。**模型只产出数据/文件 + 少量受控元数据**。
3. **`client-ui-*` 是一组固定视图插件**（`[R·运行时]` 本 profile roster）：chat / layout / conversation / deliverables / jobs / goal / agent-preset / sidebar-browser… 都由开发者编写；没有"模型生成组件树"的通用机制。
4. **视图数据 = 事件投影**（`[R·包文档]` `dsh-session-projection` / `-cache`）：客户端读的是 `{asOfSeq, values}` 的一致快照；每个投影有 `stateVersion`；视图不自持第二套状态。

#### B. 没有 / 未验证

- **没有"生成式 UI"**（模型输出 HTML/JSX/组件源码）：`[I]` 由"UI=客户端插件+slot"与"工具只带元数据"两条反推，未发现 agent 可写的 view schema 机制。
- **实时 slot 树未取到**：本次 `Slots.listSubTree` 查询**超时**（页面 10s 无响应），slot 清单只据 `ui-plugin.md` 与目录描述；落地前需在可用页面重试。

#### C. 对"视图 Schema"的参考价值

- **可抄的形状**：`视图类型 → 渲染器注册表`（等价 slot registry）+ **视图描述符**（受 JSON schema 约束的纯数据：type/标题/字段绑定/只读标记）由 agent 产出、宿主按注册表渲染；**只读优先**；**每条视图可溯源事件**（`asOfSeq`）；**样式只走主题 token**、**文案走 locale**。
- **不该抄**：模型生成可执行 UI（HTML/JS/组件）；插件式 UI 运行时（HMR、任意 DOM 注入、替换 root）；让视图定义脱离消息流成为**第二数据源**。
- **对司墨的关键约束**：design-core 的「**视图等价原则**」（自定义视图/工作流 = 同一套会话消息，可用默认对话复现）正好对应 DSH 的「UI = 事件投影 + 工具呈现元数据」——**视图 Schema 应是消息流的一种投影/渲染约定，而不是新数据源**。

### 7.3 记忆：会话检索 / compaction / projection cache 的可借鉴点

#### A. 有证据

1. **统一会话查询服务**（`[R·包文档]` `dsh-session-query`）：一个 `ctx.sessionQuery` 提供 list / filter（会话/事件元数据 + 字面文本）/ read / trace / search；**live-preferred**（live 优先、持久化补足、**冲突 header 直接失败不合并**）；**detached 克隆**（不暴露 live 引用）；精确读/过滤/trace 与"排序全文检索"**分层**（后者由 backend 实现）；稳定错误码 `SESSION_QUERY_*`；`inheritedEventCount` 区分继承/自有事件（fork 语义）。
2. **排序全文检索**（`[R·包文档]` `dsh-session-query-sqlite`，此前已读）：查询按**字面短语**处理（FTS5 语法当数据）、`unicode61`、确定性排序（命中 span → 文档短 → 时间/会话/seq）、`snippetChars=240`、**cursor 绑 corpus generation**（语料变化 → stale，不返回错位页）。
3. **compaction**（本文 §2.4 已列）：日志事务 `start→summary→replace→end`、**替换而非删除**、8 段结构化 checkpoint、摘要请求复用 warm prefix、**不可丢清单**（当前阶段/Frame/未完成 Task brief/Evidence 指针/未结算句柄/规则/最近 K 条/不可信标签）。
4. **projection cache**（`[R·包文档]` `dsh-session-projection-cache`）：**日志领先、缓存跟随**；三个强制写点（session 创建 / `turn/end` / 释放）+ `writeEveryEvents`/`writeIntervalMs` 节流；`cachedSnapshot` **零 I/O 同步读**、`coldSnapshot` 从 checkpoint 之后继续 fold；**lifecycle identity 匹配**（formatVersion/createdAt/cwd/isSeeded + `inheritedEventCount`），不匹配**丢弃而非迁移**；schema 不符 → 备份 `<id>.json.bak.<stamp>` 后跳过重建；`asOfSeq` = 所服务行中的**最低水位**。
5. **跨会话引用**（此前已读）：显式 `@label` → **不可变快照** + 每源字节预算 + spill 兜底 + 固定不可信警告；**没有自动召回、没有向量 RAG**。

#### B. M19 可借鉴 / 需自建

| 抄 | 自建（DSH 没有） |
|---|---|
| ① 查询接口三分（精确读/过滤/排序搜索）+ 稳定错误码；② 游标绑语料版本（stale 即失败，不给错位页）；③ 投影缓存三不变量（日志领先 / identity 匹配 / 坏记录备份跳过）+ `asOfSeq`；④ compaction 的替换事务与"不可丢清单"；⑤ 不可信内容封装（来源/标签/转义/预算）；⑥ 跨会话引用 = 不可变快照 + 预算 + 指针 | ① 记忆单元/权威/冲突/disputed（design/12/24）；② 向量/混合检索与多路融合（design/25）；③ 自动长期记忆写回（候选 + 单写者合并）；④ 不要把 session 检索当"记忆召回"（语义不同：DSH 只有历史，没有"谁认为/何时失效"） |

### 7.4 结论：M18 / M19 / 视图层「抄 / 不抄」

| 领域 | **抄**（有证据支撑） | **不抄 / 需自建** |
|---|---|---|
| **M18 SpecCore 驱动执行** | ① **三屏障 fail-closed 检查点**；② 崩溃恢复"**补配对结果 + 三态结束 + 不自动重试副作用**"；③ 后台作业 owner 围栏 / 有界输出环 / awaited 去重 / **两条完成投递 lane**；④ **预算分层 + 声明式超时**；⑤ 定时任务"**投回原会话 + 投递 flush 确认 + 错过只补一次**"；⑥ goal 的"**reservation-then-admission + revision fence + 重启默认 disarm**"；⑦ **恢复的诚实语义**（不跨重启就明说；日志领先缓存跟随） | ① **没有 Spec/验收**（SpecCore 是司墨独有，必须自建）；② **没有任务级 DAG 调度器**（"完成一个自动创建下一个"要自建）；③ **没有统一"无进展看门狗"**（需自建 stall 策略：无新事件/无工具结果 N 分钟 → 降级/改派）；④ `jobs-local` **不持久**（要重启续跑需自建，或明确不承诺）；⑤ 不要照抄"任意 steer 插进执行"（司墨已有自己的抢占/撤回语义） |
| **M19 记忆 / 召回** | 同上表 §7.3B 左侧 6 条（查询三分/游标版本/缓存三不变量/compaction 事务/不可信封装/快照引用） | ① 记忆单元/权威/冲突/disputed；② 向量+混合检索与融合；③ 自动写回（候选+单写者）；④ 把 session 检索当记忆 |
| **视图层（视图 Schema）** | ① "**视图类型 → 渲染器注册表**"的贡献模型（类比 slot registry）；② 工具/交付物带**受控呈现元数据**（diff 卡片、deliverables 卡片）；③ **视图 = 事件投影**（`asOfSeq`/`stateVersion`），不自持状态；④ 主题 token + locale 走宿主；⑤ **只读优先**、按需开写 | ① **不要模型生成可执行 UI**（HTML/JS/任意组件树）；② 不要插件式 UI 运行时（HMR、DOM 注入、替换 app root）；③ 不要让视图定义脱离消息流成为**第二数据源**（违背"视图等价原则"）；④ 不要每个视图一套状态机 |

> **一句话**：M18 抄 DSH 的**执行耐久性**（检查点/恢复/预算/作业/调度纪律），自建 **Spec 驱动的调度器与看门狗**；M19 抄 DSH 的**查询与缓存纪律**，自建 **记忆语义层与召回**；视图层抄"**注册表 + 受控元数据 + 事件投影**"，**拒绝生成式 UI**。

### 7.5 本节未验证 / 待核实

1. **客户端 slot 树未取到**：`Slots.listSubTree` 本次超时（页面 10s 无响应）；slot 清单/契约只据 `ui-plugin.md` 与目录描述，视图层落地前需在可用页面重试。
2. **DSH 是否有"agent 可写视图描述符"**：目前只见到 工具呈现元数据 + 客户端插件 两种；推断**没有**通用 view-schema 机制 `[I]`。
3. **后台任务跨重启**：`jobs-local`/`terminal_*` 明确不持久；司墨若要求"任务重启续跑"需自建（M18 需拍板）。
4. **M18/M19 命名口径**：按 task-81 / design/12（M19=asOf 双时态）推断；以 Lead 里程碑表为准。

---

## 8. 参考来源

| 内容 | 位置/证据 |
|---|---|
| 活运行时工具清单（56 个工具 schema） | 本会话 `cordis_inspect_query(Tool.listTools)`；完整结果落盘：`C:\Users\YJM1024\AppData\Local\Temp\dsh-spill-UNwrcX\session-054819ec941b\bcff36b7b157-cordis_inspect_query.txt` |
| 沙箱模式 & 配置 schema | `cordis_inspect_query Config.listConfigs(entry=include:sandbox-policy)`；包 README `…\@deepseek-ai\dsh-sandbox-policy\README.md` |
| 权限预设 schema（sandbox×approval） | `Config.listConfigs(entry=include:permission)`；`…\@deepseek-ai\dsh-permission-presets\README.md` |
| 审批语义（ask/never/fail-closed/审计） | `…\@deepseek-ai\dsh-user-approval\README.md`（此前已读） |
| 文件工具参数与上限 | `…\@deepseek-ai\dsh-tool-fs\README.md` |
| 搜索工具参数与上限 | `…\@deepseek-ai\dsh-tool-fs-search\README.md` |
| 执行工具（pwsh）参数/标记/提权 | `…\@deepseek-ai\dsh-tool-pwsh\README.md` |
| 网络工具参数与上限 | `…\@deepseek-ai\dsh-tool-web\README.md` |
| fs 围栏/canonicalize/TOCTOU | `…\@deepseek-ai\dsh-fs-sandbox\README.md` |
| `DSH_*` 环境重建 | `…\@deepseek-ai\dsh-shell-env\README.md` |
| 工具管线 / 输出治理 / 压缩 | `research/dsh-mechanisms.md`；`harness/harness-map.md` |
| simo 现状（工具/权限/审批/中和） | `backend/README.md` §M2–M6；`backend/internal/platform/permission/permission.go`；`backend/internal/modules/chat/tools.go`；`docs/m2-contract.md` §6 |
| simo 路线图（M1–M7） | `design/15-开发路线图-v1.md`（M9/M10 是路线图之后的新增里程碑） |
| 长程任务/后台作业/恢复/看门狗 | `…\@deepseek-ai\dsh-session-checkpoint-policy\README.md`、`dsh-session\README.md`、`dsh-jobs-local\README.md`、`dsh-tool-jobs\README.md`、`dsh-goal\README.md`、`dsh-goal-round-driver\README.md`、`dsh-schedule\README.md`、`dsh-timeout\README.md`、`dsh-llm-retry\README.md`、`dsh-tool-call-timeout-policy\README.md`；汇总见 `research/dsh-mechanisms.md` §8 |
| 长程恢复的诚实语义 | `dsh-session-persistence\README.md`（torn-tail 只丢未确认尾）、`dsh-session-projection-cache\README.md`（日志领先/缓存跟随）、`dsh-jobs-local\README.md`（不跨重启） |
| UI 插件与 Slots | `…\@deepseek-ai\dsh-agent-preset\skills\cordis-plugin-development\references\ui-plugin.md`；`Slots.listSubTree`（本次查询超时，未取到实时树） |
| 会话检索（查询服务 + FTS5） | `…\@deepseek-ai\dsh-session-query\README.md`、`dsh-session-query-sqlite\README.md` |
| 投影缓存（project cache） | `…\@deepseek-ai\dsh-session-projection-cache\README.md`、`dsh-session-projection\README.md` |
| M18/M19 口径（司墨侧） | 任务板 task-81（M18 SpecCore）、task-84（召回设计）、task-86（记忆 v0.3）；`design/12-记忆模型-候选稿.md`（M19=asOf 双时态） |
