# 规范驱动开发（SDD）来源抽取表

采集时间 2026-11-27，版本、提交与 star 数取当日 GitHub API 与官方文档返回值。来源按主题分三组：完整工作流框架（GitHub Spec Kit、OpenSpec、cc-sdd、Kiro、BMAD-METHOD、Taskmaster、CCPM、Agent OS、GSD Core），技能封装与分发（Claude Code skills、Claude Code plugins），技能编写规范（Anthropic Agent Skills）。第三组不覆盖需求到实现的阶段链，只作为流程被封装成可调用单元时的规范来源。

“是否有可执行判据”一列的口径：有，指项目自带命令或脚本能给出通过、失败或需人工确认的明确结论；部分，指只有模板勾选、只读分析报告、智能体检查或人工评审；无，指没有任何检查环节。star 数按 GitHub topic `spec-driven-development` 当日快照取：OpenSpec 75802、gsd-build/get-shit-done 64120、BMAD-METHOD 55785、cc-sdd 3781；其中 gsd-build/get-shit-done 已归档，正文按其指向的 open-gsd/gsd-core 采集。

## 1. GitHub Spec Kit

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| GitHub Spec Kit | GitHub | v1.4.5（2026-11-25 发布），head `f2010547` | https://github.com/github/spec-kit ；https://github.com/github/spec-kit/blob/main/spec-driven.md | 宪章、需求规格、澄清、设计、任务、一致性分析、实现、收敛 | 先用九条宪章约束架构，再由模板生成 spec、plan、tasks，agent 按任务清单实现后用只读分析和收敛命令回检 | `/speckit.constitution`、`/speckit.specify`、`/speckit.clarify`、`/speckit.plan`、`/speckit.checklist`、`/speckit.tasks`、`/speckit.analyze`、`/speckit.implement`、`/speckit.converge`；`specs/<branch>/spec.md`、`plan.md`、`tasks.md`、`memory/constitution.md` | 部分 | “Specifications don't serve code—code serves specifications.”（`spec-driven.md` §The Power Inversion）；“This is NON-NEGOTIABLE: All implementation MUST follow strict Test-Driven Development.”（§Article III: Test-First Imperative） |

