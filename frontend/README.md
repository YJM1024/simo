# simo frontend

司墨（simo）的 Web 前端。React 19 + TypeScript strict + Tailwind CSS 4（CSS-first tokens）+ esbuild，无第三方 UI/Markdown/图表/路由库。

## 目录结构

```
frontend/
├── src/
│   ├── app/                 # 壳层：TopBar、TopTabs、布局、通知宿主
│   ├── platform/            # 共享平台层：HTTP/WS、事件总线、UI 组件、主题、类型
│   └── features/            # 业务 feature（chat/tasks/sessions/agents/team/memory/
│                            #   schedules/workbench/views）；只能依赖 platform
├── scripts/                 # check-*.mjs 门禁（模块度/里程碑/视觉规范）
├── public/                  # index.html、icon.svg、icon-256.png
├── build.mjs                # tsc → Tailwind → esbuild，并复制到 embed
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## 常用命令

```bash
cd frontend
pnpm install                 # 安装依赖（Node 20+，pnpm 10）
pnpm build                   # 类型检查 + 构建，产物 frontend/dist，并复制 embed
pnpm typecheck               # 仅 tsc --noEmit
pnpm check                   # 全部门禁（模块度 + M2–M64 + tsc）
node scripts/check-m52.mjs   # 单跑某个门禁
```

## 构建产物

- **开发/部署源**：`frontend/dist/{app.js,app.css,index.html,icon.svg,icon-256.png}`
- **Go embed**：`frontend/build.mjs` 最后复制到 `backend/internal/webui/dist/`（保留 `embed.FS` 机制）
- 构建脚本不修改后端源码；只需在部署步骤使用 embed 目录。

## 给外部优化时优先看

- 设计令牌/全局样式：`src/styles.css`
- 布局与顶栏：`src/app/App.tsx`、`TopBar.tsx`、`TopTabs.tsx`
- 对话/输入区/消息：`src/features/chat/ChatCenter.tsx`、`Composer.tsx`、`MessageList.tsx`、`HistoryRail.tsx`
- 共享 UI：`src/platform/ui/*`
- 视觉规范：仓库 `docs/design-system.md`
- 模块边界：`scripts/check-modularity.mjs`（禁止跨 feature import）

## 视觉风格（M63 原型：暖白纸感浅色科技风）

- 画布 `#FBFAF7`、墨色 `#17181C`、靛蓝 `#4A4AF0`、青绿 `#10A99A`；暖灰分线 `#E8E7E1`。
- 字体 Segoe UI Variable / Georgia 展示标题 / Consolas；正文 14px、字距 -0.004em。
- 圆角 5/7/10/14；轻纸感阴影；主按钮黑底白字。
- 壳层：264 左栏（品牌/工作区/搜索/会话/状态/用户）+ 单行顶栏 + 42px 上下文条 +
  780px 聊天列 + 右栏 Inspector（任务/概览、进度环、清单、时间线、固定/收起）。
- 消息：24px 方块 monogram，`margin-top:-2px` 与 20px 元信息行中心对齐。
- 交互沿用：默认仅本会话、无系统消息、路由静默、切换会话瞬时贴底。
- 细节规范见仓库 `docs/design-system.md`。

## 约定

- 会话范围默认「仅本会话」；用户主动切换「含子会话」后记住选择（localStorage `simo.includeChildren`）。
- 只改 `frontend/`；不直接改 `backend/` 的嵌入产物，由 build 复制完成。
- 颜色只用 `src/styles.css` 语义 token；不引入任意 HTML/内联样式/第三方视觉库。
- 状态/错误/空态统一走 `platform/FeedbackPane` 与 `platform/ui`。
