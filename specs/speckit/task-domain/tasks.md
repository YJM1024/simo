# Tasks: 任务域 P2 六点

**Input**: [spec.md](./spec.md)、[plan.md](./plan.md)
**Prerequisites**: v9 迁移已在线（`P1-CONV-009 steps, traces, batches, deps`）；`CONV-009` 已签发，不在本清单内重做。

## 说明

每步按一个实现者连续工作估算，上限 20 分钟；超过就拆成两步，不把两步塞进一条。`[P]` 表示与同组另一条可以并行，前提是两人不碰同一文件；未标 `[P]` 的按表中顺序做。

每条任务的完成判据是「代码改动 + 对应测试或脚本 + 证据路径」，三者缺一不算完成。测试没跑过的 AC 在 `analyze.md` 里保持 `missing`，不写 `pass`。

禁止项对所有任务生效：不改 `specs/product/P2-TASK/spec.md`、不改 `CONV-009` 的行为与判据、不删除或重写已有迁移、不跑 `git`、不动 `specs/speckit/task-domain/` 之外的规格文件。

## 顺序与理由

顺序固定为 001 与 002 收口 → 003 开始结束消息 → 006 预算与守卫 → 004 复杂度 → 005 子会话。

001 与 002 先做，因为任务行与进度是后面每一点的读取面。003 的消息要挂到任务行，004 的确认要在确认后生成任务行，005 的入口要按任务计数显示；读取层不稳，后面全部返工。

003 紧随其后，因为开始与结束消息是 006 的观测面。取消后 30 秒静默、重试后重新开始、重启不补写，都靠消息与事件增量断言。

006 排在 004 前，因为旧详情、旧重试、旧取消三条旧路由在计划接口引入后仍然可达，先补会话校验与状态守卫，避免确认门禁被旧路由绕过。006 的预算等待与重启恢复依赖 003 的结束消息。

004 在 005 前，因为 C3 与 C4 的子会话由 004 的计划确认创建，005 的归属、计数与跨会话拒绝都以这些子会话为输入。004 内部按「方案卡与确认接口 → 派生」两步走：T036 与 T038 只做计划创建、方案卡与确认/拒绝，确认仅翻计划状态，此时先验收确认前 0 任务 0 子会话；T039 才做派生，把 C2 任务与 C3、C4 的子会话及其任务建出来。两步分开，确认门禁的判据不会因为派生逻辑顺带满足而失去独立证据。

## Phase 0 基线与迁移

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T001 | 回读基线并落清单：v9 迁移、旧路由行号、前端 4 种状态文案、概览 2 条 | `backend/internal/modules/tasks/migrations.go`、`http.go`、`frontend/src/components/tasks.tsx`、`library.tsx` | `.tmp/task-p2/baseline.md`，每条带文件与行号 | 15m |
| T002 [P] | 迁移 v10：`tasks.complexity`、`tasks.end_message_id`，附升版测试（旧行为空） | `backend/internal/modules/tasks/migrations.go`、`migrations_test.go` | 迁移测试通过；旧任务两列为空串 | 20m |
| T003 [P] | 迁移 v11：`task_plans` 表与 `idx_task_plans_session_status`，附升版测试 | `backend/internal/modules/tasks/migrations.go`、`migrations_test.go` | 建表与索引存在；重复执行不报错 | 20m |
| T004 | 测试骨架：`scripts/ac/AC-TASK-*.mjs` 文件头与 `run-ac.mjs` 注册；Go 侧 `_test.go` 占位 | `scripts/ac/`、`scripts/run-ac.mjs` | 空跑 30 条输出 `missing`，不输出 `pass` | 15m |
| T005 | 前端测试数据补 `complexity`、`endMessageId`、`childSessionCount` | `frontend/src/components/*.test.tsx` 的 fixture | 类型检查通过，旧用例不红 | 15m |

## Phase 1 US1 任务生命周期与执行组（AC-TASK-001-01 至 06）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T006 [P] | 旧详情路由会话校验：`handleGet` 取会话，不匹配 404「任务不存在」；会话内路由复用同一校验 | `backend/internal/modules/tasks/http.go:211-233`、`conv_http.go:19` | AC-TASK-001-06 的接口断言通过，旧路由与新路由都 404 | 20m |
| T007 [P] | 列表严格按 `session_id` 过滤，默认 3 行、展开上限 50，接口返回总数 | `backend/internal/modules/tasks/http.go:17`、`conv.go:947-998`、`library.tsx:1234-1239` | AC-TASK-001-01 接口侧通过；概览 3 行 | 15m |
| T008 | 8 种存储态文案集中映射，未知状态回退原值 | `frontend/src/components/tasks.tsx:7-30` | AC-TASK-001-03 组件断言：8 条文案两两不同 | 20m |
| T009 | 任务组行数与 label 计数一致，展开上限 50 | `frontend/src/components/tasks.tsx`、`TaskPanel.test.tsx` | AC-TASK-001-01 组件断言通过 | 20m |
| T010 | 空态、加载态、500 错误态与重试（请求 1→2） | `frontend/src/components/tasks.tsx`、`TaskPanel.test.tsx` | AC-TASK-001-04、001-05 通过 | 20m |
| T011 | 详情 5 字段只读，不出现编辑/重跑/取消 | `frontend/src/components/tasks.tsx`、`TaskDetail.test.tsx` | AC-TASK-001-02 通过 | 15m |
| T012 | 补 `AC-TASK-001-01..06` 的 CDP 脚本 | `scripts/ac/AC-TASK-001-*.mjs` | 6 条脚本可跑；未通过项如实返回失败 | 20m |

