# P1 · 会话与消息 测试计划

状态：**active（2026-11-20 执行证据回写；用例 6 pass / 6 partial / 3 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 15 个用例，**pass 6 / partial 6 / missing 3**；PRD 覆盖仍 **0 covered / 11 partial / 1 gap**。前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。

## 1. 范围与证据口径

- 覆盖本域 12 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；已有 Vitest 与 CDP E2E 执行，**CI 仍未接线**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p1-001"></a>
#### TC-P1-001 · PRD-CONV-001 会话树与主会话

- 对应 PRD：`PRD-CONV-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“会话树与主会话”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-001-01` 主路径通过；`AC-CONV-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-001/FE-003 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Sidebar.test.tsx`（9/9）；直接覆盖该用例的主路径。未覆盖：真实后端创建/归档持久化、权限与 409 映射未由前端测试验证；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-002"></a>
#### TC-P1-002 · PRD-CONV-002 会话生命周期

- 对应 PRD：`PRD-CONV-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“会话生命周期”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-002-01` 主路径通过；`AC-CONV-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-001/FE-003/FE-004 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Sidebar.test.tsx`（9/9）；直接覆盖该用例的主路径。未覆盖：真实后端生命周期、归属迁移与归档持久化未覆盖；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-003"></a>
#### TC-P1-003 · PRD-CONV-003 会话搜索与未读

- 对应 PRD：`PRD-CONV-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“会话搜索与未读”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-003-01` 主路径通过；`AC-CONV-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-003 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Sidebar.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：搜索过滤/服务端 ids/搜索中/无匹配已测；未读游标与后端错误映射未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p1-004"></a>
#### TC-P1-004 · PRD-CONV-004 消息流与渲染

- 对应 PRD：`PRD-CONV-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“消息流与渲染”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-004-01` 主路径通过；`AC-CONV-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-001/FE-003 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MessageItem.test.tsx`（18/18） + `npm run test:e2e:cdp` 01a（首屏结构）；直接覆盖该用例的主路径。未覆盖：Markdown 子集/分类/复制/流式/失败态已测；真实历史分页未覆盖；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-005"></a>
#### TC-P1-005 · PRD-CONV-007 祖先消息整级加载

- 对应 PRD：`PRD-CONV-007`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“祖先消息整级加载”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-007-01` 主路径通过；`AC-CONV-007-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-007 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/App.integration.test.tsx`（7/7）；并以 `npm run test:e2e:cdp` 04a–04d（逐级加载/413/403/空上级）；直接覆盖该用例的主路径。未覆盖：真实祖先链后端分页与权限矩阵未覆盖；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-006"></a>
#### TC-P1-006 · PRD-CONV-005 发送·流式·断线重连

- 对应 PRD：`PRD-CONV-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“发送·流式·断线重连”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-005-01` 主路径通过；`AC-CONV-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-002 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Composer.test.tsx`（10/10） + `npm run test:e2e:cdp` 02/05（发送、流式、500 恢复）；直接覆盖该用例的主路径。未覆盖：真实 WS 断线重连与发送幂等未覆盖；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-007"></a>
#### TC-P1-007 · PRD-CONV-006 Composer 输入与快捷键

- 对应 PRD：`PRD-CONV-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“Composer 输入与快捷键”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-CONV-006-01` 主路径通过；`AC-CONV-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-006 用例）
- 当前证据：**pass** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Composer.test.tsx`（10/10） + `npm run test:e2e:cdp` 03（Enter/Shift+Enter/反转模式）；直接覆盖该用例的主路径。未覆盖：跨浏览器 IME 差异未覆盖；PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p1-008"></a>
#### TC-P1-008 · PRD-SYNC-001 WS 连接与重连

- 对应 PRD：`PRD-SYNC-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“WS 连接与重连”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYNC-001-01` 主路径通过；`AC-SYNC-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-002 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/App.integration.test.tsx`（7/7）；并以 `npm run test:e2e:cdp` 02 补充发送/流式展示；只覆盖展示/局部路径。未覆盖：WS 推送/去重已测；重连、since、replay、多会话隔离未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p1-009"></a>
#### TC-P1-009 · PRD-SYNC-002 多标签 active/ancestor/read cursor

- 对应 PRD：`PRD-SYNC-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“多标签 active/ancestor/read cursor”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYNC-002-01` 主路径通过；`AC-SYNC-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-009 用例）
- 当前证据：**missing** — 无测试落点；web-multitab 旧测试计划存在但未执行。
- 实现状态：`implemented`

<a id="tc-p1-010"></a>
#### TC-P1-010 · PRD-SYNC-003 发送模式/设置跨标签同步

- 对应 PRD：`PRD-SYNC-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“发送模式/设置跨标签同步”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYNC-003-01` 主路径通过；`AC-SYNC-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-006 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Composer.test.tsx`（10/10） + `npm run test:e2e:cdp` 03；只覆盖展示/局部路径。未覆盖：sendMode 持久化/迁移已测；BroadcastChannel 跨标签同步未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p1-011"></a>
#### TC-P1-011 · PRD-SYNC-004 未读与已读游标

- 对应 PRD：`PRD-SYNC-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“未读与已读游标”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYNC-004-01` 主路径通过；`AC-SYNC-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-003 用例）
- 当前证据：**missing** — 无测试落点；该路径缺少前端/后端测试。
- 实现状态：`partial`

<a id="tc-p1-012"></a>
#### TC-P1-012 · PRD-SYNC-005 远程访问与通知中心

- 对应 PRD：`PRD-SYNC-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从会话与消息入口定位“远程访问与通知中心”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYNC-005-01` 主路径通过；`AC-SYNC-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；该路径缺少前端/后端测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）


### 2.x 域级边界用例

<a id="tc-p1-e1"></a>
#### TC-P1-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Sidebar.test.tsx`（9/9） + MetricsDashboard/RightPanel 相关空态；只覆盖展示/局部路径。未覆盖：空/加载覆盖 Sidebar、RightPanel、Metrics 局部；会话域全状态矩阵未覆盖；保持 partial。

<a id="tc-p1-e2"></a>
#### TC-P1-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/Sidebar.test.tsx`（9/9） + RightPanel/Metrics 错误态；只覆盖展示/局部路径。未覆盖：错误/重试覆盖 Sidebar、RightPanel、Metrics 局部；超时/权限错误未覆盖；保持 partial。

<a id="tc-p1-e3"></a>
#### TC-P1-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/TimelineGroups.test.tsx`（8/8） + `npm run test:e2e:cdp` 01b/03；只覆盖展示/局部路径。未覆盖：375/键盘有 E2E 01b、03；点击目标/焦点闭环与权限拒绝未覆盖；保持 partial。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P1-NNN` | P0 主路径逐项执行；证据见各用例“当前证据”，未覆盖项仍 missing |
| A2 | `TC-P1-E1` / `TC-P1-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P1-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P1-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P1-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-SYNC-005` 远程访问与通知中心。
- **用例级证据**：15 个用例 **pass 6 / partial 6 / missing 3**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 11 partial / 1 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：`TC-P1-009`（未读/多标签）、`TC-P1-011`、`TC-P1-012` 仍 missing；`TC-P1-003` 未读游标、`TC-P1-008` 重连/replay、`TC-P1-010` 跨标签同步、权限/375 边界仅 partial。
- **证据命令/入口**：前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
