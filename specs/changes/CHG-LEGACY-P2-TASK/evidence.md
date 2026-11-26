# EVIDENCE · CHG-LEGACY-P2-TASK

- 日期：2026-11-20
- 执行者：product / test（历史归档）
- 结论：**PASS WITH NOTES**（已有测试通过；P2 任务与执行 的产品能力仍为 partial/未实现混合，未升级 covered）
- 变更性质：docs-only；未改代码、未改数据、未启动 8787

结果：引用 2026-11-20 执行记录；未覆盖项按 `missing` 记，不宣称通过。

## 1. 已有执行命令

```powershell
# 前端
Set-Location E:\dsh_home\workspaces\agent\frontend
npm test                 # 69/69 PASS
npm run test:e2e:cdp     # 11/11 PASS，连续 5 次

# 后端
Set-Location ..\backend
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
# 223/223 PASS，26 包，0 fail/skip，283.33s
```

## 2. 全量计数

| 指标 | 值 |
|---|---|
| 前端单测 | 69/69 PASS（8 文件） |
| CDP E2E | 11/11 PASS，连续 5 次 |
| 后端测试 | 223/223 PASS（26 包，0 fail/skip，283.33s） |
| 覆盖率 | 仅 `library.tsx`：lines 85.58% / statements 80.25% / functions 82.31% / branches 80.89% |
| 8787 | build `mwfzyf8u-h9f0d`，health 200，PID 42660，`-model real` |

## 3. PRD 覆盖（本包不升级）

| PRD | 名称 | 实现状态 | 已有证据 / 缺口 |
|---|---|---|---|
| PRD-TASK-001 | 任务生命周期与执行组 | 部分 | RightPanel.test.tsx 6/6（展示层）；E2E 06 任务定位。 |
| PRD-TASK-002 | 任务概览与进度 | 部分 | RightPanel.test.tsx 6/6；E2E 06。 |
| PRD-TASK-003 | 长任务异步与开始/结束消息 | 未实现 | 无直接执行证据，保持 gap。 |
| PRD-TASK-006 | 取消·重试·预算·恢复 | 部分 | 无域级执行证据；不以路由存在判通过。 |
| PRD-TASK-004 | 复杂度分级与确认门禁 | 未实现 | 无实现/无测试，保持 gap。 |
| PRD-TASK-005 | 子会话与任务归属 | 未实现 | 无实现/无测试，保持 gap。 |

- 域用例汇总：9 个用例（6 主 + 3 边界），用例级 0 pass / 4 partial / 5 missing。
- PRD 覆盖仍 **0 covered / 0 partial / 6 gap**；全仓仍 **covered 0 / partial 48 / gap 23**（本包不改写）。
- 已有测试通过不等于产品 AC 完成；`implemented` 字样不在本包 status 中出现。

## 4. 证据来源

- [前端证据](../../../docs/testing/EVIDENCE-20261120.md)
- [后端证据](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- [CDP summary](../../../frontend/e2e/report/cdp/summary.md)
- [前端测试报告](../../../frontend/review/TEST-REPORT.md)
- [域 test-plan](../../test/P2-TASK/test-plan.md)
- 历史 FE/COMP 包：见 `docs/product/TRACEABILITY.md` 与 `specs/README.md`。

## 5. 未验证项 / 限制

- 无执行组完整交互
- 无复杂度门禁 UI
- 无子会话任务归属 UI
- 无预算/并发显示
- 未做真实多标签/移动设备/网络抖动矩阵。
- 未做逐路由 HTTP 错误/权限契约矩阵。
- 未做视觉验收、截图 diff、真实生产数据回归。
- 本包未重新执行任何测试，只引用已有报告；报告移动时需重新核对。

## AC 证据索引

| 证据 ID | AC | 类型 | 命令 | 路径 | 生成时间 | 结果 | 可复跑 | 轮次 |
|---|---|---|---|---|---|---|---|---|
| E-AC-P2-01-01 | AC-P2-01 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P2-05-01 | AC-P2-05 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P2-02-01 | AC-P2-02 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P2-03-01 | AC-P2-03 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |
| E-AC-P2-04-01 | AC-P2-04 | 后端测试 | go test ./... -count=1 | docs/testing/BACKEND-EVIDENCE-20261120.md | 2026-11-20 | missing | 否 | 0 |

> 本表按 AC 汇总已有证据来源与判定；逐条细节仍以本文件下列各节与 `test-plan.md` 为准。
