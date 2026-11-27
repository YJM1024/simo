# 框架 v2 原始采集合订（SOURCES-RAW）

本文件由 2026-11-27 的文书削减把 `docs/framework/v2/sources/` 下七份原始表合订而成，`SOURCES.md` 与 `RESEARCH.md` 未改。各节标题保留原文件的分节序号，引用写作 `sources/SOURCES-RAW.md` 的「<原文件名> 第 N 节」；原文件已移入隔离目录，路径见 `docs/framework/v2/README.md`。

| 原文件 | 节数 | 主题 |
|---|---|---|
| sdd.md | 13 | 规范驱动开发 |
| agents.md | 13 | 多智能体编排与 Agent 工程 |
| standards.md | 11 | 软件工程标准与过程模型 |
| product-design.md | 4 | 需求与设计 |
| engineering.md | 3 | 工程规范、API 设计与测试 |
| testing.md | 14 | 测试类来源 |
| skills.md | 23 | AI skill 与技能规范 |

## sdd.md

采集时间 2026-11-27，版本、提交与 star 数取当日 GitHub API 与官方文档返回值。来源按主题分三组：完整工作流框架（GitHub Spec Kit、OpenSpec、cc-sdd、Kiro、BMAD-METHOD、Taskmaster、CCPM、Agent OS、GSD Core），技能封装与分发（Claude Code skills、Claude Code plugins），技能编写规范（Anthropic Agent Skills）。第三组不覆盖需求到实现的阶段链，只作为流程被封装成可调用单元时的规范来源。

“是否有可执行判据”一列的口径：有，指项目自带命令或脚本能给出通过、失败或需人工确认的明确结论；部分，指只有模板勾选、只读分析报告、智能体检查或人工评审；无，指没有任何检查环节。star 数按 GitHub topic `spec-driven-development` 当日快照取：OpenSpec 75802、gsd-build/get-shit-done 64120、BMAD-METHOD 55785、cc-sdd 3781；其中 gsd-build/get-shit-done 已归档，正文按其指向的 open-gsd/gsd-core 采集。

### sdd.md 第 1 节 GitHub Spec Kit

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| GitHub Spec Kit | GitHub | v1.4.5（2026-11-25 发布），head `f2010547` | https://github.com/github/spec-kit ；https://github.com/github/spec-kit/blob/main/spec-driven.md | 宪章、需求规格、澄清、设计、任务、一致性分析、实现、收敛 | 先用九条宪章约束架构，再由模板生成 spec、plan、tasks，agent 按任务清单实现后用只读分析和收敛命令回检 | `/speckit.constitution`、`/speckit.specify`、`/speckit.clarify`、`/speckit.plan`、`/speckit.checklist`、`/speckit.tasks`、`/speckit.analyze`、`/speckit.implement`、`/speckit.converge`；`specs/<branch>/spec.md`、`plan.md`、`tasks.md`、`memory/constitution.md` | 部分 | “Specifications don't serve code—code serves specifications.”（`spec-driven.md` §The Power Inversion）；“This is NON-NEGOTIABLE: All implementation MUST follow strict Test-Driven Development.”（§Article III: Test-First Imperative） |

- 步骤链：`/speckit.constitution` 立宪章，`/speckit.specify` 生成分支与 `specs/[branch-name]/spec.md`，`/speckit.clarify` 补歧义，`/speckit.plan` 出 `plan.md` 及 `research.md`、`data-model.md`、`contracts/`、`quickstart.md`，`/speckit.checklist` 生质量清单，`/speckit.tasks` 出 `tasks.md` 并给独立任务标 `[P]`，`/speckit.analyze` 做只读一致性分析，`/speckit.implement` 按清单实现，`/speckit.converge` 把实现结果折回规格。
- 产出文件：`specs/[branch-name]/` 下 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`、`tasks.md`；宪章在 `memory/constitution.md`；当前活动特性记录在 `.specify/feature.json`。
- 强制检查：`/speckit.analyze` 只出报告不阻断；`plan.md` 模板的 Phase -1 gates 要求过 Simplicity Gate（项目数不超过 3）与 Anti-Abstraction Gate（直接用框架），不过要在 Complexity Tracking 里写明理由；`/speckit.converge` 成功时输出 `✅ Converged — the implementation satisfies the spec, plan, and tasks.`。
- 模板：`templates/spec-template.md` 要求 User Story 按 P1 到 P3 排优先级、功能需求编号 `FR-001`、未定项写 `[NEEDS CLARIFICATION: ...]`、成功标准编号 `SC-001` 且必须可测；宪章九条含 Library-First、CLI Interface、Test-First、Simplification、Anti-Abstraction、Integration-First。
- 已读页面：README、`spec-driven.md` 全文、`docs/quickstart.md` 全文、`docs/reference/agentic-sdd.html` 全文、`templates/spec-template.md` 全文。

### sdd.md 第 2 节 OpenSpec

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| OpenSpec | Fission AI | v2.2.0（2026-11-24 发布），head `f1cd852f` | https://github.com/Fission-AI/OpenSpec ；https://openspec.dev/docs/quickstart | 探索、提案、规格增量、设计、任务、实施、归档 | 每个变更一个目录，proposal、specs、design、tasks 四件套随变更走，实施后由归档命令把增量并入长期规格 | `/openspec-explore`、`/openspec-propose`、`/openspec-apply-change`、`/openspec-archive-change`；`openspec validate`、`openspec status`、`openspec archive`；`openspec/changes/<change>/` 下 `proposal.md`、`specs/`、`design.md`、`tasks.md` | 有 | “OpenSpec adds a lightweight spec layer so you agree on what to build before any code is written.”（README §Why OpenSpec?）；“each change gets its own folder with proposal, specs, design, and tasks”（同上） |

- 步骤链：`/openspec-explore` 先摸代码与方案，`/openspec-propose <change>` 建 `openspec/changes/<change>/` 并写提案、规格、设计、任务，`/openspec-apply-change` 逐条勾任务，`/openspec-archive-change` 归档并把规格增量并入 `openspec/specs/`；扩展 profile 另有 `openspec-new-change`、`openspec-continue-change`、`openspec-ff-change`、`openspec-verify-change`、`openspec-bulk-archive-change`、`openspec-onboard`。
- 产出文件：`openspec/changes/<change>/` 下 `proposal.md`、`specs/<capability>/spec.md`、`design.md`、`tasks.md`，可选 `.openspec.yaml`；归档进 `openspec/changes/archive/<YYYY-MM-DD>-<change>/`；长期规格在 `openspec/specs/`。
- 强制检查：`openspec validate` 校验变更结构，`--strict` 加严，`--archived` 检查已归档变更；`openspec status` 与 `openspec list --specs` 查进度与规格清单；纯重构这类零 delta 变更必须在 `.openspec.yaml` 写 `skip_specs: true`，否则校验不过。
- 模板：schema `spec-driven` 自带 `proposal.md` 与 `spec.md` 模板，`openspec templates` 列出可选项；需求用 `### Requirement:`，场景用四个井号的 `#### Scenario:` 加 WHEN/THEN，正文用 SHALL 或 MUST，单条描述不超过 500 字符。
- 已读页面：README 全文、`docs/quickstart` 全文、`docs/cli` 大部、`docs/schemas/spec-driven` 大部；后两页尾部被工具截断，尾部内容仅取得摘要。

### sdd.md 第 3 节 cc-sdd

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| cc-sdd | gotalab | v3.1.0（2026-09-23 发布），head `e2a0c671` | https://github.com/gotalab/cc-sdd ；https://github.com/gotalab/cc-sdd/blob/main/docs/guides/spec-driven.md | 发现与路由、项目上下文、需求、设计、任务、实现、校验 | 以边界为第一性原则把 spec 当作独立交付与再验证单元，按需求、设计、任务三份文件推进，每阶段停等人工批准 | `/kiro-discovery`、`/kiro:steering`、`/kiro:spec-init`、`/kiro:spec-requirements`、`/kiro:spec-design`、`/kiro:spec-tasks`、`/kiro-impl`、`/kiro-validate-impl`；`.kiro/specs/<feature>/requirements.md`、`design.md`、`tasks.md` | 有 | “A good spec should make it clear: what this spec owns … what it explicitly does not own”（`docs/guides/spec-driven.md` §Boundary-First by Default）；“Both modes follow the **Feature Flag TDD** protocol (RED then GREEN).”（§`/kiro-impl` Modes） |

- 步骤链：`/kiro-discovery` 把请求分到扩展已有 spec、直接实现、单 spec、多 spec、混合拆分五种结果之一，新单 spec 或多 spec 时写 `brief.md`，需要时写 `roadmap.md`；`/kiro:steering` 收集架构与约定，`/kiro:spec-init` 建 `.kiro/specs/<feature>/`，`/kiro:spec-requirements` 出 `requirements.md`，`/kiro:spec-design` 先出 `research.md` 再出 `design.md`，`/kiro:spec-tasks` 出 `tasks.md`，`/kiro-impl` 逐任务实现，`/kiro-validate-impl` 做集成校验，`/kiro:spec-status` 报进度。
- 产出文件：`.kiro/specs/<feature>/` 下 `requirements.md`、`research.md`、`design.md`、`tasks.md`；`design.md` 含 File Structure Plan 一节，把目录结构与文件职责写进去；`tasks.md` 用 `(P)` 标可并行任务，用 `_Boundary:_` 标组件范围，用 `_Depends:_` 记非显然依赖。
- 强制检查：每个阶段默认停等人工 review，只有显式传 `-y` 或 CLI 的 `--auto` 才自动放行；`/kiro-validate-impl` 返回 `GO`、`NO-GO` 或 `MANUAL_VERIFY_REQUIRED`；`kiro-verify-completion` 返回 `VERIFIED`、`NOT_VERIFIED` 或 `MANUAL_VERIFY_REQUIRED`。
- 模板：`{{KIRO_DIR}}/settings/templates/specs/{requirements,design,tasks}.md` 可改，团队可把评审清单与签核要求写进模板头，技能与命令生成文档时读这些模板。
- 已读页面：README、`docs/guides/spec-driven.md` 全文、`docs/guides/skill-reference.md` 全文。

### sdd.md 第 4 节 Kiro

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Kiro | AWS | 闭源 IDE，按官方文档采集（2026-11-27 读取），无公开版本号 | https://kiro.dev/docs/specs/ ；https://kiro.dev/docs/specs/feature-specs/ | 需求、设计、任务、实现、校验 | 三份文件加审批门，需求用 EARS 句式写成可测条目，设计先过审再拆任务 | `requirements.md`、`design.md`、`tasks.md`；`Analyze Requirements`、`Run all Tasks`、`Sync Files`；目录 `.kiro/specs/<feature>/` | 部分 | “WHEN [condition/event] THE SYSTEM SHALL [expected behavior]”（`docs/specs/feature-specs.md` §Requirements with EARS Notation）；“Start with the behavior of the system you want to create, captured as requirements, then generate technical design and implementation tasks.”（同页 §Workflow Variants Requirements-First） |

- 步骤链：先选 Requirements-First（先 `requirements.md` 再生成 `design.md`，再拆任务）或 Design-First（先 `design.md` 再导 `requirements.md`），变体在创建时选定且之后不能切换；Quick Spec 一次跑完三阶段，不在阶段间设审批门，适合需求已经清楚的特性。
- 产出文件：`.kiro/specs/<feature>/` 下 `requirements.md`、`design.md`、`tasks.md`；`design.md` 覆盖架构、数据流、接口、数据模型、错误处理、单元测试策略。
- 强制检查：`Analyze Requirements` 检查矛盾、歧义、冲突与缺口，结论由模型给出，不产出退出码；`Run all Tasks` 按依赖图分 wave 并发执行，`Sync Files` 把已完成任务回填 `tasks.md`；bugfix spec 用 `SHALL CONTINUE TO` 记录不应改变的行为，并生成 property-based tests。
- 模板：三份文件由 IDE 按所选变体生成；已读页面没有给出可替换的独立模板文件或模板目录。
- 已读页面：`kiro.dev/docs/specs/` 全文、`docs/specs/feature-specs.md` 全文、`docs/specs/best-practices.md` 全文。

### sdd.md 第 5 节 BMAD-METHOD

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| BMAD-METHOD | BMad Code LLC | v6.12.4（2026-10-14 发布），head `e435a225`；另发 V7 预览 | https://github.com/bmad-code-org/BMAD-METHOD ；https://docs.bmad-method.org/reference/ticket-tree/ | 澄清、计划、构建与验证、复盘 | 票据即 spec，initiative 与 epic 各有一份带稳定需求编号的票据文件，条目按依赖排进 tickets.toml，由脚本给出可做与阻塞清单 | `tickets.py` 的 `next`、`status`、`find`、`pull`、`mark`、`move`、`mirror`；`_bmad-output/initiative-<slug>/tickets/tickets.toml`、`epic-<slug>/tickets.toml`、`story-<slug>-plan.md` | 有 | “An initiative or epic file is the spec at its level.”（The Ticket Tree §Ticket Files）；“Three to six checks that show the work is finished, judged at closure and by the retrospective”（同节 Done when 行） |

- 步骤链：Clarify 澄清想法，Plan 写 PRD、切 initiative、设计 UX 与架构、规划 epic 与 story，Build and verify 建票据树后逐张构建、评审、测试，Learn and adjust 收尾 epic 并复盘。
- 产出文件：`_bmad-output/initiative-<slug>/` 下 `initiative-<slug>.md`、`prd-<slug>/`、`ux-<slug>/`、`architecture-<slug>/`、`tickets/tickets.toml`、`epic-<slug>/epic-<slug>.md`、`epic-<slug>-retrospective.md`、epic 内 `tickets.toml`、`story-<slug>-plan.md` 与 `backlog/`；计划文件 frontmatter 记 `status`、`baseline_revision`、`route`、`risk`。
- 强制检查：`tickets.py` 读树后输出一个 JSON 对象，成功退出码 0，存储禁止该操作退出码 2，其他错误退出码 1；状态机里 `built` 是构建写入的最后一个状态，`done` 由人或受指派的脚本与智能体打；接外部看板时 `tickets.py next` 要先同步看板状态并带 `--synced` 重跑，否则拒绝执行。
- 模板：票据节固定 Description、Outcome、Requirements、Constraints、Done when、Boundaries、References、Notes；条目键含 `id`、`type`、`verify`、`covers`、`after`、`hitl`、`risk`、`unknown`、`refine`、`plan_checkpoint`、`done_checkpoint`。
- 已读页面：README、`docs.bmad-method.org/start/how-bmad-works` 全文、`reference/ticket-tree` 全文。

### sdd.md 第 6 节 Taskmaster

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Taskmaster | Hamster（eyaltoledano） | `task-master-ai@0.43.1`（2026-03-31 发布），head `c0c98d36` | https://github.com/eyaltoledano/claude-task-master ；https://tryhamster.com/docs/taskmaster/capabilities/task-structure | 需求解析、任务拆解、依赖管理、复杂度评估、执行跟踪 | 把 PRD 解析成带依赖与子任务的 tasks.json，用状态与依赖决定下一件可做的事 | `task-master parse-prd`、`list`、`next`、`show`、`set-status`、`expand`、`analyze-complexity`、`validate-dependencies`、`generate`；`.taskmaster/tasks.json` | 有 | “task-master parse-prd <prd-file.txt>”（CLI Commands §Parse PRD）；“Show the next task to work on based on dependencies and status”（同页 §Show Next Task） |

- 步骤链：写 PRD 后用 `task-master parse-prd` 生成任务，`expand` 把任务拆成子任务，`next` 按依赖与状态取下一件，`set-status` 推进状态，`analyze-complexity` 评估复杂度并出报告，`validate-dependencies` 查非法依赖。
- 产出文件：`.taskmaster/tasks.json` 为事实源，`generate` 生成逐任务文件；任务字段含 `id`、`title`、`description`、`status` 与 `priority`、`dependencies`、`details`、`testStrategy`、`subtasks`、`metadata`。
- 强制检查：`validate-dependencies` 只查不修，`fix-dependencies` 自动修非法依赖；`analyze-complexity` 按 1 到 10 打分并可用 `--threshold` 卡阈值；没有测试级门禁。
- 模板：`.taskmaster/templates/example_prd.txt` 为 PRD 样例；MCP 工具共 36 个，可裁到 standard 15 个或 core 7 个。
- 已读页面：README、`tryhamster.com/docs/taskmaster/capabilities/task-structure` 全文、`cli-root-commands` 大部（命令表已覆盖，尾部被截断）。

