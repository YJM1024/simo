# FE-007 试点复盘：祖先消息整级加载（第一次真实 SDD 试点）

> 日期：2026-11-12
> 试点：`FE-007-ancestor-messages`（祖先消息按会话整级加载）
> 签字 build：`mwdnshfe-yu2wp`（视觉+功能签字通过；**未部署**）
> 结论：**FE-007 功能/视觉试点通过（带 P2 遗留）；SDD 流程试点部分通过**。
> 原则：本文只写能从文件/验收记录复核的事实；推断处标【推断】，未验证处标【未验证】。

---

## 0. 一句话结论

FE-007 的 **spec、AC、组件先行、独立验收**这条主线是成立的：验收记录完整到“3→15→45 条 / 45 bars / 3 groups / 锚定差 0.09375px / 375 可加载”（[acceptance.md](../tasks/acceptance.md) 第 429–440 行），并且预检在“前端未接”时**拒绝签字**（同文件第 388–421 行）。

但流程试点**没有完全通过**：接口/前端接入的上线顺序、`parentId`/`hasMore` 契约证据、413/403 可造性、同帧双 click、按钮文案一致性这五处，都是**签完才发现“证据不足以证明完整契约”**，而不是在实现前被门禁挡住。结论与遗留见 §5。

---

## 1. 做对了什么（有证据的部分）

### 1.1 spec 先把“不可含糊的契约”写死了

`specs/FE-007-ancestor-messages/spec.md` 不是功能描述，而是可直接映射验收的契约：

- **根会话**：`parentId === ""`，明确不允许用 `null/undefined`（spec 第 76 行、§5.1 第 72–83 行）；
- **整级全量**：必须 `pagination === false` 且 `hasMore === false`，任一缺失/为 true 都视为契约不满足，禁止把分页拼成“全部”（spec 第 103–108 行）；
- **错误路径**：413 明确“不插入、不分页降级”（spec 第 112 行、§7 第 156 行）；
- **滚动锚定**：`data-message-id` + 偏移校正，误差 ≤1px（spec 第 126–136 行）；
- **验收 A1–A10**：逐条对应场景与通过标准（spec 第 172–183 行）。

这直接决定了后面的验收能“按条打勾”，而不是靠感觉说“看起来没问题”。

### 1.2 组件先行，组件签字在页面接入之前

`TimelineGroups` 先独立签字（build `mwdmvfow-9d8pn`），验收记录写明：组间距 6px、aria 不含分类、点击/Enter 与 `aria-current` 切换；FE-007 才接入（[acceptance.md](../tasks/acceptance.md) 第 380–386 行；[STATUS.md](../tasks/STATUS.md) 第 36 行）。

最终 FE-007 的 A5 能一次通过，不是页面里重造组件，而是复用了已签组件：`45 bars / 3 groups / 祖先 opacity .55/.55、当前 1 / gap 6/6 / rail 44px`（acceptance 第 435 行）。组件先行在这里省掉了“页面里写一次性组件再回头改”的返工。

### 1.3 独立验收预检真的挡住了“未实现先签字”

第一次预检明确写：

- 后端 `GET /api/sessions/{id}/messages?scope=all` 已可用（main 30 条、researcher 12 条，404/400/413 路径已实测）；
- 但前端 `api.ts` 尚无该调用、`app.tsx` 无祖先按钮/链状态、App 仍用旧 Timeline；
- **不签字**，待前端交付固定 build 后按 A1–A10 复验（acceptance 第 390、394–397、421 行）。

这说明门禁不是形式：**后端接口可用 ≠ 前端可验收**，预检在这一点上没有放水。

### 1.4 验收证据可复核，且把“没造出来”写清楚了

签字 build `mwdnshfe-yu2wp` 的 A1–A10 不是一句话通过：

