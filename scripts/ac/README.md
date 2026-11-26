# AC 脚本调度说明

`node scripts/run-ac.mjs` 是验收脚本的唯一调度入口：它扫描 `scripts/ac/AC-*.mjs`，按 `groups.json` 把脚本分到共享 harness 组（backend、backend-tools、backend-clock、ui）或 cdp 泳道组，其余未登记脚本走单脚本模式。三组共享实例由 `scripts/ac/lib/batch-harness.mjs` 起停，端口基址统一加 `AC_HARNESS_PORT_OFFSET`。

`--only` 既收精确 AC 号，也收以 `-` 结尾的前缀，例如 `--only AC-TASK-` 选中任务域全部 30 条；`--group` 只接受 cdp、http、unit。`--json` 输出 `counts`、`total`、`elapsedMs`、`assertions`、`timings.groups`、`results`，其中 `timings.groups` 按组或泳道给出脚本清单与实际墙钟。

## 每组并发数与端口段

| 组 | 并发 | 实例与端口 | 隔离方式 |
|---|---|---|---|
| backend | 1（2 片轮转） | 8789 / 8792 两个 mock 后端 | 每片独立库，按片轮换 |
| backend-tools | 1 | 8791 + 假上游 8790 | 独立 HOME |
| backend-clock | 1（2 片轮转） | 8793 / 8794（testclock 构建） | 独立 HOME |
| ui | 3 | 页面 8787 / 8776 / 8766 | 每槽独立页面端口与库 |
| cdp | 4 | 后端 8931-8934、假上游 8941-8944、Chrome 调试 9280-9283 | 每槽独立 HOME、库、锁、浏览器 |

并发数写在 `scripts/run-ac.mjs` 的 `GROUP_CONCURRENCY`（`{ ui: 3, cdp: CDP_LANES, backend: 1, 'backend-tools': 1, 'backend-clock': 1 }`），槽位端口段写在 `scripts/ac/lib/batch-harness.mjs` 的 `CDP_LANES`、`CDP_LANE_BACKEND_PORT = 8931`、`CDP_LANE_UPSTREAM_PORT = 8941`、`CDP_LANE_DEBUG_PORT = 9280`。cdp 段与 backend 8789/8792、tools 8791/8790、clock 8793/8794、UI 8787/8776/8766 以及默认 Chrome 9223 都不重叠。

## cdp 四条泳道的隔离

`batch.envFor(group, index)` 是唯一的槽位环境入口，cdp 分支在实例查找之前返回一套完整环境：`AC_CONV_BASE=http://127.0.0.1:(8931+lane)`、`AC_CONV_HOME=runs/<runId>/cdp/lane-N`、`AC_CONV_UPSTREAM_PORT=(8941+lane)`、`AC_CONV_LOCK=<该 HOME>/backend.lock`、`AC_CDP_PORT=(9280+lane)`，并且不设 `AC_CONV_SHARED`。脚本照旧自起自停后端，所以 `restartBackend` 判据（AC-TASK-003-04、AC-TASK-006-07）在泳道里仍然可用；四条泳道各自持有独立库与独立实例锁，互不排队。

`scripts/ac/lib/conv-backend.mjs` 的实例锁改为优先读 `AC_CONV_LOCK`，未设置时仍用旧的共享锁 `.tmp/chg-007-T06/backend.lock`；`acquireLock` 会为锁文件所在目录建父目录，报错文案改成实际端口。`scripts/lib/ac-cdp.mjs` 与 `scripts/probe-cdp.mjs` 按 `AC_CDP_PORT` 起浏览器，每个端口一份 `user-data-dir`，因此四条泳道是四个互不干扰的 headless 实例。

泳道内的脚本仍一条一条串行执行，泳道之间并行。分配由 `assignLanes` 按上一次运行的 `durationMs` 做 LPT：长脚本先上，每次放进当前累计负载最小的泳道，不平均切；读不到耗时的条目按已知耗时的中位数估算并重试一次读取，避免 0 时长把多个脚本堆进同一条泳道。首次运行没有历史耗时时退化为按发现顺序轮转。

## 实测数据

改前用串行调度跑 `--group cdp`，改后用 4 条泳道跑 `--only AC-TASK-`，两次都是 30 条全 pass、断言总数 439。证据在 `.tmp/ac-parallel-4/`。

| 口径 | 墙钟 | 断言数 | 通过 |
|---|---|---|---|
| 改前串行 before.json | 521906 ms | 439 | 30/30 |
| 改后 4 泳道 after.json | 140636 ms | 439 | 30/30 |
| 稳定性第 1 次 stability-1.json | 233746 ms | 439 | 30/30 |
| 稳定性第 2 次 stability-2.json | 135984 ms | 439 | 30/30 |
| 稳定性第 3 次 stability-3.json | 135759 ms | 439 | 30/30 |
| 修正后 stability-4.json | 139754 ms | 439 | 30/30 |
| 修正后 stability-5.json | 135191 ms | 439 | 30/30 |

改后墙钟约为改前的 27%（3.7 倍提速）。稳定性第 1 次出现过一次 234 秒长尾，`timings` 显示 13 条脚本集中在 lane-4、其余三条各 5 至 6 条，与「读不到耗时的条目被当成 0 负载、于是全部落进同一条泳道」的分配行为一致；断言仍全过，没有共享库或共享端口导致的失败。分配逻辑按上一节改成中位数估算加重试后，后续各次稳定在 135 至 140 秒。

## 排障与注意事项

端口被残留进程占用时脚本会以 R-ENV 失败并打印实际端口与日志尾部；先查 8931-8934、8941-8944、9280-9283 上是否还有上一轮的 `simo.exe` 或 Chrome，再决定是否清理，不要用改断言的方式绕过。cdp 组里的 AC-TASK-006-03 使用带 `-tags testclock` 的测试构建 `.tmp/chg-007-T06/simo-testclock.exe`，该构建必须与 `simo.exe` 同一源码版本，旧构建只支持 tasks schema v10，遇到 v11 的库会在启动阶段报「模块迁移失败」。每个脚本的断言证据写在 `.tmp/ac/<AC>.json`，调度器另存一份到 `.tmp/ac-tooling/script-evidence/`，报告里的 `assertions` 取自后者。
