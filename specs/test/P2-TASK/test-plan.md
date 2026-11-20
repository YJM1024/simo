# P2 · 任务与执行 测试计划

状态：**active（2026-11-20 执行证据回写；用例 0 pass / 4 partial / 5 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P2-TASK/spec.md`](../../product/P2-TASK/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 9 个用例，**pass 0 / partial 4 / missing 5**；PRD 覆盖仍 **0 covered / 0 partial / 6 gap**。前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。

## 1. 范围与证据口径

- 覆盖本域 6 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；已有 Vitest 与 CDP E2E 执行，**CI 仍未接线**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p2-001"></a>
#### TC-P2-001 · PRD-TASK-001 任务生命周期与执行组

- 对应 PRD：`PRD-TASK-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“任务生命周期与执行组”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-001-01` 主路径通过；`AC-TASK-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6） + `npm run test:e2e:cdp` 06；只覆盖展示/局部路径。未覆盖：任务列表分组/状态/折叠/空态已测；真实任务 API 与状态机未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p2-002"></a>
#### TC-P2-002 · PRD-TASK-002 任务概览与进度

- 对应 PRD：`PRD-TASK-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“任务概览与进度”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-002-01` 主路径通过；`AC-TASK-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6） + `npm run test:e2e:cdp` 06；只覆盖展示/局部路径。未覆盖：右栏任务点击定位高亮已测；长任务进度/取消/重试未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p2-003"></a>
#### TC-P2-003 · PRD-TASK-003 长任务异步与开始/结束消息

- 对应 PRD：`PRD-TASK-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“长任务异步与开始/结束消息”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-003-01` 主路径通过；`AC-TASK-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；长任务/异步执行缺少后端或前端测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p2-004"></a>
#### TC-P2-004 · PRD-TASK-006 取消·重试·预算·恢复

- 对应 PRD：`PRD-TASK-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“取消·重试·预算·恢复”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-006-01` 主路径通过；`AC-TASK-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；取消/重试/恢复缺少测试。
- 实现状态：`partial`

<a id="tc-p2-005"></a>
#### TC-P2-005 · PRD-TASK-004 复杂度分级与确认门禁

- 对应 PRD：`PRD-TASK-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“复杂度分级与确认门禁”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-004-01` 主路径通过；`AC-TASK-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；复杂度归属与子会话模型缺少测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p2-006"></a>
#### TC-P2-006 · PRD-TASK-005 子会话与任务归属

- 对应 PRD：`PRD-TASK-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从任务与执行入口定位“子会话与任务归属”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TASK-005-01` 主路径通过；`AC-TASK-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；任务权限/隔离缺少测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）


### 2.x 域级边界用例

<a id="tc-p2-e1"></a>
#### TC-P2-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6）；只覆盖展示/局部路径。未覆盖：右栏 loading/空任务已测；任务域全状态矩阵未覆盖；保持 partial。

<a id="tc-p2-e2"></a>
#### TC-P2-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6）；只覆盖展示/局部路径。未覆盖：右栏错误/重试已测；任务 API 失败/超时/权限未覆盖；保持 partial。

<a id="tc-p2-e3"></a>
#### TC-P2-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；任务域键盘/375/权限边界未覆盖。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P2-NNN` | P0 主路径逐项执行；证据见各用例“当前证据”，未覆盖项仍 missing |
| A2 | `TC-P2-E1` / `TC-P2-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P2-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P2-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P2-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-TASK-003`、`PRD-TASK-004`、`PRD-TASK-005`。
- **用例级证据**：9 个用例 **pass 0 / partial 4 / missing 5**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 0 partial / 6 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：主用例 003–006 与 E3 仍 missing；任务 API、长任务进度、取消/重试、复杂度归属、权限与 375 无测试。
- **证据命令/入口**：前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
