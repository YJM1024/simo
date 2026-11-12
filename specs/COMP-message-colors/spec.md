# COMP-message-colors · 消息分类与时间轴配色

状态：**approved（用户最终确认四类，2026-11-13；只文档，未实现/未改代码）**
Owner：前端（组件/实现）/ 产品（分类口径）/ 验收（视觉与对比度）
流程：`docs/process/component-system.md` §6.8；视觉基线：`DESIGN.md`。
本 spec 为消息分类的**最终口径**；旧 M14 中 `delivery`/“任务交付”不再作为第五类展示。

## 目标

统一消息分类标签与时间轴配色：只保留 **requirement / clarification / progress / consultation** 四类；user 消息无标签；分类只做文字/标签色，不改变时间轴角色色；颜色不单独承载信息，tooltip 保留文字。

## 非目标

- 不新增“需求整理”或第五类；不恢复 `delivery`/“任务交付”标签；
- 不改消息分类的后端判定/模型调用；
- 不为时间轴新增角色色；不做分类筛选/图例；
- 不改排版、字号、间距、组件结构。

## 需求

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 仅四类：`requirement` 需求提出、`clarification` 需求澄清、`progress` 进度汇报、`consultation` 信息咨询 |
| R2 | MUST | 空/缺失/非法分类：agent 回退 `consultation`（信息咨询）；user 永远无标签 |
| R3 | MUST | 标签色严格使用给定 bg/ink 四对；不新增其他标签色 |
| R4 | MUST | 时间轴 user/agent/选中三色；选中宽 24；祖先 opacity .55；hover 同角色色宽 24 |
| R5 | MUST | 颜色不单独承载信息；TimelineTip/标签文字保留分类；aria/tooltip 有文字 |
| R6 | MUST | 颜色走 token，组件/页面无硬编码 hex；不引入 M62 历史渐变规范 |

## 1. 四类与标签色

| 分类 id | 中文标签 | 背景 | 文字 | 用途 |
|---|---|---|---|---|
| `requirement` | 需求提出 | `#E8ECFB` | `#2F4BB8` | 用户提出新需求/改需求，agent 确认开始处理 |
| `clarification` | 需求澄清 | `#FBF0DA` | `#8A5A00` | agent 需要追问/确认需求 |
| `progress` | 进度汇报 | `#E2F1E8` | `#246B4E` | 任务/执行进展汇报 |
| `consultation` | 信息咨询 | `#F1F0EC` | `#5E6068` | 纯信息问答/其他未归类（空回退） |

规则：

- 只显示这四类；**不新增“需求整理”**；
- `delivery`/“任务交付”旧值不展示为第五类：读取时归入 `progress`（进度汇报），不新增标签；
- 空/缺失/非法分类：agent 回退 `consultation`；**user 消息不显示任何分类标签**（不留空位/占位符）；
- 标签文案与颜色一一对应；不得用颜色替代标签文字。

### 1.1 Token 映射（只允许这些颜色）

```css
--msg-cat-requirement-bg:#E8ECFB;  --msg-cat-requirement-ink:#2F4BB8;
--msg-cat-clarification-bg:#FBF0DA; --msg-cat-clarification-ink:#8A5A00;
--msg-cat-progress-bg:#E2F1E8;      --msg-cat-progress-ink:#246B4E;
--msg-cat-consultation-bg:#F1F0EC;  --msg-cat-consultation-ink:#5E6068;
--timeline-user:#AEBDF7;
--timeline-agent:#6FAF8E;
--timeline-selected:#232A8C;
```

- 组件/页面不得写死 hex；token 单一来源；
- 不新增第五个分类色、不改时间轴角色色以外的颜色；
- 标签圆角/字号/内边距沿用现有 Meta/Badge 组件，不在本 spec 另立。

## 2. 时间轴配色

| 状态 | 颜色 | 宽度/透明度 |
|---|---|---|
| user tick | `#AEBDF7`（`--timeline-user`） | 20×4（沿用现有） |
| agent tick | `#6FAF8E`（`--timeline-agent`） | 20×4 |
| selected/active | `#232A8C`（`--timeline-selected`） | **宽 24** |
| hover | 同角色色（user/agent） | **宽 24** |
| ancestor | 同角色色 | **opacity .55**；selected 仍 opacity 1 |

规则：