### sdd.md 第 7 节 CCPM

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| CCPM | Automaze | 无正式 release，head `0bcfabb5`（2026-11-04） | https://github.com/automazeio/ccpm ；https://github.com/automazeio/ccpm/blob/main/skill/ccpm/SKILL.md | 计划、结构化拆解、同步到 GitHub、并行执行、跟踪 | PRD 转 epic，epic 拆成带依赖的任务并同步为 GitHub issue，issue 成为事实源，并行 agent 在独立 worktree 里实现 | `.claude/prds/<name>.md`、`.claude/epics/<feature>/epic.md`；`status.sh`、`standup.sh`、`validate.sh`、`next.sh`、`blocked.sh` 等 15 个脚本 | 有 | “Every line of code must trace back to a specification.”（README §Core Principle: No Vibe Coding）；“For deterministic operations … always run the bash script directly rather than doing the work manually”（`SKILL.md` §Script-First Rule） |

- 步骤链：Plan 用引导式讨论写 PRD 并转成技术 epic，Structure 把 epic 拆成带编号、依赖与并行标记的任务文件，Sync 把 epic 与任务推成 GitHub issue 并回写 issue 号，Execute 识别并行工作流后开 agent 与 worktree，Track 出状态、站会、搜索、下一件与阻塞清单。
- 产出文件：`.claude/prds/<name>.md`、`.claude/epics/<feature>/epic.md`、任务文件 `001.md`（同步后按 issue 号命名）、`<N>-analysis.md`、`updates/`；每个 epic 建独立 worktree `../epic-<name>/`。
- 强制检查：确定性操作一律跑脚本而不由模型现算，脚本含 `status.sh`、`standup.sh`、`epic-list.sh`、`epic-show.sh`、`search.sh`、`in-progress.sh`、`next.sh`、`blocked.sh`、`validate.sh`；`validate.sh` 校验项目状态。
- 模板：PRD 与 epic 的写法分别写在 `references/plan.md` 与 `references/structure.md` 等阶段说明里，SKILL.md 按阶段指向这些文件。
- 已读页面：README 全文、`skill/ccpm/SKILL.md` 全文。

### sdd.md 第 8 节 Agent OS

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Agent OS | Builder Methods（Brian Casel） | v3.0.0（2026-01-20 发布），head `e892e61d` | https://github.com/buildermethods/agent-os ；https://buildermethods.com/agent-os/shape-spec | 标准提炼与注入、产品规划、规格成形 | 在 plan mode 里把范围、决策、参照与适用标准落成一个持久的 spec 目录，再按该目录实现 | `/shape-spec`；`agent-os/specs/YYYY-MM-DD-HHMM-<slug>/` 下 `plan.md`、`shape.md`、`references.md`、`standards.md`、`visuals/` | 无 | “The `/shape-spec` command is designed to run in plan mode … creating a spec folder that persists beyond the conversation.”（Shape Spec §What it does）；“Folder names are auto-generated: `YYYY-MM-DD-HHMM-{feature-slug}/`”（同页 §What gets saved） |

- 步骤链：Discover standards 从既有代码提炼团队标准，Inject standards 把相关标准注入当前上下文，Product planning 写产品规划，Shape Spec 在 plan mode 里回答范围、视觉稿、可参照代码、产品对齐与适用标准五类问题后成文。
- 产出文件：`agent-os/specs/YYYY-MM-DD-HHMM-<slug>/` 下 `plan.md`、`shape.md`、`references.md`、`standards.md`、`visuals/`；目录名按日期时间加特性短名自动生成。
- 强制检查：没有独立检查命令；`/shape-spec` 把“保存 spec 文档”设为计划第一项任务，计划由人 review 批准后才执行。
- 模板：spec 目录结构本身就是模板；`plan.md` 是完整计划，`shape.md` 记范围、决策与上下文，`standards.md` 存相关标准全文。
- 已读页面：README、`buildermethods.com/agent-os` 首页全文、`/agent-os/shape-spec` 全文。

### sdd.md 第 9 节 GSD Core

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| GSD Core | open-gsd（原 gsd-build） | v1.23.0（2026-11-23 发布），head `26429a68`；原仓 gsd-build/get-shit-done 已归档 | https://github.com/open-gsd/gsd-core ；https://github.com/open-gsd/gsd-core/blob/main/docs/explanation/the-phase-loop.md | 讨论、可选 UI 设计、计划、执行、验证、交付 | 以里程碑与阶段为单位跑固定循环，每步产出落进 `.planning/`，执行器每次用全新上下文按 wave 并行 | `/gsd-new-project`、`/gsd-onboard`、`/gsd-quick`；`.planning/ROADMAP.md`、`STATE.md`、阶段内 `CONTEXT.md`、`RESEARCH.md`、`PLAN.md`、`VERIFICATION.md`、`UI-SPEC.md` | 部分 | “GSD Core structures all development work as a repeating cycle”（The phase loop §What the loop is）；“A phase is not done because execution finished without errors.”（同文 §Verify） |

- 步骤链：Discuss 用对话定实现决策并写 `CONTEXT.md`，可选 `/gsd-ui-phase` 出 `UI-SPEC.md`，Plan 由 researcher 写 `RESEARCH.md`、planner 写 `PLAN.md`、plan-checker 查完整与一致，Execute 由执行器按依赖 wave 并行并原子提交，Verify 出 `VERIFICATION.md` 并生成定点修复计划，Ship 建 PR 并归档、更新 `STATE.md`。
- 产出文件：`.planning/` 下 `ROADMAP.md` 与 `STATE.md`，阶段目录内 `CONTEXT.md`、`RESEARCH.md`、`PLAN.md`、`VERIFICATION.md`、`UI-SPEC.md`；`STATE.md` 是导航层，记录当前里程碑、进行中的阶段与计划完成情况。
- 强制检查：verifier 检查需求编号覆盖、`CONTEXT.md` 决策覆盖与阶段目标一致性，产出 `VERIFICATION.md`；plan-checker 在执行前查计划完整、一致、在范围内；两者都由智能体执行，无脚本退出码。
- 模板：`PLAN.md` 固定写要触碰的文件、具体改动与验收标准，并按依赖排成 wave；`CONTEXT.md` 只在 Discuss 阶段写，后续 planner、executor、verifier 都读它。
- 已读页面：README 全文、`docs/explanation/the-phase-loop.md` 全文。

### sdd.md 第 10 节 Claude Code skills

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Claude Code skills | Anthropic | 官方文档（2026-11-27 读取），部分能力按版本标注（`/skill-doctor` 需 v2.1.252、`prompt-audit` 需 v2.1.283） | https://code.claude.com/docs/en/skills.md | 流程封装、按需载入、调用控制（不覆盖需求到实现阶段链） | 一份 `SKILL.md` 加 YAML frontmatter 组成技能，正文只在触发时载入，模型或用户都可调用 | `SKILL.md`；`/skill-name`；`/verify`、`/run`、`/doctor`；`claude plugin eval` | 部分 | “Create a `SKILL.md` file with instructions, and Claude adds it to its toolkit.”（Extend Claude with skills 开篇）；“Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools.”（同页） |

- 机制：技能是过程性知识而不是事实性知识，正文按需载入；frontmatter 的 `description` 与 `when_to_use` 合并后截断到 1536 字符，供模型判断是否触发。
- 加载位置：企业级、个人 `~/.claude/skills`、项目 `.claude/skills`、嵌套目录、`--add-dir` 追加目录、插件内置；`.claude/commands/` 的旧命令仍可用，多文件需求要转成技能目录。
- 强制检查：`/verify` 构建并运行应用来确认改动，不退回测试或类型检查；`/skill-doctor` 报每个技能的成本与使用次数；`/doctor` 查未用技能与上下文成本；`claude plugin eval` 做插件与技能评估。文档未给出可阻断流程的脚本退出码。
- frontmatter 字段：`name`、`description`、`when_to_use`、`argument-hint`、`arguments`、`disable-model-invocation`、`user-invocable`、`allowed-tools`、`disallowed-tools`、`model`、`effort`、`context: fork`、`agent`、`background`、`hooks`、`paths`、`shell`、`metadata`、`license`、`compatibility`。
- 已读页面：`code.claude.com/docs/en/skills.md` 全文，含 Frontmatter reference 一节。

### sdd.md 第 11 节 Claude Code plugins

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Claude Code plugins | Anthropic | 官方文档（2026-11-27 读取），无独立版本号 | https://code.claude.com/docs/en/plugins/overview.md | 打包安装、分发、作用域控制（不覆盖阶段链） | 插件是一个目录，装技能、子智能体、钩子与 MCP 服务器打包成一个安装单元，经 marketplace 分发 | `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`；`/plugin`、`claude plugin disable`、`--plugin-dir` | 部分 | “A Claude Code plugin is a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit.”（Plugins overview §Understand what a plugin is） |

- 机制：marketplace 是带 `.claude-plugin/marketplace.json` 的仓库或目录，只作目录不当托管商店；marketplace 名分 official、community、third-party 三层，第三方插件以用户权限运行代码。
- 作用域：user 在本机所有项目生效，project 通过提交 `.claude/settings.json` 对仓库内所有人生效，local 只对本人本仓库生效；云会话不加载本地设置里的插件。
- 命令：`/plugin` 浏览与安装，`claude plugin disable` 停用不卸载，`--plugin-dir` 从本地目录直接加载开发中的插件。
- 成本与判据：启用后每个技能的名称与描述每轮都进上下文，skills 文档说明可用 `/skill-doctor` 查看各技能成本与使用次数；插件评估用 `claude plugin eval` 与无插件基线对照，没有强制门禁。
- 已读页面：`code.claude.com/docs/en/plugins/overview.md` 全文。

### sdd.md 第 12 节 Anthropic Agent Skills 规范

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Anthropic Agent Skills 规范 | Anthropic | 官方文档与 agentskills.io 开放标准（2026-11-27 读取） | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview ；https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | 技能编写、渐进披露、评估（不覆盖阶段链） | 三级载入，元数据常驻、正文触发时读、附带文件与脚本按需取，用评估先行的方式写技能 | `SKILL.md`；`reference/`、`scripts/`；评估用例 JSON | 部分 | “The context window is a public good.”（best practices §Concise is key）；“Only add context Claude doesn't already have.”（同文 §Default assumption） |

- 机制：第一级是 frontmatter 元数据，约 100 token，常驻上下文；第二级是 `SKILL.md` 正文，触发时载入，建议不超 5k token；第三级是附带文件与脚本，按需读取，脚本执行结果才进上下文。
- 约束：`name` 不超 64 字符，只允许小写字母、数字与连字符，不能含 anthropic 与 claude；`description` 不超 1024 字符，写清做什么与何时用，用第三人称；正文不超 500 行；引用文件保持一层深，避免链式引用。
- 判据：frontmatter 不合规会硬报错；评估先建三个场景，对照无技能的基线运行，用结果而不是印象判断技能是否有效；已读页面没有给出可直接运行的评估命令。
- 环境差异：claude.ai 可装 npm 与 PyPI 包，API 环境无网络且不能装包；非 Claude Code 渠道只认 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools` 六个字段，多写字段会报 `Unexpected key(s) in SKILL.md frontmatter: ...`。
- 已读页面：`agent-skills/overview` 全文、`agent-skills/best-practices` 全文。

### sdd.md 第 13 节 未取得原文

- gsd-build/get-shit-done：仓库已归档，README 只有迁移说明，实际正文按 open-gsd/gsd-core 采集，表中版本取后者。
- Kiro：闭源 IDE，没有公开源码仓库，全部内容按 kiro.dev 官方文档采集，版本号未取得。
- OpenSpec：`docs/cli` 与 `docs/schemas/spec-driven` 两页在抓取工具侧被截断，尾部未读到，仅取得摘要；已读部分覆盖命令表与规格写法，表内引用未涉及被截断的尾部。
- 其余 10 个来源均取得正文，无整份缺失。

## agents.md

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

### agents.md 第 1 节 MetaGPT

- 角色：Role 子类在 `__init__` 里用 `self.set_actions([...])` 声明可执行动作，用 `self._watch([UserRequirement])` 或 `self._watch([SimpleWriteCode])` 声明订阅哪些上游动作；README 写明内置产品经理、架构师、项目经理、工程师，SOP 把协作流程固定成动作序列。
- 产物：动作返回 `Message(content=code_text, role=self.profile, cause_by=type(todo))`，由 `Environment` 按 `cause_by` 广播给订阅该动作的角色；下游用 `self.get_memories()` 取上游消息继续加工。
- 避免自审自签：多智能体示例里有 SimpleReviewer 与其 `SimpleWriteReview` 动作，负责检查测试覆盖与质量；订阅关系写在代码里，仓库文档没给独立签收或门禁机制。
- 上下文：示例里 `context = self.get_memories(k=1)[0].content` 只取最近一条，注释写 "use the most recent memory as context"；也可 `self.get_memories()` 取全部记忆；`Team.run` 的 `n_round` 默认 5。
- 读取范围：GitHub README 全文、文档站 MultiAgent 101 页与 Agent Communication 页全文、PyPI 元数据。

### agents.md 第 2 节 ChatDev

- 角色：1.0 以 CEO、CTO、Programmer 等职务角色组成 Virtual Software Company，通过 "specialized functional seminars" 完成设计、编码、测试、文档；2.0 的 YAML 图用 `agent` 节点声明 provider、model、prompt_template、tooling、thinking、memories。
- 产物：节点输出统一为 `List[Message]` 写入 `WareHouse/<session>/`，`context.json` 存上下文快照；1.0 的 Git mode 让 programmer 用 Git 管版本，提交即交接。
- 避免自审自签：1.0 的 Human-Agent-Interaction 让人扮演 reviewer 向 programmer 提意见；2.0 有 `human` 节点暂停等输入；另有 `make validate-yamls` 只检查 YAML 语法与 schema。
- 上下文：`passthrough` 节点默认只转发最后一条消息，用于上下文过滤；`literal` 节点注入固定内容；边条件（关键词、function、regex_extract）决定走哪条分支。
- 读取范围：GitHub README 全文、docs/user_guide 的节点类型页与执行页全文。

### agents.md 第 3 节 AutoGen

- 角色：`AssistantAgent` 由 name、model_client、system_message、tools 定义，自述为 "kitchen sink" agent；团队预设 RoundRobinGroupChat（共享上下文轮流发言）、SelectorGroupChat（模型选下一个发言者）、MagenticOneGroupChat、Swarm（用 HandoffMessage 转交）。
- 产物：`TaskResult` 带 `messages` 与 `stop_reason`，`messages` 同时保留 agent 的思考过程与最终回复；`HandoffMessage` 表示控制权转交。
- 避免自审自签：文档给出 primary 加 critic 的 reflection 模式，critic 被要求回 APPROVE，团队用 `TextMentionTermination("APPROVE")` 结束；是否设 critic 由使用者决定，无强制门禁。
- 上下文：`BufferedChatCompletionContext(buffer_size=5)` 只保留最近 N 条消息，"useful to avoid context overflow in many LLMs"；`HeadAndTailChatCompletionContext` 留头尾，`TokenLimitedChatCompletionContext` 按 token 截断。
- 读取范围：文档站 AgentChat 的 overview、agents、teams、messages、model context、termination、human-in-the-loop 七页渲染正文（源文件是 .ipynb）。

### agents.md 第 4 节 CrewAI

- 角色：Agent 的 role、goal、backstory 三者必填并决定行为，另有 llm、tools、allow_delegation；process 为 hierarchical 时由 manager 协调全队。
- 产物：Task 的 description 与 expected_output 必填，输出可用 output_pydantic、output_json 结构化，用 output_file 落盘，并自动传给下一任务。
- 避免自审自签：guardrail 在任务产出交给下一任务前校验，不通过把错误发回 agent 重试（guardrail_max_retries 默认 3）；hierarchical 的 manager "validating outcomes before proceeding"。
- 上下文：`respect_context_window=True` 时超限自动摘要；单次工具结果超过窗口 25% 时 agent 只收到预览与临时文件引用；同一工具同参数同结果连续 5 次即熔断。
- 读取范围：docs 的 agents、tasks、crews 三页全文，README 全文。

### agents.md 第 5 节 Agent OS

- 角色：2.0 用 `roles/implementers.yml` 与 `roles/verifiers.yml`，每个 role 写明 standards 与 `verified_by`（由哪个 verifier 验证）；2.1 移除这套系统，改由 `agents/` 下子代理文件定义 spec-initializer、spec-shaper、spec-verifier、implementer、implementation-verifier、product-planner。
- 产物：`requirements.md`、`spec.md`、`tasks.md` 逐级落盘；实施前写 `orchestration.yml` 记录任务组、指派的子代理与 standards；实现者把 tasks.md 里对应项改成 `- [x]`。
- 避免自审自签：实现与验证分属不同子代理，implementation-verifier 独立核对 tasks.md、跑全量测试并写 `verifications/final-verification.html`；spec 校验在 2.1 改为"仍可调用"的可选子代理，不再自动触发。
- 上下文：standards 按任务组编译后随委派下发；1.1.0 引入条件加载与 `mission-lite.md`、`spec-lite.md` 精简副本，CHANGELOG 记作上下文效率提升 60-80%。
- 读取范围：README、CLAUDE.md、CHANGELOG 全文；shape-spec、write-spec、verify-spec、create-tasks-list、implement-tasks、orchestrate-tasks、verify-tasks、create-verification-report 与 implementation-verifier 全文。

### agents.md 第 6 节 OpenAI Agents SDK

- 角色：Agent 由 instructions、tools、handoffs、output_type、guardrails 定义；编排有 agents as tools（经理 agent 保持控制权、把专家当工具调）与 handoffs（分流后专家接管本轮）两种。
- 产物：`final_output` 与运行结果对象；handoff 默认让新 agent 看到整段对话历史，可用 `input_filter` 只传需要部分，SDK 自带 `remove_all_tools` 等过滤器。
- 避免自审自签：input/output guardrail 返回 `tripwire_triggered` 为真即抛异常中止；tool guardrail 在执行前后包住每次函数工具调用；挂不挂 guardrail 由使用方配置。
- 上下文：guardrail 默认并行执行，可设 `run_in_parallel=False` 先检后跑；`nest_handoff_history` 把可摘要历史压成 assistant 摘要段；Session 自动管理跨轮对话历史。
- 读取范围：README、docs 的 multi_agent、handoffs、guardrails 三页全文。

### agents.md 第 7 节 OpenAI Swarm

- 角色：Agent 只含 instructions 与 functions，没有角色系统；handoff 由函数返回另一个 Agent 实现。
- 产物：无持久产物，调用返回 Response（含 messages 与当前 agent）；README 写明 "does not store state between calls"。
- 避免自审自签：无 guardrail、无审查角色、无终止校验，只靠 `max_turns` 防死循环。
- 上下文：每次只放当前 agent 的 instructions，"Only the `instructions` of the active `Agent` will be present at any given time"；数据靠 context_variables 显式传递。
- 读取范围：README 全文（仓库无独立文档站），源码未逐行读。

### agents.md 第 8 节 LangGraph

- 角色：不内建角色，节点函数加 State 决定各步做什么；supervisor、子图等分工模式由使用方自行搭建。
- 产物：图状态按 thread_id 存成 checkpoint，可回放、分支与恢复；Store 存跨线程长期记忆。
- 避免自审自签：无内建审查角色；`interrupt()` 可在节点里暂停并把 payload 交给调用方，恢复时用 `Command(resume=...)`，文档给的 approval_node 例子据此决定 `Command(goto="proceed")` 还是 `Command(goto="cancel")`。
- 上下文：checkpointer 管线程级短期状态，Store 管跨线程长期记忆；节点恢复时从头重跑，所以 interrupt 前只放幂等副作用，interrupt 调用顺序固定、不能包在 try/except 里；checkpoint 会无限增长，需清理或设保留策略。
- 读取范围：README、overview、persistence、interrupts 四页全文。

### agents.md 第 9 节 Superpowers

- 角色：协调者不实现，每个任务派一个全新 implementer 子代理；审查由协调者另派 task reviewer（spec 合规加代码质量）与 whole-branch reviewer。
- 产物：计划逐任务写 exact file paths、complete code、verification steps；进度写 `progress.md` ledger，首行 `# SDD ledger — plan: <plan file path>`，完成行写 `Task <N>: complete (commits <base7>..<head7>, review clean)`。
- 避免自审自签：每个任务后必须两段审查，"Implementer self-review never replaces the task review"；implementer 不得自己派审查者，"A worker-spawned reviewer is a defect to flag, not rigor"。
- 上下文：派单 prompt 只带该任务需要的材料并"Hand artifacts over as files"；禁止让子代理读整份计划；审查者只拿 brief、report、review package 三个文件路径加全局约束。
- 读取范围：README、subagent-driven-development 与 requesting-code-review 两个 SKILL.md 全文。

