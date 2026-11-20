# P1 · 会话与消息（产品域 Spec）

状态：**active**（产品域 spec；实现状态逐项标注，不把接口存在当产品完成）
> 产品域：`P1`；技术域码：`CONV`、`SYNC`；ID 规则见 [`../../../docs/product/ID-SPEC.md`](../../../docs/product/ID-SPEC.md)。
> 对应测试计划：[`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；功能树：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；追溯：[TRACEABILITY.md](../../../docs/product/TRACEABILITY.md)。

## 1. 目标

把“会话与消息”从零散接口/旧 FE 规格收敛成可验收的产品能力：明确场景、行为、AC 与实现状态；**未实现的能力标 `unimplemented`，不得写成已完成**。

本域覆盖 12 个 L3 功能点：implemented 9、partial 2、unimplemented 1。

## 2. 非目标

- 不在本 spec 定义具体组件视觉与代码结构；组件契约见 `specs/COMP-*`，变更开发 spec 见 `specs/changes/<CHG>/`。
- 不把后端路由/数据库表存在等同于用户可用；没有入口或没有证据的能力最多算 `partial`。
- 不为本域每个功能点新建独立 spec；功能点在本文档内以 PRD 章节维护。
- 不在本轮修改代码、测试或部署。

## 3. 场景

- S1 会话管理：用户从会话与消息入口完成会话管理相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S2 消息与渲染：用户从会话与消息入口完成消息与渲染相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S3 输入与发送：用户从会话与消息入口完成输入与发送相关任务；正常、空、加载、错误与权限不足都必须有可见结果。
- S4 多标签与同步：用户从会话与消息入口完成多标签与同步相关任务；正常、空、加载、错误与权限不足都必须有可见结果。

## 4. 功能点与需求

> 每个功能点包含：PRD、优先级、实现状态、落地前差距、目标行为、AC。目标行为是**产品要求**，不是“已经实现”的声明。

### 4.1 L2 · 会话管理

#### PRD-CONV-001 · 会话树与主会话
<a id="prd-conv-001"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-003](../../FE-003-chat-capabilities/spec.md)；开发 [FE-001](../../FE-001-frontend-rebuild/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：FE-003 已签但无域级测试计划；主会话不可归档的边界未单列 AC。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 会话管理”中提供“会话树与主会话”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-001-01` 主路径：用户能完成“会话树与主会话”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-001-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-CONV-002 · 会话生命周期
<a id="prd-conv-002"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-001](../../FE-001-frontend-rebuild/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [FE-004](../../FE-004-first-run-empty/spec.md)；开发 [FE-001](../../FE-001-frontend-rebuild/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [FE-004](../../FE-004-first-run-empty/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：创建/重命名/归档/恢复分散在多个 FE，缺统一状态机。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 会话管理”中提供“会话生命周期”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-002-01` 主路径：用户能完成“会话生命周期”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-002-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-CONV-003 · 会话搜索与未读
<a id="prd-conv-003"></a>

- 优先级：P1
- 实现状态：`partial`
- 关联：CHANGE [FE-003](../../FE-003-chat-capabilities/spec.md)；开发 [FE-003](../../FE-003-chat-capabilities/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：搜索已实现；未读计数/已读游标只有零散实现，无域级 AC 与测试。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 会话管理”中提供“会话搜索与未读”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-003-01` 主路径：用户能完成“会话搜索与未读”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-003-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

### 4.2 L2 · 消息与渲染

#### PRD-CONV-004 · 消息流与渲染
<a id="prd-conv-004"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-001](../../FE-001-frontend-rebuild/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [COMP-message-colors](../../COMP-message-colors/spec.md)；开发 [FE-001](../../FE-001-frontend-rebuild/spec.md) / [FE-003](../../FE-003-chat-capabilities/spec.md) / [M1](../../../docs/m1-contract.md) / [M14](../../../docs/m14-contract.md)；组件 [COMP-message-colors](../../COMP-message-colors/spec.md)；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：消息纯度（无 system/静默噪音）无独立验收项。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 消息与渲染”中提供“消息流与渲染”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-004-01` 主路径：用户能完成“消息流与渲染”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-004-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-CONV-007 · 祖先消息整级加载
<a id="prd-conv-007"></a>

- 优先级：P1
- 实现状态：`implemented`
- 关联：CHANGE [FE-007](../../FE-007-ancestor-messages/spec.md) / [COMP-timeline-groups](../../COMP-timeline-groups/spec.md) / [COMP-timeline-tip](../../COMP-timeline-tip/spec.md)；开发 [FE-007](../../FE-007-ancestor-messages/spec.md) / [M1](../../../docs/m1-contract.md) / [M14](../../../docs/m14-contract.md)；组件 [COMP-timeline-groups](../../COMP-timeline-groups/spec.md) / [COMP-timeline-tip](../../COMP-timeline-tip/spec.md)；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：已签但未部署，生产可用性未证明；时间轴点击目标尺寸未单列。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 消息与渲染”中提供“祖先消息整级加载”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-007-01` 主路径：用户能完成“祖先消息整级加载”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-007-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

### 4.3 L2 · 输入与发送

#### PRD-CONV-005 · 发送·流式·断线重连
<a id="prd-conv-005"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-002](../../FE-002-chat-robustness/spec.md)；开发 [FE-002](../../FE-002-chat-robustness/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：断线重连无重复已验证，但“停止/失败恢复”未纳入同一 AC。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 输入与发送”中提供“发送·流式·断线重连”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-005-01` 主路径：用户能完成“发送·流式·断线重连”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-005-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-CONV-006 · Composer 输入与快捷键
<a id="prd-conv-006"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-006](../../FE-006-chat-experience/spec.md) / [COMP-composer-send-mode](../../COMP-composer-send-mode/spec.md)；开发 [FE-006](../../FE-006-chat-experience/spec.md) / [M1](../../../docs/m1-contract.md)；组件 [COMP-composer-send-mode](../../COMP-composer-send-mode/spec.md)；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：IME/发送模式/跨标签同步已有组件级契约，缺产品级 AC。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 输入与发送”中提供“Composer 输入与快捷键”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-CONV-006-01` 主路径：用户能完成“Composer 输入与快捷键”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-CONV-006-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

### 4.4 L2 · 多标签与同步

#### PRD-SYNC-001 · WS 连接与重连
<a id="prd-sync-001"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-002](../../FE-002-chat-robustness/spec.md)；开发 [FE-002](../../FE-002-chat-robustness/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：重连/回放/事件去重无域测试。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 多标签与同步”中提供“WS 连接与重连”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-SYNC-001-01` 主路径：用户能完成“WS 连接与重连”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-SYNC-001-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-SYNC-002 · 多标签 active/ancestor/read cursor
<a id="prd-sync-002"></a>

- 优先级：P0
- 实现状态：`implemented`
- 关联：CHANGE [FE-009](../../FE-009-web-multitab/spec.md)；开发 [FE-009](../../FE-009-web-multitab/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：FE-009-web-multitab 已签部署，但无域测试。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 多标签与同步”中提供“多标签 active/ancestor/read cursor”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-SYNC-002-01` 主路径：用户能完成“多标签 active/ancestor/read cursor”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-SYNC-002-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-SYNC-003 · 发送模式/设置跨标签同步
<a id="prd-sync-003"></a>

- 优先级：P1
- 实现状态：`implemented`
- 关联：CHANGE [FE-006](../../FE-006-chat-experience/spec.md) / [COMP-composer-send-mode](../../COMP-composer-send-mode/spec.md)；开发 [FE-006](../../FE-006-chat-experience/spec.md) / [M1](../../../docs/m1-contract.md)；组件 [COMP-composer-send-mode](../../COMP-composer-send-mode/spec.md)；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：仅组件级测试。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 多标签与同步”中提供“发送模式/设置跨标签同步”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-SYNC-003-01` 主路径：用户能完成“发送模式/设置跨标签同步”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-SYNC-003-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-SYNC-004 · 未读与已读游标
<a id="prd-sync-004"></a>

- 优先级：P1
- 实现状态：`partial`
- 关联：CHANGE [FE-003](../../FE-003-chat-capabilities/spec.md)；开发 [FE-003](../../FE-003-chat-capabilities/spec.md) / [M1](../../../docs/m1-contract.md)；组件 —；任务卡 [前端任务](../../../docs/tasks/frontend.md)
- 落地前差距（历史审计）：零散实现；无统一未读口径与跨标签 AC。
- 当前剩余缺口：域级执行证据仍为 missing；测试计划骨架已建、未运行；部分项仍缺产品确认。
- 目标行为：系统在“会话与消息 / 多标签与同步”中提供“未读与已读游标”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-SYNC-004-01` 主路径：用户能完成“未读与已读游标”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-SYNC-004-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。

#### PRD-SYNC-005 · 远程访问与通知中心
<a id="prd-sync-005"></a>

- 优先级：P2
- 实现状态：`unimplemented`
- 关联：CHANGE —；开发 —；组件 —；任务卡 [后端任务](../../../docs/tasks/backend.md)
- 落地前差距（历史审计）：未实现；无远程鉴权/通知产品 spec。
- 当前剩余缺口：`unimplemented`，无可用实现/无完整验收。
> **unimplemented**：当前无可用实现/无完整验收；不得对外宣称已完成。

- 目标行为：系统在“会话与消息 / 多标签与同步”中提供“远程访问与通知中心”的完整路径；入口可见、状态可辨、失败可恢复，空/加载/错误/权限不足不得静默或展示假数据。
- AC：
  - `AC-SYNC-005-01` 主路径：用户能完成“远程访问与通知中心”并看到一致结果；状态与关联数据不互相矛盾。
  - `AC-SYNC-005-02` 异常/边界：空数据、加载中、失败、权限不足至少各有可见反馈；重试/返回后不产生重复或脏数据。


## 5. 验收标准（A1–A8）

| ID | 验收标准 | 适用性 |
|---|---|---|
| A1 | 本域全部 P0 PRD 的主路径可走通，结果与状态一致 | 必验 |
| A2 | 空、加载、错误、权限不足至少各有一条可见反馈，不静默失败 | 必验 |
| A3 | 有 UI 的功能点可用键盘完成主路径，焦点可见；纯后端域标 N/A 并说明 | 有 UI 必验，否则 N/A |
| A4 | 有 UI 的功能点在 375px 宽度不横向溢出、不遮挡主操作；纯后端域 N/A | 有 UI 必验，否则 N/A |
| A5 | 不展示假 0/假成功；未实现/无证据项在界面与文档中明确标注 | 必验 |
| A6 | 权限/隔离类功能默认拒绝，越权路径不因前端隐藏按钮而被视为安全 | 涉及权限/团队/文件必验 |
| A7 | `unimplemented` 项在 TREE/TRACEABILITY/spec 中一致标注，且不被计入 covered | 必验 |
| A8 | 每个 A/PRD 至少映射一个测试用例；当前证据缺失的写 `missing`，不得写“通过” | 必验 |

## 6. 当前实现状态与未实现项

| PRD | 功能点 | 状态 | 说明 |
|---|---|---|---|
| `PRD-CONV-001` | 会话树与主会话 | `implemented` | 已签（部分）；FE-003 已签但无域级测试计划；主会话不可归档的边界未单列 AC。 |
| `PRD-CONV-002` | 会话生命周期 | `implemented` | 已签；创建/重命名/归档/恢复分散在多个 FE，缺统一状态机。 |
| `PRD-CONV-003` | 会话搜索与未读 | `partial` | 部分；搜索已实现；未读计数/已读游标只有零散实现，无域级 AC 与测试。 |
| `PRD-CONV-004` | 消息流与渲染 | `implemented` | 已签（视觉）；消息纯度（无 system/静默噪音）无独立验收项。 |
| `PRD-CONV-007` | 祖先消息整级加载 | `implemented` | 已签（未部署）；已签但未部署，生产可用性未证明；时间轴点击目标尺寸未单列。 |
| `PRD-CONV-005` | 发送·流式·断线重连 | `implemented` | 已签（部分）；断线重连无重复已验证，但“停止/失败恢复”未纳入同一 AC。 |
| `PRD-CONV-006` | Composer 输入与快捷键 | `implemented` | 已签；IME/发送模式/跨标签同步已有组件级契约，缺产品级 AC。 |
| `PRD-SYNC-001` | WS 连接与重连 | `implemented` | 已签；重连/回放/事件去重无域测试。 |
| `PRD-SYNC-002` | 多标签 active/ancestor/read cursor | `implemented` | 已签；FE-009-web-multitab 已签部署，但无域测试。 |
| `PRD-SYNC-003` | 发送模式/设置跨标签同步 | `implemented` | 已签；仅组件级测试。 |
| `PRD-SYNC-004` | 未读与已读游标 | `partial` | 部分；零散实现；无统一未读口径与跨标签 AC。 |
| `PRD-SYNC-005` | 远程访问与通知中心 | `unimplemented` | 规划；未实现；无远程鉴权/通知产品 spec。 |

**未实现项（unimplemented）**：`PRD-SYNC-005` 远程访问与通知中心。

> 说明：`implemented` 只表示“有验收/可运行实现”的现状摘要；不等于本 spec 的 AC 已全部重跑。所有执行证据见测试计划的“当前证据”列。

## 7. 依赖、风险与待确认

- 依赖：`CONV`、`SYNC` 的能力必须与现有 FE/COMP/契约一致；冲突时以本 spec 的产品行为为准，并开变更包修正。
- 风险：旧 `docs/tasks/frontend.md` 与后端能力面不一致；本 spec 不把“后端有接口”当“前端可用”。
- 待确认：未实现项的排期与 owner（PRD-SYNC-005）。
- 证据：测试计划 [`../../test/P1-CONV/test-plan.md`](../../test/P1-CONV/test-plan.md)；未执行项一律 `missing`。
