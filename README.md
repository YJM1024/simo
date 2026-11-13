# 你的 Agent（M41 完成态・司墨）

> **现状**：本地 Web 应用（Go 单体 + 内嵌 React 前端 + WebSocket + SQLite），**一位司墨 + 一套记忆 + 一段连续对话**。
> 数据默认落在 `%USERPROFILE%\.simo`（`SIMO_HOME`），**只监听本机 `127.0.0.1:8787`**，无鉴权。
> 里程碑：**V1（M1–M7）/V1.1（M1–M13）已交付；M14–M20/UI-1 accepted；M21–M41 已上线**；**默认真实模型**（离线体验用 `-model mock`）。
> 交付二进制名为 **`simo.exe`**（司墨）；内部 Go module 仍叫 `simo`（源码目录已统一到 `backend/`，不影响使用）。
> **目录已拆分**：前端全部在 `frontend/`，可整体交给外部优化；后端全部在 `backend/`。
> **历史数据自动迁移**：旧路径/旧数据库首次启动自动迁移到 `SIMO_HOME`/`simo.db`，**不删旧数据**。

## 30 秒启动

```powershell
cd backend
# 默认真实模型：先按 docs/admin-guide.md 配好 Key
.\simo.exe serve
```

浏览器打开 **http://127.0.0.1:8787**。

