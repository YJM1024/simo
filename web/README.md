# web —— agentd 前端（M1–M41 + UI-1/UI-2）

React 19 + **TypeScript 7**（`.tsx`，strict）+ **Tailwind CSS v4**（CSS-first `@theme inline`）+ esbuild。
产物输出到 `agentd/internal/webui/dist/{index.html,app.js,app.css}`，由 Go `embed.FS` 内嵌。

> 后端交付二进制为 **`simo.exe`**（司墨）；内部 Go module 仍叫 `agentd`，不影响前端构建或使用。
> 技术栈唯一真相：`docs/tech-stack.md`；接口契约：`docs/m1-contract.md`（M1）、`docs/m2-contract.md`（M2）、`docs/m3-contract.md`（M3），M4–M13 见后端 README 与本文各段。
> 前端已实现 M2–M40 + UI-1/UI-2：会话树/聚合、撤回/并行任务、记忆浏览器（M21）、任务阶段/产物/审批、归档/跨会话产物、通知/三速反馈/可访问性、富文本/上传、权限体验、工作流/逐任务汇报、会话工作台、定时任务、智能体/负责人头像、命令面板/斜杠/@/消息操作/搜索置顶/交付物/设置/首启/用量统计、轨迹/工具卡片/计划待办/模型偏好/压缩/通知中心、团队页（M24/M25）、视图 Schema/编辑器/复杂交互（M26/M28/M33/M34）、顶部选项卡（M37）、右栏任务/概览与三栏拖拽（M38）、视觉重构组件层（M39/M40）；后端未就绪项按契约降级。
> 评测：`evals` 当前 **144 条（M1–M41）**；最终通过数/分层结果见 `evals/RELEASE.md` 终值。前端门禁见各段 `check-*` 脚本与 §27。
> 环境变量（召回 R2/向量、记忆巩固、并发等）见 `docs/admin-guide.md` §3.2；便携包安装/升级/备份恢复见 [`deploy/INSTALL.md`](../deploy/INSTALL.md)（M29；部分步骤未完整实测）；最终包 `deploy/dist/simo-M41-win-x64.zip`（≈11.61 MB，SHA256 `6b62bf3c2a52baf97fd51017dc0e07e212ca5b5d2219ce26b66af45c421b9753`；前端 app.js 675,939 B）。

## 1. 目录与分层（契约 §9.2）

```
web/
├── build.mjs                 # 三步构建：tsc --noEmit → tailwind CLI → esbuild
├── tsconfig.json             # strict；include src
├── scripts/check-modularity.mjs
├── public/index.html         # 引用 /app.css 与 /app.js
└── src/
    ├── main.tsx              # 入口：先 initTheme()，再挂载 <App/>
    ├── styles.css            # Tailwind 入口：语义 token + @theme inline + base/utility
    ├── app/                  # 壳：布局、三栏骨架、顶栏、状态订阅
    │   ├── App.tsx           #   只从 features/registry.ts 取 slot，不 import 具体 feature
    │   ├── TopBar.tsx
    │   └── useWorkspaceStatus.ts
    ├── platform/             # 基础设施（无业务）
    │   ├── http.ts           #   REST 客户端（fetch）
    │   ├── ws.ts             #   WebSocket 客户端（重连/退避/since 续接）
    │   ├── events.ts         #   跨 feature 事件总线（唯一跨模块通信方式）
    │   ├── router.ts         #   ?session= 读写（无路由库）
    │   ├── storage.ts        #   localStorage 安全封装
    │   ├── types.ts          #   线格式类型 + 运行时守卫
    │   ├── manifest.ts       #   feature 契约类型（FeatureManifest / slots / services）
    │   └── theme/theme.ts    #   主题接口（data-theme + localStorage）
    └── features/             # 业务功能，每个目录自包含
        ├── registry.ts       #   ★ 唯一功能清单：加/删功能改这里一行
        ├── sessions/         #   左栏：会话树（含子会话/归档）
        ├── chat/             #   中栏：消息流 + 输入 + WS 流式
        └── tasks/            #   右栏：长任务/阶段/产物/审批
```

**硬规则**

1. `features/<A>` 不得 import `features/<B>`；只能依赖 `platform/`。
2. `features/*` 不得 import `app/`（壳层只通过 registry 组合 feature）。
3. 跨 feature 通信只走 `platform/events.ts` 的具名事件（当前：`session:active`、`chat:status`）。
4. 组件禁止硬编码颜色：颜色只能出现在 `src/styles.css` 的 token 定义里。
5. 构建前必须 `tsc --noEmit` 通过（esbuild 只转译不查类型）。

## 2. 构建

```powershell
cd web
# 依赖（Node 20+；pnpm 可用 corepack 或全局安装）
pnpm install

node build.mjs            # 三步：tsc --noEmit → tailwind → esbuild
node build.mjs --watch    # 三者 watch
```

可选质量门：

```powershell
node scripts\check-modularity.mjs   # 模块度 + 硬编码颜色
node_modules\.bin\tsc --noEmit      # 纯类型检查
```

> 注意：`pnpm install` 结尾可能报 `ERR_PNPM_IGNORED_BUILDS`（`@parcel/watcher`、`esbuild` 的
> build script 被忽略）。这是 pnpm 的默认安全策略，不影响本构建：esbuild 二进制已随包提供，
> Tailwind watch 使用 `--poll` 轮询而不依赖 `@parcel/watcher`。

产物：

| 文件 | 说明 |
|---|---|
| `agentd/internal/webui/dist/app.css` | Tailwind CLI 输出（--minify） | 当前构建约 42 KB |
| `agentd/internal/webui/dist/app.js` | esbuild 打包（ESM，minify） | 当前构建约 536 KB |
| `agentd/internal/webui/dist/index.html` | 从 `public/` 复制 | 约 0.5 KB |

> 体积随源码/依赖变化；以构建后文件为准。构建同时复制 `icon.svg`（约 1 KB）与 `icon-256.png`（约 3 KB）。

## 3. WebSocket 客户端（契约 §3.2）

- 连接 `/api/ws?sessionId=<id>[&since=<eventId>]`（http→ws、https→wss 自动切换）。
- 连上先发 `{type:'subscribe', data:{sessionId, since?}}`；收 `{type, data}` 帧。
- 断线指数退避重连：**1s → 2s → 4s … 上限 30s**；重连时带 `since`（上次事件 id）。
- 去重在功能层：事件 id 单调递增去重 + 消息 id upsert；收到未知消息的 `message.delta`
  时静默拉一次 `GET /api/messages` 补齐（断线窗口自愈）。
- 发送优先走 WS `{type:'chat', data:{sessionId, text}}`；连接未就绪时退回
  `POST /api/chat`（契约允许二选一；**不保留 SSE**）。
- 心跳由服务端 ping 处理，客户端不需要自己发。

## 4. 主题与 token（P1 支持 256 套）

`src/styles.css` 分三层：

1. **token 值**：`:root, [data-theme='light-tech'] { --canvas / --surface / --ink / --accent … }`
2. **Tailwind 映射**：`@theme inline { --color-surface: var(--surface); … }`（类名契约，主题不覆盖）
3. **主题覆盖区**：文件末尾注释模板 `[data-theme='<name>'] { … }`

语义 token 清单（组件只允许用它们的 Tailwind 类）：

| 类别 | token（原始变量 → 类名） |
|---|---|
| 表面 | `--canvas`(bg-canvas) `--surface`(bg-surface) `--surface-solid` `--surface-sunken` `--scrim` `--glass`(bg-glass) `--glass-border` `--glass-blur`(backdrop-blur-glass) |
| 文字 | `--ink`(text-ink) `--ink-secondary`(text-ink-secondary) `--ink-muted`(text-muted) `--ink-inverse` |
| 边框 | `--border`(border-border) `--border-subtle` |
| 强调 | `--accent` `--accent-hover` `--accent-ink` `--accent-soft` `--accent-border` `--accent-gradient`(accent-gradient) |
| 消息 | `--message`(bg-message) `--message-border` `--message-user` `--message-user-border` `--message-system` `--message-system-border` |
| 状态 | `--ok / --ok-ink / --ok-soft / --ok-border`；`--warn*`；`--danger*` |
| 字体 | `--ff-sans`(font-sans) `--ff-mono`(font-mono) `--fs-2xs…2xl`(text-2xs…2xl) |
| 间距 | `--sp-base`(4px) → Tailwind spacing 基准（`p-4` = 16px） |
| 圆角 | `--r-xs…xl / --r-pill`(rounded-pill) |
| 阴影 | `--sh-sm/md/lg/focus/accent`(shadow-sm/md/lg/focus/accent) |
| 动效 | `--mo-fast/base/slow`(duration-fast/base/slow) `--mo-ease-*`(ease-*)；`--animate-*`(animate-brand-pulse/msg-in/cursor-blink/thinking-bounce/skeleton-shimmer) |
| 布局 | `--layout-left / --layout-left-compact / --layout-right / --bubble-max / --composer-max-h` |

**新增一套主题（3 步，组件零改动）**

1. `src/styles.css` 的「主题覆盖区」加：
   ```css
   [data-theme='dark-tech'] {
     color-scheme: dark;
     --canvas: #0b1220;
     --surface: rgba(17, 25, 40, 0.86);
     --ink: #e8eefc;
     --accent: #22d3ee;
     /* 其余 token 不写则继承 light-tech */
   }
   ```
2. `src/platform/theme/theme.ts` 的 `THEME_META` 加一行：`'dark-tech': { label: '深色科技', colorScheme: 'dark' }`。
3. 切换：`setTheme('dark-tech')`（写入 `data-theme` + localStorage）。M1 没有切换 UI，接口先就位。

## 5. 如何新增一个 feature

以「右侧新增一个 `memory` 面板」为例，**只动 feature 目录 + registry 一行**：

1. 建目录 `src/features/memory/`，写组件 `MemoryPanel.tsx`（只能用 Tailwind 语义类）：
   ```tsx
   export default function MemoryPanel() {
     return (
       <aside className="flex h-full min-h-0 flex-col border-l border-border-subtle bg-surface p-3">
         <h2 className="m-0 text-md font-semibold">记忆</h2>
         <p className="m-0 mt-2 text-sm text-muted">只读（M2）</p>
       </aside>
     )
   }
   ```
2. 写 manifest（`src/features/memory/manifest.ts`）：
   ```ts
   import { defineFeature } from '../../platform/manifest.ts'
   import MemoryPanel from './MemoryPanel.tsx'

   export const manifest = defineFeature({
     id: 'memory',
     slots: { rightPanel: MemoryPanel },      // leftTree | center | rightPanel
     // init(services) { ... }                 // 可选：services = { bus, http, theme }
   })
   ```
3. 在 `src/features/registry.ts` 的 `FEATURES` 加一行：
   ```ts
   import { manifest as memoryFeature } from './memory/manifest.ts'
   export const FEATURES = [sessionsFeature, chatFeature, tasksFeature, memoryFeature]
   ```
