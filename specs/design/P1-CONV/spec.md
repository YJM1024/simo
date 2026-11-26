# DESIGN · P1-CONV · 会话域设计长期 Spec

状态：**draft**（本节提交 Lead / 产品 / 用户评审；未确认前前端不按本节改代码）
Owner：设计（本节）；评审：产品、前端、验收；裁决：Lead
视觉基线：`DESIGN.md`（唯一风格来源，第 3 行）+ `frontend/src/styles/tokens.css`（第 1 行注明 "DESIGN.md v2 唯一来源"）
输入契约：`specs/product/P1-CONV/spec.md`（active，2026-11-21，12 个 PRD / 34 条 AC）
变更来源：`specs/changes/CHG-CONV-006/product.md`（六条默认裁决）、`docs/plan/MASTER-PLAN.md` §1.7（长期 Spec 按域一文件、文件内按功能点 ID 分节）
范围：P1 会话域的**视觉与交互设计**（区域划分、层级、间距、状态、组件复用、可验收视觉判据）。不含代码、不含接口实现、不含测试脚本。
不覆盖：`PRD-SYNC-005`（2026-11-22 已移除，编号不复用）；工作台指标 / 右栏任务投影 P2 / 交付物 P4 / 权限 P8 等非本域页面（产品 spec §7 末条）。

## 读法与约定

1. **本节不另立视觉体系**。所有颜色、字号、间距、圆角、阴影一律引用 `tokens.css` 的 token 名，不写裸 hex。本 spec **不新增任何 hex 值**；只提议两处 token 化，见 §0.4。
2. **一处两套规范的处理口径**：`docs/design-system.md` 是 M62 历史规范（`--canvas #F7F8FA`、渐变、8/12/16 圆角、双层阴影），`COMP-conversation-panel` 明确"不引入 M62 历史渐变规范"。本 spec **只用 `DESIGN.md` + `tokens.css`**；凡与 `docs/design-system.md` 冲突处不再逐条列举，统一在 §13 第 11 条记录。
3. **判据编号**：`V-<PRD>-<序号>`（如 `V-CONV-001-2`）。这是**本节私有**的可验收视觉判据编号，不是产品 AC 编号；每条判据在括号内注明它支撑的产品 AC。判据必须满足"截图或一眼可判定"，含数值的量差上下限。
4. **引用行号均为实际读过**的文件；无法读到的写"未核实"，不猜。
5. 与产品 spec 冲突时**本节不裁决**，一律进 §13 冲突清单（产品说法 / 设计建议 / 影响 AC），交 Lead。
6. **不适用声明（契约门禁口径）**：各节「交互与状态」登记的是组件渲染态与交互态，共 18 个（`default`、`hover`、`child`、`archived`、`renaming`、`loading`、`empty`、`error`、`token`、`done`、`streaming`、`failed`、`idle`、`sending`、`toggled`、`composing`、`disabled`、`ready`）；类 2 契约比对的是任务状态机（请求从提交到运行再到完成的生命周期），渲染态和任务状态机维度不同，不构成契约状态，故声明不适用：

N/A：设计状态：本文件登记的是组件渲染态与交互态（default、hover、child、archived、renaming 等），类 2 是任务状态机，两者维度不同，这些状态不参与类 2 状态比对。

---

## 0. 目录与索引

### 0.1 节清单

| 节 | 功能点 | 产品出处 | 内容形态 | 关联 COMP | 判据数 |
|---|---|---|---|---|---|
| §1 | `PRD-CONV-001` 会话树与主会话 | `specs/product/P1-CONV/spec.md:56` | 有内容 | —（复用 Sidebar） | 6 |
| §2 | `PRD-CONV-002` 会话生命周期 | `:76` | 有内容 | —（`.modal` 变体 + Sidebar 菜单） | 5 |
| §3 | `PRD-CONV-003` 搜索与未读 | `:94` | 有内容 | —（Sidebar 搜索块 + 未读点） | 5 |
| §4 | `PRD-CONV-004` 消息流与渲染 | `:112` | 有内容 | `COMP-message-colors` | 6 |
| §5 | `PRD-CONV-005` 发送·流式·重连 | `:149` | 有内容 | —（Composer 基础件） | 5 |
| §6 | `PRD-CONV-006` Composer 快捷键 | `:166` | 有内容 | `COMP-composer-send-mode` | 5 |
| §7 | `PRD-CONV-007` 祖先整级加载 | `:131` | 有内容 | `COMP-timeline-groups`、`COMP-timeline-tip` | 6 |
| §8 | `PRD-CONV-008` 右栏会话投影 | `:261` | 有内容 | —（OverviewPanel） | 6 |
| §9 | `PRD-SYNC-001` WS 连接与重连 | `:184` | **N/A** | — | 0 |
| §10 | `PRD-SYNC-002` 多标签 active/祖先/游标 | `:201` | 有内容 | — | 3 |
| §11 | `PRD-SYNC-003` 发送模式跨标签 | `:216` | 有内容 | `COMP-composer-send-mode` | 3 |
| §12 | `PRD-SYNC-004` 未读与已读游标 | `:231` | 有内容 | —（Sidebar 未读点） | 4 |
| §13 | 冲突清单（11 条）+ §14 与 COMP 契约的关系 + §15 已知缺口（20 条）+ §16 变更记录 | — | — | — | — |
| §17 | `PRD-CONV-009` 会话内任务与编排 | `specs/product/P1-CONV/spec.md:310` | 有内容 | —（右栏面板 + 任务卡 + 详情 + 任务图） | 49 |

小节顺序按 PRD 编号（CONV-001→008、SYNC-001→004），与产品 spec §4 的 L2 分组顺序（001/002/003/004/007/005/006/SYNC/CONV-008）**不同**：本节按编号便于检索，分组归属以 `docs/product/TREE.md` 为准，不构成冲突。§17 为 2026-11-23 追加的 `PRD-CONV-009`，排在 §16 之后，不参与上述编号顺序。

### 0.2 全域骨架（一次讲清，后面各节只写差异）

```text
AppShell（.app，grid：侧栏 1fr 右栏 / 底部 StatusBar 24）
├─ aside.sidebar            --sidebar 240  白底 --surface，右 1px --line，全高独立滚动
│  ├─ .brand                56 高：28×28 mark + "司墨"
│  ├─ .ws                   工作区切换（select 风格 32 高）
│  ├─ .search               32 高 / --r-6 / --surface-2 底 / 12px
│  ├─ .sidebar-scroll       flex:1 独立滚动，padding 0 --sp-8 --sp-12
│  └─ .quota + .user        底部固定（不随列表滚动）
├─ 主列
│  ├─ .topbar               48 高：面包屑 90 固定 / Segmented / 连接点+文案 / 设置 / 头像
│  ├─ .context              42 高：serif 14 标题 + 聚合视图标记 + 归档 badge
│  ├─ .chat-tabs            30 高 chip（"对话"）
│  ├─ ConversationPanel     白卡列 --conversation-card-w 720 + 左挂 44 时间轴
│  │  └─ .conversation-scroll → .chat-inner（16/20）→ 每条消息白卡
│  └─ .composer             20px 提示槽 + textarea + 底部工具行（28 高按钮）
└─ aside.inspector          --rail 320（面板 280 + 竖条 40），左 1px --line，40 宽图标条 + 投影三组
```

### 0.3 验收档位（全节统一）

| 档位 | 视口 | 本域的布局断言 |
|---|---|---|
| 375 | ≤30em（480） | 侧栏隐藏、右栏隐藏、时间轴隐藏；白卡左右各 8；Composer 不遮发送按钮 |
| 768 | 47.5em–56.25em | 侧栏 228（`components.css:349` 的 73.75em 断点不覆盖此档，实际取 240）；时间轴隐藏、右栏隐藏；**本档从未截图，见 §15** |
| 1180 | 73.75em | 侧栏 240 / 右栏 320（面板 280 + 竖条 40）；白卡 720 完整；时间轴显示 |
| 1280 | 80em | 白卡与 Composer 按 `components.css:910-913` 收窄（−104 / −144） |
| 1600 | 100em | 全展开基准档 |

`DESIGN.md` 末节要求"截图存 `frontend/review/` 并写 `REVIEW.md`"：该目录现有 285 张（`frontend/review/`），**无 768 档**（glob 全目录无 `*768*`，仅 3 张 1920），属 §15 缺口。

### 0.4 token 口径与两处 token 化提议

- 色板 / 字体 / 圆角 / 间距 / 尺寸 / 阴影全部取 `frontend/src/styles/tokens.css:2-163`（`--paper` `--surface` `--surface-2` `--surface-3` `--line` `--line-soft` `--ink` `--ink-2` `--muted` `--faint` `--accent` `--accent-soft` `--accent-line` `--success(-soft)` `--danger(-soft)` `--warning(-soft)`；`--r-4/6/8/10`、`--radius-panel 12`、`--radius-tip 8`、`--tip-width 236`；`--sp-2…--sp-64`；`--sidebar 240`、`--rail 300`（现状；§17 三标签用面板 280 加竖条 40 合计 320，见 §17.13 待新增 token）、`--topbar 48`、`--context 42`、`--gutter-timeline 44`、`--avatar-size 24`、`--conversation-card-w 720`、`--conversation-gutter-x 16`；`--shadow-float`、`--shadow-pop`、`--focus`）。
- **提议 1（非新色，仅 token 化）**：`--timeline-tick: #C9C7C0`。现状 `frontend/src/components/components.css:115` 把默认刻度色写成裸 hex；token 化后不改变观感。**待设计确认**（若采纳"刻度一律按角色色"则此 token 可省，见 §7.1）。
- **提议 2（字号刻度缺口）**：`--font-13-5: 13.5px`。`DESIGN.md` 字号阶梯含 13.5（消息正文/输入），但 `tokens.css:97-107` 只有 `--font-13` 与 `--font-14`，现状正文取 `--font-14`（`components.css:5-12` 的 `body` 字体简写）。**待设计确认**：是把正文收敛到 13.5（新增刻度），还是接受 14 并同步改 `DESIGN.md`。此事进 §13 第 4 条。
- **已知 token 缺陷（不是本 spec 的取舍，需修）**：`tokens.css:53` 写了 `--paper: var(--surface-3);`，覆盖同文件 L4 的 `--paper: #FAF9F6`，实际页面底色是 `#EFEDE8`。`DESIGN.md` 的"暖纸底 `#FAF9F6`"因此从未生效。进 §13 第 2 条。

---

## 1. `PRD-CONV-001` · 会话树与主会话

### 1.1 目标态视觉与布局

左栏作为"目录"存在，不是操作面板：信息密度高、装饰为零、层级靠缩进与选中条表达。

| 区域 | 规格 | token / 依据 |
|---|---|---|
| 侧栏容器 | 宽 240，白底，右 1px 分隔线，`grid` 内独立滚动 | `--sidebar`、`--surface`、`--line` |
| 品牌区 | 高 56，28×28 圆角 8 标记 + 12/600 名称 | `--r-8`、`--font-12` |
| 工作区行 | 高 32，12px，右侧 caret | `--size-32` |
| 搜索框 | 高 32、圆角 6、`--surface-2` 底、无边框、左 16 图标、12px 输入 | `--r-6`、`--surface-2`、`--icon-16` |
| 列表区 | 水平内边距 8，行间距 4，独立滚动，不出现横向滚动 | `--sp-8`、`--sp-4` |
| 会话行 | 高 32、圆角 4、左右内边距 8、12px；选中背景 `--accent-soft` + 左 2 实色 `--accent` + 文字 `--accent`/500 | `--r-4`、`--accent(-soft)` |
| 行内层级缩进 | **每级 16，3 级封顶**（第 4 级起与第 3 级同 x） | 间距刻度 `--sp-16` |
| 行尾尾槽 | 固定 20 宽：⋯ 菜单按钮 20×20；**未读点与计数在标题行首**，不占尾槽 | `--size-20` |
| 底部区 | 配额条 + 用户行（头像 24 圆、11px 名称），参与固定不滚动 | `--avatar-size`、`--font-11` |

**层级与可读性算式（本节的量化依据）**：240 侧栏 − 左右各 8 − 3 级×16 = 192 可用宽；扣行首未读点 6 + 间距 8、行尾 ⋯ 20 + 间距 8 → **标题可用宽 ≈ 150**。若沿用现状每级 24（`components.css:446`），3 级后只剩 **126**，中文标题在 8 字即省略；这是"缩进 24 改 16 + 3 级封顶"的理由（代价：第 4 级及更深不再有视觉区分，改用重命名后的路径提示区分——见 §15 未实现项）。

**主会话的视觉定位**：`main` 是根，不加缩进、行首不加未读点、菜单**不渲染**"归档/删除"（不是置灰——置灰会让人以为"条件满足就能点"）。它的菜单只有"重命名"。

### 1.2 交互与状态

| 状态 | 表现 | 复用契约 |
|---|---|---|
| default | 白底、`--ink-2` 12px、无边框 | `Sidebar` / `session-tree`（`frontend/src/components/manifest.json`） |
| hover | 背景 `--surface-2`；⋯ 显形（120ms） | 同上 |
| active（选中） | `--accent-soft` 底 + 左 2 实色条 + `--accent` 文字 + 500 | 同上 |
| child | 缩进 16/级（≤3 级），其余同 default | 同上 |
| draft（草稿） | 标题 `--muted`，行尾 4 圆点 `--faint`，不显示消息数 | `--r-100` 不足，用 `--r-4` |
| archived | 整行 opacity .55；行尾"已归档"10px `--faint`；未读点保持 opacity 1 | `--font-10` |
| renaming | 行内 input 高 24、圆角 4、1px `--accent` 边 + `--focus` 环，Enter 提交 / Escape 取消 | `--size-24`、`--r-4`、`--focus` |
| loading | 6 行 Skeleton，行高 32，圆角 4 | `Skeleton`（manifest `line`） |
| empty | 列表区居中 11px `--faint` 两行内："暂无会话" / "新建后出现在这里" | `EmptyState` inline |
| error | 11px `--danger` 一行 + 28 高"重试"次按钮 | `ErrorState` / `Button sm` |
| 未读（本轮新增） | 行首 6px 实心 `--accent` 圆点 | 见 §3.2 |

键盘：`Tab` 进列表 → 行内 `Enter`/`Space` 均选中 → `F2` 进重命名（新增）→ `Escape` 取消 → `↑/↓` 移动行焦点（新增）→ `Home/End`。菜单按钮为 `button` + `aria-haspopup="menu"`，菜单项为 `button`，`Escape` 关闭并把焦点还给 ⋯。焦点环统一用 `:focus-visible` 2px `--accent` + 2px offset（现状 `components.css:20` 已全局定义，不新增）。

### 1.3 与现状的差异

| # | 现状（文件:行） | 目标态 | 变化级别 |
|---|---|---|---|
| 1 | 缩进每级 24、无封顶（`frontend/src/components/components.css:446`） | 每级 16、3 级封顶 | 视觉变更 |
| 2 | 行内只有 `Enter` 触发选中（`frontend/src/components/library.tsx:96`），无 Space / 方向键 / F2 | 见 §1.2 键盘表 | 交互补全 |
| 3 | 行首 4px 点仅作装饰（`library.tsx:98` + `components.css:447`），是 accent 实心点，语义=已选中？无明确语义 | 行首点仅用于未读；选中靠底色+左条，不靠点 | 语义变更 |
| 4 | 菜单只有"归档/恢复"两项（`library.tsx:115`） | 重命名 / 归档(恢复) / 删除（危险区）；主会话只留重命名 | 入口新增（删除见 §2） |
| 5 | ⋯ 仅 hover/focus-within 显形（`components.css:774-775`） | 桌面维持 hover 显形；**≤56.25em 常显**（触摸无 hover） | 响应式变更 |
| 6 | 归档 badge 在 `.context` 头部（`frontend/src/app.tsx:658`），侧栏行内无归档标记 | 侧栏行尾"已归档"标注 + 头部 badge 保留 | 增补 |
| 7 | 侧栏 `<aside className="sidebar">`（`app.tsx:640-643`），`Sidebar` props 全量透传（`app.tsx:642`） | 结构不变，仅内部行渲染变化 | 无结构变更 |

### 1.4 可验收视觉判据

- `V-CONV-001-1` 侧栏宽 240±1；列表滚动到底时底部"配额+用户"仍在视口内（截图：滚动前后底部 y 坐标差 ≤1px）。（AC-CONV-001-01）
- `V-CONV-001-2` 会话行高 32±1；选中行左侧 2px `--accent` 实条可见、底色吸色 = `--accent-soft`。（AC-CONV-001-01）
- `V-CONV-001-3` 1/2/3/4 级子会话标题起始 x 差依次 16 / 16 / 0（±1px）。（AC-CONV-001-01/02）
- `V-CONV-001-4` 主会话菜单展开后**只有"重命名"一项**（截图菜单，项数 = 1）。（AC-CONV-001-03）
- `V-CONV-001-5` 有未读的会话行：行首 6px `--accent` 圆点、与标题 baseline 对齐误差 ≤1px；归档行未读点吸色不透明度 ≥0.95（不随整行 .55 变淡）。（AC-SYNC-004-03）
- `V-CONV-001-6` 顶栏连接点：8px 圆 + 11px 文案，"已连接"= `--success`、"重连中…"= `--warning`、"连接中"= `--faint`；三态互斥、文案不缩写。（AC-SYNC-001-02，三态的视觉登记在本节，见 §9）

---

## 2. `PRD-CONV-002` · 会话生命周期

### 2.1 目标态视觉与布局

生命周期动作全部收在"行尾 ⋯ 菜单"这一处，菜单是唯一入口，不额外散落图标按钮。

**会话菜单**（`.session-menu` 升级）：

| 项 | 位置 | 视觉 | 备注 |
|---|---|---|---|
| 重命名 | 第 1 项 | 28 高、圆角 4、11px、左对齐 | `--size-28`、`--r-4` |
| 归档 / 恢复 | 第 2 项 | 同上 | 归档中的会话显示"恢复" |
| 分隔线 | 第 2、3 项之间 | 1px `--line-soft`，上下各 4 | `--line-soft` |
| 删除会话 | 末项 | 11px `--danger` 文字；hover 底 `--danger-soft` | 主会话不渲染 |

