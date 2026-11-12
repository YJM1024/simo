# 组件系统与"搭积木"规则

> 前端开发 = 用已登记组件搭页面；页面只负责布局，不负责视觉。
> 本文是 DESIGN.md 的工程化补充，适用于静态原型与 React 实现。

## 1. 原则

1. **组件优先**：能用现有组件解决的，不允许页面自己写样式；
2. **组合优先**：复杂区域由小组件组合，不做一个"大而全"的定制块；
3. **配置有限**：组件只暴露受控的 variant/size/tone/density，不接受任意 style/className 覆盖；
4. **布局例外**：只有页面级布局（左中右三栏、居中列、断点）允许页面自己写布局类；
5. **一次登记**：新组件或新 variant 先进画廊，再允许页面使用。

## 2. 组件分层

| 层 | 组件 | 说明 |
|---|---|---|
| 基础 | Button / IconButton / Input / Select / Textarea / Checkbox | 交互原语 |
| 展示 | Badge / StatusDot / Tag / Avatar / Skeleton / Empty / ErrorText | 信息与状态 |
| 容器 | Stack / Row / Grid / Panel / Section / Divider / ScrollArea | 只负责布局与分隔 |
| 数据 | List / ListItem / KeyValue / ProgressBar / Metric | 通用数据展示 |
| 业务 | SessionRow / Message / Timeline / Composer / CardBlock / TaskItem / DeliverableItem / OverviewSection | 与司墨领域绑定 |

容器组件也是组件：`Panel`、`Section`、`Divider`、`List` 必须有明确 API，不允许页面用裸 `div` + 边框/间距代替。

## 3. Props 约定

```ts
type Size = 'sm' | 'md' | 'lg'
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
type Density = 'compact' | 'normal'

interface CommonProps {
  size?: Size
  tone?: Tone
  density?: Density
  className?: never   // 不允许页面覆盖
  style?: never       // 不允许内联样式
}
```

- 颜色：只能走 tone，不允许传 hex；
- 尺寸：只能走 size（sm/md/lg），内部映射到 tokens；
- 背景/字号/间距：由 variant/size/density 决定，页面不直接指定；
- 需要新外观 → 新增 variant，登记画廊，评审后使用。

## 4. 右栏「任务概览」的组件拆解（示例）

```
OverviewPanel                容器：右栏面板，负责分区与滚动
├─ OverviewSection           容器：一个分区（目标/输入/执行会话/交付物）
│  ├─ SectionHeader          展示：标题 + 数量 + 展开指示（可点击）
│  └─ Stack (gap)            容器：纵向排列
│     ├─ TaskItem            业务：状态点 + 标题 + 时间
│     │  ├─ StatusDot        展示：done/running/pending
│     │  └─ Text (variant)   展示：标题/时间
│     ├─ Divider             容器：行间浅色分隔
│     └─ EmptyState          展示：空组
├─ DeliverableItem           业务：图标 + 文件名 + 大小
└─ Divider                   容器
```

规则：
- 每一项都是组件，不在页面里拼 `<span>` + 颜色；
- `SectionHeader` 的展开/收起是组件行为，不写在页面逻辑里；
- `TaskItem` 的三种状态由 `StatusDot` + 文本 variant 表达，不新增三套 DOM；
- 列表间距由 `Stack` 的 density/gap 控制，页面不写 margin。

## 5. 页面职责

页面只做三件事：
1. 选择布局（AppShell / 三栏 / 居中列 / 响应式断点）；
2. 取数据并传给组件；
3. 组合组件顺序。

页面禁止：
- 写颜色/边框/圆角/字号/阴影；
- 写 `<style>` 或内联 style；
- 用 `.page .btn {}` 覆盖组件；
- 为单个页面复制一份组件。

## 6. 新增组件的判断

必须先回答：
1. 现有组件 + variant 能否满足？能 → 不加；
2. 是否会在 ≥2 处复用？是 → 加通用组件；只一处 → 优先用现有组合；
3. 是否需要新 token？先加 token，再加组件；
4. 是否登记画廊、截图、owner、状态？没有 → 不允许使用。

## 6.5 零裸展示元素（硬规则）

