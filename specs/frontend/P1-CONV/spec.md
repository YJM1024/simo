# 前端长期 Spec · 会话域（P1-CONV）

> **文档类型**：长期 Spec（按域一个文件，功能点按 ID 分节；粒度依据 `docs/plan/MASTER-PLAN.md` §1.7）
> **域**：`P1-CONV` 会话域 ｜ **验收面**：13 个 PRD（CONV-001..009 + SYNC-001..004；SYNC-005 已于 2026-11-22 移除）
> **上游**：`specs/product/P1-CONV/spec.md`（行为契约的唯一事实来源；本文件只把它落成**前端可验收的契约**）
> **本轮变更包**：`specs/changes/CHG-CONV-007/`（会话内任务与编排，18 条 AC 已冻结）；`specs/changes/CHG-CONV-006/` 为上一轮右栏投影变更包
> **owner / 角色**：前端（`frontend`）。本文件由 `CHG-CONV-006` `TASK-W3-09` 产出，**不含实现、不改代码**
> **状态**：`draft` —— 契约事实已核对到代码，待 Lead/设计 review 后置 `ready`
> **代码基线（实读校验）**：`frontend/src/app.tsx` 732 行 ／ `frontend/src/components/library.tsx` 818 行 ／ `frontend/src/api.ts` 176 行 ／ `frontend/src/types.ts` 140 行 ／ `frontend/src/tabsync.ts` 28 行 ／ `frontend/src/components/components.css` 1017 行 ／ `frontend/src/styles/tokens.css` 169 行。核对时间 2026-11-21。
> **边界**：本文件不定义视觉稿、不定义后端实现、不定义测试代码；视觉签字归用户，功能签字归验收 Agent（不得自签，`CHG-CONV-006/product.md` §6）。

---

## 1. 目录、索引与全域通用约定

### 1.1 PRD → 本文件节号 索引

| 节 | PRD-ID | 名称 | P | 产品 spec 状态 | 前端契约状态 | 主组件 | 主接口 | 证据级别 |
|---|---|---|---|---|---|---|---|---|
| §2 | `PRD-CONV-001` | 会话树与主会话 | P0 | implemented | 契约完整（置顶项本轮验收） | `Sidebar` / `App` | `GET /api/sessions/tree`、`.../pin`、`.../unpin` | 单测 + CDP 01a/08/10/11 |
| §3 | `PRD-CONV-002` | 会话生命周期 | P0 | implemented | 契约完整，缺删除入口 | `Sidebar` / `App` | `POST/PATCH /api/sessions`、`.../archive` | 单测 + 组件 + CDP 08/09/10/15/16 |
| §4 | `PRD-CONV-003` | 会话搜索与未读 | P1 | **partial** | **契约与实现不一致** | `Sidebar` | `GET /api/sessions?q=`（目标） | 组件 + CDP 14 |
| §5 | `PRD-CONV-004` | 消息流与渲染 | P0 | implemented | 契约完整，缺分页与纯度映射 | `ConversationPanel` / `MessageItem` | `GET /api/messages` | 组件 + CDP 01a/05/12/16 |
| §6 | `PRD-CONV-005` | 发送·流式·断线重连 | P0 | implemented | 契约完整，幂等缺口 | `Composer` / `App` | `POST /api/chat` + WS | 组件 + CDP 02/16 |
| §7 | `PRD-CONV-006` | Composer 输入与快捷键 | P0 | implemented | 契约完整 | `Composer` | localStorage + BC | 组件 + CDP 03/13 |
| §8 | `PRD-CONV-007` | 祖先消息整级加载 | P1 | implemented | 契约完整；命中区已改为整列口径（C-06），缺部署验证 | `TimelineGroups` / `TimelineTip` | `GET /api/sessions/{id}/messages` | 组件 + CDP 04a–04d/12 |
| §9 | `PRD-CONV-008` | 右栏会话投影 | P1 | implemented（本轮新增） | 契约完整，缺 304、「未开始」组与草稿占位 | `RightPanel`＝`OverviewPanel` | `GET .../spec-projection` | 组件 + CDP 01a/06 |
| §10 | `PRD-SYNC-001` | WS 连接与重连 | P0 | implemented | 契约完整，缺 `closed` 态 | `StatusBar` / `App` | `GET /api/ws` | 组件 + CDP 02/13 |
| §11 | `PRD-SYNC-002` | 多标签 active/ancestor/read | P0 | implemented | **契约完整，零自动化证据** | 无 UI（`useTabSync`） | BroadcastChannel | 仅 CDP 13（部分） |
| §12 | `PRD-SYNC-003` | 发送模式跨标签同步 | P1 | implemented | 契约完整 | `Composer` | localStorage + BC | 组件 + CDP 13 |
| §13 | `PRD-SYNC-004` | 未读与已读游标 | P1 | **partial** | **契约与实现不一致** | `Sidebar` / `App` | 仅前端内存态 | 无（`missing`） |
| §17 | `PRD-CONV-009` | 会话内任务与编排 | P1 | `gap`（18 条 AC 未实现） | 契约完整，待实现 | `RightPanel` / `TaskPanel` / `TaskDetail` / `TaskGraphDialog` / `MessageItem` | N1–N9（见 §17.3） | 组件 + CDP + 单测（待建） |

排除项：`PRD-SYNC-005`（远程访问与通知中心）已于 2026-11-22 移除，编号不复用，本文件不写前端契约。

各节「接口调用」表首列登记的是 `sendChat`、`connectEvents` 这类接口操作名，不是 props 或字段名；MX-G-27 只按表头识别字段列，不读首列操作名。组件 props、发送入参与消息字段统一登记在 §1.8，契约表类 1 的前端行与本节同名同类型。

### 1.2 组件边界（样式与复用规则）

1. **唯一页面容器是 `App`**（`frontend/src/app.tsx:49`）；所有页面级组合只发生在 `app.tsx:638-731`。页面不新起平行容器。
2. **组件只有一处来源**：`frontend/src/components/library.tsx`（单文件库），公开出口 `frontend/src/components/index.ts:1`（`export * from './library'`）。`app.tsx:13-24` 的 import 全部来自该出口，不允许页面直接引第三方 UI 库。
3. **`src/components/` 之外的页面不许自带样式**：样式入口只有 `frontend/src/styles.css:1-3`（`tailwindcss` → `tokens.css` → `components.css` 三段），页面文件（`app.tsx`/`gallery.tsx`/`main.tsx`）不含 `<style>`、不含 CSS-in-JS、不新增 `.css` 文件。新增样式一律追加到 `components/components.css` 并复用 `components.css` / `tokens.css` 的 token（尺寸 token 见 `tokens.css:108-147`）。
4. **组件登记**：`frontend/src/components/manifest.json:1-4` 声明 `owner: "frontend"`、`source: "src/components/"`、`publicApi: "src/components/index.ts"`；`manifest.json` 的 `components[33]` 是签收清单，新增/改签名必须同批更新（本轮 5 个 COMP 签收归 `TASK-W2-07`）。
5. **组件形态**：一律**受控**（数据由 `App` 的 state 经 props 下传，组件内只保留纯 UI 态：`editing`/`menuId`/`values`/`expanded` 等）。`Composer`、`Sidebar` 的本地态不承载服务端事实。

### 1.3 状态归属（跨节共用的唯一口径）

| 事实 | 归属 | 位置 |
|---|---|---|
| 会话树、active 会话、搜索词/结果 | `App` state | `app.tsx:51-57` |
| 当前会话消息、流式增量 | `App` state + ref | `app.tsx:58`、`:102-111` |
| 祖先消息链 | `App` state + ref | `app.tsx:59-66` |
| 右栏投影 | `App` state | `app.tsx:67`、`:74-75` |
| 连接态 | `App` state | `app.tsx:72`（初值 `'connecting'`） |
| 未读 | `App` state | `app.tsx:98`（现状为数字，见 §13 冲突 C-02） |
| 发送模式 | `Composer` state + localStorage | `library.tsx:518-529` |
| 行内菜单/重命名/展开态 | 对应组件的本地 UI 态 | `library.tsx:71-75`、`:656` |

**不引入状态库**：现状无 Redux/Zustand/React Query，本轮契约不改变这一点（新增依赖属架构变更，不在本轮范围）。

### 1.4 错误呈现三级（全域统一，避免各节重复定义）

1. **字段/卡片内联**：只看局部失败 —— `CardBlock` 的 `p.card-error`（`library.tsx:259`，`role="alert"`）。
2. **页面级**：影响消息区 —— `p.err-text`（`app.tsx:676-677`，`role="alert"`）或 `ConversationPanel` 的 error 态（`app.tsx:667-669`）。
3. **全局 toast**：侧栏操作的失败 —— `opError` → `button.toast`（`app.tsx:728`，`role="alert"`，样式 `components.css:289`）。
4. 四态统一用 `LoadingState`（`library.tsx:634-636`，`role="status"`）、`ErrorState`（`:638-640`，`role="alert"` + 重试）、`EmptyState`（`:625-632`）；不允许各页面自造等价物。
5. **不显示假 0/假成功**：数值未知时用 `—`（`library.tsx:158`、`MetricsDashboard` `ms()` `:762`）。

### 1.5 证据通道与用例命名

- **单元/组件**：`cd frontend; pnpm test`（vitest，基线 115 例，`--pool=threads`）。文件即 `frontend/src/**/*.test.tsx`。
- **E2E（真实通道）**：`frontend/e2e/scripts/cdp-runner.mjs` → 19 个场景，基线 19/19 PASS ×2（`frontend/e2e/report/cdp/audit-P1-CONV.md`）。场景号（01a/01b/02…16）在本文件直接引用。
- **Playwright 用例**：`frontend/e2e/specs/*.spec.ts` 共 11 个 test，**当前不可执行**（fork worker `spawn EPERM`，审计 §7.9）。本文件引用它们仅作契约语义映射，**不作为通过证据**。
- **命名约定（建议）**：单元/组件 `T-<PRD>-<序号> <行为>`；E2E 用现有 `E2E-<域>-<序号>` 前缀（`E2E-SHELL-001`、`E2E-CHAT-001`、`E2E-COMPOSER-001`、`E2E-ANCESTOR-001`、`E2E-ERROR-001`、`E2E-OVERVIEW-001`、`E2E-DELIVERABLE-001`）。
- 缺证据的 AC 一律写 `missing`，不得写"通过"（`CHG-CONV-006/tasks.md` 证据列口径）。

### 1.6 尺寸与断点基线（可测断言的公共参数）

- 触控目标基线 **≥44×44px**（产品 §5 A4 与 AC-CONV-007-02 的隐含门槛）。该基线适用于**孤立控件**；密集时间轴轨道例外，按**整列 44px 命中面**验收（§8.4、C-06）。现状大量控件低于此值，逐节标注。
- 断点（`em×16`）：`1500px`(93.75em) ／ `1180px`(73.75em，`:349-353`、`:519-521`、`:982`) ／ `1024px`(64em，**右栏隐藏** `:355`、`:523`) ／ `900px`(56.25em，**时间轴下边界**：小于 900 隐藏、900 起显示，`:381`、`:946-947`) ／ `760px`(47.5em，**左栏隐藏** `:377`) ／ `480px`(30em)。
- 三档验收宽度：**375 / 768 / 1280**（产品 §5 A4）。1280 落在"时间轴显示、右栏显示"区间。
- 关键布局量：`--sidebar:240px`、`--rail:300px`、`--gutter-timeline:44px`、`--conversation-card-w:720px`、`--chat-width:760px`（`tokens.css:85-92`）。`--gutter-timeline` 同时是时间轴**整列命中面**的宽度（44px），不再按逐条热区理解。

### 1.7 状态词

`draft → ready → in-progress → implemented → verified → accepted`（`docs/plan/MASTER-PLAN.md` §1.2）。本文件自身状态 `draft`；每个功能点的"前端契约状态"只允许四值：**契约完整 / 缺实现 / 与实现不一致 / N/A**。

§1.1 索引表「产品 spec 状态」「前端契约状态」两列登记实现进度（`implemented`、`partial` 等），不进入状态机解析。前端与契约类 2 对应的只有一个维度，即任务展示态，四个取值与五条迁移登记在 §17.9.4；结构化状态表存在时 MX-G-28 不扫描散文箭头，因此不会再把 `rror`、`ode`、`vent` 这类切词残片当状态。

### 1.8 props 与消息字段

本表登记前端对外契约里真实存在的字段，契约表类 1 的 CT-CONV-042 至 CT-CONV-055 与本表逐行同名同类型。归属列写明字段属于哪类结构；`Message` 的字段与 §17.6.1 的判定字段一致，跨标签同步消息的字段与 §12 的事件载荷一致。

| 字段 | 类型 | 归属 | 说明 |
|---|---|---|---|
| `disabled` | bool | `Composer` props | 发送中或会话只读时为 `true`（`app.tsx:687-688`） |
| `streaming` | bool | `Composer` props | 流式增量进行中为 `true` |
| `sendError` | string | `Composer` props | 发送失败文案；空串表示无错误 |
| `sessionId` | string | `sendChat` 入参 | 目标会话 id |
| `text` | string | `sendChat` 入参 | 用户输入正文，发送前 trim |
| `clientMutationId` | string | `sendChat` 入参 | 一次发送一个，重试复用 |
| `role` | string | `Message` 结构 | `user`、`agent`、`system` |
| `category` | string | `Message` 结构 | 任务卡片消息为 `task` |
| `taskId` | string | `Message` 结构 | 任务卡片消息指向的任务 id |
| `batchId` | string | `Message` 结构 | 批量创建时写入的批次 id |
| `taskCount` | number | `Message` 结构 | 批次消息的任务数，1–12 |
| `tabId` | string | 跨标签同步消息 | 发送方标签 id |
| `opId` | string | 跨标签同步消息 | 一次操作一个，接收方按它去重 |
| `at` | number | 跨标签同步消息 | 发送时间毫秒时间戳 |

各组件另有本地 UI 态（`editing`、`menuId`、`values`、`expanded` 等），只在组件内使用，不经 props 下传，也不进契约表。

---

## 2. `PRD-CONV-001` · 会话树与主会话

来源：`specs/product/P1-CONV/spec.md:56-74`（AC-001-01 `:71`、AC-001-02 `:72`、AC-001-03 `:73`、AC-001-04 `:74`）

### 2.1 组件与页面结构

- `App`（`app.tsx:49`）→ `aside.sidebar`（`app.tsx:639-641`）→ `Sidebar`（`library.tsx:50-162`）→ 行渲染 `renderRow`（`library.tsx:90-117`）；中栏 `section.page-chat[aria-label="对话"]`（`app.tsx:656`）。
- **会话树**：数据是树形 `GET /api/sessions/tree`，`App` 存原始树（`app.tsx:51`）并用 `flattenTree`（`:28-38`）派生扁平列表（`:113`）供查找/计数；`Sidebar` 按层渲染，子级用 `.session-row.child` 缩进（`components.css:446`），过滤对子会话同样生效（`library.tsx:119-126`）。
- **active 高亮**：由 `activeId`（`app.tsx:57`，初值 `'main'`）驱动，行容器预留左侧 2px 边线（`components.css:443` 的 `border-left:2px solid transparent`）。
- **主会话**：`activeId==='main'` 是默认态；中栏标题取 `activeSession.title ?? '主会话'`（`app.tsx:657`）。
- **底部统计区**：`.quota`（`library.tsx:158`）+ `.user`（`:159`）+ `StatusBar`（`:164-166`）；连接文案在 `.ws`（`:131-137`）与 `footer.statusbar`（`:164`）两处，桌面端 `.status` 在 `≤480px` 隐藏（`components.css:393`）。

### 2.2 状态与数据流

- `sessions` / `sessionsLoading` / `sessionsError`（`app.tsx:51-53`）是唯一树状态；`loadSessions`（`:129-146`）在挂载（`:280-284`）与会话增删改后调用。
- 「activeId 不在新树中则切到第一个」（`app.tsx:137-140`）——刷新树后的兜底选中规则。
- 切会话由 `switchSession`（`app.tsx:612-616`）完成：先存当前 `scrollTop`（`:94`），再 `setActiveId`；随后由 `app.tsx:295-311` 的 effect 统一清空消息/祖先/投影并重拉。
- **跨标签写点**：`activeId` 变化 → `publishTabSync({type:'active_session_changed', …})`（`app.tsx:229-233`），读点见 §11。
- **循环父链守卫**：`nextParent` 沿 `parentId` 上行时用 `visitedAncestorIds`（`app.tsx:581`、`:582-591`）防环；渲染不做递归展开，因此父链异常只会表现为"多出一条祖先"而不会破版。

### 2.3 接口调用

| 方法（`api.ts`） | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `listSessions` | `(): Promise<{sessions?: Session[]; tree?: Session[]}>`（`:27-29`） | `GET /api/sessions/tree` | 无 | `Session{id,parentId,title,createdAt,archived,pinned,children?}`（`types.ts:1-10`） |
| `listMessages` | `(sessionId, limit=100)`（`:31-33`） | `GET /api/messages?sessionId=&limit=` | `sessionId`、`limit` | `{messages?, hasMore?}` |
| `getPermissions` | `(sessionId)`（`:59-61`） | `GET /api/permissions?sessionId=` | `sessionId` | `{permissions?: PermissionState}` |
| `getStats` | `(metric='messages')`（`:67-69`） | `GET /api/stats?metric=&granularity=day` | `metric` | `{buckets?, totals?}` |

错误路径：统一走 `request()`（`api.ts:9-25`）→ 网络失败 `网络请求失败，请检查连接后重试`（`:14`），非 2xx `请求失败（N），请稍后重试`（`:21`）。树加载失败落 `.sidebar .state-error`「会话加载失败」（`library.tsx:149`，CDP 15 已验证含「请求失败（500）」）；统计失败落 `.quota`「统计加载失败」（`library.tsx:158`），**不显示 0**。

#### 置顶入口（`AC-CONV-001-04`，本轮验收面）

| 方法（`api.ts`，待新增） | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `pinSession` | `(id: string): Promise<{ok: boolean; session: Session}>` | `POST /api/sessions/{id}/pin` | 无 body | `200 {ok:true, session}`（`sessions/http.go:72-79`） |
| `unpinSession` | `(id: string): Promise<{ok: boolean; session: Session}>` | `POST /api/sessions/{id}/unpin` | 无 body | `200 {ok:true, session}`（`sessions/http.go:81-88`） |

契约：

1. **入口位置**：会话行菜单 `.session-menu`（`library.tsx:115`）内的第二项，与「归档/恢复」并列；文案按 `session.pinned` 在「置顶」与「取消置顶」之间切换（`Session.pinned` 已在类型里，`types.ts:1-10`）。
2. **可见条件**：仅**非主会话**且**非草稿会话**渲染该项；主会话（`id === 'main'`）不显示；归档会话不显示（产品 AC-001-04 要求"归档会话不可置顶"，按"不渲染"实现，不置灰）。
3. **调用与收敛**：点击后调 `pinSession`/`unpinSession`；成功后不做本地排序、不做本地调序，一律以 `loadSessions()` 重拉后的服务端顺序为准。**置顶只影响同级分组（同 `parentId` 的兄弟行）内的顺序，不改变父子归属、不提升到顶层；同级唯一子会话无兄弟可比时行序不变属预期。**（扁平列表的排序口径为 `pinned DESC, created_at DESC, id DESC`，后端 `sessions/service.go:228`；树通道现状见 C-18。）
4. **失败**：走全局 `opError` toast（`app.tsx:728`），列表保持原顺序，不做乐观置顶。
5. **菜单关闭**：点击任一项后 `menuId` 复位，菜单收起。

现状：`library.tsx:114-115` 的菜单当前只有「归档/恢复」一项，置顶项与 `api.ts` 的两个函数尚未接线；本条按 Lead 2026-11-21 裁决进本轮验收面（范围变更登记见 §冲突 C-17）。

### 2.4 交互细节（可测断言级）

- **点击切换**：整行可点（`onClick→onSelect`，`library.tsx:93`）；行是 `role="button"` + `tabIndex={0}`（`:94-96`）。
- **Enter 切换**：行聚焦后按 Enter 触发选中（`library.tsx:94-96`）；空格键**未**绑定（现状只判 Enter）。
- **双击重命名**：`onDoubleClick`（`library.tsx:92`）进入编辑，编辑框不冒泡（`:110-111`），避免双击选中两行。
- **焦点可见**：全局 `:focus-visible` 描边（`components.css:20`），行与按钮均继承，不额外覆盖。
- **点击区**：`.session-row` 高 `--size-32`＝**32px**（`components.css:443`）＜44px；`.session-more` 20×20 且默认 `opacity:0`（`:774`），仅 hover/focus-within 可见（`:775`）→ 触屏不可达。两条都记为后续视觉/交互返工项（§冲突 C-11）。
- **历史会话展开收起**：`显示归档` 按钮 `aria-pressed={showArchived}`（`library.tsx:144-146`）控制归档会话是否出现在列表（过滤 `:119-126`）；归档行 `opacity:.55`（`components.css:773`）。
- **置顶/取消置顶**：菜单项在非主会话、非草稿、非归档的会话行上出现（`.session-menu`，`library.tsx:115`）；点击后菜单立即收起，成功以 `loadSessions()` 重拉顺序为准，失败出 `opError` toast 且列表不变；置顶行排序由服务端决定，前端不得二次排序。
- **空/加载/错误/无匹配文案**（可逐字断言）：`会话加载中…`（`:148`）、`会话加载失败`（`:149`）、`搜索中…` / `没有匹配的会话` / `暂无会话`（`:150`）。

### 2.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 渲染会话、选中态、连接与配额 | `Sidebar.test.tsx:39` | ✅ |
| 点击与 Enter 都能切换 | `Sidebar.test.tsx:50` | ✅ |
| 归档/恢复 + `显示归档` | `Sidebar.test.tsx:90`；`App.conversation.test.tsx:122-135` | ✅（但含主会话，见 C-03） |
| 空/加载/错误/重试 | `Sidebar.test.tsx:59/76/134`；CDP 15 | ✅ |
| 切换后中栏确实变化（E2E） | **无**（CDP 11 只断言"仅 1 个 `.tlg-session` 且标题正确"） | `missing` |
| 主会话无归档入口 + 服务端拒绝可读 | **无**（现有用例断言相反） | `missing` |
| 重命名 Escape 不落库 / 空值不提交 | CDP 09 | ✅（仅 CDP） |
| 统计失败不出假 0 | `App.conversation.test.tsx:163+` | ✅ |
| 循环父链被拒 | 后端 `TestM14SessionPathCycleGuard`；前端由 `visitedAncestorIds`（`app.tsx:581-591`）保证 | ✅（间接） |
| 点击区 ≥44px | **无** | `missing` |
| 置顶/取消置顶调用正确接口、顺序以服务端为准、失败出 toast | **无**（入口未接线，`library.tsx:114-115`） | `missing` |
| 主会话/草稿/归档会话不出现置顶项 | **无** | `missing` |

建议用例名：`T-CONV-001-07 切换会话后中栏消息与标题同批更新`、`T-CONV-001-08 主会话行不渲染归档菜单项`、`T-CONV-001-09 会话行点击区不小于 44px`、`T-CONV-001-10 置顶后顺序来自服务端且前端不重排`。

### 2.6 涉及文件:行号

`frontend/src/app.tsx:28-38, 49, 51-57, 113, 129-146, 229-233, 280-284, 295-311, 581-591, 612-616, 639-641, 656-660, 728` ／ `frontend/src/components/library.tsx:50-162, 90-117, 114-115, 119-126, 131-137, 148-150, 158-159, 164-166` ／ `frontend/src/components/components.css:20, 443-449, 446, 773, 774-775, 777-779, 393` ／ `frontend/src/styles/tokens.css:85-92` ／ `frontend/src/api.ts:27-29, 59-61, 67-69`（`pinSession`/`unpinSession` 待新增） ／ `backend/internal/modules/sessions/http.go:72-88`

---

## 3. `PRD-CONV-002` · 会话生命周期（新建/重命名/归档/恢复/删除）

来源：`specs/product/P1-CONV/spec.md:76-92`（AC-002-01 `:90`、AC-002-02 `:91`、AC-002-03 `:92`）

### 3.1 组件与页面结构

- 新建：`.ws` 区「＋」按钮（`library.tsx:129-136`）→ `onCreate` → `App.createSession`（`app.tsx:564-576`）。
- 重命名：行双击进入 `input.session-rename`（`library.tsx:100-113`，`aria-label="重命名会话"`，`components.css:449`）→ `onRename` → `App.rename`（`app.tsx:552-562`）。
- 归档/恢复：行尾 `button.session-more[aria-label="会话操作"]`（`library.tsx:114`）→ `.session-menu` 单按钮「归档/恢复」（`:115`，样式 `components.css:777-779`）→ `onArchive` → `App.toggleArchive`（`app.tsx:465-476`）。
- 删除：**现状无任何入口**（`library.tsx` 与 `app.tsx` 全文无 delete）。目标契约见 §3.4。
- 全局反馈：`opError` → `button.toast`（`app.tsx:728`）。

### 3.2 状态与数据流

- `sessions`（`app.tsx:51`）是唯一列表事实；新建**乐观插入**（`app.tsx:571-574`，先把草稿塞进列表再 `setActiveId`），成功后不做全量重拉（草稿在首条消息后才物化，CDP 08 已验证"侧栏行 +1 但树 API 数量不变"）。
- 重命名：`editing`/`draft`（`library.tsx:71/74`）是编辑态；`commit(id)`（`:79-88`）`await onRename` 成功才 `setEditing(null)`，失败保留编辑框与输入。
- 归档：`toggleArchive(id, archived)`（`app.tsx:465-476`）成功后才 `loadSessions()`；失败 `setOpError` 并 `return`（**不乐观改列表**）。
- 删除（目标）：需新增一个 `pendingDelete: {id, title, childCount} | null` 的确认态；确认成功后乐观移除该 id 及其子树，若 `activeId` 命中则回退父会话、无父回退 `main`（`app.tsx:57` 的初值即 `'main'`）。
- **跨标签**：删除/归档本身不广播；另一个标签靠 WS `message.created` 或下一次 `loadSessions` 收敛（现状无 `session.deleted` 广播，属已知债 T-04）。

