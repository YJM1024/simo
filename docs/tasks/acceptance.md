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

