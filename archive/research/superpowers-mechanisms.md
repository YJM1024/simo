# Superpowers 研究：规格→规划→执行→验证的工作流与门禁

> 对象：**obra/superpowers**（<https://github.com/obra/superpowers>），作者 Jesse Vincent / Prime Radiant，MIT。
> 定位："An agentic skills framework & software development methodology that works." —— 它**不是运行时框架**，而是一套**技能（skills）+ 注入钩子 + 门禁措辞**，靠 prompt 塑造宿主 agent 的行为。
> 确认过程：`web_search` 命中多个同名/镜像来源（marketplace 页、mintlify 镜像、各种 fork），**官方仓库是 `obra/superpowers`**（README 自称 Prime Radiant、市集链接、`skills/` 目录结构一致）；Claude Code 侧通过官方市集 `superpowers@claude-plugins-official` 或自建市集 `obra/superpowers-marketplace` 安装。其他同名站点/fork 不作为依据。
> **证据分级**：`[原文·我读]` = 我本人在 raw.githubusercontent 抓到的原文；`[原文·子研究]` = 我派出的只读子研究抓到的原文（同为官方仓库原文，附路径）；`[规范]` = 仓库自带 `AGENTS.md`；`[设计]` = 仓库内 `docs/superpowers/specs/*-design.md`（项目自己的决策记录，比 README 更接近真实机制）；`[推]` = 推断。
> 路径约定：`skills/<名>/SKILL.md` 均指 `https://raw.githubusercontent.com/obra/superpowers/main/skills/<名>/SKILL.md`。

---

## 0. 一页速览

1. **它解决的问题**：agent 天生"立刻动手写代码、跳过设计、不做验证、在被压缩的上下文里跑偏"。Superpowers 用"**必须先加载流程技能**"的注入 + 一整套**阶段化技能** + **可被判定的门禁**，把"写代码"改成"先谈清楚 → 写文档 → 拆任务 → 逐任务带审查地做 → 证据化验完"。
2. **核心构成**：16 个技能（见 §1.2）+ 一个 **SessionStart 钩子**把 `using-superpowers` 引导词（含"1% 可能也要调用技能"的强制段与"合理化借口表"）注入每次会话/`/clear`/压缩后 + 每任务三份文件（brief / report / review-package）+ 一个 git-ignored 的 `.superpowers/sdd/<plan>/progress.md` 台账。
3. **一句话流程**：`brainstorming`（问出 spec）→ 人工 sign-off → `using-git-worktrees`（隔离工作区 + 干净测试基线）→ `writing-plans`（每任务最小可测试单元、逐条可验证步骤）→ `subagent-driven-development`（每任务：派发实现子代理 → 双裁决审查 → 修复环 ≤5 轮）或 `executing-plans`（内联执行）→ 终审（整支 diff + 最capable模型 + 恰好一波修复）→ `finishing-a-development-branch`（测试通过 + 人类选 merge/PR/keep，`discard` 需逐字输入）。
4. **spec 的地位**（关键定性）：**"The spec is the binding authority, the plan is its argument"**（spec 是约束性权威，plan 是它的论证）。plan 顶部强制 `**Spec:**` 回链（"the plan argues from the spec, so the spec travels with it"）。
5. **约束 AI 的手法**（可直接拿来）：Iron Law 大写块（`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`）、`<HARD-GATE>`、`<EXTREMELY-IMPORTANT>`、**合理化借口表（| Excuse | Reality |）**、Red Flags（"出现这些念头=停"）、checklist 勾选框、"离经叛道即违反精神"（Violating the letter … is violating the spirit）、以及"用户指令 > 技能 > 默认行为"的优先级声明。
6. **代价/风险**：一切约束都是**提示词层软约束**，没有机器可校验的状态机；文档内部有前后不一致（§5.1）；TDD 铁律在探索型任务上极贵；强依赖"可恢复的子代理 + 文件交接纪律"。

---

## 1. 它是什么、核心构成

### 1.1 形态：技能即"代码"，不是散文 `[规范 AGENTS.md]`

> "Skills are not prose — they are code that shapes agent behavior."

- 技能是 `skills/<name>/SKILL.md`（YAML frontmatter = `name` + `description`，**没有** `when_to_use` 字段；`description` 本身写成触发条件，如 `Use when implementing any feature or bugfix, before writing implementation code`）`[原文·我读 test-driven-development]`。
- 技能目录还放**可执行资产**：`skills/brainstorming/scripts/`、`visual-companion.md`、`builder-check-prompt.md`；`skills/subagent-driven-development/scripts/`（`sdd-workspace` / `task-brief` / `review-package` / `task-start` / `task-done`）`[设计][原文·子研究]`。
- 修改技能内容要**带 eval 证据**、不得重写"eval-tuned 的句子"（"existing eval-tuned sentences move; they do not get reworded"）`[设计 2026-07-15]`；仓库对 agent 提交的 PR 有专门门禁（见 §4.4）。

### 1.2 16 个技能与分组 `[原文·我读 README]`

| 组 | 技能 | 作用 |
|---|---|---|
| 入口 | `using-superpowers` | 引导词：先查技能再做事、优先级、Red Flags 表 |
| 规格 | `brainstorming` | 一次一问地挖需求，回放理解供纠正，产出 design doc |
| 规划 | `writing-plans` | 把设计拆成"初级工程师也能照做"的任务（含精确路径/代码/验证步骤） |
| 环境 | `using-git-worktrees` | 新分支隔离工作区 + 跑项目 setup + **干净测试基线** |
| 执行 | `subagent-driven-development`（SDD） | 每任务派新子代理 + 两阶段审查（最彻底） |
| 执行 | `executing-plans` | 单上下文内联执行 + 末尾一次整支审查（最省） |
| 执行 | `dispatching-parallel-agents` | 独立问题域并行调查 |
| 质量 | `test-driven-development` | RED-GREEN-REFACTOR 铁律 |
| 质量 | `systematic-debugging` | 四阶段找根因（含 3 次修复失败→质疑架构） |
| 质量 | `verification-before-completion` | 证据先行，禁止无验证宣告完成 |
| 质量 | `requesting-code-review` / `receiving-code-review` | 请求审查前的自查 / 接受反馈 |
| 收尾 | `finishing-a-development-branch` | 测试门禁 + merge/PR/keep/discard |
| 元 | `writing-skills` | 如何写/测技能（见 §2.5） |
| 元 | `diagnosing-superpowers` | 会话里技能该触发没触发时，读 transcript 找证据 |

### 1.3 注入机制：SessionStart 钩子（**最值得抄的工程点**）`[原文·我读 hooks/]`

- `hooks/hooks.json`：`SessionStart` 的 matcher 是 **`"startup|clear|compact"`** —— 会话开始、`/clear`、**压缩之后**都重新注入。
- `hooks/session-start`（bash）：读取 `skills/using-superpowers/SKILL.md` **全文**，JSON 转义后包进
  `<EXTREMELY_IMPORTANT>You have superpowers. … Below is the full content of your 'superpowers:using-superpowers' skill …</EXTREMELY_IMPORTANT>`，
  按宿主的字段名输出（Claude Code `hookSpecificOutput.additionalContext` / Cursor `additional_context` / SDK 标准 `additionalContext`；并刻意只发当前平台消费的那个字段，避免重复注入）。
