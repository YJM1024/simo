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
- 本次 buildId：`mwdgx15f-h7dql`；app.js sha256 `bf5d1771fb390ddcd2257b3059d51d6f1739498022d38818bf96aea38de99dd6`；app.css sha256 `dceb1127330db79f748c336dd351b253f680cdd753a56ff754471fe03ce7bd99`。
- 侧栏/工作台 token 改用 `/api/stats.totals`：tokens=81210 → 显示 81.2k、进度 81%；消息 31、任务 3。
- Card rect 断言（1600）：label y547–564，control y567–599，`overlap=false`。


## 视觉验收包（本轮）
- buildId：`mwdgx15f-h7dql`（DPR2 截图生成构建）
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

## COMP-timeline-tip（待签字，Timeline 未接入）
- tokens：`--radius-tip:8px`、`--tip-width:236px`。
- 组件：`TimelineTip`（open/anchorRef/sender/sessionTitle/timeLabel/summary/fallbackLabel/onClose/onStateChange）；fixed portal，`role=tooltip`，宽度 min(236, 100vw-16)，滚动跟随，边缘 clamp。
- 画廊已登记，截图：`timeline-tip-{1600,1180,375}.png`（DPR2）。
- 实测：tip width 236、`title=null`、`role=tooltip`、无横向溢出；focus 中心偏差 0.156px；edge-clamped 样例 left=1304 right=1540。
- Timeline 已接入 TimelineTip；tick 原生 title 已删除；跨 tick 定时器在 onFocus/onMouseEnter 清除 close/show，A→B 保持 ≥500ms。
- 画廊含键盘 focus 与 edge-clamped 两个真实样例；A1/A2/A4/A8 实机项见验收记录。

## A8 app 实机截图（build mwdfw9t5-lh5d1）
- `timeline-tip-hover-1600.png`、`timeline-tip-focus-1600.png`、`timeline-tip-switch-1600.png`、`timeline-tip-scroll-1600.png`（app 聊天页，36 ticks，消息区 scrollTop 3710）
- `timeline-tip-focus-1180.png`、`timeline-tip-375.png`（375 timeline 按既有设计隐藏）
- `timeline-tip-edge-1600.png`（edge-clamped 样例）
- tick 原生 title=0；focus ring 实测 **2px**；三档无横向溢出；console 0。

## FE-002/003/004/005 批次（未签字）
- buildId `mwdgby9z-iq6se`；新增 `LoadingState`/`ErrorState` 统一三态并登记画廊。
- 截图：`fe-batch-chat-1600/1180/375.png`、`fe-batch-workbench-1600.png`、`fe-error-state-1600.png`。
- 已验证：错误态不显示假 0、重试按钮；搜索、空结果、归档/恢复、任务定位、工作台最近活动、交付物过滤。
- 未完成：右栏 SessionSpec 单一投影、ConversationPanel、卡片重复提交服务端幂等实测、真实用户交付物打开、空库工作台。

## ConversationPanel / SessionSpec 投影（build mwdgirii-fqmgz）
- `ConversationPanel` 已登记画廊并接入聊天页；1600 panel x256 w1028 h656，1180 x244 w640，375 x8 w359；radius 12/8、border 1px、shadow none，无横向溢出。
- 右栏改为单一 `GET /api/sessions/{id}/spec-projection?taskLimit=3`：status/revision/待确认、goal、constraints+inputs、tasks、deliverables；不再分请求。
- 截图：`fe-final-{1600,1180,375}.png`。
- 未验证：卡片服务端重复提交幂等、真实用户交付物打开、空库工作台空态。

## FE-002..005 P0 返工（build mwdgukie-6x8gi）
- 修复 5s 834 请求循环：稳定 loadSessions/applyStats 依赖；实测 5s 6 个 API，侧栏稳定「会话 3」。
- 滚动移交 `.conversation-scroll`：client654/scroll4330/top3676（底部），内层 `.chat-scroll` 0；timeline sync。
- 交付物删除前端文件名硬过滤；CardBlock/MessageItem 增加 readOnly，归档卡片不可提交；错误态「—」不显示假 0。

## 用户级交付物 / 幂等 / 错误文案（build mwdgx15f-h7dql）
- `/api/deliverables` 当前 404，工作台用户级数据源仍阻塞。
- 交付物 `previewUrl`/`downloadUrl` 已接入打开；无 userDelivery 时保持空态；`/api/artifacts` fallback 保留。
- `request()` 网络失败改为「网络请求失败，请检查连接后重试」；409 `CARD_ACTION_IN_PROGRESS` 显示「处理中，请稍后重试」。
- 未验证：卡片连续两次服务端幂等、空库工作台、FE-002 A5 完整回归。

## message-cards React 基线（build mwdk1oal-pjkx0）
- 灰底 `--paper` #EFEDE8；消息白卡 1px/10r/12×14/无阴影/9 间距。
- 卡列 1600 680、1920 680、1180 600、375 359；中心差 0；tab 左缘=卡左缘 430/590/264/8。
- Composer 同宽同白底/1px/10r；1600 430/680，1180 264/600，375 8/359。
- Timeline 1600/1920 absolute gutter，1180/375 隐藏；中心不变。
- 截图：`message-cards-react-{1600,1920,1180,375}.png`。
- 功能未改：唯一滚动、TimelineTip、SessionSpec、卡片/搜索/归档/三态保留。

## 用户反馈三处（build mwdmbz6k-vd4lp）
- `.insp-spec-status` gap 8px；1600 b/ span 间距 16px 可视，待确认靠右并 padding-left 8。
- `.conversation-scroll` 隐藏滚动条；card/composer 同宽：1600 430/680、1280 276/668、1180 264/600、375 8/359。
- Timeline 改为 ≤56.25em 隐藏；1280/1180 显示（1180 x192 w44），卡列中心不变。
- 截图：`fe-feedback-{1600,1280,1180,375}.png`。

## Timeline 1280/1180 可见性修复（build mwdmisy7-z4cbf）
- 1280：timeline x260 w44，卡 x312 w596，卡/Composer 同宽，gap8，insideCol true，bars30，elementFromPoint 命中 timeline。
- 1180：timeline x248 w44，卡 x300 w528，gap8，insideCol true。
- 1600：timeline x378，卡 x430 w680；375 hidden；中心差 0。
- 截图：`fe-tlfix-{1600,1280,1180,375}.png`。

## TimelineGroups（build mwdmpfa5-low53，未接页面）
- API：messages/currentSessionId/activeMessageId/onJump；按 sessionOrder→dateKey→at 分组，组 gap6。
- 当前会话正常、上级组 opacity .55；active 24px `--ink`，普通 20px，gap2；44 rail 无文字。
- 复用 TimelineTip，category 仅进 tooltip 文本；无原生 title；role=tooltip/aria-describedby。
- hover 120ms/focus 立即/200ms grace/Esc；←→/Home/End/Enter/点击跳转。
- 画廊两组样例：单会话、当前+上级会话；截图 `timeline-groups-{1600,1920,1180,375}.png`。
- 首页未接入。