- 步骤链：`/speckit.constitution` 立宪章，`/speckit.specify` 生成分支与 `specs/[branch-name]/spec.md`，`/speckit.clarify` 补歧义，`/speckit.plan` 出 `plan.md` 及 `research.md`、`data-model.md`、`contracts/`、`quickstart.md`，`/speckit.checklist` 生质量清单，`/speckit.tasks` 出 `tasks.md` 并给独立任务标 `[P]`，`/speckit.analyze` 做只读一致性分析，`/speckit.implement` 按清单实现，`/speckit.converge` 把实现结果折回规格。
- 产出文件：`specs/[branch-name]/` 下 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/`、`quickstart.md`、`tasks.md`；宪章在 `memory/constitution.md`；当前活动特性记录在 `.specify/feature.json`。
- 强制检查：`/speckit.analyze` 只出报告不阻断；`plan.md` 模板的 Phase -1 gates 要求过 Simplicity Gate（项目数不超过 3）与 Anti-Abstraction Gate（直接用框架），不过要在 Complexity Tracking 里写明理由；`/speckit.converge` 成功时输出 `✅ Converged — the implementation satisfies the spec, plan, and tasks.`。
- 模板：`templates/spec-template.md` 要求 User Story 按 P1 到 P3 排优先级、功能需求编号 `FR-001`、未定项写 `[NEEDS CLARIFICATION: ...]`、成功标准编号 `SC-001` 且必须可测；宪章九条含 Library-First、CLI Interface、Test-First、Simplification、Anti-Abstraction、Integration-First。
- 已读页面：README、`spec-driven.md` 全文、`docs/quickstart.md` 全文、`docs/reference/agentic-sdd.html` 全文、`templates/spec-template.md` 全文。

## 2. OpenSpec

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| OpenSpec | Fission AI | v2.2.0（2026-11-24 发布），head `f1cd852f` | https://github.com/Fission-AI/OpenSpec ；https://openspec.dev/docs/quickstart | 探索、提案、规格增量、设计、任务、实施、归档 | 每个变更一个目录，proposal、specs、design、tasks 四件套随变更走，实施后由归档命令把增量并入长期规格 | `/openspec-explore`、`/openspec-propose`、`/openspec-apply-change`、`/openspec-archive-change`；`openspec validate`、`openspec status`、`openspec archive`；`openspec/changes/<change>/` 下 `proposal.md`、`specs/`、`design.md`、`tasks.md` | 有 | “OpenSpec adds a lightweight spec layer so you agree on what to build before any code is written.”（README §Why OpenSpec?）；“each change gets its own folder with proposal, specs, design, and tasks”（同上） |

- 步骤链：`/openspec-explore` 先摸代码与方案，`/openspec-propose <change>` 建 `openspec/changes/<change>/` 并写提案、规格、设计、任务，`/openspec-apply-change` 逐条勾任务，`/openspec-archive-change` 归档并把规格增量并入 `openspec/specs/`；扩展 profile 另有 `openspec-new-change`、`openspec-continue-change`、`openspec-ff-change`、`openspec-verify-change`、`openspec-bulk-archive-change`、`openspec-onboard`。
- 产出文件：`openspec/changes/<change>/` 下 `proposal.md`、`specs/<capability>/spec.md`、`design.md`、`tasks.md`，可选 `.openspec.yaml`；归档进 `openspec/changes/archive/<YYYY-MM-DD>-<change>/`；长期规格在 `openspec/specs/`。
- 强制检查：`openspec validate` 校验变更结构，`--strict` 加严，`--archived` 检查已归档变更；`openspec status` 与 `openspec list --specs` 查进度与规格清单；纯重构这类零 delta 变更必须在 `.openspec.yaml` 写 `skip_specs: true`，否则校验不过。
- 模板：schema `spec-driven` 自带 `proposal.md` 与 `spec.md` 模板，`openspec templates` 列出可选项；需求用 `### Requirement:`，场景用四个井号的 `#### Scenario:` 加 WHEN/THEN，正文用 SHALL 或 MUST，单条描述不超过 500 字符。
- 已读页面：README 全文、`docs/quickstart` 全文、`docs/cli` 大部、`docs/schemas/spec-driven` 大部；后两页尾部被工具截断，尾部内容仅取得摘要。

## 3. cc-sdd

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| cc-sdd | gotalab | v3.1.0（2026-09-23 发布），head `e2a0c671` | https://github.com/gotalab/cc-sdd ；https://github.com/gotalab/cc-sdd/blob/main/docs/guides/spec-driven.md | 发现与路由、项目上下文、需求、设计、任务、实现、校验 | 以边界为第一性原则把 spec 当作独立交付与再验证单元，按需求、设计、任务三份文件推进，每阶段停等人工批准 | `/kiro-discovery`、`/kiro:steering`、`/kiro:spec-init`、`/kiro:spec-requirements`、`/kiro:spec-design`、`/kiro:spec-tasks`、`/kiro-impl`、`/kiro-validate-impl`；`.kiro/specs/<feature>/requirements.md`、`design.md`、`tasks.md` | 有 | “A good spec should make it clear: what this spec owns … what it explicitly does not own”（`docs/guides/spec-driven.md` §Boundary-First by Default）；“Both modes follow the **Feature Flag TDD** protocol (RED then GREEN).”（§`/kiro-impl` Modes） |

