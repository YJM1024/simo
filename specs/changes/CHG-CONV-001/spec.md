# CHG-CONV-001 · 会话管理收口

状态：进行中（2026-11-21；实现已存在，六类产物与全 AC 证据未齐）
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003
Covers: `AC-CONV-001-01`、`AC-CONV-001-02`、`AC-CONV-002-01`、`AC-CONV-002-02`、`AC-CONV-003-01`、`AC-CONV-003-02`
Change: CHG-CONV-001
变更类型：纯文档（只补契约、任务卡与证据登记，不改实现与产品 AC 文本）
Domains: `CONV`
Owner：产品（AC 口径）/ 前端（`frontend/src/app.tsx`、`frontend/src/components/library.tsx`）/ 后端（`backend/internal/modules/sessions`）
design.md：N/A：本轮只把既有实现写成契约，不引入新方案。

> 关联：产品 spec [`../../product/P1-CONV/spec.md#prd-conv-001`](../../product/P1-CONV/spec.md#prd-conv-001)；
> 域测试计划 [`../../test/P1-CONV/test-plan.md#tc-p1-001`](../../test/P1-CONV/test-plan.md#tc-p1-001)；
> 历史包 [`../CHG-LEGACY-P1-CONV/spec.md`](../CHG-LEGACY-P1-CONV/spec.md)（只读，不重命名）。
判级：变更级
创建日期：2026-11-21
关闭日期：N/A：尚未收口，关闭日期在验收签字后补记
## 1. 目标

让"会话树/主会话、会话生命周期、会话搜索与未读"三条 P1 PRD 各具备：产品 AC → 前后端契约 → 任务卡 → 用例 → 可复现证据的完整链，并**如实标注**仍缺的断言。目标是**可验收的现状描述**，不是宣称功能已完成。

## 2. 六类产物状态

| 类别 | 产物 | 状态 | 证据/位置 | 缺口 |
|---|---|---|---|---|
| 产品 spec | [`P1-CONV/spec.md`](../../product/P1-CONV/spec.md) §4.1 | 有 | `AC-CONV-001-01/02`、`AC-CONV-002-01/02`、`AC-CONV-003-01/02` | AC 目前是域级模板句，未细化到会话树/生命周期/未读的具体断言 |
| CHANGE | 本包 | 有 | 本文件 | — |
| 前端开发 spec | [`frontend.md`](frontend.md) | 有 | Sidebar/app.tsx 契约与失败路径 | 组件级交互细节依赖 `library.tsx` 实现，未登记独立 COMP |
| 后端开发 spec | [`backend.md`](backend.md) | 有 | sessions 路由 + 服务契约 | 未读/已读游标**无后端契约**（无实现） |
| 组件 spec | — | N/A | 会话树/Sidebar 在 `frontend/src/components/manifest.json` 已登记（Sidebar），但无 `specs/COMP-*` 契约 | 新增 COMP 属新变更，不在本轮 |
| 任务卡 | [`tasks.md`](tasks.md) | 有 | TASK-CHG-CONV-001-01..06 | 任务均未派发执行 |
| 测试 spec / 用例 | [`test-plan.md`](test-plan.md) + 域计划 TC-P1-001/002/003 | 有 | Sidebar 9/9、后端 sessions/M4/M6/M70/M14/UI1、E2E 01a | 见 §4 缺口表 |
| 执行证据 | [`evidence.md`](evidence.md) | partial | `docs/testing/EVIDENCE-20261120.md`、`BACKEND-EVIDENCE-20261120.md` | 失败路径、主会话不可归档、未读跨标签 = `missing` |

**结论：六类齐全（组件按 N/A 处理），但全 AC 证据不齐 → 覆盖状态保持 `partial`，不升级 `covered`。**

## 3. 行为契约（现状基线，2026-11-21 实查）

### 3.1 CONV-001 会话树与主会话

- 列表：`GET /api/sessions` 返回 `{sessions, tree}`；前端 `listSessions()`（`frontend/src/api.ts:27`）**不接受任何查询参数**。
- 树：后端 `GET /api/sessions/tree`；`GET /api/sessions?q=` 标题搜索与 `pinned=true/false` 过滤已实现并有后端测试（`TestUI1SessionSearchAndPin`），**前端未接线**。
- 主会话：`main` 为默认根；`app.tsx:541` 新建子会话时 `parentId = root?.id ?? 'main'`。
- 选中：Sidebar 点击/Enter 选中并切会话（`frontend/src/components/library.tsx:50`，`onSelect`）；E2E 01a 断言首屏左侧会话列表结构。
- 未列 AC 的边界：**主会话不可归档**只在实现层由后端门禁约束（`TestM6CanArchiveGateBlocksRunningTask` 覆盖"运行中任务"门禁），没有"主会话"专项断言。

### 3.2 CONV-002 会话生命周期

- 创建：`POST /api/sessions`；草稿态 `TestM70DraftNotPersistedThenMaterialized` / `TestM70RestartCleansEmptySessions` / `TestM70RestartDraftDisappears`。
- 重命名：`PATCH /api/sessions/{id}`；前端双击进入编辑，Enter 提交、Escape 取消（Sidebar 用例 3）。
- 归档/恢复：`POST /api/sessions/{id}/archive|unarchive`；归档后只读、聊天 WS 拒绝（`TestM6ArchiveReadonlyAndUnarchive`、`TestM6ArchivedChatWSReturnsErrorNotReply`）。
- 删除：`DELETE /api/sessions/{id}` 后端存在；**前端无删除入口**（不入本包验收，记录为能力差）。
- 归属：`GET/PUT /api/sessions/{id}/owner`（`TestUI1AgentsAndSessionOwner`）。

### 3.3 CONV-003 搜索与未读

- 前端"搜索"= **消息全文搜索**：`searchMessages(q)` → `/api/messages/search?q=`，后端 `handleMessageSearch` 默认 `sessionId=defaultSessionID('main')`、`includeChildren=false`、`LIKE %q%`、`LIMIT 50`；前端用命中 `sessionId` 集合过滤左栏（`frontend/src/app.tsx:353-364`）。
- 会话标题搜索（`/api/sessions?q=`）后端已实现且已测，前端**未接线** → 产品 spec 的"会话搜索"与实现语义不一致。
- 未读：仅 `frontend/src/app.tsx` 内存态 `unread`（96 行）；累加于 214 行（非贴底时新消息到达），清零于 167/239/400 行；只体现为"回到底部 · N 条新消息"按钮（656 行）。**无 Sidebar 未读徽标、无后端未读/已读游标**（后端 grep `unread|read_cursor|lastRead|last_read|notification` 零匹配）。
- 已读游标：`tabsync.ts` 的 `read_cursor_changed` 仅在标签间广播内存游标（`app.tsx:171` 发布、`239` 消费），刷新即失。

## 4. AC 证据与缺口

| AC | 直接证据 | 状态 | 缺口 |
|---|---|---|---|
| `AC-CONV-001-01` 主路径 | Sidebar 用例 1/2（渲染+选中）；后端 `TestTreeCreateRenameAndDescendants`、`TestM4SessionTreeAndRenamePersistAcrossRestart`、`TestM14SessionPathMultiLevel`；E2E 01a | 有证据 | 无"选中后中栏消息区随会话切换"的 E2E 断言 |
| `AC-CONV-001-02` 空/加载/错误/权限 | Sidebar 用例 7（empty/loading/error/retry）、8（stats 失败不造假 0） | 部分 | 主会话不可归档无独立断言；权限面本地单用户无鉴权 UI，标 N/A 但需在 AC 注解 |
| `AC-CONV-002-01` 主路径 | Sidebar 用例 3/4/9；后端 M4/M6/M70 | 有证据 | 删除入口缺失未在 AC 说明 |
| `AC-CONV-002-02` 异常/边界 | 归档只读 + WS 拒绝（后端） | 部分 | 创建/重命名/归档**失败反馈**（409/网络错误）无前端断言 |
| `AC-CONV-003-01` 主路径 | Sidebar 用例 5/6（搜索、无匹配、服务端 ids、搜索中）；后端 `TestUI1SessionSearchAndPin` | 部分 | 前端走的是消息搜索而非会话标题搜索，语义未对齐 |
| `AC-CONV-003-02` 异常/边界 | 搜索 catch → 空集合（`app.tsx:360`） | 部分 | 未读计数/已读游标无任何测试；跨标签未测 |

### 4.1 判据映射

- `AC-CONV-001-01` → `scripts/ac/AC-CONV-001-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-CONV-001-02` → `scripts/ac/AC-CONV-001-02.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-CONV-002-01` → `scripts/ac/AC-CONV-002-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-CONV-002-02` → `scripts/ac/AC-CONV-002-02.mjs`，脚本存在，本轮未运行；失败反馈的前端断言同时记 `missing`。
- `AC-CONV-003-01` → `scripts/ac/AC-CONV-003-01.mjs`，脚本存在，本轮未运行，结果记 `evidence.md`。
- `AC-CONV-003-02` → `scripts/ac/AC-CONV-003-02.mjs`，脚本存在，本轮未运行；未读/游标仍无实现，结论不升级。

## 5. 需求（R）

- **R1**（CONV-001）会话列表与树必须可切换、可重命名；主会话的不可归档约束必须在产品 AC 中显式，并有断言。
- **R2**（CONV-002）创建/重命名/归档/恢复的主路径与失败路径都必须有可见反馈，且失败不产生重复会话。
- **R3**（CONV-003）"会话搜索"必须明确是标题搜索还是消息搜索；未读必须明确是"当前会话徽标"还是"跨会话持久未读"，两者不得混写。
- **R4** 任何"降级/未实现"能力（删除入口、未读持久化、pin UI）必须在文档中标注，不得以接口存在代替用户路径。

## 6. 验收（A）

- **A1** 六类产物齐全，且本文件 §2 的状态与 `docs/product/TRACEABILITY.md` P1 行一致（partial 不得写成 covered）。
- **A2** §3 每条契约都能在 2026-11-21 实查基线中找到对应代码行/路由/测试函数名。
- **A3** §4 每个 AC 至少一条用例映射；`missing` 项在 `evidence.md` 明确列出。
- **A4** 任务卡四要素齐全（owner/scope/AC/证据），可由另一角色直接派发。
- **A5** 不改 P2–P10、不改 `frontend/`、`backend/`、`.github/`、`deploy/`、`evals/`。

## 7. 非目标

- 不实现 pin UI、会话标题搜索接线、未读持久化、会话删除 UI。
- 不重构 Sidebar 为独立组件文件，不新增 COMP。
- 不改产品 spec 的 AC 文案（属行为变更，需另开产品或本包修订）。
- 不把任何 PRD 升级为 `covered`。

## 8. 回滚

仅文档新增：删除本目录即可回滚；产品 spec/TREE/TRACEABILITY 的引用为追加链接，移除后回到 2026-11-20 基线。

## 9. 状态与错误边界

- 列表/树加载失败时 Sidebar 显示 error 态并可重试；空列表显示 empty 态，统计失败不得用 0 冒充（`AC-CONV-001-02`）。
- 主会话（`main`）不可归档；当前只有后端对运行中任务的门禁测试，主会话专项断言记 `missing`，不写成已通过。
- 创建/重命名/归档失败（409 或网络错误）必须可见且不产生重复会话；前端断言归 `TASK-CHG-CONV-001-03`。
- 未读是前端内存态（`app.tsx:96`），刷新即失；不得当作跨会话持久未读验收（`AC-CONV-003-02`）。

## 10. 接口与数据

- `GET /api/sessions`（列表）、`GET /api/sessions/tree`、`GET /api/sessions?q=&pinned=`（标题搜索与置顶过滤，前端未接线）。
- `POST /api/sessions`、`PATCH /api/sessions/{id}`、`POST /api/sessions/{id}/archive|unarchive`、`DELETE /api/sessions/{id}`（后端存在，前端无入口）、`GET/PUT /api/sessions/{id}/owner`。
- 未读/已读游标没有后端表与接口；`tabsync` 的 `read_cursor_changed` 只在标签间广播内存值，落库方案转 `CHG-CONV-005`。

## 11. 待确认

- "会话搜索"取标题搜索还是消息搜索，产品未裁决；现状代码两者并存，前端接的是消息搜索。
- 主会话不可归档是否升级为产品 AC，需产品定稿；当前只在实现层约束。
- 未读口径（徽标粒度、已读时机、跨标签合并）转 `CHG-CONV-005`，未定前不实现。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-21：建立本包并首次登记状态。
- 2026-11-21：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

未收口：当前状态为七值口径中的一项，剩余工作与缺口见本文件
「待确认」节与 `test-plan.md` 的未覆盖清单；关闭前需补齐证据并由验收 Agent 独立签字。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。

## 12. 功能点覆盖

覆盖范围：`PRD-CONV-001`、`PRD-CONV-002`、`PRD-CONV-003`

| 功能点ID | 状态 | 覆盖它的 AC | 备注 |
|---|---|---|---|
| `PRD-CONV-001` | in | `AC-CONV-001-01`、`AC-CONV-001-02` | 会话树与主会话；入口为侧栏会话列表与主会话切换 |
| `PRD-CONV-002` | in | `AC-CONV-002-01`、`AC-CONV-002-02` | 会话生命周期；入口为侧栏行内新建、重命名、归档与恢复 |
| `PRD-CONV-003` | in | `AC-CONV-003-01`、`AC-CONV-003-02` | 会话搜索与未读；入口为侧栏搜索框与未读计数 |
