# TREE-FULL · 全产品功能树与批次方案

本文把 `docs/product/TREE.md` 的 72 个 PRD、`docs/product/TRACEABILITY.md` 的覆盖判定、`docs/product/SPEC-GAP.md` 的缺口记录，与 2026-11-22 对 `backend/`、`frontend/` 的代码实测并到一张表里，给出依赖顺序与四批交付方案。

口径说明三条。状态词只有 `covered` / `partial` / `gap` / `未建` 四个，`covered` 必须同时具备产品 AC、变更包、开发 spec、测试证据，缺一项即 `partial`（依据 `docs/product/TRACEABILITY.md:11-13`）。`未建` 只表示产品 spec 标 `unimplemented` 且代码侧查不到实现，与 `gap`（有实现但无 AC 或无证据）分开计数。代码实况一律用路由与文件名作证，凡本文件未列出证据的"存在"都不成立。

数量基线：72 个 PRD = 13 covered / 37 partial / 22 gap；按实现轴是 21 implemented / 36 partial / 15 unimplemented（`docs/product/TREE.md` 第 2 节合计行）。`gap` 的 22 条里 15 条属于 `未建`、7 条属于有实现无证据，两个数相加等于 22。第 2 节逐域明细的逐条状态相加与这套域级计数一致，唯一按推断分配的是 P4 的四条（见 2.4 说明）。

## 1. 总览

十个域各一行。"代码实况"只写有路由或文件为证的形态，"离可用还差什么"只写挡住用户走通的那一件。

| 域 | 名称 | PRD | covered | partial | gap | 代码实况 | 离可用还差什么 |
|---|---|---|---|---|---|---|---|
| P1 | 会话与消息 | 13 | 13 | 0 | 0 | 有模块：`sessions`（24 文件）+ `chat`（53 文件） | 已收口，停止机制与 IME 均有可复现证据 |
| P2 | 任务与执行 | 6 | 0 | 0 | 6 | 有模块：`modules/tasks`（12 文件）+ `chat/task_executor.go`、`task_intent.go` | 没有任务执行组的前端契约，任务只在右栏以条目出现 |
| P3 | 工作台与视图 | 5 | 0 | 4 | 1 | 散落：`/api/stats`、`/api/usage`、`/api/views`；前端 `WorkbenchChart`、`MetricsDashboard` | 5 条 PRD 里 3 条 implemented 但 0 条 covered，缺 AC 与证据 |
| P4 | 文件与交付物 | 6 | 0 | 2 | 4 | 散落：`chat/files.go`、`attachments.go`、`filegen.go`、`tasks/deliverables.go` | 前端没有文件页，`FILE-004` 预览下载未验证 |
| P5 | 记忆 | 6 | 0 | 5 | 1 | 有模块：`modules/memory`（14 文件，含 `recall_r2.go`、`vector_recall.go`） | 后端齐全但没有一个记忆界面 |
| P6 | 团队与智能体 | 6 | 0 | 4 | 2 | 散落：`chat/team.go`、`/api/teams/{id}/*` 六条路由 | 团队成员边界未产品化，只读投影未实现 |
| P7 | 调度 | 5 | 0 | 4 | 1 | 散落：`chat/schedules.go`（含真实 ticker 调度循环） | 没有调度页，定时任务只能靠 API 建 |
| P8 | 设置与系统 | 12 | 0 | 9 | 3 | 散落：`/api/permissions`、`/api/approvals`、`/api/runtime/status`；无 `/api/settings` | 没有设置中心，模型 Provider 与权限只能改配置或调 API |
| P9 | 工具与能力 | 7 | 0 | 4 | 3 | 散落：`chat/tools.go`、`chat/actions.go`、`/api/actions` 三条路由 | 没有能力视图；MCP 与 Skills 在代码里零命中 |
| P10 | 指标 | 6 | 0 | 5 | 1 | 散落：`chat/metrics.go`、`metrics_turn.go`、`/api/metrics/dashboard`；前端 `MetricsDashboard` | 3 条 implemented 但 0 covered，口径说明与 7/30 天证据缺失 |
| 合计 | 10 域 | 72 | 13 | 37 | 22 | 4 个模块覆盖 P1/P2/P5，另 7 个域的路由散落在 `chat` 模块内 | 除 P1 外没有一域达到可用状态 |

把"有没有页面"和"有没有接口"分开看，结论不同。后端 10 个域都能找到路由作证，查不到实现的只有三条 PRD：`TOOL-003` Skills、`TOOL-004` MCP、`TOOL-007` 能力目录（对 `backend/` 全量搜索 `mcp|skills` 零命中；原 `PRD-SYNC-005` 已移除）。前端只有两个视图：`frontend/src/app.tsx:29` 的类型定义写死 `type Page = 'chat' | 'workbench'`，`frontend/src/pages/` 是空目录，`frontend/src/components/library.tsx` 的导出清单里没有设置、文件、记忆、团队、调度、视图任何一个页面级组件。所以 P2、P4、P5、P6、P7、P8、P9 的可用性瓶颈都不在后端接口，而在"没有入口"。

