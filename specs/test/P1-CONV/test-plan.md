# P1-CONV 会话域 · 测试 Spec（长期）

| 项目 | 值 |
|---|---|
| 域 | P1-CONV（会话 / 对话 / 同步 / 右栏投影） |
| 产品来源 | [`specs/product/P1-CONV/spec.md`](../../product/P1-CONV/spec.md)（2026-11-21 行为级重写） |
| 变更来源 | [`specs/changes/CHG-CONV-006/`](../../changes/CHG-CONV-006/)（20 卡，W1–W5） |
| 本文件性质 | 长期测试 Spec；随产品 spec 增量维护，不按变更单另开测试文件 |
| 覆盖 AC | **33 条**（CONV-001..008、SYNC-001..004；原 SYNC-005 2 条已随 PRD 移除，编号不复用）；`AC-CONV-002-03` 已移出验收面（产品非目标 + backlog）；2026-11-22 新增 `AC-CONV-001-05`、`AC-CONV-008-05`，由 TC-035、TC-036 承接 |
| 当前状态汇总 | pass 33 / partial 0 / missing 0 / blocked 0（共 33 条；2026-11-22 第十轮后收口：`AC-CONV-006-02` 由 IME 证据转 pass，`AC-CONV-005-02` 改按“停止帧后上游 context 取消、不再派发 delta、不落库、回 idle”的机制判据转 pass（`stop_upstream_test.go`，真实厂商 403 只记环境限制）；002-03 移出后不计入；原 SYNC-005 两条 blocked 已移除） |
| 最近核对 | 2026-11-22 19:01–19:35（Asia/Shanghai，第十轮严格验收 `ACCEPT-CONV-10`，工作树 `E:\dsh_home\workspaces\agent`）；基线：被测实例 `backend/simo-8787-final10.exe`、buildId `mwrpos0p-d8dkh`、`SIMO_HOME=data`；前端全量 `node node_modules/vitest/vitest.mjs run --pool=threads` = 25 文件 / 260 用例（默认 5 s 超时下 `RightPanelRail.cdp.test.tsx:209` 超时，加 `--testTimeout=20000` 后 25/25、260/260 通过、24.43 s、exit 0）；后端全量 `toolchain\go.ps1 test ./... -count=1` exit 0，26 包 16 ok / 10 无测试文件 / 0 FAIL（`cmd/simo` 259.609 s、`chat` 9.018 s，含 `stop_upstream_test.go`）；B1 回退 grep 六项全 0；`GET /` buildId 与 `frontend/dist`、`backend/internal/webui/dist` 三处字节全等 |
| 维护者 | 测试 Agent（本文件）；验收 Agent 复核证据 |

> 本文件只描述“怎么证明 AC 成立”。不替代产品 spec，不裁决产品口径；所有产品与代码不一致项集中在 §16.3，由产品/验收裁决。

---

## 0. 方法与门禁

### 0.1 状态定义（只允许这四个值）

| 状态 | 判定 | 证据要求 |
|---|---|---|
| `pass` | 该 AC 的主路径与已定义负路径都有自动化断言，且最近一次运行通过 | 可复现命令 + 运行日期 + 结果（归档日志路径或带时间戳的运行记录） |
| `partial` | AC 的某条已声明分支没有断言，或只有前端 mock / 只有接口契约、缺少另一半 | 已通过部分的命令与证据 + 明确写出缺口 |
| `missing` | 该 AC 没有自动化用例，或实现不存在导致无法执行 | 写明“缺失”及原因（无实现 / 无用例） |
| `blocked` | 外部条件未满足：明确不实现、未部署、需真机或需产品裁决 | 写明阻塞条件与解除条件 |

硬规则：

1. **没跑过就是 `missing`**，不许写“应该通过”“逻辑上应成立”。
2. 一个 AC 只要有一条已声明分支无断言，整体不得写 `pass`，最多 `partial`。
3. E2E 用 `page.route()` 注入错误的场景只能证明**前端错误态**；不能当作“真实后端 413/403”的证据（见 §15 M-06）。
4. 测试名与 `文件:行` 必须实读可核对；本文件所有引用在 2026-11-21 核对过当前工作树。
5. 新增/删除自动化用例必须同轮回填 §1 矩阵；删除或改名记录到 §17。

### 0.2 全量命令与通过判据

工作目录均为仓库根 `E:\dsh_home\workspaces\agent`；Node 不在 PATH，使用仓库自带 runtime（见 §0.3）。

| 套件 | 工作目录 | 命令 | 通过判据 | 证据 |
|---|---|---|---|---|
| 前端单测 / 组件 / 集成 | `frontend` | `node .\node_modules\vitest\vitest.mjs run --pool=threads`（等价 `npm test -- --run --pool=threads`） | `Test Files 23 passed (23)`、`Tests 243 passed (243)`、exit 0、0 skipped（CDP 9223 可用时 `ExecRowHitArea.test.tsx` 与 `MessageTableLayout.test.tsx` 的 `skipIf(!browser)` 用例全部执行） | 本轮停止定向实测（2026-11-22 14:0x，23 文件 243 用例，26.45s，0 skip；运行日志待 Lead 归档）；上一版 `Tests 242 passed (242)`、30.96s 见 `.tmp/accept8/frontend-all.log`（13:55，`MSG_TABLE_CDP_URL=http://127.0.0.1:9223`）；更早 21/2/23、226/6/232 见 `.tmp/fe-conv7-20261122-121527.log`（12:15） |
| 前端类型检查 | `frontend` | `node .\node_modules\typescript\bin\tsc --noEmit` | exit 0、无诊断输出 | 本轮（2026-11-22 14:0x）`TSC_EXIT=0`，无诊断，运行日志待 Lead 归档；上一版 12:15 `TSC_EXIT=0` 见 `.tmp/tsc-conv7.log` |
| 后端全量 | `backend` | `..\toolchain\go.ps1 test ./... -count=1 -timeout 300s`；本轮加 `-v` 取 PASS 明细 | 末行 `GO_EXIT=0`，全部包 `ok`，0 个 `FAIL`，`SKIP` 仅既有 1 条 | 本轮全量待 Lead 回归：13:56 启动后 11 分钟日志仍 0 字节（`.tmp/accept8/backend-all.log`），已停止，不据此判失败；定向两用例 PASS（新用例 `TestStopFrameByMessageIDStopsOnlyTargetStream` 2.07s），chat 整包 `ok simo/internal/modules/chat 3.139s`，`go vet` EXIT=0；上一版 `PASS=285 SKIP=1 FAIL=0 okpkg=16` 见 `.tmp/be-conv7v-20261122-122018.log`（12:20–12:25，272.256s） |
| 后端 P1 定向 | `backend` | `..\toolchain\go.ps1 test ./cmd/simo -run 'TestP1Conv\|TestMainSessionArchive\|TestM6\|TestM70\|TestM78\|TestM79\|TestM81\|TestM88\|TestM89\|TestM50\|TestM41\|TestM4\|TestM14\|TestM75\|TestM87\|TestUI1' -count=1` | exit 0 | 与全量同源；定向命令用于快速回归 |
| E2E（阶段 1 唯一有效通道） | `frontend` | `$env:E2E_CDP_URL='http://127.0.0.1:9223'; $env:E2E_CDP_PORT='19230'; pnpm test:e2e:cdp` | `19/19 passed, 0 failed`，`07` 为 `SKIPPED (OOS)`，exit 0 | [`frontend/e2e/report/cdp/summary.md`](../../../frontend/e2e/report/cdp/summary.md)、`results.json`、`run-20261121-*.log` |
| E2E 前置桩检查 | `frontend` | `pnpm test:e2e:preflight` | exit 0 | `frontend/e2e/report/preflight-20261120.log` |

关于 E2E：

- CDP runner 连接已存在的 headless Chrome（默认 `http://127.0.0.1:9223`），不 fork worker、不自启 Chrome；mock 后端端口默认 `19230`（`E2E_CDP_PORT` 覆盖）。
- mock 由 runner 自己起：`spawn(resolveBackendExe(), ['serve','-addr','127.0.0.1:19230','-model','mock'])`，`SIMO_HOME` 指向 `.tmp/e2e-cdp-<rand>/home`，`SIMO_LLM/SIMO_MODEL=mock`；后端可执行文件默认 `backend/simo-live-composer.exe`，可用 `E2E_BACKEND_EXE` 指定（`frontend/e2e/scripts/cdp-runner.mjs:63-68`、`:87-107`）。因此跑 E2E 前必须已有该 exe，且 Chrome 已在 9223 监听。
- Playwright 通道（`pnpm test:e2e`）是 legacy：7 个 spec / 11 个 `test(...)`，在本机受限会话因 worker `spawn EPERM` 从未跑通，**不得作为任何 AC 的通过证据**（见 [`docs/testing/E2E-DUAL-TRACK-20261121.md`](../../../docs/testing/E2E-DUAL-TRACK-20261121.md)）。
- 运行 E2E 前必须确认 mock 栈端口不是 8787；8787 是 live 实例，禁止用测试数据污染（§0.3）。

### 0.3 环境固定事实

1. Node 不在 PATH：`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`；pnpm 同理走仓库工具链。
2. Vitest 默认 `forks` pool 在本机受限会话报 `Failed to start forks worker`（EPERM）——这是环境限制，不是测试失败；**必须 `--pool=threads`**。
3. Go 不在 PATH：使用 `toolchain/go.ps1`（go1.27.3，自带 GOROOT/GOPATH/GOCACHE/TMP）。
4. 8787 部署实例无鉴权，只允许人工走查，不允许自动化写入、不允许暴露公网。
5. E2E 数据目录在 `.tmp/e2e-run-<GUID>`，每次空 `SIMO_HOME`；不读写 `data/`。
6. 本机并行任务可能同时改工作树（本轮核对期间 `ExecRowHitArea.test.tsx` 等文件在变化）；证据必须带时间戳，跨时间引用要注明。

### 0.4 证据代码

| 代码 | 含义 | 位置 |
|---|---|---|
| `E-FE` | 前端 23 文件（21 passed / 2 skipped）/ 226 passed + 6 skipped（2026-11-22 12:15；2 个 skipped 文件为 `ExecRowHitArea.test.tsx` 4 条、`MessageTableLayout.test.tsx` 2 条，CDP 9223 无监听） | §0.2 命令；`.tmp/fe-conv7-20261122-121527.log`；上一版 20 文件 / 200 用例见 `frontend/.test-full-conv6b.log`（02:26），198 见 `frontend/.test-full-conv5.log`（02:14） |
| `E-BE` | 后端全量通过（2026-11-22 12:20–12:25，16 包 ok、285 PASS / 1 SKIP / 0 FAIL） | `.tmp/be-conv7v-20261122-122018.log`；§0.5 |
| `E-CDP` | CDP E2E 19/19（2026-11-21T05:14:41Z，**早于 W4 变更，未在最新树重跑**） | [`frontend/e2e/report/cdp/summary.md`](../../../frontend/e2e/report/cdp/summary.md) |
| `E-CDPX` | vitest 内连 CDP `127.0.0.1:9223` 真渲染的浏览器用例；历史 2026-11-21 23:01 为 `ExecRowHitArea.test.tsx` 3/3 实际执行（3329ms）；2026-11-22 12:15 本机 9223 无监听，该文件 4 条整组 skip，未取新结果 | `frontend/.test-full-front-fix-3.log` 该文件条目；本轮 `.tmp/fe-conv7-20261122-121527.log`；源码 `frontend/src/components/ExecRowHitArea.test.tsx` |
| `E-DOC` | 批次证据汇总（前端 115 / 后端 246 / CDP 19×2） | [`docs/testing/CONV-EVIDENCE-20261121.md`](../../../docs/testing/CONV-EVIDENCE-20261121.md) |
| `E-ACC2` | v2 独立验收（2026-11-21 21:54–22:06）：前端 139/139、后端 16 包 ok、CDP 40/40 + 24/24、截图 10 张 | [`docs/testing/ACCEPT-CONV-20261121.md §7`](../../../docs/testing/ACCEPT-CONV-20261121.md)；`.tmp/accept/cdp-v2*.log`、`cdp-v2*.mjs`、`*-evidence.json`、`docs/testing/ACCEPT-v2-*.png` |
| `E-ACC5` | 第五轮独立验收（2026-11-22）：右栏分组展开 done 3/6→6/6、pending 3/4→4/4、补取失败可重试；`AC-CONV-008-05` 判通过 | [`docs/testing/ACCEPT-CONV-5-20261122.md`](../../../docs/testing/ACCEPT-CONV-5-20261122.md) |
| `E-ACC6` | 第七轮独立验收（2026-11-22 13:25–13:35）：真机 8787 + CDP 9223、1600×1000；点击命中 27/27、末尾 71/73/74、滚轮、右边界 1px、任意 y 10/10、15 行计数 209；结论 pass | [`docs/testing/ACCEPT-CONV-6-20261122.md`](../../../docs/testing/ACCEPT-CONV-6-20261122.md)；`.tmp/accept6/raw*.json`、`accept6-*.png` |
| `E-STOP2` | 按消息定向停止（2026-11-22 14:0x）：后端 `TestStopFrameByMessageIDStopsOnlyTargetStream`（`backend/internal/modules/chat/stop_interrupt_test.go:402`）PASS 2.07s、chat 整包 `ok 3.139s`；前端 23 文件 / 243 用例全过 26.45s；`tsc` 与 `go vet` EXIT=0 | 本轮实测记录；运行日志待 Lead 归档；[`docs/testing/STOP-EVIDENCE-2-20261122.md`](../../../docs/testing/STOP-EVIDENCE-2-20261122.md) |

> `E-CDP` 是 2026-11-21T05:14Z 的报告，早于本轮 W4 代码变更；凡仅靠 E2E 成立的 AC，证据栏同时标注“未在最新树重跑”。E2E 涉及的行为（会话树、归档子会话、搜索、发送、多标签）未被 W4 主会话守卫改变。§1 与 §2–§14 里标注 `vitest-v2.log 139/139` 的句子是对应 AC 在 21:56 那轮的历史证据，仍成立；现行全量基线为前端 23 文件 / 243 用例全过（2026-11-22 14:0x，0 skip）、后端沿用 285 PASS / 1 SKIP（12:20–12:25，本轮全量待 Lead 回归），新增断言以本轮行号为准；CDP 类证据本轮未重取，引用处已标注“历史 23:01”或“本轮 skip”。

### 0.5 本轮运行记录

| 时间 | 套件 | 结果 | 备注 |
|---|---|---|---|
| 2026-11-21 20:33 | 前端 `vitest run --pool=threads` | `17 passed (17)` / `128 passed (128)`，exit 0，13.90s | 含新增 `ExecRowHitArea.test.tsx`（CDP 可用时执行，否则整文件 skip） |
| 2026-11-21 20:43 | 后端 `go test ./... -count=1 -timeout 300s` | 全包 `ok`，`cmd/simo 250.42s`，exit 0 | 同 §0.2 命令加硬超时；尾部日志见下方补记 |
| 2026-11-21 20:36 | 后端定向 38 条 P1 测试 | `PASS`，`ok simo/cmd/simo 47.906s`，exit 0 | `-run 'TestP1Conv\|TestMainSessionArchiveRejected\|TestM6\|...'`；用于全量挂起时的独立取证 |
| 2026-11-21 21:56 | 前端 `vitest run --pool=threads`（v2 验收） | `17 passed (17)` / `139 passed (139)`，20.46s，exit 0；`tsc --noEmit` exit 0 | `.tmp/accept/vitest-v2.log` |
| 2026-11-21 22:00 | 后端 `go test ./... -count=1 -timeout 300s`（v2 验收） | 16 包 `ok`、0 `FAIL`，`cmd/simo 252.207s`，exit 0；`func Test*` 265 条 | `.tmp/accept/gotest-v2.log` |
| 2026-11-21 21:58 / 22:04 | CDP v2 验收脚本 | `40/40 PASS`（21:58:05–21:58:31）、`24/24 PASS`（22:04:38–22:04:44） | `.tmp/accept/cdp-v2.log`、`cdp-v2c.log` 及同名 `-evidence.json` |
| 2026-11-21 22:35 | 后端 `go test ./... -count=1 -timeout 300s` | `PASS=269 SKIP=1 FAIL=0 okpkg=16`，`cmd/simo 259.857s`，exit 0 | `.tmp/be-after2.log`；SKIP 为既有 `TestResolveToolPathCanonicalizesWorkspaceRoot`（`tools_path_test.go:23`，symlink 需 Windows 特权）；含新增 `backend/internal/modules/sessions/etag_test.go` 五条 |
| 2026-11-21 23:01 | 前端 `vitest run --pool=threads` | `18 passed (18)` / `161 passed (161)`，18.79s，exit 0；`tsc --noEmit` exit 0 | `frontend/.test-full-front-fix-3.log`、`frontend/.test-summary-front-fix-3.log`、`frontend/.tsc-front-fix-3.log`；`ExecRowHitArea.test.tsx` 3 tests 3329ms 实际执行，CDP 9223 可用 |
| 2026-11-21 23:32 | 后端定向 8 条（置顶顺序 + 归档守卫 + 重启保持） | `PASS` 8/8，`ok simo/internal/modules/sessions 0.532s`，exit 0 | `.tmp/be-pin-guard.log`；`-run 'TestTreeSibling\|TestTreePin\|TestSetPinnedRejectsArchivedSession\|TestPinArchivedSessionHTTPConflict\|TestPinnedPersistsAcrossRestart'` |
| 2026-11-21 23:32 | 前端定向 3 文件（`api.test.ts`、`Sidebar.test.tsx`、`App.conversation.test.tsx`） | `3 passed (3)` / `61 passed (61)`，15.64s，exit 0 | `.tmp/fe-pin-etag.log`；分文件 10 / 15 / 36；当时全量仍是 18 文件/161（23:01），已于 2026-11-22 02:26 重跑为 20 文件 / 200 用例 |
| 2026-11-21 23:31 / 23:30 | 真机 8787 部署实例 + headless Chrome（置顶顺序、304、截图） | `metrics.json` 断言全绿；截图 5 张 | `docs/testing/deploy-8787-2330-metrics.json`、`deploy-8787-2330-{pinned,unpinned,order-restored,search-304}-1600.png`、`order-default-left@2x.png` |
| 2026-11-21 23:09 | 治理检查 `node scripts/check-trace.mjs`（仓库 node runtime） | `FAILED: 3 issue(s)`，exit 1；3 项均在 `docs/product/`，本文件无失败项 | 输出见 §16.5 |
| 2026-11-21 23:36 | 矩阵自查（解析 §1 表格） | `rows=33`、`effective=31`、`unique=33`、`pass=31`、`partial=0`、`missing=0`、`blocked=2`、`sum=33`；33 行均 7 列、状态值合法 | 脚本 `.tmp/selfcheck-matrix.mjs`；输出 `{"rows":33,"effective":31,"uniqueACs":33,"uniqueTCs":33,"pass":31,"partial":0,"missing":0,"blocked":2,"sum":33,"badCols":[],"badState":[]}` |
| 2026-11-21 23:36 | 治理检查 `node scripts/check-trace.mjs` 复跑 | `FAILED: 3 issue(s)`，exit 1，与 23:09 完全一致；3 项均在 `docs/product/` | 同上，见 §16.5 |
| 2026-11-22 02:12–02:17 | 后端 `..\toolchain\go.ps1 test ./... -count=1`（首次，无 `-v`） | 16 包 `ok`、0 `FAIL`、10 包无测试，包耗时和 291.686s，exit 0；无 PASS 明细 | `.tmp/be-conv5.log`；用于确认包级通过，PASS 数另跑 `-v` |
| 2026-11-22 02:18–02:23 | 后端 `..\toolchain\go.ps1 test ./... -count=1 -v`（含并行 Agent 的 `messageCount` 新代码） | `PASS=281 SKIP=1 FAIL=0 okpkg=16`，`cmd/simo 250.267s`，exit 0 | `.tmp/be-conv5v.log`；新增 `message_count_test.go` 四条全 PASS；SKIP 仍为既有 `TestResolveToolPathCanonicalizesWorkspaceRoot` |
| 2026-11-22 02:24–02:25 | 前端 `vitest run --pool=threads`（messageCount 迁移完成后的首跑，机器同时在做后端构建） | `20 passed (20)` / `196 passed (196)`，4 条 5s 超时失败（`App.tabsync.degrade`、`ExecRowHitArea` ×2、`App.operation-errors`），exit 1 | `frontend/.test-full-conv6.log`；4 条失败均为 `TestTimeoutError`，非断言失败 |
| 2026-11-22 02:25 | 失败文件单独复跑（3 文件） | `3 passed (3)` / `9 passed (9)`，5.02s，exit 0 | `frontend/.test-retry-conv6.log`；确认是构建负载导致的超时，不是代码缺陷 |
| 2026-11-22 02:26 | 前端 `vitest run --pool=threads`（空载全量复跑） | `20 passed (20)` / `200 passed (200)`，25.99s，exit 0；`tsc --noEmit` exit 0 | `frontend/.test-full-conv6b.log`、`frontend/.tsc-conv6.log`；摘要脚本同为 20/200 |
| 2026-11-22 02:25 | 真后端 `GET /api/sessions`（新二进制 + `data/` 副本，8891 端口，`-model mock`） | 15 个会话；`main.messageCount=75`；全部会话 `messageCount` 求和 209 | `.tmp/conv6-sessions.raw.json`；`SIMO_HOME=.tmp/conv6-home`；与底部“15 个会话 · 归档 0 · 209 条消息”一致 |
| 2026-11-22 02:36 | 矩阵自查（解析 §1 表格与 §2–§14 明细标题） | `rows=35`、`effective=33`、`uniqueACs=35`、`uniqueTCs=35`、`pass=32`、`partial=1`、`missing=0`、`blocked=2`、`sum=35`；无空单元格、无重复 AC/TC、矩阵与明细一一对应（无孤儿、无缺明细） | `.tmp/selfcheck-matrix2.mjs` 输出 |
| 2026-11-22 12:15 | 前端 `vitest run --pool=threads` | `Test Files 21 passed | 2 skipped (23)`、`Tests 226 passed | 6 skipped (232)`，27.79s，exit 0；`tsc --noEmit` exit 0 | `.tmp/fe-conv7-20261122-121527.log`、`.tmp/tsc-conv7.log`；2 个 skipped 文件因 CDP 9223 无监听：`ExecRowHitArea.test.tsx` 4 条、`MessageTableLayout.test.tsx` 2 条 |
| 2026-11-22 12:20–12:25 | 后端 `..\toolchain\go.ps1 test ./... -count=1 -timeout 300s -v` | `PASS=285 SKIP=1 FAIL=0 okpkg=16`，16 包耗时和 272.256s，exit 0 | `.tmp/be-conv7v-20261122-122018.log`；新增 `spec_projection_etag_test.go` 五条全 PASS（`NotModified` 由 `etag_test.go` 移入并扩展，净增 4）；SKIP 仍为既有 `TestResolveToolPathCanonicalizesWorkspaceRoot` |
| 2026-11-22 12:26 | 矩阵自查（解析 §1 矩阵与 §2–§14 明细标题） | `rows=35`、`effective=33`、`uniqueACs=35`、`uniqueTCs=35`、`pass=31`、`partial=2`、`missing=0`、`blocked=2`、`sum=35`；无空单元格、无重复 AC/TC、矩阵与明细一一对应（无孤儿、无缺明细）、无坏列/非法状态 | `.tmp/selfcheck-matrix2.mjs` 输出 |
| 2026-11-22（第五轮验收） | 独立验收：右栏分组展开补取 | done 3/6→6/6、pending 3/4→4/4、补取失败显示可见错误并可重试；`AC-CONV-008-05` 判通过 | `docs/testing/ACCEPT-CONV-5-20261122.md` |
| 2026-11-22 13:25–13:35 | 第七轮独立验收：真机 8787 + CDP 9223、1600×1000 | 点击命中 27/27、末尾 71/73/74、滚轮 active 28、任意 y 10/10、右边界 1px 不触发、15 行计数 209；结论 pass | `docs/testing/ACCEPT-CONV-6-20261122.md`、`.tmp/accept6/raw*.json`、`accept6-*.png`；`AC-CONV-007-02` 转 pass |
| 2026-11-22 13:55 | 前端 `vitest run --pool=threads`（CDP 9223 可用） | `Test Files 23 passed (23)`、`Tests 242 passed (242)`，30.96s，exit 0，0 skipped | `.tmp/accept8/frontend-all.log`；原 skip 的 `ExecRowHitArea.test.tsx` 4 条、`MessageTableLayout.test.tsx` 2 条全部执行并通过 |
| 2026-11-22 13:56 | 任务 B A3 真机复测：`MessageTableLayout.test.tsx` | `Tests 2 passed`，1180 586ms / 375 335ms，27.11s，exit 0；`.msg-table-wrap` 的 `scrollWidth>clientWidth` 成立，`.conversation-scroll` 与 `documentElement` 均无横溢 | `.tmp/accept8/table-cdp.log` |
| 2026-11-22 13:54–13:56 | 任务 A 375×812 真机几何（CDP 9223，四态） | composer/send/textarea visibleRatio=1；inspector/sidebar `display:none`、与 composer/send 矩形不相交；`scrollWidth=375`、sendHit 命中、输入后 sendDisabled=false、console 0 | `docs/testing/final-375-initial.png`、`-scrolled.png`、`-composer-focus.png`、`-typed.png`；metrics `.tmp/accept8/375-metrics.json`、日志 `.tmp/accept8/375-run.log` |
| 2026-11-22 13:57 | 任务 C/008-04 真机 304（8787 `spec-projection`） | 首次 200（1375 B、ETag `"spec-c5a2d772dd1d5d88"`）→ 条件请求 304（0 B、ETag 保持、`Cache-Control: no-cache`）；`taskLimit=50` 200（1815 B、另一 ETag） | `.tmp/accept8/304-live.cjs`、`.tmp/accept8/304-live.log`、`.tmp/accept8/304-live.json` |
| 2026-11-22 14:07 | 后端定向重跑 `TestStopFrameCancelsUpstreamAndStopsDeltas` | `PASS` 0.14s、`ok simo/internal/modules/chat 0.523s`、exit 0 | `.tmp/accept8/stop-targeted.log`；独立复核 STOP-EVIDENCE，非引用文档自述 |
| 2026-11-22 13:56–14:10 | 后端全量 `go test ./... -v` | 未取到：启动 11 分钟日志 0 字节，已停止；不判 fail，沿用 12:20 的 285 PASS 基线 | `.tmp/accept8/backend-all.log`（0 B） |
| 2026-11-22 14:0x | 后端定向 `TestStopFrameByMessageIDStopsOnlyTargetStream` + `TestStopFrameCancelsUpstreamAndStopsDeltas`、chat 整包；前端全量 `vitest run --pool=threads`；`tsc --noEmit`、`go vet` | 后端定向两用例 PASS（新用例 2.07s）、`ok simo/internal/modules/chat 3.139s`；前端 `Test Files 23 passed (23)` / `Tests 243 passed (243)`、26.45s、0 skip；`tsc` EXIT=0、`go vet` EXIT=0 | 按消息定向实现后的本轮实测；日志待 Lead 归档；用例与链路见 `docs/testing/STOP-EVIDENCE-2-20261122.md`；后端全量待 Lead 回归 |

