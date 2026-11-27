# 墨线框架 v2 来源总表（SOURCES）

本表依据 `docs/framework/v2/sources/` 下七份原始表整理：`sdd.md` 十二行、`agents.md` 十二行、`standards.md` 十行、`product-design.md` 二十七行、`engineering.md` 十五行、`testing.md` 十四行、`skills.md` 二十二行，原始表合计一百一十二行。按“同一来源占多行时合并一行”的规则，WCAG 2.2 的十一条准则合并为一条、WAI-ARIA Authoring Practices 的三个模式页合并为一条，合并后共 **100 条**，编号 S-001 至 S-100。细则与逐条判据仍以原始表为准，本表只记来源级的判定与落点。

判定口径：**采纳**指原样纳入框架，落点必须能指到具体章节、规则号或门禁；**改造后采纳**指只取其中与框架相容的部分，其余部分说明不取的理由；**不采纳**指整条不进入框架，必须写理由，落点写“不适用”。“判据能否脚本化”按来源自身给出的判据判断：能，指有命令、退出码或可机械核对的结构；部分，指一部分可脚本核对、另一部分需人工评审；不能，指来源明确是原则或经验法则。

统计：共 100 条，采纳 40 条，改造后采纳 38 条，不采纳 22 条；判据可脚本化 34 条、部分 57 条、不能 9 条。

## 一、规范驱动开发（12 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-001 | GitHub Spec Kit | v1.4.5（2026-11-25），head f2010547 | https://github.com/github/spec-kit | 规范驱动开发 | 改造后采纳 | 宪章加可测规格模板与立项模板、契约冻结条件同构，采纳模板与阶段划分，不搬九条宪章与只读分析命令。 | 第 5 章 MX-5-08；第 6 章 MX-6-09 | 部分 |
| S-002 | OpenSpec | v2.2.0（2026-11-24），head f1cd852f | https://github.com/Fission-AI/OpenSpec | 规范驱动开发 | 改造后采纳 | 每变更一目录加结构校验与变更包同形，采纳目录形态与校验退出码，不引入其命令行与归档流程。 | 第 5 章 MX-5-01；第 6 章 MX-6-05 | 能 |
| S-003 | cc-sdd | v3.1.0（2026-09-23），head e2a0c671 | https://github.com/gotalab/cc-sdd | 规范驱动开发 | 改造后采纳 | 边界声明与 GO、NO-GO、MANUAL_VERIFY_REQUIRED 三值可映射为范围三句与放行结论，阶段停等由门禁替代。 | 第 5 章 MX-5-09；第 10 章 MX-10-09 | 部分 |
| S-004 | Kiro | 闭源 IDE，2026-11-27 读取，无版本号 | https://kiro.dev/docs/specs/feature-specs/ | 规范驱动开发 | 改造后采纳 | EARS 句式与需求先行、设计先行两变体可作立项输入，Analyze Requirements 无退出码，只能当人工复核。 | 第 3 章；第 5 章 MX-5-08 | 部分 |
| S-005 | BMAD-METHOD | v6.12.4（2026-10-14），head e435a225 | https://github.com/bmad-code-org/BMAD-METHOD | 规范驱动开发 | 改造后采纳 | 稳定需求编号与三到六条 Done when 可并入 AC 与放行判据，票据树与状态机脚本不搬。 | 第 3 章 MX-3-05；第 10 章 MX-10-10 | 能 |
| S-006 | Taskmaster | task-master-ai@0.43.1，head c0c98d36 | https://github.com/eyaltoledano/claude-task-master | 规范驱动开发 | 不采纳 | 复杂度 1 到 10 评分与 tasks.json 内态同档位、任务卡两套口径冲突，依赖校验只查不修且无测试门禁。 | 不适用 | 能 |
| S-007 | CCPM | 无正式 release，head 0bcfabb5 | https://github.com/automazeio/ccpm | 规范驱动开发 | 改造后采纳 | 确定性操作走脚本与独立 worktree 并行可并入派单与执行，GitHub issue 不设为事实源。 | 第 7 章 MX-7-06；第 8 章 MX-8-01 | 能 |
| S-008 | Agent OS（shape-spec） | v3.0.0（2026-01-20），head e892e61d | https://github.com/buildermethods/agent-os | 规范驱动开发 | 不采纳 | spec 目录与人工批准已被变更包覆盖，且无独立检查命令，可取的只有目录命名方式。 | 不适用 | 不能 |
| S-009 | GSD Core | v1.23.0（2026-11-23），head 26429a68 | https://github.com/open-gsd/gsd-core | 规范驱动开发 | 改造后采纳 | 阶段产物落盘与全新上下文续做可并入检查点与换人，验证者无退出码只作人工复核。 | 第 8 章 MX-8-15；第 5 章 MX-5-08 | 部分 |
| S-010 | Claude Code skills（文档） | 官方文档，2026-11-27 读取 | https://code.claude.com/docs/en/skills.md | 规范驱动开发 | 改造后采纳 | 技能按需载入与描述触发可约束派单材料体积，frontmatter 字段不写入框架。 | 第 7 章 MX-7-13；第 8 章 MX-8-02 | 部分 |
| S-011 | Claude Code plugins（文档） | 官方文档，2026-11-27 读取 | https://code.claude.com/docs/en/plugins/overview.md | 规范驱动开发 | 采纳 | 插件清单、权限声明与 user、project、local 三层作用域为插件审核门提供现成口径。 | GATES 3.14；ROLES MX-R-39 | 部分 |
| S-012 | Anthropic Agent Skills 规范 | 2026-11-27 读取 | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | 规范驱动开发 | 采纳 | 三级渐进披露与 name、description、正文行数上限可直接约束技能包结构。 | 第 7 章 MX-7-13；附录 A | 能 |

