# 软件工程标准与过程模型：原文采集

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

## 需求工程：ISO/IEC/IEEE 29148:2018

- 可检查要求的环节：需求过程是否按标准执行，需求信息项是否存在且覆盖标准规定的内容要素；可检查对象是过程活动与信息项本身。
- 只是原则的环节：需求条目质量特性（必要、无歧义、可验证等）的判定准则写在正文，官方摘要页未列出，本次采集不掌握具体条目，不能当作可检查判据使用。
- 全文取得情况：仅取得摘要（ISO 官方摘要页），缺正文中的过程模型、信息项模板与需求特性清单；未通读全文。

## 验证与确认：IEEE 1012-2024

- 可检查要求的环节：各完整性等级下应执行的 V&V 活动与应产出的 V&V 结果，可用分析、评价、评审、检查、评估、测试六类手段核对。
- 只是原则的环节：完整性等级的划分与对应活动强度写在正文，摘要只说明“按不同完整性等级规定要求”，具体分级表与判据未取得。
- 全文取得情况：仅取得摘要（IEEE 标准页面），缺正文的完整性等级定义、各等级 V&V 任务清单与报告要求；未通读全文。

## 软件测试：ISO/IEC/IEEE 29119 系列

- 可检查要求的环节：测试过程的治理、管理与实施三层活动，测试文档产物与测试设计技术的选择及用例推导结果，可用“测试结果是否构成需求满足或缺陷存在的证据”核对。
- 只是原则的环节：测试技术的适用条件与风险驱动选择策略写在 29119-4 正文，摘要只说明技术用于推导用例，未给出各技术的选择判据。
- 全文取得情况：仅取得 29119-1、29119-2、29119-4 的官方摘要，缺正文的测试过程模型、文档模板与各技术的过程描述；未通读全文。

## 质量模型：ISO/IEC 25010:2023

- 可检查要求的环节：质量特性与子特性可作为质量需求条目、验收准则与度量的分类骨架，检查点是需求与验收条目是否逐项落到特性上。
- 只是原则的环节：九个特性各自的分量、度量方法与评价尺度不在本标准的摘要内（度量定义属 ISO/IEC 2502x 系列），摘要页未列出九个特性的名称。
- 全文取得情况：仅取得摘要（ISO 官方摘要页），缺正文的九特性及子特性定义与使用指南；未通读全文。

## 过程改进模型：CMMI V3.0

- 可检查要求的环节：评估方法可对组织能力作出评级，模型按领域定制的做法可用“所选领域与所购模型范围是否一致”核对。
- 只是原则的环节：公开页面只有组件构成与领域划分的概述，过程域（V3.0 称实践域）清单、实践陈述与评级判据都在订阅制模型查看器内，本次未取得。
- 全文取得情况：仅取得摘要（CMMI Institute 公开概述页，模型需付费订阅），缺过程域与实践清单、评估方法与评级判据；未通读全文。

## 架构视图模型：4+1 视图

- 可检查要求的环节：架构描述是否覆盖逻辑、进程、开发、物理四视图与场景，每视图是否给出组件、连接、容器、干系人与关注点，架构文档是否按 Software Architecture Document 的章节组织。
- 只是原则的环节：视图裁剪（单处理器可省物理视图、单进程可省进程视图）与迭代细化节奏由项目判断，原文未给量化判据；架构“原型化、测试、度量”只作过程主张。
- 全文取得情况：取得作者自存 PDF 全文并通读（IEEE Software 1995 正式版的作者早期稿，arXiv:2006.04975 注明“Early draft, better quality than IEEE published version”）；正式出版版未单独核读。

## 架构评估方法：ATAM

- 可检查要求的环节：九步评估的每一步是否执行，产出物是否齐备（架构方法、效用树、场景及其映射、质量属性问题与回答、风险、非风险、风险主题），可用产出物清单逐项核对。
- 只是原则的环节：效用树的评分与场景优先级排序、敏感点与权衡点的判定，依赖评估组判断，官方方法页未给量化阈值。
- 全文取得情况：取得 SEI 官方方法页全文并通读；ATAM 技术报告（含阶段 0–3 详细活动、角色分工、问卷与模板）未取得，属仅取得方法说明。

## 敏捷框架：Scrum Guide 2020

- 可检查要求的环节：三个工件是否各有承诺、Definition of Done 是否成文并被执行、Sprint 是否不超过一个月，Sprint Planning、Daily Scrum、Sprint Review、Sprint Retrospective 是否在各自时间盒内完成。
- 只是原则的环节：Definition of Done 的具体质量度量由团队自定，框架自称“purposefully incomplete”；角色行为与自管理方式属原则性描述。
- 全文取得情况：取得官方指南全文并通读（scrumguides.org，CC BY-SA）。

## 流动管理：The Kanban Guide 2025

- 可检查要求的环节：Definition of Workflow 六项要素是否齐备、在制品数量是否按定义受控、服务级别期望是否设定并可视化、四项流动度量是否持续采集，均可用看板与度量记录核对。
- 只是原则的环节：服务级别期望的具体数值（如示例“85% 的工作项在八天或更短时间内完成”）由团队设定，指南只给形式与示例；改进工作流的做法属原则。
- 全文取得情况：取得官方指南全文并通读（kanbanguides.org，v2025.5，CC BY 4.0）。

## 交付效能度量：DORA 与 Accelerate

- 可检查要求的环节：五项指标均可由部署记录与事件记录计算，检查点是部署时间戳、失败处置时间、变更失败与返工记录是否被完整采集。
- 只是原则的环节：指标高低与组织绩效的关系属研究结论，非判据；Accelerate 书中的统计模型与调查方法未取得。
- 全文取得情况：取得 DORA 官方指标页全文并通读；Accelerate 原书为付费出版物，未取得，四项指标的表述以 DORA 官方页的回顾为准。

## 未取得全文的来源与缺口

- ISO/IEC/IEEE 29148:2018、IEEE 1012-2024、ISO/IEC/IEEE 29119-1/-2/-4、ISO/IEC 25010:2023：标准正文按份售卖，只取得官方摘要页，缺过程模型、信息项模板、完整性等级表、测试技术描述与九特性定义。
- CMMI V3.0：模型内容在订阅制 CMMI Model Viewer 内（US$150/年），公开页只有组件与领域概述，缺实践域与实践陈述清单、评级判据。
- ATAM：取得 SEI 方法页全文，缺 ATAM 技术报告中的阶段 0–3 活动、角色分工、评估问卷与产出模板。
- Accelerate（Forsgren、Humble、Kim，2018）：付费图书，未取得，四项指标以 DORA 官方页的回顾性表述为准。
- 已通读全文的四项：4+1 视图论文（作者自存 PDF）、Scrum Guide 2020、The Kanban Guide v2025.5、DORA 指标页。
