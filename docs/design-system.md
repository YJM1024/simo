# 司墨 UI 设计系统（原子组件规范）

> 目标：像搭积木。先固定 token 与原子组件，再由组件组合页面；禁止页面内随手写样式。
> 参考：ChatGPT / Claude 的信息密度与克制感。

## 1. Tokens

```css
--bg:#FFFFFF; --bg-subtle:#F9FAFB; --bg-hover:#F3F4F6;
--border:#E5E7EB; --border-strong:#D1D5DB;
--text:#111827; --text-secondary:#4B5563; --text-muted:#6B7280;
--accent:#2563EB; --accent-hover:#1D4ED8; --ok:#16A34A; --warn:#D97706; --danger:#DC2626;
--radius-sm:4px; --radius-md:6px; --radius-lg:8px;
--font: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
--fs-12:12px; --fs-13:13px; --fs-14:14px; --fs-16:16px; --fs-20:20px;
--lh:1.65;
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-6:24px; --space-8:32px;
```

规则：只允许这套灰度 + 单一强调色；正文 14，次要 13，元信息 12；圆角 4/6/8；**默认无阴影**，仅弹层用 `0 8px 24px rgba(15,23,42,.12)`；中文 letter-spacing 0。

## 2. 原子组件

### Button
- 高 32（sm 28 / lg 36），水平内边距 12，圆角 6，13–14px/500；
- primary：`--accent` 底、白字；hover 深一档；disabled 40% 不透明；
- secondary：白底、1px `--border`、`--text`；hover `--bg-hover`；
- ghost：透明底、`--text-secondary`，hover `--bg-hover`；
- danger：白底红字红边；仅确认类操作；
- 图标按钮 28×28，只有图标，无背景，hover 浅灰。

### Input / Textarea
- 高 36（textarea min 72），padding 8 12，白底、1px `--border`、圆角 6；
- focus：边框 `--accent`、外圈 3px rgba(37,99,235,.15)；
- placeholder `--text-muted`；错误红边 + 12px 红字。

### Tabs
- 行高 40，13–14/500，gap 24；默认 `--text-muted`，active `--text` + 2px `--accent` 下划线；hover `--text-secondary`。

### Card
- 白底、1px `--border`、圆角 8、padding 16–20；不加阴影；标题 14/600，描述 13 `--text-secondary`。

### Table
- 行高 40，表头 12/500 `--text-muted`（无背景），行 border-bottom `--border`，hover `--bg-hover`，数字 tabular-nums。

### Badge / 状态点
- 12px、无边框或 1px 浅边；圆角 4；颜色只用语义色 20% 透明度底 + 深色字；
- 状态点 6px 圆点 + 12px 灰色文字，不做胶囊。

### Avatar
- 24（消息）/32（成员）方形，圆角 4，`--bg-hover` 底 + `--text-secondary` 字；不用彩色、不用圆形（除非品牌 logo）。

### Tooltip / Popover
- 白底、1px `--border`、圆角 8、阴影 token、padding 8 10、12px 文字；跟随鼠标（偏移 12px，边缘翻转）。

### Dialog
- 白底圆角 8、标题 16/600、正文 14、按钮右对齐；遮罩 rgba(15,23,42,.4)。

### Toast
- 白底 1px 边框圆角 6、12px、右上角堆叠，3s 消失。

### EmptyState
- 居中，图标 20 线性 `--text-muted`，标题 14/600，说明 13，最多一个 secondary 按钮。

## 3. 页面结构组件

