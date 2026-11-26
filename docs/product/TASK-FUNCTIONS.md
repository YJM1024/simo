# 司墨任务域与任务编排功能清单

本文覆盖任务域与任务编排的全部产品功能逻辑，范围包括 `PRD-TASK-001` 至 `PRD-TASK-006` 与 `PRD-CONV-009`。判定口径以仓库代码为准：代码里存在并有调用路径的写“已实现”，只实现一部分的写“部分实现”，只有 spec 或设计文档而没有代码的写“未实现”。每条行为的来源都落到具体文件与行号，并标注对应验收编号；读不到来源的行为不写进第 3 节，统一放进第 7 节的缺口。

## 1 一句话定义

任务是会话内一次可追踪的执行单元，由任务行、步骤、依赖、一条任务卡消息以及后续轨迹与交付物组成，通过 `sessionId` 归属到发起它的会话。子会话是会话树里的另一个会话，父会话不会因为派生子会话而把子会话里的任务计入自己的任务列表。一轮对话可以创建任务，任务本身跨越多个轮次持续运行，并用 `taskId` 把消息、步骤、轨迹和交付物串在同一条记录上。

## 2 功能点总表

| 功能点编号 | 标题 | 要解决的问题 | 状态 | 覆盖表状态 | 证据或缺口 |
|---|---|---|---|---|---|
| PRD-TASK-001 | 任务生命周期与执行组 | 让用户看见任务从创建到终态的完整过程，并能读取详情 | 部分实现 | partial（`specs/changes/CHG-CONV-007/spec.md:280-292`） | 状态机、列表、详情、批次创建均在（`backend/internal/modules/tasks/conv.go:100-151`、`:584-751`、`:947-1140`）；详情内没有重试、取消、编辑、删除入口；旧 `GET /api/tasks/{id}` 不校验会话（`backend/internal/modules/tasks/http.go:211-233`） |
| PRD-TASK-002 | 任务概览与进度 | 让用户在右栏概览里看懂当前会话的执行情况 | 部分实现 | partial（同上） | 投影三组与计数在（`backend/internal/modules/sessions/spec_projection.go:184-352`）；ETag 与 5 秒刷新未验证；概览只列前 2 条任务（`frontend/src/components/library.tsx:1234-1239`），与 `AC-TASK-001-01` 的 3 行不一致 |
| PRD-TASK-003 | 长任务异步与开始结束消息 | 发起后不阻塞对话，执行过程有始有终可追溯 | 部分实现 | unimplemented（`specs/product/P2-TASK/spec.md:182-189`） | 异步创建与任务卡消息已实现（`backend/internal/modules/chat/loop.go:549-605`、`conv.go:584-751`）；开始消息与单任务结束消息未实现（`backend/internal/modules/tasks/real_executor.go:62-122`、`workflow.go:447-450`） |
| PRD-TASK-004 | 复杂度分级与确认门禁 | 按复杂度决定建不建任务与子会话，并在执行前确认方案 | 未实现 | unimplemented（同上） | 全仓没有 `complexity` 字段、C0 至 C4 分级函数与 `TaskPlan` 表（`backend/internal/core/task/task.go:102-144`、`backend/internal/core/eventlog/eventlog.go:36-41`）；只有 `docs/task-complexity.md` 的设计 |
| PRD-TASK-005 | 子会话与任务归属 | 子会话里的任务不混进父会话，跨会话不可见 | 未实现 | unimplemented（同上） | 任务只按 `session_id` 归属（`conv.go:875-932`），没有 `childSessionIds`；父层“含 N 个子会话”入口不存在，前端按钮禁用（`frontend/src/app.tsx:1521`） |
| PRD-TASK-006 | 取消、重试、预算与恢复 | 长任务可中止、可重来、资源耗尽后可恢复 | 部分实现 | partial（同上） | 取消、重试、恢复接口齐（`conv.go:1208-1728`）；预算耗尽停在 `running` 加资源等待，不是 `blocked`（`real_executor.go:102-119`）；旧重试接口没有状态守卫（`backend/internal/modules/tasks/service.go:386-415`） |
| PRD-CONV-009 | 任务卡消息与右栏任务投影 | 在对话流与右栏里看见、打开并操作任务 | 已实现 | in 与 covered（`specs/changes/CHG-CONV-007/spec.md:280-292`） | 前端任务卡、筛选、详情、任务图、交付物全链在（`frontend/src/components/tasks.tsx`、`frontend/src/components/library.tsx`、`frontend/src/app.tsx`）；变更级 8 条 AC 已签 |

## 3 逐功能点展开

行为编号规则为 `B-<功能点序号>-<两位序号>`，全节共 94 条。每条先写行为本身，再写来源与验收编号；验收编号不存在时写“无对应 AC”，不硬凑。

## 3.1 PRD-TASK-001 任务生命周期与执行组

1. B-001-01 创建批次时每条任务以 `pending`、`progress=0`、`attempt=1` 落库，`orderIndex` 按输入顺序写入，来源 `backend/internal/modules/tasks/conv.go:584-751`，对应 `AC-TASK-001-01`。
2. B-001-02 任务行、步骤、依赖与一条任务卡消息在同一个事务内写入，消息角色为 `agent`、类别为 `task`、`task_id` 指向本批第一条任务，来源 `conv.go:584-751`，对应 `AC-CONV-009-01`。
3. B-001-03 同一会话的任务列表按 `updated_at` 倒序、`id` 倒序分页，`limit` 取 1 至 100、缺省 50，返回 `hasMore` 与 `nextBefore`，来源 `conv.go:947-998`，对应 `AC-TASK-001-01`。
4. B-001-04 列表支持 `status`、`mode`、`batchId` 过滤；展示态把存储态 `pending` 展开为 `pending`、`queued`、`blocked`，把 `failed` 展开为 `failed`、`cancelled`、`interrupted`，来源 `conv.go:875-932`，对应 `AC-TASK-001-03`、`AC-TASK-002-02`。
5. B-001-05 列表同时返回 `counts`，键为 `all`、`pending`、`running`、`failed`、`done`，`blocked` 与 `queued` 计入 `pending`，来源 `conv.go:823-840`，对应 `AC-TASK-002-02`。
6. B-001-06 详情返回 `task`、`steps`、`traces`、`deliverables`、`context`、`budget`，`currentStepId` 取第一个 `running` 步骤，没有时取第一个 `pending` 步骤，来源 `conv.go:1078-1140`，对应 `AC-TASK-001-02`、`AC-CONV-009-25`。
7. B-001-07 详情请求带 `sessionId` 且与任务所属会话不一致时返回 404，错误码 `task_not_found`，文案“任务不存在”，来源 `conv.go:1078-1100`，对应 `AC-TASK-001-06`。
8. B-001-08 旧的 `GET /api/tasks/{id}` 只按 id 查询，不接收也不校验 `sessionId`，跨会话读取因此没有被拦截，来源 `backend/internal/modules/tasks/http.go:211-233`，无对应 AC，是 `AC-TASK-001-06` 的缺口。
9. B-001-09 详情轨迹首屏返回 200 条、上限 500 条，超过上限按上限截断，来源 `conv.go:1092-1128`，对应 `AC-CONV-009-26`。
10. B-001-10 详情的 `context.historyCount` 固定为 0，`goal`、`inputs`、`constraints` 来自任务字段，没有输入与约束时返回空数组，来源 `conv.go:1131-1136`，对应 `AC-CONV-009-03`、`AC-CONV-009-25`。
11. B-001-11 会话没有任务时列表返回空数组、计数全 0、`total=0`、`hasMore=false`，前端显示“本会话还没有任务”，来源 `conv.go:947-998`、`frontend/src/components/tasks.tsx:179-181`，对应 `AC-TASK-001-04`。
12. B-001-12 列表或详情返回 500 时前端分别显示“任务加载失败”与“任务详情加载失败”，重试按钮再次发起请求，请求计数由 1 变为 2，来源 `tasks.tsx:170-174`、`tasks.tsx:616-624`，对应 `AC-TASK-001-05`。
13. B-001-13 状态机允许 11 条迁移，非法迁移返回 409、错误码 `task_state_conflict`、文案“任务当前状态不允许该操作”，并在 `extra` 带当前状态，来源 `conv.go:121-151`、`conv.go:1172-1203`，对应 `AC-TASK-001-03`。

