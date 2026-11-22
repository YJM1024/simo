# 验收判据与断言脚本规范（SPEC-STANDARD v1 草案）

状态：`draft v1`，2026-11-22。适用范围：`specs/product/` 下长期产品 spec 的 AC、`specs/test/` 下的测试 spec、`scripts/ac/` 下的断言脚本。上游依据是 [`docs/process/FRAMEWORK.md`](FRAMEWORK.md) 第 2.2 节的门禁硬规则「每条 AC 至少映射一条可执行断言」（`docs/process/FRAMEWORK.md:49`），本文件把这条规则落成可复制的模板、可执行的脚本形态与一条门禁规则。参考方案与补齐方向的说明见 `docs/process/FRAMEWORK.md:16-21`，本文件不改动该框架，只补长期 spec 与脚本之间的空缺。

## 1. 规范定位

这套 spec 是人与多个 Agent 之间的共同契约，读者包括产品、设计、前端、后端、测试与验收 Agent，每一方都按同一份判据判断成立与否。契约中的判据必须能被机器执行，执行方式限定为可重放的命令或脚本，结果落到一份 JSON、一段日志或一张截图。自然语言负责解释为什么这样判定，判据本身由数字、状态码、字段值、DOM 测量值承载。

不能被机器执行的部分必须显式标注 `人工`，并写清判定人、判定条件与判定依据。`人工` 是一种判据类型，与脚本同级，不能当作「暂未实现」的占位使用。既没有脚本又没有 `人工` 标注的 AC 按缺失处理，状态记 `missing`，与测试 spec 的四值口径一致（`specs/test/P1-CONV/test-plan.md:20-27`）。

这一轮开发暴露的问题是同一条 AC 用自然语言写在产品 spec 里，实现方与验收方各自理解，返工成本高于写脚本的成本。统一判据的目标是把理解差异前置到写 spec 的时刻，让实现方自测与验收方复核跑同一个脚本、看同一份证据。第 6 节记录的五条反例都来自这次会话域收口，改法已经落进产品 spec，可以作为下一轮的写法参照。

## 2. AC 书写模板

以下骨架可直接复制，字段缺一项即视为 AC 未写完。尖括号是占位符，填完即删，不要留在定稿里。字段顺序固定，门禁扫描与脚本取值都按这个顺序解析。

```markdown
- `AC-<域>-<NNN>-<NN>` <一句话标题>
  - 陈述：<主体> 在 <条件> 下执行 <动作>，结果为 <可判定的值或状态>。
  - 前置：<会话/消息/任务等数据，账号或权限，开关，视口宽度，部署实例>
  - 动作：<一次用户操作，或一条带方法与路径的请求>
  - 可观察结果：
    1. <接口字段或状态码的期望值>
    2. <界面元素的可测量属性>
  - 判定口径：
    - HTTP 状态：<码>
    - JSON 字段：<字段路径> == <期望值>
    - DOM：<选择器> 的 <几何或属性> == <期望值>（容差 <n>）
  - 断言位置：`scripts/ac/AC-<域>-<NNN>-<NN>.mjs` 的 case `<case 名>`
  - 证据：<原始响应文件、测量值、日志路径或截图路径>
```

模板填满之后的形态如下，这条 AC 的口径来自本次修正后的产品 spec（`specs/product/P1-CONV/spec.md:78`）。示例里的数字与选择器取自当次实测与现有实现，照抄时要一起换成当次的值。示例保留三条可观察结果，实际条数以判据需要为准。

```markdown
- `AC-CONV-001-05` 会话行消息数与底部汇总互不串味
  - 陈述：左栏会话行的数字等于该会话自身的消息条数，左栏底部的汇总数字等于全部可见会话的消息数之和。
  - 前置：存在 `main` 与至少 2 个有消息的子会话，当前选中 `main`。
  - 动作：打开左栏，读 `main` 行的数字与底部汇总数字；再切换到任一子会话，读同一组数字。
  - 可观察结果：
    1. `GET /api/sessions` 返回的 `main.messageCount` 等于 75。
    2. `main` 行渲染的数字文本等于该字段值。
    3. 底部汇总文本等于 15 个会话的 `messageCount` 之和 209，切换会话后不变。
  - 判定口径：
    - JSON 字段：`data.sessions[i].messageCount`
    - DOM：`[data-session-row="main"] [data-role="count"]` 的 `textContent`
    - DOM：`[data-role="session-total"]` 的 `textContent`
  - 断言位置：`scripts/ac/AC-CONV-001-05.mjs` 的 case `主路径`、`切换会话-汇总不变`
  - 证据：`.tmp/ac/AC-CONV-001-05-sessions.json`、两个数字的文本值与采集时间
```

