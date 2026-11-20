# 司墨产品 ID 规范（ID-SPEC）

> 状态：**active**（2026-11-20）
> 适用范围：`docs/`、`specs/`、`frontend/`、`backend/` 中所有需求、变更、开发、组件、测试、任务与验收记录。
> 本文件只定义“怎么编号、怎么引用、怎么追溯”；产品功能树见 [`TREE.md`](TREE.md)，覆盖矩阵见 [`TRACEABILITY.md`](TRACEABILITY.md)，缺口见 [`SPEC-GAP.md`](SPEC-GAP.md)。

## 1. 目标

1. **稳定**：ID 一经分配不复用；功能改名、文件移动、实现重写都不改 ID。
2. **可读**：看 ID 能判断类型与能力域，不靠查表。
3. **可追溯**：任一功能点能沿 `PRD → CHANGE → 开发 spec → 组件 → 任务 → TEST → ACC` 走通。
4. **不爆炸**：功能点不各占一个文件；长期规格按能力域聚合，变更按变更包聚合。
5. **向后兼容**：既有 FE-001–FE-009、COMP-* 不重命名，只做别名映射。

## 2. 能力域

| 域码 | 名称 | 范围 |
|---|---|---|
| `CONV` | 会话与消息 | 会话树、消息流、发送/流式、输入、时间轴、未读 |
| `TASK` | 任务与执行 | 任务生命周期、执行组、复杂度/确认、子会话、取消/重试、预算 |
| `WORK` | 工作台与视图 | 工作台、统计卡、趋势、交付物入口、自定义视图 |
| `FILE` | 文件与交付物 | 会话文件、上传/附件、交付物、预览/下载、工作区输出、文件生成 |
| `MEM` | 记忆 | 条目/作用域、实体/关系、冲突、召回、向量/巩固、迁移 |
| `TEAM` | 团队与智能体 | 智能体 roster、团队/成员、模板/触发器、投影、内部隔离、任务板 |
| `SCHED` | 调度 | 定时任务、重跑、重复规则、失败/通知 |
| `SET` | 设置与配置 | 模型/Provider、权限、外观、数据目录/备份、快捷键、能力管理 |
| `TOOL` | 工具与能力 | 工具注册/执行/审计、权限沙箱、Skills、MCP、CLI、联网 |
| `METRIC` | 指标 | 系统/任务/延迟指标、时间窗、明细、导出 |
| `SYNC` | 多端与同步 | WS、多标签、设置同步、未读、远程/通知 |
| `SYS` | 系统与运维 | 鉴权边界、权限 fail-closed、健康/运行时、备份/迁移、日志、安装/升级 |

新增域必须先改本表并说明边界；不得用“其他/杂项”作为域码。

## 3. ID 格式

### 3.1 总表

| 类型 | 格式 | 示例 | 分配者 | 生命周期 |
|---|---|---|---|---|
| 产品功能点 | `PRD-<DOM>-<NNN>` | `PRD-CONV-001` | 产品/设计 | 长期；不删除，只置 `deprecated` |
| 验收条目 | `AC-<PRD-ID>-<NN>` | `AC-PRD-CONV-001-01` | 产品/设计 | 跟随 PRD；可新增，不重用 |
| 变更 | `CHG-<主域>-<NNN>` | `CHG-CONV-001` | 变更发起人 | 一次变更；完成后归档 |
| 前端开发 spec | `FE-<DOM>-<NNN>` | `FE-CONV-001` | 前端/设计 | 跟随变更或长期 |
| 后端开发 spec | `BE-<DOM>-<NNN>` | `BE-CONV-001` | 后端 | 跟随变更或长期 |
| 组件 | `COMP-<kebab>` | `COMP-composer-send-mode` | 前端/设计 | 长期；组件废弃后保留 |
| 测试计划 | `TEST-<DOM>` | `TEST-CONV` | 测试 | 长期，按域一份 |
| 测试用例 | `TEST-<DOM>-<NNN>` | `TEST-CONV-001` | 测试 | 长期；可废弃，不重用 |
| E2E 计划/用例 | `TEST-E2E` / `TEST-E2E-<NNN>` | `TEST-E2E-001` | 测试 | 长期 |
| 任务卡 | `TASK-<CHANGE-ID>-<NN>` | `TASK-CHG-CONV-001-01` | Lead/owner | 一次任务 |
| 验收记录 | `ACC-<CHANGE-ID>-<NN>` | `ACC-CHG-CONV-001-01` | 验收人 | 一次验收 |

