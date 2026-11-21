# simo 前端 E2E（Playwright + 系统 Chrome）

本目录是独立的前端端到端测试包，**不修改** `frontend/` 的单测、构建配置或源码。测试自起一套隔离的 simo 栈（mock 模型、独立端口、空数据目录），用真实浏览器走关键用户路径。

## 1. 快速开始

前置：

- Windows（当前只支持 Windows 路径与系统 Chrome）
- Node.js 24+（本仓库运行时自带 Node，见下方“无全局 node 时”）
- pnpm 11+
- 系统 Chrome：默认 `C:\Program Files\Google\Chrome\Application\chrome.exe`（可用 `E2E_CHROME` 覆盖）
- 已构建的 simo 后端可执行文件（默认 `backend\simo-live-composer.exe`，可用 `E2E_BACKEND_EXE` 覆盖）

安装依赖（首次或 lockfile 变化）：

```powershell
cd frontend\e2e
pnpm install --node-linker=hoisted --ignore-scripts --store-dir ..\..\.pnpm-store
```

运行：

```powershell
# 在 frontend 目录（已接入根包 scripts）
pnpm test:e2e

# 或在 frontend\e2e 目录
pnpm test:e2e

# 只验证栈/种子/任务/审批/交付物链路，不启动浏览器
pnpm test:e2e:preflight
```

### 受限终端：连接外部 CDP 的 fork-free runner

如果终端无法 fork Playwright worker（`spawn EPERM`），但环境里已有可用的 headless Chrome DevTools 端点，用：

```powershell
# 默认连接 http://127.0.0.1:9223，后端端口 19230
pnpm test:e2e:cdp

# 自定义 CDP/后端端口
$env:E2E_CDP_URL = 'http://127.0.0.1:9223'
$env:E2E_CDP_PORT = '19230'
pnpm test:e2e:cdp
```

该 runner 不 fork worker、不启动 Chrome，只 `chromium.connectOverCDP()`，执行真实浏览器断言：`specs/01..06` 的会话场景（01a/01b、02、03、04a–04d、05、06）加 P1-CONV 缺口场景 08–16。`specs/07`（工作台交付物下载）属 **P2 冻结范围**，runner 里注册为 out-of-scope，默认跳过、报告标 `SKIPPED (OOS)`，只有显式 `E2E_INCLUDE_OOS=1` 才执行。失败截图与结果在 `frontend\e2e\report\cdp\`。它不跳过范围内的用例、不放宽期望。

> 本环境实测（2026-11-21）：`pnpm test:e2e:cdp` → **19/19 范围内场景 PASS（07 OOS skipped）**，最终 `exit code 0`；报告 `frontend\e2e\report\cdp\summary.md`、`results.json`、`run-20261121-*.log`。此前 2026-11-20 同一 runner 为 11/11（当时 07 仍在范围内）。

正常 Windows/CI 仍应使用 `pnpm test:e2e`（Playwright Test）；CDP runner 是受限终端下的等价执行通道，本身不是 Playwright Test，也不能替代后者的 HTML 报告/trace。

无全局 node 时（本仓库受限会话常见）：

```powershell
$env:PATH = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;' + $env:PATH
cd frontend
pnpm test:e2e
```

报告：

- HTML：`frontend\e2e\report\html\index.html`
- JSON：`frontend\e2e\report\results.json`
- 失败截图/trace：`frontend\e2e\report\test-results\`
- 栈日志：`.tmp\e2e-run-<GUID>\api.log`

## 2. 隔离模型（可重复、不碰 live）

- **固定端口 19201**（可用 `E2E_API_PORT` 覆盖），明确禁止 8787（live 实例）。
- 每次运行使用工作区 `.tmp\e2e-run-<GUID>` 下的**空 SIMO_HOME**，所有测试数据都由用例通过后端 HTTP API 现场 seed；不依赖 `data/`、不依赖人工。
- 运行锁 `frontend\e2e\.state\run.lock`：同一端口同时只允许一个 E2E 运行；如果上一次异常退出，锁里的进程已死，会自动接管并清理旧栈。
- 端口占用时直接报错并提示，不会静默杀掉别的进程。
- teardown 只在确认后端进程退出后删除 run 目录；进程未退出（或 `E2E_KEEP_STACK=1`）则保留现场供排查。
- 后端以文件 stdio 启动（`api.log`），不依赖命名管道；这是当前 DSH 沙箱下唯一可用的子进程启动方式。

## 3. 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `E2E_API_PORT` | `19201` | 后端/前端同源端口 |
| `E2E_BACKEND_EXE` | 自动探测 | 指定 simo 可执行文件 |
| `E2E_CHROME` | 系统 Chrome | 浏览器可执行文件 |
| `E2E_SEED_HOME` | 空 | 指定种子数据目录；设置后复制其 `simo.db`（去掉 WAL/SHM/lock），否则用空 home |
| `E2E_KEEP_STACK` | 未设置 | `1` 时测试结束保留后端，便于手工复现 |
| `E2E_BASE_URL` | `http://127.0.0.1:19201` | 前端 baseURL（一般不用改） |
| `E2E_CDP_URL` | `http://127.0.0.1:9223` | `test:e2e:cdp` 连接的 Chrome DevTools 端点 |
| `E2E_CDP_PORT` | `19230` | `test:e2e:cdp` 自起后端的端口（与 19201 隔离） |
| `E2E_INCLUDE_OOS` | 未设置 | `1` 时 CDP runner 也执行范围外（P2 冻结）的 07 交付物下载场景 |