- 设计含义：**bootstrap 不是普通技能，而是每会话的常驻引导**；其他技能靠 `Skill` 工具按需加载。README 说得很直白：
  > "A real integration loads the `using-superpowers` bootstrap at session start. … Without it, the skills are dead weight."
- 验收测试（新宿主接入）= 新会话只发一句 `Let's make a react todo list`，**必须自动触发 `brainstorming` 而不是写代码** `[规范 AGENTS.md]`。

---

## 2. 完整工作流：每步输入 / 输出 / 门禁

> 记号：**产**=产物；**门**=硬门禁（原句短语）；级别见文首证据分级。

### 阶段 0：会话启动（bootstrap）
- **输入**：用户第一句话。
- **动作**：注入 `using-superpowers` 全文。规则：**"Invoke relevant or requested skills BEFORE any response or action — including clarifying questions"**；技能优先级 **process skills first**（`brainstorming`、`systematic-debugging` 等决定方法，再交给实现类技能）；进入 plan mode 前若还没 brainstorm 过，**先 brainstorm**；宣告 **"Using [skill] to [purpose]"**；技能含 checklist 则**每个条目建一个 todo**。
- **门**：`<EXTREMELY-IMPORTANT>` **"If you think there is even a 1% chance a skill might apply … you ABSOLUTELY MUST invoke the skill."** / "YOU DO NOT HAVE A CHOICE."；子代理豁免 `<SUBAGENT-STOP>If you were dispatched as a subagent … ignore this skill.`
- **优先级**：**用户指令（CLAUDE.md/AGENTS.md/直接请求）> 技能 > 默认行为**，只有人类明确说了才可跳过。

### 阶段 1：规格（brainstorming）
- **输入**：用户意图（常常是模糊的"给我做个 X"）。
- **动作**：一次问一个问题把意图挖出来；把理解**回放**给用户纠正；小改动在对话里定，项目级产出书面设计文档。
- **产**：`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`（仓库内真实样例：`docs/plans/2025-11-22-opencode-support-design.md`，头部字段 `Date / Author / Status`，`Status: Design Complete, Awaiting Implementation`；正文 Overview / Background / Architecture / File Structure / Implementation Plan / Next Steps / Benefits）`[原文·我读]`。
- **门**：`<HARD-GATE>` **"Nothing gets built until your human partner approves the design doc"**；设计批准后只允许调 `writing-plans`（"invoke superpowers:writing-plans and no other skill"）。

### 阶段 2：隔离环境（using-git-worktrees）
- **输入**：已批准设计。
- **动作**：新建分支/worktree、跑项目 setup、**验证干净测试基线**。
- **门**：**"MUST verify directory is ignored"**（worktree 目录必须被 gitignore）；SDD 另有 **"Never start implementation on a main/master branch without your human partner's explicit consent"**（未获明示同意不得在主分支开工）。

### 阶段 3：规划（writing-plans）
- **输入**：design doc。
- **动作**：拆成小任务，每个任务给**精确文件路径、完整代码/接口、验证步骤、commit 命令**；任务粒度以"最小可测试单元"为准（README 另说 2–5 分钟，见 §5.1）。
- **产**：`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`；**头部强制回链 `**Spec:**`**。
- **门**：**"before touching code"**（实现前必须有 plan）；plan 是**论证**，spec 是**权威** —— 冲突时以 spec 为准、走人工裁决。

### 阶段 4：执行（SDD，默认重型路径）

**Setup（每计划一次）**
1. `using-git-worktrees` 建隔离工作区；
2. `scripts/sdd-workspace PLAN_FILE` → 得到**本计划专属**目录 `.superpowers/sdd/<plan-slug>/`（自忽略的 `.gitignore`，内容 `*`）；
3. 查 `progress.md`（台账）：**首行必须是** `# SDD ledger — plan: <plan 路径>`；首行是别的 plan → **那是别人的进度，不读不写**，用自己的目录；
4. 读 plan + Spec + Global Constraints；**读 `references/preflight.md` 做跨任务接口冲突扫描**，结论入台账；每任务建 todo。

**每个任务的五步循环**
| 步 | 输入 | 动作 | 产物 | 门禁 |
|---|---|---|---|---|
| ① 记录基点 | — | `BASE=$(git rev-parse HEAD)` | — | 后续 diff 必须 `BASE..HEAD`，**不得用 `HEAD~1`** |
| ② 生成 brief | plan、任务号 | `scripts/task-brief PLAN N` | `task-N-brief.md` | **"Never make a subagent read the whole plan file"**（只给 brief） |
| ③ 派发实现子代理 | brief 路径、"read this first"、前序接口与决策、歧义裁决、report 路径与契约（**5 要素**） | 子代理：实现 + TDD + 跑测试 + 提交 + 自审 + 写 report | `task-N-report.md`（四态之一） | 子代理**不得再派子代理**（"You Do Not Dispatch Subagents"）；**禁并行派多个实现子代理** |
| ④ 生成审查包 | `BASE..HEAD` | `scripts/review-package PLAN BASE HEAD` | `review-<base7>..<head7>.diff` | **"Never dispatch a task reviewer without a diff file"**；diff 绝不进控制器上下文 |
| ⑤ 双裁决任务审查 | brief、report、diff 文件 | 子代理按**两阶段**审：Part1 Spec Compliance（**Missing / Extra / Misunderstood**，无法从 diff 判定的记 ⚠️）；Part2 Code Quality（关注点分离/错误处理/DRY/边界/测试是否验真行为/文件职责） | 两个 verdict：**Spec ✅/❌** 与 **Task quality Approved/Needs fixes** | **"never accept a report missing either verdict"**；**"Implementer self-review never replaces the task review"** |
| 收尾 | 两 verdict 都过 | 台账追加 `Task <N>: complete (commits a7..b7, review clean)` + 勾 todo | — | 有未处置的 Critical/Important **不得进入下一任务** |

**实现者 report 的四态契约**：`DONE` / `DONE_WITH_CONCERNS` / `NEEDS_CONTEXT` / `BLOCKED` —— 只有 `DONE` 才进审查；`NEEDS_CONTEXT` 是**子代理主动要上下文**的正规通道。

### 阶段 5：修复环（**收敛设计，最值得抄**）`[设计 2026-07-15-sdd-fix-loop-redesign]`

触发：任务审查返回 spec ❌ 或任一 Critical/Important。

| 轮次 | 谁修 | 要点 |
|---|---|---|
| 1–3 | **resume 原实现者本人**（保留任务上下文；"It already holds the task context; ownership beats a drive-by patcher"） | 把 findings **逐字**给它；修完**重跑覆盖测试**、把修复报告**追加**到原 report 文件、返回短契约 |
| 4–5 | **新派一个更强模型**的实现者 | 全量任务上下文 + "a prior implementer attempted this N times; you own the task now" |
| 每轮 | 复审 **scoped**（只看修复 diff） | 复审者只判"每条 finding addressed / not addressed"、修复 diff 内的新破坏；**修复未触达代码上的新发现 → 记为 non-blocking 进台账**，不进环 |
| 上限 | **5 轮（"Five rounds maximum per task"）** | 超限后**控制器裁决**：①争议/错误→台账记一行裁决并继续；②真实但不承重→记 known-open 继续；③真实且承重（后续任务依赖/暴露 plan 缺陷）→ **走既有 BLOCKED 停止**。**"Adjudicate only at the cap"**、**"a silent discard is forbidden"**、**"no early exit"** |
| 永远 | Minor findings **从不进环**，随时记台账；与 plan 文本冲突的 finding **立刻交人**（plan 权威，不是环路问题） | — |

