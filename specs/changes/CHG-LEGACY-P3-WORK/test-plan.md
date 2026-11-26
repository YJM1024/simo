# TEST PLAN · CHG-LEGACY-P3-WORK

Covers: AC-P3-01…AC-P3-04（共 4 条，逐条见下表）

## 1. 范围与策略

- 只验证 P3 工作台与视图 的已存在的实现/展示，不新增产品能力。
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

| AC | 用例 | 断言摘要 | 已有测试/证据 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| AC-P3-01 | 对话/工作台双页可切换，375 宽无横向溢出且时间轴/侧栏按断点隐藏。 | 对话/工作台双页可切换，375 宽无横向溢出且时间轴/侧栏按断点隐藏。 | TC-P3-001；LibraryUtilities 2/2；E2E 01a/01b。 | 全部断言通过，无 fail 与 skip | PASS（组件/E2E） | docs/testing/EVIDENCE-20261120.md |
| AC-P3-02 | 用量/统计卡/趋势按真实 API 展示，空/错误不显示假 0。 | 用量/统计卡/趋势按真实 API 展示，空/错误不显示假 0。 | TC-P3-002/003；App.integration 7/7；Metrics 9/9；部分。 | 全部断言通过，无 fail 与 skip | PARTIAL | docs/testing/EVIDENCE-20261120.md |
| AC-P3-03 | 工作台交付物空/加载/错误三态与真实下载可用。 | 工作台交付物空/加载/错误三态与真实下载可用。 | TC-P3-004；RightPanel 6/6；E2E 07 下载；三态不全。 | 全部断言通过，无 fail 与 skip | PARTIAL | docs/testing/EVIDENCE-20261120.md |
| AC-P3-04 | 自定义视图 13 类块可创建、排序、版本化、渲染。 | 自定义视图 13 类块可创建、排序、版本化、渲染。 | TC-P3-005；未实现。 | 全部断言通过，无 fail 与 skip | MISSING | missing |

## 4. 域 test-plan 映射

- 主计划：[P3-WORK test-plan](../../test/P3-WORK/test-plan.md)
- 该域用例汇总：8 个用例（5 主 + 3 边界），用例级 1 pass / 6 partial / 1 missing；PRD 覆盖仍 **0 covered / 4 partial / 1 gap**。
- 主用例：`TC-P3-001`…`TC-P3-005`，边界 `TC-P3-E1`…`TC-P3-E3`；详见域计划锚点。本包不复制/改写状态。
- 未执行项：以域 test-plan 的 `missing` 为准，不在本包补写。

## 5. 回归范围

- 本域相关前端套件、E2E 相关场景与后端全量套件；全量通过只说明既有套件未回归，不证明产品 AC 完成。
- 未做真实浏览器多标签矩阵、移动端全设备、网络抖动、权限矩阵与长时运行。

## 6. 未覆盖 / 不适用

- 无自定义视图构建器
- 交付物空/加载/错误三态未全测
- 统计口径与后端聚合未做契约测试
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
