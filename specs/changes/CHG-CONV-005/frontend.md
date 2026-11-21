# CHG-CONV-005 · 前端开发 spec

状态：**blocked**（只记录现状；目标态取决于产品口径）
Change: CHG-CONV-005
Implements: PRD-SYNC-004、PRD-SYNC-005
Scope（现状）：`frontend/src/app.tsx:96,101,167,214,239,400,656`、`frontend/src/tabsync.ts`（read_cursor_changed）
N/A：目标态的组件契约（未读徽标、通知中心、远程登录）**N/A** —— 未立项、无设计确认，不得先写实现级契约。

## 1. 现状契约

| 行为 | 位置 | 说明 |
|---|---|---|
| 未读计数 | `app.tsx:96` | `useState(0)`，仅当前会话 |
| 累加 | `app.tsx:214` | 消息数增加且 `!stickToBottomRef.current` 时 +N |
| 清零（切会话） | `app.tsx:167` | `setUnread(0)` |
| 清零（读游标） | `app.tsx:239` | 收到 `read_cursor_changed` 且 `at >= 本地游标` |
| 清零（滚到底） | `app.tsx:400` | `distance < 64` |
| 展示 | `app.tsx:656` | "回到底部 · N 条新消息"按钮 |
| 游标 | `app.tsx:101` | `syncStateRef.readCursor`，仅内存 |
| 跨标签广播 | `app.tsx:171`、`tabsync.ts` | `read_cursor_changed {tabId,opId,at,sessionId}` |

**不存在**：Sidebar 未读徽标、跨会话未读汇总、刷新后恢复、通知 UI、远程登录 UI、离线状态。

## 2. 目标态必须先回答的问题（产品）

1. 未读单位：按消息条数 / 按会话（有/无未读）/ 按消息游标？
2. 已读时机：切会话即已读 / 滚到底 / 窗口可见 / 停留 N 秒？
3. 是否跨会话汇总（全站红点）？是否需要数字？
4. 多标签合并：任一标签阅读即全标签已读，还是各标签独立？
5. 刷新/重启后是否保留？保留多久？
6. 通知中心：站内列表 / 系统通知 / 两者？未读与通知是否同一数据源？

## 3. 目标态（待定，占位不写实现细节）

若产品选"持久化游标 + 跨会话未读徽标"，前端至少需要：
`GET /api/unread`（汇总）、`PUT /api/sessions/{id}/read-cursor`（或随消息读取自动推进）、Sidebar 增加 `unread`/`hasUnread` props、`aria-label` 含未读数。
**以上仅为范围提示，不是契约，不得据此实现。**

## 4. 失败路径（目标态，未知）

| 路径 | 现状 | 目标态 |
|---|---|---|
| 未读接口失败 | 无接口 | 需定义降级（不显示徽标 vs 显示占位），不得假 0 |
| 跨标签写冲突 | 仅内存 | 需定最后写入策略 |
| 远程鉴权失败 | 无远程 | 需定义登录态与错误页 |

## 5. 缺口

1. 无任何测试（未读计数只在 E1 场景间接触及）。
2. 无持久化、无徽标、无通知 UI、无远程入口。
3. 产品口径 6 问未答（见 §2）。
