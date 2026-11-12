# 后端规范调研（DDD / C4 / ADR / OpenAPI / 12-Factor / SLO / TDD）

> 目的：为司墨后端（Go 单体 + SQLite + 模块化 `agentd/internal/{core,modules,platform}`）挑选**严谨、可落地**的架构与工程规范。
> 方法：`web_search` + `web_fetch` 实际抓取；许可证/版本逐项标注；**无法核实即标"未核实"**，不编造。
> 日期：2026-11-12。

## 0. 结论先行（TL;DR）

1. **最该先落地的是 ADR**（决策日志，成本最低、对现有 `design/*`、`docs/m*-contract.md`、`【拍板】`文化最兼容）；**其次 C4 的两张图**（context + container）与 **OpenAPI 摘要**。
2. **DDD 只取"战略设计"的一半**：bounded context 划分（sessions / chat / tasks / memory / action / platform）+ 统一语言（ubiquitous language）词汇表；**不引入**完整战术 DDD（大量 Repository/Factory/领域事件框架）——司墨是单机模块化单体，过度分层会伤交付。
3. **12-Factor 部分适用**：config（env/config.local.json）、依赖声明、日志事件流、disposability（优雅停机）、dev/prod parity 全适用；"port binding / 多进程 scale out"对**单机桌面应用**属 P1 参考（容器部署时才完整适用）。
4. **SLO/可观测性**：先用 3 个 SLI 起步（可用性、聊天首字节延迟、任务完成率），SLO 作为**内部目标 + 错误预算 + 月复盘**，不建 7×24 SRE 体系；Google SRE Workbook 的 SLO 文档模板可直接抄结构。
5. **TDD**：只对**核心纯逻辑**（上下文装配、权限判定、预算/配额、路由/映射、恢复状态机）强制红-绿-重构；UI/集成/协议层仍以契约测试 + evals 为主，避免"为 TDD 而 TDD"。

## 1. 来源总表

| # | 来源 | 链接 | 组织/作者 | 许可证 | 成熟度 |
|---|---|---|---|---|---|
| B1 | DDD（领域驱动设计） | https://www.domainlanguage.com/ddd/reference/ | Eric Evans / Domain Language | 书/站点版权；参考页可免费阅读（**具体许可未核实**） | 高（2003 起；战略设计仍主流） |
| B2 | C4 model | https://c4model.com/ | Simon Brown | **CC BY 4.0**（站点明确声明，已抓取核实；书由 O'Reilly 出版） | 高（架构图事实标准之一） |
| B3 | ADR | https://adr.github.io/ · 模板：https://adr.github.io/adr-templates/ · 起源文：https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | adr.github.io 社区 / Michael Nygard（2011 起源文） | 站点 "© 2026 adr.github.io. Some rights reserved."，**具体许可证未核实**；模板页以各模板仓库许可为准 | 高（轻量、行业常用） |
| B4 | OpenAPI Specification | https://spec.openapis.org/oas/latest.html（抓取到 v3.2.0 页面） | OpenAPI Initiative（Linux Foundation） | **Apache-2.0**（GitHub `OAI/OpenAPI-Specification` 仓库 LICENSE 抓取核实） | 高（3.x 生态成熟；3.2 为当前版本线） |
| B5 | 12-Factor App | https://12factor.net/ | Adam Wiggins / Heroku（现 Salesforce） | 站点 **© Salesforce "All rights reserved"**（已抓取核实）；源码仓库 `heroku/12factor` **许可未核实** | 高（2011，2017 更新；SaaS 方法论） |
| B6 | Google SRE Workbook（SLO/可观测） | https://sre.google/workbook/implementing-slos/ · 示例 SLO 文档：https://sre.google/workbook/slo-document/ | Google（Steven Thurgood, David Ferguson 等） | **CC BY-NC-ND 4.0**（页面底部明确，已抓取核实；出版方 O'Reilly） | 高（SRE 权威实践） |
| B7 | TDD（测试驱动开发） | 书：https://www.oreilly.com/library/view/test-driven-development/0321146530/（**未抓取核实**）；概念：https://martinfowler.com/articles/practical-test-pyramid.html（TDD 与单测关系） | Kent Beck | 书版权（未核实具体条款） | 高（经典实践；有争议但成熟） |

> 许可证提醒：**CC BY-NC-ND 4.0**（B6）允许非商业分享但**禁止演绎/修改**——引用其结构做内部 SLO 文档可以，但不要整段翻译/改写后当作自有内容对外发布。B2 的 CC BY 4.0 需署名。B5 站点内容版权归 Salesforce，方法论思想可学，**不要复制站点文案**。

