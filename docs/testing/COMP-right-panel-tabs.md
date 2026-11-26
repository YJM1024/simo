# COMP-right-panel-tabs · 右栏三标签容器

| 项 | 内容 |
|---|---|
| 组件编号 | `COMP-right-panel-tabs` |
| 组件名称 | `RightPanel`（右栏三标签容器） |
| 状态 | `verified`（2026-11-26；随 26 条 AC 复核，独立组件签收未执行，不写 `accepted`） |
| Owner | 实现：前端（CHG-CONV-007 W3）；设计：设计（`specs/design/P1-CONV/spec.md` §17）；验收：独立验收 Agent（不得为实现者） |
| Used by | `PRD-CONV-009`、`CHG-CONV-007`；兼容 `PRD-CONV-008` 的概览投影 |
| 视觉基线 | `specs/design/P1-CONV/spec.md` §17 的 `V-CONV-009-*`；token 取自 `frontend/src/styles/tokens.css` |
| 复用来源 | 由 `PRD-CONV-008` 的两标签 `RightPanel` 扩展为三标签，`OverviewPanel` 保留为兼容别名 |

实现位置：`frontend/src/components/library.tsx` 的 `RightPanel`（`:1366`）、`OverviewContent`（`:1196`）、`OverviewPanel`（`:1302`）与 `RightTab`/`RIGHT_TABS`（`:1156`）；样式在 `frontend/src/components/components.css` 的 `.inspector`、`.insp-rail`、`.insp-head`、`.insp-body`、`.insp-foot` 块。

## 1 结构与边界

外层是 `aside.inspector[aria-label="会话右栏"]`，带 `data-session`、`data-tab`、`data-collapsed`、`data-drawer-open`。内部按视觉顺序是面板 `div.insp-panel`（order 1，含头、正文、脚）与竖条 `nav.insp-rail[aria-label="右栏导航"]`（order 2，视觉在右）。头 `.insp-head` 是当前标签名、计数文案、抽屉关闭按钮与收起按钮；正文 `#insp-panel[role=region]` 按当前标签渲染概览、任务或交付物；脚 `.insp-foot` 显示「任务 N · 交付物 M」。

边界有三条。容器只负责标签切换、收起、抽屉与角标，不持有任务数据，三个标签的内容由各自组件与 store 提供。760px 以下整栏不渲染，`<1024px` 收起时只留竖条。容器是可受控也可非受控的组件，画廊与组件测试可以不传 `tab`/`collapsed` 直接挂载，生产路径由 `app.tsx` 传入按会话保存的值。

## 2 变体

| 变体 | 触发条件 | 结构差异 | token 组 |
|---|---|---|---|
| 展开（默认，≥1024px） | `data-collapsed="false"` | 面板 280px 加竖条 40px，整栏 320px | `--rail`、`--rail-task-panel` |
| 收起 | 用户点当前标签或收起按钮 | 整栏 40px，面板 `hidden`，只剩竖条三按钮 | `--rail-strip` |
| 抽屉（760–1023px） | `isDrawerRange()` 为真且展开 | 遮罩加面板浮层，底部距由 `--insp-drawer-bottom` 控制 | 同上，加 `--overlay-scrim` |
| 零任务 | 会话内 `counts.all = 0` | 任务按钮带 `aria-disabled`，点击不切标签 | `--faint` |

四个变体共用同一 props 接口（`session`、`counts`、`tab`、`collapsed`、`onTab`、`onCollapsed` 等），公开 API 不因变体改变。

## 3 状态

展开变体矩阵：

| 状态 | 背景 | 文字 | 边框 | 透明度 | 光标 | 可交互 |
|---|---|---|---|---|---|---|
| default | `--surface` | `--ink` | 左侧 1px `--line` | 1 | default | 是 |
| hover | `--surface-2` | `--ink` | 同上 | 1 | pointer | 是（按钮与标签） |
| focus | `--surface` | `--ink` | 同上，加 2px `--focus` 外环 | 1 | pointer | 是 |
| active | `--accent-soft` | `--accent` | 同上 | 1 | pointer | 是（当前标签） |
| disabled | `--surface` | `--faint` | 同上 | 0.55 | not-allowed | 否（零任务的任务按钮） |
| loading | `--surface` | `--muted` | 同上 | 1 | progress | 否（标签内容骨架） |
| empty | `--surface` | `--muted` | 同上 | 1 | default | 是（空态占位文案） |
| error | `--surface` | `--danger` | 同上 | 1 | default | 是（内容区 `role="alert"` 加重试） |

