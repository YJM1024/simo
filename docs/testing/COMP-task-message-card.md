# COMP-task-message-card · 消息流任务卡与汇总卡

| 项 | 内容 |
|---|---|
| 组件编号 | `COMP-task-message-card` |
| 组件名称 | `TaskMessageCard` / `TaskSummaryCard`（任务卡消息卡与汇总卡） |
| 状态 | `verified`（2026-11-26；随 26 条 AC 复核，独立组件签收未执行，不写 `accepted`） |
| Owner | 实现：前端（CHG-CONV-007 W3）；设计：设计（`specs/design/P1-CONV/spec.md` §17）；验收：独立验收 Agent（不得为实现者） |
| Used by | `PRD-CONV-009`、`CHG-CONV-007` |
| 视觉基线 | `specs/design/P1-CONV/spec.md` §17 的 `V-CONV-009-*`；颜色与尺寸 token 取自 `frontend/src/styles/tokens.css`（DESIGN.md v2 唯一来源） |
| 复用来源 | 新增 |

编辑与实现位置：`frontend/src/components/tasks.tsx` 的 `TaskMessageCard`（`:250`）与 `TaskSummaryCard`（`:309`），样式在 `frontend/src/components/components.css` 的 `.msg-task-card` 与 `.msg-task-summary` 块。判据与截图见 `specs/changes/CHG-CONV-007/evidence.md` 与 `docs/testing/ACCEPT-CONV-007-R5-20261126.md`。

## 1 结构与边界

单卡是 `article.msg-task-card[data-task-id][data-status]`，内部依次为卡头（「任务」标签、任务名、状态胶囊）、失败原因、等待原因、模式元信息、错误提示、动作行。动作行里「查看任务」恒在，等待确认时追加「确认」「取消」，等待资源时追加「恢复」。

汇总卡是 `article.msg-task-summary[data-batch-id]`，内部为卡头（「已创建 N 个任务」与展开/收起按钮）、前三条任务名的预览行、任务列表、错误块与「还有 N 条」入口。默认渲染 10 条，展开后渲染至多 100 条。

边界有两条。卡片只负责呈现与触发回调，不直接发请求，状态与计数由上层 store 与 N2/N3 提供。卡片不提供重试、编辑、删除入口；失败卡也只有「查看任务」，重试入口留在任务标签。

## 2 变体

| 变体 | 触发条件 | 结构差异 | token 组 |
|---|---|---|---|
| 单卡（默认） | `role=agent`、`category=task`、`taskId` 非空且无 `batchId` | 头 + 元信息 + 单个「查看任务」 | `--surface`、`--line`、`--r-8` |
| 汇总卡收起 | `batchId` 非空且 `taskCount ≥ 2`，默认态 | 10 条任务行 + 「还有 N 条」 | 同上，加 `--surface-2` |
| 汇总卡展开 | 用户点「展开」或「还有 N 条」 | 至多 100 条任务行，入口消失，出现「收起」 | 同上 |

三个变体的公开 props 不变：单卡收 `message`、`task`、`onOpen` 与可选 `onConfirm`/`onCancel`/`onResume`/`busy`/`error`/`readOnly`；汇总卡收 `message`、`tasks`、`total` 与可选 `expanded`/`error`/`onToggle`/`onRetry`/`onOpen`/`onOpenTask`。缺回调时卡片保持静态，行不可聚焦。

## 3 状态

单卡矩阵：

| 状态 | 背景 | 文字 | 边框 | 透明度 | 光标 | 可交互 |
|---|---|---|---|---|---|---|
| default | `--surface` | `--ink` | 1px `--line` | 1 | default | 是 |
| hover | `--surface` | `--ink` | 1px `--accent-line` | 1 | pointer | 是（仅按钮） |
| focus | `--surface` | `--ink` | 1px `--line` + 2px `--focus` 外环 | 1 | pointer | 是 |
| active | `--accent-soft` | `--ink` | 1px `--accent-line` | 1 | pointer | 是 |
| disabled | `--surface` | `--muted` | 1px `--line` | 0.55 | default | 否（`busy` 时确认/取消/恢复禁用） |
| loading | `--surface` | `--muted` | 1px `--line` | 1 | progress | 否（按钮文案「处理中…」） |
| empty | `--surface` | `--muted` | 1px `--line` | 1 | default | 是（任务未加载时标题取消息首行） |
| error | `--surface` | `--danger` | 1px `--line` | 1 | default | 是（错误行 `role="alert"`，入口保留） |

