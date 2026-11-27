# 框架 v2 过程文档索引
本目录放框架 v2 的设计、日志、回滚与来源。2026-11-27 文书削减后只剩下面这些文件，删掉或合并的都有唯一去向。

表 1 现行文件

| 文件 | 内容 |
|---|---|
| `DESIGN.md` | 设计方案；施工步骤在「怎么实施」节 |
| `ACCEPT.md` | 验收结论、签字、红项、证据指针（一页） |
| `JOURNAL.md` | 冻结、批次解冻、发布三类事件 |
| `CHANGELOG.md` | 版本变化摘要 |
| `BACKLOG.md` | 未决与待承接事项 |
| `ROLLBACK.md` | 回滚方案与禁止项 |
| `ROLLBACK-DRILL.md` | 回滚演练记录 |
| `SOURCES.md` | 外部来源清单 |
| `RESEARCH.md` | 调研与逐条摘录 |
| `sources/SOURCES-RAW.md` | 七份原始采集表合订本 |
| `CUT-PLAN.md` | 本次削减清单与域规则删除明细 |

表 2 已移出的文件（隔离目录 `E:\dsh_home\trash\pending-delete\fw-cut-20261127\`）

| 原路径 | 去向 |
|---|---|
| `docs/framework/v2/IMPLEMENT.md` | 全文并入 `DESIGN.md` 的「怎么实施」节 |
| `docs/framework/v2/sources/` 七份原表 | 合订为 `SOURCES-RAW.md`，分节序号不变 |
| `docs/framework/v2/ACCEPT.md` 旧版 | 402 行 R6 版由镜像副本还原后移入隔离目录 `docs/framework/v2/ACCEPT.md`；本目录一页版取代其用途，还原版本可能差一次修订 |
| `docs/framework/v2/JOURNAL.md` 旧版 | 67 行、含六条逐次记录的原件移入隔离目录 `docs/framework/v2/JOURNAL.md`；本目录改为冻结、批次解冻、发布三类事件 |
| `specs/changes/CHG-FW-002/` 五件 | `change.md`、`tasks.md`、`spec.md`、`LINKAGE.md`、`closure.md` 移入隔离目录同路径，内容并入 `proposal.md` 对应小节 |

本目录的结论与数字以脚本输出为准；隔离目录里的副本只读，不再引用。