## 二、多智能体编排（12 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-013 | MetaGPT | PyPI 0.8.2；GitHub v0.8.1 | https://github.com/FoundationAgents/MetaGPT | 多智能体编排 | 不采纳 | Role 与订阅是代码级 SOP 广播，角色由 ROLES 唯一来源，引入会形成第二套角色定义。 | 不适用 | 不能 |
| S-014 | ChatDev | 2.0（2026-01-07），tag v2.2.0 | https://github.com/OpenBMB/ChatDev | 多智能体编排 | 不采纳 | YAML 图与 WareHouse 是平台内态，校验只查 YAML 语法，不能支撑产物门禁。 | 不适用 | 部分 |
| S-015 | AutoGen | python-v0.7.5 | https://github.com/microsoft/autogen | 多智能体编排 | 不采纳 | 团队预设与 TaskResult 是 SDK 运行时概念，仓库已归档，且与 ROLES 角色卡重复。 | 不适用 | 部分 |
| S-016 | CrewAI | 1.15.45（2026-11-24） | https://github.com/crewAIInc/crewAI | 多智能体编排 | 不采纳 | guardrail 失败重试三次与框架两轮退回冲突，role、goal、backstory 是第二套角色定义。 | 不适用 | 部分 |
| S-017 | Agent OS（2.1.1） | 2.1.1（2025-10-29） | https://github.com/artisan-build/agent-os | 多智能体编排 | 不采纳 | 实现者与验证者分权已被 ROLES 与不自签规则覆盖，2.1 又把 spec 校验改为可选。 | 不适用 | 部分 |
| S-018 | OpenAI Agents SDK | 0.26.0 | https://github.com/openai/openai-agents-python | 多智能体编排 | 改造后采纳 | handoff 历史裁剪与 guardrail 拦截可支撑派单上下文最小化，SDK 本身不进入框架。 | 第 7 章 MX-7-13；第 8 章 MX-8-02 | 部分 |
| S-019 | OpenAI Swarm | 无发行版 | https://github.com/openai/swarm | 多智能体编排 | 不采纳 | 无状态教学原语，无角色、无审查、无门禁，只有轮次上限防死循环。 | 不适用 | 不能 |
| S-020 | LangGraph | 1.2.24 | https://github.com/langchain-ai/langgraph | 多智能体编排 | 改造后采纳 | checkpoint 回放与 interrupt 审批可作检查点与人工放行的机制参照，不引入图框架。 | 第 8 章 MX-8-15；第 12 章 MX-12-01 | 部分 |
| S-021 | Superpowers（库） | v7.0.2 | https://github.com/obra/superpowers | 多智能体编排 | 采纳 | 每任务新子代理、两段审查与进度台账同派单五要素、不自签、检查点同构。 | 第 7 章 MX-7-03；第 10 章 MX-10-06 | 部分 |
| S-022 | claude-flow / Ruflo | v3.80.9 | https://github.com/ruvnet/ruflo | 多智能体编排 | 不采纳 | 校验只核对安装字节属供应链检查，一百多个预置 agent 不解决产物审查。 | 不适用 | 能 |
| S-023 | Anthropic《Effective context engineering》 | 文章，无版本号 | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | 多智能体编排 | 采纳 | 最小高信号上下文与子代理摘要可直接约束派单材料与检查点写法。 | 第 7 章 MX-7-13；第 8 章 MX-8-14 | 部分 |
| S-024 | Anthropic《Building effective agents》 | 文章，无版本号 | https://www.anthropic.com/engineering/building-effective-agents | 多智能体编排 | 采纳 | 链式步骤间插入脚本检查与框架门禁同构，workflow 与 agent 的取舍可作编排原则。 | 第 7 章 MX-7-01；第 9 章 MX-9-02 | 部分 |

