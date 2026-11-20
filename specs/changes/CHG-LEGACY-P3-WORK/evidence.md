# EVIDENCE · CHG-LEGACY-P3-WORK

- 日期：2026-11-20
- 执行者：product / test（历史归档）
- 结论：**PASS WITH NOTES**（已有测试通过；P3 工作台与视图 的产品能力仍为 partial/未实现混合，未升级 covered）
- 变更性质：docs-only；未改代码、未改数据、未启动 8787

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

| PRD | 名称 | 产品状态 | 已有证据 / 缺口 |
|---|---|---|---|
| PRD-WORK-001 | 双页导航与工作台入口 | 已实现 | LibraryUtilities 2/2；E2E 01a/01b。 |
| PRD-WORK-002 | 用量与统计卡 | 已实现 | App.integration 7/7（工作台指标路径）；后端 /api/usage、/api/stats 存在。 |
| PRD-WORK-003 | 每日趋势与最近活动 | 已实现 | MetricsDashboard 9/9；App.integration 7/7。 |
| PRD-WORK-004 | 工作台交付物三态 | 部分 | RightPanel 6/6；E2E 07 下载；三态未全测。 |
| PRD-WORK-005 | 自定义视图 13 类块 | 未实现 | 无前端/无执行证据，保持 gap。 |

- 域用例汇总：8 个用例（5 主 + 3 边界），用例级 1 pass / 6 partial / 1 missing。
- PRD 覆盖仍 **0 covered / 4 partial / 1 gap**；全仓仍 **covered 0 / partial 48 / gap 23**（本包不改写）。
- 已有测试通过不等于产品 AC 完成；`implemented` 字样不在本包 status 中出现。

## 4. 证据来源

- [前端证据](../../../docs/testing/EVIDENCE-20261120.md)
- [后端证据](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- [CDP summary](../../../frontend/e2e/report/cdp/summary.md)
- [前端测试报告](../../../frontend/review/TEST-REPORT.md)
- [域 test-plan](../../test/P3-WORK/test-plan.md)
- 历史 FE/COMP 包：见 `docs/product/TRACEABILITY.md` 与 `specs/README.md`。

## 5. 未验证项 / 限制

- 无自定义视图构建器
- 交付物空/加载/错误三态未全测
- 统计口径与后端聚合未做契约测试
- 未做真实多标签/移动设备/网络抖动矩阵。
- 未做逐路由 HTTP 错误/权限契约矩阵。
- 未做视觉验收、截图 diff、真实生产数据回归。
- 本包未重新执行任何测试，只引用已有报告；报告移动时需重新核对。