## 4. 用例清单

### 4.1 Playwright Test（`specs/`）：16 条 / 7 文件

| 文件 | 用例 | 覆盖 |
|---|---|---|
| `01-session-load.spec.ts` | 2 | 首屏加载会话/消息/时间轴/右栏；375 宽度无横向溢出、时间轴隐藏、侧栏隐藏 |
| `02-chat-stream.spec.ts` | 1 | Enter 发送；WS `reply.delta`/`reply.done`；mock 回复渲染；无 composer 错误、无 console error |
| `03-composer-keyboard.spec.ts` | 1 | Enter 发送、Shift+Enter 换行；反转模式行为互换 |
| `04-fe007-ancestor.spec.ts` | 4 | 逐级加载上级、时间轴组增长、opacity 0.55、prepend 锚定 ≤1px、切会话清链；413；403；空上级提示且可继续向上 |
| `05-error-retry.spec.ts` | 1 | 消息接口目标会话全部 500 时显示错误态；恢复后重试成功 |
| `06-task-locate.spec.ts` | 1 | API 确认任务完成且 projection 含任务；右栏任务点击后定位并高亮消息 |
| `07-download.spec.ts` | 1 | mock:write → 审批 allow → 交付物；右栏与工作台可见；真实下载事件、文件名与内容 `TODO\n` 校验（工作台属 P2 冻结域，仅作回归参考） |

### 4.2 CDP runner（`scripts/cdp-runner.mjs`）：P1-CONV 19 条在范围内 + 1 条 OOS

范围 = `specs/01..06` 的 10 条（01a/01b、02、03、04a–04d、05、06）+ 下表 08–16 的 9 条缺口场景，共 19 条；07 注册为 `{ oos: true }`，默认跳过并标 `SKIPPED (OOS)`。

| 场景 | 覆盖（PRD / TC） |
|---|---|
| 01a | PRD-CONV-001/004，TC-P1-004：消息、时间轴、右栏 |
| 01b | PRD-CONV-004 + 全局 A4：375px 无横向溢出、时间轴/侧栏隐藏 |
| 02 | PRD-CONV-004/005/SYNC-001，TC-P1-006：Enter 发送、WS 流式、无 console error |
| 03 | PRD-CONV-006 + A3：Enter/Shift+Enter、反转模式 |
| 04a–04d | PRD-CONV-007，TC-P1-005：逐级加载、prepend 锚定、413/403/空上级 |
| 05 | PRD-CONV-004 + 全局 A2/E2：500 错误态与重试恢复 |
| 06 | PRD-CONV-004 + 任务定位回归（P2 域只读引用，不新增断言面） |
| 08 | PRD-CONV-002 创建（懒草稿→首条消息物化）+ 004 空态 |
| 09 | PRD-CONV-002 重命名：空值不提交、Escape 取消、Enter/blur 提交并持久化 |
| 10 | PRD-CONV-002 归档/恢复：默认隐藏、显示归档、只读（badge/输入框禁用）、恢复后可发送 |
| 11 | PRD-CONV-001/002：会话切换、消息隔离、时间轴只含当前会话 |
| 12 | PRD-CONV-004：长会话滚动、回到底部、时间轴跳转与当前项 |
| 13 | PRD-CONV-SYNC-002/003：多标签 active 会话跟随、跨标签 WS 实时消息、发送模式同步 |
| 14 | PRD-CONV-003：标题命中、正文命中（服务端 search）、无匹配空态 |
| 15 | 全局 A2/E2：会话列表加载失败错误态与重试/刷新恢复 |
| 16 | PRD-CONV-005 + 全局 A5：发送失败可见错误、不假落库、恢复后重发成功 |