- 步骤链：`/kiro-discovery` 把请求分到扩展已有 spec、直接实现、单 spec、多 spec、混合拆分五种结果之一，新单 spec 或多 spec 时写 `brief.md`，需要时写 `roadmap.md`；`/kiro:steering` 收集架构与约定，`/kiro:spec-init` 建 `.kiro/specs/<feature>/`，`/kiro:spec-requirements` 出 `requirements.md`，`/kiro:spec-design` 先出 `research.md` 再出 `design.md`，`/kiro:spec-tasks` 出 `tasks.md`，`/kiro-impl` 逐任务实现，`/kiro-validate-impl` 做集成校验，`/kiro:spec-status` 报进度。
- 产出文件：`.kiro/specs/<feature>/` 下 `requirements.md`、`research.md`、`design.md`、`tasks.md`；`design.md` 含 File Structure Plan 一节，把目录结构与文件职责写进去；`tasks.md` 用 `(P)` 标可并行任务，用 `_Boundary:_` 标组件范围，用 `_Depends:_` 记非显然依赖。
- 强制检查：每个阶段默认停等人工 review，只有显式传 `-y` 或 CLI 的 `--auto` 才自动放行；`/kiro-validate-impl` 返回 `GO`、`NO-GO` 或 `MANUAL_VERIFY_REQUIRED`；`kiro-verify-completion` 返回 `VERIFIED`、`NOT_VERIFIED` 或 `MANUAL_VERIFY_REQUIRED`。
- 模板：`{{KIRO_DIR}}/settings/templates/specs/{requirements,design,tasks}.md` 可改，团队可把评审清单与签核要求写进模板头，技能与命令生成文档时读这些模板。
- 已读页面：README、`docs/guides/spec-driven.md` 全文、`docs/guides/skill-reference.md` 全文。

## 4. Kiro

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Kiro | AWS | 闭源 IDE，按官方文档采集（2026-11-27 读取），无公开版本号 | https://kiro.dev/docs/specs/ ；https://kiro.dev/docs/specs/feature-specs/ | 需求、设计、任务、实现、校验 | 三份文件加审批门，需求用 EARS 句式写成可测条目，设计先过审再拆任务 | `requirements.md`、`design.md`、`tasks.md`；`Analyze Requirements`、`Run all Tasks`、`Sync Files`；目录 `.kiro/specs/<feature>/` | 部分 | “WHEN [condition/event] THE SYSTEM SHALL [expected behavior]”（`docs/specs/feature-specs.md` §Requirements with EARS Notation）；“Start with the behavior of the system you want to create, captured as requirements, then generate technical design and implementation tasks.”（同页 §Workflow Variants Requirements-First） |

- 步骤链：先选 Requirements-First（先 `requirements.md` 再生成 `design.md`，再拆任务）或 Design-First（先 `design.md` 再导 `requirements.md`），变体在创建时选定且之后不能切换；Quick Spec 一次跑完三阶段，不在阶段间设审批门，适合需求已经清楚的特性。
- 产出文件：`.kiro/specs/<feature>/` 下 `requirements.md`、`design.md`、`tasks.md`；`design.md` 覆盖架构、数据流、接口、数据模型、错误处理、单元测试策略。
- 强制检查：`Analyze Requirements` 检查矛盾、歧义、冲突与缺口，结论由模型给出，不产出退出码；`Run all Tasks` 按依赖图分 wave 并发执行，`Sync Files` 把已完成任务回填 `tasks.md`；bugfix spec 用 `SHALL CONTINUE TO` 记录不应改变的行为，并生成 property-based tests。
- 模板：三份文件由 IDE 按所选变体生成；已读页面没有给出可替换的独立模板文件或模板目录。
- 已读页面：`kiro.dev/docs/specs/` 全文、`docs/specs/feature-specs.md` 全文、`docs/specs/best-practices.md` 全文。

## 5. BMAD-METHOD

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| BMAD-METHOD | BMad Code LLC | v6.12.4（2026-10-14 发布），head `e435a225`；另发 V7 预览 | https://github.com/bmad-code-org/BMAD-METHOD ；https://docs.bmad-method.org/reference/ticket-tree/ | 澄清、计划、构建与验证、复盘 | 票据即 spec，initiative 与 epic 各有一份带稳定需求编号的票据文件，条目按依赖排进 tickets.toml，由脚本给出可做与阻塞清单 | `tickets.py` 的 `next`、`status`、`find`、`pull`、`mark`、`move`、`mirror`；`_bmad-output/initiative-<slug>/tickets/tickets.toml`、`epic-<slug>/tickets.toml`、`story-<slug>-plan.md` | 有 | “An initiative or epic file is the spec at its level.”（The Ticket Tree §Ticket Files）；“Three to six checks that show the work is finished, judged at closure and by the retrospective”（同节 Done when 行） |

