# CHG-CONV-001 · 任务卡

状态：**partial**（任务未派发；执行前需 Lead 确认优先级）
Implements: PRD-CONV-001、PRD-CONV-002、PRD-CONV-003

> 四要素：owner / scope / AC / 证据。证据列写"什么命令/文件能证明完成"，未执行前一律 `missing`。

| 卡 | 任务 | owner | scope | 依赖 | AC | 证据 | 状态 | 评审人 | 禁止项 |
|---|---|---|---|---|---|---|---|---|---|
| TASK-CHG-CONV-001-01 | 标题搜索接线 | 前端 | `frontend/src/api.ts`、`frontend/src/app.tsx` 搜索 effect | 无 | `AC-CONV-003-01` | `api.listSessions({q,pinned})` 单测 + Sidebar 搜索走标题搜索的集成用例；`npm test` 全绿 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-001-02 | 后端 q/pinned 参数文档化 | 后端 | `specs/changes/CHG-CONV-001/backend.md`（本轮已写），实现不改 | TASK-CHG-CONV-001-01 | `AC-CONV-003-01` | `TestUI1SessionSearchAndPin` 已存在；补 `q` 多命中/`pinned` 组合断言 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-001-03 | 生命周期失败反馈 | 前端 | `frontend/src/app.tsx:450,530`（rename/toggleArchive） | 无 | `AC-CONV-002-02` | 新增失败注入用例（mock reject）断言可见错误 + 输入不丢；`npm test` | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-001-04 | 主会话不可归档边界 | 产品 + 后端 | `specs/product/P1-CONV/spec.md` §4.1（新 AC）、sessions 服务 | 无 | `AC-CONV-001-02` 补充项 | 产品 AC 定稿 + `TestMainSessionArchiveRejected`（待建）；缺一不签 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-001-05 | 列表/树 E2E 断言 | 测试 | `frontend/e2e/`（后续实现者） | TASK-CHG-CONV-001-01 | `AC-CONV-001-01` | E2E：点击会话 → 中栏标题/消息切换；截图 + 报告 | `todo` | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |
| TASK-CHG-CONV-001-06 | 未读口径决策（转 SYNC-004） | 产品 | 产品 spec 新增未读 AC | 产品口径（外部） | `AC-CONV-003-02`、`AC-SYNC-004-01` | 决策记录 + 产品 spec diff；后端表/游标方案另开 `CHG-CONV-005` | `blocked`（等产品） | 验收 Agent | 不改 `frontend/`、`backend/` 实现；不改产品 AC 文本；不跑 git；不删文件 |

## 依赖

- 01 依赖 02 的契约确认（参数名 `q`/`pinned`）。
- 04 依赖产品 PRD/AC 更新；未更新前 `AC-CONV-001-02` 不能关闭。
- 06 与 `CHG-CONV-005`（未读与通知）共用决策，二者不得并行改产品 spec。

## 回滚

每张卡独立可回滚；01/03 属前端行为改动，回滚 = revert 提交；02/04/06 属文档，回滚 = revert 文档提交。