### agents.md 第 10 节 claude-flow / Ruflo

- 角色：100+ 预置 agent，按 swarm 拓扑组织，可选 hierarchical、mesh、adaptive；hierarchical 由 Queen 主导，共识用 Raft、Byzantine、Gossip。
- 产物：HNSW AgentDB 存记忆；`ruflo verify` 输出安装字节与签名 witness 的核对结果。
- 避免自审自签：`ruflo verify` 是供应链校验，核对安装字节而非审查工作产物；README 没给独立审查角色。
- 上下文：README 把 harness 定位为给模型工具、记忆、循环、沙箱与控制；12 个后台 worker 与 48 个插件承载任务与上下文。
- 读取范围：README 全文与 releases 元数据；仓库 docs/USERGUIDE.md 是 307KB 单文件，未通读。

### agents.md 第 11 节 Anthropic《Effective context engineering for AI agents》

- 角色：不定义角色；子代理架构里主 agent 派子任务，子代理 "returns only a condensed, distilled summary of its work (often 1,000-2,000 tokens)"。
- 产物：compaction 后的摘要、结构化笔记（NOTES.md、to-do 列表）、子代理返回的浓缩摘要。
- 避免自审自签：文章只讨论上下文维护手段，不涉及审查与签收流程。
- 上下文：主张 "finding the smallest possible set of high-signal tokens"；三种手段是 compaction、structured note-taking、sub-agent architectures；另提出 context rot 现象。
- 读取范围：文章正文全文（页面实际落在 /research/ 路径）。

### agents.md 第 12 节 Anthropic《Building effective AI agents》

- 角色：角色按 prompt 与工具划分；orchestrator-workers 由主 LLM 拆任务给 worker，evaluator-optimizer 由两个 LLM 分别生成与评估。
- 产物：步骤之间传中间结果；prompt chaining 可在步骤之间插入 programmatic checks 作为 gate。
- 避免自审自签：evaluator-optimizer 把生成与评估分给两次调用，"one LLM call generates a response while another provides evaluation and feedback in a loop"。
- 上下文：三条原则是 simplicity、transparency（显式展示 agent 的规划步骤）、认真设计并测试 ACI；按任务可预测性在 workflow 与 agent 之间选择。
- 读取范围：文章正文全文。

### agents.md 第 13 节 未取得原文与仅取得摘要的项

- OpenAI Swarm 仓库没有独立文档站，只有 README；README 全文已读，核心源码未逐行读，因此 Swarm 的上下文细节只到 README 描述层面。
- claude-flow（Ruflo）只读了 README 全文与 GitHub releases 元数据，wiki 文档站未逐页读。
- AutoGen 官方文档源文件是 .ipynb，读的是渲染后的 HTML 正文，未读 notebook 源码。
- Agent OS 的命令正文按 single-agent 与 multi-agent 分目录，读的是 single-agent 版；multi-agent 版的 write-spec、create-tasks、implement-tasks 命令正文未读。
- LangGraph 读了 README、overview、persistence、interrupts 四页全文，human-in-the-loop 的细节页未读。
- MetaGPT 中文文档与 API 参考未读，只读英文教程两页与 README。
- 版本口径：MetaGPT 的 GitHub releases/latest 为 v0.8.1，PyPI 为 0.8.2，两处不一致，表内并列；Swarm 的 releases/latest 返回 404，按无发行版记录。

## standards.md

本文件按固定表头抄录十项来源，只写官方摘要页或全文里能读到的内容。付费墙或订阅制来源在“全文取得情况”中标注“仅取得摘要”并写明缺哪部分，不按已通读处理。原文摘录保留英文原句，未做改写。

| 标准或模型 | 编号与版本 | 发布方 | 出处链接 | 覆盖环节 | 关键要求（两条以内） | 是否可判定（有客观判据/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|---|
| 需求工程 | ISO/IEC/IEEE 29148:2018(E)，第 2 版，2018-11 | ISO/IEC JTC 1/SC 7 与 IEEE 联合发布 | https://www.iso.org/standard/72089.html | 需求获取、分析、规格化、确认 | 规定产出需求的活动所执行的过程；规定这些过程产生的信息项及其内容要求。 | 部分 | “specifies the required processes implemented in the engineering activities that result in requirements for systems and software products (including services) throughout the life cycle”；“specifies the required contents of the required information items” |
| 验证与确认 | IEEE 1012-2024 | IEEE（Computer Society） | https://standards.ieee.org/ieee/1012/7324 | 验证与确认，按完整性等级贯穿生命周期 | 判定开发产品是否符合其活动要求、是否满足预期用途与用户需要；按完整性等级规定 V&V 生命周期过程要求，手段含分析、评价、评审、检查、评估、测试。 | 部分 | “The Verification and Validation (V&V) processes are used to determine whether the development products of a given activity conform to the requirements of that activity and whether the product satisfies its intended use and user needs.”；“V&V life cycle process requirements are specified for different integrity levels.” |
| 软件测试 | ISO/IEC/IEEE 29119-1:2022、29119-2:2021、29119-4:2021 | ISO/IEC JTC 1/SC 7 与 IEEE 联合发布 | https://www.iso.org/standard/81291.html<br>https://standards.ieee.org/ieee/29119-2/7498/<br>https://www.iso.org/standard/79430.html | 测试概念、测试过程（治理、管理、实施）、测试设计与实现 | 规定可治理、管理并实施软件测试的测试过程，适用于任何生命周期模型；规定测试设计与实现阶段使用的测试设计技术，用于推导测试用例。 | 有 | “This document specifies test processes that can be used to govern, manage and implement software testing for any organization, project or testing activity.”；“This document defines test design techniques that can be used during the test design and implementation process that is defined in ISO/IEC/IEEE 29119-2.” |
| 质量模型 | ISO/IEC 25010:2023，第 2 版，2023-11 | ISO/IEC JTC 1/SC 7 | https://www.iso.org/standard/78176.html | 质量需求、验收准则、质量度量 | 产品质量模型由九个特性及其子特性组成；该模型作为待规定、测量与评价的产品质量的参照。 | 部分 | “The product quality model is composed of nine characteristics (which are further subdivided into subcharacteristics) that relate to quality properties of the products.”；“The characteristics and subcharacteristics provide a reference model for the quality of the products to be specified, measured and evaluated.” |
| 过程改进模型 | CMMI V3.0（模型经 CMMI Model Viewer 订阅提供） | ISACA（CMMI Institute） | https://cmmiinstitute.com/cmmi | 组织级过程改进与能力评估 | 由培训与认证、评估方法、模型、采用指南、系统与工具五个组件构成的集成绩效方案；同一模型按领域定制（Development、Services、Suppliers、Security、Safety、People、Data、Virtual）。 | 部分 | “CMMI is an integrated performance solution consisting of 5 components that, when used together, provide a clear and proven path to achieving your business objectives.”；“CMMI is one model with multiple customized domains that apply to different business environments” |
| 架构视图模型 | Kruchten《The 4+1 View Model of Architecture》，IEEE Software 12(6):42-50，1995-11，DOI 10.1109/52.469759 | IEEE Software；作者 Philippe Kruchten（Rational Software） | https://doi.org/10.1109/52.469759<br>https://www.cs.ubc.ca/~gregor/teaching/papers/4+1view-architecture.pdf | 架构描述、架构设计验证 | 用逻辑、进程、开发、物理四个视图加场景描述架构，每个视图给出组件、连接、容器、干系人与关注点；场景既驱动架构元素发现，又在设计完成后承担验证与说明作用，并作为架构原型测试的起点。 | 部分 | “Software architecture = {Elements, Forms, Rationale/Constraints}.”；“This view is redundant with the other ones (hence the ‘+1’), but it serves two main purposes: as a driver to discover the architectural elements during the architecture design … as a validation and illustration role after this architecture design is complete” |
| 架构评估方法 | ATAM（Architecture Tradeoff Analysis Method），SEI 方法集合页，2018-02-14 | Software Engineering Institute, Carnegie Mellon University | https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ | 架构评估、质量属性权衡分析 | 以质量属性目标为参照评估架构，并揭示各质量目标之间的相互影响与权衡；评估按九步进行，第 5 步生成质量属性效用树，第 6 步与第 8 步分析架构方法并产出风险、敏感点、权衡点，第 9 步汇报结果。 | 部分 | “The Architecture Tradeoff Analysis Method® (ATAM®) is a method for evaluating software architectures relative to quality attribute goals.”；“The ATAM gets its name because it not only reveals how well an architecture satisfies particular quality goals but it also provides insight into how those quality goals interact with each other—how they trade off against each other.” |
| 敏捷框架 | The Scrum Guide，2020-11 | Ken Schwaber 与 Jeff Sutherland（scrumguides.org），CC BY-SA | https://scrumguides.org/scrum-guide.html | 迭代交付、角色、事件、工件与完成定义 | 三个工件各带一个承诺：Product Backlog 对 Product Goal、Sprint Backlog 对 Sprint Goal、Increment 对 Definition of Done；Sprint 为固定长度且不超过一个月，Sprint Planning、Daily Scrum、Sprint Review、Sprint Retrospective 各有固定时间盒。 | 部分 | “The Definition of Done is a formal description of the state of the Increment when it meets the quality measures required for the product.”；“Scrum is a lightweight framework that helps people, teams and organizations generate value through adaptive solutions for complex problems.” |
| 流动管理 | The Kanban Guide，2025-05，v2025.5 | Orderly Disruption Limited 与 Daniel S. Vacanti, Inc.（页面标注 Creative Commons 许可，许可节写 CC BY 4.0，前言写 CC BY-SA 4.0） | https://kanbanguides.org/the-kanban-guide/ | 工作流定义、在制品控制、流动度量 | 三项实践并行：定义并可视化工作流、主动管理工作流中的工作项、改进工作流；Definition of Workflow 至少由工作项定义、起止点、状态、在制品控制方式、显式流转策略、服务级别期望六项组成，且必须采集在制品数量、吞吐量、工作项年龄、周期时间四项流动度量。 | 有 | “Kanban is a strategy for optimizing the flow of value through a process. It comprises the following three practices working in tandem: Defining and visualizing a workflow; Actively managing items in a workflow; Improving a workflow.”；“85% of work items will be finished in eight days or less” |
| 交付效能度量 | DORA software delivery performance metrics（页面 2026-01-05 更新）；源出 Accelerate 四项指标，现为五项 | Google Cloud DORA，作者 Nathen Harvey，CC BY 4.0；Accelerate 书作者 Forsgren、Humble、Kim（2018） | https://dora.dev/guides/dora-metrics/ | 交付效能度量与改进 | 五项指标为 change lead time、deployment frequency、failed deployment recovery time、change fail rate、deployment rework rate；由原四项（deployment frequency、lead time、change fail rate、time to restore）扩展为五项，time to restore 更名为 failed deployment recovery time。 | 有 | “DORA has identified five software delivery performance metrics”；“shifting from the original four keys to the current five-metric model” |

### standards.md 第 1 节 需求工程：ISO/IEC/IEEE 29148:2018