4. 跑门禁：
   ```powershell
   node scripts\check-modularity.mjs   # 会校验 manifest 合法、已登记、无跨 feature import、无硬编码颜色
   node build.mjs
   ```

需要与别的 feature 协作？**不要 import 它**：在 `platform/events.ts` 增加一个具名事件
（带 TS 负载类型），发射/订阅即可。当前已定义：

| 事件 | 负载 | 谁发 | 谁收 |
|---|---|---|---|
| `session:active` | `{sessionId, title, sessionMeta[]}` | sessions（左栏） | chat / tasks / 壳层 |
| `ws:state` | `{connection, reconnect?}` | platform/ws-hub | 壳层顶栏、chat（重连后补拉） |
| `ws:frame` | `{frame}` | platform/ws-hub | chat（reply/message/trace）、tasks（task.*） |
| `chat:status` | `{agentStatus}` | chat | 壳层顶栏 |
| `tasks:state` | `{running, total}` | tasks | 壳层顶栏、chat 状态行 |

## 6. M2 增量（契约 docs/m2-contract.md §5）

- **撤回**：流式回复的「撤回」按钮发 `correct` 帧；收到 `reply.retracted` 后该气泡
  只显示「已撤回（不展示内容）」标记，同时删除该条的推理轨迹；其他回复/任务不受影响。
- **并行任务**：右栏消费 `task.created` / `task.updated`，列出标题、状态（排队/执行/完成/失败/取消）
  与完成摘要，并广播 `tasks:state`；刷新时尝试 `GET /api/tasks` 恢复（端点未提供则静默降级）。
- **推理折叠**：`trace.reasoning` 按 reply id 累积到独立 Map，用 `<details>` 默认折叠，
  **不进入正文气泡**；撤回时一并隐藏。
- **输入永不锁**：Composer 不再因「发送中/流式中/任务运行中」禁用；连发多条各自独立，
  只有显式撤回才影响指定回复；状态行显示「就绪 / 思考中 / 多个任务进行中（N）」。
- **帧兼容**：M2 `reply.*` 与 M1 `message.*` 双读（后端迁移期都能工作）；`since` 续接与
  事件 id 去重在 `platform/ws.ts` 传输层完成，消息 id 幂等在 chat 层完成。
- **门禁**：`node scripts/check-m2-frames.mjs` 对纯逻辑做确定性自测（帧解析、撤回、
  任务归约、三任务并行计数），不需要浏览器或后端。

## 7. M3 增量：记忆只读页（feature `memory`）

**入口**：右栏顶部「记忆（只读）」入口条 → 点击打开全屏只读抽屉（portal 到 body，Esc/遮罩点击关闭）。
右栏同时挂 memory 入口条（flex-none）与 tasks 列表（flex-1），互不挤压。

**只读边界（design/12 §10.2 Q12、design/22）**：
- 页面**没有任何编辑/删除控件**；页脚固定「只读：修改请跟司墨说」。
- 搜索/作用域过滤/刷新都只是读操作；用户要改记忆必须回对话里说。
- 用户可见页默认排除内部 kind：`spec` 与 `status=candidate` 的 `decision` 草稿
  （`model.ts#isVisibleItem`）。

**列表字段**：内容、`kind`、`scope`、来源（`authority` + `source`）、置信度（0–1 归一 + 进度条）、
记录时间、状态（active/candidate/disputed/superseded/archived/retracted/expired）。

**冲突区**：`GET /api/memory/conflicts` 返回的 disputed 成对展示（左右并排 + 冲突原因 +
警告色）；端点缺失时用条目的 `conflictsWith` 双向指针兜底配对（`conflictsFromItems`）。

**API（m3-contract §4）**：

| 用途 | 请求 |
|---|---|
| 列表 / 检索（同端点） | `GET /api/memory/items?scope=&q=&status=&limit=`（q 防抖 300ms；q<3 由后端 LIKE 兜底） |
| 作用域下拉 | `GET /api/memory/scopes` → `{scopes:[{scope,count}]}`（缺端点时从条目 scope 推导） |
| 冲突 | `GET /api/memory/conflicts` → `{conflicts:[{id,scope,kind,status:"disputed",items[]}]}`（缺端点时用 conflictsWith 兜底） |

**兼容性**：`model.ts` 同时兼容 design/12 全量 schema（`content.text` / `provenance.source` /
`recordedAt` / `conflictsWith`）与 M3 后端契约模型（`content` 字符串 / `authority` / `confidence` /
`version` / `refs`），列表包装兼容 `{items}`、`{memories}`、`{results}`、裸数组。

**门禁**：`node scripts/check-m3-memory.mjs`（18 条纯逻辑断言：契约字段、列表/作用域/冲突多形态、
内部 kind 过滤、置信度/时间/文案），无需浏览器或后端。

## 8. M4 增量：会话树 + 主窗口聚合 + 标签跳转 + 改名

**左栏（feature `sessions`）**：
- `GET /api/sessions/tree` → 嵌套树；兼容旧 `/api/sessions`（404/405 时降级为扁平 + parentId 建树）。
- 展开/折叠（每个节点 ▾/▸）、层级缩进、状态点（进行中/空闲/已归档）、一行摘要
  （`summary` → `N 条消息` → 状态兜底）、子会话数量徽标。
- 点节点切会话 → 写 `?session=` + 广播 `session:active {sessionId,title,depth,sessionMeta}`；
  chat 与 ws-hub 随之切会话。
- 改名：当前节点 ✎ → PATCH `/api/sessions/{id} {title}`（纯显示）；成功先本地更新再静默拉树。
- 新建子会话：`+ 子会话` → POST `/api/sessions {parentId,title}` → 刷新树并选中新会话。
- `session:select`（标签跳转）与 `sessions:refresh`（对话自动建子会话后）由总线驱动；
  `model.ts` 负责归一化/去重/排序/孤儿挂根/防环（最大深度 32）。

**中栏（feature `chat`）**：
- 「仅本会话 / 含子会话」分段开关（`includeChildren`）：根会话默认含子会话，子会话默认仅本会话；
  切换后重新拉 `GET /api/messages?sessionId=&includeChildren=`。
- 聚合视图消息按时间排序；非当前会话消息带**可点击的会话标签**（点击发 `session:select`），
  深层消息带轻缩进。
- 一轮回复结束（`reply.done`）后 600ms 静默刷新会话树（司墨可能自动建了子会话）；
  聚合视图下同时补拉消息。

**门禁**：`node scripts/check-m4-sessions.mjs`（13 条纯逻辑断言：三种 payload 归一化、去重/排序/
孤儿/环、深度与路径、状态/摘要文案、includeChildren 默认、创建 id 提取）。

## 9. M5 增量：任务阶段 / 详情 / 产物 / 权限确认

**右栏列表升级（feature `tasks`）**：
- 列表项：任务名、状态徽标、**进度条 + 百分比**、当前阶段/步骤、阶段完成数、产物数、最后更新时间、
  完成摘要；`待批准 N` 与 `已中和` 小标记；点击任务打开独立 modal 详情。
- 数据容错：`GET /api/tasks` 返回的任务可把 `phases/steps/progress/artifacts/approvals` 放顶层，
  或放在 `payload`（JSON 字符串/对象）里，`model.ts` 统一归一化（状态同义词、步骤字符串、
  payload 顶层优先）。

**详情（独立 modal，`TaskDetail.tsx`）**：
- 阶段（目标/状态/进度）+ 步骤（✓ 完成 / ▶ 进行中 / ○ 待办 / ✕ 失败 / ! 阻塞）+ 当前阶段高亮；
- 产物列表（`ArtifactPreview.tsx`）：**Markdown 渲染**（极小内置解析器：标题/列表/代码块/引用/分隔线）、
  文本 `<pre>`、图片 blob 预览，其它类型只给下载；下载统一 `GET /api/artifacts/{id}/content`；
  文本预览截断 200K 字符并提示；
- 动作：`POST /api/tasks/{id}/cancel`、`/retry`（进行中可取消，失败/已取消可重试），操作后刷新详情；
  页脚说明「验收走对话、取消/重试只影响该任务」。

**权限确认（`ApprovalBar.tsx`）**：
- 来源：WS `approval.requested` / `approval.resolved`、任务详情里的 `approvals[]`、以及
  `GET /api/approvals`（8s 轮询 + 窗口聚焦刷新；后端审批形状 `{id,tool,args,status,...}`）；
- 面板顶部与详情内展示确认条；**必须人点「允许/拒绝」**，提交 `POST /api/approvals/{id}`
  （body `{decision:"allow"|"deny", approved, action}`；400 时用 `{decision:"allow"|"deny"}` 再试一次）；
- 不自动执行；处理后从待批准里移除并刷新任务详情。

**中和标记**：`platform/types.ts` 提供 `hasNeutralized/stripNeutralized`；chat 消息带
`[harness: neutralized]` 时显示「已中和」小标记且正文去掉该标记；任务标题/摘要/步骤同理（列表/详情标记）。

**门禁**：`node scripts/check-m5-tasks.mjs`（14 条纯逻辑断言：列表/详情归一化、payload 合并、
状态同义词、产物分类、进度推导、当前步骤文案、取消/重试可用性、待审批去重、审批提交体、
Markdown 块解析、中和标记、格式化）。

## 10. M6 增量：归档 / 恢复 / 只读态 / 跨会话产物

**归档 / 恢复（feature `sessions`）**：
- 树节点 hover 显示 `⊘ 归档` / `↺ 恢复`（`POST /api/sessions/{id}/archive|unarchive`），
  归档节点标题旁显示「只读」徽标；归档后树节点状态点变灰。
- 归档会话**只读**：`session:active` 载荷新增 `archived`，中栏显示「已归档，只读」横幅、
  输入框禁用（占位「已归档，只读」）且 `send()` 兜底拒绝；树里隐藏改名（✎）与新建子会话
  （`+ 子会话` 禁用），恢复后全部还原。
- 归档/恢复操作成功后静默拉树并重新广播当前会话（中栏立即切换只读态）。

**跨会话产物（feature `tasks`）**：
- 右栏新增「会话产物（含子会话）」区：按 `session:active` 的 `sessionMeta`（含 `parentId`）
  求出当前会话子树，逐个调用 `GET /api/sessions/{id}/artifacts` 合并展示（客户端聚合，不复制文件），
  父会话/聚合视图下能直接看到子会话任务产物（按来源会话分组 + 「子会话」标注）。
- 产物条目复用 `ArtifactPreview`（Markdown/文本/图片预览、其它下载），下载仍走
  `GET /api/artifacts/{id}/content`；**不复制文件**，只按 id 读取。
- 端点未就绪（404/405）时该区自动隐藏；任务状态更新后 900ms 静默刷新产物列表，也可手动 ↻。

