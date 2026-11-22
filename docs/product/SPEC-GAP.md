# 司墨规格缺口审计（SPEC-GAP）

> 状态：**active**（2026-11-22 P1 收口后）
> 审计对象：[`TREE.md`](TREE.md) 的 72 个 L3 功能点（含 2026-11-22 新增 `PRD-CONV-008`）、现有 specs、docs/tasks 状态与前端/后端代码面。
> 原则：**不把“代码里有接口”当成“产品已覆盖”**；不把“曾经口头验收”当成“有测试证据”。

## 0. 当前状态（2026-11-22 整线复核后）

> 本节是**当前状态**；§1–§7 是落地前的历史审计，保留不改，因此其中“0/12”等数字是历史快照，不是现状。

- 产品域 spec：**10/10**（P1–P10），路径 `specs/product/<P*-*>/spec.md`；每域 L3 全列，未实现项标 `unimplemented`。
- 域测试计划：**10/10**，路径 `specs/test/<P*-*>/test-plan.md`；2026-11-20 已回写 69 个前端单测、11 个 CDP E2E 与 223 个后端测试的**部分执行证据**，覆盖 P1–P10；未覆盖用例仍标 `missing`。
- 域级变更包：**10/10**（`CHG-LEGACY-P1-CONV`…`CHG-LEGACY-P10-METRIC`，P1–P10 各 1 包，每包 7 件套）；P1–P4/P10 为 2026-11-20 补齐的 legacy 归档包，只登记真实实现/证据/缺口，不升级 covered。
- E2E 测试计划：**1/1**（[`../../specs/test/e2e/README.md`](../../specs/test/e2e/README.md)）；CDP runner 11/11 PASS、连续 5 次，Playwright Test/CI 仍未接通。
- 覆盖：**covered 11、partial 38、gap 23**（共 72；2026-11-22 收口，P1 为 11 covered / 1 conditional / 0 not covered / 1 gap）。测试计划文件存在或局部用例跑过，不足以升级覆盖；必须六类产物 + 完整 AC 证据。
- 未实现项（`unimplemented`）：16 个（含 `PRD-TOOL-003`，按后端无实现/测试口径）；逐项见各域 spec 的“当前实现状态”与 TREE。
- 历史 FE/COMP：10 个 FE + 5 个 COMP，已映射为 `CHG-LEGACY-*` / `COMP-LEGACY-*`，不重命名、不删除。
- 文件规模：10 产品 spec + 10 域测试计划 + 1 E2E 计划 + 5 COMP + 10 历史 FE + 模板；不按 72 个功能点各建文件。

> 结论：底座已从“0 产品 spec”推进到“10 域骨架 + 10 个 legacy 域包 + 部分执行证据”；但**没有人可以据此宣称功能已覆盖/测试已全部通过**。下一步是补齐六类产物与完整 AC 证据、把 `unimplemented` 开实现型变更包，而不是继续扩写规则或把 legacy 归档包当完成。

### 0.1 CHG-LEGACY-* rewrite 计划（2026-11-21）

> 10 个 `CHG-LEGACY-*` 包状态含「归档」，`check-sdd` 的 R1/R2/R3 按「archived 则跳过」放行；**跳过不等于完成**，rewrite 完成前不升级 covered。`historical` 不单独作为跳过条件，必须含 `archived` / `归档` 字样。

| 归档包 | 目标新包/域 | owner | 备注 |
|---|---|---|---|
| `CHG-LEGACY-P1-CONV` | CONV 域正式包（`CHG-CONV-001..003` 已承接部分 P1 PRD） | 产品 | 归档包只登记历史实现/证据，不升级 covered；余下 PRD 由正式包补齐 |
| `CHG-LEGACY-P2-TASK` | TASK 域正式包（待建 `CHG-TASK-*`） | 产品 | 按 PRD 拆正式包，归档包不升级 covered |
| `CHG-LEGACY-P3-WORK` | WORK 域正式包（待建 `CHG-WORK-*`） | 产品 | 同上 |
| `CHG-LEGACY-P4-FILE` | FILE 域正式包（待建 `CHG-FILE-*`） | 产品 | 同上 |
| `CHG-LEGACY-P5-MEM` | MEM 域正式包（待建 `CHG-MEM-*`） | 产品 | 同上 |
| `CHG-LEGACY-P6-TEAM` | TEAM 域正式包（待建 `CHG-TEAM-*`） | 产品 | 同上 |
| `CHG-LEGACY-P7-SCHED` | SCHED 域正式包（待建 `CHG-SCHED-*`） | 产品 | 同上 |
| `CHG-LEGACY-P8-SET` | SET 域正式包（待建 `CHG-SET-*`；涉及 SYS PRD 的另拆） | 产品 | 同上 |
| `CHG-LEGACY-P9-TOOL` | TOOL 域正式包（待建 `CHG-TOOL-*`） | 产品 | 同上 |
| `CHG-LEGACY-P10-METRIC` | METRIC 域正式包（待建 `CHG-METRIC-*`） | 产品 | 同上 |

