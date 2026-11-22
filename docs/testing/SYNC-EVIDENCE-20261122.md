# SYNC-001 / SYNC-003 真浏览器证据（2026-11-22）

结论：SYNC-001 断线重连与 SYNC-003 跨标签发送模式同步都在真 Chrome（CDP 127.0.0.1:9223，headless）上跑通；「重连中」截图因 headless 无动画未提交新帧，该状态改以页面 DOM 时间戳证明。

## 构建与服务

前端重建走 `.tmp/deploy/final10-build.ps1`：`node node_modules/@tailwindcss/cli/dist/index.mjs -i src/styles.css -o dist/assets/app.css --minify`（5.67s），`node_modules/.pnpm/@esbuild+win32-x64@0.28.2/node_modules/@esbuild/win32-x64/esbuild.exe src/main.tsx --bundle --outfile=dist/assets/app.js`（0.13s），再跑 `.tmp/deploy/stamp-conv6.mjs` 写 buildId 与资源 query。`frontend/dist` 与 `backend/internal/webui/dist` 三个文件 SHA256 两两一致（allMatch true）。
buildId 为 `mwrpos0p-d8dkh`，app.js 317904 字节 `1dd87a82…48ecf`，app.css 80899 字节 `d2110d67…77be4`，index.html 406 字节 `c9b3a7e2…ffdc671`。
二进制 `backend\simo-8787-final10.exe` 22110208 字节，命令 `toolchain\go.ps1 build -o backend\simo-8787-final10.exe ./cmd/simo`（workdir backend，1.85s）。以 `SIMO_HOME=E:\dsh_home\workspaces\agent\data` 后台启动后，`GET /api/health` 返回 `{"ok":true,"ready":true}`，`GET /` 的 `meta[name=build-id]` 为 `mwrpos0p-d8dkh`，与构建一致。

## SYNC-001（两轮重启，取第二轮）

口径：`kill.json.killedAt`（1795345118208）为 `Stop-Process -Force` 杀掉 pid 35056 的时刻；页面用 `Page.addScriptToEvaluateOnNewDocument` 预埋探针，记录 WebSocket 生命周期、`subscribe` 帧与状态栏文案（100ms 采样）。
断开检测 840ms（close 事件），「重连中」出现 272ms，「重新 open」2297ms，回到「已连接」2386ms。
重连 `subscribe` 帧只有 `{type:'subscribe',data:{sessionId:'main'}}`，`since` 缺失而非数字游标；消息数 83→83，去重后仍 83（重复 id 0）；重连后只收到 1 条 `hello` 订阅确认帧（44 字节，`backend/internal/modules/chat/http.go:291`）；console 与页面错误均为 0。第一轮数值几乎相同（839 / 301 / 2286 / 2305）。
强制结束进程会残留 `data\simo.db.lock` 并拒绝启动，处理办法是把锁文件移入工作区内 `.trash/pending-delete/workspaces/agent/data/`，未删除；全局隔离目录在工作区沙箱之外，写入被拒。

## SYNC-003（两标签 A、B）

初始 A、B 均为 `enter`，列表按钮 `aria-pressed=false`，提示为「Enter 发送，Shift+Enter 换行」。点击 A 的 `button.composer-hint-icon` 后，`simo.composer.sendMode.v1` 广播帧在 A 为 1795344981040、B 为 1795344981041，payload 为 `shift-enter`。
B 的 `localStorage['simo.composer.sendMode']` 在 1ms 内变为 `shift-enter`（A→B 传播耗时 1ms），提示文案变为「Enter 换行，Shift+Enter 发送」，`aria-pressed=true`。刷新 B 后仍为 `shift-enter`、文案保持，持久化通过；两侧 console 无 error。测完把 A 切回 `enter`，恢复初始状态。第一轮同样通过，传播耗时 15ms。

## 截图

`sync-001-before-restart.png`、`sync-001-reconnecting.png`、`sync-001-recovered.png`、`sync-003-a-before.png`、`sync-003-a-after-toggle.png`、`sync-003-b-before.png`、`sync-003-b-after-sync.png`、`sync-003-b-after-reload.png`，均在 `docs/testing/`。
未取到：`sync-001-reconnecting.png` 与重启前截图字节完全相同（103541 字节，SHA256 前缀 `34A08890EF2A2807`），说明 headless 在无动画时返回旧帧，截图未能证明「重连中」画面；该状态由 272ms 出现、2386ms 消失的 DOM 时间戳证明。
