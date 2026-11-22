# CHG-B1-001 · 测试计划

状态：`proposed`（未执行，所有用例证据记 `missing`）

Covers: `AC-TASK-001-01` `AC-TASK-001-02` `AC-TASK-001-03` `AC-TASK-001-04` `AC-TASK-001-05` `AC-TASK-001-06` `AC-TASK-002-01` `AC-TASK-002-02` `AC-TASK-002-03` `AC-TASK-002-04` `AC-TASK-003-01` `AC-TASK-003-02` `AC-TASK-003-03` `AC-TASK-003-04` `AC-TASK-003-05` `AC-TASK-006-01` `AC-TASK-006-02` `AC-TASK-006-03` `AC-TASK-006-04` `AC-TASK-006-05` `AC-TASK-006-06` `AC-TASK-006-07` `AC-TASK-004-01` `AC-TASK-004-02` `AC-TASK-004-03` `AC-TASK-004-04` `AC-TASK-005-01` `AC-TASK-005-02` `AC-TASK-005-03` `AC-TASK-005-04` `AC-FILE-001-01` `AC-FILE-001-02` `AC-FILE-001-03` `AC-FILE-001-04` `AC-FILE-001-05` `AC-FILE-001-06` `AC-FILE-005-01` `AC-FILE-005-02` `AC-FILE-005-03` `AC-FILE-005-04` `AC-FILE-005-05` `AC-FILE-002-01` `AC-FILE-002-02` `AC-FILE-002-03` `AC-FILE-002-04` `AC-FILE-002-05` `AC-FILE-003-01` `AC-FILE-003-02` `AC-FILE-003-03` `AC-FILE-003-04` `AC-FILE-003-05` `AC-FILE-004-01` `AC-FILE-004-02` `AC-FILE-004-03` `AC-FILE-004-04` `AC-FILE-004-05` `AC-FILE-004-06` `AC-FILE-006-01` `AC-FILE-006-02` `AC-FILE-006-03` `AC-FILE-006-04` `AC-WORK-004-01` `AC-WORK-004-02` `AC-CHG-B1-001-01` `AC-CHG-B1-001-02` `AC-CHG-B1-001-03` `AC-CHG-B1-001-04` `AC-CHG-B1-001-05` `AC-CHG-B1-001-06` `AC-CHG-B1-001-07`

## 1. 执行顺序

先跑后端契约类用例（任务状态机、文件聚合、越界拒绝），再跑前端交互类用例（任务执行组、文件页、三态），最后跑端到端链路。每条用例失败时保留响应体与截图，不重试掩盖。

## 2. 用例分组

| 组 | 覆盖 AC | 用例 | 执行方式 |
|---|---|---|---|
| T1 任务读取与状态 | `AC-TASK-001-01`–`06` | 列表含新任务、单任务字段齐全、状态值封闭、非法 id 404 | `scripts/ac/AC-TASK-001-0N.mjs` |
| T2 进度与投影 | `AC-TASK-002-01`–`04` | progress 单调不减、投影反映状态、越界 `taskLimit` 400 | `scripts/ac/AC-TASK-002-0N.mjs` |
| T3 异步消息 | `AC-TASK-003-01`–`05` | 开始消息 1 条、结束消息 1 条、重启不重复写、消息在会话内可见 | `scripts/ac/AC-TASK-003-0N.mjs` + 日志行 |
| T4 取消/重试/预算/恢复 | `AC-TASK-006-01`–`07` | 取消幂等、retry attempt+1、预算触顶 blocked、重启恢复 | `scripts/ac/AC-TASK-006-0N.mjs` |
| T5 复杂度与确认 | `AC-TASK-004-01`–`04` | C0–C4 分级、确认事件、超时 | `scripts/ac/AC-TASK-004-0N.mjs`（实现后） |
| T6 子会话归属 | `AC-TASK-005-01`–`04` | 子会话任务的父会话归属、隔离 | `scripts/ac/AC-TASK-005-0N.mjs`（实现后） |
| F1 文件列表 | `AC-FILE-001-01`–`06` | 三种 kind、分页、去重、非法 kind 400 | `scripts/ac/AC-FILE-001-0N.mjs` |
| F2 目录隔离 | `AC-FILE-005-01`–`05` | 路径穿越、internal 产物、跨会话、不存在会话 | `scripts/ac/AC-FILE-005-0N.mjs` |
| F3 上传 | `AC-FILE-002-01`–`05` | 正常上传、超限 413 `file_too_large`、批量回滚 | `scripts/ac/AC-FILE-002-0N.mjs` |
| F4 交付物卡片 | `AC-FILE-003-01`–`05` | 卡片字段、点击行为、空列表 | `scripts/ac/AC-FILE-003-0N.mjs` + 截图 |
| F5 预览与下载 | `AC-FILE-004-01`–`06` | 四种类型预览 200、下载 200 + attachment、文件名安全 | `scripts/ac/AC-FILE-004-0N.mjs` |
| F6 生成 | `AC-FILE-006-01`–`04` | PDF/Office/图片生成成功与失败回滚 | `scripts/ac/AC-FILE-006-0N.mjs`（B4） |
| E2E 出口 | `AC-CHG-B1-001-01`–`07` | 七条变更级出口判据 | `scripts/ac/AC-CHG-B1-001-0N.mjs` + 截图 |

## 3. 证据格式

- 脚本输出：stdout 一行 JSON `{"ac","pass","detail","evidence"}`，退出码 0/1/2。
- 截图：8787 端口走查，文件名 `docs/evidence/B1/<AC-ID>.png`。
- 日志：`backend` 侧日志行按 AC 编号贴到 `evidence.md`。

## 4. 当前状态

- 所有用例尚未执行：脚本尚未创建（`scripts/ac/AC-CHG-B1-001-*.mjs` 不存在），证据一律 `missing`。
- `PRD-TASK-003/004/005` 的实现是 `unimplemented`，对应用例在实现前只能记 `blocked`。
- 本轮只验证文档门禁（`check-trace`、`check-sdd`），不把文档门禁通过当成功能通过。
