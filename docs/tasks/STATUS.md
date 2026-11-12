# 司墨 · 当前状态

更新时间：2026-11-12
当前阶段：**FE-007 祖先消息视觉+功能已签字通过（build `mwdnshfe-yu2wp`，隔离夹具 A1–A10）；未部署**

## 仓库/环境

- Git：`main` = `9f998ad`（旧前端删除）；新前端代码尚未提交（本地工作区）；
- 8787：**运行中**，已部署 build `mwdfw9t5-lh5d1`（React 版 + 真实后端，real 模型）；TimelineTip 线上 smoke 通过；
- 8899：静态原型（冻结基线，只读参考）；
- 前端 React：已重建（React 19 + TS strict + Tailwind 4 + esbuild）；
- 设计规范：`DESIGN.md`；流程：Simo SDD v0（`docs/process/FRAMEWORK.md`）。

## 已完成（有证据）

| 项 | 状态 | 证据 |
|---|---|---|
| 任务/文档体系 | 已完成 | `docs/tasks/` |
| 调研（产品/前端/后端/测试/组件库/Spec） | 已完成 | `docs/process/research/` 7 份 |
| 框架 v0 | 草案 | `docs/process/FRAMEWORK.md`、`docs/process/component-system.md` |
| FE-001 spec 六件套 | 已完成 | `specs/FE-001-frontend-rebuild/` |
| 静态原型 v2 | 已完成并冻结 | `frontend/prototype/`；A-01–A-08 全过 |
| 组件画廊 | 已完成 | `gallery.html`：左导航 + 右滚动 + scrollspy |
| React 工程 | 已完成 F-07a/b/c | `frontend/src`；tsc 0；build 通过（app.js 248,073 B / app.css 53,039 B） |
| 对话页 | 已部署 | 会话树、双击重命名、时间轴、消息、Composer、右栏四节、卡片、流式 |
| 工作台 | 已部署 | 真实 usage/stats、用量卡、每日消息、最近活动 |
| 真实发送/流式 | 已验证 | 29→31 条；用户消息 + 智能体「收到，F-07 真实验收已确认。」；无 console error |
| 滚动/分类修复 | 已验证 | `atBottom=true`；无 `progress/clarification` 原始 key |
| 三档响应式 | 已验证 | 1600/1180/375 `scrollWidth==innerWidth` |
| React 视觉对齐 | **已签字通过**（2026-11-12，buildId `mwdctn2y-oumh8`） | 上轮 2 类 P0 已复验修复：未定义变量 0、右栏 sections 1315/915、CardBlock 14·16/标题 511·343、375 chip 16；三档无溢出、console 0；见 `acceptance.md`「React 版视觉对齐 · 返工后复验」 |
| message-cards 定稿基线（视觉） | **已签字通过**（2026-11-12，buildId `mwdk1oal-pjkx0`） | 四档卡列/中栏中心差 0（770/930/564/187.5）；卡 x/w 430·680、590·680、264·600、8·359；chip=卡左；Composer dx/dw/dr=0；paper #EFEDE8；白卡 1px/r10/pad12·14/mb9/shadow none；Timeline 1600/1920 显示、1180/375 隐藏；无溢出、console 0；见 `acceptance.md`「message-cards 定稿基线 · 视觉签字」 |
| COMP-timeline-tip（实机接入 + 线上） | **已签字通过 + 线上闭环**（2026-11-12，buildId `mwdfw9t5-lh5d1`） | 8787 线上：build-id/health 正常；36 ticks、tick title 0；hover 第 4 tick tooltip 236×75「你·主会话·22:44/怎么重复生成句子？」；focus/切换/Esc/滚动 smoke 通过；console 0、4xx 0；见 `acceptance.md`「COMP-timeline-tip · 8787 线上 smoke」 |
| FE-002–005 独立功能验收 | **4/6 全通过，2 项部分/未验证**（2026-11-12，build 快照库隔离实例） | 卡片提交+幂等（409 未造出）、重命名刷新持久、断线重连无重复、空库工作台真实 0/空态/错误态通过；工作台交付物 `/api/deliverables` total=0 空/错误态通过、loading 未捕获；交付物打开无样本未验证；见 `acceptance.md`「FE-002–005 独立功能验收」 |
| 用户反馈三处修复 | **已签字通过**（2026-11-12，buildId `mwdmbz6k-vd4lp`） | 右栏状态间距（1600 B/SPAN/EM 1315/1360.84/1500.14；1280 995/1040.84/1180.14；1180 915/960.84/1080.14）；Composer/卡四档 dx/dw/dr=0 且 scrollbarWidth none；Timeline 1600/1280/1180 flex（358/204/192，w44）、375 none；无溢出、console 0；见 `acceptance.md`「用户反馈三处修复 · 视觉签字」 |
| 1280/1180 时间轴可见性 | **已签字通过**（2026-11-12，buildId `mwdmisy7-z4cbf`） | 1280 timeline 260/44/304、卡312/596、gap8；1180 248/44/292、卡300/528、gap8；1600 378/44/422、卡430/680；bars30、insideCol、elementFromPoint 命中、不越 sidebar；中心 770/610/564/187.5 delta0；无溢出、console0；见 `acceptance.md`「1280/1180 时间轴可见性修复 · 视觉签字」 |
| TimelineGroups 组件 | **已签字通过**（2026-11-12，buildId `mwdmvfow-9d8pn`） | R1 组间距 6px；R2 aria 不含分类、仅 Tooltip；R3 点击/Enter onJump 与 aria-current 切换已验证；active 24/普通20×4/gap2、rail44、祖先 .55（active 覆盖按 Lead 确认）；画廊/manifest/App 旧 Timeline；见 `acceptance.md`「TimelineGroups 返工后复验」 |
| FE-007 祖先消息 | **视觉+功能签字通过**（2026-11-12，build `mwdnshfe-yu2wp`） | 隔离夹具 A1–A10：3→15→45 条/45 bars/3 groups、到根按钮消失；空上级推进、归档父可读、413/失败不插入可重试、重复 id 去重、锚定差 **0.09375px**、375 可加载；见 `acceptance.md`「FE-007 实机验收结果」；未部署 |
| Storybook Spike | 条件可行（P1） | `labs/storybook/`；本沙箱 `spawn EPERM` 无法 build，详见 `storybook-spike.md` |

