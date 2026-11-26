# CHG-CONV-007 · 前端开发 spec（增量）

状态：implemented（2026-11-26 按实现复核；26 条 AC 全部 pass、560 条断言，验收报告 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)）
Implements: `PRD-CONV-009`
Covers: `AC-CONV-009-01` 至 `AC-CONV-009-18`（前端侧）
长期契约：[`specs/frontend/P1-CONV/spec.md`](../../frontend/P1-CONV/spec.md) §17（`:1039-1542`），本文件只写本变更的增量与实现落点
证据：[`evidence.md`](evidence.md) §1、§3、§6；截图目录 `.tmp/chg-007-final-run-3/shots/`

## 1 范围与边界

本变更在前端交付四组界面：消息流里的任务卡与汇总卡、右栏三标签容器、任务详情只读层、任务图只读弹窗，并把交付物按任务分组呈现。这些界面统一挂在会话页内，由会话归属决定可见范围，不新增浏览器路由。

边界有六条。任务执行、状态机与重试判定留在后端 `P2-TASK`，前端只展示后端下发的四态与等待原因。交付物的存储与下载实现归 `P4-FILE`，前端只发下载请求。详情层不提供重试、取消、编辑、删除、确认、恢复入口，写操作入口数为 0。前端不调用 N4（取消）与 N5（重试），等待确认的取消走 N6 的 `decision=cancel`，整链取消留给后续变更。既有 `PRD-CONV-008` 的投影、ETag 与 304 行为不变。画廊与组件测试可用非受控模式挂载 `RightPanel`，不影响生产路径。

## 2 文件与组件落点

| 文件 | 行数 | 本变更新增或改动的导出 | 职责 |
|---|---|---|---|
| `frontend/src/components/tasks.tsx` | 892 | `TaskBadge` `:78`、`TaskFilterBar` `:84`、`TasksTab` `:99`、`TaskCard` `:195`、`TaskMessageCard` `:250`、`TaskSummaryCard` `:309`、`DeliverablesTab` `:377`、`TaskDetailLayer` `:471`、`StepItem` `:682`、`TimelineTraces` `:738`、`layoutTaskGraph` `:770`、`TaskGraphDialog` `:798` | 任务域全部展示组件 |
| `frontend/src/components/library.tsx` | 1639 | `RightTab`/`RIGHT_TABS` `:1156`、`OverviewContent` `:1196`、`OverviewPanel` `:1302`、`RightPanel` `:1366` | 右栏容器、概览、收起与抽屉 |
| `frontend/src/app.tsx` | 1645 | 右栏标签、收起、筛选、滚动位按会话保存；详情与任务图开关 | 状态编排与请求触发 |
| `frontend/src/taskEvents.ts` | 147 | 六类任务事件的归并、去重与对账 | 事件合并与乱序缓冲 |
| `frontend/src/components/components.css` | 111997B | `.inspector` `.insp-rail` `.msg-task-*` `.task-detail*` `.task-graph-*` | 尺寸、颜色与断点 |
| `frontend/src/styles/tokens.css` | 180 | `--rail: 320px`、`--rail-task-panel: 280px`、`--rail-strip: 40px`、`--overlay-scrim`、`--success-ink` | 新增 token |

长期 spec §17.2.2 写这组任务组件落在 `library.tsx` 内，实现已拆到独立的 `tasks.tsx`；组件名、props 与判据不变，回写建议见 §12。

## 3 右栏三标签容器

结构为 `aside.inspector[aria-label="会话右栏"]`，内部依次是 `nav.insp-rail[aria-label="右栏导航"]`（order 2，视觉在右）、`div.insp-panel`（order 1，含 `.insp-head`、`.insp-body#insp-panel[role=region]`、`.insp-foot`）、详情层与任务图弹窗。`aside` 上带 `data-session`、`data-tab`、`data-collapsed`、`data-drawer-open`，供判据直接读属性，不依赖类名推断。

三个标签固定为概览、任务、交付物，`RIGHT_TABS` 的顺序即 DOM 顺序。当前项带 `aria-current="page"`，并带 `aria-controls="insp-panel"` 与 `aria-expanded`；任务按钮的 `aria-label` 由 `badgeLabel(countsRunning)` 生成，零任务时为「任务，0 个进行中」并带 `aria-disabled="true"`，点击不切换标签。角标只在 `countsRunning > 0` 时渲染，10 及以上显示 `9+`，节点带 `aria-hidden`，数字只通过按钮名称进入可访问名。

