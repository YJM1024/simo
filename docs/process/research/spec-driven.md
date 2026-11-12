# Spec-Driven / AI 开发流程：业界方案调研（给司墨开发框架的依据）

> 调研日期：2026-11-12。方法：`web_search` + `web_fetch` + GitHub REST API（`github_api`）实际查证。
> 标注规则：**[已核验]** = 本次抓取页面/API 返回并据其归纳；**[未验证]** = 仅检索到入口或细节未核验。
> 用途：为司墨「Spec 工件 + 验收断言 + 门禁 + skill 化」提供依据；不堆概念。

## 0. 结论先行（给司墨的推荐形态）

**三层落地**：

1. **工件层（Spec 三件套 + 变更提案）**：借 Kiro 的 `requirements.md / design.md / tasks.md` 三件套 + OpenSpec 的"change（变更提案）"模型，补一个 `proposal.md`（为什么改/影响面）和 `evidence.md`（验证证据指针）。
2. **验收层（断言即规格）**：验收标准用 Given/When/Then 写，且**每条 AC 必须映射到一条可执行断言（司墨 evals case）**——这是"AI 可验证"的关键差异点，否则 spec 只是文档。
3. **过程层（skill 化 + 门禁）**：借 Superpowers 的"skills 即流程"形态，把 propose / spec / implement / verify 写成 4 个 skill；借 Spec Kit 的"模板 + 脚本 + 宪章"思想固化门禁（spec-approved → 实现 → 证据 → 归档）。

一句话：**Kiro 给结构、OpenSpec 给变更模型、Spec Kit 给模板/宪章、Superpowers 给 skill 化执行体，Gherkin/AC 给验收粒度。**

---

## 1. 逐来源评估

### 1.1 OpenSpec（Fission-AI）

- 链接：<https://github.com/Fission-AI/OpenSpec> ；主页 <https://openspec.dev/>
- 作者/组织：Fission-AI（GitHub 组织）
- 许可证：**MIT**（GitHub API `license.spdx_id`）**[已核验]**
- 成熟度：2025-08 创建，2026-11-12 API 查得 stargazers 74,671 / forks 5,118，活跃更新（pushed 2026-11-11）**[已核验（API 数值，本环境返回偏高，仅作活跃度参考）]**
- 定位（官方描述）："Spec-driven development (SDD) for AI coding assistants."；topics: spec-driven-development / spec / context-engineering / prd / sdd **[已核验]**
- 适用场景：希望"规格先行 + 变更可审计"的 AI 编码工作流；需要 proposal/变更记录与存量 spec 分离的团队
- 优点：以"变更（change）"为单位组织 spec，适合持续迭代；对 AI 助手友好（上下文注入 spec）；MIT 可自由借鉴
- 缺点：生态年轻，具体目录/命令约定随版本变化（本调研未逐页核验其 CLI 细节 **[未验证]**）；对单人项目可能偏重
- 对司墨：**采纳"变更提案 + spec 目录"模型**（`proposal → spec delta → tasks → archive`）；**不采纳**其 CLI/命令层实现（我们自研 harness，不引入外部依赖）。

### 1.2 GitHub Spec Kit

- 链接：<https://github.com/github/spec-kit> ；主页 <https://github.github.com/spec-kit/>
- 作者/组织：GitHub（官方）
- 许可证：**MIT**（API）**[已核验]**
- 成熟度：2025-08 创建，2026-11-12 API 查得 stargazers 149,415 / forks 13,423，持续更新 **[已核验（API 数值同上，仅参考）]**
- 定位（官方描述）："Toolkit to help you get started with SDD or any other process!"；topics: spec-driven / prd / spec / copilot **[已核验]**
- 适用场景：团队想把 SDD 落成"模板 + 命令 + 脚本"的标准化工具链（含各 AI 助手的命令适配）
- 优点：官方背书、模板化程度高（宪章/规格/计划/任务模板 + 脚本）；可移植到多种 agent；MIT
- 缺点：模板较多、上手需要流程共识；对极简项目容易过度工程（本调研未逐页核验其模板全文 **[未验证]**）
- 对司墨：**采纳"宪章（constitution）+ 模板 + 脚本门禁"三件**——宪章=项目不可违反原则（如"只改 evals/、不碰 8787"），模板=spec/plan/tasks，脚本=门禁检查；**不采纳**多 agent 命令适配层。

### 1.3 Superpowers（obra）

