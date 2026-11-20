# 测试计划（按产品域）

> 一能力域一份 test-plan；用例按 PRD 分节，E2E 可放 `specs/test/e2e/`。
> 当前 10 份均为**骨架**：用例已定义，执行证据为 `missing`。
> 新建/改域时复制 [`../templates/test-plan.md`](../templates/test-plan.md)。

| 域 | 名称 | 测试计划 | PRD 数 |
|---|---|---|---:|
| P1 | 会话与消息 | [test-plan](P1-CONV/test-plan.md) | 12 |
| P2 | 任务与执行 | [test-plan](P2-TASK/test-plan.md) | 6 |
| P3 | 工作台与视图 | [test-plan](P3-WORK/test-plan.md) | 5 |
| P4 | 文件与交付物 | [test-plan](P4-FILE/test-plan.md) | 6 |
| P5 | 记忆 | [test-plan](P5-MEM/test-plan.md) | 6 |
| P6 | 团队与智能体 | [test-plan](P6-TEAM/test-plan.md) | 6 |
| P7 | 调度 | [test-plan](P7-SCHED/test-plan.md) | 5 |
| P8 | 设置与系统 | [test-plan](P8-SET/test-plan.md) | 12 |
| P9 | 工具与能力 | [test-plan](P9-TOOL/test-plan.md) | 7 |
| P10 | 指标 | [test-plan](P10-METRIC/test-plan.md) | 6 |

## 用例规则

- 用例 ID：`TC-<P域>-NNN`；域级边界：`TC-<P域>-E1/E2/E3`。
- 每个用例必须写：对应 PRD、前置、步骤、断言、自动化层级、当前证据。
- 没有执行记录就写 `missing`；skip 必须写原因与 owner。
- 不伪造覆盖率；测试计划存在不等于覆盖。
- E2E 只覆盖跨域关键路径（会话发送→任务→文件→指标），当前待建。
