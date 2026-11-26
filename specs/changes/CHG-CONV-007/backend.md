# CHG-CONV-007 · 后端开发 spec（增量）

状态：implemented（2026-11-26 复核；26 条 AC 全部 pass、560 条断言，验收报告 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)）
Implements: `PRD-CONV-009`
Covers: `AC-CONV-009-01` 至 `AC-CONV-009-18`（接口与数据侧）
长期契约：[`specs/backend/P1-CONV/spec.md`](../../backend/P1-CONV/spec.md) §17（`:761-1280`），本文件只写本变更的增量、落点与验收结论
证据：[`evidence.md`](evidence.md) §1（AC 证据表）、§3（接口证据）

## 1 范围与边界

本变更为会话内任务补齐记录、编排与查询能力：新增九个会话内接口，任务状态机与三类等待，任务卡片消息落库，六个 WebSocket 事件，三个模块迁移，以及跨会话隔离与工具护栏。任务归属由 `tasks.session_id` 决定，所有读写都带会话前缀。

边界有四条。任务执行器仍在 `P2-TASK`，本变更只提供调用契约与任务级取消上下文，不改执行器内部逻辑。交付物内容存储与下载实现仍在 `P4-FILE`，本变更只做按任务分组的查询投影与下载地址拼接。历史 `category=progress` 的开始消息不迁移、不改写，终态汇报继续用该类别。不新增删除任务的接口，`task_batches` 的幂等占位按 7 天 TTL 清理。

## 2 数据模型与迁移

`tasks` 表在 v8 迁移中加 14 列，全部带默认值：`mode`、`batch_id`、`goal`、`inputs_json`、`constraints_json`、`context_json`、`waiting_reason`、`waiting_since`、`started_at`、`finished_at`、`fail_reason`、`deadline_at`、`deadline_reminded_at`、`trigger_count`；同时加 `idx_tasks_session_updated(session_id, updated_at)` 与 `idx_tasks_batch(batch_id)`。旧行按默认值读，`mode` 视为 `plan`，历史 `blocked` 只在读取时映射为四态之一，不批量改写。

v9 迁移新建四张表与各自索引。`task_steps` 存 `id`、`task_id`、`seq`、`title`、`status`、`summary`、`fail_reason`、`started_at`、`finished_at`；`task_traces` 存 `id`、`task_id`、`step_id`、`seq`、`category`、`tool`、`text`、`at`；`task_batches` 存 `id`、`session_id`、`client_mutation_id`、`task_count`、`message_id`、`created_at`；`task_deps` 存 `task_id`、`dep_id`、`join_mode`、`created_at`。迁移末尾逐行读旧的 `tasks.steps` JSON 写入 `task_steps`，解析失败的行跳过并记日志，旧列保留只读。

`messages` 的 `batch_id` 列由 chat 模块迁移提供。该迁移的版本号是 v24，不是任务描述里写的 v23 或 v25：v23 已被 `session_read_cursors` 占用，所以顺延；`specs/backend/P1-CONV/spec.md:1086` 与 `:1187` 两处写的都是 v24，本文件以 v24 为准。列定义是 `batch_id TEXT NOT NULL DEFAULT ''`，加 `idx_messages_batch(batch_id)`；旧消息该列为空，卡片查询按空值跳过。

库级版本取各模块最大值，当前为 tasks v9、chat v24。升级顺序固定为 tasks v8、tasks v9、chat v24，由 `db.Migrate` 在启动时串行执行，任一步失败即启动失败，不进入半迁移状态。回滚策略是保留数据、停写新列：旧代码不读新列与新表，不删表、不清空列、不改写历史行；`task_steps` 与 `tasks.steps` 并存期间以 `task_steps` 为准。

## 3 状态机、等待与编排

后端持久化八个状态：`pending`、`queued`、`running`、`done`、`failed`、`cancelled`、`interrupted`、`blocked`。对前端只暴露四个展示态：`cancelled`、`interrupted` 归入 `failed`，`queued`、`blocked` 归入 `pending`，`displayStatus` 由后端计算后随投影下发。

合法迁移共 11 条：`pending` 可到 `queued`、`cancelled`；`queued` 可到 `running`、`cancelled`；`running` 可回到自身，也可到 `done`、`failed`、`cancelled`；`failed`、`cancelled`、`interrupted` 只能经重试回到 `queued`。对终态取消返回 200 且 `changed=false`；重试只在 `failed`、`cancelled`、`interrupted` 三个状态下允许，其余返回 409 `task_state_conflict` 并带 `currentStatus`。