## 2. 逐域明细

每个域一张表，列固定为：功能点、L2 分类、一句话、现状、依赖、优先级、建议批次。L2 分类取 `docs/product/TREE.md` 第 3 节的小节标题，不改名；优先级沿用 TREE 的既有标注，不改写；批次是本文件新增的判断，两者冲突时在表下一句话说明理由。

### 2.1 P1 会话与消息（13 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-CONV-001 | 会话管理 | 会话树、主会话、置顶与排序 | covered | 无 | P0 | 已完成 |
| PRD-CONV-002 | 会话管理 | 新建、重命名、归档、恢复 | covered | CONV-001 | P0 | 已完成 |
| PRD-CONV-003 | 会话管理 | 标题搜索与未读计数 | covered | CONV-001 | P1 | 已完成 |
| PRD-CONV-004 | 消息与渲染 | 消息流、分组、卡片与表格渲染 | covered | CONV-005 | P0 | 已完成 |
| PRD-CONV-005 | 输入与发送 | 发送、流式、断线重连、幂等 | covered | SYNC-001 | P0 | 已完成 |
| PRD-CONV-006 | 输入与发送 | Composer 输入、快捷键、输入法 | covered | CONV-005 | P0 | 已完成 |
| PRD-CONV-007 | 消息与渲染 | 祖先消息整级加载与时间轴命中 | covered | CONV-004 | P1 | 已完成 |
| PRD-CONV-008 | 右栏会话投影 | 右栏会话投影与任务组 | covered | CONV-001、TASK-002 | P1 | 已完成 |
| PRD-SYNC-001 | 多标签与同步 | WS 连接、重连、心跳 | covered | 无 | P0 | 已完成 |
| PRD-SYNC-002 | 多标签与同步 | 多标签 active、ancestor、读游标 | covered | SYNC-001 | P0 | 已完成 |
| PRD-SYNC-003 | 多标签与同步 | 发送模式与设置跨标签同步 | covered | SYNC-002 | P1 | 已完成 |
| PRD-SYNC-004 | 多标签与同步 | 未读与已读游标持久化 | covered | SYNC-002 | P1 | 已完成 |
| PRD-CONV-009 | 会话内任务与编排 | 会话内任务呈现、编排与归属 | covered | CONV-004、CONV-008 | P1 | 已完成 |

`CONV-006` 原排进 B1 只为补 `AC-CONV-006-02` 的中文输入法证据；2026-11-22 已用 CDP 合成组合态完成验证（`docs/testing/IME-EVIDENCE-20261122.md`），该条转 pass，物理输入法未覆盖只作环境限制。

### 2.2 P2 任务与执行（6 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 | AC（CHG-B1-001） |
|---|---|---|---|---|---|---|---|
| PRD-TASK-001 | 任务生命周期 | 任务生命周期与执行组 | gap（有实现无证据） | CONV-005 | P0 | B1 | 6 条（已改写为可判定） |
| PRD-TASK-002 | 任务生命周期 | 任务概览与进度展示 | gap（有实现无证据） | TASK-001、CONV-008 | P0 | B1 | 4 条（已改写为可判定） |
| PRD-TASK-003 | 长任务与异步 | 长任务异步与开始/结束消息 | gap（未建） | TASK-001 | P0 | B1 | 5 条（已改写为可判定） |
| PRD-TASK-006 | 长任务与异步 | 取消、重试、预算、恢复 | gap（有实现无证据） | TASK-001 | P1 | B1 | 7 条（已改写为可判定） |
| PRD-TASK-004 | 复杂度与归属 | 复杂度分级与确认门禁 | gap（未建） | TASK-001 | P0 | B3 | 4 条（已改写为可判定） |
| PRD-TASK-005 | 复杂度与归属 | 子会话与任务归属 | gap（未建） | TASK-001、CONV-002 | P0 | B3 | 4 条（已改写为可判定） |

`AC` 列记本域 6 条 PRD 的 AC 改写结果：原每条 PRD 2 条泛化 AC，现改为上表所列条数的可判定判据，明细见 [`CHG-B1-001/spec.md`](../../specs/changes/CHG-B1-001/spec.md) 第 3 节与 [`P2-TASK/spec.md`](../../specs/product/P2-TASK/spec.md)；状态列与批次列未变。

`TASK-004` 与 `TASK-005` 在 TREE 里标 P0，但仍排进 B3，理由是它们的作用是给任务加约束与归属，不挡住"发一个任务并看到它跑完"这条主路径；而团队域（P6）的成员定义直接建立在 `TASK-005` 上，所以两者必须同批，不能拆到更后。代码侧证据：`backend/internal/modules/tasks/http.go` 提供列表、详情、取消、重试四条路由，`tasks/concurrency.go`、`real_executor.go`、`recovery_m19b.go` 提供并发、真实执行与恢复，说明 `TASK-001/006` 的后端不是空壳；全仓搜索 `C0|C1|complexity` 在 `modules/` 下无命中，`TASK-004` 的 `未建` 判定以此为准。

