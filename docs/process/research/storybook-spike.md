# Storybook Spike 报告（M35 旁路调研）

> 结论：**条件可行，但本沙箱环境不可完成构建/预览/截图验证**。PoC 代码与依赖安装已完成；构建在 `esbuild` 子进程启动处被 DSH 沙箱以 `spawn EPERM` 拦截（与仓库既有"沙箱禁 spawn 管道"限制同源），Storybook 自身的包管理器探测也因 shell spawn 被拦截而失败。正常 Windows 开发机或 GitHub Actions `windows-latest` 预计可跑通（需按 §6 验证清单复核）。
> 日期：2026-11-12。范围：只写 `labs/storybook/` 与本文件；未修改 `frontend/`、`backend/`、根配置、未加主线依赖；未使用 Chromatic/外部服务；未触碰 8899 原型服务。

## 1. 环境

| 项 | 值 |
|---|---|
| OS | Windows（本机，工作区沙箱 `workspace-write`，禁止工作区外写入、禁止子进程管道 spawn） |
| Node | **v24.21.0**（运行时自带：`E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe`） |
| pnpm | **11.28.5**（无全局 pnpm；用运行时 `...\dependencies\pnpm\bin\pnpm.cjs` + 本地 `.bin\pnpm.cmd` shim） |
| Storybook | **10.6.7**（`storybook` + `@storybook/react-vite`） |
| React / Vite / TS | React 19.3.1 / Vite 8.3.8 / TypeScript 7.0.2 |
| 包管理器配置 | 工作区 store（`toolchain/pnpm-home/store`）+ 本地 cache（`labs/storybook/.cache`），未污染全局 |

## 2. PoC 内容（已写入 `labs/storybook/`）

```text
labs/storybook/
├── package.json            # 私有实验包；scripts dev/build/preview
├── pnpm-workspace.yaml     # pnpm 11 的 onlyBuiltDependencies（esbuild）
├── .bin/pnpm.cmd           # 本地 pnpm shim（无全局 pnpm）
├── .storybook/{main.ts,preview.ts}
├── src/styles.css          # 司墨 token 子集（canvas/surface/ink/accent/ok/warn/danger…）
├── src/components/{Button,StatusDot,SectionHeader}.tsx
├── stories/{Button,StatusDot,SectionHeader}.stories.tsx   # 共 12 个 story
├── scripts/preview.mjs     # 零依赖静态服务器（预览构建产物）
├── .spike/{build.log,dev.log,versions.json,debug-storybook-root.log}  # 实测证据
└── README.md
```

组件与状态覆盖：Button（primary/secondary/ghost-sm/danger + disabled/loading）、StatusDot（ok/warn/danger/idle + pulse）、SectionHeader（默认/带副标题/带操作区）。目标是把司墨 `docs/design-system.md` 的 token 与组件形态在 Storybook 里做**开发预览**验证。

## 3. 实测步骤与结果

### 3.1 安装

| 尝试 | 命令要点 | 结果 | 耗时 |
|---|---|---|---|
| 1 | `pnpm install`（默认 isolated symlink） | ❌ `ERR_PNPM_SYMLINK_FAILED [symlinkAllModules] Maximum call stack size exceeded`（Windows 深依赖链 + pnpm 符号链接） | 61.7s |
| 2 | `pnpm install --node-linker=hoisted` | ✅ 依赖落盘（+167 packages），❌ exit 1 `ERR_PNPM_IGNORED_BUILDS: esbuild@0.28.2`（pnpm 11 需显式批准 build script） | 36s |
| 3 | 加 `pnpm-workspace.yaml: onlyBuiltDependencies: [esbuild]` 后重装 | ❌ 仍报 ignored builds（pnpm 11 该配置方式本机未生效；`package.json.pnpm` 字段已提示不再读取）；但 `@esbuild/win32-x64/esbuild.exe` 与 `node_modules/esbuild/bin/esbuild` **均存在**（预编译平台包提供） | 2.7s |
| — | `pnpm list --depth 0` | 直接依赖 **9 个**（react/react-dom + 7 devDeps）；传递包 **+167** | — |

### 3.2 构建（`storybook build`）