### 3.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参/状态码 |
|---|---|---|---|---|
| `createSessionDraft` | `(parentId, title): Promise<unknown>`（`api.ts:39-41`） | `POST /api/sessions` | `{parentId, title, draft:true}` | `201 {ok:true,session,draft:true}`（`sessions/http.go:170-185`） |
| `renameSession` | `(id, title)`（`api.ts:43-45`） | `PATCH /api/sessions/{id}` | `{title}` | `200 {ok:true,session}`；`400` 标题空（`http.go:187-206`、`:339`）；`413 body_too_large`（`:194`） |
| `archiveSession` | `(id)`（`api.ts:140-142`） | `POST /api/sessions/{id}/archive` | 无 body | `200`；`409 archive_blocked + blockers[]`（`http.go:208-221`）；**`409 main_session_protected`**（`:344-345`） |
| `unarchiveSession` | `(id)`（`api.ts:144-146`） | `POST /api/sessions/{id}/unarchive` | 无 body | `200` |
| `deleteSession`（**待新增**） | `(id: string, confirmToken?: string): Promise<void>` | `DELETE /api/sessions/{id}` | 确认令牌（形态由后端定，见 N/A） | 目标 `204`；现状固定 `403 R4_CONFIRM_REQUIRED`（`http.go:68-70`） |

错误路径现状：
- 重命名失败 → `api.ts:21` 通用文案 → `App.rename` catch → `setOpError` **并 rethrow**（`app.tsx:556-559`）→ `Sidebar.commit` catch 保留编辑框（`library.tsx:83-86`，注释指向"上层全局提示"）。CDP 15 语境下 toast 文案为「请求失败（500），请稍后重试」。
- 归档失败 → `setOpError` toast（`app.tsx:471`）；`409 archive_blocked` 的 `blockers` **不展示**（`api.ts:21` 只给状态码），记为债 T-05。
- 主会话归档 → 同上 toast；**但入口未禁用**（`library.tsx:115` 无条件渲染）→ 见 C-03。

**N/A：删除确认令牌的形态（字段名、签名算法、有效期）不在前端契约内** —— 属后端 `sessions/http.go` 与 `core/action`（`session.delete` 已注册 R4，`backend/internal/core/action/action.go:48-61`）的实现细节，前端只约定"确认后携带后端返回/要求的令牌，缺失或错误时必须仍看到可读提示且列表不变"。

### 3.4 交互细节

- **重命名**：Enter 提交、Escape 取消（`library.tsx:107-108`）；空字符串不作提交（`draft.trim()` 守卫 `:80`）；blur 提交并持久化（CDP 09 已验证）。提交中不发第二次请求（`await` 期间无 `busy` 锁 → 现状可重复 Enter，属债 T-06）。
- **归档**：菜单点击后立即关闭（`menuId` 复位）；成功后该行从默认列表消失，`显示归档` 打开后以 `.is-archived` + `opacity:.55` 出现（`components.css:773`），中栏出现 `已归档 · 只读` 徽标（`app.tsx:658`）。
- **归档后只读**：`Composer disabled`（`app.tsx:687` `Boolean(activeSession?.archived)`）、`MessageItem readOnly`（`:681`）、卡片提交被拦（`:451-453` 报「已归档会话为只读，不能提交卡片」）。
- **删除（目标契约，可断言）**：
  1. 菜单项文案「删除会话」；**主会话不渲染该项**（`activeId`/`session.id === 'main'` 时）。
  2. 点击后弹二次确认，**必须含会话名**；当有子会话时**必须含数字**：「将一并删除 N 个子会话」（N 取子树计数）。
  3. 取消（Escape / 「取消」/ 点遮罩）→ **不发任何请求**（可用 `snap.deleteCalls` 断言为空）。
  4. 确认 → `DELETE /api/sessions/{id}`；成功 204 → 行移除、子树移除、`activeId` 命中时回退父会话、无父回退 `main`、消息区不残留（`messages` 置空）。
  5. 失败 → toast + **不乐观移除**（行仍在）。
  6. 弹窗焦点：打开时焦点移入「取消」，Escape 关闭，关闭后焦点回到原菜单按钮（可断言 `document.activeElement`）。
- **点击区**：`.session-menu button` 无最小高度声明（`components.css:778`），实际由 padding 决定 → 需在契约层要求 ≥44px（记为视觉返工项）。

### 3.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 新建 → 侧栏出现且选中、无消息为空态 | `Sidebar.test.tsx:59`；CDP 08 | ✅ |
| 重命名 Enter 持久化、Escape 取消、空值不提交 | `Sidebar.test.tsx:76`；CDP 09 | ✅ |
| 归档/恢复 + 只读 | `Sidebar.test.tsx:90`；`App.conversation.test.tsx:107-135`；CDP 10 | ✅（主会话口径相反） |
| 失败有可见反馈、不乐观改列表 | `App.operation-errors.test.tsx:49/75/95` | ✅ |
| 删除入口 + 二次确认 + 级联提示 + 取消不发请求 | **无** | `missing` |
| 主会话不显示删除入口 | **无** | `missing` |
| 删除失败不乐观移除 | **无** | `missing` |

建议用例名：`T-CONV-002-07 删除确认弹窗含会话名与子会话数`、`T-CONV-002-08 取消删除不发请求`、`T-CONV-002-09 删除 active 会话回退父会话`、`E2E-SHELL-002 删除会话端到端`。

### 3.6 涉及文件:行号

`frontend/src/app.tsx:51, 78, 451-453, 465-476, 552-562, 564-576, 571-574, 658, 681, 687, 728` ／ `frontend/src/components/library.tsx:71-75, 79-88, 83-86, 90-117, 100-113, 107-108, 110-111, 114-115, 129-136` ／ `frontend/src/components/components.css:289, 443-449, 773, 774-775, 777-779` ／ `frontend/src/api.ts:21, 39-45, 140-146` ／ `backend/internal/modules/sessions/http.go:68-70, 170-185, 187-206, 208-221, 344-345` ／ `backend/internal/core/action/action.go:48-61`

---

## 4. `PRD-CONV-003` · 会话搜索与未读

来源：`specs/product/P1-CONV/spec.md:94-108`（语义裁决 `:103`、AC-003-01 `:106`、AC-003-02 `:107`、AC-003-03 `:108`）

### 4.1 组件与页面结构

- 搜索框在 `Sidebar` 的 `.search`（`library.tsx:137-140`，样式 `components.css:40-42`）：`input aria-label="搜索会话"`、`placeholder="搜索会话、消息…"`、尾随 `<kbd>⌘K</kbd>`（`:138`）。
- 过滤发生在 `Sidebar` 内部（`library.tsx:119-126`），**不是**在 `App` 里过滤数组：`term = searchQuery.trim().toLowerCase()`；`matches = !term || session.title.toLowerCase().includes(term) || Boolean(searchIds?.has(session.id))`。
- 命中集合通过 props `searchIds: Set<string> | null`（`library.tsx` props，`app.tsx:642` 传 `searchIds`）+ `searching` 下传。
- 空/加载文案复用 §2.4 的 `搜索中…` / `没有匹配的会话`（`library.tsx:150`）。

### 4.2 状态与数据流

- `searchQuery`（`app.tsx:54`）→ 250ms 防抖 effect（`app.tsx:360-372`）→ `searchIds`（`:55`）、`searching`（`:56`）。
- 现状数据流是**消息搜索**：`searchMessages(q)` 返回命中消息，前端折成 `new Set(messages.map(m => m.sessionId))`（`app.tsx:367-370`）；失败 → 空 Set（`:370`）。
- 目标数据流（AC-CONV-003-03）：`searchQuery` → `GET /api/sessions?q=` → 返回**会话数组** → 直接用返回的 `id` 集合（含子会话与归档会话的可见范围由服务端决定）→ `searchIds`。
- 未读（本节的"未读"只到"进入即已读"这一半，完整口径见 §13）：`App` 的 `unread` 数字（`app.tsx:98`）在**消息数增加且未贴底**时累加（`:219-223`），在 `scrollToBottom`（`:167-184`）与 `syncTimeline` 判定贴底（`:402-415`）时清零。

### 4.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| 现状 `searchMessages` | `(q: string): Promise<{messages?: Array<{sessionId: string}>}>`（`api.ts:136-138`） | `GET /api/messages/search?q=` | `q` | 命中消息（后端只查 main，审计 §7.3） |
| 目标 `searchSessions`（**待新增**） | `(q: string): Promise<{sessions?: Session[]}>`（可与 `listSessions` 合并加 `q` 参数） | `GET /api/sessions?q=` | `q`（后端 `title LIKE %q%`，`sessions/http.go:39-66`） | `{sessions: Session[]}` |
| 复用 | `listSessions`（`api.ts:27-29`） | `GET /api/sessions/tree` | 无 | 树 |

错误路径：现状搜索失败 → `searchIds` 置空 Set（`app.tsx:370`），UI 表现为"没有匹配的会话"，**不区分失败与无结果**。目标契约要求区分：失败时显示 `ErrorState`「搜索失败」+ 重试，且不显示"没有匹配的会话"（AC-CONV-003-03 明确"失败显示错误并可重试"）。

**N/A：未读持久化（刷新/跨设备保留）本轮不做** —— 产品已裁决阶段 1 不持久化、不加后端 unread/read_cursor 字段（`specs/product/P1-CONV/spec.md:43`、`:246`、`:320` ②），因此前端不定义任何写入本地/服务端未读的契约；`localStorage` 里**不允许**出现未读相关 key。

### 4.4 交互细节

- **防抖 250ms**（`app.tsx:360-372`）：连续输入的中间态必须可取消（`cancelled` 守卫 `:371`），不得用旧响应覆盖新查询。
- **搜索中**：`searching===true` 时列表区显示 `搜索中…`（`library.tsx:150`），不是骨架屏。
- **无匹配**：显示 `没有匹配的会话`（`library.tsx:150`），保留输入框内容。
- **清空**：输入清空 → `setSearchIds(null)`（`app.tsx:362-364`）→ 列表恢复完整树（过滤短路 `library.tsx:123`）。
- **键盘**：`⌘K` 徽标存在但**没有快捷键绑定**（`library.tsx:138` 是纯文本 `<kbd>`）→ 记为债 T-07；Enter 在搜索框内不触发任何提交（搜索是即时的）。
- **输入法**：搜索框需在 `compositionstart` 期间不触发请求（防抖已天然缓解，但组合期的中间拼音不得被当作关键词发出）→ 目标契约要求 `onCompositionStart/End` 感知，与 Composer 同策略（`library.tsx:566-568`）。
- **未读呈现（现状）**：只有一个 `回到底部 · N 条新消息` 按钮（`app.tsx:685`，样式 `components.css:893`），**左栏行没有未读点**。目标呈现见 §13。
- **点击区**：搜索框高 32px 级（`components.css:41`），输入区本身可点，不单独要求 44px；`⌘K` 不可点。

### 4.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 按标题本地过滤 + 服务端 id 并集 | `Sidebar.test.tsx:101/108` | ✅（并集语义） |
| 搜索中状态、无匹配提示 | `Sidebar.test.tsx:114/128`；CDP 14 | ✅ |
| 搜索失败路径 | `Sidebar.test.tsx`（失败分支） | ✅（但无非空失败态文案） |
| 调 `GET /api/sessions?q=` 且不再调 `/api/messages/search` | **无**（CDP 14 反而验证走了 `/api/messages/search`） | `missing` |
| 跨子会话/归档会话命中 | **无** | `missing` |
| 搜索失败显示错误 + 重试（区分于无匹配） | **无** | `missing` |
| 进入会话即清未读 | **无** | `missing` |

建议用例名：`T-CONV-003-05 标题搜索只调 sessions 接口`、`T-CONV-003-06 搜索失败与无匹配文案不同`、`T-CONV-003-07 归档会话参与标题搜索`。

### 4.6 涉及文件:行号

`frontend/src/app.tsx:54-56, 360-372, 367-370, 98, 219-223, 167-184, 402-415, 685, 642` ／ `frontend/src/components/library.tsx:119-126, 137-140, 150` ／ `frontend/src/components/components.css:40-42, 41, 893` ／ `frontend/src/api.ts:136-138, 27-29` ／ `backend/internal/modules/sessions/http.go:39-66` ／ `backend/internal/modules/chat/module.go:173-176`

---

## 5. `PRD-CONV-004` · 消息流与渲染

来源：`specs/product/P1-CONV/spec.md:112-129`（AC-004-01 `:127`、AC-004-02 `:128`、AC-004-03 `:129`）

### 5.1 组件与页面结构

- `ConversationPanel`（`library.tsx:671-687`）→ `.conversation-scroll`（`components.css:787`/`:853`）→ `MessageItem`（`library.tsx:181-220`）→ 文本渲染 `renderMessageText`（`:168-179`）／卡片 `CardBlock`（`:222-270`）。
- 结构：`section.conversation-panel.is-<state>[aria-label="当前会话消息"]`（`library.tsx:673`）；`timeline` 以 props 注入（`app.tsx:666` 传 `<TimelineGroups/>`），绝对定位在左侧 gutter（`components.css:831-852`）。
- 消息根节点带四个可断言属性：`data-message-id` / `data-task-id` / `data-session-id`（`library.tsx:209`），E2E 与定位功能都依赖它们。
- **用户/司墨区分**：`article.msg.from-user` / `.from-agent`（`library.tsx:209`），头像文案 `你` / `墨`（`:210`），样式 `.msg-avatar` 24×24（`components.css:138`）、agent 头像变体 `:139`。
- **分类标签**：`span.tag.msg-tag.msg-tag-<key>`（`library.tsx:212`），文案来自 `CATEGORY_LABEL`（`:6-11`：progress→进度汇报、clarification→需求澄清、requirement→需求提出、consultation→信息咨询）。
- **会话分隔**：跨会话合并渲染时插 `div.session-divider`（`app.tsx:678-682`，样式 `components.css:927-928`），用来区分祖先与本会话消息。

### 5.2 状态与数据流

- `messages`（`app.tsx:58`）+ `ancestorMessages`（`:59`）→ `combinedMessages`（`:621-624`：祖先+当前按 id 去重、按 `at` 排序）；**去重是渲染前的前端责任**，不是后端。
- 四态判定在渲染处（`app.tsx:667`）：`loadingMessages && 无消息` → `loading`；`error && 无消息` → `error`；`无消息` → `empty`；否则 `ready`。
- 流式：`status==='streaming'` 的消息带 `span.stream-caret`（`library.tsx:213-216`），由 WS delta 更新（见 §6）。
- 只读：`readOnly={Boolean(activeSession?.archived) || message.sessionId !== activeId}`（`app.tsx:681`）——**非当前会话的消息（祖先）也不可交互**。
- 分页：`listMessages(sessionId, limit=100)` 默认 100（`api.ts:31-33`），但 `App` **未消费 `hasMore`**（`app.tsx:148-165`）→ 见 C-15。

### 5.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `listMessages` | `(sessionId, limit=100)`（`api.ts:31-33`） | `GET /api/messages?sessionId=&limit=` | `sessionId`、`limit` | `{messages?: Message[], hasMore?: boolean}` |
| `submitCardAction` | `(cardId, actionId, payload)`（`api.ts:71-76`） | `POST /api/cards/{cardId}/actions/{actionId}`（`backend/internal/modules/chat/cards.go:52`） | body `{payload}` | 成功刷新消息；`409 CARD_ACTION_IN_PROGRESS` → 「处理中，请稍后重试」（`api.ts:20`） |

错误路径：首屏失败 → `ConversationPanel` error 态（`app.tsx:669` → `ErrorState`「消息加载失败」+ 重试，CDP 05 验证）；已有消息时失败 → `p.err-text` 行内提示（`app.tsx:677`，不打断已渲染内容）。

**N/A：消息纯度（`internal`/system 过滤）在前端无独立契约** —— 产品 AC-CONV-004-03（`:129`）要求"接口返回、WS 帧、UI 都不出现 internal 消息"，其中"接口与 WS 帧"由后端过滤（`TestM78InternalCardDoesNotPolluteMessageStream` 等），前端只消费，因此本节只约定"UI 不额外展示 system/internal 类消息、卡片消息不因纯度规则丢失"，不定义专门的过滤逻辑。

### 5.4 交互细节

- **复制**：`button.msg-copy[aria-label="复制消息"]`（`library.tsx:212`），文案三态 `复制`/`已复制`/`复制失败`（`copyState`，`:183`）；`navigator.clipboard.writeText` 失败后降级 `document.execCommand('copy')`（`:184-200`），临时 textarea `position:fixed;opacity:0` 不引起滚动；1500ms 后回到 `idle`（`:199`）。
- **复制按钮可达性**：`.msg-copy` 高 `--size-18`＝18px 且默认 `opacity:0`，仅 `.msg:hover` 或自身 `:focus-visible` 显示（`components.css:894-895`）→ 触屏不可达，键盘可达。记为视觉返工项（C-11）。
- **长文本**：`.msg-text{overflow-wrap:anywhere}`（`components.css:144`）；代码块 `pre` 自身横向滚动、不撑破卡片（`:896`）；`pre` 用深色底（`:150`）。三档宽度下均不得出现页面级横向滚动条（`:366` 的 `overflow-x:hidden` 只是兜底，不是豁免）。GFM 表格包在 `div.msg-table-wrap`（`library.tsx:442`、`components.css:159`）内横向滚动，`table` 自身不承担滚动；1180 档 wrap clientWidth 496 / scrollWidth 819、375 档 331/819（ACCEPT-CONV-9 §2.5），`.conversation-scroll` 与页面均不横向溢出。
- **Markdown 支持范围（可断言）**：支持 ``` 围栏代码块、行内 `` ` ``、空行分段、GFM 表格（`library.tsx:437-449` 渲染 `div.msg-table-wrap > table.msg-table`）与行内加粗/斜体/删除线/链接（`:425-428`）；**不支持**标题/列表。底部文案「支持 Markdown 格式」（`library.tsx:583`）与实现范围的落差记为债 T-08。
- **分类标签**：产品要求"category 有值才渲染"；现状 `MessageItem` 对 agent 消息把缺失/未知 category 回退为 `consultation`（`library.tsx:205-207`），因此**每条 agent 消息都有标签**（C-09）。
- **卡片**：`CardBlock` 渲染标题（`schema.title ?? card.title ?? '交互卡片'`，`:232`）、`${status} · v${version}`（`:233`）、字段（`select`/`textarea`/`input`，`:245/250/252`）、`p.card-error[role="alert"]`（`:259`）、`取消`/`确认`（`:261-266`）；`disabled = busy || readOnly || status !== 'active'`（`:230`）→ 已提交/归档都不可再提交。
- **消息不可编辑**：`MessageItem` 不渲染任何编辑入口（`library.tsx:181-220`），后端编辑端点返回禁用错误（`TestM50MessageEditingDisabled`）。
- **滚动**：`.conversation-scroll` 是唯一滚动容器（`components.css:787`），隐藏滚动条（`:904-905`）；贴底判定阈值 64px（`app.tsx:402-415`）。

### 5.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 角色/分类/流式光标/失败徽标/复制反馈 | `MessageItem.test.tsx:18/35/44/54/63/71/78/89/100/110` | ✅ |
| Clipboard 降级 | `MessageItem.test.tsx`（fallback 用例） | ✅ |
| 四态（loading/error/empty/ready）+ 重试 | `ConversationPanel.test.tsx:12/27/41/53/60/75/89` | ✅ |
| 窄屏不横向溢出（375） | `conversation-responsive.test.tsx:104/112/121/135/141/148`；CDP 01b | ✅ |
| 长文/代码块不溢出（1280/768） | `conversation-responsive.test.tsx` 部分 | 部分 |
| 100 条分页翻页不重不乱 | **无**（`hasMore` 未消费） | `missing` |
| 复制按钮点击区 ≥44px / 触屏可达 | **无** | `missing` |
| 无 category 的消息不显示分类标签 | **无**（现状相反） | `missing` |

建议用例名：`T-CONV-004-08 滚到底部拉下一页且不重复`、`T-CONV-004-09 无 category 的 agent 消息不渲染标签`、`T-CONV-004-10 复制按钮在触屏下可点`。

### 5.6 涉及文件:行号

`frontend/src/components/library.tsx:6-11, 168-179, 181-220, 183, 184-200, 199, 205-207, 209-216, 222-270, 230, 232-233, 245, 250, 252, 259, 261-266, 583, 671-687, 673` ／ `frontend/src/app.tsx:58-59, 148-165, 621-624, 667, 669, 676-677, 678-682, 681` ／ `frontend/src/components/components.css:138-139, 144, 150, 787, 853, 894-895, 896, 904-905, 927-928` ／ `frontend/src/api.ts:20, 31-33, 71-76` ／ `backend/internal/modules/chat/cards.go:52`

---

## 6. `PRD-CONV-005` · 发送·流式·断线重连

来源：`specs/product/P1-CONV/spec.md:149-164`（AC-005-01 `:163`、AC-005-02 `:164`）

### 6.1 组件与页面结构

- 输入与发送：`Composer`（`library.tsx:514-597`）底部承载，`app.tsx:687-688` 传入 `disabled` / `streaming` / `sendError`。
- 停止：`streaming` 为真时渲染 `button.btn.sm.composer-stop`「停止」（`library.tsx:594-595`，样式 `components.css:770`）。
- 错误区：`p.composer-error[role="alert"]`（`library.tsx:580`，样式 `:769`），内容 `localError || sendError`。
- 新消息提示：`button.jump-bottom`（`app.tsx:685`）「回到底部 · N 条新消息」。

### 6.2 状态与数据流

- 发送串行：`sendingRef`（`app.tsx:102`）在 `send()` 入口互斥（`:431-432`），保证"同一时刻只有一个发送在途"。
- 乐观清空：`Composer.submit` 先 `setText('')`（`library.tsx:547`），失败 `setText(value)` 回填 + `localError`（`:556-559`）。
- 幂等键：`clientMutationId = \`${tabId}:${Date.now()}\``（`app.tsx:437`）→ 每次调用都是新值，**重试不复用**（C-16）。
- 流式增量：WS `reply.delta` → `onDelta`（`app.tsx:334-347`）：
  - `ignoredReplyIds` 命中则丢弃（`:335`，停止后到达的帧）；
  - `deltaSeqRef` 按消息 id 记 seq，`seq <= prev` 丢弃（`:336`）；
  - 无则新建 streaming 消息（`:340`），有则追加并置 streaming；
  - 已有终态且 `text.endsWith(delta)` 视为重复（`:343`）；
  - 末尾 1400ms 防抖 `loadMessages` 收尾（`:349`）。
- 事件：`message.created` / `reply.done` / `message.done`（`api.ts:109`）→ `onEvent` → `key = type:id` 去重（`app.tsx:327-330`，集合上限 500 裁到 250）→ 300ms 防抖 `loadMessages`（`:332`）。
- 断线：`onStatus('reconnecting')`（`api.ts:114-119`）→ `wasDisconnected`（`app.tsx:109`）→ 重连 `open` 时补 `loadMessages`（`:320-323`）；退避 `800ms × 1.8` 上限 `5000ms`（`api.ts:93/117`）。
- 停止：`stopStreaming`（`app.tsx:423-428`）把 streaming id 全塞进 `ignoredReplyIds`、调 `events.stop()` 发 `{type:'correct', data:{sessionId}}`（`api.ts:128-132`）、消息状态改 `stopped`。

### 6.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `sendChat` | `(sessionId, text, clientMutationId?): Promise<{messageId?: string}>`（`api.ts:35-37`） | `POST /api/chat`（`backend/internal/modules/chat/module.go:195`） | `{sessionId, text, clientMutationId}` | `202` 受理 |
| `connectEvents` | `(sessionId, handlers): ChatEvents`（`api.ts:89-134`） | `GET /api/ws?sessionId=`（`:98`，`module.go:202`） | 首帧 `{type:'subscribe', data:{sessionId, since}}`（`:102`） | 帧：`reply.delta` / `message.created` / `reply.done` / `message.done`（`:108-109`）；返回 `{close, stop}` |

错误路径（可逐字断言）：
- 网络失败 → `Composer` 显示 `网络请求失败，请检查连接后重试`（`api.ts:14` → `library.tsx:556-559` → `:580`）。
- 5xx → `请求失败（502），请稍后重试`（`api.ts:21`；CDP 16 已精确断言该串出现在 `.composer-error` 且**页面与消息 API 中都不存在**）。
- 归档会话发消息被拒（后端 WS 错误帧）→ 现状无专门文案，靠 `Composer disabled`（`app.tsx:687`）在前端拦住。

**N/A：`clientMutationId` 的服务端去重语义不在前端契约内** —— 产品 AC-005-02（`:164`）注明后端 0 处理（grep 无匹配），前端只约定"生成、随请求发送、重试时复用同一个值"；去重实现与错误码归后端。

### 6.4 交互细节

