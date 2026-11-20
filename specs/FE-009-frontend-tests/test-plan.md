# FE-009 · 前端测试计划（Test Plan）

> 状态：**设计完成；未执行**。当前已出现首批组件测试文件，但没有 `test:*` scripts、没有覆盖率报告、没有 Playwright，也没有 CI 接入；本文件不把“文件存在”当“测试通过”。所有状态以实际执行报告为准。
>
> 上游：[`spec.md`](spec.md)；模板：[`docs/process/templates/test-plan.md`](../../docs/process/templates/test-plan.md)；门禁：[`docs/process/SCENARIOS.md`](../../docs/process/SCENARIOS.md)。

## 1. 风险清单

| 风险 | 影响 | 覆盖方式 | 主要用例 |
|---|---|---|---|
| 发送 / 输入法边界出错 | 误发、漏发、内容丢失 | Enter / Shift / Ctrl / IME / 失败恢复 / 重复提交 | CT-COMPOSER-002..008、IT-COMPOSER-001 |
| 消息渲染 / 流式错位 | 重复消息、文本错序、失败不可见 | 角色 / 分类 / Markdown / 流式 / 失败 / 去重 | CT-MSG-001..004、IT-CHAT-004 |
| 会话切换 / 祖先链残留 | 串会话、旧数据覆盖新数据、时间轴分组错误 | 切换重置、祖先加载、根会话、失败重试 | IT-SIDEBAR-001、IT-ANCESTOR-001/002、CT-TIMELINE-001 |
| 卡片只读 / 重试 / 幂等 | 归档会话仍可提交、重复提交、失败丢输入 | 只读禁用、失败重试、忙碌态、取消 | CT-CARD-001..004、IT-CARD-001 |
| 时间轴可点 / 可读 | 点不中、跳错、键盘不可用、提示遮挡 | 32px 目标、排序、active、hover/focus、Escape、edge clamp | CT-TIMELINE-001..007、E2E-TIMELINE-001 |
| 空 / 加载 / 错误被伪装 | 假 0、空屏、无重试、旧数据闪回 | 三态、无假数据、重试请求断言 | CT-SIDEBAR-007、CT-OVERVIEW-001、CT-METRICS-002/003、IT-STATE-001 |
| 指标口径 / 缺埋点 | 假完成率、0% 误报、7/30 混用 | 分母 0、partial/missing、窗口切换 | CT-METRICS-001..004、IT-METRICS-001 |
| 真实浏览器 / 跨标签 | jsdom 证明不了布局、滚动、BroadcastChannel | E2E 双标签、375、console、资源 | E2E-TABS-001/002、E2E-RESP-001、E2E-QUALITY-001 |
| 测试自身失真 | 空断言、只快照、跳过、重试掩盖、覆盖数字造假 | 无跳过门禁、关键决策清单、patch 覆盖 | GATE-COV-001、GATE-NOSKIP-001、GATE-TRACE-001 |
| 测试数据污染 | 写入真实 home、端口冲突、不可重复 | 临时 home / 端口、fixture、固定时钟 / 时区 | IT-ISOLATION-001、E2E-ISOLATION-001 |

## 2. 用例 ID 与分层

| 前缀 | 层 | 位置（目标） | 执行 |
|---|---|---|---|
| `UT-` | L1 单元 | `frontend/src/test/unit/**/*.test.ts` | `pnpm --dir frontend test:unit` |
| `CT-` | L2 组件 | `frontend/src/components/**/*.test.tsx` | `pnpm --dir frontend test:component` |
| `IT-` | L3 集成 | `frontend/src/test/integration/**/*.test.tsx` | `pnpm --dir frontend test:integration` |
| `E2E-` | L4 端到端 | `frontend/e2e/**/*.spec.ts` | `pnpm --dir frontend test:e2e` |
| `GATE-` | 门禁检查 | 脚本 / CI | 随 CI 或手工检查 |

规则：

1. 每个测试标题或文件头写 `CASE: <ID>`，报告能把结果反查回本计划。
2. 断言优先使用可访问名（`getByRole` / `getByLabelText`），不用 CSS 类名；CSS 只用于测试“样式契约”（如 ancestor 透明度、mobile hide），不用于核心行为。
3. 一个用例只验证一个行为边界；不要在一个 `it` 里堆 10 个不相关断言。
4. 所有失败、未跑、待实现都保留状态，不因“后续会修”改成通过。

## 3. 功能 → 用例矩阵

