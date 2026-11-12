# COMP-timeline-groups · Timeline 会话分组 + 分类浮层

状态：**spec ready（待 Lead/设计确认；组件库先行，未接页面）**
Owner：前端（实现）/ 产品（本 spec）/ 验收（截图与走查）
流程：`docs/process/component-system.md` §6.8 COMP spec；本文件只定义组件，不改代码。
视觉基线：`DESIGN.md`（当前唯一视觉基准）；复用已有 `TimelineTip`（COMP-timeline-tip），不新增第二套 tooltip。

---

## 1. 语义

**一句话**：把多会话的消息时间轴按**会话**分段、按**日期**保留分界、按**角色**着色；分类（需求澄清/进度汇报/确认等）只作为文本元数据进入浮层，不改变刻度的颜色或形状。

- 解决的问题：同一时间轴混排父/子会话后，用户无法判断“这段属于哪个会话、什么角色、哪一天”；
- 不解决的问题：不替代点击跳转、不新增角色、不改消息流、不把分类做成颜色标签；
- 使用场景：ChatPage 的消息时间轴（Timeline）组件库/画廊；**本 spec 不接页面**；
- 不用于：任务/团队/记忆/视图页、文件列表、右栏概览、非消息事件时间线。

## 2. 数据模型

```ts
type TimelineRole = 'user' | 'agent'
type TimelineCategory =
  | 'clarification'   // 需求澄清/追问
  | 'progress'        // 进度汇报
  | 'confirmation'    // 确认/审批
  | 'result'          // 结果/交付
  | 'error'           // 失败/阻塞

interface TimelineMessage {
  id: string
  sessionId: string
  sessionTitle: string
  /** 会话树顺序/层级由上层提供；组件不自行猜父子关系 */
  sessionOrder: number
  isCurrentSession: boolean
  role: TimelineRole
  category?: TimelineCategory
  at: number                 // epoch ms
  dateKey: string            // YYYY-MM-DD，按展示时区预先计算
  summary?: string           // 供 TimelineTip 下栏使用
}

interface TimelineGroupsProps {
  messages: readonly TimelineMessage[]
  currentSessionId: string
  activeMessageId?: string
  onJump: (messageId: string) => void
  ariaLabel?: string
}
```

- 分组顺序：按 `sessionOrder` 升序；同一会话内按 `dateKey`、`at` 升序；
- `sessionOrder` 由页面/Session 树提供，组件不读全局状态、不 fetch；
- 当前会话 = `sessionId === currentSessionId`；其他为上级/历史会话；
- 分类是**可选文本**，缺省不显示分类行，不推断；
- 同一 `id` 唯一；重复/缺失字段由调用方负责，组件不伪造数据。

## 3. 结构

```text
TimelineGroups（nav，44px 宽；组件库内使用）
├─ SessionGroup[]（按 sessionOrder）
│   ├─ DateGroup[]（按 dateKey，保留日期分组）
│   │   └─ Tick[]（20×4；active 24×4；gap2）
│   └─ GroupGap 6（会话切换的 6px 间隙）
└─ TimelineTip（复用 COMP-timeline-tip，挂到当前 hover/focus tick）

44px gutter：
├─ 刻度轨道（tick 居中/靠左对齐）
└─ 无文字标签：不显示会话名、日期、分类、角色名
```

- 44px rail 内只画刻度/轨道，**不放任何文字**；会话名、日期、分类只在 `TimelineTip` 或消息区展示；
- 日期分组保留：每个 `dateKey` 形成独立段落；日期标题由消息区/上层渲染，不在 44px rail 内；
- 会话分组：组间 6px 间隙；不同会话不共用一段连续轨道；
- 当前会话正常透明度；上级会话整组（仅刻度）`opacity:.55`，浮层保持不透明；
- Tooltip 复用现有 TimelineTip；只增加“分类”一行，不新增浮层组件。

## 4. 颜色与角色（不新增角色色）

| 角色/状态 | 颜色 | 说明 |
|---|---|---|
| `user` | `--accent`（现有靛蓝） | 不新增 hex；当前会话正常 |
| `agent` | `--muted` / `--ink-secondary`（现有灰） | 不新增 hex；与 user 可辨 |
| `active`（当前） | `--ink` 黑 | **黑色、宽 24**；覆盖角色色，表示当前定位 |
| `ancestor` | 同角色色 + `opacity:.55` | 仅上级会话刻度；不把浮层变透明 |
| 分类 | **无颜色/形状变化** | 需求澄清/进度汇报/确认等只进 Tooltip 文本 |

