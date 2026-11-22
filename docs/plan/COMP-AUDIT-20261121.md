# 组件契约 vs 实现审计（2026-11-21）

> 角色：comp-audit（只读审计）。范围：`specs/COMP-*/` 5 个组件契约 vs `frontend/src` 当前实现。
> 方法：逐份 spec 全文实读；实现侧逐行实读 `tokens.css` / `components.css` / `library.tsx`，并用 `app.tsx`、`gallery.tsx`、`manifest.json`、组件单测、`docs/tasks/acceptance.md` 交叉印证；截图只作事实陈述，不替代测量。
> 本文只陈述差距，不排实现优先级（由 Lead 定）。**未复算对比度**，只核对记录一致性。

## 0. 总览

| COMP | 契约状态（自述） | 实现是否存在 | 本轮结论 | 证据时效 |
|---|---|---|---|---|
| message-colors | approved | 是（token + CSS + 组件接线齐全） | 实现层可签；流程层不可签 | 截图 2026-11-13，早于当前源码 |
| conversation-panel | approved（test-plan 写"未实现"） | 是（已接页面） | 不可签 | 截图 2026-11-21，但结构基线冲突 |
| timeline-groups | spec ready | 是（已接页面） | 不可签 | 签字记录 2026-11-12，写"App 仍用旧 Timeline" |
| timeline-tip | spec ready | 是（已线上闭环） | 实现层可签；流程层不可签 | 截图 2026-11-12，早于当前源码 |
| composer-send-mode | spec ready（test-plan 写"未实现"） | 是（已接页面并线上 smoke 通过） | 实现层可签；流程层不可签 | 单测 + 2026-11-14 线上 smoke |

统一事实：5 个目录**实测都只有** `spec.md` + `test-plan.md`（无 proposal / design / tasks / evidence），与 `docs/process/component-system.md` §6.8 六件套要求不符。

---

## 1. COMP-message-colors

### 1.1 契约要点

- R1/R2/R3：只有四类（requirement / clarification / progress / consultation）；`delivery` 归入 progress；空/非法回退 consultation；user 永不显示标签（`specs/COMP-message-colors/spec.md:41-44`）。
- R3 四对 bg/ink 严格绑定，Token 映射只允许清单内颜色（`spec.md:32-37`、`:46-56`）。
- R6 颜色走 token、无硬编码 hex（`spec.md:28`、`:58`）。
- 时间轴：user/agent 20×4、selected 宽 24、hover 同角色色宽 24、ancestor `.55` 且 selected 仍 1（`spec.md:62-70`）。
- 对比度表记录 6.32 / 5.24 / 5.47 / 5.50（`spec.md:101-104`）；A7 要求 ≥4.5:1（`spec.md:127`）。

### 1.2 实现现状

- `frontend/src/styles/tokens.css:42-52` 逐值核对：`#E8ECFB`(42)/`#2F4BB8`(43)、`#FBF0DA`(44)/`#8A5A00`(45)、`#E2F1E8`(46)/`#246B4E`(47)、`#F1F0EC`(48)/`#5E6068`(49)、`--timeline-user:#AEBDF7`(50)、`--timeline-agent:#6FAF8E`(51)、`--timeline-selected:#232A8C`(52) —— **与 spec 四对与三色逐值一致，无偏差**。
- 标签接线：`components.css:959-962` 四类 `.msg-meta .msg-tag-<cat>` 分别取对应 token（无字面 hex）；`.msg-meta .tag` 基础样式在 `components.css:143`，`flex:none` 在 `:937`。
- 回退与去标签：`library.tsx:204-207`（`delivery → progress`；非法/空 → `consultation`；user categoryKey 为空），渲染 `library.tsx:212` 仅在 category 非空时插入 `<span className="tag msg-tag msg-tag-…">`。
- 时间轴接线：`components.css:963` user=`--timeline-user`、`:964` agent=`--timeline-agent`、`:965` is-current=`--timeline-selected` 宽 24、`:966` hover 宽 24；基础 tick 20×4 在 `components.css:115`。
- 对比度：`spec.md:101-104` 与 `specs/COMP-message-colors/test-plan.md:13` 记录**同一组数值**（6.32/5.24/5.47/5.50）；全仓 `*.md` grep 只命中这两处，**没有测量脚本、计算过程或独立复核产物**。因 hex 与记录一一对应，本轮不再复算，结论为"记录自洽、证据为 spec 自述"。
- 仍在文件里的字面 hex（非四类/非时间轴 token）：`components.css:115` `#C9C7C0`（默认 tick 底色）、`:117` `#8F8D87`（旧 `.tl-bar.is-agent`，已被 `:434` 覆盖）、`:139` `#fff`、`:150` `#101218`/`#E9E9F0`（代码块）。
- 数据域取值与四类不同名：`app.tsx:642` 把后端 category 直接转成 `clarification | progress | confirmation | result | error`；`library.tsx:206` 只认四类 key，故 `confirmation/result/error` 实际都渲染为「信息咨询」。契约允许"非法回退"，但这是**语义落点**而非异常数据，值得记录。
- 画廊：`gallery.tsx:133` 有四类标签样例；截图见 `frontend/review/fe-category-top-1600.png` 等 6 张。

