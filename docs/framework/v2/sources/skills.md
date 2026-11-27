# 面向软件开发的 AI skill 与技能规范：原文摘录

采集时间 2026-11-27。只抄录原文事实，不做评价。判据口径：有 = 正文给出可直接运行、且失败会阻断流程的命令或脚本；部分 = 有检查清单或固定步骤，但靠人判断，没有脚本代跑；无 = 只有流程描述，连可核对的清单也没有。版本列：文档站无版本号的按“文档站，无版本号”记；仓库按 2026-11-27 取的默认分支提交号记。正文被截断或只取到部分的，在对应行的判据列与文末“未取得原文与仅取得摘要的项”里注明。

| 名称 | 维护方 | 版本或提交 | 出处链接 | skill 类型（规范/库/单个技能） | 结构要点（frontmatter、脚本、引用文件） | 触发与组织方式 | 是否有可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|---|---|
| Claude Code Skills 文档 | Anthropic | 文档站，无版本号 | https://code.claude.com/docs/en/skills.md | 规范 | 技能是目录加一个 `SKILL.md`；frontmatter 至少 `name`、`description`，另有 `allowed-tools`、`context: fork`、`agent`、`background`、`disable-model-invocation`、`user-invocable`；正文可写 `` !`命令` `` 在发送前执行并替换为输出，多行用 ```` ```! ```` 代码块 | 会话启动预载全部技能的 name 与 description，模型按 description 自动调用，也可用 `/skill-name` 直接调用；插件技能带 `plugin-name:skill-name` 命名空间 | 部分——注入命令的退出码能中断调用，但技能自身没有检查清单或脚本，只能看会话里是否中止 | "Use when the user asks what changed, wants a commit message, or asks to review their diff."<br>"Shell command failed for pattern" |
| Agent Skills 规范 | Agent Skills 社区（agentskills.io） | 规范页，无版本号 | https://agentskills.io/specification | 规范 | 目录约定 `skill-name/{SKILL.md, scripts/, references/, assets/}`；字段 `name`（必填，≤64 字符，小写字母、数字、连字符，与父目录同名）、`description`（必填，≤1024 字符）、`license`、`compatibility`（≤500）、`metadata`（字符串键值映射）、`allowed-tools`（空格分隔，实验性）；正文 Markdown | 渐进披露：元数据常驻上下文，`SKILL.md` 正文在判定相关时加载，`scripts/` 与 `references/` 再按需读取 | 无——只有打包期的字段校验规则，没有运行时检查，也没有脚本，验证只能逐字段对照规范页 | "skill-name/{SKILL.md, scripts/, references/, assets/}"<br>仅取得结构摘要：校验节要求 name 与父目录同名、只含小写字母数字与连字符，未逐字抄录原句 |
| Anthropic Skill authoring best practices | Anthropic | 文档站，无版本号 | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md | 规范 | 正文 <500 行；引用文件只能一层深，超过 100 行要在顶部放目录；模板、成对示例、条件分支三种写法；评估是 JSON，字段为 `skills`、`query`、`files`、`expected_behavior` | description 决定是否加载，要求第三人称、同时写做什么与何时用；技能名建议用动名词；用 Haiku、Sonnet、Opus 分别测 | 部分——给了评估 JSON 结构与三组 checklist，但文档明说当时没有内置运行器，只能人跑或自建脚本对照 checklist 打分 | "The context window is a public good."<br>"Keep the `SKILL.md` body under 500 lines for optimal performance." |
| Claude Code Subagents 文档 | Anthropic | 文档站，无版本号 | https://code.claude.com/docs/en/sub-agents.md | 规范 | Markdown 加 YAML frontmatter，只有 `name`、`description` 必填，正文即 system prompt；可选 `tools`、`disallowedTools`、`model`、`permissionMode`、`mcpServers`、`hooks`、`maxTurns`、`skills`、`initialPrompt`、`memory`、`effort`、`background`、`isolation`；多词字段 camelCase，未知字段静默忽略 | 按 description 自动委派或用 @ 提及；来源优先级为 managed、`--agents`、`.claude/agents/`、`~/.claude/agents/`、插件 `agents/`；插件子代理不支持 hooks、mcpServers、permissionMode | 部分——`hooks`、`maxTurns`、`permissionMode` 能硬性约束行为，但没有内建的验收脚本，只能观察子代理是否越权或超轮次 | "name、description、tools、model、permissionMode、hooks、skills、maxTurns"<br>"插件子代理不支持 hooks、mcpServers、permissionMode" |
| Claude Code Plugins overview | Anthropic | 文档站，无版本号 | https://code.claude.com/docs/en/plugins/overview.md | 规范 | 插件是一个目录，清单在 `.claude-plugin/plugin.json`，组件为 `skills/`、`agents/`、`hooks/hooks.json`、`.mcp.json`；技能按 `skills/<name>/SKILL.md` 放 | 从 marketplace 安装，启动或 reload 时整包加载；技能以 `/plugin-name:skill-name` 调用；装的每个技能与代理每轮都占上下文（只 name 与 description） | 部分——`/plugin` 能看 Context cost、measure 页能测实际占用，但这只是资源核对，不是技能正确性判据 | "A Claude Code plugin is a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit."<br>"the full text of a skill or agent loads only when it's used" |
| OpenAI Agents SDK：Tools | OpenAI | 文档站，无版本号 | https://openai.github.io/openai-agents-python/tools/ | 规范 | 五类工具：Hosted OpenAI tools、Local/runtime tools、`FunctionTool`、Agents as tools、实验性 Codex tool；函数工具从签名与 docstring 解析参数，可用 Pydantic `Field` 加约束；`tool_namespace(name, description, tools)` 分组配一个 `ToolSearchTool()`，建议每组少于 10 个函数；`@tool(defer_loading=True)` 延迟加载 | 工具随 Agent 声明，由 `tool_use_behavior`、`tool_choice` 与 tool search 决定何时调用；Programmatic Tool Calling 让模型生成 JavaScript 在托管 V8 里组合工具输出 | 部分——参数校验、超时、guardrail 由框架执行，但文档没有给可跑的验收脚本，只能写测试调用工具再看结果 | "Hosted OpenAI tools"<br>仅取得字段摘要：分组用具名函数 `tool_namespace(name, description, tools)` 配一个 `ToolSearchTool()`，未逐字抄录原句 |
| OpenAI Agents SDK：Agents 与 instructions | OpenAI | 文档站，无版本号 | https://openai.github.io/openai-agents-python/agents/ | 规范 | `Agent` 由 `instructions`、`tools`、`handoffs`、`guardrails`、`output_type`、`model_settings`、`prompt` 组成；`instructions` 可以是字符串或动态回调；`prompt` 引用平台 prompt 模板并传 `variables`；`reset_tool_choice` 默认 True | 由 `Runner` 运行；多代理分 Manager（agents as tools）与 Handoffs 两种；动态 instructions 每次调用重算 | 部分——`output_type` 与 guardrail 能卡结构化输出，但指令是否被遵守要靠自建评测，文档只给示例代码 | 仅取得字段摘要：`instructions`、`tools`、`handoffs`、`output_type`、`reset_tool_choice` 为 Agent 配置项，未逐字抄录字段说明 |
| DeepSeek Harness：dsh-doc 技能与 agent-preset | DeepSeek | dsh 0.2.2-rc.5（安装包内） | https://github.com/deepseek-ai/deepseek-harness | 库 | 41 行 `SKILL.md`，frontmatter 只有 `name` 与 `description`；正文列 16 个 `references/`（locate-docs、plugin-development、host-plugin、tool-design 等）与 2 套 `templates/`；单文件保持低于 8192 字符，超过会被工具结果裁剪器剪掉 | 由 agent-preset 通过 `skill-filesystem` 挂载 `skills/` 目录；按 description 触发；装载不等于授权，只有用户明确要求才允许改插件或预设 | 部分——正文给了“先运行时检查、再读安装版文档、都不可得就说未验证”的三步顺序，但没有脚本，是否照做只能看回答里的依据 | "Answer questions about DSH from the documentation and source of the installed version, not from memory"<br>"Loading it grants no permission to change files or the profile." |
| obra/superpowers | Jesse Vincent（obra） | commit `22f0b46`（main，2026-11-27） | https://github.com/obra/superpowers | 库 | 15 个技能，每个是 `skills/<name>/SKILL.md` 加同目录支持文件（`writing-good-tests.md`、`code-reviewer.md`、`root-cause-tracing.md` 等）；frontmatter 只 `name` 与 `description`，正文含铁律、阶段步骤、Rationalizations 表、Red Flags、Checklist | 由 description 自动触发，或以 `superpowers:<skill>` 显式调用；技能之间用 “REQUIRED SUB-SKILL” 串成流程：brainstorming → writing-plans → subagent-driven-development → requesting-code-review → finishing-a-development-branch | 部分——库本身不跑检查，判据分散在各技能的验证清单与测试命令里，逐条见下文单技能行 | "An agentic skills framework & software development methodology that works." |
| anthropics/skills | Anthropic | commit `e4bb5d9`（main，2026-11-27） | https://github.com/anthropics/skills | 库 | 19 个技能目录（academy-guide、algorithmic-art、brand-guidelines、canvas-design、claude-api、discernment-nudge、doc-coauthoring、docx、frontend-design、internal-comms、mcp-builder、pdf、pptx、skill-creator、slack-gif-creator、theme-factory、web-artifacts-builder、webapp-testing、xlsx），每个自包含目录加 `SKILL.md`，用 `scripts/`、`references/`、`assets/`、`evals/` 承载可执行部分；另有 `./spec` 与 `./template` | 以插件市场安装（`/plugin marketplace add anthropics/skills`，插件 `document-skills`、`example-skills`），再按 description 自动触发 | 有——`skill-creator` 带 `scripts.aggregate_benchmark`、`scripts.run_loop`、grader/analyzer 子代理与 `grading.json` 字段校验，`webapp-testing` 带 `with_server.py`，可跑出 `pass_rate` 与截图 | "/plugin marketplace add anthropics/skills"<br>仅取得 README 摘要：每个技能自包含目录加 SKILL.md，未逐字抄录原句 |
| ComposioHQ/awesome-claude-skills | Composio | commit `be2a406`（master，2026-11-27） | https://github.com/ComposioHQ/awesome-claude-skills | 库 | 索引仓库，按 Document Processing、Development & Code Tools、Data & Analysis 等分类列出条目，多数链接到上游仓库；自带技能只有 `changelog-generator/SKILL.md`，纯提示词，无脚本、无引用文件 | 列表聚合，按分类检索后跳到上游；自带技能由模型按 description 触发 | 无——索引没有判据，唯一自带技能也没有脚本与检查清单，质量只能靠发布前人工复核 | "comprehensive and curated list of 1000+ production ready and practical Claude Skills and Plugins"<br>"每个技能是含 SKILL.md 的文件夹，可选 scripts/references/assets" |
| affaan-m/ECC | affaan-m | commit `4adeee6`（main，2026-11-27），README 标 2.2.3 | https://github.com/affaan-m/ECC | 库 | 自述 72 个 agents、328 个 skills、99 个 commands；技能为 `skills/<name>/SKILL.md`，frontmatter 常见 `metadata.origin: ECC`；另有 `.agents/skills/` 供 Codex，每个技能配 `agents/openai.yaml`；hooks、rules、memory 独立成层 | 以 Claude Code 插件 `ecc@ecc` 安装，按 description 触发；hooks 在生命周期事件上强制（阻止绕过 git hook、拦 secret、SessionStart 注入上下文） | 有——hooks 在 `beforeShellExecution`、`beforeSubmitPrompt`、`beforeTabFileRead` 上直接 exit 2 或拦截，另有 `scripts/ecc.js doctor、repair、list-installed` 可跑 | "plan -> test -> implement -> review -> verify -> remember -> improve"<br>"Optimize the context window. Persist everything else." |
| mhattingpete/claude-skills-marketplace | mhattingpete | commit `b5b34bc`（main，2026-11-27） | https://github.com/mhattingpete/claude-skills-marketplace | 库 | 4 个插件，清单在 `.claude-plugin/marketplace.json` 与各插件 `plugin.json`；技能为 `skills/<name>/SKILL.md` 加可选 `scripts/`、`references/`；子代理用 `AGENT.md`（frontmatter `name`、`description`、`model`） | 作为 marketplace 安装；技能按 description 自动触发，代理是独立 Claude 实例 | 部分——`code-refactor` 只有“改完再 Grep 一次”的人工步骤，`code-transfer` 带 `scripts/line_insert.py`，其余技能未见脚本 | "A curated marketplace of Claude Code plugins for software engineering workflows"<br>仅取得摘要：description 要求同时写做什么与何时用，未逐字抄录原句 |
| superpowers · test-driven-development（测试生成） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md | 单个技能 | frontmatter 两字段；单文件加同目录 `writing-good-tests.md`；正文含 Iron Law、RED-GREEN-REFACTOR 四步、Common Rationalizations 表、Red Flags、Verification Checklist | "Use when implementing any feature or bugfix, before writing implementation code"；由 description 自动触发 | 有——每步都要求真跑项目测试命令并看输出：先红、改完转绿、再跑全量，绿不了不许进下一步 | "NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST"<br>仅取得步骤摘要：RED 阶段要求先跑测试并眼看失败，GREEN 阶段跑通后才允许重构，未逐字抄录清单原句 |
| superpowers · writing-plans（需求拆解与规格转计划） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md | 单个技能 | 单 `SKILL.md`；计划文档固定头（Goal、Architecture、Tech Stack、Spec、Global Constraints、Review Focus），每任务含 Files、Interfaces、5 步（写失败测试、跑失败、最小实现、跑通过、commit）；引用 `subagent-driven-development` 与 `executing-plans` | "Use when you have a spec or requirements for a multi-step task, before touching code"；写完必须做五项 Self-Review 再交人选择执行方式 | 部分——要求把验收写成每步可检查的结果，但没有检查脚本，五项 Self-Review 只能人工逐项对照 | "A plan is the set of decisions the implementer cannot make alone."<br>"Each step is one action with a checkable result" |
| superpowers · brainstorming（需求拆解与规格撰写） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md | 单个技能 | 单 `SKILL.md` 加 `builder-check-prompt.md`；设计文档保存到 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`，含 intent 与 why、goals/non-goals/anti-goals、constraints、approaches、已定 how | description 用强制语气，要求任何创作前先走；硬性顺序为列方案、写设计文档、等人批准、调用 `writing-plans`；`<HARD-GATE>` 禁止在设计批准前写代码 | 部分——门禁是硬性的，但判据是“人是否批准了设计文档”，没有脚本能验证，只能回看消息与文档 | "You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new"<br>仅取得门禁摘要：设计文档获批前禁止写代码、搭脚手架、装依赖，未逐字抄录 &lt;HARD-GATE&gt; 段 |
| superpowers · requesting-code-review（代码评审） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/SKILL.md | 单个技能 | 单 `SKILL.md` 加 `code-reviewer.md` 模板；模板占位符 `{DESCRIPTION}`、`{PLAN_OR_REQUIREMENTS}`、`{BASE_SHA}`、`{HEAD_SHA}`；输出固定 Strengths、Issues（Important/Minor）、Assessment | 强制时机：子代理开发的每个任务后、重大功能完成后、合并 main 前；派 general-purpose 子代理执行，协调者不自己看 diff | 部分——用 `git rev-parse` 固定审查区间，但审查结论靠子代理判断，没有评分脚本 | "Review early, review often."<br>"Never: Skip review because "it's simple"" |
| superpowers · systematic-debugging（调试） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md | 单个技能 | 单 `SKILL.md` 加 `root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`；正文含四阶段、Red Flags、Rationalizations 表、Quick Reference 表 | "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes"；四阶段必须依次完成才允许提修复 | 部分——要求“先写失败测试再修”，这一步可跑；根因是否找对没有脚本，只能靠三次失败上限兜底 | "NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST"<br>"If ≥ 3: STOP and question the architecture" |
| superpowers · finishing-a-development-branch（发布收尾） | Jesse Vincent（obra） | commit `22f0b46` | https://github.com/obra/superpowers/blob/main/skills/finishing-a-development-branch/SKILL.md | 单个技能 | 单 `SKILL.md`；Step1 跑全套测试，Step2 用 `GIT_DIR`/`GIT_COMMON`/`WORKTREE_PATH` 判环境，Step3 确认 base 分支，Step4 固定菜单，Step5 执行命令，Step6 清理 worktree | "Use when implementation is complete, all tests pass, and you need to decide how to integrate the work"；菜单原文照念等人选，丢弃分支要人输入 `discard` 确认 | 有——合并前跑全套测试（npm test、cargo test、pytest、go test ./...），红了就停；合并后还要在合并结果上再跑一遍 | "merging into the wrong base is expensive to undo"<br>"Present the menu exactly as written" |
| mhattingpete · code-refactor（重构） | mhattingpete | commit `b5b34bc` | https://github.com/mhattingpete/claude-skills-marketplace/blob/main/code-operations-plugin/skills/code-refactor/SKILL.md | 单个技能 | 单 `SKILL.md`；两档模式：1–9 个文件用原生 Grep 加 Edit `replace_all`，10 个以上自动转 `code-execution` 技能并调 `api.code_transform.rename_identifier` | 由 description 触发（批量重命名、替换废弃写法、改 API 调用）；流程为 Grep 列文件、Grep 带上下文、Edit、再 Grep 验证 | 部分——最后一步是再 Grep 一次确认零命中，可核对；但没有测试命令，语义是否正确仍靠人看 | "Systematic code refactoring across files. **Auto-switches to execution mode** for 10+ files (90% token savings)."<br>仅取得流程摘要：改完再 Grep 一次，确认无残留命中，未逐字抄录该步原句 |
| ahmed-lakosha · odoo-upgrade（迁移） | ahmed-lakosha | commit `5541d98`（master），插件 v5.1.0 | https://github.com/ahmed-lakosha/odoo-plugins/blob/master/odoo-upgrade-plugin/odoo-upgrade/SKILL.md | 单个技能 | frontmatter 含 `name`、多行 `description`（内嵌 3 个 `<example>`）、`license: "MIT"`、`metadata.filePattern`、`metadata.bashPattern`；正文 220 行左右，加 `reference/` 两篇与 `scripts/`（`cli.py`、`transforms/`、`precheck.py`、`validate.py`）；插件另有 4 个 hooks、3 个斜杠命令、1 个 agent | 三种入口：斜杠命令 `/odoo-upgrade`、`/odoo-precheck`、`/odoo-quickfix`；技能按 description 触发；hooks 在 PreToolUse 阻止改写 Odoo 核心文件 | 有——`python -m scripts.cli precheck`、`validate`、`upgrade` 三步可跑，validate 查语法，最后用 `python -m odoo -d DB -i MODULE --stop-after-init` 装模块验证 | "# Odoo Upgrade Assistant v5.0"<br>仅取得流程摘要：Upgrade Workflow 六步为 Analyze、Backup、Pre-check、Transform、Validate、Test，未逐字抄录步骤原句 |
| Composio · changelog-generator（发布说明） | Composio | commit `be2a406`（master） | https://github.com/ComposioHQ/awesome-claude-skills/blob/master/changelog-generator/SKILL.md | 单个技能 | 单 `SKILL.md`，纯提示词；无脚本、无引用文件；五段结构为 When to Use、What This Skill Does、How to Use、Example、Tips | 自然语言触发（“为 v2.1.0 生成 changelog”“本周更新说明”）；正文写 6 步流程与过滤噪音规则 | 无——只有“发布前人工复核”这一条 Tips，没有检查清单或命令，输出对不对靠人读 | "Automatically creates user-facing changelogs from git commits by analyzing commit history, categorizing changes, and transforming technical commits into clear, customer-friendly release notes." |

## Claude Code Skills 文档

- 组织方式：一个技能就是一个目录，目录名即技能名，里面放一个 `SKILL.md`；frontmatter 只有 `name` 与 `description` 是必需的，其余字段（`allowed-tools`、`context`、`agent`、`background`、`disable-model-invocation`、`user-invocable`）按需加。
- 调用方式：会话启动时把每个技能的 name 与 description 放进上下文，模型按 description 判断是否调用；用户也可以用 `/skill-name` 直接调用。插件里的技能用 `plugin-name:skill-name` 命名，避免与本地同名技能冲突。
- 强制检查与脚本：正文里可以用 `` !`命令` `` 做动态上下文注入，命令在技能发送给模型之前执行，输出替换掉那一段；这会实际跑命令，不是示意。
- 失败处理：注入的命令返回非零退出（搜索类与比较类命令的 exit 1 除外）或权限检查不通过，整次技能调用中止，报 `Shell command failed for pattern "..."`，不会带着半截上下文继续。
- 读取范围：`code.claude.com/docs/en/skills.md` 正文前约 50KB（页面被截断），frontmatter 字段表、位置与加载、参数、动态上下文、fork 子代理、内置技能与评估各节已读。

## Agent Skills 规范

- 组织方式：规定目录形状为 `skill-name/{SKILL.md, scripts/, references/, assets/}`，`SKILL.md` 是入口，其余三类目录按需放可执行脚本、参考文档与素材。
- 调用方式：不规定运行时，只规定包格式；渐进披露要求元数据先加载、正文按相关性加载、脚本与引用再按需读取，这样安装很多技能也不会一次占满上下文。
- 强制检查与脚本：没有可执行判据，只有字段校验规则（name 的长度与字符集、必须与父目录同名、description 的长度上限、metadata 必须是字符串键值映射），验证方式是逐字段对照规范页。
- 失败处理：规范本文不给运行时失败语义，校验不通过属于打包阶段的问题。
- 读取范围：`agentskills.io/specification` 正文，目录结构、frontmatter 字段表与校验节已读；页面部分截断。

## Anthropic Skill authoring best practices

- 组织方式：主张技能正文控制在 500 行以内，长内容拆到一层深的引用文件；超过 100 行的引用文件要在顶部放目录；复杂流程给可复制的 checklist。
- 调用方式：description 决定加载，要求第三人称、写清做什么与何时用，技能名用动名词；正文写给模型看，不写给终端用户看。
- 强制检查与脚本：给三组 checklist（核心质量 10 条、代码与脚本 8 条、测试 4 条）与一套评估 JSON 结构（`skills`、`query`、`files`、`expected_behavior`），但文档明说当时没有内置运行器，判据靠人跑或自建脚本。
- 失败处理：脚本要自己处理错误并在缺文件时建默认值，不把异常丢回模型；高风险批量操作用 plan-validate-execute，中间产物先校验再执行。
- 读取范围：`platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md` 全文；原 `docs.claude.com` 地址 302 到该域。

## Claude Code Subagents 文档

- 组织方式：子代理是一个 Markdown 文件加 YAML frontmatter，正文直接成为该子代理的 system prompt；`name` 与 `description` 必填，其余字段控制工具、模型、权限模式、预加载技能与隔离方式。
- 调用方式：主代理按 description 自动委派，也可以显式点名；目录优先级为企业 managed、CLI `--agents`、项目 `.claude/agents/`、用户 `~/.claude/agents/`、插件 `agents/`。
- 强制检查与脚本：`hooks`、`permissionMode`、`maxTurns` 可以约束子代理行为，但插件来源的子代理不支持 hooks、mcpServers 与 permissionMode；文档没有给验收脚本。
- 失败处理：前台调用遇 API 错误会返回部分输出并标注截断，后台任务标 failed 并保留最后输出；报告要经过输出扫描，可用 SendMessage 恢复会话继续。
- 读取范围：`code.claude.com/docs/en/sub-agents.md` 正文前约 50KB（截断），字段表、位置与优先级、内置代理、上下文与失败处理各节已读。

## Claude Code Plugins overview

- 组织方式：插件是一个目录，`.claude-plugin/plugin.json` 给名字与元数据，`skills/`、`agents/`、`hooks/hooks.json`、`.mcp.json` 分别提供技能、子代理、钩子与 MCP 服务。
- 调用方式：从 marketplace 安装后整包加载；技能以 `/plugin-name:skill-name` 调用；每个可被自动调用的技能与代理，其 name 与 description 每轮都在上下文里，正文只在用到时加载。
- 强制检查与脚本：安装前可在 `/plugin` 里看 Context cost 估算，装完可用 measure 页读实际占用；开发期用 `--plugin-dir` 直接从文件夹加载；插件技能可用 `claude plugin eval` 测。
- 失败处理：插件带来的 MCP 服务会随会话一起跑，钩子在事件上触发，权限按当前用户身份执行；文档把安全审查单列一页，要求装前先看。
- 读取范围：`code.claude.com/docs/en/plugins/overview.md` 全文（请求 `plugins.md` 被重定向到 `plugins/overview.md`）。

## OpenAI Agents SDK：Tools

- 组织方式：工具分托管、本地、函数、代理即工具四类，函数工具的 schema 从签名与 docstring 自动生成；工具多时用 `tool_namespace` 分组并配一个 `ToolSearchTool` 做延迟加载。
- 调用方式：工具随 Agent 声明，由 `tool_use_behavior`、`tool_choice` 与 tool search 决定何时调用；Programmatic Tool Calling 让模型生成 JavaScript 在托管 V8 里组合工具输出。
- 强制检查与脚本：函数工具有参数校验、超时与错误处理；guardrail 可在输入输出两侧拦截；托管 V8 里只能调用显式允许的工具。
- 失败处理：工具搜索在 client 执行模式下，标准 Runner 遇到 `tool_search_call` 直接抛错；命名 `tool_choice` 不能指向裸命名空间。
- 读取范围：`openai-agents-python/tools/` 全文，正文在 Programmatic Tool Calling 代码块处截断，之后的小节未读。

## OpenAI Agents SDK：Agents 与 instructions

- 组织方式：`Agent` 由 `instructions`、`tools`、`handoffs`、`guardrails`、`output_type`、`model_settings`、`prompt` 组成；`instructions` 可以是固定字符串，也可以是每次调用重算的回调。
- 调用方式：由 `Runner` 运行；`prompt` 引用平台模板并传 `variables`；多代理分 Manager（agents as tools）与 Handoffs 两种编排。
- 强制检查与脚本：`output_type` 触发结构化输出校验，guardrail 能在输入输出两侧拦截；文档没有给验收脚本，只能自建评测，`reset_tool_choice` 默认 True 用于防工具循环。
- 失败处理：`tool_use_behavior` 决定工具跑完后是回模型还是停；guardrail 失败按配置中断或重试。
- 读取范围：`openai-agents-python/agents/` 全文，正文在 multi-agent 示例代码处截断，Dynamic instructions 之后的小节未读全。

## DeepSeek Harness：dsh-doc 技能与 agent-preset

- 组织方式：一个 41 行的 `SKILL.md` 当入口，列出 16 个 `references/` 与 2 套 `templates/`；单文件与每个引用都控制在 8192 字符以内，超过会被标准预设的工具结果裁剪器剪掉。
- 调用方式：agent-preset 用 Cordis YAML 声明子插件，`skills/` 目录通过 `skill-filesystem` 挂载；技能按 description 触发；声明里 `id` 必填且不能重复。
- 强制检查与脚本：正文规定找事实的顺序为运行时检查（`cordis_inspect_list`、`cordis_inspect_query`）、安装包内文档与源码、两者都不可得才说未验证；装载技能本身不等于获得改动授权。
- 失败处理：Desktop 安装包里 `app.asar` 不能被 ls、glob 或搜索工具读取，只有文件读取工具能打开单个文件，模板要先复制到工作区再用。
- 读取范围：安装包内 `@deepseek-ai/dsh` 的 `package.json`、`dsh-agent-preset/README.md`、`skills/dsh-doc/SKILL.md`；官方 docs 目录（skills.md、plugins.md、.vitepress/config.mts）读取均返回 not found。

## obra/superpowers

- 组织方式：15 个技能各自一个目录，`SKILL.md` 只放触发条件与流程，细节放同目录支持文件；正文统一含铁律、阶段步骤、Rationalizations 对照表、Red Flags 与完成前 Checklist。
- 调用方式：按 description 自动触发，或用 `superpowers:<skill>` 显式调用；技能之间用 “REQUIRED SUB-SKILL” 声明下一步，构成从构思到收尾的固定链路。
- 强制检查与脚本：TDD 要求先看到测试失败再写实现，调试要求先定位根因再改，收尾要求先跑全套测试；这些是写在正文里的硬性步骤，没有可执行脚本代劳。
- 失败处理：每份技能都给 Rationalizations 表与 Red Flags 清单，把“这次情况特殊”的常见借口逐条驳回；测试红、修复三次不成、菜单被跳过都要求停下回到上一步。
- 读取范围：README、repo API 元数据，以及 test-driven-development、writing-skills、brainstorming、writing-plans、requesting-code-review、systematic-debugging、finishing-a-development-branch 七份 `SKILL.md` 全文。

## anthropics/skills

- 组织方式：19 个自包含技能目录，除 `SKILL.md` 外按需带 `scripts/`、`references/`、`assets/`、`evals/`；仓库另带 `spec` 与 `template` 两份可复用材料。
- 调用方式：作为 Claude Code 插件市场安装（`document-skills`、`example-skills` 两个插件），再按 description 触发；也可复制目录单独使用。
- 强制检查与脚本：`skill-creator` 带评测脚本（`python -m scripts.aggregate_benchmark` 汇总、`python -m scripts.run_loop` 按测试集调 description）与 grader、comparator、analyzer 三个子代理模板，产出 `benchmark.json` 与 `pass_rate`；`webapp-testing` 带 `with_server.py` 管服务器生命周期。
- 失败处理：评测流程要求同一轮里 with-skill 与 baseline 各跑一次并记录耗时与 token，断言写进 grading 结果（字段必须是 text、passed、evidence），失败项回写到技能正文再迭代；`with_server.py` 起不来时按脚本的 `--help` 与错误输出排查。
- 读取范围：README 全文、`skills/` 目录清单（19 项）与提交号 `e4bb5d9`；`skill-creator`、`webapp-testing` 正文按摘要记录，未逐字通读全部脚本。

## ComposioHQ/awesome-claude-skills

- 组织方式：以索引为主，按十余个分类列出条目，绝大多数条目直接链接到 obra/superpowers 或 anthropics/skills 的原目录；仓库自带的完整技能只有 `changelog-generator` 一个。
- 调用方式：读者按分类找到目标技能，再跳到上游仓库安装；changelog-generator 由自然语言触发，正文给 6 步流程与输出示例。
- 强制检查与脚本：索引本身没有判据；changelog-generator 没有脚本、没有引用文件，只靠正文提示词与“发布前人工复核”的 Tips。
- 失败处理：changelog-generator 未写失败路径，遇到无提交历史或提交信息不全时没有规定动作。
- 读取范围：master 分支 README 全文、`changelog-generator/SKILL.md` 全文、提交号 `be2a406`。

## affaan-m/ECC

- 组织方式：技能为 `skills/<name>/SKILL.md`，frontmatter 常规字段外加 `metadata.origin: ECC`；另有 `.agents/skills/` 供 Codex 读取，每个技能配一个 `agents/openai.yaml`；hooks、rules、memory、安全扫描各成一层。
- 调用方式：以插件 `ecc@ecc` 安装，技能按 description 触发，命令作为旧入口保留（自述 99 个 command shims）；多个 harness 各有安装目标。
- 强制检查与脚本：hooks 在生命周期事件上强制，例如拦截绕过 git hook 的提交、检测提示词里的密钥、SessionStart 注入上下文；另带 `doctor`、`repair`、`list-installed` 等自检命令。
- 失败处理：安装冲突要求先 `doctor` 再 `repair`，不叠装第二份；hook 可用环境变量按 ID 关闭或调整严格度；AgentShield 扫提示词、hooks、MCP 配置与密钥。
- 读取范围：README 全文（约 50KB 后截断）、`skills/accessibility/SKILL.md` 全文、main 提交号 `4adeee6`；328 个技能未逐个读。

## mhattingpete/claude-skills-marketplace

- 组织方式：四个插件（engineering-workflow、visual-documentation、productivity-skills、code-operations），清单在 `.claude-plugin/marketplace.json` 与各插件 `plugin.json`；技能是 `skills/<name>/SKILL.md` 加可选 `scripts/`、`references/`，子代理用 `AGENT.md`。
- 调用方式：按 marketplace 安装；技能由模型按 description 自动触发，子代理是独立 Claude 实例。
- 强制检查与脚本：`code-refactor` 改完要求再 Grep 一次确认无残留；`code-transfer` 带 `scripts/line_insert.py`；`code-execution` 宣称批量操作省 90–99% token。
- 失败处理：`code-refactor` 的 Edge Cases 要求字符串与注释里的命中先问人，改导出 API 要警告破坏性变更；未写自动化回滚。
- 读取范围：README 全文与只读 `code-refactor/SKILL.md` 一份正文，提交号 `b5b34bc`；engineering-workflow 下的 feature-planning、git-pushing、review-implementing、test-fixing 四份 `SKILL.md` 未读。

## superpowers · test-driven-development（测试生成）

- 组织方式：单 `SKILL.md` 加同目录 `writing-good-tests.md`；正文按 RED、GREEN、REFACTOR 组织，每阶段列出必须执行的动作，另有 Common Rationalizations 表与 Red Flags 清单。
- 调用方式：description 明确“任何功能或修 bug 之前”，由模型自动触发；也可显式调用 `superpowers:test-driven-development`。
- 强制检查与脚本：要求真跑项目测试命令并看输出——先写失败测试并确认它失败，再写最小实现让它通过，最后重构并跑全套；绿不了不许进下一步。
- 失败处理：测试意外通过说明测试没测到东西，要改测试；重构阶段测试转红则回退；正文的 When Stuck 表给出卡住时的下一步。
- 读取范围：`skills/test-driven-development/SKILL.md` 全文。

## superpowers · writing-plans（需求拆解与规格转计划）

- 组织方式：单 `SKILL.md`；计划文档固定头写 Goal、Architecture、Tech Stack、Spec、Global Constraints、Review Focus，每个任务块写 Files、Interfaces 与 5 个步骤。
- 调用方式：有 spec 或需求、要动多步任务时由 description 触发；开场必须声明“I'm using the writing-plans skill to create the implementation plan.”；写完做五项 Self-Review，再让人员选择 subagent-driven 或 native 执行。
- 强制检查与脚本：步骤粒度要求每步一个动作一个可检查结果；没有脚本，Self-Review 五项靠人工逐条对照。
- 失败处理：多子系统要拆成多份计划；计划比代码还长说明已经把代码写进计划，要收窄。
- 读取范围：`skills/writing-plans/SKILL.md` 全文。

## superpowers · brainstorming（需求拆解与规格撰写）

- 组织方式：单 `SKILL.md` 加 `builder-check-prompt.md`；设计文档存 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`，含 intent 与 why、goals/non-goals/anti-goals、constraints、approaches、已定 how 与留给 builder 的部分。
- 调用方式：description 用强制语气，任何创作前先走；硬性顺序为单条消息列 2–3 个方案、写设计文档、等人批准、调用 `writing-plans`。
- 强制检查与脚本：`<HARD-GATE>` 规定设计文档批准前不写代码、不搭脚手架、不装依赖；判据是人的批准，没有脚本。
- 失败处理：项目级设计要派子代理做 builder check，把异议分三堆（文档已回答、可自行决断、必须问人）；对方说 “sounds good” 不算批准。
- 读取范围：`skills/brainstorming/SKILL.md` 全文。

