# CHG-B1-001 · 核心闭环产品层补证（任务执行组 → 文件 → 工作台汇总）

- 状态：`草稿`（产品层文档完成；实现、开发 spec、测试与证据均未开始）
- 变更类型：纯文档（本轮只改写产品层 AC、出口判据与门禁结构，不改业务代码）
- 日期：2026-11-22
- 方案依据：[`TREE-FULL.md`](../../../docs/product/TREE-FULL.md:241) B1 范围、[:245](../../../docs/product/TREE-FULL.md:245) B1 出口判据
Implements: PRD-TASK-001、PRD-TASK-002、PRD-TASK-003、PRD-TASK-004、PRD-TASK-005、PRD-TASK-006、PRD-FILE-001、PRD-FILE-002、PRD-FILE-003、PRD-FILE-004、PRD-FILE-005、PRD-FILE-006、PRD-WORK-004
- 范围说明：P2/P4 的 12 条 PRD 全部在本包内完成 AC 改写，因此都列入 `Implements`；B1 的出口判据只对其中 8 条负责（`TASK-001/002/003/006`、`FILE-001/003/004`、`WORK-004`），`TASK-004/005` 与 `FILE-002/005/006` 的排期不变。
- `Domains:` `P2-TASK`、`P4-FILE`、`P3-WORK`（仅汇总条 `PRD-WORK-004`）
- `Change:` `CHG-B1-001`
- `Owner:` 产品（本包）／实现与验收 owner 待 B1 开工时指派
- 本包不写完成结论：以下所有 AC 的证据在实现与测试执行前一律记 `missing`
- 前端开发 spec：`N/A：本轮只改写产品层 AC 与出口判据，前端实现契约留到 B1 开工时补。`
- 后端开发 spec：`N/A：本轮不改后端代码，只核对并记录现状差异，无新增接口契约。`

Covers: `AC-CHG-B1-001-01`、`AC-CHG-B1-001-02`、`AC-CHG-B1-001-03`、`AC-CHG-B1-001-04`、`AC-CHG-B1-001-05`、`AC-CHG-B1-001-06`、`AC-CHG-B1-001-07`；产品 AC 共 63 条（P2 30 + P4 31 + P3 2），逐条列于下方。

- 任务域（P2，30 条）：`AC-TASK-001-01`–`AC-TASK-001-06`（6）、`AC-TASK-002-01`–`AC-TASK-002-04`（4）、`AC-TASK-003-01`–`AC-TASK-003-05`（5）、`AC-TASK-006-01`–`AC-TASK-006-07`（7）、`AC-TASK-004-01`–`AC-TASK-004-04`（4）、`AC-TASK-005-01`–`AC-TASK-005-04`（4）
- 文件域（P4，31 条）：`AC-FILE-001-01`–`AC-FILE-001-06`（6）、`AC-FILE-005-01`–`AC-FILE-005-05`（5）、`AC-FILE-002-01`–`AC-FILE-002-05`（5）、`AC-FILE-003-01`–`AC-FILE-003-05`（5）、`AC-FILE-004-01`–`AC-FILE-004-06`（6）、`AC-FILE-006-01`–`AC-FILE-006-04`（4）
- 工作台汇总（P3，2 条）：`AC-WORK-004-01`、`AC-WORK-004-02` 沿用 P3 现 spec 的写法，本轮不改写；两条都列入本包 Covers，其可判定性由变更级 `AC-CHG-B1-001-05`（三态）补足。
判级：变更级
关闭日期：N/A：B1 已 parked 未开工，待用户批准后重启
## 1. 背景与问题

B1 要交付的是产品最短可用链路：在会话里发起任务，任务后台执行，产出文件，文件在会话里可列、可预览、可下载，工作台能看到这次交付的汇总。这条链路当前的四段各自都有断点。

任务段：后端 `tasks` 路由与状态机存在（`pending|blocked|queued|running|done|failed|cancelled|interrupted`），但前端没有执行组契约；`PRD-TASK-003` 要求的异步开始与结束消息只对 workflow 任务写（`workflow.go:447-450`），单任务没有；预算接口返回固定值（`runtime.go:305`）。

