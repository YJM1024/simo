# 组件 spec 模板（component-spec）

版本：v1.0，2026-11-25。状态：active。本模板服务 `MOXIAN.md` 第 6 章 MX-6-03 与 `domains/product-design.md` MX-PD-25、MX-PD-29，落点 `specs/COMP-<kebab>/spec.md`，模板名册登记在 `scripts/check-matrix-coverage.mjs` 的 `TEMPLATE_FILES`。

## 1 用途与何时用

组件 spec 固定一个组件或一组不可拆分组件的视觉与交互契约，供前端实现、测试断言与独立验收引用。四种条件命中任一即写：新增组件、新增组件变体、改动组件公开 API、界面调整涉及视觉规范变更；四种都不命中时在设计列写 `N/A` 加理由，理由写清复用的是哪个组件的哪个变体，不写空文件。组件 spec 是契约表设计列的子产物，数据契约、接口形状与状态机迁移写在五列契约表，组件 spec 只写组件自身的变体、状态、尺寸、token、无障碍与验收判据。

一个组件或一组不得拆开的组件写一份，编号按 `ID-SPEC.md` 第 5.4 节取 `COMP-<kebab>`，与目录名一致，域内唯一，组件废弃后编号保留不复用。文件首部写组件编号、名称、状态、Owner、Used by、视觉基线与复用来源七项。状态取值按 `ID-SPEC.md` 第 6.1 节，组件可用 `draft`、`ready`、`in-progress`、`implemented`、`verified`、`accepted`、`deprecated`、`superseded` 八值；`implemented` 不等于 `accepted`，未取得独立验收签字时不得写 `accepted`。

## 2 必填节

### 2.1 组件标识与来源

| 列名 | 必填 | 取值口径 |
|---|---|---|
| 组件编号 | 是 | `COMP-<kebab>`，与 `specs/` 目录名一致，不复用 |
| 组件名称 | 是 | 英文组件名加中文名，与代码导出名一致 |
| 状态 | 是 | 第 1 节八值之一，状态变更带日期与证据链接 |
| Owner | 是 | 前端实现、设计与验收分列；验收人不得为实现者 |
| Used by | 是 | 引用该组件的 PRD 或变更编号列表；无引用写 `N/A：<理由>` |
| 视觉基线 | 是 | `DESIGN.md` 加 `templates/visual-baseline.md` 的基线编号与档位 |
| 复用来源 | 是 | 复用组件的编号与变体；新增组件写「新增」，不写「无」 |

### 2.2 变体

每个变体一行，列写变体名、触发条件、结构差异与允许使用的 token 组。默认变体排第一；变体只改变外观、密度或文案位置时明确写「公开 API 不变」；变体增减公开属性、事件或插槽时按改动公开 API 处理，在契约表登记后再写。只改文案内容的场景不单列变体，文案口径写进产品 spec。

### 2.3 状态

状态矩阵按 `MX-PD-25` 的八态列全：`default`、`hover`、`focus`、`active`、`disabled`、`loading`、`empty`、`error`。每个变体一张矩阵，行是八态，列是背景、文字、边框、透明度、光标与是否可交互，每格写值或 `N/A：<理由>`。八态是唯一集合，选中态统一记 `active`，不另立 `selected`、`current` 等名称；组级透明、祖先弱化这类组合条件写进「状态迁移与组合」一节，不改状态名。有状态切换的组件同时写事件与起止状态，缺态、缺迁移或出现集合外状态名时契约门判不通过。

### 2.4 尺寸与栅格

列写元素、宽、高、内边距、字号与行高、图标尺寸与备注。宽高取像素整数，间距取 4px 栅格；可点击元素的可点区不小于 24×24，视觉尺寸小于该值时写清命中区扩展方式。断点取 375、768、1180、1600 四档，页面在 1280 有独立断点时加该档，档位口径按 `MX-9-11`；每档的截图路径写进 test-plan，不留在组件 spec 正文。

### 2.5 token 引用

按用途列 token 名、回退值与作用域，用途至少覆盖背景、文字、边框、焦点环与遮罩。组件与页面只引用 `--` 变量，不写 hex、`rgb()` 与页面级一次性样式；token 在 `tokens.css` 找不到时先按 `MX-PD-24` 裁决并登记，再在本节引用。新增或改名 token 按 `MX-PD-64` 在设计令牌类登记六项，受影响组件与 `frontend/src/components/manifest.json` 的引用一致；旧 token 与新 token 不同时保留，废弃时间写进登记行。

