# 测试流程与质量门禁调研（金字塔 / 风险测试 / 契约测试 / GWT / 质量门禁）

> 目的：为司墨（Go 后端 + React 前端 + `evals/` 评测体系）挑选**可执行的测试规范与门禁**，避免"测试很多但不敢发版"或"只靠 E2E 结果不可信"。
> 方法：`web_search` + `web_fetch` 实际抓取；许可证/成熟度逐项标注；**未核实项明确标注**，不编造。
> 日期：2026-11-12。现有基线：`evals/`（run.mjs + cases + graders + 9 个专项 ps1）、`deploy/ci.ps1`、`docs/m20-test-plan.md`。

## 0. 结论先行（TL;DR）

1. **测试金字塔作为"数量形状"原则成立，但名称不重要**（Fowler 站点的实务文章明确：分层可改名，关键是"低层多、高层少"、避免冰淇淋反模式）。司墨现状已符合：Go 单测 + evals 的 L1/L2 契约 + 少量 E2E。
2. **风险测试决定"测什么"**：先按"数据丢失/权限越权/恢复失败/成本失控/长程卡死"打风险分，高风险路径必须自动化 + 门禁，低风险用探索/人工。
3. **契约测试优先于 E2E**：司墨是单机 REST + WS 事件，用 **OpenAPI 摘要 + evals 契约 case** 已足够；Pact 只在出现"独立消费者/跨团队/MCP"时引入（Pact 每个用例是"contract by example"，与全量 schema 互补）。
4. **Given/When/Then 只作为验收用例的书写格式**，不引入 Cucumber 运行时；把 evals case 的 `id/name/steps/graders` 映射成三句式，评审可读性最高。
5. **质量门禁要分层**：blocking（编译/单测/契约/关键 evals）→ warning（覆盖率趋势/视觉 diff）→ nightly（real-smoke/长跑/恢复脚本）。**禁止用覆盖率百分比当唯一门禁**。

## 1. 来源总表

| # | 来源 | 链接 | 组织/作者 | 许可证 | 成熟度 |
|---|---|---|---|---|---|
| T1 | 测试金字塔（Practical Test Pyramid） | https://martinfowler.com/articles/practical-test-pyramid.html | Ham Vocke / Thoughtworks（概念：Mike Cohn, Succeeding with Agile） | 站点文章版权归作者/Thoughtworks（**具体许可未核实**；引用链接） | 高（2018 文章；金字塔概念 2009 起） |
| T2 | 风险测试（Risk-based testing） | https://www.istqb.org/（术语与大纲；本次搜索到 ISTQB 术语表 PDF，**未逐条抓取官方页面**） | ISTQB | ISTQB 材料版权/使用条款（**未核实**） | 高（ISTQB 大纲核心概念） |
| T3 | 契约测试（Pact） | https://docs.pact.io/ · 代码：https://github.com/pact-foundation/pact-js | Pact Foundation | 文档 © Pact Foundation；`pact-js` **MIT**（GitHub LICENSE 抓取核实） | 高（微服务契约测试事实标准；文档 2026 仍在更新） |
| T4 | Given/When/Then（Gherkin） | https://cucumber.io/docs/gherkin/reference/ | Cucumber Open Source Project | 文档 © Cucumber 项目；**仓库许可证本次未核实** | 高（BDD/Gherkin 标准） |
| T5 | 质量门禁（SonarQube） | https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates | SonarSource | Sonar 文档/产品条款（**未核实**）；只引用概念 | 高（SonarQube 长期产品能力） |

## 2. 逐项分析

### T1 测试金字塔（Mike Cohn 概念 / Ham Vocke 实务文章）

- **是什么**：低层（单元）多、中层（服务/集成/契约）中、高层（UI E2E）少；核心两条：**不同粒度**、**越高层数量越少**；反模式是"冰淇淋筒"（大量 E2E + 少量单测）。
- **关键细节（已抓取）**：文章给出单元/集成/契约/UI/E2E/验收/探索各层定义；契约测试一节强调 CDC（consumer-driven contracts）与 Pact；E2E 一节明确"数量应压到最少、只覆盖关键用户旅程"；"验收测试"可用 Given/When/Then 表述；还强调**避免测试重复**（同一行为不要每层都测）。
- **优点**：给出可操作的"数量与职责"直觉；强调快速反馈；契约测试位置清晰。
- **缺点**：层级命名有争议（"service test"含糊）；现代前端可单测 UI；金字塔不解决"测什么"（需风险测试）。
- **采纳建议**：司墨分层映射——
  | 金字塔层 | 司墨落点 | 数量 |
  |---|---|---|
  | 单元 | `agentd/internal/**` Go `go test`（状态机/权限/预算/映射） | 多、秒级 |
  | 服务/集成 | 模块级：SQLite 迁移、事件日志、审批、恢复 | 中 |
  | 契约 | REST/WS：`evals/cases` 的 API/协议断言 + OpenAPI 覆盖检查 | 中 |
  | 验收 | `evals/cases` 的 critical 场景（用户旅程） | 少而精 |
  | E2E/UI | `evals/cases-real` + Playwright（关键 3–5 页，P1） | 极少 |