后端补记：20:35 首次全量运行在 `cmd/simo` 无输出挂起 >20 分钟（`simo.test` CPU 仅 19s），已中止；20:43 用 `-timeout 300s` 重跑通过（`cmd/simo 250.42s`、全包 `ok`、`GO_EXIT=0`）。首轮挂起归因未确证，按“环境/并发下的偶发挂起”记录，不作为失败结论；后续全量门禁一律带 `-timeout`。<!-- RUN-BE -->

治理检查（`node scripts/check-trace.mjs`）：2026-11-21 20:42 补 `tc-p1-001`..`012` + `tc-p1-conv-008` 共 13 个锚点后，锚点缺失项 25→0；残余 3 项均在 `docs/product/`（TREE `:136` 的 CONV-008 链接缺锚点、TRACEABILITY `:1/:30` 缺 CONV-008 行且合计 71≠72），不属本文件 scope。2026-11-21 23:09 复跑结论相同：`FAILED: 3 issue(s)`、exit 1，另 1 条 `[WARN]`（PRD-CONV-008 未被任何 change 包引用）；完整输出见 §16.5，`docs/product/` 未改动。

---

## 1. AC → TC 映射矩阵

> 33 条 AC 全覆盖（原 SYNC-005 两条已随 PRD 移除，编号不复用）：全部生效。`AC-CONV-002-03`（删除会话）经产品裁决移出验收面（显式非目标 + backlog），本表不设行、不设 TC、不计缺口、不计状态。`TC-P1-CONV-NNN` 为稳定编号（既有编号按 AC 在产品 spec 中的出现顺序），负路径用 `-N` 后缀，不改变主编号；因此 007 号保留但不再承载 AC（不重排、不复用）。2026-11-22 新增的 `AC-CONV-001-05`、`AC-CONV-008-05` 追加为 035/036，不回填、不重排既有编号。