**Spec 不可见**：前端源码不出现 Spec / 规格 / 验收标准 概念与入口（`check-m6-lifecycle.mjs`
会扫描 `src/**/*.{ts,tsx,css,html}` 断言零命中；记忆页对内部 `spec` kind 仅做过滤，不展示文案）。

**门禁**：`node scripts/check-m6-lifecycle.mjs`（7 条纯逻辑断言：archived 归一化（0/1/true）、
只读判定与文案、跨会话产物归一化（sessionId/sessionTitle/分类/坏条目）、按会话分组、
跨会话判定、Markdown/产物分类回归、Spec 概念扫描）。

## 11. M7 增量：通知打扰预算 / 可访问性 / 空错态 / 三速反馈

**通知（仅三类打扰）**：
- `app/NotificationHost.tsx` 全局通知宿主：右上浮层、`pointer-events-none` 容器（只有卡片可点，
  **不阻塞输入**）；任务完成 6s、错误 10s 自动消失，**需审批不自动消失**，全部可手动 ×。
- 来源：tasks（`task.updated → done` 一次、`approval.requested`/新 REST 待审批、取消/重试/审批失败）、
  chat（error 帧、发送失败）；同一 `id` 由 `platform/notifications.ts` 去重，上限 4 条。
- 纯逻辑在 `platform/notifications.ts`（仅允许 `task-done`/`approval`/`error`、去重、上限、TTL）。

**可访问性**：
- 全局 `:focus-visible` 焦点环（`outline: 2px solid var(--accent)`，非 focus 时不显示）；
  `prefers-reduced-motion: reduce` 下动画/过渡/平滑滚动全部压到瞬时（原有 base 规则保留）。
- 流式区域：消息列表 `role="log" aria-live="polite" aria-busy`，另有 sr-only `role=status`
  播报「正在加载/司墨正在思考」；思考点动画 `aria-hidden`。
- 弹层：`platform/useFocusTrap.ts`（记忆页、任务详情）负责打开时聚焦、Tab 循环、Esc 关闭、
  关闭后焦点归还；Composer 有 `aria-label` + `aria-describedby`；App 提供「跳到输入框」skip link。
- 键盘：Enter 发送 / Shift+Enter 换行 / IME 组词 Enter 不发送（纯函数 `composerIntent` 可测）；
  Esc 关闭弹层；Tab 顺序遵循 DOM。

**空 / 加载 / 错误态 + 首启引导**：
- 三栏统一：左树骨架/错误重试/空态；中栏骨架/错误重试/**首启引导**（说需求·让它记住·随时插话 +
  键盘提示）；右栏任务骨架/错误重试/空态 + 会话产物空态。
- 首启引导不出现里程碑/内部概念，只说明「能做什么」。

**三速反馈（不假死）**：
- 语义确认 <500ms：发送后立即显示「已收到，正在处理…」；
- 等待首内容 1–3s：「司墨正在想…（输入框仍然可用）」；超过 2.6s：「还在处理…」；
- 派发状态：`task.created` 帧到达后显示「已派发后台任务：…」6s（任务/子会话状态由右栏承载）；
- 收到任何 `reply.created/delta/done` 或错误即清除；定时器在切换会话/卸载时清理。

**响应式与细节**：
- 三栏在 ≤1180px 收右栏、≤820px 收左栏（中栏单列，顶栏显示当前会话）；
- 消息/任务/产物标题与正文 `break-words`/`truncate`，代码块与 Markdown 预览内部滚动；
- 消息时间统一 `HH:mm`（`platform/types.ts#formatClockTime`），任务时间 `MM-DD HH:mm`。

**门禁**：`node scripts/check-m7-polish.mjs`（12 条：三类通知/去重上限/TTL、三速阶段阈值与文案、
键盘映射、定时器清理、焦点环与 reduced-motion、aria-live/aria-busy/role=log、焦点陷阱与 skip link、
无第三方 UI 库、Spec 概念扫描）。

## 12. M8 增量（V1.1）：Markdown 富文本 + 输入工具栏 + 文件上传

**Markdown（platform，共用）**：`platform/markdown.ts` 从产物预览解析器抽出/扩展，支持标题、
粗体/斜体、无序/有序列表、行内代码、代码块、引用、链接、分隔线、**简单表格**；输出结构化块
（不产生 HTML 字符串），原始 HTML 只作为文本节点渲染；`parseInline` 解析行内格式，链接仅接受
`http(s)`（其它协议保留纯文本）；`escapeHtml` 供测试/防御。`tasks/model.ts` 保留 re-export，
产物预览与消息渲染共用同一解析器。

**消息渲染（`features/chat/MarkdownMessage.tsx`）**：agent 与 user 消息统一按 Markdown 渲染；
链接 `target="_blank" rel="noopener noreferrer nofollow"`；代码块 `<pre>` 横向滚动、表格可横向
滚动；不使用 `dangerouslySetInnerHTML`。

**Composer（`features/chat/Composer.tsx`）**：Markdown 源 textarea + 工具栏（粗体/斜体/无序/
有序/行内代码/代码块/链接，`role="toolbar"` + `aria-label`）；包裹选区、无选区插占位并选中；
`Ctrl/Cmd+B`/`Ctrl/Cmd+I`；有序列表自动编号；列表行回车续行（空项回车去掉标记），普通行
Enter 发送、Shift+Enter 换行；IME 组词 Enter 不误发。

**附件（`features/chat/attachments.ts` + `MessageAttachments.tsx`）**：
- 按钮 / 拖拽 / 粘贴上传 `POST /api/uploads?sessionId=`（multipart `file`，可多个），本地先校验
  ≤20 MiB、单条 ≤5 个；错误走通知（不弹阻断浮层）。
- chips：名称/大小/移除（键盘可操作，`aria-label="移除附件 …"`）。
- 发送时 WS/REST 帧带 `attachments:[id]`；消息气泡按 `GET /api/uploads/{id}` 预览文本/图片，
  其它给下载，**不复制文件**。

**门禁**：`node scripts/check-m8-rich.mjs`（19 条：Markdown 块/表格/行内安全链接/HTML 转义、
工具栏包裹/代码块/列表前缀/续行/快捷键、附件归一化/字节格式/类型/限额、渲染安全与 a11y 源码约束、
无第三方富文本/UI 库、Spec 概念扫描）。

## 13. M9 增量：权限模式 + 审批体验

**顶栏权限 pill + 切换面板（`app/PermissionMenu.tsx` + `app/usePermissions.ts`）**：
- 常显「沙盒模式 · 审批策略」（`GET /api/permissions`；容错 `permissions` 包装、snake_case、别名）。
- 面板分「沙盒模式」3 档（只读/工作区可写/完全访问）与「审批策略」3 档（每次询问/自动通过只读/
  不询问-拒绝高风险）；选中即切换（`POST /api/permissions`），变更即时生效（失败走错误通知）。
- 切 `danger-full-access` 必须**二次确认**（`role="alertdialog"` + 危险说明），请求体带
  `confirm:true`/`confirmDangerFullAccess:true` 兼容后端命名；`never` 策略下被拒动作由后端 fail-closed。
- pill 用语义色区分：完全访问=危险色、只读=弱化、工作区可写=强调色。

**审批条升级（`features/tasks/ApprovalBar.tsx`）**：
- 展示风险等级（读/写/执行/网络，按工具推导，颜色分级）、工具名、**命令/参数原文**
  （`pwsh` command 醒目展示 + 参数 JSON 折叠）、影响范围（file_path/path/cwd 等路径 chips）、
  **单次提权**（目标模式 + `justification`）。
- 按钮：**允许一次 / 本会话允许 / 拒绝**（`decision` 为 `allow_once|allow_session|deny`；后端若仅支持
  M5 的 allow/deny，`rest.ts` 会 400 回退到旧值并带 scope）。处理中禁用；不自动执行。
- `never` 策略下被拒：审批/工具轨迹显示「已按策略拒绝」，右栏提示
  `已按策略拒绝：<tool>（审批策略：never / fail-closed）`。
- 工具调用轨迹（`features/chat/toolcalls.ts` + `MessageList` 折叠面板）：解析 `tool.call` 审计帧
  （工具名/状态/耗时/风险/提权/参数摘要），最近 8 条、默认折叠，不刷屏；旧工具名映射
  `read_file→read` 等。

**门禁**：`node scripts/check-m9-permissions.mjs`（16 条：权限默认/别名归一化、full 二次确认与
POST 体、审批风险/参数/路径/提权/策略拒绝、审批动作与标签、工具轨迹归一化/去重/耗时、源码约束
（aria-haspopup/alertdialog/三按钮/折叠面板）、Spec 概念扫描）。

## 14. M10 增量：任务选项卡 + 工作流 + 逐任务汇报

**任务选项卡（`features/tasks/TaskPanel.tsx`）**：
- 右栏标题改为「任务」，显示任务数/工作流数；状态选项卡：**执行中 / 待开始 / 已完成 / 失败**
  （`role="tablist"` + `aria-selected`，计数实时）；组内**按工作流分组**（标题、状态、进度条、
  完成/总数、暂停/恢复/取消按钮），未归属工作流归「未分组任务」，未知 workflowId 用占位工作流。
- 任务行：状态、当前阶段、进度条、阶段数、产物数、**耗时**、是否已汇报、更新时间；
  点击开详情。工作流/任务端点未就绪（404/405）时静默降级为普通任务列表。

**工作流（`features/tasks/workflows.ts`）**：
- `GET /api/workflows?sessionId=` → 归一化（包装/tasks/状态别名/进度推导）；`GET /api/workflows/{id}`；
  `POST /api/workflows/{id}/pause|resume|cancel`；WS `workflow.created/updated/done` 触发 700ms 静默刷新。
- 进度：优先后端 progress，否则按任务完成比例；工作流状态：draft/running/paused/done/failed/cancelled；
  动作按状态给出（运行中→暂停/取消；暂停→恢复/取消）。

**任务详情（`TaskDetail.tsx`）**：标题区显示工作流/耗时/已汇报；新增「工作流」区块（状态 + 暂停/恢复/
取消）与「依赖」chips（按 task id/key 解析标题）；保留阶段/步骤/产物/审批/取消/重试。

**逐任务汇报卡片（`features/chat/TaskReportCard.tsx`）**：
- agent 消息带 `taskId`（/`workflowId`）时渲染小卡片：任务名、状态、产物（前 3 个），点击通过总线
  `task:open` 打开右栏任务详情（chat 不 import tasks feature）；卡片数据用 platform `apiGet` 读取
  `GET /api/tasks/{id}`，失败降级为「详情暂不可用」，不阻塞消息。
- 消息流隐藏空的汇报气泡，只显示卡片；`task.report` 帧也会 upsert 为汇报消息。

**「停」暂停工作流（输入框始终可用）**：任务面板广播 `workflows:state {running,paused,activeWorkflowId}`；
聊天顶栏在工作流运行时显示「停」按钮（点击发送普通消息「停」让司墨暂停），暂停后显示「已暂停」徽标；
Composer 不禁用，随时可继续输入。

**门禁**：`node scripts/check-m10-workflows.mjs`（16 条：工作流归一化/状态/进度/动作、任务状态四分组、
按工作流分组与排序、依赖标题、耗时、汇报卡片解析、workflow.*/task.report 帧、源码约束、Spec 扫描）。