## 3.2 PRD-TASK-002 任务概览与进度

1. B-002-01 进度是 0 至 100 的整数，`queued` 为 0，执行器起跑置 5，mock 执行器从 2 起按步推进且上限 99，成功置 100，来源 `backend/internal/modules/tasks/real_executor.go:25-40`、`backend/internal/modules/tasks/service.go:442-540`、`conv.go:1492-1536`，对应 `AC-TASK-002-01`。
2. B-002-02 任务卡与详情读取同一个 `progress` 字段，计划模式显示步骤刻度与“已完成 x/y 步”，边做边想模式显示轨迹条数，来源 `tasks.tsx:198-250`、`tasks.tsx:625-692`，对应 `AC-TASK-002-01`。
3. B-002-03 计数查询与列表查询共用同一段筛选条件，选 `failed` 时 `counts.failed` 与列表条数一致，来源 `conv.go:935-945`，对应 `AC-TASK-002-02`。
4. B-002-04 会话投影把任务归为 `done`、`running`、`pending` 三组，`done` 映射 `done`，`running` 映射 `running`，其余存储态全部映射 `pending`，因此概览的 `pending` 不等于存储态 `pending`，来源 `backend/internal/modules/sessions/spec_projection.go:343-352`，对应 `AC-TASK-002-02`。
5. B-002-05 投影每组返回 `total`、`items`、`hasMore`，`items` 受 `taskLimit` 限制，缺省 3、范围 1 至 50，越界返回 400，来源 `spec_projection.go:99-142`、`spec_projection.go:184-328`，对应 `AC-TASK-001-01`、`AC-TASK-002-02`。
6. B-002-06 投影的 ETag 由投影内容与 `taskLimit` 计算，请求带匹配的 `If-None-Match` 时返回 304，前端保留缓存占位，来源 `spec_projection.go:144-162`、`frontend/src/app.tsx:548-581`，对应 `AC-TASK-002-03`。
7. B-002-07 前端收到 `task.*` WebSocket 事件后合并任务并按 300 毫秒节流重取计数；全仓没有 5 秒定时轮询，只有 `frontend/src/api.ts:283` 的重试退避出现 5000 毫秒，因此 `spec` 里“5 秒兜底轮询”的路径没有实现，来源 `app.tsx:813-841`、`app.tsx:740-749`、`specs/product/P2-TASK/spec.md:218`，对应 `AC-TASK-002-03`。
8. B-002-08 任务列表加载中显示三张骨架卡，不显示进度数字或假进度条，来源 `tasks.tsx:175-178`，对应 `AC-TASK-002-04`。
9. B-002-09 右栏概览的任务块只展示前 2 条任务与“还有 N 个”，与 `AC-TASK-001-01` 的默认 3 行不一致，来源 `library.tsx:1234-1239`、`library.tsx:1276`、`specs/product/P2-TASK/spec.md:49-50`，对应 `AC-TASK-001-01` 的偏差项。

## 3.3 PRD-TASK-003 长任务异步与开始结束消息

1. B-003-01 用户界面只有对话意图一个创建入口：`loop.go` 在 `decision.TaskIntent` 为真且 `classifyTaskIntent` 命中时先经 `PlanTask` 写方案卡，确认后才派生任务，C0/C1 轻量请求直接回答、不建任务也不出方案卡（DEC-43），没有“新建任务”按钮；后端另有会话级 `POST /api/sessions/{id}/tasks`，不是 `POST /api/tasks`，来源 `backend/internal/modules/chat/loop.go:556-620`、`backend/internal/modules/tasks/plan.go:169-260`、`backend/internal/modules/tasks/conv_http.go:15-25`，对应 `AC-TASK-003-01`、`AC-TASK-003-06`。
2. B-003-02 创建在事务内完成并立即返回 `batchId`、`tasks`、`messageId`、`counts`，对话不等待执行结束，来源 `conv.go:584-751`、`conv_http.go:78-82`，对应 `AC-TASK-003-01`。
3. B-003-03 任务开始时应写一条 `role=agent`、`category=progress`、`taskId=T` 的消息，并把 `reportMessageId` 指向它；代码里没有这条写入，来源 `specs/product/P2-TASK/spec.md:95-96`，对应 `AC-TASK-003-02`，当前未实现。
4. B-003-04 任务结束时只由 workflow 任务写汇报消息，单任务 `WorkflowID` 为空时 `workflow.go` 直接返回，因此单任务没有结束消息，来源 `real_executor.go:62-122`、`backend/internal/modules/tasks/workflow.go:447-450`、`backend/internal/modules/chat/workflow_reports.go:14-70`，对应 `AC-TASK-003-03`。
5. B-003-05 单任务与 workflow 任务的结束消息字段集应相同；单任务没有结束消息，字段集一致性无从成立，来源同 B-003-04，对应 `AC-TASK-003-05`。
6. B-003-06 服务重启后 `running` 任务置 `interrupted`，`summary` 写明可用 `retry` 新 attempt，但开始消息并不存在，因此“开始消息仍只有 1 条”的断言无法满足，来源 `service.go:118-184`、`specs/product/P2-TASK/spec.md:99-100`，对应 `AC-TASK-003-04`。
7. B-003-07 创建时写的是 `category=task` 的任务卡消息，它承担入口与卡片展示，不能替代 `category=progress` 的开始消息，来源 `conv.go:584-751`、`specs/changes/CHG-CONV-007/spec.md:66-78`，对应 `AC-CONV-009-01` 与 `AC-TASK-003-02` 的差别。
8. B-003-08 会话不存在时创建返回 404“会话不存在”，参数非法返回 400，失败不落任务行，来源 `conv.go:584-600`，对应 `AC-TASK-003-01` 的失败路径。
9. B-003-09 同一 `clientMutationId` 重复创建返回原批次并标 `idempotent=true`，不重复写任务与消息，来源 `conv.go:584-640`，对应 `AC-TASK-003-01` 的边界路径。

## 3.4 PRD-TASK-004 复杂度分级与确认门禁

