# 框架 v2 变更日志

按时间倒序排列，新记录写在上方。这个文件只记三类事件：冻结、批次解冻、发布；同一批次的多处改动合并成一条，不再一次改动记一条。时间取本机时区（Asia/Shanghai）。

## 2026-11-27 15:10 批次解冻

动作：批次解冻并再冻结。一个批次覆盖本轮文书削减的全部改动：`docs/framework/MOXIAN.md` 的 158 条规则由六字段改为四字段，`层级` 与 `适用` 并入 `执行` 行内；`docs/framework/domains/` 四份由 244 条去重到 110 条；`docs/framework/v2/DESIGN.md` 并入原 `IMPLEMENT.md` 的施工内容；`docs/framework/v2/sources/` 七份合订为 `SOURCES-RAW.md`；`specs/changes/CHG-FW-002/` 由七件收为 `proposal.md`、`evidence.md`、`test-plan.md` 三件；`docs/framework/v2/ACCEPT.md` 收为一页四块；`docs/framework/v2/README.md` 与 `CUT-PLAN.md` 新建；`scripts/check-rule-fields.mjs`、`check-gates.mjs`、`check-points.mjs`、`check-mapping.mjs`、`check-archive.mjs` 配套改写，新增 `check-contract-coverage.mjs` 与 `check-format.mjs`；`evidence.md` 只留结论与路径，断言数、耗时、退出码改由 `.out/evidence/gates.json`、`rule-fields.json`、`contract-coverage.json`、`format-health.json` 提供。

依据：需求方 2026-11-27 的文书削减指令八条与四项补充要求（同一意思只写一遍、格式类核对合并为一条机械检查且不作失败理由、证据只留指针由脚本产数、契约错误码与状态迁移补覆盖检查）；表 2-4 解冻行的前置条件「范围或判据变化，需求方确认」。

变更号：`CHG-FW-002`。

改法：总册四字段格式为 `规则`、`判据`、`执行`、`依据`，执行行写成 `<原执行>；层级 Lx；适用 <时点>`；规则脚本按四字段解析，旧 `- 层级：`、`- 适用：` 行报 `MXV2-6-11` 残留。`check-gates.mjs` 的 `readPackage` 在缺 `spec.md` 时改读 `proposal.md`，`MX-G-08` 接受两件式变更包；`MX-G-09` 的状态按 `MXV2-2-11` 只认四值，旧七值降为告警。`check-points.mjs`、`check-mapping.mjs` 用 `proposal.md` 补齐并入的契约、任务与点链表；`check-archive.mjs` 在无 `closure.md` 时从 `proposal.md` 的「收口」节取关闭字段表与六条件表继续审。

再冻结校验：`check-rule-fields.mjs` 得 `158 rules, 0 error, 2 notice, coverage 100%`、`PASS (checks: 807)`，退出码 0；`check-gates.mjs --stage exit` 得 `PASS`，0 error / 67 warning、结构检查 21 项，退出码 0；`check-gates.mjs --stage pre-commit` 得 `PASS`，0 error / 31 warning、结构检查 126 项，退出码 0；`check-points.mjs` 得 `0 issue(s), 2 notice`、`PASS (checks: 43)`，退出码 0；`check-mapping.mjs` 得 `1 package(s), 0 issue(s), 2 notice`、`PASS (checks: 24)`，退出码 0；`check-docs.mjs` 得 `v2.0.0, 0 issue(s), 1 notice`、`PASS (checks: 11)`，退出码 0；`check-archive.mjs` 得 `12/12 files verified`、`PASS (checks: 45)`，退出码 0；`check-format.mjs` 得 `格式体检：0 项`，退出码 0；`check-contract-coverage.mjs` 得错误码 11/11、状态迁移 11/11、缺 0，退出码 0。

sha256：改动后总册整卷 `4ae85d402b7c340c95685fcb560a9dd87dae3077fc851636da2afd7ddacf8280`（162590 字节，LF 换行，无 BOM，2026-11-27 15:06 采集）；`DESIGN.md` 整卷 `d553a06031049cc4bde4c5ece86640bc1996cdf9a637364181ffcb20c8b4384f`（131233 字节，同日采集）。

签字：Lead（需求方授权代签，授权日期 2026-11-27）。

偏差：`check-gates` 出口告警现为 67 条（格式类移出前为 98 条，其中结构类 31 条转到 `pre-commit` 阶段：旧七值 18 条、模板与字段类 13 条），按 `MXV2-2-11` 如实提示，没有降级成静默，功能与契约类检查的严重度未动。旧 `ACCEPT.md` 的 402 行版本按镜像副本 `moxian-framework/docs/framework/v2/ACCEPT.md` 还原后移入隔离目录，与本轮覆盖的版本可能差一次修订，已在 `docs/framework/v2/README.md` 注明。原逐次解冻的四条记录、两次冻结记录与旧 `JOURNAL.md` 全文本已移入 `E:\dsh_home\trash\pending-delete\fw-cut-20261127\docs\framework\v2\JOURNAL.md`。

## 2026-11-27 03:56 冻结

动作：设计方案与实现方案冻结。`docs/framework/v2/DESIGN.md` 于 03:44 由 `草稿` 改为 `已冻结`，写入冻结日期、冻结人与 sha256；`docs/framework/v2/IMPLEMENT.md` 于 03:56 由 `草稿` 改为 `已冻结`，补冻结四行并把待定项写定为裁决。

依据：需求方 2026-11-27 授权，Lead 代签；六项待定与一处合计冲突按需求方裁决写定。

变更号：`CHG-FW-002`。

偏差：冻结时回滚包三件与 R1、R2 两轮验收未完成，按需求方授权先行冻结，两轮验收与回滚演练随后另办；逐条原文见已移入隔离目录的旧日志。
