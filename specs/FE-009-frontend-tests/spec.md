# FE-009 · 前端测试体系（Spec）

状态：**draft（测试体系设计；未实现；待 Lead / 前端 / 测试评审）**
Owner：测试（策略 / 门禁）/ 前端（可测性 / 夹具 / 用例实现）/ 验收（独立走查）
范围：`frontend/` 的测试分层、用例矩阵、覆盖阈值、测试数据、证据与 CI 门禁；不改变产品行为。
关联：[`docs/process/FRAMEWORK.md`](../../docs/process/FRAMEWORK.md) §3.4、[`docs/process/SCENARIOS.md`](../../docs/process/SCENARIOS.md)、[`docs/process/ROLES.md`](../../docs/process/ROLES.md)、[`docs/process/skills/testing-strategy/SKILL.md`](../../docs/process/skills/testing-strategy/SKILL.md)、[`docs/process/templates/test-plan.md`](../../docs/process/templates/test-plan.md)、[`deploy/CI.md`](../../deploy/CI.md)。

编号说明：本目录名沿用 Lead 指定的 `FE-009-frontend-tests`；它和已验收的 [`FE-009-web-multitab`](../FE-009-web-multitab/spec.md) **编号重复**。为避免引用歧义，建议评审后把本 spec 改为 `FE-010-frontend-tests`；在改号前，本文件标题写“FE-009 · 前端测试体系”，引用时必须带目录名，不能只写 `FE-009`。

---

## 1. 目标

建立一套**可执行、可追溯、可阻断**的前端测试体系，让“功能是否真的按验收标准工作”不再靠手点、截图或口头确认：

1. **分层清楚**：单元（L1）/ 组件（L2）/ 集成（L3）/ 端到端（L4）各自只测该层能证明的东西，避免重复和漏测。
2. **功能点全覆盖**：当前前端功能点 F01–F15 都有明确用例；每个用例有 ID、层、断言、数据 / mock 和证据。
3. **状态全覆盖**：正常、边界、错误、空、加载、键盘、375、console 八类行为至少各有一条可执行断言，不以 happy path 代替。
4. **阈值可执行**：新增 / 改动代码的覆盖率、核心纯逻辑覆盖率、功能矩阵完整度都有明确门禁；全仓总覆盖率只做趋势，不制造“数字绿”。
5. **证据可复核**：命令、退出码、测试报告、覆盖率 JSON、DOM 断言、截图 / trace、构建哈希能对应到 A1–A15。
6. **门禁能阻断**：失败、跳过、空断言、console error、假 0 都不能以“已跑”蒙混过关；Blocking 未过不得合并 / 发布。
7. **可持续**：新增组件或交互时，按矩阵补用例；测试代码与产品代码同审、同类型检查、同维护。

成功判据：在干净检出上执行本 spec §9 的命令，L1–L3 与 E2E smoke 通过，覆盖率报告满足 §6，A1–A15 均有证据；任一项失败时 CI / 发布门禁失败，而不是只留一条口头说明。

## 2. 非目标

- **不在本 spec 内写测试代码或改产品代码**。本 spec 只定义测试体系；实现、接线、CI 修改另开任务。
- **不重复后端测试**：Go 单测、API 契约、evals、迁移 / 并发 / 权限由后端与 `evals/` 负责；前端只验证“消费到的数据与界面行为”。
- **不把覆盖率当质量本身**：不追求 100% 全仓覆盖率，不为凑数字写无断言、只渲染、只快照的测试。
- **不做跨账号 / 公网 / 多设备 / 真机矩阵**：本机单用户、同源多标签是边界；移动端只验证 375 CSS 视口，不做原生 App。
- **不把整页像素对比设为 Blocking**：`check:visual` 仍按 `Nightly / Warning`；动态消息时间 / 数据导致 fresh capture 不稳定，不能当假门禁，也不能替代人工视觉验收。
- **不依赖真实模型 / 真实外部网络做 Blocking 测试**：Blocking 路径全部用 fixture / mock；真实模型 smoke 单独作为 Nightly / 手工项。
- **不替代人工验收**：测试证明行为，审美、信息层级、真实内容可信度仍由用户 / 验收走查。
- **不追求 E2E 覆盖所有组合**：E2E 只覆盖跨组件、跨标签、真实浏览器的关键旅程；组合爆炸交给 L2/L3。
- **不改变产品语义**：测试发现的问题按缺陷流程处理，不在测试里改期望来“变绿”。

## 3. 现状与差距（截至本 spec 编写时）

| 能力 | 现状 | 差距 / 风险 | 本 spec 的目标 |
|---|---|---|---|
| L1 单元 | `frontend/vitest.config.ts` 已存在；`src/test/setup.ts`、`src/test/fixtures.ts` 已出现；`formatTokens / formatTime / formatDate` 可直接单测 | 没有 `test:*` scripts；没有 L1 目录与用例；时区未固定 | L1 命令、目录、固定时钟 / 时区、核心纯函数用例 |
| L2 组件 | 已有首批组件测试文件（`Composer.test.tsx`、`MessageItem.test.tsx`、`Sidebar.test.tsx`、`TimelineGroups.test.tsx`），使用 Vitest + RTL + user-event + jest-dom | 用例仍在并行补齐；未统一 CASE-ID；未规定断言下限；未覆盖全部组件状态 | 每功能点至少一组 L2；角色 / 名称 / 状态 / 键盘断言规范 |
| L3 集成 | `msw` 已安装但未接入；`api.ts`、`tabsync.ts`、`app.tsx` 的接线无集成测试 | 无 MSW handler、无 fake WS、无请求失败 / 重试验证 | 用 MSW + fake WS 验证“组件—API—状态”接线；不启真实后端 |
| L4 E2E | **无 Playwright**；无浏览器配置、无 e2e 目录 | 跨标签、真实滚动、布局、console 无法由 jsdom 证明 | 新增 Playwright Chromium smoke + 关键旅程；隔离 home / 端口 |
| 覆盖率 | `vitest.config.ts` 仅把 `src/components/library.tsx` 纳入覆盖，阈值 statements/lines 80、branches 70、functions 75；无报告产物 | 只覆盖组件库文件，不能代表页面 / 交互；无 patch 覆盖率 | 分 patch、核心逻辑、组件库三层阈值；全仓趋势 |
| CI | `deploy/CI.md` 的 `build-test` 目前是 Go → Web 构建 → build → evals → package，无前端测试步骤 | 测试不进 CI 就没有阻断力 | 在 Web 构建前加 `test:ci`；E2E smoke 单独 job / 发布门禁 |
| 视觉门禁 | `capture:visual` + `check:visual` 已存在；按流程为 Nightly / Warning | 易被误当 Blocking 或替代测试 | 只作为视觉回归信号，不替代 L1–L4 行为断言 |