**为什么这样设计**（原文）：旧版是 "Repeat until approved" 无上限，每轮全量重审，non-deterministic 的 review 每轮都能挑出新问题 → 观测到无断路器的 implement-review-fix 长环，且**修复轮次是 run-to-run 成本方差的最大来源**。

### 阶段 6：终审（Final Review）
- 输入：`review-package MERGE_BASE..HEAD`（整支）+ plan + spec + 台账里的 Ruling 行 + **Review Focus 原文**。
- 动作：用**最 capable 模型**审；有 subagent 就派，没有才自审并记 `Final review: self-review (no subagent tool)`。
- 修复：**"dispatch ONE fix subagent … not one fixer per finding"**、**"There is no second fix wave"**；每个 finding 先写失败测试 RED → GREEN → 全套绿；Minor 记 `Final: minor (deferred)`。恰好一次 scoped re-review，残余由控制器裁决。
- 门：**"Do not skip it, and do not replace it with your own read of the diff"**。

### 阶段 7：收尾（finishing-a-development-branch）
- **输入**：终审干净的整支分支。
- **动作**：①跑**全套**测试（失败即停）；②探测环境（GIT_DIR/GIT_COMMON/detached）；③**确认 base 分支**（"Merging into the wrong base is expensive to undo"）；④人类选：本地 merge / push+PR / keep as-is（detached 只给后两项）；⑤清理 worktree。
- **门**：**"Tests failing … Must fix before completing"**、**"Confirm before merging"**、**"Never `--force` on your own initiative"**、**"Only the typed word `discard` authorizes deletion"**（discard 不是菜单项，只在人类明确要求时出现，需逐字输入才授权删除）。

### 备选路径：executing-plans（内联，最省）
- 何时用：人类选择内联、或**没有 subagent 工具**（"Never fabricate a dispatch"——不许假装派发过）。
- 成本取舍原文：SDD 每任务付"一个实现者 + 一个审阅者"；内联只付"一个上下文 + 末尾一个审阅者"，放弃每任务新上下文与第二双眼睛，用 **brief / 台账 / TDD / 终审**替代。
- 每任务：`scripts/task-start` 得 brief+BASE → **强制加载 test-driven-development（"REQUIRED SUB-SKILL"）** → 按 RED-GREEN 逐步执行并与 plan 的 `Expected:` 行**逐条比对** → 代码错→`systematic-debugging`；plan 错→写 `Task <N>: Ruling: …`（"Unledgered deviation is a decision made in secret"）→ 按 plan 的 commit 步骤提交 → **四项完成契约**（每个测试存在且读过输出 / 末次测试通过 / 每条 Expected 比对过 / 每个偏离有 Ruling）→ `scripts/task-done` 跑测试（**"A failing run records nothing"**）。
- 只允许在四种情况停：不可逆/破坏性操作、安全敏感动作、worktree 之外的副作用（merge/push/publish）、plan 坏到每步都是猜。

### 并行：dispatching-parallel-agents
- **可并行**：2+ **独立**问题域（不同测试文件/子系统/根因，"No shared state between investigations"），典型 3+ 失败文件。
- **禁止**：失败相关（修一个可能连带修好）、需要看全系统状态、探索式调试（还不知道坏在哪）、共享状态（"editing same files, using same resources"）。
- 切分与约束：按"什么坏了"分组，每代理一个文件/子系统；给具体 scope + **"Don't change other code"** + 期望输出。
- 收集：读每份 summary → **检查是否改了同一处** → 跑全套 → 抽查（"Agents can make systematic errors"）。
- 与 SDD 的分工：SDD 说 **"Never dispatch multiple implementation subagents in parallel"**，本技能只用于**独立失败调查**。

### 贯穿全程的三条"证据门"

1. **TDD 铁律**：`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`；**必须亲眼看到测试失败**（"If you didn't watch the test fail, you don't know if it tests the right thing"）；先写了实现就**删掉重来**（"Delete means delete"，不许留作参考/不许"改造"）；完成前清单：每个函数有测试、看过每个失败、失败原因正确、最小实现、全绿、输出干净、真代码（不得已才 mock）、边界与错误覆盖 —— **"Can't check all boxes? You skipped TDD. Start over."**；"Other tests means the project's suite, not just your file"（只跑自己文件不算绿）。
2. **验证门（verification-before-completion）**：`NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`；**Gate Function**：①确定"什么命令能证明"→②跑**完整**命令（新鲜、全量）→③读完整输出/退出码/失败数→④对照结论→⑤才允许宣告；**"Skip any step = lying, not verifying"**。典型对照：测试通过=有 0 失败的**本次输出**（不是"上次跑过/应该会过"）；bug 修好=**原症状的测试通过**；回归测试=**red-green 反向验证**（写测试→跑过→**撤销修复→必须失败**→恢复→跑过）；**"Agent reports success → Check VCS diff → Verify changes → Report actual state"**（不信任子代理自述）。
3. **调试四阶段（systematic-debugging）**：`NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST`；①根因调查（读错误全文/稳定复现/查最近变更/多组件系统**先加诊断埋点采集证据**/沿调用栈向上追数据流）→②模式分析（找同类可用实现、**完整**读参考实现、列出每一处差异）→③假设与最小验证（**一次只改一个变量**）→④修复（**先写失败测试**再改，一次一个修复）→**若 3 次修复都失败：停下来质疑架构**（"Each fix reveals new problem in different place" → 这是架构错，不是假设错，须与人讨论）。附带三招：`root-cause-tracing`、`defense-in-depth`、`condition-based-waiting`。

---

## 2.5 writing-skills：技能本身也是"被测的代码"（**对我们的技能注入设计最关键**）

> 来源：`skills/writing-skills/SKILL.md` + `references/{discovery,testing-skills-with-subagents,bulletproofing}.md` `[原文·子研究]`

### 2.5.1 结构规则（可直接当规范用）

- frontmatter：仅 `name` + `description` 必填，**整块 ≤1024 字符**；`name` 只用字母/数字/连字符。
- **`description` 的写法（核心洞见）**：第三人称、**以 `Use when…` 开头**、≤500 字符、**绝对不要概括技能的流程**。
  - 实测理由原文：描述里写 "code review between tasks" 会让 agent 只做一次 review；改成纯触发条件后才会读正文的两段式流程 —— **"Descriptions that summarize workflow create a shortcut agents will take."**
  - 推论（对我们）：**嵌套时父代理传给子代理的"任务摘要"同样会替代正文**。所以子代理的入口信息必须是"触发条件 + 文件路径 + 契约"，而不是流程摘要。
