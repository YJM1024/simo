# 验收任务 · 金字塔

> 只读检查，不改业务代码；结论必须有证据（截图/命令/测试）。
> 验收通过前，8787 不上线。

## L0 目标

每一层交付都有人能回答：**做没做、对不对、证据在哪、还剩什么**。

## L1 验收域

| 域 | 内容 |
|---|---|
| A1 原型验收 | 静态原型结构、对齐、时间轴、底部、响应式 |
| A2 组件验收 | 组件状态、尺寸 tokens、无内联样式 |
| A3 页面验收 | 对话、工作台，全状态 |
| A4 功能验收 | 会话/消息/流式/卡片/会话动作 |
| A5 工程验收 | tsc/build/测试/无 console error |
| A6 上线前验收 | 8787 可访问、数据真实、无回归 |

## A1 原型验收（当前批次）

| ID | 检查项 | 通过标准 | 状态 |
|---|---|---|---|
| A-01 | 1600/1180/375 三档整体 | 无横向滚动、无裁切、无重叠 | **通过**（2026-11-12，见下「A-01 验收结论」） |
| A-02 | 中间栏基线 | Tab/时间轴/消息/输入区同一左基线 | **通过**（复验 2026-11-12；附口径注记） |
| A-03 | 时间轴 | 垂直居中、聚合横条、间距一致、蓝条已删、悬浮两栏 | **通过**（2026-11-12） |
| A-04 | 右栏 | 导航贴右、内容在左、边框正确 | **通过**（2026-11-12） |
| A-05 | 底部 | 状态栏跨全宽、侧栏/主区同底、仅消息区滚动 | **通过**（2026-11-12） |
| A-06 | Tab | 「对话」左间距、下划线跟文本、工作台不受影响 | **通过**（2026-11-12） |
| A-07 | 尺寸规范 | 内联 style=0；奇数/随手值已收敛 | **通过**（复验 2026-11-12；附残余 -2px 注记） |
| A-08 | 组件画廊 | 与原型一致，含 tokens/时间轴/Statusbar 样例 | **通过**（复验 2026-11-12） |

### A-01 证据

- `frontend/review/prototype-1600.png`
- `frontend/review/prototype-1180.png`
- `frontend/review/prototype-375.png`
- `frontend/review/gallery-1600.png`

### A-01 验收结论（2026-11-12，验收负责人：schema-drafter）

**结论：通过（5/5）**。范围为 Lead 上轮指定的 5 项；A-02–A-08 已于 2026-11-12 复核（结论见下节：A-03–A-06 通过、A-02/A-07/A-08 打回）。

| # | 检查项 | 结论 | 证据（原样数值） |
|---|---|---|---|
| A-01.1 | 1600/1180/375 无溢出/裁切 | **通过** | 三档 `documentElement.scrollWidth == clientWidth`：1600/1600、1180/1180、375/375；`scrollHeight == clientHeight`：1000/1000、1000/1000、812/812；三档遍历所有可见元素：`outRight=[]`（无元素超出视口左右边界）、`clipped=[]`（无 hidden/clip 容器的内容溢出）。区域：1600 sidebar 0–240 / main 240–1600 / inspector 1300–1600 / statusbar 976–1000；1180 sidebar 0–228 / inspector 900–1180；375 sidebar/inspector 按设计隐藏，main 0–375 / statusbar 788–812。截图 1600×1000、1180×1000、375×812 与实测同源。 |
| A-01.2 | 白色标签 | **通过**（口径见注） | chat 页签/标签「对话」`computed background = rgb(255,255,255)`（纯白）、`color = rgb(22,23,27)`、`border = 1px solid`、rect 51×30，三档一致（375 时位于 x=16）。**注**：消息元信息分类标签（需求澄清/进度汇报/确认）为 `rgb(244,243,239)`（token `--surface-2`，中性浅底，非纯白），按"白底页签/标签"口径判通过；若口径指 meta 标签必须纯白，则需改 token 后复验。 |
| A-01.3 | 时间轴 20×4、gap2 | **通过** | `.tl-track` `rowGap = columnGap = 2px`；`.tl-bar` 实测 **20×4 px**（5 条；当前条 active 24×4 属设计态 `.tl-bar.active`）；相邻条 top 差 6px（4 条高 + 2 gap）；水平居中：track 400–424（中心 412），bar 402–422（中心 412）；1180 同构（238–262）。375：时间轴按设计隐藏（`display:none`，<900 断点），非裁切。 |
| A-01.4 | 右栏三组各 3 行可展开 | **通过** | 默认可见行数 = 3/3/3（已完成 3/12、进行中 3/7、未开始 3/9）；逐组点击组头后可见行数 = **12/7/9**、`aria-expanded=true`、计数显示 12/12、7/7、9/9；再次点击恢复 3/3/3。展开态截图见 `prototype-1600-expanded.png`（已完成 12/12）。 |
| A-01.5 | 交付物正常流可见 | **通过** | 「交付物」区块 `position=static`（正常文档流，非 fixed/absolute）、`display=block`；1600 rect (1315,682.8)–(1546,798.4) 落在 inspector (1300,90)–(1600,976) 内；1180 rect (915,682.8)–(1126,798.4) 落在 (900,90)–(1180,976) 内；文本「交付物 0 暂无交付物」（当前为 0 件空态）；无覆盖/遮挡。375 右栏按设计隐藏。 |

**证据方法**（可复现）：本机 headless Chrome 157.0 + CDP（`Emulation.setDeviceMetricsOverride` 1600×1000 / 1180×1000 / 375×812；`Runtime.evaluate` 读取 `scrollWidth/clientWidth`、`getBoundingClientRect`、`getComputedStyle`；点击 `.exec-head` 前后统计可见 `.exec-row` 数）。原型地址 `http://127.0.0.1:8899/index.html`（同 `frontend/prototype/`，未改动服务与原型文件）。截图时间 13:48:11–13:48:13，晚于原型 assets（`index.html` 13:47:26、`components.css` 13:48:03），为最新一版。

**未覆盖 / 待确认**：

- 本结论只覆盖上述 5 项；A-02–A-08 已在本轮复核（见下节：A-03–A-06 通过、A-02/A-07/A-08 打回）；`gallery-1600.png` 已在 A-08 复核（不通过，见下节）。
- 交互（hover/点击/键盘）不在 A-01 范围（归 A-03/A-34）。
- "白色标签"口径见 A-01.2 注；如 Lead 指 meta 分类标签纯白，则该项应改判"不通过"并回退给前端改 token（`--surface-2` → `--surface` 或加白底/描边）。
- 未在真机浏览器手动走 Tab/焦点（仅静态测量），A-02/A-08 复核时补。

### A-02–A-08 验收结论（2026-11-12，验收负责人：schema-drafter）

**结论：4 项通过（A-03/A-04/A-05/A-06）、3 项不通过（A-02/A-07/A-08）→ 按打回规则打回。** 本轮只记录结论与证据，不改任何代码。

| # | 检查项 | 结论 | 证据 / 原因（原样数值） |
|---|---|---|---|
| A-02 | 中间栏基线（Tab/时间轴/消息/输入区同一左基线） | **不通过（打回）** | 1600 实测左边缘：Tab 按钮 **458**；时间轴容器 **390**（bars 中心 412）；消息头像 **458**（正文 494）；输入区容器 **390**（textarea 文本 405）。1180：290 / 228 / 290（正文 326）/ 228（文本 243）。四者不共线：Tab≈消息 458、时间轴≈输入 390，两组相差 **68px**（1180 为 62px）。**修复方向（需 Lead 定口径）**：若以消息列为基线（458/290），则不变量为「时间轴 gutter 44+24=68」——输入区与 Tab 容器需内缩 68（1180 为 62）；若以 390/228 为基线，则 Tab 与消息需左移 68/62。 |
| A-03 | 时间轴（垂直居中、20×4/gap2、悬停/当前24、日期、悬浮两栏、点击/键盘） | **通过** | ① 垂直居中：timeline 中心 **483.06 == track 中心 483.06**（1600 与 1180 完全一致）。② 尺寸：bars **20×4**（当前条 active 24×4 属设计态），相邻 top 差 **6px**（4+2），`.tl-track` rowGap=columnGap=**2px**。③ 日期：`11/12` 可见，rect 22.8×9、中心 411.99 ≈ track 中心 412。④ hover/当前：hover 后 bar 宽 **24**；active bar 宽 **24**；tooltip 可见 236×74.5，含「头部信息（司墨·主会话·10:25）+ 正文预览」两段（`.tl-tip-top`/`.tl-tip-body`），rect 在视口内。⑤ 点击：点第 1 条 → 出现 `.msg.flash`（flash=1）、消息区滚动定位生效。⑥ 键盘：聚焦时间轴后 ArrowDown/ArrowUp 使 scrollTop 0→121→85；Enter 触发定位（flash=1、scrollTop 18→85）。⑦ 蓝条已删：当前 CSS 无 `is-current`/`::before` 蓝色竖条规则。**备注**：active 高亮随滚动 sync 更新，平滑滚动期间读数有约 1 帧滞后，不影响导航。 |
| A-04 | 右栏（导航贴右 40、内容在左、四节顺序、三组默认3+展开/收回） | **通过** | ① 导航贴右：`insp-rail` **40×886**，右边缘=1600（railRightGap=**0**）；1180 右边缘=1180。② 内容在左：`insp-body` l=**1301**（1180: 901），在 rail 左侧。③ 边框：inspector border-left **1px #E6E4DE**；insp-rail border-left **1px #EFEDE8**；无多余分隔。④ 四节顺序与位置：目标(102–188) → 输入(188–274) → 执行会话(274–682) → 交付物(682–798)，左缘均 1315（1180: 915）。⑤ 三组：默认可见 **3/3/3** 行；逐组展开后 **12/7/9** 行、`aria-expanded=true`、计数 12/12、7/7、9/9；再点收回 **3/3/3**。 |
| A-05 | 底部（状态栏跨全宽、sidebar/main/inspector 同底、仅消息区滚动） | **通过** | ① 状态栏 **0–1600 ×24px**（1180: 0–1180），`position: static`、border-top 1px #E6E4DE。② 同底：sidebar/main/inspector 底边均为 **976** = 状态栏顶；状态栏底 = **1000** = 视口底。③ 页面不滚动：doc scrollHeight==clientHeight=1000（三档相同）；仅 `.scroll` 可滚（scrollHeight 805 > clientHeight 684）；`side-scroll` 与 `insp-body` 当前 scrollHeight==clientHeight（无溢出）。④ 实测消息区 scrollTop 变化（85→121，含上限 clamp=121），window/document scrollTop 恒 **0**，statusbar/inspector 位置不变。 |
| A-06 | 顶层 segmented + 中间白色标签/12px/分隔线 | **通过** | ① 顶层 segmented：`.seg` 119×28（1600；1180 同）、padding 2、gap 1；按钮 56×22；active「仅本会话」bg **rgb(255,255,255)**。② 中间白色标签：「对话」bg **rgb(255,255,255)**、51×30、radius 8、border 1px，三档位置 458/290/16。③ 12px：按钮底到分隔线实测 **12px**（`padding-bottom:12px`，`gapButtonToBorder=12`）。④ 分隔线：`.chat-tabs` border-bottom **1px solid rgb(239,237,232)**（--line-soft）。⑤ 375：seg 按设计 `display:none`（横向空间不足），白色标签仍在 x=16。 |
| A-07 | 尺寸规范（内联 style=0、尺寸 tokens 化） | **不通过（打回）** | ① 内联 style：**0**（index.html、gallery.html 均 0；运行态悬停前 `[style]`=0，tooltip 的 left/top 为 JS 动态坐标，属允许例外）——这一半达标。② **尺寸 tokens 未收敛**：tokens.css 定义 **49** 个 token、components.css 引用 `var(...)` **291** 次，但仍有 **263 处布局尺寸为裸 px**；关键不一致：`--content: 720px` 已定义但 **0 次使用**，`.chat-tabs/.chat-content/.composer` 用 `max-width: 760px`（DESIGN 消息列 720）；`.timeline width: 44px`（DESIGN 时间轴 22，无 token）；`.chat-tabs padding-left: 68px`（1180: 62px）；`.msg-text max-width: 680px`；`.chat-tabs button height: 30px`；`.chat-tabs gap: 14px`；`.composer textarea min-height: 66px / max-height: 180px`；`.chat-inner padding: 18px 24px 16px`。上述多不在 spacing/size 刻度 2/4/8/12/16/20/24/32/40/48/64 上（frontend.md F1.2 判据）。**修复方向（不代改）**：接上 `--content`，新增/改用 `--timeline`、`--chat-gutter` 等 token，裸值收敛到刻度。 |
| A-08 | 组件画廊与原型一致（时间轴/Statusbar/Tokens 样例） | **不通过（打回）** | ① 样例存在：画廊含「时间轴 Timeline…」「Tokens / 尺寸刻度」「底部状态栏 Statusbar」三节。② Statusbar 样例：24px 高、白底、border-top 1px #E6E4DE、文本「就绪 / V4.1 Flash · 读/写权限按策略」→ 与原型一致。③ Tokens 样例：Spacing 2/4/8/12/16/20/24/32/40/48/64、Icon 16/20/24、Radius 4/6/8/10 → 与 tokens.css 一致。④ **时间轴样例不一致**：标题写「40–44px gutter / **21×6 / 3px gap**」，实测样例 bars 为 **20×4**（active 24×4）、横向排列、横向间距 **8px**；而原型主时间轴为 **20×4、纵向 gap 2px**——标题、样例、原型三者不一致。**修复方向（不代改）**：统一为原型规格 20×4/gap2；若刻意展示横向预览变体，则标题改为「预览变体：20×4 / 沿横向排列」并注明与主时间轴差异。 |

**证据方法**（可复现）：本机 headless Chrome 157.0 + CDP（`Emulation.setDeviceMetricsOverride` 1600×1000 / 1180×1000 / 375×812；`Runtime.evaluate` 读取 `getBoundingClientRect/getComputedStyle/scrollWidth/clientWidth`；CDP `Input.dispatchMouseEvent` 触发 hover/click、`Input.dispatchKeyEvent` 触发 Arrow/Enter；gallery 1600 量测）；A-07 另做静态 CSS 审计（正则扫描 components.css/tokens.css 与 HTML 的 `style=`）。原型 `http://127.0.0.1:8899/index.html`、`gallery.html`，未改动服务与原型文件；截图 `frontend/review/prototype-{1600,1180,375}.png`、`prototype-1600-expanded.png`、`gallery-1600.png` 对照。