- 页面上**所有可见元素**必须来自已登记组件：文本/标题/标签、按钮、输入、图标、头像、状态点、徽章、列表项、分隔线、空态、错误、骨架、卡片、容器、滚动区；
- 不允许页面写裸 `<div>/<span>/<p>/<h1>` 再配自定义样式来"造"一个展示元素；
- 裸 HTML 只允许作为**无视觉的布局包装**（仅 grid/flex/gap/padding 等布局类），且优先使用 `Stack/Row/Grid/PageShell` 等布局组件；
- 页面不写 `<style>`、不写内联 `style`、不引入页面级 CSS；
- 例外必须走评审：说明为什么现有组件无法满足 → 批准后先扩组件/variant/登记画廊 → 页面再使用；例外不允许长期存在。

## 6.6 新增属性/变体的通用性

- 不只为单个页面加 prop；先抽象成通用维度：`variant / size / tone / density / align / loading / disabled / slots`；
- 一个页面专用的布尔 prop 视为坏味道，优先用组合或 variant 表达；
- 新 variant 至少说明：适用场景、是否可复用、token 映射、状态清单；
- 新增后必须登记画廊并补截图，不接受"先用着，以后再补"。

## 6.7 组件缺口处理流程（唯一合法路径）

页面遇到无法表达的展示需求时，按顺序处理：

1. **先找组合**：现有组件能否组合出来？能 → 页面组合，不新增；
2. **再找变体**：现有组件加 `variant/size/tone/density/slots` 能否满足？能 → 扩展现有组件；
3. **最后新建组件**：以上都不行 → 新建组件，写清：
   - 语义与用途；
   - props/变体/状态；
   - token 映射；
   - 可复用场景（至少说明未来哪里还会用）；
4. 登记组件画廊 + 截图 + owner；
5. 页面才能使用；
6. 任何"页面内先写一段临时样式"的绕行都不允许；紧急例外必须记录并在一周内补组件。

禁止：
- 为单个页面写一次性组件（除非证明它本身是通用能力）；
- 在页面里复制组件代码后改样式；
- 用 CSS 覆盖/`!important` 改组件外观。

## 6.8 组件变更也必须走 SDD

任何**新建组件、修改组件 API、增加/修改 variant、修改视觉或交互**，都必须走同一套 Simo SDD，不允许"先写组件再说"。

最小 spec（小改动可合并文件，但内容不能省）：

```
specs/COMP-<NNN>-<slug>/
  proposal.md  为什么加/改，影响哪些页面，替代方案
  spec.md      语义、props、variant、状态、tokens、a11y、使用场景
  design.md    DOM/结构、API、样式来源、兼容性
  tasks.md     实现、登记画廊、迁移旧用法、截图验收
  test-plan.md 状态矩阵、页面回归、截图档位
  evidence.md  构建/截图/交互/DOM 证据
```

门禁：
1. **Component Spec Ready**：语义、props、状态、tokens、使用场景齐全；
2. **API Approved**：命名/变体/是否破坏兼容；
3. **Implement**：组件代码 + 画廊条目 + 截图；
4. **Page Adoption**：只有登记后才能被页面引用；
5. **Verify**：页面回归 + 三档截图 + 无定制 CSS；
6. **Archive**：记录版本与变更原因。

规则：
- 新增 variant 优先于新增组件；
- 删除/重命名 prop 视为破坏性变更，必须列迁移任务；
- 组件 ID 与版本写入画廊 manifest；
- 页面 PR 不得夹带"顺手新增组件"；组件变更单独 spec/commit。

## 6.9 单一组件库（硬规则）

- 全站只能有 **一个组件库**：`src/components/`，由 `src/components/index.ts` 暴露公共 API；
- 页面只能 `import { ... } from '@/components'`，不得在页面目录内新建组件、复制组件、维护第二套样式；
- 样式只能有两层：`tokens.css`（唯一变量源）+ 组件自身样式；禁止页面级 CSS、禁止重复的 components.css；
- 一个组件只允许一个实现；出现重复实现必须合并，不允许"新页面新写一个"；
- 组件库清单 `components.manifest.json`（组件、变体、状态、owner、截图）必须与目录一致；
- 构建检查（P1）：
  - 页面目录出现 `.tsx` 组件定义 → 失败；
  - 页面目录出现 `.css` → 失败；
  - 两个文件定义同名组件 → 失败；
  - 页面使用未登记组件 → 失败。

执行顺序：**先组件库，后页面**；页面开发时只允许"缺 variant → 扩组件库"或"缺组件 → 新建组件并登记"，不允许在页面里绕开。

## 7. 验收

- 页面文件中组件使用率：不允许出现裸视觉样式；
- `style`/`<style>`/页面 CSS 检查为 0；
- 画廊包含所有使用中的组件；
- 同一视觉在不同页面一致；
- 新增视觉必须能在组件库找到来源。
