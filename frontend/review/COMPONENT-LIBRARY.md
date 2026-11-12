# 组件库收口与卡片修复记录

## 唯一组件库目录
```
src/components/
  index.ts          # 唯一公共 API
  library.tsx       # Icon / Segmented / Sidebar / StatusBar / MessageItem / CardBlock /
                    # Timeline / Composer / ExecutionGroup / RightPanel / WorkbenchChart
  components.css    # 唯一的组件样式层（原型组件 + React variants）
  manifest.json     # 组件、变体、状态、owner
```

## 页面使用
`src/app.tsx` 只从 `./components` 引用：
`Icon, Segmented, Sidebar, StatusBar, MessageItem, Timeline, Composer, RightPanel, WorkbenchChart, formatTime`；
页面文件不定义组件、不写 CSS、不复制组件实现。

## 已删除/合并
- 删除 `src/ui.tsx`：实现移入 `src/components/library.tsx`，由 `index.ts` 导出。
- 删除 `src/styles/components.css`：与 `src/components/components.css` 合并为单一组件样式层。
- `src/styles.css` 只保留 Tailwind + tokens + `src/components/components.css`。
- 删除页面内 SVG 柱状图实现，抽为 `WorkbenchChart` 组件。

## CardBlock 修复
- 结构：标题行（标题 + 右侧 status·version）→ 说明 → 字段组（label 独立一行，控件下一行）→ 操作区右下。
- 字段支持 select/input/textarea；label 与 control 均测量无重叠。
- 样式全部在组件层：标题 12px/700、说明 12px muted、字段 label 10px muted、控件高 32、卡片 r10/padding14·16、操作 gap8，取消/确认。
- 状态：active / busy / submitted / disabled / error；长标题可换行，state 不被挤压。

## 验证
- 1600/1180/375 card 实测 label 与 control `overlap=false`；control 高 32。
- 卡片提交：active·v1 → submitted·v1，button 存在、error 空。
- 三档 `scrollWidth == innerWidth`；console error 0；tsc 0；build 通过。

## 截图
- 组件库/整体对齐：`align-{1600,1180,375}.png`
- 卡片修复后：`card-fix-{1600,1180,375}.png`
- 卡片修复前：`card-fix-before-1600.png`（live-1600）


## 缓存与用量修复
- `build.mjs` 每次生成 buildId，写入 `<meta name="build-id">` 与 `app.js?v=...` / `app.css?v=...`。
- 本次 buildId：`mwdd6su7-4tpei`；app.js sha256 `bf5d1771fb390ddcd2257b3059d51d6f1739498022d38818bf96aea38de99dd6`；app.css sha256 `dceb1127330db79f748c336dd351b253f680cdd753a56ff754471fe03ce7bd99`。
- 侧栏/工作台 token 改用 `/api/stats.totals`：tokens=81210 → 显示 81.2k、进度 81%；消息 31、任务 3。
- Card rect 断言（1600）：label y547–564，control y567–599，`overlap=false`。


## 视觉验收包（本轮）
- buildId：`mwdd6su7-4tpei`（DPR2 截图生成构建）
- DPR2 并排：`visual-1600-dpr2.png`、`visual-1180-dpr2.png`
- 1600/1180/375：`align-{1600,1180,375}.png`
- 卡片：`card-fix-before-1600.png` / `card-fix-{1600,1180,375}.png`
- React 组件画廊：`/#gallery`（`react-gallery-1600.png`）
- 右栏组件：OverviewPanel / Section / SectionHeader / List / TaskItem / StatusDot / EmptyState / DeliverableItem；无「会话概览/只读」标题，首节「目标」。
- CardBlock：取消/确认；label bottom 564 < control top 567（1600），无重叠；title 12/700、label 10。
- 侧栏：显示归档 / 刷新 / 新建 / active 会话计数。

## stats 映射修复
- 侧栏/工作台 token 取 `stats.totals.tokens`，消息取 `stats.totals.messages`，会话取 `/api/sessions` 的 `sessions.length`；不读 `/api/usage`。
- `stats.totals` 缺失时从 buckets 求和；加载失败保留上次值并显示错误，不回退为 0。
- 实测 1600/1180：81.2k、3 个会话、31 条消息；工作台同源一致。