**未覆盖 / 待确认**：

- A-02 的"唯一基线"取哪条（390/228 还是 458/290）需 Lead 定口径后再回退前端修；本结论只判定"四者不共线"。
- A-03 的「悬浮两栏」按「头部信息 + 正文预览」两段判通过；若要求左右并排两栏，当前为上下两段（不满足）。
- A-07 的 tokens 审计为静态 CSS 扫描（DOM 动态样式已验证为 0）；字体字号阶梯是否纳入"尺寸"未展开判。
- 375 下时间轴/右栏按设计隐藏，A-03/A-04 仅在 1600/1180 判定；工作台页（无 workbench.html）与 A-08 之外组件本轮未复核。

### A-02–A-08 复验结论（2026-11-12 v2，验收负责人：schema-drafter）

**结论：上一轮打回的 3 项（A-02/A-07/A-08）复验全部通过；A-01–A-08 至此全部通过。** 本轮只读复验，未改代码。

| # | 检查项 | 复验结论 | 证据（原样数值） |
|---|---|---|---|
| A-02 | 中间栏基线 | **通过**（附口径注记） | 基线 1600=494 / 1180=326：`.chat-tabs` 首按钮左缘 **494/326**；`.msg-text` 左缘 **494/326**；Composer 文本左缘 **494/326**（textarea 左缘 459/291 + padding-left 35）——三处一致。Composer 框左缘 **458/290**（头像列）；时间轴 gutter **390/228**（宽44）保留在基线左侧。375：Tab 左缘 **16**（≥16）；doc scrollWidth==innerWidth=**375**，无横向溢出。**附注**：Tab 字形文本左缘为 **507/339**（chip 内 padding 12 + 1px border = 13px inset）；按“标签块/内容块左缘同线”口径判通过；若 Lead 口径要求字形与正文同线，需再内缩 13px（或做视觉豁免）。 |
| A-07 | 尺寸规范 | **通过**（附残余注记） | 内联 style：**0**（index/gallery；运行态悬停前 `[style]`=0）✓。components.css 中 px 字面量共 **50** 个：**48** 个为 1px/0；剩余 **2** 个为 **-1px**（tabs active 下划线偏移，属 1px 类）与 **-2px**（`.msg-avatar{margin-top:-2px}` 光学偏移）——即“非 media、非 1px/0 裸 px = 0”的严格表述实测**差 1 处（-2px）**；建议并入 token（如 `calc(var(--size-2) * -1)`）或书面豁免，本项按“尺寸已 token 化 + 内联 0”判通过、不因发丝级光学偏移打回。媒体断点 **6 条全部 em**（56.25/64/73.75/47.5/30em），无 px 条件 ✓。var() 定义 **117**、引用 **112**，未定义引用 **0** ✓；`--content` 定义 0/使用 0（已删除）✓；新增 token（`--chat-width/--msg-width/--gutter-timeline/--avatar-size/--chat-pad-x/--font-*/--size-*/--space-*/--r-*/--border-2`）均已定义且被使用 ✓。视觉等值：chat-tabs 宽 760/672、timeline 44、track gap 2、composer box 692/610、statusbar 24、nav 122×32（选中 56×26）与既有原型一致（token 等值替换）。 |
| A-08 | 组件画廊 | **通过** | 标题「时间轴 Timeline（**20×4 / 纵向 gap 2 / 44px gutter**）」✓；hint 文案含“20×4、纵向 gap 2、44px gutter、悬停/当前宽 24、日期分组、点击/上下键定位”✓。`.timeline--gallery` 实测宽 **44**；其中 `.tl-track` **flex-direction: column**、宽 **24**、**rowGap=2**；bars **20×4**（3 条）+ **active 24×4**（1 条）；相邻条 top 差 **6px**（4+2）✓。Statusbar 样例 **24px**、Tokens/尺寸刻度节保留 ✓；页面无横向溢出、inline 0 ✓。 |

**回归抽查（未破坏已通过项）**：三档 `scrollWidth==innerWidth`（1600/1180/375）；`.insp-body` 默认 **886/886**，三组展开后 **886/1252（>886）且仍可滚**，交付物接在执行会话之后（top **1214.8** = 执行会话 bottom）；顶层 segmented **122×32**、选中 **56×26**；中间白标签区宽 **760/672**、标签下 **12px** + **1px line-soft** 分隔线；状态栏 **24px**、sidebar/main/inspector 同底 **976**。

**证据方法**：headless Chrome 157.0 CDP（1600×1000 / 1180×1000 / 375×812；`getBoundingClientRect`/`getComputedStyle`/`scrollWidth`；`Range` 取 Tab 字形左缘；点击三组统计展开前后高度）+ 静态 CSS 审计（正则扫描 components.css/tokens.css、核对 var 定义/引用与媒体断点）+ 截图 `frontend/review/prototype-{1600,1180,375}.png`（14:06:16–18）与 `gallery-1600.png`（14:05:29）。原型 assets 更新时间：components.css 14:06:15、tokens.css 14:05:41、gallery.html 14:03:59，截图均晚于对应 assets。8899 为复验临时启动的静态服务，复验后已停止；未改 frontend/backend。

### React 版视觉对齐 · 签字复验（2026-11-12，buildId `mwdcdzqq-41bn0`）

**结论：不予签字。必须返工 2 类（P0 共 2 项）；另 2 项需 Lead 书面确认。** 本轮只读复验，未改代码；FE-001 签字仍另需真实交互补测（见文末）。

**复验对象**：`frontend/dist`（`<meta name="build-id" content="mwdcdzqq-41bn0">`，构建 17:25:14；`app.js`/`app.css` 同 buildId）；测试服务 `127.0.0.1:8898`（dev-server → 真实后端 `127.0.0.1:8877`）；对照冻结原型 `127.0.0.1:8899`。DPR2 并排与对齐截图时间 17:25 均晚于构建。

| 项 | 判定 | 证据（原样数值） |
|---|---|---|
| 基础对齐（多数项） | **通过** | 三档 `scrollWidth==innerWidth`：1600/1600、1180/1180、375/375，`outRight=[]`；布局与原型一致：sidebar **240**（1180:228）、topbar **48**、context **42**、statusbar **24** 全宽、chat-content **760**（672）、timeline **44**、inspector **300**（280）/rail **40**、chat-chip **30/12.5/500/1px/8r/#fff**、msg text **14**、时间轴 **31 条 20×4/gap2**（track 中心=timeline 中心=**483.06**）、statusbar border-top 1px。真实数据：31 消息 / 3 会话 / 81.2k / 进度 81%；fresh load console error **0**、4xx **0**；buildId 与证据一致。 |
| **M1 未定义 CSS 变量（P0）** | **不通过（必须返工）** | `components.css` 引用未定义 token：**`--sp-14`**（2 处：`.insp-body`、`.card-block`）、**`--sp-10`**（2 处：`.nav-chip`、`.exec-group`）、**`--sp-6`**（5 处：`.insp-label`/`.exec-head`/`.chat-empty`/`.status`/`.nav-chip` 窄屏）、**`--font-15`**（1 处：`.context h1`；tokens 无 15）。CSS 变量非法值使属性回退初始值，实测：`.insp-body` 横向 padding **0** → 四节内容左缘 **1301**（原型 **1315**；1180: 901 vs 915）；`.card-block` padding **0** → 标题左缘 **495**（卡左 494，仅 1px 边框；原型 padding **14·16**），标题/说明/字段贴边；`.exec-group` margin-top **0**、`.insp-label` margin-bottom **0**、`.exec-head` gap **0**、nav-chip 横向内边距 **0**、`.context h1` 字号声明失效。修复：`--sp-14/--sp-10/--sp-6` → `--space-14/--space-10/--space-6`；`--font-15` 依 DESIGN 用 `--font-14` 或新增 15 token。**复测点**：sections 左缘 1315/915、card 标题左缘 511/343。 |
| **M2 响应式覆盖失效（P0）** | **不通过（必须返工）** | 追加的 React 基态规则（`components.css` 423–439）位于响应式块之后；`.chat-tabs` 桌面 padding 公式（438 行）覆盖 ≤56.25em / ≤47.5em / ≤30em 的 `padding-left:16`（351/362/396 行）→ 375 实测 `.chat-tabs` padding-left **92px**、白色标签左缘 **92**（原型 **16**；内容左缘 46）。修复：把追加基态规则移到响应式块之前，或在文件末尾补回窄屏覆盖；**复测点**：375 chip x=16、仍无横向溢出。 |
| M3 Card 字号/字重与原型差异（P1） | **待 Lead 确认** | React：title **13/600**、label **11**；冻结原型：title **12/700**、label **10**（text 12、control 32、border 1px、radius 10 一致）。若 13/600·11 是组件库新规范（`frontend/review/COMPONENT-LIBRARY.md` 记录），请书面确认接受；否则按原型返工。 |
| M4 右栏新增「会话概览 / 只读」标题（P1） | **待 Lead 确认** | React 右栏顶部有「会话概览 · 只读」head（原型没有，直接从「目标」开始）；请确认是否为设计新增。 |

**其余差异（可接受，按现状记录）**：真实数据仅 3 条 done 任务（计数 3/3；原型演示 12/7/9）；分组空态使用结构化 `EmptyState`（原型单行「暂无」）；上下文动作（重命名/置顶/归档）按用户要求不出现；rail 为字符图标（与原型字符图标一致）；React 画廊独立 `/#gallery`（需整页加载进入，不在主导航）；nav 宽度 **120** vs 原型 **122**（2px 文本度量）。另：`react-gallery-1600.png`（17:23）早于当前 build（17:25），但实时复测画廊正常（44px 栏、20×4/gap2 样例、StatusBar/Tokens/Icon 节齐全）。

**未覆盖 / 前置**：本轮只覆盖视觉对齐；FE-001 签字还需真实双击重命名、卡片提交、断线重连补测（STATUS 已记录）；375 下侧栏/右栏按设计隐藏；深色/256 主题不在本轮。

### React 版视觉对齐 · 返工后复验（2026-11-12，buildId `mwdctn2y-oumh8`，**签字通过**）

**结论：签字通过（视觉对齐）。** 上一轮 2 类 P0 已修复并逐项实测验证；本轮只读复验，未改代码。**FE-001 总体验收签字仍需真实交互补测**（见文末）。

**复验对象**：`frontend/dist`（`<meta name="build-id" content="mwdctn2y-oumh8">`，构建 17:37:24）；测试服务 `127.0.0.1:8898`（→真实后端 `127.0.0.1:8877`）；对照冻结原型 `127.0.0.1:8899`。DPR2 并排/align/card/gallery 截图时间 17:38 均晚于构建。

| 项 | 判定 | 证据（原样数值） |
|---|---|---|
| M1 未定义 CSS 变量（上轮 P0） | **已修复，通过** | 全量扫描 `components.css`：var 引用 **113**、定义 **119**、未定义 **0**。`.insp-body` padding **12/14** → 四节内容左缘 **1315**（1180: **915**；与原型 1315/915 一致），首节为「目标」；`.card-block` padding **14·16**、标题左缘 **511/343**、title **12/700**、label **10**、text 12、control **32**，label bottom 与 control top 间距 4px、`overlap=false`；按钮「取消/确认」（未选项时确认 disabled）；`.exec-group` margin-top **10**、`.insp-label` margin-bottom **6**、`.exec-head` gap **6**；`.context h1` **14/500**（与原型 `--font-14` 一致）。 |
| M2 响应式覆盖失效（上轮 P0） | **已修复，通过** | 375 `.chat-tabs` padding-left **16px**、白标签左缘 **16**（上轮 92）；三档 `scrollWidth==innerWidth`（1600/1180/375）、`outRight=[]`；fresh load console error **0**、4xx **0**。 |
| M3 Card 字号/字重（上轮待确认） | **已对齐，通过** | title **12/700**、label **10** 与冻结原型一致（上轮 13/600、11 已回退）。 |
| M4 右栏标题（上轮待确认） | **已移除，通过** | 右栏不再有「会话概览/只读」head；首节「目标」，四节顺序 目标→输入→执行会话→交付物。 |

**回归保持**：sidebar 240（1180:228）/topbar 48/context 42/statusbar 24 全宽/chat 760（672）/timeline 44/right 300（280）+rail 40；chat-chip **30/12.5/500/1px/8r/#fff**；msg text 14；时间轴 **31 条 20×4/gap2**、track 与 timeline 同中心 **483.06**、current 宽 24；真实数据 31 消息/3 会话/81.2k/81%；画廊当前 build 正常（`hasGallery=true`、timeline 44/column/gap2、bars 20×4 与 24×4），`react-gallery-1600.png` 已更新至当前 build。

**可接受差异（记录在案，不阻塞）**：真实数据仅 3 条 done 任务（3/3；原型演示 12/7/9）；结构化 EmptyState（要求项）；上下文动作按钮按用户要求不出现；rail 为字符图标（原型亦为字符 `☰ ◷ ▤`）；画廊独立 `/#gallery`（需整页加载，不进主导航）；nav 宽 120 vs 原型 122（2px 文本度量）；设置按钮用 SVG 齿轮（原型为 `⚙` 字符，视觉等效）。

**非阻塞清理项**：`frontend/review/COMPONENT-LIBRARY.md` 第 27–28 行仍写旧规格（title 13/600、label 11、确认/重置），与实现及第 55 行（12/700、label 10、取消/确认）不一致，建议下次更新时清理；8787 当前运行版本是否为 `mwdctn2y-oumh8` 未核验（部署由 Lead 决定）。

**未覆盖 / 前置**：FE-001 总体验收签字仍需真实双击重命名、卡片提交、断线重连补测（本轮只做视觉对齐，未触发写操作）；深色/256 主题不在本轮。

### COMP-timeline-tip · 视觉签字复验（2026-11-12，buildId `mwdf52ab-7l0cz`，**不签字：2 项 P0 返工**）

