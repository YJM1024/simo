# 可判定语言标准（SPEC-STANDARD v2）

> 状态：`active`，2026-11-22。本文件取代 2026-11-22 的 v1 草案，旧版保留在 [`SPEC-STANDARD.superseded.md`](SPEC-STANDARD.superseded.md)。
> 适用范围：`specs/product|design|frontend|backend|test/` 下的长期 spec，`specs/changes/<CHG-ID>/` 下的变更 spec，`scripts/ac/` 下的断言脚本。
> 上游依据：`docs/process/FRAMEWORK.md:49` 的硬规则「每条 AC 至少映射一条可执行断言」。流程总纲见 [`PROCESS.md`](PROCESS.md)。

## 1 为什么要有语言标准

P1-CONV 的 33 条 AC 在这一轮里暴露了两类问题。同一条判据在六轮里判出三种结果（P01），行内数字同时存在两套能自证的取值（P03）。根因在判据缺少载体：谁测、测什么、在哪取样、容差多少、脚本在哪，都散在对话里。

本文件把 AC 与五列 spec 限制在五种合法陈述里，其他文字降级为背景，不进 AC。判定标准只有一条：读者只凭这条陈述，能写出脚本或执行一次人工判定。

产品 spec 的 PRD 继续讲为什么与做什么，AC 讲怎么判，本文件不改 PRD 的叙述方式。变更包里的 AC 用同一套语言，不另立格式。

存量 188 条 AC 定义按第 2.6 节分批改写，改写期间编号不变。不通过本文件检查的 AC 不进入点开工，见 [`PROCESS.md`](PROCESS.md) 的“三级验收”一节。

## 2 可判定语言标准

### 2.1 五种合法陈述

每条陈述只能是下面五类之一。混合陈述拆开写，背景说明放回 PRD。

1. **事实**：现状，可验证。写法用 `文件:行` 或命令输出。例：`specs/product/P1-CONV/spec.md:163` 记轨道实测 44×662.95。禁止“目前基本可用”“大部分已实现”。
2. **约束**：主语、属性、比较符、数值、单位、采样点、容差，七项缺一不可。例：`.tl-track` 的 `getBoundingClientRect().width` ≥ `44px`，采样点为轨道元素，容差 `0`。
3. **契约**：输入、输出、错误码、副作用，四段按序写。例：`POST /api/sessions/main/archive` 输入空体；输出 `204`；错误 `409 main_session_protected`；副作用为不写库、不广播。
4. **断言**：Trigger、Observe、Criterion、Script、Owner，五段缺一不可。写法见第 2.3 节的测试断言一段。
5. **引用**：只写指向唯一来源的 ID，不重述内容。例：`见 AC-CONV-001-05`。复制口径原文再改几个字，会造出第二个来源。

一条 AC 出现两类陈述时，按“事实加断言”拆成两条，事实在前，断言在后。引用与约束也可以并排出现，引用只占一句，不复制被引用条目的正文。

### 2.2 禁用与改写规则

禁用词表：`尽量`、`适当`、`合理`、`友好`、`较快`、`必要时`、`应该`、`建议`、`可考虑`、`较大`、`差不多`、`优化一下`。AC 定义行出现任一，即判不合格。

| 禁用词 | 改法 |
|---|---|
| 尽量 | 写阈值与取样点，例 `≤ 500ms` |
| 适当 | 写具体数值，写不出就删词 |
| 合理 | 写比较基准与容差 |
| 友好 | 写可测属性，例 `aria-label` 非空 |
| 较快 | 写毫秒阈值 |
| 必要时 | 写触发条件 |
| 应该 | 写断言，或移出 AC |
| 建议 | 写成约束，或移出 AC 进 PRD |
| 可考虑 | 移出 AC，进 PRD 的待定项 |
| 较大 | 写数值与单位 |
| 差不多 | 写容差 |
| 优化一下 | 写目标指标与基线 |

数字必须带比较符与单位，例 `44px`、`≤ 500ms`、`0 处`。几何必须带采样点与容差，例 `getBoundingClientRect().width`、`±1px`。时间必须带起始事件与阈值，例“消息落库后 500ms 内”。

一句一断言，单条 AC 不超过 2 行。复合条件拆成多条，编号接 `-01`、`-02`。

