# OpenSpec 研究：Spec 管理与 SDD 工作流的可借鉴点

> **用途**：给"每个会话 = 一个需求 = 一个 Spec、可动态嵌套成子 Spec（森林）、推进会话 = 管理/执行/验收 Spec"这个设计提供外部参照。
> **对象**：Fission-AI/OpenSpec（<https://github.com/Fission-AI/OpenSpec>，官网 <https://openspec.dev>，MIT）。截至本文写作时官网标注 **v1.16.0**、GitHub **73.5k stars**、宣称"每 2 秒产生一个新 spec"、"30+ 工具集成"〔官网首页〕。
> **方法**：一手读官方文档站（openspec.dev/docs）+ 直接读仓库里的真实产物（`openspec/config.yaml`、`openspec/specs/**`、`openspec/changes/**` 的提案与 delta、`openspec/work/`、`openspec/initiatives/`、skill/模板文件）。**本报告区分四类标记**：

| 标记 | 含义 |
|---|---|
| **〔官方文档〕** | openspec.dev 文档原文（转述，未逐字引全） |
| **〔仓库一手〕** | 我直接读到的仓库文件内容（真实使用产物，比文档更能说明"实际长什么样"） |
| **〔二手〕** | 第三方转述或我未核实原文的部分 |
| **〔推断〕** | 我对"移植到我们设计会怎样"的分析，不是 OpenSpec 的说法 |

---

## 0. 一页结论

1. **OpenSpec 的核心不是"写规格文档"，而是把"一个需求的生命周期"固化成目录结构 + 文件格式 + 可校验的 CLI 动作。** 它只有两个持久概念：**specs（真值）** 和 **changes（进行中）**；所有工作流（explore/propose/apply/archive）都在搬运这两者〔官方文档 + 仓库一手〕。
2. **一句话哲学，和我们的记忆模型同构**：仓库内 `/work` 试验目录的原文是 **"Specs are what is true. Work is what is in motion."**〔仓库一手〕——这几乎就是"长期记忆 = 真值、会话/实例 = 进行中的工作集"的另一种说法。
3. **一个 change = 一个文件夹 = 一份可验收的 Spec**，包含 `proposal.md`（为什么/改什么）、`specs/<capability>/spec.md`（**delta**：只写变化）、`design.md`（怎么做，可选）、`tasks.md`（可勾选清单）〔官方文档〕。
4. **delta 的四类操作（ADDED / MODIFIED / REMOVED / RENAMED）是整个体系最值得抄的东西**：它把"变更"从自由文本变成**可合并、可校验、可归档的操作集**；其中 MODIFIED 强制整块替换、归档时若丢 scenario 直接报错〔官方文档 + 仓库一手〕。
5. **进度没有隐藏状态**：`tasks.md` 的 checkbox 就是唯一进度真源，项目被中断后换一个新会话，agent 从第一个未勾选项继续〔官方文档〕。这条对我们"多实例接续/暂停恢复"价值极高。
6. **流程写在 CLI 里，不写在提示词里**：agent 每个动作先调 `openspec instructions <artifact>`，CLI 把"内置 instruction + 模板 + 项目 `config.yaml` 的 context/rules"组装成一个 prompt 返回〔官方文档〕。这是他们能把"同一套流程"塞进 30+ 个 AI 工具的唯一办法，也是我们可以直接借的"规格编译器"思路。
7. **校验机制非常工程化**：`openspec validate` 有 error/warning/strict 三级、带"怎么修"的修复建议、结构化 JSON 输出、明确的歧义处理；连"scenario 必须用 4 个 `#`，用 3 个会**静默失败**"这种坑都写进了文档〔官方文档 + 仓库一手〕。
8. **它没有并发模型**：OpenSpec 假设"一个人/一个 agent、串行改文件、用 git 提交"。我们的 10 并发实例共享记忆**不能照搬它的写入模型**，只能借它的"文件格式 + 生命周期语义 + 校验规则"〔推断〕。
9. **它试过"嵌套"（initiative → work-items、context store → collection → workspace），然后主动收缩了**：仓库里这些目录被标注为 "beta history / 实验"，其 goal.md 明确写 "avoid reviving context stores or workspaces as primary product nouns"〔仓库一手〕。**这对我们"森林"设计是最有价值的警告：层级要先做成数据关系，不要先做成用户可见名词。**
10. **它现在用来组织嵌套工作的最小可用模型**是实验目录 `/work`：`goal.md → roadmap.md → slices/<id>/{spec,plan,result,log}.md`，并且**明确要求"一个 slice 需要走可执行生命周期时，把它投影成一个普通的 `openspec/changes/<id>/`"**〔仓库一手〕——"**组织上嵌套、执行上平铺**"，这就是我建议我们抄的姿势。

---

## 1. 它解决什么问题、核心概念与文件格式

### 1.1 问题陈述（原文口径）

- 官方 README：*"AI coding assistants are powerful but unpredictable when requirements live only in chat history. OpenSpec adds a lightweight spec layer so you agree on what to build before any code is written."*〔官方文档〕
- 哲学五条：**fluid not rigid / iterative not waterfall / easy not complex / built for brownfield not just greenfield / scalable**〔官方文档〕。
- 竞品定位：对比 GitHub Spec Kit 说其 "*Thorough but heavyweight. Rigid phase gates, lots of Markdown*"；对比 AWS Kiro 说其 "*locked into their IDE*"〔官方文档〕。→ 它卖的是**轻、可移植、不绑定 IDE**。

### 1.2 词表（照抄即可，[glossary](https://openspec.dev/docs/glossary)）

