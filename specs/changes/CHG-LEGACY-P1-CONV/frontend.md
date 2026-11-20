# FRONTEND · CHG-LEGACY-P1-CONV

## 1. 结论

主路径已执行：会话、消息、Composer、祖先加载与 WS 主路径有 69 单测和 11 E2E 证据；多标签、未读/远程访问仍是缺口。不是完整 P1 前端验收。

## 2. 现有文件与职责

- `frontend/src/app.tsx（单页 chat/workbench、三栏、页面切换、会话/消息编排）`
- `frontend/src/api.ts（REST/WS 客户端）`
- `frontend/src/tabsync.ts（BroadcastChannel 多标签同步）`
- `frontend/src/components/library.tsx:50`（Sidebar：会话树/搜索/归档/重命名）
- `frontend/src/components/library.tsx:509`（Composer：发送、快捷键、IME、发送模式）
- `frontend/src/components/library.tsx:176`（MessageItem：消息渲染/复制/失败/流式）
- `frontend/src/components/library.tsx:666`（ConversationPanel：ready/loading/empty/error）
- `frontend/src/components/library.tsx:432`（TimelineGroups：分组时间轴）

## 3. 测试证据

`cd frontend && npm test` 69/69 PASS：Sidebar 9、MessageItem 18、Composer 10、TimelineGroups 8、App.integration 7；`npm run test:e2e:cdp` 11/11、连续 5 次，P1 相关 01a/01b/02/03/04a–d/05。

## 4. 缺口

- 未做真实多标签浏览器矩阵
- 未读/已读跨标签未验收
- 远程访问/通知中心无 UI
- 动画/虚拟滚动/长列表性能未测
- 视觉/交互未做独立验收；本包不替代用户/验收 Agent 签字。
- 未验证真实后端错误码、权限、空/加载/失败全矩阵。

## 5. 交付边界

- 本包不新增页面、组件、交互或样式；只归档已存在前端事实。
- 未实现 PRD 不得因本包出现而视为已交付。
