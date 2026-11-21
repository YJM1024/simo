# CHG-CONV-002 · 执行证据

状态：**partial**（引用 2026-11-20 报告；2026-11-21 只读核对，未重跑）
Change: CHG-CONV-002
Implements: PRD-CONV-004、PRD-CONV-007

## 1. 历史执行记录（报告结论）

| 命令 | 结果 | 来源 |
|---|---|---|
| `cd frontend && npm test` | 69/69 PASS（MessageItem 18、App.integration 7、TimelineGroups 8） | `frontend/review/TEST-REPORT.md`、`docs/testing/EVIDENCE-20261120.md` |
| `npm run test:e2e:cdp` | 11/11（含 04a–04d 祖先链/时间轴） | `frontend/e2e/report/cdp/summary.md` |
| `go test ./...` | 223/223 PASS（含 M11/M41/M50/M78/M79/M81/M89） | `docs/testing/BACKEND-EVIDENCE-20261120.md` |

## 2. 逐 AC 证据

| AC | 证据 | 状态 |
|---|---|---|
| `AC-CONV-004-01` | MessageItem 前 5 组用例；M41 卡片；M11 分页；E2E 01a | 有证据（组件级） |
| `AC-CONV-004-02` | 失败徽标/流式/只读/卡片重试；空态归 E1 | 部分（域级 E1 仍 partial） |
| `AC-CONV-007-01` | App.integration 去重合并；M81 两测；E2E 04a–04d | 有证据 |
| `AC-CONV-007-02` | 413/403/清链（均 mock）；时间轴键盘 | 部分（目标尺寸、真实后端缺失） |

## 3. 本次只读核对（2026-11-21）

- 读：`frontend/src/components/library.tsx`（176–670 区段）、`frontend/src/app.tsx`（祖先链接线与 WS 合并）、`frontend/src/api.ts`（`getAllSessionMessages`、`listMessages`、`submitCardAction`）、`backend/internal/modules/chat/module.go`（173–213）、`backend/internal/modules/chat/all_messages.go`。
- 读测试：`MessageItem.test.tsx`、`App.integration.test.tsx`、`TimelineGroups.test.tsx` 用例名与断言；`backend/cmd/simo/m81_all_messages_test.go`、`m89_*`、`m50_*`、`m78_*`、`m79_*`、`m41_*`。
- 未执行测试命令。

## 4. 缺失清单

1. 时间轴点击目标尺寸测量（C2-15）。
2. 真实后端 413/403 的 E2E（C2-16）。
3. 消息纯度的前端独立断言（当前依赖后端过滤）。
4. 长祖先链上限（16 层）的 UI 行为与断言。
5. 组件 spec 状态与实现一致性（COMP 三处，需设计/验收签字）。

## 5. 环境与限制

- 前端：Vitest/jsdom；E2E：CDP runner，端口 19230，非 8787，非 Playwright，CI 未接线。
- 后端：26 包，临时 SIMO_HOME，mock provider。
- 结论仅代表 2026-11-20 执行面；2026-11-21 未回归。

---

## 2026-11-21 第 2 次证据回写（指针）

本文件是变更包建立时的证据快照。同日测试侧回传结果（前端 115/115、后端 246 个顶层测试、E2E 19/19×2）后的最新用例与覆盖状态，以 [P1 test-plan](../../test/P1-CONV/test-plan.md) 与 [CONV-CLOSURE](../../../docs/product/CONV-CLOSURE.md) 为准；本包结论不因新增测试自动升级。