## 15. M11 增量：会话工作台（文件 / 历史导航 / 概览）

**会话顶部标签（`ChatCenter.tsx`）**：中栏顶部 `role="tablist"`：**对话 / 文件 / 概览**（`aria-selected`、
切会话自动回到「对话」）。对话页保留消息流 + 输入区；文件/概览页为独立只读工作区。

**文件选项卡（`SessionFilesView.tsx` + `files.ts`）**：
- `GET /api/sessions/{id}/files?kind=artifact|upload|workspace`；列表：类型徽标（任务产物/消息附件/
  工作区文件）、名称、大小、时间、来源（任务/消息/路径）；类型筛选 + 刷新；空/加载/错误态。
- 预览：Markdown（复用 `MarkdownMessage`）/ 文本 `<pre>` / 图片（直接 `previewUrl`）；其它给下载；
  下载 `downloadUrl`，缺省用 `previewUrl` / `/api/artifacts|uploads/{id}` 兜底；按
  `source.path`/id 去重；只读，不提供上传/编辑。
- 接口异常（404/405）时显示「文件接口暂时不可用」并可重试。

**历史导航（`HistoryRail.tsx` + `history.ts`）**：
- 消息区左侧迷你时间轴：每条消息一个横杠（用户=强调色 / 司墨=绿色 / 系统=警告色）；
  点击预览摘要（浮层）并 `scrollIntoView` 跳转 + 消息短暂高亮（`ring-accent`）；
  当前视口最早可见消息横杠高亮（IntersectionObserver）；长会话可折叠；标题/`aria-label` 完整。
- 分页兼容：`GET /api/messages?...&before=&limit=`；消息达到一页（50）显示「加载更早消息」，
  按 id 去重合并并按时间排序；后端忽略 `before` 时自动隐藏入口。

**会话概览（`OverviewView.tsx` + `overview.ts`）**：
- 打开先读缓存 `GET /api/sessions/{id}/overview`；无则空态提示；「更新概览」按钮才
  `POST .../overview/refresh`（显示「正在生成…」）。
- 自然汇报体：按 目标/约束/现状/已完成/待办/备注/时间线 分组，但正文是**完整句子段落**
  （字符串/字符串数组归一化，`\n\n` 分段落），时间线为「先…随后…然后…」叙述；**不渲染表格/关键词电报体**。
- 完全只读：无编辑控件，仅「更新概览」；页脚提示「需要调整请跟司墨说，再更新概览」。

**门禁**：`node scripts/check-m11-workbench.mjs`（15 条：文件归一化/去重/预览类型/来源/兜底、
概览归一化/空态/段落顺序/时间线、消息摘要/时间轴/分页合并/视口高亮、顶部三标签、只读约束、Spec 扫描）。

## 16. M13 增量：定时任务管理

**入口（新 feature `features/schedules`）**：左栏会话树下方一条「定时任务」入口（flex-none，会话树改
flex-1 不被挤压），显示数量；点击打开全屏管理页（portal，Esc/焦点陷阱/关闭）。

**列表（`ScheduleManager.tsx`）**：
- 每项显示：名称、触发方式徽标、时区、目标会话、下次运行（绝对时间 + 相对时间）、上次结果
  （状态徽标 + 时间 + 运行次数）、内容预览。
- **启用开关**：`role="switch"` + `aria-checked`；切换调 `PATCH /api/schedules/{id} {enabled}`。
- 操作：**立即运行**（`POST /api/schedules/{id}/run-now`）、**编辑**（回填向导）、**删除**（行内二次确认）。
- 空态/加载/错误；接口异常（404/405）时显示「定时任务接口暂时不可用」并可重试。

**创建/编辑向导（`model.ts` 纯逻辑）**：
- 触发方式五选一：**一次 / 间隔 / 每天 / 每周 / cron**；对应时间控件：
  `datetime-local` / 数值+秒分时单位 / `time` / 星期多选+`time` / 五段 cron 输入。
- 时区下拉（本机 + 常用 IANA）；目标会话下拉（`GET /api/sessions`，失败时退化为会话 id 输入）；
  内容 textarea；创建后立即启用开关。
- 非法输入 inline 提示：必填、once 未来时间、间隔正整数且 ≥10 秒、HH:MM 校验、星期至少一天、
  五段 cron 字段范围校验（分/时/日/月/周）。
- 生成触发表达式：once→按所选时区换算 ISO；interval→秒；daily→HH:MM；weekly→`ISO周几,.. HH:MM`；
  cron→去空白五段。POST body 同时带契约 `{sessionId,title,prompt,enabled,timezone,trigger:{type,expr}}`
  与扁平兼容字段 `{triggerType,triggerExpr}`，便于后端字段名差异时兼容。

**API（`rest.ts`）**：`GET/POST /api/schedules`、`GET/PATCH/DELETE /api/schedules/{id}`、
`POST /api/schedules/{id}/run-now`；列表/详情字段 snake/camel 双兼容。

**门禁**：`node scripts/check-m13-schedules.mjs`（14 条：归一化、触发描述、状态/时间格式、时区换算、
五类触发校验、触发表达式/POST body、编辑回填、左栏入口、列表/向导/降级、门禁链与 Spec 扫描）。

## 17. M14 增量：消息标签 + 时间轴预览 + 概览列表化

**消息分类（`features/chat/message-meta.ts` + `MessageBadges.tsx`）**：
- 仅 agent 显示分类徽标：**需求提出** `requirement`（accent）/ **需求澄清** `clarification`（warn）/
  **进度汇报** `progress`（ok，旧 `delivery` 兼容归入）/ **信息咨询** `consultation`（muted）；
  未分类不显示徽标、不留空位；user 不显示分类。
- 消息头顺序：角色 → 分类 → 会话路径 → 时间；`ChatMessage` 增加 `category`/`sessionPath`，
  HTTP/WS 均经 `toChatMessage` 归一化（camel/snake、对象/字符串、限深 16）。

**会话多级路径（`MessageBadges.tsx`）**：
- `sessionPath:[{id,title}]` 根→当前；>3 级折叠中间为 `…`（保留第一级 + 最后两级，悬停显示折叠项）；
  user/agent 都显示；每级可点击跳转对应会话；旧消息无路径时按 `sessionMeta.parentId` 回溯，
  至少回退到 `sessionTitle`（不可跳转）。

**时间轴预览（`HistoryRail.tsx` + `history.ts`）**：
- hover/聚焦即显示预览卡片：角色、分类徽标（agent）、会话路径、时间、摘要 ≤120 字（按空格回退截断）；
  点击跳转 + 保持选中；卡片可关闭；tick 颜色按角色/分类（user=accent、progress=ok、clarification=warn、
  requirement=accent、consultation=muted）；Tab 聚焦、Enter 跳转；折叠与视口高亮保留。

**概览列表化（`overview.ts` + `OverviewView.tsx`，M14-E）**：
- 目标/现状/备注保持自然段；**约束**普通列表；**已完成** ✅ 勾选列表；**待办** ☐ 未勾选列表；
  **时间线**有序列表（`1. 2. 3.`）。
- 时间线支持后端 `timeline:[{at,text}]`：前缀按 age 格式化——24h 内 `HH:mm`、超 1 天 `M月D日`、
  超 1 月 `YYYY年M月`、超 1 年 `YYYY年`；每项「时间 + 完整句子」。
- 兼容旧字符串：按换行/分号拆成列表项；空列表不渲染；只读（✅/☐ 仅展示，无 input/table/编辑控件）。

**门禁**：`node scripts/check-m14-tags.mjs`（15 条：四类分类与旧 delivery 兼容、路径归一化/回溯/折叠、
摘要 ≤120、HTTP/WS 归一化、时间轴 tick、概览数组/旧字符串/空列表、时间前缀、源码约束与 Spec 扫描）。

## 18. M15 增量：消息回复 + 品牌「司墨」+ 图标

**回复引用（`Composer.tsx` / `MessageList.tsx` / `useChatRuntime.ts`）**：
- 消息 hover/聚焦显示「回复」按钮（agent/user 都有）；点击进入引用状态，输入区上方显示引用条
  （角色 + 摘要 + 会话 + × 取消，Esc 取消），发送后清空；发送链路 WS `chat` / REST `POST /api/chat`
  均带 `replyToMessageId`。
- 被回复消息快照 `ChatMessage.replyTo {id,role,text≤200,sessionId,sessionTitle}`（HTTP/WS 归一化）；
  气泡正文上方显示引用卡片，点击跳转原消息并高亮；跨会话显示会话标题；键盘可达
  （回复按钮 aria-label、Esc 取消、引用卡片可 Tab/Enter）。
- 后端 M15-A 未就绪时，`replyToMessageId` 会被忽略（前端不报错）；引用快照/UI 已用 fake-data 验证。

**品牌统一（按用户最终确认）**：全站用户可见文案统一为 **司墨**（顶栏、状态、提示、错误、空态等），
无「秘书/本地秘书/私默/思默」；内部 API/类型/存储键不变。顶栏品牌处用内联 SVG 徽标
（`app/BrandMark.tsx`，与 `public/icon.svg` 同形状、颜色取主题 token，随主题变色）。

**图标**：`web/public/icon.svg`（矢量 favicon/分享）+ `icon-256.png`；`public/index.html` 引用
`/icon.svg` 与 `/icon-256.png`；`build.mjs` 构建时把 `index.html`、`icon.svg`、`icon-256.png`
一并复制进 dist（无 Node spawn 权限时可用直接命令构建后手动复制）。

**门禁**：`node scripts/check-m15-reply-brand.mjs`（9 条：replyTo 归一化/摘要上限、hover 回复、引用条+Esc、
引用卡片跳转、发送链路、内联徽标、图标资产/favicon/构建复制、全站改名扫描、门禁链与 Spec 扫描）。

## 19. M17 增量：智能体页面 + 负责人/处理者头像

**共享数据层（`platform/agents.ts`）**：
- `GET /api/agents` → 归一化 `{agents:[{id,name,role,persona,tools,model,icon,tone,shape}]}`
  （包装/裸数组、snake/camel、tools 字符串或对象、去重、颜色/形状兜底）。
- 模块级缓存 + 订阅 hook `useAgentCatalog()`；接口 404/失败/空时降级为内置示例
  （source=fallback + 错误提示），不阻塞页面。`findAgent()` 未知 id 兜底为默认智能体司墨；
  `fallbackOwnerForSession()` 在主会话返回司墨，子会话按 id 确定性散列到其他人格（后端给
  `agentId` 时优先用后端值）。