- 正文分层：Overview（1–2 句核心原则）→ When to Use（症状 bullet + 何时**不**用）→ Core Pattern（before/after）→ Quick Reference（表）→ Implementation（内联或链文件）→ Common Mistakes →（可选）Real-World Impact。
- 分层/外置：100+ 行重引用或可复用脚本才外置到 `references/`；原则与 <50 行代码内联；命名用动宾/-ing（`condition-based-waiting` 而非 `async-test-helpers`）。
- 词预算：入门 <150 / 常载 <200 / 其他 <500 words；机器门禁 **20,000 字节/技能**。
- 跨技能引用只写技能名 + `**REQUIRED SUB-SKILL:**` / `**REQUIRED BACKGROUND:**`；**禁止 `@` 链接**（会 force-load，实测 "consuming 200k+ context"）。

### 2.5.2 如何"测"一个技能（RED-GREEN-REFACTOR 用于提示词）

- 铁律：`NO SKILL WITHOUT A FAILING TEST FIRST`，且**对已有技能的编辑同样适用**（改一个 section 也要先有失败基线）。
- RED：**不带技能**跑压力场景子代理，逐字记录它编的借口；GREEN：只为这些失败写**最小**技能条款；REFACTOR：补漏再测。
- 场景设计：`3+ combined pressures`（时间/沉没成本/权威/经济/疲惫/社交/务实）、A/B/C 强制选择、真实路径、以 `"What do you do?"` 收尾；学术式提问无效（"Too academic. Agent just recites the skill."）。
- 措辞微测：每次新上下文、**必须有"无指引"对照组**（对照不复现失败 → 说明没问题可修）、`5+ reps`、逐条人工读命中、把方差当指标。
- bulletproof 判据：最大压力下选对 + 能引用具体章节 + meta 问"技能是否清晰、该不该遵循"。
- 已知战绩：TDD 技能经 6 轮 RED-GREEN-REFACTOR、10+ 条互不重复的合理化借口才收敛。

### 2.5.3 失败形态决定措辞形态（**反直觉、很实用**）

- **Match the Form to the Failure**：
  - 压力下违规 → 禁令 + 理性化表 + Red Flags；
  - **形状错（模型理解错任务形状）→ 改成正向配方/契约**（实测：同一位置的禁令组比无指引对照组更差）；
  - 漏元素 → 用 `REQUIRED` 槽位；
  - 条件行为 → 可观测谓词 + 条件式。
- **No nuance clauses**：禁止 "unless it matters" 之类的模糊口子（会让 agent 重开谈判）；豁免条款必须能界定范围。
- 元规则 `Violating the letter of the rules is violating the spirit`："cuts off entire class of 'I'm following the spirit' rationalizations"。

### 2.5.4 对我们的直接结论

1. 技能/阶段规则要**分层**：常驻引导（bootstrap，极短）+ 阶段技能（`Use when…` 触发）+ `references/`（按需）。
2. 每条规则都要有**体积预算与机器门禁**，否则长会话压缩后规则会静默丢失。
3. 改门禁文本必须走"失败基线 → 最小修改 → 复测"；否则是审美改动。
4. 父→子 handoff 只传**触发条件 + 路径 + 契约**，不传流程摘要（否则子代理会拿摘要替代正文）。

---

## 3. 它如何约束 AI（可复用的"软门禁"装置）

| 装置 | 形态 | 原文样例 | 为什么有效 |
|---|---|---|---|
| **Iron Law 大写块** | 代码块三行 | `NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST` | 不可解释的硬规则，减少谈判空间 |
| **HARD-GATE / EXTREMELY-IMPORTANT** | XML 风格标签 | `<HARD-GATE>Nothing gets built until … approves the design doc` | 标签本身给模型"这是高权重"的信号 |
| **1% 规则** | 量化门槛 | "1% chance … you ABSOLUTELY MUST invoke"；"YOU DO NOT HAVE A CHOICE" | 堵住"这个不需要技能"的滑坡 |
| **合理化借口表** | 两列表 `| Excuse | Reality |` | 提前命名模型最常用的 12–15 种借口并逐条驳回；SDD 的设计文档明确把它当"格式统一"的治理对象 |
| **Red Flags 清单** | "出现这些念头=STOP" | "Test passes immediately" / "One more fix attempt (after 2+)" / "I'll test after" | 把"自我察觉"变成可枚举的触发词 |
| **精神条款** | 一句元规则 | "Violating the letter of the rules is violating the spirit" | 堵住"我遵守了字面"的辩解 |
| **checklist + todo 映射** | 勾选框 | TDD 完成清单 8 条；`if it has a checklist, create a todo per item` | 把流程变成可清点的状态 |
| **停止条件枚举** | 显式清单 | 内联执行只有四种情况可停；调试 3 次失败即停 | 防止"停不停"自由裁量 |
| **人机优先级声明** | 一句 | 用户指令 > 技能 > 默认 | 避免技能压过用户意图 |

**局限**：以上全部是**提示词层**约束，没有运行时状态机；DSH 那套"事件日志 + 门禁 + 不可伪造的证据"在这里**不存在**（见 §4.2）。

---

## 4. 对"Spec 驱动执行 + 动态嵌套"的借鉴点

### 4.1 值得借（按投入产出排序）

