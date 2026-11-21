# 司墨项目完整记录与续接入口（CONTINUITY）

> 状态：**active**（2026-11-21）
> 用途：把项目的产品、规格、流程、任务、验收与当前真实状态收在一处；任何人（或新会话）从这里开始，不依赖聊天记录也能继续工作。
> 原则：**文档是事实来源，聊天只用于沟通**。讨论出的 spec/流程/状态变更，必须当天落盘并提交；未落盘的结论视为未发生。

## 1. 项目定位（一句话）

司墨（simo）是一个**只在本机运行的桌面 AI 秘书**：Go 单二进制后端 + 内嵌 React 前端 + WebSocket + SQLite，默认监听 `127.0.0.1:8787`，无鉴权；围绕“一位司墨 + 一套记忆 + 一段连续对话”，提供会话、任务/执行、工作台/视图、文件与交付物、记忆、团队/智能体、调度、设置、工具/能力、指标与多端同步等能力。

- 交付形态：单二进制 **`simo.exe`**；内部 Go module 仍为 `simo`；源码分为 `backend/` 与 `frontend/`。
- 数据根：默认 `%USERPROFILE%\.simo`（`SIMO_HOME`），SQLite `simo.db` + `artifacts/` + `workspace/` + `tmp/`。
- 安全边界：默认只监听本机、**无鉴权**；工具执行有沙盒模式与审批；不要把服务暴露到局域网/公网。
- 视觉基线：根目录 [`../DESIGN.md`](../DESIGN.md) 是**唯一视觉事实来源**；`docs/design-system.md`、`docs/visual-language.md` 是历史规范，不再作为当前裁决依据。

## 2. 先读顺序（10 分钟上手）

| 顺序 | 读什么 | 为什么 |
|---:|---|---|
| 1 | 本文件 | 项目全貌、当前真实状态、续接规则 |
| 2 | [`../README.md`](../README.md) | 启动、构建、能力边界、关键环境变量 |
| 3 | [`../AGENTS.md`](../AGENTS.md) | 项目执行约束：无 spec 不开工、角色/交接/验收红线 |
| 4 | [`product/TREE.md`](product/TREE.md) | 10 个能力域 P1–P10、L2/L3 功能点、PRD 状态与 spec/测试链接 |
| 5 | [`product/SPEC-GAP.md`](product/SPEC-GAP.md) | 当前缺口、未实现项、补课顺序；先看 §0 当前状态 |
| 6 | [`../specs/README.md`](../specs/README.md) | 规格目录类型：product / changes / test / COMP / templates |
| 7 | 当前要做的产品域 spec | 先读产品域 spec 的场景、PRD、AC，再读对应 change/开发/测试 spec |
| 8 | [`process/FRAMEWORK.md`](process/FRAMEWORK.md) + [`process/SCENARIOS.md`](process/SCENARIOS.md) + [`process/ROLES.md`](process/ROLES.md) | SDD 流程、场景矩阵、角色职责与交接 |
| 9 | [`tasks/STATUS.md`](tasks/STATUS.md) + [`tasks/acceptance.md`](tasks/acceptance.md) | 历史状态与签字证据；注意 STATUS 有滞后，需与 §4 对照 |

> 角色专用入口：前端 [`../frontend/README.md`](../frontend/README.md)；后端 [`../backend/README.md`](../backend/README.md)；部署 [`../deploy/INSTALL.md`](../deploy/INSTALL.md)。

## 3. 文档地图（按类型）

### 3.1 产品与规格（长期事实）

