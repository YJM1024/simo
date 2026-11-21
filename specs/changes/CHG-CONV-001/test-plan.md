# CHG-CONV-001 · 测试计划（本包执行细节）

状态：**partial**（用例映射已建立；本包未重跑测试，证据引用 2026-11-20 报告）
Change: CHG-CONV-001
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003
Covers: `AC-CONV-001-01/02`、`AC-CONV-002-01/02`、`AC-CONV-003-01/02`

> 域级用例与锚点归并到 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)：TC-P1-001（CONV-001）、TC-P1-002（CONV-002）、TC-P1-003（CONV-003），本文件只写执行细节。

## 1. 用例 → AC → 证据

| 用例 | AC | 测试落点（文件::用例） | 层级 | 结果 | 证据 |
|---|---|---|---|---|---|
| C1-01 会话列表渲染与选中 | `AC-CONV-001-01` | `frontend/src/components/Sidebar.test.tsx::renders sessions…`、`::selects with click and Enter` | component | pass | `frontend/review/TEST-REPORT.md` |
| C1-02 会话树持久化 | `AC-CONV-001-01` | `backend/cmd/simo/m4_test.go::TestM4SessionTreeAndRenamePersistAcrossRestart`、`sessions/service_test.go::TestTreeCreateRenameAndDescendants` | API/integration | pass | `docs/testing/BACKEND-EVIDENCE-20261120.md` |
| C1-03 多层树与环保护 | `AC-CONV-001-01` | `m14_test.go::TestM14SessionPathMultiLevel`、`::TestM14SessionPathCycleGuard` | API | pass | 同上 |
| C1-04 空/加载/错误/重试 | `AC-CONV-001-02` | `Sidebar.test.tsx::shows empty, loading and error/retry states`、`::shows stats failure without inventing a zero` | component | pass | TEST-REPORT |
| C1-05 重命名 Enter/Escape | `AC-CONV-002-01` | `Sidebar.test.tsx::renames a session by double click and Enter, with Escape cancel` | component | pass | TEST-REPORT |
| C1-06 归档/恢复 | `AC-CONV-002-01` | `Sidebar.test.tsx::shows and hides archived sessions and can archive/restore`；`m6_test.go::TestM6ArchiveReadonlyAndUnarchive` | component + API | pass | TEST-REPORT + 后端报告 |
| C1-07 草稿会话 | `AC-CONV-002-01` | `m70_test.go::TestM70DraftNotPersistedThenMaterialized`、`::TestM70RestartCleansEmptySessions` | API | pass | 后端报告 |
| C1-08 生命周期失败反馈 | `AC-CONV-002-02` | 无（rename/toggleArchive 未 catch） | — | **missing** | 缺陷见 `frontend.md` §4 |
| C1-09 搜索过滤/无匹配/搜索中 | `AC-CONV-003-01` | `Sidebar.test.tsx::searches, filters by query and shows no-match state`、`::uses server search ids and shows searching state` | component | pass | TEST-REPORT |
| C1-10 会话标题搜索（后端） | `AC-CONV-003-01` | `ui1_test.go::TestUI1SessionSearchAndPin` | API | pass | 后端报告 |
| C1-11 消息搜索口径 | `AC-CONV-003-01` | 无直接测试 | API | **missing** | 需补（TASK-02） |
| C1-12 未读计数/已读游标 | `AC-CONV-003-02` | 无测试；实现仅内存态 | — | **missing** | 交 `CHG-CONV-005` |

## 2. 数据与 mock

- 前端：`frontend/src/test/fixtures.ts` 隔离 fixture，mock `api.ts`；不读生产库。
- 后端：`cmd/simo` 测试用临时 `SIMO_HOME` + mock provider（`newM2App`）；不写用户数据目录。

## 3. 层级与接线

- component：Vitest + Testing Library（已跑）。
- API：`go test ./cmd/simo -run ...`（已跑，223 用例集内）。
- E2E：CDP runner `npm run test:e2e:cdp`（01a 覆盖首屏会话列表；非 Playwright/CI 未接线）。
- **CI 未接线**：所有结果为本地执行记录，不是流水线门禁。

## 4. 未覆盖与不跳过声明

下列断言无执行记录，不得在本包内宣告通过：C1-08、C1-11、C1-12。另有"主会话不可归档""选中会话后中栏内容切换"两项未列用例（TASK-04/05）。