1. B-004-01 每个任务应在创建时归入 C0 至 C4 之一并落库；任务结构没有 `complexity` 字段，全仓也没有分级函数，来源 `specs/product/P2-TASK/spec.md:142`、`backend/internal/core/task/task.go:102-144`，对应 `AC-TASK-004-01`，当前未实现。
2. B-004-02 C0 即时回答，不建任务也不建会话；C1 只 fork 临时 Worker，不建正式任务与会话；代码对所有命中意图的请求统一建任务，来源 `docs/task-complexity.md:11-17`、`loop.go:562`，无对应 AC，当前未实现。
3. B-004-03 C2 在当前会话建 1 个任务、不建子会话，并先给方案等确认再执行；代码建任务后直接进入排队与执行，没有确认门禁，来源 `docs/task-complexity.md:11-17`、`conv.go:704-751`，对应 `AC-TASK-004-02`，当前未实现。
4. B-004-04 C3 在父级建 1 个子会话、父级 0 任务，方案确认后在子会话里建任务；代码没有派生会话的路径，来源 `docs/task-complexity.md:11-17`、`docs/task-complexity.md:21-36`，对应 `AC-TASK-004-02`，当前未实现。
5. B-004-05 C4 在父级建 3 至 4 个子会话、父级 0 任务，每个子会话各自建任务；代码没有这条路径，来源 `docs/task-complexity.md:11-17`，无对应 AC，当前未实现。
6. B-004-06 未确认的任务应持续保持 `blocked` 或 `pending`、`attempt=0`、没有 `running` 步骤，60 秒后仍不进 `running`；代码没有“等待确认”的任务态，创建后直接 `startAttempt`，来源 `specs/product/P2-TASK/spec.md:143-144`、`conv.go:751`，对应 `AC-TASK-004-02`，当前未实现。
7. B-004-07 用户拒绝确认后任务应为 `cancelled`、`attempt=0`、产物为 0；现有确认接口只处理执行中暂停，取消时把任务置 `failed` 且 `outcome=cancelled_by_user`，来源 `specs/product/P2-TASK/spec.md:145`、`conv.go:1574-1669`，对应 `AC-TASK-004-03`，语义不一致。
8. B-004-08 未确认超过 30 分钟只在前端提示，超过 12 小时只在概览标“待确认超时”，两种情况都不自动执行，来源 `specs/product/P2-TASK/spec.md:143-144`，对应 `AC-TASK-004-02`，因没有确认等待态而未实现。
9. B-004-09 分级与确认应各写 1 条 `complexity_classified` 与 `task_confirmed` 事件；事件日志只有 `task.created`、`task.updated`、`task.report`、`task.step`、`task.trace`、`task.reminder` 六类，来源 `specs/product/P2-TASK/spec.md:146-147`、`backend/internal/core/eventlog/eventlog.go:36-41`，对应 `AC-TASK-004-04`，当前未实现。

## 3.5 PRD-TASK-005 子会话与任务归属

1. B-005-01 创建任务要求 `sessionId` 存在，任务行的 `session_id` 写入该会话 id，来源 `conv.go:584-600`，对应 `AC-TASK-005-01`。
2. B-005-02 子会话里创建的任务，其 `sessionId` 是子会话 id，不是父会话 id；任务表只按 `session_id` 归属，因此该行为在数据层成立，但代码没有按复杂度自动派生子会话的路径，来源 `conv.go:875-932`、`backend/internal/modules/sessions/service.go:37-78`，对应 `AC-TASK-005-01`。
3. B-005-03 父会话的任务列表只返回 `session_id` 等于父会话 id 的任务，子会话任务不在其中，来源 `conv.go:875-932`，对应 `AC-TASK-005-02`。
4. B-005-04 父会话的右栏投影只统计本会话任务，子任务不计入父层计数，来源 `spec_projection.go:184-328`，对应 `AC-TASK-005-02`。
5. B-005-05 父会话任务组旁应给“含 N 个子会话”入口并可展开；代码没有 `childSessionIds` 字段、没有子会话计数、没有该入口，顶栏“含子会话”按钮禁用并提示“当前版本仅加载当前会话”，来源 `docs/task-complexity.md:21-36`、`frontend/src/app.tsx:1521`，对应 `AC-TASK-005-02`，当前未实现。
6. B-005-06 跨会话按 id 查询详情时，新接口返回 404“任务不存在”，旧接口仍按 id 返回，来源 `conv_http.go:194-210`、`http.go:211-233`，对应 `AC-TASK-005-03`。
7. B-005-07 跨会话取消、重试、确认、恢复在动手前统一调用详情做归属校验，不一致返回 404，来源 `conv_http.go:169-243`，对应 `AC-TASK-005-03`、`AC-CHG-CONV-007-04`。
8. B-005-08 归档父会话只把该会话行置 `archived=1`，不改子会话，也不改任务行，子任务仍可读且 `sessionId` 仍指向子会话，来源 `backend/internal/modules/sessions/spec.go:291-321`，对应 `AC-TASK-005-04`。
9. B-005-09 前端对已归档会话的任务卡传 `readOnly=true`，卡片不显示确认、取消、恢复按钮，来源 `frontend/src/app.tsx:1541-1545`，对应 `AC-TASK-005-04` 的只读边界。

## 3.6 PRD-TASK-006 取消、重试、预算与恢复

1. B-006-01 取消的 `scope` 缺省为 `self`，只接受 `self` 与 `chain`，其他值返回 400“scope 只能是 self 或 chain”，来源 `conv.go:1208-1225`，对应 `AC-TASK-006-01`。
2. B-006-02 取消 `running` 任务时，任务在 5 秒内变为 `cancelled`，`running` 步骤回到 `pending` 并写 `finishedAt`，同时发更新与汇报事件，来源 `conv.go:1398-1432`、`service.go:361-383`，对应 `AC-TASK-006-01`。
3. B-006-03 对已处于终态的任务再次取消返回 200、`changed=false`、`updatedAt` 不变，来源 `conv.go:1220-1235`，对应 `AC-TASK-006-02`。
4. B-006-04 `chain` 取消先广度优先收集下游，只中断 `running` 的下游，`pending` 下游保持未开始，`done` 下游保留，来源 `conv.go:1298-1328`，对应 `AC-CONV-009-15`、`AC-CHG-CONV-007-03`。
5. B-006-05 整条链共享一个 5 秒截止时间，超时后停止等待并继续返回结果，来源 `conv.go:1239`、`conv.go:1277-1295`，对应 `AC-TASK-006-01`。
6. B-006-06 取消后执行器被停掉，任务不再写新消息或新产物，但任务行更新与事件仍会发出，来源 `conv.go:1358-1432`、`service.go:361-383`，对应 `AC-TASK-006-03`。
7. B-006-07 新重试接口只允许 `failed`、`cancelled`、`interrupted`，其他状态返回 409，来源 `conv.go:1468-1489`，对应 `AC-TASK-006-04`、`AC-CHG-CONV-007-02`。
8. B-006-08 重试把 `attempt` 加 1、状态置 `queued`、进度置 0、清空 `summary`、`outcome`、`failReason` 与等待字段，所有步骤回到 `pending`，任务 id 不变，来源 `conv.go:1492-1536`，对应 `AC-TASK-006-04`。
9. B-006-09 重试不清空已有产物，`artifacts` 原样保留，来源 `conv.go:1492-1536`，对应 `AC-TASK-006-05`。
10. B-006-10 重试时把下游中 `failed`、`cancelled`、`interrupted` 的任务一并重新排队，`done` 的下游不动，来源 `conv.go:1539-1565`，对应 `AC-TASK-006-04` 的级联路径。
11. B-006-11 旧的 `POST /api/tasks/{id}/retry` 没有状态守卫，任何状态都会 `attempt` 加 1 并重新启动，与新接口的 409 行为冲突，来源 `service.go:386-415`，对应 `AC-TASK-006-04`，是缺口。
12. B-006-12 预算耗尽时执行器把任务停在 `running`、`waitingReason=resource`、`outcome=budget_exceeded`，不置 `blocked`，来源 `real_executor.go:102-119`，对应 `AC-TASK-006-06`，与验收要求不符。
13. B-006-13 恢复只接受 `waitingReason=resource` 的任务，`reason` 最长 200 字，其他情况返回 409，来源 `conv.go:1672-1700`，对应 `AC-TASK-006-06`。
14. B-006-14 恢复保留已有 `running` 步骤，没有时把第一个 `pending` 或 `failed` 步骤置 `running`，`trigger_count` 加 1，进度与已完成步骤保留，来源 `conv.go:1700-1728`，对应 `AC-CONV-009-35`。
15. B-006-15 恢复时如果没有活跃执行器才重新启动，已有执行器则只改状态，来源 `conv.go:1720-1728`，对应 `AC-TASK-006-06` 的边界。
16. B-006-16 重启恢复扫描 `running` 与 `queued` 任务；`queued` 原样保留、不重排也不启动，`running` 有检查点且副作用已知时回 `queued`，副作用未知时回 `blocked`，其余置 `interrupted`，来源 `service.go:118-244`，对应 `AC-TASK-006-07`。
17. B-006-17 预算上限在真实执行器里硬编码为 8 步、12000 token，没有从任务的预算字段读取，来源 `real_executor.go:25-60`，对应 `AC-TASK-006-06`，是缺口。