- 链接：<https://github.com/obra/superpowers>
- 作者/组织：obra（个人/社区）
- 许可证：**MIT**（API）**[已核验]**
- 成熟度：2025-10 创建，2026-11-12 API 查得 stargazers 316,444 / forks 28,155，活跃更新 **[已核验（API 数值同上，仅参考）]**
- 定位（官方描述）："An agentic skills framework & software development methodology that works."；topics 含 skills / subagent-driven-development / brainstorming / sdlc **[已核验]**
- 适用场景：把开发方法论写成**可被 agent 调用的 skill**（触发条件、步骤、检查点），用 skill 而非提示词约束行为
- 优点：skill 化是本项目（DSH）已经在用的形态；方法论可执行、可组合；MIT
- 缺点：社区项目，方法论完整度与稳定性依赖维护者；skill 质量参差（未逐页核验其 skill 清单 **[未验证]**）
- 对司墨：**采纳"流程 skill 化"形态**——把 propose/spec/implement/verify 写成 4 个 skill（带输入/输出/门禁/证据要求）；**不采纳**其具体 skill 内容（避免照抄）。

### 1.4 Kiro Specs（AWS Kiro）

- 链接：<https://kiro.dev/docs/specs/> **[已核验正文]**
- 作者/组织：AWS / Kiro
- 许可证：产品文档为厂商文档，**无开源许可**；仅作方法参考 **[已核验（页面为产品文档）]**
- 成熟度：商业产品文档（IDE/CLI/Web/Mobile 支持矩阵），持续更新
- 关键内容（原文归纳）**[已核验]**：
  - 每个 spec 生成三文件：`requirements.md`（或 `bugfix.md`，用户故事 + 验收标准）、`design.md`（架构、时序图、错误处理、测试策略）、`tasks.md`（可跟踪的离散任务）
  - **三阶段工作流**：Requirements/Bug Analysis → Design → Tasks
  - **并行任务执行**：解析 tasks 依赖形成依赖图，分 wave 执行（同 wave 并发、wave 间串行）
  - Spec 类型：Feature Spec（Requirements-First / Design-First）、Bugfix Spec（current/expected/unchanged behavior）、Quick Spec（自动生成三件、无审批门）
  - 额外能力：Analyze Requirements、Correctness（property-based testing，仅 IDE）
- 适用场景：AI 编码产品的"规格 → 设计 → 任务 → 执行"闭环；需要把任务依赖图落地为并发执行
- 优点：三件套极简且完整（需求/设计/任务）；依赖图 + wave 并发是"可执行 spec"的工程化范例；bugfix spec 的"当前/期望/不变"三态很实用
- 缺点：产品绑定（Kiro）；Quick Spec 无审批门，容易跳过评审；文档未给公开许可证
- 对司墨：**采纳三件套 + wave/依赖图思想 + bugfix 三态**；**不采纳**产品绑定与 Quick Spec 的"无门禁"路径（我们要求 spec 门禁）。

### 1.5 Gherkin / Given-When-Then（Cucumber）

- 链接：<https://cucumber.io/docs/gherkin/reference/> **[检索到，未逐页核验正文]**
- 作者/组织：Cucumber（SmartBear 生态）
- 许可证：文档版权；Gherkin 语法公开、无限制使用 **[未验证条款]**
- 成熟度：BDD 事实标准语法，广泛使用
- 适用场景：把验收标准写成"可读 + 可执行"的场景（Feature/Scenario/Given/When/Then、Background、Scenario Outline）
- 优点：业务与工程共用语言；可作为验收断言的来源（living documentation）
- 缺点：写不好会变成"步骤脚本化"（UI 细节写进场景）；维护成本随场景数上升
- 对司墨：**采纳 GWT 作为 AC 的书写格式**，但**不引入 Cucumber 执行器**——AC 直接映射到 evals case 的 `steps`（step 类型已有的 http/ws/cli/fs 等），避免双套执行器。

### 1.6 Acceptance Criteria / DoR / DoD

- 链接：<https://www.scrum.org/resources/blog/what-difference-between-definition-done-dod-and-definition-ready-dor> **[检索到，未逐页核验]**；AC 与 DoR/DoD 的区别另有 Scrum.org 论坛讨论（同上检索结果）
- 作者/组织：Scrum.org（社区权威）
- 许可证：文章版权；概念通用 **[未验证]**
- 成熟度：成熟（Scrum 社区标准实践）
- 适用场景：把"准备好开工（DoR）"与"算完成（DoD）"变成团队显式清单，避免"看起来做完了"
- 优点：DoR/DoD 是低成本的流程门禁；AC 让"完成"可判定
- 缺点：清单容易形式化（打勾但无证据）；DoD 若不含"证据/验证"就会退化为"代码合并"
- 对司墨：**采纳 DoR/DoD 清单，但强制"证据化"**——DoR 要求 AC 可执行、DoD 要求 evals 断言全绿 + 证据指针；不采纳"团队仪式"部分（单人）。

---

## 2. 横向对比