- 可检查要求的环节：需求过程是否按标准执行，需求信息项是否存在且覆盖标准规定的内容要素；可检查对象是过程活动与信息项本身。
- 只是原则的环节：需求条目质量特性（必要、无歧义、可验证等）的判定准则写在正文，官方摘要页未列出，本次采集不掌握具体条目，不能当作可检查判据使用。
- 全文取得情况：仅取得摘要（ISO 官方摘要页），缺正文中的过程模型、信息项模板与需求特性清单；未通读全文。

### standards.md 第 2 节 验证与确认：IEEE 1012-2024

- 可检查要求的环节：各完整性等级下应执行的 V&V 活动与应产出的 V&V 结果，可用分析、评价、评审、检查、评估、测试六类手段核对。
- 只是原则的环节：完整性等级的划分与对应活动强度写在正文，摘要只说明“按不同完整性等级规定要求”，具体分级表与判据未取得。
- 全文取得情况：仅取得摘要（IEEE 标准页面），缺正文的完整性等级定义、各等级 V&V 任务清单与报告要求；未通读全文。

### standards.md 第 3 节 软件测试：ISO/IEC/IEEE 29119 系列

- 可检查要求的环节：测试过程的治理、管理与实施三层活动，测试文档产物与测试设计技术的选择及用例推导结果，可用“测试结果是否构成需求满足或缺陷存在的证据”核对。
- 只是原则的环节：测试技术的适用条件与风险驱动选择策略写在 29119-4 正文，摘要只说明技术用于推导用例，未给出各技术的选择判据。
- 全文取得情况：仅取得 29119-1、29119-2、29119-4 的官方摘要，缺正文的测试过程模型、文档模板与各技术的过程描述；未通读全文。

### standards.md 第 4 节 质量模型：ISO/IEC 25010:2023

- 可检查要求的环节：质量特性与子特性可作为质量需求条目、验收准则与度量的分类骨架，检查点是需求与验收条目是否逐项落到特性上。
- 只是原则的环节：九个特性各自的分量、度量方法与评价尺度不在本标准的摘要内（度量定义属 ISO/IEC 2502x 系列），摘要页未列出九个特性的名称。
- 全文取得情况：仅取得摘要（ISO 官方摘要页），缺正文的九特性及子特性定义与使用指南；未通读全文。

### standards.md 第 5 节 过程改进模型：CMMI V3.0

- 可检查要求的环节：评估方法可对组织能力作出评级，模型按领域定制的做法可用“所选领域与所购模型范围是否一致”核对。
- 只是原则的环节：公开页面只有组件构成与领域划分的概述，过程域（V3.0 称实践域）清单、实践陈述与评级判据都在订阅制模型查看器内，本次未取得。
- 全文取得情况：仅取得摘要（CMMI Institute 公开概述页，模型需付费订阅），缺过程域与实践清单、评估方法与评级判据；未通读全文。

### standards.md 第 6 节 架构视图模型：4+1 视图

- 可检查要求的环节：架构描述是否覆盖逻辑、进程、开发、物理四视图与场景，每视图是否给出组件、连接、容器、干系人与关注点，架构文档是否按 Software Architecture Document 的章节组织。
- 只是原则的环节：视图裁剪（单处理器可省物理视图、单进程可省进程视图）与迭代细化节奏由项目判断，原文未给量化判据；架构“原型化、测试、度量”只作过程主张。
- 全文取得情况：取得作者自存 PDF 全文并通读（IEEE Software 1995 正式版的作者早期稿，arXiv:2006.04975 注明“Early draft, better quality than IEEE published version”）；正式出版版未单独核读。

### standards.md 第 7 节 架构评估方法：ATAM

- 可检查要求的环节：九步评估的每一步是否执行，产出物是否齐备（架构方法、效用树、场景及其映射、质量属性问题与回答、风险、非风险、风险主题），可用产出物清单逐项核对。
- 只是原则的环节：效用树的评分与场景优先级排序、敏感点与权衡点的判定，依赖评估组判断，官方方法页未给量化阈值。
- 全文取得情况：取得 SEI 官方方法页全文并通读；ATAM 技术报告（含阶段 0–3 详细活动、角色分工、问卷与模板）未取得，属仅取得方法说明。

### standards.md 第 8 节 敏捷框架：Scrum Guide 2020

- 可检查要求的环节：三个工件是否各有承诺、Definition of Done 是否成文并被执行、Sprint 是否不超过一个月，Sprint Planning、Daily Scrum、Sprint Review、Sprint Retrospective 是否在各自时间盒内完成。
- 只是原则的环节：Definition of Done 的具体质量度量由团队自定，框架自称“purposefully incomplete”；角色行为与自管理方式属原则性描述。
- 全文取得情况：取得官方指南全文并通读（scrumguides.org，CC BY-SA）。

### standards.md 第 9 节 流动管理：The Kanban Guide 2025

- 可检查要求的环节：Definition of Workflow 六项要素是否齐备、在制品数量是否按定义受控、服务级别期望是否设定并可视化、四项流动度量是否持续采集，均可用看板与度量记录核对。
- 只是原则的环节：服务级别期望的具体数值（如示例“85% 的工作项在八天或更短时间内完成”）由团队设定，指南只给形式与示例；改进工作流的做法属原则。
- 全文取得情况：取得官方指南全文并通读（kanbanguides.org，v2025.5，CC BY 4.0）。

### standards.md 第 10 节 交付效能度量：DORA 与 Accelerate

- 可检查要求的环节：五项指标均可由部署记录与事件记录计算，检查点是部署时间戳、失败处置时间、变更失败与返工记录是否被完整采集。
- 只是原则的环节：指标高低与组织绩效的关系属研究结论，非判据；Accelerate 书中的统计模型与调查方法未取得。
- 全文取得情况：取得 DORA 官方指标页全文并通读；Accelerate 原书为付费出版物，未取得，四项指标的表述以 DORA 官方页的回顾为准。

### standards.md 第 11 节 未取得全文的来源与缺口

- ISO/IEC/IEEE 29148:2018、IEEE 1012-2024、ISO/IEC/IEEE 29119-1/-2/-4、ISO/IEC 25010:2023：标准正文按份售卖，只取得官方摘要页，缺过程模型、信息项模板、完整性等级表、测试技术描述与九特性定义。
- CMMI V3.0：模型内容在订阅制 CMMI Model Viewer 内（US$150/年），公开页只有组件与领域概述，缺实践域与实践陈述清单、评级判据。
- ATAM：取得 SEI 方法页全文，缺 ATAM 技术报告中的阶段 0–3 活动、角色分工、评估问卷与产出模板。
- Accelerate（Forsgren、Humble、Kim，2018）：付费图书，未取得，四项指标以 DORA 官方页的回顾性表述为准。
- 已通读全文的四项：4+1 视图论文（作者自存 PDF）、Scrum Guide 2020、The Kanban Guide v2025.5、DORA 指标页。

## product-design.md

# 需求与设计的一手来源抄录

采集日期 2026-11-27。本文件只做抄录与抽取：名称、版本、链接、原文摘录均取自来源页面本身，凡页面上没有的写法一律不补。判据一栏记来源自身是否给出可执行的判定口径，“有”指原文给出可计算或可机械核对的规则，“部分”指原文只覆盖其中一段，“无”指原文明确是原则性说明。15 个来源中 14 个已通读全文；WSJF 一页正文被登录墙截断，按“仅取得摘要”标注并写明缺哪部分。

### product-design.md 第 1 节 需求与用户故事写法

| 名称 | 版本或年份 | 出处链接 | 类别（需求/设计/无障碍） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
| --- | --- | --- | --- | --- | --- | --- |
| EARS（Easy Approach to Requirements Syntax） | 2009 年首发于 RE 2009（Mavin、Wilkinson、Harwood、Novak，pp. 317–322，doi 10.1109/RE.2009.9） | https://alistairmavin.com/ears/ | 需求 | 每条需求用固定句式书写，把前置条件、触发事件、系统名与系统响应分槽填入；规则为零到多个前置条件、零到一个触发、一个系统名、一个或多个响应。五种模式为 Ubiquitous、State driven、Event driven、Optional feature、Unwanted behaviour，同时含多种关键字时称 Complex。 | 有 | `While <optional pre-condition>, when <optional trigger>, the <system name> shall <system response>`；`Zero or many preconditions; Zero or one trigger; One system name; One or many system responses.` |
| Given-When-Then 场景写法（Cucumber Gherkin 参考） | 页面标注 Last updated on Nov 23, 2026；`Rule` 关键字自 Gherkin 6 起 | https://cucumber.io/docs/gherkin/reference/ | 需求 | 场景用 Given 写初始上下文、When 写事件或动作、Then 写可观察的预期结果，Then 步骤要用断言把实际输出与期望输出作比较。同文本的 Given、When、Then 步骤在查找步骤定义时被视作同一个步骤，因此三种关键字不能靠关键字区分。 | 有 | `Then` steps should use an assertion to compare the actual outcome to the expected outcome；`An outcome should be on an observable output.`；`Keywords are not taken into account when looking for a step definition.` |
| 用户故事地图（Jeff Patton） | 2008-01-28（演示页日期） | https://jpattonassociates.com/user-story-mapping-presentation/ | 需求 | 把用户故事排成二维地图，用来理解系统功能、找出 backlog 的漏洞与遗漏，并按用户与业务价值规划整批发布。方法由 Constantine 与 Lockwood 的 Task Modeling 结合用户故事写作工作坊演化而来，切片方法最早见 2005 年 1 月 Better Software 的《HOW YOU SLICE IT》。 | 部分 | `A user story map arranges user stories into a useful model to help understand the functionality of the system, identify holes and omissions in your backlog, and effectively plan holistic releases that delivery value to users and business with each release.`（原文如此拼写 delivery） |
| INVEST 原则（Bill Wake） | 2003-08-17 | https://xp123.com/articles/invest-in-good-stories-and-smart-tasks/ | 需求 | 好故事满足 Independent、Negotiable、Valuable、Estimable、Small、Testable 六条；规模上限是“最多数人周的工作量”，客户说不出怎么测说明故事本身不够清楚。 | 部分 | `I developed the INVEST acronym, and wrote this article in April and August, 2003.`；`Stories typically represent at most a few person-weeks worth of work.`；`If a customer doesn't know how to test something, this may indicate that the story isn't clear enough...` |
| Job Stories（Alan Klement，Intercom 博客） | 2013-12-23 | https://www.intercom.com/blog/using-job-stories-design-features-ui-ux | 需求 | 从高层 job 逐层拆到小 job，观察用户现在用什么办法解决，再按情境、动机与期望结果写出故事，据此决定功能与界面。故事要交代谁在什么情境下、为什么焦虑、想达成什么，方案里每个界面元素都要能回溯到某条 job。 | 部分 | `When car salespeople and their customers interact with each other via the product…`；`…so that clients will feel safe entering their financial information into a process.` |
| RICE 优先级评分（Sean McBride，Intercom 博客） | 2018-01-05 | https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/ | 需求 | 用 reach、impact、confidence、effort 四个因子给每条想法打分，再合成单一分数排序；reach 按固定时间区间计人数，impact 取 3、2、1、0.5、0.25 五档，confidence 取 100%、80%、50%，effort 按人月且作为除数。分数不当作硬规则，依赖关系或必需功能可以先行。 | 有（公式在正文以图片给出，四个因子的取值口径在文字中） | `RICE is an acronym for the four factors we use to evaluate each project idea: reach, impact, confidence and effort.`；`The resulting score measures “total impact per time worked” – exactly what we’d like to maximize.` |
| WSJF（SAFe 知识库） | 页面版权标注 2010–2026，无发布日期；仅取得摘要 | https://framework.scaledagile.com/wsjf | 需求 | 以相对成本延迟除以相对 job duration 得到 WSJF，并按此连续更新 backlog 的顺序，而非按理论 ROI 排序。WSJF 算法取相对的用户与业务价值、时间紧迫性、风险降低或机会使能，再以 job size 作分母。 | 部分 | `Weighted Shortest Job First (WSJF) is a prioritization model used to sequence work for maximum economic benefit. In SAFe, WSJF is estimated as the relative cost of delay divided by the relative job duration.`；`Backlogs are continuously prioritized based on a WSJF algorithm that uses relative user and business value, time criticality, risk reduction and/or opportunity enablement, and job size.` |

判定方式：EARS 的句式与规则集、Gherkin 的场景结构、RICE 的四因子取值与合成，都能由脚本或规则引擎复核，属于可脚本判定。用户故事地图、INVEST、Job Stories 要求对内容作判断，需人工评审。

判定方式：WSJF 只取得摘要，正文 Details 一节需登录才能阅读，缺评分推导与排序示例，因此只剩“相对成本延迟除以相对工作规模”这一条口径，只能原则性遵守；原文其余部分标注为仅取得摘要，未取得项见文末。

### product-design.md 第 2 节 设计

| 名称 | 版本或年份 | 出处链接 | 类别（需求/设计/无障碍） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
| --- | --- | --- | --- | --- | --- | --- |
| Nielsen 十大可用性启发式 | 1994-04-24 发布，Last reviewed Jan 30, 2024 | https://www.nngroup.com/articles/ten-usability-heuristics/ | 设计 | 十条启发式依次为系统状态可见、系统与真实世界匹配、用户控制与自由、一致性与标准、错误预防、识别优于回忆、灵活与高效、美学与极简设计、帮助用户识别与从错误中恢复、帮助与文档。原文自述这十条是宽泛经验法则，不是具体可用性规范。 | 无 | `The design should always keep users informed about what is going on, through appropriate feedback within a reasonable amount of time.`；`broad rules of thumb and not specific usability guidelines` |
| Material Design 3 交互状态与状态层 | M3 现行站页，无发布日期 | https://m3.material.io/foundations/interaction/states/overview 与 https://m3.material.io/foundations/interaction/states/state-layers 与 https://m3.material.io/foundations/interaction/states/applying-states | 设计 | 组件有 enabled、disabled、hovered、focused、pressed、dragged 六种状态，用固定不透明度的状态层表达，状态层用与内容相同的颜色，同一时刻只能应用一个状态层。状态层直径 40dp，可交互目标 48dp，disabled 状态不参与对比度要求。 | 有 | `only one state layer can be applied at a given time`；`The size of state layers is 40dp while the interactive target size is 48dp.`；`Disabled states don't need to meet Material's contrast requirements.` |
| Apple Human Interface Guidelines | Design principles 一节变更记录标注 June 8, 2026 重新引入（Reintroduced design principles） | https://developer.apple.com/design/human-interface-guidelines/design-principles 与 https://developer.apple.com/design/human-interface-guidelines/accessibility | 设计 | 八条设计原则为 Purpose、Agency、Responsibility、Familiarity、Flexibility、Simplicity、Craft、Delight，要求按产品用途取舍、可撤销与可返回、申请权限与采集数据时说明理由、界面行为保持一致、把无障碍当作起点。无障碍页要求文本至少可放大 200%（watchOS 140%），对比度按字号分档：17 pt 及以下 4.5:1，18 pt 3:1，粗体一律 3:1。 | 部分 | `Ideally, give people the option to enlarge text by at least 200 percent (or 140 percent in watchOS apps).`；`Simplicity isn’t minimalism.` |
| Design Tokens Format Module（W3C DTCG） | Final Community Group Report，2025-10-28 | https://www.designtokens.org/tr/2025.10/format/ | 设计 | 令牌文件是 JSON，令牌必须以 `$value` 承载值，类型由 `$type` 显式声明或从最近的父组继承，不得靠猜；名称不得以 `$` 开头，也不得含 `{`、`}`、`.`。组只是任意归类，工具不应据组名推断类型或用途。 | 有 | `Tools MUST NOT attempt to guess the type of a token by inspecting the contents of its value.`；token and group names `MUST NOT begin with the $ character`；`Groups are arbitrary and tools SHOULD NOT use them to infer the type or purpose of design tokens.` |
| C4 模型（Simon Brown） | 现行站点，无发布日期 | https://c4model.com/ | 设计 | 用系统上下文、容器、组件、代码四级抽象分层描述软件架构，主图四张，另有 system landscape、dynamic、deployment 三类补充图。方法与绘图符号、工具无关，适合不同受众按层级取用。 | 无 | `an easy to learn, developer friendly approach to software architecture diagramming`；notation independent 与 tooling independent |
| 架构决策记录 ADR（Michael Nygard） | 2011-11-15 | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | 设计 | 每个架构决策写一份短文本记录，含 Title、Context、Decision、Status、Consequences 五节，按 `doc/arch/adr-NNN.md` 存放，顺序编号且号码不复用。状态取 proposed、accepted、deprecated、superseded，被推翻的旧记录保留并标 superseded，单份长度控制在一到两页。 | 部分 | `An architecture decision record is a short text file in a format similar to an Alexandrian pattern.`；`ADRs will be numbered sequentially and monotonically. Numbers will not be reused.`；`The whole document should be one or two pages long.` |

