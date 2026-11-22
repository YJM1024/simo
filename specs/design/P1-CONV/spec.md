# DESIGN · P1-CONV · 会话域设计长期 Spec

状态：**draft**（本节提交 Lead / 产品 / 用户评审；未确认前前端不按本节改代码）
Owner：设计（本节）；评审：产品、前端、验收；裁决：Lead
视觉基线：`DESIGN.md`（唯一风格来源，第 3 行）+ `frontend/src/styles/tokens.css`（第 1 行注明 "DESIGN.md v2 唯一来源"）
输入契约：`specs/product/P1-CONV/spec.md`（active，2026-11-21，12 个 PRD / 34 条 AC）
变更来源：`specs/changes/CHG-CONV-006/product.md`（六条默认裁决）、`docs/plan/MASTER-PLAN.md` §1.7（长期 Spec 按域一文件、文件内按功能点 ID 分节）
范围：P1 会话域的**视觉与交互设计**（区域划分、层级、间距、状态、组件复用、可验收视觉判据）。不含代码、不含接口实现、不含测试脚本。
不覆盖：`PRD-SYNC-005`（未立项、排除在 P1 验收面外，产品 spec §7 已明确）；工作台指标 / 右栏任务投影 P2 / 交付物 P4 / 权限 P8 等非本域页面（产品 spec §7 末条）。

## 读法与约定

1. **本节不另立视觉体系**。所有颜色、字号、间距、圆角、阴影一律引用 `tokens.css` 的 token 名，不写裸 hex。本 spec **不新增任何 hex 值**；只提议两处 token 化，见 §0.4。
2. **一处两套规范的处理口径**：`docs/design-system.md` 是 M62 历史规范（`--canvas #F7F8FA`、渐变、8/12/16 圆角、双层阴影），`COMP-conversation-panel` 明确"不引入 M62 历史渐变规范"。本 spec **只用 `DESIGN.md` + `tokens.css`**；凡与 `docs/design-system.md` 冲突处不再逐条列举，统一在 §13 第 11 条记录。
3. **判据编号**：`V-<PRD>-<序号>`（如 `V-CONV-001-2`）。这是**本节私有**的可验收视觉判据编号，不是产品 AC 编号；每条判据在括号内注明它支撑的产品 AC。判据必须满足"截图或一眼可判定"，含数值的量差上下限。
4. **引用行号均为实际读过**的文件；无法读到的写"未核实"，不猜。
5. 与产品 spec 冲突时**本节不裁决**，一律进 §13 冲突清单（产品说法 / 设计建议 / 影响 AC），交 Lead。

---

## 0. 目录与索引

### 0.1 十三节清单

| 节 | 功能点 | 产品锚点 | 内容形态 | 关联 COMP | 判据数 |
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

