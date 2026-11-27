# 测试类来源采集

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

## 测试金字塔

- 必须做：当测试组合以高层端到端为主、单元测试不足时，必须按金字塔把大部分测试下移到单元层。
- 自动检查：原文未指定工具，也未给各层比例阈值。

## 测试替身

- 必须做：当测试需要替换生产对象时，必须明确用的是 Dummy、Fake、Stub、Spy、Mock 中的哪一类；Fake 只用于测试，不适合用于生产。
- 自动检查：原文未指定工具；替身由测试代码实现，原文未点名具体库。

## 测试尺寸

- 必须做：当测试要进入提交前或持续集成的快速套件时，必须把测试限制在 Small 的环境与 60 秒内；需要数据库、文件系统或外部系统时，归入 Medium/Large 并分套件。
- 自动检查：原文提到 Java 可用 security manager 与 annotation 按尺寸分套件并限制活动；未给通用工具名。

## 测试组合比例

- 必须做：当团队要避免倒金字塔/冰淇淋筒或沙漏、建立可维护的测试组合时，必须把大部分测试放在单元层，并以 70/20/10 校准初始比例。
- 自动检查：原文未指定工具；比例需要测试统计，原文说 exact mix 因团队而异，未给门限。

## flaky 测试与测试尺寸

- 必须做：当大型测试的 flaky 率明显高于小型测试时，必须先缩小测试范围、减少依赖，再决定是否保留大型测试。
- 自动检查：原文使用 Google 内部测试分析统计 flaky run；未指定公开工具。

## 契约测试

- 必须做：当消费者与提供者由不同团队独立部署、接口契约可能漂移时，必须在部署前做契约验证，并用 can-i-deploy 判定。
- 自动检查：Pact Broker 的 `can-i-deploy`，退出码 0 表示可部署，1 表示不可；部署后可用 `record-deployment` 记录。

## 性质测试

- 必须做：当输入空间大、边界组合多、示例测试无法穷举时，必须用性质测试覆盖输入范围，并保留失败反例。
- 自动检查：Hypothesis 自带随机生成、缩小与失败样例库；默认 `max_examples=100`，可用 `@example` 加显式样例。

## 变异测试

- 必须做：当需要判断测试能否发现缺陷、而不仅是覆盖代码时，必须做变异测试并设置 mutation score 门槛。
- 自动检查：Stryker 的 `thresholds.break`；mutation score 低于 break 时退出码 1，默认 `break=null` 不使构建失败。

## 风险驱动测试

- 必须做：当测试资源有限、需要按风险排序测试活动时，必须做风险分析，用 likelihood 与 impact 评 risk level，并据此选择、排序、管理测试。
- 自动检查：原文未指定自动检查工具。

## 端到端测试实践

- 必须做：当端到端测试出现间歇失败、元素未就绪或动画未稳定时，必须使用 actionability 自动等待与可重试断言，不用未 await 的手写断言。
- 自动检查：Playwright 自带 actionability 检查、web-first assertions 与 `retries` 配置；失败重试默认关闭。

## 可访问性规则集

- 必须做：当页面需要按 WCAG 2.0/2.1/2.2 A/AA 做自动化可访问性检查时，必须跑 axe 规则集；WCAG 2.2 规则默认关闭。
- 自动检查：axe-core 规则引擎；规则表给 Rule ID、Impact、Tags、Issue Type（failure / needs review）。

## 负载测试类型与阈值

- 必须做：当系统上线前需要给出性能通过/失败结论时，必须定义 thresholds，并按风险选择负载类型；原文建议从 smoke 开始。
- 自动检查：k6 的 `thresholds`；失败时 k6 以 failed status 结束并返回非零退出码，`checks` 不影响退出状态。

## 缺陷分类

- 必须做：当项目需要跨生命周期统一记录、分类和比较软件异常，以支持缺陷因果分析与过程改进时，必须采用统一分类与属性集。
- 自动检查：原文摘要未指定工具；标准正文未取得，无法核对属性表与严重度分级的自动检查方式。

## 缺陷严重度

- 必须做：当缺陷记录需要标注严重程度时，必须按这条定义说明缺陷对开发或运行的影响。
- 自动检查：原文未指定工具；原文只给定义，未给分级表，无法据原文自动判定等级。
