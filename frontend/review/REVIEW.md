# F-07 React 重构验收记录

> 范围：只改 `frontend/`；未部署 8787，未替换 backend embed。
> 测试后端：`simo-live.exe serve -addr 127.0.0.1:8877 -model mock`，SIMO_HOME 为 `frontend/.tmp/simo-home`（真实 DB 副本）。前端 dev server `127.0.0.1:8898` 代理 `/api`。
> 截图目录：`frontend/review/f07-chat-{1600,1180,375}.png`、`frontend/review/f07-workbench-{1600,1180,375}.png`。

## 1. 工程与构建
- React 19.3.1 + TypeScript 5.9 strict + Tailwind CSS 4.3.5 + esbuild 0.28.2。
- `pnpm typecheck` / `tsc --noEmit`：0 error。
- `pnpm build`：通过，产物 `dist/assets/app.js` + `dist/assets/app.css`。
- 结果：✅

## 2. 设计来源与组件约束
- `src/styles/tokens.css` 自 `prototype/tokens.css` 迁移；`src/styles/components.css` 自 `prototype/components.css` 迁移；`src/components/components.css` 只放组件层增量。
- 页面 `tsx` 无内联 style（扫描结果 0）；无页面级 CSS 文件（`src/pages` 不存在独立 CSS）。
- 新增视觉规则集中在组件层；页面只组合 `Button/Input/Select/Card/Empty/Skeleton/Badge/SessionRow/Message/Timeline/Composer/Overview/TaskGroup/StatusBar` 等组件类。
- 结果：✅

## 3. 对话页壳层
- 264/240 侧栏、48 顶栏、42 上下文条、24 状态栏；1600 实测：sidebar 240、topbar 48、tabs 51、status 24。
- 白色全宽头部：1600 x=240→1300（宽1060）；1180 x=228→900（宽672）；375 宽375。
- 结果：✅

## 4. 会话树
- `GET /api/sessions/tree` 真实渲染主会话 + 研究员 + 工程师（3 行）。
- 点击切换会话实测：active 变为「研究员」，消息区清空并重新请求该会话（真实数据下该会话 0 条）。
- 双击行内重命名实测：输入「研究员-验收重命名」→ `PATCH /api/sessions/{id}` → 树与上下文标题更新；无置顶/归档按钮。
- 结果：✅

## 5. 消息与时间轴
- `GET /api/messages` 真实加载 29 条消息；时间轴 44px gutter、20×4、gap2、垂直居中；用户/智能体/当前态区分。
- 1600 消息正文左缘 494；1180 为 326；375 正文左缘 46（无横向溢出）。
- 结果：✅

## 6. 发送与流式
- WS `/api/ws` 连接状态「已连接」；仅消费 `reply.delta`，断线自动重连。
- 实测发送「F-07 交互验证消息」：消息数 2，用户消息即时回显，agent 收到 mock 流式回复；无重复渲染。
- 结果：✅（流式链路为 mock 后端；真实模型未在本环境验证）

## 7. 卡片提交
- 真实消息卡片渲染 select + 重置/提交；点击提交调用 `POST /api/cards/{id}/actions/{actionId}`。
- 实测「确认测试」卡片：提交前 active，提交后状态 `submitted · v1`，无 card-error；确认按钮禁用。
- 结果：✅

## 8. 右栏分组与交付物
- 四节顺序：目标 → 输入 → 执行会话 → 交付物；任务来自 `GET /api/tasks`，交付物来自 `GET /api/sessions/{id}/artifacts`。
- 三组默认每 3 条；实测已完成 3/3 可见，组标题按钮 `aria-expanded` 切换成功；进行中/未开始当前真实数据为 0/0 显示「暂无」。
- 交付物正常流位于任务后；无 sticky/固定底栏。
- 结果：✅（当前数据只有 done 3 条，未覆盖 >3 展开数据）

## 9. 工作台
- `GET /api/usage` + `GET /api/stats?metric=messages&granularity=day` 真实数据；3 张 card、每日消息 chart、最近活动 3 行。
- 1600/1180/375 均无横向溢出，无 error 文案。
- 结果：✅

## 10. 响应式、错误与约束
- 1600/1180/375 实测 `document.documentElement.scrollWidth === innerWidth`；无横向滚动。
- 控制台 error：0（三档截图脚本监听 Runtime.exceptionThrown + Log.entryAdded）。
- 375 侧栏隐藏、右栏隐藏、时间轴隐藏，输入区可用。
- 已知限制：测试后端为 mock 模型，真实 LLM 流式未验证；跑马灯/卡片提交写入真实 DB 副本；未部署 8787、未同步 backend embed。


## 在线复核修复（滚动 + 分类中文化）
- 首载/切会话：`useLayoutEffect` + 双 `requestAnimationFrame` 设置 `scrollTop=scrollHeight`；实测 1600 首载 `scrollTop=2540/clientH=684/scrollH=3224`，`atBottom=true`；切到「研究员」再回「主会话」均 `atBottom=true`。
- 流式贴底：`stickToBottomRef` 在用户距底 <64px 时保持贴底，用户上滚后不强制拉回。
- 分类：`progress→进度汇报`、`clarification→需求澄清`、`requirement→需求提出`、`consultation→信息咨询`；实测标签均为中文、无原始 key，未知 key 显示「信息」。
- 卡片：确认按钮存在；点击 active 卡片后状态 `submitted · v1`，无错误。
- 三档重测：`scrollWidth == innerWidth`；console error 0。