补充规则：
- `<NNN>` 至少三位，从 `001` 起；超过 999 时扩位，不回收旧号。
- `<NN>` 至少两位，从 `01` 起。
- 变更跨域时用**主域**编号，并在 `Domains:` 字段列出全部域；不允许多个头。
- 功能点只属于一个主域；跨域能力在 TREE 中用主域归属 + “关联域”说明，不复制 PRD。
- 旧式 `FE-001`–`FE-009` 是历史编号，不再新增；新前端开发 spec 用 `FE-<DOM>-<NNN>`。

### 3.2 锚点

产品 spec 中每个功能点必须带稳定锚点，避免标题改名后链接失效：

```md
<a id="prd-conv-001"></a>
### PRD-CONV-001 会话树与主会话

...
```

引用格式：

```md
[PRD-CONV-001](../../specs/product/P1-CONV/spec.md#prd-conv-001)
```

变更/测试文档引用 PRD 时至少写一次完整 ID；同一节内可简写，但不得只写中文标题。

## 4. 文件落点

| 类型 | 路径模式 | 说明 |
|---|---|---|
| 产品域 spec | `specs/product/<DOMAIN>/spec.md` | 一域一份；功能点作为章节 |
| 变更包 | `specs/changes/<CHANGE-ID>/` | 一次变更一个目录；完整/轻量见全局 spec 规则 |
| 前端开发 spec | `specs/changes/<CHANGE-ID>/frontend.md` | 跨域大改可拆 `frontend-<part>.md` |
| 后端开发 spec | `specs/changes/<CHANGE-ID>/backend.md` | 跨域大改可拆 `backend-<part>.md` |
| 组件 spec | `specs/COMP-<kebab>/spec.md` | 一组件/组件组一份 |
| 测试计划 | `specs/test/<DOMAIN>/test-plan.md` | 一域一份；用例按 PRD 分节 |
| E2E 测试 | `specs/test/e2e/test-plan.md` | 跨域关键路径 |
| 任务卡 | 变更包 `tasks.md` 或项目任务文档 | 必须有 owner/scope/AC/证据 |
| 验收证据 | 变更包 `evidence.md` + 项目验收文档 | 不只在聊天里 |

产品 spec 与测试计划**不按功能点拆文件**。功能点只在域 spec 内占一个 `###` 章节。

## 5. 必备引用字段

每个产物头部或首段必须能被机器/人快速定位：

### 5.1 产品域 spec

```md
状态：active
Owner: <角色/人名>
Domains: CONV
```

### 5.2 变更 spec

```md
状态：ready
Implements: PRD-CONV-001, PRD-CONV-005
Domains: CONV, SYNC
Owner: <角色/人名>
```

### 5.3 前端/后端开发 spec

```md
Change: CHG-CONV-001
Implements: PRD-CONV-001
Scope: <页面/模块/文件范围>
N/A: <仅当该类不适用时写理由>
```

### 5.4 组件 spec

```md
组件: COMP-<kebab>
Owner: <角色/人名>
Used by: PRD-CONV-001, PRD-CONV-004
```

### 5.5 测试计划/用例

```md
Domain: CONV
Covers: PRD-CONV-001, PRD-CONV-005
```

用例标题或表头：

```text
TEST-CONV-001 | Covers: AC-PRD-CONV-001-01 | 层级: component | 状态: 已实现未执行
```

### 5.6 任务卡

```text
Task: TASK-CHG-CONV-001-01
Change: CHG-CONV-001
AC: AC-PRD-CONV-001-01
Owner: <唯一负责人>
Scope: <允许修改；明确不碰什么>
Evidence: <命令/截图/日志>
```

## 6. 状态

### 6.1 统一状态词

| 状态 | 含义 | 可用于 |
|---|---|---|
| `draft` | 草稿，未评审 | PRD/CHG/FE/BE/COMP/TEST |
| `ready` | 已评审，可开工 | PRD/CHG/FE/BE/COMP/TEST |
| `in-progress` | 正在实现 | PRD/CHG/FE/BE/COMP |
| `implemented` | 代码完成，未验证 | CHG/FE/BE/COMP |
| `verified` | 测试通过，待验收 | CHG/FE/BE/COMP/TEST |
| `accepted` | 已验收签字 | PRD/CHG/COMP |
| `partial` | 部分实现/部分验收 | PRD |
| `blocked` | 有明确阻塞与责任人 | 全部 |
| `deprecated` | 保留但不再维护 | PRD/COMP |
| `superseded` | 被新版本替代 | PRD/CHG/FE/BE/COMP |
| `archived` | 已完成归档 | CHG/TASK |

