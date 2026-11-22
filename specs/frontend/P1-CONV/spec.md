# 前端长期 Spec · 会话域（P1-CONV）

> **文档类型**：长期 Spec（按域一个文件，功能点按 ID 分节；粒度依据 `docs/plan/MASTER-PLAN.md` §1.7）
> **域**：`P1-CONV` 会话域 ｜ **验收面**：12 个 PRD（CONV-001..008 + SYNC-001..004；SYNC-005 已于 2026-11-22 移除）
> **上游**：`specs/product/P1-CONV/spec.md`（行为契约的唯一事实来源；本文件只把它落成**前端可验收的契约**）
> **本轮变更包**：`specs/changes/CHG-CONV-006/`（`product.md` 六条默认裁决 + `tasks.md` W1–W5 共 20 张卡）
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

排除项：`PRD-SYNC-005`（远程访问与通知中心）已于 2026-11-22 移除，编号不复用，本文件不写前端契约。

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
- 切会话清链：`app.tsx:295-311` 的 effect 里 `setAncestorMessages([])` / `setAncestorError('')` / `setEmptyAncestorIds(new Set())`；滚动位置存 `scrollPositionsRef`（`:94`），`restoreScrollRef` 恢复（`:206-217`）。
- 插入祖先时的滚动锚定：`useLayoutEffect`（`app.tsx:186-204`）用 `[data-message-id]` 定位校正，连续 apply 幂等（CDP 04a 断言偏移 ≤1px）。

### 8.3 接口调用

| 方法 | 签名 | 路由 | 入参 | 出参 |
|---|---|---|---|---|
| `getAllSessionMessages` | `(sessionId): Promise<{messages?; sessionId?; archived?; pagination?}>`（`api.ts:163-165`） | `GET /api/sessions/{id}/messages?scope=all`（`backend/internal/modules/chat/module.go:173-176` 同时注册了 `/messages` 与 `/messages/all`） | `sessionId` | `{messages: Message[], archived?, pagination?}` |

错误路径（`app.tsx:522` 的文案映射，逐字可断言）：
- 含 `413` → `消息过多，暂不能完整加载`（CDP 04b 已验证消息数不变）。
- 含 `403` → `无权读取该上级会话`（CDP 04c 验证仍可继续对话）。
- 空数组 → `setAncestorError('上级没有消息')` + 记入 `emptyAncestorIds`（`:513`，CDP 04d 验证按钮仍可继续向上）。
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
| E-16 | 祖先加载 403 | `无权读取该上级会话`，按"无上级"继续对话 | `app.tsx:522`；CDP 04c | ✅ |
| E-17 | 上级会话无消息 | `上级没有消息`，按钮仍可继续向上 | `app.tsx:513`；CDP 04d | ✅ |
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
| — | 待定 | 待 Lead/设计 review：C-01/02/03/06/08/17 需裁决后，本文件置 `ready` | `CHG-CONV-006` §6 待确认 |
