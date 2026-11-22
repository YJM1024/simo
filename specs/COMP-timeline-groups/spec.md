# COMP-timeline-groups · Timeline 会话分组 + 分类浮层

状态：**accepted（组件验收签收，2026-11-21；报告 `docs/testing/COMP-SIGN-20261121.md` §2，A1–A10 全 pass）**
Owner：前端（实现）/ 产品（本 spec）/ 验收（截图与走查）
流程：`docs/process/component-system.md` §6.8 COMP spec；本文件只定义组件，不改代码。
视觉基线：`DESIGN.md`；复用已有 `TimelineTip`（COMP-timeline-tip），不新增第二套 tooltip。
证据：四档截图与"祖先 active"证据**待重拍/待复验**（签字记录 `docs/tasks/acceptance.md:373-386` 写于页面切换之前，且 `:384` 称"App 仍用旧 Timeline"，与 `frontend/src/app.tsx:676` 已接入不符）。

---

## 0. 2026-11-21 修订：三处按实现与裁决对齐

审计 `docs/plan/COMP-AUDIT-20261121.md` §3 认定本契约存在结构与颜色双缺口。Lead 裁决：

1. **active 色统一为 `--timeline-selected`（`#232A8C`）**，宽 24，与 `COMP-message-colors` 的 `select` 色一致；原写"`--ink` 黑"作废（实现：`frontend/src/components/components.css:965`）。不得再出现"黑色"表述。
2. **祖先组透明度按实现改写**：透明度施加在**会话组容器**上（`.tlg-session.is-ancestor-session { opacity: .55 }`，`components.css:922`；当前会话组 `:923` 为 1）。因此**组内 active 刻度同样被压到有效 ≈.55**，"祖先组内 active 提亮回 1"物理不可达，本版**删除该要求**，改为：
   - 阶段 1：祖先组整体降透明度，**组内 active 不额外提亮**（保留宽度 24 与 `aria-current` 作为唯一区分手段）；
   - "逐 tick 施加 .55、active 提亮回 1"降为 **v2 候选**，入口是新 `CHG`，需同时改 `COMP-message-colors` 的同段表述。
   实现中 `.tlg-session.is-ancestor-session .tl-bar.is-current { opacity:1 }`（`components.css:925`）在该施加层级下**无效**，属可删的死规则，不是契约。
3. **阶段 1 不做日期分组**：实现只按 `sessionId` 切组（`frontend/src/components/library.tsx:459-468`），无 DateGroup 子层、无日期节点。`dateKey` 仅参与组内排序（`library.tsx:450`）。原契约"三层结构 + 日期分组保留"作废，DateGroup 层列 v2 候选。

另：**点击热区已修复**（Lead 裁决 2026-11-21，对应审计 C-06/C-11）：视觉 **24×4**（active；普通 tick 20×4），命中区 **44×44**（实测 `docs/testing/20261121-123009-after-metrics.json`：`.tl-bar` `rect{w:24,h:4}` / `hit{w:44,h:44}`，`coarse=true`）。实现为 `@media (pointer: coarse)` 下 `.tl-bar::after` 的 44×44 透明伪元素（`components.css:1022-1026`），并把 tick 间距放宽到 40px 避免热区重叠（`components.css:1023-1024`）。契约按"视觉 24×4、命中区 ≥44×44"登记，**不再以 20×4 作为点击目标**；细指针命中区未实测，不列为缺口。

---

## 1. 语义

**一句话**：把多会话的消息时间轴按**会话**分段、按**角色**着色；分类（需求澄清/进度汇报/确认等）只作为文本元数据进入浮层，不改变刻度的颜色或形状。阶段 1 不做日期分组。

- 解决的问题：同一时间轴混排父/子会话后，用户无法判断"这段属于哪个会话、什么角色"；
- 不解决的问题：不替代点击跳转、不新增角色、不改消息流、不把分类做成颜色标签、**不做日期分组**；
- 使用场景：ChatPage 的消息时间轴（已接入，`app.tsx:676`）；
- 不用于：任务/团队/记忆/视图页、文件列表、右栏概览、非消息事件时间线。

## 1.1 目标

把多会话消息时间轴按会话分组，用现有角色色区分 user/agent、祖先组整组降透明、当前 active 加宽到 24；分类只作为 TimelineTip 文本，不进入颜色/形状；44px rail 保持无文字。