## 3.7 PRD-CONV-009 任务卡消息与右栏任务投影

1. B-009-01 任务只能从对话意图或会话级创建接口进入，界面上没有独立“新建任务”按钮，创建成功后对话流出现任务卡，来源 `loop.go:549-605`、`conv_http.go:15-25`，对应 `AC-CONV-009-01`、`AC-CHG-CONV-007-01`。
2. B-009-02 单任务卡显示状态、模式、产出数、尝试数、等待文案与失败原因，“查看任务”是唯一打开详情的入口，来源 `frontend/src/components/tasks.tsx:253-304`，对应 `AC-CONV-009-01`。
3. B-009-03 同一批次多任务折叠为一张汇总卡，头部“已创建 N 个任务”，默认展开 10 条、展开后 100 条，超出显示“还有 N 个”，来源 `tasks.tsx:312-378`，对应 `AC-CONV-009-02`、`AC-CHG-CONV-007-07`。
4. B-009-04 右栏固定三标签“概览”“任务”“交付物”，展开宽 320 像素，收起为 40 像素竖条，来源 `frontend/src/components/library.tsx:1156-1161`、`frontend/src/components/components.css:203`、`components.css:1157`，对应 `AC-CONV-009-08`。
5. B-009-05 任务标签角标只统计 `running` 数量，1 至 9 原样显示，10 及以上显示“9+”，0 不渲染节点，来源 `library.tsx:1474`、`frontend/src/taskEvents.ts:138-147`，对应 `AC-CONV-009-09`。
6. B-009-06 任务标签在 `counts.all=0` 时禁用，点击不切换标签，来源 `library.tsx:1415-1417`、`library.tsx:1469-1471`，对应 `AC-CONV-009-09` 的边界。
7. B-009-07 任务列表有四片筛选“全部”“进行中”“失败”“已完成”，每片显示计数，选中片 `aria-pressed=true`，切筛选回到列表顶部，来源 `tasks.tsx:87-98`、`tasks.tsx:145-169`，对应 `AC-CONV-009-12`。
8. B-009-08 列表按 `updated_at` 倒序分页，每页 50 条，“加载更多”用 `before` 游标续页，来源 `conv.go:947-998`、`frontend/src/app.tsx:612-631`，对应 `AC-CONV-009-01`。
9. B-009-09 详情是只读层，内部没有重试、取消、编辑、删除入口，只有关闭按钮，来源 `tasks.tsx:474-696`，对应 `AC-CONV-009-07`、`AC-CHG-CONV-007-06`。
10. B-009-10 详情按模式分两种内容形态：`plan` 显示步骤列表与当前步，`explore` 显示扁平轨迹时间线，来源 `tasks.tsx:625-692`，对应 `AC-CONV-009-05`、`AC-CONV-009-06`。
11. B-009-11 详情步骤当前步默认展开，失败步优先展开，已完成步可回看，未开始步没有展开区，来源 `tasks.tsx:442-450`，对应 `AC-CONV-009-05`。
12. B-009-12 详情展示启动上下文“目标”“约束”“输入”与“历史消息 0 条”，并展示预算“已用 x/y tokens · a/b 步”，来源 `tasks.tsx:672-679`、`conv.go:1131-1166`，对应 `AC-CONV-009-03`、`AC-CHG-CONV-007-08`。
13. B-009-13 详情轨迹首屏 200 条，每次再加载 200 条，上限 500 条，按时间与序号升序，来源 `tasks.tsx:558-596`，对应 `AC-CONV-009-06`。
14. B-009-14 详情与任务图打开期间前端不发写请求，关闭详情只清空本地状态，来源 `app.tsx:701-711`、`app.tsx:713-718`，对应 `AC-CONV-009-07`、`AC-CHG-CONV-007-06`。
15. B-009-15 任务卡在等待确认时内联“确认”“取消”，等待资源时内联“恢复”，只读或请求进行中时隐藏或禁用，来源 `tasks.tsx:253-304`，对应 `AC-CONV-009-14`。
16. B-009-16 确认只接受等待原因为 `confirmation` 的任务；确认后清空等待、当前步置 `running` 并在没有执行器时重启；取消后当前步置 `failed`、任务置 `failed`、`outcome=cancelled_by_user`，来源 `conv.go:1574-1669`，对应 `AC-CONV-009-14`。
17. B-009-17 三种等待分别是“等待前置”“等待确认”“等待资源”；前置失败或取消时下游保持未开始，不自动重试，来源 `tasks.tsx:8`、`conv.go:2132-2163`，对应 `AC-CONV-009-14`。
18. B-009-18 依赖汇合方式为 `all`、`any`、`each`、`first`，缺省 `all`；`all` 要求全部前置 `done`，`any` 与 `first` 只要一个前置 `done`，`each` 每次前置完成数超过触发计数时重跑，来源 `conv.go:2110-2189`，对应 `AC-CONV-009-14`。
19. B-009-19 交付物按任务分组，显示类型徽标、文件名、来源任务、时间、大小与打开按钮，下载地址为 `/api/artifacts/{id}/content?download=1`，来源 `tasks.tsx:380-440`、`conv.go:1911-2000`，对应 `AC-CONV-009-16`。
20. B-009-20 任务图是全窗只读弹窗，带四态图例与失败下游虚线；20 个节点以内固定 4 列，超过 20 个按依赖层分行、每层每 4 个换行，来源 `tasks.tsx:787-909`，对应 `AC-CONV-009-13`。
21. B-009-21 顶栏“任务图”入口只在 `counts.all>0` 时渲染，打开前先关详情，点击图节点先关图再打开该任务详情，来源 `app.tsx:1508-1510`、`app.tsx:733-738`、`tasks.tsx:888-900`，对应 `AC-CONV-009-11`、`AC-CONV-009-13`。
22. B-009-22 概览固定四块“目标”“输入”“任务”“交付物”，块头可折叠并按会话记忆；任务块只列前 2 条，超出“还有 N 个”跳到任务标签，来源 `library.tsx:1196-1300`，对应 `AC-CONV-009-10`、`AC-CONV-009-11`。
23. B-009-23 宽于 1024 像素时右栏展开 320 像素，760 至 1023 像素只留 40 像素竖条、280 像素面板以抽屉覆盖，窄于 760 像素右栏整体不渲染，来源 `components.css:378-418`，对应 `AC-CHG-CONV-007-05`。
24. B-009-24 切换会话时清空任务列表、计数、详情、任务图与批次展开状态，草稿会话不请求投影与交付物，来源 `app.tsx:898-921`，对应 `AC-CONV-009-17`。
25. B-009-25 会话归档后任务卡只读，详情仍可打开但没有任何写入口，来源 `app.tsx:1541-1545`，对应 `AC-CONV-009-17` 的只读边界。
26. B-009-26 任务列表只请求当前会话，前端不发跨会话查询，顶栏“仅本会话”保持激活，来源 `app.tsx:612-631`、`app.tsx:1521`，对应 `AC-CONV-009-17`、`AC-CHG-CONV-007-04`。
27. B-009-27 任务继承会话权限与工具范围，越权工具调用由后端返回 403，执行器只记一条 `observe` 轨迹，不因此终止整个任务，来源 `real_executor.go:98-101`，对应 `AC-CONV-009-04`。
28. B-009-28 系统不会自动取消或自动判失败；用户设置的时限到达时，提醒扫描每 30 秒检查一次，每个任务最多发一条 `task.reminder`，来源 `conv.go:2004-2058`，对应 `AC-CONV-009-18`。

