# CHG-CONV-006 · 会话域全量交付

状态：**accepted**（2026-11-22；ACCEPT-CONV-9 已整线签字，11 covered / 1 conditional，IME 待人工；本文件只写承诺与证据锚点，是否通过以域测试计划与验收报告为准）
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003、PRD-CONV-004、PRD-CONV-005、PRD-CONV-006、PRD-CONV-007、PRD-CONV-008、PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003、PRD-SYNC-004
Covers: `AC-CONV-001-01`、`AC-CONV-001-02`、`AC-CONV-001-03`、`AC-CONV-001-04`、`AC-CONV-001-05`、`AC-CONV-002-01`、`AC-CONV-002-02`、`AC-CONV-003-01`、`AC-CONV-003-02`、`AC-CONV-003-03`、`AC-CONV-004-01`、`AC-CONV-004-02`、`AC-CONV-004-03`、`AC-CONV-005-01`、`AC-CONV-005-02`、`AC-CONV-006-01`、`AC-CONV-006-02`、`AC-CONV-007-01`、`AC-CONV-007-02`、`AC-CONV-008-01`、`AC-CONV-008-02`、`AC-CONV-008-03`、`AC-CONV-008-04`、`AC-CONV-008-05`、`AC-SYNC-001-01`、`AC-SYNC-001-02`、`AC-SYNC-002-01`、`AC-SYNC-002-02`、`AC-SYNC-003-01`、`AC-SYNC-003-02`、`AC-SYNC-004-01`、`AC-SYNC-004-02`、`AC-SYNC-004-03`
Domains: `CONV`、`SYNC`
Change: CHG-CONV-006
Owner：产品（AC 口径与覆盖映射）/ 前端（`frontend/src/app.tsx`、`frontend/src/components/library.tsx`）/ 后端（`backend/internal/modules/sessions`、`backend/internal/modules/chat`）/ 测试与验收（[`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)、[`docs/testing/ACCEPT-CONV-9-20261122.md`](../../../docs/testing/ACCEPT-CONV-9-20261122.md)）

> 关联：产品 spec [`../../product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md)；功能树 [`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯矩阵 [`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)；
> 本包提案 [`proposal.md`](proposal.md)、功能点对齐 [`product.md`](product.md)、任务卡 [`tasks.md`](tasks.md)。

## 1. 背景与问题

本包是会话域的整包交付。前五个变更包按“会话管理 / 消息与渲染 / 输入与发送 / 多标签与同步 / 右栏投影”分别收口，本包把剩余 AC 与跨域同步项合并到同一个变更里，范围是 12 个 PRD、33 条生效 AC。

本目录原本只有 `proposal.md`、`product.md`、`tasks.md`。缺少 `spec.md` 使追溯链在变更层断开：`scripts/check-trace.mjs` 的 T2 规则按 change 包的 `Implements:` 统计 PRD 引用，`PRD-CONV-008` 找不到任何引用的包，于是输出“未被任何 change 包引用”的提示。

根因是映射层缺失，不是功能缺失。右栏投影的五条 AC 在域级 test-plan 里已有用例与真机证据；但变更包没有 `Implements:` 与 `Covers:`，门禁无法把“这个包做过这件事”读出来。本文件补的正是这一层：PRD → AC → 变更级承诺 → 证据锚点。

## 2. 目标

1. 给 12 个 PRD 一个明确的变更归属，使 `PRD-CONV-008` 在全仓追溯中不再悬空。
2. 把 33 条生效 AC 逐条落到 `Covers:`，其中 `PRD-CONV-008` 的 5 条必须全部列名。
3. 把本包实际承诺的行为写成可判定的变更级 AC，每条给出代码实现、测试文件或验收报告的位置。
4. 把没有做、不能做、待人工验的部分显式登记，避免“包内全绿”的误读。

## 3. 覆盖范围

`Covers:` 覆盖 33 条 AC，按 PRD 分布如下。条数累加为 33，与 `specs/product/P1-CONV/spec.md` 的生效 AC 总数一致。