| 功能点 | 用例 ID | 覆盖的 A |
|---|---|---|
| F01 应用壳 / 导航 | CT-SEG-001、IT-SHELL-001、IT-SHELL-002、E2E-SHELL-001 | A1、A5、A6、A15 |
| F02 侧栏 / 会话树 / 搜索 / 归档 | CT-SIDEBAR-001..009、IT-SIDEBAR-001、IT-SIDEBAR-002、E2E-SIDEBAR-001 | A1、A2、A3、A4、A5、A6 |
| F03 消息渲染 / 卡片 | CT-MSG-001..004、CT-CARD-001..004、IT-CHAT-001..004、IT-CARD-001、E2E-CHAT-001 | A1、A3、A4、A5、A13 |
| F04 Composer 输入 / 发送 | CT-COMPOSER-001..010、IT-COMPOSER-001、E2E-CHAT-001 | A1、A2、A3、A5、A6 |
| F05 时间轴 / 提示 | UT-FMT-003、UT-FMT-004、CT-TIMELINE-001..007、IT-TIMELINE-001、E2E-TIMELINE-001 | A1、A2、A3、A6、A7 |
| F06 祖先消息加载 | IT-ANCESTOR-001、IT-ANCESTOR-002、E2E-ANCESTOR-001 | A1、A3、A4、A5 |
| F07 右栏概览 | CT-OVERVIEW-001..003、IT-OVERVIEW-001、E2E-OVERVIEW-001 | A1、A3、A4、A5、A13 |
| F08 工作台指标 | UT-FMT-001、UT-FMT-002、CT-METRICS-001..004、IT-METRICS-001、E2E-METRICS-001 | A1、A2、A3、A4、A5 |
| F09 交付物 | CT-DELIVERABLE-001、IT-DELIVERABLE-001、E2E-DELIVERABLE-001 | A1、A3、A4 |
| F10 多标签同步 | E2E-TABS-001、E2E-TABS-002 | A1、A7、A12 |
| F11 空 / 加载 / 错误 / 首启 | CT-STATE-001、IT-STATE-001、E2E-EMPTY-001 | A3、A4、A5、A13 |
| F12 键盘 / 可访问性 | CT-A11Y-001、E2E-A11Y-001 | A6、A7、A13 |
| F13 响应式 / 375 | CT-TIMELINE-007、E2E-RESP-001 | A2、A7、A9 |
| F14 运行质量 / console | IT-QUALITY-001、E2E-QUALITY-001 | A8、A15 |
| F15 测试数据隔离 | IT-ISOLATION-001、E2E-ISOLATION-001 | A12、A15 |
| 工程门禁 | GATE-COV-001、GATE-NOSKIP-001、GATE-CI-001、GATE-TRACE-001、GATE-RELEASE-001 | A9..A15 |

> F10 不设 L1–L3：jsdom 的 `BroadcastChannel` stub 不能证明真实跨标签；跨标签只由 L4 判定。

## 4. A → 用例 / 证据

| A | 用例 | 通过判据 | 证据 | 当前状态 |
|---|---|---|---|---|
| **A1** 正常主路径 | IT-SHELL-001、IT-CHAT-001、IT-COMPOSER-001、E2E-SHELL-001、E2E-CHAT-001 | 启动→选会话→发送→流式完成→卡片/右栏/工作台可见；无错误态 | 命令 + 报告 + E2E trace | 未跑 |
| **A2** 边界值 | UT-FMT-001..004、CT-COMPOSER-010、CT-TIMELINE-001、E2E-RESP-001 | 0/999/1000/9999/10000/12345 tokens；0/1/多条消息；超长文本；375；32px 目标 | 覆盖率报告 + layout JSON + 截图 | 未跑 |
| **A3** 错误路径 | CT-SIDEBAR-007、CT-COMPOSER-006、CT-CARD-002、CT-METRICS-002、IT-SIDEBAR-002、IT-CHAT-003、IT-ANCESTOR-002 | 每类失败有可读错误 + 重试；请求次数 / 状态正确；无假空 / 假 0 | 请求日志 + 断言报告 | 未跑 |
| **A4** 空状态 | CT-SIDEBAR-007、CT-TIMELINE-002、CT-OVERVIEW-001、CT-METRICS-002、IT-CHAT-002、IT-STATE-001、E2E-EMPTY-001 | 无会话/消息/任务/交付物/指标/祖先有明确空态；不显示 0/示例 | DOM + 截图 | 未跑 |
| **A5** 加载状态 | CT-SIDEBAR-007、CT-OVERVIEW-001、CT-METRICS-002、IT-CHAT-001、E2E-SHELL-001 | loading/status 可见；加载中禁重复提交；完成后不闪回旧数据 | 时序断言 + 报告 | 未跑 |
| **A6** 键盘 | CT-COMPOSER-002..005、CT-SIDEBAR-002/003、CT-TIMELINE-004/006、E2E-A11Y-001 | Enter/Shift/Ctrl/IME；Tab / Escape / 方向键；焦点可见、无陷阱 | 键盘操作记录 + DOM 断言 | 未跑 |
| **A7** 375 / 响应式 | CT-TIMELINE-007、E2E-RESP-001 | 375×812 无横向溢出；导航/主体/右栏可达；目标 ≥32×32；1180/1600 不破版 | 375 截图 + layout JSON | 未跑 |
| **A8** console / 资源 | IT-QUALITY-001、E2E-QUALITY-001 | console.error 0、pageerror 0、未处理 rejection 0、关键资源 404 0 | console/network JSON | 未跑 |
| **A9** 覆盖率 | GATE-COV-001 | patch 85/85/75/80；核心纯逻辑 100/100 + ≥90 branches；关键决策 100%；组件库 80/80/70/75 | coverage-summary + 排除清单 | 未跑 |
| **A10** 无跳过 | GATE-NOSKIP-001 | 0 skip/todo/only；无空断言；无 passWithNoTests；跳过有 owner/到期 | 扫描日志 + 报告 | 未跑 |
| **A11** 分层与 CI | GATE-CI-001 | L1–L4 脚本可分别执行；test:ci 进 CI；E2E smoke 有 job；F01–F15 有映射 | CI 日志 + 脚本清单 | 未实现 |
| **A12** 数据隔离 | IT-ISOLATION-001、E2E-ISOLATION-001 | 无真实网络/模型/用户数据；固定 TZ/时钟/ID；临时 home/端口；连续两次一致 | 两次运行报告 + 环境日志 | 未跑 |
| **A13** 可访问性 | CT-A11Y-001、E2E-A11Y-001 | 名称/角色/landmark/表格/提示语义；错误 alert、加载 status；焦点不丢；颜色非唯一 | DOM / axe（可选） | 未跑 |
| **A14** 证据 / 追溯 | GATE-TRACE-001 | R/F/A 均能追到 CASE-ID 与证据路径；含命令/退出码/报告/构建标识 | 映射表 + 证据索引 | 未实现 |
| **A15** 门禁 / 回归 | GATE-RELEASE-001 | 干净检出 Blocking 套件通过；失败/跳过/覆盖不足会阻断；旧 spec 与 parity 不回归 | CI 失败样例 + release 记录 | 未实现 |

