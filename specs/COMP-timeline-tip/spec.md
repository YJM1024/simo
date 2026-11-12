# COMP-timeline-tip · TimelineTip（时间轴消息预览）

状态：**spec ready（待 Lead/设计确认；未实现）**
Owner：前端（实现）/ 产品（本 spec）/ 验收（截图与走查）
流程：`docs/process/component-system.md` §6.8 COMP spec；本文件只定义组件，不改代码/页面。
视觉基线：`DESIGN.md`（当前唯一视觉基准）；**前端等本 spec 确认后再实现，不得先改页面**。

---

## 1. 语义

**一句话**：当用户 hover 或用键盘 focus 时间轴上的某条消息刻度时，在旁边显示一张只读的「消息预览卡」，让人不跳转也能判断这条消息是谁、在哪个会话、何时发的、说了什么。

- 解决的问题：时间轴刻度信息量低，用户只能点击跳转后才知道消息内容；
- 不解决的问题：不替代点击跳转、不提供消息操作（复制/引用/重试）、不展示工具原始输出；
- 使用场景：ChatPage 的消息时间轴（Timeline）；这是唯一必需场景；
- 不用于：任务/团队/记忆/视图页、通知列表、文件列表、任何可编辑内容。

## 1.1 目标

在时间轴 tick 的 hover/focus 旁提供只读消息预览：发送方/会话/时间 + 两行摘要；视口内定位、滚动跟随、键盘可达；禁止原生 title、不做交互。

## 1.2 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | hover/focus tick 显示 tooltip；移出/Esc/blur 关闭 |
| R2 | MUST | 白底 surface、1px line、圆角 8、轻阴影、宽约 236 |
| R3 | MUST | 上栏发送方/会话/时间；下栏摘要最多两行截断 |
| R4 | MUST | 视口内 edge-clamped；滚动跟随不消失 |
| R5 | MUST | role=tooltip + aria-describedby；禁止原生 title |
| R6 | MUST | 登记画廊；页面不得复制 tooltip/写定制 CSS |

## 2. 结构

```text
TimelineTip（portal 到 body，position: fixed）
├─ TipSurface                 surface 白底 + 1px line + 圆角 8 + 轻阴影；宽 236
│   ├─ TipMetaRow             上栏：发送方 · 会话 · 时间
│   │   ├─ SenderText         “你” / “司墨”
│   │   ├─ DotSeparator       “·”
│   │   ├─ SessionText        当前会话标题（单行省略）
│   │   ├─ DotSeparator       “·”
│   │   └─ TimeText           HH:mm（tabular-nums）
│   └─ TipSummary             下栏：正文摘要；最多两行截断
└─ （无箭头、无操作按钮、无关闭按钮）
```

- Portal 到 body，避免被消息滚动容器裁切；
- Tooltip 本身 `pointer-events: none`，不抢 hover、不可交互；
- 锚点是时间轴刻度（tick）；位置按 tick 的实时 rect 计算；
- 上栏固定单行，会话名/发送方超长省略；时间不省略；
- 下栏最多两行，超出 `line-clamp: 2`；摘要只取正文/必要附件标签，不取工具 JSON、内部路径；
- 无箭头或可选 6px 小三角；**本版不做箭头**，靠 8px 间距与浮层阴影区分。

## 3. 组件 API（受控）

```ts
type TimelineTipState = 'hidden' | 'visible' | 'edge-clamped'
type TimelineTipSender = 'user' | 'agent'

interface TimelineTipProps {
  /** 是否显示；由 Timeline 交互状态控制 */
  open: boolean
  /** 锚点元素；必须为时间轴 tick 的 DOM 引用 */
  anchorRef: RefObject<HTMLElement>
  /** 发送方；用于“你/司墨” */
  sender: TimelineTipSender
  /** 当前会话标题（不含内部 id） */
  sessionTitle: string
  /** 消息时间，HH:mm；由上层格式化 */
  timeLabel: string
  /** 消息正文摘要；上层负责脱敏/截断前的原文 */
  summary: string
  /** 可选：无正文时的附件/图片标签 */
  fallbackLabel?: string
  /** 关闭回调（移出/Esc/blur）；不负责跳转 */
  onClose: () => void
  /** 位置/边界状态变化（测试与样式用） */
  onStateChange?: (state: TimelineTipState) => void
}
```