> 以上“已存在”只表示文件 / 依赖存在，**不表示测试通过**。本 spec 未执行任何测试，也未生成覆盖率报告；任何“通过”必须由 §7 的证据证明。

### 3.1 可测性现状

- `frontend/src/app.tsx` 是单文件 App（三栏 + 页面状态 + WS + 会话加载 + 卡片提交等），组件边界清晰但页面级逻辑集中；L3 应优先通过真实子组件 + mock API 验证，不直接测内部函数。
- `frontend/src/components/library.tsx` 同时承载展示组件和 `TimelineGroups` 分组、`format*` 纯函数；L1 只测导出的纯函数，L2 测组件行为，不把内部实现细节写进断言。
- `frontend/src/tabsync.ts` 依赖 `BroadcastChannel`；jsdom 的 stub 不能证明真实跨标签同步，跨标签必须放 L4。
- `frontend/src/test/setup.ts` 已有 `ResizeObserver`、`BroadcastChannel`、`matchMedia`、clipboard、`requestAnimationFrame`、`scrollTo` stub；仍需补固定时区与可控随机 / UUID 策略。

## 4. 测试分层（L1–L4）

| 层 | 测什么 | 不测什么 | 工具 / 环境 | 运行预算 | 门禁 | 主要产物 |
|---|---|---|---|---|---|---|
| **L1 单元** | 纯函数、格式化、排序 / 分组、解析、去重、状态归约；无 DOM | 组件渲染、网络、布局、真实滚动 | Vitest；jsdom 或 node；固定 `TZ=Asia/Shanghai`；fake timers | 单文件 < 2s；全套 < 10s | Blocking（PR） | Vitest 结果、覆盖率 |
| **L2 组件** | 单组件在给定 props 下的渲染、角色 / 名称、状态切换、事件回调、键盘、错误 / 空 / 加载；不跨组件 | 真实 API、真实 WS、整页布局、跨标签 | Vitest + RTL + user-event + jest-dom；jsdom；MSW 仅用于组件内请求 | 单文件 < 5s；全套 < 30s | Blocking（PR） | 断言、失败截图（可选）、覆盖率 |
| **L3 集成** | 2–3 个组件 + `api.ts` / 状态接线的页面级流程；MSW 请求失败 / 重试；fake WS 流式事件；tab sync 消息处理 | 真实浏览器布局、真实 WS / BroadcastChannel、真实模型 | Vitest + RTL + MSW + fake WebSocket；jsdom | 全套 < 60s | Blocking（PR / main） | 请求日志、流式事件序列、断言 |
| **L4 端到端** | 真实 Chromium 中的启动、导航、发送、流式、卡片、时间轴、右栏、工作台、375、双标签、console / 资源 | 所有边界组合；像素级审美 | Playwright Chromium；真实构建产物 + 隔离后端 / mock 模型；临时 home / 端口 | smoke < 5min；full < 20min | smoke：Release Blocking；full：Nightly | trace、截图、video（失败）、console / network 日志 |

### 4.1 分层原则

1. **按失败模式分层，不按数量形状分层**：能用 L1 证明的逻辑不放到 L4；只有真实浏览器才能证明的布局 / 跨标签 / 滚动，才放 L4。
2. **同一断言只在一个层做“权威判定”**：L2 已验证的按钮禁用，L4 不再重复断言同一 DOM 细节；L4 只证明“真实旅程仍然成立”。
3. **L2 用可访问名查询**：优先 `getByRole` / `getByLabelText` / `getByText`，不用 CSS 类名和组件内部 state；必须用 `data-*` 时，先确认它是稳定契约。
4. **L3 不启动真实 `simo.exe` / 8787**：用 MSW 与 fake WS；真实后端只出现在 L4 隔离实例。
5. **L4 不依赖真实模型 key**：用 mock provider 或固定 SSE / WS 脚本；真实模型 smoke 单独、非 Blocking。
6. **测试代码同质量**：TypeScript 类型检查、无 `sleep`、无固定端口、无共享可变全局；失败必须可复现。
7. **不做只快照的测试**：快照只能作为辅助，必须有行为 / 语义断言；整页像素对比不进入 Blocking。

## 5. 功能点与用例矩阵

> 数字是**最小用例数**，不是当前通过数；具体 ID 与断言见 [`test-plan.md`](test-plan.md)。任何新增功能点必须先在矩阵登记，再写用例。

