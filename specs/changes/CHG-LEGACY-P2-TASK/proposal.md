# PROPOSAL · CHG-LEGACY-P2-TASK

- 变更 ID：CHG-LEGACY-P2-TASK
- 类型：历史能力归档（docs-only）
- Owner：product + frontend + backend（归档）
- 日期：2026-11-20
- 关联产品域：`specs/product/P2-TASK/spec.md`
- 状态：archived / partial（不表示 任务与执行 已完整交付）

## 1. 背景

任务主数据与 HTTP 路由已经存在，但前端只展示概览/右栏定位；长任务异步、复杂度门禁、子会话任务归属尚未实现。需要先把“已存在”与“未实现”分开归档。

本包不是新功能实现，也不把“已有部分测试”写成“产品完成”。它只回答三个问题：已有代码/接口在哪里、已有真实证据覆盖到哪、剩余缺口是什么。

## 2. 目标

1. 为 CHG-LEGACY-P2-TASK 的每个 PRD 建立 CHANGE 级追溯，消除 `check-trace` 的“PRD without change”提示。
2. 把前端、后端、测试证据拆开记录；没有执行证据的 AC 明确写 `missing`。
3. 维持产品覆盖口径 **0 covered / 0 partial / 6 gap**，不因本包升级 covered。

成功标准：每个 PRD 至少有一行需求/事实/状态/证据；每个 AC 都能回指真实文件、测试套件或明确的 missing。

## 3. 范围

### In scope（只读审计 + 归档）

- tasks 后端、执行组、任务概览与右栏展示 的现有文件、API、组件与测试结果。
- 2026-11-20 的前端 69/69、CDP E2E 11/11、后端 223/223 证据中与本域相关的部分。
- 新建 `specs/changes/CHG-LEGACY-P2-TASK/**` 七件套。

### Out of scope

- 不实现任何缺失 PRD，不修改产品 spec、TREE 状态、验收记录或业务代码。
- 不新增测试、不启动/重启 8787、不接触正式数据。
- 不把 domain test-plan 的用例级 pass 等同于 PRD covered。

## 4. 影响面

| 层 | 影响 |
|---|---|
| 前端 | 仅归档现有组件与测试；不改代码 |
| 后端 | 仅归档现有 API/文件；不改代码 |
| 数据 | 不新增/迁移表，不写正式数据 |
| 测试 | 只引用已执行证据；不新增测试 |
| 文档 | 新增 `specs/changes/CHG-LEGACY-P2-TASK/**`，更新该域 CHANGE 追溯 |

## 5. 方案比较

| 方案 | 结论 |
|---|---|
| A. 直接把 任务与执行 标成完成并补测试计划为 pass | 拒绝：没有完整 AC/前后端/任务/证据闭环 |
| B. 只写一份域总结 | 不足：无法按 PRD 追溯 CHANGE 与证据 |
| C. 历史归档包 + 真实证据 + 缺口（采用） | 保留可续接事实，不虚构覆盖 |

## 6. 风险、依赖与假设

- 风险：`partial` 容易被误读为“大部分完成”；本包在 `evidence.md` 逐 PRD 列出未覆盖点。
- 依赖：已有测试报告与 test-plan 的锚点；若报告移动，CHANGE 链接需同步。
- 假设：本包只做历史归档，后续实现应另开实现型 CHG，而不是在本包内扩 scope。
- 待确认：缺失 PRD 的优先级由产品 backlog 决定，不在本包承诺时间。

## 7. 决策请求

1. 接受本包为 **历史归档 + 缺口清单**，不据此把产品状态升级为 completed。
2. 接受未实现/未验证项继续留在 backlog 或 gap。
3. 后续实现另开 CHG，复用本包的 PRD/证据基线。

## 8. 链接

- 产品 spec：[任务与执行](../../product/P2-TASK/spec.md)
- [spec.md](spec.md)
- [backend.md](backend.md)
- [frontend.md](frontend.md)
- [tasks.md](tasks.md)
- [test-plan.md](test-plan.md)
- [evidence.md](evidence.md)