## 5. 用例明细

### 5.1 L1 单元（UT）

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **UT-FMT-001** | F08 token 展示：小值 / 千位边界 | 调用 `formatTokens(0/999/1000/9999/10000/12345)` | 依次精确返回 `0 / 999 / 1.0k / 10.0k / 10.0k / 12.3k`；不出现 `undefined` / `NaN` | 固定整数，无 mock | Blocking |
| **UT-FMT-002** | F08 token 展示：大值 / 四舍五入 | 调用 `formatTokens(1234567)`、`(999.6)` | `1234.6k`；`999.6` 四舍五入为 `1000`；不抛异常 | 固定数值 | Blocking |
| **UT-FMT-003** | F05 时间标签：固定时区 | 固定 `TZ=Asia/Shanghai`，调用 `formatTime(Date.UTC(2026,10,20,2,3))` | 返回 `10:03`；两位小时 / 分钟；不随本机时区变化 | 固定时间戳；`vi.setSystemTime` | Blocking |
| **UT-FMT-004** | F05 日期标签：午夜边界 | 固定 `TZ=Asia/Shanghai`，调用 `formatDate(Date.UTC(2026,10,19,16,0))` 与 `formatTime` 同值 | 日期为 `11/20`、时间为 `00:00`；跨日不偏移 | 固定时间戳 | Blocking |

> `format*` 的 L1 依赖 `TZ=Asia/Shanghai`；当前 `setup.ts` 未固定时区，实现任务必须补，否则断言不稳定。

### 5.2 L2 组件（CT）

#### 5.2.1 导航、侧栏

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **CT-SEG-001** | F01 对话 / 工作台切换 | 渲染 `Segmented value=chat`，点击“工作台”，再点击“对话” | `onChange` 分别收到 `workbench` / `chat`；当前项有 `is-active`；nav 有可访问名“页面” | `onChange=vi.fn()` | Blocking |
| **CT-SIDEBAR-001** | F02 会话树 / 连接 / 配额 | 渲染 2 个根会话 + 1 个子会话，active 为第一个 | 树最多两层；active 行有 `is-active`；连接文案“本地环境”；`usageTotal` 格式化；`sessionCount/messageCount` 显示 | `fixtures.session()` 覆盖 children | Blocking |
| **CT-SIDEBAR-002** | F02 选中：点击 / Enter | 点击第二个会话；聚焦第一个行按 Enter | `onSelect` 收到对应 id；行可聚焦；不因操作按钮触发选择 | `onSelect=vi.fn()` | Blocking |
| **CT-SIDEBAR-003** | F02 重命名：进入 / 提交 / 取消 | 双击行；输入新标题后 Enter；再双击后 Escape；再双击后失焦 | Enter / blur 调用 `onRename(id, trimmed)`；Escape 不调用；空标题不提交；输入框带“重命名会话” | `onRename=vi.fn().mockResolvedValue()` | Blocking |
| **CT-SIDEBAR-004** | F02 归档 / 恢复 | 打开“会话操作”，点击“归档”；切换“显示归档”；点击“恢复” | 默认隐藏 archived；显示归档后可见；`onArchive(id,true/false)` 正确；菜单关闭 | 归档 / 未归档 fixtures | Blocking |
| **CT-SIDEBAR-005** | F02 客户端搜索 | 在“搜索会话”输入标题片段；输入不存在词 | 匹配根 / 子会话保留；无匹配显示“没有匹配的会话”；清空恢复全部 | 固定标题 | Blocking |
| **CT-SIDEBAR-006** | F02 服务端搜索 | `searchIds` 含一个标题不匹配的会话；`searching=true` | 该会话被保留；显示“搜索中…”；不清空已有结果 | `Set(['m2'])` | Blocking |
| **CT-SIDEBAR-007** | F02 / F11 空 / 加载 / 错误 | 分别传 `loading=true`、`error='x'`、空 sessions | loading 显示“会话加载中…”；error 显示“会话加载失败”+重试并调用 `onRefresh`；空显示“暂无会话” | 三种 props | Blocking |
| **CT-SIDEBAR-008** | F02 统计失败不造假 | `statsError='x'`、`usageTotal=null`、`messageCount=null` | 不显示 `0`；显示“统计加载失败”；用量 / 消息显示 `—` | null / 错误字符串 | Blocking |
| **CT-SIDEBAR-009** | F02 操作入口 | 点击“新建会话”“刷新会话”“显示归档” | `onCreate` / `onRefresh` 被调用；`aria-pressed` 随归档切换；按钮可访问名正确 | `vi.fn()` | Blocking |