| 功能点 | 来源 | L1 | L2 | L3 | L4 | 必测状态 / 边界 | 优先级 |
|---|---|---|---|---|---|---|---|
| **F01 应用壳 / 导航** | FE-001 / FE-004 / FE-005 | — | CT-SEG-001 | IT-SHELL-001、IT-SHELL-002 | E2E-SHELL-001 | 首启、对话↔工作台、连接中 / 重连 / 就绪 | P1 |
| **F02 侧栏 / 会话树 / 搜索 / 归档** | FE-001 / FE-003 | — | CT-SIDEBAR-001..009 | IT-SIDEBAR-001、IT-SIDEBAR-002 | E2E-SIDEBAR-001 | 空、加载、错误、无匹配、重命名、归档 / 恢复、服务端搜索 | P1 |
| **F03 消息渲染 / 卡片** | FE-003 / COMP-message-colors / COMP-conversation-panel | — | CT-MSG-001..004、CT-CARD-001..004 | IT-CHAT-001..004、IT-CARD-001 | E2E-CHAT-001 | 角色、分类、失败、流式、长文、复制、卡片只读 / 重试 | P1 |
| **F04 Composer 输入 / 发送** | COMP-composer-send-mode / FE-006 | — | CT-COMPOSER-001..010 | IT-COMPOSER-001 | E2E-CHAT-001 | Enter / Shift+Enter / Ctrl+Enter、IME、失败恢复、重复提交、停止、长文、模式持久化 | P1 |
| **F05 时间轴 / 提示** | COMP-timeline-groups / COMP-timeline-tip / FE-006 | UT-FMT-003、UT-FMT-004 | CT-TIMELINE-001..007 | IT-TIMELINE-001 | E2E-TIMELINE-001 | 空、单条、分组排序、active、hover / focus、Escape、边缘 clamp、32px 目标 | P1 |
| **F06 祖先消息加载** | FE-007 | — | — | IT-ANCESTOR-001、IT-ANCESTOR-002 | E2E-ANCESTOR-001 | 根会话无祖先、多级祖先、失败 / 重试、切换会话重置 | P1 |
| **F07 右栏概览** | FE-003 / COMP-conversation-panel | — | CT-OVERVIEW-001..003 | IT-OVERVIEW-001 | E2E-OVERVIEW-001 | 空 / 加载 / 错误、任务分组、交付物、任务点击、无假数据 | P1 |
| **F08 工作台指标** | FE-008 | UT-FMT-001、UT-FMT-002 | CT-METRICS-001..004 | IT-METRICS-001 | E2E-METRICS-001 | 7 / 30 天、loading / empty / error / partial / missing、分母 0、表格键盘 | P1 |
| **F09 交付物** | FE-003 | — | CT-DELIVERABLE-001 | IT-DELIVERABLE-001 | E2E-DELIVERABLE-001 | 空、打开、下载、错误 | P2 |
| **F10 多标签同步** | FE-009-web-multitab | — | — | — | E2E-TABS-001、E2E-TABS-002 | 双标签 active、消息 / 流式、滚动独立、重复事件去重 | P1 |
| **F11 空 / 加载 / 错误 / 首启** | FE-002 / FE-004 | — | CT-STATE-001 | IT-STATE-001 | E2E-EMPTY-001 | 所有面板三态、无假 0、错误可重试 | P1 |
| **F12 键盘 / 可访问性** | DESIGN.md、WCAG 2.2 AA 可测试子集 | — | CT-A11Y-001 | — | E2E-A11Y-001 | 焦点顺序、可见焦点、名称、ARIA、Escape、目标尺寸 | P1 |
| **F13 响应式 / 375** | FE-001 / FE-008 | — | CT-TIMELINE-007（CSS 隐藏规则） | — | E2E-RESP-001 | 375 无横向溢出、导航可用、右栏不遮主体、32px 目标 | P1 |
| **F14 运行质量 / console** | FE-002 | — | — | IT-QUALITY-001 | E2E-QUALITY-001 | console.error 0、pageerror 0、未捕获 rejection 0、资源 404 0 | P1 |
| **F15 测试数据隔离** | 本 spec | — | — | IT-ISOLATION-001 | E2E-ISOLATION-001 | 临时 home / 端口、无真实用户数据、可重复、清理 | P1 |

### 5.1 组件覆盖补充

`frontend/src/components/manifest.json` 当前 33 个组件；不要求每个纯展示组件单独写一个测试文件，但下列组件必须有行为用例：

| 组件 | 对应用例 | 必须覆盖 |
|---|---|---|
| `Segmented` | CT-SEG-001 | 当前项、点击回调 |
| `Sidebar` | CT-SIDEBAR-001..009 | 树 / 选中 / 重命名 / 归档 / 搜索 / 三态 / 统计失败 |
| `MessageItem` | CT-MSG-001..004 | 角色 / 分类 / 复制 / Markdown / 流式 / 失败 |
| `CardBlock` | CT-CARD-001..004 | 字段、提交、忙碌、错误 / 重试、只读 / 取消 |
| `Composer` | CT-COMPOSER-001..010 | 输入法、快捷键、发送态、失败、模式、停止、长文 |
| `TimelineGroups` / `TimelineTip` | CT-TIMELINE-001..007 | 排序 / 分组 / active / 点击 / hover / focus / 键盘 / 边缘 |
| `OverviewPanel` | CT-OVERVIEW-001..003 | 三态、任务 / 交付物、点击、空投影 |
| `MetricsDashboard` | CT-METRICS-001..004 | 窗口、三态、partial / missing、分母 0、表格 |
| `DeliverableItem` | CT-DELIVERABLE-001 | 打开、下载、空列表 |
| `ConversationPanel` / `LoadingState` / `ErrorState` / `EmptyState` | CT-STATE-001 | 语义、重试、空文案 |