菜单面：`--surface` 底、1px `--line`、圆角 6、`--shadow-pop`、`min-width: 160`（现状 80 装不下"删除会话"）、内边距 4、贴行右 4 / 行下 28。

**删除二次确认（弹窗）**：复用 `.overlay` + `.modal`（`components.css:276-282`），新增 `.modal.confirm` 变体宽 **420**（`DESIGN.md` §5.2 ConfirmDialog 420）。内容自上而下：标题 18/600（"删除会话？"）→ 会话名 12px `--ink-2`（单行省略，最长 40 字后省略）→ 风险说明 12px `--muted`（有子会话时 `--danger` 文字"将一并删除 N 个子会话"）→ 按钮行右对齐（取消：白底 + `--line` 边 30 高；确认删除：`--danger-soft` 底 + `--danger` 文字 30 高）。遮罩 `rgba(22,23,27,.32)`。

**确认形态未定 ⇒ 不自行裁决**：`specs/changes/CHG-CONV-006/product.md` §6 待确认项 2 给了两案（输入会话名 / 勾选+确认按钮）。本节给两案的视觉代价，等 Lead 裁：

| 方案 | 视觉代价 | 可判据 |
|---|---|---|
| A 勾选 + 确认按钮 | 弹窗高约 200，最轻，误触防护弱 | 确认按钮在未勾选时 disabled（opacity .5） |
| B 输入会话名 | 弹窗高约 260，需 32 高 input + 校验态（错误红边 + 11px 错误文案） | 名称不匹配时确认按钮 disabled；input 高 32 |

### 2.2 交互与状态

| 状态 | 表现 |
|---|---|
| 菜单 default / hover | 项 hover 底 `--surface-2`；危险项 hover `--danger-soft` |
| 行内"删除中" | 行尾 12px spinner 替换 ⋯，行保持原高度，不乐观移除 |
| 确认弹窗-打开 | 焦点进入弹窗首个可操作元素（B 案 = input；A 案 = 取消按钮，防误确认） |
| 确认弹窗-提交中 | 确认按钮变"删除中…"，两按钮均 disabled，`Escape` 不关闭 |
| 确认弹窗-失败 | 弹窗内 11px `--danger` 错误行保留、按钮恢复可点；**弹窗不关闭**、列表行不消失 |
| 失败（归档/恢复/重命名） | 底部居中 toast（见 §13 第 3 条），12px、`--ink` 底白字、圆角 6、距底 24 |
| 成功删除 | 行移除；若删的是 active → 移到父会话（无父则 `main`），中栏无残留消息（不留空壳） |

`Escape` 关闭弹窗并还焦点给触发项；`Tab` 在弹窗内循环；点遮罩 = 取消（提交中除外）。这些行为沿用 `DESIGN.md` 的交互克制原则，不加动效（除 140ms 遮罩淡入）。

### 2.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 菜单只有归档/恢复（`frontend/src/components/library.tsx:115`），**无删除、无重命名项**（重命名靠双击，`library.tsx:92`） | 三项菜单 + 分隔线 + 危险项 |
| 2 | 菜单 `min-width: 80`（`components.css:777`），装不下"删除会话" | 160 |
| 3 | 无确认弹窗组件：全仓 `grep ConfirmDialog` **0 命中**；仅有通用 `.overlay/.modal`（`components.css:276-282`，`modal` 宽 `min(620,100%)`） | 新增 `.modal.confirm` 420 变体 + 弹窗组件（前端 owner 需在 `manifest.json` 登记 `ConfirmDialog`） |
| 4 | 归档/重命名失败**已有**可见反馈：`app.tsx:465-476`（`setOpError`）、`app.tsx:552-562`（`setOpError` + rethrow），toast 在 `app.tsx:728` 渲染 | 反馈保留；只改 toast 位置与圆角（§13 第 3 条） |
| 5 | toast 固定在右下（`components.css:289`：`right: 22; bottom: 40`） | 底部居中、距底 24 |
| 6 | 删除后端固定 403（`http.go:68-70`），前端无入口 | 前端入口先落、二次确认先行；失败按"失败态"呈现（不假装成功） |

**注意**：产品 spec `AC-CONV-002-02` 引用的缺陷位置 `frontend/src/app.tsx:456-460` / `:536-539` **已与当前代码不符**——这两段现在分别是卡片提交（L451-463）与消息定位（L540-550），真正的归档/重命名捕获在 L465-476 / L552-562。进 §13 第 7 条。

### 2.4 可验收视觉判据

- `V-CONV-002-1` 会话菜单展开：非主会话 = 3 项 + 1 条分隔线；主会话 = 1 项；菜单不超出视口右/下边界（截图）。（AC-CONV-001-03、AC-CONV-002-03）
- `V-CONV-002-2` 确认弹窗宽 420±2，标题 18px，危险按钮文字吸色 = `--danger`、底 = `--danger-soft`；取消按钮白底 + `--line` 边。（AC-CONV-002-03）
- `V-CONV-002-3` 提交中：确认按钮被点第二次不产生第二个请求（Network 面板 1 条 DELETE）；两按钮 disabled（截图）。（AC-CONV-002-03）
- `V-CONV-002-4` 失败后：列表行数不变、弹窗仍在、错误行文字可读（截图前后对比）。（AC-CONV-002-02）
- `V-CONV-002-5` toast：水平居中（左右边距差 ≤2px）、距视口底 24±2、圆角 6、12px 白字。（AC-CONV-002-02）

---

## 3. `PRD-CONV-003` · 会话搜索与未读

### 3.1 目标态视觉与布局

**搜索块**（侧栏第 3 行）：高 32、`--r-6`、`--surface-2` 底、无边框（聚焦时 1px `--accent-line` + `--focus` 环）、左内边距 16（图标占位）、右内边距 8（kbd 占位）、12px 文字。右侧槽位三态互斥且**等宽**（避免打字时抖动）：`⌘K` kbd（10px mono `--faint`）→ 搜索中 12px spinner → 有词时 16px "清除"按钮。

placeholder 按 P1 口径改为 **"搜索会话标题…"**（现状写"搜索会话、消息…"，与标题搜索口径直接矛盾）。结果过滤说明：输入框下方**不加**"共 N 个结果"行——侧栏空间优先给列表，计数已由 `.side-label` 承担。

**未读点**（本轮新增，会话级布尔）：行首、标题左、直径 6、实心 `--accent`、与标题间距 8；`aria-label` 为"有未读消息"；**不显示数字**（产品 §4.4 已裁决：不条数、不全站汇总）。

**列表状态**：

| 状态 | 表现 |
|---|---|
| 默认 | 全部（可见）会话 |
| 搜索中 | 列表保持上一帧结果 + 输入框右侧 spinner；**不清空列表**（避免"打字时列表反复闪空"） |
| 有结果 | 仅命中会话（含子会话、含已归档） |
| 无匹配 | 列表区居中两行："没有匹配的会话" / "换个关键词试试"（11px `--faint`，行高 1.4） |
| 失败 | 11px `--danger` 一行（"搜索失败"）+ 28 高"重试" |
| 空（无会话） | "暂无会话" / "新建后出现在这里" |

### 3.2 交互与状态

- 输入 250ms 防抖（现状已是 250ms，`app.tsx:365-370`）；输入即显示 spinner，请求返回即收起；清空输入立即回到默认列表（不等防抖）。
- 键盘：`/` 或 `Ctrl+K` 聚焦搜索框（**现状未实现**，见 §15）；`Escape` 清空并退出搜索；`Enter` 选中首条结果；`↓` 移焦到列表首行。
- 未读置位/清除规则见 §12.2；本节只负责视觉：点出现 ≤1 帧（无过渡动画，避免"闪一下"），消失同理。
- 搜索命中会话但被折叠（父未展开）时，**不自动展开父链**（阶段 1 不引入树展开记忆），命中行按普通行呈现——这会使"命中在深层不可见"的问题成立，进 §15。

### 3.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 搜索走消息接口：`app.tsx:360-372` 调 `searchMessages` → `/api/messages/search`，把命中消息的 `sessionId` 集合当结果 | 调 `GET /api/sessions?q=`（标题搜索）；结果集语义=会话 id（AC-CONV-003-03） |
| 2 | placeholder "搜索会话、消息…"（`library.tsx:137`） | "搜索会话标题…" |
| 3 | `⌘K` kbd 已渲染（`library.tsx:138`），**快捷键行为未核实**（app.tsx 未见相关 keydown 处理） | 渲染 kbd 即必须有真实快捷键，否则删 kbd（二选一，进 §13 第 9 条） |
| 4 | 未读是会话内数字：`app.tsx:98` `useState(0)`、`app.tsx:219-223` 仅在"不在底部时"累加本地新消息 | 会话级布尔 `hasUnread`，左栏行首点；会话内"回到底部 · N 条新消息"按钮（`app.tsx:685`）保留，但**不承担未读口径** |
| 5 | 行首 4px 点被当作装饰（`library.tsx:98`） | 行首 6px 点仅表达未读 |
| 6 | 搜索中/无匹配/失败文案在 `library.tsx:148-150`（"搜索中…/没有匹配的会话/暂无会话"） | 文案与布局按 §3.1；"搜索中"改由输入框右侧 spinner 表达 |

### 3.4 可验收视觉判据

- `V-CONV-003-1` 搜索框高 32±1、圆角 6、底吸色 = `--surface-2`；右侧槽在 kbd/spinner/清除三态间切换时，输入框宽度不变（截图三态框宽差 ≤1px）。（AC-CONV-003-01）
- `V-CONV-003-2` 输入标题关键词后，列表只保留标题命中会话（含子会话与归档会话），且**消息正文命中的会话不出现**（构造一条正文命中、标题不命中用例）。（AC-CONV-003-03）
- `V-CONV-003-3` 无匹配态：列表区居中两行文案，无残留旧行、无"共 0 条"之类假计数。（AC-CONV-003-02）
- `V-CONV-003-4` 未读点直径 6±1、吸色 = `--accent`、与标题 baseline 对齐 ≤1px；同一行不出现第二处未读表达（无数字、无徽标）。（AC-SYNC-004-03）
- `V-CONV-003-5` 归档会话有未读时，未读点清晰可见（有效不透明度 ≥0.95），"已归档"标注与点不重叠。（AC-SYNC-004-03）

---

## 4. `PRD-CONV-004` · 消息流与渲染

### 4.1 目标态视觉与布局

中栏是"暖纸底 + 白卡列表"：底色 `--paper`，消息列 `--conversation-card-w` 720 居中（`components.css:835` 已实现），**每条消息是一张白卡**（现状已如此，见 §4.3 #1）——这是本节要明确固化的模型，因为它与 `COMP-conversation-panel` 的"透明消息 + 白底列表容器"相反。

**单条消息卡**：`--surface` 底、1px `--line`、圆角 10、内边距 12/14、卡间距 9、**无阴影**（`DESIGN.md`：列表与卡片不用阴影）。卡片内自上而下：

| 行 | 规格 | token |
|---|---|---|
| meta 行 | 高 20，10px/1.4：24×24 头（圆角 6，你/墨）+ 角色 500 + `·` + 分类 tag + 时间（`--mono`，`tabular-nums`）+ 失败徽标 + 复制按钮（18 高，hover 显形） | `--font-10`、`--avatar-size`、`--r-6` |
| 正文 | 13.5/1.65（目标；现 14，见 §13 第 4 条），`--ink-2`；无 max-width 限制（卡内满宽） | 见 §0.4 提议 2 |
| 代码块 | `--ink` 底 + `--paper` 文字、圆角 8、内边距 10/12、13px mono、横向滚动、不换行 | `--ink`、`--paper`、`--r-8` |
| 卡片消息 | 卡中卡：白底 + 1px `--line` + 圆角 10 + 内边距 14/16（`components.css:865-871` 已实现），头像对齐卡顶 | `--r-10` |

**角色区分**（按 `DESIGN.md` 的克制路线）：不做用户气泡、不给用户消息换底色；用户消息与司墨消息的差异只在 meta（"你"/"司墨"）与头像占位文字。这一点与 `docs/design-system.md` 的"用户浅灰气泡 max-width 75%"相反——按 §0 第 2 条，采用 `DESIGN.md`。

**分类标签**（`COMP-message-colors` 四类）：高 18、圆角 4、左右 6、10px、500 字重；四组 bg/ink 全部取 token（`tokens.css:42-49`）；**只渲染 agent 消息且 `category` 有值**；`internal`/未知值归 `consultation`；旧 `delivery` 归 `progress`（`library.tsx:205` 已实现）。同一消息只有一个标签。

**祖先消息弱化**：整组 opacity .55（`.tlg-session.is-ancestor-session` 负责时间轴，消息侧用 `.session-divider` 分隔 + 分隔条上方消息 opacity .55）。

### 4.2 交互与状态

| 状态 | 表现 |
|---|---|
| done | 常规范式，无附加视觉 |
| streaming | 正文末尾 6×14 `--accent` 光标，1s `steps(2)` 闪烁；`prefers-reduced-motion: reduce` 时改为静态 2px 竖线 |
| failed | 卡片内 1px `--danger` 边（≤1px 描边允许，`DESIGN.md` 禁"彩色描边卡片"指装饰性，此处是状态）+ meta 侧 10px `--danger` 徽标"失败" + 卡底"重试"28 高次按钮 |
| with-card | 卡片占用消息后半部；卡片 `active` = 控件可操作；`submitted` = 控件 disabled + 10px `--muted`"已提交"；`error` = 卡内 11px `--danger` 行 + 重试 |
| readOnly（归档） | 卡片全部控件 disabled，卡内顶部 11px `--faint`"已归档会话只读"；复制仍可用 |
| 复制反馈 | 按钮文案在 1.2s 内变"已复制"，随后复原；无 toast（避免打断阅读） |
| 长内容 | 代码块/表格内部横向滚动；正文长单词/URL 用 `overflow-wrap: anywhere` 断行；**中栏永不出现横向滚动条** |

### 4.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 中栏容器已改为透明无边框（`components.css:831-844`），每条消息是白卡（`components.css:855-862`：12/14、1px、r10、mb 9） | **保留**该模型；同时把 `COMP-conversation-panel` 的白卡/消息规则升 v2（§13 第 1 条） |
| 2 | 正文 14px（`components.css:5-12` body 简写 `--font-14`） | 13.5（待裁，§13 第 4 条） |
| 3 | 代码块背景硬编码 `#101218`（`components.css:149-150`） | `--ink` 底 + `--paper` 文字（去裸 hex） |
| 4 | 卡片标题 700 字重（`components.css:497`） | 600（`DESIGN.md`：不用 700） |
| 5 | 正文 `.msg-text` `max-width: none`（`components.css:864`），卡内满宽 | 保留（卡内满宽是白卡模型的必然结果） |
| 6 | 分类 tag 已按四色 token 渲染（`components.css:958-961`），与 `COMP-message-colors` 一致 | 不变；`COMP-message-colors` 契约已按现状契约化（仍为只文档、未签收，见 §14.1） |
| 7 | 消息卡无 hover 态（现无规则） | 保留无 hover：消息卡不是可点区域，不加 hover 底 |

### 4.4 可验收视觉判据

- `V-CONV-004-1` 消息列宽 720±1 居中（列中心与视口中栏中心差 ≤1px）；卡间距 9±1；卡圆角 10。（AC-CONV-004-01）
- `V-CONV-004-2` 四类标签吸色与 token 一致（requirement/clarification/progress/consultation 四张截图取色一致）；用户消息**无**标签、无占位空格。（AC-CONV-004-01）
- `V-CONV-004-3` 含 2000 字符长 URL + 宽表格 + 长代码行的会话：中栏无横向滚动条（`scrollWidth ≤ clientWidth`）。（AC-CONV-004-01）
- `V-CONV-004-4` 流式消息光标可见且仅一处；`prefers-reduced-motion` 下不闪烁（两次截图光标位置相同）。（AC-CONV-004-01）
- `V-CONV-004-5` 失败消息：卡内出现"失败"徽标与"重试"，且原消息文本仍在（不空卡）。（AC-CONV-004-02）
- `V-CONV-004-6` 归档会话的卡片控件全部 disabled（逐个控件截图或 DOM `disabled` 全 true），顶部"只读"提示可见。（AC-CONV-004-02/03）

---

## 5. `PRD-CONV-005` · 发送·流式·断线重连

### 5.1 目标态视觉与布局

Composer 是"输入区一张窄卡"：宽 = 消息卡宽 − 40（两侧各 20；现状 `components.css:873-878` 已如此，与 `COMP-conversation-panel` A12"与白卡同宽"冲突，见 §13 第 10 条）。结构自上而下：

| 区 | 规格 |
|---|---|
| 输入框 | 无边框（边框由外层卡提供）、最小高 66 / 最大 180、内边距上 10 左右 14 下 8、13.5/1.5、在 3 行后长高、超出后内部滚动 |
| 提示槽 | 高 20（常驻，见 §6） |
| 底部工具行 | 高 28，两端：左 = 16 图标 + "支持 Markdown 格式"（10px `--faint`）；右 = 发送方式切换（§6）+ 停止（流式中）+ 发送 |

**发送按钮**：28 高、`min-width: 54`、圆角 6、`--ink` 底白字 12/500；`disabled` 时底 `--surface-2`、字 `--faint`（不是降透明，避免"半透明假可用"）；文案"发送" / "发送中…"（发送中输入禁用但文案变化，宽度按"发送中…"预留，避免按钮跳动）。

**停止按钮**：28 高、白底 + 1px `--line`、`--ink-2` 文字"停止"，左侧 6px `--accent` 圆点（"正在发生"是全域唯一的彩色落点之一）；hover 底 `--surface-2`。

**错误行**：`.composer-error` 在输入框与工具行之间，11px `--danger`，左内边距 36（与正文对齐），最多两行后省略，`role="alert"`。

**连接态**：顶栏连接点（登记于 §1.4 `V-CONV-001-6`）。重连期间**不弹 toast、不遮中栏**；仅当连续失败 ≥3 次，连接点右侧出现 11px `--muted` "重新连接"文本按钮（其余情况不出现可点的恢复入口）。

