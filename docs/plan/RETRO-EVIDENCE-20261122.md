# 会话域 P1 复盘证据索引（2026-11-22）

只收集与核对事实，不写结论、不提建议。时间为 Asia/Shanghai。每行都给出处：文件与行号、文件 mtime，或命令输出。没有出处的写「无法确定」。

## 1. 时间线

| 时间 | 事件 | 来源 |
|---|---|---|
| 11-21 18:38 | 本轮复盘统计起点 | `docs/plan/RETRO-20261122.md:1`（覆盖 18:38 至 11-22 19:20）、`:11`（20.2 小时） |
| 11-21 19:33 | 遗留 git 索引锁被移入隔离目录 | `.tmp/stale-locks/index.lock.20261121-193312` mtime、0B |
| 11-21 19:44 | `git init` 误执行，`.git/config` 被重写 | `docs/plan/git-diff-vs-remote.md:193-196`；`.git/config` mtime 19:44:34 |
| 11-21 20:44 | 构建 stamp 写入 | `.tmp/deploy/.stamp` mtime 20:44:51 |
| 11-21 20:45 | 前端构建日志开始 | `.tmp/deploy/build-frontend-2044.log` mtime 20:45:08 |
| 11-21 20:46 | 后端产物 `simo-8787-2044.exe` 生成 | `backend/simo-8787-2044.exe` mtime 20:46:35、22,029,824B |
| 11-21 20:46 | 8787 启动 | `.tmp/deploy/serve-2044.log` mtime 20:46:46 |
| 11-21 20:59 | 截图脚本落盘 | `.tmp/deploy/capture-run.log` mtime 20:59:02 |
| 11-21 21:10 | 第 1 轮验收开始 | `docs/testing/ACCEPT-CONV-20261121.md:4`（21:10–21:35） |
| 11-21 21:32 | 后端全量：16 包 ok、0 FAIL、10 包无测试 | `docs/testing/ACCEPT-CONV-20261121.md:165` |
| 11-21 22:06 | 第 1 轮报告落盘 | `docs/testing/ACCEPT-CONV-20261121.md` mtime 22:06:22 |
| 11-21 22:16 | 产物 `simo-8787-2215.exe` | 文件 mtime 22:16:45、22,066,176B |
| 11-21 23:04 | 产物 `simo-8787-2300.exe` 与 8787 启动 | exe mtime 23:04:08；`.tmp/deploy/serve-2300.log` 23:04:14 |
| 11-21 23:26 | 第 3 轮前端与后端构建 | `.tmp/deploy/build-frontend-2330.log` 23:26:12；`build-backend-2330.log` 23:26:22 |
| 11-21 23:26 | 产物 `simo-8787-2330.exe` | 文件 mtime 23:26:22、22,070,784B |
| 11-21 23:30 | 第 3 轮截图 | `.tmp/deploy/capture-2330.log` mtime 23:30:19 |
| 11-22 00:32 | 第 3 轮报告落盘（31 条生效 AC：23 pass/6 fail/2 未验证） | `docs/testing/ACCEPT-CONV-3-20261121.md` mtime 00:32:23、正文结论 |
| 11-22 01:15 | 产物 `simo-8787-final.exe` | 文件 mtime 01:15:56、15,227,392B |
| 11-22 01:25 | 陈旧锁挡住启动，pid=42424 | `.tmp/deploy/serve-final2.log` 首行 01:25:36.892 |
| 11-22 01:58 | 第 4 轮报告落盘（13 pass/1 fail/9 partial/7 未验证/1 环境限制） | `docs/testing/ACCEPT-CONV-4-20261122.md` mtime 01:58:05、:3 |
| 11-22 02:29 | 第 5 轮构建 | `.tmp/deploy/build-conv5.log` 02:29:45；`build-go-conv5.log` 02:29:58 |
| 11-22 02:30 | 8787 启动 | `.tmp/deploy/serve-conv5.log` mtime 02:30:47 |
| 11-22 03:28 | 第 5 轮报告落盘（33 条：27 pass/4 partial/2 fail） | `docs/testing/ACCEPT-CONV-5-20261122.md` mtime 03:28:05 |
| 11-22 03:30 | 时间轴验证目录开始写入，本地编译并起 8787 | `.tmp/timeline-verify-20261122/backend.pid` 等 mtime 03:30:27；`build.mjs` 03:30:36 |
| 11-22 03:32 | Chrome 9223 专用 profile 首次创建 | `.tmp/timeline-verify-20261122` 下 Local State 等 mtime 03:32:39 |
| 11-22 03:34 | Firefox profile 尝试 | 同目录 profile 文件 mtime 03:34:06 |
| 11-22 03:36 | 该目录最后一次写入，之后无落盘 | `.tmp/timeline-verify-20261122` 下文件 mtime 03:36:46–03:36:47 |
| 11-22 12:08 | 挂起后第一份产物落盘 | `.tmp/repo-clean/frontend/src/test/setup.ts` mtime 12:08:26 |
| 11-22 12:10 | 恢复后的定向与全量测试日志 | `.tmp/timeline-verify-20261122/logs/vitest-conv.log` 12:10:40；`vitest-full.log` 12:12:23 |
| 11-22 12:17 | 产物 `simo-8787-conv6.exe` 与 8787 启动 | exe mtime 12:17:03、22,099,456B；`serve-conv6.log` 12:17:39 |
| 11-22 12:59 | 产物 `simo-8787-conv7.exe` | 文件 mtime 12:59:32、22,105,600B |
| 11-22 13:24 | 产物 `simo-8787-conv8.exe` | 文件 mtime 13:24:49、22,106,112B |
| 11-22 13:25 | 第 6 轮验收（只验 AC-CONV-007-02，判定 pass） | `docs/testing/ACCEPT-CONV-6-20261122.md:3`（13:25–13:35）、:5 |
| 11-22 13:34 | 第 6 轮报告落盘 | 文件 mtime 13:34:10 |
| 11-22 13:42 | 整线复核报告落盘（29 pass/1 partial/3 证据不足，不签字） | `docs/testing/ACCEPT-CONV-FINAL-20261122.md` mtime 13:42:14 |
| 11-22 13:48 | 第 7 轮报告落盘（AC-CONV-008-04 真机 304，pass） | `docs/testing/ACCEPT-CONV-7-20261122.md` mtime 13:48:42 |
| 11-22 14:06 | 第 8 轮报告落盘（30 pass/3 partial；PRD 10 covered/2 conditional） | `docs/testing/ACCEPT-CONV-8-20261122.md` mtime 14:06:11 |
| 11-22 14:31 | 产物 `simo-8787-exit.exe`（buildId `mwrgkenj-4xh98`） | exe mtime 14:31:23、22,107,136B；`docs/testing/ACCEPT-CONV-9-20261122.md` 正文 |
| 11-22 14:44 | 第 9 轮报告落盘（整线签 11 covered + 006 conditional） | `docs/testing/ACCEPT-CONV-9-20261122.md` mtime 14:44:06 |
| 11-22 14:44 | 第二次陈旧锁挡住启动，pid=45060，连续两次 | `.tmp/deploy/serve-exit2.err.log` 14:44:33.977；`serve-exit3.err.log` 14:44:53.781 |
| 11-22 15:04 | 本地提交 `de4cda8`「会话域全量交付（11 covered / 1 conditional）」 | `git log --date=iso` 输出 |
| 11-22 15:14 | `CHG-CONV-006` 变更 spec 更新 | `specs/changes/CHG-CONV-006/spec.md` mtime 15:14:49 |
| 11-22 17:32 | B1 变更包测试计划与证据落盘 | `specs/changes/CHG-B1-001/test-plan.md` 17:32:56；`evidence.md` 17:33:04 |
| 11-22 17:35 | B1 产品 spec 落盘 | `specs/product/P2-TASK/spec.md` 17:35:20；`P4-FILE/spec.md` 17:35:38 |
| 11-22 17:37 | B1 变更包 spec/tasks 写完 | `specs/changes/CHG-B1-001/spec.md` 17:35:53；`tasks.md` 17:37:00 |
| 11-22 18:03 | 会话域恢复项真机脚本运行 | `docs/testing/conv-rest-verify.mjs` mtime 18:03:30 |
| 11-22 18:08 | `CONV-REST-EVIDENCE` 落盘 | `docs/testing/CONV-REST-EVIDENCE-20261122.md` mtime 18:08:05 |
| 11-22 18:11 | `IME-EVIDENCE` 落盘 | `docs/testing/IME-EVIDENCE-20261122.md` mtime 18:11:41 |
| 11-22 18:34 | `STOP-UPSTREAM-EVIDENCE` 落盘 | `docs/testing/STOP-UPSTREAM-EVIDENCE-20261122.md` mtime 18:34:29 |
| 11-22 18:46 | 产物 `simo-8787-final10.exe` | exe mtime 18:46:42、22,110,208B；`.tmp/deploy/final10-build.ps1` 18:46:09 |
| 11-22 18:47 | 收尾服务启动脚本运行 | `.tmp/deploy/final10-serve.ps1` mtime 18:47:00 |
| 11-22 18:51 | 两次移走陈旧锁并重启（锁内 pid 46120、20728） | 隔离目录 `simo.db.lock-20261122-185106-stale`、`-185153-stale`；`.tmp/deploy/restart-after.ps1` mtime 18:51:03 |
| 11-22 18:58 | 强制结束 pid 35056，残留锁在 18:58:40 被移走 | `.tmp/deploy/kill.json`（killedAtIso 18:58:38）；隔离目录 `simo.db.lock-20261122-185840-stale` |
| 11-22 19:05 | 服务重新起，写 `serve.pid` | `.tmp/deploy/serve.pid` mtime 19:05:36 |
| 11-22 19:01 | `SYNC-EVIDENCE` 落盘（前端重建三段耗时 5.67s/0.13s，dist 两两一致） | `docs/testing/SYNC-EVIDENCE-20261122.md` mtime 19:01:04、:7 |
| 11-22 19:16 | 收尾服务日志最后写入 | `.tmp/deploy/serve-lead-final.log` mtime 19:16:47 |
| 11-22 19:27 | 复盘正文落盘 | `docs/plan/RETRO-20261122.md` mtime 19:27:13 |
| 11-22 19:29 | 第 10 轮报告落盘（11 covered/1 partial；AC 32 pass/1 partial） | `docs/testing/ACCEPT-CONV-10-20261122.md` mtime 19:29:20 |
| 11-22 19:29 | test-plan 收口更新 | `specs/test/P1-CONV/test-plan.md` mtime 19:29:59 |

