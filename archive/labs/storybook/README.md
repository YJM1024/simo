# archive/labs/storybook — Storybook 可行性 PoC（非主线依赖）

> M35 旁路 spike：验证 React + Vite 下最小 Storybook 是否适合司墨前端开发预览。
> **本目录是实验目录**，不加入根配置、不被 `web/` 引用、不发布；结论见 [`docs/process/research/storybook-spike.md`](../../../docs/process/research/storybook-spike.md)。

## 内容

- 3 个示例组件：`Button`（4 变体 × 2 尺寸 + disabled/loading）、`StatusDot`（4 状态 + pulse）、`SectionHeader`（标题/副标题/操作区）
- Storybook 10.6.7 + `@storybook/react-vite`，`stories/` 下 13 个 story（覆盖 ≥2 状态）
- `scripts/preview.mjs`：零依赖静态服务器，用于构建产物预览与截图

## 运行（需 Node 24 + pnpm 11）

本机没有全局 pnpm/npm，用运行时自带 pnpm + 本地 `.bin\pnpm.cmd` shim；Windows 深依赖下需 `--node-linker=hoisted`：

```powershell
$node = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$env.PATH = (Split-Path -Parent $node) + ';' + $env.PATH
cd archive\labs\storybook
& $node $pnpm install --node-linker=hoisted --store-dir ..\..\..\toolchain\pnpm-home\store
& $node node_modules\storybook\dist\bin\dispatcher.js build -c .storybook -o storybook-static
& $node node_modules\storybook\dist\bin\dispatcher.js dev -c .storybook -p 6006 --no-open
& $node scripts\preview.mjs 6007 storybook-static     # 静态预览（构建产物）
```

## 实测结果（2026-11-12）

- ✅ 依赖可安装：传递 167 包、node_modules **319.7 MB**、hoisted 安装约 36s；pnpm 默认 symlink 在本机栈溢出，必须 `--node-linker=hoisted`。
- ❌ `storybook build` 失败于 `Error: spawn EPERM`（esbuild 子进程被 **本会话沙箱**拦截）；`storybook dev` 失败于包管理器探测（同样 spawn 受限）。**这是环境限制，不是代码问题**。
- ❌ 因此本机未产出 `storybook-static` 与截图；正常开发机/CI 的验证命令与预期见 [`docs/process/research/storybook-spike.md`](../../../docs/process/research/storybook-spike.md) §6。
- 证据：`.spike/{build.log,dev.log,versions.json}`。

> 结论/建议：Storybook 只作**开发预览**，自研组件画廊保留为**验收门禁**；是否引入见 spike 报告 §8（条件可行，P1 评估）。

## CI（可选、非阻塞）

`.github/workflows/storybook.yml`：仅在 `archive/labs/storybook/**` 或该 workflow 自身变更时触发，运行 `storybook build` 并上传静态站点 artifact；**不跑 dev、不接 Chromatic、不设为 required check、不影响主 CI**。本地未运行原因（无 git 远程权限 + 沙箱 spawn EPERM）见 [`docs/process/research/storybook-spike.md`](../../../docs/process/research/storybook-spike.md) §11。

## 边界

- 不引入 Chromatic 或任何外部服务；
- 不修改 `frontend/`、`backend/`、根 `package.json`/lock；
- 仅用于评估，不作为验收门禁（验收仍以自研组件画廊 + `frontend/review/` 截图 + evals 为准）。