禁止：

- 新增第三、第四种角色色；禁止给 category 分配颜色、图标形状或 badge；
- 禁止用分类改变 tick 宽度/圆角/轨道/分组；
- 禁止用 emoji/文字标签放进 44px rail。

## 5. 尺寸与布局

| 项 | 值 |
|---|---|
| Rail 宽 | **44px**（含 click/focus 区；不放文字） |
| 普通 tick | **20×4** 横向刻度，圆角按现有 Timeline（不新增） |
| 当前/active tick | **24×4**，`--ink` 黑 |
| tick 间距 | **2px**（同组连续刻度） |
| 会话组间 gap | **6px**（每切换一级会话） |
| 日期组 | 保留；日期分界处不显示文字，使用 6px 组间隙 + 上层日期标题 |
| 组内对齐 | 左对齐/统一基线；tick 不因当前宽度 24 改变其他 tick 起点 |
| 轨道 | 1px 现有轨道；不新增粗线 |
| 点击热区 | 至少 20×20（可扩展，不得溢出 44 rail） |

### 5.1 四档布局

- 1600 / 1920 / 1180：44px rail 固定；会话组/日期组/间隙不变；不随中栏宽度缩放；
- 375：仍按 44px 组件验收；页面若隐藏 Timeline 按现有响应式规则处理，组件不改为横向/文字版；
- 任何档位：44px 内无文字、无横向溢出、不裁切首尾 tick。

## 6. 状态

| 状态 | 触发 | 表现 |
|---|---|---|
| `default` | 普通 tick | 角色色；20×4；gap2 |
| `hover` | 指针进入 tick | 视觉反馈 + 打开 TimelineTip；不改变宽度（active 除外） |
| `focus` | 键盘 focus tick | focus-visible 环；打开 TimelineTip；`aria-describedby` 指向 tip |
| `active` | `activeMessageId` | `--ink` 黑、宽 24；`aria-current="true"`；不依赖颜色单独表达 |
| `ancestor` | 非当前会话组 | 同角色色 @.55；tooltip 不透明；仍可 hover/focus/跳转 |
| `edge` | 组首/组尾或 rail 边缘 tick | 热区/轨道不裁切；tip 做视口 clamp；首尾 tick 不被 44px 裁掉 |

**不提供 disabled**：时间轴是导航，不表达不可用；空数据用空态，不把 tick 设为禁用。

## 7. 交互

- **点击** tick：调用 `onJump(messageId)`，跳转由上层处理；组件不滚消息、不改会话；
- **键盘**：Tab 进入 tick；←/→ 移动焦点；Home/End 到组首/组尾；Enter/Space 跳转；Esc 关闭 Tooltip；
- **hover**：打开 TimelineTip；移出 200ms grace 后关闭（复用 COMP-timeline-tip）；
- **focus**：立即打开 Tip；blur 关闭；不抢焦点、不创建焦点陷阱；
- **滚动**：时间轴与 Tooltip 跟随/保持，不因消息区滚动消失；锚点用 tick 实时 rect；
- **分组切换**：会话切换留 6px gap；跨组键盘移动不跳段、不丢焦点；
- 分类只在 Tip 文本中出现，不能成为可点击筛选器（本版）。

## 8. Tooltip（复用 COMP-timeline-tip）

- 上栏：发送方（你/司墨） · 会话标题 · 时间；
- 分类：若 `category` 存在，在**上栏或下栏**展示中文标签（需求澄清/进度汇报/确认/结果/失败）——只做文本，不做颜色/形状；
- 下栏：正文摘要，最多两行；
- 上级会话 tooltip 内容完整不透明；不因祖先组 `.55` 变淡；
- 禁止原生 `title`；`role=tooltip` + `aria-describedby`；无 title 属性（验收 A9/A10）；
- 44px rail 内仍无文字，分类/会话只在 tooltip。

## 9. 可访问性

