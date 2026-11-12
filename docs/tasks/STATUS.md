# 司墨 · 当前状态

更新时间：2026-11-12
当前阶段：**React 前端 F-07 已部署 8787；视觉对齐已签字通过（buildId `mwdctn2y-oumh8`）；剩余真实环境交互补测**

## 仓库/环境

- Git：`main` = `9f998ad`（旧前端删除）；新前端代码尚未提交（本地工作区）；
- 8787：**运行中**，React 版 + 真实后端（real 模型），静态 embed 已替换；
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
| Storybook Spike | 条件可行（P1） | `labs/storybook/`；本沙箱 `spawn EPERM` 无法 build，详见 `storybook-spike.md` |

## 进行中

| 任务 | Owner | 说明 |
|---|---|---|
| FE-001 验收签字 | `schema-drafter` | **视觉对齐已签字**（2026-11-12，buildId `mwdctn2y-oumh8`）；FE-001 总签字待真实双击重命名/卡片提交/断线重连补测 |
| Storybook P1 | `harness-scout` | 正常环境/CI 跑通 build/preview/screenshot 后再评估 |

## 阻塞 / 未覆盖

- **无视觉 P0 阻塞**：上轮 M1/M2 已修复并复验通过（证据见 `acceptance.md`「React 版视觉对齐 · 返工后复验」）；
- 真实后端下的双击重命名、卡片提交、断线重连：前端仅用 mock 验证，待真实环境补测（FE-001 总签字前置）；
- 真实数据只有 3 条 done 任务、无进行中/未开始样本，右栏展开覆盖不足；
- 旧 Git 提交尚无新前端 commit；需在验收后提交；
- 8787 已运行，但未做正式上线公告。

## 下一步

1. 视觉对齐已签字（2026-11-12）；补测真实重命名/卡片/断线，通过后 FE-001 验收签字；
2. 更新 `specs/FE-001-frontend-rebuild/evidence.md` 并归档；
3. Git 提交新前端 + 构建产物说明；
4. 启动 Simo SDD 组件 spec（COMP-*）与 SKILL 库；
5. Storybook P1 在正常 CI 环境验证。

## 约束

- 禁止赶工；设计先行；页面零定制 CSS；组件必须先登记画廊；
- Lead 不直接改业务代码，只协调/验收；
- 所有状态变化必须更新本文件。