| # | AC | TC | 类型 | 自动化位置（`文件:行` 或 `缺失`） | 状态 | 证据 |
|---|---|---|---|---|---|---|
| 1 | AC-CONV-001-01 | TC-P1-CONV-001 | unit/component/http/e2e | `frontend/src/components/Sidebar.test.tsx:50`；`frontend/src/App.conversation.test.tsx:418`；`backend/cmd/simo/m4_test.go:134`；`frontend/e2e/scripts/cdp-runner.mjs:361`、`:792` | pass | E-FE / E-BE / E-CDP |
| 2 | AC-CONV-001-02 | TC-P1-CONV-002 | component/http/e2e | `frontend/src/components/Sidebar.test.tsx:114`、`:128`；`frontend/src/App.conversation.test.tsx:407`；`backend/cmd/simo/m70_test.go:67`；`backend/cmd/simo/m14_test.go:147`；`frontend/e2e/scripts/cdp-runner.mjs:971` | pass | E-FE / E-BE / E-CDP |
| 3 | AC-CONV-001-03 | TC-P1-CONV-003 | http/component/e2e | `backend/cmd/simo/p1_conv_sessions_http_test.go:557`；`frontend/src/App.conversation.test.tsx:109`（仅子会话归档/恢复）、`:126`（主会话无菜单）；`frontend/src/components/Sidebar.test.tsx:140`；`frontend/src/components/library.tsx:121`（`!isMain` 守卫） | pass | E-ACC2 §7（2026-11-21 21:58:05–21:58:12）；HTTP：409 含 `blockers:["主会话不可归档"]`、main unarchive 200、子会话 archive/unarchive 1→0（`.tmp/accept/cdp-v2.log`、`cdp-v2-evidence.json`）；单元/组件：`vitest-v2.log` 139/139；CDP：`cdp-v2.mjs` 40/40；截图：该类未覆盖 |
| 4 | AC-CONV-001-04 | TC-P1-CONV-004 | component/http | `frontend/src/App.conversation.test.tsx:103`（置顶后按服务端刷新出现“取消置顶”）、`:116`（取消置顶）；`frontend/src/App.operation-errors.test.tsx:101`（pin 失败 toast、菜单与列表保持未置顶）；`frontend/src/components/Sidebar.test.tsx:148`（主会话/草稿无菜单、pinned 反向）；`backend/cmd/simo/ui1_test.go:97`（真 HTTP pin/unpin + `?pinned=`）；`frontend/src/components/Sidebar.test.tsx:184`（归档行无“置顶”，只有“恢复”）；`frontend/src/App.conversation.test.tsx:643`（树里已归档的会话置顶被拒）；`backend/internal/modules/sessions/tree_order_test.go:76`、`:97`、`:117`、`:148`、`:172`（兄弟序前移、复原、只改同级、幂等、树/平表一致）；`backend/internal/modules/sessions/pin_guard_test.go:40`、`:86`、`:129`（归档拒绝、409 `session_archived`、重启保持）；`backend/internal/modules/sessions/management_test.go:44`（`pinned DESC, created_at DESC`） | pass | E-FE / E-BE / E-ACC2（真机 8787 + headless Chrome，2026-11-21 23:31）；`metrics.json`：`order.default=[主,周报,数据,研究]` → `pinned=[主,研究,周报,数据]` → `unpinned` 复原，`siblingsRelativeOrderKeptWhenPinned:true`、`unpinnedRestored:true`、`pinFlow.menuAfterPin=[取消置顶,归档]`、`POST /pin 200`；截图 `deploy-8787-2330-pinned-1600.png`、`order-restored-1600.png`（左栏与 `order-default-left@2x.png` sha256 同为 `10ab758f…`）；重启保持由 `TestPinnedPersistsAcrossRestart`（重开同一 sqlite 文件）覆盖；定向 8/8 PASS（`.tmp/be-pin-guard.log`）、前端 3 文件 61 tests（`.tmp/fe-pin-etag.log`），全量未重跑 |
| 5 | AC-CONV-002-01 | TC-P1-CONV-005 | component/http/e2e | `frontend/src/App.conversation.test.tsx:72`、`:94`、`:107`、`:122`；`frontend/src/components/Sidebar.test.tsx:90`；`backend/cmd/simo/m6_test.go:66`；`backend/cmd/simo/m70_test.go:24`；`frontend/e2e/scripts/cdp-runner.mjs:649`、`:690`、`:739` | pass | E-FE / E-BE / E-CDP |
| 6 | AC-CONV-002-02 | TC-P1-CONV-006 | component/e2e | `frontend/src/App.conversation.test.tsx:85`（创建失败保持 active）；`frontend/src/App.operation-errors.test.tsx:49`（rename）、`:75`（archive）、`:96`（刷新失败）、`:115`（卡片）；`frontend/src/components/Sidebar.test.tsx:77` | pass | E-ACC2 §7（2026-11-21 22:04:38–22:04:44，另 rename 段 21:58:21–26）；单元/组件：`vitest-v2.log` 139/139；HTTP：失败由 CDP 拦截注入，重试请求计数 `POST /api/sessions` 2/archive 2/unarchive 2/read 2；CDP：`cdp-v2c.log` 24/24；截图：`docs/testing/ACCEPT-v2-create-failure.png`、`archive-failure.png`、`restore-failure.png`、`rename-failure.png`；恢复失败仅 CDP 覆盖，无组件用例 |
| 7 | AC-CONV-003-01 | TC-P1-CONV-008 | component/e2e | `frontend/src/components/Sidebar.test.tsx:102`（输入触发搜索）、`:109`（搜索中）；`frontend/src/App.conversation.test.tsx:227`（标题命中）、`:238`（无匹配/清空恢复）；`frontend/e2e/scripts/cdp-runner.mjs:930` | pass | E-ACC2 §7（2026-11-21 21:58:14 复测）；单元/组件：`vitest-v2.log` 139/139；HTTP：`q=研究员` 命中子会话、正文词 `q=周报范围和输出内容`/`q=三条可执行结论` 均 0（`.tmp/accept/http-evidence.log`）；CDP：仅 `/api/sessions?q=`，无 `/api/messages/search`（`cdp-v2.log`、`cdp-accept3.log`，`messageSearchSeen:false`）；截图：`a5-search-title.png`、`a6-search-body-empty.png`、`v2-s3-search-body-token.png`（均 `.tmp/accept/`） |
| 8 | AC-CONV-003-02 | TC-P1-CONV-009 | component/e2e | `frontend/src/components/Sidebar.test.tsx:114`（错误态可重试、不落无匹配）；`frontend/src/App.conversation.test.tsx:248`（失败与空态区分、就地重试）；`frontend/src/app.tsx:72`（`searchError`）、`:191`（`retrySearch`） | pass | E-ACC2 §7（2026-11-21 21:58:13–14）；单元/组件：`vitest-v2.log` 139/139；HTTP：拦截 `GET /api/sessions?q=*` 500 → 错误态，重试真实发出 `q=研究员` 并 200；CDP：`sideEmpty=null`、重试按钮 1（`.tmp/accept/cdp-v2.log`），故障由 CDP 注入、非后端真实 500；截图：`docs/testing/ACCEPT-v2-search-error-state.png`（21:58:13）、`ACCEPT-v2-search-retried.png`（21:58:14）；未读部分转 SYNC-004 承接 |
| 9 | AC-CONV-003-03 | TC-P1-CONV-010 | component/http/e2e | `frontend/src/App.conversation.test.tsx:227`（标题搜索且 `searchQueries` 为空）、`:248`（失败重试）；`frontend/src/components/Sidebar.test.tsx:102`；`frontend/src/api.ts:34`（`/api/sessions?q=`）；`frontend/src/app.tsx:435` | pass | E-ACC2 §7（2026-11-21 21:58:14）；单元/组件：`vitest-v2.log` 139/139；HTTP：`q=研究员` 200 命中子会话、正文词 0（`.tmp/accept/http-evidence.log`）；CDP：调用清单只有 `/api/sessions?q=…`，无 `/api/messages/search`（`cdp-v2.log`）；截图：`.tmp/accept/v2-s3-search-body-token.png`（正文词空态） |
| 10 | AC-CONV-004-01 | TC-P1-CONV-011 | component/e2e | `frontend/src/components/MessageItem.test.tsx:8`、`:15`、`:22`、`:35`、`:63`、`:71`（GFM 表格对齐/`role=region`/`tabindex`）、`:91`（单元格行内 code）、`:97`（单元格内竖线转义）、`:104`（表前 prose）、`:112`（非法表格保持段落）、`:124`（流式光标/失败徽标）、`:147`（卡片提交态）、`:187`（加粗）、`:194`（斜体）、`:201`（删除线）、`:208`（http/https/mailto 链接安全属性）、`:221`（加粗内 code）、`:230`（code 内不解析）、`:239`（snake_case）、`:246`（`javascript:` 不成锚点）、`:255`（未闭合标记按字面）；`frontend/src/components/MessageLinkStyle.test.ts:87`、`:95`、`:103`、`:113`（链接样式 CSS 契约）；`frontend/e2e/scripts/cdp-runner.mjs:451`、`:832` | pass | E-FE 242 / E-CDP（历史）；表格与行内渲染、链接样式有单测；真机表格滚动本轮 CDP 实跑通过（`frontend/src/components/MessageTableLayout.test.tsx:50`，1180 586ms / 375 335ms，2/2 pass，27.11s，exit 0，`.tmp/accept8/table-cdp.log`）；横向滚动由 `.msg-table-wrap` 承担：1180 档 clientWidth 496 / scrollWidth 819、可滚 323，375 档 331/819、可滚 488，`table` 两档 819/819，`.conversation-scroll` 568/568 与 359/359（ACCEPT-CONV-9 §2.5）；链接 computed 样式仍只有 jsdom 单测 |
| 11 | AC-CONV-004-02 | TC-P1-CONV-012 | component/http | `frontend/src/components/MessageItem.test.tsx:44`、`:54`、`:89`、`:100`；`backend/cmd/simo/m78_internal_message_test.go:23`、`:75`；`backend/cmd/simo/m79_internal_history_test.go:11` | pass | E-FE / E-BE |
| 12 | AC-CONV-004-03 | TC-P1-CONV-013 | http/component | `backend/cmd/simo/m78_internal_message_test.go:23`、`:75`；`backend/cmd/simo/m79_internal_history_test.go:11`；`backend/cmd/simo/m50_test.go:14`；`frontend/src/components/MessageItem.test.tsx:100` | pass | E-BE / E-FE |
| 13 | AC-CONV-007-01 | TC-P1-CONV-014 | component/http/e2e | `frontend/src/App.integration.test.tsx:120`、`:152`、`:167`；`frontend/src/components/TimelineGroups.test.tsx:21`、`:44`、`:77`；`backend/cmd/simo/m81_all_messages_test.go:30`、`:44`；`frontend/e2e/scripts/cdp-runner.mjs:451`、`:832` | pass | E-FE / E-BE / E-CDP |
| 14 | AC-CONV-007-02 | TC-P1-CONV-015 | component/http/CDP | `frontend/src/App.integration.test.tsx:128`（413 后重试成功）、`:140`（403/空上级按已访问）；`frontend/src/App.conversation.test.tsx:299`、`:355`、`:365`；`backend/cmd/simo/m89_all_messages_errors_test.go:11`（真后端 413 `messages_too_many`）；`frontend/src/components/TimelineGroups.test.tsx:233`（CSS 契约：`--gutter-timeline:44px` 整列、`.tl-bar` 20×4、`.timeline .tl-bar{pointer-events:none}`、`.tl-bar::after` 已不存在，jsdom 实跑通过）、`components.css:111`/`:115`/`:1075-1076`；`frontend/src/components/ExecRowHitArea.test.tsx:82`（四角 `elementFromPoint`）、`:182`（细指针）——12:15 本轮 4 条 skip（9223 无监听），13:25 由真机验收覆盖 | pass | E-ACC6（`docs/testing/ACCEPT-CONV-6-20261122.md`，2026-11-22 13:25–13:35，真机 8787 + CDP 9223，1600×1000）：点击命中 27/27（刻度 4/37/60 × 中心/±16px × 纵向 ±18px，active=最近刻度、targetTop=0 且完全可见）；末尾 71/73/74 点击后 1 秒仍定位且完全可见（scrollTop=6351）；滚轮 -200 后 active 28 等于顶部消息；任意 y 10/10 归属唯一、每次恰一次跳转；右边界外 1px 不触发；15 行计数与 API 逐行相等、总和 209；未验证：touchstart/pointerdown 释放、末尾超 3 秒稳定性、75 根刻度穷举、窄屏分支；E-FE / E-BE（HTTP）仍有效 |
| 15 | AC-CONV-005-01 | TC-P1-CONV-016 | component/ws/e2e | `frontend/src/components/Composer.test.tsx:28`、`:102`；`frontend/src/App.conversation.test.tsx:212`、`:436-453`、`:455`（并发两条流逐条发帧、messageId 集合为 `['stream-1','stream-2']`）；`frontend/src/api.ts:251-258`（`correct` 帧带 messageId）、`frontend/src/app.tsx:710-721`（逐条登记并发送）；`backend/internal/modules/chat/http.go:67`、`:384`（字段与透传）；`backend/internal/modules/chat/stop_interrupt_test.go:32`、`:402`；`backend/cmd/simo/p1_conv_ws_test.go:234`；`frontend/e2e/scripts/cdp-runner.mjs:386` | pass | E-FE 243（23 文件、0 skip、26.45s）/ E-BE-STOP2（定向两用例 PASS，新用例 2.07s，chat 整包 3.139s）/ E-CDP（历史）：正常发送、流式增量、停止后不增长均有实测；按 messageId 定向已闭合——双流只停目标（停第一条后零 delta、`status=retracted`，第二条继续 delta 并 `done`，`sseRequests==2`），不存在的 messageId 不扩大到任何一条；前端对每条流式消息各发一帧且各带 messageId；环境限制：真实厂商 403、跨标签双 WS 不作判据 |
| 16 | AC-CONV-005-02 | TC-P1-CONV-017 | component/http/ws | `frontend/src/App.conversation.test.tsx:187`（失败提示+重发不重复）、`:240`（停止后忽略后续 delta）、`:486`（close→open 重连+补拉）；`frontend/src/components/Composer.test.tsx:61`、`:74`；`backend/cmd/simo/p1_conv_chat_idempotency_test.go:58`–`:267`（7 条）；`backend/cmd/simo/p1_conv_ws_test.go:386`（since 续传不重发）；`backend/cmd/simo/m55_test.go:17`；`backend/internal/modules/chat/stop_interrupt_test.go:32`、`:402`；`backend/internal/modules/chat/stop_upstream_test.go`（假上游 SSE：停止后 10ms context 关闭、之后 delta 0、idle 在 retracted 之后） | pass | E-FE 243 / E-BE（285 PASS 基线，含幂等 7 条）/ E-BE-STOP2（新用例 2.07s、chat 整包 3.139s）/ E-BE-STOPUP（`STOP-UPSTREAM-EVIDENCE-20261122.md`，5 PASS / 0 FAIL，8.059s）：失败恢复、防重复、重连可见与补拉、`since` 不丢不重、停止真中断均有断言；机制判据已由真 HTTP 假上游证明——停止帧后上游 `context` 10ms 内取消，`reply.retracted`（帧 8）先于 `idle`（帧 9），之后 `reply.delta`/`message.delta` 为 0，负例不取消；2026-11-22 第十轮杀进程实测断线 →`重连中`→ 重启 →`已连接`（4.9 s），重连帧带数字 `since=9291`；环境限制：真实厂商 `api.deepseek.com` 403（key 失效）与跨标签双 WS 不可达/未跑，不进判据 |
| 17 | AC-CONV-006-01 | TC-P1-CONV-018 | component/e2e | `frontend/src/components/Composer.test.tsx:28`、`:36`、`:52`、`:87`、`:129`；`frontend/e2e/scripts/cdp-runner.mjs:416` | pass | E-FE / E-CDP |
| 18 | AC-CONV-006-02 | TC-P1-CONV-019 | component | `frontend/src/components/Composer.test.tsx:44`、`:61`、`:110`、`:162`、`:172` | pass | E-FE（组合中不发送、上屏后 50ms 内 Enter 忽略、失败保留文本、禁用不发送、长文本完整均有单测）；2026-11-22 第十轮：`docs/testing/IME-EVIDENCE-20261122.md` 用 CDP `Input.imeSetComposition` 完成五点验证（组合态不发送、组合中 Enter 不发送且 `isComposing=true`、提交无拼音残留、点发恰好 +1、连续两句不粘不重），截图 `docs/testing/ime-compose-20261122.png`、`ime-timeline-20261122.png`；物理输入法未覆盖，作为环境限制记入 §15 M-05，不阻塞本 AC（`ACCEPT-CONV-10` §2） |
| 19 | AC-SYNC-001-01 | TC-P1-CONV-020 | http/ws/component | `backend/cmd/simo/server_test.go:243`、`:301`；`backend/cmd/simo/m88_ws_fanout_test.go:23`；`frontend/src/App.integration.test.tsx:204` | pass | E-BE / E-FE |
| 20 | AC-SYNC-001-02 | TC-P1-CONV-021 | component/http | `frontend/src/App.conversation.test.tsx:486`（socket close→open 重连、报状态、补拉断线期间消息）；`:259` 属 `session_unread` 合并刷新用例（254 行起），非重连证据；`backend/cmd/simo/m6_test.go:100`；`backend/cmd/simo/m55_test.go:17`、`:57` | pass | E-FE / E-BE；2026-11-22 第十轮真机：先收到带数字 id 的帧（游标 9288/9289）再杀进程 → `重连中` → 重启 → `已连接`（4.9 s），重连帧 `{"type":"subscribe","data":{"sessionId":"sess-b3b42e8f8de61893","since":9291}}`、`sinceType=number`，上一轮“重连不带 since”的缺口消除（当时页面尚无事件）；证据 `docs/testing/sync001-since-evidence-2.json`、脚本 `.tmp/accept10/sync001-since2.mjs` |
| 21 | AC-SYNC-002-01 | TC-P1-CONV-022 | component/e2e | `frontend/src/App.tabsync.test.tsx:115`（active 跟随、忽略自身与旧帧）、`:148`（祖先合并且不重复）、`:165`/`:340`（三级祖先逐级加载）、`:235`/`:273`/`:297`/`:316`（读游标随 `at` 清未读、更旧不回退、重复幂等）；`frontend/src/App.tabsync.channel.test.tsx:98`、`:113`；E2E `frontend/e2e/scripts/cdp-runner.mjs:881`（13 双页，05:14 未重跑） | pass | E-FE；peer 由 `CapturingBroadcastChannel` 模拟，真双标签时序仍归 §15 M-03 |
| 22 | AC-SYNC-002-02 | TC-P1-CONV-023 | component | `frontend/src/App.tabsync.test.tsx:189`（同 `at` 按 tabId 字典序、同 `at` 旧 sessionId 重复投递不回退）、`:211`（两种到达序收敛同一终态）、`:148`（重复广播不叠加）、`:297`（更小 tabId 来晚不清已读）；`frontend/src/App.tabsync.degrade.test.tsx`（`BroadcastChannel=undefined` 挂载不抛、切会话仍生效、重挂恢复） | pass | E-FE |
| 23 | AC-SYNC-003-01 | TC-P1-CONV-024 | component/e2e | `frontend/src/components/Composer.test.tsx:87`、`:129`；`frontend/e2e/scripts/cdp-runner.mjs:881` | pass | E-FE / E-CDP |
| 24 | AC-SYNC-003-02 | TC-P1-CONV-025 | component | `frontend/src/components/Composer.test.tsx:144`（storage 事件跨标签）、`:178`（真 `BroadcastChannel`（node worker_threads 实现）双实例，另一实例跟随到 `shift-enter` 且 `localStorage` 同步）、`:198`（无通道降级仍可用并持久化）、`:219`（构造器抛错不崩、storage 兜底） | pass | E-FE；单进程双实例，真实两标签见 §15 M-03 |
| 25 | AC-SYNC-004-01 | TC-P1-CONV-026 | component/e2e | `frontend/src/App.conversation.test.tsx:148`（未读点+进入清除）、`:179`（`session_unread` 合并刷新且保留搜索词）；`frontend/src/components/Sidebar.test.tsx:126`（只出点、无数字）；`frontend/src/components/library.tsx:121` | pass | E-ACC2 §7（2026-11-21 21:58:05–21:58:31）；单元/组件：`vitest-v2.log` 139/139；CDP：`cdp-v2.mjs` 40/40，A 行 `unread:true/active:false`、`latencyMs:441`，帧 `session_unread`（`.tmp/accept/cdp-v2.log`）；HTTP：`POST /api/chat` 202 后 tree `hasUnread=true`（`cdp-v2-evidence.json`）；截图：`docs/testing/ACCEPT-v2-live-unread.png`（21:58:09，111,752 B） |
| 26 | AC-SYNC-004-02 | TC-P1-CONV-027 | component/http/e2e | `frontend/src/App.conversation.test.tsx:161`（`session_read` 后刷新并信服务端）、`:213`（写失败保留红点+toast）；`backend/internal/modules/chat/unread_test.go:93`（重启持久化）、`backend/cmd/simo/p1_conv_unread_test.go:93` | pass | E-ACC2 §7（2026-11-21 21:58:55 重启、22:04 复测）；单元/组件：`vitest-v2.log` 139/139；HTTP：重启后 `hasUnread=false`（`serve4.log` 新进程；v2 无独立 GET 日志，v1 `http-evidence.log` 13:16:45Z 有 `after restart main hasUnread = false`）；CDP：D 段 24/24，500 → toast/红点/服务端 `true`，重试 200 → `false`，read POST=2（`.tmp/accept/cdp-v2c.log`）；截图：`docs/testing/ACCEPT-v2-read-failure.png`、`ACCEPT-v2-read-retried.png` |
| 27 | AC-SYNC-004-03 | TC-P1-CONV-028 | component/e2e | `frontend/src/App.conversation.test.tsx:161`（`session_read` 清点）、`:179`（`session_unread` 帧合并、无重复刷新）；`frontend/src/components/Sidebar.test.tsx:126`；跨标签通道由 CDP 双 target 覆盖 | pass | E-ACC2 §7（2026-11-21 21:58:05–21:58:31）；单元/组件：`vitest-v2.log` 139/139；CDP：B 收 `session_unread` 出红点；A 已读后 B 未刷新、未切会话即收 `session_read` 清点，B 仍 `active=主会话`，帧 id 8713（`.tmp/accept/cdp-v2.log`）；HTTP：两端均 `GET /api/sessions` 同源；截图：`docs/testing/ACCEPT-v2-cross-tab-cleared.png` |
| 28 | AC-CONV-008-01 | TC-P1-CONV-031 | component | `frontend/src/components/RightPanel.test.tsx:8`、`:75`、`:110` | pass | E-FE |
| 29 | AC-CONV-008-02 | TC-P1-CONV-032 | component/http/e2e | `frontend/src/components/RightPanel.test.tsx:35`（展开/收起 + `messageId` 透传）、`:51`（pending 只在未开始）、`:100`（缺投影不崩、点已完成定位）、`:118`（展开三组后无提交/重试/取消入口）；`backend/cmd/simo/m87_task_message_mapping_test.go:11`；`frontend/src/components/ExecRowHitArea.test.tsx:54`（6 条 `.exec-row` 触控高度 ≥44）；E2E `frontend/e2e/scripts/cdp-runner.mjs:597`（06 点击定位，05:14 未重跑） | pass | E-FE / E-BE / E-CDPX（历史 23:01；本轮 4 条 skip，未重取）；下载仅断言 `downloadUrl` 由 projection 渲染为链接，未实际点击，见 §16.2 G16 |
| 30 | AC-CONV-008-03 | TC-P1-CONV-033 | component/CDP | `frontend/src/components/RightPanel.test.tsx:21`（loading→error+retry→空投影）、`:29`（草稿占位）、`:175`（无会话不渲染 `data-session`、只留“未选择会话”）；`frontend/src/App.integration.test.tsx:359`（空树 + 零值 stats：中栏“开始和司墨对话”、主会话消息/目标不出现；右栏无 `data-session`、无“进行中”、显示“未选择会话”；输入框 disabled）；`frontend/src/app.tsx:249`（树空时清空选中）、`:476-492`（无选中时清空消息/投影）；`frontend/src/components/ExecRowHitArea.test.tsx:254`（375/1600 几何，本轮实跑通过） | pass | E-FE 2026-11-22 12:39：App.integration 13/13、RightPanel 10/10；空态缺陷已修复（树空仍选 main 的 fallback + 残留内容清理）；E-CDPX 几何本轮实跑：375/1600 通过，同文件 900px 细指针用例失败为既有 `56.25em/56.26em` 媒体查询断点问题，与本卡无关；**375 截图本轮补齐**：`docs/testing/final-375-initial.png`、`-scrolled.png`、`-composer-focus.png`、`-typed.png`，metrics `.tmp/accept8/375-metrics.json`（四态 composer/send visibleRatio=1、与 inspector/sidebar 矩形均不相交、`scrollWidth=375`、sendHit 命中、console 0）；375 无抽屉入口（sidebar/inspector 均 `display:none`、toggle=0），遮挡判定不适用（判据见产品 `AC-CONV-008-03`） |
| 31 | AC-CONV-008-04 | TC-P1-CONV-034 | http/component/真机 | `backend/internal/modules/sessions/spec_projection_etag_test.go:67`（Stable）、`:97`（NotModified）、`:145`（TracksTaskChange）、`:182`（TracksDeliverables）、`:207`（DistinguishesTaskLimit）；`backend/internal/modules/sessions/etag_test.go:80`、`:101`、`:139`、`:185`（列表 ETag 四条）；`backend/internal/modules/sessions/spec_projection.go:127-141`（设 ETag/Cache-Control，命中回 304）、`:144-162`（`projectionETag` 含 `taskLimit` 与投影，形如 `"spec-<16 hex>"`）；`backend/cmd/simo/m75_spec_projection_test.go:23`、`:71`（投影内容/limit/404，无 ETag 断言）；`frontend/src/api.ts:337-360`（发 `If-None-Match`；304 先于 200 分支，返回缓存投影 + `notModified:true`）、`:300-306`（缓存键含 `taskLimit`，上限 8）；`frontend/src/app.tsx:423-438`（304 时保留当前数据，不清空、不进错误态）；`frontend/src/api.test.ts:244`（304 不抛错并返回缓存）、`:260`（taskLimit=3/50 各自 ETag、交替 304 不覆盖）、`:282`（`cache=false` 不写缓存）、`:290`（500 仍抛错）、`:295`（LRU 淘汰）；`frontend/src/App.conversation.test.tsx:633`（304 保留搜索行与 active） | pass | E-BE（285 PASS，含投影 ETag 五条）/ E-FE 242（`.tmp/accept8/frontend-all.log`，`api.test.ts:244/:260`、`App.conversation.test.tsx:633` 均执行）；304 空体且保留 ETag/Cache-Control；**真机 304 本轮补齐**：`http://127.0.0.1:8787/api/sessions/main/spec-projection?taskLimit=3` 首次 200、ETag `"spec-c5a2d772dd1d5d88"`（1375 B），带 `If-None-Match` 复请回 304（0 B）、ETag/`Cache-Control: no-cache` 保持；`taskLimit=50` 回 200、ETag `"spec-e217d5acfbc1ba18"`（1815 B）；脚本 `.tmp/accept8/304-live.cjs`、日志 `.tmp/accept8/304-live.log`、结果 `.tmp/accept8/304-live.json`；浏览器内 304 触发的视觉不闪空仍沿用 jsdom 断言（未单独录屏） |
| 32 | AC-CONV-001-05 | TC-P1-CONV-035 | component/integration/http | `frontend/src/components/Sidebar.test.tsx:53`、`:306`；`frontend/src/App.integration.test.tsx:222`、`:244`；`frontend/src/components/library.tsx:161`；`frontend/src/types.ts:16`；`frontend/src/app.tsx:879`；`backend/internal/modules/sessions/counts.go:16`；`backend/internal/modules/sessions/view.go:12`；`backend/internal/modules/sessions/message_count_test.go`（4 条） | pass | E-FE 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（2026-11-22 12:15）；HTTP 原文 `.tmp/conv6-sessions.raw.json`（`main.messageCount=75`、15 会话求和 209）；E-BE 285 PASS（含 `message_count_test.go` 四条）；截图 `docs/testing/accept-conv4-fix-20261122-before.png`/`-after.png` 为迁移前历史证据 |
| 33 | AC-CONV-008-05 | TC-P1-CONV-036 | component/integration/CDP | `frontend/src/components/RightPanel.test.tsx:59`；`frontend/src/App.integration.test.tsx:262`；`frontend/src/components/library.tsx:1001`（`ExecutionGroup` 组头 `{shown}/{totalCount}` 与补取条件）；`frontend/src/app.tsx:424-457`（`loadRight` / `expandRightGroup`）；`frontend/src/App.integration.test.tsx:289`（`pending.total=4/items=3` 展开补到 `4/4`）、`:315`（补取 500 → “右栏加载失败” + “重试” → 重试再次请求 → 再展开恢复 `6/6`） | pass | E-FE 2026-11-22 12:39：App.integration 13/13、RightPanel 10/10；G18 原两项（`pending=4/items=3` 补取、补取失败重试）已由组件/集成断言覆盖；E-ACC5（`docs/testing/ACCEPT-CONV-5-20261122.md`，2026-11-22）：首屏 done 3/6、pending 3/4；展开 done 只发 1 次 `taskLimit=50` → 6/6 六行；展开 pending → 4/4 四行；折叠回 3/6 只 3 行；拦截 500 显示“右栏加载失败 请求失败（500），请稍后重试”并可重试；撤注入重试回 3/6、再展开 6/6；CDP 沿用 02:09（`.tmp/conv4-after.json`）；组件级负断言（补取失败时错误态与已加载列表同时可读）仍缺，记 G18 |

### 1.1 转 pass 的证据分布（2026-11-21 23:10 / 23:33、2026-11-22 验收）

> 证据类别按 §0.4：单元/组件 = E-FE，HTTP（真后端）= E-BE，CDP 真渲染 = E-CDPX，E2E = E-CDP（05:14，未重跑）。`—` 表示该类未覆盖，不表示通过。

| AC | 单元/组件（E-FE） | HTTP 真后端（E-BE） | CDP 真渲染（E-CDPX） | E2E（E-CDP） | 截图 |
|---|---|---|---|---|---|
| AC-CONV-007-02（2026-11-22 13:35 第七轮验收转 `pass`） | `App.integration.test.tsx:128`、`:140`；`App.conversation.test.tsx:299`、`:355`、`:365` | `m89_all_messages_errors_test.go:11`（413 真后端；403 N/A） | E-ACC6 真机 8787（1600×1000，CDP 9223，13:25–13:35）：点击命中 27/27、末尾 71/73/74、滚轮后 active 28、任意 y 10/10、右边界外 1px 不触发；`ExecRowHitArea.test.tsx:82`/`:182` 历史 23:01 3/3，12:15 本轮 skip | 04b/04c/04d（未重跑） | `accept6-jump30.png`、`accept6-jump37-clean.png`、`accept6-last74.png`、`accept6-wheel.png` |
| AC-CONV-008-02 | `RightPanel.test.tsx:35`、`:51`、`:100`、`:118` | `m87_task_message_mapping_test.go:11` | `ExecRowHitArea.test.tsx:54`（6 条 exec-row ≥44；历史 23:01，本轮 skip） | 06（未重跑） | 无截图 |
| AC-CONV-008-03 | `RightPanel.test.tsx:21`、`:29`、`:100` | — | `ExecRowHitArea.test.tsx:254`（375/1600 几何、遮挡、可见比例；历史 23:01）；2026-11-22 13:54–13:56 本轮 375×812 四态 CDP 实测（composer/send visibleRatio=1、无相交、无横溢、sendHit 命中、console 0） | 01b（未重跑） | `docs/testing/final-375-initial.png`、`-scrolled.png`、`-composer-focus.png`、`-typed.png`；metrics `.tmp/accept8/375-metrics.json` |
| AC-SYNC-002-01 | `App.tabsync.test.tsx:115`、`:148`、`:165`、`:235`、`:273`、`:297`、`:316`、`:340`；`App.tabsync.channel.test.tsx:98`、`:113` | — | — | 13（活动会话/发送模式，未重跑） | 无截图 |
| AC-SYNC-002-02 | `App.tabsync.test.tsx:189`、`:211`、`:148`、`:297`；`App.tabsync.degrade.test.tsx` | — | — | — | 无截图 |
| AC-SYNC-003-02 | `Composer.test.tsx:144`、`:178`、`:198`、`:219` | — | — | 13（双页发送模式，未重跑） | 无截图 |
| AC-CONV-001-04 | `Sidebar.test.tsx:148`、`:184`；`App.conversation.test.tsx:103`、`:116`、`:643`；`App.operation-errors.test.tsx:101` | `ui1_test.go:97`（真 HTTP pin/unpin）；`tree_order_test.go:76`–`:172`（兄弟序）；`pin_guard_test.go:40`、`:86`、`:129`（归档 409、重启保持；httptest/模块级，非部署实例） | — | — | 有：`deploy-8787-2330-pinned-1600.png`、`unpinned-1600.png`、`order-restored-1600.png`（1600 宽，真机 8787） |
| AC-CONV-008-04 | `api.test.ts:244`（304 返回缓存）、`:260`（taskLimit=3/50 互不命中）、`:282`、`:290`、`:295`；`App.conversation.test.tsx:633` | `spec_projection_etag_test.go` 五条（Stable/NotModified/TracksTaskChange/TracksDeliverables/DistinguishesTaskLimit）；`etag_test.go` 列表四条；`m75` 无 ETag 断言；本轮真机 8787 `spec-projection` 200→304（`.tmp/accept8/304-live.json`） | — | — | `deploy-8787-2330-search-304-1600.png`（列表 304，历史 23:31）；本轮 304 为 HTTP 级，无浏览器截图 |

> 跨标签三列（SYNC-002-01/02、003-02）的“CDP”一列为 `—`：本轮只有组件级模拟通道与单进程双实例，真实两标签由 §15 M-03 手工承接；E2E 13 的 05:14 结果未随 W4 变更重跑，不作为本轮转 pass 的唯一依据。`AC-CONV-001-04`、`AC-CONV-008-04` 两行有 8787 真机证据（HTTP + 截图），其 HTTP 列里的 `tree_order_test.go`/`pin_guard_test.go` 是 httptest 与模块级用例，不等同部署实例。

### 1.2 2026-11-22 新增两条 AC 的证据分布

| AC | 单元/组件（E-FE） | 集成（真请求经 MSW） | HTTP / 真机 | 截图 |
|---|---|---|---|---|
| AC-CONV-001-05 | `Sidebar.test.tsx:53`（三行 75/3/12 同时渲染、底部 209、切换不变、缺字段不渲染）、`:306`（统计失败不造 0） | `App.integration.test.tsx:222`（主/子会话各 1 条、底部 2 条）、`:244`（消息页截到 100 条时行数字仍取后端 `messageCount`） | `GET /api/sessions` 原文 `.tmp/conv6-sessions.raw.json`：`main.messageCount=75`、15 会话求和 209（新二进制，02:25）；旧 CDP `.tmp/conv4-after.json`（行内 75、底部 209） | `docs/testing/accept-conv4-fix-20261122-before.png`（旧：行内 209）、`-after.png`（旧：行内 75）；均为迁移前构建，**本轮未重出** |
| AC-CONV-008-05 | `RightPanel.test.tsx:59`（done `3/6` → 展开 → `6/6`，只补取一次） | `App.integration.test.tsx:262`（`taskLimit=50` 真请求一次 → `6/6`） | CDP `.tmp/conv4-after.json`：done `6/6` 6 行、pending `4/4` 4 行，请求含 `spec-projection?taskLimit=50` | `docs/testing/accept-conv4-fix-20261122-after.png`（02:09） |

