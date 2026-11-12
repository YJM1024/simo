# 角色与阶段流程 · ROLES

状态：v0（流程文档；不写代码）
定位：把 `FRAMEWORK.md` 的通用门禁与 `SCENARIOS.md` 的 6 条场景，落到四个执行角色的职责、输入/输出、DoR/DoD、禁止事项与交接物。
配套：
- [`FRAMEWORK.md`](FRAMEWORK.md)（SDD/门禁/资产）
- [`SCENARIOS.md`](SCENARIOS.md)（6 场景）
- [`../../AGENTS.md`](../../AGENTS.md)（六维基线）
- [`skills/`](skills/)（8 个 skill）

## 0. 裁决

- **用户只验收前端效果**（视觉/交互/可用性）；后端契约、数据迁移、流程门禁由**验收 Agent** 独立签字。
- 验收 Agent 不属于四执行角色，直接对 Lead 负责；不得由实现者自签。
- 角色可以一人多岗，但**签字/评审不能自签**；小团队至少有“实现者 ≠ 验收人”。

---

## 1. 四个角色

### 1.1 产品（Product）

**职责**：定义问题/价值/范围/优先级/AC，维护产品契约与验收口径；决定“做什么、不做什么”。

| 项 | 内容 |
|---|---|
| 输入 | 用户原话/场景、约束、已有契约（`session-core-spec`、`session-spec`、`DESIGN.md`）、技术可行性反馈 |
| 输出 | 机会卡/pitch、product/spec 的 R/AC、非目标、优先级、验收口径、决策记录 |
| DoR | 问题/场景清楚；范围/非目标可写；有可验证信号；依赖/风险已知 |
| DoD | AC 可验证且映射断言；非目标明确；规格经 Lead + 技术评审；交接物齐全 |
| 禁止 | 先定实现/UI；AC 写“体验好/正常”；把“没时间”当跳过发现/规格；替验收 Agent 签字后端 |

**Skill**：`product-discovery`、`pitch-writing`、`spec-driven`。

### 1.2 前端（Frontend）

**职责**：按已批准设计与组件规范实现页面/组件；保证状态、响应式、可访问性、无定制 CSS。

| 项 | 内容 |
|---|---|
| 输入 | 批准的 spec/AC、`DESIGN.md`、组件 spec/画廊、API 契约、目标档位 |
| 输出 | 组件/页面实现、组件登记/截图、tsc/build 证据、DOM/交互测量、已知问题 |
| DoR | 设计/组件 API 已确认；所需组件已登记；API 契约可用或明确降级；目标档位明确 |
| DoD | AC 前端部分通过；三态/状态矩阵齐全；三档无破版；无页面定制 CSS；证据可复跑 |
| 禁止 | 页面写一次性组件/定制 CSS/inline style；未登记先用；用假数据/假 loading 冒充；改 token 绕过设计 |

**Skill**：`component-gallery`、`frontend-implementation`、`spec-driven`、`testing-strategy`。

### 1.3 后端（Backend）

**职责**：实现 API/数据/迁移/权限/并发/审计；给前端稳定契约与错误语义。

| 项 | 内容 |
|---|---|
| 输入 | 批准的 spec/AC、领域契约、数据/权限约束、迁移范围 |
| 输出 | API 契约/OpenAPI、错误码、迁移/回滚、测试/对账、审计、兼容说明 |
| DoR | 范围/非目标/AC 清楚；数据/权限边界明确；迁移有备份/回滚方案 |
| DoD | 契约可联调；正常/边界/错误/回滚测试通过；无密钥/路径泄露；旧数据兼容/迁移对账完成 |
| 禁止 | 先改表再补契约；内部字段直接暴露；迁移无备份/无回滚；用 200 假成功掩盖错误；绕过审批 |

**Skill**：`backend-contract`、`spec-driven`、`testing-strategy`、`release-checklist`。

### 1.4 测试（Test / QA）

**职责**：把 AC 映射为可执行断言/证据；独立验证功能、边界、回归、发布风险；可对实现打回。

| 项 | 内容 |
|---|---|
| 输入 | spec/AC、测试计划、build/URL/契约、前端截图、后端测试/迁移记录 |
| 输出 | test-plan/evidence、失败复现、通过/失败/未跑清单、发布建议、回归结论；发布前 `component-parity.md` + `component-parity-1600.png`/`375.png` |
| DoR | AC 可验证；环境/数据/账号可用；build/契约已交接；风险清单明确 |
| DoD | AC 100% 有断言/证据；正常/边界/错误/权限/迁移覆盖；失败有复现；未跑项标注；发布前组件 parity 图/报告齐全并由验收 Agent 签字 |
| 禁止 | 只测 happy path；用覆盖率代替风险覆盖；未跑写“通过”；失败重跑掩盖；替实现者自签 |

