# CHG-CONV-005 · 执行证据

状态：**missing**（未实现、未测试；仅记录"不存在"的实查证据）
Change: CHG-CONV-005
Implements: PRD-SYNC-004、PRD-SYNC-005

结果：本轮未重跑，逐条证据见下表；未验证项按 `missing` 记，不宣称通过。

## 1. 证据矩阵

| 项 | 状态 | 依据 |
|---|---|---|
| 后端未读 API/表 | **missing（不存在）** | `backend/internal` grep `unread|read_cursor|lastRead|last_read` = 0 匹配 |
| 后端通知 | **missing（不存在）** | grep `notification` = 0 匹配 |
| 未读持久化 | **missing** | 前端 `unread` 仅 `useState`（`app.tsx:96`），无请求 |
| 未读徽标 UI | **missing** | Sidebar props（`library.tsx:50`）无 unread 字段 |
| 跨标签未读 | **missing（仅内存广播）** | `tabsync.ts` `read_cursor_changed`、`app.tsx:171/239` |
| 未读测试 | **missing** | 8 个测试文件无未读用例 |
| 远程访问 | **missing（不存在）** | 无鉴权中间件、无设备/会话管理、无导出 |
| 通知中心 | **missing（不存在）** | 无 UI、无 API、无数据模型、无渠道 |

## 2. 已执行检查（2026-11-21）

- `grep`：`backend/internal` 的 `unread|read_cursor|lastRead|last_read|notification` → 0。
- 读：`frontend/src/app.tsx:96,101,167,214,239,400,656`；`frontend/src/tabsync.ts`；`frontend/src/components/library.tsx:50`（Sidebar props）。
- 读产品 spec：`specs/product/P1-CONV/spec.md` 的 SYNC-004（partial）与 SYNC-005（unimplemented）章节。
- **未执行**：任何测试（无对象可测）。

## 3. 与已有报告的关系

- `docs/testing/EVIDENCE-20261120.md` §5 已把"远程/通知中心"列为未验证项；本包与之**一致**，不新增通过结论。
- `docs/testing/PENDING-EVALS-20261121.md` 记录待评估项，未包含本包能力。

## 4. 结论

SYNC-004：实现碎片（前端内存态）+ 零持久化 + 零测试 → `partial`（不升级）。
SYNC-005：完全未实现 → `gap`（P1 唯一 gap）。
两者共同构成 `docs/product/CONV-CLOSURE.md` 的未闭环出口。

---

## 2026-11-21 第 2 次证据回写（指针）

本文件是变更包建立时的证据快照。同日测试侧回传结果（前端 115/115、后端 246 个顶层测试、E2E 19/19×2）后的最新用例与覆盖状态，以 [P1 test-plan](../../test/P1-CONV/test-plan.md) 与 [CONV-CLOSURE](../../../docs/product/CONV-CLOSURE.md) 为准；本包结论不因新增测试自动升级。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-SYNC-004-01-01 | AC-SYNC-004-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-005/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-SYNC-004-02-01 | AC-SYNC-004-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-005/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-SYNC-005-01-01 | AC-SYNC-005-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-005/spec.md | 2026-11-21 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。