| 入口 | 内容 |
|---|---|
| [`product/TREE.md`](product/TREE.md) | 产品功能树：P1–P10 能力域、L2/L3、每 PRD 状态、六类产物链接 |
| [`product/TRACEABILITY.md`](product/TRACEABILITY.md) | `PRD → CHANGE → TEST` 三列追溯、覆盖状态、历史 FE/COMP 映射 |
| [`product/ID-SPEC.md`](product/ID-SPEC.md) | PRD/FE/BE/COMP/TEST/TASK/ACC 编号规则、文件落点、旧编号映射 |
| [`product/SPEC-GAP.md`](product/SPEC-GAP.md) | 规格缺口审计、当前状态、P0 补课顺序、文件规模估算 |
| [`../specs/README.md`](../specs/README.md) | 规格总索引；产品域 10、域测试计划 10、旧 FE 10、COMP 5 |
| [`../specs/product/README.md`](../specs/product/README.md) | 产品域 spec 规则（一域一份，PRD 作为章节） |
| [`../specs/changes/README.md`](../specs/changes/README.md) | 变更包规则（每个新增/迭代/修复一个 change 目录） |
| [`../specs/test/README.md`](../specs/test/README.md) | 域测试计划规则（一域一份，用例按 PRD 分节） |
| [`../specs/templates/product-spec.md`](../specs/templates/product-spec.md) | 产品域 spec 模板 |
| [`../specs/templates/test-plan.md`](../specs/templates/test-plan.md) | 域测试计划模板 |
| [`../specs/templates/change-package.md`](../specs/templates/change-package.md) | 变更包模板（proposal/spec/design/frontend/backend/tasks/test-plan/evidence） |

### 3.2 流程、规范与模板

| 入口 | 内容 |
|---|---|
| [`process/FRAMEWORK.md`](process/FRAMEWORK.md) | Simo SDD 框架：需求 → 规格 → 任务 → 实现 → 测试 → 验收 |
| [`process/SCENARIOS.md`](process/SCENARIOS.md) | 典型协作场景、自动/人工门禁、发布 parity 门禁 |
| [`process/ROLES.md`](process/ROLES.md) | 产品/设计、前端、后端、测试、验收、Lead 的职责与交接模板 |
| [`process/skills/`](process/skills/) | 可复用技能：backend-contract、component-gallery、frontend-implementation、pitch-writing、product-discovery、release-checklist、spec-driven、testing-strategy |
| [`process/templates/`](process/templates/) | 任务卡、交接、验收等模板 |
| [`process/standards/README.md`](process/standards/README.md) | 通用规范仓库内快照索引（canonical 在 `$DSH_HOME/rules/`） |
| [`process/standards/spec-workflow.md`](process/standards/spec-workflow.md) | 通用规格驱动工作流（可移植快照，不绑定本项目） |
| [`process/standards/agent-development.md`](process/standards/agent-development.md) | 通用 Agent 开发规范（可移植快照，不绑定本项目） |
| [`process/RELEASE-CHECKLIST.md`](process/RELEASE-CHECKLIST.md) | 发布检查清单 |
| [`process/COMPONENT-PARITY-GATE.md`](process/COMPONENT-PARITY-GATE.md) | 组件 parity 门禁（Blocking） |
| [`process/PRODUCTION-CUTOVER.md`](process/PRODUCTION-CUTOVER.md) | 生产切换 runbook |

### 3.3 任务、状态与验收

| 入口 | 内容 |
|---|---|
| [`tasks/README.md`](tasks/README.md) | 任务系统索引、金字塔、角色/写作用域、状态定义 |
| [`tasks/STATUS.md`](tasks/STATUS.md) | 历史阶段/已完成/进行中/阻塞/下一步；**最后更新 2026-11-13，可能滞后** |
| [`tasks/product.md`](tasks/product.md) | 产品需求金字塔与产品任务（P-*） |
| [`tasks/frontend.md`](tasks/frontend.md) | 前端设计/组件/页面任务（F-*） |
| [`tasks/backend.md`](tasks/backend.md) | 后端领域/API/数据任务（B-*） |
| [`tasks/acceptance.md`](tasks/acceptance.md) | 验收标准、检查表与签字证据；最新签字记录以文件内最新条目为准 |

### 3.4 设计、契约与运行

| 入口 | 内容 |
|---|---|
| [`../DESIGN.md`](../DESIGN.md) | 唯一视觉基线（暖纸 #FAF9F6、无渐变、当前尺寸） |
| [`m1-contract.md`](m1-contract.md) … [`m41-card-contract.md`](m41-card-contract.md) | 各里程碑产品/技术契约（会话、记忆、视图、卡片等） |
| [`session-core-spec.md`](session-core-spec.md) | 会话核心契约：会话/任务/消息边界、确认门禁 |
| [`task-complexity.md`](task-complexity.md) | 任务复杂度 C0–C4 与确认/子会话规则 |
| [`workspace-layout.md`](workspace-layout.md) | 数据/工作区/产物目录布局 |
| [`../frontend/review/COMPONENT-LIBRARY.md`](../frontend/review/COMPONENT-LIBRARY.md) | 组件库与画廊登记 |
| [`../frontend/review/REVIEW.md`](../frontend/review/REVIEW.md) | 前端审查记录 |
| [`../evals/RELEASE.md`](../evals/RELEASE.md) | 评测最终通过数/分层结果（不预写未定数字） |