## 三、工程标准与过程模型（10 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-025 | ISO/IEC/IEEE 29148:2018 | 第 2 版，2018-11；仅摘要 | https://www.iso.org/standard/72089.html | 工程标准 | 改造后采纳 | 需求质量特性可作 AC 与契约条目的评审清单，具体准则未取得，只能作原则使用。 | 第 3 章 MX-3-12；第 6 章 MX-6-09 | 部分 |
| S-026 | IEEE 1012-2024 | 2024；仅摘要 | https://standards.ieee.org/ieee/1012/7324 | 工程标准 | 改造后采纳 | 单元到验收四级 V&V 与独立性要求对应测试层与验收分权，完整性等级表未取得不引入。 | 第 9 章；第 10 章 MX-10-06 | 部分 |
| S-027 | ISO/IEC/IEEE 29119 系列 | 29119-1:2022、-2:2021、-4:2021；仅摘要 | https://www.iso.org/standard/81291.html | 工程标准 | 改造后采纳 | 过程、文档与技术三分可作测试计划骨架，技术选择判据未取得只作原则。 | 第 9 章 MX-9-01；第 10 章 MX-10-01 | 部分 |
| S-028 | ISO/IEC 25010:2023 | 第 2 版，2023-11；仅摘要 | https://www.iso.org/standard/78176.html | 工程标准 | 采纳 | 九特性可作质量需求与非功能 AC 的分类骨架，度量定义不在摘要内。 | 第 6 章 表 6-2；第 9 章 MX-9-05 | 部分 |
| S-029 | CMMI V3.0 | 订阅制模型，公开页 2026 读取 | https://cmmiinstitute.com/cmmi | 工程标准 | 不采纳 | 实践域与评级判据在付费模型内，公开页只有组件概述，不能落成判据。 | 不适用 | 部分 |
| S-030 | Kruchten 4+1 视图 | 1995-11，IEEE Software 12(6) | https://doi.org/10.1109/52.469759 | 工程标准 | 改造后采纳 | 四视图加场景可作设计列架构说明的检查清单，视图裁剪由项目判断。 | 第 6 章 设计列 | 部分 |
| S-031 | ATAM | SEI 方法页，2018-02-14 | https://www.sei.cmu.edu/library/architecture-tradeoff-analysis-method-collection/ | 工程标准 | 改造后采纳 | 质量属性场景与风险、敏感点、权衡点清单可作设计评审产出清单，评分不量化。 | 第 6 章；第 10 章 MX-10-11 | 部分 |
| S-032 | Scrum Guide 2020 | 2020-11 | https://scrumguides.org/scrum-guide.html | 工程标准 | 改造后采纳 | Definition of Done 与三件产物的承诺可映射为 AC 与放行单，Sprint 时间盒与按点交付冲突。 | 第 10 章 MX-10-10；第 13 章 MX-13-01 | 部分 |
| S-033 | The Kanban Guide | v2025.5，2025-05 | https://kanbanguides.org/the-kanban-guide/ | 工程标准 | 改造后采纳 | 在制品限制与四项流动度量可并入并行上限与复盘，服务级别期望数值由项目自定。 | 第 7 章 MX-7-18；第 13 章 MX-13-09 | 能 |
| S-034 | DORA 五项指标 | 页面 2026-01-05 更新 | https://dora.dev/guides/dora-metrics/ | 工程标准 | 采纳 | 五项指标可由部署与事件记录计算，直接补足交付效能度量。 | 第 13 章 MX-13-06；第 13 章 MX-13-10 | 能 |

