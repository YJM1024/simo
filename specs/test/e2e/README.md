# E2E 测试计划（跨域关键路径）

状态：**active（CDP runner 已执行 11/11；Playwright Test / CI 未接通）**
> 本文件是 L4/E2E 的唯一索引；域级用例仍在 [`../P1-CONV/test-plan.md`](../P1-CONV/test-plan.md) 等 10 份域测试计划中。产品事实见 [`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)，覆盖口径见 [`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)，本次证据记录见 [`../../../docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md)。

## 1. 范围与边界

- 目标：验证跨组件、跨接口、跨页面的关键用户路径；不替代单元/组件/集成测试。
- 当前 runner：`frontend/e2e/scripts/cdp-runner.mjs`（Chrome DevTools Protocol 驱动），不是 Playwright Test。
- 命令：`cd frontend && npm run test:e2e:cdp`。
- 环境：CDP 调试端口 9223；隔离后端 API 19230；`simo-live-composer.exe` + 临时 `SIMO_HOME`；不使用 8787 生产实例或真实用户数据。
- 报告：`frontend/e2e/report/cdp/summary.md`、`results.json`、截图；连续 5 次日志 `run-iter1..5.log`。
- 结果口径：只记录实际执行；未跑/未覆盖写 `missing`，不写“通过”。

## 2. 场景与结果（2026-11-20）

| ID | 场景 | 关键断言 | 关联 PRD（部分） | 结果 |
|---|---|---|---|---|
| E2E-01a | 首屏结构 | 三栏/对话区/右栏/输入框可见，结构稳定 | PRD-WORK-001、PRD-CONV-004 | PASS |
| E2E-01b | 375 响应式 | 无横向溢出；时间轴/侧栏按断点隐藏 | PRD-WORK-001 | PASS |
| E2E-02 | 发送与流式 | Enter 发送、WS 流式增量、mock 回复落地 | PRD-CONV-005、PRD-CONV-006 | PASS |
| E2E-03 | 输入键盘 | Enter/Shift+Enter 与发送模式反转符合预期 | PRD-CONV-006 | PASS |
| E2E-04a | 祖先逐级加载 | 逐级加载、时间轴增长、prepend 锚定 | PRD-CONV-007 | PASS |
| E2E-04b | 祖先 413 | 413 错误提示，不插入祖先 | PRD-CONV-007 | PASS |
| E2E-04c | 祖先 403 | 403 无权限，不插入祖先 | PRD-CONV-007 | PASS |
| E2E-04d | 空上级 | 空上级提示并可继续向上 | PRD-CONV-007 | PASS |
| E2E-05 | 消息接口 500 | 错误态可见，重试后恢复 | PRD-CONV-005 | PASS |
| E2E-06 | 右栏任务定位 | 点击任务定位并高亮消息 | PRD-TASK-002 | PASS |
| E2E-07 | 交付物 | 右栏/工作台可见，真实下载成功 | PRD-FILE-003、PRD-FILE-004、PRD-WORK-004 | PASS |

**执行结果**：11/11 passed、0 failed、exit 0；`results.json` 记录时间 `2026-11-20T07:29:32.051Z`；同一 runner 连续 5 次均为 11/11（`run-iter1..5.log`）。

## 3. 覆盖边界与未覆盖项

- 未覆盖：记忆、团队/智能体、调度、设置、工具/能力目录、远程访问/通知、上传/PDF/Office、真实模型长程、权限 fail-closed、多标签跨页同步。
- 未覆盖的 PRD 仍按 `missing` 或 `gap` 记录；E2E 11/11 不等于 71 个 PRD 已覆盖。
- 本 runner 不是 Playwright Test；`npm run test:e2e` 的 Playwright 普通路径仍受本机沙箱限制，CI 未实跑。
- E2E 使用隔离后端与临时 home，不能替代 8787 生产实例 smoke；8787 状态单独记录在 [`../../../docs/CONTINUITY.md`](../../../docs/CONTINUITY.md) §4.3。

## 4. 用例维护

1. 新增 E2E 场景必须关联至少一个 PRD，并写清前置、步骤、断言、隔离数据与清理。
2. 结果写回本表与 [`../../../docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md) 同类证据文件；同时回写对应域 test-plan 的“当前证据”。
3. 失败场景必须开缺陷/变更包，不得通过改断言掩盖。
4. 只有六类产物齐备且执行证据完整，才允许在 TRACEABILITY 升级 `covered`；单个 E2E 场景只算部分证据。