| 术语 | 定义（官方） |
|---|---|
| **Capability** | 系统的一块行为领域，每个 capability 有且仅有一个主 spec：`openspec/specs/<capability>/spec.md` |
| **Requirement** | 一条必须具备的行为，写作 `### Requirement:`，用 **SHALL** 陈述 |
| **Scenario** | requirement 下的可测例子，`#### Scenario:` + WHEN/THEN |
| **Change proposal（change）** | 一个工作单元：`openspec/changes/<name>/` 下的规划产物集合。**不是 git commit** |
| **Delta spec** | change 里的 spec，**只列变化**：`ADDED/MODIFIED/REMOVED/RENAMED` 四类段 |
| **Main specs** | `openspec/specs/` 树 = 系统"当前已同意的行为"= 真值 |
| **Archive** | 把 change 的 delta 合并进主 spec，并把文件夹移到 `changes/archive/` |
| **Sync** | 只把 delta 合并进主 spec，不归档（允许"先同步后归档"分离） |
| **Verify** | 归档前检查"实现是否符合计划"（report-only） |
| **Schema** | 定义"一个 change 产出哪些 artifact、什么顺序"，**不是 JSON Schema** |
| **Store** | 独立成一个 repo 的规划库（beta），供多个代码仓库共享 |
| **OpenSpec root** | 命令实际操作的 `openspec/` 树：本仓库的、或某个 store 的 |

### 1.3 目录布局

**默认（repo-local）**〔官方文档 + 仓库一手〕：

```
openspec/
├── config.yaml         # 项目上下文 + 规则（喂给 agent 的定制点）
├── specs/              # 主 spec：真值（每个 capability 一个目录）
│   └── <capability-path>/spec.md
└── changes/            # 进行中的 change
    ├── <change-id>/    # 一份 change
    │   ├── .openspec.yaml      # 该 change 的元数据（schema、created、skip_specs…）
    │   ├── proposal.md
    │   ├── specs/<capability-path>/spec.md   # delta（可多个 capability）
    │   ├── design.md  (可选)
    │   └── tasks.md
    └── archive/
        └── YYYY-MM-DD-<change-id>/            # 归档后整包搬入
```

**扩展位（都是可选/实验）**：`openspec/schemas/`（项目级自定义 schema）、`openspec/store`（独立规划仓库，beta）、`openspec/work/`（实验性的嵌套工作模型）、`openspec/initiatives/`（已废弃的 beta 概念，见 §4.3）。

**工具侧**：`init` 还会往 `.agents/skills/`、`.claude/skills|commands/` 等写 6 个 skill + 6 个 command〔官方文档〕。

### 1.4 四种 artifact 与依赖顺序

