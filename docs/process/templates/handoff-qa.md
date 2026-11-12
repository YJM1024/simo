# HANDOFF · 前端/测试 → QA/发布

> 模板：前端把可测 build 交给测试；测试把 evidence 交给发布。只写可复跑证据，不写“已通过”。

## A. 前端 → 测试（Build Handoff）

| 字段 | 内容 |
|---|---|
| CHANGE-ID | |
| buildId/URL/commit | |
| 前端 owner | |
| 测试接收 | |
| 范围/路由/组件 | |
| 测试数据/开关 | |

- 自测：tsc/build/关键交互（命令/结果）：
- 截图：1600/1180/375（+ 指定档位/浮层打开）：
- DOM/测量：关键尺寸/对齐/无横向滚动：
- 已知问题/未覆盖：
- 接收判据：build 可访问、截图可复跑、已知问题透明；否则退回。

## B. 测试 → 发布（Release Evidence）

| 字段 | 内容 |
|---|---|
| 版本/范围 | |
| 测试结论（通过/失败/未跑） | |
| 失败清单/豁免 | |
| 截图/证据路径 | |
| **组件 parity** | `component-parity.md`、`component-parity-1600.png`、`component-parity-375.png`；基线=冻结原型；当前 build；逐组件对齐结果 |
| 迁移/备份/回滚演练 | |
| 风险/已知问题 | |
| Go/No-Go | |

- AC 映射/证据：
- 未跑项/谁批：
- 回滚命令/包：
- 签字：测试 ___ / 验收 Agent ___ / Lead ___

## 链接

- `test-plan.md` / `evidence.md`
- `docs/process/ROLES.md` 交接