- **发送按钮**：`disabled={disabled || sending || streaming || !text.trim()}`（`library.tsx:596`），文案 `发送中…` / `发送`。
- **停止**：点击后立刻追加"忽略后续帧"（`app.tsx:423-428`），实现"点击后不再增长"；同时应该并发一帧 `correct`（`api.ts:128-132`）。
- **文本保留**：失败时 textarea 恢复原文（`library.tsx:557`），不要求用户重打。
- **长文本**：textarea `min-height:66px / max-height:180px / resize:none`（`components.css:159`），自身滚动，不截断内容（`Composer.test.tsx` long-text 用例）。
- **禁用态**：无 `activeId` 或会话归档 → 输入框 `disabled`（`app.tsx:687`），CDP 10 验证归档后 textarea disabled。
- **回到底部**：`!atBottom` 时出现（`app.tsx:685`），点击 `scrollToBottom`（`:167-184`）→ 清未读 + 广播 `read_cursor_changed`（`:169-173`）。
- **发送按钮点击区**：`.send{height:28px;min-width:54px}`（`components.css:174`）→ 高度 28px ＜44px（记为返工项）。

### 6.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 发送→清空→流式→done 终态 | `Composer.test.tsx:28/52`；CDP 02 | ✅ |
| 失败文本保留可重试、不重复提交 | `Composer.test.tsx:61/74/102/110`；CDP 16 | ✅ |
| 停止后不再追加 | `Composer.test.tsx:162` | ✅（仅回调层） |
| 断线→重连→`since` 续传不丢不重 | **无**（`App.conversation.test.tsx:252` 只覆盖 reconnect 回调） | `missing` |
| 同一时刻只一个在途 | `Composer.test.tsx`（sending 期间 disabled）| ✅ |
| 重试复用同一 `clientMutationId` | **无** | `missing` |

建议用例名：`T-CONV-005-05 close→open 重连用 since 续传且消息不重复`、`T-CONV-005-06 重试沿用同一 clientMutationId`、`T-CONV-005-07 停止后 1.4s 内到达的 delta 被丢弃`。

### 6.6 涉及文件:行号

`frontend/src/components/library.tsx:514-597, 547, 556-559, 580, 594-596` ／ `frontend/src/app.tsx:102, 109, 313-358, 320-323, 327-330, 332, 334-347, 335-336, 340, 343, 349, 423-428, 430-449, 431-432, 437, 685, 687-688` ／ `frontend/src/api.ts:14, 21, 35-37, 89-134, 93, 98, 102, 108-109, 114-119, 128-132` ／ `frontend/src/components/components.css:159, 174, 769, 770` ／ `backend/internal/modules/chat/module.go:195, 202`

---

## 7. `PRD-CONV-006` · Composer 输入与快捷键

来源：`specs/product/P1-CONV/spec.md:166-180`（AC-006-01 `:179`、AC-006-02 `:180`）

### 7.1 组件与页面结构

- 全部在 `Composer`（`library.tsx:514-597`）：`.composer > .composer-box > textarea[aria-label="消息输入框"][placeholder="给司墨发消息…"]`（`:565-566`）+ `.composer-foot`（`:581-596`）。
- 模式切换按钮：`button.composer-hint-icon`（`library.tsx:587`，样式 `components.css:1003-1006`），20×20，默认 `opacity:0;pointer-events:none`，hover/`:focus-within` 才出现，`:focus-visible` 时强制可见可点。
- 模式提示：`span.composer-hint.composer-send-mode-hint[aria-live="polite"]`（`library.tsx:588`）。
- 与发送按钮、停止按钮同处 `.composer-foot` 右侧（`:581-596`）。

### 7.2 状态与数据流

- `sendMode: 'enter' | 'shift-enter'`（`library.tsx:518-529`）惰性初始化，读序：`localStorage['simo.composer.sendMode']` → legacy `simo.composer.send-mode`（`enter-send`→`enter`、`enter-newline`→`shift-enter`）→ 迁移写新 key 删旧 key → 异常回退 `'enter'`。
- 写入点：`setMode`（`:541-545`）`setState` + 写 localStorage + `BroadcastChannel('simo.composer.sendMode.v1').postMessage(mode)` 后立即 `close()`，全部 try/catch。
- 读点（跨标签）：`useEffect`（`:532-540`）同时订阅 BroadcastChannel `message` 与 `window` 的 `storage`（key `simo.composer.sendMode`）——双通道，任一到达即改本标签模式。
- 组合输入：`composingRef`（`:530`）+ `compositionEndAtRef`（`:531`），`onCompositionStart/End` 维护（`:566-568`）。

### 7.3 接口调用

无 HTTP 接口。持久化面 = 浏览器存储：

| 通道 | key / 名称 | 方向 | 失败表现 |
|---|---|---|---|
| localStorage | `simo.composer.sendMode`（值 `enter`/`shift-enter`） | 读写 | try/catch 吞掉，回退内存态（`library.tsx:518-529`、`:541-545`） |
| localStorage（legacy） | `simo.composer.send-mode` | 只读 + 迁移后删除 | 同上 |
| BroadcastChannel | `simo.composer.sendMode.v1` | 广播 + 订阅 | 构造/发送失败静默（`try/catch`） |
| window 事件 | `storage`（key `simo.composer.sendMode`） | 订阅 | 不触发即无跨标签同步（同标签不触发，属浏览器语义） |

**N/A：localStorage 在隐私模式/配额满时的降级属浏览器平台行为** —— 现状已用 try/catch 包住读写（`library.tsx:518-545`），产品 spec 只要求"刷新后保持 + 跨标签一致 + 降级不报错"（AC-SYNC-003-02），不定义具体错误码或用户提示，因此不存在可验收的独立错误契约。

### 7.4 交互细节（逐条可断言）

- **`enter` 模式**：Enter 发送、Shift+Enter 换行（`library.tsx:569-579` 判定 + `hint` `:561` 文案「Enter 发送，Shift+Enter 换行」）。
- **`shift-enter` 模式**：Enter 换行、Shift+Enter 发送（`hint`「Enter 换行，Shift+Enter 发送」）。
- **Ctrl/⌘+Enter 两种模式都发送**：`withModifier = metaKey || ctrlKey`（`:577`），`withModifier || (enter && !shift) || (shift-enter && shift)`（`:578`）→ 修饰键优先级最高。
- **IME**：`nativeEvent.isComposing || composingRef` 直接 return（`:570-571`）；另加 **组合结束后 50ms 内的 Enter 也被吞掉**（`:572-575`，`Date.now() - compositionEndAt < 50` 时 `preventDefault` 并 return）——用于抑制"选词确认的那一下 Enter"误发送。
- **aria**：按钮 `aria-pressed={sendMode==='shift-enter'}`（`:587`）、`aria-label={ariaAction}`（`:562`，形如「切换为 …」）；提示文案在 `aria-live="polite"` 区（`:588`）→ 切换后读屏会播报。
- **按钮可达性**：20×20 + 默认 `pointer-events:none`（`components.css:1003`）→ 只能用键盘 Tab 到它才能点（`:1006` 的 `:focus-visible` 恢复 `opacity:1;pointer-events:auto`）。触屏不可达，记为 C-11；不得为了"好点"改成 hover 才可点。
- **禁用态**：`disabled` 时 Enter 不发送（`library.tsx:565` 早退），且整个 hint-icon 不渲染（`:586`）。
- **长文本**：超过 `max-height:180px` 后 textarea 内部滚动（`components.css:159`），不截断 `value`。

### 7.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| Enter 发送 / Shift+Enter 换行 | `Composer.test.tsx:20/28`；CDP 03 | ✅ |
| Ctrl/Meta+Enter 两模式都发送 | `Composer.test.tsx:44/52` | ✅ |
| 切模式持久化 + 行为反转 + aria | `Composer.test.tsx:87`（`toggles send mode, persists it and changes keyboard behavior`） | ✅ |
| IME 组合中不发送、组合后 50ms 内不发送 | `Composer.test.tsx:129/144` | ✅（模拟事件，真实输入法未手测） |
| 无会话/归档禁用 | `Composer.test.tsx` disabled 用例；CDP 10 | ✅ |
| 长文本不截断 | `Composer.test.tsx:172` | ✅ |
| 模式按钮触屏可达 / 点击区 ≥44px | **无** | `missing` |

建议用例名：`T-CONV-006-07 模式按钮在触屏视口可点`、`T-CONV-006-08 切换模式时 aria-live 播报新提示`。

### 7.6 涉及文件:行号

`frontend/src/components/library.tsx:514-597, 518-529, 530-531, 532-540, 541-545, 561-562, 565-568, 569-579, 570-571, 572-575, 577-578, 580, 581-596` ／ `frontend/src/components/components.css:159, 160, 769, 770, 1003-1006, 1008, 1017` ／ 无接口

---

## 8. `PRD-CONV-007` · 祖先消息整级加载

来源：`specs/product/P1-CONV/spec.md:131-145`（AC-007-01 `:144`、AC-007-02 `:145`）

### 8.1 组件与页面结构

- 加载入口：`div.message-top > button.btn.sm`（`app.tsx:675`，样式 `components.css:926`），`aria-label="显示上级会话：X"`、`aria-busy`、文案 `加载中…` / `显示上级会话`；仅当 `nextParent` 存在时渲染。
- 错误行：`p.err-text[role="alert"]`（`app.tsx:676`）。
- 祖先消息：与当前会话消息合并进同一 `.chat-inner`（`app.tsx:674-684`），按会话切分插 `div.session-divider`（`:678-682`）；祖先消息 `readOnly`（`:681`）。
- 时间轴：`TimelineGroups`（`library.tsx:800-887`）→ `nav.timeline.timeline-groups[aria-label="消息时间轴"]`（`:861`，`pointermove` 与 `click` 挂在导航容器上，整列 44px 即命中面）+ `div.tlg-track`（`:862`）+ 每组 `div.tlg-session`（`:864`，`aria-label="当前会话：X"` / `"上级会话：X"`）+ 每消息 `button.tl-bar`（`:866-877`，`pointer-events:none`，只承担视觉与键盘焦点）。旧 `Timeline` 同构（`:711-785`，轨道容器 `:754`）。
- 提示浮层：`TimelineTip`（`library.tsx:615-687`）→ `createPortal`（`:680`）到 `document.body` 的 `div#timeline-tip.timeline-tip-surface[role="tooltip"][data-state]`（`:681`）。

### 8.2 状态与数据流

- `ancestorMessages`（`app.tsx:59`）、`ancestorLoading` + `ancestorLoadingRef`（`:60-61`）、`ancestorRequestRef`（`:62`，同一父级重复点击返回同一个 promise，`:493`）、`ancestorError`（`:63`）、`emptyAncestorIds`（`:64`）。
- `nextParent`（`app.tsx:582-591`）：沿 `parentId` 找第一个未访问父，用 `visitedAncestorIds`（`:581`）防环；`loadedAncestorIds`（`:580`）避免重复加载。
- `ancestorChain`（`app.tsx:600-610`）：从根到父的 id 数组（只含已加载），作为 `TimelineGroups` 的 `sessionOrder` 依据（`:625-635`）。
- **跨标签写点**：加载成功 → `publishTabSync({type:'ancestor_chain_changed', chain})`（`app.tsx:516-517`）；读点见 §11.2。
- 切会话清链：`app.tsx:295-311` 的 effect 里 `setAncestorMessages([])` / `setAncestorError('')` / `setAncestorHint('')` / `setEmptyAncestorIds(new Set())`；滚动位置存 `scrollPositionsRef`（`:94`），`restoreScrollRef` 恢复（`:206-217`）。
- 插入祖先时的滚动锚定：`useLayoutEffect`（`app.tsx:186-204`）用 `[data-message-id]` 定位校正，连续 apply 幂等（CDP 04a 断言偏移 ≤1px）。

### 8.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `getAllSessionMessages` | `(sessionId): Promise<{messages?; sessionId?; archived?; pagination?}>`（`api.ts:163-165`） | `GET /api/sessions/{id}/messages?scope=all`（`backend/internal/modules/chat/module.go:173-176` 同时注册了 `/messages` 与 `/messages/all`） | `sessionId` | `{messages: Message[], archived?, pagination?}` |

错误路径（`app.tsx` 的 `loadAncestor` 文案映射，逐字可断言）：
- 含 `413` → `消息过多，暂不能完整加载`，走 `.err-text[role=alert]`（CDP 04b 已验证消息数不变）。
- 含 `403` → `无权读取该上级会话`，走 1 条中性提示 `.ancestor-hint[role=status]`，不进入错误态、不阻断发送（CDP 04c 验证仍可继续对话）。
- 空数组 → 只记入 `emptyAncestorIds`，不渲染任何提示或错误，按无上级处理（CDP 04d 验证按钮仍可继续向上）。
- 其他错误 → 原样透出 `err.message`。

**N/A：`GET .../messages/all` 的分页上限与 413 阈值不在前端契约内** —— 门槛由后端决定（`TestM89AllMessagesLimitsAndErrors`），前端只约定"413/403/空 三种映射文案 + 都不阻塞发消息"，不定义具体条数。

### 8.4 交互细节

- **时间轴 bar 键盘**（`library.tsx:846-859`）：ArrowRight/Down → 下一个、ArrowLeft/Up → 上一个、Home → 第一个、End → 最后一个、Escape → 关 tooltip；均 `preventDefault` 后 `barsRef.current[next]?.focus()`（焦点真的移动，可断言 `document.activeElement`）。焦点在刻度上按 Enter 走按钮原生激活，`onClick`（`:874`）直接 `jumpTo(index)`，不经过轨道坐标映射。
- **点击跳转**：轨道 `onClick`（`library.tsx:861`）→ `onRailClick`（`:830-832`）→ `nearestTickIndex`（`:698-709`）→ `jumpTo(index)` → `onJump(messageId)` → `app.tsx:658-663` 用 `.conversation-scroll .msg` 的索引 `scrollIntoView({behavior:'smooth',block:'start'})` 并 `setActiveMessage(index)`。刻度自身的 `onClick`（`:874`）保留给键盘与辅助技术，事件 `stopPropagation`，不会与轨道映射叠加成两次跳转。点击列内任意点都映射到唯一一条，目标偏移为 0（CDP 12 断言目标偏移 <4px）。平滑滚动在 70 条消息下实测约 0.9 秒，200ms 时目标尚未进入视口；验收取样点为点击后 900ms，200ms 中间快照不作失败判据（ACCEPT-CONV-9 §2.3）。
- **跳转钉住 active**：末尾消息受滚动上限约束到不了视口顶部（真机 1600×1000 下第 69–74 条最多对齐第 68 条），`scrollIntoView` 触发的 `onScroll` 会把 active 重算回 68。跳转时写 `pinnedActiveRef`（`app.tsx:148`、`:658-663`），`syncTimeline`（`:665-682`）在钉住有效期内只更新滚动位置与贴底状态、不改 active；用户在滚动容器内滚轮、触摸或按下指针即释放（`:685-703`），另以 3 秒兜底，避免发送消息的自动滚动被长期挡住。真机点第 69/72/74 条后立即与 1 秒后 active 都等于点击项，滚轮 200px 后交还并按几何最近项重算。
- **当前项**：`aria-current={active?'true':undefined}`（`library.tsx:871`）→ 全局唯一（CDP 12 断言）。
- **命中区（整列口径，C-06 已裁决）**：命中面是整条 `.timeline` 轨道列（宽 `--gutter-timeline:44px`，高为轨道可见高度），不再逐条扩大热区。轨道容器的 `pointermove`/`click`（`library.tsx:861`）用 `nearestTickIndex`（`:698-709`）把指针 `clientY` 映射到纵向最近刻度：与两侧等距时取上方（下标小者），高于首条或低于末条时取端点，列内任意点必有唯一归属、不存在死区。依据一：细指针 6px 中心间距下，逐条 44×44 热区必然重叠 7 层，`elementFromPoint` 的归属由兄弟条叠放顺序决定，真机实测偏移点击最多跳到 +7 条（`docs/testing/browser-evidence-20261122/`、`AC007-EVIDENCE-20261122.md`）。依据二：产品 §5 A4 的 ≥44×44 针对孤立控件，密集轨道按整列口径验收。
- **刻度视觉**：`.tl-bar` **20×4px**（`components.css:115`），映射到的那条（`.is-hover`）与当前项变宽到 24×4（`:118`、`:1009`，当前项规则 `:449`）。刻度 `pointer-events:none`（`components.css:1076`），兄弟条不会互相遮挡；`.timeline` 仍保留 `isolation:isolate`（`:1075`），旧的 `.tl-bar::after` 48×44 命中块与配套 `z-index:-1` 已删除，命中改由整列 `nearestTickIndex` 映射承担（`:539`）。历史：44×44 逐条命中方案因几何不可满足（细指针 6px 间距下必然叠 7 层）已废弃，改为整列映射，见 `docs/plan/DECISIONS.md:18`。
- **祖先组弱化**：`.tlg-session.is-ancestor-session{opacity:.55}`（`components.css:921`）、当前组 `opacity:1`（`:922`）= 产品"祖先消息弱化"的实现；CDP 04a 断言 opacity≈0.55。
- **tooltip**：`pointermove` 映射到的刻度变化时开（`library.tsx:819-825`，120ms 延迟），`onFocus` 直接开（`:875`），`onMouseLeave`/`onBlur` 走 `scheduleClose`（`:861`、`:876`，200ms 宽限）；浮层宽 `Math.min(236, innerWidth-16)`、右侧溢出翻到左侧、越界标记 `data-state="edge-clamped"`（`library.tsx:615-670`），Escape 关闭（`:672-677`）。
- **移动端**：宽度小于 900px 时时间轴隐藏（`components.css:381` 的 56.25em 补集断点，会话面板同义规则 `:946`），900px 整点归显示档；此时消息仍完整可读（CDP 01b）。
- **时间轴显隐区间（可断言）**：**900px ≤ 宽度 ≤ 1500px 显示；小于 900px 与大于 1500px 隐藏**（`components.css:947` 的中段恢复、`:381`/`:946` 的下限隐藏、`:859`/`:921` 的上限隐藏）。1280 档属于显示区间。

### 8.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 祖先整级加载、按时间排序、id 去重、bar 数一致 | `App.integration.test.tsx:120/128/140/152/167`；`TimelineGroups.test.tsx:58/75/81` | ✅ |
| 时间轴键盘（方向键/Home/End/Escape、Enter 跳转）焦点移动 | `TimelineGroups.test.tsx:163/192/201` | ✅ |
| tooltip 延迟/宽限/边缘翻转/Escape | `TimelineGroups.test.tsx:144/163`；`TimelineTip` 用例 | ✅ |
| 413 / 403 / 空上级文案 | `App.integration.test.tsx`（413 重试/403 空祖先）；CDP 04b/04c/04d | ✅（前端 mock） |
| 切会话清链、切回恢复滚动 | `App.integration.test.tsx`；CDP 04a | ✅ |
| **整列命中面：列内 8 个偏移点、相邻刻度中点、越界端点、逐像素无死区** | `TimelineGroups.test.tsx:88/112/133`；`ExecRowHitArea.test.tsx` 真实 Chromium 量列宽与死区 | ✅（jsdom + Chromium；真机复测 `missing`） |
| **刻度视觉契约：轨道列宽 44、刻度 20×4、`pointer-events:none`、无 `::after` 命中块** | `TimelineGroups.test.tsx:233`；`ExecRowHitArea.test.tsx` | ✅（CSS 契约；真机复测 `missing`） |
| **跳转后 active 钉住与交还**：点尾部 68/71/73 与头部 0/36 后立即及 1 秒后 active 等于点击项；手动滚轮 200px 后恢复几何最近项 | `App.conversation.test.tsx:599`（jsdom：滚动事件不夺权、滚轮后交还）；CDP `pin-verify` 真实 Chromium 1600×1000 | ✅（jsdom + Chromium；真机复测 `missing`） |
| 真实后端 413/403（非 mock） | **无**（审计 §7 未覆盖） | `missing` |
| 8787 部署验证 | **无**（exe 基线过期，`MASTER-PLAN.md` §4） | `missing` |

建议用例名：`T-CONV-007-05 时间轴整列命中面（44px 列宽、20×4 刻度、最近刻度映射）`、`T-CONV-007-06 相邻刻度中点与越界端点归属确定`、`T-CONV-007-07 跳转后 active 钉住并在手动滚动时交还`、`E2E-ANCESTOR-002 真实 413 上限`。

### 8.6 涉及文件:行号

`frontend/src/app.tsx:59-66, 142-151, 186-204, 206-217, 295-311, 491-530, 493, 496-507, 513, 516-517, 522, 580-591, 600-610, 625-635, 658-663, 665-682, 685-703, 942-945` ／ `frontend/src/components/library.tsx:615-687, 672-677, 680-681, 698-709, 711-785, 754, 800-887, 814-815, 834-844, 846-859, 861-877` ／ `frontend/src/components/components.css:115-119, 381, 449, 859, 921, 946-947, 1009, 1075-1076` ／ `frontend/src/api.ts:163-165` ／ `backend/internal/modules/chat/module.go:173-176`

---

## 9. `PRD-CONV-008` · 右栏会话投影

来源：`specs/product/P1-CONV/spec.md:261-278`（AC-008-01 `:275`、AC-008-02 `:276`、AC-008-03 `:277`、AC-008-04 `:278`）

### 9.1 组件与页面结构

- 右栏 = `RightPanel`（`library.tsx:818`，仅转发）→ `OverviewPanel`（`library.tsx:689-737`）。
- 根：`aside.inspector[aria-label="会话概览"][data-session]`（`library.tsx:707`）→ `div.insp-body`（`:708`）→ 四态分支（`:709-728`）。
- 三组内容：
  1. **状态**：`.insp-spec-status`（`library.tsx:713`）＝ 状态中文 `<b>` + `rev N` `<span>` + `待确认 N` `<em>`（仅 `pendingConfirmations.total > 0`）。
  2. **目标**：`Section 目标`（`library.tsx:714`），空值按状态给「目标待生成。」（draft）或「本会话未记录目标。」。
  3. **输入**：`Section 输入`（`library.tsx:715`），`constraints` + `inputs` 合并 `join(' · ')`，两者皆空给「暂无输入约束。」。
  4. **执行会话**：`SectionHeader` meta `共 N · 本次 M`（`library.tsx:717`）+ 三个 `ExecutionGroup`（`:718-720`）：已完成 / 进行中 / 未开始。
  5. **交付物**：`SectionHeader` meta = 总数（`library.tsx:722`），空给 `EmptyState「暂无交付物」`，非空取 `slice(0, 8)`（`:725`）渲染 `DeliverableItem`（`:642-653`）。
- `ExecutionGroup`（`library.tsx:655-669`）：`button.exec-head[aria-expanded]`（`:661-663`）+ `span.exec-count` 文案 `${shown}/${tasks.length}`（`:662`）+ `span.exec-toggle ▾/▸`；`TaskItem` 是可点行（`:603-611`，`title="定位到相关消息"`）。
- `div.insp-rail[aria-label="概览导航"]`（`library.tsx:731-733`）：三个图标按钮（☰ 概览 / ◷ 消息 / ▤ 交付物），**均无 onClick**（装饰性，债 T-09）。

### 9.2 状态与数据流

- `projection`（`app.tsx:67`）、`rightLoading`（`:74`）、`rightError`（`:75`）。
- `loadRight(sessionId)`（`app.tsx:267-278`）：`getSpecProjection(sessionId, 3)`（**`taskLimit=3` 硬编码**），成功 `setProjection`，失败 `setRightError(err.message || '右栏数据加载失败，可稍后刷新重试')`。
- 切会话 effect（`app.tsx:295-311`）先 `setProjection(null)` 再 `loadRight` → 切换瞬间回到 loading，不显示上一个会话的投影（防串台）。
- 另一处消费：`app.tsx:592-598` 为**每个**会话调 `getSpecProjection(id, 1)` 只为拿 `updatedAt` 当 `activityAt`（失败回落 `createdAt`）→ N 个会话 = N 次请求（债 T-10）。
- 数据形状（`types.ts:129-140`）：`{sessionId,status,revision,updatedAt,goal: string|null,constraints[],inputs[],tasks:{done,running,pending: {total,items,hasMore}},deliverables:{total,items,hasMore},pendingConfirmations:{total}}`。
- **分组映射（现状，可断言）**：`groups.done = done.items`；`groups.running = [...running.items, ...pending.items]`；`groups.queued = []`（`library.tsx:700-704`）。→ "进行中"混入 pending 与产品一致；**"未开始"组恒空**（C-08）。
- 状态中文映射：`completed→已完成`、`active→进行中`、`draft→草稿`、`blocked→阻塞`、`done→已完成`，未命中回显原值（`library.tsx:698`）。
- **草稿会话（`draft === true`）**：`loadRight` 在发请求前早退（`app.tsx:267-278` 需在函数首部判断并 `setProjection(null)`、`setRightLoading(false)`、清 `rightError`），**不发** `GET /api/sessions/{id}/spec-projection`；右栏改用 `EmptyState`（`library.tsx:625-632`）承载占位文案「发送第一条消息后生成目标与执行态」，该态优先于 loading/error/无投影三种判断（`library.tsx:709-711`）。
- **物化后补拉**：首条消息发送成功（`sendChat` 返回 `messageId`，`app.tsx:430-449`）或 WS 收到该会话 `message.created`（`api.ts:109`）时，`loadSessions()` 后若该会话 `draft` 已转 `false`，补调一次 `loadRight(activeId)`；**同一会话只补一次**（用 `Map<sessionId, boolean>` 或 `Set` 记录已补拉，避免每个 delta 都触发）。
- 草稿态的数据来源（已裁决）：草稿会话**不出现在** `GET /api/sessions` 与 `/tree`（首条消息物化后才进列表，`sessions/http.go:170-185`），因此 `draft` 是**前端本地标记**——`POST /api/sessions` 成功时（响应顶层 `draft`，`http.go:182-184`）在内存里记该会话为草稿，刷新后标记消失、草稿行以后端列表为准（`Session.draft` 仅为本地字段，不承诺来自后端；见 T-17）。

