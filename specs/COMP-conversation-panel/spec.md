# COMP-conversation-panel · ConversationPanel（会话面板容器）

状态：**accepted（2026-11-22 复签）**。
Owner：前端（实现）/ 产品（本 spec）/ 验收（截图与走查）
流程：`docs/process/component-system.md` §6.8 COMP spec；本文件只定义组件，不改代码。
视觉基线：`DESIGN.md`（当前唯一视觉基准）。**视觉基线已由用户确认（2026-11-12）**：灰底 / 白卡 / 居中 / Composer 同宽 / 标签对齐 / 右栏任务对齐；本组件不引入 M62 历史渐变规范。
证据：A4/A5/A12 与画廊截图**待重拍**（现有 `frontend/review/` 截图 mtime 2026-11-12/13，早于当前源码 2026-11-21 20:29）。

---

## 0. 2026-11-21 裁决：按现状契约化（本版基线）

审计 `docs/plan/COMP-AUDIT-20261121.md` §2 认定本契约的"单白卡 + 消息透明"与实现直接冲突。Lead 裁决如下，本节优先于后文任何冲突表述：

1. **阶段 1 目标态 = 现状：容器透明 + 每条消息一张白卡。**
   实现：`.conversation-panel { background: transparent; border: 0; border-radius: 0 }`（`frontend/src/components/components.css:832-845`）；`.conversation-panel .msg { padding:12px 14px; margin:0 0 9px; background: var(--surface); border:1px solid var(--line); border-radius: var(--r-10); box-shadow:none }`（`components.css:856-863`）。
2. **"单白卡容器 + 消息透明"降为 v2 候选，不采纳。** 理由三条：
   - 属于全局视觉重构：会连带改写 `COMP-message-colors`（时间轴/标签在卡内）、`COMP-timeline-groups`（gutter 与卡的相对位置）、`COMP-timeline-tip`（锚点几何）与 Composer 的对齐口径，等于 5 个 COMP 同时改版；
   - 全部现存截图失效，五档（375/768/1180/1280/1600/1920）需重新真机重拍与复验，本阶段无法完成；
   - 阶段 1 的定位是**收口**不是重构（`docs/plan/MASTER-PLAN.md` §1.6 阶段出口为真机验证，不是视觉改版）。
   v2 入口：新开 `specs/changes/CHG-CONV-*/`，在其中同时修订本文件、`COMP-message-colors`、`COMP-timeline-groups`、`COMP-timeline-tip` 的几何断言与四档截图要求；未开 CHG 前不得在页面上先行改造。
3. **CardBlock 双层白框（`components.css:856-863` + `:866-872`）= 已知缺陷，不是契约。** 判据见 §5.1；修复方向为"卡片内层不再叠一层白底"（保留 1px `--line` 边框作为边界）。
4. **本文件中"白卡"一律指"消息卡"**（`.msg`，外框宽 680 = 720 − 2×20 内边距）；容器（`.conversation-panel`，720）称"面板"。A12 的"白卡"按本定义判定。

---

## 1. 语义

**一句话**：中栏铺满灰底，消息列独立居中（宽 720 上限）；时间轴作为消息列左侧的绝对定位 gutter，不参与居中计算；**每条消息是独立的圆角白卡**，卡片消息（CardBlock）嵌在消息卡内。

- 解决的问题：时间轴与消息列被切成碎片、消息列在时间轴出现时左右不对称；
- 关键布局：**消息列的左右位置只由中栏宽度决定**；时间轴绝对定位在列外左侧 gutter，开关/显隐时间轴不得让消息列中心移动；
- 不解决的问题：不改消息内容/气泡语义、不改时间轴交互、不改 Composer 功能；
- 使用场景：对话页中栏（唯一必需场景）；后续任何"消息流 + 导航轴"的只读页面可复用（第二处使用前需再评估）；
- 不用于：工作台、任务/团队/记忆页、右栏面板、弹窗内消息预览。

## 1.1 目标

把会话区收敛为可复用的列容器：中栏灰底铺满、消息列独立居中、时间轴绝对 gutter、Composer 外置且与消息卡同宽；面板本身不画边框，边界由每条消息卡提供。

