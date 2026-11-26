# Implementation Plan: 任务域 P2 六点

**Branch**: `007-task-domain` | **Date**: 2026-11-26 | **Spec**: [spec.md](./spec.md)
**Input**: 收窄后的 `spec.md`，覆盖 `PRD-TASK-001` 至 `PRD-TASK-006`。

方案按数据层、接口层、前端层三块展开，每项给出改动文件、关键实现点与对应 AC。实现顺序在 §4 说明，测试与证据在 §5，风险在 §6。本方案不含代码，实现由后续任务卡承接。

## 1. 技术上下文

- 后端：Go，本地 SQLite，迁移在 `backend/internal/modules/tasks/migrations.go`，当前最高版本为 v9（`P1-CONV-009 steps, traces, batches, deps`）。
- 前端：React + TypeScript，任务面板在 `frontend/src/components/tasks.tsx`，消息渲染在 `frontend/src/components/library.tsx`，事件处理在 `frontend/src/app.tsx`。
- 事件：进程内事件日志 `backend/internal/core/eventlog/eventlog.go`，当前任务事件 6 类，无 `task.progress`。
- 验收：30 条 `AC-TASK-*` 尚无脚本，`scripts/ac/` 下没有任何 `AC-TASK-*` 文件；浏览器类判据走 CDP 脚本。
- 时间：确认超时、5 秒进度、30 秒静默都用注入时钟推进，不真实等待。

## 2. 约束与不做的部分

沿用 `spec.md` §1.2：`CONV-009` 的卡片、右栏几何、任务图、交付物下载不在本方案内；P4 文件域不碰；历史任务不补消息。

三条已裁决口径作为设计前提，方案里不再给备选：复杂度以 `docs/task-complexity.md` 为唯一事实源，C2 及以上先出方案卡，确认前不建任务行、不建子会话、不产生副作用；C2 确认后当前会话建 1 条任务，C3 确认后建 1 个子会话并在其中建任务、父级 0 任务，C4 确认后建 3–4 个子会话、父级 0 任务；预算耗尽取 `running` + `waitingReason=resource` + `outcome=budget_exceeded`；开始消息与结束消息各自独立写入，`category=progress`，与任务卡并存。

## 3. 分层设计

### 3.1 数据层

| 项 | 文件 | 改动 | 对应 AC |
|---|---|---|---|
| D1 复杂度字段 | `backend/internal/core/task/task.go`、`backend/internal/modules/tasks/migrations.go` | `Task` 增加 `Complexity string`；v10 迁移 `ALTER TABLE tasks ADD COLUMN complexity TEXT NOT NULL DEFAULT ''`，历史行为空串，前端显示「历史任务·未分级」 | AC-TASK-004-01 |
| D2 计划表 | `backend/internal/modules/tasks/migrations.go`、新建 `backend/internal/modules/tasks/plan.go` | v11 建 `task_plans`：`id`、`session_id`、`complexity`、`status`、`plan_message_id`、`child_session_ids`（JSON 文本）、`request_text`、`created_at`、`decided_at`、`expires_at`；索引 `idx_task_plans_session_status(session_id, status)` | AC-TASK-004-01 至 004-04 |
| D3 子会话计数 | `backend/internal/modules/sessions/service.go`、`backend/internal/modules/sessions/spec_projection.go` | 不新增冗余计数列；子会话数按已有 `sessions.parent_id` 聚合（`idx_sessions_parent` 已存在），计划把本次自动建出的会话 id 写入 `task_plans.child_session_ids`；投影与详情返回 `childSessionCount` 与 `childSessionIds` | AC-TASK-005-02 |
| D4 开始消息与 task.progress | `backend/internal/core/eventlog/eventlog.go`、`backend/internal/modules/tasks/service.go`、`backend/internal/modules/tasks/migrations.go` | 事件常量增加 `TypeTaskProgress = "task.progress"`；`Task` 已有 `ReportMessageID` 复用为开始消息 id，不新增列；写进度时发 `task.progress`（payload：`taskId`、`progress`、`status`、`attempt`）；进度写入与 `task.updated` 同事务 | AC-TASK-002-03、AC-TASK-003-02 |
| D5 结束消息 | `backend/internal/modules/tasks/migrations.go`、`backend/internal/modules/tasks/service.go` | v10 同时 `ALTER TABLE tasks ADD COLUMN end_message_id TEXT NOT NULL DEFAULT ''`；`Task` 增加 `EndMessageID`；终态写入时在同一事务里置位，作为幂等键 | AC-TASK-003-03、AC-TASK-003-05 |
| D6 预算与等待 | `backend/internal/modules/tasks/real_executor.go`、`backend/internal/core/task/task.go`、`backend/internal/modules/chat/runtime.go` | `BudgetJSON` 扩为 `{maxTokens,maxSteps,usedTokens,usedSteps}`，每步累加；判定读任务自身预算，删除 `runtime.go:305` 的固定 200000/used 0；触顶保持 `running`，置 `waitingReason=resource`、`outcome=budget_exceeded` | AC-TASK-006-06 |
| D7 重启恢复 | `backend/internal/modules/tasks/service.go:118-244` | 重启扫描不再跳过 `queued`：`queued` 保持排队并补一次调度（转 `queued` 或发 `task.updated` 触发调度，按 §7 待核定案）；`running` 有检查点回 `queued`，副作用未知回 `blocked`，其余 `interrupted` | AC-TASK-006-07 |

