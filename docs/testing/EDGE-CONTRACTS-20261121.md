# 2026-11-21 边界契约测试补充

状态：**active** — 只登记实际执行通过的 API 边界测试；不改变 PRD 覆盖（covered 仍 0 / partial 48 / gap 23）。

## 补充文件

`backend/cmd/simo/contract_edges_test.go`

## 用例与结果

命令（工作目录 `backend`）：

```powershell
go test ./cmd/simo -run 'TestP5MemoryEmptyAndUnknownContract|TestP6TeamEmptyAndUnknownContract|TestP7ScheduleEmptyAndNotFoundContract|TestP8SettingsAndRuntimeContract|TestP9ActionsUnknownContract' -count=1
```

结果：本机单次定向运行 `ok simo/cmd/simo 0.558s`，exit 0；该定向运行日志未保留。覆盖全部 5 个测试的留档为随后的后端全量运行 `.tmp/go-test-final3-20261121.log`（`simo/cmd/simo`，exit 0）。

### TestP5MemoryEmptyAndUnknownContract

- 空库 `/api/memory/items?scope=global&status=all&limit=abc`：200、`ok:true`、`items:[]`；非法 limit 不报错。
- V3 空库 `/api/memory/items?type=fact&limit=abc`：200、`ok:true`、`total:0`。
- 未知条目 `/api/memory/items/does-not-exist`：404、`ok:false`、含 `error`。
- `/api/memory/scopes` 空库：200、`ok:true`。

对应测试计划：`specs/test/P5-MEM/test-plan.md` 的 `TC-P5-E1`、`TC-P5-E2`（由 missing 升为 partial）。不覆盖前端空/错误态与加载闪烁。

### TestP6TeamEmptyAndUnknownContract

- 普通会话 `/api/sessions/main/team`：200、`ok:true`、`team:null`、`members:[]`。
- 未知团队 `/api/teams/does-not-exist`：404、`ok:false`、`team_not_found`。

对应测试计划：`specs/test/P6-TEAM/test-plan.md` 的 `TC-P6-E1`、`TC-P6-E2`（由 missing 升为 partial）。不覆盖前端空/错误态、成员 CRUD 失败与权限。

### TestP7ScheduleEmptyAndNotFoundContract

- 空调度列表：200、`schedules:[]`。
- 未知 id 的 `GET` / `DELETE` / `POST .../run-now`：均 404、`ok:false`、含 `error`。
- 未知 id 的 `PATCH`：404、统一错误信封。
- 非法 JSON 创建：400、统一错误信封。

对应测试计划：`specs/test/P7-SCHED/test-plan.md` 的 `TC-P7-E1`、`TC-P7-E2`（由 missing 升为 partial）。不覆盖前端错误提示/重试、权限、375。

### TestP8SettingsAndRuntimeContract

- `/api/permissions`：200、`ok:true`、含 sandbox/approval。
- `/api/runtime/status`：200、`ok:true`、含 activeTasks。
- `POST /api/permissions` 非法 sandbox：400、`invalid_sandbox`。
- `POST /api/permissions` 非法 JSON：400、`bad_request`。

对应测试计划：`specs/test/P8-SET/test-plan.md` 的 `TC-P8-E1`、`TC-P8-E2`（E1 由 missing 升为 partial，E2 补证据）。不覆盖前端设置页空/错误态、375、真实越权。

### TestP9ActionsUnknownContract

- `/api/actions`：200、`ok:true`、含 actions/count。
- 未知动作 `GET /api/actions/does-not-exist`：404、`UNKNOWN_ACTION`。
- 未知动作 `POST /api/actions/does-not-exist`：404、`UNKNOWN_ACTION`。

对应测试计划：`specs/test/P9-TOOL/test-plan.md` 的 `TC-P9-E1`、`TC-P9-E2`（由 missing 升为 partial）。不覆盖前端能力目录、真实动作执行/权限矩阵。

## 不能宣称

- 这不等于 P5/P6/P7/P8/P9 的产品 AC 全部覆盖；`TRACEABILITY.md` 仍为 covered 0 / partial 48 / gap 23。
- 未新增 E2E、真实模型或真实用户数据验证。