## 1.2 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 中栏灰底铺满，消息列独立居中；时间轴绝对 gutter 不参与居中 |
| R2 | MUST | 每条消息卡 `surface` + 1px `line` + 圆角 10 + 无阴影；面板容器透明、无边框、无圆角 |
| R3 | MUST | Composer 在面板外，与消息卡共用列宽/中心/左右边缘 |
| R4 | MUST | Header 全宽；消息列上 inset 12/下 16；列与 Composer 间距 8 |
| R5 | MUST | CardBlock 保留自身 `line` 边框作为内容边界；**不得在消息卡内再叠一层白底**（当前实现违反，见 §5.1） |
| R6 | MUST | 375 消息卡/Composer 左右各 8、无圆角；不裁切/无横向滚动 |
| R7 | MUST | 登记画廊，页面不得写 Panel 定制 CSS/内联 style |

## 2. 结构

```text
ChatCenter（中栏；灰底纸面铺满，页面只负责布局）
├─ ConversationHeader（现有 PageHeader/ChatHeader）
│    白底、全宽横条、底部 1px line
│
├─ ConversationStage（本组件根，relative；灰底延伸至全部 gutter/底部）
│   ├─ TimelineGutter（绝对定位在消息列左侧；不参与居中）
│   │   └─ TimelineSlot（复用现有 TimelineGroups）
│   └─ ConversationSurface（消息列；透明容器，唯一滚动区）
│       └─ MessageScroll（唯一滚动区）
│           └─ MessageList
│               └─ MessageCard[]（每条一张：surface + 1px line + r10 + 无阴影）
│                   └─ CardBlock（content 卡片；不得再叠白底）
│
└─ ComposerCard（现有独立白卡，ConversationStage 外；与消息卡同宽同中心）
```

层级关系：

1. **中栏灰底铺满**：`ChatCenter`/`ConversationStage` 背景为 `--paper`，覆盖左右 gutter、时间轴区域、卡片上下留白；
2. **消息列独立居中**：`ConversationSurface` 用 `width: min(var(--conversation-card-w), calc(100% - 2 * var(--conversation-gutter-x)))` + `margin-inline:auto`；居中只相对中栏内容盒，**不含时间轴宽度**；
3. **时间轴是绝对 gutter**：`left: calc(-1 * (var(--gutter-timeline) + var(--sp-8)))`（`components.css:846-853`），不占布局宽度；
4. **Header 与消息列分开**：Header 全宽白条、底部 1px `line`；消息列顶部距 Header 12；
5. **Composer 在面板外、与消息卡同列**：宽度 `min(calc(var(--conversation-card-w) - 40px), …)`（`components.css:874-879`），左右各内缩 20，因此与消息卡外框对齐；列底与 Composer 间距 8（现状 `margin: 8px auto 14px`）；
6. **每条消息一张卡**：卡与卡间距 9（`margin:0 0 9px`），卡内 12/14；用户与智能体的区分靠头像/角色名/元信息，不靠卡底色或对齐差异；
7. **CardBlock 是内容卡片**：只保留 1px `line` 边框表达内容边界；消息卡已是白底，因此**内层不得再给 `background: var(--surface)`**。

> 居中硬规则：消息列中心 = 中栏内容盒中心（允许 ≤1px 亚像素/滚动条误差）；时间轴、右栏、滚动条都不得改变该中心。禁止用 `padding-left: timelineWidth` 或非对称 `margin` 把列"推"到视觉中心。

### 2.1 用户已确认的视觉基线（2026-11-12，2026-11-21 按实现修订）

- **灰底**：中栏 `--paper` 铺满，列外 gutter/底部均为灰底（未变）；
- **白卡**：当时确认"白卡"为面板容器形态；2026-11-21 裁决改为**每条消息卡**（`--surface` + 1px `--line` + `--r-10` + 无阴影），面板透明（§0）；
- **居中**：消息列独立居中，时间轴绝对 gutter 不参与居中（未变）；
- **Composer 同宽**：Composer 与消息卡外框同宽、同中心、左右各内缩 20（未变，数值口径见 §0.4）；
- **标签对齐**：Header 内会话标题/页内标签文字与消息卡内容左基线对齐（同一内容 inset + 20）；
- **右栏任务对齐**：右栏任务标题/首行与消息列顶部同一基线（Header 下 12px inset）；右栏宽度/内容变化不移动消息列中心。

## 3. 组件 API（受控，不含任意样式）