## 2. 轮次与交付物

### 2.1 验收报告

| 轮次 | 文件 | 时间 | 当时结论 |
|---|---|---|---|
| 1 | `ACCEPT-CONV-20261121.md` | 21:10–21:35，mtime 22:06:22 | 8 条中 1 pass、7 partial；`simo-8787-2113.exe` |
| 2（同文件 v2 补测） | `ACCEPT-CONV-20261121.md:245` | 同文件后半 | 8 条 partial→pass（含未读点 441ms） |
| 3 | `ACCEPT-CONV-3-20261121.md` | mtime 00:32:23 | 31 条：23 pass/6 fail/2 未验证，不能签 |
| 4 | `ACCEPT-CONV-4-20261122.md` | mtime 01:58:05 | 31 条：13 pass/1 fail/9 partial/7 未验/1 环境限制 |
| 5 | `ACCEPT-CONV-5-20261122.md` | mtime 03:28:05 | 33 条：27 pass/4 partial/2 fail |
| 6 | `ACCEPT-CONV-6-20261122.md` | 13:25–13:35 | 只验 AC-CONV-007-02，pass（27/27） |
| 整线复核 | `ACCEPT-CONV-FINAL-20261122.md` | mtime 13:42:14 | 29 pass/1 partial/3 证据不足；PRD 9 covered/1 conditional/2 未覆盖 |
| 7 | `ACCEPT-CONV-7-20261122.md` | mtime 13:48:42 | 只验 AC-CONV-008-04，真机 304，pass |
| 8 | `ACCEPT-CONV-8-20261122.md` | 13:51–14:20（`:5`），mtime 14:06:11 | 33 条：30 pass/3 partial；PRD 10 covered/2 conditional |
| 9 | `ACCEPT-CONV-9-20261122.md` | 14:38–14:52（`:3-7`），mtime 14:44:06 | 整线签 11 covered + 006 conditional（`:14`） |
| 10 | `ACCEPT-CONV-10-20261122.md` | 19:01–19:35（`:5`），mtime 19:29:20 | 11 covered/1 partial、AC 32 pass/1 partial（`:3`、`:14`）；补记终态 12 covered/33 pass |