| 证据点 | 实测值 | 位置 |
|---|---|---|
| 整级加载 | 一次 `scope=all`；3→15→45；bars 15/45；groups 2/3 | acceptance 第 432–433 行 |
| 时间轴 | 45 bars = 45 条；祖先 .55/.55、当前 1；gap 6/6；rail 44px | acceptance 第 435 行 |
| 滚动锚定 | `msg-sub-01` offset -46.4063 → -46.3125，差 **0.09375px ≤1** | acceptance 第 436 行 |
| 错误/空 | 500 不插入、413 mock 不插入、空上级提示且可继续向上 | acceptance 第 438 行 |
| 响应式 | 375 加载 3→15、timeline 隐藏、无横向溢出、console 0 | acceptance 第 440 行 |

**隔离夹具与截图**：`SIMO_HOME=.tmp-fe007-home`，树 `main(30) → 研究员(12) → 子级(3)`，另有空父(0)、归档父(3)；静态 8898 代理隔离后端，页面 HTTP 仅 GET，未触碰 8787（acceptance 第 427 行）。截图 DPR2：`frontend/review/fe007-{1600,1280,1180,375}.png`（acceptance 第 440 行）。

并且 P2 风险没有被藏起来：同帧双 click、413 为 mock、403 未造出、文案差异都写进了签字记录（acceptance 第 442 行；[STATUS.md](../tasks/STATUS.md) 第 47、53 行）。

### 1.5 早期接入缺口被后续 build 补上了；但 live 与验收夹具不是同一档数据

早期接入 build `mwdnov0d-kq3a7` 只验证到“子会话 12 + 主会话 30 = 42 条 / 2 组”，并明确列出未实测：切会话清链、加载失败/413、空上级、archived 上级、逐级 >2 层（[COMPONENT-LIBRARY.md](../../frontend/review/COMPONENT-LIBRARY.md) 第 128–132 行）。

最终 build 把这些缺口补成 A1–A10（3 级链、空/归档上级、413/失败、去重/锚定/375）。这是**真实返工**，不是一次成型。

但必须区分两套数据：

- **live 截图**：[`fe007-live-1600.png`](../../frontend/review/fe007-live-1600.png)、`fe007-live-1280.png`、`fe007-live-375.png`——画面是 **2 级**（主会话 + 研究员）**42 条**（12 + 30）；
- **验收夹具截图**：[`fe007-1600.png`](../../frontend/review/fe007-1600.png)、`fe007-1280.png`、`fe007-1180.png`、`fe007-375.png`——验收记录是 **3 级**、**45 条**（3 → 15 → 45）。

**live 截图不能当作 3 级验收证据**；反过来，验收夹具也不是 live 生产数据。这是本试点最容易被“截图看起来一样”掩盖的差异（见 §2.6）。

### 1.6 文档门禁后来从红变绿，但它只证明结构

2026-11-12 复查时，`node scripts/check-sdd.mjs` 输出：

```text
specs: 11（COMP 3）；A 编号: 93，已映射: 93；manifest 组件: 32
SUMMARY: PASS（失败 0，警告 0）
EXIT: 0
```

FE-007 目录也已补上 `test-plan.md`（A1–A10 映射到 `docs/tasks/acceptance.md` 的预检/实机验收）。这说明**结构门禁**已经闭合；但它不检查 `hasMore` 是否实测、413/403 是否造出、文案是否逐字一致——所以 §2 的问题仍然成立。

---

## 2. 出了什么问题（按根因，不按表象）

### 2.1 “接口未上线”：实际是“前端接入层未上线 + 预检无法签收”

**事实**：

- 预检时后端全量接口已可用（acceptance 第 390、394–397 行）；
- 但前端 `api.ts` 尚无 `scope=all` 调用、`app.tsx` 无祖先按钮/链状态、App 仍用旧 Timeline（acceptance 第 390、397 行）；
- 预检因此**不签字**（第 421 行）。

**根因**：流程把“后端接口存在”当成“功能可开始/可验收”，但 spec 的验收对象是**前端行为**（按钮、prepend、锚定、时间轴）。缺少一个“前端消费契约已上线/可调用”的独立门禁，导致：