### 5.2 交互与状态

| 状态 | 表现 |
|---|---|
| idle | 发送按钮在空输入时 disabled（底 `--surface-2`） |
| sending | 发送按钮 "发送中…" + disabled；输入框保持 disabled；停止不出现 |
| streaming | 停止出现（替换位置固定，不推到下一行）；发送保持 disabled；正文追加 |
| 失败 | 错误行出现、**输入文本保留**、发送按钮恢复可用；用户可直接再点发送 |
| 断线 | 连接点转 `--warning` + "重连中…"；已发出的乐观消息保持流式态直到 `done` 或失败（不自行判死） |
| 无会话 / 已归档 | 输入框 disabled + placeholder 换"选择会话后可输入"/"已归档会话只读"；发送 disabled；**不显示发送方式切换按钮**（`library.tsx:585` 已有 `!disabled` 判断） |

重复提交防护：从点击到 `POST /api/chat` 返回之间，按钮与快捷键都不产生第二次请求（`sendingRef` 已有，`app.tsx:448`）；视觉上是"按钮已 disabled"，不做 loading 遮罩。

### 5.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 发送 28 高 `min 54`、`--ink` 底（`components.css:174-176`） | 不变尺寸；补 disabled 配色规则（现禁用可能是浏览器默认/无明显变化，需核实渲染） |
| 2 | 停止按钮用 `.btn.sm`（`library.tsx:590` + `components.css:172`：28 高、10px） | 28 高、12px、带 6px accent 点（10px 偏小，与发送 12px 不齐） |
| 3 | 错误行 `margin: 0 0 4px 36px`、11px danger（`components.css:769`） | 保留（规格一致） |
| 4 | 连接点/文案在 `app.tsx:649`（已连接 / 重连中 / 连接中） | 三态吸色与文案按 §1.4；补"重连失败 ≥3 次"的恢复入口（新增） |
| 5 | Composer 宽 = 卡宽 − 40（`components.css:873-878`） | 保留（与 A12 的冲突进 §13 第 10 条） |
| 6 | 输入框 padding-left 14（`components.css:933`，覆盖了 L438 的 36） | 14（保留，最近一次用户反馈）；错误行左 36 与正文不齐 → 改错误行左 14，与输入文字对齐 |

### 5.4 可验收视觉判据

- `V-CONV-005-1` 空输入时发送按钮底色吸色 = `--surface-2`、字 = `--faint`；有输入时底 = `--ink`、字白（两张截图）。（AC-CONV-005-01）
- `V-CONV-005-2` 点击发送后：按钮文案变"发送中…"且不可点（连点 3 次 Network 只有 1 条 `/api/chat`）；按钮宽度与"发送"态差 ≤1px。（AC-CONV-005-02）
- `V-CONV-005-3` 发送失败后：输入框文本与失败前逐字一致、错误行可见、按钮恢复 `--ink` 底。（AC-CONV-005-02）
- `V-CONV-005-4` 流式中：停止按钮与发送方式切换、发送按钮同一行（不换行、不推高工具行）；点击停止后 2s 内正文长度不再变化（两次截图/字数对比）。（AC-CONV-005-01）
- `V-CONV-005-5` 断线：连接点 `--warning` + "重连中…"；中栏无遮罩、无 toast；恢复后连接点回 `--success`。（AC-SYNC-001-02）

---

## 6. `PRD-CONV-006` · Composer 输入与快捷键

### 6.1 目标态视觉与布局

**提示槽（20px）是本节的核心**：它必须"常驻占位、按需显形"，否则 hover 时 Composer 会跳高。

```text
.composer-foot（高 28，两行布局固定）
├─ .composer-left   16 图标 + "支持 Markdown 格式"（10px --faint），≤47.5em 隐藏
└─ .composer-right  高 20 槽（min-height 20，垂直居中）
   ├─ 切换按钮 20×20（内含 16×16 线性图标，与文字间距 2px）
   ├─ 提示文字 10px --muted，单行省略
   ├─ [streaming] 停止按钮 28 高
   └─ 发送按钮 28 高
```

- 切换按钮：20×20 命中区、圆角 4、图标 16（线性、`currentColor`）；`aria-pressed` = 是否反转模式；未 hover/focus 时**不可见且不可聚焦**（见 §6.3 #2）。
- 提示文字：两套文案逐字固定——`Enter 发送，Shift+Enter 换行` / `Enter 换行，Shift+Enter 发送`（中文逗号，`library.tsx:561` 已与契约一致）；`aria-live="polite"` 只播报模式变化，不播报显隐。
- 显隐：`.composer-box:focus-within` 或 `.composer-right:hover` 显示（120ms opacity）；移出/失焦隐藏。**任何情况下 `.composer-box` 的高度不变**（判据 V-CONV-006-1）。
- 375：提示文字 10px 单行省略（现状 `components.css:1010`），切换按钮仍 20×20；`.composer-left` 隐藏（现状 `components.css:1011`）。
- `preference-unavailable`（localStorage 不可用）：切换仍生效（内存态），提示文字后缀" · 未保存"（10px `--warning`）；不弹窗、不阻塞发送。

### 6.2 交互与状态

| 状态 | 表现 |
|---|---|
| default | 提示槽占 20 高、内容 `visibility:hidden`；Composer 高度 = 输入框 + 20 + 28 |
| hover / focus-within | 按钮与文字显形（120ms）；按钮可获得指针事件 |
| toggled | 文案、`aria-pressed`、`aria-label`、快捷键行为同时更新；**无重排**（槽宽固定、文字单行省略） |
| composing | 提示槽保持现状、不抢焦点；Enter 不发送不切换 |
| disabled | 不渲染切换按钮（`library.tsx:585`）；提示文字也不渲染；槽位仍占 20 高，Composer 高度不塌 |
| 375 | 见 §6.1；不横向溢出 |

键盘：`Tab` 顺序 = 输入框 → 切换按钮（仅显形期间）→ 停止 → 发送；切换按钮 `Enter`/`Space` 切换；`Escape` 不触发切换（避免与"退出焦点"混淆）。

### 6.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 切换按钮 20×20、内含 16×16 svg（`components.css:1003`、`library.tsx:585-587`），图标与文字间距 2（`components.css:1017`） | 尺寸/间距**已合规**，保留 |
| 2 | 隐藏用 `opacity: 0` + `pointer-events: none`（`components.css:1003`），元素仍在可聚焦序列与无障碍树中 → 键盘会 Tab 到一个"看不见的按钮" | 隐藏时同步 `visibility: hidden`（保留占位、移出聚焦序列）；显形时恢复。**必需修** |
| 3 | 槽位高度靠 `.composer-right { min-height: 20 }`（`components.css:1007`） | 明确"20 槽"语义：`.composer-right` 高 20 恒定、按钮 20×20 不撑高；补 `V-CONV-006-1` 断言 |
| 4 | 文案已是中文逗号两套（`library.tsx:561`）；原型 `frontend/prototype/gallery.html:89` 仍是 `Enter 发送 · Shift+Enter 换行`（间隔点） | 以 `library.tsx` 为准；原型的间隔点文案需同步（属原型债务，§15） |
| 5 | `≤47.5em` 时 `.composer-hint { display: none }`（`components.css:382`），与 `≤30em` 的"显示提示"（`components.css:1010`）策略相反 | 统一：≤47.5em 仍显示（省略），不整段隐藏；否则 768 档用户完全看不到当前模式 |
| 6 | 状态 `toggled` 时 `.composer-hint` 无最小宽度约束（`components.css:1008` 只写 `min-width: 0`） | 保持（单行省略即可），但显隐不得改变 `.composer-box` 高 |

### 6.4 可验收视觉判据

- `V-CONV-006-1` hover / focus-within 前后，`.composer-box` 高度差 = 0（截图两次高度差 ≤1px）；发送按钮 y 坐标不变。（AC-CONV-006-01）
- `V-CONV-006-2` 切换按钮与提示文字间距 2±1；按钮 20×20、图标 16×16（`getBoundingClientRect` 或标尺截图）。（AC-CONV-006-01）
- `V-CONV-006-3` 未 hover/focus 时，连续 `Tab` 不落在切换按钮上（焦点序列截图）。（AC-CONV-006-02、A3）
- `V-CONV-006-4` 两套文案逐字为 `Enter 发送，Shift+Enter 换行` / `Enter 换行，Shift+Enter 发送`（截图，注意中文逗号）。（AC-CONV-006-01）
- `V-CONV-006-5` 375 下提示文字单行不溢出（`scrollWidth ≤ clientWidth`）、切换按钮仍可见可达、Composer 总高与 375 基线一致。（AC-CONV-006-02）

---

## 7. `PRD-CONV-007` · 祖先消息整级加载

### 7.1 目标态视觉与布局

**时间轴挂在中栏左侧，不参与居中**：轨道宽 44（`--gutter-timeline`），绝对定位于白卡左 −(44+8)（`components.css:845-852` 已实现），白卡中心不动。轨道内自上而下按"会话组 → 日期 → 刻度"排列，组间 6、组内刻度间距 2。

**刻度（tick）**：视觉条与命中区已分离，按实测契约（2026-11-21）：

```text
button.tl-bar        20×4（active/hover 24×4）视觉条，可聚焦
└─ ::after           44×44 透明命中区（仅 @media (pointer: coarse)，components.css:1022-1026）
```

- 细指针（桌面鼠标）：命中区即视觉条本体（20×4 / active 24×4），**不再按 44×20 重排**；
- 粗指针（触摸）：44×44 命中区，且 tick 间距放到 40px 避免热区重叠（`components.css:1023-1024`）。

| 状态 | 视觉条 | 依据 |
|---|---|---|
| 普通-用户 | 20×4、`--timeline-user` | `tokens.css:50` |
| 普通-司墨 | 20×4、`--timeline-agent` | `tokens.css:51` |
| 当前（active） | 24×4、`--timeline-selected` | `tokens.css:52`、`components.css:965` |
| hover | 24×4、同角色色、opacity 1 | `COMP-message-colors` |
| 祖先组整体 | 组级 opacity .55；**组内 active 不额外提亮** | `components.css:921-924`；`COMP-timeline-groups` §0.2 |
| focus-visible | 命中区 2px `--accent` 环 + 2 offset | `components.css:20` |

**会话分隔**：`.session-divider` 高 20、10px `--faint`，居中文案"上级会话"/"当前会话"，两侧 1px `--line-soft` 延伸至满宽（`components.css:927-928` 已实现）。

**"显示上级会话"按钮**：30 高、白底 + 1px `--line`、圆角 6、12px、居中；加载中文案"加载中…" + 12px spinner，宽度按文本预留（不跳）。

**Tip（`COMP-timeline-tip`）**：宽 236（`--tip-width`）、白底、1px `--line`、圆角 8、`--shadow-pop`、内边距 8/10、与刻度间距 8、视口边距 8、右侧不足翻左、`pointer-events: none`；上栏 12/1.4（"你/司墨 · 会话标题（省略） · HH:mm"），摘要 13/1.45、最多两行。不显示分类以外的技术字段（无 JSON、无路径、无工具名）。

**413 / 403 / 空上级**：413 = 中栏顶部 11px `--danger` 行 + "重试"28 高（不遮消息）；403 与空上级 = 不显示任何错误（等价"无上级"），仅在轴上减少组数。这条视觉上必须"安静"——用户不该因为"上级不可读"被报错打断。

### 7.2 交互与状态

- 点击视觉条跳转（粗指针命中区 44×44 内任意位置生效）；`Tab` 进入刻度、`←/→/↑/↓` 在刻度间移动、`Home/End` 首尾、`Enter/Space` 跳转、`Escape` 关 Tip（`library.tsx:470-483` 已实现键位）。
- hover 120ms 打开 Tip、移出 200ms 关闭（宽限）；focus 立即打开；滚动时 Tip 跟随（不消失）。同一时刻只有一张 Tip。
- 跳转后目标消息 1.2s `--accent-soft` 高亮（`components.css:967` `.msg.is-flash` 已实现），不做平滑滚动动画时长超 300ms。
- 会话组顺序：祖先在前、当前在后（`sessionOrder` 升序）；组内按时间升序；日期标签 8px mono `--faint`（`components.css:114`）。

### 7.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | **命中区已修但仅粗指针**：`.tl-bar` 视觉 20×4（active 24×4）；`@media (pointer: coarse)` 下 `::after` 提供 44×44 命中区（`components.css:1022-1026`，实测 `docs/testing/20261121-123009-after-metrics.json`：rect 24×4 / hit 44×44）；细指针命中区仍为视觉条本体 | 承认现状：粗指针 44×44 已达标；细指针不再要求 44×20 重排（§13 第 8 条已按裁决关闭） |
| 2 | 默认刻度色裸 hex `#C9C7C0`（`components.css:115`），司墨刻度另有 `#8F8D87`（`:117`） | 统一走 `--timeline-user/agent/selected`；默认色 token 化（§0.4 提议 1） |
| 3 | 旧 `Timeline` 组件（22px minimap，`library.tsx:360-422`）已不被 `app.tsx` 使用，但仍在导出与画廊中 | 保留但标记 deprecated；时间轴视觉以 `TimelineGroups` 为唯一口径（§15） |
| 4 | 时间轴显示区间：≥56.26em 显示、≤56.25em 隐藏（`components.css:906-907`），1500 之前另有 `-104/-144` 收窄（`:910-913`） | 保留；补 1180 档"轴不压白卡"断言（轴 left = 卡左 − 52，卡宽收窄后仍 ≥0） |
| 5 | 祖先组内 active（`components.css:924`）在组级透明度下**不提亮**（该规则无效，死代码） | 以组级 .55 为唯一口径；不要求 active 恢复 1（与 `COMP-timeline-groups` §0.2 一致） |
| 6 | `.tl-bar:hover` 加宽到 24（`components.css:118`、`:965`） | 保留，但 hover 改为作用于命中区内的视觉条（`:hover` 从 button 冒泡到 span 仍成立，需 CSS 改选择器） |
| 7 | 跳转高亮 1.2s（`app.tsx:540-544`，`components.css:967`） | 保留 |

### 7.4 可验收视觉判据

- `V-CONV-007-1` 命中区：粗指针（触摸）下 tick 命中区 ≥44×44（实测 44×44；截图 + 点击偏移点位仍能跳转）；细指针以视觉条为点击区，不做 44×20 断言。（AC-CONV-007-02）
- `V-CONV-007-2` 1180 档：时间轴右边界与白卡左边界间距 8±1，轴不压卡内文字（截图）。（AC-CONV-007-02、A4）
- `V-CONV-007-3` 当前刻度宽 24、颜色吸色 = `--timeline-selected`；祖先组整体有效不透明度 ≤0.6（**含组内 current，不额外提亮**），当前会话组刻度为 1。（AC-CONV-007-01）
- `V-CONV-007-4` Tip：宽 236±1、距刻度 8±1、距视口边 ≥8；靠右刻度的 Tip 翻到左侧且不越界（两张截图）。（AC-CONV-007-01）
- `V-CONV-007-5` 413 态：中栏顶部出现错误行 + 重试，消息区未被遮挡（截图：首条消息仍完整可见）。（AC-CONV-007-02）
- `V-CONV-007-6` 键盘：`Tab` 后连续按 `→` 焦点在刻度序列内移动且每次有可见焦点环；`Home/End` 到首/尾刻度（录屏或 3 张截图）。（AC-CONV-007-01、A3）

---

## 8. `PRD-CONV-008` · 右栏会话投影

### 8.1 目标态视觉与布局

右栏 = **40 宽图标条 + 280 内容区**（总 320）。内容区自上而下：

| 块 | 规格 | 空态 |
|---|---|---|
| 状态 | 11/600 `--muted` 标签行 + 12px 值（状态中文 + `· rev N` + `待确认 N`）；`待确认 N` 用 `--warning` 12/500，N=0 时不渲染 | 整块隐藏（不出现空标签） |
| 目标 | 标签 + 12/1.55 `--ink-2` 正文（最多 4 行后省略，可展开） | 12px `--faint`"目标待生成。" / "本会话未记录目标。" |
| 输入 | 标签 + 每条约束/输入一行 12/1.5，行首 2px `--faint` 短横 | 12px `--faint`"暂无输入约束。" |
| 执行会话 | 3 个 `ExecutionGroup`（已完成/进行中/未开始），每组头 28 高：名称 11/600 + 计数 10px `--faint`（`已显示/总数`）+ ▾/▸ 10px；组内行 28 高：6px 状态点 + 12px 单行省略标题 | 组内 `EmptyState` inline 10px（现状已有） |
| 交付物 | 行 28 高：16 图标 + 12px 单行省略名 + 右侧 10px `--accent`"下载" | 10px `--faint`"暂无交付物" |

- 三个组之间 gap 12；`.insp-block` 之间 gap 16；内容区内边距 12/14（`components.css:189`）。
- 交付物**最多 8 条**（`library.tsx:722-727` 已 `slice(0, 8)`）；超过时列表底部 10px `--faint`"仅显示最近 8 个"（现状无此行，新增）。
- 任务行可定位（有 `messageId`）：hover 底 `--surface-2`、cursor pointer、点击后中栏定位并 1.2s 高亮（复用 §7.2）；无 `messageId` 的行**不加 hover、不可点**（不做"看起来能点但没反应"）。
- 四态文案逐字：加载"右栏加载中…" / 错误"右栏加载失败" + 28 高"重试" / 空"暂无会话投影" / 无会话：不渲染 `data-session`、内容区只留一行 11px `--faint`"未选择会话"（不伪造会话 id）。
- 图标条：40 宽（`components.css:186`），3 个 28×28 图标按钮（概览 active / 消息 / 交付物），active = `--surface-2` 底 + `--ink` 图标；其余 `--faint`。**阶段 1 只实现"概览"**，另两个 disabled（`DESIGN.md`：不展示假可用）。

**窄屏策略（本节提出，需裁）**：

