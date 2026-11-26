# TEST PLAN · CHG-LEGACY-P4-FILE

Covers: AC-P4-01…AC-P4-06（共 6 条，逐条见下表）

## 1. 范围与策略

- 只验证 P4 文件与交付物 的已存在的实现/展示，不新增产品能力。
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
| AC-P4-01 | 会话交付物/文件列表显示名称、类型、状态并可打开。 | 会话交付物/文件列表显示名称、类型、状态并可打开。 | TC-P4-003；RightPanel 6/6；E2E 07。 | 全部断言通过，无 fail 与 skip | PASS（展示级） | docs/testing/EVIDENCE-20261120.md |
| AC-P4-02 | 交付物真实下载成功且内容非空。 | 交付物真实下载成功且内容非空。 | TC-P4-004；E2E 07。 | 全部断言通过，无 fail 与 skip | PASS（E2E 主路径） | docs/testing/EVIDENCE-20261120.md |
| AC-P4-03 | 上传附件有大小/类型/失败反馈，并可被会话引用。 | 上传附件有大小/类型/失败反馈，并可被会话引用。 | TC-P4-002；无执行证据。 | 全部断言通过，无 fail 与 skip | MISSING | missing |
| AC-P4-04 | 预览 PDF/图片/Office 不越界、不执行脚本，失败可恢复。 | 预览 PDF/图片/Office 不越界、不执行脚本，失败可恢复。 | TC-P4-004；预览未测。 | 全部断言通过，无 fail 与 skip | MISSING | missing |
| AC-P4-05 | 工作区输出隔离，跨会话/跨目录不可读取。 | 工作区输出隔离，跨会话/跨目录不可读取。 | TC-P4-005；无执行证据。 | 全部断言通过，无 fail 与 skip | MISSING | missing |
| AC-P4-06 | PDF/Office/图片生成格式与失败路径可验证。 | PDF/Office/图片生成格式与失败路径可验证。 | TC-P4-006；无执行证据。 | 全部断言通过，无 fail 与 skip | MISSING | missing |

## 4. 域 test-plan 映射

- 主计划：[P4-FILE test-plan](../../test/P4-FILE/test-plan.md)
- 该域用例汇总：9 个用例（6 主 + 3 边界），用例级 0 pass / 4 partial / 5 missing；PRD 覆盖仍 **0 covered / 2 partial / 4 gap**。
- 主用例：`TC-P4-001`…`TC-P4-006`，边界 `TC-P4-E1`…`TC-P4-E3`；详见域计划锚点。本包不复制/改写状态。
- 未执行项：以域 test-plan 的 `missing` 为准，不在本包补写。

## 5. 回归范围

- 本域相关前端套件、E2E 相关场景与后端全量套件；全量通过只说明既有套件未回归，不证明产品 AC 完成。
- 未做真实浏览器多标签矩阵、移动端全设备、网络抖动、权限矩阵与长时运行。

## 6. 未覆盖 / 不适用

- 无上传 UI 测试
- 无 PDF/图片/Office 预览
- 无隔离/越界 UI
- 无生成失败态
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