**Skill**：`testing-strategy`、`release-checklist`、`spec-driven`；`incident-retro`（待补）。

---

## 2. 角色 × 阶段矩阵

记号：`O=Owner（主责）`，`R=评审人`，`H=交接物`；`—` 表示该阶段不主责但可被咨询。一个格可多角色；同一阶段可并列 Owner，但签字人必须独立。

| 角色 | 发现 | 规格 | 设计 | 实现 | 验收 | 发布 |
|---|---|---|---|---|---|---|
| **产品** | **O**：问题/机会/非目标<br>R：Lead、用户<br>H：机会卡/决策 | **O**：R/AC/优先级/非目标<br>R：Lead、前后端<br>H：spec/AC | R：业务语义/AC<br>H：口径确认 | R：范围变更<br>H：决策记录 | R：AC 解释<br>H：口径澄清 | R：发布说明/已知问题<br>H：范围冻结 |
| **前端** | R：可行性/成本<br>H：技术约束 | R：可交互性/状态<br>H：交互风险 | **O**：组件/页面方案<br>R：产品、设计/验收、后端<br>H：design/COMP spec | **O**：组件/页面实现<br>R：测试、验收<br>H：build/截图/组件登记 | R：UI 走查<br>H：修复/证据 | R：前端范围确认<br>H：已知 UI 限制 |
| **后端** | R：可行性/数据边界<br>H：约束 | R：契约/数据可行性<br>H：风险 | **O**：API/数据/迁移设计<br>R：产品、前端、测试<br>H：contract/ADR/迁移方案 | **O**：API/迁移/权限实现<br>R：测试、验收<br>H：OpenAPI/迁移记录/测试 | R：契约对账<br>H：联调/修复 | **O**：构建/迁移/回滚<br>R：测试、验收 Agent<br>H：包/hash/迁移记录 |
| **测试** | R：可测性/风险<br>H：风险清单 | R：AC 可测性<br>H：测试策略 | R：测试设计<br>H：test-plan | R：可测 build<br>H：缺陷/复现 | **O**：独立验收<br>R：验收 Agent、Lead<br>H：evidence/通过清单 | **O**：smoke/回归<br>R：验收 Agent、Lead<br>H：release evidence/建议 |

**阶段门禁（简）**：

- 发现 → 规格：机会/非目标/信号齐全，产品 O；Lead 批准进入规格；
- 规格 → 设计：AC 可验证、非目标明确，产品 O；Lead + 前后端评审；
- 设计 → 实现：design/contract/迁移回滚齐全，前后端 O；产品/测试/验收评审；
- 实现 → 验收：build/契约/截图/证据齐全，前后端 O；测试独立验收；
- 验收 → 发布：A1–A10/AC 全过、未跑项有豁免，测试 O；验收 Agent 签字；**组件 parity 图/报告（1600/375 + component-parity.md）必须齐全并由验收 Agent 签字**；
- 发布：包/hash/smoke/回滚齐全，后端 O；测试/验收 Agent 复核；无 parity 签字不得上线。

> 每个门禁的“自动/人工”边界见 [`SCENARIOS.md`](SCENARIOS.md) §0.1。机器证明“有没有/跑没跑”，人证明“该不该/够不够”。

---

## 3. Skill 映射

| 角色 | 主用 Skill | 辅用/待补 |
|---|---|---|
| 产品 | [`product-discovery`](skills/product-discovery/SKILL.md)、[`pitch-writing`](skills/pitch-writing/SKILL.md)、[`spec-driven`](skills/spec-driven/SKILL.md) | `testing-strategy`（AC 可测性） |
| 前端 | [`component-gallery`](skills/component-gallery/SKILL.md)、[`frontend-implementation`](skills/frontend-implementation/SKILL.md) | [`spec-driven`](skills/spec-driven/SKILL.md)、[`testing-strategy`](skills/testing-strategy/SKILL.md) |
| 后端 | [`backend-contract`](skills/backend-contract/SKILL.md) | [`spec-driven`](skills/spec-driven/SKILL.md)、[`testing-strategy`](skills/testing-strategy/SKILL.md)、[`release-checklist`](skills/release-checklist/SKILL.md) |
| 测试 | [`testing-strategy`](skills/testing-strategy/SKILL.md)、[`release-checklist`](skills/release-checklist/SKILL.md) | [`spec-driven`](skills/spec-driven/SKILL.md)、`incident-retro`（待补） |