## 1.2 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 按 sessionOrder 分组；当前会话组正常、祖先会话组整组 `opacity:.55`；组内 active 不额外提亮（§0.2） |
| R2 | MUST | 角色只用现有 user/agent 两色；不新增角色色；当前 active 用 `--timeline-selected`、宽 24 |
| R3 | MUST | 44px rail 固定、无文字；普通 tick 20×4、gap 2；会话组间 gap 6；**阶段 1 不做日期分组** |
| R4 | MUST | 分类（需求澄清/进度/确认等）只进 TimelineTip，不改颜色/形状/宽度 |
| R5 | MUST | 点击/键盘/ hover/focus 跳转与 Tooltip 可用；滚动不消失 |
| R6 | MUST | 四档 1600/1920/1180/375 无裁切/溢出；画廊登记 |

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
  dateKey: string            // YYYY-MM-DD；**阶段 1 仅参与组内排序，不生成日期分组**
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

- 分组顺序：按 `sessionOrder` 升序；同一会话内按 `dateKey`、`at` 升序（`library.tsx:450`）；
- `sessionOrder` 由页面/Session 树提供，组件不读全局状态、不 fetch；
- 当前会话 = `sessionId === currentSessionId`；其他为上级/历史会话；
- 分类是**可选文本**，缺省不显示分类行，不推断；
- 同一 `id` 唯一；重复/缺失字段由调用方负责，组件不伪造数据。

## 3. 结构

```text
TimelineGroups（nav，44px 宽）
├─ SessionGroup[]（按 sessionOrder；一组 = 一个 sessionId 的连续刻度）
│   └─ Tick[]（20×4；active 24×4；gap 2）
├─ GroupGap 6（会话组之间的 6px 间隙）
└─ TimelineTip（复用 COMP-timeline-tip，挂到当前 hover/focus tick）

44px gutter：
├─ 刻度轨道（tick 居中/靠左对齐）
└─ 无文字标签：不显示会话名、日期、分类、角色名
```

- 44px rail 内只画刻度/轨道，**不放任何文字**；会话名、分类只在 `TimelineTip` 或消息区展示；
- **无日期分组层**（阶段 1）：不渲染日期标题、日期分隔、日期组间隙；组内只按时间顺序排列刻度；
- 会话分组：组间 6px 间隙（`components.css:920`）；不同会话不共用一段连续轨道；
- 当前会话组正常透明度；祖先会话组整组 `.55`（`components.css:922`），组内 active 同样被压暗（§0.2）；
- Tooltip 复用现有 TimelineTip；只增加"分类"文本，不新增浮层组件。

**v2 候选（本版不实现）**：SessionGroup → DateGroup → Tick 三层；日期分界用 6px 组间隙 + 上层日期标题渲染；需新 `CHG` 立项并同步修订 §4 的透明度施加层级。

## 4. 颜色与角色（不新增角色色）

| 角色/状态 | 颜色 | 说明 |
|---|---|---|
| `user` | `--timeline-user`（`#AEBDF7`） | 现有 token（`tokens.css:50`）；不新增 hex |
| `agent` | `--timeline-agent`（`#6FAF8E`） | 现有 token（`tokens.css:51`）；与 user 可辨 |
| `active`（当前） | `--timeline-selected`（`#232A8C`） | **宽度 24**（`components.css:965`）；覆盖角色色；`aria-current="true"` |
| `ancestor` | 同角色色 + 组级 `opacity:.55` | 施加在**会话组容器**上（`components.css:922`）；**组内 active 不额外提亮** |
| 分类 | **无颜色/形状变化** | 需求澄清/进度汇报/确认等**只进 TimelineTip 文本**，不进入 tick/aria 名称 |

**透明度规则（唯一口径）**：透明度只有一处施加点——会话组容器。祖先组内所有刻度（含 active）的有效不透明度 ≈ .55；当前会话组内所有刻度为 1。**不得**在 tick 上再叠加透明度，也**不得**要求组内 active 恢复为 1（该要求在组级透明度下不可达，见 §0.2）。tooltip 始终不透明。

禁止：

