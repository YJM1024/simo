# COMP-conversation-panel · ConversationPanel（会话面板容器）

状态：**approved（用户已确认 message-cards 原型，2026-11-12；待前端实现）**
Owner：前端（实现）/ 产品（本 spec）/ 验收（截图与走查）
流程：`docs/process/component-system.md` §6.8 COMP spec；本文件只定义组件，不改代码。
视觉基线：`DESIGN.md`（当前唯一视觉基准）。**视觉基线已由用户确认（2026-11-12）**：灰底 / 白卡 / 居中 / Composer 同宽 / 标签对齐 / 右栏任务对齐；本组件不引入 M62 历史渐变规范。

---

## 1. 语义

**一句话**：中栏铺满灰底，白卡列独立居中；时间轴作为白卡左侧的绝对定位 gutter，不参与白卡的居中计算；消息只是卡内内容，不再是逐条卡片。

- 解决的问题：消息逐条白底/边框/阴影造成“卡片墙”，时间轴与消息被切成碎片，白卡在中栏里左右不对称；
- 关键布局：**白卡列的左右位置只由中栏宽度决定**；时间轴绝对定位在卡外左侧 gutter，开关/显隐时间轴不得让白卡中心移动；
- 不解决的问题：不改消息内容/气泡语义、不改时间轴交互、不改 Composer 功能；
- 使用场景：对话页中栏（唯一必需场景）；后续任何“消息流 + 导航轴”的只读页面可复用（第二处使用前需再评估）；
- 不用于：工作台、任务/团队/记忆页、右栏面板、弹窗内消息预览。

## 2. 结构

```text
ChatCenter（中栏；灰底纸面铺满，页面只负责布局）
├─ ConversationHeader（现有 PageHeader/ChatHeader）
│    白底、全宽横条、底部 1px line；不进入白卡圆角框
│
├─ ConversationStage（本组件根，relative；灰底延伸至全部 gutter/底部）
│   ├─ TimelineGutter（绝对定位白卡左侧；不参与白卡居中）
│   │   └─ TimelineSlot（复用现有 Timeline）
│   └─ ConversationSurface（白卡列；独立居中，唯一滚动/边框容器）
│       └─ MessageScroll（唯一滚动区）
│           └─ MessageList
│               ├─ MessageRow（透明）
│               └─ CardBlock（保留自身白底/边框；见 §5）
│
└─ ComposerCard（现有独立白卡，ConversationStage 外；外框与白卡同宽同中心）
```

层级关系：

1. **中栏灰底铺满**：`ChatCenter`/`ConversationStage` 背景为 `--paper`，覆盖左右 gutter、时间轴区域、卡片上下留白；灰底不是卡片背景；
2. **白卡列独立居中**：`ConversationSurface` 用 `width: min(var(--chat-column), calc(100% - 2 * var(--conversation-gutter-x)))` + `margin-inline:auto`；居中只相对中栏内容盒，**不含时间轴宽度**；
3. **时间轴是绝对 gutter**：`TimelineGutter` 为 `position:absolute; left: ...`，不占白卡列的布局宽度，不参与 flex/grid 居中；时间轴显隐/宽度变化时白卡中心不变；
4. **Header 与白卡分开**：Header 全宽白条；Header 底部 `1px line`；白卡顶部距 Header **12px**；不把 Header 包进白卡圆角框；
5. **Composer 在白卡外、与白卡同列**：保持现有独立白卡；Composer 外框宽度/居中沿用同一个 `--chat-column` 与 `margin-inline:auto`，左右边缘与白卡对齐；白卡底部与 Composer 间距 **16px**；不改 Composer 高度/内边距/按钮布局；
6. **消息透明**：MessageRow 不铺背景、不加边框/阴影/圆角；用户与智能体的区分靠头像/对齐/元信息；
7. **CardBlock 是内容卡片**：保留 `surface` + `line` 边框（必要时自身圆角），其边框是内容边界，不是第二层会话白卡；消息透明所以不出现双层白框。