## 5. 架构

```
frontend/e2e
├─ playwright.config.ts       # testDir=specs，固定 baseURL，系统 Chrome
├─ specs/                     # 业务用例
├─ support/
│  ├─ global-setup.ts         # startStack()
│  ├─ global-teardown.ts      # stopStack()
│  ├─ stack.ts                # 端口/锁/空 home/后端进程/清理
│  ├─ api.ts                  # HTTP seed、轮询（任务/projection/审批/交付物）
│  ├─ ui.ts                   # 页面操作、锚定测量、溢出断言
│  └─ paths.ts                # 路径常量
├─ scripts/preflight.mjs      # 不启动浏览器的全链路冒烟
├─ scripts/cdp-runner.mjs     # fork-free：connectOverCDP + P1-CONV 19 场景（07 为 OOS 默认跳过）
└─ scripts/cdp-probe.mjs      # CDP 可用性探测
```

## 6. 已知限制

- **`pnpm test:e2e`（Playwright Test）需要普通 Windows 桌面或 CI**：受限 DSH 会话里 worker 以命名管道 fork 会被拒绝（`Error: spawn EPERM at WorkerHost.startRunner`）。本仓库里受限会话可用 `pnpm test:e2e:cdp`（连接外部 headless Chrome CDP，真实浏览器断言，19/19 范围内场景实测通过），但它不等同于 Playwright Test runner；CI 仍跑 `test:e2e`。
- 直接在本受限会话启动 Chrome 仍会失败（Mojo/Crashpad 命名管道 `拒绝访问 (0x5)`）；`test:e2e:cdp` 依赖环境预先提供的 CDP 端点，不自行启动浏览器。
- 前端使用 `frontend\dist` 的预构建产物（由 `frontend\build.mjs` 生成），测试不自动构建；源码改动后先执行 `pnpm --dir frontend build`（或 `deploy\ci.ps1`）。
- 375 宽度下侧栏隐藏，只覆盖默认 main 页；深层会话/工作台导航在桌面宽度覆盖。
- Chrome 使用系统安装，不下载 Playwright 浏览器；不同机器的 Chrome 版本可能带来细微渲染差异。
- 测试只针对 mock 模型；真实模型的行为/时延不在 E2E 范围内（mock 结果不能用来声明 8787 真实模型已通过）。
- **消息正文搜索只覆盖默认会话 `main`**：前端 `searchMessages(q)` 不带 sessionId，后端 `handleMessageSearch` 只查该会话的消息；因此 14 号场景只断言 main 正文命中，跨会话正文搜索是已知产品缺口，不在 E2E 里假装覆盖。
- **未覆盖（如实列出）**：SYNC-001 的 WS 断线重连与 `reply` replay；SYNC-004 未读/已读游标的跨标签一致（多标签场景只覆盖 active 会话、实时消息、发送模式）；会话搜索的未读角标；`specs/07` 工作台交付物下载（P2 冻结，默认不跑）。

## 7. CI

`.github/workflows/e2e.yml` 会在 push/PR（`frontend/**`、`backend/**`、`deploy/ci.ps1` 变更）或手动触发时：

1. `deploy\ci.ps1 -SkipEvals -SkipPackage -SkipDocker` 构建前端 + `simo.exe`；
2. 把构建出的 exe 通过 `E2E_BACKEND_EXE` 传给 E2E；
3. 运行 `pnpm --dir frontend test:e2e`；
4. 上传 `frontend/e2e/report` 与 `.tmp/e2e-run-*/api.log`。

> 该 workflow 尚未在本机或 GitHub Actions 实跑验证（本机无 git/远程权限、受限会话不能跑浏览器）；首次启用后请检查日志与 artifact。

## 8. 排障

1. `另一个 E2E 运行正在进行`：等待或确认旧 runner 已退出；必要时删除 `.state\run.lock`（先确认没有进程占用）。
2. 端口被占用：设置 `E2E_API_PORT` 换端口，或停掉占用进程；不要杀 8787。
3. 后端启动失败：看 `.tmp\e2e-run-*\api.log`；常见原因是 `E2E_BACKEND_EXE` 指向不存在的文件。
4. `spawn EPERM` / Chrome 崩溃 0x5：说明是受限终端。用环境已有的 CDP 跑 `pnpm test:e2e:cdp`，或换正常 Windows/CI 跑 `pnpm test:e2e`。
5. 下载用例失败：确认 `seedDeliverable` 的审批 allow 成功，且后端 `deliverableStoragePredicate` 存储有效。