## 4. 当前真实状态（2026-11-21）

> 本节是**当前状态**；`tasks/STATUS.md` 顶部已是 2026-11-21 状态块，2026-11-20 块保留为历史，不得用旧条目覆盖本节。**2026-11-21 会话域批次 3/4/5 收口后**：前端 115、后端 246、E2E 19（详见 [`testing/CONV-EVIDENCE-20261121.md`](testing/CONV-EVIDENCE-20261121.md) 与根目录 [`../HANDOFF.md`](../HANDOFF.md)）。

### 4.1 产品与规格底座

- 产品域：**10 个**（P1–P10），产品域 spec：**10/10**；域测试计划：**10/10**；E2E 测试计划：**1/1**（[`../specs/test/e2e/README.md`](../specs/test/e2e/README.md)）。
- L3 功能点：**71 个 PRD**；状态：implemented 17、partial 38、unimplemented 16（`PRD-TOOL-003` 按后端无 Skills 实现/测试降级）。
- 追溯覆盖：**covered 0、partial 48、gap 23**。已有 115 个前端单测 + 19 个 CDP E2E + 246 个后端测试的执行证据，并按 `PRD → CHANGE → TEST` 回写；但证据只覆盖部分 PRD/AC，不能升级 covered；测试计划文件存在不等于覆盖。
- 历史规格：10 个 FE 变更包 + 5 个 COMP 组件 spec 保留，映射为 `CHG-LEGACY-*` / `COMP-LEGACY-*`，不重命名、不删除。

### 4.2 16 个 `unimplemented` PRD（不得写成已完成）

| 能力域 | PRD | 功能点 |
|---|---|---|
| P1-CONV | `PRD-SYNC-005` | 远程访问与通知中心 |
| P2-TASK | `PRD-TASK-003` | 长任务异步与开始/结束消息 |
| P2-TASK | `PRD-TASK-004` | 复杂度分级与确认门禁 |
| P2-TASK | `PRD-TASK-005` | 子会话与任务归属 |
| P3-WORK | `PRD-WORK-005` | 自定义视图 13 类块 |
| P5-MEM | `PRD-MEM-006` | 记忆迁移与索引 |
| P6-TEAM | `PRD-TEAM-004` | 团队只读投影与对话创建 |
| P6-TEAM | `PRD-TEAM-006` | 子代理并行与团队任务板 |
| P7-SCHED | `PRD-SCHED-005` | 失败·重试·通知 |
| P8-SET | `PRD-SET-003` | 外观·主题·语言 |
| P8-SET | `PRD-SET-005` | 快捷键·关于·版本 |
| P8-SET | `PRD-SET-006` | 能力管理（MCP/CLI/Skills/目录） |
| P9-TOOL | `PRD-TOOL-003` | Skills 发现与加载（后端无实现/测试） |
| P9-TOOL | `PRD-TOOL-004` | MCP 接入 |
| P9-TOOL | `PRD-TOOL-007` | 能力目录 L0–L3 |
| P10-METRIC | `PRD-METRIC-006` | 导出·对比·告警 |

### 4.3 测试与线上状态

- **8787 当前实例**：2026-11-21 02:27 由 Lead 重启，二进制 `backend/simo-live-final4.exe`（由当前源码构建），命令 `serve -addr 127.0.0.1:8787 -model real`，`SIMO_HOME=E:\dsh_home\workspaces\agent\data`。
  - `GET /api/health` → **200**，`{"ok":true,"ready":true,"time":1795199538078,"checks":{"db":"ok","modules":["sessions","chat","tasks","memory"]}}`。
  - `GET /` 的 `<meta name="build-id">` = **`mwp7s4x6-xfe53`**；modelMode = **real**（由 `-model real` 启动参数确认）。
  - 该实例通过后台 job `pwsh-109d2d9819a3486a` 保持运行；本节写的是**当前实例**，不是历史 STATUS 中的 `mwdqyg05-famq9` 或 `mwfzyf8u-h9f0d`。