| PRD | 覆盖 AC | 条数 |
|---|---|---|
| PRD-CONV-001 会话树与主会话 | `AC-CONV-001-01`、`-02`、`-03`、`-04`、`-05` | 5 |
| PRD-CONV-002 会话生命周期 | `AC-CONV-002-01`、`-02` | 2 |
| PRD-CONV-003 搜索与未读 | `AC-CONV-003-01`、`-02`、`-03` | 3 |
| PRD-CONV-004 消息渲染 | `AC-CONV-004-01`、`-02`、`-03` | 3 |
| PRD-CONV-005 发送与停止 | `AC-CONV-005-01`、`-02` | 2 |
| PRD-CONV-006 输入法 | `AC-CONV-006-01`、`-02` | 2 |
| PRD-CONV-007 时间轴与全量消息 | `AC-CONV-007-01`、`-02` | 2 |
| PRD-CONV-008 右栏投影 | `AC-CONV-008-01`、`-02`、`-03`、`-04`、`-05` | 5 |
| PRD-SYNC-001 多端推送 | `AC-SYNC-001-01`、`-02` | 2 |
| PRD-SYNC-002 多标签同步 | `AC-SYNC-002-01`、`-02` | 2 |
| PRD-SYNC-003 输入态同步 | `AC-SYNC-003-01`、`-02` | 2 |
| PRD-SYNC-004 未读持久化 | `AC-SYNC-004-01`、`-02`、`-03` | 3 |

两条边界必须写清。`AC-CONV-002-03` 已随“不提供删除入口”的产品裁决移出验收面，本条目不覆盖。`AC-SYNC-005-01/02` 处于 blocked 登记，不在本包的验收范围，也不在 `Covers:` 里。

## 4. 变更级验收标准（AC）

编号按 `AC-<CHG-ID>-<NN>`，本包为 `AC-CHG-CONV-006-NN`。每条只写本包承诺、且仓库内已有实现或测试可定位的内容。下列锚点指向已有代码与用例，通过与否由域测试计划与验收报告判定。

### AC-CHG-CONV-006-01 · 操作失败必须可见且可恢复

判据：

1. 归档、恢复、改名、置顶请求失败时，页面级错误条可见，菜单关闭，列表不进入目标态。
2. 失败后重试成功，且不产生重复请求或半更新状态。
3. 归档成功但随后列表刷新失败时，进入可重试错误态，而不是显示已归档。

证据锚点：`frontend/src/App.operation-errors.test.tsx:49`（改名）、`:75`（归档）、`:96`（置顶）、`:114`（刷新失败）、`:133`（卡片动作）；实现 `frontend/src/app.tsx:773-784`（`toggleArchive` 的 try/catch 与 `setOpError`）、`:790-804`（置顶失败）、`:885-890`（改名）。

### AC-CHG-CONV-006-02 · 提交幂等

判据：

1. 同一 `clientMutationId` 的重试只落一条消息，响应复用首次结果。
2. 并发重试只有一次成功，其余命中“进行中”冲突而不是重复落库。
3. 幂等记录在重启后仍生效；不带 id 的旧客户端保持原有行为。

证据锚点：`backend/cmd/simo/p1_conv_chat_idempotency_test.go:58`（去重）、`:93`（不同 id 两条）、`:114`（可选 id 兼容）、`:140`（并发重试）、`:190`（WebSocket 路径）、`:232`（进行中冲突）、`:267`（重启后仍幂等）；实现 `backend/internal/modules/chat/idempotency.go:40`、`:70`、`:129`、`:143`。

### AC-CHG-CONV-006-03 · 主会话保护

判据：

1. 主会话不渲染“会话操作”菜单，前端无从发出归档请求。
2. 即使绕过前端，后端对主会话归档返回 409 与 `main_session_protected`。
3. 子会话的归档与恢复不受影响。

证据锚点：`backend/internal/modules/sessions/spec.go:299-301`（读写层硬拒绝）、`backend/internal/modules/sessions/http.go:361-365`（409 信封）；`backend/cmd/simo/p1_conv_sessions_http_test.go:557`；`frontend/src/components/library.tsx:123`、`:161`（`!isMain` 菜单守卫）；`frontend/src/components/Sidebar.test.tsx:232`（主会话无操作菜单）。

### AC-CHG-CONV-006-04 · 草稿语义

判据：

1. `draft=true` 创建的会话不落库，刷新或重启后消失。
2. 发送第一条消息后草稿物化为正式会话。
3. 草稿态在右栏显示占位说明，不进入加载、错误或空投影三态。

证据锚点：`backend/cmd/simo/m70_test.go:24`（草稿不落库后物化）；`backend/cmd/simo/m75_spec_projection_test.go:23`（草稿投影）；`frontend/src/components/RightPanel.test.tsx:35`（草稿占位优先于三态）。

### AC-CHG-CONV-006-05 · 置顶

判据：

1. 仅未归档会话可置顶，归档会话置顶返回冲突。
2. 置顶只调整同级兄弟顺序，取消后恢复原顺序，重复置顶幂等。
3. 置顶状态在重启后保留，且与扁平列表顺序一致。