- **AppShell**：顶部 Header 52 + 导航行 40 + 内容 + 底部状态 28；
- **Sidebar**：240px，`--bg-subtle`，右侧 1px 分隔；顶部品牌行 52；搜索框 32；列表项 34 高、圆角 4、active `--bg-hover`；
- **ChatColumn**：中间区域居中对齐，max-width 800px；消息之间 20px；
- **Message**：助手无气泡；用户气泡 `--bg-hover`、圆角 8、max-width 75%、padding 10 14；
- **MessageMeta**：12px `--text-muted`，avatar 24 与第一行文字垂直居中；
- **Composer**：同列宽；边框圆角 8；底部行 12px 次要文字 + 32px primary 发送按钮；
- **TimelineRail**：宽 28px，轨道 1px `--border`，刻度为 18×3px 横条（圆角 1），间距 2px，active 蓝；悬停弹层跟随鼠标；
- **StatusBar**：28px，12px `--text-muted`，单行 nowrap，超宽省略。

## 4. 质量基准（不是模仿版式）

参考对象是 **ChatGPT / Claude 这类模型产出的前端"完成度"**，不是它们的页面结构：
- 排版有明确层级（标题/正文/次要/元信息），不靠边框区分；
- 单一强调色 + 中性灰阶，颜色只表达状态；
- 间距成体系（4/8/12/16/24/32），留白均匀；
- 组件形状统一（同一圆角/边框/高度规则），不混用胶囊/圆角/描边；
- 交互状态完整（hover/focus/disabled/loading/empty/error）；
- 任何宽度下都不破版、不裁切、文字不竖向换行。

验收问题：**"这个页面放在 ChatGPT/Claude 级别的产品里，会显得突兀吗？"**

## 5. 禁止项

- 禁止：彩色头像底、彩色描边卡片、渐变、发光、胶囊按钮/标签、每行都加边框、正文小于 13、中文加字距、单行输入框、顶栏按钮居中散开。
- 每个页面必须能在 1600 / 1060 两种宽度截图通过。

## 6. 页面组合规则

所有页面共用 AppShell：Header 52 + NavTabs 40 + 内容 + StatusBar 28。内容区统一左缘 = 侧栏宽 240 + 24px 内容 padding（不单独缩进），页面最大内容宽 1000（对话列例外 832 居中）。

### ChatPage
- 左：会话树 240；中：832px 居中列（时间轴绝对挂列左）；右：收起态 40px 图标条。
- 顶部：面包屑行 40 + 会话范围分段控件；消息列表 15/1.65；Composer 同列宽。
- 消息头：30px 圆形头像与第一行垂直居中；元信息 12–13px 灰，无胶囊。

### Workbench
- 标题与内容同左缘；2 列卡片 gap 16，card padding 16，标题 14/600 + 说明 13；最多 4–6 个入口，hover 显示箭头；不铺满整宽。

### Tasks / Schedules
- 列表行（非大卡片）：行高 56，标题 14/500 + 元信息 12 灰 + 右侧状态；操作按钮 28 高；过期一次性任务显示「已结束」，不显示 1970/负天数。

### Agents
- 卡片式列表：40px 圆头像 + 名称 14/600 + 角色 12 灰 + 一行说明 + 能力标签（12px 中性）；模型统一「V4.1 Flash」。

### Team / Memory
- 空态只出现一次：居中、图标 20 + 标题 14/600 + 说明 13 + 一个 secondary 按钮；禁止多个空态叠加。
- 记忆条目：正文 14、来源/ID 11–12 灰 mono；徽标中性色，语义色仅用于冲突/风险。

### RightRail
- 展开宽 340：分区标题 12/500 灰；任务行 = checkbox + 单行省略标题 + 状态徽标；禁止行内多行文字与调试文案；收起态 40px **只显示图标**。

### StatusBar
- 28px、12px 灰、单行 nowrap；空间不足隐藏次要项，不换行。

## 7. 验收流程

1. 每次前端改动：`tsc` + build + 回归脚本；
2. 无头 Chrome 截图：改动页面在 1600 与 1060 各一张，浮层需打开状态；
3. 对照本文件逐项检查：字号层级、灰度、圆角、间距、对齐、裁切、换行、空态；
4. 不通过 → 继续改，不部署；
5. 每完成 5 个 UI 变更或每周做一次**整站截图**（6 页面 + 权限/通知/右栏/设置，两档宽度），记录问题清单并清零。

