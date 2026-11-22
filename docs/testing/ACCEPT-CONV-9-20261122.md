# P1-CONV 第九轮整线验收签字（ACCEPT-CONV-9）

| 项目 | 值 |
|---|---|
| 验收时间 | 2026-11-22 14:38–14:52（Asia/Shanghai） |
| 工作树 | `E:\dsh_home\workspaces\agent` |
| 被测实例 | `backend/simo-8787-exit.exe`，buildId `mwrgkenj-4xh98`；原 PID 45164 在复核开始前已退出，本报告全部检查针对 14:39:30 用同一 exe 重启的实例（PID 45060，14:40:26 起） |
| 浏览器 | Chrome 157 headless，CDP `127.0.0.1:9223` |
| 判定依据 | `specs/product/P1-CONV/spec.md`、`specs/test/P1-CONV/test-plan.md`、`docs/product/TREE.md`、`TRACEABILITY.md`、`SPEC-GAP.md`、第八轮报告与 STOP-EVIDENCE-2 |
| 可写范围 | 仅本报告与 `.tmp/accept-final2/`；未改源码、库、`.git` |

## 签字结论

整线签，签字范围限证据支持的 11 个 covered 与 `PRD-CONV-006` 的 conditional。`AC-CONV-006-02` 保持 conditional，等待真实中文输入法人工验证，不计 pass。签字不覆盖部署与真实 IME 验收。未发现会推翻 covered 的证据；同时列出 8 处文档自相矛盾与 1 处错误证据锚点，要求回写后才能关闭文档门禁。`PRD-SYNC-005` 保持 gap，不在本次签字面。

## 1. 复核环境的事实修正

复核开始时 8787 已无监听：14:38:20 与 14:39:25 两轮 `curl --noproxy` 均为 connection refused，`Get-NetTCPConnection` 拒绝访问，`tasklist` 拒绝访问，`serve-exit.log` 停在 14:31:36 的 listening 行，没有退出或 panic 记录。14:39:30 用同一 `backend/simo-8787-exit.exe`（`SIMO_HOME=data`）重启，buildId 仍为 `mwrgkenj-4xh98`，`app.js` 316072 字节、sha256 `53624c4755…` 与磁盘一致。第一次用 `Start-Process` 起的子进程随命令结束被回收，最终由后台 job 持有 PID 45060；数据库 `data/simo.db` 未变。若签字要求“验原 PID 45164”，该条件已不成立；本报告的 HTTP 与 UI 证据均来自同一二进制的重启实例。

## 2. 六项复核

### 2.1 health、buildId、会话计数（pass）

我实测 `GET /api/health` 返回 200，`{"ok":true,"ready":true,"checks":{"db":"ok","modules":["sessions","chat","tasks","memory"]}}`。`GET /` 的 buildId 为 `mwrgkenj-4xh98`，与 `.tmp/deploy/exit-build.json` 一致。`GET /api/sessions` 返回 15 行，`messageCount` 全部为整数，`main` 为 75。`GET /api/sessions/tree` 返回 15 个节点、`messageCount` 求和 209，与任务给出的 15 / 75 / 209 一致。

### 2.2 投影 304 与 taskLimit（pass）

我实测 `GET /api/sessions/main/spec-projection` 首响 200、ETag `"spec-c5a2d772dd1d5d88"`、1455 字节；带 `If-None-Match` 再取为 304、空 body 0 字节。`?taskLimit=3` 的 ETag 同为 `spec-c5a2d772dd1d5d88`（默认值即 3），`?taskLimit=50` 为 `"spec-e217d5acfbc1ba18"`，两者不同。浏览器侧另外抓到一次真实 304（带 `If-None-Match`），304 前后右栏执行组均为 7 行、无 skeleton 帧。证据：`.tmp/accept-final2/http.json`、`.tmp/accept-final2/exit-8787-dom.json`。

### 2.3 时间轴命中与跳转（pass，判据需补时界）

`.timeline` 实测宽 44、高 563，位于 x=248。按 5%、25%、50%、75%、95% 五点取样，`elementFromPoint` 五处全部落在 `.timeline` 内；刻度条 75 条与消息 75 条一一对应。点击第 30 与第 31 刻度中点（y=395.48），active 变为 30，等于最近刻度 30。点击后 +200ms 时目标消息尚未进入视口（`scrollTop` 5941，目标 `msgTop` −2828.9）；+900ms（平滑滚动结束）进入视口（`scrollTop` 2979，`inViewport=true`）。`AC-CONV-007-02` 只写“点击后进入视口”，没有时界，200ms 快照不构成失败。