规则：
- `implemented` ≠ `accepted`；实现者不得把任务标成 `accepted`。
- 产品功能点可用 `partial`，但必须在 TREE 注释缺口；不得用 `partial` 掩盖无测试。
- 状态变更必须带日期与证据链接；只改字不写证据视为无效。

### 6.2 状态与门禁

| 进入状态 | 最低条件 |
|---|---|
| `ready` | 产品 spec/变更 spec 有目标、非目标、AC；评审通过 |
| `in-progress` | 开发 spec、任务卡、测试计划已就位 |
| `implemented` | 代码完成；自测通过；无未处理异常 |
| `verified` | 测试用例执行通过；证据归档；无跳过未记录 |
| `accepted` | 独立验收签字；追溯矩阵无未解释 `gap` |

## 7. 追溯要求

追溯矩阵至少包含：

```text
PRD | 产品 spec | CHANGE | 前端 spec | 后端 spec | 组件 spec | 任务卡 | TEST | 覆盖状态 | 缺口
```

规则：
1. 每个 `PRD` 至少有一个 `CHANGE` 写 `Implements`。
2. 每个 `CHANGE` 至少有一个前端或后端开发 spec；另一侧写 `N/A + 理由`。
3. 每个 `AC` 至少有一个 `TEST` 用例 `Covers`。
4. 每个任务卡必须带 `Change` 与 `AC`。
5. 组件被新增/修改时，必须有 `COMP`；仅使用现有组件可写 `N/A：复用 COMP-xxx`。
6. 覆盖状态只允许 `covered` / `partial` / `gap` / `n/a`；`gap` 必须写补课 owner 与目标日期。
7. 不允许“有 spec 无测试”标成 `covered`；不允许“有测试无 AC”标成 `covered`。

## 8. 旧编号映射

既有编号不重命名，保留原名；新体系用别名映射：

| 旧 ID/目录 | 新类型 | 新 ID | 备注 |
|---|---|---|---|
| `FE-001-frontend-rebuild` | 历史变更包 | `CHG-LEGACY-001` | 别名 FE-001 |
| `FE-002-chat-robustness` | 历史变更包 | `CHG-LEGACY-002` | 别名 FE-002 |
| `FE-003-chat-capabilities` | 历史变更包 | `CHG-LEGACY-003` | 别名 FE-003 |
| `FE-004-first-run-empty` | 历史变更包 | `CHG-LEGACY-004` | 别名 FE-004 |
| `FE-005-workbench` | 历史变更包 | `CHG-LEGACY-005` | 别名 FE-005 |
| `FE-006-chat-experience` | 历史变更包 | `CHG-LEGACY-006` | 别名 FE-006 |
| `FE-007-ancestor-messages` | 历史变更包 | `CHG-LEGACY-007` | 别名 FE-007 |
| `FE-008-metrics-dashboard` | 历史变更包 | `CHG-LEGACY-008` | 别名 FE-008 |
| `FE-009-web-multitab` | 历史变更包 | `CHG-LEGACY-009` | 别名 FE-009-web-multitab |
| `FE-009-frontend-tests` | 历史变更包 | `CHG-LEGACY-010` | 别名 FE-009-frontend-tests；目录编号与上一行冲突，保留但不再新增 |
| `COMP-conversation-panel` | 组件 | `COMP-conversation-panel` | 不变 |
| `COMP-timeline-groups` | 组件 | `COMP-timeline-groups` | 不变 |
| `COMP-timeline-tip` | 组件 | `COMP-timeline-tip` | 不变 |
| `COMP-message-colors` | 组件 | `COMP-message-colors` | 不变 |
| `COMP-composer-send-mode` | 组件 | `COMP-composer-send-mode` | 不变 |

冲突处理：
- 两个 `FE-009` 目录都已存在，短期保留；新文档引用必须写全名（`FE-009-web-multitab` / `FE-009-frontend-tests`），不得只写 `FE-009`。
- 后续如需物理改名，先在新旧路径同时保留一个版本周期，并在 `specs/README.md` 登记别名，避免断链。
- 任何新功能不得再申请纯数字 `FE-xxx`；必须用 `FE-<DOM>-<NNN>` 或直接使用 `CHG-<DOM>-<NNN>`。

