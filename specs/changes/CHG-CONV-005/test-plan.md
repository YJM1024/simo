# CHG-CONV-005 · 测试计划

状态：**blocked**（无可执行用例；口径未定不写断言）
Change: CHG-CONV-005
Implements: PRD-SYNC-004、PRD-SYNC-005
Covers: `AC-SYNC-004-01/02`、`AC-SYNC-005-01`

> 域级用例：TC-P1-011（SYNC-004，missing）、TC-P1-012（SYNC-005，missing）。

## 1. 当前无用例的原因

- 未读口径未定 → 无法写"读完后未读应为 0"之类的断言（到底何时算读？）。
- 无后端 → 无 API 层测试对象。
- 远程/通知未立项 → 无鉴权对象、无通知对象。

## 2. 口径确定后必须覆盖（占位，不执行）

| 用例（草案） | AC | 层级 | 断言要点 | 期望 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 未读累加/清零 | `AC-SYNC-004-01` | component | 新消息到达且非贴底 → +N；滚到底/切会话/收到更晚游标 → 0 | 全部断言通过，无 fail 与 skip | missing |
| 跨标签一致 | `AC-SYNC-004-01` | unit/E2E | A 标签阅读后 B 标签未读清零；同一 at 冲突确定性 | 全部断言通过，无 fail 与 skip | missing |
| 刷新恢复 | `AC-SYNC-004-01` | API + integration | 重启后未读/游标与写入一致 | 全部断言通过，无 fail 与 skip | missing |
| 接口失败不造假 | `AC-SYNC-004-02` | component | 接口失败显示"未知"，不得显示 0 | 全部断言通过，无 fail 与 skip | missing |
| 远程鉴权 | `AC-SYNC-005-01` | API | 未授权 401/403；不泄露会话存在性 | 全部断言通过，无 fail 与 skip | missing |
| 通知去重/免打扰 | `AC-SYNC-005-01` | API + UI | 同事件不重复通知；免打扰期不弹 | 全部断言通过，无 fail 与 skip | missing |

## 3. 数据与 mock

未定。不得以"现有内存态"充当持久化测试对象。

## 4. 未覆盖声明

TC-P1-011、TC-P1-012 均为 `missing`；本包不产生任何 pass 记录。