证据锚点：`backend/internal/modules/sessions/pin_guard_test.go:40`（归档拒绝）、`:86`（HTTP 冲突）、`:129`（重启保留）；`backend/internal/modules/sessions/tree_order_test.go:76`、`:97`、`:117`、`:148`、`:172`；`frontend/src/App.conversation.test.tsx:104`、`:117`（置顶与取消后按钮文案）；`frontend/src/components/Sidebar.test.tsx:251`（已置顶行）。

### AC-CHG-CONV-006-06 · 未读持久化

判据：

1. agent 消息到达后会话带 `hasUnread`，列表显示未读徽标。
2. 标记已读幂等，重启后仍为已读；只影响被标记的会话。
3. 进入会话后徽标清除；未读广播连续到达时合并为一次列表刷新。

证据锚点：`backend/internal/modules/chat/unread_test.go:93`（幂等、重启、跨会话隔离）；`backend/cmd/simo/p1_conv_unread_test.go:93`；`frontend/src/App.conversation.test.tsx:222-251`（徽标与清除）、`:254`（合并刷新）；`frontend/src/components/library.tsx:161`；`frontend/src/components/Sidebar.test.tsx:222`。

### AC-CHG-CONV-006-07 · 侧栏行内消息数

判据：

1. 每条会话行显示该会话自身的可见消息数，来自后端 `messageCount`，不随选中或分页上限变化。
2. 子会话计数不含父会话消息，父会话计数不含子会话消息。
3. 列表与树返回同一口径，搜索过滤后仍一致。

证据锚点：`frontend/src/components/library.tsx:161`（`.session-count`）；`frontend/src/components/Sidebar.test.tsx:53`（主会话 75 与子会话 3 分行显示）；`frontend/src/App.integration.test.tsx:244`（消息页被截到 100 时行内数字仍取后端值）；`backend/internal/modules/sessions/counts.go:16`；`backend/internal/modules/sessions/message_count_test.go:96`（列表、搜索、树同口径）、`:168`（草稿为 0）。

### AC-CHG-CONV-006-08 · 右栏任务组补取

判据：

1. 首屏按 `taskLimit=3` 取任务组，组头显示 `已显示/总数`。
2. 总数大于已取条数时，首次展开请求 `taskLimit=50`，取回剩余条目后计数与可见条数一致。
3. 补取失败时保留已取内容并给出可重试入口，重试成功后恢复完整计数。

证据锚点：`frontend/src/components/library.tsx:1049`（`totalCount`）、`:1056`（展开触发补取）、`:1061`（`${shown}/${totalCount}`）；`frontend/src/app.tsx:431`（`loadRight`）、`:462-464`（首次展开把上限提到 50）；`frontend/src/components/RightPanel.test.tsx:59`；`frontend/src/App.integration.test.tsx:262`（首次展开 `taskLimit=50`）、`:348`（补取失败后重试恢复）。

### AC-CHG-CONV-006-09 · 停止定向到消息

判据：

1. 多条流并发时，每条流以自身 `messageId` 发送 `correct` 帧，互不串扰。
2. 点击停止只终止对应流；停止后到达的同流 delta 不再渲染，已渲染内容保留。

证据锚点：`frontend/src/App.conversation.test.tsx:445-452`（停止后新增 delta 不渲染）、`:455`（两条流各发一条 correct，`messageId` 集合为 `['stream-1','stream-2']`）；`frontend/src/app.tsx:717`（按 `message.id` 调 `stop`）；`frontend/src/api.ts:251-258`（停止帧带 messageId）；`backend/internal/modules/chat/stop_interrupt_test.go:32`（取消上游并停止 delta）。

### AC-CHG-CONV-006-10 · 投影条件请求与 304

判据：

1. 首次请求返回 200，带 `ETag` 与 `Cache-Control: no-cache`。
2. 同摘要的条件请求返回 304，body 为空，客户端复用本地投影。
3. 任务或交付物变化、`taskLimit` 不同都使 ETag 不同；非法 `taskLimit` 返回 400 `invalid_task_limit`，未知会话返回 404。

证据锚点：`backend/internal/modules/sessions/spec_projection.go:127-139`（ETag 与 304）、`:107`（404）、`:115`（400 `invalid_task_limit`）；`backend/internal/modules/sessions/spec_projection_etag_test.go:67`（稳定）、`:97`（304）、`:145`（任务变化）、`:182`（交付物变化）、`:207`（limit 区分）；`frontend/src/api.ts:73-79`（条件请求带头）；真机记录见 `docs/testing/ACCEPT-CONV-9-20261122.md`：首次 200、ETag `"spec-c5a2d772dd1d5d88"`、1375 B，条件请求 304、0 B。