主语一律用 ID：`PRD-`、`AC-`、CSS 选择器、端点路径。禁止“该按钮”“这个列表”“上面说的”“相关模块”。

每条 AC 必须有 Owner 与脚本路径。Owner 写 `自动` 或 `人工:<动作>`；脚本写 `scripts/ac/<AC-ID>.mjs`，人工项写 `N/A：<理由>`。

状态词只有 `pass`、`fail` 两个值；`partial`、`missing`、`blocked` 三种旧值已废止，不再使用。覆盖判定另按 [`TRACEABILITY.md`](../product/TRACEABILITY.md) 的定义，不与状态词混用，也不自造“基本通过”“待观察”。

改写时先删形容词，再考虑加限定语。删掉后句子仍然成立，说明那个词本来没有信息。

### 2.3 契约三段

契约由类型定义、接口签名、测试断言三段承担。三段分别落在代码与测试里，验收报告第 2 节只登记产物路径与汇总判定，不复制断言与用例表。某一段不适用时写 `N/A：<理由>`，不留空。

**类型定义**

类型定义写字段名、类型、可空性、取值约束，整段读下来就能构造请求与判断响应。示例取自 `backend/internal/core/session/session.go:7`：

```go
type Session struct {
	ID           string    `json:"id"`
	ParentID     string    `json:"parentId"`
	Title        string    `json:"title"`
	CreatedAt    int64     `json:"createdAt"`
	Archived     int64     `json:"archived"` // 0 可写，1 只读
	Pinned       bool      `json:"pinned"`
	OwnerAgentID string    `json:"ownerAgentId,omitempty"`
	Children     []Session `json:"children,omitempty"`
	HasUnread    bool      `json:"hasUnread"`
}
```

Session 是会话投影，`ParentID` 为空表示根会话，`Children` 只在树形查询里返回，`HasUnread` 为 false 时也输出。字段的可空性、默认值与约束写进注释或紧随其后的句子，读的人不需要翻实现。

**接口签名**

接口签名写方法、路径、请求、响应、错误码与副作用。示例为会话归档端点，注册位置 `backend/internal/modules/sessions/http.go:23`，handler 为 `handleArchive`（同文件 :226）：

`POST /api/sessions/{id}/archive` 请求空体；成功返回 `200`，响应体 `{"ok":true,"session":{...}}`；错误码 `404` 表示会话不存在，`400` 表示标题不能为空，`409` 表示会话已归档、归档被拒绝或 `main_session_protected`（blockers 为 `["主会话不可归档"]`），`500` 表示会话操作失败；副作用是执行 `UPDATE sessions SET archived = 1`，不删除也不复制消息与交付物。

**测试断言**

一条 AC 对应一个脚本，断言写触发、观察点、比较符、数值与容差。`AC-CONV-009-13` 验任务图：打开任务图弹窗后 `aria-modal` 为 `true`，8 个节点全为 `button` 且尺寸为 `156×64`，`pending`、`running`、`failed`、`done` 四态齐全，节点 `d` 为 `failed`，`d` 到 `h` 的边 `data-style` 为 `dashed` 且 `dasharray` 不少于 2，下游 `h` 保持 `pending` 且文案为“未开始”；点击 `d` 后弹窗关闭，打开 `section.task-detail[data-task-id="d"]`，写请求数为 0。脚本在 `scripts/ac/AC-CONV-009-13.mjs:24`。

这条 AC 在 `specs/changes/<CHG-ID>/test.md` 第 3 节的用例清单里落成一行，列名取自 `spec-test.md`：

| TC | AC | 场景 | 命令 | 预期结果 |
|---|---|---|---|---|
| TC-CONV-009-13 | AC-CONV-009-13 | 打开任务图弹窗，核对节点、边与四态，点击节点 `d` | `node scripts/ac/AC-CONV-009-13.mjs` | 8 个节点全为 `button` 且 156×64，四态齐全，`d` 到 `h` 的边为虚线，下游 `h` 保持 `pending`，点 `d` 后打开详情且写请求为 0 |

断言正文与预期值落在脚本 `scripts/ac/AC-CONV-009-13.mjs:24`，用例表只记场景、命令与预期，不复制断言全文。验收报告第 2 节只登记产物路径与汇总判定，不复制用例表。