汇总卡矩阵：

| 状态 | 背景 | 文字 | 边框 | 透明度 | 光标 | 可交互 |
|---|---|---|---|---|---|---|
| default | `--surface` | `--ink` | 1px `--line` | 1 | default | 是（有回调时整卡可点） |
| hover | `--surface` | `--ink` | 1px `--accent-line` | 1 | pointer | 是 |
| focus | `--surface` | `--ink` | 1px `--line` + 2px `--focus` 外环 | 1 | pointer | 是 |
| active | `--accent-soft` | `--ink` | 1px `--accent-line` | 1 | pointer | 是 |
| disabled | `--surface` | `--muted` | 1px `--line` | 0.55 | default | 否（无回调时行不可聚焦） |
| loading | `--surface` | `--muted` | 1px `--line` | 1 | progress | 否（展开后拉取中） |
| empty | `--surface` | `--muted` | 1px `--line` | 1 | default | 否（`total=0` 时不渲染预览行） |
| error | `--surface` | `--danger` | 1px `--line` | 1 | default | 是（错误块带「重试」） |

## 4 尺寸与截图档

| 元素 | 宽 | 高 | 内边距 | 字号/行高 | 图标 | 备注 |
|---|---|---|---|---|---|---|
| 单卡 | 最宽 720 | 自适应 | 12/14 | 13/1.45 | 无 | 圆角 8，上外边距 8 |
| 状态条 | 2 | 卡高 | — | — | — | 左缘，按 `data-status` 取色 |
| 「任务」标签 | 自适应 | 16 | 0 4 | 10/16 | — | 圆角 4，底色 `--surface-2` |
| 打开按钮 | ≥120 | 24 | 0 8 | 12/24 | 箭头 10 | 命中区不小于 120×24 |
| 汇总卡 | 最宽 720 | 自适应 | 12/14 | 13/1.45 | — | 圆角 8 |
| 汇总条目 | 100% | 28 | 0 4 | 11/28 | 6px 状态点 | 单行截断 |
| 「还有 N 条」 | 100% | 28 | 0 8 | 11/28 | — | 与条目同高 |

断点四档：375 档卡片宽度跟随消息列并保留 16px 外边距；768 档最宽 720 不变；1180 与 1600 档同上。1280 是截图档，不改变尺寸。

| 截图档 | 文件 | 覆盖 |
|---|---|---|
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-02-create-task.png` | 单卡与创建后的消息流 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-03-batch-card.png` | 汇总卡收起态（2 条任务） |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-14-waiting.png` | 等待确认卡的内联确认/取消 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-15-cancelled.png` | 取消后的失败卡 |

任务描述给的 `.tmp/chg-007-real-run-3/shots/` 不存在；上表按实际存在的 `.tmp/chg-007-final-run-3/shots/` 引用，同批 31 张与 `.tmp/chg-007-realrun/shots/` 同名同内容。375/768 档未单独截任务卡，记 N/A：这几档任务卡随消息列同宽，没有独立断点行为。

## 5 token 引用

| token | 回退值 | 作用域 |
|---|---|---|
| `--surface` | `#FFFFFF` | 卡底色、按钮底色 |
| `--line` | `#E6E4DE` | 卡边框、分隔 |
| `--accent-line` | `#D6D6FA` | hover 边框 |
| `--accent-soft` | `#EEEEFC` | active 底色 |
| `--accent` | `#3D3DE0` | 进行中状态条与状态字 |
| `--danger` | `#C43D49` | 失败状态条、失败原因、错误字 |
| `--success-ink` | `rgba(42,115,84,1)` | 已完成状态条 |
| `--warning` | `#8A5B12` | 未开始状态条、等待原因 |
| `--muted` | `#686B73` | 元信息、模式文案 |
| `--surface-2` | `#F4F3EF` | 「任务」标签底 |
| `--r-8` | `8px` | 卡圆角 |
| `--focus` | `0 0 0 3px rgba(61,61,224,0.14)` | 焦点环 |

组件内不写十六进制颜色与一次性内联样式；圆角按实现取 `--r-8`，长期 spec §17.6.2 写的 10px 待回写。

