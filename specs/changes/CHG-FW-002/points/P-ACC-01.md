# P-ACC-01 验收点：六项复跑签收

- 点编号：P-ACC-01
- 本点编号：P-ACC-01
- 变更包：CHG-FW-002
- 上游点：P-RUL-01
- owner：验收员
- 验收范围：六项改法、四份域文件 script 分布、`check-points` 缺目录报错、零检查断言、`check-gates --stage exit` 与 `check-rule-fields` 复跑。
- 结论：通过（2026-11-27）。`node scripts/check-gates.mjs --stage exit` 退出码 0（11 门 PASS，0 error，84 warnings）；`node scripts/check-rule-fields.mjs --file docs/framework/MOXIAN.md` 退出码 0（158 rules，checks 807）；`node scripts/check-points.mjs --change CHG-FW-002` 退出码 0（checks 43，2 notice）；`node scripts/check-mapping.mjs` 退出码 0（checks 21，2 notice）。零检查自检：`check-trace --self-test` PASS 22、`check-fp-coverage --self-test` PASS 49、`check-archive --self-test` PASS 10、`check-points --self-test` PASS 14、`check-mapping --self-test` PASS 18。六条受 isPass 约束的规则逐条实跑退出码 0，checks 为 147、145、144、144、21、103；证据与日志在 `.tmp/v2-r5-fix/`。
- 建立时间：2026-11-27 04:10
- 冻结时间：2026-11-27 04:12
- 冻结人：判定员