```ts
type ConversationPanelState = 'ready' | 'loading' | 'empty' | 'error'

interface ConversationPanelProps {
  /** 消息滚动区内容；通常为 MessageList */
  children: ReactNode
  /** 复用现有 TimelineGroups；由页面传入，不在本组件内重写视觉 */
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
- 不提供 `header` slot：Header 是页面级全宽组件；本组件只负责灰底 stage + 居中列 + 时间轴 gutter；
- `timeline` 必须是已登记 Timeline 组件；Panel 不直接读会话数据、不 fetch；
- `state` 只负责展示态，不伪造加载/空/错误；页面按真实数据传入；
- **现状与契约的 API 差异（已知缺口，待补实现）**：实现 `library.tsx:671-687` 没有 `density`/`ariaLabel`，多出 `onRetry`/`scrollRef`/`onScroll`，且 `aria-label` 硬编码"当前会话消息"。补齐前本组件的 API 门禁不成立。

## 4. Tokens 与尺寸

### 4.1 Token 映射

| 用途 | Token | 值/规则 |
|---|---|---|
| 中栏纸面 | `--paper` | 灰底铺满 |
| 消息卡表面 | `--surface` | `#FFFFFF` |
| 消息卡边框 | `--line` | 1px |
| 消息卡圆角 | `--r-10` | `10px`（现状；`--radius-panel:12px` 仍登记在 `tokens.css:55`，容器不再使用） |
| 共享列宽 | `--conversation-card-w` | `720px`（`tokens.css:53`）；原契约名 `--chat-column` 不存在于 tokens，以现名为准 |
| 水平 gutter | `--conversation-gutter-x` | 桌面 **16px**；375 **8px** |
| 垂直 inset | `--conversation-gutter-y` | 上 **12px**、下 **16px** |
| 消息卡背景 | `--surface` | 每条消息一张卡；面板容器 `transparent` |
| 阴影 | 无 | `box-shadow: none`（卡与容器均无） |
| Header 底边 | `--line` | 1px |
| 列与 Composer 间距 | 8px | 现状 `margin: 8px auto 14px`（原写 16，实现为 8，按现状登记） |

> `--r-10`、`--conversation-card-w`、`--conversation-gutter-*`、`--gutter-timeline` 均已在 `tokens.css` 登记；页面不得写死宽度/gutter。

### 4.2 尺寸

| 项 | 值 |
|---|---|
| 中栏背景 | `--paper` 灰底铺满；列外 gutter/底部均为灰底 |
| 列宽 | `min(var(--conversation-card-w), calc(100% - 2 * var(--conversation-gutter-x)))`；桌面 720 上限 |
| 列水平定位 | `margin-inline:auto`；**相对中栏内容盒居中，不含 TimelineGutter** |
| 消息卡宽 | 列宽 − 40（`components.css:855` 内边距 16/20）→ 720 档为 680 |
| 消息卡内边距 | 12/14；卡间距 9 |
| 列垂直位置 | 顶部距 Header **12**；底部留白 **16** |
| Header | 全宽 Header 高度不变；白底；底部 1px `line` |
| Composer 外框 | `min(calc(var(--conversation-card-w) - 40px), calc(100% - 2 * gutter - 40px))`；`margin-inline:auto`；与消息卡外框对齐；不改高度/内边距/按钮布局 |
| TimelineGutter | 绝对定位在消息列左侧；宽 44（`--gutter-timeline`）；与列间距 8；不占布局宽度 |
| Timeline 垂直 | 与消息滚动区同高；不随消息内容滚动 |
| 消息滚动区 | 填充剩余高度；`min-height:0`；仅纵向滚动 |
| 消息卡圆角 | 10；375 仍为 10（容器无圆角） |
| 消息卡边框 | 1px `--line`；无阴影 |
| CardBlock | 保留 1px `line` 边框与 `--r-10`；**不得再叠白底**（§5.1） |

**居中公式（硬要求）**：
- 中栏内容盒宽度 `W`；列宽 `C = min(var(--conversation-card-w), W - 2 * gutter)`；消息卡宽 `M = C - 40`；Composer 宽 `= M`；
- 消息卡与 Composer 中心均 `= W/2`，允许 **≤1px** 的亚像素/滚动条误差；
- 时间轴 `left = -1 × (44 + 8)`（相对列左边界），不得影响 `C` 或 `margin-inline:auto`。

### 4.3 375 窄屏

- 消息卡左右 gutter **8**：`C = 100% - 16`，卡片左右各 8；上 12、下 16 保持；
- 容器无圆角（`components.css:887` `border-radius: 0`），消息卡仍 10；
- 消息卡与 Composer 左右各 8，外框 x/width/right 对齐；
- 消息正文可换行、不裁切、不横向滚动；代码块/表格超宽时内部滚动；
- Timeline 隐藏（≤93.75em，`components.css:885`）；**隐藏时间轴不得让卡片左右边距变化**；
- Composer 保持独立白卡，键盘弹出时不遮挡。