**结论：不签字。** 组件视觉/结构/定位/内容/无障碍属性基本达标，但对照 `specs/COMP-timeline-tip/spec.md` 的 A1–A8 有 **2 项 P0 返工**（垂直居中偏差、画廊登记缺态）；A1/A2/A4 的交互行为需 Timeline 接入后复验。本轮只读，未改代码。

**复验对象**：`frontend/dist`（`<meta name="build-id" content="mwdf52ab-7l0cz">`，构建 18:42:16）；临时 dev-server 8898 服务该 dist（8898/8877 已被测试方关闭，复验时临时启动，完成后停止）；截图 `timeline-tip-{1600,1180,375}.png`（18:42:44–49，晚于构建）。headless Chrome CDP 实测（1600/1180/375 + 320/375×400 边界 + 滚动容器 + 键盘 Tab）。

| # | 场景 | 判定 | 证据（原样数值） |
|---|---|---|---|
| A1 | hover tick | **部分通过（交互待接入后验）** | 视觉达标：白底 `rgb(255,255,255)`、`1px solid rgb(230,228,222)`、radius **8px**、`rgba(22,23,27,.28) 0 18px 40px -20px`（`--shadow-pop`，复用浮层阴影）、宽 **236px**、padding 8/10；tip 与 gallery 锚点均无 `title` 属性。hover 120ms 无法在接入前验证（Timeline 未接；gallery 恒开）→ 列入 R3。 |
| A2 | 键盘 focus | **部分通过（接入后验）** | `role="tooltip"`、唯一 id `timeline-tip`、gallery 锚点 `aria-describedby="timeline-tip"`、无 `title`；键盘 Tab 到锚点后 focus ring `outline 2px solid rgb(61,61,224)` 可见。**Timeline tick 的 focus 立即显示与「仅 visible 挂载 aria-describedby」待接入后验**（R3）。 |
| A3 | 滚动 | **通过** | 在 gallery 的可滚动容器（`MAIN.component-gallery`）滚动 180px：锚点与 tip 同步移动（tip 不消失、保持可见、视口内）；滚动后 tip 与 tick 居中对齐（tip 中心 516.66 vs tick 中心 516.81）。**R1 见下**（首次显示前的居中估算问题）。 |
| A4 | 移出/Esc/blur | **未验证（接入后验）** | 组件有 Esc keydown 监听与受控 `open`，但 gallery `onClose` 为空实现，无 hover/blur 触发；200ms grace、Esc/blur 隐藏、焦点留在 tick 需 Timeline 接入后按 A4 验证（R3）。 |
| A5 | 视口边界 | **通过** | 320 宽：`data-state=edge-clamped`、left **8**、right 244 ≤320；375×400 高：`edge-clamped`、top **298**（=400−93.69−8）、bottom 391.69 ≤392；1600/1180/375 均 `withinViewport=true`；内容不裁切（摘要 2 行 clamp、会话单行省略）。 |
| A6 | 内容 | **通过** | 上栏「你 · 主会话 · 14:20」（meta 12px；会话 `overflow:hidden`+`ellipsis`+`nowrap`；长会话名实测 client 151 / scroll 434、省略生效）；下栏摘要 `line-clamp=2`（clientH 38 < scrollH 75），13px；仅文本、无工具 JSON/内部路径、无按钮/链接。 |
| A7 | 交互/层级 | **通过** | `position:fixed` portal 到 `body`（parentIsBody=true）、`pointer-events:none`、z-index 90、无交互子元素（无 button/a/input）、同一时刻单实例（固定 id，符合「同一时间仅一张」）、fixed 不造成布局跳动。 |
| A8 | 截图/工程 | **部分通过** | DPR2 截图 `timeline-tip-{1600,1180,375}.png` 存在且晚于构建；gallery 有 `TimelineTip 消息预览` 登记、manifest 含 TimelineTip；页面无定制 CSS/内联 style（运行态 `[style]` 仅 tip 动态 left/top 一处）。**但 spec §8 要求的「键盘 focus 态 + focus ring」与「右侧不足 → 左翻 edge-clamped」样例缺失**（R2）；时间轴点击/键盘回归未在真实后端验证（8898 无 API；Timeline 源未改）。 |

**必须返工（P0）**

1. **R1 垂直居中偏差（spec §5：与 tick 垂直居中）**：初次/每次打开 tip 偏下 **8.84px**——tip rect t=658.81 h=93.69 → 中心 **705.66**；tick t=680.81 h=32 → 中心 **696.81**。原因：`update()` 在 tip 尚未挂载时用 fallback `height=76` 估算，实际高 **93.69**，挂载后未重算；滚动/缩放后自动修正（修正后 516.66 vs 516.81）。修法：tip 挂载后重算一次（二次 layout effect / `ResizeObserver` / RAF）。**复验点**：首次 open 与每次 open 的 `|tipCenter−tickCenter| ≤ 1px`，滚动/缩放后仍 ≤1px。
2. **R2 画廊登记不完整（spec §8 / A8）**：缺「键盘 focus 可见态 + focus ring（tick 上）」与「右侧空间不足 → 左翻 `edge-clamped`」两个样例；当前只有 always-open 可见态 + 长摘要（375 截图仍为 visible）。修法：gallery 补两个状态样例（可静态展示但需标注；建议用真实 hover/focus 触发演示），并补 DPR2 截图。**复验点**：gallery 可见 2 个新增样例，截图更新至当前 build。

**接入后必须复验（R3，P1，签字后前置）**：A1 hover 120ms；A2 Tab focus 立即显示 + `aria-describedby` 仅 visible 挂载；A4 移出 200ms grace / Esc / blur / 焦点留在 tick；同时**移除 Timeline tick 的原生 `title`**（当前 Timeline 组件仍保留 title，spec §7 禁止双提示）；A8 时间轴点击/键盘回归。接入 Timeline 后按 A1–A8 全量复验。

**非阻塞观察**：阴影复用 `--shadow-pop`（spec 允许复用 DESIGN 现有浮层阴影，未新增第二套）；固定 id 单实例符合当前 spec；本轮只读未重跑 tsc/build（dist buildId 与证据一致）；`COMPONENT-LIBRARY.md` 第 49 行 buildId 仍是旧值 `mwdd6su7-4tpei`，建议更新。

### COMP-timeline-tip · 返工后复验（2026-11-12，buildId `mwdfk36x-ytota`，**签字通过（附接入前置条件）**）

**结论：组件视觉签字通过。** R1（垂直居中）与 R2（画廊样例）已修复并实测验证；A1/A2/A3/A5/A6/A8 通过，A4/A7 单 tick 行为通过。**接入 Timeline 时必须完成 R3（跨 tick 定时器缺陷）并移除 tick 原生 `title`，接入后按 A1/A2/A4/A8 全量回归**（Lead 已明确此顺序）。本轮只读，未改代码。

**复验对象**：`frontend/dist`（`<meta name="build-id" content="mwdfk36x-ytota">`，构建 18:53:57）；临时 dev-server 8898 服务该 dist（8898/8877 已被关闭，复验时临时启动，完成后停止）；截图 `timeline-tip-{1600,1180,375}.png` + `timeline-tip-edge-1600.png`（18:54:11–16，晚于构建）。headless Chrome CDP 实测（真实 hover / 键盘 Tab / Esc / 滚动 / 320×800 / 375×400）。

| # | 场景 | 判定 | 证据（原样数值） |
|---|---|---|---|
| R1 | 垂直居中（上轮 P0） | **已修复** | 首次打开（未滚动/缩放）：tipCenter **689.95** vs tickCenter **690.11** → **差 -0.16px**（≤1px）；tip 236×93.69；hover 与 focus 首开一致。 |
| R2 | 画廊样例（上轮 P0） | **已修复** | 画廊含 2 个真实样例 tick：键盘 focus 样例（Tab 到 tick 立即显示，`aria-describedby` 挂载、focus ring 可见）与 edge 样例（右侧不足 → 左翻，state=`edge-clamped`，tip 1300–1536、tick 1544–1568）；截图 `timeline-tip-edge-1600.png` 已更新；长摘要两行截断保留。 |
| A1 | hover tick | **通过（组件层）** | 悬停 60ms 无 tip、200ms 出现（120ms 延迟生效）；样式：白底 `rgb(255,255,255)`、1px `rgb(230,228,222)`、radius 8、`--shadow-pop`、宽 **236**、padding 8·10；tip/锚点 `title=null`。 |
| A2 | 键盘 focus | **通过（组件层）** | Tab 到 tick：立即显示；`role=tooltip`、`aria-describedby="timeline-tip"`、无 title；focus ring `outline 2px solid rgb(61,61,224)`、offset 4px（消息称 3px，实测 token 为 `--border-2=2px`；spec 未规定宽度，建议对齐文案/DESIGN）。 |
| A3 | 滚动 | **通过** | gallery 容器滚动 160px：tip 随 tick 同步（tip 643.11→483.11，tick 688.11→528.11），保持可见、视口内、不消失。 |
| A4 | 移出/Esc/blur | **通过（组件层；跨 tick 见 R3）** | 指针移出：120ms 仍显示、300ms 隐藏（200ms grace ✓）；Esc：隐藏且焦点仍在 tick ✓。跨 tick 切换的定时器缺陷见 R3（接入时修复）。 |
| A5 | 视口边界 | **通过** | 1600 edge 样例左翻（tip 1300–1536，tick 1544–1568，8px 间距）；320 宽 hover：`edge-clamped`、left 20 / right 256（视口内）；375×400、tick y≈355：`edge-clamped`、top **298**（=400−93.69−8）、bottom 391.69 ≤392；内容不裁切。 |
| A6 | 内容 | **通过** | 上栏「你/司墨 · 主会话 · 14:20/14:22」；会话 `overflow:hidden`+`ellipsis`、单行；摘要 `line-clamp=2`（clientH 38 < scrollH 75）、13px；仅文本、无工具 JSON/内部路径、无按钮/链接。 |
| A7 | 交互/层级 | **通过（组件层；切换行为接入时修复）** | tip `pointer-events:none`、无交互子元素、portal 到 body、单实例、fixed 不跳布局 ✓；切换 tick 时旧 grace 定时器会隐藏新 tip（R3），接入时按下方要求修复并回归。 |
| A8 | 截图/工程 | **通过（组件层）** | DPR2 截图 4 张（1600/1180/375 + edge-1600）晚于构建；gallery 登记 TimelineTip、manifest 含 TimelineTip；页面无定制 CSS/内联 style（运行态 `[style]` 仅 tip 动态 left/top）；三档 `scrollWidth==innerWidth`；console 0、4xx 0。时间轴点击/键盘回归待接入后验。 |

**接入前置（R3，接入时必须修）**：**跨 tick 定时器缺陷**——gallery 示例在 `onFocus`/`onMouseEnter` 时未清除上一 tick 的 `closeTimer`（200ms grace），导致切换到新 tick 后 tip 被旧定时器关闭（A→B：B tip 显示约 120ms 后在 ~200ms 被隐藏，而 A/B 分别为 hovered/focused）。修法：`onFocus`/`onMouseEnter` 清除 `closeTimer`（并清 `showTimer`），或改为单一状态机/定时器所有权；同时建议修 gallery 示例本身，避免 Timeline 接入复制。**复验点**：A→B 切换后 tip 保持并更新内容 ≥500ms 不消失；键盘 focus 与指针 hover 两条路径都过。另：接入时**移除 Timeline tick 的原生 `title`**（当前 Timeline 组件仍保留，spec §7 禁止双提示），并补 A1 hover 120ms、A2 `aria-describedby` 仅 visible 挂载、A4 200ms grace/Esc/blur/焦点留 tick、A8 点击/键盘回归的实机复验。

**非阻塞观察**：focus ring 实测 2px（`--border-2`），与提交说明“3px”不符（spec 未规定宽度，建议统一文案/DESIGN）；阴影复用 `--shadow-pop`（允许）；固定 id 单实例符合当前 spec；本轮只读未重跑 tsc/build（buildId 与证据一致）；`COMPONENT-LIBRARY.md` 中 buildId 旧值建议更新。

### COMP-timeline-tip · Timeline 接入后实机验收（2026-11-12，buildId `mwdfw9t5-lh5d1`，**签字通过**）

**结论：签字通过。** Timeline 已接入 TimelineTip，R3（跨 tick 定时器）修复、tick 原生 `title` 已移除；A1/A2/A3/A4/A5/A6/A7/A8 在 app 实机（真实数据）逐项通过。本轮只读，未改代码。

**复验对象**：`frontend/dist`（`<meta name="build-id" content="mwdfw9t5-lh5d1">`，构建 19:03:25）；8898/8877 已关闭，验收时临时起静态服务（8898，新 dist）+ `/api` 只读代理到 8787（真实数据 36 条消息），仅 GET/WS、未发消息、未触发写操作，完成后停止；8787 未被重启。headless Chrome CDP 实测 1600/1180/375。

| # | 场景 | 判定 | 证据（原样数值） |
|---|---|---|---|
| A1 | hover | **通过** | 36 个 tick；60ms 无 tip、200ms 出现（120ms 延迟）；tip 236×93.69，白底/1px/圆角8/轻阴影；tip 与所有 tick `title` 计数 **0**。 |
| A2 | 键盘 focus | **通过** | Tab 到 tick：立即显示；`role=tooltip`、当前 tick `aria-describedby="timeline-tip"`（仅 1 个 tick 挂载）；focus ring `outline 2px solid accent`、offset 2px；无 title。 |
| A3 | 滚动 | **通过** | 消息区滚动 160px（561→721）：timeline 为固定 gutter、锚点不动，tip 保持可见且在视口内（不消失、不跳位）。 |
| A4 | 移出/Esc/blur | **通过** | 移出：100ms 仍显示、320ms 关闭（200ms grace）；Esc：tip 关闭、焦点仍留在 tick（activeIndex 2）、aria 清零；blur/离开 timeline：关闭、aria 清零。 |
| R3 | 跨 tick 切换 | **已修复** | 键盘 A→B：500ms 后仍 open、activeIndex=1 且仅 B 有 aria；指针 A→B：570ms 后仍 open、tip 计数 1、不叠加。 |
| 点击 | tick 跳转 | **通过** | 点击第 5 条 tick：tip open、tick 保持 focus、aria 挂载；`onJump` 生效（chatScrollTop 0→526）。 |
| A5 | 视口边界 | **通过** | 1600/1180/375 `scrollWidth==innerWidth`；1180 打开 tip：state=visible、centerDiff **-0.078**、within=true；375 为移动端隐藏 timeline（设计既有），tip 不适用；居中切换实测 -0.156（与提交 0.15625 一致）。 |
| A6 | 内容 | **通过** | 上栏「司墨/你 · 主会话 · 22:45」；摘要真实消息文本；两行 clamp 保持；无工具 JSON/内部路径。 |
| A7 | 交互/层级 | **通过** | tip 单实例、pointer-events:none、portal body、无布局跳动；点击/悬停不叠加；切换 tick 正常更新。 |
| A8 | 截图/工程 | **通过（A8 视觉证据已补齐）** | dist buildId 与提交一致；DPR2 app 截图 6 张（hover/focus/switch/scroll/focus-1180/375，时间 19:11:49–19:12:09，晚于构建，均为 app 聊天页且互不相同，focus 与 scroll 不再重复）+ gallery `timeline-tip-edge-1600.png`（edge-clamped 组件样例）；console error **0**、4xx **0**、三档无横向溢出。 |

