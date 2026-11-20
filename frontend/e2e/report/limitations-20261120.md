# E2E 执行环境与结果（2026-11-20）

## 1. 结论

- **本会话已通过 CDP runner 真实执行全部 11 个场景：连续 5 次 11/11 PASS，最后一次 exit code 0。**
  - 命令：`pnpm test:e2e:cdp`（等价于 `node frontend/e2e/scripts/cdp-runner.mjs`）
  - 浏览器：外部 headless Chrome `Chrome/157.0.8103.50`，CDP `http://127.0.0.1:9223`（`chromium.connectOverCDP`，不启动 Chrome、不 fork worker）
  - 后端：`backend/simo-live-composer.exe`，隔离端口 `19230`，空 `SIMO_HOME`，`-model mock`
  - 结果：`frontend/e2e/report/cdp/summary.md`、`frontend/e2e/report/cdp/results.json`、`frontend/e2e/report/cdp/run-20261120.log`；失败截图仅失败时生成
- **`pnpm test:e2e`（Playwright Test）在本受限会话仍不能执行**：global setup 能起栈，但 runner 在 `WorkerHost.startRunner` 处 `child_process.fork` 被 Windows 沙箱拒绝（`spawn EPERM`）。它需要普通 Windows 桌面或 CI；与 CDP runner 覆盖同一组场景。
- 直接在本会话启动 Chrome/Edge 仍失败：Mojo/Crashpad 命名管道被拒（`0x5`）。CDP 端点由环境预先提供，runner 不自行启动浏览器。
- 此前 Lead 本机跑出的 7/11（4 个失败）已完成修复；修复后的 `test:e2e` 在普通终端的 11/11 仍待复跑确认（本会话用 CDP runner 验证了同一组断言）。

## 2. 证据

| 证据 | 文件 |
|---|---|
| CDP runner 11/11 结果（本文件结论来源） | `report/cdp/summary.md`、`report/cdp/results.json` |
| Playwright Test：setup 成功 + worker fork EPERM | `report/run-blocked-20261120.log`、`report/run-attempt.log`、`report/run-attempt-2.log` |
| 直接启动 Chrome 失败（Mojo/Crashpad 0x5） | `report/chrome-blocked-20261120.log` |
| preflight（栈 + seed + 任务/审批/交付物） | `report/preflight-20261120.log` |
| Playwright 测试收集清单 | `report/list-20261120.log` |
| 旧 “No tests found” 报告（非本轮结果） | `report/stale-no-tests-results-20261120.json`、`report/stale-no-tests-html/` |

关键原文（`run-blocked-20261120.log`）：

```
[e2e-stack] ready: base=http://127.0.0.1:19201 apiPid=23952 ...
Running 11 tests using 1 worker
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:458:11)
    at Object.fork (node:child_process:174:10)
    at WorkerHost.startRunner (.../playwright/lib/runner/index.js:1998:49)
```

关键原文（`chrome-blocked-20261120.log`）：

```
ERROR:third_party\crashpad\crashpad\client\crashpad_client_win.cc:431] OpenProcess: 拒绝访问。(0x5)
FATAL:mojo\public\cpp\platform\platform_channel.cc:112] Check failed: . : 拒绝访问。(0x5)
ERROR:third_party\crashpad\crashpad\client\crashpad_client_win.cc:145] crash server failed to launch, self-terminating
```

## 3. CDP runner 结果明细

| 场景 | 结果 | 耗时(ms) |
|---|---|---|
| 01a 首屏结构（消息 + 时间轴 + 右栏） | PASS | 850 |
| 01b 375 宽度无横向溢出、时间轴/侧栏隐藏 | PASS | 378 |
| 02 Enter 发送、WS 流式与 mock 回复 | PASS | 1210 |
| 03 Enter/Shift+Enter 与反转模式 | PASS | 1209 |
| 04a FE-007 逐级加载、时间轴增长、prepend 锚定 | PASS | 2078 |
| 04b FE-007 413 显示错误且不插入祖先消息 | PASS | 1395 |
| 04c FE-007 403 显示无权限 | PASS | 1453 |
| 04d FE-007 空上级提示并允许继续向上 | PASS | 1202 |
| 05 消息接口 500 错误态与重试恢复 | PASS | 974 |
| 06 右栏任务点击定位并高亮消息 | PASS | 8738 |
| 07 交付物右栏/工作台可见并真实下载 | PASS | 1063 |