数据层的关键取舍有三处。复杂度和结束消息共用 v10 迁移，避免两次改表；历史任务的 `complexity` 留空而不是回填 `C2`，回填会把未分级的历史任务伪造成已分级，与「状态以代码为准」冲突。子会话数不落冗余列，`parent_id` 已有索引，实时聚合的代价是每次列表多一次计数查询，收益是不会与子会话表漂移；`childSessionIds` 只记录自动创建的会话，供父层入口直接跳转。开始消息复用 `report_message_id` 而不新增 `start_message_id`，因为该字段本就表示任务汇报消息，历史值为空正好作为「未写」的判据。

### 3.2 接口层

| 项 | 文件 | 改动 | 对应 AC |
|---|---|---|---|
| I1 开始消息写入点 | `backend/internal/modules/tasks/service.go`（`startAttempt`）、`backend/internal/modules/tasks/conv.go`（`Cancel` 的终态路径） | 在 `queued→running` 的状态更新事务内插入开始消息：`role=agent`、`category=progress`、`task_id`、正文含标题，生成 `msg_` 前缀 id 后回写 `tasks.report_message_id`；状态更新用 `WHERE status='queued'` 做 CAS，只有更新成功才插消息，重复调用不产生第二条；写入失败回滚整个事务，任务不进入 `running` | AC-TASK-003-02 |
| I2 结束消息写入点 | `backend/internal/modules/tasks/real_executor.go:62-122`、`backend/internal/modules/tasks/conv.go`（取消路径） | 所有终态出口收敛到一个 `finalizeTask`：事务内 CAS 到终态、置 `end_message_id`（为空才写）、插结束消息（结论或失败原因 + 产物名）；单任务与 workflow 共用该函数，workflow 额外带 `workflow_id`；终态后不再写任何任务消息 | AC-TASK-003-03、AC-TASK-003-05 |
| I3 旧详情路由会话校验 | `backend/internal/modules/tasks/http.go:211-233` | `handleGet` 从查询参数或 `X-Session-Id` 取会话，任务 `session_id` 不匹配返回 404「任务不存在」；会话缺省时按当前会话解析，解析不到同样 404；会话内路由 `conv_http.go:19` 复用同一校验函数 | AC-TASK-001-06 |
| I4 旧重试状态守卫 | `backend/internal/modules/tasks/service.go:386-415`、`backend/internal/modules/tasks/conv.go:1468-1536` | `Retry` 入口统一校验状态白名单 `failed/cancelled/interrupted`，`running`、`queued`、`done` 返回 409 且不改 `attempt`；旧 `POST /api/tasks/{id}/retry` 与新 `POST /api/sessions/{id}/tasks/{taskId}/retry` 调同一函数，不各写一份 | AC-TASK-006-04 |
| I5 计划与确认接口 | 与 `backend/internal/modules/tasks/conv_http.go:15-25` 同一处注册；新建 `backend/internal/modules/tasks/plan_http.go` | 新增 `POST /api/sessions/{id}/task-plans`：分类并落 `pending` 计划，同时写 1 条 `category=confirmation` 的方案消息（记 `plan_message_id`），返回 `planId`、`complexity`、确认/拒绝入口；`GET .../task-plans/{planId}`；`POST .../confirm` 与 `.../reject` 只改计划状态，不建任务、不建子会话；重复确认返回 200 且幂等，已拒绝再确认返回 409。C2 及以上的请求都先出方案卡，确认卡是唯一确认入口。已有 `POST /api/sessions/{id}/tasks/{taskId}/confirmation` 是任务级确认，不能用于建任务前确认，保留原语义不复用 | AC-TASK-004-01 至 004-04 |
| I5b 计划派生 | `backend/internal/modules/tasks/plan.go`、`backend/internal/modules/sessions/service.go:106-127` | 确认成功后由独立 `materializePlan` 在一个事务里派生：C2 当前会话建 1 条任务；C3 建 1 个子会话并在其中建 1 条任务；C4 建 3–4 个子会话、每个子会话各建 1 条任务；父级不建任务；`child_session_ids` 记录子会话，计划状态置 `confirmed`；派生按计划状态幂等，重复调用不重复建；拒绝走 `rejected`，不调用派生 | AC-TASK-004-01 至 004-03、AC-TASK-005-01 |
| I6 子会话计数接口 | `backend/internal/modules/sessions/` 会话详情与投影、`backend/internal/modules/sessions/spec_projection.go:343-352` | 详情与投影增加 `childSessionCount`；新增 `GET /api/sessions/{id}/children` 返回 `[{id,title,createdAt,taskCount}]`，只返回直接子会话；`GET /api/sessions/{id}/tasks` 严格按 `session_id` 精确匹配，不递归子会话 | AC-TASK-005-02、AC-TASK-005-03 |
| I7 进度推送 | `backend/internal/modules/tasks/service.go:442-540`、WS 事件转发处 | 进度写入发 `task.progress`；WS 转发白名单加入该事件；前端 5 秒兜底轮询 `GET /api/tasks?sessionId=` 补齐漏推 | AC-TASK-002-03 |
| I8 旧取消路由对齐 | `backend/internal/modules/tasks/http.go:21`、`backend/internal/modules/tasks/conv.go:1208-1432` | 旧 `POST /api/tasks/{id}/cancel` 与新会话内路由共用取消逻辑：5 秒窗、self/chain、终态幂等、取消后清等待原因 | AC-TASK-006-01 至 006-03 |