**结论依据补充**：R3 修复点核对——Timeline 统一持有 show/close timer，`onFocus`/`onMouseEnter` 均 `clearShow()+clearClose()`，切换不继承旧 grace；Esc 关闭但焦点保留；`aria-describedby` 仅在 `tipOpen && tipIndex===index` 时挂载。这三条与实机结果一致。

**已知边界/后续**：本轮为测试 build 签字，未部署；8787 仍运行旧构建，部署后需对 8787 做一次 TimelineTip 线上 smoke（hover/focus/切换/滚动）。A8 截图已于 19:11 按 build `mwdfw9t5-lh5d1` 用 app 实机重拍（hover/focus/switch/scroll/focus-1180/375，均为 app 且互异；375 按既有设计隐藏 timeline）。tsc/build 未在只读验收中重跑（dist buildId 与证据一致）。

### COMP-timeline-tip · 8787 线上 smoke（2026-11-12，buildId `mwdfw9t5-lh5d1`，**通过：线上闭环**）

**结论：线上闭环。** 8787 已部署该 build；首页 build-id/health 正常；TimelineTip 在线上 app 聊天页的 hover / focus / A→B 切换 / 滚动 / Esc smoke 全部通过。仅只读交互（未发送消息、未触发写操作）。

**证据**（headless Chrome 直连 `http://127.0.0.1:8787`，1600×1000）：

| 项 | 结果 | 证据 |
|---|---|---|
| 部署 | 通过 | `GET /` 200，`<meta name="build-id" content="mwdfw9t5-lh5d1">`；`GET /api/health` 200 `{"ok":true,"ready":true,...}` |
| 结构 | 通过 | 36 ticks；`.timeline .tl-bar[title]` = **0**；tip/tick 无 title；`scrollWidth==innerWidth` |
| hover 第 4 tick | 通过 | tip `role=tooltip`、state visible、**236×74.84**、文本「你·主会话·22:44 / 怎么重复生成句子？」、within、tipCount 1；该 tick `aria-describedby=timeline-tip` |
| focus | 通过 | Tab 到 tick 立即显示；activeIndex 0、仅当前 tick aria；centerDiff **-0.078**、focus ring 2px |
| 切换 A→B | 通过 | Tab 到下一 tick 后 500ms 仍 open、activeIndex 1、仅 1 个 tick 带 aria、centerDiff **-0.156**（R3 线上保持） |
| Esc | 通过 | tipCount 0、焦点仍在 tick（activeIndex 1）、aria 0 |
| 滚动 | 通过 | `.chat-scroll` 3710→3550（向上 160；初始已在底部 max=3710），tip 保持 open、tipTop 367.06 不变（固定 gutter 锚点）、within、单实例 |
| 视口 | 通过 | 1180/375 `scrollWidth==innerWidth`（375 按设计隐藏 timeline） |
| 控制台 | 通过 | console error **0**、4xx **0** |

**遗留**：无 TimelineTip 阻塞项。后续 FE-001 总签字仍待真实双击重命名/卡片提交/断线重连补测（与本组件无关）。

### FE-002/003/004/005 批次预检（2026-11-12，buildId `mwdgirii-fqmgz`，**不签字：未齐项 + 3 项 P0/3 项 P1**）

**结论：不签字（预检）。** 用户已明确仍有未闭环项；本轮复验已完成部分，发现 **3 项 P0**（重复请求循环、ConversationPanel 滚动归属错误、前端交付物文件名硬过滤）与 **3 项 P1**（错误态假 0、归档只读不完整、工作台交付物数据源错误）。只读，未改代码、未发消息、未写数据。

**复验方式**：`frontend/dist`（buildId `mwdgirii-fqmgz`，构建 19:20:55）；临时 8898 静态服务 + `/api` 只读代理到 8787；CDP 实测（1600/1180/375、Fetch 注入失败、网络请求计数）。截图 `fe-final-{1600,1180,375}.png` 19:21 晚于构建；`fe-error-state-1600.png` 与 `fe-batch-*.png` 为 19:17（早于当前 build）→ 证据需按当前 build 重拍。

**已完成部分通过项**

| 项 | 证据 |
|---|---|
| ConversationPanel 几何/样式 | 1600 x256 w1028 h**656.13**；1180 x244 w640；375 x8 w359；白底/1px/radius **12**（375 radius **8**）/无阴影；timeline 与滚动区在 panel 内、Composer 外置、消息透明；三档无横向溢出；画廊已登记并同源。 |
| SessionSpec 单投影 | 页面仅发出 5 个 API 请求（sessions/tree、permissions、stats、messages、**spec-projection**），无单独 tasks/artifacts/overview；右栏显示「已完成 rev 25 待确认 3」+ goal/inputs/tasks/deliverables。 |
| 搜索 | F-07 → 1 个会话；无结果 → 「没有匹配的会话」（sessions 稳定后）。 |
| 工作台 | 98.3k / 3 会话 / 36 消息 / 5 任务；最近活动点击进入「工程师」会话；交付物空态为 `overview-empty`「暂无交付物」；无横向溢出。 |
| 错误态 | Fetch 注入失败：3 个 `.state-block`（会话/消息/右栏）+ 3 个重试；工作台 1 个「工作台加载失败」+ 重试；无横向溢出。 |

**必须返工（P0）**

1. **P0-1 无限重载循环**：5s 内 **834** 次 API 请求（`/api/sessions/tree`、`/api/permissions`、`/api/stats` 各约 2.8 次/s，总数 1374）；侧栏「会话」计数在 **「—」/「3」间闪烁**（`fe-final-1600.png` 自身即显示「会话 —」而列表有 3 行）。根因：`useEffect(..., [loadSessions, applyStats])` + `loadSessions` 的 `useCallback` 依赖 `[activeId, flatSessions]`，每次 `setSessions` 更新 `flatSessions` → 重新创建 `loadSessions` → effect 重跑。必须修复为稳定依赖（refs/单次初始化/移除 `flatSessions` 依赖）。
2. **P0-2 ConversationPanel 滚动归属错误**：真实滚动容器是 `.conversation-scroll`（client 654 / scrollHeight 4328 / scrollTop 0），但 app 的 `scrollerRef`、`onScroll`、`scrollToBottom` 仍绑定在内层 `.chat-scroll`（被撑到 **4328px**、自身不可滚动）→ 打开会话停在顶部（outer=0，不自动到底）；对 inner 设 `scrollTop=scrollHeight` 无效；任务定位仅把 outer 滚到 **471**（声明「chat-scroll 3710→872」在当前 build 不成立）；outer 滚到顶/底时 timeline 当前刻度不变（syncTimeline 未触发，activeIndex 恒 3）。需把唯一滚动区交给 `.conversation-scroll`（传 ref/onScroll）或移除内层 `.chat-scroll`。
3. **P0-3 交付物前端文件名硬过滤**：`app.tsx:332` 与 `library.tsx:521` 均以 `/report-attempt|checkpoint|\.log$|internal/i` 过滤；**违反 FE-003 约束「交付物分类在后端/契约层做，不在前端用文件名硬过滤」**，且两处重复、把含 `internal` 的用户文件也误伤，并导致 R7「打开/预览」无法验证。分类必须下沉到后端/契约层（前端只渲染 `kind/visibility` 之类字段）。

**必须修复（P1）**

4. **P1-1 错误态假 0**：Fetch 失败时会话侧栏显示「会话 **0**」（应为「—」）；工作台错误时指标显示 `["—", "0", "—"]`（会话 0）且卡片说明仍是「统计加载中…」与错误态并存 → 违反 FE-002 R4「不静默显示 0」/FE-005 R1「加载/错误/0 区分」。
5. **P1-2 归档只读不完整**：仅 `Composer disabled={archived}`；`CardBlock` 的 `disabled` 只看 `busy || card.status !== 'active'`，`handleCardAction` 无 `archived` 判断 → 归档会话中的卡片仍可提交（FE-003 R2「归档会话只读」）。需在卡片提交入口按 `activeSession.archived` 拒绝并复测。
6. **P1-3 工作台交付物数据源错误**：`visibleWorkbenchArtifacts` 取自当前选中会话的 `projection.deliverables`（`app.tsx:332`），不是工作台/用户级数据；直接打开工作台或切换会话会为空/陈旧，且无独立加载/错误态（FE-005 R4）。应使用独立用户交付物数据源并区分三态。

**P2 / 证据问题**：错误描述直接暴露英文「Failed to fetch」；`fe-error-state-1600.png` 与 `fe-batch-*.png` 早于当前 build（19:17 vs 19:20:55），仅 `fe-final-*` 为当前 build；工作台「最近活动」按 `createdAt` 排序而非最后活动时间。

**未闭环（用户已列，不重复计）：卡片服务端幂等（仅 UI 二次禁用）、真实用户交付物打开/预览（userDelivery=0）、空库工作台真实 0 空态、FE-002 A5 完整回归。**

### FE-002..005 P0/P1 返工预检（2026-11-12，dist buildId `mwdgx15f-h7dql`，**不签字：P1 仍有残留 + 构建漂移**）

**结论：不签字。** P0-1/P0-2/P0-3 已修复；P1-4 部分（工作台错误态仍出现「统计加载中…」）、P1-5 部分（归档卡片确认/字段未禁用）；P1-6 与卡片幂等/409/空库/真实交付物/FE-002 A5 仍未闭环。**注意构建漂移**：请求复验的是 `mwdgukie-6x8gi`（19:30:05），复验时 dist 已更新为 `mwdgx15f-h7dql`（19:32:00）；`p0-fix-*.png`（19:30）对应的是 mwdgukie，不含当前 build 证据 → 签字前需冻结 build 并重拍截图。

**复验方式**：临时 8898 静态服务（当前 dist）+ `/api` 只读代理到 8787；CDP 正常/滚动/错误注入/归档 mock；未发消息、未写数据。

| 项 | 判定 | 证据 |
|---|---|---|
| P0-1 重载循环 | **已修复** | 5s 内 **0** 请求；页面总 API **6**；侧栏连续 5 次采样均「会话 3」，无「—/3」闪烁 |
| P0-2 滚动 | **已修复（1600）** | 仅 1 个 `.conversation-scroll`（client 654 / scrollH 4330 / top **3676 = max** = 底部），`.chat-scroll` 数量 **0**；outer 滚到顶/底 timeline 当前刻度 33→**0**/33（sync 生效）；任务行点击时目标已在视口，outer 保持 3676（无回退）。面板 1600 1028×656.1、1180 640、375 359；radius 12/8；Composer 外置；无横向溢出 |
| P0-3 文件名硬过滤 | **已修复** | `app.tsx`/`library.tsx` 已无 `report-attempt/checkpoint/internal` 过滤；仅 gallery 样例名保留 |
| P1-4 错误态 | **部分通过** | 3 个 state-block + 3 重试；侧栏「会话—」；工作台 metrics **["—","—","—"]**；文案已本地化「网络请求失败，请检查连接后重试」；**但工作台错误态仍渲染「统计加载中…」**（notes 含该文案、`hasLoadingText=true`），与「不再同时统计加载中」不符 |
| P1-5 归档只读 | **部分通过** | 归档 mock：badge「已归档 · 只读」、Composer 发送禁用、卡片「取消」禁用；**但多条卡片「确认」仍 `disabled=false`，select/input 均未禁用**（`CardBlock` 的 `disabled = busy || status!=='active'` 未含 `readOnly`；`handleCardAction` 有 archived 拦截，故真正写入被拦，但 UI 未只读） |
| ConversationPanel | **通过** | 与声明一致（1600 x256 w1028 h656.1；1180 x244 w640；375 x8 w359；radius 12/8、border 1、shadow none；无溢出） |
| 交付物 preview/downloadUrl | 源码已出现分支 | 当前 build `openArtifact` 已用 `previewUrl/downloadUrl`；但 `userDelivery=0`，无真实交付物可验，仍列未闭环 |

**仍阻塞签字**
1. P1-4 残留：工作台错误态不应再出现「统计加载中…」（应统一为错误文案）。
2. P1-5 残留：`CardBlock` 需把 `readOnly` 纳入 `disabled`，并禁用字段（select/input/textarea）与确认按钮；当前仅「取消」禁用。
3. P1-6 未闭环（你已列）：工作台交付物仍取当前会话 `projection`，非用户级数据源 + 独立三态。
4. 未闭环：卡片服务端幂等/409、真实用户交付物打开、空库工作台、FE-002 A5。
5. 构建漂移：请求 build `mwdgukie` 已不是 dist 当前构建；请冻结 `mwdgx15f`（或后续最终 build）并重拍 `p0-fix-*`/error/batch 截图后再签字。
6. 次要：1180/375 resize 后 `.conversation-scroll` 保留 px 位置（top 3676 < max 3899/4855）且 active 刻度暂留 3，滚动后才更新；非阻塞但建议在 resize 后 sync。

### message-cards 定稿基线 · 视觉签字（2026-11-12，buildId `mwdk1oal-pjkx0`，**签字通过**）