约束：

- 不接受 `className/style/width/color` 覆盖；宽/色/圆角/阴影全部走 token；
- 不接收原始消息对象；只接收已格式化的展示字段，避免组件里做业务判断；
- 不接收 HTML；summary 只渲染纯文本；
- 组件不处理点击跳转，点击仍由 Timeline tick 负责。

## 4. Tokens 与尺寸

| 用途 | Token | 规则 |
|---|---|---|
| 表面 | `--surface` / `--surface-solid` | `#FFFFFF`；浮层必须不透明 |
| 边框 | `--line` | 1px |
| 圆角 | `--radius-tip`（本组件新增） | **8px** |
| 阴影 | `--shadow-overlay` / `--shadow-tip` | 轻阴影，只用 DESIGN 的浮层阴影；禁止重阴影 |
| 字体 | `--font-sans` | 上栏 12px/1.4；摘要 13px/1.45 |
| 等宽 | `--font-mono` | 时间可用 `tabular-nums`；不整段 mono |
| 间距 | `--space-2` / `--space-3` | 上下 8、左右 10–12；上栏与摘要 6–8 |
| 宽度 | `--tip-width`（本组件新增） | **236px**（max-width；窄屏可降到 `min(236px, calc(100vw - 16px))`） |
| 层级 | `--z-jump` 或浮层层级 | 高于消息/时间轴，低于弹窗/命令面板 |
| 颜色 | ink / ink-secondary / muted | 上栏 meta `--ink-secondary`；摘要 `--ink`；辅助 `--muted` |

- 新增 `--radius-tip:8px` 与 `--tip-width:236px` 必须登记 tokens 单一来源；页面不得写死；
- 若 DESIGN owner 拒绝新增 token，回退到已批准的浮层圆角/宽度并重走本 spec，不得页面内覆盖；
- 轻阴影复用 DESIGN 现有浮层阴影；不新增第二套阴影。

## 5. 尺寸与定位

- 宽度 **236px**；最大不超过视口宽度减 16px；
- 与锚点间距 **8px**；默认放在 tick 右侧；右侧空间不足时翻到左侧（仍保持 8px）；
- 垂直方向与 tick 垂直居中对齐；超出视口上下时向视口内平移；
- 视口边距 **8px**：任何情况下 tooltip 不越出可视区域；
- **edge-clamped**：发生左右翻转或上下平移时进入该状态；内容不裁切、不换行溢出；
- 滚动时按 tick 的实时 rect 重新定位（`position: fixed`），**滚动不主动隐藏**；
- 若 tick 已不在可视区域，仍按最近边界 clamp，不因 scroll 事件闪没；由移出/Esc/blur/卸载关闭。

## 6. 状态

| 状态 | 触发 | 行为 |
|---|---|---|
| `hidden` | 初始；移出/失焦/Esc/卸载 | 不渲染或 `hidden`；`aria-describedby` 移除；无残影 |
| `visible` | tick hover 约 120ms，或键盘 focus | 展示完整结构；位置在视口内 |
| `edge-clamped` | 右侧不足/上下越界 | 翻转或平移后仍完整可见；状态标记供测试 |
| `scrolling` | 滚动容器/窗口滚动 | 保持 `visible`（或 `edge-clamped`），跟随锚点，不消失 |
| `reduced-motion` | `prefers-reduced-motion` | 无淡入/位移动画；直接显示/隐藏 |

交互规则：

- **hover 显示延迟 120ms**；移出后 **200ms grace** 再隐藏，避免经过 tick 间隙时闪烁；
- 键盘 `Tab` focus 到 tick 立即显示；`Esc` 关闭；blur 关闭；不抢焦点、不创建焦点陷阱；
- Tooltip 不响应点击；不包含按钮/链接/表单；
- 时间轴滚动时 tooltip 跟随；不会因滚动事件被隐藏；
- 同一时间只允许一张 tooltip；切换 tick 时更新锚点与内容，不叠加。

## 7. 可访问性（硬要求）