### 0.2 CONV 域收口（2026-11-22）

收口复核（[`../testing/STOP-EVIDENCE-2-20261122.md`](../testing/STOP-EVIDENCE-2-20261122.md)、[`../testing/ACCEPT-CONV-8-20261122.md`](../testing/ACCEPT-CONV-8-20261122.md)）：12 个验收面 PRD = **11 covered / 1 conditional / 0 not covered**，`PRD-SYNC-005` 保持 gap；33 条生效 AC = 32 通过 / 1 部分（`AC-CONV-006-02` 输入法待人工），SYNC-005 2 条 blocked。已关闭项：时间轴命中（`AC-CONV-007-02`，`ACCEPT-CONV-6` 真机 8787 + CDP 9223 判 pass）、行内计数（`AC-CONV-001-05`）、未读持久化（`AC-SYNC-004-01/02/03`）、置顶（`AC-CONV-001-04`，含归档守卫与重启保持）、草稿 404（草稿不落列表，按归档路径返回 404 为预期）、空态降级（`AC-CONV-008-03`，树空/右栏无投影按空态渲染）、表格渲染（`AC-CONV-004-01` 补 GFM 表格对齐/转义/`role=region` 单测后 pass；组件 `conversation-panel` 的 A3 真机复签另记 conditional）、停止（`AC-CONV-005-01/02` 判 pass：停止按 `messageId` 定向，correct 帧带 `messageId`、双流只停目标，`stop_interrupt_test.go:32`/`:402`，前端 `App.conversation.test.tsx:455`）、发送幂等（`idempotency.go` + `p1_conv_chat_idempotency_test.go` 7 条 pass）、右栏投影（`AC-CONV-008-04` 真机 200→304，ETag `spec-c5a2d772dd1d5d88`、304 空体；375 四态截图已补，见 `ACCEPT-CONV-8`）。保留项：`PRD-SYNC-005` 不纳入本轮验收（gap）；`PRD-CONV-006` conditional，`AC-CONV-006-02` 真实中文输入法需人工验证（33 条生效 AC 中唯一 partial）；`AC-CONV-008-05` 的组件级负路径 G18 缺断言，不阻塞该 AC。CONV-005 残余未验证：真实厂商连接中断、跨标签双 WS、断网 e2e。

## 1. 结论先行（历史快照，落地前）

1. **产品域 spec：0/12**。当前没有任何 `specs/product/<域>/spec.md`；所有 PRD 的“产品 spec”列均为待建。
2. **域测试计划：0/12 + 0/1 E2E**。现有测试计划都在历史 FE/COMP 目录内，不能替代域级归并。
3. **追溯覆盖：covered 0、partial 48、gap 23**（共 71；2026-11-20 证据映射后更新，历史快照原为 0/22/49）。没有功能点达到六类齐全。
4. **已有能力不少，但“可证明”不足**：后端路由覆盖会话、任务、团队、调度、记忆、视图、指标等；前端目前只有对话/工作台两页，很多能力没有用户入口。
5. **最大风险不是缺代码，而是缺产品边界与验收证据**：任务生命周期、复杂度/确认、团队隔离、调度失败、权限 fail-closed、文件预览/下载等，均存在“有接口/有文档、无产品 AC/无系统测试”。

## 2. 数量总览

| 项 | 当前 | 目标 | 差距 |
|---|---:|---:|---|
| 能力域 | 12（已定义） | 12 | 0 |
| 产品域 spec | 0 | 12 | 12 |
| 域测试计划 | 0 | 12 | 12 |
| E2E 测试计划 | 0 | 1 | 1 |
| 组件 spec（COMP） | 5 | 按组件公共契约动态 | 至少补 Sidebar/Timeline/OverviewPanel 等 |
| 历史变更包（FE） | 10 | 保留并映射 | 0（不重命名） |
| 新建变更包（CHG） | 0 | 按活跃变更 | 先补 P0 能力 |
| L3 功能点 | 71 | 与产品边界一致 | 见各域 |

