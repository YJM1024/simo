# CHG-CONV-006 · 会话域收口：提案

状态：**draft**（2026-11-21；产品口径已按“默认裁决”写入，待用户 spec review）
Implements: `PRD-CONV-001`–`PRD-CONV-008`、`PRD-SYNC-001`–`PRD-SYNC-004`（共 12 个；`PRD-SYNC-005` 明确排除）
Domains: `CONV` / `SYNC`
Owner：产品（proposal / product / tasks 的口径与验收定义）；实现按角色拆卡，见 [tasks.md](tasks.md)。
design.md：**待建**（W3 由设计 owner 补；不以空文件充数）。

## 1. 为什么做

用户提出的“第一个需求”是：**把会话域所有功能实现完，并把长期 Spec 五列补齐**。它不是一个新功能，而是把已有实现从“代码在跑”收口成“产品可验收”。

现状（2026-11-21，[CONV-DISCOVERY.md](../../../docs/plan/CONV-DISCOVERY.md)）：

- 12 个 PRD 覆盖 **0 covered / 11 partial / 1 gap**，全部有实现但没有任何一条 PRD 六类产物齐全且 AC 证据闭环。
- 六类产物缺口：前端开发 spec 缺 11/12、后端开发 spec 缺 9/12、5 个 COMP 签收 0/5、任务卡缺 1/12、执行证据缺 3/12。
- `8787` 上现跑的是 `backend/simo-live-final4.exe`（2026-11-21 02:26 构建），早于当天 13:00 后的前端修复，**不能用它做验收**。
- 过往 5 个包（CHG-CONV-001–005）按角色各写一文件，结果“实现有、证据无”，且 CHG-CONV-005 整体 blocked。本包把 12 个 PRD 的收口放进**一个**包，统一证据口径与出口判定。

**两处必须纠偏的事实**（核过代码，旧盘点/旧 spec 有误）：

1. **删除会话后端未开放**：`backend/internal/modules/sessions/http.go:68-70` 的 `handleDelete` 固定返回 `403 {"code":"R4_CONFIRM_REQUIRED"}`；`p1_conv_sessions_http_test.go:355` 断言 DELETE 403，`m20_test.go:47-50` 只是 action 层 `session.delete` 的 403。这是**保护性占位**，不是“待补功能”；用户已裁决删除为**显式非目标 / backlog**（`REQ-CONV-002-03`），本包不补后端删除、不做确认机制/级联。
2. **主会话归档守卫已存在**：`sessions/spec.go:297-301` 的 `Archive` 已拒绝 `main`，`http.go:334-345` 输出 409 `main_session_protected`；`m81_all_messages_test.go:85` 已断言 409，但 `App.conversation.test.tsx:107-120` 仍按“归档 main 成功”的旧行为断言。P6 是**把既有守卫写成 AC 并改前端旧测试断言**，不是新增后端行为。

## 2. 做什么

1. **六条产品口径落成正式 AC**（P1–P6），见 [product.md](product.md) §3；落点见 `specs/product/P1-CONV/spec.md`。
2. **新增 `PRD-CONV-008` 右栏会话投影**（P1），把页面上已有、却无 PRD/AC 的右栏三组投影收进产品域。
3. **12 个 PRD 逐条补六类产物 + 可复现证据**，目标 `covered`；`SYNC-005` 保持 `gap`。
4. **补齐长期 Spec 五列**：`specs/product|design|frontend|backend|test/<域>/spec.md`，按功能点 ID 分节；产品列由本包改 `P1-CONV/spec.md`，其余四列由对应 owner 新建。
5. **重建可执行文件并在 8787 真机走查**（功能 A1–A8 + 视觉三档），证据落 `docs/testing/`。
6. 同步 `TREE`、`TRACEABILITY`、`CONV-CLOSURE`、`SPEC-GAP`、`MASTER-PLAN` 的执行态，并完成 5 个 COMP 的签收或降级记录。

## 3. 不做什么

- **不做 SYNC-005**（远程访问/通知中心）：保持 `unimplemented` + `gap`；通知中心另立项。
- **不再把未读当纯前端内存态**：改为会话级持久化读游标（进入即已读、刷新/重启保留、多标签共享）；新增后端读游标表/接口，不做全站数字与通知中心。
- **不做全局正文搜索**：进 backlog；消息搜索降为 P2，仍可用但不计入 P1 验收。
- **pin 不做后端改造**：pin UI 本轮交付（`AC-CONV-001-04`）；后端 `pin/unpin` 与排序已存在，本包只接 UI 与测试，不改接口/数据。
- 不新增域、不重命名 PRD、不改 P2–P10 任何 spec。
- 不改已发布 AC 的编号含义；新增 AC 一律追加编号，不重排。
- 本角色不写代码、不改前后端、不 commit。