### 9.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `getSpecProjection` | `(sessionId: string, taskLimit = 3): Promise<SessionSpecProjection>`（`api.ts:154-156`） | `GET /api/sessions/{id}/spec-projection?taskLimit=`（`sessions/http.go:16-29`） | `taskLimit`（1..50，默认 3） | 见 §9.2 形状；响应带 `ETag` |
| 任务定位 | 无网络调用 | — | `messageId` | 滚动 + 闪烁（`app.tsx:532-550`） |
| 交付物打开 | `openArtifact(id)`（`app.tsx:478-489`） | 用 `previewUrl`/`downloadUrl` 直接 `window.open(..., 'noopener,noreferrer')`；否则 `getArtifactContent(id)`（`api.ts:148-152`） | `id` | HTML 文本 |

错误路径（逐字可断言）：
- `taskLimit` 越界 → `400 invalid_task_limit`（产品 AC-008-04；前端**永不发送**越界值，因为 `3` 硬编码）。
- 会话不存在 → `404`。
- `If-None-Match` 命中 → `304`（后端 `spec_projection.go:128`；`api.ts:21` 会把 304 当失败？—— 304 是 2xx 类之外、`response.ok===false`，`request()` 会抛 `请求失败（304）`，**前端未处理 304** → C-10）。
- 加载中 → `LoadingState「右栏加载中…」`（`library.tsx:709`）。
- 失败 → `ErrorState「右栏加载失败」` + 重试（`library.tsx:710`）。
- 无投影 → `EmptyState「暂无会话投影」`（`library.tsx:711`，描述「当前会话还没有可用的 SessionSpec。」）。
- 交付物读取失败 → `setRightError`（`app.tsx:487`）。
- 草稿会话（`draft === true`）→ **不发起请求**（`loadRight` 首部早退，不调用 `getSpecProjection`）；右栏显示占位「发送第一条消息后生成目标与执行态」，该态优先于 `loading`／空态判断，不出现「右栏加载中…」也不出现「暂无会话投影」。

**N/A：`ETag` 生成算法与 `If-None-Match` 的比较逻辑不在前端契约内** —— 服务端实现于 `backend/internal/modules/sessions/spec_projection.go:128`；前端只约定"请求可选携带上次响应的 ETag；命中 304 时保留现有渲染、不得闪空、不得把 304 当错误弹出"。

### 9.4 交互细节

- **展开/收起**：`exec-head` 拿焦点可 Enter/Space 切换（`aria-expanded` 驱动，`library.tsx:661`），默认各显示 3 条（`defaultCount=3`，`:658`）；`exec-count` 从 `3/7` 变 `7/7`（可断言文本）。
- **任务定位**：点击带 `messageId` 的任务 → `locateTask`（`app.tsx:532-550`）先查 `[data-task-id]`、再 `[data-message-id]`、再文本包含；命中加 `is-flash` 类 1200ms（`:542-544`，样式 `components.css:967`）+ 必要时 `scrollIntoView`。
- **交付物**：行内 `button.exec-row.deliverable-row`（打开）+ `a.download-link[download][aria-label="下载 X"]`（`library.tsx:646-651`）；只读，无提交/重试/取消（右栏不承载写操作）。
- **无会话不崩**：`session?.id ?? ''`（`library.tsx:707`）—— `data-session` 为空串而不是伪造 id（可断言 `data-session === ''`）。
- **窄屏**：`≤1024px`（64em）`aside.inspector{display:none}`（`components.css:355`/`:523`）→ 375 档 sidebar 与 inspector 均不渲染、矩形 0×0、无抽屉入口，遮挡判定不适用；Composer 359×144、发送 54×28、visibleRatio=1、文档 `scrollWidth=375`（`ExecRowHitArea.test.tsx:254`、`test-plan.md:163`、ACCEPT-CONV-9 §2.4）。
- **点击区**：`.exec-row{min-height:28px}`（`components.css:484`）＜44px；`.insp-rail button` 28×28（`:186-188`）＜44px（返工项）。
- **折叠时 aria**：`exec-head` 是 `button` 而非 `div`（`library.tsx:661`）→ 键盘可达。
- **草稿会话占位**：右栏只显示一句占位「发送第一条消息后生成目标与执行态」（`EmptyState`，`library.tsx:625-632`）；`aside.inspector` 的 `data-session` 仍为该会话 id（不置空、不伪造）；不渲染 `rev`、`待确认`、三组任务、交付物；首条消息物化后自动补拉一次，占位替换为真实投影且不闪回占位。

### 9.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 状态/目标/输入/rev/待确认 | `RightPanel.test.tsx:8/21` | ✅ |
| 三组任务展开收起 + `messageId` 透传 | `RightPanel.test.tsx:35/51` | ✅ |
| 交付物打开 + 空态 | `RightPanel.test.tsx:76/86` | ✅ |
| 四态：loading / error+retry / 无投影 / 无 session | `RightPanel.test.tsx`（对应 4 例） | ✅ |
| 任务点击定位并高亮 | CDP 06 | ✅ |
| 375 档右栏不渲染、无遮挡判定对象 | `ExecRowHitArea.test.tsx:254`；`test-plan.md:163` | ✅（遮挡判定不适用） |
| 「未开始」组能展示 pending/queued 任务 | **无**（结构上恒空） | `missing` |
| 304 命中不闪空不报错 | **无** | `missing` |
| `data-session` 不伪造 | **无**（可加一行断言） | `missing` |
| 草稿会话不发 `spec-projection` 且显示占位 | **无** | `missing` |
| 首条消息物化后补拉一次投影（不重复拉） | **无** | `missing` |

建议用例名：`T-CONV-008-05 未开始组展示待办任务`、`T-CONV-008-06 304 命中保持既有渲染`、`T-CONV-008-07 无会话时 data-session 为空串`、`T-CONV-008-08 草稿会话右栏显示占位且零请求`、`T-CONV-008-09 首条消息后补拉投影一次`。

### 9.6 涉及文件:行号

`frontend/src/components/library.tsx:642-653, 655-669, 658, 661-663, 689-737, 698, 699, 700-704, 707, 708, 709-711, 713-720, 722, 725, 731-733, 818` ／ `frontend/src/app.tsx:67, 74-75, 267-278, 295-311, 478-489, 487, 532-550, 542-544, 592-598` ／ `frontend/src/components/components.css:186-188, 355, 472-484, 523, 747-751, 815-817, 901-903, 953-956, 967` ／ `frontend/src/types.ts:126-140` ／ `frontend/src/api.ts:148-152, 154-156` ／ `backend/internal/modules/sessions/spec_projection.go:128, 295`

---

## 10. `PRD-SYNC-001` · WS 连接与重连

来源：`specs/product/P1-CONV/spec.md:184-199`（AC-SYNC-001-01 `:198`、AC-SYNC-001-02 `:199`）

### 10.1 组件与页面结构

- 连接态在三处可见：顶栏 `.top-right` 的连接点 + 文案（`app.tsx:649`）、左栏 `.ws` 头部文案（`library.tsx:131-137`）、底部 `StatusBar`（`library.tsx:164-166`，`footer.statusbar`，`≤480px` 隐藏 `components.css:393`）。
- 文案映射：`open`→`就绪`（StatusBar）/`本地环境`（Sidebar）；`reconnecting`→`重连中` / `重连中…`；其他→`连接中` / `连接中…`。
- 无独立组件承载 WS：连接由 `App` 的 effect 持有（`app.tsx:313-358`），生命周期与 `activeId` 绑定。

### 10.2 状态与数据流

- `connection`（`app.tsx:72`，初值 `'connecting'`）+ `wasDisconnected`（`:109`）+ `eventsRef`（`:110`）。
- 读点：`onStatus`（`app.tsx:315-323`）：
  - `open` → `setConnection('open')`；若 `wasDisconnected` 则 `loadMessages` 补拉（`:320-323`）。
  - `reconnecting` → `setConnection('reconnecting')` + `wasDisconnected = true`。
- `syncStateRef`（`app.tsx:103`）：`{readCursor, lastEventId, clientMutationId}`；`lastEventId` 作为 `since` 的回调来源（`app.tsx:314` → `api.ts:102`）。
- 事件去重：`eventIdsRef`（`app.tsx:101`，`type:id` 键，`:327-330`）+ `deltaSeqRef`（`:104`，按消息 id 记 seq，`:336`）。
- 心跳/看门狗：无前端看门狗；"流式中残留"依赖后端 `TestM55StartupRecoversStaleStreaming` / `StreamingWatchdogTimeout`，前端只是消费 `message.done`（`api.ts:109`）。

### 10.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `connectEvents` | `(sessionId, {onDelta, onStatus, onEvent, since}) → ChatEvents`（`api.ts:89-134`） | `GET /api/ws?sessionId=`（`:98`；`chat/module.go:202`） | 首帧 `{type:'subscribe', data:{sessionId, since}}`（`:102`） | 状态回调 `'open' | 'reconnecting'`；帧 `reply.delta`/`message.created`/`reply.done`/`message.done`（`:108-109`） |
| `listMessages`（重连补拉） | `(sessionId, limit=100)`（`:31-33`） | `GET /api/messages` | — | 见 §5.3 |

错误/边界路径：
- 断开 → `close` 回调 → `onStatus('reconnecting')` → 指数退避重连 `800 → 1440 → 2592 → 4665 → 5000`（`api.ts:93/117`，倍数 1.8、上限 5000）。
- 非 JSON 帧 → 静默忽略（`api.ts:110-112`），不打断连接。
- 归档会话发聊天 → 后端返回错误帧（`TestM6ArchivedChatWSReturnsErrorNotReply`），前端不专门处理（`Composer disabled` 已拦）。
- **`closed` 态**：`onStatus` 从不发 `'closed'`（`api.ts:101`/`:115`），因此产品要求的 connected/reconnecting/closed 三态里**第三态不可见**（C-07）。

**N/A：WS 帧 schema、`seq` 分配与 `since` 保留窗口不在前端契约内** —— 属后端协议（`TestWebSocketEventOrder` / `TestWebSocketSinceContinuation`）；前端只约定"按 `seq` 丢弃乱序、按 `type:id` 去重、`since` 取最后处理过的 eventId"。

### 10.4 交互细节

- **可断言的状态文本**：`.ws` 内三态文案（`library.tsx:131-137`）与 `StatusBar` 三态文案（`:164-166`）必须与 `connection` 一一对应，不允许出现第四种文案。
- **重连期间的可用性**：重连时输入框不禁用（现状 `Composer disabled` 只看 `!activeId || archived`，`app.tsx:687`）→ 用户可在断线期输入与点击发送，失败走 §6 的错误路径。
- **重连后不重复渲染**：靠 `eventIdsRef` 与 `deltaSeqRef`（`app.tsx:327-336`）保证；同一 `reply.delta` 若无 `seq` 则只靠 `endsWith` 去重（`:343`，弱保证，债 T-02）。
- **切换会话重连**：WS effect 依赖 `activeId`（`app.tsx:313` 起，依赖数组含 `activeId`），切会话会关闭旧连接并新建 → cleanup 必须清 timer（`api.ts:123-127`）。

### 10.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 连接态可见 + 事件有序（`seq` 去重） | `App.integration.test.tsx`（seq 去重）；后端 `TestWebSocketEventOrder` | 前端部分 |
| 断线后自动重连（回调层） | `App.conversation.test.tsx:252` | ✅（仅回调） |
| close→open 重连 + `since` 续传不丢不重 | **无** | `missing` |
| 三态文案与 `connection` 一一对应 | **无**（并含缺失的 `closed`） | `missing` |
| 双客户端 fanout | 后端 `TestM88WebSocketFanoutTwoClients`；CDP 13（A 发 B 见） | ✅ |
| 归档会话 WS 错误帧 | 后端 `TestM6ArchivedChatWSReturnsErrorNotReply`；前端无 | 部分 |

建议用例名：`T-SYNC-001-03 closed 态可见且文案独立`、`T-SYNC-001-04 重连后用 since 续传且消息不重复`。

### 10.6 涉及文件:行号

`frontend/src/app.tsx:72, 101-110, 313-358, 314, 315-323, 327-330, 336, 343, 649, 687` ／ `frontend/src/components/library.tsx:131-137, 164-166` ／ `frontend/src/api.ts:84-87, 89-134, 93, 98, 101-102, 108-112, 114-119, 123-132` ／ `frontend/src/components/components.css:81, 393` ／ `backend/internal/modules/chat/module.go:202`

---

## 11. `PRD-SYNC-002` · 多标签 active / ancestor / read cursor

来源：`specs/product/P1-CONV/spec.md:201-214`（AC-SYNC-002-01 `:213`、AC-SYNC-002-02 `:214`）

### 11.1 组件与页面结构

- **无 UI**：本节是纯数据同步契约，唯一实现载体是 `frontend/src/tabsync.ts`（28 行）与 `App` 里的 `useTabSync(handler)`（`app.tsx:235-265`）。
- 可观察的界面后果：另一标签切会话后本标签 `h1` 与中栏跟随（CDP 13 已验证）、发送模式按钮 `aria-pressed` 跟随（§12）、未读点清除（§13）。

### 11.2 状态与数据流（读写点全表）

**通道**：`BroadcastChannel('simo.tab-sync.v1')`（`tabsync.ts:3`）；`tabId` 为每标签唯一（`:2`，`crypto.randomUUID()` 或 `tab-<random>`）；`publishTabSync(msg)`＝`ensure()?.postMessage(msg)`（`:16-18`）；`ensure()` 在 `typeof BroadcastChannel === 'undefined'` 时返回 `null`（`:12`）＝静默降级。

**消息类型**（`tabsync.ts:4-7`，三支，均带 `tabId` / `opId` / `at`）：
1. `active_session_changed{t sessionId}`。
2. `ancestor_chain_changed{chain: string[]}`。
3. `read_cursor_changed{sessionId}`。

**写点（发布）**：

| 触发 | 位置 | 载荷要点 |
|---|---|---|
| 切会话（本地，非远端引发） | `app.tsx:229-233` | `at = Date.now()`，写 `lastActiveOpRef`（`:100`） |
| 滚到底/贴底判定 | `app.tsx:173`（`scrollToBottom` 内） | 带 `at`，同时本地 `readCursor[activeId]` 取已读消息最大 `at`（`:172`） |
| 成功加载一级祖先 | `app.tsx:516-517` | `chain` = 当前祖先 id 数组 |

**读点（订阅）**：`useTabSync`（`app.tsx:235-265`），先忽略自己 `message.tabId === tabId`（`:236`），再分派：
- `active_session_changed`（`:237-245`）：`newer = at > last.at || (at === last.at && tabId > last.tabId)`（**同 `at` 用 `tabId` 字典序 tiebreak**，`:238`）；不 newer 或目标即当前则忽略；否则置 `remoteActiveRef = true`（`:242`）再 `setActiveId`，并清空祖先（`:243-244`）→ 由 `app.tsx:229-233` 的 effect 因 `remoteActiveRef` 跳过再次广播（抑制回声）。
- `read_cursor_changed`（`:247`）：仅当 `message.sessionId === activeIdRef.current` 且 `message.at >= 本地 readCursor` → 更新游标 + `setUnread(0)`。
- `ancestor_chain_changed`（`:248-264`）：同会话；空链 → 清空；`key = chain.join('|')` 与 `remoteAncestorChainRef` 比对去重（`:251`）；否则逐 id `getAllSessionMessages` 合并（单块失败吞掉，`:256`）。

### 11.3 接口调用

无直接 HTTP 调用；`ancestor_chain_changed` 的处理会间接调 `getAllSessionMessages`（`api.ts:163-165`，`GET /api/sessions/{id}/messages?scope=all`）。失败策略：单块失败**静默跳过**（`app.tsx:256`），不弹错、不阻塞其他块。

**N/A：BroadcastChannel 的投递可靠性、跨源/隐私模式行为不在前端契约内** —— 属浏览器平台语义；`tabsync.ts:12` 已声明不支持时返回 `null` 并静默，产品只要求"降级不报错"（AC-SYNC-002-02），无可断言的独立错误面。

### 11.4 交互细节（可断言的并发语义）

- **同 `at` 冲突**：必须用 `tabId` 字典序 tiebreak（`app.tsx:238`），断言方式 = 构造两条同 `at` 不同 `tabId` 的消息，字典序更大者生效、且结果稳定（不来回跳）。
- **重复广播**：`ancestor_chain_changed` 以 `chain.join('|')` 去重（`app.tsx:251`）→ 同一链重复到达只处理一次（可断言 `getAllSessionMessages` 调用次数不变）。
- **回声抑制**：本标签发起的切换不得因为收到自己的广播而多跳一次；`remoteActiveRef`（`app.tsx:99`）必须在 `setActiveId` 前置位、并在下一次本地切换时复位（`:229-233`）。
- **不回抖**：A→B 与 B→A 交替广播时，`at` 严格递增保证后者覆盖前者；断言"3 次交替后两标签 `activeId` 一致且只切换 3 次"。
- **`opId` 未被使用**（`app.tsx:229-233` 传了 `opId`，但 `useTabSync` 三个分支都没消费）→ 重复消息的去重实际靠 `at`+`chain`，**不靠 `opId`**（C-12）。

### 11.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| `active_session_changed` 改变本标签 active、不发回声 | `App.tabsync.test.tsx:115/135` | ✅ |
| 同 `at` 用 `tabId` tiebreak | `App.tabsync.test.tsx:148` | ✅ |
| `read_cursor_changed` 清未读（条件 `at >= cursor`） | `App.tabsync.test.tsx:165` | ✅ |
| `ancestor_chain_changed` 去重 + 合并 | `App.tabsync.channel.test.tsx:98/113` | ✅ |
| 无 BroadcastChannel 时静默 | `App.tabsync.channel.test.tsx:113` | ✅ |
| 真实双标签端到端（切会话/祖先/已读） | CDP 13（只覆盖 active + 发送模式 + WS） | 部分 |
| `opId` 参与去重 | **无** | `missing` |

建议用例名：`T-SYNC-002-05 opId 相同只生效一次`、`E2E-TAB-002 双标签祖先链跟随`。

### 11.6 涉及文件:行号

`frontend/src/tabsync.ts:1-28, 2, 3, 4-7, 12, 16-18, 19-28` ／ `frontend/src/app.tsx:99-100, 105, 167-184, 172-173, 229-233, 235-265, 236-247, 238, 242-244, 248-264, 251, 256, 516-517` ／ `frontend/src/api.ts:163-165`

---

## 12. `PRD-SYNC-003` · 发送模式跨标签同步

来源：`specs/product/P1-CONV/spec.md:216-229`（AC-SYNC-003-01 `:228`、AC-SYNC-003-02 `:229`）

### 12.1 组件与页面结构

- 唯一载体：`Composer` 的 `composer-hint-icon` 按钮（`library.tsx:587`）+ 提示文本区（`:588`）。
- 跨标签通道不产生新 UI；另一标签的**按钮 `aria-pressed` 与提示文案**是唯一可观察后果。

### 12.2 状态与数据流

- 本标签真相源 = `sendMode` state（`library.tsx:518`）；持久化副本 = `localStorage['simo.composer.sendMode']`。
- 写入（`setMode`，`library.tsx:541-545`）：`setSendMode` → `localStorage.setItem('simo.composer.sendMode', mode)` → `new BroadcastChannel('simo.composer.sendMode.v1')` → `postMessage(mode)` → `close()`；三步各自 try/catch。
- 读取（挂载时，`library.tsx:532-540`）：
  - `BroadcastChannel('simo.composer.sendMode.v1')` 的 `message` → `setSendMode(data)`；
  - `window` 的 `storage` 事件（`e.key === 'simo.composer.sendMode'`）→ `setSendMode(e.newValue)`；
  - 两者任一到达即生效（**双通道最终一致**）。
- 初始化迁移（`library.tsx:518-529`）：新 key 优先 → legacy `simo.composer.send-mode` 映射（`enter-send`→`enter`、`enter-newline`→`shift-enter`）→ 写新 key、删旧 key → 全程 try/catch，异常回退 `'enter'`。

### 12.3 接口调用

无 HTTP。存储契约：

| 键/通道 | 值域 | 所有权 |
|---|---|---|
| `localStorage['simo.composer.sendMode']` | `'enter' \| 'shift-enter'` | `Composer` 独占；其他模块只读 |
| `localStorage['simo.composer.send-mode']`（legacy） | `'enter-send' \| 'enter-newline'` | 只读一次后删除 |
| `BroadcastChannel('simo.composer.sendMode.v1')` | `'enter' \| 'shift-enter'` | 单向广播，不用于回读 |

**N/A：`storage` 事件不投递给同一标签是浏览器规范行为** —— 因此同标签内必须靠 state 直接生效（已由 `setMode` 保证）；这属于平台语义而非产品契约，不定义错误呈现。

### 12.4 交互细节

- **刷新保持**：`localStorage` 写入在 `setMode` 内同步完成（`library.tsx:543`）→ 刷新后同上（`Composer.test.tsx:87` 已覆盖）。
- **同标签立即生效**：`setSendMode` 先于广播，键盘行为与提示文案同一次渲染更新（可断言同一 tick 内 `aria-pressed` 与 `hint` 同步变化）。
- **跨标签最终一致**：另一标签收到 `message`/`storage` 后 `setSendMode` → 其快捷键行为**同时**变化（不只是按钮态）；CDP 13 已验证「A 切反转模式 → B `aria-pressed` 同步」且「B 反转模式下裸 Enter 只换行」。
- **aria**：`aria-pressed={sendMode==='shift-enter'}`（`library.tsx:587`）、`aria-label={ariaAction}`（`:562`），提示区 `aria-live="polite"`（`:588`）→ 跨标签变化后读屏会播报（可断言 `aria-live` 文本变化）。
- **不写回循环**：收到远端模式后只 `setState`，**不得**再次 `postMessage`（`library.tsx:532-540` 的 handler 里没有 `setMode` 调用）→ 断言"两标签互相切换 N 次后广播次数 = N"。

### 12.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 切换模式 + 持久化 + 行为变化 | `Composer.test.tsx:87` | ✅ |
| `localStorage` 新 key 写入、legacy 迁移 | `Composer.test.tsx:102/110`（迁移相关） | ✅ |
| aria-pressed / aria-label / 提示文案同步 | `Composer.test.tsx:120` | ✅ |
| BroadcastChannel 另一标签最终一致 | **无单测**；CDP 13 有 | 部分 |
| `storage` 事件通道（BC 不可用时） | **无** | `missing` |
| 收到远端后不回广播（无死循环） | **无** | `missing` |

建议用例名：`T-SYNC-003-03 收到远端模式后不二次广播`、`T-SYNC-003-04 无 BroadcastChannel 时 storage 通道生效`。

### 12.6 涉及文件:行号

`frontend/src/components/library.tsx:514-597, 518-529, 532-540, 541-545, 561-562, 586-588` ／ `frontend/src/components/components.css:1003-1006` ／ 无接口

---

## 13. `PRD-SYNC-004` · 未读与已读游标

来源：`specs/product/P1-CONV/spec.md:231-246`（六类状态 `:236`、AC-SYNC-004-01 `:244`、-02 `:245`、-03 `:246`）

### 13.1 组件与页面结构

- **现状**：未读只表现为 `button.jump-bottom` 的文案（`app.tsx:685`，`回到底部 · N 条新消息`，样式 `components.css:893`），**左栏行没有任何未读标记**（`library.tsx:90-117` 的行结构里没有未读节点）。
- **目标**：`Sidebar` 行内新增未读点（无数字），位置在 `.session-title` 之后、`.session-count` 之前的槽位（`library.tsx:114`），样式复用 `.session-dot` 的圆点语言（`components.css:447`），两态：有未读/无未读。
- 目标 props 形状（新增）：`unreadIds: Set<string>`（或 `hasUnread: Record<string, boolean>`）由 `App` 下传，与现有 `searchIds`（`app.tsx:642`）同层级。

### 13.2 状态与数据流

- **现状**：`unread` 是**数字**（`app.tsx:98`），只在当前会话内累加：消息数增加且未贴底 → `setUnread(v => v + 差值)`（`:219-223`）；清零点有三处 —— `scrollToBottom`（`:169`）、`syncTimeline` 贴底判定（`:402-415`）、`read_cursor_changed` 到达（`:247`）。
- **目标（AC-SYNC-004-03）**：改为**会话级布尔** `hasUnread: Record<sessionId, boolean>`：
  - 置位：WS 收到非 active 会话的新消息（`app.tsx:327-334` 的 `message.created` 分支，需补"非 active 则置位"）。
  - 清除：用户进入该会话（`switchSession` / `activeId` 变化，`app.tsx:229-233` 前后）；或任一标签广播 `read_cursor_changed` 且 `message.sessionId` 命中（`:247`）。
  - 跨标签：沿用现有 `read_cursor_changed`，**不新增消息类型**（产品 §7 已裁决）。
  - 不持久化：刷新即清空（无 localStorage 写入，`tabsync.ts` 也不涉及）。
- 与 `unread` 数字的关系：数字仍然保留给 `jump-bottom` 的"本会话新消息条数"（可保留），但**不得**再作为跨会话未读的来源。

### 13.3 接口调用

无新接口。数据来源：

| 来源 | 现有能力 | 用途 |
|---|---|---|
| WS `message.created`（`api.ts:109`） | 有 `id`，**无 sessionId** | 需从事件载荷或 `activeId` 推断会话 → 现状事件对象只有 `{type,id,seq}`（`app.tsx:327-334`），**缺 sessionId**（债 T-03） |
| `read_cursor_changed`（`tabsync.ts:4-7`） | 带 `sessionId` + `at` | 跨标签已读广播的唯一依据 |

错误路径：无网络错误面。降级：BroadcastChannel 不可用（`tabsync.ts:12`）→ 跨标签已读不同步，本标签内仍按进入即清（可接受降级，不报错）。

