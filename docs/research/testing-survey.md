# 测试与验收：可被 AI 编码智能体执行的框架、方法与技能包调研

调研时间为 2026-11-24，范围限定在测试策略、验收方法、自动化工程、质量门禁与智能体技能五类，共 26 个候选。每个候选按主张、产出、适用阶段、对 AI 智能体的可执行性四行记录，来源链接放在候选内与文末清单。公开资料能支撑方法本身的描述，关于智能体独立完成验收的对照实验数据未见公开资料，这一点在文末单列。

可被智能体稳定执行的部分集中在四类：把验收条目写成带观察量的判据，按改动范围选择测试层，用增量覆盖率与抽样变异做门禁，把 TDD 与规格检查压缩成固定动作。最值得吸收的做法是把验收条目拆成脚本判据与人工判据两轨，并给“未验证”单独状态。Cucumber 全套、全库变异门禁、BMAD 整套角色编排不适合直接搬进自建框架。

## 1. 测试策略

### 1.1 测试金字塔

- 主张：测试按粒度分层，底层单元测试数量最多，中层服务或集成测试适量，顶层 UI 与端到端测试数量最少；高层测试越多，反馈越慢、维护成本越高，因此应把大部分断言放在低层（[S1](https://martinfowler.com/articles/practical-test-pyramid.html)）。
- 产出：分层测试清单、各层运行命令、流水线阶段划分与测试归属约定。
- 适用阶段：测试策略与 CI 设计，需求点开工前确定本点需要哪几层。
- 对 AI 智能体的可执行性：高。层级、目录、命令可以写成模板，智能体按改动路径选择要跑的层；代价是前期要梳理仓库结构与测试归属，固定百分比容易僵化。

### 1.2 测试奖杯

- 主张：前端测试按静态检查、单元、集成、端到端四类分配投入，集成测试占最大比重，理由是集成测试更接近用户使用方式，置信度与投入之比更高（[S2](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)）。
- 产出：前端测试配比说明、组件与页面集成测试、少量关键路径端到端测试。
- 适用阶段：前端方案设计与实现，组件契约确定之后。
- 对 AI 智能体的可执行性：中高。组件测试与 Testing Library 查询可以模板化，智能体能从组件契约生成用例；代价是 DOM 测试环境与网络 mock 需要统一，否则用例在不同分支行为不一致。

### 1.3 契约测试

- 主张：消费者以测试形式声明对提供者的请求与响应期望，生成契约文件，提供者用同一份契约验证自身实现，从而在联调前发现接口漂移（[S3](https://docs.pact.io/)）。
- 产出：契约文件、消费者测试、提供者验证报告、契约版本记录。
- 适用阶段：接口契约冻结之后、前后端联调之前，以及提供者每次变更的 CI 阶段。
- 对 AI 智能体的可执行性：高。OpenAPI 文档或示例请求可以转成消费者契约，提供者验证可以脚本化；代价是契约文件或 broker 的版本管理，跨团队状态需要有人维护。

### 1.4 属性测试

- 主张：用“对所有合法输入都成立”的属性代替逐个样例，由生成器产生输入，失败时自动收缩到最小反例，适合覆盖人工想不到的边界组合（[S4](https://hypothesis.readthedocs.io/en/latest/)）。
- 产出：属性测试、输入生成器、失败反例与可复现种子、状态机测试。
- 适用阶段：核心算法、解析器、序列化、金额与时序相关逻辑。
- 对 AI 智能体的可执行性：高。属性与生成器可以模板化，失败种子可以复现；代价是找属性需要领域理解，随机性必须固定种子并设置运行上限。

### 1.5 变异测试

- 主张：在源码中注入人工缺陷并重跑测试，测试能杀死变异体说明断言有效，存活变异体暴露断言缺口；变异分数比覆盖率更接近测试强度（[S5](https://stryker-mutator.io/docs/)）。
- 产出：变异报告、存活变异体清单、变异分数、按模块的趋势数据。
- 适用阶段：关键模块的周期性质量审计，以及测试套件重构前后的对比。
- 对 AI 智能体的可执行性：中。命令与报告解析可以脚本化，智能体能对存活体做初筛；代价是运行时间长，等价变异体需要人工判断，分数波动会带来误判。

### 1.6 风险驱动测试

- 主张：按失败可能性与业务影响的乘积排序测试投入，高风险区域增加测试深度与回归频率，低风险区域减少投入（[S6](https://glossary.istqb.org/en_US/term/risk-based-testing)）。
- 产出：风险矩阵、测试优先级、每个需求点的测试深度说明。
- 适用阶段：版本计划与需求点测试计划，判据冻结之前。
- 对 AI 智能体的可执行性：中。智能体可以从变更范围、故障历史、依赖数量生成初稿，业务影响需要人确认；代价是评分口径必须固定，否则不同人给出不可比的分数。

### 1.7 等价类划分与边界值分析

- 主张：把输入空间划成若干等价类，每个类取代表值；错误最集中在边界附近，因此对最小值、最大值、刚越界值单独设计用例（[S7](https://glossary.istqb.org/en_US/term/equivalence-partitioning)、[S8](https://glossary.istqb.org/en_US/term/boundary-value-analysis)）。
- 产出：等价类表、边界值表、表驱动用例、每条用例对应的输入约束。
- 适用阶段：用例设计，接口字段与表单校验规则确定之后。
- 对 AI 智能体的可执行性：高。约束可以直接从类型、数据库字段、接口 schema 推导，表驱动测试容易生成；代价是业务规则中的隐含分区需要人补充，纯类型推导会漏掉组合条件。

## 2. 验收方法

### 2.1 ATDD 与 BDD（Cucumber/Gherkin）

- 主张：业务、开发、测试在实现前共同写验收条件与具体示例，用 Gherkin 的 Given/When/Then 组织成可执行规格，步骤定义把自然语言绑定到代码（[S9](https://agilealliance.org/glossary/atdd/)、[S10](https://cucumber.io/docs/gherkin/reference/)、[S11](https://cucumber.io/docs/bdd/)）。
- 产出：feature 文件、步骤定义、可执行规格报告、活文档。
- 适用阶段：需求澄清与验收条件冻结，实现前完成场景编写。
- 对 AI 智能体的可执行性：中。智能体起草 Gherkin 场景的质量较高，步骤定义仍需工程实现；代价是自然语言与代码双维护，智能体容易生成没有有效断言的步骤，场景数量膨胀后运行变慢。

### 2.2 验收标准 Given-When-Then

- 主张：每条验收标准写清前置上下文、触发动作、可观察结果，一条标准只描述一个行为，结果必须能从系统外部观察（[S12](https://agilealliance.org/glossary/given-when-then/)、[S13](https://cucumber.io/docs/terms/user-story/)）。
- 产出：每条 AC 的 Given/When/Then 文本、示例数据、对应的观察点。
- 适用阶段：需求点判据冻结，开工之前。
- 对 AI 智能体的可执行性：高。模板与 lint 规则可以固定下来，智能体能检查是否缺少 When、Then 是否落在内部实现、是否存在多个动作；代价是业务语义的完整性仍需人复核。

### 2.3 实例化需求（Specification by Example）

- 主张：用贴近业务的真实例子代替抽象需求描述，团队围绕关键例子达成共识，并把例子维护成活文档与自动化验收测试（[S14](https://gojko.net/books/specification-by-example/)）。
- 产出：关键例子表、业务规则说明、活文档、由例子衍生的验收用例。
- 适用阶段：需求发现与规格编写，进入任务拆分之前。
- 对 AI 智能体的可执行性：中高。例子表可以转成表驱动用例，智能体能补全边界例子；代价是例子来自业务共识，智能体单独生成容易把实现假设当成业务规则。

### 2.4 UAT 脚本

- 主张：由真实业务用户在接近生产的环境中按脚本走完整业务流程，确认系统支持实际工作，并留下签字记录（[S15](https://glossary.istqb.org/en_US/term/acceptance-testing)、[S16](https://www.practitest.com/resource-center/blog/what-is-uat-testing/)）。
- 产出：UAT 脚本、测试数据、执行记录、缺陷清单、验收签字。
- 适用阶段：发布前验收，变更级回归之后。
- 对 AI 智能体的可执行性：中。智能体能从 AC 与业务流程起草脚本、准备数据、汇总结果，签字必须由人完成；代价是环境与数据准备，脚本更新滞后于功能变化。

### 2.5 探索性测试章程

- 主张：用章程描述本次测试的任务、时间盒、关注区域与风险，测试者在会话中自由设计并执行，结束后用会话记录与 debrief 汇总发现（[S17](https://www.satisfice.com/download/session-based-test-management)）。
- 产出：测试章程、会话记录、缺陷与疑问清单、覆盖率说明。
- 适用阶段：预发布阶段，自动化测试稳定之后补充探索。
- 对 AI 智能体的可执行性：低。智能体能生成章程模板、启发式清单、汇总会话记录，无法替代人对界面与业务异常的判断；代价低，但产出质量依赖执行者。

## 3. 自动化工程

### 3.1 Playwright

- 主张：用浏览器驱动端到端测试，提供自动等待、fixture、多浏览器项目、trace 与代码生成，适合把关键用户路径写成可重复执行的脚本（[S18](https://playwright.dev/docs/intro)）。
- 产出：端到端脚本、trace、HTML 报告、失败截图与视频。
- 适用阶段：端到端验收与关键路径回归。
- 对 AI 智能体的可执行性：高。脚本结构、选择器约定、trace 读取都可以模板化，智能体能根据失败 trace 定位步骤；代价是浏览器环境与测试数据准备，异步等待处理不当会产生 flaky。

### 3.2 Cypress

- 主张：在浏览器内运行端到端与组件测试，提供时间旅行调试、自动重试与网络请求拦截，适合前端团队快速编写交互测试（[S20](https://docs.cypress.io/app/core-concepts/testing-types)）。
- 产出：端到端或组件脚本、运行视频、截图、失败堆栈。
- 适用阶段：前端交互验收与组件级回归。
- 对 AI 智能体的可执行性：高。API 与断言风格统一，智能体容易生成脚本；代价是与 Playwright 功能重叠，双栈会增加维护与 CI 成本。

### 3.3 Vitest

- 主张：与 Vite 共用配置的单元与集成测试运行器，支持覆盖率、快照、mock 与浏览器模式，启动与热更新速度快（[S21](https://vitest.dev/guide/)）。
- 产出：单元与组件测试、覆盖率报告、快照文件。
- 适用阶段：前端与 Node 代码的单元测试、提交前快速反馈。
- 对 AI 智能体的可执行性：高。测试文件结构与 mock 方式固定，智能体能按模块生成用例；代价低，覆盖率阈值需要按目录配置，否则全局阈值会掩盖薄弱模块。

### 3.4 Go testing 与 testify

- 主张：Go 标准库提供表驱动测试、子测试、基准与覆盖率，testify 补充断言、require 与 mock，组合后适合后端单元与集成测试（[S23](https://pkg.go.dev/testing)、[S24](https://github.com/stretchr/testify)）。
- 产出：`_test.go` 文件、表驱动用例、mock、覆盖率报告。
- 适用阶段：后端单元测试、包级集成测试、接口处理函数测试。
- 对 AI 智能体的可执行性：高。表驱动结构与断言库用法稳定，智能体能按函数签名生成用例；代价低，require 与 assert 的失败行为需要统一约定。

### 3.5 golden 文件

- 主张：把复杂输出写入受版本控制的 golden 文件，测试时读取并与实际输出比较，更新时显式执行更新命令并审查差异（[S25](https://pkg.go.dev/gotest.tools/v3/golden)）。
- 产出：golden 文件、比较结果、更新前后的 diff。
- 适用阶段：序列化、渲染、CLI 输出、生成器等难以逐字段断言的场景。
- 对 AI 智能体的可执行性：高。生成与比较可以脚本化，智能体能解释 diff；代价是盲目更新会把错误固化，更新命令必须配合人工审查。

### 3.6 快照测试

- 主张：首次运行把序列化结果写入快照文件，后续运行与快照比较，变化时显式更新；适合稳定但结构较大的输出（[S26](https://jestjs.io/docs/snapshot-testing)）。
- 产出：`.snap` 文件、内联快照、差异报告。
- 适用阶段：组件渲染结果、配置对象、稳定数据结构的回归。
- 对 AI 智能体的可执行性：中高。生成与更新容易，智能体能判断差异是否合理；代价是大快照难以审查，过期快照会制造无意义通过。

### 3.7 视觉回归

- 主张：首次运行保存基线截图，后续用像素比较发现布局与样式变化，可设置阈值与遮罩区域，基线更新需要人工确认（[S19](https://playwright.dev/docs/test-snapshots)）。
- 产出：基线截图、差异图、视觉回归报告。
- 适用阶段：界面验收与样式回归，组件库升级后。
- 对 AI 智能体的可执行性：中。智能体能运行比较、汇总差异，基线审批需要人；代价是字体、系统与渲染差异带来噪声，基线数量增长后维护成本高。

## 4. 质量门禁

### 4.1 覆盖率口径（行与分支）

- 主张：覆盖率按语句、分支、函数、行统计，分支覆盖率能暴露只走单侧的条件；阈值应分目录设置，覆盖率说明代码被执行，不能说明断言有效（[S22](https://vitest.dev/config/coverage)、[S27](https://istanbul.js.org/)）。
- 产出：覆盖率报告、按目录的阈值、未覆盖行清单。
- 适用阶段：提交前与合并请求的 CI 阶段。
- 对 AI 智能体的可执行性：高。运行与报告解析可以脚本化，智能体能定位未覆盖分支并补用例；代价低，阈值过严会诱导写无断言的凑数测试。

### 4.2 增量覆盖率

- 主张：只统计本次变更涉及的代码行被覆盖的比例，称为 patch 覆盖率，同时观察项目整体覆盖率变化，避免用历史覆盖率掩盖新代码缺口（[S28](https://docs.codecov.com/docs/coverage-percentages)）。
- 产出：patch 覆盖率、项目覆盖率变化、按文件的覆盖状态。
- 适用阶段：合并请求门禁与需求点验收。
- 对 AI 智能体的可执行性：高。可以从 diff 与覆盖率报告计算，智能体能按未覆盖行补测试；代价是需要稳定的 diff 基线与报告合并方式。

### 4.3 flaky 测试治理

- 主张：同一代码同一测试既通过又失败即为 flaky；Google 2016 年的统计约有 1.5% 的测试运行出现 flaky，约 16% 的测试存在某种程度的不稳定，处理方式是识别、隔离、定责与修复，单纯重试会掩盖缺陷（[S29](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)）。
- 产出：flaky 清单、隔离标记、责任人、复现记录、修复或删除决定。
- 适用阶段：回归阶段与持续集成维护。
- 对 AI 智能体的可执行性：中高。智能体能重复运行、聚类失败日志、二分定位引入提交；代价是重复运行消耗算力，环境类 flaky 难以稳定复现。

### 4.4 门禁分级

- 主张：SonarQube 的质量门禁把条件集中在新增代码上，例如新代码覆盖率不低于 80%、重复率不高于 3%，全部条件满足才通过；工程上可以在此基础上把条件分为阻断与告警两级，避免所有规则同一强度（[S30](https://docs.sonarsource.com/sonarqube-server/2025.1/instance-administration/analysis-functions/quality-gates)）。
- 产出：门禁配置、通过或失败报告、告警清单。
- 适用阶段：合并请求与发布门禁。
- 对 AI 智能体的可执行性：高。门禁可以配置成代码，智能体能读取失败条件并定位原因；代价低，阈值需要按仓库基线校准，照搬示例值会产生大量误报。

## 5. 智能体技能

### 5.1 superpowers 的 TDD 纪律

- 主张：技能要求在写实现之前先写测试，亲眼看它失败，再写最小实现让它通过，核心判据是“没有看到失败，就不知道测试是否测对了东西”（[S31](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/test-driven-development/SKILL.md#L8-L45)、[S32](https://github.com/obra/superpowers)）。
- 产出：失败测试的运行日志、最小实现、通过日志、提交记录。
- 适用阶段：功能实现与缺陷修复，进入实现步骤之前。
- 对 AI 智能体的可执行性：高。技能把顺序与证据写死，智能体可以按 RED-GREEN-REFACTOR 执行并附日志；代价是容易出现形式化测试，需要额外检查断言是否覆盖行为。

### 5.2 Spec Kit 的 checklist 与 analyze

- 主张：checklist 把需求质量检查写成“对英文规格的单元测试”，analyze 在规格、计划、任务之间做只读的一致性、歧义与覆盖缺口分析，二者都在实现前暴露问题（[S33](https://github.com/github/spec-kit)、[S34](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md)、[S35](https://github.com/github/spec-kit/blob/main/templates/commands/checklist.md)）。
- 产出：需求质量 checklist、跨产物分析报告、问题与缺口清单。
- 适用阶段：规格完成之后、任务拆分与实现之前。
- 对 AI 智能体的可执行性：高。命令输入输出固定，智能体能生成检查项并逐条核对；代价低，分析结论需要人确认优先级，checklist 容易退化成勾选表。

### 5.3 BMAD 的 QA 角色

- 主张：BMAD v4 定义独立 QA 角色，承担测试计划、代码评审与质量把关；有安装者报告 v6 安装后不再提供同名 QA agent，维护者说明原 QA 职责并入开发角色的 code review，复杂测试场景规划交由 TEA（[S36](https://github.com/bmad-code-org/BMAD-METHOD/blob/v4.20.0/bmad-core/agents/qa.md)、[S37](https://github.com/bmad-code-org/BMAD-METHOD/issues/779)）。
- 产出：QA 检查清单、测试计划、评审意见、质量结论。
- 适用阶段：实现完成后的评审与验收。
- 对 AI 智能体的可执行性：中。角色提示词与清单可以复用，智能体能按清单评审；代价是角色边界与现有 owner 冲突，整套角色编排会增加交接次数。

## 6. 对比表

| 候选 | 产物 | 适用阶段 | 可自动化程度 | 是否采纳 |
|---|---|---|---|---|
| 测试金字塔 | 分层测试清单与流水线 | 策略与 CI | 高 | 采纳 |
| 测试奖杯 | 前端集成测试组合 | 前端实现 | 中高 | 部分采纳 |
| 契约测试 | 契约文件与验证报告 | 契约与联调 | 高 | 采纳 |
| 属性测试 | 属性用例与最小反例 | 核心逻辑 | 高 | 部分采纳 |
| 变异测试 | 变异分数与存活体 | 周期审计 | 中 | 不采纳（全库门禁） |
| 风险驱动测试 | 风险矩阵与优先级 | 测试计划 | 中 | 采纳 |
| 等价类与边界值 | 分区表与边界用例 | 用例设计 | 高 | 采纳 |
| ATDD 与 BDD（Gherkin） | feature、步骤定义、报告 | 需求与验收 | 中 | 不采纳（全套） |
| Given-When-Then 验收标准 | AC 文本与示例 | 判据冻结 | 高 | 采纳 |
| 实例化需求 | 例子表与活文档 | 需求发现 | 中高 | 部分采纳 |
| UAT 脚本 | 脚本与签字记录 | 发布验收 | 中 | 部分采纳 |
| 探索性测试章程 | 章程与会话记录 | 预发布 | 低 | 部分采纳 |
| Playwright | 端到端脚本与 trace | 端到端验收 | 高 | 采纳 |
| Cypress | 端到端或组件脚本 | 前端验收 | 高 | 部分采纳 |
| Vitest | 单元测试与覆盖率 | 单元测试 | 高 | 采纳 |
| Go testing 与 testify | `_test.go` 与报告 | 后端单元 | 高 | 采纳 |
| golden 文件 | golden 文件与 diff | 序列化与 CLI | 高 | 采纳 |
| 快照测试 | 快照与差异报告 | 组件回归 | 中高 | 部分采纳 |
| 视觉回归 | 基线截图与差异图 | 界面验收 | 中 | 部分采纳 |
| 覆盖率口径 | 覆盖率报告与阈值 | CI 门禁 | 高 | 采纳 |
| 增量覆盖率 | patch 覆盖率与状态 | 合并门禁 | 高 | 采纳 |
| flaky 测试治理 | 隔离清单与责任人 | 回归维护 | 中高 | 采纳 |
| 门禁分级 | 门禁配置与报告 | 合并与发布 | 高 | 采纳 |
| superpowers TDD | 失败日志与实现 | 实现 | 高 | 采纳 |
| Spec Kit | checklist 与分析报告 | 规格与计划 | 高 | 采纳 |
| BMAD QA | QA 清单与测试计划 | 评审 | 中 | 不采纳（整套角色） |

## 7. 可吸收进自建框架的 6 条

### 7.1 验收条目双轨模板

- 改什么：给每条 AC 增加两个字段，判据类型取“脚本”或“人工”，并写明观察点、执行者、证据路径；脚本类必须附运行命令，人工类必须附检查项与签字人。
- 放哪一步：需求点判据冻结步骤，进入实现之前完成填写，缺失时不允许开工。
- 怎么判有效：统计 100% 的 AC 都有判据类型与证据路径；脚本类能在 CI 中重复运行，人工类有签字记录；出现“只有描述、没有判据”的 AC 数量为 0。

### 7.2 按变更选择测试层

- 改什么：不再给测试层设固定百分比，改为按改动路径映射测试层，并规定每个需求点至少有一条单元或集成断言、每个变更至少覆盖一条关键用户路径。
- 放哪一步：任务卡的实现步骤与提交前自验步骤。
- 怎么判有效：抽查需求点的测试改动与代码改动是否同层匹配；端到端用例数量保持稳定，单元与集成用例随改动增加；流水线时长不超过约定上限。

### 7.3 在契约与核心逻辑处补契约测试和属性测试

- 改什么：为前后端边界增加契约验证，为金额、解析、状态机等核心逻辑增加属性测试，两者都写成可重复运行的脚本。
- 放哪一步：接口契约冻结步骤与核心逻辑实现步骤。
- 怎么判有效：契约验证在提供者变更时能失败并指出字段；属性测试失败时能给出最小反例与种子；两类测试都能在本地与 CI 用同一命令运行。

### 7.4 增量覆盖率设为阻断，项目覆盖率与变异抽检设为告警

- 改什么：新增 patch 覆盖率门槛，未覆盖的新增行阻断合并；项目整体覆盖率与关键模块的抽样变异分数只告警，由负责人决定是否补测。
- 放哪一步：合并请求门禁与需求点验收步骤。
- 怎么判有效：新增代码的 patch 覆盖率稳定高于阈值；项目覆盖率不下降；变异抽检能列出存活体并有处理结论；误报导致的豁免有记录与期限。

### 7.5 flaky 测试隔离与三次复跑规则

- 改什么：同一测试连续三次运行出现不同结果时标记为 flaky，移入隔离集，指定责任人与修复期限；禁止用无限重试把失败变为通过。
- 放哪一步：回归步骤与 CI 维护步骤。
- 怎么判有效：flaky 清单有责任人与到期日；隔离集不参与发布门禁；同一测试的重复失败能被聚类到同一原因；重试次数有上限且被记录。

### 7.6 把 TDD 与规格检查压缩成两个技能动作

- 改什么：实现前强制执行一次失败测试与一次规格检查，前者留下失败日志，后者用 checklist 与 analyze 产出问题清单；不引入新的角色体系。
- 放哪一步：设计完成后的实现步骤，编码之前。
- 怎么判有效：每个需求点的证据中包含失败测试日志与规格检查报告；失败日志的时间早于实现提交；检查报告中的高优先级问题在实现前关闭或有书面豁免。

## 8. 不适合直接搬的 3 条

### 8.1 全套 Cucumber/Gherkin 与步骤定义

- 原因：自然语言场景与步骤定义形成双份维护，场景数量增长后运行与重构成本高；智能体容易生成“步骤能跑、断言很弱”的定义，形成表面通过。业务可读性可以通过 Given-When-Then 格式的 AC 获得，执行层用 Playwright 或 Go 测试更直接。
- 替代：AC 保留 Given-When-Then 文本，执行脚本按测试层直接编写，不引入 feature 文件与步骤定义层。

### 8.2 全库变异测试作为必过门禁

- 原因：全库变异的运行时间远超常规 CI，等价变异体与不稳定分数需要人工裁决；把变异分数设为阻断条件会诱导团队关闭变异类型或缩小范围，指标失去意义。
- 替代：只对变更涉及的关键模块做增量变异抽检，分数作为告警与复盘材料，存活体逐条给出处理结论。

### 8.3 BMAD 整套角色编排

- 原因：BMAD v4 的 QA 角色在 v6 已不再以同名 agent 提供，职责被拆分到开发角色的 code review 与 TEA；直接搬整套角色会与现有的 owner、验收 Agent 重叠，交接次数增加，责任边界反而模糊。
- 替代：只吸收 QA 检查清单与测试计划模板，挂到现有验收 Agent 的评审步骤，不新增角色。

## 9. 结论：验收条目的拆分与“未验证”的定义

### 9.1 拆成脚本判据与人工判据

脚本判据适用于结果可观察、可重复、环境可控的条目，例如接口状态码与响应字段、数据库最终状态、页面元素可见性与文本、文件内容、命令退出码。写法是“前置数据 + 操作 + 观察点 + 期望值 + 运行命令”，一条判据对应一个断言脚本或一个测试用例，失败时能定位到具体观察点。

人工判据适用于依赖审美、业务意图、可用性或一次性判断的条目，例如视觉层次、文案语气、操作是否顺手、真实用户能否完成业务流程、探索性测试中的异常。写法是“检查项 + 通过标准 + 执行者 + 证据形式 + 签字”，证据可以是截图、录屏、会话记录或书面确认。

拆分规则可以固定为四个判断：观察点能否由程序读取；同一输入是否稳定得到同一结果；环境能否在 CI 中重建；脚本化成本是否低于一个约定上限。四项都满足时归为脚本判据，否则归为人工判据。一条 AC 可以同时挂两类判据，验收时合并证据，脚本通过不能替代人工签字，人工签字也不能替代脚本断言。

### 9.2 “未验证”的定义

“未验证”指在指定的代码版本、指定的运行环境与指定的判据上，没有产生可复现的证据，或证据只覆盖了判据的一部分。以下情形都记为未验证：用例被跳过、脚本不存在、环境不可达、证据来自旧版本、只跑了正常路径、人工检查未签字、断言执行了但没有有效期望值。

状态只设四种：通过、失败、未验证、阻塞。未验证不能写成通过，也不能用“基本可用”“应该没问题”替代。每条未验证记录原因码，建议使用 `NO_SCRIPT`、`SKIPPED`、`ENV_BLOCKED`、`STALE_EVIDENCE`、`PARTIAL_ASSERTION`、`MANUAL_PENDING` 六类，并写明补齐所需的动作与责任人。

发布判定按两类证据合并：所有脚本判据通过，所有人工判据签字，未验证数量为 0，才允许发布。存在未验证时只能由有权人给出书面豁免，豁免要写清范围、风险与到期时间；到期未补齐的条目回到未验证状态，不能自动延续。

### 9.3 落地顺序与验证口径

先落 7.1 的双轨模板，再落 7.2 的测试层选择，随后接 7.4 的增量覆盖率门禁与 7.5 的 flaky 规则，最后接 7.3 的契约与属性测试、7.6 的技能动作。前三步只改模板与判据，不改产品代码，适合作为第一轮；后三步需要仓库已有测试基础，放在第二轮。

验证口径用三个数：AC 判据覆盖率（有脚本或人工判据的 AC 占比）、脚本判据的 CI 通过率、未验证条目平均关闭时长。三个数按需求点统计，按变更汇总，不按个人统计。关于智能体独立执行验收的准确率与误判率，未见公开的对照实验数据，自建框架应先用一批已有人工结论的历史 AC 做回放校准，再决定门禁强度。

## 10. 未查清项

- AI 编码智能体独立完成验收的准确率、误判率与人工复核成本，未见公开的对照实验或大样本统计。
- BMAD v6 中 QA 相关能力的稳定入口与官方文档路径，目前只能从 issue 与版本文件推断，需按实际安装版本核对。
- Cucumber 步骤定义由智能体生成时出现空断言或弱断言的比例，未见公开统计。
- 视觉回归在不同操作系统与字体环境下的阈值建议，公开资料给出机制，未给出可直接复用的统一数值。

## 11. 来源清单

1. [S1 The Practical Test Pyramid, Martin Fowler / Ham Vocke](https://martinfowler.com/articles/practical-test-pyramid.html)
2. [S2 The Testing Trophy and Testing Classifications, Kent C. Dodds](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications)
3. [S3 Pact Documentation](https://docs.pact.io/)
4. [S4 Hypothesis Documentation](https://hypothesis.readthedocs.io/en/latest/)
5. [S5 Stryker Mutator Documentation](https://stryker-mutator.io/docs/)
6. [S6 ISTQB Glossary: Risk-Based Testing](https://glossary.istqb.org/en_US/term/risk-based-testing)
7. [S7 ISTQB Glossary: Equivalence Partitioning](https://glossary.istqb.org/en_US/term/equivalence-partitioning)
8. [S8 ISTQB Glossary: Boundary Value Analysis](https://glossary.istqb.org/en_US/term/boundary-value-analysis)
9. [S9 Agile Alliance: Acceptance Test Driven Development](https://agilealliance.org/glossary/atdd/)
10. [S10 Cucumber Gherkin Reference](https://cucumber.io/docs/gherkin/reference/)
11. [S11 Cucumber: Behaviour-Driven Development](https://cucumber.io/docs/bdd/)
12. [S12 Agile Alliance: Given-When-Then](https://agilealliance.org/glossary/given-when-then/)
13. [S13 Cucumber: User Story and Acceptance Criteria](https://cucumber.io/docs/terms/user-story/)
14. [S14 Gojko Adzic: Specification by Example](https://gojko.net/books/specification-by-example/)
15. [S15 ISTQB Glossary: Acceptance Testing](https://glossary.istqb.org/en_US/term/acceptance-testing)
16. [S16 PractiTest: What is User Acceptance Testing](https://www.practitest.com/resource-center/blog/what-is-uat-testing/)
17. [S17 James Bach: Session-Based Test Management](https://www.satisfice.com/download/session-based-test-management)
18. [S18 Playwright Documentation](https://playwright.dev/docs/intro)
19. [S19 Playwright: Visual Comparisons](https://playwright.dev/docs/test-snapshots)
20. [S20 Cypress: Testing Types](https://docs.cypress.io/app/core-concepts/testing-types)
21. [S21 Vitest Guide](https://vitest.dev/guide/)
22. [S22 Vitest Coverage Configuration](https://vitest.dev/config/coverage)
23. [S23 Go testing Package](https://pkg.go.dev/testing)
24. [S24 testify](https://github.com/stretchr/testify)
25. [S25 gotest.tools golden Package](https://pkg.go.dev/gotest.tools/v3/golden)
26. [S26 Jest Snapshot Testing](https://jestjs.io/docs/snapshot-testing)
27. [S27 Istanbul](https://istanbul.js.org/)
28. [S28 Codecov: Coverage Percentages](https://docs.codecov.com/docs/coverage-percentages)
29. [S29 Google Testing Blog: Flaky Tests at Google and How We Mitigate Them](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
30. [S30 SonarQube: Quality Gates](https://docs.sonarsource.com/sonarqube-server/2025.1/instance-administration/analysis-functions/quality-gates)
31. [S31 superpowers: test-driven-development SKILL.md](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/skills/test-driven-development/SKILL.md#L8-L45)
32. [S32 superpowers Repository](https://github.com/obra/superpowers)
33. [S33 GitHub Spec Kit](https://github.com/github/spec-kit)
34. [S34 Spec Kit analyze Command](https://github.com/github/spec-kit/blob/main/templates/commands/analyze.md)
35. [S35 Spec Kit checklist Command](https://github.com/github/spec-kit/blob/main/templates/commands/checklist.md)
36. [S36 BMAD v4 QA Agent](https://github.com/bmad-code-org/BMAD-METHOD/blob/v4.20.0/bmad-core/agents/qa.md)
37. [S37 BMAD Issue 779: QA agent not installed](https://github.com/bmad-code-org/BMAD-METHOD/issues/779)