- **前端单测**：**115/115 PASS、0 failed**（13 个测试文件，2026-11-21 批次 3/4/5 本机实测；`--pool=threads`，exit 0）：App.conversation 22、App.integration 7、App.tabsync 4、App.tabsync.channel 2、Composer 15、ConversationPanel 7、conversation-responsive 6、LibraryUtilities 2、MessageItem 18、MetricsDashboard 9、RightPanel 6、Sidebar 9、TimelineGroups 8；`tsc --noEmit` exit 0；配置为 Vitest + Testing Library + jsdom。日志 `.tmp/release-scribe/front-vitest-threads.log`。
- **CDP E2E**：**19/19 PASS、exit 0，连续两次**（2026-11-21 批次：`run-20261121-131214.log`、`run-20261121-131332.log`）；07 工作台交付物场景按 OOS 默认 skip（`E2E_INCLUDE_OOS=1` 可含）。报告与截图在 `frontend/e2e/report/cdp/`。19 个场景 = 原 11 个 + 新增 08–16（新建会话物化、列表/消息错误恢复、时间轴增长 prepend 锚定、发送失败不假落库、搜索、多标签同步等）。
  - runner：`frontend/e2e/scripts/cdp-runner.mjs`，命令 `cd frontend && npm run test:e2e:cdp`；测试计划见 [`../specs/test/e2e/README.md`](../specs/test/e2e/README.md)。
  - **限制**：CDP runner 不是 Playwright Test；`test:e2e` 的 Playwright 普通路径仍受本机沙箱限制，CI 未实跑；E2E 使用隔离 API 19230 与临时 `SIMO_HOME`，不是 8787 生产实例；未覆盖记忆/团队/调度/设置/工具等域。