## 四、需求与设计（15 条，含两条合并来源）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-035 | EARS | 2009 年，RE 2009 | https://alistairmavin.com/ears/ | 需求与设计 | 采纳 | 固定句式把前置条件、触发与响应分槽，可直接消除 AC 的歧义。 | 第 3 章 MX-3-12；第 9 章 MX-9-02 | 部分 |
| S-036 | Given-When-Then（Gherkin） | Gherkin 6，页面 2026-11-23 更新 | https://cucumber.io/docs/gherkin/reference/ | 需求与设计 | 采纳 | 声明式场景与可观察结果的要求同用例模板一致，步骤写法可直接约束。 | 第 9 章 MX-9-06 | 部分 |
| S-037 | 用户故事地图 | 2008-01-28 | https://jpattonassociates.com/user-story-mapping-presentation/ | 需求与设计 | 改造后采纳 | 骨架与发布切片可作建域与变更范围的组织方法，二维地图本身是人工活动。 | 第 5 章 MX-5-09 | 部分 |
| S-038 | INVEST | 2003-08-17 | https://xp123.com/articles/invest-in-good-stories-and-smart-tasks/ | 需求与设计 | 改造后采纳 | 六条可作需求点拆分自检，规模上限与按点交付一致。 | 第 5 章 MX-5-06；第 7 章 MX-7-02 | 部分 |
| S-039 | Job Stories | 2013-12-23 | https://www.intercom.com/blog/using-job-stories-design-features-ui-ux | 需求与设计 | 不采纳 | 情境、动机、结果三句同立项的用户原话、目标、场景重复，且无可核对判据。 | 不适用 | 不能 |
| S-040 | RICE | 2018-01-05 | https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/ | 需求与设计 | 改造后采纳 | 四因子可作立项排序口径，工作量按人月需与档位并存，不能当硬门禁。 | 第 5 章 表 5-2 | 能 |
| S-041 | WSJF | 仅取得摘要 | https://framework.scaledagile.com/wsjf | 需求与设计 | 不采纳 | 正文被登录墙截断，缺评分推导与示例，只剩一条定义口径，不能落成判据。 | 不适用 | 部分 |
| S-042 | Nielsen 十大启发式 | 1994-04-24，2024-01-30 复核 | https://www.nngroup.com/articles/ten-usability-heuristics/ | 需求与设计 | 改造后采纳 | 十条是宽泛经验法则，可作视觉验收的人工检查表，不能当阈值。 | 第 10 章 MX-10-12 | 不能 |
| S-043 | Material Design 3 状态 | 现行站页，无发布日期 | https://m3.material.io/foundations/interaction/states/overview | 需求与设计 | 采纳 | 六种状态、40dp 状态层与 48dp 目标、禁用态对比度例外可直接写进组件契约。 | 第 6 章 表 6-2；第 10 章 MX-10-12 | 能 |
| S-044 | Apple Human Interface Guidelines | 设计原则 2026-06-08 重新引入 | https://developer.apple.com/design/human-interface-guidelines/design-principles | 需求与设计 | 改造后采纳 | 文本放大 200% 与按字号分档的对比度可并入视觉验收，八条原则只作取向。 | 第 10 章 MX-10-12 | 部分 |
| S-045 | Design Tokens Format Module（DTCG） | Final Community Group Report，2025-10-28 | https://www.designtokens.org/tr/2025.10/format/ | 需求与设计 | 采纳 | 值与类型必填、命名禁用字符可由脚本校验，直接补强令牌契约。 | 第 6 章 表 6-2；ROLES MX-R-31 | 能 |
| S-046 | C4 模型 | 现行站点，无发布日期 | https://c4model.com/ | 需求与设计 | 改造后采纳 | 上下文、容器、组件、代码四级可作架构图分层要求，方法与工具无关。 | 第 6 章 设计列 | 不能 |
| S-047 | 架构决策记录 ADR | 2011-11-15 | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | 需求与设计 | 采纳 | 五节结构与顺序编号可脚本检查骨架，决策记录有固定落点。 | 第 6 章 设计列；附录 A | 部分 |
| S-048 | WCAG 2.2（十一条准则合并） | W3C Recommendation 2024-12-12 | https://www.w3.org/TR/WCAG22/ | 需求与设计 | 采纳 | 十一条准则中对比度、目标尺寸、名称角色值等可用脚本核对，其余需人工评审，十一条合并为一条来源。 | 第 9 章 MX-9-29；GATES 3.13；ROLES MX-R-37 | 部分 |
| S-049 | WAI-ARIA Authoring Practices（三种模式合并） | W3C WAI APG，无发布日期 | https://www.w3.org/WAI/ARIA/apg/patterns/ | 需求与设计 | 采纳 | 手风琴、对话框、标签页的 role 与键盘行为可脚本断言，三个模式页合并为一条来源。 | 第 9 章 MX-9-29；第 6 章 表 6-2 | 能 |