#### 5.2.2 消息、卡片

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **CT-MSG-001** | F03 角色 / 分类 | 渲染 user、agent + 各类 category | user 无分类 tag；agent 的 requirement/clarification/progress/consultation/delivery/unknown 映射正确；名称“你 / 司墨”；时间显示 | `fixtures.message()` overrides | Blocking |
| **CT-MSG-002** | F03 复制成功 / 失败 / fallback | 点击“复制消息”；模拟 clipboard 拒绝 + `execCommand` 失败 / 成功 | 成功显示“已复制”；失败显示“复制失败”；fallback 调用 `execCommand('copy')`；1.5s 后回“复制” | `navigator.clipboard` / `document.execCommand` stub | Blocking |
| **CT-MSG-003** | F03 Markdown 子集 / 长文 | 渲染含 inline code、fenced code、超长文本的消息 | inline / code 文本可见；长文不被截断；不抛异常 | 长文本 1000 段 | Blocking |
| **CT-MSG-004** | F03 流式 / 失败 | 渲染 `status='streaming'` 空文本；渲染 `status='failed'` | streaming 有 `.stream-caret`；failed 显示“失败”badge；空文本不渲染多余节点 | `fixtures.message()` | Blocking |
| **CT-CARD-001** | F05 卡片字段 / 提交 | 渲染 select + input 卡片，选择/输入后点“确认” | 字段 label 与 id 关联；提交 payload 为 `{source, note}`；按钮进入“提交中…”并禁用；成功后回“确认” | `fixtures.card()`；`onSubmit` resolve | Blocking |
| **CT-CARD-002** | F05 卡片失败 / 重试 | `onSubmit` 第一次 reject，第二次 resolve；点击确认 / 重试 | 错误 `role=alert` 可读；输入保留；按钮变“重试”；重试调用第二次并成功 | reject/resolve mock | Blocking |
| **CT-CARD-003** | F05 只读 / 归档 | `readOnly=true`；`card.status='submitted'` | 字段、取消、确认均禁用；状态 `submitted · v1` 可见；不调用 `onSubmit` | `fixtures.card({status:'submitted'})` | Blocking |
| **CT-CARD-004** | F05 取消清空 | 选择 / 输入后点“取消” | 字段值恢复空；不调用 `onSubmit`；确认仍可用（活动卡） | `fixtures.card()` | Blocking |

#### 5.2.3 Composer

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **CT-COMPOSER-001** | F04 初始 / 禁用 / 错误 | 渲染 `disabled` + `sendError` | textarea placeholder / aria 名正确；发送禁用；显示发送方式提示；错误 `role=alert` | props | Blocking |
| **CT-COMPOSER-002** | F04 Enter 发送 | 输入“你好”按 Enter | `onSend('你好')`；输入清空；不换行 | `onSend` resolve | Blocking |
| **CT-COMPOSER-003** | F04 Shift+Enter 换行 | 输入两行，中间 Shift+Enter | `onSend` 未调用；textarea 值为两行；焦点保留 | 同上 | Blocking |
| **CT-COMPOSER-004** | F04 IME 组合 | compositionStart 后按 Enter；compositionEnd 后 50ms 内再按 | 两次都不发送；组合结束后超过 50ms 才可发送 | fake timers / composition 事件 | Blocking |
| **CT-COMPOSER-005** | F04 Ctrl / Meta 发送 | 输入后按 Ctrl+Enter；再按 Meta+Enter | 两次均发送；即使 sendMode=shift-enter 也强制发送 | 同上 | Blocking |
| **CT-COMPOSER-006** | F04 发送失败恢复 | `onSend` reject“发送失败” | 文本恢复；错误可读；发送按钮恢复；再点成功清空；不产生半条本地消息 | reject then resolve | Blocking |
| **CT-COMPOSER-007** | F04 重复提交 | `onSend` 挂起；Enter 后再 Enter / 点发送 | 只调用一次；按钮“发送中…”禁用；完成后可再次发送 | pending promise | Blocking |
| **CT-COMPOSER-008** | F04 模式切换 / 持久化 | 点击“切换发送方式”，重渲染；触发 BroadcastChannel 消息 | localStorage `simo.composer.sendMode='shift-enter'`；提示更新；Enter 不发送、Shift+Enter 发送；广播同值同步 | localStorage / BroadcastChannel stub | Blocking |
| **CT-COMPOSER-009** | F04 流式停止 | `streaming=true`，点“停止” | 发送禁用；显示“停止”；`onStop` 调用；不发送文本 | props | Blocking |
| **CT-COMPOSER-010** | F04 超长文本 | 粘贴 3000+ 字符后发送 | 文本不截断；`onSend` 收到完整字符串；无异常 | 长字符串 | Blocking |