模板字段的要求见下表，其中「判定口径」只能取下方白名单表里的六类。表中八项全部必填，出现可选项时在表下补一段说明适用条件。字段的取值方式由第 3 节的脚本约定约束，两边不得各写一套。

| 字段 | 必填 | 写法要求 |
|---|---|---|
| ID | 是 | 沿用产品 spec 已在用的分段规则（`specs/product/P1-CONV/spec.md:4`），一条 AC 一个编号，不复用、不改号 |
| 陈述 | 是 | 一句话，只含一个可判定的结论；连接词只补充同一结论的条件 |
| 前置 | 是 | 可构造，脚本能自行创建并清理；不许写「已具备完整数据」 |
| 动作 | 是 | 一次操作或一条请求；多条动作拆成多个 case |
| 可观察结果 | 是 | 每条对应一个判定口径，条数与口径条数一致 |
| 判定口径 | 是 | 写明载体、取值与容差，类型限于白名单 |
| 断言位置 | 是 | 脚本路径加 case 名；标 `人工` 时写判定人与判定条件 |
| 证据 | 是 | 写明证据类型与落点，类型限于 JSON 响应、测量值、日志、截图；不写「测试通过」这类结论 |

判定口径只允许下表六类，出现表外类型时先改写判据，或把该条降为 `人工`。表外的执行方式例如视觉回归比对、性能剖面、无障碍扫描，不进本规范，需要时另立文件并在产品 spec 引用。六类之间可以叠加使用，同一条 AC 的多条口径按可观察结果的顺序排列。

| 口径 | 载体 | 写法示例 | 执行方式 |
|---|---|---|---|
| HTTP 状态与 JSON 字段 | 响应码、`code`、字段路径 | `POST /api/sessions/main/archive` 返回 409 且 `body.code == "main_session_protected"` | `fetch` |
| DB 行 | 表、列、行数 | `sessions.pinned == 1` 且 `parent_id` 不变 | 只读查询测试库 |
| DOM 尺寸与命中点 | 选择器、几何属性、坐标 | `aside.inspector` 的 `getBoundingClientRect().width <= 375`；`document.elementFromPoint(x, y)` 命中的元素是 `.tl-track` | CDP 或 Playwright |
| computed 样式 | 选择器、属性、解析后的值 | `getComputedStyle(el).opacity == "0.6"`；token 解析值与 `tokens.css` 的声明一致 | 浏览器 |
| 日志行 | 文件或流、匹配模式、次数 | `session_read` 出现 2 次，且 `seq` 单调递增 | 读日志文件 |
| 命令退出码 | 命令、退出码、关键输出 | `node scripts/ac/AC-CONV-001-05.mjs --base-url ...` 退出 0，stdout 含 `"pass":true` | 执行命令 |

禁止出现在判定口径里的表述包括「体验良好」「响应及时」「布局合理」「交互顺畅」「视觉统一」「性能可接受」「无明显卡顿」，以及「若干」「多个」「较短」「足够大」这类没有载体的量词。时长类判据必须写上界与测量起点，例如「从点击到未读点消失不超过 2 秒，起点为 `pointerup`」。尺寸类判据必须带单位与容差，例如「时间轴轨道宽 44px，容差 0」。无法改写成可测量值的表述改为 `人工` 判据，并写清判定条件。

一条 AC 只写一个可判定陈述，需要同时验两件事时拆成两条 AC，或在同一 AC 内拆成多个 case。判定口径与断言位置一一对应，脚本里找不到对应 case 的 AC 视为未写完。涉及错误路径的 AC 同时写状态码与 `code` 字段，只写状态码会在两个不同的 409 之间产生歧义，例如 `main_session_protected` 与 `session_archived` 都属于 409（`specs/product/P1-CONV/spec.md:76`）。