### AC-CHG-CONV-006-11 · 时间轴整列命中

判据：

1. 整条 44px 轨道列都是命中区，按 `clientY` 映射到最近刻度，不按逐条热区判定。
2. 命中点落在两条刻度之间时取上一条且不跳行；越界取首末刻度。
3. 刻度自身 `pointer-events: none`，只负责视觉，不参与命中。

证据锚点：`frontend/src/components/library.tsx:698`（`nearestTickIndex`）、`:743`、`:749`（轨道事件用 `clientY`）；`frontend/src/components/components.css:1069-1076`（整列命中与刻度穿透）；`frontend/src/components/TimelineGroups.test.tsx:88`（八个偏移点）、`:112`（中点取上一条）、`:133`（越界取首末）；`frontend/src/components/ExecRowHitArea.test.tsx:120`、`:172`（44px 轨道与 20×4 穿透刻度）。

## 5. 未覆盖 / 明确不做

| 项 | 结论 | 依据 |
|---|---|---|
| 删除会话入口 | 不做 | 产品裁决不允许；`AC-CONV-002-03` 已移出验收面，前端不提供入口，后端接口保留但不作为验收项 |
| 子会话移动（换父） | 不做 | `proposal.md` 非目标；本轮只做归档、恢复、重命名与置顶 |
| `SYNC-005` | 不覆盖 | 处于 blocked 登记，`AC-SYNC-005-01/02` 不在生效验收面 |
| 真实厂商中断 | 不做 | 当前环境无厂商中断注入权限（403 限制）；只有本地取消与停止链路可测 |
| 中文输入法真实手测 | 待人工 | `AC-CONV-006-02` 保持 conditional，自动化只覆盖组合键与 `isComposing` 分支，真实 IME 需人工在中文输入法下确认 |

## 6. 六类产物状态

| 类别 | 产物 | 状态 |
|---|---|---|
| 产品 spec | [`../../product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md) | 有，12 个 PRD、33 条生效 AC |
| CHANGE | 本文件 + `proposal.md` + `product.md` | 有 |
| 前端开发 spec | 本包未单建 | 缺；契约与证据锚点写在域级 `frontend/src` 测试与本文件 §4 |
| 后端开发 spec | 本包未单建 | 缺；契约与证据锚点写在域级后端测试与本文件 §4 |
| 组件 spec | 本包未单建 | 缺；涉及组件沿用 `frontend/src/components` 既有契约 |
| 任务卡 | [`tasks.md`](tasks.md) | 有，`TASK-CHG-CONV-006-01..21` |
| 测试 spec | [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md) | 域级有；本包未单建 `test-plan.md` |
| 执行证据 | `docs/testing/ACCEPT-CONV-*.md` 与域 test-plan 执行记录 | 域级有；本包未单建 `evidence.md` |

本文件是补建的变更级 spec，不替代上表缺项的补建。`frontend.md`、`backend.md`、`test-plan.md`、`evidence.md` 的缺失按“本包未单建、由域级产物承接”记录，不写成 N/A。

## 7. 影响、风险与回滚

本文件只改文档，不改运行时代码、接口、数据与权限，部署行为零变化。

主要风险是双份口径漂移：`Covers:` 在本文件与域级 test-plan 各有一份，若后续调整 AC 只改一处，追溯会重新断开。约定以 `specs/product/P1-CONV/spec.md` 为 AC 唯一来源，本文件与域 test-plan 都从它派生；改动任一侧时同步另一侧。

回滚只需移走本文件，按仓库规则移入 `E:\dsh_home\trash\pending-delete\` 保留原路径结构，不就地删除。

## 8. 待对齐事项（不在本文件修改范围）

1. 产品 spec 仍有 8 处“状态写 covered、说明未闭环”的表述（`specs/product/P1-CONV/spec.md:103`、`:218`、`:239-250`、`:281`、`:303`、`:310-312`），与第九轮验收结论并存。
2. 域级 test-plan 的 `AC-SYNC-001-02` 锚点写在 `frontend/src/App.conversation.test.tsx:259`，实际重连断言在 `:486`，`:259` 是未读合并刷新。
3. 本包缺 `test-plan.md` 与 `evidence.md`，`check-sdd` 若扩展到变更包会报 R1；当前只影响六类产物的完整性表述，不影响 `check-trace`。