## 2. 逐项分析

### B1 DDD（Eric Evans）

- **是什么**：以领域模型为中心的设计方法；核心包括 **Ubiquitous Language（统一语言）**、**Bounded Context（限界上下文）**、聚合/实体/值对象/领域服务/领域事件等战术模式。
- **适用场景**：业务规则复杂、多人协作、需要长期演进的核心域（司墨：会话/Spec/任务/记忆/动作/权限）。
- **优点**：统一语言降低沟通成本；限界上下文帮助模块边界（与 `agentd/internal/modules/*` 天然对应）；值对象/不变量提升正确性。
- **缺点**：完整战术 DDD 重（Repository/UoW/领域事件框架）；小团队/单机项目容易过度设计；学习曲线陡。
- **采纳建议（轻量）**：
  1. 写一页 **context map**：`sessions`、`chat`、`tasks`、`memory`、`action`、`platform` 六个上下文，标注依赖方向与共享内核（`core/eventlog`、`core/store`）；
  2. 维护 **统一语言词汇表**（中文/英文/代码名/定义/反例），放进 `docs/process/`（例如 "会话/消息/任务/工作流/Spec/动作/审批/预算"），文档与代码命名必须一致；
  3. 只在 `core/` 用**值对象与不变量**（如 `SessionID`、`Budget`、`RiskLevel`、`ApprovalState`），不做全套 Repository/Factory；
  4. **不做**：跨模块共享可变实体、贫血模型 + 巨型 service、为 DDD 而 DDD。

### B2 C4 model（Simon Brown）

- **是什么**：分层架构可视化方法：System Context（系统上下文）→ Container（容器）→ Component（组件）→ Code（代码）；另有 landscape/dynamic/deployment 图；**notation independent**。
- **适用场景**：新人上手、跨团队沟通、架构评审、与 ADR 联动。
- **优点**：易学；层级清晰；不绑定 UML/工具；站点 CC BY 4.0 可署名复用。
- **缺点**：不是流程/治理；图容易过期；Code 级图通常不必要。
- **采纳建议**：
  - 司墨只维护 **2 张图**：`docs/architecture/context.md`（用户/浏览器 ↔ simo ↔ SQLite/文件系统/模型 API/（未来）MCP）与 `container.md`（单二进制：HTTP/WS、模块、SQLite、workspace/artifacts、调度/任务执行器）；
  - 图用 Mermaid/PlantUML 文本化入仓库，**随 ADR/接口变更更新**；Component 图仅在有争议时补。

### B3 ADR（Architecture Decision Records）

- **是什么**：把**一个架构决策**及其背景、选项、后果记录成短文档（decision log）；Nygard 2011 文章普及（"Context / Decision / Status / Consequences"）。
- **适用场景**：不可逆或跨模块的决策（存储选型、协议、权限模型、模块边界、外部依赖）；司墨已有大量 `design/*` 与契约文档，ADR 用于**补"为什么"**。
- **优点**：成本低、可追溯、避免重复争论；与现有"【拍板】"文化一致。
- **缺点**：需要纪律（决策后即时写）；过多 ADR 会碎片化；模板选择需统一。
- **采纳建议**：
  1. 目录 `docs/adr/NNNN-kebab-title.md`，一条决策一个文件；状态 `proposed/accepted/superseded`；
  2. 采用 **Nygard 模板**（轻量）：Context / Decision / Status / Consequences，可选 Alternatives；
  3. 触发条件：**"改起来贵/跨模块/影响外部契约/安全与数据"** 的决策必须写 ADR；日常实现细节不写；
  4. 与 `design/` 的关系：设计文档是"方案全集"，ADR 是"最终拍板点 + 理由"（链接到设计文档章节）。

### B4 OpenAPI（OpenAPI Initiative）