**反例**

下面三段都缺少可复跑的取值：

类型写 `Message map[string]any`，字段、类型与约束都没有；接口只写“会话归档接口”，方法、路径、响应与错误码都没有；断言写“消息结构合理、归档功能正常、测试通过”，没有观察点与阈值，结果写“基本通过”。

改法逐段对应：类型写成带字段、类型与约束的结构体；接口写成带方法、路径、请求、响应、错误码与副作用的签名；断言写成带触发、观察点、比较符、数值与容差的句子，结果只用 `pass`、`fail` 两个值。

三段各自的落点是类型声明行、路由注册行与脚本行，`test.md` 第 3 节的用例表用 TC 与 AC 把它们连起来。某一段不适用时写 `N/A：<理由>`；运行中暴露的问题登记到验收报告第 3 节问题与处置。

### 2.4 三组改写对照

**时间轴命中**

原写法：“时间轴刻度要容易点中。”问题在没写量的是视觉条还是命中区，第 3 轮判通过、第 5 轮判失败，同一实现得到相反结论（P01）。

改后：`AC-CONV-007-02` 把命中面定成整条 `.tl-track`，宽 `44px`；轨道内任意点映射到纵向最近刻度；点击后 `900ms` 采样，目标消息进入视口且 active 等于被点刻度；18 点矩阵偏差 `0`，19 点扫描死区 `0`。出处 `specs/product/P1-CONV/spec.md:163`。

脚本：`scripts/ac/AC-CONV-007-02.mjs`（待实现），用例为主路径整列命中、主路径最近刻度、负路径列外 1px。Owner 写 `自动`；刻度条粗细另加 `人工:目视`。

**未读时机**

原写法：“新消息到了未读点要及时出现。”问题在“及时”没有起始事件与阈值，第 1 轮判 `fail`、第 3 轮判 `pass`，取样口径不同（P04）。

改后：agent 消息落库后 `500ms` 内，WS 下发 `session_unread` 帧，且列表该行出现 `data-unread="true"`。计时起点取后端落库时间，终点取 CDP 收到帧并完成 DOM 更新的时间戳。第 1 轮补测记录 441ms（`docs/plan/RETRO-20261122.md:28`），阈值留有余量。

脚本：`scripts/ac/AC-SYNC-004-01.mjs`（待实现），监听 WS 帧与 DOM 变更。Owner 写 `自动`。

**会话行数字**

原写法：“行内显示该会话的消息数。”问题在没说是该会话自身还是全局，实现渲染 209、验收按 75 核对，两个值都能自证（P03）。

改后：行内 `.session-count` 文本等于 `GET /api/sessions` 返回的该会话 `messageCount`；底部汇总文本等于全部会话 `messageCount` 之和；样例取第 10 轮 `main=85`、底部 `229`（`docs/plan/RETRO-20261122.md:27`）；切换会话后行内数字变化，底部不变。

脚本：`scripts/ac/AC-CONV-001-05.mjs`（待实现），断言两数。现有承载在 `frontend/src/App.integration.test.tsx:227`。Owner 写 `自动`。

三组反例的共同点是取值来源没写死：命中区没说量哪一层，未读没说计时起止，“消息数”没说是哪个范围。改写动作都是把来源、取值与容差写进同一条陈述，脚本因此可以直接生成。

### 2.5 门禁

新脚本 `scripts/check-spec-language.mjs` 待实现。它只读 `specs/**/spec.md` 的 AC 定义行，零依赖，不改文件，不扫 `docs/process`。

| 规则 | 判定方式 | 严重度 |
|---|---|---|
| R1 禁用词 | AC 行命中词表任一 | error |
| R2 数字无比较符 | 数字前后无比较符或单位 | warning |
| R3 无脚本且未写人工 | 行内无 `scripts/ac/` 且无 `N/A：` | error |
| R4 非法状态词 | 出现 `pass`、`fail` 之外的判定词 | error |
| R5 主语缺失 | 行首为“该”“这个”“上述”“相关”，或整行无 ID | warning |
| R6 超长 | 定义行超过 240 字符，或跨超过 2 行 | warning |
| R7 重复 AC ID | 同文件或跨文件 ID 重复 | error |