### 4.4 TimelineGutter 空间不足

- 仅当列左侧有足够空间（`(W - C)/2 >= 44 + 8 + 8`）时显示绝对定位时间轴；
- 空间不足时隐藏时间轴，**不压缩列宽、不改变列中心**（现状：≤93.75em 直接 `display:none`，`components.css:825`/`:885`）；
- 不得把时间轴放进消息卡 padding 或用 `padding-left` 挤占；
- 1280/1180 档列宽收窄 `100% - 104px`、Composer `100% - 144px`（`components.css:910-913`），差值仍为 40。

## 5. 消息卡与 CardBlock

- 每条消息一张卡：`surface` + 1px `line` + `--r-10` + 无阴影；卡内 12/14；卡间距 9；
- CardBlock 位于消息卡内，只表达"内容边界"：1px `line` + `--r-10`，**不加第二层白底**；
- 同一消息内多个 CardBlock 纵向排列，间距走组件 Stack，不在页面写 margin；
- 禁止：`消息卡白底 + CardBlock 白底` 两层同色叠加（现状违反）；禁止给 CardBlock 加重阴影。

### 5.1 已知缺陷：CardBlock 双层白框

| 项 | 内容 |
|---|---|
| 现象 | 卡片消息在 `.msg`（白底）内再渲染 `.card-block`（`background: var(--surface)`），形成白底套白底 + 两道 1px 边（`components.css:856-863` + `:866-872`） |
| 归因 | 契约从"单白卡容器 + 消息透明"迁到"每条消息白卡"时，未同步删除 `.card-block` 的 `background` |
| 修复方向 | 删 `.card-block` 的 `background`，保留 `border`/`radius`；或在卡内改用 `--surface-2` 作弱区分（需设计确认） |
| 判据 | `V-CP-1`：卡片消息的卡内区域**只有一道 1px 边**；取卡片内边距处像素 = 消息卡底色（吸附一致），DOM 上卡内元素 `background` 非 `--surface` |
| 等级 | 阻断 A5；本版登记为缺陷，不据此改契约 |

## 6. 状态

| 状态 | 表现 | 说明 |
|---|---|---|
| `ready` | Header 全宽 + 灰底 + 居中列 + 左侧 Timeline gutter + 消息卡列表 | 正常 |
| `empty` | 列内居中 EmptyState，Timeline 按 DESIGN 隐藏 | 不伪造消息 |
| `loading` | 列内 LoadingState（现状）或 Skeleton 消息行；**列尺寸不跳变** | 不显示"暂无数据"闪烁。原写的 Skeleton 未实现（`components.css:790-793` 定义未用），按现状登记 |
| `error` | 列内 ErrorState + 重试；错误不遮 Header/Composer | 错误可读、可重试 |
| `streaming` | 最后一条 agent 消息卡内带流式光标/停止态 | 不新增背景/边框 |
| `long` | 仅 MessageScroll 纵向滚动；Timeline gutter 固定；滚动条不压卡边 | 不整页滚动 |
| `compact` | 仅内边距变化；圆角/边框/背景不变 | 用于窄高窗口（API 未实现，见 §3） |

交互与 a11y：

- 列容器是 `section`（`aria-label`），不是 dialog；不抢焦点、不创建焦点陷阱；
- 时间轴沿用现有 `nav`/键盘行为；消息列表可键盘滚动；
- 新消息不改变 `aria-live` 策略（沿用消息组件）；
- `prefers-reduced-motion` 下不引入新动画；
- 焦点可见：不在容器上画自定义 focus ring；内部控件沿用各自组件。

## 7. 组件画廊登记

- ID：`COMP-conversation-panel`
- 名称：`ConversationPanel`
- 分组：容器 / 会话
- 版本：v1（approved，含已知缺陷）
- Owner：前端；验收：产品 + schema-drafter
- 画廊必须包含：
  1. `ready`（带 Header 相邻示意、中栏灰底、居中列、TimelineGutter、2–3 张消息卡、1 个 CardBlock）；
  2. `empty` / `loading` / `error` 三态；
  3. **1600、1920、1180、375** 四档截图（前三档标注消息卡中心 vs 中栏中心；四档均标注 Composer 与消息卡左右边缘；375 标注左右各 8）；
  4. "Header 全宽 + 消息列独立居中 + 时间轴绝对 gutter" 布局示意；
  5. CardBlock 的**单层边框**示例（对应 §5.1 修复后）；
  6. 时间轴显示/隐藏两种状态（列中心不变）；
  7. 标签与右栏任务基线标注（A13；含 1600/1180 各一张）。