speckit 新增的 29 条 AC 与本节行为的对应关系如下，便于逐条核对。`AC-CONV-009-19` 与 `AC-CONV-009-20` 对应列表与进度，见 B-009-08 与 B-002-01；`AC-CONV-009-21` 与 `AC-CONV-009-22` 对应单任务卡与创建，见 B-009-02 与 B-003-02；`AC-CONV-009-23` 与 `AC-CONV-009-24` 对应汇总卡，见 B-009-03；`AC-CONV-009-25` 与 `AC-CONV-009-26` 对应只读详情与轨迹，见 B-009-09 与 B-009-13；`AC-CONV-009-27`、`AC-CONV-009-28`、`AC-CONV-009-29` 对应失败与重试，见 B-006-07 至 B-006-12；`AC-CONV-009-30`、`AC-CONV-009-31`、`AC-CONV-009-32` 对应子会话归属，见 B-005-01 至 B-005-07；`AC-CONV-009-33` 与 `AC-CONV-009-34` 对应取消幂等，见 B-006-02 与 B-006-03；`AC-CONV-009-35` 与 `AC-CONV-009-36` 对应预算等待与恢复，见 B-006-12 至 B-006-14；`AC-CONV-009-37`、`AC-CONV-009-38`、`AC-CONV-009-39`、`AC-CONV-009-40` 对应开始与结束消息，见 B-003-03 至 B-003-06；`AC-CONV-009-41`、`AC-CONV-009-42`、`AC-CONV-009-43`、`AC-CONV-009-44` 对应复杂度门禁，见第 3.4 节，当前未实现；`AC-CONV-009-45` 与 `AC-CONV-009-46` 对应空态、加载与错误态，见第 5 节；`AC-CONV-009-47` 对应重启恢复，见 B-006-16。19 至 47 都是 speckit 新增条目，本文只按现有行为或缺口状态标注，不把待建条目写成已实现。

## 4 跨功能点的共同逻辑

## 4.1 状态模型与状态迁移

存储态有 8 个：`pending`、`blocked`、`queued`、`running`、`done`、`failed`、`cancelled`、`interrupted`；展示态只有 4 个：`pending`、`running`、`failed`、`done`，其中 `failed`、`cancelled`、`interrupted` 合并为展示 `failed`，`pending`、`blocked`、`queued` 合并为展示 `pending`（`conv.go:100-119`）。合法迁移共 11 条，`running` 只在修改等待原因时允许自迁移，终态为 `done`、`failed`、`cancelled`、`interrupted`，终态只能通过重试回到 `queued`（`conv.go:121-151`）。非法迁移统一返回 409 并带当前状态（`conv.go:1172-1203`）。这套模型约束 `PRD-TASK-001`、`PRD-TASK-002`、`PRD-TASK-006` 与 `PRD-CONV-009` 的列表、筛选、计数、详情和取消重试。

## 4.2 三种执行模式

任务模式只接受 `plan`、`react`、`explore`，缺省 `plan`，其他值返回 400（`conv.go:397-407`）。`plan` 按给定步骤或默认步骤建步骤行，`react` 与 `explore` 也建默认步骤，但前端只给 `plan` 与 `explore` 两套文案，`react` 会回退显示为“计划”（`frontend/src/components/tasks.tsx:9`、`tasks.tsx:28-30`）。执行器不区分模式，真实执行统一按 8 步上限运行（`real_executor.go:25-60`）。这套规则约束 `PRD-TASK-001`、`PRD-TASK-003`、`PRD-CONV-009`。

## 4.3 三种等待

等待原因只有三个值：`dependency`、`confirmation`、`resource`（`conv.go:21-37`）。等待依赖在创建后检测到前置未完成时进入，任务显示“等待前置”，前置失败或取消时下游保持未开始且不自动重试（`conv.go:2132-2163`）。等待确认由执行器返回暂停时进入，当前步保持 `running`，任务卡给确认与取消，确认放行审批且不计 `trigger_count`，取消把任务置 `failed`（`conv.go:1574-1669`）。等待资源由预算耗尽或执行器暂停进入，任务保留已完成步骤与产出，卡片给恢复入口，恢复从暂停步继续（`conv.go:1672-1728`）。三种等待都没有系统自动超时，时限只触发提醒（`conv.go:2004-2058`）。这套规则约束 `PRD-TASK-006` 与 `PRD-CONV-009`。

## 4.4 取消与重试

取消分 `self` 与 `chain` 两种范围，`chain` 只中断正在运行的下游，未开始的下游保持原状，已完成的保留（`conv.go:1298-1328`）。取消对终态是幂等的，返回 200 且不改 `updatedAt`（`conv.go:1220-1235`）。重试只接受三个失败类终态，重排时保留 id 与产物、重置步骤与进度（`conv.go:1468-1536`）。旧接口 `service.go` 的重试没有状态守卫，与新接口行为不一致（`service.go:386-415`）。这套规则约束 `PRD-TASK-001`、`PRD-TASK-006`。

## 4.5 预算与时限

详情的预算缺省为 8 步、12000 token，读取时把历史的 `stepsUsed`、`tokensUsed` 归一为 `usedSteps`、`usedTokens`（`conv.go:1144-1167`）。真实执行器不读任务预算，直接以 8 步、12000 token 发起执行（`real_executor.go:25-60`）。预算耗尽时任务停在 `running` 加资源等待，`outcome=budget_exceeded`（`real_executor.go:102-119`）。用户时限写入 `deadline_at`，提醒扫描每 30 秒运行，满足条件时只发一条 `task.reminder`，不会自动失败或取消（`conv.go:2004-2058`）。这套规则约束 `PRD-TASK-002`、`PRD-TASK-006` 与 `PRD-CONV-009`。

## 4.6 上下文注入边界

任务的启动上下文只有目标、输入、约束三项，`historyCount` 固定为 0，不注入对话历史（`conv.go:1131-1136`、`tasks.tsx:672-679`）。输入与约束各最多 20 条、单条 500 字、总量 20000 字，超出返回 413（`conv.go:409-430`）。批次级输入与约束在任务级为空时下传（`conv.go:441-579`）。前端概览的输入块展示约束与输入，为空时显示“暂无输入约束”（`library.tsx:1261`）。这套规则约束 `PRD-TASK-001`、`PRD-CONV-009`。

## 4.7 权限与审批

任务继承发起会话的权限与工具范围，越权工具调用返回 403 并记一条 `observe` 轨迹，任务继续执行（`real_executor.go:98-101`）。确认放行时先调用会话审批释放接口，释放失败返回 500 并保持等待（`conv.go:1629-1669`）。取消、重试、确认、恢复四个写操作都先做会话归属校验（`conv_http.go:169-243`）。这套规则约束 `PRD-TASK-004`、`PRD-TASK-005`、`PRD-TASK-006` 与 `PRD-CONV-009`。

## 4.8 归属与隔离