- 步骤链：Clarify 澄清想法，Plan 写 PRD、切 initiative、设计 UX 与架构、规划 epic 与 story，Build and verify 建票据树后逐张构建、评审、测试，Learn and adjust 收尾 epic 并复盘。
- 产出文件：`_bmad-output/initiative-<slug>/` 下 `initiative-<slug>.md`、`prd-<slug>/`、`ux-<slug>/`、`architecture-<slug>/`、`tickets/tickets.toml`、`epic-<slug>/epic-<slug>.md`、`epic-<slug>-retrospective.md`、epic 内 `tickets.toml`、`story-<slug>-plan.md` 与 `backlog/`；计划文件 frontmatter 记 `status`、`baseline_revision`、`route`、`risk`。
- 强制检查：`tickets.py` 读树后输出一个 JSON 对象，成功退出码 0，存储禁止该操作退出码 2，其他错误退出码 1；状态机里 `built` 是构建写入的最后一个状态，`done` 由人或受指派的脚本与智能体打；接外部看板时 `tickets.py next` 要先同步看板状态并带 `--synced` 重跑，否则拒绝执行。
- 模板：票据节固定 Description、Outcome、Requirements、Constraints、Done when、Boundaries、References、Notes；条目键含 `id`、`type`、`verify`、`covers`、`after`、`hitl`、`risk`、`unknown`、`refine`、`plan_checkpoint`、`done_checkpoint`。
- 已读页面：README、`docs.bmad-method.org/start/how-bmad-works` 全文、`reference/ticket-tree` 全文。

## 6. Taskmaster

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Taskmaster | Hamster（eyaltoledano） | `task-master-ai@0.43.1`（2026-03-31 发布），head `c0c98d36` | https://github.com/eyaltoledano/claude-task-master ；https://tryhamster.com/docs/taskmaster/capabilities/task-structure | 需求解析、任务拆解、依赖管理、复杂度评估、执行跟踪 | 把 PRD 解析成带依赖与子任务的 tasks.json，用状态与依赖决定下一件可做的事 | `task-master parse-prd`、`list`、`next`、`show`、`set-status`、`expand`、`analyze-complexity`、`validate-dependencies`、`generate`；`.taskmaster/tasks.json` | 有 | “task-master parse-prd <prd-file.txt>”（CLI Commands §Parse PRD）；“Show the next task to work on based on dependencies and status”（同页 §Show Next Task） |

- 步骤链：写 PRD 后用 `task-master parse-prd` 生成任务，`expand` 把任务拆成子任务，`next` 按依赖与状态取下一件，`set-status` 推进状态，`analyze-complexity` 评估复杂度并出报告，`validate-dependencies` 查非法依赖。
- 产出文件：`.taskmaster/tasks.json` 为事实源，`generate` 生成逐任务文件；任务字段含 `id`、`title`、`description`、`status` 与 `priority`、`dependencies`、`details`、`testStrategy`、`subtasks`、`metadata`。
- 强制检查：`validate-dependencies` 只查不修，`fix-dependencies` 自动修非法依赖；`analyze-complexity` 按 1 到 10 打分并可用 `--threshold` 卡阈值；没有测试级门禁。
- 模板：`.taskmaster/templates/example_prd.txt` 为 PRD 样例；MCP 工具共 36 个，可裁到 standard 15 个或 core 7 个。
- 已读页面：README、`tryhamster.com/docs/taskmaster/capabilities/task-structure` 全文、`cli-root-commands` 大部（命令表已覆盖，尾部被截断）。