| 视口 | 右栏 |
|---|---|
| ≥64em（1024+） | 展开：≥1024 统一为 **280**（2026-11-22 实测），总占 320；原 >1180 的 300 档由 §17.1 的 280+40 取代 |
| 47.5em–64em（760–1024） | 折叠为 **40 宽图标条**，不占内容区（现状此档直接 `display:none`，`components.css:522-524`） |
| <47.5em（<760） | 隐藏；入口移到 `.context` 行右侧 28×28 图标按钮，点开为覆盖式抽屉：宽 `min(280, 100vw − 32)`、右贴 16、顶贴 `.context` 下 8、**底边 = Composer 顶 − 8**（因此永不遮挡 Composer 与发送按钮）、`--shadow-pop`、圆角 10、点遮罩关闭 |

这与产品 `AC-CONV-008-03`"375 宽右栏不遮挡 Composer"一致；但与产品目标行为 6 的"投影内容仍可读"在 375 档存在实现张力（现隐藏 = 不可读）。进 §13 第 6 条。

展开宽另有一条实测口径：视口从 760 起量，`[[760,40],[1023,40],[1024,280],[1179,280]]` 显示 1024–1180 档展开宽为 280，与 1180 档的 280 一致；因此 ≥1024 统一按 280 计，总占 320，原 >1180 的 300 口径已由 §17.1 的 280+40 取代。依据 `docs/testing/ACCEPT-CONV-10-20261122.md` §8.1 的实测序列与 `docs/plan/DECISIONS.md` 的 2026-11-22 裁决。

### 8.2 交互与状态

| 状态 | 表现 |
|---|---|
| loading | 内容区骨架：3 个 12 高 Skeleton（宽 60%/90%/75%），文案"右栏加载中…"11px `--faint`；不计假 0 |
| ready | 按 §8.1 |
| empty | 居中 11px `--faint`"暂无会话投影"，下方不加按钮 |
| error | 11px `--danger`"右栏加载失败" + 28 高"重试" |
| 展开/收起 | 组头 `aria-expanded`，▾/▸ 旋转 180°（180ms，`DESIGN.md` 卡片展开时长）；展开后行数 >3 不改变右栏宽、不出现横向滚动 |
| 定位 | 点击带 `messageId` 行 → 中栏滚动 + 高亮；右栏**不关**、不折叠 |

### 8.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | `OverviewPanel` 已实现三组 + 三任务组 + 交付物（`library.tsx:689-737`），`data-session` 在 L707 | 结构保留；补"仅显示最近 8 个"与"未选择会话"文案 |
| 2 | 加载/错误/空文案已是产品要求的三句（`library.tsx:709-711`） | 保留；错误态需补重试按钮尺寸规格（28） |
| 3 | 图标条 40 宽（`components.css:186`）、3 个占位按钮且仅第一个 active（`library.tsx:730-734`） | 保留 40；另两个改 disabled（现为可点但无行为） |
| 4 | ≤64em 右栏 `display:none`（`components.css:522-524`；`components.css:354-356` 同义） | 760–1024 折叠为 40 图标条；<760 走抽屉入口 |
| 5 | 状态行是 "rev N / 待确认 N"（`library.tsx:713`） | N=0 时不渲染"待确认"，避免"待确认 0"这类假计数（A5） |
| 6 | 交付物 `slice(0, 8)`（`library.tsx:722`）但无"已截断"提示 | 补 10px 提示行 |
| 7 | `RightPanel` 是 `OverviewPanel` 的别名包装（`library.tsx:816-818`），命名与实现两层 | 保留别名（避免调用点改动），文档以 `OverviewPanel` 为准 |

### 8.4 可验收视觉判据

- `V-CONV-008-1` 右栏总宽 320±1（面板 280±1、竖条 40±1），内容区内边距 12/14；三组顺序为 状态→目标→输入→执行会话→交付物（截图）。（AC-CONV-008-01）
- `V-CONV-008-2` 每组任务默认显示 3 条（计数文案显示 `3/总数`）；展开后 >3 且右栏不出现横向滚动（`scrollWidth ≤ clientWidth`）。（AC-CONV-008-02）
- `V-CONV-008-3` 四态文案逐字命中：`右栏加载中…` / `右栏加载失败`（+重试）/ `暂无会话投影` / 无会话时无 `data-session` 属性且不崩。（AC-CONV-008-03）
- `V-CONV-008-4` 交付物超过 8 条时只渲染 8 行且出现"仅显示最近 8 个"；下载链接 10px `--accent` 可点。（AC-CONV-008-02）
- `V-CONV-008-5` 375 档：抽屉打开时，其底边与 Composer 顶边间距 ≥8（截图边界框不交叠）；关闭后 Composer 与发送按钮完全可见。（AC-CONV-008-03）
- `V-CONV-008-6` 768 档：右栏以 40 图标条存在而非消失；点击图标条展开为 280 宽抽屉浮层（`position: fixed`，不参与布局，右缘贴竖条左缘）且不挤压中栏宽度（截图前后白卡宽差 ≤1px）。（AC-CONV-008-03、A4；DEC-35、§17.10）

---

## 9. `PRD-SYNC-001` · WS 连接与重连

`N/A：纯传输协议与重连时序，无布局、无组件、无视觉状态机可设计。`

唯一可见面是顶栏连接点与三态文案（8px 圆 + 11px 文案：已连接 `--success` / 重连中 `--warning` / 连接中 `--faint`），其视觉规格与判据已并入 §1.4 `V-CONV-001-6`（对应 `AC-SYNC-001-02`），不在此重复定义，避免同一元素两处维护导致漂移。若 Lead 认为连接态应在 SYNC-001 独立成判据，则本节由 `N/A` 改为"引用 §1.4"，判据编号改为 `V-SYNC-001-1`，其余内容不变。

---

## 10. `PRD-SYNC-002` · 多标签 active/祖先/游标

### 10.1 目标态视觉与布局

不引入新视觉元素：远端驱动的变化全部复用既有可见面——左栏选中态（§1.2）、中栏消息列（§4.1）、时间轴组（§7.1）、右栏投影（§8.1）。本节只规定**变化发生时的观感**：

- 远端切会话：左栏选中底色在 **1 帧内**移动，不加过渡；中栏先 `loading`（Skeleton，白卡尺寸不跳变）再 `ready`，**不得出现"空态文案闪一下"**（禁止 `empty` 中间帧）。
- 远端祖先链合并：`.session-divider` 只出现一次，重复消息按 id 去重（视觉上不出现两段相同内容）；祖先组整体 opacity .55 不因远端合并而闪变。
- 远端已读：本标签未读点**直接消失**（无淡出），不出现"先把本地点亮再熄灭"的闪动。
- 远端驱动的一切变化**不触发滚动动画**：中栏 `scrollTop` 从 0 起，不做 smooth 滚动，避免两标签互相"推着滚"。

### 10.2 交互与状态

| 场景 | 观感约束 |
|---|---|
| 两标签同 `at` | 选中态只移动一次（无来回抖） |
| 不支持 BroadcastChannel | 无任何界面提示（静默降级），单标签表现不变 |
| 重复广播 | 不叠加高亮、不重复 Tip、不追加消息 |

### 10.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 远端切换 `activeId` 由 `useTabSync` 驱动（`app.tsx:235-265`），`remoteActiveRef` 抑制回声（`app.tsx:230`） | 保留；补"无 empty 中间帧"约束（`ConversationPanel` state 计算在 `app.tsx:667`，需保证 loading 优先于 empty） |
| 2 | 祖先链远端合并（`app.tsx:245-260` 区段）逐会话拉 all messages | 保留；补"分隔只出现一次 + id 去重"的视觉断言 |
| 3 | 本标签未读是本地计数（`app.tsx:219-223`） | 改布尔后见 §12；远端已读清除不加动画 |
| 4 | 强制动画：`components.css` 中消息卡无过渡（已符合） | 无差异，登记为约束 |

### 10.4 可验收视觉判据

- `V-SYNC-002-1` 远端切会话期间，`暂无会话投影`/`开始和司墨对话` 等空态文案 **0 帧可见**（录屏逐帧或断言 state 序列不含 empty）。（AC-SYNC-002-01）
- `V-SYNC-002-2` 远端合并后：消息区无重复内容、`.session-divider` 恰好 1 个；中栏从 `scrollTop 0` 起而不是动画滚到底。（AC-SYNC-002-01/02）
- `V-SYNC-002-3` 远端已读：未读点消失前后无中间态（两张间隔 ≤100ms 截图，未读点不出现"变淡"）。（AC-SYNC-002-01）

---

## 11. `PRD-SYNC-003` · 发送模式跨标签同步

### 11.1 目标态视觉与布局

无新布局。远端切换只改变 Composer 内两个可见面（§6.1 的切换按钮 + 提示文字），且必须满足三条"不动"：

1. **不重排**：`.composer-box` 高、`.composer-right` 高、发送按钮位置前后完全一致（差 ≤1px）。
2. **不抢焦点**：`document.activeElement` 保持原元素（输入框内光标位置不变）。
3. **不提示**：不弹 toast、不闪边框、不加高亮。

### 11.2 交互与状态

| 场景 | 观感约束 |
|---|---|
| 远端切到反转模式 | 本标签文案变 `Enter 换行，Shift+Enter 发送`、`aria-pressed` 变 true；按钮保持"显形中"才更新，隐藏时不强制显形 |
| 远端写入非法值 | 回退默认模式，界面**无错误提示**（用户不该看到别人的脏值） |
| localStorage 不可用 | 提示文字后缀" · 未保存"（§6.1），其他不变 |

### 11.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | 广播 + storage 双通道已实现（`library.tsx:532-540`） | 保留；补"不重排/不抢焦点/不提示"三条断言 |
| 2 | 接收后直接 `setMode`（`library.tsx:532-540` 区段） | 保留；需确保不 `focus()` 输入框、不重置草稿 |
| 3 | 旧 key 迁移 `simo.composer.send-mode`（`library.tsx:518-529`） | 保留；迁移不产生视觉变化 |

### 11.4 可验收视觉判据

- `V-SYNC-003-1` 标签 A 切换后，标签 B 的提示文案同步变化（两截图），且 B 的 `.composer-box` 高度差 = 0、发送按钮 y 差 ≤1px。（AC-SYNC-003-02）
- `V-SYNC-003-2` 切换瞬间 B 的 `activeElement` 仍是输入框（脚本取值或焦点截图）。（AC-SYNC-003-02）
- `V-SYNC-003-3` B 不出现 toast、不出现错误边框；`aria-pressed` 与文案一致（截图 + ARIA 面板）。（AC-SYNC-003-01/02）

---

## 12. `PRD-SYNC-004` · 未读与已读游标

### 12.1 目标态视觉与布局

未读是**会话级布尔**，只有两个可见面：

| 可见面 | 规格 |
|---|---|
| 左栏行首未读点 | 6px 实心圆、`--accent`、距标题 8、与标题垂直居中；不外扩、不加脉冲动画；`aria-label="有未读消息"` |
| 中栏"回到底部 · N 条新消息" | 保持现状（`app.tsx:685`），30 高、圆角 8、`--shadow-pop`、居中悬浮于消息区底部 16；**该 N 不承担未读口径**，只是"本次停留在非底部期间到达的条数" |

明确不做（避免做出产品已否定的东西）：不做数字徽标、不做全站汇总角标、不做 `title` 计数、不做页面标题 `(N)` 前缀、不做持久化指示。

### 12.2 交互与状态

| 事件 | 表现 |
|---|---|
| 非 active 会话收到新消息 | 该行未读点出现（≤1 帧，无动画） |
| 进入该会话（任一标签） | 未读点立即消失；不淡出 |
| 刷新 / 重启 / 服务端重启 | 未读点全部清空（阶段 1 不持久化） |
| 归档会话收到新消息 | 同样出现未读点（点不随 `.is-archived` opacity .55 变淡） |
| 两个标签同时进入 | 点消失一次，不闪回 |

### 12.3 与现状的差异

| # | 现状（文件:行） | 目标态 |
|---|---|---|
| 1 | `app.tsx:98` `unread` 数字；`app.tsx:219-223` 本地累加；`app.tsx:685` 按钮显示 N 条 | 会话级布尔 `hasUnread`；数字只留"回到底部"按钮（会话内） |
| 2 | 侧栏行无未读态（`library.tsx:90-117` 无 `hasUnread` 分支） | 行首未读点（§12.1） |
| 3 | 已归档行 opacity .55（`components.css:773`）会连带淡化点 | 点独立 `opacity: 1` |
| 4 | 多标签已读靠 `read_cursor_changed` 广播（`app.tsx:167-184` 发布、接收在 `useTabSync`） | 保留通道；语义改布尔清除 |
| 5 | 无持久化、无后端字段（已符合阶段 1 口径） | 不变 |

### 12.4 可验收视觉判据

- `V-SYNC-004-1` 两会话场景：B 收到新消息 → B 行出现 6px 点、A 行无；切到 B 后点消失、切回 A 不复活（三张截图）。（AC-SYNC-004-01）
- `V-SYNC-004-2` 页面内不存在任何未读数字/角标（全屏截图 + DOM 查 `aria-label`/文本无非零计数）。（AC-SYNC-004-03）
- `V-SYNC-004-3` 归档会话有未读：点有效不透明度 ≥0.95，行其余内容 ≤0.6（对比截图）。（AC-SYNC-004-03）
- `V-SYNC-004-4` 刷新后未读点全清（刷新前/后截图）；不出现"幽灵未读"。（AC-SYNC-004-02）

---

## 13. 冲突清单（交 Lead 裁决，本节不自行裁决）

| # | 冲突 | 产品说法 | 设计建议 | 影响 AC |
|---|---|---|---|---|
| 1 | 中栏卡片模型 | 产品 spec 未规定；`COMP-conversation-panel`（approved）要求"灰底 + 单一白卡容器，消息透明无阴影" | 实现已是"透明容器 + 每条消息白卡"（`components.css:831-844`、`:855-862`）。建议**承认实现**并升 `COMP-conversation-panel` v2；理由：卡片消息/代码块/失败态都需要独立边界，单容器模型无法承载 | AC-CONV-004-01、AC-CONV-007-01 |
| 2 | 页面底色 | `DESIGN.md`：暖纸底 `--paper #FAF9F6` | `tokens.css:53` 用 `--paper: var(--surface-3)` 覆盖，实际 `#EFEDE8`（更冷更灰）。建议删 L53 恢复 `#FAF9F6`，或正式改 `DESIGN.md` 并全量重截图；**不裁不能定视觉判据的吸色基线** | 全域视觉判据、A4 |
| 3 | toast 位置 | `DESIGN.md` §5.1：底部居中、圆角 6 | 实现右下 22/40、圆角 8（`components.css:289`）。建议按 `DESIGN.md` 改底部居中、距底 24、圆角 6 | AC-CONV-002-02 |
| 4 | 正文字号 | `DESIGN.md` 阶梯含 13.5（消息正文/输入），并规定不用阶梯外字号 | 实现 `--font-14`（`components.css:5-12`），且 `tokens.css:97-107` 另有 8/9/10.5/12.5 等阶梯外刻度。建议正文收敛 13.5（新增 `--font-13-5`）并把阶梯外刻度收进刻度表 | AC-CONV-004-01、AC-CONV-006-01 |
| 5 | 删除确认形态 | `CHG-CONV-006` §6 待确认项 2：输入会话名 vs 勾选 + 确认按钮（未定） | 本节给两案视觉代价（§2.1）不选边；若选 B，需新增 32 高 input + 校验错误态样式；确认令牌形态由后端定 | AC-CONV-002-03 |
| 6 | 右栏窄屏 | 产品目标行为 6："375 右栏收起/不遮挡"+"投影内容仍可读"（内部张力） | 实现 ≤1024 直接 `display:none`（`components.css:522-524`）→ 375 不可读。建议 760–1024 折叠 40 图标条、<760 抽屉（§8.1）；需产品确认"仍可读"是否包含 375 | AC-CONV-008-03、A4 |
| 7 | 产品 spec 引用行号过期 | `AC-CONV-002-02` 写"`app.tsx:456-460`（toggleArchive）与 `:536-539`（rename）无 try/catch，失败静默" | 当前代码这两段是卡片提交（L451-463）与消息定位（L540-550）；归档/重命名的捕获在 **L465-476 / L552-562**，且都 `setOpError` + toast（L728）。建议产品侧更新证据行号并复核该 AC 的现状判定（缺口可能已关闭） | AC-CONV-002-02 |
| 8 | 时间轴命中区 | `AC-CONV-007-02` 要求点击目标 ≥44px | **已关闭（2026-11-21 裁决）**：实现为 `@media (pointer: coarse)` 下 `.tl-bar::after` 44×44（`components.css:1022-1026`），实测 rect 24×4 / hit 44×44（`docs/testing/20261121-123009-after-metrics.json`）；`COMP-timeline-groups` 契约已同步为"视觉 24×4、命中区 ≥44×44"，不再要求 44×20 重排 | AC-CONV-007-02 |
| 9 | 搜索框 `⌘K` | 无产品说法（属设计自留） | kbd 已渲染（`library.tsx:138`）但快捷键**未核实是否实现**；建议二选一：实现 `Ctrl/⌘+K` 与 `/` 聚焦，或删 kbd 避免假承诺 | AC-CONV-003-01 |
| 10 | Composer 与卡片同宽 | `COMP-conversation-panel` A12："Composer 与白卡 x/width/right ≤1px" | 实现 Composer = 卡宽 − 40（每侧 20，`components.css:873-878`），恒差 20/侧。建议 A12 改为"Composer 与卡内容左基线对齐、两侧各内缩 20"，或把 Composer 拉到同宽（会牺牲输入框左右呼吸） | AC-CONV-006-01 视觉基线、A12 |
| 11 | 两套规范并存 | `DESIGN.md` 自称"唯一风格来源"；`docs/design-system.md` 是 M62 历史规范（渐变、双层阴影、用户气泡） | 本节只用 `DESIGN.md` + `tokens.css`。建议在 `docs/design-system.md` 首行加"已废弃，见 `DESIGN.md`"标注，避免新人两处取色 | 全域视觉判据 |

---

## 14. 与 COMP 契约的关系

### 14.1 引用关系（本节不复制 COMP 数值）