接口层的关键取舍有三处。开始消息放在任务模块的事务里直接写 `messages`，不走 `task.report` 事件让 chat 模块代写，原因是事件消费是异步的，无法保证「写不进开始消息就不进 `running`」这条约束；`conv.go:708` 已经证明任务模块可以写消息表，沿用同一连接不引入新依赖。结束消息收敛成 `finalizeTask`，因为当前终态出口分散在执行成功、执行失败、取消、重启中断四处，任何一处漏写都会让 `AC-TASK-003-03` 随机失败。确认接口与计划派生拆成两步：确认接口只把计划从 `pending` 翻到 `confirmed`，派生由 `materializePlan` 在确认成功后单独执行，这样方案卡与确认接口可以先实现、先验收，子会话创建晚一步落地，「确认前不建子会话」不会因为两步耦合而被破坏。计划接口新建而不复用任务级确认接口，因为确认发生在建任务之前，任务级接口的路径参数要求任务已经存在，语义对不上。

### 3.3 前端层

| 项 | 文件 | 改动 | 对应 AC |
|---|---|---|---|
| F1 真实进度条 | `frontend/src/components/tasks.tsx`、`frontend/src/components/TaskDetail` 相关组件 | 进度条取接口或 `task.progress` 的真实值，渲染 `role="progressbar"`、`aria-valuenow`、宽度百分比；`queued` 显示 0 但不画 0% 文本，`done` 显示 100；加载期用骨架，不渲染任何数字百分比；移除本地模拟递增 | AC-TASK-002-01、002-03、002-04 |
| F2 概览三行与计数 | `frontend/src/components/library.tsx:1234-1239` | 概览由 2 条改为 3 条；运行中、排队中、已完成分别取 `statusCounts`，不再把 `queued`、`blocked` 合并；行数与点击后的列表条数一致 | AC-TASK-001-01、002-02 |
| F3 状态文案 | `frontend/src/components/tasks.tsx:7-30` | 由 4 种补到 8 种存储态文案，映射集中在一处，未知状态回退为原值而不是「未知」 | AC-TASK-001-03 |
| F4 开始与结束消息 | `frontend/src/components/library.tsx`（`MessageItem`，`:558-600` 的 category 分支）、`frontend/src/app.tsx:813-841` | `category=progress` 且带 `taskId` 的消息按开始/结束两种样式渲染：开始显示任务标题与「开始执行」，结束显示结论与产物名；任务卡（`category=task`）仍单独渲染，不被消息替换；`task.progress` 事件到达时更新对应任务行，不整页刷新 | AC-TASK-003-02、003-03、003-05 |
| F5 复杂度确认卡 | `frontend/src/components/library.tsx`、`frontend/src/components/MessageItem` 的确认类分支 | C2 及以上的请求在父会话消息流里各出 1 条 `category=confirmation` 的方案卡，渲染复杂度标签、确认后将创建的任务或子会话数量、确认与拒绝两个按钮；确认前不出现任务卡，也不出现子会话；30 分钟等待提示与 12 小时「待确认超时」标记按注入时钟断言 | AC-TASK-004-02、004-03、004-04 |
| F6 父层子会话入口 | `frontend/src/app.tsx:1521`、`frontend/src/components/library.tsx` 会话行 | 「含 N 个子会话」按钮在 N>0 时启用，点击展开直接子会话列表；子会话任务不出现在父层任务组与计数；入口数量取 `childSessionCount`，与 `GET /api/sessions/{id}/children` 一致 | AC-TASK-005-02 |