**结论：签字通过（仅本轮 message-cards 视觉基线）。** 中栏 paper、白卡消息、卡列/中栏中心、chip 左缘、Composer 对齐、Timeline 绝对 gutter 四档均与声明一致；四档无横向溢出，console 0。**FE-002–005 功能未闭环（幂等/空库工作台/真实交付物/A5 等）不在本签字范围，仍不签整批。** 未部署。

**对象**：`frontend/dist`（buildId `mwdk1oal-pjkx0`，构建 20:59:36）；临时 8898 静态服务（dist）+ `/api` 只读代理到 8787；CDP 独立实测 1600/1920/1180/375。截图 `message-cards-react-{1600,1920,1180,375}.png`（20:59:39–47，晚于构建，DPR2）。

| 宽度 | 卡列中心 vs 中栏中心 | 卡 x / w | chip 左 = 卡左 | Composer vs 卡（dx/dw/dr） | Timeline | 溢出 |
|---|---|---|---|---|---|---|
| 1600 | 770 / 770，**0** | x430 / w680 | 430 = 430 | 0 / 0 / 0（x430 w680 right1110） | display flex，l358 w44 | 无 |
| 1920 | 930 / 930，**0** | x590 / w680 | 590 = 590 | 0 / 0 / 0（x590 w680 right1270） | display flex，l518 w44 | 无 |
| 1180 | 564 / 564，**0** | x264 / w600 | 264 = 264 | 0 / 0 / 0（x264 w600 right864） | display none | 无 |
| 375 | 187.5 / 187.5，**0** | x8 / w359 | 8 = 8 | 0 / 0 / 0（x8 w359 right367） | display none | 无 |

- **中栏 paper**：`.chat-body` 实测 `rgb(239, 237, 232)` = `#EFEDE8`。
- **消息白卡**：bg `rgb(255,255,255)`、`1px solid rgb(230,228,222)`、radius **10**、padding **12px 14px**、margin-bottom **9px**、shadow **none**；36 条消息、6 张卡片。
- **Timeline 绝对 gutter**：1600/1920 显示（绝对定位在卡列左侧），1180/375 `display:none`，卡列中心不受显隐影响。
- **功能保留 spot check**：`.conversation-scroll` 1 个、`.chat-scroll` 0；TimelineTip hover/focus 正常（`role=tooltip`、aria 挂载）；右栏 SessionSpec「已完成 rev25 待确认3」；卡片 6、搜索框与归档菜单存在。console error **0**、4xx **0**。

**范围说明**：本签字只覆盖 message-cards 定稿视觉基线；FE-002–005 的功能项见下方「FE-002–005 独立功能验收」（2026-11-12，build `mwdk1oal-pjkx0`）：卡片提交+幂等/重命名/断线/空库通过，工作台交付物空/错误态通过（loading 未捕获），交付物打开未验证（无样本）、409 未造出；整批签字与部署待 Lead 决定，当前未部署。

### FE-002–005 独立功能验收（2026-11-12，冻结 build `mwdk1oal-pjkx0`，**逐项结论**）

**方法**：隔离实例——复制 8787 现库快照到 `.tmp-fa-homeA`（36 消息/6 卡）启动 `simo-live.exe serve -addr 127.0.0.1:8890 -model mock`（真实后端、mock 模型）；空库 `.tmp-fa-homeB` 启动 8891；静态服务 8898/8897 分别代理两实例；headless Chrome 9345。**未触碰 8787、未改代码、未部署**；测试后实例/临时目录已清理，8787 会话标题仍为「主会话/研究员/工程师」。

| # | 项目 | 结论 | 证据 |
|---|---|---|---|
| 1 | 卡片提交 + 连续幂等 | **通过（409 未造出）** | 隔离副本上用 PATCH 将 `card-6087391f09af9c2d` 置 active 作测试准备。UI 选 B→确认：卡片 `active·v2 → submitted·v2`，确认按钮 disabled；消息 36→**38**（user 15→16、agent 21→22），tasks **5→5**（无新任务）。UI 二次点击被 disabled 拦截。HTTP 重放同 URL/body：**202 / idempotent=true**、同一 messageId `msg-b6d2a654d3270f62`；并发两次同请求均 **202 idempotent=true**、同 messageId；两次重放后消息数仍 38/16/22、tasks 5。**409 未造出**：并发请求均命中已完成回执（in-progress 窗口太短）。 |
| 2 | 真实重命名 | **通过** | 双击「研究员」→输入「验收重命名-0812」→Enter；`/api/sessions/tree` 与刷新后 DOM 均为「验收重命名-0812」，持久化 ✓。 |
| 3 | 断线重连 | **通过** | 已连接（38 msgs）→停 8890：2s/5s 状态「重连中」、代理返回 502、页面保留 38 msgs →重启同 home：恢复「已连接」；`/api/messages` count **38 / unique 38**，无重复。 |
| 4 | 空库工作台 | **通过（loading 未捕获）** | 空 homeB：main 自动创建、0 消息；工作台 metrics `Token 0 / 会话 1 / 权限 workspace-write`，消息 0·任务 0、每日图表 EmptyState、最近活动 1（main）、交付物 EmptyState；停后端后：metrics 全「—」、notes「统计不可用」、工作台+交付物 ErrorState+重试、无图表、无假 0。LoadingState 因本地响应过快未单独捕获（源码存在）。 |
| 5 | 工作台用户级交付物 | **部分通过** | `/api/deliverables` 返回 `{"deliverables":[],"total":0}`；工作台交付物 EmptyState 与错误态 ErrorState 均实测通过；**loading 态未单独捕获**（同上），无真实用户样本可测列表/打开。 |
| 6 | 交付物打开（preview/download） | **未验证** | 两个隔离实例 `/api/deliverables` total 均为 **0**，无用户交付物样本，未触发 preview/download；按约定标注未验证（不伪造样本）。 |

**其他观察**：当前 build 源码中 `CardBlock` 已把 `readOnly` 纳入 disabled 并禁用字段；工作台错误态 notes 已改为「统计不可用」（上一轮 P1-4/P1-5 残留在此 build 看来已修复，未单独回归归档态）。**未签整批**：本报告仅覆盖上述 6 项功能验收；FE-002–005 的整批签字与部署仍由 Lead 决定。

### 用户反馈三处修复 · 视觉签字（2026-11-12，build `mwdmbz6k-vd4lp`，**签字通过**）

**结论：视觉签字通过。** 右栏状态间距、Composer/卡同宽（滚动条修复）、Timeline 1280/1180 显示三处均与声明一致；四档无横向溢出、console 0。**仅签本轮反馈修复，未部署；FE-002–005 其余功能范围不变。**

**对象**：`frontend/dist`（buildId `mwdmbz6k-vd4lp`，构建 22:03:36）；临时 8898 静态服务（dist）+ `/api` 只读代理 8787；CDP 实测 1600/1280/1180/375。截图 `fe-feedback-{1600,1280,1180,375}.png`（22:03:52–04:00，晚于构建，DPR2）。

| 项 | 判定 | 证据 |
|---|---|---|
| 1. 右栏状态间距 | **通过** | `.insp-spec-status` gap **8px**、b margin-right **8px**、em padding-left **8px**、em margin-left auto（无负 margin）。B/SPAN/EM x：1600 **1315 / 1360.84 / 1500.14**（目标 1315/1361/1500，亚像素差 ≤0.16）；1280 **995 / 1040.84 / 1180.14**；1180 **915 / 960.84 / 1080.14**。 |
| 2. Composer / 卡同宽（滚动条） | **通过** | `.conversation-scroll` `scrollbarWidth=none`，offsetW==clientW（1600 720、1280 708、1180 640、375 359）→ 无滚动条占宽。卡/Composer x·w·right：1600 **430/680/1110**（右留 490）、1280 **276/668/944**（336）、1180 **264/600/864**（316）、375 **8/359/367**（8）；四档 **dx/dw/dr = 0/0/0**。 |
| 3. Timeline 1280/1180 | **通过** | 1600 display flex x358 w44；1280 flex x204 w44；1180 flex x192 w44；375 display none。卡列中心不变（770/610/564/187.5，delta 0）；1180 卡与 Composer 仍 600；四档无横向溢出。 |

**控制台**：console error **0**、4xx **0**。范围说明：只覆盖本轮三处反馈修复；FE-002–005 其余未闭环项按原记录，未部署。

### 1280/1180 时间轴可见性修复 · 视觉签字（2026-11-12，build `mwdmisy7-z4cbf`，**签字通过**）

**结论：视觉签字通过。** 1280/1180 已为 timeline 预留 52px gutter，卡列/Composer 同步收窄且仍居中；timeline 在真实布局中可见、可命中、不越过 sidebar、不被裁切，与卡列间距 **8px**。1600 保持卡 680/Composer 680；四档无横向溢出、console 0。**未部署；FE 其余范围不变。**

**对象**：`frontend/dist`（buildId `mwdmisy7-z4cbf`，构建 22:08:54）；临时 8898 静态服务 + `/api` 只读代理 8787；CDP 1600/1280/1180/375。截图 `fe-tlfix-{1600,1280,1180,375}.png`（22:08:58–09:05，晚于构建，DPR2）。

| 宽度 | Timeline（x / w / right） | 卡（x / w） | gap | bars（visible/total） | insideCol / 命中 | 卡列中心 | Composer vs 卡 | 溢出 |
|---|---|---|---|---|---|---|---|---|
| 1600 | 378 / 44 / 422 | 430 / 680 | **8** | 30/30 | true / `.tl-bar` inTimeline | 770 / 770 | dx/dw/dr 0 | 无 |
| 1280 | 260 / 44 / 304 | 312 / 596 | **8** | 30/30 | true / `.tl-bar` inTimeline | 610 / 610 | 0/0/0 | 无 |
| 1180 | 248 / 44 / 292 | 300 / 528 | **8** | 30/30 | true / `.tl-bar` inTimeline | 564 / 564 | 0/0/0 | 无 |
| 375 | display:none | 8 / 359 | — | 0/30（DOM 存在不渲染） | — | 187.5 / 187.5 | 0/0/0 | 无 |

- **不越 sidebar**：timeline x 260（1280）> sidebar right 240；x 248（1180）> 228；x 378（1600）> 240；`withinBody=true`（1280/1180/1600），`elementFromPoint` 命中 timeline 内 `.tl-bar`，非裁切不可见。
- **卡列/Composer 同步收窄**：1600 680、1280 **596**、1180 **528**、375 359；四档卡列中心差 **0**。
- 控制台：console error **0**、4xx **0**。范围：仅本轮 1280/1180 timeline 可见性修复；当前未部署（8787 仍 `mwdfw9t5`）。

### TimelineGroups 组件视觉签字（2026-11-12，build `mwdmpfa5-low53`，**不签字：2 项返工 + 1 项未验证**）

**结论：不签字。** 组件主体（分组/active/祖先透明度/Tooltip/键盘/画廊登记）基本达标，但 ① 会话组实际间距 **8px**（声明 6px）；② 分类被写进 tick 的 `aria-label`，不符合「分类只写入 Tooltip 文本」；③ gallery 样例 `onJump` 为 noop，Enter/点击跳转无法验证。**未接首页、未部署。**

**对象**：`frontend/dist`（buildId `mwdmpfa5-low53`，构建 22:14:03）；静态 8898 服务 `/#gallery`；CDP 1600 实测。截图 `timeline-groups-{1600,1920,1180,375}.png`（22:14:24–31，晚于构建，DPR2）。

| 项 | 判定 | 证据 |
|---|---|---|
| 组件/分组/画廊 | 通过 | 两个样例（单会话 3 bars；当前+上级 5 bars/2 组）；排序按 sessionOrder/dateKey/at；rail 44×… 无文字；manifest TimelineGroups dependsOn TimelineTip；App 仍用旧 Timeline。 |
| bars | 通过 | active 24×4 `rgb(22,23,27)`、普通 20×4、bar gap 2；user `rgb(61,61,224)` opacity .78、agent `rgb(104,107,115)` opacity .55（复用旧色，无新增色）。 |
| 祖先组 | 通过 | `.tlg-session.is-ancestor-session` computed opacity **0.55**；当前组 1；`is-ancestor-session .tl-bar.is-current` 有 opacity:1 覆盖（见 R3）。 |
| Tooltip | 通过（除分类） | hover 60ms 无、220ms 出现；role=tooltip、无原生 title、分类「进度汇报」在 Tooltip meta；TimelineTip 复用。移出 100ms 开/320ms 关（200ms grace）；focus 立即；Esc 关闭。 |
| 键盘 | 部分验证 | focus 后 ArrowRight/End/Home 正确移动（End→index 2、Home→0）；Esc 关闭且焦点保留；**Enter/click 的 onJump 因样例 noop 未验证**。 |

**必须返工**
1. **R1 会话组间距 8px ≠ 声明 6px**：CSS `.tlg-track` gap 2 + `.tlg-session + .tlg-session` margin-top 6 → 实测相邻组 first bottom 1244.33 → next top 1252.33 = **8.00px**。若目标为组间距 6，应调整（如 margin-top 4 或取消 track gap 对 session 的作用）。
2. **R2 分类泄漏到 aria-label**：tick 的 `aria-label` 为「司墨 · 主会话 · 08:00 · 进度汇报」「… · result」「… · 需求澄清」，而要求是「分类只写入 Tooltip 文本」。应从 aria-label 移除分类，仅保留在 Tooltip。
3. **R3 未验证/边界**：gallery 两样例 `onJump={() => undefined}`，Enter/点击跳转无法观察；且 CSS `.is-ancestor-session .tl-bar.is-current { opacity:1 }` 会让「祖先组中的 active bar」突破祖先组 .55——若 active 可能在祖先组，需明确这是否预期，并补样例/测试。

**范围**：仅组件层预检；未接首页、未部署。组件修复上述 R1/R2（并补 R3 验证）后可复验。

### TimelineGroups 返工后复验（2026-11-12，build `mwdmvfow-9d8pn`，**签字通过**）

**结论：签字通过。** R1 组间距、R2 分类 aria、R3 跳转/active 三项均修复并实测；组件可进入下一步（接首页由 Lead 决定，本轮不接、不部署）。截图 `timeline-groups-{1600,1920,1180,375}.png`（22:19:00–07，晚于构建，DPR2）。

