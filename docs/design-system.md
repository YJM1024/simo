# 司墨 UI 设计系统（原子组件规范・M62 浅色科技风）

> 目标：像搭积木。先固定 token 与原子组件，再由组件组合页面；禁止页面内随手写样式。
> 参考：refract 浅色科技风（克制密度 + 轻科技渐变），不是某一家产品的页面版式。
> 硬约束：组件只用语义 token；不新增第三套颜色/圆角/阴影；状态必须齐 hover/active/focus-visible/disabled/loading。

## 1. Tokens

```css
/* 底色与表面 */
--canvas:#F7F8FA; --surface:#FFFFFF; --surface-sunken:#F1F3F6;
--glass:rgba(255,255,255,.82); --glass-border:rgba(228,231,236,.9);
--scrim:rgba(10,12,16,.04); --scrim-strong:rgba(10,12,16,.36);

/* 文字 */
--ink:#0A0C10; --ink-secondary:#313A48; --ink-muted:#5C6675;
--ink-faint:#74808F; --ink-inverse:#FFFFFF; --section-title:#313A48;

/* 线 */
--border:#E4E7EC; --border-subtle:#EEF0F4;

/* 强调色（品牌渐变三色） */
--accent:#2F5BFF; --accent-hover:#254BE0; --accent-ink:#FFFFFF;
--accent-2:#6E4BFF; --accent-3:#00B8D9;
--accent-soft:#EEF1FF; --accent-border:rgba(47,91,255,.22);
--accent-gradient:linear-gradient(110deg,#2F5BFF,#6E4BFF 52%,#00B8D9);

/* 状态 */
--ok:#0F9D6E; --ok-ink:#0F7D58; --ok-soft:rgba(15,157,110,.08); --ok-border:rgba(15,157,110,.2);
--warn:#D97706; --warn-ink:#B45309; --warn-soft:rgba(217,119,6,.08); --warn-border:rgba(217,119,6,.22);
--danger:#DC3B45; --danger-ink:#B4232C; --danger-soft:rgba(220,59,69,.07); --danger-border:rgba(220,59,69,.2);

/* 字体 */
--ff-sans:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;
--ff-mono:Consolas,"Cascadia Mono",ui-monospace,"SFMono-Regular",monospace;
--fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-16:16px; --fs-18:18px; --fs-20:20px;
--lh:1.6;

/* 间距（4px 基准） */
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:20px; --space-6:24px; --space-8:32px;

/* 圆角 */
--radius-sm:8px; --radius-md:12px; --radius-lg:16px;

/* 双层轻阴影 */
--shadow-sm:0 1px 2px rgba(10,12,16,.05), 0 4px 14px -6px rgba(10,12,16,.10);
--shadow-md:0 1px 2px rgba(10,12,16,.05), 0 4px 14px -6px rgba(10,12,16,.10);
--shadow-lg:0 1px 2px rgba(10,12,16,.05), 0 4px 14px -6px rgba(10,12,16,.10);
--shadow-focus:0 0 0 3px rgba(47,91,255,.35);

/* 顶部三色淡径向渐变 */
--glow-primary:rgba(47,91,255,.06);
--glow-secondary:rgba(110,75,255,.05);
--glow-tertiary:rgba(0,184,217,.04);
```

规则：
- 底色 `#F7F8FA`，表面 `#FFFFFF`，线 `#E4E7EC`；正文主色 `#0A0C10`，次级 `#313A48`，辅助 `#5C6675`；
- 强调只用品牌三色（蓝 `#2F5BFF` / 紫 `#6E4BFF` / 青 `#00B8D9`）；状态只用 green/amber/red；
- 页面背景可在顶部叠加三色**极淡径向渐变**（约 4–6% 透明度），内容区保持中性底；
- 字体 `Segoe UI Variable` + 等宽 `Consolas`；正文 14，次级 13；最小可见文字 13（12 仅表格表头/极短元信息）；
- 圆角只用 **8 / 12 / 16**：控件 8，卡片/面板 12，大浮层 16；
- 阴影只用一套双层轻阴影（1px 贴边 + 大范围低透明扩散），禁止重阴影/发光；
- 中文 letter-spacing 0；数字 `tabular-nums`。

## 2. 原子组件

### Button
- 高 32（sm 28），水平内边距 10/12，圆角 8，13–14px/500；
- **primary：`--ink` 黑底 + 白字**；hover `--ink-secondary`，active 压暗；这是主操作；
- secondary：`surface` 白底、1px `--border`、`--ink-secondary` 字；hover `surface-sunken`；双层轻阴影；
- ghost：透明底、`--ink-secondary`，hover `surface-sunken`；
- danger：`--danger` 底 + 白字；仅破坏性操作；
- 图标按钮 28×28，只有图标，无背景，hover 浅灰；loading 保留宽度。