来源：[spec-driven schema](https://openspec.dev/docs/schemas/spec-driven)〔官方文档〕

```
             ┌─ specs ──┐
proposal ────┤          ├── tasks ── apply
             └─ design ─┘
```

| Artifact | 文件 | 作用 | 可否省略 |
|---|---|---|---|
| proposal | `proposal.md` | 为什么做、改什么 | 不可 |
| specs | `specs/<cap>/spec.md`（每 capability 一份） | 行为变化（delta） | 可，需 `.openspec.yaml` 里 `skip_specs: true` 且**确实无行为变化**（validate 会拒绝"零 delta 又没标记"的 change） |
| design | `design.md` | 技术方案 | 可（不满足触发条件时省略） |
| tasks | `tasks.md` | 实现清单 | **apply 的前置**，实际不可省 |

一个真实的 change 目录（仓库里的 `simplify-skill-installation`）就是 `.openspec.yaml + proposal.md + design.md(14KB) + tasks.md(8.8KB) + specs/{cli-init,cli-update,profiles,propose-workflow}/spec.md`〔仓库一手〕。

### 1.5 主 spec 格式（真值长什么样）

真实样例（`openspec/specs/cli-validate/spec.md` 开头）〔仓库一手〕：

```markdown
# cli-validate Specification

## Purpose
Define `openspec validate` behavior for validating changes and specs with actionable
remediation guidance and structured output.

## Requirements

### Requirement: Validation SHALL provide actionable remediation steps
Validation output SHALL include specific guidance to fix each error, ...

#### Scenario: No deltas found in change
- **WHEN** validating a change with zero parsed deltas
- **THEN** show error "No deltas found" with guidance:
  - ...
```

要点〔官方文档〕：
- 主 spec 用 `## Requirements`；**delta 用 `## ADDED Requirements` 等**，两者结构不同。
- 每条 requirement **描述 ≤ 500 字符**（超了是 warning，`--strict` 会挂）。
- **每条 requirement 至少一个 scenario**；scenario 必须 `####`（4 个井号），且必须有 WHEN/GIVEN 触发 + THEN 结果。
- 用 SHALL/MUST 写规范；`should/may` 不被鼓励；非英文 spec 里没有 SHALL/MUST 会出 warning（strict 挂）。
- 主 spec 允许 `### <裸语句>` 形式的 requirement（无 `Requirement:` 前缀），delta 不认。

### 1.6 Delta spec 格式（最值得抄的格式）

模板（真实 `schemas/spec-driven/templates/spec.md` 的 instruction 原文节选）〔官方文档〕：

```markdown
# Spec Delta

## Purpose
<!-- 仅新 capability 写；一段 50+ 字符的用途说明；已有 capability 删掉本节 -->

## ADDED Requirements

### Requirement: <name>
<SHALL 陈述>

#### Scenario: <name>
- **WHEN** <条件>
- **THEN** <结果>
```

四类操作与硬规则〔官方文档〕：

| 操作 | 语义 | 硬规则 |
|---|---|---|
| `## ADDED Requirements` | 新增行为 | 每条要有描述 + 至少一个 scenario |
| `## MODIFIED Requirements` | 改已有行为 | **必须复制整块**（`### Requirement:` 到全部 scenario）再改，header 需与主 spec 完全一致（空白不敏感）；**只写部分内容 = 归档时丢细节** |
| `## REMOVED Requirements` | 废弃行为 | **必须写 `**Reason**:` 和 `**Migration**:`** |
| `## RENAMED Requirements` | 仅改名 | 用 `FROM:` / `TO:` 格式；不触发 SHALL 检查 |

真实 delta 样例（`changes/simplify-skill-installation/specs/propose-workflow/spec.md`）〔仓库一手〕：

```markdown
## Purpose
The propose workflow SHALL combine change creation and artifact generation ...

## ADDED Requirements

### Requirement: Propose workflow creation
The system SHALL provide a `propose` workflow that creates a change and generates
all artifacts in one step.

#### Scenario: Basic propose invocation
- **WHEN** user invokes `/opsx:propose "add user authentication"`
- **THEN** the system SHALL create a change directory with kebab-case name
- **THEN** the system SHALL create `.openspec.yaml` ...
```

**门禁**：delta 只能放在 `specs/<capability>/spec.md` 里；写成 `specs/<cap>.md` 时 validate/archive 会直接拒绝，因为 archive 永远不会合并它〔官方文档〕。这条对我们"条目写在哪个作用域"是直接可以照搬的硬约束设计。

### 1.7 change 元数据 `.openspec.yaml`

```yaml
schema: spec-driven      # 该 change 用的 schema（创建时钉住，后续换项目 schema 也不变）
created: <date>
skip_specs: true         # 仅当确实无 spec 级行为变化（纯重构/工具/文档）
```

〔官方文档：`skip_specs` 用于"零 delta"的合法化；validate 拒绝既无 capability 又无该标记的 change。〕

### 1.8 `config.yaml`：项目的"提示词注入点"

真实样例（OpenSpec 自己的仓库）〔仓库一手，节选〕：

```yaml
schema: spec-driven

context: |
  Tech stack: TypeScript, Node.js (≥22.12.0), ESM modules
  Product language: Write OpenSpec proposals and specs in user-facing product behavior language
  Cross-platform requirements: always use path.join() ...

rules:
  specs:
    - Include scenarios for Windows path handling when dealing with file paths
  tasks:
    - Add Windows CI verification as a task when changes involve file paths
  design:
    - Document any platform-specific behavior or limitations
```

三个字段的**注入范围是精确的**〔官方文档〕：

| 字段 | 作用 | 注入到 |
|---|---|---|
| `context` | 每次都给的背景/约束 | **所有** artifact + `apply` + `archive` |
| `rules` | 只针对某个 artifact 的额外指令（按 artifact id 键控） | **只**该 artifact 的创建 |
| `operations` | 指导 `apply` / `archive` **怎么做**（不是产物内容） | 只这两个动作 |

官方明确："Your config arrives first, then OpenSpec's built-in instruction and template. **Rules add to the built-ins and never replace them**"、"Keep rules short. Everything here lands in the agent's context."

### 1.9 schema 是数据（不是代码）

`schema.yaml` 的 artifact 条目〔官方文档〕：

```yaml
artifacts:
  - id: tasks
    generates: tasks.md
    description: Implementation checklist with trackable tasks
    template: tasks.md
    instruction: |
      ...what the agent is told when creating tasks.md...
    requires:
      - specs
      - design
```

- 查找顺序：**项目 `openspec/schemas/` > 用户级目录 > 包内置**，同名屏蔽（`openspec schema which` 可查）。
- 可 `openspec schema fork spec-driven <name>` 派生，改模板/依赖后用 `openspec schema validate` 校验（能抓出"tasks 依赖了已删除的 design"这类错）。
- **schema 是快照**：`openspec update` 不碰 `openspec/schemas/`；旧 change 保持创建时的 schema〔官方文档〕。

→ 对我们的意义〔推断〕：**"流程/产物结构"可以做成配置数据**（客服流程 vs 研发流程 = 两个 schema），而不是写死在 agent prompt 里。这正是我们"场景包可插拔"的现成参照。

---

## 2. 完整工作流（Explore → Propose → Review → Apply → Archive）

官方把主循环定义为五步，并强调"每个 prompt 都写在 AI chat 里"〔官方文档〕。

### 2.1 五步主循环

| 步 | 谁做 | 输入 | 产出 | 关键约束 |
|---|---|---|---|---|
| **1 Explore** | 人 + agent 对话 | 模糊想法 | **默认不写任何文件**；除非你说"记下来" | "It never writes code. It writes nothing else unless you ask it to"；输出是"更锐利的想法" |
| **2 Propose** | agent | 讨论结果或明确需求 | `changes/<name>/`：proposal + delta specs + design(可选) + tasks | **不写代码**，停在计划 |
| **3 Review** | **人** | 上述文件 | 人工修改（直接编辑文件或让 agent 改） | 建议按 proposal → specs → tasks 顺序读；"the files are the plan" |
| **4 Apply** | agent | change 文件夹 | 代码 + 勾选 tasks | 建议**开新会话**（干净上下文）；中断后重申 apply 会从第一个未勾选项续 |
| **5 Archive** | agent（需确认） | 完成态 change | delta 合并进 `specs/` + 文件夹移到 `changes/archive/YYYY-MM-DD-<name>/` | 未完成时**警告并要求确认**；有未同步 delta 时**询问是否先 sync** |

### 2.2 可选的扩展工作流（12 个 skill 全集）

〔官方文档 [Skills](https://openspec.dev/docs/skills)〕

**Core（默认装 6 个）**：`openspec-explore` / `openspec-propose` / `openspec-apply-change` / `openspec-update-change` / `openspec-sync-specs` / `openspec-archive-change`
**Optional**：`new-change`（空脚手架）/ `continue-change`（一次产一个 artifact）/ `ff-change`（一次产全部）/ `verify-change`（归档前核对）/ `bulk-archive-change`（批量归档）/ `onboard`（带着走一遍）

每个 skill 都有**明确契约**（args / creates / response），例如〔官方文档〕：

| Skill | Creates（写权限边界） | Response（返回契约） |
|---|---|---|
| explore | 默认什么都不写；被要求时可新建/更新 change 的 proposal/design/specs/tasks；**never code** | 开放式对话；成形时总结问题/方案/未决/下一步，并**询问**是否落盘 |
| propose | change 文件夹 + 全部 artifact；**never code** | 产物列表 + 下一步；停在这里等 apply |
| apply | **代码**；并在 change 里把任务 `- [ ]` → `- [x]`（按 `sourcePath` + 行号定位） | 每任务进度 + 总计 N/M；全完成则建议 archive；缺 artifact 则指向 continue/status |
| update-change | 只改已存在 artifact；不新建（除非已有一份的 glob artifact 且你确认） | 逐条展示修订，**你确认后才写**，一次一个 artifact |
| sync-specs | 改/建 `specs/<cap>/spec.md`（把 ADDED/MODIFIED/REMOVED/RENAMED 合进主 spec）；**never code** | 每个 capability 的增/改/删/改名摘要，**且先通过校验** |
| archive-change | 移动文件夹到 archive；**经你同意**先 sync | 最终摘要：name/schema/归档位置/sync 状态/警告 |
| verify-change | **什么都不改**（report-only） | 记分卡：Completeness / Correctness / Coherence + CRITICAL/WARNING/SUGGESTION + "是否可归档"结论 |

**两个设计细节值得单独记**〔官方文档〕：

1. **"没有 OpenSpec root 时怎么办"的分流**：如果 skill 是 agent **自动选中**的（用户没提 OpenSpec），它**直接放弃 OpenSpec、按普通方式回答**；如果是**用户显式点名**（说了 OpenSpec、或敲了命令），它**停下来问**：在这里 `openspec init`？还是指向某个 store？还是不用 OpenSpec？——"**是否该动手**"由"谁发起的"决定，而不是由 agent 猜。
2. **命令与技能双形态**：同一套指令既发成 skill（agent 自己会挑）又发成 slash command（用户可点），并承认"commands 先出现、skill 是新标准、我们最终想退役 commands"〔官方文档〕。

### 2.3 归档到底做了什么

分步（官方 Quickstart 的分步图）〔官方文档〕：

1. 完成态里，delta **还躺在 change 文件夹里**，`specs/` 尚不知道有这个能力；
2. archive 把 delta **合并进主 spec**（新 capability 则**创建**主 spec，并把 delta 的 `## Purpose` 抄进去；没有 Purpose 就写 `TBD ... Update Purpose after archive` 占位）；
3. 整个 change 文件夹移到 `changes/archive/YYYY-MM-DD-<name>/`（已带日期前缀的不重复加）。

**归档后可以裁掉归档里的 `specs/`**（因为已合并进主 spec，git 保留历史），proposal/design/tasks 保留；`openspec validate --archived` 只查任务完成度，不查已应用 delta〔官方文档〕。**OpenSpec 不会自动清理归档，也没有保留策略。**

`bulk-archive` 另有顺序语义：**两个 change 改同一个 spec 时，按最老的先同步**，并会核对代码实际实现了哪个〔官方文档〕。

### 2.4 多仓库：store（beta）

〔官方文档 [Stores](https://openspec.dev/docs/stores)〕规划可以搬到独立 repo：`team-plans/openspec/{specs,changes}`，多个代码仓库共享。产物落点按优先级解析：`--store` 参数 > 本仓库 `openspec/` 有 specs/changes > 项目 `config.yaml` 的 `store:` 行 > 机器级 `defaultStore`。**OpenSpec 从不按名字猜 store**（不同组织可能有同名 repo）。

→ 对我们的映射〔推断〕：我们"领域记忆作用域"和"会话"的关系，很像 store 与 code repo 的关系——**作用域是数据，会话是运行时；一个运行时可以引用多个作用域**。它的 root 解析优先级规则可以直接借来写我们的"记忆作用域解析"。

---

## 3. AI agent 如何读写这些文件（机制层）

### 3.1 一切写入都过 CLI（这是它最重要的架构选择）

〔官方文档 + 仓库一手〕

```
你/agent ──调用 workflow──> agent 执行 `openspec instructions <artifact>`
                                  │
                                  ├─ 读 config.yaml 的 context / rules / operations
                                  ├─ 读 schema.yaml 的 instruction
                                  └─ 读 templates/<artifact>.md
                                  ↓
                        组装成一个带 XML 标签的 prompt
                                  ↓
                        agent 按 prompt 写文件（proposal/delta/design/tasks）
                                  ↓
                  `openspec validate` 结构校验 → `openspec archive` 合并
```

`openspec instructions` 返回的大致形状（官方节选）〔官方文档〕：

```xml
<artifact id="tasks" change="add-dark-mode" schema="spec-driven">
  <project_context> ...来自 config.yaml: context... </project_context>
  <rules> - End every task with a commit </rules>
  <instruction> ...OpenSpec 内置的"如何写好 tasks.md"... </instruction>
  <template> ...tasks.md 的结构骨架... </template>
</artifact>
```

**为什么这招有效**〔推断〕：流程知识（怎么写、按什么顺序、哪些字段必填）从 30+ 个 agent 的提示词里**收敛到一处**，升级时只需 `openspec update` 重刷文件；而且"结构约束"和"项目定制"被分层注入，互不覆盖。对我们来说，这等价于：**会话的 system prompt 由"记忆 + 当前 Spec + 项目/领域规则"编译生成，而不是前端硬编码**。

### 3.2 状态是算出来的，不是存出来的

- `openspec status`：artifact 完成度（0/N 到 N/N），依据是**文件是否存在 + tasks 勾选**〔官方文档〕。
- `openspec list`：列出进行中 change 或 `--specs` 列 capability 清单（**默认列 change，不是 spec**；官方提示里反复强调这个坑）〔官方文档〕。
- `openspec show <id> --json [--no-scenarios]`：给 agent 的**低成本读接口**——`--no-scenarios` 只返回 purpose + requirement 文本，避免把整份 spec 灌进上下文〔官方文档〕。

→ 对我们的映射〔推断〕：**"会话状态"应该从产物算，而不是存在数据库字段里自己维护**；否则多实例/断线重连必然不一致。我们已有 append-only 状态日志，这里可以补一条"状态投影 = 纯函数(产物)"。

### 3.3 任务清单的写法（可直接抄）

真实模板 `schemas/spec-driven/templates/tasks.md`〔仓库一手〕：

```markdown
# Tasks

## 1. <!-- Task Group Name -->

- [ ] 1.1 <!-- Task description -->
- [ ] 1.2 <!-- Task description -->

## 2. <!-- Task Group Name -->

- [ ] 2.1 <!-- Task description -->
```

真实产物里会是 `## 1. Global Config Extension` + `- [x] 1.1 Extend ... schema with ...` 这种 13 组、80+ 项的清单〔仓库一手〕。**粒度细到"一个文件/一个函数/一条测试"**，因此 check 起来无歧义，也方便"被打断后精确续跑"。

### 3.4 人机分工的默认值

官方快速上手的默认姿态是"**人改计划、agent 改代码**"：review 阶段建议你直接编辑 markdown（"the artifacts are plain markdown, and the files are the plan"）；apply 建议**新开会话**、保持"context hygiene"；模型建议用高推理档〔官方文档〕。→ 这套默认假设**人一直在环、单会话单任务、上下文干净**，正是我们要改造的地方（见 §4.4 第 4 条）。

---

## 4. 对"一会话=一 Spec、动态嵌套、森林"的借鉴点

### 4.1 先做术语映射（这是最省事的一步）

| 我们的概念 | OpenSpec 对应物 | 关系说明 |
|---|---|---|
| 会话（一个需求） | **change proposal**（`openspec/changes/<id>/`） | 一个可归档的工作单元，**不是** capability |
| 长期/领域记忆 | **main specs**（`openspec/specs/<capability>/spec.md`） | 真值；由 archive 合并而来 |
| 实例的私有工作集 | change 文件夹里未归档的草稿（proposal/design/tasks 的修改） | 未进主 spec 前都在"进行中"区 |
| 会话结束的总结回写 | **archive（merge delta → main spec）** | 他们叫同步，我们叫写回 |
| 汇总/handoff | `result.md`（`/work` 实验里的产物）+ `tasks.md` 勾选态 | 记录"发生了什么 + 证据" |
| 验收 | **verify**（report-only 记分卡）+ archive 前的门禁 | 我们需要的"验收 Spec" |
| 领域/场景（客服 vs 研发） | **schema**（`schema.yaml` + templates） | 可插拔的流程定义 |
| 记忆作用域 | **OpenSpec root / store** | 数据归属，与会话解耦 |

**结论**：我们不需要发明新名词。**"一个会话 = 一个 change，一个领域 = 一组 capability spec，会话树 = change/goal 的组织关系"**，语义就对齐了〔推断〕。

### 4.2 直接可借的 12 个机制（按性价比排序）

| # | 机制 | 原文依据 | 在我们设计里怎么落 |
|---|---|---|---|
| B1 | **真值 vs 进行中 两分** | `/work` 原文："Specs are what is true. Work is what is in motion."〔仓库一手〕 | 公共记忆（active）= 真值；会话/Spec 草稿 = in motion；两者物理分区 |
| B2 | **change 文件夹作为会话的最小实体** | `changes/<id>/{proposal,specs,design,tasks}`〔官方文档〕 | 会话落盘成目录；文件的增删即会话进度 |
| B3 | **delta 四操作** | ADDED/MODIFIED/REMOVED/RENAMED + 硬规则〔官方文档〕 | 写回公共记忆的操作集：ADDED=新条目；MODIFIED=整条替换（防丢字段）；REMOVED=带 Reason+Migration 的废弃；RENAMED=只改名 |
| B4 | **MODIFIED 必须整块 + 丢 scenario 报错** | validate 会逐个比对 MODIFIED 与主 spec，**报出被丢掉的 scenario**〔仓库一手 cli-validate spec〕 | 我们合并记忆时同理：**不允许静默丢字段/证据**，丢就报冲突 |
| B5 | **tasks.md checkbox = 唯一进度真源** | "Progress lives in the tasks.md checkboxes. There is no hidden state."〔官方文档〕 | 会话进度/暂停恢复/多实例接续都靠它；不引入"会话状态字段"作为第二真相 |
| B6 | **每个动作有契约（args/creates/response）** | skills 表〔官方文档〕 | 定义"允许写哪一层"：会话 agent 只能写 change 目录，不能直接改主 spec |
| B7 | **流程由 CLI 编译成 prompt** | `openspec instructions` + config 注入顺序〔官方文档〕 | 会话 system prompt = compile(记忆快照 + 当前 Spec + 领域规则) |
| B8 | **可修复的校验** | 每条错误带"预期结构/示例头/建议命令"；JSON 输出带 `path`；invalid 时附 Next steps〔仓库一手〕 | 我们的 Spec 校验器也要"报错即给修法"，否则 agent 会乱改 |
| B9 | **error / warning / strict 三级** | 普通 validate 放过 warning，`--strict` 把 warning 当失败〔官方文档〕 | 对应"软约束/硬约束/发布前严检"；别做成一刀切失败 |
| B10 | **explore 默认不落盘** | "writes nothing else unless you ask it to"〔官方文档〕 | 秘书"先讨论、后成文"；落盘是显式动作（也避免污染记忆） |
| B11 | **schema 是数据、可 fork、三级查找** | schema.yaml + `schema fork/validate`〔官方文档〕 | 场景包（客服/研发/运维）用 schema 表达，不改内核 |
| B12 | **归档前 verify 的记分卡** | Completeness / Correctness / Coherence + CRITICAL/WARNING/SUGGESTION + archive-readiness〔官方文档〕 | 直接当我们的"验收 Spec"报告格式；verify 只读，不改状态 |

### 4.3 "动态嵌套"：OpenSpec 已经替我们交过学费

这条最重要，单列。

**它试过的嵌套模型（已废弃，但仓库里还在）**〔仓库一手〕：

```
openspec/initiatives/<initiative-id>/
├── .initiative.yaml    # version/id/title/status/summary/owners/artifacts/linked_changes/links
├── README.md
├── direction.md        # 方向
├── roadmap.md          # 29KB 的路线图
├── tasks.md            # initiative 级任务
├── decisions.md        # 决策
├── questions.md        # 未决问题
└── work-items/<NN-slug>/   # 子工作项
    ├── plan.md         # 目标/方向/保留/过渡/推迟/取代/要读的文件/不要碰的文件/完成条件
    ├── tasks.md
    └── evidence.md
```

`.initiative.yaml` 里甚至有**跨层级的关系声明**：

```yaml
status: exploring
linked_changes:
  - change: workspace-reimplementation-roadmap
    relationship: informs
  - change: workspace-agent-guidance
    relationship: reframes
```

**但它的 README 自己写着**：*"This folder preserves the beta context-store and workspace direction ... It is not the active product roadmap or implementation queue."*，并给出取代它的两层模型：*"Specs are what is true. Work is what is in motion."*〔仓库一手〕。它的 `goal.md` 更直接列出约束：**"Avoid reviving context stores or workspaces as primary product nouns."**、**"Avoid global `decisions.md` and `questions.md` files as the default planning shape."**、*"Treat this `/work` folder as an experiment ... not as the implemented product model."*〔仓库一手〕

**它现在保留的实验模型（更接近我们想要的"森林"）**〔仓库一手，`openspec/work/README.md`〕：

```
goal -> roadmap -> slice -> result

openspec/work/<work-id>/
├── goal.md       # 目的地：要变成什么为真、为什么
├── roadmap.md    # 通往目标的当前路径（预期会变，不是承诺）
└── slices/<slice-id>/
    ├── spec.md   # 这一小块"必须为真"的东西
    ├── plan.md   # 打算怎么实现和验证
    ├── result.md # 实际发生了什么 + 证据（通过/失败/待跟进）
    └── log.md    # 可选：重要转折的简短说明
```

还给了**修订规则表**（直接可抄）〔仓库一手〕：

| 变化类型 | 改哪个文件 |
|---|---|
| 这一块的**期望结果**变了 | 改 `spec.md` |
| 实现路径变了、结果不变 | 改 `plan.md` |
| 实现或验证发生了 | 建/改 `result.md`（它不是"当前意图"的真相源） |
| 有难以从最终文件理解的转向 | 加 `log.md` |
| 新工作能被独立接受/排期/验证/发布 | **新开一个 slice** |

以及最关键的兼容声明：*"When a slice needs today's executable OpenSpec lifecycle, project that slice into a normal `openspec/changes/<id>/` artifact until `/work` has first-class CLI support."*〔仓库一手〕

**我的结论〔推断〕**：

1. **"会话树 = Spec 树"这个直觉，OpenSpec 也走过，然后改成了"组织上嵌套、执行上平铺"**：`goal → slices` 负责表达层级（森林），`changes/` 负责可执行生命周期（线性、可归档）。**嵌套是组织关系，不是格式嵌套。**
2. 不要做"spec 里嵌 spec"（父子 delta 相互引用的格式）。要做 **`parentId` + 归属 + 依赖边**：
   - `goalId`（顶层需求/目标）
   - `parentChangeId`（谁拆出来的）
   - `linkedChanges[{id, relationship}]`（`informs` / `reframes` / `depends-on` / `supersedes`）——这个枚举直接抄 `.initiative.yaml`
3. **forest 的正确形状**：capability spec 是**常青树**（持久、被合并）；conversation/change 是**季生林**（临时、会长出新的、会落叶归档）。两者用 `capability` 路径连接，而不是用层级连接。
4. 嵌套的**价值点在"可独立验收的边界"**，不在"层级好看"。`/work` 的判据最实用：**"新工作能不能被独立接受/排期/验证/发布"——能，就是一个新 slice（=子 Spec）**。这条可以直接当我们"何时拆子会话"的硬判据。

### 4.4 会话生命周期 ↔ Spec 生命周期（落地映射）

把用户的三句话（管理 Spec / 执行 Spec / 验收 Spec）落到 OpenSpec 的五个动作上〔推断，基于官方文档〕：

| 用户动作 | 会话里的表现 | OpenSpec 动作 | 落盘证据 | 我们的记忆动作 |
|---|---|---|---|---|
| **管理 Spec** | 讨论需求、改目标、拆子任务 | explore → propose → update-change | `proposal.md` / delta / `design.md` / `tasks.md` | 从作用域**读**（快照 + 检索），写私有工作集 |
| **执行 Spec** | agent 干活、报进度 | apply | 代码 + `tasks.md` 勾选 | 不动公共记忆 |
| **验收 Spec** | 核对、打回、定稿 | verify（只读记分卡）→ sync → archive | `result.md` / 主 spec 新版本 / archive 目录 | **候选提交 + 合并写回**，产生新版本 |
| （异常） | 需求变了、计划错了 | update-change；已实现但计划要动 | 改 artifact，tasks 保持 | 不写公共记忆，只标记 `superseded` |
| （异常） | 终止/放弃 | 无官方语义（他的 archive 只处理完成态） | — | 我们需自己补 `abandoned`（带原因）——**这是 OpenSpec 的空白** |

**三个直接可用的子结论**〔推断〕：

- **会话状态机建议 5 态**：`exploring → proposed → applying → verified → archived`，加两个旁路 `updated`（计划返工）、`abandoned`。状态全部由产物推导，不额外存。
- **"拆子会话"的判据**（抄 `/work`）：能独立被接受/验证/发布 → 拆；否则留在父会话当 task。
- **父会话的"汇总"不是拼文本**：父会话读子会话的 `result.md`/`handoff`，把它当作**输入再写自己的 delta**（对应 OpenSpec 的"父 change 改 capability，子 slice 各自归档"）。

---

## 5. 不该照搬的地方（含我们与它的结构性差异）

| # | 不该照搬 | 证据 | 后果 | 我们的替代 |
|---|---|---|---|---|
| N1 | **"文件 + git"式的并发写** | 全流程无非并发原语；冲突靠 git/rebase 和人工〔官方文档+仓库一手〕 | 10 实例并发写同一 change/主 spec 必冲突且静默覆盖 | 单写者合并 + `baseVersion` 乐观并发（记忆研究那份报告的 §6.6） |
| N2 | **archive 就地合并进主 spec** | "Archive ... merge its deltas into the main specs"〔官方文档〕 | 覆盖式更新，丢失"曾经为真"的历史；不可回滚到中间态 | 采用 **invalidate-not-delete**（Graphiti 式）+ 版本化合并，archive 只是"发布"语义 |
| N3 | **严格的 markdown 正则校验** | "Scenarios MUST use exactly 4 hashtags. Using 3 hashtags or bullets will **fail silently**"〔官方文档〕；validate 用大量正则/标题边界规则〔仓库一手〕 | 格式脆弱；"静默失败"对 agent 是毒药；我们的记忆条目不该靠 markdown 标题表达 | 记忆条目 = 结构化数据（JSON/SQLite 行），校验用 schema；markdown 只是**导出视图** |
| N4 | **单会话、干净上下文的人机假设** | apply 建议"start a fresh chat session"；README 强调 context hygiene〔官方文档〕 | 与我们"随时打断、流式、多任务同窗"直接冲突 | 会话可以有多个 Spec 视图；clean context 是**实例级**优化，不是用户约束 |
| N5 | **specs 全量可读的小集合假设** | 读接口是 `list` + `show <id>`，逐个读；没有嵌入/检索/排序打分〔官方文档〕 | capability 数量上千时不可用；每次都要人/agent 选读哪个 | 记忆检索层（相关性+重要性+时近+作用域过滤），spec 只是条目的一种视图 |
| N6 | **没有 provenance / confidence / 权威分级** | 溯源基本只有 git blame + commit〔官方文档〕 | 分不清"用户原话 / 工具验证 / agent 推断"，污染不可控 | 我们已定的来源分级 + 候选制（这条 OpenSpec 帮不上） |
| N7 | **命令 + 技能双份、30+ 工具适配** | "Some tools install in skill form only"、每个工具命令名不同（`/opsx:`、`/opsx-`、`@opsx-`、`$openspec-`）〔官方文档〕 | 巨大维护面；对我们（自有 harness）是纯负担 | 只做一种交付形态（skill/tool），不做跨工具兼容层 |
| N8 | **把层级做成用户可见名词** | initiative / context store / collection / workspace 都试过并被收缩；goal.md 明确"avoid reviving as primary product nouns"〔仓库一手〕 | 用户认知负担 + 实现复杂度；改一次名词全线返工 | 层级只做**数据字段**（parentId/goalId/linked），UI 上仍只呈现"会话"和"Spec" |
| N9 | **全局 `decisions.md` / `questions.md` 作为默认规划形状** | goal.md 的 Constraints 原文〔仓库一手〕 | 变成"另一个 wiki"，与 spec 争夺真相源，很快过期 | 决策/未决作为**记忆条目类型**（带作用域+来源+状态），可被检索/失效 |
| N10 | **只校验结构，不校验意图** | validate 全在查"有没有 delta、格式对不对、scenario 丢没丢"；需求本身写错照样通过〔仓库一手 spec〕 | "格式正确但需求错"会顺利归档进主 spec | 验收必须有 **evidence 契约**（复现/测试/diff/回滚），结构校验只做第一道 |
| N11 | **归档可裁剪（删归档里的 specs/，靠 git 历史）** | Quickstart "Keep or prune archived changes" 原文〔官方文档〕 | 对我们等于"记忆可丢，靠外部历史" | 归档只做软删除，记忆永不物理丢（除非隐私/合规） |
| N12 | **`npm`/Node ≥22.12、kebab-case 路径、英文 RFC 2119 假定** | 安装在 Node 生态；SHALL/MUST 是英文词〔官方文档〕 | 我们是 Go 单体 + 中文语境，直接套会有本地化摩擦 | 只借语义，不借语法；校验词表本地化（"必须/禁止"） |

---

## 6. 我认为最值得借的 5 个点（报告结论）

1. **`change` 文件夹 + `delta` 四操作 = 会话的落盘格式与写回协议**。会话不是聊天记录，而是一个可归档目录；写回公共记忆时用 ADDED/MODIFIED/REMOVED/RENAMED 表达意图，MODIFIED **强制整块替换**、合并时**丢字段即报错**。这是"把 LLM 的非确定总结约束成可合并操作"的最成熟现成格式。〔官方文档 + 仓库一手〕
2. **进度 = tasks.md 勾选，没有隐藏状态**。一句话解决我们"10 实例并发 + 断点续跑 + 交接"的进度一致性问题：谁都能从文件推出"做到哪了"，不依赖任何内存态。〔官方文档〕
3. **`goal → roadmap → slice → result` 的嵌套模型 + "投影成 change"的兼容声明**。它允许"组织上嵌套、执行上平铺"：森林感来自 goal/slice 的归属，可执行性来自平铺的 change。并且给了"何时拆 slice"的硬判据：**能独立被接受/验证/发布**。〔仓库一手〕
4. **`openspec instructions`：把流程编译成 prompt**。内置 instruction + 模板 + 项目 context/rules 分层注入、rules 只加不替、`context` 全局注入而 `rules` 精确到 artifact——这正是我们"会话 system prompt 由记忆+Spec+领域规则编译生成"的实现蓝图。〔官方文档〕
5. **可修复的校验 + 三级严重度 + verify 记分卡**。错误带修法、JSON 带路径、invalid 有 Next steps；verify 输出 Completeness/Correctness/Coherence + CRITICAL/WARNING/SUGGESTION + 是否可归档。可直接当我们"验收 Spec"的报告骨架与门禁分级。〔官方文档 + 仓库一手〕

---

## 7. 如果我们现在动手，最小落地方案（建议稿）

〔推断，供讨论，不是 OpenSpec 原文〕

### 7.1 数据模型（最小字段集）

```
Session(=Spec) {
  id, goalId, parentId, linkIds[{id, relationship}],   // 嵌套:归属+关系,不做格式嵌套
  title, intent,
  status: exploring|proposed|applying|verified|archived|updated|abandoned,
  scopeRefs: [memoryScopeId],          // 引用哪些记忆作用域(可多个,类似 store)
  artifacts: {proposal?, specDeltas[], design?, tasks?, result?},
  baseVersion,                          // 会话开始时钉住的记忆快照
  evidence: [{kind: repro|test|diff|approval, ref}],   // 验收门用
  handoff?: {did, conclusion, artifacts, open, evidence}
}
```

- `artifacts` 的**存在性**决定 status（抄 OpenSpec 的"状态由产物推导"）。
- `specDeltas[]` 用 delta 四操作表达；`tasks[]` 用 `{id, text, done, sourcePath, line}`（抄 apply skill 的定位方式）。
- 私有工作集 = `Session` 内的草稿；公共记忆 = 另一个存储，只能通过"提交候选"写入。

### 7.2 五个动作（对齐 skill 契约）

| 动作 | 写权限 | 返回契约 | 校验 |
|---|---|---|---|
| `explore` | 默认不写 | 总结：问题/方案/未决/下一步 | 无 |
| `propose` | 只写 Session 目录 | 产物清单 + 下一步 | 结构校验（delta 四操作、scenario 数、必填段） |
| `apply` | 写代码 + 勾 tasks | N/M + 阻塞原因 | tasks 与 spec 覆盖检查 |
| `verify` | **只读** | 记分卡 + CRITICAL/WARNING + 可否验收 | evidence 契约（缺项即打回） |
| `archive` | 写公共记忆（候选→合并） | 摘要：改了哪些条目/冲突/版本号 | 合并冲突检测 + 可回滚 |

### 7.3 三个"先不做"

1. **先不做 spec 嵌 spec 的格式**：嵌套 = `goalId/parentId/linked` 字段；格式仍是平铺目录。
2. **先不做多层级用户可见名词**（initiative/workspace 之类）：按 OpenSpec 的教训，先做数据、后做 UI 名词。
3. **先不做跨工具兼容层**：只服务我们自己的 harness，skill 一种形态即可。

---

## 8. 待核实项与来源

### 8.1 待核实（我没有完全验证的部分）

1. **版本与规模数字**：v1.16.0 / 73.5k stars / "每 2 秒一个 spec" 来自官网首页营销文案，未经第三方核实〔二手〕。仓库确实存在且活跃（有 2026 年的 commit 与 v1.16.x release 痕迹）。
2. **`openspec/work/` 是否已进入产品**：仓库 README 自述是"experimental"，CLI 校验/归档**仍只认 `changes/` 和 `specs/`**〔仓库一手〕。我没有找到 `/work` 的官方 CLI 命令，因此按"实验"处理。
3. **initiatives 是否有隐藏的 CLI 支持**：文档站导航里没有 "initiatives"，仓库里只有一个历史 initiative；我按"已废弃 beta"处理，但未查 `src/` 源码确认命令是否被移除。
4. **validate 的完整规则集**：我只读了 `cli-validate` 这一份 spec（已很长），delta 解析器/归档合并器的实现细节未逐行核对。
5. **`verify` 记分卡的 prompt 全文**：只读到 docs 的契约描述（Completeness/Correctness/Coherence），未读 skill 模板原文。
6. **与 Store/Workset 的实际使用体验**：纯文档，无一手实践。

### 8.2 来源清单（分级）

**A. 官方文档（一手）**
1. 官网首页（版本/规模/定位）：<https://openspec.dev/>
2. README（哲学、快速上手、workflow、与 Spec Kit/Kiro 对比）：<https://github.com/Fission-AI/OpenSpec>
3. Quickstart（五步循环、archive 分步、归档裁剪建议）：<https://openspec.dev/docs/quickstart>
4. Set up your project（init 产物、skills/commands 双形态、project.md 迁移）：<https://openspec.dev/docs/setup>
5. spec-driven schema（artifact 顺序、proposal 模板与 instruction、delta 格式与全部硬规则、design/tasks）：<https://openspec.dev/docs/schemas/spec-driven>
6. Project configuration（context/rules/operations 的注入范围与顺序）：<https://openspec.dev/docs/project-config>
7. Schemas（schema.yaml 结构、三级查找、fork/validate、快照语义）：<https://openspec.dev/docs/customize-schemas>
8. Skills（12 个 skill 的 args/creates/response 契约、无 root 时的行为）：<https://openspec.dev/docs/skills>
9. Glossary（术语定义）：<https://openspec.dev/docs/glossary>
10. CLI（init/update/config/list/show/validate/archive/store 等命令表）：<https://openspec.dev/docs/cli>
11. Stores（beta，root 解析优先级、repo-local/store-only/store-optional）：<https://openspec.dev/docs/stores>

**B. 仓库一手文件（真实产物，比文档更硬）**
12. 项目配置：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/config.yaml>
13. 主 spec 样例（含大量校验规则）：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/specs/cli-validate/spec.md>
14. change 样例（proposal）：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/changes/simplify-skill-installation/proposal.md>
15. change 样例（tasks，真实粒度）：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/changes/simplify-skill-installation/tasks.md>
16. delta 样例（ADDED + Purpose）：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/changes/simplify-skill-installation/specs/propose-workflow/spec.md>
17. 模板：<https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/templates/tasks.md>、<https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/templates/design.md>
18. **嵌套实验**：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/work/README.md>、<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/work/AGENTS.md>、<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/work/simplify-context-and-workspace-model/goal.md>
19. **已废弃的嵌套模型**：<https://github.com/Fission-AI/OpenSpec/blob/main/openspec/initiatives/context-store-and-initiatives/.initiative.yaml>、同目录 `README.md`、`work-items/01-lock-the-direction/plan.md`

**C. 背景（未核验原文，仅作进一步阅读）**
20. GitHub Spec Kit（被官方点名为"heavyweight"的对照物）：<https://github.com/github/spec-kit>
21. Kiro（AWS，被点名为"IDE 锁定"的对照物）：<https://kiro.dev>

---

## 附：一句话给设计讨论

> OpenSpec 最值钱的不是它的文档风格，而是它**把"一个需求"建模成一个可校验、可勾选、可归档的目录**，并且用 delta 四操作把"改"变成"可合并的意图"。它替我们验证过的两件事是：**"spec 是真相、work 是运动中"的二分是对的**；**"层级嵌套"如果做成格式会死，做成数据关系 + 平铺执行才能活**。
