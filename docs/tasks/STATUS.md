# 司墨 · 当前状态

更新时间：2026-11-13
当前阶段：**P3 visual gate 按 Lead 裁决转 nightly/warning（不阻断发布）；发布阻断门禁 = check:sdd PASS + 组件 parity 已签（均满足）**

## 仓库/环境

- Git：`main` = `9f998ad`（旧前端删除）；新前端代码尚未提交（本地工作区）；
- 8787：**运行中**，当前 build `mwdqyg05-famq9`（React 版 + 真实后端，real 模型）；**组件 parity 未通过，禁止上线公告/部署**；
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
| 视觉修复（gap/居中） | **已签字通过**（2026-11-13，build `mwdqrape-bp0ko`） | 主会话：卡 gap **9**（375 为 **8**）、margin-bottom 9/8、padding 12·14 未变；timeline trackCenter=scrollCenter **484.06 delta0**（1600/1280/1180），375 hidden；短 track 居中、合成超高 track 从顶可滚；右栏 5 任务 3 done/2 running 全可见；截图 DPR2；未部署 |
| 头像/Composer 修复 | **已签字通过**（2026-11-13，build `mwdqyg05-famq9`） | 头像 28×28，容器/字形 center 差 **0/0**（1600/1280）；Composer textarea padding-left **14px**、文本起点+14；Composer 与卡同 x/w（1600/1280/375），footer/发送按钮正常，console0；375 侧栏隐藏；未部署 |
| Wave 1 缺口修复 | **预检签字通过**（2026-11-13，build `mwds5zb9-ti3mj`，带已知限制） | scroll 四例 376/0/300/376 delta0；`<a download>` 实际落盘 weekly-report.md 101 bytes；Markdown 长代码 pre 1530>614、script/img 0；工作台 loading/error 注入通过；复制失败提示、recent activity、check-sdd PASS；限制：剪贴板成功路径不可验、服务端 header inline 技术债；待部署 |
| 颜色体系（四类标签 + 时间轴三色） | **视觉签字通过**（2026-11-13，build `mwdsan29-0iqp8`） | 四类 bg/ink 精确匹配 #E8ECFB/#2F4BB8、#FBF0DA/#8A5A00、#E2F1E8/#246B4E、#F1F0EC/#5E6068；空→信息咨询、delivery→进度汇报、user0；timeline user/agent 20px、selected 24px rgb(35,42,140)、hover24、祖先opacity .55、375 hidden；无溢出；线上四类 smoke 通过（Lead 补样本）；待部署 |
| P2 任务定位修复 | **交互签字通过**（2026-11-13，build `mwdstatg-rknb3`） | msg-a1/task-seed-done-1 fixture：点击 scroll2206→127、active24→1、msg可见、flash1；Enter 同样定位；交付物 Enter 打开 preview；workbench loading 当前截图，无假0；P2/P3 整体仍待 empty 键盘/P3 CI |
| P3 visual gate 工程能力 | **完成（nightly/warning，非发布阻断）**（2026-11-13，build `mwdsx6vl-4cwln`） | capture:visual/check:visual 已实现并自测（改像素 fail/恢复 pass）；fresh capture 四档夜间 diff 0.038–0.121%/max151，作为 warning；按 Lead 裁决不再要求 fresh full-page 0 diff 签字；发布阻断 = check:sdd PASS + 组件 parity 签（均满足） |
| 分类标签修复 | **已签字通过**（2026-11-13，build `mwdr52zy-uhku9`） | 主会话 1600/1280/375：agent **16/16** 带标签（进度汇报/需求澄清），user 标签 **0**；meta nowrap、clientW=scrollW、无溢出/console0；空 category 回退路径未用样本截图；待部署 |
| 组件级 parity（复验） | **已签字通过**（2026-11-13，build `mwdrj27e-3vsey`） | 1600 timeline x358/gap28、1280 x260/gap8、1180 x248/gap8；1600 msg/card-block padding 未回退；375 message/Composer x8/w359、CardBlock x57/w297、chat-inner12px0、无溢出；topbar gear；见 `component-parity.md` 与合成图；待部署 |
| Storybook Spike | 条件可行（P1） | `labs/storybook/`；本沙箱 `spawn EPERM` 无法 build，详见 `storybook-spike.md` |

## 进行中

