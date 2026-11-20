# EVIDENCE · CHG-LEGACY-P1-CONV

- 日期：2026-11-20
- 执行者：product / test（历史归档）
- 结论：**PASS WITH NOTES**（已有测试通过；P1 会话与消息 的产品能力仍为 partial/未实现混合，未升级 covered）
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
| PRD-CONV-001 | 会话树与主会话 | 已实现 | Sidebar.test.tsx 9/9；E2E 01a；后端 sessions 路由与 223/223 全量测试。 |
| PRD-CONV-002 | 会话生命周期 | 已实现 | Sidebar.test.tsx 9/9；E2E 01a；后端 sessions 路由。 |
| PRD-CONV-003 | 会话搜索与未读 | 部分 | Sidebar.test.tsx 9/9 覆盖搜索展示部分；未读无直接执行证据。 |
| PRD-CONV-004 | 消息流与渲染 | 已实现 | MessageItem.test.tsx 18/18；E2E 01a。 |
| PRD-CONV-007 | 祖先消息整级加载 | 已实现 | App.integration.test.tsx 7/7；E2E 04a–04d。 |
| PRD-CONV-005 | 发送·流式·断线重连 | 已实现 | Composer.test.tsx 10/10；E2E 02/05；App.integration 7/7。 |
| PRD-CONV-006 | Composer 输入与快捷键 | 已实现 | Composer.test.tsx 10/10；E2E 02/03。 |
| PRD-SYNC-001 | WS 连接与重连 | 已实现 | App.integration 7/7；E2E 02（流式）；重连边界未单列测试。 |
| PRD-SYNC-002 | 多标签 active/ancestor/read cursor | 已实现 | 该域 test-plan 的 SYNC-002 用例为 missing；FE-009-web-multitab 的历史计划未在本轮执行。 |
| PRD-SYNC-003 | 发送模式/设置跨标签同步 | 已实现 | Composer.test.tsx 10/10；E2E 03 覆盖模式切换，未覆盖真实多标签。 |
| PRD-SYNC-004 | 未读与已读游标 | 部分 | 无直接执行证据；域 test-plan 保持 partial/missing。 |
| PRD-SYNC-005 | 远程访问与通知中心 | 未实现 | 无实现、无测试，保持 gap。 |

- 域用例汇总：15 个用例（12 主 + 3 域级边界），用例级 6 pass / 6 partial / 3 missing。
- PRD 覆盖仍 **0 covered / 11 partial / 1 gap**；全仓仍 **covered 0 / partial 48 / gap 23**（本包不改写）。
- 已有测试通过不等于产品 AC 完成；`implemented` 字样不在本包 status 中出现。

## 4. 证据来源

- [前端证据](../../../docs/testing/EVIDENCE-20261120.md)
- [后端证据](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- [CDP summary](../../../frontend/e2e/report/cdp/summary.md)
- [前端测试报告](../../../frontend/review/TEST-REPORT.md)
- [域 test-plan](../../test/P1-CONV/test-plan.md)
- 历史 FE/COMP 包：见 `docs/product/TRACEABILITY.md` 与 `specs/README.md`。

## 5. 未验证项 / 限制

- 未做真实多标签浏览器矩阵
- 未读/已读跨标签未验收
- 远程访问/通知中心无 UI
- 动画/虚拟滚动/长列表性能未测
- 未做真实多标签/移动设备/网络抖动矩阵。
- 未做逐路由 HTTP 错误/权限契约矩阵。
- 未做视觉验收、截图 diff、真实生产数据回归。
- 本包未重新执行任何测试，只引用已有报告；报告移动时需重新核对。
