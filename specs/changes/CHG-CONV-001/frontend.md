# CHG-CONV-001 · 前端开发 spec

状态：**partial**（契约描述现状；缺口已标）
Change: CHG-CONV-001
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003
Scope：`frontend/src/app.tsx`、`frontend/src/components/library.tsx`（Sidebar 50–157）、`frontend/src/api.ts`、`frontend/src/tabsync.ts`
N/A：无——本次涉及 UI 状态机与交互契约。

## 1. 组件与状态

| 组件 | 位置 | 输入（props） | 说明 |
|---|---|---|---|
| Sidebar | `frontend/src/components/library.tsx:50` | `sessions, activeId, onSelect, onRename, onCreate, onRefresh, connection, usageTotal, quotaPct, sessionCount, messageCount, statsError, loading, error, searchQuery, onSearch, searching, searchIds, onArchive` | 会话列表、搜索框、归档过滤、连接/配额统计；**无 pinned/unread props** |
| Timeline Groups | `library.tsx:432` | `messages, currentSessionId, activeMessageId, onJump, ariaLabel` | CONV-001 的"切会话定位"经 `onJump` 由 app 层处理 |
| 容器 | `frontend/src/app.tsx` | — | 会话状态机（activeId、sessions、unread、readCursor） |

## 2. 交互契约

1. **选中**：点击或 Enter 触发 `onSelect`；`app.tsx:583 switchSession` 记录旧会话滚动位置后 `setActiveId`。
2. **重命名**：双击标题进入编辑；Enter 提交 `rename(id, title)`（`app.tsx:530`）；Escape 取消（Sidebar 用例 3 断言）。
3. **创建**：`onCreate` → `createSession`（`app.tsx:535`）：取 root 或 `main` 作 parent → `createSessionDraft` → 本地前置插入 `{title:'新会话', pinned:false}` 并选中。
4. **归档/恢复**：`onArchive(id, archived)` → `toggleArchive`（`app.tsx:450`）→ `archiveSession|unarchiveSession` → `loadSessions()` 刷新；Sidebar 用例 4 断言归档区显示/隐藏与恢复。
5. **搜索**：输入 → 300ms 级别 effect（`app.tsx:353-364`）→ `searchMessages(q)`（`api.ts:136`，只传 q）→ 命中 `sessionId` 集合写入 `searchIds`；Sidebar 只用该集合过滤，用例 5/6 断言过滤、无匹配、searching 态。
6. **空/加载/错误**：`loading` → Skeleton；`error` → ErrorState + 重试（用例 7）；`statsError` → 统计位显示占位而非假 0（用例 8）。
7. **未读**：仅 `unread` 内存计数（`app.tsx:96`；累加 214、清零 167/239/400），表现为底部"回到底部 · N 条新消息"按钮（656）。**不进入 Sidebar**。

## 3. API 调用

`listSessions()`（无参）→ `/api/sessions`；`renameSession` → `PATCH /api/sessions/{id}`；`createSessionDraft` → `POST /api/sessions`；`archiveSession/unarchiveSession` → `/archive|/unarchive`；`searchMessages(q)` → `/api/messages/search?q=`。

## 4. 失败路径与缺陷

| 路径 | 现状 | 判定 |
|---|---|---|
| 列表加载失败 | `loadSessions` catch → `setSessionsError`，ErrorState 可重试 | 有反馈，已测 |
| 创建失败 | `createSession` catch → `setError` | 有反馈，**无测试** |
| 重命名失败 | `rename`（`app.tsx:530`）**无 try/catch**，失败无可见提示 | **实现缺陷**，AC-CONV-002-02 不满足 |
| 归档/恢复失败 | `toggleArchive`（`app.tsx:450`）**无 try/catch**，失败无可见提示 | **实现缺陷**，AC-CONV-002-02 不满足 |
| 搜索失败 | catch → `setSearchIds(new Set())`，静默退化为空结果 | 有降级但无提示，AC-CONV-003-02 部分 |
| 未读持久化 | 无后端调用；刷新即失 | 缺口（SYNC-004 承接） |

## 5. 约束

- 不新增页面级定制 CSS；Sidebar 样式沿用现有类名，改动必须走 DESIGN.md。
- 不引入 pin/未读 props 之外的隐式状态；未读口径若改为跨会话，需产品 spec 先改。
- 375px 不横向溢出由域级 TC-P1-E3 承担；本包不单独验收。

## 6. 已知缺口（交后续任务卡）

1. `rename`/`toggleArchive` 补 catch + 可见错误提示（TASK-CHG-CONV-001-03）。
2. 会话标题搜索接线（`listSessions(q, pinned)`）+ 后端 `q/pinned` 参数（TASK-02）。
3. 未读徽标/持久化需产品先定口径（TASK-06，转 SYNC-004）。