判定方式：Material Design 3 的状态层不透明度与 40dp／48dp 尺寸、DTCG 的 JSON 结构与命名禁用字符，都能由脚本直接核对或校验，属于可脚本判定。Apple HIG 只有部分条目给出数值（文本放大比例、对比度），其余原则需人工评审。

判定方式：Nielsen 十大启发式与 C4 模型原文明确是经验法则与方法框架，没有可机械核对的阈值，只能原则性遵守；ADR 的五节结构与编号规则可由脚本检查文件骨架，内容质量与状态流转需人工评审。

### product-design.md 第 3 节 无障碍

| 名称 | 版本或年份 | 出处链接 | 类别（需求/设计/无障碍） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
| --- | --- | --- | --- | --- | --- | --- |
| WCAG 2.2 — 1.1.1 Non-text Content（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#non-text-content | 无障碍 | 呈现给用户的非文本内容要有起等价作用的文本替代；若该非文本内容是控件或接受输入，则要有一个描述其用途的名称。 | 部分 | `All non-text content that is presented to the user has a text alternative that serves the equivalent purpose, except for the situations listed below.` |
| WCAG 2.2 — 1.2.2 Captions (Prerecorded)（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#captions-prerecorded | 无障碍 | 同步媒体中的预录音频要提供字幕，除非该媒体本身就是文本的媒体替代且被清楚标注。 | 部分 | `Captions are provided for all prerecorded audio content in synchronized media, except when the media is a media alternative for text and is clearly labeled as such.` |
| WCAG 2.2 — 1.3.1 Info and Relationships（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#info-and-relationships | 无障碍 | 由呈现方式传达的信息、结构与关系，要能被程序化判定，或在文本中可得。 | 部分 | `Information, structure, and relationships conveyed through presentation can be programmatically determined or are available in text.` |
| WCAG 2.2 — 1.4.1 Use of Color（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#use-of-color | 无障碍 | 颜色不能作为传达信息、指示动作、提示响应或区分视觉元素的唯一视觉手段。 | 无 | `Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element.` |
| WCAG 2.2 — 1.4.3 Contrast (Minimum)（AA） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#contrast-minimum | 无障碍 | 文本与文本图像的对比度至少 4.5:1；大号文本与大号文本图像至少 3:1，非活动组件、纯装饰、不可见内容与 logo 文字不要求。 | 有 | `The visual presentation of text and images of text has a contrast ratio of at least 4.5:1`；`Large-scale text and images of large-scale text have a contrast ratio of at least 3:1` |
| WCAG 2.2 — 1.4.4 Resize Text（AA） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#resize-text | 无障碍 | 字幕与文本图像之外，文本要能在不借助辅助技术的情况下放大到 200% 而不丢失内容或功能。 | 部分 | `text can be resized without assistive technology up to 200 percent without loss of content or functionality.` |
| WCAG 2.2 — 1.4.11 Non-text Contrast（AA） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#non-text-contrast | 无障碍 | 用于识别界面组件与状态的视觉信息、以及理解内容所必需的图形部分，与相邻颜色的对比度至少 3:1，非活动组件与由用户代理决定外观的组件除外。 | 有 | `The visual presentation of the following have a contrast ratio of at least 3:1 against adjacent color(s)` |
| WCAG 2.2 — 2.1.1 Keyboard（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#keyboard | 无障碍 | 内容的全部功能都要能通过键盘接口操作，且不要求对单次击键设定特定时间；底层功能依赖移动路径而非仅端点的情况除外。 | 部分 | `All functionality of the content is operable through a keyboard interface without requiring specific timings for individual keystrokes` |
| WCAG 2.2 — 2.4.7 Focus Visible（AA） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#focus-visible | 无障碍 | 任何可用键盘操作的界面，都要存在一种操作模式使键盘焦点指示可见。 | 部分 | `Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible.` |
| WCAG 2.2 — 2.5.8 Target Size (Minimum)（AA） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#target-size-minimum | 无障碍 | 指针输入的触控目标至少 24×24 CSS 像素；例外为 Spacing、Equivalent、Inline、User Agent Control、Essential 五条，Spacing 例外的判定是以 24 CSS 像素直径圆套在每个欠尺寸目标外接框上互不相交。 | 有 | `The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:`；`Undersized targets (those less than 24 by 24 CSS pixels) are positioned so that if a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not intersect another target or the circle for another undersized target` |
| WCAG 2.2 — 4.1.2 Name, Role, Value（A） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/#name-role-value | 无障碍 | 所有界面组件（含表单元素、链接与脚本生成的组件）的名称与角色要能被程序化判定，用户可设置的状态、属性与值要能被程序化设置，这些项的变更要能通知到用户代理与辅助技术。 | 有 | `the name and role can be programmatically determined; states, properties, and values that can be set by the user can be programmatically set; and notification of changes to these items is available to user agents, including assistive technologies.` |
| APG — Accordion Pattern | W3C WAI APG，页面无发布日期 | https://www.w3.org/WAI/ARIA/apg/patterns/accordion/ | 无障碍 | 手风琴标题文本放在 role=heading 的元素内并给出 aria-level，控制件为 role=button，用 aria-expanded 表示展开或折叠，aria-controls 指向面板；不可折叠时置 aria-disabled=true，可选 role=region 配 aria-labelledby。键盘上 Enter 或 Space 切换展开状态，Tab 与 Shift+Tab 把焦点移出手风琴并回归页面 Tab 序列。 | 有 | 标题 `is contained in an element with role` heading 并带 aria-level；`aria-expanded` 取 true 或 false；Enter、Space 展开或折叠 |
| APG — Dialog (Modal) Pattern | W3C WAI APG，页面无发布日期 | https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ | 无障碍 | 对话框容器用 role=dialog 且 aria-modal=true，并以 aria-labelledby 指向可见标题或用 aria-label 命名；打开时焦点移入对话框内的元素，Tab 与 Shift+Tab 在内部首尾循环，Escape 关闭。aria-modal 只在应用代码阻止所有用户与外部内容交互、且视觉上遮挡外部内容时使用。 | 有 | `The element that serves as the dialog container has a role of dialog.`；`The dialog container element has aria-modal set to true.`；`Application code prevents all users from interacting in any way with content outside of it.` |
| APG — Tabs Pattern | W3C WAI APG，页面无发布日期 | https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ | 无障碍 | 标签元素在 role=tablist 内，每个 tab 用 aria-controls 指向对应 tabpanel，当前选中的 tab 置 aria-selected=true 其余为 false，tabpanel 用 aria-labelledby 指回 tab；tablist 有可见标签时用 aria-labelledby，否则用 aria-label，纵向时置 aria-orientation=vertical。键盘上 Tab 把焦点带进 tablist 的当前 tab，左右方向键在 tab 间移动，Space 或 Enter 在未自动激活时激活，Home 与 End 为可选。 | 有 | `Each element with role tab has the property aria-controls referring to its associated tabpanel element.`；`The active tab element has the state aria-selected set to true`；左方向键 `moves focus to the previous tab` |

判定方式：WCAG 的 1.4.3、1.4.11、2.5.8 与 4.1.2 能用对比度计算、尺寸测量、可访问性树断言三类脚本核对；APG 三个模式都能用 role、aria-* 属性与键盘行为脚本核对，属于可脚本判定。

判定方式：WCAG 的 1.1.1、1.2.2、1.3.1、1.4.4、2.1.1、2.4.7 只能部分脚本化，替代文本是否等价、字幕是否完整、焦点指示是否真可见需人工评审；1.4.1 原文以“唯一视觉手段”为前提，只能人工判断，属原则性遵守。

### product-design.md 第 4 节 附：未取得全文的项

WSJF 一页（https://framework.scaledagile.com/wsjf）仅取得摘要。可取得的部分是定义、Cost of Delay 的引语与成本延迟的四个组成部分；缺 Details 一节的评分推导、示例与排序做法，该节需登录 SAFe Studio 才能阅读。其余 14 个来源均取得全文，WCAG 2.2 的 11 条准则、APG 的 3 个模式页均已逐条读完全文。

## engineering.md

本文件按固定表头抄录十五项官方来源，覆盖前端组件与测试、性能指标、API 设计、安全核查、服务可靠性、数据库迁移与 Go 语言约定。采集时间 2026-11-27，原文摘录保留英文原句，未做改写；版本以页面标注或文档所属版本为准，页面未标版本的写“文档页未标版本号”。每条来源在表后给两行检查方式，分别写可以用的工具与可以跑的命令。整页读不到的条目标“未取得原文”，只读到部分的在文末“取得范围与缺口”里写明缺哪一段。

### engineering.md 第 1 节 前端

| 名称 | 版本 | 出处链接 | 侧（前端/后端/通用） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|
| React 测试建议（`act`） | v19.3（页面标注） | https://react.dev/reference/react/act | 前端 | 渲染组件与触发更新的代码要包在 `await act()` 里，让断言之前先应用挂起的 React 更新。测试环境必须设置 `global.IS_REACT_ACT_ENVIRONMENT=true`，并优先用 `await` 加 async 函数的形式。 | 部分 | “`act` is a test helper to apply pending React updates before making assertions.”<br>“Using `act` requires setting `global.IS_REACT_ACT_ENVIRONMENT=true` in your test environment.” |
| React 组件纯度 | 文档页未标版本号 | https://react.dev/learn/keeping-components-pure | 前端 | 组件必须是纯函数，相同输入返回相同 JSX，且只返回 JSX，不改动渲染前已存在的对象或变量。Strict Mode 用来找出组件里的错误。 | 部分 | “React assumes that every component you write is a pure function.”<br>“Components should only _return_ their JSX, and not _change_ any objects or variables that existed before rendering” |
| Testing Library 查询优先级 | 页面标注 Last updated 2024-03-19 | https://testing-library.com/docs/queries/about/ | 前端 | 查询按用户可感知程度排序，`getByRole`、`getByLabelText`、`getByText` 一类可访问查询优先，`getByAltText`、`getByTitle` 次之，`getByTestId` 只用于无法用角色或文本匹配的场景。 | 有 | “we recommend this order of priority: 1. Queries Accessible to Everyone”<br>“getByTestId: The user cannot see (or hear) these, so this is only recommended for cases where you can't match by role or text” |
| Playwright 官方最佳实践 | 文档站未标版本号 | https://playwright.dev/docs/best-practices | 前端 | 测试应验证终端用户可见的行为，不依赖用户看不到的实现细节，每个测试自带存储、数据与 cookie 并相互隔离。定位用带自动等待与重试能力的 locator，断言用 web-first 断言。 | 有 | “Automated tests should verify that the application code works for the end users, and avoid relying on implementation details”<br>“Each test should be completely isolated from another test” |
| Storybook 交互测试 | 10.6（页面标注） | https://storybook.js.org/docs/writing-tests/interaction-testing | 前端 | 交互测试写在 story 里，story 先把组件置入初始状态，再由 `play` 函数模拟点击、输入、提交并断言结果。这类测试可用 Vitest addon 在 Storybook、终端或 CI 中自动运行。 | 有 | “You then use a play function to simulate user behavior like clicks, typing, and submitting a form and then assert on the end result.”<br>“They can be automated using the Vitest addon” |
| TypeScript `strict` | 文档页未标版本号，随 TypeScript 发布更新 | https://www.typescriptlang.org/tsconfig/strict.html | 前端 | 打开 `strict` 等于启用全部 strict 家族检查，可在其下逐项关闭。后续 TypeScript 版本可能在该开关下加入更严检查，升级后可能出现新的类型错误。 | 有 | “The `strict` flag enables a wide range of type checking behavior that results in stronger guarantees of program correctness.”<br>“Future versions of TypeScript may introduce additional stricter checking under this flag” |
| Core Web Vitals（LCP、INP、CLS） | 页面 Last updated 2024-10-31；三项指标当前均为 Stable | https://web.dev/articles/vitals | 前端 | 三项核心指标按 75 分位统计：LCP 在页面开始加载后 2.5 秒内发生，INP 在 200 毫秒以内，CLS 保持 0.1 或更低。判定一个页面通过，要求三项指标在 75 分位同时达标。 | 有 | “LCP should occur within 2.5 seconds of when the page first starts loading.”<br>“a good threshold to measure is the 75th percentile of page loads, segmented across mobile and desktop devices.” |

#### 前端检查方式

React 测试建议（`act`）：
- 工具：Testing Library 的 `render`、`fireEvent`、`userEvent` 已把更新包在 `act` 内，React 在 act 环境变量未设置时会打印警告，jest 与 vitest 的 jsdom 环境承载这套断言。
- 命令：`npx jest --env=jsdom` 或 `npx vitest run --environment jsdom`，测试入口文件写 `global.IS_REACT_ACT_ENVIRONMENT = true`。

React 组件纯度：
- 工具：React 开发模式下的 `<StrictMode>` 会重复调用渲染函数以暴露副作用，ESLint 侧可加 `eslint-plugin-react-hooks` 检查 Hook 与渲染副作用。
- 命令：`npm run dev` 后在 Strict Mode 下逐页看控制台告警，`npx eslint src --ext .tsx` 跑 Hook 规则；纯度本身没有单条命令能判定。

Testing Library 查询优先级：
- 工具：`eslint-plugin-testing-library` 的 `prefer-screen-queries`、`no-node-access`、`no-container` 规则检查查询写法，优先级顺序本身要按文档逐条人工核对。
- 命令：`npx eslint tests --ext .tsx`，规则清单写进 `.eslintrc` 的 `overrides`。

Playwright 最佳实践：
- 工具：`@playwright/test` 的自动等待与重试、web-first 断言、trace viewer，`eslint-plugin-playwright` 检查手写等待与实现细节定位。
- 命令：`npx playwright test --trace on`，失败后用 `npx playwright show-trace test-results/<用例>/trace.zip` 查看。

Storybook 交互测试：
- 工具：Storybook 的 `play` 函数与 Interaction 面板，`@storybook/addon-vitest`（页面称 Vitest addon）在终端与 CI 里批量运行。
- 命令：本地 `npx storybook dev` 在面板单跑某条交互测试；CI 用 `npx vitest run` 跑接入了该 addon 的工程。

TypeScript `strict`：
- 工具：`tsc` 编译器，`tsconfig.json` 的 `strict` 开关与 `strictNullChecks` 等分项。
- 命令：`npx tsc --noEmit --strict`，或设置 `"strict": true` 后跑 `npx tsc --noEmit`。

Core Web Vitals：
- 工具：Chrome 的 Lighthouse 与 Lighthouse CI 断言、PageSpeed Insights 的字段数据、`web-vitals` 库的 `onLCP`、`onINP`、`onCLS`。
- 命令：`npx lighthouse https://example.com --only-categories=performance` 取实验室数据，字段数据按 75 分位查 PageSpeed Insights 或 CrUX。

### engineering.md 第 2 节 后端