- **是什么**：描述 HTTP API 的机器可读规范（当前 3.x 线；抓取到 v3.2.0 页面）；生态含 codegen、mock、lint、文档。
- **适用场景**：对外/跨端 REST 契约；司墨已有 `/api/*` REST + WS 事件（`docs/m1-contract.md` 等）。
- **优点**：契约单一来源；可 lint/生成客户端/校验；Apache-2.0 友好。
- **缺点**：**spec 与实现漂移**是最常见问题；WS/异步事件不在 OpenAPI 覆盖（需 AsyncAPI 或事件文档）；描述大 API 时文件臃肿。
- **采纳建议**：
  - 用 OpenAPI 3.1 **摘要**维护现有 REST（paths/schemas/错误信封），与 `docs/m1-contract.md` 互为引用；
  - CI 增加"路由覆盖检查"（现有 `cli-coverage` 思路）：所有 `/api` 路由必须在 OpenAPI 中出现，否则 fail；
  - **WS/事件**单独维护 `docs/events.md`（或 P1 引入 AsyncAPI）；
  - 不生成客户端代码（当前只有 React 一个消费者，收益低）。

### B5 12-Factor App

- **是什么**：SaaS 应用十二条原则（codebase、dependencies、config、backing services、build-release-run、processes、port binding、concurrency、disposability、dev/prod parity、logs、admin processes）。
- **适用场景**：部署/配置/运维；司墨单机版 + 可选容器版。
- **优点**：清单化、易检查；config in env、日志事件流、优雅停机对现网稳定性直接有用。
- **缺点**：为多进程/云原生 SaaS 设计；单机桌面应用（SQLite + 单进程）只能部分适用；站点文案版权（Salesforce），只能学思想。
- **采纳建议（司墨对照）**：

| Factor | 司墨现状 | 建议 |
|---|---|---|
| I Codebase | 单仓库 | 保持 |
| II Dependencies | Go modules + pnpm lock | 保持；CI 锁版本 |
| III Config | flag/env/config.local.json 优先级 | 保持；密钥只走 env/secrets |
| IV Backing services | SQLite 文件、模型 API | 视为 attached resources；数据目录可迁移 |
| V Build/release/run | 单二进制 + zip | 已有 M29/M33 打包；保持 |
| VI Processes | 单进程（SQLite 单写者） | 明确"单实例"约束，不做假无状态 |
| VII Port binding | `-addr` 监听 | 保持 |
| VIII Concurrency | Go goroutine + 任务队列 | 不要横向多副本共享 db |
| IX Disposability | 10s 优雅停机 | 保持；容器 stop_grace_period |
| X Dev/prod parity | mock/real 模型、同二进制 | 保持；容器/本机一致 |
| XI Logs | stdout/stderr + 文件 | 事件流；避免日志当数据库 |
| XII Admin processes | 一次性命令（备份/恢复） | 已有 `deploy/*.ps1`；保持 |

### B6 SLO / 可观测性（Google SRE Workbook）

- **是什么**：用 **SLI（指标，好事件/总事件）→ SLO（目标）→ Error Budget（1-SLO）→ 错误预算政策** 管理可靠性；Workbook 第 2 章给出可执行步骤、SLO 文档模板与错误预算政策模板。
- **适用场景**：需要"用数据决定可靠性投入"的产品；司墨可先做内部目标。
- **优点**：把"稳定性"变成可讨论的数字；避免 100% 目标；错误预算指导发布/冻结。
- **缺点**：需要真实流量与测量；单机工具产品流量小、指标噪声大；完整 SRE 体系成本高。
- **采纳建议（最小）**：
  1. 定义 3 个 SLI：**可用性**（`/api/health` + 关键 API 成功率）、**聊天首字节延迟 P95**、**任务完成率**（done/(done+failed)）；
  2. SLO 先设保守内部目标（如月可用性 99.5%、P95 首字节 ≤5s、任务完成率 ≥95%），**每月复盘调整**；
  3. 错误预算政策：预算耗尽 → 暂停新功能/优先稳定性修复（不执行 7×24 on-call）；
  4. 文档模板抄 Workbook 附录结构：作者/评审/批准人、日期与下次评审、服务描述、SLO 与 SLI 实现、错误预算计算、数字依据、复盘节奏；**注明 CC BY-NC-ND 4.0 来源**。

### B7 TDD（Kent Beck）

- **是什么**：红-绿-重构的小步循环；先写失败测试，再最小实现，再重构。
- **适用场景**：核心领域逻辑、算法、状态机、解析/映射、权限与预算规则。
- **优点**：设计反馈快、回归保护、减少调试；对"规则密集"模块收益最大。
- **缺点**：学习曲线；对 UI/协议/集成测试收益低；过度 mock 会伤设计；原文链接本次未直接抓取（仅间接引用）。
- **采纳建议**：
  - **强制 TDD 清单**：`core/task` 状态机、`platform/permission` 规则、上下文装配/预算、动作目录映射、恢复/对账逻辑；
  - **不强制**：HTTP handler、WS、前端组件、E2E（用契约/evals 覆盖）；
  - 每个 TDD 用例命名 `Test<行为>_<条件>_<期望>`；先写失败断言再实现；覆盖率只作参考（不设百分比门禁）。