## 五、工程实践（15 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-050 | React act | v19.3 | https://react.dev/reference/react/act | 工程实践 | 采纳 | 更新包在 act 内是组件测试稳定性的前置条件，环境变量可检查。 | 第 9 章 MX-9-08 | 能 |
| S-051 | React 组件纯度 | 文档页未标版本号 | https://react.dev/learn/keeping-components-pure | 工程实践 | 改造后采纳 | 纯组件与 StrictMode 双渲染可作实现约束，纯度本身没有单条命令。 | 第 8 章 MX-8-17；第 9 章 MX-9-08 | 部分 |
| S-052 | Testing Library 查询优先级 | 2024-03-19 更新 | https://testing-library.com/docs/queries/about/ | 工程实践 | 采纳 | 可访问查询优先、testid 最后同现行规则一致，可直接作为检查与评审项。 | 第 9 章 MX-9-08 | 能 |
| S-053 | Playwright 最佳实践 | 文档站未标版本号 | https://playwright.dev/docs/best-practices | 工程实践 | 采纳 | 面向用户定位器、web-first 断言与用例隔离可直接约束端到端用例。 | 第 9 章 表 9-1；MX-9-06 | 能 |
| S-054 | Storybook 交互测试 | 10.6 | https://storybook.js.org/docs/writing-tests/interaction-testing | 工程实践 | 改造后采纳 | story 作夹具与 play 交互测试可减少重复用例，引入成本是构建链。 | 第 9 章 MX-9-08；第 10 章 MX-10-12 | 部分 |
| S-055 | TypeScript strict | 文档页未标版本号 | https://www.typescriptlang.org/tsconfig/strict.html | 工程实践 | 采纳 | strict 与 noUncheckedIndexedAccess 可由编译器阻断，是门禁可直接消费的判据。 | 第 8 章 MX-8-18；GATES 3.1 | 能 |
| S-056 | Core Web Vitals | 2024-10-31 更新，三项 Stable | https://web.dev/articles/vitals | 工程实践 | 采纳 | 三项指标的 75 分位阈值可脚本测量，直接补性能 AC。 | 第 9 章 表 9-1；第 10 章 MX-10-20 | 能 |
| S-057 | Google AIP-130 | State Approved，2023-03-13 | https://google.aip.dev/130 | 工程实践 | 改造后采纳 | 标准方法优先与自定义方法冒号命名可作接口评审清单，只适用资源型接口。 | 第 6 章 表 6-2；第 9 章 MX-9-09 | 部分 |
| S-058 | OpenAPI 3.1.0 | 3.1.0（2021-02-15） | https://spec.openapis.org/oas/v3.1.0.html | 工程实践 | 采纳 | 基于 JSON Schema 2020-12 的校验工具链可直接支撑契约门。 | 第 6 章 MX-6-05；第 9 章 MX-9-09 | 能 |
| S-059 | OWASP ASVS 5.0 | 5.0，V1 至 V3 | https://github.com/OWASP/ASVS | 工程实践 | 采纳 | 编号条目与 L1 至 L3 分级可作安全验收清单，注入与安全头可由扫描覆盖。 | 第 9 章 MX-9-29；GATES 3.13；ROLES MX-R-39 | 部分 |
| S-060 | Twelve-Factor App | 页面 2017 更新 | https://12factor.net/ | 工程实践 | 改造后采纳 | 配置外置、无状态进程与日志为事件流可作交付检查，十二条不全适用单机场景。 | 第 11 章 MX-11-02；第 8 章 MX-8-26 | 部分 |
| S-061 | Google SRE：SLI、SLO 与错误预算 | 在线版第 4 章，未标版本 | https://sre.google/sre-book/service-level-objectives/ | 工程实践 | 改造后采纳 | 指标、目标与错误预算可作可观测性契约与复盘指标，单机产品只取关键路径。 | 第 11 章；GATES 3.11；第 13 章 MX-13-06 | 部分 |
| S-062 | Django 6.1 迁移文档 | Django 6.1 文档 | https://docs.djangoproject.com/en/6.1/topics/migrations/ | 工程实践 | 改造后采纳 | 迁移即 schema 版本控制与单事务执行可并入迁移批次，Django 命令不适用 Go 后端。 | 第 8 章 MX-8-26；第 5 章 MX-5-23 | 能 |
| S-063 | Go testing 包 | go1.27.4 | https://pkg.go.dev/testing | 工程实践 | 采纳 | 表驱动、子测试与数据竞争检查可直接约束 Go 用例与并发验证。 | 第 9 章 表 9-1；第 8 章 MX-8-18 | 能 |
| S-064 | Effective Go | 2009 年发布版 | https://go.dev/doc/effective_go | 工程实践 | 采纳 | 格式与静态检查可阻断，错误必查与格式约定可脚本核对。 | 第 8 章 MX-8-18；GATES 3.1 | 能 |