收起变体没有 hover 与 active 的背景变化，只有按钮的焦点环；抽屉变体额外有遮罩层，遮罩透明度 1、底色 `--overlay-scrim`、`tabIndex={-1}` 不进 Tab 序；零任务变体的任务按钮固定 disabled 行。

## 4 尺寸与截图档

| 元素 | 宽 | 高 | 内边距 | 字号/行高 | 图标 | 备注 |
|---|---|---|---|---|---|---|
| 整栏展开 | 320 | 100% | — | — | — | 面板 280 + 竖条 40 |
| 整栏收起 | 40 | 100% | — | — | — | 只留竖条 |
| 竖条 | 40 | 100% | 顶部 8 | — | 18 | 间距 4，border-left 1px `--line-soft` |
| 竖条按钮 | 32 | 32 | — | — | 18 | 圆角 6 |
| 角标 | ≥14 | 14 | — | 9.5/14 | — | 右上溢出 3px，1.5px `--surface` 描边 |
| 头 | 100% | 44 | 0 12 | 12/600 | 收起 26×26 | 下边框 `--line-soft` |
| 正文 | 280 | 自适应 | 12/14 | 12/1.6 | — | 可滚动 |
| 脚 | 100% | 28 | 0 12 | 10/28 | — | 上边框 `--line-soft` |

断点四档：375 档整栏不渲染；768 档收起为 40px 竖条，展开为抽屉；1180 与 1600 档展开 320px、收起 40px。1280 是独立截图档，几何与 1180 档一致。

| 截图档 | 文件 | 覆盖 |
|---|---|---|
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-05-tab-overview.png` | 概览标签与四节 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-05-tab-tasks.png` | 任务标签与筛选条 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-05-tab-deliverables.png` | 交付物标签与分组 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-22-collapsed.png` | 收起态只剩竖条 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-21-breakpoint-1280.png` | 1280 档整栏几何 |
| 1280 | `.tmp/chg-007-final-run-3/shots/1280-20-empty-session.png` | 零任务空态 |
| 768 | `.tmp/chg-007-final-run-3/shots/768-01-collapsed.png` | 768 档收起竖条 |
| 768 | `.tmp/chg-007-final-run-3/shots/768-02-drawer.png` | 768 档抽屉展开 |
| 375 | `.tmp/chg-007-final-run-3/shots/375-01-no-inspector.png` | 375 档整栏不渲染 |

任务描述给的 `.tmp/chg-007-real-run-3/shots/` 不存在，上表按实际存在的 `.tmp/chg-007-final-run-3/shots/` 引用，同批 31 张与 `.tmp/chg-007-realrun/shots/` 同名同内容。

## 5 token 引用

| token | 回退值 | 作用域 |
|---|---|---|
| `--rail` | `320px` | 整栏展开宽度 |
| `--rail-task-panel` | `280px` | 面板与正文宽度 |
| `--rail-strip` | `40px` | 收起宽度与竖条宽 |
| `--insp-rail-w` | `40px` | 竖条宽 |
| `--surface` | `#FFFFFF` | 整栏底色 |
| `--surface-2` | `#F4F3EF` | hover 底 |
| `--line` | `#E6E4DE` | 左侧边框 |
| `--line-soft` | `#EFEDE8` | 头、脚、竖条分隔 |
| `--accent` | `#3D3DE0` | 当前标签图标与文字 |
| `--accent-soft` | `#EEEEFC` | 当前标签底 |
| `--danger` | `#C43D49` | 角标底色 |
| `--overlay-scrim` | `rgba(22,23,27,0.34)` | 抽屉遮罩 |
| `--focus` | `0 0 0 3px rgba(61,61,224,0.14)` | 焦点环 |

容器内不写十六进制颜色；宽高全部走 `--rail*` 与 `--size-*` 刻度，改主题时只换 token。

## 6 无障碍