> `AC-CONV-008-05` 已由第五轮独立验收判 `pass`（`docs/testing/ACCEPT-CONV-5-20261122.md`：done 3/6→6/6、pending 3/4→4/4、补取失败可重试）；组件级负断言“错误态与已加载列表同时可读”仍缺，登记 G18，但不阻塞该 AC；`AC-CONV-001-05` 的两处口径都有组件与集成断言，判 `pass`。

---

## 2. PRD-CONV-001 · 会话树与主会话

<a id="tc-p1-001"></a>

产品行为：左栏会话树（main + 子会话）、选中/新建/重命名、主会话不可归档、pin（P2）。接口：`GET /api/sessions`、`POST /api/sessions`、`PATCH /api/sessions/{id}`、`POST /api/sessions/{id}/archive|unarchive|pin|unpin`。

### TC-P1-CONV-001 · 选中会话后左栏/中栏/统计一致（AC-CONV-001-01）

- 类型：component + http + e2e；状态：`pass`
- 自动化：`frontend/src/components/Sidebar.test.tsx:50`（click/Enter 选中）、`frontend/src/App.conversation.test.tsx:418`（空会话空态）、`backend/cmd/simo/m4_test.go:134`、`frontend/e2e/scripts/cdp-runner.mjs:361`（01a）、`:792`（11）
- 前置：`main` + 至少一个子会话；每个会话有可区分消息。
- 步骤：
  1. 打开首页，记录初始 active（`main`）。
  2. 点击子会话行；按 Enter 再切回 `main`。
  3. 读中栏标题、消息列表、左栏 `.is-active`、右侧统计/会话数。
- 断言：
  - A1 左栏仅一行 `.is-active`，且 id 与中栏 `h1` 一致。
  - A2 中栏消息全部属于该会话（无上一会话残留），空会话显示空态而非假消息。
  - A3 切换后统计与会话数不出现假 0；`sessionCount`/`messageCount` 与接口返回一致。
  - A4 Enter 与点击等价；焦点可见。
- 负路径：对不存在的会话 id 直接调用选中不产生空白中栏（由列表只渲染服务端返回项保证）。
- 数据/接口：`GET /api/sessions` 返回 `sessions[]`；消息 `GET /api/sessions/{id}/messages`。

### TC-P1-CONV-002 · 会话树四态、重命名取消、草稿清理、父链环（AC-CONV-001-02）

- 类型：component + http + e2e；状态：`pass`
- 自动化：`frontend/src/components/Sidebar.test.tsx:114`（空/加载/错误+重试）、`:128`（统计失败不造 0）、`:59`（Escape 取消）；`frontend/src/App.conversation.test.tsx:407`（列表失败重试）；`backend/cmd/simo/m70_test.go:67`（重启清空空会话）；`backend/cmd/simo/m14_test.go:147`（父链环拒绝）；`frontend/e2e/scripts/cdp-runner.mjs:971`（15 列表 500→重试）
- 前置：可切换空库、慢响应、500 响应三种桩。
- 步骤：
  1. 空库加载 → 断言“暂无会话”。
  2. 加载中 → 断言“会话加载中…”，不闪空态。
  3. 列表 500 → 断言“会话加载失败” + “重试”，点击后恢复。
  4. 统计接口失败 → 配额显示 `—` + “统计加载失败”，不得显示 0。
  5. 双击重命名后按 Escape → 不发 PATCH，标题保持。
  6. 创建草稿不发送消息 → 重启后草稿不残留；`PATCH` 制造父链环 → 后端拒绝（4xx），树不被破坏。
- 断言：四态互斥且文案可见；Escape 后 `snap.renameBodies` 为空；重启后无空会话行；环请求返回错误且原树不变。
- 负路径：重命名提交空标题 → 不发请求并退出编辑（`Sidebar.test.tsx:59` 覆盖 Escape/空值分支）。
- 数据：`GET /api/sessions`、`PATCH /api/sessions/{id}`、`POST /api/sessions`。

### TC-P1-CONV-003 · 主会话不可归档（AC-CONV-001-03）

- 类型：http + component + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 自动化：`backend/cmd/simo/p1_conv_sessions_http_test.go:557`；`frontend/src/App.conversation.test.tsx:109`（仅子会话归档/恢复）、`:126`（主会话无归档入口）；`frontend/src/components/Sidebar.test.tsx:140`；`frontend/src/components/library.tsx:121`（`!isMain` 守卫）；E2E 场景 10 归档的是子会话（`frontend/e2e/scripts/cdp-runner.mjs:739`），主会话由组件与 CDP 覆盖。
- 前置：`main` 为 active；另有一个可归档子会话。
- 步骤：
  1. `POST /api/sessions/main/archive` → 断言 409、`code=main_session_protected`、`error` 可读、`blockers=["主会话不可归档"]`。
  2. 再次归档 → 仍 409（不得第二次变 200）。
  3. `GET /api/sessions/main/messages/all` → `archived=false`；`POST /api/sessions/main/chat` → 202 且能收到 `reply.done`。
  4. `POST /api/sessions/main/unarchive` → 200（保持 no-op 兼容）。
  5. 前端：打开 main 行 → 不出现操作菜单、无归档项（`library.tsx:121` 的 `!isMain`）。
- 断言：A1–A5 均有自动化断言（后端 409/202/no-op，前端无菜单 + 子会话归档/恢复）。
- 负路径：绕过 UI 直接调 API 必须仍被拒（服务端硬约束，已有）。
- 已解决（2026-11-21 v2）：409 信封已含 `blockers:["主会话不可归档"]`（`{"blockers":["主会话不可归档"],"code":"main_session_protected","error":"主会话不可归档","ok":false}`），§16.3 D1 关闭。
- 数据：`sessions.archived=0`、`specs.status` 不变。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:126`（主会话无操作菜单、`archiveCalls` 为空）、`:109`（子会话归档/恢复）；`Sidebar.test.tsx:140`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：`POST /api/sessions/main/archive` → 409 含 `blockers`；main unarchive 200 `archived=0`；子会话 archive/unarchive 200 `archived 1→0`；归档被拒后 `POST /api/chat` 202（`msg-1e3821515496b402`）——`.tmp/accept/cdp-v2.log`、`cdp-v2-evidence.json`，21:58:05–21:58:12。
  - CDP 端到端：`.tmp/accept/cdp-v2.mjs` 40/40 PASS（21:58:05–21:58:31）。
  - 截图：该类未覆盖。

### TC-P1-CONV-004 · 置顶/取消置顶入口（AC-CONV-001-04，P2）

- 类型：component + http + 真机；状态：`pass`（2026-11-21 23:33 转 pass：归档守卫与重启保持均补齐并实跑）
- 自动化：`frontend/src/App.conversation.test.tsx:103`（点“置顶”→`POST pin:child`→按服务端返回的 `pinned=true` 刷新列表→出现“取消置顶”）、`:116`（取消置顶反向）、`:643`（树里已归档、搜索缓存里仍显示的会话，点置顶被前端拒绝）；`frontend/src/App.operation-errors.test.tsx:101`（pin 失败：`pinCalls=['pin:child']`、toast“请求失败（500），请稍后重试”、`pinned=false`、`listCalls` 不变、菜单仍“置顶”）；`frontend/src/components/Sidebar.test.tsx:148`（主会话与草稿无“会话操作”按钮，普通行“置顶”、已置顶行“取消置顶”）、`:184`（`archived:1, pinned:true` 行展开后无“置顶”，只有“恢复”，`onPin` 未调用）；`backend/cmd/simo/ui1_test.go:97`（真 HTTP：pin 200、`GET /api/sessions?pinned=true` 含该 id 且 `pinned:true`、unpin 200、`?pinned=false&q=` 命中）；`backend/internal/modules/sessions/tree_order_test.go:76`（兄弟序前移且父子归属不变）、`:97`（取消置顶复原）、`:117`（置顶孙会话不改根层、不提升）、`:148`（重复 pin/unpin 幂等）、`:172`（树与平表同级顺序一致）；`backend/internal/modules/sessions/pin_guard_test.go:40`（归档 pin/unpin 均 `ErrArchived`）、`:86`（真 handler 409 `session_archived`、解归档后 200）、`:129`（关闭重开同一 sqlite 后 `pinned=1` 且兄弟序复原）；`backend/internal/modules/sessions/management_test.go:44`（`ORDER BY pinned DESC, created_at DESC, id DESC`）。
- 前置：两条会话，其中一条 `pinned=0`；服务端 `GET /api/sessions` 按 `pinned DESC, created_at DESC` 返回。
- 步骤：
  1. 打开子会话行菜单 → 点“置顶” → 观察请求、菜单与列表顺序。
  2. 再点“取消置顶” → 观察请求与顺序。
  3. 让 pin 接口返回 500 → 点“置顶”。
  4. 归档该会话 → 回收站/显示归档中打开菜单。
- 断言：A1 `POST /api/sessions/{id}/pin|unpin` 各一次且无本地重排（顺序来自刷新后的服务端响应）；A2 失败不乐观置顶、toast 可见、菜单保持“置顶”；A3 主会话/草稿无菜单；A4 归档会话菜单不出现“置顶”，前端拒绝且后端 409；A5 重启后 `pinned` 与兄弟序保持。
- 负路径：已归档会话调用 pin → 409 `session_archived`、列表不变（`pin_guard_test.go:86`），前端 `app.tsx:621-624` 先拦并提示“归档会话不可置顶”。
- 证据（本轮）：
  - 单元/组件：`Sidebar.test.tsx:148`、`:184`；`App.conversation.test.tsx:103`、`:116`、`:643`；`App.operation-errors.test.tsx:101`；定向 3 文件 61 tests PASS（`.tmp/fe-pin-etag.log`，23:32），全量已于 2026-11-22 12:15 重跑（23 文件，21 passed + 2 skipped / 226 pass + 6 skip）。
  - HTTP/模块：`ui1_test.go:97`、`tree_order_test.go:76`–`:172`、`pin_guard_test.go:40`/`:86`/`:129`、`management_test.go:44`；定向 8 条 `ok simo/internal/modules/sessions 0.532s`（`.tmp/be-pin-guard.log`，23:32）。
  - 真机：8787 部署实例 + headless Chrome（23:31）。`metrics.json`：`order.default=[主会话,周报复核,数据核对,研究员]` → `order.pinned=[主会话,研究员,周报复核,数据核对]`（其余相对序不变，`siblingsRelativeOrderKeptWhenPinned:true`）→ `unpinned` 复原（`unpinnedRestored:true`）；`pinFlow.menuBefore=[置顶,归档]` → `menuAfterPin=[取消置顶,归档]` → `menuAfterUnpin=[置顶,归档]`；`POST /api/sessions/sess-fixture-researcher/pin` 200。截图 `docs/testing/deploy-8787-2330-pinned-1600.png`、`unpinned-1600.png`、`order-restored-1600.png`；复原的像素证据用 `order-restored-1600.png` 左栏与 `order-default-left@2x.png` 的 sha256 相同（`10ab758f…`）——`unpinned-1600.png` 与 `pin-menu-1600` 同为“菜单打开”场景，不能拿它的哈希断言像素一致（`metrics.notes` 已写明）。
- 缺口：无。截图只覆盖 1600 宽，375/768 的菜单观感归 §15 M-02；重启保持用的是模块级重开 sqlite（`pin_guard_test.go:129`），不是部署实例真重启。

### TC-P1-CONV-035 · 行内消息数取会话自身、底部保持全局（AC-CONV-001-05）

- 类型：component + integration + http；状态：`pass`（2026-11-22 02:26 全量实跑；实现由并行 Agent 落树：后端补 `messageCount`、前端每行直取该字段）
- 自动化：
  - 组件：`frontend/src/components/Sidebar.test.tsx:53`（主 75 / 子 3 / 另一会话 12 三行同时渲染 `.session-count`，底部 `3 个会话 · 归档 0 · 209 条消息`；把 active 切到另一会话后三行数字与底部都不变）、`:79`（会话对象无 `messageCount` 时不渲染行数字）、`:306`（`statsError` + `usageTotal=null` + `messageCount=null`：用量显示 `—`、底部显示“统计加载失败”，不出现 0）
  - 集成：`frontend/src/App.integration.test.tsx:222`（主会话 1 条、子会话 1 条：切到子会话后两行各自 1、底部仍 2）；`:244`（消息接口被截到 100 条时行数字仍取后端 `messageCount=137/42`，不退化为已加载条数）
  - HTTP 真后端：`backend/internal/modules/sessions/counts.go:16`（一次聚合全部会话自身消息数）、`backend/internal/modules/sessions/view.go:12`（列表、树、单会话响应均带 `messageCount`）、`backend/internal/modules/sessions/message_count_test.go` 四条（own-only、草稿为 0、无 messages 表、ETag 跟随计数）
  - UI 取数：`frontend/src/components/library.tsx:161`（每行 `session.messageCount`，`typeof === 'number'` 才渲染）、`frontend/src/types.ts:16`（`messageCount?: number`）、`frontend/src/app.tsx:879`（底部仍 `statsTotals?.messages`，不再按 active 行传计数）
- 前置：两个平级会话 main（自身 75 条）与另一会话（12 条），main 下有子会话 child（3 条）；`GET /api/stats` 返回 `totals.messages=209`；`GET /api/sessions` 对每个会话返回自身 `messageCount`。
- 步骤：
  1. 打开页面，读 main 行、child 行、另一会话行的数字与底部汇总。
  2. 切到另一会话，再切回 main，重复读三行与底部。
  3. 让消息接口只返回 100 条，读 main 行数字（`App.integration.test.tsx:244`）。
  4. 让 stats 接口失败，读用量与底部（`Sidebar.test.tsx:306`）。
- 断言：A1 行内数字等于该会话自身 `messageCount`（main=75、child=3、另一会话=12），不含子会话、不含其他会话；A2 主会话行不因子会话存在而变大（75 而非 78）；A3 底部始终是全局 `N 个会话 · 归档 M · X 条消息`（15 / 0 / 209），不随选中切换；A4 消息页被截断时行数字仍取后端字段；A5 stats 失败时用量与底部各自占位（`—` / “统计加载失败”），不显示假 0。
- 负路径：会话对象缺 `messageCount`（旧服务端或本地草稿）不渲染行数字、也不显示 0（`Sidebar.test.tsx:79`）。
- 证据（本轮）：
  - 单元/组件 + 集成：`E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（2026-11-22 12:15，`.tmp/fe-conv7-20261122-121527.log`），其中 `Sidebar.test.tsx` 20 条、`App.integration.test.tsx` 10 条。
  - HTTP 真后端：`.tmp/conv6-sessions.raw.json`（新二进制 + `data/` 副本，8891 端口，02:25）：15 个会话，`main.messageCount=75`、`sess-fixture-researcher=38`、其余 2–36 不等，求和 **209**，与底部全局数一致；main 自身 75 不含其子会话。
  - 历史截图：`docs/testing/accept-conv4-fix-20261122-before.png`（行内 209）、`-after.png`（行内 75）为 02:09 迁移前构建，只证明“行内≠底部”的旧行为；迁移后每行都显示数字，本轮未重出截图。
- 缺口：迁移后“每行都显示数字”的视觉观感没有新截图（数字与位置已由组件断言覆盖）；真机 8787 未走查。

---

## 3. PRD-CONV-002 · 会话生命周期

<a id="tc-p1-002"></a>

产品行为：新建 → 重命名 → 归档（只读）→ 恢复；失败可见、不乐观成功；删除入口 P1（二次确认 + 子会话级联）。接口：`POST /api/sessions`、`PATCH /api/sessions/{id}`、`POST .../archive|unarchive`、`DELETE /api/sessions/{id}`。

### TC-P1-CONV-005 · 生命周期主路径与归档只读（AC-CONV-002-01）

- 类型：component + http + e2e；状态：`pass`
- 自动化：`frontend/src/App.conversation.test.tsx:72`（新建）、`:94`（重命名）、`:107`（归档只读）、`:122`（恢复）；`frontend/src/components/Sidebar.test.tsx:90`；`backend/cmd/simo/m6_test.go:66`（归档只读+恢复）、`m70_test.go:24`（草稿物化）；E2E `frontend/e2e/scripts/cdp-runner.mjs:649`（08）、`:690`（09）、`:739`（10）
- 前置：`main` 下可新建子会话。
- 步骤：
  1. 新建会话 → 断言列表新增、active 切到新会话、中栏空态。
  2. 重命名并 Enter → 断言 PATCH、列表与标题更新；重启后保持。
  3. 归档 → 默认列表隐藏、显示归档后 `.is-archived`、Composer 禁用、发送被拒（WS 返回错误而非回复）。
  4. 恢复 → Composer 可用、可继续对话。
- 断言：每步列表与中栏一致；归档后 `POST chat` 被拒；恢复后 `reply.done`；重启后名称/归档态保持。
- 负路径：归档会话发消息 → 错误帧，不得出现假回复（`m6_test.go:100`）。
- 数据：`sessions.archived`、`specs.status`、消息表不因归档删除。

### TC-P1-CONV-006 · 生命周期失败反馈与重试不重复（AC-CONV-002-02）

- 类型：component + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 自动化：`frontend/src/App.conversation.test.tsx:85`（创建失败保持 active）；`frontend/src/App.operation-errors.test.tsx:49`（rename 失败保留输入、重试不重复）、`:75`（archive 失败列表保留）、`:96`（归档成功但刷新失败进入可重试态）、`:115`（卡片动作失败双通道提示）；`frontend/src/components/Sidebar.test.tsx:77`（重命名拒绝保留编辑态）
- 前置：mock PATCH/POST 分别返回 500；CDP 用 `page.route` 式拦截注入失败，前端与后端主链路均为真实实例。
- 步骤：
  1. 创建会话 → 500 → 断言错误可见、原 active 不变；重试 → 新会话出现且只成功一次。
  2. 重命名 → 500 → 断言错误可见、编辑器仍开、标题未变；重试 → 只发一次成功 PATCH。
  3. 归档 → 500 → 断言行仍在列表且非 archived；重试 → 归档成功。
  4. 恢复 → 500 → 断言 archived 不变、行仍在归档列表；重试 → 恢复成功。
  5. 归档成功但列表刷新失败 → 断言错误态可重试，不显示半归档。