- 新增第三、第四种角色色；禁止给 category 分配颜色、图标形状或 badge；
- 禁止用分类改变 tick 宽度/圆角/轨道/分组；
- 禁止用 emoji/文字标签放进 44px rail；
- 禁止在组级透明度之外再用"逐 tick 透明度"表达祖先关系（两套并存必然产生歧义）。

## 5. 尺寸与布局

| 项 | 值 |
|---|---|
| Rail 宽 | **44px**（`tokens.css:91`；不放文字） |
| 普通 tick | **20×4**，圆角 2 |
| 当前/active tick | **24×4**，`--timeline-selected` |
| tick 间距 | **2px**（同组连续刻度，`components.css:919`） |
| 会话组间 gap | **6px**（`components.css:920`） |
| 日期分组 | **阶段 1 不做**（v2 候选，见 §3） |
| 组内对齐 | 左对齐/统一基线；tick 不因当前宽度 24 改变其他 tick 起点 |
| 轨道 | 1px 现有轨道；不新增粗线 |
| 点击热区 | **视觉 24×4**（active；普通 20×4），**命中区 ≥44×44**（实测 `hit 44×44`；实现 `components.css:1022-1026`，coarse 指针伪元素） |

### 5.1 四档布局

- 1600 / 1920 / 1180：44px rail 固定；会话组/间隙不变；不随中栏宽度缩放；
- 375：仍按 44px 组件验收；页面隐藏 Timeline 由 `components.css:885` 的 `≤93.75em` 规则决定（现状 1180 以上即隐藏，见 §13 已知偏差）；
- 任何档位：44px 内无文字、无横向溢出、不裁切首尾 tick。

## 6. 状态

| 状态 | 触发 | 表现 |
|---|---|---|
| `default` | 普通 tick | 角色色；20×4；gap 2 |
| `hover` | 指针进入 tick | 宽度 24（`components.css:966`）+ 打开 TimelineTip |
| `focus` | 键盘 focus tick | focus-visible 环；打开 TimelineTip；`aria-describedby` 指向 tip |
| `active` | `activeMessageId` | `--timeline-selected`、宽 24；`aria-current="true"`；祖先组内同样被组级 .55 压暗（不额外提亮） |
| `ancestor` | 非当前会话组 | 组级 `opacity:.55`；tooltip 不透明；仍可 hover/focus/跳转 |
| `edge` | 组首/组尾或 rail 边缘 tick | 热区/轨道不裁切；tip 做视口 clamp；首尾 tick 不被 44px 裁掉 |

**不提供 disabled**：时间轴是导航，不表达不可用；空数据用空态，不把 tick 设为禁用。

## 7. 交互

- **点击** tick：调用 `onJump(messageId)`，跳转由上层处理；组件不滚消息、不改会话；
- **键盘**：Tab 进入 tick；←/→（及 ↑/↓）移动焦点；Home/End 到首/尾；Enter/Space 跳转；Esc 关闭 Tooltip（`library.tsx:470-483`）；
- **hover**：120ms 打开 TimelineTip；移出 200ms grace 后关闭（`library.tsx:455-456`）；
- **focus**：立即打开 Tip；blur 关闭；
- **滚动**：时间轴与 Tooltip 跟随/保持，不因消息区滚动消失；锚点用 tick 实时 rect；
- **分组切换**：会话切换留 6px gap；跨组键盘移动不跳段、不丢焦点；
- 分类只在 Tip 文本中出现，不能成为可点击筛选器（本版）。

## 8. Tooltip（复用 COMP-timeline-tip）

- 上栏：发送方（你/司墨） · 会话标题 · 分类（有值时） · 时间；
- 分类：若 `category` 存在，展示中文标签（需求澄清/进度汇报/确认/结果/失败）——只做文本，不做颜色/形状；
- 下栏：正文摘要，最多两行；
- 祖先组 tooltip 内容完整不透明；不因组级 `.55` 变淡；
- 禁止原生 `title`；`role=tooltip` + `aria-describedby`；44px rail 内仍无文字。

## 9. 可访问性

- 根元素 `nav aria-label="消息时间轴"`；每组有 `aria-label`（`当前会话：标题` / `上级会话：标题`，`library.tsx:488`）；
- 每个 tick 是 button，`aria-label` 含角色/会话/时间（`library.tsx:497`）；**不含分类**；
- `aria-current="true"` 标记 active；
- 颜色之外必须有可访问名称；分类不进颜色、不进 aria；
- focus-visible 必须可见；Tip 不抢焦点；
- `prefers-reduced-motion`：不新增动画。