> 居中硬规则：白卡中心 = 中栏内容盒中心（允许 ≤1px 亚像素/滚动条误差）；时间轴、右栏、滚动条都不得改变该中心。禁止用 `padding-left: timelineWidth` 或非对称 `margin` 把卡片“推”到视觉中心。

### 2.1 用户已确认的视觉基线（2026-11-12）

- **灰底**：中栏 `--paper` 铺满，白卡外 gutter/底部均为灰底；
- **白卡**：`surface` + 1px `line` + 圆角 12 + 无阴影；消息透明；
- **居中**：白卡列独立居中，时间轴绝对 gutter 不参与居中；
- **Composer 同宽**：Composer 外框与白卡共用 `--chat-column`/居中规则，左右边缘对齐，不改高度/内边距/按钮布局；
- **标签对齐**：Header 内会话标题/页内标签文字与白卡内容左基线对齐（同一内容 inset），不得因时间轴 gutter 或滚动条产生横向偏移；
- **右栏任务对齐**：右栏任务标题/首行与白卡顶部同一基线（Header 下 12px inset）；右栏宽度/内容变化不移动白卡中心，白卡居中也不把右栏任务推离基线。

## 3. 组件 API（受控，不含任意样式）

```ts
type ConversationPanelState = 'ready' | 'loading' | 'empty' | 'error'

interface ConversationPanelProps {
  /** 消息滚动区内容；通常为 MessageList */
  children: ReactNode
  /** 复用现有 Timeline；由页面传入，不在白卡/本组件内重写视觉 */
  timeline?: ReactNode
  /** 四态；ready 时渲染 children，其余显示对应状态 */
  state?: ConversationPanelState
  /** 空态；未传时用统一 EmptyState */
  empty?: ReactNode
  /** 错误态；未传时用统一 ErrorState，必须可重试 */
  error?: ReactNode
  /** 紧凑密度只影响内边距，不改变圆角/边框 */
  density?: 'normal' | 'compact'
  /** 可访问名称，默认“当前会话消息” */
  ariaLabel?: string
}
```

约束：

- **禁止** `className`、`style`、任意颜色/尺寸 props；
- 不提供 `shadow`、`radius`、`background` 覆盖；这些由 token 决定；
- 不提供 `header` slot：Header 是页面级全宽组件；本组件只负责灰底 stage + 居中白卡 + 时间轴 gutter；
- `timeline` 必须是已登记 Timeline 组件；Panel 不直接读会话数据、不 fetch；
- `state` 只负责展示态，不伪造加载/空/错误；页面按真实数据传入。

## 4. Tokens 与尺寸

### 4.1 Token 映射

| 用途 | Token | 值/规则 |
|---|---|---|
| 中栏纸面 | `--paper` | 灰底铺满（当前 DESIGN 的纸面 token） |
| 白卡表面 | `--surface` | `#FFFFFF` |
| 白卡边框 | `--line` | `#E6E4DE`，1px |
| 白卡圆角 | `--radius-panel`（本组件新增） | `12px` |
| 移动端圆角 | `--radius-panel-mobile` | `8px`（全出血场景可用 0） |
| 共享列宽 | `--chat-column` | 消息白卡与 Composer 共用；沿用现有消息列最大宽 **720px**；窄屏按下方公式收缩 |
| 水平 gutter | `--conversation-gutter-x` | 桌面 **16px**；375 **8px** |
| 垂直 inset | `--conversation-gutter-y` | 上 **12px**、下 **16px** |
| 消息背景 | 无 | `transparent`；不加背景/边框/阴影 |
| 阴影 | 无 | `box-shadow: none` |
| Header 底边 | `--line` | 1px |
| Composer 间距 | `--space-4` | 16px |

