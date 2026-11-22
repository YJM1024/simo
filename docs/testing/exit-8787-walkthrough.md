# 8787 exit 包重建与六项真机走查

- 时间：2026-11-22（Asia/Shanghai），采集时刻见各 JSON 的 `capturedAt`。
- 包：`backend/simo-8787-exit.exe`，22,107,136 字节，buildId `mwrgkenj-4xh98`，PID 45164（StartTime 14:31:36），启动日志 `.tmp/deploy/serve-exit.log`（listening 14:31:36.246，`SIMO_HOME=E:\dsh_home\workspaces\agent\data`）。
- 旧包 `simo-8787-conv8.exe`（PID 43028）与新包并存，未删除任何 exe；未改源码、未改数据库内容。

## 产物清单

| 文件 | 内容 |
|---|---|
| `docs/testing/exit-8787-http.json` | health / buildId / app.js 与 app.css 字节与 SHA / sessions / projection（200、304、taskLimit 3 与 50） |
| `docs/testing/exit-8787-http-timing.json` | 同上各项的逐请求耗时（毫秒） |
| `docs/testing/exit-8787-dom.json` | CDP：时间轴、投影 304 与右栏稳定、表格滚动、375 Composer、console 与 HTTP 计数、注入自检 |
| `docs/testing/exit-8787-1180.png` / `exit-8787-375.png` | 1180×900 与 375×812 实拍 |

## 六项结论

1. **health 与版本**：`GET /api/health` 200（`ok:true ready:true`，db ok，modules sessions/chat/tasks/memory）；`/` 返回 `buildId=mwrgkenj-4xh98`，与包内一致；`/assets/app.js` 200、316,072 字节、sha256 `53624c47…5a25d8`，与 `frontend/dist/app.js` 逐字节一致；`app.css` 79,712 字节、sha256 `169613e2…954df` 同样一致（`exit-8787-http.json`）。
2. **行内消息数**：`GET /api/sessions` 200，15 行，`allMessageCountInteger=true`，`main` 的 `messageCount=75`，与页面上 15 行会话的数字一致（未改库）。
3. **投影 304**：首次 200、`ETag "spec-c5a2d772dd1d5d88"`、1,455 字节；同值 `If-None-Match` 二次 304、body 0 字节；`taskLimit=3` ETag 与默认相同，`taskLimit=50` ETag `"spec-e217d5acfbc1ba18"`（1,969 字节），两者不同。浏览器侧：从「验收序C」切回主会话时真实请求带 `If-None-Match: "spec-c5a2d772dd1d5d88"`、状态 304，右栏 88 个采样帧里 `.exec-row` 恒为 7（最小=最大），骨架帧 0、占位帧 0（`exit-8787-dom.json` 的 `checks.projectionBrowser`）。
4. **时间轴整列命中**：`.timeline` 实测 44×563（x=248）；5 个纵坐标点 `elementFromPoint` 全部落在 `.timeline` 内（2 个命中 NAV，3 个命中 `.tlg-session`）；75 个刻度对应 75 条消息；点击两刻度之间的 y=395.48（最近刻度 30，点击前 active=70）后 activeIndex=30，等于最近刻度；目标消息在 +200ms 时仍在视口外（msgTop −3041.9），+900ms 进入视口（scrollTop 2979），原因是跳转用了 `scrollIntoView({behavior:'smooth'})`（app.tsx:661）。
5. **375 宽 Composer**：375×812 下 `.composer` 359×144 可见比例 1、`.composer-box` 359×122、输入框 357×78.8、发送按钮 54×28 比例 1（空文本时 disabled）；sidebar 与 inspector `display:none`、矩形 0×0，与 Composer 无相交；`document.scrollingElement.scrollWidth=375=clientWidth`，body 也是 375，无横向滚动；`.timeline` 在此宽度 `display:none`。
6. **表格内部滚动**：注入 14 列 × 4 行 `.msg-table` 后，1180 下 table clientWidth=scrollWidth=819（表格自身不产生溢出），外层 `.msg-table-wrap` clientWidth 496 / scrollWidth 819、`overflow-x:auto`、scrollLeft 可到 323；375 下 wrap 331/819、scrollLeft 488；两档 `.conversation-scroll` 与文档均不溢出（1180：568/568、doc 1180；375：359/359、doc 375）。也就是说横向滚动由 `.msg-table-wrap` 承担，而不是 `table` 自身。

## Console 与 HTTP 计数

- 自检前：console error 0、warning 0、exception 0、HTTP≥400 0（共 40 个请求）。
- 注入自检：`console.error` +1、`console.warn` +1、`fetch('/api/__exit_selftest_404_probe')` 得 404 +1；四类增量 1/1/0/1，说明采集链路对 error、warning、exception（未触发，链路已由 error 覆盖）、HTTP 状态都有效。
- 排除自检后总计仍为 0/0/0/0。

## 分段计时

| 阶段 | 秒 | 来源 |
|---|---|---|
| 前端重建（tailwind 1.13 + esbuild 0.27 + 版本戳 1.23） | 2.63 | `exit-build.json` |
| dist 同步（frontend/dist → backend/internal/webui/dist，三份字节与哈希复验） | 0.01 | `exit-build.json` |
| `go build` | 10.64 | `.tmp/deploy/go-build-exit.txt` |
| 启动 → health 200 | 1.54（listening 日志在 +0.31s） | `serve-exit.log` + 轮询 |
| 走查 1（health/buildId/静态资源） | 0.04 | `exit-8787-http-timing.json` |
| 走查 2（sessions） | 0.002 | 同上 |
| 走查 3（HTTP 部分） | 0.009 | 同上 |
| 走查 3（浏览器部分，CDP） | 2.38 | `exit-8787-dom.json` phases |
| 走查 4（时间轴） | 0.94 | 同上 |
| 走查 5（375 Composer） | 0.65 | 同上 |
| 走查 6（表格，1180 + 375） | 0.42（0.22 + 0.20） | 同上 |
| 截图 | 0.64 | 同上 |
| 注入自检 | 0.62 | 同上 |
| CDP 脚本合计 / 墙钟 | 6.61 / 36.82 | 同上（差值为页面加载与固定等待） |

## 缺陷与观察（只记录，未改）

1. 表格横向滚动的实际承担者是 `.msg-table-wrap`，`table` 自身 `scrollWidth == clientWidth`（819）。若测试 spec 按“`table.scrollWidth > table.clientWidth`”写判据会得到 false；应改为“外层滚动容器可滚且页面/`.conversation-scroll` 不溢出”。属判据口径问题，不是渲染缺陷。
2. 时间轴跳转的平滑滚动让目标在约 0.7–0.9 秒后才进入视口；+200ms 采样时目标仍在视口外。若验收要求“点击后立即可见”，这里不达标，属于可见的响应延迟。
3. 侧栏 `.session-row` 没有 `data-session-id` 一类属性，自动化只能按标题文本定位，可测性偏弱（低优先级）。
4. 首次加载会同时发出 `spec-projection?taskLimit=3` 与 `taskLimit=1` 两个请求（缓存键含 taskLimit），当前无错误，是否需要合并留给会话域 owner 判断。
5. 观测限制：CDP 的 `Network.responseReceived` 在 304 响应上没有给出 ETag 头，服务端 ETag 由 Node `fetch` 直连验证；这条不影响 304 判定本身。
