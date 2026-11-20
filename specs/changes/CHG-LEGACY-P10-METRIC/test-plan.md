# TEST PLAN · CHG-LEGACY-P10-METRIC

## 1. 范围与策略

- 只验证 P10 指标 的已存在的实现/展示，不新增产品能力。
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
| AC-P10-01 | 性能/质量/延迟卡片显示真实指标，不展示假 0。 | TC-P10-001/002/003；MetricsDashboard 9/9 部分。 | PARTIAL |
| AC-P10-02 | 7/30 天窗口切换，空/加载/错误/partialToday 有可见状态。 | TC-P10-004/005；MetricsDashboard 9/9；E2E 01a。 | PASS（组件级） |
| AC-P10-03 | 明细表可键盘聚焦、口径可读、空态不误导。 | TC-P10-005；MetricsDashboard 9/9。 | PASS（组件级） |
| AC-P10-04 | 导出、对比、告警可配置并验证。 | TC-P10-006；未实现。 | MISSING |

## 4. 域 test-plan 映射

- 主计划：[P10-METRIC test-plan](../../test/P10-METRIC/test-plan.md)
- 该域用例汇总：9 个用例（6 主 + 3 边界），用例级 0 pass / 8 partial / 1 missing；PRD 覆盖仍 **0 covered / 5 partial / 1 gap**。
- 主用例：`TC-P10-001`…`TC-P10-006`，边界 `TC-P10-E1`…`TC-P10-E3`；详见域计划锚点。本包不复制/改写状态。
- 未执行项：以域 test-plan 的 `missing` 为准，不在本包补写。

## 5. 回归范围

- 本域相关前端套件、E2E 相关场景与后端全量套件；全量通过只说明既有套件未回归，不证明产品 AC 完成。
- 未做真实浏览器多标签矩阵、移动端全设备、网络抖动、权限矩阵与长时运行。

## 6. 未覆盖 / 不适用

- 无导出/对比/告警
- 无真实后端聚合 E2E
- 质量/延迟边界未测
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