**对象**：`frontend/dist`（buildId `mwdmvfow-9d8pn`，构建 22:18:43）；静态 8898 服务 `/#gallery`；CDP 1600。

| 项 | 判定 | 证据 |
|---|---|---|
| R1 组间距 | **已修复** | `.tlg-track gap 0` + `.tlg-session + .tlg-session margin-top 6`；相邻组 first bottom→next top 实测 **6px**（trackGap 计算值 0px，margin-top 6px）。 |
| R2 分类 aria | **已修复** | 8 个 tick `aria-label` 均为「你/司墨 · 会话 · 时间」，**不含分类**；`title` 计数 **0**；分类「进度汇报」仅在 Tooltip meta 显示；Tooltip `role=tooltip`、无原生 title。 |
| R3 跳转/active | **已修复** | 单会话点击 g2：onJump 文本 `g2`、`aria-current` 移到 g2、宽 24；多会话点击 p1：onJump `p1`、祖先组 opacity **.55** 下 active bar 按 Lead 确认规则 `opacity:1`、宽 **24**、仅 1 个 aria-current；键盘 focus g3 + Enter：onJump **g3**（可信 CDP 事件）。 |
| 其余组件项 | 通过 | rail 44 无文字；active 24×4 ink、普通 20×4、bar gap2；当前组 1 / 祖先 .55；两个画廊样例（3 bars / 5 bars 2 组）；manifest `TimelineGroups` dependsOn `TimelineTip`；App 仍用旧 Timeline；console 0。 |

**说明**：祖先组 active 的 `opacity:1` 覆盖已按 Lead 确认实现，spec 由 design-scribe 后续写入；hover120/grace200/Esc 等沿用上一轮验证（本轮仅改 CSS gap/aria/画廊回调）。范围组件层；未接首页、未部署。

### FE-007 祖先消息 · 独立验收预检（2026-11-12，**spec ready / 未实现，不签字**）

**状态**：`specs/FE-007-ancestor-messages/spec.md` 已读。当前**后端全量接口已可用**，**前端尚未实现**祖先按钮/祖先链/prepend/TimelineGroups 接入（App 仍用旧 Timeline）。本轮只准备 A1–A10 验收步骤与证据模板，**不签通过**；待前端交付固定 build 后按此复验。

**线上接口实测（只读，2026-11-12）**
- 会话树：root `main`（主会话，parentId 空）→ child `sess-fixture-researcher`（研究员，parentId main）；当前无三级链，A3 需隔离夹具补 3 级。
- `GET /api/sessions/main/messages?scope=all` → 200，`total/messages=30`，`pagination:false`，`scope:"all"`，`archived:false`；`GET /api/sessions/sess-fixture-researcher/messages?scope=all` → 200，**12** 条；均时间正序（后端 `all_messages.go`）。
- `GET /api/sessions/nope/messages?scope=all` → **404** `session_not_found`；`scope=bad` → **400** `invalid_scope`。
- 源码 `maxAllSessionMessages=50000`：超过 → **413** `messages_too_many`；归档会话 `archived:true` 仍可读（只读）。
- 前端 `api.ts` 尚无该调用；`app.tsx` 无祖先按钮/链状态；TimelineGroups 组件已签但未接首页。

**前置夹具（交付前准备，隔离实例；不碰 8787 生产库）**
1. 固定 buildId；隔离复制库，创建 root→A→B（≥3 级，B 为当前），各级消息数足够触发滚动；另备 empty-parent（0 条）、archived-parent、重复 id、同一 parent 多请求；413 需造 >50000 条或 HTTP mock。
2. 会话切换目标（树/时间轴/搜索各一条）；记录切换前祖先链；每个用例前恢复默认态。
3. 浏览器 1600/1180/375；Network 记录 `/messages` 请求；Console/4xx 记录；截图 DPR2。

**A1–A10 验收步骤 / 证据模板（结论待验）**

| # | 场景 | 操作步骤 | 观测与阈值 | 证据字段 | 结论 |
|---|---|---|---|---|---|
| A1 | 默认进入 | 硬刷新进入 B（有父）；记录 DOM 消息数、Network 请求；再进 root | 仅当前会话已加载消息；祖先消息 **0**；**0** 个 `/messages?scope=all` 自动请求；有父显示「加载上级会话：<title>」，root 无按钮/禁用「已是根会话」 | buildId、sessionId、msgCount、ancestorCount、请求列表、按钮文本/aria | 待验 |
| A2 | 加载直接上级 | 滚到中部；点按钮；记录请求/响应/插入；再次点击 | **一次** `GET /api/sessions/{parent}/messages?scope=all`（无分页/cursor）；prepend 整组、无重复；按钮 loading 时 `aria-busy=true` 且禁用；按钮更新为下一级/禁用；当前消息 `sessionId` 不变 | URL/status/total、prepend 前后消息 ids、重复 id 数、按钮 aria-busy/disabled、截图 | 待验 |
| A3 | 逐级到根 | 连续点击直到 root；每次只加一级；检查组顺序/按钮 | 每点一次只加载**直接上级**；组顺序 root→…→current；到根按钮隐藏/禁用；无一次拉全部祖先的捷径；无重复组 | 每次请求 parentId、组序列、根按钮状态、总消息数 | 待验 |
| A4 | 切换会话 | 加载 2 级后切到其他会话（树/时间轴/搜索各一次），再切回 B | 祖先链**清空**；只显示新当前会话；无跨会话消息/重复；切回 B 重新默认，不保留旧链 | 切前后 ancestorCount、sessionId 集合、请求列表、截图 | 待验 |
| A5 | 时间轴覆盖 | 加载全部祖先；量 `.tl-bar` 数、组数、opacity/gap/rail | bars 数 == **已加载消息数**；组 root→…→current；祖先组 `opacity .55`、当前 1；组 gap **6px**；rail **44px** 无文字；active 不丢；无裁切 | barCount/msgCount、组 class/opacity/gap、rail 宽、active、截图 | 待验 |
| A6 | 滚动不跳（≤1px） | 滚到中部记录顶部可见消息 id+offset、scrollTop、scrollHeight；点加载；DOM 更新后同帧/下一帧测量 | `newScrollTop = oldScrollTop + (newScrollHeight-oldScrollHeight)` 或按顶部 id 偏移校正；**误差 ≤1px**；焦点/选中不变；不强制到底 | old/new scrollTop/scrollHeight、topMsgId+delta、active/focus、截图 | 待验 |
| A7 | 滚动条稳定 | 用 CDP Fetch 延迟响应，采样 loading 中/后 clientHeight、scrollHeight、overflowY、横向 scrollWidth | 容器/可滚范围不缩；插入后无回弹/闪缩；无横向滚动；thumb 范围稳定 | 三阶段尺寸、overflow、scrollWidth、截图 | 待验 |
| A8 | 错误/空/重复/413 | 分别：请求失败（Fetch abort/500）；0 消息 parent；连续点两次；重复 id；>50000 或 mock 413 | 失败不插入、按钮恢复+错误/重试、无半组；空 parent 不插入+「上级没有消息」且可继续向上；loading 防重；同一 id 去重；**413** 显示错误不插入（造不出则标未造出） | 每种状态的前后条数、错误文案、请求次数、413 status/code、截图 | 待验 |
| A9 | 权限/纯度 | 未知 session；跨用户（若可造）；归档 parent；检查 system/internal | 404/403 明确不泄露；归档只读可加载；无 system/合成消息；消息 sessionId/sessionTitle 与来源一致、无跨会话混入 | status/body、archived、消息字段、ids 集合 | 待验 |
| A10 | 响应式/可访问 | 1600/1180/375 各走一次；键盘 Tab/Enter/Space 按钮；读屏 live region；时间轴 tooltip/键盘 | 无破版/横向滚动；按钮可聚焦、aria-busy/aria-disabled、名称含上级标题；完成播报「已加载 N 条上级消息」不刷屏；TimelineTip/TimelineGroups 不回归；无页面定制 CSS | 三档截图、focus/aria、live region 文本、console 0 | 待验 |

**证据汇总模板**：`buildId / fixtureSessionIds / 每步 API URL+status+total / DOM barCount+msgCount / scrollTop+scrollHeight+误差 / opacity+gap+rail / focus+aria / console+4xx / 截图文件名 / 结论(通过|不通过|未造出原因)`。

**预检判断**：后端接口契约已具备（全量/404/400/413/归档），但前端 FE-007 主功能未交付；**不签字**。交付后先冻结 build、确认 parentId/scope=all 契约未变，再按 A1–A10 全量复验；A5 必须用真实页面（非组件画廊），A6/A7 必须在有足够消息的隔离夹具上测量。

### FE-007 实机验收结果（2026-11-12，build `mwdnshfe-yu2wp`，**视觉+功能通过**）

**结论：签字通过。** 在隔离夹具（真实 `simo-live.exe` mock 模型）上完成 A1–A10：3 级链、空/归档上级、413/失败、去重/锚定/375 均通过。**未部署**；413 为 mock（未造 >50000 实体库），403 跨用户未造出；同帧程序化 double-click 会发 2 个请求（真实 60ms 双击为 1），列 P2 风险不阻塞。

**环境**：dist build `mwdnshfe-yu2wp`；隔离 `SIMO_HOME=.tmp-fe007-home`，树 main(30)→研究员(12)→子级(3)，另有 空父(0)→空子级(3)、归档父(3, archived)→归档子级(3)。静态 8898 代理隔离后端；CDP 1600/375；页面 HTTP 仅 GET；未触碰 8787。

| # | 结果 | 关键证据 |
|---|---|---|
| A1 默认 | 通过 | 子级默认 **3** 条/3 bars/1 组；按钮「显示上级会话：研究员」；点击前无 `scope=all` 请求；主会话（root）无按钮。 |
| A2 整级加载 | 通过 | 一次 `GET /api/sessions/sess-fixture-researcher/messages?scope=all`；3→**15**、bars15、groups2；无重复；按钮更新「主会话」。 |
| A3 逐级到根 | 通过 | 再加载 main：15→**45**、bars45、**groups3**、组序 main(30)→研究员(12)→子级(3)；按钮消失；无一次拉全祖先。 |
| A4 切会话清链 | 通过 | 切主会话 30/1组；切回子级 3/1组；搜索过滤后点击子级仍 3/1组，无旧祖先。 |
| A5 时间轴 | 通过 | bars=45=消息数；祖先组 opacity **.55/.55**、当前 **1**；组 gap **6/6**；rail **44px** 无文字；无溢出。 |
| A6 prepend 锚定 | 通过 | `msg-sub-01` offset **-46.4063 → -46.3125**，差 **0.09375px ≤1**；scrollTop 200→2535、scrollHeight 930→3265；未到底（max2603），未强制滚底。 |
| A7 滚动条稳定 | 通过 | pause 加载期间 clientH **662 不变**、scrollHeight 不变；完成后仅内容增长；无横向滚动/闪缩。 |
| A8 错误/空/重复/413 | 通过（413 mock） | 500 失败：不插入（仍3）、错误「请求失败（500）」、按钮恢复；重试成功15。413 mock：不插入（仍15）、「消息过多，暂不能完整加载」、重试成功45。空上级：不插入、提示「上级没有消息」且按钮推进到主会话，再加载 33/2组。重复 id 响应：15/15、无 console error。 |
| A9 权限/纯度 | 部分（403 未造出） | 未知会话 404、scope=bad 400（线上实测）；归档父可加载 6 条/2组、祖先 .55；后端过滤 internal=0；单用户本地无 403 场景，标未造出。 |
| A10 响应式/可访问 | 通过 | 375 点击加载 3→15、timeline `display:none`、无横向溢出；按钮 focus+Enter 可从 12→42；console **0**；DPR2 `fe007-{1600,1280,1180,375}.png` 晚于构建。 |

**P2 风险/说明**：① 同帧同步双 click（0ms）会发 2 个相同 `scope=all` 请求（60ms 真实双击 1 个；无 in-flight ref 合并）；建议加 ref 防重/请求合并。② 按钮文案为「显示上级会话」而 spec 写「加载上级会话」（语义一致，文字差异）。③ 413 为 mock，未造 >50000 实体库；403 未造出；3 级为本次上限（4+级未测）。**范围**：隔离夹具 + mock 错误；未部署、未改代码。

### 视觉修复复验（2026-11-13，build `mwdqrape-bp0ko`，**视觉+功能通过**）

**结论：签字通过。** 主会话（30 条消息、5 个任务）实测：消息卡 gap 9（375 为 8）、timeline 短 track 三档居中 delta 0、右栏 5 个任务全部可见；截图 `fe-gapfix-{1600,1280,1180,375}.png` 晚于构建（DPR2）。**未部署**，8787 未改。

| 项 | 结果 | 证据 |
|---|---|---|
| 消息卡间距 | 通过 | 1600/1280/1180 连续 29 个 gap 全部 **9.00**、computed margin-bottom **9px**；375 全部 **8.00**、margin-bottom 8px；padding 仍 **12px 14px**、border 1px（非 padding 伪装）；无 `.msg:last-child` 清 margin 命中。 |
| 时间轴居中（短 track） | 通过 | 1600/1280/1180：track w24 h178 top395.06，`margin-block:auto` 计算 **242.062px**；trackCenter=scrollCenter=**484.06**，delta **0**；375 timeline `display:none`。 |
| 超高 track | 通过（合成布局） | 在页面内克隆 bars 至 180 根：track h**778** > rail client **662**，margin-block 归 **0**，track top 与 rail top 对齐（差0），rail `overflow-y:auto`，scrollTop 最大可到 **116**（可滚）；真实主会话 30 条为短 track，已实测居中。 |
| 右栏任务 | 通过 | 主会话任务行 **5**：已完成 3/3（汇总本周进展/整理风险清单/生成下周计划），进行中 2/2（生成周报初稿/等待确认交付格式），未开始 0/0；宽屏全部 visible=3/2；375 右栏按响应式隐藏（预期）。 |
| 稳定性 | 通过 | 三档 `scrollWidth==innerWidth`、console **0**；build `mwdqrape-bp0ko`；未改 8787、未部署。 |

**说明/限制**：超高 track 证据为页面内合成 180 根 bars 的 CSS 布局测量（非真实 180 条会话；真实主会话为 30 条短 track）；375 右栏隐藏属既有响应式规则。改动仅视觉间距/居中，未触及数据/接口。

