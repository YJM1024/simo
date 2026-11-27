# 框架 v2 文书削减方案

批次 FW-CUT-20261127。删除一律移入 `E:\dsh_home\trash\pending-delete\fw-cut-20261127\` 并保留原路径；本页只列删什么、并到哪、为什么、影响哪些门禁。

## 一 结构与文件削减
1. **变更包六件并两件**：保留 `specs/changes/CHG-FW-002/proposal.md`（需求点、改前改后、为什么、怎么验、怎么回滚、任务卡、证据索引、收口、状态流转）与 `evidence.md`；`change.md`、`tasks.md`、`spec.md`、`LINKAGE.md`、`closure.md` 并入 proposal 对应小节后移入隔离目录。理由是同一条事实只有一个落点，门禁读 proposal 就能判完整。门禁影响：`check-gates` 的 MX-G-08 至 MX-G-13、`check-points`、`check-mapping` 改为 proposal 兜底，检查项不减少。
2. **验收报告压一页**：`ACCEPT.md` 只留结论、签字、红项、证据指针四块，60 行以内；原 402 行十一节版移入隔离目录。理由是复验数字与结论各只有一处，历史轮次不淹没红项。门禁影响：无脚本读 ACCEPT.md。
3. **解冻记录按批次**：`JOURNAL.md` 只记冻结、批次解冻、发布三类事件，一个批次一条；原 6 条逐次解冻记录移入隔离目录另存。理由是解冻以批次为单位，日志不与单次改动一一对应。门禁影响：无脚本读 JOURNAL.md。
4. **采集表合并**：`sources/` 七份合成 `SOURCES-RAW.md`，`SOURCES.md` 与 `RESEARCH.md` 保留原内容并改指针；七份原表移入隔离目录。理由是 RESEARCH 里约 200 处引用指向同一合订本，分节序号不变。门禁影响：无脚本读 `sources/`。
5. **设计与实施合并**：`IMPLEMENT.md` 全文并入 `DESIGN.md` 的「怎么实施」节（原第 N 行对应新第 N+372 行），原文件移入隔离目录。理由是两份方案只留一份，节号与行号映射保留可查。门禁影响：`check-docs` 只数总册规则标题，不受影响。
6. **规则字段六改四**：总册 158 条改为规则、判据、执行、依据四个字段，层级与适用并入执行行；`scripts/check-rule-fields.mjs` 同步改解析、自检与旧字段残留检查。理由是层级与适用可从执行行直接读出，字段少一档而判定不降。门禁影响：仍须 158 条、0 error、coverage 100%，自检 17 条断言。
7. **域规则去重**：四份 `domains/*.md` 与总册重复的 134 条删除，244 降到 110；逐条覆盖关系见下节。理由是域文件只留总册没覆盖的命令、字段、阈值与错误码。门禁影响：`check-matrix-coverage` 仍须 66/66，域内 script 28 条与 ai-review 82 条同文件头一致。
8. **指针收口**：新建 `docs/framework/v2/README.md` 记去向；`docs/framework/README.md` 的 v2 说明、`MOXIAN.md` 头部实施行、附录 A 至 D 与两份 ROLLBACK 的引用改指 `DESIGN.md` 的「怎么实施」节。理由是删掉的文件都有唯一去向，不留断链。门禁影响：`check-docs` 的版本与节数检查保持 11 项。
## 二 域规则删除清单
格式为「被覆盖的总册条 ← 删除的域条」。删除理由是这些条目只重述总册已写的职责、范围、流程或判据，本身不带新命令、字段、阈值或错误码；具体理由逐条留在 `.tmp/fw-paperwork-cut/domain-cut-<域>.json`，复核时可直接读。

- MXV2-1-01 ← MXV2-BE-02
- MXV2-2-01 ← MXV2-PD-18
- MXV2-2-04 ← MXV2-PD-27
- MXV2-2-05 ← MXV2-PD-19
- MXV2-2-09 ← MXV2-PD-33
- MXV2-2-11 ← MXV2-PD-34
- MXV2-2-13 ← MXV2-PD-17
- MXV2-3-01 ← MXV2-PD-12
- MXV2-3-02 ← MXV2-BE-67、MXV2-FE-03
- MXV2-3-08 ← MXV2-FE-11
- MXV2-3-09 ← MXV2-PD-03
- MXV2-4-02 ← MXV2-PD-04
- MXV2-4-04 ← MXV2-BE-04
- MXV2-4-06 ← MXV2-PD-06
- MXV2-4-07 ← MXV2-PD-07
- MXV2-4-10 ← MXV2-PD-11
- MXV2-4-18 ← MXV2-QA-20
- MXV2-4-20 ← MXV2-QA-57
- MXV2-4-21 ← MXV2-BE-23
- MXV2-4-23 ← MXV2-FE-61
- MXV2-4-24 ← MXV2-BE-25、MXV2-BE-27
- MXV2-5-02 ← MXV2-PD-05
- MXV2-5-07 ← MXV2-QA-38、MXV2-QA-42
- MXV2-5-08 ← MXV2-QA-39
- MXV2-5-09 ← MXV2-FE-05、MXV2-PD-41
- MXV2-5-11 ← MXV2-BE-66、MXV2-FE-02、MXV2-PD-02
- MXV2-5-12 ← MXV2-BE-01、MXV2-BE-05、MXV2-PD-01
- MXV2-5-16 ← MXV2-FE-10
- MXV2-5-17 ← MXV2-BE-08、MXV2-BE-12、MXV2-BE-15、MXV2-BE-28、MXV2-BE-33、MXV2-BE-51、MXV2-FE-27、MXV2-FE-53、MXV2-PD-37
- MXV2-5-18 ← MXV2-FE-54
- MXV2-6-01 ← MXV2-QA-02
- MXV2-6-04 ← MXV2-PD-14
- MXV2-6-05 ← MXV2-BE-03、MXV2-PD-20、MXV2-PD-21、MXV2-PD-44、MXV2-PD-45、MXV2-PD-47、MXV2-PD-48、MXV2-PD-51
- MXV2-6-06 ← MXV2-PD-32
- MXV2-6-07 ← MXV2-QA-04
- MXV2-6-15 ← MXV2-QA-40
- MXV2-6-16 ← MXV2-PD-31
- MXV2-7-01 ← MXV2-BE-58、MXV2-PD-30、MXV2-QA-12
- MXV2-7-02 ← MXV2-PD-16、MXV2-PD-28、MXV2-PD-29、MXV2-QA-13
- MXV2-7-03 ← MXV2-BE-22、MXV2-FE-37、MXV2-QA-09
- MXV2-7-05 ← MXV2-BE-30、MXV2-BE-59、MXV2-BE-60、MXV2-BE-61、MXV2-PD-25、MXV2-PD-26、MXV2-QA-14、MXV2-QA-17
- MXV2-7-06 ← MXV2-FE-22、MXV2-FE-23、MXV2-FE-32、MXV2-QA-18
- MXV2-7-07 ← MXV2-BE-06、MXV2-BE-13、MXV2-BE-46、MXV2-QA-19
- MXV2-7-08 ← MXV2-FE-55、MXV2-FE-56
- MXV2-7-09 ← MXV2-BE-63、MXV2-FE-58、MXV2-QA-55
- MXV2-7-10 ← MXV2-QA-56
- MXV2-7-11 ← MXV2-FE-30
- MXV2-7-13 ← MXV2-QA-34、MXV2-QA-36、MXV2-QA-37
- MXV2-7-14 ← MXV2-FE-39、MXV2-FE-41、MXV2-FE-42、MXV2-FE-44、MXV2-FE-45、MXV2-FE-46、MXV2-FE-47、MXV2-FE-49、MXV2-FE-59、MXV2-QA-44、MXV2-QA-45、MXV2-QA-58
- MXV2-7-15 ← MXV2-FE-29
- MXV2-7-17 ← MXV2-BE-53、MXV2-BE-54、MXV2-BE-55、MXV2-BE-56、MXV2-FE-51、MXV2-FE-52、MXV2-QA-46、MXV2-QA-47、MXV2-QA-48
- MXV2-7-20 ← MXV2-BE-35
- MXV2-7-21 ← MXV2-BE-38、MXV2-BE-39、MXV2-BE-40、MXV2-BE-41、MXV2-BE-42
- MXV2-7-22 ← MXV2-QA-59
- MXV2-8-01 ← MXV2-QA-06
- MXV2-8-03 ← MXV2-BE-65、MXV2-FE-20
- MXV2-8-05 ← MXV2-PD-55、MXV2-PD-56、MXV2-QA-08
- MXV2-8-06 ← MXV2-QA-05
- MXV2-8-10 ← MXV2-QA-11
- MXV2-8-11 ← MXV2-FE-57
## 三 门禁、证据与格式体检
- 结构门：MX-G-08 至 MX-G-13 的输入由 `spec.md`、`tasks.md` 改为 `proposal.md`；`MX-G-09` 至 `MX-G-13` 五道格式类判断只在 `--stage pre-commit` 跑，`--stage exit` 不判格式。出口基线：结构检查 21 项、0 error、67 warning；pre-commit：126 项、0 error、31 warning。`check-docs` 仍数 158 条，`check-rule-fields` 仍判 158/0/100%，`check-matrix-coverage` 仍须 66/66。
- 证据：`check-gates --stage exit --json > .out/evidence/gates.json`、`check-rule-fields --json > .out/evidence/rule-fields.json`、`check-contract-coverage.mjs` 写 `.out/evidence/contract-coverage.json`；`evidence.md` 只留结论与路径，断言数、耗时、退出码一律读 JSON。
- 格式体检：`node scripts/check-format.mjs` 一次列出字段位置、节名、列名、编号顺序、旧字段残留这类问题，写 `.out/evidence/format-health.json`；只作提交前一次性体检，不作为验收打回理由。
