# 验收报告 · 框架 v2.0.0

验收结论：整包 pass（R6，2026-11-27）。范围为框架 v2.0.0 的文档与门禁，不含产品代码红项与用户对前端效果的验收。

## 结论

| 轮次 | 结论 | 说明 |
|---|---|---|
| R1 至 R4 | pass | 单条与整线复验，RC-01 至 RC-16 全部关闭 |
| R5 | partial | 发现 `AC-CONV-005-02` 厂商接口不可达、证据表列缺失等 4 项，转 R6 复核 |
| R6 | pass | 复核 4 项已修；框架文档与门禁无红项 |

未验证项：用户对前端效果的验收未做；产品代码红项不属本包范围，见下节。

## 签字

| 项 | 值 |
|---|---|
| 签字人 | 独立验收方 `v2-accept`（未参与撰写） |
| 签字日期 | 2026-11-27 |
| 签字范围 | `docs/framework/v2/` 文档、`docs/framework/` 总册与四份域文件、门禁脚本与自检 |
| 用户签字 | 未签；前端效果由用户验收，不在本报告范围 |

## 红项

框架文档与门禁：无红项。

产品代码红项（不属本包，登记备查）：`node scripts/verify-all.mjs` 仍 exit 1，原因是后端任务域 9 条测试与前端 `RightPanelRail.cdp.test.tsx:321` 失败，属 P2 产品功能，随后续变更处理。

非阻断项：`check-visual-baseline` 在无基线时记 N/A；关闭记录并入 `proposal.md` 的「收口」节后由 `check-archive` 读该节继续审（P3 待办转为按两件式复核）；`check-rule-fields` 有 2 条 notice（附录 C、D 本体未发布）；`check-gates` 的 18 条旧七值状态告警来自历史包，按 `MXV2-2-11` 如实提示；格式类问题统一由 `check-format.mjs` 一次性列出，只作提交前体检，不反复打回。

## 证据指针

| 证据 | 命令 | 结果 |
|---|---|---|
| 总门禁 | `node scripts/check-gates.mjs --stage exit` | PASS，0 error，67 warnings（结构检查 21 项，格式类已移出） |
| 提交前格式 | `node scripts/check-gates.mjs --stage pre-commit` | PASS，0 error，31 warnings（结构检查 126 项） |
| 规则字段 | `node scripts/check-rule-fields.mjs` | 158 rules、0 error、2 notice、coverage 100%（checks 807） |
| 变更包 | `node scripts/check-points.mjs` | 0 issue、2 notice（checks 43） |
| 映射 | `node scripts/check-mapping.mjs` | 1 package、0 issue、2 notice（checks 24） |
| 文档 | `node scripts/check-docs.mjs` | v2.0.0、0 issue、1 notice（checks 11） |
| 格式体检 | `node scripts/check-format.mjs` | 0 项（仅提交前体检，不作为打回理由） |
| 契约覆盖 | `node scripts/check-contract-coverage.mjs` | 错误码 11/11、状态迁移 11/11，缺 0 |
| 自检汇总 | 各脚本 `--self-test` | trace 22、fp-coverage 49、points 14、mapping 18、archive 10 断言 |
| 归档 | `node scripts/check-archive.mjs --archive docs/framework/archive/v1.7.5` | 12/12 files verified |

以上数字取 R6 复核时实测；本轮文书削减后的复跑结果以 `JOURNAL.md` 与 `evidence.md` 记录的数为准，两者不一致时以脚本当次输出为准。