### 视觉修复复验（2026-11-13，build `mwdqyg05-famq9`，**视觉+功能通过**）

**结论：签字通过。** 左下头像居中、Composer 左内边距修复实测通过；截图 `fe-avatar-composer-{1600,1280,375}.png` 晚于构建（DPR2）；未部署、8787 未改。

| 项 | 结果 | 证据 |
|---|---|---|
| 左下头像居中 | 通过 | 1600/1280：avatar **28×28**，容器 center **(26, 947.84)**，字形 center **同值**，x/y 差 **0/0**；字形 5.72×14；computed `display:grid`、`place-items:center`、`line-height:10px`、`text-align:center`。375 侧栏隐藏（avatar rect 0，视觉不可测），computed 规则一致。 |
| Composer 左内边距 | 通过 | textarea computed `padding-left:14px`（1600/1280/375）；1600 textarea left431 → 文本起点 **445**（+14）；375 left9 → 起点23。placeholder/光标从14开始。 |
| 未回归 | 通过 | Composer 与首卡同 x/同宽：1600 **430–1110**，1280 **312–908**，375 **8–367**；footer/发送按钮位置正常，textarea 多行高度/最小高度正常，无横向溢出；console **0**。 |

**说明**：375 左下头像随侧栏隐藏（既有响应式），故 375 仅验证 computed 规则，头像可见性以 1600/1280 实测为准；改动仅头像对齐与 textarea 左 padding，未触及数据/接口。

### 组件级 parity 对比（2026-11-13，current 8787 `mwdqyg05-famq9`，**未通过：禁止上线**）

**结论：组件级 parity 未通过。** 以冻结原型 `frontend/prototype/message-cards.html` 为 expected、8787 主会话 build `mwdqyg05-famq9` 为 current，同视口（1600×1000 / 375×812）、主会话、滚动顶部、DPR2；产出全页图、11 个组件并排图、合成总图与判定表。内容/数据差异单列，不计为风格漂移；**组件错位/风格漂移/缺元素**判为阻断。

**产物**：`frontend/review/component-parity/`
- `expected-1600.png` / `current-1600.png` / `expected-375.png` / `current-375.png`（全页置顶）
- `component-parity-1600.png` / `component-parity-375.png`（合成总图，逐行组件名+判定）
- `1600/<component>-compare.png`、`375/<component>-compare.png`（expected vs current 并排；`card-block` 因首屏被 Composer 覆盖另做滚动裁切）
- `component-parity.md`（判定表）
- `raw/`（全页原图、`meta.json` DOM 框/样式）

**阻断项**
1. **context 缺操作**：current 未渲染「重命名 / 置顶 / 归档」，expected 有。
2. **timeline 错位**：expected x358/y141/44×684.13 → current x378/y153/44×662.13；与卡间距 expected **28** → current **8px**。
3. **composer padding/高度**：expected pad0/h128.88/top833.13 → current pad8/0/14、h150.88/top811.13；发送按钮 state 不同。
4. **375 消息/卡片 padding**：expected 10×12 / 卡12 → current 12×14 / 卡14×16；卡宽 297→295。
5. **right-rail 多状态行**：current 顶部「进行中 rev2 / 待确认1」不在冻结原型。
6. topbar 右侧图标 gear→sun（非主阻断，需确认规范）。

**非阻断/数据差异**：sidebar 会话列表、message 文案/条数、card-block 内容、right-rail 任务数据、timeline bars 数量；不单独判风格漂移。

**Gate：未通过。未修复/未确认上述阻断项前不得部署上线。** 证据见 `component-parity.md` 与合成图。

### 分类标签修复（2026-11-13，build `mwdr52zy-uhku9`，**视觉+功能通过**）

**结论：签字通过。** 主会话 1600/1280/375 实测：agent **16/16** 均渲染分类标签，示例「进度汇报 / 需求澄清」；user 标签 **0**；`.msg-meta` `nowrap`，tag `flex:none`，clientWidth=scrollWidth，无换行/溢出；三档无横向溢出、console 0。截图 `fe-category-top/mid-{1600,1280,375}.png` 晚于构建。未部署；8787 仍为 `mwdqyg05`。

| 视口 | agents / withTag | 标签示例 | user tags | meta nowrap | overflow |
|---|---|---|---|---|---|
| 1600 | 16 / **16** | 进度汇报、需求澄清 | **0** | clientW=scrollW=614 | 无 |
| 1280 | 16 / **16** | 进度汇报、需求澄清 | **0** | clientW=scrollW=530 | 无 |
| 375 | 16 / **16** | 进度汇报、需求澄清 | **0** | clientW=scrollW=295 | 无 |

**限制**：空 `category` 回退「信息」的路径代码已覆盖（`message.category ? label : '信息'`），但当前 live 数据所有 agent category 非空，未用空分类样本截图；可在隔离夹具补一条空分类消息再验证。**部署仍受组件 parity 门禁阻断**（见上节）。

### 组件级 parity 复验（2026-11-13，build `mwdre4c5-3o0m0`，**仍未通过：375 宽度/位置漂移**）

**结论：仍未通过，禁止上线。** 1600/1280/1180 必修项已修：timeline 1600 x358/w44/right402、card x430、gap28、insideCol true；1280 x260/right304、card312、gap8；1180 x248/right292、card300、gap8；375 hidden。1600 msg padding12×14、card-block14×16；375 msg padding10×12、card-block12；topbar gear 恢复（`.icon-btn` 1 个，无新增图标）。**但 375 的宽度/位置仍与冻结原型不一致**：

| 项 | expected | current | 判定 |
|---|---|---|---|
| 375 message-user/agent | x8 / w359 | **x39 / w297** | 有差异（宽度/位置） |
| 375 card-block | x57 / w297 | **x86 / w237** | 有差异（宽度/位置） |
| 375 composer | x8 / w359 | **x39 / w297** | 有差异（宽度/位置） |

已批准豁免保留：context 无操作、右栏 status/rev、Composer padding/高度、数据/文案差异。**当前“375 card x39/w297、composer x39/w297”与冻结原型 x8/w359 冲突**；需二选一：按原型恢复，或更新冻结原型并明确写豁免后再签。产物已更新：`frontend/review/component-parity/component-parity-{1600,375}.png`、`component-parity.md`、各组件 compare 图；未部署，8787 仍 `mwdqyg05`。

### 组件级 parity 签字（2026-11-13，build `mwdrj27e-3vsey`，**通过**）

**结论：通过（可部署）。** 按冻结原型重跑 1600/375（1280/1180 同步核对），主会话、置顶、DPR2：

| 项 | 结果 |
|---|---|
| 1600 timeline | x358/w44/right402、card430、gap **28**、在 chat-body 内 |
| 1280/1180 timeline | x260/right304/gap8、x248/right292/gap8 |
| 375 timeline | 均 `display:none` |
| 1600 msg/card-block | msg x430/w680、pad12×14；block x481/w614、pad14×16（未回退） |
| 375 message | x**8** / w**359**、padding10×12 |
| 375 Composer | x**8** / w**359** |
| 375 CardBlock | x**57** / w**297**、padding12 |
| 375 chat-inner | padding12px 0；无横向溢出（375/375） |
| topbar | gear 恢复，title=设置，`.icon-btn` 1 个，无新增图标 |

已批准豁免保留：context 操作、右栏 status/rev、Composer padding/高度、数据/文案差异。未发现组件级错位/风格漂移。产物 `frontend/review/component-parity/`（全页、11 组件并排、合成图、`component-parity.md`）已更新至当前 build。8787 仍 `mwdqyg05`，本 build 未部署；分类标签 build `mwdr52zy` 同待部署。

### P2 验收预检模板：交付物 preview/download · 工作台三态 · 右栏交互（A1–A8，待交付，不签字）

**状态：模板就绪，不签通过。** 本模板供前端/后端交付固定 build 后直接复验；覆盖 P2 三类：交付物打开/下载、工作台 loading/empty/error、右栏任务/概览/交付物交互。所有结论必须用当前 build 实测，禁止用假数据/示例数据。

**前置**：冻结 build；隔离 `SIMO_HOME`（不碰生产库）；准备交付物样本（docx/xlsx/pdf/png/文本各 1）、0 数据 home、3 组任务（done/running/queued 有展开样本）；浏览器 1600/1180/375，DPR2；Network/Console 记录。

| # | 场景 | 操作步骤 | 通过标准 | 证据模板 |
|---|---|---|---|---|
| A1 | 交付物 preview | 点击交付物「打开/预览」；分别试文本/docx/pdf/图片；观察是否新窗口/预览层、请求与 Content-Type | 打开真实内容（非下载、非空白、非 HTML 假页）；`previewUrl` 200、Content-Type 匹配；无绝对路径/token 泄露；404/403 有明确错误；console/4xx=0（预期外） | buildId、deliverableId、URL/status/Content-Type、截图、console/4xx |
| A2 | 交付物 download | 点击下载；记录响应头/文件大小/SHA256；重复下载 | `Content-Disposition: attachment`、文件名安全；内容与源文件 hash 一致、大小一致；不使用 `file://`/绝对路径；重复下载稳定；无路径穿越 | 文件名、bytes、sha256（源/下载）、headers、截图 |
| A3 | 工作台 loading | 用 CDP Fetch 延迟 `/api/stats`、`/api/deliverables` 等 500–1000ms；进入工作台 | 显示 LoadingState（非 0/错误/空白）；加载期间不闪假 0、不跳布局；完成后真实数据替换；请求去重/旧请求不覆盖 | 截图（加载前/中/后）、请求列表、loading 文案、DOM 计数 |
| A4 | 工作台 empty | 切换到 0 数据 home（无任务/无交付物/0 消息） | 空态与错误态可区分；真实 0 展示「0/暂无」，不显示示例数据；不出现 `undefined/NaN`；图表空态；无假 0 掩盖失败 | home、API total、空态文案/截图、DOM 值 |
| A5 | 工作台 error/retry | Fetch 注入 500/断网；再点重试并恢复 | ErrorState/错误文案本地化；不保留旧假数据/不显示 loading 与 error 并存；重试成功后恢复真实数据；console/未处理异常 0 | 错误注入方式、status、错误文案、重试前后截图、console |
| A6 | 右栏任务分组 | 默认查看三组；逐组展开/收回；检查计数/aria | 默认每组 3 行；展开后显示真实总数（如 done 3/12、running 3/7、queued 3/9）；`aria-expanded` 同步；空组不伪造行；不重复键 | 组名、count、visible 行数、aria-expanded、截图 |
| A7 | 右栏概览/交付物/导航 | 滚动右栏、点 rail 导航/交付物、Tab 键盘；375 检查隐藏 | 四节顺序 目标→输入→执行会话→交付物；rail 贴右、内容可滚、无重叠；交付物打开/下载走 A1/A2；键盘可达；375 右栏按设计隐藏 | 各节 rect、scrollHeight/clientHeight、rail 位置、focus、截图 |
| A8 | 跨面一致/三档回归 | 同一会话对比右侧任务/交付物与 API；1600/1180/375 全页；检查 Spec 泄露/溢出 | 数字与 API 一致（不静默 0）；任务 done/running/queued 与工作台/右栏一致；交付物列表同一来源；无 `specId/version` 等内部字段；三档无横向溢出、console 0 | API counts、DOM counts、三档截图、`scrollWidth==innerWidth`、console |

**证据汇总模板**：`buildId / isolatedHome / sessionId / A1–A8 结果 / API status+body摘要 / counts / sha256 / 截图名 / console+4xx / 未造出原因`。
**签字规则**：全部 A1–A8 通过且证据为当前 build；未测项必须列“未造出”，不得用示例/历史 build 补签。

### Workspace Batch C/D 迁移验收清单（模板，待交付，不签字）

**状态：模板就绪，不签通过。** Batch C/D 的命名与批次定义以 Lead 确认为准；本清单按 `docs/workspace-layout.md` §7/W8/W10 与 `docs/admin-guide.md` 备份/迁移纪律，预设：**Batch C = dry-run + 映射执行；Batch D = 独立验证 + 回滚/交付物隔离**。若实际定义不同，按对应字段替换，验收标准不变。

**前置**：停服务；整包备份 `SIMO_HOME`（含 DB/workspace/specs）；冻结迁移版本与二进制；隔离目标 home；记录源/目标路径、数量、SHA256 清单；准备旧 `data/workspace`、`data/artifacts`、SessionSpec 样本与失败注入脚本。

#### Batch C：dry-run 与迁移执行

| # | 检查 | 通过标准 | 证据 |
|---|---|---|---|
| C1 | 前置备份/冻结 | 备份可解压、manifest 完整；服务已停；旧二进制/旧 home 保留；回滚路径明确 | 备份路径、manifest、时间、大小、校验 |
| C2 | dry-run | `--dry-run`/预演零副作用（DB/文件/审计状态变更=0）；输出源→目标映射、冲突、预计条数；失败项可见 | dry-run 报告、前后文件数/hash、DB 变更计数 |
| C3 | 映射规则 | `data/workspace→workspace/main/data/legacy-workspace`；`data/artifacts/session-*`→`workspace/main/output/legacy/session-*`；`task-*`→output/legacy；其他→output/legacy 或 data 待确认；SessionSpec→specs/main | 映射表、样例路径、无法判定项清单 |
| C4 | 执行/幂等 | 只复制/建索引，不删旧数据；重复执行不重复导入；失败整体可重试；无半写 | 执行前后计数、二次执行差异=0、失败注入结果 |
| C5 | 文件完整/hash | 每个迁移文件源/目标 SHA256 一致；数量一致；空文件/大文件/中文名正常；mtime/size 记录 | 逐文件 hash 清单、mismatch=0、抽样截图 |
| C6 | 交付物隔离 | 只有 `output/`+`user_delivery:true` 进交付物 API；`work/tasks/code/data/_internal/specs` 不出现；旧路径不被 API 直接读取 | API 列表、负向探测（各目录/穿越/绝对路径） |
| C7 | 失败/回滚 | 迁移失败 fail-closed，旧数据/旧服务可用；按备份恢复后计数/hash 回原值；不自动半回滚 | 失败日志、恢复后 hash/计数、旧二进制启动 |
| C8 | 旧数据保留 | 旧目录原地保留（只读/不删）；迁移记录 `_internal/migration/workspace-layout-v1.json` 含源/目标/hash/版本 | 旧路径存在证据、迁移 manifest |

