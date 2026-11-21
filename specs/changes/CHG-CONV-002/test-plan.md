# CHG-CONV-002 · 测试计划（本包执行细节）

状态：**partial**（映射已建立；未重跑，引用 2026-11-20 报告）
Change: CHG-CONV-002
Implements: PRD-CONV-004、PRD-CONV-007
Covers: `AC-CONV-004-01/02`、`AC-CONV-007-01/02`

> 域级用例：TC-P1-004（CONV-004）、TC-P1-005（CONV-007），见 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)。

## 1. 用例 → AC → 证据

| 用例 | AC | 落点 | 层级 | 结果 |
|---|---|---|---|---|
| C2-01 用户/司墨消息渲染 | `AC-CONV-004-01` | `MessageItem.test.tsx::user message without category tag`、`::agent message with category tag` | component | pass |
| C2-02 分类标签 8 类映射 | `AC-CONV-004-01` | `MessageItem.test.tsx` 表驱动分类用例 | component | pass |
| C2-03 复制与降级 | `AC-CONV-004-01` | `::copies message text`、`::execCommand fallbacks（失败/成功）` | component | pass |
| C2-04 代码块/长文 | `AC-CONV-004-02` | `::fenced code/inline code/long text` | component | pass |
| C2-05 流式/失败态 | `AC-CONV-004-02` | `::streaming caret and failed badge` | component | pass |
| C2-06 卡片提交/失败/只读 | `AC-CONV-004-02` | `::submits card values`、`::keeps text on failed card + retry`、`::disables card controls when read-only or archived`、`::resets card inputs with cancel` | component | pass |
| C2-07 卡片后端契约 | `AC-CONV-004-01` | `m41_test.go::TestM41CardsSendGetPatchAndActions` 等 | API | pass |
| C2-08 消息纯度 | `AC-CONV-004-01` | `m78::TestM78InternalCard…`、`m79::TestM79Legacy…`、`m50::TestM50MessageEditingDisabled` | API | pass（后端侧） |
| C2-09 消息分页 | `AC-CONV-004-01` | `m11::TestM11MessagePagination` | API | pass |
| C2-10 祖先链加载/去重 | `AC-CONV-007-01` | `App.integration.test.tsx::loads ancestor messages and de-duplicates ids`；`m81::TestM81AllSessionMessages` | integration + API | pass |
| C2-11 413 重试 | `AC-CONV-007-02` | `::maps 413 and succeeds when retried` | integration（mock） | pass（仅 mock） |
| C2-12 403 空祖先 | `AC-CONV-007-02` | `::maps 403 and treats an empty ancestor as visited` | integration（mock） | pass（仅 mock） |
| C2-13 切会话清链 | `AC-CONV-007-02` | `::clears the ancestor chain when switching sessions` | integration | pass |
| C2-14 时间轴键盘/跳转 | `AC-CONV-007-01` | `TimelineGroups.test.tsx` 8 用例 | component | pass |
| C2-15 时间轴目标尺寸 | `AC-CONV-007-02` | 无 | — | **missing** |
| C2-16 真实后端 413/403 | `AC-CONV-007-02` | 无（仅 mock） | E2E | **missing** |
| C2-17 E2E 祖先链场景 | `AC-CONV-007-01` | CDP 04a–04d | E2E | pass |

## 2. 数据与 mock

- 组件：`frontend/src/test/fixtures.ts`；mock `api.ts`。
- 集成：mock fetch + 假 WS；不依赖真实后端。
- E2E：CDP runner，隔离端口 19230 + 临时 SIMO_HOME。

## 3. 层级与接线

component（Vitest）→ integration（Vitest + mock）→ API（go test）→ E2E（CDP，非 CI）。四层已跑；CI 未接线。

## 4. 未覆盖声明

C2-15、C2-16 未执行，不得记通过。另：组件 spec 未签收（COMP-message-colors 等），组件层 pass 不等于产品 AC 通过。