**智能体视图（新 feature `features/agents`）**：
- 左栏「智能体」入口条（与会话树/定时任务入口共存），显示数量 + 「示例」徽标；点击打开全屏只读页。
- 卡片展示：头像图标、名称、角色、模型、人格摘要、工具 chips、默认负责人/示例徽标；
  顶部为来源徽标（来自后端 / 内置示例）+ 刷新 + 关闭；无编辑控件。

**头像复用（`platform/AgentAvatar.tsx`）**：
- 按智能体区分颜色（accent/ok/warn/danger/muted）与形状（round/soft/square），只用主题 token；
  title/aria-label 含名称+角色；尺寸 xs/sm/md/lg。
- 会话树节点显示负责人头像（xs，title 提示名称/角色）；消息气泡 agent 头像是实际处理者
  （`ChatMessage.agentId` 优先，缺省默认司墨；user/system 保持原样），并显示处理者名称。

**门禁**：`node scripts/check-m17-agents.mjs`（11 条：目录归一化/兜底、内置示例字段、findAgent、
负责人确定性兜底、ChatMessage.agentId、入口/页面字段、头像 token/形状、会话树与消息头像接入、
门禁链与 Spec 扫描）。

## 20. UI-1 增量：命令面板 / 斜杠 / @引用 / 消息操作 / 用量统计 / 设置中心

**工作台入口（新 feature `features/workbench`）**：左栏底部「工作台」入口条（⌘K / 用量 / 设置），
承载全局命令面板、用量页、设置页与首启引导（只显示一次，localStorage）。

- **命令面板（Ctrl/⌘+K）**：输入过滤（命令 + 会话混合）；↑↓/Enter/Esc；动作：切会话、新建会话
  （POST /api/sessions + 刷新/跳转）、改权限（打开设置权限区）、打开设置/用量、暂停任务（发送「停」）、
  切换主题。
- **斜杠命令（输入框）**：`/archive`（归档当前会话）、`/rename <标题>`、`/pause`（发送停）、
  `/model <名称>`（本地偏好；后端切换接口未就绪时提示仅本地）；输入 `/` 时显示命令提示，
  非法命令/缺少参数 inline 提示，命令不当作消息发送。
- **@ 引用**：输入框光标前 `@query` 弹出候选（当前会话文件 + 会话列表）；↑↓/Enter/Tab 选择、Esc 关闭，
  选中后插入 `@名称 `；接口失败时空列表，不阻塞输入。
- **消息 hover 操作**：复制（clipboard + 回退）、引用（M15 引用条）、重试（agent→上一条用户消息）、
  编辑重发（用户消息，内联编辑后作为新消息发送）、跳到原文（带 replyTo 时）；操作结果用顶部状态条提示。
- **会话树增强**：搜索（title/summary/id，保留祖先、自动展开）、置顶（localStorage，星标排序）、
  **未读计数**（messageCount − 本地已读）、**执行中**徽标（后端 status 或当前会话有并行任务）；
  负责人头像保留。
- **交付物卡片**：对话页顶部展示当前会话 artifacts（最多 4 个），文本/Markdown/图片预览、
  全部可下载；接口缺失/为空时隐藏。
- **用量统计页**（需求修正版：**树状表格 + 每行内嵌时间序列**）：
  - 每行一个会话，按会话树缩进；行左侧展开/折叠箭头 + 负责人头像 + 名称 + 消息/token 合计 + 最后活跃；
  - 行右侧**该会话自己的 sparkline**（消息数/token），所有行共用同一时间轴；
  - 折叠父行 → 子行及其图表一起收起；父行数值/序列含子会话汇总；
  - 顶部统一切换指标（消息数/token）、粒度（天/周/月）、范围（7/30/自定义日期）；
  - 全部 SVG 自绘（polyline + 点 + 轴基线），无第三方图表库；后端用量接口缺失时展示确定性示例数据
    （source=sample，token 为估算）。
- **设置中心**：模型（本地偏好）、权限（沙盒/审批，走 /api/permissions，full 需确认标记）、
  主题（platform theme 即时切换）、数据目录（只读提示由后端 AGENTD_HOME 决定）、快捷键表；
  接口缺失时优雅降级。
- **首启引导/空态**：首次打开显示一次性引导（对话/记忆/智能体/⌘K/@/斜杠），用量页/会话树/交付物等
  均有空态与错误重试。

**门禁**：`node scripts/check-ui1.mjs`（15 条：用量树/折叠/汇总/桶/范围/sparkline、命令过滤/斜杠解析校验、
@ 触发/过滤/插入、重试取上一条用户消息、交付物归一化、Ctrl+K/设置/用量/输入/消息/会话树源码约束、
门禁链与 Spec 扫描）。回归 M2–M17。

## 21. M18 前端适配：约束列表 / 子任务执行者 / 概览来源 / 汇报执行者

**概览 `constraints` 列表化**：
- 后端 `constraints` 支持 `string[]`：`overview.ts` 归一化为列表，`OverviewView` 渲染 `<ul>`；
  旧字符串按换行/分号拆项兼容；空数组不渲染列表。
- `completed`/`pending`/`timeline` 数组列表渲染回归保持（✅ / ☐ / 有序列表）。

**子任务执行者（设置中心）**：
- 新增「子任务执行者」区块：**任务智能体 NPC** / **司墨本人**；本地偏好
  `simo.subtaskExecutor`（platform/preferences）。
- 保存时尝试 `PATCH /api/sessions/{id}/config {subtaskExecutor}`；接口缺失/失败时保留本地偏好并提示
  「后端会话配置接口未就绪，已保存本地偏好」；打开设置时尝试读取会话配置，失败静默用本地值。

**概览来源**：页头显示「来源：基于会话目标与任务生成」+「内容版本 vN」，不出现内部字段名/字样。

**任务汇报执行者**：任务汇报卡片显示执行者头像 + 名称（来自消息 `agentId`；缺省用任务详情
`agentId`，再缺省默认司墨）；消息头像/名称沿用 M17；`ChatMessage.agentId` HTTP/WS 归一化。

**门禁**：`node scripts/check-m18.mjs`（8 条：constraints 数组/旧字符串/空数组、completed/pending/timeline
回归、执行者偏好默认/保存/回退、任务卡与消息 agentId、设置/来源/汇报源码约束、门禁链与 Spec 扫描）。

## 22. UI-2 增量：轨迹 / 工具卡片 / 计划待办 / 模型选择 / 压缩 / 通知中心

> 定位：UI-2 是同一套会话事件/消息的更深投影（视图等价），不是第二数据源；
> 后端能力缺失时**禁用/降级并说明**，不伪造成功、不产生 UI-only 能力。

**轨迹视图（对话 / 轨迹 切换）**：
- `GET /api/sessions/{id}/trajectory` 为主数据；实时 WS 帧（tool.* / approval.* / task.* / workflow.* /
  plan.* / context.compacted / retry / error）增量合并；接口未就绪时用**消息 + 工具调用**降级并显示说明。
- 事件项：时间、kind、标题、状态、摘要；筛选 全部/工具/审批/任务/压缩/错误；消息项点击跳回对话并高亮，
  任务/计划项打开任务详情；非消息项展开详情（工具→卡片，压缩→统计，其他→脱敏 JSON）；支持 before 分页。

**工具调用卡片（七类 + 未知降级）**：command（命令/输出/超时/截断/spill）、file_read/search（路径/模式）、
file_write/file_edit（路径/diff 增删/补丁）、web（查询/URL/来源链接 rel=noopener）、filegen（产物名/大小/预览/下载）、
approval（风险/命令只读说明，动作仍在审批条）、error（错误文本）；未知 card → 脱敏 JSON 折叠。
命令/参数/输出统一 `maskSecrets`（KEY/TOKEN/SECRET/PASSWORD/sk-*）。

**计划与待办面板（中栏顶部，可折叠）**：
- `GET /api/sessions/{id}/plan`；未就绪时从 `GET /api/tasks?sessionId=` 生成**只读任务降级投影**并标注。
- Todo 打勾 → `POST /api/sessions/{id}/todos/{id}/toggle`；确认/拒绝 → `POST .../plan/confirm|reject`；
  失败提示「需要后端动作层支持（接口未就绪）」，**不本地改状态**；关联任务的待办只能走任务动作层。

**模型选择器（composer 工具条）**：模型 + 推理强度下拉（本地偏好 localStorage）；选择时尝试
`POST /api/sessions/{id}/model`；失败提示「后端模型切换接口未就绪，已记录本地偏好」，不假装成功。

**压缩可视化**：消费 `context.compacted`/`compaction` 事件，显示「已压缩 N 条消息、M 条工具结果，约节省 K tokens」
（只使用事件真实数字）；内联可折叠说明，不展示被压缩原文；无事件不显示。

**通知中心**：顶栏铃铛 + 未读角标；与 M7 toast 同源（bus NOTIFY），并消费 WS `notification.created`；
`GET /api/notifications` 历史 + 筛选（全部/未读/任务/审批/错误）；单条/全部已读尝试
`POST /api/notifications/{id}/read`、`read-all`，失败仅本地；点击跳转会话/任务；后端未就绪时说明仅本次内存历史。

**门禁**：`node scripts/check-ui2.mjs`（15 条：轨迹归一化/筛选/降级/压缩、卡片七类/脱敏/diff/产物、
计划归一化/降级/打勾请求、模型偏好、通知归一化/未读/已读、六项源码约束、门禁链与 Spec 扫描）。

## 23. UI 收口：响应式 / 键盘可达 / 空错态 / reduced-motion / 文案

**窄屏（≤820 / ≤1180）**：
- 三栏沿用 App 断点：≤1180 隐藏右栏、≤820 隐藏左栏；窄屏中栏顶部显示提示「左右栏已折叠；Ctrl/⌘+K 可切换会话、打开用量/设置」。
- 命令面板 `p-2 pt-[8vh] sm:p-4 sm:pt-[12vh]`；轨迹筛选/列表可横向滚动，内边距 `px-2 sm:px-4`；
  用量统计外层 `overflow-auto` + 表格 `min-w-[40rem]` **横向滚动**；消息流/输入区/聊天头部均加 sm 断点内边距；
  通知中心抽屉 `p-2 pt-14 sm:p-4 sm:pt-16`，`max-h-[80vh]`。

**键盘可达**：
- 全局 `:focus-visible` 焦点环（`src/styles.css`）；通知中心使用焦点陷阱 + Esc 关闭（含抽屉内任意焦点），
  命令面板 Esc 任意焦点关闭；轨迹筛选 `role=group` + aria-pressed，计划待办打勾 `aria-pressed`，
  模型/推理选择器 `aria-label`，筛选/铃铛/列表项均为原生 button，Tab/Enter 可用。