### 2.3 P3 工作台与视图（5 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-WORK-001 | 入口与导航 | 对话与工作台双页导航 | partial | CONV-001 | P0 | B4（回填） |
| PRD-WORK-002 | 统计与趋势 | 用量与统计卡 | partial | METRIC-001 | P0 | B4（回填） |
| PRD-WORK-003 | 统计与趋势 | 每日趋势与最近活动 | partial | WORK-002 | P1 | B4（回填） |
| PRD-WORK-004 | 交付物入口 | 工作台交付物与三态 | partial | FILE-003 | P0 | B1 |
| PRD-WORK-005 | 自定义视图 | 自定义视图 13 类块 | gap（未建） | WORK-001、METRIC-003 | P1 | B4 |

这个域是"代码已跑在前面、文档没跟上"的典型，3 条 PRD 标 implemented 却 0 条 covered（`docs/product/TREE.md` 第 2 节 P3 行）。`app.tsx:993-1069` 有导航、统计卡、趋势图、最近活动、交付物的完整实现，缺的是把这些行为写成可判定 AC 再补测试证据，不是重写。`WORK-005` 后端有 `/api/views` 五条路由（`chat/views.go:71-75`），前端没有任何视图页面。

### 2.4 P4 文件与交付物（6 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 | AC（CHG-B1-001） |
|---|---|---|---|---|---|---|---|
| PRD-FILE-001 | 文件聚合 | 会话文件聚合与列表 | partial | SYS-002 | P0 | B1 | 6 条（已改写为可判定） |
| PRD-FILE-005 | 文件聚合 | 工作区目录与输出隔离 | gap | SYS-002 | P1 | B2 | 5 条（已改写为可判定） |
| PRD-FILE-002 | 上传与附件 | 上传与附件 | gap | SYS-002 | P0 | B2 | 5 条（已改写为可判定） |
| PRD-FILE-003 | 交付物 | 交付物卡片与列表 | partial | TASK-001 | P0 | B1 | 5 条（已改写为可判定） |
| PRD-FILE-004 | 预览与下载 | 预览与下载 | gap | FILE-001 | P0 | B1 | 6 条（已改写为可判定） |
| PRD-FILE-006 | 文件生成 | 文件生成 PDF/Office/图片 | gap | FILE-004 | P1 | B4 | 4 条（已改写为可判定） |

`AC` 列记本域 6 条 PRD 的 AC 改写结果：原每条 PRD 2 条泛化 AC，现改为上表所列条数的可判定判据，明细见 [`CHG-B1-001/spec.md`](../../specs/changes/CHG-B1-001/spec.md) 第 3 节与 [`P4-FILE/spec.md`](../../specs/product/P4-FILE/spec.md)；状态列与批次列未变。

`FILE-002` 与 `FILE-005` 排在 B2 而不在 B1，理由是上传与目录隔离属于安全边界，必须在权限 fail-closed 立住之后才有可判定的拒绝路径；`FILE-001` 只做"列出会话内已有文件"，不涉及写入，可以先进 B1 给闭环补输入口。代码侧：`chat/files.go`、`chat/attachments.go` 提供列表与上传删除，`chat/filegen.go:33` 的 `toolMakePDF`、`:96` 的 `toolMakeOffice`、`:163` 的 `finishGenerated` 说明生成能力真实存在，`tasks/deliverables.go` 提供交付物，前端只有 `DeliverableItem` 卡片组件（`library.tsx` 导出），没有文件页。

`AC` 列记本域 6 条 PRD 的 AC 改写结果：原每条 PRD 2 条泛化 AC，现改为上表所列条数的可判定判据（共 31 条），明细见 [`CHG-B1-001/spec.md`](../../specs/changes/CHG-B1-001/spec.md) 第 3 节与 [`P4-FILE/spec.md`](../../specs/product/P4-FILE/spec.md)；状态列与批次列未变。

这个域的逐条覆盖归属是全文唯一一处推断：`docs/product/TREE.md` 只给了 P4 的域级计数（0 covered / 2 partial / 4 gap），行内没有覆盖列，spec 的"当前剩余缺口"六条文案完全相同。本表按 P0 主路径优先把 `FILE-001` 与 `FILE-003` 记为 partial，其余四条记为 gap，属待核，开工拆子项时以实测为准。

### 2.5 P5 记忆（6 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-MEM-001 | 条目与作用域 | 记忆条目、作用域、搜索 | partial | 无 | P1 | B3 |
| PRD-MEM-006 | 条目与作用域 | 记忆迁移与索引 | gap（未建） | MEM-001 | P2 | B4 |
| PRD-MEM-002 | 实体与冲突 | 实体、关系、金字塔 | partial | MEM-001 | P1 | B3 |
| PRD-MEM-003 | 实体与冲突 | 冲突与争议保留 | partial | MEM-001 | P1 | B3 |
| PRD-MEM-004 | 召回 | 召回 R1/R2 | partial | MEM-001、CONV-005 | P1 | B3 |
| PRD-MEM-005 | 召回 | 向量召回与巩固 | partial | MEM-004 | P2 | B4 |

