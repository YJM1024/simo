# TASKS · <CHANGE-ID>

> 模板：每个任务必须有 owner/scope/AC/依赖/证据；缺一不派发。

## 任务表

| ID | 任务 | Owner | 写作用域 | 依赖 | AC/验收 | 证据 | 状态 |
|---|---|---|---|---|---|---|---|
| T1 | | | `docs/` / `frontend/` / `backend/` | | A1 | 命令/截图/测试 | todo |
| T2 | | | | T1 | A2 | | todo |

## 拆分要求

- 一个任务只承担一个可验收能力；
- 写作用域不重叠；并行任务必须有依赖/接口冻结；
- 每个任务链接到 spec 的 R/A 编号；
- 组件任务必须含“画廊登记/截图”；后端任务必须含“契约/迁移/回滚”；
- 未写 owner/scope/AC/证据 → 打回。

## 状态

- todo / in_progress / blocked / review / done
- 阻塞原因/等待谁：

## 链接

- `task-card.md`（单卡模板）
- `docs/process/ROLES.md` 角色交接