| 任务 | Owner | 说明 |
|---|---|---|
| FE-001 验收签字 | `schema-drafter` | **视觉对齐已签字**（2026-11-12，buildId `mwdctn2y-oumh8`）；FE-001 总签字待真实双击重命名/卡片提交/断线重连补测 |
| FE-002..005 批次 | `memory-researcher` | **功能独立验收已完成**（见已完成表）：卡片幂等/重命名/断线/空库通过；交付物打开无样本未验证、409 未造出；整批签字与部署待 Lead 决定 |
| TimelineGroups 组件 | `memory-researcher` | 已完成组件签字并接入 FE-007；FE-007 已验收；部署待 Lead 决定；spec 已由 design-scribe 更新 |
| FE-007 祖先消息 | `memory-researcher`/`schema-drafter` | **视觉+功能已签字通过**（build `mwdnshfe-yu2wp`）：A1–A10 隔离夹具通过；残留 P2：同帧双 click 2 请求（60ms 双击1）、413 为 mock、403 未造出；**未部署** |
| P2 交付物/工作台/右栏验收模板 | `schema-drafter` | **A1–A8 模板已写入 acceptance**：preview/download、工作台 loading/empty/error、右栏任务/概览/交付物；**待前端/后端交付后复验，不签字** |
| Workspace Batch C/D 迁移 | `schema-drafter` | **迁移验收清单已写入 acceptance**：dry-run 零副作用、映射执行、hash/计数、旧数据保留、回滚演练、交付物隔离；Batch C/D 定义以 Lead 确认为准；**待执行，不签字** |
| Storybook P1 | `harness-scout` | 正常环境/CI 跑通 build/preview/screenshot 后再评估 |

## 阻塞 / 未覆盖

- **FE-002–005 功能验收（build `mwdk1oal`）**：卡片提交+幂等通过（409 未造出）、重命名通过、断线重连通过、空库工作台通过（loading 未捕获）；工作台交付物 `/api/deliverables` total=0 空/错误态通过；交付物打开未验证（无样本）；
- **FE-007 祖先消息已签但未部署**：隔离夹具 A1–A10 通过（3→15→45/45 bars/3 groups、空上级推进、归档父可读、413/失败不插入可重试、重复 id 去重、锚定 0.09375px、375 可加载、按钮键盘可操作）；残留 P2：同帧双 click 发2请求（60ms 双击1）、413 为 mock（未造 >50000 实体库）、403 跨用户未造出、按钮文案「显示」vs spec「加载」；未部署；
- **视觉修复（build `mwdqrape`）已签，当前 8787 已为 `mwdqyg05`**：主会话卡 gap9/375 gap8、timeline 短 track 三档居中 delta0、右栏 5 任务可见；超高 track 为合成布局验证（真实主会话30条短track）；
- **头像/Composer（build `mwdqyg05`）已签，当前 8787 已为 `mwdqyg05`**：头像容器/字形 center 差0、textarea padding-left14、Composer 与卡同宽；375侧栏隐藏；
- **组件级 parity 已签字通过（build `mwdrj27e-3vsey`）**：1600/1280/1180 timeline x358/260/248、gap28/8/8；1600 msg/card-block padding 未回退；375 message/Composer x8/w359、CardBlock x57/w297、chat-inner12px0、无溢出；topbar gear。产物 `frontend/review/component-parity/`；**待部署**（8787 仍 wdqyg05）；
- **分类标签（build `mwdr52zy`）已签字通过、待部署**：agent 16/16 标签、user0、meta nowrap；空 category 回退未用空样本截图；parity 门禁已通过，可与 `mwdrj27e` 一起部署；
- **P2 待交付/未复验**：交付物 preview/download、工作台 loading/empty/error、右栏任务/概览/交付物交互；A1–A8 模板见 `acceptance.md`「P2 验收预检模板」；需固定 build+隔离 home+样本后复验；不签字；
- **Workspace Batch C/D 待执行/未签**：dry-run/映射/执行/hash/回滚/交付物隔离清单见 `acceptance.md`「Workspace Batch C/D 迁移验收清单」；Batch C/D 实际定义待 Lead 确认；不得用 work/tasks/_internal/specs 冒充交付物；不签字；
- **Wave 1 缺口修复预检已签字通过（build `mwds5zb9-ti3mj`，带已知限制）**：scroll 四例（首次376/max376、0→0、300→300、99999→376）delta0；`<a download>` 实际落盘 weekly-report.md 101 bytes；Markdown 长代码 pre scrollW1530>614、script/img0；工作台 loading/error 注入通过；复制失败提示、recent activity、check-sdd PASS；**已知限制**：剪贴板成功路径不可验、服务端 `download=1` 仍 inline（UI download 可用）；未部署，8787 仍 `mwdrj27e`；
- **颜色体系（build `mwdsan29-0iqp8`）已签字通过、待部署**：四类标签色/ink 精确匹配；空→信息咨询、delivery→进度汇报、user0；timeline user/agent20、selected24 rgb(35,42,140)、hover24、祖先 .55、375 hidden；无溢出；P2 右栏任务/交付物交互、P3 画廊 CI 门禁未覆盖；
- **8787 线上 smoke（build `mwdsan29`）通过**：Lead 补 requirement/consultation 脱敏样本后四类标签线上全验（progress15/clarification1/requirement1/consultation1，颜色/ink 精确）；timeline user/agent/selected、375 hidden、scroll300、download attachment+落盘101 bytes、console/4xx0 均过；祖先 opacity/空 category 接受隔离证据（线上无样本）；
- **P3 visual gate 转 nightly/warning（Lead 裁决，不阻断发布）**：capture:visual/check:visual 已实现并自测（改像素 fail/恢复 pass）；本机 fresh capture 四档 diff 0.038/0.047/0.051/0.121%、max151，作为 nightly warning；`check` 未串联 capture 列为改进项；不再要求 fresh full-page 0 diff 签字；发布阻断 = check:sdd PASS + 组件 parity 签（均满足）；空态键盘、375 tags/hidden/无溢出、375 任务 N/A、复制成功路径环境限制；
- **未闭环**：真实用户交付物打开/preview/download（无样本，需 Lead 决定是否造样本）；409 并发未造出；FE-002–005 整批签字与部署待 Lead 决定；
- **无视觉 P0 阻塞**：React 视觉对齐已签字（证据见 `acceptance.md`「React 版视觉对齐 · 返工后复验」）；
- **TimelineGroups 组件（build `mwdmvfow`）已签字通过**：R1 组间距 6px、R2 aria 不含分类、R3 点击/Enter 跳转与 active 切换均已复验；FE-007 已接入并验收；**未部署**；祖先 active opacity:1 已按 Lead 确认，spec 已由 design-scribe 更新；
- **build `mwdmisy7` 已签但未部署**：含 1280/1180 时间轴 gutter 修复 + 用户反馈三处；8787 仍为 `mwdfw9t5`；部署与整批签字由 Lead 决定；
- **COMP-timeline-tip 线上已闭环**：8787 已部署 build `mwdfw9t5-lh5d1`，build-id/health 正常，hover/focus/切换/滚动 smoke 通过（tick title 0、console 0、4xx 0）；证据见 `acceptance.md`「COMP-timeline-tip · 8787 线上 smoke」；
- 真实重命名、卡片提交、断线重连已在隔离真实后端验收通过（快照库 + mock 模型，未触碰 8787）；见 `acceptance.md`「FE-002–005 独立功能验收」；
- 真实数据只有 3 条 done 任务、无进行中/未开始样本，右栏展开覆盖不足；
- 旧 Git 提交尚无新前端 commit；需在验收后提交；
- 8787 当前 build `mwdqyg05-famq9`；组件 parity 已通过，**待部署新 build 并做上线公告**。

