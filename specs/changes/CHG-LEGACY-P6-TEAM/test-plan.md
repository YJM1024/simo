# TEST PLAN · CHG-LEGACY-P6-TEAM

## 1. 范围与策略

- 验证 P6 已有后端团队能力：只读视图、内部消息隔离、模板/角色、触发器、WS 事件。
- 层级：`cmd/simo` 进程内集成测试（真实 SQLite/HTTP/WS，mock LLM）+ `core/eventlog` 单测。
- 外部依赖：无；不需要 API key。
- 隔离：临时 `SIMO_HOME`、临时 SQLite、临时端口；不接触 8787/正式数据。

## 2. 环境与命令

```powershell
Set-Location E:\dsh_home\workspaces\agent\backend
$env:GOCACHE=(Resolve-Path '..\.tmp\gocache').Path
$env:GOPATH=(Resolve-Path '..\.tmp\gopath').Path
$env:TMP=(Resolve-Path '..\.tmp\tmp').Path
$env:TEMP=$env:TMP
E:\dsh_home\workspaces\agent\toolchain\go\bin\go.exe test ./... -count=1 -json
```

2026-11-20 执行：exit 0；26 包中 16 个测试包通过、10 个无测试文件；223 run/pass，0 fail；283.33s。

## 3. AC → 测试矩阵

| AC | 测试 | 层级 | 预期 | 实际 |
|---|---|---|---|---|
| AC-P6-01 团队视图/无团队 | `TestM23TeamV0View`、`TestM24TeamV1InternalRouting` | 集成 | 200，members 正常；无团队不 500 | PASS |
| AC-P6-02 子会话/owner | `TestM24TeamV1InternalRouting`、`TestM25TeamV2TemplateAndTrigger` | 集成 | 成员 session、owner 设置 | PASS |
| AC-P6-03 内部消息隔离 | `TestM24TeamV1InternalRouting` | 集成 | 主窗口不含内部文本 | PASS（单路径） |
| AC-P6-04 模板/角色 | `TestM25TeamV2TemplateAndTrigger` | 集成 | 模板角色创建成员 | PASS |
| AC-P6-05 触发器幂等 | `TestM25TeamV2TemplateAndTrigger` | 集成 | 第二次 fire 不重复交付 | PASS |
| AC-P6-06 WS 事件 | `TestM31TeamEventsBroadcastOnWS`、`TestTeamInternalEventTypesRegistered` | 集成+单测 | 事件注册/广播 | PASS |
| AC-P6-07 TEAM-004/006 | 无 | — | 不可判定 | MISSING/unimplemented |

## 4. 关键边界用例已有/缺失

已有：

- 未知团队 404（M25 间接）。
- 模板继承错误、触发器重复 fire。
- 主窗口内部文本不泄漏。

缺失：

- 无团队 200 + null（未见显式断言，需补）。
- 非成员读取团队消息/交付物越权。
- 多成员并发、成员退出、lead 转移。
- 触发器失败重试、超时、通知。
- 团队看板/会话创建（产品未实现）。

## 5. 未覆盖/不适用

- 前端：无团队 UI，空态/加载态/看板截图 N/A。
- 真实 LLM：使用 mock，不验证团队协作质量。
- 性能/并发：未做压测。
- 安全：无 HTTP 鉴权矩阵。

## 6. 退出标准

- 全量测试 exit 0 且 0 fail；
- 每个 PRD 有测试或明确 unimplemented；
- 不把内部 action 当作产品入口；
- 文档不宣称 TEAM-004/006 完成。

## 7. 证据

- [`evidence.md`](evidence.md)
- [`docs/testing/BACKEND-EVIDENCE-20261120.md`](../../../docs/testing/BACKEND-EVIDENCE-20261120.md)
- 原始日志：`backend/../.tmp/backend-fulltest-20261120.jsonl`
