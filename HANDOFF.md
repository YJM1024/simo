# HANDOFF · 司墨（simo）下一会话交接

更新时间：2026-11-21（会话域批次 3/4/5 收口）
仓库：`YJM1024/simo`（main）
本文件是**给下一个会话/下一位 Agent 的交接**。先读本文件 → `docs/CONTINUITY.md` → `docs/tasks/STATUS.md` → `docs/product/CONV-CLOSURE.md`。

> **2026-11-24 追加**：本文件主体停在 2026-11-21 的会话域收口口径（"P2–P10 冻结"）。11-23 已开 `CHG-CONV-007`（PRD-CONV-009 会话内任务与编排，18 条 AC 已冻结，前端列做到一半），11-24 该变更把 18 条已签会话域断言打红，主会话 `f9b819e0` 随后因上下文自锁不可用。当前现场、判定、出口选项与恢复入口见 [`docs/plan/INCIDENT-20261124-009-deadlock.md`](docs/plan/INCIDENT-20261124-009-deadlock.md)，在出口裁决之前不要继续写任务域代码，也不要为变绿去改已签断言。

## 1. 产品范围（硬边界）

- **本轮及后续只做会话域（P1：`CONV` + `SYNC`，12 个 PRD）的验收收口。**
- **P2–P10 冻结**：任务/执行、工作台、文件与交付物、记忆、团队、调度、设置、工具/能力、指标、多端同步——不新增功能、不改 AC、不扩范围；会话页面上“非 P1 但可见”的面板只登记边界，不算 P1 覆盖（见 `specs/product/P1-CONV/spec.md` §2.2）。
- `PRD-SYNC-005`（远程访问与通知中心）为 `unimplemented`，仅登记，不计入 P1 验收面。
- 不把“测试通过”写成 PRD `covered`：当前 P1 仍为 **0 covered / 11 partial / 1 gap**，全仓仍为 **0 covered / 48 partial / 23 gap**（71 PRD）。

## 2. 仓库与远程状态

- 本机**没有 `git` CLI**。提交/推送/查 CI 一律用 Node 24（`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）+ GitHub REST API。
- token 从 `E:\dsh_home\workspaces\agent\.git\config` 的 remote URL 读取（`x-access-token:...`）；**不要把 token 写进文件、日志或提交**。
- **不要用 PowerShell `Invoke-RestMethod` 访问 GitHub**（本机 schannel 已损坏），用 Node `fetch`。
- 提交方式：Git Data API（blob → tree（带 `base_tree`）→ commit → `PATCH /refs/heads/main`，`force:false`）；提交前必须先 `GET /git/ref/heads/main` 校验远程 head 未被别人改动，parent 必须是当时 head。
- 本文件所在批次：起点 parent = `1592a90c2e530de04445817916a4b7d052bb7cf0`（`docs: clarify P8 edge coverage wording`）；批次收口提交 `f357c6ae25735abd53f5347753ec05b82533180e`，随后唯一 CI 修复提交 `788f2ace516b66bd809b94e56d19a5c627e3cbc1`（parent = `f357c6a`）；本文件由其后的文档提交收尾，CI 结论见 3.1。

## 3. CI 真实状态（不夸大）

- 最近一次**失败**：run [`44867249776`](https://github.com/YJM1024/simo/actions/runs/44867249776)（head `1592a90`）——Windows job 的 `TestM13PauseAndRunNow` 因 TempDir 文件锁失败。
- 修复：`backend/cmd/simo/m13_test.go` 在 `TestM13PauseAndRunNow` 末尾补 `waitScheduleStatus(..., "done", 15s)`（等调度真正结束再清理临时目录），不改断言语义、不 skip。
- **本批次 push 后的 CI run：见第 3.1 节（以 GitHub Actions 实际结论为准）。**
- `optional docker build`、`optional real-model smoke` 是 optional，可能为 **skipped**——**skipped ≠ 通过**，不得写成“CI 全绿”。
- CI 的 eval 用 mock 模型；不能替代 8787 真实实例验收。

### 3.1 本批次 CI 结论（收口后回写）

- 收口提交：`f357c6ae25735abd53f5347753ec05b82533180e`（parent `1592a90c2e530de04445817916a4b7d052bb7cf0`）；随后唯一测试修复提交：`788f2ace516b66bd809b94e56d19a5c627e3cbc1`（parent `f357c6a`，message `test: allow slow CI reply completion in P1 ws replay case`，只改 `backend/cmd/simo/p1_conv_ws_test.go`：该用例等待上限 8s→60s、用例 ctx 30s→120s，不改断言、不 skip）。
- GitHub Actions run：[`44874959613`](https://github.com/YJM1024/simo/actions/runs/44874959613)（head `788f2ac`，run conclusion **success**）
  - `linux / frontend + backend quality gate`：**success**（06:19:07Z–06:23:25Z）
  - `windows / go + web + mock evals + package`：**success**（06:19:08Z–06:32:47Z，`Pipeline (deploy/ci.ps1)` 与 `Upload portable package`、`Upload CI logs` 均 success）
  - optional docker build / optional real-model smoke：**skipped**（skipped ≠ 通过，不计入“CI 全绿”）
- 失败历史（如实登记）：run [`44871922169`](https://github.com/YJM1024/simo/actions/runs/44871922169)（head `f357c6a`）Linux success、Windows **failure**——`TestP1ConvWSSubscribeReplayAndSinceContinuation` 在 Windows 上 `等待 agent 完成超时`（8s 预算），ci-logs `go-test.log` 显示最后一条 agent 消息正文已完整但 `status:streaming`（落库慢，不是功能失败）；由 `788f2ac` 放宽该用例等待上限后重跑，Windows 转 success，`go-test.log` 为 `ok simo/cmd/simo 312.764s`、其余包全 ok。
- 若与上面不同，以 GitHub Actions 页面为准；本文件的数字只作为登记，不是签字。

## 4. 测试与证据（可复现命令）

工作目录 `E:\dsh_home\workspaces\agent`。所有命令后台静默执行、日志落 `.tmp/`。

```powershell
# 前端（本机沙箱必须 --pool=threads，否则 forks worker 因无权建管道启动失败）
cd frontend
node .\node_modules\vitest\vitest.mjs run --pool=threads --reporter=verbose   # 115/115 PASS
node .\node_modules\typescript\bin\tsc --noEmit                                # exit 0
node .\node_modules\vitest\vitest.mjs run --pool=threads --coverage            # library.tsx 82.83/83.64/84.14/85.88