## 4. 范围与出口

**验收面 12 个**：`CONV-001/002/003/004/005/006/007/008` + `SYNC-001/002/003/004`。
**排除 1 个**：`SYNC-005`（文档保持一致标注，不计 covered）。

完成定义（DoD）：

1. 12 个 PRD 全部 `covered`：每一条 AC 有可复现证据；六类产物（产品/设计/前端/后端/组件或 N/A/任务卡/test-plan/执行证据）齐全；缺证据只能写 `missing`。
2. 五列长期 Spec 均存在，文件内按功能点 ID 分节；`check-sdd.mjs` / `check-trace.mjs` 通过。
3. 8787 用**当轮重建**的 exe 走查：`A1–A8` 逐条、三档视口、413/403 真机（不再只 mock）。
4. `SYNC-005` 在 TREE/spec/TRACEABILITY 中一致标 `gap`，且不影响 12 个 covered 的判定。
5. 5 个 COMP 全部签收，或明确降级为“实现偏离 spec 并登记回写”。

## 5. 里程碑（详见 tasks.md）

| 波次 | 目标 | 出口 |
|---|---|---|
| W1 | 产品口径与长期 Spec 骨架 | 六条口径 + 两条隐性要求成为 AC；五列目录/分节模板定稿 |
| W2 | 证据补口与 COMP 签收 | 新 AC 全部映射用例；前端/后端/组件证据可复现 |
| W3 | 设计/前端/后端三列 Spec | 三列文件按功能点分节，与实现对齐 |
| W4 | 行为变更实现 | 主会话不可归档、标题搜索 UI、持久化读游标、右栏 008 证据；删除/子会话移动不纳入 |
| W5 | 部署验证与覆盖回写 | 8787 重建+走查；12 covered；TREE/TRACEABILITY/CLOSURE 回写 |

## 6. 风险

1. **主会话不可归档是既有守卫**：产品只把 `spec.go:297-301` 的既有拒绝升为 AC，前端补菜单禁用；旧断言仅 `App.conversation.test.tsx:107-120` 需改，`m81_all_messages_test.go:85` 已是 409。改测试是修正旧口径，不是“让测试通过”。
2. **删除/移动为显式非目标**：本包不投入删除 UI/确认令牌/级联，也不做子会话移动；`DELETE` 固定 403 是保护性占位。后续若要做，必须新开 CHG 定义确认令牌、级联、迁移与回滚；不得把非目标误读为“待补功能”。
3. **设计列无既有素材**：五列里的设计列此前为空，W3 若只写空泛原则会变成文档空转；出口要求“按功能点分节 + 可对照实现”。
4. **8787 无鉴权**：只能本机走查，不能外推为“可远程验收”；远程访问仍属 SYNC-005。
5. **COMP 签收跨 owner**：component spec 与实现漂移（message-colors 等），签收可能要求改 COMP spec，超出前端单人 scope。

## 7. 决策记录（默认裁决，用户可在 spec review 推翻）

| # | 裁决 | 落点 |
|---|---|---|
| P1 | 会话搜索 = **标题搜索**（`GET /api/sessions?q=`，跨全部会话含子会话）；消息搜索降 P2；全局正文进 backlog | `AC-CONV-003-03` |
| P2 | 未读 = **会话级持久化读游标**；进入即已读；刷新/重启保留；多标签共享；不做全站数字；通知中心另立项 | `AC-SYNC-004-01..03` |
| P3 | 删除会话 = **显式非目标 / backlog**（`REQ-CONV-002-03`）；本阶段只保留归档；DELETE 固定 403 为保护性占位，不做确认令牌/级联 | §2.1 非目标 + backlog |
| P4 | pin 入口进 UI（本轮验收面；主会话、草稿、归档不提供，排序以后端返回为准） | `AC-CONV-001-04`（本轮实现） |
| P5 | 右栏“会话投影”新增 **`PRD-CONV-008`**，P1 | spec §4.5 |
| P6 | 主会话不可归档升 `AC-CONV-001-03`；消息纯度升 `AC-CONV-004-03` | spec §4.1 / §4.2 |

推翻成本：P1/P2 改 AC 与前端实现方向；P3 删除/移动为显式非目标，若推翻须新开 CHG（含确认令牌/级联/迁移）；P5 撤 PRD 需同步 TREE/TRACEABILITY；P6 回退意味着保留“主会话可归档”的旧测试断言并删除两条新 AC。

## 8. 回滚

本轮只有文档，无代码回滚；按文件 revert 即可。W4/W5 的实现回滚见 tasks.md 对应卡的“回滚”行。