> `--radius-panel:12px`、`--chat-column`、`--conversation-gutter-*` 需在 tokens 单一来源登记并走设计确认；页面不得写死宽度/gutter。若设计系统拒绝新增 token，退回已批准值并重走本 spec，不得页面内硬编码。

### 4.2 尺寸

| 项 | 值 |
|---|---|
| 中栏背景 | `--paper` 灰底铺满；白卡外的 gutter/底部均为灰底 |
| 共享列宽 | 白卡与 Composer 均为 `min(var(--chat-column), calc(100% - 2 * var(--conversation-gutter-x)))`；桌面 720 上限 |
| 白卡水平定位 | `margin-inline:auto`；**相对中栏内容盒居中，不含 TimelineGutter** |
| 白卡垂直位置 | 顶部距 Header **12**；底部留白 **16**（与 Composer 的间距） |
| Header | 现有全宽 Header 高度不变；白底；底部 1px `line` |
| 白卡与 Header | 12px 间距（白卡顶部 inset） |
| 白卡与 Composer | 16px 间距（白卡底 inset；Composer 自身不再额外加 top margin） |
| Composer 外框 | 宽度 `min(var(--chat-column), calc(100% - 2 * gutter))`；`margin-inline:auto`；左右边缘与白卡对齐；**不改高度/内边距/按钮布局** |
| TimelineGutter | 绝对定位在白卡左侧；宽度复用现有 Timeline；与白卡间距 **8–12**；不占白卡布局宽度 |
| Timeline 垂直 | 与消息滚动区同高；不随消息内容滚动，不进入白卡边框 |
| 消息滚动区 | 填充白卡剩余高度；`min-height:0`；仅纵向滚动 |
| 白卡圆角 | 桌面 12；≤480px 为 8（或全出血 0） |
| 白卡边框 | 1px `line`；无阴影 |
| 白卡内边距 | 标准：上/下 12、左/右 16；紧凑：8/12；移动：左右 8 |
| CardBlock | 保留自身 `surface` + 1px `line`；不使用重阴影；与消息行间距按现有 Message 间距 |

**居中公式（硬要求）**：
- 中栏内容盒宽度 `W`；白卡与 Composer 共用宽度 `C = min(var(--chat-column), W - 2 * gutter)`；两者均 `margin-left = margin-right = (W - C) / 2`；
- 白卡与 Composer 中心均 `= W/2`，允许 **≤1px** 的亚像素/滚动条误差；
- 时间轴 `left = (W - C)/2 - timelineWidth - gap`（不足时按 §4.3 隐藏），**不得**影响 `C` 或 `margin-inline:auto` 的计算。

### 4.3 375 窄屏

- 白卡左右 gutter 改为 **8px**：`C = 100% - 16px`，卡片左右各 8；上 12、下 16 保持；
- 圆角降为 **8px**；若页面采用全出血，可用 **0**，但同一页面只能选一种；
- 白卡与 Composer 仍相对中栏内容盒居中（因左右 gutter 对称，中心不偏移）；两者左右各 8，外框 x/width/right 对齐；
- 消息正文可换行、不裁切、不横向滚动；代码块/表格如超宽，内部滚动，不撑破白卡；
- Timeline 按现有响应式规则隐藏；**隐藏时间轴不得让白卡左右边距变化**（仍各 8）；
- 中栏灰底仍铺满，白卡外左右各 8px 灰边可见；
- Composer 保持现有独立白卡，外框与白卡同宽同中心、左右各 8；不改高度/内边距/按钮布局；键盘弹出时不遮挡（沿用现有行为）。

### 4.4 TimelineGutter 空间不足

- 仅当白卡左侧有足够空间（`(W - C)/2 >= timelineWidth + gap + 8`）时显示绝对定位时间轴；
- 空间不足时隐藏时间轴（或折叠为悬浮按钮，另立 spec），**不压缩白卡宽度、不改变白卡中心**；
- 不得把时间轴放进白卡 padding 或用 `padding-left` 挤占白卡；时间轴显隐是叠加层，不是布局列。