- **后端测试**：`cd backend && ..\toolchain\go.ps1 test ./... -count=1` **246 个顶层测试、exit 0、16 包 ok、0 fail**（2026-11-21 批次 3/4/5 本机实测；`^func Test` 计数 246；本批新增 19 个 P1 测试：messages 5 + sessions 5 + ws 4 + category 2 + management 3；日志 `.tmp/release-scribe/go-test-final.log`）。2026-11-20 的 223/223 为历史基线。P1–P9 的用例级证据见各域 test-plan 与 [`testing/`](testing/)；测试数增加不等于产品 AC 全量完成。
- **遗留域包**：P1–P4、P10 已补 5 个 `CHG-LEGACY-*` 域级归档包（各 7 件套）；连同 P5–P9 共 10 个 legacy domain 包，仅登记真实证据与缺口，不升级 covered、不代表六类产物闭环。
- **覆盖率**：`frontend/coverage/coverage-summary.json` 当前只统计 `frontend/src/components/library.tsx`：**Stmts 82.83% / Branch 83.64% / Funcs 84.14% / Lines 85.88%**（2026-11-21 批次重跑，阈值 80；日志 `.tmp/release-scribe/front-coverage-threads.log`）；这是组件库单文件覆盖，**不是全仓覆盖率**，不能外推。
- **发布门禁**：`check:sdd` PASS（15 specs、COMP 5、A 134/134、manifest 33、0 fail 0 warn）；`check:trace` PASS（71 PRD、15 change 包、0 失败、0 提示）；组件 parity 门禁 = Blocking；`check:visual` 整页像素对比 = Nightly/Warning，不作为发布阻断。
- **最近一次文档同步**：2026-11-21 会话域批次 3/4/5 收口提交 `f357c6ae25735abd53f5347753ec05b82533180e`（parent `1592a90c2e530de04445817916a4b7d052bb7cf0`，message `test: close conversation-domain tests, spec and E2E evidence`），包含前端/后端测试、E2E 08–16、m13 文件锁修复、prepend 修复、P1 spec/test-plan/CONV-CLOSURE、5 个 `CHG-CONV-*` 与证据/状态文档；CI 结论见下条。更早：测试资产提交 `c1d16b9319a304afc32d0cc9663ebcca7e4f92a0`，SDD/证据收口提交 `5bb15cb2929b61ecb7181af69f221e675a5141bc`（194 个文档/脚本/package 文件，64 新 blob，130 复用），域级 legacy 包提交 `59a12a8`（P1–P4/P10 5 包 35 文件）、复审修正 `bdc0291`；更早文档提交 `beadd280351a2226defb3467e51fb6eaa7270782`。具体以 GitHub main 历史为准。
- **CI 远程状态**：2026-11-21 会话域批次 3/4/5 最终 CI run [`44874959613`](https://github.com/YJM1024/simo/actions/runs/44874959613)（head `788f2ace516b66bd809b94e56d19a5c627e3cbc1`，测试修复提交）：**Linux quality success、Windows build-test success**；`optional docker build`、`optional real-model smoke` 为 **skipped，不计入通过**。此前 run `44871922169`（head `f357c6a`）Windows 失败于 `TestP1ConvWSSubscribeReplayAndSinceContinuation`（8s 等待预算、慢落库），由 `788f2ac` 放宽该用例等待上限后转 success（不改断言、不 skip）；再往前 run `44867249776`（head `1592a90`）Windows 失败于 `TestM13PauseAndRunNow` TempDir 文件锁，已修。CI 使用 mock eval，不能替代真实模型验收。
- **重启/多进程评测**：12 个脚本全部 exit 0，脚本内 **118 条检查 PASS**；明细见 [`testing/PENDING-EVALS-20261121.md`](testing/PENDING-EVALS-20261121.md)。不改变 covered 0 / partial 48 / gap 23。
- **本轮证据回写状态**：2026-11-21 会话域批次 3/4/5 收口提交 `f357c6ae25735abd53f5347753ec05b82533180e`（前端 115 / 后端 246 / E2E 19 / m13 修复 / prepend 修复 / P1 spec 与 5 个 CHG-CONV 包）；更早：后端证据映射 `5bb15cb`、CI 修复 `49083c1`、文档收口 `9b417eb` 及日期指针修正。后续提交前必须重新确认 remote head，不得用旧 SHA 强推。

### 4.4 明确未完成 / 不可宣称

- 71 个 PRD 中 **0 个 covered**；48 个 partial 仍缺完整 AC/权限/异常/前端证据；23 个 gap（含 16 个 unimplemented）。
- 10 份产品域 spec 是骨架；10 份域 test-plan 已回写 115 单测 / 19 CDP E2E / 246 后端测试的实际证据，但尚无按域执行的产品 AC 系统测试报告，不能据此升级 covered。
- 真实模型长程、团队隔离、调度失败、权限 fail-closed、文件上传/预览/PDF/Office 等高风险项仍缺当前 build 证据；CDP E2E 07 只验证了交付物可见与下载，不覆盖预览/上传。
- `tasks/frontend.md` 仍写“前端只做对话、工作台”，与后端能力面不一致；`docs/frontend-feature-map.md` 是 M67 前旧布局，不能当现状。以 `TREE.md`、产品域 spec 与当前代码为准。
- 容器/Docker 本机未实测；`deploy/INSTALL.md` 部分步骤未完整实测；不得把未验证能力写成已交付。

## 5. 如何开始下一项工作（强制流程）

```text
选功能点 → 建/更新 change 包 → 写产品 spec 变更 + 开发 spec → 任务卡
        → 实现 → 测试计划/用例执行 → 独立验收 → 更新 TREE/TRACE/STATUS/acceptance → 提交
```

1. **选功能点**：从 [`product/TREE.md`](product/TREE.md) 或 [`product/SPEC-GAP.md`](product/SPEC-GAP.md) 选一个 PRD；确认优先级、当前状态、依赖。
2. **建变更包**：在 `specs/changes/<CHG-ID>/` 下至少具备 `proposal.md`、`spec.md`、`design.md`（有 UI 时）、`frontend.md`/`backend.md`（不涉及写 N/A + 理由）、`tasks.md`、`test-plan.md`、`evidence.md`；`spec.md` 必须写 `Implements: PRD-xxx`。
3. **产品 spec 同步**：改行为 → 同步 `specs/product/<P*-*>/spec.md` 中对应 PRD 的场景/行为/AC/状态；不改行为 → 只改 change spec。
4. **任务卡**：每个执行任务写 owner、scope（允许修改的目录/文件）、依赖、AC、证据要求、回滚方式；实现者不得自签。
5. **实现**：无开发 spec 不写代码；前端先设计/组件方案，遵循 `DESIGN.md` 与组件库/parity 门禁；后端先契约、错误/权限/迁移/观测。
6. **测试**：在 `specs/test/<P*-*>/test-plan.md` 增加用例（CASE ID → PRD → 前置 → 步骤 → 断言 → 数据/mock → 执行证据）；只写“通过”不算，必须有命令/日志/截图/hash。
7. **独立验收**：由非实现者按 AC 验收；`tasks/acceptance.md` 记录 build/commit、环境、证据、未造出项；用户只最终验收前端效果，验收 Agent 对后端流程签字。
8. **更新与提交**：更新 `TREE.md`、`TRACEABILITY.md`、`SPEC-GAP.md` 当前状态；更新 `STATUS.md`（带日期与 build）；当天提交文档，不把聊天记录当交付。

### 5.1 文档当天落盘规则

- 任何讨论产生的产品决定、spec 变更、流程/门禁变更、验收结论，**当天**写入对应文档并提交；未落盘 = 未决定。
- 变更行为必须同时更新产品域 spec 与测试计划；只改代码不改 spec 不允许合入。
- 状态只能按证据升级：`missing`/未执行不得写成 `covered`；`unimplemented` 不得写成 `partial` 或 `implemented`，除非有当前实现与 AC 证据。
- 文档中引用 build/commit 时必须可复核；过期的 build 要标“历史”，不得冒充当前。
- 归档/删除历史规格前必须先在 `TRACEABILITY.md` 留映射；旧 FE/COMP 不重命名、不删除。

## 6. 角色与交接

- 角色与阶段矩阵：[`process/ROLES.md`](process/ROLES.md)；场景与门禁：[`process/SCENARIOS.md`](process/SCENARIOS.md)。
- 默认交接物：任务卡 + 变更包 + 测试计划 + 证据 + 未决问题；不交“口头完成”。
- 用户侧验收：只看前端可见效果；后端/数据/权限流程由验收 Agent 按 AC 签字。
- Lead：协调、裁决、最终验收；不直接绕过 spec 改业务代码。

## 7. 常用命令与环境

```powershell
# 启动（默认真实模型；离线用 -model mock）
cd backend
.\simo.exe serve

# 前端检查（按仓库当前脚本）
cd frontend
pnpm typecheck
pnpm build
pnpm check:sdd
pnpm check:visual      # Nightly/Warning，非发布阻断
```

- 默认地址：`http://127.0.0.1:8787`；数据根：`%USERPROFILE%\.simo`。
- Node 不在 PATH 时，使用本机 DSH 运行时内的 Node：`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`。
- 完整环境变量、Key、备份/迁移、CI/容器见 [`admin-guide.md`](admin-guide.md)、[`../deploy/INSTALL.md`](../deploy/INSTALL.md)、[`../deploy/CI.md`](../deploy/CI.md)、[`../deploy/CONTAINER.md`](../deploy/CONTAINER.md)。

## 8. 仓库与同步

- GitHub：<https://github.com/YJM1024/simo>（main）。
- 本仓库无本地 git CLI 时，文档同步使用 GitHub Git Data API（blob → tree → commit → 更新 ref），不虚构本地 commit。
- 同步范围：`docs/` 全量、`specs/` 全量、`AGENTS.md`、`README.md`；不提交 `data/`、`.tmp/`、token、截图二进制、`node_modules/`、构建产物。
- 文档同步后必须核对：`docs/**.md` 与 `specs/**.md` 均存在、内容 hash 与本地一致；远程已有 LICENSE 等文件不删除。

## 9. 维护

- 本文件由 **design-scribe** 维护；结构性变更（新增能力域、改 spec 分层、改验收门禁）必须同步更新 §3/§4/§5。
- 每次提交文档后，若当前状态变化（测试数、8787 build、覆盖数、未实现项），更新 §4 的日期与数字；不确定的数字写“未知/待核验”，不猜。
- 相关索引：[`README.md`](README.md)（文档索引）、[`../specs/README.md`](../specs/README.md)（规格索引）、[`product/TREE.md`](product/TREE.md)（功能树）。
