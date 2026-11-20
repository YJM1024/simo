# P9 · 工具与能力 测试计划

状态：**active（2026-11-20 后端证据回写；用例 2 pass / 3 partial / 5 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P9-TOOL/spec.md`](../../product/P9-TOOL/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 10 个用例，**pass 2 / partial 3 / missing 5**；PRD 覆盖仍 **0 covered / 4 partial / 3 gap**。后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。

## 1. 范围与证据口径

- 覆盖本域 7 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；当前仅登记目标层级，**尚未接线到 CI**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p9-001"></a>
#### TC-P9-001 · PRD-TOOL-001 工具注册·执行·审计

- 对应 PRD：`PRD-TOOL-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“工具注册·执行·审计”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-001-01` 主路径通过；`AC-TOOL-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestM20ActionRegistryAndExecute`、`TestM20NativeActionTools`、`TestM20ToolNamesValidForProvider` + M17/M12；直接覆盖主路径。未覆盖：无前端能力目录、schema 校验/恶意参数矩阵。PRD 覆盖仍 partial。
- 实现状态：`partial`

<a id="tc-p9-002"></a>
#### TC-P9-002 · PRD-TOOL-002 权限·审批·沙盒

- 对应 PRD：`PRD-TOOL-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“权限·审批·沙盒”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-002-01` 主路径通过；`AC-TOOL-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`；直接覆盖主路径。未覆盖：无真实外部工具越权、无并发审批。PRD 覆盖仍 partial。
- 实现状态：`partial`

<a id="tc-p9-003"></a>
#### TC-P9-003 · PRD-TOOL-003 Skills 发现与加载

- 对应 PRD：`PRD-TOOL-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“Skills 发现与加载”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-003-01` 主路径通过；`AC-TOOL-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 后端无 skills 代码/测试；产品 spec 原 partial 为文档不一致，按 backend 口径为 unimplemented。
- 实现状态：`unimplemented`

<a id="tc-p9-004"></a>
#### TC-P9-004 · PRD-TOOL-005 CLI 工具白名单

- 对应 PRD：`PRD-TOOL-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“CLI 工具白名单”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-005-01` 主路径通过；`AC-TOOL-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM9PwshApprovalAndExitCode`、`TestM9PwshEnvTimeoutAndSpill`；仅覆盖部分路径。未覆盖：只测 blocklist，不是白名单；无路径/参数注入矩阵；保持 partial。
- 实现状态：`partial`

<a id="tc-p9-005"></a>
#### TC-P9-005 · PRD-TOOL-004 MCP 接入

- 对应 PRD：`PRD-TOOL-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“MCP 接入”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-004-01` 主路径通过；`AC-TOOL-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-TOOL-004` MCP 接入未实现；无测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p9-006"></a>
#### TC-P9-006 · PRD-TOOL-006 联网搜索与抓取

- 对应 PRD：`PRD-TOOL-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“联网搜索与抓取”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-006-01` 主路径通过；`AC-TOOL-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM12WebSearchAndFetchMock`、`TestM12WebFetchSSRFDenied`；仅覆盖部分路径。未覆盖：真实网络、配额、超时、内容安全未测；保持 partial。
- 实现状态：`partial`

<a id="tc-p9-007"></a>
#### TC-P9-007 · PRD-TOOL-007 能力目录 L0–L3

- 对应 PRD：`PRD-TOOL-007`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从工具与能力入口定位“能力目录 L0–L3”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-TOOL-007-01` 主路径通过；`AC-TOOL-007-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-TOOL-007` 能力目录未实现；无测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）


### 2.x 域级边界用例

<a id="tc-p9-e1"></a>
#### TC-P9-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；工具域空/加载态无前端测试。

<a id="tc-p9-e2"></a>
#### TC-P9-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；工具域错误/恢复无统一契约测试。

<a id="tc-p9-e3"></a>
#### TC-P9-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`、`TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`；仅覆盖部分路径。未覆盖：无前端权限提示、无 375/键盘；仅后端默认拒绝路径；保持 partial。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P9-NNN` | P0 主路径逐项执行；证据见各用例“当前证据” |
| A2 | `TC-P9-E1` / `TC-P9-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P9-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P9-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P9-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-TOOL-003` Skills/CLI、`PRD-TOOL-004` MCP 接入、`PRD-TOOL-007` 能力目录 L0–L3。
- **用例级证据**：10 个用例 **pass 2 / partial 3 / missing 5**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 4 partial / 3 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：`TC-P9-003/005/007` 与 E1/E2 仍 missing；Skills、MCP、能力目录、白名单、真实网络与权限边界只部分覆盖；TOOL-003 后端口径为 unimplemented。
- **证据命令/入口**：后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