文件段：后端有会话文件聚合（`chat/files.go:23-123`）与交付物列表（`tasks/deliverables.go:26-116`），但前端没有文件页，点交付物是 `window.open(previewUrl)` 整页打开（`app.tsx:813-814`）；分类型预览、下载文件名安全、越界拒绝都没有验收判据。

汇总段：工作台三态（loading/empty/error）在 `app.tsx:1067-1070` 已存在，但没有对应的产品 AC 与走查证据。

文档段：P2/P4 的产品 spec 是模板批量生成的，每个 PRD 只有两条泛化 AC（"用户能完成…并看到一致结果"），无法判定 pass/fail，也无法映射到断言脚本。

## 2. 目标

- P2/P4 的每个 PRD 都有能落到断言脚本或明确人工步骤的 AC，并写清证据形式与判定人。
- B1 范围的 8 个 PRD（`TASK-001/002/003/006`、`FILE-001/003/004`、`WORK-004`）有一条端到端出口判据，能把"发起 → 执行 → 产出 → 汇总"作为整体验收，而不是八个域各自为政。
- 现状与产品要求的差距被显式记录（P2 §8、P4 §8），实现前不把差距当能力。
- 不确定的产品选择进"待裁决"，不替产品做主。

## 3. 覆盖范围

| PRD | AC 条数 | AC 编号 | 本轮处置 |
|---|---|---|---|
| `PRD-TASK-001` 任务生命周期与执行组 | 6 | `AC-TASK-001-01`–`06` | AC 已改写 |
| `PRD-TASK-002` 任务概览与进度 | 4 | `AC-TASK-002-01`–`04` | AC 已改写 |
| `PRD-TASK-003` 长任务异步与开始/结束消息 | 5 | `AC-TASK-003-01`–`05` | AC 已改写；实现 `unimplemented` |
| `PRD-TASK-006` 取消·重试·预算·恢复 | 7 | `AC-TASK-006-01`–`07` | AC 已改写 |
| `PRD-TASK-004` 复杂度分级与确认门禁 | 4 | `AC-TASK-004-01`–`04` | AC 已改写；排期仍归 B3 |
| `PRD-TASK-005` 子会话与任务归属 | 4 | `AC-TASK-005-01`–`04` | AC 已改写；排期仍归 B3 |
| `PRD-FILE-001` 会话文件聚合与列表 | 6 | `AC-FILE-001-01`–`06` | AC 已改写 |
| `PRD-FILE-003` 交付物卡片与列表 | 5 | `AC-FILE-003-01`–`05` | AC 已改写 |
| `PRD-FILE-004` 预览与下载 | 6 | `AC-FILE-004-01`–`06` | AC 已改写 |
| `PRD-FILE-005` 工作区目录与输出隔离 | 5 | `AC-FILE-005-01`–`05` | AC 已改写；排期仍归 B2 |
| `PRD-FILE-002` 上传与附件 | 5 | `AC-FILE-002-01`–`05` | AC 已改写；排期仍归 B2 |
| `PRD-FILE-006` 文件生成 | 4 | `AC-FILE-006-01`–`04` | AC 已改写；排期仍归 B4 |
| `PRD-WORK-004` 工作台交付物与三态 | 2 | `AC-WORK-004-01`–`02` | 沿用 P3 原 AC，由变更级 AC 补足可判定性 |
| 合计 | 63 | — | 61 条为 P2/P4 改写后的可判定判据，2 条为 P3 现有 AC |

B1 不覆盖的 P4 PRD 保留原样：`FILE-005`（5 条）与 `FILE-002`（5 条）归 B2，`FILE-006`（4 条）归 B4；本轮只改写了它们的 AC 写法，不把它们纳入 B1 出口。

## 4. 变更级验收标准（出口判据）

以下 7 条是 B1 的整体出口。每条的证据在实现前记 `missing`；只有实现完成、测试执行、独立验收签字后才可能转 `pass`。

### `AC-CHG-B1-001-01` · 端到端主链路：发起 → 执行 → 产出 → 汇总