## 3. 断言脚本规范

一个 AC 对应一个脚本，脚本放在 `scripts/ac/`，文件名为 `<AC-ID>.mjs`，与 AC 编号逐字符相同。脚本接收 `--base-url`（必填）与 `--session-id`（可选），其余夹具在脚本内创建并在结束时清理，重复运行结果一致。脚本只通过外部接口与渲染结果取事实，包括 HTTP、WS、DOM 与只读 DB 查询，不 import 实现方内部模块，不读实现方私有变量，避免实现变更导致判据随实现漂移。

脚本向 stdout 输出一行 JSON，字段固定为 `ac`、`pass`、`detail`、`evidence`，字段之外的输出写 stderr。`detail` 在通过时写 case 数量的汇总，在失败时写首个失败 case 的 `{case, expected, actual}`。`evidence` 写可复核的原始量，例如响应正文路径、测量值、日志行号，验收方据此复算而不必重跑。

```json
{"ac":"AC-CONV-001-05","pass":false,"detail":{"case":"行内数字取单会话计数","expected":"main.messageCount=75","actual":"main.messageCount=209"},"evidence":{"sessionsRaw":".tmp/ac/AC-CONV-001-05-sessions.json","rowText":"209","bottomText":"209"}}
```

退出码表达判据结果的只有 `0` 与 `1` 两种：`0` 表示全部 case 通过，`1` 表示至少一个 case 失败。参数或环境错误用 `2` 与二者区分，表示脚本自身没跑起来，`2` 不得被记成通过，测试 spec 里对应状态记 `missing`，与「没跑过就是 `missing`」的口径一致（`specs/test/P1-CONV/test-plan.md:31`）。同一脚本供实现方自测与验收方复核，两侧执行同一条命令、比对同一份证据，实现方的自测输出不能替代验收方的运行记录。

一个脚本可以包含多个 case，case 名用 `主路径` 与 `负路径-<条件>` 命名，同一 AC 的多条可观察结果各占一个 case。脚本失败时在 `detail` 里给出最小可复现信息，包括请求、期望值与实际值，不打印整段响应；需要完整响应时写进 `evidence` 指向的文件。脚本不写业务数据之外的持久文件，不改仓库里受版本控制的内容，临时产物放 `.tmp/ac/`。

脚本骨架如下，参数解析、case 收集与输出形状固定，各 AC 只需替换 `runCase` 内部的断言。骨架只演示主路径，负路径按同样结构追加一个 `runCase` 即可。`evidence` 里的路径统一写相对仓库根的形式，便于验收方直接打开。

```js
// scripts/ac/AC-CONV-001-05.mjs
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: {
  'base-url': { type: 'string' },
  'session-id': { type: 'string' },
} })
if (!values['base-url']) { console.error('missing --base-url'); process.exit(2) }
const baseUrl = values['base-url'].replace(/\/$/, '')

const results = []
const expect = (detail, ok) => { if (!ok) throw Object.assign(new Error('case failed'), { detail }) }

async function runCase(name, fn) {
  try { results.push({ name, pass: true, evidence: await fn() }) }
  catch (err) { results.push({ name, pass: false, detail: err.detail ?? String(err) }) }
}

await runCase('主路径', async () => {
  const res = await fetch(`${baseUrl}/api/sessions`)
  const body = await res.json()
  const main = body.data.sessions.find((s) => s.id === 'main')
  const total = body.data.sessions.reduce((n, s) => n + s.messageCount, 0)
  expect({ case: '主路径', expected: { main: 75, total: 209 }, actual: { main: main?.messageCount, total } },
    main?.messageCount === 75 && total === 209)
  return { sessionsRaw: '.tmp/ac/AC-CONV-001-05-sessions.json', main: main.messageCount, total }
})

const failed = results.filter((r) => !r.pass)
console.log(JSON.stringify({
  ac: 'AC-CONV-001-05',
  pass: failed.length === 0,
  detail: failed.length ? failed[0].detail : { cases: results.length },
  evidence: results.map((r) => r.evidence).filter(Boolean),
}))
process.exitCode = failed.length === 0 ? 0 : 1
```

## 4. 五列长期 spec 的职责边界