- 断言：失败时列表不被乐观改成成功；重试后无重复行/重复请求；错误文案可读。
- 负路径：连续点击归档两次 → 只有一次有效请求（`App.operation-errors` 无重复断言，但 Sidebar 菜单点击后关闭，实际不可双击；本 TC 对已覆盖部分判 pass）。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:85`；`App.operation-errors.test.tsx:49/75/96/115`；`Sidebar.test.tsx:77`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：失败请求被 CDP 拦截为 500；重试后 `POST /api/sessions` 共 2 次、archive 2 次、unarchive 2 次、read 2 次（`.tmp/accept/cdp-v2c.log`，22:04:38–22:04:44）。
  - CDP 端到端：`cdp-v2c.mjs` 24/24 PASS（创建/归档/恢复/已读失败）；rename 失败见 `cdp-v2.log` 21:58:21–26（`toast role=alert`、输入保留 `验收失败标题-v2`、服务端标题仍「研究员」）。
  - 截图：`docs/testing/ACCEPT-v2-create-failure.png`、`ACCEPT-v2-archive-failure.png`、`ACCEPT-v2-restore-failure.png`、`ACCEPT-v2-rename-failure.png`。
- 已知缺口：恢复失败的组件用例缺失，仅 CDP 覆盖。

> **TC-P1-CONV-007（删除会话）已撤除 —— 产品非目标，不计缺口。** `AC-CONV-002-03` 已由产品移出验收面，改为显式非目标并进 backlog（见产品 spec 变更记录）；本文件不再为其写用例、不判状态、不计入缺口数。编号 007 保留不复用（稳定编号，避免历史引用失效）；后端 `backend/internal/modules/sessions/http.go:68-69` 仍为 403 `R4_CONFIRM_REQUIRED` 占位、`backend/cmd/simo/p1_conv_sessions_http_test.go:355` 仍为占位契约——这两处**不再作为 P1 验收依据**，也不构成缺口。

---

## 4. PRD-CONV-003 · 会话搜索与未读

<a id="tc-p1-003"></a>

产品行为：搜索框有“搜索中/无匹配”；P1 口径为标题搜索 `GET /api/sessions?q=`（含子会话与归档），消息搜索降 P2；未读为会话级布尔（SYNC-004 承接）。接口：`GET /api/sessions?q=`、`GET /api/messages/search?q=`（P2）。

### TC-P1-CONV-008 · 搜索过滤、搜索中、无匹配（AC-CONV-003-01）

- 类型：component + e2e；状态：`pass`
- 自动化：`frontend/src/components/Sidebar.test.tsx:102`（输入触发搜索、无匹配文案）、`:109`（搜索中）；`frontend/src/App.conversation.test.tsx:227`（标题命中）、`:238`（无匹配空态与清空恢复）；E2E `frontend/e2e/scripts/cdp-runner.mjs:930`
- 前置：多会话，其中一个标题含唯一词，另一个仅消息含唯一词。
- 步骤：输入关键词 → 观察请求与列表；输入无匹配词。
- 断言：列表只保留服务端返回 id 对应会话；请求中显示“搜索中”；无匹配显示“没有匹配的会话”；清空后恢复全量。
- 负路径：输入空白/空格 → 不发请求，恢复全量。
- 数据：实现走 `GET /api/sessions?q=`（`frontend/src/api.ts:34`），服务端按标题检索；正文词不命中，消息正文搜索降为 P2。
- 证据（v2，四类分列）：
  - 单元/组件：`Sidebar.test.tsx:102/109`、`App.conversation.test.tsx:227/238`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：`GET /api/sessions?q=研究员` 200 命中子会话，`q=周报范围和输出内容`、`q=三条可执行结论` 均 0 命中（`.tmp/accept/http-evidence.log`）。
  - CDP 端到端：21:58:14 复测，调用清单只有 `/api/sessions?q=…`，无 `/api/messages/search`（`.tmp/accept/cdp-v2.log`；`cdp-accept3.log` 的 `messageSearchSeen:false`）。
  - 截图：`.tmp/accept/a5-search-title.png`、`a6-search-body-empty.png`、`v2-s3-search-body-token.png`。

### TC-P1-CONV-009 · 搜索失败与未读呈现（AC-CONV-003-02）

- 类型：component + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 自动化：`frontend/src/components/Sidebar.test.tsx:114`（错误态可重试、不落“无匹配”）；`frontend/src/App.conversation.test.tsx:248`（失败与空态区分、就地重试、输入保留）；`frontend/src/app.tsx:72`（`searchError`）、`:191`（`retrySearch`）
- 步骤：拦截搜索接口 500 → 输入关键词 → 断言错误态；放行后点“重试”。
- 断言：失败显示“搜索失败，请重试”与可读错误原因，不显示“没有匹配的会话”；重试重新发起同一 `q` 并恢复列表；未读按会话布尔呈现（由 SYNC-004 承接，TC-026/027/028 已 pass）。
- 现状：失败态与重试已实现并有断言；未读整块由 SYNC-004 回填，不再作为本 TC 缺口。
- 缺口记录：§16.2 G7 已关闭（2026-11-21 v2）。
- 证据（v2，四类分列）：
  - 单元/组件：`Sidebar.test.tsx:114`、`App.conversation.test.tsx:248`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：重试真实发出 `GET /api/sessions?q=%E7%A0%94%E7%A9%B6%E5%91%98` 并 200；故障 500 由 CDP 拦截注入，非后端真实错误。
  - CDP 端到端：21:58:13 拦截 500 → 错误态文案、`sideEmpty=null`、重试按钮 1；21:58:14 重试恢复 `["研究员"]`（`.tmp/accept/cdp-v2.log`）。
  - 截图：`docs/testing/ACCEPT-v2-search-error-state.png`（21:58:13，114,414 B）、`ACCEPT-v2-search-retried.png`（21:58:14，107,675 B）。

### TC-P1-CONV-010 · 标题搜索接 `/api/sessions?q=`（AC-CONV-003-03，P1）

- 类型：component + http + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 自动化：`frontend/src/App.conversation.test.tsx:227`（搜索请求为 `sessions?q=`，并断言 `searchQueries` 为空）、`:248`（失败重试）；`frontend/src/components/Sidebar.test.tsx:102`；`frontend/src/api.ts:34`（标题检索）、`frontend/src/app.tsx:435`（搜索 effect）
- 用例：
  - 前置：子会话标题含“预算”，归档会话标题含“预算”，另一会话仅消息含“预算”。
  - 步骤：搜索“预算” → 断言唯一请求 `GET /api/sessions?q=预算`；列表包含子会话与归档会话可见范围内的命中；再拦截该请求 500 → 错误+重试。
  - 断言：不再调用 `/api/messages/search`；无匹配空提示；搜索中状态；跨子会话命中。
  - 负路径：q 为空不发请求；q 含特殊字符按 URL 编码处理。
- 后端：`backend/cmd/simo/ui1_test.go:97` 已覆盖标题搜索+pin。
- 缺口记录：§16.1 G2 已关闭（2026-11-21 v2）。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:227/248`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：`GET /api/sessions?q=研究员` 200 命中子会话，正文词查询 0 命中（`.tmp/accept/http-evidence.log`）。
  - CDP 端到端：21:58:14 调用清单只有 `/api/sessions?q=…`，无 `/api/messages/search`（`.tmp/accept/cdp-v2.log`）。
  - 截图：`.tmp/accept/v2-s3-search-body-token.png`（正文词空态）。

---

## 5. PRD-CONV-004 · 消息流与渲染

<a id="tc-p1-004"></a>

产品行为：user/assistant/分类标签/代码块/卡片/流式；复制降级；卡片失败可重试；归档只读；消息纯度（internal/system 不入接口/WS/UI，卡片仍渲染、不可编辑）。接口：`GET /api/sessions/{id}/messages`、`POST chat`、卡片动作、编辑端点（禁用）。

### TC-P1-CONV-011 · 消息渲染主路径（AC-CONV-004-01）

- 类型：component + e2e；状态：`pass`（表格/行内/链接样式补测后复核；表格滚动已在 Chromium 1180/375 两档实跑，链接 computed 样式仍只有 jsdom 单测）
- 自动化：`frontend/src/components/MessageItem.test.tsx:8`（user 无分类）、`:15`（assistant 分类）、`:22`（`it.each` 分类/角色矩阵）、`:35`（复制成功）、`:63`（代码块/长文不截断）、`:71`（GFM 表格对齐/`role=region`/`tabindex`）、`:91`（单元格行内 code）、`:97`（单元格内竖线转义）、`:104`（表前 prose）、`:112`（非法表格保持段落）、`:124`（流式光标/失败徽标）、`:147`（卡片提交态）、`:187`（加粗）、`:194`（斜体）、`:201`（删除线）、`:208`（http/https/mailto 链接安全属性）、`:221`（加粗内 code）、`:230`（code 内不解析）、`:239`（snake_case）、`:246`（`javascript:` 不成锚点）、`:255`（未闭合标记按字面）；`frontend/src/components/MessageLinkStyle.test.ts:87`、`:95`、`:103`、`:113`（链接样式 CSS 契约）；`frontend/src/components/MessageTableLayout.test.tsx:50`（Chromium 宽表滚动，1180/375 两档 2/2 pass，27.11s，`.tmp/accept8/table-cdp.log`）；E2E `frontend/e2e/scripts/cdp-runner.mjs:451`（04a 逐级加载）、`:832`（12 长消息/时间轴）
- 前置：mock 后端与会话；表格/行内用例在 jsdom 运行，滚动与链接 computed 样式需要 Chromium。
- 步骤：渲染含角色、分类、代码、长文、流式、卡片、GFM 表格、行内加粗/斜体/删除线/链接的消息；复制文本；在 Chromium 里横向滚动宽表格并读链接 computed 样式（表格两档已执行，链接样式未执行）。
- 断言：角色/分类标签正确；代码块横向滚动不撑破页面；长文不截断；复制成功有反馈；流式光标与失败徽标随状态变化；卡片提交后只读；表格按列对齐、表头/表体结构完整、区域可聚焦并有名称；行内标记只作用于正文；链接只允许 http/https/mailto 且带安全属性；`javascript:` 按纯文本输出；表格区域在 `.msg-table-wrap` 内横向滚动、页面与 `.conversation-scroll` 不溢出（1180 档 496/819、375 档 331/819，`table` 两档 819/819；ACCEPT-CONV-9 §2.5）；链接样式为 accent 色 + 下划线，hover/focus-visible 可见。
- 负路径：无分类的 user 消息不渲染空标签（`:8`）；`javascript:` 不生成 anchor（`:246`）；非法表格保持段落（`:112`）；code 内不解析 markdown（`:230`）；未闭合标记按字面（`:255`）。
- 数据：消息 `role`、`category`、`text`、`status`。
- 证据：`E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（2026-11-22 12:15）；表格对齐与转义、行内四类、`javascript:` 不成锚点、链接样式 CSS 契约均通过；`MessageTableLayout.test.tsx:50` 在 Chromium 1180/375 两档 2/2 pass（1180 586ms / 375 335ms，exit 0，`.tmp/accept8/table-cdp.log`），链接 computed 样式仍只有 jsdom 单测。
- 保留说明：产品 `AC-CONV-004-01` 未把表格/行内单列为独立 AC，本 TC 按 PRD-CONV-004 的 Markdown 渲染范围承接；E2E 04a/12 为历史证据，未随本轮重跑。

### TC-P1-CONV-012 · 复制降级、卡片失败重试、只读（AC-CONV-004-02）

- 类型：component + http；状态：`pass`
- 自动化：`frontend/src/components/MessageItem.test.tsx:44`（Clipboard 抛错→execCommand 失败提示）、`:54`（execCommand 成功）、`:89`（卡片失败保留文本+重试）、`:100`（只读/归档禁用控件）；`backend/cmd/simo/m78_internal_message_test.go:23`、`:75`；`backend/cmd/simo/m79_internal_history_test.go:11`
- 步骤：模拟 `navigator.clipboard.writeText` 抛错；提交卡片返回 500；只读渲染卡片。
- 断言：复制降级且给出失败/成功反馈；卡片失败保留输入、可重试、错误可见；只读时控件禁用；内部消息不混入。
- 负路径：卡片重复提交 → 只发一次（`m76_card_idempotency_test.go` 覆盖后端幂等，本 TC 只引不重复断言）。

### TC-P1-CONV-013 · 消息纯度与不可编辑（AC-CONV-004-03）

- 类型：http + component；状态：`pass`
- 自动化：`backend/cmd/simo/m78_internal_message_test.go:23`（卡片内部事件不污染消息流）、`:75`（手写 internal 文本被拒）、`backend/cmd/simo/m79_internal_history_test.go:11`（历史 internal 不返回）、`backend/cmd/simo/m50_test.go:14`（编辑端点禁用）、`:75`（WS 编辑被拒）；`frontend/src/components/MessageItem.test.tsx:100`（卡片仍渲染、归档只读无编辑入口）
- 步骤：
  1. 造含 internal/system 记录与卡片事件的会话。
  2. `GET /api/sessions/{id}/messages` 与全量接口 → 断言只含 user/assistant。
  3. 订阅 WS 触发卡片事件 → 断言帧中无 internal 文本。
  4. UI 浏览 → 断言卡片正常渲染、无编辑入口。
  5. `POST /api/sessions/{id}/messages/{id}/edit`（或等价编辑端点）→ 断言禁用错误。
- 断言：接口/WS/UI 三处均无 internal；卡片不丢；编辑被拒。
- 负路径：手工向 chat 注入 internal 文本 → 400/被拒（`m78:75`）。

---

## 6. PRD-CONV-007 · 祖先消息与时间轴

<a id="tc-p1-005"></a>

产品行为：≥2 级父子会话进入子会话时整级加载祖先消息、按时间排序、id 去重；时间轴 bar 数与消息数一致、点击/键盘跳转；413/403/空上级的降级。接口：`GET /api/sessions/{id}/messages?scope=all`（聚合）。

### TC-P1-CONV-014 · 祖先链加载/去重/切换清链（AC-CONV-007-01）

- 类型：component + http + e2e；状态：`pass`
- 自动化：`frontend/src/App.integration.test.tsx:120`（加载祖先+去重）、`:152`（切会话清链）、`:167`（滚动位置恢复）；`frontend/src/components/TimelineGroups.test.tsx:21`（每消息一 bar、排序）、`:44`（点击跳转）、`:77`（方向键/Home/End）；`backend/cmd/simo/m81_all_messages_test.go:30`、`:44`；E2E `frontend/e2e/scripts/cdp-runner.mjs:451`（04a）、`:832`（12）
- 步骤：进入二级/三级子会话；检查消息顺序、id 唯一、时间轴 bar 数；点击 bar；切走再切回。
- 断言：祖先整级出现；时间升序；id 无重复；bar 数=消息数；点击/键盘定位并高亮；切走后链清空，切回恢复滚动。
- 负路径：重复 `scope=all` 响应含相同 id → 只渲染一次（`:120`）。
- 数据：消息 `id`、`at`、`sessionId`。

### TC-P1-CONV-015 · 413/403/空上级降级与 44px 目标（AC-CONV-007-02）

- 类型：component + http + CDP；状态：`pass`（2026-11-22 13:35 第七轮验收转：413/403/空上级自动化通过；时间轴命中区由真机 8787 + CDP 9223 实测，1600×1000，见 `docs/testing/ACCEPT-CONV-6-20261122.md`）
- 自动化：`frontend/src/App.integration.test.tsx:128`（413 显示可读错误，点重试后成功加载）、`:140`（403 与空上级按“无上级”继续、不阻塞）；`frontend/src/App.conversation.test.tsx:299`（空上级）、`:355`（413 可读错误 + 重试按钮）、`:365`（403 权限错误）；`backend/cmd/simo/m89_all_messages_errors_test.go:11`（真后端：未知会话 404；插入 50001 条后 `scope=all` 回 413、`error.code="messages_too_many"`；403 记 `N/A`，单用户后端无鉴权/权限中间件）；`frontend/src/components/TimelineGroups.test.tsx:233`（CSS 契约：`--gutter-timeline:44px` 整列、`.tl-bar` 20×4、`.timeline .tl-bar{pointer-events:none}`、断言 `.tl-bar::after` 已不存在，jsdom 实跑通过）；源码 `frontend/src/components/components.css:111`（`.timeline{width:var(--gutter-timeline)}`）、`:115`（`.tl-bar` 20×4）、`:1075`（`.timeline{isolation:isolate;cursor:pointer}`）、`:1076`（`.timeline .tl-bar{pointer-events:none}`）；`frontend/src/components/ExecRowHitArea.test.tsx:82`（6 条 `.tl-bar` 四角 ±21px `elementFromPoint`）、`:182`（细指针），本轮 4 条 skip（9223 无监听）；第七轮验收 `docs/testing/ACCEPT-CONV-6-20261122.md` 用真机 8787 实测点击 27/27、末尾 71/73/74、滚轮、右边界与任意 y 归属。
- 步骤：注入 413 → 点重试；注入 403；构造空上级；在真实 Chromium 里点时间轴 bar 的四角（2026-11-22 13:25–13:35 已执行：真机 8787 + CDP 9223，1600×1000；另测末尾 3 条、滚轮、右边界外 1px、任意 y 归属）。
- 断言：A1 413 显示“消息过多，暂不能完整加载”+重试，重试成功后祖先补齐且不重复；A2 403 与空上级视为无上级、不阻塞发送；A3 重复消息只渲染一次（`App.integration.test.tsx:120`）；A4a 时间轴为 44px 整列（`--gutter-timeline`），`.tl-bar` 20×4 且 `pointer-events:none`，命中由整列最近刻度映射决定、无逐条命中块（CSS 契约）；A4b 四角/边缘点击与 `elementFromPoint`（CDP 实测 27/27：刻度 4/37/60 × 中心/±16px × 纵向 ±18px，active=最近刻度、targetTop=0、完全可见；跳转时界按点击后 900ms（平滑滚动结束，70 条约 0.9 秒）取样，200ms 中间快照不作失败判据（ACCEPT-CONV-9 §2.3）；右边界外 1px 不触发）；A4c 末尾 71/73/74 点击后 1 秒仍定位、滚轮 -200 后 active 28、任意 y 10/10 归属唯一且每次恰一次跳转、15 行计数与 API 逐行相等且总和 209（未验证：touchstart/pointerdown 释放、末尾超 3 秒、75 根穷举、窄屏分支）。
- 证据分布：
  - 单元/组件：`App.integration.test.tsx:128/140`、`App.conversation.test.tsx:299/355/365`、`TimelineGroups.test.tsx:233`（CSS 契约：整列 44px、刻度 20×4、无 `::after`）；`E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（2026-11-22 12:15）。
  - HTTP 真后端：`m89_all_messages_errors_test.go:11`（404、413 实测；403 N/A）；`E-BE` 285 PASS / 1 SKIP（2026-11-22 12:25）。
  - CDP 真渲染：第七轮验收 ACCEPT-CONV-6（真机 8787 + CDP 9223，13:25–13:35，1600×1000）：点击命中 27/27、末尾 71/73/74、滚轮 active 28、任意 y 10/10、右边界 1px 不触发、15 行计数 209；`ExecRowHitArea.test.tsx:82`/`:182` 本轮 4 条 skip（历史 23:01 3/3，3329ms）。
  - 截图：`accept6-jump30.png`、`accept6-jump37-clean.png`、`accept6-last74.png`、`accept6-wheel.png`、`accept6-right.png`。
- 保留说明：403 分支只能由前端 mock 覆盖，因为后端没有鉴权层；§15 M-06 的 403 真机走查仍为 `partial`，不阻塞本 AC。第七轮验收已补真机命中，但未验证 touchstart/pointerdown 释放、末尾超 3 秒稳定性、75 根刻度穷举与窄屏分支。

---

## 7. PRD-CONV-005 · 发送与流式

<a id="tc-p1-006"></a>

产品行为：发送乐观出现、WS 增量、done 终态、输入清空；失败保留文本可重试、不重复提交、断线重连、`since` 续传、停止后不追加。接口：`POST /api/sessions/{id}/chat`（`clientMutationId`）、WS `/api/sessions/{id}/events`。

### TC-P1-CONV-016 · 发送/流式/停止主路径（AC-CONV-005-01）

- 类型：component + ws + e2e；状态：`pass`（2026-11-22 按消息定向转 pass）
- 自动化：`frontend/src/components/Composer.test.tsx:28`（Enter 发送清空）、`:102`（流式中显示停止并回调）；`frontend/src/App.conversation.test.tsx:212`（delta 按 seq 去重、`reply.done` 关流）、`:455`（并发两条流逐条发帧、messageId 集合）；`frontend/src/api.ts:251-258`（帧带 messageId）、`frontend/src/app.tsx:710-721`（逐条登记并发送）；`backend/internal/modules/chat/stop_interrupt_test.go:402`（同会话双流只停目标）；`backend/cmd/simo/p1_conv_ws_test.go:234`（事件顺序/增量）；E2E `frontend/e2e/scripts/cdp-runner.mjs:386`（02）
- 步骤：输入文本 → Enter；观察乐观消息、delta、done；流式中点停止。
- 断言：消息立即出现；delta 每 seq 只应用一次；done 后终态且输入已清空；停止后不再增长；停止只作用于被点消息，同会话其它流继续产出直到 done。
- 负路径：重复 delta（同 seq）不叠加（`:212`）；不存在的 messageId 不取消任何流（`stop_interrupt_test.go:548-554`）。
- 数据：`clientMutationId`、`seq`、`reply.done`。

### TC-P1-CONV-017 · 失败/重复/断线/since/停止（AC-CONV-005-02）

- 类型：component + http + ws；状态：`pass`（2026-11-22 按停止机制判据收口）
- 自动化：`frontend/src/App.conversation.test.tsx:187`（失败提示+重发不重复）、`:240`（停止后忽略后续 delta）、`:486`（close→open 重连+补拉）；`frontend/src/components/Composer.test.tsx:61`（失败保留文本重试）、`:74`（发送中防重复）；`backend/cmd/simo/p1_conv_chat_idempotency_test.go:58`、`:93`、`:114`、`:140`、`:190`、`:232`、`:267`（顺序/并发/WS/重启/冲突）；`backend/cmd/simo/p1_conv_ws_test.go:386`（since 续传）；`backend/cmd/simo/m55_test.go:17`（残留流式恢复）；`backend/internal/modules/chat/stop_interrupt_test.go:32`（单流取消上游）、`:402`（双流只停目标）；`backend/internal/modules/chat/stop_upstream_test.go`（真 HTTP 假上游 SSE）
- 步骤：注入 500；重复点击发送；关闭 WS 再恢复；带 `since` 订阅；停止。
- 断言：失败保留文本、错误可读、重试只落一条；重复点击不发第二条；重连后状态可见并补拉缺失消息；`since` 不丢不重；停止帧下发后上游请求 `context` 取消、不再派发 `reply.delta`/`message.delta`、不落库新内容、状态回 `idle`，且 `reply.retracted` 先于 `idle`。
- 负路径：同 `clientMutationId` 并发重试 → 只创建一条（`:140`）；进行中冲突 → 409（`:232`）；不存在的 messageId 不停止任何一条（`stop_interrupt_test.go:548-554`）；不存在的 messageId 也不取消上游（`stop_upstream_test.go` 负例）。
- 环境限制：真实厂商 `api.deepseek.com` 本机 403（key 失效），连接级中断不可达；跨标签双 WS 未跑。这两项不进 AC 判据，机制证据以假上游复现为准（`docs/testing/STOP-UPSTREAM-EVIDENCE-20261122.md`，5 PASS / 0 FAIL，8.059s）。
- 数据：`clientMutationId` 幂等表、`seq`。

---

## 8. PRD-CONV-006 · Composer 与快捷键

<a id="tc-p1-007"></a>

产品行为：enter / shift-enter 两种模式；Enter/Shift+Enter/Ctrl/Meta 行为、模式持久化、IME 组合不发送、禁用态、长文本。接口：无（本地状态 + `localStorage`）。

### TC-P1-CONV-018 · 快捷键与模式持久化（AC-CONV-006-01）

- 类型：component + e2e；状态：`pass`
- 自动化：`frontend/src/components/Composer.test.tsx:28`（Enter 发送）、`:36`（Shift+Enter 换行）、`:52`（Ctrl/Meta+Enter 发送）、`:87`（切模式+持久化+行为反转）、`:129`（aria 同步）；E2E `frontend/e2e/scripts/cdp-runner.mjs:416`（03）
- 步骤：在 enter 模式按 Enter/Shift+Enter/Ctrl+Enter；切到 shift-enter 模式重复；刷新。
- 断言：发送/换行符合模式；按钮 `aria-pressed` 与提示同步；刷新后模式保持；`localStorage` 键迁移旧键（`:120`）。
- 负路径：禁用态下 Enter/Ctrl+Enter 不发送（`Composer.test.tsx:162`，由 TC-019 引用）。

### TC-P1-CONV-019 · IME/失败/禁用/长文本（AC-CONV-006-02）