| # | 机制 | 为什么值得 | 落到我们的 SDD |
|---|---|---|---|
| 1 | **spec 是权威、plan 是论证**，且 plan 头部强制 `**Spec:**` 回链 | 一句话把"需求漂移"和"计划自嗨"都钉死；后续所有审查可回溯到同一权威 | 阶段模型里把 `SPEC` 设为不可变根，`PLAN` 只引用不复制；每次派发都带 spec 路径 |
| 2 | **三文件交接协议**：brief / report / review-package（各自一个路径，父代理只传路径不传正文） | 这是**动态嵌套不炸上下文**的关键机制；原文有反例："真实会话 42k 字符 99% 是粘贴历史" | 子代理上下文只由文件构成；父代理上下文只留摘要 + 路径 + verdict |
| 3 | **双裁决任务门禁**（Spec Compliance × Code Quality，缺一不合格；实现者自审**永不可替代**任务审查） | 把"符合规格"与"写得好"解耦，防止质量评审吞掉规格偏差 | 每个 task 的 `done` 定义为两个独立 verdict 都通过 |
| 4 | **修复环的收敛设计**：≤5 轮、1–3 轮 resume 原实现者、4–5 轮换更强模型、每轮 **scoped re-review**、超限由控制器裁决并记账、无静默丢弃、无提前退出、终审只允许一波修复 | 给递归修复**硬预算**，防止嵌套代理无限增殖与成本爆炸（原文实测修复轮次是成本方差最大来源） | 修复环作为状态机：`FIX_ROUND(n)` → `ADJUDICATE` → `BLOCKED`/`LEDGER_CONTINUE` |
| 5 | **审查者能力被写死**：只读 diff 文件、不跑 git、不复跑套件、不爬代码库、只报列名风险 | 让每层评审成本可预测、可并行、可预算化 —— 这是嵌套能规模化的前提 | 审查子代理的 prompt 模板里放"禁止清单"，并禁止它再派子代理 |
| 6 | **子代理不得再派子代理** + **实现禁并行 / 调查可并行** | 用两条硬规则把"嵌套深度"与"并发形状"固定住，避免指数爆炸与写冲突 | 嵌套策略：`maxDepth=1`（或显式申请）、并行仅用于**无共享状态**的调查 |
| 7 | **plan-scoped workspace**（`.superpowers/sdd/<plan-slug>/` + 自忽略 gitignore + 台账首行自称 plan + 收尾删除） | 用**结构身份**而不是"记得清理"解决跨计划污染（原文记录了 68 个文件混三计划、git 被污染的真实事故） | 我们的工作区同样按 spec/plan 派生目录，并在 spec 完成后销毁 |
| 8 | **台账（ledger）即恢复协议**：完成行带 commits、修复轮带轮次、裁决行带理由与代价、resume 规则明确（首行归属、从缺行处继续、末行是 fix round 则续轮） | 让"断线/压缩后继续"变成**确定算法**，不依赖记忆；"trust the ledger and `git log` over your own recollection" | 我们的长任务恢复直接照抄：断言式台账 + 归属校验 + 从第一处不一致继续 |
| 9 | **证据化完成门**：Gate Function（identify→run full→read→verify→claim）、red-green 反向验证回归测试、不信任子代理自述（查 diff） | 把"做完了"从**叙述**变成**可复查的证据** | 所有 stage 的 exit gate 都要求"命令 + 输出证据"，并记录在台账 |
| 10 | **bootstrap 注入 + 压缩后重注入**（SessionStart matcher `startup\|clear\|compact`） | 技能体系的生命线：不注入就"skills are dead weight"；压缩后重注入防止规则被截断丢失 | 我们对应做法：把"SDD 阶段规则"做成每次会话/每次压缩后重新注入的**常驻段**，而不是一次性的系统提示 |
| 11 | **技能 = 代码 + 双轨质量门**：①仓库内 `tests/`（可执行 shell 结构门禁，含 `test-skill-size.sh` 的 **20,000 字节**单技能体积上限，理由是压缩后技能会被截断）；②行为验证靠**压力场景 + 子代理**（writing-skills 的 RED-GREEN-REFACTOR 应用于技能文本），live eval 实验室 `superpowers-evals`/Quorum 是**外部仓库 clone 进 `evals/`**，不随本仓发布 | 让"改一句提示词"变成可测量的实验；同时用机器门禁卡住"技能越写越长导致压缩后失效"这个真实故障 | 我们的 SDD 提示词/门禁也要有 scenario eval + 体积门禁 |
| 12 | **合理化借口表 + Red Flags** | 成本极低（一张表），对"模型自我说服"有实证效果；仓库把它的格式统一当成治理事项 | 每个阶段配 5–8 行借口表（我们的 agent 也会说"这个不用写测试""先跑起来再说"） |

### 4.2 我们要补的（Superpowers 没有、而 SDD 必须有）

| 缺口 | Superpowers 现状 | 我们的做法 |
|---|---|---|
| **机器可校验的阶段状态** | 仅靠 prompt；阶段推进靠 agent 自觉 | 阶段状态机 + 产物 schema 校验（spec/plan/brief/report/review 各自有必需字段，缺字段直接拒绝推进） |
| **门禁的"不可伪造性"** | 所有门禁都是文字规则；`verification` 只是要求 agent 自己跑命令 | 门禁绑定**框架执行**的证据（工具调用记录/退出码/测试报告哈希），而不是模型自述 |
| **spec 的版本与变更管理** | 无 spec 版本号；plan 回链到文件 | spec 带版本 + 变更事件；plan 声明所依附的 spec 版本；spec 变更触发 plan 失效检查 |
| **嵌套预算** | 只约束"实现不并行、子代理不再派" | 显式预算：深度、并发、每层 token/时长、每任务修复轮次、每 plan 总预算 |
| **结构化 handoff** | 靠 markdown 文件 + 约定 | handoff 用结构化 JSON（字段受 schema 约束），人读用 markdown 渲染 |
| **并行写冲突** | 只有提示词约束 + 事后"是否改了同一处"检查 | write-scope 声明 + 机器校验（重叠即告警/拒绝） |

### 4.3 对"动态嵌套"的直接映射（建议）

```
SPEC(权威) ──approve──> PLAN(论证) ──per task──> EXEC
   │                      │                       │
   │                      ├─ brief ───────┐       ├─ implementer(child, depth+1, TDD, report 4-state)
   │                      └─ preflight    │       ├─ review-package(diff file only)
   │                                      │       ├─ reviewer(child, read-only, 2 verdicts)
   │                                      │       └─ fix loop(≤5, resume→fresh-strong→adjudicate)
   └─ spec 变更 => plan 失效检查          台账(ledger) = 恢复协议 + 裁决记录
FINAL(whole-branch, 1 fix wave, 1 scoped re-review) ──> CLOSE(tests + base + human choice)
```

- 每一层的**输入只有文件路径 + 角色约束 + 返回契约**，正文不进父上下文（借 #2）。
- 每一层的**输出有固定 schema**（verdict/state/commits），父代理只做路由与记账（借 #3/#8）。
- 嵌套**只能是主 agent → 子 agent 一层**（默认 depth=1）；子代理 prompt 第一段就是"你不得再派子代理"（借 #6）。
- 并行只允许"独立调查"形状，且必须声明 write-scope（借 #6/#9）。

### 4.4 一个附带发现：他们连"agent 贡献 PR"都做了门禁 `[规范 AGENTS.md]`

- 仓库 PR 拒绝率 94%；对 agent 提交的硬性要求：**读完 PR 模板并逐节填写**、**先搜 open+closed 重复 PR**、**必须是人类真实遇到的问题**、**确认改动属于 core**、**披露模型/harness/版本/插件**、**把完整 diff 给人类并获明确同意**、**人类写 summary（≤200 词）**、**必须瞄准 `dev` 分支**。
- 反面清单：第三方依赖、"合规式"重写技能、项目特定配置、修别人 issue、批量 PR、臆测修复、伪造内容、捆绑无关改动。
- 对我们的参照：**"agent 产出"需要披露与人类复核**才能进主干 —— 我们的 SDD 里对应"人审 spec / 人审收尾选择"。

---

## 5. 不该照搬的地方