#### 5.2.4 时间轴、概览、指标、交付物、状态、A11y

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **CT-TIMELINE-001** | F05 分组 / 排序 / active | 渲染跨两个 session、乱序的 3 条消息，active 为第二条 | 分组按 `sessionOrder → dateKey → at`；每条一个 button；当前项 `aria-current="true"` 且唯一；当前 / 上级组标签正确 | `TimelineGroupMessage[]` | Blocking |
| **CT-TIMELINE-002** | F05 空输入 | `messages=[]` | 不渲染 bar；不抛异常；nav 仍存在且可访问名正确 | 空数组 | Blocking |
| **CT-TIMELINE-003** | F05 点击跳转 | 点击第 2 个 bar | `onJump('m2')` 收到消息 id；不触发 hover 提示副作用 | 同上 | Blocking |
| **CT-TIMELINE-004** | F05 focus 提示 / Escape | 聚焦 bar；按 Escape | 显示 `role=tooltip`；`aria-describedby=timeline-tip`；Escape 关闭；提示含角色/会话/时间/摘要 | `TimelineTip` 真实渲染 | Blocking |
| **CT-TIMELINE-005** | F05 hover 延迟 / 宽限 | mouseEnter 后推进 120ms；mouseLeave 后 200ms 内再进入 | 120ms 前不显示；到时显示；200ms 内不关闭；超过后关闭 | fake timers | Blocking |
| **CT-TIMELINE-006** | F05 键盘导航 | 聚焦 bar 后按 →/←/Home/End | 焦点移到相邻 / 首 / 尾；不越界；事件 preventDefault；Escape 关闭 | 同上 | Blocking |
| **CT-TIMELINE-007** | F05 / F13 自定义名 / CSS 契约 | 传 `ariaLabel='祖先时间轴'`；在外部按方向键；检查组件 CSS | nav 名生效；外部按键不移动焦点；ancestor 有透明度规则、mobile hide 规则；类名契约稳定 | 组件 CSS 文本断言 | Blocking |
| **CT-OVERVIEW-001** | F07 空 / 加载 / 错误 | 分别 `loading`、`error`、`projection=null` | loading 文案；error 文案 + 重试调用；空投影显示“暂无会话投影”；不显示假任务 / 0 | props | Blocking |
| **CT-OVERVIEW-002** | F07 就绪：任务 / 交付物 / 点击 | 传 projection 含 done/running/pending、2 个交付物 | 分组计数正确；默认每组最多 3 条，展开后全部；任务点击回调含 id/title/messageId；交付物名 / 下载链接正确 | `fixtures.projection()` | Blocking |
| **CT-OVERVIEW-003** | F07 无假数据 / 待确认 | projection 的输入 / 目标为空；`pendingConfirmations.total>0`；deliverables 空 | 空文案明确；不伪造任务 / 交付物 / 0；待确认数可见 | 最小 projection | Blocking |
| **CT-METRICS-001** | F08 7/30 天窗口 | 渲染 `windowKind=7d`，点击“30天”再点“7天” | 当前按钮有 active；`onWindowChange('30d'/'7d')`；group 名“指标窗口” | `onWindowChange=vi.fn()` | Blocking |
| **CT-METRICS-002** | F08 加载 / 错误 / 空 | 分别 `state=loading/error/empty` | loading 文案；error 有重试；empty 有明确空态；不渲染 KPI / 假 0 | `state` props | Blocking |
| **CT-METRICS-003** | F08 partial / missing / 今日未完整 | 构造 `availability` 含 missing / partial；`partialToday=true` | missing 显示“待埋点”而非 0；partial 显示“部分数据”；头部“今日未完整” | `fixtures.metrics()` overrides | Blocking |
| **CT-METRICS-004** | F08 分母 0 / 表格 | taskQuality 值为 null、分母 0；渲染明细表 | 完成率 / 一次完成 / 返工显示“无数据”而非 0%；表格 wrapper 可聚焦、`aria-label` 正确；详情可展开 | 指标 fixture | Blocking |
| **CT-DELIVERABLE-001** | F09 交付物行 | 渲染带 `onOpen` / `downloadUrl` 的交付物 | 点击调用 `onOpen`；下载链接 `href` / `download` / aria 名正确；无 `onOpen` 时按钮仍可见 | fixture | Blocking |
| **CT-STATE-001** | F11 三态语义 | 渲染 `LoadingState` / `ErrorState`（含重试）/ `EmptyState`；渲染 `ConversationPanel` 四种 state | loading `role=status`；error `role=alert` + 重试；empty 文案；ConversationPanel loading/empty/error 插槽正确 | props | Blocking |
| **CT-A11Y-001** | F12 语义 / 焦点 | 渲染 Sidebar / Composer / TimelineGroups / MetricsDashboard | landmark 可访问名；按钮 / 输入 / 表格有名称；错误 / 加载角色正确；Tab / 方向键焦点可见（`toHaveFocus`）；无键盘陷阱 | 组件 fixtures | Blocking |