### 1.3 差距清单

| 契约要求 | 实现 | 等级 |
|---|---|---|
| 四类标签色/token 逐值一致（spec:32-56） | 完全一致（tokens.css:42-52，css:959-962） | 无 |
| 空/非法→consultation、user 无标签（spec:41-44） | 一致（library.tsx:204-212） | 无 |
| 时间轴三色 + selected 24 + hover 24（spec:62-70） | 一致（css:963-966） | 无 |
| R6 无硬编码 hex（spec:28/58） | 四类与时间轴已 token 化，但 `components.css:115/117/139/150` 仍有字面 hex | 次要 |
| A7 对比度 ≥4.5（spec:127） | 仅 spec/test-plan 自述同一组数字，无独立测量 | 次要 |
| A8 画廊三档截图（spec 验收项） | 截图存在，但 mtime 2026-11-13，早于当前 tokens.css（2026-11-21 20:19） | 次要（证据时效） |

### 1.4 签收判断

- **实现层：可签。** 契约里的颜色值、回退规则、时间轴宽度在代码中全部可逐值对上，未发现偏差。
- **流程层：不可签。** 缺 proposal / design / tasks / evidence 四类产物；对比度缺独立测量；`fe-category-*` 截图早于当前源码，不能证明当前 build。
- 契约本身无自相矛盾；唯一跨契约冲突见 §6.3（active 色）。

### 1.5 只读证据

`specs/COMP-message-colors/spec.md`（139 行，全文）、`specs/COMP-message-colors/test-plan.md`（14 行，全文）、`frontend/src/styles/tokens.css`（169 行，全文）、`frontend/src/components/components.css`（1039 行，全量 grep + 111-163/780-1034 逐行）、`frontend/src/components/library.tsx`（818 行，204-212 实读）、`frontend/src/app.tsx:642`、`frontend/src/gallery.tsx:133`。

---

## 2. COMP-conversation-panel

### 2.1 契约要点

- R1/R2：中栏 `--paper` 灰底铺满；白卡列独立居中；时间轴绝对 gutter 不参与居中；白卡 `surface` + 1px `line` + 圆角 12 + 无阴影；**消息透明**（`specs/COMP-conversation-panel/spec.md:43-52` 结构，`:57-63` 规则，`:62` 明确"MessageRow 不铺背景/不加边框/不使用圆角"）。
- R3 Composer 在面板外、与白卡共用 `--chat-column`（`spec.md:30`、`:72`）；R4 白卡 inset 上 12/下 16、与 Composer 间距 16（`:31`、`:124`）；R5 CardBlock 保留自身白底、**不出现双层白框**（`:32`、`:63`）；R6 375 左右各 8、圆角 8（`:33`）；R7 登记画廊（`:34`）。
- 居中硬规则 ≤1px（`spec.md:65`）；A11 居中、A12 Composer 与白卡 x/width/right ≤1px、A13 标签/右栏基线（见 `specs/COMP-conversation-panel/test-plan.md:17-18`）。
- §3 API（`spec.md:81-96`）：children / timeline / state / empty / error / **density** / **ariaLabel**；禁 className/style。
- §4.1 token（`spec.md:111-126`）：`--radius-panel:12px`(116)、**共享列宽 `--chat-column`**（118）、`--conversation-gutter-x` 桌面 16 / 375 8（119）、`--conversation-gutter-y` 上 12 下 16（120）、消息背景 transparent(121)、Composer 间距 16(124)、**`--chat-column` 必须在 tokens 单一来源登记**（126）。

### 2.2 实现现状

