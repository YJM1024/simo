# BACKEND · CHG-LEGACY-P2-TASK

- Scope：backend/internal/modules/tasks/**、backend/internal/modules/chat/task_*
- 状态：历史归档；无新增实现、无迁移
- 后端入口：`backend/cmd/simo` 模块注册

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/tasks/http.go` | tasks API 路由 |
| `backend/internal/modules/tasks/service.go` | 任务状态与生命周期服务 |
| `backend/internal/modules/tasks/concurrency.go` | 并发/队列控制 |
| `backend/internal/modules/tasks/deliverables.go` | 任务交付物关联 |
| `backend/internal/modules/tasks/recovery_m19b.go` | 恢复逻辑 |
| `backend/internal/modules/tasks/workflow.go` | 任务工作流 |
| `backend/internal/modules/chat/task_executor.go` | 任务执行器 |
| `backend/internal/modules/chat/task_intent.go、auto_route.go` | 任务意图与自动路由 |

## 2. API（实际注册）

| 方法/路径 | 行为 |
|---|---|
| `GET /api/tasks` | 任务列表 |
| `GET /api/tasks/{id}` | 任务详情 |
| `POST /api/tasks/{id}/cancel` | 取消 |
| `POST /api/tasks/{id}/retry` | 重试 |
| `GET /api/tasks/{id}/runtime` | 运行时状态 |
| `GET /api/sessions/{id}/spec-projection` | 会话概要中的任务投影 |

## 3. 数据与迁移

任务、执行状态、运行时与交付物关系由 tasks 模块维护；本包不新增或迁移表。

## 4. 错误与边界

- 只记录已有路由；未逐端点验证参数错误、权限、冲突、超时与重试矩阵。
- 全量后端测试使用临时 `SIMO_HOME`/SQLite，不接触正式数据。
- 本包不把 223/223 全量通过写成该域每个 PRD 的 AC 通过。

## 5. 测试映射

后端全量 223/223 PASS，但未把具体 Go 测试按 P2 PRD 逐项命名；本包不据此判定 AC 通过。

| 证据 | 结果 | 边界 |
|---|---|---|
| `cd backend && go test ./... -count=1 -json` | 223/223 PASS（26 包，0 fail/skip） | 全量套件通过；未按本域 PRD 逐一命名 |
| 前端/ E2E 交叉证据 | 见 `frontend.md` 与 `evidence.md` | 仅覆盖展示/主路径，不替代后端 AC |

## 6. 未验证 / 风险

- 长任务异步开始/结束消息未实现
- 复杂度确认门禁未实现
- 子会话任务归属未实现
- 预算/并发/恢复无产品级 AC 与前端入口
- 未执行逐路由 HTTP 契约矩阵（400/403/404/409/500）。
- 未做并发、迁移回滚、崩溃恢复与长时间运行测试。