尺寸与展开收起：整栏展开 320px（面板 280 + 竖条 40），收起 40px，容器宽度立即落位，内容层 160ms。竖条宽 40px、按钮 32×32、间距 4px、顶部内边距 8px、图标 18px；`.insp-head` 高 44px、标题 12px/600、计数 10px；`.insp-body` 宽 280px、内边距 12/14；`.insp-foot` 高 28px。收起态写 `data-collapsed="true"`，面板加 `hidden`，并写 `localStorage` 键 `simo.insp.collapsed.<sessionId>`（`1`/`0`），存储不可用时退化为内存值。

760 至 1023px 为抽屉档：首次加载一律收起，只有本会话存过 `0` 才展开；展开时渲染遮罩 `button.insp-drawer-scrim[aria-label="关闭右栏"]`，面板底部距由 `.composer` 实测写入 `--insp-drawer-bottom`；Esc 关闭抽屉。1024px 及以上是整栏展开与收起两态；760px 以下整栏不渲染。

## 4 消息流任务卡

判定条件是 `role === "agent"`、`category === "task"` 与 `taskId` 非空，三者缺一按普通消息渲染，走既有四类消息分支。`batchId` 与 `taskCount` 决定单卡还是汇总卡。

单卡 `article.msg-task-card[data-task-id][data-status]` 最宽 720px，底色 surface，1px 边框，圆角 8px，内边距 12/14，左缘 2px 状态条（进行中用 accent、失败用 danger、已完成用 success-ink、未开始无条）。卡头是「任务」标签、任务名 13px/600 与状态胶囊，下面是模式与等待原因，失败原因最多 3 行。唯一打开入口是 `button.task-card-open`，`aria-label="查看任务：<任务名>"`、`aria-haspopup="dialog"`，最小 120×24。等待确认卡在入口右侧渲染「确认」「取消」，等待资源卡渲染「恢复」，请求进行中按钮禁用并显示「处理中…」；错误写 `.task-card-error[role="alert"]`。

汇总卡 `article.msg-task-summary[data-batch-id]` 与单卡共用底色与边框，卡头「已创建 N 个任务」，带前三条任务名的预览行与「展开」「收起」。默认平铺 10 条，每条 28px 高，第 11 条起不渲染，改为「还有 N 条」按钮；展开后用 `limit=100` 拉全量，入口消失，收起回到 10 条。整卡可点（`is-clickable`）时进任务标签，行可点（`onOpenTask`）时进对应任务详情；两个回调都不传时卡片静态，行不可聚焦。

## 5 任务标签与交付物标签

任务标签的筛选条 `.task-filter` 吸顶、高 40px，四片为全部、进行中、失败、已完成，计数取 N2 的 `counts`。列表每页 50 条，加载更多用 `.task-list-sentinel` 哨兵触发；首屏加载渲染 3 张骨架，错误用 `.task-list-error[role="alert"]` 并提供重试。切换筛选后列表回顶。

厚卡是整卡按钮 `button.task-card[data-task-id][data-status]`，宽 100%，内边距 10/11/9/12，圆角 10px；标题 12px/600 单行截断，状态胶囊 10px，计划卡带步骤刻度，边做边想卡带轨迹条数，失败说明最多 3 行。四态卡片均可点可聚焦，点击后打开详情并保持 `data-task-id` 一致。

交付物标签按任务分组。组头 28px 高，文件行 30px 高，类型徽标 28×18，行内「打开」按钮最小高 24px、命中区不小于 32×24；每页 50 个文件，`hasMore` 为真时显示「加载更多」。下载走 `downloadUrl`，预览走 `previewUrl`，前端不改写 URL。

## 6 任务详情只读层

详情层是 `section.task-detail[role="dialog"][aria-modal="true"][aria-label="任务详情"]`，带 `data-task-id`、`data-mode`（`plan`/`explore`）、`data-layout`（`overlay`/`drawer`）、`data-collapsed`。在 1024px 及以上以 `overlay` 定位：`top: 90px`、`bottom: 0`、`left: var(--sidebar)`、`right: var(--rail)`，收起时 `right: var(--rail-strip)`；z-index 40，底色 surface，上边框与右边框，阴影 `--shadow-pop`。760 至 1023px 以 `drawer` 覆盖抽屉内容区，宽度取 `min(280px, 100vw - 48px)` 与 CSS 实测值；760px 以下不渲染。

头高 44px，左侧是「任务详情 · 计划/边做边想」与「只读」标记，右侧唯一按钮 `.task-detail-close[aria-label="关闭任务详情"]`。打开时焦点进关闭按钮，`body` 滚动锁定，中栏 `.conversation-panel` 与侧栏 `.sidebar` 加 `inert`，右栏不加；Tab 在层内循环，首尾相接；Esc 关闭并把焦点还给来源元素。