### T2 风险测试（ISTQB）

- **是什么**：按**风险 = 可能性 × 影响**分配测试力度；高风险项优先、覆盖更深（含负向/边界/恢复），低风险项抽样/探索。
- **适用场景**：里程碑验收、资源有限时决定"先测什么"；与 M1–M35 里程碑天然契合。
- **优点**：把有限测试时间投到最痛处；可与门禁绑定（高风险必须自动化）；评审时有共同语言。
- **缺点**：风险打分主观、易走过场；不做定期重评估会失真。
- **采纳建议（司墨风险清单，V1 固定 8 项）**：
  | 风险 | 影响 | 自动化要求 |
  |---|---|---|
  | 数据丢失/损坏（SQLite/WAL/迁移） | 极高 | 必测：备份恢复、迁移回填、重启持久 |
  | 权限越权（审批/沙盒/跨会话） | 极高 | 必测：R0–R5 矩阵、never fail-closed、跨会话拒绝 |
  | 长程任务卡死/恢复错误 | 高 | 必测：杀进程恢复、停滞检测、unknown 不重试 |
  | 成本失控（token/预算） | 高 | 必测：预算熔断、partial 汇报 |
  | 工具副作用重复 | 高 | 必测：幂等键/重复触发 |
  | 前端不可用/关键交互失败 | 中 | 视觉回归 + 键盘/a11y 检查 |
  | 部署/升级失败 | 中 | package/upgrade/restore 脚本验证 |
  | 文档/契约漂移 | 中 | OpenAPI/路由覆盖 + 契约 case |

### T3 契约测试（Pact）

- **是什么**：consumer-driven contract testing：消费者测试生成"契约（示例请求/响应）"，提供者用同一契约验证；Pact 文档强调"contract by example"，与 OpenAPI 静态 schema **互补而非替代**。
- **适用场景**：多服务/多团队、独立部署的 API 消费者；消息队列契约。
- **优点**：避免昂贵脆弱的 E2E；只测"实际被使用"的字段；可进 CI；MIT 生态。
- **缺点**：需要 broker/契约分发（或文件共享）；单机单消费者项目收益低；与 schema 测试易混淆。
- **采纳建议**：
  - **V1 不引入 Pact**：司墨只有 React 一个消费者，用 **OpenAPI 摘要 + evals 契约 case + 路由覆盖检查**（已有 `cli-coverage` 思路）足够；
  - 触发引入的条件：出现第二个独立消费者（CLI/MCP/第三方）、或接口开始独立演进；
  - 引入时优先 HTTP 契约 + 消息契约（审批/任务事件）。

### T4 Given/When/Then（Gherkin）

- **是什么**：用 `Given`（已知状态）`When`（动作）`Then`（可观察结果）书写可执行规格；Gherkin 支持 Feature/Rule/Background/Scenario Outline/Data Tables，官方建议**每个 example 3–5 步**、`Then` 断言"外部可观察输出"而非数据库内部状态。
- **适用场景**：验收用例、跨角色沟通、回归场景命名。
- **优点**：业务可读；强制"前置-动作-期望"三段；与自动化映射清晰。
- **缺点**：Cucumber 运行时+step definitions 维护成本高；过度形式化会写成语义空壳。
- **采纳建议**：
  - **只借格式，不引入 Cucumber**：evals case 的 `name` 改成 GWT 三句式，`steps` 自然映射 Given/When/Then，`graders` 即 Then 断言；
  - 模板：

```markdown
### <case-id>：<一句话场景>
- Given：<前置数据/会话/权限/任务状态>
- When：<用户动作或系统触发；尽量不带 UI 细节>
- Then：<可观察结果：事件/消息/API 响应/文件/状态；一条一个断言>
- 反例：<边界/失败路径（可选）>
```

### T5 质量门禁（SonarQube 概念 + CI 实践）