8 个 skill 已覆盖：product-discovery / pitch-writing / spec-driven / component-gallery / frontend-implementation / backend-contract / testing-strategy / release-checklist。
**待补**：`incident-retro`（事故复盘；当前先按 `SCENARIOS.md` 事故门禁与 `testing-strategy` 执行）。

---

## 4. 交接模板

> 模板文件在 [`templates/`](templates/)：`handoff-product.md` / `handoff-api.md` / `handoff-qa.md`；任务卡 `task-card.md`；spec 六件套在 `templates/*.md`。交接必须复制模板填写，不口头交接。

### 4.1 产品 → 前端/后端（Spec/AC Handoff）

```md
# HANDOFF · <CHANGE-ID> · 产品 → 前后端
- 版本/日期：
- 问题/用户场景（一句话）：
- 范围（IN）：
- 非目标（OUT）：
- R/MUST-SHOULD：
- AC（GWT，逐条编号；每条对应断言）：
- 依赖/假设/风险：
- 明确待确认项（不得带入实现）：
- 附件：spec/design/tasks 链接
- 签字：产品 ___ / Lead ___ / 接收方 ___
```

**接收判据**：AC 可验证、非目标明确、无“实现时再想”的决策；否则退回，不进入设计/实现。

### 4.2 后端 → 前端（OpenAPI/Contract Handoff）

```md
# HANDOFF · <CHANGE-ID> · 后端 → 前端
- API/版本/OpenAPI 路径：
- 请求/响应字段（含 null/缺省）：
- 错误码/HTTP/重试语义：
- 权限/scope/跨会话：
- 幂等/并发/分页/全量：
- 迁移/兼容/feature flag：
- 测试环境/夹具/示例响应：
- 已知限制/待补埋点：
- 签字：后端 ___ / 前端 ___
```

**接收判据**：字段/错误/权限/空态可联调；契约未定不得用假数据；Breaking change 有迁移任务。

### 4.3 前端 → 测试（Build Handoff）

```md
# HANDOFF · <CHANGE-ID> · 前端 → 测试
- buildId/URL/commit：
- 范围/路由/组件：
- 自测结果：tsc/build/关键交互（含命令）
- 截图：1600/1180/375（+ 指定档位/浮层打开）
- DOM 测量：关键尺寸/对齐/无横向滚动
- 已知问题/未覆盖：
- 测试数据/账号/开关：
- 签字：前端 ___ / 测试 ___
```

**接收判据**：build 可访问、截图/证据可复跑、已知问题透明；否则退回。

### 4.4 测试 → 发布（Release Evidence Handoff）

> 发布前按 [`RELEASE-CHECKLIST.md`](RELEASE-CHECKLIST.md) 与 [`COMPONENT-PARITY-GATE.md`](COMPONENT-PARITY-GATE.md) 执行；缺 parity 签字=No-Go。

```md
# HANDOFF · <VERSION> · 测试 → 发布
- 版本/范围/变更：
- AC/测试结论（通过/失败/未跑）：
- 失败清单/豁免（谁批/原因）：
- **组件 parity**：`component-parity.md`、`component-parity-1600.png`、`component-parity-375.png`；基线=冻结原型；当前 build=____；逐组件对齐结果；允许像素微差（记录范围），组件错位/风格漂移=No-Go；
- 截图/证据路径：
- 迁移/备份/回滚演练：
- 风险/已知问题：
- 发布建议（Go/No-Go）：
- 签字：测试 ___ / 验收 Agent ___ / Lead ___
```

**接收判据**：未跑项有豁免、失败有定级、回滚可用；否则 No-Go。

---

## 5. 与场景/框架/基线的关系

- 场景入口：[`SCENARIOS.md`](SCENARIOS.md)（新功能/组件/Bugfix/迁移/发布/事故）；
- 通用门禁/资产：[`FRAMEWORK.md`](FRAMEWORK.md)；
- 六维基线：[`../../AGENTS.md`](../../AGENTS.md)；
- 组件流程：[`component-system.md`](component-system.md)；
- 所有角色必须遵守：不虚构完成/验证；未跑项明确标注；设计先行；页面零定制 CSS（前端）；迁移可回滚（后端）。

## 6. 反模式（跨角色）

- 产品把方案当需求、没有非目标；前端/后端“先做再补 spec”；
- 后端用内部字段/假成功替代契约；前端用假数据/假 loading；
- 测试只测 happy path、未跑写通过；验收自签；
- 发布无回滚/无 smoke；事故只恢复不写复盘；
- 角色越界：用户验收后端/流程，或实现者替验收 Agent 签字。

---

*本文件只定义角色/阶段/交接，不写代码；具体场景门禁以 SCENARIOS 为准。*