| 名称 | 版本 | 出处链接 | 侧（前端/后端/通用） | 核心要求（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|
| Google API 设计指南（AIP-130 标准方法） | AIP-130，State Approved，2023-03-13 | https://google.aip.dev/130 | 后端 | 设计方法时按标准方法、标准批量或聚合方法、自定义方法、流式方法的顺序选择。标准方法挂在集合或资源上，自定义方法用于标准方法覆盖不到的操作。 | 部分 | “API authors should choose from the defined categories in the following order: 1. Standard methods (on collections and resources)”<br>“2. Standard batch or aggregate methods 3. Custom methods (on collections, resources, or stateless) 4. Streaming methods” |
| OpenAPI Specification | 3.1.0（2021-02-15） | https://spec.openapis.org/oas/v3.1.0.html | 后端 | 文档必须至少包含 `paths`、`components`、`webhooks` 三者之一，`openapi` 与 `info` 必填，`info` 内的 `title` 与 `version` 也必填。数据类型基于 JSON Schema 2020-12，字段名区分大小写，根文件推荐命名为 `openapi.json` 或 `openapi.yaml`。 | 有 | “The OpenAPI document MUST contain at least one paths field, a components field or a webhooks field.”<br>“Data types in the OAS are based on the types supported by the JSON Schema Specification Draft 2020-12.” |
| OWASP ASVS 5.0（V1、V2、V3 三章） | 5.0 | https://github.com/OWASP/ASVS/blob/master/5.0/en/0x10-V1-Encoding-and-Sanitization.md<br>https://github.com/OWASP/ASVS/blob/master/5.0/en/0x11-V2-Validation-and-Business-Logic.md<br>https://github.com/OWASP/ASVS/blob/master/5.0/en/0x12-V3-Web-Frontend-Security.md | 后端 | 以编号条目核查编码与净化、输入校验与业务逻辑、Web 前端安全三章，条目按 L1、L2、L3 分级。条目编号清单见下节。 | 部分 | “1.2.4 Verify that data selection or database queries (e.g., SQL, HQL, NoSQL, Cypher) use parameterized queries, ORMs, entity frameworks, or are otherwise protected from SQL Injection and other database injection attacks.”<br>“3.4.3 As a minimum, a global policy must be used which includes the directives object-src 'none' and base-uri 'none'” |
| Twelve-Factor App | 页面 Last updated 2017 | https://12factor.net/ | 后端 | 十二条要素分别约束代码库、依赖、配置、后端服务、构建发布运行、进程、端口绑定、并发、可处置性、环境一致性、日志与管理进程。配置存环境变量，构建、发布、运行严格分离，应用以一个或多个无状态进程运行。 | 部分 | “Store config in the environment”<br>“Execute the app as one or more stateless processes” |
| Google SRE：SLI、SLO 与错误预算 | 在线版第 4 章，未标版本 | https://sre.google/sre-book/service-level-objectives/ | 后端 | SLI 是对服务水平某个方面的定量度量，SLO 是被 SLI 测量的目标值或取值区间，自然写法是 SLI ≤ target 或区间上下界。可用错误预算按允许未达标速率来管理，并按日或周跟踪。 | 部分 | “An SLO is a service level objective: a target value or range of values for a service level that is measured by an SLI.”<br>“SLI ≤ target, or lower bound ≤ SLI ≤ upper bound” |
| PostgreSQL 迁移约定（Django 文档） | Django 6.1 文档 | https://docs.djangoproject.com/en/6.1/topics/migrations/ | 后端 | 迁移是数据库 schema 的版本控制，同一批迁移在开发机、预发与生产上重复执行，迁移文件与对应模型改动作为一次提交入库。PostgreSQL 支持 DDL 事务，迁移操作默认在单个事务内执行。 | 有 | “You should think of migrations as a version control system for your database schema.”<br>“On databases that support DDL transactions (SQLite and PostgreSQL), all migration operations will run inside a single transaction by default.” |
| Go `testing` 包 | go1.27.4（页面标注，Published 2026-11-10） | https://pkg.go.dev/testing | 后端 | 测试函数写成 `func TestXxx(*testing.T)` 并放在以 `_test.go` 结尾的文件里，用 `T.Error`、`T.Fail` 等报告失败。`T.Run` 定义子测试，`func FuzzXxx(*testing.F)` 为模糊测试，基准测试用 `b.Loop()`。 | 有 | “automates execution of any function of the form `func TestXxx(*testing.T)`”<br>“The T.Run and B.Run methods allow defining subtests and sub-benchmarks” |
| Effective Go | 2009 年发布版，页面注明 not actively updated | https://go.dev/doc/effective_go | 后端 | 格式由 `gofmt` 统一，不靠手工排版；错误返回值必须检查并向上传递，不能丢弃。控制结构的左花括号不能另起一行写。 | 有 | “Always check error returns; they're provided for a reason.”<br>“you cannot put the opening brace of a control structure (`if`, `for`, `switch`, or `select`) on the next line.” |

#### ASVS 5.0 前三个章节的条目编号

V1 Encoding and Sanitization 的子章与条目：
- V1.1 Encoding and Sanitization Architecture：1.1.1、1.1.2（L2）。
- V1.2 Injection Prevention：1.2.1 至 1.2.5（L1），1.2.6 至 1.2.9（L2），1.2.10（L3）。
- V1.3 Sanitization：1.3.1、1.3.2（L1），1.3.3 至 1.3.11（L2），1.3.12（L3）。
- V1.4 Memory, String, and Unmanaged Code：1.4.1 至 1.4.3（L2）。
- V1.5 Safe Deserialization：1.5.1（L1），1.5.2（L2），1.5.3（L3）。

V2 Validation and Business Logic 的子章与条目：
- V2.1 Validation and Business Logic Documentation：2.1.1（L1），2.1.2、2.1.3（L2）。
- V2.2 Input Validation：2.2.1、2.2.2（L1），2.2.3（L2）。
- V2.3 Business Logic Security：2.3.1（L1），2.3.2 至 2.3.4（L2），2.3.5（L3）。
- V2.4 Anti-automation：2.4.1（L2），2.4.2（L3）。

V3 Web Frontend Security 的子章与条目：
- V3.1 Web Frontend Security Documentation：3.1.1（L3）。
- V3.2 Unintended Content Interpretation：3.2.1、3.2.2（L1），3.2.3（L3）。
- V3.3 Cookie Setup：3.3.1（L1），3.3.2 至 3.3.4（L2），3.3.5（L3）。
- V3.4 Browser Security Mechanism Headers：3.4.1、3.4.2（L1），3.4.3 至 3.4.6（L2），3.4.7、3.4.8（L3）。
- V3.5 Browser Origin Separation：3.5.1 至 3.5.3（L1），3.5.4、3.5.5（L2），3.5.6 至 3.5.8（L3）。
- V3.6 External Resource Integrity：3.6.1（L3）。
- V3.7 Other Browser Security Considerations：3.7.1、3.7.2（L2），3.7.3 至 3.7.5（L3）。

#### 后端检查方式

Google API 设计指南（AIP-130）：
- 工具：Google 的 `api-linter` 按 AIP 规则集检查 proto 定义，标准方法与自定义方法的取舍要人工对照 AIP-130 的顺序。
- 命令：`api-linter api/v1/*.proto`，标准方法相关规则集加 `--config` 指定。

OpenAPI Specification：
- 工具：`@redocly/cli` 的 `lint`、`spectral` 规则集、Python 的 `openapi-spec-validator`，都按 3.1 的 schema 校验文档结构。
- 命令：`npx @redocly/cli lint openapi.yaml` 或 `spectral lint openapi.yaml`。

OWASP ASVS 5.0：
- 工具：Semgrep 与 CodeQL 的注入类规则可覆盖 1.2 章的部分条目，HTTP 响应头用 curl、ZAP 被动扫描或安全头检测服务核对 V3.4；分级与业务逻辑条目需人工评审。
- 命令：`semgrep --config p/owasp-top-ten .`，响应头用 `curl -sI https://host/ | grep -iE 'strict-transport-security|content-security-policy|x-content-type-options'`。

Twelve-Factor App：
- 工具：代码检索查配置是否硬编码、容器镜像与进程管理方式查进程模型、日志输出到 stdout 由采集端接管，没有覆盖十二项的统一工具。
- 命令：`rg -n "Getenv|process\.env|System.getenv" src`，再 `rg -n "log\.(Fatal|Panic)|new FileLogger" src` 查日志是否写本地文件。

Google SRE：SLI、SLO 与错误预算：
- 工具：Prometheus 记录规则与告警规则、`pint` 规则检查器、Grafana 的 SLO 面板；SLO 取值与错误预算口径要人工评审。
- 命令：`pint lint rules.yml` 校验记录与告警规则，`promtool check rules rules.yml` 做语法检查。

PostgreSQL 迁移约定：
- 工具：Django 的 `makemigrations --check`、`migrate --plan`、`sqlmigrate`、`showmigrations`，迁移文件与模型改动在同一次提交里比对。
- 命令：`python manage.py makemigrations --check --dry-run && python manage.py migrate --plan`。

Go `testing` 包：
- 工具：`go test`，覆盖率用 `-cover`，模糊测试用 `-fuzz`，子测试用 `-run` 过滤。
- 命令：`go test ./... -count=1`，覆盖率 `go test ./... -coverprofile=cover.out`。

Effective Go：
- 工具：`gofmt`、`go vet`、`staticcheck`，三者分别查格式、可疑构造与静态问题。
- 命令：`gofmt -l . && go vet ./...`，再加 `staticcheck ./...`。

### engineering.md 第 3 节 取得范围与缺口

十五项来源都取到了页面正文，没有整页缺失的条目。OpenAPI 规范读到 4.8.16 Responses Object 与 Response Object，Schema Object 之后的对象章节未读，这部分的要点未抄录。React 官方没有独立的组件测试文档页，`/learn/testing` 与 `/reference/testing` 均返回 404，测试建议取自 `act` 页面，组件约定取自 keeping-components-pure 页面。Playwright 与 Storybook 各读了一页官方指南，两个项目文档站的其他页面未读。ASVS 只按用户要求抄录 V1、V2、V3 三章，其余章节未读。

## testing.md

本文件按固定表头抄录 14 个测试相关来源，原文摘录保留英文原句，未做改写。14 个来源中 13 个取得所引页面全文并通读；IEEE 1044-2009 标准正文未取得，只取得 IEEE SA 官方摘要，缺标准正文的属性表与严重度分级定义，表中按“仅取得摘要”标注。ISTQB 的 severity 定义取自 imbus 对 ISTQB Glossary v3.4 的公开转载，ISTQB 官方 glossary 页面只返回脚本壳，未取得可直接引用的正文。

| 名称 | 来源 | 版本或年份 | 出处链接 | 解决的问题 | 核心做法（两句内） | 可执行判据（有/部分/无） | 原文摘录（两行内） |
|---|---|---|---|---|---|---|---|
| 测试金字塔（Test Pyramid） | Martin Fowler（martinfowler.com） | 2012-05-01（页面修订 2017-11-15） | https://martinfowler.com/bliki/TestPyramid.html | 自动化测试组合如何在单元测试与端到端测试之间分配，避免高层测试过多。 | 按金字塔分配测试：低层放大量 UnitTests，高层只放少量 BroadStackTests，中间层用 SubcutaneousTests 覆盖服务/API。高层测试失败时，先用单元测试复现缺陷。 | 部分：只给“多/少”方向，无数字比例或门限 | “you should have many more low-level UnitTests than high level BroadStackTests running through a GUI” |
| 测试替身（Test Double） | Martin Fowler（martinfowler.com） | 2006-01-17 | https://martinfowler.com/bliki/TestDouble.html | 测试中需要替换真实生产对象时，如何区分不同替身及其行为。 | 按 Dummy、Fake、Stub、Spy、Mock 五类区分替身，替换生产对象以进行测试。Fake 有可工作的实现但走捷径，不适合用于生产。 | 无：只给分类与语义，无通过/失败门限 | “Test Double is a generic term for any case where you replace a production object for testing purposes.” |
| 测试尺寸（Small / Medium / Large） | Google Testing Blog | 2010-12-13（更新 2024-06-03） | https://testing.googleblog.com/2010/12/test-sizes.html | 如何按资源访问与运行时间给测试分档，控制测试套件的速度与稳定性。 | 按网络、数据库、文件系统、外部系统、多线程、sleep、系统属性与运行时限把测试分为 Small、Medium、Large 三档。Small 限 60 秒、Medium 限 300 秒、Large 为 900+ 秒，并用注解或 security manager 分套件。 | 有：环境限制与 60/300/900+ 秒时限可机器检查 | “We call them “Small”, “Medium” and “Large” tests.” |
| 测试组合比例（70/20/10） | Google Testing Blog | 2015-04-22（更新 2024-06-03） | https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html | 以端到端测试为主的策略反馈慢、定位难、易 flaky，如何调整测试组合。 | 按 70% 单元、20% 集成、10% 端到端组织测试组合，集成测试取一小群单元验证协同。避免倒金字塔/冰淇淋筒与沙漏两种反模式。 | 部分：70/20/10 是建议值，原文说 exact mix 因团队而异 | “Google often suggests a 70/20/10 split: 70% unit tests, 20% integration tests, and 10% end-to-end tests.” |
| flaky 测试与测试尺寸 | Google Testing Blog | 2017-04-17 | https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html | flaky 测试的来源，以及测试尺寸与 flaky 率的关系；Google 约 420 万测试中一周约 6.3 万有 flaky run（<2%），大型测试 flaky 率 14%。 | 按 Small/Medium/Large 与 binary size、RAM、依赖库数量等变量统计 flaky run，比较测试尺寸和工具的影响。测试越大越容易 flaky，binary size 与 RAM 比工具更能解释差异。 | 部分：给出 flaky 率与相关性，无验收阈值 | “Overwhelmingly, the larger the test (as measured by binary size, RAM use, or number of libraries built), the more likely it is to be flaky.” |
| 契约测试（Pact） | Pact 官方文档 | Introduction 2026-08-25；can-i-deploy 2022-10-05 | https://docs.pact.io/；https://docs.pact.io/pact_broker/can_i_deploy | 消费者与提供者独立部署时，如何确认双方对接口消息的理解一致，并在部署前判断兼容性。 | 消费者测试执行时生成 contract，每个 contract 是具体 request/response 示例；提供者按 contract 回放验证。Pact Broker 用 matrix 记录版本与验证结果，部署前用 can-i-deploy 判定。 | 有：can-i-deploy 退出码 0=可部署，1=不可 | “Contract tests assert that inter-application messages conform to a shared understanding that is documented in a contract.” |
| 性质测试（Hypothesis） | Hypothesis 官方文档 | 6.170.17 | https://hypothesis.readthedocs.io/en/latest/ | 示例测试难以覆盖大输入空间与边界组合，如何用性质与随机生成发现反例。 | 写对所有输入都应成立的性质，Hypothesis 默认生成 100 个随机输入并在异常时失败。失败后自动缩小到最小反例，并报告该反例。 | 有：任一生成输入抛异常即失败；默认 max_examples=100 | “you write tests which should pass for all inputs in whatever range you describe” |
| 变异测试（Stryker Mutator） | Stryker Mutator 官方文档 | 页面未标版本（访问 2026-11-27） | https://stryker-mutator.io/docs/；https://stryker-mutator.io/docs/stryker-js/configuration/ | 代码覆盖率不能说明测试能否发现缺陷，如何衡量测试有效性。 | 向生产代码自动注入变异体并跑单元测试，测试失败即 mutant killed，通过即 survived。以 mutation score 衡量测试有效性，`thresholds.break` 设构建失败线。 | 有：mutation score 低于 break 时退出码 1（默认 break=null 不失败） | “If your tests fail then the mutant is killed. If your tests passed, the mutant survived.” |
| 风险驱动测试（Risk-based testing） | ISTQB / ASTQB | CTFL v4.0（2023-04-21） | https://astqb.org/5-2-risk-management/ | 测试资源有限时，如何选择、排序和管理测试活动。 | 用 risk likelihood 与 risk impact 评定 risk level，按风险分析选择、排序和管理测试活动。风险控制包括 mitigation 与 monitoring。 | 部分：给出风险因子与流程，无统一数值门限 | “test activities are selected, prioritized, and managed based on risk analysis and risk control” |
| 端到端测试实践（Playwright） | Playwright 官方文档 | 页面未标版本（访问 2026-11-27） | https://playwright.dev/docs/best-practices；https://playwright.dev/docs/test-retries；https://playwright.dev/docs/actionability | 端到端测试如何减少 flaky、如何处理元素未就绪与间歇失败。 | 测试用户可见行为并保持用例隔离；定位器与断言使用 auto-wait/retry-ability，不用未 await 的手写断言。失败重试默认关闭，启用后把结果分为 passed/flaky/failed。 | 有：actionability 失败抛 TimeoutError；retries 可配置；flaky 有分类 | “Playwright performs a range of actionability checks on the elements before making actions to ensure these actions behave as expected.” |
| 可访问性规则集（axe-core） | Deque axe-core | 4.14.1（develop，2026-11-27） | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md | 页面交付前如何按 WCAG 等级与影响级别检查可访问性问题。 | 规则表按 WCAG 2.0/2.1/2.2 A/AA、Best Practices、AAA、Experimental、Deprecated 分组。每条规则给 Rule ID、Impact、Tags、Issue Type，Issue Type 取 failure 或 needs review。 | 有：规则表给 Impact 与 Issue Type（failure / needs review） | “These rules are disabled by default, until WCAG 2.2 is more widely adopted and required.” |
| 负载测试类型与阈值（k6） | Grafana k6 官方文档 | 文档站 latest（v2.4.x，2026-11-27 抓取） | https://grafana.com/docs/k6/latest/testing-guides/test-types/；https://grafana.com/docs/k6/latest/using-k6/thresholds/ | 如何用不同负载形态覆盖风险，并给出性能通过/失败结论。 | 用 Smoke、Average-load、Stress、Soak、Spike、Breakpoint 六类负载测试覆盖不同风险，从 smoke 开始。用 thresholds 对指标设 pass/fail 条件，失败使 k6 非零退出。 | 有：thresholds 失败即 failed status 与非零退出 | “Thresholds are the pass/fail criteria that you define for your test metrics.” |
| 缺陷分类（IEEE 1044-2009） | IEEE | IEEE 1044-2009（仅官方摘要；2010-01-07 发布，2020-03-05 状态 Inactive-Reserved） | https://standards.ieee.org/ieee/1044/4607/ | 如何对软件异常做统一分类，以支持缺陷因果分析、项目管理与过程改进。 | 提供跨项目、产品、系统生命周期的统一异常分类方法。分类数据用于缺陷因果分析、项目管理和过程改进。 | 无：仅摘要，未见属性表与严重度分级判据 | “This standard provides a uniform approach to the classification of software anomalies, regardless of when they originate or when they are encountered within the project, product, or system lifecycle.” |
| 缺陷严重度（Severity） | ISTQB Glossary（imbus 公开转载） | ISTQB Glossary v3.4（2020-09-14） | https://www.imbus.de/en/glossar/term/severity | 缺陷严重度如何定义，以便在缺陷记录与分级中使用统一口径。 | 把 severity 定义为缺陷对组件或系统开发或运行的影响程度。该定义只给严重度含义，不给 Critical/Major/Minor 等级表。 | 无：只给定义，无分级表或门限 | “The degree of impact that a defect has on the development or operation of a component or system.” |