### 2.6 无障碍

七项按 `MX-PD-29` 逐项写检查方式、判定人与证据路径，项名固定为键盘操作、焦点可见、可访问名称、对比度、错误识别、reduced-motion 与目标尺寸。键盘操作写 Tab、Shift+Tab、方向键与 Esc 的路径；对比度正文不小于 4.5:1、大字不小于 3:1，数值附计算产物；颜色不单独承载信息。确实不适用的项写 `N/A：<理由>`，并按 `MX-PD-69` 取得豁免，未豁免的 `N/A` 按缺失计。

### 2.7 验收判据

组件自有判据按 A1 至 An 顺序编号，一行一条，列写判据、断言方式与证据路径；覆盖某条 PRD 验收条目时在该行写 `Covers: AC-<PRD-ID>-<NN>`。断言方式写可执行入口，脚本写 `node scripts/ac/<文件名>.mjs`，人工写 `人工：<动作与观测点>`；证据写变更包 `evidence.md` 的节号或组件签收报告的节号。判据在点开工前冻结，冻结后只允许补充，不允许放宽或删除。

## 3 验收判据怎么写

一条判据只断言一个可观测事实，通过条件写成数值、集合或明确的视觉差异，不写「显示正常」「体验良好」这类无法复核的描述。颜色与尺寸判据给具体 token 名、像素值与断点；交互判据给操作序列、起止状态与观测点；无障碍判据给检查项、工具或人工动作与期望结论。

判据覆盖正常、边界、错误与权限四类路径。组件有变体时每个变体至少一条；有八态时至少覆盖 `default`、`hover`、`focus`、`disabled` 与一个异步态；有键盘交互时补键盘与焦点用例；改颜色或尺寸时补 DOM 测量与四档截图。视觉证据与 DOM 测量写进 `templates/evidence-index.md` 对应分组，截图档位按 `MX-9-11`。

判定取 `pass`、`fail`、`missing` 三值，未执行写 `missing` 与原因，不得用「部分通过」代替。断言脚本失败时保留退出码与关键输出；人工判据由验收人执行并写执行时间、执行人与结论。

## 4 填写示例

以下节选按本模板改写 `COMP-message-colors`，只示范写法，完整内容以该组件 spec 为准。

### 4.1 首部

```text
组件：COMP-message-colors
状态：accepted（2026-11-21，报告 docs/testing/COMP-SIGN-20261121.md §1）
Owner：前端（实现）/ 产品（分类口径）/ 验收（视觉与对比度）
Used by：PRD-CONV-003、PRD-CONV-005
视觉基线：DESIGN.md，VB-CONV-003 至 VB-CONV-006
复用来源：Meta/Badge 的既有尺寸与圆角，不新增第二套标签组件
```

### 4.2 变体

| 变体 | 触发条件 | 结构差异 | token 组 |
|---|---|---|---|
| `requirement` | 用户提出新需求或改需求 | 标签背景与文字换色，结构不变 | `--msg-cat-requirement-bg`、`--msg-cat-requirement-ink` |
| `clarification` | agent 追问或确认需求 | 同上 | `--msg-cat-clarification-bg`、`--msg-cat-clarification-ink` |
| `progress` | 任务或执行进展汇报 | 同上 | `--msg-cat-progress-bg`、`--msg-cat-progress-ink` |
| `consultation` | 纯信息问答，空与非法值回退 | 同上 | `--msg-cat-consultation-bg`、`--msg-cat-consultation-ink` |

### 4.3 状态矩阵

| 状态 | 背景 | 文字 | 边框 | 透明度 | 光标 | 可交互 |
|---|---|---|---|---|---|---|
| `default` | `--msg-cat-<v>-bg` | `--msg-cat-<v>-ink` | 无 | 1 | default | 否，只读 |
| `hover` | 同 `default` | 同 `default` | 无 | 1 | default | 否，不触发筛选 |
| `focus` | 同 `default` | 同 `default` | 2px 焦点环 | 1 | default | 是，键盘可到达 |
| `active` | `--timeline-selected` | 同 `default` | 无 | 1 | pointer | 是，选中会话 |
| `disabled` | `N/A：只读标签无禁用态` | `N/A` | `N/A` | `N/A` | `N/A` | 否 |
| `loading` | `N/A：数据由父组件预取` | `N/A` | `N/A` | `N/A` | `N/A` | 否 |
| `empty` | 无标签 | 无文字 | 无 | 0 | default | 否 |
| `error` | `N/A：回退 consultation，不设错误色` | `N/A` | `N/A` | `N/A` | `N/A` | 否 |

