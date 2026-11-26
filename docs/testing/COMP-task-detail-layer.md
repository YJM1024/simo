# COMP-task-detail-layer · 任务详情只读层

| 项 | 内容 |
|---|---|
| 组件编号 | `COMP-task-detail-layer` |
| 组件名称 | `TaskDetailLayer`（任务详情只读层） |
| 状态 | `verified`（2026-11-26；复签未通过的 A3、A6 已按 D1/D2 修复，待复核，缺陷记录见 `docs/testing/COMP-SIGN-4-20261126.md` §4） |
| Owner | 实现：前端（CHG-CONV-007 W3）；设计：设计（`specs/design/P1-CONV/spec.md` §17）；验收：独立验收 Agent（不得为实现者） |
| Used by | `PRD-CONV-009`、`CHG-CONV-007` |
| 视觉基线 | `specs/design/P1-CONV/spec.md` §17 的 `V-CONV-009-*`；token 取自 `frontend/src/styles/tokens.css` |
| 复用来源 | 新增 |

实现位置：`frontend/src/components/tasks.tsx` 的 `TaskDetailLayer`（`:471`），内部复用 `StepItem`（`:682`）与 `TimelineTraces`（`:738`）；样式在 `frontend/src/components/components.css` 的 `.task-detail` 块（`:1250` 起）。开合由 `RightPanel` 在 `detail || detailTask` 时渲染，`mode` 取 `drawer` 或 `overlay`。

## 1 结构与边界

层是 `section.task-detail[role="dialog"][aria-modal="true"][aria-label="任务详情"]`，带 `data-task-id`、`data-mode`（`plan`/`explore`）、`data-layout`（`overlay`/`drawer`）、`data-collapsed`。内部只有头与正文两部分：头高 44px，左侧是「任务详情 · 计划/边做边想」与「只读」标记，右侧是唯一按钮 `.task-detail-close[aria-label="关闭任务详情"]`；正文可滚动，按模式渲染步骤列表或扁平时间线，末尾固定启动上下文、预算与产出文件。

边界按两种状态分别成立。正常态层内写操作入口为 0，重试、取消、编辑、删除、确认、恢复都不出现，表单控件为 0；层只读 N3 的返回与列表里的 `TaskView` 降级数据，不发写请求。错误态（详情接口失败）只在错误块里渲染恰好一个「重试」按钮，点击只重新拉一次详情（GET），不产生任何非 GET 请求，重试之外仍没有取消、编辑、删除、确认、恢复与表单控件。详情打开时 `inert` 只加中栏 `.conversation-panel` 与侧栏 `.sidebar`，右栏不加，右栏仍可指针点击。

## 2 变体

| 变体 | 触发条件 | 结构差异 | token 组 |
|---|---|---|---|
| 计划详情（默认） | `task.mode = plan` 且视口 ≥1024px | 单列步骤 `ol.task-steps`，当前步默认展开，轨迹内联在步骤下 | `--surface`、`--line`、`--ink` |
| 边做边想详情 | `task.mode = explore` | 扁平时间线 `ol.task-timeline`，步骤节点 0，当前动作最后一行 | 同上，加 `--accent` |
| 抽屉详情 | 视口 760–1023px | 覆盖抽屉内容区，宽度取面板值，不覆盖中栏 | 同上，加 `--overlay-scrim` |

三个变体共用同一 props 接口（`open`、`detail`、`fallbackTask`、`loading`、`error`、`mode`、`collapsed`、`jumpStepId`、`onClose`、`onRetry`、`onOpenFile`），公开 API 不因变体改变。

## 3 状态

| 状态 | 背景 | 文字 | 边框 | 透明度 | 光标 | 可交互 |
|---|---|---|---|---|---|---|
| default | `--surface` | `--ink` | 上、右 1px `--line` | 1 | default | 是 |
| hover | `--surface` | `--ink` | 同上，可点行底色 `--surface-2` | 1 | pointer | 是（关闭、步骤头、轨迹展开、加载更早、打开文件） |
| focus | `--surface` | `--ink` | 同上，加 2px `--focus` 外环 | 1 | pointer | 是 |
| active | `--accent-soft` | `--ink` | 同上 | 1 | pointer | 是 |
| disabled | `--surface` | `--muted` | 同上 | 0.55 | default | 否（加载中与错误态只有重试可点） |
| loading | `--surface` | `--muted` | 同上 | 1 | progress | 否（「任务详情加载中…」） |
| empty | `--surface` | `--muted` | 同上 | 1 | default | 是（「暂无步骤」「暂无轨迹」「这一任务还没有产出文件」） |
| error | `--surface` | `--danger` | 同上 | 1 | default | 是（`role="alert"` 加「重试」） |

