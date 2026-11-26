# SPEC · CHG-LEGACY-P1-CONV

Covers: AC-P1-01、AC-P1-02、AC-P1-03、AC-P1-04、AC-P1-05、AC-P1-06、AC-P1-07（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-CONV-001, PRD-CONV-002, PRD-CONV-003, PRD-CONV-004, PRD-CONV-007, PRD-CONV-005, PRD-CONV-006, PRD-SYNC-001, PRD-SYNC-002, PRD-SYNC-003, PRD-SYNC-004

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：product + frontend + backend
- 日期：2026-11-20
- 产品依据：`specs/product/P1-CONV/spec.md`
- 追溯：12 个 PRD；覆盖仍为 **0 covered / 11 partial / 1 gap**
Change：CHG-LEGACY-P1-CONV
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

把 P1 会话与消息 的已存在的实现、接口、组件与执行证据固化为可追溯的 CHANGE 包，并把未实现/未验证项明确留在缺口，而不是用汇总测试数替代逐 PRD 验收。

## 2. 需求与状态

| ID | 需求（产品 spec） | 实现事实 | 产品状态 | 主要证据 |
|---|---|---|---|---|
| PRD-CONV-001 | 会话树与主会话 | 会话列表/树、active 会话、选中与主会话语义由 sessions 模块和 Sidebar 承担。 | 已实现 | Sidebar.test.tsx 9/9；E2E 01a；后端 sessions 路由与 223/223 全量测试。 |
| PRD-CONV-002 | 会话生命周期 | 创建、重命名、归档、恢复、置顶由 sessions HTTP 与 Sidebar 行内操作提供。 | 已实现 | Sidebar.test.tsx 9/9；E2E 01a；后端 sessions 路由。 |
| PRD-CONV-003 | 会话搜索与未读 | 搜索过滤、空结果、搜索中状态已在前端存在；未读计数/已读游标未形成统一 AC。 | 部分 | Sidebar.test.tsx 9/9 覆盖搜索展示部分；未读无直接执行证据。 |
| PRD-CONV-004 | 消息流与渲染 | MessageItem 渲染 user/agent、Markdown 子集、分类、时间、复制、流式 caret、失败标记。 | 已实现 | MessageItem.test.tsx 18/18；E2E 01a。 |
| PRD-CONV-007 | 祖先消息整级加载 | 前端按会话层级逐级加载，413/403/空上级有可见状态；后端提供 messages scope=all。 | 已实现 | App.integration.test.tsx 7/7；E2E 04a–04d。 |
| PRD-CONV-005 | 发送·流式·断线重连 | POST /api/chat、WS reply.delta/message.done、前端流式与失败恢复、重连订阅。 | 已实现 | Composer.test.tsx 10/10；E2E 02/05；App.integration 7/7。 |
| PRD-CONV-006 | Composer 输入与快捷键 | Enter/Shift+Enter、反转发送模式、IME composing、Ctrl/Cmd+Enter、停止与发送失败恢复。 | 已实现 | Composer.test.tsx 10/10；E2E 02/03。 |
| PRD-SYNC-001 | WS 连接与重连 | connectEvents 解析增量事件，断线按 800ms×1.8、上限 5000ms 重连，带 since 订阅。 | 已实现 | App.integration 7/7；E2E 02（流式）；重连边界未单列测试。 |
| PRD-SYNC-002 | 多标签 active/ancestor/read cursor | tabsync.ts 使用 BroadcastChannel 广播 active_session_changed / ancestor_chain_changed / read_cursor_changed。 | 已实现 | 该域 test-plan 的 SYNC-002 用例为 missing；FE-009-web-multitab 的历史计划未在本轮执行。 |
| PRD-SYNC-003 | 发送模式/设置跨标签同步 | Composer 使用 localStorage key simo.composer.sendMode 与 simo.composer.sendMode.v1 跨标签同步。 | 已实现 | Composer.test.tsx 10/10；E2E 03 覆盖模式切换，未覆盖真实多标签。 |
| PRD-SYNC-004 | 未读与已读游标 | 前后端有零散未读/已读状态，但缺少统一口径和跨标签 AC。 | 部分 | 无直接执行证据；域 test-plan 保持 partial/missing。 |
| PRD-SYNC-005 | 远程访问与通知中心 | 无远程鉴权、通知中心页面或产品契约；不在当前前端路由。 | 未实现 | 无实现、无测试，保持 gap。 |

