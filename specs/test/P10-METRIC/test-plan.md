# P10 · 指标 测试计划

状态：**active（2026-11-20 执行证据回写；用例 0 pass / 8 partial / 1 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P10-METRIC/spec.md`](../../product/P10-METRIC/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 9 个用例，**pass 0 / partial 8 / missing 1**；PRD 覆盖仍 **0 covered / 5 partial / 1 gap**。前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。

## 1. 范围与证据口径

- 覆盖本域 6 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；已有 Vitest 与 CDP E2E 执行，**CI 仍未接线**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p10-001"></a>
#### TC-P10-001 · PRD-METRIC-001 系统性能指标

- 对应 PRD：`PRD-METRIC-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“系统性能指标”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-001-01` 主路径通过；`AC-METRIC-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-008 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9） + `npm run test:e2e:cdp` 01a；只覆盖展示/局部路径。未覆盖：指标展示/窗口切换/空态已测；真实性能数据与采样未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p10-002"></a>
#### TC-P10-002 · PRD-METRIC-002 任务质量指标

- 对应 PRD：`PRD-METRIC-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“任务质量指标”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-002-01` 主路径通过；`AC-METRIC-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-008 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：质量卡片/明细展示已测；真实任务质量口径未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p10-003"></a>
#### TC-P10-003 · PRD-METRIC-003 延迟 p50/p90

- 对应 PRD：`PRD-METRIC-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“延迟 p50/p90”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-003-01` 主路径通过；`AC-METRIC-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-008 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：延迟/窗口展示已测；真实分位/采样未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p10-004"></a>
#### TC-P10-004 · PRD-METRIC-004 7/30 天窗口与 partial

- 对应 PRD：`PRD-METRIC-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“7/30 天窗口与 partial”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-004-01` 主路径通过；`AC-METRIC-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-008 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：7d/30d 切换已测；真实窗口数据与 partialToday 的边界未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p10-005"></a>
#### TC-P10-005 · PRD-METRIC-005 明细表与口径说明

- 对应 PRD：`PRD-METRIC-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“明细表与口径说明”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-005-01` 主路径通过；`AC-METRIC-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-008 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：明细/分组展示已测；真实后端聚合未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p10-006"></a>
#### TC-P10-006 · PRD-METRIC-006 导出·对比·告警

- 对应 PRD：`PRD-METRIC-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从指标入口定位“导出·对比·告警”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-METRIC-006-01` 主路径通过；`AC-METRIC-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-METRIC-006` 导出未实现；无测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）


### 2.x 域级边界用例

<a id="tc-p10-e1"></a>
#### TC-P10-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：指标空/加载已测；全域空态未覆盖；保持 partial。

<a id="tc-p10-e2"></a>
#### TC-P10-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9）；只覆盖展示/局部路径。未覆盖：错误/重试/partial 已测；接口超时/权限未覆盖；保持 partial。

<a id="tc-p10-e3"></a>
#### TC-P10-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/MetricsDashboard.test.tsx`（9/9） + `npm run test:e2e:cdp` 01b；只覆盖展示/局部路径。未覆盖：375 由 E2E 01b 覆盖；表格键盘/导出/权限未覆盖；保持 partial。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P10-NNN` | P0 主路径逐项执行；证据见各用例“当前证据”，未覆盖项仍 missing |
| A2 | `TC-P10-E1` / `TC-P10-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P10-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P10-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P10-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-METRIC-006` 导出。
- **用例级证据**：9 个用例 **pass 0 / partial 8 / missing 1**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 5 partial / 1 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：`TC-P10-006` 仍 missing；真实采样、7d/30d 真实口径、任务质量、延迟分位、导出/权限均未覆盖。
- **证据命令/入口**：前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