## 3. 司墨可采用的最小流程 / 检查表 / 模板

### 3.1 最小流程（后端改动）

```text
1. 决策分级：可逆实现细节 → 直接做；跨模块/契约/数据/安全 → 写 ADR（草案→评审→accepted）
2. 契约先行：改 HTTP/WS → 先改 OpenAPI/事件文档摘要 + 对应 contract 文档
3. 核心逻辑 TDD：红→绿→重构；非核心用集成/契约测试
4. 12-Factor 自查（config/日志/停机/数据目录）→ CI（deploy/ci.ps1）→ 评测回归
5. 每季度/重大变更：更新 C4 container 图；每月 SLO 复盘
```

### 3.2 检查表（PR 必填）

- [ ] 是否触及 ADR 触发条件？是 → 附 ADR 链接；否 → 说明为何不需要
- [ ] 改动是否影响 REST/WS 契约？是 → OpenAPI/事件文档已更新，且有覆盖检查
- [ ] 核心逻辑是否有单测（TDD 优先），边界/错误路径是否覆盖
- [ ] 配置只经 flag/env/config 读取，无硬编码路径/密钥
- [ ] 日志是事件流（无敏感信息），有 trace/seq 可关联
- [ ] 优雅停机 / 单实例约束 / SQLite 单写者未被破坏
- [ ] 数据迁移幂等、可回滚，备份/恢复路径未被破坏
- [ ] 指标可观测（关键路径有 SLI 数据来源）

### 3.3 模板 A：ADR（Nygard 轻量）

```markdown
# NNNN <决策标题>

- 状态：proposed | accepted | superseded by NNNN
- 日期：YYYY-MM-DD
- 决策者/评审者：
- 关联：design/xx、docs/mxx-contract.md

## Context
（问题、约束、现状、为什么现在要决策）

## Decision
（一句话决策 + 关键细节）

## Alternatives considered
（2–3 个候选与不选的原因）

## Consequences
（正面/负面/后续工作/回滚方式）
```

### 3.4 模板 B：SLO 文档（抄 Google SRE Workbook 结构，内部使用）

```markdown
# <服务> SLO（vN，YYYY-MM）
- 作者/评审/批准人；批准日期；下次评审日期
- 服务描述（用户是谁、关键路径）
- SLI 定义（好事件/总事件，数据来源：日志/探针/客户端）
- SLO 目标（周期：月/季；目标值；多档延迟阈值）
- 错误预算（1-SLO；计算方式；消耗记录）
- 数字依据（基线/实验/假设，明确标注）
- 错误预算政策（耗尽时：冻结发布/优先修复/升级路径）
- 复盘节奏（月度）
> 来源参考：Google SRE Workbook Ch.2（CC BY-NC-ND 4.0），仅引用结构。
```

### 3.5 采纳优先级

| 优先级 | 动作 | 理由 |
|---|---|---|
| P0 | ADR（Nygard 模板）+ C4 context/container 两张图 | 成本低、立即改善可追溯性 |
| P0 | OpenAPI 摘要 + 路由覆盖检查（接入 CI） | 防契约漂移，现有路由多 |
| P1 | 统一语言词汇表 + context map（轻量 DDD） | 与模块边界/评审对齐 |
| P1 | 3 个 SLI + 内部 SLO + 月复盘 | 用数据管理稳定性；流量小可先人工 |
| P1 | 12-Factor 对照表纳入部署文档 | 已有 deploy/ 基础 |
| P2 | TDD 扩展到更多模块；AsyncAPI；Pact 契约测试 | 视团队与接口复杂度 |

### 3.6 未核实/风险

- B1 DDD 参考页与书籍的具体许可未核实；**只学方法、不复制文本**；
- B3 ADR 站点"Some rights reserved"未给出具体许可；模板以各模板仓库为准；
- B5 12-Factor 站点版权 Salesforce（All rights reserved），仅学思想；`heroku/12factor` 仓库许可未核实；
- B6 CC BY-NC-ND 4.0：**禁止演绎/修改**，内部文档只可引用结构与结论并署名；
- B7 TDD 原书链接未抓取核实；本文件对 TDD 的表述基于业界共识与 Fowler 测试文章，**不作为引文**。