## superpowers · requesting-code-review（代码评审）

- 组织方式：单 `SKILL.md` 加 `code-reviewer.md` 子代理模板，模板占位符为 `{DESCRIPTION}`、`{PLAN_OR_REQUIREMENTS}`、`{BASE_SHA}`、`{HEAD_SHA}`；输出固定 Strengths、Issues（Important/Minor）、Assessment 三段。
- 调用方式：任务完成、重大功能完成、合并 main 前三类时机强制；派 general-purpose 子代理执行，协调者不自己看 diff。
- 强制检查与脚本：用 `git rev-parse HEAD~1` 与 `git merge-base origin/main HEAD` 固定审查区间；评审结论靠子代理判断，没有评分脚本。
- 失败处理：Critical 立刻修，Important 推进前修，Minor 记录；审查者判断有误可带技术理由反驳；不为“it's simple”跳过评审。
- 读取范围：`skills/requesting-code-review/SKILL.md` 全文。

## superpowers · systematic-debugging（调试）

- 组织方式：单 `SKILL.md` 加三份支持文件（`root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`）；正文按四阶段组织，附 Red Flags、Rationalizations 表与 Quick Reference 表。
- 调用方式：遇 bug、测试失败或异常行为、在提修复前由 description 触发；四阶段必须依次完成。
- 强制检查与脚本：要求先稳定复现、读完整堆栈、在每层边界加诊断日志；修复前先写失败测试，这一步可跑；根因判断没有脚本。
- 失败处理：修复不到 3 次回第一阶段重查；达到 3 次停止并质疑架构，与人讨论后再动；“无根因”多数是调查不完整。
- 读取范围：`skills/systematic-debugging/SKILL.md` 全文。