**空态/错误态统一**：新增 `platform/FeedbackPane.tsx`（`LoadingPane` / `EmptyPane` / `ErrorPane`，
`role=status`/`role=alert`）；用量、轨迹、通知中心、计划面板复用，文案与样式一致；错误可重试。

**reduced-motion**：全局 `@media (prefers-reduced-motion: reduce)` 将动画/过渡压到 1ms、滚动改瞬时；
新页面/组件不额外强制动画，骨架/思考点/焦点动效均受该规则约束。

**文案统一**：全站用户可见文案与源码统一「司墨」，无「秘书 / 本地秘书 / private」；内部标识不变。

**门禁**：`node scripts/check-ui3.mjs`（6 条：三栏/命令面板/用量表/轨迹/消息输入响应式、focus/aria/Esc、
FeedbackPane 复用、reduced-motion CSS、文案扫描、门禁链与 Spec 扫描）。回归 M2–UI-2。

## 24. M21 增量：记忆浏览器（v0.3 / 只读）

**入口**：左栏「记忆」条（v0.3 徽标）→ 全屏记忆浏览器；右栏 M3 只读入口保留。

**浏览**：搜索（防抖）+ 类型过滤（场景/语义/规范/程序/工作）+ 按实体浏览两栏布局；条目卡显示类型/
子类型/状态/层/source/authority/置信/实体引用/归属/写域/来源 refs/双时态（失效标记）；点击实体打开详情。
**实体详情**：实体名/kind/别名/负责人/状态 + memoryCounts + **关系列表**（rel_type→目标，可点击跳转）+
关联记忆；实体 API 缺失时按条目 entityRefs 派生实体（标注降级）。
**冲突**：`GET /api/memory/conflicts`，disputed 双方各显示来源/权威/时间/状态，显著标注「需裁决」，
只读、不自动裁决。
**智能体通用记忆**：`GET /api/memory/agents` + `/agents/{id}/memory`，按智能体只读查看；每条标注来源
refs（含 session:…），跨智能体只读，不复制人格。
**金字塔**：`GET /api/memory/pyramid`，L0–L4 层级折叠导航（原始/工作、会话、任务/项目、领域、全局），
视角切换（what_happened/what_is/what_should/how_to/current_state），展示 coverage/status/sourceCount，
stale 标注；不展示内部压缩原文。
**降级**：所有端点 404/失败时显示空态/错误说明（列出期望只读端点），**不展示示例数据、不伪造**；
页面为只读（无写控件/无 POST/PATCH/DELETE）；不出现内部字段。

**门禁**：`node scripts/check-m21-memory-browser.mjs`（9 条：条目五类型/实体引用/旧 kind 回退、
实体/关系/详情、冲突双方、智能体、金字塔 L0–L4、源码只读/降级/端点、门禁链与 Spec 扫描）。

## 25. M24/M25 增量：团队页（V2 只读）

**入口**：左栏「团队」条 → 全屏只读团队页；无编辑控件。

**成员列表**：头像（platform AgentAvatar）+ 名称 + 角色/上级 + 状态（running/queued/paused/done）
+ 负责人标记 + 当前任务 + 进度条；团队并发上限与排队原因展示在顶部。
**成员详情**（点击成员）：显示该成员会话、任务列表（`GET /api/tasks?sessionId=`）与产物
（`GET /api/sessions/{id}/artifacts`，下载链接）；「进入该成员会话」通过总线 `session:select`
切换会话树/聊天（不复制消息）。
**团队模板**：V2 就绪时展示角色清单、`role_type`（通用角色 / 模板角色）、继承来源、人格基础与职责；
模板未就绪时显示空态说明，**不伪造**。
**实时更新**：订阅 WS `task.*` / `session.*` / `workflow.*` / `team.*` 事件，500ms 去抖刷新；
同时每 8s 轮询 `GET /api/sessions/{id}/team`（缺失时回退 `GET /api/team`）作为降级。
**只读与边界**：无写接口/编辑控件；状态仅投影展示；不展示内部字段；团队接口未就绪时空态说明
（V0/V1 可继续用会话树进入成员会话）。

**门禁**：`node scripts/check-m24-team.mjs`（8 条：状态映射/进度、团队/成员/并发/排队、模板角色
generic/template 与继承、入口/成员列表/详情任务产物、WS+轮询/只读、降级说明、门禁链与 Spec 扫描）。

## 26. M24/M26 增量：视图 Schema 渲染器骨架（自定义视图）

**定位**：视图是同一套会话消息 + 动作的声明式投影；前端只消费后端 `ui.get_view` 返回的 schema，
不生成代码/HTML；未知块/绑定失败降级为只读表格，对话始终可用。

- **13 种块**（`features/views/ViewRenderer.tsx`）：`chat/form/ask/action/deliverable/text/markdown/table/image/progress/timeline/dag/kanban`；
  schema 未知块 → **整页 fallback**（表格 + 对话等价提示），不白屏；块内部绑定失败 → 该块 fallback 说明。
- **页面容器**：12 栅格 `layout`（`kind rows|grid`、`columns≤12`、`gap`、`areas{block,colSpan}`）；响应式 `grid-cols-1 md:grid-cols-12`；
  块嵌套 ≤3（schema 校验）；全部主题 token；不使用 schema 提供的内联样式/HTML。
- **数据绑定**：`{action,args,select,fields,refresh}`；动作目录（`GET /api/actions`）判定只读（R0/R1）才允许；
  目录未就绪/非只读 → 显式降级「不伪造数据」；`$session/$page/$row` 注入，JSONPath 子集 `a.b[0].c`。
- **动作绑定**：统一 `/api/actions/{name}`（body 参数 + `source{pageId,actionId}`）；R3+ 由后端审批；`confirm: risk|always` 仅调严；
  失败展示 `error.message/recovery`，不乐观改状态；动作成功后刷新视图。
- **ui 动作**：`ui.get_view`（预览读取）、`ui.set_view`（回滚生成新版本）、`ui.delete_view`（软删）；预览显示版本号与
  「版本不可变；回滚生成新版本」提示；未知块/校验失败显示 fallback 表格；当前会话无视图显示空态说明（对话生成）。
- **安全**：拒绝 `html/script/style/on*/jsx/component/expression` 等危险键；字符串含 `<script`/`javascript:` 拒绝；
  image 仅允许 `/api/artifacts/`、`/api/uploads/` 引用；markdown 走平台白名单解析；链接仅 http/https + `rel=noopener noreferrer`；
  React 文本节点渲染，无 `dangerouslySetInnerHTML`。
- **入口**：设置中心「自定义视图」按钮 + 命令面板「打开自定义视图」→ 总线 `view:open` → 当前会话预览（不新增可见栏位）。

**门禁**：`node scripts/check-m26-views.mjs`（9 条：13 块/合法 schema、版本/未知块/重复/危险键、12 栅格/image/equivalence、
只读绑定/参数注入/JSONPath、fallback 摘要、渲染器 13 块/安全、动作与 ui 版本调用、设置/命令面板入口、门禁链与 Spec 扫描）。

## 27. M28 增量：视图编辑 UI 打磨（受控编辑 / 交互 / 版本 / 错误定位）

**受控编辑器（`ViewEditor.tsx` + `editor.ts`）**：
- 预览 + 编辑模式：标题、块的 props/actions、添加块、删除块；所有保存翻译为**白名单 patch ops**
  （`set_page_props` / `set_block_props` / `set_block_actions` / `add_block` / `remove_block` / `replace_blocks`），
  不提供任意 JSON/JSON Patch 输入；`baseVersion` 并发控制；`reason` 必填（审计）。
- 新块默认 props/唯一 id；结构均走下拉/输入/文本域；后端 4xx 错误解析 `details.blockId/field/path`
  或 message 中的 block id，**块高亮 + 字段定位 + 可读错误**；失败不产生版本、不伪造成功。
- 所有保存走 `ui.set_view mode=patch` → `/api/actions`；R3+ 审批由后端动作层处理。

**交互**：
- **form**：受控字段（text/textarea/select/date/checkbox）提交绑定动作，args 合并字段值。
- **table**：列/行渲染 + 行操作按钮（绑定动作，带行上下文 `$row`），横向滚动/窄屏。
- **kanban**：拖拽卡片到列 + **键盘替代下拉**；仅映射到块已绑定的语义动作（cancel/retry/pause/resume 等），
  无绑定不直接改状态并提示；动作失败/需审批原样展示，不做乐观状态。

**版本面板（`VersionPanel.tsx`）**：`GET /api/views/{id}/versions` 列表 + `GET /versions/{v}` 预览
（标题/块类型摘要），回滚前确认；`ui.set_view mode=rollback` 生成新版本、历史不删除；接口缺失空态说明。

**a11y/响应式/空错态**：标签/aria-invalid/role=alert、按钮键盘可达、错误块高亮；编辑器/版本面板窄屏单列；
加载/空态/错误态复用 FeedbackPane；无 schema 内联样式。

**门禁**：`node scripts/check-m28.mjs`（9 条：受控 ops/新块/错误定位/看板语义动作/版本归一化/编辑控件源码/
看板键盘与表格行动作/版本面板与 a11y/窄屏空态与动作端点/门禁链与 Spec 扫描）。

## 27.1 M27/M30 与前端边界（2026-11-08 验收）

- **M27 召回 R2**、**M30 记忆自动巩固** 是后端/`-debug` 能力，本轮前端无新增页面；视图编辑器（M28）见 §27；
- 后端已知限制（召回命中实体绑定记忆时 30s 超时、真实模型 smoke token 中位 48,384 > 45,000）见
  [`agentd/README.md`](../agentd/README.md) 与 [`evals/RELEASE.md`](../evals/RELEASE.md)；

## 27.2 M33 增量：视图/团队交互打磨

- **form 块**：必填/number/date/select 校验；字段级 `aria-invalid` + 错误文本；提交中禁用/`aria-busy`；
  失败显示可读错误（不乐观改状态）；成功 `role=status` 并刷新视图。
- **table 块**：表头排序（`aria-sort`，仅展示状态）、分页（页码 clamp、上一页/下一页）、空数据空态；
  行操作按钮 loading/`aria-busy`，失败提示保留本地状态。
- **kanban 块**：拖拽/键盘下拉都映射块已绑定语义动作；移动中显示 pending；失败显示「已保留原状态」；
  无绑定列显式「无绑定」提示并禁用 drop/键盘选项；不直接改状态。
- **视图编辑器**：块搜索（id/type）；删除确认；保存中/成功/失败状态（失败保留本地编辑）；
  未保存修改在退出编辑/关闭预览时确认。
- **团队页**：状态筛选 + 成员搜索；running 状态点 `motion-safe:animate-pulse`；卡片「进入会话」直接切会话；
  筛选空态/团队空态；进度条 `role=progressbar/aria-valuenow`。
- 门禁：`node scripts/check-m33.mjs`（9 条：表单校验、排序分页、团队筛选、表单/表格/看板源码、
  编辑器搜索/确认/保存状态/离开提示、团队动画/筛选/进会话/a11y、门禁链与 Spec 扫描）。