输出格式与 `check-sdd.mjs` 一致：`path:line R# hint`；`--json` 输出 `{failures,warnings}`；退出码 0 通过、1 有 error。

挂载位置在 `scripts/check-sdd.mjs` 之后，作为第二道门，两条命令串联执行，规则表独立维护。R6 与 `check-sdd.mjs` 现有警告同口径，先以 warning 运行，迁移完成后升为 error。

### 2.6 迁移

现状是 188 条 AC 定义：P1-CONV 33 条，P2 至 P10 共 155 条（2026-11-22 按 `` ^\s*-\s+`AC- `` 实测）。改写分三批：先 P1-CONV 33 条，再做 P1-CONV 四列长期 spec（749、1003、754、879 行），最后 P2 至 P10。

本轮 33 条 AC 已改写完成：32 条判 `自动`，1 条判 `人工`（`AC-CONV-004-01` 目视对齐与底色）。
脚本路径当前为冻结占位，待 `scripts/ac/` 落地后按 AC 回填实测结果与证据路径；占位期间不得当作 `pass`。

每批按五步走。

1. 导出：`node scripts/spec-slice.mjs specs/product/P1-CONV/spec.md --prd PRD-CONV-007`，输出带原始行号。
2. 逐条改写：按 2.1 选陈述类型，按 2.3 写契约三段。语义有歧义回 PRD 裁决，不在 AC 里猜。
3. 跑 lint：`node scripts/check-spec-language.mjs`（待实现）。error 清零，warning 逐条登记原因。
4. 跑断言：`node scripts/ac/<AC-ID>.mjs --base-url http://127.0.0.1:8787`。没有脚本的写 `人工:<动作>` 与 `N/A：<理由>`。
5. 回写状态：`specs/test/<域>/test-plan.md` 写 `pass` 或 `fail` 与证据路径，lint 与断言输出存 `.tmp/ac/<AC-ID>.json`。

首轮迁移完成标准：33 条 error 为 0；每条有脚本或人工标准；`check-sdd.mjs` 同口径通过。迁移不重编号，不放宽断言。

## 3 断言脚本契约

一个 AC 对应一个脚本，路径 `scripts/ac/<AC-ID>.mjs`，零依赖，只读。

参数为 `--base-url`，可选 `--session-id`。脚本自带默认值，本地与 CI 用同一入口。

stdout 输出一行 JSON：`{"ac":"AC-CONV-007-02","pass":true,"detail":"18/18 点偏差 0","evidence":".tmp/ac/AC-CONV-007-02.json"}`。

退出码 0 通过、1 失败、2 参数或环境错误。跳过不算通过。失败写证据文件，不吞异常；网络错误重试 2 次后判 `fail`，证据里写明环境不可达。

证据文件写命令、参数、时间、原始输出摘要，长度不超过 8KB。实现者可以自验，自验记录与 AC 的 Owner 字段分开写，避免同一行既是对断言的描述又是自证记录。

## 4 建域与变更的顺序

**4.1 反推契约建四列**：域不存在时，从产品 spec 的 PRD 反推契约，建设计、前端、后端、测试四列。四列各按 30 至 40 分钟量级推进，先写契约与断言，不追一次完备。产品列沿用已有 spec，缺 AC 时同批补。

四列建完，用 `node scripts/spec-slice.mjs specs/product/P1-CONV/spec.md --prd PRD-CONV-007` 抽一遍该域 AC，逐条对照四列，列出没有断言或没有契约的条目，作为下一批的输入。

**4.2 变更 spec 的顺序**：域已存在时先写增量 spec，再改代码，收口回写 10 至 20 行补丁。建域型变更在增量 spec 里同时登记建列点。两种关系可以在同一个变更里并存，见 [`PROCESS.md`](PROCESS.md) 第 2 节。

变更包不复制长期 spec 全文，只写差异与引用。长期 spec 是唯一事实来源，变更包是它的补丁。

## 5 生效与维护

本文件自 2026-11-22 起生效。改模板或规则时，同步改 `check-spec-language.mjs` 的规则表与 `test-plan`，不留文档先行、脚本滞后的窗口。

旧版语言标准保留在 [`SPEC-STANDARD.superseded.md`](SPEC-STANDARD.superseded.md)，只供回查，不再引用。