任务只按 `session_id` 归属，列表、计数、投影、任务图、交付物都带会话条件（`conv.go:875-932`、`conv.go:1768-1890`）。新接口在详情与四个写操作上校验会话，不一致返回 404（`conv_http.go:169-243`）。旧 `GET /api/tasks/{id}` 不校验会话，是隔离缺口（`http.go:211-233`）。会话树有 `parent_id`，但任务没有 `childSessionIds`，父层不统计子任务（`backend/internal/modules/sessions/migrations.go:34-42`、`conv.go:875-932`）。这套规则约束 `PRD-TASK-001`、`PRD-TASK-005`。

## 4.9 消息与卡片

创建任务时写一条 `category=task`、`role=agent` 的消息，单任务卡承担入口，多任务折叠为汇总卡（`conv.go:584-751`、`tasks.tsx:253-378`）。任务消息必带 `taskId`，批次消息带 `batchId` 与任务数（`tasks.tsx:563-595`）。开始消息与单任务结束消息未实现，workflow 任务的汇报消息由 `workflow_reports.go` 写入（`real_executor.go:62-122`、`workflow.go:447-450`、`workflow_reports.go:14-70`）。卡片上的确认、取消、恢复是写入口，详情本身只读（`tasks.tsx:253-304`、`tasks.tsx:474-696`）。这套规则约束 `PRD-TASK-003` 与 `PRD-CONV-009`。

## 4.10 交付物

任务交付物只取 `delivery_kind='user_delivery'` 的记录，按扩展名或 MIME 分成表格、图片、文档三类徽标，下载地址统一走产物内容接口（`conv.go:1911-2000`、`conv.go:1058-1075`）。交付物页按任务分组，没有产物的任务也建空组并显示失败说明，缺省 50 条、上限 100 条（`conv.go:1933-2000`、`tasks.tsx:380-440`）。产物落盘与存储归 `P4-FILE`，任务域只负责引用与展示（`specs/product/P1-CONV/spec.md:320`）。这套规则约束 `PRD-TASK-001`、`PRD-TASK-006` 与 `PRD-CONV-009`。

## 4.11 事件与实时更新

事件类型只有 `task.created`、`task.updated`、`task.report`、`task.step`、`task.trace`、`task.reminder` 六类（`backend/internal/core/eventlog/eventlog.go:36-41`）。WebSocket 订阅白名单包含任务事件，前端收到后按类型合并任务、追加轨迹或重取列表，并按 300 毫秒节流对账计数（`backend/internal/modules/chat/http.go:486`、`app.tsx:813-841`）。没有 `task.progress` 事件，也没有 5 秒轮询，进度依赖 `task.updated` 与事件合并（`app.tsx:813-841`）。这套规则约束 `PRD-TASK-002` 与 `PRD-CONV-009`。

## 4.12 任务图

任务图按会话取任务，边来自依赖表，前置失败或取消时边为虚线，分层用最长路径算法，有环返回 400（`conv.go:1768-1890`）。节点带状态、展示态、等待原因、进度、失败原因与层号，前端 20 个节点以内固定 4 列，超过 20 个按层分行、每层每 4 个换行（`tasks.tsx:787-813`）。任务图只读，节点点击打开详情（`tasks.tsx:815-909`）。这套规则约束 `PRD-TASK-004` 与 `PRD-CONV-009`。

## 4.13 复杂度分级

设计上有 C0 至 C4 五级：C0 即时回答不建任务，C1 只 fork 临时 Worker，C2 在当前会话建 1 个任务，C3 在父级建 1 个子会话，C4 建 3 至 4 个子会话，父级在 C3、C4 下都不建任务（`docs/task-complexity.md:11-17`）。确认前不得产生副作用，C2 及以上先给方案等确认（`docs/task-complexity.md:90`）。代码没有分级字段、分级函数、`TaskPlan` 表与确认门禁，这一节只约束设计，不约束现有实现（`backend/internal/core/task/task.go:102-144`）。这套设计约束 `PRD-TASK-004` 与 `PRD-TASK-005`。

## 5 界面逻辑

入口在对话流，不在任务面板。用户用自然语言提出任务，后端意图分类命中后创建任务并写一张任务卡；界面没有“新建任务”按钮（`loop.go:549-605`）。顶栏“任务图”按钮只在当前会话有任务时出现，右栏三个标签是“概览”“任务”“交付物”（`app.tsx:1508-1510`、`library.tsx:1156-1161`）。这套入口对应 `AC-CONV-009-01`、`AC-CHG-CONV-007-01`。

右栏展开宽 320 像素，收起为 40 像素竖条，760 至 1023 像素改为 40 像素竖条加 280 像素抽屉，窄于 760 像素整体不渲染（`components.css:203`、`components.css:378-418`、`components.css:1157`）。任务标签角标只显示 `running` 数，10 及以上显示“9+”，0 不渲染；`counts.all=0` 时标签禁用（`library.tsx:1474`、`taskEvents.ts:138-147`、`library.tsx:1415-1417`）。这套布局对应 `AC-CONV-009-08`、`AC-CONV-009-09`、`AC-CHG-CONV-007-05`。

任务列表有四片筛选“全部”“进行中”“失败”“已完成”，每片带计数，切筛选回顶；筛选把展示态 `failed` 展开为 `failed`、`cancelled`、`interrupted`，因此“失败”片包含被取消与中断的任务（`tasks.tsx:87-98`、`conv.go:875-932`）。列表空态区分“本会话还没有任务”与“没有符合条件的任务”（`tasks.tsx:179-181`）。这套筛选对应 `AC-CONV-009-12`、`AC-TASK-001-04`。

详情有两种承载形态与两种内容形态。承载形态在宽屏是覆盖层，在 760 至 1023 像素是抽屉；内容形态在 `plan` 下是步骤列表，在 `explore` 下是扁平轨迹时间线（`library.tsx:1443`、`tasks.tsx:625-692`）。详情头部标“只读”，只有关闭按钮，没有重试、取消、编辑、删除入口（`tasks.tsx:610-613`、`tasks.tsx:474-696`）。只读边界对应 `AC-CONV-009-07` 与 `AC-CHG-CONV-007-06`；详情打开期间不发写请求（`app.tsx:701-711`）。

跳转有四个落点。点任务卡“查看任务”打开详情并带 `jumpStepId`，详情把目标步对齐滚动口顶部 0 至 8 像素并高亮 1.2 秒（`tasks.tsx:535-556`）。点概览任务行不打开详情，而是在消息流按 `data-task-id`、`messageId`、标题依次定位并高亮（`app.tsx:1298-1316`）。点“还有 N 个”切到任务标签并把列表滚到顶部（`library.tsx:1276`、`app.tsx:783-796`）。点任务图节点先关图再开该任务详情（`tasks.tsx:888-900`）。这些落点对应 `AC-CONV-009-11`。

空态与错误态分四处。任务列表空态有两种文案，加载中三张骨架，失败显示“任务加载失败”与重试（`tasks.tsx:170-181`）。详情加载中、失败、无数据分别是“任务详情加载中…”“任务详情加载失败”与“暂无任务详情”（`tasks.tsx:616-624`）。任务图空态是“本会话还没有任务”，失败有重试（`tasks.tsx:851-858`）。交付物空态是“本会话还没有交付物”，失败显示“交付物加载失败”（`tasks.tsx:380-440`）。这些状态对应 `AC-CONV-009-45`、`AC-CONV-009-46`。

窄屏行为只有三档。1024 像素以上右栏常驻 320 像素；760 至 1023 像素收起为 40 像素竖条，点图标后用 280 像素抽屉覆盖中栏，抽屉底部停在输入框上方；760 像素以下右栏整块隐藏，任务入口随之消失（`components.css:378-418`）。三档都不产生横向溢出，对应 `AC-CHG-CONV-007-05`。

