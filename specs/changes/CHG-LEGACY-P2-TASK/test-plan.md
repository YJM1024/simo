# TEST PLAN · CHG-LEGACY-P2-TASK

## 1. 范围与策略

- 只验证 P2 任务与执行 的已存在的实现/展示，不新增产品能力。
- 自动化层级：Vitest component/integration（前端 69 个单测中相关套件）+ CDP E2E（11 场景中相关场景）+ 后端全量套件（不作为逐 PRD 证据）。
- 隔离：前端 fixture/mock；E2E 隔离 API 19230 + 临时 home；后端临时 `SIMO_HOME`/SQLite。不接触 8787 与正式数据。
- 证据口径：用例级 `pass` 不等于 PRD covered；无执行证据写 `missing`。

## 2. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\frontend
npm test
npm run test:e2e:cdp

Set-Location ..\backend
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

已有结果：前端 69/69 PASS（8 文件）、CDP 11/11（连续 5 次）、后端 223/223 PASS（26 包，0 fail/skip，283.33s）。本包未重新执行。

## 3. AC → 测试矩阵

| AC | 断言摘要 | 已有测试/证据 | 结果 |
|---|---|---|---|
| AC-P2-01 | 会话概览/右栏能看到任务列表与状态，点击任务能定位并高亮。 | TC-P2-001/002；RightPanel 6/6；E2E 06。 | PASS（展示级） |
| AC-P2-02 | 任务取消、重试、运行时状态有可验证的 API 与前端交互。 | TC-P2-004；仅路由/代码存在，无执行证据。 | MISSING |
| AC-P2-03 | 长任务异步开始/结束消息可解耦、可恢复，且不重复插入消息。 | TC-P2-003；未实现。 | MISSING |
| AC-P2-04 | 复杂度分级触发确认门禁，C0–C4 行为有 AC 与测试。 | TC-P2-005；未实现。 | MISSING |
| AC-P2-05 | 子会话创建后任务归属正确、父会话不误建 Task。 | TC-P2-006；未实现。 | MISSING |

## 4. 域 test-plan 映射

- 主计划：[P2-TASK test-plan](../../test/P2-TASK/test-plan.md)
- 该域用例汇总：9 个用例（6 主 + 3 边界），用例级 0 pass / 4 partial / 5 missing；PRD 覆盖仍 **0 covered / 0 partial / 6 gap**。
- 主用例：`TC-P2-001`…`TC-P2-006`，边界 `TC-P2-E1`…`TC-P2-E3`；详见域计划锚点。本包不复制/改写状态。
- 未执行项：以域 test-plan 的 `missing` 为准，不在本包补写。

## 5. 回归范围

- 本域相关前端套件、E2E 相关场景与后端全量套件；全量通过只说明既有套件未回归，不证明产品 AC 完成。
- 未做真实浏览器多标签矩阵、移动端全设备、网络抖动、权限矩阵与长时运行。

## 6. 未覆盖 / 不适用

- 无执行组完整交互
- 无复杂度门禁 UI
- 无子会话任务归属 UI
- 无预算/并发显示
- 未验证生产 8787 的用户数据；E2E 使用隔离实例。
- 未做视觉像素/截图 diff；视觉验收不在本包。

## 7. 退出标准

- 所有证据可回指已有命令/报告；`missing` 不得写成 `pass`。
- PRD 状态不高于产品 spec：不新增 covered，不把 implementation 状态写成完成。
- 独立验收 Agent 签字前，本包只算归档基线。

## 8. 证据

- [evidence.md](evidence.md)
- [EVIDENCE-20261120](../../../docs/testing/EVIDENCE-20261120.md)
- [BACKEND-EVIDENCE-20261120](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- [CDP summary](../../../frontend/e2e/report/cdp/summary.md)
- [TEST-REPORT](../../../frontend/review/TEST-REPORT.md)