```text
$ node node_modules/storybook/dist/bin/dispatcher.js build -c .storybook -o storybook-static
o Building manager..
x Error: spawn EPERM
  at ChildProcess.spawn (node:internal/child_process)
  at ensureServiceIsRunning (node_modules/esbuild/lib/main.js:2272)
  at builder (storybook/dist/_node-chunks/builder-manager-*.js)
— Storybook exited with an error   BUILD_EXIT=1   （约 5.1s 到达失败点）
```

**根因**：esbuild 通过子进程 + 管道与 JS 通信；本会话沙箱禁止程序打开命名管道/spawn 管道（与仓库既有的 esbuild 限制一致），故 `spawn EPERM`。`storybook-static/` 为空（0 文件）。

### 3.3 启动（`storybook dev`）

```text
$ node node_modules/storybook/dist/bin/dispatcher.js dev -c .storybook -p 6006 --no-open --ci
x Error: Unable to find a usable package manager within NPM, PNPM, Yarn and Yarn 2
DEV_EXIT=1
```

`-c` 指定后配置可加载（首次未带 `-c` 时因 cwd 不含 `.storybook` 而报"main.js|ts 位置"错误，已修正）；但 Storybook 通过 shell 探测 pnpm/npm/yarn（spawn 被沙箱拦截）→ 判定"无可用的包管理器"。**即使修好探测，后续仍会撞上 §3.2 的 esbuild EPERM**。

### 3.4 预览 / 截图

- 预览依赖构建产物 `storybook-static/`（当前为空）+ `scripts/preview.mjs`（零依赖静态服务器）→ **未执行成功**；
- 截图计划用本机 Chrome headless：`chrome --headless=new --screenshot=... --window-size=1400,900 --virtual-time-budget=10000 "http://127.0.0.1:6007/?path=/story/components-button--primary"` → **未获得截图**（无页面可截，不伪造）。

## 4. 体积 / 耗时汇总（本机实测）

| 指标 | 值 |
|---|---|
| 直接依赖 / 传递包 | 9 / 167 |
| `node_modules` 体积（hoisted） | **319.7 MB**（12,976 文件，127 个顶层目录） |
| 安装耗时（可用的 hoisted 路径） | 约 **36s**（首次含下载）；重装 2.7s（store 命中） |
| 构建耗时到失败点 | 约 **5.1s**（EPERM 发生在 manager 构建） |
| `storybook-static` | 0（构建失败） |
| 全局污染 | 无（store/cache 均在工作区；Storybook 全局 settings 重定向到 `labs/storybook/.home`） |

## 5. 常见坑（按出现顺序）

1. **本机无全局 pnpm/npm**：必须用运行时 pnpm 的 `bin/pnpm.cjs` 调 `node`；Storybook 会 spawn `node`/`pnpm`，需把 node 目录与本地 `.bin` 加入 PATH。
2. **pnpm 默认 symlink 在 Windows 深依赖下栈溢出**：用 `--node-linker=hoisted`（体积更大但稳定）。
3. **pnpm 11 配置迁移**：`package.json` 的 `pnpm` 字段不再读取（提示移入 `pnpm-workspace.yaml`）；`onlyBuiltDependencies` 本机仍未让 install 退出 0（esbuild 的预编译二进制已存在，构建前需用 `pnpm approve-builds` 或在 CI 里允许）。
4. **`pnpm exec` 会隐式触发 install**：在依赖未完全批准时可能再次报错；直接调 `node node_modules/storybook/dist/bin/dispatcher.js` 更可控。
5. **Storybook 全局 settings**：默认写 `~/.storybook/settings.json`，在"只允许工作区写"的策略下会 EPERM；把 `USERPROFILE`/`HOME` 指向工作区内 `.home` 可绕过（仅限实验）。
6. **`-c <configDir>` 必须显式给**（当 cwd 不是项目根时），否则报 "main.js|ts file is located at" 的配置错误。
7. **沙箱 spawn 限制**：esbuild（Vite 构建核心）与 Storybook 的包管理器探测都依赖子进程管道；sandbox 下必然失败。**这不是 Storybook/司墨代码问题**，需要在正常权限或 CI 中验证。
8. **网络抖动**：npmjs 在本机出现多次 ECONNRESET/慢速重试（安装 61.7s 中有重试），CI 建议镜像/缓存。

## 6. 正常环境验证清单（未在本沙箱完成，供后续执行）