后端 `modules/memory` 是全仓最完整的模块之一，14 个文件覆盖 FTS（`fts.go`）、R2 召回（`recall_r2.go`）、向量召回（`vector_recall.go`）、巩固（`consolidation.go`），路由 19 条（`memory/module.go:71-74` 四条、`http_v3.go:14-22` 九条、`recall.go:89-92` 四条、`consolidation.go:54-55` 两条）。这个域的 5 条 partial 全部卡在同一处：产品 spec 里没有"召回质量到多少算过"的判据，`docs/product/SPEC-GAP.md` 把 `MEM-005` 的实验属性写成必须标注、不得默认开启，因此补 AC 时要先定可观测指标，不能只写"能召回"。

### 2.6 P6 团队与智能体（6 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-TEAM-001 | 智能体 roster | 智能体 roster 与模型 | partial | TASK-005 | P1 | B3 |
| PRD-TEAM-002 | 成员与隔离 | 团队成员=子会话+负责人 | partial | TASK-005 | P1 | B3 |
| PRD-TEAM-005 | 成员与隔离 | 团队内部消息隔离 | partial | TEAM-002、SYS-002 | P0 | B3 |
| PRD-TEAM-003 | 模板与触发器 | 团队模板、角色、触发器 | partial | TEAM-002 | P1 | B3 |
| PRD-TEAM-004 | 投影与任务板 | 团队只读投影与对话创建 | gap（未建） | TEAM-002 | P1 | B3 |
| PRD-TEAM-006 | 投影与任务板 | 子代理并行与团队任务板 | gap（未建） | TEAM-005 | P2 | B4 |

`TEAM-005` 是 P0 而其余是 P1，这个排序在 TREE 里成立，因为内部消息隔离是安全边界（`docs/product/TREE.md` §4 域边界写明"是安全边界不是 UI 折叠"）。但 B3 里它排在同批第三位，理由是隔离的判定对象是成员集合，成员未产品化之前无法写越权用例。后端证据：`chat/team.go:18-23` 六条只读路由（会话团队、团队详情、成员、消息、交付物、触发器），没有创建或写入路由，与 `TEAM-004` 的 `未建` 一致。

### 2.7 P7 调度（5 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-SCHED-001 | 任务与列表 | 定时任务 CRUD | partial | TASK-001 | P1 | B3 |
| PRD-SCHED-002 | 任务与列表 | 列表与下次运行时间 | partial | SCHED-001 | P1 | B3 |
| PRD-SCHED-003 | 执行与幂等 | 立即运行与幂等 | partial | SCHED-001 | P1 | B3 |
| PRD-SCHED-004 | 规则与时区 | 重复规则与时区 | partial | SCHED-001 | P1 | B3 |
| PRD-SCHED-005 | 失败与通知 | 失败、重试、通知 | gap（未建） | SCHED-003、通知能力 | P2 | B4 |

后端比 TREE 描述得更完整：`chat/schedules.go:101` 的 `startScheduler`、`:132` 的 `schedulerLoop` 用 `time.NewTicker` 真实轮询，`:145` 的 `runDueSchedules` 走 `WHERE enabled = 1 AND next_run_at <= ?` 查到期任务，`:170` 的 `recoverSchedules` 处理停机错过只补最近一次。缺的是前端页面与 DST、非法 cron、并发 run-now 的判定证据（`specs/product/P7-SCHED/spec.md:82` 记录"DST/时区未测"）。`SCHED-005` 依赖通知能力，而通知能力本身没有 PRD，见第 3 节缺口清单。

### 2.8 P8 设置与系统（12 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-SET-001 | 模型与权限 | 模型与 Provider 配置 | partial | SYS-001 | P0 | B2 |
| PRD-SET-002 | 模型与权限 | 权限、沙盒、审批设置 | partial | SYS-002 | P0 | B2 |
| PRD-SET-003 | 外观与快捷键 | 外观、主题、语言 | gap（未建） | SET-001 | P2 | B4 |
| PRD-SET-005 | 外观与快捷键 | 快捷键、关于、版本 | gap（未建） | SET-001 | P2 | B4 |
| PRD-SET-004 | 数据与能力 | 数据目录、备份、恢复 | partial | SYS-004 | P1 | B4 |
| PRD-SET-006 | 数据与能力 | 能力管理（MCP/CLI/Skills/目录） | gap（未建） | TOOL-007 | P2 | B4 |
| PRD-SYS-001 | 安全与备份 | 本地单用户与鉴权边界 | partial | 无 | P0 | B2 |
| PRD-SYS-002 | 安全与备份 | 权限 fail-closed | partial | SYS-001 | P1 | B2 |
| PRD-SYS-004 | 安全与备份 | 数据备份、迁移、回滚 | partial | SYS-001 | P0 | B4 |
| PRD-SYS-003 | 运维与安装 | 健康检查与运行时状态 | partial | 无 | P1 | B4（回填） |
| PRD-SYS-005 | 运维与安装 | 日志与审计 | partial | TOOL-001 | P1 | B4 |
| PRD-SYS-006 | 运维与安装 | 安装、升级、便携包 | partial | SYS-004 | P1 | B4 |