## 进行中

| 任务 | Owner | 说明 |
|---|---|---|
| FE-001 验收签字 | `schema-drafter` | **视觉对齐已签字**（2026-11-12，buildId `mwdctn2y-oumh8`）；FE-001 总签字待真实双击重命名/卡片提交/断线重连补测 |
| FE-002..005 批次 | `memory-researcher` | **功能独立验收已完成**（见已完成表）：卡片幂等/重命名/断线/空库通过；交付物打开无样本未验证、409 未造出；整批签字与部署待 Lead 决定 |
| TimelineGroups 组件 | `memory-researcher` | 已完成组件签字并接入 FE-007；FE-007 已验收；部署待 Lead 决定；spec 已由 design-scribe 更新 |
| FE-007 祖先消息 | `memory-researcher`/`schema-drafter` | **视觉+功能已签字通过**（build `mwdnshfe-yu2wp`）：A1–A10 隔离夹具通过；残留 P2：同帧双 click 2 请求（60ms 双击1）、413 为 mock、403 未造出；**未部署** |
| Storybook P1 | `harness-scout` | 正常环境/CI 跑通 build/preview/screenshot 后再评估 |

## 阻塞 / 未覆盖

- **FE-002–005 功能验收（build `mwdk1oal`）**：卡片提交+幂等通过（409 未造出）、重命名通过、断线重连通过、空库工作台通过（loading 未捕获）；工作台交付物 `/api/deliverables` total=0 空/错误态通过；交付物打开未验证（无样本）；
- **FE-007 祖先消息已签但未部署**：隔离夹具 A1–A10 通过（3→15→45/45 bars/3 groups、空上级推进、归档父可读、413/失败不插入可重试、重复 id 去重、锚定 0.09375px、375 可加载、按钮键盘可操作）；残留 P2：同帧双 click 发2请求（60ms 双击1）、413 为 mock（未造 >50000 实体库）、403 跨用户未造出、按钮文案「显示」vs spec「加载」；未部署；
- **未闭环**：真实用户交付物打开/preview/download（无样本，需 Lead 决定是否造样本）；409 并发未造出；FE-002–005 整批签字与部署待 Lead 决定；
- **无视觉 P0 阻塞**：React 视觉对齐已签字（证据见 `acceptance.md`「React 版视觉对齐 · 返工后复验」）；
- **TimelineGroups 组件（build `mwdmvfow`）已签字通过**：R1 组间距 6px、R2 aria 不含分类、R3 点击/Enter 跳转与 active 切换均已复验；FE-007 已接入并验收；**未部署**；祖先 active opacity:1 已按 Lead 确认，spec 已由 design-scribe 更新；
- **build `mwdmisy7` 已签但未部署**：含 1280/1180 时间轴 gutter 修复 + 用户反馈三处；8787 仍为 `mwdfw9t5`；部署与整批签字由 Lead 决定；
- **COMP-timeline-tip 线上已闭环**：8787 已部署 build `mwdfw9t5-lh5d1`，build-id/health 正常，hover/focus/切换/滚动 smoke 通过（tick title 0、console 0、4xx 0）；证据见 `acceptance.md`「COMP-timeline-tip · 8787 线上 smoke」；
- 真实重命名、卡片提交、断线重连已在隔离真实后端验收通过（快照库 + mock 模型，未触碰 8787）；见 `acceptance.md`「FE-002–005 独立功能验收」；
- 真实数据只有 3 条 done 任务、无进行中/未开始样本，右栏展开覆盖不足；
- 旧 Git 提交尚无新前端 commit；需在验收后提交；
- 8787 已部署 build `mwdfw9t5-lh5d1`，但未做正式上线公告。

## 下一步

1. 视觉对齐、COMP-timeline-tip 实机接入与 8787 线上 smoke 均已通过；补测真实重命名/卡片/断线 → FE-001 验收签字；
2. FE-002..005：功能独立验收已通过（卡片幂等/重命名/断线/空库）；如需交付物 preview/download 或 409 再补验；整批签字/部署由 Lead 决定；TimelineGroups 已接入 FE-007 并验收；FE-007 已签（隔离夹具 A1–A10），部署待 Lead 决定；
3. 更新 `specs/FE-001-frontend-rebuild/evidence.md` 并归档；
4. Git 提交新前端 + 构建产物说明；
5. 启动 Simo SDD 组件 spec（COMP-*）与 SKILL 库；
6. Storybook P1 在正常 CI 环境验证。

## 约束

- 禁止赶工；设计先行；页面零定制 CSS；组件必须先登记画廊；
- Lead 不直接改业务代码，只协调/验收；
- 所有状态变化必须更新本文件。
