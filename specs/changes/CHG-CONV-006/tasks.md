# CHG-CONV-006 · 任务卡

状态：**draft**（W1-01/02 已由本角色落盘；其余待 review 后派发）
Implements: `PRD-CONV-001`–`008`、`PRD-SYNC-001`–`004`（12 个；`SYNC-005` 排除）
派发规则：每张卡四要素齐全（owner / scope / AC / 证据）才可派发；缺一退回。实现者不得给自己的视觉/功能签字。

## 波次总览

| 波次 | 主题 | 入口 | 出口 |
|---|---|---|---|
| W1 | 产品口径与规格骨架 | 用户 review 本包 proposal/product | 六条口径成为 AC；五列分节模板定稿 |
| W2 | 证据补口与 COMP 签收 | W1 出口 | 31 条生效 AC 全部有 TC 映射；组件/前端/后端证据可复现 |
| W3 | 设计/前端/后端三列 Spec | W1 出口（可与 W2 并行） | 三列文件按功能点分节、与实现对齐 |
| W4 | 行为变更实现 | W2 的用例先红 | 主会话守卫、标题搜索、持久化读游标、008 证据；删除/子会话移动不纳入 |
| W5 | 部署验证与覆盖回写 | W4 出口 | 8787 重建走查；**12 个 PRD covered + SYNC-005 gap**（删除/移动为显式非目标，不计缺口）；台账回写 |

## W1 · 产品口径与规格骨架

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-CHG-CONV-006-01` | 六条口径落 AC + 新增 PRD-CONV-008 | 产品 | `specs/product/P1-CONV/spec.md` §2.1/§2.2/§3/§4/§5/§6/§7；`specs/changes/CHG-CONV-006/product.md`；删除只进 §2.1 非目标 + backlog，不建 AC | 无 | `AC-CONV-001-03`、`001-04`、`003-03`、`004-03`、`008-01..04`、`SYNC-004-01..03` | 本包落盘；`Select-String` 能检索到 10 个生效 AC（无删除 AC）；`Get-Content spec.md` 行数变化 | `done`（待 review） | 验收 Agent | 只改 specs 内本行 scope 文件；不跑 git；不删除文件；不改 AC 文本 |
| `TASK-CHG-CONV-006-02` | 12 PRD 对齐与状态基线 | 产品 | `product.md` §2 表；`docs/product/TREE.md` P1 节 | 01 | 12 行逐条含“场景/AC 增量/落点”；前→后状态表 | 表内 12 个 ID 与 spec 一致；TREE 13 行（12 + SYNC-005） | `done`（待 review） | 验收 Agent | 只改 product.md 与 TREE.md P1 节；不跑 git；不动 P2–P10 |
| `TASK-CHG-CONV-006-03` | 五列 Spec 分节模板与缺口登记 | 产品 | `specs/design/P1-CONV/spec.md`、`specs/frontend/P1-CONV/spec.md`、`specs/backend/P1-CONV/spec.md` 的骨架；`docs/plan/MASTER-PLAN.md` §1.7 执行态 | 01 | 包级 `DoD-2`（proposal §4） | 三个文件存在且含“按功能点 ID 分节”表头；`node scripts/check-sdd.mjs` 退出码 0 | `ready` | 验收 Agent | 只改三列 spec 与 MASTER-PLAN §1.7；不跑 git；不挪已有章节 |

## W2 · 证据补口与 COMP 签收

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-CHG-CONV-006-04` | test-plan 映射生效 AC | 测试 | `specs/test/P1-CONV/test-plan.md` §2/§3 | 01 | 全部生效 AC（删除为非目标，不建用例） | 每条生效 AC 有 `TC-*` 编号与用例路径；`<node> scripts/check-trace.mjs` 退出码 0；14 条原 missing/partial 更新为 pass 或仍 missing（不得写“通过”） | `ready` | 验收 Agent | 只改 test-plan §2/§3；不写“通过”替代 missing；不跑 git |
| `TASK-CHG-CONV-006-05` | 前端证据补齐（含置顶与持久化读游标） | 前端 | `frontend/src/**/*.test.tsx`、`frontend/src/api.ts`、`frontend/src/components/library.tsx`、`frontend/src/app.tsx` | 04（证据回填） | 001-01/02/03/04、002-02、003-03、004-03、SYNC-004-01/02/03、008-01/02 | `cd frontend; pnpm test` 全绿；`pnpm typecheck` 退出码 0；E2E `pnpm test:e2e` + `pnpm test:e2e:cdp` 19/19×2；置顶菜单/取消置顶、主会话与草稿不显示、排序以服务端为准；刷新/重启后未读正确 | `ready` | 验收 Agent | 只改 frontend/src 与测试；不跑 git；不删除用例；断言失败须如实记录 |
| `TASK-CHG-CONV-006-06` | 后端证据补齐 | 后端 | `backend/internal/modules/sessions/**`、`backend/cmd/simo/*_test.go` | 04 | 001-03、003-03、SYNC-001-02、SYNC-002-02、SYNC-004-03 | `cd backend; ..\toolchain\go.ps1 test ./...` 全绿；新增用例断言标题搜索含子会话、`since` 窗口、`opId` 去重、`clientMutationId` 幂等、读游标持久化/多标签共享 | `ready` | 验收 Agent | 只改 backend 包与测试；不跑 git；不改产品 AC；不隐藏失败 |
| `TASK-CHG-CONV-006-07` | 5 个 COMP 签收或降级 | 设计 | `specs/COMP-message-colors/spec.md`、`COMP-timeline-groups`、`COMP-timeline-tip`、`COMP-composer-send-mode`、`COMP-message-cards`（以实际 5 个为准） | 04 | 004-01/02、006-01/02、007-01/02、SYNC-003-01 | 每份 COMP 状态改为 `accepted`（或写明“实现偏离 spec + 回写清单”）；附 parity 截图/记录路径 | `ready` | 验收 Agent | 只改 5 份 COMP spec；不伪造 parity 截图；不跑 git |