## 3. 分域缺口

### CONV · 会话与消息（历史快照，现状见 §0.2）

<a id="domain-conv"></a>

- 功能点：7；已签/已实现 6、部分 1、设计 0、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/CONV/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/CONV/test-plan.md`）。
- 主要缺口：
  - 无 `gap` 功能点，但仍缺产品 spec 与域测试归并。
- 下一步：先写产品域 spec 的 `PRD-CONV-001`、`PRD-CONV-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### TASK · 任务与执行

<a id="domain-task"></a>

- 功能点：6；已签/已实现 0、部分 3、设计 3、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/TASK/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/TASK/test-plan.md`）。
- 主要缺口：
  - `PRD-TASK-001` 任务生命周期与执行组：后端 tasks 路由存在，但无产品 spec、无前端执行组完整契约、无域测试计划。
  - `PRD-TASK-002` 任务概览与进度：右栏/概览已有部分展示；无 PRD、无 AC、无进度口径与测试。
  - `PRD-TASK-003` 长任务异步与开始/结束消息：仅有 m19 契约；异步开始/结束消息、解耦与恢复未实现验收。
  - `PRD-TASK-004` 复杂度分级与确认门禁：C0–C4 已写入 docs/task-complexity.md，但无产品 spec、无实现、无测试。
- 下一步：先写产品域 spec 的 `PRD-TASK-001`、`PRD-TASK-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### WORK · 工作台与视图

<a id="domain-work"></a>

- 功能点：5；已签/已实现 3、部分 1、设计 1、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/WORK/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/WORK/test-plan.md`）。
- 主要缺口：
  - `PRD-WORK-005` 自定义视图 13 类块：只有视图 Schema/渲染契约，无前端页面、无产品 spec、无测试。
- 下一步：先写产品域 spec 的 `PRD-WORK-001`、`PRD-WORK-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### FILE · 文件与交付物

<a id="domain-file"></a>

- 功能点：6；已签/已实现 1、部分 5、设计 0、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/FILE/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/FILE/test-plan.md`）。
- 主要缺口：
  - `PRD-FILE-001` 会话文件聚合与列表：后端聚合/分页存在，前端无文件页；无产品 spec 与测试。
  - `PRD-FILE-002` 上传与附件：上传后端存在，前端无附件入口；缺大小/类型/失败路径 AC。
  - `PRD-FILE-005` 工作区目录与输出隔离：仅 docs/workspace-layout 约定；无产品 spec、无隔离/越权测试。
  - `PRD-FILE-006` 文件生成（PDF/Office/图片）：后端文件生成契约存在；无统一产品 AC、无生成失败/回滚测试。
- 下一步：先写产品域 spec 的 `PRD-FILE-001`、`PRD-FILE-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### MEM · 记忆

<a id="domain-mem"></a>

- 功能点：6；已签/已实现 0、部分 5、设计 1、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/MEM/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/MEM/test-plan.md`）。
- 主要缺口：
  - `PRD-MEM-001` 记忆条目·作用域·搜索：后端 API 存在，前端无记忆页；无产品 spec 与域测试。
  - `PRD-MEM-002` 实体·关系·金字塔：后端实体/关系/canonical/金字塔 API 存在；无产品行为与可见入口。
  - `PRD-MEM-003` 冲突与争议保留：冲突 API 存在；无冲突解决产品规则、无测试。
  - `PRD-MEM-004` 召回 R1/R2：R1/R2 后端存在；召回质量/失败降级无产品验收。
- 下一步：先写产品域 spec 的 `PRD-MEM-001`、`PRD-MEM-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### TEAM · 团队与智能体

<a id="domain-team"></a>

- 功能点：6；已签/已实现 0、部分 4、设计 2、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/TEAM/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/TEAM/test-plan.md`）。
- 主要缺口：
  - `PRD-TEAM-001` 智能体 roster 与模型：后端 roster/模型信息存在；前端无入口、无产品 spec。
  - `PRD-TEAM-002` 团队成员=子会话+负责人：团队/成员后端存在；成员边界与负责人规则未产品化。
  - `PRD-TEAM-003` 团队模板·角色·触发器：模板/触发器仅后端契约；无产品 spec、无 UI。
  - `PRD-TEAM-004` 团队只读投影与对话创建：只读投影/通过对话创建仍为设计；无验收。
- 下一步：先写产品域 spec 的 `PRD-TEAM-001`、`PRD-TEAM-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### SCHED · 调度

<a id="domain-sched"></a>