## 3. 验收标准（本包）

| AC | 断言 | 结果 | 证据 |
|---|---|---|---|
| AC-P1-01 | 会话树能展示 folder/session/active 关系，选中、重命名、归档/恢复主路径可用。 | PASS（组件/展示级） | TC-P1-001/002；Sidebar.test.tsx 9/9；E2E 01a。 |
| AC-P1-02 | 搜索有结果、无匹配、搜索中、归档过滤与错误/空态有明确 UI。 | PARTIAL | TC-P1-003；Sidebar.test.tsx 9/9（部分）。 |
| AC-P1-03 | 消息按 user/agent 渲染，流式 caret、失败标记、复制与分类标签可见。 | PASS（组件级） | TC-P1-004；MessageItem.test.tsx 18/18；E2E 01a。 |
| AC-P1-04 | Enter 发送、Shift+Enter 换行、IME 组合期不误发、发送失败恢复文本。 | PASS（组件级） | TC-P1-006/007；Composer.test.tsx 10/10；E2E 02/03。 |
| AC-P1-05 | 祖先消息按级加载，413/403/空上级各自有停止/继续提示且不插入错误数据。 | PASS（前端集成级） | TC-P1-005；App.integration 7/7；E2E 04a–04d。 |
| AC-P1-06 | WS 增量能驱动流式内容，断线后可订阅补偿。 | PASS（主路径） | TC-P1-008；App.integration 7/7；E2E 02。 |
| AC-P1-07 | 多标签 active/ancestor/read cursor 与远程访问/通知中心达到产品 AC。 | MISSING | TC-P1-009/011/012；无执行证据。 |

> 说明：结果 `PASS（…级）` 只表示该断言的已有测试/证据通过，不等于该 PRD 的所有产品 AC 通过；`MISSING` 表示没有执行证据或未实现。

## 4. 状态、错误与边界

- 本包状态固定为 `historical / partial`，不写 `implemented`/`covered`。
- 成功响应与错误格式沿用既有后端契约；未逐路由验证 400/403/404/500 的矩阵。
- 所有前端测试使用隔离 fixture/mock；E2E 使用隔离 API/临时 home，不是 8787 生产实例。
- 所有后端测试使用临时 `SIMO_HOME`/SQLite；未接触正式数据。
- 未验证项、未实现项在 `evidence.md` 与 `test-plan.md` 中保留 `missing`，不补写“通过”。

## 5. 接口与数据（归档）

主要接口见 [backend.md](backend.md)；前端组件见 [frontend.md](frontend.md)。本包不新增接口、表或迁移。

## 6. 待确认

- 缺失 PRD 是否进入下一条实现型 CHG，由 backlog 优先级决定。
- 现有 domain test-plan 的用例级 pass 是否足以支持某个 AC 升级，需要独立验收，不由本包自签。
- 产品 AC 与工程测试的映射仍需逐项复核；本包只提供基线。

## 7. 链接

- [proposal.md](proposal.md)
- [backend.md](backend.md)
- [frontend.md](frontend.md)
- [tasks.md](tasks.md)
- [test-plan.md](test-plan.md)
- [evidence.md](evidence.md)
- 域测试计划：[P1-CONV test-plan](../../test/P1-CONV/test-plan.md)
- 全量前端证据：[`docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md)

## 非目标

本包是历史归档，只登记既有事实：不新增能力、不改实现与数据、不把未验证项写成已完成；未覆盖的断言保持 `missing`，后续承接见对应的 `CHG-CONV-*` 收口包。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-20：建立本包并首次登记状态。
- 2026-11-20：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

已归档：本包是历史归档包，不再接受变更；产品能力仍按域 spec 的 `covered/partial/gap` 统计，归档不表示完成。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。