1. 先等前端实现，再回到预检；
2. 早期接入 build 只覆盖 2 层、没有失败/空/归档路径（COMPONENT-LIBRARY 第 128–132 行），需要二次返工到最终 build。

**准确表述**：这不是后端没实现，而是 **“接口可用 ≠ 前端接入可用”**；如果复盘只写“接口未上线”，会把根因归错层。

### 2.2 `parentId` / `hasMore` 契约有歧义，验收证据没有锁死字段值

**事实**：

- spec 要求根 `parentId === ""`（不是 null/undefined），并要求 `pagination === false && hasMore === false`（spec 第 76、103–108 行）；
- 预检只记录了 `pagination:false`、`scope:"all"`、`total`（acceptance 第 394 行），**没有记录 `hasMore`**；
- 最终 A2 证据记录的是“一次请求、3→15、bars15、groups2、无重复”（acceptance 第 432 行），**仍未记录响应里的 `hasMore`/`pagination`/`parentId` 实际值**。

**根因**：

- `templates/handoff-api.md` 虽然写了“分页/全量/游标”和“413/409/403 语义”，但没有要求**填写并签字精确值**（空字符串 vs null、false vs 缺失）；
- `templates/evidence.md` 的测试表没有“契约字段实测值”列，A2 只证明“一次请求 + 消息数增加”，不能从证据本身证明“后端确实返回了全量而非第一页”。

**风险**：如果后端返回 `pagination:false` 但 `hasMore:true`，或者根 `parentId` 返回 null，当前验收记录无法单凭证据发现；只能靠实现者口头说明。这是**证据缺口**，不是实现 bug。

### 2.3 413/403 没有造出来，签字时只作为 P2 记录

**事实**：

- 413 是 **mock**，没有造 >50000 实体库（acceptance 第 438、442 行；STATUS 第 47、53 行）；
- 403 跨用户**未造出**（acceptance 第 439、442 行）；
- 签字仍通过（acceptance 第 425 行），把两者列为 P2/残余。

**根因**：

- 单用户本地环境没有“跨用户 403”的天然夹具；
- 413 需要 >50000 条消息的隔离库，成本高，预检只写了“需造或 mock”（acceptance 第 400 行），但没有在 test-plan 里规定“造不出时谁批、替代断言是什么、是否允许签完整通过”；
- `templates/test-plan.md` 有“未覆盖/豁免”章节（第 5 节），但没有“不可造出路径”的固定字段与签字人。

**后果**：A8/A9 的“通过”是**范围受限的通过**；如果下一个试点继续用“造不出就写 P2”的口径，验收会逐渐变成“主路径通过即可”。

### 2.4 同帧双 click 会发两个相同请求

**事实**：

- 同帧同步双 click（0ms）会发 **2 个相同 `scope=all` 请求**；60ms 真实双击只有 1 个；无 in-flight ref 合并（acceptance 第 442 行）；
- 签名时列为 P2，不阻塞。

**根因**：

- spec 的 A2/A8 写的是“loading 不可重复点”“同一 parent 重复请求合并”（spec 第 159 行），但验收步骤只验证了**UI disabled**，没有用程序化 0ms 双击验证**同一帧的竞态**；
- `skills/frontend-implementation` 的检查表没有“in-flight guard/请求合并”，`skills/testing-strategy` 也没有“同帧双触发”条目；
- 验收证据没有记录请求次数上限（只记录“一次请求”，但双 click 场景没有并入 A2 的断言）。

### 2.5 按钮文案与 spec 不一致

**事实**：

- spec 文案：`加载上级会话：<标题>`（spec 第 38 行、A1 第 174 行）；
- 实际：`显示上级会话：研究员`（acceptance 第 431 行）；
- 签字记录把它列为 P2 文字差异（acceptance 第 442 行；STATUS 第 53 行）。