三类等待各有进入与退出条件。等待依赖（`dependency`）在前置未完成时进入，前置完成后退出，下游保持 `pending` 而不写 `blocked`、不计失败。等待确认（`confirmation`）在工具需要 R3 审批时进入，`decision=confirm` 继续、`decision=cancel` 把当前步与任务置 `failed`、`failReason` 写「用户取消」、下游保持 `pending`。等待资源（`resource`）在预算或额度耗尽时进入，恢复后从暂停步骤继续，已完成步骤的起止时间不变，预算按累计值继续判断。

编排支持 `all`、`any`、`each` 三种 `join_mode`。`all` 等全部前置完成；`any` 在第 1 个前置完成后启动且不取消其余前置；`each` 每个前置完成各触发一次，`trigger_count` 在同一事务内自增。取消支持 `scope=self` 与 `scope=chain`，链路取消按依赖关系级联，下游不再启动。三类等待都没有系统自动超时，等待 30 分钟也不会自动失败。

## 4 HTTP 接口

| 序号 | 方法 | 路径 | 用途 | 成功 | 主要错误 |
|---|---|---|---|---|---|
| N1 | POST | `/api/sessions/{id}/tasks` | 创建 1–12 个任务并写卡片消息 | 201 | 400、404、409、413 |
| N2 | GET | `/api/sessions/{id}/tasks` | 列表、四态筛选、批次筛选与计数 | 200 | 400、404 |
| N3 | GET | `/api/sessions/{id}/tasks/{taskId}` | 详情：任务、步骤、轨迹、交付物、上下文、预算 | 200 | 400、404 |
| N4 | POST | `/api/sessions/{id}/tasks/{taskId}/cancel` | 取消单任务或整链 | 200 | 400、404、409 |
| N5 | POST | `/api/sessions/{id}/tasks/{taskId}/retry` | 重试失败、取消或中断任务 | 200 | 404、409 |
| N6 | POST | `/api/sessions/{id}/tasks/{taskId}/confirmation` | 等待确认时确认或取消 | 200 | 400、404、409 |
| N7 | POST | `/api/sessions/{id}/tasks/{taskId}/resume` | 等待资源时恢复 | 200 | 404、409 |
| N8 | GET | `/api/sessions/{id}/tasks/graph` | 节点、边、依赖层 | 200 | 400、404 |
| N9 | GET | `/api/sessions/{id}/deliverables` | 交付物按任务分组 | 200 | 400、404 |

N1 的请求体分批次级与任务级两层。批次级是 `mode`、`goal`、`inputs`、`constraints`、`tasks`、`clientMutationId`；任务级是 `key`、`title`、`mode`、`goal`、`inputs`、`constraints`、`steps`、`dependsOn`、`joinMode`、`deadlineAt`。`tasks` 长度 1 至 12，空数组返回 400 `invalid_argument`，超过 12 返回 400 `task_batch_too_large`；`explore` 模式携带 `steps` 返回 400 `invalid_task_mode`；依赖自指、跨批次、成环或同一任务入边 `joinMode` 混用返回 400 `invalid_task_dependency`。成功响应含 `batchId`、`tasks`、`messageId`、`counts`、`idempotent`、`total`；批次行、任务行、依赖行与步骤行在同一个事务内写入，任一校验失败全部回滚，不留任务行也不留卡片。

N2 接受 `status`、`mode`、`batchId`、`limit`、`before` 五个查询参数，`limit` 缺省 50、区间 1 至 100。响应含 `tasks`、`counts`（`all`、`pending`、`running`、`failed`、`done` 五键，按整个会话统计）、`total`、`hasMore`、`nextBefore`；排序是 `updated_at DESC, id DESC`；`failed` 筛选同时匹配 `failed`、`cancelled`、`interrupted`。游标失效返回空页而不是 404。

N3 接受 `traceLimit`（缺省 200、区间 1 至 500）与 `traceBefore`，响应含 `task`、`steps`、`currentStepId`、`traces`、`tracesHasMore`、`deliverables`、`context`、`budget`；`context.historyCount` 恒为 0；跨会话请求返回 404 `task_not_found`，响应体不含任务标题、目标、步骤与轨迹，也不得返回 403。

N4 用条件更新 `UPDATE tasks SET status='cancelled' WHERE id=? AND status IN ('pending','queued','running')`，5 秒内返回；执行器未响应时仍返回 200、`changed=false`，任务在下一次事件中落为 `cancelled`。N5 无请求体，条件更新带旧 `attempt`，响应含 `attempt` 与 `resetStepCount`。N6 请求体 `decision` 取 `confirm` 或 `cancel`，`note` 不超过 500 字。N7 请求体可选 `reason`，响应含 `resumedStepId`。N8 的 `edges[].style` 在前置为失败、取消或中断时取 `dashed`，`layers` 按最长路径分层。N9 接受 `taskId` 与 `limit`，不接游标，只返回 `delivery_kind='user_delivery'` 的文件，`downloadUrl` 为 `/api/artifacts/{artifactId}/content?download=1`。