| PRD | COMP | 契约状态 | 本节角色 |
|---|---|---|---|
| 001/002/003 + §12（SYNC-004） | —（复用 `Sidebar`，`docs/product/TREE.md` 的 COMP 列为 "—"） | 无独立契约 | 本节定义行内新增面（未读点、危险菜单项、菜单分隔），并提出 `Sidebar` 的 variants 扩展登记 |
| 004 | `COMP-message-colors` | approved（2026-11-13，只文档未改代码）；契约已按现状契约化，未签收。四色 token + `.msg-tag-*`（`components.css:958-961`）与时间轴三色（`:962-965`）已落地 | 本节引用它定义标签与轴的配色；**不重复定义色值** |
| 006/011(SYNC-003) | `COMP-composer-send-mode` | spec ready（**已实现未签收**：8787 线上 smoke 通过；契约含 50ms 组合结束抑制与旧 key 迁移） | 本节引用 20px 槽 + 2px 间距 + 文案；补"隐藏时不可聚焦"的 a11y 缺口 |
| 007 | `COMP-timeline-groups` / `COMP-timeline-tip` | 均 spec ready（已实现未签收）；groups 已按现状契约化：active=`--timeline-selected`、组级 .55、阶段 1 无日期分组、**命中区 44×44（实测）** | 本节引用其刻度/分组/Tip 规格；命中区口径已与契约一致 |
| 全域 | `COMP-conversation-panel` | accepted（2026-11-22 复签；透明容器 + 每条消息白卡） | 本节以"页面级事实"提出 v2 修订（§13 第 1、10 条） |

### 14.2 四条协作规则

1. **组件级数值以 COMP 为唯一事实，页面级组合以本节为事实**。冲突时不在本节内改 COMP 数值，走 §13 裁决后再改 COMP。
2. 本节新增、但属于组件变体的东西（会话行未读态 / 危险菜单项 / 确认弹窗 / 时间轴命中区），**必须由前端 owner 在 `frontend/src/components/manifest.json` 登记 variants/states**，并在 `/#gallery` 出现——`DESIGN.md` §5.2 要求"所有组件必须登记在组件画廊；页面只允许组合"。现状 `frontend/src/gallery.tsx:2-23` 的导入列表**缺 `Sidebar`、`OverviewPanel`/`RightPanel`、`ExecutionGroup`、`CardBlock`?（有）、`ConfirmDialog`（不存在）** → 见 §15。
3. 本节所有判据按"页面 + 组件库同源"验收：同一判据在 `/#gallery` 上应可复现（组件级），在 8787 页面上应可复现（页面级）。
4. 5 个 COMP 的签收 owner 与跨 owner 裁决人仍未定（`CHG-CONV-006` §6 待确认项 5）；在其确定前，本节判据可先行用于页面验收，但**不得据本节给 COMP 签收**。

---

## 15. 已知缺口（现状未实现 / 未签收）

> 逐条给证据位置；不写"待补/TODO"。凡"未核实"即本会话无法确认。

| # | 缺口 | 证据 |
|---|---|---|
| 1 | 页面底色被 token 覆盖，暖纸底未生效 | `frontend/src/styles/tokens.css:53` 覆盖 `:4`（§13 第 2 条） |
| 2 | 主会话菜单未禁用归档，服务端归档 `main` 无守卫 | `frontend/src/components/library.tsx:115`（菜单无判断）；产品 spec `AC-CONV-001-03` 记 `spec.go:292-327` 无守卫 |
| 3 | 无删除入口、无确认弹窗组件实体 | `library.tsx:115` 只有归档/恢复；全仓 `grep ConfirmDialog` 0 命中；仅通用 `.overlay/.modal`（`components.css:276-282`） |
| 4 | 会话级未读未实现（无 `hasUnread`、无行首点） | `library.tsx:98` 的点是装饰点；`app.tsx:98` 是会话内数字 |
| 5 | 搜索仍调消息接口，placeholder 与口径不符 | `app.tsx:360-372`；`library.tsx:137` |
| 6 | `⌘K` kbd 已渲染，快捷键行为未核实 | `library.tsx:138` |
| 7 | 命中区已达标（粗指针 44×44），细指针仍为视觉条 20×4 | `components.css:1022-1026`；实测 `docs/testing/20261121-123009-after-metrics.json` |
| 8 | Composer 切换按钮隐藏方式为 `opacity: 0`（仍可聚焦） | `components.css:1003`（无 `visibility`/`tabindex`/`disabled`） |
| 9 | 右栏 ≤1024 全隐藏（投影不可读） | `components.css:522-524`（与 `:354-356` 同义） |
| 10 | 右栏另两个图标按钮可点但无行为（假可用） | `library.tsx:730-734` |
| 11 | 组件画廊未登记 `Sidebar` / `OverviewPanel`（RightPanel）/ `ExecutionGroup`；无 `ConfirmDialog` | `frontend/src/gallery.tsx:2-23` 导入列表 + 全文无这三个 Section；`manifest.json` 有 `Sidebar`/`ExecutionGroup` 条目但画廊未展示 → 违反 `DESIGN.md` §5.2 |
| 12 | 无 768 档截图证据（产品 A4 要求 375/768/1280） | `frontend/review/` 285 张中无 `*768*`（glob 结果仅 375/1180/1280/1600/1920） |
| 13 | 5 个 COMP 契约已按现状契约化，且全部 accepted（2026-11-22 复签） | 见 `specs/COMP-*/spec.md`（5 个组件 spec 状态均为 accepted） |
| 14 | 旧 `Timeline`（22px）仍导出、仍在画廊，但页面已用 `TimelineGroups` | `library.tsx:360-422`；`gallery.tsx:19`、`:76`、`:125` |
| 15 | 原型 `frontend/prototype/gallery.html` 仍用旧类与旧文案（`Enter 发送 · Shift+Enter 换行`、右栏"当前会话/消息/模型"、刻度带原生 `title`） | `frontend/prototype/gallery.html:84`（title）、`:89`（文案）、`:105-111`（右栏） |
| 16 | 卡片标题 700 字重（违反 `DESIGN.md` 不用 700） | `components.css:497` |
| 17 | 代码块底色裸 hex `#101218` | `components.css:149-150` |
| 18 | 会话行 hover-only ⋯ 在触摸设备不可达 | `components.css:774-775` |
| 19 | 深层树（≥4 级）无视觉区分方案（本节选择 3 级封顶的代价） | §1.1 算式；现状每级 24 无封顶 `components.css:446` |
| 20 | 搜索命中的会话若在折叠父链下，用户看不到命中（未设计自动展开/面包屑提示） | 本节明确"阶段 1 不自动展开"（§3.2），作为已知取舍登记 |

---

## 16. 变更记录

| 版本 | 日期 | 变更 | 依据 | 影响 |
|---|---|---|---|---|
| v0.10 | 2026-11-26 | 按 CHG-CONV-007 独立验收结论补齐 `AC-CONV-009-03`、`04`、`15`、`16` 对应的判据：新增 `V-CONV-009-46` 至 `V-CONV-009-49`，写进 §17.12，不新增交互；判据 45 条增至 49 条，§0.1 索引同步 | 产品 §4.6 的 `AC-CONV-009-03`、`04`、`15`、`16`（`specs/product/P1-CONV/spec.md:348`、`:349`、`:365`、`:366`）；既有设计口径 §17.3.2、§17.5.3、§17.4.3、§17.8.2 与 §17.7；变更包 `specs/changes/CHG-CONV-007/evidence.md` §1 | 设计列 4 条 AC 由无判据变为各至少 1 条判据，与产品、前端、测试、契约的 18 条覆盖一致 |
| v0.9 | 2026-11-26 | 按 DEC-37 把 §17.2.1 的「160ms 宽度过渡」改为「容器宽度立即落位，内容层 160ms 淡入与位移」；§17.2.7 锚点表 `aside.inspector` 行与 `V-CONV-009-1` 的同类表述同步改为宽度立即落位；判据仍 45 条、节号不变 | DEC-37（`docs/plan/DECISIONS.md`）；实现 `frontend/src/components/components.css:1150-1156` 的 `transition: none` 与注释；`AC-CHG-CONV-007-05` 31 条、`AC-CONV-009-08` 16 条稳定通过 | 右栏几何在点击后立即成立，不再有宽度过渡的中间态；面板内容的淡入与位移保留，判据数值与断言条数不变 |
| v0.8 | 2026-11-25 | 按 DEC-35 写实 760–1023 档抽屉：`V-CONV-008-6` 补「280 宽、`position: fixed`、不参与布局、右缘贴竖条」；§17.10 的抽屉右缘由「右贴 16」改为「右贴竖条 40」，与 `components.css` 的 `right: var(--rail-strip)`、768 档实测详情右缘 728 一致；按 DEC-36 在 §17.3.2 补概览任务块边界，沿用可点行结构（块头 `button.insp-block-head`、行 `.exec-row`），不渲染 `.task-card`，厚卡只属于任务标签、消息卡只属于消息流；旧三组结构的 `button.exec-head` 不再作概览锚点，4 条断言按四节锚点重签；判据 45 条、节号不变 | DEC-35、DEC-36（`docs/plan/DECISIONS.md`）；已签收 `V-CONV-008-6`（本文件 :554）；产品 §4.6 行为 5 至 7（`specs/product/P1-CONV/spec.md:326-328`）；契约 CT-CONV-543（`specs/contract/CONV/contract.md:358`） | 768 档口径统一为 rail 40、panel 280、抽屉 fixed 不占布局；契约侧「768 展开同 1280」作废，AC-05 脚本期望改为 rail 40 / panel 280 / detailRight 728；概览任务块保留行结构，4 条断言按四节锚点重签（测试文件本轮不改） |
| v0.7 | 2026-11-25 | 按 `MX-G-30` 把文件引用与 DOM 选择器分开：§0.1 表头「产品锚点」改为「产品出处」（该列装的是产品文件与行号引用）；新增 §17.2.7「DOM 锚点」，五个锚点与前端 §17.2.1 的选择器表、契约表 CT-CONV-301 至 CT-CONV-305 逐条对齐；判据 45 条不变，§0.1 判据数不变，节号不变 | 契约告警 `MX-G-30` 原文；契约表 `specs/contract/CONV/contract.md` 类 5；前端 `specs/frontend/P1-CONV/spec.md:1051-1057` | 设计列的选择器集合由文件引用变为五个真实 DOM 锚点，与前端列相等；§17.2 新增 17.2.7，其余小节编号不动 |
| v0.6 | 2026-11-23 | 按用户 2026-11-23 裁决把宽档计划详情从「盖中栏＋右栏面板」改为「只盖中栏」：§17.5.1 右缘改贴右栏面板左缘（面板展开为视口宽减 320、收起为视口宽减 40），宽度等于剩余中栏宽，右栏面板 280 与竖条 40 在详情打开期间保持可见、点击生效；§17.10 三行宽档表与说明同步；`V-CONV-009-22` 重写为左缘、右缘两档、顶 90、底视口底各 ±0 的采样，`V-CONV-009-45` 改为右栏边界不变与面板内按钮各点 1 次生效，`V-CONV-009-39` 同步右缘口径，顶栏任务图入口断言并入 `V-CONV-009-32`；§17.13 删除 1 条未决并转记已裁项第 4 条，未决项由 1 条降为 0 条；判据仍 45 条，§0.1 索引 45 不变；节号不变 | 用户 2026-11-23 裁决（详情是盖中栏，不是盖中栏＋右栏面板；右栏任务入口在收起状态下仍要可见可点）；前端 `specs/frontend/P1-CONV/spec.md:1042` 的 D-17-01、`:1293` 的入口选择器；`F-CONV-009-17` | 设计列左右上底四处边界与 D-17-01 的「宽度等于中栏宽度」「右栏宽 320 可见」对齐；前端 `D-17-01`、`F-CONV-009-17` 需从「右栏被覆盖、仅 40 竖条可见」改为「右栏 280 面板加 40 竖条可见可点」；v0.5 行保留为历史记录 |
| v0.5 | 2026-11-23 | 按用户 2026-11-23 口径把计划详情从覆盖右栏面板 280 改为覆盖中栏、右缘到 40 竖条左缘：§17.5.1 与 §17.10 写明 ≥1024 左缘贴侧栏右缘、右缘贴 40 竖条左缘、顶边距视口顶 90、底边贴视口底，760–1023 覆盖抽屉内容区、inset 0、宽等于抽屉宽，<760 不渲染；§17.5.3 与 `V-CONV-009-27` 的「距面板 28」改为「距详情左缘 28」；§17.8.1 补顶栏任务图入口（`button.topbar-task-graph[aria-label="任务图"]`，高 28、16×16 图标加「任务图」文案、任务数 ≥1 才渲染）；`V-CONV-009-22`、`V-CONV-009-39` 按新口径重写，新增 `V-CONV-009-45`；判据 44 条增至 45 条，§0.1 索引同步；未决项 0 条增至 1 条（宽档面板可见性）；节号不变 | 用户 2026-11-23 要求（详情右侧滑出盖中栏、顶栏任务图入口）；前端 `specs/frontend/P1-CONV/spec.md:1042` 的 D-17-01 与 `:1293` 的入口选择器；原型 `docs/design/task-prototype-v3-20261123.html:421` | 设计列与前端 D-17-01 的左右上底四处边界一致；D-17-01 的「宽度等于中栏宽度」与边界差（视口宽减 280，含面板 280）不符，「右栏任务标签保持可见」按 40 竖条任务图标成立；`F-CONV-009-17` 的「右栏宽 320 可见」需改为 40 竖条可见；前端 §17.8 的零任务 aria-disabled 态需改为不渲染 |
| v0.4 | 2026-11-23 | 按 DEC-30/31 与产品回写对齐 §17：§17.4.5 与 `V-CONV-009-19`、`V-CONV-009-20` 改为四态任务卡都可点可聚焦，失败说明仍最多 3 行静态省略；§17.9.2 与 `V-CONV-009-37` 补等待确认的「确认」「取消」与等待资源的「等待资源」「恢复」卡内联入口，详情保持 0 入口，`V-CONV-009-41` 同步超时与等待入口的计数口径；§17.3.4 与 `V-CONV-009-10` 把落点零点统一为滚动口顶，174/182 保留为布局常量；§17.13 三条未决项全部改为已裁，未决项 0 条；判据仍 44 条，节号不变，不改 §1–§16 正文（§16 仅追加本行） | `docs/plan/DECISIONS.md` DEC-30、DEC-31（`:128-129`）；DEC-27（`:122`）；产品 spec `specs/product/P1-CONV/spec.md:326`、`:339-340`、`:350-351`、`:355-358` | 设计列与产品裁决一致：四态可点只读、筛选不单列未开始、落点按滚动口顶采样；未决项由 3 条降为 0 条 |
| v0.3 | 2026-11-23 | 追加 §17「会话内任务与编排」：右栏三标签与 40 竖条、概览四块、任务厚卡、计划详情、边做边想详情、交付物标签、任务图弹窗、消息流任务卡、四档断点、44 条 `V-CONV-009-*` 判据、待新增 4 个 token 与 3 条未决项；§0.1 索引加 §17 行并把判据数改为 44，§0.2 骨架与 §0.3 档位表的右栏宽同步为 320；§8.1、§8.4 回写 280+40=320，取代原 300 口径；任务图节点四态可点为只读跳转，汇总卡上限 10 条；不改 §1–§7、§9–§15 正文 | 产品 spec `specs/product/P1-CONV/spec.md:310-353` 与 `AC-CONV-009-01..18`；`docs/plan/DECISIONS.md:121-124` 的 DEC-26..29；已确认原型 `docs/design/task-prototype-v3-20261123.html`（九屏）；`frontend/src/styles/tokens.css:2-163` | 设计列覆盖 `PRD-CONV-009`；§8 与 §17 只保留 320 一套右栏数值；已完成胶囊在 `--success-ink` 落地后达标（当前 4.42:1 的缺口见 §17.13）；任务图节点可点范围按只读跳转收口；剩余未决项 3 条 |
| v0.2 | 2026-11-21 | 按 Lead 裁决与实测对齐：§7.1 刻度改为"视觉 20/24×4 + 粗指针 44×44 命中区"（删 44×20 重排方案）；§7.3 #1/#5、§13 #8、§15 #7 同步；祖先组统称"组级 .55、组内 active 不额外提亮"（V-3 与 §7.1 表同步）；§14.1 四个 COMP 契约状态按 2026-11-21 契约化事实改写；§15 #13 改写 | Lead 裁决（m00356）；`components.css:1022-1026`；`docs/testing/20261121-123009-after-metrics.json`；`specs/COMP-*/spec.md` | 命中区与祖先透明度不再与本 spec 冲突；COMP 状态引用统一 |
| v0.1 | 2026-11-21 | 新建 `specs/design/P1-CONV/spec.md`：13 节（§0 索引 + §1–§12 逐 PRD）+ §13 冲突清单（11 条）+ §14 与 COMP 契约的关系 + §15 已知缺口（20 条）+ §16 本表。11 节有实质内容、1 节 `N/A`（`PRD-SYNC-001`，理由见 §9）。共 54 条 `V-*` 视觉判据。 | `specs/product/P1-CONV/spec.md`（34 AC）、`specs/changes/CHG-CONV-006/product.md`（六条默认裁决）、`DESIGN.md` + `tokens.css`（视觉基线）、`docs/plan/MASTER-PLAN.md` §1.7（长期 Spec 粒度） | 设计列从缺到有；`specs/design/` 目录首次建立 |

**后续修订入口**：每次变更由 `specs/changes/CHG-CONV-*/` 显式声明"改了本文件哪一节、对应哪个 PRD"（`MASTER-PLAN` §1.7 末条），并在本表追加一行；本节不随 CHG 归档而删除。

---

## 17. 会话内任务与编排

### 17.1 范围、事实来源与 §8 的关系

本节覆盖 `PRD-CONV-009` 的右栏三标签、概览四块、任务厚卡、计划详情、边做边想详情、任务图弹窗、消息流任务卡，以及 1600/1280/1180 与 760–1023 四档断点下的行为。产品锚点为 `specs/product/P1-CONV/spec.md` §4.6 与 `AC-CONV-009-01..18`；形态锚点为已由用户确认的原型 `docs/design/task-prototype-v3-20261123.html` 九屏（s1/s2 概览、s3 任务、s4 交付物、s5/s6 计划详情、s7 边做边想、s8 任务图、s9 收起态）。