## 5. CardBlock 与双层白框

- 消息行透明，CardBlock 才允许有白底/边框；这样面板边框、消息行、卡片三者不会叠加成“框套框”；
- CardBlock 使用现有 `Card` 的 `surface + line` 规则；**不再加外层白卡/消息背景**；
- 同一消息内多个 CardBlock 纵向排列，间距走组件 Stack，不在页面写 margin；
- 白卡只画**最外层一圈**边框；消息行、时间轴、滚动容器都不得再画第二圈会话边框；
- 禁止：`白卡白底 + MessageRow 白底 + CardBlock 白底` 三层同色叠加；禁止给 MessageRow 加 `border`/`shadow`。

## 6. 状态

| 状态 | 表现 | 说明 |
|---|---|---|
| `ready` | Header 全宽 + 灰底 + 居中白卡 + 左侧 Timeline gutter + 消息滚动 | 正常 |
| `empty` | 白卡内居中 EmptyState，Timeline 可保留/按 DESIGN 隐藏 | 不伪造消息；白卡边框仍完整 |
| `loading` | 白卡内 Skeleton 消息行；白卡尺寸不跳变 | 不显示“暂无数据”闪烁 |
| `error` | 白卡内 ErrorState + 重试；错误不遮 Header/Composer | 错误可读、可重试 |
| `streaming` | 消息透明；最后一条 agent 消息带现有流式光标/停止态 | 不新增背景/边框 |
| `long` | 仅 MessageScroll 纵向滚动；Timeline gutter 固定；滚动条不压白卡边框 | 不整页滚动 |
| `compact` | 仅内边距变化；圆角/边框/背景不变 | 用于窄高窗口 |

交互与 a11y：

- 白卡是 `section`（`aria-label`），不是 dialog；不抢焦点、不创建焦点陷阱；
- 时间轴沿用现有 `nav`/键盘行为；消息列表可键盘滚动；
- 新消息不改变 `aria-live` 策略（沿用消息组件）；白卡不做额外播报；
- `prefers-reduced-motion` 下白卡不引入新动画；只允许现有消息/流式动效；
- 焦点可见：不在白卡上画自定义 focus ring；内部控件沿用各自组件。

## 7. 组件画廊登记

- ID：`COMP-conversation-panel`
- 名称：`ConversationPanel`
- 分组：容器 / 会话
- 版本：v1（draft）
- Owner：前端；验收：产品 + schema-drafter
- 画廊必须包含：
  1. `ready`（带 Header 相邻示意、中栏灰底、白卡居中、TimelineGutter、2–3 条透明消息、1 个 CardBlock）；
  2. `empty` / `loading` / `error` 三态；
  3. **1600、1920、1180、375** 四档截图（前三档标注卡片中心 vs 中栏中心；四档均标注 Composer 与白卡左右边缘对齐；375 标注左右各 8）；
  4. “Header 全宽 + 白卡独立居中 + 时间轴绝对 gutter” 布局示意；
  5. 无双层白框的 CardBlock 示例；
  6. 时间轴显示/隐藏两种状态（白卡中心不变）；
  7. 标签与右栏任务基线标注（A13；含 1600/1180 各一张）。
- 登记后才允许 ChatPage 引用；页面代码不得写定制 CSS/内联 style/`!important`；
- 变更组件 API/圆角/边框/gutter/居中规则必须走新的 COMP spec 版本，不得页面内打补丁。