## Phase 2 US2 任务概览与真实进度（AC-TASK-002-01 至 04）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T013 [P] | 新增 `task.progress` 事件，进度写入时发出，按 1 秒或 5% 节流；WS 白名单加入该事件 | `backend/internal/core/eventlog/eventlog.go`、`backend/internal/modules/tasks/service.go:442-540`、WS 转发处 | AC-TASK-002-03 的接口/事件断言通过 | 20m |
| T014 [P] | 计数按存储态分列：`statusCounts` 返回 running/queued/blocked/pending/done/failed/cancelled/interrupted，不再合并 | `backend/internal/modules/tasks/conv.go:823-840`、`backend/internal/modules/sessions/spec_projection.go:343-352` | AC-TASK-002-02 接口断言：2/1/3 与按状态查询一致 | 20m |
| T015 | 真实进度条：`role=progressbar`、`aria-valuenow`、宽度百分比；`queued` 不显示 0% 文本，`done` 显示 100 | `frontend/src/components/tasks.tsx`、TaskDetail 组件 | AC-TASK-002-01、002-03 组件断言通过 | 20m |
| T016 | 加载期骨架，DOM 不出现 `\d+%`；移除本地模拟递增 | `frontend/src/components/tasks.tsx` | AC-TASK-002-04 通过 | 15m |
| T017 | 5 秒兜底轮询补齐漏推，节流与去重 | `frontend/src/app.tsx:813-841` | AC-TASK-002-03 的界面断言：5 秒内 40% 可见 | 15m |
| T018 | 补 `AC-TASK-002-01..04` 脚本（含注入时钟） | `scripts/ac/AC-TASK-002-*.mjs` | 4 条脚本可跑 | 15m |

## Phase 3 US3 开始与结束消息（AC-TASK-003-01 至 05）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T019 | 收敛终态到 `finalizeTask`：CAS 终态、置 `end_message_id`、插结束消息；执行成功与失败两条路径接入 | `backend/internal/modules/tasks/real_executor.go:62-122`、`service.go` | AC-TASK-003-03 的接口与消息表断言通过 | 20m |
| T020 | `startAttempt` 写开始消息：事务内 CAS `queued→running`，插 `category=progress` 消息并回写 `report_message_id`；失败回滚 | `backend/internal/modules/tasks/service.go`（`startAttempt`） | AC-TASK-003-02：恰好 1 条、正文含标题、任务卡仍在 | 20m |
| T021 | 幂等与重启：重复调用不写第二条；重启 `running→interrupted` 不补结束消息 | `backend/internal/modules/tasks/service.go:118-244`、`conv.go:1208-1432` | AC-TASK-003-04 通过 | 15m |
| T022 | workflow 任务字段集对齐：结束消息带 `workflow_id`，开始消息同样带；无 workflow 时该字段为空 | `backend/internal/modules/tasks/workflow.go:447-450`、`real_executor.go` | AC-TASK-003-05 通过 | 15m |
| T023 | 前端 `category=progress` 消息渲染两种样式：开始显示标题，结束显示结论与产物名；任务卡不被替换 | `frontend/src/components/library.tsx:558-600`、`MessageItem.test.tsx` | AC-TASK-003-02、003-03、003-05 组件断言通过 | 20m |
| T024 | 异步创建时延：`POST /api/sessions/{id}/tasks` 1 秒内返回且不阻塞后续消息 | `backend/internal/modules/tasks/conv_http.go:15-25`、`conv.go:584-751` | AC-TASK-003-01：创建后立即发消息返回 200 | 10m |
| T025 | 补 `AC-TASK-003-01..05` 脚本，含消息表与 `reportMessageId`/`endMessageId` 断言 | `scripts/ac/AC-TASK-003-*.mjs` | 5 条脚本可跑 | 20m |