- 组件：`library.tsx:671-687`，根 `<section className="conversation-panel is-{state}" aria-label="当前会话消息">`（`:682`，硬编码）；ready 渲染 `timeline` + `.conversation-scroll`（`:683`）；非 ready 渲染 `.conversation-state` 内 `LoadingState`/`EmptyState`/`ErrorState`（`:684`）。
- 页面接线：`app.tsx:674-694`（`.chat-body` + `<ConversationPanel timeline={<TimelineGroups …/>}>` + `.chat-inner`），`app.tsx:697` 同级 `<Composer/>`。
- 灰底：`.chat-body { background: var(--paper) }`（`components.css:821`、`:831`）；面板自身 `background: transparent; border: 0; border-radius: 0`（`:840-843`）。
- 居中与 gutter：面板 `width: min(var(--conversation-card-w), calc(100% - 2 * var(--conversation-gutter-x)))` + `margin: 12px auto 16px`（`:836-838`）；时间轴 `position:absolute; left: calc(-1 * (var(--gutter-timeline) + var(--sp-8)))`（`:846-853`）。
- **中栏结构性事实**：容器透明（`:840-843`）、**每条 `.msg` 自己是一张白卡** —— `components.css:856-863` `.conversation-panel .msg { padding:12px 14px; margin:0 0 9px; background: var(--surface); border:1px solid var(--line); border-radius: var(--r-10); box-shadow:none }`。同一文件更早的"单白卡容器"规则（`:786-788`，`background: var(--surface)` + 边框 + 圆角 12 + `overflow:hidden`）被后面同特异度的 `:832-845` 覆盖，**当前生效形态是"每条消息白卡"，不是"单白卡容器"**。
- 视觉旁证：`docs/testing/20261121-123009-after-app-1600.png`（1600，灰底中栏，两条消息各为独立圆角白卡、中间有 9px 间隙；时间轴 tick 在卡片列左侧 gutter 内，不占列宽）。
- CardBlock：`.conversation-panel .card-block { margin:8px 0 0; background: var(--surface); border:1px solid var(--line); border-radius: var(--r-10) }`（`:866-872`）；而 `.msg` 已是白底 → 卡片消息会形成**白底套白底 + 两道 1px 边**。
- 宽度数学：`--conversation-card-w: 720px`（`tokens.css:53`）；`.chat-inner` 内边距 16/20（`css:855`）→ 消息卡内容宽 720−40=680；`.composer` 宽 `min(calc(var(--conversation-card-w) - 40px), …)`（`:874-879`）=680；1180 档 `.conversation-panel` 为 `100% - 104px`、`.composer` 为 `100% - 144px`（`:912-913`），扣除 40 内边距后仍相等。**即"打印出来的消息白卡"与 Composer 边缘数值对齐，而"面板外框"比 Composer 宽 40px。**
- API 实际：`density` / `ariaLabel` 不存在；多出 `onRetry` / `scrollRef` / `onScroll`（`library.tsx:671-680`）。
- Token：`tokens.css` 全文无 `--chat-column`（`:53` 实际名为 `--conversation-card-w: 720px`），`--radius-panel:12px`(55)、`--radius-panel-mobile`(58)、`--conversation-gutter-x:16px`(54)、`--gutter-timeline:44px`(91) 均存在。
- Loading：`conversation-skeleton` 已在 `css:790-793` 定义，但 `library.tsx:684` 用的是 `LoadingState`；契约要求白卡内 Skeleton 消息行（`spec.md` §6 状态表）。

### 2.3 差距清单

| 契约要求 | 实现 | 等级 |
|---|---|---|
| 消息透明、白卡为唯一边框容器（spec:46、:62-63、:121） | 容器透明、每条 `.msg` 白底 + 边框 + 圆角（css:856-863） | 阻断（A4 无法成立） |
| CardBlock 不出现双层白框（spec:32、:63） | `.msg` 白卡内再放白底 `.card-block`（css:856-863 + 866-872） | 阻断（A5 不成立） |
| API 含 density / ariaLabel，禁额外样式型 props（spec:81-96） | 两者缺失；多 onRetry/scrollRef/onScroll；ariaLabel 硬编码"当前会话消息"（library.tsx:671-682） | 阻断（API 门禁） |
| loading = 白卡内 Skeleton 行且尺寸不跳变（spec §6） | 使用 `LoadingState`，`.conversation-skeleton` 定义未用（css:790-793 / library.tsx:684） | 次要 |
| `--chat-column` 在 tokens 单一来源登记（spec:118、:126） | 无该 token，改名为 `--conversation-card-w`（tokens.css:53） | 次要（几何由 padding 补偿） |
| Composer 与白卡同列、x/width/right ≤1px（spec:30、:72） | 面板 720 / Composer 680；若"白卡"指消息卡则相符，若指单容器则差 40px（css:836、855、874-879、912-913） | 取决于 §2.2 结构口径（本报告不裁决） |
| A7 状态四态可用（test-plan:13） | 四态在 DOM 上存在并被单测覆盖（ConversationPanel.test.tsx:41-101） | 无（除 loading 形态） |

### 2.4 签收判断