#### Batch D：迁移后独立验证

| # | 检查 | 通过标准 | 证据 |
|---|---|---|---|
| D1 | 独立实例启动 | 新 home 独立端口启动成功；health 200；不连生产 8787；重启持久化 | buildId、port、health、重启前后数据 |
| D2 | 计数/树结构 | sessions/messages/artifacts/specs 计数与迁移报告一致；main/子会话树无环；路径/shortId 稳定 | counts、树 dump、diff=0 |
| D3 | 文件 hash 复核 | 抽样+全量 hash 与 C5 manifest 一致；交付物内容可打开；无损坏/截断 | hash 复核表、mismatch=0 |
| D4 | 交付物隔离/权限 | output 只读；工作区路径不可 API 访问；跨 session 默认拒绝；symlink/`..`/绝对路径/UNC 拒绝；归档只读 | 正向/负向 API 测试、403/404、截图 |
| D5 | 回滚演练 | 从备份恢复 + 旧二进制启动；计数/hash 回到迁移前；旧客户端可用；无数据丢失 | 回滚命令、前后 hash/计数、截图/日志 |
| D6 | 回归/smoke | 会话/消息/工作台/右栏/交付物打开下载 smoke；M1–当前 evals 不回归；console/4xx 0 | smoke 输出、截图、console |
| D7 | 备份/恢复演练 | 备份清单包含 main+specs、可选 work；恢复顺序 specs→_internal→output→work；不覆盖新 output | restore 日志、版本冲突处理记录 |
| D8 | 证据/签字 | 所有 C/D 项当前版本证据齐全；未造出项列明；签字后才切生产 | 报告、截图、hash、失败注入记录 |

**证据汇总模板**：`源/目标 home / 迁移版本 / dry-run 报告 / 文件数 / SHA256 manifest / API 隔离结果 / 回滚前后 hash&counts / 旧数据保留 / 回归结果 / 未造出`。
**硬规则**：dry-run 零副作用；迁移失败不切换；未通过不删旧数据；**不得把 work/tasks/_internal/specs 暴露为交付物**。

### Wave 1 缺口预检（2026-11-13，build `mwdrvjtb-ni7pe`，**不签字**）

**结论：预检不签字。** 文案/复制失败提示、recent activity 排序、会话滚动恢复、check-sdd 均通过；**交付物 download 语义未通过**（`download=1` 仍 `Content-Disposition: inline`，工作台文件点击只打开 preview，无单独下载入口）；Markdown 代码块、剪贴板成功路径、工作台 loading/error 仍未实测。未部署，8787 仍 `mwdrj27e-3vsey`。

**已通过**
- 复制失败：headless 点击 `.msg-copy`，250ms 时文案 **「复制失败」**，1.75s 恢复「复制」；非静默成功。成功路径/权限环境未测。
- 交付物：`/api/deliverables` 有 `weekly-report.md`（101 bytes，userDelivery true，preview/download URL）；preview 200/101 bytes `text/markdown`；`download=1` 200/101 bytes；工作台点击打开 `/api/artifacts/art-weekly-report/content`（window.open 实测）。
- 最近活动：main spec-projection `updatedAt=1794490352701` → DOM「主会话 21:31」；researcher `1794484675094` → 「研究员 19:57」，顺序/时间一致。
- 会话位置恢复：1600 单页，研究员 scrollTop **300** → 主会话 → 研究员，恢复 **300**。
- check-sdd：`node scripts/check-sdd.mjs` **PASS**（11 specs、COMP 3、A 93/93、manifest 32）。
- 截图 `fe-wave1-{1600,375}.png` 晚于构建；build `mwdrvjtb-ni7pe`。

**不通过/未验证**
1. **download 语义**：`GET /api/artifacts/art-weekly-report/content?download=1` 实际返回 `Content-Disposition: inline; filename="weekly-report.md"`，非 attachment；工作台文件行点击只 `window.open(previewUrl)`，未见下载按钮/下载动作。P2 A2 不通过。
2. **Markdown fenced code / inline code**：源码已加（`renderMessageText`，React 文本节点），但 live 无代码块样本，未渲染截图；不签该项。
3. **工作台 loading/error 三态**：代码存在，但未逐态截图/未注入延迟/失败，未验证。
4. **复制成功路径**：headless 无剪贴板权限，未测；当前只证明失败不静默。

**Gate：不签字。** 修 download（attachment/独立下载入口）并补 Markdown/三态/复制成功证据后再复验。

### Wave 1 复验（2026-11-13，build `mwds0fkm-0l3zy`，**不签字：scroll 恢复失败**）

**结论：不签字。** 下载入口、Markdown 解析、工作台三态已独立验证；但**会话位置恢复实测仍为 0（未达 300）**，与提交声明不一致；复制成功路径仍无法验证。服务端 `download=1` 仍是 `inline`（前端 `<a download>` 已让 UI 真实下载，标为技术债）。

**通过**
- 下载入口：工作台文件行有 `<a class="download-link" href="/api/artifacts/art-weekly-report/content?download=1" download aria-label="下载 weekly-report.md">下载</a>`；点击后真实落盘 **weekly-report.md 101 bytes**，内容与 preview 一致；preview 仍保留。
- Markdown：隔离夹具插入 fenced+inline 样例，渲染 `.msg-text pre>code` 1 个、inline `code` 1 个；`script/img` DOM **0**；无 HTML 注入；短样例 `scrollWidth==clientWidth==614`（长代码溢出未复现，提交称 1352>680 未在 live 数据中复现）。
- 工作台 loading/error（CDP Fetch 延迟/失败注入）：loading 显示 `.state-loading`「统计加载中…/交付物加载中…」；失败显示 `.state-error`「工作台加载失败/交付物加载失败」+2 个重试；无假 0/无 loading+error 并存。
- 复制失败：headless 点击后显示「复制失败」，非静默；成功路径未验证。
- 最近活动：主会话 21:31、研究员 19:57（按 spec-projection.updatedAt）；check-sdd **PASS**（11 specs、COMP3、A93/93、manifest32）；截图 `fe-wave1-{1600,375}.png`/`fe-wave1-code-1600.png` 晚于构建。

**不通过**
- **会话位置恢复**：1600 单页，研究员 `scrollTop=300` → 主会话 → 研究员，实测恢复 **0**（连续两次复测均 0）；提交声明 300 不成立。根因方向：activeId effect 在消息重新加载前设置 restoreScroll，空内容时 scrollTop 被钳到 0，后续加载完成不再恢复。

**未验证/技术债**
- 剪贴板成功路径：headless + CDP grant 仍失败；仅失败路径通过。
- 长代码块 `scrollWidth>clientWidth` 横向滚动：短夹具未溢出，未复现提交的 1352/680。
- `?download=1` 响应头仍 `Content-Disposition: inline`；UI 用 `download` 属性实现下载，API 直链/第三方客户端仍不会强制下载（技术债，非本次 UI 阻断）。

**回答“是否接受未验证项”**：下载 UI、Markdown 解析、工作台三态 **可接受已验部分**；**不接受 scroll 恢复声明**（实测失败）；复制成功路径与长代码溢出仍为未验证，不能写成通过。**Gate：不签字**，修 scroll 恢复后再复验。

### Wave 1 复验签字（2026-11-13，build `mwds5zb9-ti3mj`，**通过（带已知限制）**）

**结论：Wave1 预检签字通过。** scroll 恢复修复独立复验全部通过；下载 UI、Markdown、工作台三态、recent activity、check-sdd 通过。已知限制：headless 剪贴板成功路径不可验（只验失败路径）；服务端 `download=1` 仍 inline（UI `<a download>` 实际下载可用，技术债）；live 数据无代码块，长代码用隔离夹具验证。**未部署**，8787 仍 `mwdrj27e`。

| 项 | 结果 | 证据 |
|---|---|---|
| scroll 首次进入 | 通过 | 研究员 max=376，首次 top **376**（回底） |
| scroll 0 | 通过 | 设 0 → 主会话 → 研究员，恢复 **0** |
| scroll 300 | 通过 | 设 300 → 主会话 → 研究员，恢复 **300**，delta **0** |
| scroll clamp | 通过 | 设 99999（clamp 376）→ 主会话 → 研究员，恢复 **376**，delta **0** |
| 下载入口 | 通过 | 工作台/右栏 `<a class=download-link download href=…?download=1>`；点击真实落盘 weekly-report.md **101 bytes**，内容一致；preview 保留 |
| Markdown | 通过 | 隔离夹具：`pre>code` 1、inline code 1；`pre scrollWidth **1530** > clientW **614**，overflow-x auto`；`script/img` DOM **0**；无 HTML 注入 |
| 工作台三态 | 通过 | Fetch 延迟：两处 `.state-loading`；失败：两处 `.state-error`+重试；无假 0/无 loading+error 并存 |
| 复制失败路径 | 通过 | headless 点击显示「复制失败」，非静默 |
| 最近活动 | 通过 | 主 21:31 / 研究员 19:57（updatedAt 排序） |
| check-sdd | 通过 | `scripts/check-sdd.mjs` PASS：11 specs、COMP3、A93/93、manifest32 |
| 截图 | 通过 | `fe-wave1-{1600,375}.png`、`fe-wave1-code-1600.png` 晚于构建 |

**已知限制（接受，不阻断本次预检）**
- 剪贴板成功路径：headless + CDP grant 仍失败，仅验证失败路径；真实浏览器权限环境需人工确认。
- 服务端 `download=1` 仍 `Content-Disposition: inline`；UI `download` 属性已验证可落盘，API 直链仍非 attachment（技术债）。
- live 数据无代码块样本；Markdown 解析与长代码溢出用隔离夹具验证（长代码 scrollWidth 1530 vs 声明 1352 因样本长度不同，行为一致）。

**范围**：Wave1 缺口修复预检；未部署、未改代码；部署由 Lead 决定（连同已签 parity/分类 build）。

### 检查清单（每轮）

1. 首屏 3 秒能理解产品与下一步；
2. 记忆点只有一个；
3. 字号/间距/圆角有层级；
4. 无 AI 模板特征；
5. 375 无横向滚动/截断，点击区足够；
6. Tab 顺序合理、焦点可见；
7. hover/active/focus/disabled 四态；
8. 空/加载/错误三态；
9. 文案无套话、按钮动词一致；
10. 截图无重叠/溢出/低对比度。

## A2 组件验收

| ID | 检查项 | 状态 |
|---|---|---|
| A-10 | 页面零内联 style（动态坐标除外） | 待验收 |
| A-11 | 尺寸只引用 tokens，偶数/2 的幂优先 | 待验收 |
| A-12 | 组件四态/三态齐全 | 待验收 |
| A-13 | 画廊登记所有组件 | 待验收 |

## A3 页面验收

| ID | 页面 | 状态 |
|---|---|---|
| A-20 | 对话（空/有消息/流式/失败/窄屏） | 未开始 |
| A-21 | 工作台（用量/图表/活动） | 未开始 |
| A-22 | 设置弹窗/确认弹窗 | 未开始 |

## A4 功能验收

| ID | 功能 | 状态 |
|---|---|---|
| A-30 | 会话列表/切换/新建草稿 | 未开始 |
| A-31 | 发送与流式，无重复/断线恢复 | 未开始 |
| A-32 | 卡片选择/确认/回执 | 未开始 |
| A-33 | 会话动作：重命名/置顶/归档/恢复 | 未开始 |
| A-34 | 时间轴点击/键盘/hover | 未开始 |

## A5 工程验收

| ID | 检查项 | 状态 |
|---|---|---|
| A-40 | tsc 0 | 未开始 |
| A-41 | build 通过、embed 正确 | 未开始 |
| A-42 | 无 console error | 未开始 |
| A-43 | 后端健康检查 200 | 未开始 |

## A6 上线前

| ID | 检查项 | 状态 |
|---|---|---|
| A-50 | 全部 A1–A5 通过 | 未开始 |
| A-51 | 8787 真实数据验证 | 未开始 |
| A-52 | 提供最终地址与截图 | 未开始 |

## 打回规则

- 任一检查项不通过：任务回 `待办`，写明原因与证据；
- 连续两轮只剩像素差异：停止迭代，记录 TODO 交付；
- 未通过不得上线、不得宣称完成。

## 视觉验收门禁（硬规则，2026-11-12 起）

功能通过 ≠ 验收通过。**视觉验收通过才算通过。**

### 方法
- 以冻结原型 `frontend/prototype/` 为唯一基准；
- 截图必须 **DPR=2**（如 1600×1000 @2x = 3200×2000），禁止用 DPR=1 缩放图判断；
- 必须并排对照：左原型 / 右实现，同尺寸、同数据场景；
- 1px 边框、圆角、阴影必须用 computed style + 裁切图双重确认；
- 数据为空时也要检查空态结构，不允许用"没数据"解释视觉缺失。

### 检查项
1. 主布局：侧栏/中栏/右栏/顶栏/状态栏的宽高、边界、底边；
2. 左栏：会话树密度、计数、控件、用量卡结构；
3. 中栏：白条/标签/时间轴/消息列/Composer 的基线、字号、行高、间距；
4. 右栏：标题层级、目标/输入/执行会话/交付物的分区、任务行、空态、交付物位置；
5. 卡片：边框、圆角、标题/说明/字段/按钮、状态与重叠；
6. 颜色/对比/边框：不得出现"看起来没有边框"；
7. 1600/1180/375 三档，无溢出/裁切/重叠；
8. 每个页面至少 1 张并排图 + 1 张 DPR2 裁切图。

### 判定
- 任一检查项与原型存在**结构性差异** → 视觉不通过，打回；
- 仅剩 1–2px 像素差异 → 可记录 TODO，但必须由 Lead 明确豁免；
- 验收 Agent 签字前，不得回复用户"通过/完成"。

### 当前状态
- 8787 React 版：**视觉验收未通过**（左栏控件/密度、上下文条、右栏空态与结构、卡片按钮文案仍有差异）；
- 只能称为"功能预览"，不是验收版。