## superpowers · finishing-a-development-branch（发布收尾）

- 组织方式：单 `SKILL.md`，六步固定流程：跑测试、探环境、确认 base 分支、给菜单、执行、清理。
- 调用方式：实现完成且测试全绿后由 description 触发；菜单原文照念等人选，丢弃分支要人输入 `discard` 确认。
- 强制检查与脚本：合并前跑全套测试命令（npm test、cargo test、pytest、go test ./...），红了即停；本地合并后要在合并结果上再跑一遍。
- 失败处理：移除 worktree 被拒（有未提交文件）时绝不加 `--force`，列出文件给三选项；push 被拒先查原因再处理。
- 读取范围：`skills/finishing-a-development-branch/SKILL.md` 全文。

## mhattingpete · code-refactor（重构）

- 组织方式：单 `SKILL.md`；按文件数分两档，1–9 个用原生 Grep 加 Edit `replace_all`，10 个以上自动转 `code-execution` 技能并调 `api.code_transform.rename_identifier`。
- 调用方式：由 description 触发（批量重命名、替换废弃写法、改 API 调用）；流程为 Grep 列文件、带上下文再 Grep、Edit、最后再 Grep 验证。
- 强制检查与脚本：最后一步再 Grep 确认零命中，可核对；没有测试命令，语义是否正确仍靠人看。
- 失败处理：字符串与注释里的命中要先问人；改导出 API 要警告破坏性变更；大小写敏感要写明。
- 读取范围：`code-refactor/SKILL.md` 全文。

