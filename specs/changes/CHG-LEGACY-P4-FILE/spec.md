# SPEC · CHG-LEGACY-P4-FILE

Covers: AC-P4-01、AC-P4-02、AC-P4-03、AC-P4-04、AC-P4-05、AC-P4-06（本包 §3 的两段式历史 AC 编号，早于三段式命名规范）

Implements: PRD-FILE-001, PRD-FILE-005, PRD-FILE-002, PRD-FILE-003, PRD-FILE-004, PRD-FILE-006

- 状态：已关闭（2026-11-20 归档，historical / partial 为历史迁移值，不代表产品完成）
- Owner：product + frontend + backend
- 日期：2026-11-20
- 产品依据：`specs/product/P4-FILE/spec.md`
- 实现状态：1 个已实现（FILE-003）、5 个部分实现（FILE-001/002/004/005/006）、0 个未实现
- 追溯状态：**0 covered / 2 partial / 4 gap**（按 `docs/product/TRACEABILITY.md` 当前实际；审计建议 0/5/1 与 TRACE 不一致，未按建议数改写，待统一口径）
- 追溯：6 个 PRD 均有本 CHANGE 包，但六类产物与完整 AC 证据未闭环
Change：CHG-LEGACY-P4-FILE
变更类型：纯文档（历史归档补登，不改实现与产品 AC）
判级：变更级
关闭日期：N/A：历史归档包无独立关闭动作，归档日为 2026-11-20
## 1. 目标

把 P4 文件与交付物 的已存在的实现、接口、组件与执行证据固化为可追溯的 CHANGE 包，并把未实现/未验证项明确留在缺口，而不是用汇总测试数替代逐 PRD 验收。

## 2. 需求与状态

| ID | 需求（产品 spec） | 实现事实 | 实现状态 | 主要证据 |
|---|---|---|---|---|
| PRD-FILE-001 | 会话文件聚合列表 | 有 artifacts/deliverables/files 路由与会话聚合，但前端列表聚合与分页未验收。 | 部分 | RightPanel 6/6 展示部分；无列表聚合专项测试。 |
| PRD-FILE-005 | 工作区目录输出隔离 | 交付物写入工作区/SIMO_HOME 相关目录，隔离与越界未形成验收。 | 部分 | 无隔离/越界执行证据。 |
| PRD-FILE-002 | 上传附件 | 存在 POST /api/uploads 与附件处理，但前端上传入口与失败/大小限制未验收。 | 部分 | 无上传执行证据。 |
| PRD-FILE-003 | 交付物卡片列表 | 右栏/工作台展示交付物卡片，E2E 可见并触发下载。 | 已实现 | RightPanel 6/6；E2E 07。 |
| PRD-FILE-004 | 预览与下载 | 真实下载已验证；预览（PDF/图片/Office）未执行。 | 部分 | E2E 07 下载；预览 missing。 |
| PRD-FILE-006 | 文件生成 PDF/Office/图片 | 有 filegen/embed_office 与生成路径，但格式/失败/隔离未全面验收。 | 部分 | 无生成格式矩阵执行证据。 |

## 3. 验收标准（本包）

| AC | 断言 | 结果 | 证据 |
|---|---|---|---|
| AC-P4-01 | 会话交付物/文件列表显示名称、类型、状态并可打开。 | PASS（展示级） | TC-P4-003；RightPanel 6/6；E2E 07。 |
| AC-P4-02 | 交付物真实下载成功且内容非空。 | PASS（E2E 主路径） | TC-P4-004；E2E 07。 |
| AC-P4-03 | 上传附件有大小/类型/失败反馈，并可被会话引用。 | MISSING | TC-P4-002；无执行证据。 |
| AC-P4-04 | 预览 PDF/图片/Office 不越界、不执行脚本，失败可恢复。 | MISSING | TC-P4-004；预览未测。 |
| AC-P4-05 | 工作区输出隔离，跨会话/跨目录不可读取。 | MISSING | TC-P4-005；无执行证据。 |
| AC-P4-06 | PDF/Office/图片生成格式与失败路径可验证。 | MISSING | TC-P4-006；无执行证据。 |

> 说明：结果 `PASS（…级）` 只表示该断言的已有测试/证据通过，不等于该 PRD 的所有产品 AC 通过；`MISSING` 表示没有执行证据或未实现。

## 4. 状态、错误与边界

- 本包状态固定为 `historical / partial`，不写 `implemented`/`covered`。
- 成功响应与错误格式沿用既有后端契约；未逐路由验证 400/403/404/500 的矩阵。
- 所有前端测试使用隔离 fixture/mock；E2E 使用隔离 API/临时 home，不是 8787 生产实例。
- 所有后端测试使用临时 `SIMO_HOME`/SQLite；未接触正式数据。
- 未验证项、未实现项在 `evidence.md` 与 `test-plan.md` 中保留 `missing`，不补写“通过”。

## 5. 接口与数据（归档）

主要接口见 [backend.md](backend.md)；前端组件见 [frontend.md](frontend.md)。本包不新增接口、表或迁移。

## 6. 待确认

- 缺失 PRD 是否进入下一条实现型 CHG，由 backlog 优先级决定。
- 现有 domain test-plan 的用例级 pass 是否足以支持某个 AC 升级，需要独立验收，不由本包自签。
- 产品 AC 与工程测试的映射仍需逐项复核；本包只提供基线。

## 7. 链接

- [proposal.md](proposal.md)
- [backend.md](backend.md)
- [frontend.md](frontend.md)
- [tasks.md](tasks.md)
- [test-plan.md](test-plan.md)
- [evidence.md](evidence.md)
- 域测试计划：[P4-FILE test-plan](../../test/P4-FILE/test-plan.md)
- 全量前端证据：[`docs/testing/EVIDENCE-20261120.md`](../../../docs/testing/EVIDENCE-20261120.md)

## 非目标

本包是历史归档，只登记既有事实：不新增能力、不改实现与数据、不把未验证项写成已完成；未覆盖的断言保持 `missing`，后续承接见对应的 `CHG-CONV-*` 收口包。

## 五列契约索引

| 契约 | 定义 | 实现 | 测试 | 证据 |
|---|---|---|---|---|
| 行为契约 | `spec.md` 的验收与错误边界 | 见 `backend.md` / `frontend.md` | `test-plan.md` 映射表 | `evidence.md` AC 证据表 |
| 交付边界 | `proposal.md` 的范围与非目标 | — | — | `spec.md` 非目标节 |

## 状态流转记录

- 2026-11-20：建立本包并首次登记状态。
- 2026-11-20：按门禁要求补齐首部字段、模板节与证据列，状态词按七值口径登记；内容口径不变。

## 收口

已归档：本包是历史归档包，不再接受变更；产品能力仍按域 spec 的 `covered/partial/gap` 统计，归档不表示完成。

## 风险与依赖

依赖：无新增外部依赖；证据来自本包 `test-plan.md` 与 `evidence.md` 引用的既有报告。
- 风险：历史证据为引用而非本轮重跑，未验证项按 `missing` 记，不据此宣称通过。