1. 在会话 S 内发起任务 T（任务只能由 agent 循环创建，无 `POST /api/tasks`，见 `chat/loop.go:562`），T 在 5 秒内出现在 `GET /api/tasks?sessionId=S` 且 `status="queued"`。
2. T 进入 `running` 后，`GET /api/sessions/S/spec-projection` 的任务项 `status` 在 10 秒内反映 `running`；`GET /api/tasks/T` 的 `progress` 单调不减。
3. T 完成时 `status="done"`、`progress=100`、`outcome="success"`，并写出 1 条 `delivery_kind="user_delivery"` 产物。
4. `GET /api/sessions/S/files` 与 `GET /api/deliverables` 都能列出该产物（前者是会话内文件聚合，后者是工作台数据源）。
5. 前端会话内点击该产物，预览请求返回 `200` 且 `Content-Type` 与产物类型匹配；工作台出现该产物的卡片。

证据形式：`scripts/ac/AC-CHG-B1-001-01.mjs` 的 JSON 输出 + 1 张会话内预览截图 + 1 张工作台截图。判定：自动断言 + 验收 Agent 看截图，各一半。

### `AC-CHG-B1-001-02` · 失败与重试闭环

1. 构造一个必然失败的任务（工具报错或超 `maxSteps`），终态 `status="failed"`，`outcome` 非空，前端任务项显示失败态。
2. 失败态下"重试"入口可见且可点；点击后 `POST /api/tasks/{id}/retry` 返回 `200`，`attempt` 从 n 变为 n+1、`status="queued"`、`progress=0`，`task.id` 不变。
3. 重试后再次失败或成功均可，但两次尝试的产物都保留，`GET /api/tasks/T` 的 `artifacts` 能同时看到（或实现方在任务记录里写明保留/清理口径）。

证据形式：`scripts/ac/AC-CHG-B1-001-02.mjs`（含 attempt 前后对比与产物计数）+ 1 张失败态截图。判定：自动。

### `AC-CHG-B1-001-03` · 取消闭环

1. `running` 任务点取消后 5 秒内 `status="cancelled"`（后端最多等 5 秒，见 `service.go:360-382`）。
2. 取消后 30 秒内不产生新的 `user_delivery` 产物；若有删除，记删除条数与原因。
3. 对已 `done` 的任务再取消，返回 `200` 且不改变 `status`（幂等），不返回 409。
4. 前端取消按钮在 `running` 时可见，取消后按钮消失或变为禁用。

证据形式：`scripts/ac/AC-CHG-B1-001-03.mjs` + 取消前后两张截图。判定：自动 + 验收 Agent 看截图。

### `AC-CHG-B1-001-04` · 文件越界负用例集

以下四条负路径全部返回 `404`（或 §5 裁决后的拒绝码），且响应体不含文件内容：

1. `GET /api/artifacts/{id}/content?path=../../.env`（路径穿越）；
2. 读取一个内部产物（不可作为用户交付物）且不带 `source=files`；
3. 读取其他会话的产物 id（跨会话隔离）；
4. 会话 id 不存在时的 `GET /api/sessions/{not-exist}/files`。

判据细节见 `AC-FILE-005-01`–`05` 与 `AC-FILE-001-06`；本变更级 AC 只要求四条同时跑并全部拒绝，任一返回 `200` 即整条 fail。证据形式：`scripts/ac/AC-CHG-B1-001-04.mjs` 的逐 case JSON。判定：自动。

### `AC-CHG-B1-001-05` · 工作台三态

1. `loading`：请求尚未返回时存在可见加载指示节点（`[role="status"]` 或文本含「加载」的节点，实现方式不限），且加载期间页面不出现 `%` 形式的进度数字。
2. `empty`：`GET /api/deliverables` 返回 `deliverables: []` 时，工作台显示空态文案，交付物卡片数为 0。
3. `error`：接口返回 5xx 时，工作台显示错误态并提供重试，点击重试会重新发起请求。
4. 三态各 1 张 8787 端口走查截图，三张截图对应同一路由。

证据形式：`scripts/ac/AC-CHG-B1-001-05.mjs`（用 mock 或参数注入三态）+ 3 张截图。判定：自动（DOM 断言）+ 验收 Agent 看截图。

### `AC-CHG-B1-001-06` · 状态机封闭与重启恢复

1. 任务状态只出现 `pending|blocked|queued|running|done|failed|cancelled|interrupted` 八个值，接口与前端不出现第九个值。
2. 服务重启后，重启前处于 `running` 的任务在 `GET /api/tasks?sessionId=` 中变为 `interrupted` 或 `blocked`，不残留 `running`。
3. `queued` 任务重启后重新入队并最终到达终态，或明确停在 `blocked` 并有汇报消息。