这个域有 12 条 PRD，是全仓最多的一个，但没有设置页，也没有 `/api/settings` 路由（`modules/` 与 `chat/` 全量搜索无命中）。`SYS-002` 在 TREE 里标 P1、`SYS-001` 标 P0，本文件把两者一起放进 B2，因为"权限默认拒绝"离开"服务端鉴权边界"单独实现没有意义（`docs/product/TREE.md` §4 写明权限判定在服务端）。`SYS-003` 已有 `/api/runtime/status`（`chat/module.go:194`），属回填类。

### 2.9 P9 工具与能力（7 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-TOOL-001 | 工具运行时 | 工具注册、执行、审计 | partial | SYS-002 | P0 | B2 |
| PRD-TOOL-002 | 工具运行时 | 权限、审批、沙盒 | partial | TOOL-001 | P0 | B2 |
| PRD-TOOL-003 | Skills 与 CLI | Skills 发现与加载 | gap（未建） | TOOL-007 | P1 | B4 |
| PRD-TOOL-005 | Skills 与 CLI | CLI 工具白名单 | partial | TOOL-002 | P1 | B2 |
| PRD-TOOL-004 | 外部能力 | MCP 接入 | gap（未建） | TOOL-001、SET-006 | P2 | B4 |
| PRD-TOOL-006 | 外部能力 | 联网搜索与抓取 | partial | TOOL-002 | P1 | B4 |
| PRD-TOOL-007 | 能力目录 | 能力目录 L0–L3 | gap（未建） | TOOL-001 | P2 | B4 |

`TOOL-001` 与 `TOOL-002` 进 B2 的理由和 P8 相同：工具执行是权限系统的第一个消费者，两者同批才能写出"越权请求被拒绝并留审计"这一类用例。代码证据：`chat/tools.go:79` 的 `toolDefinitions`、`:263` 的 `authorizeTool`、`:398` 的 `dangerousCommand`，`chat/actions.go` 与 `/api/actions` 三条路由（列表、描述、执行），`chat/grants.go` 管授权。`TOOL-003` 与 `TOOL-004` 的 `未建` 判定依据是对 `backend/` 搜索 `mcp`、`skills` 零命中，与 `specs/product/P9-TOOL/spec.md:68` 的记录一致。

### 2.10 P10 指标（6 个 PRD）

| 功能点 | L2 分类 | 一句话 | 现状 | 依赖 | 优先级 | 批次 |
|---|---|---|---|---|---|---|
| PRD-METRIC-001 | 性能与质量 | 系统性能指标 | partial | TASK-001 | P1 | B4（回填） |
| PRD-METRIC-002 | 性能与质量 | 任务质量指标 | partial | METRIC-001 | P1 | B4 |
| PRD-METRIC-003 | 延迟与窗口 | 延迟 p50/p90 | partial | METRIC-001 | P1 | B4 |
| PRD-METRIC-004 | 延迟与窗口 | 7/30 天窗口与 partial 标记 | partial | METRIC-001 | P1 | B4（回填） |
| PRD-METRIC-005 | 明细与导出 | 明细表与口径说明 | partial | METRIC-001 | P1 | B4（回填） |
| PRD-METRIC-006 | 明细与导出 | 导出、对比、告警 | gap（未建） | METRIC-005 | P2 | B4 |

3 条 implemented 却 0 covered，与 P3 同理。`chat/metrics.go` 与 `metrics_turn.go` 产出指标，`/api/metrics` 与 `/api/metrics/dashboard` 两条路由（`chat/module.go:192-193`），前端 `MetricsDashboard` 组件与 `frontend/src/components/MetricsDashboard.test.tsx` 都在。`METRIC-002/003` 的 partial 原因是口径未写成产品判据，"p90 延迟到多少算合格"没有数字，验收无法判定。

## 3. 缺口清单

下列能力有产品需要、有代码或计划作证，但没有 PRD。本表不给它们编 ID，只登记能力与证据，由后续域需求开工时决定是否立 PRD。