前端层的关键取舍有三处。加载期不渲染 `0%` 而是骨架，是因为 `AC-TASK-002-04` 按 DOM 里是否存在 `\d+%` 判定，任何占位百分比都会让判据失败。开始与结束消息都保留 `category=progress`，仅靠正文与位置区分，这样 `AC-TASK-003-05` 的字段集比较才能在单任务与 workflow 之间成立；视觉上再按消息是否带产物名分出两种样式。父层入口不把子任务并进父列表，只在入口内部展示，避免 `AC-TASK-005-02` 的父计数被污染。

## 4. 实现顺序与理由

顺序固定为 001 与 002 收口 → 003 开始结束消息 → 006 预算与守卫 → 004 复杂度 → 005 子会话。

001 与 002 先做，因为任务行与进度是后面所有能力的读取面：003 的消息要挂到任务行上，004 的确认卡要在确认后生成任务行，005 的父层入口要按任务计数判断是否显示。这两点不先收口，后面每一点都要返工读取层。

003 紧接着做，因为开始消息与结束消息是 006 的观测点：取消后 30 秒静默、重试后重新开始，都通过消息与事件的增量来断言。003 不落地，006 的判据没有观测面。

006 排在 004 之前，因为守卫是廉价的防护：旧详情、旧重试、旧取消三条旧路由在 004 引入计划接口后仍然可达，先把会话校验与状态守卫补齐，避免 004 的确认门禁被旧路由绕过。006 的预算等待与重启恢复依赖 003 的结束消息，顺序上也必须在其后。