## W3 · 设计 / 前端 / 后端三列长期 Spec

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-CHG-CONV-006-08` | 设计列 | 设计 | `specs/design/P1-CONV/spec.md` | 03 | 12 个功能点的交互/状态/尺寸/键盘/三档断点 | 文件按功能点 ID 分节；每条与 `RightPanel.test.tsx`、`Composer.test.tsx` 的断言可对照；不写不可验证的“美观” | `waiting`（等 W1-03） | 验收 Agent | 只改 design spec；不写不可验证的“美观”；不跑 git |
| `TASK-CHG-CONV-006-09` | 前端列 | 前端 | `specs/frontend/P1-CONV/spec.md` | 03 | 12 个功能点的组件/状态/接口/降级 | 文件按功能点分节；列出真实组件（`Sidebar`/`MessageItem`/`Composer`/`TimelineGroups`/`OverviewPanel`）与 props；`pnpm test` 可复现 | `waiting`（等 W1-03） | 验收 Agent | 只改 frontend spec；不越写后端契约；不跑 git |
| `TASK-CHG-CONV-006-10` | 后端列 | 后端 | `specs/backend/P1-CONV/spec.md` | 03 | 12 个功能点的路由/表/错误码/幂等 | 文件按功能点分节；每个错误码（`archive_blocked`、`main_session_protected`、`invalid_task_limit`）在代码中可 grep 到；`R4_CONFIRM_REQUIRED` 标为删除非目标的保护性 403，不作为待补功能 | `waiting`（等 W1-03） | 验收 Agent | 只改 backend spec；不改实现代码；不跑 git |

## W4 · 行为变更实现

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-CHG-CONV-006-11` | 主会话不可归档 | 后端 + 前端 | `backend/internal/modules/sessions/spec.go`（`CanArchive`/`Archive`/`Unarchive`）、`frontend/src/components/library.tsx`、`frontend/src/app.tsx`；改 `App.conversation.test.tsx:107-120`、`m81_all_messages_test.go:85` 的旧断言 | 05、06（同批改旧用例） | `AC-CONV-001-03` | 后端：`POST /api/sessions/main/archive` → 409 `main_session_protected`；子会话归档仍 200；`POST /api/sessions/main/unarchive` → 200 no-op。前端：主会话菜单无“归档”；`pnpm test`/`go test` 全绿 | `ready` | 验收 Agent | 只改 sessions 包与前端组件/测试；不跑 git；不得只改一端 |
| `TASK-CHG-CONV-006-12` | 删除会话（显式非目标，backlog） | 后端 + 前端 | `sessions/http.go`（`handleDelete`）、`sessions/service.go`、`frontend/src/components/library.tsx`、`frontend/src/app.tsx`（**不派发，仅存档**） | 不派发（parked） | 无 AC（显式非目标，backlog `REQ-CONV-002-03`） | 不建本轮证据；后端固定 403 `R4_CONFIRM_REQUIRED`（`http.go:68-69`）是保护性占位，UI 不暴露；后端 spec 待办补断言钉住 403；确认令牌/级联/事务留待后续新 CHG | `parked`（backlog，不派发） | 验收 Agent | 不派发、不实施删除；只保留 backlog 记录；不跑 git |
| `TASK-CHG-CONV-006-13` | 标题搜索接 UI | 前端 | `frontend/src/app.tsx:360-372`、`frontend/src/components/library.tsx:119-125,135-139` | 05 | `AC-CONV-003-03` | 集成用例：仅在子会话标题命中也显示；`q=` 空恢复全量；失败有提示。E2E：输入标题关键词命中；`Invoke-RestMethod "http://127.0.0.1:8787/api/sessions?q=<词>"` 返回含子会话 | `ready` | 验收 Agent | 只改 app.tsx 与 library.tsx 及测试；不跑 git；不改后端 |
| `TASK-CHG-CONV-006-14` | 会话级持久化读游标 | 前端 + 后端（先后端后前端） | `frontend/src/app.tsx`（`unread` 状态）、`frontend/src/components/library.tsx`、`frontend/src/tabsync.ts`；`backend/internal/modules/sessions/**`（新增读游标表/接口/迁移） | 06 | `AC-SYNC-004-01/02/03` | 用例：新消息非 active→未读点；进入会话→写已读并清零；A 标签已读→B 标签清零；刷新/重启读回正确；无全站数字；后端迁移与接口测试全绿 | `ready` | 验收 Agent | 只改前端未读状态与后端游标表/接口；不跑 git；迁移串行执行 |
| `TASK-CHG-CONV-006-15` | 右栏 008 证据与边界 | 前端 + 后端 | `frontend/src/components/library.tsx:684-732`、`RightPanel.test.tsx`、`backend/internal/modules/sessions/spec_projection.go` | 04、06 | `AC-CONV-008-01..04` | `taskLimit=0/51` → 400；不存在会话 → 404；`If-None-Match` → 304；`messageId` 定位闪烁；`data-session` 不伪造；E2E 01a/06 截图 | `ready` | 验收 Agent | 只改右栏投影相关文件；不跑 git；不改 ETag 语义之外的接口 |
| `TASK-CHG-CONV-006-21` | 会话行消息数按自身口径 + 右栏任务组展开补取 | 前端 | `frontend/src/components/library.tsx`、`frontend/src/app.tsx`、`frontend/src/api.ts`、`frontend/src/components/Sidebar.test.tsx`、`frontend/src/components/RightPanel.test.tsx` | 05 | `AC-CONV-001-05`、`AC-CONV-008-05` | 行内数字等于该会话自身消息数（不含子会话、不取全局统计），底部汇总仍为全局且不随选中切换；构造 `done.total=6/items=3`、`pending.total=4/items=3`，展开后条目数等于 `total` 且组头计数与可见一致；补取失败可见错误并可重试；`cd frontend; pnpm test` 与 `pnpm typecheck` 全绿 | `ready` | 验收 Agent | 只改会话行计数与任务组补取相关文件；不跑 git；不改后端口径 |