### 2.2 构建产物（`backend/*.exe`，窗口内 13 个）

| 产物 | 大小（B） | 时间 | 来源 |
|---|---|---|---|
| `simo-8787-2044.exe` | 22,029,824 | 11-21 20:46:35 | 文件 mtime |
| `simo-8787-2113.exe` | 15,204,864 | 11-21 21:13:23 | 文件 mtime |
| `simo-8787-2159.exe` | 15,216,640 | 11-21 21:55:19 | 文件 mtime |
| `simo-8787-2215.exe` | 22,066,176 | 11-21 22:16:45 | 文件 mtime |
| `simo-8787-2300.exe` | 22,071,808 | 11-21 23:04:08 | 文件 mtime |
| `simo-8787-2330.exe` | 22,070,784 | 11-21 23:26:22 | 文件 mtime |
| `simo-8787-final.exe` | 15,227,392 | 11-22 01:15:56 | 文件 mtime |
| `simo-8787-conv5.exe` | 22,097,920 | 11-22 02:29:58 | 文件 mtime |
| `simo-8787-conv6.exe` | 22,099,456 | 11-22 12:17:03 | 文件 mtime |
| `simo-8787-conv7.exe` | 22,105,600 | 11-22 12:59:32 | 文件 mtime |
| `simo-8787-conv8.exe` | 22,106,112 | 11-22 13:24:49 | 文件 mtime |
| `simo-8787-exit.exe` | 22,107,136 | 11-22 14:31:23 | 文件 mtime |
| `simo-8787-final10.exe` | 22,110,208 | 11-22 18:46:42 | 文件 mtime |