**N/A：未读的服务端持久化与跨设备同步本轮不做** —— 产品明确"阶段 1 不持久化、不加后端 unread/read_cursor 字段、不跨设备"（`specs/product/P1-CONV/spec.md:43`、`:246`、`:320` ②），后端无对应接口，前端不得新增写后端的调用。

### 13.4 交互细节

- **进入即已读**：`activeId` 变化后，该会话的未读点必须**同一渲染内**消失（不可先渲染旧未读再消失）→ 断言方式：切到 B 后立即查询 B 行，无未读点。
- **非 active 不置位**：B 收到新消息而 A 是 active → 只有 B 行出现未读点，A 行无（AC-SYNC-004-01 原文）。
- **无数字**：未读点**不得**携带条数文本（产品明确"不做徽标数字"）；`jump-bottom` 的 `N 条新消息` 是会话内滚动提示，不是未读徽标（需在实现时把两者解耦，避免复用同一 state）。
- **归档会话也可以有未读点**（AC 产品 §4.4 条款），`opacity:.55`（`components.css:773`）不应让未读点不可见 → 未读点需独立设色（不继承父级透明度导致的对比度不足）。
- **刷新清空**：刷新后所有行无未读点（可断言初始渲染无未读节点）。
- **无全站汇总**：页面任何位置**不得**出现"全部未读 N 条"（现状也满足）。
- **点击区**：未读点是纯装饰（非交互），不参与 44px 要求；但它不能扩大行的点击热区导致误触。

### 13.5 可测断言

| 断言 | 载体 | 现状 |
|---|---|---|
| 非 active 收到新消息 → 该行出现未读点，active 行无 | **无** | `missing` |
| 进入会话 → 未读点在首次渲染即消失 | **无** | `missing` |
| 另一标签已读 → 本标签未读点清除 | **无** | `missing` |
| 刷新后未读清空（不持久化） | **无** | `missing` |
| 不出现数字/全站汇总 | **无** | `missing` |
| 归档会话也能显示未读点 | **无** | `missing` |

建议用例名：`T-SYNC-004-04 非 active 会话置位未读点`、`T-SYNC-004-05 进入即清且首次渲染不闪`、`T-SYNC-004-06 跨标签已读清除`、`T-SYNC-004-07 刷新后无未读点`。

### 13.6 涉及文件:行号

`frontend/src/app.tsx:98, 219-223, 229-233, 247, 327-334, 402-415, 167-184, 169, 685, 642` ／ `frontend/src/components/library.tsx:90-117, 114, 119-126` ／ `frontend/src/components/components.css:893, 773, 447` ／ `frontend/src/tabsync.ts:4-7, 12, 16-18` ／ 无接口

---

## §冲突与风险

> 口径：凡"产品 spec 写的"与"代码里实际是"不一致，**本文件不自行裁决**，只登记事实与影响，交 Lead / 产品 review。编号 `C-01..C-18`。

| 编号 | 冲突/风险 | 证据（实读） | 影响 |
|---|---|---|---|
| **C-01** | 搜索语义：产品要求**标题搜索**（`GET /api/sessions?q=`），现状走**消息搜索**（`/api/messages/search`），且左栏过滤是"标题本地包含 OR 服务端 id"的并集 | `app.tsx:360-372`（调 `searchMessages`）、`api.ts:136-138`、`library.tsx:123`（`matches` 并集）、`library.tsx:137`（`placeholder="搜索会话、消息…"`）；后端 `messages/search` 只查 main（审计 §7.3） | AC-CONV-003-03 `missing`；改则需同时动 `app.tsx:360-372` + `api.ts` + `library.tsx:119-126` + CDP 14 用例 |
| **C-02** | 未读形态：产品要求**会话级布尔 `hasUnread` + 左栏未读点**，现状是**数字**且只在 active 会话内计数、显示在 `jump-bottom` | `app.tsx:98`（`unread` 数字）、`:219-223`（只对当前会话计数）、`:685`（显示在回到底部）、`library.tsx:90-117`（行内无未读节点） | AC-SYNC-004-01/02/03 全 `missing`；要改 `App` state 形状 + `Sidebar` props + WS 事件载荷（见 C-13） |
| **C-03** | 主会话归档：产品 AC-001-03 称"后端 `Archive` 无主会话守卫"，**实际后端已拒绝**；而前端仍对主会话渲染"归档"菜单，现有测试把"归档 main 成功"当预期 | 产品 `spec.md:73`；实际 `spec.go:297-301`（`DefaultSessionID` → `ErrSessionProtected`）、`http.go:344-345`（409 `main_session_protected`）；前端 `library.tsx:114-115`（无条件渲染）、`App.conversation.test.tsx:107-120`（断言 `archiveCalls:['archive:main']`） | AC-CONV-001-03 `missing`；产品 spec 的"现状为行为变更"描述已过时，需产品侧修订 `:73` |
| **C-04** | 错误码名已统一：产品与后端均为 `409 main_session_protected` | 产品 `spec.md:73` vs `sessions/http.go:344-345` | 已按代码统一，原不一致已消除 |
| **C-05** | AC-002-02 现状描述过时（已修正）：产品原称 `app.tsx:456-460`/`:536-539` 无 try/catch、失败静默；实际两处都有 try/catch + `setOpError`（`toggleArchive` 在 catch 内 `return`，`rename` 另 rethrow），且已有 4 条用例 | 产品 `spec.md:91` 已更新为 `app.tsx:465-476`（toggleArchive）、`:552-562`（rename） | 产品侧已更新行号与现状；缺口只剩“重试不产生重复”未断言 |
| **C-06** | 时间轴命中区（**已裁决，2026-11-22**）：6px 间距下逐条 44×44 热区必然重叠 7 层，改由整条 44px 轨道列承担命中，`pointermove`/`click` 按 `clientY` 映射最近刻度，刻度 20×4 且 `pointer-events:none`；点击偏差 0、列内无死区、越界取端点 | 实现 `library.tsx:698-709, 740-751, 822-832, 861-877`；样式 `components.css:1075-1076`；证据 `docs/testing/browser-evidence-20261122/`；用例 `TimelineGroups.test.tsx:88/112/133/233`、`ExecRowHitArea.test.tsx` | 原"逐条 ≥44×44"口径撤销，AC-CONV-007-02 按整列口径验收；产品 §5 A4 的 ≥44×44 适用于孤立控件。真机复测仍 `missing` |
| **C-07** | WS 三态：产品要求 connected/reconnecting/**closed** 可见；`connectEvents` 只发 `'open'`/`'reconnecting'`，`closed` 永不上报；`StatusBar` 对未知态统一显示"连接中" | 产品 `spec.md:184-199`；`api.ts:101/115`；`library.tsx:164-166` | AC-SYNC-001-02 的三态无法断言；须决定 `closed` 何时发（主动 close 还是连接失败重试耗尽） |
| **C-08** | 右栏"未开始"组恒空：`groups.queued = []` 硬编码，`pending` 被并入"进行中" | `library.tsx:700-704`；产品 `spec.md:261-278` 要求"已完成/进行中/未开始三组" | AC-CONV-008-02 的"未开始"组不可验收；需产品确认三组= done/running/pending 还是 done/running/queued |
| **C-09** | 分类标签恒有：产品要求"category 有值才渲染"，实现把 agent 消息的缺失/未知 category 回退为 `consultation` | `library.tsx:205-207`；产品 `spec.md:112-129` | AC-CONV-004-01 的"分类标签正确"存在语义分歧 |
| **C-10** | 右栏 304 未实现：后端支持 `ETag`/`If-None-Match` → 304，前端不发条件头，且 `request()` 会把 304 当失败抛"请求失败（304）" | `spec_projection.go:128`；`api.ts:9-25`（无 ETag 逻辑，304 落 `:21`） | AC-CONV-008-04 `partial`；一旦后端开始返回 304，右栏会显示错误 |
| **C-11** | 多处控件低于 44px 或依赖 hover 才可点：`.session-row` 32px、`.session-more` 20×20 且 `opacity:0`、`.msg-copy` 18px 且 `opacity:0`、`.composer-hint-icon` 20×20 且 `pointer-events:none`、`.send` 28px、`.exec-row` 28px、`.insp-rail` 28×28 | `components.css:443, 774-775, 894-895, 1003-1006, 174, 484, 186-188` | 触屏三档（375/768）可用性风险；属视觉/交互返工，须设计列确认基线 |
| **C-12** | `opId` 生成了但未消费：三个同步分支都不用它去重，重复消息实际靠 `at`/`chain` 兜 | `tabsync.ts:4-7`；`app.tsx:229-233`（发 `opId`）vs `:236-264`（未消费 `opId`） | AC-SYNC-002-02"重复不叠加"靠间接约束成立，缺确定性保证 |
| **C-13** | WS `message.created` 事件对象不带 `sessionId`：`onEvent({type,id,seq})`，实现层无法判断"新消息属于哪个会话"，而会话级未读置位正需要它 | `api.ts:109`；`app.tsx:327-334` | C-02 的实现前置阻塞；须扩事件载荷或改用 `loadSessions` 后的未读推断 |
| **C-14** | 任务卡 scope 漂移（已修正）：`CHG-CONV-006/tasks.md` 的 05/11/12/13/14 等卡原把 `Sidebar.tsx` 写成 scope，仓库中不存在该文件，Sidebar 实为 `library.tsx:50-162` | 已改为 `frontend/src/components/library.tsx` | 已按实际文件修正，无剩余派卡阻塞 |
| **C-15** | E2E 口径双轨：Playwright 11 个 test 从未跑通（fork `spawn EPERM`），唯一有效证据是 `cdp-runner.mjs` 19 场景；而 MASTER-PLAN 记"CDP E2E 19" | `frontend/e2e/specs/*.spec.ts`（7 文件 11 test）；审计 `audit-P1-CONV.md` §1/§7.9；`docs/plan/MASTER-PLAN.md` §4 | 任何"E2E 通过"的表述必须指明通道，否则等于虚报 |
| **C-16** | 幂等键每次新建：`clientMutationId = tabId:Date.now()`，重试生成新值，后端即便实现去重也无法命中 | `app.tsx:437`；产品 `spec.md:164`（要求重试不重复） | AC-CONV-005-02 的"不重复提交"在跨网络失败重试时失效；需改为消息级复用 |
| **C-17** | 置顶范围（**已同步 2026-11-21**，保留为历史记录）：产品原写 P2「只登记不实现」（原 `:74`、`:320` ④），Lead 裁决置顶进本轮验收面，产品侧已同步修订；前端入口按 §2.3–§2.6 契约实现 | 产品 spec 已更新；后端 `sessions/http.go:72-88` 就绪 | 口径已一致，无剩余待办；仅剩前端入口接线与用例 |
| **C-18** | 树通道未消费 `pinned`：前端消费 `GET /api/sessions/tree`，其排序走 `sortSessions`（只按 `created_at`、再按 `id`，`service.go:247-257`）；只有扁平 `GET /api/sessions` 的 SQL 带 `ORDER BY pinned DESC, created_at DESC, id DESC`（`:228`）。故"置顶改变同级内顺序"在树通道当前不成立 | `service.go:102`（调用 `sortSessions`）、`:228`、`:247-257`；前端 `app.tsx:129-146` → `GET /api/sessions/tree` | AC-CONV-001-04 的"置顶后顺序"在现有 UI 数据源上不可验收；需后端在 `sortSessions` 内补 `pinned` 比较（同级内生效）或前端改调扁平列表 |

补充风险（非冲突，登记即可）：
- **R-01** `api.ts` 无超时/`AbortController`（`:9-25`）→ 所有请求可无限挂起，无"超时"呈现路径（见错误矩阵最后一行）。
- **R-02** 375 档左栏 `display:none`（`components.css:377`）且无唤出入口 → 所有左栏交互（§2/§3/§4/§13）在 375 档无法端到端验收。
- **R-03** 时间轴显隐靠 4 段互相覆盖的媒体查询（`components.css:824/884/906/907/938`），修改任一断点都可能意外改变显示区间。

---

## §错误与降级矩阵

> 列义：**触发场景 → 用户看到什么（可逐字断言）→ 实现位置 → 目标契约是否已满足**。所有文案必须与代码逐字一致，不得改写。

| # | 失败场景 | 用户看到什么 | 位置 | 满足 |
|---|---|---|---|---|
| E-01 | fetch 网络层失败（断网/DNS） | `网络请求失败，请检查连接后重试` | `api.ts:14` | ✅ |
| E-02 | 任意 4xx（无专门处理） | `请求失败（N），请稍后重试`（N 为状态码） | `api.ts:21` | ✅ |
| E-03 | 任意 5xx | 同上（如 `请求失败（500），请稍后重试`） | `api.ts:21`；CDP 15/16 已断言 | ✅ |
| E-04 | **请求超时** | **无**（无超时控制，永久 pending，无任何提示） | `api.ts:9-25` 无 `AbortController` | ❌ 债 T-01 |
| E-05 | 会话树加载失败 | `.sidebar .state-error[role=alert]`「会话加载失败」+「请求失败（500）」+ 重试；无行、无 loading | `library.tsx:149`；CDP 15 | ✅ |
| E-06 | 统计失败 | `.quota` 显示「统计加载失败」，会话数/消息数都显示 `—`（不显示 0） | `library.tsx:158`；`App.conversation.test.tsx:163+` | ✅ |
| E-07 | 首屏消息加载失败 | `ConversationPanel` error 态「消息加载失败」+ 重试按钮 | `app.tsx:667,669`；CDP 05 | ✅ |
| E-08 | 已有消息时刷新失败 | 行内 `p.err-text[role=alert]`，已渲染消息不清空 | `app.tsx:677` | ✅ |
| E-09 | 发送失败 | 输入框文本回填 + `.composer-error[role=alert]` 显示 E-01/E-03 文案；消息不落库、不重复行 | `library.tsx:556-560,580`；CDP 16 | ✅ |
| E-10 | 409 `CARD_ACTION_IN_PROGRESS` | 卡片内「处理中，请稍后重试」 | `api.ts:20` → `library.tsx:259` | ✅ |
| E-11 | 卡片提交失败（其他） | `.card-error[role=alert]` + 确认按钮文案变「重试」，输入保留 | `library.tsx:259,262-266` | ✅ |
| E-12 | 归档被门禁拒绝（409 `archive_blocked`） | toast `请求失败（409），请稍后重试`；**blockers 列表不展示** | `api.ts:21` → `app.tsx:471` | ⚠️ 信息量不足（债 T-05） |
| E-13 | 主会话归档（409 `main_session_protected`） | 同上 toast；**入口本不该出现** | `app.tsx:471`；`library.tsx:114-115` | ❌ C-03 |
| E-14 | 重命名失败 | toast + 编辑框保留原输入，不退出编辑态 | `app.tsx:556-559` → `library.tsx:83-86` | ✅ |
| E-15 | 祖先加载 413 | `消息过多，暂不能完整加载`，消息数不变，可重试 | `app.tsx:522`；CDP 04b | ✅ |
| E-16 | 祖先加载 403 | 1 条中性提示 `无权读取该上级会话`（`.ancestor-hint[role=status]`，不含“失败/错误”），不阻断发送，切会话清空 | `app.tsx` `loadAncestor`；CDP 04c | ✅ |
| E-17 | 上级会话无消息 | **静默**：提示与错误均 0 条，按无上级处理，按钮仍可继续向上 | `app.tsx` `loadAncestor`；CDP 04d | ✅ |
| E-18 | 右栏加载失败 | `ErrorState`「右栏加载失败」+ 重试 | `library.tsx:710`；`app.tsx:267-278` | ✅ |
| E-19 | 右栏 404（会话不存在） | 同 E-18（`err.message` 优先） | `app.tsx:275` | ✅（文案可能透出后端原文） |
| E-20 | **右栏 304** | **被当作失败**：`请求失败（304），请稍后重试` | `api.ts:21`（304 非 `ok`） | ❌ C-10 |
| E-21 | 交付物读取失败 | 右栏错误态（复用 `rightError`） | `app.tsx:487` | ✅ |
| E-22 | WS 断开 | 顶栏/左栏/状态栏显示「重连中」；输入框仍可用；退避 800→5000ms 重连 | `api.ts:114-119`；`library.tsx:131-137,164-166`；`app.tsx:649` | ⚠️ 无 `closed` 终态（C-07） |
| E-23 | WS 收非 JSON 帧 | 静默忽略，连接不断 | `api.ts:110-112` | ✅ |
| E-24 | 归档会话尝试发消息 | 前端已禁用输入与发送；后端 WS 返回错误帧（前端不额外呈现） | `app.tsx:687`；`library.tsx:565,596` | ✅ |
| E-25 | BroadcastChannel 不可用 | 跨标签同步静默失效，无报错、无提示 | `tabsync.ts:12` | ✅（按产品"降级不报错"） |
| E-26 | localStorage 不可用/配额满 | 发送模式回退 `enter`；切换仅本标签内存生效 | `library.tsx:518-545`（全 try/catch） | ✅ |
| E-27 | 交付物下载链接缺失 | `a.download-link` 仅在 `downloadUrl` 存在时渲染 | `library.tsx:646-651` | ✅ |
| E-28 | 无投影（会话尚无 SessionSpec） | `EmptyState`「暂无会话投影」+ 描述「当前会话还没有可用的 SessionSpec。」 | `library.tsx:711` | ✅ |
| E-29 | 无会话（`session` 为空） | 右栏仍渲染，`data-session=""`，不崩 | `library.tsx:707` | ✅ |
| E-30 | 搜索请求失败 | 现状：静默变成「没有匹配的会话」（不区分失败） | `app.tsx:370` | ❌ 目标要求「搜索失败 + 重试」（C-01 同批） |
| E-31 | 会话已归档却尝试提交卡片 | 行内错误 `已归档会话为只读，不能提交卡片` | `app.tsx:451-453` | ✅ |
| E-32 | 草稿会话（尚无投影） | 不发 `spec-projection`；右栏占位「发送第一条消息后生成目标与执行态」，不出现加载态/错误态/「暂无会话投影」 | 本文件 §9.2／§9.3；`library.tsx:625-632` | ✅ 契约已定（草稿态为标签内存标记，刷新即消失，见 T-17） |

---

## §已知技术债

| 编号 | 债 | 证据 | 影响 | 建议归属 |
|---|---|---|---|---|
| **T-01** | 所有请求无超时、无取消 | `api.ts:9-25` | 弱网下 UI 永久 loading，无超时文案 | 前端（本轮不做，登记） |
| **T-02** | `reply.delta` 无 `seq` 时只靠 `text.endsWith(delta)` 去重 | `app.tsx:336,343` | 重复帧可能重复追加 | 前端 |
| **T-03** | WS `onEvent` 事件对象缺 `sessionId` | `api.ts:109`；`app.tsx:327-334` | 阻塞会话级未读（C-13） | 前端 + 后端协议 |
| **T-04** | 会话删除/归档不广播给其他标签 | 无 `session.*` 同步消息类型（`tabsync.ts:4-7`） | 多标签列表短暂不一致，靠下次 `loadSessions` 收敛 | 前端（P2） |
| **T-05** | `archive_blocked` 的 `blockers[]` 未展示 | `api.ts:21`、`app.tsx:471` | 用户不知道为什么不能归档 | 前端 |
| **T-06** | 重命名提交无 in-flight 锁 | `library.tsx:79-88` | 连续 Enter 可能发多次 PATCH | 前端 |
| **T-07** | `⌘K` 徽标无快捷键绑定 | `library.tsx:138` | 视觉承诺 > 实现 | 前端 |
| **T-08** | 文案「支持 Markdown 格式」超出实际渲染能力（只有围栏/行内 code） | `library.tsx:583` vs `:168-179` | 用户期望落差 | 产品/设计 |
| **T-09** | 右栏 `.insp-rail` 三个按钮无 `onClick` | `library.tsx:731-733` | 装饰性控件，键盘可聚焦但无动作 | 设计确认去留 |
| **T-10** | 为每个会话拉一次 `spec-projection`（`taskLimit=1`）只为取 `updatedAt` | `app.tsx:592-598` | N 会话 = N 请求 | 前端/后端（可并入 tree 接口） |
| **T-11** | 时间轴分组 `dateKey` 用 `toISOString().slice(0,10)`（UTC 日界） | `app.tsx:633-634` | 东八区 00:00–08:00 的消息会分到前一天 | 前端 |
| **T-12** | `--paper` 在 tokens 内被二次赋值 | `tokens.css:4` vs `:53` | 后续读 token 的人会误判主题色来源 | 前端 |
| **T-13** | `renderMessageText` 无列表/标题/表格支持 | `library.tsx:168-179` | 与 T-08 同源 | 前端 |
| **T-14** | E2E 双轨：Playwright 不可执行，CDP runner 是唯一通道 | 审计 §7.9；`frontend/e2e/specs/` | 新用例默认只能进 CDP runner | 测试 |
| **T-15** | 8787 部署基线过期（`simo-live-final4.exe` 不含 13:00 后前端修复） | `docs/plan/MASTER-PLAN.md` §4 | 任何"已部署验证"表述在重建前不成立 | 后端/验收 |
| **T-16** | 5 个 COMP 契约已按现状契约化（`COMP-message-colors`/`timeline-groups`/`timeline-tip`/`composer-send-mode`/`message-cards`），但均未走签收流程 | `CHG-CONV-006/tasks.md` TASK-07；`specs/COMP-*/spec.md`；`components/manifest.json` | 契约与实现已对齐，仍缺独立签字 | 设计/前端（owner 待裁） |
| **T-17** | 草稿态仅存在于当前标签内存（已裁决的已知限制，非缺口）：草稿会话首条消息物化前不进 `GET /api/sessions` / `/tree`，故 `draft` 是前端本地标记，非服务端字段；`POST /api/sessions` 只在响应顶层返回 `draft`（`sessions/http.go:182-184`），`types.ts:1-10` 的 `Session` 无该字段 | 本文件 §9.2；后端 `sessions/http.go:170-185` | 页面刷新或换标签后草稿标记与草稿行消失，列表以后端为准——**预期行为**，不做持久化、不补 `draft` 字段 | 前端（契约已定，无需后端配合） |

---

## §变更记录

| 版本 | 日期 | 变更 | 触发 |
|---|---|---|---|
| v0.1 | 2026-11-21 | 首版：13 节（目录/索引 + 12 个 PRD 前端契约）+ 冲突 16 条 + 错误矩阵 31 行 + 技术债 16 条。仅描述现状与目标契约，不含实现。 | `CHG-CONV-006` `TASK-W3-09` |
| v0.2 | 2026-11-21 | 按 Lead 裁决增量：① §2.3 置顶入口由 N/A 改为实际契约（`pinSession`/`unpinSession`、菜单第二项、仅非主/非草稿/非归档、顺序以服务端为准、失败 toast），连带 §1.1 索引、§2.4、§2.5、§2.6；② §9.2–§9.5 新增草稿会话右栏占位契约（不发 `spec-projection`、占位「发送第一条消息后生成目标与执行态」、物化后补拉一次），连带错误矩阵 E-32、技术债 T-17；③ §冲突新增 C-17（置顶范围：产品 spec 仍写 P2 只登记不实现），编号区间改 `C-01..C-17`；④ 按 Lead 2026-11-21 二次裁决：T-17 改写为"草稿态仅在标签内存、刷新即消失"的已裁决已知限制（后端不补 `draft` 字段），E-32 状态由 ⚠️ 改 ✅；⑤ 置顶收敛口径补作用域（只影响同级分组内顺序，不改父子归属、不上浮顶层，唯一子会话行序不变），C-17 标"已同步 2026-11-21"改为历史记录，另新增 C-18（树通道 `sortSessions` 未消费 `pinned`，`service.go:247-257` vs `:228`）。 | Lead 裁决：置顶进本轮验收面；草稿会话右栏占位（`m00172`）+ T-17/C-17 二次裁决（`m00272`）+ 置顶作用域与 C-17 注记（`m00294`） |
| v0.3 | 2026-11-23 | 新增 §17「会话内任务与编排」（`PRD-CONV-009`）：右栏三标签与两标签迁移、N1–N9 数据来源与时机、六类 `task.*` 事件与消息事件合并、消息流任务卡、只读任务详情、任务图弹窗、筛选与角标、状态边界、可访问性、测试影响与 30 条前端判据；§1.1 索引补 §17，验收面由 12 个 PRD 改为 13 个。详情覆盖中栏按用户 2026-11-23 口径，记为 D-17-01，设计 §17.5/§17.10 的 280 覆盖口径待设计同步。 | `CHG-CONV-007` / `PRD-CONV-009` |
| v0.4 | 2026-11-25 | 按 `MX-G-29` 补 §17.9.3「错误码与前端动作」：39 行，一码一行，码值与 HTTP 与契约表 CT-CONV-101 至 CT-CONV-139 逐条对应并给出前端动作；与「§错误与降级矩阵」互补，该矩阵按失败场景组织、本表按码值组织。不改 §17.1–§17.9.2 正文 | 契约告警 `MX-G-29` 原文；契约表 `specs/contract/CONV/contract.md` 类 3；`SPEC-STANDARD` 第 2.3 节 | 前端列从无错误码表变为 39 对 HTTP + code 齐全，与契约、后端三列一致 |
| v1.0 | 2026-11-23 | 按 Lead 裁决只改 §17 详情几何与零任务态。D-17-01 与 §17.7.1 的 ≥1024 口径由「右缘贴竖条左缘、宽等于中栏宽」改为「右缘贴右栏面板左缘、宽为剩余中栏宽」：右缘横坐标在整栏展开 320 时为视口宽减 320，收起 40 时为视口宽减 40，宽度为右缘减侧栏右缘；补详情打开期间右栏可见、边界不变、竖条按钮指针点击 1 次生效，`inert` 只加中栏与侧栏（§17.10）。§17.2.1、§17.5.2、§17.9.1 补零任务态：`counts.all=0` 时任务标签 `aria-disabled="true"`、不切标签、角标不渲染不占位。`F-CONV-009-04` 与 `F-CONV-009-17` 断言同步，30 条判据编号与条数均不变；U-17-02「详情与设计 280 冲突」由本裁决解除并移出未决清单，未决项由 6 条减为 5 条，重排为 U-17-01..05。 | Lead 裁决（2026-11-23）/ `CHG-CONV-007` |
| v1.1 | 2026-11-26 | 按 DEC-37 把 §17.2.1 表内整栏行的「宽度过渡 160ms」改为「容器宽度立即落位；内容层 160ms 淡入与位移」，与设计 §17.2.1、§17.2.7、`V-CONV-009-1` 的 v0.9 口径一致。§17.2.3 的「收起过渡 160ms」与 §17.10 的减少动态偏好条目保留：两处描述的是面板内容层动效，不是容器宽度；几何断言与 30 条判据不变 | DEC-37（`docs/plan/DECISIONS.md:150`）；设计 v0.9 同步记录（`specs/design/P1-CONV/spec.md:750`）；`AC-CHG-CONV-007-05` 与 `AC-CONV-009-08` 在容器过渡关闭后稳定通过 |
| — | 待定 | 待 Lead/设计 review：C-01/02/03/06/08/17 需裁决后，本文件置 `ready` | `CHG-CONV-006` §6 待确认 |

---

## §17 会话内任务与编排（PRD-CONV-009）

> **上游**：产品 `specs/product/P1-CONV/spec.md` §4.6 与 `AC-CONV-009-01..18`；设计 `specs/design/P1-CONV/spec.md` §17 与 `V-CONV-009-1..44`；变更包 `specs/changes/CHG-CONV-007/spec.md`；原型 `docs/design/task-prototype-v3-20261123.html` 九屏 s1–s9。
> **范围**：只写前端契约，不写 React 实现、不写后端实现、不写测试代码。新增状态一律归 `App`（§1.3），新增组件仍走 `frontend/src/components/library.tsx` 单文件库与 `components/index.ts` 出口（§1.2），新增样式只追加到 `components/components.css` 并复用 `tokens.css`。
> **判据编号**：本节 `F-CONV-009-01..30`，逐条映射 AC 与设计 V 判据；设计已有的视觉判据不重复抄写，只补前端选择器、请求、时序与焦点断言。

### 17.1 范围、只读约束与口径偏离

产品 §4.6 的 18 条 AC 在本节的落点如下，未列出的视觉细节以设计 §17 为准。

| AC | 前端落点 | 关键断言 |
|---|---|---|
| `AC-CONV-009-01` | §17.6 单任务卡 | `role="agent"`、`category="task"`、`task_id` 非空；卡上任务数与进行中数取自任务 store |
| `AC-CONV-009-02` | §17.6 汇总卡 | 12 条任务只写 1 张汇总卡；默认 10 条 + 「还有 2 条」；展开后入口 0 个 |
| `AC-CONV-009-03` | §17.7 启动上下文 | 详情显示目标 1 条、约束 ≥1 条、历史消息 `0` 条 |
| `AC-CONV-009-04` | §17.7 轨迹 | 工具成功 1 条动作轨迹；越权 1 条 `403 ` 开头的观察轨迹 |
| `AC-CONV-009-05` | §17.7 计划步骤 | 8 步时第 6 步默认展开、第 5 步可回看、第 7 步无入口 |
| `AC-CONV-009-06` | §17.7 边做边想 | 扁平 14 行、步骤节点 0 个、分组 0 个、展开入口 0 个、时间单调 |
| `AC-CONV-009-07` | §17.7 只读 | 重试/取消/编辑/删除入口 0 个；关闭入口 1 个 |
| `AC-CONV-009-08` | §17.2 右栏 | 展开整栏 320（面板 280 + 竖条 40）；收起 40；三标签图标齐备 |
| `AC-CONV-009-09` | §17.5 角标 | 进行中 2 显示 `2`；进行中 10 显示 `9+`；进行中 0 不渲染 |
| `AC-CONV-009-10` | §17.4 折叠记忆 | 刷新后同会话保持；另一会话首开四块全展开 |
| `AC-CONV-009-11` | §17.4 跳转 | 「还有 9 个」切到任务标签，首行距滚动口顶 0–8px |
| `AC-CONV-009-12` | §17.5 筛选 | 四片计数 11/2/1/3；点击后列表只含对应展示态 |
| `AC-CONV-009-13` | §17.8 任务图 | 8 节点四态、1 条失败下游虚线；21 节点最大层 5 分 2 行 4+1；缩放 1.0；双向滚动 |
| `AC-CONV-009-14` | §17.6 等待语义 | 等待依赖 0 次启动；等待确认 1 确认 + 1 取消；等待资源 1 标记 + 1 恢复 |
| `AC-CONV-009-15` | §17.6 取消 | 取消 A 后 B 状态仍为未开始，B 启动次数 0 |
| `AC-CONV-009-16` | §17.3.5 交付物 | 下载字节数等于 `size`；只列 `user_delivery` |
| `AC-CONV-009-17` | §17.3 隔离 | 切会话后旧会话任务卡 0 个、角标 0 个、详情不存在 |
| `AC-CONV-009-18` | §17.5 时限 | 无自动取消；`task.reminder` 后只多一行「已超出预计 N 分钟」 |

**只读约束**：右栏三标签与任务详情对任务状态、步骤、轨迹、交付物均无写入口。详情层内重试、取消、编辑、删除、确认、恢复按钮 0 个，`form`、`input`、`textarea`、`select` 0 个，POST/PUT/PATCH/DELETE 请求 0 个。允许的可写入口只有两处：消息流任务卡内联区的确认/取消/恢复（§17.6.4），以及交付物「打开」下载链接（GET，§17.3.5）。任务列表厚卡、概览任务行、任务图节点只做打开详情或只读跳转。

**D-17-01 详情覆盖中栏（用户口径，已裁决）**：用户 2026-11-23 明确要求任务详情「右侧滑出盖中栏」，设计 §17.5.1 与 §17.10 原写覆盖右栏面板内容区 280 宽，设计侧正按本裁决回写为覆盖中栏。视口 ≥1024 时，详情层 `position: fixed`，左边缘贴侧栏右边缘、右边缘贴右栏面板左边缘、顶边贴上下文栏底边（视口顶下方 90，即 `48 + 42`）、底边贴视口底；右边缘的横坐标随右栏整栏宽度变化，展开 320（面板 280 + 竖条 40）时为视口宽减 320，收起 40 时为视口宽减 40，宽度等于右边缘与侧栏右边缘之差，即剩余中栏宽。详情打开期间右栏面板与竖条按钮保持可见可点，打开与关闭详情不改变右栏边界，用户用指针点竖条按钮 1 次即生效（切标签或开合面板），点击不被详情层拦截。760–1023 时详情不覆盖中栏，改为覆盖抽屉内容区，宽等于抽屉宽（`min(280, 100vw − 32)`），与设计 §17.10 的 768 档一致；小于 760 不渲染详情。设计 `V-CONV-009-22` 的「覆盖面板」口径随设计回写同步，`V-CONV-009-39` 的 768 宽度口径不变，前端验收以 §17.7.1 的几何断言为准。

### 17.2 右栏三标签壳与两标签迁移

#### 17.2.1 结构与尺寸

右栏根节点为 `aside.inspector[aria-label="会话右栏"]`，带 `data-session`（仅当前会话存在时）、`data-tab`（`overview|tasks|deliverables`）与 `data-collapsed="true|false"`。根节点内不再只有概览，旧的 `aria-label="会话概览"` 改为「会话右栏」，避免读屏把三标签右栏读成单标签。

| 部件 | 选择器 | 尺寸与顺序 | 断言 |
|---|---|---|---|
| 竖条 | `nav.insp-rail[aria-label="右栏导航"]` | 宽 40、右贴应用边缘、按钮 32×32、间距 4、顶部内边距 8、图标 18×18 | `getBoundingClientRect().width` 为 40±1；三个按钮的 `data-tab` 依次为 `overview`、`tasks`、`deliverables` |
| 面板头 | `div.insp-head` | 高 44；左侧标题 12.5/650、计数 10.5；右侧收起按钮 26×26 | 头高 44±1；收起按钮 `aria-expanded` 与 `aria-controls="insp-panel"` |
| 内容区 | `div.insp-body#insp-panel[role="region"]` | 宽 280、独立滚动、内边距 12/14 | 宽 280±1；`overflow-y` 为 `auto`；无横向滚动 |
| 面板脚 | `div.insp-foot` | 高 28；左说明、右更新时间 HH:MM | 高 28±1；文案随标签变化 |
| 整栏 | `aside.inspector` | 展开 320±1，收起 40±1，容器宽度立即落位；内容层 160ms 淡入与位移 | 收起后 `data-collapsed="true"`，内容区 `hidden` 且不进入 Tab 序列 |

