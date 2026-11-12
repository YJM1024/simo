# FE-001 · 任务

> 每个任务必须有 owner、写作用域、依赖、验收；完成需证据。

## 阶段 F-07a：工程与组件基座

| ID | 任务 | Owner | 写作用域 | 依赖 | 验收 |
|---|---|---|---|---|---|
| T1 | 初始化 React + TS + Tailwind + esbuild；tsc/build 跑通 | 前端 | `frontend/` | 无 | tsc 0、build 通过 |
| T2 | 迁移 tokens.css/components.css；建立样式入口 | 前端 | `frontend/src/styles` | T1 | token 变量、无内联样式 |
| T3 | 基础组件：Button/Input/Select/Tabs/Badge/Card/Empty/Skeleton/Toast/Dialog | 前端 | `frontend/src/components` | T2 | 各状态与原型一致 |
| T4 | 业务组件：SessionRow/Message/Timeline/Composer/CardBlock/OverviewPanel | 前端 | `frontend/src/components` | T3 | 状态齐全、可交互 |
| T5 | AppShell：侧栏/顶栏/segmented/全局状态栏 | 前端 | `frontend/src` | T3 | 1600/1180/375 截图对齐 |
| T6 | 组件画廊 React 版：左导航 + 右滚动 + scrollspy | 前端 | `frontend/src/pages/Gallery` | T4 | 14 小节、无溢出 |

## 阶段 F-07b：对话页

| ID | 任务 | Owner | 依赖 | 验收 |
|---|---|---|---|---|
| T7 | 会话树加载/选中/新建草稿 | 前端 | T5 | 切换正确、草稿不落库 |
| T8 | 消息加载/发送/流式/失败/重连 | 前端 | T5 | 无重复、断线恢复 |
| T9 | 双击行内重命名（Enter/Esc/失焦） | 前端 | T7 | 保存/取消/错误提示 |
| T10 | 时间轴：点击/键盘/hover/当前 | 前端 | T4 | A8 通过 |
| T11 | 卡片：表单/确认/提交/兜底回执 | 前端 | T4 | 卡片可提交、有回执 |
| T12 | 右栏四节 + 三组 3/展开 + 交付物正常流 | 前端 | T4 | 数量/排序/滚动正确 |
| T13 | 视觉对齐与三档响应式 | 前端 | T7–T12 | 无溢出/裁切；与原型一致 |

## 阶段 F-07c：工作台

| ID | 任务 | Owner | 依赖 | 验收 |
|---|---|---|---|---|
| T14 | 用量卡/图表/最近活动接真实 API | 前端 | T5 | 数据真实、空/错误态 |
| T15 | 工作台与对话页共享外壳 | 前端 | T5 | 切换不跳布局 |

## 阶段 F-07d：验收与交付

| ID | 任务 | Owner | 依赖 | 验收 |
|---|---|---|---|---|
| T16 | tsc/build/无 console error | 前端 | T1–T15 | 证据 |
| T17 | 1600/1180/375 截图 + REVIEW.md | 前端 | T13–T15 | 10 条检查表 |
| T18 | 验收 A1–A12 | 验收 | T16–T17 | 全部通过 |
| T19 | 构建 embed、启动 8787、真实数据验证 | Lead | T18 | 健康 200、页面可用 |
| T20 | 回滚方案与 commit 记录 | Lead | T19 | 可回滚 |

## 阻塞与依赖

- T1 依赖可用 pnpm/node；当前 runtime pnpm 可用；
- 调研框架（`docs/process/`）不影响 FE-001 执行，但 spec 模板可能回填；
- 后端 placeholder embed 不参与前端验收；
- T19 只在 T18 通过后执行。

## 状态

- 所有任务 `待办`；T1 可立即开始。