纯展示组件（`Icon`、`Badge`、`Section`、`SectionHeader`、`StatusDot` 等）不强制单测；它们由使用它们的组件用例与组件 parity / 视觉走查覆盖。组件清单与 parity 仍按 [`docs/process/COMPONENT-PARITY-GATE.md`](../../docs/process/COMPONENT-PARITY-GATE.md) 执行。

## 6. 覆盖阈值

> 遵守 [`FRAMEWORK.md`](../../docs/process/FRAMEWORK.md) §3.4：**覆盖率只做趋势，不设全仓单一硬指标**。下面的硬阈值只约束“新增 / 改动代码”和“明确列出的核心逻辑”，避免用总覆盖率制造假绿。

| 阈值 | 范围 | 目标 | 判定 | 说明 |
|---|---|---|---|---|
| **Patch lines** | PR diff 中新增 / 修改的前端源文件（排除 `*.test.*`、fixtures、`dist/`、生成文件） | **≥ 85%** | Blocking | 新代码必须自证；不允许“把新逻辑放到未覆盖文件” |
| **Patch statements** | 同上 | **≥ 85%** | Blocking | 与 lines 同口径 |
| **Patch branches** | 同上 | **≥ 75%** | Blocking | 每个条件分支至少一条断言 |
| **Patch functions** | 同上 | **≥ 80%** | Blocking | 新增导出函数 / 组件回调 |
| **核心纯逻辑** | `formatTokens`、`formatTime`、`formatDate`，以及后续提取的排序 / 分组 / 解析纯函数 | statements / lines **100%**，branches **≥ 90%** | Blocking | 核心纯逻辑出错会扩散到多页；必须逐分支覆盖 |
| **关键决策清单** | §6.1 列出的决策行 | **100% 决策行有至少一条断言** | Blocking | 以清单核验，不只看百分比 |
| **组件库基线** | `src/components/library.tsx`（现有 `vitest.config.ts` include） | statements / lines **80%**、branches **70%**、functions **75%** | Blocking | 沿用现有配置；这是组件库基线，**不是全仓覆盖** |
| **功能矩阵** | F01–F15 | 每个功能点至少 1 条 L2 或 L3 用例；A1–A15 全部映射 | Blocking | 矩阵缺行视为测试计划不完整 |
| **全仓趋势** | `src/**/*.{ts,tsx}`（排除测试 / fixtures / gallery / `main.tsx` / `dist`） | 首次建立基线；后续不得比基线下降 **> 1pp** | Warning | 只做趋势；下降需说明原因，不直接阻断 |
| **E2E smoke** | §9.3 的 smoke 集合 | 100% 通过 | Release Blocking | PR 可先 Warning，main / release 必须 Blocking |
| **跳过 / 空断言** | 全量测试 | **0** | Blocking | 见 §7.4；豁免必须走审批且有到期日 |

### 6.1 关键决策清单（必须 100% 有断言）

| 决策 | 说明 | 用例 |
|---|---|---|
| 发送方式 | `enter` 与 `shift-enter` 下 Enter / Shift+Enter 的行为 | CT-COMPOSER-002、003、008 |
| IME 组合 | composing 中 Enter 不得发送；compositionEnd 50ms 内也不得误发 | CT-COMPOSER-004 |
| 发送失败恢复 | 失败后文本恢复、错误可读、可重试；不产生半条本地消息 | CT-COMPOSER-006、IT-COMPOSER-001 |
| 重复提交 | sending / streaming / 空文本时不可重复发送 | CT-COMPOSER-007 |
| 卡片只读 | `readOnly` 或 `card.status !== 'active'` 时字段 / 按钮禁用 | CT-CARD-003 |
| 卡片失败重试 | 失败保留输入、显示错误、按钮变“重试” | CT-CARD-002 |
| 时间轴排序 | `sessionOrder → dateKey → at` 的稳定顺序 | CT-TIMELINE-001 |
| 时间轴 active | 当前消息 `aria-current` / `is-current` 唯一 | CT-TIMELINE-001、IT-TIMELINE-001 |
| 时间轴键盘 | 方向键 / Home / End 移动焦点；Escape 关闭提示 | CT-TIMELINE-006 |
| 祖先分组 | 当前会话 / 上级会话分组与顺序 | CT-TIMELINE-001、IT-ANCESTOR-001 |
| 指标 partial / missing | 不把 missing 渲染成 0；partial 明确标注 | CT-METRICS-003、IT-METRICS-001 |
| 分母为 0 | 显示“无数据”，不显示 0% | CT-METRICS-004 |
| 会话切换 | 切换后消息、时间轴、右栏、祖先链同步重置 / 加载 | IT-SIDEBAR-001、IT-ANCESTOR-002 |
| 空 / 错误 / 加载 | 每个面板有明确状态，错误可重试，不假空 / 假 0 | CT-STATE-001、IT-STATE-001 |

### 6.2 排除与豁免

- 允许排除：`src/test/**`、`**/*.test.*`、fixtures、`dist/**`、`gallery`、生成文件、纯类型声明（`types.ts` 如仅类型）。
- **不得排除**：`app.tsx`、`api.ts`、`tabsync.ts`、`components/library.tsx` 中的产品逻辑；不得因为“难测”把文件加入 `coverage.exclude`。
- 任何排除项必须在 `test-plan.md` §7 登记：文件 / 原因 / 负责人 / 复核日期；新增排除需 Lead 同意。
- 覆盖率下降若因删除代码导致，按新基线重算；若因新增未测代码，按 patch 阈值阻断，不能用“总覆盖率没降”放行。

## 7. 证据要求

### 7.1 每个用例至少提供

