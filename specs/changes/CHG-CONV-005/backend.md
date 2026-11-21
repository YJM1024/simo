# CHG-CONV-005 · 后端开发 spec

状态：**blocked**（能力不存在；本文件是不存在性证明 + 未来契约占位）
Change: CHG-CONV-005
Implements: PRD-SYNC-004、PRD-SYNC-005
Scope：`backend/internal/`（全模块）
N/A：**实现 N/A** —— 未定义口径，不产出 API/表/迁移；若强行实现即违反"产品先行"。

## 1. 不存在性证明（2026-11-21 实查）

| 检查 | 命令/范围 | 结果 |
|---|---|---|
| 未读字段/接口 | `grep -r "unread\|read_cursor\|lastRead\|last_read" backend/internal` | **0 匹配** |
| 通知 | `grep -r "notification" backend/internal` | **0 匹配** |
| 表 | 迁移/SQLite schema 无 `unread`/`read_cursor`/`notifications` 表 | 不存在 |
| 远程鉴权 | 后端无鉴权中间件；默认 `127.0.0.1:8787` 本机监听 | 不存在 |
| 导出/分享 | 无远程访问入口 | 不存在 |

## 2. 若未来实现，最小契约草案（非承诺）

> 以下仅为评审起点，**未定稿**，实现前必须由产品 spec 先行。

- `GET /api/unread` → `{ total:number, bySession: { [sessionId]: number } }`（口径由产品定）
- `PUT /api/sessions/{id}/read-cursor` → body `{ messageId?, at }`，幂等，返回游标
- 表：`session_read_cursors(session_id PK, at INTEGER, updated_at)`、`notifications(id, kind, payload, created_at, read_at)`
- 远程访问：需先有身份/授权/审计三件套（属 SYS 域），本包不承接。

## 3. 错误与权限（目标态）

| 场景 | 目标契约 |
|---|---|
| 未读接口失败 | 统一错误信封，前端显示"未知"而非 0 |
| 游标写入旧值 | 以 `at` 单调递增为准，旧值幂等忽略 |
| 远程未授权 | 401/403 + 明确错误码；不得泄露会话存在性 |
| 通知越权 | 按会话归属过滤，不得跨用户 |

## 4. 迁移与回滚（目标态）

- 新表 additive，可空默认；回滚 = 停写 + 保留表（不删数据）。
- 未读不回填历史（否则首次打开全站红点），从上线时刻起算。

## 5. 缺口

1. 无实现（`missing`）。
2. 无口径 → 无表 → 无迁移 → 无测试，链式阻塞。
3. 远程访问与当前无鉴权基线冲突，需系统级决策。