计划与边做边想两个变体各有一张矩阵，差异只在空态文案与是否有步骤行；抽屉变体的状态矩阵与计划详情一致，仅几何不同。

## 4 尺寸与截图档

| 元素 | 宽 | 高 | 内边距 | 字号/行高 | 图标 | 备注 |
|---|---|---|---|---|---|---|
| 层（overlay） | 视口宽 − `--sidebar` − `--rail` | 视口高 − 90 | — | — | — | top 90，收起时右边界为 `--rail-strip` |
| 层（drawer） | `min(280px, 100vw − 48px)` | 抽屉内容区 | — | — | — | 760–1023px |
| 头 | 100% | 44 | 0 14 | 10.5/44 | 关闭 24×24 | 下边框 `--line-soft` |
| 标题 | 自适应 | 自适应 | — | 18/1.35 | — | 最多 2 行 |
| 「只读」标记 | 自适应 | 16 | 0 6 | 9.5/16 | — | 圆角 4 |
| 步骤头 | 100% | ≥28 | 0 4 | 12/1.5 | 展开箭头 12 | 未开始步无入口 |
| 轨迹行 | 100% | 自适应 | 4 0 | 11/1.6 | — | 文本最多 4 行 |
| 正文 | 100% | 自适应 | 12/14/32 | 12/1.6 | — | 可滚动 |

断点四档：375 与 768 档不渲染 overlay，768 档以抽屉覆盖内容区；1180 与 1600 档保持 overlay，宽度随视口变化。1280 是截图档。

| 截图档 | 文件 | 覆盖 |
|---|---|---|
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-11-plan-detail.png` | 计划详情与轨迹 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-12-explore-detail.png` | 边做边想 14 条轨迹 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-16-failed-detail.png` | 失败任务的只读详情 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-04-task-card-open.png` | 从消息卡打开详情 |
| 768 | `.tmp/chg-007-final-run-3/shots/768-02-drawer.png` | 抽屉档详情 |

375 档不渲染该层，记 N/A：`<760px` 时详情层不渲染，没有该档截图。任务描述给的 `.tmp/chg-007-real-run-3/shots/` 不存在，上表按实际存在的 `.tmp/chg-007-final-run-3/shots/` 引用。

## 5 token 引用

| token | 回退值 | 作用域 |
|---|---|---|
| `--surface` | `#FFFFFF` | 层底色 |
| `--line` | `#E6E4DE` | 上边框、右边框 |
| `--line-soft` | `#EFEDE8` | 头下边框、分隔 |
| `--ink` | `#16171B` | 标题与正文 |
| `--muted` | `#686B73` | 元信息、只读标记 |
| `--faint` | `#9A9CA4` | 计数与次要说明 |
| `--accent` | `#3D3DE0` | 当前步、跳转高亮 |
| `--danger` | `#C43D49` | 失败原因、错误文案 |
| `--success-ink` | `rgba(42,115,84,1)` | 已完成步骤 |
| `--surface-2` | `#F4F3EF` | 只读标记底、可点行 hover |
| `--size-90` | `90px` | overlay 顶边 |
| `--shadow-pop` | `0 18px 40px -20px rgba(22,23,27,0.28)` | 层阴影 |
| `--focus` | `0 0 0 3px rgba(61,61,224,0.14)` | 焦点环 |

层内不写十六进制颜色；抽屉宽度用 `--rail-task-panel` 与 `--rail-strip` 计算，不写死像素。

## 6 无障碍

| 检查项 | 检查方式 | 判定人 | 证据路径 |
|---|---|---|---|
| 键盘操作 | 打开后焦点进关闭按钮；Tab 在层内首尾循环；Esc 关闭并归还焦点；步骤头 Enter/Space 展开 | 独立验收 Agent | `ACCEPT-CONV-007-R5-20261126.md` §7 |
| 焦点可见 | 2px `--focus` 外环；跳转目标行 `tabindex="-1"` 一次性聚焦 | 独立验收 Agent | `AC-CONV-009-13` 的跳转断言 |
| 可访问名称 | 层 `aria-label="任务详情"`；关闭按钮名「关闭任务详情」；步骤头 `aria-expanded` | 独立验收 Agent | `AC-CONV-009-05` 断言脚本 |
| 对比度 | 正文 `--ink` 对 `--surface` 高于 4.5:1；`--faint` 仅用于非必要说明 | 独立验收 Agent | 设计 §17.13；未单独脚本化，记 missing |
| 错误识别 | 错误块 `role="alert"`，带原因与「重试」，出现即播报 | 独立验收 Agent | `AC-CONV-009-16` 的错误分支 |
| reduced-motion | 打开动画 150ms 在 reduce 下归零，状态与落点不变 | 独立验收 Agent | CSS 已实现，脚本未单独断言，记 missing |
| 目标尺寸 | 关闭按钮 24×24；可点行最小高 28；文件行「打开」≥32×24 | 独立验收 Agent | `AC-CONV-009-03` 与 `-07` 的入口计数断言 |

