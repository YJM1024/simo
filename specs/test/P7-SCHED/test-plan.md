# P7 · 调度 测试计划

状态：**active（2026-11-21 边界契约补充；用例 1 pass / 5 partial / 2 missing）** — 覆盖口径见 §1、§4；pass 只表示该用例的断言已执行，不表示 PRD 的 AC 全覆盖。
> 产品域 spec：[`../../product/P7-SCHED/spec.md`](../../product/P7-SCHED/spec.md)；TREE：[`../../../docs/product/TREE.md`](../../../docs/product/TREE.md)；TRACEABILITY：[`../../../docs/product/TRACEABILITY.md`](../../../docs/product/TRACEABILITY.md)。

<!-- EVIDENCE-SUMMARY-20261120 -->
> **2026-11-20 证据汇总**：本域 8 个用例，**pass 1 / partial 3 / missing 4**；PRD 覆盖仍 **0 covered / 4 partial / 1 gap**。后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。
>
> **2026-11-21 补充**：新增 `TestP7ScheduleEmptyAndNotFoundContract`（`backend/cmd/simo/contract_edges_test.go`），覆盖空调度列表、未知 id 的 GET/PATCH/DELETE/run-now 404 JSON、非法 JSON 400；E1、E2 由 missing 升为 partial。该测试不覆盖前端空/错误态、不覆盖权限/375，不升级 PRD covered。

## 1. 范围与证据口径

- 覆盖本域 5 个 PRD；每个 PRD 至少一个主用例，另设空/错误/权限 3 个域级用例。
- 自动化层级：component / integration / E2E；当前仅登记目标层级，**尚未接线到 CI**。
- 证据：没有实际执行记录就写 `missing`；存在旧测试计划只能写“文件存在，未执行”，不得写“通过”。
- 数据：隔离 fixture + mock；不读取生产数据库/真实用户文件。
- 不跳过：标 `skip` 的用例必须在“当前证据”说明原因与 owner；无原因视为未覆盖。

## 2. 用例

<a id="tc-p7-001"></a>
#### TC-P7-001 · PRD-SCHED-001 定时任务 CRUD

- 对应 PRD：`PRD-SCHED-001`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从调度入口定位“定时任务 CRUD”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SCHED-001-01` 主路径通过；`AC-SCHED-001-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM13OnceScheduleFires`、`TestM13PauseAndRunNow`；仅覆盖部分路径。未覆盖：完整 CRUD/删除/列表分页、权限未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p7-002"></a>
#### TC-P7-002 · PRD-SCHED-002 列表与下次运行时间

- 对应 PRD：`PRD-SCHED-002`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从调度入口定位“列表与下次运行时间”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SCHED-002-01` 主路径通过；`AC-SCHED-002-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**pass** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）中的 `TestM13InvalidCronAndNextRun`；直接覆盖主路径。未覆盖：无前端 cron 编辑、无非法时区/边界 UI。PRD 覆盖仍 partial。
- 实现状态：`partial`

<a id="tc-p7-003"></a>
#### TC-P7-003 · PRD-SCHED-003 立即运行与幂等

- 对应 PRD：`PRD-SCHED-003`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从调度入口定位“立即运行与幂等”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SCHED-003-01` 主路径通过；`AC-SCHED-003-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM13PauseAndRunNow`、`schedule_fires(schedule_id,due_at)`；仅覆盖部分路径。未覆盖：幂等键/重复触发/取消中的任务未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p7-004"></a>
#### TC-P7-004 · PRD-SCHED-004 重复规则与时区

- 对应 PRD：`PRD-SCHED-004`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从调度入口定位“重复规则与时区”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SCHED-004-01` 主路径通过；`AC-SCHED-004-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-20 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0）中的 `TestM13InvalidCronAndNextRun`；仅覆盖部分路径。未覆盖：DST、时区切换、misfire 策略未覆盖；保持 partial。
- 实现状态：`partial`

<a id="tc-p7-005"></a>
#### TC-P7-005 · PRD-SCHED-005 失败·重试·通知

- 对应 PRD：`PRD-SCHED-005`
- 前置：隔离 fixture（默认会话/任务/文件 mock）；不读取生产数据；准备正常、空、错误三组输入。
- 步骤：
  1. 从调度入口定位“失败·重试·通知”，记录初始状态；
  2. 执行主路径并观察状态、数据与提示；
  3. 触发空/错误/返回，确认恢复、无重复提交、无脏数据。