**根因**：

- spec 没有“文案表/唯一来源”约束；AC 只写了语义（按钮存在/可点击），没有断言精确文案；
- 验收证据表没有“文案一致性”列，导致“加载/显示”这种差异只能在人工备注里出现；
- 结果：签字通过，但 spec 与实现不一致；下一位实现者或用户无法判断以哪个为准。

### 2.6 live 是 2 级 42 条，验收夹具是 3 级 45 条：数据档位不一致

**事实**：

- live 截图 `frontend/review/fe007-live-{1600,1280,375}.png` 显示 **2 级**：主工作区（main）+ 研究员；侧栏显示 **42 条**（研究员），没有第三级祖先；
- 验收夹具截图 `frontend/review/fe007-{1600,1280,1180,375}.png` 与 A1–A10 记录是 **3 级**：main(30) → 研究员(12) → 子级(3)，加载后 **3 → 15 → 45**（acceptance 第 427、432–433 行）；
- 早期接入 build `mwdnov0d-kq3a7` 也是 **2 级 42 条**（COMPONENT-LIBRARY 第 128–132 行），并且明确未测“逐级 >2 层”。

**问题**：

1. `fe007-live-*` 只能证明“2 级场景在 live 可看”，**不能证明 3 级链**；
2. 3 级 45 条只在隔离夹具验证，live 没有对应数据，导致“验收通过”和“用户实际看到”不是同一档；
3. 如果只拿 live 截图做汇报，评审者会误以为 3 级已在线验证。

**根因**：验收证据没有强制区分“live 数据档位”和“夹具数据档位”；test-plan 没有“live 2 级 / 夹具 3 级”的对照行，截图文件名也没有承载档位信息（`fe007-live` vs `fe007` 不够显式）。

### 2.7 文档门禁已绿，但 evidence/状态仍未按验收收口

**事实**：

- 复盘时 `node scripts/check-sdd.mjs` 已 **exit 0**（11 specs / 93 A / 93 已映射 / 32 components，0 fail/0 warn）；
- FE-007 已补 `specs/FE-007-ancestor-messages/test-plan.md`，A1–A10 都能映射；
- 但同目录仍**没有 `evidence.md`**，证据实际写在 `docs/tasks/acceptance.md` 第 388–442 行；
- `spec.md` 顶部状态仍写“**spec ready（待 Lead/前端确认；未实现）**”，与“2026-11-12 已签字通过”不一致；
- `scripts/README.md` 第 55 行仍保留“FE-007 无 test-plan/evidence”的旧基线（历史记录，但现在 test-plan 已补）。

**根因**：`check-sdd` 是结构检查，不检查“spec 状态与验收状态同步”“evidence 必须落在 spec 目录或显式链接”；所以文档门禁绿了，但**验收收口没有落回 spec**。

**风险**：下一个人读 spec 会以为“未实现”，读 acceptance 才知道“已签”；证据链不在 spec 目录，无法从 spec 一跳到底。

---

## 3. 框架 / 模板 / skill 具体改什么

> 以下不是“加强意识”，而是可直接改文件、加字段、加门禁的条目。优先级：P0 先改 §3.1–§3.5，P1 改 §3.6–§3.9。

### 3.1 `docs/process/FRAMEWORK.md` §2.2 门禁表

在 `Design Ready` 与 `Tasks Ready` 之间新增 **Contract Ready（Blocking）**：

- 后端交付 `handoff-api`，前端确认可消费；
- 必须写死：`parentId` 哨兵（空字符串/非空）、`pagination`/`hasMore` 精确值、413/403 的 fixture 或 mock 方案；
- 没有 Contract Ready 签字，不派前端实现任务。

同时扩展 `Verify` 的通过条件：

- AC 证据必须含**契约字段实测值**（不是只写“请求成功”）；
- 文案类 AC 必须含**精确文案**；
- “未造出/仅 mock”必须进入豁免表，不得写在 PASS 备注里。