```powershell
# 依赖（Node 24 + pnpm 11；示例为 Windows PowerShell）
$node  = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm  = 'E:\dsh_home\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$env:PATH = (Split-Path -Parent $node) + ';' + $env:PATH
cd labs\storybook
& $node $pnpm install --node-linker=hoisted
& $node $pnpm approve-builds          # 交互批准 esbuild（或 CI 配置 onlyBuiltDependencies）
& $node node_modules\storybook\dist\bin\dispatcher.js build -c .storybook -o storybook-static
& $node node_modules\storybook\dist\bin\dispatcher.js dev -c .storybook -p 6006 --no-open
# 预览 + 截图（需可启动子进程的环境）
& $node scripts\preview.mjs 6007 storybook-static
& 'C:\Program Files\Google\Chrome\Application\chrome.exe' --headless=new --disable-gpu --window-size=1400,900 --virtual-time-budget=10000 --screenshot=screenshots\button-primary.png 'http://127.0.0.1:6007/?path=/story/components-button--primary'
```

预期：`storybook-static/` 有 `index.html + assets`；截图能看到左侧导航与 Button Primary 画布；`storybook dev` 6006 可打开。

## 7. 与自研画廊的职责边界（评估）

| 维度 | Storybook（若引入） | 自研组件画廊（现有） |
|---|---|---|
| 定位 | **开发期**组件隔离预览/文档/交互调试 | **验收门禁**：组件登记、视觉 REVIEW 截图、与 `docs/design-system.md` 单一源绑定 |
| 证据链 | 开发者本地/PR 预览；可选 a11y/交互测试 | 每次改动留 `frontend/review/` 截图 + 检查表，作为验收证据 |
| 业务耦合 | 低（通用 UI 工作台） | 高（司墨 token、组件清单、禁止项、F1–F10 验收） |
| 风险 | 版本/构建链重（本次实测 320MB、esbuild 依赖）；升级迁移成本 | 自研维护成本；功能弱于 Storybook |
| 建议 | **P1 条件引入**，只作开发预览，不进验收门禁 | **保留为验收门禁与唯一组件登记处**，不可被 Storybook 替代 |

**结论**：两者**不是替代关系**。若引入，Storybook = "开发者的组件工作台"，自研画廊 = "验收/证据/规范门禁"；Storybook 的 stories 可以从画廊登记项生成（CSF 兼容），避免双份维护。

## 8. 是否适合后续引入（建议）

- **结论：条件可行（conditional）**。条件：① 引入决策前必须在**允许子进程 spawn 的环境**（开发机或 GitHub Actions `windows-latest`）跑通 §6；② 前端构建链（esbuild 原生包）可用；③ 明确只作开发预览，不替换自研画廊/验收；④ 版本锁定并记录升级成本（本次 320MB node_modules / 167 传递包）。
- **不建议现在就引入主线**：本环境无法验证构建/截图；且司墨当前组件规模与"设计先行 + 画廊 + 截图验收"已覆盖核心需求。
- **若引入**：先做 1 个组件目录试点（Button/StatusDot/SectionHeader 已有 PoC），CI 增加 `storybook build`（不跑 dev），不接入 Chromatic（视觉回归仍用本地 Playwright/截图 + 人工 review）。
- **不做**：把 Storybook 作为唯一组件文档/唯一验收证据；把 dev 服务作为生产依赖；引入 Chromatic 等外部服务。

## 9. 未验证项（诚实标注）

1. 构建/启动/预览/截图在**正常环境**未实测（本沙箱被 spawn EPERM 阻塞）；
2. `pnpm approve-builds` 交互路径未实测（本环境无法完成批准交互；esbuild 预编译二进制已存在，但 install 仍 exit 1）；
3. Storybook 10.6.7 的 a11y/交互测试插件未安装、未验证；
4. 网络/镜像策略未验证（本机出现 ECONNRESET 重试）；
5. 体积/耗时仅代表本机首装；CI 缓存命中后应显著下降（未测）。

## 10. 证据文件

- `labs/storybook/.spike/build.log`：构建失败完整日志（含 `spawn EPERM` 栈）
- `labs/storybook/.spike/dev.log`：dev 失败日志（包管理器探测失败）
- `labs/storybook/.spike/versions.json`：Node/pnpm/Storybook 版本、node_modules 体积/文件数
- `labs/storybook/.spike/debug-storybook-root.log`：Storybook 在仓库根生成的调试日志（已从根移入，避免污染）