# 后端（本机无 go 在 PATH，用仓库内工具链包装）
cd backend
..\toolchain\go.ps1 test ./... -count=1                                        # exit 0，16 包 ok，246 顶层测试

# E2E（CDP runner，非 Playwright；mock 后端隔离端口 19230，不是 8787）
cd frontend
node e2e/scripts/cdp-runner.mjs                                               # 19/19 PASS（07 默认 OOS skip）

# 门禁
cd frontend
node ..\scripts\check-sdd.mjs   # PASS
node ..\scripts\check-trace.mjs # PASS
```

- 本批次留档：`docs/testing/CONV-EVIDENCE-20261121.md`（前端/后端/E2E/m13 修复/prepend 修复）。
- E2E 原始产物：`frontend/e2e/report/cdp/run-20261121-131332.log`、`run-20261121-131214.log`（均 19/19）、`results.json`、`summary.md`；审计 `audit-P1-CONV.md`。
- 已知限制：E2E 不是 Playwright Test（`pnpm test:e2e` 的 Playwright 路径在本机沙箱跑不了，CI 也未接线）；E2E 后端是 mock + 临时 `SIMO_HOME`，不是 8787 真实模型数据；覆盖率只统计 `frontend/src/components/library.tsx` 单文件，不是全仓覆盖率。

## 5. P1 当前缺口（下一步优先级）

来源：`docs/product/CONV-CLOSURE.md` §3/§4。按 owner 分：

1. **产品口径（阻塞项）**：搜索语义（标题 vs 消息正文、是否跨会话）；未读口径（SYNC-004 六问）；右栏会话投影是否建独立 PRD；SYNC-005 是否立项（需先有鉴权与通知数据模型）。
2. **前端**：`rename`(`frontend/src/app.tsx:530`) 与 `toggleArchive`(`frontend/src/app.tsx:450`) 无 `try/catch` → 失败静默（CONV-002）；pin 是否纳版。
3. **后端**：`clientMutationId` 幂等去重（CONV-005，当前后端 0 处理）；`since` 保留窗口定义（SYNC-001）；错误信封统一、`finished_at` 成功路径、WS 全局事件流按 session 过滤等契约分歧（已记录未修）。
4. **测试**：断网→重连→`since` 续传 e2e；停止→后端真实中断；“切换后中栏变化”E2E；时间轴点击目标 ≥44px 断言；跨标签 sendMode 单测/降级断言；主会话不可归档断言。
5. **设计/验收**：4 个 COMP（message-colors / timeline-groups / timeline-tip / composer-send-mode）漂移签收。
6. **Lead**：部署验证（“已签未部署”）；真实模型/真实数据长程验收。

## 6. 硬约束（违反即返工）

1. **不能删除/移动任何文件**：清理只能移入 `E:\dsh_home\trash\pending-delete\` 并保留原路径结构；该目录之外一律不执行 `Remove-Item`/`rm`/`del`/`git clean` 等。
2. **Lead 只协调与验收**：实现者自签无效；产品/视觉签字由独立验收 Agent 完成，用户只验收前端效果。
3. **后台静默**：任何服务/测试/构建/浏览器一律后台 job + 日志文件，不得弹黑框前台终端（除非用户明确要求交互）。
4. **诚实汇报**：未跑写未跑；skipped 不算通过；partial 不写 covered；不虚构 CI/测试结果。
5. **不改 P2–P10**；改动只落在会话域与本批次证据/状态文档；提交前校验远程 head，不强推。
6. **文档即事实**：结论必须落盘并提交；聊天里的结论不算数。