### 3.2 `docs/process/SCENARIOS.md` §1 新功能

- **必产物**明确加 `handoff-api.md`（后端→前端，含精确字段值）；
- **门禁**增加 `Contract Ready`（Blocking），位置在 `Design Ready` 之后、`Tasks Ready` 之前；
- **验收**增加两条：
  - 全量/分页类接口：证据必须记录 `pagination`/`hasMore`/`parentId` 实际值；
  - 错误路径：413/403 若不能造出，必须走“不可造出路径”表并有人签字豁免。

### 3.3 `docs/process/templates/handoff-api.md`

在 §1 增加“**必填契约值**”表（不是描述，是逐项填空）：

| 字段 | 必须写死 |
|---|---|
| 根 parentId | `""`（空字符串）；null/undefined 不接受 |
| 非根 parentId | 直接上级 id |
| 全量判定 | `pagination=false` 且 `hasMore=false`（缺一不可） |
| 413 触发 | 阈值、错误码、mock/实体夹具方式 |
| 403 触发 | 跨用户/权限夹具；无法造出时谁批豁免 |
| 文案 | 按钮/空态/错误文案的**精确字符串** |

§6 接收判据增加：

- [ ] 示例响应包含上述字段的**实际 JSON 值**；
- [ ] 413/403 有可执行 mock 或夹具方案；
- [ ] 文案表与 spec 逐字一致。

### 3.4 `docs/process/templates/test-plan.md`

- §2 AC 映射新增三类必填行：**契约字段**（parentId/pagination/hasMore）、**同帧双触发/并发**、**文案精确性**；
- 新增 §3.1 “不可造出路径”表：`路径 | 原因 | 替代断言（mock/单测） | 谁批豁免 | 是否影响签字`；
- 新增 §3.2 “数据档位”表：`live / 隔离夹具 / 消息数 / 层级 / 是否覆盖 3 级 / 截图名`；live 与夹具不得混用；
- §5 未覆盖/豁免：要求写“未造出”而不是“未覆盖”；豁免必须有人签字，不能只写 P2。

### 3.5 `docs/process/templates/evidence.md`

- §3 测试表增加列：`契约字段实测值`、`请求次数`、`文案实际值`、`数据档位（live/fixture）`；
- §5 未跑/豁免：把“未造出”单列，不允许与 PASS 混写；
- §6 风险/备注：要求区分“产品缺陷 / 证据缺口 / 环境限制 / 已知 flake”；live 截图只能证明 live 档位，不得当作 3 级夹具证据。

### 3.6 `docs/process/skills/backend-contract/SKILL.md`

- 在“步骤 2 契约”后加 **“前端可消费包”**：示例响应、字段哨兵、错误码、mock/夹具、文案；
- 在“检查表”加：
  - [ ] 全量/分页字段有精确值，不依赖口头说明；
  - [ ] 413/403 有可触发方式（实体或 mock）；
  - [ ] 交接包已签字，前端才开工。

### 3.7 `docs/process/skills/frontend-implementation/SKILL.md`

- 输入增加“已签字的 handoff-api；未签不实现”；
- 步骤 3 数据接入增加：
  - in-flight ref + 同 parent 请求合并；
  - loading 期间**程序化**双 click/同帧触发验证；
- 步骤 4 交互增加：
  - 按钮文案逐字取自 spec/文案表，不自行改写；
  - 根 `parentId === ""` 判断，不把 null/undefined 当根；
- 检查表增加“请求次数上限”“文案与 spec 逐字一致”。

### 3.8 `docs/process/skills/testing-strategy/SKILL.md`

- 步骤 1 风险清单增加“同帧双触发/请求合并”和“不可造出路径”；
- 步骤 3 AC→断言增加“契约字段值断言”；
- 检查表加：
  - [ ] 全量/分页类 AC 有 `pagination`/`hasMore` 实测值；
  - [ ] 413/403 未造出时有 mock/豁免签字；
  - [ ] 文案类 AC 有精确文案证据。

