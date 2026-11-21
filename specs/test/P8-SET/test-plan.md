# P8 · 设置与系统 测试计划

状态：**active（2026-11-21 边界契约补充；用例 3 pass / 9 partial / 3 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P8-SET/spec.md`](../../product/P8-SET/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 15 个用例，**pass 3 / partial 8 / missing 4**；PRD 覆盖仍 **0 covered / 9 partial / 3 gap**。后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。
>
> **2026-11-21 补充**：新增 `TestP8SettingsAndRuntimeContract`（`backend/cmd/simo/contract_edges_test.go`），覆盖权限/运行状态读取、非法 sandbox 400、非法权限 JSON 400；E1 由 missing 升为 partial。不覆盖前端设置页空/错误态、375 或真实越权，不升级 PRD covered。

## 1. 范围与证据口径

- 覆盖本域 12 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；当前仅登记目标层级，**尚未接线到 CI**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p8-001"></a>
#### TC-P8-001 · PRD-SET-001 模型与 Provider

- 对应 PRD：`PRD-SET-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“模型与 Provider”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-001-01` 主路径通过；`AC-SET-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `platform/config` 12 tests；仅覆盖部分路径。未覆盖：运行时热更新、非法配置、前端设置页未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p8-002"></a>
#### TC-P8-002 · PRD-SET-002 权限·沙盒·审批

- 对应 PRD：`PRD-SET-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“权限·沙盒·审批”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-002-01` 主路径通过；`AC-SET-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestM5MockWriteDeletePermissionFlow`、`TestM5WriteAskApprovalExecutes`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`；直接覆盖主路径。未覆盖：无前端权限矩阵、无真实外部工具越权。PRD 覆盖仍 partial。
- 实现状态：`partial`

<a id="tc-p8-003"></a>
#### TC-P8-003 · PRD-SET-003 外观·主题·语言

- 对应 PRD：`PRD-SET-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“外观·主题·语言”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-003-01` 主路径通过；`AC-SET-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-SET-003` 未实现；模型切换/密钥配置无测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p8-004"></a>
#### TC-P8-004 · PRD-SET-005 快捷键·关于·版本

- 对应 PRD：`PRD-SET-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“快捷键·关于·版本”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-005-01` 主路径通过；`AC-SET-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 config migration tests、`tools/workspace-migrate` 3；仅覆盖部分路径。未覆盖：备份/恢复/回滚、损坏数据演练未覆盖；保持 partial。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p8-005"></a>
#### TC-P8-005 · PRD-SET-004 数据目录·备份·恢复

- 对应 PRD：`PRD-SET-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“数据目录·备份·恢复”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-004-01` 主路径通过；`AC-SET-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-SET-005` 未实现；外观/快捷键无测试。
- 实现状态：`partial`

<a id="tc-p8-006"></a>
#### TC-P8-006 · PRD-SET-006 能力管理（MCP/CLI/Skills/目录）

- 对应 PRD：`PRD-SET-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“能力管理（MCP/CLI/Skills/目录）”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SET-006-01` 主路径通过；`AC-SET-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-SET-006` 未实现；认证/审计无测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）

<a id="tc-p8-007"></a>
#### TC-P8-007 · PRD-SYS-001 本地单用户与鉴权边界

- 对应 PRD：`PRD-SYS-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“本地单用户与鉴权边界”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-001-01` 主路径通过；`AC-SYS-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestHealthAndSessions`、`TestAPINotFoundIsJSON`；仅覆盖部分路径。未覆盖：无认证/越权/敏感信息暴露测试；8787 仍无鉴权；保持 partial。
- 实现状态：`partial`

<a id="tc-p8-008"></a>
#### TC-P8-008 · PRD-SYS-002 权限 fail-closed