- 角色色不因分类变化；分类只影响消息标签，不影响 tick 颜色/形状；
- selected 覆盖角色色；hover 只加宽，不改成 selected 色；
- 祖先组内 hover/selected 的宽度/透明度按上述；tooltip 始终不透明；
- 44px rail 内无文字；分类/会话文字在 TimelineTip；
- 时间轴颜色不单独承载语义：user/agent 有 tooltip 发送方文字；选中态有 `aria-current`。

## 3. 展示与交互

- 标签位置：消息元信息行（现有 Meta），仅 agent 消息显示；user 不显示；
- 标签顺序：分类标签在会话路径前/后按现有布局，不改变现有 Meta 结构；
- hover/点击标签不触发筛选（本版只读）；
- 空分类 agent 标签显示“信息咨询”；
- 旧消息无分类：按空回退 `consultation`，不补写/不改消息正文；
- 同一消息只显示一个分类标签；不得叠加多个分类。

## 4. 可访问性

- 标签是文字 + 颜色，不能只靠颜色；对比度按 §5；
- 时间轴 tick 的可访问名称含角色/会话/时间，不含分类（分类只在 Tooltip）；selected 用 `aria-current`；
- Tooltip 保留“发送方 · 会话 · 时间 + 分类 + 摘要”；
- 颜色弱/高对比模式下仍能读标签文字；
- 不引入动画/闪烁。

## 5. 对比度（实测值）

| 标签 | 前景/背景 | 对比度 | 结论 |
|---|---|---|---|
| 需求提出 | `#2F4BB8` / `#E8ECFB` | **6.32:1** | ≥4.5 通过 |
| 需求澄清 | `#8A5A00` / `#FBF0DA` | **5.24:1** | ≥4.5 通过 |
| 进度汇报 | `#246B4E` / `#E2F1E8` | **5.47:1** | ≥4.5 通过 |
| 信息咨询 | `#5E6068` / `#F1F0EC` | **5.50:1** | ≥4.5 通过 |

- 时间轴 user/agent 条为**非文本图形**，不单独承载信息；对比度不作为独立文本可读性门槛；
- selected `#232A8C` 对白底 11.79:1（仅作参考）；颜色之外必须有 tooltip/aria 文字。

## 6. 影响范围

- **Message Meta / Badge**：四类标签与空回退、user 不显示；
- **Timeline / TimelineTip**：三色 + selected 24 + ancestor .55 + hover 24；分类文字只在 Tooltip；
- **组件画廊**：新增四类标签与时间轴三色/状态样例；
- **旧 M14**：`delivery`/“任务交付”按 §1 归入 progress，不新增第五类；
- **不影响**：发送/流式/任务/右栏/布局；不改后端分类判定。

## 7. 验收标准 A1–A8

| # | 场景 | 通过标准 |
|---|---|---|
| A1 | 四类标签 | requirement/clarification/progress/consultation 各显示对应中文与 bg/ink；无第五类 |
| A2 | 空回退 | agent 空/缺失/非法分类显示“信息咨询”；user 始终无标签/无占位 |
| A3 | user 无标签 | user 消息 0 标签；不显示空 badge |
| A4 | 时间轴三色/选中 | user `#AEBDF7`、agent `#6FAF8E`、selected `#232A8C` 宽 24；无其他角色色 |
| A5 | 祖先透明度 | 祖先组 opacity .55；selected/active 仍 opacity 1 |
| A6 | hover | hover 同角色色、宽 24；不改成 selected 色；tooltip 文字保留 |
| A7 | 对比度 | 四个标签 ≥4.5:1（实测 6.32/5.24/5.47/5.50）；颜色不单独承载信息 |
| A8 | 无硬编码/回归 | 颜色来自 token，无新 hex；组件画廊/三档截图；console 0；无页面定制 CSS |

## 8. 待确认

1. 旧 `delivery`/“任务交付”历史数据是否全部显示为 progress（本 spec 默认是）；
2. “需求整理”如未来出现，只能归入 requirement/clarification 之一，不新增第五类；
3. 标签是否允许用户点击筛选（本版不做，后续另立 spec）；
4. 时间轴选中色是否与其它“选中”控件共用 token（当前独立 `--timeline-selected`）。

---

*本文件只定义分类/配色/验收，不实现代码；最终四类以本 spec 为准。*