计划模式按 `ol.task-steps` 单列渲染 `li.task-step[data-step-id][data-status]`。默认展开当前步，已完成步可点标题行回看，未开始步无入口、无 `tabindex`；步骤行展开后在下方内联渲染轨迹 `ul.task-traces`，每条默认 4 行截断，可单独展开。

边做边想模式渲染扁平时间线 `ol.task-timeline`，按发生顺序正序排列，步骤节点数为 0、分组数为 0、展开入口数为 0，当前动作在最后一行并带 `is-current`。

轨迹首拉 `traceLimit=200`，「加载更早」每次加 200，DOM 最多 500 条，超过后显示「仅显示最近 500 条」。从概览、厚卡或任务图跳转时，目标行顶边距滚动口 0 至 8px，并加 1.2s 高亮；跳转只聚焦目标行，不移动层本身。底部固定三块：启动上下文（目标 1 条、约束、输入、历史消息恒 0 条）、预算（已用/上限 tokens 与步数）、产出文件（空态文案 + 每行「打开」）。

## 7 任务图弹窗

入口是顶栏 `button.topbar-task-graph[aria-label="任务图"]`，高 28px，任务数为 0 时 `aria-disabled="true"`。弹窗 `div.task-graph-dialog[role="dialog"][aria-modal="true"]` 宽 920px、最大 `100vw - 48px`、高 `min(620px, 100vh - 80px)`、圆角 12px，头 44px，图例 32px；800px 及以下全屏、圆角 0。

节点是 `button.task-graph-node[data-task-id][data-status]`，尺寸 156×64，四列排布，列间距与行间距均 24px，画布内边距 24px；超过 20 个节点按后端 `layers` 分层，每层内每 4 个换行。边是 `path.task-graph-edge[data-from][data-to][data-style]`，1.4px 曲线，失败前置的边取 `dashed`、虚线 4/3、颜色 danger、透明度 0.55 并带失败箭头。缩放固定 1.0，不提供缩放控件；画布超出时可横向与纵向滚动。点节点先关弹窗再打开详情，焦点落在目标步骤行；Esc 关闭并回到顶栏入口。

## 8 数据来源与事件合并

九个接口的消费方与参数：N1 创建（客户端 `clientMutationId`、批量 1–12）、N2 列表（`status`、`mode`、`batchId`、`limit`、`before`）、N3 详情（`traceLimit=200`）、N6 确认、N7 恢复、N8 任务图、N9 交付物（`limit=10` 再 `limit=100`），N4 与 N5 不调。右栏概览的任务投影沿用 `taskLimit=3`。

事件侧消费 `task.created`、`task.updated`、`task.step`、`task.trace`、`task.report`、`task.reminder` 与 `message.created`。去重按事件 id 做 LRU 500，轨迹按 `traceSeq`、步骤按 `stepSeq` 去重；乱序事件进缓冲，发现序号空洞时 300ms 后重拉；重连后以 HTTP 结果对账，事件只补增量。切换会话时旧请求 `abort`，标签、收起、筛选保留，滚动位按会话记忆；详情与任务图关闭。

## 9 展示状态、错误与降级

前端只出现四个展示态：未开始、进行中、已完成、失败。`pending` 汇总后端的未开始、排队与阻塞，`failed` 汇总失败、已取消与已中断；筛选四片与展示态一一对应。

任务域十个错误码的处理：`task_not_found` 关闭详情并刷新列表且不提示无权限；`task_state_conflict` 用 `currentStatus` 刷新并隐藏不适用入口；`invalid_task_mode` 回退计划模式；`invalid_task_status` 筛选重置为全部；`invalid_task_limit` 钳制到 1–100；`task_batch_too_large` 提示上限 12 并拆批；`invalid_task_dependency` 就地提示并阻止提交；`task_context_too_large` 提示删减；`permission_denied` 显示为工具调用失败且不重试；`task_executor_unavailable` 禁用发起入口并提示稍后重试。其余错误按 `specs/frontend/P1-CONV/spec.md` §17.9.3 的 39 码表处理。

加载态与空态分开：列表首屏骨架 3 张，详情首屏「任务详情加载中…」，任务图首屏「任务图加载中…」；空态分别为「本会话还没有任务」「暂无步骤」「暂无轨迹」「这一任务还没有产出文件」。列表 500、详情 404、304 投影复用、断线与切会话六种场景各有独立表现，均不清空其它标签的已加载数据。

## 10 无障碍