右栏沿用 §8 的「图标条 + 面板」壳，三个标签共用同一套壳。宽度按产品 `AC-CONV-009-08` 定为面板 280 加竖条 40，合计 320；§8 原写的「40 图标条 + 260 内容区 = 300」是阶段 1 概览面板的旧口径，本轮已回写为 280 + 40 = 320（§8.1、§8.4），1280 与 1600 两档的面板由 260 调整为 280、总宽由 300 变为 320，1024–1180 档与 §8 实测的 280 一致。§8 与 §17 不再保留第二套数值。

右栏是只读投影：任务、步骤、轨迹、交付物都不提供重试、取消、编辑、删除入口；可写入口只有消息流里的对话，以及交付物行的「打开」。状态变化只来自对话执行，右栏不产生任务状态。

### 17.2 右栏壳：三标签与 40 竖条

#### 17.2.1 结构与尺寸

右栏固定贴窗口右缘，分两列：面板 280 在左，竖条 40 在右，两者之间无间隙、无分隔线。展开态右栏总占 320；收起态面板宽 0，右栏只占 40，中栏随之扩张。容器宽度立即落位，不做宽度过渡；内容层 160ms 淡入与位移，减少动态偏好时无动效。

面板自上而下为面板头 44、标签内容区、面板脚 28。面板头左右内边距 14 与 10；标签内容区独立滚动；面板脚固定，顶部 1px `--line-soft`，字号 10.5，左右内边距 14，文字 `--muted`。

竖条宽 40，顶部内边距 8，按钮间距 4；三个按钮各 32×32、圆角 7、图标 18×18，水平居中。竖条底色 `--surface`，左缘 1px `--line`，与面板交界处不画线。

#### 17.2.2 图标顺序与当前态

三个按钮自上而下固定为概览、任务、交付物，图标依次为田字格、清单勾选、文件夹，统一 18×18、1.5 描边。当前标签的按钮底色 `--accent-soft`、图标 `--accent`，左缘内 2px 处一条 2×18 的 `--accent` 竖条，上下各缩进 9；非当前按钮底色透明、图标 `--faint`，悬停底色 `--surface-2`、图标转 `--ink-2`。

当前标签按钮在面板展开时展开状态为真、收起时为假，视觉当前态不随收起消失；其余按钮展开状态为假。可朗读名称依次为「概览」「任务，N 个进行中」「交付物」，N 为当前会话进行中任务数，N 为 0 时朗读「任务」不带数量。

#### 17.2.3 任务角标

角标只挂在任务按钮上，锚定按钮右上角，向上、向右各溢出 3px。角标最小宽 14、高 14、左右内边距 4、圆角 8，底色 `--accent`、文字 `--paper`、字号 9.5、数字等宽；1.5px `--surface` 描边把它与图标分开。计数 1 到 9 显示数字，10 及以上显示「9+」，0 不显示角标。角标不随面板收起消失，也不随标签切换改变颜色。

#### 17.2.4 切换、收起与展开

点击非当前标签，面板内容在 120ms 内替换，标签态与角标立即更新；点击当前标签不切换内容，只把面板从收起态展开。面板头的收起按钮与「点击当前标签」是同一个开关：展开时点任一处收起，收起时点任一处展开。收起保留当前标签与列表滚动位置；收起时若详情正打开，先关闭详情并把焦点交给该任务卡，再收起面板。再次展开回到同一标签与同一滚动位置，不恢复已关闭的详情。

面板收起后中栏扩张，Composer 与消息流宽度同步变化；面板内元素退出布局，也不再进入 Tab 序列。

#### 17.2.5 键盘与焦点

Tab 进入右栏的顺序是：概览、任务、交付物三个竖条按钮，然后面板头的收起按钮，再进入面板内容区的可聚焦元素，最后离开右栏；面板收起时跳过面板头与面板内容，只剩三个竖条按钮。Enter 与 Space 在竖条按钮上执行切换或展开，在收起按钮上执行收起。焦点环统一为 2px `--focus`、外偏移 2。

Esc 在详情打开时关闭详情并把焦点还给来源任务卡；在任务图打开时关闭任务图并把焦点还给打开它的入口；没有浮层时 Esc 不收起面板。详情与任务图打开期间，Tab 循环限制在浮层内，背景内容不可聚焦。

#### 17.2.6 面板头与面板脚

面板头左侧是标签名（12.5、字重 650）与计数（10.5、`--muted`，与标题间距 6），右侧是 26×26 的收起按钮，图标 16×16、箭头指向右。计数按标签取「4 个小节」「11 个」「4 个」。面板脚左侧写投影说明，概览为「只读投影 · 随任务更新」，任务为「共 N 个任务」，交付物为「共 N 个文件」；右侧写最近更新时间 HH:MM，字号 10.5、`--muted`。

#### 17.2.7 DOM 锚点

右栏壳的五个稳定锚点与前端 §17.2.1 的选择器表逐条对应，值相同、顺序相同，契约表 `specs/contract/CONV/contract.md` 的 CT-CONV-301 至 CT-CONV-305 登记同一组值。锚点取结构性选择器加 aria，不用动态类名，改版时这三个来源同批改。

| 锚点 | 元素 | 视觉部位 |
|---|---|---|
| `nav.insp-rail[aria-label="右栏导航"]` | 竖条 | 宽 40，三个 32×32 按钮 |
| `div.insp-head` | 面板头 | 高 44，左侧标签名与计数，右侧收起按钮 |
| `div.insp-body#insp-panel[role="region"]` | 标签内容区 | 宽 280，独立滚动 |
| `div.insp-foot` | 面板脚 | 高 28，左说明右更新时间 |
| `aside.inspector` | 整栏外壳 | 展开 320、收起 40，宽度立即落位（内容层 160ms 淡入与位移） |

### 17.3 概览标签：四个可折叠小节

#### 17.3.1 整行标题

四块都以整行标题作为折叠开关，行高 40，左右内边距 14 与 10，栅格为标题 1fr、计数 auto、箭头 16，列间距 12。标题 12.5、字重 600、`--ink`；计数 10.5、`--muted`，与标题间距 6，文案随块变化为「1 条」「3 项」「11 个」「4 个」；箭头 16×16、`--faint`，展开时顺时针旋转 90 度并转 `--accent`，旋转 180ms。块与块之间 1px `--line-soft`，标题行悬停底色 `--surface-2`。

#### 17.3.2 四块顺序与内容

四块固定为：目标、输入、任务、交付物，顺序不随内容变化。

目标块正文为一段 12、行高 1.6、`--ink-2` 的文字，只显示本会话的 1 条目标，最多 3 行，超出省略。

输入块正文为一段 12、行高 1.6、`--ink-2` 的文字，先列约束、再列输入项，两者都为空时显示空态；最多 3 行，超出省略。历史消息不进入这一块，启动时带入的历史消息为 0 条，计数只算本次启动时带入的目标与约束。

任务块内容先是一行四态计数，再是最多 2 行任务，最后是「还有 N 个」。四态计数为「2 进行中 / 5 未开始 / 3 已完成 / 1 失败」，数字 11、字重 650，依次用 `--accent`、`--muted`、`--success`、`--danger`，单位文字 10.5、`--muted`，四项间距 12。任务行高 26，行内为 6px 状态点（进行中 `--accent`、已完成 `--success`、未开始 `--faint`、失败 `--danger`）、11.5 的任务名、右侧 10.5 的 `--muted` 摘要（计划任务写「计划 · 5/8 步」，边做边想任务写「边做边想 · 14 条」），行顶部 1px `--line-soft`。排序为进行中、失败、未开始、已完成，同状态按更新时间倒序，最多 2 行。任务块沿用可点行结构（块头 `button.insp-block-head`，任务行与交付物行 `.exec-row`），不渲染任务厚卡 `.task-card`；厚卡只属于任务标签（§17.4），消息流任务卡只属于消息流（§17.9）。旧三组结构的 `button.exec-head` 不再是概览锚点，签收测试的 4 条断言按本节四节锚点重签。（DEC-36）

交付物块每行 28 高，行内为 28×18 的类型徽标、11.5 的文件名（单行省略）、10.5 `--muted` 的时间。类型徽标字号 10、圆角 4：文档为 `--surface-2` 底 `--ink-2` 字，表格为 `--success-soft` 底 `--success-ink` 字，图片为 `--accent-soft` 底 `--accent` 字。最多 2 行，超出显示「还有 N 个」。

#### 17.3.3 折叠记忆与整栏滚动

四块各自独立折叠，互不联动。折叠状态按会话记忆：刷新页面后保持，切到另一会话再切回保持，另一会话首次打开时四块全部展开。四块全展开时工具栏显示「全部收起」，任意一块收起时显示「全部展开」；点击后四块一起切换，并写入当前会话的记忆。工具栏高 30、左右内边距 14，左侧说明 10.5 `--muted`，右侧按钮 10.5 `--accent`、命中区高 24。

面板内容区整栏连续滚动，不出现分页器、「加载更多」或页码；面板头与面板脚不随内容滚动。四块全部收起时，内容区只剩四条 40 高的标题行，其余空间留白。

#### 17.3.4 空态与「还有 N 个」

某块计数为 0 时，正文显示一行居中占位，字号 11、`--muted`、上下内边距 16：目标为「本会话还没有目标」，输入为「还没有带入输入」，任务为「还没有任务」，交付物为「还没有交付物」。空态不显示「还有 0 个」，标题行计数显示「0 条」「0 项」「0 个」「0 个」。

「还有 N 个」是整行按钮，高 28、左对齐、字号 10.5、颜色 `--accent`，文案后跟 16×16 箭头；任务块的按钮切到任务标签，交付物块的按钮切到交付物标签。切换后目标列表滚到第一个未显示项，该项成为列表可见首行；其顶边与列表滚动口顶边的距离为 0–8px，采样为 `target.getBoundingClientRect().top − scroller.getBoundingClientRect().top`，点击后 500ms 取样，容差 ±1px。目标项显示一次 2px `--focus` 焦点框，焦点同时移到该项。

落点基准取列表滚动口的顶边，也就是列表内容区的顶部，它是唯一的采样零点，不以视口顶为零点。右栏从应用内容区顶（`--topbar` 48 加上下文栏位 42，合计 90）起算，面板头 44 与筛选条 40 是面板常驻头，位于列表滚动口上方；宽档滚动口顶边在视口顶下方 174（=48+42+44+40），760–1023 档抽屉从 `.context` 下 8 起算，滚动口顶边为 182（=48+42+8+44+40）。这两个数值只用于定位滚动口，不参与落点判据计算。目标项落在滚动口内距顶 0–8px 处，判据按上面的采样式与 ±1px 容差核对。

### 17.4 任务标签与任务厚卡

#### 17.4.1 面板头、筛选条与列表

面板头为「任务」加「11 个」。筛选条吸顶，高 40，左右内边距 10、上下内边距 8，四个筛选片间距 4，按钮高 24、圆角 6、字号 10.5、左右内边距 8。四个筛选片固定为「全部 11」「进行中 2」「失败 1」「已完成 3」，计数用 600 字重；未选中为透明底、1px `--line` 边框、`--ink-2` 字，悬停底色 `--surface-2`；选中为 `--ink` 底、`--paper` 字、无边框。切换筛选在 100ms 内完成，列表回到顶部，筛选条下方 1px `--line-soft`。

任务列表左右内边距 10、上内边距 9、下内边距 10，卡片间距 8。列表滚动时面板头与筛选条不动。

#### 17.4.2 厚卡结构

卡片为整块可聚焦容器，圆角 10、1px `--line` 边框、内边距 10 11 9 12；左缘内 2px 处一条 2px 宽的状态条，上下各缩进 11。状态条颜色按状态：进行中 `--accent`、已完成 `--success`、未开始 `--surface-2`、失败 `--danger`。

卡头为任务名与状态胶囊：任务名 12、字重 600、单行省略；状态胶囊高 18、圆角 5、左右内边距 10、字号 10、字重 550，进行中为 `--accent-soft` 底 `--accent` 字，已完成为 `--success-soft` 底 `--success-ink` 字，未开始为 `--surface-2` 底 `--muted` 字，失败为 `--danger-soft` 底 `--danger` 字。

卡头下一行是元信息，字号 10.5、`--muted`，依次为模式标签、分隔点、产出数「产出 3 个」。模式标签高 16、圆角 4、左右内边距 5、字号 9.5：计划为 `--surface-2` 底 `--ink-2` 字，边做边想为 `--accent-soft` 底 `--accent` 字；与状态胶囊间距 6，与产出数间距 8。等待前置的任务在这一行末尾加一枚等待标签「等待全部」「等待任一」「等待每个」，高 16、`--warning-soft` 底 `--warning` 字；不处于等待时不显示。

计划任务在元信息下画步骤刻度，边做边想任务改为最近一条循环轨迹，两者二选一。

#### 17.4.3 步骤刻度与卡脚

刻度条高 3，段间 2，段宽相等，总宽等于卡片内容宽。段数取步骤总数，最多 12 段；步骤数超过 12 时按每段 ceil(N/12) 步归并为 12 段，任一段包含失败步骤时该段用 `--danger`，包含当前步骤时用 `--accent`，全部完成的段用 `--success`，其余 `--surface-2`。

刻度条下是卡脚，字号 10.5：左侧「已完成 5/8 步」用 `--muted`；右侧进行中写「第 6 步 · 进行中」用 `--accent`，已完成写「完成于 15:40」用 `--muted`，未开始写「等待前置」用 `--muted`，失败写「失败于 15:36」用 `--danger`。

#### 17.4.4 计划卡摘要与边做边想卡

计划卡在卡脚下显示最多 3 行步骤摘要，每行 22 高、顶部 1px `--line-soft`：左侧 16px 标记（已完成用 `--success` 勾、进行中用 `--accent` 实心点、未开始用 `--line` 空圈），中间 11.5 的步骤名单行省略，右侧 10.5 的 `--muted` 摘要（「产出 1」或「进行中」）。摘要之后是整行「查看全部 8 步」，高 24、字号 10.5、`--accent`、后跟 16 箭头。

边做边想卡在卡脚下放最近一条轨迹块，底色 `--paper`、圆角 6、内边距 8、上间距 6：首行是 16 高的类别标签（思考、动作、观察）、等宽工具名、右侧 10.5 时间；下一行 10.5、`--ink-2`、最多 2 行。块后是「查看循环轨迹」，高 24、字号 10.5、`--accent`、16 箭头。

#### 17.4.5 失败卡与可点规则

失败卡在卡脚后加一行失败说明，底色 `--danger-soft`、圆角 6、内边距 6 8、字号 10.5、`--danger`，文案以「失败：」开头，最多 3 行，超出省略。

四态卡片都可点、可聚焦，整卡是按钮，悬停边框转 `--accent-line`，聚焦显示 2px `--focus` 焦点框；点击打开只读详情 1 次。打开详情后该卡边框转 `--accent-line` 并带 2px `--accent-soft` 外光晕，卡片与详情同时可见时保持这个标记。失败卡的失败说明仍最多 3 行、超出静态省略，不在卡面展开，但整卡照常可点；未开始卡同样可点，详情按 §17.5 呈现步骤，未开始步骤行保持 §17.5.2 的样式。点击只进入详情，任务状态差 0、事件条数差 0、写请求 0 条（DEC-30）。

#### 17.4.6 超时提醒

任务超过预计时长时，只在卡脚右侧增加 10.5、`--warning` 的「已超出预计 12 分钟」，状态胶囊、状态条、筛选计数都不变，也不出现取消入口。超时文案在任务结束后消失。

### 17.5 计划详情

#### 17.5.1 容器与头部

计划详情是从右侧滑出、盖住中栏的只读浮层，底色 `--surface`，左缘 1px `--line`，阴影 `--shadow-float`，在 150ms 内自右向左进入。视口 ≥1024 时 `position: fixed`：左缘贴侧栏右缘、右缘贴右栏面板左缘、顶边距视口顶 90（`--topbar` 48 加 `--context` 42）、底边贴视口底，宽度等于剩余中栏宽。右栏面板展开（面板 280 加竖条 40，总占 320）时右缘位于视口宽减 320，面板收起（只剩竖条 40）时位于视口宽减 40；两种状态下详情都不覆盖右栏，面板 280 与竖条 40 在详情打开期间保持可见、点击生效，键盘焦点仍按 §17.2.5 限制在详情内。760–1023 时详情绝对定位于抽屉内容区，`inset: 0`，宽度等于抽屉宽 `min(280, 100vw − 32)`，关闭详情回到抽屉列表而不是收起抽屉。小于 760 不渲染详情，`section.task-detail` 元素数为 0。详情头高 44，左右内边距 18，左为「任务详情 · 计划」10.5 `--muted` 与「只读」徽标（高 16、圆角 4、`--surface-2` 底 `--muted` 字、字号 9.5），右为 24×24 关闭按钮。打开时焦点落在关闭按钮（由任务图节点跳转打开时改落对应步骤行，见 §17.8.2），Tab 循环限制在详情内，Esc 关闭并把焦点还给来源任务卡（由任务图节点打开时还给任务标签中该任务的卡片）。

详情头下依次是任务标题（18、字重 650，最多 2 行）、状态胶囊（同卡头）、元信息一行（10.5、`--muted`，写「所属会话 · 产品周会纪要 · 8 步 · 已完成 5 · 3 个产出」）、提示条（`--accent-soft` 底、圆角 6、内边距 6 8、10.5、`--ink-2`，写「当前第 N 步进行中，展开的轨迹只读」）、节标签「步骤」（10、字距 0.06em、`--muted`）。正文区独立滚动。

#### 17.5.2 单列步骤

每一步一行，单列排列，行左缩进 12，最小高 30，栅格为 16px 状态标记、1fr 步骤名、auto 摘要、12px 箭头，列间距 8。

已完成步的标记为 `--success` 勾，箭头为 16 的下箭头，行可点、可聚焦；点开后在该行下方展开内联轨迹，箭头转 90 度，内联轨迹头右侧写「已归档 · 可收起」，脚注写「这一段随步骤结束归档，收起不丢记录」。