- **默认 `real`**：DeepSeek `deepseek-flash`，启动需要 API Key（没有会启动失败）；
- **离线体验**：`.\simo.exe serve -model mock`（不联网、无需 Key、确定性）；
- 停止：`Ctrl+C`；数据不丢，下次启动继续。

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/user-guide.md`](docs/user-guide.md) | 使用手册：三栏、连续对话、任务/工作流、会话工作台、生成文件、联网、定时任务、权限审批、记忆/团队/视图、UI-1/UI-2 |
| [`docs/admin-guide.md`](docs/admin-guide.md) | 管理员指南：配置、Key、低 token、Chrome/Python、`SIMO_HOME`、stats/agents/owner、M18–M40 迁移、CI/容器/Docker、定时任务、备份迁移、故障排查 |
| [`docs/release-notes-v1.md`](docs/release-notes-v1.md) | 当前能力、M1–M41 + UI-1/UI-2、测试证据、默认模型、已知限制、P1 |
| [`docs/m21-memory-contract.md`](docs/m21-memory-contract.md) / [`docs/m22-recall-contract.md`](docs/m22-recall-contract.md) | 记忆 v0.3 / 召回层契约 |
| [`docs/team-contract.md`](docs/team-contract.md) | 团队 V0/V1/V2 实现契约 |
| [`docs/m24-view-contract.md`](docs/m24-view-contract.md) | 视图 Schema 契约 |
| [`docs/m23-ui2-contract.md`](docs/m23-ui2-contract.md) | UI-2 深度件实现契约（轨迹/卡片/计划/模型/压缩/通知） |
| [`deploy/INSTALL.md`](deploy/INSTALL.md) | 便携包安装/升级/备份恢复（M29） |
| [`deploy/CI.md`](deploy/CI.md) / [`deploy/CONTAINER.md`](deploy/CONTAINER.md) / [`deploy/DOCKER-INSTALL.md`](deploy/DOCKER-INSTALL.md) | CI / 容器 / Docker 安装（M35/M36） |
| [`docs/m41-card-contract.md`](docs/m41-card-contract.md) | M41 交互卡片契约（发送/双路由/状态机/幂等/版本/WS/重启） |
| [`docs/visual-language.md`](docs/visual-language.md) | 视觉语言规范（M39/M40） |
| [`docs/tech-stack.md`](docs/tech-stack.md) | 技术栈与运行拓扑（开发参考） |

## 能做什么（当前：M21–M41 已上线）

- **连续对话**：随时发消息、即时回应；**发消息不打断后台工作**，只有显式"停掉/别做/改成…"才调整；
- **任务与工作流**：一次需求拆成多个任务，按依赖自动推进；**每个任务完成都单独汇报**；支持暂停/恢复/取消；
- **顶部选项卡 + 三栏**：顶部对话/工作台/任务·定时任务/智能体/团队/记忆；左会话树、中间会话（对话/轨迹/文件）、右栏任务/概览细竖条（可收起/固定/拖拽）；M40 视觉重构（统一组件、正文≥13px、线性图标）；
- **会话工作台**：文件选项卡（产物/附件聚合、预览/下载）、32px 消息时间轴点击跳转、右栏只读会话概览（最多 6 条/另有 N 项）；
- **文件生成**：PDF / Word / Excel / PPT / 图片（需本机 Chrome/Edge 与 Python 文档库）；
- **Python 执行（M17）**：`run_python` 支持代码/workspace 脚本、参数、超时；需审批，环境不继承 Key；
- **联网**：搜索/抓取（审批 + 内网/本机地址拦截 + 来源链接）；
- **权限与工具**：只读/工作区可写/完全访问；read/glob/grep/write/edit/pwsh/run_python；允许一次/本会话允许/拒绝；单次提权；
- **任务/定时任务**：顶部「任务/定时任务」视图；一次/间隔/每天/每周/cron，启停/立即运行；
- **记忆（M21）**：只读记忆浏览器（搜索/类型/实体/冲突/智能体记忆/金字塔）；修改通过对话；
- **召回（M22/M27/M32）**：实体召回 + 关系下钻 + R2 2 跳/agentic 召回循环（内部能力/`-debug` 入口；`SIMO_RECALL_R2=0` 可退 R1）；可选 `SIMO_RECALL_VECTOR=1` 启用本地字符 n-gram TF-IDF 向量并与关键词/图谱融合（默认关）；
- **记忆巩固（M30）**：稳定事实/偏好/规范自动写回 + 冲突保留 + 写回审计（`-debug` 可手动触发；`SIMO_MEMORY_CONSOLIDATE=0` 关闭）；
- **团队（V0/M24/M25/M31/M33）**：V0 子任务=子智能体、互不对话；V1/V2 团队页只读（成员=下级会话/状态/进入成员会话/模板）；支持成员筛选/搜索；M31 起 `team.*` 事件进用户 WS（仅状态/摘要）；
- **视图（M26/M28/M33/M34）**：对话生成自定义页面、13 类块、版本回滚；M28 受控编辑器；M33 表单校验/排序分页/失败保留/搜索删除确认；M34 多步向导/多列排序/行内编辑/批量/图表/看板 WIP 泳道/`$row` 联动；
- **交互卡片（M41）**：消息内联卡片（复用 13 块/动作目录，fallbackText 兜底）、route=agent/action 两种交互、幂等提交、版本+WS `card.updated`、R4 不可绕过、重启持久；
- **CI / 容器（M35/M36）**：`deploy/ci.ps1` + GitHub Actions；`deploy/CONTAINER.md`/`docker-build.ps1`；Docker 安装见 `deploy/DOCKER-INSTALL.md`；
- **便携包（M29）**：package/install/upgrade/backup/restore 脚本；详见 [`deploy/INSTALL.md`](deploy/INSTALL.md)（部分步骤未完整实测）；
- **归档**：只读可恢复，不删数据；
- **富文本 + 上传**：Markdown 消息、文件上传（≤20MiB/条 ≤5 个）；
- **UI-1**：命令面板（`Ctrl/⌘+K`）、斜杠命令、@ 引用、消息复制/引用/重试、会话搜索/置顶、交付物卡片、用量统计（树状表格 + sparkline）、设置中心、首启引导；
- **UI-2（后端未就绪项会降级说明）**：对话/轨迹切换、工具调用卡片、计划与待办、模型/推理偏好、压缩可视化、通知中心；
- **主题**：浅色科技风 `light-tech`（256 主题属 P1）。

## 技术形态

```
浏览器 ──HTTP/WebSocket──▶ simo（Go 单体，单实例）
                             ├── REST /api/*
                             ├── WebSocket /api/ws（流式）
                             ├── SQLite（SIMO_HOME/simo.db）
                             ├── artifacts/ 产物与生成文件
                             ├── workspace/ 工具工作区 + uploads/
                             └── tmp/ 生成过程临时文件
```

- 单二进制：前端资源由 `//go:embed` 内嵌，运行时不需要 Node；
- 单实例：同一 `SIMO_HOME` 只允许一个进程（文件锁）；
- 单写者：所有写经单一入口串行化，事件先落库再推送；
- 真实模型：DeepSeek `deepseek-flash`（其他 provider 未接入）。

## 外部依赖（按需）

| 能力 | 依赖 |
|---|---|
| 日常对话/任务/定时任务 | 无额外依赖（真实模型需 API Key） |
| 生成 PDF | 本机 Chrome 或 Edge（headless） |
| 生成 Word/Excel/PPT/图片 | 可用的 Python 3 + python-docx/openpyxl/python-pptx/Pillow（helper 已内嵌；Python 需可用） |
| Python 执行（`run_python`） | 可用的 Python 3；可用 `SIMO_PYTHON` 或配置 `tools.python` 指定；需审批 |

未安装时相关工具会返回明确错误，不影响其他功能。

## 关键环境变量（M27–M33）

- `SIMO_RECALL_R2`：默认开；`0/false/off/v1/r1` 回退 R1；
- `SIMO_RECALL_VECTOR`：默认关；`1/true/on/yes` 启用本地字符 n-gram TF-IDF 向量（与关键词/图谱融合；无需外部服务）；
- `SIMO_MEMORY_CONSOLIDATE`：默认开；`0/false/off/no` 关闭自动巩固；
- `SIMO_MEMORY_CONSOLIDATE_THRESHOLD`：默认 8；`SIMO_MEMORY_CONSOLIDATE_INTERVAL_SEC`：默认 300；
- `SIMO_MEMORY_V3`：默认开；`0/false/off/v2` 回退旧记忆读路径；
- 并发/执行者：`SIMO_MAX_CONCURRENCY`、`SIMO_WORKFLOW_CONCURRENCY`（默认 3）、`SIMO_TASK_EXECUTOR`（`task-npc`/`simo`）；
- 完整配置见 [`docs/admin-guide.md`](docs/admin-guide.md) §3.2。

## 从源码构建

前置（仅开发/构建需要）：

- Go 1.27（仓库自带 `toolchain/`，可用 `.\toolchain\go.ps1`）；
- Node 20+ 与 pnpm（前端构建/评测）。

```powershell
# 前端：全部在 frontend/；构建产物输出到 frontend/dist/
cd frontend
pnpm install
node build.mjs

# 把前端产物复制到后端 embed 目录（Go embed 只读这里）
Copy-Item .\dist\* ..\backend\internal\webui\dist\ -Recurse -Force

# 后端：全部在 backend/（Go module 仍叫 simo）
cd ..\backend
..\toolchain\go.ps1 build -o simo.exe ./cmd/simo
..\toolchain\go.ps1 test ./...
```

> 前端代码统一在 [`frontend/`](frontend/README.md)，可整体交给外部（如 ChatGPT）优化；后端代码与接口在 [`backend/`](backend/README.md)。构建顺序是 `frontend` → 复制 `frontend/dist/` 到 `backend/internal/webui/dist/` → 编译 `backend`。

> 发布包应包含构建好的 `simo.exe`；从源码构建时用上面的命令生成。旧版二进制可被 `start.ps1` 兼容启动。
> 最终便携包：`deploy/dist/simo-M41-win-x64.zip`（≈11.61 MB，SHA256 `6b62bf3c2a52baf97fd51017dc0e07e212ca5b5d2219ce26b66af45c421b9753`；包内 exe `4905F6C7C932021EF5EC548C0D14093795617E3BEF6ADE4373412EB8C2D89421`）；安装/升级/备份恢复见 [`deploy/INSTALL.md`](deploy/INSTALL.md)。

## 验证与门禁

- **evals**：当前共 **144 条 case（M1–M41）**；最终通过数/分层结果**见 [`evals/RELEASE.md`](evals/RELEASE.md) 终值**（本文不预写未定数字）；
- **后端**：`go vet`、`go test ./...`（环境支持时加 `-race`）；
- **前端**：`tsc --noEmit`、模块度/硬编码颜色扫描、UI-1/UI-2 纯逻辑自测、M21/M24/M26 门禁脚本 + 构建；
- **运行**：独立端口 + 独立 `SIMO_HOME`，mock 模式确定性；真实模型 smoke 单独可选。

## 目录

```
agent/
├── frontend/   React 19 + TypeScript + Tailwind v4 前端源码（产物 frontend/dist/，可外部优化）
├── backend/    Go 单体后端（cmd / internal / 内嵌前端 dist）
├── docs/       用户手册 / 管理员指南 / 发布说明 / 技术栈 / 契约
├── design/     设计文档（10 设计对话记录、12 记忆、13 交互、14 总体、15 路线图…）
├── evals/      评测（mock 套件 + real-smoke + release-smoke）
├── deploy/     容器交付物（Dockerfile / compose；**本机无 Docker，未实测**）
├── toolchain/  自包含 Go 工具链
├── archive/    归档：research / labs / prototype-v3 / 旧设计稿（见 archive/README.md）
└── harness/    DSH 机制地图（参考）
```

## 安全与边界

- **无鉴权、仅本机**：默认只监听 `127.0.0.1:8787`；不要直接暴露到局域网/公网；
- 不要把 API Key 写进代码/文档/聊天；配置方式见管理员指南；
- 工具执行有沙盒模式与审批（默认工作区可写 + 自动审批：只读自动、写/执行/联网询问）；
- 容器交付物**未经验证**，不要当作已交付能力使用；
- 团队/记忆/视图页主要只读；M31 起 `team.*` 进用户 WS（仅状态/摘要）；M28 视图编辑器只接受结构化白名单字段，不支持任意 schema/HTML；
- 其他限制（向量召回默认关、无事件触发、Office 不在线预览、256 主题 P1、召回主要走 debug 入口等）见 [`docs/release-notes-v1.md`](docs/release-notes-v1.md)；
- M34–M40：视图复杂交互/CI/容器/顶部导航/右栏/视觉重构已上线；容器与 Docker 本机未实测；M41 最终便携包 `deploy/dist/simo-M41-win-x64.zip`（≈11.61 MB，SHA256 `6b62bf3c2a52baf97fd51017dc0e07e212ca5b5d2219ce26b66af45c421b9753`；包内 exe `4905F6C7C932021EF5EC548C0D14093795617E3BEF6ADE4373412EB8C2D89421`）；最终构建 `backend/simo.exe` 2026-11-09 00:20:56（22,002,688 B），前端 `app.js` 675,939 B；
- 事故留档见 [`evals/incident/incident-2026-11-08.md`](evals/incident/incident-2026-11-08.md)（已止损/归档，仓库与应用数据未受影响）。