### testing.md 第 1 节 测试金字塔

- 必须做：当测试组合以高层端到端为主、单元测试不足时，必须按金字塔把大部分测试下移到单元层。
- 自动检查：原文未指定工具，也未给各层比例阈值。

### testing.md 第 2 节 测试替身

- 必须做：当测试需要替换生产对象时，必须明确用的是 Dummy、Fake、Stub、Spy、Mock 中的哪一类；Fake 只用于测试，不适合用于生产。
- 自动检查：原文未指定工具；替身由测试代码实现，原文未点名具体库。

### testing.md 第 3 节 测试尺寸

- 必须做：当测试要进入提交前或持续集成的快速套件时，必须把测试限制在 Small 的环境与 60 秒内；需要数据库、文件系统或外部系统时，归入 Medium/Large 并分套件。
- 自动检查：原文提到 Java 可用 security manager 与 annotation 按尺寸分套件并限制活动；未给通用工具名。

### testing.md 第 4 节 测试组合比例

- 必须做：当团队要避免倒金字塔/冰淇淋筒或沙漏、建立可维护的测试组合时，必须把大部分测试放在单元层，并以 70/20/10 校准初始比例。
- 自动检查：原文未指定工具；比例需要测试统计，原文说 exact mix 因团队而异，未给门限。

### testing.md 第 5 节 flaky 测试与测试尺寸

- 必须做：当大型测试的 flaky 率明显高于小型测试时，必须先缩小测试范围、减少依赖，再决定是否保留大型测试。
- 自动检查：原文使用 Google 内部测试分析统计 flaky run；未指定公开工具。

### testing.md 第 6 节 契约测试

- 必须做：当消费者与提供者由不同团队独立部署、接口契约可能漂移时，必须在部署前做契约验证，并用 can-i-deploy 判定。
- 自动检查：Pact Broker 的 `can-i-deploy`，退出码 0 表示可部署，1 表示不可；部署后可用 `record-deployment` 记录。

### testing.md 第 7 节 性质测试

- 必须做：当输入空间大、边界组合多、示例测试无法穷举时，必须用性质测试覆盖输入范围，并保留失败反例。
- 自动检查：Hypothesis 自带随机生成、缩小与失败样例库；默认 `max_examples=100`，可用 `@example` 加显式样例。

### testing.md 第 8 节 变异测试

- 必须做：当需要判断测试能否发现缺陷、而不仅是覆盖代码时，必须做变异测试并设置 mutation score 门槛。
- 自动检查：Stryker 的 `thresholds.break`；mutation score 低于 break 时退出码 1，默认 `break=null` 不使构建失败。

### testing.md 第 9 节 风险驱动测试

- 必须做：当测试资源有限、需要按风险排序测试活动时，必须做风险分析，用 likelihood 与 impact 评 risk level，并据此选择、排序、管理测试。
- 自动检查：原文未指定自动检查工具。

### testing.md 第 10 节 端到端测试实践

- 必须做：当端到端测试出现间歇失败、元素未就绪或动画未稳定时，必须使用 actionability 自动等待与可重试断言，不用未 await 的手写断言。
- 自动检查：Playwright 自带 actionability 检查、web-first assertions 与 `retries` 配置；失败重试默认关闭。

### testing.md 第 11 节 可访问性规则集

- 必须做：当页面需要按 WCAG 2.0/2.1/2.2 A/AA 做自动化可访问性检查时，必须跑 axe 规则集；WCAG 2.2 规则默认关闭。
- 自动检查：axe-core 规则引擎；规则表给 Rule ID、Impact、Tags、Issue Type（failure / needs review）。

### testing.md 第 12 节 负载测试类型与阈值

- 必须做：当系统上线前需要给出性能通过/失败结论时，必须定义 thresholds，并按风险选择负载类型；原文建议从 smoke 开始。
- 自动检查：k6 的 `thresholds`；失败时 k6 以 failed status 结束并返回非零退出码，`checks` 不影响退出状态。

### testing.md 第 13 节 缺陷分类

- 必须做：当项目需要跨生命周期统一记录、分类和比较软件异常，以支持缺陷因果分析与过程改进时，必须采用统一分类与属性集。
- 自动检查：原文摘要未指定工具；标准正文未取得，无法核对属性表与严重度分级的自动检查方式。

### testing.md 第 14 节 缺陷严重度

- 必须做：当缺陷记录需要标注严重程度时，必须按这条定义说明缺陷对开发或运行的影响。
- 自动检查：原文未指定工具；原文只给定义，未给分级表，无法据原文自动判定等级。

## skills.md

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

### skills.md 第 1 节 Claude Code Skills 文档

- 组织方式：一个技能就是一个目录，目录名即技能名，里面放一个 `SKILL.md`；frontmatter 只有 `name` 与 `description` 是必需的，其余字段（`allowed-tools`、`context`、`agent`、`background`、`disable-model-invocation`、`user-invocable`）按需加。
- 调用方式：会话启动时把每个技能的 name 与 description 放进上下文，模型按 description 判断是否调用；用户也可以用 `/skill-name` 直接调用。插件里的技能用 `plugin-name:skill-name` 命名，避免与本地同名技能冲突。
- 强制检查与脚本：正文里可以用 `` !`命令` `` 做动态上下文注入，命令在技能发送给模型之前执行，输出替换掉那一段；这会实际跑命令，不是示意。
- 失败处理：注入的命令返回非零退出（搜索类与比较类命令的 exit 1 除外）或权限检查不通过，整次技能调用中止，报 `Shell command failed for pattern "..."`，不会带着半截上下文继续。
- 读取范围：`code.claude.com/docs/en/skills.md` 正文前约 50KB（页面被截断），frontmatter 字段表、位置与加载、参数、动态上下文、fork 子代理、内置技能与评估各节已读。

### skills.md 第 2 节 Agent Skills 规范

- 组织方式：规定目录形状为 `skill-name/{SKILL.md, scripts/, references/, assets/}`，`SKILL.md` 是入口，其余三类目录按需放可执行脚本、参考文档与素材。
- 调用方式：不规定运行时，只规定包格式；渐进披露要求元数据先加载、正文按相关性加载、脚本与引用再按需读取，这样安装很多技能也不会一次占满上下文。
- 强制检查与脚本：没有可执行判据，只有字段校验规则（name 的长度与字符集、必须与父目录同名、description 的长度上限、metadata 必须是字符串键值映射），验证方式是逐字段对照规范页。
- 失败处理：规范本文不给运行时失败语义，校验不通过属于打包阶段的问题。
- 读取范围：`agentskills.io/specification` 正文，目录结构、frontmatter 字段表与校验节已读；页面部分截断。

### skills.md 第 3 节 Anthropic Skill authoring best practices

- 组织方式：主张技能正文控制在 500 行以内，长内容拆到一层深的引用文件；超过 100 行的引用文件要在顶部放目录；复杂流程给可复制的 checklist。
- 调用方式：description 决定加载，要求第三人称、写清做什么与何时用，技能名用动名词；正文写给模型看，不写给终端用户看。
- 强制检查与脚本：给三组 checklist（核心质量 10 条、代码与脚本 8 条、测试 4 条）与一套评估 JSON 结构（`skills`、`query`、`files`、`expected_behavior`），但文档明说当时没有内置运行器，判据靠人跑或自建脚本。
- 失败处理：脚本要自己处理错误并在缺文件时建默认值，不把异常丢回模型；高风险批量操作用 plan-validate-execute，中间产物先校验再执行。
- 读取范围：`platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices.md` 全文；原 `docs.claude.com` 地址 302 到该域。

### skills.md 第 4 节 Claude Code Subagents 文档

- 组织方式：子代理是一个 Markdown 文件加 YAML frontmatter，正文直接成为该子代理的 system prompt；`name` 与 `description` 必填，其余字段控制工具、模型、权限模式、预加载技能与隔离方式。
- 调用方式：主代理按 description 自动委派，也可以显式点名；目录优先级为企业 managed、CLI `--agents`、项目 `.claude/agents/`、用户 `~/.claude/agents/`、插件 `agents/`。
- 强制检查与脚本：`hooks`、`permissionMode`、`maxTurns` 可以约束子代理行为，但插件来源的子代理不支持 hooks、mcpServers 与 permissionMode；文档没有给验收脚本。
- 失败处理：前台调用遇 API 错误会返回部分输出并标注截断，后台任务标 failed 并保留最后输出；报告要经过输出扫描，可用 SendMessage 恢复会话继续。
- 读取范围：`code.claude.com/docs/en/sub-agents.md` 正文前约 50KB（截断），字段表、位置与优先级、内置代理、上下文与失败处理各节已读。

### skills.md 第 5 节 Claude Code Plugins overview

- 组织方式：插件是一个目录，`.claude-plugin/plugin.json` 给名字与元数据，`skills/`、`agents/`、`hooks/hooks.json`、`.mcp.json` 分别提供技能、子代理、钩子与 MCP 服务。
- 调用方式：从 marketplace 安装后整包加载；技能以 `/plugin-name:skill-name` 调用；每个可被自动调用的技能与代理，其 name 与 description 每轮都在上下文里，正文只在用到时加载。
- 强制检查与脚本：安装前可在 `/plugin` 里看 Context cost 估算，装完可用 measure 页读实际占用；开发期用 `--plugin-dir` 直接从文件夹加载；插件技能可用 `claude plugin eval` 测。
- 失败处理：插件带来的 MCP 服务会随会话一起跑，钩子在事件上触发，权限按当前用户身份执行；文档把安全审查单列一页，要求装前先看。
- 读取范围：`code.claude.com/docs/en/plugins/overview.md` 全文（请求 `plugins.md` 被重定向到 `plugins/overview.md`）。

### skills.md 第 6 节 OpenAI Agents SDK：Tools

- 组织方式：工具分托管、本地、函数、代理即工具四类，函数工具的 schema 从签名与 docstring 自动生成；工具多时用 `tool_namespace` 分组并配一个 `ToolSearchTool` 做延迟加载。
- 调用方式：工具随 Agent 声明，由 `tool_use_behavior`、`tool_choice` 与 tool search 决定何时调用；Programmatic Tool Calling 让模型生成 JavaScript 在托管 V8 里组合工具输出。
- 强制检查与脚本：函数工具有参数校验、超时与错误处理；guardrail 可在输入输出两侧拦截；托管 V8 里只能调用显式允许的工具。
- 失败处理：工具搜索在 client 执行模式下，标准 Runner 遇到 `tool_search_call` 直接抛错；命名 `tool_choice` 不能指向裸命名空间。
- 读取范围：`openai-agents-python/tools/` 全文，正文在 Programmatic Tool Calling 代码块处截断，之后的小节未读。

### skills.md 第 7 节 OpenAI Agents SDK：Agents 与 instructions

- 组织方式：`Agent` 由 `instructions`、`tools`、`handoffs`、`guardrails`、`output_type`、`model_settings`、`prompt` 组成；`instructions` 可以是固定字符串，也可以是每次调用重算的回调。
- 调用方式：由 `Runner` 运行；`prompt` 引用平台模板并传 `variables`；多代理分 Manager（agents as tools）与 Handoffs 两种编排。
- 强制检查与脚本：`output_type` 触发结构化输出校验，guardrail 能在输入输出两侧拦截；文档没有给验收脚本，只能自建评测，`reset_tool_choice` 默认 True 用于防工具循环。
- 失败处理：`tool_use_behavior` 决定工具跑完后是回模型还是停；guardrail 失败按配置中断或重试。
- 读取范围：`openai-agents-python/agents/` 全文，正文在 multi-agent 示例代码处截断，Dynamic instructions 之后的小节未读全。

### skills.md 第 8 节 DeepSeek Harness：dsh-doc 技能与 agent-preset

- 组织方式：一个 41 行的 `SKILL.md` 当入口，列出 16 个 `references/` 与 2 套 `templates/`；单文件与每个引用都控制在 8192 字符以内，超过会被标准预设的工具结果裁剪器剪掉。
- 调用方式：agent-preset 用 Cordis YAML 声明子插件，`skills/` 目录通过 `skill-filesystem` 挂载；技能按 description 触发；声明里 `id` 必填且不能重复。
- 强制检查与脚本：正文规定找事实的顺序为运行时检查（`cordis_inspect_list`、`cordis_inspect_query`）、安装包内文档与源码、两者都不可得才说未验证；装载技能本身不等于获得改动授权。
- 失败处理：Desktop 安装包里 `app.asar` 不能被 ls、glob 或搜索工具读取，只有文件读取工具能打开单个文件，模板要先复制到工作区再用。
- 读取范围：安装包内 `@deepseek-ai/dsh` 的 `package.json`、`dsh-agent-preset/README.md`、`skills/dsh-doc/SKILL.md`；官方 docs 目录（skills.md、plugins.md、.vitepress/config.mts）读取均返回 not found。

### skills.md 第 9 节 obra/superpowers