样式落地时把既有 `--rail` 从 300 改为 320，`--insp-rail-w` 保持 40，并新增 `--rail-task-panel: 280` 与 `--rail-strip: 40`；`.inspector` 继续用 `var(--rail)`，`.insp-body` 用 `var(--rail-task-panel)`，`.insp-rail` 用 `var(--rail-strip)`，1024px 以下的 `.inspector` 与抽屉的 `right` 都改用 `var(--rail-strip)`。新增的 `--overlay-scrim` 与 `--success-ink` 按 §17.13 的取值落在 `tokens.css`，组件内不写死颜色。

竖条在 DOM 中排在内容区之前，视觉上靠 `order` 放在右侧，这样 Tab 顺序天然是三个竖条按钮、收起按钮、内容区可聚焦元素（设计 §17.2.5）。当前标签按钮带 `class="active"` 与 `aria-current="page"`；只有当前标签带 `aria-expanded`，值为面板是否展开。点击非当前标签只切换标签并展开面板；点击当前标签在展开与收起之间切换。760–1023 时点击任一标签打开抽屉，不改变宽档的收起记忆。

三个图标沿用原型：概览 `☰`、任务 `◷`、交付物 `▤`；每个按钮有 `aria-label`，任务按钮的名称为「任务，N 个进行中」或「任务，9 个以上进行中」。角标是任务按钮内的 `span.insp-badge[aria-hidden="true"]`，右上溢出 3px，最小 14×14、字号 9.5、1.5px `--surface` 描边，1–9 显示数字，10 及以上显示 `9+`，0 不渲染节点。角标不是独立可聚焦元素，计数已经进入按钮的可访问名称。本会话任务数为 0 时任务按钮置 `aria-disabled="true"`，角标不渲染且不占角标位，按钮尺寸与另两个按钮一致。

#### 17.2.2 从两标签迁到三标签

主线现状是 `RightPanel` 单标签（`OverviewContent`）加三个静态竖条按钮，其中「概览」「交付物」只打开抽屉、「消息」无行为；`FilesPanel` 在当前主线计数为 0，B1 回退核验记录在 `docs/testing/ACCEPT-CONV-10-20261122.md:22`，B1 的文件标签实现保存在隔离目录 `.trash/pending-delete/b1-revert/frontend/src/components/FilesPanel.tsx` 与同名测试。B1 的两标签「概览 / 文件」迁移后变为「概览 / 任务 / 交付物」：概览保留并升级为四块，文件标签改名「交付物」并保留文件分组与下载，任务标签为新增。迁移按下面五步做，避免把已签收的右栏投影整体重写。

1. `RightPanel` 保留原名、原导出位置与原 props，内部升级为三标签壳；`OverviewPanel` 保留为兼容别名，现有调用点不改名。`OverviewContent` 的 props 与叶节点类名（`.insp-spec-status`、`.exec-group`、`.exec-head`、`.exec-name`、`.exec-count`）保留，搬进 `OverviewTab` 后原样渲染状态行、目标、输入与交付物块。
2. 静态「消息」按钮删除，改为「任务」标签；静态「交付物」按钮改为真实标签，数据走 N9，交互从 B1 `FilesPanel` 移植文件分组、文件名、时间、大小、类型徽标与下载链接，不恢复 `getSessionFiles` 与旧文件接口调用。
3. 新增 `TasksTab`（筛选条、列表、角标数据）、`DeliverablesTab`（按任务分组）、`TaskDetailLayer`、`TaskGraphDialog`、`TaskMessageCard`、`TaskFilterBar`、`TaskBadge`，均在 `library.tsx` 内实现并从 `components/index.ts` 导出需要测试的组件。
4. `App` 增加右栏会话态：`rightTab`、`rightCollapsed`、`taskFilter`、`taskScrollTop`、`deliverablesScrollTop`，按 `sessionId` 存 `Map`；切换会话时读取目标会话的记录，首次进入用默认值（标签 `overview`、展开、筛选 `all`、滚动 0）。
5. 已签收部分不得回退：无会话时不渲染 `data-session`；草稿会话不发 `spec-projection` 并显示「发送第一条消息后生成目标与执行态」；投影四态文案逐字保留；`messageId` 定位与 1.2s 高亮保留；交付物「仅显示最近 8 个」上限保留在概览；304 走缓存不显示错误；右栏不出现提交、重试、取消入口。概览的「执行会话」三组改为四态任务块是 `AC-CONV-009-12` 与设计 §17.3 要求的可见变化，旧组展开契约在 §9.2 保留为历史，不再用于新概览。

#### 17.2.3 收起状态按会话持久化

收起状态写在 `localStorage` 的 `simo.insp.collapsed.<sessionId>`，值为 `1` 或 `0`；只在 `sessionId` 非空时读写，无会话不写。会话切换时先读该键，缺失按展开处理；用户点击当前标签或收起按钮时写入。`localStorage` 不可用或抛错时退化为当前标签内存，不阻断交互（沿用 E-26 的降级方式）。760–1023 的抽屉模式不读写该键，抽屉开合由 `drawerOpen` 管；从窄档回到宽档时重新读取该会话的值。

收起动作先关闭已打开的任务详情，再把焦点交给打开详情的任务卡；若详情由任务列表行打开，焦点回该行；若由消息流任务卡打开，焦点回该卡；两者都不存在时焦点回任务竖条按钮。收起过渡 160ms，`prefers-reduced-motion: reduce` 时 0ms。收起后 `insp-head`、`insp-body`、`insp-foot` 均 `hidden`，竖条仍可见且三个按钮可操作。

#### 17.2.4 切会话与滚动

切换会话保留当前标签、收起状态与筛选；任务列表与交付物列表回到该会话上次的滚动位置，首次进入回到顶部；详情与任务图在切换时关闭，焦点回标签按钮。旧会话的请求全部作废，角标、列表、详情在 300ms 内不再显示旧会话数据；新会话首个响应到达前显示该标签的骨架屏，不保留旧列表占位。草稿会话的右栏显示草稿占位，任务标签与交付物标签显示空态，不发 N2/N3/N9。

### 17.3 数据来源、时机与合并

#### 17.3.1 接口清单

| 用途 | 方法与路径 | 关键参数 | 何时拉 | 上限与分页 |
|---|---|---|---|---|
| 概览状态、目标、输入 | `GET /api/sessions/{id}/spec-projection` | `taskLimit=3`，条件请求带 `If-None-Match` | 会话选中、投影失效、重连对账 | 单次；304 使用同键缓存 |
| 概览任务块 | `GET /api/sessions/{id}/tasks` | 四次并行：`status=running`、`failed`、`pending`、`done`，每次 `limit=2`；`counts` 取任一次响应 | 概览首次打开、会话切换、相关状态事件后 300ms | 每态 2 行；总数取 `counts` |
| 任务标签列表 | 同上 | `status`（`all` 时不传）、`limit=50`、`before` | 任务标签首次打开、筛选切换、事件后 300ms、滚到底 | 每页 50，`hasMore` 与 `nextBefore` 翻页 |
| 任务详情 | `GET /api/sessions/{id}/tasks/{taskId}` | `traceLimit=200`、`traceBefore` | 打开详情、重连、事件缺口、轨迹「加载更早」 | 轨迹每页 200，上限 500；步骤全量 |
| 任务图 | `GET /api/sessions/{id}/tasks/graph` | 无 | 点击顶栏「任务图」、弹窗内重试 | 单次；节点不分页 |
| 概览交付物 | `GET /api/sessions/{id}/deliverables` | `limit=10` | 概览首次打开、`task.updated` 进入终态后 300ms | 10 组；每组取前 2 个文件；总数取 `fileCount` |
| 交付物标签 | 同上 | `limit=50`、`before`、可选 `taskId` | 交付物标签首次打开、事件后 300ms、滚到底 | 每页 50 组，`hasMore` 与 `before` |
| 汇总卡展开 | `GET /api/sessions/{id}/tasks` | `batchId=<id>`；首屏 `limit=10`，全展 `limit=100` | 展开、点「还有 N 条」、卡片首次出现且 store 无任务 | 默认 10 条；全展 100 条 |
| 创建任务（本变更不由前端发起） | `POST /api/sessions/{id}/tasks` | `mode`、`goal`、`inputs`、`constraints`、`tasks` 1–12 项、`clientMutationId` | 由任务创建链路调用，前端不直接调用 | 单批 1–12 项 |
| 确认/取消（等待确认） | `POST /api/sessions/{id}/tasks/{taskId}/confirmation` | `{decision:"confirm"或"cancel"}` | 消息流任务卡内联按钮 | 单次；进行中禁用 |
| 恢复（等待资源） | `POST /api/sessions/{id}/tasks/{taskId}/resume` | `{reason:"用户从任务卡恢复"}` | 消息流任务卡「恢复」 | 单次；进行中禁用 |
| 交付物下载 | `GET /api/artifacts/{id}/content?download=1` | 无 | 「打开」链接 | 浏览器原生下载 |

N1 属于任务创建链路，本轮前端不直接调用，只消费 `task.created` 与 `message.created`；任务卡里的确认、取消、恢复是任务创建后仅有的写操作。投影请求继续用 `getSpecProjection(sessionId, 3)` 与 `peekSpecProjection` 的 304 分支，不新增第二个投影函数。前端本轮不调用 `POST .../cancel`（N4）与 `POST .../retry`（N5），因为右栏与详情均为只读；确认取消只走 N6 的 `cancel` 决策，整链取消入口不在本轮前端范围内。N4/N5 留给后续有明确入口的变更，不得为了“能取消”在详情里私加入口。

#### 17.3.2 拉取时机与请求规则

概览的三类数据互相独立：投影失败只影响状态、目标、输入三块；任务块的四个状态请求任一失败只影响该状态的两行与计数；交付物失败只影响交付物块。任务标签与交付物标签各自懒加载，首次打开才发请求，标签切换不重复拉取尚未过期的数据。

同一会话按资源槽管理在途请求：任务列表、任务详情、交付物列表、任务图各占一个槽，同一槽只保留最新请求，新请求用 `AbortController` 取消该槽的旧请求；不同槽互不取消。相同 key（会话 id + 接口 + 查询串）的并发调用复用同一个 Promise，响应带请求序号，只有最新序号的响应可以写状态。切会话时对旧会话所有槽的在途请求调用 abort，并丢弃 abort 之后的响应。任务详情同一任务重复打开只聚焦已存在的详情层，不重复发请求；任务图同一时刻只允许一个弹窗。

概览任务块的四次请求共享一个 300ms 防抖窗口；`task.updated`、`task.created`、`task.step`、`task.report` 只标记对应会话的任务块为脏，由防抖统一重拉。任务标签列表只对当前筛选与当前页重拉，翻页请求不取消上一页已展示的数据。`task.reminder` 不触发任何拉取。

草稿会话（`draft` 标记存在）不发 N2/N3/N8/N9，右栏显示草稿占位；首条消息物化后按普通会话重新加载一次。无会话时三标签均不渲染数据，任务竖条角标不显示。

#### 17.3.3 WS 事件

任务相关事件与消息事件都从现有 `connectEvents` 通道进入 `App`，按 `type` 分派。事件载荷的 `id` 是全局单调递增序号；任务内 `stepSeq`、`traceSeq` 从 1 递增，重试不回退。

| 事件 | 前端更新 | 触发重拉 |
|---|---|---|
| `task.created` | 任务 store 按 `id` 插入；概览计数 +1；角标按展示态增减；汇总卡若存在则更新条目 | 概览任务块 300ms；任务列表若当前筛选命中则 300ms |
| `task.updated` | 按 `changed[]` 合并 `status/displayStatus/waitingReason/progress/attempt/triggerCount/failReason`；角标与四态计数做乐观增减 | 计数 300ms 对账；当前列表项若状态不再命中筛选，标记为待移除，下一次刷新时移除 |
| `task.step` | 按 `(taskId, stepId)` 合并 `status/traceCount/progress`；重算 `currentStepId`（第一个 running，否则第一个 pending，全终态为空） | 详情已打开且该步骤不在本地时重拉 N3 |
| `task.trace` | 按 `(taskId, traceSeq)` 去重后追加到对应步骤；`seq` 大于本地最大序号才追加 | 出现序号空洞时重拉 N3 一次 |
| `task.report` | 合并终态 `status/displayStatus/failReason`；不把报告文本塞进轨迹 | 详情已打开时 300ms 重拉 N3 |
| `task.reminder` | 在任务卡、概览行、详情头标记 `reminderAt`；状态不变；只显示一条提醒 | 不重拉 |
| `message.created` | 若 `category="task"` 且 `task_id` 非空，插入消息流任务卡；汇总卡按 `batch_id` 合并 | 任务卡状态缺失时按单卡规则补一次 N3 |

#### 17.3.4 拉取与事件的合并规则

1. **事件去重**：维护最近 500 个已应用事件 id 的 LRU；事件 id 小于等于已应用游标时直接丢弃，重复 id 丢弃。`task.trace` 另按 `(taskId, traceSeq)` 去重，`task.step` 另按 `(taskId, stepId, stepSeq)` 去重，重复帧不改变 DOM。
2. **乱序与缓冲**：每个任务维护 `appliedEventId` 与 `pendingEvents[]`。拉取开始时记下 `cursorAtRequest`；响应到达后先用 HTTP 快照覆盖本地任务与详情，再重放 `id > cursorAtRequest` 的缓冲事件。快照与事件都按幂等合并处理，重复应用不产生重复步骤、轨迹或计数。
3. **空洞处理**：若收到的 `task.trace` 的 `traceSeq` 大于本地最大序号加 1，或 `task.step` 的 `stepSeq` 出现空洞，不猜测缺失内容，立即把该任务标脏并在 300ms 内重拉 N3；重拉期间继续应用后续事件，重拉结果按快照覆盖。
4. **HTTP 权威**：重连后先拉 N2 全量第一页、N9 第一页与所有非终态任务的 N3，再拉最近一页消息；HTTP 结果覆盖本地快照，WS 事件只做增量。`since` 回放量过大时放弃回放，直接走这套对账。
5. **计数**：角标与筛选计数以 N2 的 `counts` 为准。事件到达时先按状态迁移做乐观增减，300ms 后用一次 N2 的 `counts` 覆盖；从事件到计数可见不超过 2s。`counts` 请求失败时保留最后一次已知值，角标不显示 `0` 冒充准确值。
6. **排序**：列表初次加载与翻页使用服务端 `updated_at DESC, id DESC` 顺序；事件更新不立即重排当前列表，避免用户阅读时跳行；下一次筛选、翻页或 300ms 对账后按服务端顺序重排。新任务插入列表顶部。
7. **卡片与任务**：消息卡片的 `task_id` 只做关联，不作为任务状态的权威来源；任务状态以任务 store 为准。`task_count` 与 N2 的 `total` 不一致时以 N2 为准，并在汇总卡上按 N2 的 `total` 重算「还有 N 条」。

#### 17.3.5 交付物标签

交付物标签按任务分组渲染，数据取 N9 的 `groups`：每组一个 `section.deliv-group[data-group-task-id]`，组头高 28，显示任务名、任务状态胶囊与文件数；组内文件行高 30，左侧 28×18 类型徽标（`doc` 用 `--surface-2`/`--ink-2`，`sheet` 用 `--success-soft`/`--success-ink`，`image` 用 `--accent-soft`/`--accent`），中间文件名 11.5 单行省略，右侧元信息 10.5 显示时间与大小，最右是「打开」按钮。打开按钮高 24、命中区不小于 32×24，点击使用 `downloadUrl` 直接下载，`download` 属性带文件名；`previewUrl` 存在时可在新标签打开预览，不阻塞下载。

任务仍在进行时，组头显示 `--accent` 状态与「更新中」标记，文件行出现新增或大小变化时按 `task.updated` 的 300ms 防抖重拉当前页；已进入终态的任务不再显示「更新中」。失败或已取消的任务如果没有交付物，仍保留组头并显示一张虚线说明卡「该任务没有产出交付物」，说明卡内无按钮；有部分文件时正常列出文件，不因任务失败隐藏已产出的文件。

列表每页 50 组，滚到底用 `.deliv-sentinel` 加载下一页，失败时底部显示「交付物加载失败」+「重试」，已加载组不清空。空态为「本会话还没有交付物」，只显示在标签内容区；概览的四块与标签共用 N9，但概览只取前 2 个文件、显示「还有 N 个」，标签显示全部组。交付物标签没有上传、删除、重命名入口，只有下载与预览；切会话时列表清空并按目标会话重新拉取，旧会话的组不与新会话合并。

### 17.4 概览标签

#### 17.4.1 结构与已签收部分

概览顶部保留 §9 的状态行（状态与待确认计数），下面固定四块：目标、输入、任务、交付物，顺序不随内容变化。状态行不属于四块，仍按 §9 的既有契约渲染。四块的标题行、计数、箭头、折叠记忆、工具栏、空态文案与整栏连续滚动按设计 §17.3 执行，选择器固定为 `.insp-block[data-block="goal|input|tasks|deliverables"]`，标题按钮带 `aria-expanded` 与 `aria-controls`。