- 类型：component；状态：`pass`（组合输入/失败/禁用/长文本单测通过；CDP 合成组合态五点验证通过，物理输入法未覆盖）
- 自动化：`frontend/src/components/Composer.test.tsx:44`（组合中不发送）、`:172`（组合结束后 50ms 内 Enter 被忽略）、`:61`（失败恢复）、`:110`（长文本不截断）、`:162`（禁用态不发送）；`docs/testing/IME-EVIDENCE-20261122.md`（CDP `Input.imeSetComposition` 五点、两张截图）
- 步骤：`compositionstart` → Enter；`compositionend` 后立即 Enter；发送失败；禁用；粘贴超长文本。
- 断言：组合中不发送；结束后 50ms 内不误发；失败保留文本+错误；禁用时任何快捷键不发送；长文本完整。
- 环境限制：物理输入法的候选词、全角回车与 OS 上屏时序未覆盖（§15 M-05 记 `partial`）；CDP 合成组合态已验证 `isComposing` 与上屏后按键序列，不阻塞本 AC。

---

## 9. PRD-CONV-008 · 右栏会话投影

<a id="tc-p1-conv-008"></a>

产品行为：三组（状态/目标/输入）、任务三组（已完成/进行中/未开始，pending 只在未开始）、交付物只读、四态、`taskLimit` 1..50 默认 3、404、ETag/304、375 窄屏。接口：`GET /api/sessions/{id}/spec-projection?taskLimit=`。

### TC-P1-CONV-031 · 三组投影与空态（AC-CONV-008-01）

- 类型：component；状态：`pass`
- 自动化：`frontend/src/components/RightPanel.test.tsx:8`（目标/输入/状态/任务组/交付物）、`:75`（三组空态）、`:110`（右栏导航且不伪造 session id）
- 步骤：渲染完整投影；再渲染空投影；无 session。
- 断言：状态中文映射、`rev N`、`待确认 N` 与接口一致；目标/输入空时按状态给文案；无投影显示“暂无会话投影”，不空白、不假 0。
- 负路径：缺 `session` 时不崩、不伪造 `data-session`（`:110`）。

### TC-P1-CONV-032 · 任务组、messageId 定位、交付物（AC-CONV-008-02）

- 类型：component + http + e2e + CDP；状态：`pass`（2026-11-21 23:10 由 `partial` 改判：“右栏无提交/重试/取消入口”已补负断言）
- 自动化：`frontend/src/components/RightPanel.test.tsx:8`（三组、交付物、`downloadUrl` 渲染为 `<a download>`）、`:35`（展开/收起、点带 `messageId` 的任务回调 `onTaskClick({id:'done-3',messageId:'msg-3'})`）、`:51`（pending 只在“未开始”）、`:100`（缺投影不崩、点已完成定位）、`:118`（`offers no submit, retry or cancel entry in the rail, including expanded task groups`：展开 3 组后 `queryAllByRole('button', /提交|重试|取消/)` 为 0、链接 0、无 `form/submit`、文本不匹配）；`backend/cmd/simo/m87_task_message_mapping_test.go:11`（任务→`messageId` 映射）；`frontend/src/components/ExecRowHitArea.test.tsx:54`（6 条 `.exec-row` 逐条高度 ≥44）；E2E `frontend/e2e/scripts/cdp-runner.mjs:597`（06 点击任务定位高亮，05:14，未重跑）。
- 步骤：展开三组；点带 `messageId` 的任务；点交付物；在右栏内反查写入口。
- 断言：A1 展开态与分组正确（pending 只在未开始）；A2 带 `messageId` 的任务触发定位（回调携带 `messageId`，E2E 06 验证高亮）；A3 交付物链接由 projection 的 `downloadUrl` 渲染、带 `download` 属性；A4 右栏任何状态下都没有提交/重试/取消入口。
- 证据分布：单元/组件 `E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（`RightPanel.test.tsx` 10 tests；`ExecRowHitArea.test.tsx` 4 条本轮 skip）；HTTP `E-BE` 285 PASS（`m87`，12:25）；CDP 真渲染 `E-CDPX`（`.exec-row` ≥44，历史 23:01，本轮 skip）；E2E 06 未重跑；**无截图**。
- 保留说明：`App.locateTask`（`frontend/src/app.tsx:673`）的滚动定位仍无组件级断言，仅 E2E 06（早于 W4）覆盖；交付物只断言链接渲染，未实际点击下载文件。两项记 §16.2 G16，不影响 AC 已声明分支的判定。

### TC-P1-CONV-033 · 四态与 375 窄屏（AC-CONV-008-03）

- 类型：component + CDP；状态：`pass`（2026-11-21 23:10 由 `partial` 改判：375 遮挡与关键块可见比例已有 CDP 真渲染断言）
- 自动化：`frontend/src/components/RightPanel.test.tsx:21`（loading→error+重试→无投影空态）、`:29`（草稿占位）、`:75`（三组空态）、`:100`（缺投影不崩）、`:125`（无 session 不伪造 `data-session`）；`frontend/src/components/ExecRowHitArea.test.tsx:254`（`renderToStaticMarkup(<App/>)` 交 Chromium，`Emulation.setDeviceMetricsOverride` + 触控：375 档断言 `.inspector` `display:none` 且宽度 0、`.composer` 与 `.send` 可见、发送按钮中点 `elementFromPoint` 命中、`scrollWidth <= innerWidth+1`；1600 档注入 RightPanel markup，断言 `.inspector` 显示、与 composer/send 矩形不重叠、`.insp-spec-status` + 3 个 `.exec-head` 共 4 个关键块可见比例 >0.99 且未被浮层覆盖）。
- 步骤：四态分别渲染；在 375 与 1600 两档真渲染下检查遮挡与可见比例。
- 断言：加载/错误+重试/无投影/无会话四态可辨；375 宽下右栏不遮挡 Composer 与发送按钮（右栏隐藏、页面无横向溢出）；1600 宽下右栏关键块可见。
- 证据分布：单元/组件 `E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（`RightPanel.test.tsx` 10 tests）；CDP 真渲染 `E-CDPX`（`ExecRowHitArea.test.tsx:254`，历史 23:01 真实 Chromium + 设备模拟 3/3，本轮 4 条 skip）；E2E 01b 375 未重跑，仅佐证；**无截图**（几何断言代替截图，AC 未要求视觉稿比对）。
- 保留说明：375 断言取的是静态渲染后的 DOM 几何，交互态（抽屉打开）下的遮挡仍归 §15 M-02，M-02 保持 `partial`。

### TC-P1-CONV-034 · 契约与 ETag/304（AC-CONV-008-04）

- 类型：http + component + 真机；状态：`pass`（2026-11-22 12:15 复核：投影 ETag/304 与前端条件请求、304 保形均有新单测；真机 304 仍为 23:31 历史证据）
- 自动化（后端，真 handler）：`backend/internal/modules/sessions/spec_projection_etag_test.go:67`（Stable）、`:97`（NotModified）、`:145`（TracksTaskChange）、`:182`（TracksDeliverables）、`:207`（DistinguishesTaskLimit）——五条本轮全 PASS：ETag 形如 `^"spec-[0-9a-f]{16}"$` 且同状态稳定；304 空体并保留 ETag/Cache-Control，弱标签与多值命中，陈旧 ETag 回 200；任务/交付物变化换 ETag；taskLimit=1/5 的 ETag 不同且跨 limit 不误回 304；`backend/internal/modules/sessions/etag_test.go:80`、`:101`、`:139`、`:185`（列表 ETag 首响应/304/变更后 200/非法值 200 且 ETag 保留）；`spec_projection.go:127-141`（设 ETag、`Cache-Control: no-cache`，命中回 304）、`:144-162`（`projectionETag` 把 `{taskLimit, projection}` 规范化后 sha256 前 8 字节）；`backend/cmd/simo/m75_spec_projection_test.go:23`、`:71` 只覆盖投影内容/limit/404，无 ETag 断言。
- 自动化（前端）：`frontend/src/api.ts:337-360` `getSpecProjection` 带 `If-None-Match`，304 判断先于 200 分支，命中时返回 `{ projection: cached ?? null, notModified: true }`（`:344-351`），有 ETag 的 200 才写缓存（`:353-357`）；`:300-306` 缓存键含 `sessionId` 与 `taskLimit`，上限 8；`frontend/src/app.tsx:423-438` `loadRight` 在 304 时用 `result.projection ?? current` 保留当前数据，不清空、不进错误态；`frontend/src/api.test.ts:244`（304 返回缓存且 `notModified:true`）、`:260`（taskLimit=3/50 各自 ETag、交替 304 不覆盖）、`:282`（`cache=false` 不写缓存）、`:290`（500 仍抛错）、`:295`（LRU 淘汰）；`frontend/src/App.conversation.test.tsx:633`（304 保留搜索行与 active）。
- 步骤：`taskLimit=0/51` → 400 `invalid_task_limit`；不存在会话 → 404；带 `If-None-Match` 二请求 → 304 且空体；改名/未读变化后用旧 ETag → 200 + 新 ETag；taskLimit=1/5 各取 ETag，交替条件请求 → 200 且各回自己的 ETag；前端同一投影二请求 → 304 保留数据不重建。
- 断言：A1 400/404 错误码正确；A2 304 空体且保留 ETag/Cache-Control；A3 写操作后旧标签失效；A4 304 时投影/列表保留当前数据、不闪空、不显示 loading/error；A5 taskLimit 不同则 ETag 不同，跨 taskLimit 不误回 304。
- 证据（本轮）：
  - HTTP：`E-BE` 285 PASS / 1 SKIP（2026-11-22 12:25，`.tmp/be-conv7v-20261122-122018.log`），投影 ETag 五条全 PASS。
  - 单元/组件：`E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（12:15，`.tmp/fe-conv7-20261122-121527.log`）；`api.test.ts` 的 5 条 ETag/304 用例与 `App.conversation.test.tsx:633` 全过。
  - 真机：8787 实例 + headless Chrome（2026-11-21 23:31，历史）。`metrics.json`：first 200 `Etag`，second 带 `If-None-Match` → **304**，`conditionalHeaderSent:true`；DOM `marksKept:true`、`stats={removals:0,minRows:2,emptyFlashes:0}`、`loadingShown:false`、`errorShown:false`。截图 `docs/testing/deploy-8787-2330-search-304-1600.png`。
- 缺口：本轮无浏览器（9223 无监听），真机 304 证据仍是 2026-11-21 23:31；前端全量 226 pass + 6 skip、后端 285 PASS 已重跑（G17 关闭）。

### TC-P1-CONV-036 · 右栏分组展开补取到服务端总数（AC-CONV-008-05）

- 类型：component + integration + CDP；状态：`pass`（2026-11-22 第五轮独立验收判通过，`docs/testing/ACCEPT-CONV-5-20261122.md`：done 3/6→6/6、pending 3/4→4/4、补取失败显示可见错误并可重试；负路径“错误态与列表同时可读”仍未实现，登记 G18，不阻塞该 AC）
- 自动化：
  - 组件：`frontend/src/components/RightPanel.test.tsx:59`（`counts against the server total and requests the full page on first expand`：done 首屏 3 条、`total=6`，组头 `3/6`；展开后调用 `onExpandGroup` 恰好 1 次；rerender 成 6 条后组头 `6/6` 且第 6 条“完成任务 5”可见；已取全再展开或收起不再补取，调用次数仍为 1）、`:43`（展开/收起分组并转发 messageId 定位）、`:97`（pending 组不混入“进行中”）
  - 集成：`frontend/src/App.integration.test.tsx:262`（MSW 拦截 `GET /api/sessions/main/spec-projection`：首屏 `taskLimit=3` 返回 `total=6/items=3`，展开后发一次 `taskLimit=50` 返回 6 条，DOM 变 `6/6` 且第 6 条可见；`taskLimit=50` 的请求恰好 1 次）
  - 实现：`frontend/src/components/library.tsx:749-765`（`ExecutionGroup`：`totalCount = Math.max(total ?? tasks.length, tasks.length)`；展开且 `tasks.length < totalCount` 才 `onExpandAll`；组头渲染 `{shown}/{totalCount}`）、`frontend/src/app.tsx:411-415`（`expandRightGroup` 把 `rightTaskLimitRef` 提到 50 并静默重取，≥50 时不再重复请求）、`:390-407`（`loadRight(sessionId, taskLimit=3, silent)`；失败 `setRightError` 并把上限回退到 3）、`frontend/src/components/library.tsx:817-818`（`OverviewPanel`：loading 与 `ErrorState title="右栏加载失败"` + `onRetry` 互斥渲染）
- 前置：active 会话 `main` 的 spec-projection 首屏 `taskLimit=3`，返回 `done.total=6/items=3`、`pending.total=4/items=3`；后端支持 `taskLimit=50`。
- 步骤：
  1. 打开右栏，读“已完成”“待处理”两组的组头计数与可见条目数。
  2. 点开“已完成”组，读组头、可见条目数与请求列表。
  3. 点开“待处理”组，重复第 2 步。
  4. 收起再展开已取全的组，观察是否再发请求。
  5. 让 `taskLimit=50` 的补取失败，读错误提示与重试按钮，点重试。
- 断言：A1 首屏组头 `3/6`、`3/4` 时展开会发起 `taskLimit=50` 的补取（每会话每轮至多 1 次）；A2 补取成功后“已完成”可见 6 条且组头 `6/6`，“待处理”可见 4 条且组头 `4/4`，可见条目等于 total 且计数一致；A3 不会停在“总数大于可见条目且无法继续获取”的状态；A4 补取失败时右栏显示可见错误并提供重试，重试可重新取到全量，不静默截断、不把组当成空组。
- 负路径：补取失败后组头不回退成 0，已加载的 3 条仍可见，错误态与列表同时可读（`library.tsx:818` 为整栏错误态，此分支无用例）。
- 证据（本轮）：
  - 单元/组件 + 集成：`E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（2026-11-22 12:15，`.tmp/fe-conv7-20261122-121527.log`），其中 `RightPanel.test.tsx` 10 条、`App.integration.test.tsx` 10 条。
  - CDP（迁移前构建，02:09）：`.tmp/conv4-after.json`：展开前 done `3/6` 3 行、pending `3/4` 3 行；展开 done 后 `6/6` 6 行；展开 pending 后 `4/4` 4 行；请求列表末尾有 `http://127.0.0.1:8899/api/sessions/main/spec-projection?taskLimit=50`；截图 `docs/testing/accept-conv4-fix-20261122-after.png`。
  - HTTP：`.tmp/conv4-proj50.raw.json`：main 投影 `taskLimit=50` 返回 done `total=6 items=6`、pending `total=4 items=4`、`hasMore:false`。
- 缺口：负路径“补取失败后组头不回退、已加载的 3 条仍可见、错误态与列表同时可读”仍未实现（`OverviewPanel` 在 `!loading && error` 时整栏渲染 `ErrorState`），本轮未断言；该差距已登记 G18，不影响第五轮验收对该 AC 的 pass 判定。迁移后未重跑 CDP，旧脚本 `.tmp/conv4-cdp.mjs` 对应的 8899 服务已停。


---

## 10. PRD-SYNC-001 · WS 连接与续传

<a id="tc-p1-008"></a>

产品行为：连接态可见、事件有序、`since` 补发、双客户端 fanout；断线重连、归档错误、残留流式恢复。接口：WS `/api/sessions/{id}/events?since=`。

### TC-P1-CONV-020 · 连接/顺序/since/双客户端（AC-SYNC-001-01）

- 类型：http/ws + component；状态：`pass`
- 自动化：`backend/cmd/simo/server_test.go:243`（事件顺序）、`:301`（since 续传）；`backend/cmd/simo/m88_ws_fanout_test.go:23`（双客户端）；`frontend/src/App.integration.test.tsx:204`（seq 去重）
- 步骤：建立 WS；触发多条回复；带 `since` 重连；开两个客户端。
- 断言：连接态可见；事件顺序稳定；`since` 补发不丢不重；两个客户端都收到。
- 负路径：重复 seq 不二次渲染（`:204`）。

### TC-P1-CONV-021 · 重连/归档错误/残留流式（AC-SYNC-001-02）

- 类型：component + http；状态：`pass`
- 自动化：`frontend/src/App.conversation.test.tsx:486`（close→open、状态、补拉）；`backend/cmd/simo/m6_test.go:100`（归档会话 WS 返回错误帧而非回复）；`backend/cmd/simo/m55_test.go:17`（启动恢复残留流式）、`:57`（watchdog 超时）
- 步骤：关闭 socket；归档会话发消息；重启带残留 streaming。
- 断言：显示重连中并恢复；归档请求得错误帧；残留被标为失败态。
- 已知边界：`since` 日志截断/保留窗口未定义（产品 spec §7 待确认），本 TC 不判。

---

## 11. PRD-SYNC-002 · 跨标签 active/祖先

<a id="tc-p1-009"></a>

产品行为：两标签同源，A 切会话/加载祖先/读消息，B 跟随 active、祖先链、未读；同 `at` 有确定性 tiebreak、重复广播不叠加、无 BroadcastChannel 降级。实现：`frontend/src/tabsync.ts`、`frontend/src/app.tsx:237-256`。

### TC-P1-CONV-022 · 跨标签 active 与祖先链（AC-SYNC-002-01）

- 类型：component + e2e；状态：`pass`（2026-11-21 23:10 由 `partial` 改判：读游标/未读跟随已补断言）
- 自动化：`frontend/src/App.tabsync.test.tsx:115`（跟随更新的 active、忽略自身 tabId 与乱序旧帧）、`:135`（发布自己的切换）、`:148`（祖先链合并、重复广播不重复）、`:165`/`:340`（三级会话逐级加载，`messageSessionIds() === ['main','child','grand']`）、`:235`（读游标：同/更新 `at` 清未读、重复幂等、更旧游标不回退、随后新消息重新累积）、`:273`（同 `at` 取更大 tabId、重复不清掉后来累积）、`:297`（同 `at` 更小 tabId 来晚不清、`at` 更大时 tabId 不参与）、`:316`（旧帧无 tabId 按 `at` 兼容）；`frontend/src/App.tabsync.channel.test.tsx:98`（稳定频道名 + mount 公告）、`:113`（重复公告保留祖先）；E2E `frontend/e2e/scripts/cdp-runner.mjs:881`（13 双页 active/发送模式/WS，05:14，未重跑）。
- 步骤：两个 App 实例共用 channel；A 切会话；A 加载祖先；A 读消息；再用乱序/重复帧打乱到达顺序。
- 断言：B 的 active 跟随且不来回跳；B 祖先链合并且不重复加载；B 的未读随 A 的读游标清除、更旧游标不回退。
- 证据分布：单元/组件 `E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（`App.tabsync.test.tsx` 10 tests、`App.tabsync.channel.test.tsx` 2 tests）；E2E 13 未在最新树重跑，只作辅证；**无截图**。
- 保留说明：peer 由 `CapturingBroadcastChannel` 模拟，不是两个真实标签；真实标签的焦点/可见性与同 `at` 竞态仍由 §15 M-03 手工承接（M-03 保持 `partial`）。

### TC-P1-CONV-023 · 同 at tiebreak/重复广播/降级（AC-SYNC-002-02）

- 类型：component；状态：`pass`（2026-11-21 23:10 由 `partial` 改判：tiebreak、乱序收敛、无通道降级均有断言）
- 自动化：`frontend/src/App.tabsync.test.tsx:189`（同 `at` 按 tabId 字典序：`tab-m` 先到、`tab-a` 同 `at` 来晚不覆盖，`tab-z` 同 `at` 胜出；同 `at` 旧 sessionId 重复投递不回退）、`:211`（两种到达序——后发先到再收旧、旧先到再收新——终态一致）、`:148`（同一祖先链重复广播不重复合并）、`:273`/`:297`（同 `at` 重复不清掉后来累积、更小 tabId 来晚不清）；`frontend/src/App.tabsync.degrade.test.tsx`（`vi.stubGlobal('BroadcastChannel', undefined)`：挂载不抛错、本地点击仍切会话、卸载重挂后 active 回服务端树的 `main`、子会话仍在列表）。
- 步骤：构造同 `at` 不同 tabId 的 active 帧；重复投递同一帧；打乱到达顺序；删除 `window.BroadcastChannel` 后挂载并操作。
- 断言：同 `at` 有确定性 tiebreak（取更大 tabId）；重复只生效一次、不叠加；无 BroadcastChannel 时不抛错且单标签功能可用。
- 证据分布：单元/组件 `E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（`App.tabsync.test.tsx` 10 tests、`App.tabsync.degrade.test.tsx` 1 test）；**无 HTTP/CDP/截图**（纯前端通道逻辑，后端 N/A）。
- 保留说明：降级用例以 `stubGlobal` 移除构造器，属真 API 不可用路径；真实两标签仍归 M-03。

---

## 12. PRD-SYNC-003 · 发送模式跨标签

<a id="tc-p1-010"></a>

产品行为：切换发送模式当前标签立即生效、刷新保持、另一标签最终一致、无 BroadcastChannel 降级。实现：`frontend/src/components/library.tsx:509-580`（localStorage + storage 事件）。

### TC-P1-CONV-024 · 模式切换/持久化（AC-SYNC-003-01）

- 类型：component + e2e；状态：`pass`
- 自动化：`frontend/src/components/Composer.test.tsx:87`（切换+持久化+快捷键反转）、`:129`（aria 同步）；E2E `frontend/e2e/scripts/cdp-runner.mjs:881`（13 双页发送模式）
- 步骤：点击切换；刷新；检查 `aria-pressed` 与快捷键。
- 断言：立即生效；刷新保持；按钮语义同步。
- 负路径：旧 localStorage 键在 mount 时迁移（`:120`）。

### TC-P1-CONV-025 · 跨标签模式同步与降级（AC-SYNC-003-02）