### 5.3 L3 集成（IT）

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **IT-SHELL-001** | F01 首启加载 | 挂载 App，MSW 返回 1 个会话 + 2 条消息 | 先 loading，后显示会话 / 消息；active 会话正确；无 console error；无假 0 | MSW handlers + fixtures | Blocking |
| **IT-SHELL-002** | F01 对话↔工作台 | 点击“工作台”，再点“对话” | 页面 landmark 切换；状态不丢；不重复请求；焦点不丢到 body | 同上 | Blocking |
| **IT-SIDEBAR-001** | F02 切换会话 | 点击第二个会话，MSW 返回该会话消息 / projection | 中间消息、时间轴、右栏同步更新；旧请求晚到不覆盖新会话 | 延迟响应 / Abort 断言 | Blocking |
| **IT-SIDEBAR-002** | F02 会话加载失败 / 重试 | 首次 `/api/sessions` 500，点击重试后 200 | 显示错误 + 重试；重试请求次数 2；成功后树恢复；无假空 | MSW `server.use` | Blocking |
| **IT-CHAT-001** | F03 历史消息 / active | 加载 3 条消息，active 为第 2 条 | 消息按序渲染；时间轴 active 唯一；滚到底部策略正确 | fixtures + scrollRef | Blocking |
| **IT-CHAT-002** | F03 / F11 空消息 | `/api/messages` 返回空数组 | 显示空态；Composer 仍可用；右栏空态；不显示假消息 | 空响应 | Blocking |
| **IT-CHAT-003** | F03 消息加载失败 | `/api/messages` 500，点重试后 200 | 错误可见 + 重试；成功后渲染；不闪回错误 | MSW | Blocking |
| **IT-CHAT-004** | F03 流式 / 去重 | fake WS 推 `reply.delta` ×2、`reply.done`、重复 `message.created` | 文本按 delta 追加；done 后停止；重复 id 只渲染一次；不丢最终文本 | fake WS 事件序列 | Blocking |
| **IT-COMPOSER-001** | F04 发送接线 | 输入并发送；MSW `sendChat` 成功 / 失败 | 成功后消息出现、输入清空；失败后文本恢复、错误可见；请求只发一次 | MSW + fake WS | Blocking |
| **IT-CARD-001** | F05 卡片接线 | 提交卡片，`submitCardAction` 成功；再快速点两次 | 成功后状态回写为 submitted；忙碌时不可重复；不产生重复请求 | MSW | Blocking |
| **IT-TIMELINE-001** | F05 跳转接线 | 点击时间轴第 2 个点 | 对应消息 `scrollIntoView` / `scrollTo` 被调用；active 更新；提示关闭 | scroll mock | Blocking |
| **IT-ANCESTOR-001** | F06 祖先链 | 会话有 2 个祖先，`getAllSessionMessages` 返回链 | 加载全部祖先；时间轴分组为当前 / 上级；顺序正确；无重复 | MSW / fixtures | Blocking |
| **IT-ANCESTOR-002** | F06 根会话 / 切换重置 | 根会话无祖先；再切到有祖先的会话 | 根会话不请求祖先 / 显示空；切换后旧祖先清空，新链加载 | MSW 调用次数 | Blocking |
| **IT-OVERVIEW-001** | F07 右栏接线 | projection 先 pending 后 ready；任务点击 | loading → ready；任务点击定位到消息；错误时重试；交付物打开请求正确 | MSW / 延迟响应 | Blocking |
| **IT-METRICS-001** | F08 指标窗口接线 | 初始 7d，切 30d，MSW 返回不同数据 | 只请求对应窗口；KPI / 趋势 / 表格全块更新；失败显示错误 + 重试 | MSW 两套响应 | Blocking |
| **IT-DELIVERABLE-001** | F09 交付物打开 | 点击交付物，MSW 返回内容；再模拟 500 | 内容打开 / 错误提示；请求 URL 正确；不把错误当空 | MSW | Blocking |
| **IT-QUALITY-001** | F14 运行质量 | 跑完主流程，监听 console / pageerror / unhandledrejection | `console.error` 0；`pageerror` 0；未处理 rejection 0；关键资源无 404 | 全局监听 + MSW | Blocking |
| **IT-STATE-001** | F11 页面级三态 | 空 home；各接口 500；各接口延迟 | 每个面板空 / 错误 / loading 明确；无假 0；错误重试可用 | 三套 MSW 场景 | Blocking |
| **IT-ISOLATION-001** | F15 隔离 / 重置 | 连续跑两个用例，检查 mock / timer / storage / channel | 第二个用例不受第一个影响；timer / mock 已恢复；localStorage 清理；无端口 / home 写入 | `afterEach` + 断言 | Blocking |

### 5.4 L4 端到端（E2E）