长期 spec 分五列，分别是产品、设计、前端、后端、测试。五列引用同一批 AC 编号，展开的内容不同：同一条 AC 只在产品列写完整判据，其余四列引用编号后写本列的实现契约或证据。缺列的域在对应位置写 `N/A` 加一段理由，理由说明为什么本域不需要这一列。

| 列 | 文件 | 本列写什么 | 本列只引用什么 |
|---|---|---|---|
| 产品 | `specs/product/<域>/spec.md` | AC 陈述、前置、动作、可观察结果、判定口径、断言位置（脚本路径或 `人工`） | 不写组件结构、接口实现、测试命令 |
| 设计 | `specs/design/<域>/spec.md` | 视觉与交互判据的具体值：尺寸、间距、颜色 token、焦点顺序、断点、动效时长 | 引用 AC 编号与脚本，不改写 AC 陈述 |
| 前端 | `specs/frontend/<域>/spec.md` | 实现契约：组件 props、状态归属、选择器与 aria、错误态映射、该 AC 对应的脚本 | 引用判定口径，不重复写前置与动作 |
| 后端 | `specs/backend/<域>/spec.md` | 路由、方法与请求响应字段、状态码与错误码、DB 表与行、幂等键 | 引用判定口径，不重复写界面表现 |
| 测试 | `specs/test/<域>/test-plan.md` | 脚本路径、证据代码、四值状态（`pass`/`partial`/`missing`/`blocked`）、缺口说明 | 引用 AC 编号，不重新定义判据 |

产品列的展开程度以「验收方读完能写出脚本」为准，行内消息数那条 AC 是合规范例，它写明取哪个接口字段、与哪份列表对齐、底部汇总保持什么口径（`specs/product/P1-CONV/spec.md:78`）。设计列的值要能直接落到 CSS 或组件属性上，样式入口复用与 token 复用的三条约束是这一列的写法（`specs/frontend/P1-CONV/spec.md:37-39`）。前端列与后端列各自写本侧契约，错误码与状态码以后端列为准，界面呈现以前端列为准，两列冲突时回到产品列改判据。

测试列只做三件事：指明哪条脚本证明哪条 AC、贴出最近一次运行的证据、标出缺口。测试列不重新解释产品语义，语义有歧义时回到产品列修 AC，与 `specs/test/P1-CONV/test-plan.md:14` 的定位一致。同一 AC 在两列出现相反结论时，以产品列的判定口径为准，测试列记 `partial` 并写出冲突。

同一条 AC 在五列的展开形态可以对照下表，示例取自置顶那条 AC（`specs/product/P1-CONV/spec.md:77`）。五列都重写一遍判据就会漂移，引用时只带编号与脚本路径，不复制口径原文。改判据时只改产品列，其余四列跟着引用走。

| 列 | 该 AC 在该列写什么 |
|---|---|
| 产品 | 完整判据：同级内按 `pinned DESC, created_at DESC` 排序，父链不变，断言位置指向脚本 |
| 设计 | 置顶图标的尺寸与位置、选中态色值、行高在置顶前后不变 |
| 前端 | 树组件的排序函数、`data-pinned` 属性、置顶按钮的 `aria-label` |
| 后端 | `PATCH /api/sessions/:id/pin` 的请求字段、200/400/404 与错误码、`sessions.pinned` 列 |
| 测试 | 脚本路径、两份证据（接口响应与行序截图）、四值状态 |

### 4.1 反推契约建四列

某域已有代码与实现（含测试），但没有设计、前端、后端、测试四列长期 spec 时，先读代码与测试反推实现契约，不按设计推演写方案再实现。四列指设计、前端、后端、测试；产品列沿用已有产品 spec，缺产品口径时只补 AC 与差异裁决，不重写产品叙述。产出只写三段：契约写接口、字段、行为与边界；判据写可执行断言或 `人工` 标注；差异裁决写代码行为与产品 spec 不一致处的结论与理由。同域成本约 **30–40 分钟**。会话域反着做了一遍：先写 743 行设计 spec，内容等于重述已实现方案，这部分时间没有产出新契约。

### 4.2 变更 Spec 的正确顺序