命令：`Get-ChildItem backend\*.exe | Select Name,Length,LastWriteTime`。窗口外更早的 exe 从 11-07 起另有大量。`RETRO-20261122.md:11` 记「九次重建、4.5 小时」；上表能对上的构建脚本或日志有 7 处（20:45、23:26、02:29、12:16、12:58、14:30、18:46），其余产物只有 mtime。

### 2.3 测试基线变化

| 时间 | 前端 | 后端 | 来源 |
|---|---|---|---|
| 11-21 21:32 | — | 16 包 ok、0 FAIL、10 包无测试；`func Test*` 260 个；定向未读 4 例 PASS | `ACCEPT-CONV-20261121.md:165-166` |
| 11-22 00:32 | 18 文件/171 用例全过 | PASS=298、FAIL=0、SKIP=1 | `ACCEPT-CONV-3-20261121.md:9` |
| 11-22 03:28 | 22 文件/222 用例、70.61s、exit 0（串行） | 无法复跑（本机无 go），矩阵自述 281 PASS/1 SKIP | `ACCEPT-CONV-5-20261122.md:109` |
| 11-22 14:06 | 23 文件/242 用例、0 skip | 本轮未取到 | `ACCEPT-CONV-8-20261122.md:172`、:78 |
| 11-22 14:44 | 23 文件/243 用例、34.70s | — | `ACCEPT-CONV-9-20261122.md:85` |
| 11-22 19:29 | 25 文件/260 用例、24.43s、exit 0 | 26 包：16 ok、10 无测试、0 FAIL；`cmd/simo` 259.609s | `ACCEPT-CONV-10-20261122.md:20-21` |