目标与输入的数据来自投影；任务块的数据来自 N2 的四次状态请求；交付物块的数据来自 N9。投影里的 `tasks` 与 `deliverables` 字段不再渲染到新块，但仍按 `taskLimit=3` 发送请求，以保持 §9 与 304 条件请求的既有形状，避免后端 ETag 行为变化。

任务块先显示一行四态计数，再显示最多 2 行任务，最后是「还有 N 个」。计数文案固定为「2 进行中 / 5 未开始 / 3 已完成 / 1 失败」，数字大小与颜色按设计 §17.3.2；四态顺序为进行中、未开始、已完成、失败。任务行排序为进行中、失败、未开始、已完成，同状态按 `updatedAt` 倒序；行高 26，6px 状态点，任务名 11.5，右侧摘要 10.5。计划任务摘要为「计划 · 5/8 步」，`5` 取 `progress`；边做边想摘要需要 `traceCount`，当前 N2 不返回该字段，按 §17.13 的未决项降级为「边做边想」，不伪造条数。

交付物块每行 28 高，把 N9 的 `groups` 按组顺序拍平后取前 2 个文件，类型徽标按 `typeBadge` 取 `doc|sheet|image`；超过 2 个显示「还有 N 个」，N 为 `fileCount − 2`。概览不显示分页器，滚动由整栏内容区承担。

四块折叠状态按会话记忆，键为 `simo.insp.overview.<sessionId>`，值为已收起块的数组；刷新保持，另一会话首次打开全展开。工具栏「全部收起/全部展开」与单块点击写同一份记忆。收起状态与右栏整体收起是两套状态，互不覆盖；右栏收起再展开时四块折叠状态不变。

#### 17.4.2 数据失败与部分失败

投影失败时，状态行显示 §9 的错误文案与「重试」，目标、输入两块显示同一错误；任务块与交付物块继续用各自接口渲染，不因投影失败整栏报错。任务块某一状态请求失败时，该状态的两行位置显示一行 `.task-block-error[role="alert"]`「任务加载失败」+「重试」，计数显示最后一次已知值并以 `title="数据可能已过期"` 标记；其他三个状态不受影响。交付物请求失败时交付物块显示「交付物加载失败」+「重试」。四个块的重试互相独立，点击只重拉该块。

投影 304 继续使用 `peekSpecProjection` 的缓存，不显示 loading 或错误；投影 404 按会话不存在处理，与 §9 一致。N2/N9 的 404 只在当前会话确实不存在时出现，前端按「会话不存在」关闭右栏数据，不在四个块里分别报错。

#### 17.4.3 「还有 N 个」的跳转落点

点击任务块的「还有 N 个」时，先把任务标签的筛选设为 `all`，预取 N2 的 `limit=50` 第一页，定位第一个不在概览 2 行里的任务 id；预取成功后切到任务标签，等列表渲染出目标行，再设置 `scroller.scrollTop += targetRect.top − scrollerRect.top − 4`，让目标行顶边落在滚动口顶边下方 0–8px。点击后 500ms 用同一公式采样，允许 ±1px；若目标行因分页不在首屏，先加载到包含目标的页再滚动，找不到目标时不滚动并保留列表顶部。

交付物块的「还有 N 个」同样处理：先拉 N9 的 `limit=50`，定位第一个未显示文件，切到交付物标签，滚到该文件行。滚动口是 `.insp-body` 的内容区，不是视口；宽档滚动口顶边在视口顶下方 174，768 档为 182，这两个数值只用于定位滚动口，不作为判据零点。跳转后焦点移到目标行，目标行临时加 `.is-jump-target` 类显示 2px `--focus` 外框，1.2s 后移除。

### 17.5 任务标签、筛选与角标

#### 17.5.1 筛选条与列表

任务标签的面板头为「任务」+「N 个」，筛选条吸顶高 40，四片固定为「全部 11」「进行中 2」「失败 1」「已完成 3」。筛选是本地状态，存在 `App` 的 `taskFilter`（按会话存），默认 `all`；切换不发请求参数以外的状态变更，100ms 内完成，列表回到顶部，筛选条下方 1px `--line-soft`。未开始没有独立筛选片，只计入「全部」。

四片的计数取 N2 的 `counts`：`all=counts.all`、`running=counts.running`、`failed=counts.failed`、`done=counts.done`；计数为 0 时仍渲染该片并显示 `0`，不能隐藏。筛选请求的 `status` 取 `running|failed|done`，`all` 不传；`failed` 由后端同时匹配 `failed/cancelled/interrupted`。列表项只显示该筛选对应展示态，取消与中断归入失败片。

列表每页 50，使用 `hasMore` 与 `nextBefore`；滚到底用 `IntersectionObserver` 监听 `.task-list-sentinel`，加载下一页，同时保留一个可见的「加载更多」按钮作为无障碍与失败重试回退。翻页追加时按 `id` 去重，加载中不重复请求；请求失败时在列表底部显示 `.task-list-error[role="alert"]`「任务加载失败」+「重试」，已加载项不清空。筛选结果为空时显示「没有符合条件的任务」，`all` 为空时显示「本会话还没有任务」。

#### 17.5.2 角标

角标数字等于 `counts.running`，包含等待确认与等待资源中的任务。`1–9` 显示原数字，`10` 及以上显示 `9+`，`0` 不渲染节点。角标挂在任务竖条按钮的右上角，不作为独立焦点；按钮的可访问名称为「任务，N 个进行中」或「任务，9 个以上进行中」。本会话 `counts.all` 为 0 时，任务标签按钮置 `aria-disabled="true"`，仍可聚焦但不切换标签、不展开面板，角标节点不渲染也不保留占位；`task.created` 或对账后 `counts.all > 0` 时 2s 内移除 `aria-disabled`。

角标更新时机：收到 `task.created`、`task.updated`、`task.report` 时按展示态变化做乐观增减；300ms 后用 N2 的 `counts.running` 覆盖；从事件到角标可见不超过 2s。筛选切换、标签切换、收起右栏都不改变角标。WS 断线期间保留最后一次值，重连对账后 2s 内更新；事件序号空洞时先重拉 `counts`，不把空洞期间的变化累加两次。

#### 17.5.3 厚卡与可点规则

任务列表的每张卡为 `button.task-card[data-task-id][data-status]`，整卡是按钮，四态都可点、可聚焦：进行中用 `--accent` 左条，已完成为 `--success`，未开始为 `--surface-2`，失败为 `--danger`。任务名 12/600 单行省略，状态胶囊 18 高，元信息含模式标签、产出数「产出 N 个」、等待标签（`waitingReason=dependency` 时显示「等待前置」，确认与资源分别显示「等待确认」「等待资源」）。计划卡有步骤刻度与卡脚；边做边想卡在 N2 不返回 `traceCount` 与最近轨迹时只显示模式标签与卡脚，不渲染空的轨迹块。

点击整卡打开只读详情，状态、步骤、轨迹、事件与写请求的变化量均为 0；打开后该卡加 `.is-open`，边框转 `--accent-line` 并带 2px `--accent-soft` 外光晕，与详情同时可见时保持。失败卡仍可点，失败说明以「失败：」开头最多 3 行，卡面不展开；未开始卡同样可点，详情按 §17.7 渲染待启动步骤。

#### 17.5.4 加载、空与失败

列表首次加载显示 3 张骨架卡，骨架高度与厚卡一致，占位不跳动。列表失败时保留筛选条与面板头，列表区显示错误与重试；重试只重拉当前筛选页。部分失败只出现在分页追加：已加载的 50 条保留，底部显示追加失败与重试。当前筛选在事件后不再命中任何任务时，不立即抽走正在阅读的卡，等下一次刷新或筛选切换再移除，避免列表跳动。

### 17.6 消息流任务卡

#### 17.6.1 判定字段与数据补全

任务卡是普通消息行的一种渲染分支，判定条件为 `message.role === "agent"`、`message.category === "task"`、`message.taskId` 为非空字符串。三个字段缺一，按普通消息渲染，不生成任务卡、不加可点区、不发任务请求。`Message` 类型增加 `batchId?: string` 与 `taskCount?: number`，分别映射后端的 `batch_id` 与 `task_count`；`category="task"` 必须在 `CATEGORY_LABEL` 的未知类别回退到 `consultation` 之前分支，否则会被渲染成咨询标签。

任务卡状态以任务 store 为准。卡片首次渲染时若 store 中没有该 `task_id`，发一次 N3（`traceLimit=1`）补 `status/displayStatus/progress/waitingReason`，结果按任务 id 缓存 30s；同一任务的多张卡与详情共享这份缓存，不重复请求。汇总卡的条目状态用 N2 的 `batchId` 列表补全，不为每个条目单独发 N3。

#### 17.6.2 单卡

单卡选择器为 `article.msg-task-card[data-task-id]`，最宽 720，与文本同左缘，底色 `--surface`、1px `--line`、圆角 10、内边距 10 12、左缘 2px 状态条。卡头左侧「任务」小标签 9.5，任务名 12.5/600，右侧状态胶囊；元信息 10.5 显示模式、计划任务的步骤数（`progress.total`）与产出数，边做边想卡不显示轨迹条数（N2 不返回该汇总，见 U-17-01）；计划任务最多 2 行步骤摘要，失败任务加一行失败说明。卡内唯一可聚焦的打开入口是「查看任务」按钮，高 24、命中区不小于 120×24，带 16 箭头与 2px 焦点框；任务名、胶囊、元信息、步骤摘要、空白区域不可点、不可聚焦、无 hover。

等待确认的卡在卡内联区渲染「确认」「取消」两个按钮，各 1 个，高 24、字号 10.5；等待资源的卡渲染「等待资源」标记 1 个与「恢复」按钮 1 个。两类入口只出现在消息流卡内联区，详情内 0 个。其他状态的任务卡不显示取消、重试、编辑、删除入口。

#### 17.6.3 汇总卡与 10 条上限

汇总卡选择器为 `article.msg-task-summary[data-batch-id]`，折叠时一行「已创建 N 个任务」+「展开」按钮，另一行列前三个任务名与「等 N 个」。`N` 取 `message.taskCount`，与 N2 的 `total` 不一致时以 N2 为准。默认平铺 10 条，每条 28 高，条目不可点、不可聚焦；展开按钮变「收起」，120ms 完成，展开后消息流滚动位置不变。

超过 10 条时第 11 条起收进一个整行按钮 `.task-summary-more`，文案「还有 N 条」，N 为 `total − 10`；点击后原位展开全部条目，入口消失，不再二次折叠。收起再展开回到 10 条加一个入口。首屏请求 `batchId` + `limit=10`，点「还有 N 条」请求 `limit=100`；`limit=100` 仍不足时按 `hasMore` 继续分页，直到入口消失。请求失败时在卡内显示 `.task-summary-error[role="alert"]`「任务加载失败」+「重试」，卡不整体消失。

#### 17.6.4 点击打开详情与状态、路由

「查看任务」点击后依次做四件事：把右栏标签切到 `tasks`；关闭任务图（若开着）；设置 `openTaskId` 并打开详情层；发 N3 拉详情（有缓存先显示缓存，再静默刷新）。同一任务的详情已经打开时，只把焦点移入详情层，不重发请求、不重放打开动画。四步对一个点击只算一次动作，不产生两次打开动画。详情打开期间右栏任务标签仍可见，消息流保持原滚动位置。

前端不新增浏览器路由，不修改 URL，不写 history；`openTaskId` 是 `App` 内存态，刷新后不恢复，浏览器后退不关闭详情。关闭方式只有三种：详情右上关闭、Esc、点击遮罩（若该档有遮罩）；关闭后焦点回到触发它的「查看任务」按钮。任务图节点打开详情时先关闭弹窗，再走同一打开流程，焦点最终落在步骤行而不是「查看任务」按钮。

#### 17.6.5 等待、取消与失败卡

等待确认时，点「确认」发 N6 `{decision:"confirm"}`，点「取消」发 N6 `{decision:"cancel"}`；请求进行中两个按钮都禁用，文案分别为「确认中…」「取消中…」，防止双击重复提交。成功后在 2s 内按事件或响应更新状态，按钮消失；取消成功后当前步状态为失败、失败原因为「用户取消」，下游保持未开始，下游步骤启动 0 次。失败时在卡内显示 `.task-card-error[role="alert"]` 与服务端文案，按钮恢复可点，不把卡片替换成错误态。

等待资源时，点「恢复」发 N7 `{reason:"用户从任务卡恢复"}`；进行中禁用并显示「恢复中…」，成功后从暂停步骤继续，已完成步骤不重跑。等待依赖时卡上只显示「等待前置」标签，不提供确认、取消、恢复入口；前置失败或取消时等待方保持未开始，不级联标记失败。

失败卡与未开始卡都可点「查看任务」，失败说明只读。取消或中断由后端事件推送时，卡片在 2s 内更新为失败片对应的展示态，已渲染的卡不抽走，等下一次筛选或刷新时归位。

### 17.7 任务详情

#### 17.7.1 覆盖层几何与只读约束

详情层选择器为 `section.task-detail[role="dialog"][aria-modal="true"][data-task-id][data-mode]`，`aria-labelledby` 指向任务名标题。视口 ≥1024 时按 D-17-01 覆盖中栏：`position: fixed`，左边缘与侧栏右边缘差 ≤1px，右边缘与右栏面板左边缘差 ≤1px，顶边在中栏内容顶（视口顶下方 90），底边到视口底，宽度等于右边缘减侧栏右边缘（剩余中栏宽）；右栏整栏展开时右边缘横坐标为视口宽减 320（面板 280 + 竖条 40），收起时为视口宽减 40，右栏面板与竖条按钮全程可见。详情打开与关闭不改变右栏边界；模态范围只含中栏与侧栏，`inert` 不加到右栏上，因此指针点竖条按钮 1 次即生效，Tab 焦点仍在详情层内循环。760–1023 时 `position: absolute` 于抽屉内容区，`inset: 0`，宽度等于抽屉宽；小于 760 不渲染。打开动画 150ms，`prefers-reduced-motion` 时 0ms。

详情头高 44，左侧「任务详情」小标题、任务名 15/650、状态胶囊与「只读」徽标，右侧 24×24 关闭按钮 `aria-label="关闭任务详情"`。头下方是可滚动的内容区 `.task-detail-body`，包含步骤区、启动上下文区、产出区；详情脚不设操作按钮。详情层内的可交互元素只有关闭、步骤展开、轨迹「展开/收起」、「加载更早轨迹」、交付物「打开」链接；重试、取消、编辑、删除、确认、恢复入口均为 0，表单控件为 0。

详情打开时给背景应用根节点加 `inert`，锁定 `document.body` 的滚动，关闭后恢复原滚动位置与 `inert` 状态。详情与任务图不同时存在；打开任务图前先关闭详情，打开详情前先关闭任务图。会话切换时关闭详情，不保留旧任务。

#### 17.7.2 计划步骤列表

计划模式的步骤区为单列 `ol.task-steps`，每步一行 `li.task-step[data-step-id][data-status]`，左缩进 12，最小高 30，步骤之间 1px `--line-soft`。步骤头在已完成、进行中、失败三种状态是可聚焦按钮 `button.task-step-head[aria-expanded][aria-controls]`，待启动步骤是无箭头的静态行，不带 `tabindex`、不带 `role="button"`、不响应 Enter/Space。

当前步骤默认展开，展开区显示「轨迹 N 条 · 进行中」与轨迹列表；已完成步骤默认收起，点击展开回看，展开后标题为「已归档 · 可收起」；失败步骤默认展开，显示「失败：<原因>」与失败轨迹；待启动步骤只显示序号、标题与「等待前置」或空摘要。8 步示例中第 6 步为当前步，默认展开并显示 8 条轨迹；第 5 步可点回看；第 7 步无箭头、无入口、不可聚焦。

任务推进时，若用户没有手动收起当前步骤，新当前步骤自动展开并把旧当前步骤收起；用户手动收起当前步骤后，后续推进不再自动展开，只在步骤头显示「进行中」。详情打开时按 `currentStepId` 展开对应步骤；没有当前步时展开失败步；全部终态时作为例外展开最后一步，其余收起。

步骤名过长时截断为单行，右侧的展开按钮 12×12，最多展开 3 行；步骤摘要与失败原因在展开区内完整显示，失败原因不截断到不可读。

#### 17.7.3 轨迹渲染与增量追加

轨迹列表为 `ul.task-traces`，每行 `li.task-trace[data-trace-id][data-trace-seq]`，栅格为 32/1fr/45，左侧类别标签高 15，中间文本，右侧时间 `HH:MM:SS`。类别按后端 `category` 映射为「思考」「动作」「观察」；工具名用等宽字体显示在类别后；未知类别原样显示，不回退成「思考」。越权观察的文本以 `403 ` 开头，按普通观察行渲染，不额外加图标或颜色。

轨迹文本默认最多 4 行，超出显示「展开」按钮；展开后完整显示，按钮变「收起」。`task.trace` 事件只追加新行，不重建整个 `ul`：已有 `li` 的 DOM 节点在追加前后保持同一节点，列表容器不重新挂载；步骤头的「轨迹 N 条」计数同步加 1。追加时若用户停留在列表底部 48px 内，保持贴底；否则保持当前滚动位置，并在列表底部显示「N 条新轨迹」按钮，点击后滚到底。

首次打开拉 200 条（`traceLimit=200`）。`tracesHasMore=true` 时在列表顶部显示「加载更早轨迹」，每次用 `traceBefore` 拉 200 条并前插，前插后保持当前可见行的位置不跳动。详情内轨迹 DOM 上限 500 条；达到上限后不再前插，顶部显示「仅显示最近 500 条」。前端不引入虚拟列表，理由是 500 条单列轨迹在中栏宽度下渲染成本可接受，虚拟化会破坏焦点恢复与落点测量；超过上限用截断提示，不用假行占位。

#### 17.7.4 边做边想详情

`data-mode="explore"` 时，详情内容区是扁平时间线 `ol.task-timeline`，每行 `li.task-trace[data-trace-seq]`，按 `at` 升序，时间单调不减；步骤节点 0 个、步骤分组 0 个、步骤展开入口 0 个。当前动作是最后一行，打开详情时滚到底部，让最后一行完整可见；最后一行加 `.is-current` 标记，但不改变任务状态。时间线行不截断文本，不提供「展开」入口；超过 200 条时同样用「加载更早」分页，首屏只显示最近 200 条。

边做边想任务在任务列表与概览中的模式标签为「边做边想」，状态胶囊与计划任务一致；详情头显示「边做边想」而不是「计划」。步骤接口返回空数组属于正常情况，不显示「没有步骤」错误，改显示时间线；时间线为空时显示「还没有循环轨迹」。

#### 17.7.5 跳转落点与焦点

`openTaskDetail(taskId, {stepId, source})` 支持三种来源：任务列表行、消息流任务卡、任务图节点。来源带 `stepId` 时，详情数据加载完成后执行 `scrollToStep(stepId)`：等 `requestAnimationFrame` 让目标行完成布局，计算 `scroller.scrollTop += rowRect.top − scrollerRect.top − 4`，让目标行顶边落在滚动口顶边下方 0–8px；500ms 后复测，若落在区间外再修正一次，容差 ±1px。目标行加 `tabindex="-1"` 并 `focus({preventScroll:true})`，同时加 1.2s 的 `.is-jump-target` 焦点框；除目标步骤必须展开外，不改变其他步骤的展开状态，不改变任务状态。

来源没有 `stepId` 时，按状态行所指步骤计算：进行中取第 N 步（`currentStepId`），失败取失败步，已完成取最后一步，未开始取第 1 步；边做边想取最后一行动作。详情尚未加载完就收到跳转请求时，只保留最后一个待执行跳转，数据到达后执行一次，不排队多个滚动动画。目标步骤属于未展开的已完成步骤时，先展开该步骤再滚动；属于待启动步骤时不展开，只把行滚入视口并聚焦。

从任务图节点跳转时，先关闭弹窗，再打开详情并执行上述跳转；关闭弹窗不把焦点还给顶栏按钮，最终焦点落在步骤行。从消息流任务卡打开且不带 `stepId` 时，只打开详情顶部，不滚动到步骤。

#### 17.7.6 关闭与焦点管理

详情打开时焦点进入关闭按钮；Tab 在详情内循环，顺序为关闭按钮、步骤头、轨迹展开、加载更早、交付物链接，最后回到关闭按钮；背景内容因 `inert` 不可聚焦。Esc 关闭详情并把焦点还给来源：任务列表行或消息流「查看任务」按钮；来源是任务图节点时按 §17.8.3 处理，焦点落在步骤行，只有详情加载失败时才回关闭按钮；来源已被移除时焦点回任务竖条按钮。点击遮罩关闭只在 760–1023 抽屉档存在；宽档详情不设遮罩，点击中栏其他区域不关闭详情。

关闭详情后，若右栏处于收起流程，先关闭详情再收起，焦点按 §17.2.3 的顺序回落；不把焦点留在已卸载的步骤行。

#### 17.7.7 启动上下文与产出

详情内容区在步骤区下方依次渲染启动上下文与产出。启动上下文取 N3 的 `context`，用 `section.task-context[data-block]` 分四行：目标 `context.goal` 恰好 1 条，为空时显示「未记录目标」；约束 `context.constraints` 逐条列出，0 条时显示「无额外约束」；输入 `context.inputs` 逐条列出，0 条时显示「未带入输入」；历史消息固定显示「历史消息 0 条」，不得显示历史消息正文，也不得为此额外请求消息接口。目标与约束的条数来自响应数组长度，不在前端用任务名或消息文本推断。

预算取 N3 的 `budget`，显示「已用 <usedTokens>/<maxTokens> tokens · <usedSteps>/<maxSteps> 步」；`maxTokens` 或 `maxSteps` 为 0 时隐藏对应片段，不显示 `0/0`。产出取 N3 的 `deliverables`，按文件行渲染，每行 30 高，复用 §17.3.5 的类型徽标与「打开」下载链接；0 个文件时显示虚线说明「该任务没有产出交付物」。`task.reminder` 到达后，详情头在状态胶囊旁加「已超出预计 N 分钟」，不改变任务状态、不新增按钮。

启动上下文、预算与产出都是只读展示，不提供编辑目标、增删约束、重跑、重试、取消入口；产出只允许下载与预览，下载请求复用 `downloadUrl`，不在详情里重新拼接口路径。

### 17.8 任务图弹窗

#### 17.8.1 入口与打开条件

入口固定在顶栏右侧工具区，选择器为 `button.topbar-task-graph[aria-label="任务图"]`，高 28，文案「任务图」，原型 s1–s9 均有此入口。入口只在会话页显示；无会话、草稿会话、当前会话任务数为 0 时置 `aria-disabled="true"`，点击不打开弹窗，`title` 为「本会话还没有任务」。任务数未知时允许点击，弹窗内显示加载态，失败时显示错误与重试。

点击入口立即打开弹窗并显示加载态，同时发 N8；不先等接口返回再开，避免点击到弹窗出现的空白期。N8 成功且 `total=0` 时弹窗显示空态「本会话还没有任务」与关闭按钮；失败时显示「任务图加载失败」+「重试」。弹窗打开时焦点进入关闭按钮，背景 `inert`，页面滚动锁定。

#### 17.8.2 节点、边与布局

弹窗选择器为 `div.task-graph-dialog[role="dialog"][aria-modal="true"][aria-labelledby]`，宽 920，最大窗宽减 64，高 `min(620, 窗高 − 80)`，圆角 12，1px `--line`，`--shadow-pop`，150ms 淡入；760–1023 时全屏、圆角 0。头高 52，标题「任务图 · <会话名>」，副行显示四态计数；图例行高 32，含四态圆点与虚线样例。底部脚注「只读跳转 · Esc 关闭」。

节点为 `button.task-graph-node[data-task-id][data-status]`，尺寸 156×64，圆角 8，1px `--line`，内边距 7 9，左缘 2px 状态条；三行分别是模式行 9、任务名 12/600 单行省略、状态行 9.5。四态都可点、可聚焦，`data-status` 取 `done|running|failed|pending`；`cancelled`、`interrupted` 归入 `failed` 样式，状态行显示后端的 `displayStatus`。状态行文案为「已完成 · 4 步」「进行中 · 第 6 步」「失败于第 5 步」「未开始 · 等待前置」等。

边为 `path.task-graph-edge[data-from][data-to][data-style]`，1.4px `--line`，带箭头；当边的起点任务为失败、取消或中断时，`data-style="dashed"`，虚线 4/3、`--danger`、55% 不透明度；下游节点本身若不是失败，仍显示未开始与「等待前置」，不因上游失败改状态。节点数不超过 20 时按 4 列排布，列间距与行间距 24，画布超出时纵向滚动；超过 20 时按 N8 的 `layers` 分层，每层一行，单层超过 4 个时每 4 个换行，层自上而下、层内按创建顺序。21 个节点且最大层 5 个时，该层排成 4+1 两行。画布双向滚动，缩放固定 1.0，不提供缩放按钮、不响应 Ctrl+滚轮，节点不重叠时不做自动避让。

节点内不显示交付物数量与依赖线标签；依赖关系只通过边表达，`joinMode` 不显示在节点上。图例固定四项，四态圆点 6px，虚线样例 22×8、4/3。

#### 17.8.3 点节点只读跳转

点任一节点（含失败与未开始）依次执行：关闭任务图弹窗；打开该任务详情；按任务状态计算目标步骤（进行中第 N、失败失败步、已完成最后一步、未开始第 1 步）；滚动到目标步骤并把焦点落在步骤行。边做边想任务打开时间线详情，滚到最后一行当前动作。整个动作不改变任务状态、不展开或收起任务图节点、不发出写请求；`GET` 请求只允许 N3 与详情内分页。