竖条三个按钮按 Tab 依次进入，Enter/Space 切换或开合，不实现方向键漫游。收起按钮的名称在「收起右栏」与「展开右栏」之间切换，带 `aria-expanded` 与 `aria-controls`。筛选是 `role="group"[aria-label="任务筛选"]`，每片 `aria-pressed`，名称含计数。消息卡的打开区是命名按钮，汇总卡的展开按钮带 `aria-expanded`。详情与任务图都是模态对话框，焦点进层、Tab 循环、Esc 关闭并归还焦点；详情打开时 `inert` 只加中栏与侧栏。错误行内 `role="alert"`。焦点环统一 2px `--focus`，不用 `outline: none` 去掉。`prefers-reduced-motion: reduce` 时右栏 160ms、详情 150ms、任务图 150ms、筛选 100ms 过渡全部归零，状态与落点不变。

## 11 验收对应

| AC | 前端承载 | 主要判据 |
|---|---|---|
| `AC-CONV-009-01` | `TaskMessageCard`、`TaskSummaryCard` | `F-CONV-009-10` `-12` `-13` |
| `AC-CONV-009-02` | `TaskSummaryCard` | `F-CONV-009-11` |
| `AC-CONV-009-03` | `TaskDetailLayer` 启动上下文 | `F-CONV-009-16` |
| `AC-CONV-009-05` | 计划步骤 `StepItem` | `F-CONV-009-19` |
| `AC-CONV-009-06` | 边做边想 `TimelineTraces` | `F-CONV-009-20` |
| `AC-CONV-009-07` | 详情只读边界 | `F-CONV-009-16` |
| `AC-CONV-009-08` | `RightPanel` 三标签与几何 | `F-CONV-009-01` `-02` |
| `AC-CONV-009-09` | 角标与零任务 | `F-CONV-009-04` |
| `AC-CONV-009-10` | 概览四节与折叠记忆 | `F-CONV-009-05` |
| `AC-CONV-009-11` | 概览「还有 N 个」跳转 | `F-CONV-009-07` |
| `AC-CONV-009-12` | 任务标签筛选与厚卡 | `F-CONV-009-06` `-08` `-09` |
| `AC-CONV-009-13` | `TaskGraphDialog` | `F-CONV-009-23` `-24` `-25` |
| `AC-CONV-009-14` | 等待确认与等待资源内联动作 | `F-CONV-009-14` |
| `AC-CONV-009-15` | 取消确认后的四态与失败原因 | `F-CONV-009-15` |
| `AC-CONV-009-17` | 会话归属与切换清理 | `F-CONV-009-28` |
| `AC-CONV-009-18` | 无系统超时与时限提醒 | `F-CONV-009-27` |
| `D-17-01` | 详情覆盖中栏的几何 | `F-CONV-009-17` |
| `V-39` | 三档断点 | `F-CONV-009-18` |

`AC-CONV-009-04` 与 `-16` 的判据主要落在后端与端到端，前端侧对应 `F-CONV-009-03` 的收起持久化与 `F-CONV-009-16` 的只读入口计数。

## 12 与长期 spec 的差异与回写建议

实现与长期 spec §17 有四处差异，均不改变判据。任务组件已从 `library.tsx` 拆到 `tasks.tsx`，行号整体位移。消息卡与汇总卡的实际圆角是 8px（`--r-8`），§17.6.2 写 10px，应以 CSS 为准回写。token 定义文件是 `frontend/src/styles/tokens.css`，不是 §17.2.1 隐含的组件目录。抽屉档关闭按钮与遮罩同时存在时，遮罩 `tabIndex={-1}` 不进入 Tab 序，§17.10 未写明，建议补一句。

## 13 验收结论与证据

本变更前端侧随整包签发：26 条 AC 全部 pass、560 条断言（产品 AC 367 + 变更级 AC 193），独立验收报告为 [`ACCEPT-CONV-007-R5-20261126.md`](../../../docs/testing/ACCEPT-CONV-007-R5-20261126.md)，真机 16 条路径全部 pass、31 张截图。证据入口是 [`evidence.md`](evidence.md) §1 的 AC 证据表与 §3 的接口证据。截图实际落在 `.tmp/chg-007-final-run-3/shots/` 与 `.tmp/chg-007-realrun/shots/`（同名同内容 31 张）；任务描述给的 `.tmp/chg-007-real-run-3/shots/` 目录不存在，本文件按实际目录引用。

未验证项一条：三份组件 spec 已建并随 AC 复核为 `verified`，独立组件签收尚未执行，因此不写 `accepted`，见产品 spec 六类状态的组件列。