## 7 验收判据

| 编号 | 判据 | 断言方式 | 证据路径 | 判定 |
|---|---|---|---|---|
| A1 | 层根为 `role="dialog"`、`aria-modal="true"`，`data-task-id` 与打开来源一致。Covers: `AC-CONV-009-03` | `node scripts/ac/AC-CONV-009-03.mjs` | `evidence.md` §1 | pass |
| A2 | 启动上下文显示目标 1 条、历史消息 0 条。Covers: `AC-CONV-009-03` | 同上 | 同上 | pass |
| A3 | 正常态重试、取消、编辑、删除、确认、恢复各 0 个、关闭 1 个、表单控件 0 个；错误态恰好 1 个重试按钮，点击只重拉一次详情 GET、非 GET 请求 0 条。Covers: `AC-CONV-009-07` | `node scripts/ac/AC-CONV-009-07.mjs`、`AC-CONV-009-05.mjs` 的错误态分支与 `TaskDetail.test.tsx` | 同上 | verified（已按 D1/D2 修复，待复核） |
| A4 | 8 步示例第 6 步默认展开、第 5 步可点回看、第 7 步无箭头无 `tabindex`。Covers: `AC-CONV-009-05` | `node scripts/ac/AC-CONV-009-05.mjs` | 同上 | pass |
| A5 | 边做边想详情 14 行、步骤节点 0、分组 0、展开入口 0，时间单调不减。Covers: `AC-CONV-009-06` | `node scripts/ac/AC-CONV-009-06.mjs` | 同上 | pass |
| A6 | plan 与 explore 共用同一套截断：首屏最多 200 条，「加载更早」每次补 200 条，到 500 条后入口消失并显示「已显示最近 500 条，达到上限」，超过 500 条不再进 DOM，任何一条分支都不绕过。边界 | `node scripts/ac/AC-CONV-009-05.mjs` 的轨迹与上限分支、`TaskDetail.test.tsx` 的两条上限用例 | 同上 | verified（已按 D1/D2 修复，待复核） |
| A7 | ≥1024px 左边缘贴侧栏右缘、右边缘贴右栏面板左缘、顶边 90±1px、底边到视口底，误差 ≤1px。Covers: `D-17-01` | `node scripts/ac/AC-CONV-009-08.mjs` | 同上 | pass |
| A8 | 768 档覆盖抽屉，宽等于抽屉宽，任务图全屏；<760px 不渲染。边界 | `node scripts/ac/AC-CONV-009-08.mjs` 的断点分支 | `.tmp/chg-007-final-run-3/shots/768-02-drawer.png` | pass |
| A9 | 详情 Tab 焦点陷阱与 Esc 关闭，关闭后焦点回来源。无障碍 | `node scripts/ac/AC-CONV-009-13.mjs` 的焦点分支 | `ACCEPT-CONV-007-R5-20261126.md` §7 | pass |
| A10 | 从概览、厚卡或任务图跳转时目标行顶边距滚动口 0–8px，500ms 采样 ±1px。Covers: `AC-CONV-009-11` | `node scripts/ac/AC-CONV-009-11.mjs` | `evidence.md` §1 | pass |
| A11 | 加载、错误、空三种态各有独立文案，错误可重试。错误 | 人工：断网与 404 各触发一次 | `.tmp/chg-007-final-run-3/shots/1280-16-failed-detail.png` | pass |
| A12 | 对比度与 reduce 动效。无障碍 | 人工：计算与模拟观察 | 设计 §17.13 | missing：无脚本留档，未计入 AC |

Covers 汇总：`AC-CONV-009-03`、`-05`、`-06`、`-07`、`-11`、`-13` 与 `D-17-01` 的前端侧。整包结论见 `docs/testing/ACCEPT-CONV-007-R5-20261126.md`：26 条 AC 全 pass、560 条断言。
