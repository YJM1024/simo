# 框架 v2 变更日志

按时间倒序排列，新记录写在上方，一条一段。时间取本机时区（Asia/Shanghai）。本文件随 `DESIGN.md` 冻结建立，记录冻结、解冻与冻结后改动。

## 2026-11-27 14:05

动作：解冻并再冻结。范围为 `docs/framework/MOXIAN.md` 的两处执行字段与 `docs/framework/GATES.md` 的统计口径：`MXV2-8-04` 由 `script:` 改为 `ai-review:` 四要素（谁判验收员，判据取原「判据」字段）；矩阵五条（`MXV2-4-03`、`5-01`、`5-03`、`5-04`、`8-15`）说明中的「55/66」与「11 格缺 accept 模板」改为「66/66」与「accept 模板已建（矩阵内容齐备）」；`GATES.md` 的统计句与表 1-1、1-2 由 46 与 112 改为 45 与 113。规则陈述、判据、层级、依据、适用五项与其余规则未动。
依据：表 2-4 解冻行的前置条件「范围或判据变化，需求方确认」；第四轮验收 RC-13、RC-14 指出矩阵与统计过期，RC-16 指出 `MXV2-8-04` 的 `--rule` 单跑不可达、要求转 `ai-review:` 或让脚本真检查；第五轮验收 RC-17 指出上述改动缺解冻与再冻结登记。
变更号：`CHG-FW-002`。
改法：`MXV2-8-04` 的执行字段改为 `ai-review:` 四要素；矩阵五条说明按 `scripts/check-matrix-coverage.mjs` 的实测结果改写；`GATES.md` 的统计句与两张表按总册逐条执行字段重算为 45 与 113。
再冻结校验：`node scripts/check-rule-fields.mjs --change CHG-FW-002` 得 `158 rules, 0 error, 2 notice, coverage 100%`、`PASS (checks: 807)`，退出码 0；`node scripts/check-gates.mjs --stage exit --change CHG-FW-002` 得 `PASS`，0 error / 14 warning，退出码 0；`node scripts/check-matrix-coverage.mjs` 得 `PASS (gate: matrix, checks: 66, warnings: 2)`，退出码 0。改后总册 `script:` 45 条、`ai-review:` 113 条，合计 158 条。
sha256：改动后整卷 `fc70867041e67847a7cb039c8874bafb9cb437f5a862932611fc9337b4d0fbef`，对改动后文件整体计算（163169 字节，LF 换行，无 BOM，2026-11-27 14:05 采集）；总册头部只登记 `DESIGN.md` 与 `IMPLEMENT.md` 的冻结哈希，不登记自身哈希，故头部两行未变。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：2026-11-27 05:52 条记录的 `294e0b52…`（161889 字节）与 `script: 46 / ai-review: 112` 是当时的中间状态，已被本条取代；05:52 条正文按日志规则保持原样不改。`GATES.md` 不在 05:52 当时可写范围，05:58 授权后先改到 46 与 112，本轮随 `MXV2-8-04` 一并复核为 45 与 113。

## 2026-11-27 05:52