- 登记后才允许 ChatPage 引用；页面代码不得写定制 CSS/内联 style/`!important`；
- 变更组件 API/圆角/边框/gutter/居中规则必须走新的 COMP spec 版本，不得页面内打补丁。

## 8. 验收标准

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 1600 桌面 | 中栏 `--paper` 灰底铺满；列宽 720 上限、独立居中；消息卡 1px line、10 圆角、无阴影；Timeline 在列外左侧绝对 gutter |
| A2 | 1180 桌面 | 中栏灰底铺满；列中心与中栏中心 ≤1px；Timeline gutter 不压缩列、不与右栏重叠；消息区仅纵向滚动 |
| A3 | 375 窄屏 | 消息卡左右各 **8**；容器无圆角；无横向滚动/裁切；CodeBlock/表格内部滚动；Timeline 隐藏不影响边距 |
| A4 | 消息视觉 | **每条消息一张白卡**（surface + 1px line + r10 + 无阴影），卡间距 9±1；容器透明无边框；用户/智能体区分可读 |
| A5 | CardBlock | CardBlock 保留 1px line 边界；**卡内不出现第二层白底/第二道边**（详见 §5.1、`V-CP-1`） |
| A6 | Composer | Composer 在容器外独立白卡；外框与消息卡同宽同中心、左右边缘对齐；输入区不被裁切；高度/内边距/按钮布局不变 |
| A7 | 状态 | empty/loading/error 不伪造数据；错误可重试；列尺寸不跳变 |
| A8 | 长会话 | 仅消息区滚动；Timeline gutter 固定；滚动条不压卡边；Header/Composer 不滚走 |
| A9 | 无定制 CSS | 页面无本组件相关 `<style>`/inline style/`!important`；只组合组件与布局类 |
| A10 | 画廊/回归 | 画廊登记并截图；tsc/build 通过；既有时间轴/消息/卡片/Composer 回归通过 |
| **A11** | **居中验收** | **1600/1920/1180：消息卡中心 vs 中栏中心 ≤1px；375：卡片左右各 8px；时间轴显示/隐藏时列中心不移动** |
| **A12** | **Composer 对齐** | **1600/1920/1180：Composer 与消息卡（`M = C - 40`）的 x/width/right 差均 ≤1px；375：两者左右各 8px；Composer 高度/内边距/按钮布局不变。**注：面板容器比分卡宽 40（每侧 20），此差值属设计口径，不计失败 |
| **A13** | **标签/右栏对齐** | **Header 标签文字与消息卡内容左基线差 ≤1px；右栏任务标题/首行与消息列顶部 12px 基线差 ≤1px；时间轴显隐/右栏宽度变化不破坏上述对齐** |

## 9. 影响页面

- **ChatPage（必需）**：中栏灰底铺满；Header 全宽；消息列独立居中；Timeline 以绝对 gutter 贴在列左侧；Composer 独立但与消息卡同宽同中心；
- **Timeline / Message / CardBlock / Composer**：只读复用；Timeline 位置为绝对 gutter；Composer 仅外框宽度/居中规则对齐；
- **工作台/任务/团队/记忆/视图页**：不受影响；
- **右栏**：任务标题/首行与消息列顶部 12px 基线对齐；列居中不把右栏任务推离基线；
- **响应式**：1600/1920/1180 桌面居中；375 卡片/Composer 左右 8；不改全局断点。

## 10. 非目标与风险

**非目标**：
- 不改 Header 内容/高度/阴影；不改 Composer 输入逻辑，也不改其高度/内边距/按钮布局；
- 不做消息虚拟列表、不做时间轴重设计；
- **本版不做"单白卡容器 + 消息透明"重构**（v2 候选，入口见 §0.2）。

**风险/权衡**：
- 每条消息单独成卡，长会话的视觉节奏偏"清单化"；补偿手段是 9px 卡间距与克制的边框，不用阴影；
- 白卡套白卡（CardBlock）是当前已知缺陷，修复需改一行 CSS 并重拍卡片截图（§5.1）；
- 容器与 Composer 的 40px 宽度差容易在评审时被误判为"未对齐"；本版明确以"消息卡"为基准（§0.4、A12）。

---

*本文件只定义组件 spec；实现、画廊、截图、证据分别由后续 COMP 流程文件补齐。*