### 2.4 375×812 Composer（pass）

375×812 下 Composer 359×144、输入框 357×78.8、发送按钮 54×28，三者可见比例均为 1.0。sidebar 与 inspector 均为 `display:none`、矩形 0×0，与 Composer 不相交。`documentElement.scrollWidth` 与 `clientWidth` 同为 375，body 同为 375，无横向溢出。发送按钮此时 `disabled=true`，原因是输入为空，不表示布局缺失。证据：`exit-8787-375.png` 与 `exit-8787-dom.json`。

### 2.5 表格横向滚动（pass）

1180 宽注入 14 列 4 行表格后，`.msg-table-wrap` 的 `clientWidth` 496、`scrollWidth` 819、`overflow-x:auto`，可内部滚动到 323；`table` 自身 819/819，不承担滚动。`.conversation-scroll` 568/568，无横向溢出；文档 1180，无溢出。375 宽时 wrap 331/819 仍内部滚动到 488，`table` 819/819，`.conversation-scroll` 359/359，文档仍为 375。横向滚动发生在 `.msg-table-wrap`，外层会话滚动容器不溢出。

### 2.6 停止按消息定向（用例 pass，厂商中断未验证）

后端定向用例 `TestStopFrameByMessageIDStopsOnlyTargetStream`（`backend/internal/modules/chat/stop_interrupt_test.go:402`）我实跑 PASS，1.99s，整包 `ok simo/internal/modules/chat 2.285s`，GO_RC=0。用例在同一 WS 的 `sess-stop` 上并发两条流：不存在的 `messageId` 不撤回任何一条；停 `reply1` 后第一条上游 context 被取消、`status=retracted`、撤回后零 delta，第二条继续产出并 `reply.done`、正文非空，`active` 清空，假上游共 2 次流式请求。前端 `App.conversation.test.tsx:455` 我按名称定向实跑：1 passed、38 skipped、978ms，断言并发两条流点一次停止恰发 2 个 `correct` 帧、`messageId` 为 `['stream-1','stream-2']`。生产路径在 `loop.go:1119-1123` 用 `messageID` 调 `findActive`，未命中只记 Warn，不扩大到其它流。真实厂商连接级中断仍未验证：本机 `api.deepseek.com` 为 403，按“环境限制未验证”记录，不判 pass。

## 3. 文档一致性

`node scripts/check-trace.mjs` 退出码 0，输出 `PASS (checks: 678)`，失败项 0、提示项 1。提示项为 `docs/product/TRACEABILITY.md:1` 的 T2：`PRD-CONV-008` 未被任何 change 包引用；另有 1 条治理豁免 `CHG-SYS-001`。根因是 `specs/changes/CHG-CONV-006/` 只有 `proposal.md`、`product.md`、`tasks.md`，没有 `spec.md`，而 `PRD-CONV-008` 的 CHANGE 列只指向该 proposal。

12 个验收面 PRD 的状态行在 TREE、TRACE、GAP、spec §6 同口径：11 covered / 1 conditional（`PRD-CONV-006`）/ 1 gap（`PRD-SYNC-005`，不计验收面）。test-plan 第 10 行为 pass 32 / partial 1 / blocked 2，与 33 条生效 AC 吻合。逐项位置：TREE 第 98–138 行、TRACE 第 63–75 行与第 20 行、spec 第 300–317 行、SPEC-GAP 第 41 行。

同一批文档内部仍有 8 处“状态写 covered、说明写未闭环”的矛盾，按任务要求逐条列出，不替其圆：

| 位置 | 文档写法 | 与之冲突的证据 |
|---|---|---|
| spec.md:303 | `PRD-CONV-002` covered，同格写“证据未回填前不得对外宣称闭环” | test-plan:137 记 `AC-CONV-002-02` pass，含重试计数 |
| spec.md:310 | `PRD-SYNC-001` covered，同格写“前端重连无测试” | test-plan:150-151 记 pass；`App.conversation.test.tsx:486` 有重连用例 |
| spec.md:311 | `PRD-SYNC-002` covered，同格写“代码存在，零测试；opId 未去重” | test-plan:152-153 记 pass；`App.tabsync.test.tsx:189` 等同 at/重复广播断言存在 |
| spec.md:312 | `PRD-SYNC-003` covered，同格写“跨标签零测试” | test-plan 与 TREE 记 E2E 13 覆盖多标签发送模式 |
| spec.md:218 | `AC-SYNC-002-02` 自述“证据无，覆盖上按 partial” | test-plan:153 记 pass，`App.tabsync.degrade.test.tsx` 存在 |
| spec.md:239–250 | `PRD-SYNC-004` 正文三段写“missing / 证据❌” | spec §6:313 与 test-plan:156-158 记 01/02/03 全 pass；`unread_test.go:93` 有重启持久化用例 |
| spec.md:103 | `PRD-CONV-003` 六类行写未读“❌ 无实现无测试” | spec §6:304 写未读已实现并通过 |
| spec.md:281 | `AC-CONV-008-03` 末尾写“本 AC partial” | spec §6:307 与 TREE 记 covered，375 四态与截图已补 |