- 对应 PRD：`PRD-SYS-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“权限 fail-closed”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-002-01` 主路径通过；`AC-SYS-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestM9PermissionsDefaultAndFullConfirmation`、`TestM9PwshApprovalAndExitCode`、`TestM9EscalationWritesOutsideAndNeverRejects`、`TestM9AllowSessionGrant`、`TestM9ApprovalResultReportMessage`、`TestM9PwshEnvTimeoutAndSpill`；直接覆盖主路径。未覆盖：无前端审批 UI、无策略组合/并发测试。PRD 覆盖仍 partial。
- 实现状态：`partial`

<a id="tc-p8-009"></a>
#### TC-P8-009 · PRD-SYS-004 数据备份·迁移·回滚

- 对应 PRD：`PRD-SYS-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“数据备份·迁移·回滚”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-004-01` 主路径通过；`AC-SYS-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `tools/workspace-migrate` 3；仅覆盖部分路径。未覆盖：无正式备份/恢复演练、无失败回滚；保持 partial。
- 实现状态：`partial`

<a id="tc-p8-010"></a>
#### TC-P8-010 · PRD-SYS-003 健康检查与运行时状态

- 对应 PRD：`PRD-SYS-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“健康检查与运行时状态”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-003-01` 主路径通过；`AC-SYS-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestM7HealthReadiness`、`TestHealthAndSessions`、`TestM7UniformErrorEnvelope`；直接覆盖主路径。未覆盖：无进程级重启/磁盘满/依赖故障演练。PRD 覆盖仍 partial。
- 实现状态：`implemented`

<a id="tc-p8-011"></a>
#### TC-P8-011 · PRD-SYS-005 日志与审计

- 对应 PRD：`PRD-SYS-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“日志与审计”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-005-01` 主路径通过；`AC-SYS-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM7UniformErrorEnvelope` 等；仅覆盖部分路径。未覆盖：错误码全覆盖、请求关联 id、审计查询未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p8-012"></a>
#### TC-P8-012 · PRD-SYS-006 安装·升级·便携包

- 对应 PRD：`PRD-SYS-006`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从设置与系统入口定位“安装·升级·便携包”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SYS-006-01` 主路径通过；`AC-SYS-006-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 config 路径相关 tests；仅覆盖部分路径。未覆盖：安装/升级/卸载、权限修复未覆盖；保持 partial。
- 实现状态：`partial`


### 2.x 域级边界用例

<a id="tc-p8-e1"></a>
#### TC-P8-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-21 `go test ./cmd/simo -run TestP8SettingsAndRuntimeContract` PASS（`backend/cmd/simo/contract_edges_test.go`）：`/api/permissions` 返回 `ok:true` + sandbox/approval/modes；`/api/runtime/status` 返回 `ok:true` + activeTasks。未覆盖：前端设置页加载/空态渲染与闪烁，保持 partial。

<a id="tc-p8-e2"></a>
#### TC-P8-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-21 `go test ./cmd/simo -run TestP8SettingsAndRuntimeContract` PASS：非法 sandbox 返回 400 `invalid_sandbox`，非法 JSON 返回 400 `bad_request`，均不 500、不写错误配置。未覆盖：前端设置页错误提示/重试与真实越权，保持 partial。

<a id="tc-p8-e3"></a>
#### TC-P8-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：component/integration（待接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestDefaultPolicy`、`TestCanUseToolOnlyWhenNotAutoApproved`、`TestHookDenyAndAskRule`、`TestHookDenyAndAskRule`；仅覆盖部分路径。未覆盖：设置页键盘/375/真实越权未覆盖；保持 partial。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P8-NNN` | P0 主路径逐项执行；证据见各用例“当前证据” |
| A2 | `TC-P8-E1` / `TC-P8-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P8-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P8-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P8-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-SET-003`、`PRD-SET-005`、`PRD-SET-006`。
- **用例级证据**：15 个用例 **pass 3 / partial 9 / missing 3**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 9 partial / 3 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：`TC-P8-003/005/006` 仍 missing；E1/E2 仅 API 边界 partial，设置 UI、模型切换、快捷键、备份/恢复、安装/升级、认证/审计、权限边界只部分覆盖。
- **证据命令/入口**：后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