### 3.9 `docs/process/templates/task-card.md` / `scripts/check-sdd.mjs`

- `task-card.md` §1 增加“契约签字状态”；§3 冻结契约增加“handoff-api 路径”；§5 证据要求增加“契约字段/文案/数据档位”。
- `scripts/check-sdd.mjs`：FE-* 必须存在同目录 `test-plan.md` 或 `evidence.md`，或在 spec 中给出**可解析的显式链接**；仅有全局 acceptance 不算映射；新增“spec 状态不得早于验收状态”告警（如 spec 仍写未实现、acceptance 已签字）。FE-007 的 test-plan 已补、check-sdd 已 exit 0；因此这条规则的作用是防止下一例再次“结构绿、收口没落回 spec”。

---

## 4. 下一次试点怎么避免（可执行清单）

### 4.1 开工前（Contract Ready）

1. 后端先在隔离 build 上跑一次 `scope=all`，把**完整 JSON** 贴进 handoff-api：`parentId`、`pagination`、`hasMore`、`total`、错误码。
2. 前端确认：根 `parentId === ""`；`pagination===false && hasMore===false`；否则不接。
3. 413/403 在 test-plan 里先写清楚：实体夹具、mock、谁批豁免；**没有方案不进入实现**。
4. 按钮/空态/错误文案写进 spec 文案表；实现逐字引用。

### 4.2 实现中（组件先行 + 竞态）

5. 组件先独立签字（如 TimelineGroups），页面只接入；页面不重造组件。
6. 前端实现时同时写 in-flight guard/请求合并；A2/A8 必须包含**程序化 0ms 双 click**，并记录请求次数。
7. 证据模板从一开始就填“契约字段实测值”，不要验收时再补。

### 4.3 验收前（冻结 build + 夹具）

8. 冻结 buildId；用隔离 `SIMO_HOME` 构造 3 级链 + 空父 + 归档父 + 重复 id + 足够消息的滚动夹具。
9. 413 若无法造 >50000 实体库，必须在 evidence 标“mock”，并由验收 Agent 签字豁免；403 同理，不允许默认 P2。
10. 验收记录逐条对照 A1–A10；A2/A5/A6/A8 必须带字段值/请求次数/测量值，不只截图。
11. 部署前再做一次真实入口 smoke；未部署必须写进结论（FE-007 当前就是“已签未部署”）。

---

## 5. 结论与遗留

### 5.1 结论

- **FE-007 功能/视觉试点：通过（带 P2 遗留）**
  - 依据：签字 build `mwdnshfe-yu2wp`；A1–A10 在隔离夹具通过（acceptance 第 423–442 行）；状态表记“视觉+功能签字通过”（STATUS 第 37 行）。
  - 范围：隔离夹具 + mock 错误；**未部署**；413 为 mock；403 未造出；3 级为本次上限。
  - **但 live 截图是 2 级 42 条**（`fe007-live-*`），不是 3 级 45 条；live 与验收夹具不能混为一谈（§2.6）。

- **SDD 流程试点：部分通过**
  - 成立：spec/AC 可映射、组件先行、独立验收预检拒绝未实现签字、证据可复核；`check-sdd` 已 **exit 0**（§1.6）。
  - 未闭环：接口/前端接入顺序、契约字段证据、413/403 可造性、同帧双 click、文案一致性、live/夹具档位、spec 状态与 evidence 收口（§2）。
  - 因此：**不能把 FE-007 的“签过”+ `check-sdd` 绿当成流程已成熟**；需要按 §3 改模板/技能后再跑下一个试点。

### 5.2 遗留项