### Input / Textarea
- 高 32/36（textarea min 80），padding 8 12，白底、1px `--border`、圆角 8；
- focus：2px `--accent` 外环（`--shadow-focus`）；错误 `--danger-border` + 13px 红字；
- placeholder `--ink-muted`；必须 label/aria-label；选择器右侧 16px chevron。

### Tabs
- 行高 32–40，13–14/500；默认 `--ink-secondary`，hover `--ink`；
- **active：文字 `--accent` + 2px 蓝→紫渐变下划线**（`--accent-gradient`），下划线贴底；
- 键盘 ←/→/Home/End；窄屏横向滚动。

### Card
- `surface` 白底、1px `--border-subtle`、圆角 12、padding 12–16；
- 使用双层轻阴影（`--shadow-sm`），不做重阴影；标题 14/500，描述 13 `--ink-muted`；
- 可点击卡片 hover：border 加深 + surface-sunken/40；不可点击卡片不 hover。

### Table
- 行高 40，表头 12/500 `--ink-muted`（无背景），行 border-bottom `--border-subtle`，hover `surface-sunken`，数字 tabular-nums；
- 排序/分页为展示状态；分页按钮 28–32、圆角 8。

### Badge / 状态点
- 高度 20/24、文字 12、圆角 8；语义色 8% 透明度底 + 深色字；
- 状态点 6px 圆点 + 12–13px 次要文字，不做彩色胶囊堆叠。

### Avatar
- 24（消息）/32（成员）方形，圆角 8，`surface-sunken` 底 + `--ink-secondary` 字；不用彩色、不用圆形（品牌 logo 除外）。

### Tooltip / Popover
- `surface` 白底、1px `--border`、圆角 12、双层轻阴影、padding 8 10、13px 文字；跟随鼠标（偏移 12px，边缘翻转）。

### Dialog
- 白底圆角 16、标题 16/600、正文 14、按钮右对齐；遮罩 `--scrim-strong`；双层轻阴影。

### Toast
- `surface` 白底、1px `--border`、圆角 12、13px、右上角堆叠，3s 消失；双层轻阴影。

### EmptyState
- 居中，图标 20 线性 `--ink-muted`，标题 14/600，说明 13，最多一个 secondary 按钮。

## 3. 页面结构组件

- **AppShell**：顶部 Header 52 + 导航行 40 + 内容 + 底部状态 28；页面 `background:#F7F8FA`，顶部叠加三色淡径向渐变；
- **TopNav**：左品牌/面包屑，中导航 tab；**active 为蓝→紫渐变下划线**（2px），其余用 secondary 灰；
- **Sidebar**：264px（紧凑 232），`surface` 或 `surface-sunken`，右侧 1px 分隔；列表项 34 高、圆角 8、active `accent-soft` + `accent` 字；
- **ChatColumn**：中间列居中，max-width 800px；消息之间 20px；
- **Message**：助手无气泡；用户气泡 `message-user` 浅灰、圆角 12、max-width 75%、padding 10 14；
- **MessageMeta**：12–13px `--ink-muted`，avatar 24 与第一行文字垂直居中；
- **Composer**：同列宽；边框圆角 12；底部行 12–13px 次要文字 + 32px primary（黑底白字）发送按钮；
- **TimelineRail**：宽 32px（M40），轨道 1px `--border`，刻度为 18×3px 横条（圆角 1），active `--accent`；点击跳转；
- **RightRail**：展开 328px；分区标题 12/500 灰；任务行 = checkbox + 单行省略标题 + 状态徽标；收起态 48px 图标条；
- **StatusBar**：28px，12–13px `--ink-muted`，单行 nowrap，超宽省略。

## 4. 质量基准（不是模仿版式）

参考对象是 **refract / ChatGPT / Claude 这类“浅色科技风 + 高完成度”**，不是页面结构：
- 排版有明确层级（标题/正文/次要/元信息），不靠边框区分；
- 中性底 + 品牌三色点缀；渐变只用于品牌/导航下划线/顶部氛围，不用于普通卡片；
- 间距成体系（4/8/12/16/24/32），留白均匀；
- 组件形状统一（8 控件 / 12 卡片 / 16 浮层），不混用胶囊和多重描边；
- 交互状态完整（hover/focus/disabled/loading/empty/error）；
- 任何宽度下都不破版、不裁切、文字不竖向换行。