## 3. 问题实例

| # | 时间 | 现象 | 来源 | 影响 |
|---|---|---|---|---|
| 1 | 03:35 派出，03:36 起无落盘，12:08 才有第一份 | 浏览器 CDP 一直起不来：03:30 起本地编译、起 8787、连开 Chrome 9223 profile 与 Firefox profile，03:36:47 后目录无写入 | `.tmp/timeline-verify-20261122` 文件 mtime；`RETRO-20261122.md:72-73` | 实测 8 小时 31 分无进度；RETRO 记 8.6 小时 |
| 2 | 时刻无法确定 | `rm -rf dist` 把已构建产物一起删掉，只能重跑打包 | `RETRO-20261122.md:63-64`；`frontend/build.mjs:11` `await rm(out, {recursive:true,force:true})` | 重跑打包；次数与钟点无记录 |
| 3 | 19:44:34 | 误执行 `git init`，`.git/config` 被重写 | `git-diff-vs-remote.md:193`、:196 | `status --porcelain -uno`=1028；`diff --summary`=611 delete + 417 mode change（:205）；config 语义复原、mtime 不能复原（:208） |
| 4 | 01:25:36 | 启动报「数据库已被另一个 simo 实例占用」，锁内 pid=42424、started=1795281410698（对应 01:16:50） | `.tmp/deploy/serve-final2.log` 首行 | 一次启动被挡；锁内 pid 与 01:16 起的实例对应，未移锁 |
| 5 | 14:44:33、14:44:53 | 同一锁连续两次挡住启动，锁内 pid=45060、started=1795329626108（对应 14:40:26） | `.tmp/deploy/serve-exit2.err.log`、`serve-exit3.err.log` 首行；`ACCEPT-CONV-9-20261122.md:7` | 两次启动被挡；14:45:09、14:45:23 两次把锁移入 `.trash/pending-delete/data/`（pid 45060、pid 32024） |
| 6 | 18:51:06、18:51:53、18:58:40 | 进程结束后残留 `data/simo.db.lock`，服务拒绝启动；`restart-after.ps1` 判 pid 不存活后把锁改名移入隔离目录 | 隔离目录 `simo.db.lock-20261122-185106-stale`（pid=46120）、`-185153-stale`（pid=20728）、`-185840-stale`（pid=35056），各 32B；`.tmp/deploy/kill.json`；`SYNC-EVIDENCE-20261122.md:16` | 三次移锁后重启；`.tmp/deploy/serve.pid` mtime 19:05:36 |
| 7 | B1 起止钟点无法确定；产物文档 17:32–17:37 | 用户只要求绘画相关，B1（P2 任务与执行、P4 文件与交付物）提前开工，被叫停后保留产物、不回退 | `docs/plan/BACKLOG.md:114`、`DECISIONS.md:76-78`；B1 文件 mtime | RETRO 记 1.9 小时；B1 三行标 `parked`，未提交未重建未部署 |
| 8 | 第 3、4、5、8、10 轮 | 每轮把 31–33 条 AC 全量重取，不只验变化项 | 各报告结论行：`ACCEPT-CONV-3`（31）、`-4`（31）、`-5`（33）、`-8`（33）、`-10`（33） | 约 3 小时（`RETRO-20261122.md:11`） |
| 9 | 时间轴 44×44 | 轮 3 判 007-02 pass，同页记「名义 44×44、实测 42×44」并记 44px 只在 `pointer: coarse` 生效；轮 4 把「时间轴命中宽度」「44px 仅 coarse」两条疑点判已解决；轮 5 判 fail（桌面 20×4、四角全不命中、测试矩阵强制 coarse）；轮 6 改按整列 44px 连续命中判 pass；轮 8 沿用轮 6；轮 10 按轨道 44px 契约判 pass | `ACCEPT-CONV-3:38`、`:65`、`:67`；`ACCEPT-CONV-4:64`、`:67`；`ACCEPT-CONV-5:35`、`:95`；`ACCEPT-CONV-6:5`；`ACCEPT-CONV-8:103`；`ACCEPT-CONV-10:45`；`DECISIONS.md:18` | 判 fail 1 次（轮 5）；口径改 2 次（轮 4 coarse、轮 6 整列）；6 轮涉及 |
| 10 | 置顶排序归属 | 轮 3 pass（同级序 C,B,A,R→A,C,B,R，parentId 仍 main，归档 409）；轮 4、5 复核通过并补重启保持；轮 8 沿用轮 4/5 证据；轮 10 pass | `ACCEPT-CONV-3:28`、`-4:20`、`-5:20`、`-8:93`、`-10:34`；`DECISIONS.md:8` | 无 fail 记录；复核 5 轮 |
| 11 | 会话行数字口径 | 轮 3 发现活跃行徽标显示全局总数（两个会话都显示 161，源码 `app.tsx:803`）；轮 5 新增 `AC-CONV-001-05` 通过（行内=自身、底部=全局，17 行、`18 个会话·归档 1·332 条`）；轮 10 pass（17 会话、main=85、求和 229） | `ACCEPT-CONV-3:61`、`-5:21` 与 `:101`、`-10:35`；`DECISIONS.md:16` | 口径改 1 次；轮 5 另记底部汇总不随新消息刷新（行变 2，底部仍 332） |
| 12 | 未读时机 | 轮 1 三条 partial：非 active 会话不实时出现未读点、点进不补发 read；同文件 v2 补测 441ms 内出现并收 `session_unread`；轮 3、5、10 复核 pass | `ACCEPT-CONV-20261121.md:17-19`、`:245`；`ACCEPT-CONV-3:49-51`；`ACCEPT-CONV-5:47-49`；`ACCEPT-CONV-10:56`；`DECISIONS.md:10` | 判 partial 1 次（轮 1），改 1 次（v2），其余 4 轮复核；9ms/57ms/73ms 数字在 `ACCEPT-CONV-10:52`，属 SYNC-002-01 |