- 断言：`AC-SCHED-005-01` 主路径通过；`AC-SCHED-005-02` 空/错误/边界有可见反馈；状态与关联数据一致。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — `PRD-SCHED-005` 未实现；无失败通知/重试测试。
- 实现状态：`unimplemented`（unimplemented，不得当通过）


### 2.x 域级边界用例

<a id="tc-p7-e1"></a>
#### TC-P7-E1 · 空/加载

- 对应 PRD：本域 P0 功能点
- 前置：空数据与加载中状态 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：空态可见，加载不闪烁；加载结束进入正确状态；不展示假 0。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-21 `go test ./cmd/simo -run TestP7ScheduleEmptyAndNotFoundContract` PASS（`backend/cmd/simo/contract_edges_test.go`）：空调度列表返回 200 + `schedules:[]`，不展示假数据。未覆盖：前端 loading/空态渲染，保持 partial。

<a id="tc-p7-e2"></a>
#### TC-P7-E2 · 错误/恢复

- 对应 PRD：本域 P0 功能点
- 前置：接口失败、超时或权限不足 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：错误提示可见，重试/返回可用；失败不写脏数据、不重复提交。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**partial** — 2026-11-21 `go test ./cmd/simo -run TestP7ScheduleEmptyAndNotFoundContract` PASS：未知 id 的 GET/PATCH/DELETE/run-now 均 404 + `ok:false` + `error`；非法 JSON 创建 400 + 统一错误信封；失败不写脏数据。未覆盖：前端错误提示/重试、数据库错误与超时，保持 partial。

<a id="tc-p7-e3"></a>
#### TC-P7-E3 · 响应式/键盘/权限

- 对应 PRD：本域 P0 功能点
- 前置：375px、键盘与权限边界 的隔离 fixture。
- 步骤：1）准备对应条件；2）执行主路径或越权路径；3）检查提示、数据与恢复。
- 断言：无横向溢出；键盘可完成主路径；越权被默认拒绝。
- 自动化层级：integration（API 级，未接线）
- 当前证据：**missing** — 无测试落点；调度权限/375/键盘无测试。


## 3. 验收映射（A1–A8）

| A | 覆盖用例 | 说明 |
|---|---|---|
| A1 | 每个 PRD 的 `TC-P7-NNN` | P0 主路径逐项执行；证据见各用例“当前证据” |
| A2 | `TC-P7-E1` / `TC-P7-E2` | 空/加载/错误/权限反馈 |
| A3 | `TC-P7-E3` | 键盘/焦点；纯后端域 N/A |
| A4 | `TC-P7-E3` | 375px；纯后端域 N/A |
| A5 | 所有用例 | 无假 0/假成功；未实现项标注 |
| A6 | `TC-P7-E3` + 权限相关 PRD | 默认拒绝/隔离 |
| A7 | 本文件 §4 | unimplemented 不进入通过统计 |
| A8 | 本表 + §4 | 每项有证据/缺口字段 |

## 4. 未实现与缺口

- **unimplemented**：`PRD-SCHED-005` 失败通知/重试。
- **用例级证据**：8 个用例 **pass 1 / partial 5 / missing 2**；pass 只表示该用例的断言已执行，不等于 PRD 覆盖。
- **PRD 覆盖**：**0 covered / 4 partial / 1 gap**；本轮没有因局部证据升级任何 PRD 为 covered。
- **未覆盖**：`TC-P7-005` 与 **E3** 仍 missing（E1/E2 已升 partial）；完整 CRUD、幂等、DST/时区、失败通知/权限无测试。
- **证据命令/入口**：后端 `cd backend && go test ./... -count=1 -json`（**223/223 PASS**，exit 0；日志 `.tmp/backend-fulltest-20261120.jsonl`）；前端证据不适用于本域或未覆盖本域。
- **限制**：本域 E2E/前端证据只覆盖既有 UI 路径；后端 223 PASS 只证明既有测试通过，不证明产品 AC 完成。Playwright Test 普通路径受沙箱限制，CI 未实跑。
- **不得宣称**：在 AC 全量、权限/异常/真实数据补齐前，不能标记 `covered`，也不能对外说“测试通过”。

## 5. 执行后的回写

1. 每个用例记录命令、环境、时间、结果（pass/fail/skip+原因）。
2. 结果写回本文件“当前证据”，并在 `../../../docs/product/TRACEABILITY.md` 更新覆盖状态。
3. 失败必须开缺陷/变更包；不得只改测试断言来“通过”。