- **不可签。** 阻断缺口：①契约的"单白卡 + 消息透明"与实现的"每条消息白卡"直接冲突，A4 无法验收；②CardBlock 双层白框在结构上必然发生，A5 不成立；③API 缺 `density`/`ariaLabel`，无法过 API Approved 门禁。
- 缺产物：proposal / design / tasks / evidence 全缺；`test-plan.md:3` 仍写"未实现"，而代码已接页面（`app.tsx:675`），状态与事实不符；缺 A11/A12 的 DOM 测量产物（test-plan:17-18 全为"待实现"）。
- 契约本身一处张力：R2/§2 的"单白卡"与 A12"Composer 与白卡对齐"在 720 vs 680 下只有在"白卡=消息卡"读法下才同时成立；建议由 Lead 裁定口径（本报告不裁）。

### 2.5 只读证据

`specs/COMP-conversation-panel/spec.md`（256 行，全文）、`test-plan.md`（19 行，全文）、`components.css`（786-891、901-952、1004-1034 逐行）、`library.tsx`（663-687 实读）、`app.tsx`（674-697 实读）、`ConversationPanel.test.tsx`（102 行，全文）、`conversation-responsive.test.tsx`（156 行，全文）、`docs/testing/20261121-123009-after-app-1600.png`（看图）。

---

## 3. COMP-timeline-groups

### 3.1 契约要点

- 结构三层 SessionGroup → DateGroup → Tick（`specs/COMP-timeline-groups/spec.md:76-87`）；数据模型含 `dateKey`/`sessionOrder`/`isCurrentSession`（`:45-57`）。
- 颜色（`:95-112`）：user `--accent`、agent `--muted`、**active `--ink` 黑、宽 24**（`:101`）；ancestor `opacity:.55`；**祖先组内 active tick 必须 `opacity:1`**（`:101`、`:105`）；分类只进 TimelineTip，不进 tick/aria（`:103`）。
- 尺寸（`:114-132`）：rail 44、tick 20×4、active 24×4、tick 间距 2、会话组间 6、**日期组保留**、点击热区**至少 20×20**（`:126`）。
- 键盘 Tab/←→/Home/End/Enter/Space/Esc；aria-label 含角色/会话/时间、不含分类；四档 1600/1920/1180/375 不裁切。

### 3.2 实现现状

- 组件：`library.tsx:437-512`。排序 `sessionOrder → dateKey → at`（`:450`）；**只按 `sessionId` 切组**（`:459-468`：`if (!group || group.sessionId !== message.sessionId)`），**没有任何 DateGroup 子层或日期标题**；`.tl-date` 仅用于旧 `Timeline`（`library.tsx:392`），TimelineGroups 的渲染（`:489-503`）无日期节点。
- tick：`<button className="tl-bar is-user|is-agent is-current?">`（`:490-502`）；基础 20×4（`components.css:115`）；组内 gap 2（`:919`）、会话组间 margin-top 6（`:920`）、rail 44（`:916` + `tokens.css:91`）。
- 颜色：`components.css:963` user `--timeline-user`、`:964` agent `--timeline-agent`、`:965` is-current `--timeline-selected` 宽 24、`:966` hover 宽 24。
- 祖先：`.tlg-session.is-ancestor-session { opacity:.55 }`（`:922`）；`current` 1（`:923`）；**`.tlg-session.is-ancestor-session .tl-bar.is-current { opacity:1 }`（`:925`）在 CSS 上无效** —— 父元素 opacity 已建立合成层，子元素设为 1 也只能得到 `.55 × 1`，无法恢复到 1。
- 命中区：`.tl-bar { position: relative }`（`:1021`）；44×44 伪元素只在 `@media (pointer: coarse)` 内（`:1022-1025`），同时粗指针下 gap 拉到 40（`:1023-1024`）。**细指针（鼠标）下命中区仍是 20×4**，不满足 spec:126 的"至少 20×20"。
- 键盘与无障碍：`onKeyDown` 处理 ←→/↑↓/Home/End/Esc（`:470-483`）；tick `aria-current`（`:495`）、`aria-describedby` 仅 tip 打开时挂载（`:496`）、`aria-label` 为"角色 · 会话 · 时间"（`:497`，不含分类）；组标签"当前会话/上级会话：标题"（`:488`）。
- 页面接入：`app.tsx:676` 已用 TimelineGroups；旧 `Timeline` 只在 `gallery.tsx:125` 保留。
- 已有验收：`docs/tasks/acceptance.md:352-372`（首轮不签字）→ `:373-386`（返工后复验**签字通过**，build `mwdmvfow-9d8pn`，`:383` 记录祖先组 active 宽 24/`aria-current` 唯一），但 `:384` 明写"**App 仍用旧 Timeline**"，`:369` 还标注"`.is-ancestor-session .tl-bar.is-current { opacity:1 }` 会让祖先组 active 突破 .55"待确认。