- **是什么**：在合并/发布前必须满足的**条件集合**（如"新代码 0 blocker、覆盖率不低于基线、重复率上限"）；不通过则阻断。SonarQube 文档将其作为质量门禁的产品化实现（本次抓取只拿到页面标题/导航，正文被站点截断，**仅引用概念，不引用具体阈值**）。
- **适用场景**：CI/PR 门禁；与测试金字塔、风险测试组合。
- **优点**：把"质量"变成客观可判定的门；防止回退；可审计。
- **缺点**：阈值拍脑袋会伤效率（门禁疲劳）；覆盖率≠质量；工具专用配置易漂移。
- **采纳建议（司墨三层门禁，与 `deploy/ci.ps1` 对齐）**：
  | 层 | 触发 | 内容 | 阻断 |
  |---|---|---|---|
  | **blocking** | 每次 push/PR | `go vet` + `go test`、tsc/build、`evals` critical 块、package sha256 | 是 |
  | **warning** | 每次 push/PR | 覆盖率趋势（不设百分比门槛）、视觉 diff（P1）、告警清单 | 否（显示趋势） |
  | **nightly/manual** | 定时/手动 | real-smoke（3 次中位数）、9 个专项 ps1（重启/长审批/并发/升级恢复）、长跑 | 是（发布前） |

## 3. 司墨可采用的最小流程 / 检查表 / 模板

### 3.1 最小流程（测试与发版）

```text
1. 需求/里程碑开始：更新风险清单（T2 表），标出本批"必须自动化"的风险项
2. 开发：核心逻辑 TDD；协议层先写/改契约（OpenAPI/事件文档）+ eval case（GWT 命名）
3. PR：blocking 门禁（go vet/test、tsc/build、critical evals）；新增行为必须有 case 或单测
4. 合并后：nightly 跑专项脚本 + real-smoke；门禁失败当天定位
5. 发布前：风险清单逐项打勾（高风险项"有自动化+证据"才可发）
6. 复盘：flake/漏测 → 补 case；门禁阈值按月校准（不拍脑袋）
```

### 3.2 检查表（新增功能/修复 PR）

- [ ] 该行为属于哪个风险项？高风险 → 有自动化测试（单测或 evals case）
- [ ] 测试是否落在正确层（能在单元层测的不要放 E2E；契约行为放契约层）
- [ ] 是否有反例/边界/错误路径（空结果、超时、权限拒绝、并发、非法输入）
- [ ] 是否修改 REST/WS 契约？→ 契约文档 + 覆盖检查 + 对应 case 已更新
- [ ] 测试是否确定性（mock 可控、无真实网络/时钟依赖；时间用假时钟）
- [ ] 是否产生重复测试（同行为已在低层覆盖，则高层只留冒烟）
- [ ] 失败信息是否可诊断（断言带期望/实际/证据路径）
- [ ] flake 风险：若涉及时序，阈值/重试/隔离策略已写明

### 3.3 模板：质量门禁看板（CM 一张表）

```markdown
| 门禁 | 命令 | 阻断 | 当前状态 | 最近失败 | Owner |
|---|---|---|---|---|---|
| Go 静态+单测 | `deploy×ci.ps1 -SkipWeb` / `go vet+test` | 是 | | | |
| 前端构建 | `node web/build.mjs` | 是 | | | |
| 契约/评测 | `node evals/run.mjs --only <critical>` | 是 | | | |
| 便携包 | `deploy/package.ps1` + sha256 | 是 | | | |
| 覆盖率趋势 | coverage report | 否 | | | |
| 真实模型 smoke | `evals/real-smoke.ps1`（3 次中位） | 发布前 | | | |
| 专项（重启/长审批/并发） | `evals/*.ps1` | 发布前 | | | |
```

### 3.4 采纳优先级

| 优先级 | 动作 | 理由 |
|---|---|---|
| P0 | 风险清单（8 项）进里程碑模板；critical evals 作为 blocking 门禁 | 立刻提升"测得对"的比例 |
| P0 | 新增/修改契约必须带 case + 覆盖检查 | 防止 API 漂移（现有路由多） |
| P1 | GWT 三句式命名/描述规范；失败信息规范（期望/实际/证据） | 评审与排障成本下降 |
| P1 | 覆盖率"趋势"而非"百分比门禁"；flake 登记与重试纪律 | 避免门禁疲劳/假绿 |
| P2 | 引入 Pact（当出现独立消费者时）；Playwright 视觉回归扩展 | 视规模与消费者数量 |

### 3.5 未核实/风险

- T2 ISTQB 官方页面未逐条抓取（仅搜索到术语表 PDF），风险测试表述基于通用 ISTQB 概念；
- T4 Cucumber 仓库许可证未核实（只确认文档版权）；采用 GWT 时不复制 Cucumber 文档文本；
- T5 Sonar 页面正文抓取被截断，**未引用任何具体阈值**；司墨门禁阈值需自基线校准；
- T1 文章版权归作者/Thoughtworks，引用链接与思想，不整段复制；
- 本文的"风险清单/门禁表"是**提案默认值**，需按 M1–M35 实际评测数据校准。
