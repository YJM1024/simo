# CHG-CONV-005 · 任务卡

状态：**blocked**（全部任务等产品决策，不得派发执行）
Implements: PRD-SYNC-004、PRD-SYNC-005

| 任务 | owner | scope | AC | 证据 | 状态 |
|---|---|---|---|---|---|
| TASK-CHG-CONV-005-01 未读口径决策 | 产品 | 产品 spec §4.4 新增/修订 AC | `AC-SYNC-004-01` | 决策记录（六问逐条答案 + 多标签合并规则） | `blocked`（等产品） |
| TASK-CHG-CONV-005-02 游标数据模型 | 后端 | 迁移 + `sessions` 模块 | `AC-SYNC-004-01` | 表设计 + 迁移/回滚 + 单测 | `blocked`（等 01） |
| TASK-CHG-CONV-005-03 未读 API 与前端徽标 | 后端 + 前端 | `GET /api/unread`、`PUT read-cursor`、Sidebar props | `AC-SYNC-004-01` | API 测试 + Sidebar 徽标用例 + E2E | `blocked`（等 02） |
| TASK-CHG-CONV-005-04 全站未读不造假 | 前端 | 未读接口失败降级 | `AC-SYNC-004-02` | 失败注入用例：显示"未知"而非 0 | `blocked`（等 03） |
| TASK-CHG-CONV-005-05 远程访问鉴权决策 | 产品 + 安全 | SYS 域 spec（跨域，需 Lead 批准） | `AC-SYNC-005-01` | 鉴权模型文档 + 威胁清单 | `blocked`（跨域未就绪） |
| TASK-CHG-CONV-005-06 通知中心产品定义 | 产品 | 产品 spec §4.4 | `AC-SYNC-005-01` | 渠道/去重/免打扰/离线/隐私定义 | `blocked`（等产品） |

## 说明

- 6 张卡全部 `blocked`，**不是** `todo`：缺产品输入，先做即违反"无产品 spec 不开工"。
- 05 属 SYS 域，不得由 P1 单方面推进；若 Lead 决定不做，应将 SYNC-005 明确移出 P1 范围并更新 TREE/产品 spec。
- 解锁条件见 `proposal.md` §5。

## 回滚

无代码改动，无需回滚；决策文档按提交 revert。