### 3.3 差距清单

| 契约要求 | 实现 | 等级 |
|---|---|---|
| SessionGroup→DateGroup→Tick 三层；日期组保留（spec:76-87、:123） | 仅 SessionGroup→Tick；无 dateKey 子层、无日期标题（library.tsx:459-468、489-503） | 阻断 |
| active = `--ink` 黑（spec:101、:120） | `--timeline-selected` `#232A8C`（css:965） | 阻断（且与 message-colors spec:68 冲突，见 §6.3） |
| 祖先组内 active tick `opacity:1`（spec:101、:105） | 组级 `.55` + 子级 `opacity:1`（css:922、925），CSS 合成下无法达成 | 阻断（契约自相矛盾） |
| 点击热区至少 20×20（spec:126） | 仅 coarse pointer 有 44×44；细指针 20×4（css:1021-1025） | 次要 |
| 分类只进 Tip、aria 不含分类（spec:103） | 一致（library.tsx:497、508） | 无 |
| 组间 gap 6 / tick gap 2 / rail 44 / tick 20×4（spec:118-122） | 一致（css:916、919-920、115） | 无 |
| 键盘、hover/focus、Esc、滚动不消失（spec §7） | 一致，单测覆盖（TimelineGroups.test.tsx:51-102） | 无 |
| test-plan 声明 A5"日期分组"通过（test-plan:11） | 实现无日期分组；acceptance:435 只记"组 gap 6/6" | 阻断（证据陈述失真） |

### 3.4 签收判断

- **不可签。** 阻断：①无 DateGroup 层（结构级缺口，且 test-plan 声称已验）；②active 色与契约不符（`#232A8C` vs `--ink`），且该冲突源于两份 spec 口径不一致；③"祖先组内 active opacity:1"与"祖先组整组 .55"在本实现方式下不能同时成立，属于**契约自身矛盾**；④页面接入（`app.tsx:676`）发生在签字 build 之后，Page Adoption 无对应证据。
- 缺产物：proposal / design / tasks / evidence 全缺；四档截图（A1）与 active 覆盖（A3）无当前 build 证据；`test-plan.md` 引用的 acceptance 段落写的是"App 仍用旧 Timeline"。

### 3.5 只读证据

`specs/COMP-timeline-groups/spec.md`（229 行，全文）、`test-plan.md`（16 行，全文）、`library.tsx`（424-513 逐行）、`components.css`（111-125、916-925、1020-1034 逐行）、`app.tsx:676`、`gallery.tsx:77-92`、`TimelineGroups.test.tsx`（113 行，全文）、`docs/tasks/acceptance.md:352-386`。

---

## 4. COMP-timeline-tip

### 4.1 契约要点

- API（`specs/COMP-timeline-tip/spec.md:62-81`）：open / anchorRef / sender / sessionTitle / timeLabel / summary / fallbackLabel? / onClose / onStateChange?；**不接收 category**；约束：禁 className/style/width/color、不接原始消息、不接收 HTML（`:86-89`）。
- Token（`:93-104`）：`--radius-tip:8px`(97)、**阴影 `--shadow-overlay` / `--shadow-tip`，轻阴影、禁止重阴影**(98)、`--tip-width:236px`(102)、层级、字体。
- 定位与交互：与锚点间距 8、右不足翻左、视口边距 8、滚动按实时 rect 重定位不消失；hover 延迟 120ms、移出 200ms grace、同一时刻仅一张；role=tooltip + aria-describedby、禁原生 title。

### 4.2 实现现状

- 组件：`library.tsx:286-358`。props 与契约一致，但**多一个 `category?: string`（`:294`）**；`onStateChange` 存在（`:296`、`:305`、`:327`）。
- 定位：`width = Math.min(236, window.innerWidth - 16)`（`:312`）；`left = rect.right + 8`，右不足翻左 `rect.left - width - 8`，左/上/下各夹 8（`:314-323`），clamp 后 state=`edge-clamped`（`:325`）；`requestAnimationFrame` + `ResizeObserver` + `scroll(capture)`/`resize` 重算（`:330-340`）；Esc 关闭（`:345-348`）；`if (!open) return null`（`:350`）；portal 到 body，`id="timeline-tip"`、`role="tooltip"`、内联 left/top、`data-state`（`:351-353`）；内容为"你/司墨 · 会话 · [分类] · 时间"（`:353`）+ 摘要两行（`:354`）。
- 样式：`components.css:798` `.timeline-tip-surface`（fixed、z 90、宽 `min(--tip-width, 100vw - 16px)`、`--surface`、1px `--line`、`--radius-tip`、**`box-shadow: var(--shadow-pop)`**、`pointer-events:none`）；`:799-803` meta 12/1.4、session 省略号、time tabular-nums、summary `-webkit-line-clamp:2` 13/1.45。
- 接线：TimelineGroups 传入 `category={categoryLabel(...)}`（`library.tsx:508`），`aria-describedby` 仅 tip 打开时挂载（`:496`）；旧 `Timeline` 不传 category（`:409`）。
- 已有验收：`acceptance.md:210-230`「8787 线上 smoke 通过（线上闭环）」，`:220` 记录 tip `236×74.84`、`role=tooltip`、`state visible`、唯一 tick 挂 `aria-describedby`；`:187-208` 为 Timeline 接入后实机签字。