| ID | 功能 / 风险 | 前置 / 操作 | 断言 | 数据 / mock | 门禁 |
|---|---|---|---|---|---|
| **E2E-SHELL-001** | F01 启动 / 首屏 | 启动隔离实例，打开 `/` | 对话页可见；会话 / 消息加载；无 console.error / pageerror；无关键 404 | 临时 home、mock 模型、临时端口 | Release Blocking（smoke） |
| **E2E-SIDEBAR-001** | F02 会话管理旅程 | 新建 → 重命名 → 搜索 → 归档 → 显示归档 → 恢复 | 每步 UI 可见且持久；刷新后状态保持；无横向溢出 | 同上 + API 种子 | Nightly |
| **E2E-CHAT-001** | F04 / F03 发送 / 流式 | 选会话，输入并发送；等待流式完成；停止一次流式 | 消息出现且只出现一次；流式文本停止；输入清空；无重复 | mock provider 固定回复 / SSE | Release Blocking（smoke） |
| **E2E-TIMELINE-001** | F05 时间轴真实点击 | 滚到中部，点时间轴某个点；hover / focus；Escape | 跳到对应消息；active 同步；tooltip 可见且不越界；点击目标 ≥ 32×32 | 固定 20 条消息 | Release Blocking（smoke） |
| **E2E-ANCESTOR-001** | F06 祖先链 | 切到有祖先的会话 | 时间轴显示当前 / 上级组；滚动 / 跳转正确；切回根会话清空 | 种子会话链 | Nightly |
| **E2E-OVERVIEW-001** | F07 右栏 | 打开有任务 / 交付物的会话 | 任务分组、点击定位；交付物打开；空会话显示空态；不假 0 | 种子 projection | Nightly |
| **E2E-METRICS-001** | F08 指标 | 切工作台；7d ↔ 30d | 全块同步；空 / partial 文案正确；表格可横向滚动；无 console error | 种子指标 | Nightly |
| **E2E-DELIVERABLE-001** | F09 交付物 | 点击交付物 / 下载 | 内容打开；下载响应 200；错误态可见 | 种子 artifact | Nightly |
| **E2E-TABS-001** | F10 双标签 active / 消息 | 同一 context 开两个 page；A 切会话 / 发消息 | B 同步 active / 收到消息；A 不重复；无 console error | 两 page + 本地 WS | Release Blocking（smoke） |
| **E2E-TABS-002** | F10 滚动独立 / 读游标 | A 在底部，B 上翻；A 发消息 | B 不被强制拉底；新消息提示 / 未读正确；切回 B 后已读同步 | 两 page + 长消息列表 | Nightly |
| **E2E-RESP-001** | F13 375 | 375×812 打开对话 / 工作台 / 右栏 | 无横向溢出（`scrollWidth===clientWidth`）；导航可用；时间轴目标 ≥ 32×32；无文字裁切 | Playwright viewport | Release Blocking（smoke） |
| **E2E-A11Y-001** | F12 键盘 | 只用键盘走 导航→会话→Composer→时间轴→右栏 | Tab 顺序合理；焦点可见；Escape 关闭提示；无键盘陷阱；名称可读 | Chromium + DOM | Nightly |
| **E2E-EMPTY-001** | F11 首启空态 | 全新临时 home 启动 | 会话 / 消息 / 任务 / 交付物 / 指标均空态；无示例数据 / 假 0；Composer 可用 | 空 home | Nightly |
| **E2E-QUALITY-001** | F14 console / 资源 | 全流程监听 console / pageerror / response | console.error 0；pageerror 0；未处理 rejection 0；关键资源无 404 | 全流程 | Release Blocking（smoke） |
| **E2E-ISOLATION-001** | F15 隔离 / 清理 | 连续跑两次 smoke，检查 home / 端口 / 进程 | 两次使用不同临时 home；不碰 8787；结束后端口释放 / 进程退出；结果一致 | 临时目录 + 进程检查 | Release Blocking |

### 5.5 门禁检查（GATE）

| ID | 检查 | 操作 | 通过条件 | 证据 | 门禁 |
|---|---|---|---|---|---|
| **GATE-COV-001** | A9 覆盖率 | 运行 `test:ci` 生成 coverage-summary；按 patch 与核心清单计算 | §6 阈值全部满足；排除清单合法；关键文件未被排除 | coverage-summary + patch diff | Blocking |
| **GATE-NOSKIP-001** | A10 无跳过 | 扫描测试文件的 `skip/todo/only`；检查测试报告与用例数；检查空断言 | 0 跳过 / 0 only / 无空断言；用例数 ≥ 基线；豁免有 issue/owner/到期 | 扫描日志 + 报告 | Blocking |
| **GATE-CI-001** | A11 CI 接线 | 检查 `test:unit/component/integration/ci/e2e` 脚本；检查 CI job | 脚本可分别执行；test:ci 在 Web 构建前；E2E smoke job 存在；F01–F15 全映射 | CI 配置 + 运行日志 | Blocking |
| **GATE-TRACE-001** | A14 追溯 | 对照 spec / test-plan / 报告 | R1–R10、F01–F15、A1–A15 均有 CASE-ID + 证据路径；未跑项明确 | 映射表 + 证据索引 | Blocking |
| **GATE-RELEASE-001** | A15 发布回归 | 跑 release 清单：全量 L1–L3、smoke、typecheck、build、check:sdd、parity | 全过；失败 / 跳过 / 覆盖不足阻断；旧 spec 不回归；A1–A15 签收 | release 记录 + CI 结果 | Release Blocking |

## 6. 测试数据与环境