小节顺序按 PRD 编号（CONV-001→008、SYNC-001→004），与产品 spec §4 的 L2 分组顺序（001/002/003/004/007/005/006/SYNC/CONV-008）**不同**：本节按编号便于检索，分组归属以 `docs/product/TREE.md` 为准，不构成冲突。

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
└─ aside.inspector          --rail 300，左 1px --line，40 宽图标条 + 投影三组
```

### 0.3 验收档位（全节统一）

| 档位 | 视口 | 本域的布局断言 |
|---|---|---|
| 375 | ≤30em（480） | 侧栏隐藏、右栏隐藏、时间轴隐藏；白卡左右各 8；Composer 不遮发送按钮 |
| 768 | 47.5em–56.25em | 侧栏 228（`components.css:349` 的 73.75em 断点不覆盖此档，实际取 240）；时间轴隐藏、右栏隐藏；**本档从未截图，见 §15** |
| 1180 | 73.75em | 侧栏 240 / 右栏 300 收 280；白卡 720 完整；时间轴显示 |
| 1280 | 80em | 白卡与 Composer 按 `components.css:910-913` 收窄（−104 / −144） |
| 1600 | 100em | 全展开基准档 |

`DESIGN.md` 末节要求"截图存 `frontend/review/` 并写 `REVIEW.md`"：该目录现有 285 张（`frontend/review/`），**无 768 档**（glob 全目录无 `*768*`，仅 3 张 1920），属 §15 缺口。

### 0.4 token 口径与两处 token 化提议

- 色板 / 字体 / 圆角 / 间距 / 尺寸 / 阴影全部取 `frontend/src/styles/tokens.css:2-163`（`--paper` `--surface` `--surface-2` `--surface-3` `--line` `--line-soft` `--ink` `--ink-2` `--muted` `--faint` `--accent` `--accent-soft` `--accent-line` `--success(-soft)` `--danger(-soft)` `--warning(-soft)`；`--r-4/6/8/10`、`--radius-panel 12`、`--radius-tip 8`、`--tip-width 236`；`--sp-2…--sp-64`；`--sidebar 240`、`--rail 300`、`--topbar 48`、`--context 42`、`--gutter-timeline 44`、`--avatar-size 24`、`--conversation-card-w 720`、`--conversation-gutter-x 16`；`--shadow-float`、`--shadow-pop`、`--focus`）。
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

右栏 = **40 宽图标条 + 260 内容区**（总 300）。内容区自上而下：

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
| ≥64em（1024+） | 展开 300（现状） |
| 47.5em–64em（760–1024） | 折叠为 **40 宽图标条**，不占内容区（现状此档直接 `display:none`，`components.css:522-524`） |
| <47.5em（<760） | 隐藏；入口移到 `.context` 行右侧 28×28 图标按钮，点开为覆盖式抽屉：宽 `min(300, 100vw − 32)`、右贴 16、顶贴 `.context` 下 8、**底边 = Composer 顶 − 8**（因此永不遮挡 Composer 与发送按钮）、`--shadow-pop`、圆角 10、点遮罩关闭 |

这与产品 `AC-CONV-008-03`"375 宽右栏不遮挡 Composer"一致；但与产品目标行为 6 的"投影内容仍可读"在 375 档存在实现张力（现隐藏 = 不可读）。进 §13 第 6 条。

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

- `V-CONV-008-1` 右栏总宽 300±1，图标条 40±1，内容区内边距 12/14；三组顺序为 状态→目标→输入→执行会话→交付物（截图）。（AC-CONV-008-01）
- `V-CONV-008-2` 每组任务默认显示 3 条（计数文案显示 `3/总数`）；展开后 >3 且右栏不出现横向滚动（`scrollWidth ≤ clientWidth`）。（AC-CONV-008-02）
- `V-CONV-008-3` 四态文案逐字命中：`右栏加载中…` / `右栏加载失败`（+重试）/ `暂无会话投影` / 无会话时无 `data-session` 属性且不崩。（AC-CONV-008-03）
- `V-CONV-008-4` 交付物超过 8 条时只渲染 8 行且出现"仅显示最近 8 个"；下载链接 10px `--accent` 可点。（AC-CONV-008-02）
- `V-CONV-008-5` 375 档：抽屉打开时，其底边与 Composer 顶边间距 ≥8（截图边界框不交叠）；关闭后 Composer 与发送按钮完全可见。（AC-CONV-008-03）
- `V-CONV-008-6` 768 档：右栏以 40 图标条存在而非消失；点击图标条展开为覆盖层且不挤压中栏宽度（截图前后白卡宽差 ≤1px）。（AC-CONV-008-03、A4）

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
| 全域 | `COMP-conversation-panel` | approved（2026-11-21 按现状契约化：透明容器 + 每条消息白卡；CardBlock 双层白框为已知缺陷） | 本节以"页面级事实"提出 v2 修订（§13 第 1、10 条） |

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
| 13 | 5 个 COMP 契约已按现状契约化，但均未走签收流程 | 见 `specs/COMP-*/spec.md`（conversation-panel 含已知缺陷；composer-send-mode/timeline-tip 已实现未签收；timeline-groups 已接页面；message-colors 只文档） |
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
| v0.2 | 2026-11-21 | 按 Lead 裁决与实测对齐：§7.1 刻度改为"视觉 20/24×4 + 粗指针 44×44 命中区"（删 44×20 重排方案）；§7.3 #1/#5、§13 #8、§15 #7 同步；祖先组统称"组级 .55、组内 active 不额外提亮"（V-3 与 §7.1 表同步）；§14.1 四个 COMP 契约状态按 2026-11-21 契约化事实改写；§15 #13 改写 | Lead 裁决（m00356）；`components.css:1022-1026`；`docs/testing/20261121-123009-after-metrics.json`；`specs/COMP-*/spec.md` | 命中区与祖先透明度不再与本 spec 冲突；COMP 状态引用统一 |
| v0.1 | 2026-11-21 | 新建 `specs/design/P1-CONV/spec.md`：13 节（§0 索引 + §1–§12 逐 PRD）+ §13 冲突清单（11 条）+ §14 与 COMP 契约的关系 + §15 已知缺口（20 条）+ §16 本表。11 节有实质内容、1 节 `N/A`（`PRD-SYNC-001`，理由见 §9）。共 54 条 `V-*` 视觉判据。 | `specs/product/P1-CONV/spec.md`（34 AC）、`specs/changes/CHG-CONV-006/product.md`（六条默认裁决）、`DESIGN.md` + `tokens.css`（视觉基线）、`docs/plan/MASTER-PLAN.md` §1.7（长期 Spec 粒度） | 设计列从缺到有；`specs/design/` 目录首次建立 |

**后续修订入口**：每次变更由 `specs/changes/CHG-CONV-*/` 显式声明"改了本文件哪一节、对应哪个 PRD"（`MASTER-PLAN` §1.7 末条），并在本表追加一行；本节不随 CHG 归档而删除。