| 证据 | 内容 | 保存位置（目标） | 通过条件 |
|---|---|---|---|
| 命令与退出码 | 完整命令、工作目录、退出码、起止时间 | `frontend/test-results/<run-id>/command.txt` | 退出码 0；失败时为非 0 且保留 |
| 测试报告 | Vitest / Playwright 结果（含用例 ID、耗时、状态） | `frontend/test-results/<run-id>/` | 用例 ID 可对应 test-plan |
| 覆盖率 | `coverage-summary.json` + HTML | `frontend/coverage/` | §6 阈值满足；patch 报告可定位 |
| 断言证据 | 关键 DOM / 请求 / 事件序列摘要 | 测试输出或附加 JSON | 能复核“断言了什么”，不是只写“通过” |
| E2E 失败物 | trace、截图、video（仅失败）、console / network 日志 | `frontend/test-results/e2e/<case>/` | 失败可复现；首次失败保留，不被 retry 覆盖 |
| 视觉 / 布局（375） | `scrollWidth`、`clientWidth`、关键元素 `getBoundingClientRect()`、截图 | `frontend/test-results/layout/` | 无横向溢出；时间轴目标 ≥ 32×32；字号 ≥ 13px（按 DESIGN.md） |
| 构建标识 | 前端 build hash / build-id、后端版本 | 证据头部 | 能定位到具体产物 |

### 7.2 证据规则

- **没有命令 / 输出 / 报告 = 没有通过**；“我跑过了”不算证据。
- 每个 A1–A15 必须能指出至少一个用例 ID + 证据路径；测试计划中的“状态”只能是 `已实现 / 已执行通过 / 失败 / 未跑 / 待实现`，不能写模糊的“OK”。
- 失败必须保留首次失败证据；允许 E2E `retries: 1` 仅用于收集 flake 信息，**首次失败仍记录，重试成功不算通过**。
- 截图只能作为辅助，不能替代 DOM / 行为断言；视觉判断仍走人工走查。
- 证据必须是当前代码 / 当前构建的，不能用旧 run 的结果冒充新提交。
- 禁止：只跑单个用例就宣称全套通过；删除失败用例；把 `test.skip` / `test.fixme` 计入通过；把 console error 抑制后宣称 0。

### 7.3 证据目录与命名

```text
frontend/test-results/
├─ <run-id>/
│  ├─ command.txt          # 命令、cwd、退出码、时间
│  ├─ vitest.json          # L1–L3 结果
│  ├─ junit.xml            # CI 可读结果（如启用）
│  └─ coverage-summary.json
├─ e2e/<case-id>/
│  ├─ trace.zip
│  ├─ screenshot.png       # 失败时
│  ├─ console.json
│  └─ network.json
└─ layout/
   ├─ 375.png
   └─ layout-metrics.json
```

- 用例 ID 写入测试标题或文件头注释（例如 `// CASE: CT-COMPOSER-002`），确保报告能反查 test-plan。
- `run-id` 建议 `YYYYMMDD-HHmmss-<short-sha>`；本地可用 build hash 代替短 sha。
- 证据目录加入 `.gitignore` 的规则由实现任务处理；需要长期保留的验收证据放 `specs/FE-009-frontend-tests/evidence/`，不要提交整个 `test-results/`。

### 7.4 跳过 / 空断言 / flaky

- `test.skip`、`test.todo`、`test.only`、`describe.skip`、`it.concurrent` 滥用一律按失败处理；`only` 会导致其余用例不跑，CI 必须显式禁止。
- 一条测试至少一个有效 `expect`；禁止 `expect(true).toBe(true)`、只 `render` 不查询、只快照不行为断言。
- 允许的临时跳过必须有：原因、issue / 任务号、owner、到期日；在 `test-plan.md` §7 登记；到期未修复自动失败。
- flaky 用例必须隔离并修复，不能以“重跑通过”计入通过；隔离期间该用例的状态是 `quarantined`，不计入覆盖率“通过”证明。
- CI 禁止 `--passWithNoTests`；空测试集必须失败。

## 8. 测试数据与环境

| 层 | 数据 / mock | 隔离 | 确定性 |
|---|---|---|---|
| L1 | 固定数值、固定时间戳（`Date.UTC(...)`）、固定 locale | 无网络；纯内存 | `TZ=Asia/Shanghai`；`vi.useFakeTimers()` / `setSystemTime`；禁止依赖当前时间 |
| L2 | `src/test/fixtures.ts` 的 `session/message/task/artifact/card/projection/metrics` 工厂；每个用例用 `overrides` 生成独立对象 | 不请求真实 API；必要时 MSW 拦截 | 固定 `id`、`at`、`revision`；不共享可变对象 |
| L3 | MSW handlers 覆盖 sessions / messages / overview / metrics / artifacts / usage / stats；fake WebSocket 推送 `reply.delta` / `reply.done` / `message.created` | 不启 `simo.exe`；不碰 8787；每个用例重置 handlers / 连接 | 固定事件 seq / id；异步用 `findBy*` / `waitFor`，禁止 `sleep` |
| L4 | 临时 `AGENTD_HOME`、临时端口（`19120+`）、mock 模型；用 API 种子数据 | 工作区 `.tmp/e2e-<GUID>/`；独立进程；结束后清理 | 固定时区、固定 seed；测试之间不共享会话；双标签用同一 browser context |

### 8.1 必须固定的环境

- **时区**：`TZ=Asia/Shanghai`（L1–L4 一致）；`formatTime` / `formatDate` 才能有稳定期望。
- **时钟**：`vi.setSystemTime(new Date('2026-11-20T10:00:00+08:00'))`；相对时间 / “今日”类逻辑不得依赖真实当前时间。
- **随机 / UUID**：测试中 stub `crypto.randomUUID` 或注入固定 ID；不能依赖随机值做断言。
- **网络**：L1–L3 默认无真实网络；任何未 mock 的请求视为失败（MSW `onUnhandledRequest: 'error'`）。
- **端口**：禁止使用 8787；E2E 用 `19120+` 或系统分配端口，并在 `command.txt` 记录。
- **用户数据**：只用 fixtures / 临时 home；不读取、不修改真实 `%USERPROFILE%\.agentd`。