## 4. 数字

| 指标 | 数值 | 命令/来源 |
|---|---|---|
| frontend/src 文件 | 41 个（全部扩展名） | `Get-ChildItem frontend\src -Recurse -File` |
| frontend/src 行数 | 9819 行（*.ts,*.tsx,*.css,*.mjs,*.json） | `Get-ChildItem frontend\src -Recurse -File -Include *.ts,*.tsx,*.css,*.mjs,*.json \| Get-Content \| Measure-Object -Line` |
| frontend/src 拆分 | ts/tsx 37 文件 8170 行；测试文件 25 个 | 同上，`-Include *.ts,*.tsx` 与 `*.test.ts,*.test.tsx` |
| backend Go | 214 文件、42792 行 | `Get-ChildItem backend -Recurse -File -Filter *.go` |
| specs/ | 184 个 md、13593 行 | `Get-ChildItem specs -Recurse -File -Include *.md` |
| docs/ | 134 个 md、18732 行 | `Get-ChildItem docs -Recurse -File -Include *.md` |
| 本会话请求数 | 376 次以上 | acp_cache 实测（Lead 提供） |
| 输入 token | 43.85M | acp_cache 实测（Lead 提供） |
| 缓存命中率 | 97.5% | acp_cache 实测（Lead 提供） |
| 输出 token | 302K | acp_cache 实测（Lead 提供） |
| 压缩 | 19 次，净省 78.27M | acp_cache 实测（Lead 提供） |
| 验收报告 | 10 份 `ACCEPT-CONV-*.md`；编号轮 1–10，首份含 v2 补测，另 1 份 FINAL 整线复核 | `Get-ChildItem docs\testing\ACCEPT-CONV-*.md` |
| AC 条数 | 33 条生效 | `ACCEPT-CONV-10-20261122.md:31-63` 逐条表；`RETRO-20261122.md:7` |
| PRD 数 | 12 个 | `RETRO-20261122.md:7`；`MASTER-PLAN.md:98` |