五个既有接口做兼容改造：`GET /api/tasks` 增加 `sessionId`、`batchId` 与 `counts`；`GET /api/tasks/{id}` 增加 `steps`、`currentStepId`、`traces`、`context`、`budget`、`mode`、`waitingReason`、`failReason`；`POST /api/tasks/{id}/cancel` 接受 `scope`；`POST /api/tasks/{id}/retry` 收紧为三态可重试，对 `done` 由 200 变 409；`GET /api/sessions/{id}/artifacts` 元素增加 `typeBadge` 与 `taskTitle`，原有分页与 ETag 语义不变。

## 5 消息落库与事件

任务卡片是一条普通 `messages` 行，不新增表。字段固定为 `role=agent`、`category=task`、`task_id`（批量时取 `tasks[0].id`）、`batch_id`、`text`（单任务为标题，批量为「已创建 N 个任务」）、`status=done`、`internal=0`。`category` 白名单原只允许四值，实现把 `task` 加入允许集合，且只允许服务端写入。批量 N≥2 只写一条汇总卡，`task_count=N`；单任务不生成汇总卡。第 11 条起由前端用 N2 的 `limit` 折算「还有 N 条」，后端只保证 `task_count` 与分页总数一致。

六个事件全部进入 `isWSEventType` 白名单。`task.created` 每个任务一条，带 `id`、`sessionId`、`batchId`、`mode`、`status`、`displayStatus`、`title`、`dependsOn`、`orderIndex`、`createdAt`；`task.updated` 带 `status`、`displayStatus`、`waitingReason`、`progress`、`attempt`、`triggerCount`、`failReason` 与 `changed`；`task.step` 带 `stepId`、`stepSeq`、`status`、`traceCount`、`progress`、`at`；`task.trace` 带 `stepId`、`traceSeq`、`category`、`tool`、前 200 字 `text`、`at`；`task.report` 沿用既有字段并增加 `displayStatus` 与 `failReason`；`task.reminder` 带 `deadlineAt`，每个任务最多一条。

顺序固定为：全部 `task.created` 按 `orderIndex` 升序写完，再写 `message.created`，最后返回 HTTP 响应，因此客户端不会拿到指向不存在任务的卡片。事件日志 id 单调递增；`stepSeq` 与 `traceSeq` 各自从 1 严格递增，重试不回退。重连带 `since` 回放，且客户端必须再做一次 N2 与 N3 对账，HTTP 结果是权威来源。

## 6 隔离、权限与护栏

跨会话读写一律按 `tasks.session_id` 判定，不匹配返回 404 `task_not_found`，不返回 403，错误文案不带任务名；交付物所属任务不在路径会话内同样 404，无归属任务的交付物返回 404 `artifact_not_found`。

工具调用有四层护栏，按会话归属、路径范围、工具白名单、网络与子进程权限的顺序判定。路径解析后越出 workspace 或 artifacts 根返回 403 `permission_denied`，并写一条 `observe` 轨迹，`text` 以 `403 ` 开头；工具不在白名单返回 403；需要 R3 审批的工具返回 409 `APPROVAL_REQUIRED` 并带 `approvalId`，任务进入 `confirmation` 等待；未授权网络或子进程直接 403，不发起连接、不创建进程。任一护栏不通过只终止本次工具调用，任务本身不因此失败。

## 7 上下文、预算与时限

启动上下文只注入 `goal`、`inputs`、`constraints` 三类，不读 `messages` 表，`context_json` 在创建时一次写定，`historyCount` 恒为 0。缺省值按任务级、批次级、标题的顺序回退，不回退到聊天历史；重试不重新收集上下文。

预算字段固定为 `{"maxTokens":N,"maxSteps":N,"usedTokens":N,"usedSteps":N}`，缺省 `maxTokens=0`（不限额）、`maxSteps=50`。达到任一上限进入 `running` 加 `waitingReason=resource`，保留已完成步骤与产出，不写失败原因、不自动重试；恢复清空等待原因并从暂停步继续，不重置计数。

时限只来自用户设置的 `deadlineAt`，系统不设默认执行超时。到点发一条 `task.reminder` 并写 `deadline_reminded_at`，任务状态不变。任务执行器使用任务级取消上下文，不继承聊天回合 12 分钟墙钟上限，只有取消接口、服务关闭与显式中断能取消。

## 8 并发与幂等