- 功能点：5；已签/已实现 0、部分 4、设计 1、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/SCHED/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/SCHED/test-plan.md`）。
- 主要缺口：
  - `PRD-SCHED-001` 定时任务 CRUD：后端 CRUD 存在，前端无调度页；无产品 spec。
  - `PRD-SCHED-002` 列表与下次运行时间：仅后端返回；时区/下次运行口径未产品化。
  - `PRD-SCHED-003` 立即运行与幂等：run-now 后端存在；重复触发/并发幂等未验收。
  - `PRD-SCHED-004` 重复规则与时区：规则解析存在；DST/非法规则/边界无测试。
- 下一步：先写产品域 spec 的 `PRD-SCHED-001`、`PRD-SCHED-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### SET · 设置与配置

<a id="domain-set"></a>

- 功能点：6；已签/已实现 0、部分 3、设计 0、未实现/规划 3。
- 产品 spec：**待建**（目标：`specs/product/SET/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/SET/test-plan.md`）。
- 主要缺口：
  - `PRD-SET-001` 模型与 Provider：配置文档存在；前端无设置页，模型切换/只读边界未产品化。
  - `PRD-SET-002` 权限·沙盒·审批：权限/审批后端存在；无统一设置入口与 fail-closed 验收。
  - `PRD-SET-003` 外观·主题·语言：未实现；当前只有浅色暖纸基线，无主题/语言设置。
  - `PRD-SET-004` 数据目录·备份·恢复：部署文档有备份/恢复流程；产品入口与恢复演练未验证。
- 下一步：先写产品域 spec 的 `PRD-SET-001`、`PRD-SET-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### TOOL · 工具与能力

<a id="domain-tool"></a>

- 功能点：7；已签/已实现 0、部分 5、设计 1、未实现/规划 1。
- 产品 spec：**待建**（目标：`specs/product/TOOL/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/TOOL/test-plan.md`）。
- 主要缺口：
  - `PRD-TOOL-001` 工具注册·执行·审计：工具运行时/审计后端存在；无产品 spec、无前端能力视图。
  - `PRD-TOOL-002` 权限·审批·沙盒：后端有权限/审批；越权/拒绝路径无系统化测试。
  - `PRD-TOOL-003` Skills 发现与加载：只有 docs/process/skills 文档；运行时发现/加载未实现。
  - `PRD-TOOL-004` MCP 接入：未实现；无产品 spec、无协议/安全验收。
- 下一步：先写产品域 spec 的 `PRD-TOOL-001`、`PRD-TOOL-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### METRIC · 指标

<a id="domain-metric"></a>

- 功能点：6；已签/已实现 3、部分 2、设计 0、未实现/规划 1。
- 产品 spec：**待建**（目标：`specs/product/METRIC/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/METRIC/test-plan.md`）。
- 主要缺口：
  - `PRD-METRIC-006` 导出·对比·告警：未实现；无产品 spec、无导出/告警测试。
- 下一步：先写产品域 spec 的 `PRD-METRIC-001`、`PRD-METRIC-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### SYNC · 多端与同步

<a id="domain-sync"></a>

- 功能点：5；已签/已实现 3、部分 1、设计 0、未实现/规划 1。
- 产品 spec：**待建**（目标：`specs/product/SYNC/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/SYNC/test-plan.md`）。
- 主要缺口：
  - `PRD-SYNC-005` 远程访问与通知中心：未实现；无远程鉴权/通知产品 spec。
- 下一步：先写产品域 spec 的 `PRD-SYNC-001`、`PRD-SYNC-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。

### SYS · 系统与运维

<a id="domain-sys"></a>

- 功能点：6；已签/已实现 1、部分 5、设计 0、未实现/规划 0。
- 产品 spec：**待建**（目标：`specs/product/SYS/spec.md`）。
- 域测试计划：**待建**（目标：`specs/test/SYS/test-plan.md`）。
- 主要缺口：
  - `PRD-SYS-001` 本地单用户与鉴权边界：本地单用户假设存在；远程/多用户边界未产品化、无安全测试。
  - `PRD-SYS-002` 权限 fail-closed：审批/权限后端存在；默认拒绝/异常路径无系统化验收。
  - `PRD-SYS-003` 健康检查与运行时状态：接口存在；无产品 spec、无域测试计划。
  - `PRD-SYS-004` 数据备份·迁移·回滚：部署文档有流程；恢复演练/回滚验证未系统化。