### 4.3 差距清单

| 契约要求 | 实现 | 等级 |
|---|---|---|
| 阴影用 `--shadow-overlay`/`--shadow-tip` 轻阴影，禁重阴影（spec:98） | 用 `--shadow-pop`（`0 18px 40px -20px rgba(22,23,27,.28)`，tokens.css:80）；两 token 均不存在 | 次要（视觉重量不符） |
| API 不含 category（spec:62-81） | 新增 `category` prop（library.tsx:294），并由 groups 传入（:508） | 次要（API 漂移） |
| 宽 236 / 间距 8 / 翻左 / 边距 8 / 滚动跟随（spec §5） | 一致（library.tsx:312-323、333） | 无 |
| role=tooltip + aria-describedby + 无 title（spec §5/§7） | 一致（:352、:496；全组件无 title 属性） | 无 |
| 不可点击、pointer-events:none（spec:89、A7） | 一致（css:798） | 无（缺单测） |
| A8 DPR2 三档 + 画廊（test-plan:13） | 截图存在（`frontend/review/timeline-tip-*.png`），mtime 2026-11-12，早于当前源码 | 次要（证据时效） |

### 4.4 签收判断

- **实现层：可签。** 有 8787 线上 smoke 与组件层两轮签字，定位/内容/无障碍行为在代码中可逐条对上，且比契约更严格（edge-clamp 实测）。
- **流程层：不可签。** 缺 proposal / design / tasks / evidence 四类产物；`--shadow-overlay` token 不存在（与 spec:98 硬要求不符）；API 多了 `category`；截图早于当前源码（tokens.css 2026-11-21 20:19），不能证明当前 build。
- 契约本身无矛盾。

### 4.5 只读证据

`specs/COMP-timeline-tip/spec.md`（197 行，全文）、`test-plan.md`（14 行，全文）、`library.tsx`（283-360、484-512 逐行）、`components.css`（797-808 逐行）、`tokens.css:79-80`、`docs/tasks/acceptance.md:187-230`、`frontend/review/timeline-tip-*.png`（列名 + mtime）。

---

## 5. COMP-composer-send-mode

### 5.1 契约要点

- R1–R8（`specs/COMP-composer-send-mode/spec.md:31-38`）：默认 enter；反转 shift-enter；Ctrl/Cmd+Enter 始终发送；IME composing 不发送/不切换、compositionend 不补发（`:55-61`）；提示区 hover/focus 显示、20px 槽常驻、间距 2px（`:35`、`:63-73`）；切换控件 button + `aria-pressed` + `aria-label`（`:36`、`:70-71`）；持久化 `simo.composer.sendMode`、BroadcastChannel 优先 storage 兜底、非法回退（`:37`）；375 不溢出（`:38`）。
- 文案精确：enter=`Enter 发送，Shift+Enter 换行`，shift-enter=`Enter 换行，Shift+Enter 发送`（`:68-69`）；aria-label 示例"切换发送方式，当前 Enter 发送；按下后改为 Shift+Enter 发送"（`:71`）。

### 5.2 实现现状