时间轴刻度的组合条件单列：祖先组容器 `opacity: .55`，组内 `active` 不额外提亮；hover 只把宽度从 20 加到 24，不改角色色。

### 4.4 尺寸与 token

| 元素 | 宽 | 高 | 内边距 | 字号/行高 | 备注 |
|---|---|---|---|---|---|
| 标签 | 内容自适应 | 20 | 0 6px | 12/16 | 复用 Meta 行高，44px rail 内不放文字 |
| 时间轴刻度 | 20 | 4 | 0 | 不适用 | `active` 与 `hover` 宽 24 |
| 刻度命中区 | 24 | 24 | 0 | 不适用 | 视觉 4px，命中区向上下扩展 |

```css
--msg-cat-requirement-bg:#E8ECFB;  --msg-cat-requirement-ink:#2F4BB8;
--msg-cat-clarification-bg:#FBF0DA; --msg-cat-clarification-ink:#8A5A00;
--msg-cat-progress-bg:#E2F1E8;      --msg-cat-progress-ink:#246B4E;
--msg-cat-consultation-bg:#F1F0EC;  --msg-cat-consultation-ink:#5E6068;
--timeline-user:#AEBDF7;  --timeline-agent:#6FAF8E;  --timeline-selected:#232A8C;
```

### 4.5 无障碍

| 项 | 检查方式 | 判定人 | 证据 |
|---|---|---|---|
| 键盘操作 | Tab 进入时间轴，上下方向键切换刻度，Esc 关闭 Tooltip | 验收 | 交互用例 A6 |
| 焦点可见 | `:focus-visible` 2px 焦点环，对比度不小于 3:1 | 验收 | 四档截图 |
| 可访问名称 | 刻度 `aria-label` 含发送方、会话与时间；标签文字为分类名 | 前端 | DOM 断言 A1 |
| 对比度 | 四组标签不小于 4.5:1，附 WCAG 计算产物 | 验收 | 计算脚本输出 |
| 错误识别 | 空与非法分类回退「信息咨询」，不出现空白标签 | 产品 | 用例 A2 |
| reduced-motion | 关闭 hover 宽度过渡，状态即时切换 | 前端 | CSS 媒体查询与截图 |
| 目标尺寸 | 刻度命中区不小于 24×24 | 验收 | DOM 测量 A8 |

### 4.6 验收判据

| 编号 | 判据 | 断言方式 | 证据 |
|---|---|---|---|
| A1 | 四个变体各显示对应中文与 bg/ink，无第五类 | `node scripts/ac/AC-MSG-001-01.mjs` | evidence.md 第 2 节 |
| A2 | agent 空、缺失与非法分类回退「信息咨询」，user 无标签与占位 | 人工：构造三类输入并截图 | 签收报告 §1 |
| A4 | 时间轴三色正确，`active` 宽 24，祖先组 opacity .55 | DOM 测量加像素比对 | evidence.md 第 3 节 |
| A7 | 四组标签对比度不小于 4.5:1，计算产物入库 | `人工：WCAG 公式复算` | 对比度报告 |

## 5 与条款、门禁的引用

- 条款：MX-6-03 规定四种触发条件、落点与四项字段裁剪；MX-PD-25 规定八态矩阵与状态迁移；MX-PD-29 规定无障碍七项；MX-PD-64 与 MX-PD-65 规定令牌登记与变更；MX-9-11 规定四档截图与 1280 条件档。
- 门禁：契约门核模板六类必填项、判据冻结与 `Covers:` 对应；组件登记门核组件编号与复用来源；可访问性门核七项逐项结论；证据门核截图、DOM 测量与断言输出；收口门核验收签字与组件状态。
- 矩阵列写法：`TASK-MATRIX.md` 第 3 节新功能格与界面调整格的模板列写「组件 spec」，由 `scripts/check-matrix-coverage.mjs` 解析到本文件；文件缺失时该门禁记 error，不再按产物类型放行。

## 6 版本记录

| 版本 | 日期 | 改动 | 依据 |
|---|---|---|---|
| v1.0 | 2026-11-25 | 首版：七项首部、六类必填节、八态矩阵、四档截图、无障碍七项与判据写法 | MX-G-59 组件 spec 模板缺口归零 |