## ahmed-lakosha · odoo-upgrade（迁移）

- 组织方式：技能在 `odoo-upgrade-plugin/odoo-upgrade/`，`SKILL.md` 约 220 行，配 `reference/` 两篇与 `scripts/`（`cli.py` 加 XML、JS、Python 三个 transforms 模块）；插件层另有 4 个 hooks、3 个斜杠命令与 `upgrade-analyzer` 子代理。
- 调用方式：斜杠命令 `/odoo-upgrade`、`/odoo-precheck`、`/odoo-quickfix`，或由 description 自动触发；hooks 在 PreToolUse 拦改写 Odoo 核心文件，PostToolUse 提示版本兼容问题。
- 强制检查与脚本：工作流固定为分析、备份、`cli.py precheck`、按 manifest/XML/Python/JS/SCSS 顺序变换、`cli.py validate`、起 Odoo 装模块跑测试；迁移脚本必须定义 `def migrate(cr, version)` 并守卫空版本。
- 失败处理：PreToolUse 的 guard 直接阻止对核心文件的写入；兼容性错误触发时提示改用升级技能；`odoo-upgrade.config.json` 三个键控制核心路径、目标版本路径与默认目标版本。
- 读取范围：`SKILL.md` 全文、插件 README 全文、目录清单、master 提交号 `5541d98`。