## 9. 分配与校验

### 9.1 分配流程

1. 先查 TREE 是否已有同一 `PRD`；有则复用，不新建。
2. 在 `docs/product/TREE.md` 增加/更新功能点，分配 `PRD-<DOM>-<NNN>`。
3. 建变更包，分配 `CHG-<主域>-<NNN>`，写 `Implements`。
4. 开发 spec、组件、任务、测试分别用本文件格式编号。
5. 更新 `TRACEABILITY.md`；无矩阵更新不得标记完成。

### 9.2 校验清单

- [ ] ID 是否含域码，且域码在 §2 表内？
- [ ] 是否复用了已废弃/已归档 ID？
- [ ] 变更是否写了 `Implements` 与 `Domains`？
- [ ] 前端/后端是否至少一侧有 spec，另一侧有 `N/A + 理由`？
- [ ] 新增/修改组件是否有 `COMP`？
- [ ] 每个 AC 是否至少有一个 TEST 用例 `Covers`？
- [ ] 任务卡是否有 `Change` 与 `AC`？
- [ ] 追溯矩阵是否无未解释 `gap`？
- [ ] 旧编号引用是否写全名，未使用裸 `FE-009`？

## 10. 示例（仅格式，不代表已实现）

```md
<a id="prd-conv-001"></a>
### PRD-CONV-001 会话树与主会话

- 场景：用户有主会话与多个子会话，需要快速切换并保持上下文。
- 行为：主会话固定；子会话按创建顺序展示；切换后消息区与右栏同步刷新。
- AC：
  - AC-PRD-CONV-001-01：主会话始终可见且不可归档。
  - AC-PRD-CONV-001-02：切换子会话后，消息区、时间轴、概览均指向新会话。
- 状态：partial
- 关联域：TASK（子会话任务归属）
```

对应变更：

```md
状态：ready
Implements: PRD-CONV-001
Domains: CONV, TASK
Change: CHG-CONV-001
```

## 12. 产品域 P1–P10（2026-11-20 落地）

技术域码仍为 12 个（CONV/TASK/WORK/FILE/MEM/TEAM/SCHED/SET/TOOL/METRIC/SYNC/SYS），产品域按 P1–P10 分组：

| 产品域 | 名称 | 技术域码 | spec | test |
|---|---|---|---|---|
| `P1` | 会话与消息 | `CONV`、`SYNC` | `specs/product/P1-CONV/spec.md` | `specs/test/P1-CONV/test-plan.md` |
| `P2` | 任务与执行 | `TASK` | `specs/product/P2-TASK/spec.md` | `specs/test/P2-TASK/test-plan.md` |
| `P3` | 工作台与视图 | `WORK` | `specs/product/P3-WORK/spec.md` | `specs/test/P3-WORK/test-plan.md` |
| `P4` | 文件与交付物 | `FILE` | `specs/product/P4-FILE/spec.md` | `specs/test/P4-FILE/test-plan.md` |
| `P5` | 记忆 | `MEM` | `specs/product/P5-MEM/spec.md` | `specs/test/P5-MEM/test-plan.md` |
| `P6` | 团队与智能体 | `TEAM` | `specs/product/P6-TEAM/spec.md` | `specs/test/P6-TEAM/test-plan.md` |
| `P7` | 调度 | `SCHED` | `specs/product/P7-SCHED/spec.md` | `specs/test/P7-SCHED/test-plan.md` |
| `P8` | 设置与系统 | `SET`、`SYS` | `specs/product/P8-SET/spec.md` | `specs/test/P8-SET/test-plan.md` |
| `P9` | 工具与能力 | `TOOL` | `specs/product/P9-TOOL/spec.md` | `specs/test/P9-TOOL/test-plan.md` |
| `P10` | 指标 | `METRIC` | `specs/product/P10-METRIC/spec.md` | `specs/test/P10-METRIC/test-plan.md` |

- PRD 仍用技术域码，如 `PRD-CONV-001`；P1–P10 只用于产品域分组/目录，不重编号。
- 产品域 spec 路径：`specs/product/<P*-*>/spec.md`；测试计划路径：`specs/test/<P*-*>/test-plan.md`。
- 旧 FE 目录映射为 `CHG-LEGACY-001..010`，不重命名。