## 8. 验收标准

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 1600 桌面 | 中栏 `--paper` 灰底铺满；白卡宽度 720 上限、独立居中；1px line、12 圆角、无阴影；Timeline 在卡外左侧绝对 gutter |
| A2 | 1180 桌面 | 中栏灰底铺满；白卡中心与中栏中心 ≤1px；Timeline gutter 不压缩白卡、不与右栏重叠；消息区仅纵向滚动 |
| A3 | 375 窄屏 | 白卡左右各 **8px**；圆角 8（或 0）；无横向滚动/裁切；CodeBlock/表格内部滚动；Timeline 隐藏不影响卡片边距 |
| A4 | 消息视觉 | 所有 MessageRow 透明，无逐条背景/边框/阴影；用户/智能体区分仍可读 |
| A5 | CardBlock | CardBlock 保留自身白底/line 边框；白卡只有外圈边框；无双层白框 |
| A6 | Composer | Composer 在白卡外独立白卡；外框与白卡同宽同中心、左右边缘对齐；白卡底到 Composer 16；输入区不被白卡裁切；高度/内边距/按钮布局不变 |
| A7 | 状态 | empty/loading/error 不伪造数据；错误可重试；白卡尺寸不跳变 |
| A8 | 长会话 | 仅消息区滚动；Timeline gutter 固定；滚动条不压白卡边框；Header/Composer 不滚走 |
| A9 | 无定制 CSS | 页面无本组件相关 `<style>`/inline style/`!important`；只组合组件与布局类 |
| A10 | 画廊/回归 | 画廊登记并截图；tsc/build 通过；既有时间轴/消息/卡片/Composer 回归通过 |
| **A11** | **居中验收** | **1600/1920/1180：白卡中心 vs 中栏中心 ≤1px；375：白卡左右各 8px；时间轴显示/隐藏时白卡中心不移动** |
| **A12** | **Composer 对齐** | **1600/1920/1180：Composer 与白卡的 x/width/right 差均 ≤1px；375：两者左右各 8px；Composer 高度/内边距/按钮布局不变** |
| **A13** | **标签/右栏对齐** | **Header 标签文字与白卡内容左基线差 ≤1px；右栏任务标题/首行与白卡顶部 12px 基线差 ≤1px；时间轴显隐/右栏宽度变化不破坏上述对齐** |

## 9. 影响页面

- **ChatPage（必需）**：中栏改为灰底铺满；Header 全宽；白卡列独立居中；Timeline 以绝对 gutter 贴在白卡左侧；Composer 独立但与白卡同宽同中心；
- **Timeline / Message / CardBlock / Composer**：只读复用；Timeline 仅位置改为绝对 gutter；Composer 仅外框宽度/居中规则对齐，不改内部布局；
- **工作台/任务/团队/记忆/视图页**：不受影响（不使用该组件）；
- **右栏**：任务区不改变自身宽度/内容；任务标题/首行与白卡顶部 12px 基线对齐；白卡居中不把右栏任务推离基线；
- **标签**：Header 标题/Tab 文字与白卡内容左基线对齐，时间轴 gutter/滚动条不造成横向偏移；
- **响应式**：1600/1920/1180 桌面居中；375 白卡/Composer 左右 8；不改全局断点。

## 10. 非目标与风险

**非目标**：
- 不改 Header 内容/高度/阴影；不改 Composer 输入逻辑，也不改其高度/内边距/按钮布局；
- 不做消息虚拟列表、不做时间轴重设计、不做卡片视觉重构；
- 不引入新主题、渐变、玻璃拟态、第三方 UI 库。

**风险/权衡**：
- 去掉逐条消息背景后，用户/智能体区分必须靠头像/对齐/元信息；若可读性不足，优先加时间/角色标签，不回退逐条白底；
- 白卡白底 + CardBlock 白底可能弱化卡片边界；用 1px line 边框区分，禁止用阴影或第二层白底；
- 新增 `--radius-panel:12px` 与现有容器 10 不同：需设计系统批准并登记；若拒绝，按批准值回退并更新本 spec，不在页面硬编码。

---

*本文件只定义组件 spec；实现、画廊、截图、证据分别由后续 COMP 流程文件补齐。*
