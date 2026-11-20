# BACKEND · CHG-LEGACY-P4-FILE

- Scope：backend/internal/modules/tasks/{deliverables,http}.go、backend/internal/modules/chat/{files,filegen,delivery,attachments}.go
- 状态：历史归档；无新增实现、无迁移
- 后端入口：`backend/cmd/simo` 模块注册

## 1. 代码地图

| 文件 | 职责 |
|---|---|
| `backend/internal/modules/tasks/deliverables.go` | 交付物与任务关联 |
| `backend/internal/modules/tasks/http.go` | 交付物 API |
| `backend/internal/modules/chat/files.go` | 文件列表/读取 |
| `backend/internal/modules/chat/filegen.go` | 文件生成 |
| `backend/internal/modules/chat/delivery.go` | 交付物写入/下载 |
| `backend/internal/modules/chat/attachments.go` | 附件上传 |
| `backend/internal/modules/chat/embed_office.py` | Office 生成辅助 |

## 2. API（实际注册）

| 方法/路径 | 行为 |
|---|---|
| `GET /api/artifacts` | 产物列表 |
| `GET /api/artifacts/{id}` | 产物详情 |
| `GET /api/artifacts/{id}/content` | 产物内容/下载 |
| `GET /api/deliverables` | 交付物列表 |
| `GET /api/sessions/{id}/artifacts|deliverables|files` | 会话文件聚合 |
| `POST /api/uploads` | 上传 |
| `GET/DELETE /api/uploads/{id}` | 上传读取/删除 |

## 3. 数据与迁移

交付物、产物、上传与生成文件由 tasks/chat 模块维护；本包不新增存储或迁移。

## 4. 错误与边界

- 只记录已有路由；未逐端点验证参数错误、权限、冲突、超时与重试矩阵。
- 全量后端测试使用临时 `SIMO_HOME`/SQLite，不接触正式数据。
- 本包不把 223/223 全量通过写成该域每个 PRD 的 AC 通过。

## 5. 测试映射

后端全量 223/223 PASS；未按 P4 文件格式/隔离/上传逐项映射精确 Go 测试，不能据此判 AC 通过。

| 证据 | 结果 | 边界 |
|---|---|---|
| `cd backend && go test ./... -count=1 -json` | 223/223 PASS（26 包，0 fail/skip） | 全量套件通过；未按本域 PRD 逐一命名 |
| 前端/ E2E 交叉证据 | 见 `frontend.md` 与 `evidence.md` | 仅覆盖展示/主路径，不替代后端 AC |

## 6. 未验证 / 风险

- 上传未验收
- 预览未执行
- 工作区隔离未验证
- PDF/Office/图片生成矩阵缺失
- 列表聚合/分页未测
- 未执行逐路由 HTTP 契约矩阵（400/403/404/409/500）。
- 未做并发、迁移回滚、崩溃恢复与长时间运行测试。