## 六、测试（14 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-065 | 测试金字塔 | 2012-05-01 | https://martinfowler.com/bliki/TestPyramid.html | 测试 | 采纳 | 低层多、高层少同现行分层一致，可约束用例分布。 | 第 9 章 表 9-1 | 部分 |
| S-066 | 测试替身 | 2006-01-17 | https://martinfowler.com/bliki/TestDouble.html | 测试 | 采纳 | 五类替身语义可作用例评审口径，避免用替身代替集成验证。 | 第 9 章 MX-9-03 | 部分 |
| S-067 | Google 测试尺寸 | 2010-12-13，2024-06-03 更新 | https://testing.googleblog.com/2010/12/test-sizes.html | 测试 | 改造后采纳 | 资源与时限分档可并入层时限，长时限需拆成提交前与夜间两档，同 20 分钟步长换算。 | 第 9 章 表 9-1；第 8 章 MX-8-11 | 能 |
| S-068 | 70/20/10 测试组合 | 2015-04-22，2024-06-03 更新 | https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html | 测试 | 改造后采纳 | 比例可作初始校准，原文说精确比例因团队而异，只写建议值不设门禁。 | 第 9 章 MX-9-03 | 部分 |
| S-069 | flaky 测试与测试尺寸 | 2017-04-17 | https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html | 测试 | 采纳 | 越大的测试越易 flaky 同现行三次同环境复现、隔离清单同构。 | 第 9 章 MX-9-18 | 部分 |
| S-070 | Pact 契约测试 | 文档 2026-08-25 | https://docs.pact.io/ | 测试 | 不采纳 | 单仓同团队、契约表与接口文档校验已覆盖，Pact Broker 需额外服务，成本高于收益。 | 不适用 | 能 |
| S-071 | Hypothesis 性质测试 | 6.170.17 | https://hypothesis.readthedocs.io/en/latest/ | 测试 | 采纳 | 默认一百例与自动缩小可补边界覆盖，失败反例可入证据。 | 第 9 章 MX-9-07；第 8 章 MX-8-05 | 能 |
| S-072 | Stryker 变异测试 | 页面未标版本 | https://stryker-mutator.io/docs/ | 测试 | 改造后采纳 | 变异分数门槛只对纯逻辑高风险模块启用，不全量跑。 | 第 9 章 MX-9-21 | 能 |
| S-073 | 风险驱动测试（ISTQB） | CTFL v4.0（2023-04-21） | https://astqb.org/5-2-risk-management/ | 测试 | 采纳 | 可能性与影响两维同七项风险登记一致，可补排序口径。 | 第 9 章 MX-9-05 | 部分 |
| S-074 | 端到端实践（Playwright） | 文档站未标版本 | https://playwright.dev/docs/best-practices | 测试 | 采纳 | 可操作性检查与重试分类可减少误判 flaky。 | 第 9 章 表 9-1；MX-9-18 | 能 |
| S-075 | axe-core 规则集 | 4.14.1 | https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md | 测试 | 采纳 | 规则表按 WCAG 等级与影响分组，可作可访问性自动检查基线。 | 第 9 章 MX-9-29；GATES 3.13 | 能 |
| S-076 | k6 负载测试 | v2.4.x，2026-11-27 抓取 | https://grafana.com/docs/k6/latest/testing-guides/test-types/ | 测试 | 采纳 | 阈值失败即非零退出，可直接作性能 AC 的判据。 | 第 9 章 表 9-1；第 10 章 MX-10-20 | 能 |
| S-077 | IEEE 1044-2009 | 2009；仅摘要 | https://standards.ieee.org/ieee/1044/4607/ | 测试 | 不采纳 | 仅有摘要，属性表与严重度分级判据未取得，无法落点。 | 不适用 | 不能 |
| S-078 | ISTQB 缺陷严重度 | Glossary v3.4（2020-09-14） | https://www.imbus.de/en/glossar/term/severity | 测试 | 改造后采纳 | 严重度定义可统一缺陷记录口径，等级表需框架自建。 | 第 4 章 MX-4-17；第 3 章 表 3-4 | 部分 |