## 7. CCPM

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| CCPM | Automaze | 无正式 release，head `0bcfabb5`（2026-11-04） | https://github.com/automazeio/ccpm ；https://github.com/automazeio/ccpm/blob/main/skill/ccpm/SKILL.md | 计划、结构化拆解、同步到 GitHub、并行执行、跟踪 | PRD 转 epic，epic 拆成带依赖的任务并同步为 GitHub issue，issue 成为事实源，并行 agent 在独立 worktree 里实现 | `.claude/prds/<name>.md`、`.claude/epics/<feature>/epic.md`；`status.sh`、`standup.sh`、`validate.sh`、`next.sh`、`blocked.sh` 等 15 个脚本 | 有 | “Every line of code must trace back to a specification.”（README §Core Principle: No Vibe Coding）；“For deterministic operations … always run the bash script directly rather than doing the work manually”（`SKILL.md` §Script-First Rule） |

- 步骤链：Plan 用引导式讨论写 PRD 并转成技术 epic，Structure 把 epic 拆成带编号、依赖与并行标记的任务文件，Sync 把 epic 与任务推成 GitHub issue 并回写 issue 号，Execute 识别并行工作流后开 agent 与 worktree，Track 出状态、站会、搜索、下一件与阻塞清单。
- 产出文件：`.claude/prds/<name>.md`、`.claude/epics/<feature>/epic.md`、任务文件 `001.md`（同步后按 issue 号命名）、`<N>-analysis.md`、`updates/`；每个 epic 建独立 worktree `../epic-<name>/`。
- 强制检查：确定性操作一律跑脚本而不由模型现算，脚本含 `status.sh`、`standup.sh`、`epic-list.sh`、`epic-show.sh`、`search.sh`、`in-progress.sh`、`next.sh`、`blocked.sh`、`validate.sh`；`validate.sh` 校验项目状态。
- 模板：PRD 与 epic 的写法分别写在 `references/plan.md` 与 `references/structure.md` 等阶段说明里，SKILL.md 按阶段指向这些文件。
- 已读页面：README 全文、`skill/ccpm/SKILL.md` 全文。

## 8. Agent OS

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Agent OS | Builder Methods（Brian Casel） | v3.0.0（2026-01-20 发布），head `e892e61d` | https://github.com/buildermethods/agent-os ；https://buildermethods.com/agent-os/shape-spec | 标准提炼与注入、产品规划、规格成形 | 在 plan mode 里把范围、决策、参照与适用标准落成一个持久的 spec 目录，再按该目录实现 | `/shape-spec`；`agent-os/specs/YYYY-MM-DD-HHMM-<slug>/` 下 `plan.md`、`shape.md`、`references.md`、`standards.md`、`visuals/` | 无 | “The `/shape-spec` command is designed to run in plan mode … creating a spec folder that persists beyond the conversation.”（Shape Spec §What it does）；“Folder names are auto-generated: `YYYY-MM-DD-HHMM-{feature-slug}/`”（同页 §What gets saved） |

- 步骤链：Discover standards 从既有代码提炼团队标准，Inject standards 把相关标准注入当前上下文，Product planning 写产品规划，Shape Spec 在 plan mode 里回答范围、视觉稿、可参照代码、产品对齐与适用标准五类问题后成文。
- 产出文件：`agent-os/specs/YYYY-MM-DD-HHMM-<slug>/` 下 `plan.md`、`shape.md`、`references.md`、`standards.md`、`visuals/`；目录名按日期时间加特性短名自动生成。
- 强制检查：没有独立检查命令；`/shape-spec` 把“保存 spec 文档”设为计划第一项任务，计划由人 review 批准后才执行。
- 模板：spec 目录结构本身就是模板；`plan.md` 是完整计划，`shape.md` 记范围、决策与上下文，`standards.md` 存相关标准全文。
- 已读页面：README、`buildermethods.com/agent-os` 首页全文、`/agent-os/shape-spec` 全文。

