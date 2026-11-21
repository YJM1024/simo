# 2026-11-21 会话域（P1-CONV）批次 3/4/5 · 证据

状态：**active** — 只登记**本机实际执行过**的命令与结果；不重跑未跑项、不伪造 CI 结论。
范围：前端测试、后端 P1 测试、CDP E2E、`TestM13PauseAndRunNow` 文件锁修复、`app.tsx` prepend 锚定修复。
关联：收口总账 [`docs/product/CONV-CLOSURE.md`](../product/CONV-CLOSURE.md) · 用例 [`specs/test/P1-CONV/test-plan.md`](../../specs/test/P1-CONV/test-plan.md) · 交接 [`HANDOFF.md`](../../HANDOFF.md) · 验收登记 [`docs/tasks/acceptance.md`](../tasks/acceptance.md) 2026-11-21 会话域批次小节。

> **不升级 covered**：本文件登记的所有测试只提升“用例证据”，P1 仍为 **0 covered / 11 partial / 1 gap（SYNC-005）**、用例 **4 pass / 9 partial / 2 missing**；全仓仍为 **0 covered / 48 partial / 23 gap**（71 PRD）。

## 0. 提交边界

- 收口提交：`<COMMIT_SHA>`（parent `1592a90c2e530de04445817916a4b7d052bb7cf0`）。
- 本机无 `git` CLI；提交经 GitHub REST API（Git Data API）完成，parent 为提交时的远程 head，未强推。
- 环境：Windows 本机、Node 24（`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）、Go 工具链 `toolchain/go.ps1`（go1.27.3）；所有命令后台静默执行，日志落 `.tmp/release-scribe/`。

## 1. 前端：115/115 PASS + typecheck + 覆盖率

### 1.1 组件/集成测试

命令（工作目录 `frontend`）：

```powershell
node .\node_modules\vitest\vitest.mjs run --pool=threads --reporter=verbose
```

结果（`front-vitest-threads.log`）：**Test Files 13 passed (13)，Tests 115 passed (115)，exit 0**。

| 测试文件 | 用例数 |
|---|---:|
| `src/App.conversation.test.tsx` | 22 |
| `src/App.integration.test.tsx` | 7 |
| `src/App.tabsync.test.tsx` | 4 |
| `src/App.tabsync.channel.test.tsx` | 2 |
| `src/components/Composer.test.tsx` | 15 |
| `src/components/ConversationPanel.test.tsx` | 7 |
| `src/components/conversation-responsive.test.tsx` | 6 |
| `src/components/LibraryUtilities.test.tsx` | 2 |
| `src/components/MessageItem.test.tsx` | 18 |
| `src/components/MetricsDashboard.test.tsx` | 9 |
| `src/components/RightPanel.test.tsx` | 6 |
| `src/components/Sidebar.test.tsx` | 9 |
| `src/components/TimelineGroups.test.tsx` | 8 |
| **合计** | **115** |

本批新增/修改的前端测试：`App.conversation.test.tsx`（22）、`App.tabsync.test.tsx`（4）、`App.tabsync.channel.test.tsx`（2）、`components/ConversationPanel.test.tsx`（7）、`components/conversation-responsive.test.tsx`（6）、`components/Composer.test.tsx`（15，含新增 5）、共享 `App.test-utils.tsx`。

**为什么用 `--pool=threads`**：本机 DSH 沙箱禁止子进程建立管道，Vitest 默认 `forks` pool 启动 worker 时报 `Failed to start forks worker`（EPERM）→ 退出码 1，但这是**环境限制不是测试失败**；同文件同断言在 `--pool=threads` 下 115/115 通过（`front-vitest-final.log` 记录了 forks 失败，`front-vitest-threads.log` 为有效结果）。

### 1.2 类型检查

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
```

结果（`front-typecheck-final.log`）：**`TSC_EXIT=0`**。

### 1.3 覆盖率（单文件，非全仓）

```powershell
node .\node_modules\vitest\vitest.mjs run --pool=threads --coverage
```

结果（`front-coverage-threads.log`）：**`COVERAGE_EXIT=0`**；阈值 80。