- 下一步：先写产品域 spec 的 `PRD-SYS-001`、`PRD-SYS-002` 章节与 AC；再把已有 FE/COMP 测试归并到域测试计划。


## 4. 优先补课（P0）

| 顺序 | 缺口 | 为什么先做 | 产物 |
|---:|---|---|---|
| 1 | CONV 产品域 spec + 域测试归并 | 对话是主路径；现有 FE 测试最全，最容易先达到 `covered` | `specs/product/CONV/spec.md`、`specs/test/CONV/test-plan.md` |
| 2 | TASK 产品域 spec（生命周期/复杂度/子会话/取消） | 任务模型 C0–C4 只有设计文档，未实现/未验收；直接影响“长任务”可信度 | `specs/product/TASK/spec.md` + 首个 `CHG-TASK-*` |
| 3 | FILE 预览/下载 + 工作区隔离 | 已签能力存在“未验证”项；文件是交付物闭环 | 补 `CHG-FILE-*`、E2E 用例 |
| 4 | 权限 fail-closed + 团队隔离 | 安全边界不能靠“前端隐藏按钮” | SYS-002 / TEAM-005 产品 AC + 越权测试 |
| 5 | 调度失败/重试/通知 | 定时任务已有后端，失败路径无产品规则 | SCHED-005 产品 spec + 测试 |
| 6 | 指标口径与延迟 | 已有仪表盘，但任务质量/延迟数据不全，易展示假 0 | METRIC-002/003 产品 AC + 口径测试 |

## 5. 已知不一致与风险

- `docs/tasks/frontend.md` 写“前端只做对话、工作台；任务/智能体/团队/记忆暂不恢复”，与后端能力面不一致；本树按“后端有能力、前端无入口”记 `partial`，不把后端接口当产品完成。
- `docs/tasks/STATUS.md` 最近更新 2026-11-13，`acceptance.md` 最后签字 2026-11-14；没有 M34+ 验收记录。M34–M40 相关能力不能凭旧签字算 `accepted`。
- `specs/README.md` 旧索引状态滞后（FE-007/008 写“未实现”，STATUS 已签）；已在 [`../../specs/README.md`](../../specs/README.md) 重写为类型索引 + 历史映射。
- `docs/frontend-feature-map.md` 描述 M67 前旧布局与更多页面，不能当现状；本树只认 `frontend/src` 实际页面与可运行证据。
- `check-sdd` 当前会把任何 `specs/<dir>/spec.md` 当旧式 spec 检查（目标/需求 R/验收 A/非目标 + 同目录 test-plan/evidence）。**在检查器迁移前，直接创建 `specs/product/*/spec.md` 会破坏门禁**；产品域 spec 首批文件需与检查器升级同批落地，或先在 `specs/templates` 维护模板。此约束已写入 [`../../specs/README.md`](../../specs/README.md)。
- 本轮只做文档与规范，未改代码、未跑前端测试；所有“已签/已实现”均引用现有文档/STATUS，不新增未验证结论。

## 6. 文件数量估算

按“能力域 + 变更包”而非“功能点一文件”：

| 类型 | 数量 | 说明 |
|---|---:|---|
| 产品域 spec | 12 | 一域一份，PRD 作为章节 |
| 域测试计划 | 12 | 一域一份 |
| E2E 测试计划 | 1 | 跨域关键路径 |
| 组件 spec | 5 现有 + 按新增/修改补 | 只为公共契约建，不为每个展示组件建 |
| 历史变更包 | 10 | 保留，映射为 CHG-LEGACY-* |
| 新建完整变更 | 每个 8 文件 | proposal/spec/design/frontend/backend/tasks/test-plan/evidence |
| 新建轻量变更 | 每个 4 文件 | spec/tasks/test-plan/evidence，其余字段并入 spec |
| 长期文件总量 | 约 45–60 | 不含归档；完成变更移入归档区 |

结论：**先建 12 份域 spec + 13 份测试计划（含 E2E），再按活跃变更开包**；不要为 71 个功能点各建一个目录。

## 7. 验收口径

本审计本身可验收：
- [ ] 每个 PRD 在 TREE 与 TRACEABILITY 都有行；
- [ ] 每个 PRD 的状态与 `docs/tasks/STATUS.md`/现有 spec 不矛盾；
- [ ] 每个“已签/已实现”都有来源链接；没有来源的降级为 `partial`/`gap`；
- [ ] 每个 `gap` 都有补课 owner 与目标（见 §4/§3）；
- [ ] 没有把待建 spec 写成已存在；
- [ ] 没有新增代码改动。