### 8.2 MSW / fake WS 约定

- MSW handler 必须按 `api.ts` 的真实 URL / 方法 / 返回结构写，不得用“随便返回 200”的 handler；契约以 `docs/task-completion/spec.md` / `api.ts` 类型为准。
- 每个请求失败用例要断言：请求次数、错误展示、重试后的请求次数 / 结果；不能只断言“有错误文案”。
- fake WebSocket 至少支持：`open`、`message`、`close`、重连计数；推送顺序 `reply.delta` → `reply.done`；重复 `message.created` 必须去重。
- BroadcastChannel 在 jsdom 中是 stub，**不能**用它证明跨标签；跨标签只放 E2E。

## 9. 命令与门禁

### 9.1 目标脚本（实现任务落地）

> 当前 `frontend/package.json` **没有** `test:*` scripts；下表是目标契约。实现后脚本必须真实存在，不能用文档冒充。

| 命令 | 内容 | 当前状态 |
|---|---|---|
| `pnpm --dir frontend test:unit` | L1：`src/test/unit/**/*.test.ts` | 未实现 |
| `pnpm --dir frontend test:component` | L2：`src/components/**/*.test.tsx` | 未实现（已有测试文件，无脚本） |
| `pnpm --dir frontend test:integration` | L3：`src/test/integration/**/*.test.tsx` | 未实现 |
| `pnpm --dir frontend test:ci` | L1–L3 + coverage（`vitest run --coverage`） | 未实现 |
| `pnpm --dir frontend test:e2e` | L4 Playwright | 未实现（未安装 Playwright） |
| `pnpm --dir frontend test:e2e:smoke` | §9.3 smoke 子集 | 未实现 |
| `pnpm --dir frontend test` | 本地全量 L1–L3（不含 E2E） | 未实现 |
| `node scripts/check-sdd.mjs` | SDD 最低检查（现有） | 已存在 |
| `pnpm --dir frontend typecheck` | `tsc --noEmit`（现有） | 已存在 |
| `pnpm --dir frontend build` | 构建（现有） | 已存在 |