验收问题：**"这个页面放在 refract 级别的浅色科技产品里，会显得突兀吗？"**

## 5. 禁止项

- 禁止：彩色头像底、彩色描边卡片、重阴影、发光、玩具感大字、每行都加边框、正文小于 13、中文加字距、单行输入框、顶栏按钮居中散开；
- 渐变只允许：品牌标识、导航 active 下划线、顶部三色氛围、强调文字；**按钮/卡片/表格禁止渐变**（primary 用黑底白字）；
- 每个页面必须能在 1600 / 1060 两种宽度截图通过。

## 6. 页面组合规则

所有页面共用 AppShell：Header 52 + TopNav 40 + 内容 + StatusBar 28。内容区统一左缘 = 侧栏宽 264 + 24px 内容 padding（不单独缩进），页面最大内容宽 1000（对话列例外 800 居中）。顶部背景使用三色淡径向渐变，内容卡片保持白面。

### ChatPage
- 左：会话树 264；中：800px 居中列（时间轴挂列左，宽 32）；右：任务/概览细竖条（展开 328）。
- 顶部：面包屑行 40 + 会话范围分段控件；消息列表 14/1.6；Composer 同列宽。
- 消息头：30px 方形头像与第一行垂直居中；元信息 12–13px 灰，无胶囊。

### Workbench
- 标题与内容同左缘；2 列卡片 gap 16，card padding 16，标题 14/600 + 说明 13；最多 4–6 个入口，hover 显示箭头；不铺满整宽。

### Tasks / Schedules
- 列表行（非大卡片）：行高 56，标题 14/500 + 元信息 12–13 灰 + 右侧状态；操作按钮 28 高；过期一次性任务显示「已结束」。

### Agents
- 卡片式列表：40px 方形头像 + 名称 14/600 + 角色 12–13 灰 + 一行说明 + 能力标签（12px 中性）；模型统一「V4.1 Flash」。

### Team / Memory
- 空态只出现一次：居中、图标 20 + 标题 14/600 + 说明 13 + 一个 secondary 按钮；禁止多个空态叠加。
- 记忆条目：正文 14、来源/ID 12 灰 mono；徽标中性色，语义色仅用于冲突/风险。

### RightRail
- 展开宽 328：分区标题 12/500 灰；任务行 = checkbox + 单行省略标题 + 状态徽标；禁止行内多行文字与调试文案；收起态 48px **只显示图标**。

### StatusBar
- 28px、12–13px 灰、单行 nowrap；空间不足隐藏次要项，不换行。

## 7. 验收流程

1. 每次前端改动：`tsc` + build + 回归脚本；
2. 无头 Chrome 截图：改动页面在 1600 与 1060 各一张，浮层需打开状态；
3. 对照本文件逐项检查：字号层级、底色/表面/线、品牌三色、圆角、双层阴影、间距、对齐、裁切、换行、空态；
4. 不通过 → 继续改，不部署；
5. 每完成 5 个 UI 变更或每周做一次**整站截图**（6 页面 + 权限/通知/右栏/设置，两档宽度），记录问题清单并清零。

## 8. 新项目 / 重设计流程（约定）

### 模式 A：新网站从零开始
1. 先定设计语言：tokens（颜色/字体/间距/圆角/阴影）、原子组件、页面布局规则；
2. 做整页原型（正常/空/加载/错误/长列表/窄屏）；
3. 1600 / 1180 截图自检，确认观感后才写实现；
4. 实现只使用统一 tokens 与组件，逐页截图验收。

### 模式 B：先做 MVP 原型
1. MVP 只用于验证流程与功能可行性，明确"不是最终视觉"；
2. 功能链路跑通后**立即转入设计先行**：先解决"页面应该怎么走/怎么组织"，再做视觉；
3. 原型阶段产出的页面结构可以作为输入，但不能作为视觉基线；
4. 设计确认后再替换/重构实现，禁止在 MVP 样式上无限打补丁。

### 完成定义（UI）
- 1600 与 1180 截图通过；不裁切、不换行破版；
- 对齐用行盒/盒模型计算，浮层实底、状态完整；
- 每 5 个 UI 变更或每周做一次整站截图复查。

### 重写 / 迁移决策（必须先确认）
- 动手前先盘点规模：文件数、页面数、旧组件/旧样式存量、依赖耦合；
- 明确给出三种方案与成本：A 只换 tokens/样式、B 壳层+逐页重排、C 前端整体重写；
- 由用户选择，不默认选最重方案；
- 重写必须先冻结功能清单（FEATURE-MAP），删除旧视觉前确认范围。