| # | 遗留 | 现状/证据 | 建议 owner | 关闭条件 |
|---|---|---|---|---|
| R1 | 未部署 | 签字记录与 STATUS 均写“未部署”（acceptance 第 425 行；STATUS 第 37 行） | Lead | 真实入口部署 + smoke |
| R2 | 413 仅 mock | acceptance 第 438、442 行 | 后端/测试 | 造 >50000 实体库或签字接受 mock |
| R3 | 403 未造出 | acceptance 第 439、442 行 | 后端/测试 | 多用户/权限夹具或后端单测 + 豁免签字 |
| R4 | 同帧双 click 2 请求 | acceptance 第 442 行 | 前端 | in-flight ref/请求合并 + A2/A8 0ms 双击断言 |
| R5 | 按钮文案“显示”vs spec“加载” | acceptance 第 431、442 行；STATUS 第 53 行 | 产品/前端 | 二选一写回 spec，AC 加精确文案断言 |
| R6 | A2 未记录 `hasMore`/`parentId` 实际值 | acceptance 第 432 行；spec 第 76、103–108 行 | 测试 | evidence 补契约字段表 |
| R7 | live 2 级 42 条 vs 夹具 3 级 45 条；4+ 级未测 | `fe007-live-*`（42，2 级）；`fe007-*` / acceptance 第 427、432–433 行（45，3 级）；acceptance 第 442 行“3 级为本次上限” | 测试 | 补 live 3 级数据或明确标注 live 仅 2 级；4 级夹具 + A3 扩测 |
| R8 | spec 状态/evidence 未收口 | `spec.md` 仍写“未实现”；同目录无 `evidence.md`，证据在 acceptance；`check-sdd` exit 0 只证明结构 | 产品/测试 | 更新 spec 状态；补 evidence 或显式链接；收口后重跑 check-sdd |

---

## 6. 证据索引

- Spec：[`specs/FE-007-ancestor-messages/spec.md`](../../specs/FE-007-ancestor-messages/spec.md)（§5.1 第 72–83 行、§5.2 第 103–113 行、§6.2 第 126–136 行、§9 第 172–183 行）
- 验收预检 / 签字：[`docs/tasks/acceptance.md`](../tasks/acceptance.md) 第 388–421 行（预检不签）、第 423–442 行（实机签字 + P2）
- 组件先行：[`docs/tasks/acceptance.md`](../tasks/acceptance.md) 第 380–386 行；[`docs/tasks/STATUS.md`](../tasks/STATUS.md) 第 36 行
- 早期接入缺口：[`frontend/review/COMPONENT-LIBRARY.md`](../../frontend/review/COMPONENT-LIBRARY.md) 第 128–132 行
- 截图档位：
  - live 2 级 42 条：`frontend/review/fe007-live-1600.png`、`fe007-live-1280.png`、`fe007-live-375.png`
  - 夹具 3 级 45 条：`frontend/review/fe007-1600.png`、`fe007-1280.png`、`fe007-1180.png`、`fe007-375.png`
- 状态/残留：[`docs/tasks/STATUS.md`](../tasks/STATUS.md) 第 37、47、53 行
- 结构门禁：`node scripts/check-sdd.mjs` 实测 **exit 0**（11 specs / 93 A / 93 已映射 / 32 components，0 fail/0 warn）；历史基线见 [`scripts/README.md`](../../scripts/README.md) 第 44–56 行
- 框架/模板/技能：[`FRAMEWORK.md`](FRAMEWORK.md) §2.2；[`SCENARIOS.md`](SCENARIOS.md) §1；[`templates/handoff-api.md`](templates/handoff-api.md)；[`templates/test-plan.md`](templates/test-plan.md)；[`templates/evidence.md`](templates/evidence.md)；[`skills/backend-contract/SKILL.md`](skills/backend-contract/SKILL.md)；[`skills/frontend-implementation/SKILL.md`](skills/frontend-implementation/SKILL.md)；[`skills/testing-strategy/SKILL.md`](skills/testing-strategy/SKILL.md)

> 本文只做复盘，不改代码、不改上述框架/模板/技能文件；§3 是待办清单，需由各自 owner 落文件。