## Phase 4 US6 取消、重试与预算守卫（AC-TASK-006-01 至 07）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T026 | `Retry` 状态守卫：只允许 failed/cancelled/interrupted；旧路由与新路由共用；`running` 返回 409 且 `attempt` 不变 | `backend/internal/modules/tasks/service.go:386-415`、`conv.go:1468-1536`、`http.go:22` | AC-TASK-006-04：两条路径都 409 | 15m |
| T027 | 取消：5 秒窗、终态幂等（状态与 `updatedAt` 不变）、清等待原因；旧取消路由共用 | `backend/internal/modules/tasks/conv.go:1208-1432`、`http.go:21` | AC-TASK-006-01、006-02 通过 | 20m |
| T028 | 取消后 30 秒静默：终态后拦截消息与产物写入 | `backend/internal/modules/tasks/conv.go`、`service.go` | AC-TASK-006-03 通过，用注入时钟推进 30 秒 | 15m |
| T029 | 重试保留产物与 id，重置进度与 summary，不重建产物目录 | `backend/internal/modules/tasks/service.go:385-415` | AC-TASK-006-05 通过 | 10m |
| T030 | 预算用量真实化：删除 `runtime.go:305` 固定 200000/used 0；`BudgetJSON` 记 `usedTokens`、`usedSteps` | `backend/internal/modules/chat/runtime.go:305`、`backend/internal/modules/tasks/real_executor.go:102-119` | AC-TASK-006-06：触顶停在 `running` + `resource` + `budget_exceeded` | 20m |
| T031 | 预算恢复：清等待与结果字段、从暂停点续跑、`attempt` 不变；等待中取消后恢复返回 409 | `backend/internal/modules/tasks/conv.go:1672-1728`、`real_executor.go` | AC-TASK-006-06 补充场景通过 | 15m |
| T032 | 重启恢复：`queued` 重新排队（按 §7 待核定案），`running` 转 `interrupted`，无悬挂运行态 | `backend/internal/modules/tasks/service.go:118-244` | AC-TASK-006-07 通过 | 20m |
| T033 | 补 `AC-TASK-006-01..07` 脚本（含重启脚本与时钟推进） | `scripts/ac/AC-TASK-006-*.mjs` | 7 条脚本可跑 | 20m |

## Phase 5 US4 复杂度分级与确认门禁（AC-TASK-004-01 至 04）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T034 [P] | 分类器：按 `docs/task-complexity.md` 输出 C0–C4，闭集校验，结果写 `tasks.complexity` 或计划行 | 新建 `backend/internal/modules/tasks/complexity.go`、`complexity_test.go` | AC-TASK-004-01：5 条请求覆盖 C0–C4 | 20m |
| T035 [P] | `task_plans` 存储与状态机：pending/confirmed/rejected/expired，`child_session_ids` 读写 | 新建 `backend/internal/modules/tasks/plan.go`、`plan_test.go` | 状态迁移测试通过；重复确认幂等 | 20m |
| T036 | 计划创建与确认/拒绝接口：创建立 `pending` 并写 1 条 `category=confirmation` 方案消息（记 `plan_message_id`）；确认与拒绝只改计划状态，不派生任务与子会话；重复确认幂等，已拒绝再确认 409 | 新建 `backend/internal/modules/tasks/plan_http.go`、`plan.go`、路由注册处 | AC-TASK-004-01、004-02 接口断言：确认前任务 0、子会话 0、方案卡 1 条 | 20m |
| T037 | 事件 `complexity_classified`、`task_confirmed` 各一条，带计划 id 或任务 id | `backend/internal/core/eventlog/eventlog.go`、`plan.go` | AC-TASK-004-04 通过 | 15m |
| T038 | 前端确认卡：复杂度标签、确认后将建数量、确认/拒绝按钮；确认前不出现任务卡与子会话；30 分钟提示与 12 小时「待确认超时」 | `frontend/src/components/library.tsx`、MessageItem 确认分支 | AC-TASK-004-02 界面断言通过；时钟推进不真实等待 | 20m |
| T039 | 计划派生 `materializePlan`：确认后在一个事务内派生，C2 当前会话建 1 条任务；C3 建 1 个子会话并在其中建 1 条任务；C4 建 3–4 个子会话、每个子会话各建任务；父级 0 任务；`child_session_ids` 落库；重复派生幂等 | `backend/internal/modules/tasks/plan.go`、`backend/internal/modules/sessions/service.go:106-127` | AC-TASK-004-01、004-03、005-01 数据断言通过 | 20m |
| T040 | 补 `AC-TASK-004-01..04` 脚本（注入时钟） | `scripts/ac/AC-TASK-004-*.mjs` | 4 条脚本可跑 | 20m |