| 能力 | 为什么算产品需要 | 证据 | 建议归属 |
|---|---|---|---|
| 设置中心整页 | `docs/product-plan.md` 第 4 节把设置中心列为 P0 十条之一；现在没有页面也没有 `/api/settings` | `frontend/src/app.tsx:29` 只有两个视图；`modules/` 下无 settings 路由 | P8 |
| 命令面板与全局快捷键 | 同上列为 P0；`PRD-CONV-006` 只覆盖 Composer 内快捷键 | `chat/actions.go:561` 的 `ui.theme.set`、`ui.open` 只是动作桩 | P8 或 P1 |
| 会话级错误恢复与重放 | 同上列为 P0"错误恢复"；`PRD-TASK-006` 只到任务级 | 无对应 PRD | P1 |
| 工作流与多任务编排 | `docs/product-plan.md:4` 已定"会话内可含多个任务由智能体自主编排" | `chat/workflow.go`、`/api/workflows` 七条路由（列表、详情、暂停、恢复、取消、成员、运行时） | 新域或 P2 |
| 卡片与表单交互 | 现有对话里已大量使用，决定用户能否在对话内确认动作 | `chat/cards.go:49-52` 四条路由、`:790` 的 `ensureFormConfirmActions`、前端 `CardBlock` | P1 或 P2 |
| 任务完成汇报（汇报体概览） | `docs/product-plan.md:4` 已定"每个任务完成都汇报" | `sessions/overview.go`、`/api/sessions/{id}/overview` 有实现，无 PRD 判据 | P2 |
| 文件树与打开方式、diff | 同上列为 P0"文件工作区"；`PRD-FILE-001` 只到"聚合与列表" | `chat/files.go` 只提供列表 | P4 |
| 会话导出与分享 | 同上列为 P1 | 无路由、无 PRD | P1 |
| 可打开的审计页 | 同上列为 P1"审计与权限页"；`PRD-SYS-005` 只到日志与审计后端 | `/api/approvals`、`/api/decisions` 有数据，无页面 | P8 |
| 通知中心（本机） | 原 `SYNC-005`（远程访问+通知中心合并项）已移除，本机通知与角标仍缺 | 无独立 PRD | P8 |
| 用量配额与成本告警 | 侧栏已显示 `quotaPct`，但没有配额阈值与告警规则 | `library.tsx` 的 `Sidebar` 入参有此字段；`/api/usage` 存在 | P10 |
| 长期目标与场景模板 | 同上列为 P1 | 无 PRD；`PRD-TOOL-003` 只到 Skills 发现 | P9 或新域 |

12 条缺口里，影响最大的两条是"设置中心整页"与"卡片与表单交互"。前者让所有配置只能靠改文件，后者决定对话内的确认与选择能不能验证，而现有 AC 体系完全没有覆盖它。

## 4. 依赖关系

依赖按"前置功能点没完成时，后继功能点无法写出可判定验收"来判定，不按代码调用关系判定。共 9 组。

| 前置 | 后继 | 理由 |
|---|---|---|
| P1 会话与消息（已 covered） | P2 全部 | 任务由会话发起，任务的开始与结束消息走会话消息流 |
| P2 `TASK-001` | P2 `TASK-002/003/006` | 生命周期没定义，进度、异步消息、取消重试都无从判定 |
| P2 `TASK-001` | P4 `FILE-003` | 交付物产生于任务完成事件 |
| P2 `TASK-005` 子会话归属 | P6 `TEAM-001/002` | 团队成员的定义是"子会话+负责人"，子会话归属未定时成员边界无法写 |
| P6 `TEAM-002` | P6 `TEAM-005` | 隔离的判定对象是成员集合 |
| P8 `SYS-002` 权限 fail-closed | P9 `TOOL-002/005`、P4 `FILE-002/005` | 越权与越界用例都以"拒绝并留痕"为判据 |
| P9 `TOOL-001` | P9 `TOOL-003/004/007`、P8 `SET-006` | 能力目录与能力管理都读同一份工具注册表 |
| P2 `TASK-001` | P7 `SCHED-001..004` | 定时触发的产物是任务 |
| P10 `METRIC-001` | P3 `WORK-002/005`、P10 `METRIC-002/003` | 工作台不自造口径，指标口径是上游 |

三条推论。第一，P2 是全仓的瓶颈，除 P1 之外所有域都直接或间接依赖它，这决定了第一批必须以 P2 为主。第二，P8 的权限线是第二批的瓶颈，它不产出用户可见功能，却决定后面三批能不能写出有效用例。第三，P6 团队域的真前置是 `TASK-005`，把它排在团队之前不是保守，而是唯一可行顺序。

## 5. 每域能否在 0.5–1 天内做出可验收增量

判断标准有三条：后端是否已有可用接口、前端是否已有可复用的组件或页面骨架、产品 spec 是否已有可判定的域特有 AC。三条都满足算"能"，缺一条算"能但范围要缩"，缺两条算"不能"。