## 9. GSD Core

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| GSD Core | open-gsd（原 gsd-build） | v1.23.0（2026-11-23 发布），head `26429a68`；原仓 gsd-build/get-shit-done 已归档 | https://github.com/open-gsd/gsd-core ；https://github.com/open-gsd/gsd-core/blob/main/docs/explanation/the-phase-loop.md | 讨论、可选 UI 设计、计划、执行、验证、交付 | 以里程碑与阶段为单位跑固定循环，每步产出落进 `.planning/`，执行器每次用全新上下文按 wave 并行 | `/gsd-new-project`、`/gsd-onboard`、`/gsd-quick`；`.planning/ROADMAP.md`、`STATE.md`、阶段内 `CONTEXT.md`、`RESEARCH.md`、`PLAN.md`、`VERIFICATION.md`、`UI-SPEC.md` | 部分 | “GSD Core structures all development work as a repeating cycle”（The phase loop §What the loop is）；“A phase is not done because execution finished without errors.”（同文 §Verify） |

- 步骤链：Discuss 用对话定实现决策并写 `CONTEXT.md`，可选 `/gsd-ui-phase` 出 `UI-SPEC.md`，Plan 由 researcher 写 `RESEARCH.md`、planner 写 `PLAN.md`、plan-checker 查完整与一致，Execute 由执行器按依赖 wave 并行并原子提交，Verify 出 `VERIFICATION.md` 并生成定点修复计划，Ship 建 PR 并归档、更新 `STATE.md`。
- 产出文件：`.planning/` 下 `ROADMAP.md` 与 `STATE.md`，阶段目录内 `CONTEXT.md`、`RESEARCH.md`、`PLAN.md`、`VERIFICATION.md`、`UI-SPEC.md`；`STATE.md` 是导航层，记录当前里程碑、进行中的阶段与计划完成情况。
- 强制检查：verifier 检查需求编号覆盖、`CONTEXT.md` 决策覆盖与阶段目标一致性，产出 `VERIFICATION.md`；plan-checker 在执行前查计划完整、一致、在范围内；两者都由智能体执行，无脚本退出码。
- 模板：`PLAN.md` 固定写要触碰的文件、具体改动与验收标准，并按依赖排成 wave；`CONTEXT.md` 只在 Discuss 阶段写，后续 planner、executor、verifier 都读它。
- 已读页面：README 全文、`docs/explanation/the-phase-loop.md` 全文。

## 10. Claude Code skills

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Claude Code skills | Anthropic | 官方文档（2026-11-27 读取），部分能力按版本标注（`/skill-doctor` 需 v2.1.252、`prompt-audit` 需 v2.1.283） | https://code.claude.com/docs/en/skills.md | 流程封装、按需载入、调用控制（不覆盖需求到实现阶段链） | 一份 `SKILL.md` 加 YAML frontmatter 组成技能，正文只在触发时载入，模型或用户都可调用 | `SKILL.md`；`/skill-name`；`/verify`、`/run`、`/doctor`；`claude plugin eval` | 部分 | “Create a `SKILL.md` file with instructions, and Claude adds it to its toolkit.”（Extend Claude with skills 开篇）；“Claude Code skills follow the Agent Skills open standard, which works across multiple AI tools.”（同页） |

- 机制：技能是过程性知识而不是事实性知识，正文按需载入；frontmatter 的 `description` 与 `when_to_use` 合并后截断到 1536 字符，供模型判断是否触发。
- 加载位置：企业级、个人 `~/.claude/skills`、项目 `.claude/skills`、嵌套目录、`--add-dir` 追加目录、插件内置；`.claude/commands/` 的旧命令仍可用，多文件需求要转成技能目录。
- 强制检查：`/verify` 构建并运行应用来确认改动，不退回测试或类型检查；`/skill-doctor` 报每个技能的成本与使用次数；`/doctor` 查未用技能与上下文成本；`claude plugin eval` 做插件与技能评估。文档未给出可阻断流程的脚本退出码。
- frontmatter 字段：`name`、`description`、`when_to_use`、`argument-hint`、`arguments`、`disable-model-invocation`、`user-invocable`、`allowed-tools`、`disallowed-tools`、`model`、`effort`、`context: fork`、`agent`、`background`、`hooks`、`paths`、`shell`、`metadata`、`license`、`compatibility`。
- 已读页面：`code.claude.com/docs/en/skills.md` 全文，含 Frontmatter reference 一节。