## 七、技能与分发（22 条）

| 编号 | 名称 | 版本 | 出处链接 | 类别 | 判定 | 理由 | 落点 | 判据能否脚本化 |
|---|---|---|---|---|---|---|---|---|
| S-079 | Claude Code Skills 文档 | 文档站，无版本号 | https://code.claude.com/docs/en/skills.md | 技能与分发 | 改造后采纳 | 技能目录加元数据的按需载入可作派单材料组织方式，字段不写入框架。 | 第 7 章 MX-7-13；第 8 章 MX-8-02 | 部分 |
| S-080 | Agent Skills 规范 | 规范页，无版本号 | https://agentskills.io/specification | 技能与分发 | 采纳 | 目录形状与名称、描述字段约束可脚本校验，可作技能包结构要求。 | 第 7 章 MX-7-13；附录 A | 能 |
| S-081 | Anthropic Skill authoring best practices | 文档站，无版本号 | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | 技能与分发 | 改造后采纳 | 正文行数、引用深度与评估用例结构可作派单材料与技能评估口径，评估器需自建。 | 第 7 章 MX-7-13；第 9 章 MX-9-29 | 部分 |
| S-082 | Claude Code Subagents 文档 | 文档站，无版本号 | https://code.claude.com/docs/en/sub-agents.md | 技能与分发 | 采纳 | 名称、描述、权限模式与轮次上限可约束子代理定义，同角色卡同构。 | 第 2 章 MX-R-30；第 7 章 MX-7-03 | 部分 |
| S-083 | Claude Code Plugins overview | 文档站，无版本号 | https://code.claude.com/docs/en/plugins/overview.md | 技能与分发 | 采纳 | 插件清单、作用域与上下文成本可作插件市场审核门输入。 | GATES 3.14；ROLES MX-R-39 | 部分 |
| S-084 | OpenAI Agents SDK：Tools | 文档站，无版本号 | https://openai.github.io/openai-agents-python/tools/ | 技能与分发 | 不采纳 | 工具分组与延迟加载属运行时实现，框架无工具目录章节，也无对应判据。 | 不适用 | 部分 |
| S-085 | OpenAI Agents SDK：Agents 与 instructions | 文档站，无版本号 | https://openai.github.io/openai-agents-python/agents/ | 技能与分发 | 不采纳 | Agent 配置项同角色卡重复，指令是否被遵守只能自建评测。 | 不适用 | 部分 |
| S-086 | DeepSeek Harness：dsh-doc 技能 | dsh 0.2.2-rc.5 | https://github.com/deepseek-ai/deepseek-harness | 技能与分发 | 不采纳 | 约束的是问答取材顺序，属工具使用约定而非流程判据，框架无技能目录章节。 | 不适用 | 部分 |
| S-087 | obra/superpowers（库） | commit 22f0b46 | https://github.com/obra/superpowers | 技能与分发 | 采纳 | 固定链路与两段审查、收尾测试同框架派单和验收同构。 | 第 7 章 MX-7-03；第 10 章 MX-10-06 | 部分 |
| S-088 | anthropics/skills | commit e4bb5d9 | https://github.com/anthropics/skills | 技能与分发 | 改造后采纳 | 只取 skill-creator 的基准对照与通过率口径作技能评估，十九个技能不引入。 | 第 9 章 MX-9-29；第 7 章 MX-7-13 | 能 |
| S-089 | ComposioHQ/awesome-claude-skills | commit be2a406 | https://github.com/ComposioHQ/awesome-claude-skills | 技能与分发 | 不采纳 | 索引仓库，自带技能无脚本无检查清单，质量靠发布前人工复核。 | 不适用 | 不能 |
| S-090 | affaan-m/ECC | commit 4adeee6，README 标 2.2.3 | https://github.com/affaan-m/ECC | 技能与分发 | 改造后采纳 | 生命周期钩子的非零退出与自检命令可作插件审核与自检入口。 | GATES 3.14；第 8 章 MX-8-02 | 能 |
| S-091 | mhattingpete/claude-skills-marketplace | commit b5b34bc | https://github.com/mhattingpete/claude-skills-marketplace | 技能与分发 | 不采纳 | 四个插件按市场分发，技能判据多为人工步骤，无新增可执行判据。 | 不适用 | 部分 |
| S-092 | superpowers · test-driven-development | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md | 技能与分发 | 采纳 | 先见失败测试再写实现同框架高风险路径先写失败测试一致。 | 第 8 章 MX-8-05；第 9 章 MX-9-06 | 能 |
| S-093 | superpowers · writing-plans | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md | 技能与分发 | 采纳 | 每步一个动作一个可检查结果同 20 分钟步长、检查点七项同构。 | 第 7 章 MX-7-04；第 8 章 MX-8-11 | 部分 |
| S-094 | superpowers · brainstorming | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md | 技能与分发 | 改造后采纳 | 设计批准前不写代码可映射为契约冻结前不开工，批准靠人不能脚本化。 | 第 5 章 MX-5-20；第 6 章 MX-6-09 | 部分 |
| S-095 | superpowers · requesting-code-review | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/SKILL.md | 技能与分发 | 采纳 | 固定提交区间的审查与三段输出可作审查记录格式。 | 第 10 章 MX-10-06；第 11 章 MX-11-04 | 部分 |
| S-096 | superpowers · systematic-debugging | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md | 技能与分发 | 采纳 | 四阶段与三次上限同框架先复现、根因四行、停工规则一致。 | 第 8 章 MX-8-06；第 12 章 MX-12-09 | 部分 |
| S-097 | superpowers · finishing-a-development-branch | commit 22f0b46 | https://github.com/obra/superpowers/blob/main/skills/finishing-a-development-branch/SKILL.md | 技能与分发 | 采纳 | 合并前跑全套、红了即停同收口条件一致。 | 第 11 章 MX-11-01；第 12 章 MX-12-01 | 能 |
| S-098 | mhattingpete · code-refactor | commit b5b34bc | https://github.com/mhattingpete/claude-skills-marketplace/blob/main/code-operations-plugin/skills/code-refactor/SKILL.md | 技能与分发 | 不采纳 | 再检索一次只查残留命中，判不了语义正确，十文件阈值也无依据。 | 不适用 | 部分 |
| S-099 | odoo-upgrade | commit 5541d98，插件 v5.1.0 | https://github.com/ahmed-lakosha/odoo-plugins/blob/master/odoo-upgrade-plugin/odoo-upgrade/SKILL.md | 技能与分发 | 不采纳 | Odoo 专用预检与校验同技术栈无关，只有先备份再变换的顺序可借鉴。 | 不适用 | 能 |
| S-100 | changelog-generator | commit be2a406 | https://github.com/ComposioHQ/awesome-claude-skills/blob/master/changelog-generator/SKILL.md | 技能与分发 | 不采纳 | 纯提示词，无脚本、无失败路径，输出靠人读。 | 不适用 | 不能 |

## 合并与缺项说明

- WCAG 2.2 在原表占十一行，总表合并为 S-048，十一条准则的逐条判据见 `docs/framework/v2/sources/product-design.md` 第 3 节；合并后仍按“部分可脚本化”记，因为对比度、目标尺寸、名称角色值可脚本核对，替代文本等价性与焦点可见性需人工评审。
- WAI-ARIA Authoring Practices 在原表占三行（手风琴、对话框、标签页），总表合并为 S-049，逐条 role 与键盘行为见同文件第 3 节。
- `skills.md` 已到位（216 行、22 条链接），S-079 至 S-100 按该表判定，无“未到”占位。若后续补入第七份之外的来源，按同一编号规则追加 S-101 起，并同步更新本节统计。