| 方案 | 形态 | 核心贡献 | 许可证 | 对司墨价值 |
|---|---|---|---|---|
| OpenSpec | CLI + 变更目录 | 变更提案（change）模型、spec 与变更分离 | MIT | 高（变更流程） |
| Spec Kit | 模板 + 脚本 + 宪章 | 标准化模板、门禁脚本化 | MIT | 高（模板/宪章/门禁） |
| Superpowers | skills 集合 | 方法论 skill 化、可被 agent 调用 | MIT | 高（skill 形态） |
| Kiro Specs | 产品内置 | 三件套、依赖图/wave 并发、bugfix 三态 | 产品文档（无开源） | 高（工件结构） |
| Gherkin/GWT | 语法 | AC 的可读可执行格式 | 公开语法 | 中（验收书写） |
| AC/DoR/DoD | 清单 | 开工/完成的显式门禁 | 社区实践 | 中（门禁清单） |

## 3. 对司墨的采纳建议（模板 / 流程 / 门禁）

### 3.1 Spec 目录与模板（每份 ≤2 页）

```
specs/<change-id>/
  proposal.md    # 为什么改：问题、目标、影响面、不做什么（no-gos）、风险四问
  requirements.md# 用户故事 + 验收标准（GWT）+ 非目标
  design.md      # 方案、关键权衡、数据/接口变更、回滚、测试策略
  tasks.md       # 可勾选任务 + 依赖（可映射 wave 并发）
  evidence.md    # 验证证据：evals 结果、截图/日志、未验证项
```

- `proposal.md` 借 OpenSpec 的"变更"模型；`requirements/design/tasks` 借 Kiro 三件套；`evidence.md` 是本项目补的（AI 最容易"宣称完成"，必须有证据文件）。
- 小改动允许合并 proposal+requirements 为一份，但**tasks/evidence 不可省**。

### 3.2 流程（change 生命周期，4 个 skill）

1. `spec-propose` skill：产 proposal（含四风险 + no-gos）
2. `spec-write` skill：产 requirements（GWT）+ design + tasks
3. `spec-implement` skill：按 tasks 执行，逐条勾选；遇设计偏差必须回写 design
4. `spec-verify` skill：跑 evals/断言，产 evidence，标"未验证"

每个 skill 带**门禁**：输入缺失即拒绝执行（fail-closed），而不是"尽力而为"。

### 3.3 门禁（与 evals 打通）

| 门禁 | 判定 | 设备 |
|---|---|---|
| **Spec Ready（DoR）** | proposal 四风险有结论；AC 每条可执行；no-gos 非空 | 由 `spec-verify --dry` 检查模板字段齐全 |
| **Spec Approved** | 至少一次人工/自审 review 记录（决策与理由） | review 记录写入 proposal 末节 |
| **Done（DoD）** | tasks 全勾选；evals 断言全绿；evidence.md 有指针 | 断言与 AC 一一映射，缺映射即红 |
| **Regression** | M1–Mxx 全量 mock + real-smoke | 复用现有 `evals/run.mjs` 与 `real-smoke.ps1` |
| **Archive** | 变更归档；spec 状态更新；遗留"未验证"项登记 | 归档记录 + 未验证清单 |

### 3.4 与现有 evals 的映射规则（关键落地）

- 每条 AC → 至少 1 个 case 或 1 个断言；**没有断言的 AC 视为未验收**（防止"文档完成"）。
- 断言优先"结构断言"（状态/字段/退出码）而非文案；真实模型 smoke 只做结构 + token 预算门禁（已有 3 次中位数口径）。
- 变更（change）合并前必须跑：`evals/run.mjs --only <受影响的 case 前缀>` + 全量回归；结果写进 evidence.md。

### 3.5 不采纳清单

- 不引入 OpenSpec/Spec Kit 的 CLI 与脚本依赖（自研 harness 已够；避免第三方依赖与许可证/升级风险）
- 不引入 Cucumber 执行器（AC 直接映射 evals steps）
- 不照抄 Superpowers 的 skill 文本（只借形态）
- 不做 Kiro 式 Quick Spec 的无门禁路径（必须过 Spec Ready）

## 4. 未验证与风险

- **[未验证]** OpenSpec 的 CLI 命令细节、Spec Kit 模板全文、Superpowers skill 清单、Gherkin 语法细节、Scrum.org DoR/DoD 原文——本调研只据官方描述/入口归纳，未逐页核验。
- GitHub star/fork 数由本环境 `github_api` 返回（数值明显偏高），仅作活跃度参考，不作为成熟度证据；许可证以 API `spdx_id` 为准（三项目均 MIT）**[已核验]**。
- Kiro 为商业产品文档，无开源许可；本调研仅借鉴其工件结构，未复制内容。
- 风险：spec 模板过多会变成文书工作；AC 与断言映射若放松，会退化为"文档验收"。落地时必须守住"无断言不验收"与"evidence 必须存在"两条硬规则。