- 组件：`library.tsx:514-597`。sendMode 初始值读 `simo.composer.sendMode`，并兼容旧 key `simo.composer.send-mode` 后迁移（`:518-529`）；`BroadcastChannel('simo.composer.sendMode.v1')` + `storage` 兜底，`apply` 只接受两值（`:532-540`）；`setMode` 先 setState、写 localStorage、另开 channel postMessage 后 close（`:541-545`）。
- 键盘：`onCompositionStart/End` 记 composingRef 与结束时间戳（`:566-570`）；keydown 顺序为 disabled → `isComposing || composingRef` → 非 Enter 返回 → compositionend 后 50ms 内抑制 → `metaKey||ctrlKey` 强制发送 → 按 sendMode 决定 preventDefault+submit（`:571-579`）。
- 切换控件：`{!disabled && <button className="composer-hint-icon" aria-pressed={sendMode==='shift-enter'} aria-label={ariaAction} onClick={toggle}>}` + `<span className="composer-hint composer-send-mode-hint" aria-live="polite">{hint}</span>`（`:584-589`）；文案常量（`:561-562`）与 spec:68-69 逐字一致。
- 样式：`components.css:1004` 图标 20×20、默认 `opacity:0; pointer-events:none`；`:1005` hover/focus-within 显示；`:1018` `.composer-hint-group { gap: var(--sp-2) }`（2px）；`:1010-1016` ≤30em 只留图标；`:1033` coarse pointer 下 44×44。
- 状态与证据：spec/test-plan 仍写"spec ready / 当前未实现"（`test-plan.md:3`），但 `Composer.test.tsx` 已覆盖发送/换行（`:28-42`）、IME（`:44-50`、`:172-183`）、Ctrl+Enter（`:52-59`）、切换+持久化（`:87-100`、`:120-142`）、storage 同步（`:144-160`）、禁用（`:162-170`）；`acceptance.md:1111` 记"A1–A8 签字通过（未部署）"，`:1124-1133` 记 8787 线上 smoke **通过且已部署**（`mwfzyf8u-h9f0d`：gap 2px、aria-pressed=true、localStorage `shift-enter`、375 无溢出、console 0）。

### 5.3 差距清单

| 契约要求 | 实现 | 等级 |
|---|---|---|
| R1–R4 快捷键/反转/Ctrl/IME（spec:31-34、:55-61） | 一致（library.tsx:571-579），单测覆盖 | 无 |
| R5 20px 槽常驻 + 2px 间距 + hover/focus（spec:35、:65-67） | 一致（css:1004-1005、1018；acceptance:1114-1116 实测 2px） | 无 |
| R6 button + aria-pressed + aria-label（spec:36、:70-71） | 一致（library.tsx:584-589） | 无 |
| R7 持久化/多标签/非法回退（spec:37） | 一致（library.tsx:518-545），单测覆盖 | 无 |
| 契约状态 = spec ready / 未实现（spec 首部、test-plan:3） | 代码已实现、已接页面（app.tsx:697）、已线上 smoke 通过（acceptance:1124-1133） | 阻断（状态失真，签收口径不成立） |
| 六件套（proposal/design/tasks/evidence） | 只存在 spec + test-plan | 阻断（门禁） |
| 契约未列的额外行为：旧 key 迁移（:518-529）、compositionend 后 50ms 抑制（:575） | 已实现且有测试 | 次要（契约需回写） |

### 5.4 签收判断

- **实现层：可签。** 契约的 R1–R8 全部能在代码与单测/线上 smoke 中对上，未发现行为偏差。
- **流程层：不可签。** 契约与 test-plan 的状态、证据描述与事实相反（"未实现" vs 已部署上线），签收方无法按文档判定；缺 proposal / design / tasks / evidence；spec 未回写旧 key 迁移与 50ms 抑制两项既成行为。

### 5.5 只读证据

`specs/COMP-composer-send-mode/spec.md`（127 行，全文）、`test-plan.md`（20 行，全文）、`library.tsx`（514-597 逐行）、`components.css`（1004-1033 逐行）、`Composer.test.tsx`（184 行，全文）、`app.tsx:697`、`docs/tasks/acceptance.md:1111-1133`。

---

## 6. 横切问题

### 6.1 六件套缺失（5/5）

实测目录：每个 COMP 只有 `spec.md` + `test-plan.md`。`docs/process/component-system.md:105-139`（§6.7 先组合→再变体→最后新建；§6.8 六件套 + 6 道门禁）要求的 proposal / design / tasks / evidence 全部缺失，因此**没有一个 COMP 能走到 Verify/Archive 门禁**。证据散落在 `docs/tasks/acceptance.md`，与 COMP 目录无双向链接。

### 6.2 证据时效：所有 COMP 截图都早于当前源码

| 文件 | mtime |
|---|---|
| `frontend/src/styles/tokens.css` | 2026-11-21 20:19 |
| `frontend/src/components/library.tsx` | 2026-11-21 20:20 |
| `frontend/src/components/components.css` | 2026-11-21 20:29 |
| `frontend/review/timeline-tip-1600.png` | 2026-11-12 18:54 |
| `frontend/review/message-cards-react-1600.png` | 2026-11-12 20:59 |
| `frontend/review/fe-category-top-1600.png` | 2026-11-13 00:18 |
| `frontend/review/composer-spec-default.png` | 2026-11-14 14:00 |

结论：现有截图**均不能证明当前 build**；`docs/testing/20261121-*.png`（12 张）是今日 app/gallery 对照图，不按 COMP 命名、无 COMP 断言产物。