| 文件 | % Stmts | % Branch | % Funcs | % Lines |
|---|---:|---:|---:|---:|
| `src/components/library.tsx` | 82.83 | 83.64 | 84.14 | 85.88 |

**限制**：覆盖率配置只 include `frontend/src/components/library.tsx` 单文件，**不是全仓覆盖率**，不能外推为域级覆盖。

## 2. 后端：246 个顶层测试、exit 0

命令（工作目录 `backend`；本机 `go` 不在 PATH，使用仓库内工具链包装设置 GOROOT/GOPATH/GOCACHE/TMP）：

```powershell
..\toolchain\go.ps1 test ./... -count=1
```

结果（`go-test-final.log`，27 行，末行 `GO_EXIT=0`）：**exit 0，16 个包 `ok`，0 个 `FAIL`，11 个包无测试文件**：

```text
ok  	simo/cmd/simo	268.539s
ok  	simo/internal/core/eventlog	2.759s
ok  	simo/internal/core/module	1.159s
ok  	simo/internal/modules/chat	3.892s
ok  	simo/internal/modules/memory	2.927s
ok  	simo/internal/modules/sessions	2.927s
ok  	simo/internal/modules/tasks	2.348s
ok  	simo/internal/platform/config	1.299s
ok  	simo/internal/platform/httpserver	1.624s
ok  	simo/internal/platform/llm	1.736s
ok  	simo/internal/platform/neutralize	1.167s
ok  	simo/internal/platform/permission	0.869s
ok  	simo/internal/platform/sqlite	1.503s
ok  	simo/internal/platform/tokenmeter	0.761s
ok  	simo/internal/platform/workspace	1.036s
ok  	simo/tools/workspace-migrate	1.740s
GO_EXIT=0
```

- 顶层测试计数：对 `backend/**/*.go`（排除 vendor）按 `^func (Test\w+)\(t \*testing\.T\)` 统计为 **246**，与全量运行一致（0 skip）。
- 本批次新增 19 个 P1 测试、5 个文件：

| 文件 | 新增顶层测试 |
|---|---:|
| `backend/cmd/simo/p1_conv_messages_http_test.go` | 5 |
| `backend/cmd/simo/p1_conv_sessions_http_test.go` | 5 |
| `backend/cmd/simo/p1_conv_ws_test.go` | 4 |
| `backend/internal/modules/chat/category_test.go` | 2 |
| `backend/internal/modules/sessions/management_test.go` | 3 |

### 2.1 `TestM13PauseAndRunNow` 的 CI 文件锁修复

