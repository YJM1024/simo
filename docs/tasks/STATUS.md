# 司墨 · 当前状态

更新时间：2026-11-12
当前阶段：**冻结 build `mwdk1oal-pjkx0` 独立功能验收完成：卡片提交+幂等/重命名/断线/空库通过；交付物打开未验证（无样本）、409 未造出；未部署**

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
| FE-002–005 独立功能验收 | **4/6 全通过，2 项部分/未验证**（2026-11-12，build `mwdk1oal-pjkx0`） | 卡片提交+幂等（409 未造出）、重命名刷新持久、断线重连无重复、空库工作台真实 0/空态/错误态通过；工作台交付物 `/api/deliverables` total=0 空/错误态通过、loading 未捕获；交付物打开无样本未验证；见 `acceptance.md`「FE-002–005 独立功能验收」 |
| Storybook Spike | 条件可行（P1） | `labs/storybook/`；本沙箱 `spawn EPERM` 无法 build，详见 `storybook-spike.md` |

## 进行中

| 任务 | Owner | 说明 |
|---|---|---|
| FE-001 验收签字 | `schema-drafter` | **视觉对齐已签字**（2026-11-12，buildId `mwdctn2y-oumh8`）；FE-001 总签字待真实双击重命名/卡片提交/断线重连补测 |
| FE-002..005 批次 | `memory-researcher` | **功能独立验收已完成**（见已完成表）：卡片幂等/重命名/断线/空库通过；交付物打开无样本未验证、409 未造出；整批签字与部署待 Lead 决定 |
| Storybook P1 | `harness-scout` | 正常环境/CI 跑通 build/preview/screenshot 后再评估 |

## 阻塞 / 未覆盖

- **FE-002–005 功能验收（build `mwdk1oal`）**：卡片提交+幂等通过（409 未造出）、重命名通过、断线重连通过、空库工作台通过（loading 未捕获）；工作台交付物 `/api/deliverables` total=0 空/错误态通过；交付物打开未验证（无样本）；
- **未闭环**：真实用户交付物打开/preview/download（无样本，需 Lead 决定是否造样本）；409 并发未造出；FE-002–005 整批签字与部署待 Lead 决定；
- **无视觉 P0 阻塞**：React 视觉对齐已签字（证据见 `acceptance.md`「React 版视觉对齐 · 返工后复验」）；
- **COMP-timeline-tip 线上已闭环**：8787 已部署 build `mwdfw9t5-lh5d1`，build-id/health 正常，hover/focus/切换/滚动 smoke 通过（tick title 0、console 0、4xx 0）；证据见 `acceptance.md`「COMP-timeline-tip · 8787 线上 smoke」；
- 真实重命名、卡片提交、断线重连已在隔离真实后端验收通过（快照库 + mock 模型，未触碰 8787）；见 `acceptance.md`「FE-002–005 独立功能验收」；
- 真实数据只有 3 条 done 任务、无进行中/未开始样本，右栏展开覆盖不足；
- 旧 Git 提交尚无新前端 commit；需在验收后提交；
- 8787 已部署 build `mwdfw9t5-lh5d1`，但未做正式上线公告。

## 下一步

1. 视觉对齐、COMP-timeline-tip 实机接入与 8787 线上 smoke 均已通过；补测真实重命名/卡片/断线 → FE-001 验收签字；
2. FE-002..005：功能独立验收已通过（卡片幂等/重命名/断线/空库）；如需交付物 preview/download 或 409 再补验；整批签字/部署由 Lead 决定；
3. 更新 `specs/FE-001-frontend-rebuild/evidence.md` 并归档；
4. Git 提交新前端 + 构建产物说明；
5. 启动 Simo SDD 组件 spec（COMP-*）与 SKILL 库；
6. Storybook P1 在正常 CI 环境验证。

## 约束

- 禁止赶工；设计先行；页面零定制 CSS；组件必须先登记画廊；
- Lead 不直接改业务代码，只协调/验收；
- 所有状态变化必须更新本文件。