1. **把一切压进提示词**：Superpowers 的所有门禁都是"模型读了会照做"的软约束；它自己也用 `diagnosing-superpowers` 来事后查"该触发没触发"。**我们要的是框架级状态机 + 证据绑定**，提示词只做行为塑形。
2. **TDD 铁律的全量套用**：`Delete means delete` 对探索型/原型型任务成本极高（该技能自己留了"问人类伙伴"的例外口子）。建议**按阶段分级**：实现阶段强制、探索/spike 阶段允许 `PROTOTYPE` 标记并**禁止合入**。
3. **"重复直到通过"的隐含假设**：这正是他们自己踩过的坑（修复环无上限 → 病态循环），需要**硬预算 + 裁决 + 台账**，而不是更狠的措辞。
4. **文件交接 + git 工作区纪律的隐性成本**：`.superpowers/` 被污染过三次、需要清理 commit；brief/report 文件靠 agent 自律写。我们要把 workspace 放进**框架管理**（自动创建/自动清理/自动 gitignore）。
5. **平台矩阵**：它支持 16 种 harness（Claude Code / Codex / Cursor / Gemini / Kimi / OpenCode / Pi / Qwen / Devin / Factory / Copilot CLI / Grok / Antigravity / Hermes / Muse…），代价是每个宿主一套 bootstrap/工具映射（`TodoWrite→update_plan`、`Task→@mention`、`Skill→use_skill`）。**单宿主自研框架不要抄这个抽象层**。
6. **"human partner" 语气与 94% 拒绝率的社区文化**：那是他们的产品人格与治理手段，不是机制；照抄语气没有收益。
7. **技能数量**：16 个技能叠加 1% 规则，容易触发过度流程（连"简单问题"都要先查技能）。我们的 SDD 应该**只保留阶段级技能**，把细则放进 references 按需加载（他们自己也这么做）。
8. **文档内部不一致**（见 §5.1）说明：**同一套规则在多处重复时必然漂移**。我们要单一权威源 + 生成/校验。

### 5.1 已发现的不一致（照抄前必须定夺）
- README 说"小改动在对话里达成一致即可"，而 `brainstorming` SKILL.md 说小改动也要写短设计文档交用户确认。
- README 说任务 2–5 分钟；`writing-plans` SKILL.md 说任务是**最小可测试单元**。
- README Basic Workflow 把 `test-driven-development` 列为第 5 步，但实际是**贯穿执行**的强制子技能（`executing-plans` 里标 `REQUIRED SUB-SKILL`）。
- `AGENTS.md` 里**没有** `docs/plans` 约定（那是贡献规范），而技能与仓库实际产物用的是 `docs/superpowers/specs` + `docs/plans` 两类路径（历史遗留）。
- **worktrees 的顺序张力**：README 把 `using-git-worktrees` 排在 `writing-plans` **之前**，而 writing-plans 说 worktree 由 worktrees 技能在**执行时**创建；两种读法都自洽，原文未给仲裁句。

---

## 6. 如果要"最小可用"地借鉴（建议落地顺序）

1. **bootstrap 常驻段**：每会话 + 每次压缩后重注入"阶段规则 + 当前阶段 + 下一步门禁"，20 行以内。
2. **spec/plan 两个产物 + 回链**：spec 带状态字段（Draft/Approved），plan 头部 `Spec: <path>@vN`。
3. **单任务闭环**：brief（5 要素）→ implementer（4 态 report）→ review-package（diff 文件）→ 双 verdict → 台账。**先把这条跑通**，再谈并行/嵌套。
4. **证据门**：每个 stage 的 exit 必须绑定"命令 + 输出摘要"，写入台账；完成宣告只能引用本 turn 的证据。
5. **修复环状态机**（≤5 轮 + 裁决 + 不回退的台账），并给它配一个 circuit-breaker 指标（每任务轮次分布）。
6. **嵌套预算**：depth/并发/每层 token/每 plan 总轮次，全部**框架强制**而不是提示词声明。
7. **门禁自身的 eval**：至少 3 个 scenario（该拦住时拦住、该放过时放过、越权时阻断），静态门禁进 CI。

---

## 7. 来源、证据与待核实

### 7.1 关键来源 URL

| 内容 | URL | 级别 |
|---|---|---|
| 官方仓库 README（工作流 1–7、技能清单、哲学、安装矩阵） | <https://github.com/obra/superpowers> · raw: <https://raw.githubusercontent.com/obra/superpowers/main/README.md> | 原文（我读） |
| 引导词/1% 规则/Red Flags 表/优先级 | <https://raw.githubusercontent.com/obra/superpowers/main/skills/using-superpowers/SKILL.md> | 原文（我读） |
| SessionStart 注入（`startup\|clear\|compact`） | <https://raw.githubusercontent.com/obra/superpowers/main/hooks/hooks.json> · <https://raw.githubusercontent.com/obra/superpowers/main/hooks/session-start> | 原文（我读） |
| TDD 铁律/合理化表/完成清单 | <https://raw.githubusercontent.com/obra/superpowers/main/skills/test-driven-development/SKILL.md> | 原文（我读） |
| 调试四阶段/3 次失败即质疑架构 | <https://raw.githubusercontent.com/obra/superpowers/main/skills/systematic-debugging/SKILL.md> | 原文（我读） |
| 验证门 Gate Function | <https://raw.githubusercontent.com/obra/superpowers/main/skills/verification-before-completion/SKILL.md> | 原文（我读） |
| 仓库对 agent PR 的门禁、技能=代码、eval 要求 | <https://raw.githubusercontent.com/obra/superpowers/main/AGENTS.md> | 原文（我读） |
| 测试体系（tests/ 与 evals/） | <https://raw.githubusercontent.com/obra/superpowers/main/docs/testing.md> | 原文（我读） |
| design doc 真实样例（含 Status 字段） | <https://raw.githubusercontent.com/obra/superpowers/main/docs/plans/2025-11-22-opencode-support-design.md> | 原文（我读） |
| SDD 修复环设计（5 轮/裁决/scoped re-review/no early exit） | <https://raw.githubusercontent.com/obra/superpowers/main/docs/superpowers/specs/2026-07-15-sdd-fix-loop-redesign-design.md> | 设计 |
| plan-scoped workspace（结构身份/台账首行/gitignore/收尾删除） | <https://raw.githubusercontent.com/obra/superpowers/main/docs/superpowers/specs/2026-07-06-sdd-plan-scoped-workspace.md> | 设计 |
| brainstorming / writing-plans / using-git-worktrees | `skills/{brainstorming,writing-plans,using-git-worktrees}/SKILL.md`、`skills/brainstorming/builder-check-prompt.md` | 原文（子研究） |
| SDD 主技能 + 提示词模板 + references | `skills/subagent-driven-development/SKILL.md`、`implementer-prompt.md`、`task-reviewer-prompt.md`、`re-review-prompt.md`、`references/{fix-loop,final-review,resuming,handling-reports,preflight}.md` | 原文（子研究） |
| executing-plans / dispatching-parallel-agents / finishing-a-development-branch | `skills/{executing-plans,dispatching-parallel-agents,finishing-a-development-branch}/SKILL.md` | 原文（子研究） |
| requesting-code-review / receiving-code-review / writing-skills | `skills/{requesting-code-review,receiving-code-review,writing-skills}/SKILL.md`、`requesting-code-review/code-reviewer.md`、`writing-skills/references/{discovery,testing-skills-with-subagents,bulletproofing}.md` | 原文（子研究） |
| 技能行为 evals 实验室 | <https://github.com/prime-radiant-inc/superpowers-evals>（clone 进 `evals/`；仓库本身不含） | 二手（未访问该仓库） |

### 7.2 待核实（未读到 / 不确定）

