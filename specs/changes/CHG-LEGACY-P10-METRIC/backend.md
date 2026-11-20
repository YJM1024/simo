# BACKEND · CHG-LEGACY-P10-METRIC

- Scope：backend/internal/modules/chat/{metrics,metrics_turn,stats}.go
- 状态：历史归档；无新增实现、无迁移
- 后端入口：`backend/cmd/simo` 模块注册

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/chat/metrics.go` | 指标查询与窗口 |
| `backend/internal/modules/chat/metrics_turn.go` | 轮次/延迟样本 |
| `backend/internal/modules/chat/stats.go` | 统计汇总 |

## 2. API（实际注册）

| 方法/路径 | 行为 |
|---|---|
| `GET /api/metrics?range=7d|30d&tz=` | 指标数据/窗口 |
| `GET /api/stats` | 统计汇总 |

## 3. 数据与迁移

指标来自任务/轮次/会话数据聚合；本包不新增指标表或算法。

## 4. 错误与边界

- 只记录已有路由；未逐端点验证参数错误、权限、冲突、超时与重试矩阵。
- 全量后端测试使用临时 `SIMO_HOME`/SQLite，不接触正式数据。
- 本包不把 223/223 全量通过写成该域每个 PRD 的 AC 通过。

## 5. 测试映射

后端全量 223/223 PASS；未按 METRIC PRD 映射精确 Go 测试，不能据此判 AC 通过。

| 证据 | 结果 | 边界 |
|---|---|---|
| `cd backend && go test ./... -count=1 -json` | 223/223 PASS（26 包，0 fail/skip） | 全量套件通过；未按本域 PRD 逐一命名 |
| 前端/ E2E 交叉证据 | 见 `frontend.md` 与 `evidence.md` | 仅覆盖展示/主路径，不替代后端 AC |

## 6. 未验证 / 风险

- 质量/延迟真实样本未验收
- 导出/对比/告警未实现
- 指标口径与后端聚合无契约测试
- 未执行逐路由 HTTP 契约矩阵（400/403/404/409/500）。
- 未做并发、迁移回滚、崩溃恢复与长时间运行测试。