| 域 | 能否 | 理由 |
|---|---|---|
| P1 | 能（半天） | 已收口：停止机制由假上游证明（`STOP-UPSTREAM-EVIDENCE-20261122.md`），IME 由 CDP 合成组合态补证 |
| P3 | 能（半天） | 3 条 implemented 已有实现与组件，缺的是 AC 与测试证据，不回写代码就能升 covered |
| P10 | 能（半天） | 同上，`MetricsDashboard` 与两条指标路由都在，缺口径数字与窗口证据 |
| P7 | 能（一天） | 后端含真实调度循环，缺一个调度页与 DST、非法 cron、并发用例 |
| P2 | 能但范围要缩（一天） | `TASK-001/002` 的后端在，前端要新画执行组；`TASK-003` 是全新实现，一天只能做到 001/002 |
| P4 | 能但范围要缩（一天） | 列表、上传、生成的后端都在，缺文件页；一天只能做"会话文件列表 + 预览下载" |
| P8 | 能但范围要缩（一天） | 权限与运行时状态有接口，设置页要从零建，一天只能做权限查看与切换 |
| P9 | 能但范围要缩（一天） | `/api/actions` 可支撑一个只读能力视图；MCP 与 Skills 无代码，一天做不出来 |
| P5 | 不能（一天只够一条） | 后端最全但前端零页面，且召回质量无判据，一天只能做 `MEM-001` 条目浏览器 |
| P6 | 不能（一天只够一条） | `TEAM-004` 只读投影未实现，成员规则未产品化，一天只能做 roster 只读展示 |

共同前提不能忽略：P2–P10 的产品 spec 是同一模板批量生成的，每条 PRD 只有两条泛化 AC，例如 `AC-TASK-001-01` 写"用户能完成'任务生命周期与执行组'并看到一致结果"（`specs/product/P2-TASK/spec.md:41-44`）。这类 AC 无法判定，所以每个域动手前都要先花约 0.3 天把该域 2 至 4 条关键 AC 改写成可观测判据，这部分成本已计入下节估算。

## 6. 批次方案

四批的划分原则是把"让系统能自己跑起来"和"让系统更好用"分开。B1 到 B3 属前者，任何一批没做完，产品都不算可用；B4 属后者，做完更好，不做不挡主路径。估算单位是人日与 Agent 轮次并用，按新规则一个增量域约 1.5 至 2.5 小时的实测口径外推，标注为估算。

### B1 核心闭环（8 个功能点 + 1 项补证）

范围：`PRD-TASK-001`、`TASK-002`、`TASK-003`、`TASK-006`、`PRD-WORK-004`、`PRD-FILE-001`、`FILE-003`、`FILE-004`，附带 `PRD-CONV-006` 输入法补证。

顺序理由：用户发出一个任务、看到它在跑、拿到产出的文件、在工作台汇总，这是产品唯一的主路径。P1 已把入口与消息流做完，这批补的是入口之后那一段，三个域的顺序也是这条路径的顺序，任务先于文件、文件先于汇总。

出口判据：`TASK-001/002/003/006` 四条 PRD 的域特有 AC 全部 pass，其中 `TASK-003` 要有异步开始与结束消息各一条证据；前端可以从会话进入任务执行组，并在执行组内完成取消与重试；`WORK-004` 的 loading、empty、error 三态各有一张 8787 走查截图；`FILE-001/003/004` 能在会话内列出文件、打开预览、下载成功；全量回归后端 EXIT=0、前端 0 skip；独立验收签字；`specs/product/P2-TASK/spec.md` 与 `P4-FILE/spec.md` 的 A1–A8 通用判据无 `missing`。

估算：1 轮，6 至 8 小时（估算）。风险点是 `TASK-003` 属全新实现，若异步消息契约在开工两小时内定不下来，把它拆出到独立一轮，其余 7 点照常验收。

### B2 权限与配置底座（9 个功能点）

范围：`PRD-SET-001`、`SET-002`、`PRD-SYS-001`、`SYS-002`、`PRD-TOOL-001`、`TOOL-002`、`TOOL-005`、`PRD-FILE-002`、`FILE-005`。

顺序理由：这一批几乎不产出用户可见的新功能，价值在于把后面两批的用例变成可判定的。权限 fail-closed 不立住，工具、上传、团队隔离、工作区隔离四处的"拒绝"路径都写不出通过判据；模型 Provider 不立住，任何依赖模型行为的验收都无法复现。

出口判据：越权请求被拒绝且留审计，至少三条用例（工具、上传、目录越界）；切换到 danger-full-access 必须有 confirm 确认，无 confirm 时返回拒绝；设置页可改模型 Provider 并生效，重启后保持；`TOOL-005` 的 CLI 白名单对命令注入与超时各有一条用例；全量回归 EXIT=0。

估算：1 至 1.5 轮，8 至 11 小时（估算）。

### B3 能力扩展（15 个功能点，4 个域）

范围：`PRD-TASK-004`、`TASK-005`、`PRD-TEAM-001`、`TEAM-002`、`TEAM-003`、`TEAM-004`、`TEAM-005`、`PRD-SCHED-001..004`、`PRD-MEM-001`、`MEM-002`、`MEM-003`、`MEM-004`。