- 现象：CI run [`44867249776`](https://github.com/YJM1024/simo/actions/runs/44867249776)（head `1592a90`）的 Windows job 在 `TestM13PauseAndRunNow` 失败，报 TempDir 清理失败（临时目录仍被占用）。
- 根因：测试在调度（schedule）真正进入 `done` 之前就结束并触发 `t.TempDir()` 清理（Windows 上进程/句柄释放有延迟），产生文件锁竞争；不是断言错误。
- 修复（`backend/cmd/simo/m13_test.go`）：在该测试末尾补 `waitScheduleStatus(..., "done", 15s)`，等调度状态收敛后再让测试退出。**只等待状态，未放宽/删除任何断言，未使用 `t.Skip`。**
- 本机验证：定向 `ok simo/cmd/simo 63.649s`（`.tmp/m13_fix_all_count3.log`）、`ok simo/cmd/simo 63.763s`（`.tmp/m13_fix_count20.log`），随后再跑全量（见上）。
- **CI 是否通过以 push 后的 GitHub Actions 结果为准**，见 §4。

## 3. E2E：19/19 PASS ×2（CDP runner）

命令（工作目录 `frontend`）：

```powershell
node e2e/scripts/cdp-runner.mjs    # 等价 pnpm test:e2e:cdp
```

结果：**19/19 passed, 0 failed**，连续两次（`frontend/e2e/report/cdp/run-20261121-131214.log`、`run-20261121-131332.log`，均以 `[cdp] RESULT 19/19 passed, 0 failed` 结束）。

- 通过项：01a、01b、02、03、04a、04b、04c、04d、05、06、08、09、10、11、12、13、14、15、16。
- `07`（工作台交付物）按 **OOS（out of scope）默认 skip**：`[cdp] skip out-of-scope`；需要包含时设 `E2E_INCLUDE_OOS=1`。**skip 不计入 19/19 通过。**
- 新增 08–16 覆盖：新建会话空态与首条消息物化、会话列表加载失败与重试、时间轴增长 + prepend 锚定、消息接口错误重试、发送失败不假落库、会话搜索（标题/消息/无匹配空态）、多标签 active 会话与发送模式同步等。
- 运行环境：后端为隔离 mock 实例 **`http://127.0.0.1:19230`**（`backend/simo-live-composer.exe`）、CDP `http://127.0.0.1:9223`（version 157.0.8103.80）、临时 `SIMO_HOME`。
- **限制（不得写成“真实全链路验收”）**：
  1. 这是 **CDP runner，不是 Playwright Test**；`pnpm test:e2e` 的 Playwright 普通路径在本机沙箱跑不通，CI 也未接线。
  2. 后端是隔离 mock 端口 19230，**不是 8787 真实模型/真实数据**。
  3. 不覆盖记忆/团队/调度/设置/工具等其他域。
- 留档：`frontend/e2e/report/cdp/{run-20261121-131214.log, run-20261121-131332.log, results.json, summary.md, audit-P1-CONV.md}`。

## 4. 修复：`app.tsx` 祖先 prepend 滚动锚定

- 现象：加载更早消息（prepend）后再次 apply 时，滚动锚定用旧 scrollHeight 回写，视口跳到旧位置。
- 修复：`frontend/src/app.tsx` 在 prepend 后按新的内容高度重新计算锚定偏移，二次 apply 不再写回旧值。
- 证据：`frontend/src/App.conversation.test.tsx`（22 条，含 prepend/锚定）、`frontend/src/components/ConversationPanel.test.tsx`（7 条四态）、E2E 04a（时间轴增长 + prepend 锚定）通过。

## 5. 门禁（本地）

| 命令 | 结果 | 日志 |
|---|---|---|
| `node ../scripts/check-sdd.mjs`（工作目录 `frontend`） | **PASS**（15 specs、COMP 5、A 134/134、manifest 33、失败 0、警告 0） | `.tmp/release-scribe/check-sdd.log` |
| `node ../scripts/check-trace.mjs`（工作目录 `frontend`） | **PASS**（71 PRD、15 change 包、失败 0、提示 0） | `.tmp/release-scribe/check-trace.log` |

## 6. CI（真实状态）

- push 前远程 head：`1592a90c2e530de04445817916a4b7d052bb7cf0`；push 前最近一次 run [`44867249776`](https://github.com/YJM1024/simo/actions/runs/44867249776) 为 **failure**（旧 head、m13 文件锁，本次已修）。
- 收口提交 `<COMMIT_SHA>` 的 run：**待本次 run 验证**（push 后回写 run id、Linux quality 与 Windows build-test 结论）。
- `optional docker build`、`optional real-model smoke` 为 optional；若 **skipped 不计入通过**。CI eval 使用 mock 模型，不能替代 8787 真实实例验收。

## 7. 结论与不升级说明

- 本机可复现结果：前端 **115/115**、typecheck exit 0、覆盖率（单文件）82.83/83.64/84.14/85.88；后端 **246 顶层测试、exit 0**；CDP E2E **19/19 ×2**；门禁 **check:sdd / check:trace PASS**。
- 这些结果**只证明测试与工具链在本机当前源码上通过**；不等于 P1 产品 AC 全量完成，不改变：
  - P1：**0 covered / 11 partial / 1 gap（SYNC-005）**、用例 **4 pass / 9 partial / 2 missing**；
  - 全仓：**0 covered / 48 partial / 23 gap**、unimplemented 16。
- 仍未验证：8787 真实模型下全链路、Playwright 普通 E2E、CI 两 job 的本批次结论（见 §6）、部署验证、真实 IME、权限 fail-closed 矩阵。
