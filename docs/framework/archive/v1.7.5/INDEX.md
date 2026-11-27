# 框架 v1.7.5 快照索引

归档时间：2026-11-27 03:56（Asia/Shanghai）。归档人：v2-p0-snapshot（Lead 委派子智能体）。归档路径：`docs/framework/archive/v1.7.5/`。

归档依据是 `docs/framework/v2/IMPLEMENT.md` 第 6 节。12 份文件只复制不移动，源文件保持原位；归档目录自此只读，不再修改内容，不再接受新规则，引用时必须带版本号 `v1.7.5` 以区别于现行正文。复制前对 12 份源文件计 sha256，复制后对副本逐份复算，12/12 一致。行数按 LF 切分并去掉尾部空行；旧规则条数按行首 `- MX-...` 定义行统计；旧门禁条数按唯一 `MX-G-NN` 编号统计，只有 `GATES.md` 承载门禁定义。

| 文件名 | 版本 | 行数 | sha256 前 12 位 | 旧规则条数 | 旧门禁条数 | 归档时间 | 归档人 | 说明 |
|---|---|---:|---|---:|---:|---|---|---|
| `MOXIAN.md` | v1.7.5 | 1508 | `42A760E93B77` | 285 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 总纲，十三章与附录 A 至 D，285 条规则 |
| `GATES.md` | v1.7.5 | 453 | `8E1C1C112E77` | 0 | 69 | 2026-11-27 03:56 | v2-p0-snapshot | 六道检查门禁与 69 条门禁规则 |
| `TASK-MATRIX.md` | v1.7.3 | 340 | `D48BBC2E086B` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 八类任务、六阶段矩阵与 21 道门禁名册 |
| `ROLES.md` | v1.7.3 | 233 | `1A9D343325E6` | 42 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 八角色职责与 42 条角色规则 |
| `EFFORT.md` | v1.7.3 | 154 | `B4052B4769C2` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 六阶段推理档位映射 |
| `README.md` | 未标版本 | 64 | `3C49A601458B` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 框架入口、阅读顺序与维护规则 |
| `ADOPTION.md` | v1.7.3 | 109 | `DBEEC98E4340` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 旧流程文件处置与采纳说明 |
| `ABSORB-RECONCILE.md` | 未标版本 | 213 | `185EFA92A2A9` | 0 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 98 条采纳清单对账 |
| `domains/backend.md` | v1.7.2 | 476 | `6A3E1B48A6DF` | 83 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 后端域规范，编号 `MX-BE-NN` |
| `domains/frontend.md` | v1.7.2 | 370 | `A7F33E6EE997` | 57 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 前端域规范，编号 `MX-FE-NN` |
| `domains/testing.md` | v1.7.4 | 359 | `530DF2DC7CCA` | 72 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 测试与验收域规范，编号 `MX-QA-NN` |
| `domains/product-design.md` | v1.7.2 | 397 | `8FC9E0D277ED` | 70 | 0 | 2026-11-27 03:56 | v2-p0-snapshot | 产品与设计域规范，编号 `MX-PD-NN` |

合计 12 份、4676 行、旧规则 609 条、旧门禁 69 条。

## 补充字段

下表给出 P5 归档校验与迁移追溯所需的完整字段。`check-archive.mjs` 的哈希比对取本表 sha256 全值。

| 文件名 | 原路径 | 字节数 | sha256 全值 | 替代文件 | 替代章节 |
|---|---|---:|---|---|---|
| `MOXIAN.md` | `docs/framework/MOXIAN.md` | 232408 | `42A760E93B778FAA9A054014A78FA19642856A2CD986BF85449F607D9234F492` | 新九章 `MOXIAN.md` | 第 1 至 9 章与附录 A 至 D |
| `GATES.md` | `docs/framework/GATES.md` | 87886 | `8E1C1C112E770ADFBD57F0BD2E61752ECACD6F1D633674AE63B1EBE5168933E3` | 新第 7 章与薄索引页 | 第 7 章 |
| `TASK-MATRIX.md` | `docs/framework/TASK-MATRIX.md` | 77945 | `D48BBC2E086B87543352537A515F46EB0451B495B023E265F3841E951A87434E` | 改写后的矩阵 | 第 2 章与第 7 章 |
| `ROLES.md` | `docs/framework/ROLES.md` | 43754 | `1A9D343325E60088BD0AB44CD4BC9DB8B355C45F00D91D48B432EFAEEC0A8774` | 七角色索引页 | 第 3 章 |
| `EFFORT.md` | `docs/framework/EFFORT.md` | 20289 | `B4052B4769C223D59BA3A88E8A6832069D59F28BB5F8F394F83CF5EE3D6AA964` | 改写后的档位页 | 第 5 章 5.11 |
| `README.md` | `docs/framework/README.md` | 9199 | `3C49A601458BC7581CE9D0718170887E33B928C1FB1A5B7D9C02D8DBF679EA69` | 新导航 | 入口页 |
| `ADOPTION.md` | `docs/framework/ADOPTION.md` | 14072 | `DBEEC98E43400914E8937118F379531CB9BA3CBE2C3853DB1477DBD8CBBC90A7` | v2 采纳记录页 | 第 7 章 7.6 |
| `ABSORB-RECONCILE.md` | `docs/framework/ABSORB-RECONCILE.md` | 35394 | `185EFA92A2A9F7884BD960D630C548DC56419B5FAF83C2A711B5A9348F92B9DB` | 原文件保留，不另设替身 | 附录 C |
| `domains/backend.md` | `docs/framework/domains/backend.md` | 63942 | `6A3E1B48A6DFDC29D914AE67A73ADBBE9F732E6DF072092EA446638A53E02050` | `MXV2-BE` | 第 5 章 5.8 |
| `domains/frontend.md` | `docs/framework/domains/frontend.md` | 45669 | `A7F33E6EE997667110A06445AD16E35110995AD054960F3AAA3FA49D65FC05F3` | `MXV2-FE` | 第 8 章 8.3 |
| `domains/testing.md` | `docs/framework/domains/testing.md` | 63188 | `530DF2DC7CCA0AF464860B75836BCBE5EB9CFB834693DFA6E98DC5056A420F69` | `MXV2-QA` 与新第 7 章 | 第 7 章 |
| `domains/product-design.md` | `docs/framework/domains/product-design.md` | 46252 | `8FC9E0D277ED1CD90F596C3F2F5F33DBC07BF211AB9CF6B86DEAF775E2DE31F6` | `MXV2-PD` | 第 8 章 8.3 |

旧章号到新章号的完整对照以新 `MOXIAN.md` 附录 B 为准，本索引不复制 285 行映射表，避免第二份事实来源。