变更需求先写变更 spec 的增量，只写这次改什么、影响哪些功能点、验收判据；再改代码；最后用 10–20 行补丁回写长期 spec，补丁按文件、节、原文、新文、理由五列写。第一次建域必须先按 4.1 写一次全量四列，第二次起才适用增量加补丁的顺序。先写全量再改代码会让长期 spec 与实现同时漂移，每次变更还要重付一次整篇阅读与重写的成本。

## 5. 门禁衔接

新增规则 `R6`，级别 `warning`，检查产品 spec 的每条 AC 是否能在 `scripts/ac/` 找到同名脚本，或已标注 `人工`。规则加在 `runChecks` 的变更包检查之后（`scripts/check-sdd.mjs:680-714`），实现方式与现有 `R2` 的 AC 提取保持一致（`scripts/check-sdd.mjs:625-641`）。规则只覆盖长期产品 spec，变更包里的 AC 仍由 `R2` 与 `R3` 管（`scripts/check-sdd.mjs:12-34`）。

匹配方式：遍历 `specs/product/*/spec.md`，只取 AC 定义行，即行首为列表符号加空格、且编号被反引号包裹的行，编号用 `scripts/check-sdd.mjs:68` 的 `AC_RE` 提取。正文与表格里顺带提到的编号不参与，与 `R2` 的口径相同（`scripts/check-sdd.mjs:16-22`）。命中编号后检查 `scripts/ac/<AC-ID>.mjs` 是否存在，不存在则在该定义行报 warning。检查逻辑的伪代码如下，`addWarning` 的签名沿用 `scripts/check-sdd.mjs:115-121` 的现有实现。

```js
for (const file of productSpecs) {
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    if (!/^\s*-\s+/.test(line)) return            // 只认列表项定义行
    const m = line.match(/`(AC-(?:[A-Z0-9]+-){2,}\d+)`/) // 编号在反引号内
    if (!m) return
    const id = m[1]
    if (/人工：.{8,}/.test(line)) return           // 豁免一：人工判据
    if (/unimplemented|blocked/.test(line)) return // 豁免二：未实现登记
    if (!existsSync(join(root, 'scripts/ac', `${id}.mjs`))) {
      addWarning(file, i + 1, 'R6', `${id} 无 scripts/ac/${id}.mjs，且未标 人工：<理由>`)
    }
  })
}
```

豁免写法有两种，都写在 AC 定义行内。第一种是 `人工：<理由>`，理由不少于 8 个字符，长度下限对齐 `scripts/check-sdd.mjs:67` 的 `NA_REASON_MIN`。第二种是该 AC 的定义行或所在 PRD 已标 `unimplemented` 或 `blocked`，例如 `specs/product/P1-CONV/spec.md:260-261` 的两条 SYNC-005 AC。第一种豁免也用于「已有自动化用例、尚未收敛到 `scripts/ac/`」的情形，冒号后直接写用例路径，例如 `人工：由 App.integration.test.tsx:222 承载，待收敛`，门禁只校验标记与理由长度，不判断理由内容真伪。

输出沿用现有格式，形如 `[WARN] specs/product/P1-CONV/spec.md:149 R6 AC-CONV-007-02 无 scripts/ac/AC-CONV-007-02.mjs，且未标 人工：<理由>`，与 `scripts/check-sdd.mjs:756-758` 的 warning 行一致。warning 不改变退出码，因为 `scripts/check-sdd.mjs:743` 只按 failures 判定成败；`--json` 输出里该条落在 `warnings[]`，`severity` 为 `warning`（`scripts/check-sdd.mjs:732-740`）。同一条 AC 只报一次，重复出现时不重复计数。

上线顺序分三步。第一步只加规则与自检夹具，跑一次 `node scripts/check-sdd.mjs` 记录基线；`scripts/ac/` 目录当前不存在，首跑会把 35 条定义全部报出。第二步落地第 7 节第一批脚本并给其余 AC 补 `人工：` 标注，把 warning 数降到可解释的范围，再把规则接进 CI。第三步在迁移完成后把级别提到 `error`，并在 `--self-test` 增加两条夹具，一条验证缺脚本报错、一条验证带 `人工：` 的 AC 不报错，自检入口见 `scripts/check-sdd.mjs:40`，夹具区见 `scripts/check-sdd.mjs:841`。

