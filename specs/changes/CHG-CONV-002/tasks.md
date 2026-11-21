# CHG-CONV-002 · 任务卡

状态：**partial**（未派发）
Implements: PRD-CONV-004、PRD-CONV-007

| 任务 | owner | scope | AC | 证据 | 状态 |
|---|---|---|---|---|---|
| TASK-CHG-CONV-002-01 时间轴目标尺寸 | 前端 + 测试 | `frontend/src/components/TimelineGroups` 渲染断言 | `AC-CONV-007-02` | 新增 DOM 测量用例：点击区 bounding box ≥44×44；`npm test` | `todo` |
| TASK-CHG-CONV-002-02 消息纯度产品 AC | 产品 | `specs/product/P1-CONV/spec.md` §4.2 增加 AC | `AC-CONV-004-01` 拆分 | 产品 spec diff + 本包 §4 证据映射更新 | `todo` |
| TASK-CHG-CONV-002-03 真实 413/403 联调 | 测试 + 后端 | `frontend/e2e/`、后端起服脚本 | `AC-CONV-004-02`、`AC-CONV-007-02` | E2E：真实后端返回 413/403 时的 UI 表现；截图 + 报告 | `todo` |
| TASK-CHG-CONV-002-04 COMP 状态回写 | 设计 + 验收 Agent | `specs/COMP-message-colors/spec.md`、`COMP-timeline-groups`、`COMP-timeline-tip` | 六类产物中的"组件 spec" | 状态从 `approved 待实现`/`spec ready` 改为与实际一致；独立签字 | `todo` |
| TASK-CHG-CONV-002-05 长祖先链上限契约 | 产品 + 后端 | 产品 spec §4.2、`all_messages` 契约 | `AC-CONV-007-02` | 明确 16 层上限的 UI 行为（截断提示或分页）；测试断言 | `todo` |

## 依赖

- 02 是 03 的前置（AC 定义后才好断言）。
- 04 需独立验收 Agent，不由实现者自签。
- 05 若改为分页，需先改产品 spec 再动后端。

## 回滚

01/03 为测试与前端改动，按提交 revert；02/04/05 为文档，按提交 revert。