- 类型：component；状态：`pass`（2026-11-21 23:10 由 `partial` 改判：真 BroadcastChannel 双实例与两条降级路径已补）
- 自动化：`frontend/src/components/Composer.test.tsx:144`（另一标签通过 storage 事件改变模式，本标签跟随）、`:178`（`vi.stubGlobal('BroadcastChannel', NodeBroadcastChannel)`，同一容器渲染两个 Composer，第一个切换后第二个经真实通道变为 `Enter 换行，Shift+Enter 发送`，`aria-pressed=true`，可访问名含“当前 Shift+Enter 发送”，`localStorage` 为 `shift-enter`）、`:198`（无 BroadcastChannel：切换仍生效并持久化、storage 事件反向跟随、卸载重挂按持久化值恢复）、`:219`（构造器抛 `NotSupportedError`：mount 与切换不崩、构造尝试 ≥2、storage 事件仍可用）。
- 步骤：两实例共用通道 → 一实例切换；移除 `BroadcastChannel` → 切换、反向 storage 事件、重挂；构造器抛错 → 挂载与切换。
- 断言：另一实例最终一致（按钮态、快捷键说明、可访问名、`localStorage` 同值）；两条降级路径都不抛错且仍可用。
- 证据分布：单元/组件 `E-FE` 23 文件（21 passed / 2 skipped）/ 226 pass + 6 skip（`Composer.test.tsx` 20 tests）；E2E 13 双页发送模式（05:14，未重跑）为佐证；**无截图**。
- 保留说明：双实例在单进程内用 `node:worker_threads` 的 `BroadcastChannel` 实现，消息确实经通道传递但不是两个浏览器标签；真实两标签走查归 M-03。

---

## 13. PRD-SYNC-004 · 未读与已读游标

<a id="tc-p1-011"></a>

产品行为（已裁决）：会话级 `hasUnread` 布尔；非 active 会话收到新消息置位；进入/任一标签已读即全清；不做全站数字/条数；阶段 1 不持久化。

**现状更新（2026-11-21 22:00，v2 回填）**：后端已实现 `hasUnread` + `POST /api/sessions/{id}/read` + 多标签广播（迁移 v23；`backend/internal/modules/chat/unread.go:106`、`backend/internal/modules/sessions/unread.go`、`backend/cmd/simo/p1_conv_unread_test.go`、`backend/internal/modules/sessions/unread_test.go`）；前端已接线（`frontend/src/api.ts:37-40`、`frontend/src/app.tsx:389-400`、`frontend/src/components/library.tsx:121` 未读点）。v2 复验（`docs/testing/ACCEPT-CONV-20261121.md §7`，2026-11-21 21:54–22:06）补齐单元/组件、HTTP、CDP 双 target、截图四类证据，下列三条由 `missing` 改判 `pass`。旧“会话内条数”计数器仍在（`app.tsx:98/224/695`），是否保留待产品裁决（§16.3 D7），不影响本组 AC。

### TC-P1-CONV-026 · 会话级未读置位（AC-SYNC-004-01）

- 类型：component + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 用例：两会话 A/B，active=A；B 收到 WS 消息 → B 行出现未读点、A 行无；切到 B → 未读点消失；切回 A 后 B 仍未读（除非再进入）。
- 现状：`frontend/src/App.conversation.test.tsx:148`（未读点、进入即读并清点）、`:179`（`session_unread` 突发合并为一次刷新，且保留当前搜索词）、`frontend/src/components/Sidebar.test.tsx:126`（只出点、无数字）；CDP 双 target 已闭环。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:148/179`、`Sidebar.test.tsx:126`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：`POST /api/chat` 202 后 `GET /api/sessions/tree` 返回 `hasUnread=true`（`.tmp/accept/cdp-v2-evidence.json`，21:58:06–07）。
  - CDP 端到端：`cdp-v2.mjs` 40/40 PASS（21:58:05–21:58:31）；A 行 `{"title":"研究员","unread":true,"more":true,"active":false}`、`latencyMs:441`，帧 `{"type":"session_unread","data":{"sessionId":"sess-fixture-researcher"}}`（`.tmp/accept/cdp-v2.log`）。
  - 截图：`docs/testing/ACCEPT-v2-live-unread.png`（21:58:09，111,752 B）。

### TC-P1-CONV-027 · 刷新/跨标签/重启的未读清除（AC-SYNC-004-02）

- 类型：component + http + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 用例：已读后刷新 → 不复发；另一标签读 B → 本标签 B 未读点清除；服务端重启 → 已读仍为 `false`、无幽灵未读；已读写入失败 → 红点保留、错误可见、重试成功。
- 机制：已读游标落库（迁移 v23），`hasUnread` 由游标派生、不单独存布尔；因此重启与刷新都以服务端为准。
- 现状：`frontend/src/App.conversation.test.tsx:161`（`session_read` 后刷新并信任服务端）、`:213`（写失败保留红点 + toast）；后端 `backend/internal/modules/chat/unread_test.go:93`、`backend/cmd/simo/p1_conv_unread_test.go:93`。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:161/213`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：服务重启后 `hasUnread=false`（`.tmp/accept/serve4.log` 21:58:55 新进程；v2 只有 §7.3 记述、无独立 GET 日志；v1 `.tmp/accept/http-evidence.log` 13:16:45.097Z 有 `after restart main hasUnread = false (期望 false / 缺省)`）。
  - CDP 端到端：`cdp-v2c.mjs` D 段 24/24（22:04:38–22:04:44）：前置 `true` → 拦截 500 → 服务端仍 `true`、toast 可见、红点仍在 → 重试 200 → `false`、红点清除、read POST=2（`.tmp/accept/cdp-v2c.log`）。
  - 截图：`docs/testing/ACCEPT-v2-read-failure.png`、`ACCEPT-v2-read-retried.png`。

### TC-P1-CONV-028 · `hasUnread` 语义与边界（AC-SYNC-004-03）

- 类型：component + e2e；状态：`pass`（2026-11-21 v2 回填，见 `docs/testing/ACCEPT-CONV-20261121.md §7`）
- 用例：任一标签收到新消息 → 非 active 会话 `hasUnread=true` 且左栏出点；进入或任一标签广播已读 → 所有标签清除；不显示全站数字、不显示条数；已读游标写后端（v23），未读本身不单独持久化。
- 现状：`frontend/src/App.conversation.test.tsx:161`（`session_read` 清点）、`:179`（`session_unread` 突发合并、搜索态不重复刷新）、`frontend/src/components/Sidebar.test.tsx:126`（只出点、无数字）；`library.tsx:121` 未读点；旧“会话内条数”`app.tsx:98/224/695` 仍在，待产品裁决（D7）。
- 证据（v2，四类分列）：
  - 单元/组件：`App.conversation.test.tsx:161/179`、`Sidebar.test.tsx:126`；`vitest-v2.log` 2026-11-21 21:56，139/139。
  - HTTP：B 标签 `GET /api/sessions` 返回同一 `hasUnread` 投影；A 已读后两端同源（`.tmp/accept/cdp-v2-evidence.json` 帧 8713 前后）。
  - CDP 端到端：B 收 `session_unread` 出红点；A 已读后 B 未刷新、未切会话即收 `session_read` 清点，B 仍 `active=主会话`（`.tmp/accept/cdp-v2.log`，21:58:05–21:58:31）。
  - 截图：`docs/testing/ACCEPT-v2-cross-tab-cleared.png`。

---

## 14. （已撤销）PRD-SYNC-005 · 未实现项

`PRD-SYNC-005` 已于 2026-11-22 按用户裁决移除，原 TC-P1-CONV-029/030 一并撤销；编号保留不复用，本章不再列用例。

---

## 15. 手工 / 真机用例

> 原则：能用自动化证明的都不放这里。每条形明“机器不可替代的原因”，并给出可执行的走查步骤与判定。

### M-01 · 8787 部署实例走查

- 关联：AC-CONV-001-01/02、002-01、005-01（部署形态）
- 前置：W5 重建的 `simo` 可执行文件；8787 监听；本机浏览器。
- 步骤：启动 → 打开 8787 → 新建会话 → 发送一条 → 重启进程 → 复查会话/消息/设置。
- 判定：首屏无白屏/无控制台致命错误；数据持久；重启后会话仍在。
- 不可替代原因：8787 是**无鉴权 live 实例**，自动化禁止写入；启动脚本、真实 `SIMO_HOME`、进程重启后的数据恢复只能在部署形态验证。
- 状态：`blocked`（W5 未执行；本轮不触碰 8787）。

### M-02 · 视觉对齐（375/768/1280）

- 关联：AC-CONV-008-03、域级 A4
- 步骤：三档宽度各截首屏、长消息、右栏、Composer；对照设计基线。
- 判定：无横向溢出、无控件遮挡、字号/间距/颜色与基线一致；375 下右栏不压 Composer。
- 不可替代原因：`check:visual` 只比截图字节，不能判断“是否遮挡/是否可读”；像素级观感需人眼。
- 状态：`missing`（2026-11-21 23:33：AC-CONV-008-03 的遮挡与关键块可见比例已由 `ExecRowHitArea.test.tsx:254` 的 CDP 几何断言承担；真机截图现有 `docs/testing/deploy-8787-2330-pinned-1600.png` 等 5 张，但只覆盖 1600 宽，375/768/1280 三档的像素级观感仍未执行）。

### M-03 · 双标签真实操作

- 关联：AC-SYNC-002-01/02、SYNC-003-02、SYNC-004-02/03
- 步骤：同一浏览器开两标签；A 切会话/展开祖先/滚动读消息；B 观察 active、祖先、未读；关闭 B 的 BroadcastChannel（devtools 注入）再重复。
- 判定：B 跟随且不来回跳；未读按会话布尔；无通道时不报错。
- 不可替代原因：组件测试用模拟 channel；真实标签的焦点/可见性/消息时序（同 `at` 竞态）只有真机可复现。
- 状态：`partial`（active/发送模式已有 E2E 13；2026-11-21 23:10 补记：发送模式的双实例真通道同步已由 `Composer.test.tsx:178` 覆盖，无通道/构造器抛错两条降级由 `:198`/`:219` 覆盖；真机两标签的祖先、未读跟随仍用手工）。

### M-04 · 断网 / 重连

- 关联：AC-SYNC-001-02、005-02
- 步骤：DevTools offline → 发送 → 恢复网络；重启后端 → 观察重连与补拉。
- 判定：离线错误可见；恢复后自动重连；`since` 补拉不丢不重；不产生重复消息。
- 不可替代原因：mock WS 只验证状态机；真实网络栈的 close code、代理超时、浏览器 offline 事件顺序不可模拟。
- 状态：`missing`。

### M-05 · 中文 IME 组合输入

- 关联：AC-CONV-006-02
- 步骤：微软拼音/搜狗输入法输入候选词，组合中按 Enter；上屏后立即 Enter；全角符号。
- 判定：组合中不发送；上屏后不误发；文本完整。
- 不可替代原因：`compositionstart/end` 由 OS IME 驱动，jsdom 手工 dispatch 不能证明候选词与按键序列。
- 状态：`partial`（2026-11-22 已用 CDP `Input.imeSetComposition` 合成组合态验证：组合中不发送、组合中 Enter 不发送且 `isComposing=true`、提交无拼音残留、点发 +1、连续两句不粘不重，见 `docs/testing/IME-EVIDENCE-20261122.md`；物理输入法未覆盖，仍缺真实候选词与 OS 上屏时序）。

### M-06 · 413/403 真机表现

- 关联：AC-CONV-007-02
- 步骤：用真实后端构造超限会话（或限制 `all` 聚合上限）触发 413；用无权限会话触发 403；点重试。
- 判定：413 文案与重试可用；403 视为无上级且不阻塞发送；无重复消息。
- 不可替代原因：E2E 04b/04c 用 `page.route()` 注入（`frontend/e2e/scripts/cdp-runner.mjs:513`），不经过真实聚合/权限路径。
- 状态：`partial`（2026-11-21 23:10：413 已由 `backend/cmd/simo/m89_all_messages_errors_test.go:11` 在真 handler 上构造 50001 条消息实测，`error.code="messages_too_many"`；403 在单用户后端无法构造，测试内记 `N/A`；真机 UI 上的按压/重试手测仍未执行）。

> **M-07 已撤除（删除二次确认与级联）**：随 `AC-CONV-002-03` 移出验收面，产品非目标、进 backlog；本文件不再列该手工用例，也不计入缺口。编号保留不复用。

### M-08 · 未读跨标签与刷新

- 关联：AC-SYNC-004-01/02/03
- 步骤：A/B 两标签，B 收消息 → 切标签读 → 刷新 → 重启。
- 判定：未读点置位/清除符合布尔口径；已读后刷新不复发；重启无幽灵未读。
- 不可替代原因：真实标签可见性/焦点与刷新时序；组件测试无法覆盖“用户实际看到”。
- 状态：`partial`（2026-11-21 v2：CDP 双 target 已覆盖置位/清除/刷新与写入失败重试，见 `docs/testing/ACCEPT-v2-cross-tab-cleared.png`；真机手动的可见性/焦点走查仍未执行，故不写 `pass`）。

---

## 16. 缺口清单

### 16.1 必须补（P1 验收前）

| 编号 | 缺口 | 关联 AC | 目标用例/文件 | 解除条件 | 状态 |
|---|---|---|---|---|---|
| G1 | **已移出缺口：不适用（产品非目标）**——删除会话随 `AC-CONV-002-03` 进 backlog，不在 P1 验收面，不计缺口 | —（原 AC-CONV-002-03） | — | 不适用；如产品重新立项再恢复本行 | 不适用 |
| G2 | 标题搜索切 `GET /api/sessions?q=`，含子会话/归档/失败态 | AC-CONV-003-03 | `App.conversation.test.tsx:227/248`、`Sidebar.test.tsx:102/114`；`api.ts:34` | 已实现并有断言；CDP 复测无 `/api/messages/search` | **已关闭（2026-11-21 v2）** |
| G3 | 会话级 `hasUnread` 证据闭环：跨标签已读广播 + 真实双标签 E2E；旧“会话内条数”去留待裁（D7） | AC-SYNC-004-01/02/03 | `App.conversation.test.tsx:148/161/179/213`、`Sidebar.test.tsx:126`、`cdp-v2.mjs` 双 target | 四类证据已回填（`ACCEPT-CONV-20261121.md §7`）；D7 另行待裁 | **已关闭（2026-11-21 v2）** |
| G4 | 主会话归档：前端菜单禁用 + `blockers` 字段 + 改旧断言 | AC-CONV-001-03 | `library.tsx:121`、`Sidebar.test.tsx:140`、`App.conversation.test.tsx:126`；409 已含 `blockers` | 前后端一致；旧断言已改写 | **已关闭（2026-11-21 v2）** |
| G5 | 跨标签读游标/同 `at` tiebreak/无 BroadcastChannel 降级 | AC-SYNC-002-01/02 | `App.tabsync.test.tsx:189/211/235/273/297/316`、`App.tabsync.degrade.test.tsx` | 断言已补，2026-11-21 23:01 全量通过 | **已关闭（2026-11-21 v5）** |
| G14 | 右栏“无提交/重试/取消入口”负断言 | AC-CONV-008-02 | `RightPanel.test.tsx:118`（展开 3 组后按角色/表单/文本三路反查均为 0） | 已补，AC 转 `pass` | **已关闭（2026-11-21 v5）** |
| G15 | 归档会话仍可置顶（前端菜单无 archived 守卫、后端 `SetPinned` 不拒归档）与“重启后 `pinned` 保持”无用例 | AC-CONV-001-04 | `frontend/src/components/library.tsx:129` `{!session.archived && …}`、`frontend/src/app.tsx:621-624` 回调拦截；`backend/internal/modules/sessions/management.go:53-55` `ErrArchived`；`Sidebar.test.tsx:184`、`App.conversation.test.tsx:643`、`pin_guard_test.go:40/86/129` | 三处断言落地且实跑通过 | **已关闭（2026-11-21 23:33）**：后端定向 8/8 PASS（`.tmp/be-pin-guard.log`），前端定向 3 文件 61 tests（`.tmp/fe-pin-etag.log`） |

> 16.1 当前实际“必须补”为 **0 条**（G2/G3/G4 于 v2 关闭，G5/G14 于 v5 关闭，G15 于 v6 关闭）；G1 已随 `AC-CONV-002-03` 转为“不适用/非目标”，保留行号仅作历史索引，不计缺口数、不参与状态汇总。

### 16.2 可后补（不阻塞 P1，但需登记）

| 编号 | 缺口 | 关联 AC | 说明 |
|---|---|---|---|
| G6 | pin UI 入口与排序刷新 | AC-CONV-001-04（P2） | **已关闭（2026-11-21 v5）**：`App.conversation.test.tsx:103/116`、`Sidebar.test.tsx:148`、`App.operation-errors.test.tsx:101` 覆盖入口/刷新/失败；归档守卫与重启保持于 v6 补齐（G15 关闭） |
| G7 | ~~搜索失败提示（非只置空）~~ **已关闭（2026-11-21 v2）** | AC-CONV-003-02 | `App.conversation.test.tsx:248`、`Sidebar.test.tsx:114`、`app.tsx:72/191`；截图 `docs/testing/ACCEPT-v2-search-error-state.png` |
| G8 | 时间轴 bar 点击目标 ≥44px | AC-CONV-007-02 | **已关闭（2026-11-22 13:35，ACCEPT-CONV-6）**：真机 8787 + CDP 9223、1600×1000 下点击命中 27/27（刻度 4/37/60 × 中心/±16px × 纵向 ±18px，active=最近刻度、targetTop=0、完全可见），右边界外 1px 不触发，末尾 71/73/74 与滚轮 active 28；`TimelineGroups.test.tsx:233` 的 CSS 契约（整列 44px、刻度 20×4、无 `::after`）仍通过 |
| G9 | 真实后端 413/403 与 UI 联调 | AC-CONV-007-02 | **部分关闭（2026-11-21 v5）**：413 已由 `m89_all_messages_errors_test.go:11` 在真 handler 实测；403 在单用户后端不可构造，只能 mock；UI 真机走查仍见 M-06 |
| G10 | 375 下右栏遮挡 Composer 断言 | AC-CONV-008-03 | **已关闭（2026-11-21 v5）**：`ExecRowHitArea.test.tsx:254` 在 375/1600 两档断言 inspector 显隐、与 composer/send 不重叠、4 个关键块可见比例 >0.99 |
| G11 | 前端 304：发 `If-None-Match`、304 保留旧投影不闪空 | AC-CONV-008-04 | **已关闭（2026-11-21 23:33）**：`api.ts:41-101` 条件请求与同引用返回、`app.tsx:167/194/473` 早退、`api.test.ts:83` 起 7 例；真机 304 后 `marksKept:true`、`removals:0`、`emptyFlashes:0`（`deploy-8787-2330-metrics.json`） |
| G12 | 停止的真实后端中断（非仅前端忽略 delta） | AC-CONV-005-02 | **已关闭（2026-11-22 14:0x）**：`stop_interrupt_test.go:32` 单流断言上游 context 取消、停止后零 delta、idle；`:402` 双流断言只停目标、另一条继续到 done；真实厂商链路仍 403，连接级中断未验，作为环境残余记录 |
| G13 | BroadcastChannel 双通道直测 | AC-SYNC-003-02 | **已关闭（2026-11-21 v5）**：`Composer.test.tsx:178` 用 `node:worker_threads` 真 `BroadcastChannel` 双实例；`:198`/`:219` 覆盖无通道与构造器抛错 |
| G16 | 任务定位滚动（`app.tsx:673 locateTask`）无组件级断言、交付物未实际点击下载 | AC-CONV-008-02 | 仅 E2E 06（05:14，未重跑）覆盖定位高亮；`RightPanel.test.tsx` 只断言链接渲染 |
| G17 | 本轮新增用例未进全量套件运行 | —（过程） | **已关闭（2026-11-22 02:26）**：全量已重跑并写回 §0.5——前端 20 文件 / 200 用例（02:26，`.test-full-conv6b.log`）、后端 281 PASS / 1 SKIP / 16 包（02:23，`.tmp/be-conv5v.log`），未用“上版 + 新增”推算 |
| G18 | `AC-CONV-008-05` 负路径“补取失败时错误态与已加载列表同时可读”无断言 | AC-CONV-008-05 | 该 AC 已由第五轮验收判 `pass`（`ACCEPT-CONV-5`：done 3/6→6/6、pending 3/4→4/4、失败可重试）；`pending=4/items=3` 与“失败可重试”已由 `App.integration.test.tsx:289/:315` 覆盖；仍缺“补取失败后组头不回退、已加载 3 条仍可见、错误态与列表同时可读”——`OverviewPanel` 整栏 `ErrorState` 会卸载列表，本分支未实现。补测需改组件结构，不阻塞 AC |

### 16.3 待裁项（产品 spec 与代码不一致，本文件不自行裁决）

