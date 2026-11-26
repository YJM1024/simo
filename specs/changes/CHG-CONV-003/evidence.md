# CHG-CONV-003 · 执行证据

状态：**partial**（引用 2026-11-20 报告；2026-11-21 只读核对）
Change: CHG-CONV-003
Implements: PRD-CONV-005、PRD-CONV-006

结果：本轮未重跑，逐条证据见下表；未验证项按 `missing` 记，不宣称通过。

## 1. 历史执行记录

| 命令 | 结果 | 来源 |
|---|---|---|
| `cd frontend && npm test` | 69/69 PASS（Composer 10/10；App.integration 7/7） | `frontend/review/TEST-REPORT.md` |
| `npm run test:e2e:cdp` | 11/11（02/05 发送与流式、03 快捷键） | `frontend/e2e/report/cdp/summary.md` |
| `go test ./...` | 223/223 PASS（cmd/simo 的 WS/M2/M55/M6 等） | `docs/testing/BACKEND-EVIDENCE-20261120.md` |

## 2. 逐 AC 证据

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-CONV-005-01-01 | AC-CONV-005-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-21 | pass | 是 | 1 |
| E-AC-CONV-005-02-01 | AC-CONV-005-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-003/spec.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-CONV-006-01-01 | AC-CONV-006-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-003/spec.md | 2026-11-21 | pass | 是 | 1 |
| E-AC-CONV-006-02-01 | AC-CONV-006-02 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-003/spec.md | 2026-11-21 | partial | 是 | 1 |
| E-AC-SYNC-003-01-01 | AC-SYNC-003-01 | 文档核对 | N/A：实现未开始 | specs/changes/CHG-CONV-003/spec.md | 2026-11-21 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。

| AC | 证据 | 状态 |
|---|---|---|
| `AC-CONV-005-01` | Composer 2/5/6 用例；CDP 02/05；`TestM2MockStreamRecordsUsageAndDecision` | 有证据 |
| `AC-CONV-005-02` | 停止回调、失败恢复、重复提交防护、WS 去重 | 部分（重连/幂等/真实中断缺失） |
| `AC-CONV-006-01` | Composer 1/2/3/4/5/10；CDP 03 | 有证据（IME 仅模拟） |
| `AC-CONV-006-02` | 失败恢复、disabled、streaming、持久化 | 部分（跨标签未测） |

## 3. 本次只读核对（2026-11-21）

- 读：`frontend/src/app.tsx:415-433`（stopStreaming/send、`sendingRef` 互斥、`clientMutationId` 赋值）、`app.tsx:658`（Composer props）、`frontend/src/api.ts:connectEvents`（退避 800/1.8/5000、`since`、`correct`）、`library.tsx:509-590`（sendMode/localStorage/BroadcastChannel/storage 双通道、570 行快捷键判定）。
- grep：`backend/internal/modules/chat` 的 `clientMutationId|ClientMutationID` → **0 匹配**（幂等未实现）。
- 未执行测试命令。

## 4. 缺失清单

1. 断线重连（close→退避→open→since 回放）断言。
2. 发送幂等（后端未实现）。
3. 停止的真实中断效果（仅断言回调）。
4. 跨标签 sendMode 同步测试。
5. 真实浏览器 IME 手测。
6. `COMP-composer-send-mode` 状态签收。

## 5. 环境与限制

- 组件测试 jsdom，不覆盖真实输入法/剪贴板/网络。
- E2E 为 CDP runner，隔离端口 19230，非生产 8787，CI 未接线。
- 2026-11-20 后端测试使用 mock provider，无真实 LLM 延迟与断连特征。

---

## 2026-11-21 第 2 次证据回写（指针）

本文件是变更包建立时的证据快照。同日测试侧回传结果（前端 115/115、后端 246 个顶层测试、E2E 19/19×2）后的最新用例与覆盖状态，以 [P1 test-plan](../../test/P1-CONV/test-plan.md) 与 [CONV-CLOSURE](../../../docs/product/CONV-CLOSURE.md) 为准；本包结论不因新增测试自动升级。
