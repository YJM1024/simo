# P1-CONV 整线签字复核（2026-11-22）

复核对象为会话域 12 个 PRD、33 条生效 AC。判定依据是每条 AC 是否有可复现的证据链，以及证据是否覆盖 AC 原文的判定口径；本轮不重复测试、不改代码、不改 spec，只核对测试 spec 行、验收报告、真机截图与命令输出。基线报告为 `docs/testing/ACCEPT-CONV-5-20261122.md`（第 5 轮全量验收）与 `docs/testing/ACCEPT-CONV-6-20261122.md`（第 6 轮只验 `AC-CONV-007-02`）。

**签字结论：不予整线签字。** 33 条生效 AC 中 29 条通过、1 条部分通过、3 条证据不足；12 个 PRD 中 9 个 covered、1 个 conditional、2 个 not covered，缺口集中在停止的真实中断、右栏 spec-projection 304 的真机视觉，以及 IME 环境限制。

## 1. 逐 PRD 结论

| PRD | 决定性 AC | 证据位置 | 结论 |
|---|---|---|---|
| PRD-CONV-001 会话树与主会话 | 001-01、001-02、001-05 | `ACCEPT-CONV-5` §2（`ui1.json`/`ui4.json`，8787 真机）；test-plan §1 第 1/2/34 行 | covered |
| PRD-CONV-002 会话生命周期 | 002-01、002-02 | `ACCEPT-CONV-5` §2（`ui6b`/`ui6e`，四种失败分别实测）；test-plan §1 第 5/6 行 | covered |
| PRD-CONV-003 搜索与未读 | 003-01、003-02、003-03 | `ACCEPT-CONV-5` §2（`ui4.json`，只走 `/api/sessions?q=`）；test-plan §1 第 7–9 行 | covered |
| PRD-CONV-004 消息流与渲染 | 004-01、004-02、004-03 | `ACCEPT-CONV-5` §2（`ui11`/`ui13`，1600 与 375 下 code/长文零溢出）；test-plan §1 第 10–12 行 | covered；组件 `conversation-panel` 另见条件清单 |
| PRD-CONV-005 发送与流式 | 005-01、005-02 | `ACCEPT-CONV-5` §2 判两条均“部分通过”（停止未真中断）；test-plan §16.2 G12 仍开放；§1 第 15/16 行标 pass 但无新验收 | not covered |
| PRD-CONV-006 Composer 与快捷键 | 006-01、006-02 | `ACCEPT-CONV-5` §2（快捷键/持久化通过；IME 无环境）；test-plan §1 第 18 行 partial、§15 M-05 | conditional |
| PRD-CONV-007 祖先消息与时间轴 | 007-01、007-02 | `ACCEPT-CONV-6` 全篇（8787 + CDP 9223、1600×1000：命中 27/27、末尾 3/3、任意 y 10/10）；截图 `accept6-*.png` | covered |
| PRD-CONV-008 右栏会话投影 | 008-04（连带 008-03） | test-plan §1 第 33 行：前端 304 只有 `api.test.ts:244`/`:260` 等 jsdom；`ACCEPT-CONV-5` §5.1 判 008-04 fail 后无独立复验；真机 304 是会话列表不是 spec-projection | not covered |
| PRD-SYNC-001 WS 连接与续传 | SYNC-001-01、001-02 | `ACCEPT-CONV-5` §2（`ui9b`/`ui9c`：重连、since 9902 恰补一次）；test-plan §1 第 19/20 行 | covered |
| PRD-SYNC-002 跨标签 active/祖先 | SYNC-002-01、002-02 | `ACCEPT-CONV-5` §2（`ui10`/`ui11`，两标签实测 tiebreak 与降级）；test-plan §1 第 21/22 行 | covered |
| PRD-SYNC-003 发送模式跨标签 | SYNC-003-01、003-02 | `ACCEPT-CONV-5` §2（`ui4b.json`，两标签一致、无通道降级）；test-plan §1 第 23/24 行 | covered |
| PRD-SYNC-004 未读与已读游标 | SYNC-004-01、002、003 | `ACCEPT-CONV-5` §2（`ui12`/`ui12g`：两标签未读点、读失败不假已读、重启保持）；test-plan §1 第 25–27 行 | covered |

## 2. 通过

- PRD-CONV-001、002、003、004、007、PRD-SYNC-001、002、003、004 共 9 个 PRD 的 AC 均有第 5/6 轮独立验收的真机、HTTP 或双标签证据，证据行可回到 test-plan §1 与对应 JSON。
- 组件 `message-colors`、`timeline-groups`、`timeline-tip` 为 accepted（`COMP-SIGN-20261121.md` §7，`COMP-SIGN-3-20261122.md` §7 抽查不回归）；`composer-send-mode` 为 accepted（`COMP-SIGN-3-20261122.md` 结论表，A5 七态全过）。

