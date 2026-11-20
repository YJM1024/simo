# BACKEND · CHG-LEGACY-P3-WORK

- Scope：backend/internal/modules/chat/{stats,metrics,views}.go
- 状态：历史归档；无新增实现、无迁移
- 后端入口：`backend/cmd/simo` 模块注册

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/chat/stats.go` | 汇总统计 |
| `backend/internal/modules/chat/metrics.go` | 指标查询与窗口 |
| `backend/internal/modules/chat/views.go` | 视图 list/get/versions/render-state |

## 2. API（实际注册）

| 方法/路径 | 行为 |
|---|---|
| `GET /api/stats?metric=&granularity=day` | 统计卡/趋势 |
| `GET /api/metrics` | 指标数据 |
| `GET /api/usage` | 用量与配额 |
| `GET /api/views*` | 视图列表/详情/版本/渲染状态 |

## 3. 数据与迁移

统计与指标从既有会话/任务数据聚合；视图数据由 views 模块维护。本包不新增数据。

## 4. 错误与边界

- 只记录已有路由；未逐端点验证参数错误、权限、冲突、超时与重试矩阵。
- 全量后端测试使用临时 `SIMO_HOME`/SQLite，不接触正式数据。
- 本包不把 223/223 全量通过写成该域每个 PRD 的 AC 通过。

## 5. 测试映射

后端全量 223/223 PASS；未将 P3 统计/视图逐 PRD 映射到精确 Go 测试，不能据此判 AC 通过。

| 证据 | 结果 | 边界 |
|---|---|---|
| `cd backend && go test ./... -count=1 -json` | 223/223 PASS（26 包，0 fail/skip） | 全量套件通过；未按本域 PRD 逐一命名 |
| 前端/ E2E 交叉证据 | 见 `frontend.md` 与 `evidence.md` | 仅覆盖展示/主路径，不替代后端 AC |

## 6. 未验证 / 风险

- 自定义视图前端未实现
- 真实 usage/每日聚合边界未覆盖
- 最近活动口径未单列 AC
- 未执行逐路由 HTTP 契约矩阵（400/403/404/409/500）。
- 未做并发、迁移回滚、崩溃恢复与长时间运行测试。
