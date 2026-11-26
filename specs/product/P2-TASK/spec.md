# P2 · 任务与执行（产品域 Spec）

状态：**active**（产品域 spec；实现状态逐项标注，不把接口存在当产品完成）
> 产品域：`P2`；技术域码：`TASK`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P2-TASK/test-plan.md`](../../test/P2-TASK/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)。
> AC 改写记录：2026-11-22 按 [`CHG-B1-001`](../../changes/CHG-B1-001/spec.md) 把 6 个 PRD 的泛化 AC 改写为可判定判据；状态列未变，覆盖状态未变。

## 1. 目标

把“任务与执行”从零散接口/旧 FE 规格收敛成可验收的产品能力：明确场景、行为、AC 与实现状态；**未实现的能力标 `unimplemented`，不得写成已完成**。

本域覆盖 6 个 L3 功能点：implemented 0、partial 3、unimplemented 3。

## 2. 非目标

- 不在本 spec 定义具体组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/<CHG>/`。
- 不把后端路由/数据库表存在等同于用户可用；没有入口或没有证据的能力最多算 `partial`。
- 不为本域每个功能点新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本轮修改代码、测试或部署。

## 3. 场景

- S1 任务生命周期：用户从任务与执行入口完成任务生命周期相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S2 长任务与异步：用户从任务与执行入口完成长任务与异步相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S3 复杂度与归属：用户从任务与执行入口完成复杂度与归属相关任务；正常、空、加载、错误与权限不足都必须有可见结果。

## 4. 功能点与需求

> 每个功能点包含：PRD、优先级、实现状态、落地前差距、目标行为、AC。目标行为是**产品要求**，不是“已经实现”的声明。
>
> **AC 写法约定**（判定方式三选一，逐条写明）：
> - `自动`：`scripts/ac/<AC-ID>.mjs` 直接断言；脚本未落盘前证据记 `missing`，不得记通过。
> - `人工`：验收 Agent 在 8787 走查，按 AC 写明的前置、动作、观察逐条执行，截图归档；AC 定义行内标 `人工：<理由≥8字>`。
> - `自动+人工`：脚本断言接口/数据，人工只看界面是否与接口一致。
> 判定口径只用 `docs/process/SPEC-STANDARD.md` 白名单六类（HTTP 状态与 JSON 字段、DB 行、DOM 尺寸与命中点、computed 样式、日志行、命令退出码）。错误路径同时写状态码与错误文案。

### 4.1 L2 · 任务生命周期

#### PRD-TASK-001 · 任务生命周期与执行组
<a id="prd-task-001"></a>