当前步默认展开：行底 `--accent-soft`、左缘 2px `--accent`，标题字重 600，箭头朝下，摘要写「轨迹 8 条 · 进行中」并用 `--accent`；内联轨迹紧接该行，头右侧写「只读 · 最新在最后」。当前步可以手动收起，收起后行下出现一行 10.5 `--muted` 的提示「当前步已收起，点这一行重新展开」，箭头转向右。

未开始步只有 16px 空圈与步骤名，颜色 `--muted`，没有箭头、没有摘要、没有可点样式，也不进入 Tab 序列；只有任务图节点跳转落到该行时，接受一次性程序聚焦（`tabindex="-1"` 加一次 2px `--focus` 框），聚焦不改变该步的展开状态。失败步的行可聚焦，节点跳转同样只滚动与聚焦，不自动展开轨迹。状态标记的四种形态：已完成 `--success` 勾、进行中 `--accent` 实心点、失败 `--danger` 叉、未开始 1.5px `--line` 空圈。

#### 17.5.3 内联轨迹

内联轨迹块相对步骤行再缩进 16px，左缘距详情左缘 28，顶部内边距 6、底部 8、右侧 12。块左缘画 1px `--line-soft` 竖线，从第一条轨迹标签的顶边贯通到最后一条轨迹标签的底边；正文起点距竖线 12。

每条轨迹一行，栅格 32px 类别标签、1fr 正文、45px 时间，列间距 6，行间距 4。类别标签高 15、圆角 3、字号 9.5、居中：思考为 `--surface-2` 底 `--muted` 字，动作为 `--accent-soft` 底 `--accent` 字，观察为 `--success-soft` 底 `--success-ink` 字。动作行在标签后跟等宽工具名，字号 9.5、1px `--line` 边框、圆角 3、左右内边距 4。工具调用成功后记 1 条观察；越权调用被拒绝时仍记 1 条观察，标签改用 `--danger-soft` 底 `--danger` 字，正文以「403」开头。正文 11、行高 1.5、`--ink-2`，最多 4 行，超出时在行尾显示「展开」，展开后完整显示；只有正文被截断时才有这个入口。时间 9.5、等宽、数字等宽、右对齐、`--muted`，格式 HH:MM:SS，同一秒内按发生顺序排列。

#### 17.5.4 长步骤名

步骤名单行省略。发生截断时，行尾在箭头左侧出现 12×12 的下箭头按钮，可朗读名称为「展开步骤名」，点击后步骤名最多展开为 3 行，箭头转向上；再次点击收起为 1 行。展开步骤名不改变该步轨迹的展开状态，也不改变行高以外的布局。

### 17.6 边做边想详情

边做边想详情与计划详情共用容器、头部尺寸、关闭方式与焦点规则，差异如下。头部第二行写「任务详情 · 边做边想」，提示条改为模式说明，底色 `--accent-soft`、左缘 2px `--accent`，写「边做边想没有固定步骤，按时间顺序记录每一次思考、动作与观察」。元信息写「循环轨迹 14 条 · 产出 1 个」。

正文只有一条扁平时间线：节标签写「循环轨迹」，右侧 10.5 `--muted` 写「14 条 · 正序」；下面 14 行按时间正序排列，没有步骤节点、没有分组、没有任何展开入口。每行栅格 32px 类别标签、1fr 正文、46px 时间，列间距 7，上下内边距 4，行间 1px `--line-soft`；正文 11.5、行高 1.5、`--ink-2`，不截断。类别标签与工具名的样式同 §17.5.3。时间 9.5、等宽、右对齐、`--muted`，格式 HH:MM:SS。

当前动作固定在最后一行：行底 `--accent-soft`、左缘 2px `--accent`，类别标签反转为 `--accent` 底 `--paper` 字，正文 `--ink`。打开详情时列表滚到最底部，最新一行完整可见；时间戳单调不减，同一秒内保持发生顺序。

### 17.7 交付物标签

面板头为「交付物」加「4 个」，其下一行说明为「4 个文件 · 2 个任务」与「按任务分组」，字号 10.5、`--muted`。正文按任务分组，组间 12，组头高 28，行内为 6px 状态点、11.5 的任务名、状态胶囊、右侧 10.5 `--muted` 的文件数。

文件行高 30，行内为 28×18 的类型徽标（文档、表格、图片，配色同 §17.3.2）、文件名 11.5 单行省略、元信息 10.5 `--muted`（「15:41 · 4.2 KB · 更新中」）、右侧「打开」按钮（高 24、字号 10.5、`--accent`、命中区 32×24）。下载完成前元信息末尾显示「更新中」，完成后显示文件大小；点击「打开」触发下载，实际字节数与元信息显示的大小一致。

失败任务分组没有文件时，显示一张虚线说明卡：1px 虚线 `--line`、圆角 6、内边距 8、字号 10.5、`--muted`，写「没有生成文件。任务在第 5 步写入初稿时失败，临时文件不计入交付物」。该组文件数显示「0 个」，不显示「打开」。

### 17.8 任务图弹窗

#### 17.8.1 尺寸、遮罩与开合

任务图入口固定在顶栏右侧工具区的最左端，连接点与文案、设置按钮、头像依次排在其右侧，控件间距 12。选择器为 `button.topbar-task-graph[aria-label="任务图"]`：高 28、左右内边距 10、圆角 7、1px `--line` 边框、`--surface` 底；内容为 16×16 的三节点两连线图标（1.5 描边、`currentColor`）与 11.5 的文案「任务图」，图标与文字间距 6；悬停底色 `--surface-2`、边框 `--accent-line`，`title` 为「查看任务图」，聚焦显示 2px `--focus` 外偏移 2。入口只在会话页且当前会话任务数 ≥1 时渲染；无会话、草稿会话、任务数为 0 以及任务数未知（加载中或加载失败）时元素数为 0 且不占位。点击立即打开任务图弹窗并显示加载态；弹窗打开期间按钮 `aria-expanded="true"`，关闭后为 `false`，Esc 关闭后焦点回到该按钮。

任务图是全应用级弹窗：遮罩覆盖整个应用窗口，颜色取待新增的 `--overlay-scrim`，建议值 rgba(22,23,27,0.34)；弹窗宽 920、最大宽为窗口宽减 64，高 min(620, 窗口高减 80)，圆角 12、1px `--line`、阴影 `--shadow-pop`，在 150ms 内淡入。打开时焦点进入关闭按钮，Tab 循环限制在弹窗内，顺序为关闭按钮、节点按阅读顺序、再回到关闭按钮；Esc、右上 24×24 关闭按钮、点击遮罩三处都能关闭，关闭后焦点回到打开它的入口。

弹窗头高 52，左右内边距 16：标题 15、字重 650，写「任务图 · 产品周会纪要」；副行 10.5、`--muted`，写「本会话 8 个任务 · 3 已完成 · 2 进行中 · 2 未开始 · 1 失败」。头下是图例行，高 32、字号 10、`--muted`、间距 14：四态圆点各 6px（`--success`、`--accent`、`--muted`、`--danger`），加一段 22×8 的虚线样例与文字「前置失败」。

#### 17.8.2 节点与连线

节点 156×64、圆角 8、1px `--line`、内边距 7 9，左缘 2px 状态条（已完成 `--success`、进行中 `--accent`、失败 `--danger`、未开始 `--faint`）。节点内三行：模式行（9、`--muted`，边做边想用 `--accent`）、任务名（12、字重 600、单行省略）、状态行（9.5，状态圆点加「已完成 · 4 步」「失败于第 5 步」「未开始 · 等待前置」「进行中 · 第 6 步」）。

节点不超过 20 个时按 4 列排布，列间距 24、行间距 24，画布宽 860、高 366，超出时画布纵向滚动；超过 20 个时按 §17.8.3 的依赖层规则排布。连线 1.4px、`--line`、终点带箭头；失败节点的下游连线改为虚线，线段 4、间隔 3、`--danger`、不透明度 55%，箭头同色。四态节点数、失败节点数与失败下游虚线数按 `AC-CONV-009-13` 的 8 个节点、1 个失败、1 条虚线核对。

节点是按钮语义，四态节点都可点，包括失败与未开始；悬停边框转 `--accent-line`，指针为 pointer，聚焦显示 2px `--focus` 焦点环。点击节点执行只读跳转：关闭任务图，打开该任务的详情，滚动定位到节点状态行所指的步骤（进行中为第 N 步，失败为失败步，已完成为最后一步，未开始为第 1 步），焦点落到该步骤行并显示一次 `--focus` 焦点框；边做边想节点打开循环轨迹详情，焦点落到当前动作行。跳转不改变任务状态，不展开或收起步骤，不写入任何数据与事件；任务图与详情仍是只读视图，弹窗内重试、取消、编辑、删除入口各 0，关闭入口 1（Esc、右上关闭按钮、点遮罩）。底部脚注 10.5 `--muted` 写「只读跳转 · Esc 关闭」。

原型 s8 的脚注写「进行中的节点可点开详情」，本轮裁决把可点范围扩到四态节点，点击只做只读跳转，不改变任务状态。`AC-CONV-009-07` 的入口计数口径随之改为「节点 N 个加关闭 1 个，重试、取消、编辑、删除各 0」，判据见 `V-CONV-009-35` 与 `V-CONV-009-43`。

#### 17.8.3 超过 20 个节点

节点超过 20 个时按依赖层分行排布：同一依赖层排在同一行组，单层不超过 4 个节点时排 1 行，单层超过 4 个节点时在该层内每 4 个换一行；层与层按依赖顺序自上而下排列，层内按创建顺序从左到右。画布横向与纵向都可以滚动，缩放固定为 1.0，不自动缩放、不分页；节点尺寸、连线与状态配色不随节点数变化。该规则与 `AC-CONV-009-13` 的超限判据一致（21 节点、最大层 5 个：最大层占 2 行、首行 4 个、次行 1 个），进入判据。

### 17.9 消息流里的任务卡

#### 17.9.1 与既有消息的关系

任务卡是消息流里的独立消息类型，左缘与文本消息对齐，最大宽度 720（`--conversation-card-w`），不改变既有消息的字号、行高、间距与颜色。卡片为 `--surface` 底、1px `--line` 边框、圆角 10、内边距 10 12，左缘 2px 状态条（配色同任务厚卡）。卡面与状态条让它在视觉上区别于文本、工具调用与错误消息，既有消息类型的样式与结构保持不变，回归截图逐像素一致。

#### 17.9.2 单个任务卡

卡头为 9.5 的「任务」小标签（`--surface-2` 底、`--ink-2` 字、圆角 4、高 16）、任务名 12.5、字重 600、状态胶囊；下一行是 10.5 `--muted` 的元信息（模式、步骤或轨迹数、产出数）；计划任务再加最多 2 行步骤摘要；失败任务加一行失败说明，样式同 §17.4.5。

常驻可点区域是卡底的「查看任务」，高 24、字号 10.5、`--accent`、后跟 16 箭头，命中区至少 120×24，聚焦时显示 2px `--focus` 焦点框；点击后切到右栏任务标签并打开该任务详情，标签切换与详情打开合并为一次动作。等待用户确认的任务卡在卡内联区增加「确认」「取消」两个按钮，各 1 个，高 24、字号 10.5；等待资源或额度的任务卡在同一内联区显示「等待资源」标记 1 个与「恢复」入口 1 个。两类等待入口只出现在消息流卡片的这一内联区，任务详情保持 0 入口，不破坏 `AC-CONV-009-07` 的详情只读判据（DEC-27）。任务名、状态胶囊、元信息、步骤摘要与卡面空白都不可点、不可聚焦，不显示悬停反馈。

#### 17.9.3 批量汇总卡

同一轮创建多个任务时，消息流只出现一张汇总卡。折叠态为一行：左侧「已创建 N 个任务」（N 为总数，示例 10；12、字重 600），右侧「展开」按钮（10.5、`--accent`、高 24）；卡面另有一行 10.5 `--muted` 摘要，列出前三个任务名并以「等 N 个」收尾。

展开后按创建顺序平铺子条目（默认最多 10 条，超出部分见下），每条 28 高：6px 状态点、11.5 任务名单行省略、右侧 10.5 `--muted` 的模式；条目本身不可点。展开按钮文案变为「收起」，展开状态同步；展开与收起在 120ms 内完成，展开后卡片高度增长，消息流保持当前滚动位置。

单卡展开后最多平铺 10 条；总数超过 10 时，第 11 条起收进「还有 N 条」入口（1 个，N 为剩余条数，如总数 12 时为「还有 2 条」），入口位于第 10 条之后、整行 28 高。点击入口在原位展开全部任务（已显示的 10 条加剩余条目），入口随即消失，展开后不再二次折叠；收起整卡回到一行折叠态，再次展开回到 10 条加入口 1 个，不记住上一次的全部展开。展开与收起不改消息流滚动位置，也不改变任务状态。

### 17.10 断点行为

| 档位 | 竖条 | 面板 | 详情 | 任务图 | 其他 |
|---|---|---|---|---|---|
| ≥1600 | 40 | 280，总占 320 | 盖中栏：左贴侧栏右缘、右贴面板左缘（展开=视口宽−320，收起=视口宽−40），顶 90、底视口底 | 920×620 | 中栏最小 720；筛选条单行；步骤摘要 3 行 |
| 1280 | 40 | 280，总占 320 | 盖中栏：左贴侧栏右缘、右贴面板左缘（展开=视口宽−320，收起=视口宽−40），顶 90、底视口底 | 920×min(620, 窗口高−80) | 中栏最小 560；筛选条单行；步骤摘要 3 行 |
| 1180 | 40 | 280，总占 320 | 盖中栏：左贴侧栏右缘、右贴面板左缘（展开=视口宽−320，收起=视口宽−40），顶 90、底视口底 | 920×min(560, 窗口高−80) | 中栏最小 520；筛选条单行；步骤摘要 3 行 |
| 760–1023 | 40，固定 | 抽屉，宽 min(280, 窗口宽−32)，不占布局 | 覆盖抽屉内容区，`inset: 0`，宽等于抽屉宽 | 全屏，圆角 0 | 中栏占满除 40 外的宽度；抽屉右贴竖条 40、顶贴 `.context` 下 8、底贴 Composer 顶−8、圆角 10、`--shadow-pop` |

760–1023 档沿用 §8.2 的竖条加抽屉规则：竖条常驻，点任一标签从右侧滑出抽屉，抽屉内是完整的三标签面板；点当前标签或点抽屉外的遮罩收起抽屉；抽屉打开时详情覆盖抽屉内容区，关闭详情回到抽屉列表而不是收起抽屉。小于 760 时按 §8.2 的窄屏规则处理，不渲染详情（`section.task-detail` 元素数为 0），任务图入口按 §17.8.1 的可见条件处理，任务图弹窗全屏。

四档下右栏内容区的滚动、概览折叠记忆、任务卡排序与两类详情的行为都不变，只有面板宽度、详情覆盖范围、任务图尺寸与中栏保底宽度随档位变化。宽档详情只盖中栏：面板展开时右缘在视口宽减 320，面板收起时右缘在视口宽减 40；右栏面板 280 与竖条 40 在详情打开期间保持可见、点击生效，键盘焦点仍按 §17.2.5 限制在详情内。

### 17.11 会话切换与边界

切换会话时，右栏保留当前标签与展开状态，面板内容替换为目标会话的数据；任务列表回到该会话上次的滚动位置，首次进入回到顶部。概览、任务、交付物都只显示当前会话的数据，不混入其他会话，也不显示跨会话汇总；会话没有任务时三处都走空态。

任务从进行中变为完成或失败、或取消一个任务后下游任务开始执行时，角标、筛选计数、概览四态计数与任务图节点在 2 秒内更新，详情内的状态胶囊与当前步标记同步更新，等待标签随下游启动消失；已打开的计划详情在步骤推进时自动把新当前步滚入可见区，用户手动收起当前步后不再自动展开。

详情或任务图打开时，右栏与外层页面的滚动锁定，关闭后恢复打开前的滚动位置。同一时刻最多一个浮层，打开任务图会先关闭已打开的详情。

### 17.12 可验收视觉判据