创建请求在单事务内写批次、任务、依赖与步骤，失败全回滚。同一会话的两个创建请求由 SQLite 单写者串行提交，后提交批次 `orderIndex` 从 0 重新计数。同一 `session_id` 与 `clientMutationId` 的重放返回首次结果且 `idempotent=true`，占位未完成时返回 409 `mutation_in_progress`；同键不同请求体视为冲突，不覆盖首次结果；占位按 7 天 TTL 清理。取消与重试都用条件更新，受影响行数为 0 时读当前状态并按终态或冲突返回。步骤写入用 `seq` 做条件，轨迹 `traceSeq` 在任务级计数器的同一事务内分配。服务重启把 `running` 与 `queued` 置 `interrupted` 并写「服务重启，任务已中断」，不自动重试，下游保持 `pending`。

## 9 错误码

| 错误码 | HTTP | 触发 |
|---|---|---|
| `task_not_found` | 404 | 任务不存在或与会话不匹配 |
| `task_state_conflict` | 409 | 重试、确认、恢复的状态前提不满足，带 `currentStatus` |
| `invalid_task_mode` | 400 | `mode` 非 `plan`/`explore`，或 `explore` 携带步骤 |
| `invalid_task_status` | 400 | 列表 `status` 含未知值 |
| `invalid_task_limit` | 400 | `limit` 越界 |
| `task_batch_too_large` | 400 | 单次创建超过 12 个任务 |
| `invalid_task_dependency` | 400 | 依赖不存在、跨批次、自指、成环或入边 `joinMode` 混用 |
| `task_context_too_large` | 413 | 目标、输入或约束超限 |
| `permission_denied` | 403 | 路径越界、工具不在白名单、未授权网络或子进程，带 `path` 或 `tool` |
| `task_executor_unavailable` | 503 | 任务模块启用但执行器未装配 |

错误信封沿用 `{"ok":false,"error":"...","code":"..."}`，只有 `task_state_conflict`、`permission_denied` 追加字段。这十个码追加进长期 spec §14 的总表，不与既有同名项冲突。

## 10 与既有实现的差异

十处改动：失败级联由置 `blocked` 改为等待依赖；步骤由 JSON 列改为行表；创建入口由 `delegate` 单任务改为 N1 服务方法；创建后补写卡片消息与汇总卡；列表新增会话内筛选与计数；取消支持链路与条件更新；重试收紧到三态；WS 由三个事件扩到六个并补展示态字段；执行器改用任务级上下文，脱离 12 分钟墙钟；新增按任务分组的交付物查询。工作流并发上限沿用 12 个任务、默认并发 3，可用 `SIMO_WORKFLOW_CONCURRENCY` 覆盖。

实现落点集中在 `backend/internal/modules/tasks/` 的 `service.go`、`workflow.go`、`http.go`、`conv.go`、`conv_http.go`、`migrations.go`、`deliverables.go`、`concurrency.go`、`real_executor.go`，以及 `backend/internal/modules/chat/` 的 `cards.go`、`category.go`、`task_executor.go`、`task_permission.go`、`migrations.go`、`loop.go`。契约测试在 `tasks/conv_http_test.go`、`tasks/conv_t02_test.go`、`tasks/conv_t03_test.go`、`tasks/conv_test.go`、`chat/task_runtime_test.go`、`chat/task_t02_test.go`。

## 11 AC 承载与验收结论

后端承载 `AC-CONV-009-01` 至 `-06`、`-08` 至 `-18` 的接口侧判据（`-07` 是纯前端只读约束）。断言脚本统一为 `scripts/ac/AC-CONV-009-NN.mjs`，逐条断言数 01=25、02=33、03=16、04=12、05=18、06=12、07=33、08=16、09=15、10=13、11=9、12=18、13=16、14=17、15=34、16=46、17=17、18=17，加 8 条变更级 AC 的 14/14/52/15/31/17/25/25。

本变更后端侧随整包签发：26 条 AC 全部 pass、560 条断言；五道门禁在本包均无新增问题，`check-contract` 的 7 项检查 0 警告，`check-evidence` 13 项全 PASS。证据入口是 [`evidence.md`](evidence.md) §1 的 AC 证据表与 §3 的接口证据，独立验收报告为 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)，真机 16 条路径全部 pass（14 次模型调用、输入 54404、输出 3763 tokens）。

未实现项 0 条。遗留的八项未决不影响已签发判据：汇总卡的 `task_id` 取首个任务属折中；`each` 触发复用步骤；审批与等待确认是一一对应而非可多审批；提醒展示位置由前端脚注承担；未知 MIME 的徽标兜底为 `doc`；预算提高入口留给后续变更；整链取消的汇总卡文案未定；任务模块关闭时 404 与不存在不可区分。