runner 使用与 `specs/01..07` 相同的种子、路由拦截与断言，不 skip、不放宽期望；文件为 `frontend/e2e/scripts/cdp-runner.mjs`。
`04a` 在 1600×800 下用 24 条子会话消息，并先断言 `scrollHeight > clientHeight` 且 `scrollTop > 0`，避免测到“贴底”状态。

## 4. 本轮针对 Lead 4 个失败的修复

| 失败 | 根因 | 修复（未跳过、未放宽） |
|---|---|---|
| 04 空上级“上级没有消息” | `createSession(null)` 后端默认 parent=main，空上级之后仍有 main；旧断言要求按钮计数 0，与 FE-007 spec“按钮仍可继续向上（若还有 parent）”冲突 | 断言错误文案、消息不增、无祖先组、按钮 title 变“主会话”；再点加载根、按钮消失、祖先组 +1。锚定容差按 spec 收紧到 ≤1px |
| 04a 锚定 586px 漂移 | 6 条子消息在 1600×800 下不足以滚动，`scrollTop=260` 被夹到 0，测的是贴底状态，加载祖先被 auto-scroll 到底部 | 种子加到 24 条；设置前等自动滚底 rAF；断言 `scrollHeight > clientHeight` 且 `scrollTop > 0`；消息文案补零（`当前消息 01`）避免子串匹配 1/10/11…；锚定测量前等两帧布局稳定，断言仍为 ≤1px |
| 05 首 500 无错误态 | 切换会话/effect 可能并发请求，第二次成功清掉 error | 错误态断言期间目标 session 的**所有** messages 请求都返回 500；错误出现后关路由、点重试并验证恢复 |
| 06 60s 超时 | 盲目等待 UI；未先确认任务/projection/右栏数据源 | 先 `waitForTaskDone` + `waitForProjectionTask` 确认 projection 含任务；再打开会话等 `.task-row`、点击、等 `.msg.is-flash` 并校验文本/taskId |
| 07 ECONNREFUSED 19201 | 固定端口/固定 state 文件，多个运行互相 reclaim/删除 runDir（此前的 attempt 与 Lead 的 run 并发） | 运行锁（`run.lock`，owner=process.pid，stale 自动接管）；启动前端口占用明确报错；空 home；teardown 仅在进程退出后清理；父进程关闭 api.log 句柄；删除 runDir 重试 20×250ms |

此外：`07` 下载用例改为真实下载事件 + `download.failure()===null` + `path()` + 文件内容 `TODO\n` 校验（比原断言更强）。

## 5. 复跑命令

正常 Windows（Playwright Test，CI 同路径）：

```powershell
cd frontend
pnpm install --frozen-lockfile
cd e2e
pnpm install --frozen-lockfile --ignore-scripts --node-linker=hoisted
cd ..
pnpm test:e2e
```

受限终端但已有 CDP（本会话路径）：

```powershell
cd frontend
$env:E2E_CDP_URL = 'http://127.0.0.1:9223'
pnpm test:e2e:cdp
```

报告：Playwright Test 在 `frontend/e2e/report/html/index.html`、`report/results.json`；CDP runner 在 `frontend/e2e/report/cdp/summary.md`、`report/cdp/results.json`。

## 6. 未验证

- 修复后的 `pnpm test:e2e`（Playwright Test runner）在普通 Windows 终端的 11/11：本会话只能跑 CDP runner；同组断言已 11/11 通过。
- `.github/workflows/e2e.yml` 未在 GitHub Actions 实跑（无 git/远程权限）。
- 不同 Chrome 版本的渲染差异、真实模型时延（不在 E2E 范围）。