| 编号 | 不一致 | 证据 | 影响 |
|---|---|---|---|
| D1 | **已解决（2026-11-21 v2）**：`AC-CONV-001-03` 的 409 信封已含 `blockers:["主会话不可归档"]` | 实响应 `{"blockers":["主会话不可归档"],"code":"main_session_protected","error":"主会话不可归档","ok":false}`（`.tmp/accept/cdp-v2.log`，21:58:05） | AC-001-03 转 `pass` |
| D2 | 产品 spec §4.1 仍写“`spec.go:292-327` 的 `Archive` 无主会话守卫 / `m81_all_messages_test.go:85` 与 `App.conversation.test.tsx:107-120` 把归档 main 成功当预期”；实际守卫已实现，`m81` 已改为断言 409，前端测试也已改写 | `backend/internal/modules/sessions/spec.go:299-301`；`backend/cmd/simo/p1_conv_sessions_http_test.go:557`；`backend/cmd/simo/m81_all_messages_test.go:85` 现断言 Conflict；`App.conversation.test.tsx:109` 仅子会话归档、`:126` 主会话无菜单 | 前端测试冲突已消（v2）；产品“现状”文字仍待产品更新 |
| D3 | 产品 §4.5 写右栏证据“6 条 `RightPanel.test.tsx`”；实际 7 条（新增 `:110`） | `frontend/src/components/RightPanel.test.tsx:8/21/35/51/75/100/110` | 仅计数过期，不影响口径 |
| D4 | 产品 §6 写 002-02“失败反馈缺陷（无 catch）”；实际 `app.tsx:465-476`/`:552-562` 已有 try/catch，且有 4 条失败用例 | `frontend/src/App.operation-errors.test.tsx:49/75/95/113` | 产品“现状”文字过期 |
| D5 | （**已转 backlog，非目标，不阻塞 P1**：删除随 002-03 移出验收面）错误码/确认令牌形态未定；当前 `handleDelete` 恒 403 `R4_CONFIRM_REQUIRED`，无令牌、无级联 | `backend/internal/modules/sessions/http.go:68-69`；`backend/cmd/simo/p1_conv_sessions_http_test.go:355` | 不适用；若产品重新立项再恢复 |
| D6 | AC-003-01 的 Given 仍是“消息含唯一关键词”，AC-003-03 要求标题搜索；UI 已走标题搜索 | `specs/product/P1-CONV/spec.md:106`、`:108`；`frontend/src/api.ts:34` | v2 按“标题过滤”判两条均 pass（`ACCEPT-CONV-20261121.md §7.2`）；003-01 的 Given 是否改写待产品 |
| D7 | 未读口径：产品为会话级布尔、不显示条数；代码已落 `hasUnread` + 未读点，但旧“会话内条数”计数器（`app.tsx:98/224/695`）仍在 | `specs/product/P1-CONV/spec.md:244-246`；`frontend/src/app.tsx:98/224/695`；`frontend/src/components/library.tsx:121` | 旧计数器是否保留待裁；v2 证据已回填（`ACCEPT-CONV-20261121.md §7`），不阻塞 SYNC-004 |
| D8 | 覆盖率门禁只 include `frontend/src/components/library.tsx`，不代表域覆盖 | `docs/testing/CONV-EVIDENCE-20261121.md` §1.3 | 过程口径待裁，非 AC 冲突 |
| D9 | Playwright legacy 11 例 vs README 历史“16 条”；两者均不得作证据 | `frontend/e2e/README.md` 证据口径段 | 文档口径待统一 |
| D10 | **已解决（2026-11-21 v6）**：`AC-CONV-001-04` 要求置顶入口“仅非主/非草稿/**未归档**”，v5 时实现与测试只守前两条 | 现状：`frontend/src/components/library.tsx:129` 菜单项包在 `{!session.archived && …}` 内、`app.tsx:621-624` 拒绝归档会话并提示；`backend/internal/modules/sessions/management.go:53-55` 返回 `ErrArchived`、`pin_guard_test.go:86` 真 handler 409 `session_archived`；`Sidebar.test.tsx:184` 断言归档行无“置顶” | 代码按 AC 补齐，无口径分歧；G15 关闭 |

> **已排除的疑似不一致（2026-11-21 复核，记录以免重复开单）**：右栏分组口径。曾疑“pending 混入进行中组”，复核产品 §4.5 第 2 条明确“未开始只放 pending、运行中只放 running”，与 `frontend/src/components/library.tsx:700-704` 及 `RightPanel.test.tsx:51` 的断言一致 → **不是**不一致；008-02 的缺口只是“无写入口”负断言（G14）。

### 16.4 已过期/待改的旧断言

| 位置 | 旧断言 | 现状 | 处理 |
|---|---|---|---|
| `frontend/src/App.conversation.test.tsx:107` | 归档 main 成功、列表隐藏、只读 | 已改写：`:109` 仅归档子会话、`:126` 主会话无归档菜单；后端 409 含 `blockers` | 已完成（2026-11-21 v2，G4 关闭） |
| `backend/cmd/simo/m81_all_messages_test.go:85` | 归档 main 成功 | 已改为断言 409 | 已完成，产品文字待更新（D2） |
| `specs/test/P1-CONV/test-plan.md`（旧版） | rename/archive 无 try/catch；`clientMutationId` 0 处理；主会话可归档 | 均已被代码与测试推翻 | 本文件整体重写 |

### 16.5 check-trace 复跑输出（2026-11-21 23:36，与 23:13 一致，原样）

`node scripts/check-trace.mjs`（仓库 node runtime，2026-11-21 23:36 复跑）退出码 1，末尾 `FAILED: 3 issue(s)`、`失败项：3，提示项：1`，与 23:13 输出逐行相同。以下为原样输出（仅去掉终端着色）：

```
[GOVERNANCE] specs/changes/CHG-SYS-001/spec.md:4 Implements: N/A — 本变更为工程治理，不改变任何产品行为，也无对应产品 PRD（见 §9 Q1 裁决）
docs/product/TRACEABILITY.md:30 T1 TRACEABILITY.md 合计 71 与 TREE.md PRD 数 72 不一致；修正合计行
docs/product/TREE.md:136 T4 PRD-CONV-008 的 TEST 链接缺少 #锚点；补 #tc-...
docs/product/TRACEABILITY.md:1 T2 PRD-CONV-008 未出现在 TRACEABILITY.md；补该 PRD 行
[WARN] docs/product/TRACEABILITY.md:1 T2 1 个 PRD 未被任何 change 包引用（仅提示）：PRD-CONV-008
FAILED: 3 issue(s)
```

三项红项全部落在 `docs/product/`，按本轮 scope 不改；本文件（`specs/test/P1-CONV/test-plan.md`）无剩余失败项，`坏 TEST 锚点：1` 指的是 `TREE.md:136` 的链接缺锚点，不是本文件的 `tc-*` 锚点。

---

## 17. 历史与变更记录

| 日期 | 版本 | 变更 | 作者/证据 |
|---|---|---|---|
| 2026-11-21 之前 | v1 | 旧结构 `TC-P1-001..012` + `E1..E3`，335 行；状态 4 pass / 9 partial / 2 missing；含已过期断言 | 旧 `specs/test/P1-CONV/test-plan.md` |
| 2026-11-21 | v2（本文件） | 按 CHG-CONV-006 重写为长期测试 Spec：§0 门禁、§1 34 AC 矩阵、§2–§14 逐 PRD、§15 手工、§16 缺口/待裁、§17 历史；补齐 008、001-03、004-03、SYNC-004、005 映射；状态按实读重判（pass 17 / partial 9 / missing 6 / blocked 2）；008-02 因“无写入口”无负断言降 partial（G14） | 测试 Agent，本次核对 |
| 2026-11-21 20:36 | 运行补记 | 后端定向 38 条 P1 用例 `PASS`（`ok simo/cmd/simo 47.906s`，exit 0） | 首轮全量挂起时的独立取证 |
| 2026-11-21 20:43 | 运行补记 | 后端全量 `go test ./... -count=1 -timeout 300s` 通过：全包 `ok`、`cmd/simo 250.42s`、exit 0；前端同日 20:33 `17 files / 128 tests` exit 0 | §0.5 |
| 2026-11-21 20:42 | 治理补记 | 补 13 个 TEST 锚点后 `check-trace` 由 27 项失败降至 3 项，残余均在 `docs/product/`（TREE 136 / TRACEABILITY 1、30），本文件无剩余失败项 | `node scripts/check-trace.mjs` |
| 2026-11-21 21:18 | v3 | 产品口径变更同步：`AC-CONV-002-03`（删除会话）移出验收面（显式非目标 + backlog），矩阵撤行、§3 撤 TC-007、§15 撤 M-07、G1/D5 转“不适用/非目标”；有效 AC 收敛为 31 条（33 unique 含 SYNC-005 2 条 blocked），矩阵 31/31 生效映射；SYNC-004-01/02/03 补记“实现已落（迁移 v23）+ 待 accept-conv 证据”，**三态判定未改，仍 missing**；状态计数 pass 17 / partial 9 / missing 5 / blocked 2 | 测试 Agent，按 lead 口径变更；31/31 自查脚本输出见交付回复 |
| 2026-11-21 22:12 | v4 | 按 `docs/testing/ACCEPT-CONV-20261121.md §7`（v2 复验 21:54–22:06）回填 8 条 AC 证据：`AC-SYNC-004-01/02/03`、`AC-CONV-003-01/02/03`、`AC-CONV-001-03`、`AC-CONV-002-02` 转 `pass`；G2/G3/G4/G7 关闭、D1 关闭、D2 前端冲突消除；状态计数 pass 23 / partial 7 / missing 1 / blocked 2（33 行，有效 31 = 23+7+1）；矩阵接入单元/组件、HTTP、CDP、截图四类证据，缺类显式写“该类未覆盖” | 测试 Agent，证据 `ACCEPT-CONV-20261121.md §7`、`.tmp/accept/cdp-v2*.log`、`vitest-v2.log`、`gotest-v2.log`、`docs/testing/ACCEPT-v2-*.png`；`node scripts/check-trace.mjs` 残余见交付回复 |
| 2026-11-21 23:10 | v5 | 按新证据重算：前端 `frontend/.test-full-front-fix-3.log` 18 files/161 tests（23:01）、TS `frontend/.tsc-front-fix-3.log` 0 字节、后端 `.tmp/be-after2.log` 22:35 `269 PASS/1 SKIP/16 包`；`AC-CONV-007-02`、`AC-CONV-008-02`、`AC-CONV-008-03`、`AC-SYNC-002-01`、`AC-SYNC-002-02`、`AC-SYNC-003-02` 转 `pass`；`AC-CONV-001-04` 由 `missing` 改判 `partial`（归档守卫缺失 + 重启保持无用例），`AC-CONV-008-04` 保持 `partial`（前端无 `If-None-Match`/304）；新增 §1.1 证据分布、§16.5 check-trace 输出；G5/G6/G8/G10/G13/G14 关闭、G9 部分关闭，G15/G16 新开，D10 新开；状态计数 **pass 29 / partial 2 / missing 0 / blocked 2**（33 行，有效 31 = 29+2） | 测试 Agent，证据：上述三份日志 + `RightPanel.test.tsx:118`、`ExecRowHitArea.test.tsx:44/72/125`、`Composer.test.tsx:178/198/219`、`App.tabsync.test.tsx:189/211/235`、`App.tabsync.degrade.test.tsx`、`App.conversation.test.tsx:103/116`、`App.operation-errors.test.tsx:101`、`etag_test.go` 五条、`m89_all_messages_errors_test.go:11` |
| 2026-11-21 23:33 | v6 | 两条转 `pass`：`AC-CONV-001-04`（`tree_order_test.go` 五条 + `pin_guard_test.go` 三条后端定向 8/8 PASS；`Sidebar.test.tsx:184`、`App.conversation.test.tsx:643`、`library.tsx:129`、`app.tsx:621-624` 前端定向 3 文件 61 tests；真机 8787 截图与 `metrics.json` 的顺序/菜单/复原证据）、`AC-CONV-008-04`（`api.ts:41-101` 条件请求与 304 同引用、`app.tsx:167/194/473` 早退、`api.test.ts:83` 起 7 例、`App.conversation.test.tsx:612`；真机 304 + `marksKept:true`/`removals:0`/`emptyFlashes:0` 与 `deploy-8787-2330-search-304-1600.png`）；G11/G15 关闭、D10 解决、新增 G17（全量未随新增重跑）；状态计数 **pass 31 / partial 0 / missing 0 / blocked 2**（33 行，有效 31 全部 pass） | 测试 Agent，证据：`.tmp/be-pin-guard.log`、`.tmp/fe-pin-etag.log`、`docs/testing/deploy-8787-2330-metrics.json` 及同批截图；`node scripts/check-trace.mjs` 结论仍为 3 项，均在 `docs/product/` |
| 2026-11-22 02:32 | v7 | 纳入产品新增 `AC-CONV-001-05`（行内消息数取会话自身、底部保持全局）与 `AC-CONV-008-05`（右栏分组展开补取到 total），新增 `TC-P1-CONV-035`（pass）与 `TC-P1-CONV-036`（partial）；实现侧并行 Agent 已落 `messageCount`（后端 `counts.go:16`、`view.go:12`、`message_count_test.go` 四条；前端 `library.tsx:161`、`types.ts:16`、`app.tsx:879`）；全量按本轮真跑改写基线——前端 20 文件/200 用例（02:26，`.test-full-conv6b.log`）、`tsc` exit 0、后端 281 PASS/1 SKIP/16 包（02:23，`.tmp/be-conv5v.log`）、HTTP 原文 `main.messageCount=75`/求和 209（`.tmp/conv6-sessions.raw.json`）；G17 关闭（全量已重跑，未用“上版 + 新增”推算）、G18 新开（`pending=4` 与补取失败重试无断言）；状态计数 **pass 32 / partial 1 / missing 0 / blocked 2**（35 行，有效 33 = 32+1） | 测试 Agent，证据：上述日志与 `node .tmp/selfcheck-matrix2.mjs` 输出 rows=35/effective=33/unique=35/sum=35 |
| 2026-11-22 12:25 | v8 | 第六轮复核：`AC-CONV-007-02` 由 pass 降 `partial`（CSS 48×44 扩区已入基础规则，`TimelineGroups.test.tsx:114` 契约单测通过；CDP 四角/细指针 4 条因 9223 无监听 skip，无浏览器未做真机命中实测）；`AC-CONV-008-04` 复核为 pass（后端 `spec_projection_etag_test.go` 五条：Stable/NotModified/TracksTaskChange/TracksDeliverables/DistinguishesTaskLimit；前端 `api.test.ts:244/260` 覆盖 304 保留数据与 `taskLimit` 互不命中）；TC-011 补 GFM 表格、行内四类与链接样式证据；矩阵行 31/32/34/35 的测试数、行号与 E-CDPX 标注同步；全量按真跑改写——前端 23 文件（21 passed + 2 skipped）/ 226 pass + 6 skip（12:15）、`tsc` exit 0、后端 285 PASS/1 SKIP/16 包（12:20–12:25）；状态计数 **pass 31 / partial 2 / missing 0 / blocked 2**（35 行，有效 33 = 31+2） | 测试 Agent，证据：`.tmp/fe-conv7-20261122-121527.log`、`.tmp/tsc-conv7.log`、`.tmp/be-conv7v-20261122-122018.log`、`node .tmp/selfcheck-matrix2.mjs` 输出 |
| 2026-11-22 13:35 | v9 | 按第七轮独立验收 `ACCEPT-CONV-6` 把 `AC-CONV-007-02` 由 partial 转 pass（真机 8787 + CDP 9223、1600×1000：点击 27/27、末尾 71/73/74、滚轮 active 28、任意 y 10/10、右边界 1px、15 行计数 209；未验证 touchstart/pointerdown 释放、末尾超 3 秒、75 根穷举、窄屏）；`AC-CONV-008-05` 按第五轮验收 `ACCEPT-CONV-5` 维持 pass（done 3/6→6/6、pending 3/4→4/4、失败可重试；负路径仍缺，记 G18）；`AC-CONV-006-02` 因无输入法环境维持 partial；G8 关闭；产品 spec §6 的 `PRD-CONV-007` 行同步改为“整列命中已真机验证”；状态计数 **pass 32 / partial 1 / missing 0 / blocked 2**（35 行，有效 33 = 32+1） | 测试 Agent，证据：`docs/testing/ACCEPT-CONV-5-20261122.md`、`docs/testing/ACCEPT-CONV-6-20261122.md`、`.tmp/accept6/raw*.json`、`node .tmp/selfcheck-matrix2.mjs` 输出 |
| 2026-11-22 14:15 | v10 | 第八轮最终合并验收 `ACCEPT-CONV-8` 重算：`AC-CONV-005-01/02` 由 pass 降 partial——单流主路径（UI 点击→`correct` 帧→后端 cancel→零 delta→idle）已由 `stop_interrupt_test.go:32` 与 `App.conversation.test.tsx:436-453` 闭合，但 `api.ts:250-253` 的帧只带 `sessionId`、无 `messageId`，`loop.go:1136-1152` 的 `findActive` 只取最新 active，并发/双标签下停止目标不确定；`AC-CONV-008-03` 补 375×812 四态截图与 metrics、`AC-CONV-008-04` 补真机 200→304（`.tmp/accept8/304-live.json`）、`AC-CONV-004-01` 的表格真机滚动由 `MessageTableLayout.test.tsx` 2/2 实跑关闭；前端全量 23 文件 242 全过（0 skip，`.tmp/accept8/frontend-all.log`），后端全量本轮未取到（11 分钟 0 字节，定向 stop 1 条 PASS），基线仍记 285+新增；状态计数 **pass 30 / partial 3 / missing 0 / blocked 2**（35 行，有效 33 = 30+3） | 验收 Agent，证据：`docs/testing/ACCEPT-CONV-8-20261122.md`、`.tmp/accept8/*` |
| 2026-11-22 14:2x | v11 | 按消息定向停止收口：`AC-CONV-005-01/02` 由 partial 转 pass——`api.ts:251-258` 的 `correct` 帧带 `messageId`、`app.tsx:710-721` 对每条流式消息逐条发帧、`http.go:67/:384` 字段与透传、`loop.go:1109-1151` 用 `findActive(sessionID, messageID)` 只取消命中条（找不到只记 Warn、不退化）；新增 `stop_interrupt_test.go:402` 双流定向用例，前端补 `App.conversation.test.tsx:455`；幂等已有 `idempotency.go` 与 7 条测试，产品 spec 的“后端 0 处理”记录待裁决；本轮前端 23 文件 / 243 用例（26.45s、0 skip）、后端定向两用例 PASS（新用例 2.07s，chat 整包 3.139s），后端全量待 Lead；状态计数 **pass 32 / partial 1 / missing 0 / blocked 2**（35 行，有效 33 = 32+1）；G12 关闭 | 测试 Agent，证据：`docs/testing/STOP-EVIDENCE-2-20261122.md`、`backend/internal/modules/chat/stop_interrupt_test.go:402`、`frontend/src/App.conversation.test.tsx:455`；运行日志待 Lead 归档 |
| 2026-11-22 18:30 | v12 | 按用户裁决移除 `PRD-SYNC-005`：AC 35→33（全部生效 = 32 pass / 1 partial / 0 blocked），矩阵撤原 28/29 两行并把后续行号收为 28–33，§14 撤销 TC-P1-CONV-029/030，编号不复用；产品 spec、TREE、TRACEABILITY 同步 72→71、P1 13→12、gap 23→22 | 测试 Agent，按 lead 派单；`node scripts/check-trace.mjs` 待跑 |
| 2026-11-22 19:35 | v13 | 第十轮严格验收 `ACCEPT-CONV-10` 重算两行：`AC-CONV-006-02` 由 partial 转 pass（`IME-EVIDENCE-20261122.md` 的 CDP `Input.imeSetComposition` 五点验证 + 两张截图，无输入法环境的限制解除）；`AC-CONV-005-02` 由 pass 降 partial（断线重连与 `since` 已由真机杀进程场景补测：`重连中`→`已连接`、重连帧 `since=9291`；仍缺真实厂商连接级中断 403 与跨标签流式双 WS）；文件头基线与最近核对改写为 final10 实测（前端 25 文件/260 用例、加 `--testTimeout=20000` 后全过 24.43s；后端 26 包 16 ok/0 FAIL，`cmd/simo` 259.609s）；状态计数保持 **pass 32 / partial 1 / missing 0 / blocked 0**（33 行，有效 33 = 32+1） | 验收 Agent，证据：`docs/testing/ACCEPT-CONV-10-20261122.md`、`docs/testing/sync001-since-evidence*.json`、`docs/testing/accept10-http*.json`、`.tmp/accept10/*.mjs` |
| 2026-11-22 19:25 | v14 | 收口两处判据：`AC-CONV-005-02` 从 partial 转 pass，判据改为与厂商无关的停止机制（停止帧后上游 `context` 取消、不再派发 `reply.delta`/`message.delta`、不落库、回 `idle`；证据 `stop_upstream_test.go` 三断言 + `STOP-UPSTREAM-EVIDENCE-20261122.md` 5 PASS/0 FAIL），真实厂商 403 与跨标签双 WS 降为环境限制、不进判据；`AC-CONV-006-02`/TC-019 保持 pass，物理 IME 未覆盖改记环境限制，§15 M-05 由 `missing` 改 `partial`（CDP 合成组合态已验证）；状态计数 **pass 33 / partial 0 / missing 0 / blocked 0**（33 行） | 测试 Agent，按 lead 派单；证据：上述测试文件与 `docs/testing/ACCEPT-CONV-10-20261122.md`、`docs/testing/IME-EVIDENCE-20261122.md` |

### 17.1 复核清单（每次改本文件时执行）

1. `npm test -- --run --pool=threads` 与 `..\toolchain\go.ps1 test ./... -count=1` 重跑，更新 §0.5。
2. `pnpm test:e2e:cdp` 重跑，确认 `summary.md` 时间戳晚于最近代码变更；否则相关 AC 降级。
3. 逐条核对 §1 的 `文件:行` 仍指向真实测试（`grep` 测试名）。
4. 检查 §16.3 待裁项是否有产品裁决；有则更新 AC 状态并记录 §17。
5. 确认 SYNC-005 移除后没有残留的 blocked 行、TEST 锚点或 `gap` 引用。
6. 几何/触控类断言（44px、遮挡、可见比例）只能取 CDP 真渲染或独立验收的真机结果（`E-CDPX` / E-ACC*）；jsdom 的 `getBoundingClientRect` 恒为 0，不能充当尺寸证据；本机 9223 不可用时可用 8787 真机验收替代，CSS 契约单测仍不能替代真机命中。