## 27.3 M34 增量：视图复杂交互 v2

- **多步表单向导**：`props.steps[]` 分步字段；当前步校验后才能「下一步」，最后一步总校验并定位错误步骤；
  步骤指示 `第 x/y 步`（aria-live）；返回上一步保留值；提交失败保留输入；成功刷新。
- **表格 v2**：多列排序（点击循环升/降/移除 + 清除）；行内编辑（受控 fields，保存走动作，失败回滚原值并提示）；
  行详情展开（键值）；批量动作（多选、逐行调用已绑定动作、失败停止、不乐观更新）；骨架 loading；分页/空态。
- **看板 v2**：WIP 上限（`wipLimit`/`wipLimits`，仅展示、超限警示）；泳道（`groupBy: owner|status`）；
  卡片排序持久化到 localStorage（`simo.view.kanban.order:<page>:<block>`，上/下移 + 键盘下拉）；
  跨列移动仍只映射已绑定语义动作，失败保留原列。
- **图表块（新增 `chart`）**：`kind: bar|line|pie` 纯 SVG（柱/折线/饼），主题 token + `viewBox` 响应式；
  数据来自只读绑定或 `props.data`；附可展开数据表；不引入图表库。
- **块联动 `$row`**：表格行「联动」设置当前行；带 `$row` 参数的数据绑定重新取数；顶部显示联动行与清除。
- **骨架/回滚**：数据绑定 loading 用 `motion-safe:animate-pulse` 骨架；行内编辑/批量/看板移动失败均保留原状态并提示。
- 兼容：M26 schema 校验扩展 chart 块（13 核心块不变）；未知块仍整页 fallback。
- 门禁：`node scripts/check-m34.mjs`（10 条：向导/多列排序/图表几何/看板 WIP 泳道排序/chart schema、
  编辑/行详情/批量、SVG/联动/骨架、门禁链与 Spec 扫描）。

## 27.4 M37 增量：顶部横向选项卡导航

- **顶部 tab bar**（TopBar 下方）：对话 / 工作台 / 任务·定时任务 / 智能体 / 团队 / 记忆 / 文件；对话默认；
  `role=tablist/tab` + `aria-selected` + roving tabindex，←/→/Home/End 键盘切换；窄屏 `overflow-x-auto` 不换行。
- **视图切换**：顶部 tab 通过总线打开既有页面（保留当前会话上下文）；文件/对话同步中栏 chat tab；
  页面关闭发 `nav:closed`，激活态回到对话；切换前 `nav:reset` 关闭旧页。
- **入口迁移**：定时任务/智能体/团队/记忆/工作台的左下入口条移除，对应 Entry 只做页面宿主（不占左栏）；
  工作台新增只读首页（用量/设置/命令面板/自定义视图入口）；会话树/右栏布局不变。
- **命令面板**：Ctrl+K 新增「视图：对话/工作台/任务/智能体/团队/记忆/文件」命令，全部视图可达。
- 门禁：`node scripts/check-m37.mjs`（6 条：App/TopTabs/7 tab、a11y/键盘/窄屏、事件、左下入口移除、
  命令面板、门禁链与 Spec）。

## 27.5 M38 增量：右栏计划/概览 + 布局修复

- **主区域清理**：移除主区域计划/待办面板、顶部交付物条、概览 tab；中栏保留「对话/轨迹/文件」（文件 tab 不变）；
  交付物/计划/概览全部迁到右栏；不再有重复入口。
- **右栏细竖条**：默认收起为最右侧竖条，纵向「任务」「概览」标签 + 运行中数字角标 + 概览更新圆点；
  点标签展开/再点收起；📌 固定后不自动收起；未固定切会话自动收起；Esc 收起。
- **任务 tab**：顶部计划/待办摘要（`platform/plan.ts` + `PlanSummary`，摘要/进度/前 6 条待办可展开，
  打勾仍走 `/todos/{id}/toggle` 动作层，失败不改本地）→ 任务列表/工作流 → 当前会话交付物（只读预览/下载）；
  整体垂直滚动、`min-w-0`/`truncate`/`break-words`，修复裁切/文本/横向溢出。
- **概览 tab**：右栏 `OverviewPanel`（目标/约束/现状/已完成/待办/时间线），更新概览走 `POST /overview/refresh`，
  空/错/加载态；中间不再有概览。
- **三栏拖拽**：左/中、中/右分隔条可拖拽，双击恢复默认；宽度存 `simo.layout.leftWidth/rightWidth`；
  右栏收起宽度 48px；窄屏右栏改为 fixed 浮层；左栏 ≤820 隐藏。
- **断点**：≤1180 右栏浮层/左栏紧凑；≤820 单列 + 左栏隐藏；主区不被挤压。
- 门禁：`node scripts/check-m38.mjs`（8 条：主区移除/文件 tab、细竖条/角标、pin/切会话/Esc、任务 tab 计划/交付物、
  布局溢出、三栏拖拽/localStorage、右栏归属、门禁链与 Spec）。

## 27.6 M40 增量：视觉重构（组件层 / 排版 / 页内视图 / 概览与时间轴）

- **组件层 `platform/ui`**：Button（primary/secondary/ghost/danger × sm/md，hover/active/focus-visible/disabled/loading）、
  IconButton、Input/TextArea、Select、Tabs（roving tabindex/键盘）、Table（zebra/hover/tabular-nums）、Card、Badge、
  Tooltip、Dialog（焦点陷阱/Esc）、Toast、Skeleton、EmptyState；`FeedbackPane`/`NotificationHost`/`FirstRunGuide`
  已改用它。
- **排版/质感**：正文 14px、次级 13px、元信息 13px（可见文字不小于 13px）；ink #111827 / secondary #4B5563 / muted #6B7280；
  分区标题 `--section-title #374151` 14px/600；全局 tabular-nums；控件圆角 4–6、卡片 8；去渐变/glow/卡片阴影、去网格背景。
- **概览上限**：已完成/待办最多 6 条、每条 ≤40 字；时间线最多 6 条、每条 ≤50 字；超出显示「另有 N 项」；
  列表正文主色，灰色仅用于时间/路径等极次要信息。
- **线性图标**：新增 1.5px stroke、16/20、currentColor 图标集；移除 emoji/汉字图标（📌/★/✎/🔗/📎/✅/☐/↻ 等）。
- **顶部 tab 页内切换**：新增 `mainView` 槽位；工作台/任务/智能体/团队/记忆在**中间主内容区**渲染（保持三栏骨架），
  不再弹浮窗/遮罩；顶部不设「文件」一级 tab，文件只在中间「对话/轨迹/文件」子选项卡；Ctrl+K「切到会话文件」只切中栏子 tab。
- **右栏**：任务/概览竖条始终在最右边缘（内容 order-1、标签条 order-2）；展开面板向左长；窄屏仍 fixed 浮层。
- **概览**：已完成/待办改为逐项复选框列表（check/square 线性图标）；后端长字符串按换行/分号拆条；
  时间线为纵轴+时间+文本、每条 line-clamp-2；目标/约束/现状保持自然段（碎片数据待后端修复后联调）。
- **消息时间轴**：宽度 32px、刻度条加粗/点击区加大；去掉原生 title；hover 150ms 意图延迟、关闭 200ms grace；
  弹窗可交互；点击刻度即跳转+高亮并固定（再点/点外/Esc 取消）；键盘 Tab 聚焦打开、Enter 跳转；
  弹窗去掉「跳到这条消息」按钮、布局收紧；头部角色/分类用透明 Badge。
- 门禁：`node scripts/check-m40.mjs`（9 条：组件层/状态、token/对比度/圆角/阴影、图标/无 emoji、关键页面组件使用、
  tab 页内 mainView、细竖条最右、概览列表/时间线、时间轴交互、门禁链与 Spec）。

## 27.7 M41 增量：消息内联交互卡片

- **内联渲染**：`GET /api/messages` 的 `cards[]` 经 `chat/cards.ts` 归一化，消息气泡内复用 `views/ViewRenderer`
  （13 块完整能力）；schema 无效/未知块/校验失败 → 纯文本 `fallbackText`，不显示裸 JSON、不渲染 HTML。
- **交互**：表单/按钮/选择/表格行/看板等统一 `POST /api/cards/{id}/actions/{actionId}`，body `{payload, baseVersion}`；
  提交中禁用防重复；`route=agent` → “已发送给司墨，等待回复”；`route=action` → 结果/错误/审批提示；
  动作仍受 R3+ 审批约束，不乐观改业务状态。
- **状态/版本**：submitted/disabled/expired 有徽标与说明并禁用交互；版本 `vN` 小字展示；
  收到 WS `card.updated` 按 card id 替换新版本；409/baseVersion 冲突提示“请刷新后重试”，可手动刷新卡片。
- **安全/样式**：白底 `surface-solid` + 1px `border` + 8px 圆角；`min-w-0`/移动端自适应；无内联样式/HTML；
  链接图片继续走 platform markdown/白名单；键盘焦点由统一组件与 ViewRenderer 保证。
- **架构说明**：`chat → views` 的 ViewRenderer 复用是唯一显式跨 feature 白名单（M41 需求），modularity 已记录。
- 门禁：`node scripts/check-m41.mjs`（10 条：归一化/fallback/WS、交互 payload/版本、13 块复用、
  agent/action 两路由、状态/冲突、安全样式、门禁链与 Spec）。

## 28. 已知限制

- M34 复杂交互仍受 schema/动作层约束：向导/表格编辑/批量/看板移动失败保留原状态；`chart` 为最小 SVG 图表，不是通用 BI。
- M37 顶部 6 个全局视图 + 页内 mainView；文件为会话子标签；窄屏横向滚动，不提供多窗口。
- M38 右栏细竖条可收起/固定/拖拽，宽度存本地；窄屏右栏浮层、≤820 单列；复杂拖拽/多窗口不在本期。
- M40 视觉重构覆盖常用组件，但组件级自动化测试仍有限；概览最多 6 条/“另有 N 项”；时间轴 32px 点击/键盘跳转；最终包 SHA256 `6b62bf3c2a52baf97fd51017dc0e07e212ca5b5d2219ce26b66af45c421b9753`（≈11.61 MB；app.js 675,939 B）。
- 会话树支持展开/折叠/切换/改名/新建子会话/归档恢复；拖拽排序、标签属后续里程碑。
- 归档态由后端 `archived` 字段决定；归档会话不能发消息/改名/建子会话，恢复后还原。
- M4 的自动建子会话由后端规则/模型判定；前端仅在 `reply.done` 后刷新树，不做本地推断。
- M5 任务详情接口未就绪时自动降级为列表已知信息；阶段/产物/审批字段以 tasks 列表 payload 为准。
- 后端 flat steps 用 `phaseId` 关联阶段（`plan/execute/verify` + `collect/draft/finalize`），前端
  `model.ts` 会按 `phaseId` 合并到对应阶段；无 `phaseId` 的步骤归入「步骤」阶段。
