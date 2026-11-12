# FE-001 · 设计

## 1. 架构

- React 19 + TypeScript strict + Tailwind CSS 4 + esbuild；
- 单页应用，无第三方 UI 库；
- 目录：

```
frontend/
  src/
    main.tsx / App.tsx
    styles/tokens.css / components.css / index.css
    components/        # Button/Input/Tabs/Badge/Card/SessionRow/Message/Timeline/Composer/CardBlock/OverviewPanel/Dialog
    pages/ChatPage.tsx / WorkbenchPage.tsx
    platform/api.ts / ws.ts / format.ts
  prototype/           # 冻结基线（只读参考）
  review/              # 截图与 REVIEW.md
```

## 2. 视觉与组件

- 唯一来源 `DESIGN.md` 与 `frontend/prototype/tokens.css/components.css`；
- 组件必须 1:1 对应原型条目，不允许页面临时样式；
- 尺寸只使用 tokens：2/4/8/12/16/20/24/32/40/48/64；圆角 4/6/8/10；图标 16/20/24；
- 页面结构：AppShell（侧栏 240 + 主区 + 全局状态栏 24），对话页 760 内容列 + 44 时间轴 gutter，右栏 300。

## 3. 数据与 API

| 用途 | 接口 |
|---|---|
| 会话树 | `GET /api/sessions` |
| 消息 | `GET /api/messages?sessionId=&limit=` |
| 发送 | `POST /api/chat {sessionId,text}` |
| 新建草稿 | `POST /api/sessions {title}` |
| 重命名 | `PATCH /api/sessions/{id} {title}` |
| 流式 | `GET /api/ws?sessionId=`，发送 `{type:"subscribe",data:{sessionId}}` |
| 卡片 | `POST /api/cards/{id}/actions/{actionId}`；无动作时 `/api/chat` 兜底 |
| 用量 | `GET /api/stats`（本月）+ `GET /api/usage`（本次运行） |
| 任务 | `GET /api/tasks`（右栏三组，按状态取数/排序） |
| 权限 | `GET /api/permissions` |

## 4. 流式与状态

- WS 只消费 `message.created / reply.created / reply.delta / reply.done / reply.retracted / status`；
- 后端同时发 `reply.delta` 与 `message.delta`，前端**只消费 reply.delta**；
- 断线：指数/1.5s 重连；重连后带 `since`（如可用）并静默补拉；
- 发送后 2.5s/7s 各补拉一次，兜底事件丢失；
- 发送中状态由 reply.created/done 驱动，不伪造任务。

## 5. 会话与右栏

- 会话树：主会话 + 子会话 + 草稿；双击行内重命名；
- 右栏：
  - 目标/输入：来自会话概览接口；无数据显式空态；
  - 执行会话：仅后端异步任务；三组；
    - 已完成：取最近完成 5 条，按时间正序展示（最新在下）；
    - 进行中：取创建最早 5 条，正序；
    - 未开始：取创建最早 5 条，正序；
    - 默认每组展示 3 条，可展开全部/收回；
  - 交付物：正常文档流，放在执行会话之后，不固定。

## 6. 错误与空态

- 每个数据区：空/加载/错误三态；
- 错误展示原因与重试；不吞错、不伪造数据；
- 发送失败恢复输入内容；
- 会话加载失败保留当前选中，提示。

## 7. 可访问性

- Tab 顺序：侧栏 → 顶栏 → 内容 → 右栏 → 状态栏；
- 时间轴可聚焦，↑/↓ 切换，Enter 定位；
- 焦点环可见；`prefers-reduced-motion` 关闭非必要动画；
- 点击区不小于 24×24。

## 8. 构建与上线

- `tsc --noEmit`、`node build.mjs`（Tailwind CLI + esbuild）；
- 产物写 `frontend/dist` 与 `backend/internal/webui/dist`；
- 只有 A1–A12 通过后，Lead 才允许构建 simo 并启动 8787；
- 回滚：保留上一份通过验收的 commit 与 dist。

## 9. 与冻结原型差异

- 原型用于视觉与结构对照；React 版不得改视觉决策；
- 若实现受限需改设计，必须先改 `DESIGN.md` 并重新验收，不得在代码里临时改。