证据形式：`scripts/ac/AC-CHG-B1-001-06.mjs`（重启通过重启子进程实现）+ 后端日志行。判定：自动。

### `AC-CHG-B1-001-07` · 文档一致性与门禁

1. `node scripts/check-trace.mjs` 退出码为 0，输出 `PASS (checks: N)`，N 与本次改动前一致或更大。
2. `node scripts/check-sdd.mjs` 对本包 5 个文件不报 R1–R3 错误。
3. P2/P4 的每个 AC 在 `specs/test/<域>/test-plan.md` 的 `Covers:` 段有映射，或缺映射时显式写 `missing` 并注明原因。
4. TREE.md 与 TREE-FULL.md 的 P2/P4 状态列未改动，仅在 AC 数变化的行有 `CHG-B1-001` 注记。

证据形式：两条命令的退出码与 stdout 原文，贴在 `evidence.md`。判定：自动；`scripts/ac/AC-CHG-B1-001-07.mjs` 待实现，当前由验收 Agent 人工执行两条命令并核对退出码，记 `missing` 直至命令落盘。

## 5. 现状差异与裁决（摘要）

完整清单见 [`P2-TASK/spec.md` §8](../../product/P2-TASK/spec.md) 与 [`P4-FILE/spec.md` §8](../../product/P4-FILE/spec.md)。本包依赖的 6 条差异与 8 条已裁决（2026-11-22）条目如下，实现前必须先处理标记为"阻塞"的条目。

| 编号 | 内容 | 影响 | 处置 |
|---|---|---|---|
| `P2 D-01` | 开始消息未实现、结束消息只覆盖工作流任务（`real_executor.go:62-122`、`workflow.go:447-450`） | `AC-TASK-003-02`–`04` 无法 pass | 待实现，B1 内完成 |
| `P2 D-02` | 投影 ETag 按任务数+limit 生成，不保证 progress 5 秒内刷新 | `AC-CHG-B1-001-01` 第 2 步的时间上界可能不达 | 已裁决：走 WS `task.progress` + 5 秒兜底轮询，AC 只约束 5 秒内可见 |
| `P2 D-03` | 预算硬编码 `200000 / used:0`（`chat/runtime.go:305`） | `AC-TASK-006-06` 无法 pass | 待实现，接真实用量 |
| `P2 D-04` | `GET /api/tasks/{id}` 不校验 sessionId 归属 | `AC-CHG-B1-001-04` 第 3 条 fail | 待实现，阻塞安全出口 |
| `P2 D-05` | retry 对 running 任务无守卫 | `AC-TASK-006-02` 的前置可能被破坏 | 待实现或产品裁决允许 |
| `P4 D-03` | 前端无文件页（`app.tsx:813-814` 整页 `window.open`） | `AC-FILE-001-*` 前端侧无法验收 | 待实现，B1 内完成 |
| `P4 D-04` | 预览整页跳转，无分类型渲染 | `AC-FILE-004-03` 无法 pass | 待实现，B1 内完成 |

已裁决 8 条（2026-11-22，细节见 P2/P4 §8）：`P2 Q-01` 开始消息取 `role=agent`、`category=progress`，带 `task_id`，历史消息不迁移；`P2 Q-02` 事件类型固定为 `complexity_classified`、`task_confirmed`，不设自动执行超时，30 分钟前端提示、12 小时概览标「待确认超时」，只标记不执行；`P2 Q-03` 父会话概览只统计本会话任务，父层给「含 N 个子会话」入口；`P2 Q-04` 进度刷新走 WS `task.progress` 加 5 秒兜底轮询，AC 只约束 5 秒内可见；`P4 Q-01` 0 字节文件返回 400 `empty_file`；`P4 Q-02` 预览在会话右栏「文件」标签内抽屉渲染，PDF 走新标签页，始终提供下载；`P4 Q-03` 同名重复生成新增产物并追加 `-2`/`-3`，不覆盖；`P4 Q-04` 文件页入口固定在会话右栏「文件」标签，条数与 `GET /api/sessions/{id}/files` 一致。

## 6. 非目标与不做的事