顺序理由：团队依赖子会话归属，调度依赖任务，记忆依赖会话上下文，三者的共同前置都在 B1 与 B2 里已经落稳。这一批是产品从"能用"到"像个助手"的转折，所以放在权限之后、指标体系之前。

出口判据：复杂度 C0–C4 有分级判据与确认门禁各一条证据，高复杂度任务未确认时不得执行；团队成员可从对话创建，只读投影列出成员与其负责人，越界访问返回拒绝；定时任务在 UI 可建、可改、可删，run-now 重复触发只产生一个任务，DST 与非法 cron 各一条用例；记忆条目可在 UI 按作用域检索，冲突保留可见。

估算：2 至 3 轮，14 至 20 小时（估算）。这批跨 4 个域，按同域 2 至 3 个 Agent 并行的上限，建议拆成"任务与团队"和"调度与记忆"两条线并行。

### B4 完善与洞察（27 个功能点，含 7 条回填）

范围：P3 的 `WORK-001/002/003/005`、P4 的 `FILE-006`、P5 的 `MEM-005/006`、P6 的 `TEAM-006`、P7 的 `SCHED-005`、P8 的 `SET-003/004/005/006` 与 `SYS-003/004/005/006`、P9 的 `TOOL-003/004/006/007`、P10 的 `METRIC-001..006`。

顺序理由：这批里有 7 条是"代码已实现、只缺 AC 与证据"的回填（`WORK-001/002/003`、`SYS-003`、`METRIC-001/004/005`），成本低、能立刻把 covered 数抬起来；其余是需要新页面的完善项，价值取决于前三批上线后的真实使用。放在最后不是不重要，是因为它们的优先级会随真实使用改变。

出口判据：7 条回填项各补齐 AC 与证据后升 covered 或显式降级并写明原因；自定义视图 13 类块至少 3 类可渲染；能力目录、MCP、Skills 若仍不做，必须在 TREE 里保留 `未建` 并写明不做理由，不得静默消失；指标页面的口径说明与 7/30 天窗口各有一份可核对的数字。

估算：2 至 3 轮，16 至 24 小时（估算）。这批是暂存区，B1 到 B3 完成后需要重新排序，当前顺序只表达"相对靠后"，不表达批内先后。

### 批次与 BACKLOG 的对应

| 批次 | 对应 REQ | 出口判据一句话 |
|---|---|---|
| B1 核心闭环（parked：代码已产出未验收，2026-11-22） | REQ-020（P2）、REQ-021（P3 的 `WORK-004`）、REQ-022（P4 的 `FILE-001/003/004`） | 任务从发起到产出文件到工作台汇总这条路径一次走通，且四个域各有域特有 AC 证据 |
| B2 权限与配置底座 | REQ-026（P8）、REQ-027（P9 的 `TOOL-001/002/005`）、REQ-022（P4 的 `FILE-002/005`） | 越权与越界请求全部被拒绝并留痕，模型 Provider 可在设置页改并持久 |
| B3 能力扩展 | REQ-020（`TASK-004/005`）、REQ-024（P6）、REQ-025（P7）、REQ-023（P5 的 `MEM-001..004`） | 团队可从对话创建、定时任务可建可跑、记忆可检索，三者各有幂等与越权用例 |
| B4 完善与洞察 | REQ-021（P3 余项）、REQ-023（P5 余项）、REQ-026（P8 余项）、REQ-027（P9 余项）、REQ-028（P10） | 7 条回填项升 covered 或显式降级，指标口径有数字，未做项在 TREE 里写明理由 |

REQ-029（功能树收敛）由本文件交付，状态仍为 `queued`，待用户验收后由验收方转 `done`；REQ-030 仍按 `docs/plan/BACKLOG.md:84` 的原口径，等全产品验收通过后再开。

四批覆盖的功能点合计 59 条，加 `PRD-CONV-006` 一条补证共 60 条；余下 12 条是 12 条已 covered 的 P1 功能点，60 加 12 等于 72，与本文件开头的 PRD 总数一致。

## 7. 本文件与既有文档的差异

三处不一致需要后续统一，本文件按证据取值，不改旧文件。

`docs/plan/BACKLOG.md:83` 写"与 71 个 PRD 对齐"，`docs/product/TREE.md` 的实际计数是 72 个（逐域相加 13+6+5+6+6+6+5+12+7+6），两者相差 1。以 TREE 的逐条行数为准。

`docs/product/SPEC-GAP.md:223-232` 的"优先补课 P0"排序把 TASK 排在 FILE 之前、把权限排第四，那是 2026-11-20 的口径。本文件把权限线提前到第二批，理由是权限决定后续用例能否判定，与旧排序不冲突但更紧。

`docs/frontend-feature-map.md` 与 `docs/tasks/STATUS.md` 描述的页面布局与最新状态都不是现状（`docs/product/SPEC-GAP.md:234-241` 已记录），本文件的代码实况一律以 `frontend/src/app.tsx`、`frontend/src/components/library.tsx`、`backend/internal/modules/` 的实测为准。