动作：解冻并再冻结。范围为 `docs/framework/MOXIAN.md` 中 74 条规则位的「执行」字段：74 条由 `script:` 改为 `ai-review:` 四要素形态（含 `scripts/check-matrix-coverage.mjs` 的 5 条）；`scripts/check-trace.mjs` 的 5 条在确认内部码映射后保持原 `script:` 行不变。规则陈述、判据、层级、依据、适用五项，以及其余 84 条规则、前置定义与附录均未动；与备份逐行比对，差异行恰为 74 行。
依据：表 2-4 解冻行的前置条件「范围或判据变化，需求方确认」，登记位置为本文件。本次变化属执行手段失效：验收指出 `--rule` 参数在 10 个脚本里被接受却仍跑整套，其中 7 个是批处理入口，内部检查与规则位多对多，单条规则无法隔离；需求方 2026-11-27 指令要求能收窄的实现收窄、收不了的转 `ai-review:` 并在行内注明批处理入口，由 Lead 转达。
变更号：`CHG-FW-002`。
改法：`scripts/ac-coverage.mjs`（5 条）、`scripts/check-contract.mjs`（8 条）、`scripts/check-evidence.mjs`（36 条）、`scripts/check-gates.mjs`（10 条）、`scripts/check-incremental-coverage.mjs`（3 条）、`scripts/check-spec-language.mjs`（7 条）共 69 条改为 `ai-review:`，每条带「谁判、误放行、误拦截」三键与「说明：<脚本名> 为批处理入口，不支持单跑」，判据取原规则「判据」字段首句。`scripts/check-matrix-coverage.mjs` 的 5 条（`MXV2-4-03`、`5-01`、`5-03`、`5-04`、`8-15`）同样改为 `ai-review:`，谁判架构师，说明里写明「当前实测 55/66，11 格缺 accept 模板（矩阵内容缺口）」，不把缺口藏进「不支持单跑」一句。`scripts/check-trace.mjs` 的 5 条（`MXV2-1-06`、`2-05`、`4-04`、`7-02`、`7-05`）保留 `script:`，脚本按 `GATES.md` 表 3-1 的 T1–T6 到规则位映射实现真收窄：`--rule` 只统计该规则名下的失败项与提示项，未知规则退出 2。`scripts/check-fp-coverage.mjs` 与 `scripts/probe-cdp.mjs` 各自只承载一条规则（`MXV2-7-22`、`MXV2-8-04`），整套运行即该规则全集，保持 `script:`。
再冻结校验：`node scripts/check-rule-fields.mjs --change CHG-FW-002` 得 `158 rules, 0 error, 2 notice, coverage 100%`、`PASS (checks: 808)`，退出码 0；`node scripts/check-gates.mjs --self-test` 得 39 条断言全过；`node scripts/check-trace.mjs --self-test` 得 17 条断言全过。`node scripts/check-matrix-coverage.mjs --self-test` 得 `SELF-TEST PASS`（夹具编号同步为 `MXV2-` 形态，rule-invalid 样例恢复生效）。改后总册 `script:` 46 条、`ai-review:` 112 条，合计 158 条。
sha256：改动后整卷 `294e0b525dfb5cb44f6f71474171b35cc5afcc4841faa80a57cac721880e1b13`，对改动后文件整体计算（161889 字节，LF 换行，无 BOM，2026-11-27 05:55 采集）；总册头部只登记 `DESIGN.md` 与 `IMPLEMENT.md` 的冻结哈希，不登记自身哈希，故头部两行未变。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：`docs/framework/GATES.md` 第 7、11 行仍写 script 123 条、ai-review 35 条，与本条改后的 46 与 112 不一致；该文件不在 05:52 当时的可写范围；05:58 获授权后已把统计句与表 1-1、1-2 的逐行拆分改为 46/112，`check-docs` 转 `PASS (checks: 11)`、0 issue、1 notice。上一条 2026-11-27 05:48 记录中的「117 条、41 条」与 sha256 `08380193…` 是同一次改动前的中间状态，已被本条取代，其正文按日志规则保持原样不改。

## 2026-11-27 05:48