### 6.3 契约之间自相矛盾

1. **active 色**：`COMP-timeline-groups/spec.md:101`（active=`--ink` 黑）vs `COMP-message-colors/spec.md:68`（selected=`#232A8C`）。实现按后者（`components.css:965`），所以 timeline-groups 按自己的契约判**不通过**，按 message-colors 判**通过**。
2. **祖先组 active 的 opacity**：`timeline-groups/spec.md:105` 与 `message-colors/spec.md:70` 都要求"组整组 .55、组内 active 仍 1"。只要透明度施加在组容器上（`css:922`），子元素就无法回到 1；该要求只有在"逐 tick 施加透明度"的实现方式下才可能成立。契约需裁定施加层级。

### 6.4 状态字段不可信

- conversation-panel：spec 标 approved，test-plan:3 写"未实现"，实际已接页面（`app.tsx:675`）并有 102 行单测。
- composer-send-mode：spec 标 spec ready，test-plan:3 写"当前未实现"，实际已上线 smoke 通过（`acceptance.md:1124`）。
- timeline-groups：acceptance:384 写"App 仍用旧 Timeline"，实际 `app.tsx:676` 已切换。
- 三个 COMP 的 `manifest.json` 条目只有 name/variants/states/owner，无状态、无产物链接、无截图引用（`frontend/src/components/manifest.json:350-416`）。

---

## 7. 最严重阻断项（Top 3）

1. **conversation-panel 结构基线冲突**：契约要求"单白卡容器 + 消息透明"，实现是"透明容器 + 每条消息白卡"（`components.css:832-845` vs `:856-863`），并导致 CardBlock 双层白框（`:856-872`）——A4/A5 无法通过，且 A12 的"白卡"指代在两种读法下结论相反。
2. **timeline-groups 结构 + 颜色双缺口**：无 DateGroup 层（`library.tsx:459-468`），active 用 `#232A8C` 而契约写 `--ink`（`css:965` vs spec:101），祖先 active `opacity:1` 在组级透明度下物理不可达（`css:922/925`），而 `test-plan.md:11` 却声称"日期分组"已验。
3. **流程门禁整体失效**：5/5 COMP 只有 spec + test-plan（缺 4 类产物）；全部 COMP 截图早于当前源码（11-12/13/14 vs 11-21）；composer 与 conversation-panel 的 test-plan 仍写"待实现"而代码已上线。任何签收在此状态下都不可追溯。

---

## 8. 审计只读证据汇总

| 对象 | 读取范围 |
|---|---|
| `specs/COMP-message-colors/spec.md` | 全文（139 行） |
| `specs/COMP-message-colors/test-plan.md` | 全文（14 行） |
| `specs/COMP-conversation-panel/spec.md` | 全文（256 行） |
| `specs/COMP-conversation-panel/test-plan.md` | 全文（19 行） |
| `specs/COMP-timeline-groups/spec.md` | 全文（229 行） |
| `specs/COMP-timeline-groups/test-plan.md` | 全文（16 行） |
| `specs/COMP-timeline-tip/spec.md` | 全文（197 行） |
| `specs/COMP-timeline-tip/test-plan.md` | 全文（14 行） |
| `specs/COMP-composer-send-mode/spec.md` | 全文（127 行） |
| `specs/COMP-composer-send-mode/test-plan.md` | 全文（20 行） |
| `frontend/src/styles/tokens.css` | 全文（169 行） |
| `frontend/src/components/components.css` | 全量 grep + 111-163、780-1034 逐行（共 1039 行） |
| `frontend/src/components/library.tsx` | 204-212、283-360、424-513、514-597、663-687（共 818 行） |
| `frontend/src/app.tsx` | 全量 grep + 674-697 |
| `frontend/src/gallery.tsx` | 全量 grep + 76-137 |
| `frontend/src/components/manifest.json` | 全文（434 行） |
| `frontend/src/components/ConversationPanel.test.tsx` | 全文（102 行） |
| `frontend/src/components/conversation-responsive.test.tsx` | 全文（156 行） |
| `frontend/src/components/TimelineGroups.test.tsx` | 全文（113 行） |
| `frontend/src/components/Composer.test.tsx` | 全文（184 行） |
| `docs/tasks/acceptance.md` | 636-710、1110-1149 逐行 + 全量 grep |
| `docs/testing/20261121-123009-after-app-1600.png` | 看图（结构旁证） |
| 时间戳 | `Get-Item` 于 tokens.css / library.tsx / components.css / 4 张 review 截图 |

未执行：测试运行、构建、浏览器实机、对比度复算、DOM 中心差测量。以上结论均来自源码与文档实读，不含运行态测量。
