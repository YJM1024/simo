# CHG-CONV-004 · 执行证据

状态：**partial**（后端 WS 有报告；前端多标签/重连无任何执行记录）
Change: CHG-CONV-004
Implements: PRD-SYNC-001、PRD-SYNC-002、PRD-SYNC-003

结果：本轮未重跑，逐条证据见下表；未验证项按 `missing` 记，不宣称通过。

## 1. 历史执行记录

| 命令 | 结果 | 来源 |
|---|---|---|
| `go test ./...` | 223/223 PASS；含 `TestWebSocketEventOrder`、`TestWebSocketSinceContinuation`、`TestM88WebSocketFanoutTwoClients`、`TestM6ArchivedChatWSReturnsErrorNotReply` | `docs/testing/BACKEND-EVIDENCE-20261120.md` |
| `cd frontend && npm test` | 69/69；仅 `App.integration` 1 条 delta 去重、Composer 1 条 sendMode 持久化与 SYNC 相关 | `frontend/review/TEST-REPORT.md` |
| `npm run test:e2e:cdp` | 11/11，**全部单页**，无多标签场景 | `frontend/e2e/report/cdp/summary.md` |

## 2. 逐 AC 证据

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-SYNC-001-01-01 | AC-SYNC-001-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-SYNC-001-02-01 | AC-SYNC-001-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-SYNC-002-01-01 | AC-SYNC-002-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-SYNC-002-02-01 | AC-SYNC-002-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | missing | 否 | 0 |
| E-AC-SYNC-003-01-01 | AC-SYNC-003-01 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-SYNC-003-02-01 | AC-SYNC-003-02 | 人工记录 | N/A：实现未开始 | specs/changes/CHG-CONV-004/spec.md | 2026-11-21 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

| AC | 证据 | 状态 |
|---|---|---|
| `AC-SYNC-001-01` | 后端三个 WS 测试 + 前端 delta 去重 | 部分（无重连） |
| `AC-SYNC-001-02` | 仅代码（退避/since） | **missing** |
| `AC-SYNC-002-01` | 仅代码（tabsync + app 三分支） | **missing** |
| `AC-SYNC-002-02` | 仅代码（tiebreak/回声抑制/chain 去重） | **missing** |
| `AC-SYNC-003-01` | Composer 持久化用例 | 部分（无跨标签） |
| `AC-SYNC-003-02` | 仅代码（storage 监听） | **missing** |

## 3. 本次只读核对（2026-11-21）

- 读：`frontend/src/tabsync.ts`（全 28 行，协议与 CHANNEL）、`frontend/src/app.tsx:96–101,167–171,220–256,415–433,495`（三通道发布/消费、回声抑制、退避依赖）、`frontend/src/api.ts:connectEvents`、`frontend/src/components/library.tsx:513–539`（sendMode 双通道）。
- grep：`backend/internal` 无 `unread|read_cursor`（SYNC-002 后端 N/A 成立）。
- 未执行测试命令。

## 4. 缺失清单（10 项）

1. 重连退避与 `since` 回放（前端）。
2. 重连不丢不重量化断言。
3. `correct` 帧真实中止（后端）。
4-6. 多标签 active/祖先链/未读三项同步。
7-8. tiebreak、回声抑制、chain key 去重。
9. 跨标签 sendMode。
10. storage 事件回退。

## 5. 环境与限制

- CDP runner 单页，无法验证多标签；需先扩展双 target 能力（TASK-02）。
- BroadcastChannel 在 jsdom 中不完整，unit 层需 polyfill 或真实浏览器。
- 后端为单实例桌面进程，无跨设备场景。

---

## 2026-11-21 第 2 次证据回写（指针）

本文件是变更包建立时的证据快照。同日测试侧回传结果（前端 115/115、后端 246 个顶层测试、E2E 19/19×2）后的最新用例与覆盖状态，以 [P1 test-plan](../../test/P1-CONV/test-plan.md) 与 [CONV-CLOSURE](../../../docs/product/CONV-CLOSURE.md) 为准；本包结论不因新增测试自动升级。