动作：解冻并再冻结。`docs/framework/MOXIAN.md` 三条规则的执行字段先解冻改写、改写后即时再冻结，范围限于 `MXV2-7-03`、`MXV2-7-04`、`MXV2-7-15` 的「执行」字段；规则陈述、判据、层级、依据、适用五项，以及其余 155 条规则、前置定义与附录均未动。
依据：表 2-4 解冻行的前置条件「范围或判据变化，需求方确认」，记录位置写明「解冻登记与点文件状态行」，本文件是日志侧的登记位置。本次变化属执行手段失效而非判据内容变化：`scripts/check-incremental-coverage.mjs` 在改动清单为空、或覆盖率报告与映射测试记录缺失时，按设计对 PENDING 项返回退出码 2（文案「未执行检查，退出码 2（按 GATES 记待补，不记通过）」），三条规则原执行字段 `script:… --rule …` 的「期望退出码 0」在该脚本的待补语义下不可达；需求方 2026-11-27 指令要求逐条处置 22 条跑不通的命令，由 Lead 转达。
变更号：`CHG-FW-002`。
改法：三条执行字段由 `script:` 改为 `ai-review:` 四要素形态。`MXV2-7-03` 抽查最近 3 个变更包的 `test-plan.md`，核对层列、层与改动面一致、跨层拆条与每层命令可执行，谁判验收员；`MXV2-7-04` 核对第 1 节七项风险两列、双高风险错误路径用例与共享面基线读数，谁判验收员；`MXV2-7-15` 核对三类覆盖率报告、增量只计新增行、阈值在告警档与升档裁决，谁判验收员。
再冻结校验：`node scripts/check-rule-fields.mjs --change CHG-FW-002` 得 `158 rules, 0 error, 2 notice, coverage 100%`，`PASS (checks: 814)`，退出码 0；改后总册 `script:` 117 条、`ai-review:` 41 条，合计 158 条。
sha256：改动后整卷 `08380193217f887128ec52b2e7881a3cc68ab8bc1374735ecbc7af5d29401a3a`，对改动后文件整体计算（144295 字节，LF 换行，无 BOM，2026-11-27 05:48 采集）；总册头部只登记 `DESIGN.md` 与 `IMPLEMENT.md` 的冻结哈希，不登记自身哈希，故头部两行未变。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：三个规则号仍留在 `scripts/check-incremental-coverage.mjs:1757` 的 `V2_RULES` 声明里，且 `docs/framework/GATES.md` 的门禁表仍把这三条计为 script、统计行仍写 123 与 35，与改后总册的 117 与 41 不一致；脚本侧口径交 P4 统一，GATES.md 统计行不在本次可写范围，需另派或授权后修正，核实记录见 `.tmp/v2-cmd-close/per-rule.md`。

## 2026-11-27 05:20

动作：解冻并再冻结。`docs/framework/MOXIAN.md` 三条规则的执行字段先解冻改写、改写后即时再冻结，范围限于 `MXV2-5-18`、`MXV2-7-13`、`MXV2-7-17` 的「执行」字段；规则陈述、判据、层级、依据、适用五项，以及其余 155 条规则、前置定义与附录均未动。
依据：表 2-4 解冻行的前置条件「范围或判据变化，需求方确认」，记录位置写明「解冻登记与点文件状态行」，本文件是日志侧的登记位置。本次变化属执行手段失效而非判据内容变化：`scripts/measure-perf.mjs:775-783` 与 `scripts/run-ac.mjs:745-752` 收到 `--rule` 时显式拒绝并返回非 0 退出码（文案含「该脚本不支持按规则单跑」），原三条执行字段 `script:… --rule …` 永远达不到「期望退出码 0」。需求方 2026-11-27 指令要求核实并修正该误用，由 Lead 转达。
变更号：`CHG-FW-002`。
改法：三条执行字段由 `script:` 改为 `ai-review:` 四要素形态。`MXV2-5-18` 核对 EFFORT 档位、升档理由与性能受理基线六项，谁判验收员；`MXV2-7-13` 核对 `.tmp/flaky/` 三项输出、`docs/testing/flaky.md` 隔离清单五项与到期登记，谁判判定员；`MXV2-7-17` 先跑 `node scripts/measure-perf.mjs --self-test` 得 `SELF-TEST PASS`，再按固定命令实测核对十三项、p95 与 errors，谁判验收员。
再冻结校验：`node scripts/check-rule-fields.mjs --change CHG-FW-002` 得 `158 rules, 0 error, 2 notice, coverage 100%`，`PASS (checks: 815)`，退出码 0；`node scripts/check-gates.mjs --stage exit --change CHG-FW-002` 得 `PASS`，0 error / 12 warning，退出码 0。
sha256：改动后整卷 `92cebc0f0d5ccf17e65f9ece412dc4d90682b8cea2c73c2aca43561c889b3dfa`，对改动后文件整体计算（143530 字节，LF 换行，无 BOM，2026-11-27 05:17 采集）；总册头部只登记 `DESIGN.md` 与 `IMPLEMENT.md` 的冻结哈希，不登记自身哈希，故头部两行未变。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：三个规则号仍留在 `scripts/measure-perf.mjs:773` 与 `scripts/run-ac.mjs:743` 的 `RULES` 声明里，正文与脚本两边口径暂时不一致，按本次「不改脚本」的约束交 P4 统一（二选一：脚本改为接受 `--rule` 的整册口径，或从声明中删去这三个号）；核实证据与建议见 `.tmp/v2-final-fix/rule-check.md`。