- 不实现、不排期、不估工时、不指派 owner。
- 不把 P2/P4 的状态列改成 `covered`，不改 TRACEABILITY 的覆盖列。
- 不为 `PRD-TASK-004/005` 争取 B1 排期；它们仍属 B3。
- 不写"通过"结论：本包所有证据在实现前一律 `missing`。

## 7. 需求（R）

- R1 会话内发起任务后，任务在 5 秒内可列出且状态为 `queued`，进度只增不减（`AC-CHG-B1-001-01`）。
- R2 任务失败后前端可见失败态，重试保留 `task.id`、`attempt` 递增，两次尝试产物均可查（`AC-CHG-B1-001-02`）。
- R3 运行中任务可取消且取消幂等，已 `done` 任务再取消返回 200 且不改状态（`AC-CHG-B1-001-03`）。
- R4 路径穿越、内部产物、跨会话、会话不存在四条越界路径全部拒绝且不泄露内容（`AC-CHG-B1-001-04`）。
- R5 工作台 loading/empty/error 三态各有 DOM 判据与同一路由的 8787 截图（`AC-CHG-B1-001-05`）。
- R6 任务状态只使用八个既定值，服务重启后不残留 `running`（`AC-CHG-B1-001-06`）。
- R7 本包五个文件通过 `check-sdd` 与 `check-trace`，P2/P4 缺映射的 AC 显式写 `missing`（`AC-CHG-B1-001-07`）。

## 8. 状态与错误边界

- 任务状态枚举固定为 `pending|blocked|queued|running|done|failed|cancelled|interrupted` 八值，接口与前端不得出现第九个值；新增状态须先改产品 AC 再实现。
- 失败任务必须有非空 `outcome`；重试后 `attempt` 加一、`status="queued"`、`progress=0`，旧产物按 §4 `AC-CHG-B1-001-02` 第 3 条口径保留或注明清理。
- 取消只对运行中任务改变状态；对已 `done` 的任务取消按幂等处理，返回 200 而不是 409。
- 越界读取统一返回 404（或 §5 裁决后的拒绝码），响应体不得包含文件内容；任一返回 200 即该条 fail。

## 9. 接口与数据

- 任务接口：`GET /api/tasks?sessionId=`、`GET /api/tasks/{id}`、`POST /api/tasks/{id}/retry` 与取消入口；本轮只核对形状与归属校验，不新增接口。
- 投影与文件接口：`GET /api/sessions/{id}/spec-projection`、`GET /api/sessions/{id}/files`、`GET /api/deliverables`、`GET /api/artifacts/{id}/content`。
- 任务记录字段至少含 `id`、`status`、`progress`、`attempt`、`outcome`、`artifacts`；产物记录以 `delivery_kind="user_delivery"` 区分用户交付物。
- 本轮不改表结构与迁移，字段口径沿用 P2/P4 域 spec §8 的已核实基线。

## 10. 待确认

- B1 开工时指派实现 owner 与验收 owner；当前 `Owner:` 只写到产品，任务卡 owner 一列在开工前记为待指派。
- `P2 D-04`（任务详情不校验 sessionId 归属）与 `P2 D-05`（retry 无运行中守卫）在 B1 内修复还是另开变更，待 Lead 裁决。
- 工作台 error 态重试是否需要退避策略，产品未给口径，暂按单次重试验收。

## 11. 链接

- B1 范围与出口判据：[`TREE-FULL.md`](../../../docs/product/TREE-FULL.md:241)。
- 域 spec：[`P2-TASK/spec.md`](../../product/P2-TASK/spec.md)、[`P4-FILE/spec.md`](../../product/P4-FILE/spec.md)、[`P3-WORK/spec.md`](../../product/P3-WORK/spec.md)。
- 追溯矩阵：[`TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)；门禁规则：[`GATES.md`](../../../docs/framework/GATES.md)。
- 测试计划：`specs/test/P2-TASK/test-plan.md`、`specs/test/P4-FILE/test-plan.md`。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-22：建立本包并首次登记状态。
- 2026-11-22：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

未收口：当前状态为七值口径中的一项，剩余工作与缺口见本文件
「待确认」节与 `test-plan.md` 的未覆盖清单；关闭前需补齐证据并由验收 Agent 独立签字。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。