## 11. Claude Code plugins

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Claude Code plugins | Anthropic | 官方文档（2026-11-27 读取），无独立版本号 | https://code.claude.com/docs/en/plugins/overview.md | 打包安装、分发、作用域控制（不覆盖阶段链） | 插件是一个目录，装技能、子智能体、钩子与 MCP 服务器打包成一个安装单元，经 marketplace 分发 | `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`；`/plugin`、`claude plugin disable`、`--plugin-dir` | 部分 | “A Claude Code plugin is a directory of skills, agents, hooks, MCP servers, or other components that Claude Code installs and loads as one unit.”（Plugins overview §Understand what a plugin is） |

- 机制：marketplace 是带 `.claude-plugin/marketplace.json` 的仓库或目录，只作目录不当托管商店；marketplace 名分 official、community、third-party 三层，第三方插件以用户权限运行代码。
- 作用域：user 在本机所有项目生效，project 通过提交 `.claude/settings.json` 对仓库内所有人生效，local 只对本人本仓库生效；云会话不加载本地设置里的插件。
- 命令：`/plugin` 浏览与安装，`claude plugin disable` 停用不卸载，`--plugin-dir` 从本地目录直接加载开发中的插件。
- 成本与判据：启用后每个技能的名称与描述每轮都进上下文，skills 文档说明可用 `/skill-doctor` 查看各技能成本与使用次数；插件评估用 `claude plugin eval` 与无插件基线对照，没有强制门禁。
- 已读页面：`code.claude.com/docs/en/plugins/overview.md` 全文。

## 12. Anthropic Agent Skills 规范

| 名称 | 维护方 | 最新版本或提交 | 出处链接 | 覆盖环节 | 核心机制（一句话） | 关键文件或命令 | 是否有可执行判据（有/无/部分） | 原文摘录（不超过两行） |
|---|---|---|---|---|---|---|---|---|
| Anthropic Agent Skills 规范 | Anthropic | 官方文档与 agentskills.io 开放标准（2026-11-27 读取） | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview ；https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | 技能编写、渐进披露、评估（不覆盖阶段链） | 三级载入，元数据常驻、正文触发时读、附带文件与脚本按需取，用评估先行的方式写技能 | `SKILL.md`；`reference/`、`scripts/`；评估用例 JSON | 部分 | “The context window is a public good.”（best practices §Concise is key）；“Only add context Claude doesn't already have.”（同文 §Default assumption） |

- 机制：第一级是 frontmatter 元数据，约 100 token，常驻上下文；第二级是 `SKILL.md` 正文，触发时载入，建议不超 5k token；第三级是附带文件与脚本，按需读取，脚本执行结果才进上下文。
- 约束：`name` 不超 64 字符，只允许小写字母、数字与连字符，不能含 anthropic 与 claude；`description` 不超 1024 字符，写清做什么与何时用，用第三人称；正文不超 500 行；引用文件保持一层深，避免链式引用。
- 判据：frontmatter 不合规会硬报错；评估先建三个场景，对照无技能的基线运行，用结果而不是印象判断技能是否有效；已读页面没有给出可直接运行的评估命令。
- 环境差异：claude.ai 可装 npm 与 PyPI 包，API 环境无网络且不能装包；非 Claude Code 渠道只认 `name`、`description`、`license`、`compatibility`、`metadata`、`allowed-tools` 六个字段，多写字段会报 `Unexpected key(s) in SKILL.md frontmatter: ...`。
- 已读页面：`agent-skills/overview` 全文、`agent-skills/best-practices` 全文。

## 未取得原文

- gsd-build/get-shit-done：仓库已归档，README 只有迁移说明，实际正文按 open-gsd/gsd-core 采集，表中版本取后者。
- Kiro：闭源 IDE，没有公开源码仓库，全部内容按 kiro.dev 官方文档采集，版本号未取得。
- OpenSpec：`docs/cli` 与 `docs/schemas/spec-driven` 两页在抓取工具侧被截断，尾部未读到，仅取得摘要；已读部分覆盖命令表与规格写法，表内引用未涉及被截断的尾部。
- 其余 10 个来源均取得正文，无整份缺失。