## Composio · changelog-generator（发布说明）

- 组织方式：单 `SKILL.md`，纯提示词，无脚本、无引用文件；五段为 When to Use、What This Skill Does、How to Use、Example、Tips。
- 调用方式：自然语言触发，例如“为 v2.1.0 生成 changelog”“本周更新说明”；正文给 6 步流程与输出示例。
- 强制检查与脚本：只有 Tips 里的“发布前人工复核”，没有检查清单或命令，输出对不对靠人读。
- 失败处理：未写失败路径；无提交历史或提交信息不全时没有规定动作。
- 读取范围：`changelog-generator/SKILL.md` 全文。

## 未取得原文与仅取得摘要的项

- DeepSeek Harness 官方文档正文未取得：安装包内 `C:\Users\YJM1024\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\docs\user\guide\skills.md`、同目录 `plugins.md`、`...\dsh\docs\.vitepress\config.mts` 三处路径用文件读取工具打开均返回 not found，Desktop 包未带 docs 目录。DSH 一行只依据 `...\@deepseek-ai\dsh-agent-preset\README.md` 与 `...\dsh-agent-preset\skills\dsh-doc\SKILL.md` 两份安装包内原文。
- Claude Code 三页文档（`https://code.claude.com/docs/en/skills.md`、`https://code.claude.com/docs/en/sub-agents.md`、`https://code.claude.com/docs/en/plugins/overview.md`）均为文档站渲染正文，前两页在约 50KB 处被截断，截断点之后的示例与边角字段未读；三页都没有版本号。
- Agent Skills 规范页 `https://agentskills.io/specification` 部分截断，目录结构与字段表已读，校验节之后的内容未读全。
- OpenAI 两页截断：`https://openai.github.io/openai-agents-python/tools/` 在 Programmatic Tool Calling 代码块处截断，`https://openai.github.io/openai-agents-python/agents/` 在 multi-agent 示例处截断，Dynamic instructions 之后的完整示例未读。
- anthropics/skills 只通读了 `README.md` 与 `skills/` 目录清单，以及 `skills/skill-creator/SKILL.md`、`skills/webapp-testing/SKILL.md` 的正文；其余 17 个（academy-guide、algorithmic-art、brand-guidelines、canvas-design、claude-api、discernment-nudge、doc-coauthoring、docx、frontend-design、internal-comms、mcp-builder、pdf、pptx、slack-gif-creator、theme-factory、web-artifacts-builder、xlsx）的 `SKILL.md` 未逐个读，脚本未逐行读。
- ECC 自述 328 个技能、72 个 agents，只通读 `README.md`（约 50KB 后截断）与 `skills/accessibility/SKILL.md` 一份技能正文，其余技能只看到目录名。
- mhattingpete/claude-skills-marketplace 只读 `code-operations-plugin/skills/code-refactor/SKILL.md` 一份正文，engineering-workflow 下的 feature-planning、git-pushing、review-implementing、test-fixing 四份 `SKILL.md` 未读；`code-transfer` 与 `code-execution` 只从 README 取到描述。
- 链接状态：表内 22 条链接分三类核对。7 条文档页（Claude Code 三页、Agent Skills 规范、Anthropic best practices、OpenAI 两页）用抓取工具打开均返回 HTTP 200；6 条 GitHub 仓库主页（deepseek-harness、obra/superpowers、anthropics/skills、ComposioHQ/awesome-claude-skills、affaan-m/ECC、mhattingpete/claude-skills-marketplace）用 GitHub API 复核存在；9 条 GitHub blob 链接的内容由对应 `raw.githubusercontent.com` 地址抓取确认（HTTP 200），沙箱内 `curl` 对全部外链返回 000，未能用命令行二次复测。
- 星数为 GitHub API 2026-11-27 查询值（obra/superpowers 327326、affaan-m/ECC 311205、ComposioHQ/awesome-claude-skills 80387 等），与常见量级差距较大，表中只作查询记录，不据此推断流行度。