## 6 口径冲突与未决

C-01 复杂度模型有两套。`AC-TASK-004-02` 要求 C3 存在任务且保持 `blocked` 或 `pending`，`docs/task-complexity.md:11-17` 则说 C3 父级不建任务、确认后在子会话里建，`specs/speckit/task-domain/spec.md:41-44` 的确认门禁又要求 C2 及以上在确认前不建任务。影响是同一场景无法同时满足两份判据，按 `AC-TASK-004-02` 实现会违背复杂度设计，按设计实现会让该 AC 永远失败。建议裁决为以 `docs/task-complexity.md` 为准，改写 `AC-TASK-004-02`，把“任务等待确认”限定在 C2，C3 与 C4 断言子会话与父级 0 任务。

C-02 预算耗尽的终态不一致。`AC-TASK-006-06` 要求预算触顶时任务为 `blocked`、`outcome=budget_exceeded`；`real_executor.go:102-119` 实际停在 `running` 加 `waitingReason=resource`，`AC-CONV-009-14` 也把预算归入资源等待。影响是“恢复”入口与状态文案都能用，但状态断言必失败。建议裁决为统一采用 `running` 加资源等待，`blocked` 只留给“副作用未知需人工确认”，同时修改 `AC-TASK-006-06` 与 `PRD-TASK-006` 的状态描述。

C-03 覆盖表对 001、002、006 的描述过期。`specs/changes/CHG-CONV-007/spec.md:280-292` 写这三个功能点“缺前端入口”，而代码已有任务列表、详情、筛选、任务卡、取消、重试与恢复入口（`frontend/src/components/tasks.tsx`、`frontend/src/app.tsx`）。影响是变更包看起来把前端入口留给了后续批次，实际入口已交付，追溯时会把已完成项误判为缺口。建议裁决为更新覆盖表理由为“部分实现，缺开始结束消息、预算 blocked、子会话归属”，并保留 partial 状态。

C-04 旧详情接口不校验会话。`AC-TASK-001-06` 与 `AC-TASK-005-03` 要求跨会话 404，新接口满足（`conv_http.go:194-210`），旧 `GET /api/tasks/{id}` 只按 id 查询（`http.go:211-233`）。影响是调用旧接口可以读到别的会话的任务标题与状态，隔离在旧路径上失效。建议裁决为下线旧路由或让它强制要求 `sessionId`，并在 `docs/product/TRACEABILITY.md` 记录旧路径为待移除。

C-05 `childSessionIds` 与父入口不存在。`specs/speckit/task-domain/spec.md` 的 Key Entities 要求 `TaskPlan.childSessionIds`，`AC-TASK-005-02` 要求父会话给“含 1 个子会话”入口；代码没有 `TaskPlan` 表、没有 `childSessionIds` 字段，前端“含子会话”按钮禁用并提示“当前版本仅加载当前会话”（`docs/task-complexity.md:21-36`、`app.tsx:1521`）。影响是父层无法展示子会话任务，也无法完成 C3、C4 的归属验收。建议裁决为先在任务域补 `childSessionIds` 与统计接口，再做入口，`AC-TASK-005-02` 随实现一起验收。

C-06 “无独立 HTTP 创建入口”的描述过期。`specs/product/P2-TASK/spec.md:211` 的 D-06 说任务只在对话流程里创建、没有独立 HTTP 入口，代码已有 `POST /api/sessions/{id}/tasks`（`conv_http.go:15-25`）。影响是外部调用方可以绕过对话意图直接建任务，与“任务由对话发起”的产品叙述不一致，也让 `AC-TASK-003-01` 的“无独立入口”表述含糊。建议裁决为承认会话级创建接口是正式契约，把 D-06 改成“没有全局 `POST /api/tasks`，创建必须带会话”，并补权限校验说明。

C-07 八个存储态与前端四套文案不一致。`FR-002` 要求 8 个状态各有中文文案且不混用，前端 `STATUS_LABEL` 只有 4 个值，未知值原样回退，`MODE_LABEL` 也没有 `react`，会显示成“计划”（`tasks.tsx:7`、`tasks.tsx:9`、`tasks.tsx:28-30`）。影响是 `blocked`、`queued`、`cancelled`、`interrupted` 在卡片上分别显示为“未开始”“未开始”“失败”“失败”，用户无法区分等待原因与取消、中断。建议裁决为补全 8 个状态文案与 `react` 文案，或明确产品只用 4 个展示态并删除 `FR-002` 的 8 文案要求。

C-08 `queued` 的计数口径冲突。`FR-003` 要求 `queued` 不并入“未开始”，四片筛选按存储态计数；`conv.go:823-840` 把 `blocked` 与 `queued` 都计入 `pending`，`spec_projection.go:343-352` 也把它们并入 `pending`。影响是“未开始”片与计数包含排队中与阻塞中的任务，用户看到的数字大于真正未开始的任务数。建议裁决为计数增加 `queued`、`blocked` 两个键，筛选片仍保持四片，但每片标注包含哪些存储态。

C-09 开始消息的类别冲突。`AC-TASK-003-02` 与 Q-01 裁定开始消息为 `category=progress`，`CHG-CONV-007` 又用 `category=task` 的任务卡取代 B1-01 的开始消息，历史 `progress` 消息不迁移（`specs/changes/CHG-CONV-007/spec.md:66-78`、`specs/product/P2-TASK/spec.md:215`）。影响是同一“任务开始”语义存在两种消息类别，按旧判据验收会要求一条并不存在的 `progress` 消息。建议裁决为以 `category=task` 为唯一任务消息类别，废除 `AC-TASK-003-02` 的 `progress` 断言，改为断言任务卡的 `taskId` 与 `reportMessageId`。

C-10 汇总卡展开上限冲突。`FR-007` 与 `AC-CONV-009-02` 要求默认 10 条、展开上限 50 条；前端默认 10 条、展开上限 100 条，后端单批上限 12 条（`tasks.tsx:312-378`、`conv.go:441-579`）。影响是“展开上限 50”永远触发不到，因为单批最多 12 条，而前端上限 100 也没有实际意义。建议裁决为把单批上限与汇总卡上限统一到 12 条，或把单批上限放宽到 50 条并保留展开 50。

C-11 重启后 `queued` 是否重排冲突。`AC-TASK-006-07` 与 `FR-016` 要求重启后 `queued` 重新排队并继续执行，`service.go:118-184` 对 `queued` 直接跳过，既不重排也不启动。影响是重启前排队中的任务会永远停在 `queued`，直到用户手动重试或新建任务。建议裁决为在恢复扫描里对 `queued` 重新入队并启动，或明确产品接受“重启后排队任务不自动继续”，同时修改 AC。

C-12 进度刷新机制冲突。Q-04 裁定进度走 `task.progress` 事件加 5 秒兜底轮询（`specs/product/P2-TASK/spec.md:218`），代码没有 `task.progress` 事件，只有 `task.updated`，前端也没有 5 秒定时轮询，只有事件驱动的 300 毫秒节流（`eventlog.go:36-41`、`app.tsx:813-841`）。影响是按 Q-04 验收会找不到 `task.progress`，断网或事件丢失时也没有兜底刷新。建议裁决为保留 `task.updated` 作为唯一进度事件，补一个低频兜底刷新，并把 Q-04 改成“事件优先、低频兜底”。

## 7 缺口清单

缺实现，共 11 条。

