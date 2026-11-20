# P4 · 文件与交付物 测试计划

状态：**active（2026-11-20 执行证据回写；用例 0 pass / 4 partial / 5 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P4-FILE/spec.md`](../../product/P4-FILE/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 9 个用例，**pass 0 / partial 4 / missing 5**；PRD 覆盖仍 **0 covered / 2 partial / 4 gap**。前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。

## 1. 范围与证据口径

- 覆盖本域 6 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；已有 Vitest 与 CDP E2E 执行，**CI 仍未接线**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p4-001"></a>
#### TC-P4-001 · PRD-FILE-001 会话文件聚合与列表

- 对应 PRD：`PRD-FILE-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“会话文件聚合与列表”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-001-01` 主路径通过；`AC-FILE-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；上传/附件缺少测试。
- 实现状态：`partial`

<a id="tc-p4-002"></a>
#### TC-P4-002 · PRD-FILE-005 工作区目录与输出隔离

- 对应 PRD：`PRD-FILE-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“工作区目录与输出隔离”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-005-01` 主路径通过；`AC-FILE-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；文件聚合/归属缺少测试。
- 实现状态：`partial`

<a id="tc-p4-003"></a>
#### TC-P4-003 · PRD-FILE-002 上传与附件

- 对应 PRD：`PRD-FILE-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“上传与附件”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-002-01` 主路径通过；`AC-FILE-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；交付物卡片状态/权限缺少测试。
- 实现状态：`partial`

<a id="tc-p4-004"></a>
#### TC-P4-004 · PRD-FILE-003 交付物卡片与列表

- 对应 PRD：`PRD-FILE-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“交付物卡片与列表”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-003-01` 主路径通过；`AC-FILE-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-003/FE-005 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6） + `npm run test:e2e:cdp` 07；只覆盖展示/局部路径。未覆盖：交付物可见/状态已测；卡片状态、权限、真实产物未覆盖；保持 partial。
- 实现状态：`implemented`

<a id="tc-p4-005"></a>
#### TC-P4-005 · PRD-FILE-004 预览与下载

- 对应 PRD：`PRD-FILE-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“预览与下载”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-004-01` 主路径通过；`AC-FILE-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：component/integration（待接线；复用 FE-005 用例）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6） + `npm run test:e2e:cdp` 07；只覆盖展示/局部路径。未覆盖：真实下载由 E2E 07 覆盖；预览、PDF/Office 渲染、取消未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p4-006"></a>
#### TC-P4-006 · PRD-FILE-006 文件生成（PDF/Office/图片）

- 对应 PRD：`PRD-FILE-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从文件与交付物入口定位“文件生成（PDF/Office/图片）”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-FILE-006-01` 主路径通过；`AC-FILE-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；文件生成/产物登记缺少测试。
- 实现状态：`partial`


### 2.x 域级边界用例

<a id="tc-p4-e1"></a>
#### TC-P4-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6）；只覆盖展示/局部路径。未覆盖：右栏交付物空/加载已测；文件域全状态未覆盖；保持 partial。

<a id="tc-p4-e2"></a>
#### TC-P4-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd frontend && npm test`（**69/69 PASS**）的 `frontend/src/components/RightPanel.test.tsx`（6/6）；只覆盖展示/局部路径。未覆盖：右栏错误/重试已测；上传/下载失败未覆盖；保持 partial。

<a id="tc-p4-e3"></a>
#### TC-P4-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：component/integration（待接线）
- 当前证据：**missing** — 无测试落点；文件域键盘/375/权限边界未覆盖。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P4-NNN` | P0 主路径逐项执行；证据见各用例“当前证据”，未覆盖项仍 missing |
| A2 | `TC-P4-E1` / `TC-P4-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P4-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P4-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P4-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：无（本域产品 spec 未标 unimplemented；上传/预览/生成仍 partial）。
- **用例级证据**：9 个用例 **pass 0 / partial 4 / missing 5**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 2 partial / 4 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：主用例 001/002/003/006 与 E3 仍 missing；上传、附件、预览、文件生成、隔离无测试。
- **证据命令/入口**：前端 `cd frontend && npm test`（**69/69 PASS**）、CDP `npm run test:e2e:cdp`（**11/11**，5 次）与后端 **223/223 PASS** 的交集；命令/环境见 [EVIDENCE](../../../docs/testing/EVIDENCE-20261120.md) 与 [BACKEND-EVIDENCE](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