## 6. 反例库

以下五条都来自 2026-11-21 至 11-22 的会话域收口，每条按当时的写法、两个 Agent 的分歧、改后的写法三段记录。分歧的根因都是判据缺少载体，改法都是把载体与取值写进 AC 并落一个脚本。引用行号指向当前文件版本，改文后行号会漂移，回查时以 AC 编号为准。

1. 时间轴 44×44。当时的写法是「每条至少 44×44」，没有说明量的是视觉条还是命中区。实现方在 `.tl-bar::after` 插伪元素把命中区撑到 48×44（`frontend/src/components/components.css:1069`、`:1075`），验收方按四角 `elementFromPoint` 逐条量 44×44（`frontend/src/components/ExecRowHitArea.test.tsx:82`），6px 间距下四角的相邻刻度互相覆盖，验收判失败。改后的写法把命中面定成整条轨道，宽 44px，轨道内任意点映射到纵向最近刻度，列外 1px 不触发，并写明孤立控件的 44×44 口径不适用于密集时间轴（`specs/product/P1-CONV/spec.md:149`）。脚本按 18 点矩阵测偏差、19 点扫描测死区，`人工` 部分只留视觉条粗细的观感。

2. 置顶排序。当时的写法是「支持置顶」，没有说置顶改变哪一层顺序。实现方把置顶会话提升到列表顶层，验收方按同一父级分组内排序，两边对「置顶后第一行是谁」给出不同答案。改后的写法写明置顶只影响所在同级分组的顺序（同级内按 `pinned DESC, created_at DESC`），不改变父子归属、不提升到顶层，同级唯一子会话置顶后行序不变属预期（`specs/product/P1-CONV/spec.md:77`）。脚本读 `GET /api/sessions/tree` 的兄弟序列，比较置顶前后的相对顺序与父链，已有用例见 `backend/internal/modules/sessions/tree_order_test.go:76-172`。

3. 会话行数字。当时的写法是「左栏显示消息数」，没有说数字属于哪一层统计。实现方渲染全局消息总数（209），验收方按该会话自身的消息数核对（`main` 为 75），同一条 AC 得出两个都能自证的值。改后的写法把两处口径分开：会话行内报该会话自身消息数、不含子会话，左栏底部报全局汇总、不随选中会话变化（`specs/product/P1-CONV/spec.md:78`）。脚本同时取 `messageCount` 字段与各会话消息列表的累计条数比对，再切换会话断言行内数字变化、底部保持不变，证据原文是 `.tmp/conv6-sessions.raw.json` 里的 `main.messageCount=75` 与 15 个会话求和 209，核对记录见 `specs/test/P1-CONV/test-plan.md:102`。

4. 未读「进入即已读」。当时的写法只有「进入即已读」几个字，没有定义什么动作算进入、跨标签如何表现、刷新后是否保留。实现方在会话行预取或 hover 时标记已读，验收方以会话成为 active 且收到 read 确认为准，刷新后内存态丢失又产生幽灵未读。改后的写法把触发条件、持久化读游标、多标签共享口径写全：该会话非 active 时收到新消息置点，用户进入或任一标签标记已读后全部标签清除，刷新与重启后按后端游标恢复（`specs/product/P1-CONV/spec.md:111`、`:248-250`）。脚本用两个会话构造四个 case，分别是 B 收消息出点、切入 B 后点消失、刷新后仍无点、另一标签同步清点。

5. 右栏补取。当时的写法是「展开显示剩余条目」，没有说剩余条目从哪里来。实现方把展开实现成首屏 3 条之内的本地收起展开（`specs/product/P1-CONV/spec.md:273` 记录的旧行为），验收方要求展开后可见条目数等于该组 `total`，`done.total=6` 时实现只显示 3 条，`ACCEPT-CONV-4` 判该 AC 失败。改后的写法写死展开动作要取到剩余条目、展开后可见条数等于 `total`、组头计数与可见条目一致、补取失败显示可见错误并可重试（`specs/product/P1-CONV/spec.md:283`）。脚本构造 `done.total=6/items=3` 与 `pending.total=4/items=3` 两组夹具，断言展开后分别为 `6/6` 与 `4/4`，并覆盖补取返回 500 后重试成功。