## 2026-11-27 03:56

动作：实现方案冻结。`docs/framework/v2/IMPLEMENT.md` 状态由 `草稿` 改为 `已冻结`，头部增加冻结日期、裁定依据、冻结哈希与执行者四行；第 1.3 节由“待定项”改为“已定裁决”，六项按需求方 2026-11-27 裁决写定；第 4 节把“待判”并入改写，五类合计改回 285。
依据：需求方 2026-11-27 对六项待定与一处冲突的裁决，由 Lead 代签。
变更号：`CHG-FW-002`。
裁决：版本号 `v2.0.0` 写 `docs/framework/VERSION`，变更日志写 `docs/framework/v2/CHANGELOG.md`；映射表唯一事实源取附录 B，五类统计以附录 B 为准，其它位置只引用不复制；附录 D 五条 owner 为判定员、期限本变更内完成；覆盖率阈值改为三条（每条规则必须有判据字段、`ai-review` 四要素齐全率 100%、`script` 必须带命令与期望退出码）；发布员由 Lead 代行，记录注明代行；施工执行者为总册一张撰写卡、四域由产品设计、前端、后端、测试四个角色各自撰写并自验。
冲突口径：五类合计等于 285、不重不漏，`新增` 因无旧号记 0 行；180 是规则位上限、不是旧规则条数上限，一个规则位承载多条旧规则允许，本方案 276 条落地规则分布在 158 位。
sha256：正文 2f869b49f4e2b2af5828dd4acbfe6432805ca680c6274037a0f6cb608e84ea05，按删去 `IMPLEMENT.md` 中 `冻结哈希` 行后的文件内容计算，与头部记录值一致；整卷 814642e2951ed0cfa2f60afa1b8951fa4caf11c83874f06e1556753e24bdab3f，对冻结后文件整体计算（94557 字节，LF 换行，无 BOM）。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：`DESIGN.md` 第 8.4 节要求先过 R1 与 R2 两轮验收再冻结，回滚包三件也未备齐（演练记录 `ROLLBACK-DRILL.md` 未做），本条按需求方裁决先行冻结，两轮验收与回滚演练随后另办；`VERSION` 与 `CHANGELOG.md` 属 P1 施工产物，本条只定路径与版本号，未创建文件。

## 2026-11-27 03:44

动作：设计方案冻结。`docs/framework/v2/DESIGN.md` 状态由 `草稿` 改为 `已冻结`，状态行下增加冻结日期、冻结人、冻结时文件 sha256 三行，头部与正文的变更包占位换为正式编号 `CHG-FW-002`。
依据：需求方 2026-11-27 授权，由 Lead 代签，授权原话见当次会话；编号按 `docs/product/ID-SPEC.md` 第 3.1 节 `CHG-<主域>-<NNN>` 规则与第 2 节域码表确定，域码表没有框架类前缀，按需求方指令取 `CHG-FW-002`，`CHG-FW-001` 视为已被上一轮框架变更占用（冻结前全仓检索，`CHG-FW` 仅有两处占位，无 001 或 002 的实体）。
变更号：`CHG-FW-002`。
sha256：正文 `67d70f9391f51c6996d360ab2cbee878bbbda9d1fce113a63147a155a44bb614`，按删去 `DESIGN.md` 中该 hash 行后的文件内容计算，与头部记录值一致；整卷 `52a9409f4a39cabed1b41f522717c69d64910392208c27ab681a19d09d5dad1a`，由 `Get-FileHash -Algorithm SHA256` 对冻结后文件计算（36086 字节，LF 换行，无 BOM）。
签字：Lead（需求方授权代签，授权日期 2026-11-27）。
偏差：`DESIGN.md` 第 8.2 节要求在冻结时备齐回滚包三件（`docs/framework/` 基线快照与 sha256 清单、旧到新映射表、`ROLLBACK-DRILL.md`），第 8.4 节要求两轮验收通过并由验收员签字后才把状态改为已冻结；截至本条记录，回滚包三件与 R1、R2 均未完成，本次冻结以需求方 2026-11-27 授权为据先行办理，回滚包与验收随后另办。冻结前第 24 行原写「冻结时换成正式变更包编号」，冻结时改为保留 V2-01 至 V2-08 工作编号并写明正式编号。
