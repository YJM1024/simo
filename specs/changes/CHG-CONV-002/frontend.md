# CHG-CONV-002 · 前端开发 spec

状态：**partial**
Change: CHG-CONV-002
Implements: PRD-CONV-004、PRD-CONV-007
Scope：`frontend/src/components/library.tsx`（MessageItem 176、CardBlock 217、Timeline 355、TimelineGroups 432、TimelineTip 281）、`frontend/src/app.tsx`（祖先链/滚动/WS delta 合并）
N/A：无。

## 1. 组件契约

### MessageItem（`library.tsx:176`）

- props：`message: Message`、`onCardAction`、`readOnly?: boolean`。
- 渲染：用户/司墨标签、可选分类标签（8 类 key → class `msg-tag-<key>`）、时间、复制按钮、`failed` 徽标、流式光标；代码块支持 fenced/inline、长文 `pre-wrap`。
- 复制：`navigator.clipboard.writeText` 失败 → `document.execCommand('copy')` 回退 → 仍失败显示"复制失败"。
- 卡片：`CardBlock` 提交值 → `onCardAction`；失败保留输入并可重试；`submitted` 态禁用；`readOnly`（归档）禁用全部控件。

### TimelineGroups / Timeline / TimelineTip

- props：`messages, currentSessionId, activeMessageId, onJump, ariaLabel`（默认 '消息时间轴'）。
- 一条消息一根 bar，按 `at` 排序；点击/Enter 触发 `onJump(messageId)`；`Home/End/左右箭头` 导航；focus 显示 tooltip、Escape 关闭、hover 延迟与关闭宽限；祖先会话 bar 使用透明度；移动端隐藏由组件 CSS 处理。

### App 集成（`frontend/src/app.tsx`）

- 祖先前置：`getAllSessionMessages(activeId)` → 按 `id` 去重合并 → `ancestorMessages`；`ancestorChain` 顺序用于时间轴透明度。
- 切会话：清空祖先链与 visited 集合，恢复 `scrollPositionsRef` 中该会话滚动位置。
- WS：`onDelta` 按 `seq` 去重合并；`reply.done/message.done` 触发刷新。
- 413：`ancestor` 加载 413 → 提示并可重试；403 → 视为空祖先（visited），不报错。

## 2. 状态矩阵（必须可见）

| 状态 | 触发 | 表现 | 用例 |
|---|---|---|---|
| 空消息 | 新会话 | EmptyState | E1 |
| 加载 | 首次拉取 | Skeleton/加载态 | E1 |
| 流式 | delta 到达 | 光标 + 追加 | MessageItem 用例 6 |
| 失败 | `status=failed` | 失败徽标 + 可重试 | MessageItem 用例 6 |
| 只读 | 归档会话 | 卡片控件禁用 | MessageItem 用例 9 |
| 祖先空 | 403 | 不渲染祖先区，可继续对话 | App.integration 用例 3 |
| 祖先过大 | 413 | 可重试提示 | App.integration 用例 2 |

## 3. 接口调用

`listMessages(sessionId, 100)` → `/api/sessions/{id}/messages`；`getAllSessionMessages(sessionId)` → `/api/sessions/{id}/messages/all`；`submitCardAction(cardId, actionId, payload)` → `POST /api/cards/{id}/actions/{actionId}`。

## 4. 失败路径

| 路径 | 现状 | 判定 |
|---|---|---|
| 复制失败 | 两级回退 + "复制失败" | 已测（2 用例） |
| 卡片失败 | 保留输入 + 重试 | 已测 |
| 祖先 413 | 提示可重试 | 已测（前端映射），后端真实 413 未联调 |
| 祖先 403 | 视为空 + visited | 已测（前端映射），后端真实 403 未联调 |
| 长消息/代码 | 不截断、可滚动 | 已测 |

## 5. 缺口

1. 时间轴点击目标尺寸（≥44px）无 DOM 测量用例。
2. 消息纯度（system/internal 不出现）无前端独立断言（依赖后端过滤）。
3. 真实后端 413/403（非 mock）无 E2E。
4. COMP 状态与实现不一致，需设计/验收同步（不在本包改）。