> 2026-11-22 Lead 追加两条口径，由 `TASK-CHG-CONV-006-21` 承接：`AC-CONV-001-05`（行内消息数按会话自身计、底部汇总报全局）、`AC-CONV-008-05`（任务组 `total` 大于首屏 3 条时展开必须补取，计数与可见一致）。

> 本阶段显式不做：删除 UI（显式非目标，backlog `REQ-CONV-002-03`）、子会话移动/换父（产品 §2.1 非目标）。
> 置顶不新造卡：并入 `TASK-CHG-CONV-006-05`（前端接线与证据），状态 `ready`；主会话、草稿、归档不提供，排序以后端返回为准。

## W5 · 部署验证与覆盖回写

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| `TASK-CHG-CONV-006-16` | 重建可执行文件 | 后端 | `backend/simo-live-final5.exe`（产物，不入库）；构建命令 | 11–15 | 包级 `DoD-3` | `cd backend; ..\toolchain\go.ps1 build -o simo-live-final5.exe ./cmd/simo` 退出码 0；`Get-Item` 时间戳晚于当轮前端构建；记录 SHA256 | `waiting`（等 W4） | 验收 Agent | 只产出 exe 并记录哈希；不入库产物；不跑 git |
| `TASK-CHG-CONV-006-17` | 8787 功能走查 A1–A8 | 验收 | `docs/testing/CONV-006-8787-<日期>.md` | 16 | `A1`–`A8` | 隐藏窗口启动：`Start-Process .\simo-live-final5.exe -ArgumentList 'serve','-addr','127.0.0.1:8787' -WindowStyle Hidden -RedirectStandardOutput <log>`；逐条记录请求/截图/帧路径；curl 不可靠时用 `Invoke-RestMethod` 或 node 脚本 | `waiting`（等 16） | 验收 Agent | 只写 docs/testing 走查记录；隐藏窗口启动，不弹黑框；不跑 git |
| `TASK-CHG-CONV-006-18` | 8787 视觉三档走查 | 验收（用户签视觉） | 375/768/1280 截图；右栏、Composer、时间轴、未读点/归档反馈 | 17 | `A3`/`A4` | 每档不横向溢出、不遮挡主操作；截图存 `docs/testing/conv006-visual/`；用户签字记录 | `waiting`（等 17） | 验收 Agent | 只存截图与签字记录；不改代码；不跑 git |
| `TASK-CHG-CONV-006-19` | 覆盖判定与台账回写 | 产品 + 测试 | `docs/product/TRACEABILITY.md` P1 行、`CONV-CLOSURE.md`、`TREE.md` P1 | 17、18 | **12 个 covered**；SYNC-005 `gap` | TRACEABILITY 12 行 `covered` + 1 行 `gap`；脚注写明删除/移动为显式非目标、不计缺口；`<node> scripts/check-trace.mjs` 退出码 0；TREE 状态列与覆盖列一致 | `waiting`（等 17/18） | 验收 Agent | 只改 TRACEABILITY/TREE/CONV-CLOSURE；不跑 git；不虚报 covered |
| `TASK-CHG-CONV-006-20` | 文档漂移修正 | 产品 | `docs/product/SPEC-GAP.md:50-54`（“CONV 产品 spec 待建”已过期）、`docs/plan/MASTER-PLAN.md` P1 执行态 | 无 | 包级 `DoD-4` | diff 只改过期陈述，不动 P2–P10；`Select-String '待建' SPEC-GAP.md` 不再指向 P1 | `ready` | 验收 Agent | 只改 SPEC-GAP 过期行与 MASTER-PLAN；不跑 git；不动 P2–P10 |

