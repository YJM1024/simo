# TEST PLAN · CHG-LEGACY-P1-CONV

## 1. 范围与策略

- 只验证 P1 会话与消息 的已存在的实现/展示，不新增产品能力。
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
| AC-P1-01 | 会话树能展示 folder/session/active 关系，选中、重命名、归档/恢复主路径可用。 | TC-P1-001/002；Sidebar.test.tsx 9/9；E2E 01a。 | PASS（组件/展示级） |
| AC-P1-02 | 搜索有结果、无匹配、搜索中、归档过滤与错误/空态有明确 UI。 | TC-P1-003；Sidebar.test.tsx 9/9（部分）。 | PARTIAL |
| AC-P1-03 | 消息按 user/agent 渲染，流式 caret、失败标记、复制与分类标签可见。 | TC-P1-004；MessageItem.test.tsx 18/18；E2E 01a。 | PASS（组件级） |
| AC-P1-04 | Enter 发送、Shift+Enter 换行、IME 组合期不误发、发送失败恢复文本。 | TC-P1-006/007；Composer.test.tsx 10/10；E2E 02/03。 | PASS（组件级） |
| AC-P1-05 | 祖先消息按级加载，413/403/空上级各自有停止/继续提示且不插入错误数据。 | TC-P1-005；App.integration 7/7；E2E 04a–04d。 | PASS（前端集成级） |
| AC-P1-06 | WS 增量能驱动流式内容，断线后可订阅补偿。 | TC-P1-008；App.integration 7/7；E2E 02。 | PASS（主路径） |
| AC-P1-07 | 多标签 active/ancestor/read cursor 与远程访问/通知中心达到产品 AC。 | TC-P1-009/011/012；无执行证据。 | MISSING |

## 4. 域 test-plan 映射

- 主计划：[P1-CONV test-plan](../../test/P1-CONV/test-plan.md)
- 该域用例汇总：15 个用例（12 主 + 3 域级边界），用例级 6 pass / 6 partial / 3 missing；PRD 覆盖仍 **0 covered / 11 partial / 1 gap**。
- 主用例：`TC-P1-001`…`TC-P1-012`，边界 `TC-P1-E1`…`TC-P1-E3`；详见域计划锚点。本包不复制/改写状态。
- 未执行项：以域 test-plan 的 `missing` 为准，不在本包补写。

## 5. 回归范围

- 本域相关前端套件、E2E 相关场景与后端全量套件；全量通过只说明既有套件未回归，不证明产品 AC 完成。
- 未做真实浏览器多标签矩阵、移动端全设备、网络抖动、权限矩阵与长时运行。

## 6. 未覆盖 / 不适用

- 未做真实多标签浏览器矩阵
- 未读/已读跨标签未验收
- 远程访问/通知中心无 UI
- 动画/虚拟滚动/长列表性能未测
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