- 脚本命名可调整，但**语义不能变**：L1/L2/L3 可分别执行；`test:ci` 必须包含 coverage；E2E 必须有 smoke 子集；不得用 `--passWithNoTests`。
- 本地 Node 不在 PATH 时，使用仓库既有 node 路径（如 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`）；CI 由 setup-node 提供。
- 包管理器为 pnpm（`frontend/pnpm-lock.yaml`）；CI 用 `pnpm install --frozen-lockfile`。

### 9.2 门禁

| 场景 | Blocking | Warning | Nightly |
|---|---|---|---|
| PR | `typecheck` + `test:ci`（L1–L3 + coverage 阈值）+ `check:sdd` | E2E smoke（可先 Warning）；`check:visual` | — |
| main / release | 上述全部 + **E2E smoke 100%** + A1–A15 证据 | `check:visual` | full E2E |
| Nightly | — | 全量 E2E、视觉对比、真实模型 smoke | 全量 E2E、视觉、真实模型 |
| 组件变更 | L2 相关用例 + 组件 parity | 视觉截图 | 全量 |

- 失败处理：Blocking 失败不得合并 / 打 tag / 发布；修复后重跑全套，不允许只重跑失败用例就宣称通过。
- 没有测试步骤的 CI 视为门禁缺失；`deploy/CI.md` 的 `build-test` 必须在 Web 构建前执行 `test:ci`（实现任务修改，不在本 spec 内改 CI）。
- `check:visual` 仍为 Nightly / Warning，不因本 spec 升级为 Blocking。

### 9.3 E2E smoke 集合（Release Blocking）

1. `E2E-SHELL-001`：启动 → 对话页加载 → 无 console/pageerror。
2. `E2E-CHAT-001`：选会话 → 发送 → 流式完成 → 消息落位。
3. `E2E-TIMELINE-001`：时间轴点击 → 跳转 / active → 32px 目标。
4. `E2E-TABS-001`：双标签 active session 同步。
5. `E2E-RESP-001`：375 视口无横向溢出。

full E2E 覆盖 §test-plan 的其余旅程，作为 Nightly / 发布前完整验证。

## 10. 需求（R1–R10）

| ID | 级别 | 需求 |
|---|---|---|
| R1 | MUST | 定义 L1–L4 分层、各层职责 / 工具 / 环境 / 运行预算 / 门禁；L1–L3 可在无真实后端时运行。 |
| R2 | MUST | 每个功能点 F01–F15 在矩阵登记，并有至少一条 L2 或 L3 行为用例；F10 跨标签必须 L4。 |
| R3 | MUST | 每个用例有唯一 CASE-ID、前置、操作、可执行断言、数据 / mock、层、优先级；禁止只渲染 / 只快照 / 空断言。 |
| R4 | MUST | 覆盖阈值按 §6 执行：patch 85/85/75/80、核心纯逻辑 100% statements/lines + ≥90% branches、关键决策 100%、组件库基线 80/80/70/75；全仓只做趋势。 |
| R5 | MUST | 测试数据全部 fixture / mock；L1–L3 无真实网络，L4 用临时 home / 端口 / mock 模型；不碰 8787 与真实用户数据。 |
| R6 | MUST | 每个 A1–A15 有证据：命令、退出码、报告、覆盖率、DOM / 请求断言、E2E trace / 截图；没有证据不算通过。 |
| R7 | MUST | 门禁分层：PR Blocking 为 typecheck + test:ci + coverage + check:sdd；main/release 加 E2E smoke；Nightly 跑 full E2E / 视觉；`check:visual` 不 Blocking。 |
| R8 | MUST | 禁止 `skip` / `todo` / `only` / `passWithNoTests` / 空断言；临时跳过必须有 issue、owner、到期日并登记；flaky 隔离，重试不算通过。 |
| R9 | MUST | 每个交互组件覆盖键盘 / 焦点 / 名称 / ARIA；375 视口无横向溢出；时间轴点击目标 ≥ 32×32，字号 ≥ 13px（按 DESIGN.md）。 |
| R10 | MUST | 用例与 A / R 可追溯；新增 / 删除 / 改期望必须同步 spec / test-plan；测试代码纳入类型检查与 review，不测内部实现细节。 |

## 11. 验收标准（A1–A15）

| ID | 场景 | 通过标准 | 主要证据 |
|---|---|---|---|
| **A1** | 正常主路径 | 启动 → 选会话 → 发送 → 流式完成 → 卡片 / 右栏 / 工作台可见；L2/L3/L4 至少各一条；无错误态 | IT-SHELL-001、IT-CHAT-001、IT-COMPOSER-001、E2E-CHAT-001；命令 + 报告 |
| **A2** | 边界值 | 0 / 999 / 1000 / 9999 / 10000 / 12345 tokens；0、1、多条消息时间轴；超长文本；375 宽度；32px 目标；边界不裁切、不溢出、不误判 | UT-FMT-001..004、CT-COMPOSER-010、CT-TIMELINE-001、E2E-RESP-001；coverage + layout JSON |
| **A3** | 错误路径 | 会话 / 消息 / 指标 / 卡片 / 发送 / 祖先加载失败均有可读错误 + 重试；重试后请求次数 / 状态正确；无假空 / 假 0 | CT-SIDEBAR-007、CT-COMPOSER-006、CT-CARD-002、CT-METRICS-002、IT-SIDEBAR-002、IT-CHAT-003、IT-ANCESTOR-002；请求日志 |
| **A4** | 空状态 | 无会话、无消息、无任务 / 交付物、无指标、无祖先时显示明确空态；不显示 0 / 示例数据；空态不遮挡输入 | CT-SIDEBAR-007、CT-TIMELINE-002、CT-OVERVIEW-001、CT-METRICS-002、IT-CHAT-002、IT-STATE-001、E2E-EMPTY-001；截图 + DOM |
| **A5** | 加载状态 | 会话 / 消息 / 右栏 / 指标加载中显示 loading / skeleton / status；加载期间禁止重复提交；完成后不闪回旧数据 | CT-SIDEBAR-007、CT-OVERVIEW-001、CT-METRICS-002、IT-CHAT-001、E2E-SHELL-001；时序断言 |
| **A6** | 键盘 | Tab 顺序、Enter / Space 激活、Escape 关闭提示、Composer Enter / Shift+Enter / Ctrl+Enter、IME 不误发、时间轴方向键 / Home / End；焦点可见、无键盘陷阱 | CT-COMPOSER-002..005、CT-SIDEBAR-002/003、CT-TIMELINE-006、E2E-A11Y-001；键盘操作记录 |
| **A7** | 375 / 响应式 | 375×812 无横向溢出；侧栏 / 主体 / 右栏可到达；时间轴目标 ≥ 32×32；1180 / 1600 不破版 | E2E-RESP-001、CT-TIMELINE-007；375 截图 + layout JSON |
| **A8** | console / 资源 | 主流程 `console.error` 0、`pageerror` 0、未处理 rejection 0、关键资源 404 0；允许的白名单 warning 必须登记 | IT-QUALITY-001、E2E-QUALITY-001；console / network JSON |
| **A9** | 覆盖率 | 生成 `coverage-summary.json`；patch 85/85/75/80、核心纯逻辑 100% statements/lines + ≥90% branches、关键决策 100%、组件库 80/80/70/75 均满足；无隐藏关键文件 | GATE-COV-001；覆盖率报告 + 排除清单 |
| **A10** | 无跳过 | 全量执行中 `skip` / `todo` / `only` 为 0；无空断言；无 `passWithNoTests`；用例数不低于基线；临时跳过有登记 / 到期日 | GATE-NOSKIP-001；测试报告 + 扫描日志 |
| **A11** | 分层与 CI 接线 | L1–L4 脚本可分别执行；`test:ci` 接入 CI；E2E smoke 有独立 job / 发布步骤；功能矩阵 F01–F15 全部有映射 | GATE-CI-001；CI 日志 / 脚本清单 |
| **A12** | 数据隔离 / 确定性 | 测试不访问真实网络 / 模型 / 用户数据；固定 TZ / 时钟 / ID；E2E 临时 home / 端口；清理完成；连续两次结果一致 | IT-ISOLATION-001、E2E-ISOLATION-001；两次运行报告 |
| **A13** | 可访问性 / 语义 | 交互控件有可访问名称与角色；landmark / 表格 / 提示语义正确；错误 `role=alert`、加载 `role=status`；焦点不丢失；颜色不是唯一信息 | CT-A11Y-001、E2E-A11Y-001；DOM / axe（可选）报告 |
| **A14** | 证据 / 可追溯 | R1–R10、F01–F15、A1–A15 都能追到 CASE-ID 和证据路径；证据含命令 / 退出码 / 报告 / 构建标识；未跑项明确写“未跑” | GATE-TRACE-001；映射表 + 证据索引 |
| **A15** | 门禁 / 回归 | 干净检出执行 Blocking 套件通过；失败 / 跳过 / 覆盖率不足会阻断；旧 spec 与组件 parity 不回归；release 必须有 A1–A15 签收 | GATE-RELEASE-001；CI 失败样例 + release 记录 |

## 12. 影响范围

- **本 spec / test-plan**：只新增 `specs/FE-009-frontend-tests/` 文档；不改产品代码、不改 `frontend/`、不改 CI。
- **实现阶段（另开任务）** 预计涉及：
  - `frontend/package.json`：新增 `test:*` scripts（不改产品依赖；Playwright 仅 devDependency）。
  - `frontend/vitest.config.ts`：固定 `TZ`、coverage include / exclude、reporters、阈值；不降低现有阈值。
  - `frontend/src/test/unit/`、`frontend/src/test/integration/`、`frontend/src/components/**/*.test.tsx`、`frontend/e2e/`。
  - `frontend/src/test/setup.ts`、`fixtures.ts`：固定时钟 / 随机 / MSW 生命周期。
  - `deploy/CI.md` 与 `.github/workflows/ci.yml`：增加前端测试步骤 / E2E job。
- **不影响**：后端 API 语义、数据库、`simo.exe`、8787 实例、视觉基线、组件 manifest 的既有条目（新增测试不改变组件契约）。
- **验收责任**：测试 owner 提供策略 / 证据；前端 owner 提供可测性与用例；验收 owner 独立抽查 A1–A15；Lead 裁决门禁与豁免。

## 13. 风险与待确认

| 风险 / 待确认 | 影响 | 处理 |
|---|---|---|
| **FE-009 编号重复** | 引用 `FE-009` 时可能指多标签或测试体系 | 本目录名带 `frontend-tests`；建议评审后改 `FE-010`；改号前引用必须带目录名 |
| Playwright 未安装 / CI 无浏览器 | L4 无法执行，E2E 门禁落空 | 实现任务安装 Chromium；CI 加 `playwright install --with-deps chromium`；未完成前 E2E 状态为“未实现”，不得写通过 |
| 首批组件测试仍在并行编辑 | 文档状态 / 用例 ID 可能瞬时不一致 | 以测试报告为准；本 spec 不把“文件存在”当通过；实现任务统一补 CASE-ID |
| `app.tsx` 单文件、页面逻辑集中 | L3 过度 mock 内部实现，测试脆弱 | 只 mock `api.ts` / WS / BroadcastChannel 边界；用真实子组件；必要时再拆纯函数（单独任务） |
| jsdom 无真实布局 / BroadcastChannel | 375、跨标签、滚动无法证明 | 这些只放 L4；L2 只断言语义 / 状态，不断言像素 |
| 覆盖率阈值被“刷数字” | 测试多但风险没覆盖 | 关键决策清单 + 功能矩阵 + review 检查断言质量；总覆盖率只做趋势 |
| 时序 / 动画 / hover delay 导致 flaky | 重试掩盖真实问题 | fake timers 精确推进；E2E 用 `expect.poll` / 稳定 locator；flaky 隔离，重试不算通过 |
| 时区 / locale 不稳定 | `formatTime/Date` 断言随环境变 | `TZ=Asia/Shanghai` + 固定时间戳；CI / 本地同一时区 |
| CI 时间过长 | PR 反馈慢 | PR 只跑 L1–L3 + coverage；E2E smoke 在 main / release；full E2E Nightly |
| 视觉门禁被误升级为 Blocking | 动态数据导致假失败 | 保持 `check:visual` Nightly / Warning；行为测试用 DOM 断言，不靠像素 |
| M40 视觉细节（13px / 32px / 6 条上限）当前实现未必全部满足 | 测试可能先红 | 只把已确认的 DESIGN.md 要求写成断言；未实现项标“待实现”，先记录不伪造通过；产品修复另开任务 |

## 14. 参考

- 流程与模板：[`FRAMEWORK.md`](../../docs/process/FRAMEWORK.md)、[`SCENARIOS.md`](../../docs/process/SCENARIOS.md)、[`ROLES.md`](../../docs/process/ROLES.md)、[`testing-strategy`](../../docs/process/skills/testing-strategy/SKILL.md)、[`test-plan 模板`](../../docs/process/templates/test-plan.md)、[`evidence 模板`](../../docs/process/templates/evidence.md)。
- 发布与组件门禁：[`RELEASE-CHECKLIST.md`](../../docs/process/RELEASE-CHECKLIST.md)、[`COMPONENT-PARITY-GATE.md`](../../docs/process/COMPONENT-PARITY-GATE.md)。
- CI：[`deploy/CI.md`](../../deploy/CI.md)、[`deploy/README.md`](../../deploy/README.md)。
- 前端测试设施：`frontend/vitest.config.ts`、`frontend/src/test/setup.ts`、`frontend/src/test/fixtures.ts`、`frontend/src/components/manifest.json`。
- 相关 spec：[`FE-001`](../FE-001-frontend-rebuild/spec.md)、[`FE-002`](../FE-002-chat-robustness/spec.md)、[`FE-003`](../FE-003-chat-capabilities/spec.md)、[`FE-004`](../FE-004-first-run-empty/spec.md)、[`FE-005`](../FE-005-workbench/spec.md)、[`FE-006`](../FE-006-chat-experience/spec.md)、[`FE-007`](../FE-007-ancestor-messages/spec.md)、[`FE-008`](../FE-008-metrics-dashboard/spec.md)、[`FE-009-web-multitab`](../FE-009-web-multitab/spec.md)。
- 视觉基线：`DESIGN.md`（暖纸 #FAF9F6、无渐变）；`check:visual` 仍为 Nightly / Warning。
