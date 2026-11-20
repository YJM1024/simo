# 产品域 Spec（P1–P10）

> 一能力域一份 `spec.md`；功能点作为章节（`PRD-xxx`），不按功能点拆文件。
> 索引与状态见 [`../../docs/product/TREE.md`](../../docs/product/TREE.md)；追溯见 [`../../docs/product/TRACEABILITY.md`](../../docs/product/TRACEABILITY.md)。
> 新建/改域时复制 [`../templates/product-spec.md`](../templates/product-spec.md)，保留 PRD/AC/实现状态三态。

| 域 | 名称 | spec | 测试计划 |
|---|---|---|---|
| P1 | 会话与消息 | [spec](P1-CONV/spec.md) | [test-plan](../test/P1-CONV/test-plan.md) |
| P2 | 任务与执行 | [spec](P2-TASK/spec.md) | [test-plan](../test/P2-TASK/test-plan.md) |
| P3 | 工作台与视图 | [spec](P3-WORK/spec.md) | [test-plan](../test/P3-WORK/test-plan.md) |
| P4 | 文件与交付物 | [spec](P4-FILE/spec.md) | [test-plan](../test/P4-FILE/test-plan.md) |
| P5 | 记忆 | [spec](P5-MEM/spec.md) | [test-plan](../test/P5-MEM/test-plan.md) |
| P6 | 团队与智能体 | [spec](P6-TEAM/spec.md) | [test-plan](../test/P6-TEAM/test-plan.md) |
| P7 | 调度 | [spec](P7-SCHED/spec.md) | [test-plan](../test/P7-SCHED/test-plan.md) |
| P8 | 设置与系统 | [spec](P8-SET/spec.md) | [test-plan](../test/P8-SET/test-plan.md) |
| P9 | 工具与能力 | [spec](P9-TOOL/spec.md) | [test-plan](../test/P9-TOOL/test-plan.md) |
| P10 | 指标 | [spec](P10-METRIC/spec.md) | [test-plan](../test/P10-METRIC/test-plan.md) |

## 约定

1. 状态行必须非空；每个 PRD 必须有目标行为、AC、实现状态（`implemented`/`partial`/`unimplemented`）。
2. `unimplemented` 必须逐项标注，不得用“已支持”描述。
3. 改行为先改本域 spec，再开 `specs/changes/<CHG>/`；不改行为的修复只开 change。
4. 每个 PRD 至少映射一个 `TEST-<DOMAIN>-NNN` 用例；证据缺失写 `missing`。
5. 技术域码（CONV/TASK/...）仍用于 PRD/AC 前缀；P1–P10 是产品域分组，不改变已有 ID。