## 10. 组件画廊登记

- ID：`COMP-timeline-groups`
- 名称：`TimelineGroups`
- 分组：业务 / Timeline
- 版本：v1（spec ready）
- Owner：前端；验收：产品 + schema-drafter
- 依赖：`TimelineTip`（COMP-timeline-tip）
- 画廊必须包含：
  1. 默认：user/agent 两色、当前会话正常；
  2. 祖先会话组（组级 .55）+ 6px 组间隙；
  3. active `--timeline-selected` 24 + 普通 20 对比；
  4. ~~dateKey 分组~~ → **本版无此项**（v2 候选）；
  5. hover/focus/edge 三态；
  6. 分类 Tooltip（含会话+分类）；
  7. **1600、1920、1180、375** 四档截图（待重拍）；
  8. 无原生 title、rail 内无文字标签的 DOM 证据。
- 登记后才允许页面使用；现状已接入页面（`app.tsx:676`），Page Adoption 证据缺失（§11 备注）。

## 11. 验收标准 A1–A10

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 四档（1600/1920/1180/375） | 44px rail 固定；无溢出/裁切；组间隙保留 |
| A2 | 角色可辨 | user/agent 两色可辨；无新增角色色；颜色均来自现有 token |
| A3 | 当前/active | active 为 `--timeline-selected`、宽 24；`aria-current`；普通 20 不被误判 |
| A4 | 上级会话 | 祖先组整组 opacity ≈ .55（**含组内 active**）；tooltip 不透明；仍可 hover/focus/跳转 |
| A5 | 分组间隙 | 每切换一个会话 gap 6；组间不连轨；**无日期分组**（阶段 1） |
| A6 | 分类不进视觉 | 需求澄清/进度/确认等不改变颜色/形状/宽度；只在 Tooltip 文本 |
| A7 | Hover/focus/点击/键盘 | 浮层出现/关闭正确；点击/←→/Home/End/Enter 跳转；焦点不丢；**命中区 ≥44×44**（实测，coarse 指针；细指针未实测，不列缺口） |
| A8 | 滚动/edge | 滚动时浮层跟随不消失；首尾/组边 tick 不裁切，tip 视口 clamp |
| A9 | Tooltip 内容 | 上栏含发送方·会话·(分类)·时间；下栏两行摘要 |
| A10 | 无原生 title | 无 `title` 属性；`role=tooltip` + `aria-describedby`；**aria-label 不含分类**；rail 内无文字标签 |

## 12. 影响范围

- **Timeline 组件**：增加会话分组与角色/祖先/active 规则；点击/键盘跳转语义不变；
- **TimelineTip**：复用，增加分类文本；不改已有结构/尺寸；
- **组件画廊**：新增登记、四档截图、DOM 证据；
- **页面**：已接入 `app.tsx:676`（Page Adoption 证据待补）；
- **数据/后端**：只消费已提供的 `messages` 字段；不新增查询/接口。

## 13. 非目标与风险

**非目标**：不做分类筛选/图例/颜色标签；不新增 disabled 态；不做多选/批量跳转；不改 44px rail 宽度；**不做日期分组**（v2）；不引入新 tooltip 库。

**风险/权衡**：
- 44px 内无文字，用户需 hover/focus 才知道会话/分类；用 Tooltip + 可访问名称补偿；
- 组级 `.55` 会同时压暗祖先组里的 active，当前只能靠宽度 24 + `aria-current` 区分；若真机对比不足，v2 再改施加层级，不在本版加逐 tick 透明度；
- 20→24 active 宽度变化可能影响相邻 tick 起点；只有当前 tick 加宽，其他 tick 保持 20 起点不变；
- **已知偏差（非本组件可解）**：`components.css:885` 在 `≤93.75em`（1500px）即隐藏时间轴，1180 档实际看不到轴，与 §5.1 "1180 正常验收"不一致，归页面层待裁。

---

*本文件只定义组件 spec；实现、画廊、截图、证据分别由后续 COMP 流程文件补齐。*