- 复杂度分级与落库：`PRD-TASK-004` 没有 `complexity` 字段、分级函数与 C0 至 C4 判定。
- 确认门禁与 `TaskPlan`：`PRD-TASK-004` 没有 `pending`、`confirmed`、`rejected`、`expired` 四种方案状态与确认接口。
- C3 与 C4 的子会话派生：`PRD-TASK-004` 没有按复杂度创建 1 个或 3 至 4 个子会话的路径。
- `childSessionIds` 与父层统计：`PRD-TASK-005` 没有字段、计数与“含 N 个子会话”数据。
- 开始消息与 `reportMessageId`：`PRD-TASK-003` 没有 `category=progress` 的开始消息写入点。
- 单任务结束消息：`PRD-TASK-003` 只在 workflow 终态写汇报，单任务不写。
- 预算 `blocked` 状态：`PRD-TASK-006` 实际停在 `running` 加资源等待。
- 重启 `queued` 重排：`PRD-TASK-006` 恢复扫描跳过 `queued`，不重新入队。
- `task.progress` 事件：`PRD-TASK-002` 只有 `task.updated`，没有独立进度事件。
- 旧详情路由的会话校验：`PRD-TASK-001` 的 `GET /api/tasks/{id}` 不校验 `sessionId`。
- 旧重试路由的状态守卫：`PRD-TASK-006` 的旧接口对 `running` 也重试。

缺入口，共 6 条。

- 复杂度确认卡片与确认、拒绝按钮：`PRD-TASK-004` 没有可操作的方案确认界面。
- 30 分钟确认提示与 12 小时概览标记：`PRD-TASK-004` 没有前端提示与标记。
- 父会话“含 N 个子会话”入口：`PRD-TASK-005` 的顶栏按钮禁用，右栏没有入口。
- 开始消息与结束消息的时间线渲染：`PRD-TASK-003` 没有对应消息可渲染。
- 概览 3 行任务组：`PRD-TASK-001` 与 `PRD-TASK-002` 的概览只显示 2 行。
- 资源等待在详情里的恢复入口：`PRD-TASK-006` 只有任务卡内联恢复，详情保持只读。

缺脚本，共 5 条。

- `AC-TASK-001-*` 至 `AC-TASK-006-*` 的 30 条验收没有自动化脚本。
- `AC-CONV-009-19` 至 `AC-CONV-009-47` 的 29 条验收没有自动化脚本。
- 复杂度分级与 `complexity_classified`、`task_confirmed` 事件断言没有脚本。
- 重启后 `running`、`queued`、`blocked` 三种恢复路径没有进程级脚本。
- 父会话与子会话的任务隔离、归档不级联没有端到端脚本。

缺证据，共 7 条。

- 投影 ETag 命中 304 与 5 秒内进度可见没有实测记录，`PRD-TASK-002` 的 D-02 仍开放。
- `running` 任务重试返回 409 只在新接口成立，旧接口行为没有实测记录，`PRD-TASK-006` 的 D-05 无法关闭。
- 归档父会话后子任务仍可读没有实测记录，`PRD-TASK-005` 的 `AC-005-04` 缺证据。
- C3 与 C4 父级 0 任务没有实测记录，因为实现不存在。
- 1280、768、375 三档右栏截图没有归档，`AC-CHG-CONV-007-05` 缺可视证据。
- 21 个节点以上的任务图排布截图没有归档，`AC-CONV-009-13` 缺可视证据。
- 变更级 26 条 AC 的签字只覆盖 `CHG-CONV-007`，没有覆盖 `PRD-TASK` 六个功能点的独立验收记录。

## 8 核对表

下表是本文的自检结果。`PRD-TASK-*` 6 条全部出现，`AC-TASK-*` 30 条全部出现，`AC-CONV-009-01..47` 47 条全部出现，`AC-CHG-CONV-007-*` 8 条全部出现，没有写 0 的类别。

| 类别 | 应有条数 | 出现条数 | 缺失 | 出现位置 |
|---|---|---|---|---|
| `PRD-TASK-*` | 6 | 6 | 0 | 第 2 节总表与第 3 节各小节 |
| `AC-TASK-*` | 30 | 30 | 0 | 第 3 节各行为末尾 |
| `AC-CONV-009-01..47` | 47 | 47 | 0 | 第 3.7 节与下方枚举 |
| `AC-CHG-CONV-007-*` | 8 | 8 | 0 | 第 3.3、3.5、3.6、3.7 节与第 5 节 |

`PRD-TASK-*` 枚举：`PRD-TASK-001`、`PRD-TASK-002`、`PRD-TASK-003`、`PRD-TASK-004`、`PRD-TASK-005`、`PRD-TASK-006`。

`AC-TASK-*` 枚举：`AC-TASK-001-01`、`AC-TASK-001-02`、`AC-TASK-001-03`、`AC-TASK-001-04`、`AC-TASK-001-05`、`AC-TASK-001-06`、`AC-TASK-002-01`、`AC-TASK-002-02`、`AC-TASK-002-03`、`AC-TASK-002-04`、`AC-TASK-003-01`、`AC-TASK-003-02`、`AC-TASK-003-03`、`AC-TASK-003-04`、`AC-TASK-003-05`、`AC-TASK-003-06`、`AC-TASK-004-01`、`AC-TASK-004-02`、`AC-TASK-004-03`、`AC-TASK-004-04`、`AC-TASK-005-01`、`AC-TASK-005-02`、`AC-TASK-005-03`、`AC-TASK-005-04`、`AC-TASK-006-01`、`AC-TASK-006-02`、`AC-TASK-006-03`、`AC-TASK-006-04`、`AC-TASK-006-05`、`AC-TASK-006-06`、`AC-TASK-006-07`。

`AC-CONV-009-*` 枚举：`AC-CONV-009-01`、`AC-CONV-009-02`、`AC-CONV-009-03`、`AC-CONV-009-04`、`AC-CONV-009-05`、`AC-CONV-009-06`、`AC-CONV-009-07`、`AC-CONV-009-08`、`AC-CONV-009-09`、`AC-CONV-009-10`、`AC-CONV-009-11`、`AC-CONV-009-12`、`AC-CONV-009-13`、`AC-CONV-009-14`、`AC-CONV-009-15`、`AC-CONV-009-16`、`AC-CONV-009-17`、`AC-CONV-009-18`、`AC-CONV-009-19`、`AC-CONV-009-20`、`AC-CONV-009-21`、`AC-CONV-009-22`、`AC-CONV-009-23`、`AC-CONV-009-24`、`AC-CONV-009-25`、`AC-CONV-009-26`、`AC-CONV-009-27`、`AC-CONV-009-28`、`AC-CONV-009-29`、`AC-CONV-009-30`、`AC-CONV-009-31`、`AC-CONV-009-32`、`AC-CONV-009-33`、`AC-CONV-009-34`、`AC-CONV-009-35`、`AC-CONV-009-36`、`AC-CONV-009-37`、`AC-CONV-009-38`、`AC-CONV-009-39`、`AC-CONV-009-40`、`AC-CONV-009-41`、`AC-CONV-009-42`、`AC-CONV-009-43`、`AC-CONV-009-44`、`AC-CONV-009-45`、`AC-CONV-009-46`、`AC-CONV-009-47`。

`AC-CHG-CONV-007-*` 枚举：`AC-CHG-CONV-007-01`、`AC-CHG-CONV-007-02`、`AC-CHG-CONV-007-03`、`AC-CHG-CONV-007-04`、`AC-CHG-CONV-007-05`、`AC-CHG-CONV-007-06`、`AC-CHG-CONV-007-07`、`AC-CHG-CONV-007-08`。

行为总数 94 条；冲突 12 条；缺口 29 条，按缺实现 11 条、缺入口 6 条、缺脚本 5 条、缺证据 7 条分布。自检表四类均为满额，缺失数为 0。