- `role="tooltip"`；唯一 `id`；触发 tick 的 `aria-describedby` 指向该 id（仅 visible 时挂载）；
- **禁止原生 `title`**：不得依赖浏览器 tooltip，也不得同时保留 title 造成双提示；
- 触发元素必须有可访问名称（如“消息 3，你，14:20”）；tooltip 只补充摘要；
- tooltip 内容不被屏幕阅读器当作可操作内容；不能用 `aria-live` 重复播报；
- 键盘 focus 可触发，`Esc` 可关闭；关闭后焦点仍在 tick；
- 对比度：摘要文字 ≥4.5:1，meta ≥3:1；不依赖颜色区分发送方（文字“你/司墨”）；
- 动效遵守 `prefers-reduced-motion`；tooltip 不阻塞消息滚动。

## 8. 组件画廊登记

- ID：`COMP-timeline-tip`
- 名称：`TimelineTip`
- 分组：容器 / 浮层；依赖：Timeline
- 版本：v1（draft）
- Owner：前端；验收：产品 + schema-drafter
- 画廊必须包含：
  1. hover 可见态（上栏“你 · 会话 · 14:20”，下栏两行摘要）；
  2. 键盘 focus 可见态 + focus ring（tick 上）；
  3. 右侧空间不足 → 左侧翻转的 `edge-clamped`；
  4. 长摘要两行截断；
  5. DPR2 截图 1600/1180/375；
  6. 无原生 title 的 DOM 证据（属性检查）。
- 登记后才允许 Timeline 使用；Timeline 页面不得复制 tooltip 实现或写定制 CSS。

## 9. 验收标准 A1–A8

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | hover tick | 120ms 内出现；白底/1px line/圆角 8/轻阴影/宽约 236；无原生 tooltip |
| A2 | 键盘 focus | Tab 到 tick 立即显示；`aria-describedby` 指向 tooltip；无 title 属性 |
| A3 | 滚动 | 滚动消息区/窗口时 tooltip 跟随锚点，**不消失**；位置不抖到视口外 |
| A4 | 移出/Esc/blur | 200ms grace 后隐藏；Esc 隐藏；blur 隐藏；焦点仍在 tick；无残影 |
| A5 | 视口边界 | 右侧不足翻左/上下越界平移；任何位置不越出视口；内容不裁切 |
| A6 | 内容 | 上栏发送方/会话/时间正确；下栏最多两行；长文字省略；不展示工具 JSON/内部路径 |
| A7 | 交互/层级 | tooltip 不可点击、不抢焦点、不遮挡关键操作；同一时刻仅一张；不造成布局跳动 |
| A8 | 截图/工程 | DPR2 的 1600/1180/375 截图；画廊已登记；页面无定制 CSS/内联 style；既有时间轴点击/键盘回归通过 |

## 10. 影响范围

- **Timeline 组件**：接入 hover/focus/scroll 锚点与 tooltip 显示；点击跳转逻辑不变；
- **ChatPage**：不改页面布局；不新增页面级 tooltip 代码；
- **组件画廊**：新增登记与截图；
- **消息/会话数据**：只读格式化字段（sender/sessionTitle/time/summary）；不新增查询、不复制消息数据；
- **不影响**：Composer、右栏、任务/团队/记忆页、时间轴点击跳转语义。

## 11. 非目标与风险

**非目标**：不做消息操作菜单、不做预览内跳转、不做附件缩略图、不引入第三方 tooltip 库、不改时间轴宽度/交互语义。

**风险/权衡**：
- 236px 在 375 视口可能占满；用 `min(236px, 100vw - 16px)` 与 edge clamp，不做响应式第二套宽度；
- tooltip 跟随滚动需要每帧/事件重算 rect；限制为 `requestAnimationFrame` 节流，避免滚动卡顿；
- 不依赖 title 后，键盘/屏幕阅读器必须依赖 `aria-describedby`；若实现遗漏，A2 直接失败；
- 新增 `--radius-tip`/`--tip-width` 需 tokens 登记；拒绝则回退批准值，不页面硬编码。

---

*本文件只定义组件 spec；实现、画廊、截图、证据分别由后续 COMP 流程文件补齐。前端等 spec 确认后实现，不先改页面。*