另有一处证据锚点错误：test-plan:151 给 `AC-SYNC-001-02` 指 `frontend/src/App.conversation.test.tsx:259`，该行属于“session_unread 合并刷新”用例；重连用例实际在同文件 `:486`。覆盖结论未被推翻，但引用不可复现。

## 4. 新发现问题

**缺陷（文档与环境）**

1. 8787 实例没有守护：原 PID 45164 在复核前退出，日志无退出记录，签字只能针对重启实例；下次整线验收应把“实例存活 + PID + 启动时间”纳入前置检查。
2. test-plan:151 的证据行号错误（`:259` 对不上重连用例，实际 `:486`），属于可复核性缺陷。
3. `CHG-CONV-006` 缺 `spec.md`，导致 check-trace 对 `PRD-CONV-008` 报 T2 提示；covered 的六类产物在这一项上不齐。

**判据口径问题**

4. `AC-CONV-007-02` 的“点击后进入视口”没有时界。平滑滚动 70 条消息约需 700ms，按 +200ms 采样会误判失败；判据应写“平滑滚动结束后（≤Xms）进入视口”。
5. `AC-CONV-008-03` 的“375 宽右栏不遮挡”在当前构建靠 `display:none` 满足，375 下没有右栏开关；判据应明确“隐藏即满足”还是“必须可打开且不遮挡”。
6. spec §6 的“说明”列是旧快照，与同格状态和 test-plan 冲突；状态列与说明列必须同源更新，否则读者无法判断哪一列算数。

**观察项**

7. 375 下发送按钮可见但 `disabled=true`（输入为空），检查“可见比例”时不能顺带推断“可点击”。
8. `taskLimit=3` 的 ETag 与默认响应相同，属预期（默认即 3）；该检查只能证明 `3` 与 `50` 两个取值不同，不能证明任意 taskLimit 都参与 ETag。
9. 我实跑前端全量：23 文件 / 243 用例通过、0 skipped、34.70s；外层 `Select-Object` 截断输出使 pwsh 报 exit 1，vitest 摘要本身全绿，退出码不可作为反证。
10. `PRD-CONV-005` 残余未验证项（真实厂商中断、跨标签双 WS、断网 e2e）仍应在签字备注中保留，不能因 covered 而省略。

## 5. 复核边界

我亲手复核：health/buildId/sessions/tree、投影 304 与 taskLimit、时间轴五点命中与点击定位、375 Composer 几何、1180/375 表格滚动、后端停止定向用例、前端停止定向用例、前端全量 23 文件 / 243 用例、check-trace、上述文档行号与证据文件存在性。

我引用未重跑：后端全量 285 PASS / 1 SKIP（test-plan:11 与 `ACCEPT-CONV-8` 的记载，本轮未重跑）、E2E 19/19×2（test-plan:47）、`AC-SYNC-002/003` 的多标签 E2E 结论（test-plan:152-153）、`PRD-CONV-001/002/003/004/007` 的逐条 AC 证据（test-plan:132-145，抽查未全跑，覆盖判定沿用这些行的 pass 记录）。

## 附：证据文件

- `.tmp/accept-final2/http.json`：health、buildId、sessions、投影 304 的原始响应。
- `.tmp/accept-final2/exit-8787-dom.json`：时间轴、375、表格三组 DOM 实测。
- `.tmp/accept-final2/cdp2.mjs`：本轮 CDP 脚本（UTF-8，输出目录已隔离）。
- `.tmp/accept-final2/go-stop.log`：后端定向用例输出。
- `.tmp/accept-final2/exit-8787-375.png`、`.tmp/accept-final2/exit-8787-1180.png`：两个视口截图。
- `docs/testing/STOP-EVIDENCE-2-20261122.md`、`docs/testing/ACCEPT-CONV-8-20261122.md`：引用来源。