## 7. 迁移清单

产品 spec 现有 **35 条** AC 定义，其中 **33 条**生效，SYNC-005 的两条是 `blocked` 登记（`specs/test/P1-CONV/test-plan.md:9`）。任务书写的是 34 条，与文件实际不符，以文件为准。按可脚本化程度分五批推进，先做会话域收口涉及、正在改动的 AC，再按域铺开。

| 批次 | AC | 脚本可行性 | 本批产物 |
|---|---|---|---|
| 第一批 会话域收口 | `AC-CONV-001-03`、`001-04`、`001-05`、`003-03`、`008-04`、`008-05` | 6 条全部可脚本，判定以 HTTP 状态、JSON 字段、DOM 计数为主 | 6 个脚本，无需 `人工` 豁免 |
| 第二批 未读与多标签 | `AC-SYNC-002-01`、`002-02`、`003-02`、`SYNC-004-01`、`004-02`、`004-03` | 未读三条可脚本加人工（真实双标签）；多标签三条只能人工或 CDP 双 target | 3 个脚本加 3 条 `人工` |
| 第三批 契约与输入 | `AC-CONV-001-01`、`001-02`、`002-01`、`002-02`、`004-03`、`005-01`、`005-02`、`006-01`、`007-01`、`008-01`、`008-02`、`SYNC-001-01`、`001-02`、`SYNC-003-01` | 14 条均可脚本，现阶段已有 vitest 或 Go 用例承载 | 先写 `人工：<测试路径>` 标注，逐条收敛为脚本 |
| 第四批 视觉与触控 | `AC-CONV-003-01`、`003-02`、`004-01`、`004-02`、`006-02`、`007-02`、`008-03` | 脚本加人工：几何与样式可断言，观感、IME、对比度需人工 | 7 条脚本或人工标注 |
| 第五批 排除项 | `AC-SYNC-005-01`、`005-02` | 不建脚本 | 保留 `unimplemented` 标记，按第 5 节第二种豁免处理 |

第一批的六个脚本是 `R6` 转 `error` 的前提，其中 `AC-CONV-001-05` 与 `AC-CONV-008-05` 当前状态为 `missing`（`specs/test/P1-CONV/test-plan.md:120-154`），脚本写出来就会失败，这里按失败交付，不允许为了绿灯放宽断言。第三批不新写脚本，先把已有用例路径写进 `人工：` 标注，避免同一判据维护两份实现。第五批只做登记，等 SYNC-005 立项后再补。

按判据类型汇总的分布如下，条数合计与上表的 35 条一致。当场可脚本的六条在第一批落地，其余按批推进。分布只统计生效与排除两类，跨批引用的 AC 不重复计算。

| 判据类型 | 条数 | 涉及批次 |
|---|---|---|
| 当场可脚本 | 6 | 第一批 |
| 脚本加人工 | 13 | 第二批 6 条、第四批 7 条 |
| 先沿用既有用例 | 14 | 第三批 |
| 排除项 | 2 | 第五批 |

每批完成的判定是三条：脚本在空 `SIMO_HOME` 下重复运行给出相同结果（数据目录约定见 `specs/test/P1-CONV/test-plan.md:53`）；`node scripts/check-sdd.mjs` 的 `R6` warning 只覆盖该批尚未收敛的 AC；对应测试 spec 的行从 `missing` 或 `partial` 改为 `pass`，并附最近一次运行的时间与日志路径（`specs/test/P1-CONV/test-plan.md:24`）。三条同时满足才算该批完成，缺一条按未完成处理。P2 域的迁移沿用同一顺序，先做已有实现且正在改动的域，再做纯新增能力的域。

## 8. 生效与维护

本文件是 **v1 草案**，第一批脚本落地后转 `ready`。修改范围限于模板字段、白名单取值、`R6` 的匹配与豁免口径，改动需同步 `scripts/check-sdd.mjs` 与其自检夹具，并在 `specs/test/<域>/test-plan.md` 记录一次全量复核。与 `docs/process/FRAMEWORK.md` 的衔接只在 AC 判据的写法与脚本形态两处细化，流程顺序与门禁分层仍按该文件第 2.2 节执行（`docs/process/FRAMEWORK.md:37-49`）。