- **L1/L2**：`src/test/fixtures.ts` 工厂；固定 `id/at/revision`；固定 `TZ=Asia/Shanghai`；`vi.useFakeTimers()` / `setSystemTime`；不访问真实网络。
- **L3**：MSW handlers 覆盖 `/api/sessions`、`/api/messages`、`/api/overview`、`/api/tasks`、`/api/artifacts`、`/api/usage`、`/api/stats`、`/api/metrics/dashboard`、`/api/spec-projection`、`/api/deliverables`；`onUnhandledRequest:'error'`；fake WebSocket 覆盖 open/message/close；每个用例重置 handlers。
- **L4**：临时 `AGENTD_HOME`（工作区 `.tmp/e2e-<GUID>/`）、端口 `19120+`、mock 模型；API 种子数据；双标签用同一 browser context 的两个 page；结束后清理临时目录与进程。
- **禁止**：真实 `DEEPSEEK_API_KEY`、真实用户 home、8787、外部公网、固定测试账号。
- **截图矩阵**：1600 / 1180 / 375；关键状态（空 / 加载 / 错误 / partial / 卡片 / 时间轴提示）；截图仅辅助，行为断言为主。

## 7. 当前落地、未跑、豁免

### 7.1 当前已出现（不代表通过）

| 文件 | 已有用例数（约） | 对应本计划 | 状态 |
|---|---|---|---|
| `frontend/src/components/Composer.test.tsx` | 10 | CT-COMPOSER-001..010 | 已实现，未执行；无 CASE-ID 注释 |
| `frontend/src/components/MessageItem.test.tsx` | 10 | CT-MSG-001..004、CT-CARD-001..004（含分类表） | 已实现，未执行；个别标题与断言需补齐（如“submitted state”） |
| `frontend/src/components/Sidebar.test.tsx` | 9 | CT-SIDEBAR-001..009 | 已实现，未执行；无 CASE-ID |
| `frontend/src/components/TimelineGroups.test.tsx` | 8 | CT-TIMELINE-001..007 | 已实现，未执行；CSS 契约断言需确认稳定 |

### 7.2 未实现 / 未跑

- 无 `test:*` scripts；无统一 CASE-ID；无 `src/test/unit`、`src/test/integration`。
- 无 MSW 接线、无 fake WS、无集成用例。
- 无 Playwright / `frontend/e2e` / E2E smoke。
- 无 coverage 报告；`vitest.config.ts` 当前只覆盖 `library.tsx`，不能证明全仓 / 页面。
- 无 CI 前端测试步骤；`deploy/CI.md` 的 `build-test` 尚未接入。
- 所有 A1–A15 当前均为 **未跑**；任何“通过”需执行后补证据。

### 7.3 已知豁免 / 待确认

| 项 | 原因 | 负责人 / 到期 | 处理 |
|---|---|---|---|
| `check:visual` 整页像素对比 | 动态时间 / 数据导致不稳定 | 流程已定 | 保持 Nightly / Warning，不 Blocking；不替代行为测试 |
| F10 跨标签 L1–L3 | jsdom BroadcastChannel 是 stub | 测试 owner | 只放 E2E；不伪造 L3 通过 |
| 真实模型 smoke | 需要 key / 外部服务 | 发布 owner | 单独 Nightly / 手工；不计入 Blocking |
| M40 视觉细节（13px / 32px / 概览 6 条） | 当前实现未必全部满足，产品修复另开 | 前端 / 产品 | 只对已确认 DESIGN.md 项写断言；未实现项标“待实现”，不写通过 |
| FE-009 编号重复 | 与 `FE-009-web-multitab` 冲突 | Lead / 文档 owner | 建议改 `FE-010-frontend-tests`；改号前带目录名引用 |

## 8. 执行顺序与退出标准

1. **基线**：`typecheck` → L1 → L2 → L3 → coverage；记录基线用例数 / 覆盖率。
2. **接线**：补 `test:*` scripts → 固定 TZ / 时钟 / MSW → 首批用例加 CASE-ID → 接入 CI。
3. **E2E**：安装 Playwright / Chromium → smoke 5 条 → full 旅程 → Nightly。
4. **门禁**：GATE-COV / NOSKIP / CI / TRACE / RELEASE 全部有证据；A1–A15 签收。
5. **回归**：每次改动跑受影响层 + 全套；失败先保留首次证据，再修复；禁止只重跑失败用例宣称通过。

**退出标准**：

- A1–A15 均有 CASE-ID 与证据；无“未跑”却标通过。
- Blocking 套件 100% 通过；E2E smoke 100% 通过；无 skip / only / 空断言。
- 覆盖率阈值满足；关键决策清单 100% 覆盖；排除清单经复核。
- 375 / 1180 / 1600 截图与 layout JSON 可复查；console / pageerror / 404 为 0。
- 测试数据隔离；连续两次运行一致；不碰 8787 / 真实 home。
- 旧 spec 与组件 parity 无回归；CI / 发布记录可追溯。

## 9. 链接

- [`spec.md`](spec.md)（本 spec）
- [`docs/process/templates/test-plan.md`](../../docs/process/templates/test-plan.md)
- [`docs/process/templates/evidence.md`](../../docs/process/templates/evidence.md)
- [`docs/process/skills/testing-strategy/SKILL.md`](../../docs/process/skills/testing-strategy/SKILL.md)
- [`docs/process/SCENARIOS.md`](../../docs/process/SCENARIOS.md)
- [`docs/process/RELEASE-CHECKLIST.md`](../../docs/process/RELEASE-CHECKLIST.md)
- [`deploy/CI.md`](../../deploy/CI.md)
- 现有前端设施：`frontend/vitest.config.ts`、`frontend/src/test/setup.ts`、`frontend/src/test/fixtures.ts`、`frontend/src/components/manifest.json`