跳转落点与 §17.7.5 相同，0–8px、500ms 复测、±1px；目标行聚焦后显示一次 2px 焦点框。关闭弹窗时焦点不回到顶栏入口，最终焦点在步骤行；若详情加载失败，焦点回关闭按钮并在详情内显示错误，不把用户丢回顶栏。

#### 17.8.4 关闭、焦点与键盘

关闭入口为三个：Esc、右上 24×24 关闭按钮、点击遮罩；三者只关闭弹窗，不关闭右栏、不切换标签。打开时焦点进关闭按钮；Tab 循环为关闭按钮、节点按阅读顺序、关闭按钮，背景不可聚焦；Shift+Tab 反向循环。Esc 关闭后焦点回顶栏「任务图」按钮；点击节点关闭后焦点按 §17.8.3 落在步骤行。节点支持 Enter 与 Space 触发点击；方向键不实现网格导航，保持 Tab 顺序，避免与浏览器滚动冲突。

### 17.9 状态、边界与并发

#### 17.9.1 状态与失败矩阵

| 场景 | 用户看到 | 行为约束 |
|---|---|---|
| 概览首次加载 | 状态行骨架 + 四块骨架（任务块 2 行、交付物 2 行） | 骨架与最终高度一致；不出现「暂无任务」闪烁 |
| 任务列表首次加载 | 3 张骨架卡 | 筛选条与面板头先渲染；骨架不可聚焦 |
| 详情首次加载 | 头显示列表带来的任务名与状态，正文 4 行步骤骨架 | 关闭按钮可用；Esc 可关闭；骨架不进入 Tab |
| 任务图加载 | 弹窗头 + 居中「任务图加载中…」 | 关闭按钮可用；不显示空白节点 |
| 无任务 | 任务标签 `aria-disabled="true"`；当前标签已是任务标签时显示「本会话还没有任务」；概览任务块「还没有任务」；任务图空态 | 角标不渲染不占位；筛选片计数全为 0 |
| 无交付物 | 交付物标签「本会话还没有交付物」；概览「还没有交付物」 | 不显示空分组头 |
| 列表 500 | `.task-error[role="alert"]`「请求失败（500），请稍后重试」+「重试」 | 保留筛选条与已加载项；不整栏白屏 |
| 详情 500 | 详情正文错误 +「重试」，头与关闭保留 | 重试仍 500 时不循环自动重试 |
| 详情 404 | 「任务不存在或已被移除」+「关闭」 | 不显示任务名以外的服务端细节；不自动重试 |
| 交付物 404 | 交付物标签错误 +「重试」 | 不把 404 渲染成空态 |
| 投影 304 | 使用缓存，无 loading、无错误 | 不发第二次请求，不闪骨架 |
| WS 断线 | 顶栏/状态栏既有「重连中」；右栏保留最后一次数据 | 角标不归零；列表不自动清空 |
| WS 重连 | 先显示旧数据，2s 内完成对账 | 拉 N2 第一页、N9 第一页、非终态 N3；重复项按 id 去重 |
| 取消确认失败 | 卡内 `.task-card-error[role="alert"]` + 服务端文案 | 按钮恢复；不乐观改状态 |
| 取消成功 | 状态变失败、失败原因「用户取消」，下游未开始 | 下游启动次数 0；不把下游标失败 |
| 任务图失败 | 弹窗内「任务图加载失败」+「重试」+「关闭」 | 不显示半张图；不自动重试 |
| 切会话 | 旧数据 300ms 内消失；新会话骨架 | 旧请求 abort；详情与弹窗关闭 |
| 刷新页面 | 任务数据重新拉取；右栏收起状态与概览折叠状态保持 | 标签、筛选、滚动位置回到默认 |

#### 17.9.2 并发、去重与顺序

同一资源槽的请求只允许一个在途实例，后到请求取消旧请求；相同 key 的并发调用复用 Promise。任务列表、详情、批次展开、交付物列表、任务图各自独立成槽，不同槽互不取消。同一任务详情重复打开只聚焦已有层，不重复建层；同一批次汇总卡重复展开只发一次 `limit=100`。确认、取消、恢复按钮在请求进行中禁用，并用 `requestId` 丢弃过期响应；双击只产生 1 次 POST。

事件与请求的合并按 §17.3.4：事件按 id 去重，轨迹按 `traceSeq` 去重，步骤按 `stepSeq` 去重，快照后重放缓冲。重连后如果事件 id 出现无法解释的跳跃，不猜测缺失事件，直接走 N2/N9/N3 对账；对账结果覆盖本地，事件只补增量。角标与筛选计数的乐观更新最多保留 300ms，随后被 N2 的 `counts` 覆盖；覆盖失败时保留乐观值并标记 2s 后重试一次，不无限重试。

#### 17.9.3 错误码与前端动作

本节把契约表类 3 的 39 个码逐条落到前端动作，码值与 HTTP 与 `specs/contract/CONV/contract.md` 的 CT-CONV-101 至 CT-CONV-139 一一对应，顺序相同；同一响应只按表中该码对应的动作处理一次，未列入的码按 500 处理。「§错误与降级矩阵」按失败场景组织、记触发条件与实现位置，本表按码值组织、记前端动作，两者互不替代。

| 码值 | HTTP | 前端表现与动作 |
|---|---|---|
| `bad_request` | 400 | 就地提示服务端文案，保留输入与筛选值，不重试 |
| `forbidden` | 403 | 提示无权限，不重试；破坏性动作不发第二次 |
| `not_found` | 404 | 刷新列表或切回主会话，不乐观删除本地项 |
| `conflict` | 409 | 提示已归档只读并给恢复入口，不重复提交 |
| `body_too_large` | 413 | 提示体积超限，要求删减或分片，不原样重试 |
| `internal` | 500 | 区内错误提示可重试，不整栏白屏 |
| `unsupported_media_type` | 415 | 提示文件类型不受支持并移除该附件 |
| `unavailable` | 503 | 提示稍后重试，退避后只重试一次 |
| `archive_blocked` | 409 | 列出 blockers，解除后由用户手动重试 |
| `main_session_protected` | 409 | 主会话不渲染归档入口，触发时提示主会话不可归档 |
| `session_archived` | 409 | 切只读态，Composer 禁用，给恢复入口 |
| `session_not_found` | 404 | 刷新会话树并切回主会话，清空旧消息 |
| `invalid_session` | 400 | 按前端缺陷处理，提示刷新页面 |
| `invalid_scope` | 400 | 只发 `scope=all`，不重试非法值 |
| `messages_too_many` | 413 | 提示分页加载，不一次性全量拉取 |
| `edit_disabled` | 400 | 不渲染编辑入口，只读展示该消息 |
| `mutation_in_progress` | 409 | 保留同一 `clientMutationId` 稍后重试，不换 id 重发 |
| `invalid_task_limit` | 400 | 钳制到 1–50 或改用默认 50，不提示用户 |
| `invalid_attachment` | 400 | 移除该附件并提示重新上传，保留文本 |
| `too_many_attachments` | 400 | 提示最多 5 个附件，超出部分本地移除 |
| `file_too_large` | 413 | 提示单附件上限并移除该附件 |
| `invalid_path` | 400 | 移除附件并要求重新上传 |
| `upload_not_found` | 404 | 重新上传该附件，其余保持不变 |
| `invalid_multipart` | 400 | 按前端缺陷处理，提示重新选择文件 |
| `missing_file` | 400 | 补齐 file 字段后重试一次 |
| `invalid_argument` | 400 | 按服务端文案就地提示，保留输入 |
| `team_not_found` | 404 | 刷新团队列表，不回显旧团队 |
| `invalid_sandbox` | 400 | 设置项回到合法枚举值并提示 |
| `confirmation_required` | 400 | 打开 danger-full-access 确认弹窗，未确认不发请求 |
| `bad_decision` | 400 | 只发 `allow_once`、`allow_session`、`deny` |
| `task_not_found` | 404 | 关闭详情、刷新列表，不提示无权限 |
| `task_state_conflict` | 409 | 用 `currentStatus` 刷新任务，隐藏不适用入口 |
| `invalid_task_mode` | 400 | 回退到计划模式，清空步骤输入 |
| `invalid_task_status` | 400 | 筛选重置为全部 |
| `task_batch_too_large` | 400 | 提示批次上限并拆批提交 |
| `invalid_task_dependency` | 400 | 就地提示非法依赖并阻止提交 |
| `task_context_too_large` | 413 | 提示目标、输入或约束超限，要求删减 |
| `permission_denied` | 403 | 展示为工具调用失败，不重试 |
| `task_executor_unavailable` | 503 | 禁用发起入口并提示稍后重试 |

### 17.9.4 任务展示态与迁移

前端只展示四个任务态，不展示八个存储态；映射关系由后端 `displayStatus` 给出，契约表类 2 的中文展示名按此表落到前端四态（契约表 112 至 123 行）。`pending` 汇总未开始、排队与阻塞，`failed` 汇总失败、已取消与已中断，因此筛选条的四片与展示态一一对应（§17.5.1）。

| 状态 | 含义 | 契约中文名 |
|---|---|---|
| `pending` | 尚未开始或等待依赖、确认、资源 | 未开始、排队、阻塞 |
| `running` | 正在执行 | 进行中 |
| `done` | 全部步骤完成 | 已完成 |
| `failed` | 执行失败、被取消或被中断 | 失败、已取消、已中断 |

| 从状态 | 到状态 | 触发 |
|---|---|---|
| `pending` | `running` | 首个任务开始执行 |
| `pending` | `failed` | 启动前失败或被取消 |
| `running` | `done` | 全部步骤完成 |
| `running` | `failed` | 执行失败、取消或中断 |
| `failed` | `pending` | 用户显式重试 |

### 17.10 可访问性

| 元素 | 语义与属性 | 键盘 |
|---|---|---|
| 右栏竖条 | `nav[aria-label="右栏导航"]`；三个 `button`，当前项 `aria-current="page"`，当前项带 `aria-controls="insp-panel"` 与 `aria-expanded` | Tab 依次进入三个按钮；Enter/Space 切换或开合；不实现方向键漫游 |
| 角标 | `span.insp-badge[aria-hidden="true"]`；数字进入任务按钮的 `aria-label` | 不单独聚焦 |
| 收起按钮 | `button[aria-label="收起右栏"]` 或「展开右栏」，`aria-expanded`、`aria-controls` | Enter/Space 切换；收起后焦点回竖条当前项 |
| 筛选 | `div[role="group"][aria-label="任务筛选"]`；每片 `aria-pressed`，名称含计数 | Tab 进入选中片；左右方向键移动并切换；Enter/Space 应用 |
| 任务卡 | `button.task-card`，可访问名为任务名 + 状态 + 进度 | Tab 逐张；Enter/Space 打开详情 |
| 消息卡打开区 | `button.task-card-open`，名称「查看任务：<任务名>」 | Tab 到按钮；Enter/Space 打开 |
| 汇总卡 | 展开按钮 `aria-expanded`；条目不可聚焦 | Enter/Space 展开/收起 |
| 详情层 | `role="dialog"`、`aria-modal="true"`、`aria-labelledby`、`aria-describedby`；背景 `inert` 只加中栏与侧栏，右栏竖条与面板不加 | 焦点进关闭；Tab 循环；Esc 关闭并归还焦点；右栏可指针点击 |
| 步骤行 | 可展开步骤用 `button[aria-expanded][aria-controls]`；待启动行无 role、无 tabindex | Enter/Space 展开/收起；跳转目标 `tabindex="-1"` 一次性聚焦 |
| 轨迹 | 「展开」按钮 `aria-expanded`；时间用 `<time datetime>` | Enter/Space 展开 |
| 任务图 | `role="dialog"`、`aria-modal="true"`；节点为 `button`，名称为任务名 + 状态 + 步骤 | Tab 循环；Enter/Space 跳转；Esc 关闭 |
| 错误 | 行内 `role="alert"`；加载容器 `aria-busy="true"` | 错误出现时读屏播报一次；重试按钮可聚焦 |

焦点环统一 2px `--focus`、外偏移 2；不使用 `outline: none` 去掉焦点。详情打开时 `document.body` 滚动锁定，关闭后恢复焦点与滚动；任务图同理。`prefers-reduced-motion: reduce` 时右栏 160ms、详情 150ms、任务图 150ms、筛选 100ms 过渡全部改为 0ms，但状态切换与落点不变。

### 17.11 测试影响

#### 17.11.1 需修改的既有用例

| 文件 | describe / 用例 | 修改原因 |
|---|---|---|
| `frontend/src/components/RightPanel.test.tsx` | `'RightPanel / OverviewPanel'` | 根 aria 由「会话概览」改「会话右栏」；竖条三按钮由静态改可切换；概览四块替代执行组；新增三标签与详情断言；抽屉关闭用例保留但改为标签开合 |
| `frontend/src/components/RightPanelRail.cdp.test.tsx` | 顶层 `it('1024：恢复展开态（inspector 280、正文可见、无抽屉遮罩），中栏仍可读')`、`it('760/1023/1024/1179：图标条与展开档的边界值')`、`it('1180：三栏指标不变（sidebar 228 / 面板 568 / 时间轴 44 / inspector 280 / rail 40）')` | 1024/1179 的 inspector 由 280 改 320、中栏宽相应减 40；rail 仍 40；1180 三栏指标重算；点当前标签从「打开抽屉」改为宽档开合、窄档开抽屉 |
| `frontend/src/components/conversation-responsive.test.tsx` | `'右栏三档：760–1023 图标条、≥1024 展开、<760 隐藏（V-CONV-008-6）'` | CSS 变量断言可保留，需复核 `--rail` 由旧值改 320 后中栏与抽屉宽度不溢出；不新增快照 |
| `frontend/src/components/MessageItem.test.tsx` | 新增 `describe('任务卡消息')`，保留既有分类与卡片用例 | `category="task"` 必须在未知类别回退前分支；补单卡、汇总卡、失败卡可点、缺 `task_id` 回落普通消息 |
| `frontend/src/App.integration.test.tsx` | `'App sidebar counts and task group top-up (CONV-008-02 / CONV-001-05)'` | 概览执行组展开与补取被四态任务块替代；该 describe 改为任务块计数与「还有 N 个」跳转，或删除组补取断言 |
| `frontend/src/App.projection-stats.test.tsx` | `'右栏投影的条件请求'`、`'底部汇总的节流刷新'` | 投影请求形状不变，但 App 挂载后会新增 N2/N9 请求，fetch 桩需补默认 200 空响应，否则错误态干扰投影断言 |
| `frontend/src/App.*.test.tsx` 共用桩 | 各 App 级 describe | 统一在测试桩里返回 N2/N9 的空页与 `counts` 全 0，避免每个用例重复 404 |

`ExecRowHitArea.test.tsx`、`LibraryUtilities.test.tsx`、`Sidebar.test.tsx`、`StatusBar.test.tsx`、`TimelineGroups.test.tsx`、`MessageTableLayout.test.tsx`、`MetricsDashboard.test.tsx` 不依赖右栏三标签，保持不改为默认；若共用 `RightPanel` 的测试因根 aria 改名失败，按上表同批修改。

#### 17.11.2 需新增的测试文件

| 文件 | 覆盖 |
|---|---|
| `frontend/src/components/TaskPanel.test.tsx` | 三标签切换、筛选四片、计数与角标 0/9/10、列表分页、空/失败/部分失败、收起持久化 |
| `frontend/src/components/TaskMessageCard.test.tsx` | 单卡判定、缺字段回落、汇总卡 10 条与「还有 N 条」、全展后入口消失、确认/取消/恢复、失败卡可点 |
| `frontend/src/components/TaskDetail.test.tsx` | 只读 0 入口、启动上下文目标 1/历史 0、产出行与下载、计划步骤展开规则、边做边想 14 行、轨迹追加 DOM 不变、加载更早、跳转落点 0–8px、焦点归还 |
| `frontend/src/components/TaskGraphDialog.test.tsx` | 四态节点、失败下游虚线、21 节点分层 4+1、点节点关弹窗并跳步骤、Esc 与焦点陷阱 |
| `frontend/src/components/TaskPanel.cdp.test.tsx` | 320/40/280 像素、详情覆盖中栏左右边差 ≤1px、768 覆盖抽屉、滚动口 174/182、500ms 落点采样 |
| `frontend/src/taskEvents.test.ts` | 事件去重、乱序缓冲、轨迹/步骤序号空洞重拉、重连对账、计数 300ms 覆盖与 2s 上限 |
| `frontend/src/api.tasks.test.ts` | N2/N3/N8/N9 查询参数与分页、304 投影缓存、404 详情、abort 与在途复用 |

#### 17.11.3 验证命令与证据

前端增量：`cd frontend` 后运行 `pnpm vitest run src/components/TaskPanel.test.tsx src/components/TaskMessageCard.test.tsx src/components/TaskDetail.test.tsx src/components/TaskGraphDialog.test.tsx src/taskEvents.test.ts src/api.tasks.test.ts`；布局证据跑 `pnpm vitest run src/components/TaskPanel.cdp.test.tsx src/components/RightPanelRail.cdp.test.tsx`；全量回归按 §1.5 的 115 例基线加新增用例统计，不能把 skip 计为通过。

追溯门禁：在仓库根目录运行 `node scripts/check-trace.mjs`，PATH 无 node 时用 `E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe scripts\check-trace.mjs`，要求末行 `PASS`。本节只改前端 spec，不新增 PRD 行与 TEST 锚点，门禁应保持 PASS。

### 17.12 前端判据

| 编号 | 断言 | 映射 |
|---|---|---|
| `F-CONV-009-01` | 根节点 `aside.inspector[aria-label="会话右栏"]` 存在；展开宽 320±1，收起宽 40±1；内容区 280±1 | AC-08 / V-1 |
| `F-CONV-009-02` | 三个竖条按钮 `data-tab` 顺序为 overview、tasks、deliverables，均 32×32；当前项 `aria-current="page"` | AC-08 / V-2 |
| `F-CONV-009-03` | 收起后 `data-collapsed="true"`，内容区 `hidden`；刷新同会话仍收起，另一会话首开展开 | AC-08 / AC-10 |
| `F-CONV-009-04` | 任务按钮角标：2 显示 `2`，10 显示 `9+`，0 不渲染节点且不占角标位；`counts.all=0` 时按钮 `aria-disabled="true"` 且点击不切标签；`aria-label` 含进行中数 | AC-09 / V-4 |
| `F-CONV-009-05` | 概览四块 `data-block` 顺序为 goal、input、tasks、deliverables；折叠状态刷新保持 | AC-10 / V-9 |
| `F-CONV-009-06` | 任务块四态计数文案为「2 进行中 / 5 未开始 / 3 已完成 / 1 失败」；任务行最多 2 行 | AC-12 / V-8 |
| `F-CONV-009-07` | 点任务块「还有 9 个」后标签为 tasks，首个未显示行顶边距滚动口 0–8px，500ms 采样 ±1px | AC-11 / V-10 |
| `F-CONV-009-08` | 四片文案为「全部 11」「进行中 2」「失败 1」「已完成 3」；切换后列表只含对应展示态，列表回顶 | AC-12 / V-21 |
| `F-CONV-009-09` | 厚卡四态均可点可聚焦；点击后详情 `data-task-id` 相同，任务状态与写请求变化量 0 | AC-12 / V-20、V-43 |
| `F-CONV-009-10` | 消息卡判定要求 `role=agent`、`category=task`、`task_id` 非空；缺一按普通消息渲染 | AC-01 / V-36 |
| `F-CONV-009-11` | 12 条任务时汇总卡默认 10 条 + 「还有 2 条」；点开后条目 12 条、入口 0 个；收起再展开回 10 条 + 入口 | AC-02 / V-37、V-38 |
| `F-CONV-009-12` | 单卡「查看任务」命中区 ≥120×24；点击后右栏标签为 tasks 且详情打开，只发一次打开动作 | AC-01 / V-36 |
| `F-CONV-009-13` | 失败卡与未开始卡都有「查看任务」且可聚焦；点击只打开只读详情 | AC-01 / V-20 |
| `F-CONV-009-14` | 等待确认卡有 1 个「确认」、1 个「取消」；等待资源卡有 1 个标记、1 个「恢复」；详情内对应入口 0 个 | AC-14 / V-30、V-31 |
| `F-CONV-009-15` | 取消确认后当前步状态 failed、失败原因「用户取消」，下游未开始且启动次数 0 | AC-15 / V-43 |
| `F-CONV-009-16` | 详情根 `role="dialog" aria-modal="true"`；启动上下文显示目标 1 条、约束 ≥1 条、历史消息 `0` 条；重试/取消/编辑/删除/确认/恢复按钮 0 个，关闭 1 个，表单控件 0 个 | AC-03、AC-07 / V-22 |
| `F-CONV-009-17` | ≥1024 详情左边缘与侧栏右缘差 ≤1px、右边缘与右栏面板左缘差 ≤1px、顶边距视口顶 90±1px、底边到视口底；右边缘横坐标在整栏展开时为视口宽 − 320、收起时为视口宽 − 40，宽度等于右边缘减侧栏右缘；右栏整栏宽 320±1（收起 40±1）且面板与竖条按钮可见，详情开合前后右栏边界不变，点竖条按钮 1 次即生效 | D-17-01 / V-22 |
| `F-CONV-009-18` | 768 详情覆盖抽屉，宽等于抽屉宽，任务图全屏圆角 0；<760 不渲染 | V-39 |
| `F-CONV-009-19` | 8 步示例第 6 步默认展开、第 5 步可点回看、第 7 步无箭头无 tabindex | AC-05 / V-23、V-25 |
| `F-CONV-009-20` | 边做边想详情 14 行、步骤节点 0、分组 0、展开入口 0，时间单调不减 | AC-06 / V-30、V-31 |
| `F-CONV-009-21` | `task.trace` 追加后旧 `.task-trace` 节点仍为同一 DOM 节点，轨迹数 +1，列表不重新挂载 | V-28 |
| `F-CONV-009-22` | 轨迹首屏 200 条；「加载更早」每次 +200；DOM 上限 500 条后显示「仅显示最近 500 条」 | V-29 |
| `F-CONV-009-23` | 任务图四态节点均 `button` 且可点；失败起点边 `data-style="dashed"`；下游未开始不被标失败 | AC-13 / V-32、V-33 |
| `F-CONV-009-24` | 21 节点最大层 5 个时分 2 行 4+1；画布 `scrollWidth > clientWidth` 且 `scrollHeight > clientHeight`；无缩放控件，节点尺寸 156×64 | AC-13 / V-34、V-35 |
| `F-CONV-009-25` | 点任务图节点后弹窗关闭、详情打开、目标步骤顶边距滚动口 0–8px、焦点在步骤行；状态差 0、写请求 0 | AC-13 / V-43 |
| `F-CONV-009-26` | 角标与四态计数在 `task.updated` 后 2s 内更新；N2 `counts` 300ms 覆盖；断线期间不清零 | V-40 |
| `F-CONV-009-27` | 无时限任务 30 分钟不自动取消；`task.reminder` 后只多 1 条「已超出预计 N 分钟」，状态不变 | AC-18 / V-41、V-42 |
| `F-CONV-009-28` | 切会话后旧任务卡、角标、详情 300ms 内消失；旧请求被 abort；新会话数据从空态或骨架开始 | AC-17 / V-40 |
| `F-CONV-009-29` | 详情 Tab 焦点陷阱与 Esc 关闭；关闭后焦点回来源；任务图 Tab 循环与 Esc 关闭回顶栏入口 | V-6、V-33 |
| `F-CONV-009-30` | `:root` 计算样式中 `--overlay-scrim`、`--rail-task-panel`（280px）、`--rail-strip`（40px）、`--success-ink` 均可读出且值匹配；§17 新增的 `components.css` 规则不含 `#` 十六进制颜色字面量 | V-44 |

### 17.13 未决项与依赖

新增 token 的取值为 `--overlay-scrim: rgba(22, 23, 27, 0.34)`、`--rail-task-panel: 280px`、`--rail-strip: 40px`、`--success-ink: rgba(42, 115, 84, 1)`；`--success-ink` 与 `--success-soft` 的组合对比度按设计 §17.13 的 5.04:1 验收，若主题调整后低于 4.5:1，必须改 token 而不是改组件内的颜色。

| 编号 | 未决项 | 当前处理 | 需要谁决定 |
|---|---|---|---|
| `U-17-01` | N2 不返回 `traceCount`、最近一条轨迹、`joinMode`，边做边想卡无法显示「14 条」与最近轨迹 | 概览摘要降级为「边做边想」，卡面不渲染空轨迹块；详情用 N3 的 `traces` 与 `tracesHasMore` 计算 | 后端补字段最佳；不补则前端不接受「N 条」文案判据 |
| `U-17-02` | 任务图入口设计未写，原型顶栏有「任务图」按钮 | 固定为顶栏 `button.topbar-task-graph[aria-label="任务图"]`，任务数 0 时禁用 | 设计补入口位置 |
| `U-17-03` | 消息流每张任务卡首次渲染若 store 无状态，各补一次 N3，长会话可能放大请求 | 30s 缓存 + 同任务共享 + 汇总卡只走 N2；仍应在实现时观察请求数 | 后端可在 `message.created` 载荷带 `displayStatus/progress` |
| `U-17-04` | N4/N5（取消、重试）无前端入口；AC-15 的取消只能由 N6 在等待确认时触发 | 本文件明确不调 N4/N5，整链取消与重试留给后续变更；AC-15 验收走 N6 取消路径 | 产品确认是否需要整链取消入口 |
| `U-17-05` | 768 档抽屉右贴竖条左缘还是右贴 16px，设计 §8 与 §17.10 措辞不完全一致 | 按现有 CSS 右贴竖条（`right: var(--insp-rail-w)`），宽度 `min(280, 100vw − 32)` | 设计复核 |