- 根元素 `nav aria-label="消息时间轴"`；每组有 `aria-label`（会话标题，隐藏在视觉 rail 外也可）；
- 每个 tick 是 button，`aria-label` 含角色/会话/时间/分类（分类可选）；
- `aria-current="true"` 标记 active；祖先组用 `aria-label` 说明“上级会话”，不只靠透明度；
- focus-visible 必须可见；键盘可跳转；Tip 不抢焦点；
- 颜色区分角色之外，必须有文字（tooltip 发送方）或可访问名称；分类不只靠颜色（本版本来就不进颜色）；
- `prefers-reduced-motion`：不新增动画；仅保留现有 Timeline 动效。

## 10. 组件画廊登记

- ID：`COMP-timeline-groups`
- 名称：`TimelineGroups`
- 分组：业务 / Timeline
- 版本：v1（draft）
- Owner：前端；验收：产品 + schema-drafter
- 依赖：`TimelineTip`（COMP-timeline-tip）
- 画廊必须包含：
  1. 默认：user/agent 两色、当前会话正常；
  2. 上级会话组（opacity .55）+ 6px 组间隙；
  3. active 黑色 24 + 普通 20 对比；
  4. dateKey 分组（无 rail 内文字）；
  5. hover/focus/edge 三态；
  6. 分类 Tooltip（含会话+分类）；
  7. **1600、1920、1180、375** 四档截图；
  8. 无原生 title、rail 内无文字标签的 DOM 证据。
- 登记后才允许页面使用；本 spec 阶段**不接页面**，只进画廊。

## 11. 验收标准 A1–A10

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 四档（1600/1920/1180/375） | 44px rail 固定；无溢出/裁切；组间隙/日期组保留 |
| A2 | 角色可辨 | user 靛蓝 / agent 灰可辨；无新增角色色；颜色均来自现有 token |
| A3 | 当前/active | 当前黑色、宽 24；`aria-current`；普通 20 不被误判 |
| A4 | 上级会话 | 同角色色 opacity 约 .55；tooltip 不透明；仍可 hover/focus/跳转 |
| A5 | 分组间隙 | 每切换一级会话 gap6；日期分组保留；组间不连轨 |
| A6 | 分类不进视觉 | 需求澄清/进度/确认等不改变颜色/形状/宽度；只在 Tooltip 文本 |
| A7 | Hover/focus/点击/键盘 | 浮层出现/关闭正确；点击/←→/Home/End/Enter 跳转；焦点不丢 |
| A8 | 滚动/edge | 滚动时浮层跟随不消失；首尾/组边 tick 不裁切，tip 视口 clamp |
| A9 | Tooltip 内容 | 上栏含发送方·会话·时间；分类可在上/下栏；下栏两行摘要 |
| A10 | 无原生 title | 无 `title` 属性；`role=tooltip` + `aria-describedby`；rail 内无文字标签 |

## 12. 影响范围

- **Timeline 组件**：增加会话/日期分组与角色/祖先/active 规则；点击/键盘跳转语义不变；
- **TimelineTip**：复用，只增加分类文本；不改已有结构/尺寸；
- **组件画廊**：新增登记、四档截图、DOM 证据；
- **页面**：本阶段**不接页面**；后续接入时只组合组件，不写页面定制 CSS；
- **数据/后端**：只消费已提供的 `messages` 字段；不新增查询/接口。

## 13. 非目标与风险

**非目标**：不做分类筛选/图例/颜色标签；不新增 disabled 态；不做多选/批量跳转；不改 44px rail 宽度；不引入新 tooltip 库。

**风险/权衡**：
- 44px 内无文字，用户需 hover/focus 才知道会话/分类；用 Tooltip + 可访问名称补偿，不能靠颜色猜；
- 上级会话 .55 可能导致低对比；仅用于组刻度，tooltip 保持不透明，必要时提高边框/焦点环，不回退为新增灰色角色；
- 20→24 active 宽度变化可能影响相邻 tick 起点；只有当前 tick 加宽，其他 tick 保持 20 起点不变；
- 375 页面可能隐藏 Timeline（现有响应式），组件本身仍按 44px 验收，不在本 spec 里改页面是否显示。

---

*本文件只定义组件 spec；实现、画廊、截图、证据分别由后续 COMP 流程文件补齐。组件库先行，不接页面。*