| 检查项 | 检查方式 | 判定人 | 证据路径 |
|---|---|---|---|
| 键盘操作 | Tab 依次进入三个竖条按钮；Enter/Space 切换或开合；不实现方向键漫游 | 独立验收 Agent | `ACCEPT-CONV-007-R5-20261126.md` §7 |
| 焦点可见 | 2px `--focus` 外环；收起后焦点回竖条当前项 | 独立验收 Agent | `AC-CONV-009-08` 断言脚本 |
| 可访问名称 | 竖条 `aria-label="右栏导航"`；任务按钮名含进行中数；收起按钮名随状态切换 | 独立验收 Agent | `AC-CONV-009-08`、`-09` |
| 对比度 | 图标与文字对底色高于 4.5:1，角标白字对 `--danger` 按设计口径验收 | 独立验收 Agent | 设计 §17.13；未单独脚本化，记 missing |
| 错误识别 | 内容区错误 `role="alert"`，重试按钮可聚焦 | 独立验收 Agent | `AC-CONV-009-12` 的失败分支 |
| reduced-motion | 右栏 160ms 与筛选 100ms 过渡在 reduce 下归零 | 独立验收 Agent | CSS 已实现，脚本未单独断言，记 missing |
| 目标尺寸 | 竖条按钮 32×32，收起按钮 26×26（外扩命中区 ≥24×24） | 独立验收 Agent | `AC-CONV-009-08` 的尺寸断言 |

## 7 验收判据

| 编号 | 判据 | 断言方式 | 证据路径 | 判定 |
|---|---|---|---|---|
| A1 | 根节点 `aside.inspector[aria-label="会话右栏"]` 存在，展开 320±1、收起 40±1、内容区 280±1。Covers: `AC-CONV-009-08` | `node scripts/ac/AC-CONV-009-08.mjs` | `evidence.md` §1 | pass |
| A2 | 三个竖条按钮的 `data-tab` 顺序为 overview、tasks、deliverables，均 32×32，当前项 `aria-current="page"`。Covers: `AC-CONV-009-08` | 同上 | 同上 | pass |
| A3 | 收起后 `data-collapsed="true"` 且正文 `hidden`；刷新同会话仍收起，另一会话首开展开。Covers: `AC-CONV-009-08`、`-10` | `node scripts/ac/AC-CONV-009-08.mjs` | 同上 | pass |
| A4 | 角标 2 显示 `2`、10 显示 `9+`、0 不渲染；`counts.all=0` 时任务按钮 `aria-disabled="true"` 且点击不切标签。Covers: `AC-CONV-009-09` | `node scripts/ac/AC-CONV-009-09.mjs` | 同上 | pass |
| A5 | 概览四块 `data-block` 顺序为 goal、input、tasks、deliverables，折叠状态刷新保持。Covers: `AC-CONV-009-10` | `node scripts/ac/AC-CONV-009-10.mjs` | 同上 | pass |
| A6 | 点「还有 9 个」后标签为 tasks，首个未显示行顶边距滚动口 0–8px，500ms 采样 ±1px。Covers: `AC-CONV-009-11` | `node scripts/ac/AC-CONV-009-11.mjs` | 同上 | pass |
| A7 | 四片文案为「全部 11」「进行中 2」「失败 1」「已完成 3」，切换后列表只含对应展示态并回顶。Covers: `AC-CONV-009-12` | `node scripts/ac/AC-CONV-009-12.mjs` | 同上 | pass |
| A8 | 切会话后旧角标与旧列表 300ms 内消失，标签、收起与筛选保留，滚动位按会话记忆。Covers: `AC-CONV-009-17` | `node scripts/ac/AC-CONV-009-17.mjs` | 同上 | pass |
| A9 | 768 档首次加载收起，展开为抽屉并渲染遮罩，Esc 关闭；375 档整栏不渲染。边界 | `node scripts/ac/AC-CONV-009-08.mjs` 的断点分支 | `.tmp/chg-007-final-run-3/shots/768-02-drawer.png` | pass |
| A10 | `:root` 计算样式中 `--rail-task-panel` 为 280px、`--rail-strip` 为 40px、`--overlay-scrim` 与 `--success-ink` 可读出且值匹配。边界 | `node scripts/ac/AC-CONV-009-08.mjs` 的 token 分支 | 同上 | pass |
| A11 | 收纳盒与角标的对比度、reduce 动效。无障碍 | 人工：计算与模拟观察 | 设计 §17.13 | missing：无脚本留档，未计入 AC |

Covers 汇总：`AC-CONV-009-08`、`-09`、`-10`、`-11`、`-12`、`-17` 的前端侧，以及 `PRD-CONV-008` 概览投影的兼容约束。整包结论见 `docs/testing/ACCEPT-CONV-007-R5-20261126.md`：26 条 AC 全 pass、560 条断言。