- `V-CONV-009-1` 宽档右栏展开总宽 320±1（面板 280±1、竖条 40±1），收起后总宽 40±1；两态切换时容器宽度立即落位，内容层在 160ms 内完成淡入与位移，减少动态偏好时无动效。（AC-CONV-009-08）
- `V-CONV-009-2` 竖条三个按钮自上而下为概览、任务、交付物，各 32×32、间距 4、顶部内边距 8、图标 18×18，顺序与图标形状与原型 s1 一致。（AC-CONV-009-08）
- `V-CONV-009-3` 当前标签按钮吸色为 `--accent-soft` 底、`--accent` 图标，左缘 2×18 的 `--accent` 竖条上下各缩进 9；其余按钮图标为 `--faint`；面板展开时当前按钮展开状态为真，收起时为假。（AC-CONV-009-10）
- `V-CONV-009-4` 任务角标最小宽 14、高 14、向上与向右各溢出按钮 3px、字号 9.5、1.5px `--surface` 描边；计数 2 显示「2」，11 显示「9+」，0 不显示。（AC-CONV-009-09）
- `V-CONV-009-5` 收起后保留当前标签与列表滚动位置；详情打开时收起面板会先关闭详情并把焦点交给该任务卡；再次展开回到同一位置，不自动恢复详情。（AC-CONV-009-10）
- `V-CONV-009-6` Tab 顺序为三个竖条按钮、面板头收起按钮、面板内容，Enter 与 Space 可切换与收起，Esc 关闭浮层并归还焦点；焦点环为 2px `--focus`、外偏移 2。（AC-CONV-009-08）
- `V-CONV-009-7` 概览标题行高 40，标题 12.5、计数 10.5、箭头 16×16；展开时箭头顺时针旋转 90 度并转 `--accent`，旋转 180ms。（AC-CONV-009-10）
- `V-CONV-009-8` 四块顺序为目标、输入、任务、交付物，各自独立折叠；刷新后折叠状态保持，另一会话首次打开四块全展开；工具栏文案在全展开时为「全部收起」，任一收起时为「全部展开」。（AC-CONV-009-10）
- `V-CONV-009-9` 内容区连续滚动，无分页器、无「加载更多」；四块全收起时只剩四条 40 高标题行，面板头与面板脚固定不动。（AC-CONV-009-10）
- `V-CONV-009-10` 「还有 N 个」高 28、字号 10.5、颜色 `--accent`、带 16 箭头；点击切到对应标签，目标项成为列表首行，采样 `target.top − scroller.top` 为 0–8px（点击后 500ms 取样，容差 ±1px）；宽档滚动口顶边在视口顶下方 174（=48+42+44+40），760–1023 档为 182（=48+42+8+44+40），两值只作布局常量，判据零点取滚动口顶；目标项只显示一次 `--focus` 焦点框，焦点移到该项。（AC-CONV-009-11）
- `V-CONV-009-11` 四块计数为 0 时显示对应占位文案，字号 11、`--muted`、上下内边距 16；不出现「还有 0 个」。（AC-CONV-009-10）
- `V-CONV-009-12` 任务卡圆角 10、1px `--line` 边框、内边距 10 11 9 12、卡间 8；左缘 2px 状态条上下缩进 11，四态依次为 `--accent`、`--success`、`--surface-2`、`--danger`。（AC-CONV-009-12）
- `V-CONV-009-13` 状态胶囊高 18、圆角 5、字号 10、字重 550，四态底色与字色按 §17.4.2；进行中、失败、未开始三态的胶囊文字与底色对比度 ≥4.5:1；已完成态改用 `--success-ink` 后同样 ≥4.5:1，不再作为已知缺口；四态实测值记入证据。（AC-CONV-009-12）
- `V-CONV-009-14` 模式标签高 16、圆角 4、字号 9.5，计划与边做边想两套配色按 §17.4.2；等待前置时显示等待标签「等待全部」「等待任一」「等待每个」，用 `--warning-soft` 底 `--warning` 字。（AC-CONV-009-14）
- `V-CONV-009-15` 刻度条高 3、段间 2、段宽相等；8 步画 8 段，13 步归并为 12 段（每段 2 步），含失败步骤的段用 `--danger`、含当前步骤的段用 `--accent`。（AC-CONV-009-05）
- `V-CONV-009-16` 卡脚字号 10.5：进行中右侧为「第 6 步 · 进行中」`--accent`，已完成为「完成于 HH:MM」`--muted`，未开始为「等待前置」`--muted`，失败为「失败于 HH:MM」`--danger`；左侧统一为「已完成 N/M 步」。（AC-CONV-009-05）
- `V-CONV-009-17` 计划卡步骤摘要最多 3 行、每行 22 高、顶部 1px `--line-soft`，行内标记、名称、摘要三列对齐；摘要后「查看全部 8 步」高 24、字号 10.5、`--accent`。（AC-CONV-009-05）
- `V-CONV-009-18` 边做边想卡最近轨迹块底色 `--paper`、圆角 6、内边距 8，正文最多 2 行；块后「查看循环轨迹」高 24、字号 10.5、`--accent`。（AC-CONV-009-06）
- `V-CONV-009-19` 失败卡失败说明为 `--danger-soft` 底、圆角 6、内边距 6 8、字号 10.5、`--danger`，最多 3 行静态省略、卡面不提供展开；失败卡与未开始卡同样可点、可聚焦，整卡按钮，点击打开只读详情 1 次，状态差 0、事件条数差 0、写请求 0 条。（AC-CONV-009-12、AC-CONV-009-07）
- `V-CONV-009-20` 四态任务卡（未开始、进行中、已完成、失败）交互一致：可点、可聚焦，悬停边框 `--accent-line`，聚焦 2px `--focus`；详情打开时该卡边框 `--accent-line` 加 2px `--accent-soft` 外光晕，卡片与详情同时可见时保持。（AC-CONV-009-05、AC-CONV-009-07）
- `V-CONV-009-21` 筛选条四个筛选片为「全部 11」「进行中 2」「失败 1」「已完成 3」，高 24、圆角 6、字号 10.5、间距 4；选中为 `--ink` 底 `--paper` 字；切换在 100ms 内完成且列表回到顶部。（AC-CONV-009-12）
- `V-CONV-009-22` 计划详情为 `section.task-detail[role="dialog"][aria-modal="true"]` 1 个，头高 44、关闭按钮 24×24，进入 150ms；视口 ≥1024 时四边采样误差均为 ±0px：左缘减侧栏右缘为 0、顶边距视口顶为 90、底边减视口底为 0；右缘分两档各采样 1 次，面板展开时减面板左缘（视口宽减 320）为 0、面板收起时减竖条左缘（视口宽减 40）为 0，收起档经任务图节点在收起态打开详情取样；宽度等于剩余中栏宽（展开档视口宽减 560、收起档视口宽减 280）±0px；标题 18、字重 650，提示条 `--accent-soft` 底、圆角 6；打开时焦点在关闭按钮（由任务图节点跳转打开时在对应步骤行），Tab 不离开详情。（AC-CONV-009-07）
- `V-CONV-009-23` 步骤单列，行左缩进 12、最小高 30，栅格 16/1fr/auto/12、列间距 8；8 步全部可读，第 6 步为当前步。（AC-CONV-009-05）
- `V-CONV-009-24` 第 6 步默认展开：行底 `--accent-soft`、左缘 2px `--accent`、摘要「轨迹 8 条 · 进行中」用 `--accent`，其内联轨迹至少 1 条。（AC-CONV-009-05）
- `V-CONV-009-25` 第 5 步可点开回看，展开后头右侧为「已归档 · 可收起」；当前步可手动收起，收起后出现「当前步已收起，点这一行重新展开」提示。（AC-CONV-009-05）
- `V-CONV-009-26` 第 7、8 步无箭头、无轨迹条数、无指针样式、不进入 Tab 序列，展开入口数为 0。（AC-CONV-009-05）
- `V-CONV-009-27` 内联轨迹左缘距详情左缘 28（步骤缩进 12 加轨迹再缩进 16），块左缘 1px `--line-soft` 竖线从首条标签顶贯通到末条标签底。（AC-CONV-009-05）
- `V-CONV-009-28` 轨迹行栅格 32/1fr/45、列间距 6；类别标签高 15、圆角 3、字号 9.5，思考、动作、观察三色按 §17.5.3；工具调用成功记 1 条观察，越权调用记 1 条 `--danger-soft` 底 `--danger` 字的观察且正文以「403」开头；时间 9.5 等宽右对齐、HH:MM:SS、单调不减。（AC-CONV-009-05）
- `V-CONV-009-29` 步骤名默认 1 行省略；截断时出现 12×12 展开按钮，点击后最多 3 行，再次点击回 1 行，轨迹展开状态不变。（AC-CONV-009-05）
- `V-CONV-009-30` 边做边想详情为 14 行扁平时间线，步骤节点数 0、分组数 0、展开入口数 0；行栅格 32/1fr/46、正文 11.5、行内边距 4。（AC-CONV-009-06）
- `V-CONV-009-31` 当前动作为最后一行，行底 `--accent-soft`、左缘 2px `--accent`，类别标签为 `--accent` 底 `--paper` 字；打开时滚到最底部，时间戳单调不减。（AC-CONV-009-06）
- `V-CONV-009-32` 任务图弹窗宽 920、最大宽为窗口宽减 64、圆角 12、阴影 `--shadow-pop`；遮罩取 `--overlay-scrim`；Esc、关闭按钮、点遮罩三种方式都能关闭并归还焦点。入口为 `button.topbar-task-graph[aria-label="任务图"]` 1 个，位于顶栏右侧工具区最左、连接点与文案左侧，高 28、16×16 图标、文案「任务图」、`title="查看任务图"`；当前会话任务数 ≥1 时渲染，任务数 0、无会话、草稿会话与任务数未知时元素数 0 且不占位；点击后弹窗打开且按钮 `aria-expanded="true"`，关闭后为 `false`，Esc 关闭后焦点回到按钮。（AC-CONV-009-07）
- `V-CONV-009-33` 图例含四态圆点各 6px 与 22×8 虚线样例；节点 156×64、四列、模式行 9、名称 12、状态行 9.5，四态左条配色按 §17.8.2。（AC-CONV-009-13）
- `V-CONV-009-34` 连线 1.4px、终点带箭头；失败下游为虚线（线段 4、间隔 3、`--danger`、55% 不透明度）；8 节点、1 失败、1 条失败下游虚线。（AC-CONV-009-13）
- `V-CONV-009-35` 任务图四态节点均可点（按钮语义），悬停边框 `--accent-line`、指针为 pointer、聚焦 2px `--focus`；弹窗内重试、取消、编辑、删除入口各 0，关闭入口 1；节点跳转只读，副作用按 `V-CONV-009-43` 核对。（AC-CONV-009-07）
- `V-CONV-009-36` 消息流任务卡最宽 720、与文本消息同左缘，`--surface` 底、1px `--line` 边框、左 2px 状态条；既有文本、工具、错误消息的截图逐像素一致。（AC-CONV-009-01）
- `V-CONV-009-37` 消息卡常驻可点区域只有「查看任务」，命中区至少 120×24、高 24、字号 10.5、`--accent`，聚焦 2px `--focus`；等待确认态另有「确认」「取消」各 1 个，等待资源态另有「等待资源」标记 1 个与「恢复」入口 1 个，两类入口同在卡内联区；其余区域不可点、不可聚焦。（AC-CONV-009-01、AC-CONV-009-14）
- `V-CONV-009-38` 汇总卡折叠时为一行「已创建 10 个任务」加计数 10，展开后默认平铺 10 条子条目、每条 28 高，展开状态同步，切换在 120ms 内完成；N=10 时入口 0 个；N=12 时标题计数 12、默认 10 条、「还有 2 条」入口 1 个，点开后 12 条、入口 0 个，展开后不再二次折叠；收起整卡后再次展开回到 10 条加入口 1 个。（AC-CONV-009-02）
- `V-CONV-009-39` 四档尺寸按 §17.10：≥1600、1280、1180 详情左缘贴侧栏右缘、右缘贴面板左缘（展开为视口宽减 320、收起为视口宽减 40）、顶 90、底视口底，面板 280 加竖条 40 总占 320，1180 任务图高 `min(560, 窗口高−80)`；760–1023 竖条 40 常驻、抽屉宽 `min(280, 100vw−32)`，详情绝对定位于抽屉内容区 `inset: 0` 且宽等于抽屉宽；<760 按 §8.2 窄屏规则，详情元素数 0。（AC-CONV-009-08）
- `V-CONV-009-40` 切换会话后只显示当前会话的数据，标签与展开状态保持；任务状态变化与取消后下游任务启动时，角标、筛选计数、概览四态计数、任务图节点在 2 秒内更新；浮层打开时页面滚动锁定，关闭后恢复。（AC-CONV-009-17）
- `V-CONV-009-41` 超时只在卡脚显示「已超出预计 12 分钟」`--warning`，状态胶囊、状态条、筛选计数不变，超时本身新增的取消入口数为 0；等待确认态已存在的「取消」入口按 `V-CONV-009-37` 计，与超时无关。（AC-CONV-009-18）
- `V-CONV-009-42` 10.5 元信息在 `--surface` 上的对比度为 5.33:1，状态胶囊按 V-CONV-009-13 分态核对；切换标签 ≤120ms、切换筛选 ≤100ms、打开详情与任务图各 ≤150ms、计数更新 ≤2s。（AC-CONV-009-12）
- `V-CONV-009-43` 任务图节点点击后任务状态前后相同（差 0）、任务事件条数差 0、写请求 0 条；详情打开并滚动到对应步骤（进行中为第 N 步、失败为失败步、已完成为最后一步、未开始为第 1 步），焦点落在该步骤行且只显示一次 `--focus` 框，步骤展开与收起状态不变；已完成、进行中、未开始、失败四态节点各 ≥1 个可点，边做边想节点 ≥1 个可点。（AC-CONV-009-07）
- `V-CONV-009-44` 已完成胶囊文字用 `--success-ink`，对 `--success-soft` 底 ≥4.5:1（新增 token 建议值 rgba(42,115,84,1)，按 WCAG 相对亮度公式实测 5.04:1；`tokens.css` 落地后按实际值复测）；同一 token 用于表格类型徽标与观察类别标签；`--success` 不再承担 `--success-soft` 上的文字。（AC-CONV-009-12）
- `V-CONV-009-45` 详情打开期间右栏不移动、按钮可点：打开前后 `aside.inspector` 与 40 竖条的四条边差值各 ±0px；面板内可见控件各点击 1 次都生效，概览四个折叠标题各点 1 次、折叠状态各翻转 1 次，任务筛选片点 1 次、筛选结果变化 1 次；每次点击后详情仍打开，详情四边与 `aside.inspector` 四边差值仍各 ±0px，点击不夺走详情内的键盘焦点，Tab 顺序仍按 §17.2.5 限制在详情内。（AC-CONV-009-07、AC-CONV-009-08）
- `V-CONV-009-46` 概览只显示当前任务的启动上下文：目标块目标 1 条、输入块先列约束再列输入项，历史消息条数恒为 0；会话已有 20 条历史消息时目标仍 1 条、约束仍 ≥1 条、历史条数仍为 0，块内不出现任何历史消息正文。（AC-CONV-009-03）
- `V-CONV-009-47` 计划详情的内联轨迹按调用结果分类：成功工具调用记 1 条观察，越权调用记 1 条 `--danger-soft` 底 `--danger` 字观察且正文以「403」开头，两类各 1 条、不合并、不省略；确认放行后当前步由「进行中」转「已完成」，轨迹条数与步骤状态在同一次更新内一致。（AC-CONV-009-04）
- `V-CONV-009-48` 取消上游任务后，下游任务 30 秒内保持「未开始」：卡脚为「等待前置」、状态胶囊与筛选计数不变，任务图节点状态行「未开始 · 等待前置」、上游到下游的连线保留 1 条虚线，下游步骤启动 0 次；取消动作只产生 1 条状态确认，不新增整链取消开关，也不新增确认弹窗。（AC-CONV-009-15）
- `V-CONV-009-49` 交付物文件行由 28×18 类型徽标、来源任务名与「打开」按钮组成，按钮高 24、命中区 32×24；点击后下载 1 个文件，文件字节数与行内元信息标注的大小一致。（AC-CONV-009-16）

### 17.13 待新增 token 与未决项

本节引用的现有 token：`--paper` `--surface` `--surface-2` `--surface-3` `--line` `--line-soft` `--ink` `--ink-2` `--muted` `--faint` `--accent` `--accent-soft` `--accent-line` `--success` `--success-soft` `--danger` `--danger-soft` `--warning` `--warning-soft` `--shadow-float` `--shadow-pop` `--focus` `--sans` `--mono` `--font-10-5` `--font-11` `--font-12` `--font-12-5` `--font-18` `--r-6` `--r-8` `--r-10` `--r-12` `--size-6` `--size-14` `--size-16` `--size-18` `--size-24` `--size-28` `--size-32` `--size-40`。

待新增 token 四个：`--overlay-scrim`，用途为任务图遮罩，建议值 rgba(22,23,27,0.34)；`--rail-task-panel`，用途为右栏面板宽，建议值 280px；`--rail-strip`，用途为竖条宽，建议值 40px；`--success-ink`，用途为所有 `--success-soft` 底色上的文字（已完成状态胶囊、表格类型徽标、观察类别标签），建议值 rgba(42,115,84,1)，对 `--success-soft` 实测 5.04:1，目标 ≥4.5:1，最终值待 `tokens.css` 定义。在这四个 token 落地前，前端按本节数值直接实现，不新造裸色值。

对比度缺口一条，待新增 token 后达标：已完成状态胶囊当前用 `--success` 文字配 `--success-soft` 底，实测对比度 4.42:1，低于 4.5:1；新增 `--success-ink` 并以它作为 `--success-soft` 上的文字色后，对底 ≥4.5:1（建议值 5.04:1），token 落地前按 4.42:1 记录、不作为可接受值。时间戳、节标签与工具栏说明统一用 `--muted`（对比度 5.33:1），`--faint` 只用于图标、空圈与未开始状态条，不再承担正文文字。

未决项（0 条）：无。

已裁项（4 条）：

1. 未开始与失败任务卡是否可点。已裁：四态卡都可点、可聚焦，点击只打开只读详情 1 次，状态差 0、事件条数差 0、写请求 0 条；失败说明仍最多 3 行静态省略，不在卡面展开。依据 `docs/plan/DECISIONS.md` DEC-30；产品回写见 `specs/product/P1-CONV/spec.md:350-351`，设计回写见 §17.4.5 与 `V-CONV-009-19`、`V-CONV-009-20`。
2. 筛选条是否单列「未开始」。已裁：固定四项「全部 / 进行中 / 失败 / 已完成」，不单列「未开始」；未开始任务只出现在「全部」中，靠状态胶囊「未开始」区分，另外三枚计数不含未开始。依据 DEC-31；产品回写见 `specs/product/P1-CONV/spec.md:326` 与 `:357-358`，设计判据见 `V-CONV-009-21`。
3. `AC-CONV-009-11` 的措辞与落点口径。已裁：产品已改为「距滚动口顶部 0–8px」，并补几何口径，滚动口取面板头 44 与筛选条 40 之下的列表内容区顶边，采样 `target.top − scroller.top`，点击后 500ms、容差 ±1px；宽档 174 与 760–1023 档 182 保留为布局常量。依据产品 `specs/product/P1-CONV/spec.md:355-356`；设计回写见 §17.3.4 与 `V-CONV-009-10`。
4. 宽档任务详情与右栏面板的可见关系。已裁：详情只盖中栏，左缘贴侧栏右缘、右缘贴右栏面板左缘，面板展开（280 加 40 竖条）时为视口宽减 320、面板收起（只剩 40 竖条）时为视口宽减 40；右栏面板 280 与竖条 40 在详情打开期间保持可见、按钮可点生效，详情不覆盖右栏。依据用户 2026-11-23 裁决；设计回写见 §17.5.1、§17.10 与 `V-CONV-009-22`、`V-CONV-009-45`；前端 `D-17-01`、`F-CONV-009-17` 与 `specs/frontend/P1-CONV/spec.md:1042`、`:1293` 需同步为面板可见可点。
