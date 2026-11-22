# AC-CONV-008-04 右栏投影 304 真机证据（2026-11-22）

## 结论
**pass。** 四项判据同时成立：304 期间右栏任务条目最小 6（首次 6）、骨架 0 帧、根级空态 0 帧、整栏区块数恒为 4；且主会话 `spec-projection` 响应确为 304（ETag 未变、响应体 0 字节），不是 200 新载荷。

## 环境与实现
8787 服务 build-id `mwre6y3x-cwfir`，`/health` 返回 200；Chrome 157.0.8103.80，CDP `127.0.0.1:9223`，视口 1600×1000，数据目录 `E:\dsh_home\workspaces\agent\data`。
实现依据：`frontend/src/api.ts:300` 按 `sessionId?taskLimit=` 缓存 ETag 与 projection，`:337` 发条件请求，`:344` 先判 304；`frontend/src/app.tsx:434` 用缓存占位，`:445` 304 时保留 projection。

## 首次加载快照
新标签打开 `http://127.0.0.1:8787/`，右栏加载完成：`data-session="main"`；已完成 3/6（3 条）、进行中 0/0（0 条，显示既有空态“暂无进行中任务”）、未开始 3/4（3 条）；任务条目合计 **6**，交付物 1，`.insp-block` **4**，状态“进行中 rev 34”。
首次请求 `GET /api/sessions/main/spec-projection?taskLimit=3` 返回 **200**，`ETag: "spec-c5a2d772dd1d5d88"`。

## 304 请求与响应（CDP Network 域 + 页面 fetch 记录）
触发方式：切到“验收序B”（`sess-38497934b31bfc0a`）再切回“主会话”；右栏先用同键缓存占位。
- 请求：`GET /api/sessions/main/spec-projection?taskLimit=3`，实际请求头 `If-None-Match: "spec-c5a2d772dd1d5d88"`。
- 响应：**304**，`ETag: "spec-c5a2d772dd1d5d88"`，响应体 **0 字节**；304 窗口内该 URL 无 200。
- 为让“304 中”可截，触发前设 350ms 网络延迟，实测请求跨度 359.6ms；条件请求与 304 均为真实浏览器/服务端行为。

## 采样与 DOM 稳定性
观测器装在 `.inspector`/`.insp-body`；统计窗口为请求发出到 304 响应后 300ms。20ms 定时采样 **32** 次：条目数最小 **6**（等于首次 6），低于 6 的帧 **0**；`.state-loading` **0** 帧；根级 `.overview-empty`/`.insp-placeholder`/“暂无会话投影”**0** 帧；`.insp-body` 清空 **0** 次；`.insp-block` 最小 **4**（等于首次 4）。
MutationObserver 窗口内共 **7** 条变更，全部落在切回会话的提交帧（t≈1431.5–1431.6，请求 t=1421.9），为 `data-session` 属性变更及 304 到达前的局部空态节点替换；无 `.insp-body`/`.insp-block` 整体移除，每条变更后条目数均为 6。304 响应到达（t=1781.5）前后无新增变更。

## 截图
- `docs/testing/accept7-before-304.png`：304 前，右栏三组 6 条。
- `docs/testing/accept7-during-304.png`：请求未返回时右栏仍为 6 条；中栏“消息加载中…”属消息请求，不是右栏骨架。
- `docs/testing/accept7-after-304.png`：304 后右栏内容不变。
原始数据：`docs/testing/browser-evidence-20261122/accept7-304-metrics.json`；复现脚本：`docs/testing/browser-evidence-20261122/accept7-304.mjs`。

## 判据核对
| 判据 | 实测 | 结论 |
|---|---|---|
| 条目数不低于首次 | min 6 / first 6，降帧 0 | 成立 |
| 无骨架/空态 | skeleton 0 帧，根级空态 0 帧 | 成立 |
| 无整栏重排 | insp-block 恒 4，无整块移除 | 成立 |
| 响应确为 304 | status 304，ETag 同首次，body 0 | 成立 |

未验证项：本次未展开任务组（`taskLimit=50` 键）的 304；该键与默认键分缓存，需另测才能覆盖展开态不丢。