- 审批列表走 REST 轮询（8s），后端目前不推 `approval.*` WS 帧；接入推送后可去掉轮询。
- 跨会话产物依赖 `GET /api/sessions/{id}/artifacts`；后端未就绪时该区隐藏，任务详情内的产物不受影响。
- 任务详情 modal 不做执行轨迹时间线；「细看单独开窗」目前是 modal，未做多窗口。
- 产物预览仅支持文本/Markdown/图片；PDF/Office 等走下载（P1 可接渲染）。
- 记忆页只读且只拉取快照；尚未订阅 `memory.*` 增量帧（M3 后端未定义该帧，改动走对话后手动刷新）。
- 主题只有 `light-tech` 一套；切换 UI 在 P1。
- WS 的 `since` 续接依赖服务端在帧里携带事件 id（服务端实现在信封顶层带 `id`；客户端
  兼容 `eventId` / `id` / `data.eventId` / `data.id`）；拿不到时退化为「按消息 id 去重 + 全量补齐」。
- 通知仅三类（任务完成/需审批/错误）；回复流式本身不弹通知，靠中栏三速反馈与状态行。
- 窄屏（≤820px）只保留中栏；左右栏收起的替代入口（抽屉）属后续。
- 富文本仅 Markdown 子集（不做 WYSIWYG、不渲染 Markdown 内嵌图片/外部图片）；表格为简单表格，
  不支持合并单元格/对齐语法。
- 附件单文件 ≤20 MiB、单条消息 ≤5 个；只做文本/图片内联预览，PDF/Office 走下载。
- 上传为“先传后发”：文件选择后立即上传，发送只带附件 id；取消发送不会自动删已上传文件。
- 权限模式为会话级（后端 `POST /api/permissions` 支持 sessionId；前端目前切换默认模式，不随会话单独保存）。
- 审批支持 `allow_once`/`allow_session`/`deny`；旧后端不识别时回退 allow/deny（已带 `scope` 字段兼容）。
- 工具调用轨迹依赖 `tool.call` 审计帧（WS）；帧缺失时折叠面板不显示，不影响审批与权限切换。
- 任务面板一次拉全量任务后前端分组（未用 `status=` 过滤）；工作流任务数默认上限由后端控制（12）。
- 状态分组中 `blocked` 归入执行中、`cancelled` 归入失败；工作流 `interrupted` 归为失败（供重启后展示）。
- 「停」为发送普通消息「停」，依赖后端指令解析；按钮本身不禁用输入框。
- 文件/概览接口异常时显示「接口暂时不可用」并可重试；normalization、段落渲染、时间轴/分页逻辑不依赖接口。
- 概览渲染按后端字段（goal/constraints/current/completed/pending/notes/timeline）分组标题 + 完整句子段落；
  后端若返回关键词短句，前端不改写（自然汇报体由生成侧保证）。
- 历史导航只对已加载消息生成横杠；「加载更早消息」是启发式入口（≥50 条显示），文案/分页参数按契约兼容。
- 文件预览上限 200K 字符（文本/Markdown）；其它类型（PDF/Office）下载。
- `GET /api/tasks` 不在 M2 契约内：后端未提供时刷新后只能靠 WS 增量重建任务列表（已做静默降级）。
- 定时任务接口异常时入口显示数量为空、管理页显示「接口暂时不可用」可重试；CRUD + run-now + 非法 cron 400 已对接。
- 定时任务时间按 IANA 时区做墙上时间换算（Intl shortOffset，跨 DST 边界近似）；后端最终以自身计算
  的 `next_run_at` 为准。
- POST body 同时携带契约 `trigger` 对象与扁平 `triggerType/triggerExpr`；若后端最终只接受其中一种，
  另一种会被忽略（不报错），联调时按后端实现收敛。
- 前端只做即时校验；cron 的「日/月组合语义」（如 2 月 31 日）交由后端校验/调度器处理。
- 编辑使用 PATCH 全量字段；启停单独发 `{enabled}`。删除为行内二次确认，不做回收站。
- 运行结果不在管理页展示，按契约以普通汇报消息回到目标会话。
- M14-A 后端未完成前，消息 `category`/`sessionPath` 缺失：前端不显示分类、路径按会话元数据回溯；
  分类/路径/列表/时间前缀逻辑已用 fake-data stub 验证（messages + overview）。
- 分类值来自后端 `category`（前端只做展示与旧 `delivery`→`progress` 兼容）；前端不做规则判定。
- 概览时间线 age 前缀按 24h/30 天/365 天近似阈值（月按 30 天），后端 `at` 为准；旧字符串时间线无时间前缀。
- 已完成/待办用 ✅/☐ 文本标记展示（不引入可交互 checkbox，保持只读且无表单控件）。
- M15 回复依赖后端 `replyToMessageId` 与 `replyTo` 快照；后端未就绪时发送仍可用（忽略引用），气泡不显示引用卡片。
- 引用卡片只展示直接引用的那一条（不做多级嵌套）；被引用消息不在已加载分页内时点击跳转会停留在当前位置。
- 品牌图标为手绘内联 SVG + 两份静态资产；构建产物需包含 `icon.svg`/`icon-256.png`（build.mjs 已复制）。
- M17 后端 `/api/agents` 未就绪时，智能体页展示内置示例（4 种人格）；会话负责人头像按 id 确定性兜底，
  后端返回 `agentId/agent_id` 后自动优先使用；消息 `agentId` 缺失时按默认司墨显示。
- 智能体页只读（无编辑/新建入口）；人格/工具/模型的实际配置由后端与对话完成。
- 头像颜色/形状为前端展示映射（tone/shape 可由后端字段覆盖）；图标暂为单字 glyph，未使用位图。
- UI-1 用量统计：后端用量/token 接口未就绪时展示示例会话与估算 token（source=sample）；
  会话 token 按消息数估算，接入后端后替换 series 数据源即可；父行汇总为前端逐桶相加。
- 命令面板/斜杠的「新建/归档/重命名/暂停」走现有会话与 WS 接口；`/model` 仅存本地偏好
  （后端模型切换接口未就绪）；权限在设置页即时调用 /api/permissions。
- @ 引用当前是文本引用（`@名称`），不改变发送协议；后端若支持结构化引用再扩展。
- 消息「重试」为重新发送对应请求（agent 消息取上一条用户消息）；后端暂无单独 regenerate 接口。
- 首启引导只显示一次（localStorage）；需要重置可清 `simo.firstRun.seen`。
- M18 子任务执行者后端接口（`PATCH /api/sessions/{id}/config`）未就绪时仅保存本地偏好并提示；
  后端上线后自动以服务端值为准（打开设置时读取，读取失败静默本地）。
- 概览来源文案固定为「基于会话目标与任务生成」+ 内容版本；不展示任何内部规格字段。
- 汇报执行者优先消息 `agentId`，其次任务详情 `agentId`，最后默认司墨；后端需在消息/任务里带该字段。
- UI-2 轨迹接口、工具受控 meta、plan/todo 动作、模型列表/切换、压缩事件、通知持久化后端大多未就绪：
  分别降级为消息+工具调用、tool 帧/审计字段、任务列表只读投影、本地模型偏好、无压缩条、内存通知历史；
  降级均有明确文案，不伪造成功。
- 工具卡片 approval 只读展示，审批动作仍在审批条/任务详情完成；未知 card 以脱敏 JSON 折叠，不白屏。
- 通知中心与 toast 同源；后端未就绪时历史不跨刷新保留；不接浏览器通知/声音。
- 轨迹筛选与分页为当前契约骨架；大量事件虚拟列表/搜索属后续优化。
- UI 收口为静态源码/构建门禁验证，未做真实浏览器多断点截图/读屏回归；响应式基于 Tailwind 断点 + 全局 focus/reduced-motion。
- 窄屏左右栏仅折叠，未提供抽屉式替代入口；会话/用量/设置入口通过 Ctrl/⌘+K 命令面板可达。
- M21 记忆 v0.3 后端（entities/items/conflicts/agents/pyramid 只读端点）未就绪时，记忆浏览器显示空态/错误说明，
  不展示示例数据；实体 API 缺失时按条目 entityRefs 降级浏览。
- 记忆浏览器只读，无写/裁决入口；冲突需裁决通过对话/后续动作层完成，前端不自动选择。
- 金字塔节点由后端构建；前端只投影展示，不生成压缩摘要；stale/coverage 以服务端字段为准。
- 智能体通用记忆来源以 refs/session 标注；跨智能体只读，不展示敏感越界内容。
- M22 召回主要在后端/`-debug` 入口，前端不直接展示 recall trace；召回质量依赖实体/关系覆盖。
- M24 团队 V2 后端（teams/team_members/模板/成员状态）未就绪：团队页显示空态/错误说明，不展示示例数据；
  WS 无团队事件时由 8s 轮询降级；V0 无团队记录属预期（V1/V2 有）；M31 起 team.* 进用户 WS（仅状态/摘要）。
- 团队页只读：创建/暂停/换负责人通过对话动作层完成；成员状态以会话/任务为准。
- 成员任务/产物按会话读取，接口缺失时显示空列表说明；进入成员会话仅切会话，不复制消息。
- M24/M26 视图渲染为骨架：预置 13 类的只读/基础交互渲染；表单/表格/看板等复杂交互为最小实现，未知 props 降级为文本/表格；M26 仅会话级、Agent 生成，不支持手写 schema/任意 HTML/JS。
- schema 校验与动作目录校验在前端执行；后端仍是最终权威（权限/审计/审批）。后端未就绪时 `ui.get_view`/动作失败显示空态/错误，不伪造视图。
- 数据绑定仅支持动作目录中只读动作；目录缺失时块降级说明；无后台轮询（V1），刷新由动作成功/手动触发。
- 动作失败不乐观更新；R3+ 审批由后端动作层处理，前端只展示错误/提示。
- M28 编辑器为骨架：块属性编辑覆盖常用类型（text/markdown/action/form/ask/table/kanban/image/progress），
  复杂块（chat/deliverable/timeline/dag）以绑定展示为主；不提供 schema 文本编辑器。
- 看板拖拽/键盘只映射到块已绑定的语义动作；无绑定则提示回到对话，不直接改状态；动作成功后才刷新。
- 版本列表/回滚依赖后端 `GET /versions` 与 `ui.set_view`；缺失时空态说明，不伪造版本。
- 后端 4xx 定位依赖 error.details 或可读 message；无法定位时显示通用错误。
- 组件级测试未引入（P1）；当前门禁是 `tsc --noEmit` + 模块度脚本 + M2–M18 + UI-1/UI-2/UI-3 + M21/M24/M26/M28/M33/M34 纯逻辑/源码自测 + 后端联调冒烟。