## 后端 follow-up（不属本包实现，交后端 owner）

> 只登记，不在本包改后端代码或测试；用于消除“读起来像会话可移动/可删除”的文档漂移。

| # | 事项 | 现状/证据 | 要求 |
|---|---|---|---|
| F-01 | `docs/session-core-spec.md:22` 写“创建/移动后 tree 正确” | 与产品 §2.1“子会话不可移动/换父（显式非目标）”冲突 | 改为“创建后 tree 正确；移动/换父为产品显式非目标”，不实现移动 |
| F-02 | `backend/internal/modules/sessions/service_test.go:97-106` 用直接 SQL 改 `parent_id` 造环 | 是 tree 防环单测，不是移动 API；易被读成“已有移动能力” | 改名/加注释明确“仅测 tree 不死循环，不覆盖移动接口” |
| F-03 | `backend/internal/core/action/action.go:55` 定义 `session.move` | `backend/internal/modules/chat/actions.go` 无 `session.move` 分支；`http.go:24` 的 PATCH 只调 `handleRename`；前端无入口 | 删除该动作声明或标 `planned`；不得对外宣称可移动 |
| F-04 | `DELETE /api/sessions/{id}` 固定 403 `R4_CONFIRM_REQUIRED` | `backend/internal/modules/sessions/http.go:68-69`；产品已标显式非目标 | 后端 spec 已标“保护性占位”；补一条断言钉住任何 id 都 403，防止误开；不实现删除 |

## 其他 owner follow-up（只登记，不越权改）

| # | 事项 | 现状/证据 | owner / 要求 |
|---|---|---|---|
| F-05 | `specs/test/P1-CONV/test-plan.md` 仍把 `AC-CONV-002-03` 当验收条 | L103、L234、L614、L636、L664 共 5 处；TC-P1-CONV-007 仍按删除设计 | 测试 owner：改为 `REQ-CONV-002-03` backlog 或删除该 TC，不建删除用例 |
| F-06 | `specs/design/P1-CONV/spec.md` 仍有删除确认视觉项 | L202-204、L680 共 4 处引用 `AC-CONV-002-03` | 设计 owner：删除确认弹窗/危险按钮/提交中去重三项移出本阶段视觉验收；归档菜单保留 |

## 依赖与并行

- W2 的 04 依赖 01（AC 编号）；05/06 可与 04 并行，但“证据”以 04 的 TC 编号回填。
- W4-11 必须与 05/06 的旧用例改造同批，避免“实现改了、测试还断言旧行为”。
- W4-12 已 `parked`，不派发；保留依赖记录仅为后续新 CHG 参考，不与 11 同批改测试。
- W3 与 W2 可并行；W3 的“与实现对齐”以 W4 完成后为准，故 W3 出口放在 W5 前复核一次。
- W5-16 必须在 W4 全部合入后构建；否则重演“exe 早于前端修复”的问题。

## 回滚

- 文档卡（01–04、07–10、19–20）：按文件 revert。
- 行为卡（11–15）：11/13/14/15 每卡一个 commit 粒度（本包不 commit，由实现 owner 执行）；12 已 `parked`、不实施；11 涉及测试断言变更，回滚时连同测试一起回退，不得只回退实现留下“测试通过但行为旧”的假绿。
- 部署卡（16–18）：保留上一版 exe 与走查记录；新 exe 仅在 17/18 通过后替换 8787 运行文件。