- **脚本实现未读**：`sdd-workspace` / `task-brief` / `review-package` / `task-start` / `task-done`（只见调用契约）。
- **部分 references 未读**：`preflight.md`（只知"跨任务接口冲突扫描 + 结论入台账"）、`batching.md`、`cannot-verify.md`、`writing-skills/references/{anthropic-best-practices,persuasion-principles,flowcharts}.md`。
- **evals 目录内容未读**（scenario 结构、评分细则）；`superpowers-evals` 仓库未访问。
- **TDD 的 commit 时机**：技能未规定（由 verification-before-completion 管 commit 前验证）。
- **`requesting-code-review` 没有实现者自查清单**；"blocking" 字面分级未读到（用 immediately / before proceeding 表达阻断）。
- **finishing-a-development-branch 未要求 lint**；唯一硬门禁是绿色全套 + base 确认。
- **并发上限 / 脚本级 write-scope**：未读到（只到提示词约束 + 事后检查）。
- 版本锚点：抓取时 `main` 分支；仓库活跃开发在 `dev`，两者文本可能不同；`RELEASE-NOTES.md`（120KB）未读。

### 7.3 一句话总结

Superpowers 的**内容**（brainstorm→plan→SDD/TDD→review→finish）值得整体借用；它的**实现方式**（提示词 + 钩子 + 文件交接 + 台账 + eval 驱动的技能治理）是一套成熟的"软流程操作系统"。我们做 SDD 时应该**继承它的产物与门禁语义，替换它的执行层**：把软约束升级为**可校验的阶段状态机 + 证据绑定门禁 + 结构化 handoff + 显式嵌套预算**。

---

## 8. 第二轮原文补记（子研究增量与修正）

> 本节是三个只读子研究返回的原文增量（标 `[原文·子研究]`），用于补全 §2 的分步细节，并**修正**本文早期版本里两处不准确的表述（见 8.7）。

### 8.1 规格阶段（brainstorming）补充

- **先侦察再开口**："Look Before You Ask" / **"Never ask what the project or their context already answers"**；先做**分流判断**：信息齐全（"make the icon cornflower blue"）→ 直接做；否则开始对话。
- **顺序是硬性的**：① 单独一条消息摆方案 → ② 写 design doc → ③ 拿到批准 → ④ 调 writing-plans。
- **提问纪律**：一次一个；**"Ask a question only when the answer would change what gets built"**；**禁止菜单式提问**——"Options steer. Ask them to describe it first."
- **"先不给方案"不是绝对禁令**，但方案必须**单独成消息**："Lay out the approaches first, in a message of their own"（2–3 个真实备选 + 各自取舍 + 推荐一个）。
- **回放机制**：每理解一块就用 200–300 字复述（"about 200-300 words"），"Playback and questions alternate"。
- **Size the Work 分流**：小改动 → "a short one: what you already covered together, written down"；项目 → "the full written design"；半路变大 → **"stop, say so, and step up a size"**。两者**都要写文档**，差别是短/全 + 是否过 builder check。
- **多子系统**：拆成"several independent projects"→ 先定顺序，逐个 brainstorm。
- **design doc 模板必备块**：intent/why、goals / non-goals / anti-goals、constraints、approaches、**"他们定下的 how"**、留给 builder 的部分；硬规则 **"Only what they said goes in as theirs."**（不许把 agent 的建议写成用户决定）。
- **质量闸（项目级）**：派 **fresh subagent** 用 `builder-check-prompt.md` 审文档，**"Don't hand over the document until the check is back"**；结论分三堆：Answered already / Minor / Theirs，**只允许产生一轮问题**。
- **批准门**：**"A design doc you haven't written isn't approved."**；`<HARD-GATE>` 里明确 "Building includes writing product code, scaffolding, installing dependencies"（把"什么算开工"枚举掉，消除边界争议）。
- 例外：用户 opt-out 提问即技能结束；已获同意的 spike 可写，但 **"stays labeled throwaway"**。

### 8.2 规划阶段（writing-plans）补充

- **读者设定**："an engineer who has not seen this codebase or this spec"；只写他无法自己决定的（文件、名字/签名、spec 钉死的值、每个 task 的验证测试）。
- **File Structure 先于 tasks**："This is where decomposition decisions get locked in"（先锁文件边界与职责，按职责拆而不是按技术层拆）。
- **task 粒度定义**："the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate"；只在"reviewer 能否决它而通过邻居"处切分；每 task 以**独立可测交付物**结束。
- **step 粒度**："Each step is one action with a checkable result"（写失败测试 / 跑它确认失败 / 写最小实现 / 跑通过 / commit）。
- **task 必备字段（全量）**：`### Task N`；**Files**（`Create: 精确路径` / `Modify: 精确路径:行区间` / `Test: 精确路径`）；**Interfaces**（`Consumes:` 前序精确签名、`Produces:` 后续依赖的函数名/参数/返回类型——"A task's implementer sees only their own task"）；每步 `- [ ]`；测试步含断言与 spec 精确值；验证步 `Run: <命令>` + `Expected: FAIL|PASS`；实现步给精确签名与钉死的值；提交步 `git add` + `git commit -m`。
- **无独立 DoD 段**，等价物是：**Global Constraints**（每 task 隐式继承）+ **Review Focus**（5 条最可能伤到用户的输入类/失效模式，各配一条测试）+ 每步 `Expected:`。自审第 4 项明说 **"An empty section means you checked"**。
- **plan 自审 5 项**（自己跑，不派 subagent）：spec coverage / step scan / type consistency / review focus / proportion，问题**就地修**。
- **反对什么**：**"A plan is the set of decisions the implementer cannot make alone."** / **"A plan longer than the code it describes has written the code instead."** / 禁用空话 TBD、"handle edge cases"、"add appropriate validation" / **"unambiguous, not complete"**。
- **交接**：保存 + 自审后 **"wait for that review before implementation"**；用户确认后 `REQUIRED SUB-SKILL: subagent-driven-development / executing-plans`。

### 8.3 隔离环境（using-git-worktrees）补充

- **先检测再创建**：Step 0 比较 `GIT_DIR` 与 `GIT_COMMON`；已在 linked worktree 则 **"Do NOT create another worktree"**；**子模块陷阱**：先跑 `git rev-parse --show-superproject-working-tree` 排除。
- **机制优先级**：原生工具（`EnterWorktree` / `/worktree` / `--worktree`）→ 没有才 `git worktree add`；**"Bypassing it is the #1 mistake"**（绕过原生工具会造 "phantom state your harness can't see"）。
- **目录优先级**：指令声明 > 已有 `.worktrees` > `worktrees` > 默认 `.worktrees/`；**唯一 MUST**："MUST verify directory is ignored before creating worktree"（`git check-ignore -q`，否则加 `.gitignore` 并 commit，防"accidentally committing worktree contents"）。
- **干净基线**：装依赖后跑测试；失败 **"Report failures, ask whether to proceed or investigate"**（"proceeding past failures is your human partner's call"）；通过则输出固定报告（`Worktree ready at <path>` / `Tests passing (<N> tests, 0 failures)` / `Ready to implement <feature>`）。
- **降级路径**：`git worktree add` 被沙箱拒绝 → 告知用户，改在当前目录跑 setup 与基线测试（不阻塞）。

### 8.4 SDD 的提示词级约束（"角色能力边界"清单）