004 在 005 之前，因为 C3 与 C4 的子会话由 004 的计划确认创建，005 的归属、计数与跨会话拒绝都以这些子会话为输入。004 内部再分两步：先做方案卡与确认接口，确认只把计划从 `pending` 翻到 `confirmed`，此时验收「确认前 0 任务、0 子会话」；再做 `materializePlan` 派生 C2 任务与 C3、C4 的子会话及子会话内任务。两步分开，确认门禁的判据不会被派生逻辑顺带满足而失去独立证据。005 最后做，它的入口与计数需要 004 的 `childSessionIds` 与 003 的消息归属都稳定。

每步的粒度与可并行项见 `tasks.md`。

## 5. 测试与证据

30 条 AC 当前 0 条脚本，全部记为 `missing`。实现阶段按层补：

- 接口与数据层：Go 测试放各模块包内，覆盖 001-06、002-01/02、003-01 至 003-05、004-01 至 004-04、005-01 至 005-04、006-01 至 006-07；每条约 1 个测试文件或既有测试文件的子测试。
- 浏览器层：`scripts/ac/AC-TASK-*.mjs` 走 CDP，覆盖 001-01/03/04/05、002-03/04、003 的消息渲染、004 的确认卡、005 的父层入口。
- 时间类：5 秒进度、30 秒静默、60 秒未确认、30 分钟与 12 小时提示，都用注入时钟推进并在断言里写清推进量；不使用真实等待。
- 迁移：v10、v11 各配一个升版测试，从 v9 库升级后旧任务 `complexity` 为空、`end_message_id` 为空，新任务可写入。
- 证据形式：测试命令与输出、`scripts/run-ac.mjs` 的 JSON 结果、CDP 截图；未跑过的 AC 在 `analyze.md` 里保持 `missing`。

## 6. 风险与回滚

- **迁移风险**：v10 改的是热表 `tasks`，SQLite 的 `ALTER TABLE ADD COLUMN` 是常数级，但升级窗口内旧进程可能读到空 `complexity`。缓解：迁移在启动时一次性执行，读路径对空值回退为「未分级」，不回填。
- **消息噪音**：批量任务每条各写开始与结束消息，10 条任务会多出 20 条 `progress` 消息。缓解：消息在时间线里按任务聚合展示，任务卡保持一张，`AC-CONV-009-*` 的渲染回归必须同时跑。
- **旧路由绕过**：004 新增计划接口后，旧 `POST /api/tasks/{id}/retry` 仍可直达。缓解：I4 统一守卫，旧路由与新路由共用同一函数，测试里两条路径都断言 409。
- **事件风暴**：`task.progress` 每步一发，长任务可能高频。缓解：进度按 5% 或 1 秒节流，前端合并渲染；事件仍逐条落库用于审计。
- **重启重排**：`queued` 重排若处理不当会在多实例下重复执行。当前是单进程部署，重排前先抢 `queued→running` 的 CAS；多实例不在本方案范围，记入待核。
- **回滚**：代码回滚按功能点独立，v10、v11 迁移只增列与增表，回滚代码不删列即可兼容；开始消息与结束消息可停止写入而不影响任务执行，`report_message_id`、`end_message_id` 留空即回到旧行为。

## 7. 待核

1. `queued` 重启重排的具体形态：保持 `queued` 等调度器扫描，还是转一次 `running` 再回 `queued` 触发调度。两种都能满足 `AC-TASK-006-07`，取实现简单且不产生假执行的一种，实现前定。
2. workflow 任务的开始消息是否复用 `startAttempt` 的写入点。当前 workflow 只在终态写汇报，`AC-TASK-003-05` 只要求字段集一致；若复用，需确认 workflow 的任务也经过 `startAttempt`。
3. `GET /api/sessions/{id}/tasks` 现状是否已严格按 `session_id` 过滤，还是包含子会话。若已包含，属于实现缺口而非新需求，在 005 一并修。
4. 前端 `task.progress` 的接入点：`app.tsx:813-841` 现在处理的是轮询或 `task.updated`，需确认 WS 消息分发函数名后再加分支。