## Phase 6 US5 子会话与任务归属（AC-TASK-005-01 至 04）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T041 [P] | `childSessionCount` 与 `childSessionIds` 进详情与投影；新增 `GET /api/sessions/{id}/children` | `backend/internal/modules/sessions/spec_projection.go:343-352`、会话 HTTP 层 | AC-TASK-005-02 接口断言：父 1 条、入口计数 1 | 15m |
| T042 [P] | 父列表排除子任务；以父身份读子 `/files`、`/tasks` 被拒且响应不含子任务 id/标题 | `backend/internal/modules/tasks/conv.go:947-998`、`backend/internal/modules/sessions/` 文件路由 | AC-TASK-005-01、005-03 通过 | 20m |
| T043 | 归档父会话不级联：子任务仍 200、`sessionId` 不变 | `backend/internal/modules/sessions/`、`backend/internal/modules/tasks/conv.go` | AC-TASK-005-04 通过 | 10m |
| T044 | 前端父层「含 N 个子会话」入口，N>0 启用，点开列直接子会话 | `frontend/src/app.tsx:1521`、`frontend/src/components/library.tsx` | AC-TASK-005-02 组件断言通过 | 20m |
| T045 | 补 `AC-TASK-005-01..04` 脚本 | `scripts/ac/AC-TASK-005-*.mjs` | 4 条脚本可跑 | 15m |

## Phase 7 收尾

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T046 | 全量回归：Go 测试、vitest、CDP 脚本一次跑完；`CONV-009` 的 18 条 AC 回归 | 全仓测试命令 | 回归结果落 `.tmp/task-p2/regression.log`，失败项列表 | 20m |
| T047 | 迁移演练：v9 库升 v10、v11，旧任务字段为空，新任务可写；回滚只回代码不删列 | 迁移测试与演练脚本 | 演练记录与前后 schema | 15m |
| T048 | 回填 `analyze.md`：31 条 AC 的脚本状态、证据路径、仍未验证项 | `specs/speckit/task-domain/analyze.md` | 每条 AC 有 `pass`/`missing`/`manual` 三态之一 | 15m |
| T049 | 独立验收：抽 5 条关键 AC 复跑，专测旧路由绕过（旧详情、旧重试、旧取消） | 对应脚本与路由 | 验收记录，未通过项回原实现者 | 20m |

## Phase 8 DEC-43 补卡（US3，AC-TASK-003-06）

| ID | 任务 | 主要文件 | 验收/产出 | 估时 |
|---|---|---|---|---|
| T050 | C0/C1 直答路径（DEC-43，US3，AC-TASK-003-06）：`delegate` 对 C0/C1 直接回答，不落任务、不出方案卡；C2–C4 先落 1 张方案卡；`complexity_classified` 带等级与可解释理由 | `backend/internal/modules/chat/loop.go`、`backend/internal/core/task/complexity.go`、`backend/internal/core/task/plan_request.go`、`backend/internal/modules/tasks/plan.go`、`scripts/ac/AC-TASK-003-06.mjs` | AC-TASK-003-06 通过：C0 与 C1 各发一次，任务 0 条、方案卡 0 张、无子会话、助手消息 `done` 且正文非空，`complexity_classified` 各 1 条并带判定理由；证据 `.tmp/ac/AC-TASK-003-06.json` | 20m |

## 并行与依赖

可并行组共 5 组、10 条任务：

- G1：T002 与 T003（两个迁移，改同一文件的不同位置，需约定插入顺序，仍建议同人连做以免冲突）。
- G2：T006 与 T007（旧详情校验与列表过滤，不同文件）。
- G3：T013 与 T014（事件与计数，不同文件）。
- G4：T034 与 T035（分类器与计划存储，新文件各一个）。
- G5：T041 与 T042（子会话计数与跨会话拒绝，不同模块）。

其余任务按表内顺序串行。同一文件的多条任务（`tasks.tsx` 的 T008 至 T011、T015 至 T016；`service.go` 的 T019 至 T021、T026 至 T030）不并行。

依赖关系：T019 依赖 T020 的状态 CAS 约定；T023 依赖 T019、T020 的消息落库；T036 依赖 T035 的表；T037 依赖 T036 的计划落库；T038 依赖 T036 的方案消息与 T037 的事件；T039 依赖 T036 的确认接口与 T038 已验收的确认前零副作用；T044 依赖 T041 的计数；T046 依赖全部；T050 依赖 T034 的分类器与 T036 的计划卡接口，排在 T049 之后，是 DEC-43 收口后的补卡，它改 `plan.go`，与 T035、T036、T039 同文件，不标 `[P]`。

## 完成判据

- 每条任务有代码改动、对应测试或脚本、证据路径三样。
- 对应 AC 的脚本跑过才算 `pass`，没跑或没写记 `missing`，只有确实无法自动化的记 `manual` 并写清人工判据。
- 旧路由绕过测试在 T049 必须覆盖，三条旧路由各一条用例。
- 全量回归中 `CONV-009` 的 18 条 AC 不红，否则本批不算收口。