## 6 无障碍

| 检查项 | 检查方式 | 判定人 | 证据路径 |
|---|---|---|---|
| 键盘操作 | Tab 进入「查看任务」→ Enter 打开；汇总卡展开按钮 Enter 切换 | 独立验收 Agent | `ACCEPT-CONV-007-R5-20261126.md` §7 |
| 焦点可见 | 2px `--focus` 外环、外偏移 2，未使用 `outline: none` | 独立验收 Agent | 同报告 §7；`.tmp/chg-007-final-run-3/shots/1280-14-waiting.png` |
| 可访问名称 | 打开按钮名「查看任务：<任务名>」，汇总卡展开按钮带 `aria-expanded` | 独立验收 Agent | `AC-CONV-009-01` 断言脚本 |
| 对比度 | 正文 `--ink` 对 `--surface` 高于 4.5:1；状态字对底色按 §17.13 口径不低于 4.5:1 | 独立验收 Agent | 设计 §17.13；未单独脚本化，记 missing |
| 错误识别 | 错误行 `role="alert"`，出现即播报一次，重试按钮可聚焦 | 独立验收 Agent | `AC-CONV-009-01` 断言的错误分支 |
| reduced-motion | 卡片本身无过渡；汇总卡展开 120ms 在 reduce 下归零 | 独立验收 Agent | CSS 已实现，脚本未单独断言，记 missing |
| 目标尺寸 | 打开按钮 ≥120×24，汇总条目高 28 | 独立验收 Agent | `AC-CONV-009-01` 的命中区断言 |

## 7 验收判据

| 编号 | 判据 | 断言方式 | 证据路径 | 判定 |
|---|---|---|---|---|
| A1 | `role=agent`、`category=task`、`task_id` 三者齐全才渲染卡片，缺一按普通消息渲染。Covers: `AC-CONV-009-01` | `node scripts/ac/AC-CONV-009-01.mjs` | `evidence.md` §1 | pass |
| A2 | 单卡「查看任务」命中区不小于 120×24，点击只触发一次打开。Covers: `AC-CONV-009-01` | 同上 | 同上 | pass |
| A3 | 12 条任务时汇总卡默认 10 条加「还有 2 条」，展开后 12 条且入口消失，收起回到 10 条。Covers: `AC-CONV-009-02` | `node scripts/ac/AC-CONV-009-02.mjs` | 同上 | pass |
| A4 | 等待确认卡有 1 个「确认」、1 个「取消」，等待资源卡有 1 个「恢复」，请求中全部禁用。Covers: `AC-CONV-009-14` | `node scripts/ac/AC-CONV-009-14.mjs` | 同上 | pass |
| A5 | 取消确认后卡面状态为失败、失败原因为「用户取消」。Covers: `AC-CONV-009-15` | `node scripts/ac/AC-CONV-009-15.mjs` | 同上 | pass |
| A6 | 失败卡与未开始卡都保留「查看任务」，点击只打开只读详情。Covers: `AC-CONV-009-01` | `node scripts/ac/AC-CONV-009-01.mjs` | 同上 | pass |
| A7 | 汇总卡 `data-batch-id` 与消息的 `batchId` 一致，条目 `data-task-id` 与任务一致。Covers: `AC-CONV-009-02` | 同上 | 同上 | pass |
| A8 | 无回调时汇总卡整卡不可点、条目不可聚焦。边界 | 人工：静态渲染后按 Tab 与 Enter 观察 | `.tmp/chg-007-final-run-3/shots/1280-03-batch-card.png` | pass |
| A9 | 对比度不低于 4.5:1。无障碍 | 人工：取 `--ink`/`--surface` 计算 | 设计 §17.13 | missing：未单独计算并留档 |
| A10 | reduce 下展开动画为 0ms。无障碍 | 人工：模拟 `prefers-reduced-motion` 观察 | CSS `components.css` | missing：脚本未覆盖 |

Covers 汇总：`AC-CONV-009-01`、`AC-CONV-009-02`、`AC-CONV-009-14`、`AC-CONV-009-15` 的前端侧。整包结论见 `docs/testing/ACCEPT-CONV-007-R5-20261126.md`：26 条 AC 全 pass、560 条断言。
