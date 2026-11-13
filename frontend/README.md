# 司墨前端（frontend/）

> React 19 + TypeScript 5.9（strict）+ Tailwind CSS 4 + esbuild 的新前端壳层；旧 `web/` 已删除，本文是 `frontend/` 的唯一入口索引。
> 当前部署/验收状态以 [`../docs/tasks/STATUS.md`](../docs/tasks/STATUS.md) 为准；视觉唯一基线是 [`../DESIGN.md`](../DESIGN.md)；功能→布局映射见 [`../docs/frontend-feature-map.md`](../docs/frontend-feature-map.md)。

## 1. 快速开始

```bash
cd frontend
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm build            # 输出 dist/（index.html + assets/app.js + assets/app.css，带 build-id）
pnpm dev              # 本地静态服务 + /api、WS 代理；需先 build
```

- `pnpm dev` 读取 `SIMO_API`（默认 `http://127.0.0.1:8877`）代理 `/api` 与 WebSocket；指向正在运行的 simo 后端即可联调。
- `build.mjs` 使用 esbuild + Tailwind CLI，产物在 `dist/`；`dist/` 不入库，由部署/embed 流程消费。
- 当前页面的构建/验收证据见 [`review/REVIEW.md`](review/REVIEW.md) 与 [`../docs/tasks/acceptance.md`](../docs/tasks/acceptance.md)。

## 2. 目录结构

```text
frontend/
├─ index.html                 # 入口 HTML（build 注入 build-id）
├─ build.mjs / dev-server.mjs # 构建 / 本地联调
├─ package.json / tsconfig.json / pnpm-lock.yaml
├─ src/
│  ├─ main.tsx                # React 入口
│  ├─ app.tsx                 # 壳层与页面组装（只组合组件，不写页面 CSS）
│  ├─ api.ts                  # REST/WS 客户端
│  ├─ types.ts                # 共享类型
│  ├─ gallery.tsx             # 组件画廊入口
│  ├─ styles.css              # Tailwind + tokens + 组件样式入口
│  ├─ styles/tokens.css       # 设计 token
│  └─ components/             # 唯一公共组件库
│     ├─ index.ts             # 唯一公共 API
│     ├─ library.tsx          # Icon/Segmented/Sidebar/StatusBar/MessageItem/CardBlock/
│     │                       # Timeline/Composer/ExecutionGroup/RightPanel/WorkbenchChart
│     ├─ components.css       # 唯一组件样式层
│     └─ manifest.json        # 组件/变体/状态/owner 清单
├─ review/                    # 验收记录（REVIEW.md、COMPONENT-LIBRARY.md）与截图
└─ prototype/                 # 冻结的静态原型 v2（只读参考）
```

## 3. 架构与约定

- **壳层布局**：侧栏 264/240 + 顶栏 48 + 上下文条 42 + 状态栏 24（以 `DESIGN.md` 与验收截图为准）；响应式验收宽度 1600/1280/1180/375。
- **单一组件库**：页面只能从 `src/components` 导入；禁止页面内定义组件、复制组件实现或写页面级 CSS；新增组件必须先登记 `components/manifest.json` 并出现在画廊。
- **样式来源**：`src/styles/tokens.css` + `src/components/components.css`；页面零定制 CSS，组件只消费 token；暖纸视觉以根 `DESIGN.md` 为准。
- **数据/流式**：`src/api.ts` 负责 REST 与 `/api/ws`；流式只消费 `reply.delta`（去重 `message.delta` 见 M69–M71 修复），断线自动重连；不本地伪造状态。
- **卡片/时间轴**：M41 消息卡片、Timeline/TimelineTip/TimelineGroups 均在组件库；组件行为与验收见 `../specs/README.md` 的 COMP-* 与 `docs/tasks/acceptance.md`。

## 4. 相关文档

| 文档 | 用途 |
|---|---|
| [`../DESIGN.md`](../DESIGN.md) | 唯一视觉基线（暖纸、无渐变、当前尺寸） |
| [`../docs/frontend-feature-map.md`](../docs/frontend-feature-map.md) | 旧功能 → 新布局映射（M67 重写基线） |
| [`../specs/README.md`](../specs/README.md) | FE-001–FE-008 / COMP-* 规格与状态 |
| [`../docs/tasks/STATUS.md`](../docs/tasks/STATUS.md) | 当前构建、验收、部署、阻塞状态 |
| [`../docs/tasks/acceptance.md`](../docs/tasks/acceptance.md) | 视觉/功能验收证据与签字记录 |
| [`review/REVIEW.md`](review/REVIEW.md) / [`review/COMPONENT-LIBRARY.md`](review/COMPONENT-LIBRARY.md) | F-07 验收记录、组件库收口与卡片修复 |

## 5. 历史资产

- `prototype/`：静态原型 v2，已冻结，只读参考；
- `../archive/prototypes/prototype-v3/`：旧 v3 原型（含 review 截图），已归档；已被当前 React 壳层取代，不要在其上继续开发；
- 旧 `web/` 目录已删除，不要引用旧路径或旧 bundle。