- 组织方式：15 个技能各自一个目录，`SKILL.md` 只放触发条件与流程，细节放同目录支持文件；正文统一含铁律、阶段步骤、Rationalizations 对照表、Red Flags 与完成前 Checklist。
- 调用方式：按 description 自动触发，或用 `superpowers:<skill>` 显式调用；技能之间用 “REQUIRED SUB-SKILL” 声明下一步，构成从构思到收尾的固定链路。
- 强制检查与脚本：TDD 要求先看到测试失败再写实现，调试要求先定位根因再改，收尾要求先跑全套测试；这些是写在正文里的硬性步骤，没有可执行脚本代劳。
- 失败处理：每份技能都给 Rationalizations 表与 Red Flags 清单，把“这次情况特殊”的常见借口逐条驳回；测试红、修复三次不成、菜单被跳过都要求停下回到上一步。
- 读取范围：README、repo API 元数据，以及 test-driven-development、writing-skills、brainstorming、writing-plans、requesting-code-review、systematic-debugging、finishing-a-development-branch 七份 `SKILL.md` 全文。

### skills.md 第 10 节 anthropics/skills

- 组织方式：19 个自包含技能目录，除 `SKILL.md` 外按需带 `scripts/`、`references/`、`assets/`、`evals/`；仓库另带 `spec` 与 `template` 两份可复用材料。
- 调用方式：作为 Claude Code 插件市场安装（`document-skills`、`example-skills` 两个插件），再按 description 触发；也可复制目录单独使用。
- 强制检查与脚本：`skill-creator` 带评测脚本（`python -m scripts.aggregate_benchmark` 汇总、`python -m scripts.run_loop` 按测试集调 description）与 grader、comparator、analyzer 三个子代理模板，产出 `benchmark.json` 与 `pass_rate`；`webapp-testing` 带 `with_server.py` 管服务器生命周期。
- 失败处理：评测流程要求同一轮里 with-skill 与 baseline 各跑一次并记录耗时与 token，断言写进 grading 结果（字段必须是 text、passed、evidence），失败项回写到技能正文再迭代；`with_server.py` 起不来时按脚本的 `--help` 与错误输出排查。
- 读取范围：README 全文、`skills/` 目录清单（19 项）与提交号 `e4bb5d9`；`skill-creator`、`webapp-testing` 正文按摘要记录，未逐字通读全部脚本。

### skills.md 第 11 节 ComposioHQ/awesome-claude-skills

- 组织方式：以索引为主，按十余个分类列出条目，绝大多数条目直接链接到 obra/superpowers 或 anthropics/skills 的原目录；仓库自带的完整技能只有 `changelog-generator` 一个。
- 调用方式：读者按分类找到目标技能，再跳到上游仓库安装；changelog-generator 由自然语言触发，正文给 6 步流程与输出示例。
- 强制检查与脚本：索引本身没有判据；changelog-generator 没有脚本、没有引用文件，只靠正文提示词与“发布前人工复核”的 Tips。
- 失败处理：changelog-generator 未写失败路径，遇到无提交历史或提交信息不全时没有规定动作。
- 读取范围：master 分支 README 全文、`changelog-generator/SKILL.md` 全文、提交号 `be2a406`。

### skills.md 第 12 节 affaan-m/ECC

- 组织方式：技能为 `skills/<name>/SKILL.md`，frontmatter 常规字段外加 `metadata.origin: ECC`；另有 `.agents/skills/` 供 Codex 读取，每个技能配一个 `agents/openai.yaml`；hooks、rules、memory、安全扫描各成一层。
- 调用方式：以插件 `ecc@ecc` 安装，技能按 description 触发，命令作为旧入口保留（自述 99 个 command shims）；多个 harness 各有安装目标。
- 强制检查与脚本：hooks 在生命周期事件上强制，例如拦截绕过 git hook 的提交、检测提示词里的密钥、SessionStart 注入上下文；另带 `doctor`、`repair`、`list-installed` 等自检命令。
- 失败处理：安装冲突要求先 `doctor` 再 `repair`，不叠装第二份；hook 可用环境变量按 ID 关闭或调整严格度；AgentShield 扫提示词、hooks、MCP 配置与密钥。
- 读取范围：README 全文（约 50KB 后截断）、`skills/accessibility/SKILL.md` 全文、main 提交号 `4adeee6`；328 个技能未逐个读。

### skills.md 第 13 节 mhattingpete/claude-skills-marketplace

- 组织方式：四个插件（engineering-workflow、visual-documentation、productivity-skills、code-operations），清单在 `.claude-plugin/marketplace.json` 与各插件 `plugin.json`；技能是 `skills/<name>/SKILL.md` 加可选 `scripts/`、`references/`，子代理用 `AGENT.md`。
- 调用方式：按 marketplace 安装；技能由模型按 description 自动触发，子代理是独立 Claude 实例。
- 强制检查与脚本：`code-refactor` 改完要求再 Grep 一次确认无残留；`code-transfer` 带 `scripts/line_insert.py`；`code-execution` 宣称批量操作省 90–99% token。
- 失败处理：`code-refactor` 的 Edge Cases 要求字符串与注释里的命中先问人，改导出 API 要警告破坏性变更；未写自动化回滚。
- 读取范围：README 全文与只读 `code-refactor/SKILL.md` 一份正文，提交号 `b5b34bc`；engineering-workflow 下的 feature-planning、git-pushing、review-implementing、test-fixing 四份 `SKILL.md` 未读。

### skills.md 第 14 节 superpowers · test-driven-development（测试生成）

- 组织方式：单 `SKILL.md` 加同目录 `writing-good-tests.md`；正文按 RED、GREEN、REFACTOR 组织，每阶段列出必须执行的动作，另有 Common Rationalizations 表与 Red Flags 清单。
- 调用方式：description 明确“任何功能或修 bug 之前”，由模型自动触发；也可显式调用 `superpowers:test-driven-development`。
- 强制检查与脚本：要求真跑项目测试命令并看输出——先写失败测试并确认它失败，再写最小实现让它通过，最后重构并跑全套；绿不了不许进下一步。
- 失败处理：测试意外通过说明测试没测到东西，要改测试；重构阶段测试转红则回退；正文的 When Stuck 表给出卡住时的下一步。
- 读取范围：`skills/test-driven-development/SKILL.md` 全文。

### skills.md 第 15 节 superpowers · writing-plans（需求拆解与规格转计划）

- 组织方式：单 `SKILL.md`；计划文档固定头写 Goal、Architecture、Tech Stack、Spec、Global Constraints、Review Focus，每个任务块写 Files、Interfaces 与 5 个步骤。
- 调用方式：有 spec 或需求、要动多步任务时由 description 触发；开场必须声明“I'm using the writing-plans skill to create the implementation plan.”；写完做五项 Self-Review，再让人员选择 subagent-driven 或 native 执行。
- 强制检查与脚本：步骤粒度要求每步一个动作一个可检查结果；没有脚本，Self-Review 五项靠人工逐条对照。
- 失败处理：多子系统要拆成多份计划；计划比代码还长说明已经把代码写进计划，要收窄。
- 读取范围：`skills/writing-plans/SKILL.md` 全文。

### skills.md 第 16 节 superpowers · brainstorming（需求拆解与规格撰写）

- 组织方式：单 `SKILL.md` 加 `builder-check-prompt.md`；设计文档存 `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`，含 intent 与 why、goals/non-goals/anti-goals、constraints、approaches、已定 how 与留给 builder 的部分。
- 调用方式：description 用强制语气，任何创作前先走；硬性顺序为单条消息列 2–3 个方案、写设计文档、等人批准、调用 `writing-plans`。
- 强制检查与脚本：`<HARD-GATE>` 规定设计文档批准前不写代码、不搭脚手架、不装依赖；判据是人的批准，没有脚本。
- 失败处理：项目级设计要派子代理做 builder check，把异议分三堆（文档已回答、可自行决断、必须问人）；对方说 “sounds good” 不算批准。
- 读取范围：`skills/brainstorming/SKILL.md` 全文。

### skills.md 第 17 节 superpowers · requesting-code-review（代码评审）

- 组织方式：单 `SKILL.md` 加 `code-reviewer.md` 子代理模板，模板占位符为 `{DESCRIPTION}`、`{PLAN_OR_REQUIREMENTS}`、`{BASE_SHA}`、`{HEAD_SHA}`；输出固定 Strengths、Issues（Important/Minor）、Assessment 三段。
- 调用方式：任务完成、重大功能完成、合并 main 前三类时机强制；派 general-purpose 子代理执行，协调者不自己看 diff。
- 强制检查与脚本：用 `git rev-parse HEAD~1` 与 `git merge-base origin/main HEAD` 固定审查区间；评审结论靠子代理判断，没有评分脚本。
- 失败处理：Critical 立刻修，Important 推进前修，Minor 记录；审查者判断有误可带技术理由反驳；不为“it's simple”跳过评审。
- 读取范围：`skills/requesting-code-review/SKILL.md` 全文。

### skills.md 第 18 节 superpowers · systematic-debugging（调试）

- 组织方式：单 `SKILL.md` 加三份支持文件（`root-cause-tracing.md`、`defense-in-depth.md`、`condition-based-waiting.md`）；正文按四阶段组织，附 Red Flags、Rationalizations 表与 Quick Reference 表。
- 调用方式：遇 bug、测试失败或异常行为、在提修复前由 description 触发；四阶段必须依次完成。
- 强制检查与脚本：要求先稳定复现、读完整堆栈、在每层边界加诊断日志；修复前先写失败测试，这一步可跑；根因判断没有脚本。
- 失败处理：修复不到 3 次回第一阶段重查；达到 3 次停止并质疑架构，与人讨论后再动；“无根因”多数是调查不完整。
- 读取范围：`skills/systematic-debugging/SKILL.md` 全文。

### skills.md 第 19 节 superpowers · finishing-a-development-branch（发布收尾）

- 组织方式：单 `SKILL.md`，六步固定流程：跑测试、探环境、确认 base 分支、给菜单、执行、清理。
- 调用方式：实现完成且测试全绿后由 description 触发；菜单原文照念等人选，丢弃分支要人输入 `discard` 确认。
- 强制检查与脚本：合并前跑全套测试命令（npm test、cargo test、pytest、go test ./...），红了即停；本地合并后要在合并结果上再跑一遍。
- 失败处理：移除 worktree 被拒（有未提交文件）时绝不加 `--force`，列出文件给三选项；push 被拒先查原因再处理。
- 读取范围：`skills/finishing-a-development-branch/SKILL.md` 全文。

### skills.md 第 20 节 mhattingpete · code-refactor（重构）

- 组织方式：单 `SKILL.md`；按文件数分两档，1–9 个用原生 Grep 加 Edit `replace_all`，10 个以上自动转 `code-execution` 技能并调 `api.code_transform.rename_identifier`。
- 调用方式：由 description 触发（批量重命名、替换废弃写法、改 API 调用）；流程为 Grep 列文件、带上下文再 Grep、Edit、最后再 Grep 验证。
- 强制检查与脚本：最后一步再 Grep 确认零命中，可核对；没有测试命令，语义是否正确仍靠人看。
- 失败处理：字符串与注释里的命中要先问人；改导出 API 要警告破坏性变更；大小写敏感要写明。
- 读取范围：`code-refactor/SKILL.md` 全文。

### skills.md 第 21 节 ahmed-lakosha · odoo-upgrade（迁移）

- 组织方式：技能在 `odoo-upgrade-plugin/odoo-upgrade/`，`SKILL.md` 约 220 行，配 `reference/` 两篇与 `scripts/`（`cli.py` 加 XML、JS、Python 三个 transforms 模块）；插件层另有 4 个 hooks、3 个斜杠命令与 `upgrade-analyzer` 子代理。
- 调用方式：斜杠命令 `/odoo-upgrade`、`/odoo-precheck`、`/odoo-quickfix`，或由 description 自动触发；hooks 在 PreToolUse 拦改写 Odoo 核心文件，PostToolUse 提示版本兼容问题。
- 强制检查与脚本：工作流固定为分析、备份、`cli.py precheck`、按 manifest/XML/Python/JS/SCSS 顺序变换、`cli.py validate`、起 Odoo 装模块跑测试；迁移脚本必须定义 `def migrate(cr, version)` 并守卫空版本。
- 失败处理：PreToolUse 的 guard 直接阻止对核心文件的写入；兼容性错误触发时提示改用升级技能；`odoo-upgrade.config.json` 三个键控制核心路径、目标版本路径与默认目标版本。
- 读取范围：`SKILL.md` 全文、插件 README 全文、目录清单、master 提交号 `5541d98`。

### skills.md 第 22 节 Composio · changelog-generator（发布说明）

- 组织方式：单 `SKILL.md`，纯提示词，无脚本、无引用文件；五段为 When to Use、What This Skill Does、How to Use、Example、Tips。
- 调用方式：自然语言触发，例如“为 v2.1.0 生成 changelog”“本周更新说明”；正文给 6 步流程与输出示例。
- 强制检查与脚本：只有 Tips 里的“发布前人工复核”，没有检查清单或命令，输出对不对靠人读。
- 失败处理：未写失败路径；无提交历史或提交信息不全时没有规定动作。
- 读取范围：`changelog-generator/SKILL.md` 全文。

### skills.md 第 23 节 未取得原文与仅取得摘要的项

- DeepSeek Harness 官方文档正文未取得：安装包内 `C:\Users\YJM1024\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh\docs\user\guide\skills.md`、同目录 `plugins.md`、`...\dsh\docs\.vitepress\config.mts` 三处路径用文件读取工具打开均返回 not found，Desktop 包未带 docs 目录。DSH 一行只依据 `...\@deepseek-ai\dsh-agent-preset\README.md` 与 `...\dsh-agent-preset\skills\dsh-doc\SKILL.md` 两份安装包内原文。
- Claude Code 三页文档（`https://code.claude.com/docs/en/skills.md`、`https://code.claude.com/docs/en/sub-agents.md`、`https://code.claude.com/docs/en/plugins/overview.md`）均为文档站渲染正文，前两页在约 50KB 处被截断，截断点之后的示例与边角字段未读；三页都没有版本号。
- Agent Skills 规范页 `https://agentskills.io/specification` 部分截断，目录结构与字段表已读，校验节之后的内容未读全。
- OpenAI 两页截断：`https://openai.github.io/openai-agents-python/tools/` 在 Programmatic Tool Calling 代码块处截断，`https://openai.github.io/openai-agents-python/agents/` 在 multi-agent 示例处截断，Dynamic instructions 之后的完整示例未读。
- anthropics/skills 只通读了 `README.md` 与 `skills/` 目录清单，以及 `skills/skill-creator/SKILL.md`、`skills/webapp-testing/SKILL.md` 的正文；其余 17 个（academy-guide、algorithmic-art、brand-guidelines、canvas-design、claude-api、discernment-nudge、doc-coauthoring、docx、frontend-design、internal-comms、mcp-builder、pdf、pptx、slack-gif-creator、theme-factory、web-artifacts-builder、xlsx）的 `SKILL.md` 未逐个读，脚本未逐行读。
- ECC 自述 328 个技能、72 个 agents，只通读 `README.md`（约 50KB 后截断）与 `skills/accessibility/SKILL.md` 一份技能正文，其余技能只看到目录名。
- mhattingpete/claude-skills-marketplace 只读 `code-operations-plugin/skills/code-refactor/SKILL.md` 一份正文，engineering-workflow 下的 feature-planning、git-pushing、review-implementing、test-fixing 四份 `SKILL.md` 未读；`code-transfer` 与 `code-execution` 只从 README 取到描述。
- 链接状态：表内 22 条链接分三类核对。7 条文档页（Claude Code 三页、Agent Skills 规范、Anthropic best practices、OpenAI 两页）用抓取工具打开均返回 HTTP 200；6 条 GitHub 仓库主页（deepseek-harness、obra/superpowers、anthropics/skills、ComposioHQ/awesome-claude-skills、affaan-m/ECC、mhattingpete/claude-skills-marketplace）用 GitHub API 复核存在；9 条 GitHub blob 链接的内容由对应 `raw.githubusercontent.com` 地址抓取确认（HTTP 200），沙箱内 `curl` 对全部外链返回 000，未能用命令行二次复测。
- 星数为 GitHub API 2026-11-27 查询值（obra/superpowers 327326、affaan-m/ECC 311205、ComposioHQ/awesome-claude-skills 80387 等），与常见量级差距较大，表中只作查询记录，不据此推断流行度。