## 3. 条件通过

- **PRD-CONV-006**：`AC-CONV-006-01` 通过，`AC-CONV-006-02` 维持 partial。真实中文 IME 的候选词、全角回车与上屏时序无法用 jsdom 证明，需按 test-plan §15 M-05 人工验证；第五轮记录的“无会话禁用态不可达”现由组件断言承接，本轮未真机复验。
- **组件 `conversation-panel`**：只差 A3“表格超宽时内部滚动”。实现已落 `frontend/src/components/library.tsx:442-446`（`.msg-table-wrap`，`role=region`、`tabIndex=0`）与 `frontend/src/components/components.css:159`（`max-width:100%; overflow-x:auto`）；真机用例 `frontend/src/components/MessageTableLayout.test.tsx:50`/`:68` 在 1180/375 两档断言表格在包裹层内滚动、页面不横溢，但该用例 `skipIf(!browser)` 本轮 2 条 skip。`COMP-SIGN-3` 的 rejected 基于 02:52 前的构建（`library.tsx` 改于 12:42、CSS 改于 12:49），修复后没有复签与截图，故给 conditional。

## 4. 不通过

- **PRD-CONV-005**：`AC-CONV-005-01`/`005-02` 标 pass，但第 5 轮独立验收判两条均“部分通过”，原因是 mock 回复约 10ms 内已完成，停止未真正中断流；`specs/test/P1-CONV/test-plan.md:811` 的 G12“停止的真实后端中断（非仅前端忽略 delta）”仍开放，无 abort 请求断言。此后没有针对这两条的独立复验，矩阵的 pass 属自述升级，证据不覆盖“停止后不再增长/不追加”的原文口径。
- **PRD-CONV-008**：`AC-CONV-008-04` 要求“304 时前端不重复渲染、不闪空”，当前证据只有 `frontend/src/api.test.ts:244`/`:260` 与 `App.conversation.test.tsx:633` 等 jsdom 断言；第 5 轮已明确判定当时前端不发 `If-None-Match`、304 变错误态，且指出 2026-11-21 23:31 的真机 304 属会话列表 ETag，不能作为 spec-projection 证据。修复后没有真机 304 复验；`AC-CONV-008-03` 本轮同样没有像素截图，`ExecRowHitArea.test.tsx:254` 的 CDP 几何用例 4 条 skip（test-plan §1 第 32 行）。该 PRD 不满足签字条件。

## 5. 未验证项与风险

- `AC-CONV-005-01`/`005-02`：真实模型端点返回 403，流式与停止只有 mock；后端中断语义（G12）未断言，补证需可控假模型或本地推理通道。
- `AC-CONV-008-04`：需在 8787 真机上对 spec-projection 发一次带 `If-None-Match` 的条件请求，确认 304 空体后右栏不闪空、展开态不丢；本轮无浏览器（CDP 9223 无监听）。
- `AC-CONV-008-03`：375 的“不遮挡 Composer/发送按钮”有第 5 轮真机几何与历史 CDP 证据，但本轮 `ExecRowHitArea.test.tsx:254` 4 条 skip，无截图；抽屉打开态的遮挡仍归 §15 M-02。
- `AC-CONV-007-02`：403 只能 mock（单用户后端不可构造）；`touchstart`/`pointerdown` 释放、末尾超 3 秒稳定性、75 根刻度穷举、窄屏分支未验。
- `AC-CONV-004-01`：表格真实滚动与链接 computed 样式本轮未取，`MessageTableLayout.test.tsx` 2 条 Chromium 用例 skip；`AC-CONV-008-02` 的 `locateTask` 仍无组件级断言（G16），第五轮真机已点击下载并触发 `downloadWillBegin`。
- `AC-CONV-008-05` 的 G18 负路径未实现（`OverviewPanel` 补取失败时整栏换错误态、会卸载已加载列表），AC 原文只要求“可见错误并可重试”，不阻塞该条，但组件结构风险保留。
- `docs/product/TREE.md:88` 与 `docs/product/TRACEABILITY.md:20` 仍记“0 covered / 12 partial / 1 gap”，与本报告不一致；本报告只出复核结论，状态回写由 owner 执行。

## 6. 本轮排除项

- `AC-SYNC-005-01`/`005-02` 两条 blocked（产品明确 `unimplemented`），PRD-SYNC-005 保持 gap，不纳入本次签字。
- `AC-CONV-002-03`（删除会话）为显式非目标与 backlog，不在 33 条生效 AC 内。
