# 产品需求与产品设计：可供 AI 编码智能体执行的框架、方法与技能包调研

调研时间 2026-11-24。范围限定在需求与规格、产品方法、设计方法三组，共 18 个候选。可执行性的判定口径是该方法能否落成仓库内的模板、判据或脚本，以及落地需要多少人工判断。文中每条主张后附公开来源，来源链接集中在第八节，正文链接与编号指向同一地址。

## 一、需求与规格框架

### 1.1 GitHub Spec Kit

- 主张：把规格驱动开发拆成固定命令序列，先用 constitution 固化项目原则，再依次执行 specify、clarify、plan、tasks，最后用 analyze 校验产物与原则的一致性（[仓库](https://github.com/github/spec-kit)，[命令序列说明](https://github.com/juanklagos/spec-driven-development-template/blob/main/docs/en/08-github-spec-kit-integration.md)）。
- 产物：`.specify/memory/constitution.md`、`spec.md`、`plan.md`、`tasks.md`，clarify 的问答折叠进 `spec.md` 的 Clarifications 节。
- 阶段：需求澄清到任务拆解，适用于新功能与新项目。
- 对 AI 智能体的可执行性：高。命令序列与文件路径都是显式的，可以直接映射成仓库目录与检查脚本；clarify 一次一问、最多五问的限制也能写成提示词约束。代价在 constitution 的维护，原则写得空泛时 analyze 会退化成形式检查。

### 1.2 Kiro

- 主张：规格分两条路线，需求优先从系统行为出发写 requirements 再推 design 与 tasks，设计优先从架构出发反推需求与任务（[Specs 总览](https://kiro.dev/docs/specs/)，[双路线说明](https://kiro.dev/docs/specs/feature-specs/)）。
- 产物：`requirements.md`（EARS 句式，形如 WHEN 条件 THE SYSTEM SHALL 行为）、`design.md`、`tasks.md`；任务按依赖图分波次并行执行。
- 阶段：需求到实现计划，新功能与缺陷修复分别走 Feature Specs 与 Bugfix Specs。
- 对 AI 智能体的可执行性：高。EARS 句式天然可解析，能直接生成断言骨架；双路线适合写成"输入物决定顺序"的分支规则。代价在 design.md 的质量依赖模型能力，波次并行要求仓库具备独立任务切分能力。

### 1.3 OpenSpec

- 主张：把每次改动放进独立变更目录，用 delta 描述对现有规格的增删改，避免每次重写整份规格（[仓库](https://github.com/Fission-AI/OpenSpec)，[npm 说明](https://www.npmjs.com/package/@fission-ai/openspec)）。
- 产物：`changes/<change-id>/` 下的 proposal.md、tasks.md、design.md，以及 `specs/<capability>/spec.md` 中以 ADDED、MODIFIED、REMOVED 标记的需求与场景。
- 阶段：变更立项到归档，适合已有长期规格的项目。
- 对 AI 智能体的可执行性：高。delta 是结构化文本，可以做合并、冲突检测与归档脚本；变更目录天然对应一个分支或一个工作区。代价是要先有稳定的长期规格，否则 delta 没有合并基线。

### 1.4 BMAD

- 主张：用 Analyst、PM、Architect 三个角色分阶段产出，Analyst 做研究与产品简报，PM 写 PRD 或 tech-spec，Architect 做技术设计，再由实现角色按 story 推进（[仓库](https://github.com/bmad-code-org/BMAD-METHOD)，[quick-start](https://github.com/bmad-code-org/BMAD-METHOD/blob/fe0817f59034a56eda71293b868bd39294af2d9d/src/modules/bmm/docs/quick-start.md)）。
- 产物：产品简报、PRD、tech-spec、架构文档、story 文件与任务清单。
- 阶段：从发现到架构与迭代实现，适合从零起步的项目。
- 对 AI 智能体的可执行性：中。角色分工可以写成 owner 与交接物清单，story 文件可以模板化；角色本身依赖对话扮演，产出质量取决于上下文是否给足，难以用脚本判定。

## 二、产品方法

### 2.1 Jobs to be Done

- 主张：用户"雇佣"产品来完成某项进展，需求分析应围绕 job、期望结果与现有替代方案展开，功能清单只是结果（[Christensen 等，HBR](https://hbr.org/2016/09/know-your-customers-jobs-to-be-done)）。
- 产物：job 陈述（情境、动机、期望结果）、job map 的八个步骤、访谈记录与结果清单。
- 阶段：发现与需求定义。
- 对 AI 智能体的可执行性：低到中。job 陈述与结果清单可以做成模板并检查字段完整性；判断某个陈述是否指向真实 job 需要访谈证据，脚本只能检查是否引用了证据。

### 2.2 用户故事地图

- 主张：按用户活动的时间顺序铺开主干，再纵向切出故事与发布切片，让范围与优先级在同一张图上可见（[Jeff Patton](https://jpattonassociates.com/the-new-backlog/)）。
- 产物：故事地图，含主干、可走通的最小切片、发布切片。
- 阶段：范围规划与版本切分。
- 对 AI 智能体的可执行性：中。主干与切片可以用 Markdown 表格或 Mermaid 表达并检查层级；切片是否合理属于产品判断。

### 2.3 Impact Mapping

- 主张：从目标出发，依次回答 why、who、how、what 四层，把交付物挂到行为变化上，暴露"做了功能但没有影响"的假设（[官方网站](https://www.impactmapping.org/)）。
- 产物：四层思维导图或层级大纲，每个节点带假设与度量。
- 阶段：目标对齐与路线图规划。
- 对 AI 智能体的可执行性：中。四层结构可以模板化，节点必须带度量与假设字段；目标与行为变化的合理性需要人评审。

### 2.4 Opportunity Solution Tree

- 主张：以期望结果为根，向下展开机会、方案与假设测试，迫使团队先比较机会再选方案（[Teresa Torres](https://www.producttalk.org/opportunity-solution-trees/)）。
- 产物：outcome、opportunity、solution、assumption test 四层树。
- 阶段：持续发现与方案取舍。
- 对 AI 智能体的可执行性：中。树结构可以用嵌套列表或 JSON 存储并校验层级；机会是否成立依赖至少三到四次客户访谈，属于人工证据。

### 2.5 RICE

- 主张：用触达、影响、信心、投入四个因子算分，把优先级从直觉变成可比较的数值（[Intercom](https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/)）。
- 产物：评分表与排序结果。
- 阶段：待办排序。
- 对 AI 智能体的可执行性：高。公式固定，适合写成脚本；输入缺失时拒绝计算并标出缺项，比让模型自由发挥更可靠。

### 2.6 WSJF

- 主张：用延迟成本除以工作规模得到排序值，优先做单位时间收益最高的工作（[SAFe](https://framework.scaledagileframework.com/wsjf/)）。
- 产物：延迟成本三项（业务价值、时间紧迫性、风险降低）与规模估算表。
- 阶段：版本与迭代排序。
- 对 AI 智能体的可执行性：中。计算可脚本化，输入是相对估算；绝对数值缺乏可靠来源，应约束为团队内相对排序。

### 2.7 亚马逊 PRFAQ 与 Working Backwards

- 主张：先从发布时点倒推，写一页新闻稿与内部 FAQ，用客户能读懂的语言检验想法是否值得做（[Working Backwards](https://workingbackwards.com/)）。
- 产物：press release 与 FAQ 两段式文档。
- 阶段：立项与方向决策。
- 对 AI 智能体的可执行性：低。结构可以模板化，内容质量取决于对客户与市场的真实理解，评审只能人工完成。

## 三、设计方法

### 3.1 设计令牌

- 主张：把颜色、字号、间距、圆角等视觉决策抽成有名字的变量，作为设计与代码共用的单一来源（[Design Tokens Community Group](https://www.designtokens.org/)，[格式草案](https://tr.designtokens.org/format/)）。
- 产物：token JSON、CSS 变量或主题文件、设计工具与代码的映射文档。
- 阶段：设计系统与前端实现。
- 对 AI 智能体的可执行性：高。JSON 可校验、可生成多端变量、可扫描硬编码值，适合做门禁。

### 3.2 C4 模型

- 主张：用系统上下文、容器、组件、代码四级抽象描述架构，配同名四类图，保持视图与代码一致（[C4 model](https://c4model.com/)）。
- 产物：context、container、component、code 四类图与配套说明。
- 阶段：架构设计与架构评审。
- 对 AI 智能体的可执行性：中。上下文图与容器图可以用文本 DSL 生成并检查元素命名；组件与代码级图容易过期，维护成本高。

### 3.3 ADR

- 主张：每个重要技术决策写一份短记录，包含标题、状态、背景、决策与后果，随代码一起版本化（[Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)）。
- 产物：`docs/adr/NNNN-title.md`。
- 阶段：全程，重点是决策发生时。
- 对 AI 智能体的可执行性：高。模板与编号规则可脚本校验，状态流转可以检查；决策内容是否成立仍需评审。

### 3.4 Nielsen 十项启发式

- 主张：用十条通用交互原则做启发式评估，覆盖系统状态可见、贴合现实、用户可控、一致性与帮助等维度（[NN/g](https://www.nngroup.com/articles/ten-usability-heuristics/)）。
- 产物：评估清单与问题清单。
- 阶段：设计评审与可用性检查。
- 对 AI 智能体的可执行性：低到中。清单可模板化，少数条目能对应到可测规则，例如对比度、焦点可见、错误提示文案；多数条目依赖评审者对上下文的理解。

### 3.5 WCAG 2.2

- 主张：以可测试的成功准则定义可访问性等级，分 A、AA、AAA 三级，2.2 版新增焦点不被遮挡、拖拽操作的替代方式、目标尺寸等准则（[W3C Recommendation](https://www.w3.org/TR/WCAG22/)）。
- 产物：准则清单、审计报告、修复项列表。
- 阶段：设计与验收。
- 对 AI 智能体的可执行性：中到高。对比度、表单标签、页面语言、焦点顺序等部分准则可由工具自动检测，其余需要人工与辅助技术验证。

### 3.6 Design Critique

- 主张：用固定议程对设计稿做结构化评审，先复述目标与约束，再给问题与建议，最后明确决策与待办（[NN/g](https://www.nngroup.com/articles/design-critiques/)）。
- 产物：评审记录、问题清单、决策与 owner。
- 阶段：设计评审。
- 对 AI 智能体的可执行性：低。议程与记录模板可以固定，评审质量取决于参与者；可以要求每条意见带准则编号，便于复查。

### 3.7 Storybook

- 主张：以组件为单位开发，每个状态写一个 story，配合交互测试与文档页，把组件行为固定在可浏览的样例上（[Storybook 文档](https://storybook.js.org/docs)）。
- 产物：`*.stories.tsx`、组件文档页、交互测试。
- 阶段：组件开发与回归。
- 对 AI 智能体的可执行性：高。story 是代码，可跑测试、可做视觉回归、可作为验收证据。

## 四、对比表

| 候选 | 产物 | 适用阶段 | 可自动化程度 | 我们是否采纳 |
|---|---|---|---|---|
| GitHub Spec Kit | constitution、spec、plan、tasks | 需求到任务 | 高 | 部分采纳，借命令分层 |
| Kiro | requirements、design、tasks，EARS 句式 | 需求到任务 | 高 | 部分采纳，借 EARS 与双路线 |
| OpenSpec | 变更目录与 delta spec | 变更管理 | 高 | 采纳，借 delta 语义 |
| BMAD | 产品简报、PRD、tech-spec、story | 需求与架构 | 中 | 部分采纳，借角色卡 |
| Jobs to be Done | job 陈述、job map、访谈记录 | 发现 | 低 | 部分采纳，借目标结果句式 |
| 用户故事地图 | 主干、切片、发布范围 | 范围与排期 | 中 | 部分采纳，借骨架模板 |
| Impact Mapping | why、who、how、what 四层图 | 目标对齐 | 中 | 采纳，借变更动机段 |
| Opportunity Solution Tree | 结果、机会、方案、假设四层树 | 发现与取舍 | 中 | 部分采纳 |
| RICE | 评分表与排序 | 排序 | 高 | 采纳，脚本算分 |
| WSJF | 延迟成本与规模估算 | 排序 | 中 | 部分采纳，只做相对排序 |
| PRFAQ | 新闻稿与 FAQ | 立项 | 低 | 部分采纳，一页模板 |
| 设计令牌 | token JSON、主题文件 | 设计与实现 | 高 | 采纳 |
| C4 模型 | 上下文、容器、组件、代码图 | 架构 | 中 | 采纳，限上下文与容器级 |
| ADR | 决策记录 | 全程 | 高 | 采纳 |
| Nielsen 十项启发式 | 评估清单与问题清单 | 评审 | 低 | 部分采纳，清单化 |
| WCAG 2.2 | 准则清单与审计报告 | 验收 | 中 | 采纳，取 AA 子集 |
| Design Critique | 评审记录与决策 | 评审 | 低 | 部分采纳，议程模板 |
| Storybook | stories、文档页、交互测试 | 组件开发 | 高 | 采纳 |

## 五、可吸收进自建框架的 6 条

### 1. 在变更入口补"目标结果与机会"段

改什么：在变更 spec 的动机部分固定三行，写期望结果、受影响角色、当前替代方案，结构取自 JTBD 的 job 陈述与 OST 的 outcome、opportunity 分层。
放在哪一步：变更立项，写需求点四件套之前。
怎么判定有效：抽查连续十个变更，三行齐全且期望结果带可度量指标；缺失字段由门禁报错，不允许进入契约冻结。

### 2. 把验收判据统一成可解析的 EARS 句式

改什么：需求点的断言改用 WHEN 或 IF 条件 THE SYSTEM SHALL 行为的句式，每条断言与一个断言 ID 一一对应。
放在哪一步：契约冻结时，早于前后端实现。
怎么判定有效：脚本能解析每条断言并抽出触发条件与期望行为，映射覆盖率可统计；无法解析的判据计入缺口清单。

### 3. 用 delta 语义管理变更与长期 spec 的关系

改什么：变更包内按 ADDED、MODIFIED、REMOVED 标记需求，归档时由脚本合并进长期 spec。
放在哪一步：变更归档。
怎么判定有效：合并脚本能检出基线冲突并阻断归档；抽查三次归档，长期 spec 无重复条目与悬空引用。

### 4. 用角色卡固定 Analyst、PM、Architect 的输入输出

改什么：把三个角色的输入、输出、退出判据写成文件，替代对话式角色扮演。
放在哪一步：变更启动与设计阶段。
怎么判定有效：每张卡有 owner、输入清单、输出路径与退出判据；缺输出路径的卡不许进入下一阶段。

### 5. 把设计令牌与组件样例作为前端唯一事实源

改什么：颜色、间距、字号只允许引用 token；组件的关键状态必须在 Storybook 有样例。
放在哪一步：前端 spec 与组件 spec。
怎么判定有效：硬编码颜色与间距的数量为零，token 覆盖率达到约定阈值，视觉回归无未审差异。

### 6. 把可访问性与启发式检查拆成脚本项与人工项

改什么：WCAG 2.2 AA 中可自动检测的准则写成脚本，其余准则与 Nielsen 条目写成人工检查表，每条带证据链接。
放在哪一步：验收。
怎么判定有效：脚本项全部有结果，人工项有签字人与证据路径；连续两个变更的同类缺陷数下降。

## 六、不适合直接搬的 3 条

### 1. Kiro 的 IDE 一体化三件套生成

原因：能力绑定在 Kiro 产品内，命令、审批门禁与任务波次调度都由其运行时提供，搬进普通仓库只能得到三个 Markdown 文件，失去需求分析与并行调度能力。我们已有变更包与断言体系，整套引入会形成两套事实源。

### 2. BMAD 的人格化多角色会话编排

原因：角色产出依赖长对话上下文，同一角色在不同会话中的行为不稳定，产物散落在对话里难以审计。角色分工可以保留为文件化的 owner 与交接物，人格化扮演不适合作为流程底座。

### 3. WSJF 的绝对数值打分

原因：延迟成本与规模都要求可靠估算，AI 智能体给不出可核对的绝对数值，分数会变成伪精确。可以保留相对排序与阈值判断，把绝对分数从门禁里去掉。

## 七、结论

三类处理方式的划分如下。

| 类别 | 内容 | 判定依据 |
|---|---|---|
| 做成模板 | 变更动机三行、EARS 判据、delta spec、角色卡、ADR、C4 上下文与容器图、PRFAQ 一页、故事地图主干、评审记录 | 结构固定、字段可校验、产出是文件 |
| 做成门禁 | token 硬编码扫描、判据解析与映射覆盖、delta 合并冲突、WCAG 自动项、ADR 编号与状态、来源链接完整性 | 有确定性判据，失败能阻断合并 |
| 只能人工评审 | JTBD 访谈证据、Impact Mapping 目标合理性、Nielsen 语境判断、Design Critique 的取舍、PRFAQ 的客户价值 | 依赖外部证据与经验判断，脚本无法给出结论 |

推进顺序建议先做判据句式与 delta 合并，这两项直接决定需求点能否被脚本核验；随后做 token 门禁，它能在实现阶段拦住大部分视觉漂移；WCAG 自动项放在验收脚本成型之后接入，避免过早引入不稳定的检测结果。

## 八、来源

1. GitHub Spec Kit 仓库：https://github.com/github/spec-kit
2. Spec Kit 命令序列说明（第三方集成文档）：https://github.com/juanklagos/spec-driven-development-template/blob/main/docs/en/08-github-spec-kit-integration.md
3. Kiro Specs 总览：https://kiro.dev/docs/specs/
4. Kiro Feature Specs 双路线：https://kiro.dev/docs/specs/feature-specs/
5. Kiro Requirements-First 流程：https://kiro.dev/docs/specs/feature-specs/requirements-first/
6. OpenSpec 仓库：https://github.com/Fission-AI/OpenSpec
7. OpenSpec npm 页面：https://www.npmjs.com/package/@fission-ai/openspec
8. BMAD-METHOD 仓库：https://github.com/bmad-code-org/BMAD-METHOD
9. BMAD quick-start 文档：https://github.com/bmad-code-org/BMAD-METHOD/blob/fe0817f59034a56eda71293b868bd39294af2d9d/src/modules/bmm/docs/quick-start.md
10. Christensen 等，Know Your Customers' Jobs to Be Done：https://hbr.org/2016/09/know-your-customers-jobs-to-be-done
11. Jeff Patton，The New Backlog：https://jpattonassociates.com/the-new-backlog/
12. Impact Mapping 官网：https://www.impactmapping.org/
13. Teresa Torres，Opportunity Solution Trees：https://www.producttalk.org/opportunity-solution-trees/
14. Intercom，RICE 优先级方法：https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/
15. SAFe，WSJF：https://framework.scaledagileframework.com/wsjf/
16. Working Backwards（PRFAQ）：https://workingbackwards.com/
17. Design Tokens Community Group：https://www.designtokens.org/
18. Design Tokens 格式草案：https://tr.designtokens.org/format/
19. C4 model：https://c4model.com/
20. Michael Nygard，Documenting Architecture Decisions：https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
21. NN/g，10 Usability Heuristics：https://www.nngroup.com/articles/ten-usability-heuristics/
22. W3C，WCAG 2.2：https://www.w3.org/TR/WCAG22/
23. NN/g，Design Critiques：https://www.nngroup.com/articles/design-critiques/
24. Storybook 文档：https://storybook.js.org/docs

## 九、未查清项

- Spec Kit 的命令细节来自第三方集成文档与仓库说明，未取得一手 README 全文，命令数量与参数以当前版本为准。
- BMAD 最新版本的模块划分与角色清单可能已变化，本文依据仓库说明与 quick-start 文档。
- OpenSpec 的 CLI 子命令与归档行为依据 npm 页面与仓库说明，未逐条实测。
- 设计令牌、ADR、Design Critique、RICE、WSJF、PRFAQ 按官方页地址引用，未逐页抓取全文核对，相关结论只涉及结构与用途。
- 各方法的量化收益缺少公开对照实验，本文不对收益幅度作断言。