- 优先级：P0
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M1](../../../docs/m1-contract.md) / [M10](../../../docs/m10-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：后端 tasks 路由存在，但无前端执行组完整契约、无域测试计划。
- 当前剩余缺口：前端无独立任务执行组视图；AC 已改写为可判定，域级证据仍 missing。
- 目标行为：会话页能进入该会话的任务执行组，看到任务列表与逐任务详情（状态、进度、尝试次数），状态机械可读、空态与加载失败都有出口，跨会话任务不可见。
- AC：
  - `AC-TASK-001-01` **主路径：会话内任务组可见**；前置：会话 S 有 3 条任务（done、running、queued 各 1）；动作：打开会话页右栏任务组，不展开；观察：默认展示 3 行，每行显示标题与状态；展开后最多展示 50 行；
    判据：`GET /api/sessions/S/spec-projection?taskLimit=3` 返回的 `tasks` 条数与 DOM 中按任务标题文本定位的行数相等（`getByText(title)`），逐行标题与接口 `title` 一致；断言：`scripts/ac/AC-TASK-001-01.mjs` case `主路径`；证据：脚本 JSON + 走查截图；判定：自动+人工。
  - `AC-TASK-001-02` **主路径：任务详情字段完整**；前置：存在任务 T（id 已知）；动作：在任务组点击 T；观察：详情面板显示 `GET /api/tasks/T` 返回的 `task.title`、`status` 文案、`progress` 数值与 `attempt` 次数；判据：接口 200 且 `ok=true`、`task` 含 `id/title/status/progress/attempt` 五字段，详情面板文本逐字段匹配；
    缺任一字段即 fail；断言：`scripts/ac/AC-TASK-001-02.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-TASK-001-03` **状态机取值封闭**；前置：构造 8 条任务，状态分别取 `pending/blocked/queued/running/done/failed/cancelled/interrupted`；动作：打开任务组；观察：8 条任务各显示一种状态文案，且两两不同；判据：接口 `status` 只落在上述 8 值集合内（越界值即 fail），DOM 状态文案去重后数量为 8；
    断言：`scripts/ac/AC-TASK-001-03.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-TASK-001-04` **空态**；前置：会话 S0 无任何任务；动作：打开任务组；观察：显示空态文案，不显示 `0` 条任务之类的假计数；判据：`GET /api/sessions/S0/spec-projection?taskLimit=3` 返回 `tasks: []`，DOM 出现空态节点且任务行数为 0；断言：`scripts/ac/AC-TASK-001-04.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-TASK-001-05` **加载失败可重试**；前置：把投影接口置为 500（或断网）；动作：打开任务组，点击错误态上的「重试」；观察：先出现错误态，点击后重新发起 1 次请求；判据：错误态出现时 DOM 无任务行，点击重试后同一接口请求计数由 1 变 2（容许 ±0）；断言：`scripts/ac/AC-TASK-001-05.mjs` case `负路径-接口 500`；证据：脚本 JSON + 网络日志；判定：自动。
  - `AC-TASK-001-06` **负路径：不存在或跨会话任务不可读**；前置：任务 T2 属于会话 S2，当前会话为 S1；动作：`GET /api/tasks/T2` 与前端直接打开 T2 详情；观察：后端返回 404 且错误文案为「任务不存在」，前端显示同文案且不渲染 T2 标题；判据：HTTP 404 + `error.message="任务不存在"`，DOM 不含 T2 标题；
    断言：`scripts/ac/AC-TASK-001-06.mjs` case `负路径-跨会话`；证据：脚本 JSON + 截图；判定：自动+人工。现状差异 D-04：`GET /api/tasks/{id}` 当前不校验 sessionId 归属，跨会话可读，本 AC 实现前记 **待实现**。
- 现状差异：见 §8 D-04（跨会话读任务当前只按 id 查，不校验会话归属；`tasks/http.go` 的 `GET /api/tasks/{id}` 无 sessionId 约束），标记**待实现**。

#### PRD-TASK-002 · 任务概览与进度
<a id="prd-task-002"></a>

- 优先级：P0
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M14](../../../docs/m14-contract.md) / [M18](../../../docs/m18-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：右栏/概览已有部分展示；无 PRD、无 AC、无进度口径与测试。
- 当前剩余缺口：进度口径与刷新时限未落判据；AC 已改写为可判定，域级证据仍 missing。
- 目标行为：任务进度是 0–100 的整数，概览计数与按状态查询结果一致，进度变化在有时限的窗口内反映到界面，首屏未返回时不显示假 0。
- AC：
  - `AC-TASK-002-01` **进度取值与终态一致**；前置：会话 S 有 done、running、queued 任务各 1；动作：分别读取 `GET /api/tasks?sessionId=S&status=<status>`；观察：`done` 任务 `progress=100`，`queued` 任务 `progress=0`，任一任务 `progress` 为 0–100 的整数；
    判据：HTTP 200 + 字段断言，越界或非整数即 fail；断言：`scripts/ac/AC-TASK-002-01.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-002-02` **概览计数与状态查询一致**；前置：会话 S 有 2 条 running、1 条 queued、3 条 done；动作：打开会话概览；观察：概览显示 running=2、queued=1、done=3；判据：概览三个计数分别等于 `GET /api/tasks?sessionId=S&status=<X>` 的 `tasks.length`；
    断言：`scripts/ac/AC-TASK-002-02.mjs` case `主路径`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-TASK-002-03` **进度刷新有时限**；前置：running 任务 T 的 `progress` 由 10% 变为 40%（以接口返回该新值为起点）；动作：不刷新页面，连续采样界面进度文本；观察：5 秒内界面进度变为 40%；判据：起点后 5 秒内 DOM 进度文本与接口最新值相等，超过 5 秒即 fail；断言：`scripts/ac/AC-TASK-002-03.mjs` case `主路径`；证据：脚本 JSON（含起止时间戳）；判定：自动。
  - `AC-TASK-002-04` **加载中不显示假进度**；前置：把 `GET /api/tasks` 延迟 2 秒返回；动作：打开概览；观察：延迟期间显示加载态，不出现 `0%` 或任意进度条数值；判据：加载期间 DOM 无匹配 `/\d+%/` 的节点且存在加载态节点，接口返回后加载态消失；断言：`scripts/ac/AC-TASK-002-04.mjs` case `负路径-接口延迟`；证据：脚本 JSON + 截图；判定：自动+人工。
- 现状差异：见 §8 D-02（进度刷新链路未验证；当前投影接口按 ETag 缓存，`progress` 变化是否触发前端重取未确认），标记**待实现/待核**。

### 4.2 L2 · 长任务与异步

#### PRD-TASK-003 · 长任务异步与开始/结束消息
<a id="prd-task-003"></a>

- 优先级：P0
- 实现状态：`unimplemented`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M19](../../../docs/m19-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：仅有 m19 契约；异步开始/结束消息、解耦与恢复未实现验收。
- 当前剩余缺口：`unimplemented`，无可用实现/无完整验收。
> **unimplemented**：当前无可用实现/无完整验收；不得对外宣称已完成。

- 目标行为：发起长任务后接口在有时限内返回、会话不被阻塞；任务开始时与结束时各向会话消息流写 1 条消息，消息按 taskId 可追溯；进程重启后中断任务可见且不重复写开始消息。
- AC：
  - `AC-TASK-003-01` **对话多步请求先出方案卡再派生任务**；前置：会话 S 可正常发送消息；动作：在会话内发送一条带编号或顺序词的明确多步请求，读取任务列表与会话消息，随后对该方案卡执行确认；
    观察：对话请求在 5 秒内返回 2xx，确认前任务 0 条且出现 1 张方案卡，确认后任务 1 条且 `status ∈ {queued,running}`；判据：确认前 `GET /api/tasks?sessionId=S` 的 `tasks.length` 为 0、`GET /api/sessions/S/messages` 中 `category="confirmation"` 且带 `taskPlan` 的消息恰好 1 条，确认返回 200 后同一列表出现 1 条任务且 `status ∈ {queued,running}`、无新增子会话；断言：`scripts/ac/AC-TASK-003-01.mjs` case `主路径`；证据：脚本 JSON（含确认前后两次响应）；判定：自动。
  - `AC-TASK-003-02` **开始消息落库**；前置：任务 T 由 `queued` 进入 `running`；动作：等待进入 running 后读取 `GET /api/sessions/S/messages`；观察：出现 1 条 `role="agent"`、`taskId=T`、`category="progress"` 的消息，正文含 T 的标题；
    判据：接口返回该条消息，`category="progress"`、`task_id=T`，`reportMessageId` 等于该消息 `id`；开始消息与任务卡消息并存，历史 `messages` 数据不迁移，不补写开始消息（2026-11-22 已裁决）；断言：`scripts/ac/AC-TASK-003-02.mjs` case `主路径`；证据：脚本 JSON；判定：自动。现状差异 D-01：任何任务类型当前都不写开始消息（`real_executor.go` 只在终态调 `reportWorkflowTaskText`），本 AC 实现前记 **待实现**。
  - `AC-TASK-003-03` **结束消息落库且不重复**；前置：任务 T 执行成功进入 `done`；动作：查询该 taskId 的消息与任务详情；观察：存在 1 条结束消息，含结论文本与至少 1 个产物名；
    判据：`task_id=T` 的结束消息恰好 1 条、`task.endMessageId` 等于该消息 `id`、`task.reportMessageId` 仍指向开始消息，终态后 30 秒内该 taskId 消息数不再增加；断言：`scripts/ac/AC-TASK-003-03.mjs` case `主路径`；证据：脚本 JSON（含 30 秒前后两次计数）；判定：自动。
  - `AC-TASK-003-04` **重启不重复写开始消息**；前置：任务 T 处于 `running` 且开始消息已写 1 条、结束消息已写 0 条；动作：重启服务，随后触发一次重试；观察：重启后 T 变为 `interrupted`，开始消息仍为 1 条、结束消息 0 条，重试后开始消息增为 2 条、结束消息仍 0 条；
     判据：重启后任务为 `status="interrupted"`、`task_id=T` 且 `category="progress"` 的消息行数仍为 1、`task_id=T` 的结束消息行数 0 且 `task.endMessageId` 为空；重试后 `category="progress"` 的消息行数 2、结束消息行数 0 且 `endMessageId` 仍为空；断言：`scripts/ac/AC-TASK-003-04.mjs` case `负路径-重启恢复`；证据：脚本 JSON + 重启前后两次查询结果；判定：自动。现状差异 D-01：开始消息未实现，本 AC 与 003-02 同批实现。
  - `AC-TASK-003-05` **单任务与工作流消息同构**；前置：一条 workflow 任务与一条非 workflow 单任务各跑完；动作：对比两条任务的结束消息字段；观察：两者都有结束消息，字段集合相同，仅 `workflowId` 有无不同；
     判据：两组结束消息的字段名集合相等（差集为空），每条都带 `taskId`、`category`、`endMessageId` 与至少 1 个产物名；断言：`scripts/ac/AC-TASK-003-05.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-003-06` **轻量请求直接回答，不建任务也不出方案卡**；前置：会话 S 可正常发送消息；动作：先发送一条无编号、无顺序词的单句完成型请求（C0），再发送一条只有两步、带编号的请求（C1），分别等待回合结束；
    观察：两次请求都得到助手回复，任务 0 条、方案卡 0 张、无子会话；判据：两次 `GET /api/tasks?sessionId=S` 的 `tasks.length` 均为 0、`GET /api/sessions/S/messages` 中 `category="confirmation"` 的消息 0 条、每次助手消息 `status="done"` 且正文非空、`sessions` 无子会话；断言：`scripts/ac/AC-TASK-003-06.mjs` case `主路径`；证据：脚本 JSON（两次对话响应）；判定：自动。
- 现状差异：见 §8 D-01（开始消息尚未实现：`backend/internal/modules/tasks/real_executor.go:62-122` 只在终态调 `reportWorkflowTaskText`，`workflow.go:447-450` 对 `task.WorkflowID==""` 直接 return；结束消息仅 workflow 任务有，经 `chat/workflow_reports.go:14-70` 写成 `messages` 行并带 `task_id`。产品要求单任务同样有开始与结束消息，**待实现**）。

#### PRD-TASK-006 · 取消·重试·预算·恢复
<a id="prd-task-006"></a>

- 优先级：P1
- 实现状态：`partial`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M19](../../../docs/m19-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：后端有 cancel/retry/runtime；预算/并发/恢复缺产品 spec 与前端入口。
- 当前剩余缺口：前端取消/重试入口未做；预算未接真实用量；域级证据 missing。
- 目标行为：运行中任务可取消且在有时限内到达 `cancelled`，重复取消无副作用；失败或已取消任务可重试且 attempt 递增、历史产物保留；预算触顶保持运行中并进入资源等待（`waitingReason="resource"`、`outcome="budget_exceeded"`），任务卡给恢复入口、恢复后从暂停步继续且已完成步骤不重跑；重启后任务是 `queued` 或 `interrupted`，不出现 `running` 悬挂。
- AC：
  - `AC-TASK-006-01` **取消运行中任务**；前置：任务 T 处于 `running` 且有活跃执行器；动作：`POST /api/tasks/T/cancel`；观察：返回 2xx，`task.status="cancelled"`；判据：起点（cancel 请求发出）后 5 秒内 `GET /api/tasks/T` 返回 `status=cancelled`，且 DB 中该任务 `phases/steps` 无 `running` 行；
    断言：`scripts/ac/AC-TASK-006-01.mjs` case `主路径`；证据：脚本 JSON（含耗时与 DB 查询）；判定：自动。
  - `AC-TASK-006-02` **取消幂等**；前置：任务 T 已 `done`（或 `cancelled`）；动作：再次 `POST /api/tasks/T/cancel`；观察：返回 200 且状态不变；判据：HTTP 200，`task.status` 仍为原终态，两次读取的 `updatedAt` 相同；断言：`scripts/ac/AC-TASK-006-02.mjs` case `负路径-终态再取消`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-006-03` **取消后不再产生新写入**；前置：任务 T 取消成功，记录当前消息数与产物数；动作：等待 30 秒；观察：该 taskId 无新增消息与产物；判据：`messages` 与 `artifacts` 中 `task_id=T` 行数增量均为 0；断言：`scripts/ac/AC-TASK-006-03.mjs` case `负路径-取消后静默`；证据：脚本 JSON（前后两次计数）；判定：自动。
  - `AC-TASK-006-04` **重试递增 attempt 并复位进度**；前置：任务 T 处于 `failed` 或 `cancelled`，`attempt=1`；动作：`POST /api/tasks/T/retry`；观察：返回 2xx，`status="queued"`、`attempt=2`、`progress=0`、`summary` 为空、`id` 不变；判据：HTTP 200 + 上述字段逐项断言；
    断言：`scripts/ac/AC-TASK-006-04.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-006-05` **重试保留历史产物**；前置：任务 T 已有 2 个产物（`artifacts` 中 `task_id=T` 计数为 2）；动作：重试 T；观察：重试后产物仍为 2 条且 id 不变；判据：重试前后 `artifacts` 行数相等、id 集合相等；断言：`scripts/ac/AC-TASK-006-05.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-006-06` **预算触顶转运行中资源等待**；前置：任务 T 的 token 用量到上限；动作：让执行器继续消耗 1 步；观察：任务保持 `running` 并带「等待资源」标记，界面显示预算文案；
    判据：DB `tasks.status='running'`、`waitingReason="resource"`、`outcome="budget_exceeded"`、`attempt` 不变、`progress` 不前进，DOM 预算文案与恢复入口各 1 个，恢复后从暂停步继续、已完成步骤不重跑，恢复后 `waitingReason` 与 `outcome` 清空；断言：`scripts/ac/AC-TASK-006-06.mjs` case `负路径-预算触顶`；证据：脚本 JSON + 截图；判定：自动+人工。
  - `AC-TASK-006-07` **重启后 queued 任务原样保留**；前置：库中有 1 条 `queued`、1 条 `running` 任务，记录两条任务的 `attempt` 与 `task_id` 事件条数；动作：重启服务，等待 10 秒；观察：`queued` 任务保持 `queued` 原样，不重排、不补写事件，随后由调度消费进入 `running`；原 `running` 任务变 `interrupted`；
    判据：重启后 10 秒内原 `queued` 任务状态为 `running`、`attempt` 与重启前相同、其 `task_id` 的事件条数增量为 0 或仅 1 条 `task.updated`；原 `running` 任务状态为 `interrupted`，两条任务之外无新增任务；断言：`scripts/ac/AC-TASK-006-07.mjs` case `负路径-重启恢复`；证据：脚本 JSON + 重启日志；判定：自动。
- 现状差异：见 §8 D-03（`GET /api/tasks/{id}/runtime` 的 budget 目前硬编码 `taskTokenBudget:200000、used:0`，`chat/runtime.go:305`；预算触顶判据需真实用量，标记**待实现**）。

### 4.3 L2 · 复杂度与归属

#### PRD-TASK-004 · 复杂度分级与确认门禁
<a id="prd-task-004"></a>

- 优先级：P0
- 实现状态：`unimplemented`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M10](../../../docs/m10-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：C0–C4 已写入 docs/task-complexity.md，但无实现、无测试。
- 当前剩余缺口：`unimplemented`，无可用实现/无完整验收。
> **unimplemented**：当前无可用实现/无完整验收；不得对外宣称已完成。

- 目标行为：每次请求落一个 C0–C4 复杂度等级；C0 不建任务、不建会话，C1 只 fork 临时 Worker、不建正式任务与会话，C2 在当前会话建 1 个任务并先给方案、等确认，C3 确认后父级建 1 个子会话并在子会话内建任务、父级任务数 0，C4 确认后父级建 3–4 个子会话、父级任务数 0；确认入口是父会话消息流里的方案卡，确认前一律不建任务行、不建子会话、不产生产物，确认后才执行；用户拒绝时任务 0 条、子会话 0 个、产物 0 条；确认超时后仍停在等待态，不自动放行；分级与确认都有记录可查。
- AC：
  - `AC-TASK-004-01` **分级取值封闭**；前置：5 次请求覆盖 C0–C4；动作：读取任务详情、子会话与分级记录；观察：5 条请求的分级结果覆盖 C0–C4；C2 在当前会话建任务 1 条，C3、C4 在确认后分别建子会话并在其中建任务，C0、C1 不建任务，C3、C4 父级任务 0 条；
    判据：5 条请求的分级结果落在 `{C0,C1,C2,C3,C4}`（越界值即 fail）且覆盖五个取值，C0、C1 任务行数 0，C2 当前会话任务行数 1，C3 子会话数 1 且其中任务行数 1，C4 子会话数 3–4 且其中任务行数 3–4，C3、C4 父级任务行数 0；断言：`scripts/ac/AC-TASK-004-01.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-004-02` **高复杂度不确认不执行**；前置：C3 请求已分级、方案卡已发、未确认；动作：等待 60 秒后点确认，另起一次点拒绝；观察：确认前父级无任务与子会话、无产物；判据：确认前父级任务数 0 个、子会话数 0 个、产物 0 条、父级方案 `attempt=0`；点确认后子会话 1 个、该子会话内任务 1 个；点拒绝后任务 0 个、子会话 0 个、产物 0 条；
    不设自动执行超时，30 分钟未确认由前端提示、12 小时未确认在概览标「待确认超时」，两处只标记不执行（时间可用假时钟推进断言）；断言：`scripts/ac/AC-TASK-004-02.mjs` case `负路径-未确认`；证据：脚本 JSON（含采样时间点）；判定：自动。
  - `AC-TASK-004-03` **拒绝即不执行**；前置：C4 父级总方案处于等待确认，父级任务 0 个、子会话 0 个；动作：提交拒绝；观察：不建子会话与任务、不产生产物；
    判据：拒绝后父级总方案状态为 `rejected`，父级任务 0 个、子会话 0 个、产物 0 条，`eventlog` 中 `task_confirmed` 行数为 0；断言：`scripts/ac/AC-TASK-004-03.mjs` case `负路径-用户拒绝`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-004-04` **确认动作可追溯**；前置：C4 父级总方案完成一次确认；动作：查询事件日志；观察：存在 1 条分级事件与 1 条确认事件；判据：`eventlog` 中 `payload.session_id=P` 且类型为 `complexity_classified`、`task_confirmed` 的行各 1（C4 无父级任务，不按 `task_id` 判定；类型名见 §8 Q-02）；
    断言：`scripts/ac/AC-TASK-004-04.mjs` case `主路径`；证据：脚本 JSON；判定：自动。

#### PRD-TASK-005 · 子会话与任务归属
<a id="prd-task-005"></a>

- 优先级：P0
- 实现状态：`unimplemented`
- 关联：CHANGE [CHG-B1-001](../../changes/CHG-B1-001/spec.md)；开发 [M1](../../../docs/m1-contract.md) / [M10](../../../docs/m10-contract.md)；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：父会话只维护 childSessionIds、子会话内建 Task 的规则已定，但未实现/未验证。
- 当前剩余缺口：`unimplemented`，无可用实现/无完整验收。
> **unimplemented**：当前无可用实现/无完整验收；不得对外宣称已完成。

- 目标行为：在子会话里创建的任务归属子会话，`sessionId` 指向子会话；父会话的任务组不混入子会话任务；跨会话读取默认拒绝；父会话归档不影响子会话任务行。
- AC：
  - `AC-TASK-005-01` **子会话任务归属正确**；前置：父会话 P 已派生会话 C；动作：在 C 内创建一个任务 T；观察：`GET /api/tasks/T` 返回 `task.sessionId=C`；判据：字段相等断言；断言：`scripts/ac/AC-TASK-005-01.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-005-02` **父会话任务组不混入子任务**；前置：P 有 1 条自有任务，C 有 1 条任务；动作：读取 `GET /api/tasks?sessionId=P` 与 `GET /api/sessions/P/spec-projection`；观察：两处都只返回 P 的 1 条任务；判据：两处 `tasks` 条数均为 1，且不含 T 的 id；
    父层概览另显示「含 1 个子会话」入口，点击可进入 C 并看到 T，子会话任务不计入父层任何计数（2026-11-22 已裁决）；断言：`scripts/ac/AC-TASK-005-02.mjs` case `主路径`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-005-03` **负路径：跨会话默认拒绝**；前置：T 属于 C，当前以 P 的身份访问；动作：`GET /api/sessions/P/files` 与 `GET /api/tasks?sessionId=P`；观察：不返回 T 的任何字段；判据：两处响应正文不含 T 的 id 与标题（字符串搜索为空）；断言：`scripts/ac/AC-TASK-005-03.mjs` case `负路径-跨会话`；证据：脚本 JSON；判定：自动。
  - `AC-TASK-005-04` **归档父会话不影响子会话任务**；前置：C 有任务 T，P 归档/删除；动作：归档 P 后读取 T；观察：T 仍可读，`sessionId` 仍为 C；判据：`GET /api/tasks/T` 返回 200 且 `status` 不变；断言：`scripts/ac/AC-TASK-005-04.mjs` case `边界-父会话归档`；证据：脚本 JSON；判定：自动。

## 5. 验收标准（A1–A8）

| ID | 验收标准 | 适用性 |
|---|---|---|
| A1 | 本域全部 P0 PRD 的主路径可走通，结果与状态一致 | 必验 |
| A2 | 空、加载、错误、权限不足至少各有一条可见反馈，不静默失败 | 必验 |
| A3 | 有 UI 的功能点可用键盘完成主路径，焦点可见；纯后端域标 N/A 并说明 | 有 UI 必验，否则 N/A |
| A4 | 有 UI 的功能点在 375px 宽度不横向溢出、不遮挡主操作；纯后端域 N/A | 有 UI 必验，否则 N/A |
| A5 | 不展示假 0/假成功；未实现/无证据项在界面与文档中明确标注 | 必验 |
| A6 | 权限/隔离类功能默认拒绝，越权路径不因前端隐藏按钮而被视为安全 | 涉及权限/团队/文件必验 |
| A7 | `unimplemented` 项在 TREE/TRACEABILITY/spec 中一致标注，且不被计入 covered | 必验 |
| A8 | 每个 A/PRD 至少映射一个测试用例；当前证据缺失的写 `missing`，不得写“通过” | 必验 |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明 |
|---|---|---|---|
| `PRD-TASK-001` | 任务生命周期与执行组 | `partial` | 部分；后端 tasks 路由存在，前端无独立执行组视图；AC 已改写为可判定。 |
| `PRD-TASK-002` | 任务概览与进度 | `partial` | 部分；概览已有部分展示；进度刷新链路未验证；AC 已改写为可判定。 |
| `PRD-TASK-003` | 长任务异步与开始/结束消息 | `unimplemented` | 设计；仅有 m19 契约；单任务开始/结束消息未实现（见 §8 D-01）。 |
| `PRD-TASK-006` | 取消·重试·预算·恢复 | `partial` | 部分；后端有 cancel/retry/runtime；前端入口与真实预算未做。 |
| `PRD-TASK-004` | 复杂度分级与确认门禁 | `unimplemented` | 设计；C0–C4 已写入 docs/task-complexity.md，无实现、无测试。 |
| `PRD-TASK-005` | 子会话与任务归属 | `unimplemented` | 设计；父会话只维护 childSessionIds，未实现/未验证。 |

**未实现项（unimplemented）**：`PRD-TASK-003` 长任务异步与开始/结束消息、`PRD-TASK-004` 复杂度分级与确认门禁、`PRD-TASK-005` 子会话与任务归属。

> 说明：`implemented` 只表示“有验收/可运行实现”的现状摘要；不等于本 spec 的 AC 已全部重跑。所有执行证据见测试计划的“当前证据”列。

## 7. 依赖、风险与待确认

- 依赖：`TASK` 的能力必须与现有 FE/COMP/契约一致；冲突时以本 spec 的产品行为为准，并开变更包修正。
- 风险：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”。
- 待确认：未实现项的排期与 owner（PRD-TASK-003、PRD-TASK-004、PRD-TASK-005）。
- 证据：测试计划 [`../../test/P2-TASK/test-plan.md`](../../test/P2-TASK/test-plan.md)；未执行项一律 `missing`。

## 8. 现状差异与裁决

**现状差异（产品要求与代码现状冲突，均标 待实现）**

- `D-01` TASK-003 开始消息未实现、结束消息只覆盖工作流任务：`backend/internal/modules/tasks/real_executor.go:62-122` 只在终态调 `reportWorkflowTaskText`，`workflow.go:447-450` 在 `task.WorkflowID == ""` 时直接返回；有 workflow 的任务经 `eventlog.TypeTaskReport` 由 `backend/internal/modules/chat/workflow_reports.go:36-56` 写成 `messages` 行（`role=agent`、`category=progress`、`task_id` 有值，消息 id 即 `reportMessageId`）。产品要求单任务同样有开始与结束消息，**待实现**。
- `D-02` TASK-002 进度刷新链路未验证：`GET /api/sessions/{id}/spec-projection` 按 `taskLimit` 生成 ETag（`backend/internal/modules/chat/spec_projection.go:146-160`），任务 `progress` 变化是否使前端重取未确认；`spec_projection.go` 的任务分组只返回摘要，不含 `progress` 的逐任务值。产品要求 5 秒内可见，**待实现/待核**。
- `D-03` TASK-006 预算未接真实用量：`backend/internal/modules/chat/runtime.go:305` 固定返回 `{"taskTokenBudget":200000,"remaining":200000,"used":0}`。预算触顶判据需要真实累计值，**待实现**。
- `D-04` TASK-001 跨会话读任务无归属校验：`backend/internal/modules/tasks/http.go` 的 `GET /api/tasks/{id}` 只按 id 查询，不校验 `sessionId`。产品要求跨会话 404，**待实现**。
- `D-05` TASK-006 重试对运行中任务无守卫：`backend/internal/modules/tasks/service.go:385-414` 对 `running` 任务也直接取消并重开 attempt。产品是否允许"运行中直接重试"未裁决，判据暂只覆盖 failed/cancelled，**待实现/待裁决**。
- `D-06` TASK-001/003 任务没有独立 HTTP 创建入口：任务只在 agent 循环里创建（`backend/internal/modules/chat/loop.go:562`、`chat/runtime.go:490`），没有 `POST /api/tasks`。因此"发起任务"的 AC 一律以会话内触发为前提，前端不能直接调接口建任务。

**已裁决（2026-11-22）**

- `Q-01` TASK-003 开始消息角色与分类：**已裁决（2026-11-22）** 开始消息取 `role="agent"`、`category="progress"`，与终态汇报同口径；消息带 `task_id`；历史 `messages` 数据不迁移，不补写也不改写。依据 Lead 2026-11-22 裁决。
- `Q-02` TASK-004 分级与确认事件类型及超时：**已裁决（2026-11-22）** 分级事件类型固定为 `complexity_classified`，确认事件类型固定为 `task_confirmed`；不设自动执行超时，未确认任务不自动执行；30 分钟未确认由前端提示，12 小时未确认在概览标「待确认超时」，两处只标记不执行。依据 Lead 2026-11-22 裁决。
- `Q-03` TASK-005 父会话概览统计口径：**已裁决（2026-11-22）** 父会话概览只统计本会话任务，子会话任务不在父层计数；父层提供「含 N 个子会话」入口，用于进入子会话查看其任务。依据 Lead 2026-11-22 裁决。
- `Q-04` TASK-002 进度刷新实现方式：**已裁决（2026-11-22）** 进度刷新走 WS 事件 `task.progress`，前端另加 5 秒兜底轮询；AC 只约束「5 秒内可见」，不约束事件与轮询的内部实现。依据 Lead 2026-11-22 裁决。