- **实现者**：**被要求**跑测试——"run the focused test for what you're changing; run the full suite once before committing, not after every edit"；TDD 是条件式（"Write tests (following TDD if task says to)"），但 report **必须交 TDD Evidence**（RED 命令 + 失败输出 + 为何预期失败；GREEN 命令 + 通过输出）。还可：**先提问**（"Ask them now"）、**可升级**（"It is always OK to stop and say 'this is too hard for me'"）、**禁擅自拆文件**（"don't split files on your own without plan guidance"）、**禁派生**（"never spawn a reviewer to check your work"）、**禁隐瞒不确定**（"Never silently produce work you're unsure about"）。
- **审阅者**：**"Do not Trust the Report"**（把"用 YAGNI 自我辩解"也视为自评）；**"Do not re-run the suite to confirm their report"**（只在具体疑点下跑**单个**聚焦测试，禁 package-wide suite / race detector / 高次数循环）；**"Do not re-run git commands"**（只读 diff 文件）；**"Do not crawl the broader codebase"**（只对可命名的风险做一次聚焦检查）；**严格只读**（"Do not mutate the working tree, the index, HEAD, or branch state in any way"）；**"You Do Not Dispatch Subagents"**（其审批不算数）；证据不可读时报 gap —— **"Evidence you cannot see is not evidence that doesn't exist"**。
- **复审者（scoped）**：只判 findings 与 fix diff；**"'Attempted' is not addressed"**；fix diff 之外的问题进 **Out-of-Scope Observations**（不阻塞、不延长循环）。
- **控制器（父代理）**：选模型并**显式指定**（"Always specify the model explicitly"——省略会继承会话里最贵的模型）；答问；生成 brief/package；记账；裁决。**不做**：不自修（"controller fixes skip review"）、不预判（出现 "do not flag" / "at most Minor" / "the plan chose" 即停）、不要求 reviewer 复跑、不并行派实现、**不粘贴累积历史**（观测：真实派发 42k 字符里 99% 是粘贴历史）、**不丢位置**（重派已完成任务是"观察到的最贵失败"）。

### 8.5 executing-plans / finishing / requesting-code-review 的补充

- **executing-plans 的四项完成契约**（可当 exit gate）：每个测试存在且跑过并读过输出 / 末次测试通过 / 每条 `Expected:` 比对过 / 每个偏离有 `Ruling`。**"A failing run records nothing; the task is not complete."**
- **静默偏离禁令**：**"Unledgered deviation is a decision made in secret."**；且**不逐任务汇报**（"Do not pause to check in"）。
- **终审的分级重判**（重要洞见）：reviewer 的严重度只是**建议**，控制器要按"用户实际得到什么"重建分级——**"a reviewer who set a finding at Minor because the spec was silent has graded the spec, not the effect"**；且 **"There is no second fix pass"**、不派复审。
- **finishing-a-development-branch 的真实门禁**：跑**全套**测试不绿即 **"report the failures and stop"**；探测环境（`GIT_DIR` vs `GIT_COMMON`、detached）；确认 base（"Merging into the wrong base is expensive to undo"）；**菜单只有 3 项**（本地 merge / push+PR / keep），detached 只给 2 项（PR/keep），**discard 不在菜单里**，只在人类明确要求时出现且需**逐字输入 `discard`**；merge 要**先 merge 再验 merged 结果**，失败则停手并保留 worktree+分支；PR **保留 worktree**（"PR feedback gets fixed in that worktree"）；清理只对 `.worktrees/` / `worktrees/` 下的路径（"Everything else belongs to the host"）。
- **requesting-code-review**：分级 `Critical (Must Fix)` / `Important (Should Fix)` / `Minor (Nice to Have)`，处置"立即/推进前/记下"；结论字段 `**Ready to merge?** [Yes|No|With fixes]`；人设是 **"Senior Code Reviewer"**（**不是**"挑剔"，且明说 "Not everything is Critical"）；输出 Strengths → Issues（file:line + 错在哪 + 为何重要 + 怎么修）→ Recommendations → Assessment；两个防漏设计值得抄——**`## Declined to judge`**（裁决前列出所有"判定在 spec 之外而弃权"的行为，**"nothing you set aside is dropped silently"**）与 **"a spec's silence is not permission"**（spec 未写≠允许）；reviewer 同样不得再派子代理。
- **receiving-code-review**：禁止 `"You're absolutely right!"` / `"Great point!"` / **任何感谢表达**；任一反馈不清楚即 **"STOP - do not implement anything yet"**；处理顺序 blocking → simple → complex，逐条测。

### 8.6 几个"看起来像有、其实没有"的项（避免过度归因）

| 事项 | 真相 |
|---|---|
| 仓库内 `evals/` 目录 | **不在仓库内容里**（根目录清单无 `evals/`）；`docs/testing.md` 明确它是把外部 `superpowers-evals` **clone 进 `evals/`** 使用 `[原文·我读]` |
| 仓库内行为 eval 框架 | **没有**；`tests/` 是可执行的 shell 结构/安装门禁（含 `test-skill-size.sh` 的 20,000 字节上限）；行为验证是**人工 + 子代理压力场景**（writing-skills 方法论）`[原文·子研究]` |
| TDD 的 commit 时机 | 该技能**未规定**是否在 RED/GREEN 之间提交；commit 前验证由 `verification-before-completion` 管 |
| lint 门禁 | `finishing-a-development-branch` **未要求** lint；diff 审查发生在终审技能 |
| `requesting-code-review` 的"请求前自查清单" | 该技能**没有**实现者自查清单；它的 "What to Check" 是给 reviewer 的 |
| 并行派发的并发上限 / write-scope 机制 | **未读到**数字上限或脚本级 write-scope；只有提示词约束（"Don't change other code"）+ 事后"是否改了同一处"检查 + 全量跑套 |

### 8.7 对本文早期表述的修正

1. **§4.1 第 11 条（eval）**：早期写"Quorum 驱动真实 CLI 会话、场景 acceptance criteria、静态门禁进 PR"，容易被读成"仓库自带 eval 框架"。修正为：**仓库不自带**；`tests/` 是结构门禁，行为 eval 依赖外部实验室 clone 进 `evals/`（README 与 `docs/testing.md` 都这么写；`docs/superpowers/specs/*eval-results.md` 是结果记录而非框架）。
2. **§5.1 文档不一致**：新增 **worktrees 顺序张力**（README 排在 writing-plans 前，writing-plans 说在执行时创建；未给仲裁句）。引用时应以 **SKILL.md 为准并注明分歧**。

### 8.8 子研究给出的"最该借"清单（与 §4.1 交叉验证后的增补）

1. **门禁写成可判定的布尔条件，并显式枚举"什么算 building"**（写产品代码/脚手架/装依赖/调实现技能）——争议几乎都发生在边界定义上。
2. **`description` 只写触发、不写流程摘要**；父子交接只传"触发 + 路径 + 契约"。
3. **`Declined to judge` 弃权清单 + "spec 沉默≠许可"**：给"没做/漏判"一个显式的账本位，而不是静默消失。
4. **"Attempted is not addressed"** 与 **scoped re-review**：复审只验修复，不重新品味；这是环路收敛的语言级基础。
5. **技能体积的机器门禁（20k 字节）**：嵌套越深、上下文越贵，靠脚本卡体积比靠写作纪律可靠。