## 下一步

0. **组件级 parity 已通过（build `mwdrj27e`）**：1600/1280/1180 timeline 与 1600 padding 保持；375 message/Composer x8/w359、CardBlock x57/w297、chat-inner12px0；与分类标签 build 一起部署；
1. 视觉对齐、COMP-timeline-tip 实机接入与 8787 线上 smoke 均已通过；补测真实重命名/卡片/断线 → FE-001 验收签字；
2. FE-002..005：功能独立验收已通过（卡片幂等/重命名/断线/空库）；如需交付物 preview/download 或 409 再补验；整批签字/部署由 Lead 决定；TimelineGroups 已接入 FE-007 并验收；FE-007 已签（隔离夹具 A1–A10），部署待 Lead 决定；视觉修复 gap/居中已签（build `mwdqrape`），头像/Composer 已签（build `mwdqyg05`），分类标签已签（build `mwdr52zy`），组件 parity 已签（build `mwdrj27e`），可一起部署；
3. 更新 `specs/FE-001-frontend-rebuild/evidence.md` 并归档；
4. Git 提交新前端 + 构建产物说明；
5. 启动 Simo SDD 组件 spec（COMP-*）与 SKILL 库；
6. Storybook P1 在正常 CI 环境验证。
7. P2 交付后按 A1–A8 复验（preview/download、工作台三态、右栏交互）；Workspace Batch C/D 按清单执行 dry-run/迁移/hash/回滚/隔离并复验；两者均不预签。
8. Wave1 已签（build `mwds5zb9`），颜色体系已签（build `mwdsan29`），待部署；剪贴板成功路径与服务端 attachment 作为已知限制/技术债记录；P2 右栏/工作台交互、P3 画廊 CI 门禁仍未覆盖；部署由 Lead 决定。
9. P3 visual gate 已按 Lead 裁决转 nightly/warning，不作为发布阻断；工程能力完成；改进项：capture 串联 check/CI、固定动态区域降低夜间噪声；发布阻断门禁 = check:sdd PASS + 组件 parity 签（已满足）；375 任务标 N/A；复制成功路径环境限制。

## 约束

- 禁止赶工；设计先行；页面零定制 CSS；组件必须先登记画廊；
- Lead 不直接改业务代码，只协调/验收；
- 所有状态变化必须更新本文件。
